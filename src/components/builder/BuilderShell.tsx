"use client";

/**
 * Builder shell — the three-column editor.
 *
 * Owns the layout, the page switcher, the toolbar, and the wiring between the
 * panels and the editor state. Deliberately the only place that knows about
 * both the API client and the editor kernel, so the panels stay presentational
 * and testable.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  BadgeCheck,
  ChevronDown,
  ClipboardList,
  ExternalLink,
  Eye,
  Globe,
  Inbox,
  Layers,
  Loader2,
  Monitor,
  Plus,
  Redo2,
  Save,
  Settings2,
  Smartphone,
  Sparkles,
  Tablet,
  Undo2,
  ZoomIn,
  ZoomOut,
  Keyboard,
  Maximize2,
} from "lucide-react";
import {
  siteApi,
  siteFormApi,
  type AuditResultDto,
  type SiteDetailDto,
  type SiteFormDto,
  type SitePageDto,
} from "@/lib/api/site";
import { ApiClientError } from "@/lib/fetcher";
import { resolveStyle } from "@/site/document/operations";
import type {
  Breakpoint,
  NodeId,
  RenderContext,
  SiteRenderData,
  ThemeTokens,
} from "@/site/document/types";
import { cn } from "@/lib/utils";
import { useEditorState } from "./useEditorState";
import { Canvas } from "./Canvas";
import { LayersPanel } from "./LayersPanel";
import { Inspector } from "./Inspector";
import { AddPanel } from "./AddPanel";
import { AiChat } from "./AiChat";
import { ThemePanel } from "./ThemePanel";
import { AuditPanel } from "./AuditPanel";
import { ShortcutsDialog } from "./ShortcutsDialog";
import { NewPageDialog } from "./NewPageDialog";

export interface BuilderShellProps {
  site: SiteDetailDto;
  page: SitePageDto;
  /** Preview data for the smart components on the canvas. */
  renderData: SiteRenderData;
}

type LeftTab = "add" | "layers" | "pages";
type RightTab = "design" | "ai" | "theme" | "audit";

// Includes steps above 100% so fine adjustments to spacing and small text are
// actually visible; the previous ceiling of 1 made that guesswork.
const ZOOM_STEPS = [0.4, 0.5, 0.65, 0.8, 0.9, 1, 1.25, 1.5];

/** Nearest step to an arbitrary zoom, so "fit" lands on a real stop. */
function nearestZoomStep(value: number): number {
  return ZOOM_STEPS.reduce((best, step) =>
    Math.abs(step - value) < Math.abs(best - value) ? step : best,
  );
}

/** Canvas width the breakpoint simulates, used to compute fit-to-window. */
const BREAKPOINT_WIDTH: Record<Breakpoint, number> = {
  base: 1280,
  tablet: 834,
  mobile: 390,
};

