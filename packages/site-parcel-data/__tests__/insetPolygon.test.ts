// C58 §6 `check-zoning-inset` — per-edge setback inset geometry.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification } from '@pryzm/schemas';
import { polygonArea, pointInPolygon, pointPolygonEdgeDistance } from '@pryzm/site-validators';
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

    it('does not collapse when the offset folds in SEVERAL places at once (§INSET-LOOP-DECOMPOSE, L-525b)', () => {
        // THE REGRESSION THIS FILE EXISTS FOR AFTER L-525b.
        //
        // The old cleanup was a GREEDY welder: it spliced out a loop the instant the newest edge
        // crossed an earlier kept edge, truncating the output back to the crossing index. With ONE
        // fold that is right. With SEVERAL folds — the normal case for a real cadastral block,
        // which is non-convex with many short edges — each splice cuts into material the previous
        // splices had already kept, and the polygon does not degrade, it COLLAPSES.
        //
        // On the real Barcelona block 02309 (58 vertices, 9 reflex) a 12 m inset came out of it
        // with 2 vertices, which the `< 3` gate reported as `degenerate` = "setbacks consumed the
        // whole block" — for a block that in truth retains 48% free space. That fed
        // `solveBlockDerivedDepth` a ZERO interior free area, so the Art. 242.2 courtyard rule
        // could not be met at ANY depth and Barcelona shipped the ordinance FLOOR (12 m) where the
        // construction yields ~15.7 m. Silent, plausible, and wrong — the exact failure class
        // ADR-0270/0271 exist to prevent.
        //
        // THE FIXTURE IS THE REAL GEOMETRY THAT FAILED, not a synthetic stand-in. It is Catastro
        // masa 02309 (CL Pau Claris 155, Barcelona) — 14 parcels dissolved by
        // `dissolveParcelsToBlockRing`, projected to scene-XZ metres, 58 vertices, 9 reflex,
        // 6,696 m². Synthetic shapes were tried first and did NOT reproduce the collapse: the bug
        // needs many crossings at once, which is a property of real cadastral detail (chamfered
        // Cerdà corners resolve into tight vertex clusters) rather than of a tidy notched polygon.
        // Chasing it with an invented fixture would have produced a test that guards nothing.
        const BLOCK_02309: Pt[] = [
            { x: -10.264, z: -28.678 }, { x: -10.097, z: -28.010 }, { x: -9.679, z: -28.344 },
            { x: -8.844, z: -28.455 }, { x: -8.176, z: -28.344 }, { x: -7.591, z: -27.565 },
            { x: -7.341, z: -27.008 }, { x: -6.840, z: -27.342 }, { x: -5.420, z: -25.895 },
            { x: 5.186, z: -15.208 }, { x: 8.025, z: -12.425 }, { x: 13.286, z: -7.082 },
            { x: 16.292, z: -3.965 }, { x: 27.482, z: 7.278 }, { x: 37.671, z: 17.520 },
            { x: 40.677, z: 20.525 }, { x: 46.522, z: 26.425 }, { x: 49.445, z: 29.431 },
            { x: 51.032, z: 30.989 }, { x: 50.781, z: 31.546 }, { x: 51.032, z: 31.435 },
            { x: 51.700, z: 31.768 }, { x: 52.118, z: 32.436 }, { x: 52.285, z: 33.327 },
            { x: 52.034, z: 34.106 }, { x: 52.619, z: 34.106 }, { x: 52.619, z: 50.470 },
            { x: 52.034, z: 50.581 }, { x: 52.368, z: 51.249 }, { x: 52.452, z: 51.806 },
            { x: 52.201, z: 52.474 }, { x: 51.617, z: 53.030 }, { x: 51.199, z: 53.253 },
            { x: 50.781, z: 53.364 }, { x: 51.199, z: 53.587 }, { x: 39.174, z: 65.610 },
            { x: 28.652, z: 75.962 }, { x: 19.633, z: 84.979 }, { x: -0.243, z: 64.942 },
            { x: -2.163, z: 63.049 }, { x: -15.358, z: 49.691 }, { x: -26.381, z: 38.559 },
            { x: -37.488, z: 27.427 }, { x: -42.331, z: 22.529 }, { x: -46.006, z: 18.855 },
            { x: -60.787, z: 3.939 }, { x: -51.851, z: -5.078 }, { x: -45.922, z: -11.090 },
            { x: -40.494, z: -16.544 }, { x: -31.224, z: -25.784 }, { x: -29.888, z: -27.120 },
            { x: -29.471, z: -26.786 }, { x: -29.137, z: -27.787 }, { x: -28.636, z: -28.233 },
            { x: -27.884, z: -28.567 }, { x: -27.049, z: -28.678 }, { x: -26.214, z: -28.344 },
            { x: -26.130, z: -28.789 },
        ];
        const cls: ParcelEdgeClassification[] = BLOCK_02309.map(() => 'unclassified');
        const blockArea = polygonArea(BLOCK_02309);
        expect(blockArea).toBeCloseTo(6696, 0);

        // THE EXACT PRODUCTION CASE. 12 m is the Art. 242 ordinance floor the pack ships, and it
        // is where the old code returned `degenerate` ⇒ zero interior free area ⇒ a floored depth.
        const atFloor = insetPolygonPerEdge(BLOCK_02309, cls, uniform(12));
        expect(atFloor.degenerate).toBe(false);
        // ⚠ THIS ASSERTION WAS `toBeCloseTo(2922, -1)` AND THAT NUMBER WAS NOT GROUND TRUTH — it
        // was whatever the mitre-plus-clamp implementation happened to return, frozen into a test.
        // The INDEPENDENT grid-rasterisation oracle (`scratchpad/probe-l581-grid-oracle.mts`, a
        // different algorithm: keep every cell whose distance to the boundary is ≥ 12 m) puts the
        // true uniform 12 m inset at 3,219 m² on a 0.5 m grid and 3,227 m² on a 0.25 m grid — so
        // 2,922 was 9.5% UNDER truth, and pinning it to ±5 m² would have blocked any construction
        // that got closer. §INSET-ROUND-JOIN (L-586) returns 3,196 m², i.e. 99.0% of truth and
        // still on the conservative side of it.
        //
        // SO THE ASSERTION IS NOW STATED AGAINST THE ORACLE RATHER THAN AGAINST AN IMPLEMENTATION:
        // never ABOVE the true erosion (C58 §1.4 — over-stating buildable area is the failure that
        // is not allowed), and never so far below it that "conservative" has quietly become
        // "returns nothing", which is exactly how L-525b shipped a floored depth. A test that only
        // fixes a value cannot tell those two apart; this one can.
        const ORACLE_12M_M2 = 3227; // grid 0.25 m, independent algorithm
        expect(polygonArea(atFloor.polygon)).toBeLessThanOrEqual(ORACLE_12M_M2);
        expect(polygonArea(atFloor.polygon)).toBeGreaterThan(ORACLE_12M_M2 * 0.95);
        expect(polygonArea(atFloor.polygon) / blockArea).toBeGreaterThan(0.30);

        // An inset is an EROSION, so it must live inside the block — a fold that escaped would be
        // a WRONG envelope rather than a missing one, which is the worse failure.
        for (const p of atFloor.polygon) expect(pointInPolygon(p, BLOCK_02309)).toBe(true);

        // MONOTONICITY is the property the collapse destroyed: it did not shrink the area, it
        // discontinuously zeroed it at d = 8 and stayed zero for every deeper setback. Deeper
        // setbacks must never yield MORE area, and must not fall off a cliff while the block
        // plainly still has room.
        let previous = blockArea;
        for (const d of [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 25]) {
            const step = insetPolygonPerEdge(BLOCK_02309, cls, uniform(d));
            const a = step.degenerate ? 0 : polygonArea(step.polygon);
            expect(a).toBeLessThanOrEqual(previous + 1e-9);
            // The block is ~82 m across, so every one of these setbacks leaves real material.
            expect(a).toBeGreaterThan(0);
            previous = a;
        }
    });

    it('gives a battle-axe / flag lot a buildable area at the DEFAULT setbacks (L-529 blast radius)', () => {
        // NOT a Barcelona case, and that is the point. The L-529 blast-radius sweep (684 cases,
        // old-vs-new) found 21 shapes the OLD cleanup wrongly called `degenerate`. This is the one
        // that matters commercially: a FLAG (battle-axe) lot — a common real parcel worldwide, a
        // narrow access neck onto a wider rear body — collapsed at the **default pack's own
        // 3 / 1.5 / 3 m setbacks**, in EVERY jurisdiction, not just Spain. The user was told the
        // plot had no buildable area at all.
        //
        // The neck is where it broke: 8 m wide, so a 3 m inset from both sides leaves 2 m and the
        // offset folds there while the body is still comfortably open. One fold in the neck used
        // to take the whole polygon with it.
        const flagLot: Pt[] = [
            { x: 0, z: 0 }, { x: 40, z: 0 }, { x: 40, z: 6 }, { x: 22, z: 6 },
            { x: 22, z: 40 }, { x: 14, z: 40 }, { x: 14, z: 6 }, { x: 0, z: 6 },
        ];
        const cls: ParcelEdgeClassification[] = flagLot.map(() => 'unclassified');

        for (const setbacks of [
            { front: 3, side: 3, rear: 3, unclassified: 3 },
            { front: 3, side: 1.5, rear: 3, unclassified: 3 }, // the estimated-default / DK pack
        ]) {
            const res = insetPolygonPerEdge(flagLot, cls, setbacks);
            expect(res.degenerate).toBe(false);
            expect(polygonArea(res.polygon)).toBeGreaterThan(0);
            // The erosion must still be sound — inside the lot, and smaller than it.
            expect(polygonArea(res.polygon)).toBeLessThan(polygonArea(flagLot));
            for (const p of res.polygon) expect(pointInPolygon(p, flagLot)).toBe(true);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // §INSET-ROUND-JOIN (L-586) — the mitre blow-up, and the conservatism that replaced it.
    // ─────────────────────────────────────────────────────────────────────────

    it('does not throw the corner 630 m away when a big setback meets a zero one across a 1° turn', () => {
        // THE ROOT CAUSE OF L-586, ISOLATED. A mitre vertex sits at |M − V| = |a − b| / sin θ. Art.
        // 242 asks for {front: 11, side: 0} — the Barcelona party-wall (*mitgera*) call — and a
        // DISSOLVED cadastral ring turns by less than 1° at half its vertices. 11 / sin(1°) = 630 m,
        // from a legal input on correct data. No amount of downstream repair can recover from that;
        // the construction has to not produce it. Here the erosion must instead round the corner at
        // radius 11 and land back ON the zero-setback edge.
        const ring: Pt[] = [
            { x: 0, z: 0 },
            { x: 60, z: 0 },              // front (setback 11)
            { x: 120, z: 1.047 },         // ← a 1.0° turn: the mitre would fly ~630 m
            { x: 120, z: 80 },
            { x: 0, z: 80 },
        ];
        const cls: ParcelEdgeClassification[] = ['front', 'side', 'side', 'side', 'side'];
        const res = insetPolygonPerEdge(ring, cls, { front: 11, side: 0, rear: 0, unclassified: 0 });
        expect(res.degenerate).toBe(false);
        // Nothing may leave the parcel. ⚠ A ZERO setback puts the inset exactly ON those edges, and
        // `pointInPolygon` is half-open, so "on the boundary" tests inside on one side and outside
        // on the other — the L-462 asymmetry. Assert containment the way the production soundness
        // gate does, boundary-tolerantly, or this test would encode the very bug L-462 fixed.
        for (const p of res.polygon) {
            expect(pointInPolygon(p, ring) || pointPolygonEdgeDistance(p, ring) <= 1e-3).toBe(true);
        }
        const maxX = Math.max(...res.polygon.map((p) => p.x));
        expect(maxX).toBeLessThanOrEqual(121); // 630 m would fail here by two orders of magnitude
        // Only the 11 m front strip is removed from a 120 × 80 plot ⇒ ~8,940 m² of ~9,600 m².
        expect(polygonArea(res.polygon)).toBeGreaterThan(8000);
        expect(polygonArea(res.polygon)).toBeLessThan(polygonArea(ring));
    });

    it('never reports MORE buildable area than the erosion actually contains (C58 §1.4)', () => {
        // THE ASSERTION THAT MATTERS LEGALLY, and the one no soundness count can make. The old
        // gates only compared the inset to the PARCEL, so a fold could inflate the inset far past
        // the true erosion and still pass: measured on the 65-block Eixample fixture, the
        // pre-L-586 code over-stated on 31 of them, the worst by 2,577 m² (ratio 1.65).
        //
        // This checks the DEFINITION directly — sample the parcel and count the points that are
        // genuinely ≥ s from every edge — so it is independent of how the ring was built.
        const cls: ParcelEdgeClassification[] = IRREGULAR9_CLS;
        const res = insetPolygonPerEdge(IRREGULAR9, cls, PER_EDGE);
        expect(res.degenerate).toBe(false);
        const setbackOf = (i: number): number =>
            cls[i] === 'front' ? PER_EDGE.front : cls[i] === 'rear' ? PER_EDGE.rear
                : cls[i] === 'side' ? PER_EDGE.side : PER_EDGE.unclassified;
        const segDist = (p: Pt, a: Pt, b: Pt): number => {
            const vx = b.x - a.x, vz = b.z - a.z, l2 = vx * vx + vz * vz;
            const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / l2));
            return Math.hypot(p.x - (a.x + t * vx), p.z - (a.z + t * vz));
        };
        const STEP = 0.25;
        let cells = 0;
        for (let x = -3; x <= 42; x += STEP) {
            for (let z = -1; z <= 42; z += STEP) {
                const p = { x, z };
                if (!pointInPolygon(p, IRREGULAR9)) continue;
                let ok = true;
                for (let i = 0; i < IRREGULAR9.length; i++) {
                    if (segDist(p, IRREGULAR9[i]!, IRREGULAR9[(i + 1) % IRREGULAR9.length]!) < setbackOf(i)) {
                        ok = false;
                        break;
                    }
                }
                if (ok) cells++;
            }
        }
        const oracle = cells * STEP * STEP;
        // Grid centre-sampling noise is ~perimeter × STEP / 2; allow it, then demand conservatism.
        expect(polygonArea(res.polygon)).toBeLessThanOrEqual(oracle + 2 * Math.sqrt(oracle) * STEP);
        // …and demand it has not achieved conservatism by returning almost nothing.
        expect(polygonArea(res.polygon)).toBeGreaterThan(oracle * 0.90);
    });

    it('is byte-deterministic — the same input gives the identical ring, twice (C58 §1.1)', () => {
        // The arcs are generated by chord-midpoint bisection precisely so that no transcendental
        // (`Math.sin`/`Math.cos`, implementation-defined in ECMA-262) touches a number we publish
        // as a legal *profunditat edificable*.
        const a = insetPolygonPerEdge(IRREGULAR9, IRREGULAR9_CLS, PER_EDGE);
        const b = insetPolygonPerEdge(IRREGULAR9, IRREGULAR9_CLS, PER_EDGE);
        expect(a.polygon).toEqual(b.polygon);
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
