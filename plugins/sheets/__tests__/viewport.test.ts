// ViewportManager — coverage (S38 / Phase 2C / ADR-0031).
//
// Includes the spec D9 5-scale parity test (1:50, 1:100, 1:200, 1:500,
// 1:1000) — every viewport scale shipped in 2C must round-trip bit-exact
// through `computeWorldBounds`.

import { describe, it, expect } from 'vitest';
import { applyPatches } from 'immer';
import { CommandBus } from '@pryzm/plugin-sdk';
import {
  ViewportManager,
  DEFAULT_VIEWPORT_WIDTH_MM,
  DEFAULT_VIEWPORT_HEIGHT_MM,
  DEFAULT_VIEWPORT_SCALE,
} from '../src/viewport.js';
import { AddViewportHandler } from '../src/handlers/AddViewport.js';
import type { SheetData, ViewportDto } from '@pryzm/plugin-sdk';
import type { SheetsState } from '@pryzm/plugin-sdk';

const baseSheet: SheetData = {
  id: 'sheet-1', name: 'Plan', number: 'A-001',
  size: 'A1', orientation: 'landscape',
  titleBlockId: 'standard', viewports: [], widgets: [],
  revision: '', issue: '', seq: 0,
};

function makeBus(initial: SheetsState = { 'sheet-1': baseSheet }): {
  bus: CommandBus;
  getSheet: () => SheetsState;
} {
  let sheetState = initial;
  const bus = new CommandBus({
    storesProvider: () => ({ sheet: sheetState }),
    audit: { actorId: 'test', projectId: 'p', clientId: 'c' },
  });
  // Wire a tiny "apply forward patches back to the store" loop — mirrors
  // what `wireSheetsBus` does in production.
  bus.patches.subscribe((_bytes, record) => {
    for (const entry of record.patches) {
      if (entry.storeKey === 'sheet') {
        sheetState = applyPatches(sheetState, [...entry.forwardPatches]) as SheetsState;
      }
    }
  });
  bus.register(new AddViewportHandler() as never);
  return { bus, getSheet: () => sheetState };
}

describe('ViewportManager.buildDropPayload', () => {
  it('uses DEFAULT_* constants when no overrides given', () => {
    const m = new ViewportManager(new CommandBus({ storesProvider: () => ({ sheet: {} }), audit: { actorId: 'a', projectId: 'p', clientId: 'c' } }), 'sheet-1');
    const p = m.buildDropPayload({ viewId: 'view-1', dropX: 100, dropY: 200 });
    expect(p.width).toBe(DEFAULT_VIEWPORT_WIDTH_MM);
    expect(p.height).toBe(DEFAULT_VIEWPORT_HEIGHT_MM);
    expect(p.scale).toBe(DEFAULT_VIEWPORT_SCALE);
    expect(p.x).toBe(100);
    expect(p.y).toBe(200);
  });

  it('honours center-anchor by offsetting the drop point', () => {
    const m = new ViewportManager(new CommandBus({ storesProvider: () => ({ sheet: {} }), audit: { actorId: 'a', projectId: 'p', clientId: 'c' } }), 'sheet-1');
    const p = m.buildDropPayload({ viewId: 'view-1', dropX: 100, dropY: 200, width: 60, height: 40, anchor: 'center' });
    expect(p.x).toBe(70);
    expect(p.y).toBe(180);
  });

  it('throws on empty sheetId', () => {
    expect(() => new ViewportManager(
      new CommandBus({ storesProvider: () => ({ sheet: {} }), audit: { actorId: 'a', projectId: 'p', clientId: 'c' } }),
      '',
    )).toThrow();
  });
});

describe('ViewportManager.handleDropView (integration with bus + handler)', () => {
  it('dispatches sheet.addViewport and writes the new viewport into the store', async () => {
    const { bus, getSheet } = makeBus();
    const mgr = new ViewportManager(bus, 'sheet-1');
    const payload = await mgr.handleDropView({
      viewId: 'view-1', dropX: 50, dropY: 60, width: 100, height: 80, scale: 50, id: 'vp-explicit',
    });
    expect(payload.id).toBe('vp-explicit');
    expect(getSheet()['sheet-1']!.viewports.map((v) => v.id)).toEqual(['vp-explicit']);
  });
});

describe('ViewportManager.computeWorldBounds — D9 5-scale parity', () => {
  // Spec: viewport.width = 100mm, viewport.scale = N → worldWidth = 100*N.
  // The 5 sample scales below are the S38 D9 demo scales; every plan view
  // shipped in 2C must round-trip them bit-exact.
  const cases = [
    { scale: 50,   expectedWorldWidth: 5_000 },
    { scale: 100,  expectedWorldWidth: 10_000 },
    { scale: 200,  expectedWorldWidth: 20_000 },
    { scale: 500,  expectedWorldWidth: 50_000 },
    { scale: 1000, expectedWorldWidth: 100_000 },
  ];

  for (const { scale, expectedWorldWidth } of cases) {
    it(`scale 1:${scale} → world width ${expectedWorldWidth} mm`, () => {
      const vp: ViewportDto = { id: 'vp-1', viewId: 'view-1', x: 0, y: 0, width: 100, height: 75, scale };
      const bounds = ViewportManager.computeWorldBounds(vp);
      expect(bounds.worldWidth).toBe(expectedWorldWidth);
      expect(bounds.worldHeight).toBe(75 * scale);
      expect(bounds.worldX).toBe(0);
      expect(bounds.worldY).toBe(0);
    });
  }

  it('uses clippingBox directly when present (world-space crop)', () => {
    const vp: ViewportDto = {
      id: 'vp-1', viewId: 'view-1', x: 0, y: 0, width: 100, height: 75, scale: 100,
      clippingBox: { x: 1000, y: 2000, width: 5000, height: 3000 },
    };
    const bounds = ViewportManager.computeWorldBounds(vp);
    expect(bounds).toMatchObject({ worldX: 1000, worldY: 2000, worldWidth: 5000, worldHeight: 3000 });
  });

  it('throws on invalid scale', () => {
    const bad: ViewportDto = { id: 'vp-1', viewId: 'view-1', x: 0, y: 0, width: 1, height: 1, scale: 0 };
    expect(() => ViewportManager.computeWorldBounds(bad)).toThrow();
  });
});

describe('ViewportManager.containsPoint', () => {
  const vp: ViewportDto = { id: 'vp-1', viewId: 'view-1', x: 10, y: 20, width: 100, height: 80, scale: 100 };

  it('detects points inside / on edges / outside', () => {
    expect(ViewportManager.containsPoint(vp, 50, 50)).toBe(true);
    expect(ViewportManager.containsPoint(vp, 10, 20)).toBe(true);   // bottom-left corner
    expect(ViewportManager.containsPoint(vp, 110, 100)).toBe(true); // top-right corner
    expect(ViewportManager.containsPoint(vp, 5, 50)).toBe(false);
    expect(ViewportManager.containsPoint(vp, 50, 200)).toBe(false);
  });
});
