// hit-test unit tests (S33 — Contract 44 G9, G10).

import { describe, expect, it } from 'vitest';
import { Wall, Slab, Door, createId } from '@pryzm/plugin-sdk';
import { buildPlanHitTest } from '../src/hit-test.js';

function wall(opts: {
  id?: string;
  a?: { x: number; y?: number; z: number };
  b?: { x: number; y?: number; z: number };
  thickness?: number;
}): Wall {
  return Wall.parse({
    id: opts.id ?? createId('wall'),
    levelId: 'L1',
    baseLine: [
      { x: opts.a?.x ?? 0, y: opts.a?.y ?? 0, z: opts.a?.z ?? 0 },
      { x: opts.b?.x ?? 4, y: opts.b?.y ?? 0, z: opts.b?.z ?? 0 },
    ],
    thickness: opts.thickness ?? 0.2,
  });
}

function slab(corners: { x: number; z: number }[], id?: string): Slab {
  return Slab.parse({
    id: id ?? createId('slab'),
    levelId: 'L1',
    boundary: corners.map((c) => ({ x: c.x, y: 0, z: c.z })),
  });
}

describe('buildPlanHitTest — walls', () => {
  it('hits the wall at its centre', () => {
    const w = wall({ a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, thickness: 0.2 });
    const hit = buildPlanHitTest({ walls: [w] });
    expect(hit(2, 0)).toBe(w.id);
  });

  it('hits inside the half-thickness band', () => {
    const w = wall({ a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, thickness: 0.2 });
    const hit = buildPlanHitTest({ walls: [w] });
    expect(hit(2, 0.09)).toBe(w.id);
    expect(hit(2, -0.09)).toBe(w.id);
  });

  it('misses outside the half-thickness band', () => {
    const w = wall({ a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, thickness: 0.2 });
    const hit = buildPlanHitTest({ walls: [w] });
    expect(hit(2, 0.5)).toBeNull();
  });

  it('misses past the segment endpoints', () => {
    const w = wall({ a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, thickness: 0.2 });
    const hit = buildPlanHitTest({ walls: [w] });
    expect(hit(-1, 0)).toBeNull();
    expect(hit(5, 0)).toBeNull();
  });

  it('honours last-wins ordering on overlapping walls', () => {
    const w1 = wall({ a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, thickness: 0.2 });
    const w2 = wall({ a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, thickness: 0.2 });
    const hit = buildPlanHitTest({ walls: [w1, w2] });
    expect(hit(2, 0)).toBe(w2.id);
  });
});

describe('buildPlanHitTest — slabs', () => {
  it('hits inside the slab polygon', () => {
    const s = slab([
      { x: 0, z: 0 },
      { x: 5, z: 0 },
      { x: 5, z: 4 },
      { x: 0, z: 4 },
    ]);
    const hit = buildPlanHitTest({ walls: [], slabs: [s] });
    expect(hit(2.5, 2)).toBe(s.id);
  });

  it('misses outside the slab polygon', () => {
    const s = slab([
      { x: 0, z: 0 },
      { x: 5, z: 0 },
      { x: 5, z: 4 },
      { x: 0, z: 4 },
    ]);
    const hit = buildPlanHitTest({ walls: [], slabs: [s] });
    expect(hit(10, 10)).toBeNull();
  });

  it('walls take priority over slabs at the same point', () => {
    const w = wall({ a: { x: 0, z: 2 }, b: { x: 5, z: 2 }, thickness: 0.4 });
    const s = slab([
      { x: 0, z: 0 },
      { x: 5, z: 0 },
      { x: 5, z: 4 },
      { x: 0, z: 4 },
    ]);
    const hit = buildPlanHitTest({ walls: [w], slabs: [s] });
    expect(hit(2.5, 2)).toBe(w.id);
  });
});

describe('buildPlanHitTest — doors', () => {
  it('hits door footprint along the host wall (door beats wall on overlap)', () => {
    const w = wall({ id: createId('wall'), a: { x: 0, z: 0 }, b: { x: 4, z: 0 }, thickness: 0.2 });
    const d = Door.parse({
      id: createId('door'),
      wallId: w.id,
      openingId: 'op1',
      width: 0.9,
      offset: 1.5,
      sillHeight: 0,
    });
    const hit = buildPlanHitTest({ walls: [w], doors: [d] });
    // Door centre = a + cos*(offset + width/2) along baseline → x = 1.95
    expect(hit(1.95, 0)).toBe(d.id);
    expect(hit(1.95, 0.05)).toBe(d.id);
    // Outside door footprint → falls through to wall hit (still inside wall).
    expect(hit(0.2, 0)).toBe(w.id);
    // Outside both door footprint AND wall thickness band → null.
    expect(hit(1.95, 0.5)).toBeNull();
  });
});
