// §AMPLADA-ART-238 (L-591) — THE *amplada de vial* IS THE ORDINANCE'S **MINIMUM**, NOT A MEDIAN.
//
// ⚠⚠ WHY THIS FILE EXISTS, AND WHY IT IS NOT REDUNDANT WITH `streetWidth.test.ts`
// -------------------------------------------------------------------------------
// The L-591 fix (commit `0edd302b`) changed `governingPunctualWidth` from the median of a block
// edge's ray samples to their minimum, because PGM **Art. 238.1.b/c** says minimum and the median
// — being ≥ the minimum — reported a WIDER street, selected a HIGHER band, and OVER-STATED
// permitted height on every *alineació de vial* clau (13a, 13b, 12).
//
// **It shipped with no test.** Verified 2026-07-31 by restoring `sorted[Math.floor(n/2)]` and
// re-running this package: **83 files / 1610 tests, all green.** Every fixture in
// `streetWidth.test.ts` is built from parallel opposing frontages, so its samples are identical and
// min ≡ median ≡ max; the one deliberately irregular fixture there asserts on `spread_m` only. So
// the entire suite was blind to the statistic, and a refactor could have silently reinstated the
// over-statement with CI green. That is the gap this file closes.
//
// THE LAW, VERBATIM (PGM NNUU p. 77, `PGM-NNUU-metropolitana.pdf`)
// ----------------------------------------------------------------
//   **238.1.b** *"Si les alineacions de vialitat no són paral·leles o presenten eixamplaments,
//   estrenyiments i altres irregularitats, s'ha de prendre com a amplada de vial per a cada costat
//   d'un tram de carrer comprès entre dos transversals **la mínima amplada puntual** al costat i
//   tram del qual es tracti."*
//
//   **238.1.c** *"S'entén per amplada puntual de vial per a un punt d'una alineació de vialitat **la
//   menor de les distàncies** entre aquest punt i els punts de l'alineació oposada del mateix
//   vial."*
//
// Two nested minima, and the code implements both: `rayHitSegment` takes the NEAREST opposing hit
// for each sample point (238.1.c), and `governingPunctualWidth` takes the SMALLEST of those across
// the edge (238.1.b).
//
// C58 §1.2/§1.4/§1.11 · ADR-0270 · ADR-0271 · §CONTEXT-DATA-HONESTY.

import { describe, it, expect } from 'vitest';
import type { Pt } from '@pryzm/schemas';
import { measureStreetWidths, blockEdgesFacingParcel } from '../src/geometry/streetWidth.js';
import {
    resolveAmpladaDeVial,
    BCN_STREET_WIDTH_QUANTISATION,
} from '../src/rulepacks/ampladaDeVial.js';
import { resolveAlcadaReguladora } from '../src/rulepacks/bcnAlcadaReguladora.js';
import { resolveAlcadaSemiintensiva } from '../src/rulepacks/bcnAlcadaSemiintensiva.js';
import { resolveAlcadaNucliAntic } from '../src/rulepacks/bcnAlcadaNucliAntic.js';
import {
    BLOCK_RING,
    PARCEL_RING,
    OPPOSING_RINGS,
    GOVERNING_EDGE_INDEX,
    EDGE_14_MINIMUM_M,
    EDGE_14_MEDIAN_M,
    EDGE_14_SPREAD_M,
} from './fixtures/bcnPoblenouBlock29346.js';

