/**
 * GET /api/super-admin/users
 * List & search users across all platform workspaces.
 */

import { NextRequest } from "next/server";
import { requireSuperAdminSession } from "@/server/auth/requireSuperAdmin";
import { superAdminService } from "@/server/services/superAdmin.service";
import { ok, handleError } from "@/server/utils/response";
import { UserStatus, UserRole } from "@prisma/client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireSuperAdminSession();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || undefined;
    const status = (searchParams.get("status") as UserStatus) || undefined;
    const role = (searchParams.get("role") as UserRole) || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "15", 10);

    const result = await superAdminService.getUsers({
      search,
      status,
      role,
      page,
      limit,
    });

    return ok(result);
  } catch (err) {
    return handleError(err);
  }
}
