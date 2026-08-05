"use client";

/**
 * New page dialog.
 *
 * Replaces a `window.prompt("Page name")` call. The native prompt was a problem
 * beyond looking out of place: it silently derived the URL from the title with
 * no way to see or correct it, offered no choice of starting layout, and gave no
 * validation feedback until the request failed. Creating a page is a decision
 * with three parts — name, URL, and what's on it — so it needs three fields.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Starting layouts, described by outcome rather than by preset key. */
const LAYOUTS: Array<{ id: string; label: string; hint: string; presets: string[] }> = [
  {
    id: "basic",
    label: "Blank page",
    hint: "Header and footer only — build the middle yourself.",
    presets: ["navbar", "footer"],
  },
  {
    id: "content",
    label: "Content page",
    hint: "Header, a heading and body area, contact prompt, footer.",
    presets: ["navbar", "about", "cta", "footer"],
  },
  {
    id: "services",
    label: "Services page",
    hint: "Header, services grid, pricing, FAQ, footer.",
    presets: ["navbar", "services", "pricing", "faq", "footer"],
  },
  {
    id: "contact",
    label: "Contact page",
    hint: "Header, contact form, map, footer.",
    presets: ["navbar", "contact", "map", "footer"],
  },
];

/** Mirrors the server's slug rules so the preview matches what gets saved. */
export function toPagePath(title: string): string {
  const slug = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `/${slug}`;
}

export function NewPageDialog({
  existingPaths,
  onClose,
  onCreate,
}: {
  /** Used to catch a duplicate URL before spending a round trip on it. */
  existingPaths: string[];
  onClose: () => void;
  onCreate: (input: { title: string; path: string; presets: string[] }) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  /** Once the user edits the URL we stop overwriting it from the title. */
  const [pathEdited, setPathEdited] = useState(false);
  const [layout, setLayout] = useState(LAYOUTS[0].id);
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

  const effectivePath = pathEdited ? normalizeInput(path) : toPagePath(title);

  const error = useMemo(() => {
    if (!title.trim()) return null;
    if (effectivePath === "/") return "That name produces an empty URL. Try letters or numbers.";
    if (existingPaths.includes(effectivePath)) return `${effectivePath} is already used by another page.`;
    return null;
  }, [title, effectivePath, existingPaths]);

  const canSubmit = title.trim().length > 0 && !error && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onCreate({
        title: title.trim(),
        path: effectivePath,
        presets: LAYOUTS.find((l) => l.id === layout)?.presets ?? ["navbar", "footer"],
      });
      // The caller closes on success so the dialog stays up if creation failed.
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-page-title"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
    >
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="new-page-title"
            className="flex items-center gap-2 text-sm font-semibold text-slate-900"
          >
            <FileText className="h-4 w-4 text-blue-600" />
            Add a page
          </h2>
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

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-medium text-slate-700">Page name</span>
          <input
            ref={inputRef}
            type="text"
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Our services"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <span className="mt-1 block text-[11px] text-slate-400">
            Shown in your navigation menu.
          </span>
        </label>

        <label className="mt-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-700">URL</span>
          <input
            type="text"
            maxLength={200}
            value={pathEdited ? path : effectivePath}
            onChange={(e) => {
              setPathEdited(true);
              setPath(e.target.value);
            }}
            placeholder="/our-services"
            className={cn(
              "w-full rounded-lg border px-3 py-2 font-mono text-xs focus:outline-none",
              error ? "border-red-300 focus:border-red-500" : "border-slate-200 focus:border-blue-500",
            )}
          />
          {error ? (
            <span className="mt-1 block text-[11px] font-medium text-red-600">{error}</span>
          ) : (
            <span className="mt-1 block text-[11px] text-slate-400">
              Filled in from the name. Edit it if you want a different address.
            </span>
          )}
        </label>

        <fieldset className="mt-3">
          <legend className="mb-1.5 text-xs font-medium text-slate-700">Start with</legend>
          <div className="space-y-1">
            {LAYOUTS.map((option) => (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors",
                  layout === option.id
                    ? "border-blue-300 bg-blue-50"
                    : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name="layout"
                  value={option.id}
                  checked={layout === option.id}
                  onChange={() => setLayout(option.id)}
                  className="mt-0.5"
                />
                <span className="min-w-0">
                  <span className="block text-[11px] font-semibold text-slate-800">
                    {option.label}
                  </span>
                  <span className="block text-[10px] leading-snug text-slate-500">
                    {option.hint}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

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
            disabled={!canSubmit}
            className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Creating…" : "Create page"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** Force a leading slash and strip characters a route cannot contain. */
function normalizeInput(value: string): string {
  const cleaned = value
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9/-]/g, "")
    .replace(/\/{2,}/g, "/");
  const withSlash = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : "/";
}
