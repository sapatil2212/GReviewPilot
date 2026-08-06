/**
 * Page CRUD and document saves.
 *
 * The interesting operation is `saveDocument`, which is called on every
 * autosave and therefore has to be both cheap and safe against concurrent
 * editors.
 */

import { AuditAction, Prisma, SiteRevisionKind, type SitePage } from "@prisma/client";
import type { AuthContext } from "@/server/auth/requireSession";
import { auditRepository } from "@/server/repositories/audit.repository";
import { siteRepository } from "@/server/repositories/site.repository";
import { sitePageRepository } from "@/server/repositories/sitePage.repository";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { ConflictError, NotFoundError, ValidationError } from "@/server/utils/errors";
import { normalizeDocument } from "@/site/document/operations";
import { coerceProps } from "@/site/registry/definitions";
import type { SeoMeta, SiteDocument } from "@/site/document/types";
import {
  buildHtmlPageDocument,
  buildStarterDocument,
  pageDocument,
  siteBrand,
  slugify,
} from "./site.service";

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * Validate every node's props against its registry schema.
 *
 * The document schema in site.schema.ts checks structure; this checks
 * semantics. Invalid props are replaced with defaults rather than rejected, so
 * one stale field from an older client version cannot make a page unsavable
 * and lose the author's work. Anything corrected is reported so the caller can
 * warn instead of silently changing content.
 */
function validateNodeProps(document: SiteDocument): { document: SiteDocument; corrected: string[] } {
  const corrected: string[] = [];
  const nodes = { ...document.nodes };

  for (const [id, node] of Object.entries(nodes)) {
    const result = coerceProps(node.type, node.props);
    if (!result.valid) corrected.push(`${node.type} (${id})`);
    nodes[id] = { ...node, props: result.props };
  }

  return { document: { ...document, nodes }, corrected };
}

async function requirePage(ctx: AuthContext, siteId: string, pageId: string): Promise<SitePage> {
  const page = await sitePageRepository.findById(ctx.tenantId, pageId);
  // Checking siteId as well as tenantId stops a page id from one site being
  // edited through another site's route.
  if (!page || page.siteId !== siteId) throw new NotFoundError("Page not found");
  return page;
}

