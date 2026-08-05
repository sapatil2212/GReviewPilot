/**
 * In-memory sliding-window rate limiter.
 *
 * Sufficient for a single Node process. Behind an interface so we can
 * swap in @upstash/ratelimit (or similar) for multi-instance deployments
 * without touching call sites.
 */

import { RateLimitError } from "@/server/utils/errors";

interface Window {
  hits: number[];
}

const buckets = new Map<string, Window>();

// Periodic cleanup so the map doesn't grow unbounded.
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, w] of buckets) {
      const anyRecent = w.hits.some((t) => now - t < 60 * 60 * 1000);
      if (!anyRecent) buckets.delete(key);
    }
  }, 5 * 60 * 1000).unref?.();
}

export interface RateLimitOptions {
  /** Bucket key — e.g. `"login:ip=1.2.3.4"`. */
  key: string;
  /** Max requests permitted within `windowMs`. */
  max: number;
  /** Window duration in ms. */
  windowMs: number;
}

export interface RateLimitResult {
  remaining: number;
  resetInMs: number;
}

export function checkRateLimit(opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  const cutoff = now - opts.windowMs;
  const bucket = buckets.get(opts.key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => t >= cutoff);
  if (bucket.hits.length >= opts.max) {
    const oldest = bucket.hits[0]!;
    const resetInMs = oldest + opts.windowMs - now;
    throw new RateLimitError(
      "Too many requests. Please try again later.",
      Math.max(1, Math.ceil(resetInMs / 1000)),
    );
  }
  bucket.hits.push(now);
  buckets.set(opts.key, bucket);
  return { remaining: opts.max - bucket.hits.length, resetInMs: opts.windowMs };
}

/**
 * Convenience factory — returns a function bound to a preset window/max.
 * The caller supplies the discriminator (usually IP or email).
 */
export function makeLimiter(name: string, max: number, windowMs: number) {
  return (discriminator: string): RateLimitResult =>
    checkRateLimit({ key: `${name}:${discriminator}`, max, windowMs });
}

// Preset limiters used across auth endpoints.
export const limiters = {
  login: makeLimiter("login", 5, 15 * 60 * 1000), // 5 per 15 min
  signup: makeLimiter("signup", 3, 60 * 60 * 1000), // 3 per hour
  forgotPassword: makeLimiter("forgot", 3, 60 * 60 * 1000),
  resendVerification: makeLimiter("resend-verify", 3, 60 * 60 * 1000),
  resetPassword: makeLimiter("reset", 5, 60 * 60 * 1000),
};

/** Best-effort caller identifier — IP if present, else a shared bucket. */
export function callerKey(req: Request | Headers, extra?: string): string {
  const h = req instanceof Headers ? req : req.headers;
  const ip =
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    (h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null) ||
    "anon";
  return extra ? `${ip}|${extra}` : ip;
}
