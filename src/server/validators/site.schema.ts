/**
 * Website builder request schemas.
 *
 * The important one is `siteDocumentSchema`. Documents arrive from the
 * browser on every save and from Gemini on every generation, so this is the
 * boundary that keeps malformed or malicious trees out of the database.
 * It validates shape here and delegates per-component prop validation to the
 * registry, which is the only place that knows what a "Heading" may contain.
 */

import { z } from "zod";
import { SitePageStatus, SiteStatus } from "@prisma/client";
import { COMPONENT_TYPES } from "@/site/registry/definitions";
import { PRESET_KEYS } from "@/site/registry/presets";

// =====================================================================
// Primitives
// =====================================================================

const hexColor = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Must be a hex colour");

/**
 * Slug rules match the Location/Tenant convention already in this codebase:
 * lowercase, alphanumeric, single hyphens, no leading or trailing hyphen.
 */
export const siteSlugSchema = z
  .string()
  .trim()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens");

/** Page routes: leading slash, lowercase, no trailing slash, no traversal. */
export const pagePathSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .transform((v) => {
    let p = v.toLowerCase();
    if (!p.startsWith("/")) p = `/${p}`;
    p = p.replace(/\/{2,}/g, "/");
    if (p.length > 1) p = p.replace(/\/+$/, "");
    return p;
  })
  .refine((p) => /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/.test(p), {
    message: "Use lowercase letters, numbers, hyphens, and slashes only",
  });

const spacingToken = z.enum(["none", "xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"]);
const radiusToken = z.enum(["none", "sm", "md", "lg", "xl", "full"]);
const shadowToken = z.enum(["none", "sm", "md", "lg", "xl"]);
const fontSizeToken = z.enum(["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"]);
const fontWeightToken = z.enum(["light", "normal", "medium", "semibold", "bold", "extrabold"]);

const tokenOrValue = z.union([
  z.object({ token: z.string().max(40) }).strict(),
  z.object({ value: z.string().max(120) }).strict(),
]);

/**
 * A CSS length the renderer will emit verbatim.
 *
 * Restricted to a numeric value plus a known unit (or a small allowlist of
 * keywords) specifically to block `);}` style injection through the style
 * pipeline, since these values end up inside a generated stylesheet.
 */
const cssLength = z
  .string()
  .max(40)
  .regex(
    /^(?:auto|inherit|initial|unset|fit-content|min-content|max-content|-?\d*\.?\d+(?:px|rem|em|%|vh|vw|vmin|vmax|ch)?|calc\([-+*/\s\d.a-z%()]+\))$/i,
    "Not a valid CSS length",
  );

