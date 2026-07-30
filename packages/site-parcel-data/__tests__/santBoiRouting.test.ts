// Envelope Phase 2 (cont.) — Sant Boi de Llobregat (INE 08200), the FOURTH Catalan municipality.
// Mirrors badalonaRouting.test.ts: it asserts the S2 routing boundary, the S5 registration
// DISPOSITION (a cited refusal while the verification gate is closed), and that Barcelona's registry
// answers are byte-identical (no regression, no Sant Boi bleed).

import { describe, it, expect } from 'vitest';
import { BuildableEnvelopeSchema } from '@pryzm/schemas';
import {
    resolveZoneDisposition,
    registeredPackZoneCodes,
    listJurisdictionCoverage,
    BCN_JURISDICTION_ID,
} from '../src/rulepacks/registry.js';
import { isInSantBoi, SANT_BOI_BBOX } from '../src/providers/santBoiBbox.js';
import { isInLHospitalet, LHOSPITALET_BBOX } from '../src/providers/lhospitaletBbox.js';
import { isInBadalona, BADALONA_BBOX } from '../src/providers/badalonaBbox.js';
import { isInBarcelona, BARCELONA_BBOX } from '../src/providers/barcelonaBbox.js';
import {
    SANT_BOI_JURISDICTION_ID,
    SANT_BOI_ENVELOPE_VERIFIED,
    santBoiUnverifiedRefusal,
} from '../src/rulepacks/esSantBoi.js';
import { buildRefusedEnvelope, isRefusedEnvelope } from '../src/rulepacks/zoneRefusal.js';
import { BCN_ENSANCHE_ZONE_CODES } from '../src/rulepacks/esBarcelonaEnsanche.js';
import { BCN_SEMIINTENSIVA_ZONE_CODES } from '../src/rulepacks/esBarcelonaSemiintensiva.js';
import { BCN_20A_AILLADA_ZONE_CODES } from '../src/rulepacks/esBarcelona20aAillada.js';
import { BCN_NUCLI_ANTIC_ZONE_CODES } from '../src/rulepacks/esBarcelonaNucliAntic.js';

// Reference points (WGS84). Sant Boi centre; Barcelona Eixample demo + a Sants point (the Barcelona
// area EAST of and nearest to Sant Boi — the point most at risk of being shadowed by an over-wide box).
const SANT_BOI_CENTRE = { lat: 41.3440, lon: 2.0378 };
const BCN_EIXAMPLE = { lat: 41.3916, lon: 2.1650 };
const BCN_SANTS = { lat: 41.3750, lon: 2.1380 }; // western Barcelona, the nearest dense reference east of Sant Boi

describe('Envelope Phase 2 (cont.) — S2 router predicate (isInSantBoi)', () => {
    it("returns true for Sant Boi's core and false off it", () => {
        expect(isInSantBoi(SANT_BOI_CENTRE.lat, SANT_BOI_CENTRE.lon)).toBe(true);
        expect(isInSantBoi(NaN, 2.04)).toBe(false);
        expect(isInSantBoi(41.34, Number.POSITIVE_INFINITY)).toBe(false);
        expect(isInSantBoi(40.4168, -3.7038)).toBe(false); // Madrid
    });

    it('⚠ MUST NOT shadow a Barcelona reference point — Barcelona stays on the Barcelona path', () => {
        for (const p of [BCN_EIXAMPLE, BCN_SANTS]) {
            expect(isInSantBoi(p.lat, p.lon), `${p.lat},${p.lon}`).toBe(false);
            expect(isInBarcelona(p.lat, p.lon), `${p.lat},${p.lon}`).toBe(true);
        }
    });

    it('⚠ MUST be disjoint from the L\'Hospitalet box (Sant Boi is west of L\'Hospitalet)', () => {
        // Sant Boi is on the east bank of the Llobregat, WEST of L'Hospitalet. Their boxes must not intersect.
        expect(SANT_BOI_BBOX.maxLon).toBeLessThan(LHOSPITALET_BBOX.minLon);
        expect(isInLHospitalet(SANT_BOI_CENTRE.lat, SANT_BOI_CENTRE.lon)).toBe(false);
    });

    it('⚠ MUST be disjoint from the Badalona box (the refusal cities never overlap)', () => {
        // Sant Boi is SW; Badalona is NE (east of the Besòs). Their boxes must not intersect.
        expect(SANT_BOI_BBOX.maxLon).toBeLessThan(BADALONA_BBOX.minLon);
        expect(isInBadalona(SANT_BOI_CENTRE.lat, SANT_BOI_CENTRE.lon)).toBe(false);
    });

    it("Sant Boi's box is a strict subset of the loose Barcelona metro box (why order matters)", () => {
        expect(isInBarcelona(SANT_BOI_CENTRE.lat, SANT_BOI_CENTRE.lon)).toBe(true);
        expect(SANT_BOI_BBOX.minLat).toBeGreaterThanOrEqual(BARCELONA_BBOX.minLat);
        expect(SANT_BOI_BBOX.maxLat).toBeLessThanOrEqual(BARCELONA_BBOX.maxLat);
        expect(SANT_BOI_BBOX.minLon).toBeGreaterThanOrEqual(BARCELONA_BBOX.minLon);
        expect(SANT_BOI_BBOX.maxLon).toBeLessThanOrEqual(BARCELONA_BBOX.maxLon);
        // …and the box stays WEST of central Barcelona (west of Sants ≈ 2.138 E).
        expect(SANT_BOI_BBOX.maxLon).toBeLessThan(2.10);
    });
});

