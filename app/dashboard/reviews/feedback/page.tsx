"use client";

/**
 * /dashboard/reviews/feedback — private feedback inbox from the funnel.
 * These are 1-3★ submissions the funnel routed away from Google so the
 * business can resolve them privately.
 */

import { useState } from "react";
import { toast } from "sonner";
import { MessageSquareWarning, Phone, Search, Star } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Field, Input, Select } from "@/components/dashboard/field";
import { useApi } from "@/lib/api/useApi";
import { reviewsApi, type PrivateFeedbackDto } from "@/lib/api";

const STATUSES = ["", "NEW", "IN_PROGRESS", "RESOLVED", "DISMISSED"] as const;
const STATUS_OPTS = ["NEW", "IN_PROGRESS", "RESOLVED", "DISMISSED"];

export default function PrivateFeedbackPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const list = useApi(
    () =>
      reviewsApi.listFeedback({
        page,
        pageSize: 15,
        search: search.trim() || undefined,
        status: status || undefined,
        sortBy: "createdAt",
        sortDir: "desc",
      }),
    [page, search, status],
  );

  async function changeStatus(f: PrivateFeedbackDto, next: string) {
    setBusyId(f.id);
    try {
      await reviewsApi.updateFeedback(f.id, { status: next });
      toast.success("Status updated");
      await list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Private Feedback"
        description="Low-rating submissions captured privately by your review funnel — resolve them before they become public reviews."
        breadcrumbs={[{ label: "Private Feedback" }]}
      />

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Comment, name, phone"
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
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s || "All"}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        {list.loading ? (
          <div className="p-6 text-sm text-slate-500">Loading…</div>
        ) : (list.data?.items.length ?? 0) === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={MessageSquareWarning}
              title="No private feedback yet"
              description="When customers rate 1-3 stars in your funnel, their feedback lands here instead of on Google."
            />
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {list.data!.items.map((f) => (
                <div key={f.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-0.5 text-amber-500">
                      {[1, 2, 3, 4, 5].map((v) => (
                        <Star
                          key={v}
                          className={
                            "h-3 w-3 " +
                            (v <= f.rating
                              ? "fill-amber-400 text-amber-400"
                              : "fill-slate-200 text-slate-200")
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-slate-700">{f.comment}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                      {f.customerName && <span>{f.customerName}</span>}
                      {f.customerPhone && (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {f.customerPhone}
                        </span>
                      )}
                      {f.location && <span>📍 {f.location.name}</span>}
                      <span>{new Date(f.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                  <Select
                    value={f.status}
                    disabled={busyId === f.id}
                    onChange={(e) => changeStatus(f, e.target.value)}
                    className="max-w-[140px]"
                  >
                    {STATUS_OPTS.map((s) => (
                      <option key={s} value={s}>
                        {s.replaceAll("_", " ")}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
            <PaginationBar
              page={list.data!.page}
              pageSize={list.data!.pageSize}
              total={list.data!.total}
              totalPages={list.data!.totalPages}
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </>
  );
}
