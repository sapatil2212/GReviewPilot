"use client";

/**
 * Add panel: section presets and individual components.
 *
 * Sections come first because that is how people actually build a page — they
 * add a "pricing section", not a grid containing three boxes. Components are
 * there for refinement.
 *
 * Both are draggable onto the canvas and clickable for keyboard/touch users,
 * since drag-and-drop alone is not accessible.
 */

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { paletteByCategory, type ComponentDefinition } from "@/site/registry/definitions";
import { presetsByGroup, type SectionPreset } from "@/site/registry/presets";
import { resolveIcon } from "@/site/render/icons";
import { cn } from "@/lib/utils";

export interface AddPanelProps {
  onAddSection: (presetKey: string) => void;
  onAddComponent: (type: string) => void;
}

export function AddPanel({ onAddSection, onAddComponent }: AddPanelProps) {
  const [tab, setTab] = useState<"sections" | "components">("sections");
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();

  const sectionGroups = useMemo(() => {
    const groups = presetsByGroup();
    if (!term) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (p) =>
            p.label.toLowerCase().includes(term) ||
            p.description.toLowerCase().includes(term) ||
            p.key.includes(term),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [term]);

  const componentGroups = useMemo(() => {
    const groups = paletteByCategory();
    if (!term) return groups;
    return groups
      .map((group) => ({
        ...group,
        items: group.items.filter(
          (c) =>
            c.label.toLowerCase().includes(term) ||
            c.description.toLowerCase().includes(term) ||
            c.type.toLowerCase().includes(term),
        ),
      }))
      .filter((group) => group.items.length > 0);
  }, [term]);

  const empty = tab === "sections" ? sectionGroups.length === 0 : componentGroups.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-slate-200 p-2">
        <div className="mb-2 flex rounded-md bg-slate-100 p-0.5">
          {(["sections", "components"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value)}
              aria-pressed={tab === value}
              className={cn(
                "flex-1 rounded px-2 py-1 text-[11px] font-medium capitalize transition-colors",
                tab === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500",
              )}
            >
              {value}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tab === "sections" ? "Search sections" : "Search components"}
            className="w-full rounded-md border border-slate-200 py-1.5 pl-7 pr-2 text-xs focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {empty && (
          <p className="px-2 py-6 text-center text-[11px] text-slate-400">
            Nothing matches &ldquo;{search}&rdquo;
          </p>
        )}

        {tab === "sections"
          ? sectionGroups.map((group) => (
              <div key={group.group} className="mb-3">
                <h4 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.label}
                </h4>
                <div className="space-y-1">
                  {group.items.map((preset) => (
                    <SectionCard key={preset.key} preset={preset} onAdd={onAddSection} />
                  ))}
                </div>
              </div>
            ))
          : componentGroups.map((group) => (
              <div key={group.category} className="mb-3">
                <h4 className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {group.label}
                </h4>
                <div className="grid grid-cols-2 gap-1">
                  {group.items.map((definition) => (
                    <ComponentCard
                      key={definition.type}
                      definition={definition}
                      onAdd={onAddComponent}
                    />
                  ))}
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}

function SectionCard({
  preset,
  onAdd,
}: {
  preset: SectionPreset;
  onAdd: (key: string) => void;
}) {
  const Icon = resolveIcon(preset.icon);
  return (
    <button
      type="button"
      onClick={() => onAdd(preset.key)}
      className="flex w-full items-start gap-2 rounded-md border border-slate-200 px-2 py-2 text-left transition-colors hover:border-blue-300 hover:bg-blue-50"
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" />
      <span className="min-w-0">
        <span className="block text-[11px] font-medium text-slate-800">{preset.label}</span>
        <span className="block text-[10px] leading-snug text-slate-500">{preset.description}</span>
      </span>
    </button>
  );
}

function ComponentCard({
  definition,
  onAdd,
}: {
  definition: ComponentDefinition;
  onAdd: (type: string) => void;
}) {
  const Icon = resolveIcon(definition.icon);
  return (
    <button
      type="button"
      draggable
      title={definition.description}
      onClick={() => onAdd(definition.type)}
      onDragStart={(e) => {
        // The Canvas reads this MIME type on drop; `text/plain` is a fallback
        // for browsers that refuse a drag with no standard payload.
        e.dataTransfer.setData("application/x-sb-component", definition.type);
        e.dataTransfer.setData("text/plain", definition.label);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className="flex cursor-grab flex-col items-center gap-1 rounded-md border border-slate-200 px-1 py-2.5 transition-colors hover:border-blue-300 hover:bg-blue-50 active:cursor-grabbing"
    >
      <Icon className="h-4 w-4 text-slate-500" />
      <span className="text-center text-[10px] font-medium leading-tight text-slate-700">
        {definition.label}
      </span>
    </button>
  );
}
