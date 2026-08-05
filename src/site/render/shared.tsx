"use client";

/**
 * Shared renderer plumbing: the component contract, action resolution,
 * scroll-reveal, and HTML sanitization.
 */

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type { ActionSpec, RenderContext, SiteNode } from "@/site/document/types";

/**
 * Every renderer receives `attrs` and must spread them onto its own root
 * element.
 *
 * The alternative — wrapping each node in a styled <div> — would double the
 * DOM depth, break `display: grid` on parents (the wrapper becomes the grid
 * item, not the component), and make semantic tags like <section> and
 * <header> impossible. Spreading keeps the emitted markup exactly as clean
 * as hand-written HTML.
 */
export interface NodeAttrs {
  "data-sb-id": string;
  "data-sb-type": string;
  "data-sb-anim"?: string;
  "data-sb-in"?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
  role?: string;
  "aria-label"?: string;
}

export interface RenderProps {
  node: SiteNode;
  ctx: RenderContext;
  attrs: NodeAttrs;
  /** Pre-rendered children, for container components. */
  children?: ReactNode;
}

export type SiteComponent = (props: RenderProps) => ReactNode;

// =====================================================================
// Actions
// =====================================================================

export interface ResolvedAction {
  href?: string;
  target?: string;
  rel?: string;
  onClick?: (e: React.MouseEvent) => void;
  /** Event to record for analytics when this action fires. */
  eventType?: string;
}

/**
 * Turn an ActionSpec into anchor attributes.
 *
 * In editor mode every action is neutralized: clicking a "Call us" button
 * on the canvas must select the node, not dial a phone number.
 */
export function resolveAction(
  action: ActionSpec | undefined,
  ctx: RenderContext,
): ResolvedAction {
  if (!action || action.kind === "none") return {};

  if (ctx.editor) {
    return { onClick: (e) => e.preventDefault() };
  }

  switch (action.kind) {
    case "url": {
      const external = /^https?:\/\//i.test(action.href);
      return {
        href: action.href,
        target: action.target ?? (external ? "_blank" : "_self"),
        // noopener is required on target=_blank to prevent the opened page
        // from reaching back through window.opener.
        rel: action.rel ?? (external ? "noopener noreferrer" : undefined),
        eventType: external ? "OUTBOUND_CLICK" : undefined,
      };
    }
    case "page": {
      const page = ctx.pages.find((p) => p.id === action.pageId);
      const path = page ? `${ctx.basePath}${page.path === "/" ? "" : page.path}` : ctx.basePath;
      return { href: `${path || "/"}${action.hash ? `#${action.hash}` : ""}` };
    }
    case "scroll":
      return {
        href: `#${action.nodeId}`,
        onClick: (e) => {
          e.preventDefault();
          document
            .querySelector(`[data-sb-id="${action.nodeId}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        },
      };
    case "tel":
      return { href: `tel:${action.phone.replace(/[^\d+]/g, "")}`, eventType: "CALL_CLICK" };
    case "mailto":
      return { href: `mailto:${action.email}` };
    case "whatsapp": {
      const phone = action.phone.replace(/[^\d]/g, "");
      const text = action.message ? `?text=${encodeURIComponent(action.message)}` : "";
      return {
        href: `https://wa.me/${phone}${text}`,
        target: "_blank",
        rel: "noopener noreferrer",
        eventType: "WHATSAPP_CLICK",
      };
    }
    case "download":
      return { href: action.href, target: "_blank", rel: "noopener noreferrer" };
    case "submit":
    case "openModal":
    default:
      return {};
  }
}

/** Fire-and-forget analytics beacon. Never blocks or breaks navigation. */
export function trackEvent(
  ctx: RenderContext,
  type: string,
  meta?: Record<string, unknown>,
): void {
  if (ctx.editor || !ctx.trackEndpoint || typeof window === "undefined") return;
  try {
    const body = JSON.stringify({ type, path: window.location.pathname, meta });
    // sendBeacon survives the page unload that follows an outbound click,
    // which an in-flight fetch would not.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(ctx.trackEndpoint, new Blob([body], { type: "application/json" }));
    } else {
      void fetch(ctx.trackEndpoint, {
        method: "POST",
        body,
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      });
    }
  } catch {
    // Analytics must never surface an error to a visitor.
  }
}

/** Anchor or button, depending on whether the action produced an href. */
export function ActionWrapper({
  action,
  ctx,
  attrs,
  children,
  fallbackTag = "div",
}: {
  action: ActionSpec | undefined;
  ctx: RenderContext;
  attrs: NodeAttrs;
  children: ReactNode;
  fallbackTag?: "div" | "span" | "button";
}): ReactNode {
  const resolved = resolveAction(action, ctx);
  const onClick = (e: React.MouseEvent) => {
    resolved.onClick?.(e);
    if (resolved.eventType) trackEvent(ctx, resolved.eventType, { href: resolved.href });
  };

  if (resolved.href) {
    return (
      <a {...attrs} href={resolved.href} target={resolved.target} rel={resolved.rel} onClick={onClick}>
        {children}
      </a>
    );
  }
  if (fallbackTag === "button") {
    return (
      <button {...attrs} type="button" onClick={onClick}>
        {children}
      </button>
    );
  }
  const Tag = fallbackTag;
  return <Tag {...attrs}>{children}</Tag>;
}

// =====================================================================
// Scroll reveal
// =====================================================================

/**
 * Toggle `data-sb-in` when the element enters the viewport, which the CSS
 * in styles.ts uses to run entrance animations.
 *
 * IntersectionObserver rather than a scroll listener: no layout thrash, and
 * it works with lazy-rendered content. Elements start visible when there is
 * no animation or when reduced motion is requested, so content is never
 * hidden from someone who disabled animations.
 */
export function useReveal<T extends HTMLElement>(enabled: boolean, repeat = false) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(!enabled);

  useEffect(() => {
    if (!enabled) {
      setInView(true);
      return;
    }
    if (
      typeof window === "undefined" ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (!repeat) observer.unobserve(entry.target);
          } else if (repeat) {
            setInView(false);
          }
        }
      },
      // Trigger slightly before the element is fully visible so the
      // animation is already running by the time the user reads it.
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, repeat]);

  return { ref, inView };
}