export const styleSchema = z
  .object({
    display: z.enum(["block", "flex", "grid", "inline-flex", "inline-block", "none"]).optional(),
    flexDirection: z.enum(["row", "column", "row-reverse", "column-reverse"]).optional(),
    flexWrap: z.enum(["nowrap", "wrap"]).optional(),
    justifyContent: z
      .enum(["flex-start", "center", "flex-end", "space-between", "space-around", "space-evenly"])
      .optional(),
    alignItems: z.enum(["flex-start", "center", "flex-end", "stretch", "baseline"]).optional(),
    gap: spacingToken.optional(),
    gridColumns: z.number().int().min(1).max(12).optional(),

    paddingTop: spacingToken.optional(),
    paddingRight: spacingToken.optional(),
    paddingBottom: spacingToken.optional(),
    paddingLeft: spacingToken.optional(),
    marginTop: spacingToken.optional(),
    marginRight: spacingToken.optional(),
    marginBottom: spacingToken.optional(),
    marginLeft: spacingToken.optional(),

    width: cssLength.optional(),
    maxWidth: cssLength.optional(),
    minHeight: cssLength.optional(),
    height: cssLength.optional(),

    fontFamily: z.enum(["heading", "body", "mono"]).optional(),
    fontSize: fontSizeToken.optional(),
    fontWeight: fontWeightToken.optional(),
    lineHeight: z.enum(["tight", "snug", "normal", "relaxed", "loose"]).optional(),
    letterSpacing: z.enum(["tighter", "tight", "normal", "wide", "wider"]).optional(),
    textAlign: z.enum(["left", "center", "right", "justify"]).optional(),
    textTransform: z.enum(["none", "uppercase", "lowercase", "capitalize"]).optional(),
    color: tokenOrValue.optional(),

    backgroundColor: tokenOrValue.optional(),
    backgroundImage: z.string().max(1000).optional(),
    backgroundSize: z.enum(["cover", "contain", "auto"]).optional(),
    backgroundPosition: z.string().max(60).optional(),
    backgroundOverlay: z.number().min(0).max(1).optional(),

    borderWidth: z.number().min(0).max(24).optional(),
    borderColor: tokenOrValue.optional(),
    borderStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
    borderRadius: radiusToken.optional(),

    boxShadow: shadowToken.optional(),
    opacity: z.number().min(0).max(1).optional(),
    overflow: z.enum(["visible", "hidden", "auto"]).optional(),

    position: z.enum(["static", "relative", "absolute", "sticky", "fixed"]).optional(),
    top: cssLength.optional(),
    right: cssLength.optional(),
    bottom: cssLength.optional(),
    left: cssLength.optional(),
    zIndex: z.number().int().min(-50).max(9999).optional(),

    // Custom CSS is a power-user escape hatch. Braces and @-rules are
    // rejected so a node rule cannot break out of its own selector and
    // restyle the rest of the page (or the dashboard, in the editor).
    customCss: z
      .string()
      .max(2000)
      .refine((v) => !/[{}]|@import|@media|<\/?script/i.test(v), {
        message: "Custom CSS must be plain declarations, without braces or at-rules",
      })
      .optional(),
  })
  .strict();

const animationSchema = z
  .object({
    kind: z.enum([
      "none",
      "fade-in",
      "fade-up",
      "fade-down",
      "slide-left",
      "slide-right",
      "zoom-in",
      "zoom-out",
      "blur-in",
    ]),
    duration: z.number().int().min(0).max(5000).optional(),
    delay: z.number().int().min(0).max(5000).optional(),
    easing: z.enum(["linear", "ease", "ease-in", "ease-out", "ease-in-out"]).optional(),
    repeat: z.boolean().optional(),
    parallax: z.number().min(-1).max(1).optional(),
  })
  .strict();

/**
 * Only http(s), mailto, and tel are accepted. `javascript:` and `data:` URLs
 * in an href are a stored-XSS vector on the published page.
 */
const safeHref = z
  .string()
  .max(500)
  .refine((v) => !/^\s*(?:javascript|vbscript|data|file)\s*:/i.test(v), {
    message: "That link scheme is not allowed",
  });

const actionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z
    .object({
      kind: z.literal("url"),
      href: safeHref,
      target: z.enum(["_self", "_blank"]).optional(),
      rel: z.string().max(80).optional(),
    })
    .strict(),
  z
    .object({ kind: z.literal("page"), pageId: z.string().max(40), hash: z.string().max(60).optional() })
    .strict(),
  z.object({ kind: z.literal("scroll"), nodeId: z.string().max(40) }).strict(),
  z.object({ kind: z.literal("tel"), phone: z.string().max(30) }).strict(),
  z.object({ kind: z.literal("mailto"), email: z.string().max(200) }).strict(),
  z
    .object({
      kind: z.literal("whatsapp"),
      phone: z.string().max(30),
      message: z.string().max(500).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("submit"), formId: z.string().max(40) }).strict(),
  z.object({ kind: z.literal("openModal"), nodeId: z.string().max(40) }).strict(),
  z.object({ kind: z.literal("download"), href: safeHref }).strict(),
]);

const bindingSchema = z
  .object({
    source: z.enum(["cms", "business", "location", "reviews"]),
    path: z.string().max(120),
    fallback: z.string().max(300).optional(),
  })
  .strict();

// =====================================================================
// Document
// =====================================================================

const nodeIdSchema = z.string().min(1).max(40).regex(/^[a-z0-9_-]+$/i);

