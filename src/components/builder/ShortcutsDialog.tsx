"use client";

/**
 * Keyboard shortcut reference.
 *
 * The editor already supports multi-select, copy/paste, grouping, nudging and
 * more — but none of it was discoverable, so in practice most of it went
 * unused. Every capable editor (Figma, Webflow, VS Code) puts this behind "?"
 * for exactly that reason.
 *
 * Shortcut definitions live here as data rather than being scraped from the
 * handler in useEditorState, which means they can drift. That tradeoff is
 * deliberate: a wrong label is a small problem, whereas making the handler
 * declarative enough to render from would restructure the editor kernel for
 * cosmetic gain.
 */

import { useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";

interface Shortcut {
  keys: string[];
  label: string;
}

interface ShortcutGroup {
  title: string;
  items: Shortcut[];
}

/** `mod` renders as ⌘ on Apple platforms and Ctrl everywhere else. */
const GROUPS: ShortcutGroup[] = [
  {
    title: "Essentials",
    items: [
      { keys: ["mod", "S"], label: "Save now" },
      { keys: ["mod", "Z"], label: "Undo" },
      { keys: ["mod", "Shift", "Z"], label: "Redo" },
      { keys: ["?"], label: "Show this list" },
    ],
  },
  {
    title: "Selection",
    items: [
      { keys: ["Click"], label: "Select an element" },
      { keys: ["Shift", "Click"], label: "Add or remove from selection" },
      { keys: ["Esc"], label: "Select parent, or collapse a multi-selection" },
      { keys: ["Double-click"], label: "Edit text in place" },
    ],
  },
  {
    title: "Editing",
    items: [
      { keys: ["mod", "C"], label: "Copy" },
      { keys: ["mod", "X"], label: "Cut" },
      { keys: ["mod", "V"], label: "Paste" },
      { keys: ["mod", "D"], label: "Duplicate" },
      { keys: ["Del"], label: "Delete selection" },
      { keys: ["mod", "G"], label: "Group selection" },
      { keys: ["mod", "Shift", "G"], label: "Ungroup" },
      { keys: ["Alt", "↑"], label: "Move up in the layout" },
      { keys: ["Alt", "↓"], label: "Move down in the layout" },
    ],
  },
  {
    title: "View",
    items: [
      { keys: ["mod", "+"], label: "Zoom in" },
      { keys: ["mod", "-"], label: "Zoom out" },
      { keys: ["mod", "0"], label: "Reset zoom to 100%" },
      { keys: ["mod", "1"], label: "Fit page to window" },
    ],
  },
];

/** True on Apple platforms, where the modifier renders as ⌘. */
function useIsApple(): boolean {
  const [apple, setApple] = useState(false);
  // Deferred to an effect: `navigator` does not exist during SSR, and reading
  // it in render would make the first client paint differ from the server's.
  useEffect(() => {
    setApple(/Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent));
  }, []);
  return apple;
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const isApple = useIsApple();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const render = (key: string) =>
    key === "mod" ? (isApple ? "⌘" : "Ctrl") : key === "Alt" && isApple ? "⌥" : key;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="shortcuts-title"
              className="flex items-center gap-2 text-sm font-semibold text-slate-900"
            >
              <Keyboard className="h-4 w-4 text-blue-600" />
              Keyboard shortcuts
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Shortcuts are ignored while you are typing, so you can use them freely.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {group.title}
              </h3>
              <ul className="space-y-1">
                {group.items.map((item) => (
                  <li
                    key={item.label}
                    className="flex items-center justify-between gap-3 rounded px-1 py-0.5"
                  >
                    <span className="text-xs text-slate-600">{item.label}</span>
                    <span className="flex shrink-0 items-center gap-0.5">
                      {item.keys.map((key, i) => (
                        <kbd
                          key={i}
                          className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-slate-600"
                        >
                          {render(key)}
                        </kbd>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
