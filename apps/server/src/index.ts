import Fastify from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { env } from "./config/env.js";
import { registerSecurityPlugins } from "./plugins/security.js";
import authPlugin from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { prisma } from "@pista/database";
import { hashToken } from "./utils/crypto.js";
import { registerMatchmakingHandlers } from "./routes/matchmaking.js";
import { moderationRoutes } from "./routes/moderation.js";
import { subscriptionRoutes } from "./routes/subscription.js";
import { adminRoutes } from "./routes/admin.js";

function parseCookies(cookieHeader: string): Record<string, string> {
  const list: Record<string, string> = {};
  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    list[parts.shift()!.trim()] = decodeURIComponent(parts.join("="));
  });
  return list;
}

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : (env.NODE_ENV === "production" ? "info" : "debug"),
      // Redact anything that could contain credentials/tokens.
      redact: ["req.headers.authorization", "req.headers.cookie"],
    },
    trustProxy: true,
    bodyLimit: 1024 * 100, // 100kb - generous for JSON API bodies, prevents abuse
  });

  await registerSecurityPlugins(app);
  await app.register(authPlugin);
  await app.register(authRoutes);
  await app.register(healthRoutes);
  await app.register(moderationRoutes);
  await app.register(subscriptionRoutes);
  await app.register(adminRoutes);

  // Socket.IO is attached to the same HTTP server so we don't need a
  // separate process/port for real-time signaling + chat + matchmaking.
  const io = new SocketIOServer(app.server, {
    cors: {
      origin: env.WEB_APP_ORIGIN,
      credentials: true,
    },
    maxHttpBufferSize: 1e5,
  });

  app.decorate("io", io);

  // Socket.IO authentication middleware
  io.use(async (socket, next) => {
    const cookieHeader = socket.request.headers.cookie;
    if (!cookieHeader) {
      return next(new Error("UNAUTHENTICATED"));
    }

    const cookies = parseCookies(cookieHeader);
    const sessionCookie = cookies["session"];
    if (!sessionCookie) {
      return next(new Error("UNAUTHENTICATED"));
    }

    // Verify Fastify signed cookie
    const unsigned = app.unsignCookie(sessionCookie);
    if (!unsigned.valid || !unsigned.value) {
      return next(new Error("UNAUTHENTICATED"));
    }

    try {
      const tokenHash = hashToken(unsigned.value);
      const session = await prisma.session.findUnique({
        where: { tokenHash },
        include: {
          user: {
            include: {
              consents: true,
            },
          },
        },
      });

      if (!session || session.revokedAt || session.expiresAt < new Date()) {
        return next(new Error("UNAUTHENTICATED"));
      }

      if (session.user.status !== "ACTIVE") {
        return next(new Error("BANNED"));
      }

      // Verify user has accepted all mandatory 18+ age gate consents
      const required = ["AGE_CONFIRMATION", "TERMS_OF_SERVICE", "PRIVACY_POLICY", "COMMUNITY_GUIDELINES"];
      const hasAllConsents = required.every((reqType) =>
        session.user.consents.some((c) => c.type === reqType)
      );

      if (!hasAllConsents) {
        return next(new Error("CONSENT_REQUIRED"));
      }

      // Store authenticated credentials in socket data
      socket.data = {
        userId: session.user.id,
        sessionId: session.id,
        queueTimeout: null,
        isSearching: false,
      };

      next();
    } catch (err) {
      app.log.error(err, "Socket.IO authentication middleware error");
      return next(new Error("INTERNAL_ERROR"));
    }
  });

  io.on("connection", (socket) => {
    app.log.info({ socketId: socket.id, userId: socket.data.userId }, "socket authenticated & connected");
    registerMatchmakingHandlers(io, socket);
  });

  return app;
}

if (process.env.NODE_ENV !== "test") {
  buildApp()
    .then(async (app) => {
      await app.listen({ port: env.PORT, host: "0.0.0.0" });
      app.log.info(`PISTA server listening on port ${env.PORT}`);
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error("Fatal startup error:", err);
      process.exit(1);
    });
}
