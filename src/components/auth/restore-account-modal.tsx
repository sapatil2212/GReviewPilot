"use client";

import { useState } from "react";
import { Building2, Loader2, RotateCcw, X } from "lucide-react";
import { apiFetch, ApiClientError } from "@/lib/fetcher";

export type DeletedAccountPayload = {
  email: string;
  firstName?: string;
  lastName?: string;
  businessName?: string | null;
  plan?: string | null;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  deletedAt?: string | null;
  createdAt?: string | null;
};

type Props = {
  open: boolean;
  payload: DeletedAccountPayload;
  password: string;
  onClose: () => void;
  onRestored: () => void;
  onTrialEnded: (data: unknown) => void;
};

export function RestoreAccountModal({
  open,
  payload,
  password,
  onClose,
  onRestored,
  onTrialEnded,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function restore() {
    setLoading(true);
    setError(null);
    try {
      await apiFetch("/api/auth/restore-account", {
        method: "POST",
        body: JSON.stringify({ email: payload.email, password }),
      });
      onRestored();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "TRIAL_ENDED") {
        onTrialEnded(err.data);
        return;
      }
      setError(err instanceof Error ? err.message : "Could not restore account");
    } finally {
      setLoading(false);
    }
  }

  const rows: Array<[string, string | null | undefined]> = [
    ["Email", payload.email],
    ["Name", [payload.firstName, payload.lastName].filter(Boolean).join(" ") || null],
    ["Business", payload.businessName],
    ["Industry", payload.industry],
    ["Website", payload.website],
    ["Phone", payload.phone],
    ["Previous plan", payload.plan],
    [
      "Deleted on",
      payload.deletedAt ? new Date(payload.deletedAt).toLocaleString() : null,
    ],
    [
      "Created on",
      payload.createdAt ? new Date(payload.createdAt).toLocaleDateString() : null,
    ],
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Want to retrieve your account?
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              This workspace was deleted. Restore it to get everything back as it was.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
            <Building2 className="h-4 w-4 text-slate-500" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">
                {payload.businessName || "Your workspace"}
              </p>
              <p className="truncate text-xs text-slate-500">{payload.email}</p>
            </div>
          </div>

          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {rows
              .filter(([, v]) => Boolean(v))
              .map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-start justify-between gap-3 px-3 py-2 text-xs"
                >
                  <dt className="shrink-0 text-slate-500">{label}</dt>
                  <dd className="truncate text-right font-medium text-slate-800">{value}</dd>
                </div>
              ))}
          </dl>

          {error && <p className="text-xs font-medium text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={restore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Retrieve account
          </button>
        </div>
      </div>
    </div>
  );
}
