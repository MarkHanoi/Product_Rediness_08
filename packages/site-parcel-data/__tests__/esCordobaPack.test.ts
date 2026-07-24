// Córdoba (INE 14021) PGOU-2001 pilot — the pack + the HONESTY GATE.
//
// ⚠ THE FIRST TEST IS THE ONE THAT MATTERS (the L-445 lesson, mirrored from esBarcelonaPack.test.ts):
// the pack runs `JurisdictionZoningContractSchema.parse` at MODULE LOAD, so a schema violation is a
// runtime throw, not a type error. Importing it is the assertion.
//
// The rest pin the two properties this PR is about:
//   1. THE HONESTY TIER — every value self-labels `pipeline-extracted-unverified` /
//      `pipeline-extracted` (WIRING-TODO 1/2), and each `null` is a finding, not a placeholder.
//   2. THE VERIFICATION GATE — the pack is registered, but `CORDOBA_ENVELOPE_VERIFIED` is false and
//      the dispatcher's refusal is what a Córdoba parcel gets: NO machine-read number renders until a
//      human signs `sources/VERIFICATION.md`.

import { describe, it, expect } from 'vitest';
import {
    ES_CORDOBA_PGOU2001_PACK,
    CORDOBA_PGOU2001_ZONE_CODES,
    CORDOBA_JURISDICTION_ID,
    CORDOBA_INTENDED_DEFAULT_CONFIDENCE,
    CORDOBA_INTENDED_FIELD_PROVENANCE,
} from '../src/rulepacks/esCordobaPGOU2001.js';
import {
    CORDOBA_ENVELOPE_VERIFIED,
    cordobaUnverifiedRefusal,
    cordobaNoRulePackRefusal,
    cordobaZoneRefusalFor,
    CORDOBA_LEGALLY_REFUSED_ORDENANZAS,
} from '../src/rulepacks/esCordobaZoneClassification.js';
import { isInCordoba, CORDOBA_BBOX } from '../src/providers/cordobaBbox.js';
import { resolveZoneDisposition, listJurisdictionCoverage } from '../src/rulepacks/registry.js';

describe('Córdoba PGOU-2001 — the pack is VALID (parses at load) and covers 13 subzones', () => {
    it('parsed the schema without throwing', () => {
        expect(ES_CORDOBA_PGOU2001_PACK.jurisdictionId).toBe('es-14021-cordoba');
        expect(ES_CORDOBA_PGOU2001_PACK.jurisdictionId).toBe(CORDOBA_JURISDICTION_ID);
        expect(ES_CORDOBA_PGOU2001_PACK.zones).toHaveLength(13);
        expect([...CORDOBA_PGOU2001_ZONE_CODES]).toHaveLength(13);
        for (const code of CORDOBA_PGOU2001_ZONE_CODES) {
            expect(ES_CORDOBA_PGOU2001_PACK.zones.find((z) => z.code === code)).toBeDefined();
        }
    });
});

