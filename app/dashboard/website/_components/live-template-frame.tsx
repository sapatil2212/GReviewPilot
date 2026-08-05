"use client";

/**
 * Live template preview frame.
 *
 * Renders the real template — the `/template-preview/[slug]` route inside an
 * iframe — rather than a screenshot. Screenshots need headless-browser infra to
 * generate and go stale the moment a template or component changes; an iframe
 * is always accurate by construction and costs nothing to maintain.
 *
 * Two things make it viable in a grid of 15 cards:
 *
 *   1. Lazy mounting. The iframe is not created until the card is near the
 *      viewport, so opening the page doesn't fire 15 full page renders at once.
 *   2. Measured scaling. The frame is laid out at a real desktop width and
 *      scaled down with a transform, so the preview shows the desktop layout
 *      (what a template is designed to look like) instead of triggering the
 *      template's own mobile breakpoint inside a narrow card.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LiveTemplateFrameProps {
  src: string;
  title: string;
  /** Viewport width the frame is laid out at, before scaling. */
  designWidth?: number;
  /** Frame height at design width. Ignored when `fit` is "contain". */
  designHeight?: number;
  /**
   * "width"  — scale so the design width fills the container (thumbnails).
   * "contain" — scale so the whole design box fits inside (device preview).
   */
  fit?: "width" | "contain";
  /** Never scale above this, so narrow devices don't get blown up. */
  maxScale?: number;
  /** Thumbnails block pointer events; the modal preview allows interaction. */
  interactive?: boolean;
  /** Skip the IntersectionObserver and mount immediately (modal preview). */
  eager?: boolean;
  /**
   * Shown when the frame does not finish loading in time. An iframe that is
   * refused (frame headers, a proxy, a dev server restart) fires no error
   * event, so without a timeout the card would sit on a spinner forever.
   */
  fallback?: React.ReactNode;
  /** How long to wait before giving up and showing `fallback`. */
  timeoutMs?: number;
  className?: string;
}

export function LiveTemplateFrame({
  src,
  title,
  designWidth = 1440,
  designHeight = 1080,
  fit = "width",
  maxScale = 1,
  interactive = false,
  eager = false,
  fallback,
  timeoutMs = 15000,
  className,
}: LiveTemplateFrameProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);
  const [mounted, setMounted] = useState(eager);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Reset load state when the previewed URL changes, otherwise switching pages
  // or devices in the modal shows the previous frame as "ready".
  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [src]);

  // Give up after `timeoutMs` so a refused frame surfaces the fallback rather
  // than an indefinite spinner.
  useEffect(() => {
    if (!mounted || loaded || !fallback) return;
    const timer = window.setTimeout(() => setFailed(true), timeoutMs);
    return () => window.clearTimeout(timer);
  }, [mounted, loaded, fallback, timeoutMs, src]);

  // Measure the container and derive the transform scale.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width === 0) return;
      const byWidth = width / designWidth;
      const next =
        fit === "contain" && height > 0
          ? Math.min(byWidth, height / designHeight)
          : byWidth;
      setScale(Math.min(next, maxScale));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [designWidth, designHeight, fit, maxScale]);

  // Defer creating the iframe until the card is close to the viewport.
  useEffect(() => {
    if (eager || mounted) return;
    const el = containerRef.current;
    if (!el) return;

    if (typeof IntersectionObserver === "undefined") {
      setMounted(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [eager, mounted]);

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden bg-white", className)}
      // The frame is a decorative representation of content that the
      // surrounding card already describes in text.
      aria-hidden={!interactive}
    >
      {failed && !loaded && fallback && (
        <div className="absolute inset-0">{fallback}</div>
      )}

      {!failed && (!mounted || !loaded || scale === 0) && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-50">
          <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
        </div>
      )}

      {mounted && scale > 0 && !failed && (
        <iframe
          src={src}
          title={title}
          onLoad={() => setLoaded(true)}
          loading="lazy"
          // Scripts are needed for interactive sections (accordions, carousels)
          // and Next.js hydration. Everything else stays blocked: no
          // allow-forms means a preview cannot submit anywhere, and no
          // allow-top-navigation means a template link cannot navigate the
          // dashboard out from under the user.
          sandbox="allow-scripts allow-same-origin"
          className={cn(
            "absolute left-0 top-0 origin-top-left border-0 transition-opacity duration-300",
            loaded ? "opacity-100" : "opacity-0",
            !interactive && "pointer-events-none",
          )}
          style={{
            width: designWidth,
            height: fit === "contain" ? designHeight : `${100 / scale}%`,
            transform: `scale(${scale})`,
          }}
        />
      )}
    </div>
  );
}
