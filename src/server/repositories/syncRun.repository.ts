/**
 * SyncRun repository — observability for Google Business Profile syncs.
 * Rows are written on every trigger and updated as the sync progresses.
 */

import { Prisma, SyncKind, SyncStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildOrderBy, type PaginationQuery } from "@/server/utils/pagination";

const INCLUDE = {
  triggeredBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  googleAccount: {
    select: { id: true, email: true },
  },
} satisfies Prisma.SyncRunInclude;

export type SyncRunWithRelations = Prisma.SyncRunGetPayload<{
  include: typeof INCLUDE;
}>;

const SORTABLE = ["startedAt", "finishedAt", "kind", "status"] as const;

export const syncRunRepository = {
  create(data: {
    tenantId: string;
    googleAccountId: string | null;
    kind: SyncKind;
    triggeredById: string | null;
    metadata?: Prisma.InputJsonValue;
  }) {
    return prisma.syncRun.create({
      data: {
        tenant: { connect: { id: data.tenantId } },
        ...(data.googleAccountId
          ? { googleAccount: { connect: { id: data.googleAccountId } } }
          : {}),
        kind: data.kind,
        status: SyncStatus.RUNNING,
        ...(data.triggeredById
          ? { triggeredBy: { connect: { id: data.triggeredById } } }
          : {}),
        metadata: data.metadata ?? Prisma.JsonNull,
      },
      include: INCLUDE,
    });
  },

  complete(
    id: string,
    result: {
      status: SyncStatus;
      itemsProcessed: number;
      itemsCreated: number;
      itemsUpdated: number;
      itemsFailed: number;
      errorMessage?: string | null;
    },
  ) {
    return prisma.syncRun.update({
      where: { id },
      data: {
        status: result.status,
        finishedAt: new Date(),
        itemsProcessed: result.itemsProcessed,
        itemsCreated: result.itemsCreated,
        itemsUpdated: result.itemsUpdated,
        itemsFailed: result.itemsFailed,
        errorMessage: result.errorMessage ?? null,
      },
      include: INCLUDE,
    });
  },

  fail(id: string, errorMessage: string) {
    return prisma.syncRun.update({
      where: { id },
      data: {
        status: SyncStatus.FAILED,
        finishedAt: new Date(),
        errorMessage,
      },
      include: INCLUDE,
    });
  },

  list(args: {
    tenantId: string;
    filter: { kind?: SyncKind; status?: SyncStatus };
    pagination: PaginationQuery;
  }) {
    const where: Prisma.SyncRunWhereInput = {
      tenantId: args.tenantId,
      ...(args.filter.kind ? { kind: args.filter.kind } : {}),
      ...(args.filter.status ? { status: args.filter.status } : {}),
    };
    const orderBy = buildOrderBy(args.pagination, SORTABLE, "startedAt");
    const skip = (args.pagination.page - 1) * args.pagination.pageSize;
    const take = args.pagination.pageSize;

    return prisma
      .$transaction([
        prisma.syncRun.findMany({
          where,
          include: INCLUDE,
          orderBy,
          skip,
          take,
        }),
        prisma.syncRun.count({ where }),
      ])
      .then(([items, total]) => ({ items, total }));
  },

  latestByKind(tenantId: string, kind: SyncKind) {
    return prisma.syncRun.findFirst({
      where: { tenantId, kind },
      include: INCLUDE,
      orderBy: { startedAt: "desc" },
    });
  },
};
