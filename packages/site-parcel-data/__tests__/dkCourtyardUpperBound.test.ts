// §L-619 — Copenhagen karré COURTYARD + the full-parcel UPPER-BOUND honesty flag (TASK 1).
//
// The founder's bug: a Copenhagen envelope filled the FULL parcel (1,116 m²) because DK Plandata
// publishes no structured setbacks, so the engine inset by 0 → whole parcel, drawn as a confident
// solid. Two honest fixes, both proven here:
//   A. UPPER-BOUND FLAG — a full-parcel footprint built from UNKNOWN setbacks (no footprint-shaping
//      rule) is marked `footprintIsUpperBound`, so the renderer hatches it. The L-616 FAR/height
//      fields are untouched.
//   B. COURTYARD CARVE — with a block ring the SAME `block-derived-alignment` machinery Barcelona
//      uses carves a perimeter depth band, leaving the interior as courtyard. No new machinery.

import { describe, it, expect } from 'vitest';
import type { ParcelEdgeClassification, Pt, ZoningRecord } from '@pryzm/schemas';
import {
    computeBuildableEnvelope,
    DK_PERIMETER_BLOCK_COURTYARD_RULE,
    ESTIMATED_DEFAULT_PACK,
    estimatedDefaultZoningRecord,
} from '../src/index.js';

function rect(x0: number, z0: number, x1: number, z1: number): Pt[] {
    return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}
const UNCLASSIFIED = ['unclassified', 'unclassified', 'unclassified', 'unclassified'] as const;

/** A DK-style structured record: real height + FAR, but setbacks are NULL (Plandata publishes none). */
function dkStructuredRecord(over?: Partial<ZoningRecord['structuredFields']>): ZoningRecord {
    return {
        zoneCode: 'DK-LOKALPLAN',
        zoneLabel: 'Copenhagen lokalplan',
        jurisdictionId: 'dk',
        structuredFields: {
            maxHeight_m: 24,
            maxFloors: null,
            plotRatioFAR: 1.5,
            maxCoverage: null,
            setbacks: { front_m: null, side_m: null, rear_m: null },
            permittedUse: ['residential'],
            ...over,
        },
        overlays: [],
        ordinanceRef: 'https://dokument.plandata.dk/plan-123',
        provenance: {
            source: 'plandata-dk', label: 'Plandata.dk', version: '2026-07-26',
            license: 'Open public data', crs: 'EPSG:25832',
        },
    } as ZoningRecord;
}

describe('TASK 1.A — full-parcel footprint from UNKNOWN setbacks is an UPPER BOUND', () => {
    it('flags the DK full-parcel envelope, and PROTECTS the L-616 height + FAR cap', () => {
        const parcel = rect(0, 0, 40, 28); // 1120 m² ≈ the founder's 1,116 m² Copenhagen parcel
        const env = computeBuildableEnvelope({
            parcelRing: parcel,
            edgeClassifications: [...UNCLASSIFIED],
            zoning: dkStructuredRecord(),
            rulePack: null, // structured-only — the DK path
        });
        expect(env.status).toBe('ok');
        // A — the footprint is the whole parcel, MARKED as an upper bound (not a confident solid).
        expect(env.insetAreaM2).toBeCloseTo(1120, 6);
        expect(env.footprintIsUpperBound).toBe(true);
        expect(env.caveats.some((c) => /UPPER BOUND/i.test(c) && /courtyard/i.test(c))).toBe(true);
        // Protected — L-616 still caps the massing height by FAR (1.5 → ~4.5 m inside the 24 m shell).
        expect(env.maxHeight_m).toBe(24);
        expect(env.farLimitedHeight_m).not.toBeNull();
        expect(env.farLimitedHeight_m!).toBeLessThan(24);
        expect(env.farLimitedHeight_m!).toBeCloseTo(4.5, 6);
    });

    it('does NOT flag a zone with RESOLVED setbacks (the estimated-default pack)', () => {
        // The generic estimate ships real (estimated) setbacks, so it insets by a real amount — its
        // footprint is a genuine (estimated) area, never a full-parcel upper bound.
        const env = computeBuildableEnvelope({
            parcelRing: rect(0, 0, 40, 28),
            edgeClassifications: [...UNCLASSIFIED],
            zoning: estimatedDefaultZoningRecord(),
            rulePack: ESTIMATED_DEFAULT_PACK,
        });
        expect(env.status).toBe('ok');
        expect(env.footprintIsUpperBound).toBe(false);
        expect(env.insetAreaM2).toBeLessThan(1120); // real setbacks bit
    });

    it('does NOT flag a real full-coverage grant: setbacks resolved to 0 are KNOWN, not unknown', () => {
        // A pack that genuinely states 0/0/0 setbacks (from:'pack') is a real answer — the footprint
        // is the whole parcel BY THE ORDINANCE, not by our ignorance. Must stay unflagged.
        const env = computeBuildableEnvelope({
            parcelRing: rect(0, 0, 40, 28),
            edgeClassifications: [...UNCLASSIFIED],
            zoning: { ...dkStructuredRecord({ setbacks: { front_m: 0, side_m: 0, rear_m: 0 } }) },
            rulePack: null,
        });
        expect(env.status).toBe('ok');
        expect(env.insetAreaM2).toBeCloseTo(1120, 6);
        expect(env.footprintIsUpperBound).toBe(false); // structured 0 = known, not unknown
    });
});

