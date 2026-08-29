/**
 * Section presets.
 *
 * A preset expands into a subtree of ordinary primitive nodes — not a
 * special "Hero" component. That distinction is the whole design:
 *
 *   - The user can delete the subheading, restyle one button, or drag an
 *     image out of a hero, because it is just Boxes and Headings. A
 *     monolithic <Hero> component with 30 props can only be configured,
 *     never genuinely edited, which is the ceiling most page builders hit.
 *   - The AI generates a *list of section keys plus content*, and this
 *     module deterministically expands them into good layouts. The model
 *     never emits raw node trees, so it cannot produce broken markup,
 *     unbalanced grids, or invalid props.
 *   - Adding a new section type is data, not code: no renderer changes.
 *
 * Every node gets `presetKey` so the editor can offer "reset this section"
 * and the AI can locate "the hero" without guessing.
 */

import { createNode, createNodeId } from "@/site/document/operations";
import type {
  NodeId,
  SiteNode,
  SpacingToken,
  StyleProps,
} from "@/site/document/types";

export interface Subtree {
  nodes: Record<NodeId, SiteNode>;
  rootId: NodeId;
}

/**
 * Terse node builder. Assigns ids, wires parent/child links, and collects
 * everything into a flat map — so presets read like markup while producing
 * the normalized shape the document model needs.
 */
class Builder {
  readonly nodes: Record<NodeId, SiteNode> = {};
  constructor(private readonly presetKey: string) {}

  add(
    type: string,
    init: {
      props?: Record<string, unknown>;
      style?: StyleProps;
      responsive?: SiteNode["responsive"];
      hover?: SiteNode["hover"];
      name?: string;
      animation?: SiteNode["animation"];
      action?: SiteNode["action"];
      hiddenOn?: SiteNode["hiddenOn"];
      children?: NodeId[];
    } = {},
  ): NodeId {
    const id = createNodeId();
    this.nodes[id] = createNode(
      type,
      { ...init, presetKey: this.presetKey, children: init.children ?? [] },
      id,
    );
    for (const childId of init.children ?? []) {
      if (this.nodes[childId]) this.nodes[childId].parent = id;
    }
    return id;
  }

  done(rootId: NodeId): Subtree {
    return { nodes: this.nodes, rootId };
  }
}

// =====================================================================
// Shared style fragments
// =====================================================================

const sectionPadding = (size: "sm" | "md" | "lg" = "lg"): StyleProps => {
  const map: Record<string, SpacingToken> = { sm: "xl", md: "2xl", lg: "3xl" };
  return { paddingTop: map[size], paddingBottom: map[size] };
};

const stack = (gap: SpacingToken = "md", align?: StyleProps["alignItems"]): StyleProps => ({
  display: "flex",
  flexDirection: "column",
  gap,
  ...(align ? { alignItems: align } : {}),
});

const row = (gap: SpacingToken = "md"): StyleProps => ({
  display: "flex",
  flexDirection: "row",
  alignItems: "center",
  gap,
  flexWrap: "wrap",
});

const cardStyle = (): StyleProps => ({
  backgroundColor: { token: "card" },
  borderRadius: "lg",
  paddingTop: "lg",
  paddingRight: "lg",
  paddingBottom: "lg",
  paddingLeft: "lg",
  borderWidth: 1,
  borderColor: { token: "border" },
  boxShadow: "sm",
  display: "flex",
  flexDirection: "column",
  gap: "sm",
});

const eyebrow = (): StyleProps => ({
  fontSize: "sm",
  fontWeight: "semibold",
  textTransform: "uppercase",
  letterSpacing: "wider",
  color: { token: "primary" },
});

const mutedText = (): StyleProps => ({
  fontSize: "lg",
  color: { token: "mutedForeground" },
  lineHeight: "relaxed",
  maxWidth: "65ch",
});

// =====================================================================
// Preset input
// =====================================================================

/**
 * Content the AI (or a template) supplies. Everything is optional and has
 * a sensible default, so a preset always renders something presentable
 * even from an empty object.
 */
export interface PresetInput {
  businessName?: string;
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  body?: string;
  imageUrl?: string;
  imageUrls?: string[];
  ctaLabel?: string;
  ctaHref?: string;
  secondaryCtaLabel?: string;
  secondaryCtaHref?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  locationId?: string;
  /** Generic card/list items used by services, team, pricing, etc. */
  items?: Array<{
    title?: string;
    description?: string;
    icon?: string;
    imageUrl?: string;
    price?: string;
    priceSuffix?: string;
    role?: string;
    features?: string[];
    highlighted?: boolean;
    quote?: string;
    author?: string;
    rating?: number;
    value?: string;
    /** Trailing unit on a stat, e.g. "+" or "%". Empty by default. */
    suffix?: string;
    label?: string;
    question?: string;
    answer?: string;
  }>;
  variant?: string;
}

export type PresetBuilder = (input: PresetInput) => Subtree;

export interface SectionPreset {
  key: string;
  label: string;
  group: "header" | "hero" | "content" | "social" | "conversion" | "footer";
  description: string;
  icon: string;
  build: PresetBuilder;
}

// =====================================================================
// Presets
// =====================================================================

const navbar: PresetBuilder = (input) => {
  const b = new Builder("navbar");
  const nav = b.add("Navbar", {
    name: "Navbar",
    props: {
      logoText: input.businessName ?? "Your Business",
      links: [],
      ctaLabel: input.ctaLabel ?? "Book now",
      ctaHref: input.ctaHref ?? "#contact",
      sticky: true,
      align: "right",
    },
  });
  const section = b.add("Section", {
    name: "Header",
    props: { as: "header", contained: false },
    children: [nav],
  });
  return b.done(section);
};

