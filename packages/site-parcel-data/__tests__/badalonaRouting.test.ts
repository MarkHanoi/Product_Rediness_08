// Envelope Phase 2 (cont.) — Badalona (INE 08015), the THIRD Catalan municipality.
// Mirrors lhospitaletRouting.test.ts: it asserts the S2 routing boundary, the S5 registration
// DISPOSITION (a cited refusal while the verification gate is closed), and that Barcelona's registry
// answers are byte-identical (no regression, no Badalona bleed).

import { describe, it, expect } from 'vitest';
import { BuildableEnvelopeSchema } from '@pryzm/schemas';
import {
    resolveZoneDisposition,
    registeredPackZoneCodes,
    listJurisdictionCoverage,
    BCN_JURISDICTION_ID,
} from '../src/rulepacks/registry.js';
import { isInBadalona, BADALONA_BBOX } from '../src/providers/badalonaBbox.js';
import { isInLHospitalet, LHOSPITALET_BBOX } from '../src/providers/lhospitaletBbox.js';
import { isInBarcelona, BARCELONA_BBOX } from '../src/providers/barcelonaBbox.js';
import {
    BADALONA_JURISDICTION_ID,
    BADALONA_ENVELOPE_VERIFIED,
    badalonaUnverifiedRefusal,
} from '../src/rulepacks/esBadalona.js';
import { buildRefusedEnvelope, isRefusedEnvelope } from '../src/rulepacks/zoneRefusal.js';
import { BCN_ENSANCHE_ZONE_CODES } from '../src/rulepacks/esBarcelonaEnsanche.js';
import { BCN_SEMIINTENSIVA_ZONE_CODES } from '../src/rulepacks/esBarcelonaSemiintensiva.js';
import { BCN_20A_AILLADA_ZONE_CODES } from '../src/rulepacks/esBarcelona20aAillada.js';
import { BCN_NUCLI_ANTIC_ZONE_CODES } from '../src/rulepacks/esBarcelonaNucliAntic.js';

// Reference points (WGS84). Badalona centre; Barcelona Eixample demo + a Sant Martí/Besòs point (the
// Barcelona area WEST of and ADJACENT to Badalona — the point most at risk of being shadowed).
const BADALONA_CENTRE = { lat: 41.4500, lon: 2.2470 };
const BCN_EIXAMPLE = { lat: 41.3916, lon: 2.1650 };
const BCN_SANT_MARTI = { lat: 41.4150, lon: 2.2200 }; // easternmost Barcelona, just SW of Badalona's box

describe('Envelope Phase 2 (cont.) — S2 router predicate (isInBadalona)', () => {
    it("returns true for Badalona's core and false off it", () => {
        expect(isInBadalona(BADALONA_CENTRE.lat, BADALONA_CENTRE.lon)).toBe(true);
        expect(isInBadalona(NaN, 2.24)).toBe(false);
        expect(isInBadalona(41.45, Number.POSITIVE_INFINITY)).toBe(false);
        expect(isInBadalona(40.4168, -3.7038)).toBe(false); // Madrid
    });

    it('⚠ MUST NOT shadow a Barcelona reference point — Barcelona stays on the Barcelona path', () => {
        for (const p of [BCN_EIXAMPLE, BCN_SANT_MARTI]) {
            expect(isInBadalona(p.lat, p.lon), `${p.lat},${p.lon}`).toBe(false);
            expect(isInBarcelona(p.lat, p.lon), `${p.lat},${p.lon}`).toBe(true);
        }
    });

    it('⚠ MUST be disjoint from the L\'Hospitalet box (the two refusal cities never overlap)', () => {
        // Badalona is NE (east of the Besòs); L'Hospitalet is SW. Their boxes must not intersect.
        expect(BADALONA_BBOX.minLon).toBeGreaterThan(LHOSPITALET_BBOX.maxLon);
        expect(isInLHospitalet(BADALONA_CENTRE.lat, BADALONA_CENTRE.lon)).toBe(false);
    });

    it("Badalona's box is a strict subset of the loose Barcelona metro box (why order matters)", () => {
        expect(isInBarcelona(BADALONA_CENTRE.lat, BADALONA_CENTRE.lon)).toBe(true);
        expect(BADALONA_BBOX.minLat).toBeGreaterThanOrEqual(BARCELONA_BBOX.minLat);
        expect(BADALONA_BBOX.maxLat).toBeLessThanOrEqual(BARCELONA_BBOX.maxLat);
        expect(BADALONA_BBOX.minLon).toBeGreaterThanOrEqual(BARCELONA_BBOX.minLon);
        expect(BADALONA_BBOX.maxLon).toBeLessThanOrEqual(BARCELONA_BBOX.maxLon);
        // …and the box stays EAST of central Barcelona (east of Sant Martí ≈ 2.21 E).
        expect(BADALONA_BBOX.minLon).toBeGreaterThan(2.21);
    });
});

