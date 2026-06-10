// T2.5 / D2.5 — validateFrontage pin tests.

import { describe, expect, it } from 'vitest';
import {
    validateFrontage, rectTouchesPerimeter, rectDistToPerimeter,
} from '../src/workflows/apartmentLayout/dimensions/validateFrontage.js';
import { rectifyConvexQuad } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { RoomType } from '../src/workflows/apartmentLayout/types.js';

// 12×10 rectilinear shell for the tests.
const SHELL = [
    { x: 0, z: 0 }, { x: 12, z: 0 },
    { x: 12, z: 10 }, { x: 0, z: 10 },
];

const r = (id: string, type: RoomType, x0: number, z0: number, x1: number, z1: number, name?: string) =>
    ({ roomId: id, type, ...(name !== undefined ? { name } : {}), rect: { x0, z0, x1, z1 } });

describe('rectTouchesPerimeter', () => {
    it('rect flush with south façade (z0 = 0) returns true', () => {
        expect(rectTouchesPerimeter({ x0: 2, z0: 0, x1: 6, z1: 3 }, SHELL)).toBe(true);
    });

    it('rect flush with west façade (x0 = 0) returns true', () => {
        expect(rectTouchesPerimeter({ x0: 0, z0: 4, x1: 3, z1: 7 }, SHELL)).toBe(true);
    });

    it('fully interior rect returns false', () => {
        expect(rectTouchesPerimeter({ x0: 3, z0: 3, x1: 6, z1: 6 }, SHELL)).toBe(false);
    });

    it('rect touching only at a single point (corner kiss) returns false', () => {
        // x1 = 0 touches the west façade but rect z-range is zero-extent
        // beyond the corner — collinear kiss only.
        expect(rectTouchesPerimeter({ x0: -1, z0: 0, x1: 0, z1: 0.0001 }, SHELL)).toBe(false);
    });

    it('degenerate shell (< 3 vertices) returns false', () => {
        expect(rectTouchesPerimeter({ x0: 0, z0: 0, x1: 1, z1: 1 }, [{ x: 0, z: 0 }, { x: 1, z: 0 }])).toBe(false);
    });
});

