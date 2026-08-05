/**
 * GET  /api/private/analytics/insights — cached AI review-insights report
 * POST /api/private/analytics/insights — regenerate the report
 *
 * Query/body: periodDays (7|30|90|365), locationId (optional).
 * GET returns { report: null } when nothing has been generated yet so the
 * UI can show a first-run prompt instead of auto-spending an AI call.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { reviewInsightsService } from "@/server/services/reviewInsights.service";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";
export const maxDuration = 60;

const querySchema = z.object({
  periodDays: z.coerce.number().int().min(1).max(730).optional().default(90),
  locationId: z.string().cuid().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "analytics:read");
    const url = new URL(req.url);
    const { periodDays, locationId } = querySchema.parse({
      periodDays: url.searchParams.get("periodDays") ?? undefined,
      locationId: url.searchParams.get("locationId") ?? undefined,
    });

    const cached = await reviewInsightsService.getCached(
      ctx.tenantId,
      periodDays,
      locationId ?? null,
    );

    return ok({
      report: cached
        ? {
            payload: cached.payload,
            source: cached.source,
            sampleSize: cached.sampleSize,
            generatedAt: cached.generatedAt.toISOString(),
            periodDays: cached.periodDays,
            locationId: cached.locationId,
          }
        : null,
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "analytics:read");
    const body = (await req.json().catch(() => null)) ?? {};
    const { periodDays, locationId } = querySchema.parse(body);

    const saved = await reviewInsightsService.generate(
      ctx.tenantId,
      ctx.userId,
      periodDays,
      locationId ?? null,
    );

    return ok(
      {
        report: {
          payload: saved.payload,
          source: saved.source,
          sampleSize: saved.sampleSize,
          generatedAt: saved.generatedAt.toISOString(),
          periodDays: saved.periodDays,
          locationId: saved.locationId,
        },
      },
      { message: "Insights generated" },
    );
  } catch (err) {
    return handleError(err);
  }
}
