/**
 * Theme engine.
 *
 * Tokens in, CSS custom properties out. Node styles never contain literal
 * colors or sizes unless the user explicitly opted out, so a theme swap
 * repaints the entire site by rewriting ~30 CSS variables.
 *
 * This is the mechanism behind "change the blue to green" and "make it
 * look luxurious": both are theme mutations, not document mutations, so
 * they are instant, safe, and trivially revertible.
 */

import type {
  ColorScale,
  FontSizeToken,
  FontWeightToken,
  RadiusToken,
  ShadowToken,
  SpacingToken,
  ThemeTokens,
  TokenOrValue,
} from "./types";

// =====================================================================
// Scales
// =====================================================================

/**
 * Spacing multipliers applied to `theme.spacingUnit`. Keeping spacing on
 * a scale (rather than free px) is what stops AI-generated and
 * hand-edited pages from drifting into visual noise.
 */
export const SPACING_SCALE: Record<SpacingToken, number> = {
  none: 0,
  xs: 0.5,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 5,
  "2xl": 8,
  "3xl": 12,
  "4xl": 16,
};

/** Base font sizes in rem, before `theme.typography.scale`. */
export const FONT_SIZE_SCALE: Record<FontSizeToken, number> = {
  xs: 0.75,
  sm: 0.875,
  base: 1,
  lg: 1.125,
  xl: 1.25,
  "2xl": 1.5,
  "3xl": 1.875,
  "4xl": 2.25,
  "5xl": 3,
  "6xl": 3.75,
};

export const FONT_WEIGHT_SCALE: Record<FontWeightToken, number> = {
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
};

export const RADIUS_SCALE: Record<RadiusToken, string> = {
  none: "0px",
  sm: "4px",
  md: "8px",
  lg: "14px",
  xl: "24px",
  full: "9999px",
};

export const SHADOW_SCALE: Record<ShadowToken, string> = {
  none: "none",
  sm: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
  md: "0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06)",
  lg: "0 12px 32px -8px rgb(0 0 0 / 0.12), 0 4px 8px -4px rgb(0 0 0 / 0.08)",
  xl: "0 24px 64px -12px rgb(0 0 0 / 0.18), 0 8px 16px -8px rgb(0 0 0 / 0.10)",
};

export const LINE_HEIGHT_SCALE = {
  tight: "1.15",
  snug: "1.3",
  normal: "1.5",
  relaxed: "1.65",
  loose: "1.9",
} as const;

export const LETTER_SPACING_SCALE = {
  tighter: "-0.04em",
  tight: "-0.02em",
  normal: "0",
  wide: "0.02em",
  wider: "0.08em",
} as const;

// =====================================================================
// Presets
// =====================================================================

/**
 * Named style directions the AI maps natural language onto. When a user
 * says "make it more luxurious", the model picks a keyword and we apply a
 * hand-tuned preset — rather than letting it invent hex codes, which is
 * where LLM-designed sites usually go wrong.
 */
export const THEME_PRESETS: Record<
  NonNullable<ThemeTokens["styleKeyword"]>,
  Pick<ThemeTokens, "radius" | "defaultShadow" | "spacingUnit"> & {
    typography: Pick<
      ThemeTokens["typography"],
      "headingFont" | "bodyFont" | "headingWeight" | "scale"
    >;
  }
> = {
  modern: {
    radius: "lg",
    defaultShadow: "md",
    spacingUnit: 8,
    typography: {
      headingFont: "Inter",
      bodyFont: "Inter",
      headingWeight: "bold",
      scale: 1,
    },
  },
  minimal: {
    radius: "sm",
    defaultShadow: "none",
    spacingUnit: 8,
    typography: {
      headingFont: "Inter",
      bodyFont: "Inter",
      headingWeight: "medium",
      scale: 0.95,
    },
  },
  luxurious: {
    radius: "none",
    defaultShadow: "lg",
    spacingUnit: 10,
    typography: {
      headingFont: "Playfair Display",
      bodyFont: "Lato",
      headingWeight: "normal",
      scale: 1.1,
    },
  },
  playful: {
    radius: "xl",
    defaultShadow: "lg",
    spacingUnit: 8,
    typography: {
      headingFont: "Poppins",
      bodyFont: "Nunito",
      headingWeight: "extrabold",
      scale: 1.05,
    },
  },
  corporate: {
    radius: "md",
    defaultShadow: "sm",
    spacingUnit: 8,
    typography: {
      headingFont: "IBM Plex Sans",
      bodyFont: "IBM Plex Sans",
      headingWeight: "semibold",
      scale: 0.98,
    },
  },
  warm: {
    radius: "lg",
    defaultShadow: "md",
    spacingUnit: 9,
    typography: {
      headingFont: "Merriweather",
      bodyFont: "Source Sans 3",
      headingWeight: "bold",
      scale: 1,
    },
  },
  bold: {
    radius: "md",
    defaultShadow: "xl",
    spacingUnit: 8,
    typography: {
      headingFont: "Archivo",
      bodyFont: "Inter",
      headingWeight: "extrabold",
      scale: 1.15,
    },
  },
  clinical: {
    radius: "md",
    defaultShadow: "sm",
    spacingUnit: 8,
    typography: {
      headingFont: "Manrope",
      bodyFont: "Manrope",
      headingWeight: "semibold",
      scale: 0.98,
    },
  },
};