describe('T2.5 — validateFrontage', () => {
    it('all required-frontage rooms on the perimeter → admissible + no findings', () => {
        const result = validateFrontage({
            shellPolygon: SHELL,
            rooms: [
                r('liv', 'living',  0, 0, 6, 4),    // south façade
                r('mas', 'master',  6, 0, 12, 5),   // south + east façade
                r('bed', 'bedroom', 0, 5, 4, 10),   // north + west façade
                r('kit', 'kitchen', 8, 5, 12, 10),  // north + east façade
            ],
        });
        expect(result.admissible).toBe(true);
        expect(result.hardFindings).toEqual([]);
        expect(result.softFindings).toEqual([]);
    });

    it('required-frontage room buried inside → HARD-rejects', () => {
        const result = validateFrontage({
            shellPolygon: SHELL,
            rooms: [
                r('liv', 'living',  0, 0, 4, 4),     // on south façade — OK
                r('mas', 'master',  5, 4, 9, 7),     // FULLY INTERIOR — HARD reject
            ],
        });
        expect(result.admissible).toBe(false);
        expect(result.hardFindings).toHaveLength(1);
        expect(result.hardFindings[0]!.roomId).toBe('mas');
        expect(result.hardFindings[0]!.metric).toBe('frontageRequired');
    });

    it('preferred-frontage room buried inside → SOFT penalty, still admissible', () => {
        const result = validateFrontage({
            shellPolygon: SHELL,
            rooms: [
                r('liv', 'living',  0, 0, 6, 4),     // OK
                r('mas', 'master',  6, 0, 12, 5),    // OK
                r('std', 'study',   4, 5, 8, 8),     // FULLY INTERIOR; study is 'preferred'
            ],
        });
        expect(result.admissible).toBe(true);
        expect(result.hardFindings).toEqual([]);
        expect(result.softFindings).toHaveLength(1);
        expect(result.softFindings[0]!.roomId).toBe('std');
        expect(result.softFindings[0]!.metric).toBe('frontagePreferred');
    });

    // §HALL-PERIMETER (ADR-0063) — the hall LEFT the 'none' set (now 'required'); the
    // §STAIR-ROOM-TYPE `stair` core is interior-acceptable ('none').
    it("rooms with frontage 'none' (corridor / stair / utility) are skipped entirely", () => {
        const result = validateFrontage({
            shellPolygon: SHELL,
            rooms: [
                r('cor', 'corridor', 4, 4, 8, 6),    // interior — frontage 'none', not flagged
                r('str', 'stair',    4, 6, 6, 8),    // interior — frontage 'none', not flagged
                r('uti', 'utility',  6, 6, 7, 8),    // interior — frontage 'none', not flagged
            ],
        });
        expect(result.admissible).toBe(true);
        expect(result.hardFindings).toEqual([]);
        expect(result.softFindings).toEqual([]);
    });

    // §HALL-PERIMETER (ADR-0063, founder rule #2) — a FULLY-INTERIOR entrance hall is
    // a HARD finding (the entrance door has no perimeter wall to land on).
    it('a fully-interior hall is HARD-rejected (frontage required)', () => {
        const result = validateFrontage({
            shellPolygon: SHELL,
            rooms: [
                r('hal', 'hall', 4, 6, 6, 8),        // interior — frontage 'required' now
            ],
        });
        expect(result.admissible).toBe(false);
        expect(result.hardFindings).toHaveLength(1);
        expect(result.hardFindings[0]!.roomId).toBe('hal');
        expect(result.hardFindings[0]!.metric).toBe('frontageRequired');
    });

    // §A.21.D55 — DAYLIGHT IN EVERY ROOM. The wet rooms (bathroom / ensuite / wc)
    // were promoted from frontage 'none' → 'preferred': a window in a wet room is
    // desirable (obscure-glazed) where the plate allows, so a fully-interior wet
    // room is now a SOFT penalty (the ranker nudges toward fronting it), but it is
    // NEVER a hard reject — a small internal bath/wc is still a legal last resort.
    it("interior wet rooms (bathroom / ensuite / wc) → SOFT penalty, still admissible", () => {
        const result = validateFrontage({
            shellPolygon: SHELL,
            rooms: [
                r('liv', 'living',  0, 0, 6, 4),     // on façade — OK
                r('bat', 'bathroom', 4, 5, 6, 7),    // FULLY INTERIOR; now 'preferred'
                r('ens', 'ensuite',  6, 5, 8, 7),    // FULLY INTERIOR; now 'preferred'
                r('wc',  'wc',       8, 5, 9, 7),    // FULLY INTERIOR; now 'preferred'
            ],
        });
        expect(result.admissible).toBe(true);              // soft-only, never hard
        expect(result.hardFindings).toEqual([]);
        expect(result.softFindings).toHaveLength(3);
        expect(result.softFindings.every(f => f.metric === 'frontagePreferred')).toBe(true);
        expect(result.softFindings.map(f => f.roomId).sort()).toEqual(['bat', 'ens', 'wc']);
    });

    it('empty room list / degenerate shell → admissible no-op', () => {
        expect(validateFrontage({ shellPolygon: SHELL, rooms: [] }).admissible).toBe(true);
        expect(validateFrontage({
            shellPolygon: [{ x: 0, z: 0 }],
            rooms: [r('liv', 'living', 0, 0, 5, 4)],
        }).admissible).toBe(true);
    });
});

describe('rectDistToPerimeter (§DIAG-FRONTAGE-DIST helper)', () => {
    it('a room flush with a façade has distance 0', () => {
        expect(rectDistToPerimeter({ x0: 2, z0: 0, x1: 6, z1: 3 }, SHELL)).toBeCloseTo(0, 9);
    });
    it('a fully-interior room has the gap to the nearest parallel façade', () => {
        // rect z0=3 above the south façade z=0 (nearest overlapping façade is z=0 or z=10).
        // x-span 4..6 overlaps both south(z=0) and north(z=10) edges → min(3, 4) = 3.
        expect(rectDistToPerimeter({ x0: 4, z0: 3, x1: 6, z1: 6 }, SHELL)).toBeCloseTo(3, 9);
    });
    it('returns +∞ when no axis-aligned edge overlaps the rect span', () => {
        expect(rectDistToPerimeter({ x0: 2, z0: 2, x1: 4, z1: 4 }, [{ x: 0, z: 0 }, { x: 1, z: 0 }])).toBe(Number.POSITIVE_INFINITY);
    });
});

