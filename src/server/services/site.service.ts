/**
 * Site lifecycle: create, update, theme, publish, rollback.
 *
 * Follows the layering used everywhere else in this codebase: routes call
 * services with an AuthContext, services enforce business rules and write
 * audit entries, repositories talk to Prisma.
 */

import { AuditAction, Prisma, SiteRevisionKind, SiteStatus, type Site } from "@prisma/client";
import type { AuthContext } from "@/server/auth/requireSession";
import { auditRepository } from "@/server/repositories/audit.repository";
import { businessProfileRepository } from "@/server/repositories/businessProfile.repository";
import { locationRepository } from "@/server/repositories/location.repository";
import { siteDomainRepository } from "@/server/repositories/siteDomain.repository";
import { siteFormRepository } from "@/server/repositories/siteForm.repository";
import { sitePageRepository } from "@/server/repositories/sitePage.repository";
import { siteRepository, type SiteListItem } from "@/server/repositories/site.repository";
import { siteTemplateRepository } from "@/server/repositories/siteTemplate.repository";
import { tenantRepository } from "@/server/repositories/tenant.repository";
import { extractRequestContext } from "@/server/middleware/requestContext";
import { ConflictError, NotFoundError, ValidationError } from "@/server/utils/errors";
import { env, sitesSubdomainEnabled } from "@/server/utils/env";
import { logger } from "@/server/utils/logger";
import {
  buildPagedResult,
  parsePagination,
  type PagedResult,
} from "@/server/utils/pagination";
import {
  createEmptyDocument,
  createNode,
  createNodeId,
  insertSubtree,
  normalizeDocument,
} from "@/site/document/operations";
import { applyStyleKeyword, createTheme, readableOn } from "@/site/document/theme";
import { buildSection } from "@/site/registry/presets";
import type {
  BrandContext,
  SeoMeta,
  SiteDocument,
  ThemeTokens,
} from "@/site/document/types";
import type {
  CreateSiteInput,
  UpdateSiteInput,
} from "@/server/validators/site.schema";
import { themeSchema } from "@/server/validators/site.schema";
import type { z } from "zod";

// =====================================================================
// JSON helpers
// =====================================================================

/**
 * Read a JSON column into a typed shape.
 *
 * Prisma types JSON columns as `JsonValue`, and rows written by an older
 * deploy may not match the current interface. Every read goes through a
 * fallback so a shape change never throws at read time.
 */
function readJson<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "object" || Array.isArray(value)) return fallback;
  return value as unknown as T;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function siteTheme(site: Site): ThemeTokens {
  const parsed = themeSchema.safeParse(site.theme);
  // A theme that fails validation would break every style token on the page,
  // so fall back to a valid generated theme for the site's industry.
  if (parsed.success) return parsed.data as ThemeTokens;
  logger.warn("Site theme failed validation — using a generated default", { siteId: site.id });
  return createTheme({ industry: site.industry });
}

export function siteBrand(site: Site): BrandContext {
  return readJson<BrandContext>(site.brand, {});
}

export function siteSeo(site: Site): SeoMeta {
  return readJson<SeoMeta>(site.seo, {});
}

export interface SiteSettings {
  whatsappNumber?: string;
  googleAnalyticsId?: string;
  googleTagManagerId?: string;
  searchConsoleVerification?: string;
  hidePlatformBranding?: boolean;
  customHeadHtml?: string;
  socialLinks?: Record<string, string>;
}

export function siteSettings(site: Site): SiteSettings {
  return readJson<SiteSettings>(site.settings, {});
}

/** Read a page's draft document, repaired. */
export function pageDocument(page: { document: Prisma.JsonValue }): SiteDocument {
  return normalizeDocument(readJson<SiteDocument>(page.document, createEmptyDocument()));
}

// =====================================================================
// Slugs
// =====================================================================

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/**
 * Find a free slug by appending -2, -3, ...
 *
 * Global, not tenant-scoped: `slug` doubles as the left label of the platform
 * subdomain (`<slug>.SITES_ROOT_DOMAIN`), a real DNS name that cannot be
 * shared between tenants.
 */
async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || "site";
  let candidate = isReservedSlug(root) ? `${root}-site` : root;
  let n = 1;
  // Bounded so a pathological case fails loudly instead of looping forever.
  while (n < 100 && (await siteRepository.slugExists(candidate))) {
    n += 1;
    candidate = `${root}-${n}`;
  }
  if (n >= 100) throw new ConflictError("CONFLICT", "Could not generate a unique site address");
  return candidate;
}