/**
 * Industry-appropriate default palettes. Local businesses have strong
 * category conventions (clinics read as calm blue/teal, restaurants as
 * warm amber) and honoring them makes generated sites feel intentional.
 */
export const INDUSTRY_PALETTES: Record<
  string,
  { primary: string; secondary: string; accent: string; keyword: NonNullable<ThemeTokens["styleKeyword"]> }
> = {
  hospital: { primary: "#0E7490", secondary: "#155E75", accent: "#22D3EE", keyword: "clinical" },
  clinic: { primary: "#0D9488", secondary: "#115E59", accent: "#5EEAD4", keyword: "clinical" },
  dental: { primary: "#0284C7", secondary: "#075985", accent: "#38BDF8", keyword: "clinical" },
  restaurant: { primary: "#B45309", secondary: "#7C2D12", accent: "#F59E0B", keyword: "warm" },
  cafe: { primary: "#78350F", secondary: "#451A03", accent: "#D97706", keyword: "warm" },
  hotel: { primary: "#1E3A5F", secondary: "#0F172A", accent: "#C9A227", keyword: "luxurious" },
  gym: { primary: "#DC2626", secondary: "#18181B", accent: "#FACC15", keyword: "bold" },
  salon: { primary: "#9D174D", secondary: "#500724", accent: "#F9A8D4", keyword: "luxurious" },
  spa: { primary: "#4D7C0F", secondary: "#1A2E05", accent: "#BEF264", keyword: "minimal" },
  school: { primary: "#1D4ED8", secondary: "#1E3A8A", accent: "#FBBF24", keyword: "corporate" },
  realestate: { primary: "#0F172A", secondary: "#334155", accent: "#0EA5E9", keyword: "corporate" },
  lawfirm: { primary: "#1E293B", secondary: "#0F172A", accent: "#B08D57", keyword: "luxurious" },
  agency: { primary: "#6D28D9", secondary: "#3B0764", accent: "#A78BFA", keyword: "modern" },
  retail: { primary: "#BE185D", secondary: "#831843", accent: "#FB7185", keyword: "playful" },
  automotive: { primary: "#1F2937", secondary: "#111827", accent: "#EF4444", keyword: "bold" },
  default: { primary: "#2563EB", secondary: "#1E40AF", accent: "#F59E0B", keyword: "modern" },
};

/**
 * Resolve an arbitrary industry string to a palette key. Tolerant of the
 * free text users and the AI actually produce ("Dental Clinic", "law
 * firm", "Real Estate Agency").
 */
export function resolveIndustryKey(industry?: string | null): string {
  if (!industry) return "default";
  const s = industry.toLowerCase().replace(/[^a-z]/g, "");

  // 1. An exact key always wins.
  if (s !== "default" && s in INDUSTRY_PALETTES) return s;

  // 2. Compound phrases where a loose substring scan picks the wrong key.
  //    "Dental clinic" contains "clinic", so a plain `includes` test resolved
  //    it to the clinic palette and the clinic blueprint — which silently gave
  //    every dental site the wrong colours, wrong pages, and wrong imagery.
  //    Specific beats generic, so these run before any substring matching.
  if (/dentist|dental|orthodont/.test(s)) return "dental";
  if (/dayspa|medspa/.test(s)) return "spa";

  // 3. Substring match, longest key first. Length ordering makes the result
  //    independent of how INDUSTRY_PALETTES happens to be declared, which is
  //    what made the bug above so easy to introduce.
  const keys = Object.keys(INDUSTRY_PALETTES)
    .filter((k) => k !== "default")
    .sort((a, b) => b.length - a.length);
  const direct = keys.find((k) => s.includes(k) || k.includes(s));
  if (direct) return direct;

  // 4. Synonyms for industries the caller named without using our key.
  if (/doctor|medical|hospital|health/.test(s)) return "hospital";
  if (/food|dining|pizza|kitchen|bakery/.test(s)) return "restaurant";
  if (/coffee|tea|bistro/.test(s)) return "cafe";
  if (/resort|stay|lodge|hostel/.test(s)) return "hotel";
  if (/fitness|yoga|crossfit|workout/.test(s)) return "gym";
  if (/beauty|hair|nail|barber|makeup/.test(s)) return "salon";
  if (/massage|wellness/.test(s)) return "spa";
  if (/college|academy|university|tuition|education|coaching/.test(s)) return "school";
  if (/property|realtor|estate|builder/.test(s)) return "realestate";
  if (/law|legal|advocate|attorney|solicitor/.test(s)) return "lawfirm";
  if (/marketing|design|studio|consult|software|tech/.test(s)) return "agency";
  if (/shop|store|boutique|mart/.test(s)) return "retail";
  if (/car|garage|auto|vehicle/.test(s)) return "automotive";
  return "default";
}

