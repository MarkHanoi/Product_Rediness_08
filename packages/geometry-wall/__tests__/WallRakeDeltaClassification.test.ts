// §WALL-RAKE-JOINT-ONE-EDIT-BEHIND (founder 2026-08-09, ADR-0312 follow-up) —
// a rake edit is JOIN-GEOMETRY-RELEVANT and must take the whole-level path.
//
// THE DEFECT: "the joint geometry is correct but arrives ONE EDIT LATE." The
// twin-solve loft (ADR-0312) made a wall's built TOP geometry a function of the
// V2 cache (`refreshV2Cache` now receives `rakeAngleDeg` per wall and runs the
// probe solve). But `classifyWallDelta` still classified a rake-only edit as
// `openings-only` — its `joinGeometryChangedExcludingBaseline` checks thickness /
// layers / curve and never looks at `rakeAngleDeg`. The coordinator therefore
// took `_flushOpeningsOnly`, which by design SKIPS `refreshV2Cache` and never
// rebuilds the NEIGHBOUR. The edited wall rebuilt against the STALE cache — the
// probe solve of the PREVIOUS refresh — so every render showed the state of the
// edit BEFORE this one, and the pending state only landed when a later mutation
// forced the whole-level path. Exactly "one edit behind".
//
// The classifier's header proof ("resolveLevel, the V2 miter cache and
// computeJunctionInfills are functions of endpoints/thickness/adjacency ONLY")
// was true before ADR-0312 and is FALSE after it: the V2 cache is now also a
// function of every wall's rake. Per the classifier's own safety doctrine
// ("ANY uncertainty → whole-level"), a rake change must fail the fast-path gate.

import { describe, it, expect } from 'vitest';
import { classifyWallDelta, joinGeometryChangedExcludingBaseline } from '../src/WallDeltaClassifier';
import type { WallData } from '../src/WallTypes';

function wall(rakeAngleDeg?: number, over: Partial<WallData> = {}): WallData {
    return {
        id: 'wall_A',
        type: 'wall',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }],
        thickness: 0.2,
        height: 3,
        baseOffset: 0,
        openings: [],
        childrenIds: [],
        ...(rakeAngleDeg !== undefined ? { rakeAngleDeg } : {}),
        ...over,
    } as unknown as WallData;
}

describe('§WALL-RAKE-JOINT-ONE-EDIT-BEHIND — a rake edit must NOT take the openings-only fast path', () => {
    it('a rake-only edit (absent → 70) classifies WHOLE-LEVEL, not openings-only', () => {
        const result = classifyWallDelta([
            { event: 'update', wall: wall(70), prevState: wall() },
        ]);
        expect(result.kind).toBe('whole-level');
    });

    it('a rake-only edit (70 → 80) classifies WHOLE-LEVEL', () => {
        const result = classifyWallDelta([
            { event: 'update', wall: wall(80), prevState: wall(70) },
        ]);
        expect(result.kind).toBe('whole-level');
    });

    it('joinGeometryChangedExcludingBaseline is TRUE for a rake change', () => {
        expect(joinGeometryChangedExcludingBaseline(wall(70), wall(80))).toBe(true);
        expect(joinGeometryChangedExcludingBaseline(wall(), wall(70))).toBe(true);
    });

    it('an ABSENT rake and an explicit 90 are the SAME wall — no false invalidation', () => {
        expect(joinGeometryChangedExcludingBaseline(wall(), wall(90))).toBe(false);
        const result = classifyWallDelta([
            { event: 'update', wall: wall(90), prevState: wall() },
        ]);
        // Nothing changed → still the fast path (this guard must not slow every edit).
        expect(result.kind).toBe('openings-only');
    });

    it('an unchanged rake alongside an openings-value edit STILL takes the fast path', () => {
        const opening = { id: 'o1', elementId: 'w1', type: 'window' as const, offset: 1, width: 1, height: 1.2, sillHeight: 0.9 };
        const result = classifyWallDelta([
            {
                event: 'update',
                wall: wall(undefined, { openings: [{ ...opening, offset: 1.5 }] } as unknown as Partial<WallData>),
                prevState: wall(undefined, { openings: [opening] } as unknown as Partial<WallData>),
            },
        ]);
        expect(result.kind).toBe('openings-only');
    });
});
