"use client";

/**
 * Full-screen template preview.
 *
 * The decision a tenant is making here — "is this the right template for my
 * business?" — cannot be made from a thumbnail, so this shows the real thing at
 * real device widths, with every page of the template reachable. Device widths
 * are genuine viewport widths rather than CSS-transform fakery, so the
 * template's own responsive breakpoints do the work and what you see is what
 * publishes.
 */

import { useEffect, useState } from "react";
import { Loader2, Monitor, Smartphone, Tablet, X } from "lucide-react";
import type { SiteTemplateDto } from "@/lib/api/site";
import { LiveTemplateFrame } from "./live-template-frame";
import { cn } from "@/lib/utils";

type Device = "desktop" | "tablet" | "mobile";

const DEVICES: Record<Device, { label: string; width: number; height: number; icon: typeof Monitor }> = {
  desktop: { label: "Desktop", width: 1440, height: 900, icon: Monitor },
  tablet: { label: "Tablet", width: 834, height: 1112, icon: Tablet },
  mobile: { label: "Mobile", width: 390, height: 844, icon: Smartphone },
};

export function TemplatePreviewModal({
  template,
  busy,
  onClose,
  onUse,
}: {
  template: SiteTemplateDto;
  busy: boolean;
  onClose: () => void;
  onUse: () => void;
}) {
  const [device, setDevice] = useState<Device>("desktop");
  const [path, setPath] = useState(
    () => template.pages.find((p) => p.isHome)?.path ?? template.pages[0]?.path ?? "/",
  );

  // Escape closes, and the page behind must not scroll while the overlay is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const { width, height } = DEVICES[device];
  const src = `${template.previewUrl}${path === "/" ? "" : path}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${template.name} template preview`}
      className="fixed inset-0 z-[70] flex flex-col bg-slate-900/80 backdrop-blur-sm"
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-white">{template.name}</h2>
            {template.isPremium && (
              <span className="shrink-0 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-300">
                Pro
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-slate-400">
            {template.pageCount} page{template.pageCount === 1 ? "" : "s"}
            {template.industry ? ` · ${template.industry}` : ""} · Preview uses sample content
          </p>
        </div>

        {/* Device switcher */}
        <div className="flex items-center gap-0.5 rounded-lg bg-slate-800 p-0.5">
          {(Object.keys(DEVICES) as Device[]).map((key) => {
            const { label, icon: Icon } = DEVICES[key];
            return (
              <button
                key={key}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={device === key}
                onClick={() => setDevice(key)}
                className={cn(
                  "rounded-md p-1.5 transition-colors",
                  device === key
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={onUse}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-100 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {busy ? "Creating…" : "Use this template"}
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Page switcher */}
      {template.pages.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900/95 px-4 py-2">
          {template.pages.map((page) => (
            <button
              key={page.path}
              type="button"
              onClick={() => setPath(page.path)}
              aria-current={path === page.path}
              className={cn(
                "whitespace-nowrap rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                path === page.path
                  ? "bg-slate-700 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-slate-200",
              )}
            >
              {page.title}
            </button>
          ))}
        </div>
      )}

      {/* Viewport */}
      <div className="flex flex-1 items-start justify-center overflow-auto p-4">
        <div
          className="overflow-hidden rounded-lg bg-white shadow-2xl transition-[width] duration-200"
          style={{
            width: device === "desktop" ? "100%" : width,
            maxWidth: "100%",
            height: device === "desktop" ? "100%" : height,
            minHeight: device === "desktop" ? "100%" : undefined,
          }}
        >
          {device === "desktop" ? (
            // At desktop the available width is already desktop-sized, so the
            // frame renders 1:1 — no scaling, real scrolling, real behaviour.
            <iframe
              key={src}
              src={src}
              title={`${template.name} preview`}
              sandbox="allow-scripts allow-same-origin"
              className="h-full w-full border-0"
            />
          ) : (
            <LiveTemplateFrame
              key={src}
              src={src}
              title={`${template.name} preview`}
              designWidth={width}
              designHeight={height}
              fit="width"
              interactive
              eager
              className="h-full w-full"
            />
          )}
        </div>
      </div>
    </div>
  );
}
