"use client";

/**
 * Layers tree.
 *
 * The canvas is the primary way to select things, but it cannot reach nodes
 * that are hidden, zero-sized, or stacked behind others — which is exactly when
 * users need to reach them. The tree also makes structure legible: a designer
 * can see that a button is nested three levels inside a grid cell, which the
 * canvas cannot show.
 *
 * Reordering here uses the same `onMove` as canvas drag-and-drop, so both go
 * through the document operations kernel and cannot diverge.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, Lock, LockOpen } from "lucide-react";
import { getDefinition } from "@/site/registry/definitions";
import { resolveIcon } from "@/site/render/icons";
import type { NodeId, SiteDocument } from "@/site/document/types";
import { cn } from "@/lib/utils";

export interface LayersPanelProps {
  document: SiteDocument;
  selectedId: NodeId | null;
  onSelect: (id: NodeId) => void;
  onHover: (id: NodeId | null) => void;
  onMove: (id: NodeId, parentId: NodeId, index: number) => void;
  onToggle: (id: NodeId, flag: "locked" | "hidden") => void;
}

export function LayersPanel({
  document: doc,
  selectedId,
  onSelect,
  onHover,
  onMove,
  onToggle,
}: LayersPanelProps) {
  const [collapsed, setCollapsed] = useState<Set<NodeId>>(new Set());
  const [dragId, setDragId] = useState<NodeId | null>(null);
  const [dropHint, setDropHint] = useState<{ id: NodeId; position: "before" | "after" | "inside" } | null>(
    null,
  );

  const toggleCollapse = (id: NodeId) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const rows: Array<{ id: NodeId; depth: number }> = [];
  const walk = (id: NodeId, depth: number) => {
    const node = doc.nodes[id];
    if (!node) return;
    // The root is the page itself; showing it adds a level of indent for
    // nothing, since nothing can be moved outside it.
    if (id !== doc.root) rows.push({ id, depth });
    if (collapsed.has(id)) return;
    for (const childId of node.children) walk(childId, id === doc.root ? 0 : depth + 1);
  };
  walk(doc.root, 0);

  const commitDrop = () => {
    if (!dragId || !dropHint) return;
    const targetNode = doc.nodes[dropHint.id];
    if (!targetNode) return;

    if (dropHint.position === "inside") {
      onMove(dragId, dropHint.id, -1);
    } else {
      const parentId = targetNode.parent;
      if (!parentId) return;
      const siblings = doc.nodes[parentId].children;
      const at = siblings.indexOf(dropHint.id);
      onMove(dragId, parentId, dropHint.position === "before" ? at : at + 1);
    }
    setDragId(null);
    setDropHint(null);
  };

  if (rows.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-slate-500">
        This page is empty. Add a section to get started.
      </p>
    );
  }

  return (
    <div className="py-1" onMouseLeave={() => onHover(null)}>
      {rows.map(({ id, depth }) => {
        const node = doc.nodes[id];
        const definition = getDefinition(node.type);
        const Icon = resolveIcon(definition?.icon);
        const hasChildren = node.children.length > 0;
        const isSelected = selectedId === id;
        const hint = dropHint?.id === id ? dropHint.position : null;

        return (
          <div
            key={id}
            draggable
            onDragStart={() => setDragId(id)}
            onDragEnd={() => {
              setDragId(null);
              setDropHint(null);
            }}
            onDragOver={(e) => {
              if (!dragId || dragId === id) return;
              e.preventDefault();
              // Top quarter inserts before, bottom quarter after, middle nests
              // inside when the target accepts children.
              const rect = e.currentTarget.getBoundingClientRect();
              const offset = (e.clientY - rect.top) / rect.height;
              const position =
                offset < 0.25
                  ? "before"
                  : offset > 0.75
                    ? "after"
                    : definition?.isContainer
                      ? "inside"
                      : "after";
              setDropHint({ id, position });
            }}
            onDrop={(e) => {
              e.preventDefault();
              commitDrop();
            }}
            className={cn(
              "group relative flex items-center gap-1 pr-2 text-xs",
              hint === "before" && "before:absolute before:inset-x-2 before:top-0 before:h-0.5 before:bg-blue-600",
              hint === "after" && "after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:bg-blue-600",
              hint === "inside" && "ring-1 ring-inset ring-blue-500",
            )}
          >
            <button
              type="button"
              onClick={() => onSelect(id)}
              onMouseEnter={() => onHover(id)}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-1.5 rounded py-1.5 pr-1 text-left transition-colors",
                isSelected ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-100",
                node.hidden && "opacity-45",
              )}
              style={{ paddingLeft: 8 + depth * 12 }}
            >
              {hasChildren ? (
                <span
                  role="button"
                  tabIndex={-1}
                  aria-label={collapsed.has(id) ? "Expand" : "Collapse"}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleCollapse(id);
                  }}
                  className="shrink-0 text-slate-400 hover:text-slate-700"
                >
                  {collapsed.has(id) ? (
                    <ChevronRight className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </span>
              ) : (
                <span className="w-3.5 shrink-0" />
              )}

              <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="truncate">{node.name ?? definition?.label ?? node.type}</span>
            </button>

            <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <LayerToggle
                active={Boolean(node.hidden)}
                title={node.hidden ? "Show" : "Hide"}
                onClick={() => onToggle(id, "hidden")}
              >
                {node.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </LayerToggle>
              <LayerToggle
                active={Boolean(node.locked)}
                title={node.locked ? "Unlock" : "Lock"}
                onClick={() => onToggle(id, "locked")}
              >
                {node.locked ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <LockOpen className="h-3.5 w-3.5" />
                )}
              </LayerToggle>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LayerToggle({
  active,
  title,
  onClick,
  children,
}: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded p-1 transition-colors",
        active ? "text-blue-600" : "text-slate-400 hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}
