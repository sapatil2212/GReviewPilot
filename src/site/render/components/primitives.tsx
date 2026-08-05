"use client";

/**
 * Primitive component renderers: layout, typography, media, and the
 * interactive widgets that need client state.
 *
 * Each one spreads `attrs` onto its own root element (see shared.tsx) and
 * reads styling from CSS variables, so a theme change repaints without any
 * component re-deriving values.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Play, Star } from "lucide-react";
import type { SiteComponent } from "../shared";
import { ActionWrapper, sanitizeHtml, trackEvent, useReveal } from "../shared";
import { resolveIcon } from "../icons";

// =====================================================================
// Layout
// =====================================================================

export const Page: SiteComponent = ({ attrs, children }) => (
  <div {...attrs} className="sb-page">
    {children}
  </div>
);

export const Section: SiteComponent = ({ node, attrs, children }) => {
  const as = (node.props.as as string) ?? "section";
  const contained = node.props.contained !== false;
  const anchorId = node.props.anchorId as string | undefined;

  const Tag = (["section", "header", "footer", "main", "aside", "div"].includes(as)
    ? as
    : "section") as "section";

  return (
    <Tag {...attrs} id={anchorId || attrs.id}>
      {contained ? <div className="sb-container">{children}</div> : children}
    </Tag>
  );
};

export const Container: SiteComponent = ({ attrs, children }) => (
  <div {...attrs} className={`sb-container ${attrs.className ?? ""}`.trim()}>
    {children}
  </div>
);

export const Box: SiteComponent = ({ node, attrs, children }) => {
  const as = (node.props.as as string) ?? "div";
  const Tag = (["div", "article", "figure", "nav", "ul", "li"].includes(as) ? as : "div") as "div";
  return <Tag {...attrs}>{children}</Tag>;
};

/**
 * Grid emits its own scoped media queries.
 *
 * Column counts are props, not styles, because "3 columns on desktop, 2 on
 * tablet, 1 on mobile" is one decision the user makes once — not three
 * separate breakpoint overrides they have to remember to set.
 */
export const Grid: SiteComponent = ({ node, attrs, children }) => {
  const columns = Number(node.props.columns ?? 3);
  const tablet = Number(node.props.tabletColumns ?? Math.min(2, columns));
  const mobile = Number(node.props.mobileColumns ?? 1);
  const id = attrs["data-sb-id"];

  return (
    <>
      <style>{`
[data-sb-id="${id}"] { display: grid; grid-template-columns: repeat(${columns}, minmax(0, 1fr)); }
@media (max-width: 1024px) { [data-sb-id="${id}"] { grid-template-columns: repeat(${tablet}, minmax(0, 1fr)); } }
@media (max-width: 640px) { [data-sb-id="${id}"] { grid-template-columns: repeat(${mobile}, minmax(0, 1fr)); } }
`}</style>
      <div {...attrs}>{children}</div>
    </>
  );
};

export const Spacer: SiteComponent = ({ node, attrs }) => (
  <div
    {...attrs}
    aria-hidden="true"
    style={{ ...attrs.style, height: `${Number(node.props.height ?? 48)}px` }}
  />
);

export const Divider: SiteComponent = ({ node, attrs }) => (
  <hr
    {...attrs}
    style={{
      ...attrs.style,
      border: "none",
      borderTop: `${Number(node.props.thickness ?? 1)}px solid var(--sb-color-border)`,
      marginInline: node.props.inset ? "var(--sb-space-lg)" : undefined,
    }}
  />
);

// =====================================================================
// Typography
// =====================================================================

export const Heading: SiteComponent = ({ node, attrs }) => {
  const level = (node.props.level as string) ?? "h2";
  const Tag = (["h1", "h2", "h3", "h4", "h5", "h6"].includes(level) ? level : "h2") as "h2";
  const { ref, inView } = useReveal<HTMLHeadingElement>(
    Boolean(node.animation && node.animation.kind !== "none"),
    node.animation?.repeat,
  );
  return (
    <Tag {...attrs} ref={ref} data-sb-in={inView ? "1" : "0"}>
      {String(node.props.text ?? "")}
    </Tag>
  );
};

