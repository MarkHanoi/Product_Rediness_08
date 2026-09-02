// §MULTI-PART-EXPLICIT-AREA — the jurisdiction-agnostic multi-part / holed `explicit-area` capability.
//
// WHAT IS BEING PROVED — behaviours, not the implementation restated:
//   §PARTS-ARE-CLIPPED       every published part is clipped to the parcel, not just part 0.
//   §DISJOINT-IS-PROVEN      a part whose bbox misses the parcel is SKIPPED, and counted, not lost.
//   §ANSWER-NOT-SOURCE       the refusal moved from "the SOURCE is multi-part" to "the ANSWER on
//                            THIS parcel is multi-region" — a far narrower and actually-true claim.
//   §HOLES-DECIDED-ON-PARCEL a hole outside the plot is irrelevant; a hole that bites REFUSES.
//   §REFUSE-NEVER-REPAIR     self-intersecting / zero-area / unclosed rings are NAMED and refused.
//
// ⚠ EVERY DEGENERACY TEST ASSERTS THE MUTATION LANDED FIRST. A test that only checks "the broken
// input was rejected" passes just as happily against a validator that rejects everything, which is
// how a component reports success while doing nothing. So each one first pins that the CONTROL
// (the un-mutated ring) is accepted, then that the mutant is refused.
//
// Jurisdiction-agnostic on purpose: the rings here are plain metres. Denmark supplied the measured
// need (19.4% of 13,629 binding byggefelter are multi-part, 2026-07-31) but nothing in this file
// knows about Denmark, and Madrid NZ 1 / Córdoba fondos exercise the same primitive.

import { describe, it, expect } from 'vitest';
import type { ExplicitAreaRule, Pt } from '@pryzm/schemas';
import {
    resolveExplicitAreaRing,
    solveExplicitArea,
    validateRing,
    normaliseRing,
    boundsDisjoint,
    ringBounds,
    type ExplicitAreaPart,
    type ExplicitAreaSource,
} from '../src/index.js';

const RULE: ExplicitAreaRule = { kind: 'explicit-area', ringRef: 'test:footprint:v1' };

/** An axis-aligned rectangle, OPEN (PRYZM's internal convention). */
function rect(x0: number, z0: number, x1: number, z1: number): Pt[] {
    return [
        { x: x0, z: z0 },
        { x: x1, z: z0 },
        { x: x1, z: z1 },
        { x: x0, z: z1 },
    ];
}
/** The same rectangle CLOSED (the GeoJSON linear-ring convention). */
function closedRect(x0: number, z0: number, x1: number, z1: number): Pt[] {
    return [...rect(x0, z0, x1, z1), { x: x0, z: z0 }];
}

/** A 100×100 parcel at the origin — convex, so the Sutherland–Hodgman clip is exact. */
const PARCEL = rect(0, 0, 100, 100);

/**
 * An ASYMMETRIC self-intersecting ring: B→C crosses D→A at (4, 6). |signed area| = 20, so it is
 * genuinely a topology defect and not a zero-area sliver — the shape real broken source data has.
 */
const BOWTIE: Pt[] = [{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 2, z: 8 }, { x: 8, z: 12 }];
/** The same defect at hole scale, sitting inside a 10×10 outer ring. */
const BOWTIE_HOLE: Pt[] = [{ x: 4, z: 4 }, { x: 6, z: 4 }, { x: 4.4, z: 5.6 }, { x: 5.6, z: 6.4 }];

