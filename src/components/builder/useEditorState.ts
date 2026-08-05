"use client";

/**
 * Editor state: document, selection, history, autosave, clipboard.
 *
 * ---------------------------------------------------------------------
 * History design
 * ---------------------------------------------------------------------
 * Undo/redo is a stack of whole SiteDocument references, not a stack of
 * inverse patches. That is only viable because every mutation in
 * document/operations.ts is persistent and structurally shares untouched
 * nodes: pushing a "copy" of a 400-node document actually retains one new
 * object plus the handful of nodes that changed. So we get correct,
 * trivially-implemented undo without the bug surface of hand-written
 * inverse operations.
 *
 * Consecutive edits of the same kind to the same node are coalesced, so
 * typing a heading is one undo step rather than one per keystroke.
 *
 * `commit()` reads the current document from the closure rather than through
 * a `setDocument` functional updater. Every call site already runs from a
 * synchronous UI event with a fresh render behind it, so the updater form's
 * "always freshest" guarantee buys nothing here — and giving it up matters
 * for `paste`/`duplicateSelected` below, which need to read back the ids the
 * mutation produced. A value pushed into a closure-captured array from
 * inside a `setState` updater is invoked-once in practice but is not
 * guaranteed to be, so operations that need a reliable one-shot result compute
 * the transform directly instead.
 *
 * ---------------------------------------------------------------------
 * Selection model
 * ---------------------------------------------------------------------
 * `selection` is an ordered array of node ids, not a Set. The LAST entry is
 * the "primary" selection — what the inspector edits, what breadcrumbs walk
 * up from, what a plain (non-shift) click replaces. Earlier entries are
 * additional nodes picked up via shift-click, used only by bulk operations
 * (copy, duplicate, delete). Order captures click order, which matters for
 * "shift-click the primary again to demote it" without extra bookkeeping.
 *
 * ---------------------------------------------------------------------
 * Clipboard
 * ---------------------------------------------------------------------
 * Copy serialises the selected subtrees to sessionStorage rather than the
 * OS clipboard. The Clipboard API needs a user gesture and (for write)
 * usually a secure context and permission prompt, none of which fit a
 * keyboard shortcut fired from inside a canvas full of contentEditable
 * spans. sessionStorage has none of that friction, survives a page switch
 * inside the builder (pages share one tab) and an accidental reload, and is
 * plenty durable for what is fundamentally a short-lived scratch buffer.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  duplicateNode as duplicateNodeOp,
  getDescendants,
  groupNodes as groupNodesOp,
  insertNode as insertNodeOp,
  insertSubtree,
  moveNode as moveNodeOp,
  removeNode as removeNodeOp,
  reorderSibling,
  toggleFlag as toggleFlagOp,
  ungroupNode as ungroupNodeOp,
  updateNode as updateNodeOp,
  updateProps as updatePropsOp,
  updateStyle as updateStyleOp,
  createNode,
  getAncestors,
} from "@/site/document/operations";
import { canDrop, getDefinition } from "@/site/registry/definitions";
import { buildSection } from "@/site/registry/presets";
import type {
  Breakpoint,
  NodeId,
  NodeProps,
  SiteDocument,
  SiteNode,
  StyleProps,
} from "@/site/document/types";
import type { PresetInput } from "@/site/registry/presets";

const HISTORY_LIMIT = 80;
/** Edits within this window to the same target collapse into one undo step. */
const COALESCE_MS = 700;

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "conflict" | "error";

export interface EditorState {
  document: SiteDocument;
  selectedId: NodeId | null;
  hoveredId: NodeId | null;
  breakpoint: Breakpoint;
  canUndo: boolean;
  canRedo: boolean;
  saveState: SaveState;
  saveError: string | null;
}

export interface UseEditorOptions {
  initialDocument: SiteDocument;
  initialVersion: string;
  /** Persist the document. Resolves with the new version string. */
  onSave: (document: SiteDocument, autosave: boolean, expectedVersion: string) => Promise<string>;
  /** Preset defaults (business name, phone) for newly inserted sections. */
  presetInput: PresetInput;
  autosaveMs?: number;
}