export const Text: SiteComponent = ({ node, attrs }) => {
  const as = (node.props.as as string) ?? "p";
  const Tag = (["p", "span", "div", "label"].includes(as) ? as : "p") as "p";
  const { ref, inView } = useReveal<HTMLParagraphElement>(
    Boolean(node.animation && node.animation.kind !== "none"),
    node.animation?.repeat,
  );
  // Preserve author line breaks without needing a rich-text editor.
  return (
    <Tag {...attrs} ref={ref} data-sb-in={inView ? "1" : "0"} style={{ ...attrs.style, whiteSpace: "pre-line" }}>
      {String(node.props.text ?? "")}
    </Tag>
  );
};

export const RichText: SiteComponent = ({ node, attrs }) => (
  <div
    {...attrs}
    className={`sb-rich ${attrs.className ?? ""}`.trim()}
    dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(node.props.html ?? "")) }}
  />
);

export const Badge: SiteComponent = ({ node, attrs }) => (
  <span
    {...attrs}
    style={{
      display: "inline-flex",
      alignItems: "center",
      gap: "6px",
      padding: "5px 12px",
      borderRadius: "9999px",
      backgroundColor: "color-mix(in srgb, var(--sb-color-primary) 12%, transparent)",
      color: "var(--sb-color-primary)",
      fontSize: "var(--sb-text-sm)",
      fontWeight: 600,
      width: "fit-content",
      ...attrs.style,
    }}
  >
    {String(node.props.text ?? "")}
  </span>
);

export const Icon: SiteComponent = ({ node, attrs }) => {
  const Lucide = resolveIcon(node.props.name as string);
  return (
    <span {...attrs} style={{ display: "inline-flex", flexShrink: 0, ...attrs.style }}>
      <Lucide
        size={Number(node.props.size ?? 24)}
        strokeWidth={Number(node.props.strokeWidth ?? 2)}
        aria-hidden="true"
      />
    </span>
  );
};

// =====================================================================
// Media
// =====================================================================

export const Image: SiteComponent = ({ node, attrs, ctx }) => {
  const src = String(node.props.src ?? "");
  const alt = String(node.props.alt ?? "");
  const aspectRatio = (node.props.aspectRatio as string) ?? "auto";
  const objectFit = (node.props.objectFit as string) ?? "cover";
  const priority = Boolean(node.props.priority);
  const caption = node.props.caption as string | undefined;
  const decorative = node.a11y?.decorative;

  const { ref, inView } = useReveal<HTMLDivElement>(
    Boolean(node.animation && node.animation.kind !== "none"),
    node.animation?.repeat,
  );

  const box = {
    ...attrs.style,
    ...(aspectRatio !== "auto" ? { aspectRatio } : {}),
    overflow: "hidden" as const,
  };

  // An empty src is the normal state right after AI generation, before the
  // user picks images. A labelled placeholder is far more useful than a
  // broken-image icon, and it keeps layout stable.
  if (!src) {
    return (
      <div
        {...attrs}
        ref={ref}
        data-sb-in={inView ? "1" : "0"}
        style={{
          ...box,
          minHeight: aspectRatio === "auto" ? "220px" : undefined,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--sb-color-primary) 8%, var(--sb-color-muted)), var(--sb-color-muted))",
          color: "var(--sb-color-muted-foreground)",
          fontSize: "var(--sb-text-sm)",
          border: "1px dashed var(--sb-color-border)",
        }}
      >
        {ctx.editor ? "Click to add an image" : ""}
      </div>
    );
  }

  // next/image is deliberately not used anywhere in the renderer: published
  // sites display arbitrary external image URLs chosen by tenants at runtime,
  // and next/image requires every host to be pre-declared in
  // `images.remotePatterns` at build time. Loading, decoding, fetch priority,
  // and aspect-ratio reservation are handled explicitly below instead.
  const img = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={decorative ? "" : alt}
      {...(decorative ? { "aria-hidden": "true" } : {})}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      style={{
        width: "100%",
        height: aspectRatio !== "auto" ? "100%" : "auto",
        objectFit: objectFit as "cover",
        display: "block",
      }}
    />
  );

  if (caption) {
    return (
      <figure {...attrs} ref={ref} data-sb-in={inView ? "1" : "0"} style={box}>
        {img}
        <figcaption
          style={{
            marginTop: "8px",
            fontSize: "var(--sb-text-sm)",
            color: "var(--sb-color-muted-foreground)",
          }}
        >
          {caption}
        </figcaption>
      </figure>
    );
  }

  return (
    <div {...attrs} ref={ref} data-sb-in={inView ? "1" : "0"} style={box}>
      {img}
    </div>
  );
};