export const siteNodeSchema = z
  .object({
    id: nodeIdSchema,
    /**
     * Constrained to registered types. An unregistered type would render as
     * nothing on the public site, so rejecting it at the boundary turns a
     * silent blank section into an actionable error.
     */
    type: z.enum(COMPONENT_TYPES as [string, ...string[]]),
    name: z.string().max(80).optional(),
    props: z.record(z.unknown()).default({}),
    children: z.array(nodeIdSchema).max(200).default([]),
    parent: nodeIdSchema.nullable().default(null),
    style: styleSchema.optional(),
    responsive: z
      .object({ tablet: styleSchema.optional(), mobile: styleSchema.optional() })
      .strict()
      .optional(),
    hover: styleSchema
      .pick({
        color: true,
        backgroundColor: true,
        borderColor: true,
        boxShadow: true,
        opacity: true,
        borderRadius: true,
      })
      .optional(),
    animation: animationSchema.optional(),
    action: actionSchema.optional(),
    bindings: z.record(bindingSchema).optional(),
    locked: z.boolean().optional(),
    hidden: z.boolean().optional(),
    hiddenOn: z.array(z.enum(["tablet", "mobile"])).max(2).optional(),
    collapsed: z.boolean().optional(),
    presetKey: z.string().max(60).optional(),
    a11y: z
      .object({
        ariaLabel: z.string().max(200).optional(),
        role: z.string().max(40).optional(),
        decorative: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/**
 * Node count is capped to bound both the JSON column size and render cost.
 * 3000 nodes is far beyond any realistic page (a dense 12-section page is
 * ~400), so the limit only ever catches runaway loops or abuse.
 */
export const siteDocumentSchema = z
  .object({
    version: z.number().int().min(1).max(100).default(1),
    root: nodeIdSchema,
    nodes: z.record(siteNodeSchema).refine((n) => Object.keys(n).length <= 3000, {
      message: "Page is too large (maximum 3000 elements)",
    }),
  })
  .strict()
  .refine((doc) => Boolean(doc.nodes[doc.root]), {
    message: "Document root is missing from nodes",
  });

// =====================================================================
// Theme
// =====================================================================

export const themeSchema = z
  .object({
    colors: z
      .object({
        primary: hexColor,
        primaryForeground: hexColor,
        secondary: hexColor,
        secondaryForeground: hexColor,
        accent: hexColor,
        accentForeground: hexColor,
        background: hexColor,
        foreground: hexColor,
        muted: hexColor,
        mutedForeground: hexColor,
        card: hexColor,
        cardForeground: hexColor,
        border: hexColor,
        success: hexColor,
        warning: hexColor,
        destructive: hexColor,
      })
      .strict(),
    darkColors: z.record(hexColor).optional(),
    typography: z
      .object({
        headingFont: z.string().max(60),
        bodyFont: z.string().max(60),
        monoFont: z.string().max(120),
        scale: z.number().min(0.7).max(1.6),
        headingWeight: fontWeightToken,
        bodyWeight: fontWeightToken,
      })
      .strict(),
    radius: radiusToken,
    spacingUnit: z.number().int().min(2).max(24),
    containerWidth: z.number().int().min(600).max(2000),
    defaultShadow: shadowToken,
    styleKeyword: z
      .enum(["modern", "minimal", "luxurious", "playful", "corporate", "warm", "bold", "clinical"])
      .optional(),
  })
  .strict();

/** Partial theme patch used by the theme panel and AI colour edits. */
export const themePatchSchema = z
  .object({
    primary: hexColor.optional(),
    secondary: hexColor.optional(),
    accent: hexColor.optional(),
    background: hexColor.optional(),
    foreground: hexColor.optional(),
    muted: hexColor.optional(),
    headingFont: z.string().max(60).optional(),
    bodyFont: z.string().max(60).optional(),
    scale: z.number().min(0.7).max(1.6).optional(),
    radius: radiusToken.optional(),
    spacingUnit: z.number().int().min(2).max(24).optional(),
    containerWidth: z.number().int().min(600).max(2000).optional(),
    defaultShadow: shadowToken.optional(),
    styleKeyword: z
      .enum(["modern", "minimal", "luxurious", "playful", "corporate", "warm", "bold", "clinical"])
      .optional(),
    darkMode: z.boolean().optional(),
  })
  .strict();

// =====================================================================
// SEO
// =====================================================================

export const seoSchema = z
  .object({
    title: z.string().max(200).optional(),
    description: z.string().max(400).optional(),
    keywords: z.array(z.string().max(60)).max(30).optional(),
    canonical: safeHref.optional(),
    ogImage: z.string().max(1000).optional(),
    ogTitle: z.string().max(200).optional(),
    ogDescription: z.string().max(400).optional(),
    twitterCard: z.enum(["summary", "summary_large_image"]).optional(),
    noIndex: z.boolean().optional(),
    noFollow: z.boolean().optional(),
    schemaType: z.string().max(60).optional(),
    structuredData: z.record(z.unknown()).optional(),
  })
  .strict();

export const brandSchema = z
  .object({
    businessName: z.string().max(200).optional(),
    industry: z.string().max(120).optional(),
    businessCategory: z.string().max(120).optional(),
    services: z.array(z.string().max(160)).max(30).optional(),
    targetAudience: z.string().max(300).optional(),
    tone: z.string().max(120).optional(),
    brandColors: z.array(z.string().max(40)).max(6).optional(),
    logoUrl: z.string().max(1000).optional(),
    city: z.string().max(120).optional(),
    country: z.string().max(80).optional(),
    language: z.string().max(20).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().max(200).optional(),
    whatsapp: z.string().max(40).optional(),
    address: z.string().max(400).optional(),
    notes: z.string().max(2000).optional(),
    highlights: z.array(z.string().max(200)).max(12).optional(),
  })
  .strict();

// =====================================================================
// Site CRUD
// =====================================================================

export const createSiteSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: siteSlugSchema.optional(),
  industry: z.string().trim().max(120).optional(),
  locationId: z.string().max(40).optional(),
  /** Start from a template instead of a blank site. */
  templateSlug: z.string().max(80).optional(),
});

export const updateSiteSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    slug: siteSlugSchema.optional(),
    industry: z.string().trim().max(120).optional(),
    locationId: z.string().max(40).nullable().optional(),
    logoUrl: z.string().max(1000).nullable().optional(),
    faviconUrl: z.string().max(1000).nullable().optional(),
    brand: brandSchema.optional(),
    seo: seoSchema.optional(),
    settings: z
      .object({
        whatsappNumber: z.string().max(40).optional(),
        googleAnalyticsId: z.string().max(40).optional(),
        googleTagManagerId: z.string().max(40).optional(),
        searchConsoleVerification: z.string().max(200).optional(),
        hidePlatformBranding: z.boolean().optional(),
        customHeadHtml: z.string().max(4000).optional(),
        socialLinks: z.record(safeHref).optional(),
      })
      .strict()
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const listSitesSchema = z.object({
  status: z.nativeEnum(SiteStatus).optional(),
  includeDeleted: z.coerce.boolean().default(false),
});

// =====================================================================
// Page CRUD
// =====================================================================

export const createPageSchema = z.object({
  title: z.string().trim().min(1).max(120),
  path: pagePathSchema,
  /** Seed the page from a list of section presets. */
  presets: z.array(z.enum(PRESET_KEYS as [string, ...string[]])).max(20).optional(),
  isHome: z.boolean().default(false),
  hiddenInNav: z.boolean().default(false),
});

export const updatePageSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    path: pagePathSchema.optional(),
    seo: seoSchema.optional(),
    hiddenInNav: z.boolean().optional(),
    noIndex: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(999).optional(),
    status: z.nativeEnum(SitePageStatus).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

/**
 * Document save payload.
 *
 * `expectedVersion` implements optimistic concurrency: two editors (or two
 * browser tabs) saving the same page would otherwise silently overwrite each
 * other. The client sends the updatedAt it loaded, and a mismatch returns a
 * conflict instead of losing work.
 */
export const savePageDocumentSchema = z.object({
  document: siteDocumentSchema,
  expectedVersion: z.string().datetime().optional(),
  /** Autosaves do not create a revision entry, manual saves do. */
  autosave: z.boolean().default(false),
});

export const reorderPagesSchema = z.object({
  pageIds: z.array(z.string().max(40)).min(1).max(60),
});

// =====================================================================
// Publishing
// =====================================================================

export const publishSchema = z.object({
  /** Omit to publish every page. */
  pageIds: z.array(z.string().max(40)).max(60).optional(),
  label: z.string().max(200).optional(),
});

export const rollbackSchema = z.object({
  revisionId: z.string().min(1).max(40),
});

// =====================================================================
// AI
// =====================================================================

export const generateSiteSchema = z.object({
  prompt: z.string().trim().min(3).max(2000),
  industry: z.string().trim().max(120).optional(),
  businessName: z.string().trim().max(200).optional(),
  locationId: z.string().max(40).optional(),
  /** Overwrite the site's existing pages instead of failing. */
  replaceExisting: z.boolean().default(false),
});

export const aiEditSchema = z.object({
  prompt: z.string().trim().min(2).max(2000),
  /** Page the request applies to. Theme-only edits ignore it. */
  pageId: z.string().max(40).optional(),
  conversationId: z.string().max(40).optional(),
});

export const generateContentSchema = z.object({
  kind: z.enum([
    "about",
    "services",
    "faq",
    "testimonials",
    "meta",
    "privacy",
    "terms",
    "cta",
    "blog",
  ]),
  topic: z.string().trim().max(500).optional(),
  count: z.number().int().min(1).max(12).default(4),
});

// =====================================================================
// Domains
// =====================================================================

/**
 * Hostname validation.
 *
 * Rejects protocols, paths, ports, and IPs. Also rejects the platform's own
 * apex domain, since accepting it would let a tenant hijack the dashboard
 * host through the custom-domain router.
 */
export const addDomainSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .min(4)
    .max(253)
    .transform((v) => v.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, ""))
    .refine((v) => /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(v), {
      message: "Enter a valid domain, for example clinic.com or www.clinic.com",
    })
    .refine((v) => !/^\d+\.\d+\.\d+\.\d+$/.test(v), { message: "IP addresses are not supported" }),
  isPrimary: z.boolean().default(false),
  redirectToPrimary: z.boolean().default(false),
});