const heroSplit: PresetBuilder = (input) => {
  const b = new Builder("hero");
  const kids: NodeId[] = [];

  if (input.eyebrow) {
    kids.push(b.add("Text", { props: { text: input.eyebrow }, style: eyebrow() }));
  }
  kids.push(
    b.add("Heading", {
      props: { text: input.title ?? `Welcome to ${input.businessName ?? "our business"}`, level: "h1" },
      style: { fontSize: "5xl", lineHeight: "tight" },
      responsive: { mobile: { fontSize: "3xl" } },
      animation: { kind: "fade-up", duration: 700 },
    }),
  );
  kids.push(
    b.add("Text", {
      props: {
        text:
          input.subtitle ??
          "Trusted, professional service from a team that treats you like a neighbour.",
      },
      style: mutedText(),
      animation: { kind: "fade-up", duration: 700, delay: 120 },
    }),
  );

  const buttons: NodeId[] = [
    b.add("Button", {
      props: { label: input.ctaLabel ?? "Book an appointment", variant: "primary", size: "lg" },
      action: { kind: "url", href: input.ctaHref ?? "#contact" },
    }),
  ];
  if (input.secondaryCtaLabel !== null) {
    buttons.push(
      b.add("Button", {
        props: {
          label: input.secondaryCtaLabel ?? "Call us",
          variant: "outline",
          size: "lg",
        },
        action: input.phone
          ? { kind: "tel", phone: input.phone }
          : { kind: "url", href: input.secondaryCtaHref ?? "#contact" },
      }),
    );
  }
  kids.push(
    b.add("Box", {
      name: "Actions",
      style: { ...row("sm"), marginTop: "sm" },
      children: buttons,
      animation: { kind: "fade-up", duration: 700, delay: 240 },
    }),
  );

  const copy = b.add("Box", {
    name: "Hero copy",
    style: { ...stack("md"), justifyContent: "center" },
    children: kids,
  });

  const media = b.add("Image", {
    name: "Hero image",
    props: {
      src: input.imageUrl ?? "",
      alt: input.title ?? `${input.businessName ?? "Business"} hero image`,
      aspectRatio: "4/3",
      objectFit: "cover",
      priority: true,
    },
    style: { borderRadius: "xl", boxShadow: "lg", width: "100%" },
    animation: { kind: "zoom-in", duration: 800, delay: 160 },
  });

  const grid = b.add("Grid", {
    name: "Hero layout",
    props: { columns: 2, tabletColumns: 1, mobileColumns: 1 },
    style: { gap: "2xl", alignItems: "center" },
    children: [copy, media],
  });

  const section = b.add("Section", {
    name: "Hero",
    props: { as: "section", contained: true, anchorId: "home" },
    style: { ...sectionPadding("lg"), backgroundColor: { token: "background" } },
    children: [grid],
  });
  return b.done(section);
};

const heroCentered: PresetBuilder = (input) => {
  const b = new Builder("hero");
  const kids: NodeId[] = [];

  if (input.eyebrow) {
    kids.push(b.add("Badge", { props: { text: input.eyebrow } }));
  }
  kids.push(
    b.add("Heading", {
      props: { text: input.title ?? input.businessName ?? "Welcome", level: "h1" },
      style: { fontSize: "6xl", textAlign: "center", lineHeight: "tight", color: { value: "#FFFFFF" } },
      responsive: { mobile: { fontSize: "3xl" } },
      animation: { kind: "fade-up", duration: 700 },
    }),
  );
  kids.push(
    b.add("Text", {
      props: { text: input.subtitle ?? "Quality you can feel, service you can trust." },
      style: {
        ...mutedText(),
        textAlign: "center",
        color: { value: "rgba(255,255,255,0.88)" },
        maxWidth: "62ch",
        marginLeft: "auto",
        marginRight: "auto",
      },
      animation: { kind: "fade-up", duration: 700, delay: 120 },
    }),
  );
  kids.push(
    b.add("Box", {
      name: "Actions",
      style: { ...row("sm"), justifyContent: "center", marginTop: "sm" },
      children: [
        b.add("Button", {
          props: { label: input.ctaLabel ?? "Get started", variant: "primary", size: "lg" },
          action: { kind: "url", href: input.ctaHref ?? "#contact" },
        }),
        b.add("Button", {
          props: { label: input.secondaryCtaLabel ?? "Learn more", variant: "outline", size: "lg" },
          action: { kind: "url", href: input.secondaryCtaHref ?? "#about" },
        }),
      ],
      animation: { kind: "fade-up", duration: 700, delay: 220 },
    }),
  );

  const inner = b.add("Box", {
    name: "Hero copy",
    // `marginInline: auto` is what actually centers a width-capped block. This
    // said `marginLeft: "none"` before, which compiles to `margin-left: 0`, so
    // the 820px copy block sat hard against the left edge of a 1200px container
    // while its text was centre-aligned — the hero looked broken with a wide
    // empty gap on the right.
    style: {
      ...stack("md", "center"),
      maxWidth: "820px",
      marginLeft: "auto",
      marginRight: "auto",
    },
    children: kids,
  });

  const section = b.add("Section", {
    name: "Hero",
    props: { as: "section", contained: true, anchorId: "home" },
    style: {
      paddingTop: "4xl",
      paddingBottom: "4xl",
      backgroundColor: { token: "secondary" },
      // The overlay keeps the white heading legible over any photo, which
      // matters because the image is user-supplied and unknown at build.
      backgroundImage: input.imageUrl ?? "",
      backgroundOverlay: 0.55,
      backgroundSize: "cover",
      display: "flex",
      justifyContent: "center",
    },
    children: [inner],
  });
  return b.done(section);
};

