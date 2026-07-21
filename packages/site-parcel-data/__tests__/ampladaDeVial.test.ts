// L-537 — the tiered *amplada de vial* resolution (declared > snapped > measured > none).
//
// What is actually at stake: `trustedOfficialWidth` DISARMS the band-edge guard downstream, so a
// wrong snap does not merely report a wrong width — it removes the very check that exists to stop
// a wrong width becoming a wrong storey count. The tests below therefore pin the REFUSALS at least
// as hard as the successes, and pin the quantum set itself against the probe that licensed it.

import { describe, it, expect } from 'vitest';
import {
    resolveAmpladaDeVial,
    snapToDeclaredQuantum,
    BCN_STREET_WIDTH_QUANTISATION,
} from '../src/rulepacks/ampladaDeVial.js';
import type { StreetWidthMeasurement } from '../src/geometry/streetWidth.js';
import { officialStreetWidthForAddress } from '../src/rulepacks/bcnOfficialStreetWidths.js';

const meas = (width_m: number, spread_m = 0.1): StreetWidthMeasurement => ({
    edgeIndex: 0,
    width_m,
    spread_m,
    sampleCount: 5,
    edgeLength_m: 100,
});

describe('L-537 — the Barcelona quantum set is the PROBE\'S, not the intuitive one', () => {
    it('contains exactly the two values with a ≥×5 measured spike', () => {
        // If someone "helpfully" adds 10/15/25 later, this fails — and it should. The probe found
        // ×0.63 / ×0.24 / ×0.00 for those in Barcelona: they are not quanta, they are absences.
        expect([...BCN_STREET_WIDTH_QUANTISATION.quanta]).toEqual([20, 30]);
    });

    it('excludes 48/50 m — the nominal-50 arteries measure 48, beyond the error bar', () => {
        // A ×6.23 spike sits at 47.75–48.25 while 50 m itself is ×0.90, i.e. the mass is ~2 m off
        // the nominal figure: 3× the measurement's p90 error. Snapping there would be CORRECTING
        // the data rather than resolving its noise. Costless to refuse — same Art. 327.2 band.
        const r = resolveAmpladaDeVial({
            measurement: meas(47.9),
            quantisation: BCN_STREET_WIDTH_QUANTISATION,
        });
        expect(r!.provenance).toBe('measured-cadastral');
        expect(r!.width_m).toBeCloseTo(47.9, 6);
    });

    it('excludes the 6–8 m historic mass — a continuous ridge is not a quantum', () => {
        // Snapping inside a continuous distribution manufactures precision that is not in the data,
        // and the 8 m band edge separates 8.55 m from 11.60 m — a whole storey.
        for (const w of [5.75, 6.0, 7.75, 8.0]) {
            const r = resolveAmpladaDeVial({
                measurement: meas(w),
                quantisation: BCN_STREET_WIDTH_QUANTISATION,
            });
            expect(r!.provenance, `${w} m must not snap`).toBe('measured-cadastral');
        }
    });

    it('keeps the tolerance below a third of the narrowest Art. 327.2 band', () => {
        // 3 m is the narrowest band. A tolerance that could approach it would let a snap cross a
        // band on its own, which is the one thing the tolerance exists to make impossible.
        expect(BCN_STREET_WIDTH_QUANTISATION.tolerance_m).toBeLessThan(1);
        expect(BCN_STREET_WIDTH_QUANTISATION.source).toMatch(/probe|measured/i);
    });
});

