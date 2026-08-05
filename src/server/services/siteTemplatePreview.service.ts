/**
 * Template preview.
 *
 * Turns a stored `SiteTemplate.blueprint` into a fully renderable
 * `RenderContext` so the gallery can show what a template actually looks like
 * instead of a placeholder card. The same `SiteRenderer` the public site and
 * the editor use renders it, which is what guarantees the preview matches what
 * the tenant gets after clicking "Use this template".
 *
 * Previews are populated with demo review/location data on purpose. A template
 * whose Reviews and OpeningHours sections render as "coming soon" looks broken
 * rather than empty, and the whole point of a gallery is to show the finished
 * article — the same reason WordPress themes ship with demo content.
 */

import type { Prisma } from "@prisma/client";
import { siteTemplateRepository } from "@/server/repositories/siteTemplate.repository";
import { normalizeDocument } from "@/site/document/operations";
import { DEFAULT_THEME } from "@/site/document/theme";
import type {
  BrandContext,
  RenderContext,
  SiteDocument,
  SiteRenderData,
  ThemeTokens,
} from "@/site/document/types";

export interface TemplatePreviewPage {
  title: string;
  path: string;
  isHome: boolean;
  document: SiteDocument;
}

interface ParsedBlueprint {
  theme: ThemeTokens;
  pages: TemplatePreviewPage[];
}

/** Base path every preview link is prefixed with, so nav stays inside the preview. */
export function templatePreviewBasePath(slug: string): string {
  return `/template-preview/${slug}`;
}

/**
 * Parse the blueprint JSON column.
 *
 * Never trusts the stored shape: documents are re-normalized (same rule as
 * every other read of a persisted SiteDocument in this codebase) and a
 * malformed row degrades to "no pages" instead of throwing, so one bad
 * template can't take down the gallery.
 */
function parseBlueprint(value: Prisma.JsonValue): ParsedBlueprint {
  const empty: ParsedBlueprint = { theme: DEFAULT_THEME, pages: [] };
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;

  const obj = value as Record<string, unknown>;
  const theme = (obj.theme as ThemeTokens | undefined) ?? DEFAULT_THEME;
  const rawPages = Array.isArray(obj.pages) ? obj.pages : [];

  const pages: TemplatePreviewPage[] = [];
  for (const raw of rawPages) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;
    if (!p.document || typeof p.document !== "object") continue;
    pages.push({
      title: typeof p.title === "string" ? p.title : "Page",
      path: typeof p.path === "string" ? p.path : "/",
      isHome: p.isHome === true,
      document: normalizeDocument(p.document as SiteDocument),
    });
  }

  return { theme, pages };
}

/**
 * Demo content so every section in a template renders its populated state.
 *
 * Clearly fictional: a preview must never imply the reviews or address belong
 * to the tenant browsing it.
 */
function demoRenderData(businessName: string): SiteRenderData {
  const daysOpen = ["1", "2", "3", "4", "5"].reduce<
    Record<string, Array<{ open: string; close: string }>>
  >((acc, day) => {
    acc[day] = [{ open: "09:00", close: "18:00" }];
    return acc;
  }, {});
  daysOpen["6"] = [{ open: "10:00", close: "16:00" }];

  return {
    reviews: [
      {
        id: "demo-1",
        authorName: "Priya S.",
        rating: 5,
        comment:
          "Genuinely excellent from start to finish. The team explained everything clearly and never made me feel rushed.",
        createdAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
      },
      {
        id: "demo-2",
        authorName: "Daniel M.",
        rating: 5,
        comment: "Booking was simple, they ran on time, and the results speak for themselves.",
        createdAt: new Date(Date.now() - 19 * 86_400_000).toISOString(),
      },
      {
        id: "demo-3",
        authorName: "Aisha K.",
        rating: 4,
        comment: "Really happy with the service. Friendly staff and spotlessly clean.",
        createdAt: new Date(Date.now() - 33 * 86_400_000).toISOString(),
      },
    ],
    ratingSummary: { average: 4.9, total: 214 },
    writeReviewUrl: null,
    location: {
      id: "demo-location",
      name: businessName,
      phone: "+1 555 0100",
      email: "hello@example.com",
      addressLine1: "12 Example Street",
      city: "Sample City",
      state: "CA",
      postalCode: "90001",
      country: "US",
      latitude: null,
      longitude: null,
      googlePlaceId: null,
      workingHours: daysOpen,
    },
    collections: {},
    forms: {},
    // No key: the Map component falls back to its address-only card rather
    // than burning Places quota on a preview.
    mapsApiKey: null,
  };
}

export const siteTemplatePreviewService = {
  /**
   * Build the render context for one page of a template.
   *
   * Returns null when the template or the requested path does not exist, so
   * the route can render a 404 instead of a broken frame.
   */
  async load(
    slug: string,
    path: string,
  ): Promise<{
    ctx: RenderContext;
    templateName: string;
    page: TemplatePreviewPage;
    pages: TemplatePreviewPage[];
  } | null> {
    const template = await siteTemplateRepository.findBySlug(slug);
    if (!template) return null;

    const { theme, pages } = parseBlueprint(template.blueprint);
    if (pages.length === 0) return null;

    const page =
      pages.find((p) => p.path === path) ??
      (path === "/" ? (pages.find((p) => p.isHome) ?? pages[0]) : null);
    if (!page) return null;

    const businessName = template.name;
    const brand: BrandContext = {
      businessName,
      industry: template.industry ?? undefined,
      phone: "+1 555 0100",
      email: "hello@example.com",
      address: "12 Example Street, Sample City",
    };

    const ctx: RenderContext = {
      document: page.document,
      theme,
      brand,
      pages: pages.map((p) => ({
        id: p.path,
        title: p.title,
        path: p.path,
        hiddenInNav: false,
      })),
      basePath: templatePreviewBasePath(slug),
      data: demoRenderData(businessName),
      // Deliberately NOT `editor: true`. The editor flag swaps real content for
      // authoring placeholders ("Click to add an image") and skips the
      // media-query stylesheet, which would make the device-width toggle in the
      // preview modal do nothing. Published-mode rendering is what we want to
      // show, and links stay inside the preview via `basePath`.
      editor: false,
    };

    return { ctx, templateName: template.name, page, pages };
  },

  /** Gallery metadata for every template a tenant can browse. */
  async listForGallery(tenantId: string, industry?: string | null) {
    const templates = await siteTemplateRepository.list({ tenantId, industry });

    return templates.map((t) => {
      const { theme, pages } = parseBlueprint(t.blueprint);
      return {
        id: t.id,
        name: t.name,
        slug: t.slug,
        industry: t.industry,
        description: t.description,
        thumbnailUrl: t.thumbnailUrl,
        isPremium: t.isPremium,
        isGlobal: t.isGlobal,
        pageCount: pages.length,
        pages: pages.map((p) => ({ title: p.title, path: p.path, isHome: p.isHome })),
        colors: {
          primary: theme.colors?.primary ?? DEFAULT_THEME.colors.primary,
          secondary: theme.colors?.secondary ?? DEFAULT_THEME.colors.secondary,
          accent: theme.colors?.accent ?? DEFAULT_THEME.colors.accent,
        },
        previewUrl: templatePreviewBasePath(t.slug),
      };
    });
  },
};