describe('TASK 1.B — the DK block-derived courtyard carve (reused Barcelona machinery)', () => {
    it('carves a perimeter depth band from the block ring, leaving the interior as courtyard', () => {
        // Freestanding karré: an 80×80 block, all four edges street frontage.
        const blockRing = rect(0, 0, 80, 80);
        const blockEdges: ParcelEdgeClassification[] = ['front', 'front', 'front', 'front'];
        // A parcel occupying the south strip of the block; its south edge fronts the street.
        const parcel = rect(0, 0, 40, 20); // 800 m²
        const parcelEdges: ParcelEdgeClassification[] = [
            'front', 'unclassified', 'unclassified', 'unclassified',
        ];
        const env = computeBuildableEnvelope({
            parcelRing: parcel,
            edgeClassifications: parcelEdges,
            zoning: dkStructuredRecord(),
            rulePack: null,
            geometricRule: DK_PERIMETER_BLOCK_COURTYARD_RULE,
            blockRing,
            blockEdgeClassifications: blockEdges,
        });
        expect(env.status).toBe('ok');
        // The band (≤ maxDepth 12 m from the frontage) is carved — the parcel is NOT filled.
        expect(env.insetAreaM2).toBeLessThan(800);
        expect(env.insetAreaM2).toBeCloseTo(40 * 12, 4); // 12 m band × 40 m frontage = 480 m²
        // A shaping rule ran, so this is a solved footprint — NOT an upper bound.
        expect(env.footprintIsUpperBound).toBe(false);
        expect(env.caveats.some((c) => /profundidad edificable/i.test(c))).toBe(true);
    });

    it('REFUSES (does not draw a confident full-parcel solid) when the block ring is absent', () => {
        // §CONTEXT-DATA-HONESTY: unknown block ⇒ no envelope, never the whole parcel. The engine's
        // block-derived branch hard-fails rather than fall through to the full-parcel inset.
        const parcel = rect(0, 0, 40, 20);
        const env = computeBuildableEnvelope({
            parcelRing: parcel,
            edgeClassifications: ['front', 'unclassified', 'unclassified', 'unclassified'],
            zoning: dkStructuredRecord(),
            rulePack: null,
            geometricRule: DK_PERIMETER_BLOCK_COURTYARD_RULE,
            // no blockRing / blockEdgeClassifications
        });
        expect(env.status).toBe('degenerate');
        expect(env.insetPolygon).toEqual([]);
        expect(env.footprintIsUpperBound).toBe(false); // not a full-parcel solid — an honest refusal
    });
});
