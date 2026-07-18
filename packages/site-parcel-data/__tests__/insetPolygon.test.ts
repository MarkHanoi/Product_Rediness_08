// C58 §6 `check-zoning-inset` — per-edge setback inset geometry.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonArea, pointInPolygon } from '@pryzm/site-validators';
import { insetPolygonPerEdge } from '../src/geometry/insetPolygon.js';

// 40 m × 20 m rectangle, CCW in scene-XZ.
const RECT: Pt[] = [
    { x: 0, z: 0 },
    { x: 40, z: 0 },
    { x: 40, z: 20 },
    { x: 0, z: 20 },
];

const uniform = (m: number) => ({ front: m, side: m, rear: m, unclassified: m });
const allUnclassified: ParcelEdgeClassification[] = ['unclassified', 'unclassified', 'unclassified', 'unclassified'];

describe('insetPolygonPerEdge — uniform inset on a rectangle', () => {
    it('shrinks a rectangle by a uniform setback to the expected inner area', () => {
        const u = 4;
        const res = insetPolygonPerEdge(RECT, allUnclassified, uniform(u));
        expect(res.degenerate).toBe(false);
        expect(res.polygon.length).toBe(4);
        // inner rect = (40 - 2u) × (20 - 2u) = 32 × 12 = 384 m².
        expect(polygonArea(res.polygon)).toBeCloseTo(384, 6);
    });

    it('produces a concentric inner rectangle (corners inset by u on both axes)', () => {
        const u = 5;
        const res = insetPolygonPerEdge(RECT, allUnclassified, uniform(u));
        const xs = res.polygon.map((p) => p.x).sort((a, b) => a - b);
        const zs = res.polygon.map((p) => p.z).sort((a, b) => a - b);
        expect(xs[0]).toBeCloseTo(5, 6);
        expect(xs[3]).toBeCloseTo(35, 6);
        expect(zs[0]).toBeCloseTo(5, 6);
        expect(zs[3]).toBeCloseTo(15, 6);
    });
});

describe('insetPolygonPerEdge — per-edge setbacks (front/side/rear honoured)', () => {
    it('offsets each classified edge by its own distance', () => {
        // Edges: 0=(0,0)->(40,0) front; 1=(40,0)->(40,20) side;
        //        2=(40,20)->(0,20) rear; 3=(0,20)->(0,0) side.
        const cls: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];
        const res = insetPolygonPerEdge(RECT, cls, {
            front: 5,
            side: 3,
            rear: 6,
            unclassified: 0,
        });
        expect(res.degenerate).toBe(false);
        // x range shrinks by side (3) each: [3, 37]. z range: front(5)..rear inset.
        const xs = res.polygon.map((p) => p.x).sort((a, b) => a - b);
        const zs = res.polygon.map((p) => p.z).sort((a, b) => a - b);
        expect(xs[0]).toBeCloseTo(3, 6);
        expect(xs[3]).toBeCloseTo(37, 6);
        // front edge (z=0) moves inward +5; rear edge (z=20) moves inward -6.
        expect(zs[0]).toBeCloseTo(5, 6);
        expect(zs[3]).toBeCloseTo(14, 6);
        // area = width(34) × depth(9) = 306.
        expect(polygonArea(res.polygon)).toBeCloseTo(306, 6);
    });
});

describe('insetPolygonPerEdge — degenerate over-inset', () => {
    it('returns degenerate + empty when setbacks exceed half the width', () => {
        // 6 m square, uniform 4 m → 2u = 8 > 6 → nothing left.
        const sq: Pt[] = [
            { x: 0, z: 0 },
            { x: 6, z: 0 },
            { x: 6, z: 6 },
            { x: 0, z: 6 },
        ];
        const res = insetPolygonPerEdge(sq, allUnclassified, uniform(4));
        expect(res.degenerate).toBe(true);
        expect(res.polygon).toEqual([]);
    });

    it('handles a sub-3-vertex polygon without crashing', () => {
        const res = insetPolygonPerEdge([{ x: 0, z: 0 }, { x: 1, z: 1 }], allUnclassified, uniform(1));
        expect(res.degenerate).toBe(true);
    });
});

