/**
 * GET /api/private/team/members
 *
 * Query params:
 *   page, pageSize, search, sortBy, sortDir
 *   role=<UserRole>
 *   status=<UserStatus>
 *   locationId=<cuid>  (users assigned to this branch)
 *
 * Response items include their location assignments hydrated.
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { requirePermission } from "@/server/permissions/permissions";
import { teamService } from "@/server/services/team.service";
import { listMembersQuerySchema } from "@/server/validators/team.schema";
import { handleError, ok } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const ctx = await requireSession();
    requirePermission(ctx, "user:read");
    const url = new URL(req.url);
    const filter = listMembersQuerySchema.parse({
      role: url.searchParams.get("role") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      locationId: url.searchParams.get("locationId") ?? undefined,
    });
    const page = await teamService.list(ctx, req, filter);
    return ok(page);
  } catch (err) {
    return handleError(err);
  }
}
