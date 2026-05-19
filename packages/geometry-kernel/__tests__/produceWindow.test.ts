// produceWindow — descriptor-shape & invariant tests (S11-T2).

import { describe, expect, it } from 'vitest';
import {
  produceWindow,
  composeWindowGeometryHash,
  computeMullionsX,
  computeMullionsZ,
  assertValidDescriptor,
  type WindowWorldPlacement,
} from '../src/index.js';
import { Window, createId } from '@pryzm/schemas';

function mkWindow(o: Partial<import('@pryzm/schemas').Window> = {}) {
  return Window.parse({
    id: createId('window'),
    wallId: createId('wall'),
    openingId: 'op_1',
    width: 1.2,
    height: 1.2,
    sillHeight: 0.9,
    offset: 0,
    frameThickness: 0.05,
    frameWidth: 0.05,
    ...o,
  });
}

const STD_PLACEMENT: WindowWorldPlacement = Object.freeze({
  axis: { x: 1, y: 0, z: 0 },
  normal: { x: 0, y: 0, z: 1 },
  origin: { x: 0, y: 0, z: 0 },
  wallThickness: 0.1,
});

describe('computeMullionsX', () => {
  it('returns no inner mullions for 1 column', () => {
    expect(computeMullionsX(1.2, 1)).toEqual([]);
  });
  it('returns 1 centre mullion for 2 columns', () => {
    expect(computeMullionsX(2, 2)).toEqual([0]);
  });
  it('returns evenly-spaced mullions for 3 columns', () => {
    const xs = computeMullionsX(3, 3);
    expect(xs).toHaveLength(2);
    expect(xs[0]).toBeCloseTo(-0.5);
    expect(xs[1]).toBeCloseTo(0.5);
  });
});

describe('computeMullionsZ', () => {
  it('returns no inner rails for 1 row', () => {
    expect(computeMullionsZ(1, 1, 1)).toEqual([]);
  });
  it('returns evenly-spaced rails for 2 rows', () => {
    const zs = computeMullionsZ(1, 1, 2);
    expect(zs).toHaveLength(1);
    expect(zs[0]).toBeCloseTo(0.5);
  });
});

describe('produceWindow — descriptor invariants', () => {
  it('produces a descriptor that passes assertValidDescriptor', () => {
    const w = mkWindow();
    const desc = produceWindow(w, STD_PLACEMENT);
    expect(() => assertValidDescriptor(desc)).not.toThrow();
  });

  it('emits 2 material slots (frame + glass) and 2 groups', () => {
    const desc = produceWindow(mkWindow(), STD_PLACEMENT);
    expect(desc.materialKeys).toHaveLength(2);
    expect(desc.materialKeys[0]).toMatch(/^window\|.*\|frame$/);
    expect(desc.materialKeys[1]).toMatch(/^window\|.*\|glass$/);
    expect(desc.groups).toHaveLength(2);
    expect(desc.groups[0]!.materialIndex).toBe(0);
    expect(desc.groups[1]!.materialIndex).toBe(1);
  });

  it('embeds frame color in the frame slot key', () => {
    const desc = produceWindow(
      mkWindow({ frameColor: '#112233' }),
      STD_PLACEMENT,
    );
    expect(desc.materialKeys[0]).toContain('#112233');
  });

  it('produces a deterministic hash (same inputs → same hash)', () => {
    const w = mkWindow();
    const a = produceWindow(w, STD_PLACEMENT).hash;
    const b = produceWindow(w, STD_PLACEMENT).hash;
    const c = composeWindowGeometryHash(w, STD_PLACEMENT);
    expect(a).toBe(b);
    expect(a).toBe(c);
  });

  it('hash differs when width changes', () => {
    const a = produceWindow(mkWindow({ width: 1.2 }), STD_PLACEMENT).hash;
    const b = produceWindow(mkWindow({ width: 1.6 }), STD_PLACEMENT).hash;
    expect(a).not.toBe(b);
  });

  it('grid override increases triangle count (more mullions)', () => {
    const baseDesc = produceWindow(mkWindow(), STD_PLACEMENT);
    const gridDesc = produceWindow(mkWindow(), {
      ...STD_PLACEMENT,
      grid: { columns: 3, rows: 2, mullionThickness: 0.04 },
    });
    expect(gridDesc.index.length).toBeGreaterThan(baseDesc.index.length);
  });

  it('respects axis when computing positions (rotated wall)', () => {
    const desc = produceWindow(mkWindow(), {
      axis: { x: 0, y: 0, z: 1 },
      normal: { x: -1, y: 0, z: 0 },
      origin: { x: 5, y: 0, z: 0 },
      wallThickness: 0.1,
    });
    // Bounds X should be ~5 ± frameDepth/2; Z spread is the window width.
    expect(desc.bounds.min.z).toBeLessThan(desc.bounds.max.z);
  });
});
