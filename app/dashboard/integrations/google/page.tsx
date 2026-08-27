"use client";

/**
 * /dashboard/integrations/google
 *
 * Redesigned connection hub. Two prominent method cards let the user
 * choose between the official OAuth connection and the Quick Connect
 * (Maps URL / Place ID) path. The selected method expands below.
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Link2,
  Link2Off,
  MapPin,
  Plug,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { Field, Select } from "@/components/dashboard/field";
import { useApi } from "@/lib/api/useApi";
import { googleApi, locationsApi, type SyncRunDto } from "@/lib/api";
import { QuickConnectTab } from "./_components/quick-connect-tab";

type Method = "official" | "quick";

const ACTIVE_SYNC = new Set([
  "QUEUED",
  "PENDING",
  "RUNNING",
  "RETRYING",
]);

/**
 * Safety net only.
 *
 * The server now sanitizes every stored sync error through
 * `userFacingGoogleMessage`, so this no longer has to guess. It stays as a
 * last line of defence for rows written before that change (and for any
 * non-Google error that reaches the same field), because the one thing that
 * must never happen is a raw Google quota string with project identifiers
 * appearing on a tenant's screen.
 */
function friendlySyncError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (
    lower.includes("mybusiness") ||
    lower.includes("googleapis.com") ||
    lower.includes("requests per minute") ||
    lower.includes("resource_exhausted") ||
    lower.includes("quota metric")
  ) {
    return "Google is temporarily limiting requests. Your sync is safely queued and will retry automatically.";
  }
  return raw;
}

/**
 * Guidance for the OAuth failure codes the callback route sends back as
 * `?reason=`. Rendered as a persistent banner rather than a toast: these are
 * conditions the user has to act on, and a toast disappears before they have
 * read it.
 */
const OAUTH_FAILURE_HELP: Record<
  string,
  { title: string; body: string; canRetry: boolean }
> = {
  consent_denied: {
    title: "Google didn't complete the connection",
    body:
      "If you closed or cancelled the Google consent screen, try again. If you never saw a " +
      "consent screen at all, this app has not been approved for your Google account yet — " +
      "contact support and we'll enable access for you.",
    canRetry: true,
  },
  admin_blocked: {
    title: "Blocked by your Google administrator",
    body:
      "Your Google Workspace administrator restricts third-party app access. Ask them to " +
      "allow GReviewPilot for your account, then connect again.",
    canRetry: true,
  },
  scope_missing: {
    title: "Business Profile permission was not granted",
    body:
      "We need the Business Profile permission to read your locations and reviews. Connect " +
      "again and leave every requested permission checked.",
    canRetry: true,
  },
  misconfigured: {
    title: "Connection misconfigured",
    body:
      "The Google connection is misconfigured on our side. Our team has been notified — " +
      "please try again later or contact support.",
    canRetry: false,
  },
  state_invalid: {
    title: "The connection attempt expired",
    body:
      "Connection requests are only valid for a few minutes. Start the connection again.",
    canRetry: true,
  },
  unknown: {
    title: "Google couldn't complete the connection",
    body: "Something went wrong on Google's side. Please try again in a few minutes.",
    canRetry: true,
  },
};

/**
 * `useSearchParams` (used to read the OAuth callback status) opts this
 * subtree into client rendering, so it's wrapped in Suspense to keep the
 * route prerenderable.
 */
export default function GoogleBusinessPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading connection status…
        </div>
      }
    >
      <GoogleBusinessContent />
    </Suspense>
  );
}

