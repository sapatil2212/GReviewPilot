"use client";

/**
 * Domain management + DNS wizard.
 *
 * The hard part of custom domains is not the code, it is that the user has to
 * edit DNS at a registrar we cannot see. So this page optimises for that: the
 * exact records to create, a copy button on every value, a plain-language
 * explanation of apex vs subdomain, and a verification result that says which
 * specific record is still missing rather than just "failed".
 */

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Globe,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  XCircle,
} from "lucide-react";
import { useApi } from "@/lib/api/useApi";
import {
  siteApi,
  type DnsRecordDto,
  type DomainStatusDto,
  type DomainVerifyResultDto,
  type SiteDomainDto,
  type SslSummaryDto,
} from "@/lib/api/site";
import { ApiClientError } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

export default function DomainsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);
  const [hostname, setHostname] = useState("");
  const [addWwwAlias, setAddWwwAlias] = useState(true);
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, DomainVerifyResultDto>>({});

  const { data, loading, error, refresh } = useApi(() => siteApi.domains(siteId), [siteId]);
  const site = useApi(() => siteApi.get(siteId), [siteId]);

  const domains = data?.domains ?? [];
  const wizard = data?.wizard ?? [];

  const addDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hostname.trim()) return;
    setAdding(true);
    try {
      const created = await siteApi.addDomain(siteId, {
        hostname: hostname.trim(),
        addWwwAlias: addWwwAlias && !hostname.trim().toLowerCase().startsWith("www."),
      });
      setHostname("");
      await refresh();
      toast.success(created.alias ? "Domain and www alias added" : "Domain added", {
        description: created.alias
          ? `Create the DNS records for both ${created.hostname} and ${created.alias.hostname}, then press Verify.`
          : "Create the DNS records below, then press Verify.",
      });
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not add the domain");
    } finally {
      setAdding(false);
    }
  };

  const verify = useCallback(
    async (domainId: string, options: { silent?: boolean } = {}) => {
      if (!options.silent) setVerifying(domainId);
      try {
        const result = await siteApi.verifyDomain(siteId, domainId);
        setResults((prev) => ({ ...prev, [domainId]: result }));
        await refresh();
        if (options.silent) {
          // Background poll: only speak up on success, so a page left open does
          // not emit a toast every minute while DNS propagates.
          if (result.connected) toast.success("Domain verified and connected");
          return result;
        }
        if (result.connected) toast.success("Domain verified and connected");
        else toast.info("Not verified yet", { description: result.lastError ?? undefined });
        return result;
      } catch (err) {
        // Silent polls swallow errors — a transient failure must not interrupt
        // someone who is not even looking at this tab.
        if (!options.silent) {
          toast.error(err instanceof ApiClientError ? err.message : "Verification failed");
        }
        return null;
      } finally {
        if (!options.silent) setVerifying(null);
      }
    },
    [siteId, refresh],
  );

  /**
   * Re-check propagating domains on a timer.
   *
   * DNS takes minutes to hours, and the alternative is a tenant sitting on this
   * page pressing Verify. The interval is 60s rather than something snappier
   * because each attempt performs live DNS lookups and the endpoint allows 20 per
   * 10 minutes per domain — faster polling would rate-limit the manual button.
   *
   * Gives up after 20 minutes so a tab left open overnight is not querying
   * public resolvers indefinitely; the hourly job continues regardless, which is
   * what actually guarantees the domain completes.
   */
  useEffect(() => {
    const propagating = domains.filter(
      (d) => d.status === "PENDING" || d.status === "VERIFYING",
    );
    if (propagating.length === 0) return;

    let elapsed = 0;
    const intervalMs = 60_000;
    const giveUpAfterMs = 20 * 60_000;

    const timer = setInterval(() => {
      elapsed += intervalMs;
      if (elapsed > giveUpAfterMs) {
        clearInterval(timer);
        return;
      }
      // Sequential, not parallel: several domains verifying at once would fire
      // simultaneous resolver queries for no benefit.
      void (async () => {
        for (const domain of propagating) {
          await verify(domain.id, { silent: true });
        }
      })();
    }, intervalMs);

    return () => clearInterval(timer);
    // Keyed on the set of propagating domains so the timer restarts when one
    // connects and stops once none remain.
  }, [domains.map((d) => `${d.id}:${d.status}`).join(","), verify]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Link
          href="/dashboard/website"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to websites
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Domains & SSL</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every website gets a free GReviewPilot address instantly. Connect a domain you already own
          whenever you are ready — HTTPS is set up automatically once DNS points here.
        </p>
      </div>

      {site.data && <SubdomainCard site={site.data} onRenamed={() => void site.refresh()} />}

      {/* Wizard steps */}
      {wizard.length > 0 && (
        <ol className="grid gap-2 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-5">
          {wizard.map((step) => (
            <li key={step.step} className="flex gap-2 sm:flex-col">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                {step.step}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800">{step.title}</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* Add domain */}
      <form onSubmit={addDomain} className="rounded-xl border border-slate-200 bg-white p-4">
        <label htmlFor="hostname" className="mb-1.5 block text-xs font-medium text-slate-700">
          Add a domain
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id="hostname"
            type="text"
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            placeholder="clinic.com or www.clinic.com"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={adding || !hostname.trim()}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            Add domain
          </button>
        </div>
        {/* Visitors type both forms and other sites link to both, so serving
            only one looks broken. Defaulted on, hidden when it cannot apply. */}
        {!hostname.trim().toLowerCase().startsWith("www.") && (
          <label className="mt-2.5 flex items-start gap-2 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={addWwwAlias}
              onChange={(e) => setAddWwwAlias(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              Also add{" "}
              <span className="font-mono">
                www.{hostname.trim() ? hostname.trim().toLowerCase() : "your-domain.com"}
              </span>{" "}
              and redirect it here
              <span className="mt-0.5 block text-slate-400">
                Recommended. Both addresses work, and visitors land on one canonical URL.
              </span>
            </span>
          </label>
        )}

        <p className="mt-2 text-[11px] text-slate-400">
          Enter the domain only — no https:// and no trailing path.
        </p>
      </form>

      {loading && (
        <div className="flex items-center justify-center py-10 text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading domains…
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error.message}
        </div>
      )}

      {!loading && domains.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No custom domains connected yet. Your site is already live at the free address above —
          connecting your own domain is optional.
        </p>
      )}

      {domains.map((domain) => (
        <DomainCard
          key={domain.id}
          siteId={siteId}
          domain={domain}
          result={results[domain.id]}
          verifying={verifying === domain.id}
          onVerify={() => void verify(domain.id)}
          onChanged={refresh}
        />
      ))}
    </div>
  );
}

// =====================================================================
// Subdomain card
// =====================================================================

/**
 * The free GReviewPilot address — the Lovable/Bolt-style default every site
 * gets with zero setup, shown ahead of the custom-domain flow so a tenant sees
 * their site is already live before being asked to touch DNS.
 *
 * `subdomain` is null when the platform has no SITES_ROOT_DOMAIN configured
 * (e.g. self-hosted without a wildcard cert set up); the card then explains
 * the /s/<slug> fallback instead of hiding silently, so the "why is there no
 * free address" question has an answer on screen.
 */
function SubdomainCard({
  site,
  onRenamed,
}: {
  site: { id: string; slug: string; subdomain: string | null; previewPath: string; status: string };
  onRenamed: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(site.slug);
  const [saving, setSaving] = useState(false);

  const address = site.subdomain ?? site.previewPath;
  const url = `https://${site.subdomain ?? ""}`;
  const isLive = site.status === "PUBLISHED";

  const rename = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = value.trim().toLowerCase();
    if (!next || next === site.slug) {
      setRenaming(false);
      return;
    }
    setSaving(true);
    try {
      await siteApi.update(site.id, { slug: next });
      setRenaming(false);
      onRenamed();
      toast.success("Address updated", {
        description: site.subdomain
          ? `Your site is now at ${next}.${site.subdomain.split(".").slice(1).join(".")}`
          : undefined,
      });
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "That address is already taken");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Your GReviewPilot address
            </h2>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                isLive ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
              )}
            >
              {isLive ? "Live" : "Not published"}
            </span>
          </div>

          {renaming ? (
            <form onSubmit={rename} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value.toLowerCase())}
                autoFocus
                autoComplete="off"
                spellCheck={false}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-mono text-sm focus:border-blue-500 focus:outline-none"
              />
              {site.subdomain && (
                <span className="font-mono text-sm text-slate-400">
                  .{site.subdomain.split(".").slice(1).join(".")}
                </span>
              )}
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRenaming(false);
                  setValue(site.slug);
                }}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                Cancel
              </button>
            </form>
          ) : (
            <p className="truncate font-mono text-lg font-semibold text-slate-900">{address}</p>
          )}

          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
            {site.subdomain
              ? "Included free with every website. No DNS setup, no verification, no SSL to configure — it works immediately."
              : "This deployment has no platform subdomain configured, so your site is served at this path on the main app URL."}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {!renaming && (
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Pencil className="h-3.5 w-3.5" />
              Rename
            </button>
          )}
          {site.subdomain && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Visit
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Domain card
// =====================================================================

function DomainCard({
  siteId,
  domain,
  result,
  verifying,
  onVerify,
  onChanged,
}: {
  siteId: string;
  domain: SiteDomainDto;
  result?: DomainVerifyResultDto;
  verifying: boolean;
  onVerify: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [ssl, setSsl] = useState<SslSummaryDto | null>(null);
  const [sslChecking, setSslChecking] = useState(false);

  // The verification response carries a fresh certificate report once routing
  // resolves; adopt it so the panel is populated without a second request.
  const sslReport = ssl ?? result?.ssl ?? null;

  const checkSsl = async () => {
    setSslChecking(true);
    try {
      const report = await siteApi.checkDomainSsl(siteId, domain.id);
      setSsl(report);
      await onChanged();
      if (report.valid && !report.renewalDue) toast.success("HTTPS is active");
      else toast.info(report.summary);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not check the certificate");
    } finally {
      setSslChecking(false);
    }
  };

  const act = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      await onChanged();
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  // Prefer the live verification result over the stored status, so the card
  // reflects the check the user just ran.
  const checks = result?.checks;
  const requiredRecords = domain.dnsRecords.filter((r) => !r.optional);
  const optionalRecords = domain.dnsRecords.filter((r) => r.optional);

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-slate-900">{domain.hostname}</h2>
            <DomainStatus status={domain.status} />
            {domain.isPrimary && (
              <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                <Star className="h-2.5 w-2.5" />
                Primary
              </span>
            )}
            <SslStatus status={domain.sslStatus} expiresAt={domain.sslExpiresAt} />
          </div>
          <p className="mt-1 text-[11px] text-slate-500">
            {domain.isApex
              ? "Root domain — needs an A record."
              : "Subdomain — needs a CNAME record."}
            {domain.lastCheckedAt &&
              ` Last checked ${new Date(domain.lastCheckedAt).toLocaleString()}.`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={onVerify}
            disabled={verifying}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {verifying ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Verify
          </button>

          <button
            type="button"
            onClick={() => void checkSsl()}
            disabled={sslChecking}
            title="Inspect the live HTTPS certificate for this domain"
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {sslChecking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            Check SSL
          </button>

          {!domain.isPrimary && domain.status === "CONNECTED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(
                  () => siteApi.updateDomain(siteId, domain.id, { isPrimary: true }),
                  "Primary domain updated",
                )
              }
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Make primary
            </button>
          )}

          <button
            type="button"
            disabled={busy}
            aria-label="Remove domain"
            onClick={() => {
              if (!window.confirm(`Remove ${domain.hostname}?`)) return;
              void act(() => siteApi.removeDomain(siteId, domain.id), "Domain removed");
            }}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {domain.lastError && domain.status !== "CONNECTED" && (
        <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-[11px] leading-relaxed text-amber-900">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <p>{domain.lastError}</p>
            {/* Says the quiet part out loud: nobody needs to sit here clicking. */}
            <p className="mt-1 flex items-center gap-1.5 text-amber-700/80">
              <RefreshCw className="h-3 w-3 animate-spin" />
              Checking automatically — this page rechecks every minute, and we keep checking hourly
              even after you leave.
            </p>
          </div>
        </div>
      )}

      {sslReport && <SslPanel report={sslReport} />}

      <div className="p-4">
        {/* One required record. The TXT is genuinely optional — pointing the
            routing record at us already proves control of the zone — so it is
            tucked away rather than presented as a second mandatory step. */}
        <h3 className="mb-1 text-xs font-semibold text-slate-800">
          Add this record at your registrar
        </h3>
        <p className="mb-3 text-[11px] leading-relaxed text-slate-500">
          One record is all that is needed. Add it wherever your domain&apos;s DNS is managed —
          GoDaddy, Hostinger, Namecheap, Cloudflare — then press Verify. We check again
          automatically every hour, so you can close this page.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-3 font-semibold">Type</th>
                <th className="pb-2 pr-3 font-semibold">Name / Host</th>
                <th className="pb-2 pr-3 font-semibold">Value</th>
                <th className="pb-2 pr-3 font-semibold">TTL</th>
                <th className="pb-2 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {requiredRecords.map((record) => {
                // Prefer a result from this session; fall back to the stored
                // observation so the table is populated after a page reload.
                const live = checks?.find(
                  (c) => c.type === record.type && c.name === record.name,
                );
                return (
                  <DnsRow
                    key={`${record.type}-${record.name}`}
                    record={record}
                    matched={live?.matched ?? record.matched ?? undefined}
                    found={live?.found ?? record.found}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {optionalRecords.length > 0 && (
          <details className="mt-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
            <summary className="cursor-pointer text-[11px] font-medium text-slate-600">
              Advanced: verify ownership before pointing live traffic here
            </summary>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
              Only useful if the domain is currently serving a live site and you want us confirmed
              first. Add this TXT record, press Verify, and the domain will show as verified without
              any traffic moving. You can remove it once the routing record is in place.
            </p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <tbody>
                  {optionalRecords.map((record) => {
                    const live = checks?.find(
                      (c) => c.type === record.type && c.name === record.name,
                    );
                    return (
                      <DnsRow
                        key={`${record.type}-${record.name}`}
                        record={record}
                        matched={live?.matched ?? record.matched ?? undefined}
                        found={live?.found ?? record.found}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}

        {result && (
          <div
            className={cn(
              "mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-[11px] leading-relaxed",
              result.connected
                ? "bg-emerald-50 text-emerald-900"
                : "bg-slate-50 text-slate-700",
            )}
          >
            {result.connected ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            ) : (
              <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
            )}
            <span>
              {result.connected ? (
                <>
                  Connected. An HTTPS certificate is being issued and will be active shortly. Publish
                  your site to go live on this domain.
                </>
              ) : (
                <>
                  Routing {result.routingOk ? "found" : "not found"} · Ownership{" "}
                  {result.ownershipOk ? "verified" : "not verified"}. DNS changes typically apply
                  within 30 minutes but can take up to 48 hours.
                </>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function DnsRow({
  record,
  matched,
  found,
}: {
  record: DnsRecordDto;
  matched?: boolean;
  found?: string[];
}) {
  return (
    <tr className="border-b border-slate-50 align-top">
      <td className="py-2.5 pr-3">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
          {record.type}
        </span>
      </td>
      <td className="py-2.5 pr-3">
        <CopyValue value={record.name} />
      </td>
      <td className="py-2.5 pr-3">
        <CopyValue value={record.value} />
        {record.note && (
          <p className="mt-1 max-w-[240px] text-[10px] leading-relaxed text-slate-400">
            {record.note}
          </p>
        )}
        {matched === false && found && found.length > 0 && (
          <p className="mt-1 max-w-[240px] text-[10px] leading-relaxed text-amber-700">
            Currently found: {found.slice(0, 2).join(", ")}
          </p>
        )}
      </td>
      <td className="py-2.5 pr-3 font-mono text-[10px] text-slate-500">{record.ttl}</td>
      <td className="py-2.5">
        {matched === undefined ? (
          <span className="text-[10px] text-slate-400">Not checked</span>
        ) : matched ? (
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600">
            <CheckCircle2 className="h-3 w-3" />
            Found
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600">
            <XCircle className="h-3 w-3" />
            Missing
          </span>
        )}
      </td>
    </tr>
  );
}

/** Monospace value with a copy button — DNS values must be exact. */
function CopyValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title="Copy"
      className="group inline-flex max-w-[220px] items-center gap-1.5 rounded border border-transparent px-1 py-0.5 font-mono text-[11px] text-slate-800 hover:border-slate-200 hover:bg-slate-50"
    >
      <span className="truncate">{value}</span>
      {copied ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-600" />
      ) : (
        <Copy className="h-3 w-3 shrink-0 text-slate-300 group-hover:text-slate-500" />
      )}
    </button>
  );
}

function DomainStatus({ status }: { status: DomainStatusDto }) {
  const map: Record<DomainStatusDto, { label: string; className: string }> = {
    PENDING: { label: "Awaiting DNS", className: "bg-amber-50 text-amber-700" },
    VERIFYING: { label: "Propagating", className: "bg-blue-50 text-blue-700" },
    CONNECTED: { label: "Connected", className: "bg-emerald-50 text-emerald-700" },
    FAILED: { label: "Failed", className: "bg-red-50 text-red-700" },
    REMOVED: { label: "Removed", className: "bg-slate-100 text-slate-500" },
  };
  const entry = map[status];
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        entry.className,
      )}
    >
      {entry.label}
    </span>
  );
}

/**
 * Certificate detail from a live inspection.
 *
 * Shows what was actually observed — issuer, expiry, and the specific reason
 * HTTPS is not working — because the previous UI could only render a status
 * badge that nothing ever advanced past "pending", leaving tenants with no way
 * to tell a certificate still being issued from one permanently blocked by
 * their own DNS.
 */
function SslPanel({ report }: { report: SslSummaryDto }) {
  const caaBlocked = report.caa?.permitted === false;

  const tone = report.valid
    ? report.renewalDue
      ? "border-amber-100 bg-amber-50 text-amber-900"
      : "border-emerald-100 bg-emerald-50 text-emerald-900"
    : caaBlocked
      ? "border-red-100 bg-red-50 text-red-900"
      : "border-slate-100 bg-slate-50 text-slate-700";

  const Icon = report.valid && !report.renewalDue ? ShieldCheck : AlertCircle;

  return (
    <div className={cn("border-b px-4 py-2.5 text-[11px] leading-relaxed", tone)}>
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium">{report.summary}</p>

          {report.valid && (
            <p className="mt-0.5 opacity-80">
              {report.issuer && <>Issued by {report.issuer}. </>}
              {report.expiresAt && (
                <>Expires {new Date(report.expiresAt).toLocaleDateString()}</>
              )}
              {report.daysUntilExpiry !== null && <> ({report.daysUntilExpiry} days)</>}
              {". "}
              Renewal is handled automatically by the platform.
            </p>
          )}

          {caaBlocked && report.caa && (
            <p className="mt-1 opacity-90">
              Your CAA record on <code className="font-mono">{report.caa.foundAt}</code> allows only{" "}
              <code className="font-mono">{report.caa.authorised.join(", ")}</code>. Add a CAA record
              permitting our certificate authority, or remove the existing ones.
            </p>
          )}

          {!report.valid && !caaBlocked && report.problems.includes("unreachable") && (
            <p className="mt-0.5 opacity-80">
              This is normal for the first few minutes after DNS starts resolving. Certificates are
              usually issued within 15 minutes.
            </p>
          )}

          <p className="mt-1 text-[10px] opacity-60">
            Checked {new Date(report.checkedAt).toLocaleTimeString()}
          </p>
        </div>
      </div>
    </div>
  );
}

function SslStatus({
  status,
  expiresAt,
}: {
  status: SiteDomainDto["sslStatus"];
  expiresAt: string | null;
}) {
  if (status === "NONE") return null;

  const map: Record<string, { label: string; className: string }> = {
    PENDING: { label: "SSL pending", className: "text-amber-600" },
    ACTIVE: { label: "SSL active", className: "text-emerald-600" },
    FAILED: { label: "SSL failed", className: "text-red-600" },
    EXPIRED: { label: "SSL expired", className: "text-red-600" },
  };
  const entry = map[status];
  if (!entry) return null;

  return (
    <span
      className={cn("flex items-center gap-1 text-[10px] font-medium", entry.className)}
      title={expiresAt ? `Renews ${new Date(expiresAt).toLocaleDateString()}` : undefined}
    >
      <ShieldCheck className="h-3 w-3" />
      {entry.label}
    </span>
  );
}
