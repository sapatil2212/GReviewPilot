/**
 * GooglePost repository.
 */

import { PostStatus, PostType, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildOrderBy, type PaginationQuery } from "@/server/utils/pagination";

const POST_INCLUDE = {
  location: { select: { id: true, name: true, slug: true, city: true } },
  createdBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
} satisfies Prisma.GooglePostInclude;

export type PostWithRelations = Prisma.GooglePostGetPayload<{
  include: typeof POST_INCLUDE;
}>;

const SORTABLE = [
  "createdAt",
  "updatedAt",
  "scheduledAt",
  "publishedAt",
  "viewCount",
] as const;

export const postRepository = {
  findByIdForTenant(id: string, tenantId: string) {
    return prisma.googlePost.findFirst({
      where: { id, tenantId },
      include: POST_INCLUDE,
    });
  },

  create(data: Prisma.GooglePostCreateInput) {
    return prisma.googlePost.create({ data, include: POST_INCLUDE });
  },

  update(id: string, data: Prisma.GooglePostUpdateInput) {
    return prisma.googlePost.update({ where: { id }, data, include: POST_INCLUDE });
  },

  softDelete(id: string) {
    return prisma.googlePost.update({
      where: { id },
      data: { status: PostStatus.DELETED, deletedAt: new Date() },
    });
  },

  list(args: {
    tenantId: string;
    filter: {
      locationId?: string;
      status?: PostStatus;
      type?: PostType;
      includeDeleted: boolean;
    };
    pagination: PaginationQuery;
  }) {
    const f = args.filter;
    const where: Prisma.GooglePostWhereInput = {
      tenantId: args.tenantId,
      ...(f.includeDeleted ? {} : { deletedAt: null }),
      ...(f.locationId ? { locationId: f.locationId } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(args.pagination.search
        ? {
            OR: [
              { body: { contains: args.pagination.search } },
              { title: { contains: args.pagination.search } },
            ],
          }
        : {}),
    };
    const orderBy = buildOrderBy(args.pagination, SORTABLE, "createdAt");
    const skip = (args.pagination.page - 1) * args.pagination.pageSize;
    const take = args.pagination.pageSize;

    return prisma
      .$transaction([
        prisma.googlePost.findMany({ where, include: POST_INCLUDE, orderBy, skip, take }),
        prisma.googlePost.count({ where }),
      ])
      .then(([items, total]) => ({ items, total }));
  },

  countByStatus(tenantId: string) {
    return prisma.googlePost.groupBy({
      by: ["status"],
      where: { tenantId, deletedAt: null },
      _count: { _all: true },
    });
  },
};
