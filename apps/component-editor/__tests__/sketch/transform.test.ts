import { describe, it, expect } from 'vitest';
import { canvasToWorld, defaultView, worldToCanvas } from '../../src/sketch/transform.js';

describe('world ↔ canvas transform — S52 D1', () => {
  it('world (0,0) maps to canvas center with default view', () => {
    const view = defaultView(800, 600);
    const c = worldToCanvas({ x: 0, z: 0 }, view);
    expect(c.px).toBe(400);
    expect(c.py).toBe(300);
  });

  it('+X moves rightward and +Z moves downward in canvas pixels', () => {
    const view = defaultView(800, 600);
    const c = worldToCanvas({ x: 100, z: 50 }, view);
    expect(c.px).toBe(500);
    expect(c.py).toBe(350);
  });

  it('zoom multiplies the offset', () => {
    const view = { ...defaultView(800, 600), zoom: 2 };
    const c = worldToCanvas({ x: 100, z: 0 }, view);
    expect(c.px).toBe(400 + 200);
  });

  it('pan shifts the world origin away from the canvas center', () => {
    const view = { ...defaultView(800, 600), panX: 100 };
    const c = worldToCanvas({ x: 100, z: 0 }, view);
    expect(c.px).toBe(400);
  });

  it('round-trips through canvasToWorld', () => {
    const view = { ...defaultView(800, 600), zoom: 1.5, panX: 25, panZ: -10 };
    const original = { x: 123.4, z: -56.7 };
    const c = worldToCanvas(original, view);
    const back = canvasToWorld(c, view);
    expect(back.x).toBeCloseTo(123.4, 6);
    expect(back.z).toBeCloseTo(-56.7, 6);
  });

  it('canvasToWorld throws when zoom is non-positive', () => {
    expect(() => canvasToWorld({ px: 0, py: 0 }, { ...defaultView(800, 600), zoom: 0 })).toThrow(
      /zoom must be > 0/,
    );
  });
});
