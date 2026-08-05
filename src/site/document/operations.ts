/**
 * Pure node-tree operations.
 *
 * Every mutation to a SiteDocument — a drag on the canvas, a keystroke in
 * the inspector, an AI edit, a template application — goes through these
 * functions. Nothing else is allowed to touch `document.nodes` directly.
 *
 * That single rule buys a lot:
 *   - Drag & drop and AI editing cannot drift apart, because "move this
 *     section above that one" is literally the same call.
 *   - Every mutation returns a NEW document, so undo/redo is a stack of
 *     references and React sees a changed identity.
 *   - Invariants (no cycles, no orphans, parent/children agreement) are
 *     enforced in one place instead of re-checked at every call site.
 *
 * These functions are isomorphic: the editor imports them in the browser,
 * the AI service imports them on the server.
 */

import {
  BREAKPOINTS,
  DOCUMENT_VERSION,
  type Breakpoint,
  type NodeId,
  type NodeProps,
  type SiteDocument,
  type SiteNode,
  type StyleProps,
} from "./types";

// =====================================================================
// Id generation
// =====================================================================

/**
 * Short, collision-resistant, URL-safe node id.
 *
 * Not cuid: node ids are embedded in the document thousands of times and
 * only need to be unique within one page. 8 chars over a 36-char alphabet
 * is ~2.8e12 combinations, and `createNodeId` re-rolls against the
 * document when one is supplied, so collisions are ruled out rather than
 * merely improbable.
 */
export function createNodeId(document?: SiteDocument): NodeId {
  const gen = () => {
    let out = "";
    for (let i = 0; i < 8; i++) {
      out += "abcdefghijklmnopqrstuvwxyz0123456789"[
        Math.floor(Math.random() * 36)
      ];
    }
    return out;
  };
  let id = gen();
  if (document) {
    while (document.nodes[id]) id = gen();
  }
  return id;
}

// =====================================================================
// Construction
// =====================================================================

export function createNode(
  type: string,
  init: Partial<Omit<SiteNode, "id" | "type">> = {},
  id?: NodeId,
): SiteNode {
  return {
    id: id ?? createNodeId(),
    type,
    props: init.props ?? {},
    children: init.children ?? [],
    parent: init.parent ?? null,
    ...(init.name ? { name: init.name } : {}),
    ...(init.style ? { style: init.style } : {}),
    ...(init.responsive ? { responsive: init.responsive } : {}),
    ...(init.hover ? { hover: init.hover } : {}),
    ...(init.animation ? { animation: init.animation } : {}),
    ...(init.action ? { action: init.action } : {}),
    ...(init.bindings ? { bindings: init.bindings } : {}),
    ...(init.locked ? { locked: init.locked } : {}),
    ...(init.hidden ? { hidden: init.hidden } : {}),
    ...(init.hiddenOn ? { hiddenOn: init.hiddenOn } : {}),
    ...(init.presetKey ? { presetKey: init.presetKey } : {}),
    ...(init.a11y ? { a11y: init.a11y } : {}),
  };
}

/** A valid, empty document containing only a Page root. */
export function createEmptyDocument(): SiteDocument {
  const rootId = createNodeId();
  return {
    version: DOCUMENT_VERSION,
    root: rootId,
    nodes: {
      [rootId]: createNode("Page", { name: "Page" }, rootId),
    },
  };
}

// =====================================================================
// Reads
// =====================================================================

export function getNode(doc: SiteDocument, id: NodeId): SiteNode | undefined {
  return doc.nodes[id];
}

/** Throws rather than returning undefined — use when absence is a bug. */
export function requireNode(doc: SiteDocument, id: NodeId): SiteNode {
  const node = doc.nodes[id];
  if (!node) throw new Error(`Node not found: ${id}`);
  return node;
}

