"use client";

/**
 * Business component renderers.
 *
 * These are the "smart" components: they consume server-resolved data from
 * `ctx.data` rather than props alone, because their content comes from the
 * tenant's real Google Business Profile, locations, CMS, and forms.
 *
 * They all degrade gracefully. A site published before Google is connected
 * still renders a sensible reviews section; a Map with no coordinates shows
 * an address card instead of a broken iframe. Nothing here can leave a
 * visitor looking at an error.
 */

import { useMemo, useState } from "react";
import { Menu, MessageCircle, Star, X } from "lucide-react";
import type { RenderContext } from "@/site/document/types";
import type { SiteComponent } from "../shared";
import { trackEvent } from "../shared";
import { resolveIcon, SOCIAL_ICONS } from "../icons";

// =====================================================================
// Helpers
// =====================================================================

function internalHref(ctx: RenderContext, path: string): string {
  if (/^(https?:|mailto:|tel:|#)/i.test(path)) return path;
  const base = ctx.basePath === "/" ? "" : ctx.basePath;
  return `${base}${path === "/" ? "" : path}` || "/";
}

/** Nav links from explicit props, falling back to the site's own pages. */
function navLinks(
  ctx: RenderContext,
  explicit: Array<{ label?: string; href?: string }> | undefined,
): Array<{ label: string; href: string }> {
  if (explicit && explicit.length > 0) {
    return explicit
      .filter((l) => l.label)
      .map((l) => ({ label: l.label!, href: internalHref(ctx, l.href ?? "#") }));
  }
  return ctx.pages
    .filter((p) => !p.hiddenInNav)
    .slice(0, 8)
    .map((p) => ({ label: p.title, href: internalHref(ctx, p.path) }));
}

function fullAddress(loc: RenderContext["data"]["location"]): string {
  if (!loc) return "";
  return [loc.addressLine1, loc.addressLine2, loc.city, loc.state, loc.postalCode]
    .filter(Boolean)
    .join(", ");
}

// =====================================================================
// Navbar
// =====================================================================

export const Navbar: SiteComponent = ({ node, attrs, ctx }) => {
  const [open, setOpen] = useState(false);
  const links = navLinks(ctx, node.props.links as Array<{ label?: string; href?: string }>);
  const logoUrl = (node.props.logoUrl as string) || ctx.brand.logoUrl;
  const logoText = (node.props.logoText as string) || ctx.brand.businessName || "";
  const ctaLabel = node.props.ctaLabel as string | undefined;
  const ctaHref = node.props.ctaHref as string | undefined;
  const sticky = node.props.sticky !== false;
  const align = (node.props.align as string) ?? "right";

  const justify =
    align === "center" ? "center" : align === "left" ? "flex-start" : "flex-end";

  return (
    <nav
      {...attrs}
      style={{
        // `sticky` is skipped inside the editor: a sticky header inside a
        // scrollable canvas frame detaches from the page and looks broken.
        position: sticky && !ctx.editor ? "sticky" : "relative",
        top: 0,
        zIndex: 50,
        background: "color-mix(in srgb, var(--sb-color-background) 88%, transparent)",
        backdropFilter: "saturate(180%) blur(12px)",
        borderBottom: "1px solid var(--sb-color-border)",
        ...attrs.style,
      }}
    >
      <div
        className="sb-container"
        style={{ display: "flex", alignItems: "center", gap: "24px", minHeight: "72px" }}
      >
        <a
          href={internalHref(ctx, "/")}
          onClick={(e) => ctx.editor && e.preventDefault()}
          style={{ display: "inline-flex", alignItems: "center", gap: "10px", flexShrink: 0 }}
        >
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={logoText} style={{ height: "40px", width: "auto" }} />
          ) : (
            <span
              style={{
                fontFamily: "var(--sb-font-heading)",
                fontWeight: 700,
                fontSize: "var(--sb-text-xl)",
              }}
            >
              {logoText}
            </span>
          )}
        </a>

        {/* Desktop links */}
        <div
          className="sb-nav-desktop"
          style={{ display: "flex", flex: 1, justifyContent: justify, gap: "28px", alignItems: "center" }}
        >
          {links.map((link) => (
            <a
              key={link.href + link.label}
              href={link.href}
              onClick={(e) => ctx.editor && e.preventDefault()}
              style={{ fontSize: "var(--sb-text-base)", fontWeight: 500 }}
            >
              {link.label}
            </a>
          ))}
        </div>

        {ctaLabel && (
          <a
            className="sb-nav-cta"
            href={internalHref(ctx, ctaHref ?? "#contact")}
            onClick={(e) => {
              if (ctx.editor) e.preventDefault();
              else trackEvent(ctx, "CTA_CLICK", { source: "navbar" });
            }}
            style={{
              flexShrink: 0,
              padding: "10px 20px",
              borderRadius: "var(--sb-radius)",
              background: "var(--sb-color-primary)",
              color: "var(--sb-color-primary-foreground)",
              fontWeight: 600,
              fontSize: "var(--sb-text-sm)",
            }}
          >
            {ctaLabel}
          </a>
        )}

        <button
          type="button"
          className="sb-nav-toggle"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={{ display: "none", padding: "8px" }}
        >
          {open ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div
          style={{
            borderTop: "1px solid var(--sb-color-border)",
            background: "var(--sb-color-background)",
            padding: "12px 0",
          }}
        >
          <div className="sb-container" style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {links.map((link) => (
              <a
                key={link.href + link.label}
                href={link.href}
                onClick={(e) => {
                  if (ctx.editor) e.preventDefault();
                  setOpen(false);
                }}
                style={{ padding: "12px 4px", fontWeight: 500, fontSize: "var(--sb-text-lg)" }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* The mobile breakpoint is scoped to the navbar rather than driven by
          the responsive style system, because which links collapse is
          structural, not stylistic. */}
      <style>{`
@media (max-width: 860px) {
  [data-sb-id="${attrs["data-sb-id"]}"] .sb-nav-desktop { display: none !important; }
  [data-sb-id="${attrs["data-sb-id"]}"] .sb-nav-toggle { display: inline-flex !important; margin-left: auto; }
  [data-sb-id="${attrs["data-sb-id"]}"] .sb-nav-cta { display: none !important; }
}
`}</style>
    </nav>
  );
};

// =====================================================================
// Footer
// =====================================================================

export const Footer: SiteComponent = ({ node, attrs, ctx }) => {
  const logoText = (node.props.logoText as string) || ctx.brand.businessName || "";
  const tagline = node.props.tagline as string | undefined;
  const columns =
    (node.props.columns as Array<{ title?: string; links?: Array<{ label?: string; href?: string }> }>) ?? [];
  const showContact = node.props.showContact !== false;
  const showSocial = node.props.showSocial !== false;
  const copyright =
    (node.props.copyright as string) ||
    `© ${new Date().getFullYear()} ${logoText}. All rights reserved.`;
  const hideBranding = Boolean(node.props.hidePlatformBranding);

  // With no author-defined columns, list the site's own pages so a footer is
  // never empty on a freshly generated site.
  const effectiveColumns =
    columns.length > 0
      ? columns
      : [
          {
            title: "Pages",
            links: ctx.pages
              .filter((p) => !p.hiddenInNav)
              .slice(0, 6)
              .map((p) => ({ label: p.title, href: p.path })),
          },
        ];

  const location = ctx.data.location;
  const socials = Object.entries(ctx.data.socialLinks ?? {});

  return (
    <footer {...attrs}>
      <div className="sb-container" style={{ paddingTop: "56px", paddingBottom: "32px" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "40px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <span
              style={{
                fontFamily: "var(--sb-font-heading)",
                fontWeight: 700,
                fontSize: "var(--sb-text-xl)",
              }}
            >
              {logoText}
            </span>
            {tagline && <p style={{ opacity: 0.75, lineHeight: 1.6, maxWidth: "34ch" }}>{tagline}</p>}
            {showSocial && socials.length > 0 && (
              <div style={{ display: "flex", gap: "10px", marginTop: "4px" }}>
                {socials.map(([platform, url]) => {
                  const LucideIconCmp = SOCIAL_ICONS[platform] ?? resolveIcon("Share2");
                  return (
                    <a
                      key={platform}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={platform}
                      style={{ opacity: 0.8 }}
                    >
                      <LucideIconCmp size={20} aria-hidden="true" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {effectiveColumns.slice(0, 3).map((column, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {column.title && (
                <span style={{ fontWeight: 600, fontSize: "var(--sb-text-sm)", textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.7 }}>
                  {column.title}
                </span>
              )}
              {(column.links ?? []).map((link, j) => (
                <a
                  key={j}
                  href={internalHref(ctx, link.href ?? "#")}
                  onClick={(e) => ctx.editor && e.preventDefault()}
                  style={{ opacity: 0.85 }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          ))}

          {showContact && (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <span style={{ fontWeight: 600, fontSize: "var(--sb-text-sm)", textTransform: "uppercase", letterSpacing: "0.06em", opacity: 0.7 }}>
                Contact
              </span>
              {(location?.phone ?? ctx.brand.phone) && (
                <a href={`tel:${(location?.phone ?? ctx.brand.phone)!.replace(/[^\d+]/g, "")}`} style={{ opacity: 0.85 }}>
                  {location?.phone ?? ctx.brand.phone}
                </a>
              )}
              {(location?.email ?? ctx.brand.email) && (
                <a href={`mailto:${location?.email ?? ctx.brand.email}`} style={{ opacity: 0.85 }}>
                  {location?.email ?? ctx.brand.email}
                </a>
              )}
              {(fullAddress(location) || ctx.brand.address) && (
                <span style={{ opacity: 0.85, lineHeight: 1.6 }}>
                  {fullAddress(location) || ctx.brand.address}
                </span>
              )}
            </div>
          )}
        </div>

        <div
          style={{
            marginTop: "40px",
            paddingTop: "20px",
            borderTop: "1px solid color-mix(in srgb, currentColor 15%, transparent)",
            display: "flex",
            flexWrap: "wrap",
            gap: "12px",
            justifyContent: "space-between",
            fontSize: "var(--sb-text-sm)",
            opacity: 0.7,
          }}
        >
          <span>{copyright}</span>
          {!hideBranding && <span>Built with GReviewPilot</span>}
        </div>
      </div>
    </footer>
  );
};

// =====================================================================
// Google reviews
// =====================================================================

export const GoogleReviews: SiteComponent = ({ node, attrs, ctx }) => {
  const layout = (node.props.layout as string) ?? "grid";
  const limit = Number(node.props.limit ?? 6);
  const minRating = Number(node.props.minRating ?? 4);
  const showSummary = node.props.showRatingSummary !== false;
  const showPhoto = node.props.showReviewerPhoto !== false;
  const showCta = node.props.showWriteReviewCta !== false;
  const ctaLabel = (node.props.writeReviewLabel as string) ?? "Write a review";

  const reviews = useMemo(
    () => (ctx.data.reviews ?? []).filter((r) => r.rating >= minRating).slice(0, limit),
    [ctx.data.reviews, minRating, limit],
  );
  const summary = ctx.data.ratingSummary;

  // Placeholder cards keep the section designed-looking while the tenant has
  // not connected Google yet. Marked clearly in the editor so nobody thinks
  // these are real reviews.
  const isEmpty = reviews.length === 0;

  return (
    <div {...attrs}>
      {showSummary && summary && summary.total > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "14px",
            flexWrap: "wrap",
            marginBottom: "32px",
          }}
        >
          <span style={{ fontSize: "var(--sb-text-4xl)", fontWeight: 700, fontFamily: "var(--sb-font-heading)" }}>
            {summary.average.toFixed(1)}
          </span>
          <span style={{ display: "inline-flex", gap: "2px" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Star
                key={i}
                size={20}
                aria-hidden="true"
                style={{
                  color: i < Math.round(summary.average) ? "#F5A524" : "var(--sb-color-border)",
                  fill: i < Math.round(summary.average) ? "#F5A524" : "none",
                }}
              />
            ))}
          </span>
          <span style={{ color: "var(--sb-color-muted-foreground)" }}>
            {summary.total} Google review{summary.total === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {isEmpty ? (
        <div
          style={{
            padding: "32px",
            textAlign: "center",
            border: "1px dashed var(--sb-color-border)",
            borderRadius: "var(--sb-radius)",
            color: "var(--sb-color-muted-foreground)",
            background: "var(--sb-color-card)",
          }}
        >
          {ctx.editor
            ? "Connect your Google Business Profile to show live reviews here."
            : "Reviews are coming soon."}
        </div>
      ) : (
        <div
          style={
            layout === "list"
              ? { display: "flex", flexDirection: "column", gap: "16px" }
              : layout === "carousel"
                ? { display: "flex", gap: "16px", overflowX: "auto", scrollSnapType: "x mandatory", paddingBottom: "8px" }
                : {
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "16px",
                  }
          }
        >
          {reviews.map((review) => (
            <article
              key={review.id}
              style={{
                background: "var(--sb-color-card)",
                border: "1px solid var(--sb-color-border)",
                borderRadius: "var(--sb-radius)",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                ...(layout === "carousel" ? { flex: "0 0 320px", scrollSnapAlign: "start" } : {}),
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {showPhoto &&
                  (review.authorPhotoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={review.authorPhotoUrl}
                      alt=""
                      loading="lazy"
                      style={{ width: "40px", height: "40px", borderRadius: "9999px", objectFit: "cover" }}
                    />
                  ) : (
                    <span
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: "40px",
                        height: "40px",
                        borderRadius: "9999px",
                        background: "var(--sb-color-primary)",
                        color: "var(--sb-color-primary-foreground)",
                        fontWeight: 600,
                      }}
                    >
                      {review.authorName.charAt(0).toUpperCase()}
                    </span>
                  ))}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: "var(--sb-text-sm)" }}>{review.authorName}</div>
                  <span style={{ display: "inline-flex", gap: "1px" }}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        size={13}
                        aria-hidden="true"
                        style={{
                          color: i < review.rating ? "#F5A524" : "var(--sb-color-border)",
                          fill: i < review.rating ? "#F5A524" : "none",
                        }}
                      />
                    ))}
                  </span>
                </div>
              </div>
              {review.comment && (
                <p style={{ color: "var(--sb-color-muted-foreground)", lineHeight: 1.6, fontSize: "var(--sb-text-sm)" }}>
                  {review.comment}
                </p>
              )}
            </article>
          ))}
        </div>
      )}

      {showCta && ctx.data.writeReviewUrl && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: "28px" }}>
          <a
            href={ctx.data.writeReviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => {
              if (ctx.editor) e.preventDefault();
              else trackEvent(ctx, "REVIEW_CLICK");
            }}
            style={{
              padding: "12px 24px",
              borderRadius: "var(--sb-radius)",
              background: "var(--sb-color-primary)",
              color: "var(--sb-color-primary-foreground)",
              fontWeight: 600,
            }}
          >
            {ctaLabel}
          </a>
        </div>
      )}
    </div>
  );
};

// =====================================================================
// Map
// =====================================================================

export const SiteMap: SiteComponent = ({ node, attrs, ctx }) => {
  const location = ctx.data.location;
  const address = (node.props.address as string) || fullAddress(location) || ctx.brand.address || "";
  const zoom = Number(node.props.zoom ?? 15);
  const height = Number(node.props.height ?? 400);
  const showDirections = node.props.showDirectionsLink !== false;
  const apiKey = ctx.data.mapsApiKey;

  const query = location?.googlePlaceId
    ? `place_id:${location.googlePlaceId}`
    : address || location?.name || "";

  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address || query)}`;

  // Without an API key the embed API returns an error frame, so fall back to
  // a clean address card plus a directions link — still useful, never broken.
  if (!apiKey || !query) {
    return (
      <div {...attrs} style={{ ...attrs.style, minHeight: `${Math.min(height, 260)}px` }}>
        <div
          style={{
            height: "100%",
            minHeight: `${Math.min(height, 260)}px`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            background: "var(--sb-color-muted)",
            color: "var(--sb-color-muted-foreground)",
            textAlign: "center",
            padding: "24px",
          }}
        >
          {address ? (
            <>
              <span style={{ fontWeight: 600, color: "var(--sb-color-foreground)" }}>
                {location?.name ?? ctx.brand.businessName}
              </span>
              <span style={{ maxWidth: "40ch", lineHeight: 1.6 }}>{address}</span>
              {showDirections && (
                <a
                  href={directionsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "var(--sb-color-primary)", fontWeight: 600 }}
                >
                  Get directions
                </a>
              )}
            </>
          ) : (
            <span>{ctx.editor ? "Choose a location or enter an address" : ""}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div {...attrs} style={{ ...attrs.style, position: "relative" }}>
      <iframe
        title={`Map of ${location?.name ?? address}`}
        src={`https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodeURIComponent(query)}&zoom=${zoom}`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        style={{ width: "100%", height: `${height}px`, border: "none", display: "block" }}
      />
      {showDirections && (
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: "absolute",
            bottom: "16px",
            right: "16px",
            padding: "10px 18px",
            borderRadius: "var(--sb-radius)",
            background: "var(--sb-color-card)",
            color: "var(--sb-color-foreground)",
            boxShadow: "var(--sb-shadow-md)",
            fontWeight: 600,
            fontSize: "var(--sb-text-sm)",
          }}
        >
          Get directions
        </a>
      )}
    </div>
  );
};

// =====================================================================
// Opening hours
// =====================================================================

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h >= 12 ? "pm" : "am";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour}:${String(m).padStart(2, "0")}${period}` : `${hour}${period}`;
}

export const OpeningHours: SiteComponent = ({ node, attrs, ctx }) => {
  const hours = ctx.data.location?.workingHours;
  const highlightToday = node.props.showTodayHighlight !== false;
  const showBadge = node.props.showOpenBadge !== false;

  // Computed once per render from the visitor's clock. Deliberately not
  // memoized on a timer: a site does not need to flip "Open" to "Closed"
  // live, and an interval would defeat static caching.
  const today = new Date().getDay();
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  const isOpenNow = useMemo(() => {
    const ranges = hours?.[String(today)] ?? [];
    return ranges.some((r) => {
      const [oh, om] = r.open.split(":").map(Number);
      const [ch, cm] = r.close.split(":").map(Number);
      const start = oh * 60 + (om || 0);
      let end = ch * 60 + (cm || 0);
      // A close time earlier than the open time means it runs past midnight.
      if (end <= start) end += 24 * 60;
      return nowMinutes >= start && nowMinutes < end;
    });
  }, [hours, today, nowMinutes]);

  if (!hours || Object.keys(hours).length === 0) {
    return ctx.editor ? (
      <div
        {...attrs}
        style={{
          ...attrs.style,
          padding: "16px",
          border: "1px dashed var(--sb-color-border)",
          borderRadius: "var(--sb-radius)",
          color: "var(--sb-color-muted-foreground)",
          fontSize: "var(--sb-text-sm)",
        }}
      >
        Set working hours on the location to show opening times here.
      </div>
    ) : null;
  }

  return (
    <div {...attrs}>
      {showBadge && (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 14px",
            borderRadius: "9999px",
            marginBottom: "14px",
            fontSize: "var(--sb-text-sm)",
            fontWeight: 600,
            background: isOpenNow
              ? "color-mix(in srgb, var(--sb-color-success) 14%, transparent)"
              : "color-mix(in srgb, var(--sb-color-destructive) 12%, transparent)",
            color: isOpenNow ? "var(--sb-color-success)" : "var(--sb-color-destructive)",
          }}
        >
          <span
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "9999px",
              background: "currentColor",
            }}
          />
          {isOpenNow ? "Open now" : "Closed now"}
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--sb-text-sm)" }}>
        <tbody>
          {DAY_NAMES.map((day, i) => {
            const ranges = hours[String(i)] ?? [];
            const isToday = highlightToday && i === today;
            return (
              <tr key={day} style={{ fontWeight: isToday ? 700 : 400 }}>
                <th
                  scope="row"
                  style={{
                    textAlign: "left",
                    padding: "7px 0",
                    fontWeight: "inherit",
                    color: isToday ? "var(--sb-color-primary)" : undefined,
                  }}
                >
                  {day}
                </th>
                <td style={{ textAlign: "right", padding: "7px 0", color: "var(--sb-color-muted-foreground)" }}>
                  {ranges.length === 0
                    ? "Closed"
                    : ranges.map((r) => `${formatTime(r.open)} – ${formatTime(r.close)}`).join(", ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

// =====================================================================
// WhatsApp
// =====================================================================

export const WhatsAppButton: SiteComponent = ({ node, attrs, ctx }) => {
  const phone = String((node.props.phone as string) || ctx.brand.whatsapp || ctx.brand.phone || "");
  const message = String(node.props.message ?? "");
  const label = String(node.props.label ?? "Chat on WhatsApp");
  const floating = node.props.floating !== false;
  const position = (node.props.position as string) ?? "bottom-right";
  const showLabel = Boolean(node.props.showLabel);

  if (!phone) {
    return ctx.editor ? (
      <div
        {...attrs}
        style={{
          ...attrs.style,
          padding: "12px 16px",
          border: "1px dashed var(--sb-color-border)",
          borderRadius: "var(--sb-radius)",
          fontSize: "var(--sb-text-sm)",
          color: "var(--sb-color-muted-foreground)",
          width: "fit-content",
        }}
      >
        Add a WhatsApp number to enable this button
      </div>
    ) : null;
  }

  const href = `https://wa.me/${phone.replace(/[^\d]/g, "")}${message ? `?text=${encodeURIComponent(message)}` : ""}`;

  const floatStyle: React.CSSProperties = floating
    ? {
        // Inside the editor the button is rendered inline so it does not
        // hover over the dashboard chrome.
        position: ctx.editor ? "relative" : "fixed",
        bottom: ctx.editor ? undefined : "24px",
        [position === "bottom-left" ? "left" : "right"]: ctx.editor ? undefined : "24px",
        zIndex: 90,
      }
    : {};

  return (
    <a
      {...attrs}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      onClick={(e) => {
        if (ctx.editor) e.preventDefault();
        else trackEvent(ctx, "WHATSAPP_CLICK");
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "10px",
        padding: showLabel ? "14px 22px" : "16px",
        borderRadius: "9999px",
        background: "#25D366",
        color: "#FFFFFF",
        fontWeight: 600,
        boxShadow: "var(--sb-shadow-lg)",
        width: "fit-content",
        ...floatStyle,
        ...attrs.style,
      }}
    >
      <MessageCircle size={24} aria-hidden="true" />
      {showLabel && <span>{label}</span>}
    </a>
  );
};

// =====================================================================
// Form
// =====================================================================

type RenderedFormField = NonNullable<
  NonNullable<RenderContext["data"]["forms"]>[string]
>["fields"][number];

/**
 * Used when a Form node has no saved form attached yet — which is the state
 * straight after AI generation. A contact form that works immediately is far
 * more useful than an empty box, and attaching a real form later only changes
 * where submissions are stored.
 */
const DEFAULT_FIELDS: RenderedFormField[] = [
  { key: "name", label: "Your name", kind: "TEXT", required: true },
  { key: "phone", label: "Phone number", kind: "PHONE", required: true },
  { key: "email", label: "Email", kind: "EMAIL", required: false },
  { key: "message", label: "How can we help?", kind: "TEXTAREA", required: false },
];

export const Form: SiteComponent = ({ node, attrs, ctx }) => {
  const formId = node.props.formId as string | undefined;
  const definition = formId ? ctx.data.forms?.[formId] : undefined;
  const fields = definition?.fields ?? DEFAULT_FIELDS;
  const submitLabel = String(node.props.submitLabel ?? "Send message");
  const twoColumn = (node.props.layout as string) === "two-column";
  const showLabels = node.props.showLabels !== false;

  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (ctx.editor) return;

    const formEl = e.currentTarget;
    const data = Object.fromEntries(new FormData(formEl).entries());

    // Honeypot: bots fill every field, humans never see this one.
    if (data.__hp) {
      setState("done");
      return;
    }

    setState("sending");
    setError(null);
    try {
      const res = await fetch(ctx.submitEndpoint ?? `${ctx.basePath}/__submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formId,
          data,
          pagePath: typeof window !== "undefined" ? window.location.pathname : undefined,
        }),
      });
      const body = (await res.json()) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || !body.success) {
        throw new Error(body.error?.message ?? "Could not send your message.");
      }
      setState("done");
      formEl.reset();
      trackEvent(ctx, "FORM_SUBMIT", { formId });
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  };

  if (state === "done") {
    return (
      <div
        {...attrs}
        style={{
          ...attrs.style,
          padding: "28px",
          borderRadius: "var(--sb-radius)",
          background: "color-mix(in srgb, var(--sb-color-success) 10%, var(--sb-color-card))",
          border: "1px solid color-mix(in srgb, var(--sb-color-success) 35%, transparent)",
          textAlign: "center",
        }}
        role="status"
      >
        <p style={{ fontWeight: 600, marginBottom: "6px" }}>Thank you!</p>
        <p style={{ color: "var(--sb-color-muted-foreground)" }}>
          {definition?.successMessage ?? "We have received your message and will be in touch shortly."}
        </p>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: "var(--sb-radius)",
    border: "1px solid var(--sb-color-border)",
    background: "var(--sb-color-background)",
    color: "var(--sb-color-foreground)",
    fontSize: "var(--sb-text-base)",
    fontFamily: "inherit",
  };

  return (
    <form {...attrs} onSubmit={onSubmit} noValidate>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: twoColumn ? "repeat(auto-fit, minmax(220px, 1fr))" : "1fr",
          gap: "16px",
        }}
      >
        {fields.map((field) => {
          const kind = String(field.kind).toUpperCase();
          const isTextarea = kind === "TEXTAREA" || kind === "RICH_TEXT";
          const inputId = `${attrs["data-sb-id"]}-${field.key}`;
          return (
            <div
              key={field.key}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                gridColumn: isTextarea && twoColumn ? "1 / -1" : undefined,
              }}
            >
              {showLabels && (
                <label htmlFor={inputId} style={{ fontSize: "var(--sb-text-sm)", fontWeight: 600 }}>
                  {field.label}
                  {field.required && (
                    <span aria-hidden="true" style={{ color: "var(--sb-color-destructive)" }}>
                      {" "}
                      *
                    </span>
                  )}
                </label>
              )}
              {isTextarea ? (
                <textarea
                  id={inputId}
                  name={field.key}
                  required={field.required}
                  rows={4}
                  placeholder={field.placeholder ?? (showLabels ? undefined : field.label)}
                  style={{ ...inputStyle, resize: "vertical" }}
                />
              ) : kind === "SELECT" ? (
                <select id={inputId} name={field.key} required={field.required} style={inputStyle}>
                  <option value="">Please choose…</option>
                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id={inputId}
                  name={field.key}
                  required={field.required}
                  type={
                    kind === "EMAIL"
                      ? "email"
                      : kind === "PHONE"
                        ? "tel"
                        : kind === "DATE"
                          ? "date"
                          : kind === "NUMBER"
                            ? "number"
                            : "text"
                  }
                  autoComplete={
                    kind === "EMAIL" ? "email" : kind === "PHONE" ? "tel" : field.key === "name" ? "name" : undefined
                  }
                  placeholder={field.placeholder ?? (showLabels ? undefined : field.label)}
                  style={inputStyle}
                />
              )}
              {field.helpText && (
                <span style={{ fontSize: "var(--sb-text-xs)", color: "var(--sb-color-muted-foreground)" }}>
                  {field.helpText}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Honeypot — visually and programmatically hidden from humans. */}
      <input
        type="text"
        name="__hp"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: 0 }}
      />

      {error && (
        <p role="alert" style={{ marginTop: "12px", color: "var(--sb-color-destructive)", fontSize: "var(--sb-text-sm)" }}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={state === "sending"}
        style={{
          marginTop: "20px",
          width: "100%",
          padding: "14px 24px",
          borderRadius: "var(--sb-radius)",
          background: "var(--sb-color-primary)",
          color: "var(--sb-color-primary-foreground)",
          fontWeight: 600,
          fontSize: "var(--sb-text-base)",
          opacity: state === "sending" ? 0.7 : 1,
          cursor: state === "sending" ? "wait" : "pointer",
        }}
      >
        {state === "sending" ? "Sending…" : submitLabel}
      </button>
    </form>
  );
};

// =====================================================================
// CMS collection list
// =====================================================================

export const CollectionList: SiteComponent = ({ node, attrs, ctx }) => {
  const collectionId = node.props.collectionId as string | undefined;
  const collection = collectionId ? ctx.data.collections?.[collectionId] : undefined;
  const layout = (node.props.layout as string) ?? "grid";
  const columns = Number(node.props.columns ?? 3);
  const showImage = node.props.showImage !== false;
  const showExcerpt = node.props.showExcerpt !== false;
  const showDate = Boolean(node.props.showDate);
  const linkToDetail = node.props.linkToDetail !== false;
  const emptyMessage = String(node.props.emptyMessage ?? "Nothing here yet.");

  const items = collection?.items ?? [];

  if (items.length === 0) {
    return (
      <div
        {...attrs}
        style={{
          ...attrs.style,
          padding: "32px",
          textAlign: "center",
          border: "1px dashed var(--sb-color-border)",
          borderRadius: "var(--sb-radius)",
          color: "var(--sb-color-muted-foreground)",
        }}
      >
        {ctx.editor && !collectionId ? "Choose a collection in the properties panel" : emptyMessage}
      </div>
    );
  }

  return (
    <div
      {...attrs}
      style={{
        ...attrs.style,
        display: layout === "list" ? "flex" : "grid",
        flexDirection: layout === "list" ? "column" : undefined,
        gridTemplateColumns:
          layout === "grid" ? `repeat(auto-fit, minmax(${Math.floor(1100 / columns)}px, 1fr))` : undefined,
        gap: "20px",
        ...(layout === "carousel" ? { display: "flex", overflowX: "auto", scrollSnapType: "x mandatory" } : {}),
      }}
    >
      {items.map((item) => {
        const href = `${ctx.basePath === "/" ? "" : ctx.basePath}/${collection?.slug}/${item.slug}`;
        const Wrapper = linkToDetail && !ctx.editor ? "a" : "div";
        return (
          <Wrapper
            key={item.id}
            {...(Wrapper === "a" ? { href } : {})}
            style={{
              display: "flex",
              flexDirection: layout === "list" ? "row" : "column",
              gap: "14px",
              background: "var(--sb-color-card)",
              border: "1px solid var(--sb-color-border)",
              borderRadius: "var(--sb-radius)",
              overflow: "hidden",
              ...(layout === "carousel" ? { flex: "0 0 320px", scrollSnapAlign: "start" } : {}),
            }}
          >
            {showImage && item.featuredImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.featuredImageUrl}
                alt={item.title}
                loading="lazy"
                style={{
                  width: layout === "list" ? "180px" : "100%",
                  aspectRatio: layout === "list" ? "1/1" : "16/9",
                  objectFit: "cover",
                  flexShrink: 0,
                }}
              />
            )}
            <div style={{ padding: "18px", display: "flex", flexDirection: "column", gap: "8px", minWidth: 0 }}>
              {showDate && item.publishedAt && (
                <time
                  dateTime={item.publishedAt}
                  style={{ fontSize: "var(--sb-text-xs)", color: "var(--sb-color-muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}
                >
                  {new Date(item.publishedAt).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </time>
              )}
              <h3 style={{ fontSize: "var(--sb-text-xl)" }}>{item.title}</h3>
              {showExcerpt && item.excerpt && (
                <p style={{ color: "var(--sb-color-muted-foreground)", lineHeight: 1.6, fontSize: "var(--sb-text-sm)" }}>
                  {item.excerpt}
                </p>
              )}
            </div>
          </Wrapper>
        );
      })}
    </div>
  );
};
