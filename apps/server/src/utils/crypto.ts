import argon2 from "argon2";
import crypto from "crypto";
import { env } from "../config/env.js";

/**
 * Hashes a plaintext password using Argon2id.
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536, // 64 MB (standard secure default)
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch (err) {
    return false;
  }
}

/**
 * Generates a cryptographically secure random session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Computes a SHA-256 hash of a session token for storage.
 * This ensures that if the database is leaked, raw session tokens are not compromised.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Signs a stateless payload (e.g. for email verification or password reset) using HMAC-SHA256.
 */
export function signStatelessToken(payload: Record<string, any>, expiresInSeconds: number): string {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const data = JSON.stringify({ ...payload, exp: expiresAt });
  const dataB64 = Buffer.from(data).toString("base64url");
  const signature = crypto
    .createHmac("sha256", env.NEXTAUTH_SECRET)
    .update(dataB64)
    .digest("base64url");
  return `${dataB64}.${signature}`;
}

/**
 * Verifies and decodes a stateless token. Returns null if invalid or expired.
 */
export function verifyStatelessToken(token: string): Record<string, any> | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [dataB64, signature] = parts;
  
  const expectedSignature = crypto
    .createHmac("sha256", env.NEXTAUTH_SECRET)
    .update(dataB64)
    .digest("base64url");
    
  if (signature !== expectedSignature) return null;

  try {
    const data = JSON.parse(Buffer.from(dataB64, "base64url").toString("utf8"));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return data;
  } catch {
    return null;
  }
}
