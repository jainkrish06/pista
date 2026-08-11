import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, ReportReason, MatchEndReason, BanType } from "@pista/database";
import { matchmakingService } from "../services/matchmaking.js";
import { closeMatch } from "./matchmaking.js";
import type { Server } from "socket.io";
import { SOCKET_EVENTS } from "@pista/shared";

// Extend FastifyInstance type to support the Socket.IO server decorator
declare module "fastify" {
  interface FastifyInstance {
    io: Server;
  }
}

// Zod schemas for validation
const ReportSchema = z.object({
  reportedUserId: z.string().min(1),
  matchId: z.string().optional(),
  reason: z.nativeEnum(ReportReason),
  description: z.string().max(500).optional(),
  block: z.boolean().default(false),
});

const BlockSchema = z.object({
  blockedUserId: z.string().min(1),
});

export async function moderationRoutes(app: FastifyInstance) {
  // Report a user
  app.post(
    "/moderation/report",
    { preValidation: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const reporterId = req.user!.id;
      const parsed = ReportSchema.safeParse(req.body);

      if (!parsed.success) {
        return reply.status(400).send({
          code: "INVALID_INPUT",
          message: "Invalid report payload.",
          errors: parsed.error.format(),
        });
      }

      const { reportedUserId, matchId, reason, description, block } = parsed.data;

      // 1. Save report to DB
      const report = await prisma.report.create({
        data: {
          reporterId,
          reportedUserId,
          matchId,
          reason,
          description,
        },
      });

      // 2. Perform Block if requested
      if (block) {
        await prisma.block.upsert({
          where: {
            blockerId_blockedUserId: {
              blockerId: reporterId,
              blockedUserId: reportedUserId,
            },
          },
          update: {},
          create: {
            blockerId: reporterId,
            blockedUserId: reportedUserId,
          },
        });
      }

      // 3. Terminate active match if matched together
      const activeMatchId = await matchmakingService.getActiveMatch(reporterId);
      if (activeMatchId) {
        const peers = await matchmakingService.getMatchPeers(activeMatchId);
        if (peers && peers.includes(reportedUserId)) {
          await closeMatch(app.io, activeMatchId, MatchEndReason.REPORTED, reporterId);
        }
      }

      // 4. Auto-ban logic: if user accumulates >= 3 reports in total
      const reportCount = await prisma.report.count({
        where: { reportedUserId },
      });

      let isBanned = false;
      if (reportCount >= 3) {
        isBanned = true;

        // Update user status
        await prisma.user.update({
          where: { id: reportedUserId },
          data: { status: "BANNED" },
        });

        // Save Ban record
        await prisma.ban.create({
          data: {
            userId: reportedUserId,
            type: BanType.PERMANENT,
            reason: "Auto-banned due to accumulating 3 or more safety reports.",
            createdBy: "SYSTEM",
          },
        });

        // Revoke all sessions
        await prisma.session.updateMany({
          where: { userId: reportedUserId },
          data: { revokedAt: new Date() },
        });

        // Disconnect active socket if online
        const socketId = await matchmakingService.getSocketId(reportedUserId);
        if (socketId) {
          const socket = app.io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit(SOCKET_EVENTS.ERROR, {
              code: "BANNED",
              message: "Your account has been banned due to safety reports.",
            });
            socket.disconnect(true);
          }
        }
      }

      return reply.send({ success: true, banned: isBanned, reportId: report.id });
    }
  );

  // Block a user
  app.post(
    "/moderation/block",
    { preValidation: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const blockerId = req.user!.id;
      const parsed = BlockSchema.safeParse(req.body);

      if (!parsed.success) {
        return reply.status(400).send({
          code: "INVALID_INPUT",
          message: "Invalid block payload.",
        });
      }

      const { blockedUserId } = parsed.data;

      // 1. Save block record
      await prisma.block.upsert({
        where: {
          blockerId_blockedUserId: {
            blockerId,
            blockedUserId,
          },
        },
        update: {},
        create: {
          blockerId,
          blockedUserId,
        },
      });

      // 2. Terminate active match if matched together
      const activeMatchId = await matchmakingService.getActiveMatch(blockerId);
      if (activeMatchId) {
        const peers = await matchmakingService.getMatchPeers(activeMatchId);
        if (peers && peers.includes(blockedUserId)) {
          await closeMatch(app.io, activeMatchId, MatchEndReason.REPORTED, blockerId);
        }
      }

      return reply.send({ success: true });
    }
  );
}
