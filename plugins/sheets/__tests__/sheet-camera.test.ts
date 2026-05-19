// SheetCamera — coverage (S37 / ADR-0031).

import { describe, it, expect, vi } from 'vitest';
import {
  SheetCamera,
  SHEET_CAMERA_DEFAULT_PX_PER_MM,
  SHEET_CAMERA_MAX_PX_PER_MM,
  SHEET_CAMERA_MIN_PX_PER_MM,
} from '../src/sheet-camera.js';

describe('SheetCamera defaults', () => {
  it('uses 2 px/mm by default', () => {
    const c = new SheetCamera();
    expect(c.pixelsPerMm).toBe(SHEET_CAMERA_DEFAULT_PX_PER_MM);
    expect(c.panX).toBe(0);
    expect(c.panY).toBe(0);
  });
});

describe('SheetCamera.pan', () => {
  it('moves the camera and fires onDirty', () => {
    const onDirty = vi.fn();
    const c = new SheetCamera({ onDirty });
    c.pan(10, 20);
    expect(c.panX).toBe(10);
    expect(c.panY).toBe(20);
    expect(onDirty).toHaveBeenCalledTimes(1);
  });
  it('is a no-op for (0, 0)', () => {
    const onDirty = vi.fn();
    const c = new SheetCamera({ onDirty });
    c.pan(0, 0);
    expect(onDirty).not.toHaveBeenCalled();
  });
});

describe('SheetCamera.zoomAt', () => {
  it('keeps the paper coord under the zoom anchor fixed on screen', () => {
    const c = new SheetCamera({ pixelsPerMm: 1 });
    const before = c.screenToPaper(100, 50);
    c.zoomAt(100, 50, 2);
    const after = c.screenToPaper(100, 50);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('clamps pixelsPerMm to [min, max]', () => {
    const c = new SheetCamera({ pixelsPerMm: 1 });
    c.zoomAt(0, 0, 1e12);
    expect(c.pixelsPerMm).toBe(SHEET_CAMERA_MAX_PX_PER_MM);
    c.zoomAt(0, 0, 1e-12);
    expect(c.pixelsPerMm).toBe(SHEET_CAMERA_MIN_PX_PER_MM);
  });

  it('ignores invalid factors', () => {
    const c = new SheetCamera({ pixelsPerMm: 5 });
    c.zoomAt(0, 0, NaN);
    c.zoomAt(0, 0, 0);
    c.zoomAt(0, 0, -1);
    c.zoomAt(0, 0, 1);
    expect(c.pixelsPerMm).toBe(5);
  });
});

describe('SheetCamera.setState', () => {
  it('only fires onDirty when something actually changed', () => {
    const onDirty = vi.fn();
    const c = new SheetCamera({ panX: 1, panY: 2, pixelsPerMm: 3, onDirty });
    c.setState({ panX: 1, panY: 2, pixelsPerMm: 3 }); // no change
    expect(onDirty).not.toHaveBeenCalled();
    c.setState({ pixelsPerMm: 4 });
    expect(onDirty).toHaveBeenCalledTimes(1);
  });
  it('throws on non-positive pixelsPerMm', () => {
    const c = new SheetCamera();
    expect(() => c.setState({ pixelsPerMm: 0 })).toThrow();
    expect(() => c.setState({ pixelsPerMm: -1 })).toThrow();
    expect(() => c.setState({ pixelsPerMm: NaN })).toThrow();
  });
});

describe('SheetCamera.fitToPaper', () => {
  it('fits an A1 landscape (841 × 594 mm) inside an 800 × 600 viewport', () => {
    const c = new SheetCamera();
    c.fitToPaper(841, 594, 800, 600, 24);
    // Expect to fit width: (800-48)/841 ≈ 0.894 px/mm; height: (600-48)/594 ≈ 0.929
    expect(c.pixelsPerMm).toBeCloseTo(752 / 841, 4);
    // Centre offset.
    expect(c.panX).toBeCloseTo((800 - 841 * c.pixelsPerMm) / 2, 4);
    expect(c.panY).toBeCloseTo((600 - 594 * c.pixelsPerMm) / 2, 4);
  });

  it('is a no-op when any dimension is 0', () => {
    const onDirty = vi.fn();
    const c = new SheetCamera({ onDirty });
    c.fitToPaper(0, 100, 100, 100);
    c.fitToPaper(100, 100, 0, 100);
    expect(onDirty).not.toHaveBeenCalled();
  });
});

describe('SheetCamera transforms', () => {
  it('paperToScreen + screenToPaper are inverses', () => {
    const c = new SheetCamera({ panX: 10, panY: 20, pixelsPerMm: 3 });
    for (const p of [{ x: 0, y: 0 }, { x: 50, y: 75 }, { x: -12, y: 80 }]) {
      const s = c.paperToScreen(p.x, p.y);
      const back = c.screenToPaper(s.x, s.y);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('screenToPaper is safe when pixelsPerMm is 0', () => {
    const c = new SheetCamera({ pixelsPerMm: 1 });
    (c as unknown as { pixelsPerMm: number }).pixelsPerMm = 0;
    expect(c.screenToPaper(100, 100)).toEqual({ x: 0, y: 0 });
  });
});

describe('SheetCamera.onDirty error handling', () => {
  it('a throwing onDirty does not propagate out of pan/zoom', () => {
    const c = new SheetCamera({ onDirty: () => { throw new Error('boom'); } });
    expect(() => c.pan(1, 0)).not.toThrow();
  });
});
