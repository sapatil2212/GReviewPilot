/**
 * MediaAsset repository — tenant-scoped persistence for uploaded files.
 *
 * All reads enforce `tenantId`. Deletion is soft (deletedAt) by
 * default; the background job (Module 16) will hard-delete rows past
 * the retention window.
 */

import {
  MediaCategory,
  MediaKind,
  MediaStatus,
  MediaVisibility,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildOrderBy, type PaginationQuery } from "@/server/utils/pagination";

const MEDIA_INCLUDE = {
  uploadedBy: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatar: true,
    },
  },
  location: {
    select: { id: true, name: true, slug: true, city: true },
  },
} satisfies Prisma.MediaAssetInclude;

export type MediaAssetWithRelations = Prisma.MediaAssetGetPayload<{
  include: typeof MEDIA_INCLUDE;
}>;

const SORTABLE = [
  "createdAt",
  "updatedAt",
  "filename",
  "sizeBytes",
  "category",
] as const;

export const mediaRepository = {
  findByIdForTenant(id: string, tenantId: string) {
    return prisma.mediaAsset.findFirst({
      where: { id, tenantId },
      include: MEDIA_INCLUDE,
    });
  },

  findByKey(storageKey: string) {
    return prisma.mediaAsset.findUnique({ where: { storageKey } });
  },

  findExisting(tenantId: string, sha256: string) {
    return prisma.mediaAsset.findUnique({
      where: { tenantId_sha256: { tenantId, sha256 } },
      include: MEDIA_INCLUDE,
    });
  },

  create(data: Prisma.MediaAssetCreateInput) {
    return prisma.mediaAsset.create({ data, include: MEDIA_INCLUDE });
  },

  update(id: string, data: Prisma.MediaAssetUpdateInput) {
    return prisma.mediaAsset.update({
      where: { id },
      data,
      include: MEDIA_INCLUDE,
    });
  },

  softDelete(id: string) {
    return prisma.mediaAsset.update({
      where: { id },
      data: {
        status: MediaStatus.DELETED,
        deletedAt: new Date(),
      },
    });
  },

  softDeleteMany(tenantId: string, ids: string[]) {
    return prisma.mediaAsset.updateMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      data: { status: MediaStatus.DELETED, deletedAt: new Date() },
    });
  },

  restore(id: string) {
    return prisma.mediaAsset.update({
      where: { id },
      data: { status: MediaStatus.READY, deletedAt: null },
    });
  },

  list(args: {
    tenantId: string;
    filter: {
      category?: MediaCategory;
      kind?: MediaKind;
      status?: MediaStatus;
      visibility?: MediaVisibility;
      locationId?: string;
      uploadedById?: string;
      includeDeleted: boolean;
    };
    pagination: PaginationQuery;
  }) {
    const where: Prisma.MediaAssetWhereInput = {
      tenantId: args.tenantId,
      ...(args.filter.includeDeleted ? {} : { deletedAt: null }),
      ...(args.filter.category ? { category: args.filter.category } : {}),
      ...(args.filter.kind ? { kind: args.filter.kind } : {}),
      ...(args.filter.status ? { status: args.filter.status } : {}),
      ...(args.filter.visibility ? { visibility: args.filter.visibility } : {}),
      ...(args.filter.locationId ? { locationId: args.filter.locationId } : {}),
      ...(args.filter.uploadedById
        ? { uploadedById: args.filter.uploadedById }
        : {}),
      ...(args.pagination.search
        ? {
            OR: [
              { filename: { contains: args.pagination.search } },
              { altText: { contains: args.pagination.search } },
              { caption: { contains: args.pagination.search } },
            ],
          }
        : {}),
    };

    const orderBy = buildOrderBy(args.pagination, SORTABLE, "createdAt");
    const skip = (args.pagination.page - 1) * args.pagination.pageSize;
    const take = args.pagination.pageSize;

    return prisma
      .$transaction([
        prisma.mediaAsset.findMany({
          where,
          include: MEDIA_INCLUDE,
          orderBy,
          skip,
          take,
        }),
        prisma.mediaAsset.count({ where }),
      ])
      .then(([items, total]) => ({ items, total }));
  },

  async totalActiveBytes(tenantId: string): Promise<bigint> {
    const rows = await prisma.mediaAsset.aggregate({
      where: { tenantId, deletedAt: null },
      _sum: { sizeBytes: true },
    });
    return (rows._sum.sizeBytes as bigint | null) ?? 0n;
  },

  async statsByCategory(tenantId: string) {
    const rows = await prisma.mediaAsset.groupBy({
      by: ["category"],
      where: { tenantId, deletedAt: null },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    });
    return rows.map((r) => ({
      category: r.category,
      count: r._count._all,
      sizeBytes: (r._sum.sizeBytes as bigint | null) ?? 0n,
    }));
  },
};
