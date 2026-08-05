"use client";

/**
 * /dashboard/reviews — Real reviews management page (replaces the old mock).
 */

import { useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  MessageSquare,
  Search,
  Send,
  Sparkles,
  Star,
} from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { PaginationBar } from "@/components/dashboard/pagination-bar";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Field, Input, Select, Textarea } from "@/components/dashboard/field";
import { ConfirmDialog } from "@/components/dashboard/confirm-dialog";
import { useApi } from "@/lib/api/useApi";
import { reviewsApi, type ReviewDto } from "@/lib/api";
import { ReplyDialog } from "./_components/reply-dialog";

const STATUSES = ["", "NEW", "REPLIED", "ARCHIVED", "FLAGGED"] as const;
const RATINGS = ["", "1", "2", "3", "4", "5"] as const;
const SENTIMENTS = ["", "POSITIVE", "NEUTRAL", "NEGATIVE", "MIXED"] as const;

export default function ReviewsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [minRating, setMinRating] = useState("");
  const [sentiment, setSentiment] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [replyTo, setReplyTo] = useState<ReviewDto | null>(null);
  const [bulkReplyOpen, setBulkReplyOpen] = useState(false);
  const [bulkReplyText, setBulkReplyText] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const list = useApi(
    () =>
      reviewsApi.list({
        page,
        pageSize: 15,
        search: search.trim() || undefined,
        status: status || undefined,
        minRating: minRating ? Number(minRating) : undefined,
        sentiment: sentiment || undefined,
        sortBy: "reviewCreatedAt",
        sortDir: "desc",
      }),
    [page, search, status, minRating, sentiment],
  );

  const stats = useApi(() => reviewsApi.stats(), []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Backfill sentiment in batches. The endpoint caps each call, so we
   * loop until nothing is left (bounded, to avoid a runaway client loop).
   */
  async function handleAnalyzeSentiment() {
    setAnalyzing(true);
    try {
      let total = 0;
      for (let pass = 0; pass < 20; pass++) {
        const res = await reviewsApi.analyzeSentiment(25);
        total += res.analyzed;
        if (res.analyzed === 0 || res.remaining === 0) break;
      }
      toast.success(
        total > 0
          ? `Analyzed ${total} review${total === 1 ? "" : "s"}`
          : "All reviews are already analyzed",
      );
      await list.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleArchive(id: string, archive: boolean) {
    try {
      if (archive) await reviewsApi.archive(id);
      else await reviewsApi.unarchive(id);
      toast.success(archive ? "Archived" : "Unarchived");
      await list.refresh();
      await stats.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  async function handleBulkReply() {
    if (!bulkReplyText.trim()) return;
    setBusy(true);
    try {
      const result = await reviewsApi.bulkReply(
        [...selected],
        bulkReplyText.trim(),
      );
      toast.success(`Replied to ${result.replied} reviews`);
      setSelected(new Set());
      setBulkReplyOpen(false);
      setBulkReplyText("");
      await list.refresh();
      await stats.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk reply failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkArchive(archive: boolean) {
    setBusy(true);
    try {
      const result = await reviewsApi.bulkArchive([...selected], archive);
      toast.success(
        archive
          ? `Archived ${result.affected} reviews`
          : `Unarchived ${result.affected} reviews`,
      );
      setSelected(new Set());
      await list.refresh();
      await stats.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Bulk archive failed");
    } finally {
      setBusy(false);
    }
  }

  const s = stats.data;

  return (
    <>
      <PageHeader
        title="Reviews"
        description="View, reply, tag, and manage customer reviews across all locations."
        actions={
          <>
            {selected.size > 0 && (
              <>
                <button
                  onClick={() => setBulkReplyOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  Reply ({selected.size})
                </button>
                <button
                  onClick={() => handleBulkArchive(true)}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Archive className="h-3.5 w-3.5" />
                  Archive ({selected.size})
                </button>
              </>
            )}
            <button
              onClick={handleAnalyzeSentiment}
              disabled={analyzing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              title="Classify sentiment for reviews that haven't been analyzed"
            >
              <Sparkles
                className={"h-3.5 w-3.5 " + (analyzing ? "animate-pulse" : "")}
              />
              {analyzing ? "Analyzing…" : "Analyze sentiment"}
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              + Add review
            </button>
          </>
        }
      />

      {/* Stats row */}
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { label: "Total", value: s.total },
            { label: "Pending", value: s.pending },
            { label: "Replied", value: s.replied },
            { label: "Archived", value: s.archived },
            {
              label: "Avg rating",
              value: s.averageRating ? `${s.averageRating} ★` : "—",
            },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-slate-200 bg-white p-3 text-center"
            >
              <div className="text-lg font-bold text-slate-900">{c.value}</div>
              <div className="text-[11px] text-slate-500">{c.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
          <Field label="Search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => {
                  setPage(1);
                  setSearch(e.target.value);
                }}
                placeholder="Reviewer name or comment"
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
                <option key={s} value={s}>{s || "All"}</option>
              ))}
            </Select>
          </Field>
          <Field label="Min rating">
            <Select
              value={minRating}
              onChange={(e) => {
                setPage(1);
                setMinRating(e.target.value);
              }}
            >
              {RATINGS.map((r) => (
                <option key={r} value={r}>{r || "Any"}</option>
              ))}
            </Select>
          </Field>
          <Field label="Sentiment">
            <Select
              value={sentiment}
              onChange={(e) => {
                setPage(1);
                setSentiment(e.target.value);
              }}
            >
              {SENTIMENTS.map((s) => (
                <option key={s} value={s}>{s || "Any"}</option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-slate-200 bg-white">
        {list.loading ? (
          <div className="p-6 text-sm text-slate-500">Loading reviews…</div>
        ) : (list.data?.items.length ?? 0) === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={Star}
              title="No reviews yet"
              description="Once you sync your Google Business Profile or add manual reviews, they'll appear here."
            />
          </div>
        ) : (
          <>
            <div className="divide-y divide-slate-100">
              {list.data!.items.map((r) => {
                const activeReply = r.replies.find((rp) => !rp.deletedAt);
                return (
                  <div
                    key={r.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/50"
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900">
                          {r.reviewerName ?? "Anonymous"}
                        </span>
                        <span className="text-xs text-amber-500">
                          {"★".repeat(r.starRating)}
                          {"☆".repeat(5 - r.starRating)}
                        </span>
                        <StatusPill status={r.status} />
                        {r.sentiment && (
                          <SentimentPill sentiment={r.sentiment} />
                        )}
                        <span className="text-[11px] text-slate-400">
                          {new Date(r.reviewCreatedAt).toLocaleDateString()}
                        </span>
                      </div>
                      {r.comment && (
                        <p className="mt-1 line-clamp-2 text-xs text-slate-700">
                          {r.comment}
                        </p>
                      )}
                      {r.location && (
                        <div className="mt-0.5 text-[11px] text-slate-500">
                          📍 {r.location.name}, {r.location.city}
                        </div>
                      )}
                      {activeReply && (
                        <div className="mt-1.5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-1.5 text-[11px] text-slate-700">
                          <span className="font-semibold text-blue-700">
                            Reply:
                          </span>{" "}
                          <span className="line-clamp-1">
                            {activeReply.comment}
                          </span>
                        </div>
                      )}
                      {r.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {r.tags.map((t) => (
                            <span
                              key={t.id}
                              className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
                              style={{
                                borderColor: t.tag.color ?? "#cbd5e1",
                                color: t.tag.color ?? "#475569",
                              }}
                            >
                              {t.tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {!r.isArchived && (
                        <button
                          onClick={() => setReplyTo(r)}
                          className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600"
                          title={activeReply ? "Manage reply" : "Reply"}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => handleArchive(r.id, !r.isArchived)}
                        className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-100"
                        title={r.isArchived ? "Unarchive" : "Archive"}
                      >
                        {r.isArchived ? (
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        ) : (
                          <Archive className="h-3.5 w-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
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

      {/* Reply manager — new reply, edit, delete, history, AI draft */}
      {replyTo && (
        <ReplyDialog
          review={replyTo}
          onClose={() => setReplyTo(null)}
          onChanged={async () => {
            await list.refresh();
            await stats.refresh();
          }}
        />
      )}

      {/* Bulk reply dialog */}
      <ConfirmDialog
        open={bulkReplyOpen}
        title={`Reply to ${selected.size} review${selected.size === 1 ? "" : "s"}`}
        description="The same reply will be applied to all selected reviews."
        confirmLabel={busy ? "Sending…" : "Send"}
        loading={busy}
        onConfirm={handleBulkReply}
        onCancel={() => setBulkReplyOpen(false)}
      />
      {bulkReplyOpen && (
        <div className="fixed inset-x-0 bottom-24 z-[61] flex justify-center">
          <div className="w-full max-w-md px-4">
            <Textarea
              rows={3}
              value={bulkReplyText}
              onChange={(e) => setBulkReplyText(e.target.value)}
              placeholder="Write a reply for all selected reviews…"
              maxLength={4096}
            />
          </div>
        </div>
      )}

      {/* Add manual review dialog */}
      {addOpen && (
        <AddReviewDialog
          onClose={() => setAddOpen(false)}
          onCreated={async () => {
            await list.refresh();
            await stats.refresh();
          }}
        />
      )}
    </>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    NEW: "bg-blue-100 text-blue-700",
    REPLIED: "bg-emerald-100 text-emerald-700",
    ARCHIVED: "bg-slate-200 text-slate-600",
    FLAGGED: "bg-red-100 text-red-700",
  };
  return (
    <span
      className={
        "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
        (map[status] ?? "bg-slate-100 text-slate-600")
      }
    >
      {status}
    </span>
  );
}

function SentimentPill({ sentiment }: { sentiment: string }) {
  const map: Record<string, string> = {
    POSITIVE: "bg-emerald-100 text-emerald-700",
    NEUTRAL: "bg-slate-100 text-slate-600",
    NEGATIVE: "bg-red-100 text-red-700",
    MIXED: "bg-amber-100 text-amber-700",
  };
  return (
    <span
      className={
        "inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
        (map[sentiment] ?? "bg-slate-100 text-slate-600")
      }
    >
      {sentiment}
    </span>
  );
}

function AddReviewDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await reviewsApi.createManual({
        reviewerName: name.trim() || undefined,
        starRating: Number(rating),
        comment: comment.trim() || undefined,
      });
      toast.success("Review added");
      await onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white p-5">
        <h3 className="text-sm font-semibold text-slate-900">
          Add a manual review
        </h3>
        <p className="text-xs text-slate-500">
          Use this to log reviews received outside Google (walk-ins, phone, etc).
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field label="Reviewer name">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              maxLength={200}
            />
          </Field>
          <Field label="Star rating" required>
            <Select
              value={rating}
              onChange={(e) => setRating(e.target.value)}
            >
              {[5, 4, 3, 2, 1].map((r) => (
                <option key={r} value={String(r)}>
                  {r} {"★".repeat(r)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Comment">
            <Textarea
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What did they say?"
              maxLength={10000}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Adding…" : "Add review"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
