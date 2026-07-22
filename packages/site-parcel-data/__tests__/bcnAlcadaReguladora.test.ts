// L-525a — PGM Art. 327.2 *alçada reguladora* resolution.
//
// The thing under test decides how TALL a building may be on the densest land in Spain, from a
// STEPPED table. So the assertions target the failure that matters — picking the wrong STEP —
// rather than merely checking a lookup returns something:
//   • each band returns its own legal figure (a shifted table would pass a spot-check);
//   • the boundary is half-open the way the ordinance reads it (20.00 m is PB+5, not PB+4);
//   • a MEASURED width near a band edge REFUSES, because there the measurement noise, not the
//     measurement, would be choosing a whole storey;
//   • an OFFICIAL width is allowed to sit on that same edge, because it is exact by definition.

import { describe, it, expect } from 'vitest';
import {
    resolveAlcadaReguladora,
    BCN_ALCADA_REGULADORA_TABLE,
    EIXAMPLE_CORNICE_INCREMENT_MAX_M,
    BAND_EDGE_GUARD_M,
    effectiveBandEdgeGuard_m,
} from '../src/rulepacks/bcnAlcadaReguladora.js';

describe('L-525a — Art. 327.2 alçada reguladora table', () => {
    it('covers the width axis with no gap and no overlap', () => {
        // A gap would silently fall through to the top band; an overlap would make the answer
        // depend on iteration order. Either is a wrong building height, not a lint issue.
        for (let i = 1; i < BCN_ALCADA_REGULADORA_TABLE.length; i++) {
            expect(BCN_ALCADA_REGULADORA_TABLE[i]!.minWidth_m).toBe(
                BCN_ALCADA_REGULADORA_TABLE[i - 1]!.maxWidth_m,
            );
        }
        expect(BCN_ALCADA_REGULADORA_TABLE[0]!.minWidth_m).toBe(0);
        expect(
            BCN_ALCADA_REGULADORA_TABLE[BCN_ALCADA_REGULADORA_TABLE.length - 1]!.maxWidth_m,
        ).toBe(Infinity);
    });

    it('is monotonic — a wider street never permits a lower building', () => {
        for (let i = 1; i < BCN_ALCADA_REGULADORA_TABLE.length; i++) {
            expect(BCN_ALCADA_REGULADORA_TABLE[i]!.height_m).toBeGreaterThan(
                BCN_ALCADA_REGULADORA_TABLE[i - 1]!.height_m,
            );
            expect(BCN_ALCADA_REGULADORA_TABLE[i]!.floorsAboveGround).toBeGreaterThan(
                BCN_ALCADA_REGULADORA_TABLE[i - 1]!.floorsAboveGround,
            );
        }
    });

    // Mid-band widths, one per row: verifies the table VALUES, not just its shape.
    it.each([
        [6, 8.55, 1],
        [10, 11.6, 2],
        [13.5, 14.65, 3],
        [17, 17.7, 4],
        [25, 20.75, 5],
        [40, 23.8, 6],
    ])('a %s m street ⇒ %s m (PB+%s)', (width, height, floors) => {
        const r = resolveAlcadaReguladora(width);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.height_m).toBe(height);
            expect(r.floorsAboveGround).toBe(floors);
        }
    });

    it('treats the band boundary as half-open — 20.00 m official is PB+5, not PB+4', () => {
        // The Eixample standard street. Getting this inclusive/exclusive choice backwards costs a
        // whole storey on the most common case in the city.
        const r = resolveAlcadaReguladora(20, { trustedOfficialWidth: true });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.floorsAboveGround).toBe(5);
            expect(r.height_m).toBe(20.75);
        }
    });

    it('surfaces the UNCERTIFIED 20.75-vs-22.40 alternative on PB+5 only (L-528)', () => {
        // The open question must be visible to the caller on the answers it actually affects,
        // and absent everywhere else — a blanket caveat would be noise and get ignored.
        const pb5 = resolveAlcadaReguladora(20, { trustedOfficialWidth: true });
        expect(pb5.ok && pb5.corniceIncrementMax_m).toBe(EIXAMPLE_CORNICE_INCREMENT_MAX_M);
        const pb3 = resolveAlcadaReguladora(13.5);
        // §L-583 — Art. 21 is written against the ARM, not a storey count, so the increment is
        // available on EVERY band. The old `=== 5` gate was an artefact of the 22.40 confusion.
        expect(pb3.ok && pb3.corniceIncrementMax_m).toBe(EIXAMPLE_CORNICE_INCREMENT_MAX_M);
    });
});

