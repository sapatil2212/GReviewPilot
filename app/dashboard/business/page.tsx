"use client";

/**
 * /dashboard/business — the tenant's business profile.
 *
 * Three sub-tabs: Identity (Tenant + BusinessProfile fields + branding),
 * Categories (max 10 with a primary), Attributes (typed key/value).
 */

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { useApi } from "@/lib/api/useApi";
import { businessApi } from "@/lib/api";
import { IdentityForm } from "./_components/identity-form";
import { CategoriesPanel } from "./_components/categories-panel";
import { AttributesPanel } from "./_components/attributes-panel";

type TabKey = "identity" | "categories" | "attributes";

const TABS: { key: TabKey; label: string }[] = [
  { key: "identity", label: "Identity" },
  { key: "categories", label: "Categories" },
  { key: "attributes", label: "Attributes" },
];

export default function BusinessProfilePage() {
  const [tab, setTab] = useState<TabKey>("identity");
  const { data, error, loading, refresh } = useApi(() => businessApi.get(), []);

  return (
    <>
      <PageHeader
        title="Business Profile"
        description="How your business shows up on Google, review pages, and the customer funnel."
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
          Loading business profile…
        </div>
      )}
      {error && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-semibold">Couldn&apos;t load profile</div>
            <div className="text-xs">{error.message}</div>
          </div>
        </div>
      )}
      {data && tab === "identity" && (
        <IdentityForm initial={data} onUpdated={refresh} />
      )}
      {data && tab === "categories" && <CategoriesPanel />}
      {data && tab === "attributes" && <AttributesPanel />}
    </>
  );
}
