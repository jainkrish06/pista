import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import crypto from "crypto";
import { prisma, ConsentType } from "@pista/database";
import {
  hashPassword,
  verifyPassword,
  generateSessionToken,
  hashToken,
  signStatelessToken,
  verifyStatelessToken,
} from "../utils/crypto.js";
import { env } from "../config/env.js";

// Zod schemas for input validation
const RegisterSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
  displayName: z.string().min(2, "Name must be at least 2 characters long").max(50),
});

const LoginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email("Invalid email format"),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Token is required"),
  password: z.string().min(8, "Password must be at least 8 characters long"),
});

const VerifyEmailSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

const SubmitConsentSchema = z.object({
  types: z.array(z.nativeEnum(ConsentType)),
  version: z.string().min(1, "Version is required"),
});

function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie("session", token, {
    path: "/",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    signed: true,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
}

function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie("session", {
    path: "/",
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    signed: true,
    sameSite: "lax",
  });
}

export async function authRoutes(app: FastifyInstance) {
  // POST /auth/register
  app.post("/auth/register", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = RegisterSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        code: "INVALID_INPUT",
        message: parseResult.error.errors[0].message,
      });
    }

    const { email, password, displayName } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      return reply.status(400).send({
        code: "EMAIL_TAKEN",
        message: "An account with this email already exists",
      });
    }

    // Hash password and create user + profile + riskProfile in a transaction
    const passwordHash = await hashPassword(password);
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash,
          authProvider: "EMAIL",
          status: "ACTIVE",
          profile: {
            create: {
              displayName,
            },
          },
          riskProfile: {
            create: {
              ipHash: crypto.createHash("sha256").update(req.ip).digest("hex"),
            },
          },
        },
        include: {
          profile: true,
        },
      });
      return newUser;
    });

    // Create session
    const sessionToken = generateSessionToken();
    const tokenHash = hashToken(sessionToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        userAgentTag: req.headers["user-agent"] ? req.headers["user-agent"].substring(0, 100) : null,
      },
    });

    setSessionCookie(reply, sessionToken);

    // Mock Email Verification: generate stateless token and log to console
    const verifyToken = signStatelessToken({ email: normalizedEmail }, 24 * 3600); // 24 hours
    app.log.info(
      `[Verification Email Mock] User registered. Click to verify: ${env.WEB_APP_ORIGIN}/verify-email?token=${verifyToken}`
    );

    return reply.status(201).send({
      id: user.id,
      email: user.email,
      status: user.status,
      profile: user.profile,
    });
  });

  // POST /auth/login
  app.post("/auth/login", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = LoginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        code: "INVALID_INPUT",
        message: parseResult.error.errors[0].message,
      });
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { profile: true },
    });

    if (!user || !user.passwordHash || user.authProvider !== "EMAIL") {
      // Use generic message to prevent enumeration
      return reply.status(401).send({
        code: "UNAUTHENTICATED",
        message: "Invalid email or password",
      });
    }

    const isValid = await verifyPassword(password, user.passwordHash);
    if (!isValid) {
      return reply.status(401).send({
        code: "UNAUTHENTICATED",
        message: "Invalid email or password",
      });
    }

    if (user.status !== "ACTIVE") {
      return reply.status(403).send({
        code: "BANNED",
        message: "Your account has been suspended or banned",
      });
    }

    // Generate session
    const sessionToken = generateSessionToken();
    const tokenHash = hashToken(sessionToken);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

    await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        userAgentTag: req.headers["user-agent"] ? req.headers["user-agent"].substring(0, 100) : null,
      },
    });

    setSessionCookie(reply, sessionToken);

    return {
      id: user.id,
      email: user.email,
      status: user.status,
      profile: user.profile,
    };
  });

  // POST /auth/logout
  app.post(
    "/auth/logout",
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      if (req.session) {
        await prisma.session.update({
          where: { id: req.session.id },
          data: { revokedAt: new Date() },
        });
      }

      clearSessionCookie(reply);
      return { success: true };
    }
  );

  // POST /auth/forgot-password
  app.post("/auth/forgot-password", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = ForgotPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        code: "INVALID_INPUT",
        message: parseResult.error.errors[0].message,
      });
    }

    const { email } = parseResult.data;
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (user && user.passwordHash) {
      // Include current password hash in stateless token to invalidate it if password changes
      const passwordHashSig = hashToken(user.passwordHash);
      const resetToken = signStatelessToken({ email: normalizedEmail, sig: passwordHashSig }, 3600); // 1 hour

      app.log.info(
        `[Reset Password Email Mock] Request received. Click to reset: ${env.WEB_APP_ORIGIN}/reset-password?token=${resetToken}`
      );
    }

    // Always return success to prevent email enumeration
    return {
      success: true,
      message: "If an account exists with that email, a reset link has been sent.",
    };
  });

  // POST /auth/reset-password
  app.post("/auth/reset-password", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = ResetPasswordSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        code: "INVALID_INPUT",
        message: parseResult.error.errors[0].message,
      });
    }

    const { token, password } = parseResult.data;
    const payload = verifyStatelessToken(token);

    if (!payload || !payload.email || !payload.sig) {
      return reply.status(400).send({
        code: "INVALID_TOKEN",
        message: "The reset link is invalid or has expired",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (!user || !user.passwordHash) {
      return reply.status(400).send({
        code: "INVALID_TOKEN",
        message: "The reset link is invalid or has expired",
      });
    }

    // Validate if the token was generated against the current password hash
    const currentHashSig = hashToken(user.passwordHash);
    if (payload.sig !== currentHashSig) {
      return reply.status(400).send({
        code: "INVALID_TOKEN",
        message: "This reset link has already been used",
      });
    }

    const newPasswordHash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      // Update password
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash },
      });

      // Revoke all existing sessions for the user to prevent session hijacking
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return { success: true };
  });

  // POST /auth/verify-email
  app.post("/auth/verify-email", async (req: FastifyRequest, reply: FastifyReply) => {
    const parseResult = VerifyEmailSchema.safeParse(req.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        code: "INVALID_INPUT",
        message: parseResult.error.errors[0].message,
      });
    }

    const { token } = parseResult.data;
    const payload = verifyStatelessToken(token);

    if (!payload || !payload.email) {
      return reply.status(400).send({
        code: "INVALID_TOKEN",
        message: "The verification link is invalid or has expired",
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: payload.email },
    });

    if (!user) {
      return reply.status(400).send({
        code: "INVALID_TOKEN",
        message: "User not found",
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerifiedAt: new Date() },
    });

    return { success: true };
  });

  // GET /auth/me
  app.get(
    "/auth/me",
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest) => {
      const user = req.user!;
      const consents = await prisma.consent.findMany({
        where: { userId: user.id },
        select: { type: true, version: true, acceptedAt: true },
      });
      const subscription = await prisma.subscription.findUnique({
        where: { userId: user.id },
      });
      return {
        id: user.id,
        email: user.email,
        status: user.status,
        emailVerifiedAt: user.emailVerifiedAt,
        profile: user.profile,
        consents,
        subscription,
      };
    }
  );

  // POST /auth/consent
  app.post(
    "/auth/consent",
    { preHandler: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parseResult = SubmitConsentSchema.safeParse(req.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          code: "INVALID_INPUT",
          message: parseResult.error.errors[0].message,
        });
      }

      const { types, version } = parseResult.data;

      await prisma.$transaction(
        types.map((type) =>
          prisma.consent.create({
            data: {
              userId: req.user!.id,
              type,
              version,
            },
          })
        )
      );

      return { success: true };
    }
  );

  // Google OAuth Login initiation
  app.get("/auth/google", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return reply.status(400).send({
        code: "OAUTH_CONFIG_ERROR",
        message: "Google OAuth is not configured on this server.",
      });
    }

    const state = crypto.randomBytes(16).toString("hex");
    
    // Store state in signed cookie to prevent CSRF
    reply.setCookie("oauth_state", state, {
      path: "/",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      signed: true,
      maxAge: 600, // 10 minutes
      sameSite: "lax",
    });

    const redirectUri = `${env.NEXT_PUBLIC_SERVER_URL}/auth/google/callback`;
    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${
      env.GOOGLE_CLIENT_ID
    }&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=email%20profile&state=${state}`;

    return reply.redirect(googleAuthUrl);
  });

  // Google OAuth callback
  app.get("/auth/google/callback", async (req: FastifyRequest, reply: FastifyReply) => {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return reply.status(400).send({
        code: "OAUTH_CONFIG_ERROR",
        message: "Google OAuth is not configured on this server.",
      });
    }

    const { code, state } = req.query as { code?: string; state?: string };
    const stateCookie = req.cookies.oauth_state;

    if (!state || !stateCookie) {
      return reply.status(400).send({ code: "CSRF_ERROR", message: "Missing OAuth state token" });
    }

    // Verify state
    const unsignedState = req.unsignCookie(stateCookie);
    if (!unsignedState.valid || unsignedState.value !== state) {
      return reply.status(400).send({ code: "CSRF_ERROR", message: "OAuth state mismatch. CSRF protection blocked login." });
    }

    // Clear state cookie
    reply.clearCookie("oauth_state", {
      path: "/",
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      signed: true,
      sameSite: "lax",
    });

    if (!code) {
      return reply.status(400).send({ code: "INVALID_INPUT", message: "Missing authorization code" });
    }

    const redirectUri = `${env.NEXT_PUBLIC_SERVER_URL}/auth/google/callback`;

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      if (!tokenResponse.ok) {
        const errDetails = await tokenResponse.text();
        app.log.error({ errDetails }, "Google code exchange failed");
        return reply.redirect(`${env.WEB_APP_ORIGIN}/login?error=oauth_exchange_failed`);
      }

      const tokens = (await tokenResponse.json()) as { access_token: string };

      // Fetch user profile from Google
      const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userInfoResponse.ok) {
        return reply.redirect(`${env.WEB_APP_ORIGIN}/login?error=oauth_user_info_failed`);
      }

      const userInfo = (await userInfoResponse.json()) as {
        email: string;
        name?: string;
        email_verified?: boolean;
      };

      if (!userInfo.email) {
        return reply.redirect(`${env.WEB_APP_ORIGIN}/login?error=oauth_email_missing`);
      }

      const email = userInfo.email.toLowerCase().trim();
      const displayName = userInfo.name || email.split("@")[0];

      // Upsert Google user
      const user = await prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { email },
          include: { profile: true },
        });

        if (existing) {
          if (existing.status !== "ACTIVE") {
            throw new Error("USER_SUSPENDED");
          }
          // Mark email as verified if Google verified it
          if (!existing.emailVerifiedAt && userInfo.email_verified) {
            await tx.user.update({
              where: { id: existing.id },
              data: { emailVerifiedAt: new Date() },
            });
          }
          return existing;
        }

        // Create new user for Google login
        return tx.user.create({
          data: {
            email,
            authProvider: "GOOGLE",
            status: "ACTIVE",
            emailVerifiedAt: userInfo.email_verified ? new Date() : null,
            profile: {
              create: {
                displayName,
              },
            },
            riskProfile: {
              create: {
                ipHash: crypto.createHash("sha256").update(req.ip).digest("hex"),
              },
            },
          },
          include: {
            profile: true,
          },
        });
      });

      // Create session
      const sessionToken = generateSessionToken();
      const tokenHash = hashToken(sessionToken);
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

      await prisma.session.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          userAgentTag: req.headers["user-agent"] ? req.headers["user-agent"].substring(0, 100) : null,
        },
      });

      setSessionCookie(reply, sessionToken);

      // Redirect user to the web app
      return reply.redirect(env.WEB_APP_ORIGIN);
    } catch (err: any) {
      if (err.message === "USER_SUSPENDED") {
        return reply.redirect(`${env.WEB_APP_ORIGIN}/login?error=account_suspended`);
      }
      app.log.error(err, "Google OAuth callback error");
      return reply.redirect(`${env.WEB_APP_ORIGIN}/login?error=oauth_internal_error`);
    }
  });
}
