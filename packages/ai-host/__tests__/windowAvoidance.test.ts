// TGL — window-avoidance snap unit tests.
// Pins the perpendicular-only rule, the clearance band, the deterministic
// minimum-shift, multi-window handling, and the rect-lifting variant.

import { describe, expect, it } from 'vitest';
import {
    snapCoordLinesAwayFromWindows,
    snapRectsAwayFromWindows,
    type WindowSpan,
} from '../src/workflows/apartmentLayout/tgl/windowAvoidance.js';

const CLEAR = 0.1;   // 100 mm default — matches the module's default

// ─── Empty / pass-through ─────────────────────────────────────────────────────

describe('windowAvoidance — pass-through cases', () => {
    it('empty windows array → coords unchanged', () => {
        const { coords, diag } = snapCoordLinesAwayFromWindows(
            { xCuts: [1, 2, 3], zCuts: [5] }, [], CLEAR,
        );
        expect(coords.xCuts).toEqual([1, 2, 3]);
        expect(coords.zCuts).toEqual([5]);
        expect(diag.xShifts).toEqual([]);
        expect(diag.zShifts).toEqual([]);
    });

    it('cut far from every window → unchanged', () => {
        const w: WindowSpan[] = [{ a: { x: 4.0, z: 0 }, b: { x: 5.0, z: 0 } }];
        const { coords } = snapCoordLinesAwayFromWindows({ xCuts: [1.0], zCuts: [] }, w, CLEAR);
        expect(coords.xCuts).toEqual([1.0]);
    });

    it('diagonal window span (neither axis) is ignored', () => {
        const w: WindowSpan[] = [{ a: { x: 0, z: 0 }, b: { x: 5, z: 5 } }];
        const { coords } = snapCoordLinesAwayFromWindows({ xCuts: [2.5], zCuts: [2.5] }, w, CLEAR);
        expect(coords.xCuts).toEqual([2.5]);
        expect(coords.zCuts).toEqual([2.5]);
    });
});

// ─── Perpendicularity rule ────────────────────────────────────────────────────

describe('windowAvoidance — perpendicularity (the core architectural rule)', () => {
    // A vertical partition (constant X) terminates on a HORIZONTAL shell wall
    // (constant Z), so only HORIZONTAL windows can block it. A horizontal window
    // on a vertical shell wall doesn't block X partitions.
    it('horizontal window blocks an X cut at the same X-range', () => {
        const w: WindowSpan[] = [{ a: { x: 4.0, z: 0 }, b: { x: 5.0, z: 0 } }];   // horizontal
        const { coords, diag } = snapCoordLinesAwayFromWindows({ xCuts: [4.5], zCuts: [] }, w, CLEAR);
        expect(coords.xCuts[0]).not.toBe(4.5);
        expect(diag.xShifts).toHaveLength(1);
    });

    it('vertical window does NOT block an X cut (perpendicular axis)', () => {
        const w: WindowSpan[] = [{ a: { x: 5.0, z: 0 }, b: { x: 5.0, z: 1 } }];   // vertical
        const { coords, diag } = snapCoordLinesAwayFromWindows({ xCuts: [5.0], zCuts: [] }, w, CLEAR);
        expect(coords.xCuts).toEqual([5.0]);
        expect(diag.xShifts).toEqual([]);
    });

    it('vertical window blocks a Z cut at the same Z-range', () => {
        const w: WindowSpan[] = [{ a: { x: 0, z: 2.0 }, b: { x: 0, z: 3.0 } }];   // vertical
        const { coords, diag } = snapCoordLinesAwayFromWindows({ xCuts: [], zCuts: [2.5] }, w, CLEAR);
        expect(coords.zCuts[0]).not.toBe(2.5);
        expect(diag.zShifts).toHaveLength(1);
    });

    it('horizontal window does NOT block a Z cut', () => {
        const w: WindowSpan[] = [{ a: { x: 0, z: 2.0 }, b: { x: 1, z: 2.0 } }];   // horizontal
        const { coords } = snapCoordLinesAwayFromWindows({ xCuts: [], zCuts: [2.0] }, w, CLEAR);
        expect(coords.zCuts).toEqual([2.0]);
    });
});

// ─── Clearance band + minimum shift ──────────────────────────────────────────

describe('windowAvoidance — clearance band + nearest-edge snap', () => {
    const w: WindowSpan[] = [{ a: { x: 4.0, z: 0 }, b: { x: 5.0, z: 0 } }];
    // The blocking interval with clearance 0.1 is [3.9, 5.1].

    it('cut inside window range, closer to LO → snaps to LO − clearance', () => {
        const { coords, diag } = snapCoordLinesAwayFromWindows({ xCuts: [4.2], zCuts: [] }, w, CLEAR);
        expect(coords.xCuts[0]).toBeCloseTo(3.9);
        expect(diag.xShifts[0]!.from).toBe(4.2);
        expect(diag.xShifts[0]!.to).toBeCloseTo(3.9);
    });

    it('cut inside window range, closer to HI → snaps to HI + clearance', () => {
        const { coords } = snapCoordLinesAwayFromWindows({ xCuts: [4.8], zCuts: [] }, w, CLEAR);
        expect(coords.xCuts[0]).toBeCloseTo(5.1);
    });

    it('cut at midpoint snaps to ONE of the clearance edges (deterministic, FP-tolerant)', () => {
        // 3.9 and 5.1 are not exactly representable in IEEE-754, so the exact-midpoint
        // tie-break depends on minute FP error. The architectural guarantee is that the
        // result is ONE of the two clearance edges + the result is identical across runs.
        const a = snapCoordLinesAwayFromWindows({ xCuts: [4.5], zCuts: [] }, w, CLEAR);
        const b = snapCoordLinesAwayFromWindows({ xCuts: [4.5], zCuts: [] }, w, CLEAR);
        expect(a.coords.xCuts[0]).toBe(b.coords.xCuts[0]);                  // deterministic
        const snapped = a.coords.xCuts[0]!;
        const onEdge = Math.abs(snapped - 3.9) < 1e-6 || Math.abs(snapped - 5.1) < 1e-6;
        expect(onEdge).toBe(true);
    });

    it('cut at the clearance edge (3.9) is NOT modified — boundaries are inclusive but in-range only', () => {
        const { coords } = snapCoordLinesAwayFromWindows({ xCuts: [3.9], zCuts: [] }, w, CLEAR);
        // The algorithm snaps if c is INSIDE [lo, hi]. At c = lo, snapped = lo (no change).
        expect(coords.xCuts[0]).toBeCloseTo(3.9);
    });

    it('larger clearance widens the blocking interval', () => {
        const { coords } = snapCoordLinesAwayFromWindows({ xCuts: [3.5], zCuts: [] }, w, 1.0);
        // Blocking now [3.0, 6.0] — 3.5 is inside, snaps to 3.0 (nearer).
        expect(coords.xCuts[0]).toBeCloseTo(3.0);
    });
});

