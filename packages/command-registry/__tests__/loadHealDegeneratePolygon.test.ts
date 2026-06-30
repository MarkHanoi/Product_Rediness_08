// §LOAD-HEAL-DEGENERATE-POLYGON regression.
//
// An OLD residential project (generated BEFORE the WallJoinResolver
// collinearity / `_clampEndToShellInnerFace` fix) persists collapsed sub-0.05 m
// wall baselines. At save time those degenerate walls left room perimeters
// unsealed, so the snapshot's ROOM / FLOOR / CEILING polygons were written as
// zero-area / fewer-than-3-distinct-vertex rings. On every OPEN those records
// fail the downstream `validatePolygon` ("≥3 vertices") guard, producing the
// founder's persistent "120 elements failed — see console" banner that can never
// self-heal (the broken data is baked into the snapshot).
//
// The load-time heal DROPS such records before they are dispatched, so they
// neither fail nor inflate the failure count; the post-load REDETECT_ROOMS sweep
// re-seals each level's rooms from the now-valid (join-resolved) wall geometry.
//
// These are pure data tests (no THREE, no runtime) over the exported decision
// helpers.

import { describe, it, expect } from 'vitest';
import {
    isDegeneratePolygon,
    dropDegeneratePolygonRecords,
} from '../src/project/projectLoaderUtils';

describe('§LOAD-HEAL-DEGENERATE-POLYGON — isDegeneratePolygon', () => {
    it('a valid square ring is NOT degenerate (object {x,z} form)', () => {
        const square = [
            { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 },
        ];
        expect(isDegeneratePolygon(square)).toBe(false);
    });

    it('a valid square ring is NOT degenerate (tuple [x,z] form)', () => {
        const square: [number, number][] = [[0, 0], [4, 0], [4, 3], [0, 3]];
        expect(isDegeneratePolygon(square)).toBe(false);
    });

    it('null / undefined / <3 vertices is degenerate', () => {
        expect(isDegeneratePolygon(null)).toBe(true);
        expect(isDegeneratePolygon(undefined)).toBe(true);
        expect(isDegeneratePolygon([])).toBe(true);
        expect(isDegeneratePolygon([{ x: 0, z: 0 }])).toBe(true);
        expect(isDegeneratePolygon([{ x: 0, z: 0 }, { x: 1, z: 1 }])).toBe(true);
    });

    it('three vertices that collapse to <3 DISTINCT points is degenerate', () => {
        // Two near-coincident corners (a collapsed-wall artefact): only 2 distinct.
        const collapsed = [
            { x: 0, z: 0 }, { x: 0.0001, z: 0.0001 }, { x: 5, z: 0 },
        ];
        expect(isDegeneratePolygon(collapsed)).toBe(true);
    });

    it('a zero-area collinear sliver (all points on a line) is degenerate', () => {
        const sliver = [
            { x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 },
        ];
        expect(isDegeneratePolygon(sliver)).toBe(true);
    });

    it('a non-finite (NaN/Inf) coordinate is degenerate', () => {
        expect(isDegeneratePolygon([{ x: 0, z: 0 }, { x: NaN, z: 0 }, { x: 4, z: 4 }])).toBe(true);
        expect(isDegeneratePolygon([{ x: 0, z: 0 }, { x: Infinity, z: 0 }, { x: 4, z: 4 }])).toBe(true);
    });

    it('a closing vertex equal to the first does not make a real triangle degenerate', () => {
        // 3 distinct corners + explicit closing vertex = a valid triangle.
        const closedTriangle = [
            { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 2, z: 3 }, { x: 0, z: 0 },
        ];
        expect(isDegeneratePolygon(closedTriangle)).toBe(false);
    });

    it('reads {x,y} legacy authoring as XZ (y → z)', () => {
        const legacy = [
            { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 },
        ];
        expect(isDegeneratePolygon(legacy as any)).toBe(false);
    });
});

describe('§LOAD-HEAL-DEGENERATE-POLYGON — dropDegeneratePolygonRecords', () => {
    it('keeps valid records and drops degenerate ones', () => {
        const records = [
            { id: 'good', boundary: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }] } },
            { id: 'sliver', boundary: { polygon: [{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }] } },
            { id: 'tiny', boundary: { polygon: [{ x: 0, z: 0 }, { x: 0.0001, z: 0 }] } },
        ];
        const { kept, dropped } = dropDegeneratePolygonRecords(records, (r) => r.boundary?.polygon);
        expect(kept.map(r => r.id)).toEqual(['good']);
        expect(dropped.map(r => r.id).sort()).toEqual(['sliver', 'tiny']);
    });

    it('KEEPS records that carry NO polygon (not polygon-bearing — defaulted downstream)', () => {
        const records = [
            { id: 'no-poly' },
            { id: 'has-poly', boundary: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }] } },
        ];
        const { kept, dropped } = dropDegeneratePolygonRecords(records, (r: any) => r.boundary?.polygon);
        expect(kept.map(r => r.id).sort()).toEqual(['has-poly', 'no-poly']);
        expect(dropped).toHaveLength(0);
    });

    it('null / undefined input yields empty partitions', () => {
        expect(dropDegeneratePolygonRecords(null, () => [])).toEqual({ kept: [], dropped: [] });
        expect(dropDegeneratePolygonRecords(undefined, () => [])).toEqual({ kept: [], dropped: [] });
    });

    it('simulates the founder snapshot: a level with a sub-0.05 m wall yields a degenerate room → dropped, level marked for re-seal', () => {
        // A degenerate room boundary produced by a collapsed wall: only 2 distinct
        // corners after the ~0.03 m wall collapsed one edge to a point.
        const snapshotRooms = [
            { id: 'room-sealed', levelId: 'L0', boundary: { polygon: [
                { x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 },
            ] } },
            { id: 'room-broken', levelId: 'L1', boundary: { polygon: [
                { x: 0, z: 0 }, { x: 0.03, z: 0 }, { x: 0.03, z: 0.0 },
            ] } },
        ];
        const { kept, dropped } = dropDegeneratePolygonRecords(snapshotRooms, (r) => r.boundary?.polygon);

        // The good room loads; the broken one is dropped (would otherwise be a
        // "1 element failed" line in the banner).
        expect(kept.map(r => r.id)).toEqual(['room-sealed']);
        expect(dropped.map(r => r.id)).toEqual(['room-broken']);

        // The caller derives the healed levels from `dropped` so the post-load
        // redetect re-seals L1 from its (join-resolved) walls.
        const healedLevels = new Set(dropped.map(r => r.levelId));
        expect(healedLevels.has('L1')).toBe(true);
        expect(healedLevels.has('L0')).toBe(false);
    });
});
