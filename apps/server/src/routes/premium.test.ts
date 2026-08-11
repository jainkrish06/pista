import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, ConsentType } from "@pista/database";
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

describe("Premium Features & Subscription API", () => {
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
    // Clean up test premium matches, subscriptions, profiles, and users
    await prisma.match.deleteMany({
      where: {
        OR: [
          { userA: { email: { startsWith: "test-premium-" } } },
          { userB: { email: { startsWith: "test-premium-" } } },
        ],
      },
    });
    await prisma.subscription.deleteMany({
      where: {
        user: {
          email: { startsWith: "test-premium-" },
        },
      },
    });
    await prisma.profile.deleteMany({
      where: {
        user: {
          email: { startsWith: "test-premium-" },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: { startsWith: "test-premium-" },
      },
    });
  });

  beforeEach(async () => {
    await matchmakingService.flush();
  });

  // Helper to create a user with customized profile fields
  async function createTestUser(
    name: string,
    profileData?: { gender?: string; country?: string; interests?: string[] }
  ) {
    const email = `test-premium-${name}-${Date.now()}@example.com`;
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
            gender: profileData?.gender,
            country: profileData?.country,
            interests: profileData?.interests || [],
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

  it("should successfully upgrade and downgrade user subscription via REST endpoints", async () => {
    const { cookieHeader } = await createTestUser("billing");

    // 1. Initial subscription state should not exist (or default to free)
    const initialCheck = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie: cookieHeader },
    });
    expect(initialCheck.statusCode).toBe(200);
    const parsedInit = JSON.parse(initialCheck.body);
    expect(parsedInit.subscription).toBeNull();

    // 2. Upgrade to Premium
    const upgradeRes = await app.inject({
      method: "POST",
      url: "/subscription/upgrade",
      headers: { cookie: cookieHeader },
    });
    expect(upgradeRes.statusCode).toBe(200);
    const upgradeBody = JSON.parse(upgradeRes.body);
    expect(upgradeBody.success).toBe(true);
    expect(upgradeBody.subscription.plan).toBe("PREMIUM");
    expect(upgradeBody.subscription.status).toBe("ACTIVE");

    // 3. Downgrade to Free
    const cancelRes = await app.inject({
      method: "POST",
      url: "/subscription/cancel",
      headers: { cookie: cookieHeader },
    });
    expect(cancelRes.statusCode).toBe(200);
    const cancelBody = JSON.parse(cancelRes.body);
    expect(cancelBody.success).toBe(true);
    expect(cancelBody.subscription.plan).toBe("FREE");
    expect(cancelBody.subscription.status).toBe("EXPIRED");
  });

  it("should block a free user from enqueuing with filters", async () => {
    const { cookieHeader } = await createTestUser("free-user");
    const client = connectSocket(cookieHeader);

    await new Promise<void>((resolve) => {
      if (client.connected) resolve();
      else client.on("connect", () => resolve());
    });

    const errorPromise = new Promise<any>((resolve) => {
      client.on(SOCKET_EVENTS.ERROR, (err) => {
        resolve(err);
      });
    });

    // Try enqueuing with filters
    client.emit(SOCKET_EVENTS.FIND_MATCH, {
      filters: { gender: "FEMALE" },
    });

    const error = await errorPromise;
    expect(error.code).toBe("PREMIUM_REQUIRED");
    expect(error.message).toContain("Filters are a premium feature");

    client.disconnect();
  });

  it("should match premium users based on mutual filtering (gender criteria)", async () => {
    // User A (Premium, Male): Wants Female
    const userA = await createTestUser("premium-a", { gender: "MALE" });
    await app.inject({
      method: "POST",
      url: "/subscription/upgrade",
      headers: { cookie: userA.cookieHeader },
    });

    // User B (Free, Male): No filters (does not match A's female filter)
    const userB = await createTestUser("candidate-b", { gender: "MALE" });

    // User C (Free, Female): No filters (matches A's female filter, A matches C's lack of filters)
    const userC = await createTestUser("candidate-c", { gender: "FEMALE" });

    const clientA = connectSocket(userA.cookieHeader);
    const clientB = connectSocket(userB.cookieHeader);
    const clientC = connectSocket(userC.cookieHeader);

    await Promise.all([
      new Promise<void>((r) => (clientA.connected ? r() : clientA.on("connect", () => r()))),
      new Promise<void>((r) => (clientB.connected ? r() : clientB.on("connect", () => r()))),
      new Promise<void>((r) => (clientC.connected ? r() : clientC.on("connect", () => r()))),
    ]);

    // Enqueue User A with Gender Filter = FEMALE
    clientA.emit(SOCKET_EVENTS.FIND_MATCH, {
      filters: { gender: "FEMALE" },
    });

    // Wait a brief moment to ensure A is at head of queue
    await new Promise((r) => setTimeout(r, 100));

    // Enqueue User B (Male) - should NOT match with A
    clientB.emit(SOCKET_EVENTS.FIND_MATCH);

    // Wait a brief moment to allow matchmaking cycle to process B and skip it
    await new Promise((r) => setTimeout(r, 200));

    // Disconnect B so he doesn't block the queue head
    clientB.disconnect();

    // Enqueue User C (Female) - should match with A!
    const matchPromiseA = new Promise<any>((resolve) => {
      clientA.on(SOCKET_EVENTS.MATCH_FOUND, (payload) => resolve(payload));
    });
    const matchPromiseC = new Promise<any>((resolve) => {
      clientC.on(SOCKET_EVENTS.MATCH_FOUND, (payload) => resolve(payload));
    });

    clientC.emit(SOCKET_EVENTS.FIND_MATCH);

    const payloadA = await matchPromiseA;
    const payloadC = await matchPromiseC;

    expect(payloadA.matchId).toBeDefined();
    expect(payloadC.matchId).toBe(payloadA.matchId);

    clientA.disconnect();
    clientB.disconnect();
    clientC.disconnect();
  });
});