/** Root to node, inclusive. Empty array if `id` is unreachable. */
export function getAncestors(doc: SiteDocument, id: NodeId): SiteNode[] {
  const chain: SiteNode[] = [];
  let current: SiteNode | undefined = doc.nodes[id];
  // Bounded by node count so a corrupt cycle cannot hang the editor.
  let guard = Object.keys(doc.nodes).length + 1;
  while (current && guard-- > 0) {
    chain.unshift(current);
    current = current.parent ? doc.nodes[current.parent] : undefined;
  }
  return chain;
}

/** All descendants of `id`, depth-first, excluding `id` itself. */
export function getDescendants(doc: SiteDocument, id: NodeId): SiteNode[] {
  const out: SiteNode[] = [];
  const stack = [...(doc.nodes[id]?.children ?? [])];
  while (stack.length) {
    const nextId = stack.shift()!;
    const node = doc.nodes[nextId];
    if (!node) continue;
    out.push(node);
    stack.unshift(...node.children);
  }
  return out;
}

/**
 * True when `maybeAncestor` is at or above `id`. This is the guard that
 * makes drag & drop safe: dropping a node into its own subtree would
 * detach that subtree from the root and corrupt the document.
 */
export function isAncestorOf(
  doc: SiteDocument,
  maybeAncestor: NodeId,
  id: NodeId,
): boolean {
  if (maybeAncestor === id) return true;
  let current: SiteNode | undefined = doc.nodes[id];
  let guard = Object.keys(doc.nodes).length + 1;
  while (current?.parent && guard-- > 0) {
    if (current.parent === maybeAncestor) return true;
    current = doc.nodes[current.parent];
  }
  return false;
}

export function findNodesByType(doc: SiteDocument, type: string): SiteNode[] {
  return Object.values(doc.nodes).filter((n) => n.type === type);
}

export function findNodesByPreset(
  doc: SiteDocument,
  presetKey: string,
): SiteNode[] {
  return Object.values(doc.nodes).filter((n) => n.presetKey === presetKey);
}

/** Direct children of the root, i.e. the page's top-level sections. */
export function getSections(doc: SiteDocument): SiteNode[] {
  return (doc.nodes[doc.root]?.children ?? [])
    .map((id) => doc.nodes[id])
    .filter((n): n is SiteNode => Boolean(n));
}

// =====================================================================
// Internal helpers
// =====================================================================

/**
 * Shallow-clone the document and the nodes map. Individual nodes are
 * still shared by reference, so callers MUST replace (never mutate) any
 * node they change. Every mutator below does exactly that.
 */
function draft(doc: SiteDocument): SiteDocument {
  return { ...doc, nodes: { ...doc.nodes } };
}

function detachFromParent(next: SiteDocument, node: SiteNode): void {
  if (!node.parent) return;
  const parent = next.nodes[node.parent];
  if (!parent) return;
  next.nodes[parent.id] = {
    ...parent,
    children: parent.children.filter((c) => c !== node.id),
  };
}

// =====================================================================
// Structural mutations
// =====================================================================

/**
 * Rewrite every id in a subtree to a fresh one, preserving structure.
 * Also rewrites intra-subtree references (`scroll`, `openModal` actions)
 * so a duplicated section points at its own copies rather than the
 * original's.
 */
export function remapIds(
  nodes: Record<NodeId, SiteNode>,
  rootId: NodeId,
  against?: SiteDocument,
): { nodes: Record<NodeId, SiteNode>; rootId: NodeId } {
  const map = new Map<NodeId, NodeId>();
  for (const id of Object.keys(nodes)) {
    map.set(id, createNodeId(against));
  }

  const out: Record<NodeId, SiteNode> = {};
  for (const [oldId, node] of Object.entries(nodes)) {
    const newId = map.get(oldId)!;
    let action = node.action;
    if (
      action &&
      (action.kind === "scroll" || action.kind === "openModal") &&
      map.has(action.nodeId)
    ) {
      action = { ...action, nodeId: map.get(action.nodeId)! };
    }
    out[newId] = {
      ...node,
      id: newId,
      children: node.children.map((c) => map.get(c) ?? c),
      parent: node.parent ? (map.get(node.parent) ?? null) : null,
      ...(action ? { action } : {}),
    };
  }
  return { nodes: out, rootId: map.get(rootId)! };
}

