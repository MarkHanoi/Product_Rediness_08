// Widget tool palette coverage (S39).
//
// Uses a hand-rolled minimal DOM stub instead of JSDOM (not installed
// in this workspace).  The palette only touches `createElement`,
// `addEventListener`/`removeEventListener`, `appendChild`, `remove`,
// `setAttribute`, `getAttribute`, `dispatchEvent`, `querySelector(All)`,
// and `dataTransfer.{set,get}Data` — all stubbed below.

import { describe, it, expect, vi } from 'vitest';
import {
  mountWidgetPalette,
  PALETTE_DATA_TYPE,
  DEFAULT_WIDGET_DIMENSIONS,
} from '../src/widget-tool-palette.js';
import { BUILTIN_WIDGET_KINDS } from '../src/widgets/index.js';

// ── Minimal DOM stub ───────────────────────────────────────────────────────

interface StubEvent { type: string; }
interface StubListener { (ev: StubEvent): void; }

class StubDataTransfer {
  private store = new Map<string, string>();
  effectAllowed: string = 'none';
  setData(type: string, value: string): void { this.store.set(type, value); }
  getData(type: string): string { return this.store.get(type) ?? ''; }
}

class StubElement {
  readonly children: StubElement[] = [];
  readonly attributes = new Map<string, string>();
  parent: StubElement | null = null;
  type = '';
  draggable = false;
  className = '';
  textContent = '';
  private listeners = new Map<string, Set<StubListener>>();
  constructor(public readonly tag: string, public readonly ownerDocument: StubDocument) {}
  appendChild(c: StubElement): void { c.parent = this; this.children.push(c); }
  remove(): void {
    if (this.parent) {
      const i = this.parent.children.indexOf(this);
      if (i >= 0) this.parent.children.splice(i, 1);
      this.parent = null;
    }
  }
  setAttribute(k: string, v: string): void { this.attributes.set(k, v); }
  getAttribute(k: string): string | null { return this.attributes.get(k) ?? null; }
  addEventListener(t: string, l: StubListener): void {
    let set = this.listeners.get(t);
    if (!set) { set = new Set(); this.listeners.set(t, set); }
    set.add(l);
  }
  removeEventListener(t: string, l: StubListener): void {
    this.listeners.get(t)?.delete(l);
  }
  dispatchEvent(ev: StubEvent): void {
    for (const l of this.listeners.get(ev.type) ?? []) l(ev);
  }
  querySelectorAll(sel: string): StubElement[] {
    const matches: StubElement[] = [];
    const m = sel.match(/^button\[data-widget-kind(?:="([^"]+)")?\]$/);
    const targetKind = m?.[1];
    const isButtonSel = sel.startsWith('button');
    const visit = (n: StubElement): void => {
      const ok = (sel === 'button' || isButtonSel)
        ? n.tag === 'button'
          && (targetKind === undefined || n.getAttribute('data-widget-kind') === targetKind)
        : false;
      if (ok) matches.push(n);
      for (const c of n.children) visit(c);
    };
    for (const c of this.children) visit(c);
    return matches;
  }
  querySelector(sel: string): StubElement | null {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  get length(): number { return this.children.length; }
}

class StubDocument {
  createElement(tag: string): StubElement { return new StubElement(tag, this); }
}

function setupStubDom(): { container: StubElement; doc: StubDocument } {
  const doc = new StubDocument();
  const container = doc.createElement('div');
  // The palette reads container.ownerDocument; wire it up.
  Object.defineProperty(container, 'ownerDocument', { value: doc });
  return { container, doc };
}

function makeDragEvent(type: string): StubEvent & { dataTransfer: StubDataTransfer } {
  return { type, dataTransfer: new StubDataTransfer() };
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('mountWidgetPalette', () => {
  it('renders one button per built-in kind', () => {
    const { container } = setupStubDom();
    const handle = mountWidgetPalette({
      container: container as unknown as HTMLElement,
    });
    const btns = (handle.element as unknown as StubElement).querySelectorAll(
      'button[data-widget-kind]',
    );
    expect(btns.length).toBe(BUILTIN_WIDGET_KINDS.length);
    handle.dispose();
    expect(container.children.length).toBe(0);
  });

  it('honours an explicit kinds subset', () => {
    const { container } = setupStubDom();
    const handle = mountWidgetPalette({
      container: container as unknown as HTMLElement,
      kinds: ['text', 'line'],
    });
    const kinds = (handle.element as unknown as StubElement)
      .querySelectorAll('button')
      .map((b) => b.getAttribute('data-widget-kind'));
    expect(kinds).toEqual(['text', 'line']);
    handle.dispose();
  });

  it('dragstart writes the kind to dataTransfer + fires onDragStart', () => {
    const { container } = setupStubDom();
    const onDragStart = vi.fn();
    const handle = mountWidgetPalette({
      container: container as unknown as HTMLElement,
      onDragStart,
    });
    const btn = (handle.element as unknown as StubElement)
      .querySelector('button[data-widget-kind="text"]')!;

    const ev = makeDragEvent('dragstart');
    btn.dispatchEvent(ev);

    expect(ev.dataTransfer.getData(PALETTE_DATA_TYPE)).toBe('text');
    expect(ev.dataTransfer.effectAllowed).toBe('copy');
    expect(onDragStart).toHaveBeenCalledWith('text');

    handle.dispose();
  });

  it('removes dragstart listeners on dispose', () => {
    const { container } = setupStubDom();
    const onDragStart = vi.fn();
    const handle = mountWidgetPalette({
      container: container as unknown as HTMLElement,
      onDragStart,
    });
    const btn = (handle.element as unknown as StubElement)
      .querySelector('button[data-widget-kind="text"]')!;
    handle.dispose();

    btn.dispatchEvent(makeDragEvent('dragstart'));
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('resolveDropKind round-trips a previously-dragged kind', () => {
    const { container } = setupStubDom();
    const handle = mountWidgetPalette({ container: container as unknown as HTMLElement });
    const drop = makeDragEvent('drop');
    drop.dataTransfer.setData(PALETTE_DATA_TYPE, 'scale-bar');
    expect(handle.resolveDropKind(drop as unknown as DragEvent)).toBe('scale-bar');
    handle.dispose();
  });

  it('resolveDropKind returns null when payload is missing or unknown', () => {
    const { container } = setupStubDom();
    const handle = mountWidgetPalette({ container: container as unknown as HTMLElement });

    const empty = makeDragEvent('drop');
    expect(handle.resolveDropKind(empty as unknown as DragEvent)).toBeNull();

    empty.dataTransfer.setData(PALETTE_DATA_TYPE, 'not-a-kind');
    expect(handle.resolveDropKind(empty as unknown as DragEvent)).toBeNull();

    handle.dispose();
  });

  it('defaultSize falls back to spec defaults', () => {
    const { container } = setupStubDom();
    const handle = mountWidgetPalette({ container: container as unknown as HTMLElement });
    expect(handle.defaultSize('text')).toEqual(DEFAULT_WIDGET_DIMENSIONS.text);
    handle.dispose();
  });

  it('honours seedDimensions overrides', () => {
    const { container } = setupStubDom();
    const handle = mountWidgetPalette({
      container: container as unknown as HTMLElement,
      seedDimensions: { text: { width: 999, height: 11 } },
    });
    expect(handle.defaultSize('text')).toEqual({ width: 999, height: 11 });
    expect(handle.defaultSize('line')).toEqual(DEFAULT_WIDGET_DIMENSIONS.line);
    handle.dispose();
  });
});
