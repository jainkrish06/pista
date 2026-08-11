import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, ConsentType } from "@pista/database";
import { buildApp } from "../index.js";
import { generateSessionToken, hashToken } from "../utils/crypto.js";
import { matchmakingService } from "../services/matchmaking.js";

const TEST_ADMIN_SECRET = "9sX3pY0zT5vN4xL7r9aH2oI8gK3uB6d7fS2wX1mQ4vI=";

describe("Admin Dashboard API Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.ADMIN_SECRET = TEST_ADMIN_SECRET;
    app = await buildApp();
    await app.listen({ port: 0, host: "127.0.0.1" });
  });

  afterAll(async () => {
    await app.close();
    // Clean up test admin users
    await prisma.ban.deleteMany({
      where: {
        user: {
          email: { startsWith: "test-admin-" },
        },
      },
    });
    await prisma.report.deleteMany({
      where: {
        OR: [
          { reporter: { email: { startsWith: "test-admin-" } } },
          { reportedUser: { email: { startsWith: "test-admin-" } } },
        ],
      },
    });
    await prisma.profile.deleteMany({
      where: {
        user: {
          email: { startsWith: "test-admin-" },
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        email: { startsWith: "test-admin-" },
      },
    });
  });

  beforeEach(async () => {
    await matchmakingService.flush();
  });

  // Helper to create a user
  async function createTestUser(name: string) {
    const email = `test-admin-${name}-${Date.now()}@example.com`;
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

  it("should reject admin endpoint requests with missing or invalid secret keys", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/admin/telemetry",
    });
    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("UNAUTHORIZED");

    const resWrong = await app.inject({
      method: "GET",
      url: "/admin/telemetry",
      headers: { "x-admin-secret": "wrong-secret-key" },
    });
    expect(resWrong.statusCode).toBe(401);
  });

  it("should fetch live telemetry calculations with the correct admin secret key", async () => {
    // Register one user to alter stats
    await createTestUser("stats-user");

    const res = await app.inject({
      method: "GET",
      url: "/admin/telemetry",
      headers: { "x-admin-secret": TEST_ADMIN_SECRET },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.totalUsers).toBeGreaterThanOrEqual(1);
    expect(body.activeMatches).toBeDefined();
    expect(body.queueLength).toBeDefined();
    expect(body.totalReports).toBeDefined();
    expect(body.totalBans).toBeDefined();
  });

  it("should successfully log, retrieve reports, ban offender, and unban offender", async () => {
    const reporter = await createTestUser("reporter");
    const offender = await createTestUser("offender");

    // 1. Submit safety report
    const reportRes = await app.inject({
      method: "POST",
      url: "/moderation/report",
      headers: { cookie: reporter.cookieHeader },
      payload: {
        reportedUserId: offender.user.id,
        reason: "HARASSMENT",
        description: "Bad chat demeanor",
      },
    });
    expect(reportRes.statusCode).toBe(200);

    // 2. Fetch reports log via admin REST endpoint
    const getRepRes = await app.inject({
      method: "GET",
      url: "/admin/reports",
      headers: { "x-admin-secret": TEST_ADMIN_SECRET },
    });
    expect(getRepRes.statusCode).toBe(200);
    const reportsBody = JSON.parse(getRepRes.body);
    expect(reportsBody.reports.length).toBeGreaterThanOrEqual(1);
    const currentReport = reportsBody.reports.find(
      (r: any) => r.reportedUser.id === offender.user.id
    );
    expect(currentReport).toBeDefined();
    expect(currentReport.reason).toBe("HARASSMENT");
    expect(currentReport.description).toBe("Bad chat demeanor");

    // 3. Issue manual ban through admin dashboard POST /admin/ban
    const banRes = await app.inject({
      method: "POST",
      url: "/admin/ban",
      headers: {
        "x-admin-secret": TEST_ADMIN_SECRET,
        "Content-Type": "application/json",
      },
      payload: {
        userId: offender.user.id,
        reason: "Explicit terms violation",
      },
    });
    expect(banRes.statusCode).toBe(200);

    // 4. Verify offender user is mutated to BANNED and sessions are revoked
    const dbUser = await prisma.user.findUnique({
      where: { id: offender.user.id },
    });
    expect(dbUser!.status).toBe("BANNED");

    const dbSessions = await prisma.session.findMany({
      where: { userId: offender.user.id },
    });
    expect(dbSessions.every((s) => s.revokedAt !== null)).toBe(true);

    // 5. Verify the ban is visible in GET /admin/bans
    const getBansRes = await app.inject({
      method: "GET",
      url: "/admin/bans",
      headers: { "x-admin-secret": TEST_ADMIN_SECRET },
    });
    expect(getBansRes.statusCode).toBe(200);
    const bansBody = JSON.parse(getBansRes.body);
    expect(bansBody.bans.length).toBeGreaterThanOrEqual(1);
    const activeBan = bansBody.bans.find((b: any) => b.user.id === offender.user.id);
    expect(activeBan).toBeDefined();
    expect(activeBan.reason).toBe("Explicit terms violation");

    // 6. Lift suspension through POST /admin/unban
    const unbanRes = await app.inject({
      method: "POST",
      url: "/admin/unban",
      headers: {
        "x-admin-secret": TEST_ADMIN_SECRET,
        "Content-Type": "application/json",
      },
      payload: {
        userId: offender.user.id,
      },
    });
    expect(unbanRes.statusCode).toBe(200);

    // 7. Verify status reverted back to ACTIVE and Ban rows deleted
    const unbannedUser = await prisma.user.findUnique({
      where: { id: offender.user.id },
    });
    expect(unbannedUser!.status).toBe("ACTIVE");

    const unbannedLogs = await prisma.ban.findMany({
      where: { userId: offender.user.id },
    });
    expect(unbannedLogs.length).toBe(0);
  });
});
