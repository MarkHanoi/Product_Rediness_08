// L-608 — the Madrid (INE 28079) PGOUM-97 Norma Zonal 1 pack.
//
// WHAT THESE TESTS GUARD
// ----------------------
// NZ 1 is the FIRST `explicit-area` zone: the ordinance publishes the buildable footprint as
// GEOMETRY, so the pack ships every numeric field null and a `ringRef` handle instead. These tests
// pin three properties:
//   1. the pack PARSES at load (it runs `JurisdictionZoningContractSchema.parse` at module load, a
//      runtime throw `tsc` says nothing about), its rule kind is `explicit-area`, and every numeric
//      field is a null FINDING (not "to be filled later" — the geometry IS the rule);
//   2. Madrid REFUSES today — `resolveZoneDisposition` answers `refusal` for a Madrid parcel, and
//      the refusal is a valid, cited `source-data-unavailable` statement (never a fabricated number)
//      while the footprint is unresolvable and the zone code unverified;
//   3. WHEN a published footprint IS injected, the engine's `explicit-area` branch clips the parcel
//      to it and renders — and WITHOUT one it refuses (status `degenerate`), never a whole-parcel box.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification, ZoningRecord } from '@pryzm/schemas';
import { EnvelopeRefusalSchema } from '@pryzm/schemas';
import {
    ES_MADRID_NZ1_PACK,
    MADRID_NZ1_RULE,
    MADRID_NZ1_ZONE_CODES,
    MADRID_JURISDICTION_ID,
    madridNZ1Refusal,
    isInMadrid,
    resolveZoneDisposition,
    computeBuildableEnvelope,
} from '../src/index.js';

const zone = () => ES_MADRID_NZ1_PACK.zones[0]!;

describe('L-608 — the Madrid NZ 1 pack is VALID (parses at load)', () => {
    it('parsed the schema without throwing, with the expected identity', () => {
        expect(ES_MADRID_NZ1_PACK.jurisdictionId).toBe('es-28079-madrid');
        expect(MADRID_JURISDICTION_ID).toBe('es-28079-madrid');
        expect(ES_MADRID_NZ1_PACK.source).toBe('madrid-pgou');
        // The municipal ArcGIS planes publish in UTM 30N / ETRS89.
        expect(ES_MADRID_NZ1_PACK.crs).toBe('EPSG:25830');
        // A pack cannot self-certify; the footprint is not yet resolved.
        expect(ES_MADRID_NZ1_PACK.defaultConfidence).toBe('estimated-ruleset');
        expect(ES_MADRID_NZ1_PACK.zones).toHaveLength(1);
        expect(zone().code).toBe('NZ1');
        expect(zone().permittedUse).toEqual(['residential']);
    });

    it('the rule is `explicit-area` carrying ONLY a versioned ringRef (geometry never inlined)', () => {
        expect(MADRID_NZ1_RULE.kind).toBe('explicit-area');
        expect(zone().geometricRule).toEqual(MADRID_NZ1_RULE);
        // The handle the provider-side resolver answers for.
        expect(MADRID_NZ1_RULE).toHaveProperty('ringRef', 'madrid-nz1:fondo-condiciones/v-2023');
    });

    it('EVERY numeric field is a null FINDING — the geometry IS the rule, resolved externally', () => {
        const z = zone();
        expect(z.maxHeight_m).toBeNull();
        expect(z.maxFloors).toBeNull();
        // COEF_Z is per-manzana live data, NOT a zone constant → plotRatioFAR stays null here.
        expect(z.plotRatioFAR).toBeNull();
        expect(z.maxCoverage).toBeNull();
        expect(z.setbacks).toEqual({ front_m: null, side_m: null, rear_m: null });
    });

    it('the zone code(s) it answers for are the (still-placeholder) NZ 1 set', () => {
        expect([...MADRID_NZ1_ZONE_CODES]).toEqual(['NZ1']);
    });
});

