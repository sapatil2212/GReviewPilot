/**
 * BusinessCategory repository — the global catalog + tenant selections.
 *
 * Catalog rows are seeded (see prisma/seeds/categories.ts). Tenants
 * never write to `BusinessCategory` directly; they only add/remove
 * `TenantBusinessCategory` links.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const businessCategoryRepository = {
  findById(id: string) {
    return prisma.businessCategory.findUnique({ where: { id } });
  },

  findBySlug(slug: string) {
    return prisma.businessCategory.findUnique({ where: { slug } });
  },

  countCatalog(where: Prisma.BusinessCategoryWhereInput) {
    return prisma.businessCategory.count({ where });
  },

  listCatalog(args: {
    where: Prisma.BusinessCategoryWhereInput;
    skip: number;
    take: number;
    orderBy: Prisma.BusinessCategoryOrderByWithRelationInput;
  }) {
    return prisma.businessCategory.findMany({
      where: args.where,
      skip: args.skip,
      take: args.take,
      orderBy: args.orderBy,
    });
  },

  listSelectionsForProfile(profileId: string) {
    return prisma.tenantBusinessCategory.findMany({
      where: { profileId },
      include: { category: true },
      orderBy: { createdAt: "asc" },
    });
  },

  countSelectionsForProfile(profileId: string) {
    return prisma.tenantBusinessCategory.count({ where: { profileId } });
  },

  addSelection(profileId: string, categoryId: string) {
    return prisma.tenantBusinessCategory.create({
      data: { profileId, categoryId },
    });
  },

  removeSelection(profileId: string, categoryId: string) {
    return prisma.tenantBusinessCategory.deleteMany({
      where: { profileId, categoryId },
    });
  },

  findSelection(profileId: string, categoryId: string) {
    return prisma.tenantBusinessCategory.findUnique({
      where: { profileId_categoryId: { profileId, categoryId } },
    });
  },
};
