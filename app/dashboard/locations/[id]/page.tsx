"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useApi } from "@/lib/api/useApi";
import { locationsApi } from "@/lib/api";
import { LocationForm } from "../_components/location-form";
import { HoursEditor } from "./_components/hours-editor";
import { HolidaysPanel } from "./_components/holidays-panel";
import { StaffPanel } from "./_components/staff-panel";

type TabKey = "details" | "hours" | "holidays" | "staff";

const TABS: { key: TabKey; label: string }[] = [
  { key: "details", label: "Details" },
  { key: "hours", label: "Working hours" },
  { key: "holidays", label: "Holiday hours" },
  { key: "staff", label: "Staff" },
];

export default function LocationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [tab, setTab] = useState<TabKey>("details");
  const { data, error, loading, refresh } = useApi(
    () => locationsApi.get(id),
    [id],
  );

  return (
    <>
      <PageHeader
        title={data?.name ?? (loading ? "Loading…" : "Location")}
        description={data ? `${data.city}, ${data.country}` : undefined}
        breadcrumbs={[
          { label: "Locations", href: "/dashboard/locations" },
          { label: data?.name ?? "…" },
        ]}
      />

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition " +
              (tab === t.key
                ? "bg-slate-900 text-white"
                : "text-slate-600 hover:bg-slate-50")
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading…
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Couldn&apos;t load location</div>
            <div className="text-xs">{error.message}</div>
          </div>
        </div>
      )}
      {data && tab === "details" && (
        <LocationForm mode="edit" initial={data} onSaved={() => refresh()} />
      )}
      {data && tab === "hours" && (
        <HoursEditor
          locationId={data.id}
          initial={data.workingHours}
          onSaved={() => refresh()}
        />
      )}
      {data && tab === "holidays" && <HolidaysPanel locationId={data.id} />}
      {data && tab === "staff" && (
        <StaffPanel
          locationId={data.id}
          currentManagerId={data.assignedManagerId}
          onManagerChanged={() => refresh()}
        />
      )}
    </>
  );
}
