/**
 * GET /api/super-admin/audit-logs
 * Retrieve global platform audit logs.
 */

import { NextRequest } from "next/server";
import { requireSuperAdminSession } from "@/server/auth/requireSuperAdmin";
import { superAdminService } from "@/server/services/superAdmin.service";
import { ok, handleError } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdminSession();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const action = searchParams.get("action") || undefined;
    const limit = parseInt(searchParams.get("limit") || "40", 10);

    const logs = await superAdminService.getAuditLogs({
      search,
      action,
      limit,
    });

    return ok(logs);
  } catch (err) {
    return handleError(err);
  }
}
