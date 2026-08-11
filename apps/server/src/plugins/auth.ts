import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { prisma } from "@pista/database";
import { hashToken } from "../utils/crypto.js";

export default fp(async function authPlugin(app: FastifyInstance) {
  app.decorate("authenticate", async function (req: FastifyRequest, reply: FastifyReply) {
    const sessionCookie = req.cookies.session;
    if (!sessionCookie) {
      return reply.status(401).send({ code: "UNAUTHENTICATED", message: "No session found" });
    }

    // Verify the signed cookie. Fastify-cookie automatically registers unsignCookie.
    const unsigned = req.unsignCookie(sessionCookie);
    if (!unsigned.valid || !unsigned.value) {
      return reply.status(401).send({ code: "UNAUTHENTICATED", message: "Invalid session cookie" });
    }

    const token = unsigned.value;
    const tokenHash = hashToken(token);

    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            profile: true,
          },
        },
      },
    });

    if (!session) {
      return reply.status(401).send({ code: "UNAUTHENTICATED", message: "Session not found" });
    }

    if (session.revokedAt) {
      return reply.status(401).send({ code: "UNAUTHENTICATED", message: "Session has been revoked" });
    }

    if (session.expiresAt < new Date()) {
      return reply.status(401).send({ code: "UNAUTHENTICATED", message: "Session has expired" });
    }

    if (session.user.status !== "ACTIVE") {
      return reply.status(403).send({ code: "BANNED", message: "User account is suspended or banned" });
    }

    // Attach user and session to the request
    req.session = session;
    req.user = session.user;
  });
});

// Add TypeScript declaration so TypeScript knows authenticate is a property on FastifyInstance.
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