// =====================================================================
// Sanitization
// =====================================================================

/**
 * Strip anything executable from user or AI supplied HTML.
 *
 * The RichText and HtmlEmbed components render tenant-authored HTML on a
 * public page. Without this, one tenant's stored XSS would execute for
 * every visitor to their site — and any AI-generated markup would be an
 * injection vector too. Runs on both server and client so SSR output is
 * clean before it reaches the browser.
 *
 * This is an allowlist-shaped denylist and deliberately aggressive. It is
 * not a substitute for a full sanitizer (DOMPurify) if arbitrary HTML ever
 * becomes a first-class feature, but it removes every vector that matters
 * for the markup this builder actually produces.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return (
    html
      // Executable / embedding elements, including unclosed variants.
      .replace(/<\s*(script|style|iframe|object|embed|link|meta|base|form|input|button|textarea|select)\b[\s\S]*?(?:<\/\s*\1\s*>|$)/gi, "")
      .replace(/<\s*\/?\s*(script|style|iframe|object|embed|link|meta|base)\b[^>]*>/gi, "")
      // Inline event handlers: on*="..." / on*='...' / on*=bare
      .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      // javascript:, vbscript:, and data: URLs in href/src/action.
      .replace(
        /\s(?:href|src|action|formaction|xlink:href)\s*=\s*(?:"\s*(?:javascript|vbscript|data)\s*:[^"]*"|'\s*(?:javascript|vbscript|data)\s*:[^']*'|(?:javascript|vbscript|data)\s*:[^\s>]*)/gi,
        "",
      )
      // srcdoc can carry a whole document.
      .replace(/\ssrcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      // CSS expression() and url(javascript:) inside style attributes.
      .replace(/\sstyle\s*=\s*(?:"[^"]*(?:expression|javascript:)[^"]*"|'[^']*(?:expression|javascript:)[^']*')/gi, "")
  );
}

/** Escape text destined for an attribute or JSON-LD string. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
