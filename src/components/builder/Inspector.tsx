"use client";

/**
 * Properties inspector.
 *
 * Content controls are generated from the registry's `propFields`, so adding a
 * component automatically gets a working editing UI with no changes here. Only
 * the style, layout, and effects sections are hand-built, because those are the
 * same for every node.
 *
 * Style edits write to the currently-selected breakpoint, and the panel says so
 * explicitly — silently editing "mobile" while the user thinks they are editing
 * the whole site is the single most confusing thing a responsive builder can do.
 */

import { useState } from "react";
import { ChevronDown, Info, Smartphone, Tablet } from "lucide-react";
import type {
  Breakpoint,
  MarginToken,
  SiteNode,
  SpacingToken,
  StyleProps,
} from "@/site/document/types";
import { getDefinition, type PropField } from "@/site/registry/definitions";
import { ICON_NAMES } from "@/site/render/icons";
import { ImageField } from "./ImageField";
import { cn } from "@/lib/utils";

export interface InspectorProps {
  node: SiteNode;
  breakpoint: Breakpoint;
  /** Style resolved for the active breakpoint, for display. */
  resolvedStyle: StyleProps;
  onUpdateProps: (props: Record<string, unknown>) => void;
  onUpdateStyle: (patch: StyleProps) => void;
  onUpdateNode: (patch: Partial<Omit<SiteNode, "id" | "children" | "parent">>) => void;
  /** Available options for `collection`, `form`, and `location` field kinds. */
  options?: {
    collections?: Array<{ id: string; name: string }>;
    forms?: Array<{ id: string; name: string }>;
    locations?: Array<{ id: string; name: string }>;
  };
}

const SPACING: readonly SpacingToken[] = [
  "none",
  "xs",
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "3xl",
  "4xl",
];
/** Margins additionally offer `auto`, which is what centres a max-width block. */
const MARGINS: readonly MarginToken[] = [...SPACING, "auto"];
const FONT_SIZES = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl", "6xl"] as const;
const WEIGHTS = ["light", "normal", "medium", "semibold", "bold", "extrabold"] as const;
const RADII = ["none", "sm", "md", "lg", "xl", "full"] as const;
const SHADOWS = ["none", "sm", "md", "lg", "xl"] as const;
const COLOR_TOKENS = [
  "primary",
  "secondary",
  "accent",
  "foreground",
  "mutedForeground",
  "primaryForeground",
  "background",
  "muted",
  "card",
  "border",
] as const;

