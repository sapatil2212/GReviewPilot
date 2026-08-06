"use client";

/**
 * Websites list + template gallery.
 *
 * The gallery is rendered inline and always visible rather than behind a
 * "create" mode. Every business type ships a finished, editable template, and
 * seeing those designs is what tells a non-technical owner the product can
 * build the site they want — hiding them behind a button hides the value.
 *
 * "Create with AI" stays available as a secondary path for anyone who would
 * rather start from a generated draft than a template.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Globe,
  Inbox,
  LayoutTemplate,
  Loader2,
  MoreVertical,
  Pencil,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useApi } from "@/lib/api/useApi";
import { siteApi, type SiteListItemDto } from "@/lib/api/site";
import { ApiClientError } from "@/lib/fetcher";
import { listBlueprints } from "@/site/ai/blueprints";
import { TemplateGallery } from "./_components/template-gallery";
import { cn } from "@/lib/utils";

/**
 * Where the create-with-AI flow currently is.
 *
 * Tracked as a phase rather than a boolean because the flow is two requests
 * (create the site row, then generate its pages) and the second one can fail
 * on its own — after the first has already succeeded. That intermediate state
 * needs to be representable, or the user is left with a site they cannot see.
 */
type BuildPhase = "idle" | "creating" | "generating" | "failed";

export default function WebsitesPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<BuildPhase>("idle");
  /**
   * Set as soon as the site row exists. Kept after a failed generation so a
   * retry regenerates THAT site instead of creating another one — without it,
   * every retry left another half-built site behind.
   */
  const [draftSiteId, setDraftSiteId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [lastBrief, setLastBrief] = useState<AiBrief | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  const { data, loading, error, refresh } = useApi(() => siteApi.list({ pageSize: 50 }), []);

  const sites = data?.items ?? [];

  const focusGallery = () => {
    galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /**
   * Create a site and generate its pages from a brief.
   *
   * Deliberately two requests: the site row must exist before generation so
   * the AI revision has something to attach to, and a failed generation still
   * leaves a real, editable site behind rather than nothing.
   *
   * The important part is what happens when step 2 fails (rate limit, model
   * timeout, dropped connection). The site already exists, so it must be
   * surfaced — otherwise it is invisible in the list and the user re-submits,
   * creating another one every time. On failure we refresh the list, keep the
   * site id for a retry that reuses it, and offer to open the editor.
   */
  const build = async (brief: AiBrief) => {
    // Guard against a double-submit racing a second site into existence.
    if (phase === "creating" || phase === "generating") return;

    setLastBrief(brief);
    setFailure(null);

    let siteId = draftSiteId;

    // Step 1 — create, unless a previous attempt already got this far.
    if (!siteId) {
      setPhase("creating");
      try {
        const site = await siteApi.create({
          name: brief.businessName,
          industry: brief.industry || undefined,
        });
        siteId = site.id;
        setDraftSiteId(site.id);
      } catch (err) {
        setPhase("failed");
        setFailure(
          err instanceof ApiClientError ? err.message : "Could not create the website.",
        );
        return;
      }
    }

    // Step 2 — generate. The site exists from here on, so every exit path
    // below has to account for it.
    setPhase("generating");
    try {
      const result = await siteApi.generate(siteId, {
        prompt: brief.prompt,
        businessName: brief.businessName,
        industry: brief.industry || undefined,
        replaceExisting: true,
      });
      toast.success(
        result.source === "ai"
          ? `Created ${result.pages.length} pages with AI`
          : `Created ${result.pages.length} pages from the ${brief.industry || "local business"} template`,
        { description: result.message },
      );
      setPhase("idle");
      setDraftSiteId(null);
      router.push(`/builder/${siteId}`);
    } catch (err) {
      setPhase("failed");
      setFailure(
        err instanceof ApiClientError
          ? err.message
          : "The website was created, but generating its pages failed.",
      );
      // Make the half-built site visible so it is never a silent orphan.
      refresh();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Websites</h1>
          <p className="mt-1 text-sm text-slate-500">
            Build a fast, SEO-ready website for your business. Start from a template made for your
            business type, or describe your business and let AI draft one.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            // Not a plain toggle: collapsing the panel mid-build would hide the
            // progress and, on failure, the only link to the site just created.
            onClick={() => setAiOpen((v) => (phase === "idle" ? !v : true))}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            <Sparkles className="h-4 w-4" />
            Create with AI
          </button>
          <button
            type="button"
            onClick={focusGallery}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
          >
            <LayoutTemplate className="h-4 w-4" />
            Create Website
          </button>
        </div>
      </div>

      {aiOpen && (
        <BriefPanel
          phase={phase}
          failure={failure}
          canRetry={Boolean(draftSiteId)}
          draftSiteId={draftSiteId}
          initial={lastBrief}
          onCancel={() => {
            setAiOpen(false);
            setPhase("idle");
            setFailure(null);
            setDraftSiteId(null);
          }}
          onSubmit={(brief) => void build(brief)}
        />
      )}

      {/* Your websites */}
      {loading && (
        <div className="flex items-center justify-center py-10 text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading your websites…
        </div>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error.message}
        </div>
      )}

      {!loading && !error && sites.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Your websites
            <span className="ml-1.5 font-normal text-slate-400">({sites.length})</span>
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sites.map((site) => (
              <SiteCard key={site.id} site={site} onChanged={refresh} />
            ))}
          </div>
        </section>
      )}

      {!loading && !error && sites.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-8 text-center">
          <Globe className="mx-auto h-8 w-8 text-slate-300" />
          <h2 className="mt-2 text-sm font-semibold text-slate-800">No websites yet</h2>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Pick a template below to get a complete website in one click — then change the copy,
            colours, and images to match your business.
          </p>
        </div>
      )}

      {/* Template gallery — always visible */}
      <div ref={galleryRef} className="scroll-mt-4">
        <TemplateGallery onCreated={refresh} />
      </div>
    </div>
  );
}

