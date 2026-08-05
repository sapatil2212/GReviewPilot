/**
 * Site + SiteRevision data access.
 *
 * Every query is tenant-scoped in its `where` clause, matching the
 * convention in location.repository.ts. Revisions live here because they are
 * only ever read through their owning site.
 */

import { Prisma, SiteRevisionKind, SiteStatus, type Site, type SiteRevision } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { buildOrderBy, type PaginationQuery } from "@/server/utils/pagination";

const SORTABLE = ["createdAt", "updatedAt", "name", "publishedAt"] as const;

/**
 * List projections deliberately omit page documents. A tenant's site list
 * would otherwise pull every node of every page — megabytes of JSON to render
 * a table of names.
 */
const SITE_LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  status: true,
  industry: true,
  locationId: true,
  logoUrl: true,
  faviconUrl: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { pages: true, domains: true } },
  domains: {
    where: { status: { not: "REMOVED" as const } },
    select: { hostname: true, isPrimary: true, status: true, sslStatus: true },
    orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
    take: 3,
  },
} satisfies Prisma.SiteSelect;

export type SiteListItem = Prisma.SiteGetPayload<{ select: typeof SITE_LIST_SELECT }>;

export const siteRepository = {
  findById(tenantId: string, id: string): Promise<Site | null> {
    return prisma.site.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  /**
   * Lookup by slug scoped to a tenant.
   *
   * `slug` is globally unique (see schema comment), so `tenantId` here is not
   * disambiguating another tenant's row — it is an access-control check: a
   * slug that exists but belongs to someone else must read as "not found" to
   * this caller, exactly like `findById`.
   */
  findBySlug(tenantId: string, slug: string): Promise<Site | null> {
    return prisma.site.findFirst({ where: { slug, tenantId, deletedAt: null } });
  },

  /** Public lookup: only published sites are visible, no tenant scope needed. */
  findPublishedBySlug(slug: string): Promise<Site | null> {
    return prisma.site.findFirst({
      where: { slug, status: SiteStatus.PUBLISHED, deletedAt: null },
    });
  },

  /**
   * Is `slug` available? Global, not tenant-scoped — a slug taken by any
   * tenant (or soft-deleted, since the platform subdomain and /s/<slug> must
   * keep working for deleted-but-not-purged rows) is unavailable to everyone.
   */
  slugExists(slug: string, excludeId?: string): Promise<boolean> {
    return prisma.site
      .count({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })
      .then((n) => n > 0);
  },

  list(args: {
    tenantId: string;
    filter: { status?: SiteStatus; includeDeleted: boolean };
    pagination: PaginationQuery;
  }): Promise<{ items: SiteListItem[]; total: number }> {
    const where: Prisma.SiteWhereInput = {
      tenantId: args.tenantId,
      ...(args.filter.includeDeleted ? {} : { deletedAt: null }),
      ...(args.filter.status ? { status: args.filter.status } : {}),
      ...(args.pagination.search
        ? {
            OR: [
              { name: { contains: args.pagination.search } },
              { slug: { contains: args.pagination.search } },
              { industry: { contains: args.pagination.search } },
            ],
          }
        : {}),
    };

    return prisma
      .$transaction([
        prisma.site.findMany({
          where,
          select: SITE_LIST_SELECT,
          orderBy: buildOrderBy(args.pagination, SORTABLE, "updatedAt"),
          skip: (args.pagination.page - 1) * args.pagination.pageSize,
          take: args.pagination.pageSize,
        }),
        prisma.site.count({ where }),
      ])
      .then(([items, total]) => ({ items, total }));
  },

  countForTenant(tenantId: string): Promise<number> {
    return prisma.site.count({ where: { tenantId, deletedAt: null } });
  },

  create(data: Prisma.SiteUncheckedCreateInput): Promise<Site> {
    return prisma.site.create({ data });
  },

  update(id: string, data: Prisma.SiteUpdateInput): Promise<Site> {
    return prisma.site.update({ where: { id }, data });
  },

  softDelete(id: string): Promise<Site> {
    return prisma.site.update({
      where: { id },
      data: { status: SiteStatus.DELETED, deletedAt: new Date() },
    });
  },

  archive(id: string): Promise<Site> {
    return prisma.site.update({
      where: { id },
      data: { status: SiteStatus.ARCHIVED, archivedAt: new Date() },
    });
  },

  // -------------------------------------------------------------------
  // Revisions
  // -------------------------------------------------------------------

  createRevision(data: Prisma.SiteRevisionUncheckedCreateInput): Promise<SiteRevision> {
    return prisma.siteRevision.create({ data });
  },

  findRevision(tenantId: string, id: string): Promise<SiteRevision | null> {
    return prisma.siteRevision.findFirst({ where: { id, tenantId } });
  },

  listRevisions(args: {
    tenantId: string;
    siteId: string;
    pageId?: string;
    pagination: PaginationQuery;
  }): Promise<{ items: Array<Omit<SiteRevision, "snapshot">>; total: number }> {
    const where: Prisma.SiteRevisionWhereInput = {
      tenantId: args.tenantId,
      siteId: args.siteId,
      ...(args.pageId ? { pageId: args.pageId } : {}),
    };

    return prisma
      .$transaction([
        prisma.siteRevision.findMany({
          where,
          // Snapshots are large; the history list only needs metadata.
          select: {
            id: true,
            siteId: true,
            tenantId: true,
            pageId: true,
            kind: true,
            label: true,
            aiPrompt: true,
            aiOperations: true,
            createdById: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
          skip: (args.pagination.page - 1) * args.pagination.pageSize,
          take: args.pagination.pageSize,
        }),
        prisma.siteRevision.count({ where }),
      ])
      .then(([items, total]) => ({ items, total }));
  },

  /**
   * Trim autosave history.
   *
   * Autosaves fire every few seconds while editing, so without pruning a
   * single page would accumulate thousands of multi-hundred-kilobyte
   * snapshots. Manual, AI, and publish revisions are never pruned — those are
   * the ones users actually roll back to.
   */
  async pruneAutosaves(siteId: string, pageId: string, keep = 20): Promise<number> {
    const stale = await prisma.siteRevision.findMany({
      where: { siteId, pageId, kind: SiteRevisionKind.AUTOSAVE },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      skip: keep,
    });
    if (stale.length === 0) return 0;
    const { count } = await prisma.siteRevision.deleteMany({
      where: { id: { in: stale.map((r) => r.id) } },
    });
    return count;
  },
};