describe('L-537 — snapToDeclaredQuantum', () => {
    it('snaps the Cerdà grid measurement to 20 m — THE CASE THIS EXISTS FOR', () => {
        // The measured Eixample street is 19.6–19.9 m, which the band-edge guard refuses, costing
        // the building the storey it is legally entitled to.
        const s = snapToDeclaredQuantum(meas(19.75), BCN_STREET_WIDTH_QUANTISATION);
        expect(s.ok).toBe(true);
        if (s.ok) {
            expect(s.quantum_m).toBe(20);
            expect(s.delta_m).toBeCloseTo(0.25, 6);
        }
    });

    it('refuses a measurement whose OWN spread exceeds the tolerance', () => {
        // Checked before proximity on purpose: a wide-spread measurement that happens to land near
        // a quantum is the most seductive wrong answer available here.
        const s = snapToDeclaredQuantum(meas(20.0, 1.5), BCN_STREET_WIDTH_QUANTISATION);
        expect(s.ok).toBe(false);
        if (!s.ok) expect(s.reason).toBe('imprecise');
    });

    it('refuses when the nearest quantum is outside the tolerance', () => {
        const s = snapToDeclaredQuantum(meas(21.5), BCN_STREET_WIDTH_QUANTISATION);
        expect(s.ok).toBe(false);
        if (!s.ok) expect(s.reason).toBe('too-far');
    });

    it('refuses an AMBIGUOUS width when two quanta are in range', () => {
        // Unreachable for Barcelona today (0 of 2,855 sampled frontages) and kept deliberately: a
        // denser future quantum set must not have this refusal bolted on after answers shipped.
        const s = snapToDeclaredQuantum(meas(20.5), {
            quanta: [20, 21],
            tolerance_m: 0.6,
            source: 'test',
        });
        expect(s.ok).toBe(false);
        if (!s.ok) expect(s.reason).toBe('ambiguous');
    });

    it('reports no-quanta for a region that declares none — a legitimate configuration', () => {
        // Córdoba and Sevilla measured nothing above ×2.8. For them the honest setting is [].
        const s = snapToDeclaredQuantum(meas(20.0), { quanta: [], tolerance_m: 0.6, source: 'test' });
        expect(s.ok).toBe(false);
        if (!s.ok) expect(s.reason).toBe('no-quanta');
    });
});

describe('L-537 — the tier ladder', () => {
    it('a DECLARED (curated) width beats a measurement, even a better one', () => {
        // The allow-list carries the NOMINAL DECLARED value, which is the legal quantity; the
        // measurement is only an inference about it. Precision is not authority.
        const declared = officialStreetWidthForAddress('CL PAU CLARIS 174 BARCELONA (BARCELONA)');
        expect(declared).not.toBeNull();
        const r = resolveAmpladaDeVial({
            declared,
            measurement: meas(19.75, 0.01),
            quantisation: BCN_STREET_WIDTH_QUANTISATION,
        });
        expect(r!.provenance).toBe('curated-cerda-nominal');
        expect(r!.width_m).toBe(20);
        expect(r!.trustedOfficialWidth).toBe(true);
    });

    it('an unlisted street falls to the SNAPPED tier — the coverage fix', () => {
        // Enric Granados / Ronda de la Universitat: unlisted, so today `maxHeight` is null and the
        // massing path draws a 0.5 m slab. This is the row that stops that happening.
        expect(officialStreetWidthForAddress('CL ENRIC GRANADOS 21 BARCELONA (BARCELONA)')).toBeNull();
        const r = resolveAmpladaDeVial({
            declared: null,
            measurement: meas(19.8),
            quantisation: BCN_STREET_WIDTH_QUANTISATION,
        });
        expect(r!.provenance).toBe('snapped-to-declared-quantum');
        expect(r!.width_m).toBe(20);
        expect(r!.trustedOfficialWidth).toBe(true);
        // The panel must be able to show HOW, not just WHAT — the probe is cited in the row.
        expect(r!.why).toMatch(/declared quantum/);
        expect(r!.why).toMatch(/6,819/);
    });

    it('a non-grid street falls to MEASURED, with the band-edge guard left ARMED', () => {
        // The flag is the contract: only a width that is exact by definition may disarm the guard.
        const r = resolveAmpladaDeVial({
            measurement: meas(16.4),
            quantisation: BCN_STREET_WIDTH_QUANTISATION,
        });
        expect(r!.provenance).toBe('measured-cadastral');
        expect(r!.trustedOfficialWidth).toBe(false);
    });

    it('returns NULL when nothing is available — never a regional average', () => {
        // No block ring (the ~36 % dissolve failure) ⇒ no measurement ⇒ no height ⇒ footprint slab.
        // A "typical street" fallback here would rebuild the fabrication this work item removed.
        expect(resolveAmpladaDeVial({})).toBeNull();
        expect(resolveAmpladaDeVial({ declared: null, measurement: null })).toBeNull();
        expect(resolveAmpladaDeVial({ measurement: meas(0) })).toBeNull();
        expect(resolveAmpladaDeVial({ measurement: meas(Number.NaN) })).toBeNull();
    });

    it('is deterministic (C58 §1.1)', () => {
        const input = { measurement: meas(19.8), quantisation: BCN_STREET_WIDTH_QUANTISATION };
        expect(resolveAmpladaDeVial(input)).toEqual(resolveAmpladaDeVial(input));
    });
});
