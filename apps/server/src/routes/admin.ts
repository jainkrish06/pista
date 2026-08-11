import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { prisma, BanType } from "@pista/database";
import { matchmakingService } from "../services/matchmaking.js";
import { SOCKET_EVENTS } from "@pista/shared";

// Validation schemas for Admin Actions
const banUserSchema = z.object({
  userId: z.string().cuid(),
  reason: z.string().min(3).max(500),
});

const unbanUserSchema = z.object({
  userId: z.string().cuid(),
});

export async function adminRoutes(app: FastifyInstance) {
  // Pre-handler hook to authenticate admin calls
  app.addHook("preHandler", async (req: FastifyRequest, reply: FastifyReply) => {
    const adminSecret = req.headers["x-admin-secret"];
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return reply.status(401).send({
        code: "UNAUTHORIZED",
        message: "Invalid or missing Admin Secret Key.",
      });
    }
  });

  // GET /admin/telemetry: Get live system metrics
  app.get("/admin/telemetry", async (req: FastifyRequest, reply: FastifyReply) => {
    const totalUsers = await prisma.user.count();
    const activeMatches = await prisma.match.count({
      where: { status: "ACTIVE" },
    });
    
    const queueLength = await matchmakingService.getQueueLength();

    const totalReports = await prisma.report.count();
    const totalBans = await prisma.ban.count();

    return reply.send({
      totalUsers,
      activeMatches,
      queueLength,
      totalReports,
      totalBans,
    });
  });

  // GET /admin/reports: Retrieve all safety reports
  app.get("/admin/reports", async (req: FastifyRequest, reply: FastifyReply) => {
    const reports = await prisma.report.findMany({
      include: {
        reporter: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                displayName: true,
              },
            },
          },
        },
        reportedUser: {
          select: {
            id: true,
            email: true,
            status: true,
            profile: {
              select: {
                displayName: true,
              },
            },
            bans: {
              select: {
                reason: true,
                createdAt: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return reply.send({ reports });
  });

  // GET /admin/bans: List all banned users
  app.get("/admin/bans", async (req: FastifyRequest, reply: FastifyReply) => {
    const bans = await prisma.ban.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                displayName: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return reply.send({ bans });
  });

  // POST /admin/ban: Manually ban a user
  app.post("/admin/ban", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = banUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        code: "INVALID_INPUT",
        message: parseResult.error.errors[0].message,
      });
    }

    const { userId, reason } = parseResult.data;

    // Check if target user exists and is not already banned
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return reply.status(404).send({
        code: "USER_NOT_FOUND",
        message: "Target user not found.",
      });
    }

    if (targetUser.status === "BANNED") {
      return reply.status(400).send({
        code: "ALREADY_BANNED",
        message: "User is already banned.",
      });
    }

    // 1. Mutate user status and create Ban record
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { status: "BANNED" },
      }),
      prisma.ban.create({
        data: {
          userId,
          type: BanType.PERMANENT,
          reason,
          createdBy: "ADMIN",
        },
      }),
      prisma.session.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      }),
    ]);

    // 2. Disconnect user's active WebSocket connection if online
    const socketId = await matchmakingService.getSocketId(userId);
    if (socketId && app.io) {
      const socket = app.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit(SOCKET_EVENTS.ERROR, {
          code: "BANNED",
          message: `Your account has been suspended: ${reason}`,
        });
        socket.disconnect(true);
      }
    }

    // Clean up queue mappings
    await matchmakingService.dequeue(userId);

    return reply.send({ success: true, message: "User successfully banned." });
  });

  // POST /admin/unban: Revoke a user ban
  app.post("/admin/unban", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = unbanUserSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        code: "INVALID_INPUT",
        message: parseResult.error.errors[0].message,
      });
    }

    const { userId } = parseResult.data;

    // Check if target user exists and is banned
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      return reply.status(404).send({
        code: "USER_NOT_FOUND",
        message: "Target user not found.",
      });
    }

    if (targetUser.status !== "BANNED") {
      return reply.status(400).send({
        code: "NOT_BANNED",
        message: "User is not banned.",
      });
    }

    // 1. Revert user status to ACTIVE and delete associated Ban records
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { status: "ACTIVE" },
      }),
      prisma.ban.deleteMany({
        where: { userId },
      }),
    ]);

    return reply.send({ success: true, message: "User successfully unbanned." });
  });
}