describe('Córdoba — the HONESTY TIER (WIRING-TODO 1/2, applied)', () => {
    it('ships `pipeline-extracted-unverified`, NOT `estimated-ruleset`', () => {
        // The stale placeholder over-stated confidence. The enum now exists, so the pack self-labels
        // the honest permanent bottom tier.
        expect(ES_CORDOBA_PGOU2001_PACK.defaultConfidence).toBe('pipeline-extracted-unverified');
        expect(ES_CORDOBA_PGOU2001_PACK.defaultConfidence).toBe(CORDOBA_INTENDED_DEFAULT_CONFIDENCE);
        expect(ES_CORDOBA_PGOU2001_PACK.defaultConfidence).not.toBe('estimated-ruleset');
    });

    it('EVERY field provenance is `pipeline-extracted`, never `estimated` / `ordinance-pdf`', () => {
        // ⚠ IF THIS GOES RED a field was left `estimated` (the stale under-claim) or promoted to a
        // human tier without sign-off. A machine-read value is `pipeline-extracted`, strictly below
        // the human `ordinance-pdf`.
        let checked = 0;
        for (const z of ES_CORDOBA_PGOU2001_PACK.zones) {
            for (const [field, prov] of Object.entries(z.fieldProvenance ?? {})) {
                expect(prov, `${z.code}.${field}`).toBe('pipeline-extracted');
                expect(prov, `${z.code}.${field}`).toBe(CORDOBA_INTENDED_FIELD_PROVENANCE);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(0);
    });
});

describe('Córdoba — every `null` is a FINDING with a reason (C58 §1.7a: null ≠ 0)', () => {
    const zone = (code: string) => {
        const z = ES_CORDOBA_PGOU2001_PACK.zones.find((zz) => zz.code === code);
        if (!z) throw new Error(`missing zone ${code}`);
        return z;
    };

    it('DERIVED edificabilidad → plotRatioFAR null on CTP-1 and MC-1/2/4 (never a number)', () => {
        for (const code of ['CTP-1', 'MC-1', 'MC-2', 'MC-4']) {
            expect(zone(code).plotRatioFAR, `${code}.FAR`).toBeNull();
        }
    });

    it('MC-3 keeps its out-of-range 3.5 FAR (a packed finding with the gate flag, not a null)', () => {
        expect(zone('MC-3').plotRatioFAR).toBe(3.5);
    });

    it('per-street-width height TABLE → maxHeight_m and maxFloors null on every MC subzone', () => {
        for (const code of ['MC-1', 'MC-2', 'MC-3', 'MC-4']) {
            expect(zone(code).maxHeight_m, `${code}.h`).toBeNull();
            expect(zone(code).maxFloors, `${code}.floors`).toBeNull();
        }
    });

    it('alignment zones (façade on the vial line) → setbacks null, not zero (CTP-1, MC-*)', () => {
        for (const code of ['CTP-1', 'MC-1', 'MC-2', 'MC-3', 'MC-4']) {
            const s = zone(code).setbacks;
            expect(s?.front_m ?? null, `${code}.front`).toBeNull();
            expect(s?.side_m ?? null, `${code}.side`).toBeNull();
            expect(s?.rear_m ?? null, `${code}.rear`).toBeNull();
        }
    });

    it('every zone carries an ordinanceRef citing a PGOU article (C58 §1.3)', () => {
        for (const z of ES_CORDOBA_PGOU2001_PACK.zones) {
            expect(z.ordinanceRef, `${z.code}.ref`).toBeTruthy();
            expect(z.ordinanceRef, `${z.code}.ref`).toMatch(/PGOU Art\./);
        }
    });
});

describe('Córdoba — THE VERIFICATION GATE (no machine-read number renders until sign-off)', () => {
    it('the gate is CLOSED — CORDOBA_ENVELOPE_VERIFIED is false', () => {
        // ⚠ Flipping this to true is a legal act (a human signed VERIFICATION.md). It is false today.
        expect(CORDOBA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('the unverified refusal is a cited, number-free, coverage-level card', () => {
        const r = cordobaUnverifiedRefusal(null, null, ['Parcel area: 480 m²']);
        expect(r.code).toBe('no-rule-pack');
        // A statement about PRYZM's verification status, never about the law.
        expect(r.legallyGrounded).toBe(false);
        expect(r.ordinanceRef).toBeNull();
        // The copy must make the machine-extracted-unverified status legible, and it carries no number.
        expect(`${r.headline} ${r.detail}`).toMatch(/machine|OCR|unverified/i);
        expect(r.knownFacts).toContain('Parcel area: 480 m²');
    });
});

describe('Córdoba — the refusal vocabulary (coverage gap + legally-grounded "no" families)', () => {
    it('the coverage gap states the 2-district pilot scope', () => {
        const r = cordobaNoRulePackRefusal('cordoba-pgou-2001-pilot', null, []);
        expect(r.code).toBe('no-rule-pack');
        expect(r.legallyGrounded).toBe(false);
        expect(r.detail).toMatch(/Sur/i);
        expect(r.detail).toMatch(/Noroeste/i);
        expect(r.detail).toMatch(/pilot/i);
    });

    it('refusalFor returns a legally-grounded refusal for a cited "no" family, null otherwise', () => {
        expect(CORDOBA_LEGALLY_REFUSED_ORDENANZAS.length).toBeGreaterThan(0);
        for (const token of CORDOBA_LEGALLY_REFUSED_ORDENANZAS) {
            const r = cordobaZoneRefusalFor(token, null, []);
            expect(r, token).not.toBeNull();
            expect(r!.legallyGrounded, token).toBe(true);
        }
        // A packed subzone is NOT in this table — the pack answers for it (once verified), so the
        // legal table is silent. Uso Industrial / Unifamiliar Aislada are coverage gaps, not here.
        expect(cordobaZoneRefusalFor('PAS-1', null, [])).toBeNull();
        expect(cordobaZoneRefusalFor('some-unknown-code', null, [])).toBeNull();
    });
});

describe('Córdoba — the registry registration (pack precedence + coverage globe)', () => {
    it('gives a packed subzone the `pack` disposition (precedence for the day verification lands)', () => {
        const d = resolveZoneDisposition(CORDOBA_JURISDICTION_ID, 'PAS-1');
        expect(d.kind).toBe('pack');
        if (d.kind === 'pack') expect(d.pack.jurisdictionId).toBe('es-14021-cordoba');
    });

    it('gives an unpacked code the coverage-gap refusal (no fabricated envelope)', () => {
        const d = resolveZoneDisposition(CORDOBA_JURISDICTION_ID, 'some-unpacked-code');
        expect(d.kind).toBe('refusal');
        if (d.kind === 'refusal') expect(d.refusal.code).toBe('no-rule-pack');
    });

    it('surfaces on the coverage globe with all 13 packed subzones and the pilot summary', () => {
        const cov = listJurisdictionCoverage().find(
            (c) => c.jurisdictionId === CORDOBA_JURISDICTION_ID,
        );
        expect(cov).toBeDefined();
        expect(cov!.packZoneCodes).toHaveLength(13);
        expect(cov!.answerSummary).toMatch(/unverified|machine-extracted/i);
        expect(cov!.contains(37.88, -4.78)).toBe(true);
    });
});

describe('Córdoba — the bbox jurisdiction gate (a coarse proximity claim)', () => {
    it('accepts Córdoba centre, rejects a Barcelona point and non-finite input', () => {
        expect(isInCordoba(37.88, -4.78)).toBe(true);
        expect(isInCordoba(41.4, 2.17)).toBe(false); // Barcelona
        expect(isInCordoba(Number.NaN, -4.78)).toBe(false);
    });

    it('the box is the Sur + Noroeste pilot extent, not the whole municipality', () => {
        expect(CORDOBA_BBOX.minLat).toBeCloseTo(37.8558, 3);
        expect(CORDOBA_BBOX.maxLat).toBeCloseTo(37.8986, 3);
        expect(CORDOBA_BBOX.minLon).toBeCloseTo(-4.8077, 3);
        expect(CORDOBA_BBOX.maxLon).toBeCloseTo(-4.7691, 3);
    });
});
