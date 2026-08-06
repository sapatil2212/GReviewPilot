/**
 * Component registry — metadata + prop schemas.
 *
 * One definition per node type, consumed by four different subsystems:
 *
 *   palette      left sidebar "Components" list (category, icon, label)
 *   inspector    which prop controls to render (propFields)
 *   renderer     nothing directly, but defaults fill missing props
 *   AI + API     Zod validation of every incoming node before it is
 *                persisted, so a hallucinated prop can never reach the DB
 *
 * Deliberately React-free so the server can import it. The matching React
 * implementations live in src/site/render/components and are keyed by the
 * same `type` string; `assertRegistryComplete()` in that module fails the
 * build if the two ever drift.
 */

import { z } from "zod";

// =====================================================================
// Prop field descriptors (drive the inspector UI)
// =====================================================================

export type PropFieldKind =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "boolean"
  | "select"
  | "color"
  | "image"
  | "icon"
  | "link"
  | "list"
  | "collection"
  | "form"
  | "location";

export interface PropField {
  key: string;
  label: string;
  kind: PropFieldKind;
  options?: Array<{ value: string; label: string }>;
  placeholder?: string;
  help?: string;
  min?: number;
  max?: number;
  /** Only show this field when another prop equals one of these values. */
  showWhen?: { key: string; equals: unknown[] };
  /** Sub-fields for `kind: "list"` items. */
  itemFields?: PropField[];
}

export type ComponentCategory =
  | "layout"
  | "typography"
  | "media"
  | "interactive"
  | "business"
  | "cms"
  | "advanced";

export interface ComponentDefinition {
  type: string;
  label: string;
  category: ComponentCategory;
  /** lucide-react icon name. */
  icon: string;
  description: string;

  /** Accepts children on the canvas. */
  isContainer: boolean;
  /** Restrict which types may be dropped inside. Empty = anything. */
  allowedChildren?: string[];
  /** Restrict where this may be dropped. Empty = anywhere. */
  allowedParents?: string[];

  /** Cannot be deleted, duplicated, or dragged (currently only Page). */
  isRoot?: boolean;
  /** Hidden from the palette; created only by presets or as a child. */
  hiddenInPalette?: boolean;

  schema: z.ZodTypeAny;
  defaultProps: Record<string, unknown>;
  propFields: PropField[];

  /** Prop edited by double-clicking on the canvas. */
  inlineTextProp?: string;
  /** Props the AI content engine may rewrite. */
  contentProps?: string[];
}

// =====================================================================
// Shared fragments
// =====================================================================

const headingLevel = z.enum(["h1", "h2", "h3", "h4", "h5", "h6"]);

const linkSchema = z.object({
  label: z.string().max(120).default("Link"),
  href: z.string().max(500).default("#"),
  target: z.enum(["_self", "_blank"]).optional(),
});

const HEADING_LEVEL_OPTIONS = [
  { value: "h1", label: "H1 — page title" },
  { value: "h2", label: "H2 — section title" },
  { value: "h3", label: "H3 — subsection" },
  { value: "h4", label: "H4" },
  { value: "h5", label: "H5" },
  { value: "h6", label: "H6" },
];

const linkListField: PropField = {
  key: "links",
  label: "Links",
  kind: "list",
  itemFields: [
    { key: "label", label: "Label", kind: "text" },
    { key: "href", label: "URL", kind: "link" },
  ],
};

// =====================================================================
// Definitions
// =====================================================================

function def(d: ComponentDefinition): ComponentDefinition {
  return d;
}