function source(over: Partial<ExplicitAreaSource> = {}): ExplicitAreaSource {
    return { ringRef: RULE.ringRef, footprintParts: [{ outer: rect(0, 0, 60, 100) }], ...over };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§PARTS-ARE-CLIPPED — a multi-part footprint reaches the solve whole', () => {
    it('resolves N parts, not just the first', () => {
        const res = resolveExplicitAreaRing(
            RULE,
            source({ footprintParts: [{ outer: rect(0, 0, 40, 40) }, { outer: rect(500, 500, 540, 540) }] }),
        );
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.footprintParts).toHaveLength(2);
    });

    it('places the ONE part that reaches this parcel, and says the others were checked', () => {
        // 5 parts; only the first overlaps the parcel. This is the shape the Danish register
        // actually publishes: one lokalplan feature holding every building field in the plan area.
        const parts: ExplicitAreaPart[] = [
            { outer: rect(10, 10, 50, 50) },
            { outer: rect(400, 400, 440, 440) },
            { outer: rect(800, 800, 840, 840) },
            { outer: rect(1200, 1200, 1240, 1240) },
            { outer: rect(1600, 1600, 1640, 1640) },
        ];
        const out = solveExplicitArea({ parcelRing: PARCEL, footprintParts: parts });
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.areaM2).toBeCloseTo(1600, 6); // the 40×40 part
        expect(out.partsConsidered).toBe(5);
        // ⚠ The other four were PROVEN irrelevant, not silently dropped.
        expect(out.partsProvablyDisjoint).toBe(4);
    });

    it('⚠ REGRESSION GUARD — a 2-part footprint whose SECOND part is the overlapping one still solves', () => {
        // The old failure mode was "take part 0". If that ever returns, this test fails: part 0 is
        // 400 m away and part 1 is the real answer.
        const out = solveExplicitArea({
            parcelRing: PARCEL,
            footprintParts: [{ outer: rect(400, 400, 440, 440) }, { outer: rect(0, 0, 30, 30) }],
        });
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.areaM2).toBeCloseTo(900, 6);
    });

    it('accepts a single-part source through the legacy `footprintRing` input, unchanged', () => {
        const out = solveExplicitArea({ parcelRing: PARCEL, footprintRing: rect(0, 0, 50, 100) });
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.areaM2).toBeCloseTo(5000, 6);
        expect(out.partsConsidered).toBe(1);
    });

    it('refuses when BOTH footprint forms are supplied — never silently picks one', () => {
        const out = solveExplicitArea({
            parcelRing: PARCEL,
            footprintRing: rect(0, 0, 10, 10),
            footprintParts: [{ outer: rect(0, 0, 90, 90) }],
        });
        expect(out.ok).toBe(false);
        expect(out.ok === false && out.reason).toBe('ambiguous-input');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§DISJOINT-IS-PROVEN — the bbox skip is sound and one-sided', () => {
    it('proves disjointness only when the boxes really do not meet', () => {
        const a = ringBounds(rect(0, 0, 10, 10))!;
        const far = ringBounds(rect(100, 100, 110, 110))!;
        const touching = ringBounds(rect(10, 0, 20, 10))!;
        const overlapping = ringBounds(rect(5, 5, 15, 15))!;
        expect(boundsDisjoint(a, far)).toBe(true);
        // ⚠ Touching and overlapping must BOTH be `false` — a bbox test may only ever PROVE
        // separation. Returning true for the touching case would skip a part that shares an edge
        // with the parcel, which is the commonest alignment case in dense fabric.
        expect(boundsDisjoint(a, touching)).toBe(false);
        expect(boundsDisjoint(a, overlapping)).toBe(false);
    });

    it('does not skip a part whose bbox overlaps but whose polygon does not', () => {
        // An L-shaped-ish arrangement: the bboxes intersect, so the part is NOT skipped; the real
        // clip then finds no overlap. The answer is `no-overlap`, not a fabricated region.
        const out = solveExplicitArea({
            parcelRing: rect(0, 0, 10, 10),
            footprintParts: [{ outer: rect(20, 5, 30, 15) }],
        });
        expect(out.ok).toBe(false);
        expect(out.ok === false && out.reason).toBe('no-overlap');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§ANSWER-NOT-SOURCE — the refusal is about this parcel, not about the source shape', () => {
    it('refuses `multi-region-on-parcel` when two parts BOTH land on the plot', () => {
        const out = solveExplicitArea({
            parcelRing: PARCEL,
            footprintParts: [{ outer: rect(0, 0, 20, 20) }, { outer: rect(60, 60, 80, 80) }],
        });
        expect(out.ok).toBe(false);
        expect(out.ok === false && out.reason).toBe('multi-region-on-parcel');
        expect(out.ok === false && out.detail).toContain('2');
    });

    it('⚠ THE WHOLE POINT — the SAME 2-part source SOLVES on a parcel only one part reaches', () => {
        // Identical source geometry, different parcel. If the implementation still refused on the
        // source's part count, this test would fail — which is exactly what it is here to catch.
        const twoPart: ExplicitAreaPart[] = [{ outer: rect(0, 0, 20, 20) }, { outer: rect(60, 60, 80, 80) }];
        const bothLand = solveExplicitArea({ parcelRing: PARCEL, footprintParts: twoPart });
        expect(bothLand.ok).toBe(false);

        const oneLands = solveExplicitArea({ parcelRing: rect(0, 0, 30, 30), footprintParts: twoPart });
        expect(oneLands.ok).toBe(true);
        expect(oneLands.ok === true && oneLands.areaM2).toBeCloseTo(400, 6);
        expect(oneLands.ok === true && oneLands.partsProvablyDisjoint).toBe(1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§HOLES-DECIDED-ON-PARCEL — a courtyard only matters where it falls', () => {
    const HOLED: ExplicitAreaPart[] = [{ outer: rect(0, 0, 200, 200), holes: [rect(150, 150, 180, 180)] }];

    it('ignores a published hole that lies entirely OUTSIDE this parcel', () => {
        // The parcel is the bottom-left 100×100; the hole is at (150..180). It says nothing here.
        const out = solveExplicitArea({ parcelRing: PARCEL, footprintParts: HOLED });
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.areaM2).toBeCloseTo(10_000, 6);
    });

    it('⚠ CARVES when the SAME hole falls inside the parcel — never drops it (§K1-CARVE)', () => {
        // Same source, a parcel that contains the hole. Dropping the hole would report the full
        // clip (6,400 m²) where the plan permits 6,400 − 900; over-statement is the one direction
        // C58 §1.4 forbids. This used to be the honest `hole-intersects-parcel` REFUSAL; since
        // §K1-POLY-DIFFERENCE the solve carves the hole EXACTLY — outer ∩ parcel = the 80×80
        // corner = 6,400 m², minus the 900 m² courtyard, minus only the inward-biased bridge slit
        // (millimetres wide — see `carveHolesToSimpleRings`). The refusal remains the fallback
        // when the carve itself refuses (asserted in polygonDifference.test.ts).
        const out = solveExplicitArea({ parcelRing: rect(120, 120, 220, 220), footprintParts: HOLED });
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        const exact = 6_400 - 900;
        expect(out.areaM2).toBeLessThanOrEqual(exact + 1e-6); // never a gain — the L-616 direction
        expect(out.areaM2).toBeGreaterThanOrEqual(exact - 1); // and no more than the slit is lost
        expect(out.holesCarved).toBe(1);
        expect(out.carveSlitAreaM2).toBeGreaterThan(0);
        expect(out.areaM2 + out.carveSlitAreaM2).toBeCloseTo(exact, 6);
        // The outer may contain the plot, but a carved hole means "covers the parcel" is false.
        expect(out.footprintCoversParcel).toBe(false);
    });

    it('carries holes through the resolver rather than flattening to the outer ring', () => {
        const res = resolveExplicitAreaRing(RULE, source({ footprintParts: HOLED }));
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.footprintParts[0]!.holes).toHaveLength(1);
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('§REFUSE-NEVER-REPAIR — degenerate geometry is NAMED, not silently fixed', () => {
    // ⚠ EACH TEST ASSERTS THE CONTROL FIRST. Without it, a validator that rejected every ring would
    // pass every one of these — the "reported success while doing nothing" failure, inverted.

    it('detects a SELF-INTERSECTING ring (control: the un-crossed ring is accepted)', () => {
        const good = rect(0, 0, 10, 10);
        expect(validateRing(good)).toBeNull(); // ← the mutation must land against a passing control

        // An ASYMMETRIC bow-tie: edges B→C and D→A cross at (4, 6), and the two lobes do NOT
        // cancel (|signed area| = 20), so this is unambiguously a topology defect rather than a
        // sliver. (A symmetric bow-tie is BOTH zero-area and self-intersecting — see validateRing.)
        expect(validateRing(BOWTIE)).toBe('self-intersecting');
        expect(BOWTIE).not.toEqual(good); // ← the mutation actually changed the input
    });

    it('detects a ZERO-AREA (collinear) ring (control: a real triangle is accepted)', () => {
        expect(validateRing([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 0, z: 10 }])).toBeNull();
        expect(validateRing([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }])).toBe('zero-area');
    });

    it('detects a NON-FINITE coordinate (control: the finite ring is accepted)', () => {
        const good = rect(0, 0, 10, 10);
        expect(validateRing(good)).toBeNull();
        const bad = [...good.slice(0, 3), { x: Number.NaN, z: 10 }];
        expect(validateRing(bad)).toBe('non-finite-coordinate');
    });

    it('detects an UNCLOSED ring ONLY where the contract says rings are closed', () => {
        const closed = closedRect(0, 0, 10, 10);
        const open = rect(0, 0, 10, 10);
        // Control: under the GeoJSON contract the CLOSED ring passes …
        expect(validateRing(closed, { requireClosed: true })).toBeNull();
        // … and the open one is named, not quietly closed for the publisher.
        expect(validateRing(open, { requireClosed: true })).toBe('unclosed');
        // Under PRYZM's internal open-ring convention, the same open ring is perfectly fine.
        expect(validateRing(open)).toBeNull();
    });

    it('treats the closed and open encodings of one rectangle as the SAME polygon', () => {
        // The one normalisation that is an ENCODING change rather than a repair.
        expect(normaliseRing(closedRect(0, 0, 10, 10))).toEqual(rect(0, 0, 10, 10));
    });

    it('refuses a self-intersecting OUTER ring at the resolver, with the defect named', () => {
        const good = rect(0, 0, 10, 10);
        const control = resolveExplicitAreaRing(RULE, source({ footprintParts: [{ outer: good }] }));
        expect(control.ok).toBe(true); // ← control passes, so the refusal below means something

        const res = resolveExplicitAreaRing(RULE, source({ footprintParts: [{ outer: BOWTIE }] }));
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.reason).toBe('invalid-footprint-geometry');
        expect(res.ok === false && res.detail).toContain('self-intersecting');
        // ⚠ And it must say WHY a repair was not attempted — the refusal is the product decision.
        expect(res.ok === false && res.detail).toMatch(/refused rather than repaired/i);
    });

    it('refuses a self-intersecting HOLE rather than ignore it (ignoring INFLATES the area)', () => {
        const holeGood = rect(4, 4, 6, 6);
        const control = resolveExplicitAreaRing(
            RULE,
            source({ footprintParts: [{ outer: rect(0, 0, 10, 10), holes: [holeGood] }] }),
        );
        expect(control.ok).toBe(true);

        const res = resolveExplicitAreaRing(
            RULE,
            source({ footprintParts: [{ outer: rect(0, 0, 10, 10), holes: [BOWTIE_HOLE] }] }),
        );
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.reason).toBe('invalid-footprint-geometry');
        expect(res.ok === false && res.detail).toMatch(/OVER-STATE/);
    });

    it('drops a ZERO-AREA hole (it removes nothing) while still refusing a defective one', () => {
        // A collinear "hole" subtracts no area, so ignoring it changes no answer — the one case
        // where dropping is provably neutral rather than a silent over-statement.
        const res = resolveExplicitAreaRing(
            RULE,
            source({
                footprintParts: [
                    { outer: rect(0, 0, 10, 10), holes: [[{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 1 }]] },
                ],
            }),
        );
        expect(res.ok).toBe(true);
        expect(res.ok === true && res.footprintParts[0]!.holes).toHaveLength(0);
    });

    it('refuses `ambiguous-footprint` when a source sets BOTH forms', () => {
        const res = resolveExplicitAreaRing(
            RULE,
            { ringRef: RULE.ringRef, footprintRing: rect(0, 0, 5, 5), footprintParts: [{ outer: rect(0, 0, 9, 9) }] },
        );
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.reason).toBe('ambiguous-footprint');
    });

    it('refuses `no-footprint` when a source sets NEITHER form', () => {
        const res = resolveExplicitAreaRing(RULE, { ringRef: RULE.ringRef });
        expect(res.ok).toBe(false);
        expect(res.ok === false && res.reason).toBe('no-footprint');
    });
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
describe('determinism (C58 §1.1)', () => {
    it('gives byte-identical output for the same multi-part input', () => {
        const parts: ExplicitAreaPart[] = [{ outer: rect(0, 0, 40, 40) }, { outer: rect(500, 500, 540, 540) }];
        const a = solveExplicitArea({ parcelRing: PARCEL, footprintParts: parts });
        const b = solveExplicitArea({ parcelRing: PARCEL, footprintParts: parts });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