// =====================================================================
// AI brief
// =====================================================================

export interface AiBrief {
  businessName: string;
  industry: string;
  prompt: string;
}

function BriefPanel({
  phase,
  failure,
  canRetry,
  draftSiteId,
  initial,
  onCancel,
  onSubmit,
}: {
  phase: BuildPhase;
  failure: string | null;
  /** True once the site row exists, so a retry regenerates it in place. */
  canRetry: boolean;
  draftSiteId: string | null;
  initial: AiBrief | null;
  onCancel: () => void;
  onSubmit: (input: AiBrief) => void;
}) {
  const [businessName, setBusinessName] = useState(initial?.businessName ?? "");
  const [industry, setIndustry] = useState(initial?.industry ?? "");
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const blueprints = listBlueprints();

  const busy = phase === "creating" || phase === "generating";

  const example = industry
    ? `A modern website for my ${industry.toLowerCase()}. Friendly and trustworthy, with online booking and our Google reviews.`
    : "A modern website for my dental clinic in Pune. Calm and professional, with online appointment booking and our Google reviews.";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!businessName.trim() || busy) return;
        onSubmit({
          businessName: businessName.trim(),
          industry,
          prompt: prompt.trim() || example,
        });
      }}
      className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-slate-900">Describe your business</h2>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        We already know your workspace details. Anything you add here just makes the result more
        specific.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Business name</span>
          <input
            type="text"
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Bright Smile Dental"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Business type</span>
          <select
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">Choose a type…</option>
            {blueprints.map((blueprint) => (
              <option key={blueprint.key} value={blueprint.label}>
                {blueprint.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium text-slate-700">
          What should the website say and feel like?
        </span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder={example}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </label>

      {busy && <BuildProgress phase={phase} />}

      {phase === "failed" && failure && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
          <p className="flex items-start gap-2 text-xs font-semibold text-amber-900">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {failure}
          </p>
          {canRetry && (
            <>
              <p className="mt-1.5 pl-5 text-[11px] leading-relaxed text-amber-800">
                Your website was created and is safe — only the AI page generation failed. Try
                again, or open it now and edit it yourself.
              </p>
              {draftSiteId && (
                <Link
                  href={`/builder/${draftSiteId}`}
                  className="ml-5 mt-2 inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                >
                  <Pencil className="h-3 w-3" />
                  Open the editor
                </Link>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          {phase === "failed" ? "Close" : "Cancel"}
        </button>
        <button
          type="submit"
          disabled={busy || !businessName.trim()}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy
            ? phase === "creating"
              ? "Creating…"
              : "Writing your pages…"
            : canRetry
              ? "Try generating again"
              : "Build my website"}
        </button>
      </div>
    </form>
  );
}

/**
 * Staged progress for the build.
 *
 * The steps mirror the two real requests rather than inventing a percentage —
 * a fake progress bar that stalls at 80% is worse than none. An elapsed
 * counter is shown instead, so a slow model call still looks alive.
 */
function BuildProgress({ phase }: { phase: BuildPhase }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = window.setInterval(
      () => setElapsed(Math.round((Date.now() - started) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, []);

  const steps: Array<{ id: BuildPhase; label: string }> = [
    { id: "creating", label: "Creating your website" },
    { id: "generating", label: "Writing your pages and choosing a look" },
  ];
  const activeIndex = steps.findIndex((s) => s.id === phase);

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
      <ul className="space-y-1.5">
        {steps.map((step, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li key={step.id} className="flex items-center gap-2 text-xs">
              {done ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              ) : active ? (
                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-blue-600" />
              ) : (
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300" />
              )}
              <span
                className={cn(
                  done && "text-slate-500",
                  active && "font-medium text-slate-900",
                  !done && !active && "text-slate-400",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[11px] text-slate-400">
        {elapsed}s elapsed · this usually takes 15 to 40 seconds. Please keep this tab open.
      </p>
    </div>
  );
}

// =====================================================================
// Site card
// =====================================================================

function SiteCard({ site, onChanged }: { site: SiteListItemDto; onChanged: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const primaryDomain = site.domains.find((d) => d.isPrimary) ?? site.domains[0];
  const connectedDomain = primaryDomain?.status === "CONNECTED" ? primaryDomain : null;
  // Preference order matches the server's publicUrl(): connected custom domain,
  // then the free platform subdomain, then the /s/<slug> fallback.
  const address = connectedDomain?.hostname ?? site.subdomain ?? `/s/${site.slug}`;
  const liveUrl = connectedDomain
    ? `https://${connectedDomain.hostname}`
    : site.subdomain
      ? `https://${site.subdomain}`
      : `/s/${site.slug}`;

  const remove = async () => {
    if (!window.confirm(`Delete "${site.name}"? The published website will go offline.`)) return;
    setBusy(true);
    try {
      await siteApi.remove(site.id);
      toast.success("Website deleted");
      onChanged();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not delete");
    } finally {
      setBusy(false);
      setMenuOpen(false);
    }
  };

  return (
    <div className="group relative rounded-xl border border-slate-200 bg-white p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900">{site.name}</h3>
          <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{address}</p>
        </div>

        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="More actions"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MoreVertical className="h-4 w-4" />
            )}
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                aria-label="Close menu"
                className="fixed inset-0 z-40 cursor-default"
                onClick={() => setMenuOpen(false)}
              />
              <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                <Link
                  href={`/builder/${site.id}`}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Pencil className="h-3 w-3" />
                  Open editor
                </Link>
                <Link
                  href={`/dashboard/website/${site.id}/leads`}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Inbox className="h-3 w-3" />
                  Leads
                </Link>
                <Link
                  href={`/dashboard/website/${site.id}/forms`}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <ClipboardList className="h-3 w-3" />
                  Forms
                </Link>
                <Link
                  href={`/dashboard/website/${site.id}/domains`}
                  className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <ShieldCheck className="h-3 w-3" />
                  Domains & SSL
                </Link>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <StatusBadge status={site.status} />
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
          {site._count.pages} page{site._count.pages === 1 ? "" : "s"}
        </span>
        {site.industry && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
            {site.industry}
          </span>
        )}
      </div>

      {connectedDomain && site.subdomain && (
        // Both addresses shown when a custom domain is connected: the domain is
        // primary (shown above), but the free subdomain keeps working too.
        <p className="mt-2 flex items-center gap-1 truncate text-[11px] text-slate-500">
          <Globe className="h-3 w-3 shrink-0" />
          <span className="truncate">Also live at {site.subdomain}</span>
          {connectedDomain.sslStatus === "ACTIVE" && (
            <span title="SSL active" className="shrink-0 text-emerald-500">
              <ShieldCheck className="h-3 w-3" aria-label="SSL active" />
            </span>
          )}
        </p>
      )}

      <div className="mt-4 flex items-center gap-2">
        <Link
          href={`/builder/${site.id}`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          <Pencil className="h-3 w-3" />
          Edit
        </Link>
        {site.status === "PUBLISHED" ? (
          <a
            href={liveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ExternalLink className="h-3 w-3" />
            View
          </a>
        ) : (
          <Link
            href={`/builder/${site.id}`}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
          >
            Not published
          </Link>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: SiteListItemDto["status"] }) {
  const tone: Record<string, string> = {
    PUBLISHED: "bg-emerald-50 text-emerald-700",
    DRAFT: "bg-amber-50 text-amber-700",
    ARCHIVED: "bg-slate-100 text-slate-500",
    DELETED: "bg-red-50 text-red-700",
  };
  const label: Record<string, string> = {
    PUBLISHED: "Live",
    DRAFT: "Draft",
    ARCHIVED: "Archived",
    DELETED: "Deleted",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone[status],
      )}
    >
      {label[status]}
    </span>
  );
}