// =====================================================================
// Theme construction
// =====================================================================

function neutralColors(): Omit<
  ColorScale,
  "primary" | "primaryForeground" | "secondary" | "secondaryForeground" | "accent" | "accentForeground"
> {
  return {
    background: "#FFFFFF",
    foreground: "#0F172A",
    muted: "#F8FAFC",
    mutedForeground: "#64748B",
    card: "#FFFFFF",
    cardForeground: "#0F172A",
    border: "#E2E8F0",
    success: "#16A34A",
    warning: "#D97706",
    destructive: "#DC2626",
  };
}

/** Build a complete, valid theme for an industry. */
export function createTheme(options: {
  industry?: string | null;
  primary?: string;
  secondary?: string;
  accent?: string;
  styleKeyword?: ThemeTokens["styleKeyword"];
}): ThemeTokens {
  const palette = INDUSTRY_PALETTES[resolveIndustryKey(options.industry)];
  const keyword = options.styleKeyword ?? palette.keyword;
  const preset = THEME_PRESETS[keyword];

  const primary = options.primary ?? palette.primary;
  const secondary = options.secondary ?? palette.secondary;
  const accent = options.accent ?? palette.accent;

  return {
    colors: {
      primary,
      primaryForeground: readableOn(primary),
      secondary,
      secondaryForeground: readableOn(secondary),
      accent,
      accentForeground: readableOn(accent),
      ...neutralColors(),
    },
    typography: {
      headingFont: preset.typography.headingFont,
      bodyFont: preset.typography.bodyFont,
      monoFont: "ui-monospace, SFMono-Regular, Menlo, monospace",
      scale: preset.typography.scale,
      headingWeight: preset.typography.headingWeight,
      bodyWeight: "normal",
    },
    radius: preset.radius,
    spacingUnit: preset.spacingUnit,
    containerWidth: 1200,
    defaultShadow: preset.defaultShadow,
    styleKeyword: keyword,
  };
}

export const DEFAULT_THEME: ThemeTokens = createTheme({ industry: "default" });

/**
 * Apply a style keyword to an existing theme, keeping brand colors.
 * This is what "make my website more luxurious" resolves to — a
 * restyle that never silently discards the user's palette.
 */
export function applyStyleKeyword(
  theme: ThemeTokens,
  keyword: NonNullable<ThemeTokens["styleKeyword"]>,
): ThemeTokens {
  const preset = THEME_PRESETS[keyword];
  return {
    ...theme,
    radius: preset.radius,
    defaultShadow: preset.defaultShadow,
    spacingUnit: preset.spacingUnit,
    styleKeyword: keyword,
    typography: {
      ...theme.typography,
      headingFont: preset.typography.headingFont,
      bodyFont: preset.typography.bodyFont,
      headingWeight: preset.typography.headingWeight,
      scale: preset.typography.scale,
    },
  };
}

// =====================================================================
// Contrast
// =====================================================================

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{3}|[a-f\d]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** WCAG relative luminance. */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Pick a readable text colour for a background.
 *
 * Accessibility cannot be an afterthought in a generated site: the AI picks
 * brand colours, so every foreground token is derived rather than guessed.
 *
 * Implemented by measuring contrast, not by thresholding luminance. A
 * luminance cutoff looks reasonable but is wrong for mid-tone colours — a
 * mid-blue like #0284C7 sits on the "use white" side of any sensible threshold
 * yet only reaches 4.05:1 against white, below the WCAG AA minimum of 4.5:1.
 *
 * So: measure both candidates and take the better one. If neither clears AA
 * (which happens for mid-tones against the softened dark), fall back to pure
 * black or white. Because the two curves cross at ~4.58:1, that guarantees
 * every background gets a compliant foreground.
 */
