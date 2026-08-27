/**
 * GET|POST /api/cron/google-sync-worker
 *
 * Claims and processes queued Google sync jobs under rate limits.
 * AUTH: Authorization: Bearer <CRON_SECRET>
 */

import type { NextRequest } from "next/server";
import { runGoogleSyncWorker } from "@/server/google/sync/worker";
import { env, cronEnabled } from "@/server/utils/env";
import { handleError, ok, fail } from "@/server/utils/response";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function authorized(req: NextRequest): boolean {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  return bearer.length > 0 && secretMatches(bearer, env.CRON_SECRET);
}

async function run(req: NextRequest) {
  if (!cronEnabled) {
    return fail(
      "SERVICE_UNAVAILABLE",
      "Scheduled jobs are not configured. Set CRON_SECRET to enable them.",
      { status: 503 },
    );
  }
  if (!authorized(req)) {
    logger.warn("Rejected unauthorized cron call", {
      path: "/api/cron/google-sync-worker",
    });
    return fail("UNAUTHENTICATED", "Invalid or missing cron credentials", {
      status: 401,
    });
  }
  const report = await runGoogleSyncWorker();
  return ok(report, { message: "Google sync worker tick complete" });
}

export async function GET(req: NextRequest) {
  try {
    return await run(req);
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    return await run(req);
  } catch (err) {
    return handleError(err);
  }
}
