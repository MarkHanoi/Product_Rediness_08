// view-source — applyEditCamera arithmetic + invariants (S40).

import { describe, it, expect } from 'vitest';
import {
  applyEditCamera,
  IDENTITY_EDIT_CAMERA,
  VIEW_KINDS,
  type EditCamera,
} from '../src/view-renderer/view-source.js';

const bounds = Object.freeze({ worldX: 0, worldY: 0, worldWidth: 1000, worldHeight: 800 });

describe('applyEditCamera', () => {
  it('identity camera returns the same rectangle', () => {
    const r = applyEditCamera(bounds, IDENTITY_EDIT_CAMERA);
    expect(r).toEqual(bounds);
  });

  it('zoom > 1 narrows the rect about its centre', () => {
    const cam: EditCamera = { panWorldX: 0, panWorldY: 0, zoom: 2 };
    const r = applyEditCamera(bounds, cam);
    expect(r.worldWidth).toBeCloseTo(500);
    expect(r.worldHeight).toBeCloseTo(400);
    // Same centre.
    expect(r.worldX + r.worldWidth / 2).toBeCloseTo(500);
    expect(r.worldY + r.worldHeight / 2).toBeCloseTo(400);
  });

  it('zoom < 1 widens the rect about its centre', () => {
    const cam: EditCamera = { panWorldX: 0, panWorldY: 0, zoom: 0.5 };
    const r = applyEditCamera(bounds, cam);
    expect(r.worldWidth).toBeCloseTo(2000);
    expect(r.worldHeight).toBeCloseTo(1600);
    expect(r.worldX + r.worldWidth / 2).toBeCloseTo(500);
  });

  it('pan shifts the rect centre by the world deltas', () => {
    const cam: EditCamera = { panWorldX: 100, panWorldY: -50, zoom: 1 };
    const r = applyEditCamera(bounds, cam);
    expect(r.worldX + r.worldWidth / 2).toBeCloseTo(600);
    expect(r.worldY + r.worldHeight / 2).toBeCloseTo(350);
  });

  it('pan + zoom compose correctly', () => {
    const cam: EditCamera = { panWorldX: 100, panWorldY: 100, zoom: 4 };
    const r = applyEditCamera(bounds, cam);
    expect(r.worldWidth).toBeCloseTo(250);
    expect(r.worldHeight).toBeCloseTo(200);
    expect(r.worldX + r.worldWidth / 2).toBeCloseTo(600);
    expect(r.worldY + r.worldHeight / 2).toBeCloseTo(500);
  });

  it('throws on invalid zoom', () => {
    expect(() => applyEditCamera(bounds, { panWorldX: 0, panWorldY: 0, zoom: 0 })).toThrow();
    expect(() => applyEditCamera(bounds, { panWorldX: 0, panWorldY: 0, zoom: -1 })).toThrow();
    expect(() => applyEditCamera(bounds, { panWorldX: 0, panWorldY: 0, zoom: NaN })).toThrow();
  });

  it('VIEW_KINDS lists every Revit-style view source', () => {
    expect(VIEW_KINDS).toContain('plan');
    expect(VIEW_KINDS).toContain('section');
    expect(VIEW_KINDS).toContain('elevation');
    expect(VIEW_KINDS).toContain('schedule');
    expect(VIEW_KINDS).toContain('3d');
    expect(VIEW_KINDS).toContain('detail');
  });
});
