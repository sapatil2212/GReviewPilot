/**
 * Review repository — tenant-scoped persistence for reviews.
 */

import {
  Prisma,
  ReviewSource,
  ReviewStatus,
  SentimentType,
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildOrderBy, type PaginationQuery } from "@/server/utils/pagination";

const REVIEW_INCLUDE = {
  location: { select: { id: true, name: true, slug: true, city: true } },
  replies: {
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" as const },
    take: 1,
    include: {
      repliedBy: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
  },
  tags: { include: { tag: true } },
} satisfies Prisma.ReviewInclude;

export type ReviewWithRelations = Prisma.ReviewGetPayload<{
  include: typeof REVIEW_INCLUDE;
}>;

const SORTABLE = [
  "reviewCreatedAt",
  "createdAt",
  "updatedAt",
  "starRating",
  "status",
  "sentiment",
  "reviewerName",
] as const;

export const reviewRepository = {
  findByIdForTenant(id: string, tenantId: string) {
    return prisma.review.findFirst({
      where: { id, tenantId },
      include: {
        ...REVIEW_INCLUDE,
        replies: {
          orderBy: { createdAt: "desc" },
          include: {
            repliedBy: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
        },
      },
    });
  },

  findByGoogleReviewId(googleReviewId: string) {
    return prisma.review.findUnique({
      where: { googleReviewId },
      include: REVIEW_INCLUDE,
    });
  },

  create(data: Prisma.ReviewCreateInput) {
    return prisma.review.create({ data, include: REVIEW_INCLUDE });
  },

  update(id: string, data: Prisma.ReviewUpdateInput) {
    return prisma.review.update({ where: { id }, data, include: REVIEW_INCLUDE });
  },

  upsertByGoogleReviewId(
    googleReviewId: string,
    create: Prisma.ReviewCreateInput,
    update: Prisma.ReviewUpdateInput,
  ) {
    return prisma.review.upsert({
      where: { googleReviewId },
      create,
      update,
      include: REVIEW_INCLUDE,
    });
  },

  list(args: {
    tenantId: string;
    filter: {
      locationId?: string;
      status?: ReviewStatus;
      source?: ReviewSource;
      sentiment?: SentimentType;
      minRating?: number;
      maxRating?: number;
      hasReply?: boolean;
      isArchived?: boolean;
      from?: Date;
      to?: Date;
      tagId?: string;
    };
    pagination: PaginationQuery;
  }) {
    const f = args.filter;
    const where: Prisma.ReviewWhereInput = {
      tenantId: args.tenantId,
      ...(f.locationId ? { locationId: f.locationId } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.source ? { source: f.source } : {}),
      ...(f.sentiment ? { sentiment: f.sentiment } : {}),
      ...(f.minRating !== undefined || f.maxRating !== undefined
        ? {
            starRating: {
              ...(f.minRating !== undefined ? { gte: f.minRating } : {}),
              ...(f.maxRating !== undefined ? { lte: f.maxRating } : {}),
            },
          }
        : {}),
      ...(f.hasReply === true
        ? { status: ReviewStatus.REPLIED }
        : f.hasReply === false
          ? { status: ReviewStatus.NEW }
          : {}),
      ...(f.isArchived !== undefined ? { isArchived: f.isArchived } : {}),
      ...(f.from || f.to
        ? {
            reviewCreatedAt: {
              ...(f.from ? { gte: f.from } : {}),
              ...(f.to ? { lte: f.to } : {}),
            },
          }
        : {}),
      ...(f.tagId ? { tags: { some: { tagId: f.tagId } } } : {}),
      ...(args.pagination.search
        ? {
            OR: [
              { comment: { contains: args.pagination.search } },
              { reviewerName: { contains: args.pagination.search } },
              {
                location: {
                  name: { contains: args.pagination.search },
                },
              },
              {
                location: {
                  city: { contains: args.pagination.search },
                },
              },
            ],
          }
        : {}),
    };

    const orderBy = buildOrderBy(args.pagination, SORTABLE, "reviewCreatedAt");
    const skip = (args.pagination.page - 1) * args.pagination.pageSize;
    const take = args.pagination.pageSize;

    return prisma
      .$transaction([
        prisma.review.findMany({
          where,
          include: REVIEW_INCLUDE,
          orderBy,
          skip,
          take,
        }),
        prisma.review.count({ where }),
      ])
      .then(([items, total]) => ({ items, total }));
  },

  countByTenant(tenantId: string) {
    return prisma.review.count({ where: { tenantId } });
  },

  stats(tenantId: string) {
    return prisma.$transaction([
      prisma.review.count({ where: { tenantId } }),
      prisma.review.count({ where: { tenantId, status: ReviewStatus.NEW } }),
      prisma.review.count({ where: { tenantId, status: ReviewStatus.REPLIED } }),
      prisma.review.count({ where: { tenantId, isArchived: true } }),
      prisma.review.aggregate({
        where: { tenantId },
        _avg: { starRating: true },
      }),
    ]);
  },

  archiveMany(tenantId: string, ids: string[], archive: boolean) {
    return prisma.review.updateMany({
      where: { id: { in: ids }, tenantId },
      data: {
        isArchived: archive,
        archivedAt: archive ? new Date() : null,
        status: archive ? ReviewStatus.ARCHIVED : ReviewStatus.NEW,
      },
    });
  },
};