describe('L-608 — Madrid REFUSES today (zone-code unverified + footprint unresolvable)', () => {
    it('isInMadrid gates the municipal term, not Barcelona', () => {
        expect(isInMadrid(40.4168, -3.7038)).toBe(true); // Puerta del Sol
        expect(isInMadrid(41.3874, 2.1686)).toBe(false); // Barcelona
        expect(isInMadrid(55.6761, 12.5683)).toBe(false); // Copenhagen
        expect(isInMadrid(NaN, NaN)).toBe(false);
    });

    it('resolveZoneDisposition answers `refusal` (never `pack`) for a Madrid parcel', () => {
        const d = resolveZoneDisposition(MADRID_JURISDICTION_ID, 'NZ1');
        expect(d.kind).toBe('refusal');
        if (d.kind === 'refusal') {
            expect(d.refusal.code).toBe('source-data-unavailable');
            expect(d.refusal.legallyGrounded).toBe(false);
        }
        // No code maps to a pack yet — even an arbitrary code refuses, it never resolves a pack.
        expect(resolveZoneDisposition(MADRID_JURISDICTION_ID, 'anything').kind).toBe('refusal');
    });

    it('madridNZ1Refusal is a VALID, cited refusal — no fabricated number', () => {
        const r = madridNZ1Refusal(['Zone: Norma Zonal 1 (NZ1)']);
        // Validates against the schema (would throw on a malformed refusal).
        const parsed = EnvelopeRefusalSchema.parse(r);
        expect(parsed.code).toBe('source-data-unavailable');
        expect(parsed.legallyGrounded).toBe(false);
        // Cites PGOUM-97 for the LEGAL claim (NZ 1 is published as geometry), never for a number.
        expect(parsed.ordinanceRef).toContain('PGOUM-97');
        expect(parsed.knownFacts).toContain('Zone: Norma Zonal 1 (NZ1)');
    });
});

describe('L-608 — the explicit-area engine branch: renders WITH a footprint, refuses WITHOUT', () => {
    // 40 m × 20 m rectangle parcel (convex), edges unclassified.
    const PARCEL: Pt[] = [
        { x: 0, z: 0 },
        { x: 40, z: 0 },
        { x: 40, z: 20 },
        { x: 0, z: 20 },
    ];
    const UNCLASSIFIED: ParcelEdgeClassification[] = [
        'unclassified',
        'unclassified',
        'unclassified',
        'unclassified',
    ];
    // A published footprint that only covers the front 10 m band (area 400 m²).
    const FOOTPRINT: Pt[] = [
        { x: 0, z: 0 },
        { x: 40, z: 0 },
        { x: 40, z: 10 },
        { x: 0, z: 10 },
    ];
    const record: ZoningRecord = {
        zoneCode: 'NZ1',
        zoneLabel: 'Norma Zonal 1',
        jurisdictionId: MADRID_JURISDICTION_ID,
        structuredFields: {},
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: 'madrid-pgoum',
            label: 'PGOUM-97 PG_CONDICIONES_EDIFICACION',
            version: null,
            license: null,
            crs: 'EPSG:25830',
        },
    };

    it('WITH the published footprint injected → clips the parcel to it (status ok)', () => {
        const env = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: UNCLASSIFIED,
            zoning: record,
            rulePack: ES_MADRID_NZ1_PACK,
            explicitAreaFootprint: FOOTPRINT,
        });
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeGreaterThan(0);
        // The footprint bit — the buildable area is the 400 m² band, not the 800 m² parcel.
        expect(env.insetAreaM2).toBeLessThan(600);
    });

    it('WITHOUT a footprint → REFUSES (degenerate), never a whole-parcel box', () => {
        const env = computeBuildableEnvelope({
            parcelRing: PARCEL,
            edgeClassifications: UNCLASSIFIED,
            zoning: record,
            rulePack: ES_MADRID_NZ1_PACK,
            // explicitAreaFootprint deliberately omitted.
        });
        expect(env.status).toBe('degenerate');
        expect(env.insetPolygon).toHaveLength(0);
    });
});
