// L-606 — the Saudi / Riyadh DEMO pack.
//
// ⚠ THE FIRST TEST IS THE ONE THAT MATTERS: the pack runs `JurisdictionZoningContractSchema.parse`
// at MODULE LOAD, so a schema violation is a runtime throw, not a type error. `tsc` passing says
// nothing about it (the L-445 lesson — a schema half of a feature that nothing exercises is
// indistinguishable from a feature that does not exist).
//
// The rest pin the pack's OWN claims: `estimated-ruleset` and nothing `structured` (the L-449
// human VERIFICATION.md sign-off is absent), the two demo zone codes, every null is a cited
// FINDING (not a gap), and the width-dependent setback RESOLVER — which must REFUSE when the
// street width is missing rather than ship the floor triple (§2 of `saRiyadhDemo.ts`).

import { describe, it, expect } from 'vitest';
import {
    SA_RIYADH_DEMO_PACK,
    SA_RIYADH_ZONE_CODES,
    SA_RIYADH_JURISDICTION_ID,
    SA_GROUND_COVERAGE,
    resolveSaudiSetbacks,
    saRiyadhResolvedPack,
    saRiyadhZoneCodeForClass,
} from '../src/rulepacks/saRiyadhDemo.js';

describe('L-606 — the Riyadh pack is VALID (parses at load)', () => {
    it('parsed the schema without throwing', () => {
        expect(SA_RIYADH_DEMO_PACK.jurisdictionId).toBe(SA_RIYADH_JURISDICTION_ID);
        expect(SA_RIYADH_DEMO_PACK.jurisdictionId).toBe('sa-ruh-riyadh');
        expect(SA_RIYADH_DEMO_PACK.zones).toHaveLength(2);
    });

    it('ships `estimated-ruleset`, never `structured`', () => {
        // The clause numbers are transcribed but no VERIFICATION.md sign-off exists yet (L-449),
        // so the honest ship tier is estimated-ruleset. Only that sign-off upgrades it.
        expect(SA_RIYADH_DEMO_PACK.defaultConfidence).toBe('estimated-ruleset');
    });

    it('registers the two demo zone codes (villa + apartment)', () => {
        expect([...SA_RIYADH_ZONE_CODES]).toEqual(['sa-villa', 'sa-apartment']);
        for (const code of SA_RIYADH_ZONE_CODES) {
            expect(SA_RIYADH_DEMO_PACK.zones.find((z) => z.code === code)).toBeDefined();
        }
    });
});

describe('L-606 — every null is a FINDING, not a gap', () => {
    const zones = () => SA_RIYADH_DEMO_PACK.zones;

    it('maxHeight_m and maxFloors are NULL — deferred to the municipal approved plan (§NULLS)', () => {
        // The national CEILING (14 m villa / 23 m apartment) is cited in the refusal text, never
        // rendered as the height: rendering it would over-state where the plan restricts below it.
        for (const z of zones()) {
            expect(z.maxHeight_m).toBeNull();
            expect(z.maxFloors).toBeNull();
        }
    });

    it('plotRatioFAR is NULL — the residential regime has no FAR at all (§NULLS)', () => {
        for (const z of zones()) expect(z.plotRatioFAR).toBeNull();
    });

    it('setbacks are NULL in the TEMPLATE — resolved per-parcel from the street width (§2)', () => {
        // Null is the cited template, not zero: a scalar would be one street's answer for the
        // whole subzone. The value is `max(w/5, floor)`, attached by `saRiyadhResolvedPack`.
        for (const z of zones()) {
            expect(z.setbacks?.front_m ?? null).toBeNull();
            expect(z.setbacks?.side_m ?? null).toBeNull();
            expect(z.setbacks?.rear_m ?? null).toBeNull();
        }
    });

    it('maxCoverage IS populated — the ordinance ground-coverage constant (villa 0.75 / apt 0.65)', () => {
        const villa = zones().find((z) => z.code === 'sa-villa');
        const apt = zones().find((z) => z.code === 'sa-apartment');
        expect(villa?.maxCoverage).toBe(SA_GROUND_COVERAGE.villa);
        expect(apt?.maxCoverage).toBe(SA_GROUND_COVERAGE.apartment);
    });

    it('every populated field is `ordinance-pdf`, never `published-structured`', () => {
        for (const z of zones()) {
            for (const [field, prov] of Object.entries(z.fieldProvenance ?? {})) {
                expect(prov, `${z.code}.${field}`).not.toBe('published-structured');
            }
        }
    });

    it('carries an ordinanceRef naming the governing MOMRAH decision (C58 §1.3)', () => {
        for (const z of zones()) {
            expect(z.ordinanceRef).toBeTruthy();
            expect(z.ordinanceRef).toMatch(/MOMRAH|§4|قرار وزاري/);
        }
    });
});

