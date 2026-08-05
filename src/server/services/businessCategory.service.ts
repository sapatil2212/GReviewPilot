/**
 * Business Category service.
 *
 * Handles catalog browsing plus the tenant's category selection
 * (max 10 categories per tenant, matching Google Business Profile).
 * Primary category is stored on BusinessProfile, secondary categories
 * live in the TenantBusinessCategory join table.
 */

import { AuditAction } from "@prisma/client";
import { businessCategoryRepository } from "@/server/repositories/businessCategory.repository";
import { businessProfileRepository } from "@/server/repositories/businessProfile.repository";
import { businessProfileService } from "@/server/services/businessProfile.service";
import { auditRepository } from "@/server/repositories/audit.repository";
import { prisma } from "@/server/db/prisma";
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/utils/errors";
import type { AuthContext } from "@/server/auth/requireSession";
import {
  buildPagedResult,
  parsePagination,
  paginationSkipTake,
} from "@/server/utils/pagination";

const MAX_CATEGORIES_PER_TENANT = 10;

export const businessCategoryService = {
  /**
   * Search the global catalog. Read-only for tenants.
   */
  async listCatalog(req: Request) {
    const url = new URL(req.url);
    const pagination = parsePagination(url.searchParams);
    const parentIdParam = url.searchParams.get("parentId");
    const activeOnly = url.searchParams.get("activeOnly") !== "false";

    const where = {
      ...(activeOnly ? { isActive: true } : {}),
      ...(parentIdParam === "root"
        ? { parentId: null }
        : parentIdParam
          ? { parentId: parentIdParam }
          : {}),
      ...(pagination.search
        ? {
            OR: [
              { name: { contains: pagination.search } },
              { slug: { contains: pagination.search } },
            ],
          }
        : {}),
    };

    const { skip, take } = paginationSkipTake(pagination);
    const [items, total] = await Promise.all([
      businessCategoryRepository.listCatalog({
        where,
        skip,
        take,
        orderBy: { name: pagination.sortDir },
      }),
      businessCategoryRepository.countCatalog(where),
    ]);

    return buildPagedResult(items, total, pagination);
  },

  async listSelections(ctx: AuthContext) {
    const { profile } = await businessProfileService.getForTenant(ctx);
    const selections = await businessCategoryRepository.listSelectionsForProfile(
      profile.id,
    );
    return {
      primaryCategoryId: profile.primaryCategoryId,
      categories: selections.map((s) => ({
        id: s.id,
        addedAt: s.createdAt,
        category: s.category,
        isPrimary: s.categoryId === profile.primaryCategoryId,
      })),
    };
  },

  async addSelection(
    ctx: AuthContext,
    input: { categoryId: string; setAsPrimary: boolean },
  ) {
    const category = await businessCategoryRepository.findById(input.categoryId);
    if (!category || !category.isActive) {
      throw new NotFoundError("Category not found");
    }

    const { profile } = await businessProfileService.getForTenant(ctx);
    const existing = await businessCategoryRepository.findSelection(
      profile.id,
      input.categoryId,
    );

    if (!existing) {
      const count = await businessCategoryRepository.countSelectionsForProfile(
        profile.id,
      );
      if (count >= MAX_CATEGORIES_PER_TENANT) {
        throw new ConflictError(
          "CONFLICT",
          `You can select up to ${MAX_CATEGORIES_PER_TENANT} categories`,
        );
      }
      await businessCategoryRepository.addSelection(profile.id, input.categoryId);
      await auditRepository.record({
        action: AuditAction.BUSINESS_CATEGORY_ADDED,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        metadata: {
          categoryId: category.id,
          categoryName: category.name,
        },
      });
    }

    if (input.setAsPrimary) {
      await businessProfileRepository.update(profile.id, {
        primaryCategory: { connect: { id: category.id } },
      });
      await auditRepository.record({
        action: AuditAction.BUSINESS_CATEGORY_PRIMARY_SET,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        metadata: { categoryId: category.id, categoryName: category.name },
      });
    }

    return businessCategoryService.listSelections(ctx);
  },

  async removeSelection(ctx: AuthContext, categoryId: string) {
    const { profile } = await businessProfileService.getForTenant(ctx);
    const selection = await businessCategoryRepository.findSelection(
      profile.id,
      categoryId,
    );
    if (!selection) throw new NotFoundError("Category is not selected");

    // If removing the primary, clear it too.
    await prisma.$transaction(async (tx) => {
      await tx.tenantBusinessCategory.deleteMany({
        where: { profileId: profile.id, categoryId },
      });
      if (profile.primaryCategoryId === categoryId) {
        await tx.businessProfile.update({
          where: { id: profile.id },
          data: { primaryCategoryId: null },
        });
      }
    });

    await auditRepository.record({
      action: AuditAction.BUSINESS_CATEGORY_REMOVED,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      metadata: { categoryId },
    });

    return businessCategoryService.listSelections(ctx);
  },

  async setPrimary(ctx: AuthContext, categoryId: string) {
    const category = await businessCategoryRepository.findById(categoryId);
    if (!category || !category.isActive) {
      throw new NotFoundError("Category not found");
    }
    const { profile } = await businessProfileService.getForTenant(ctx);
    const selection = await businessCategoryRepository.findSelection(
      profile.id,
      categoryId,
    );
    if (!selection) {
      // Auto-select before promoting to primary — respects the max cap.
      const count = await businessCategoryRepository.countSelectionsForProfile(
        profile.id,
      );
      if (count >= MAX_CATEGORIES_PER_TENANT) {
        throw new ConflictError(
          "CONFLICT",
          `You can select up to ${MAX_CATEGORIES_PER_TENANT} categories`,
        );
      }
      await businessCategoryRepository.addSelection(profile.id, categoryId);
    }

    await businessProfileRepository.update(profile.id, {
      primaryCategory: { connect: { id: categoryId } },
    });

    await auditRepository.record({
      action: AuditAction.BUSINESS_CATEGORY_PRIMARY_SET,
      userId: ctx.userId,
      tenantId: ctx.tenantId,
      metadata: { categoryId, categoryName: category.name },
    });

    return businessCategoryService.listSelections(ctx);
  },
};
