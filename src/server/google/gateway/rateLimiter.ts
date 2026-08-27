/**
 * MySQL-backed token-bucket rate limiter for Google APIs.
 *
 * Supports multi-instance deployments via row-level updates.
 * Interface is swappable for Redis later.
 */

import { prisma } from "@/server/db/prisma";
import { env } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";
import type { GoogleApiName } from "./types";

export interface AcquireResult {
  granted: boolean;
  waitMs: number;
  remaining: number;
}

function qpmForApi(apiName: GoogleApiName): number {
  switch (apiName) {
    case "ACCOUNT_MANAGEMENT":
      return env.GOOGLE_ACCOUNT_API_QPM;
    case "BUSINESS_INFORMATION":
      return env.GOOGLE_BUSINESS_API_QPM;
    case "REVIEWS":
      return env.GOOGLE_REVIEW_API_QPM;
    case "PERFORMANCE":
      return env.GOOGLE_PERFORMANCE_API_QPM;
    case "PLACES":
      return env.GOOGLE_REVIEW_API_QPM;
    case "OAUTH":
    case "USERINFO":
      return 120;
    default:
      return 60;
  }
}

/** In-process concurrency gate (per Node process). */
const inFlight = new Map<string, number>();
const waiters: Array<() => void> = [];

function concurrencyKey(apiName: GoogleApiName): string {
  return `conc:${apiName}`;
}

async function acquireConcurrency(apiName: GoogleApiName): Promise<void> {
  const key = concurrencyKey(apiName);
  const max = env.GOOGLE_MAX_CONCURRENT_REQUESTS;
  for (;;) {
    const current = inFlight.get(key) ?? 0;
    if (current < max) {
      inFlight.set(key, current + 1);
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
  }
}

function releaseConcurrency(apiName: GoogleApiName): void {
  const key = concurrencyKey(apiName);
  const current = inFlight.get(key) ?? 1;
  inFlight.set(key, Math.max(0, current - 1));
  const next = waiters.shift();
  if (next) next();
}

/**
 * Ensure a bucket row exists and refill tokens based on elapsed time.
 * Consumes 1 token when available.
 */
export async function acquireQuotaToken(
  apiName: GoogleApiName,
  projectKey = "default",
): Promise<AcquireResult> {
  // OAuth / userinfo: light in-memory pacing only.
  if (apiName === "OAUTH" || apiName === "USERINFO") {
    return { granted: true, waitMs: 0, remaining: 999 };
  }

  const qpm = qpmForApi(apiName);
  const capacity = qpm;
  const refillPerSec = qpm / 60;

  try {
    // Upsert bucket, then try to consume under a transaction.
    await prisma.googleApiQuotaBucket.upsert({
      where: { apiName_projectKey: { apiName, projectKey } },
      create: {
        apiName,
        projectKey,
        tokens: capacity - 1,
        capacity,
        refillPerSec,
      },
      update: {},
    });

    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          tokens: number;
          capacity: number;
          refillPerSec: number;
          updatedAt: Date;
        }>
      >`
        SELECT id, tokens, capacity, refillPerSec, updatedAt
        FROM GoogleApiQuotaBucket
        WHERE apiName = ${apiName} AND projectKey = ${projectKey}
        FOR UPDATE
      `;

      const row = rows[0];
      if (!row) {
        return { granted: true, waitMs: 0, remaining: capacity } satisfies AcquireResult;
      }

      const now = Date.now();
      const elapsedSec = Math.max(
        0,
        (now - new Date(row.updatedAt).getTime()) / 1000,
      );
      let tokens = Math.min(
        row.capacity,
        Number(row.tokens) + elapsedSec * Number(row.refillPerSec),
      );

      // Keep capacity/refill in sync with env (admin may change knobs).
      const cap = capacity;
      const refill = refillPerSec;
      tokens = Math.min(cap, tokens);

      if (tokens < 1) {
        const deficit = 1 - tokens;
        const waitMs = Math.ceil((deficit / refill) * 1000);
        await tx.googleApiQuotaBucket.update({
          where: { id: row.id },
          data: {
            tokens,
            capacity: cap,
            refillPerSec: refill,
            updatedAt: new Date(now),
          },
        });
        return { granted: false, waitMs, remaining: tokens } satisfies AcquireResult;
      }

      tokens -= 1;
      await tx.googleApiQuotaBucket.update({
        where: { id: row.id },
        data: {
          tokens,
          capacity: cap,
          refillPerSec: refill,
          updatedAt: new Date(now),
        },
      });
      return { granted: true, waitMs: 0, remaining: tokens } satisfies AcquireResult;
    });

    return result;
  } catch (err) {
    // If the table isn't migrated yet or DB is down, fail open with a
    // conservative local delay so we don't block all Google traffic forever.
    logger.warn("Quota bucket acquire failed — using local pacing fallback", {
      apiName,
      err: err instanceof Error ? err.message : String(err),
    });
    const waitMs = Math.ceil(60_000 / Math.max(1, qpm));
    await sleep(waitMs);
    return { granted: true, waitMs, remaining: 0 };
  }
}

export async function withGoogleRateLimit<T>(
  apiName: GoogleApiName,
  fn: () => Promise<T>,
): Promise<T> {
  await acquireConcurrency(apiName);
  try {
    // Wait until a token is available (bounded spin).
    for (let i = 0; i < 60; i++) {
      const acquired = await acquireQuotaToken(apiName);
      if (acquired.granted) {
        return await fn();
      }
      await sleep(Math.min(acquired.waitMs || 1000, 5000));
    }
    // Last attempt — proceed after max wait to avoid deadlock.
    await acquireQuotaToken(apiName);
    return await fn();
  } finally {
    releaseConcurrency(apiName);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Test helper — reset in-process concurrency. */
export function __resetConcurrencyForTests(): void {
  inFlight.clear();
  waiters.length = 0;
}
