/**
 * PrivateFeedback repository — low-rating funnel submissions captured
 * privately for the business to resolve.
 */

import { FeedbackStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildOrderBy, type PaginationQuery } from "@/server/utils/pagination";

const INCLUDE = {
  location: { select: { id: true, name: true, slug: true, city: true } },
} satisfies Prisma.PrivateFeedbackInclude;

export type PrivateFeedbackWithRelations = Prisma.PrivateFeedbackGetPayload<{
  include: typeof INCLUDE;
}>;

const SORTABLE = ["createdAt", "rating", "status"] as const;

export const privateFeedbackRepository = {
  findByIdForTenant(id: string, tenantId: string) {
    return prisma.privateFeedback.findFirst({
      where: { id, tenantId },
      include: INCLUDE,
    });
  },

  update(id: string, data: Prisma.PrivateFeedbackUpdateInput) {
    return prisma.privateFeedback.update({ where: { id }, data, include: INCLUDE });
  },

  list(args: {
    tenantId: string;
    filter: { status?: FeedbackStatus; locationId?: string };
    pagination: PaginationQuery;
  }) {
    const where: Prisma.PrivateFeedbackWhereInput = {
      tenantId: args.tenantId,
      ...(args.filter.status ? { status: args.filter.status } : {}),
      ...(args.filter.locationId ? { locationId: args.filter.locationId } : {}),
      ...(args.pagination.search
        ? {
            OR: [
              { comment: { contains: args.pagination.search } },
              { customerName: { contains: args.pagination.search } },
              { customerPhone: { contains: args.pagination.search } },
            ],
          }
        : {}),
    };
    const orderBy = buildOrderBy(args.pagination, SORTABLE, "createdAt");
    const skip = (args.pagination.page - 1) * args.pagination.pageSize;
    const take = args.pagination.pageSize;
    return prisma
      .$transaction([
        prisma.privateFeedback.findMany({ where, include: INCLUDE, orderBy, skip, take }),
        prisma.privateFeedback.count({ where }),
      ])
      .then(([items, total]) => ({ items, total }));
  },

  countNew(tenantId: string) {
    return prisma.privateFeedback.count({
      where: { tenantId, status: FeedbackStatus.NEW },
    });
  },
};