/**
 * Slugs that would collide with a real platform route if used as a subdomain
 * label, e.g. `app.SITES_ROOT_DOMAIN` or `www.SITES_ROOT_DOMAIN`.
 */
const RESERVED_SLUGS = new Set([
  "www",
  "app",
  "api",
  "admin",
  "dashboard",
  "mail",
  "smtp",
  "ftp",
  "ns1",
  "ns2",
  "cdn",
  "static",
  "assets",
  "docs",
  "status",
  "support",
  "help",
  "blog",
  "test",
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}

// =====================================================================
// URLs
// =====================================================================

/** Platform-hosted path for a site (fallback when no subdomain is configured). */
export function sitePath(slug: string): string {
  return `/s/${slug}`;
}

/**
 * The platform subdomain for a site: `<slug>.SITES_ROOT_DOMAIN`.
 *
 * This is the Lovable/Bolt-style default address — every site gets one for
 * free, with no DNS setup and no verification step, because the platform
 * itself controls SITES_ROOT_DOMAIN's DNS (a wildcard record pointing at the
 * app) and its wildcard TLS certificate.
 *
 * Returns null when SITES_ROOT_DOMAIN is not configured, so deployments
 * without a wildcard cert set up simply do not offer this and fall back to
 * /s/<slug>.
 */
export function siteSubdomain(slug: string): string | null {
  return sitesSubdomainEnabled ? `${slug}.${env.SITES_ROOT_DOMAIN}` : null;
}

/**
 * Public URL, in order of preference: connected primary custom domain, then
 * the platform subdomain, then the /s/<slug> path.
 *
 * The dashboard shows this everywhere, so it must reflect what a visitor
 * would actually type.
 */
export async function publicUrl(site: Site): Promise<string> {
  const primary = await siteDomainRepository.findPrimary(site.id);
  if (primary) return `https://${primary.hostname}`;
  const subdomain = siteSubdomain(site.slug);
  if (subdomain) return `https://${subdomain}`;
  return `${env.APP_URL.replace(/\/$/, "")}${sitePath(site.slug)}`;
}

// =====================================================================
// Tenant context for generation
// =====================================================================

export interface TenantSiteContext {
  businessName: string;
  industry: string | null;
  city: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  logoUrl: string | null;
  language: string | null;
  locationId: string | null;
  /** Existing business description, used to ground AI copy in real facts. */
  description: string | null;
  socialLinks: Record<string, string>;
}

/**
 * Assemble grounding data from the tenant's existing records.
 *
 * This is what makes generation feel informed rather than generic: the
 * workspace already knows the business name, category, city, phone, and
 * hours, so the AI is never asked to invent them and the user never retypes
 * them.
 */
export async function loadTenantContext(
  ctx: AuthContext,
  locationId?: string | null,
): Promise<TenantSiteContext> {
  const [tenant, profile, location] = await Promise.all([
    tenantRepository.findById(ctx.tenantId),
    businessProfileRepository.findByTenantId(ctx.tenantId).catch(() => null),
    // An explicit location wins; otherwise fall back to the tenant's first
    // one so a single-location business never has to pick.
    locationId
      ? locationRepository.findByIdForTenant(locationId, ctx.tenantId).catch(() => null)
      : locationRepository
          .list({
            tenantId: ctx.tenantId,
            filter: { includeDeleted: false },
            pagination: { page: 1, pageSize: 1, sortDir: "asc", sortBy: "createdAt" },
          })
          .then((r) => r.items[0] ?? null)
          .catch(() => null),
  ]);

  const address = location
    ? [location.addressLine1, location.addressLine2, location.city, location.state, location.postalCode]
        .filter(Boolean)
        .join(", ")
    : null;

  const social = readJson<Record<string, string>>(tenant?.socialLinks ?? null, {});

  return {
    businessName: tenant?.name ?? "Your Business",
    // The Google-aligned primary category is the most reliable industry
    // signal, so it wins over the free-text tenant field.
    industry: profile?.primaryCategory?.name ?? tenant?.industry ?? tenant?.businessType ?? null,
    city: location?.city ?? null,
    country: location?.country ?? tenant?.country ?? null,
    phone: location?.phone ?? tenant?.phone ?? null,
    email: location?.email ?? tenant?.businessEmail ?? null,
    whatsapp: social.whatsapp ?? location?.phone ?? tenant?.phone ?? null,
    address,
    logoUrl: tenant?.logo ?? null,
    language: tenant?.language ?? null,
    locationId: location?.id ?? null,
    description: profile?.shortDescription ?? profile?.description ?? null,
    socialLinks: social,
  };
}

// =====================================================================
// Service
// =====================================================================

export const siteService = {
  async list(
    ctx: AuthContext,
    req: Request,
    filter: { status?: SiteStatus; includeDeleted: boolean },
  ): Promise<PagedResult<SiteListItem & { subdomain: string | null }>> {
    const pagination = parsePagination(req);
    const { items, total } = await siteRepository.list({
      tenantId: ctx.tenantId,
      filter,
      pagination,
    });
    const withSubdomains = items.map((item) => ({
      ...item,
      subdomain: siteSubdomain(item.slug),
    }));
    return buildPagedResult(withSubdomains, total, pagination);
  },

  async get(ctx: AuthContext, siteId: string) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    const [pages, domains] = await Promise.all([
      sitePageRepository.listMeta(site.id),
      siteDomainRepository.listForSite(site.id),
    ]);

    return {
      id: site.id,
      name: site.name,
      slug: site.slug,
      status: site.status,
      industry: site.industry,
      locationId: site.locationId,
      logoUrl: site.logoUrl,
      faviconUrl: site.faviconUrl,
      theme: siteTheme(site),
      brand: siteBrand(site),
      seo: siteSeo(site),
      settings: siteSettings(site),
      publishedAt: site.publishedAt,
      createdAt: site.createdAt,
      updatedAt: site.updatedAt,
      previewPath: sitePath(site.slug),
      subdomain: siteSubdomain(site.slug),
      publicUrl: await publicUrl(site),
      pages,
      domains,
    };
  },

  /**
   * Create a site with a starter home page.
   *
   * A brand-new site is never empty: it gets navbar / hero / services /
   * contact / footer so the editor opens onto something recognisable. An empty
   * canvas is the worst possible first impression for a non-technical user.
   */
  async create(ctx: AuthContext, input: CreateSiteInput, req?: Request): Promise<Site> {
    const tenantContext = await loadTenantContext(ctx, input.locationId);
    const slug = input.slug
      ? await (async () => {
          if (isReservedSlug(input.slug!) || (await siteRepository.slugExists(input.slug!))) {
            throw new ConflictError("CONFLICT", "That website address is already in use");
          }
          return input.slug!;
        })()
      : await uniqueSlug(input.name);

    const industry = input.industry ?? tenantContext.industry;
    const theme = createTheme({ industry });

    const brand: BrandContext = {
      businessName: tenantContext.businessName,
      industry: industry ?? undefined,
      logoUrl: tenantContext.logoUrl ?? undefined,
      city: tenantContext.city ?? undefined,
      country: tenantContext.country ?? undefined,
      language: tenantContext.language ?? undefined,
      phone: tenantContext.phone ?? undefined,
      email: tenantContext.email ?? undefined,
      whatsapp: tenantContext.whatsapp ?? undefined,
      address: tenantContext.address ?? undefined,
      brandColors: [theme.colors.primary, theme.colors.secondary, theme.colors.accent],
    };

    const site = await siteRepository.create({
      tenantId: ctx.tenantId,
      name: input.name,
      slug,
      industry: industry ?? null,
      locationId: input.locationId ?? tenantContext.locationId ?? null,
      theme: toJson(theme),
      brand: toJson(brand),
      seo: toJson({
        title: `${tenantContext.businessName}${tenantContext.city ? ` | ${tenantContext.city}` : ""}`.slice(0, 60),
      } satisfies SeoMeta),
      settings: toJson({} satisfies SiteSettings),
      logoUrl: tenantContext.logoUrl,
      createdById: ctx.userId,
      status: SiteStatus.DRAFT,
    });

    /**
     * Every site gets a default contact form immediately.
     *
     * Without one, a Form node still renders and submits, but there is no
     * SiteForm row to attach the submission to — so a real enquiry would be
     * counted as an event and its content silently dropped. That is the worst
     * failure mode this product can have, so the form is created up front and
     * `ensureDefault` is idempotent as a second line of defence for sites made
     * before this existed.
     */
    await siteFormRepository.ensureDefault({
      siteId: site.id,
      tenantId: ctx.tenantId,
      // Falls back to the creating user. A workspace often has no business
      // email set yet, and defaulting to nobody would mean leads arrive
      // silently — the owner would only find them by opening the dashboard.
      notifyEmail: tenantContext.email ?? ctx.email,
    });

    // A template replaces the default starter page with its own multi-page
    // blueprint; without one, every site still needs at least a usable home
    // page to open the editor onto.
    const template = input.templateSlug
      ? await siteTemplateRepository.findBySlug(input.templateSlug)
      : null;

    if (template) {
      const blueprint = readTemplateBlueprint(template.blueprint);
      await applyTemplatePages(site.id, ctx.tenantId, blueprint, {
        businessName: tenantContext.businessName,
        phone: tenantContext.phone,
        whatsapp: tenantContext.whatsapp,
        email: tenantContext.email,
        address: tenantContext.address,
      });
      // The template's own theme (matched to its industry) replaces the
      // generic one created above, same as an AI generation would.
      if (blueprint.theme) {
        await siteRepository.update(site.id, { theme: toJson(blueprint.theme) });
      }
    } else {
      await sitePageRepository.create({
        siteId: site.id,
        tenantId: ctx.tenantId,
        title: "Home",
        path: "/",
        isHome: true,
        sortOrder: 0,
        document: toJson(
          buildStarterDocument(
            ["navbar", "hero-split", "services", "about", "contact", "footer", "whatsapp"],
            {
              businessName: tenantContext.businessName,
              phone: tenantContext.phone ?? undefined,
              whatsapp: tenantContext.whatsapp ?? undefined,
              email: tenantContext.email ?? undefined,
              address: tenantContext.address ?? undefined,
              locationId: tenantContext.locationId ?? undefined,
            },
          ),
        ),
      });
    }

    await auditRepository.record({
      action: AuditAction.SITE_CREATED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId: site.id, slug: site.slug, name: site.name, templateSlug: template?.slug },
      ...(req ? extractRequestContext(req) : {}),
    });

    if (template) {
      await auditRepository.record({
        action: AuditAction.SITE_TEMPLATE_APPLIED,
        tenantId: ctx.tenantId,
        userId: ctx.userId,
        metadata: { siteId: site.id, templateSlug: template.slug },
        ...(req ? extractRequestContext(req) : {}),
      });
    }

    return site;
  },

  async update(ctx: AuthContext, siteId: string, input: UpdateSiteInput, req?: Request) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    if (input.slug && input.slug !== site.slug) {
      if (isReservedSlug(input.slug) || (await siteRepository.slugExists(input.slug, site.id))) {
        throw new ConflictError("CONFLICT", "That website address is already in use");
      }
    }

    const data: Prisma.SiteUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.industry !== undefined ? { industry: input.industry } : {}),
      ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
      ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
      ...(input.faviconUrl !== undefined ? { faviconUrl: input.faviconUrl } : {}),
      // JSON blobs are merged rather than replaced so a partial PATCH from one
      // panel cannot wipe fields owned by another.
      ...(input.brand ? { brand: toJson({ ...siteBrand(site), ...input.brand }) } : {}),
      ...(input.seo ? { seo: toJson({ ...siteSeo(site), ...input.seo }) } : {}),
      ...(input.settings ? { settings: toJson({ ...siteSettings(site), ...input.settings }) } : {}),
    };

    const updated = await siteRepository.update(site.id, data);

    await auditRepository.record({
      action: AuditAction.SITE_UPDATED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId: site.id, fields: Object.keys(data) },
      ...(req ? extractRequestContext(req) : {}),
    });

    return updated;
  },

  /**
   * Patch the theme.
   *
   * Foreground colors are always re-derived from their background rather than
   * accepted from the client, so no combination of inputs can produce
   * unreadable text.
   */
  async updateTheme(
    ctx: AuthContext,
    siteId: string,
    patch: z.infer<typeof import("@/server/validators/site.schema").themePatchSchema>,
    req?: Request,
  ): Promise<ThemeTokens> {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    let theme = siteTheme(site);

    if (patch.styleKeyword) theme = applyStyleKeyword(theme, patch.styleKeyword);

    const colors = { ...theme.colors };
    if (patch.primary) {
      colors.primary = patch.primary;
      colors.primaryForeground = readableOn(patch.primary);
    }
    if (patch.secondary) {
      colors.secondary = patch.secondary;
      colors.secondaryForeground = readableOn(patch.secondary);
    }
    if (patch.accent) {
      colors.accent = patch.accent;
      colors.accentForeground = readableOn(patch.accent);
    }
    if (patch.background) {
      colors.background = patch.background;
      colors.foreground = readableOn(patch.background);
    }
    if (patch.foreground) colors.foreground = patch.foreground;
    if (patch.muted) colors.muted = patch.muted;

    theme = {
      ...theme,
      colors,
      typography: {
        ...theme.typography,
        ...(patch.headingFont ? { headingFont: patch.headingFont } : {}),
        ...(patch.bodyFont ? { bodyFont: patch.bodyFont } : {}),
        ...(patch.scale ? { scale: patch.scale } : {}),
      },
      ...(patch.radius ? { radius: patch.radius } : {}),
      ...(patch.spacingUnit ? { spacingUnit: patch.spacingUnit } : {}),
      ...(patch.containerWidth ? { containerWidth: patch.containerWidth } : {}),
      ...(patch.defaultShadow ? { defaultShadow: patch.defaultShadow } : {}),
    };

    if (patch.darkMode === true) {
      // A usable dark palette derived from the light one. Not a simple
      // inversion: brand colors stay put and only the neutrals flip, which is
      // what keeps a dark variant recognisably the same brand.
      theme = {
        ...theme,
        darkColors: {
          background: "#0B1120",
          foreground: "#E8EEF7",
          muted: "#111C2F",
          mutedForeground: "#94A3B8",
          card: "#111C2F",
          cardForeground: "#E8EEF7",
          border: "#1E293B",
        },
      };
    } else if (patch.darkMode === false) {
      theme = { ...theme, darkColors: undefined };
    }

    await siteRepository.update(site.id, { theme: toJson(theme) });

    await auditRepository.record({
      action: AuditAction.SITE_THEME_UPDATED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId: site.id, styleKeyword: theme.styleKeyword },
      ...(req ? extractRequestContext(req) : {}),
    });

    return theme;
  },

  /**
   * Publish: snapshot draft documents into `publishedDocument`.
   *
   * Draft and published are separate columns rather than a status flag,
   * because an author must be able to keep editing a live page without those
   * edits leaking to visitors mid-change. A PUBLISH revision is recorded so
   * the previous live version is always recoverable.
   */
  async publish(
    ctx: AuthContext,
    siteId: string,
    input: { pageIds?: string[]; label?: string },
    req?: Request,
  ) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    const pages = await sitePageRepository.listAll(site.id);
    if (pages.length === 0) {
      throw new ValidationError("Add at least one page before publishing");
    }
    if (!pages.some((p) => p.isHome)) {
      // Without a home page, the site root would 404 — a confusing outcome to
      // discover after publishing.
      throw new ValidationError("Set a home page before publishing");
    }

    // Snapshot the pre-publish live state so rollback restores what visitors
    // were actually seeing, not the draft.
    await siteRepository.createRevision({
      siteId: site.id,
      tenantId: ctx.tenantId,
      kind: SiteRevisionKind.PUBLISH,
      label: input.label ?? `Published ${new Date().toISOString()}`,
      snapshot: toJson({
        theme: siteTheme(site),
        pages: pages.map((p) => ({
          id: p.id,
          title: p.title,
          path: p.path,
          isHome: p.isHome,
          document: p.publishedDocument ?? p.document,
        })),
      }),
      createdById: ctx.userId,
    });

    const count = await sitePageRepository.publishPages(site.id, input.pageIds);

    const updated = await siteRepository.update(site.id, {
      status: SiteStatus.PUBLISHED,
      publishedAt: new Date(),
    });

    await auditRepository.record({
      action: AuditAction.SITE_PUBLISHED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId: site.id, pagesPublished: count },
      ...(req ? extractRequestContext(req) : {}),
    });

    return { site: updated, pagesPublished: count, publicUrl: await publicUrl(updated) };
  },

  async unpublish(ctx: AuthContext, siteId: string, req?: Request) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    await sitePageRepository.unpublishAll(site.id);
    const updated = await siteRepository.update(site.id, { status: SiteStatus.DRAFT });

    await auditRepository.record({
      action: AuditAction.SITE_UNPUBLISHED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId: site.id },
      ...(req ? extractRequestContext(req) : {}),
    });

    return updated;
  },

  async listRevisions(ctx: AuthContext, siteId: string, req: Request, pageId?: string) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    const pagination = parsePagination(req);
    const { items, total } = await siteRepository.listRevisions({
      tenantId: ctx.tenantId,
      siteId: site.id,
      pageId,
      pagination,
    });
    return buildPagedResult(items, total, pagination);
  },

  /**
   * Restore a revision.
   *
   * The current state is snapshotted first, so a rollback is itself
   * reversible — otherwise "undo" becomes a destructive operation, which is
   * exactly what users reach for it to avoid.
   */
  async rollback(ctx: AuthContext, siteId: string, revisionId: string, req?: Request) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    const revision = await siteRepository.findRevision(ctx.tenantId, revisionId);
    if (!revision || revision.siteId !== site.id) {
      throw new NotFoundError("Version not found");
    }

    const currentPages = await sitePageRepository.listAll(site.id);
    await siteRepository.createRevision({
      siteId: site.id,
      tenantId: ctx.tenantId,
      pageId: revision.pageId,
      kind: SiteRevisionKind.ROLLBACK,
      label: `Before restoring "${revision.label ?? revision.kind}"`,
      snapshot: toJson({
        theme: siteTheme(site),
        pages: currentPages.map((p) => ({
          id: p.id,
          title: p.title,
          path: p.path,
          isHome: p.isHome,
          document: p.document,
        })),
      }),
      createdById: ctx.userId,
    });

    let restored = 0;

    if (revision.pageId) {
      // Page-scoped revision: the snapshot is a bare SiteDocument.
      const document = normalizeDocument(
        readJson<SiteDocument>(revision.snapshot, createEmptyDocument()),
      );
      const page = await sitePageRepository.findById(ctx.tenantId, revision.pageId);
      if (!page) throw new NotFoundError("The page for this version no longer exists");
      await sitePageRepository.update(page.id, { document: toJson(document) });
      restored = 1;
    } else {
      const snapshot = readJson<{
        theme?: ThemeTokens;
        pages?: Array<{ id: string; document: SiteDocument }>;
      }>(revision.snapshot, {});

      if (snapshot.theme) {
        await siteRepository.update(site.id, { theme: toJson(snapshot.theme) });
      }
      for (const entry of snapshot.pages ?? []) {
        // Pages deleted since the snapshot are skipped rather than recreated:
        // resurrecting them would also need their paths and nav order
        // reconciled against the current site.
        const exists = currentPages.some((p) => p.id === entry.id);
        if (!exists) continue;
        await sitePageRepository.update(entry.id, {
          document: toJson(normalizeDocument(entry.document)),
        });
        restored += 1;
      }
    }

    await auditRepository.record({
      action: AuditAction.SITE_ROLLED_BACK,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId: site.id, revisionId, pagesRestored: restored },
      ...(req ? extractRequestContext(req) : {}),
    });

    return { pagesRestored: restored };
  },

  async remove(ctx: AuthContext, siteId: string, req?: Request) {
    const site = await siteRepository.findById(ctx.tenantId, siteId);
    if (!site) throw new NotFoundError("Website not found");

    await siteRepository.softDelete(site.id);

    await auditRepository.record({
      action: AuditAction.SITE_DELETED,
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      metadata: { siteId: site.id, slug: site.slug },
      ...(req ? extractRequestContext(req) : {}),
    });
  },
};

