/**
 * DELETE /api/private/settings/account
 * Soft-deletes the workspace owner account + tenant (recoverable).
 */

import type { NextRequest } from "next/server";
import { requireSession } from "@/server/auth/requireSession";
import { authService } from "@/server/services/auth.service";
import { deleteAccountSchema } from "@/server/validators/auth.schema";
import { ok, handleError } from "@/server/utils/response";
import { signOut } from "@/server/auth/handlers";

export const runtime = "nodejs";

export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requireSession();
    const body = await req.json().catch(() => null);
    const input = deleteAccountSchema.parse(body);
    await authService.deleteAccount(ctx.userId, ctx.tenantId, input.confirmation, req);
    await signOut({ redirect: false });
    return ok({ deleted: true }, { message: "Account deleted" });
  } catch (err) {
    return handleError(err);
  }
}
