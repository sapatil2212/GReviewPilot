"use client";

/**
 * Editor canvas.
 *
 * Renders the real site through the same SiteRenderer the public page uses,
 * then layers selection, hover, and drop affordances on top via the `wrap`
 * hook. Nothing about the page's own markup changes between edit and publish,
 * which is what makes the preview trustworthy.
 *
 * ---------------------------------------------------------------------
 * Why a scaled div rather than an iframe
 * ---------------------------------------------------------------------
 * An iframe would give perfect CSS isolation and real media queries, but it
 * also puts the document in a separate window: drag-and-drop between the
 * palette and the canvas needs manual event bridging, selection overlays need
 * coordinate translation, and every React update crosses a boundary.
 *
 * Instead the canvas is a normal element whose styles are fully scoped under
 * `.sb-root` (see render/styles.ts baseCss), and breakpoints are resolved in
 * JS rather than by media query. The cost is that `documentCss` is not used in
 * edit mode; the benefit is that everything else is direct DOM.
 *
 * ---------------------------------------------------------------------
 * Multi-select
 * ---------------------------------------------------------------------
 * `selectedIds` (plural) drives which nodes render a selection outline;
 * `selectedId` (singular, the LAST entry — see useEditorState's doc comment)
 * drives which one gets the toolbar and drag handle, since a toolbar on N
 * overlapping nodes would just be visual noise. Shift/cmd-click toggles
 * membership via `onToggleSelect`; a plain click replaces the whole selection
 * via `onSelect`.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clipboard,
  Copy,
  GripVertical,
  Group,
  Lock,
  Scissors,
  Trash2,
  Ungroup,
} from "lucide-react";
import { SiteRenderer } from "@/site/render/SiteRenderer";
import { BREAKPOINT_CANVAS_WIDTH } from "@/site/document/types";
import type { Breakpoint, NodeId, RenderContext, SiteDocument } from "@/site/document/types";
import { canDrop, getDefinition } from "@/site/registry/definitions";
import { ContextMenu, type ContextMenuState } from "./ContextMenu";

export interface CanvasProps {
  ctx: RenderContext;
  document: SiteDocument;
  selectedId: NodeId | null;
  selectedIds: NodeId[];
  hoveredId: NodeId | null;
  breakpoint: Breakpoint;
  zoom: number;
  onSelect: (id: NodeId | null) => void;
  onToggleSelect: (id: NodeId) => void;
  onHover: (id: NodeId | null) => void;
  onMove: (id: NodeId, parentId: NodeId, index: number) => void;
  onDropNew: (type: string, parentId: NodeId, index: number) => void;
  onDelete: (id: NodeId) => void;
  onDeleteSelected: () => void;
  onDuplicate: (id: NodeId) => void;
  onDuplicateSelected: () => void;
  onNudge: (id: NodeId, direction: "up" | "down") => void;
  onInlineEdit: (id: NodeId, prop: string, value: string) => void;
  onCopy: (ids?: NodeId[]) => boolean;
  onCut: () => boolean;
  onPaste: () => boolean;
  onGroup: (ids: NodeId[]) => void;
  onUngroup: (id: NodeId) => void;
  onToggleFlag: (id: NodeId, flag: "locked" | "hidden") => void;
  /**
   * Shown inside the frame when the page has no content.
   *
   * Passed in rather than built here so the actions can live with the state
   * that owns them (adding sections, switching the left rail), keeping the
   * canvas presentational like the other panels.
   */
  emptyState?: React.ReactNode;
}

interface DropTarget {
  parentId: NodeId;
  index: number;
  /** Where to draw the insertion line, in canvas coordinates. */
  rect: { top: number; left: number; width: number; horizontal: boolean };
}

