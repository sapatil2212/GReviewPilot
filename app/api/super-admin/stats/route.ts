/**
 * GET /api/super-admin/stats
 * Complete database telemetry, platform KPIs, system health, and analytics trends.
 */

import { NextRequest } from "next/server";
import { requireSuperAdminSession } from "@/server/auth/requireSuperAdmin";
import { superAdminService } from "@/server/services/superAdmin.service";
import { ok, handleError } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdminSession();

    const [stats, analytics] = await Promise.all([
      superAdminService.getPlatformStats(),
      superAdminService.getAnalyticsTrends(),
    ]);

    return ok({
      stats,
      analytics,
    });
  } catch (err) {
    return handleError(err);
  }
}
