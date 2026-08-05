/**
 * SitePage data access.
 *
 * Two projections matter here:
 *   - `PAGE_META_SELECT` for lists and nav (no documents)
 *   - full rows only when a specific page is being edited or rendered
 *
 * Loading documents into a list would make opening the editor scale with the
 * total size of every page in the site rather than the one being edited.
 */

import { Prisma, SitePageStatus, type SitePage } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

const PAGE_META_SELECT = {
  id: true,
  siteId: true,
  tenantId: true,
  title: true,
  path: true,
  status: true,
  isHome: true,
  seo: true,
  sortOrder: true,
  hiddenInNav: true,
  noIndex: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SitePageSelect;

export type SitePageMeta = Prisma.SitePageGetPayload<{ select: typeof PAGE_META_SELECT }>;

export const sitePageRepository = {
  findById(tenantId: string, id: string): Promise<SitePage | null> {
    return prisma.sitePage.findFirst({ where: { id, tenantId, deletedAt: null } });
  },

  findByPath(siteId: string, path: string): Promise<SitePage | null> {
    return prisma.sitePage.findFirst({ where: { siteId, path, deletedAt: null } });
  },

  /**
   * Public page fetch. Only returns pages that have actually been published,
   * so an unpublished draft is a 404 rather than a leak of work in progress.
   */
  findPublished(siteId: string, path: string): Promise<SitePage | null> {
    return prisma.sitePage.findFirst({
      where: {
        siteId,
        path,
        deletedAt: null,
        status: SitePageStatus.PUBLISHED,
        publishedDocument: { not: Prisma.DbNull },
      },
    });
  },

  findHome(siteId: string): Promise<SitePage | null> {
    return prisma.sitePage.findFirst({
      where: { siteId, isHome: true, deletedAt: null },
    });
  },

  /** Page metadata for the editor's page list and the rendered nav. */
  listMeta(siteId: string): Promise<SitePageMeta[]> {
    return prisma.sitePage.findMany({
      where: { siteId, deletedAt: null },
      select: PAGE_META_SELECT,
      orderBy: [{ isHome: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
  },

  /** Published pages only, for the public nav and sitemap. */
  listPublishedMeta(siteId: string): Promise<SitePageMeta[]> {
    return prisma.sitePage.findMany({
      where: { siteId, deletedAt: null, status: SitePageStatus.PUBLISHED },
      select: PAGE_META_SELECT,
      orderBy: [{ isHome: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
  },

  listAll(siteId: string): Promise<SitePage[]> {
    return prisma.sitePage.findMany({
      where: { siteId, deletedAt: null },
      orderBy: [{ isHome: "desc" }, { sortOrder: "asc" }],
    });
  },

  /**
   * Is a path taken by a LIVE page?
   *
   * Must filter `deletedAt: null` to match the unique index, which includes
   * `deletedAt`. Without the filter, a previously deleted page would make its
   * path look permanently unavailable.
   */
  pathExists(siteId: string, path: string, excludeId?: string): Promise<boolean> {
    return prisma.sitePage
      .count({
        where: {
          siteId,
          path,
          deletedAt: null,
          ...(excludeId ? { id: { not: excludeId } } : {}),
        },
      })
      .then((n) => n > 0);
  },

  /**
   * Permanently remove pages, used when regenerating a site.
   *
   * A hard delete rather than a soft one: "replace existing pages" means
   * replace, the previous content is already captured in an AI_EDIT revision
   * snapshot, and leaving the rows behind would clutter every path lookup.
   */
  hardDeleteAll(siteId: string): Promise<Prisma.BatchPayload> {
    return prisma.sitePage.deleteMany({ where: { siteId } });
  },

  create(data: Prisma.SitePageUncheckedCreateInput): Promise<SitePage> {
    return prisma.sitePage.create({ data });
  },

  createMany(rows: Prisma.SitePageUncheckedCreateInput[]): Promise<Prisma.BatchPayload> {
    return prisma.sitePage.createMany({ data: rows });
  },

  update(id: string, data: Prisma.SitePageUpdateInput): Promise<SitePage> {
    return prisma.sitePage.update({ where: { id }, data });
  },

  softDelete(id: string): Promise<SitePage> {
    return prisma.sitePage.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  /**
   * Promote a page to home.
   *
   * Wrapped in a transaction because "exactly one home page" is an invariant
   * the schema cannot express: clearing the old flag and setting the new one
   * must not be observable as two separate states.
   */
  setHome(siteId: string, pageId: string): Promise<void> {
    return prisma
      .$transaction([
        prisma.sitePage.updateMany({
          where: { siteId, isHome: true },
          data: { isHome: false },
        }),
        prisma.sitePage.update({
          where: { id: pageId },
          data: { isHome: true, path: "/" },
        }),
      ])
      .then(() => undefined);
  },

  reorder(siteId: string, pageIds: string[]): Promise<void> {
    return prisma
      .$transaction(
        pageIds.map((id, index) =>
          prisma.sitePage.updateMany({
            // Scoped by siteId as well as id so a caller cannot reorder
            // another site's pages by passing foreign ids.
            where: { id, siteId },
            data: { sortOrder: index },
          }),
        ),
      )
      .then(() => undefined);
  },

  /** Copy draft documents into the published snapshot. */
  publishPages(siteId: string, pageIds?: string[]): Promise<number> {
    return prisma.sitePage
      .findMany({
        where: {
          siteId,
          deletedAt: null,
          ...(pageIds?.length ? { id: { in: pageIds } } : {}),
        },
        select: { id: true, document: true },
      })
      .then(async (pages) => {
        if (pages.length === 0) return 0;
        const now = new Date();
        await prisma.$transaction(
          pages.map((page) =>
            prisma.sitePage.update({
              where: { id: page.id },
              data: {
                publishedDocument: page.document as Prisma.InputJsonValue,
                status: SitePageStatus.PUBLISHED,
                publishedAt: now,
              },
            }),
          ),
        );
        return pages.length;
      });
  },

  unpublishAll(siteId: string): Promise<Prisma.BatchPayload> {
    return prisma.sitePage.updateMany({
      where: { siteId },
      data: { status: SitePageStatus.DRAFT },
    });
  },
};
