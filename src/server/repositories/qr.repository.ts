/**
 * QrCode + QrScan repository.
 */

import { Prisma, QrStatus, QrType } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildOrderBy, type PaginationQuery } from "@/server/utils/pagination";

const QR_INCLUDE = {
  location: { select: { id: true, name: true, slug: true, city: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.QrCodeInclude;

export type QrWithRelations = Prisma.QrCodeGetPayload<{
  include: typeof QR_INCLUDE;
}>;

const SORTABLE = ["createdAt", "updatedAt", "scanCount", "label"] as const;

export const qrRepository = {
  findByIdForTenant(id: string, tenantId: string) {
    return prisma.qrCode.findFirst({
      where: { id, tenantId },
      include: QR_INCLUDE,
    });
  },

  /** Public lookup by short code — used by the redirect endpoint. */
  findByShortCode(shortCode: string) {
    return prisma.qrCode.findUnique({ where: { shortCode } });
  },

  shortCodeExists(shortCode: string) {
    return prisma.qrCode
      .findUnique({ where: { shortCode }, select: { id: true } })
      .then(Boolean);
  },

  create(data: Prisma.QrCodeCreateInput) {
    return prisma.qrCode.create({ data, include: QR_INCLUDE });
  },

  update(id: string, data: Prisma.QrCodeUpdateInput) {
    return prisma.qrCode.update({ where: { id }, data, include: QR_INCLUDE });
  },

  delete(id: string) {
    return prisma.qrCode.delete({ where: { id } });
  },

  list(args: {
    tenantId: string;
    filter: { type?: QrType; status?: QrStatus; locationId?: string };
    pagination: PaginationQuery;
  }) {
    const f = args.filter;
    const where: Prisma.QrCodeWhereInput = {
      tenantId: args.tenantId,
      ...(f.type ? { type: f.type } : {}),
      ...(f.status ? { status: f.status } : {}),
      ...(f.locationId ? { locationId: f.locationId } : {}),
      ...(args.pagination.search
        ? {
            OR: [
              { label: { contains: args.pagination.search } },
              { targetUrl: { contains: args.pagination.search } },
            ],
          }
        : {}),
    };
    const orderBy = buildOrderBy(args.pagination, SORTABLE, "createdAt");
    const skip = (args.pagination.page - 1) * args.pagination.pageSize;
    const take = args.pagination.pageSize;
    return prisma
      .$transaction([
        prisma.qrCode.findMany({ where, include: QR_INCLUDE, orderBy, skip, take }),
        prisma.qrCode.count({ where }),
      ])
      .then(([items, total]) => ({ items, total }));
  },

  /** Record a scan + bump counters atomically. */
  async recordScan(input: {
    qrCodeId: string;
    tenantId: string;
    sessionId: string | null;
    isUnique: boolean;
    ipAddress: string | null;
    userAgent: string | null;
    browser: string | null;
    os: string | null;
    device: string | null;
    country: string | null;
    referrer: string | null;
  }) {
    await prisma.$transaction([
      prisma.qrScan.create({ data: input }),
      prisma.qrCode.update({
        where: { id: input.qrCodeId },
        data: {
          scanCount: { increment: 1 },
          ...(input.isUnique ? { uniqueScanCount: { increment: 1 } } : {}),
          lastScannedAt: new Date(),
        },
      }),
    ]);
  },

  /** Has this session already scanned this QR? (for unique counting) */
  sessionHasScanned(qrCodeId: string, sessionId: string) {
    return prisma.qrScan
      .findFirst({ where: { qrCodeId, sessionId }, select: { id: true } })
      .then(Boolean);
  },

  // ---- Analytics ----

  async analytics(qrCodeId: string, tenantId: string) {
    const [byDevice, byCountry, recent, daily] = await Promise.all([
      prisma.qrScan.groupBy({
        by: ["device"],
        where: { qrCodeId, tenantId },
        _count: { _all: true },
      }),
      prisma.qrScan.groupBy({
        by: ["country"],
        where: { qrCodeId, tenantId },
        _count: { _all: true },
      }),
      prisma.qrScan.findMany({
        where: { qrCodeId, tenantId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          device: true,
          browser: true,
          os: true,
          country: true,
          isUnique: true,
          createdAt: true,
        },
      }),
      prisma.$queryRaw<Array<{ day: string; count: bigint }>>`
        SELECT DATE(createdAt) AS day, COUNT(*) AS count
        FROM QrScan
        WHERE qrCodeId = ${qrCodeId} AND tenantId = ${tenantId}
          AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        GROUP BY DATE(createdAt)
        ORDER BY day ASC
      `,
    ]);
    return {
      byDevice: byDevice.map((d) => ({
        device: d.device ?? "unknown",
        count: d._count._all,
      })),
      byCountry: byCountry.map((c) => ({
        country: c.country ?? "unknown",
        count: c._count._all,
      })),
      recent,
      daily: daily.map((d) => ({ day: d.day, count: Number(d.count) })),
    };
  },

  statsForTenant(tenantId: string) {
    return prisma.$transaction([
      prisma.qrCode.count({ where: { tenantId } }),
      prisma.qrCode.aggregate({
        where: { tenantId },
        _sum: { scanCount: true, uniqueScanCount: true },
      }),
    ]);
  },
};
