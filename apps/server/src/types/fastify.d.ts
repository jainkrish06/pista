import type { Session, User, Profile } from "@pista/database";

declare module "fastify" {
  interface FastifyRequest {
    session?: Session;
    user?: User & { profile: Profile | null };
  }
}
