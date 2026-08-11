import type { Server, Socket } from "socket.io";
import { z } from "zod";
import { prisma, MatchEndReason } from "@pista/database";
import { matchmakingService } from "../services/matchmaking.js";
import { SOCKET_EVENTS, MATCHMAKING_QUEUE_TIMEOUT_MS } from "@pista/shared";

// Map database enums to socket event reasons
const REASON_MAP: Record<MatchEndReason, "skipped" | "partner_left" | "reported" | "disconnected" | "timeout"> = {
  SKIPPED: "skipped",
  PARTNER_LEFT: "partner_left",
  DISCONNECTED: "disconnected",
  TIMEOUT: "timeout",
  REPORTED: "reported",
};

// Zod validation schema for WebRTC signaling payload
const signalPayloadSchema = z.object({
  matchId: z.string(),
  data: z.any(),
  kind: z.enum(["offer", "answer", "ice-candidate"]),
});

// Zod validation schema for Chat Message payload
const chatMessageSchema = z.object({
  matchId: z.string(),
  text: z.string().min(1).max(2000),
});

const filterSchema = z.object({
  gender: z.string().optional(),
  country: z.string().optional(),
  interests: z.array(z.string()).optional(),
});

const findMatchPayloadSchema = z.object({
  filters: filterSchema.optional(),
}).optional();

/**
 * Clean up and close an active match.
 */
export async function closeMatch(
  io: Server,
  matchId: string,
  endReason: MatchEndReason,
  actorUserId: string
) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
  });

  if (!match || match.status === "ENDED") {
    return;
  }

  // Update DB record
  try {
    await prisma.match.update({
      where: { id: matchId },
      data: {
        status: "ENDED",
        endReason,
        endedAt: new Date(),
      },
    });
  } catch (err: any) {
    // Swallowing Prisma error code P2025 (record not found) which can happen in tests due to concurrent cleanups
    if (err.code !== "P2025") {
      throw err;
    }
  }

  const { userAId, userBId } = match;

  // Clear memory/Redis mappings
  await matchmakingService.clearActiveMatch(userAId);
  await matchmakingService.clearActiveMatch(userBId);
  await matchmakingService.clearMatchPeers(matchId);

  const roomName = `match:${matchId}`;

  // Notify the other user and leave room
  const partnerId = actorUserId === userAId ? userBId : userAId;
  const partnerSocketId = await matchmakingService.getSocketId(partnerId);

  if (partnerSocketId) {
    const partnerSocket = io.sockets.sockets.get(partnerSocketId);
    if (partnerSocket) {
      partnerSocket.emit(SOCKET_EVENTS.MATCH_ENDED, {
        matchId,
        reason: REASON_MAP[endReason],
      });
      await partnerSocket.leave(roomName);
    }
  }

  // Notify/clean up actor socket and leave room
  const actorSocketId = await matchmakingService.getSocketId(actorUserId);
  if (actorSocketId) {
    const actorSocket = io.sockets.sockets.get(actorSocketId);
    if (actorSocket) {
      await actorSocket.leave(roomName);
    }
  }
}

/**
 * Matchmaking flow: enqueues the user and tries to find a matching partner.
 */
