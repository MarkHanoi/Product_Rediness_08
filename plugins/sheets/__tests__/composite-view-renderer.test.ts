// CompositeViewRenderer coverage (S40).
//
// Verifies the composite (a) dispatches by viewId, (b) composes the
// edit camera into the worldBounds it hands to the source, (c) paints
// a loading skeleton when the source is missing, (d) re-fires
// subscribers on registry dirty.

import { describe, it, expect, vi } from 'vitest';
import { CompositeViewRenderer } from '../src/view-renderer/composite.js';
import { MapViewRegistry } from '../src/view-renderer/view-registry.js';
import { ViewportEditController } from '../src/view-renderer/viewport-edit-controller.js';
import type { ViewportRenderRequest } from '../src/sheet-editor-host.js';
import type { ViewSourceRequest } from '../src/view-renderer/view-source.js';
import { createMockCtx, texts } from './_mock-ctx.js';

const baseRequest: ViewportRenderRequest = Object.freeze({
  viewportId: 'vp-1',
  viewId: 'view-floor',
  scale: 100,
  paperWidthMm: 200,
  paperHeightMm: 150,
  worldBounds: Object.freeze({
    worldX: 0, worldY: 0, worldWidth: 20000, worldHeight: 15000,
  }),
});

describe('CompositeViewRenderer', () => {
  it('dispatches to the registered source for a known viewId', () => {
    const reg = new MapViewRegistry();
    const captured: ViewSourceRequest[] = [];
    reg.set('view-floor', {
      kind: 'plan',
      source: (req) => { captured.push(req); },
    });
    const composite = new CompositeViewRenderer({ registry: reg });
    const ctx = createMockCtx();
    composite.renderViewport(ctx as unknown as CanvasRenderingContext2D, baseRequest);
    expect(captured).toHaveLength(1);
    expect(captured[0]!.viewport.viewId).toBe('view-floor');
    expect(captured[0]!.viewport.worldBounds).toEqual(baseRequest.worldBounds);
    expect(captured[0]!.editCamera.zoom).toBe(1);
  });

  it('composes the edit camera into the worldBounds the source receives', () => {
    const reg = new MapViewRegistry();
    const ctrl = new ViewportEditController();
    let received: ViewportRenderRequest['worldBounds'] | undefined;
    reg.set('view-floor', {
      kind: 'plan',
      source: (req) => { received = req.viewport.worldBounds; },
    });
    ctrl.setActiveViewport('vp-1');
    ctrl.pan(500, 0);     // pan +500 in world X
    ctrl.zoom(2);         // zoom in 2x

    const composite = new CompositeViewRenderer({ registry: reg, editController: ctrl });
    composite.renderViewport(createMockCtx() as unknown as CanvasRenderingContext2D, baseRequest);

    expect(received).toBeDefined();
    // Zoom 2 → world rect halves: 10000 × 7500.
    expect(received!.worldWidth).toBeCloseTo(10000);
    expect(received!.worldHeight).toBeCloseTo(7500);
    // Centre shifts by +500 in X (pan applied before zoom).
    expect(received!.worldX + received!.worldWidth / 2).toBeCloseTo(10500);
  });

  it('paints a loading skeleton + label when the viewId is unknown', () => {
    const reg = new MapViewRegistry();
    const composite = new CompositeViewRenderer({ registry: reg });
    const ctx = createMockCtx();
    composite.renderViewport(ctx as unknown as CanvasRenderingContext2D, baseRequest);
    expect(texts(ctx.ops).join(' ')).toContain('Loading view');
    expect(texts(ctx.ops).join(' ')).toContain('view-floor');
  });

  it('subscribes to the registry and proxies dirty events', () => {
    const reg = new MapViewRegistry();
    const composite = new CompositeViewRenderer({ registry: reg });
    const listener = vi.fn();
    const dispose = composite.subscribe!(listener);
    reg.set('view-floor', { kind: 'plan', source: () => undefined });
    expect(listener).toHaveBeenCalledWith('view-floor');
    dispose();
    reg.markDirty('view-floor');
    // Listener no longer notified after dispose.
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('without an edit controller, sources see the host worldBounds verbatim', () => {
    const reg = new MapViewRegistry();
    let received: ViewportRenderRequest['worldBounds'] | undefined;
    reg.set('view-floor', { kind: 'plan', source: (req) => { received = req.viewport.worldBounds; } });
    const composite = new CompositeViewRenderer({ registry: reg });
    composite.renderViewport(createMockCtx() as unknown as CanvasRenderingContext2D, baseRequest);
    expect(received).toEqual(baseRequest.worldBounds);
  });
});
