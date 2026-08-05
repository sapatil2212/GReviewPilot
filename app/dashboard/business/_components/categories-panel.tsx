"use client";

import { Search, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  businessApi,
  type BusinessCategoryDto,
} from "@/lib/api";
import { Input } from "@/components/dashboard/field";
import { useApi } from "@/lib/api/useApi";
import { EmptyState } from "@/components/dashboard/empty-state";

export function CategoriesPanel() {
  const selections = useApi(() => businessApi.listCategories(), []);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<BusinessCategoryDto[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const q = query.trim();
    if (q.length < 2) {
      setCatalog([]);
      return;
    }
    setCatalogLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await businessApi.catalog({ search: q, pageSize: 20 });
        if (!cancelled) setCatalog(res.items);
      } finally {
        if (!cancelled) setCatalogLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  async function handleAdd(cat: BusinessCategoryDto, asPrimary = false) {
    setBusy(cat.id);
    try {
      await businessApi.addCategory(cat.id, asPrimary);
      toast.success(asPrimary ? "Set as primary" : "Category added");
      await selections.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not add category",
      );
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove(catId: string) {
    setBusy(catId);
    try {
      await businessApi.removeCategory(catId);
      toast.success("Category removed");
      await selections.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove");
    } finally {
      setBusy(null);
    }
  }

  async function handleMakePrimary(catId: string) {
    setBusy(catId);
    try {
      await businessApi.setPrimaryCategory(catId);
      toast.success("Primary category updated");
      await selections.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update");
    } finally {
      setBusy(null);
    }
  }

  const selectedIds = new Set(
    selections.data?.categories.map((c) => c.category.id) ?? [],
  );
  const primaryId = selections.data?.primaryCategoryId ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
      {/* Selected */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Your categories
          </h3>
          <span className="text-xs text-slate-500">
            {(selections.data?.categories.length ?? 0)}/10
          </span>
        </div>
        {selections.loading ? (
          <div className="text-xs text-slate-500">Loading…</div>
        ) : (selections.data?.categories.length ?? 0) === 0 ? (
          <EmptyState
            icon={Star}
            title="No categories yet"
            description="Pick up to 10 categories. The first one is your primary."
          />
        ) : (
          <ul className="space-y-2">
            {selections.data!.categories.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold text-slate-900">
                      {row.category.name}
                    </span>
                    {row.isPrimary && (
                      <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-700">
                        Primary
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {row.category.slug}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!row.isPrimary && (
                    <button
                      onClick={() => handleMakePrimary(row.category.id)}
                      disabled={busy === row.category.id}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Make primary
                    </button>
                  )}
                  <button
                    onClick={() => handleRemove(row.category.id)}
                    disabled={busy === row.category.id}
                    className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Search catalog */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">
          Add from catalog
        </h3>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 60+ categories (min 2 chars)"
            className="pl-8"
          />
        </div>
        <div className="max-h-72 overflow-y-auto pr-1">
          {catalogLoading ? (
            <div className="text-xs text-slate-500">Searching…</div>
          ) : catalog.length === 0 ? (
            <div className="text-xs text-slate-500">
              {query.trim().length < 2
                ? "Start typing to search."
                : "No matches."}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {catalog.map((c) => {
                const isSelected = selectedIds.has(c.id);
                return (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 hover:bg-slate-50"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-slate-800">
                        {c.name}
                      </div>
                      <div className="text-[11px] text-slate-500">{c.slug}</div>
                    </div>
                    {isSelected ? (
                      <span className="text-[11px] font-semibold text-slate-400">
                        Added
                      </span>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleAdd(c, false)}
                          disabled={busy === c.id}
                          className="rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800"
                        >
                          Add
                        </button>
                        {!primaryId && (
                          <button
                            onClick={() => handleAdd(c, true)}
                            disabled={busy === c.id}
                            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                          >
                            Set primary
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
