"use client";

/**
 * /review/[tenantSlug]/[locationSlug]
 *
 * PUBLIC customer review funnel with smart routing (the industry-
 * standard "feedback funnel"):
 *
 *   Rate → 4-5★ → AI drafts 3 reviews → pick one (auto-copy) → Post on Google
 *        → 1-3★ → private feedback form → captured internally
 *
 * Compliant: happy customers are helped to post faster (they choose +
 * submit themselves); unhappy customers get a private channel first but
 * are never blocked from posting publicly. We never auto-submit.
 */

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Sparkles,
  Star,
} from "lucide-react";

interface BusinessInfo {
  business: {
    name: string;
    slug: string;
    logo: string | null;
    industry: string | null;
    description: string | null;
    category: string | null;
  };
  location: { id: string; name: string; slug: string; city: string; country: string };
  stats: { averageRating: number | null; totalReviews: number };
  googleReviewUrl: string;
}

const RATING_META: Record<number, { label: string; emoji: string }> = {
  1: { label: "Very poor", emoji: "😞" },
  2: { label: "Poor", emoji: "😕" },
  3: { label: "Average", emoji: "😐" },
  4: { label: "Good", emoji: "😊" },
  5: { label: "Excellent", emoji: "🤩" },
};

export default function ReviewFunnelPage() {
  const params = useParams<{ tenantSlug: string; locationSlug: string }>();
  const tenantSlug = params.tenantSlug;
  const locationSlug = params.locationSlug;

  const [info, setInfo] = useState<BusinessInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [step, setStep] = useState<"rate" | "choose" | "post" | "feedback" | "thanks">("rate");

  const [options, setOptions] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const [fbComment, setFbComment] = useState("");
  const [fbName, setFbName] = useState("");
  const [fbPhone, setFbPhone] = useState("");
  const [fbSubmitting, setFbSubmitting] = useState(false);

  const sessionIdRef = useRef<string>("");

  useEffect(() => {
    let sid = sessionStorage.getItem("grp-funnel-sid");
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem("grp-funnel-sid", sid);
    }
    sessionIdRef.current = sid;
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/review/${tenantSlug}/${locationSlug}`)
      .then(async (res) => {
        const data = await res.json();
        if (!data.success) {
          setError(data.error?.message ?? "Could not load business info");
          return;
        }
        setInfo(data.data);
        track("PAGE_VIEW");
      })
      .catch(() => setError("Network error"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug, locationSlug]);

  function track(stepName: string, starRating?: number) {
    fetch(`/api/review/${tenantSlug}/${locationSlug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: stepName, starRating, sessionId: sessionIdRef.current }),
    }).catch(() => {});
  }

  async function pickRating(value: number) {
    setRating(value);
    track("STAR_SELECTED", value);
    if (value >= 4) {
      await generate(value);
    } else {
      setStep("feedback");
    }
  }

  async function generate(value: number) {
    setGenerating(true);
    setSelectedIndex(null);
    setCopied(false);
    setStep("choose");
    try {
      const res = await fetch(`/api/review/${tenantSlug}/${locationSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starRating: value,
          count: 3,
          sessionId: sessionIdRef.current,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error?.message ?? "Generation failed");
        return;
      }
      setOptions(data.data.options ?? []);
    } catch {
      setError("Couldn't generate. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  async function selectOption(index: number) {
    setSelectedIndex(index);
    try {
      await navigator.clipboard.writeText(options[index]!);
      setCopied(true);
      track("REVIEW_COPIED", rating);
    } catch {
      setCopied(false);
    }
    setStep("post");
  }

  function goToGoogle() {
    track("REDIRECTED_TO_GOOGLE", rating);
    if (info?.googleReviewUrl) window.open(info.googleReviewUrl, "_blank");
  }

  async function submitFeedback() {
    if (!fbComment.trim()) return;
    setFbSubmitting(true);
    try {
      await fetch(`/api/review/${tenantSlug}/${locationSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "feedback",
          rating,
          comment: fbComment.trim(),
          customerName: fbName.trim() || undefined,
          customerPhone: fbPhone.trim() || undefined,
          sessionId: sessionIdRef.current,
        }),
      });
      setStep("thanks");
    } catch {
      setError("Couldn't submit. Please try again.");
    } finally {
      setFbSubmitting(false);
    }
  }

  // ---------- render ----------

  if (loading) {
    return (
      <Shell>
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
        </div>
      </Shell>
    );
  }

  if (error && !info) {
    return (
      <Shell>
        <div className="p-6 text-center">
          <div className="text-sm font-semibold text-slate-900">
            This review link isn&apos;t available
          </div>
          <p className="mt-1 text-xs text-slate-500">{error}</p>
        </div>
      </Shell>
    );
  }

  if (!info) return null;

  const initials = info.location.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <Shell>
      {/* Header */}
      <div className="flex flex-col items-center px-6 pt-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 text-lg font-bold text-white shadow-lg ring-4 ring-white">
          {initials}
        </div>
        <h1 className="mt-2.5 text-[15px] font-bold tracking-tight text-slate-900">
          {info.location.name}
        </h1>
        <p className="text-[12px] text-slate-500">
          {[info.location.city, info.location.country]
            .filter(Boolean)
            .join(", ")}
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          {info.business.category && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
              {info.business.category}
            </span>
          )}
          {info.stats.averageRating != null && info.stats.totalReviews > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {info.stats.averageRating} · {info.stats.totalReviews} reviews
            </span>
          )}
        </div>
      </div>

      <div className="px-5 pb-7 pt-5">
        {/* STEP: RATE */}
        {step === "rate" && (
          <div className="animate-in fade-in duration-300">
            <p className="text-center text-[14px] font-semibold text-slate-800">
              How was your experience?
            </p>
            <p className="mt-0.5 text-center text-[11px] text-slate-400">
              Tap a star to begin
            </p>
            <div className="mt-3.5 flex justify-center gap-1.5">
              {[1, 2, 3, 4, 5].map((v) => {
                const active = (hoverRating || rating) >= v;
                return (
                  <button
                    key={v}
                    onClick={() => pickRating(v)}
                    onMouseEnter={() => setHoverRating(v)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="rounded-xl p-1 transition-transform duration-150 hover:scale-125 active:scale-110"
                    aria-label={`${v} star${v > 1 ? "s" : ""}`}
                  >
                    <Star
                      className={
                        "h-9 w-9 transition-colors " +
                        (active
                          ? "fill-amber-400 text-amber-400 drop-shadow-sm"
                          : "fill-slate-100 text-slate-200")
                      }
                    />
                  </button>
                );
              })}
            </div>
            <div className="mt-3 h-5 text-center">
              {(hoverRating || rating) > 0 && (
                <span className="text-[13px] font-medium text-slate-600">
                  {RATING_META[hoverRating || rating]?.emoji}{" "}
                  {RATING_META[hoverRating || rating]?.label}
                </span>
              )}
            </div>
          </div>
        )}

        {/* STEP: CHOOSE (4-5★) */}
        {step === "choose" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <button
              onClick={() => setStep("rate")}
              className="mb-3 inline-flex items-center gap-1 text-[12px] font-medium text-slate-400 hover:text-slate-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="mb-3 flex items-center justify-center gap-1.5 text-[13px] font-semibold text-slate-700">
              <Sparkles className="h-4 w-4 text-blue-500" />
              Pick the review that fits — we&apos;ll copy it for you
            </div>

            {generating ? (
              <div className="space-y-2.5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-[72px] animate-pulse rounded-2xl bg-slate-100"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2.5">
                {options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => selectOption(i)}
                    className="group w-full rounded-xl border border-slate-200 bg-white p-3 text-left transition-all hover:border-blue-300 hover:bg-blue-50/40 active:scale-[0.99]"
                  >
                    <p className="text-[12.5px] leading-relaxed text-slate-700">
                      {opt}
                    </p>
                    <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-blue-600 opacity-0 transition-opacity group-hover:opacity-100">
                      <Check className="h-3 w-3" /> Use this one
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => generate(rating)}
                  className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[12px] font-semibold text-slate-500 hover:text-slate-700"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Show me different options
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP: POST (4-5★) */}
        {step === "post" && selectedIndex != null && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-50 py-2.5 text-[12px] font-semibold text-emerald-700">
              <ClipboardCheck className="h-4 w-4" />
              {copied ? "Copied — ready to paste" : "Your review is ready"}
            </div>

            <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-700">
              &ldquo;{options[selectedIndex]}&rdquo;
            </div>

            <p className="mt-3 text-center text-[12px] text-slate-500">
              Tap below, then <b>paste</b> &amp; <b>Post</b> on Google — takes 5
              seconds.
            </p>

            <button
              onClick={goToGoogle}
              className="mt-3 flex w-full items-center justify-center gap-2.5 rounded-xl bg-white px-4 py-3 text-[13px] font-semibold text-slate-700 shadow-md ring-1 ring-slate-200 transition hover:shadow-lg active:scale-[0.99]"
            >
              <GoogleG />
              Post on Google
            </button>

            <div className="mt-2 flex gap-2">
              <button
                onClick={() => setStep("choose")}
                className="flex-1 rounded-xl py-2 text-[12px] font-semibold text-slate-500 hover:text-slate-700"
              >
                Pick another
              </button>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(options[selectedIndex]!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {}
                }}
                className="flex-1 rounded-xl py-2 text-[12px] font-semibold text-slate-500 hover:text-slate-700"
              >
                {copied ? "Copied ✓" : "Copy again"}
              </button>
            </div>
          </div>
        )}

        {/* STEP: FEEDBACK (1-3★) */}
        {step === "feedback" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <button
              onClick={() => setStep("rate")}
              className="mb-3 inline-flex items-center gap-1 text-[12px] font-medium text-slate-400 hover:text-slate-600"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <p className="text-center text-[14px] font-semibold text-slate-800">
              We&apos;re sorry it wasn&apos;t great
            </p>
            <p className="mt-1 text-center text-[11.5px] text-slate-500">
              Tell us what went wrong — it goes straight to the owner, privately.
              We&apos;d love the chance to make it right.
            </p>

            <textarea
              value={fbComment}
              onChange={(e) => setFbComment(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="What happened?"
              className="mt-3 w-full resize-none rounded-xl border border-slate-200 p-2.5 text-[12.5px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <input
                value={fbName}
                onChange={(e) => setFbName(e.target.value)}
                placeholder="Your name (optional)"
                maxLength={200}
                className="rounded-xl border border-slate-200 px-2.5 py-2 text-[12px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
              <input
                value={fbPhone}
                onChange={(e) => setFbPhone(e.target.value)}
                placeholder="Phone (optional)"
                maxLength={30}
                className="rounded-xl border border-slate-200 px-2.5 py-2 text-[12px] text-slate-800 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <button
              onClick={submitFeedback}
              disabled={fbSubmitting || !fbComment.trim()}
              className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-3 text-[13px] font-semibold text-white shadow-md transition hover:bg-slate-800 disabled:opacity-60"
            >
              {fbSubmitting ? "Sending…" : "Send private feedback"}
            </button>
          </div>
        )}

        {/* STEP: THANKS (after feedback) */}
        {step === "thanks" && (
          <div className="animate-in fade-in zoom-in-95 duration-300 py-4 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
              <Check className="h-7 w-7 text-emerald-600" />
            </div>
            <p className="mt-3 text-[15px] font-semibold text-slate-900">
              Thank you for the feedback
            </p>
            <p className="mt-1 text-[13px] text-slate-500">
              {info.business.name} has received your message and will look into
              it. We appreciate you giving us the chance to improve.
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 py-3 text-center text-[10px] text-slate-300">
        Powered by GReviewPilot
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f1f5f9] px-4 py-8">
      <div className="w-full max-w-[400px] overflow-hidden rounded-3xl bg-white shadow-[0_10px_40px_-12px_rgba(15,23,42,0.25)]">
        {children}
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.5 13 17.8 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.6c0-1.6-.1-3.2-.4-4.7H24v9h12.7c-.6 3-2.3 5.5-4.9 7.2l7.7 6c4.5-4.2 7-10.4 7-17.5z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C1 16.7 0 20.2 0 24s1 7.3 2.6 10.8l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.2 15.9-5.9l-7.7-6c-2.2 1.5-5 2.4-8.2 2.4-6.2 0-11.5-3.5-13.5-9.3l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}