export const updateDomainSchema = z
  .object({
    isPrimary: z.boolean().optional(),
    redirectToPrimary: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

// =====================================================================
// CMS
// =====================================================================

export const cmsFieldSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, and underscores"),
    label: z.string().trim().min(1).max(80),
    kind: z.enum([
      "TEXT",
      "RICH_TEXT",
      "NUMBER",
      "BOOLEAN",
      "DATE",
      "IMAGE",
      "GALLERY",
      "LINK",
      "EMAIL",
      "PHONE",
      "SELECT",
      "MULTI_SELECT",
      "REFERENCE",
      "COLOR",
      "JSON",
    ]),
    required: z.boolean().default(false),
    helpText: z.string().max(300).optional(),
    options: z.array(z.string().max(120)).max(50).optional(),
    referenceCollectionId: z.string().max(40).optional(),
  })
  .strict();

export const createCollectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  slug: siteSlugSchema.optional(),
  singularName: z.string().trim().max(80).optional(),
  description: z.string().max(1000).optional(),
  fields: z.array(cmsFieldSchema).min(1).max(40),
});

export const updateCollectionSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    singularName: z.string().trim().max(80).optional(),
    description: z.string().max(1000).optional(),
    fields: z.array(cmsFieldSchema).min(1).max(40).optional(),
    detailPageId: z.string().max(40).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