/**
 * Compact page header for inner (non-home) pages.
 *
 * Inner pages used to open straight into a services grid or a team row, which
 * left them with no H1, no title container, and no call to action on the
 * first screen — the audit flagged every one of them. This gives an inner
 * page a proper heading band: an H1 with the page's title, a one-line intro,
 * and a CTA that sits above the fold. It is deliberately image-free so it
 * reads as a page title, not a second hero competing with the home page.
 */
const pageHeader: PresetBuilder = (input) => {
  const b = new Builder("page-header");
  const kids: NodeId[] = [];

  if (input.eyebrow) {
    kids.push(
      b.add("Text", {
        props: { text: input.eyebrow },
        style: { ...eyebrow(), textAlign: "center" },
      }),
    );
  }
  kids.push(
    b.add("Heading", {
      props: { text: input.title ?? input.businessName ?? "Page", level: "h1" },
      style: { fontSize: "5xl", textAlign: "center", lineHeight: "tight" },
      responsive: { mobile: { fontSize: "3xl" } },
      animation: { kind: "fade-up", duration: 600 },
    }),
  );
  if (input.subtitle) {
    kids.push(
      b.add("Text", {
        props: { text: input.subtitle },
        style: { ...mutedText(), textAlign: "center", maxWidth: "62ch" },
        animation: { kind: "fade-up", duration: 600, delay: 100 },
      }),
    );
  }

  // A CTA in the header keeps an actionable button above the fold on inner
  // pages, where the primary conversion section (contact/appointment) is
  // otherwise several screens down.
  const buttons: NodeId[] = [
    b.add("Button", {
      props: { label: input.ctaLabel ?? "Book an appointment", variant: "primary", size: "lg" },
      action: { kind: "url", href: input.ctaHref ?? "#contact" },
    }),
  ];
  if (input.phone) {
    buttons.push(
      b.add("Button", {
        props: { label: input.secondaryCtaLabel ?? "Call us", variant: "outline", size: "lg" },
        action: { kind: "tel", phone: input.phone },
      }),
    );
  }
  kids.push(
    b.add("Box", {
      name: "Actions",
      style: { ...row("sm"), justifyContent: "center", marginTop: "sm" },
      children: buttons,
      animation: { kind: "fade-up", duration: 600, delay: 200 },
    }),
  );

  const inner = b.add("Box", {
    name: "Page header copy",
    style: {
      ...stack("md", "center"),
      textAlign: "center",
      maxWidth: "820px",
      marginLeft: "auto",
      marginRight: "auto",
    },
    children: kids,
  });

  const section = b.add("Section", {
    name: "Page header",
    props: { as: "section", contained: true, anchorId: "top" },
    style: {
      paddingTop: "3xl",
      paddingBottom: "3xl",
      backgroundColor: { token: "muted" },
      display: "flex",
      justifyContent: "center",
    },
    children: [inner],
  });
  return b.done(section);
};

const about: PresetBuilder = (input) => {
  const b = new Builder("about");
  const copy = b.add("Box", {
    name: "About copy",
    style: stack("md"),
    children: [
      b.add("Text", { props: { text: input.eyebrow ?? "About us" }, style: eyebrow() }),
      b.add("Heading", {
        props: { text: input.title ?? `Why choose ${input.businessName ?? "us"}`, level: "h2" },
        style: { fontSize: "4xl", lineHeight: "tight" },
        responsive: { mobile: { fontSize: "2xl" } },
      }),
      b.add("Text", {
        props: {
          text:
            input.body ??
            "We have spent years building a reputation on careful work and honest advice. Every customer is looked after by people who genuinely care about getting it right.",
        },
        style: mutedText(),
      }),
      ...(input.items?.length
        ? [
            b.add("Box", {
              name: "Highlights",
              style: stack("sm"),
              children: input.items.slice(0, 4).map((item) =>
                b.add("Box", {
                  style: { ...row("sm"), alignItems: "flex-start" },
                  children: [
                    b.add("Icon", {
                      props: { name: item.icon ?? "Check", size: 20 },
                      style: { color: { token: "primary" } },
                    }),
                    b.add("Text", {
                      props: { text: item.title ?? item.description ?? "" },
                      style: { fontSize: "base" },
                    }),
                  ],
                }),
              ),
            }),
          ]
        : []),
    ],
  });

  const media = b.add("Image", {
    name: "About image",
    props: {
      src: input.imageUrl ?? "",
      alt: `About ${input.businessName ?? "our business"}`,
      aspectRatio: "3/2",
      objectFit: "cover",
    },
    style: { borderRadius: "lg", boxShadow: "md" },
    animation: { kind: "fade-up", duration: 600 },
  });

  const grid = b.add("Grid", {
    props: { columns: 2, tabletColumns: 1, mobileColumns: 1 },
    style: { gap: "2xl", alignItems: "center" },
    children: [media, copy],
  });

  const section = b.add("Section", {
    name: "About",
    props: { as: "section", contained: true, anchorId: "about" },
    style: sectionPadding("lg"),
    children: [grid],
  });
  return b.done(section);
};

