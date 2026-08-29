/**
 * The website builder document model.
 *
 * This is the contract shared by the editor, the public renderer, the AI
 * pipeline, and the database. Everything else in src/site is downstream
 * of these types.
 *
 * ---------------------------------------------------------------------
 * Why a FLAT node map instead of a nested tree
 * ---------------------------------------------------------------------
 * A nested tree (`children: SiteNode[]`) reads nicely but is the wrong
 * shape for an editor:
 *
 *   - Selecting / restyling a node needs O(1) lookup by id, not a
 *     recursive search on every keystroke.
 *   - Drag & drop is "remove id from parent A's children, insert into
 *     parent B's children at index i" — two array splices on a flat map,
 *     versus rebuilding a subtree spine on a nested one.
 *   - Undo/redo and AI edits become small, serializable patches keyed by
 *     node id instead of deep structural diffs.
 *   - React reconciliation stays cheap because a node's identity is its
 *     id, independent of position.
 *
 * So: `nodes` is a normalized `Record<NodeId, SiteNode>` and structure
 * lives in `children` (ordered id arrays) plus a `parent` back-pointer.
 * The back-pointer is derivable but stored because reparenting and
 * ancestor walks (breadcrumbs, "is this inside a locked layer") are hot
 * paths in the editor. `normalizeDocument()` keeps it consistent.
 *
 * ---------------------------------------------------------------------
 * Why styles are tokens, not CSS strings
 * ---------------------------------------------------------------------
 * Node styles reference theme tokens (`"primary"`, `"lg"`) rather than
 * literal values (`"#2563eb"`, `"24px"`). That is what makes a request
 * like "change blue to green" or "make it more luxurious" a single theme
 * update that cascades everywhere, instead of an edit to 200 nodes.
 * Literal escape hatches exist for power users, and they simply opt out
 * of the cascade.
 */

// =====================================================================
// Identifiers
// =====================================================================

export type NodeId = string;

/** Bumped when a migration of persisted documents is required. */
export const DOCUMENT_VERSION = 1 as const;

// =====================================================================
// Responsive
// =====================================================================

/**
 * Breakpoints are desktop-first: `base` styles apply everywhere, and
 * `tablet` / `mobile` override below their max-width. Desktop-first
 * matches how the canvas works (you design on desktop, then adjust
 * down) and means an untouched node needs zero override entries.
 */
export type Breakpoint = "base" | "tablet" | "mobile";

export const BREAKPOINTS: readonly Breakpoint[] = ["base", "tablet", "mobile"];

export const BREAKPOINT_MAX_WIDTH: Record<Exclude<Breakpoint, "base">, number> = {
  tablet: 1024,
  mobile: 640,
};

/** Canvas widths used by the editor's device previews. */
export const BREAKPOINT_CANVAS_WIDTH: Record<Breakpoint, number> = {
  base: 1440,
  tablet: 834,
  mobile: 390,
};

// =====================================================================
// Style model
// =====================================================================

/**
 * A value that is either a theme token reference or a literal.
 * `{ token: "primary" }` participates in the theme cascade;
 * `{ value: "#ff0055" }` does not.
 */
export type TokenOrValue =
  | { token: string; value?: never }
  | { value: string; token?: never };

export type SpacingToken =
  | "none"
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl";

/**
 * Margins additionally accept `auto`, which spacing tokens cannot express.
 *
 * Without it a width-capped block could not be centered at all. Presets tried
 * to do it with `marginLeft: "none"`, which compiles to `margin-left: 0` — so
 * every `maxWidth` box sat flush against the left edge of a 1200px container
 * while its own text was centered. That is what made hero, page-header, FAQ and
 * appointment sections look misaligned with a large empty gap on the right.
 */
export type MarginToken = SpacingToken | "auto";

export type RadiusToken = "none" | "sm" | "md" | "lg" | "xl" | "full";

export type ShadowToken = "none" | "sm" | "md" | "lg" | "xl";

export type FontSizeToken =
  | "xs"
  | "sm"
  | "base"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl"
  | "6xl";

