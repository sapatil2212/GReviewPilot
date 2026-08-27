/**
 * Location repository — branches/outlets of a tenant.
 *
 * All reads MUST include `tenantId` in the where clause — the service
 * layer never trusts the caller for tenant filtering. Soft delete is
 * implemented via `deletedAt` + `status = DELETED`.
 */

import { LocationStatus, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildOrderBy, type PaginationQuery } from "@/server/utils/pagination";

const LOCATION_INCLUDE = {
  assignedManager: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      avatar: true,
      role: true,
    },
  },
} satisfies Prisma.LocationInclude;

export type LocationWithRelations = Prisma.LocationGetPayload<{
  include: typeof LOCATION_INCLUDE;
}>;

const SORTABLE = [
  "createdAt",
  "updatedAt",
  "name",
  "city",
  "status",
] as const;

export const locationRepository = {
  findByIdForTenant(id: string, tenantId: string) {
    return prisma.location.findFirst({
      where: { id, tenantId },
      include: LOCATION_INCLUDE,
    });
  },

  findBySlugForTenant(tenantId: string, slug: string) {
    return prisma.location.findUnique({
      where: { tenantId_slug: { tenantId, slug } },
    });
  },

  findByGoogleLocationId(googleLocationId: string) {
    return prisma.location.findUnique({ where: { googleLocationId } });
  },

  findByGooglePlaceIdForTenant(googlePlaceId: string, tenantId: string) {
    return prisma.location.findFirst({
      where: { googlePlaceId, tenantId, deletedAt: null },
    });
  },

  /**
   * Locations linked via Quick Connect (Maps URL / Place ID).
   * Includes `placeIdSource: "manual"` and legacy Place-ID-only rows
   * that were never linked via Official OAuth (`googleLocationId` null).
   */
  listQuickConnected(tenantId: string) {
    return prisma.location.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: LocationStatus.ACTIVE,
        googlePlaceId: { not: null },
        OR: [
          { placeIdSource: "manual" },
          { placeIdSource: null, googleLocationId: null },
        ],
      },
      include: LOCATION_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
  },

  create(data: Prisma.LocationCreateInput) {
    return prisma.location.create({ data, include: LOCATION_INCLUDE });
  },

  update(id: string, data: Prisma.LocationUpdateInput) {
    return prisma.location.update({
      where: { id },
      data,
      include: LOCATION_INCLUDE,
    });
  },

  countActiveForTenant(tenantId: string) {
    return prisma.location.count({
      where: { tenantId, deletedAt: null, status: LocationStatus.ACTIVE },
    });
  },

  countForTenant(tenantId: string, where: Prisma.LocationWhereInput = {}) {
    return prisma.location.count({ where: { tenantId, ...where } });
  },

  list(args: {
    tenantId: string;
    filter: {
      status?: LocationStatus;
      managerId?: string;
      includeDeleted: boolean;
    };
    pagination: PaginationQuery;
  }): Promise<{ items: LocationWithRelations[]; total: number }> {
    const where: Prisma.LocationWhereInput = {
      tenantId: args.tenantId,
      ...(args.filter.includeDeleted ? {} : { deletedAt: null }),
      ...(args.filter.status ? { status: args.filter.status } : {}),
      ...(args.filter.managerId
        ? { assignedManagerId: args.filter.managerId }
        : {}),
      ...(args.pagination.search
        ? {
            OR: [
              { name: { contains: args.pagination.search } },
              { city: { contains: args.pagination.search } },
              { addressLine1: { contains: args.pagination.search } },
              { storeCode: { contains: args.pagination.search } },
            ],
          }
        : {}),
    };

    const orderBy = buildOrderBy(args.pagination, SORTABLE, "createdAt");
    const skip = (args.pagination.page - 1) * args.pagination.pageSize;
    const take = args.pagination.pageSize;

    return prisma.$transaction([
      prisma.location.findMany({
        where,
        include: LOCATION_INCLUDE,
        orderBy,
        skip,
        take,
      }),
      prisma.location.count({ where }),
    ]).then(([items, total]) => ({ items, total }));
  },

  softDelete(id: string) {
    return prisma.location.update({
      where: { id },
      data: {
        status: LocationStatus.DELETED,
        deletedAt: new Date(),
      },
    });
  },

  archive(id: string) {
    return prisma.location.update({
      where: { id },
      data: {
        status: LocationStatus.ARCHIVED,
        archivedAt: new Date(),
      },
      include: LOCATION_INCLUDE,
    });
  },

  restore(id: string) {
    return prisma.location.update({
      where: { id },
      data: {
        status: LocationStatus.ACTIVE,
        archivedAt: null,
        deletedAt: null,
      },
      include: LOCATION_INCLUDE,
    });
  },
};