export function Inspector({
  node,
  breakpoint,
  resolvedStyle,
  onUpdateProps,
  onUpdateStyle,
  onUpdateNode,
  options,
}: InspectorProps) {
  const definition = getDefinition(node.type);

  return (
    <div className="divide-y divide-slate-200">
      {breakpoint !== "base" && (
        <div className="flex items-start gap-2 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900">
          {breakpoint === "mobile" ? (
            <Smartphone className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          ) : (
            <Tablet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          )}
          <span>
            Style changes apply to <strong>{breakpoint}</strong> only. Content changes always apply
            everywhere.
          </span>
        </div>
      )}

      <Section title="Content" defaultOpen>
        <Field label="Layer name">
          <TextInput
            value={node.name ?? ""}
            placeholder={definition?.label ?? node.type}
            onChange={(v) => onUpdateNode({ name: v || undefined })}
          />
        </Field>

        {definition?.propFields.length ? (
          definition.propFields.map((field) => (
            <PropControl
              key={field.key}
              field={field}
              value={node.props[field.key]}
              allProps={node.props}
              options={options}
              onChange={(value) => onUpdateProps({ [field.key]: value })}
            />
          ))
        ) : (
          <p className="text-[11px] text-slate-500">This element has no content settings.</p>
        )}
      </Section>

      <Section title="Layout">
        <Field label="Display">
          <Select
            value={resolvedStyle.display ?? ""}
            options={[
              { value: "", label: "Default" },
              { value: "block", label: "Block" },
              { value: "flex", label: "Flex" },
              { value: "grid", label: "Grid" },
              { value: "inline-flex", label: "Inline flex" },
              { value: "inline-block", label: "Inline block" },
            ]}
            onChange={(v) => onUpdateStyle({ display: (v || undefined) as StyleProps["display"] })}
          />
        </Field>

        {(resolvedStyle.display === "flex" || resolvedStyle.display === "inline-flex") && (
          <>
            <Field label="Direction">
              <Select
                value={resolvedStyle.flexDirection ?? "row"}
                options={[
                  { value: "row", label: "Row" },
                  { value: "column", label: "Column" },
                  { value: "row-reverse", label: "Row reversed" },
                  { value: "column-reverse", label: "Column reversed" },
                ]}
                onChange={(v) =>
                  onUpdateStyle({ flexDirection: v as StyleProps["flexDirection"] })
                }
              />
            </Field>
            <Field label="Justify">
              <Select
                value={resolvedStyle.justifyContent ?? ""}
                options={[
                  { value: "", label: "Default" },
                  { value: "flex-start", label: "Start" },
                  { value: "center", label: "Center" },
                  { value: "flex-end", label: "End" },
                  { value: "space-between", label: "Space between" },
                  { value: "space-around", label: "Space around" },
                ]}
                onChange={(v) =>
                  onUpdateStyle({ justifyContent: (v || undefined) as StyleProps["justifyContent"] })
                }
              />
            </Field>
            <Field label="Align">
              <Select
                value={resolvedStyle.alignItems ?? ""}
                options={[
                  { value: "", label: "Default" },
                  { value: "flex-start", label: "Start" },
                  { value: "center", label: "Center" },
                  { value: "flex-end", label: "End" },
                  { value: "stretch", label: "Stretch" },
                ]}
                onChange={(v) =>
                  onUpdateStyle({ alignItems: (v || undefined) as StyleProps["alignItems"] })
                }
              />
            </Field>
          </>
        )}

        <Field label="Gap">
          <TokenPicker
            value={resolvedStyle.gap}
            tokens={SPACING}
            onChange={(v) => onUpdateStyle({ gap: v as SpacingToken })}
          />
        </Field>

        <Field label="Width">
          <TextInput
            value={resolvedStyle.width ?? ""}
            placeholder="auto, 100%, 320px"
            onChange={(v) => onUpdateStyle({ width: v || undefined })}
          />
        </Field>
        <Field label="Max width">
          <TextInput
            value={resolvedStyle.maxWidth ?? ""}
            placeholder="none, 65ch, 900px"
            onChange={(v) => onUpdateStyle({ maxWidth: v || undefined })}
          />
        </Field>
        <Field label="Min height">
          <TextInput
            value={resolvedStyle.minHeight ?? ""}
            placeholder="auto, 400px, 60vh"
            onChange={(v) => onUpdateStyle({ minHeight: v || undefined })}
          />
        </Field>
      </Section>

      <Section title="Spacing">
        <BoxControl
          label="Padding"
          tokens={SPACING}
          values={{
            top: resolvedStyle.paddingTop,
            right: resolvedStyle.paddingRight,
            bottom: resolvedStyle.paddingBottom,
            left: resolvedStyle.paddingLeft,
          }}
          onChange={(side, value) =>
            onUpdateStyle({
              [`padding${side}`]: value,
            } as StyleProps)
          }
        />
        <BoxControl
          label="Margin"
          // `auto` on left+right is how a max-width block gets centred; without
          // it in this list the only way to centre one was raw CSS.
          tokens={MARGINS}
          values={{
            top: resolvedStyle.marginTop,
            right: resolvedStyle.marginRight,
            bottom: resolvedStyle.marginBottom,
            left: resolvedStyle.marginLeft,
          }}
          onChange={(side, value) =>
            onUpdateStyle({
              [`margin${side}`]: value,
            } as StyleProps)
          }
        />
      </Section>

      <Section title="Typography">
        <Field label="Font">
          <Select
            value={resolvedStyle.fontFamily ?? ""}
            options={[
              { value: "", label: "Inherit" },
              { value: "heading", label: "Heading font" },
              { value: "body", label: "Body font" },
              { value: "mono", label: "Monospace" },
            ]}
            onChange={(v) =>
              onUpdateStyle({ fontFamily: (v || undefined) as StyleProps["fontFamily"] })
            }
          />
        </Field>
        <Field label="Size">
          <TokenPicker
            value={resolvedStyle.fontSize}
            tokens={FONT_SIZES}
            onChange={(v) => onUpdateStyle({ fontSize: v as StyleProps["fontSize"] })}
          />
        </Field>
        <Field label="Weight">
          <Select
            value={resolvedStyle.fontWeight ?? ""}
            options={[
              { value: "", label: "Inherit" },
              ...WEIGHTS.map((w) => ({ value: w, label: w })),
            ]}
            onChange={(v) =>
              onUpdateStyle({ fontWeight: (v || undefined) as StyleProps["fontWeight"] })
            }
          />
        </Field>
        <Field label="Line height">
          <Select
            value={resolvedStyle.lineHeight ?? ""}
            options={[
              { value: "", label: "Default" },
              { value: "tight", label: "Tight" },
              { value: "snug", label: "Snug" },
              { value: "normal", label: "Normal" },
              { value: "relaxed", label: "Relaxed" },
              { value: "loose", label: "Loose" },
            ]}
            onChange={(v) =>
              onUpdateStyle({ lineHeight: (v || undefined) as StyleProps["lineHeight"] })
            }
          />
        </Field>
        <Field label="Align">
          <ButtonGroup
            value={resolvedStyle.textAlign ?? ""}
            options={[
              { value: "left", label: "Left" },
              { value: "center", label: "Center" },
              { value: "right", label: "Right" },
            ]}
            onChange={(v) =>
              onUpdateStyle({ textAlign: (v || undefined) as StyleProps["textAlign"] })
            }
          />
        </Field>
        <Field label="Transform">
          <Select
            value={resolvedStyle.textTransform ?? ""}
            options={[
              { value: "", label: "None" },
              { value: "uppercase", label: "UPPERCASE" },
              { value: "lowercase", label: "lowercase" },
              { value: "capitalize", label: "Capitalize" },
            ]}
            onChange={(v) =>
              onUpdateStyle({ textTransform: (v || undefined) as StyleProps["textTransform"] })
            }
          />
        </Field>
        <Field label="Text colour">
          <ColorControl
            value={resolvedStyle.color}
            onChange={(value) => onUpdateStyle({ color: value })}
          />
        </Field>
      </Section>

      <Section title="Background & border">
        <Field label="Background">
          <ColorControl
            value={resolvedStyle.backgroundColor}
            onChange={(value) => onUpdateStyle({ backgroundColor: value })}
          />
        </Field>
        <Field label="Background image">
          <TextInput
            value={resolvedStyle.backgroundImage ?? ""}
            placeholder="https://…"
            onChange={(v) => onUpdateStyle({ backgroundImage: v || undefined })}
          />
        </Field>
        {resolvedStyle.backgroundImage && (
          <Field label="Darken" hint="Improves text contrast over photos.">
            <Range
              value={resolvedStyle.backgroundOverlay ?? 0}
              min={0}
              max={0.85}
              step={0.05}
              onChange={(v) => onUpdateStyle({ backgroundOverlay: v || undefined })}
            />
          </Field>
        )}
        <Field label="Corner radius">
          <TokenPicker
            value={resolvedStyle.borderRadius}
            tokens={RADII}
            onChange={(v) => onUpdateStyle({ borderRadius: v as StyleProps["borderRadius"] })}
          />
        </Field>
        <Field label="Border width">
          <NumberInput
            value={resolvedStyle.borderWidth}
            min={0}
            max={24}
            onChange={(v) => onUpdateStyle({ borderWidth: v })}
          />
        </Field>
        {(resolvedStyle.borderWidth ?? 0) > 0 && (
          <Field label="Border colour">
            <ColorControl
              value={resolvedStyle.borderColor}
              onChange={(value) => onUpdateStyle({ borderColor: value })}
            />
          </Field>
        )}
        <Field label="Shadow">
          <TokenPicker
            value={resolvedStyle.boxShadow}
            tokens={SHADOWS}
            onChange={(v) => onUpdateStyle({ boxShadow: v as StyleProps["boxShadow"] })}
          />
        </Field>
      </Section>

      <Section title="Animation">
        <Field label="On scroll">
          <Select
            value={node.animation?.kind ?? "none"}
            options={[
              { value: "none", label: "None" },
              { value: "fade-in", label: "Fade in" },
              { value: "fade-up", label: "Fade up" },
              { value: "fade-down", label: "Fade down" },
              { value: "slide-left", label: "Slide from right" },
              { value: "slide-right", label: "Slide from left" },
              { value: "zoom-in", label: "Zoom in" },
              { value: "zoom-out", label: "Zoom out" },
              { value: "blur-in", label: "Blur in" },
            ]}
            onChange={(v) =>
              onUpdateNode({
                animation:
                  v === "none"
                    ? undefined
                    : {
                        ...node.animation,
                        kind: v as NonNullable<SiteNode["animation"]>["kind"],
                      },
              })
            }
          />
        </Field>
        {node.animation && node.animation.kind !== "none" && (
          <>
            <Field label="Duration (ms)">
              <NumberInput
                value={node.animation.duration ?? 600}
                min={0}
                max={5000}
                onChange={(v) =>
                  onUpdateNode({ animation: { ...node.animation!, duration: v ?? 600 } })
                }
              />
            </Field>
            <Field label="Delay (ms)">
              <NumberInput
                value={node.animation.delay ?? 0}
                min={0}
                max={5000}
                onChange={(v) => onUpdateNode({ animation: { ...node.animation!, delay: v ?? 0 } })}
              />
            </Field>
          </>
        )}
      </Section>

      <Section title="Visibility">
        <p className="mb-2 text-[11px] text-slate-500">
          Hide this element on specific screen sizes.
        </p>
        <div className="flex gap-2">
          {(["tablet", "mobile"] as const).map((bp) => {
            const hidden = node.hiddenOn?.includes(bp) ?? false;
            return (
              <button
                key={bp}
                type="button"
                aria-pressed={hidden}
                onClick={() => {
                  const set = new Set(node.hiddenOn ?? []);
                  if (hidden) set.delete(bp);
                  else set.add(bp);
                  onUpdateNode({ hiddenOn: set.size ? Array.from(set) : undefined });
                }}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium capitalize transition-colors",
                  hidden
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50",
                )}
              >
                Hidden on {bp}
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Accessibility">
        <Field label="Aria label" hint="Describes this element to screen readers.">
          <TextInput
            value={node.a11y?.ariaLabel ?? ""}
            onChange={(v) => onUpdateNode({ a11y: { ...node.a11y, ariaLabel: v || undefined } })}
          />
        </Field>
        {node.type === "Image" && (
          <Checkbox
            label="Decorative image"
            hint="Skips alt text. Only for images that carry no meaning."
            checked={Boolean(node.a11y?.decorative)}
            onChange={(checked) =>
              onUpdateNode({ a11y: { ...node.a11y, decorative: checked || undefined } })
            }
          />
        )}
      </Section>

      <Section title="Advanced">
        <Field label="Custom CSS" hint="Plain declarations only, e.g. letter-spacing: 2px;">
          <textarea
            value={resolvedStyle.customCss ?? ""}
            rows={3}
            spellCheck={false}
            onChange={(e) => onUpdateStyle({ customCss: e.target.value || undefined })}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 font-mono text-[11px] focus:border-blue-500 focus:outline-none"
          />
        </Field>
      </Section>
    </div>
  );
}

// =====================================================================
// Registry-driven prop control
// =====================================================================

function PropControl({
  field,
  value,
  allProps,
  options,
  onChange,
}: {
  field: PropField;
  value: unknown;
  allProps: Record<string, unknown>;
  options?: InspectorProps["options"];
  onChange: (value: unknown) => void;
}) {
  // `showWhen` with an empty `equals` means "show when the other prop has any
  // value" — used for things like icon position, which only matters once an
  // icon is chosen.
  if (field.showWhen) {
    const other = allProps[field.showWhen.key];
    const matches =
      field.showWhen.equals.length === 0
        ? other !== undefined && other !== null && other !== ""
        : field.showWhen.equals.includes(other);
    if (!matches) return null;
  }

  switch (field.kind) {
    case "boolean":
      return (
        <Checkbox
          label={field.label}
          hint={field.help}
          checked={Boolean(value)}
          onChange={onChange}
        />
      );

    case "number":
      return (
        <Field label={field.label} hint={field.help}>
          <NumberInput
            value={typeof value === "number" ? value : undefined}
            min={field.min}
            max={field.max}
            onChange={onChange}
          />
        </Field>
      );

    case "select":
      return (
        <Field label={field.label} hint={field.help}>
          <Select
            value={String(value ?? "")}
            options={field.options ?? []}
            onChange={onChange}
          />
        </Field>
      );

    case "textarea":
    case "richtext":
      return (
        <Field label={field.label} hint={field.help}>
          <textarea
            value={String(value ?? "")}
            rows={field.kind === "richtext" ? 6 : 3}
            placeholder={field.placeholder}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
          />
        </Field>
      );

    case "image":
      return (
        <Field label={field.label} hint={field.help}>
          <ImageField
            value={String(value ?? "")}
            placeholder={field.placeholder}
            onChange={(v) => onChange(v || undefined)}
          />
        </Field>
      );

    case "icon":
      return (
        <Field label={field.label} hint={field.help}>
          <Select
            value={String(value ?? "")}
            options={[
              { value: "", label: "None" },
              ...ICON_NAMES.map((n) => ({ value: n, label: n })),
            ]}
            onChange={(v) => onChange(v || undefined)}
          />
        </Field>
      );

    case "collection":
    case "form":
    case "location": {
      const list =
        field.kind === "collection"
          ? options?.collections
          : field.kind === "form"
            ? options?.forms
            : options?.locations;
      return (
        <Field label={field.label} hint={field.help}>
          <Select
            value={String(value ?? "")}
            options={[
              { value: "", label: list?.length ? "Please choose…" : "None available yet" },
              ...(list ?? []).map((o) => ({ value: o.id, label: o.name })),
            ]}
            onChange={(v) => onChange(v || undefined)}
          />
        </Field>
      );
    }

    case "list":
      return (
        <ListControl
          field={field}
          items={Array.isArray(value) ? (value as Array<Record<string, unknown>>) : []}
          onChange={onChange}
        />
      );

    default:
      return (
        <Field label={field.label} hint={field.help}>
          <TextInput
            value={String(value ?? "")}
            placeholder={field.placeholder}
            onChange={(v) => onChange(v || undefined)}
          />
        </Field>
      );
  }
}

/**
 * Repeatable item editor for list-shaped props (FAQ entries, slides, services).
 *
 * Reordering, adding, and removing are all local array operations committed
 * through `onChange`, so they flow through the same undo history as any other
 * prop edit.
 */
function ListControl({
  field,
  items,
  onChange,
}: {
  field: PropField;
  items: Array<Record<string, unknown>>;
  onChange: (value: unknown) => void;
}) {
  const [open, setOpen] = useState<number | null>(0);
  const itemFields = field.itemFields ?? [];

  const update = (index: number, key: string, value: unknown) => {
    const next = items.map((item, i) => (i === index ? { ...item, [key]: value } : item));
    onChange(next);
  };

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[11px] font-medium text-slate-600">{field.label}</label>
        <button
          type="button"
          onClick={() => {
            onChange([...items, Object.fromEntries(itemFields.map((f) => [f.key, ""]))]);
            setOpen(items.length);
          }}
          className="text-[11px] font-medium text-blue-600 hover:text-blue-700"
        >
          + Add
        </button>
      </div>

      {items.length === 0 && (
        <p className="rounded-md border border-dashed border-slate-200 px-2 py-3 text-center text-[11px] text-slate-400">
          No items yet
        </p>
      )}

      <div className="space-y-1.5">
        {items.map((item, index) => (
          <div key={index} className="rounded-md border border-slate-200">
            <div className="flex items-center gap-1 px-2 py-1.5">
              <button
                type="button"
                onClick={() => setOpen(open === index ? null : index)}
                className="flex min-w-0 flex-1 items-center gap-1 text-left text-[11px] font-medium text-slate-700"
              >
                <ChevronDown
                  className={cn("h-3 w-3 shrink-0 transition-transform", open !== index && "-rotate-90")}
                />
                <span className="truncate">
                  {String(item[itemFields[0]?.key ?? ""] || `Item ${index + 1}`)}
                </span>
              </button>
              <button
                type="button"
                title="Move up"
                disabled={index === 0}
                onClick={() => {
                  const next = [...items];
                  [next[index - 1], next[index]] = [next[index], next[index - 1]];
                  onChange(next);
                }}
                className="px-1 text-[11px] text-slate-400 hover:text-slate-700 disabled:opacity-30"
              >
                ↑
              </button>
              <button
                type="button"
                title="Move down"
                disabled={index === items.length - 1}
                onClick={() => {
                  const next = [...items];
                  [next[index], next[index + 1]] = [next[index + 1], next[index]];
                  onChange(next);
                }}
                className="px-1 text-[11px] text-slate-400 hover:text-slate-700 disabled:opacity-30"
              >
                ↓
              </button>
              <button
                type="button"
                title="Remove"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                className="px-1 text-[11px] text-slate-400 hover:text-red-600"
              >
                ✕
              </button>
            </div>

            {open === index && (
              <div className="space-y-2 border-t border-slate-100 px-2 py-2">
                {itemFields.map((itemField) => (
                  <div key={itemField.key}>
                    <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                      {itemField.label}
                    </label>
                    {itemField.kind === "textarea" ? (
                      <textarea
                        value={String(item[itemField.key] ?? "")}
                        rows={2}
                        onChange={(e) => update(index, itemField.key, e.target.value)}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                      />
                    ) : itemField.kind === "select" ? (
                      <Select
                        value={String(item[itemField.key] ?? "")}
                        options={itemField.options ?? []}
                        onChange={(v) => update(index, itemField.key, v)}
                      />
                    ) : itemField.kind === "image" ? (
                      <ImageField
                        value={String(item[itemField.key] ?? "")}
                        placeholder={itemField.placeholder}
                        onChange={(v) => update(index, itemField.key, v)}
                      />
                    ) : (
                      <TextInput
                        value={String(item[itemField.key] ?? "")}
                        onChange={(v) => update(index, itemField.key, v)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// =====================================================================
// Primitives
// =====================================================================

function Section({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
        aria-expanded={open}
      >
        {title}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !open && "-rotate-90")} />
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-2.5">
      <label className="mb-1 block text-[11px] font-medium text-slate-600">{label}</label>
      {children}
      {hint && (
        <p className="mt-1 flex items-start gap-1 text-[10px] leading-relaxed text-slate-400">
          <Info className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          {hint}
        </p>
      )}
    </div>
  );
}

function TextInput({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
    />
  );
}

function NumberInput({
  value,
  min,
  max,
  onChange,
}: {
  value?: number;
  min?: number;
  max?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <input
      type="number"
      value={value ?? ""}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
    />
  );
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function ButtonGroup({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex rounded-md border border-slate-200 p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          // Clicking the active option clears it, so a style can be unset.
          onClick={() => onChange(value === option.value ? "" : option.value)}
          className={cn(
            "flex-1 rounded px-1.5 py-1 text-[11px] font-medium transition-colors",
            value === option.value ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function TokenPicker({
  value,
  tokens,
  onChange,
}: {
  value?: string;
  tokens: readonly string[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {tokens.map((token) => (
        <button
          key={token}
          type="button"
          aria-pressed={value === token}
          onClick={() => onChange(value === token ? undefined : token)}
          className={cn(
            "rounded border px-1.5 py-1 text-[10px] font-medium transition-colors",
            value === token
              ? "border-blue-500 bg-blue-50 text-blue-700"
              : "border-slate-200 text-slate-600 hover:bg-slate-50",
          )}
        >
          {token}
        </button>
      ))}
    </div>
  );
}

/**
 * Colour control.
 *
 * Theme tokens are offered first and a literal picker second, because a token
 * keeps the element in sync with the theme while a literal opts out. Presenting
 * them together makes that trade-off visible instead of accidental.
 */
function ColorControl({
  value,
  onChange,
}: {
  value?: { token?: string; value?: string };
  onChange: (value: { token: string } | { value: string } | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => onChange(undefined)}
          className={cn(
            "rounded border px-1.5 py-1 text-[10px] font-medium",
            !value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600",
          )}
        >
          inherit
        </button>
        {COLOR_TOKENS.map((token) => (
          <button
            key={token}
            type="button"
            title={token}
            onClick={() => onChange({ token })}
            className={cn(
              "flex items-center gap-1 rounded border px-1.5 py-1 text-[10px] font-medium",
              value?.token === token
                ? "border-blue-500 bg-blue-50 text-blue-700"
                : "border-slate-200 text-slate-600 hover:bg-slate-50",
            )}
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 rounded-full ring-1 ring-slate-300"
              style={{ background: `var(--sb-color-${token.replace(/([A-Z])/g, "-$1").toLowerCase()})` }}
            />
            {token}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          value={value?.value?.startsWith("#") ? value.value : "#000000"}
          onChange={(e) => onChange({ value: e.target.value })}
          className="h-7 w-9 cursor-pointer rounded border border-slate-200"
          aria-label="Custom colour"
        />
        <input
          type="text"
          value={value?.value ?? ""}
          placeholder="Custom, e.g. #FF0055"
          onChange={(e) => onChange(e.target.value ? { value: e.target.value } : undefined)}
          className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
        />
      </div>
    </div>
  );
}

/**
 * Four-sided spacing control.
 *
 * Generic over the token type so the margin control can offer `auto` — which is
 * the only way to centre a width-capped block, and was previously not expressible
 * at all. Padding stays restricted to the spacing scale, where `auto` is
 * meaningless.
 */
function BoxControl<T extends string>({
  label,
  values,
  tokens,
  onChange,
}: {
  label: string;
  values: { top?: T; right?: T; bottom?: T; left?: T };
  tokens: readonly T[];
  onChange: (side: "Top" | "Right" | "Bottom" | "Left", value: T | undefined) => void;
}) {
  const sides: Array<["Top" | "Right" | "Bottom" | "Left", T | undefined]> = [
    ["Top", values.top],
    ["Right", values.right],
    ["Bottom", values.bottom],
    ["Left", values.left],
  ];

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-[11px] font-medium text-slate-600">{label}</label>
        <button
          type="button"
          onClick={() => sides.forEach(([side]) => onChange(side, undefined))}
          className="text-[10px] text-slate-400 hover:text-slate-700"
        >
          Reset
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {sides.map(([side, value]) => (
          <div key={side}>
            <span className="mb-0.5 block text-[10px] text-slate-400">{side}</span>
            <select
              value={value ?? ""}
              onChange={(e) => onChange(side, (e.target.value || undefined) as T | undefined)}
              className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] focus:border-blue-500 focus:outline-none"
            >
              <option value="">—</option>
              {tokens.map((token) => (
                <option key={token} value={token}>
                  {token}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}

function Checkbox({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="mb-2.5 flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-slate-700">{label}</span>
        {hint && <span className="block text-[10px] leading-relaxed text-slate-400">{hint}</span>}
      </span>
    </label>
  );
}

function Range({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-blue-600"
      />
      <span className="w-8 text-right text-[11px] text-slate-500">{Math.round(value * 100)}%</span>
    </div>
  );
}
