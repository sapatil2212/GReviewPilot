"use client";

/**
 * "Use this template" confirmation.
 *
 * Asks for the website name before creating rather than silently naming the
 * site after the template. Previously every site created from the dental
 * template was called "Dental clinic", which is the name a tenant then has to
 * find and fix — and the name feeds the slug, the SEO title template, and the
 * public URL, so getting it right up front avoids a rename that touches all
 * three.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { siteApi, type SiteTemplateDto } from "@/lib/api/site";
import { ApiClientError } from "@/lib/fetcher";

export function UseTemplateDialog({
  template,
  onClose,
  onCreated,
  onBusyChange,
}: {
  template: SiteTemplateDto;
  onClose: () => void;
  onCreated: () => void;
  onBusyChange?: (busy: boolean) => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setBusy(true);
    onBusyChange?.(true);
    try {
      const site = await siteApi.create({
        name: trimmed,
        industry: template.industry ?? undefined,
        templateSlug: template.slug,
      });
      toast.success(`Created “${trimmed}”`, {
        description: `${template.pageCount} pages from the ${template.name} template, ready to edit.`,
      });
      onCreated();
      router.push(`/builder/${site.id}`);
    } catch (err) {
      toast.error(
        err instanceof ApiClientError ? err.message : "Could not create the website",
      );
      setBusy(false);
      onBusyChange?.(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="use-template-title"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="use-template-title" className="text-sm font-semibold text-slate-900">
              Create from “{template.name}”
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {template.pageCount} page{template.pageCount === 1 ? "" : "s"} will be copied into a
              new draft. Your business phone, email, and address replace the sample details
              automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-700">Website name</span>
            <input
              ref={inputRef}
              type="text"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bright Smile Dental"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Used for your public address and page titles. You can change it later.
            </span>
          </label>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? "Creating…" : "Create website"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
