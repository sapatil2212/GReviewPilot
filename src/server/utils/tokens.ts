/**
 * Opaque token generation utilities.
 *
 * All tokens issued to users (email verification, password reset,
 * session jti) are 256 bits of CSPRNG randomness, encoded as
 * URL-safe base64. Only the SHA-256 digest is stored server-side;
 * the raw token is delivered exactly once (email link) and never
 * persisted after that.
 */

import { randomBytes } from "node:crypto";
import { sha256 } from "./hash";

const DEFAULT_BYTES = 32; // 256 bits

/**
 * Generate a raw, URL-safe token and its SHA-256 digest.
 * Store the digest, send the raw value to the user.
 */
export function generateToken(bytes = DEFAULT_BYTES): { raw: string; hash: string } {
  const raw = randomBytes(bytes).toString("base64url");
  return { raw, hash: sha256(raw) };
}

/**
 * Constant-time helper (via hash equality) to compare a user-supplied
 * token against a stored digest.
 */
export function isTokenMatch(rawFromUser: string, storedHash: string): boolean {
  return sha256(rawFromUser) === storedHash;
}

/**
 * Slugify a business name into a URL-safe tenant slug. Not guaranteed
 * unique — the tenant service appends a short random suffix if needed.
 */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "workspace";
}
