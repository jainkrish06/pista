import type { FastifyInstance } from "fastify";
import { prisma } from "@pista/database";

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    return { status: "ok", service: "pista-server", timestamp: new Date().toISOString() };
  });

  app.get("/health/db", async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: "ok", database: "connected" };
    } catch (err) {
      app.log.error(err, "database health check failed");
      // Never leak internal error details to the client.
      return reply.status(503).send({ status: "error", database: "unavailable" });
    }
  });
}
