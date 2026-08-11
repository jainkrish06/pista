/**
 * Dev-only seed script: creates a single local admin account so you can
 * log into /admin without manually inserting rows.
 *
 * Run with: npm run seed --workspace=packages/database
 *
 * The password is read from SEED_ADMIN_PASSWORD so no credential is
 * hardcoded in source. If unset, a random one is generated and printed
 * once - it is not stored anywhere else.
 */
import { randomBytes } from "node:crypto";
import argon2 from "argon2";
import { prisma } from "../src/index.js";

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@pista.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(12).toString("base64url");

  const passwordHash = await argon2.hash(password);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    update: {},
    create: {
      email,
      passwordHash,
      role: "SUPER_ADMIN",
    },
  });

  console.log("Seeded admin account:");
  console.log(`  email:    ${admin.email}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.log(`  password: ${password}  (generated - save this, it will not be shown again)`);
  } else {
    console.log("  password: (from SEED_ADMIN_PASSWORD)");
  }
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
