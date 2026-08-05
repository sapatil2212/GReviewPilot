"use client";

/**
 * Theme panel — global styles.
 *
 * Colour inputs are debounced before hitting the API: a native colour picker
 * fires continuously while dragging, which would otherwise mean dozens of
 * requests and audit entries for one decision. The preview updates immediately
 * from local state, so it still feels live.
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Palette } from "lucide-react";
import { THEME_PRESETS } from "@/site/document/theme";
import { contrastRatio } from "@/site/document/theme";
import type { ThemeTokens } from "@/site/document/types";
import { cn } from "@/lib/utils";

export interface ThemePanelProps {
  theme: ThemeTokens;
  saving: boolean;
  onPatch: (patch: Record<string, unknown>) => void;
}

const STYLE_KEYWORDS = Object.keys(THEME_PRESETS) as Array<keyof typeof THEME_PRESETS>;

const FONT_CHOICES = [
  "Inter",
  "Poppins",
  "Manrope",
  "Archivo",
  "IBM Plex Sans",
  "Lato",
  "Nunito",
  "Merriweather",
  "Playfair Display",
  "Source Sans 3",
  "Montserrat",
  "Raleway",
  "Work Sans",
  "DM Sans",
];

const RADII = ["none", "sm", "md", "lg", "xl", "full"] as const;
const SHADOWS = ["none", "sm", "md", "lg", "xl"] as const;

export function ThemePanel({ theme, saving, onPatch }: ThemePanelProps) {
  return (
    <div className="divide-y divide-slate-200">
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <Palette className="h-3.5 w-3.5 text-blue-600" />
          Theme
        </div>
        {saving && <Loader2 className="h-3 w-3 animate-spin text-slate-400" />}
      </div>

      <div className="px-3 py-3">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Style
        </h4>
        <div className="grid grid-cols-2 gap-1">
          {STYLE_KEYWORDS.map((keyword) => (
            <button
              key={keyword}
              type="button"
              aria-pressed={theme.styleKeyword === keyword}
              onClick={() => onPatch({ styleKeyword: keyword })}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[11px] font-medium capitalize transition-colors",
                theme.styleKeyword === keyword
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50",
              )}
            >
              {keyword}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
          Changes fonts, corners, shadows, and spacing. Your brand colours are kept.
        </p>
      </div>

      <div className="px-3 py-3">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Colours
        </h4>
        <ColorRow
          label="Primary"
          hint="Buttons, links, and accents."
          value={theme.colors.primary}
          onChange={(primary) => onPatch({ primary })}
        />
        <ColorRow
          label="Secondary"
          hint="Footers and dark bands."
          value={theme.colors.secondary}
          onChange={(secondary) => onPatch({ secondary })}
        />
        <ColorRow
          label="Accent"
          hint="Highlights and secondary CTAs."
          value={theme.colors.accent}
          onChange={(accent) => onPatch({ accent })}
        />
        <ContrastNotice
          background={theme.colors.primary}
          foreground={theme.colors.primaryForeground}
        />
      </div>

      <div className="px-3 py-3">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Typography
        </h4>
        <Labelled label="Heading font">
          <select
            value={theme.typography.headingFont}
            onChange={(e) => onPatch({ headingFont: e.target.value })}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
          >
            {dedupe([theme.typography.headingFont, ...FONT_CHOICES]).map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Body font">
          <select
            value={theme.typography.bodyFont}
            onChange={(e) => onPatch({ bodyFont: e.target.value })}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
          >
            {dedupe([theme.typography.bodyFont, ...FONT_CHOICES]).map((font) => (
              <option key={font} value={font}>
                {font}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label={`Text scale — ${theme.typography.scale.toFixed(2)}x`}>
          <input
            type="range"
            min={0.85}
            max={1.25}
            step={0.05}
            value={theme.typography.scale}
            onChange={(e) => onPatch({ scale: Number(e.target.value) })}
            className="w-full accent-blue-600"
          />
        </Labelled>
      </div>

      <div className="px-3 py-3">
        <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Shape & spacing
        </h4>
        <Labelled label="Corner radius">
          <div className="flex gap-1">
            {RADII.map((radius) => (
              <button
                key={radius}
                type="button"
                aria-pressed={theme.radius === radius}
                onClick={() => onPatch({ radius })}
                className={cn(
                  "flex-1 rounded border px-1 py-1 text-[10px] font-medium",
                  theme.radius === radius
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                {radius}
              </button>
            ))}
          </div>
        </Labelled>
        <Labelled label="Shadow">
          <div className="flex gap-1">
            {SHADOWS.map((shadow) => (
              <button
                key={shadow}
                type="button"
                aria-pressed={theme.defaultShadow === shadow}
                onClick={() => onPatch({ defaultShadow: shadow })}
                className={cn(
                  "flex-1 rounded border px-1 py-1 text-[10px] font-medium",
                  theme.defaultShadow === shadow
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                {shadow}
              </button>
            ))}
          </div>
        </Labelled>
        <Labelled label={`Spacing unit — ${theme.spacingUnit}px`}>
          <input
            type="range"
            min={4}
            max={14}
            step={1}
            value={theme.spacingUnit}
            onChange={(e) => onPatch({ spacingUnit: Number(e.target.value) })}
            className="w-full accent-blue-600"
          />
        </Labelled>
        <Labelled label={`Content width — ${theme.containerWidth}px`}>
          <input
            type="range"
            min={900}
            max={1600}
            step={20}
            value={theme.containerWidth}
            onChange={(e) => onPatch({ containerWidth: Number(e.target.value) })}
            className="w-full accent-blue-600"
          />
        </Labelled>
      </div>

      <div className="px-3 py-3">
        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox"
            checked={Boolean(theme.darkColors && Object.keys(theme.darkColors).length > 0)}
            onChange={(e) => onPatch({ darkMode: e.target.checked })}
            className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
          />
          <span>
            <span className="block text-[11px] font-medium text-slate-700">Enable dark mode</span>
            <span className="block text-[10px] leading-relaxed text-slate-400">
              Generates a dark palette from your colours.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2.5">
      <label className="mb-1 block text-[11px] font-medium text-slate-600">{label}</label>
      {children}
    </div>
  );
}

/**
 * Colour row with a debounced commit.
 *
 * Local state drives the swatch so dragging the picker feels instant, while the
 * API call is deferred until the user settles on a value.
 */
function ColorRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Adopt external changes (AI edits, style presets) unless the user is mid-edit.
  useEffect(() => {
    if (!timer.current) setLocal(value);
  }, [value]);

  const commit = (next: string) => {
    setLocal(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(next)) onChange(next);
    }, 400);
  };

  return (
    <div className="mb-2.5">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(local) ? local : "#000000"}
          onChange={(e) => commit(e.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded border border-slate-200"
          aria-label={`${label} colour`}
        />
        <div className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-slate-700">{label}</span>
          <input
            type="text"
            value={local}
            onChange={(e) => commit(e.target.value)}
            spellCheck={false}
            className="w-full bg-transparent font-mono text-[10px] uppercase text-slate-500 focus:outline-none"
          />
        </div>
      </div>
      <p className="mt-0.5 pl-12 text-[10px] text-slate-400">{hint}</p>
    </div>
  );
}

/**
 * Live contrast warning.
 *
 * Surfaced in the theme panel rather than only in the audit, because this is
 * the exact moment a user can create an inaccessible button — telling them
 * later is far less useful than telling them now.
 */
function ContrastNotice({
  background,
  foreground,
}: {
  background: string;
  foreground: string;
}) {
  const ratio = contrastRatio(background, foreground);
  if (ratio === null) return null;

  const passes = ratio >= 4.5;
  return (
    <div
      className={cn(
        "mt-1 flex items-center justify-between rounded-md px-2 py-1.5 text-[10px]",
        passes ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900",
      )}
    >
      <span
        className="rounded px-1.5 py-0.5 font-semibold"
        style={{ background, color: foreground }}
      >
        Button text
      </span>
      <span>
        {ratio.toFixed(1)}:1 — {passes ? "meets WCAG AA" : "below WCAG AA (4.5:1)"}
      </span>
    </div>
  );
}
