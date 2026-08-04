// ADR-0288 / §COR-MC-FOOTPRINT — the `occupation-capped-alignment` envelope, solved end to end.
//
// ⚠ DELIBERATELY NOT DRIVEN THROUGH THE CÓRDOBA PACK. This suite proves the CAPABILITY in
// isolation, using a synthetic fixture pack, exactly as the task that added it required: the
// kind is built and tested standalone FIRST, and wiring it to any real jurisdiction (Córdoba MC
// or otherwise) is a separate, later decision gated on genuine confidence, not on these tests
// passing. `esCordobaEnvelopeCompute.test.ts`'s MC assertions (structural refusal via
// `explicit-area`) are UNCHANGED by this file and must keep passing.
//
// WHAT THIS FILE GUARDS
// ----------------------
//   1. The occupation cap actually BINDS the depth — a parcel deep enough that the cap matters
//      must NOT draw the whole rear-bounded inset.
//   2. A parcel too SHALLOW for the cap to matter draws the full inset, untruncated — truncating
//      an already-compliant ring would under-state real buildable area (`capInactive`).
//   3. No `maxCoverage` held ⇒ HARD REFUSAL, never a full-parcel fall-through (the same L-616
//      guard every other footprint-shaping kind carries).
//   4. No front edge ⇒ HARD REFUSAL (the alineación cannot be located).
//   5. The caveat LOUDLY labels the shape as a PRYZM engineering decision, not an ordinance fact
//      — the whole reason option (a) was chosen over silently shipping an unlabelled shape.

import { describe, it, expect } from 'vitest';
import type { Pt, ParcelEdgeClassification, ZoningRecord, JurisdictionZoningContract } from '@pryzm/schemas';
import { JurisdictionZoningContractSchema } from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/index.js';

/** 20 m wide (x) × 50 m deep (z) — deep enough for a 70 % cap to genuinely bind. Edge 0 (z=0) is
 *  the street frontage, matching the Córdoba fixture convention used elsewhere in this package. */
const DEEP_PARCEL: Pt[] = [
    { x: 0, z: 0 },
    { x: 20, z: 0 },
    { x: 20, z: 50 },
    { x: 0, z: 50 },
];
/** 20 × 10 m — shallow enough that even 100 % coverage never reaches a 70 % cap of a deeper plot;
 *  used to prove the cap does not bind here. */
const SHALLOW_PARCEL: Pt[] = [
    { x: 0, z: 0 },
    { x: 20, z: 0 },
    { x: 20, z: 10 },
    { x: 0, z: 10 },
];
const WITH_FRONT: ParcelEdgeClassification[] = ['front', 'side', 'rear', 'side'];
const ALL_UNCLASSIFIED: ParcelEdgeClassification[] = [
    'unclassified', 'unclassified', 'unclassified', 'unclassified',
];

const JURISDICTION_ID = 'test-occupation-capped-alignment';

function fixturePack(maxCoverage: number | null): JurisdictionZoningContract {
    return JurisdictionZoningContractSchema.parse({
        jurisdictionId: JURISDICTION_ID,
        displayName: 'Fixture — occupation-capped alignment',
        source: 'manual',
        crs: 'EPSG:4326',
        lastReviewed: '2026-08-04',
        defaultConfidence: 'estimated-ruleset',
        zones: [{
            code: 'TEST-OCA',
            label: 'Occupation-capped alignment test zone',
            permittedUse: ['residential'],
            maxHeight_m: 10,
            maxFloors: 3,
            plotRatioFAR: null,
            maxCoverage,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: {
                kind: 'occupation-capped-alignment',
                alignTo: 'street',
                alignmentOffset_m: 0,
                sideTreatment: 'party-wall',
            },
            fieldProvenance: { maxCoverage: 'estimated', permittedUse: 'estimated' },
            ordinanceRef: 'Fixture — no real ordinance (ADR-0288 isolation test).',
        }],
    });
}

