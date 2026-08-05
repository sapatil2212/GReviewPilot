/**
 * Cryptographic hash utilities.
 *
 * - Passwords: Argon2id via @node-rs/argon2 (native, no gyp).
 * - Opaque tokens (verify, reset, session jti): SHA-256 (fast,
 *   deterministic; we store only the digest, never the raw token).
 */

import { hash as argonHash, verify as argonVerify } from "@node-rs/argon2";
import { createHash } from "node:crypto";

// OWASP-recommended Argon2id parameters for interactive login.
// Memory 64 MiB, time cost 3, parallelism 1. Tune upward as hardware
// improves. Anything below this is unacceptable for production auth.
// Algorithm enum value 2 = Argon2id (from @node-rs/argon2). We use the
// numeric constant directly because the exported `Algorithm` enum is
// an ambient const enum which conflicts with Next's isolatedModules.
const ARGON_ID = 2 as const;
const ARGON_OPTIONS = {
  algorithm: ARGON_ID,
  memoryCost: 65_536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
} as const;

/**
 * Hash a plaintext password. Never store the plaintext.
 */
export async function hashPassword(plain: string): Promise<string> {
  return argonHash(plain, ARGON_OPTIONS);
}

/**
 * Constant-time password verification.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argonVerify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * SHA-256 digest, hex-encoded.
 * Used for opaque token comparison (verification, password reset,
 * session jti) so the raw token never sits at rest.
 */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * A pre-computed Argon2 hash of a random string, used as a decoy for
 * "user not found" login paths to keep response time constant and
 * defeat email enumeration via timing.
 */
export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$c29tZXNhbHR2YWx1ZQ$RvL3Cfrri8kJk4TX3HhX0oQ6Ov2f0jvFcTQKz+bXk9Q";