describe('L-606 — the street-proportional setback RESOLVER (§2)', () => {
    it('REFUSES `needs-street-width` when the width is absent — never the floor triple', () => {
        for (const w of [null, undefined, 0, -5, Number.NaN]) {
            const r = resolveSaudiSetbacks(w as number | null | undefined, 'villa');
            expect(r.ok).toBe(false);
            if (!r.ok) expect(r.reason).toBe('needs-street-width');
        }
    });

    it('resolves front = max(w/5, 3), side = rear = max(w/5, 2) on a narrow street', () => {
        // w = 10 → w/5 = 2 → front max(2,3) = 3, side/rear max(2,2) = 2.
        const r = resolveSaudiSetbacks(10, 'villa');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.front_m).toBe(3);
            expect(r.side_m).toBe(2);
            expect(r.rear_m).toBe(2);
            expect(r.caveats.length).toBeGreaterThan(0);
        }
    });

    it('the proportional term governs on a wide street (w ≥ 15)', () => {
        // w = 20 → w/5 = 4 → front/side/rear all 4 (the proportional term beats every floor).
        const r = resolveSaudiSetbacks(20, 'apartment');
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.front_m).toBe(4);
            expect(r.side_m).toBe(4);
            expect(r.rear_m).toBe(4);
        }
    });
});

describe('L-606 — saRiyadhResolvedPack fills the chosen zone (per-parcel)', () => {
    it('maps a class to its zone code', () => {
        expect(saRiyadhZoneCodeForClass('villa')).toBe('sa-villa');
        expect(saRiyadhZoneCodeForClass('apartment')).toBe('sa-apartment');
    });

    it('refuses when the width is missing (mirrors the resolver)', () => {
        const r = saRiyadhResolvedPack(null, 'villa');
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.reason).toBe('needs-street-width');
    });

    it('fills the chosen zone\'s setbacks with ordinance-pdf provenance, re-parsed at load', () => {
        const r = saRiyadhResolvedPack(10, 'villa');
        expect(r.ok).toBe(true);
        if (r.ok) {
            const villa = r.pack.zones.find((z) => z.code === 'sa-villa')!;
            expect(villa.setbacks?.front_m).toBe(3);
            expect(villa.setbacks?.side_m).toBe(2);
            expect(villa.setbacks?.rear_m).toBe(2);
            expect(villa.fieldProvenance?.['setback.front']).toBe('ordinance-pdf');
            expect(villa.fieldProvenance?.['setback.side']).toBe('ordinance-pdf');
            expect(villa.fieldProvenance?.['setback.rear']).toBe('ordinance-pdf');
            // The OTHER zone stays the null template — only the chosen class is filled.
            const apt = r.pack.zones.find((z) => z.code === 'sa-apartment')!;
            expect(apt.setbacks?.front_m ?? null).toBeNull();
            // Still `estimated-ruleset` — resolving a setback does not upgrade the tier.
            expect(r.pack.defaultConfidence).toBe('estimated-ruleset');
        }
    });
});