/** Shared header used by most content sections. */
function sectionHeader(
  b: Builder,
  input: PresetInput,
  fallbackTitle: string,
  fallbackSubtitle?: string,
): NodeId {
  const kids: NodeId[] = [];
  if (input.eyebrow) {
    kids.push(
      b.add("Text", {
        props: { text: input.eyebrow },
        style: { ...eyebrow(), textAlign: "center" },
      }),
    );
  }
  kids.push(
    b.add("Heading", {
      props: { text: input.title ?? fallbackTitle, level: "h2" },
      style: { fontSize: "4xl", textAlign: "center", lineHeight: "tight" },
      responsive: { mobile: { fontSize: "2xl" } },
    }),
  );
  const sub = input.subtitle ?? fallbackSubtitle;
  if (sub) {
    kids.push(
      b.add("Text", {
        props: { text: sub },
        style: { ...mutedText(), textAlign: "center", maxWidth: "62ch" },
      }),
    );
  }
  return b.add("Box", {
    name: "Section header",
    style: { ...stack("sm", "center"), marginBottom: "xl" },
    children: kids,
    animation: { kind: "fade-up", duration: 600 },
  });
}

const services: PresetBuilder = (input) => {
  const b = new Builder("services");
  const items =
    input.items?.length
      ? input.items
      : [
          { title: "Service one", description: "A short description of what this includes.", icon: "Sparkles" },
          { title: "Service two", description: "A short description of what this includes.", icon: "ShieldCheck" },
          { title: "Service three", description: "A short description of what this includes.", icon: "HeartHandshake" },
        ];

  const cards = items.slice(0, 12).map((item, i) =>
    b.add("Box", {
      name: item.title ?? `Service ${i + 1}`,
      style: cardStyle(),
      hover: { boxShadow: "lg", borderColor: { token: "primary" } },
      animation: { kind: "fade-up", duration: 500, delay: i * 80 },
      children: [
        b.add("Icon", {
          props: { name: item.icon ?? "Sparkles", size: 28 },
          style: { color: { token: "primary" }, marginBottom: "xs" },
        }),
        b.add("Heading", {
          props: { text: item.title ?? "Service", level: "h3" },
          style: { fontSize: "xl" },
        }),
        b.add("Text", {
          props: { text: item.description ?? "" },
          style: { color: { token: "mutedForeground" }, lineHeight: "relaxed" },
        }),
      ],
    }),
  );

  const header = sectionHeader(
    b,
    input,
    "What we offer",
    "Everything we do, explained simply.",
  );
  const grid = b.add("Grid", {
    name: "Services grid",
    props: { columns: 3, tabletColumns: 2, mobileColumns: 1 },
    style: { gap: "lg" },
    children: cards,
  });

  const section = b.add("Section", {
    name: "Services",
    props: { as: "section", contained: true, anchorId: "services" },
    style: { ...sectionPadding("lg"), backgroundColor: { token: "muted" } },
    children: [header, grid],
  });
  return b.done(section);
};

const team: PresetBuilder = (input) => {
  const b = new Builder("team");
  const items =
    input.items?.length
      ? input.items
      : [
          { title: "Team member", role: "Role", description: "" },
          { title: "Team member", role: "Role", description: "" },
          { title: "Team member", role: "Role", description: "" },
        ];

  const cards = items.slice(0, 12).map((item, i) =>
    b.add("Box", {
      name: item.title ?? `Member ${i + 1}`,
      style: { ...stack("sm", "center"), textAlign: "center" },
      animation: { kind: "fade-up", duration: 500, delay: i * 80 },
      children: [
        b.add("Image", {
          props: {
            src: item.imageUrl ?? "",
            alt: item.title ?? "Team member",
            aspectRatio: "1/1",
            objectFit: "cover",
          },
          style: { borderRadius: "full", width: "160px", boxShadow: "md" },
        }),
        b.add("Heading", {
          props: { text: item.title ?? "Name", level: "h3" },
          style: { fontSize: "lg" },
        }),
        b.add("Text", {
          props: { text: item.role ?? "" },
          style: { fontSize: "sm", color: { token: "primary" }, fontWeight: "semibold" },
        }),
        ...(item.description
          ? [
              b.add("Text", {
                props: { text: item.description },
                style: { fontSize: "sm", color: { token: "mutedForeground" } },
              }),
            ]
          : []),
      ],
    }),
  );

  const header = sectionHeader(b, input, "Meet the team", "The people who look after you.");
  const grid = b.add("Grid", {
    props: { columns: 4, tabletColumns: 2, mobileColumns: 2 },
    style: { gap: "lg" },
    children: cards,
  });
  const section = b.add("Section", {
    name: "Team",
    props: { as: "section", contained: true, anchorId: "team" },
    style: sectionPadding("lg"),
    children: [header, grid],
  });
  return b.done(section);
};

const gallery: PresetBuilder = (input) => {
  const b = new Builder("gallery");
  const urls = input.imageUrls?.length ? input.imageUrls : ["", "", "", "", "", ""];
  const header = sectionHeader(b, input, "Gallery", "A look at our work and our space.");
  const carousel = b.add("Carousel", {
    name: "Gallery carousel",
    props: {
      slides: urls.slice(0, 20).map((url, i) => ({
        imageUrl: url,
        alt: `${input.businessName ?? "Gallery"} photo ${i + 1}`,
      })),
      slidesPerView: 3,
      showArrows: true,
      showDots: true,
      autoplay: false,
    },
  });
  const section = b.add("Section", {
    name: "Gallery",
    props: { as: "section", contained: true, anchorId: "gallery" },
    style: { ...sectionPadding("lg"), backgroundColor: { token: "muted" } },
    children: [header, carousel],
  });
  return b.done(section);
};

