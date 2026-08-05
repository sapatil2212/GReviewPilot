/**
 * GET|POST /api/cron/auto-sync
 *
 * Scheduled Google auto-sync entry point. Intended to be called by an
 * external scheduler (Vercel Cron, GitHub Actions, Windows Task
 * Scheduler, cron, etc.).
 *
 * AUTH: requires `Authorization: Bearer <CRON_SECRET>`. When CRON_SECRET
 * is not configured the route returns 503 and does nothing, so an
 * unconfigured deployment can never be triggered anonymously.
 *
 * Query params:
 *   force=true      — ignore the staleness interval and sync every account
 *   tenantId=<cuid> — limit the run to a single tenant
 */

import type { NextRequest } from "next/server";
import { runAutoSync } from "@/server/services/autoSync.service";
import { cronEnabled, env } from "@/server/utils/env";
import { handleError, ok, fail } from "@/server/utils/response";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Constant-time-ish comparison to avoid trivially leaking the secret. */
function secretMatches(provided: string, expected: string): boolean {
  if (provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < provided.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

function authorize(req: NextRequest): boolean {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  // Vercel Cron sends the secret in the Authorization header too.
  return bearer.length > 0 && secretMatches(bearer, env.CRON_SECRET);
}

async function handle(req: NextRequest) {
  try {
    if (!cronEnabled) {
      return fail(
        "SERVICE_UNAVAILABLE",
        "Scheduled sync is not configured. Set CRON_SECRET to enable it.",
        { status: 503 },
      );
    }
    if (!authorize(req)) {
      logger.warn("Rejected unauthorized cron call", {
        path: "/api/cron/auto-sync",
      });
      return fail("UNAUTHENTICATED", "Invalid or missing cron credentials", {
        status: 401,
      });
    }

    const url = new URL(req.url);
    const force = url.searchParams.get("force") === "true";
    const tenantId = url.searchParams.get("tenantId") ?? undefined;

    const report = await runAutoSync({ force, tenantId });
    return ok(report, {
      message: `Auto-sync: ${report.synced} synced, ${report.skipped} skipped, ${report.failed} failed`,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
