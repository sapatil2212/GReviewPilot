"use client";

/**
 * Recursive node renderer.
 *
 * Walks the flat node map from the root, resolves each node's component,
 * and builds the `attrs` every renderer spreads onto its own root element.
 *
 * Editor and published mode differ in exactly one way here: the editor
 * passes resolved inline styles (because the canvas simulates a viewport
 * width that CSS media queries cannot see), while published pages rely on
 * the real stylesheet from documentCss. Everything else is shared, so the
 * canvas is a true preview rather than an approximation.
 */

import { Fragment, memo, type ReactNode } from "react";
import { isVisibleAt } from "@/site/document/operations";
import type { NodeId, RenderContext } from "@/site/document/types";
import { getDefinition } from "@/site/registry/definitions";
import { inlineStyle } from "./styles";
import { RENDERERS } from "./registry";
import type { NodeAttrs } from "./shared";

export interface NodeRendererProps {
  nodeId: NodeId;
  ctx: RenderContext;
  /** Injected by the editor to add selection handles and drop targets. */
  wrap?: (nodeId: NodeId, element: ReactNode) => ReactNode;
}

function NodeRendererInner({ nodeId, ctx, wrap }: NodeRendererProps): ReactNode {
  const node = ctx.document.nodes[nodeId];
  if (!node) return null;

  const breakpoint = ctx.previewBreakpoint ?? "base";
  if (!isVisibleAt(node, breakpoint)) return null;

  const Component = RENDERERS[node.type];
  const definition = getDefinition(node.type);
  const hasAnimation = Boolean(node.animation && node.animation.kind !== "none");

  const attrs: NodeAttrs = {
    "data-sb-id": node.id,
    "data-sb-type": node.type,
    ...(hasAnimation && !ctx.editor ? { "data-sb-anim": "1" } : {}),
    // Only the editor needs inline styles; published pages get a real
    // stylesheet with working media queries instead.
    ...(ctx.editor ? { style: inlineStyle(node, breakpoint) } : {}),
    ...(node.a11y?.role ? { role: node.a11y.role } : {}),
    ...(node.a11y?.ariaLabel ? { "aria-label": node.a11y.ariaLabel } : {}),
  };

  // Unknown type: render a visible marker in the editor so the author can
  // delete or replace it, and nothing at all on the live site.
  if (!Component) {
    if (!ctx.editor) return null;
    return (
      <div
        {...attrs}
        style={{
          padding: "16px",
          border: "1px dashed #EF4444",
          borderRadius: "8px",
          color: "#B91C1C",
          fontSize: "13px",
          fontFamily: "ui-monospace, monospace",
        }}
      >
        Unknown component: {node.type}
      </div>
    );
  }

  const children =
    definition?.isContainer && node.children.length > 0 ? (
      <>
        {node.children.map((childId) => (
          <NodeRenderer key={childId} nodeId={childId} ctx={ctx} wrap={wrap} />
        ))}
      </>
    ) : undefined;

  const element = (
    <Component node={node} ctx={ctx} attrs={attrs}>
      {children}
    </Component>
  );

  return wrap ? <Fragment key={node.id}>{wrap(node.id, element)}</Fragment> : element;
}

/**
 * Memoized on node identity. Because every operation in operations.ts
 * returns new objects only for the nodes it touched, editing one heading
 * re-renders that heading and its ancestors — not the whole page.
 */
export const NodeRenderer = memo(NodeRendererInner);