describe('insetPolygonPerEdge — winding independence', () => {
    it('gives the same inner area for a CW parcel as its CCW twin', () => {
        const cw = [...RECT].reverse();
        const a = insetPolygonPerEdge(RECT, allUnclassified, uniform(4));
        const b = insetPolygonPerEdge(cw, allUnclassified, uniform(4));
        expect(b.degenerate).toBe(false);
        expect(polygonArea(b.polygon)).toBeCloseTo(polygonArea(a.polygon), 6);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// L-403 — real drawn parcels (irregular, non-orthogonal, non-convex).
//
// Regression for the live founder bug: a large valid IRREGULAR ~41 m plot logged
// `status=degenerate inset=0.0m²` under the first-slice offset. The failure was a
// short edge (flanked by larger front/rear setbacks) collapsing to a miter join,
// which the old over-inset heuristics mis-read as "the whole parcel is consumed",
// AND the result was winding-dependent (CW ≠ CCW). These assert a real inset in
// BOTH windings and prove winding-independence on a NON-convex shape.
// ─────────────────────────────────────────────────────────────────────────────

// An irregular simple 9-vertex ~41 m × 41 m plot (area ≈ 1386 m²) with a SHORT
// ~5 m edge and TWO reflex (concave) vertices — the founder's plot class. Edge
// lengths ≈ [41.4, 16.2, 5.4, 18.8, 18.0, 18.6, 6.3, 16.5, 14.1] m.
const IRREGULAR9: Pt[] = [
    { x: 0, z: 0 },
    { x: 41.4, z: 2 },
    { x: 39, z: 18 },
    { x: 41, z: 23 }, // start of the short ~5.4 m edge
    { x: 33, z: 40 },
    { x: 15, z: 41 },
    { x: 8, z: 24 }, // reflex
    { x: 2, z: 30 },
    { x: -2, z: 14 }, // reflex
];
// front / side / rear per-edge classes (as classifyEdges emits: one front, one
// rear, rest side) — the setbacks are NON-uniform, which is what tripped the
// short-edge collapse in the first slice.
const IRREGULAR9_CLS: ParcelEdgeClassification[] = [
    'front', 'side', 'side', 'side', 'rear', 'side', 'side', 'side', 'side',
];
const PER_EDGE = { front: 5, side: 3, rear: 6, unclassified: 5 };

describe('insetPolygonPerEdge — real irregular non-convex parcels (L-403)', () => {
    it('yields a real non-degenerate inset on a large irregular ~41 m plot (NOT degenerate=0)', () => {
        const res = insetPolygonPerEdge(IRREGULAR9, IRREGULAR9_CLS, PER_EDGE);
        expect(res.degenerate).toBe(false);
        const area = polygonArea(res.polygon);
        // Setbacks of 3–6 m on a ~1386 m² plot must leave hundreds of m², never 0.
        expect(area).toBeGreaterThan(500);
        expect(area).toBeLessThan(polygonArea(IRREGULAR9)); // an erosion shrinks
    });

    it('is winding-INDEPENDENT on the irregular plot (the founder regression)', () => {
        const ccw = insetPolygonPerEdge(IRREGULAR9, IRREGULAR9_CLS, PER_EDGE);
        // Reverse the ring AND its per-edge classes so each setback stays with its edge.
        const cwRing = [...IRREGULAR9].reverse();
        const cwCls = [...IRREGULAR9_CLS].reverse();
        const cw = insetPolygonPerEdge(cwRing, cwCls, PER_EDGE);
        expect(cw.degenerate).toBe(false);
        expect(ccw.degenerate).toBe(false);
        expect(polygonArea(cw.polygon)).toBeCloseTo(polygonArea(ccw.polygon), 6);
    });

    it('every inset vertex stays inside the parcel (soundness — an erosion never escapes)', () => {
        const res = insetPolygonPerEdge(IRREGULAR9, IRREGULAR9_CLS, PER_EDGE);
        expect(res.degenerate).toBe(false);
        for (const v of res.polygon) {
            expect(pointInPolygon(v, IRREGULAR9)).toBe(true);
        }
    });

    it('insets a simple CONCAVE polygon (slot cut into one side) without collapsing', () => {
        // 41×41 with a rectangular slot on the right → two reflex vertices.
        const concave: Pt[] = [
            { x: 0, z: 0 }, { x: 41, z: 0 }, { x: 41, z: 16 }, { x: 30, z: 16 },
            { x: 30, z: 30 }, { x: 41, z: 30 }, { x: 41, z: 41 }, { x: 5, z: 41 }, { x: 0, z: 20 },
        ];
        const cls: ParcelEdgeClassification[] = concave.map(() => 'unclassified');
        const res = insetPolygonPerEdge(concave, cls, uniform(4));
        expect(res.degenerate).toBe(false);
        expect(polygonArea(res.polygon)).toBeGreaterThan(400);
        // winding twin agrees
        const cw = insetPolygonPerEdge([...concave].reverse(), cls, uniform(4));
        expect(polygonArea(cw.polygon)).toBeCloseTo(polygonArea(res.polygon), 6);
    });

    it('a SHORT edge flanked by larger setbacks collapses to a miter join, not a global degenerate', () => {
        // Rectangle with the top-right corner replaced by a short 4 m bevel edge.
        const beveled: Pt[] = [
            { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 33 },
            { x: 37, z: 36 }, // short bevel ~4.2 m
            { x: 0, z: 36 },
        ];
        // Give the two edges around the bevel a large setback vs the bevel itself.
        const cls: ParcelEdgeClassification[] = ['side', 'rear', 'front', 'side', 'side'];
        const res = insetPolygonPerEdge(beveled, cls, { front: 2, side: 5, rear: 6, unclassified: 5 });
        expect(res.degenerate).toBe(false);
        expect(polygonArea(res.polygon)).toBeGreaterThan(200);
    });
});

describe('insetPolygonPerEdge — degenerate-input hardening (L-403)', () => {
    it('does NOT crash and matches the open ring when a closing duplicate vertex is present', () => {
        // A committed/geo ring can carry a first==last duplicate → a zero-length edge.
        const open: Pt[] = [
            { x: 0, z: 0 }, { x: 41, z: 0 }, { x: 41, z: 16 }, { x: 30, z: 16 },
            { x: 30, z: 30 }, { x: 41, z: 30 }, { x: 41, z: 41 }, { x: 5, z: 41 }, { x: 0, z: 20 },
        ];
        const closed = [...open, { x: 0, z: 0 }]; // duplicate closing vertex
        const clsOpen: ParcelEdgeClassification[] = open.map(() => 'unclassified');
        const clsClosed: ParcelEdgeClassification[] = closed.map(() => 'unclassified');
        const a = insetPolygonPerEdge(open, clsOpen, uniform(4));
        const b = insetPolygonPerEdge(closed, clsClosed, uniform(4)); // must not throw
        expect(b.degenerate).toBe(false);
        expect(polygonArea(b.polygon)).toBeCloseTo(polygonArea(a.polygon), 6);
    });

    it('folds interior coincident/duplicate vertices instead of emitting a zero-length edge', () => {
        const dup: Pt[] = [
            { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 0 }, // repeated vertex
            { x: 40, z: 40 }, { x: 0, z: 40 },
        ];
        const cls: ParcelEdgeClassification[] = dup.map(() => 'unclassified');
        const res = insetPolygonPerEdge(dup, cls, uniform(5));
        expect(res.degenerate).toBe(false);
        // Same as the clean 40×40 square inset by 5 → 30×30 = 900.
        expect(polygonArea(res.polygon)).toBeCloseTo(900, 4);
    });
});
