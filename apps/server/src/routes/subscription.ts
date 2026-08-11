import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma, SubscriptionPlan, SubscriptionStatus } from "@pista/database";

export async function subscriptionRoutes(app: FastifyInstance) {
  // Upgrade current user to Premium plan (Simulated checkout)
  app.post(
    "/subscription/upgrade",
    { preValidation: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = req.user!.id;

      const sub = await prisma.subscription.upsert({
        where: { userId },
        update: {
          plan: SubscriptionPlan.PREMIUM,
          status: SubscriptionStatus.ACTIVE,
          updatedAt: new Date(),
        },
        create: {
          userId,
          plan: SubscriptionPlan.PREMIUM,
          status: SubscriptionStatus.ACTIVE,
        },
      });

      return reply.send({ success: true, subscription: sub });
    }
  );

  // Downgrade current user to Free plan / expire premium
  app.post(
    "/subscription/cancel",
    { preValidation: [app.authenticate] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const userId = req.user!.id;

      const sub = await prisma.subscription.upsert({
        where: { userId },
        update: {
          plan: SubscriptionPlan.FREE,
          status: SubscriptionStatus.EXPIRED,
          updatedAt: new Date(),
        },
        create: {
          userId,
          plan: SubscriptionPlan.FREE,
          status: SubscriptionStatus.EXPIRED,
        },
      });

      return reply.send({ success: true, subscription: sub });
    }
  );
}