export const upsertCmsItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  slug: siteSlugSchema.optional(),
  data: z.record(z.unknown()).default({}),
  excerpt: z.string().max(600).optional(),
  featuredImageUrl: z.string().max(1000).optional(),
  categories: z.array(z.string().max(80)).max(20).optional(),
  tags: z.array(z.string().max(80)).max(30).optional(),
  seo: seoSchema.optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "SCHEDULED", "ARCHIVED"]).default("DRAFT"),
  scheduledAt: z.string().datetime().optional(),
});

// =====================================================================
// Forms
// =====================================================================

/**
 * FILE is deliberately absent: public sites have no authenticated upload path,
 * so offering a file field would render a control that always fails. Add it
 * alongside a signed-upload endpoint, not before.
 */
export const siteFormFieldSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z][a-z0-9_]*$/, "Use lowercase letters, numbers, and underscores"),
    label: z.string().trim().min(1).max(120),
    kind: z.enum(["TEXT", "TEXTAREA", "EMAIL", "PHONE", "NUMBER", "DATE", "SELECT", "CHECKBOX"]),
    required: z.boolean().default(false),
    placeholder: z.string().max(160).optional(),
    helpText: z.string().max(300).optional(),
    options: z.array(z.string().max(120)).max(50).optional(),
  })
  .strict()
  .refine((f) => f.kind !== "SELECT" || (f.options?.length ?? 0) > 0, {
    message: "A dropdown field needs at least one option",
    path: ["options"],
  });

