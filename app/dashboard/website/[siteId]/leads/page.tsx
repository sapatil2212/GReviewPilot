"use client";

/**
 * Lead inbox.
 *
 * A master/detail list rather than a table: a lead's fields are defined by its
 * form, so different rows genuinely have different columns. A table would either
 * explode into a column per field key across every form, or hide the actual
 * message behind a "view" click — which is the one thing the user came here for.
 */

import { use, useCallback, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCheck,
  Download,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  MessageCircle,
  Phone,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { useApi } from "@/lib/api/useApi";
import { siteFormApi, type LeadDto, type LeadStatusDto } from "@/lib/api/site";
import { ApiClientError } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

const STATUS_TABS: Array<{ value: LeadStatusDto | "ALL"; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "NEW", label: "Unread" },
  { value: "REPLIED", label: "Replied" },
  { value: "ARCHIVED", label: "Archived" },
  { value: "SPAM", label: "Spam" },
];

const EMPTY_COUNTS: Record<LeadStatusDto, number> = {
  NEW: 0,
  READ: 0,
  REPLIED: 0,
  SPAM: 0,
  ARCHIVED: 0,
};

export default function LeadsPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = use(params);

  const [status, setStatus] = useState<LeadStatusDto | "ALL">("ALL");
  const [formId, setFormId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const forms = useApi(() => siteFormApi.listForms(siteId), [siteId]);
  const leads = useApi(
    () =>
      siteFormApi.listLeads(siteId, {
        page,
        pageSize: 25,
        ...(status !== "ALL" ? { status } : {}),
        ...(formId ? { formId } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        includeSpam: status === "SPAM",
      }),
    [siteId, status, formId, search, page],
  );

  const items = leads.data?.items ?? [];
  const selected = items.find((l) => l.id === selectedId) ?? null;

  const refreshAll = useCallback(async () => {
    await Promise.all([leads.refresh(), forms.refresh()]);
  }, [leads, forms]);

  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      setChecked(new Set());
      await refreshAll();
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const bulk = (next: LeadStatusDto) => {
    const ids = Array.from(checked);
    if (ids.length === 0) return;
    void act(
      () => siteFormApi.setLeadStatus(siteId, ids, next),
      `${ids.length} lead(s) moved to ${next.toLowerCase()}`,
    );
  };

  const counts = leads.data?.counts ?? EMPTY_COUNTS;
  const totalUnread = counts.NEW;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/dashboard/website"
            className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to websites
          </Link>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-900">
            Leads
            {totalUnread > 0 && (
              <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">
                {totalUnread} new
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every enquiry submitted through your website forms.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={siteFormApi.exportUrl(siteId, {
              ...(formId ? { formId } : {}),
              includeSpam: status === "SPAM",
            })}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </a>
          <Link
            href={`/dashboard/website/${siteId}/forms`}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Manage forms
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-slate-100 p-0.5">
          {STATUS_TABS.map((tab) => {
            const count =
              tab.value === "ALL"
                ? counts.NEW + counts.READ + counts.REPLIED + counts.ARCHIVED
                : counts[tab.value];
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => {
                  setStatus(tab.value);
                  setPage(1);
                  setSelectedId(null);
                }}
                aria-pressed={status === tab.value}
                className={cn(
                  "flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors",
                  status === tab.value
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700",
                )}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] font-semibold",
                      tab.value === "NEW"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-200 text-slate-600",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {(forms.data?.length ?? 0) > 1 && (
          <select
            value={formId}
            onChange={(e) => {
              setFormId(e.target.value);
              setPage(1);
            }}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
          >
            <option value="">All forms</option>
            {forms.data?.map((form) => (
              <option key={form.id} value={form.id}>
                {form.name}
              </option>
            ))}
          </select>
        )}

        <div className="relative ml-auto">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, phone"
            className="w-56 rounded-lg border border-slate-200 py-1.5 pl-8 pr-2 text-xs focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Bulk toolbar */}
      {checked.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
          <span className="text-xs font-medium text-blue-900">{checked.size} selected</span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <BulkButton onClick={() => bulk("READ")} disabled={busy}>
              <MailOpen className="h-3 w-3" />
              Mark read
            </BulkButton>
            <BulkButton onClick={() => bulk("REPLIED")} disabled={busy}>
              <CheckCheck className="h-3 w-3" />
              Replied
            </BulkButton>
            <BulkButton onClick={() => bulk("ARCHIVED")} disabled={busy}>
              Archive
            </BulkButton>
            <BulkButton onClick={() => bulk("SPAM")} disabled={busy}>
              <AlertTriangle className="h-3 w-3" />
              Spam
            </BulkButton>
          </div>
        </div>
      )}

      {leads.loading && (
        <div className="flex items-center justify-center py-16 text-sm text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Loading leads…
        </div>
      )}

      {leads.error && !leads.loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {leads.error.message}
        </div>
      )}

      {!leads.loading && !leads.error && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <Inbox className="mx-auto h-9 w-9 text-slate-300" />
          <h2 className="mt-3 text-base font-semibold text-slate-800">
            {search || status !== "ALL" ? "No matching leads" : "No leads yet"}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            {search || status !== "ALL"
              ? "Try clearing your filters."
              : "When someone submits a form on your published website, their enquiry appears here straight away."}
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* List */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
              <input
                type="checkbox"
                aria-label="Select all on this page"
                checked={checked.size > 0 && checked.size === items.length}
                onChange={(e) =>
                  setChecked(e.target.checked ? new Set(items.map((l) => l.id)) : new Set())
                }
                className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
              />
              <span className="text-[11px] text-slate-500">
                {leads.data?.total ?? 0} lead{(leads.data?.total ?? 0) === 1 ? "" : "s"}
              </span>
            </div>

            <ul className="divide-y divide-slate-100">
              {items.map((lead) => (
                <li key={lead.id}>
                  <div
                    className={cn(
                      "flex items-start gap-2 px-3 py-3 transition-colors",
                      selectedId === lead.id ? "bg-blue-50" : "hover:bg-slate-50",
                    )}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select lead from ${lead.name ?? "unknown"}`}
                      checked={checked.has(lead.id)}
                      onChange={(e) =>
                        setChecked((prev) => {
                          const next = new Set(prev);
                          if (e.target.checked) next.add(lead.id);
                          else next.delete(lead.id);
                          return next;
                        })
                      }
                      className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-blue-600"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedId(lead.id)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span className="flex items-center gap-1.5">
                        {lead.status === "NEW" && (
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-600"
                            aria-label="Unread"
                          />
                        )}
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate text-sm",
                            lead.status === "NEW"
                              ? "font-semibold text-slate-900"
                              : "font-medium text-slate-700",
                          )}
                        >
                          {lead.name || lead.email || lead.phone || "Unnamed enquiry"}
                        </span>
                        <StatusPill status={lead.status} />
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-slate-500">
                        {lead.fields.find((f) => f.value && f.key !== "name")?.value ??
                          "No message"}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[10px] text-slate-400">
                        <time dateTime={lead.createdAt}>{formatWhen(lead.createdAt)}</time>
                        {lead.formName && <span className="truncate">· {lead.formName}</span>}
                      </span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {(leads.data?.totalPages ?? 1) > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-[11px] text-slate-500">
                  Page {leads.data?.page} of {leads.data?.totalPages}
                </span>
                <button
                  type="button"
                  disabled={!leads.data?.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Detail */}
          <div className="rounded-xl border border-slate-200 bg-white">
            {selected ? (
              <LeadDetail
                siteId={siteId}
                lead={selected}
                busy={busy}
                onAct={act}
                onDeleted={() => {
                  setSelectedId(null);
                  void refreshAll();
                }}
              />
            ) : (
              <p className="px-6 py-16 text-center text-sm text-slate-500">
                Select a lead to read it.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Detail
// =====================================================================

function LeadDetail({
  siteId,
  lead,
  busy,
  onAct,
  onDeleted,
}: {
  siteId: string;
  lead: LeadDto;
  busy: boolean;
  onAct: (fn: () => Promise<unknown>, success: string) => Promise<void>;
  onDeleted: () => void;
}) {
  // Prefilled reply links, so responding is one tap rather than copy-paste.
  const mailto = lead.email
    ? `mailto:${lead.email}?subject=${encodeURIComponent("Re: your enquiry")}`
    : null;
  const tel = lead.phone ? `tel:${lead.phone.replace(/[^\d+]/g, "")}` : null;
  const whatsapp = lead.phone
    ? `https://wa.me/${lead.phone.replace(/[^\d]/g, "")}?text=${encodeURIComponent(
        `Hi ${lead.name ?? ""}, thanks for getting in touch.`.trim(),
      )}`
    : null;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-4">
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-slate-900">
            {lead.name || lead.email || lead.phone || "Unnamed enquiry"}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {new Date(lead.createdAt).toLocaleString()}
            {lead.formName && ` · ${lead.formName}`}
            {lead.pagePath && ` · from ${lead.pagePath}`}
          </p>
        </div>
        <StatusPill status={lead.status} />
      </div>

      {lead.spamScore !== null && lead.spamScore >= 0.6 && (
        <div className="flex items-start gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2.5 text-[11px] leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Flagged as likely spam ({Math.round(lead.spamScore * 100)}% confidence). It was kept in
          case the check was wrong.
        </div>
      )}

      {(mailto || tel || whatsapp) && (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 p-3">
          {mailto && (
            <ReplyLink href={mailto}>
              <Mail className="h-3.5 w-3.5" />
              Email
            </ReplyLink>
          )}
          {tel && (
            <ReplyLink href={tel}>
              <Phone className="h-3.5 w-3.5" />
              Call
            </ReplyLink>
          )}
          {whatsapp && (
            <ReplyLink href={whatsapp} external>
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </ReplyLink>
          )}
        </div>
      )}

      <dl className="divide-y divide-slate-100">
        {lead.fields.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-slate-400">
            This submission had no field values.
          </p>
        )}
        {lead.fields.map((field) => (
          <div key={field.key} className="px-4 py-3">
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {field.label}
            </dt>
            <dd className="mt-0.5 whitespace-pre-line break-words text-sm text-slate-800">
              {field.value || <span className="text-slate-400">—</span>}
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 p-3">
        {lead.status !== "REPLIED" && (
          <DetailButton
            disabled={busy}
            onClick={() =>
              void onAct(
                () => siteFormApi.setLeadStatus(siteId, [lead.id], "REPLIED"),
                "Marked as replied",
              )
            }
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark replied
          </DetailButton>
        )}
        {lead.status !== "ARCHIVED" && (
          <DetailButton
            disabled={busy}
            onClick={() =>
              void onAct(
                () => siteFormApi.setLeadStatus(siteId, [lead.id], "ARCHIVED"),
                "Lead archived",
              )
            }
          >
            Archive
          </DetailButton>
        )}
        {lead.status !== "SPAM" ? (
          <DetailButton
            disabled={busy}
            onClick={() =>
              void onAct(
                () => siteFormApi.setLeadStatus(siteId, [lead.id], "SPAM"),
                "Marked as spam",
              )
            }
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Spam
          </DetailButton>
        ) : (
          <DetailButton
            disabled={busy}
            onClick={() =>
              void onAct(
                () => siteFormApi.setLeadStatus(siteId, [lead.id], "READ"),
                "Restored from spam",
              )
            }
          >
            Not spam
          </DetailButton>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (
              !window.confirm(
                "Permanently delete this lead? This cannot be undone and removes the customer's details.",
              )
            ) {
              return;
            }
            void onAct(() => siteFormApi.deleteLead(siteId, lead.id), "Lead deleted").then(
              onDeleted,
            );
          }}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </button>
      </div>
    </div>
  );
}

// =====================================================================
// Bits
// =====================================================================

function StatusPill({ status }: { status: LeadStatusDto }) {
  const map: Record<LeadStatusDto, { label: string; className: string }> = {
    NEW: { label: "New", className: "bg-blue-50 text-blue-700" },
    READ: { label: "Read", className: "bg-slate-100 text-slate-600" },
    REPLIED: { label: "Replied", className: "bg-emerald-50 text-emerald-700" },
    SPAM: { label: "Spam", className: "bg-amber-50 text-amber-700" },
    ARCHIVED: { label: "Archived", className: "bg-slate-100 text-slate-500" },
  };
  const entry = map[status];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        entry.className,
      )}
    >
      {entry.label}
    </span>
  );
}

function BulkButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2.5 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-100 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function DetailButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function ReplyLink({
  href,
  external,
  children,
}: {
  href: string;
  external?: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
    >
      {children}
    </a>
  );
}

/** Relative time for recent leads, absolute date for older ones. */
function formatWhen(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