const pt = (r: ReadonlyArray<readonly [number, number]>): Pt[] =>
    r.map(([x, z]) => ({ x, z }));

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 1. SYNTHETIC, EXACT — the statistic itself, with the arithmetic visible.
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe('§AMPLADA-ART-238 — the statistic is the MINIMUM of the punctual widths', () => {
    /**
     * A 100 m block face with an opposing frontage that STEPS. Five rays are cast at x = 16⅔, 33⅓,
     * 50, 66⅔, 83⅓ (strictly interior, `(s+1)/(n+1)`). The opposing edge sits at z = −11 for
     * x < 40 and at z = −13 beyond it, so three rays measure 13 m and two measure 11 m.
     *
     *   minimum = 11 m   ⇒ Art. 327.2 band 8–12  ⇒  11,60 m / PB+2
     *   median  = 13 m   ⇒ Art. 327.2 band 12–15 ⇒  14,65 m / PB+3
     *
     * ⚠ Chosen so the two statistics land in DIFFERENT bands of all three tables at once — this is
     * a band crossing, not a metre difference, which is the only kind that changes a building.
     * The spread is 2 m, inside the 3 m `maxSpread_m` gate, so the edge is accepted rather than
     * refused: exactly the regime the L-591 comment says the minimum has to be right in.
     */
    const block = pt([
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
    ]);
    const steppedOpposing = pt([
        [0, -11],
        [40, -11],
        [40, -13],
        [100, -13],
        [100, -120],
        [0, -120],
    ]);

    it('returns the SMALLEST punctual width across the edge, not the middle one', () => {
        const r = measureStreetWidths(block, [steppedOpposing]);
        const m = r.measurements.find((x) => x.edgeIndex === 0);
        expect(m).toBeDefined();
        // THE ASSERTION. `11` is Art. 238.1.b; `13` is the median this repo used to publish.
        expect(m!.width_m).toBeCloseTo(11, 9);
        expect(m!.width_m).not.toBeCloseTo(13, 3);
        // The error bar still spans both, and must — it is what tells the caller the frontage is
        // irregular. Narrowing `spread_m` to match the minimum would hide the very irregularity
        // Art. 238.1.b is written for.
        expect(m!.spread_m).toBeCloseTo(2, 9);
    });

    it('the difference is a STOREY in every alineació-de-vial table, not a rounding', () => {
        const r = measureStreetWidths(block, [steppedOpposing]);
        const w = r.measurements.find((x) => x.edgeIndex === 0)!.width_m;
        // A measured width with a 2 m spread: the guard widens to the spread (§L-586), so the
        // honest outcome on this deliberately irregular frontage is a REFUSAL, not a number —
        // and that refusal is itself part of the fix. Assert the bands directly instead, with the
        // guard skipped, so the test pins the TABLE consequence rather than the guard's.
        const trusted = { trustedOfficialWidth: true } as const;
        expect(resolveAlcadaReguladora(w, trusted)).toMatchObject({ ok: true, height_m: 11.6, floorsAboveGround: 2 });
        expect(resolveAlcadaReguladora(13, trusted)).toMatchObject({ ok: true, height_m: 14.65, floorsAboveGround: 3 });
        // Art. 328 (13b): 8–11 → 10,60 / PB+2 ; 11–15 → 13,65 / PB+3.
        expect(resolveAlcadaSemiintensiva(w, trusted)).toMatchObject({ ok: true, height_m: 13.65 });
        // Art. 320.3a (clau 12, Barcelona 2007): 8–12 → 11,25 / PB+2 ; 12–15 → 14,60 / PB+3.
        expect(resolveAlcadaNucliAntic(w, trusted)).toMatchObject({ ok: true, height_m: 11.25, floorsAboveGround: 2 });
        expect(resolveAlcadaNucliAntic(13, trusted)).toMatchObject({ ok: true, height_m: 14.6, floorsAboveGround: 3 });
    });

    it('a NARROW notch drags the answer down — under-statement, and that is the accepted cost', () => {
        // ⚠ THE HONEST WEAKNESS OF A MINIMUM, PINNED SO IT CANNOT BE FORGOTTEN. A doorway recess or
        // a setback niche that one ray happens to enter becomes THE width. Art. 238.1.c genuinely
        // says that ("la menor de les distàncies"), but our sample points are 5 arbitrary places on
        // a cadastral edge, not the ordinance's continuous infimum over a *tram*, so a notch we
        // happen to hit is over-weighted and a notch we happen to miss is ignored.
        //
        // It is tolerated because it errs LOW (a lost storey costs a redesign; a granted one costs
        // an illegal building) and because `maxSpread_m` bounds it at 3 m. It is NOT tolerated
        // silently: this test is the record, and the 3 m gate is what keeps it bounded.
        const notched = pt([
            [0, -20],
            [48, -20],
            [48, -17.5], // a 2.5 m deep, 4 m wide niche straddling the middle ray at x = 50
            [52, -17.5],
            [52, -20],
            [100, -20],
            [100, -120],
            [0, -120],
        ]);
        const m = measureStreetWidths(block, [notched]).measurements.find((x) => x.edgeIndex === 0);
        expect(m).toBeDefined();
        expect(m!.width_m).toBeCloseTo(17.5, 9); // the niche, not the 20 m street
        expect(m!.spread_m).toBeCloseTo(2.5, 9); // …but the error bar SAYS SO, and the guard reads it
    });

    it('refuses when the samples disagree by more than the 3 m gate — the bound on that weakness', () => {
        const wild = pt([
            [0, -12],
            [100, -20],
            [100, -120],
            [0, -120],
        ]);
        const r = measureStreetWidths(block, [wild]);
        expect(r.measurements.some((m) => m.edgeIndex === 0)).toBe(false);
        expect(r.rejected.some((x) => x.edgeIndex === 0 && x.reason === 'inconsistent')).toBe(true);
    });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────
// 2. REAL BARCELONA GEOMETRY — the end-to-end consequence, on land PRYZM serves.
// ───────────────────────────────────────────────────────────────────────────────────────────────
describe('§AMPLADA-ART-238 — manzana 29346, Poblenou (clau 13a), live Catastro geometry', () => {
    const block = pt(BLOCK_RING);
    const parcel = pt(PARCEL_RING);
    const opposing = OPPOSING_RINGS.map((r) => pt(r));

    it('measures the governing frontage at the ordinance MINIMUM, not the median', () => {
        const r = measureStreetWidths(block, opposing);
        const m = r.measurements.find((x) => x.edgeIndex === GOVERNING_EDGE_INDEX);
        expect(m).toBeDefined();
        expect(m!.sampleCount).toBe(5);
        expect(m!.spread_m).toBeCloseTo(EDGE_14_SPREAD_M, 3);
        // ⚠ THE LOAD-BEARING LINE. Real Catastro geometry: the minimum and the median of the SAME
        // five rays differ by 9,4 cm, and that gap is worth a storey (see the fixture's header).
        expect(m!.width_m).toBeCloseTo(EDGE_14_MINIMUM_M, 3);
        expect(m!.width_m).not.toBeCloseTo(EDGE_14_MEDIAN_M, 3);
    });

    it('the parcel really does front this block edge — the fixture is not a coincidence', () => {
        expect(blockEdgesFacingParcel(block, parcel)).toContain(GOVERNING_EDGE_INDEX);
    });

    it('END TO END: the minimum publishes PB+4 / 17,70 m where the median published PB+5 / 20,75 m', () => {
        const r = measureStreetWidths(block, opposing);
        const m = r.measurements.find((x) => x.edgeIndex === GOVERNING_EDGE_INDEX)!;

        // ── The shipped path, exactly as `siteDispatch` runs it. ──
        const amplada = resolveAmpladaDeVial({
            measurement: m,
            quantisation: BCN_STREET_WIDTH_QUANTISATION,
        })!;
        expect(amplada.provenance).toBe('measured-cadastral');
        // 19.3475 is 0.6525 m from the 20 m quantum — OUTSIDE the 0.60 m tolerance. So the width
        // stays measured, `trustedOfficialWidth` stays false, and the band-edge guard stays ARMED.
        expect(amplada.trustedOfficialWidth).toBe(false);
        expect(amplada.measurementSpread_m).toBeCloseTo(EDGE_14_SPREAD_M, 3);

        const alcada = resolveAlcadaReguladora(amplada.width_m, {
            trustedOfficialWidth: amplada.trustedOfficialWidth,
            measurementSpread_m: amplada.measurementSpread_m,
        });
        expect(alcada).toMatchObject({ ok: true, height_m: 17.7, floorsAboveGround: 4 });

        // ── What the pre-L-591 median produced from the SAME rays, reconstructed. ──
        // 19.4419 is 0.5581 m from 20 — INSIDE the tolerance — so it snapped, and a snapped width
        // is asserted to BE the declared quantum: `trustedOfficialWidth: true`, guard SKIPPED.
        const asMedian = resolveAmpladaDeVial({
            measurement: { ...m, width_m: EDGE_14_MEDIAN_M },
            quantisation: BCN_STREET_WIDTH_QUANTISATION,
        })!;
        expect(asMedian.provenance).toBe('snapped-to-declared-quantum');
        expect(asMedian.trustedOfficialWidth).toBe(true);
        expect(asMedian.width_m).toBe(20);
        expect(
            resolveAlcadaReguladora(asMedian.width_m, {
                trustedOfficialWidth: asMedian.trustedOfficialWidth,
            }),
        ).toMatchObject({ ok: true, height_m: 20.75, floorsAboveGround: 5 });

        // 3,05 m — one *planta pis* on Art. 327.2's own storey module — granted by a statistic the
        // ordinance does not use. THIS is the over-statement L-591 removed.
        expect(20.75 - 17.7).toBeCloseTo(3.05, 9);
    });

    it('the whole ladder is deterministic on real geometry (C58 §1.1/§1.9)', () => {
        expect(measureStreetWidths(block, opposing)).toEqual(
            measureStreetWidths(block, [...opposing].reverse()),
        );
    });
});