describe('Envelope Phase 2 (cont.) — S5 registration disposition (honest refusal while gate closed)', () => {
    it('the verification gate defaults to CLOSED — no Badalona number may render', () => {
        expect(BADALONA_ENVELOPE_VERIFIED).toBe(false);
    });

    it('every Badalona zone resolves to a REFUSAL — never a borrowed Barcelona pack', () => {
        for (const clau of ['13a', '13b', '12', '20a/2', 'anything']) {
            const d = resolveZoneDisposition(BADALONA_JURISDICTION_ID, clau, {
                zoneLabel: 'Densificació urbana',
            });
            expect(d.kind, clau).toBe('refusal');
            if (d.kind !== 'refusal') continue;
            expect(d.refusal.legallyGrounded, clau).toBe(false);
            expect(d.refusal.ordinanceRef, clau).toBeNull();
            expect(d.refusal.code, clau).toBe('no-rule-pack');
        }
    });

    it('registers ZERO packs so the coverage globe shows a routed-but-refusing city', () => {
        expect(registeredPackZoneCodes(BADALONA_JURISDICTION_ID)).toEqual([]);
        const cov = listJurisdictionCoverage().find(
            (c) => c.jurisdictionId === BADALONA_JURISDICTION_ID,
        );
        expect(cov, 'Badalona must light the coverage globe').toBeDefined();
        expect(cov!.packZoneCodes).toEqual([]);
        expect(cov!.contains(BADALONA_CENTRE.lat, BADALONA_CENTRE.lon)).toBe(true);
        expect(cov!.contains(BCN_EIXAMPLE.lat, BCN_EIXAMPLE.lon)).toBe(false);
    });

    it('the refusal card names the zone + carries the parcel facts, and is honestly worded', () => {
        const facts = ['Location: Badalona', 'Parcel area: 512 m²'];
        const r = badalonaUnverifiedRefusal('13a', 'Densificació urbana', facts);
        expect(r.headline).toContain('13a');
        expect(r.headline).toMatch(/not.*verified|has not.*verified/i);
        expect(r.headline).not.toMatch(/no envelope applies/i);
        expect(r.detail).toMatch(/PGM-1976/);
        expect(r.detail).toMatch(/mis-citation|something wrong/i);
        expect(r.knownFacts).toEqual(facts);
    });

    it('the refused envelope carries NO numbers and NO ring at status `none`', () => {
        const r = badalonaUnverifiedRefusal(null, null, ['Parcel area: 512 m²']);
        const env = buildRefusedEnvelope('badalona-pgm-unverified', r, 'none');
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
        const r = badalonaUnverifiedRefusal('13a', 'Densificació urbana', ['Parcel area: 512 m²']);
        const env = buildRefusedEnvelope('badalona-pgm-unverified', r); // default 'not-applicable'
        expect(() => BuildableEnvelopeSchema.parse(env)).not.toThrow();
        expect(env.status).toBe('not-applicable');
        expect(isRefusedEnvelope(env)).toBe(true);
    });
});

describe('Envelope Phase 2 (cont.) — Barcelona + L\'Hospitalet MUST NOT regress', () => {
    it('Barcelona registry disposition is byte-identical (packs unchanged, no Badalona bleed)', () => {
        expect(registeredPackZoneCodes(BCN_JURISDICTION_ID)).toEqual([
            ...BCN_ENSANCHE_ZONE_CODES,
            ...BCN_SEMIINTENSIVA_ZONE_CODES,
            ...BCN_20A_AILLADA_ZONE_CODES,
            ...BCN_NUCLI_ANTIC_ZONE_CODES,
        ]);
        const d = resolveZoneDisposition(BCN_JURISDICTION_ID, '13a');
        expect(d.kind).toBe('pack');
        if (d.kind === 'pack') expect(d.pack.jurisdictionId).toBe(BCN_JURISDICTION_ID);
    });

    it('the three jurisdictions are distinct ids', () => {
        expect(BADALONA_JURISDICTION_ID).toBe('es-08015-badalona');
        expect(BADALONA_JURISDICTION_ID).not.toBe(BCN_JURISDICTION_ID);
    });
});
