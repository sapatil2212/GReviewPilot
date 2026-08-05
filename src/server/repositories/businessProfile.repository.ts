/**
 * BusinessProfile repository — persistence for the tenant's extended
 * profile. Categories and attributes have their own repositories; this
 * one only knows about the BusinessProfile row itself and its includes.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

const PROFILE_INCLUDE = {
  primaryCategory: true,
  categories: { include: { category: true } },
  attributes: true,
} satisfies Prisma.BusinessProfileInclude;

export type BusinessProfileWithRelations = Prisma.BusinessProfileGetPayload<{
  include: typeof PROFILE_INCLUDE;
}>;

export const businessProfileRepository = {
  findByTenantId(
    tenantId: string,
  ): Promise<BusinessProfileWithRelations | null> {
    return prisma.businessProfile.findUnique({
      where: { tenantId },
      include: PROFILE_INCLUDE,
    });
  },

  create(
    tenantId: string,
    data: Omit<Prisma.BusinessProfileCreateInput, "tenant">,
  ) {
    return prisma.businessProfile.create({
      data: { ...data, tenant: { connect: { id: tenantId } } },
      include: PROFILE_INCLUDE,
    });
  },

  update(id: string, data: Prisma.BusinessProfileUpdateInput) {
    return prisma.businessProfile.update({
      where: { id },
      data,
      include: PROFILE_INCLUDE,
    });
  },

  updateByTenantId(tenantId: string, data: Prisma.BusinessProfileUpdateInput) {
    return prisma.businessProfile.update({
      where: { tenantId },
      data,
      include: PROFILE_INCLUDE,
    });
  },
};
