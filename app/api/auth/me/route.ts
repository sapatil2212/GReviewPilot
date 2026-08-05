/**
 * GET /api/auth/me
 * Returns the authenticated user's profile + tenant info.
 * Used by client components after login/refresh.
 */

import { requireSession } from "@/server/auth/requireSession";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { ok, handleError } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    const tenant = await tenantRepository.findById(ctx.tenantId);
    return ok({
      user: {
        id: ctx.userId,
        email: ctx.email,
        firstName: ctx.firstName,
        lastName: ctx.lastName,
        role: ctx.role,
      },
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            plan: tenant.plan,
            status: tenant.status,
            trialEndsAt: tenant.trialEndsAt,
          }
        : null,
      sessionId: ctx.sessionId,
    });
  } catch (err) {
    return handleError(err);
  }
}
