/**
 * GET /api/auth/me
 * Returns the authenticated user's profile + tenant info.
 * Used by client components after login/refresh.
 */

import { requireSession } from "@/server/auth/requireSession";
import { userRepository } from "@/server/repositories/user.repository";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { isSignupIncomplete } from "@/server/services/auth.service";
import {
  isTrialExpired,
  isWelcomePending,
  trialDaysRemaining,
  TRIAL_DAYS,
} from "@/server/utils/trial";
import { ok, handleError } from "@/server/utils/response";

export const runtime = "nodejs";

export async function GET() {
  try {
    const ctx = await requireSession();
    const [user, tenant] = await Promise.all([
      userRepository.findByIdSafe(ctx.userId),
      tenantRepository.findById(ctx.tenantId),
    ]);
    const signupIncomplete = isSignupIncomplete(tenant?.metadata);
    const trialExpired = tenant ? isTrialExpired(tenant) : false;
    const daysLeft = trialDaysRemaining(tenant?.trialEndsAt);
    const welcomePending = tenant ? isWelcomePending(tenant.metadata) : false;

    return ok({
      user: {
        id: ctx.userId,
        email: ctx.email,
        firstName: ctx.firstName,
        lastName: ctx.lastName,
        avatar: user?.avatar ?? null,
        phone: user?.phone ?? null,
        role: ctx.role,
        emailVerified: Boolean(user?.emailVerified),
      },
      tenant: tenant
        ? {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            plan: tenant.plan,
            status: tenant.status,
            billingStatus: tenant.billingStatus,
            trialStartAt: tenant.trialStartAt,
            trialEndsAt: tenant.trialEndsAt,
            website: tenant.website,
            phone: tenant.phone,
            industry: tenant.industry,
            signupIncomplete,
          }
        : null,
      signupIncomplete,
      trial: {
        days: TRIAL_DAYS,
        daysRemaining: daysLeft,
        endsAt: tenant?.trialEndsAt?.toISOString() ?? null,
        expired: trialExpired,
        needsSubscription: trialExpired,
      },
      welcomePending: welcomePending && !signupIncomplete,
      sessionId: ctx.sessionId,
    });
  } catch (err) {
    return handleError(err);
  }
}
