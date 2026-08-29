"use client";

/**
 * Top-level renderer: theme variables, stylesheet, and the node tree.
 *
 * Used unchanged by both the public page and the editor canvas. Sharing this
 * component is what guarantees WYSIWYG — there is no second rendering path
 * that could drift.
 */

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import type { NodeId, RenderContext } from "@/site/document/types";
import { themeToCss } from "@/site/document/theme";
import { animationCss, baseCss, documentCss } from "./styles";
import { NodeRenderer } from "./NodeRenderer";

/**
 * Drive entrance animations for the whole page from one observer.
 *
 * Previously each renderer had to call `useReveal` and thread a ref onto its
 * own root, which four of thirty-one components did. NodeRenderer marks every
 * animated node with `data-sb-anim`, and the CSS hid anything carrying it until
 * `data-sb-in="1"` appeared — so the twenty-seven components that never wired
 * the hook, including the `Box` that presets use for service, team, pricing and
 * testimonial cards and for every section header, rendered permanently
 * invisible. Whole sections came out blank on published sites.
 *
 * Centralising it removes the requirement from the component contract
 * altogether: a new renderer cannot forget to do this, because it is not asked
 * to. One observer also scales better than one per animated node on a page with
 * fifty cards.
 *
 * `data-sb-reveal="on"` is set from here, and the CSS only hides content when it
 * is present. So if JS is disabled, fails, or this effect never runs, the page
 * renders fully visible with no animation — the failure mode is "no animation"
 * rather than "no content".
 */
function useRevealAll(root: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
  useEffect(() => {
    const el = root.current;
    if (!el || !enabled) return;

    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Without IntersectionObserver, or when the visitor asked for less motion,
    // leave the gate off so everything is simply visible.
    if (reducedMotion || typeof IntersectionObserver === "undefined") return;

    el.setAttribute("data-sb-reveal", "on");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const target = entry.target as HTMLElement;
          target.setAttribute("data-sb-in", "1");
          if (target.dataset.sbAnimRepeat !== "1") observer.unobserve(target);
        }
      },
      // Trigger slightly before the element is fully visible so the animation is
      // already running by the time the reader's eye arrives.
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );

    const observe = () => {
      for (const node of el.querySelectorAll<HTMLElement>("[data-sb-anim]")) {
        // Anything already on screen at load — the hero, above all — must not
        // wait for a scroll event that may never come on a short page.
        const rect = node.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          node.setAttribute("data-sb-in", "1");
          continue;
        }
        observer.observe(node);
      }
    };
    observe();

    // Nodes can appear later: a carousel advancing, an accordion opening, or the
    // editor inserting a section. Re-scanning keeps those animating instead of
    // leaving them stuck hidden.
    const mutation = new MutationObserver(observe);
    mutation.observe(el, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutation.disconnect();
      el.removeAttribute("data-sb-reveal");
    };
  }, [root, enabled]);
}

export interface SiteRendererProps {
  ctx: RenderContext;
  /** Scope class; unique per instance if two themes ever render together. */
  scope?: string;
  wrap?: (nodeId: NodeId, element: ReactNode) => ReactNode;
  className?: string;
}

export function SiteRenderer({ ctx, scope = "sb-root", wrap, className }: SiteRendererProps) {
  const css = useMemo(() => {
    const selector = `.${scope}`;
    return [
      themeToCss(ctx.theme, selector),
      baseCss(selector),
      // Published pages get media-query CSS; the editor resolves breakpoints
      // in JS via inline styles, so emitting both would let stale base rules
      // win over the simulated breakpoint.
      ctx.editor ? "" : documentCss(ctx.document, ctx.theme, selector),
      ctx.editor ? "" : animationCss(ctx.document, selector),
    ]
      .filter(Boolean)
      .join("\n");
  }, [ctx.theme, ctx.document, ctx.editor, scope]);

  const rootRef = useRef<HTMLDivElement | null>(null);
  // The editor resolves breakpoints in JS and has no animation stylesheet, so
  // revealing there would hide content the author is trying to edit.
  useRevealAll(rootRef, !ctx.editor);

  return (
    <>
      <style
        // Server-rendered so the first paint is already themed; a
        // client-injected stylesheet would flash unstyled content.
        dangerouslySetInnerHTML={{ __html: css }}
      />
      <div ref={rootRef} className={`${scope} ${className ?? ""}`.trim()}>
        <NodeRenderer nodeId={ctx.document.root} ctx={ctx} wrap={wrap} />
      </div>
    </>
  );
}