// ─── Multi-window handling ────────────────────────────────────────────────────

describe('windowAvoidance — multiple windows', () => {
    it('two non-overlapping windows: each blocks its own range; other cuts unchanged', () => {
        const windows: WindowSpan[] = [
            { a: { x: 1.0, z: 0 }, b: { x: 2.0, z: 0 } },
            { a: { x: 7.0, z: 0 }, b: { x: 8.0, z: 0 } },
        ];
        const { coords, diag } = snapCoordLinesAwayFromWindows({ xCuts: [1.5, 5.0, 7.5], zCuts: [] }, windows, CLEAR);
        expect(coords.xCuts[0]).toBeCloseTo(0.9);    // inside window 1, snap to lo
        expect(coords.xCuts[1]).toBeCloseTo(5.0);    // outside both — unchanged
        expect(coords.xCuts[2]).toBeCloseTo(6.9);    // inside window 2, snap to lo
        expect(diag.xShifts).toHaveLength(2);
    });

    it('cut inside two overlapping windows: snaps to the first interval\'s nearest edge (deterministic)', () => {
        const windows: WindowSpan[] = [
            { a: { x: 4.0, z: 0 }, b: { x: 5.5, z: 0 } },
            { a: { x: 5.0, z: 0 }, b: { x: 6.0, z: 0 } },
        ];
        const { coords } = snapCoordLinesAwayFromWindows({ xCuts: [5.2], zCuts: [] }, windows, CLEAR);
        // First interval (sorted by lo): [3.9, 5.6]. c = 5.2 is inside; closer to 5.6.
        expect(coords.xCuts[0]).toBeCloseTo(5.6);
    });
});

// ─── Rect-lifting variant ────────────────────────────────────────────────────

describe('snapRectsAwayFromWindows — applies snaps back to room rects', () => {
    it('rects sharing a snapped boundary both get the new boundary; others unchanged', () => {
        // Two rects sharing the vertical line x=5: [0,0–5,10] and [5,0–10,10].
        // A horizontal window on the top shell wall at x ∈ [4, 6]. The shared
        // boundary x=5 falls inside [3.9, 6.1] → snaps to nearest edge (6.1).
        const rects = [
            { id: 'A', x0: 0, z0: 0, x1: 5, z1: 10 },
            { id: 'B', x0: 5, z0: 0, x1: 10, z1: 10 },
        ];
        const windows: WindowSpan[] = [{ a: { x: 4, z: 10 }, b: { x: 6, z: 10 } }];
        const { rects: out, diag } = snapRectsAwayFromWindows(rects, windows, CLEAR);
        expect(diag.xShifts).toHaveLength(1);
        expect(out[0]!.x1).toBeCloseTo(6.1);
        expect(out[1]!.x0).toBeCloseTo(6.1);
        // The bbox extents must NOT have been touched.
        expect(out[0]!.x0).toBe(0);
        expect(out[1]!.x1).toBe(10);
        expect(out[0]!.z0).toBe(0);
        expect(out[0]!.z1).toBe(10);
    });

    it('bbox extents (perimeter walls) are never snapped — they ARE the perimeter', () => {
        const rects = [{ id: 'A', x0: 0, z0: 0, x1: 10, z1: 10 }];
        // Window covering the entire top wall — would block X if any X cut existed.
        const windows: WindowSpan[] = [{ a: { x: 0, z: 10 }, b: { x: 10, z: 10 } }];
        const { rects: out, diag } = snapRectsAwayFromWindows(rects, windows, CLEAR);
        expect(out[0]).toEqual({ id: 'A', x0: 0, z0: 0, x1: 10, z1: 10 });
        expect(diag.xShifts).toEqual([]);
        expect(diag.zShifts).toEqual([]);
    });

    it('determinism: same input → byte-identical output', () => {
        const rects = [
            { id: 'A', x0: 0, z0: 0, x1: 5, z1: 5 },
            { id: 'B', x0: 5, z0: 0, x1: 9, z1: 5 },
        ];
        const windows: WindowSpan[] = [{ a: { x: 4.5, z: 5 }, b: { x: 5.5, z: 5 } }];
        const a = snapRectsAwayFromWindows(rects, windows, CLEAR);
        const b = snapRectsAwayFromWindows(rects, windows, CLEAR);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