const testimonials: PresetBuilder = (input) => {
  const b = new Builder("testimonials");
  const items =
    input.items?.length
      ? input.items
      : [
          { quote: "Genuinely excellent from start to finish.", author: "Happy customer", rating: 5 },
          { quote: "Professional, friendly, and fairly priced.", author: "Happy customer", rating: 5 },
          { quote: "I would not go anywhere else now.", author: "Happy customer", rating: 5 },
        ];

  const cards = items.slice(0, 9).map((item, i) =>
    b.add("Box", {
      name: `Testimonial ${i + 1}`,
      style: cardStyle(),
      animation: { kind: "fade-up", duration: 500, delay: i * 80 },
      children: [
        b.add("Rating", { props: { value: item.rating ?? 5, size: 16 } }),
        b.add("Text", {
          props: { text: item.quote ?? "" },
          style: { fontSize: "lg", lineHeight: "relaxed" },
        }),
        b.add("Text", {
          props: { text: item.author ?? "" },
          style: { fontSize: "sm", fontWeight: "semibold", color: { token: "mutedForeground" } },
        }),
      ],
    }),
  );

  const header = sectionHeader(b, input, "What our customers say");
  const grid = b.add("Grid", {
    props: { columns: 3, tabletColumns: 2, mobileColumns: 1 },
    style: { gap: "lg" },
    children: cards,
  });
  const section = b.add("Section", {
    name: "Testimonials",
    props: { as: "section", contained: true, anchorId: "testimonials" },
    style: sectionPadding("lg"),
    children: [header, grid],
  });
  return b.done(section);
};

const googleReviews: PresetBuilder = (input) => {
  const b = new Builder("reviews");
  const header = sectionHeader(
    b,
    input,
    "Reviews from Google",
    "Real, verified reviews from our customers.",
  );
  const widget = b.add("GoogleReviews", {
    name: "Google reviews",
    props: {
      ...(input.locationId ? { locationId: input.locationId } : {}),
      layout: "grid",
      limit: 6,
      minRating: 4,
      showRatingSummary: true,
      showWriteReviewCta: true,
    },
  });
  const section = b.add("Section", {
    name: "Google reviews",
    props: { as: "section", contained: true, anchorId: "reviews" },
    style: { ...sectionPadding("lg"), backgroundColor: { token: "muted" } },
    children: [header, widget],
  });
  return b.done(section);
};

const stats: PresetBuilder = (input) => {
  const b = new Builder("stats");
  const items =
    input.items?.length
      ? input.items
      : [
          { value: "12", label: "Years in business" },
          { value: "4.9", label: "Average rating" },
          { value: "2500", label: "Customers served" },
          { value: "24", label: "Hour response" },
        ];

  const cells = items.slice(0, 6).map((item, i) =>
    b.add("StatCounter", {
      name: item.label ?? `Stat ${i + 1}`,
      props: {
        value: item.value ?? "0",
        // Was hardcoded to "+", which turned a 4.8 rating into "4.8+" and a
        // 24-hour response time into "24+" — nonsense on the two stats most
        // templates carry. A "+" only reads correctly on a round count, so the
        // caller decides and the default is none.
        suffix: item.suffix ?? "",
        label: item.label ?? "",
        animate: true,
      },
      style: { textAlign: "center" },
    }),
  );

  const grid = b.add("Grid", {
    props: { columns: Math.min(cells.length, 4), tabletColumns: 2, mobileColumns: 2 },
    style: { gap: "lg" },
    children: cells,
  });
  const section = b.add("Section", {
    name: "Stats",
    props: { as: "section", contained: true },
    style: {
      ...sectionPadding("md"),
      backgroundColor: { token: "primary" },
      color: { token: "primaryForeground" },
    },
    children: [grid],
  });
  return b.done(section);
};

