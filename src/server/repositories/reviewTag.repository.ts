/**
 * ReviewTag + ReviewTagLink repository.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const reviewTagRepository = {
  listForTenant(tenantId: string) {
    return prisma.reviewTag.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
  },

  findById(id: string) {
    return prisma.reviewTag.findUnique({ where: { id } });
  },

  findByIdForTenant(id: string, tenantId: string) {
    return prisma.reviewTag.findFirst({ where: { id, tenantId } });
  },

  findByName(tenantId: string, name: string) {
    return prisma.reviewTag.findUnique({
      where: { tenantId_name: { tenantId, name: name.toLowerCase() } },
    });
  },

  create(data: { tenantId: string; name: string; color?: string }) {
    return prisma.reviewTag.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        name: data.name.toLowerCase(),
        color: data.color ?? null,
      },
    });
  },

  update(id: string, data: { name?: string; color?: string | null }) {
    return prisma.reviewTag.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.toLowerCase() } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
      },
    });
  },

  remove(id: string) {
    return prisma.reviewTag.delete({ where: { id } });
  },

  // M:N links
  addToReview(reviewId: string, tagId: string) {
    return prisma.reviewTagLink.create({
      data: { reviewId, tagId },
    });
  },

  removeFromReview(reviewId: string, tagId: string) {
    return prisma.reviewTagLink.deleteMany({
      where: { reviewId, tagId },
    });
  },

  findLink(reviewId: string, tagId: string) {
    return prisma.reviewTagLink.findUnique({
      where: { reviewId_tagId: { reviewId, tagId } },
    });
  },
};