/**
 * Insert an already-built subtree. `subtree` may contain many nodes; the
 * one identified by `subtreeRootId` becomes a child of `parentId`.
 * `index` of -1 (or omitted) appends.
 */
export function insertSubtree(
  doc: SiteDocument,
  parentId: NodeId,
  subtree: Record<NodeId, SiteNode>,
  subtreeRootId: NodeId,
  index = -1,
): SiteDocument {
  const parent = requireNode(doc, parentId);
  const next = draft(doc);

  // Re-id on insert so the same preset can be added twice without the
  // second copy clobbering the first.
  const remapped = remapIds(subtree, subtreeRootId, next);

  for (const node of Object.values(remapped.nodes)) {
    next.nodes[node.id] = node;
  }
  next.nodes[remapped.rootId] = {
    ...next.nodes[remapped.rootId],
    parent: parentId,
  };

  const children = [...parent.children];
  const at = index < 0 || index > children.length ? children.length : index;
  children.splice(at, 0, remapped.rootId);
  next.nodes[parentId] = { ...parent, children };

  return next;
}

/** Insert a single new node (no children) under `parentId`. */
export function insertNode(
  doc: SiteDocument,
  parentId: NodeId,
  node: SiteNode,
  index = -1,
): SiteDocument {
  return insertSubtree(doc, parentId, { [node.id]: node }, node.id, index);
}

/** Remove a node and its entire subtree. The root cannot be removed. */
export function removeNode(doc: SiteDocument, id: NodeId): SiteDocument {
  if (id === doc.root) return doc;
  const node = doc.nodes[id];
  if (!node) return doc;

  const next = draft(doc);
  detachFromParent(next, node);

  for (const descendant of getDescendants(doc, id)) {
    delete next.nodes[descendant.id];
  }
  delete next.nodes[id];

  return next;
}

/**
 * Reparent / reorder. Refuses moves that would create a cycle, which is
 * the one way drag & drop can corrupt a document.
 */
export function moveNode(
  doc: SiteDocument,
  id: NodeId,
  newParentId: NodeId,
  index = -1,
): SiteDocument {
  if (id === doc.root) return doc;
  const node = doc.nodes[id];
  const newParent = doc.nodes[newParentId];
  if (!node || !newParent) return doc;

  // Dropping a node inside itself would orphan the subtree.
  if (isAncestorOf(doc, id, newParentId)) return doc;

  const next = draft(doc);
  const sameParent = node.parent === newParentId;
  const oldIndex = sameParent ? newParent.children.indexOf(id) : -1;

  detachFromParent(next, node);

  const parentNow = next.nodes[newParentId];
  const children = [...parentNow.children];

  // Reordering within the same parent: detaching first shifts every later
  // index down by one, so a raw target index lands one slot early when
  // moving downward. Compensate.
  let at = index < 0 || index > children.length ? children.length : index;
  if (sameParent && oldIndex > -1 && index > oldIndex) at -= 1;
  if (at < 0) at = 0;
  if (at > children.length) at = children.length;

  children.splice(at, 0, id);
  next.nodes[newParentId] = { ...parentNow, children };
  next.nodes[id] = { ...next.nodes[id], parent: newParentId };

  return next;
}

/** Move a node up or down among its siblings. */
export function reorderSibling(
  doc: SiteDocument,
  id: NodeId,
  direction: "up" | "down",
): SiteDocument {
  const node = doc.nodes[id];
  if (!node?.parent) return doc;
  const siblings = doc.nodes[node.parent]?.children ?? [];
  const i = siblings.indexOf(id);
  if (i < 0) return doc;
  const target = direction === "up" ? i - 1 : i + 1;
  if (target < 0 || target >= siblings.length) return doc;
  return moveNode(doc, id, node.parent, target);
}

