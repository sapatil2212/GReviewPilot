/**
 * Trial + subscription helpers shared by auth, session gates, and UI.
 */

import {
  BillingStatus,
  TenantPlan,
  TenantStatus,
  type Tenant,
} from "@prisma/client";
import { TRIAL_DAYS } from "@/lib/plans";

export { TRIAL_DAYS };
export type { ActivatablePlan } from "@/lib/plans";
export { SUBSCRIPTION_PLANS } from "@/lib/plans";

export function trialEndsAtFrom(start = new Date()): Date {
  return new Date(start.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}

/** Paid / free plans that are allowed past the trial window. */
export function hasActiveSubscription(tenant: Pick<Tenant, "plan" | "billingStatus">): boolean {
  if (tenant.plan === TenantPlan.TRIAL) return false;
  return (
    tenant.billingStatus === BillingStatus.ACTIVE ||
    tenant.billingStatus === BillingStatus.TRIALING
  );
}

/**
 * Trial is expired when the workspace is still on the TRIAL plan and
 * `trialEndsAt` is in the past. Subscribed workspaces are never expired.
 */
export function isTrialExpired(
  tenant: Pick<Tenant, "plan" | "billingStatus" | "trialEndsAt" | "status">,
): boolean {
  if (tenant.status === TenantStatus.DELETED) return false;
  if (hasActiveSubscription(tenant)) return false;
  if (tenant.plan !== TenantPlan.TRIAL) return false;
  if (!tenant.trialEndsAt) return false;
  return tenant.trialEndsAt.getTime() < Date.now();
}

export function trialDaysRemaining(trialEndsAt: Date | null | undefined): number | null {
  if (!trialEndsAt) return null;
  const ms = trialEndsAt.getTime() - Date.now();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

export function readTenantMeta(metadata: unknown): Record<string, unknown> {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return { ...(metadata as Record<string, unknown>) };
  }
  return {};
}

export function isWelcomePending(metadata: unknown): boolean {
  const meta = readTenantMeta(metadata);
  return meta.welcomeDismissed !== true;
}
