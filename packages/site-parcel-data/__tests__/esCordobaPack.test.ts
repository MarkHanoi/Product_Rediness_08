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
    cordobaOutsidePilotRefusal,
    cordobaNoCalificacionAtPointRefusal,
    cordobaUnbindableSubzoneRefusal,
    cordobaZoneRefusalFor,
    CORDOBA_LEGALLY_REFUSED_ORDENANZAS,
    CORDOBA_MUNICIPAL_JURISDICTION_ID,
} from '../src/rulepacks/esCordobaZoneClassification.js';
import {
    isInCordoba,
    CORDOBA_BBOX,
    isInCordobaMunicipality,
    CORDOBA_MUNICIPAL_BBOX,
} from '../src/providers/cordobaBbox.js';
import {
    resolveZoneDisposition,
    listJurisdictionCoverage,
    resolveRegisteredJurisdictionAt,
} from '../src/rulepacks/registry.js';
import { subzoneCodeFromLink } from '../src/providers/resolveCordobaSubzone.js';

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

    // ── §CORDOBA-REFUSAL-SPLIT (L-422/457/467/469) — four absences, four cards. ──────────────────
    it('the no-pack card no longer CONFLATES "no calificación mapped" with "not transcribed"', () => {
        // ⚠ The old copy said "Either the parcel carries no calificación in the COACo join, OR its
        // family is one the pilot does not pack" — two different values, different owners, one card.
        const r = cordobaNoRulePackRefusal('UAS-1', null, []);
        expect(r.detail).not.toMatch(/either/i);
        // It must now speak only about PRYZM's transcription backlog, and name the two families.
        expect(r.detail).toMatch(/Uso Industrial/);
        expect(r.detail).toMatch(/Unifamiliar Aislada/);
    });

    it('the no-pack card never claims we lack a rule we HOLD (the Barcelona 20a/22a lesson)', () => {
        // PRYZM ships 13 transcribed subzones. `resolveZoneDisposition` must hand every one of them
        // the PACK, so this false-statement card is structurally unreachable for them.
        for (const code of CORDOBA_PGOU2001_ZONE_CODES) {
            const d = resolveZoneDisposition(CORDOBA_JURISDICTION_ID, code);
            expect(d.kind, code).toBe('pack');
        }
    });

    it('OUTSIDE the pilot: a DURABLE `no-plan-at-point`, never the transient retry code', () => {
        const r = cordobaOutsidePilotRefusal(['Location: 37.90000, -4.70000']);
        // ⚠ `source-data-unavailable` is defined as transient and is the ONLY code that earns a
        // retry affordance. Nothing here clears on a retry — COACo publishes 2 districts, full stop.
        expect(r.code).toBe('no-plan-at-point');
        expect(r.code).not.toBe('source-data-unavailable');
        // It must NOT assert a legal fact about the land: a plan DOES govern it.
        expect(r.legallyGrounded).toBe(false);
        expect(r.ordinanceRef).toBeNull();
        expect(r.detail).toMatch(/PGOU-Córdoba-2001 covers the whole/i);
        expect(r.knownFacts).toContain('Location: 37.90000, -4.70000');
    });

    it('INSIDE the pilot with no polygon: the publisher ANSWERED, so it is not a fetch failure', () => {
        const r = cordobaNoCalificacionAtPointRefusal([]);
        expect(r.code).toBe('no-plan-at-point');
        expect(r.detail).toMatch(/lookup SUCCEEDED/i);
        // ⚠ Must not assert "this is a street" — measured: the layer covers 32.8 % of the districts
        // and PRYZM cannot tell public viario from land the publisher attributes to nothing.
        expect(r.detail).toMatch(/will not assert that about YOUR parcel/i);
        expect(r.legallyGrounded).toBe(false);
    });

    it('an unbindable subzone KEY is `regime-undetermined`, not a coverage gap', () => {
        // The measured case: 14 of 453 COACo polygons carry a bare `O_MC.pdf` (18 539 m², 1.14 % of
        // ordenanzas land), which parses to `MC` — a code the pack deliberately does not contain,
        // because MC-1..MC-4 differ materially.
        expect(subzoneCodeFromLink('http://x/doc/ordenanzas/O_MC.pdf')).toBe('MC');
        expect([...CORDOBA_PGOU2001_ZONE_CODES]).not.toContain('MC');
        const r = cordobaUnbindableSubzoneRefusal('Manzana Cerrada', 'O_MC', []);
        expect(r.code).toBe('regime-undetermined');
        // ⚠ Saying "PRYZM has not transcribed this ordenanza" here would be FALSE — all four MC
        // subzones are packed. What is missing is the publisher's subzone key.
        expect(r.code).not.toBe('no-rule-pack');
        expect(r.detail).toMatch(/transcribed every one of that ordenanza's subzones/i);
        expect(r.ordinanceRef).toBeTruthy();
    });

    it('the unverified card does not claim we hold rules for a zone it has not resolved', () => {
        // The dispatcher calls this with `subzone = null` for EVERY pilot parcel — before the COACo
        // resolver runs. Asserting "we machine-read THIS zone's rules" is false on the ~5.7 % of
        // pilot land whose family is deliberately unpacked. The copy must be conditional.
        const unknown = cordobaUnverifiedRefusal(null, null, []);
        expect(unknown.headline).not.toMatch(/this zone's rules/i);
        expect(unknown.detail).toMatch(/has not yet identified which ordenanza/i);
        // …and it must name the delegation that survives sign-off, so the card is not read as
        // "sign it and every parcel gets a number".
        expect(unknown.detail).toMatch(/Plan Parcial/);
        // With a resolved subzone the stronger, specific sentence is correct and returns.
        const known = cordobaUnverifiedRefusal('PAS-2', null, []);
        expect(known.headline).toMatch(/this zone's rules/i);
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

// ═════════════════════════════════════════════════════════════════════════════════════════════
// §CORDOBA-MUNICIPAL-CLOSURE — the ~8 districts outside the pilot get a REFUSAL, not a fabrication
// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('Córdoba — outside the pilot is CLOSED (a cited refusal, never the estimated triple)', () => {
    /** El Brillante / Norte-Sierra — Córdoba city, well outside the Sur + Noroeste pilot box. */
    const OUTSIDE = { lat: 37.9105, lon: -4.7905 } as const;

    it('the outside point really is in Córdoba and really is outside the pilot', () => {
        // Asserted, never assumed — if the pilot box grows, this test must be re-aimed knowingly.
        expect(isInCordobaMunicipality(OUTSIDE.lat, OUTSIDE.lon)).toBe(true);
        expect(isInCordoba(OUTSIDE.lat, OUTSIDE.lon)).toBe(false);
        expect(isInCordobaMunicipality(Number.NaN, -4.78)).toBe(false);
        expect(isInCordobaMunicipality(41.4, 2.17)).toBe(false); // Barcelona
    });

    it('⚠ THE REGRESSION GUARD — a registered jurisdiction now CLAIMS that point', () => {
        // Before §CORDOBA-MUNICIPAL-CLOSURE this returned `'none'`, which the §L-663 chokepoint in
        // `siteDispatch.ts` reads as "genuinely uncovered land — the estimate is honest here", so
        // PRYZM published 3,0/1,5/3,0 m + FAR 2,00 + 50 % coverage on ~8 of Córdoba's ~10 districts.
        // If this goes red, that fabrication is back.
        const claim = resolveRegisteredJurisdictionAt(OUTSIDE.lat, OUTSIDE.lon);
        expect(claim.kind).toBe('resolved');
        if (claim.kind === 'resolved') {
            expect(claim.jurisdiction.jurisdictionId).toBe(CORDOBA_MUNICIPAL_JURISDICTION_ID);
        }
    });

    it('the PILOT still wins inside itself (§JURISDICTION-SPECIFICITY: district ≺ municipal)', () => {
        // Both predicates are true at Córdoba centre; the finer registration must govern, with no
        // ordering dependency in the registrations array.
        expect(isInCordoba(37.88, -4.78)).toBe(true);
        expect(isInCordobaMunicipality(37.88, -4.78)).toBe(true);
        const claim = resolveRegisteredJurisdictionAt(37.88, -4.78);
        expect(claim.kind).toBe('resolved');
        if (claim.kind === 'resolved') {
            expect(claim.jurisdiction.jurisdictionId).toBe(CORDOBA_JURISDICTION_ID);
        }
    });

    it('the municipal registration carries NO pack and answers with the cited refusal', () => {
        const cov = listJurisdictionCoverage().find(
            (c) => c.jurisdictionId === CORDOBA_MUNICIPAL_JURISDICTION_ID,
        );
        expect(cov).toBeDefined();
        // Empty BY CONSTRUCTION — there is no published calificación out here to key a pack on.
        expect(cov!.packZoneCodes).toHaveLength(0);
        // The summary must state the publication limit and name the two districts.
        expect(cov!.answerSummary).toMatch(/SUR and NOROESTE/);
        expect(cov!.answerSummary).toMatch(/COACo/);
        const d = resolveZoneDisposition(CORDOBA_MUNICIPAL_JURISDICTION_ID, 'anything');
        expect(d.kind).toBe('refusal');
        if (d.kind === 'refusal') expect(d.refusal.code).toBe('no-plan-at-point');
    });

    it('the municipal box is the OSM municipal term, rounded outward (not the pilot)', () => {
        // OSM relation 343207 (`admin_level=8`, `ine:municipio=14021`), read 2026-08-01:
        // [37.6658228, 38.0315171, -4.9985994, -4.3514283] → rounded OUT to hundredths.
        expect(CORDOBA_MUNICIPAL_BBOX.minLat).toBeCloseTo(37.66, 3);
        expect(CORDOBA_MUNICIPAL_BBOX.maxLat).toBeCloseTo(38.04, 3);
        expect(CORDOBA_MUNICIPAL_BBOX.minLon).toBeCloseTo(-5.0, 3);
        expect(CORDOBA_MUNICIPAL_BBOX.maxLon).toBeCloseTo(-4.35, 3);
        // It must strictly CONTAIN the pilot, or the specificity ladder has nothing to rank.
        expect(CORDOBA_MUNICIPAL_BBOX.minLat).toBeLessThan(CORDOBA_BBOX.minLat);
        expect(CORDOBA_MUNICIPAL_BBOX.maxLat).toBeGreaterThan(CORDOBA_BBOX.maxLat);
        expect(CORDOBA_MUNICIPAL_BBOX.minLon).toBeLessThan(CORDOBA_BBOX.minLon);
        expect(CORDOBA_MUNICIPAL_BBOX.maxLon).toBeGreaterThan(CORDOBA_BBOX.maxLon);
    });
});
