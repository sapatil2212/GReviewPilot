/**
 * SiteDomain data access.
 *
 * `hostname` is globally unique rather than unique-per-tenant: a hostname
 * resolves to exactly one site across the whole platform, so allowing two
 * tenants to register the same one would make routing ambiguous and enable
 * domain hijacking.
 */

import { Prisma, SiteDomainStatus, type SiteDomain } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export const siteDomainRepository = {
  findById(tenantId: string, id: string): Promise<SiteDomain | null> {
    return prisma.siteDomain.findFirst({ where: { id, tenantId } });
  },

  /** Global lookup used by the request router; deliberately not tenant-scoped. */
  findByHostname(hostname: string): Promise<SiteDomain | null> {
    return prisma.siteDomain.findUnique({ where: { hostname } });
  },

  findConnectedByHostname(hostname: string): Promise<SiteDomain | null> {
    return prisma.siteDomain.findFirst({
      where: { hostname, status: SiteDomainStatus.CONNECTED },
    });
  },

  listForSite(siteId: string): Promise<SiteDomain[]> {
    return prisma.siteDomain.findMany({
      where: { siteId, status: { not: SiteDomainStatus.REMOVED } },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
  },

  findPrimary(siteId: string): Promise<SiteDomain | null> {
    return prisma.siteDomain.findFirst({
      where: { siteId, isPrimary: true, status: SiteDomainStatus.CONNECTED },
    });
  },

  create(data: Prisma.SiteDomainUncheckedCreateInput): Promise<SiteDomain> {
    return prisma.siteDomain.create({ data });
  },

  update(id: string, data: Prisma.SiteDomainUpdateInput): Promise<SiteDomain> {
    return prisma.siteDomain.update({ where: { id }, data });
  },

  /**
   * Promote a domain to primary, demoting any other.
   *
   * Transactional for the same reason as the home page: "at most one primary"
   * is an invariant that must never be briefly violated, or a concurrent
   * request could observe two primaries and build the wrong canonical URL.
   */
  setPrimary(siteId: string, domainId: string): Promise<void> {
    return prisma
      .$transaction([
        prisma.siteDomain.updateMany({
          where: { siteId, isPrimary: true },
          data: { isPrimary: false },
        }),
        prisma.siteDomain.update({ where: { id: domainId }, data: { isPrimary: true } }),
      ])
      .then(() => undefined);
  },

  /**
   * Hard delete rather than a status change.
   *
   * `hostname` is globally unique, so keeping a REMOVED row would permanently
   * block anyone (including the same tenant) from re-adding that domain.
   */
  remove(id: string): Promise<SiteDomain> {
    return prisma.siteDomain.delete({ where: { id } });
  },

  /** Domains awaiting verification, for the background checker. */
  listPendingVerification(limit = 50): Promise<SiteDomain[]> {
    return prisma.siteDomain.findMany({
      where: {
        status: { in: [SiteDomainStatus.PENDING, SiteDomainStatus.VERIFYING] },
      },
      orderBy: { lastCheckedAt: "asc" },
      take: limit,
    });
  },
};
