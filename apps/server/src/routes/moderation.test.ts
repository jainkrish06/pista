import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, ConsentType, BanType } from "@pista/database";
import { buildApp } from "../index.js";
import { generateSessionToken, hashToken } from "../utils/crypto.js";
import { matchmakingService } from "../services/matchmaking.js";
import { io as connectClient, Socket as ClientSocket } from "socket.io-client";
import { SOCKET_EVENTS } from "@pista/shared";

// Mock the shared queue timeout constant to 2000ms to allow testing timeout flows
vi.mock("@pista/shared", async (importOriginal) => {
  const original = await importOriginal<typeof import("@pista/shared")>();
  return {
    ...original,
    MATCHMAKING_QUEUE_TIMEOUT_MS: 2000,
  };
});

describe("Moderation HTTP & WebSocket Handlers", () => {
  let app: FastifyInstance;
  let port: number;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    app = await buildApp();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address() as any;
    port = address.port;
  });

  afterAll(async () => {
    await app.close();
    // Clean up test users, matches, reports, blocks, bans
    await prisma.report.deleteMany({
      where: {
        OR: [
          { reporter: { email: { startsWith: "test-mod-" } } },
          { reportedUser: { email: { startsWith: "test-mod-" } } }
        ]
      }
    });
    await prisma.block.deleteMany({
      where: {
        OR: [
          { blocker: { email: { startsWith: "test-mod-" } } },
          { blockedUser: { email: { startsWith: "test-mod-" } } }
        ]
      }
    });
    await prisma.ban.deleteMany({
      where: {
        user: {
          email: { startsWith: "test-mod-" }
        }
      }
    });
    await prisma.session.deleteMany({
      where: {
        user: {
          email: { startsWith: "test-mod-" }
        }
      }
    });
    await prisma.user.deleteMany({
      where: {
        email: { startsWith: "test-mod-" }
      }
    });
  });

  beforeEach(async () => {
    await matchmakingService.flush();
  });

  // Helper to create a user, session, and return user data and signed cookie
  async function createTestUser(name: string) {
    const email = `test-mod-${name}-${Date.now()}@example.com`;
    const token = generateSessionToken();
    const tokenHash = hashToken(token);

    const user = await prisma.user.create({
      data: {
        email,
        authProvider: "EMAIL",
        status: "ACTIVE",
        profile: {
          create: {
            displayName: name,
          },
        },
        consents: {
          createMany: {
            data: [
              { type: ConsentType.AGE_CONFIRMATION, version: "v1" },
              { type: ConsentType.TERMS_OF_SERVICE, version: "v1" },
              { type: ConsentType.PRIVACY_POLICY, version: "v1" },
              { type: ConsentType.COMMUNITY_GUIDELINES, version: "v1" },
            ],
          },
        },
        sessions: {
          create: {
            tokenHash,
            expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
          },
        },
      },
    });

    const signedCookie = app.signCookie(token);
    const cookieHeader = `session=${signedCookie}`;

    return { user, cookieHeader, token };
  }

  // Connect helper
  function connectSocket(cookieHeader: string): ClientSocket {
    return connectClient(`http://127.0.0.1:${port}`, {
      extraHeaders: {
        cookie: cookieHeader,
      },
      forceNew: true,
      transports: ["websocket"],
    });
  }

  it("should successfully report and block a user", async () => {
    const reporter = await createTestUser("reporter");
    const offender = await createTestUser("offender");

    const reportRes = await app.inject({
      method: "POST",
      url: "/moderation/report",
      headers: {
        cookie: reporter.cookieHeader,
      },
      payload: {
        reportedUserId: offender.user.id,
        reason: "HARASSMENT",
        description: "Abusive chat messages during match",
        block: true,
      },
    });

    expect(reportRes.statusCode).toBe(200);
    const body = JSON.parse(reportRes.body);
    expect(body.success).toBe(true);
    expect(body.banned).toBe(false);

    // Verify report created in DB
    const report = await prisma.report.findUnique({
      where: { id: body.reportId },
    });
    expect(report).toBeDefined();
    expect(report?.reason).toBe("HARASSMENT");

    // Verify block created in DB
    const block = await prisma.block.findUnique({
      where: {
        blockerId_blockedUserId: {
          blockerId: reporter.user.id,
          blockedUserId: offender.user.id,
        },
      },
    });
    expect(block).toBeDefined();
  });

  it("should auto-ban a user when they receive 3 reports, revoking sessions and disconnecting active socket", async () => {
    const victim1 = await createTestUser("victim-1");
    const victim2 = await createTestUser("victim-2");
    const victim3 = await createTestUser("victim-3");
    const badGuy = await createTestUser("bad-guy");

    // Connect bad guy's socket
    const badGuySocket = connectSocket(badGuy.cookieHeader);

    await new Promise<void>((resolveConnect) => {
      badGuySocket.on("connect", () => resolveConnect());
    });

    // Map the socket ID
    await matchmakingService.enqueue(badGuy.user.id, badGuySocket.id!);

    // Victim 1 reports bad-guy
    await app.inject({
      method: "POST",
      url: "/moderation/report",
      headers: { cookie: victim1.cookieHeader },
      payload: { reportedUserId: badGuy.user.id, reason: "HATE_ABUSE" },
    });

    // Victim 2 reports bad-guy
    await app.inject({
      method: "POST",
      url: "/moderation/report",
      headers: { cookie: victim2.cookieHeader },
      payload: { reportedUserId: badGuy.user.id, reason: "HATE_ABUSE" },
    });

    let disconnectedPromise = new Promise<void>((resolveDisconnect) => {
      badGuySocket.on("disconnect", () => resolveDisconnect());
    });

    // Victim 3 reports bad-guy -> triggers auto ban
    const reportRes3 = await app.inject({
      method: "POST",
      url: "/moderation/report",
      headers: { cookie: victim3.cookieHeader },
      payload: { reportedUserId: badGuy.user.id, reason: "HATE_ABUSE" },
    });

    expect(reportRes3.statusCode).toBe(200);
    const body3 = JSON.parse(reportRes3.body);
    expect(body3.success).toBe(true);
    expect(body3.banned).toBe(true);

    // Verify user is banned in DB
    const dbUser = await prisma.user.findUnique({
      where: { id: badGuy.user.id },
    });
    expect(dbUser?.status).toBe("BANNED");

    // Verify session revoked in DB
    const sessions = await prisma.session.findMany({
      where: { userId: badGuy.user.id },
    });
    expect(sessions.every(s => s.revokedAt !== null)).toBe(true);

    // Verify Socket.IO disconnected instantly
    await disconnectedPromise;
    expect(badGuySocket.connected).toBe(false);
  });

  it("should block candidate matchmaking selection between users who blocked each other", async () => {
    const userA = await createTestUser("user-a");
    const userB = await createTestUser("user-b");

    // User A blocks User B
    await app.inject({
      method: "POST",
      url: "/moderation/block",
      headers: { cookie: userA.cookieHeader },
      payload: { blockedUserId: userB.user.id },
    });

    // Enqueue User B
    const clientB = connectSocket(userB.cookieHeader);
    await new Promise<void>((resolve) => {
      if (clientB.connected) resolve();
      else clientB.on("connect", () => resolve());
    });

    // Enqueue User A
    const clientA = connectSocket(userA.cookieHeader);
    await new Promise<void>((resolve) => {
      if (clientA.connected) resolve();
      else clientA.on("connect", () => resolve());
    });

    // Register promises to listen to status changes before emitting find match
    const statusAPromise = new Promise<string>((resolve) => {
      clientA.on(SOCKET_EVENTS.MATCHMAKING_STATUS, (status) => {
        if (status === "no_one_available") resolve(status);
      });
    });

    const statusBPromise = new Promise<string>((resolve) => {
      clientB.on(SOCKET_EVENTS.MATCHMAKING_STATUS, (status) => {
        if (status === "no_one_available") resolve(status);
      });
    });

    clientB.emit(SOCKET_EVENTS.FIND_MATCH);
    clientA.emit(SOCKET_EVENTS.FIND_MATCH);

    const statusA = await statusAPromise;
    const statusB = await statusBPromise;

    expect(statusA).toBe("no_one_available");
    expect(statusB).toBe("no_one_available");

    clientA.disconnect();
    clientB.disconnect();
  });
});
