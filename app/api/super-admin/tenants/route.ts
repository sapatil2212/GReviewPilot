/**
 * GET /api/super-admin/tenants
 * List & search tenants/workspaces across the platform.
 */

import { NextRequest } from "next/server";
import { requireSuperAdminSession } from "@/server/auth/requireSuperAdmin";
import { superAdminService } from "@/server/services/superAdmin.service";
import { ok, handleError } from "@/server/utils/response";
import { TenantStatus, TenantPlan } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdminSession();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const status = (searchParams.get("status") as TenantStatus) || undefined;
    const plan = (searchParams.get("plan") as TenantPlan) || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "15", 10);

    const result = await superAdminService.getTenants({
      search,
      status,
      plan,
      page,
      limit,
    });

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
