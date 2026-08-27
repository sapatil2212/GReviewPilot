"use client";

import { useState } from "react";
import { CalendarDays, Gift, Loader2, Sparkles, X } from "lucide-react";
import { apiFetch } from "@/lib/fetcher";
import { TRIAL_DAYS } from "@/lib/plans";

type Props = {
  open: boolean;
  firstName: string;
  businessName: string;
  daysRemaining: number | null;
  trialEndsAt: string | null;
  onClose: () => void;
  onSubscribe: () => void;
};

export function WelcomeTrialModal({
  open,
  firstName,
  businessName,
  daysRemaining,
  trialEndsAt,
  onClose,
  onSubscribe,
}: Props) {
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  async function dismiss() {
    setLoading(true);
    try {
      await apiFetch("/api/private/settings/welcome/dismiss", { method: "POST" });
    } catch {
      /* still close locally */
    } finally {
      setLoading(false);
      onClose();
    }
  }

  const endsLabel = trialEndsAt
    ? new Date(trialEndsAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <button
          type="button"
          onClick={dismiss}
          disabled={loading}
          className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="bg-gradient-to-br from-blue-600 to-slate-900 px-6 py-8 text-white">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide">
            <Gift className="h-3.5 w-3.5" />
            Welcome
          </div>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight">
            Welcome{firstName ? `, ${firstName}` : ""}!
          </h2>
          <p className="mt-2 text-sm text-white/80">
            Your workspace{" "}
            <span className="font-medium text-white">{businessName || "is ready"}</span>
            . You have a {TRIAL_DAYS}-day free trial with full access — no credit card
            required.
          </p>
        </div>

        <div className="space-y-3 px-6 py-5">
          <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <CalendarDays className="mt-0.5 h-4 w-4 text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-slate-900">
                {daysRemaining == null
                  ? `${TRIAL_DAYS}-day free trial`
                  : daysRemaining === 1
                    ? "1 day left in your trial"
                    : `${daysRemaining} days left in your trial`}
              </p>
              {endsLabel && (
                <p className="mt-0.5 text-xs text-slate-500">Trial ends {endsLabel}</p>
              )}
            </div>
          </div>

          <ul className="space-y-2 text-sm text-slate-600">
            <li className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              Connect Google Business and sync reviews
            </li>
            <li className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              Reply with AI and launch QR review campaigns
            </li>
            <li className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
              Upgrade anytime — Starter stays free forever
            </li>
          </ul>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={dismiss}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Start exploring
          </button>
          <button
            type="button"
            onClick={() => {
              void (async () => {
                try {
                  await apiFetch("/api/private/settings/welcome/dismiss", {
                    method: "POST",
                  });
                } catch {
                  /* ignore */
                }
                onClose();
                onSubscribe();
              })();
            }}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Subscribe now
          </button>
        </div>
      </div>
    </div>
  );
}
