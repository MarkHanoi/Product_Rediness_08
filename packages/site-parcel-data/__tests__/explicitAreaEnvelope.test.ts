// C58 §2.2 (KG-4) / ADR-0270 — the ENGINE-LEVEL integration test for explicit-area zones.
//
// THE ACCEPTANCE CRITERION: an explicit-area zone driven through computeBuildableEnvelope must
// yield an envelope CLIPPED TO THE PUBLISHED FOOTPRINT — and, without a footprint, must HARD-FAIL
// rather than publish the whole parcel. A whole-plot result is the silent defect ADR-0270 exists
// to prevent, and it is the exact state the engine was in before this branch existed.
//
// Synthetic pack + synthetic footprint — jurisdiction-agnostic. Madrid is never referenced.

import { describe, it, expect } from 'vitest';
import {
    JurisdictionZoningContractSchema,
    type JurisdictionZoningContract,
    type Pt,
    type ParcelEdgeClassification,
    type GeometricRule,
} from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../src/index.js';

/** 30 m × 40 m parcel, street edge at z=0. */
const PARCEL: Pt[] = [
    { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 40 }, { x: 0, z: 40 },
];
const EDGES: ParcelEdgeClassification[] = [
    'unclassified', 'unclassified', 'unclassified', 'unclassified',
];

/** A published fondo of depth 20 from the street — a 30×20 band (600 m²) inside the parcel. */
const FOOTPRINT: Pt[] = [
    { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 20 }, { x: 0, z: 20 },
];

const EXPLICIT_RULE: GeometricRule = { kind: 'explicit-area', ringRef: 'generic:footprint/v1' };

/**
 * A minimal explicit-area pack: no setbacks (the ordinance publishes geometry, not distances), one
 * zone, the geometric rule on the zone. Every numeric field null — the footprint IS the rule.
 */
const EXPLICIT_PACK: JurisdictionZoningContract = JurisdictionZoningContractSchema.parse({
    jurisdictionId: 'test-explicit',
    displayName: 'Test — explicit-area',
    source: 'manual',
    crs: 'EPSG:25830',
    lastReviewed: '2026-07-23',
    defaultConfidence: 'estimated-ruleset',
    zones: [
        {
            code: 'explicit-zone',
            label: 'Explicit-area test zone',
            permittedUse: ['residential'],
            maxHeight_m: 15,
            maxFloors: null,
            plotRatioFAR: null,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            geometricRule: EXPLICIT_RULE,
            fieldProvenance: { permittedUse: 'estimated', maxHeight: 'estimated' },
            ordinanceRef: null,
        },
    ],
});

function record() {
    return {
        zoneCode: 'explicit-zone',
        zoneLabel: 'Explicit-area test zone',
        jurisdictionId: 'test-explicit',
        structuredFields: {},
        overlays: [] as string[],
        ordinanceRef: null,
        provenance: {
            source: 'test-explicit',
            label: 'Test explicit-area pack',
            version: '2026-07-23',
            license: null,
            crs: 'EPSG:25830',
        },
    };
}

function solve(footprint: ReadonlyArray<Pt> | null | undefined) {
    return computeBuildableEnvelope({
        parcelRing: PARCEL,
        edgeClassifications: EDGES,
        zoning: record(),
        rulePack: EXPLICIT_PACK,
        explicitAreaFootprint: footprint,
    });
}

describe('C58 §2.2 KG-4 — explicit-area zones END-TO-END through the engine', () => {
    it('THE ACCEPTANCE CRITERION: clips the envelope to the published footprint', () => {
        const env = solve(FOOTPRINT);
        expect(env.status).toBe('ok');
        // Parcel is 1200 m²; the published 600 m² band is the buildable area — NOT the whole plot.
        expect(env.insetAreaM2).toBeCloseTo(600, 4);
        expect(env.insetAreaM2).toBeLessThan(1200);
    });

    it('HARD-FAILS when no footprint is supplied — never a whole-parcel fallback (the ADR-0270 defect)', () => {
        const env = solve(null);
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
        expect(env.caveats.some((c) => /no published buildable footprint/i.test(c))).toBe(true);
    });

    it('states in the caveats that the footprint was applied (C58 §1.3 explain-why)', () => {
        const env = solve(FOOTPRINT);
        expect(env.caveats.some((c) => /published footprint|explicit-area/i.test(c))).toBe(true);
    });

    it('reports when the footprint COVERS the parcel rather than citing a limit that never bit', () => {
        const covering: Pt[] = [
            { x: -5, z: -5 }, { x: 35, z: -5 }, { x: 35, z: 45 }, { x: -5, z: 45 },
        ];
        const env = solve(covering);
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeCloseTo(1200, 4); // whole plot buildable
        expect(env.caveats.some((c) => /COVERS/i.test(c))).toBe(true);
    });

    it('is degenerate when the footprint does not overlap the parcel', () => {
        const far: Pt[] = [
            { x: 100, z: 100 }, { x: 110, z: 100 }, { x: 110, z: 110 }, { x: 100, z: 110 },
        ];
        const env = solve(far);
        expect(env.status).toBe('degenerate');
        expect(env.insetAreaM2).toBe(0);
        expect(env.caveats.some((c) => /does not overlap/i.test(c))).toBe(true);
    });

    it('applies the resolved height to the clipped footprint volume', () => {
        const env = solve(FOOTPRINT);
        // 600 m² × 15 m.
        expect(env.maxVolumeM3).toBeCloseTo(9000, 2);
        expect(env.maxHeight_m).toBe(15);
    });

    it('keeps the mandatory C58 §1.2 confidence label + granularity', () => {
        const env = solve(FOOTPRINT);
        expect(env.confidence).toBe('estimated-ruleset');
        expect(env.granularity).toBe('parcel');
        expect(env.caveats.some((c) => /verify against/i.test(c))).toBe(true);
    });

    it('is DETERMINISTIC (C58 §1.1)', () => {
        expect(JSON.stringify(solve(FOOTPRINT))).toBe(JSON.stringify(solve(FOOTPRINT)));
    });
});
