"use client";

/**
 * Shared inputs for the personality wizard.
 *
 * Extracted because eight of the sixteen steps are "pick several from a list,
 * optionally add your own" or "build a list of free-text entries". Writing that
 * inline per step is where inconsistent keyboard behaviour and missing ARIA
 * creep in.
 */

import { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Multi-select chips, with optional custom entries.
 *
 * Chips rather than checkboxes: the lists are short, the labels are short, and
 * seeing every option at once is what keeps a step answerable in seconds.
 */
export function ChipMultiSelect({
  options,
  selected,
  onChange,
  allowCustom = false,
  customPlaceholder = "Add your own…",
  hints,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allowCustom?: boolean;
  customPlaceholder?: string;
  /** Optional per-option explanation, shown under the chip row. */
  hints?: Record<string, string>;
}) {
  const [custom, setCustom] = useState("");

  const toggle = (value: string) => {
    onChange(
      selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
    );
  };

  const addCustom = () => {
    const value = custom.trim();
    if (!value) return;
    // Case-insensitive dedupe: "Honesty" and "honesty" are the same value.
    if (!selected.some((s) => s.toLowerCase() === value.toLowerCase())) {
      onChange([...selected, value]);
    }
    setCustom("");
  };

  // Custom entries are anything selected that isn't in the catalog.
  const customValues = selected.filter(
    (s) => !options.some((o) => o.toLowerCase() === s.toLowerCase()),
  );
  const activeHints = hints
    ? selected.map((s) => hints[s]).filter((h): h is string => Boolean(h))
    : [];

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.some((s) => s.toLowerCase() === option.toLowerCase());
          return (
            <button
              key={option}
              type="button"
              onClick={() => toggle(option)}
              aria-pressed={active}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
              )}
            >
              {active && <Check className="h-3 w-3" />}
              {option}
            </button>
          );
        })}

        {customValues.map((value) => (
          <span
            key={value}
            className="inline-flex items-center gap-1 rounded-full border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            {value}
            <button
              type="button"
              onClick={() => toggle(value)}
              aria-label={`Remove ${value}`}
              className="rounded-full hover:bg-white/20"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>

      {activeHints.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {activeHints.map((hint) => (
            <li key={hint} className="text-[11px] text-slate-500">
              {hint}
            </li>
          ))}
        </ul>
      )}

      {allowCustom && (
        <div className="mt-2.5 flex items-center gap-1.5">
          <input
            type="text"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                // Enter must not submit the wizard form from inside a sub-input.
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder={customPlaceholder}
            className="w-56 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={addCustom}
            disabled={!custom.trim()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      )}
    </div>
  );
}

/** Single-choice option cards, used where each choice needs an explanation. */
export function OptionCards<T extends string>({
  options,
  value,
  onChange,
  columns = 1,
}: {
  options: Array<{ value: T; label: string; hint?: string }>;
  value: T;
  onChange: (next: T) => void;
  columns?: 1 | 2;
}) {
  return (
    <div className={cn("grid gap-1.5", columns === 2 && "sm:grid-cols-2")}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <label
            key={option.value}
            className={cn(
              "flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2.5 transition-colors",
              active ? "border-blue-300 bg-blue-50" : "border-slate-200 hover:bg-slate-50",
            )}
          >
            <input
              type="radio"
              checked={active}
              onChange={() => onChange(option.value)}
              className="mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-slate-800">{option.label}</span>
              {option.hint && (
                <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                  {option.hint}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * Free-text list builder, for services, never-say rules, and similar.
 *
 * Entries are added on Enter as well as by button, because typing a list of ten
 * services and reaching for the mouse each time is the difference between a
 * step people complete and one they skip.
 */
export function TagListInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  max = 50,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  /** One-click starting points. */
  suggestions?: string[];
  max?: number;
}) {
  const [draft, setDraft] = useState("");

  const add = (raw: string) => {
    const item = raw.trim();
    if (!item || value.length >= max) return;
    if (value.some((v) => v.toLowerCase() === item.toLowerCase())) return;
    onChange([...value, item]);
  };

  const unusedSuggestions = suggestions.filter(
    (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase()),
  );

  return (
    <div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(draft);
              setDraft("");
            }
          }}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => {
            add(draft);
            setDraft("");
          }}
          disabled={!draft.trim() || value.length >= max}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </div>

      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {value.map((item) => (
            <li
              key={item}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(value.filter((v) => v !== item))}
                aria-label={`Remove ${item}`}
                className="rounded text-slate-400 hover:text-red-600"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {unusedSuggestions.length > 0 && (
        <div className="mt-2">
          <p className="mb-1 text-[11px] text-slate-400">Common ones:</p>
          <div className="flex flex-wrap gap-1">
            {unusedSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:border-blue-300 hover:bg-blue-50"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
