"use client";

/**
 * Preview and testing panel.
 *
 * Lets a business type a hypothetical review and see the reply its answers
 * produce, before it has any real reviews to experiment on. This is the honest
 * substitute for a prompt field: users cannot edit the prompt, so they need a
 * fast way to see the effect of their settings and adjust the settings instead.
 *
 * Persists nothing — the preview endpoint is deliberately read-only.
 */

import { useState } from "react";
import {
  AlertTriangle,
  Ban,
  Eye,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { Field, Textarea, Input } from "@/components/dashboard/field";
import { aiReplyApi, type GeneratedDraftDto } from "@/lib/api/ai";
import { ApiClientError } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

/** Example reviews, so testing does not start from a blank box. */
const SAMPLES: Array<{ label: string; rating: number; comment: string; name: string }> = [
  {
    label: "Glowing",
    rating: 5,
    name: "Priya Sharma",
    comment: "Absolutely painless treatment and the staff were so kind. Highly recommend!",
  },
  {
    label: "Mixed",
    rating: 3,
    name: "Sam Patel",
    comment: "The treatment itself was good but we waited over an hour past our appointment time.",
  },
  {
    label: "Angry",
    rating: 1,
    name: "Tom Blake",
    comment: "Reception was rude, nobody explained the charges, and I left in more pain than I arrived.",
  },
  {
    label: "Rating only",
    rating: 4,
    name: "Anon",
    comment: "",
  },
];

export function ReplyPreview({ ready }: { ready: boolean }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState(SAMPLES[0]!.comment);
  const [name, setName] = useState(SAMPLES[0]!.name);
  const [draft, setDraft] = useState<GeneratedDraftDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const result = await aiReplyApi.preview({
        starRating: rating,
        comment: comment.trim() || undefined,
        reviewerName: name.trim() || undefined,
      });
      setDraft(result);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not generate a preview");
    } finally {
      setBusy(false);
    }
  };

  const applySample = (sample: (typeof SAMPLES)[number]) => {
    setRating(sample.rating);
    setComment(sample.comment);
    setName(sample.name);
    setDraft(null);
  };

  const blocking = draft?.issues.filter((i) => i.severity === "block") ?? [];
  const warnings = draft?.issues.filter((i) => i.severity === "warn") ?? [];

  return (
    <section className="rounded-xl border border-slate-200 bg-white">
      <header className="border-b border-slate-100 px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Eye className="h-4 w-4 text-blue-600" />
          Try it out
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Write a review the way a customer might, and see what your business would say back.
          Nothing here is saved or published.
        </p>
      </header>

      <div className="grid gap-5 p-5 lg:grid-cols-2">
        {/* Input */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1">
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => applySample(s)}
                className="rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:border-blue-300 hover:bg-blue-50"
              >
                {s.label}
              </button>
            ))}
          </div>

          <Field label="Rating" htmlFor="rating">
            <div className="flex items-center gap-1" id="rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  aria-label={`${n} star${n === 1 ? "" : "s"}`}
                  aria-pressed={rating === n}
                  className="rounded p-0.5 hover:bg-slate-100"
                >
                  <Star
                    className={cn(
                      "h-5 w-5",
                      n <= rating ? "fill-amber-400 text-amber-400" : "text-slate-300",
                    )}
                  />
                </button>
              ))}
            </div>
          </Field>

          <Field label="Reviewer name" htmlFor="rn" hint="optional">
            <Input id="rn" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <Field label="What they wrote" htmlFor="rc" hint="leave blank for rating only">
            <Textarea
              id="rc"
              rows={4}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </Field>

          <button
            type="button"
            onClick={() => void run()}
            disabled={busy || !ready}
            title={ready ? undefined : "Finish the required setup steps first"}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : draft ? (
              <RefreshCw className="h-4 w-4" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {busy ? "Writing…" : draft ? "Try again" : "Generate reply"}
          </button>
          {!ready && (
            <p className="text-center text-[11px] text-amber-700">
              Finish the required setup steps to enable this.
            </p>
          )}
        </div>

        {/* Output */}
        <div>
          {!draft && (
            <div className="flex h-full min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 px-4 text-center">
              <Sparkles className="h-6 w-6 text-slate-300" />
              <p className="mt-2 text-xs text-slate-400">
                Your reply will appear here.
              </p>
            </div>
          )}

          {draft && (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                  {draft.text}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge tone="slate">{draft.sentiment.replace(/_/g, " ").toLowerCase()}</Badge>
                <Badge tone="slate">{draft.language}</Badge>
                <Badge tone={draft.source === "ai" ? "blue" : "slate"}>
                  {draft.source === "ai" ? "AI" : "built-in writer"}
                </Badge>
                {draft.attempts > 1 && (
                  <Badge tone="slate">
                    rewritten {draft.attempts - 1}× to avoid repeating itself
                  </Badge>
                )}
              </div>

              {draft.escalated && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" />
                  <div className="text-[11px] text-red-900">
                    <p className="font-semibold">A person should handle this one.</p>
                    <p className="mt-0.5">
                      It mentions {draft.escalationReasons.slice(0, 3).join(", ")}. Reviews like
                      this are never sent automatically, whatever your approval setting.
                    </p>
                  </div>
                </div>
              )}

              {blocking.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-red-900">
                    <Ban className="h-3.5 w-3.5" />
                    Would not be published
                  </p>
                  <ul className="mt-1 space-y-0.5 pl-5">
                    {blocking.map((i, idx) => (
                      <li key={idx} className="list-disc text-[11px] text-red-800">
                        {i.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {warnings.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-900">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Worth a look
                  </p>
                  <ul className="mt-1 space-y-0.5 pl-5">
                    {warnings.map((i, idx) => (
                      <li key={idx} className="list-disc text-[11px] text-amber-800">
                        {i.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/*
                Attribution. Users never see a prompt to edit, so being able to
                trace a reply back to the answers that shaped it is what keeps
                the system explainable rather than magic.
              */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowWhy((v) => !v)}
                  className="text-[11px] font-semibold text-blue-700 hover:underline"
                >
                  {showWhy ? "Hide" : "Why does it say this?"}
                </button>
                {showWhy && (
                  <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[11px] text-slate-500">
                      Your answers became these instructions. Change an answer in the setup steps to
                      change the reply.
                    </p>
                    {draft.sections.map((s) => (
                      <div key={s.id}>
                        <p className="text-[11px] font-semibold text-slate-700">{s.label}</p>
                        <ul className="mt-0.5 space-y-0.5">
                          {s.lines.map((line, i) => (
                            <li key={i} className="text-[11px] leading-snug text-slate-500">
                              {line}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Badge({ children, tone }: { children: React.ReactNode; tone: "slate" | "blue" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone === "blue" ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600",
      )}
    >
      {children}
    </span>
  );
}
