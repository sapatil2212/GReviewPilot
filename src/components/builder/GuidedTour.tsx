"use client";

/**
 * First-run guided tour for the editor.
 *
 * The builder is dense — three rails, a canvas, breakpoints, an AI chat — and a
 * non-technical owner opening it for the first time has no way to know that
 * text is edited by double-clicking or that the AI can make changes for them.
 * A five-step walkthrough costs nothing after the first visit and removes the
 * "what do I even do here" moment.
 *
 * Deliberately presentational: steps (including which panel to open before a
 * step shows) are supplied by the caller, which is the only place that knows
 * how to reveal its own UI. Anchors are matched by `data-tour` selector rather
 * than by DOM structure, so moving markup around cannot silently leave the
 * spotlight pointing at empty space — and a missing anchor degrades to a
 * centred card instead of breaking.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Selector for the element to spotlight. Omit to centre the card. */
  target?: string;
  /** Preferred side for the card; flipped automatically when it won't fit. */
  placement?: "top" | "bottom" | "left" | "right";
  /** Reveal whatever this step points at (open a tab, switch a panel). */
  onEnter?: () => void;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 300;
/** Breathing room between the spotlight and the card. */
const GAP = 12;
/** Keeps the card off the very edge of the viewport. */
const MARGIN = 12;

export function GuidedTour({
  steps,
  open,
  onClose,
}: {
  steps: TourStep[];
  open: boolean;
  /** Called on finish, skip, or Escape. */
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState(180);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  // Restart from the beginning each time the tour is opened, so a replay is a
  // replay rather than a resume from wherever it was abandoned.
  useEffect(() => {
    if (open) setIndex(0);
  }, [open]);

  // Let the step reveal its own target before we try to measure it.
  useEffect(() => {
    if (!open || !step) return;
    step.onEnter?.();
  }, [open, step]);

  const measure = useCallback(() => {
    if (!step?.target) {
      setRect(null);
      return;
    }
    const el = document.querySelector(step.target);
    if (!el) {
      // Anchor genuinely absent (feature hidden for this role, markup moved).
      // Fall back to a centred card rather than spotlighting nothing.
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
  }, [step]);

  // Measure after the DOM has settled from `onEnter` (a tab switch changes
  // layout), then keep it in sync with scrolling and resizing.
  useLayoutEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(raf);
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    // Capture phase so scrolling inside any panel is picked up too.
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [index, open]);

  const next = useCallback(() => {
    if (isLast) onClose();
    else setIndex((i) => Math.min(i + 1, steps.length - 1));
  }, [isLast, onClose, steps.length]);

  const back = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, next, back, onClose]);

  if (!open || !step) return null;

  const card = cardPosition(rect, step.placement, cardHeight);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      aria-describedby="tour-body"
      className="fixed inset-0 z-[100]"
    >
      {rect ? (
        <>
          {/* The dimmer is the spotlight's own huge outer shadow, which avoids
              an SVG mask and stays crisp at any zoom. */}
          <div
            aria-hidden
            className="pointer-events-none absolute rounded-lg ring-2 ring-blue-400 transition-all duration-200"
            style={{
              top: rect.top - 4,
              left: rect.left - 4,
              width: rect.width + 8,
              height: rect.height + 8,
              boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.55)",
            }}
          />
          {/* Separate click-catcher: the spotlight itself must not swallow
              clicks, but everything around it should dismiss nothing by
              accident, so the backdrop is inert except for this layer. */}
          <button
            type="button"
            aria-label="Skip the tour"
            onClick={onClose}
            className="absolute inset-0 cursor-default"
            style={{ background: "transparent" }}
          />
        </>
      ) : (
        <button
          type="button"
          aria-label="Skip the tour"
          onClick={onClose}
          className="absolute inset-0 cursor-default bg-slate-900/55"
        />
      )}

      <div
        ref={cardRef}
        className="absolute rounded-xl bg-white p-4 shadow-2xl"
        style={{ top: card.top, left: card.left, width: CARD_WIDTH }}
      >
        <div className="flex items-start justify-between gap-2">
          <h2
            id="tour-title"
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-900"
          >
            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
            {step.title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Skip the tour"
            className="-mr-1 -mt-1 rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <p id="tour-body" className="mt-1.5 text-xs leading-relaxed text-slate-600">
          {step.body}
        </p>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1" aria-hidden>
            {steps.map((s, i) => (
              <span
                key={s.id}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === index ? "w-4 bg-blue-600" : "w-1.5 bg-slate-200",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-1">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-100"
              >
                <ArrowLeft className="h-3 w-3" />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={next}
              autoFocus
              className="flex items-center gap-1 rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-slate-800"
            >
              {isLast ? (
                <>
                  <Check className="h-3 w-3" />
                  Got it
                </>
              ) : (
                <>
                  Next
                  <ArrowRight className="h-3 w-3" />
                </>
              )}
            </button>
          </div>
        </div>

        {!isLast && (
          <p className="mt-2 text-center text-[10px] text-slate-400">
            {index + 1} of {steps.length} · Esc to skip
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Place the card beside the spotlight, flipping to the opposite side when the
 * preferred one would run off screen, and clamping so it is always fully
 * visible. With no anchor it centres.
 */
function cardPosition(
  rect: Rect | null,
  placement: TourStep["placement"],
  cardHeight: number,
): { top: number; left: number } {
  const vw = typeof window === "undefined" ? 1280 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;

  if (!rect) {
    return {
      top: Math.max(MARGIN, (vh - cardHeight) / 2),
      left: Math.max(MARGIN, (vw - CARD_WIDTH) / 2),
    };
  }

  const fits = {
    right: vw - (rect.left + rect.width) - GAP - MARGIN >= CARD_WIDTH,
    left: rect.left - GAP - MARGIN >= CARD_WIDTH,
    bottom: vh - (rect.top + rect.height) - GAP - MARGIN >= cardHeight,
    top: rect.top - GAP - MARGIN >= cardHeight,
  };

  // Try the requested side, then the sensible alternatives in turn.
  const order: Array<NonNullable<TourStep["placement"]>> = placement
    ? [placement, "bottom", "right", "top", "left"]
    : ["bottom", "right", "top", "left"];
  const side = order.find((s) => fits[s]) ?? "bottom";

  let top: number;
  let left: number;

  if (side === "right" || side === "left") {
    top = rect.top + rect.height / 2 - cardHeight / 2;
    left = side === "right" ? rect.left + rect.width + GAP : rect.left - CARD_WIDTH - GAP;
  } else {
    left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
    top = side === "bottom" ? rect.top + rect.height + GAP : rect.top - cardHeight - GAP;
  }

  return {
    top: clamp(top, MARGIN, Math.max(MARGIN, vh - cardHeight - MARGIN)),
    left: clamp(left, MARGIN, Math.max(MARGIN, vw - CARD_WIDTH - MARGIN)),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