export const COMPONENTS: ComponentDefinition[] = [
  // ---------------- Layout ----------------
  def({
    type: "Page",
    label: "Page",
    category: "layout",
    icon: "File",
    description: "Page root. Holds all sections.",
    isContainer: true,
    isRoot: true,
    hiddenInPalette: true,
    schema: z.object({}).passthrough(),
    defaultProps: {},
    propFields: [],
  }),

  def({
    type: "Section",
    label: "Section",
    category: "layout",
    icon: "Rows3",
    description: "Full-width band. The top-level building block of a page.",
    isContainer: true,
    allowedParents: ["Page"],
    schema: z.object({
      as: z.enum(["section", "header", "footer", "main", "aside", "div"]).default("section"),
      /** Constrain content to the theme container width. */
      contained: z.boolean().default(true),
      anchorId: z.string().max(60).optional(),
    }),
    defaultProps: { as: "section", contained: true },
    propFields: [
      {
        key: "as",
        label: "HTML tag",
        kind: "select",
        help: "Affects SEO and screen-reader landmarks.",
        options: [
          { value: "section", label: "section" },
          { value: "header", label: "header" },
          { value: "footer", label: "footer" },
          { value: "main", label: "main" },
          { value: "aside", label: "aside" },
          { value: "div", label: "div" },
        ],
      },
      { key: "contained", label: "Constrain width", kind: "boolean" },
      {
        key: "anchorId",
        label: "Anchor ID",
        kind: "text",
        placeholder: "services",
        help: "Lets links jump here with #services.",
      },
    ],
  }),

  def({
    type: "Container",
    label: "Container",
    category: "layout",
    icon: "Square",
    description: "Width-constrained wrapper.",
    isContainer: true,
    schema: z.object({}),
    defaultProps: {},
    propFields: [],
  }),

  def({
    type: "Box",
    label: "Box",
    category: "layout",
    icon: "SquareDashed",
    description: "Generic div. Style it however you like.",
    isContainer: true,
    schema: z.object({
      as: z.enum(["div", "article", "figure", "nav", "ul", "li"]).default("div"),
    }),
    defaultProps: { as: "div" },
    propFields: [
      {
        key: "as",
        label: "HTML tag",
        kind: "select",
        options: [
          { value: "div", label: "div" },
          { value: "article", label: "article" },
          { value: "figure", label: "figure" },
          { value: "nav", label: "nav" },
          { value: "ul", label: "ul" },
          { value: "li", label: "li" },
        ],
      },
    ],
  }),

  def({
    type: "Grid",
    label: "Grid",
    category: "layout",
    icon: "LayoutGrid",
    description: "Responsive column grid.",
    isContainer: true,
    schema: z.object({
      columns: z.number().int().min(1).max(6).default(3),
      tabletColumns: z.number().int().min(1).max(6).default(2),
      mobileColumns: z.number().int().min(1).max(6).default(1),
    }),
    defaultProps: { columns: 3, tabletColumns: 2, mobileColumns: 1 },
    propFields: [
      { key: "columns", label: "Desktop columns", kind: "number", min: 1, max: 6 },
      { key: "tabletColumns", label: "Tablet columns", kind: "number", min: 1, max: 6 },
      { key: "mobileColumns", label: "Mobile columns", kind: "number", min: 1, max: 6 },
    ],
  }),

  def({
    type: "Spacer",
    label: "Spacer",
    category: "layout",
    icon: "MoveVertical",
    description: "Vertical gap.",
    isContainer: false,
    schema: z.object({ height: z.number().int().min(0).max(400).default(48) }),
    defaultProps: { height: 48 },
    propFields: [{ key: "height", label: "Height (px)", kind: "number", min: 0, max: 400 }],
  }),

  def({
    type: "Divider",
    label: "Divider",
    category: "layout",
    icon: "Minus",
    description: "Horizontal rule.",
    isContainer: false,
    schema: z.object({
      thickness: z.number().int().min(1).max(12).default(1),
      inset: z.boolean().default(false),
    }),
    defaultProps: { thickness: 1, inset: false },
    propFields: [
      { key: "thickness", label: "Thickness (px)", kind: "number", min: 1, max: 12 },
      { key: "inset", label: "Inset", kind: "boolean" },
    ],
  }),

  // ---------------- Typography ----------------
  def({
    type: "Heading",
    label: "Heading",
    category: "typography",
    icon: "Heading",
    description: "Semantic heading, h1 to h6.",
    isContainer: false,
    schema: z.object({
      text: z.string().max(300).default("Your heading"),
      level: headingLevel.default("h2"),
    }),
    defaultProps: { text: "Your heading", level: "h2" },
    propFields: [
      { key: "text", label: "Text", kind: "textarea" },
      { key: "level", label: "Level", kind: "select", options: HEADING_LEVEL_OPTIONS },
    ],
    inlineTextProp: "text",
    contentProps: ["text"],
  }),

  def({
    type: "Text",
    label: "Text",
    category: "typography",
    icon: "Type",
    description: "Paragraph of plain text.",
    isContainer: false,
    schema: z.object({
      text: z.string().max(5000).default("Write something here."),
      as: z.enum(["p", "span", "div", "label"]).default("p"),
    }),
    defaultProps: { text: "Write something here.", as: "p" },
    propFields: [
      { key: "text", label: "Text", kind: "textarea" },
      {
        key: "as",
        label: "HTML tag",
        kind: "select",
        options: [
          { value: "p", label: "p" },
          { value: "span", label: "span" },
          { value: "div", label: "div" },
          { value: "label", label: "label" },
        ],
      },
    ],
    inlineTextProp: "text",
    contentProps: ["text"],
  }),

  def({
    type: "RichText",
    label: "Rich text",
    category: "typography",
    icon: "FileText",
    description: "Formatted content block. Used for blog bodies and long copy.",
    isContainer: false,
    schema: z.object({ html: z.string().max(200_000).default("<p>Rich text.</p>") }),
    defaultProps: { html: "<p>Rich text.</p>" },
    propFields: [{ key: "html", label: "Content", kind: "richtext" }],
    contentProps: ["html"],
  }),

  def({
    type: "Badge",
    label: "Badge",
    category: "typography",
    icon: "Tag",
    description: "Small pill label — eyebrow text, offers, tags.",
    isContainer: false,
    schema: z.object({ text: z.string().max(80).default("New") }),
    defaultProps: { text: "New" },
    propFields: [{ key: "text", label: "Text", kind: "text" }],
    inlineTextProp: "text",
    contentProps: ["text"],
  }),

  def({
    type: "Icon",
    label: "Icon",
    category: "media",
    icon: "Star",
    description: "Vector icon from the Lucide set.",
    isContainer: false,
    schema: z.object({
      name: z.string().max(60).default("Star"),
      size: z.number().int().min(8).max(200).default(24),
      strokeWidth: z.number().min(0.5).max(4).default(2),
    }),
    defaultProps: { name: "Star", size: 24, strokeWidth: 2 },
    propFields: [
      { key: "name", label: "Icon", kind: "icon" },
      { key: "size", label: "Size (px)", kind: "number", min: 8, max: 200 },
      { key: "strokeWidth", label: "Stroke", kind: "number", min: 0.5, max: 4 },
    ],
  }),

  // ---------------- Media ----------------
  def({
    type: "Image",
    label: "Image",
    category: "media",
    icon: "Image",
    description: "Responsive, lazy-loaded image.",
    isContainer: false,
    schema: z.object({
      src: z.string().max(1000).default(""),
      alt: z.string().max(300).default(""),
      /** Aspect ratio locks the box so loading never shifts layout. */
      aspectRatio: z
        .enum(["auto", "1/1", "4/3", "3/2", "16/9", "21/9", "3/4", "2/3"])
        .default("auto"),
      objectFit: z.enum(["cover", "contain", "fill", "none"]).default("cover"),
      /** Skip lazy-loading for above-the-fold images (LCP). */
      priority: z.boolean().default(false),
      caption: z.string().max(300).optional(),
    }),
    defaultProps: { src: "", alt: "", aspectRatio: "auto", objectFit: "cover", priority: false },
    propFields: [
      { key: "src", label: "Image", kind: "image" },
      {
        key: "alt",
        label: "Alt text",
        kind: "text",
        help: "Describe the image for screen readers and image SEO.",
      },
      {
        key: "aspectRatio",
        label: "Aspect ratio",
        kind: "select",
        options: [
          { value: "auto", label: "Auto" },
          { value: "1/1", label: "1:1 square" },
          { value: "4/3", label: "4:3" },
          { value: "3/2", label: "3:2" },
          { value: "16/9", label: "16:9" },
          { value: "21/9", label: "21:9 ultrawide" },
          { value: "3/4", label: "3:4 portrait" },
          { value: "2/3", label: "2:3 portrait" },
        ],
      },
      {
        key: "objectFit",
        label: "Fit",
        kind: "select",
        options: [
          { value: "cover", label: "Cover" },
          { value: "contain", label: "Contain" },
          { value: "fill", label: "Fill" },
          { value: "none", label: "None" },
        ],
      },
      {
        key: "priority",
        label: "Load immediately",
        kind: "boolean",
        help: "Turn on for the hero image so it does not lazy-load.",
      },
      { key: "caption", label: "Caption", kind: "text" },
    ],
    contentProps: ["alt", "caption"],
  }),

  def({
    type: "VideoEmbed",
    label: "Video",
    category: "media",
    icon: "Video",
    description: "YouTube or Vimeo embed, loaded only on click.",
    isContainer: false,
    schema: z.object({
      url: z.string().max(500).default(""),
      posterUrl: z.string().max(1000).optional(),
      aspectRatio: z.enum(["16/9", "4/3", "1/1", "9/16"]).default("16/9"),
      title: z.string().max(200).optional(),
    }),
    defaultProps: { url: "", aspectRatio: "16/9" },
    propFields: [
      { key: "url", label: "Video URL", kind: "text", placeholder: "https://youtube.com/watch?v=..." },
      { key: "posterUrl", label: "Poster image", kind: "image" },
      {
        key: "aspectRatio",
        label: "Aspect ratio",
        kind: "select",
        options: [
          { value: "16/9", label: "16:9" },
          { value: "4/3", label: "4:3" },
          { value: "1/1", label: "1:1" },
          { value: "9/16", label: "9:16 vertical" },
        ],
      },
      { key: "title", label: "Accessible title", kind: "text" },
    ],
  }),

  // ---------------- Interactive ----------------
  def({
    type: "Button",
    label: "Button",
    category: "interactive",
    icon: "MousePointerClick",
    description: "Call-to-action button or link.",
    isContainer: false,
    schema: z.object({
      label: z.string().max(120).default("Get started"),
      variant: z.enum(["primary", "secondary", "outline", "ghost", "accent"]).default("primary"),
      size: z.enum(["sm", "md", "lg"]).default("md"),
      fullWidth: z.boolean().default(false),
      iconName: z.string().max(60).optional(),
      iconPosition: z.enum(["left", "right"]).default("right"),
    }),
    defaultProps: {
      label: "Get started",
      variant: "primary",
      size: "md",
      fullWidth: false,
      iconPosition: "right",
    },
    propFields: [
      { key: "label", label: "Label", kind: "text" },
      {
        key: "variant",
        label: "Style",
        kind: "select",
        options: [
          { value: "primary", label: "Primary" },
          { value: "secondary", label: "Secondary" },
          { value: "accent", label: "Accent" },
          { value: "outline", label: "Outline" },
          { value: "ghost", label: "Ghost" },
        ],
      },
      {
        key: "size",
        label: "Size",
        kind: "select",
        options: [
          { value: "sm", label: "Small" },
          { value: "md", label: "Medium" },
          { value: "lg", label: "Large" },
        ],
      },
      { key: "fullWidth", label: "Full width", kind: "boolean" },
      { key: "iconName", label: "Icon", kind: "icon" },
      {
        key: "iconPosition",
        label: "Icon position",
        kind: "select",
        showWhen: { key: "iconName", equals: [] },
        options: [
          { value: "left", label: "Left" },
          { value: "right", label: "Right" },
        ],
      },
    ],
    inlineTextProp: "label",
    contentProps: ["label"],
  }),

  def({
    type: "Accordion",
    label: "Accordion / FAQ",
    category: "interactive",
    icon: "ChevronsUpDown",
    description: "Collapsible question and answer list.",
    isContainer: false,
    schema: z.object({
      items: z
        .array(
          z.object({
            question: z.string().max(300).default(""),
            answer: z.string().max(3000).default(""),
          }),
        )
        .max(50)
        .default([]),
      allowMultiple: z.boolean().default(false),
      defaultOpenIndex: z.number().int().min(-1).max(49).default(0),
    }),
    defaultProps: { items: [], allowMultiple: false, defaultOpenIndex: 0 },
    propFields: [
      {
        key: "items",
        label: "Questions",
        kind: "list",
        itemFields: [
          { key: "question", label: "Question", kind: "text" },
          { key: "answer", label: "Answer", kind: "textarea" },
        ],
      },
      { key: "allowMultiple", label: "Allow multiple open", kind: "boolean" },
      {
        key: "defaultOpenIndex",
        label: "Open by default",
        kind: "number",
        min: -1,
        max: 49,
        help: "-1 keeps all closed.",
      },
    ],
    contentProps: ["items"],
  }),

  def({
    type: "Tabs",
    label: "Tabs",
    category: "interactive",
    icon: "PanelTop",
    description: "Tabbed content panels.",
    isContainer: false,
    schema: z.object({
      items: z
        .array(
          z.object({
            label: z.string().max(120).default(""),
            content: z.string().max(5000).default(""),
          }),
        )
        .max(20)
        .default([]),
    }),
    defaultProps: { items: [] },
    propFields: [
      {
        key: "items",
        label: "Tabs",
        kind: "list",
        itemFields: [
          { key: "label", label: "Tab label", kind: "text" },
          { key: "content", label: "Content", kind: "textarea" },
        ],
      },
    ],
    contentProps: ["items"],
  }),

  def({
    type: "Carousel",
    label: "Carousel",
    category: "interactive",
    icon: "GalleryHorizontal",
    description: "Swipeable slider of images or cards.",
    isContainer: false,
    schema: z.object({
      slides: z
        .array(
          z.object({
            imageUrl: z.string().max(1000).default(""),
            alt: z.string().max(300).default(""),
            caption: z.string().max(300).optional(),
          }),
        )
        .max(30)
        .default([]),
      slidesPerView: z.number().int().min(1).max(5).default(3),
      autoplay: z.boolean().default(false),
      intervalMs: z.number().int().min(1500).max(15000).default(5000),
      showArrows: z.boolean().default(true),
      showDots: z.boolean().default(true),
    }),
    defaultProps: {
      slides: [],
      slidesPerView: 3,
      autoplay: false,
      intervalMs: 5000,
      showArrows: true,
      showDots: true,
    },
    propFields: [
      {
        key: "slides",
        label: "Slides",
        kind: "list",
        itemFields: [
          { key: "imageUrl", label: "Image", kind: "image" },
          { key: "alt", label: "Alt text", kind: "text" },
          { key: "caption", label: "Caption", kind: "text" },
        ],
      },
      { key: "slidesPerView", label: "Slides per view", kind: "number", min: 1, max: 5 },
      { key: "autoplay", label: "Autoplay", kind: "boolean" },
      {
        key: "intervalMs",
        label: "Interval (ms)",
        kind: "number",
        min: 1500,
        max: 15000,
        showWhen: { key: "autoplay", equals: [true] },
      },
      { key: "showArrows", label: "Show arrows", kind: "boolean" },
      { key: "showDots", label: "Show dots", kind: "boolean" },
    ],
    contentProps: ["slides"],
  }),

  def({
    type: "Form",
    label: "Form",
    category: "interactive",
    icon: "ClipboardList",
    description: "Lead, appointment, or contact form wired to a saved form.",
    isContainer: false,
    schema: z.object({
      formId: z.string().max(40).optional(),
      submitLabel: z.string().max(120).default("Send message"),
      layout: z.enum(["stacked", "two-column"]).default("stacked"),
      showLabels: z.boolean().default(true),
    }),
    defaultProps: { submitLabel: "Send message", layout: "stacked", showLabels: true },
    propFields: [
      { key: "formId", label: "Form", kind: "form", help: "Choose which saved form receives submissions." },
      { key: "submitLabel", label: "Submit button", kind: "text" },
      {
        key: "layout",
        label: "Layout",
        kind: "select",
        options: [
          { value: "stacked", label: "Stacked" },
          { value: "two-column", label: "Two column" },
        ],
      },
      { key: "showLabels", label: "Show field labels", kind: "boolean" },
    ],
    contentProps: ["submitLabel"],
  }),

  // ---------------- Business ----------------
  def({
    type: "Navbar",
    label: "Navbar",
    category: "business",
    icon: "Menu",
    description: "Site header with logo, links, and a mobile menu.",
    isContainer: false,
    schema: z.object({
      logoUrl: z.string().max(1000).optional(),
      logoText: z.string().max(120).optional(),
      /** Empty = auto-generate from the site's pages. */
      links: z.array(linkSchema).max(12).default([]),
      ctaLabel: z.string().max(80).optional(),
      ctaHref: z.string().max(500).optional(),
      sticky: z.boolean().default(true),
      /** Transparent over a hero image until scrolled. */
      transparentUntilScroll: z.boolean().default(false),
      align: z.enum(["left", "center", "right"]).default("right"),
    }),
    defaultProps: { links: [], sticky: true, transparentUntilScroll: false, align: "right" },
    propFields: [
      { key: "logoUrl", label: "Logo", kind: "image" },
      { key: "logoText", label: "Logo text", kind: "text", help: "Shown when no logo image is set." },
      { ...linkListField, help: "Leave empty to list your pages automatically." },
      { key: "ctaLabel", label: "CTA label", kind: "text" },
      { key: "ctaHref", label: "CTA link", kind: "link" },
      { key: "sticky", label: "Stick to top", kind: "boolean" },
      { key: "transparentUntilScroll", label: "Transparent over hero", kind: "boolean" },
      {
        key: "align",
        label: "Link alignment",
        kind: "select",
        options: [
          { value: "left", label: "Left" },
          { value: "center", label: "Center" },
          { value: "right", label: "Right" },
        ],
      },
    ],
    contentProps: ["logoText", "ctaLabel"],
  }),

  def({
    type: "Footer",
    label: "Footer",
    category: "business",
    icon: "PanelBottom",
    description: "Site footer with columns, contact details, and legal links.",
    isContainer: false,
    schema: z.object({
      logoText: z.string().max(120).optional(),
      tagline: z.string().max(400).optional(),
      columns: z
        .array(
          z.object({
            title: z.string().max(80).default(""),
            links: z.array(linkSchema).max(10).default([]),
          }),
        )
        .max(4)
        .default([]),
      showContact: z.boolean().default(true),
      showSocial: z.boolean().default(true),
      copyright: z.string().max(300).optional(),
      /** Hide the "Built with" line — requires a white-label plan. */
      hidePlatformBranding: z.boolean().default(false),
    }),
    defaultProps: { columns: [], showContact: true, showSocial: true, hidePlatformBranding: false },
    propFields: [
      { key: "logoText", label: "Business name", kind: "text" },
      { key: "tagline", label: "Tagline", kind: "textarea" },
      {
        key: "columns",
        label: "Link columns",
        kind: "list",
        itemFields: [{ key: "title", label: "Column title", kind: "text" }],
      },
      { key: "showContact", label: "Show contact details", kind: "boolean" },
      { key: "showSocial", label: "Show social links", kind: "boolean" },
      { key: "copyright", label: "Copyright line", kind: "text" },
      { key: "hidePlatformBranding", label: "Hide platform branding", kind: "boolean" },
    ],
    contentProps: ["tagline", "copyright"],
  }),

  def({
    type: "GoogleReviews",
    label: "Google reviews",
    category: "business",
    icon: "Star",
    description: "Live reviews pulled from your connected Google Business Profile.",
    isContainer: false,
    schema: z.object({
      locationId: z.string().max(40).optional(),
      layout: z.enum(["grid", "carousel", "list"]).default("grid"),
      limit: z.number().int().min(1).max(24).default(6),
      minRating: z.number().int().min(1).max(5).default(4),
      showRatingSummary: z.boolean().default(true),
      showReviewerPhoto: z.boolean().default(true),
      showWriteReviewCta: z.boolean().default(true),
      writeReviewLabel: z.string().max(80).default("Write a review"),
    }),
    defaultProps: {
      layout: "grid",
      limit: 6,
      minRating: 4,
      showRatingSummary: true,
      showReviewerPhoto: true,
      showWriteReviewCta: true,
      writeReviewLabel: "Write a review",
    },
    propFields: [
      { key: "locationId", label: "Location", kind: "location" },
      {
        key: "layout",
        label: "Layout",
        kind: "select",
        options: [
          { value: "grid", label: "Grid" },
          { value: "carousel", label: "Carousel" },
          { value: "list", label: "List" },
        ],
      },
      { key: "limit", label: "Reviews shown", kind: "number", min: 1, max: 24 },
      {
        key: "minRating",
        label: "Minimum rating",
        kind: "number",
        min: 1,
        max: 5,
        help: "Only display reviews at or above this star rating.",
      },
      { key: "showRatingSummary", label: "Show rating summary", kind: "boolean" },
      { key: "showReviewerPhoto", label: "Show reviewer photos", kind: "boolean" },
      { key: "showWriteReviewCta", label: "Show review button", kind: "boolean" },
      { key: "writeReviewLabel", label: "Review button label", kind: "text" },
    ],
    contentProps: ["writeReviewLabel"],
  }),

  def({
    type: "Map",
    label: "Map",
    category: "business",
    icon: "MapPin",
    description: "Google map for a business location.",
    isContainer: false,
    schema: z.object({
      locationId: z.string().max(40).optional(),
      address: z.string().max(400).optional(),
      zoom: z.number().int().min(1).max(20).default(15),
      height: z.number().int().min(150).max(900).default(400),
      showDirectionsLink: z.boolean().default(true),
    }),
    defaultProps: { zoom: 15, height: 400, showDirectionsLink: true },
    propFields: [
      { key: "locationId", label: "Location", kind: "location" },
      { key: "address", label: "Address override", kind: "textarea" },
      { key: "zoom", label: "Zoom", kind: "number", min: 1, max: 20 },
      { key: "height", label: "Height (px)", kind: "number", min: 150, max: 900 },
      { key: "showDirectionsLink", label: "Show directions link", kind: "boolean" },
    ],
  }),

  def({
    type: "OpeningHours",
    label: "Opening hours",
    category: "business",
    icon: "Clock",
    description: "Weekly hours with a live open/closed badge.",
    isContainer: false,
    schema: z.object({
      locationId: z.string().max(40).optional(),
      showTodayHighlight: z.boolean().default(true),
      showOpenBadge: z.boolean().default(true),
    }),
    defaultProps: { showTodayHighlight: true, showOpenBadge: true },
    propFields: [
      { key: "locationId", label: "Location", kind: "location" },
      { key: "showTodayHighlight", label: "Highlight today", kind: "boolean" },
      { key: "showOpenBadge", label: "Show open/closed badge", kind: "boolean" },
    ],
  }),

  def({
    type: "WhatsAppButton",
    label: "WhatsApp button",
    category: "business",
    icon: "MessageCircle",
    description: "Floating or inline WhatsApp chat button with a prefilled message.",
    isContainer: false,
    schema: z.object({
      phone: z.string().max(30).default(""),
      message: z.string().max(500).default("Hi! I'd like to know more."),
      label: z.string().max(80).default("Chat on WhatsApp"),
      floating: z.boolean().default(true),
      position: z.enum(["bottom-right", "bottom-left"]).default("bottom-right"),
      showLabel: z.boolean().default(false),
    }),
    defaultProps: {
      phone: "",
      message: "Hi! I'd like to know more.",
      label: "Chat on WhatsApp",
      floating: true,
      position: "bottom-right",
      showLabel: false,
    },
    propFields: [
      { key: "phone", label: "WhatsApp number", kind: "text", placeholder: "+911234567890", help: "Include the country code." },
      { key: "message", label: "Prefilled message", kind: "textarea" },
      { key: "label", label: "Button label", kind: "text" },
      { key: "floating", label: "Float over the page", kind: "boolean" },
      {
        key: "position",
        label: "Position",
        kind: "select",
        showWhen: { key: "floating", equals: [true] },
        options: [
          { value: "bottom-right", label: "Bottom right" },
          { value: "bottom-left", label: "Bottom left" },
        ],
      },
      { key: "showLabel", label: "Show label", kind: "boolean" },
    ],
    contentProps: ["message", "label"],
  }),

  def({
    type: "StatCounter",
    label: "Stat counter",
    category: "business",
    icon: "TrendingUp",
    description: "Animated number with a caption. Good for trust signals.",
    isContainer: false,
    schema: z.object({
      value: z.string().max(40).default("500"),
      suffix: z.string().max(12).default("+"),
      prefix: z.string().max(12).optional(),
      label: z.string().max(160).default("Happy customers"),
      animate: z.boolean().default(true),
    }),
    defaultProps: { value: "500", suffix: "+", label: "Happy customers", animate: true },
    propFields: [
      { key: "prefix", label: "Prefix", kind: "text" },
      { key: "value", label: "Value", kind: "text" },
      { key: "suffix", label: "Suffix", kind: "text" },
      { key: "label", label: "Label", kind: "text" },
      { key: "animate", label: "Count up on scroll", kind: "boolean" },
    ],
    inlineTextProp: "label",
    contentProps: ["label"],
  }),

  def({
    type: "Rating",
    label: "Star rating",
    category: "business",
    icon: "Sparkles",
    description: "Static star rating display.",
    isContainer: false,
    schema: z.object({
      value: z.number().min(0).max(5).default(5),
      showValue: z.boolean().default(false),
      size: z.number().int().min(10).max(48).default(18),
    }),
    defaultProps: { value: 5, showValue: false, size: 18 },
    propFields: [
      { key: "value", label: "Rating", kind: "number", min: 0, max: 5 },
      { key: "showValue", label: "Show number", kind: "boolean" },
      { key: "size", label: "Star size (px)", kind: "number", min: 10, max: 48 },
    ],
  }),

  def({
    type: "SocialLinks",
    label: "Social links",
    category: "business",
    icon: "Share2",
    description: "Row of social profile icons.",
    isContainer: false,
    schema: z.object({
      links: z
        .array(
          z.object({
            platform: z.enum([
              "facebook",
              "instagram",
              "twitter",
              "linkedin",
              "youtube",
              "tiktok",
              "pinterest",
              "whatsapp",
            ]),
            url: z.string().max(500),
          }),
        )
        .max(10)
        .default([]),
      size: z.number().int().min(12).max(48).default(20),
      variant: z.enum(["plain", "filled", "outline"]).default("plain"),
    }),
    defaultProps: { links: [], size: 20, variant: "plain" },
    propFields: [
      {
        key: "links",
        label: "Profiles",
        kind: "list",
        itemFields: [
          {
            key: "platform",
            label: "Platform",
            kind: "select",
            options: [
              { value: "facebook", label: "Facebook" },
              { value: "instagram", label: "Instagram" },
              { value: "twitter", label: "X / Twitter" },
              { value: "linkedin", label: "LinkedIn" },
              { value: "youtube", label: "YouTube" },
              { value: "tiktok", label: "TikTok" },
              { value: "pinterest", label: "Pinterest" },
              { value: "whatsapp", label: "WhatsApp" },
            ],
          },
          { key: "url", label: "URL", kind: "link" },
        ],
      },
      { key: "size", label: "Icon size (px)", kind: "number", min: 12, max: 48 },
      {
        key: "variant",
        label: "Style",
        kind: "select",
        options: [
          { value: "plain", label: "Plain" },
          { value: "filled", label: "Filled" },
          { value: "outline", label: "Outline" },
        ],
      },
    ],
  }),

  // ---------------- CMS ----------------
  def({
    type: "CollectionList",
    label: "Collection list",
    category: "cms",
    icon: "Database",
    description: "Renders items from a CMS collection — blogs, doctors, services, products.",
    isContainer: false,
    schema: z.object({
      collectionId: z.string().max(40).optional(),
      layout: z.enum(["grid", "list", "carousel"]).default("grid"),
      columns: z.number().int().min(1).max(4).default(3),
      limit: z.number().int().min(1).max(48).default(6),
      sortBy: z.enum(["publishedAt", "title", "createdAt"]).default("publishedAt"),
      sortDir: z.enum(["asc", "desc"]).default("desc"),
      showImage: z.boolean().default(true),
      showExcerpt: z.boolean().default(true),
      showDate: z.boolean().default(false),
      linkToDetail: z.boolean().default(true),
      emptyMessage: z.string().max(200).default("Nothing here yet."),
    }),
    defaultProps: {
      layout: "grid",
      columns: 3,
      limit: 6,
      sortBy: "publishedAt",
      sortDir: "desc",
      showImage: true,
      showExcerpt: true,
      showDate: false,
      linkToDetail: true,
      emptyMessage: "Nothing here yet.",
    },
    propFields: [
      { key: "collectionId", label: "Collection", kind: "collection" },
      {
        key: "layout",
        label: "Layout",
        kind: "select",
        options: [
          { value: "grid", label: "Grid" },
          { value: "list", label: "List" },
          { value: "carousel", label: "Carousel" },
        ],
      },
      { key: "columns", label: "Columns", kind: "number", min: 1, max: 4 },
      { key: "limit", label: "Items shown", kind: "number", min: 1, max: 48 },
      {
        key: "sortBy",
        label: "Sort by",
        kind: "select",
        options: [
          { value: "publishedAt", label: "Published date" },
          { value: "title", label: "Title" },
          { value: "createdAt", label: "Created date" },
        ],
      },
      {
        key: "sortDir",
        label: "Direction",
        kind: "select",
        options: [
          { value: "desc", label: "Newest first" },
          { value: "asc", label: "Oldest first" },
        ],
      },
      { key: "showImage", label: "Show image", kind: "boolean" },
      { key: "showExcerpt", label: "Show excerpt", kind: "boolean" },
      { key: "showDate", label: "Show date", kind: "boolean" },
      { key: "linkToDetail", label: "Link to detail page", kind: "boolean" },
      { key: "emptyMessage", label: "Empty message", kind: "text" },
    ],
    contentProps: ["emptyMessage"],
  }),

  // ---------------- Advanced ----------------
  def({
    type: "HtmlEmbed",
    label: "Custom HTML",
    category: "advanced",
    icon: "Code",
    description: "Raw HTML block. Sanitized before render.",
    isContainer: false,
    schema: z.object({ html: z.string().max(50_000).default("") }),
    defaultProps: { html: "" },
    propFields: [
      {
        key: "html",
        label: "HTML",
        kind: "textarea",
        help: "Scripts and event handlers are stripped for security.",
      },
    ],
  }),

  def({
    type: "EmbeddedPage",
    label: "Pasted landing page",
    category: "advanced",
    icon: "FileCode",
    description:
      "A complete landing page pasted as HTML/CSS/JS, rendered in an isolated, sandboxed frame.",
    isContainer: false,
    // Unlike HtmlEmbed (which strips styles/scripts and injects markup inline),
    // this renders the pasted code inside a sandboxed iframe. That preserves a
    // full landing page's styling and behaviour while keeping its scripts
    // walled off from the rest of the site — no access to cookies, storage, or
    // the parent DOM. The larger cap reflects that a whole page, not a block,
    // is expected here.
    schema: z.object({
      html: z.string().max(300_000).default(""),
      title: z.string().max(200).default("Embedded page"),
      minHeight: z.coerce.number().int().min(100).max(20_000).default(600),
    }),
    defaultProps: { html: "", title: "Embedded page", minHeight: 600 },
    propFields: [
      {
        key: "html",
        label: "Landing page code",
        kind: "textarea",
        placeholder: "Paste your full HTML here…",
        help: "Paste a complete landing page. Its CSS and JavaScript run inside a secure sandbox, isolated from the rest of your site.",
      },
      {
        key: "minHeight",
        label: "Minimum height (px)",
        kind: "number",
        min: 100,
        max: 20_000,
        help: "The frame grows to fit its content; this is the smallest it can be.",
      },
      { key: "title", label: "Accessible title", kind: "text" },
    ],
  }),
];