interface HistoryEntry {
  document: SiteDocument;
  /** Coalescing key: same key + within COALESCE_MS merges into the previous entry. */
  tag: string | null;
  at: number;
}

// =====================================================================
// Clipboard
// =====================================================================

interface ClipboardSubtree {
  nodes: Record<NodeId, SiteNode>;
  rootId: NodeId;
}

interface EditorClipboard {
  subtrees: ClipboardSubtree[];
}

const CLIPBOARD_KEY = "sb-clipboard";

function readClipboard(): EditorClipboard | null {
  try {
    const raw = window.sessionStorage.getItem(CLIPBOARD_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    const subtrees = (parsed as { subtrees?: unknown })?.subtrees;
    return Array.isArray(subtrees) ? (parsed as EditorClipboard) : null;
  } catch {
    return null;
  }
}

function writeClipboard(clipboard: EditorClipboard): void {
  try {
    window.sessionStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clipboard));
  } catch {
    // Quota errors or a disabled storage API (private-mode edge cases) just
    // mean copy silently does not persist. Never let it throw into a
    // keyboard handler over what is a convenience feature.
  }
}

/** Copy a node and everything under it into a standalone subtree. */
function extractSubtree(doc: SiteDocument, id: NodeId): ClipboardSubtree | null {
  const node = doc.nodes[id];
  if (!node) return null;
  const nodes: Record<NodeId, SiteNode> = { [id]: node };
  for (const descendant of getDescendants(doc, id)) nodes[descendant.id] = descendant;
  return { nodes, rootId: id };
}

/**
 * Drop any id whose ancestor is also in the list.
 *
 * Selecting a section and one of its own children (a plausible shift-click
 * accident) would otherwise copy that child twice — once as part of the
 * section's subtree, once again as its own top-level entry.
 */
function topLevelOnly(doc: SiteDocument, ids: NodeId[]): NodeId[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    let parent = doc.nodes[id]?.parent;
    while (parent) {
      if (set.has(parent)) return false;
      parent = doc.nodes[parent]?.parent;
    }
    return true;
  });
}

// =====================================================================
// Hook
// =====================================================================