const pricing: PresetBuilder = (input) => {
  const b = new Builder("pricing");
  const items =
    input.items?.length
      ? input.items
      : [
          { title: "Basic", price: "49", features: ["Feature one", "Feature two"] },
          { title: "Standard", price: "99", features: ["Everything in Basic", "Feature three"], highlighted: true },
          { title: "Premium", price: "199", features: ["Everything in Standard", "Feature four"] },
        ];

  const cards = items.slice(0, 4).map((item, i) => {
    const featureNodes = (item.features ?? []).slice(0, 10).map((f) =>
      b.add("Box", {
        style: { ...row("xs"), alignItems: "flex-start" },
        children: [
          b.add("Icon", {
            props: { name: "Check", size: 18 },
            style: { color: { token: "primary" } },
          }),
          b.add("Text", { props: { text: f }, style: { fontSize: "sm" } }),
        ],
      }),
    );

    return b.add("Box", {
      name: item.title ?? `Plan ${i + 1}`,
      style: {
        ...cardStyle(),
        ...(item.highlighted
          ? { borderColor: { token: "primary" }, borderWidth: 2, boxShadow: "lg" }
          : {}),
      },
      animation: { kind: "fade-up", duration: 500, delay: i * 80 },
      children: [
        ...(item.highlighted ? [b.add("Badge", { props: { text: "Most popular" } })] : []),
        b.add("Heading", { props: { text: item.title ?? "Plan", level: "h3" }, style: { fontSize: "xl" } }),
        b.add("Box", {
          style: { ...row("xs"), alignItems: "baseline" },
          children: [
            b.add("Text", {
              props: { text: item.price ?? "0" },
              style: { fontSize: "4xl", fontWeight: "bold" },
            }),
            b.add("Text", {
              props: { text: item.priceSuffix ?? "/month" },
              style: { fontSize: "sm", color: { token: "mutedForeground" } },
            }),
          ],
        }),
        b.add("Divider", { props: { thickness: 1 }, style: { marginTop: "xs", marginBottom: "xs" } }),
        b.add("Box", { style: stack("xs"), children: featureNodes }),
        b.add("Button", {
          props: {
            label: input.ctaLabel ?? "Choose plan",
            variant: item.highlighted ? "primary" : "outline",
            fullWidth: true,
          },
          style: { marginTop: "sm" },
          action: { kind: "url", href: input.ctaHref ?? "#contact" },
        }),
      ],
    });
  });

  const header = sectionHeader(b, input, "Simple, honest pricing");
  const grid = b.add("Grid", {
    props: { columns: Math.min(cards.length, 3), tabletColumns: 2, mobileColumns: 1 },
    style: { gap: "lg", alignItems: "stretch" },
    children: cards,
  });
  const section = b.add("Section", {
    name: "Pricing",
    props: { as: "section", contained: true, anchorId: "pricing" },
    style: sectionPadding("lg"),
    children: [header, grid],
  });
  return b.done(section);
};

const faq: PresetBuilder = (input) => {
  const b = new Builder("faq");
  const items = (input.items?.length
    ? input.items
    : [
        { question: "What are your opening hours?", answer: "Our current hours are listed at the bottom of this page." },
        { question: "Do I need an appointment?", answer: "Appointments are recommended, but walk-ins are welcome when we have space." },
        { question: "How do I get in touch?", answer: "Call us, message us on WhatsApp, or use the contact form on this page." },
      ]
  ).map((i) => ({ question: i.question ?? i.title ?? "", answer: i.answer ?? i.description ?? "" }));

  const header = sectionHeader(b, input, "Frequently asked questions");
  const accordion = b.add("Accordion", {
    name: "FAQ",
    props: { items: items.slice(0, 30), allowMultiple: false, defaultOpenIndex: 0 },
    // Centred under the centred section header; `marginLeft: "none"` left it
    // hanging off to one side.
    style: { maxWidth: "820px", marginLeft: "auto", marginRight: "auto" },
  });
  const section = b.add("Section", {
    name: "FAQ",
    props: { as: "section", contained: true, anchorId: "faq" },
    style: { ...sectionPadding("lg"), backgroundColor: { token: "muted" } },
    children: [header, accordion],
  });
  return b.done(section);
};

const cta: PresetBuilder = (input) => {
  const b = new Builder("cta");
  const inner = b.add("Box", {
    style: { ...stack("md", "center"), textAlign: "center" },
    children: [
      b.add("Heading", {
        props: { text: input.title ?? "Ready to get started?", level: "h2" },
        style: { fontSize: "4xl", color: { token: "primaryForeground" }, lineHeight: "tight" },
        responsive: { mobile: { fontSize: "2xl" } },
      }),
      b.add("Text", {
        props: { text: input.subtitle ?? "Book in a few seconds. We will confirm right away." },
        style: {
          fontSize: "lg",
          color: { value: "rgba(255,255,255,0.9)" },
          maxWidth: "60ch",
        },
      }),
      b.add("Box", {
        style: { ...row("sm"), justifyContent: "center" },
        children: [
          b.add("Button", {
            props: { label: input.ctaLabel ?? "Book now", variant: "accent", size: "lg" },
            action: { kind: "url", href: input.ctaHref ?? "#contact" },
          }),
          ...(input.phone
            ? [
                b.add("Button", {
                  props: { label: `Call ${input.phone}`, variant: "outline", size: "lg" },
                  action: { kind: "tel", phone: input.phone },
                }),
              ]
            : []),
        ],
      }),
    ],
  });
  const section = b.add("Section", {
    name: "Call to action",
    props: { as: "section", contained: true },
    style: {
      ...sectionPadding("md"),
      backgroundColor: { token: "primary" },
      display: "flex",
      justifyContent: "center",
    },
    children: [inner],
  });
  return b.done(section);
};

