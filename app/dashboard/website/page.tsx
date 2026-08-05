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

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
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

export default function WebsitesPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const galleryRef = useRef<HTMLDivElement | null>(null);

  const { data, loading, error, refresh } = useApi(() => siteApi.list({ pageSize: 50 }), []);

  const sites = data?.items ?? [];

  const focusGallery = () => {
    galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
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
            onClick={() => setAiOpen((v) => !v)}
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
          busy={creating}
          onCancel={() => setAiOpen(false)}
          onSubmit={async (input) => {
            setCreating(true);
            try {
              // Two steps, deliberately: the site row must exist before
              // generation so the AI revision has something to attach to and a
              // failed generation still leaves an editable site behind.
              const site = await siteApi.create({
                name: input.businessName,
                industry: input.industry || undefined,
              });
              const result = await siteApi.generate(site.id, {
                prompt: input.prompt,
                businessName: input.businessName,
                industry: input.industry || undefined,
                replaceExisting: true,
              });
              toast.success(
                result.source === "ai"
                  ? `Created ${result.pages.length} pages with AI`
                  : `Created ${result.pages.length} pages from the ${input.industry || "local business"} template`,
                { description: result.message },
              );
              router.push(`/builder/${site.id}`);
            } catch (err) {
              toast.error(
                err instanceof ApiClientError ? err.message : "Could not create the website",
              );
              setCreating(false);
            }
          }}
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

function BriefPanel({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: { businessName: string; industry: string; prompt: string }) => void;
}) {
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [prompt, setPrompt] = useState("");
  const blueprints = listBlueprints();

  const example = industry
    ? `A modern website for my ${industry.toLowerCase()}. Friendly and trustworthy, with online booking and our Google reviews.`
    : "A modern website for my dental clinic in Pune. Calm and professional, with online appointment booking and our Google reviews.";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!businessName.trim()) return;
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

      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !businessName.trim()}
          className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy ? "Building your website…" : "Build my website"}
        </button>
      </div>

      {busy && (
        <p className="mt-2 text-right text-[11px] text-slate-400">
          This usually takes 15 to 40 seconds.
        </p>
      )}
    </form>
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