describe('Envelope Phase 2 (cont.) — S5 registration disposition (honest refusal while gate closed)', () => {
    it('the verification gate defaults to CLOSED — no Sant Boi number may render', () => {
        expect(SANT_BOI_ENVELOPE_VERIFIED).toBe(false);
    });

    it('every Sant Boi zone resolves to a REFUSAL — never a borrowed Barcelona pack', () => {
        for (const clau of ['13a', '13b', '12', '20a/2', 'anything']) {
            const d = resolveZoneDisposition(SANT_BOI_JURISDICTION_ID, clau, {
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
        expect(registeredPackZoneCodes(SANT_BOI_JURISDICTION_ID)).toEqual([]);
        const cov = listJurisdictionCoverage().find(
            (c) => c.jurisdictionId === SANT_BOI_JURISDICTION_ID,
        );
        expect(cov, 'Sant Boi must light the coverage globe').toBeDefined();
        expect(cov!.packZoneCodes).toEqual([]);
        expect(cov!.contains(SANT_BOI_CENTRE.lat, SANT_BOI_CENTRE.lon)).toBe(true);
        expect(cov!.contains(BCN_EIXAMPLE.lat, BCN_EIXAMPLE.lon)).toBe(false);
    });

    it('the refusal card names the zone + carries the parcel facts, and is honestly worded', () => {
        const facts = ['Location: Sant Boi de Llobregat', 'Parcel area: 512 m²'];
        const r = santBoiUnverifiedRefusal('13a', 'Densificació urbana', facts);
        expect(r.headline).toContain('13a');
        expect(r.headline).toMatch(/not.*verified|has not.*verified/i);
        expect(r.headline).not.toMatch(/no envelope applies/i);
        expect(r.detail).toMatch(/PGM-1976/);
        expect(r.detail).toMatch(/mis-citation|something wrong/i);
        expect(r.knownFacts).toEqual(facts);
    });

    it('the refused envelope carries NO numbers and NO ring at status `none`', () => {
        const r = santBoiUnverifiedRefusal(null, null, ['Parcel area: 512 m²']);
        const env = buildRefusedEnvelope('sant-boi-pgm-unverified', r, 'none');
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
        const r = santBoiUnverifiedRefusal('13a', 'Densificació urbana', ['Parcel area: 512 m²']);
        const env = buildRefusedEnvelope('sant-boi-pgm-unverified', r); // default 'not-applicable'
        expect(() => BuildableEnvelopeSchema.parse(env)).not.toThrow();
        expect(env.status).toBe('not-applicable');
        expect(isRefusedEnvelope(env)).toBe(true);
    });
});

describe('Envelope Phase 2 (cont.) — Barcelona + Badalona + L\'Hospitalet MUST NOT regress', () => {
    it('Barcelona registry disposition is byte-identical (packs unchanged, no Sant Boi bleed)', () => {
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

    it('the four jurisdictions are distinct ids', () => {
        expect(SANT_BOI_JURISDICTION_ID).toBe('es-08200-sant-boi');
        expect(SANT_BOI_JURISDICTION_ID).not.toBe(BCN_JURISDICTION_ID);
    });
});