export function Canvas({
  ctx,
  document: doc,
  selectedId,
  selectedIds,
  hoveredId,
  breakpoint,
  zoom,
  onSelect,
  onToggleSelect,
  onHover,
  onMove,
  onDropNew,
  onDelete,
  onDeleteSelected,
  onDuplicate,
  onDuplicateSelected,
  onNudge,
  onInlineEdit,
  onCopy,
  onCut,
  onPaste,
  onGroup,
  onUngroup,
  onToggleFlag,
  emptyState,
}: CanvasProps) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<NodeId | null>(null);

  // A page whose root has no children renders as a blank white frame with no
  // indication that anything is meant to go there.
  const isPageEmpty = (doc.nodes[doc.root]?.children?.length ?? 0) === 0;
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const width = BREAKPOINT_CANVAS_WIDTH[breakpoint];
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  // -----------------------------------------------------------------
  // Drop resolution
  // -----------------------------------------------------------------

  /**
   * Work out where a drop should land from the pointer position.
   *
   * Walks the element under the cursor upward to the nearest node that can
   * accept the dragged type, then compares the pointer against each child's
   * midpoint to pick an insertion index. Row-direction containers are measured
   * horizontally, everything else vertically — otherwise dropping into a flex
   * row would always insert at the end.
   */
  const resolveDrop = useCallback(
    (clientX: number, clientY: number, movingType: string): DropTarget | null => {
      const frame = frameRef.current;
      if (!frame) return null;

      const el = window.document.elementFromPoint(clientX, clientY);
      if (!el) return null;

      let host = el.closest("[data-sb-id]") as HTMLElement | null;
      let parentId: NodeId | null = null;

      while (host) {
        const id = host.dataset.sbId as NodeId | undefined;
        const node = id ? doc.nodes[id] : undefined;
        if (node && !node.locked && canDrop(node.type, movingType)) {
          parentId = node.id;
          break;
        }
        host = host.parentElement?.closest("[data-sb-id]") as HTMLElement | null;
      }
      if (!parentId || !host) return null;

      const parent = doc.nodes[parentId];
      const frameRect = frame.getBoundingClientRect();
      const horizontal =
        parent.style?.display === "flex" && (parent.style.flexDirection ?? "row") === "row";

      const childEls = parent.children
        .map((childId) => ({
          id: childId,
          el: frame.querySelector<HTMLElement>(`[data-sb-id="${childId}"]`),
        }))
        .filter((c): c is { id: NodeId; el: HTMLElement } => Boolean(c.el));

      let index = childEls.length;
      for (const [i, child] of childEls.entries()) {
        const rect = child.el.getBoundingClientRect();
        const mid = horizontal ? rect.left + rect.width / 2 : rect.top + rect.height / 2;
        const pointer = horizontal ? clientX : clientY;
        if (pointer < mid) {
          index = i;
          break;
        }
      }

      // Position the insertion line at the boundary we chose.
      const reference = childEls[Math.min(index, childEls.length - 1)]?.el;
      const parentRect = host.getBoundingClientRect();
      let top: number;
      let left: number;
      let lineWidth: number;

      if (reference) {
        const rect = reference.getBoundingClientRect();
        const after = index >= childEls.length;
        if (horizontal) {
          left = ((after ? rect.right : rect.left) - frameRect.left) / zoom;
          top = (rect.top - frameRect.top) / zoom;
          lineWidth = rect.height / zoom;
        } else {
          top = ((after ? rect.bottom : rect.top) - frameRect.top) / zoom;
          left = (rect.left - frameRect.left) / zoom;
          lineWidth = rect.width / zoom;
        }
      } else {
        // Empty container: draw the line just inside it.
        top = (parentRect.top + 4 - frameRect.top) / zoom;
        left = (parentRect.left - frameRect.left) / zoom;
        lineWidth = parentRect.width / zoom;
      }

      return { parentId, index, rect: { top, left, width: lineWidth, horizontal } };
    },
    [doc, zoom],
  );

  // -----------------------------------------------------------------
  // Native drag events (palette -> canvas, canvas -> canvas)
  // -----------------------------------------------------------------

  const onDragOver = useCallback(
    (e: React.DragEvent) => {
      const paletteType = e.dataTransfer.types.includes("application/x-sb-component");
      const movingId = dragging;
      if (!paletteType && !movingId) return;

      e.preventDefault();
      e.dataTransfer.dropEffect = movingId ? "move" : "copy";

      // The dragged type is not readable from dataTransfer during dragover
      // (browsers only expose it on drop), so it is stashed on the element in
      // dragstart and read back here.
      const type = movingId
        ? doc.nodes[movingId]?.type
        : (frameRef.current?.dataset.sbDragType ?? "");
      if (!type) return;

      const target = resolveDrop(e.clientX, e.clientY, type);
      // Reject drops inside the dragged node's own subtree.
      if (target && movingId) {
        let cursor: string | null = target.parentId;
        let guard = 100;
        while (cursor && guard-- > 0) {
          if (cursor === movingId) return setDropTarget(null);
          cursor = doc.nodes[cursor]?.parent ?? null;
        }
      }
      setDropTarget(target);
    },
    [dragging, doc, resolveDrop],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const target = dropTarget;
      setDropTarget(null);

      if (!target) {
        setDragging(null);
        return;
      }

      if (dragging) {
        onMove(dragging, target.parentId, target.index);
        setDragging(null);
        return;
      }

      const type = e.dataTransfer.getData("application/x-sb-component");
      if (type) onDropNew(type, target.parentId, target.index);
    },
    [dropTarget, dragging, onMove, onDropNew],
  );

  useEffect(() => {
    const clear = () => {
      setDragging(null);
      setDropTarget(null);
    };
    window.addEventListener("dragend", clear);
    return () => window.removeEventListener("dragend", clear);
  }, []);

  // -----------------------------------------------------------------
  // Context menu
  // -----------------------------------------------------------------

  const openContextMenu = useCallback(
    (e: React.MouseEvent, nodeId: NodeId) => {
      e.preventDefault();
      e.stopPropagation();

      const node = doc.nodes[nodeId];
      if (!node) return;

      // Right-clicking a node outside the current selection replaces it —
      // matching how every desktop app resolves "right-click somewhere new".
      // Right-clicking WITHIN the existing multi-selection keeps it intact, so
      // "select 3 things, right-click one of them, delete" acts on all 3.
      const targets = selectedSet.has(nodeId) && selectedIds.length > 1 ? selectedIds : [nodeId];
      if (targets.length === 1 && !selectedSet.has(nodeId)) onSelect(nodeId);

      const isMulti = targets.length > 1;
      const definition = getDefinition(node.type);
      const isSection = node.parent === doc.root;
      const canGroupTargets =
        isMulti && targets.every((id) => doc.nodes[id]?.parent === node.parent);

      setMenu({
        x: e.clientX,
        y: e.clientY,
        sections: [
          {
            key: "clipboard",
            actions: [
              {
                key: "copy",
                label: isMulti ? `Copy ${targets.length} elements` : "Copy",
                icon: Copy,
                shortcut: "Ctrl+C",
                onSelect: () => onCopy(targets),
              },
              {
                key: "cut",
                label: "Cut",
                icon: Scissors,
                shortcut: "Ctrl+X",
                disabled: node.locked,
                onSelect: () => onCut(),
              },
              {
                key: "paste",
                label: "Paste",
                icon: Clipboard,
                shortcut: "Ctrl+V",
                onSelect: () => onPaste(),
              },
              {
                key: "duplicate",
                label: isMulti ? `Duplicate ${targets.length} elements` : "Duplicate",
                icon: Copy,
                shortcut: "Ctrl+D",
                disabled: node.id === doc.root,
                onSelect: () => (isMulti ? onDuplicateSelected() : onDuplicate(nodeId)),
              },
            ],
          },
          {
            key: "arrange",
            actions: [
              ...(isSection && !isMulti
                ? [
                    {
                      key: "up",
                      label: "Move up",
                      icon: ArrowUp,
                      onSelect: () => onNudge(nodeId, "up" as const),
                    },
                    {
                      key: "down",
                      label: "Move down",
                      icon: ArrowDown,
                      onSelect: () => onNudge(nodeId, "down" as const),
                    },
                  ]
                : []),
              ...(canGroupTargets
                ? [{ key: "group", label: "Group", icon: Group, onSelect: () => onGroup(targets) }]
                : []),
              ...(!isMulti && definition?.isContainer && node.children.length > 0
                ? [{ key: "ungroup", label: "Ungroup", icon: Ungroup, onSelect: () => onUngroup(nodeId) }]
                : []),
            ],
          },
          {
            key: "visibility",
            actions: [
              {
                key: "lock",
                label: node.locked ? "Unlock" : "Lock",
                icon: Lock,
                onSelect: () => onToggleFlag(nodeId, "locked"),
              },
              {
                key: "hide",
                label: node.hidden ? "Show" : "Hide",
                onSelect: () => onToggleFlag(nodeId, "hidden"),
              },
            ],
          },
          {
            key: "danger",
            actions: [
              {
                key: "delete",
                label: isMulti ? `Delete ${targets.length} elements` : "Delete",
                icon: Trash2,
                shortcut: "Del",
                danger: true,
                disabled: node.id === doc.root || node.locked,
                onSelect: () => (isMulti ? onDeleteSelected() : onDelete(nodeId)),
              },
            ],
          },
        ],
      });
    },
    [
      doc,
      selectedIds,
      selectedSet,
      onSelect,
      onCopy,
      onCut,
      onPaste,
      onDuplicate,
      onDuplicateSelected,
      onNudge,
      onGroup,
      onUngroup,
      onToggleFlag,
      onDelete,
      onDeleteSelected,
    ],
  );

  // -----------------------------------------------------------------
  // Node wrapper
  // -----------------------------------------------------------------

  const wrap = useCallback(
    (nodeId: NodeId, element: ReactNode): ReactNode => {
      const node = doc.nodes[nodeId];
      // The page root is not selectable: there is nothing useful to do with it
      // and it would swallow every click on empty space.
      if (!node || nodeId === doc.root) return element;

      const isSelected = selectedSet.has(nodeId);
      const isPrimary = selectedId === nodeId;
      const isHovered = hoveredId === nodeId && !isSelected;
      const definition = getDefinition(node.type);
      const isSection = node.parent === doc.root;

      return (
        <SelectionWrapper
          key={nodeId}
          nodeId={nodeId}
          label={node.name ?? definition?.label ?? node.type}
          selected={isSelected}
          primary={isPrimary}
          multiSelected={isSelected && selectedIds.length > 1}
          hovered={isHovered}
          locked={Boolean(node.locked)}
          isSection={isSection}
          inlineTextProp={definition?.inlineTextProp}
          currentText={
            definition?.inlineTextProp
              ? String(node.props[definition.inlineTextProp] ?? "")
              : undefined
          }
          onSelect={onSelect}
          onToggleSelect={onToggleSelect}
          onHover={onHover}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onNudge={onNudge}
          onInlineEdit={onInlineEdit}
          onContextMenu={openContextMenu}
          onDragStart={(id) => {
            setDragging(id);
            if (frameRef.current) frameRef.current.dataset.sbDragType = node.type;
          }}
        >
          {element}
        </SelectionWrapper>
      );
    },
    [
      doc,
      selectedId,
      selectedIds,
      selectedSet,
      hoveredId,
      onSelect,
      onToggleSelect,
      onHover,
      onDelete,
      onDuplicate,
      onNudge,
      onInlineEdit,
      openContextMenu,
    ],
  );

  return (
    <div
      data-tour="canvas"
      className="flex-1 overflow-auto bg-slate-100 p-6"
      onClick={(e) => {
        // Clicking the grey surround clears the selection.
        if (e.target === e.currentTarget) onSelect(null);
      }}
      onContextMenu={(e) => {
        // Right-clicking empty canvas offers Paste, same as most editors.
        if (e.target === e.currentTarget) {
          e.preventDefault();
          setMenu({
            x: e.clientX,
            y: e.clientY,
            sections: [
              {
                key: "clipboard",
                actions: [
                  { key: "paste", label: "Paste", icon: Clipboard, shortcut: "Ctrl+V", onSelect: () => onPaste() },
                ],
              },
            ],
          });
        }
      }}
    >
      <div className="mx-auto" style={{ width: width * zoom }}>
        <div
          ref={frameRef}
          data-sb-frame="1"
          className="relative bg-white shadow-xl ring-1 ring-slate-900/5"
          style={{
            width,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            // Reserve the scaled height so the scroll container sizes correctly;
            // transform alone does not affect layout.
            marginBottom: zoom !== 1 ? `${(zoom - 1) * 100}%` : undefined,
          }}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onMouseLeave={() => onHover(null)}
        >
          <SiteRenderer ctx={ctx} scope="sb-canvas" wrap={wrap} />

          {isPageEmpty && emptyState}

          {dropTarget && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute z-50 rounded-full bg-blue-600"
              style={
                dropTarget.rect.horizontal
                  ? {
                      top: dropTarget.rect.top,
                      left: dropTarget.rect.left - 1,
                      width: 3,
                      height: dropTarget.rect.width,
                    }
                  : {
                      top: dropTarget.rect.top - 1,
                      left: dropTarget.rect.left,
                      width: dropTarget.rect.width,
                      height: 3,
                    }
              }
            />
          )}
        </div>
      </div>

      <ContextMenu state={menu} onClose={() => setMenu(null)} />
    </div>
  );
}

