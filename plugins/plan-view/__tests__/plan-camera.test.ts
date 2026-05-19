// PlanCamera unit tests (S29 / ADR-0028).

import { describe, expect, it } from 'vitest';
import { PlanCamera } from '../src/PlanCamera.js';

describe('PlanCamera', () => {
  it('default scale is 50 px/m and pan is (0,0)', () => {
    const c = new PlanCamera();
    expect(c.scale).toBe(50);
    expect(c.panX).toBe(0);
    expect(c.panY).toBe(0);
  });

  it('worldToScreen / screenToWorld are inverses', () => {
    const c = new PlanCamera({ panX: 100, panY: 50, scale: 25 });
    const w = { x: 3.5, z: -2 };
    const s = c.worldToScreen(w.x, w.z);
    const back = c.screenToWorld(s.x, s.y);
    expect(back.x).toBeCloseTo(w.x, 6);
    expect(back.z).toBeCloseTo(w.z, 6);
  });

  it('pan translates in screen pixels', () => {
    const c = new PlanCamera();
    c.pan(20, 40);
    expect(c.panX).toBe(20);
    expect(c.panY).toBe(40);
  });

  it('zoomAt keeps the world point under the cursor stationary on screen', () => {
    const c = new PlanCamera({ panX: 200, panY: 100, scale: 50 });
    const screen = { x: 320, y: 240 };
    const beforeWorld = c.screenToWorld(screen.x, screen.y);
    c.zoomAt(screen.x, screen.y, 1.5);
    const afterWorld = c.screenToWorld(screen.x, screen.y);
    // After zoom, the same screen pixel should still resolve to ~the same world point.
    expect(afterWorld.x).toBeCloseTo(beforeWorld.x, 5);
    expect(afterWorld.z).toBeCloseTo(beforeWorld.z, 5);
    expect(c.scale).toBeCloseTo(75, 5);
  });

  it('zoomAt clamps scale to a sane range', () => {
    const c = new PlanCamera({ scale: 1 });
    for (let i = 0; i < 100; i++) c.zoomAt(0, 0, 0.1);
    expect(c.scale).toBeGreaterThanOrEqual(1e-3);
    for (let i = 0; i < 100; i++) c.zoomAt(0, 0, 10);
    expect(c.scale).toBeLessThanOrEqual(1e6);
  });

  it('zoomAt rejects non-finite or zero/negative factors', () => {
    const c = new PlanCamera({ scale: 50 });
    c.zoomAt(0, 0, 0);
    c.zoomAt(0, 0, -1);
    c.zoomAt(0, 0, Number.NaN);
    expect(c.scale).toBe(50);
  });

  // ── S31 — onDirty hook (ADR-0023 §3 + §4) ──────────────────────────────
  it('S31: onDirty fires once per pan, once per zoom, once per setTransform', () => {
    let count = 0;
    const c = new PlanCamera({ onDirty: () => { count++; } });
    c.pan(10, 0);
    c.pan(0, 5);
    c.zoomAt(100, 100, 1.5);
    c.setTransform(0, 0, 50);
    expect(count).toBe(4);
  });

  it('S31: no-op pan / zoom / setTransform DOES NOT fire onDirty', () => {
    let count = 0;
    const c = new PlanCamera({ panX: 10, panY: 20, scale: 50, onDirty: () => { count++; } });
    c.pan(0, 0);
    c.zoomAt(100, 100, 1);
    c.setTransform(10, 20, 50);
    expect(count).toBe(0);
  });

  it('S31: onDirty listener errors do not crash pan', () => {
    const c = new PlanCamera({ onDirty: () => { throw new Error('boom'); } });
    expect(() => c.pan(1, 1)).not.toThrow();
    expect(c.panX).toBe(1);
  });

  it('S31: onDirty hook can be set after construction (host pattern)', () => {
    const c = new PlanCamera();
    let calls = 0;
    c.onDirty = () => { calls++; };
    c.pan(5, 5);
    expect(calls).toBe(1);
  });

  it('applyTransform forwards scale + pan to setTransform', () => {
    const c = new PlanCamera({ panX: 10, panY: 20, scale: 30 });
    let captured: number[] | null = null;
    c.applyTransform({
      setTransform: (a, b, cc, d, e, f) => { captured = [a, b, cc, d, e, f]; },
    });
    expect(captured).toEqual([30, 0, 0, 30, 10, 20]);
  });
});
