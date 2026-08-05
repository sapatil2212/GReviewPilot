"use client";

/**
 * /dashboard/locations — branch hub.
 *
 * Mirrors the Google Business integrations layout: KPI summary cards on
 * top, then a card grid where each branch surfaces its Google connection
 * state (Place ID linked or not) alongside contact details and actions.
 */

import Link from "next/link";
import { useState } from "react";
import {
  Archive,
  Building2,
  CheckCircle2,
  Link2Off,
  Mail,
  MapPin,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { Field, Input, Select } from "@/components/dashboard/field";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { useApi } from "@/lib/api/useApi";
import { locationsApi, type LocationDto } from "@/lib/api";

const STATUS_OPTIONS = ["", "ACTIVE", "INACTIVE", "ARCHIVED"] as const;

export default function LocationsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [pending, setPending] = useState<{
    id: string;
    action: "archive" | "restore" | "delete";
    name: string;
  } | null>(null);

  const { data, loading, refresh } = useApi(
    () =>
      locationsApi.list({
        page,
        pageSize: 12,
        search: search.trim() || undefined,
        status: status || undefined,
        includeDeleted: includeDeleted || undefined,
        sortDir: "desc",
      }),
    [page, search, status, includeDeleted],
  );

  // Unfiltered snapshot used only for the KPI row, so the numbers reflect
  // the whole workspace rather than the current filter/page.
  const all = useApi(() => locationsApi.list({ pageSize: 100 }), []);
  const allItems = all.data?.items ?? [];
  const totalCount = all.data?.total ?? 0;
  const activeCount = allItems.filter((l) => l.status === "ACTIVE").length;
  const linkedCount = allItems.filter((l) => !!l.googlePlaceId).length;
  const unlinkedCount = allItems.filter(
    (l) => !l.googlePlaceId && l.status === "ACTIVE",
  ).length;

  async function handleConfirm() {
    if (!pending) return;
    try {
      if (pending.action === "archive") {
        await locationsApi.archive(pending.id);
        toast.success("Location archived");
      } else if (pending.action === "restore") {
        await locationsApi.restore(pending.id);
        toast.success("Location restored");
      } else {
        await locationsApi.remove(pending.id);
        toast.success("Location deleted");
      }
      await Promise.all([refresh(), all.refresh()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Locations"
        description="Every branch or outlet under this workspace. Link each one to Google to unlock review syncing and AI review funnels."
        actions={
          <Link
            href="/dashboard/locations/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New location
          </Link>
        }
      />

      {/* KPI summary */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={Building2}
          label="Total locations"
          value={totalCount}
          accent="blue"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Active"
          value={activeCount}
          accent="emerald"
        />
        <KpiCard
          icon={Sparkles}
          label="Linked to Google"
          value={linkedCount}
          sub="Funnel + review sync ready"
          accent="violet"
        />
        <KpiCard
          icon={Link2Off}
          label="Needs linking"
          value={unlinkedCount}
          sub={unlinkedCount > 0 ? "Active branches without a Place ID" : "All set"}
          accent={unlinkedCount > 0 ? "amber" : "emerald"}
        />
      </div>

      {/* Filters */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Name, city, store code, address"
                className="pl-8"
              />
            </div>
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s || "All"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Include deleted">
            <div className="flex h-9 items-center">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={includeDeleted}
                  onChange={(e) => {
                    setPage(1);
                    setIncludeDeleted(e.target.checked);
                  }}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                Show deleted
              </label>
            </div>
          </Field>
        </div>
      </div>

      {/* Branch cards */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading locations…
        </div>
      ) : (data?.items.length ?? 0) === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <EmptyState
            icon={Building2}
            title="No locations yet"
            description="Add your first branch to start collecting reviews for it."
            action={
              <Link
                href="/dashboard/locations/new"
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                New location
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data!.items.map((loc) => (
              <LocationCard
                key={loc.id}
                loc={loc}
                onArchive={() =>
                  setPending({ id: loc.id, action: "archive", name: loc.name })
                }
                onRestore={() =>
                  setPending({ id: loc.id, action: "restore", name: loc.name })
                }
              />
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-white">
            <PaginationBar
              page={data!.page}
              pageSize={data!.pageSize}
              total={data!.total}
              totalPages={data!.totalPages}
              onPageChange={setPage}
            />
          </div>
        </>
      )}

      <ConfirmDialog
        open={!!pending}
        title={
          pending?.action === "archive"
            ? `Archive ${pending?.name}?`
            : pending?.action === "restore"
              ? `Restore ${pending?.name}?`
              : `Delete ${pending?.name}?`
        }
        description={
          pending?.action === "archive"
            ? "You can restore it later from this same view."
            : pending?.action === "restore"
              ? "The location will be marked ACTIVE again."
              : "Soft delete — the record is retained for recovery."
        }
        destructive={pending?.action === "archive" || pending?.action === "delete"}
        confirmLabel={
          pending?.action === "archive"
            ? "Archive"
            : pending?.action === "restore"
              ? "Restore"
              : "Delete"
        }
        onConfirm={handleConfirm}
        onCancel={() => setPending(null)}
      />
    </>
  );
}

function LocationCard({
  loc,
  onArchive,
  onRestore,
}: {
  loc: LocationDto;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const isDeleted = !!loc.deletedAt;
  const isArchived = loc.status === "ARCHIVED";
  const linked = !!loc.googlePlaceId;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
            <MapPin className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <Link
              href={`/dashboard/locations/${loc.id}`}
              className="block truncate text-sm font-semibold text-slate-900 hover:text-blue-700"
            >
              {loc.name}
            </Link>
            <div className="truncate text-[11px] text-slate-500">
              {loc.city}, {loc.country}
              {loc.storeCode ? ` · ${loc.storeCode}` : ""}
            </div>
          </div>
        </div>
        <StatusBadge status={loc.status} deleted={isDeleted} />
      </div>

      {/* Address */}
      <p className="mt-3 line-clamp-2 text-[11px] leading-snug text-slate-500">
        {[loc.addressLine1, loc.addressLine2, loc.state, loc.postalCode]
          .filter(Boolean)
          .join(", ")}
      </p>

      {/* Contact + manager */}
      <div className="mt-2.5 space-y-1">
        {loc.phone && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <Phone className="h-3 w-3 text-slate-400" />
            <span className="truncate">{loc.phone}</span>
          </div>
        )}
        {loc.email && (
          <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <Mail className="h-3 w-3 text-slate-400" />
            <span className="truncate">{loc.email}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <UserRound className="h-3 w-3 text-slate-400" />
          <span className="truncate">
            {loc.assignedManager
              ? `${loc.assignedManager.firstName} ${loc.assignedManager.lastName}`
              : "No manager assigned"}
          </span>
        </div>
      </div>

      {/* Google connection state */}
      <div className="mt-3">
        {linked ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-emerald-100 bg-emerald-50/60 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Linked to Google
          </div>
        ) : (
          <Link
            href="/dashboard/integrations/google"
            className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100"
          >
            <Link2Off className="h-3.5 w-3.5" />
            Not linked — connect Google
          </Link>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
        <Link
          href={`/dashboard/locations/${loc.id}`}
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-center text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
        >
          Open
        </Link>
        {isDeleted || isArchived ? (
          <button
            onClick={onRestore}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RotateCcw className="h-3 w-3" /> Restore
          </button>
        ) : (
          <button
            onClick={onArchive}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Archive className="h-3 w-3" /> Archive
          </button>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status, deleted }: { status: string; deleted: boolean }) {
  if (deleted) {
    return (
      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
        Deleted
      </span>
    );
  }
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-700",
    INACTIVE: "bg-amber-100 text-amber-700",
    ARCHIVED: "bg-slate-200 text-slate-700",
    DELETED: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
        (map[status] ?? "bg-slate-100 text-slate-600")
      }
    >
      {status}
    </span>
  );
}
