// ScreenReaderListView — Wave A18-T28
//
// CONTRACT (C06 §3): When the 3D canvas is hidden (screen-reader mode,
// reduced-motion, or explicit toggle), a text-only list view of the
// spatial tree MUST be available.
//
// This component:
//   1. Renders a <ul> / <li> tree of all scene elements alongside the canvas.
//   2. Is hidden visually by default (aria-hidden on this element = false,
//      aria-hidden on canvas = true when active).
//   3. Supports full keyboard navigation (arrow keys, Enter to select).
//   4. Announces selection changes via the AriaLiveRegion.
//
// Usage:
//   const listView = new ScreenReaderListView(container, spatialTreeData);
//   listView.mount();       // creates DOM
//   listView.show();        // hides canvas, shows list
//   listView.hide();        // shows canvas, hides list
//   listView.dispose();     // removes DOM

import { statusRegion } from './AriaLiveRegion.js';
import { trace } from '@opentelemetry/api';
import { relationshipArrayOrUnknown } from '../relationshipDetermination.js';

const tracer = trace.getTracer('pryzm.ui.screen-reader-list-view');

export interface SpatialNode {
  id: string;
  label: string;
  type: string;
  level: number;
  /**
   * The node's child elements. C75 §1.4 / C78 §1.4 — two DIFFERENT facts:
   * - `[]` (present, empty) — a DETERMINED leaf: this node was examined and
   *   contains nothing.
   * - absent — the containment relationship was NEVER RECORDED for this node
   *   (C78 §8.1 `RELATIONSHIP_NOT_RECORDED`). The tree below it is unknown,
   *   and {@link countSpatialNodes} reports the total as "at least", never as
   *   an exact figure a screen-reader user would be entitled to trust.
   */
  children?: SpatialNode[];
}

/** The element count of a spatial tree, with its determination status carried
 *  in the value rather than silently collapsed (C75 §1.4). */
export interface SpatialTreeCount {
  /** Elements actually counted. A lower bound when `exact` is false. */
  readonly total: number;
  /** True iff every node's child list was recorded (possibly empty). */
  readonly exact: boolean;
  /** Nodes whose `children` field was never recorded — the subtree below each
   *  is UNKNOWN, not empty. Named so the refusal is auditable (C70 §5.5). */
  readonly unrecordedChildrenNodeIds: readonly string[];
}

/**
 * Count the nodes of a spatial tree HONESTLY. The old implementation read
 * `n.children ?? []`, which asserted "this node has zero children" about every
 * node whose child list was never recorded — the heading then announced an
 * exact element count nobody had measured, to the one audience (screen-reader
 * users) that cannot cross-check it against the canvas. A node with an absent
 * child list now contributes itself, marks the count inexact, and is named.
 */
export function countSpatialNodes(nodes: readonly SpatialNode[]): SpatialTreeCount {
  let total = 0;
  const unrecorded: string[] = [];
  const walk = (list: readonly SpatialNode[]): void => {
    for (const n of list) {
      total += 1;
      const children = relationshipArrayOrUnknown<SpatialNode>(n.children);
      if (children === null) {
        unrecorded.push(n.id);
        continue; // subtree UNKNOWN — never counted as zero
      }
      walk(children);
    }
  };
  walk(nodes);
  return { total, exact: unrecorded.length === 0, unrecordedChildrenNodeIds: unrecorded };
}

export interface ScreenReaderListViewOptions {
  /** Selector or element of the THREE.js canvas to toggle aria-hidden on. */
  canvas?: HTMLElement | string;
  /** Called when the user selects an element from the list view. */
  onSelect?: (nodeId: string) => void;
}

export class ScreenReaderListView {
  private readonly _container: HTMLElement;
  private _root: HTMLElement | null = null;
  private _nodes: SpatialNode[] = [];
  private _visible = false;
  private readonly _opts: ScreenReaderListViewOptions;

  constructor(container: HTMLElement, nodes: SpatialNode[] = [], opts: ScreenReaderListViewOptions = {}) {
    this._container = container;
    this._nodes = nodes;
    this._opts = opts;
  }

  setNodes(nodes: SpatialNode[]): void {
    this._nodes = nodes;
    if (this._visible && this._root) this._render();
  }