const contact: PresetBuilder = (input) => {
  const b = new Builder("contact");

  const detail = (icon: string, label: string, value: string, action?: SiteNode["action"]) =>
    b.add("Box", {
      style: { ...row("sm"), alignItems: "flex-start" },
      ...(action ? { action } : {}),
      children: [
        b.add("Icon", {
          props: { name: icon, size: 20 },
          style: { color: { token: "primary" } },
        }),
        b.add("Box", {
          style: stack("none"),
          children: [
            b.add("Text", {
              props: { text: label },
              style: { fontSize: "xs", textTransform: "uppercase", letterSpacing: "wide", color: { token: "mutedForeground" } },
            }),
            b.add("Text", { props: { text: value }, style: { fontSize: "base", fontWeight: "medium" } }),
          ],
        }),
      ],
    });

  const details: NodeId[] = [];
  if (input.phone) details.push(detail("Phone", "Phone", input.phone, { kind: "tel", phone: input.phone }));
  if (input.whatsapp) {
    details.push(
      detail("MessageCircle", "WhatsApp", input.whatsapp, {
        kind: "whatsapp",
        phone: input.whatsapp,
        message: "Hi! I found you online.",
      }),
    );
  }
  if (input.email) details.push(detail("Mail", "Email", input.email, { kind: "mailto", email: input.email }));
  if (input.address) details.push(detail("MapPin", "Address", input.address));

  const left = b.add("Box", {
    name: "Contact details",
    style: stack("lg"),
    children: [
      b.add("Heading", {
        props: { text: input.title ?? "Get in touch", level: "h2" },
        style: { fontSize: "3xl", lineHeight: "tight" },
      }),
      b.add("Text", {
        props: { text: input.subtitle ?? "We usually reply within a few hours." },
        style: mutedText(),
      }),
      b.add("Box", { style: stack("md"), children: details }),
      b.add("OpeningHours", {
        props: {
          ...(input.locationId ? { locationId: input.locationId } : {}),
          showTodayHighlight: true,
          showOpenBadge: true,
        },
        style: { marginTop: "sm" },
      }),
    ],
  });

  const right = b.add("Box", {
    name: "Contact form",
    style: cardStyle(),
    children: [
      b.add("Heading", {
        props: { text: "Send us a message", level: "h3" },
        style: { fontSize: "xl" },
      }),
      b.add("Form", {
        props: { submitLabel: input.ctaLabel ?? "Send message", layout: "stacked", showLabels: true },
      }),
    ],
  });

  const grid = b.add("Grid", {
    props: { columns: 2, tabletColumns: 1, mobileColumns: 1 },
    style: { gap: "2xl", alignItems: "flex-start" },
    children: [left, right],
  });

  const section = b.add("Section", {
    name: "Contact",
    props: { as: "section", contained: true, anchorId: "contact" },
    style: sectionPadding("lg"),
    children: [grid],
  });
  return b.done(section);
};

const mapSection: PresetBuilder = (input) => {
  const b = new Builder("map");
  const map = b.add("Map", {
    name: "Map",
    props: {
      ...(input.locationId ? { locationId: input.locationId } : {}),
      ...(input.address ? { address: input.address } : {}),
      zoom: 15,
      height: 420,
      showDirectionsLink: true,
    },
    style: { borderRadius: "lg", overflow: "hidden" },
  });
  const section = b.add("Section", {
    name: "Map",
    props: { as: "section", contained: false },
    children: [map],
  });
  return b.done(section);
};

const appointment: PresetBuilder = (input) => {
  const b = new Builder("appointment");
  const header = sectionHeader(
    b,
    input,
    "Book an appointment",
    "Pick a time that suits you and we will confirm by phone or email.",
  );
  const form = b.add("Form", {
    name: "Appointment form",
    props: { submitLabel: input.ctaLabel ?? "Request appointment", layout: "two-column", showLabels: true },
    style: { ...cardStyle(), maxWidth: "760px", marginLeft: "auto", marginRight: "auto" },
  });
  const section = b.add("Section", {
    name: "Appointment",
    props: { as: "section", contained: true, anchorId: "appointment" },
    style: { ...sectionPadding("lg"), display: "flex", flexDirection: "column", alignItems: "center" },
    children: [header, form],
  });
  return b.done(section);
};

const whatsappFloat: PresetBuilder = (input) => {
  const b = new Builder("whatsapp");
  const button = b.add("WhatsAppButton", {
    name: "WhatsApp button",
    props: {
      phone: input.whatsapp ?? input.phone ?? "",
      message: `Hi ${input.businessName ?? ""}! I found you online and have a question.`.trim(),
      label: "Chat on WhatsApp",
      floating: true,
      position: "bottom-right",
      showLabel: false,
    },
  });
  const section = b.add("Section", {
    name: "WhatsApp",
    props: { as: "div", contained: false },
    children: [button],
  });
  return b.done(section);
};

const blogList: PresetBuilder = (input) => {
  const b = new Builder("blog");
  const header = sectionHeader(b, input, "Latest news", "Tips, updates, and stories from our team.");
  const list = b.add("CollectionList", {
    name: "Blog list",
    props: {
      layout: "grid",
      columns: 3,
      limit: 6,
      sortBy: "publishedAt",
      sortDir: "desc",
      showImage: true,
      showExcerpt: true,
      showDate: true,
      linkToDetail: true,
      emptyMessage: "No posts published yet.",
    },
  });
  const section = b.add("Section", {
    name: "Blog",
    props: { as: "section", contained: true, anchorId: "blog" },
    style: sectionPadding("lg"),
    children: [header, list],
  });
  return b.done(section);
};

const footer: PresetBuilder = (input) => {
  const b = new Builder("footer");
  const widget = b.add("Footer", {
    name: "Footer",
    props: {
      logoText: input.businessName ?? "Your Business",
      tagline: input.subtitle ?? "",
      columns: [],
      showContact: true,
      showSocial: true,
      copyright: `© ${new Date().getFullYear()} ${input.businessName ?? "Your Business"}. All rights reserved.`,
      hidePlatformBranding: false,
    },
  });
  const section = b.add("Section", {
    name: "Footer",
    props: { as: "footer", contained: false },
    style: { backgroundColor: { token: "secondary" }, color: { token: "secondaryForeground" } },
    children: [widget],
  });
  return b.done(section);
};

// =====================================================================
// Registry
// =====================================================================

