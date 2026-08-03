// VALIDATION TESTS — the four rules that stand between the corpus and a fabricated envelope.
//
// ⭐ MUTATION-PROVEN. Each block states, in a comment, the mutation it would catch. A test that
// passes whether or not the code is right is decoration, so every assertion here is paired with
// the specific wrong implementation it rules out.

import { describe, it, expect } from 'vitest';
import {
    readNumeric, readOccupationPct, checkHeightAgainstStoreys,
    METRES_PER_STOREY_MIN, METRES_PER_STOREY_MAX, BANDS,
} from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmValidate.js';
import { published, unknown } from '../../../packages/site-parcel-data/src/rulepacks/esMadridSpacmSchema.js';

describe('readNumeric — MISSING IS UNKNOWN, NEVER ZERO', () => {
    // MUTATION: `if (n === 0) return published(0, field)` — i.e. trusting the stored zero.
    // That single change publishes a zero-metre setback on 7,225 Madrid rows.
    it('reads a literal 0 as UNKNOWN, not as a measurement', () => {
        const p = readNumeric(0, 'NM_RTR_FRNT');
        expect(p.value).toBeNull();
        expect(p.provenance).toBe('unknown');
        expect(p.note).toMatch(/sentinel/i);
    });

    // MUTATION: `?? 0` anywhere on the null path.
    it('reads null, undefined and empty string as UNKNOWN with value null', () => {
        for (const raw of [null, undefined, '']) {
            const p = readNumeric(raw, 'NM_ALTURA');
            expect(p.value).toBeNull();
            expect(p.provenance).toBe('unknown');
        }
    });

    // MUTATION: `Number('abc') → NaN` leaking through as a value. NaN compares false to every
    // band check, so a naïve implementation would pass it straight into the geometry.
    it('reads a non-numeric string as UNKNOWN rather than NaN', () => {
        const p = readNumeric('n/d', 'NM_ALTURA');
        expect(p.value).toBeNull();
        expect(p.provenance).toBe('unknown');
    });

    it('accepts the Spanish comma decimal the service emits in string columns', () => {
        expect(readNumeric('13,5', 'NM_ALTURA').value).toBe(13.5);
    });

    // MUTATION: clamping instead of rejecting — `Math.min(n, max)`. Clamping publishes OUR ceiling
    // under the PUBLISHER'S citation, which is worse than refusing because it looks sourced.
    it('rejects out-of-band values to UNKNOWN and never clamps them', () => {
        const tooTall = readNumeric(85, 'NM_ALTURA', BANDS.height_m);
        expect(tooTall.value).toBeNull();
        expect(tooTall.provenance).toBe('unknown');
        expect(tooTall.note).toMatch(/ceiling/i);

        const tooDeep = readNumeric(216, 'NM_FDO_MX_ED', BANDS.depth_m);
        expect(tooDeep.value).toBeNull();
    });

    it('accepts a value at the band edge — the band is inclusive, not exclusive', () => {
        expect(readNumeric(BANDS.height_m.max, 'NM_ALTURA', BANDS.height_m).value)
            .toBe(BANDS.height_m.max);
    });

    it('rejects a negative value', () => {
        expect(readNumeric(-3, 'NM_RTR_FRNT').value).toBeNull();
    });

    it('records the source field on every reading, present or absent', () => {
        expect(readNumeric(7, 'NM_ALTURA').sourceField).toBe('NM_ALTURA');
        expect(readNumeric(null, 'NM_ALTURA').sourceField).toBe('NM_ALTURA');
    });
});

describe('readOccupationPct — >100 IS A NULL SUBSTITUTE, NOT A COVERAGE', () => {
    // MUTATION: `Math.min(n, 100)`. The census records values up to 300; clamping publishes a
    // full-plot footprint on every one of them.
    it('rejects a value above 100 to UNKNOWN and does not clamp it', () => {
        const p = readOccupationPct(300);
        expect(p.value).toBeNull();
        expect(p.provenance).toBe('unknown');
        expect(p.note).toMatch(/different KIND/i);
    });

    // 100 exactly is LAWFUL — full coverage is ordinary casco-antiguo fabric. A test that only
    // checked `>100` rejection would pass an implementation that also rejected 100.
    it('accepts exactly 100 — full plot coverage is a real ordinance', () => {
        expect(readOccupationPct(100).value).toBe(100);
    });

    it('accepts the census minimum 0.03 rather than treating a small value as noise', () => {
        expect(readOccupationPct(0.03).value).toBeCloseTo(0.03);
    });

    it('still treats 0 as the sentinel it is', () => {
        expect(readOccupationPct(0).value).toBeNull();
    });
});

