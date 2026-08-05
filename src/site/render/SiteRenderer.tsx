"use client";

/**
 * Top-level renderer: theme variables, stylesheet, and the node tree.
 *
 * Used unchanged by both the public page and the editor canvas. Sharing this
 * component is what guarantees WYSIWYG — there is no second rendering path
 * that could drift.
 */

import { useMemo, type ReactNode } from "react";
import type { NodeId, RenderContext } from "@/site/document/types";
import { themeToCss } from "@/site/document/theme";
import { animationCss, baseCss, documentCss } from "./styles";
import { NodeRenderer } from "./NodeRenderer";

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

  return (
    <>
      <style
        // Server-rendered so the first paint is already themed; a
        // client-injected stylesheet would flash unstyled content.
        dangerouslySetInnerHTML={{ __html: css }}
      />
      <div className={`${scope} ${className ?? ""}`.trim()}>
        <NodeRenderer nodeId={ctx.document.root} ctx={ctx} wrap={wrap} />
      </div>
    </>
  );
}