export function useEditorState({
  initialDocument,
  initialVersion,
  onSave,
  presetInput,
  autosaveMs = 4000,
}: UseEditorOptions) {
  const [document, setDocument] = useState<SiteDocument>(initialDocument);
  /** Ordered; last entry is the primary selection. See module doc comment. */
  const [selection, setSelection] = useState<NodeId[]>([]);
  const [hoveredId, setHoveredId] = useState<NodeId | null>(null);
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("base");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedId = selection.length > 0 ? selection[selection.length - 1] : null;
  const selectedIds = selection;

  const past = useRef<HistoryEntry[]>([]);
  const future = useRef<HistoryEntry[]>([]);
  const version = useRef(initialVersion);
  const dirty = useRef(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Held during a save so a concurrent edit can't be silently marked clean.
  const savingDocument = useRef<SiteDocument | null>(null);

  const [historyVersion, setHistoryVersion] = useState(0);

  // -------------------------------------------------------------------
  // Commit
  // -------------------------------------------------------------------

  /**
   * Apply a transform and record history.
   *
   * Runs the transform synchronously against the current render's document
   * (see the module doc comment for why this is not a `setState` updater),
   * so `transform` may safely report back what it did via a closure variable
   * — `paste` and `duplicateSelected` rely on that.
   *
   * A no-op transform (the operation refused, e.g. an illegal drop) returns
   * the same reference and is skipped entirely, so rejected actions never
   * pollute the undo stack.
   */
  const commit = useCallback(
    (transform: (doc: SiteDocument) => SiteDocument, tag: string | null = null) => {
      const current = document;
      const next = transform(current);
      if (next === current) return;

      const now = Date.now();
      const top = past.current[past.current.length - 1];
      const shouldCoalesce = tag !== null && top?.tag === tag && now - top.at < COALESCE_MS;

      if (shouldCoalesce) {
        // Keep the older snapshot (the true "before" state) but refresh the
        // timestamp so continued typing keeps extending the same step.
        top.at = now;
      } else {
        past.current.push({ document: current, tag, at: now });
        if (past.current.length > HISTORY_LIMIT) past.current.shift();
      }

      future.current = [];
      dirty.current = true;
      setSaveState("dirty");
      setHistoryVersion((v) => v + 1);
      setDocument(next);
    },
    [document],
  );

  // -------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------

  const undo = useCallback(() => {
    const entry = past.current.pop();
    if (!entry) return;
    setDocument((current) => {
      future.current.push({ document: current, tag: null, at: Date.now() });
      return entry.document;
    });
    dirty.current = true;
    setSaveState("dirty");
    setHistoryVersion((v) => v + 1);
  }, []);

  const redo = useCallback(() => {
    const entry = future.current.pop();
    if (!entry) return;
    setDocument((current) => {
      past.current.push({ document: current, tag: null, at: Date.now() });
      return entry.document;
    });
    dirty.current = true;
    setSaveState("dirty");
    setHistoryVersion((v) => v + 1);
  }, []);

  // -------------------------------------------------------------------
  // Saving
  // -------------------------------------------------------------------

  const save = useCallback(
    async (autosave = false) => {
      if (!dirty.current && autosave) return;
      const snapshot = document;
      savingDocument.current = snapshot;
      setSaveState("saving");
      setSaveError(null);
      try {
        version.current = await onSave(snapshot, autosave, version.current);
        // Only clear the dirty flag if nothing changed while the request was in
        // flight; otherwise the newer edits still need saving.
        if (savingDocument.current === snapshot) {
          dirty.current = false;
          setSaveState("saved");
        } else {
          setSaveState("dirty");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not save";
        const isConflict =
          typeof err === "object" && err !== null && (err as { code?: string }).code === "CONFLICT";
        setSaveState(isConflict ? "conflict" : "error");
        setSaveError(message);
      }
    },
    [document, onSave],
  );

  // Debounced autosave. Rescheduled on every edit so a burst of typing results
  // in one request after the user pauses, not one per change.
  useEffect(() => {
    if (saveState !== "dirty") return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => void save(true), autosaveMs);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [saveState, document, save, autosaveMs]);

  // Warn on navigation with unsaved work. Autosave usually beats this, but a
  // close during an in-flight failure would otherwise lose the edit silently.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // -------------------------------------------------------------------
  // Selection
  // -------------------------------------------------------------------

  /** Replace the selection with a single node (a plain click). */
  const select = useCallback((id: NodeId | null) => {
    setSelection(id ? [id] : []);
  }, []);

  /**
   * Add or remove one node from the selection (a shift/cmd-click).
   *
   * Shift-clicking a node already selected removes it — including the
   * primary, in which case the next-most-recently-added node is promoted.
   */
  const toggleSelect = useCallback((id: NodeId) => {
    setSelection((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const clearSelection = useCallback(() => setSelection([]), []);

  // -------------------------------------------------------------------
  // Node operations
  // -------------------------------------------------------------------

  const updateProps = useCallback(
    (id: NodeId, props: NodeProps) => {
      // Tagged per node + prop set so typing in one field coalesces but moving
      // to another field starts a new undo step.
      commit((doc) => updatePropsOp(doc, id, props), `props:${id}:${Object.keys(props).join(",")}`);
    },
    [commit],
  );

  const updateStyle = useCallback(
    (id: NodeId, patch: StyleProps, bp: Breakpoint = breakpoint) => {
      commit(
        (doc) => updateStyleOp(doc, id, patch, bp),
        `style:${id}:${bp}:${Object.keys(patch).join(",")}`,
      );
    },
    [commit, breakpoint],
  );

  const updateNode = useCallback(
    (id: NodeId, patch: Partial<Omit<SiteNode, "id" | "children" | "parent">>) => {
      commit((doc) => updateNodeOp(doc, id, patch), `node:${id}:${Object.keys(patch).join(",")}`);
    },
    [commit],
  );

  const remove = useCallback(
    (id: NodeId) => {
      commit((doc) => removeNodeOp(doc, id));
      setSelection((current) => {
        if (!current.includes(id)) return current;
        const rest = current.filter((x) => x !== id);
        if (rest.length > 0) return rest;
        // Nothing else was selected — focus the parent so the inspector
        // stays useful rather than going blank.
        const parent = document.nodes[id]?.parent;
        return parent ? [parent] : [];
      });
    },
    [commit, document],
  );

  /** Delete every selected node in one undo step. */
  const removeSelected = useCallback(() => {
    const ids = selection.filter((id) => id !== document.root && !document.nodes[id]?.locked);
    if (ids.length === 0) return;
    commit((doc) => {
      let next = doc;
      for (const id of ids) {
        if (next.nodes[id]) next = removeNodeOp(next, id);
      }
      return next;
    });
    setSelection([]);
  }, [commit, selection, document]);

  const duplicate = useCallback(
    (id: NodeId) => {
      let newId: NodeId | null = null;
      commit((doc) => {
        const node = doc.nodes[id];
        const next = duplicateNodeOp(doc, id);
        if (next !== doc && node?.parent && next.nodes[node.parent]) {
          const siblings = next.nodes[node.parent].children;
          newId = siblings[siblings.indexOf(id) + 1] ?? null;
        }
        return next;
      });
      if (newId) setSelection([newId]);
    },
    [commit],
  );

  /** Duplicate every selected node in one undo step, then select the copies. */
  const duplicateSelected = useCallback(() => {
    const ids = selection.filter((id) => id !== document.root);
    if (ids.length === 0) return;
    const newIds: NodeId[] = [];
    commit((doc) => {
      let next = doc;
      for (const id of ids) {
        const node = next.nodes[id];
        if (!node) continue;
        const before = next;
        next = duplicateNodeOp(next, id);
        if (next !== before && node.parent && next.nodes[node.parent]) {
          const siblings = next.nodes[node.parent].children;
          const copyId = siblings[siblings.indexOf(id) + 1];
          if (copyId) newIds.push(copyId);
        }
      }
      return next;
    });
    if (newIds.length > 0) setSelection(newIds);
  }, [commit, selection, document.root]);

  const move = useCallback(
    (id: NodeId, parentId: NodeId, index: number) => {
      commit((doc) => {
        const node = doc.nodes[id];
        const parent = doc.nodes[parentId];
        // Enforce registry drop rules here as well as in the drag UI, so a
        // keyboard move or a programmatic call cannot bypass them.
        if (!node || !parent || !canDrop(parent.type, node.type)) return doc;
        return moveNodeOp(doc, id, parentId, index);
      });
    },
    [commit],
  );

  const nudge = useCallback(
    (id: NodeId, direction: "up" | "down") => {
      commit((doc) => reorderSibling(doc, id, direction));
    },
    [commit],
  );

  const toggle = useCallback(
    (id: NodeId, flag: "locked" | "hidden" | "collapsed") => {
      commit((doc) => toggleFlagOp(doc, id, flag));
    },
    [commit],
  );

  const group = useCallback(
    (ids: NodeId[]) => {
      commit((doc) => groupNodesOp(doc, ids));
    },
    [commit],
  );

  const ungroup = useCallback(
    (id: NodeId) => {
      commit((doc) => ungroupNodeOp(doc, id));
    },
    [commit],
  );

  /** Insert a component from the palette. */
  const addComponent = useCallback(
    (type: string, parentId?: NodeId, index = -1) => {
      const definition = getDefinition(type);
      if (!definition) return;

      let insertedId: NodeId | null = null;
      commit((doc) => {
        // Default target: inside the selection if it accepts this type, else
        // walk up to the nearest ancestor that does, else the page root.
        const target = resolveDropTarget(doc, parentId ?? selectedId, type);
        if (!target) return doc;

        const node = createNode(type, {
          props: { ...definition.defaultProps },
          name: definition.label,
        });
        const next = insertNodeOp(doc, target, node, index);
        const children = next.nodes[target]?.children ?? [];
        insertedId =
          index < 0 || index >= children.length ? children[children.length - 1] : children[index];
        return next;
      });
      // Select what was just added so the user can style it immediately.
      if (insertedId) setSelection([insertedId]);
    },
    [commit, selectedId],
  );

  /** Insert a section preset at the page level. */
  const addSection = useCallback(
    (presetKey: string, index = -1) => {
      let insertedId: NodeId | null = null;
      commit((doc) => {
        const subtree = buildSection(presetKey, presetInput);
        if (!subtree) return doc;
        const next = insertSubtree(doc, doc.root, subtree.nodes, subtree.rootId, index);
        const children = next.nodes[next.root].children;
        insertedId =
          index < 0 || index >= children.length ? children[children.length - 1] : children[index];
        return next;
      });
      if (insertedId) setSelection([insertedId]);
    },
    [commit, presetInput],
  );

  // -------------------------------------------------------------------
  // Clipboard
  // -------------------------------------------------------------------

  /** Copy the current selection (or an explicit id list) to the clipboard. */
  const copySelection = useCallback(
    (ids: NodeId[] = selection): boolean => {
      const targets = topLevelOnly(document, ids.filter((id) => id !== document.root));
      if (targets.length === 0) return false;
      const subtrees = targets
        .map((id) => extractSubtree(document, id))
        .filter((s): s is ClipboardSubtree => s !== null);
      if (subtrees.length === 0) return false;
      writeClipboard({ subtrees });
      return true;
    },
    [document, selection],
  );

  /**
   * Paste the clipboard's subtrees, one undo step for the whole operation.
   *
   * Each subtree finds its own drop target independently (via the same
   * `resolveDropTarget` walk `addComponent` uses), so pasting a mixed
   * selection — say a Button alongside a Grid — lands each where it is
   * actually allowed rather than forcing one shared target.
   */
  const paste = useCallback((): boolean => {
    const clipboard = readClipboard();
    if (!clipboard || clipboard.subtrees.length === 0) return false;

    const newRootIds: NodeId[] = [];
    commit((doc) => {
      let next = doc;
      for (const subtree of clipboard.subtrees) {
        const rootType = subtree.nodes[subtree.rootId]?.type;
        if (!rootType) continue;
        const target = resolveDropTarget(next, selectedId, rootType);
        if (!target) continue;
        next = insertSubtree(next, target, subtree.nodes, subtree.rootId, -1);
        const children = next.nodes[target].children;
        newRootIds.push(children[children.length - 1]);
      }
      return next;
    });

    if (newRootIds.length > 0) setSelection(newRootIds);
    return newRootIds.length > 0;
  }, [commit, selectedId]);

  const hasClipboard = useCallback((): boolean => {
    const clipboard = readClipboard();
    return Boolean(clipboard && clipboard.subtrees.length > 0);
  }, []);

  /** Copy then remove — used by the context menu's Cut action. */
  const cutSelection = useCallback((): boolean => {
    const copied = copySelection();
    if (copied) removeSelected();
    return copied;
  }, [copySelection, removeSelected]);

  // -------------------------------------------------------------------
  // Document replacement
  // -------------------------------------------------------------------

  /** Replace the whole document, e.g. after an AI edit or a rollback. */
  const replaceDocument = useCallback(
    (next: SiteDocument, options: { markDirty?: boolean; newVersion?: string } = {}) => {
      setDocument((current) => {
        past.current.push({ document: current, tag: null, at: Date.now() });
        future.current = [];
        return next;
      });
      if (options.newVersion) version.current = options.newVersion;
      // AI edits are persisted server-side, so the local copy is already clean.
      dirty.current = options.markDirty ?? false;
      setSaveState(options.markDirty ? "dirty" : "saved");
      setHistoryVersion((v) => v + 1);
      setSelection([]);
    },
    [],
  );

  /** Reload after a conflict, discarding local changes. */
  const resetTo = useCallback((next: SiteDocument, newVersion: string) => {
    past.current = [];
    future.current = [];
    version.current = newVersion;
    dirty.current = false;
    setDocument(next);
    setSaveState("idle");
    setSaveError(null);
    setSelection([]);
    setHistoryVersion((v) => v + 1);
  }, []);

  // -------------------------------------------------------------------
  // Derived
  // -------------------------------------------------------------------

  const selectedNode = selectedId ? (document.nodes[selectedId] ?? null) : null;

  /** Breadcrumb path, so the user can escape a deep selection. */
  const breadcrumb = useMemo(
    () =>
      selectedId
        ? getAncestors(document, selectedId).map((n) => ({
            id: n.id,
            label: n.name ?? getDefinition(n.type)?.label ?? n.type,
          }))
        : [],
    [document, selectedId],
  );

  // Recomputed on historyVersion because the refs themselves are not reactive.
  const canUndo = past.current.length > 0;
  const canRedo = future.current.length > 0;
  void historyVersion;

  // -------------------------------------------------------------------
  // Keyboard shortcuts
  // -------------------------------------------------------------------

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Never hijack keys while the user is typing in a form control or an
      // inline-editable element on the canvas.
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      ) {
        return;
      }

      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save(false);
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        if (selection.length === 0) return;
        e.preventDefault();
        copySelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "x") {
        if (selection.length === 0) return;
        e.preventDefault();
        cutSelection();
        return;
      }
      if (mod && e.key.toLowerCase() === "v") {
        e.preventDefault();
        paste();
        return;
      }
      if (!selectedId) return;

      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selection.length > 1) duplicateSelected();
        else duplicate(selectedId);
        return;
      }
      if (mod && e.key.toLowerCase() === "g") {
        e.preventDefault();
        if (e.shiftKey) ungroup(selectedId);
        else if (selection.length > 1) group(selection);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (selection.length > 1) removeSelected();
        else if (!document.nodes[selectedId]?.locked) remove(selectedId);
        return;
      }
      if (e.key === "Escape") {
        if (selection.length > 1) {
          // Collapse a multi-selection to just the primary before stepping up
          // a level, matching how most design tools treat Escape.
          setSelection([selectedId]);
        } else {
          setSelection(document.nodes[selectedId]?.parent ? [document.nodes[selectedId]!.parent!] : []);
        }
        return;
      }
      if (e.altKey && e.key === "ArrowUp") {
        e.preventDefault();
        nudge(selectedId, "up");
      }
      if (e.altKey && e.key === "ArrowDown") {
        e.preventDefault();
        nudge(selectedId, "down");
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    selectedId,
    selection,
    document,
    undo,
    redo,
    save,
    duplicate,
    duplicateSelected,
    remove,
    removeSelected,
    nudge,
    ungroup,
    group,
    copySelection,
    cutSelection,
    paste,
  ]);

  return {
    // state
    document,
    selectedId,
    selectedIds,
    selectedNode,
    hoveredId,
    breakpoint,
    breadcrumb,
    canUndo,
    canRedo,
    saveState,
    saveError,
    version: version.current,
    // selection
    select,
    toggleSelect,
    clearSelection,
    hover: setHoveredId,
    setBreakpoint,
    // mutations
    updateProps,
    updateStyle,
    updateNode,
    remove,
    removeSelected,
    duplicate,
    duplicateSelected,
    move,
    nudge,
    toggle,
    group,
    ungroup,
    addComponent,
    addSection,
    replaceDocument,
    resetTo,
    // clipboard
    copySelection,
    cutSelection,
    paste,
    hasClipboard,
    // history + persistence
    undo,
    redo,
    save,
  };
}

/**
 * Find a legal parent for a new node.
 *
 * Walks up from the preferred target until a container accepts the type. This
 * is what makes "click a component in the palette" (and paste) work
 * regardless of what happens to be selected — without it, adding a Heading
 * while a Heading is selected would silently do nothing.
 */
function resolveDropTarget(
  doc: SiteDocument,
  preferred: NodeId | null,
  childType: string,
): NodeId | null {
  let candidate = preferred ? doc.nodes[preferred] : undefined;
  let guard = 50;

  while (candidate && guard-- > 0) {
    if (canDrop(candidate.type, childType)) return candidate.id;
    candidate = candidate.parent ? doc.nodes[candidate.parent] : undefined;
  }
  return canDrop(doc.nodes[doc.root].type, childType) ? doc.root : null;
}