// =====================================================================
// Lookup helpers
// =====================================================================

export const COMPONENT_MAP: Record<string, ComponentDefinition> =
  Object.fromEntries(COMPONENTS.map((c) => [c.type, c]));

export const COMPONENT_TYPES: string[] = COMPONENTS.map((c) => c.type);

export function getDefinition(type: string): ComponentDefinition | undefined {
  return COMPONENT_MAP[type];
}

export function isContainerType(type: string): boolean {
  return COMPONENT_MAP[type]?.isContainer ?? false;
}

/**
 * Can `childType` be dropped into `parentType`?
 *
 * Enforced in both directions because the two constraints answer
 * different questions: `allowedChildren` stops a Navbar being dropped
 * inside a Grid cell, `allowedParents` stops a Section being nested
 * inside another Section.
 */
export function canDrop(parentType: string, childType: string): boolean {
  const parent = COMPONENT_MAP[parentType];
  const child = COMPONENT_MAP[childType];
  if (!parent || !child || !parent.isContainer) return false;
  if (parent.allowedChildren?.length && !parent.allowedChildren.includes(childType)) {
    return false;
  }
  if (child.allowedParents?.length && !child.allowedParents.includes(parentType)) {
    return false;
  }
  return true;
}

/** Palette entries, grouped for the sidebar. */
export function paletteByCategory(): Array<{
  category: ComponentCategory;
  label: string;
  items: ComponentDefinition[];
}> {
  const labels: Record<ComponentCategory, string> = {
    layout: "Layout",
    typography: "Text",
    media: "Media",
    interactive: "Interactive",
    business: "Business",
    cms: "CMS",
    advanced: "Advanced",
  };
  const order: ComponentCategory[] = [
    "layout",
    "typography",
    "media",
    "interactive",
    "business",
    "cms",
    "advanced",
  ];
  return order
    .map((category) => ({
      category,
      label: labels[category],
      items: COMPONENTS.filter((c) => c.category === category && !c.hiddenInPalette),
    }))
    .filter((g) => g.items.length > 0);
}

/**
 * Validate + fill a node's props against its definition.
 *
 * Unknown types and invalid props are the two ways a bad AI response or a
 * stale client could corrupt a document. Returning defaults instead of
 * throwing means one malformed node degrades to a default-rendered node
 * rather than failing the whole save.
 */
export function coerceProps(
  type: string,
  props: unknown,
): { props: Record<string, unknown>; valid: boolean } {
  const definition = COMPONENT_MAP[type];
  if (!definition) return { props: (props as Record<string, unknown>) ?? {}, valid: false };

  const parsed = definition.schema.safeParse(props ?? {});
  if (parsed.success) {
    return { props: parsed.data as Record<string, unknown>, valid: true };
  }
  return {
    props: { ...definition.defaultProps, ...((props as Record<string, unknown>) ?? {}) },
    valid: false,
  };
}
