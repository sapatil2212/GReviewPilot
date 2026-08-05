/**
 * Business Profile service.
 *
 * Ensures every tenant has exactly one BusinessProfile row (created
 * lazily on first read/update), and handles atomic updates that span
 * both the Tenant row (identity, contact, address) and the profile
 * row (marketing description, cover image, category, etc.).
 */

import { AuditAction, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { businessProfileRepository } from "@/server/repositories/businessProfile.repository";
import { businessCategoryRepository } from "@/server/repositories/businessCategory.repository";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { auditRepository } from "@/server/repositories/audit.repository";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { NotFoundError, ValidationError } from "@/server/utils/errors";
import type { AuthContext } from "@/server/auth/requireSession";
import type { UpdateBusinessProfileInput } from "@/server/validators/business.schema";

export const businessProfileService = {
  /**
   * Fetch the profile for the caller's tenant. Creates an empty row
   * on the fly if one doesn't exist yet — every tenant is guaranteed
   * to have exactly one profile.
   */
  async getForTenant(ctx: AuthContext) {
    let profile = await businessProfileRepository.findByTenantId(ctx.tenantId);
    if (!profile) {
      profile = await businessProfileRepository.create(ctx.tenantId, {});
      await auditRepository.record({
        action: AuditAction.BUSINESS_PROFILE_CREATED,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
      });
    }
    const tenant = await tenantRepository.findById(ctx.tenantId);
    return { profile, tenant };
  },

  async update(
    ctx: AuthContext,
    input: UpdateBusinessProfileInput,
    req: Request,
  ) {
    // Ensure the profile exists.
    const existing = await businessProfileRepository.findByTenantId(
      ctx.tenantId,
    );
    const profileId = existing?.id;

    // Validate primary category, if provided, is a real catalog row and
    // is already selected by this tenant (or auto-select it below).
    if (input.primaryCategoryId) {
      const cat = await businessCategoryRepository.findById(
        input.primaryCategoryId,
      );
      if (!cat || !cat.isActive) {
        throw new ValidationError("Selected primary category is not available");
      }
    }

    // Plain scalar bag — reusable for both update and create paths.
    const profileScalars = {
      legalName: input.legalName,
      description: input.description,
      shortDescription: input.shortDescription,
      coverImage: input.coverImage,
      foundedYear: input.foundedYear,
      registrationNumber: input.registrationNumber,
      gstNumber: input.gstNumber,
      taxNumber: input.taxNumber,
    };

    const profileUpdateData: Prisma.BusinessProfileUpdateInput = {
      ...profileScalars,
      ...(input.primaryCategoryId
        ? { primaryCategory: { connect: { id: input.primaryCategoryId } } }
        : {}),
    };

    const profileCreateData: Prisma.BusinessProfileCreateInput = {
      ...profileScalars,
      tenant: { connect: { id: ctx.tenantId } },
      ...(input.primaryCategoryId
        ? { primaryCategory: { connect: { id: input.primaryCategoryId } } }
        : {}),
    };

    const tenantData: Prisma.TenantUpdateInput = input.tenant
      ? {
          name: input.tenant.name,
          logo: input.tenant.logo,
          businessEmail: input.tenant.businessEmail,
          phone: input.tenant.phone,
          website: input.tenant.website,
          industry: input.tenant.industry,
          businessType: input.tenant.businessType,
          employeeCount: input.tenant.employeeCount,
          country: input.tenant.country,
          timezone: input.tenant.timezone,
          currency: input.tenant.currency,
          language: input.tenant.language,
          ...(input.tenant.address !== undefined
            ? {
                address:
                  input.tenant.address === null
                    ? Prisma.JsonNull
                    : (input.tenant.address as Prisma.InputJsonValue),
              }
            : {}),
          ...(input.tenant.socialLinks !== undefined
            ? {
                socialLinks:
                  input.tenant.socialLinks === null
                    ? Prisma.JsonNull
                    : (input.tenant.socialLinks as Prisma.InputJsonValue),
              }
            : {}),
        }
      : {};

    // Do both updates in a single transaction so partial writes are impossible.
    const [_tenant, profile] = await prisma.$transaction(async (tx) => {
      const t = await tx.tenant.update({
        where: { id: ctx.tenantId },
        data: tenantData,
      });
      const p = profileId
        ? await tx.businessProfile.update({
            where: { id: profileId },
            data: profileUpdateData,
          })
        : await tx.businessProfile.create({
            data: profileCreateData,
          });
      return [t, p] as const;
    });

    // Ensure primary category is also in the selected list.
    if (input.primaryCategoryId) {
      const selection = await businessCategoryRepository.findSelection(
        profile.id,
        input.primaryCategoryId,
      );
      if (!selection) {
        await businessCategoryRepository.addSelection(
          profile.id,
          input.primaryCategoryId,
        );
      }
    }

    const rc = extractRequestContext(req);
    await auditRepository.record({
      action: existing
        ? AuditAction.BUSINESS_PROFILE_UPDATED
        : AuditAction.BUSINESS_PROFILE_CREATED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      ipAddress: rc.ipAddress,
      userAgent: rc.userAgent,
      browser: rc.browser,
      device: rc.device,
      metadata: {
        fields: Object.keys(input).filter(
          (k) => input[k as keyof typeof input] !== undefined,
        ),
      },
    });

    return businessProfileRepository.findByTenantId(ctx.tenantId);
  },
};
