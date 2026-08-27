/**
 * Super Admin server-side security guard.
 *
 * Every super admin API route or page component must invoke `requireSuperAdminSession()`.
 * It:
 *   1. Invokes `requireSession()` to ensure valid JWT session + DB active status
 *   2. Verifies the user is either UserRole.SUPER_ADMIN or matching env.SUPER_ADMIN_USER
 *   3. Throws `ForbiddenError` if the check fails.
 */

import { UserRole } from "@prisma/client";
import { requireSession, type AuthContext } from "./requireSession";
import { env } from "@/server/utils/env";
import { ForbiddenError } from "@/server/utils/errors";
import { prisma } from "@/server/db/prisma";

export interface SuperAdminAuthContext extends AuthContext {
  isSuperAdmin: true;
}

export async function requireSuperAdminSession(): Promise<SuperAdminAuthContext> {
  const ctx = await requireSession();

  const isSuperAdminRole = ctx.role === UserRole.SUPER_ADMIN;
  const isSuperAdminEmail =
    env.SUPER_ADMIN_USER &&
    ctx.email.toLowerCase() === env.SUPER_ADMIN_USER.toLowerCase();

  if (!isSuperAdminRole && !isSuperAdminEmail) {
    throw new ForbiddenError("Forbidden: Super Admin access required");
  }

  // Ensure role in DB is synced to SUPER_ADMIN if it matched the env email
  if (isSuperAdminEmail && ctx.role !== UserRole.SUPER_ADMIN) {
    try {
      await prisma.user.update({
        where: { id: ctx.userId },
        data: { role: UserRole.SUPER_ADMIN },
      });
      ctx.role = UserRole.SUPER_ADMIN;
    } catch {
      // Non-blocking if update fails
    }
  }

  return {
    ...ctx,
    isSuperAdmin: true,
  };
}