function zoning(): ZoningRecord {
    return {
        zoneCode: 'TEST-OCA',
        zoneLabel: 'TEST-OCA',
        jurisdictionId: JURISDICTION_ID,
        structuredFields: {},
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: JURISDICTION_ID, label: 'Fixture (test)', version: '2026-08-04',
            license: null, crs: 'EPSG:4326',
        },
    };
}

function solve(parcelRing: Pt[], maxCoverage: number | null, edges = WITH_FRONT) {
    return computeBuildableEnvelope({
        parcelRing,
        edgeClassifications: edges,
        zoning: zoning(),
        rulePack: fixturePack(maxCoverage),
    });
}

describe('ADR-0288 — occupation cap BINDS on a deep parcel', () => {
    it('yields status:ok with a footprint AREA close to the cap, strictly less than the parcel', () => {
        const env = solve(DEEP_PARCEL, 0.7);
        expect(env.status).toBe('ok');
        const parcelArea = 20 * 50;
        expect(env.insetAreaM2).toBeGreaterThan(0);
        expect(env.insetAreaM2).toBeLessThan(parcelArea);
        // Rectangle-at-frontage-width construction on a rectangular parcel: area should land
        // very close to 70 % of the parcel (the bisection's own target).
        expect(env.insetAreaM2).toBeCloseTo(parcelArea * 0.7, 0);
    });

    it('emits the occupationCap derivation rows (ratio, target area, constructed depth)', () => {
        const env = solve(DEEP_PARCEL, 0.7);
        expect(env.derivation.some((d) => d.constraint === 'occupationCap.ratio' && d.value === 0.7)).toBe(true);
        expect(env.derivation.some((d) => d.constraint === 'occupationCap.targetAreaM2')).toBe(true);
        expect(env.derivation.some((d) => d.constraint === 'occupationCap.depth_m')).toBe(true);
    });

    it('the caveat LOUDLY labels the footprint as a PRYZM engineering decision, not an ordinance shape', () => {
        const env = solve(DEEP_PARCEL, 0.7);
        expect(env.caveats.some((c) => /PRYZM-CONSTRUCTED FOOTPRINT/.test(c))).toBe(true);
        expect(env.caveats.some((c) => /ENGINEERING DECISION/.test(c))).toBe(true);
    });

    it('a footprint-shaping rule ⇒ never flagged footprintIsUpperBound (it IS a solved shape choice)', () => {
        const env = solve(DEEP_PARCEL, 0.7);
        expect(env.footprintIsUpperBound).toBe(false);
    });
});

describe('ADR-0288 — occupation cap does NOT bind when the cap covers the whole inset', () => {
    // With this fixture's front alignment (offset 0) and party-wall sides, the un-truncated
    // inset IS the whole parcel — so a 100 % ocupación cap targets exactly that area and cannot
    // reduce it. This isolates `capInactive` from parcel DEPTH (which the earlier draft of this
    // test conflated: a 70 % cap of THIS fixture's full-parcel inset always binds, on any depth,
    // because the inset never shrinks on its own — the cap is the only thing that can).
    it('returns the FULL inset, untruncated, and says so (capInactive)', () => {
        const env = solve(SHALLOW_PARCEL, 1.0);
        expect(env.status).toBe('ok');
        const parcelArea = 20 * 10;
        expect(env.insetAreaM2).toBeCloseTo(parcelArea, 6);
        expect(env.caveats.some((c) => /does NOT.*bind/.test(c))).toBe(true);
        // No constructed-depth row when the cap never bound.
        expect(env.derivation.some((d) => d.constraint === 'occupationCap.depth_m')).toBe(false);
    });
});

describe('ADR-0288 — hard refusals (never a full-parcel fall-through)', () => {
    it('refuses when no maxCoverage is held — nothing to construct the footprint from', () => {
        const env = solve(DEEP_PARCEL, null);
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
    });

    it('refuses when no front edge is classified — the alineación cannot be located', () => {
        const env = solve(DEEP_PARCEL, 0.7, ALL_UNCLASSIFIED);
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
    });
});