export type FontWeightToken =
  | "light"
  | "normal"
  | "medium"
  | "semibold"
  | "bold"
  | "extrabold";

/**
 * The style surface exposed by the inspector. Deliberately a curated
 * subset of CSS: a builder that exposes all of CSS produces broken,
 * non-responsive layouts. Anything genuinely custom goes in
 * `customCss`, which is scoped to the node.
 */
export interface StyleProps {
  // ---- Layout ----
  display?: "block" | "flex" | "grid" | "inline-flex" | "inline-block" | "none";
  flexDirection?: "row" | "column" | "row-reverse" | "column-reverse";
  flexWrap?: "nowrap" | "wrap";
  justifyContent?:
    | "flex-start"
    | "center"
    | "flex-end"
    | "space-between"
    | "space-around"
    | "space-evenly";
  alignItems?: "flex-start" | "center" | "flex-end" | "stretch" | "baseline";
  gap?: SpacingToken;
  /** Grid column count; the renderer emits repeat(n, minmax(0,1fr)). */
  gridColumns?: number;

  // ---- Box ----
  paddingTop?: SpacingToken;
  paddingRight?: SpacingToken;
  paddingBottom?: SpacingToken;
  paddingLeft?: SpacingToken;
  marginTop?: MarginToken;
  marginRight?: MarginToken;
  marginBottom?: MarginToken;
  marginLeft?: MarginToken;

  width?: string;
  maxWidth?: string;
  minHeight?: string;
  height?: string;

  // ---- Typography ----
  fontFamily?: "heading" | "body" | "mono";
  fontSize?: FontSizeToken;
  fontWeight?: FontWeightToken;
  lineHeight?: "tight" | "snug" | "normal" | "relaxed" | "loose";
  letterSpacing?: "tighter" | "tight" | "normal" | "wide" | "wider";
  textAlign?: "left" | "center" | "right" | "justify";
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  color?: TokenOrValue;

  // ---- Background ----
  backgroundColor?: TokenOrValue;
  backgroundImage?: string;
  backgroundSize?: "cover" | "contain" | "auto";
  backgroundPosition?: string;
  /** Dark scrim over background images so text stays legible (0..1). */
  backgroundOverlay?: number;

  // ---- Border ----
  borderWidth?: number;
  borderColor?: TokenOrValue;
  borderStyle?: "solid" | "dashed" | "dotted";
  borderRadius?: RadiusToken;

  // ---- Effects ----
  boxShadow?: ShadowToken;
  opacity?: number;
  overflow?: "visible" | "hidden" | "auto";

  // ---- Position ----
  position?: "static" | "relative" | "absolute" | "sticky" | "fixed";
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  zIndex?: number;

  /** Scoped raw CSS escape hatch, applied last. */
  customCss?: string;
}

/** Styles applied only while hovering. Same shape, narrower use. */
export type HoverStyleProps = Pick<
  StyleProps,
  | "color"
  | "backgroundColor"
  | "borderColor"
  | "boxShadow"
  | "opacity"
  | "borderRadius"
>;

// =====================================================================
// Animation
// =====================================================================

export type AnimationKind =
  | "none"
  | "fade-in"
  | "fade-up"
  | "fade-down"
  | "slide-left"
  | "slide-right"
  | "zoom-in"
  | "zoom-out"
  | "blur-in";

export interface AnimationSpec {
  kind: AnimationKind;
  /** Milliseconds. */
  duration?: number;
  delay?: number;
  easing?: "linear" | "ease" | "ease-in" | "ease-out" | "ease-in-out";
  /** Replay every time the node scrolls into view, not just the first. */
  repeat?: boolean;
  /** Background translate factor on scroll, 0 = off. */
  parallax?: number;
}

// =====================================================================
// Data binding (CMS)
// =====================================================================

/**
 * Binds a node prop to a CMS field instead of a static value. Used by
 * collection lists and dynamic detail pages: the same node tree renders
 * once per item with `item.<key>` resolved.
 */
export interface DataBinding {
  source: "cms" | "business" | "location" | "reviews";
  /** Dot path within the source, e.g. "item.title" or "location.phone". */
  path: string;
  fallback?: string;
}

