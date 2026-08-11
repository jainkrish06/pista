import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@pista/database";
import { buildApp } from "../index.js";
import { signStatelessToken, hashToken } from "../utils/crypto.js";

describe("Authentication Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    // Force test environment config
    process.env.NODE_ENV = "test";
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
    // Clean up test users
    await prisma.user.deleteMany({
      where: {
        email: {
          startsWith: "test-auth-",
        },
      },
    });
  });

  it("should successfully register a new user", async () => {
    const email = `test-auth-register-${Date.now()}@example.com`;
    const payload = {
      email,
      password: "password123",
      displayName: "Test User",
    };

    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload,
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty("id");
    expect(body.email).toBe(email);
    expect(body.profile.displayName).toBe("Test User");

    // Cookie checks
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : cookies;
    expect(cookieHeader).toContain("session=");
  });

  it("should fail registration with invalid input", async () => {
    const payload = {
      email: "invalid-email",
      password: "short",
      displayName: "",
    };

    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload,
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.code).toBe("INVALID_INPUT");
  });

  it("should successfully login an existing user", async () => {
    const email = `test-auth-login-${Date.now()}@example.com`;
    // Pre-register the user
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email,
        password: "password123",
        displayName: "Login User",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email,
        password: "password123",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe(email);

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
  });

  it("should fail login with incorrect password", async () => {
    const email = `test-auth-login-fail-${Date.now()}@example.com`;
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email,
        password: "password123",
        displayName: "Fail Login User",
      },
    });

    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email,
        password: "wrongpassword",
      },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.message).toBe("Invalid email or password");
  });

  it("should successfully logout a user and revoke session", async () => {
    const email = `test-auth-logout-${Date.now()}@example.com`;
    const regRes = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email,
        password: "password123",
        displayName: "Logout User",
      },
    });

    const cookies = regRes.headers["set-cookie"];
    const cookieHeader = Array.isArray(cookies) ? cookies[0] : cookies;
    // Extract raw session cookie (e.g. session=xxx)
    const sessionCookie = cookieHeader!.split(";")[0];

    const logoutRes = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(logoutRes.statusCode).toBe(200);
    const logoutBody = JSON.parse(logoutRes.body);
    expect(logoutBody.success).toBe(true);

    // Verify session is revoked in database
    const dbSessions = await prisma.session.findMany({
      where: {
        user: { email },
      },
    });
    // The session should be marked as revoked
    expect(dbSessions.some((s) => s.revokedAt !== null)).toBe(true);
  });

  it("should handle forgot password and reset password successfully", async () => {
    const email = `test-auth-reset-${Date.now()}@example.com`;
    await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        email,
        password: "oldpassword123",
        displayName: "Reset User",
      },
    });

    // Forgot password request
    const forgotRes = await app.inject({
      method: "POST",
      url: "/auth/forgot-password",
      payload: { email },
    });
    expect(forgotRes.statusCode).toBe(200);
    expect(JSON.parse(forgotRes.body).success).toBe(true);

    // Retrieve the user from DB to sign a mock token
    const user = await prisma.user.findUnique({ where: { email } });
    const passwordHashSig = hashToken(user!.passwordHash!);
    const resetToken = signStatelessToken({ email, sig: passwordHashSig }, 3600);

    // Reset password request
    const resetRes = await app.inject({
      method: "POST",
      url: "/auth/reset-password",
      payload: {
        token: resetToken,
        password: "newpassword123",
      },
    });
    expect(resetRes.statusCode).toBe(200);
    expect(JSON.parse(resetRes.body).success).toBe(true);

    // Try logging in with the old password (should fail)
    const loginFailRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email,
        password: "oldpassword123",
      },
    });
    expect(loginFailRes.statusCode).toBe(401);

    // Try logging in with the new password (should succeed)
    const loginSucceedRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: {
        email,
        password: "newpassword123",
      },
    });
    expect(loginSucceedRes.statusCode).toBe(200);
  });
});
