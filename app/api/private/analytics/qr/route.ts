/**
 * GET /api/private/analytics/qr?period=30
 * QR scans by type, top codes, and time series.
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
    const data = await analyticsService.qr(ctx, period);
    return ok(data);
  } catch (err) {
    return handleError(err);
  }
}
