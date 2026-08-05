/**
 * GET /api/private/analytics/overview?period=30
 * Dashboard KPIs.
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
    const { period } = analyticsQuerySchema.parse({
      period: url.searchParams.get("period") ?? undefined,
    });
    const data = await analyticsService.overview(ctx, period);
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}