async function findMatchFlow(io: Server, socket: Socket) {
  const userId = socket.data.userId;

  socket.data.isSearching = true;

  // 1. Enqueue current user
  await matchmakingService.enqueue(userId, socket.id);
  socket.emit(SOCKET_EVENTS.MATCHMAKING_STATUS, "searching");

  // 2. Clear any existing timeout
  if (socket.data.queueTimeout) {
    clearTimeout(socket.data.queueTimeout);
    socket.data.queueTimeout = null;
  }

  // 3. Try to pop a compatible candidate
  const partnerId = await matchmakingService.popCandidate(userId, io, socket.data.filters);

  if (partnerId) {
    const partnerSocketId = await matchmakingService.getSocketId(partnerId);

    // Match found! Dequeue both
    await matchmakingService.dequeue(userId);
    await matchmakingService.dequeue(partnerId);

    const partnerSocket = io.sockets.sockets.get(partnerSocketId!);

    // Clear search states
    socket.data.isSearching = false;
    if (partnerSocket) {
      partnerSocket.data.isSearching = false;
    }

    // Create match row in PostgreSQL
    const match = await prisma.match.create({
      data: {
        userAId: userId,
        userBId: partnerId,
        status: "ACTIVE",
      },
    });

    // Clear queue timeouts for both
    if (socket.data.queueTimeout) {
      clearTimeout(socket.data.queueTimeout);
      socket.data.queueTimeout = null;
    }
    if (partnerSocket && partnerSocket.data.queueTimeout) {
      clearTimeout(partnerSocket.data.queueTimeout);
      partnerSocket.data.queueTimeout = null;
    }

    // Set active match and peers mappings in high-speed cache
    await matchmakingService.setActiveMatch(userId, match.id);
    await matchmakingService.setActiveMatch(partnerId, match.id);
    await matchmakingService.setMatchPeers(match.id, [userId, partnerId]);

    // Join both sockets to the match room and await room establishment
    const roomName = `match:${match.id}`;
    await socket.join(roomName);
    if (partnerSocket) {
      await partnerSocket.join(roomName);
    }

    // Emit matched statuses
    io.to(roomName).emit(SOCKET_EVENTS.MATCHMAKING_STATUS, "matched");

    // Tell both clients who the initiator is (initiator will prepare WebRTC offer)
    socket.emit(SOCKET_EVENTS.MATCH_FOUND, { matchId: match.id, isInitiator: true });
    if (partnerSocket) {
      partnerSocket.emit(SOCKET_EVENTS.MATCH_FOUND, { matchId: match.id, isInitiator: false });
    }
  } else {
    // No partner found; set the timeout timer
    const timeout = setTimeout(async () => {
      // Timeout occurred! Dequeue user
      await matchmakingService.dequeue(userId);
      socket.data.queueTimeout = null;
      socket.data.isSearching = false;
      socket.emit(SOCKET_EVENTS.MATCHMAKING_STATUS, "no_one_available");
    }, MATCHMAKING_QUEUE_TIMEOUT_MS);

    socket.data.queueTimeout = timeout;
  }
}

