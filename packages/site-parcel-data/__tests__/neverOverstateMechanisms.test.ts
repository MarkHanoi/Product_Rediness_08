// §NEVER-OVERSTATE-A / §NEVER-OVERSTATE-B (lane E2a, 2026-09-01) — the TWO overstating
// mechanisms REPORT §M names in `ZoningRulesEngine`, each pinned by axis so re-introducing
// either goes RED naming the axis it overstates on:
//
//   A — unknown-setback → 0-inset. The all-unknown case was closed by §L-619; the PARTIAL
//       case (front resolved, side/rear unresolved) still zero-inset the unknown edges
//       SILENTLY. Now: `footprintIsUpperBound` + a caveat naming the unresolved axes.
//       `unknown ≠ zero` on EVERY axis (E4 control 9).
//   B — maxFAR returned but never capping `maxVolumeM3`. §L-616 computed the render split
//       (shell + FAR solid) but the STUDY VOLUME stayed `area × maxHeight` — the full shell —
//       so every non-render consumer read a volume FAR forbids (Copenhagen ~5×). Now:
//       `maxVolumeM3 = min(uncapped, footprintArea × farLimitedHeight_m)`, in the engine AND
//       in both `applyConstructedHeight` sites (same arithmetic, three sites, one §-tag).
//
// FALSIFICATION (recorded in audit/europe-site-intel/2026-08-31/impl/): each `it` below was
// run against the PRE-FIX engine and observed RED with the axis in its failure message.

import { describe, it, expect } from 'vitest';
import type { Pt, ZoningRecord, BuildableEnvelope } from '@pryzm/schemas';
import { BuildableEnvelopeSchema } from '@pryzm/schemas';
import {
    computeBuildableEnvelope,
    applyConstructedHeight,
    ESTIMATED_DEFAULT_PACK,
    estimatedDefaultZoningRecord,
} from '../src/index.js';

