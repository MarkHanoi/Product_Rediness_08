// SheetEditorHost — view renderer plumbing (S38 / Phase 2C).
//
// Covers the Revit-style refactor: viewports are LIVE references, NOT
// bitmap snapshots.  Verifies (1) the host calls
// `ViewRenderer.renderViewport(...)` with the correct request, (2) the
// fallback placeholder paints when no renderer is wired, (3)
// `renderer.subscribe` listeners trigger re-renders.

import { describe, it, expect, vi } from 'vitest';
import {
  SheetEditorHost,
  type ViewRenderer,
  type ViewportRenderRequest,
  type SheetReadStore,
  type ActiveSheetReadStore,
} from '../src/sheet-editor-host.js';
import type { SheetData } from '@pryzm/plugin-sdk';
import type { Disposer } from '@pryzm/plugin-sdk';
import { createMockCtx } from './_mock-ctx.js';

class StubScheduler {
  requestFrame(_id: string, _kind: string): void { /* never auto-fires */ }
  addTickListener(_id: string, _cb: () => void): () => void { return () => undefined; }
}

function stubSheetStore(sheets: SheetData[]): SheetReadStore {
  return {
    list: () => sheets,
    get: (id: string) => sheets.find((s) => s.id === id),
    subscribeDirty: () => () => undefined,
  };
}

function stubActiveStore(activeSheetId: string | null): ActiveSheetReadStore & {
  fire: () => void;
} {
  let listener: (() => void) | null = null;
  return {
    getActive: () => ({ activeSheetId }),
    subscribeDirty: (cb) => { listener = cb; return () => { listener = null; }; },
    fire: () => listener?.(),
  };
}

function makeSheet(overrides: Partial<SheetData> = {}): SheetData {
  return {
    id: 'sheet-1',
    name: 'Plan',
    number: 'A-001',
    size: 'A1',
    orientation: 'landscape',
    titleBlockId: 'standard',
    viewports: [
      { id: 'vp-1', viewId: 'view-floor', x: 50, y: 80, width: 200, height: 150, scale: 100 },
    ],
    widgets: [],
    revision: '',
    issue: '',
    seq: 0,
    ...overrides,
  };
}

function makeHost(opts: {
  viewRenderer?: ViewRenderer;
  sheets?: SheetData[];
  active?: string | null;
}): { host: SheetEditorHost; ctx: ReturnType<typeof createMockCtx>; active: ReturnType<typeof stubActiveStore>; canvasFactory: () => HTMLCanvasElement } {
  const ctx = createMockCtx();
  const canvas = {
    width: 800, height: 600,
    getContext: () => ctx,
  } as unknown as HTMLCanvasElement;
  const sheets = opts.sheets ?? [makeSheet()];
  const active = stubActiveStore(opts.active ?? sheets[0]!.id);
  const host = new SheetEditorHost({
    scheduler: new StubScheduler() as never,
    sheetStore: stubSheetStore(sheets),
    activeSheetStore: active,
    viewRenderer: opts.viewRenderer,
    canvasFactory: () => canvas,
    listenerId: 'view-renderer-test',
  });
  return { host, ctx, active, canvasFactory: () => canvas };
}

describe('SheetEditorHost (live viewports)', () => {
  it('calls ViewRenderer.renderViewport with the correct request shape', () => {
    const calls: ViewportRenderRequest[] = [];
    const renderer: ViewRenderer = {
      renderViewport(_ctx, request) { calls.push(request); },
    };
    const { host, ctx } = makeHost({ viewRenderer: renderer });
    host.renderInto(ctx as unknown as CanvasRenderingContext2D, 800, 600);
    host.dispose();

    expect(calls).toHaveLength(1);
    const req = calls[0]!;
    expect(req.viewportId).toBe('vp-1');
    expect(req.viewId).toBe('view-floor');
    expect(req.scale).toBe(100);
    expect(req.paperWidthMm).toBe(200);
    expect(req.paperHeightMm).toBe(150);
    expect(req.worldBounds.worldWidth).toBeGreaterThan(0);
    expect(req.worldBounds.worldHeight).toBeGreaterThan(0);
  });

  it('paints "View renderer not wired" when no renderer is supplied', () => {
    const { host, ctx } = makeHost({});
    host.renderInto(ctx as unknown as CanvasRenderingContext2D, 800, 600);
    host.dispose();
    const labels = ctx.ops.filter((o) => o.op === 'fillText').map((o) => String(o.args[0]));
    expect(labels).toContain('View renderer not wired');
  });

  it('paints "View render error" when the renderer throws (loud-fail isolation)', () => {
    const renderer: ViewRenderer = {
      renderViewport() { throw new Error('boom'); },
    };
    const { host, ctx } = makeHost({ viewRenderer: renderer });
    host.renderInto(ctx as unknown as CanvasRenderingContext2D, 800, 600);
    host.dispose();
    const labels = ctx.ops.filter((o) => o.op === 'fillText').map((o) => String(o.args[0]));
    expect(labels).toContain('View render error');
  });

  it('subscribes to the renderer for live model updates', () => {
    const subscribers: Array<(viewId: string) => void> = [];
    const subscribe = vi.fn((cb: (viewId: string) => void): Disposer => {
      subscribers.push(cb);
      return () => undefined;
    });
    const renderer: ViewRenderer = {
      renderViewport: () => undefined,
      subscribe,
    };
    const { host } = makeHost({ viewRenderer: renderer });
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(subscribers).toHaveLength(1);
    // Firing the listener should not throw — host wires it to a frame
    // request through its scheduler.
    expect(() => subscribers[0]!('view-floor')).not.toThrow();
    host.dispose();
  });
});