export function readableOn(background: string): string {
  // Preferred foregrounds: softer than pure black/white. Inlined rather than
  // module constants because DEFAULT_THEME initialises before this point in the
  // module and would hit the temporal dead zone.
  const candidates: Array<[string, number]> = [
    ["#FFFFFF", contrastRatio(background, "#FFFFFF") ?? 0],
    ["#0F172A", contrastRatio(background, "#0F172A") ?? 0],
  ];
  candidates.sort((a, b) => b[1] - a[1]);

  const [best, bestRatio] = candidates[0];
  if (bestRatio >= 4.5) return best;

  // Maximum-contrast fallback.
  const pure: Array<[string, number]> = [
    ["#FFFFFF", contrastRatio(background, "#FFFFFF") ?? 0],
    ["#000000", contrastRatio(background, "#000000") ?? 0],
  ];
  pure.sort((a, b) => b[1] - a[1]);
  return pure[0][0];
}

/** WCAG contrast ratio between two hex colors, or null if unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return null;
  const la = luminance(ra);
  const lb = luminance(rb);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// =====================================================================
// CSS emission
// =====================================================================

export function spacing(theme: ThemeTokens, token: SpacingToken): string {
  return `${SPACING_SCALE[token] * theme.spacingUnit}px`;
}

export function fontSize(theme: ThemeTokens, token: FontSizeToken): string {
  return `${(FONT_SIZE_SCALE[token] * theme.typography.scale).toFixed(3)}rem`;
}

/** Resolve a TokenOrValue against the theme's CSS variables. */
export function resolveColor(value?: TokenOrValue): string | undefined {
  if (!value) return undefined;
  if (value.token) return `var(--sb-color-${kebab(value.token)})`;
  return value.value;
}

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Emit the theme as a CSS custom property block scoped to `selector`.
 *
 * Scoping (rather than `:root`) matters in two places: the editor renders
 * the canvas inside the dashboard, which has its own design tokens, and a
 * future multi-site preview could show two themes side by side.
 */
export function themeToCss(theme: ThemeTokens, selector = ".sb-root"): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(theme.colors)) {
    lines.push(`--sb-color-${kebab(key)}: ${value};`);
  }
  for (const [token] of Object.entries(SPACING_SCALE)) {
    lines.push(`--sb-space-${token}: ${spacing(theme, token as SpacingToken)};`);
  }
  for (const [token] of Object.entries(FONT_SIZE_SCALE)) {
    lines.push(`--sb-text-${token}: ${fontSize(theme, token as FontSizeToken)};`);
  }
  for (const [token, weight] of Object.entries(FONT_WEIGHT_SCALE)) {
    lines.push(`--sb-weight-${token}: ${weight};`);
  }
  for (const [token, radius] of Object.entries(RADIUS_SCALE)) {
    lines.push(`--sb-radius-${token}: ${radius};`);
  }
  for (const [token, shadow] of Object.entries(SHADOW_SCALE)) {
    lines.push(`--sb-shadow-${token}: ${shadow};`);
  }

  lines.push(`--sb-radius: ${RADIUS_SCALE[theme.radius]};`);
  lines.push(`--sb-shadow: ${SHADOW_SCALE[theme.defaultShadow]};`);
  lines.push(`--sb-container: ${theme.containerWidth}px;`);
  lines.push(
    `--sb-font-heading: ${quoteFont(theme.typography.headingFont)}, ui-sans-serif, system-ui, sans-serif;`,
  );
  lines.push(
    `--sb-font-body: ${quoteFont(theme.typography.bodyFont)}, ui-sans-serif, system-ui, sans-serif;`,
  );
  lines.push(`--sb-font-mono: ${theme.typography.monoFont};`);
  lines.push(`--sb-weight-heading: ${FONT_WEIGHT_SCALE[theme.typography.headingWeight]};`);
  lines.push(`--sb-weight-body: ${FONT_WEIGHT_SCALE[theme.typography.bodyWeight]};`);

  let css = `${selector} {\n  ${lines.join("\n  ")}\n}`;

  if (theme.darkColors && Object.keys(theme.darkColors).length > 0) {
    const dark = Object.entries(theme.darkColors)
      .map(([k, v]) => `--sb-color-${kebab(k)}: ${v};`)
      .join("\n    ");
    css += `\n${selector}[data-theme="dark"] {\n    ${dark}\n}`;
  }

  return css;
}

function quoteFont(font: string): string {
  return /\s/.test(font) ? `"${font}"` : font;
}

/**
 * Google Fonts URL for the theme's families. Returns null for system
 * fonts so we don't emit a pointless network request.
 */
export function googleFontsHref(theme: ThemeTokens): string | null {
  const families = [theme.typography.headingFont, theme.typography.bodyFont]
    .filter((f) => f && !/^(ui-|system-|-apple|sans-serif|serif|monospace)/.test(f))
    .filter((f, i, arr) => arr.indexOf(f) === i);
  if (families.length === 0) return null;

  const params = families
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@300;400;500;600;700;800`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}
