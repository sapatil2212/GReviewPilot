"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, X } from "lucide-react";
import {
  SUBSCRIPTION_PLANS,
  type ActivatablePlan,
} from "@/lib/plans";

export type TrialEndedPayload = {
  email?: string;
  firstName?: string;
  businessName?: string | null;
  trialEndsAt?: string | null;
  plan?: string;
  restored?: boolean;
};

type Props = {
  open: boolean;
  payload?: TrialEndedPayload | null;
  /** When set, activate uses email/password (auth page). Otherwise session. */
  credentials?: { email: string; password: string } | null;
  onClose?: () => void;
  onActivated: () => void;
  blocking?: boolean;
};

export function SubscribePlanModal({
  open,
  payload,
  credentials,
  onClose,
  onActivated,
  blocking = true,
}: Props) {
  const [selected, setSelected] = useState<ActivatablePlan>("GROWTH");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function activate() {
    setLoading(true);
    setError(null);
    try {
      const { apiFetch } = await import("@/lib/fetcher");
      await apiFetch("/api/auth/activate-plan", {
        method: "POST",
        body: JSON.stringify({
          plan: selected,
          ...(credentials
            ? { email: credentials.email, password: credentials.password }
            : {}),
        }),
      });
      onActivated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not activate plan");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        {!blocking && onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="border-b border-slate-100 bg-gradient-to-br from-slate-50 to-white px-6 py-5 sm:px-8">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
            <Sparkles className="h-3.5 w-3.5" />
            Trial ended
          </div>
          <h2 className="mt-3 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">
            Your free trial has ended
          </h2>
          <p className="mt-1.5 text-sm text-slate-500">
            {payload?.restored
              ? "Your account was restored — pick a plan to keep using GReviewPilot."
              : payload?.businessName
                ? `Subscribe to continue managing ${payload.businessName}.`
                : "Subscribe to a plan to continue using your workspace."}
          </p>
        </div>

        <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
          {SUBSCRIPTION_PLANS.map((plan) => {
            const active = selected === plan.id;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => setSelected(plan.id)}
                className={
                  "relative flex flex-col rounded-2xl border p-4 text-left transition " +
                  (active
                    ? "border-blue-600 bg-blue-50/60 shadow-sm ring-2 ring-blue-600/20"
                    : "border-slate-200 bg-white hover:border-slate-300")
                }
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 right-3 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                    Popular
                  </span>
                )}
                <div className="text-sm font-semibold text-slate-900">{plan.name}</div>
                <div className="mt-1 text-lg font-bold text-slate-900">{plan.priceLabel}</div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">{plan.blurb}</p>
                <ul className="mt-3 space-y-1.5">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-[11px] text-slate-600">
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-blue-600" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </button>
            );
          })}
        </div>

        {error && (
          <p className="px-6 pb-2 text-center text-xs font-medium text-red-600">{error}</p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-6 py-4">
          {!blocking && onClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              Later
            </button>
          )}
          <button
            type="button"
            onClick={activate}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Subscribe to {SUBSCRIPTION_PLANS.find((p) => p.id === selected)?.name}
          </button>
        </div>
      </div>
    </div>
  );
}