export function registerMatchmakingHandlers(io: Server, socket: Socket) {
  const userId = socket.data.userId;

  // Client requests to find a match
  socket.on(SOCKET_EVENTS.FIND_MATCH, async (payload: unknown) => {
    // Verify not already in match
    const activeMatch = await matchmakingService.getActiveMatch(userId);
    if (activeMatch) {
      return socket.emit(SOCKET_EVENTS.ERROR, {
        code: "ALREADY_IN_MATCH",
        message: "You are already in a match.",
      });
    }

    // Verify not already queueing
    if (socket.data.isSearching) {
      return socket.emit(SOCKET_EVENTS.ERROR, {
        code: "ALREADY_IN_QUEUE",
        message: "You are already searching for a match.",
      });
    }

    // Parse filters
    const parsed = findMatchPayloadSchema.safeParse(payload);
    const filters = parsed.success ? parsed.data?.filters : undefined;

    if (filters && Object.keys(filters).length > 0) {
      // Check premium status
      const sub = await prisma.subscription.findUnique({
        where: { userId },
      });
      const isPremium = sub?.plan === "PREMIUM" && sub?.status === "ACTIVE";

      if (!isPremium) {
        return socket.emit(SOCKET_EVENTS.ERROR, {
          code: "PREMIUM_REQUIRED",
          message: "Filters are a premium feature. Please upgrade your subscription.",
        });
      }
    }

    // Save filters in socket memory
    socket.data.filters = filters;

    await findMatchFlow(io, socket);
  });

  // Client requests to cancel matchmaking
  socket.on(SOCKET_EVENTS.CANCEL_FIND, async () => {
    if (!socket.data.isSearching) {
      return;
    }

    socket.data.isSearching = false;

    // Dequeue user and cancel timer
    await matchmakingService.dequeue(userId);
    if (socket.data.queueTimeout) {
      clearTimeout(socket.data.queueTimeout);
      socket.data.queueTimeout = null;
    }

    socket.emit(SOCKET_EVENTS.MATCHMAKING_STATUS, "no_one_available");
  });

  // Client requests to skip current chat partner
  socket.on(SOCKET_EVENTS.SKIP, async () => {
    const activeMatch = await matchmakingService.getActiveMatch(userId);
    if (!activeMatch) {
      return socket.emit(SOCKET_EVENTS.ERROR, {
        code: "INTERNAL_ERROR",
        message: "No active match to skip.",
      });
    }

    // End match with SKIPPED reason
    await closeMatch(io, activeMatch, MatchEndReason.SKIPPED, userId);

    // Automatically re-queue the user
    await findMatchFlow(io, socket);
  });

  // Client requests to end chat session completely
  socket.on(SOCKET_EVENTS.END_CHAT, async () => {
    const activeMatch = await matchmakingService.getActiveMatch(userId);
    if (!activeMatch) {
      return socket.emit(SOCKET_EVENTS.ERROR, {
        code: "INTERNAL_ERROR",
        message: "No active match to end.",
      });
    }

    // End match with PARTNER_LEFT reason
    await closeMatch(io, activeMatch, MatchEndReason.PARTNER_LEFT, userId);
  });

  // Client relays a WebRTC signaling payload to the partner
  socket.on(SOCKET_EVENTS.SIGNAL, async (payload: unknown) => {
    // 1. Validate payload structure
    const parsed = signalPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return socket.emit(SOCKET_EVENTS.ERROR, {
        code: "INVALID_INPUT",
        message: "Invalid WebRTC signaling payload.",
      });
    }

    const { matchId, data, kind } = parsed.data;

    // 2. Anti-spoofing: verify sender is a participant in this match
    const peers = await matchmakingService.getMatchPeers(matchId);
    if (!peers || !peers.includes(userId)) {
      return socket.emit(SOCKET_EVENTS.ERROR, {
        code: "UNAUTHENTICATED",
        message: "You are not a participant in this match.",
      });
    }

    // 3. Verify sender is in the target Socket.IO room
    const roomName = `match:${matchId}`;
    if (!socket.rooms.has(roomName)) {
      return socket.emit(SOCKET_EVENTS.ERROR, {
        code: "UNAUTHENTICATED",
        message: "You are not connected in the match room.",
      });
    }

    // 4. Identify partner peer
    const partnerId = peers.find((id) => id !== userId);
    if (!partnerId) {
      return;
    }

    // 5. Look up partner socket connection
    const partnerSocketId = await matchmakingService.getSocketId(partnerId);
    if (!partnerSocketId) {
      return;
    }

    const partnerSocket = io.sockets.sockets.get(partnerSocketId);
    if (partnerSocket && partnerSocket.connected) {
      // 6. Relay message directly to the partner
      partnerSocket.emit(SOCKET_EVENTS.SIGNAL_RELAY, {
        matchId,
        data,
        kind,
      });
    }
  });

  // Client relays a text chat message to the partner
  socket.on(SOCKET_EVENTS.CHAT_MESSAGE, async (payload: unknown) => {
    // 1. Validate payload structure
    const parsed = chatMessageSchema.safeParse(payload);
    if (!parsed.success) {
      return socket.emit(SOCKET_EVENTS.ERROR, {
        code: "INVALID_INPUT",
        message: "Invalid chat message payload.",
      });
    }

    const { matchId, text } = parsed.data;

    // 2. Anti-spoofing: verify sender is a participant in this match
    const peers = await matchmakingService.getMatchPeers(matchId);
    if (!peers || !peers.includes(userId)) {
      return socket.emit(SOCKET_EVENTS.ERROR, {
        code: "UNAUTHENTICATED",
        message: "You are not a participant in this match.",
      });
    }

    // 3. Verify sender is in the target Socket.IO room
    const roomName = `match:${matchId}`;
    if (!socket.rooms.has(roomName)) {
      return socket.emit(SOCKET_EVENTS.ERROR, {
        code: "UNAUTHENTICATED",
        message: "You are not connected in the match room.",
      });
    }

    // 4. Identify partner peer
    const partnerId = peers.find((id) => id !== userId);
    if (!partnerId) {
      return;
    }

    // 5. Look up partner socket connection
    const partnerSocketId = await matchmakingService.getSocketId(partnerId);
    if (!partnerSocketId) {
      return;
    }

    const partnerSocket = io.sockets.sockets.get(partnerSocketId);
    if (partnerSocket && partnerSocket.connected) {
      // 6. Relay message to the partner
      partnerSocket.emit(SOCKET_EVENTS.CHAT_MESSAGE_IN, {
        matchId,
        text,
        sentAt: new Date().toISOString(),
      });
    }
  });

  // Handle connection disconnection
  socket.on("disconnect", async () => {
    socket.data.isSearching = false;

    // 1. Clean up matchmaking queue if they were searching
    if (socket.data.queueTimeout) {
      clearTimeout(socket.data.queueTimeout);
      socket.data.queueTimeout = null;
    }
    await matchmakingService.dequeue(userId);
    await matchmakingService.removeSocketId(userId);

    // 2. Clean up active matches if they were connected
    const activeMatch = await matchmakingService.getActiveMatch(userId);
    if (activeMatch) {
      await closeMatch(io, activeMatch, MatchEndReason.DISCONNECTED, userId);
    }
  });
}
