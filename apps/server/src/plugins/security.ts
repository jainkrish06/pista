import type { FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import cookie from "@fastify/cookie";
import { env } from "../config/env.js";

// Baseline security posture applied to every request. Feature-specific
// rate limits (matchmaking, reports, chat) are layered on top in later
// phases; this establishes sane global defaults.
export async function registerSecurityPlugins(app: FastifyInstance) {
  await app.register(helmet, {
    // Video/WebRTC pages need a slightly relaxed CSP for media; tightened
    // further once the frontend's actual asset origins are finalized.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", env.WEB_APP_ORIGIN],
        mediaSrc: ["'self'", "blob:"],
        objectSrc: ["'none'"],
      },
    },
  });

  await app.register(cors, {
    origin: env.WEB_APP_ORIGIN,
    credentials: true,
  });

  await app.register(cookie, {
    secret: env.NEXTAUTH_SECRET,
    hook: "onRequest",
  });

  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
  });

  app.addHook("onSend", async (_req, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Frame-Options", "DENY");
  });
}
