/**
 * Symmetric encryption for at-rest sensitive values (Google OAuth
 * access/refresh tokens, third-party API keys, etc.).
 *
 * Algorithm: AES-256-GCM.
 * Key: 32 bytes, either from ENCRYPTION_KEY env (hex or base64) or
 * derived from AUTH_SECRET via HKDF-SHA256. Rotating AUTH_SECRET
 * invalidates existing ciphertexts, which is intentional.
 *
 * Format: `${iv_b64}:${tag_b64}:${ciphertext_b64}` — three colon-
 * separated base64 chunks. Compact enough to store in a TEXT column
 * without hitting size limits.
 */

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "./env";

const KEY_LENGTH = 32; // 256 bits for AES-256
const IV_LENGTH = 12; // 96-bit IV is the GCM standard
const TAG_LENGTH = 16;

let cachedKey: Buffer | null = null;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = env.ENCRYPTION_KEY.trim();
  if (raw) {
    // Accept 64-char hex, 44-char base64, or 32-char raw.
    let bytes: Buffer;
    if (/^[0-9a-f]{64}$/i.test(raw)) {
      bytes = Buffer.from(raw, "hex");
    } else if (raw.length === 44 || raw.length === 43) {
      bytes = Buffer.from(raw, "base64");
    } else {
      bytes = Buffer.from(raw, "utf8");
    }
    if (bytes.length < KEY_LENGTH) {
      throw new Error(
        "ENCRYPTION_KEY must decode to at least 32 bytes. Provide a 64-char hex string, 32-byte base64, or omit it entirely to derive from AUTH_SECRET.",
      );
    }
    cachedKey = bytes.subarray(0, KEY_LENGTH);
    return cachedKey;
  }

  // Derive from AUTH_SECRET via HKDF.
  const ikm = Buffer.from(env.AUTH_SECRET, "utf8");
  const salt = Buffer.from("greviewpilot:crypto:v1", "utf8");
  const info = Buffer.from("aes-256-gcm", "utf8");
  cachedKey = Buffer.from(hkdfSync("sha256", ikm, salt, info, KEY_LENGTH));
  return cachedKey;
}

/**
 * Encrypt UTF-8 plaintext. Returns the compact string form.
 */
export function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/**
 * Decrypt a value produced by `encrypt`. Throws on malformed input or
 * failed auth-tag verification (never returns partial plaintext).
 */
export function decrypt(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed ciphertext payload");
  }
  const key = deriveKey();
  const iv = Buffer.from(parts[0]!, "base64");
  const tag = Buffer.from(parts[1]!, "base64");
  const ciphertext = Buffer.from(parts[2]!, "base64");
  if (iv.length !== IV_LENGTH) throw new Error("Bad IV length");
  if (tag.length !== TAG_LENGTH) throw new Error("Bad auth tag length");

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}

// ---------- HMAC-signed compact strings (for OAuth state, etc.) ----------

/**
 * Sign an arbitrary JSON-serialisable payload with HMAC-SHA256 keyed
 * by AUTH_SECRET. Format: base64url(JSON).base64url(sig). Used for
 * OAuth state parameters where we need to bind the callback to the
 * initiating tenant/user without a server-side session cache.
 */
export function signPayload<T>(payload: T): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const sig = macBase64Url(body);
  return `${body}.${sig}`;
}

export function verifySignedPayload<T>(token: string): T | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = macBase64Url(body);
  const a = Buffer.from(sig, "base64url");
  const b = Buffer.from(expected, "base64url");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function macBase64Url(input: string): string {
  const key = deriveKey();
  return createHmac("sha256", key).update(input, "utf8").digest("base64url");
}
