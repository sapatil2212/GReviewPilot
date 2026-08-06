/**
 * GET /api/private/ai/analytics — reply engine performance
 *
 * Read-only aggregates: how many replies were generated, approved, edited and
 * sent, how long approval takes, and a labelled estimate of time saved.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { aiReplyEngineService } from "@/server/services/aiReplyEngine.service";
import { analyticsRangeSchema } from "@/server/validators/ai.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "analytics:read");

    const params = new URL(req.url).searchParams;
    const { days } = analyticsRangeSchema.parse({ days: params.get("days") ?? undefined });

    return ok(await aiReplyEngineService.analytics(ctx, days));
  } catch (err) {
    return handleError(err);
  }
}