// =====================================================================
// Interactions
// =====================================================================

export type LinkTarget = "_self" | "_blank";

export type ActionSpec =
  | { kind: "none" }
  | { kind: "url"; href: string; target?: LinkTarget; rel?: string }
  | { kind: "page"; pageId: string; hash?: string }
  | { kind: "scroll"; nodeId: NodeId }
  | { kind: "tel"; phone: string }
  | { kind: "mailto"; email: string }
  | { kind: "whatsapp"; phone: string; message?: string }
  | { kind: "submit"; formId: string }
  | { kind: "openModal"; nodeId: NodeId }
  | { kind: "download"; href: string };

// =====================================================================
// Node
// =====================================================================

/**
 * Props are component-specific and validated per node type by the
 * registry's Zod schema (see src/site/registry). `unknown` here, typed
 * at the boundary — the alternative is a discriminated union of ~40
 * component types leaking into every consumer.
 */
export type NodeProps = Record<string, unknown>;

export interface SiteNode {
  id: NodeId;
  /** Registry key, e.g. "Heading", "Section", "GoogleReviews". */
  type: string;

  /** User-facing name in the layers panel. Defaults to the type label. */
  name?: string;

  props: NodeProps;

  /** Ordered child ids. Empty for leaf components. */
  children: NodeId[];
  /** Null only for the root node. */
  parent: NodeId | null;

  style?: StyleProps;
  /** Overrides merged over `style` at or below each breakpoint. */
  responsive?: Partial<Record<Exclude<Breakpoint, "base">, StyleProps>>;
  hover?: HoverStyleProps;

  animation?: AnimationSpec;
  action?: ActionSpec;
  bindings?: Record<string, DataBinding>;

  // ---- Editor state (persisted; affects authoring, not output) ----
  /** Not selectable/draggable on the canvas. */
  locked?: boolean;
  /** Hidden in the editor AND excluded from render. */
  hidden?: boolean;
  /** Per-breakpoint visibility, e.g. desktop-only decorations. */
  hiddenOn?: Exclude<Breakpoint, "base">[];
  /** Collapsed in the layers tree. */
  collapsed?: boolean;

  /** Marks nodes created by a section preset, for "reset section". */
  presetKey?: string;

  /** Accessibility overrides the component can't infer. */
  a11y?: {
    ariaLabel?: string;
    role?: string;
    /** Decorative images opt out of alt text requirements. */
    decorative?: boolean;
  };
}

// =====================================================================
// Theme
// =====================================================================

export interface ColorScale {
  /** Main brand color. */
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  accent: string;
  accentForeground: string;

  background: string;
  foreground: string;
  /** Alternating section background. */
  muted: string;
  mutedForeground: string;
  card: string;
  cardForeground: string;
  border: string;

  success: string;
  warning: string;
  destructive: string;
}

export interface TypographyTokens {
  headingFont: string;
  bodyFont: string;
  monoFont: string;
  /** Multiplier applied to the whole font-size scale. */
  scale: number;
  headingWeight: FontWeightToken;
  bodyWeight: FontWeightToken;
}

export interface ThemeTokens {
  colors: ColorScale;
  /** Optional dark-mode color overrides; absent = no dark mode. */
  darkColors?: Partial<ColorScale>;
  typography: TypographyTokens;
  radius: RadiusToken;
  /** Base spacing unit in px; the scale is derived from it. */
  spacingUnit: number;
  /** Max content width in px. */
  containerWidth: number;
  defaultShadow: ShadowToken;
  /** Preset name, kept so the AI can reason about intent. */
  styleKeyword?:
    | "modern"
    | "minimal"
    | "luxurious"
    | "playful"
    | "corporate"
    | "warm"
    | "bold"
    | "clinical";
}

// =====================================================================
// SEO
// =====================================================================

