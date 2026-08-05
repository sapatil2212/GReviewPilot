/**
 * GET /api/private/analytics/funnel?period=30&locationId=
 * Funnel step conversion, rating selections, and time series.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { analyticsService } from "@/server/services/analytics.service";
import { analyticsQuerySchema } from "@/server/validators/analytics.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "analytics:read");
    const url = new URL(req.url);
    const { period, locationId } = analyticsQuerySchema.parse({
      period: url.searchParams.get("period") ?? undefined,
      locationId: url.searchParams.get("locationId") ?? undefined,
    });
    const data = await analyticsService.funnel(ctx, period, locationId);
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}