export const sitePageService = {
  async list(ctx: AuthContext, siteId: string) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");
    return sitePageRepository.listMeta(site.id);
  },

  /** Full page including the draft document, for the editor. */
  async get(ctx: AuthContext, siteId: string, pageId: string) {
    const page = await requirePage(ctx, siteId, pageId);
    return {
      id: page.id,
      siteId: page.siteId,
      title: page.title,
      path: page.path,
      status: page.status,
      isHome: page.isHome,
      hiddenInNav: page.hiddenInNav,
      noIndex: page.noIndex,
      sortOrder: page.sortOrder,
      seo: (page.seo ?? {}) as SeoMeta,
      document: pageDocument(page),
      publishedAt: page.publishedAt,
      // The client echoes this back on save for optimistic concurrency.
      version: page.updatedAt.toISOString(),
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
    };
  },

  async create(
    ctx: AuthContext,
    siteId: string,
    input: {
      title: string;
      path: string;
      presets?: string[];
      html?: string;
      isHome: boolean;
      hiddenInNav: boolean;
    },
    req?: Request,
  ) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    const path = input.isHome ? "/" : input.path || `/${slugify(input.title)}`;
    if (await sitePageRepository.pathExists(site.id, path)) {
      throw new ConflictError("CONFLICT", `A page already exists at ${path}`);
    }

    const brand = siteBrand(site);
    const existing = await sitePageRepository.listMeta(site.id);

    // A pasted landing page becomes a single sandboxed block that fills the
    // page; otherwise the page is seeded from section presets (header + footer
    // at minimum) so it stays consistent with the rest of the site.
    const document = input.html?.trim()
      ? buildHtmlPageDocument(input.html, input.title)
      : buildStarterDocument(input.presets?.length ? input.presets : ["navbar", "footer"], {
          businessName: brand.businessName,
          phone: brand.phone,
          whatsapp: brand.whatsapp,
          email: brand.email,
          address: brand.address,
          title: input.title,
        });

    const page = await sitePageRepository.create({
      siteId: site.id,
      tenantId: ctx.tenantId,
      title: input.title,
      path,
      hiddenInNav: input.hiddenInNav,
      sortOrder: existing.length,
      document: toJson(document),
    });

    if (input.isHome) await sitePageRepository.setHome(site.id, page.id);

    await auditRepository.record({
      action: AuditAction.SITE_PAGE_CREATED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId: site.id, pageId: page.id, path },
      ...(req ? extractRequestContext(req) : {}),
    });

    return page;
  },

  async update(
    ctx: AuthContext,
    siteId: string,
    pageId: string,
    input: {
      title?: string;
      path?: string;
      seo?: SeoMeta;
      hiddenInNav?: boolean;
      noIndex?: boolean;
      sortOrder?: number;
      status?: SitePage["status"];
    },
    req?: Request,
  ) {
    const page = await requirePage(ctx, siteId, pageId);

    if (input.path && input.path !== page.path) {
      if (page.isHome) {
        // The home page owns "/" by definition; moving it would leave the site
        // root without a page.
        throw new ValidationError("The home page must stay at /");
      }
      if (await sitePageRepository.pathExists(page.siteId, input.path, page.id)) {
        throw new ConflictError("CONFLICT", `A page already exists at ${input.path}`);
      }
    }

    const updated = await sitePageRepository.update(page.id, {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.path !== undefined && !page.isHome ? { path: input.path } : {}),
      ...(input.seo ? { seo: toJson({ ...((page.seo ?? {}) as SeoMeta), ...input.seo }) } : {}),
      ...(input.hiddenInNav !== undefined ? { hiddenInNav: input.hiddenInNav } : {}),
      ...(input.noIndex !== undefined ? { noIndex: input.noIndex } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    });

    await auditRepository.record({
      action: AuditAction.SITE_PAGE_UPDATED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId, pageId: page.id },
      ...(req ? extractRequestContext(req) : {}),
    });

    return updated;
  },

  /**
   * Persist a page's node tree.
   *
   * Three things happen in order, and the order matters:
   *   1. optimistic concurrency check, so a stale tab cannot clobber newer work
   *   2. prop validation + document repair, so what lands in the DB is always
   *      renderable
   *   3. revision snapshot for manual saves only — autosaves fire every few
   *      seconds and would otherwise flood the history
   */
  async saveDocument(
    ctx: AuthContext,
    siteId: string,
    pageId: string,
    input: { document: SiteDocument; expectedVersion?: string; autosave: boolean },
    req?: Request,
  ) {
    const page = await requirePage(ctx, siteId, pageId);

    if (input.expectedVersion) {
      const current = page.updatedAt.toISOString();
      if (current !== input.expectedVersion) {
        throw new ConflictError(
          "CONFLICT",
          "This page was changed somewhere else. Reload to get the latest version before saving.",
        );
      }
    }

    const repaired = normalizeDocument(input.document);
    const { document, corrected } = validateNodeProps(repaired);

    if (!input.autosave) {
      // Snapshot the PREVIOUS document, so restoring this revision undoes the
      // save the user is about to make.
      await siteRepository.createRevision({
        siteId,
        tenantId: ctx.tenantId,
        pageId: page.id,
        kind: SiteRevisionKind.MANUAL,
        label: `Edited "${page.title}"`,
        snapshot: toJson(pageDocument(page)),
        createdById: ctx.userId,
      });
    } else {
      await siteRepository.createRevision({
        siteId,
        tenantId: ctx.tenantId,
        pageId: page.id,
        kind: SiteRevisionKind.AUTOSAVE,
        snapshot: toJson(pageDocument(page)),
        createdById: ctx.userId,
      });
      // Keep the autosave ring buffer bounded. Best-effort: a failed prune
      // must not fail the user's save.
      void siteRepository.pruneAutosaves(siteId, page.id).catch(() => undefined);
    }

    const updated = await sitePageRepository.update(page.id, { document: toJson(document) });

    if (!input.autosave) {
      await auditRepository.record({
        action: AuditAction.SITE_PAGE_UPDATED,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        metadata: { siteId, pageId: page.id, nodeCount: Object.keys(document.nodes).length },
        ...(req ? extractRequestContext(req) : {}),
      });
    }

    return {
      version: updated.updatedAt.toISOString(),
      nodeCount: Object.keys(document.nodes).length,
      corrected,
    };
  },

  async duplicate(ctx: AuthContext, siteId: string, pageId: string, req?: Request) {
    const page = await requirePage(ctx, siteId, pageId);
    const existing = await sitePageRepository.listMeta(siteId);

    // Find a free "-copy", "-copy-2", ... path.
    const base = page.path === "/" ? "/home" : page.path;
    let path = `${base}-copy`;
    let n = 1;
    while (existing.some((p) => p.path === path) && n < 50) {
      n += 1;
      path = `${base}-copy-${n}`;
    }

    const copy = await sitePageRepository.create({
      siteId,
      tenantId: ctx.tenantId,
      title: `${page.title} copy`,
      path,
      // A duplicate is never home and never published — it starts as a draft
      // the author can edit before exposing it.
      isHome: false,
      hiddenInNav: true,
      sortOrder: existing.length,
      seo: (page.seo ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      document: toJson(pageDocument(page)),
    });

    await auditRepository.record({
      action: AuditAction.SITE_PAGE_DUPLICATED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId, sourcePageId: page.id, pageId: copy.id },
      ...(req ? extractRequestContext(req) : {}),
    });

    return copy;
  },

  async setHome(ctx: AuthContext, siteId: string, pageId: string, req?: Request) {
    const page = await requirePage(ctx, siteId, pageId);
    const currentHome = await sitePageRepository.findHome(siteId);

    // The outgoing home page needs a real path, since "/" is about to be taken.
    if (currentHome && currentHome.id !== page.id) {
      const fallback = `/${slugify(currentHome.title) || "home"}`;
      const taken = await sitePageRepository.pathExists(siteId, fallback, currentHome.id);
      await sitePageRepository.update(currentHome.id, {
        path: taken ? `${fallback}-${currentHome.id.slice(0, 5)}` : fallback,
      });
    }

    await sitePageRepository.setHome(siteId, page.id);

    await auditRepository.record({
      action: AuditAction.SITE_PAGE_UPDATED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId, pageId: page.id, isHome: true },
      ...(req ? extractRequestContext(req) : {}),
    });
  },

  async reorder(ctx: AuthContext, siteId: string, pageIds: string[], req?: Request) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    await sitePageRepository.reorder(site.id, pageIds);

    await auditRepository.record({
      action: AuditAction.SITE_PAGE_REORDERED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId, count: pageIds.length },
      ...(req ? extractRequestContext(req) : {}),
    });
  },

  async remove(ctx: AuthContext, siteId: string, pageId: string, req?: Request) {
    const page = await requirePage(ctx, siteId, pageId);
    if (page.isHome) {
      throw new ValidationError(
        "You cannot delete the home page. Make another page the home page first.",
      );
    }

    await sitePageRepository.softDelete(page.id);

    await auditRepository.record({
      action: AuditAction.SITE_PAGE_DELETED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId, pageId: page.id, path: page.path },
      ...(req ? extractRequestContext(req) : {}),
    });
  },
};