/** Deep-copy a node, inserting the copy directly after the original. */
export function duplicateNode(doc: SiteDocument, id: NodeId): SiteDocument {
  if (id === doc.root) return doc;
  const node = doc.nodes[id];
  if (!node?.parent) return doc;

  const subtree: Record<NodeId, SiteNode> = { [id]: node };
  for (const d of getDescendants(doc, id)) subtree[d.id] = d;

  const siblings = doc.nodes[node.parent].children;
  return insertSubtree(doc, node.parent, subtree, id, siblings.indexOf(id) + 1);
}

/**
 * Wrap nodes in a new container. All targets must share a parent —
 * grouping across parents has no unambiguous meaning.
 */
export function groupNodes(
  doc: SiteDocument,
  ids: NodeId[],
  containerType = "Box",
): SiteDocument {
  if (ids.length < 2) return doc;
  const nodes = ids.map((id) => doc.nodes[id]).filter(Boolean);
  if (nodes.length !== ids.length) return doc;

  const parentId = nodes[0].parent;
  if (!parentId || nodes.some((n) => n.parent !== parentId)) return doc;

  const parent = doc.nodes[parentId];
  // Preserve document order, not selection order.
  const ordered = parent.children.filter((c) => ids.includes(c));
  const insertAt = parent.children.indexOf(ordered[0]);

  const container = createNode(containerType, {
    name: "Group",
    style: { display: "flex", flexDirection: "column", gap: "md" },
  });

  let next = insertNode(doc, parentId, container, insertAt);
  // insertNode re-ids on insert, so read back the id it actually used.
  const containerId = next.nodes[parentId].children[insertAt];

  for (const [i, childId] of ordered.entries()) {
    next = moveNode(next, childId, containerId, i);
  }
  return next;
}

/** Replace a container with its children, preserving order and position. */
export function ungroupNode(doc: SiteDocument, id: NodeId): SiteDocument {
  const node = doc.nodes[id];
  if (!node?.parent || node.children.length === 0) return doc;

  const parentId = node.parent;
  const insertAt = doc.nodes[parentId].children.indexOf(id);

  let next = doc;
  for (const [i, childId] of [...node.children].entries()) {
    next = moveNode(next, childId, parentId, insertAt + i);
  }
  return removeNode(next, id);
}

// =====================================================================
// Property mutations
// =====================================================================

/** Shallow-merge props. Pass `undefined` as a value to clear a key. */
export function updateProps(
  doc: SiteDocument,
  id: NodeId,
  props: NodeProps,
): SiteDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  const merged: NodeProps = { ...node.props, ...props };
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined) delete merged[k];
  }
  const next = draft(doc);
  next.nodes[id] = { ...node, props: merged };
  return next;
}

/**
 * Merge a style patch at a breakpoint. `base` writes `style`; `tablet`
 * and `mobile` write into `responsive`, which is what stops device
 * specific edits from leaking upward into desktop.
 */
export function updateStyle(
  doc: SiteDocument,
  id: NodeId,
  patch: StyleProps,
  breakpoint: Breakpoint = "base",
): SiteDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  const next = draft(doc);

  const merge = (target: StyleProps): StyleProps => {
    const merged: StyleProps = { ...target, ...patch };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete merged[k as keyof StyleProps];
    }
    return merged;
  };

  if (breakpoint === "base") {
    next.nodes[id] = { ...node, style: merge(node.style ?? {}) };
  } else {
    next.nodes[id] = {
      ...node,
      responsive: {
        ...node.responsive,
        [breakpoint]: merge(node.responsive?.[breakpoint] ?? {}),
      },
    };
  }
  return next;
}

/** Patch top-level node fields (name, locked, hidden, animation, action). */
export function updateNode(
  doc: SiteDocument,
  id: NodeId,
  patch: Partial<Omit<SiteNode, "id" | "children" | "parent">>,
): SiteDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  const next = draft(doc);
  next.nodes[id] = { ...node, ...patch, id: node.id };
  return next;
}

