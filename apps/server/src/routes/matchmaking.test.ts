import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { io as connectClient, Socket as ClientSocket } from "socket.io-client";
import { prisma, ConsentType } from "@pista/database";
import { buildApp } from "../index.js";
import { generateSessionToken, hashToken } from "../utils/crypto.js";
import { SOCKET_EVENTS } from "@pista/shared";
import { matchmakingService } from "../services/matchmaking.js";

// Mock the shared queue timeout constant to 2000ms to allow testing timeout flows
vi.mock("@pista/shared", async (importOriginal) => {
  const original = await importOriginal<typeof import("@pista/shared")>();
  return {
    ...original,
    MATCHMAKING_QUEUE_TIMEOUT_MS: 2000,
  };
});

describe("Matchmaking WebSocket Handlers", () => {
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
    // Clean up test users and their matches
    await prisma.match.deleteMany({
      where: {
        OR: [
          { userA: { email: { startsWith: "test-match-" } } },
          { userB: { email: { startsWith: "test-match-" } } }
        ]
      }
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          startsWith: "test-match-",
        },
      },
    });
  });

  beforeEach(async () => {
    // Isolate tests by flushing the queue and active matches state
    await matchmakingService.flush();
  });

  // Helper to create an authenticated user and socket client
  async function createAuthClient(name: string): Promise<{
    client: ClientSocket;
    userId: string;
    cleanup: () => Promise<void>;
  }> {
    const email = `test-match-${name}-${Date.now()}@example.com`;
    const token = generateSessionToken();
    const tokenHash = hashToken(token);

    // Create user with consents and active profile
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

    const client = connectClient(`http://127.0.0.1:${port}`, {
      extraHeaders: {
        cookie: `session=${signedCookie}`,
      },
      forceNew: true,
      transports: ["websocket"],
    });

    // Await connection establishment
    await new Promise<void>((resolve, reject) => {
      if (client.connected) {
        resolve();
      } else {
        client.on("connect", () => resolve());
        client.on("connect_error", (err) => reject(err));
      }
    });

    const cleanup = async () => {
      if (client.connected) {
        client.disconnect();
      }
      // Delete matches first to satisfy foreign key constraints
      await prisma.match.deleteMany({
        where: {
          OR: [{ userAId: user.id }, { userBId: user.id }],
        },
      });
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    };

    return { client, userId: user.id, cleanup };
  }

  it("should connect and authenticate a socket client successfully", async () => {
    const { client, cleanup } = await createAuthClient("authed");
    expect(client.connected).toBe(true);
    await cleanup();
  });

  it("should match two users queueing concurrently", async () => {
    const { client: clientA, cleanup: cleanupA } = await createAuthClient("user-a");
    const { client: clientB, cleanup: cleanupB } = await createAuthClient("user-b");

    clientA.emit(SOCKET_EVENTS.FIND_MATCH);
    // Slight delay to ensure clientA registers in queue first
    await new Promise((r) => setTimeout(r, 50));
    clientB.emit(SOCKET_EVENTS.FIND_MATCH);

    await new Promise<void>((resolve, reject) => {
      let matchedA = false;
      let matchedB = false;
      let matchIdA = "";
      let matchIdB = "";

      const checkDone = async () => {
        if (matchedA && matchedB) {
          try {
            expect(matchIdA).toBe(matchIdB);
            expect(matchIdA).not.toBe("");
            await cleanupA();
            await cleanupB();
            resolve();
          } catch (err) {
            reject(err);
          }
        }
      };

      clientA.on(SOCKET_EVENTS.MATCH_FOUND, (payload) => {
        try {
          matchedA = true;
          matchIdA = payload.matchId;
          expect(payload.isInitiator).toBe(false);
          checkDone().catch(reject);
        } catch (err) {
          cleanupA().then(() => cleanupB().then(() => reject(err)));
        }
      });

      clientB.on(SOCKET_EVENTS.MATCH_FOUND, (payload) => {
        try {
          matchedB = true;
          matchIdB = payload.matchId;
          expect(payload.isInitiator).toBe(true);
          checkDone().catch(reject);
        } catch (err) {
          cleanupA().then(() => cleanupB().then(() => reject(err)));
        }
      });
    });
  });

  it("should successfully cancel queueing", async () => {
    const { client, cleanup } = await createAuthClient("cancel");

    client.emit(SOCKET_EVENTS.FIND_MATCH);

    await new Promise<void>((resolve, reject) => {
      client.on(SOCKET_EVENTS.MATCHMAKING_STATUS, (status) => {
        try {
          if (status === "searching") {
            client.emit(SOCKET_EVENTS.CANCEL_FIND);
          } else if (status === "no_one_available") {
            cleanup().then(resolve).catch(reject);
          }
        } catch (err) {
          cleanup().then(() => reject(err)).catch(reject);
        }
      });
    });
  });

  it("should clean up queue mappings when a socket disconnects", async () => {
    const { client, userId, cleanup } = await createAuthClient("disconnect-queue");

    client.emit(SOCKET_EVENTS.FIND_MATCH);

    // Wait for queue write
    await new Promise((r) => setTimeout(r, 50));
    const lenBefore = await matchmakingService.getQueueLength();
    expect(lenBefore).toBe(1);

    client.disconnect();

    // Wait for disconnect process
    await new Promise((r) => setTimeout(r, 50));
    const lenAfter = await matchmakingService.getQueueLength();
    expect(lenAfter).toBe(0);

    await cleanup();
  });

  it("should handle partner skip and re-enqueueing", async () => {
    const { client: clientA, cleanup: cleanupA } = await createAuthClient("skipper");
    const { client: clientB, cleanup: cleanupB } = await createAuthClient("skipped");

    clientA.emit(SOCKET_EVENTS.FIND_MATCH);
    await new Promise((r) => setTimeout(r, 50));
    clientB.emit(SOCKET_EVENTS.FIND_MATCH);

    await new Promise<void>((resolve, reject) => {
      let matchId = "";

      clientA.on(SOCKET_EVENTS.MATCH_FOUND, (payload) => {
        matchId = payload.matchId;
        // User A decides to skip User B
        setTimeout(() => {
          clientA.emit(SOCKET_EVENTS.SKIP);
        }, 50);
      });

      // Skipper (User A) should go back to searching
      clientA.on(SOCKET_EVENTS.MATCHMAKING_STATUS, (status) => {
        try {
          if (status === "searching" && matchId !== "") {
            cleanupA().then(() => {
              cleanupB().then(resolve).catch(reject);
            }).catch(reject);
          }
        } catch (err) {
          cleanupA().then(() => cleanupB().then(() => reject(err))).catch(reject);
        }
      });

      // Skipped partner (User B) should get match ended event
      clientB.on(SOCKET_EVENTS.MATCH_ENDED, (payload) => {
        try {
          expect(payload.matchId).toBe(matchId);
          expect(payload.reason).toBe("skipped");
        } catch (err) {
          cleanupA().then(() => cleanupB().then(() => reject(err))).catch(reject);
        }
      });
    });
  });

  it("should trigger timeout if no candidate joins the queue", async () => {
    const { client, cleanup } = await createAuthClient("timeout-user");

    client.emit(SOCKET_EVENTS.FIND_MATCH);

    await new Promise<void>((resolve, reject) => {
      client.on(SOCKET_EVENTS.MATCHMAKING_STATUS, (status) => {
        try {
          if (status === "no_one_available") {
            cleanup().then(resolve).catch(reject);
          }
        } catch (err) {
          cleanup().then(() => reject(err)).catch(reject);
        }
      });
    });
  });

  it("should relay WebRTC signaling between matched users", async () => {
    const { client: clientA, cleanup: cleanupA } = await createAuthClient("signaler-a");
    const { client: clientB, cleanup: cleanupB } = await createAuthClient("signaler-b");

    clientA.emit(SOCKET_EVENTS.FIND_MATCH);
    await new Promise((r) => setTimeout(r, 50));
    clientB.emit(SOCKET_EVENTS.FIND_MATCH);

    await new Promise<void>((resolve, reject) => {
      let matchId = "";

      clientA.on(SOCKET_EVENTS.MATCH_FOUND, (payload) => {
        matchId = payload.matchId;
      });

      clientB.on(SOCKET_EVENTS.MATCH_FOUND, (payload) => {
        matchId = payload.matchId;
        expect(payload.isInitiator).toBe(true);

        // User B (initiator) sends WebRTC offer
        setTimeout(() => {
          clientB.emit(SOCKET_EVENTS.SIGNAL, {
            matchId,
            kind: "offer",
            data: { sdp: "sdp-offer-string" },
          });
        }, 50);
      });

      clientA.on(SOCKET_EVENTS.SIGNAL_RELAY, (payload) => {
        try {
          expect(payload.matchId).toBe(matchId);
          expect(payload.kind).toBe("offer");
          expect(payload.data.sdp).toBe("sdp-offer-string");

          // User A responds with WebRTC answer
          clientA.emit(SOCKET_EVENTS.SIGNAL, {
            matchId,
            kind: "answer",
            data: { sdp: "sdp-answer-string" },
          });
        } catch (err) {
          cleanupA().then(() => cleanupB().then(() => reject(err)));
        }
      });

      clientB.on(SOCKET_EVENTS.SIGNAL_RELAY, (payload) => {
        try {
          expect(payload.matchId).toBe(matchId);
          expect(payload.kind).toBe("answer");
          expect(payload.data.sdp).toBe("sdp-answer-string");

          cleanupA().then(() => cleanupB().then(resolve).catch(reject)).catch(reject);
        } catch (err) {
          cleanupA().then(() => cleanupB().then(() => reject(err)));
        }
      });
    });
  });

  it("should reject spoofed signaling from non-participants", async () => {
    const { client: clientA, cleanup: cleanupA } = await createAuthClient("user-a");
    const { client: clientB, cleanup: cleanupB } = await createAuthClient("user-b");
    const { client: clientC, cleanup: cleanupC } = await createAuthClient("spoofer-c");

    let matchId = "";

    clientA.emit(SOCKET_EVENTS.FIND_MATCH);
    await new Promise((r) => setTimeout(r, 50));
    clientB.emit(SOCKET_EVENTS.FIND_MATCH);

    await new Promise<void>((resolve, reject) => {
      clientA.on(SOCKET_EVENTS.MATCH_FOUND, (payload) => {
        matchId = payload.matchId;

        // User C (spoofer) tries to send WebRTC offer
        setTimeout(() => {
          clientC.emit(SOCKET_EVENTS.SIGNAL, {
            matchId,
            kind: "offer",
            data: { sdp: "spoofed" },
          });
        }, 50);
      });

      clientC.on(SOCKET_EVENTS.ERROR, (err) => {
        try {
          expect(err.code).toBe("UNAUTHENTICATED");
          expect(err.message).toContain("participant");
          cleanupA().then(() => cleanupB().then(() => cleanupC().then(resolve)));
        } catch (error) {
          cleanupA().then(() => cleanupB().then(() => cleanupC().then(() => reject(error))));
        }
      });

      clientA.on(SOCKET_EVENTS.SIGNAL_RELAY, () => {
        cleanupA().then(() => cleanupB().then(() => cleanupC().then(() => reject(new Error("Spoofed signal was relayed!")))));
      });
    });
  });

  it("should reject signaling from unmatched users", async () => {
    const { client, cleanup } = await createAuthClient("unmatched");

    client.emit(SOCKET_EVENTS.SIGNAL, {
      matchId: "some-stale-match-id",
      kind: "ice-candidate",
      data: {},
    });

    await new Promise<void>((resolve, reject) => {
      client.on(SOCKET_EVENTS.ERROR, (err) => {
        try {
          expect(err.code).toBe("UNAUTHENTICATED");
          cleanup().then(resolve).catch(reject);
        } catch (error) {
          cleanup().then(() => reject(error)).catch(reject);
        }
      });
    });
  });

  it("should route text chat messages between matched users", async () => {
    const { client: clientA, cleanup: cleanupA } = await createAuthClient("chatter-a");
    const { client: clientB, cleanup: cleanupB } = await createAuthClient("chatter-b");

    clientA.emit(SOCKET_EVENTS.FIND_MATCH);
    await new Promise((r) => setTimeout(r, 50));
    clientB.emit(SOCKET_EVENTS.FIND_MATCH);

    await new Promise<void>((resolve, reject) => {
      let matchId = "";

      clientA.on(SOCKET_EVENTS.MATCH_FOUND, (payload) => {
        matchId = payload.matchId;
      });

      clientB.on(SOCKET_EVENTS.MATCH_FOUND, (payload) => {
        matchId = payload.matchId;
        // User B sends a text message
        setTimeout(() => {
          clientB.emit(SOCKET_EVENTS.CHAT_MESSAGE, {
            matchId,
            text: "Hello from User B!",
          });
        }, 50);
      });

      clientA.on(SOCKET_EVENTS.CHAT_MESSAGE_IN, (payload) => {
        try {
          expect(payload.matchId).toBe(matchId);
          expect(payload.text).toBe("Hello from User B!");
          expect(payload.sentAt).toBeDefined();

          // User A responds
          clientA.emit(SOCKET_EVENTS.CHAT_MESSAGE, {
            matchId,
            text: "Hi User B!",
          });
        } catch (err) {
          cleanupA().then(() => cleanupB().then(() => reject(err)));
        }
      });

      clientB.on(SOCKET_EVENTS.CHAT_MESSAGE_IN, (payload) => {
        try {
          expect(payload.matchId).toBe(matchId);
          expect(payload.text).toBe("Hi User B!");
          expect(payload.sentAt).toBeDefined();

          cleanupA().then(() => cleanupB().then(resolve).catch(reject)).catch(reject);
        } catch (err) {
          cleanupA().then(() => cleanupB().then(() => reject(err)));
        }
      });
    });
  });

  it("should prevent message spoofing from non-participants", async () => {
    const { client: clientA, cleanup: cleanupA } = await createAuthClient("user-a");
    const { client: clientB, cleanup: cleanupB } = await createAuthClient("user-b");
    const { client: clientC, cleanup: cleanupC } = await createAuthClient("spoofer-c");

    let matchId = "";

    clientA.emit(SOCKET_EVENTS.FIND_MATCH);
    await new Promise((r) => setTimeout(r, 50));
    clientB.emit(SOCKET_EVENTS.FIND_MATCH);

    await new Promise<void>((resolve, reject) => {
      clientA.on(SOCKET_EVENTS.MATCH_FOUND, (payload) => {
        matchId = payload.matchId;

        // User C (spoofer) tries to send a chat message
        setTimeout(() => {
          clientC.emit(SOCKET_EVENTS.CHAT_MESSAGE, {
            matchId,
            text: "Spoofed chat message",
          });
        }, 50);
      });

      clientC.on(SOCKET_EVENTS.ERROR, (err) => {
        try {
          expect(err.code).toBe("UNAUTHENTICATED");
          expect(err.message).toContain("participant");
          cleanupA().then(() => cleanupB().then(() => cleanupC().then(resolve)));
        } catch (error) {
          cleanupA().then(() => cleanupB().then(() => cleanupC().then(() => reject(error))));
        }
      });

      clientA.on(SOCKET_EVENTS.CHAT_MESSAGE_IN, () => {
        cleanupA().then(() => cleanupB().then(() => cleanupC().then(() => reject(new Error("Spoofed message was relayed!")))));
      });
    });
  });
});
