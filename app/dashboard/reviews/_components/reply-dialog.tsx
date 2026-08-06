"use client";

/**
 * Reply manager for a single review.
 *
 * Handles the full reply lifecycle in one place: draft a new reply (with
 * optional AI assist), edit the active reply, delete it, and review the
 * full reply history including previously superseded/deleted replies.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  History,
  Loader2,
  Pencil,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Textarea } from "@/components/dashboard/field";
import { reviewsApi, type ReviewDto } from "@/lib/api";
import { aiReplyApi, type GeneratedDraftDto } from "@/lib/api/ai";

/**
 * There is deliberately no tone selector here any more.
 *
 * Tone used to be a per-reply dropdown, which meant the same business could
 * sound warm on one review and formal on the next, and picking it was a decision
 * on every single reply. It is now part of the Business Personality, configured
 * once in AI Settings and applied to every AI feature — so this dialog just asks
 * for a draft and gets one in the business's own voice.
 */

type Reply = ReviewDto["replies"][number];

export function ReplyDialog({
  review,
  onClose,
  onChanged,
}: {
  review: ReviewDto;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  // Full detail fetch so we get the complete reply history (the list
  // endpoint only returns the active reply).
  const [replies, setReplies] = useState<Reply[]>(review.replies);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  /** Findings from the last draft, so guardrail problems are visible here too. */
  const [draftInfo, setDraftInfo] = useState<GeneratedDraftDto | null>(null);

  const active = replies.find((r) => !r.deletedAt) ?? null;
  const history = replies.filter((r) => r.deletedAt);

  // Edit mode targets the active reply; otherwise we're composing new.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    let cancelled = false;
    reviewsApi
      .get(review.id)
      .then((full) => {
        if (!cancelled) setReplies(full.replies);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });
    return () => {
      cancelled = true;
    };
  }, [review.id]);

  async function reload() {
    const full = await reviewsApi.get(review.id).catch(() => null);
    if (full) setReplies(full.replies);
    await onChanged();
  }

  /**
   * Ask the personality engine for a draft.
   *
   * The engine persists an AiReplyDraft, which is what makes the approval
   * queue, the learning signal, and the analytics work. The text is dropped
   * into the box for editing exactly as before, so sending still goes through
   * the normal reply path.
   */
  async function runAi() {
    setGenerating(true);
    try {
      const draft = await aiReplyApi.generate(review.id, Boolean(text.trim()));
      setText(draft.text);
      setDraftInfo(draft);
      if (draft.escalated) {
        toast.warning("This review needs a careful human answer — read the note below");
      } else {
        toast.success("Draft ready — review and edit before sending");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function send() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      if (editingId) {
        await reviewsApi.editReply(review.id, editingId, text.trim());
        toast.success("Reply updated");
      } else {
        await reviewsApi.reply(review.id, text.trim());
        toast.success("Reply sent");
      }
      setEditingId(null);
      setText("");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeReply(replyId: string) {
    setBusy(true);
    try {
      await reviewsApi.deleteReply(review.id, replyId);
      toast.success("Reply deleted");
      if (editingId === replyId) {
        setEditingId(null);
        setText("");
      }
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(r: Reply) {
    setEditingId(r.id);
    setText(r.comment);
  }

  function cancelEdit() {
    setEditingId(null);
    setText("");
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="my-4 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Reply to {review.reviewerName ?? "anonymous"}
            </h3>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Replies are public on your Google Business Profile.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 flex-1 space-y-3 overflow-y-auto pr-1">
          {/* The review itself */}
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-700">
            <div className="text-amber-500">
              {"★".repeat(review.starRating)}
              {"☆".repeat(5 - review.starRating)}
            </div>
            <p className="mt-1 whitespace-pre-wrap">
              {review.comment ?? "No comment left."}
            </p>
          </div>

          {/* Active reply */}
          {active && !editingId && (
            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold text-blue-700">
                  Current reply
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(active)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-60"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={() => removeReply(active.id)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-red-600 disabled:opacity-60"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
              <p className="whitespace-pre-wrap text-xs text-slate-700">
                {active.comment}
              </p>
              <div className="mt-1 text-[10px] text-slate-400">
                {new Date(active.createdAt).toLocaleString()}
                {active.repliedBy
                  ? ` · ${active.repliedBy.firstName} ${active.repliedBy.lastName}`
                  : ""}
              </div>
            </div>
          )}

          {/* Composer / editor */}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-slate-700">
                {editingId ? "Edit reply" : active ? "Replace with a new reply" : "Write a reply"}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={runAi}
                  disabled={generating || busy}
                  className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" /> Writing…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3 w-3" />
                      {text.trim() ? "Try another" : "AI draft"}
                    </>
                  )}
                </button>
              </div>
            </div>
            <Textarea
              rows={5}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write your reply, or let AI draft one for you…"
              maxLength={4096}
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <Link
                href="/dashboard/ai-assistant"
                className="text-[10px] text-slate-400 hover:text-blue-700 hover:underline"
              >
                Written in your business voice · change it
              </Link>
              <span className="text-[10px] text-slate-400">{text.length}/4096</span>
            </div>

            {/* Engine findings, so a guardrail problem is visible before sending. */}
            {draftInfo?.escalated && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                <p className="text-[11px] text-red-900">
                  <span className="font-semibold">Handle this one personally.</span> It mentions{" "}
                  {draftInfo.escalationReasons.slice(0, 3).join(", ")}. Read the draft carefully
                  before sending, and consider replying offline instead.
                </p>
              </div>
            )}
            {draftInfo?.issues
              .filter((i) => i.severity === "block")
              .map((issue, i) => (
                <div
                  key={i}
                  className="mt-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                  <p className="text-[11px] text-red-900">
                    <span className="font-semibold">Cannot be sent as written:</span> {issue.detail}
                  </p>
                </div>
              ))}
          </div>

          {/* History */}
          {(history.length > 0 || loadingHistory) && (
            <div>
              <button
                onClick={() => setShowHistory((v) => !v)}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800"
              >
                <History className="h-3 w-3" />
                {loadingHistory
                  ? "Loading history…"
                  : showHistory
                    ? "Hide reply history"
                    : `Reply history (${history.length})`}
              </button>
              {showHistory && history.length > 0 && (
                <ul className="mt-2 space-y-2">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/60 p-2.5"
                    >
                      <p className="whitespace-pre-wrap text-[11px] text-slate-600 line-through decoration-slate-300">
                        {h.comment}
                      </p>
                      <div className="mt-1 text-[10px] text-slate-400">
                        Sent {new Date(h.createdAt).toLocaleString()} · removed{" "}
                        {h.deletedAt
                          ? new Date(h.deletedAt).toLocaleString()
                          : "—"}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex justify-end gap-2 border-t border-slate-100 pt-3">
          {editingId ? (
            <button
              onClick={cancelEdit}
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel edit
            </button>
          ) : (
            <button
              onClick={onClose}
              disabled={busy}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          )}
          <button
            onClick={send}
            disabled={busy || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {busy ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </>
            ) : editingId ? (
              "Save changes"
            ) : (
              "Send reply"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