// §FRONTAGE-RECTIFY-FRAME (rotated-plate frontage false-negative cure, 2026-06-10).
// On a freehand CONVEX QUAD, the engine tiles rooms inside `rectifyConvexQuad`'s BBOX
// but the founder-v107 bug tested frontage against the raw sheared-quad edges — which
// are ALL DIAGONAL in the rotated frame, so `rectTouchesPerimeter` skipped every one →
// every required-frontage room false-failed. The cure tests against the SAME rectified
// bbox the rooms were tiled in. These tests pin BOTH the false-negative (raw quad) and
// the cure (rectified quad), and the axis-aligned no-regression identity.
describe('§FRONTAGE-RECTIFY-FRAME — rotated convex-quad frontage', () => {
    // A freehand near-rectangle quad already principal-axis-rotated: NO two opposite
    // edges are exactly parallel to an axis → all four edges are diagonal in this frame.
    const QUAD = [
        { x: -0.2, z: 0.4 }, { x: 14.7, z: -0.3 },
        { x: 15.1, z: 14.8 }, { x: 0.0, z: 14.4 },
    ];
    // A living room tiled flush against the rectified bbox SOUTH edge (z = bbox z0).
    const bbox = rectifyConvexQuad(QUAD);    // = [{x0,z0},{x1,z0},{x1,z1},{x0,z1}] ring
    const z0 = Math.min(...bbox.map(p => p.z));
    const x0 = Math.min(...bbox.map(p => p.x));

    it('rectifyConvexQuad turns the freehand quad into its axis-aligned bbox ring', () => {
        // Proves rectify FIRES (the room-tiling frame) — its edges ARE axis-aligned.
        expect(bbox).toHaveLength(4);
        const allAxis = bbox.every((p, i) => {
            const q = bbox[(i + 1) % 4]!;
            return Math.abs(p.x - q.x) < 1e-6 || Math.abs(p.z - q.z) < 1e-6;
        });
        expect(allAxis).toBe(true);
    });

    it('BUG repro: a perimeter room reads INTERIOR against the raw sheared quad (all diagonal edges)', () => {
        const liv = { x0: x0, z0: z0, x1: x0 + 6, z1: z0 + 4 };   // flush on the bbox south edge
        // Raw quad edges are all diagonal → rectTouchesPerimeter skips them → false.
        expect(rectTouchesPerimeter(liv, QUAD)).toBe(false);
    });

    it('CURE: the same perimeter room reads frontage ✓ against the rectified bbox', () => {
        const liv = { x0: x0, z0: z0, x1: x0 + 6, z1: z0 + 4 };
        expect(rectTouchesPerimeter(liv, bbox)).toBe(true);
        const result = validateFrontage({
            shellPolygon: bbox,
            rooms: [r('liv', 'living', liv.x0, liv.z0, liv.x1, liv.z1)],
        });
        expect(result.admissible).toBe(true);
        expect(result.hardFindings).toEqual([]);
    });

    it('a GENUINELY interior room still HARD-fails against the rectified bbox (no over-relaxation)', () => {
        const z1 = Math.max(...bbox.map(p => p.z));
        const mid = (z0 + z1) / 2;
        const result = validateFrontage({
            shellPolygon: bbox,
            rooms: [r('mas', 'master', x0 + 4, mid - 1, x0 + 8, mid + 1)],   // metres off every edge
        });
        expect(result.admissible).toBe(false);
        expect(result.hardFindings[0]!.roomId).toBe('mas');
    });

    it('axis-aligned shell → rectifyConvexQuad is identity → byte-identical frontage', () => {
        // SHELL is an axis-aligned rectangle; rectify returns the same ring (re-ordered
        // CCW), and frontage against it equals frontage against the raw SHELL.
        const room = r('liv', 'living', 0, 0, 6, 4);
        const viaRaw = validateFrontage({ shellPolygon: SHELL, rooms: [room] });
        const viaRectified = validateFrontage({ shellPolygon: rectifyConvexQuad(SHELL), rooms: [room] });
        expect(viaRectified.admissible).toBe(viaRaw.admissible);
        expect(viaRectified.hardFindings).toEqual(viaRaw.hardFindings);
    });
});
