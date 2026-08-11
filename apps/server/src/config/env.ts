import "dotenv/config";
import { z } from "zod";

// Server never trusts unvalidated environment input. Fail fast on boot
// rather than surfacing confusing errors deep in request handling.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().optional(), // optional: falls back to in-memory queue in dev

  NEXTAUTH_SECRET: z.string().min(16, "NEXTAUTH_SECRET must be a strong secret"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  TURN_SERVER_URL: z.string().optional(),
  TURN_USERNAME: z.string().optional(),
  TURN_PASSWORD: z.string().optional(),

  ADMIN_SECRET: z.string().min(16, "ADMIN_SECRET must be a strong secret"),

  WEB_APP_ORIGIN: z.string().default("http://localhost:3000"),
  NEXT_PUBLIC_SERVER_URL: z.string().default("http://localhost:4000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("❌ Invalid environment configuration:");
  // eslint-disable-next-line no-console
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
