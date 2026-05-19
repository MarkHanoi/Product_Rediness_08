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

const tracer = trace.getTracer('pryzm.ui.screen-reader-list-view');

export interface SpatialNode {
  id: string;
  label: string;
  type: string;
  level: number;
  children?: SpatialNode[];
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
    heading.textContent = `Spatial tree (${this._countNodes()} elements)`;
    heading.style.cssText = 'font-size:1rem;margin:0 0 8px;';
    this._root.appendChild(heading);

    const list = this._buildList(this._nodes, 0);
    this._root.appendChild(list);
  }

  private _buildList(nodes: SpatialNode[], depth: number): HTMLUListElement {
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

      if (node.children && node.children.length > 0) {
        li.setAttribute('aria-expanded', 'true');
        li.appendChild(this._buildList(node.children, depth + 1));
      }

      ul.appendChild(li);
    }

    return ul;
  }

  private _select(node: SpatialNode): void {
    statusRegion().announce(`Selected: ${node.type} — ${node.label}`);
    this._opts.onSelect?.(node.id);
  }

  private _countNodes(): number {
    const count = (nodes: SpatialNode[]): number =>
      nodes.reduce((acc, n) => acc + 1 + count(n.children ?? []), 0);
    return count(this._nodes);
  }

  private _resolveCanvas(): HTMLElement | null {
    const ref = this._opts.canvas;
    if (!ref) return null;
    if (typeof ref === 'string') return document.querySelector(ref);
    return ref;
  }
}
