/**
 * Tenant lifecycle service.
 *
 * A tenant is the workspace. Every user belongs to exactly one tenant.
 * On signup we create Tenant → User → Owner atomically; this service
 * owns the slug-collision retry loop and the trial-window defaults.
 */

import { TenantPlan, TenantStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { slugify } from "@/server/utils/tokens";
import { randomBytes } from "node:crypto";

const TRIAL_DAYS = 14;

export const tenantService = {
  /**
   * Generate a unique slug for a tenant name. If the base slug is
   * taken, append a short random suffix and retry (bounded by 8 tries
   * to avoid pathological cases).
   */
  async generateUniqueSlug(name: string): Promise<string> {
    const base = slugify(name);
    let candidate = base;

    for (let attempt = 0; attempt < 8; attempt++) {
      const existing = await tenantRepository.findBySlug(candidate);
      if (!existing) return candidate;
      const suffix = randomBytes(3).toString("hex").slice(0, 5);
      candidate = `${base}-${suffix}`;
    }
    // Extremely unlikely — fall back to a fully random slug.
    return `${base}-${randomBytes(4).toString("hex")}`;
  },

  async createTrialTenant(name: string) {
    const slug = await this.generateUniqueSlug(name);
    return prisma.tenant.create({
      data: {
        name,
        slug,
        plan: TenantPlan.TRIAL,
        status: TenantStatus.TRIAL,
        trialEndsAt: new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000),
      },
    });
  },

  findById(id: string) {
    return tenantRepository.findById(id);
  },

  isUsable(status: TenantStatus): boolean {
    return status === TenantStatus.ACTIVE || status === TenantStatus.TRIAL;
  },
};
