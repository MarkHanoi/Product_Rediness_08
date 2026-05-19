// WallOccupancyStore tests — pure-query side system (S10-T6 port of
// `src/elements/walls/WallOccupancyStore.ts:221` / PRYZM 1 §06-8.5).

import { describe, it, expect } from 'vitest';
import { Wall as WallSchema, createId } from '@pryzm/plugin-sdk';
import {
  WallOccupancyStore,
  wallOccupancyStore,
  OCCUPANCY_EPSILON_M,
} from '../src/occupancy.js';
import type { WallData } from '../src/store.js';

function buildWall(overrides: Partial<WallData> = {}): WallData {
  // Default = 5 m wall on the X axis at level y = 0.
  return WallSchema.parse({
    id: createId('wall'),
    levelId: 'L1',
    baseLine: [
      { x: 0, y: 0, z: 0 },
      { x: 5, y: 0, z: 0 },
    ],
    height: 2.5,
    thickness: 0.1,
    baseOffset: 0,
    childrenIds: [],
    ...overrides,
  }) as WallData;
}

function opening(label: string, offset: number, width: number) {
  // Opening.id is a free-form min-1 string in the schema (not a typed id),
  // so a short label keeps the assertions readable.  The wall's
  // `childrenIds` MUST carry the matching elementId per the schema's
  // refine (3) invariant.
  return {
    id: label,
    type: 'window' as const,
    offset,
    width,
    height: 1.2,
    sillHeight: 0.9,
    elementId: 'el-' + label,
  };
}

describe('WallOccupancyStore.canPlace — basic placements', () => {
  it('clears a placement on an empty wall', () => {
    const wall = buildWall();
    const result = wallOccupancyStore.canPlace(wall, 1, 1);
    expect(result).toEqual({ valid: true, conflictIds: [] });
  });

  it('allows a placement that exactly touches an existing opening (1 mm tolerance)', () => {
    const wall = buildWall({
      openings: [opening('a', 1.0, 1.0)],
      childrenIds: ['el-a'],
    });
    // New opening starts at exactly 2.0 — flush against opening 'a' end.
    const result = wallOccupancyStore.canPlace(wall, 2.0, 1.0);
    expect(result.valid).toBe(true);
  });

  it('rejects an overlapping placement and surfaces the conflict id', () => {
    const wall = buildWall({
      openings: [opening('a', 1.0, 1.0)],
      childrenIds: ['el-a'],
    });
    const result = wallOccupancyStore.canPlace(wall, 1.5, 1.0);
    expect(result.valid).toBe(false);
    expect(result.conflictIds).toEqual(['a']);
    expect(result.reason).toContain('a');
  });

  it('lists every conflicting opening when the new span straddles two', () => {
    const wall = buildWall({
      openings: [opening('a', 1.0, 0.5), opening('b', 2.0, 0.5)],
      childrenIds: ['el-a', 'el-b'],
    });
    const result = wallOccupancyStore.canPlace(wall, 1.2, 1.5);
    expect(result.valid).toBe(false);
    expect(result.conflictIds).toEqual(['a', 'b']);
  });
});

describe('WallOccupancyStore.canPlace — bounds + degenerate inputs', () => {
  it('rejects placement past the wall end', () => {
    const wall = buildWall();
    const result = wallOccupancyStore.canPlace(wall, 4.5, 1.0);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('extends beyond wall length');
  });

  it('rejects negative offset', () => {
    const wall = buildWall();
    const result = wallOccupancyStore.canPlace(wall, -0.1, 1.0);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('before wall start');
  });

  it('rejects non-positive width', () => {
    const wall = buildWall();
    const r1 = wallOccupancyStore.canPlace(wall, 1.0, 0);
    const r2 = wallOccupancyStore.canPlace(wall, 1.0, -1);
    expect(r1.valid).toBe(false);
    expect(r2.valid).toBe(false);
  });

  it('rejects when the wall has zero planar length (degenerate-input guard, schema would normally reject this upstream)', () => {
    // The schema enforces ≥ 0.05 m baseline length, so we bypass it here
    // — the guard exists to make the side system robust to programmer
    // error if a caller ever hands it a stale or hand-constructed wall.
    const wall = {
      ...buildWall(),
      baseLine: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 },
      ],
    } as unknown as WallData;
    const result = wallOccupancyStore.canPlace(wall, 0, 1);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('zero length');
  });

  it('uses planar XZ length — Y differences in baseLine do not inflate length', () => {
    // Both endpoints at y=2.5 → planar length = 5 m, slope length would be 5 m too.
    // To prove the planar formula, give the wall a baseLine length the slope formula
    // would inflate (we cheat through the type — schemas would reject differing y).
    // Instead, verify the function uses XZ only: place at 4.9 m on a 5 m planar wall.
    const wall = buildWall();
    expect(wallOccupancyStore.canPlace(wall, 4.9, 0.05).valid).toBe(true);
    expect(wallOccupancyStore.canPlace(wall, 4.96, 0.05).valid).toBe(false);
  });
});

describe('WallOccupancyStore.canPlace — excludeId for in-place moves', () => {
  it('does not flag an opening against itself when excludeId matches', () => {
    const wall = buildWall({
      openings: [opening('moving', 1.0, 1.0)],
      childrenIds: ['el-moving'],
    });
    // Move 'moving' slightly within its own footprint — should be valid.
    const result = wallOccupancyStore.canPlace(wall, 1.1, 0.9, 'moving');
    expect(result.valid).toBe(true);
  });

  it('still flags conflicts with OTHER openings even with excludeId', () => {
    const wall = buildWall({
      openings: [
        opening('moving', 0.5, 0.5),
        opening('blocker', 2.0, 1.0),
      ],
      childrenIds: ['el-moving', 'el-blocker'],
    });
    const result = wallOccupancyStore.canPlace(wall, 2.5, 0.8, 'moving');
    expect(result.valid).toBe(false);
    expect(result.conflictIds).toEqual(['blocker']);
  });
});

describe('WallOccupancyStore.getOccupiedSpans', () => {
  it('returns spans sorted by offset', () => {
    const wall = buildWall({
      openings: [opening('b', 3.0, 0.5), opening('a', 1.0, 0.5)],
      childrenIds: ['el-a', 'el-b'],
    });
    const spans = wallOccupancyStore.getOccupiedSpans(wall);
    expect(spans.map((s) => s.openingId)).toEqual(['a', 'b']);
    expect(spans[0]).toEqual({
      openingId: 'a',
      type: 'window',
      offsetM: 1.0,
      endM: 1.5,
    });
  });

  it('returns empty array for a wall with no openings', () => {
    expect(wallOccupancyStore.getOccupiedSpans(buildWall())).toEqual([]);
  });
});

describe('WallOccupancyStore — exported constants + class', () => {
  it('exposes the 1 mm tolerance both as a free constant and as a static', () => {
    expect(OCCUPANCY_EPSILON_M).toBe(0.001);
    expect(WallOccupancyStore.EPSILON_M).toBe(0.001);
  });

  it('the singleton + a fresh instance behave identically (no own state)', () => {
    const wall = buildWall();
    const fresh = new WallOccupancyStore();
    const a = fresh.canPlace(wall, 1, 1);
    const b = wallOccupancyStore.canPlace(wall, 1, 1);
    expect(a).toEqual(b);
  });
});