describe('checkHeightAgainstStoreys — CONTRADICTION REFUSES BOTH', () => {
    // ⛔ THE HEADLINE CASE, from the census: MAJADAHONDA "VIVIENDA UNIFAMILIAR AISLADA",
    // NM_ALTURA=85 with NM_PLANTAS=2 = 42.5 m per storey.
    // MUTATION: preferring either field — `return { height_m: altura, ... }` on the bad branch.
    // Preferring altura publishes an 85 m detached house; preferring plantas publishes 7 m under a
    // citation to a document that says 85. Both are two-sided errors (ADR-0287).
    it('refuses BOTH values on the real MAJADAHONDA 42.5 m/storey row', () => {
        const r = checkHeightAgainstStoreys(published(85, 'NM_ALTURA'), published(2, 'NM_N_PLTA'));
        expect(r.height_m.value).toBeNull();
        expect(r.storeys.value).toBeNull();
        expect(r.height_m.provenance).toBe('contradicted');
        expect(r.storeys.provenance).toBe('contradicted');
        expect(r.contradiction).not.toBeNull();
        expect(r.metresPerStorey).toBeCloseTo(42.5);
        expect(r.contradiction?.fields).toEqual(['NM_ALTURA', 'NM_N_PLTA']);
    });

    // MUTATION: averaging — `(altura + plantas * 3) / 2` or similar. The detail string is asserted
    // because the refusal card must say WHY, and "42.5" is the fact a reviewer needs.
    it('states the implied metres-per-storey in the contradiction detail', () => {
        const r = checkHeightAgainstStoreys(published(85, 'NM_ALTURA'), published(2, 'NM_N_PLTA'));
        expect(r.contradiction?.detail).toContain('42.50');
        expect(r.contradiction?.detail).toContain('85');
        expect(r.contradiction?.detail).toContain('2');
    });

    // The real Boadilla row: 7 m over 2 storeys = 3.5 m/storey. A validator that refused this
    // would refuse the whole proving municipality.
    it('passes a real Boadilla row (7 m / 2 storeys = 3.5 m per storey)', () => {
        const r = checkHeightAgainstStoreys(published(7, 'NM_ALTURA'), published(2, 'NM_N_PLTA'));
        expect(r.contradiction).toBeNull();
        expect(r.height_m.value).toBe(7);
        expect(r.storeys.value).toBe(2);
        expect(r.metresPerStorey).toBeCloseTo(3.5);
    });

    it('passes a real Boadilla multifamily row (13.5 m / 4 storeys)', () => {
        const r = checkHeightAgainstStoreys(published(13.5, 'NM_ALTURA'), published(4, 'NM_N_PLTA'));
        expect(r.contradiction).toBeNull();
        expect(r.metresPerStorey).toBeCloseTo(3.375);
    });

    // MUTATION: `>=`/`>` slip on the band edges. Both edges are asserted from the exported
    // constants so the test cannot drift from the implementation's own definition.
    it('treats both band edges as inside the band', () => {
        const low = checkHeightAgainstStoreys(
            published(METRES_PER_STOREY_MIN * 3, 'NM_ALTURA'), published(3, 'NM_N_PLTA'),
        );
        expect(low.contradiction).toBeNull();
        const high = checkHeightAgainstStoreys(
            published(METRES_PER_STOREY_MAX * 3, 'NM_ALTURA'), published(3, 'NM_N_PLTA'),
        );
        expect(high.contradiction).toBeNull();
    });

    // MUTATION: firing a contradiction when only one value is present. That would refuse every
    // storeys-only row — and `NM_N_PLTA` outnumbers `NM_ALTURA` across the corpus.
    it('does NOT invent a contradiction when only one of the two is published', () => {
        const onlyHeight = checkHeightAgainstStoreys(
            published(7, 'NM_ALTURA'), unknown('NM_N_PLTA', 'absent'),
        );
        expect(onlyHeight.contradiction).toBeNull();
        expect(onlyHeight.height_m.value).toBe(7);

        const onlyStoreys = checkHeightAgainstStoreys(
            unknown('NM_ALTURA', 'absent'), published(3, 'NM_N_PLTA'),
        );
        expect(onlyStoreys.contradiction).toBeNull();
        expect(onlyStoreys.storeys.value).toBe(3);
    });

    it('does not invent a contradiction when both are unknown', () => {
        const r = checkHeightAgainstStoreys(
            unknown('NM_ALTURA', 'absent'), unknown('NM_N_PLTA', 'absent'),
        );
        expect(r.contradiction).toBeNull();
        expect(r.metresPerStorey).toBeNull();
    });
});