describe('L-525a — refusing to let measurement noise choose a storey band', () => {
    // THE CASE THIS GUARD EXISTS FOR. CL Pau Claris 155 — our flagship demo parcel — has a nominal
    // official width of exactly 20.00 m, i.e. a band EDGE. Measured 19.99 ⇒ 17.70 m; measured
    // 20.00 ⇒ 20.75 m. A centimetre of cadastral noise moves the building a full storey, and
    // Barcelona publishes no machine-readable official width to appeal to (probed 2026-07-21).
    it('REFUSES a measured width sitting on a band edge, and says what it straddles', () => {
        const r = resolveAlcadaReguladora(20.0);
        expect(r.ok).toBe(false);
        if (!r.ok) {
            expect(r.reason).toBe('band-edge');
            expect(r.straddles).toEqual([17.7, 20.75]);
        }
    });

    it('refuses ANYWHERE within the guard band, on both sides of the edge', () => {
        for (const w of [20 - BAND_EDGE_GUARD_M + 0.01, 19.9, 20.1, 20 + BAND_EDGE_GUARD_M - 0.01]) {
            const r = resolveAlcadaReguladora(w);
            expect(r.ok, `measured ${w} m must not decide a storey band`).toBe(false);
        }
    });

    it('ACCEPTS the same edge width when it is the OFFICIAL declared figure', () => {
        // An *ample oficial* is exact by definition, so sitting on a boundary is legitimate — the
        // guard exists for measurement error, and there is none to guard against here.
        const r = resolveAlcadaReguladora(20.0, { trustedOfficialWidth: true });
        expect(r.ok).toBe(true);
    });

    it('answers normally once the measured width is clear of any edge', () => {
        const r = resolveAlcadaReguladora(25);
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.height_m).toBe(20.75);
    });

    it.each([[0], [-5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
        'returns bad-input for %s rather than throwing',
        (w) => {
            const r = resolveAlcadaReguladora(w as number);
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe('bad-input');
        },
    );

    it('is deterministic (C58 §1.1)', () => {
        expect(resolveAlcadaReguladora(25)).toEqual(resolveAlcadaReguladora(25));
    });
});

describe('§L-586 — 0.5 m is a FLOOR, not the whole error bar', () => {
    // THE LIVE CASE. PS Gràcia 66 measured 19.15 m with a ray spread of 0.87 m — its own samples
    // reach 20.02 m, ACROSS the 20 m band edge — and shipped 17.70 m (PB+4) because 19.15 ± 0.5
    // stays inside the 15–20 band. The guard was satisfied by a constant that describes a
    // DIFFERENT error (measured standing in for declared) than the one actually present.
    it('REFUSES when the measurement\'s own spread straddles a band edge the constant clears', () => {
        const naive = resolveAlcadaReguladora(19.152);
        expect(naive.ok, 'the 0.5 m constant alone accepts this').toBe(true);

        const honest = resolveAlcadaReguladora(19.152, { measurementSpread_m: 0.87 });
        expect(honest.ok).toBe(false);
        if (!honest.ok) {
            expect(honest.reason).toBe('band-edge');
            expect(honest.straddles).toEqual([17.7, 20.75]);
        }
    });

    it('NEVER narrows the guard — a pin-sharp measurement still refuses on a band edge', () => {
        // The 0.5 m allowance prices the measured-for-declared substitution, which a tight spread
        // says nothing about. Letting a small spread shrink the guard would silently re-open the
        // Cerdà 20 m step this module was written for.
        for (const spread of [0, 0.001, 0.05, BAND_EDGE_GUARD_M]) {
            const r = resolveAlcadaReguladora(20.0, { measurementSpread_m: spread });
            expect(r.ok, `spread ${spread} m must not relax the guard`).toBe(false);
        }
        expect(effectiveBandEdgeGuard_m(0.05)).toBe(BAND_EDGE_GUARD_M);
        expect(effectiveBandEdgeGuard_m(undefined)).toBe(BAND_EDGE_GUARD_M);
        expect(effectiveBandEdgeGuard_m(null)).toBe(BAND_EDGE_GUARD_M);
        expect(effectiveBandEdgeGuard_m(Number.NaN)).toBe(BAND_EDGE_GUARD_M);
        expect(effectiveBandEdgeGuard_m(0.87)).toBe(0.87);
    });

    it('a spread cannot resurrect a width an OFFICIAL source already settled', () => {
        // `trustedOfficialWidth` short-circuits the guard entirely; a spread is meaningless there
        // because no measurement produced the number.
        const r = resolveAlcadaReguladora(20.0, {
            trustedOfficialWidth: true,
            measurementSpread_m: 5,
        });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.height_m).toBe(20.75);
    });

    it('leaves a clear-of-any-edge width alone however noisy, when it stays in one band', () => {
        // 25 m ± 2 m is still wholly inside the 20–30 band. Refusing here would be superstition,
        // not caution — the guard must fire on band CROSSINGS, not on noise as such.
        const r = resolveAlcadaReguladora(25, { measurementSpread_m: 2 });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.height_m).toBe(20.75);
    });
});
