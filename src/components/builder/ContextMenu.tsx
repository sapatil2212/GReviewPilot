"use client";

/**
 * Right-click context menu for canvas nodes.
 *
 * A floating, positioned menu rather than a native `contextmenu` fallback:
 * the browser's own menu is meaningless on a design canvas (it offers
 * "Inspect", "Save image as...", none of which apply), so every node's
 * `contextmenu` handler calls `preventDefault()` and opens this instead.
 *
 * Positioned with a viewport clamp so a right-click near the right or bottom
 * edge of the window still renders fully on screen rather than clipping.
 */

import { useEffect, useRef, useState } from "react";

export interface ContextMenuAction {
  key: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

export interface ContextMenuSection {
  key: string;
  actions: ContextMenuAction[];
}

export interface ContextMenuState {
  x: number;
  y: number;
  sections: ContextMenuSection[];
}

export function ContextMenu({
  state,
  onClose,
}: {
  state: ContextMenuState | null;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // Clamp after mount, once the menu's real size is known.
  useEffect(() => {
    if (!state) {
      setPos(null);
      return;
    }
    const el = ref.current;
    if (!el) {
      setPos({ left: state.x, top: state.y });
      return;
    }
    const rect = el.getBoundingClientRect();
    const left = Math.min(state.x, window.innerWidth - rect.width - 8);
    const top = Math.min(state.y, window.innerHeight - rect.height - 8);
    setPos({ left: Math.max(8, left), top: Math.max(8, top) });
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const close = () => onClose();
    // Any of these means the menu should no longer be open: a click
    // elsewhere, scrolling the canvas, or the user pressing Escape.
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("blur", close);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [state, onClose]);

  if (!state) return null;

  return (
    <div
      ref={ref}
      role="menu"
      // Stop the same click that closes OTHER open menus/popovers from also
      // bubbling to the window listener above and immediately closing this
      // one before it is seen.
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[100] min-w-[190px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
      style={{ left: pos?.left ?? state.x, top: pos?.top ?? state.y, visibility: pos ? "visible" : "hidden" }}
    >
      {state.sections.map((section, i) => (
        <div key={section.key}>
          {i > 0 && <div className="my-1 border-t border-slate-100" />}
          {section.actions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.key}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={() => {
                  onClose();
                  action.onSelect();
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  action.danger
                    ? "text-red-600 hover:bg-red-50"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
                {action.shortcut && (
                  <span className="shrink-0 font-mono text-[10px] text-slate-400">
                    {action.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