  mount(): void {
    if (this._root) return;
    this._root = document.createElement('div');
    this._root.id = 'pryzm-sr-list-view';
    this._root.setAttribute('role', 'region');
    this._root.setAttribute('aria-label', 'Spatial tree — screen reader list view');
    this._root.setAttribute('aria-hidden', 'true');
    this._root.style.cssText = 'display:none;overflow:auto;max-height:100vh;padding:8px 12px;';
    this._container.appendChild(this._root);
  }

  show(): void {
    const span = tracer.startSpan('pryzm.ui.screen-reader-list-view.show');
    try {
      if (!this._root) this.mount();
      this._visible = true;
      this._root!.setAttribute('aria-hidden', 'false');
      this._root!.style.display = 'block';
      this._render();

      const canvas = this._resolveCanvas();
      if (canvas) {
        canvas.setAttribute('aria-hidden', 'true');
        canvas.setAttribute('tabindex', '-1');
      }

      statusRegion().announce('Screen reader list view activated — 3D canvas hidden');
    } finally {
      span.end();
    }
  }

  hide(): void {
    if (!this._root) return;
    this._visible = false;
    this._root.setAttribute('aria-hidden', 'true');
    this._root.style.display = 'none';

    const canvas = this._resolveCanvas();
    if (canvas) {
      canvas.removeAttribute('aria-hidden');
      canvas.setAttribute('tabindex', '0');
    }

    statusRegion().announce('3D viewport restored');
  }

  toggle(): void {
    this._visible ? this.hide() : this.show();
  }

  dispose(): void {
    this._root?.remove();
    this._root = null;
  }

  private _render(): void {
    if (!this._root) return;
    this._root.innerHTML = '';

    const heading = document.createElement('h2');
    // C75 §1.4 — an inexact count SAYS SO. "at least N" when any node's child
    // list was never recorded; a screen-reader user must not be told an exact
    // element count nobody measured.
    const count = countSpatialNodes(this._nodes);
    heading.textContent = count.exact
      ? `Spatial tree (${count.total} elements)`
      : `Spatial tree (at least ${count.total} elements — the children of ` +
        `${count.unrecordedChildrenNodeIds.length} element(s) were never recorded)`;
    heading.style.cssText = 'font-size:1rem;margin:0 0 8px;';
    this._root.appendChild(heading);

    const list = this._buildList(this._nodes, 0);
    this._root.appendChild(list);
  }

  private _buildList(nodes: readonly SpatialNode[], depth: number): HTMLUListElement {
    const ul = document.createElement('ul');
    ul.setAttribute('role', 'tree');
    ul.style.cssText = 'list-style:none;margin:0;padding-left:' + (depth * 16) + 'px;';

    for (const node of nodes) {
      const li = document.createElement('li');
      li.setAttribute('role', 'treeitem');
      li.setAttribute('aria-level', String(node.level + 1));
      li.setAttribute('tabindex', '0');
      li.setAttribute('data-node-id', node.id);
      li.setAttribute('data-element-type', node.type);
      li.setAttribute('data-element-id', node.id);
      li.textContent = `${node.type}: ${node.label}`;
      li.style.cssText = 'padding:2px 4px;cursor:pointer;border-radius:3px;';

      li.addEventListener('click', () => this._select(node));
      li.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this._select(node);
        }
      });

      const children = relationshipArrayOrUnknown<SpatialNode>(node.children);
      if (children === null) {
        // C78 §8.1 RELATIONSHIP_NOT_RECORDED — the child list was never
        // written. Unknown is not a leaf: say so where a screen reader will
        // read it, rather than silently presenting the node as childless.
        li.title = 'Children of this element were never recorded — contents unknown, not empty.';
      } else if (children.length > 0) {
        li.setAttribute('aria-expanded', 'true');
        li.appendChild(this._buildList(children, depth + 1));
      }

      ul.appendChild(li);
    }

    return ul;
  }

  private _select(node: SpatialNode): void {
    statusRegion().announce(`Selected: ${node.type} — ${node.label}`);
    this._opts.onSelect?.(node.id);
  }

  private _resolveCanvas(): HTMLElement | null {
    const ref = this._opts.canvas;
    if (!ref) return null;
    if (typeof ref === 'string') return document.querySelector(ref);
    return ref;
  }
}
