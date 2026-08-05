/**
 * Server-side session guard.
 *
 * Every protected Route Handler, Server Action, or Server Component
 * should call `requireSession()`. It:
 *   1. reads the Auth.js session cookie
 *   2. re-checks user + tenant status against the database
 *   3. returns a typed AuthContext (never null on success)
 *
 * Failures throw `UnauthorizedError` so the central error handler
 * turns them into a 401 (or a redirect at the layout level).
 */

import { UserRole, UserStatus, TenantStatus } from "@prisma/client";
import { auth } from "./handlers";
import { userRepository } from "@/server/repositories/user.repository";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { UnauthorizedError } from "@/server/utils/errors";

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: UserRole;
  sessionId: string;
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * Load the current auth context or throw. Use inside try/catch or wrap
 * with `handleError` for API routes.
 */
export async function requireSession(): Promise<AuthContext> {
  const session = await auth();
  if (!session?.user?.id || !session.tenantId || !session.role || !session.sessionId) {
    throw new UnauthorizedError("UNAUTHENTICATED", "Authentication required");
  }

  // Re-validate against DB. The jwt callback already does this, but a
  // defense-in-depth check here catches edge cases (stale JWT cached
  // by ISR, etc.).
  const [user, tenant] = await Promise.all([
    userRepository.findById(session.user.id),
    tenantRepository.findById(session.tenantId),
  ]);

  if (!user || user.status !== UserStatus.ACTIVE) {
    throw new UnauthorizedError("ACCOUNT_INACTIVE", "Account is not active");
  }
  if (
    !tenant ||
    tenant.status === TenantStatus.SUSPENDED ||
    tenant.status === TenantStatus.DELETED
  ) {
    throw new UnauthorizedError("TENANT_SUSPENDED", "Workspace is not available");
  }

  return {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    sessionId: session.sessionId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}

/**
 * Non-throwing variant for optional-auth pages.
 */
export async function tryGetSession(): Promise<AuthContext | null> {
  try {
    return await requireSession();
  } catch {
    return null;
  }
}