export function toggleFlag(
  doc: SiteDocument,
  id: NodeId,
  flag: "locked" | "hidden" | "collapsed",
): SiteDocument {
  const node = doc.nodes[id];
  if (!node) return doc;
  const next = draft(doc);
  next.nodes[id] = { ...node, [flag]: !node[flag] };
  return next;
}

// =====================================================================
// Style resolution
// =====================================================================

/**
 * Flatten `style` plus responsive overrides for a breakpoint.
 *
 * Desktop-first cascade: base then tablet then mobile. Mobile inherits
 * tablet's overrides, matching how the emitted CSS media queries stack,
 * so the editor preview and the published page agree.
 */
export function resolveStyle(
  node: SiteNode,
  breakpoint: Breakpoint,
): StyleProps {
  let out: StyleProps = { ...(node.style ?? {}) };
  for (const bp of BREAKPOINTS) {
    if (bp === "base") continue;
    out = { ...out, ...(node.responsive?.[bp] ?? {}) };
    if (bp === breakpoint) break;
  }
  return out;
}

export function isVisibleAt(node: SiteNode, breakpoint: Breakpoint): boolean {
  if (node.hidden) return false;
  if (breakpoint === "base") return true;
  return !node.hiddenOn?.includes(breakpoint);
}

// =====================================================================
// Integrity
// =====================================================================

/**
 * Repair a document loaded from an untrusted source: an old revision, AI
 * output, or an imported template.
 *
 * Fixes, in order:
 *   1. missing/invalid root -> rebuild an empty document
 *   2. children referencing missing nodes -> pruned
 *   3. parent back-pointers -> recomputed from `children` (authoritative)
 *   4. duplicate child entries -> de-duplicated
 *   5. orphans unreachable from root -> dropped
 *
 * Called on every read from the DB and after every AI edit. Cheap next to
 * rendering, and it means a corrupt document degrades to a partial page
 * instead of a crashed editor.
 */
export function normalizeDocument(input: SiteDocument): SiteDocument {
  if (!input?.nodes || !input.root || !input.nodes[input.root]) {
    return createEmptyDocument();
  }

  const nodes: Record<NodeId, SiteNode> = {};
  for (const [id, node] of Object.entries(input.nodes)) {
    if (!node || typeof node.type !== "string") continue;
    nodes[id] = {
      ...node,
      id,
      props: node.props ?? {},
      children: Array.isArray(node.children) ? node.children : [],
      parent: node.parent ?? null,
    };
  }
  if (!nodes[input.root]) return createEmptyDocument();

  // Prune dangling and duplicate child references, then rebuild parents
  // from children so the two can never disagree.
  for (const node of Object.values(nodes)) {
    const seen = new Set<NodeId>();
    node.children = node.children.filter((c) => {
      if (c === node.id || !nodes[c] || seen.has(c)) return false;
      seen.add(c);
      return true;
    });
  }
  for (const node of Object.values(nodes)) {
    node.parent = null;
  }
  for (const node of Object.values(nodes)) {
    for (const childId of node.children) {
      nodes[childId].parent = node.id;
    }
  }
  nodes[input.root].parent = null;

  // Keep only what the root can reach.
  const reachable = new Set<NodeId>([input.root]);
  const stack = [input.root];
  while (stack.length) {
    const id = stack.pop()!;
    for (const childId of nodes[id].children) {
      if (!reachable.has(childId)) {
        reachable.add(childId);
        stack.push(childId);
      }
    }
  }

  const pruned: Record<NodeId, SiteNode> = {};
  for (const id of reachable) pruned[id] = nodes[id];

  return {
    version: input.version ?? DOCUMENT_VERSION,
    root: input.root,
    nodes: pruned,
  };
}

export function countNodes(doc: SiteDocument): number {
  return Object.keys(doc.nodes).length;
}
