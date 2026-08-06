"use client";

/**
 * Live thumbnail of a section preset.
 *
 * Renders the real preset through the real renderer with the site's real
 * theme, then scales it down — so what the user previews is exactly what
 * gets inserted. A hand-drawn illustration or a static screenshot would
 * drift from the presets the moment either changed; this cannot.
 *
 * Three things make it cheap enough to show ~20 of them in a sidebar:
 *
 *   1. Lazy mounting. Nothing renders until it scrolls into view, so opening
 *      the panel costs a handful of subtrees rather than every one.
 *   2. `editor: true`. Skips the animation stylesheet (entrance animations
 *      would otherwise leave content at opacity 0 inside a cropped box) and
 *      disables navigation, form submits, and video autoplay.
 *   3. A single shared CSS scope. With animations and document CSS skipped the
 *      emitted stylesheet is identical for every preview, so they can all
 *      share one selector instead of each shipping its own copy.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyDocument,
  insertSubtree,
  normalizeDocument,
} from "@/site/document/operations";
import { buildSection, type PresetInput } from "@/site/registry/presets";
import type { RenderContext } from "@/site/document/types";
import { SiteRenderer } from "@/site/render/SiteRenderer";

/**
 * Width the section is laid out at before scaling. A desktop-ish width keeps
 * multi-column presets in their intended arrangement — measuring the narrow
 * sidebar directly would collapse every grid to one column and make each
 * thumbnail look the same.
 */
const VIRTUAL_WIDTH = 1000;

/** Cropped height of the thumbnail, in panel pixels. */
const THUMB_HEIGHT = 88;

/** Shared scope: identical CSS across previews, so one selector serves all. */
const PREVIEW_SCOPE = "sb-section-preview";

/**
 * Everything the renderer needs except the document, which each preview
 * builds for itself.
 *
 * Deliberately excludes `document`: sharing the canvas's full context would
 * hand every preview a new object on each keystroke and re-render all of them
 * while the user types. This shape only changes when the theme or site data
 * does.
 */
export type SectionPreviewContext = Omit<RenderContext, "document">;

export function SectionPreview({
  presetKey,
  baseCtx,
  presetInput,
}: {
  presetKey: string;
  baseCtx: SectionPreviewContext;
  presetInput: PresetInput;
}) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);

  // Mount only once in view. `rootMargin` starts the render just before the
  // thumbnail is scrolled to, so it is rarely caught blank.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        }
      },
      { root: null, rootMargin: "200px 0px", threshold: 0 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The sidebar is resizable, so the scale factor has to track its width.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const document = useMemo(() => {
    if (!visible) return null;
    const subtree = buildSection(presetKey, presetInput);
    if (!subtree) return null;
    let doc = createEmptyDocument();
    doc = insertSubtree(doc, doc.root, subtree.nodes, subtree.rootId, -1);
    return normalizeDocument(doc);
  }, [visible, presetKey, presetInput]);

  const ctx = useMemo<RenderContext | null>(() => {
    if (!document) return null;
    return {
      ...baseCtx,
      document,
      // Editor mode, but with no breakpoint simulation: the thumbnail is laid
      // out at VIRTUAL_WIDTH, so forcing the canvas's mobile/tablet styles
      // here would contradict the width it is actually rendered at.
      editor: true,
      previewBreakpoint: undefined,
    };
  }, [baseCtx, document]);

  const scale = width > 0 ? width / VIRTUAL_WIDTH : 0;

  return (
    <div
      ref={boxRef}
      aria-hidden
      className="relative w-full overflow-hidden rounded bg-slate-50"
      style={{ height: THUMB_HEIGHT }}
    >
      {ctx && scale > 0 && (
        <div
          style={{
            width: VIRTUAL_WIDTH,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            // The thumbnail is decoration for the button that wraps it; it must
            // never swallow the click or the drag.
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <SiteRenderer ctx={ctx} scope={PREVIEW_SCOPE} />
        </div>
      )}
    </div>
  );
}
