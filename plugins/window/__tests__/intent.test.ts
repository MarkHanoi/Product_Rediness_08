// Window intent resolver tests (S11-T2).

import { describe, expect, it } from 'vitest';
import { resolveWindowPlacement, wallLength } from '../src/intent.js';
import type { WallsState } from '@pryzm/plugin-wall';
import { Wall, createId } from '@pryzm/plugin-sdk';

function mkWall(start: { x: number; y: number; z: number }, end: { x: number; y: number; z: number }) {
  return Wall.parse({
    id: createId('wall'),
    levelId: 'lvl_1',
    baseLine: [start, end],
    height: 2.4,
    thickness: 0.1,
  });
}

describe('wallLength', () => {
  it('returns chord length', () => {
    const w = mkWall({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
    expect(wallLength(w)).toBeCloseTo(5);
  });
});

describe('resolveWindowPlacement', () => {
  it('snaps a near-wall click to a placement with default sill height', () => {
    const w = mkWall({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
    const walls: WallsState = { [w.id]: w };
    const placement = resolveWindowPlacement(
      { x: 2.5, y: 0, z: 0.05 },
      walls,
      1.2,
    );
    expect(placement).toBeDefined();
    expect(placement!.wallId).toBe(w.id);
    expect(placement!.fits).toBe(true);
    expect(placement!.sillHeight).toBeCloseTo(0.9);
    expect(placement!.offset).toBeGreaterThan(0);
    expect(placement!.offset).toBeLessThan(5);
  });

  it('returns undefined when click is far from every wall', () => {
    const w = mkWall({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
    const placement = resolveWindowPlacement(
      { x: 2.5, y: 0, z: 100 },
      { [w.id]: w },
      1.2,
    );
    expect(placement).toBeUndefined();
  });

  it('clamps offset so the window fits between start and end', () => {
    const w = mkWall({ x: 0, y: 0, z: 0 }, { x: 2, y: 0, z: 0 });
    const walls: WallsState = { [w.id]: w };
    const placement = resolveWindowPlacement(
      { x: 0.05, y: 0, z: 0 },
      walls,
      1.2,
    );
    expect(placement).toBeDefined();
    expect(placement!.offset).toBeGreaterThanOrEqual(0.6);
    expect(placement!.offset).toBeLessThanOrEqual(1.4);
  });

  it('reports fits=false when the wall is shorter than the window width', () => {
    const w = mkWall({ x: 0, y: 0, z: 0 }, { x: 0.5, y: 0, z: 0 });
    const placement = resolveWindowPlacement(
      { x: 0.25, y: 0, z: 0.0 },
      { [w.id]: w },
      1.2,
    );
    expect(placement).toBeDefined();
    expect(placement!.fits).toBe(false);
  });

  it('honours an explicit sillHeight argument', () => {
    const w = mkWall({ x: 0, y: 0, z: 0 }, { x: 5, y: 0, z: 0 });
    const placement = resolveWindowPlacement(
      { x: 2.5, y: 0, z: 0 },
      { [w.id]: w },
      1.2,
      0.6,
    );
    expect(placement!.sillHeight).toBeCloseTo(0.6);
  });
});
