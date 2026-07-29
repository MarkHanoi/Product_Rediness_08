// Envelope Phase 2 — L'Hospitalet de Llobregat (INE 08101), the SECOND Catalan municipality.
//
// WHAT THESE TESTS GUARD
// ----------------------
// The whole point of Phase 2 is to PROVE "add-a-city = data at five slots" without regressing the
// one city that works. Two failures would be silent:
//   • an L'Hospitalet parcel routed into the Barcelona branch (stamped es-08019 packs — a
//     mis-citation on another municipality's land); or
//   • the new predicate shadowing a Barcelona reference point (Barcelona regresses).
// So these assert the ROUTING boundary directly (S2 predicate), the S5 registration DISPOSITION
// (a cited refusal, honestly coded, while the verification gate is closed), and that Barcelona's
// registry answers are byte-identical.

import { describe, it, expect } from 'vitest';
import { BuildableEnvelopeSchema } from '@pryzm/schemas';
import {
    resolveZoneDisposition,
    registeredPackZoneCodes,
    listJurisdictionCoverage,
    BCN_JURISDICTION_ID,
} from '../src/rulepacks/registry.js';
import {
    isInLHospitalet,
    LHOSPITALET_BBOX,
} from '../src/providers/lhospitaletBbox.js';
import { isInBarcelona, BARCELONA_BBOX } from '../src/providers/barcelonaBbox.js';
import {
    LHOSPITALET_JURISDICTION_ID,
    LHOSPITALET_ENVELOPE_VERIFIED,
    lhospitaletUnverifiedRefusal,
} from '../src/rulepacks/esLHospitalet.js';
import { buildRefusedEnvelope, isRefusedEnvelope } from '../src/rulepacks/zoneRefusal.js';
import { BCN_ENSANCHE_ZONE_CODES } from '../src/rulepacks/esBarcelonaEnsanche.js';
import { BCN_SEMIINTENSIVA_ZONE_CODES } from '../src/rulepacks/esBarcelonaSemiintensiva.js';
import { BCN_20A_AILLADA_ZONE_CODES } from '../src/rulepacks/esBarcelona20aAillada.js';
import { BCN_NUCLI_ANTIC_ZONE_CODES } from '../src/rulepacks/esBarcelonaNucliAntic.js';

// Reference points (WGS84). L'Hospitalet centre; Barcelona Eixample demo (Passeig de Gràcia) +
// Sants (the Barcelona district ADJACENT to L'Hospitalet — the point most at risk of shadowing).
const LHOSPITALET_CENTRE = { lat: 41.3593, lon: 2.1004 };
const BCN_EIXAMPLE = { lat: 41.3916, lon: 2.1650 };
const BCN_SANTS = { lat: 41.3750, lon: 2.1380 };

describe('Envelope Phase 2 — S2 router predicate (isInLHospitalet)', () => {
    it("returns true for L'Hospitalet's core and false off it", () => {
        expect(isInLHospitalet(LHOSPITALET_CENTRE.lat, LHOSPITALET_CENTRE.lon)).toBe(true);
        // Non-finite / far away → false, never throws.
        expect(isInLHospitalet(NaN, 2.1)).toBe(false);
        expect(isInLHospitalet(41.3593, Number.POSITIVE_INFINITY)).toBe(false);
        expect(isInLHospitalet(40.4168, -3.7038)).toBe(false); // Madrid
    });

    it('⚠ MUST NOT shadow a Barcelona reference point — Barcelona stays on the Barcelona path', () => {
        // The load-bearing non-regression assertion. Both central Eixample AND the adjacent Sants
        // district must be OUTSIDE the L'Hospitalet box, so the dispatcher (which checks
        // isInLHospitalet first, then isInBarcelona) leaves them on the Barcelona branch untouched.
        for (const p of [BCN_EIXAMPLE, BCN_SANTS]) {
            expect(isInLHospitalet(p.lat, p.lon), `${p.lat},${p.lon}`).toBe(false);
            expect(isInBarcelona(p.lat, p.lon), `${p.lat},${p.lon}`).toBe(true);
        }
    });

    it("L'Hospitalet's box is a strict subset of the loose Barcelona metro box (why order matters)", () => {
        // L'Hospitalet is INSIDE the Barcelona metro box by design (the box "keeps the whole AMB
        // in"), which is exactly why the dispatcher must test isInLHospitalet FIRST. Pin that the
        // centre satisfies BOTH predicates, so only ordering — not geometry — keeps them disjoint.
        expect(isInBarcelona(LHOSPITALET_CENTRE.lat, LHOSPITALET_CENTRE.lon)).toBe(true);
        expect(LHOSPITALET_BBOX.minLat).toBeGreaterThanOrEqual(BARCELONA_BBOX.minLat);
        expect(LHOSPITALET_BBOX.maxLat).toBeLessThanOrEqual(BARCELONA_BBOX.maxLat);
        expect(LHOSPITALET_BBOX.minLon).toBeGreaterThanOrEqual(BARCELONA_BBOX.minLon);
        expect(LHOSPITALET_BBOX.maxLon).toBeLessThanOrEqual(BARCELONA_BBOX.maxLon);
        // …and the box stays clear of central Barcelona (west of Sants ≈ 2.138 E).
        expect(LHOSPITALET_BBOX.maxLon).toBeLessThan(2.138);
    });
});