/**
 * Click-to-load video embed.
 *
 * A YouTube iframe costs ~1MB and multiple third-party requests on load.
 * Rendering a poster and only mounting the iframe on click keeps the
 * Lighthouse score the builder promises, and avoids setting third-party
 * cookies for visitors who never press play.
 */
export const VideoEmbed: SiteComponent = ({ node, attrs, ctx }) => {
  const [playing, setPlaying] = useState(false);
  const url = String(node.props.url ?? "");
  const aspectRatio = (node.props.aspectRatio as string) ?? "16/9";
  const poster = node.props.posterUrl as string | undefined;
  const title = (node.props.title as string) || "Video";

  const embedUrl = useMemo(() => {
    const yt = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/.exec(url);
    if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?autoplay=1&rel=0`;
    const vimeo = /vimeo\.com\/(?:video\/)?(\d+)/.exec(url);
    if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}?autoplay=1`;
    return null;
  }, [url]);

  const frame = { ...attrs.style, aspectRatio, position: "relative" as const, overflow: "hidden" as const };

  if (!embedUrl) {
    return (
      <div
        {...attrs}
        style={{
          ...frame,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--sb-color-muted)",
          color: "var(--sb-color-muted-foreground)",
          fontSize: "var(--sb-text-sm)",
        }}
      >
        {ctx.editor ? "Add a YouTube or Vimeo URL" : ""}
      </div>
    );
  }

  if (playing && !ctx.editor) {
    return (
      <div {...attrs} style={frame}>
        <iframe
          src={embedUrl}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
          allowFullScreen
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", border: "none" }}
        />
      </div>
    );
  }

  return (
    <button
      {...attrs}
      type="button"
      aria-label={`Play video: ${title}`}
      onClick={() => !ctx.editor && setPlaying(true)}
      style={{
        ...frame,
        width: "100%",
        cursor: ctx.editor ? "default" : "pointer",
        backgroundColor: "var(--sb-color-secondary)",
        backgroundImage: poster ? `url("${poster}")` : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: "72px",
          height: "72px",
          borderRadius: "9999px",
          background: "var(--sb-color-primary)",
          color: "var(--sb-color-primary-foreground)",
          boxShadow: "var(--sb-shadow-lg)",
        }}
      >
        <Play size={28} style={{ marginLeft: "4px" }} aria-hidden="true" />
      </span>
    </button>
  );
};

// =====================================================================
// Interactive
// =====================================================================

const BUTTON_SIZES: Record<string, { padding: string; fontSize: string }> = {
  sm: { padding: "8px 16px", fontSize: "var(--sb-text-sm)" },
  md: { padding: "12px 24px", fontSize: "var(--sb-text-base)" },
  lg: { padding: "16px 32px", fontSize: "var(--sb-text-lg)" },
};

function buttonVariantStyle(variant: string): React.CSSProperties {
  switch (variant) {
    case "secondary":
      return { background: "var(--sb-color-secondary)", color: "var(--sb-color-secondary-foreground)" };
    case "accent":
      return { background: "var(--sb-color-accent)", color: "var(--sb-color-accent-foreground)" };
    case "outline":
      return {
        background: "transparent",
        color: "currentColor",
        boxShadow: "inset 0 0 0 1.5px currentColor",
      };
    case "ghost":
      return { background: "transparent", color: "var(--sb-color-primary)" };
    default:
      return { background: "var(--sb-color-primary)", color: "var(--sb-color-primary-foreground)" };
  }
}

export const Button: SiteComponent = ({ node, attrs, ctx }) => {
  const variant = (node.props.variant as string) ?? "primary";
  const size = (node.props.size as string) ?? "md";
  const fullWidth = Boolean(node.props.fullWidth);
  const iconName = node.props.iconName as string | undefined;
  const iconPosition = (node.props.iconPosition as string) ?? "right";
  const LucideIconCmp = iconName ? resolveIcon(iconName) : null;

  const sizing = BUTTON_SIZES[size] ?? BUTTON_SIZES.md;

  const style: React.CSSProperties = {
    display: fullWidth ? "flex" : "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    borderRadius: "var(--sb-radius)",
    fontWeight: 600,
    lineHeight: 1.2,
    textAlign: "center",
    width: fullWidth ? "100%" : undefined,
    transition: "transform 140ms ease, filter 140ms ease, box-shadow 140ms ease",
    ...sizing,
    ...buttonVariantStyle(variant),
    ...attrs.style,
  };

  return (
    <ActionWrapper
      action={node.action}
      ctx={ctx}
      attrs={{ ...attrs, style, className: `sb-btn ${attrs.className ?? ""}`.trim() }}
      fallbackTag="button"
    >
      {LucideIconCmp && iconPosition === "left" && <LucideIconCmp size={18} aria-hidden="true" />}
      <span>{String(node.props.label ?? "")}</span>
      {LucideIconCmp && iconPosition === "right" && <LucideIconCmp size={18} aria-hidden="true" />}
    </ActionWrapper>
  );
};