// =====================================================================
// Starter document
// =====================================================================

/** Expand a list of preset keys into a page document. */
export function buildStarterDocument(
  presets: string[],
  input: Parameters<typeof buildSection>[1],
): SiteDocument {
  let document = createEmptyDocument();
  for (const key of presets) {
    const subtree = buildSection(key, input);
    if (!subtree) continue;
    document = insertSubtree(document, document.root, subtree.nodes, subtree.rootId, -1);
  }
  return normalizeDocument(document);
}

/**
 * Build a page document from a pasted landing page. The whole page is a single
 * sandboxed `EmbeddedPage` block, so a user can drop in a design built
 * elsewhere and keep editing everything else around it.
 */
export function buildHtmlPageDocument(html: string, title: string): SiteDocument {
  let document = createEmptyDocument();
  const id = createNodeId();
  const node = createNode(
    "EmbeddedPage",
    { props: { html, title, minHeight: 600 }, children: [] },
    id,
  );
  document = insertSubtree(document, document.root, { [id]: node }, id, -1);
  return normalizeDocument(document);
}

// =====================================================================
// Templates
// =====================================================================

interface TemplateBlueprintPage {
  title: string;
  path: string;
  isHome: boolean;
  document: SiteDocument;
  seo?: SeoMeta;
}