describe('Envelope Phase 2 — S5 registration disposition (honest refusal while gate closed)', () => {
    it('the verification gate defaults to CLOSED — no L\'Hospitalet number may render', () => {
        expect(LHOSPITALET_ENVELOPE_VERIFIED).toBe(false);
    });

    it('every L\'Hospitalet zone resolves to a REFUSAL — never a borrowed Barcelona pack', () => {
        // `packsByZone` is empty; `noRulePackRefusal` answers, so any clau string refuses.
        for (const clau of ['13a', '13b', '12', '20a/2', 'anything']) {
            const d = resolveZoneDisposition(LHOSPITALET_JURISDICTION_ID, clau, {
                zoneLabel: 'Densificació urbana',
            });
            expect(d.kind, clau).toBe('refusal');
            if (d.kind !== 'refusal') continue;
            // ⚠ THE LOAD-BEARING ASSERTION. It is a statement about PRYZM's verification, NEVER a
            // legal "no envelope applies here" — the PGM DOES grant an envelope on this AMB plot.
            expect(d.refusal.legallyGrounded, clau).toBe(false);
            expect(d.refusal.ordinanceRef, clau).toBeNull();
            expect(d.refusal.code, clau).toBe('no-rule-pack');
        }
    });

    it('registers ZERO packs (no reused-BCN pack) so the coverage globe shows a routed-but-refusing city', () => {
        expect(registeredPackZoneCodes(LHOSPITALET_JURISDICTION_ID)).toEqual([]);
        const cov = listJurisdictionCoverage().find(
            (c) => c.jurisdictionId === LHOSPITALET_JURISDICTION_ID,
        );
        expect(cov, "L'Hospitalet must light the coverage globe").toBeDefined();
        expect(cov!.packZoneCodes).toEqual([]);
        // The registered `contains` IS the dispatcher's routing predicate (no copy).
        expect(cov!.contains(LHOSPITALET_CENTRE.lat, LHOSPITALET_CENTRE.lon)).toBe(true);
        expect(cov!.contains(BCN_EIXAMPLE.lat, BCN_EIXAMPLE.lon)).toBe(false);
    });

    it('the refusal card names the zone + carries the parcel facts, and is honestly worded', () => {
        const facts = ["Location: L'Hospitalet de Llobregat", 'Parcel area: 512 m²'];
        const r = lhospitaletUnverifiedRefusal('13a', 'Densificació urbana', facts);
        expect(r.headline).toContain('13a');
        // Routed + shares the ordinance, but not yet verified — never "no envelope applies".
        expect(r.headline).toMatch(/not.*verified|has not.*verified/i);
        expect(r.headline).not.toMatch(/no envelope applies/i);
        expect(r.detail).toMatch(/PGM-1976/);
        expect(r.detail).toMatch(/mis-citation|something wrong/i);
        expect(r.knownFacts).toEqual(facts);
    });

    it('the refused envelope carries NO numbers and NO ring (not extrudable) at status `none`', () => {
        // The dispatcher builds this with status `'none'` (attempted, value WITHHELD pending
        // verification — NOT `'not-applicable'`, which would assert the ordinance grants no
        // envelope). Like the L-574 construction-incomplete refusal, this literal never goes
        // through `.parse()` in production (dispatchEnvelope consumes it directly), so the fields
        // are asserted directly — see the schema-parse case below for the parseable default form.
        const r = lhospitaletUnverifiedRefusal(null, null, ['Parcel area: 512 m²']);
        const env = buildRefusedEnvelope('lhospitalet-pgm-unverified', r, 'none');
        expect(isRefusedEnvelope(env)).toBe(true);
        expect(env.status).toBe('none');
        expect(env.confidence).toBe('not-determined');
        expect(env.insetPolygon).toEqual([]);
        expect(env.insetAreaM2).toBe(0);
        expect(env.maxHeight_m).toBeNull();
        expect(env.maxFloors).toBeNull();
        expect(env.maxFAR).toBeNull();
        expect(env.maxVolumeM3).toBeNull();
    });

    it('the refusal is schema-valid (refusal ⇔ not-applicable refinement holds)', () => {
        // Prove the refusal object itself is well-formed against the C58 schema via the parseable
        // default status. `knownFacts` is attached (production `attach()` step).
        const r = lhospitaletUnverifiedRefusal('13a', 'Densificació urbana', ['Parcel area: 512 m²']);
        const env = buildRefusedEnvelope('lhospitalet-pgm-unverified', r); // default 'not-applicable'
        expect(() => BuildableEnvelopeSchema.parse(env)).not.toThrow();
        expect(env.status).toBe('not-applicable');
        expect(isRefusedEnvelope(env)).toBe(true);
    });
});

describe('Envelope Phase 2 — Barcelona MUST NOT regress', () => {
    it('Barcelona registry disposition is byte-identical (packs unchanged, no L\'Hospitalet bleed)', () => {
        // The exact assertion zoneRegistryAndRefusals.test.ts makes — restated here so a bad merge
        // that let L'Hospitalet mutate the BCN packMap fails in THIS file too.
        expect(registeredPackZoneCodes(BCN_JURISDICTION_ID)).toEqual([
            ...BCN_ENSANCHE_ZONE_CODES,
            ...BCN_SEMIINTENSIVA_ZONE_CODES,
            ...BCN_20A_AILLADA_ZONE_CODES,
            ...BCN_NUCLI_ANTIC_ZONE_CODES,
        ]);
        // 13a still resolves to the Barcelona pack, under the Barcelona jurisdiction.
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '13a');
        expect(d.kind).toBe('pack');
        if (d.kind === 'pack') expect(d.pack.jurisdictionId).toBe(BCN_JURISDICTION_ID);
    });

    it("the two jurisdictions are distinct ids — L'Hospitalet is NOT Barcelona", () => {
        expect(LHOSPITALET_JURISDICTION_ID).not.toBe(BCN_JURISDICTION_ID);
        expect(LHOSPITALET_JURISDICTION_ID).toBe('es-08101-hospitalet');
    });
});