function GoogleBusinessContent() {
  const params = useSearchParams();
  const router = useRouter();
  const [method, setMethod] = useState<Method>("quick");

  const status = useApi(() => googleApi.status(), []);
  const locations = useApi(() => googleApi.listLocations(), []);
  const localLocations = useApi(
    () => locationsApi.list({ pageSize: 100, status: "ACTIVE" }),
    [],
  );
  const runs = useApi(() => googleApi.syncRuns({ pageSize: 5 }), []);

  const [connecting, setConnecting] = useState(false);
  // Captured from ?reason= before the query string is stripped, so the
  // guidance survives the router.replace below.
  const [oauthFailure, setOauthFailure] = useState<{
    reason: string;
    message: string | null;
  } | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [activeJob, setActiveJob] = useState<SyncRunDto | null>(null);

  useEffect(() => {
    const s = params?.get("status");
    const m = params?.get("message");
    const reason = params?.get("reason");
    if (!s) return;
    if (s === "connected") {
      setMethod("official");
      setOauthFailure(null);
      toast.success("Google Business connected");
    } else if (s === "error") {
      setMethod("official");
      setOauthFailure({ reason: reason ?? "unknown", message: m });
      toast.error("Google connection failed", { description: m ?? undefined });
    }
    router.replace("/dashboard/integrations/google");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If already connected officially, default to that tab.
  useEffect(() => {
    const st = status.data?.account?.status;
    if (
      st === "CONNECTED" ||
      st === "SYNCING" ||
      st === "RATE_LIMITED" ||
      st === "REAUTH_REQUIRED"
    ) {
      setMethod("official");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data?.account?.status]);

  // Poll active sync job while queued/running.
  useEffect(() => {
    if (!activeJob || !ACTIVE_SYNC.has(activeJob.status)) return;
    const id = activeJob.id;
    const timer = setInterval(async () => {
      try {
        const job = await googleApi.getSyncJob(id);
        setActiveJob(job);
        if (!ACTIVE_SYNC.has(job.status)) {
          clearInterval(timer);
          await refreshAll();
          if (job.status === "SUCCESS" || job.status === "PARTIAL") {
            toast.success(
              job.itemsProcessed > 0
                ? `Sync complete — ${job.itemsProcessed} location${job.itemsProcessed === 1 ? "" : "s"} processed`
                : "Sync complete — no locations found",
            );
          } else if (job.status === "FAILED") {
            toast.error(
              friendlySyncError(job.errorMessage) ?? "Sync failed",
            );
          }
        }
      } catch {
        // ignore transient poll errors
      }
    }, 2500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.id, activeJob?.status]);

  // Seed active job from recent sync runs on load.
  useEffect(() => {
    const latest = runs.data?.items?.[0];
    if (latest && ACTIVE_SYNC.has(latest.status)) {
      setActiveJob(latest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs.data?.items?.[0]?.id, runs.data?.items?.[0]?.status]);

  async function refreshAll() {
    await Promise.all([status.refresh(), locations.refresh(), runs.refresh()]);
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      const { url } = await googleApi.connectUrl();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to start OAuth");
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    try {
      await googleApi.disconnect();
      toast.success("Google account disconnected");
      setActiveJob(null);
      await refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Disconnect failed");
    } finally {
      setDisconnectOpen(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      const run = await googleApi.syncLocations();
      setActiveJob(run);
      toast.message(
        run.created === false || run.message?.includes("already")
          ? "A synchronization is already in progress"
          : "Sync queued — we'll update locations in the background",
      );
      await runs.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function handleLink(rowId: string, localLocationId: string | "") {
    setBusyRow(rowId);
    try {
      if (localLocationId === "") {
        await googleApi.unlink(rowId);
        toast.success("Unlinked");
      } else {
        await googleApi.link(rowId, localLocationId);
        toast.success("Linked");
      }
      await locations.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Link failed");
    } finally {
      setBusyRow(null);
    }
  }

  const s = status.data;
  const notConfigured = s && !s.configured;
  const accountStatus = s?.account?.status;
  const connected =
    !!s?.account &&
    (accountStatus === "CONNECTED" ||
      accountStatus === "SYNCING" ||
      accountStatus === "RATE_LIMITED" ||
      accountStatus === "REAUTH_REQUIRED");
  const jobActive = activeJob ? ACTIVE_SYNC.has(activeJob.status) : false;
  const friendlyError = friendlySyncError(
    activeJob?.errorMessage ?? s?.account?.lastSyncError,
  );

  return (
    <>
      <PageHeader
        title="Connect Google"
        description="Bring in your reviews and locations. Choose the method that fits you."
      />

      {/* Method selector cards */}
      <div className="mb-5 grid gap-3 md:grid-cols-2">
        <MethodCard
          selected={method === "quick"}
          onSelect={() => setMethod("quick")}
          icon={Zap}
          accent="blue"
          title="Quick Connect"
          badge="Fastest"
          description="Paste a Google Maps link or Place ID. No account access needed — perfect for testing and instant AI review funnels."
          bullets={["Works in seconds", "No OAuth required", "AI review funnel ready"]}
        />
        <MethodCard
          selected={method === "official"}
          onSelect={() => setMethod("official")}
          icon={ShieldCheck}
          accent="emerald"
          // "Official Google Business" could read as a claim of Google
          // endorsement. This names the mechanism instead: Google OAuth.
          title="Sign in with Google"
          badge={connected ? "Connected" : "Full access"}
          badgeGood={!!connected}
          description="Authorise GReviewPilot with Google OAuth to sync your locations, reviews, posts, and photos automatically."
          bullets={["Two-way review sync", "Auto-refresh", "Post publishing"]}
        />
      </div>

      {/* ---------- QUICK CONNECT ---------- */}
      {method === "quick" && <QuickConnectTab />}

      {/* ---------- OFFICIAL ---------- */}
      {method === "official" && (
        <div className="space-y-4">
          {/* OAuth failure guidance. Persistent, because every reason here
              needs the user to do something specific. */}
          {oauthFailure && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
            >
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <div className="font-semibold">
                  {(OAUTH_FAILURE_HELP[oauthFailure.reason] ??
                    OAUTH_FAILURE_HELP.unknown).title}
                </div>
                <p className="mt-1 text-xs text-red-900/80">
                  {(OAUTH_FAILURE_HELP[oauthFailure.reason] ??
                    OAUTH_FAILURE_HELP.unknown).body}
                </p>
                {oauthFailure.message && (
                  <p className="mt-1.5 text-[11px] text-red-900/60">
                    Google reported: {oauthFailure.message}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-2">
                  {(OAUTH_FAILURE_HELP[oauthFailure.reason] ??
                    OAUTH_FAILURE_HELP.unknown).canRetry && (
                    <button
                      type="button"
                      onClick={handleConnect}
                      disabled={connecting}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      {connecting ? "Redirecting…" : "Try again"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOauthFailure(null)}
                    className="inline-flex items-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Toolbar for connected state */}
          {connected && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={"h-3.5 w-3.5 " + (syncing ? "animate-spin" : "")} />
                {syncing ? "Syncing…" : "Sync locations"}
              </button>
              <button
                onClick={() => setDisconnectOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Disconnect
              </button>
            </div>
          )}

          {status.loading && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
              Loading connection status…
            </div>
          )}

          {notConfigured && (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <div className="font-semibold">Google OAuth is not configured</div>
                <p className="mt-1 text-xs text-amber-900/80">
                  Set{" "}
                  <code className="rounded bg-amber-100 px-1 py-0.5">GOOGLE_CLIENT_ID</code>{" "}
                  and{" "}
                  <code className="rounded bg-amber-100 px-1 py-0.5">
                    GOOGLE_CLIENT_SECRET
                  </code>{" "}
                  in your <code className="rounded bg-amber-100 px-1 py-0.5">.env</code>,
                  then restart. Add this redirect URI in Google Cloud:
                </p>
                <pre className="mt-2 rounded-lg bg-amber-900/90 p-2 font-mono text-[11px] text-amber-50">
                  {s?.redirectUri}
                </pre>
                <p className="mt-2 text-xs">
                  In the meantime, use <strong>Quick Connect</strong> — it works
                  without any of this.
                </p>
              </div>
            </div>
          )}

          {s && s.configured && !s.account && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <EmptyState
                icon={Plug}
                title="Connect your Google Business account"
                description="We'll pull in your locations, reviews, posts, and photos automatically once you connect."
                action={
                  <button
                    onClick={handleConnect}
                    disabled={connecting}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                  >
                    {connecting ? "Redirecting…" : "Connect Google Business"}
                  </button>
                }
              />
            </div>
          )}

          {connected && s?.account && (
            <>
              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Connected as {s.account.email}
                </div>
                <div className="mt-0.5 text-xs text-slate-500">
                  {s.account.googleAccountName ??
                    s.account.googleAccountId ??
                    (jobActive
                      ? "Setting up your Google Business Profile…"
                      : "Fetching account details…")}
                </div>
                <div className="mt-2 grid gap-1 text-[11px] text-slate-500 sm:grid-cols-2">
                  <div>
                    Connected:{" "}
                    <span className="text-slate-800">
                      {new Date(s.account.connectedAt).toLocaleString()}
                    </span>
                  </div>
                  <div>
                    Last synced:{" "}
                    <span className="text-slate-800">
                      {s.account.lastSyncedAt
                        ? new Date(s.account.lastSyncedAt).toLocaleString()
                        : "Never"}
                    </span>
                  </div>
                </div>

                {/* Sync progress */}
                {(jobActive || accountStatus === "SYNCING") && (
                  <div className="mt-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3">
                    <div className="text-xs font-semibold text-blue-900">
                      Initial Sync
                    </div>
                    <p className="mt-0.5 text-[11px] text-blue-800/80">
                      Setting up your Google Business Profile…
                    </p>
                    <ul className="mt-2 space-y-1 text-[11px] text-slate-700">
                      <li className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        Finding accounts
                        {activeJob?.kind === "ACCOUNTS" && jobActive
                          ? "…"
                          : ""}
                      </li>
                      <li className="flex items-center gap-1.5">
                        {activeJob?.kind === "LOCATIONS" && jobActive ? (
                          <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
                        ) : (locations.data?.total ?? 0) > 0 ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <span className="h-3 w-3 rounded-full border border-slate-300" />
                        )}
                        Finding locations
                        {activeJob?.kind === "LOCATIONS" && jobActive
                          ? "…"
                          : ""}
                      </li>
                      <li className="flex items-center gap-1.5">
                        {(locations.data?.total ?? 0) > 0 && !jobActive ? (
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                        ) : (
                          <span className="h-3 w-3 rounded-full border border-slate-300" />
                        )}
                        Importing data
                        {(locations.data?.total ?? 0) > 0 && !jobActive
                          ? ` — ${locations.data!.total} location${locations.data!.total === 1 ? "" : "s"} synced`
                          : ""}
                      </li>
                    </ul>
                    {activeJob && (
                      <div className="mt-2 text-[10px] uppercase tracking-wide text-blue-700">
                        Status: {activeJob.status}
                        {activeJob.status === "RETRYING" && activeJob.nextRetryAt
                          ? ` · retry ${new Date(activeJob.nextRetryAt).toLocaleTimeString()}`
                          : ""}
                      </div>
                    )}
                  </div>
                )}

                {(accountStatus === "RATE_LIMITED" ||
                  activeJob?.status === "RETRYING" ||
                  (friendlyError &&
                    friendlyError.includes("limiting requests"))) && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                    <div className="font-semibold">Rate limited</div>
                    <p className="mt-0.5">
                      Google is temporarily limiting requests. Your sync is
                      safely queued and will retry automatically.
                    </p>
                  </div>
                )}

                {accountStatus === "REAUTH_REQUIRED" && (
                  <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[11px] text-red-800">
                    Your Google connection needs to be reauthorized.{" "}
                    <button
                      type="button"
                      onClick={handleConnect}
                      className="font-semibold underline"
                    >
                      Reconnect
                    </button>
                  </div>
                )}

                {friendlyError &&
                  accountStatus !== "RATE_LIMITED" &&
                  accountStatus !== "REAUTH_REQUIRED" &&
                  !friendlyError.includes("limiting requests") && (
                  <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-[11px] text-red-700">
                    {friendlyError}
                  </div>
                )}

                <div className="mt-2 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px] text-slate-600">
                  <RefreshCw className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
                  <span>
                    <span className="font-semibold text-slate-700">
                      Automatic sync
                    </span>{" "}
                    queues background jobs when{" "}
                    <code className="rounded bg-slate-200 px-1">CRON_SECRET</code>{" "}
                    is set and a scheduler calls{" "}
                    <code className="rounded bg-slate-200 px-1">
                      /api/cron/auto-sync
                    </code>{" "}
                    and{" "}
                    <code className="rounded bg-slate-200 px-1">
                      /api/cron/google-sync-worker
                    </code>
                    . Manual sync never bursts Google APIs in the request.
                  </span>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Google locations
                  </h3>
                  <span className="text-xs text-slate-500">
                    {locations.data?.total ?? 0} mirrored
                  </span>
                </div>
                {locations.loading ? (
                  <div className="text-xs text-slate-500">Loading…</div>
                ) : (locations.data?.items.length ?? 0) === 0 ? (
                  <EmptyState
                    icon={Link2}
                    title="No locations found"
                    description={
                      jobActive
                        ? "Sync is still running — locations will appear here when ready."
                        : "No Google Business locations were returned for this account. Click Sync locations to try again."
                    }
                    action={
                      !jobActive ? (
                        <button
                          onClick={handleSync}
                          disabled={syncing}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          <RefreshCw className={"h-3.5 w-3.5 " + (syncing ? "animate-spin" : "")} />
                          Sync now
                        </button>
                      ) : undefined
                    }
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Google location</th>
                          <th className="px-3 py-2">Address</th>
                          <th className="px-3 py-2">Category</th>
                          <th className="px-3 py-2">Linked branch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {locations.data!.items.map((row) => (
                          <tr key={row.id} className="border-b border-slate-100 last:border-none">
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-slate-900">{row.title}</div>
                              <div className="font-mono text-[10px] text-slate-500">
                                {row.googleLocationId}
                                {row.storeCode ? ` · ${row.storeCode}` : ""}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">
                              {[row.addressLine, row.city, row.country].filter(Boolean).join(", ") || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-slate-700">
                              {row.primaryCategory ?? "—"}
                            </td>
                            <td className="px-3 py-2.5">
                              <Select
                                value={row.localLocationId ?? ""}
                                disabled={busyRow === row.id}
                                onChange={(e) => handleLink(row.id, e.target.value)}
                                className="min-w-[180px]"
                              >
                                <option value="">— Not linked —</option>
                                {localLocations.data?.items.map((l) => (
                                  <option key={l.id} value={l.id}>
                                    {l.name} · {l.city}
                                  </option>
                                ))}
                              </Select>
                              {row.localLocationId && (
                                <button
                                  type="button"
                                  onClick={() => handleLink(row.id, "")}
                                  disabled={busyRow === row.id}
                                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-red-600"
                                >
                                  <Link2Off className="h-3 w-3" />
                                  Clear link
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Recent syncs</h3>
                {runs.loading ? (
                  <div className="text-xs text-slate-500">Loading…</div>
                ) : (runs.data?.items.length ?? 0) === 0 ? (
                  <div className="text-xs text-slate-500">No syncs yet.</div>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                    {runs.data!.items.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <StatusPill status={r.status} />
                          <span className="font-semibold text-slate-900">{r.kind}</span>
                          <span className="text-[11px] text-slate-500">
                            {new Date(r.startedAt).toLocaleString()}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {r.itemsCreated} new · {r.itemsUpdated} updated · {r.itemsFailed} failed
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={disconnectOpen}
        title="Disconnect Google Business?"
        description="Sync history and mirrored Google locations for this workspace will be removed. You can reconnect at any time."
        destructive
        confirmLabel="Disconnect"
        onConfirm={handleDisconnect}
        onCancel={() => setDisconnectOpen(false)}
      />
    </>
  );
}

function MethodCard({
  selected,
  onSelect,
  icon: Icon,
  title,
  description,
  bullets,
  accent,
  badge,
  badgeGood,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: typeof Zap;
  title: string;
  description: string;
  bullets: string[];
  accent: "blue" | "emerald";
  badge?: string;
  badgeGood?: boolean;
}) {
  const accentBorder = selected
    ? accent === "blue"
      ? "border-blue-500 ring-2 ring-blue-500/20"
      : "border-emerald-500 ring-2 ring-emerald-500/20"
    : "border-slate-200 hover:border-slate-300";
  const iconBg =
    accent === "blue"
      ? "bg-blue-100 text-blue-600"
      : "bg-emerald-100 text-emerald-600";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={
        "group relative flex flex-col rounded-2xl border bg-white p-5 text-left transition-all " +
        accentBorder
      }
    >
      <div className="flex items-start justify-between">
        <div className={"flex h-10 w-10 items-center justify-center rounded-xl " + iconBg}>
          <Icon className="h-5 w-5" />
        </div>
        {badge && (
          <span
            className={
              "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
              (badgeGood
                ? "bg-emerald-100 text-emerald-700"
                : accent === "blue"
                  ? "bg-blue-100 text-blue-700"
                  : "bg-slate-100 text-slate-600")
            }
          >
            {badge}
          </span>
        )}
      </div>
      <h3 className="mt-3 text-sm font-bold text-slate-900">{title}</h3>
      <p className="mt-1 text-xs text-slate-500">{description}</p>
      <ul className="mt-3 space-y-1">
        {bullets.map((b) => (
          <li key={b} className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            {b}
          </li>
        ))}
      </ul>
      <div
        className={
          "mt-3 flex items-center gap-1 text-[11px] font-semibold " +
          (selected
            ? accent === "blue"
              ? "text-blue-600"
              : "text-emerald-600"
            : "text-slate-400 group-hover:text-slate-600")
        }
      >
        {selected ? "Selected" : "Choose this"}
        <ChevronRight className="h-3 w-3" />
      </div>
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING: "bg-slate-200 text-slate-700",
    QUEUED: "bg-slate-200 text-slate-700",
    RUNNING: "bg-blue-100 text-blue-700",
    RETRYING: "bg-amber-100 text-amber-700",
    SUCCESS: "bg-emerald-100 text-emerald-700",
    PARTIAL: "bg-amber-100 text-amber-700",
    FAILED: "bg-red-100 text-red-700",
    CANCELLED: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold " +
        (map[status] ?? "bg-slate-100 text-slate-600")
      }
    >
      {status}
    </span>
  );
}