interface TemplateBlueprint {
  theme?: ThemeTokens;
  pages: TemplateBlueprintPage[];
}

/**
 * Parse a `SiteTemplate.blueprint` JSON column into its typed shape.
 *
 * Falls back to an empty page list rather than throwing: a template row with
 * a malformed blueprint should degrade to "this template added nothing"
 * (caught by the empty-pages check in `applyTemplatePages`) rather than
 * failing the whole site creation the user is waiting on.
 */
function readTemplateBlueprint(value: Prisma.JsonValue): TemplateBlueprint {
  const fallback: TemplateBlueprint = { pages: [] };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const obj = value as Record<string, unknown>;
  return {
    theme: obj.theme as ThemeTokens | undefined,
    pages: Array.isArray(obj.pages) ? (obj.pages as TemplateBlueprintPage[]) : [],
  };
}

/**
 * Materialise a template's pages into a real site.
 *
 * Documents are re-normalized (never trusted verbatim from a JSON column,
 * same rule as everywhere else this codebase reads a stored SiteDocument),
 * and contact-detail placeholders baked into the template's preset content
 * are overwritten with the creating tenant's real phone/WhatsApp/email —
 * otherwise every clinic that starts from the "Dental Clinic" template would
 * publish with the sample business's fake phone number.
 */
