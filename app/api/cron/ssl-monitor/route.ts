/**
 * GET|POST /api/cron/ssl-monitor
 *
 * Re-checks the live certificate on every connected custom domain, advancing
 * sslStatus and flagging certificates that are expiring or already broken.
 *
 * Without a scheduled run, certificate state is only ever observed when a user
 * happens to press Verify — so issuance completing a few minutes after DNS
 * resolves is never noticed, and a renewal that stops working is discovered by
 * visitors rather than by us. Recommended cadence is hourly; runs are cheap and
 * idempotent.
 *
 * AUTH: requires `Authorization: Bearer <CRON_SECRET>`, matching
 * /api/cron/auto-sync. With CRON_SECRET unset the route returns 503 rather than
 * running anonymously.
 *
 * Query params:
 *   siteId=<cuid>       — limit to one site
 *   hostname=<host>     — check a single domain, useful when debugging
 */

import type { NextRequest } from "next/server";
import { runSslMonitor } from "@/server/services/sslMonitor.service";
import { cronEnabled, env } from "@/server/utils/env";
import { handleError, ok, fail } from "@/server/utils/response";
import { logger } from "@/server/utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// TLS handshakes across many domains are slow even batched; the default
// serverless timeout would cut a large tenant base off mid-run.
export const maxDuration = 300;

/** Length-then-XOR compare so the secret is not trivially leaked by timing. */
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
  return bearer.length > 0 && secretMatches(bearer, env.CRON_SECRET);
}

async function handle(req: NextRequest) {
  try {
    if (!cronEnabled) {
      return fail(
        "SERVICE_UNAVAILABLE",
        "Scheduled jobs are not configured. Set CRON_SECRET to enable them.",
        { status: 503 },
      );
    }
    if (!authorize(req)) {
      logger.warn("Rejected unauthorized cron call", { path: "/api/cron/ssl-monitor" });
      return fail("UNAUTHENTICATED", "Invalid or missing cron credentials", { status: 401 });
    }

    const url = new URL(req.url);
    const report = await runSslMonitor({
      siteId: url.searchParams.get("siteId") ?? undefined,
      hostname: url.searchParams.get("hostname") ?? undefined,
    });

    return ok(report, {
      message:
        `SSL monitor: ${report.checked} checked, ${report.active} active, ` +
        `${report.renewalDue} due for renewal, ${report.expired} expired, ${report.failed} failed`,
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