// =====================================================================
// Selection wrapper
// =====================================================================

interface SelectionWrapperProps {
  nodeId: NodeId;
  label: string;
  selected: boolean;
  primary: boolean;
  multiSelected: boolean;
  hovered: boolean;
  locked: boolean;
  isSection: boolean;
  inlineTextProp?: string;
  currentText?: string;
  children: ReactNode;
  onSelect: (id: NodeId) => void;
  onToggleSelect: (id: NodeId) => void;
  onHover: (id: NodeId | null) => void;
  onDelete: (id: NodeId) => void;
  onDuplicate: (id: NodeId) => void;
  onNudge: (id: NodeId, direction: "up" | "down") => void;
  onInlineEdit: (id: NodeId, prop: string, value: string) => void;
  onContextMenu: (e: React.MouseEvent, id: NodeId) => void;
  onDragStart: (id: NodeId) => void;
}

/**
 * Wraps a rendered node in an interaction layer.
 *
 * `display: contents` is the key trick: the wrapper participates in the DOM for
 * event handling but not in layout, so a wrapped node remains a direct grid or
 * flex child of its parent. Without it, every wrapper would break the parent's
 * layout — the classic failure mode of overlay-based editors.
 *
 * The outline and toolbar are drawn by a sibling absolutely-positioned element
 * that tracks the node's rect, rather than by styling the node itself, so
 * selection never alters the page's own box model.
 */