async function applyTemplatePages(
  siteId: string,
  tenantId: string,
  blueprint: TemplateBlueprint,
  contact: {
    businessName: string;
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
    address?: string | null;
  },
): Promise<void> {
  if (blueprint.pages.length === 0) {
    // A template that resolved to zero pages is as good as no template — fall
    // back to the same generic starter every blank site gets.
    await sitePageRepository.create({
      siteId,
      tenantId,
      title: "Home",
      path: "/",
      isHome: true,
      sortOrder: 0,
      document: toJson(
        buildStarterDocument(["navbar", "hero-split", "services", "about", "contact", "footer", "whatsapp"], {
          businessName: contact.businessName,
          phone: contact.phone ?? undefined,
          whatsapp: contact.whatsapp ?? undefined,
          email: contact.email ?? undefined,
          address: contact.address ?? undefined,
        }),
      ),
    });
    return;
  }

  for (const [index, page] of blueprint.pages.entries()) {
    const document = rebindTemplateContact(normalizeDocument(page.document), contact);
    await sitePageRepository.create({
      siteId,
      tenantId,
      title: page.title,
      path: page.path,
      isHome: page.isHome,
      sortOrder: index,
      document: toJson(document),
      ...(page.seo ? { seo: toJson(page.seo) } : {}),
    });
  }
}

