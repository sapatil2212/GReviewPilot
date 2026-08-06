"use client";

/**
 * Template gallery.
 *
 * Always visible on the websites page rather than hidden behind a "create"
 * mode: browsing finished designs is how people decide what they want, and a
 * gallery you have to go looking for is a gallery nobody sees. Every business
 * type ships a template (seeded from the industry blueprints in
 * prisma/seeds/siteTemplates.ts), so the grid is the product tour as well as
 * the entry point.
 *
 * Filtering is client-side on purpose: the catalog is small enough to send in
 * one request, and instant search beats a round trip per keystroke.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Eye, LayoutTemplate, RefreshCw, Search, X } from "lucide-react";
import { useApi } from "@/lib/api/useApi";
import { siteTemplateApi, type SiteTemplateDto } from "@/lib/api/site";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LiveTemplateFrame } from "./live-template-frame";
import { TemplatePreviewModal } from "./template-preview-modal";
import { UseTemplateDialog } from "./use-template-dialog";
import { cn } from "@/lib/utils";

/** Number of templates shown before the user has to hit "Show more". */
const PAGE_SIZE = 6;

export function TemplateGallery({
  onCreated,
}: {
  /** Called after a site is created so the parent can refresh its list. */
  onCreated?: () => void;
}) {
  const { data, loading, error, refresh } = useApi(() => siteTemplateApi.list(), []);
  // Memoised so the `?? []` fallback doesn't produce a new array identity on
  // every render and invalidate the filter/industry memos below.
  const templates = useMemo(() => data ?? [], [data]);

  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState<string>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [previewing, setPreviewing] = useState<SiteTemplateDto | null>(null);
  const [choosing, setChoosing] = useState<SiteTemplateDto | null>(null);
  const [creating, setCreating] = useState(false);

  // Collapse back to the first page whenever the search or filter changes,
  // so "Show more" always starts from a predictable spot.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, industry]);

  const industries = useMemo(() => {
    const seen = new Set<string>();
    for (const t of templates) if (t.industry) seen.add(t.industry);
    return Array.from(seen).sort((a, b) => a.localeCompare(b));
  }, [templates]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return templates.filter((t) => {
      if (industry !== "all" && t.industry !== industry) return false;
      if (!q) return true;
      // Match the page titles too, so "booking" surfaces templates that have a
      // booking page even when the name and description don't mention it.
      return (
        t.name.toLowerCase().includes(q) ||
        (t.industry ?? "").toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.pages.some((p) => p.title.toLowerCase().includes(q))
      );
    });
  }, [templates, search, industry]);

  // Only render a handful at a time; the rest load in on "Show more" so the
  // page stays a template picker instead of turning into a long scroll.
  const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);
  const hasMore = visibleCount < filtered.length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 lg:max-w-lg">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <LayoutTemplate className="h-4 w-4 text-blue-600" />
            Website templates
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            A complete, ready-to-edit website for every business type. Preview one, then customise
            everything — copy, colours, images, and pages — in the editor.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2 lg:ml-auto">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates…"
              aria-label="Search templates"
              className="w-40 rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs focus:border-blue-500 focus:outline-none sm:w-56"
            />
          </div>

          {industries.length > 1 && (
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger
                aria-label="Filter by business type"
                className="h-auto w-auto min-w-[8.5rem] gap-1.5 rounded-lg border-slate-200 py-1.5 px-2.5 text-xs shadow-none focus:ring-blue-500"
              >
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types ({templates.length})</SelectItem>
                {industries.map((name) => {
                  const count = templates.filter((t) => t.industry === name).length;
                  return (
                    <SelectItem key={name} value={name}>
                      {name} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}

          <button
            type="button"
            onClick={refresh}
            title="Reload templates"
            aria-label="Reload templates"
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </header>

      <div className="p-5">
        {loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-slate-200">
                <div className="aspect-[4/3] animate-pulse bg-slate-100" />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-2/3 animate-pulse rounded bg-slate-100" />
                  <div className="h-2.5 w-full animate-pulse rounded bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Could not load templates</p>
              <p className="mt-0.5 text-xs">{error.message}</p>
              <button
                type="button"
                onClick={refresh}
                className="mt-2 rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 hover:bg-red-50"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {!loading && !error && templates.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center">
            <LayoutTemplate className="mx-auto h-8 w-8 text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-800">No templates installed</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-slate-500">
              The template catalog has not been seeded for this environment yet. Run{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">
                npm run db:seed:templates
              </code>{" "}
              to install one template per business type.
            </p>
          </div>
        )}

        {!loading && !error && templates.length > 0 && filtered.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center">
            <Search className="mx-auto h-7 w-7 text-slate-300" />
            <h3 className="mt-3 text-sm font-semibold text-slate-800">No matching templates</h3>
            <p className="mt-1 text-xs text-slate-500">
              Nothing matches {search ? `“${search}”` : "this filter"}.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setIndustry("all");
              }}
              className="mt-3 inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <X className="h-3 w-3" />
              Clear filters
            </button>
          </div>
        )}

        {visible.length > 0 && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visible.map((template) => (
                <TemplateCard
                  key={template.id}
                  template={template}
                  onPreview={() => setPreviewing(template)}
                  onUse={() => setChoosing(template)}
                />
              ))}
            </div>

            {hasMore && (
              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Show more ({filtered.length - visible.length} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {previewing && (
        <TemplatePreviewModal
          template={previewing}
          busy={creating}
          onClose={() => setPreviewing(null)}
          onUse={() => setChoosing(previewing)}
        />
      )}

      {choosing && (
        <UseTemplateDialog
          template={choosing}
          onBusyChange={setCreating}
          onClose={() => setChoosing(null)}
          onCreated={() => {
            setChoosing(null);
            setPreviewing(null);
            onCreated?.();
          }}
        />
      )}
    </section>
  );
}

// =====================================================================
// Card
// =====================================================================

function TemplateCard({
  template,
  onPreview,
  onUse,
}: {
  template: SiteTemplateDto;
  onPreview: () => void;
  onUse: () => void;
}) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 transition-all hover:border-blue-300 hover:shadow-lg">
      <div className="relative aspect-[4/3] border-b border-slate-100">
        <LiveTemplateFrame
          src={template.previewUrl}
          title={`${template.name} template preview`}
          className="h-full w-full"
          fallback={<TemplateCardFallback template={template} />}
        />

        {/* Hover actions. Also revealed on keyboard focus so the card is
            operable without a pointer. */}
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-slate-900/0 opacity-0 transition-all group-hover:bg-slate-900/40 group-hover:opacity-100 focus-within:bg-slate-900/40 focus-within:opacity-100">
          <button
            type="button"
            onClick={onPreview}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow hover:bg-slate-100"
          >
            <Eye className="h-3.5 w-3.5" />
            Preview
          </button>
          <button
            type="button"
            onClick={onUse}
            className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700"
          >
            Use template
          </button>
        </div>

        {template.isPremium && (
          <span className="absolute left-2 top-2 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-950 shadow">
            Pro
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-sm font-semibold text-slate-900">{template.name}</h3>
          <div className="flex shrink-0 items-center gap-0.5" aria-hidden>
            {[template.colors.primary, template.colors.secondary, template.colors.accent].map(
              (color, i) => (
                <span
                  key={i}
                  className="h-3 w-3 rounded-full ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: color }}
                />
              ),
            )}
          </div>
        </div>

        <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
          {template.description ?? `${template.pageCount} ready-to-edit pages.`}
        </p>

        <div className="mt-2 flex flex-wrap gap-1">
          {template.pages.slice(0, 4).map((page) => (
            <span
              key={page.path}
              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
            >
              {page.title}
            </span>
          ))}
          {template.pages.length > 4 && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              +{template.pages.length - 4}
            </span>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * Shown when a live frame can't load. Built from the template's own palette so
 * the card still communicates the design's colour direction and stays
 * clickable — "Preview" and "Use template" work regardless.
 */
function TemplateCardFallback({ template }: { template: SiteTemplateDto }) {
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center"
      style={{
        background: `linear-gradient(135deg, ${template.colors.primary} 0%, ${template.colors.secondary} 100%)`,
      }}
    >
      <LayoutTemplate className="h-6 w-6 text-white/80" />
      <span className="text-sm font-semibold text-white drop-shadow-sm">{template.name}</span>
      <span className="text-[10px] font-medium text-white/80">
        {template.pageCount} page{template.pageCount === 1 ? "" : "s"} · open preview to view
      </span>
    </div>
  );
}