export const Accordion: SiteComponent = ({ node, attrs }) => {
  const items = (node.props.items as Array<{ question?: string; answer?: string }>) ?? [];
  const allowMultiple = Boolean(node.props.allowMultiple);
  const defaultOpenIndex = Number(node.props.defaultOpenIndex ?? 0);
  const [open, setOpen] = useState<number[]>(defaultOpenIndex >= 0 ? [defaultOpenIndex] : []);

  const toggle = (i: number) =>
    setOpen((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : allowMultiple ? [...prev, i] : [i],
    );

  return (
    <div {...attrs} style={{ display: "flex", flexDirection: "column", gap: "10px", ...attrs.style }}>
      {items.map((item, i) => {
        const isOpen = open.includes(i);
        return (
          <div
            key={i}
            style={{
              border: "1px solid var(--sb-color-border)",
              borderRadius: "var(--sb-radius)",
              background: "var(--sb-color-card)",
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-expanded={isOpen}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
                padding: "16px 20px",
                textAlign: "left",
                fontWeight: 600,
                fontSize: "var(--sb-text-base)",
                color: "var(--sb-color-card-foreground)",
              }}
            >
              <span>{item.question ?? ""}</span>
              <ChevronDown
                size={20}
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  transition: "transform 200ms ease",
                  transform: isOpen ? "rotate(180deg)" : "none",
                  color: "var(--sb-color-primary)",
                }}
              />
            </button>
            {/* Grid-rows animation gives a real height transition without
                measuring the content in JS. */}
            <div
              style={{
                display: "grid",
                gridTemplateRows: isOpen ? "1fr" : "0fr",
                transition: "grid-template-rows 220ms ease",
              }}
            >
              <div style={{ overflow: "hidden" }}>
                <p
                  style={{
                    padding: "0 20px 18px",
                    color: "var(--sb-color-muted-foreground)",
                    lineHeight: 1.65,
                    whiteSpace: "pre-line",
                  }}
                >
                  {item.answer ?? ""}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export const Tabs: SiteComponent = ({ node, attrs }) => {
  const items = (node.props.items as Array<{ label?: string; content?: string }>) ?? [];
  const [active, setActive] = useState(0);

  return (
    <div {...attrs}>
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: "4px",
          flexWrap: "wrap",
          borderBottom: "1px solid var(--sb-color-border)",
          marginBottom: "20px",
        }}
      >
        {items.map((item, i) => (
          <button
            key={i}
            role="tab"
            type="button"
            aria-selected={active === i}
            onClick={() => setActive(i)}
            style={{
              padding: "10px 18px",
              fontWeight: 600,
              fontSize: "var(--sb-text-base)",
              color: active === i ? "var(--sb-color-primary)" : "var(--sb-color-muted-foreground)",
              borderBottom: `2px solid ${active === i ? "var(--sb-color-primary)" : "transparent"}`,
              marginBottom: "-1px",
            }}
          >
            {item.label ?? `Tab ${i + 1}`}
          </button>
        ))}
      </div>
      <div role="tabpanel" style={{ color: "var(--sb-color-muted-foreground)", lineHeight: 1.65, whiteSpace: "pre-line" }}>
        {items[active]?.content ?? ""}
      </div>
    </div>
  );
};

export const Carousel: SiteComponent = ({ node, attrs, ctx }) => {
  const slides =
    (node.props.slides as Array<{ imageUrl?: string; alt?: string; caption?: string }>) ?? [];
  const perView = Math.max(1, Number(node.props.slidesPerView ?? 3));
  const autoplay = Boolean(node.props.autoplay) && !ctx.editor;
  const intervalMs = Number(node.props.intervalMs ?? 5000);
  const showArrows = node.props.showArrows !== false;
  const showDots = node.props.showDots !== false;

  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const pages = Math.max(1, Math.ceil(slides.length / perView));

  useEffect(() => {
    if (!autoplay || pages <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % pages), intervalMs);
    return () => clearInterval(timer);
  }, [autoplay, intervalMs, pages]);

  // Clamp when slides are removed in the editor so the view can't strand
  // itself past the end.
  useEffect(() => {
    setIndex((i) => Math.min(i, pages - 1));
  }, [pages]);

  if (slides.length === 0) {
    return (
      <div
        {...attrs}
        style={{
          ...attrs.style,
          minHeight: "200px",
          display: "grid",
          placeItems: "center",
          background: "var(--sb-color-muted)",
          color: "var(--sb-color-muted-foreground)",
          borderRadius: "var(--sb-radius)",
          fontSize: "var(--sb-text-sm)",
        }}
      >
        {ctx.editor ? "Add slides in the properties panel" : ""}
      </div>
    );
  }

  return (
    <div {...attrs} style={{ position: "relative", ...attrs.style }}>
      <div style={{ overflow: "hidden", borderRadius: "var(--sb-radius)" }}>
        <div
          ref={trackRef}
          style={{
            display: "flex",
            gap: "16px",
            transform: `translateX(calc(-${index * 100}% - ${index * 16}px))`,
            transition: "transform 420ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {slides.map((slide, i) => (
            <figure
              key={i}
              style={{
                // Subtracting the shared gap keeps exactly `perView` slides
                // visible instead of overflowing by the gap total.
                flex: `0 0 calc((100% - ${(perView - 1) * 16}px) / ${perView})`,
                margin: 0,
              }}
            >
              {slide.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={slide.imageUrl}
                  alt={slide.alt ?? ""}
                  loading={i < perView ? "eager" : "lazy"}
                  style={{
                    width: "100%",
                    aspectRatio: "1/1",
                    objectFit: "cover",
                    borderRadius: "var(--sb-radius)",
                    display: "block",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    aspectRatio: "1/1",
                    background: "var(--sb-color-muted)",
                    borderRadius: "var(--sb-radius)",
                  }}
                />
              )}
              {slide.caption && (
                <figcaption
                  style={{
                    marginTop: "8px",
                    fontSize: "var(--sb-text-sm)",
                    color: "var(--sb-color-muted-foreground)",
                  }}
                >
                  {slide.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      </div>

      {showArrows && pages > 1 && (
        <>
          <CarouselArrow
            direction="prev"
            onClick={() => setIndex((i) => (i - 1 + pages) % pages)}
          />
          <CarouselArrow direction="next" onClick={() => setIndex((i) => (i + 1) % pages)} />
        </>
      )}

      {showDots && pages > 1 && (
        <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginTop: "16px" }}>
          {Array.from({ length: pages }).map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide group ${i + 1}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              style={{
                width: i === index ? "24px" : "8px",
                height: "8px",
                borderRadius: "9999px",
                background: i === index ? "var(--sb-color-primary)" : "var(--sb-color-border)",
                transition: "width 200ms ease, background 200ms ease",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
};

function CarouselArrow({
  direction,
  onClick,
}: {
  direction: "prev" | "next";
  onClick: () => void;
}) {
  const Chevron = direction === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === "prev" ? "Previous slides" : "Next slides"}
      style={{
        position: "absolute",
        top: "50%",
        [direction === "prev" ? "left" : "right"]: "-16px",
        transform: "translateY(-50%)",
        display: "grid",
        placeItems: "center",
        width: "40px",
        height: "40px",
        borderRadius: "9999px",
        background: "var(--sb-color-card)",
        color: "var(--sb-color-foreground)",
        boxShadow: "var(--sb-shadow-md)",
        border: "1px solid var(--sb-color-border)",
        zIndex: 2,
      }}
    >
      <Chevron size={20} aria-hidden="true" />
    </button>
  );
}

/**
 * Count-up statistic.
 *
 * Only animates the numeric part, so "4.9" and "24/7" both work: the label
 * is parsed for a leading number and anything non-numeric is rendered as-is
 * rather than producing NaN.
 */
export const StatCounter: SiteComponent = ({ node, attrs }) => {
  const raw = String(node.props.value ?? "0");
  const target = parseFloat(raw.replace(/[^\d.]/g, ""));
  const decimals = (raw.split(".")[1] ?? "").replace(/[^\d]/g, "").length;
  const animate = node.props.animate !== false && Number.isFinite(target);

  const { ref, inView } = useReveal<HTMLDivElement>(true, false);
  const [display, setDisplay] = useState(animate ? 0 : target);

  useEffect(() => {
    if (!animate || !inView) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(target);
      return;
    }
    const duration = 1400;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // Ease-out cubic: fast start, gentle settle.
      setDisplay(target * (1 - Math.pow(1 - t, 3)));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, inView, target]);

  const shown = Number.isFinite(target)
    ? display.toFixed(decimals)
    : raw;

  return (
    <div {...attrs} ref={ref}>
      <div style={{ fontSize: "var(--sb-text-4xl)", fontWeight: 700, lineHeight: 1.1, fontFamily: "var(--sb-font-heading)" }}>
        {(node.props.prefix as string) ?? ""}
        {shown}
        {(node.props.suffix as string) ?? ""}
      </div>
      <div style={{ marginTop: "6px", fontSize: "var(--sb-text-sm)", opacity: 0.85 }}>
        {String(node.props.label ?? "")}
      </div>
    </div>
  );
};

export const Rating: SiteComponent = ({ node, attrs }) => {
  const value = Math.max(0, Math.min(5, Number(node.props.value ?? 5)));
  const size = Number(node.props.size ?? 18);
  const showValue = Boolean(node.props.showValue);

  return (
    <div
      {...attrs}
      style={{ display: "inline-flex", alignItems: "center", gap: "6px", ...attrs.style }}
      role="img"
      aria-label={`Rated ${value} out of 5`}
    >
      <span style={{ display: "inline-flex", gap: "2px" }}>
        {Array.from({ length: 5 }).map((_, i) => {
          // Partial fill via a clipped overlay keeps half-stars accurate
          // without shipping a second icon set.
          const fill = Math.max(0, Math.min(1, value - i));
          return (
            <span key={i} style={{ position: "relative", display: "inline-flex", lineHeight: 0 }}>
              <Star size={size} aria-hidden="true" style={{ color: "var(--sb-color-border)" }} />
              {fill > 0 && (
                <span
                  style={{
                    position: "absolute",
                    inset: 0,
                    overflow: "hidden",
                    width: `${fill * 100}%`,
                    lineHeight: 0,
                  }}
                >
                  <Star
                    size={size}
                    aria-hidden="true"
                    style={{ color: "#F5A524", fill: "#F5A524" }}
                  />
                </span>
              )}
            </span>
          );
        })}
      </span>
      {showValue && (
        <span style={{ fontSize: "var(--sb-text-sm)", fontWeight: 600 }}>{value.toFixed(1)}</span>
      )}
    </div>
  );
};

export const HtmlEmbed: SiteComponent = ({ node, attrs }) => (
  <div
    {...attrs}
    dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(node.props.html ?? "")) }}
  />
);

export const SocialLinks: SiteComponent = ({ node, attrs, ctx }) => {
  const links =
    (node.props.links as Array<{ platform: string; url: string }>) ??
    Object.entries(ctx.data.socialLinks ?? {}).map(([platform, url]) => ({ platform, url }));
  const size = Number(node.props.size ?? 20);
  const variant = (node.props.variant as string) ?? "plain";

  if (links.length === 0) return null;

  return (
    <div {...attrs} style={{ display: "flex", gap: "10px", flexWrap: "wrap", ...attrs.style }}>
      {links.map((link, i) => {
        const LucideIconCmp = resolveIcon(
          { facebook: "Facebook", instagram: "Instagram", twitter: "Twitter", linkedin: "Linkedin", youtube: "Youtube", whatsapp: "MessageCircle" }[
            link.platform
          ] ?? "Share2",
        );
        return (
          <a
            key={i}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={link.platform}
            onClick={() => trackEvent(ctx, "OUTBOUND_CLICK", { platform: link.platform })}
            style={{
              display: "grid",
              placeItems: "center",
              width: `${size * 2}px`,
              height: `${size * 2}px`,
              borderRadius: "9999px",
              ...(variant === "filled"
                ? { background: "var(--sb-color-primary)", color: "var(--sb-color-primary-foreground)" }
                : variant === "outline"
                  ? { boxShadow: "inset 0 0 0 1.5px currentColor" }
                  : {}),
            }}
          >
            <LucideIconCmp size={size} aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
};