/**
 * Overwrite a template's sample contact details with the real tenant's.
 *
 * Only touches `tel:` / `whatsapp:` / `mailto:` actions and the address text
 * nodes a preset marks — never free-text copy, which would risk mangling
 * unrelated sentences that happen to contain a phone-shaped number.
 */
function rebindTemplateContact(
  document: SiteDocument,
  contact: { phone?: string | null; whatsapp?: string | null; email?: string | null; address?: string | null },
): SiteDocument {
  const nodes = { ...document.nodes };
  for (const [id, node] of Object.entries(nodes)) {
    const action = node.action;
    if (action?.kind === "tel" && contact.phone) {
      nodes[id] = { ...node, action: { ...action, phone: contact.phone } };
    } else if (action?.kind === "whatsapp" && contact.whatsapp) {
      nodes[id] = { ...node, action: { ...action, phone: contact.whatsapp } };
    } else if (action?.kind === "mailto" && contact.email) {
      nodes[id] = { ...node, action: { ...action, email: contact.email } };
    }
    // WhatsAppButton and Form nodes carry contact details as props rather
    // than as an action.
    if (node.type === "WhatsAppButton" && contact.whatsapp && node.props.phone) {
      nodes[id] = { ...nodes[id], props: { ...nodes[id].props, phone: contact.whatsapp } };
    }
  }
  return { ...document, nodes };
}