function rect(x0: number, z0: number, x1: number, z1: number): Pt[] {
    return [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
}

const EDGES = ['front', 'side', 'rear', 'side'] as const;

/** A structured provider record (no pack), with the given setbacks/height/FAR. */
function structuredRecord(over: {
    setbacks: { front_m: number | null; side_m: number | null; rear_m: number | null };
    maxHeight_m?: number | null;
    plotRatioFAR?: number | null;
}): ZoningRecord {
    return {
        zoneCode: 'TEST-ZONE',
        zoneLabel: 'never-overstate test zone',
        jurisdictionId: 'test',
        structuredFields: {
            maxHeight_m: over.maxHeight_m ?? 20,
            maxFloors: null,
            plotRatioFAR: over.plotRatioFAR ?? null,
            maxCoverage: null,
            setbacks: over.setbacks,
            permittedUse: ['residential'],
        },
        overlays: [],
        ordinanceRef: null,
        provenance: {
            source: 'test-structured',
            label: 'test',
            version: 'test',
            license: null,
            crs: 'EPSG:4326',
        },
    } as ZoningRecord;
}

describe('§NEVER-OVERSTATE-A — an UNKNOWN setback is never a silent 0-inset', () => {
    it('PARTIALLY unknown setbacks (side + rear axes) flag the footprint as an UPPER BOUND', () => {
        const env = computeBuildableEnvelope({
            parcelRing: rect(0, 0, 30, 24),
            edgeClassifications: [...EDGES],
            zoning: structuredRecord({ setbacks: { front_m: 3, side_m: null, rear_m: null } }),
            rulePack: null,
        });
        expect(env.status).toBe('ok');
        // THE PIN — pre-fix this was false: side/rear were zero-inset with no flag, no caveat.
        expect(env.footprintIsUpperBound, 'side + rear axes unknown ⇒ upper bound').toBe(true);
        const caveat = env.caveats.find((c) => c.includes('UNKNOWN on the'));
        expect(caveat, 'caveat must NAME the unresolved axes').toBeDefined();
        expect(caveat!).toContain('side');
        expect(caveat!).toContain('rear');
        expect(caveat!).not.toContain('front +');
    });

    it('ONE unknown axis (rear) is enough — and it is the one named', () => {
        const env = computeBuildableEnvelope({
            parcelRing: rect(0, 0, 30, 24),
            edgeClassifications: [...EDGES],
            zoning: structuredRecord({ setbacks: { front_m: 3, side_m: 2, rear_m: null } }),
            rulePack: null,
        });
        expect(env.status).toBe('ok');
        expect(env.footprintIsUpperBound, 'rear axis unknown ⇒ upper bound').toBe(true);
        const caveat = env.caveats.find((c) => c.includes('UNKNOWN on the'));
        expect(caveat).toBeDefined();
        expect(caveat!).toContain('rear');
        expect(caveat!).not.toContain('side');
    });

    it('CONTROL — fully-resolved setbacks stay a solved footprint (no flag, no axis caveat)', () => {
        const env = computeBuildableEnvelope({
            parcelRing: rect(0, 0, 30, 24),
            edgeClassifications: [...EDGES],
            zoning: estimatedDefaultZoningRecord(),
            rulePack: ESTIMATED_DEFAULT_PACK,
        });
        expect(env.status).toBe('ok');
        expect(env.footprintIsUpperBound).toBe(false);
        expect(env.caveats.some((c) => c.includes('UNKNOWN on the'))).toBe(false);
    });

    it('CONTROL — the §L-619 ALL-unknown case still flags, with its own (whole-parcel) caveat', () => {
        const env = computeBuildableEnvelope({
            parcelRing: rect(0, 0, 30, 24),
            edgeClassifications: [...EDGES],
            zoning: structuredRecord({ setbacks: { front_m: null, side_m: null, rear_m: null } }),
            rulePack: null,
        });
        expect(env.status).toBe('ok');
        expect(env.footprintIsUpperBound).toBe(true);
        expect(env.caveats.some((c) => c.includes('WHOLE parcel as an UPPER BOUND'))).toBe(true);
    });
});

describe('§NEVER-OVERSTATE-B — maxFAR caps maxVolumeM3 (the FAR axis)', () => {
    it('the Copenhagen shape: FAR 1.5 under a 24 m cap caps the STUDY VOLUME, not just the render', () => {
        const parcel = rect(0, 0, 40, 28); // 1,120 m²
        const env = computeBuildableEnvelope({
            parcelRing: parcel,
            edgeClassifications: [...EDGES],
            zoning: structuredRecord({
                setbacks: { front_m: null, side_m: null, rear_m: null },
                maxHeight_m: 24,
                plotRatioFAR: 1.5,
            }),
            rulePack: null,
        });
        expect(env.status).toBe('ok');
        expect(env.farLimitedHeight_m).not.toBeNull();
        expect(env.farLimitedHeight_m!).toBeLessThan(24);
        // THE PIN — pre-fix this was insetArea × 24 (the full shell), ~5.3× the FAR volume.
        expect(env.maxVolumeM3, 'FAR axis: maxVolumeM3 must be FAR-capped').not.toBeNull();
        expect(env.maxVolumeM3!).toBeCloseTo(env.insetAreaM2 * env.farLimitedHeight_m!, 6);
        expect(env.maxVolumeM3!).toBeLessThan(env.insetAreaM2 * 24 - 1);
    });

    it('CONTROL — FAR null leaves the volume byte-identical (area × maxHeight)', () => {
        const env = computeBuildableEnvelope({
            parcelRing: rect(0, 0, 40, 28),
            edgeClassifications: [...EDGES],
            zoning: structuredRecord({
                setbacks: { front_m: null, side_m: null, rear_m: null },
                maxHeight_m: 24,
                plotRatioFAR: null,
            }),
            rulePack: null,
        });
        expect(env.status).toBe('ok');
        expect(env.farLimitedHeight_m).toBeNull();
        expect(env.maxVolumeM3).toBeCloseTo(env.insetAreaM2 * 24, 6);
    });

    it('applyConstructedHeight caps by FAR with the SAME arithmetic (BCN clau-12 shape)', () => {
        const ring = rect(0, 0, 20, 10); // 200 m²
        const parcel = rect(0, 0, 20, 20); // 400 m²
        const env: BuildableEnvelope = BuildableEnvelopeSchema.parse({
            insetPolygon: ring,
            insetAreaM2: 200,
            maxHeight_m: null,
            maxFAR: 1.0,
            confidence: 'estimated-ruleset',
            granularity: 'parcel',
            status: 'ok',
            zoneCode: 'test',
        });
        const out = applyConstructedHeight(env, {
            height_m: 17,
            maxFloors: 4,
            parcelRing: parcel,
        });
        // maxGFA = 1.0 × 400 = 400 m²; floors over 200 m² = 2; floor height 17/4 = 4.25 m
        // ⇒ farLimitedHeight = 8.5 m ⇒ volume 200 × 8.5 = 1,700 m³ (uncapped would be 3,400).
        expect(out.farLimitedHeight_m).toBeCloseTo(8.5, 6);
        expect(out.maxVolumeM3, 'FAR axis: constructed-height volume must be FAR-capped')
            .toBeCloseTo(1700, 6);
        expect(() => BuildableEnvelopeSchema.parse(out)).not.toThrow();
    });
});