export function BuilderShell({ site: initialSite, page: initialPage, renderData }: BuilderShellProps) {
  const [site, setSite] = useState(initialSite);
  const [page, setPage] = useState(initialPage);
  const [leftTab, setLeftTab] = useState<LeftTab>("add");
  const [rightTab, setRightTab] = useState<RightTab>("design");
  const [zoom, setZoom] = useState(1);
  const [theme, setTheme] = useState<ThemeTokens>(initialSite.theme);
  const [themeSaving, setThemeSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [audit, setAudit] = useState<AuditResultDto | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [switchingPage, setSwitchingPage] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [newPageOpen, setNewPageOpen] = useState(false);
  /** Prompt queued by the audit panel for the AI chat to pick up. */
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);
  /** Forms available to point a Form block at, loaded once for the inspector. */
  const [forms, setForms] = useState<SiteFormDto[]>([]);

  useEffect(() => {
    let active = true;
    void siteFormApi
      .listForms(initialSite.id)
      .then((list) => active && setForms(list))
      // A failed form list only degrades the Form block's dropdown, so it must
      // not surface an error over the whole editor.
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [initialSite.id]);

  const presetInput = useMemo(
    () => ({
      businessName: site.brand.businessName ?? site.name,
      phone: site.brand.phone,
      whatsapp: site.brand.whatsapp,
      email: site.brand.email,
      address: site.brand.address,
      ...(site.locationId ? { locationId: site.locationId } : {}),
    }),
    [site],
  );

  // -----------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------

  const onSave = useCallback(
    async (document: Parameters<typeof siteApi.savePage>[2]["document"], autosave: boolean, expectedVersion: string) => {
      const result = await siteApi.savePage(site.id, page.id, {
        document,
        expectedVersion,
        autosave,
      });
      // The server repairs invalid props rather than rejecting the save; tell
      // the user when it had to, so a silent correction is never a surprise.
      if (result.corrected.length > 0 && !autosave) {
        toast.warning(`Fixed ${result.corrected.length} element(s) with invalid settings`);
      }
      return result.version;
    },
    [site.id, page.id],
  );

  const editor = useEditorState({
    initialDocument: initialPage.document,
    initialVersion: initialPage.version,
    onSave,
    presetInput,
  });

  // -----------------------------------------------------------------
  // Zoom
  // -----------------------------------------------------------------

  const stepZoom = useCallback((direction: 1 | -1) => {
    setZoom((current) => {
      const index = ZOOM_STEPS.indexOf(nearestZoomStep(current));
      const next = Math.min(Math.max(index + direction, 0), ZOOM_STEPS.length - 1);
      return ZOOM_STEPS[next];
    });
  }, []);

  /**
   * Scale the simulated viewport to the space actually available.
   *
   * Derived from the window minus the two rails rather than measured from a
   * canvas ref, which keeps this a pure calculation instead of a layout read on
   * every breakpoint change. Rail widths are w-64 + w-72 plus the canvas gutter.
   */
  const fitZoom = useCallback(() => {
    const available = window.innerWidth - 256 - 288 - 64;
    const target = available / BREAKPOINT_WIDTH[editor.breakpoint];
    // Never scale a narrow breakpoint up past 100%: a mobile frame blown up to
    // 300% tells you nothing useful about how the page really looks.
    setZoom(nearestZoomStep(Math.min(target, 1)));
  }, [editor.breakpoint]);

  // View shortcuts. Kept here rather than in useEditorState because zoom and
  // the help overlay are shell concerns — the editor kernel owns the document,
  // not the chrome around it. Mirrors the kernel's rule of never firing while
  // the user is typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
        return;
      }

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // "+" arrives as "=" on most layouts unshifted.
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        stepZoom(1);
      } else if (e.key === "-") {
        e.preventDefault();
        stepZoom(-1);
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom(1);
      } else if (e.key === "1") {
        e.preventDefault();
        fitZoom();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [stepZoom, fitZoom]);

  // -----------------------------------------------------------------
  // Render context for the canvas
  // -----------------------------------------------------------------

  const ctx: RenderContext = useMemo(
    () => ({
      document: editor.document,
      theme,
      brand: site.brand,
      pages: site.pages.map((p) => ({
        id: p.id,
        title: p.title,
        path: p.path,
        hiddenInNav: p.hiddenInNav,
      })),
      basePath: site.previewPath,
      data: renderData,
      editor: true,
      previewBreakpoint: editor.breakpoint,
    }),
    [editor.document, editor.breakpoint, theme, site, renderData],
  );

  // -----------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------

  const patchTheme = useCallback(
    async (patch: Record<string, unknown>) => {
      setThemeSaving(true);
      try {
        const next = await siteApi.updateTheme(site.id, patch);
        setTheme(next);
        setSite((prev) => ({ ...prev, theme: next }));
      } catch (err) {
        toast.error(err instanceof ApiClientError ? err.message : "Could not update the theme");
      } finally {
        setThemeSaving(false);
      }
    },
    [site.id],
  );

  const switchPage = useCallback(
    async (pageId: string) => {
      if (pageId === page.id) return;
      // Flush pending edits first; switching would otherwise drop them.
      if (editor.saveState === "dirty") await editor.save(false);

      setSwitchingPage(true);
      try {
        const next = await siteApi.getPage(site.id, pageId);
        setPage(next);
        editor.resetTo(next.document, next.version);
        setAudit(null);
      } catch (err) {
        toast.error(err instanceof ApiClientError ? err.message : "Could not open that page");
      } finally {
        setSwitchingPage(false);
      }
    },
    [site.id, page.id, editor],
  );

  const publish = useCallback(async () => {
    if (editor.saveState === "dirty") await editor.save(false);
    setPublishing(true);
    try {
      const result = await siteApi.publish(site.id);
      setSite((prev) => ({
        ...prev,
        status: result.status,
        publishedAt: result.publishedAt,
        publicUrl: result.publicUrl,
      }));
      toast.success(`Published ${result.pagesPublished} page(s)`, {
        description: result.publicUrl,
        action: {
          label: "View",
          onClick: () => window.open(result.publicUrl, "_blank", "noopener"),
        },
      });
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not publish");
    } finally {
      setPublishing(false);
    }
  }, [site.id, editor]);

  const runAudit = useCallback(async () => {
    setAuditLoading(true);
    try {
      setAudit(await siteApi.audit(site.id, page.id));
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not run the audit");
    } finally {
      setAuditLoading(false);
    }
  }, [site.id, page.id]);

  // Audit lazily, only when the tab is first opened.
  useEffect(() => {
    if (rightTab === "audit" && !audit && !auditLoading) void runAudit();
  }, [rightTab, audit, auditLoading, runAudit]);

  const revertRevision = useCallback(
    async (revisionId: string) => {
      try {
        await siteApi.rollback(site.id, revisionId);
        const next = await siteApi.getPage(site.id, page.id);
        setPage(next);
        editor.resetTo(next.document, next.version);
        const detail = await siteApi.get(site.id);
        setTheme(detail.theme);
        setSite(detail);
        toast.success("Change reverted");
      } catch (err) {
        toast.error(err instanceof ApiClientError ? err.message : "Could not revert");
      }
    },
    [site.id, page.id, editor],
  );

  const resolvedStyle = editor.selectedNode
    ? resolveStyle(editor.selectedNode, editor.breakpoint)
    : {};

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-900">
      {/* ---------------- Toolbar ---------------- */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3">
        <Link
          href="/dashboard/website"
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Websites
        </Link>

        <div className="h-5 w-px bg-slate-200" />

        <PageSwitcher
          pages={site.pages}
          currentId={page.id}
          busy={switchingPage}
          onSelect={switchPage}
          onRequestCreate={() => setNewPageOpen(true)}
        />

        <div className="ml-1 flex items-center gap-0.5">
          <ToolbarButton
            title="Undo (Ctrl+Z)"
            disabled={!editor.canUndo}
            onClick={editor.undo}
          >
            <Undo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
          <ToolbarButton
            title="Redo (Ctrl+Shift+Z)"
            disabled={!editor.canRedo}
            onClick={editor.redo}
          >
            <Redo2 className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>

        {editor.selectedIds.length > 1 && (
          <span className="flex items-center gap-1.5 rounded-md bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-700">
            {editor.selectedIds.length} selected
            <button
              type="button"
              onClick={() => editor.clearSelection()}
              className="rounded-full px-1 text-violet-500 hover:bg-violet-100 hover:text-violet-700"
              aria-label="Clear selection"
            >
              ×
            </button>
          </span>
        )}

        <div className="mx-auto flex items-center gap-2">
          <div className="flex rounded-md bg-slate-100 p-0.5">
            {(
              [
                ["base", Monitor, "Desktop"],
                ["tablet", Tablet, "Tablet"],
                ["mobile", Smartphone, "Mobile"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={editor.breakpoint === value}
                onClick={() => editor.setBreakpoint(value as Breakpoint)}
                className={cn(
                  "rounded px-2 py-1 transition-colors",
                  editor.breakpoint === value
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-0.5">
            <ToolbarButton title="Zoom out (Ctrl -)" onClick={() => stepZoom(-1)}>
              <ZoomOut className="h-3.5 w-3.5" />
            </ToolbarButton>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title="Reset zoom to 100% (Ctrl 0)"
              className="w-10 rounded text-center text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              {Math.round(zoom * 100)}%
            </button>
            <ToolbarButton title="Zoom in (Ctrl +)" onClick={() => stepZoom(1)}>
              <ZoomIn className="h-3.5 w-3.5" />
            </ToolbarButton>
            <ToolbarButton title="Fit page to window (Ctrl 1)" onClick={fitZoom}>
              <Maximize2 className="h-3.5 w-3.5" />
            </ToolbarButton>
          </div>
        </div>

        <SaveIndicator state={editor.saveState} error={editor.saveError} />

        <button
          type="button"
          onClick={() => void editor.save(false)}
          disabled={editor.saveState === "saving"}
          className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          Save
        </button>

        <a
          href={`${site.previewPath}${page.path === "/" ? "" : page.path}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </a>

        <ToolbarButton title="Keyboard shortcuts (?)" onClick={() => setShortcutsOpen(true)}>
          <Keyboard className="h-3.5 w-3.5" />
        </ToolbarButton>

        <button
          type="button"
          onClick={() => void publish()}
          disabled={publishing}
          className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {publishing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Globe className="h-3.5 w-3.5" />
          )}
          {site.status === "PUBLISHED" ? "Republish" : "Publish"}
        </button>
      </header>

      {/* ---------------- Body ---------------- */}
      <div className="flex min-h-0 flex-1">
        {/* Left rail */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="flex shrink-0 border-b border-slate-200">
            {(
              [
                ["add", Plus, "Add"],
                ["layers", Layers, "Layers"],
                ["pages", Settings2, "Pages"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setLeftTab(value as LeftTab)}
                aria-pressed={leftTab === value}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  leftTab === value
                    ? "border-b-2 border-blue-600 text-blue-700"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {leftTab === "add" && (
              <AddPanel
                onAddSection={editor.addSection}
                onAddComponent={(type) => editor.addComponent(type)}
              />
            )}
            {leftTab === "layers" && (
              <LayersPanel
                document={editor.document}
                selectedId={editor.selectedId}
                onSelect={editor.select}
                onHover={editor.hover}
                onMove={editor.move}
                onToggle={editor.toggle}
              />
            )}
            {leftTab === "pages" && (
              <PagesPanel
                siteId={site.id}
                pages={site.pages}
                currentId={page.id}
                onSelect={switchPage}
                onChanged={async () => setSite(await siteApi.get(site.id))}
              />
            )}
          </div>
        </aside>

        {/* Canvas */}
        <Canvas
          ctx={ctx}
          document={editor.document}
          selectedId={editor.selectedId}
          selectedIds={editor.selectedIds}
          hoveredId={editor.hoveredId}
          breakpoint={editor.breakpoint}
          zoom={zoom}
          onSelect={editor.select}
          onToggleSelect={editor.toggleSelect}
          onHover={editor.hover}
          onMove={editor.move}
          onDropNew={(type, parentId, index) => editor.addComponent(type, parentId, index)}
          onDelete={editor.remove}
          onDeleteSelected={editor.removeSelected}
          onDuplicate={editor.duplicate}
          onDuplicateSelected={editor.duplicateSelected}
          onNudge={editor.nudge}
          onInlineEdit={(id, prop, value) => editor.updateProps(id, { [prop]: value })}
          onCopy={(ids) => editor.copySelection(ids)}
          onCut={editor.cutSelection}
          onPaste={editor.paste}
          onGroup={editor.group}
          onUngroup={editor.ungroup}
          onToggleFlag={editor.toggle}
          emptyState={
            <EmptyPageHint
              onAddSection={(preset) => editor.addSection(preset)}
              onBrowse={() => setLeftTab("add")}
            />
          }
        />

        {/* Right rail */}
        <aside className="flex w-72 shrink-0 flex-col border-l border-slate-200 bg-white">
          <div className="flex shrink-0 border-b border-slate-200">
            {(
              [
                ["design", Settings2, "Design"],
                ["ai", Sparkles, "AI"],
                ["theme", Monitor, "Theme"],
                ["audit", BadgeCheck, "Optimise"],
              ] as const
            ).map(([value, Icon, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setRightTab(value as RightTab)}
                aria-pressed={rightTab === value}
                title={label}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                  rightTab === value
                    ? "border-b-2 border-blue-600 text-blue-700"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden xl:inline">{label}</span>
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {rightTab === "design" &&
              (editor.selectedNode ? (
                <>
                  {editor.breadcrumb.length > 1 && (
                    <nav className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 px-3 py-2 text-[10px] text-slate-400">
                      {editor.breadcrumb.map((crumb, i) => (
                        <span key={crumb.id} className="flex items-center gap-0.5">
                          {i > 0 && <span>/</span>}
                          <button
                            type="button"
                            onClick={() => editor.select(crumb.id)}
                            className={cn(
                              "rounded px-1 hover:bg-slate-100",
                              i === editor.breadcrumb.length - 1 && "font-semibold text-slate-700",
                            )}
                          >
                            {crumb.label}
                          </button>
                        </span>
                      ))}
                    </nav>
                  )}
                  <Inspector
                    node={editor.selectedNode}
                    breakpoint={editor.breakpoint}
                    resolvedStyle={resolvedStyle}
                    onUpdateProps={(props) => editor.updateProps(editor.selectedId!, props)}
                    onUpdateStyle={(patch) => editor.updateStyle(editor.selectedId!, patch)}
                    onUpdateNode={(patch) => editor.updateNode(editor.selectedId!, patch)}
                    options={{
                      forms: forms.map((f) => ({ id: f.id, name: f.name })),
                      locations: site.locationId
                        ? [{ id: site.locationId, name: "Linked location" }]
                        : [],
                    }}
                  />
                </>
              ) : (
                <p className="px-3 py-8 text-center text-[11px] leading-relaxed text-slate-500">
                  Select something on the canvas to edit it, or double-click text to type directly.
                </p>
              ))}

            {rightTab === "ai" && (
              <AiChat
                siteId={site.id}
                pageId={page.id}
                pageTitle={page.title}
                onDocument={(document, version) =>
                  editor.replaceDocument(document, {
                    markDirty: false,
                    newVersion: version ?? undefined,
                  })
                }
                onTheme={(next) => {
                  setTheme(next);
                  setSite((prev) => ({ ...prev, theme: next }));
                }}
                onRevision={revertRevision}
                injectedPrompt={queuedPrompt}
                onInjectedConsumed={() => setQueuedPrompt(null)}
              />
            )}

            {rightTab === "theme" && (
              <ThemePanel theme={theme} saving={themeSaving} onPatch={patchTheme} />
            )}

            {rightTab === "audit" && (
              <AuditPanel
                result={audit}
                loading={auditLoading}
                onRefresh={runAudit}
                onSelectNode={(id: NodeId) => {
                  editor.select(id);
                  setRightTab("design");
                }}
                onAutoFix={(prompt) => {
                  // Queue first, then switch tabs: AiChat picks the prompt up
                  // from props on mount.
                  setQueuedPrompt(prompt);
                  setRightTab("ai");
                  toast.info("Sent to the AI assistant", { description: prompt });
                }}
              />
            )}
          </div>
        </aside>
      </div>

      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}

      {newPageOpen && (
        <NewPageDialog
          existingPaths={site.pages.map((p) => p.path)}
          onClose={() => setNewPageOpen(false)}
          onCreate={async (input) => {
            try {
              const created = await siteApi.createPage(site.id, input);
              const detail = await siteApi.get(site.id);
              setSite(detail);
              setNewPageOpen(false);
              await switchPage(created.id);
              toast.success(`Added "${input.title}"`, {
                description: `Now editing ${input.path}`,
              });
            } catch (err) {
              // Left open so the entered values survive a failure.
              toast.error(
                err instanceof ApiClientError ? err.message : "Could not create the page",
              );
            }
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// Empty page
// =====================================================================

/**
 * Shown on the canvas when a page has nothing on it.
 *
 * Offers the two things people actually want at that moment — put a hero at the
 * top, or go and look at what's available — rather than only telling them the
 * page is empty. The suggested presets are the ones almost every page starts
 * with, so the common path is a single click.
 */
function EmptyPageHint({
  onAddSection,
  onBrowse,
}: {
  onAddSection: (preset: string) => void;
  onBrowse: () => void;
}) {
  const suggestions: Array<{ preset: string; label: string }> = [
    { preset: "navbar", label: "Navigation bar" },
    { preset: "hero-split", label: "Hero" },
    { preset: "services", label: "Services" },
    { preset: "contact", label: "Contact form" },
  ];

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="rounded-full bg-slate-100 p-3">
        <Layers className="h-6 w-6 text-slate-400" />
      </div>
      <div>
        <h2 className="text-base font-semibold text-slate-800">This page is empty</h2>
        <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
          Add a section to get started. You can drag components in from the left panel too, and
          change anything afterwards.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {suggestions.map((item) => (
          <button
            key={item.preset}
            type="button"
            onClick={() => onAddSection(item.preset)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            <Plus className="h-3 w-3" />
            {item.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={onBrowse}
        className="text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline"
      >
        Browse all sections
      </button>
    </div>
  );
}

// =====================================================================
// Toolbar pieces
// =====================================================================

function ToolbarButton({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

function SaveIndicator({
  state,
  error,
}: {
  state: ReturnType<typeof useEditorState>["saveState"];
  error: string | null;
}) {
  const content: Record<string, { label: string; className: string }> = {
    idle: { label: "", className: "" },
    dirty: { label: "Unsaved changes", className: "text-amber-600" },
    saving: { label: "Saving…", className: "text-slate-500" },
    saved: { label: "All changes saved", className: "text-emerald-600" },
    conflict: { label: "Changed elsewhere — reload", className: "text-red-600" },
    error: { label: error ?? "Save failed", className: "text-red-600" },
  };
  const current = content[state];
  if (!current.label) return null;

  return (
    <span className={cn("mr-1 max-w-[180px] truncate text-[11px] font-medium", current.className)}>
      {current.label}
    </span>
  );
}

function PageSwitcher({
  pages,
  currentId,
  busy,
  onSelect,
  onRequestCreate,
}: {
  pages: SiteDetailDto["pages"];
  currentId: string;
  busy: boolean;
  onSelect: (id: string) => void;
  onRequestCreate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const current = pages.find((p) => p.id === currentId);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-100"
      >
        {busy && <Loader2 className="h-3 w-3 animate-spin" />}
        <span className="max-w-[140px] truncate">{current?.title ?? "Page"}</span>
        <ChevronDown className="h-3 w-3 text-slate-400" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
            {pages.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setOpen(false);
                  onSelect(p.id);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-slate-50",
                  p.id === currentId && "bg-blue-50 text-blue-700",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{p.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-slate-400">{p.path}</span>
              </button>
            ))}
            <div className="my-1 border-t border-slate-100" />
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onRequestCreate();
              }}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
            >
              <Plus className="h-3 w-3" />
              New page
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function PagesPanel({
  siteId,
  pages,
  currentId,
  onSelect,
  onChanged,
}: {
  siteId: string;
  pages: SiteDetailDto["pages"];
  currentId: string;
  onSelect: (id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (id: string, action: () => Promise<unknown>, success: string) => {
    setBusy(id);
    try {
      await action();
      await onChanged();
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-2">
      <h4 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Pages ({pages.length})
      </h4>
      <div className="space-y-1">
        {pages.map((p) => (
          <div
            key={p.id}
            className={cn(
              "rounded-md border px-2 py-2",
              p.id === currentId ? "border-blue-300 bg-blue-50" : "border-slate-200",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              className="block w-full text-left"
            >
              <span className="flex items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-800">
                  {p.title}
                </span>
                {p.isHome && (
                  <span className="rounded bg-slate-200 px-1 text-[9px] font-semibold uppercase text-slate-600">
                    Home
                  </span>
                )}
                {p.status === "PUBLISHED" && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" title="Published" />
                )}
              </span>
              <span className="mt-0.5 block truncate font-mono text-[10px] text-slate-400">
                {p.path}
              </span>
            </button>

            <div className="mt-1.5 flex items-center gap-1.5 text-[10px]">
              {!p.isHome && (
                <>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() =>
                      void act(
                        p.id,
                        () => siteApi.updatePage(siteId, p.id, { hiddenInNav: !p.hiddenInNav }),
                        p.hiddenInNav ? "Shown in navigation" : "Hidden from navigation",
                      )
                    }
                    className="text-slate-500 hover:text-slate-800"
                  >
                    {p.hiddenInNav ? "Show in nav" : "Hide from nav"}
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    disabled={busy === p.id}
                    onClick={() => {
                      if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
                      void act(p.id, () => siteApi.deletePage(siteId, p.id), "Page deleted");
                    }}
                    className="text-slate-500 hover:text-red-600"
                  >
                    Delete
                  </button>
                </>
              )}
              {busy === p.id && <Loader2 className="h-2.5 w-2.5 animate-spin text-slate-400" />}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 space-y-1">
        <Link
          href={`/dashboard/website/${siteId}/leads`}
          className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 px-2 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
        >
          <Inbox className="h-3 w-3" />
          Leads
        </Link>
        <Link
          href={`/dashboard/website/${siteId}/forms`}
          className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 px-2 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
        >
          <ClipboardList className="h-3 w-3" />
          Forms
        </Link>
        <Link
          href={`/dashboard/website/${siteId}/domains`}
          className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 px-2 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink className="h-3 w-3" />
          Domains & SSL
        </Link>
      </div>
    </div>
  );
}