export const SECTION_PRESETS: SectionPreset[] = [
  { key: "navbar", label: "Navbar", group: "header", icon: "Menu", description: "Header with logo, nav links, and a CTA.", build: navbar },
  { key: "hero-split", label: "Hero — split", group: "hero", icon: "Columns2", description: "Headline and copy beside an image.", build: heroSplit },
  { key: "hero-centered", label: "Hero — centered", group: "hero", icon: "AlignCenter", description: "Big centered headline over a background image.", build: heroCentered },
  { key: "page-header", label: "Page header", group: "hero", icon: "Heading1", description: "Compact page title band with an H1 and a CTA, for inner pages.", build: pageHeader },
  { key: "about", label: "About", group: "content", icon: "Info", description: "Story and highlights beside a photo.", build: about },
  { key: "services", label: "Services", group: "content", icon: "LayoutGrid", description: "Grid of service cards with icons.", build: services },
  { key: "team", label: "Team / Doctors", group: "content", icon: "Users", description: "Portraits, names, and roles.", build: team },
  { key: "gallery", label: "Gallery", group: "content", icon: "Images", description: "Photo carousel.", build: gallery },
  { key: "stats", label: "Stats", group: "social", icon: "TrendingUp", description: "Trust numbers on a colored band.", build: stats },
  { key: "testimonials", label: "Testimonials", group: "social", icon: "Quote", description: "Customer quotes with ratings.", build: testimonials },
  { key: "reviews", label: "Google reviews", group: "social", icon: "Star", description: "Live reviews from Google Business Profile.", build: googleReviews },
  { key: "pricing", label: "Pricing", group: "conversion", icon: "BadgeDollarSign", description: "Comparable plan cards.", build: pricing },
  { key: "faq", label: "FAQ", group: "content", icon: "ChevronsUpDown", description: "Collapsible questions.", build: faq },
  { key: "blog", label: "Blog list", group: "content", icon: "Newspaper", description: "Latest CMS posts.", build: blogList },
  { key: "cta", label: "Call to action", group: "conversion", icon: "Megaphone", description: "Bold conversion band.", build: cta },
  { key: "appointment", label: "Appointment", group: "conversion", icon: "CalendarCheck", description: "Booking request form.", build: appointment },
  { key: "contact", label: "Contact", group: "conversion", icon: "Mail", description: "Contact details, hours, and a form.", build: contact },
  { key: "map", label: "Map", group: "content", icon: "MapPin", description: "Full-width location map.", build: mapSection },
  { key: "whatsapp", label: "WhatsApp button", group: "conversion", icon: "MessageCircle", description: "Floating chat button.", build: whatsappFloat },
  { key: "footer", label: "Footer", group: "footer", icon: "PanelBottom", description: "Footer with links and contact info.", build: footer },
];

export const PRESET_MAP: Record<string, SectionPreset> = Object.fromEntries(
  SECTION_PRESETS.map((p) => [p.key, p]),
);

export const PRESET_KEYS: string[] = SECTION_PRESETS.map((p) => p.key);

/**
 * Build a section, tolerating unknown keys.
 *
 * The AI picks preset keys from a list we give it, but models
 * occasionally invent close variants ("hero", "faqs", "our-services").
 * Falling back through an alias map, then to a generic content section,
 * means an imperfect model response still produces a usable page instead
 * of a hole in the layout.
 */
export function buildSection(key: string, input: PresetInput): Subtree | null {
  const preset = PRESET_MAP[key] ?? PRESET_MAP[resolvePresetAlias(key)];
  if (!preset) return null;
  return preset.build(input);
}

const PRESET_ALIASES: Record<string, string> = {
  hero: "hero-split",
  header: "navbar",
  nav: "navbar",
  navigation: "navbar",
  banner: "hero-centered",
  service: "services",
  offerings: "services",
  doctors: "team",
  staff: "team",
  people: "team",
  photos: "gallery",
  images: "gallery",
  portfolio: "gallery",
  menu: "services",
  rooms: "services",
  classes: "services",
  properties: "services",
  products: "services",
  faqs: "faq",
  questions: "faq",
  reviewsgoogle: "reviews",
  googlereviews: "reviews",
  numbers: "stats",
  statistics: "stats",
  achievements: "stats",
  plans: "pricing",
  packages: "pricing",
  booking: "appointment",
  book: "appointment",
  contactus: "contact",
  location: "map",
  directions: "map",
  news: "blog",
  articles: "blog",
  posts: "blog",
};

export function resolvePresetAlias(key: string): string {
  const k = key.toLowerCase().replace(/[^a-z]/g, "");
  if (PRESET_MAP[k]) return k;
  if (PRESET_ALIASES[k]) return PRESET_ALIASES[k];
  const partial = PRESET_KEYS.find((p) => k.includes(p.replace(/[^a-z]/g, "")));
  return partial ?? "";
}

export function presetsByGroup(): Array<{
  group: SectionPreset["group"];
  label: string;
  items: SectionPreset[];
}> {
  const labels: Record<SectionPreset["group"], string> = {
    header: "Header",
    hero: "Hero",
    content: "Content",
    social: "Social proof",
    conversion: "Conversion",
    footer: "Footer",
  };
  const order: SectionPreset["group"][] = [
    "header",
    "hero",
    "content",
    "social",
    "conversion",
    "footer",
  ];
  return order
    .map((group) => ({
      group,
      label: labels[group],
      items: SECTION_PRESETS.filter((p) => p.group === group),
    }))
    .filter((g) => g.items.length > 0);
}