export interface SeoMeta {
  title?: string;
  description?: string;
  keywords?: string[];
  canonical?: string;
  ogImage?: string;
  ogTitle?: string;
  ogDescription?: string;
  twitterCard?: "summary" | "summary_large_image";
  noIndex?: boolean;
  noFollow?: boolean;
  /** schema.org JSON-LD type, e.g. "Dentist", "Restaurant". */
  schemaType?: string;
  /** Extra JSON-LD merged into the emitted graph. */
  structuredData?: Record<string, unknown>;
}

// =====================================================================
// Brand context (AI memory)
// =====================================================================

/**
 * Persisted on the Site and injected into every AI prompt so the user
 * never restates who they are. This is the "AI Context Memory"
 * requirement — it is data, not conversation history, so it survives
 * new threads and stays cheap to send.
 */
export interface BrandContext {
  businessName?: string;
  industry?: string;
  /** e.g. "Dentist", "Fine dining restaurant". */
  businessCategory?: string;
  services?: string[];
  targetAudience?: string;
  tone?: string;
  brandColors?: string[];
  logoUrl?: string;
  city?: string;
  country?: string;
  language?: string;
  phone?: string;
  email?: string;
  whatsapp?: string;
  address?: string;
  /** Free-form notes the owner wants the AI to always respect. */
  notes?: string;
  /** Differentiators the AI should lean on in copy. */
  highlights?: string[];
}

// =====================================================================
// Document
// =====================================================================

export interface SiteDocument {
  version: number;
  /** Always present in `nodes`; must be of type "Page". */
  root: NodeId;
  nodes: Record<NodeId, SiteNode>;
}

/**
 * Server-resolved data the "smart" components need.
 *
 * Fetched once per page render and passed down, rather than each component
 * fetching for itself: a page with three review widgets must not issue
 * three queries, and the public renderer has to stay cacheable.
 */
export interface SiteRenderData {
  reviews?: Array<{
    id: string;
    authorName: string;
    authorPhotoUrl?: string | null;
    rating: number;
    comment?: string | null;
    createdAt: string;
    replyText?: string | null;
  }>;
  ratingSummary?: { average: number; total: number };
  /** Public "write a review" destination for the connected location. */
  writeReviewUrl?: string | null;
  location?: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    website?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    googlePlaceId?: string | null;
    timezone?: string | null;
    /** Keyed by weekday 0..6, each a list of open/close ranges. */
    workingHours?: Record<string, Array<{ open: string; close: string }>> | null;
  } | null;
  /** CMS items keyed by collection id, for CollectionList. */
  collections?: Record<
    string,
    {
      slug: string;
      items: Array<{
        id: string;
        slug: string;
        title: string;
        excerpt?: string | null;
        featuredImageUrl?: string | null;
        publishedAt?: string | null;
        data?: Record<string, unknown>;
      }>;
    }
  >;
  /** Form definitions keyed by form id, for Form. */
  forms?: Record<
    string,
    {
      id: string;
      name: string;
      successMessage?: string | null;
      fields: Array<{
        key: string;
        label: string;
        kind: string;
        required?: boolean;
        placeholder?: string;
        options?: string[];
        helpText?: string;
      }>;
    }
  >;
  socialLinks?: Record<string, string>;
  /** Google Maps embed key, absent when unconfigured. */
  mapsApiKey?: string | null;
}

/** Convenience shape for the renderer: document + everything around it. */
export interface RenderContext {
  document: SiteDocument;
  theme: ThemeTokens;
  brand: BrandContext;
  /** Resolved nav links for Navbar/Footer components. */
  pages: Array<{ id: string; title: string; path: string; hiddenInNav: boolean }>;
  /** Base path all internal links are prefixed with, e.g. "/s/my-clinic". */
  basePath: string;
  data: SiteRenderData;
  /** Present when rendering a CMS detail page. */
  cmsItem?: Record<string, unknown>;
  /** True inside the editor canvas — disables navigation, submits, autoplay. */
  editor?: boolean;
  /** Breakpoint the editor is simulating; undefined on published pages. */
  previewBreakpoint?: Breakpoint;
  /** Public form submission endpoint. */
  submitEndpoint?: string;
  /** Public analytics beacon endpoint. Absent disables tracking. */
  trackEndpoint?: string;
}