export const createFormSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: siteSlugSchema.optional(),
  fields: z.array(siteFormFieldSchema).min(1).max(30),
  notifyEmails: z.array(z.string().email().max(200)).max(10).optional(),
  successMessage: z.string().max(600).optional(),
  redirectUrl: safeHref.optional(),
});

export const updateFormSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    fields: z.array(siteFormFieldSchema).min(1).max(30).optional(),
    notifyEmails: z.array(z.string().email().max(200)).max(10).optional(),
    // Nullable, not just optional: the editor needs a way to CLEAR these back
    // to their defaults. `undefined` means "leave unchanged", `null` means
    // "remove", and those are genuinely different intents.
    successMessage: z.string().max(600).nullable().optional(),
    redirectUrl: safeHref.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });

const leadStatusEnum = z.enum(["NEW", "READ", "REPLIED", "SPAM", "ARCHIVED"]);

export const listLeadsSchema = z.object({
  formId: z.string().max(40).optional(),
  status: leadStatusEnum.optional(),
  includeSpam: z.coerce.boolean().default(false),
});

export const updateLeadSchema = z.object({
  status: leadStatusEnum,
});

export const bulkLeadsSchema = z.object({
  ids: z.array(z.string().max(40)).min(1).max(200),
  status: leadStatusEnum,
});

/**
 * Public submission payload.
 *
 * Values are capped at 5000 chars and 40 keys regardless of the form
 * definition, because this endpoint is unauthenticated and must be safe
 * before we have even loaded which form is being targeted.
 */
export const submitFormSchema = z.object({
  formId: z.string().max(40).optional(),
  data: z
    .record(z.union([z.string().max(5000), z.number(), z.boolean()]))
    .refine((d) => Object.keys(d).length <= 40, { message: "Too many fields" }),
  pagePath: z.string().max(300).optional(),
});

/** Public analytics beacon. */
export const trackEventSchema = z.object({
  type: z.enum([
    "PAGE_VIEW",
    "SESSION_START",
    "FORM_SUBMIT",
    "WHATSAPP_CLICK",
    "CALL_CLICK",
    "REVIEW_CLICK",
    "CTA_CLICK",
    "OUTBOUND_CLICK",
    "APPOINTMENT_REQUEST",
  ]),
  path: z.string().max(300).optional(),
  referrer: z.string().max(500).optional(),
  meta: z.record(z.unknown()).optional(),
});

export type SavePageDocumentInput = z.infer<typeof savePageDocumentSchema>;
export type CreateSiteInput = z.infer<typeof createSiteSchema>;
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>;
export type GenerateSiteInput = z.infer<typeof generateSiteSchema>;
export type AiEditInput = z.infer<typeof aiEditSchema>;
export type AddDomainInput = z.infer<typeof addDomainSchema>;

/** CSV export options. Mirrors the inbox filters that make sense in a file. */
export const exportLeadsSchema = z.object({
  formId: z.string().max(40).optional(),
  includeSpam: z.coerce.boolean().default(false),
});

export type ListLeadsInput = z.infer<typeof listLeadsSchema>;
export type CreateFormInput = z.infer<typeof createFormSchema>;
export type UpdateFormInput = z.infer<typeof updateFormSchema>;
export type SiteFormFieldInput = z.infer<typeof siteFormFieldSchema>;
