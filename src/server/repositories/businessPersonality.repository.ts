/**
 * BusinessPersonality + AiReplyDraft data access.
 *
 * Thin Prisma wrappers, tenant-scoped by argument rather than by convention —
 * every read takes a tenantId so a caller cannot accidentally reach another
 * workspace's personality.
 */

import type { Prisma, ReplyDraftStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const businessPersonalityRepository = {
  findByTenantId(tenantId: string) {
    return prisma.businessPersonality.findUnique({ where: { tenantId } });
  },

  /**
   * Create or patch the personality row.
   *
   * `revision` increments on every write so any generated output can be traced
   * back to the exact personality that produced it — useful when a business
   * changes its tone and wants to know which replies predate the change.
   */
  upsert(tenantId: string, data: Prisma.BusinessPersonalityUncheckedUpdateInput) {
    return prisma.businessPersonality.upsert({
      where: { tenantId },
      create: { ...(data as Prisma.BusinessPersonalityUncheckedCreateInput), tenantId },
      update: { ...data, revision: { increment: 1 } },
    });
  },

  delete(tenantId: string) {
    return prisma.businessPersonality.delete({ where: { tenantId } });
  },
};

export const aiReplyDraftRepository = {
  create(data: Prisma.AiReplyDraftUncheckedCreateInput) {
    return prisma.aiReplyDraft.create({ data });
  },

  findByIdForTenant(id: string, tenantId: string) {
    return prisma.aiReplyDraft.findFirst({ where: { id, tenantId } });
  },

  update(id: string, data: Prisma.AiReplyDraftUncheckedUpdateInput) {
    return prisma.aiReplyDraft.update({ where: { id }, data });
  },

  list(args: {
    tenantId: string;
    status?: ReplyDraftStatus;
    reviewId?: string;
    skip?: number;
    take?: number;
  }) {
    const where: Prisma.AiReplyDraftWhereInput = {
      tenantId: args.tenantId,
      ...(args.status ? { status: args.status } : {}),
      ...(args.reviewId ? { reviewId: args.reviewId } : {}),
    };
    return prisma.$transaction([
      prisma.aiReplyDraft.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: args.skip ?? 0,
        take: args.take ?? 25,
        include: {
          review: {
            select: { id: true, reviewerName: true, starRating: true, comment: true },
          },
        },
      }),
      prisma.aiReplyDraft.count({ where }),
    ]);
  },

  /**
   * Recent sent replies, for duplicate protection.
   *
   * Only SENT rows count: a discarded draft was never published, so reusing its
   * wording is fine and excluding it would shrink the pool for no benefit.
   * Selects just the fields the comparison needs rather than whole rows.
   */
  recentSent(tenantId: string, limit = 40) {
    return prisma.aiReplyDraft.findMany({
      where: { tenantId, status: "SENT" },
      orderBy: { sentAt: "desc" },
      take: limit,
      select: { sentText: true, generatedText: true, fingerprint: true, openingHash: true },
    });
  },

  /**
   * Aggregates for the analytics panel.
   *
   * The status counts are reduced to a plain `Record<status, number>` here
   * rather than handed up as Prisma's groupBy shape: inside `$transaction` that
   * type widens to a union and every consumer ends up narrowing it. Kept as
   * three parallel reads instead of a transaction because these are independent
   * dashboard aggregates, not a set that must be mutually consistent.
   */
  async analytics(tenantId: string, since: Date) {
    const where = { tenantId, createdAt: { gte: since } };

    const [grouped, edited, sentRows] = await Promise.all([
      prisma.aiReplyDraft.groupBy({
        by: ["status"],
        where,
        orderBy: { status: "asc" },
        _count: true,
      }),
      prisma.aiReplyDraft.count({ where: { ...where, editedText: { not: null } } }),
      prisma.aiReplyDraft.findMany({
        where: { ...where, sentAt: { not: null } },
        select: { requestedAt: true, sentAt: true, starRating: true, source: true },
      }),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of grouped) {
      byStatus[row.status] = typeof row._count === "number" ? row._count : 0;
    }

    return { byStatus, edited, sentRows };
  },
};
