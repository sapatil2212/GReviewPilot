/**
 * PATCH /api/super-admin/users/[id]
 * Update user status (ACTIVE, BLOCKED, etc.)
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { requireSuperAdminSession } from "@/server/auth/requireSuperAdmin";
import { superAdminService } from "@/server/services/superAdmin.service";
import { ok, handleError } from "@/server/utils/response";
import { UserStatus } from "@prisma/client";

export const runtime = "nodejs";

const updateUserSchema = z.object({
  status: z.nativeEnum(UserStatus),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await requireSuperAdminSession();
    const { id: targetUserId } = await params;
    const body = await req.json();
    const parsed = updateUserSchema.parse(body);

    const updatedUser = await superAdminService.updateUserStatus(
      targetUserId,
      parsed.status,
      ctx.userId
    );

    return ok(updatedUser, { message: "User status updated successfully" });
  } catch (err) {
    return handleError(err);
  }
}