function SelectionWrapper({
  nodeId,
  label,
  selected,
  primary,
  multiSelected,
  hovered,
  locked,
  isSection,
  inlineTextProp,
  currentText,
  children,
  onSelect,
  onToggleSelect,
  onHover,
  onDelete,
  onDuplicate,
  onNudge,
  onInlineEdit,
  onContextMenu,
  onDragStart,
}: SelectionWrapperProps) {
  const [editing, setEditing] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(
    null,
  );

  /**
   * Track the wrapped element's position so the overlay can sit on top of it.
   *
   * Measured from the DOM rather than derived from the document, because the
   * node's real size depends on rendered content: text length, loaded fonts,
   * and image aspect ratios. A ResizeObserver keeps the outline attached
   * through reflows that no document change would signal.
   */
  useEffect(() => {
    if (!selected && !hovered) {
      setRect(null);
      return;
    }

    const target = window.document.querySelector<HTMLElement>(`[data-sb-id="${nodeId}"]`);
    const frame = target?.closest<HTMLElement>("[data-sb-frame]");
    if (!target || !frame) return;

    const measure = () => {
      const t = target.getBoundingClientRect();
      const f = frame.getBoundingClientRect();
      // Divide by the frame's scale so overlay coordinates are in unscaled
      // canvas space, matching the absolutely-positioned parent.
      const scale = f.width / (frame.offsetWidth || f.width);
      setRect({
        top: (t.top - f.top) / scale,
        left: (t.left - f.left) / scale,
        width: t.width / scale,
        height: t.height / scale,
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    observer.observe(frame);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [selected, hovered, nodeId]);

  const startInlineEdit = () => {
    if (!inlineTextProp || locked) return;
    setEditing(true);
    // Focus after the contentEditable node exists.
    requestAnimationFrame(() => {
      const el = window.document.querySelector<HTMLElement>(`[data-sb-inline="${nodeId}"]`);
      el?.focus();
      const range = window.document.createRange();
      if (el?.firstChild) {
        range.selectNodeContents(el);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    });
  };

  return (
    <>
      <div
        style={{ display: "contents" }}
        onClick={(e) => {
          e.stopPropagation();
          if (locked) return;
          // Shift or Cmd/Ctrl-click toggles this node's membership in the
          // selection instead of replacing it, matching Figma/Webflow.
          if (e.shiftKey || e.metaKey || e.ctrlKey) onToggleSelect(nodeId);
          else onSelect(nodeId);
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startInlineEdit();
        }}
        onMouseOver={(e) => {
          e.stopPropagation();
          onHover(nodeId);
        }}
        onContextMenu={(e) => onContextMenu(e, nodeId)}
        draggable={!locked}
        onDragStart={(e) => {
          e.stopPropagation();
          onDragStart(nodeId);
          e.dataTransfer.effectAllowed = "move";
          // Some browsers cancel a drag with no payload.
          e.dataTransfer.setData("text/plain", nodeId);
        }}
      >
        {editing && inlineTextProp ? (
          <span
            data-sb-inline={nodeId}
            contentEditable
            suppressContentEditableWarning
            className="outline-2 outline-blue-500 outline-dashed"
            onBlur={(e) => {
              setEditing(false);
              const value = e.currentTarget.textContent ?? "";
              if (value !== currentText) onInlineEdit(nodeId, inlineTextProp, value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.currentTarget.textContent = currentText ?? "";
                setEditing(false);
              }
              // Enter commits for single-line props; Shift+Enter inserts a break.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
          >
            {currentText}
          </span>
        ) : (
          children
        )}
      </div>

      {rect && (selected || hovered) && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-40"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        >
          <div
            className={
              selected
                ? multiSelected
                  ? "absolute inset-0 ring-2 ring-violet-500"
                  : "absolute inset-0 ring-2 ring-blue-600"
                : "absolute inset-0 ring-1 ring-blue-400"
            }
          />
          {/* The toolbar only renders for the primary selection (or on hover of
              an unselected node) — showing it on every member of a
              multi-selection would stack N overlapping toolbars. */}
          {(primary || (hovered && !selected)) && (
            <div
              className={`pointer-events-auto absolute flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[11px] font-medium text-white shadow-sm ${
                selected ? (multiSelected ? "bg-violet-500" : "bg-blue-600") : "bg-blue-400"
              }`}
              // Sit above the node, unless it is at the very top of the page.
              style={rect.top > 26 ? { top: -22, left: 0 } : { top: 2, left: 2 }}
            >
              {!locked && <GripVertical className="h-3 w-3 cursor-grab opacity-70" />}
              <span className="max-w-[140px] truncate">{label}</span>
              {locked && <Lock className="h-3 w-3" />}

              {selected && !locked && !multiSelected && (
                <span className="ml-1 flex items-center gap-0.5 border-l border-white/30 pl-1">
                  {isSection && (
                    <>
                      <IconButton title="Move up" onClick={() => onNudge(nodeId, "up")}>
                        <ArrowUp className="h-3 w-3" />
                      </IconButton>
                      <IconButton title="Move down" onClick={() => onNudge(nodeId, "down")}>
                        <ArrowDown className="h-3 w-3" />
                      </IconButton>
                    </>
                  )}
                  <IconButton title="Duplicate" onClick={() => onDuplicate(nodeId)}>
                    <Copy className="h-3 w-3" />
                  </IconButton>
                  <IconButton title="Delete" onClick={() => onDelete(nodeId)}>
                    <Trash2 className="h-3 w-3" />
                  </IconButton>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className="rounded p-0.5 hover:bg-white/25"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
