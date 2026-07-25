// PHASE 2 — HeightProfile honesty-gate tests (North Star §6.2 / §6.6 C-CONTEXT §3).
//
// The load-bearing assertion set: `provenance` and `confidence` are MANDATORY, so a height that
// cannot state its origin or its confidence is REJECTED by the schema — a guess can never round-trip
// as if it were a measurement. Also covers the pure mapping helpers.

import { describe, expect, it } from 'vitest';
import {
    HeightProfileSchema,
    RoofTypeSchema,
    HeightProvenanceSchema,
    heightProvenanceToProfile,
    minimalProfileFromScalar,
    NOMINAL_CONFIDENCE,
    type HeightProfile,
} from '../src/site/context/heightProfile.js';

/** A fully-measured lidar_ndsm profile — the top tier. */
const measured: HeightProfile = {
    ground_elevation_m: 128.42,
    roof_median_m: 139.87,
    roof_p90_m: 140.15,
    roof_peak_m: 141.02,
    building_height_m: 11.73,
    height_to_parapet_m: 11.6,
    height_to_ridge_m: 12.3,
    height_to_eaves_m: 10.9,
    roof_type: 'gable',
    roof_pitch_deg: 32,
    floors_est: 4,
    confidence: 0.94,
    provenance: 'lidar_ndsm',
    source: 'PNOA_2025',
    epoch: '2025-04',
    algorithm_version: 'v2.3.1',
};

describe('HeightProfileSchema — shape', () => {
    it('accepts a fully-measured lidar_ndsm profile', () => {
        expect(HeightProfileSchema.parse(measured)).toEqual(measured);
    });

    it('accepts a minimal profile with every measurement null but the honesty block present', () => {
        const p: HeightProfile = {
            ground_elevation_m: null,
            roof_median_m: null,
            roof_p90_m: null,
            roof_peak_m: null,
            building_height_m: null,
            height_to_parapet_m: null,
            height_to_ridge_m: null,
            height_to_eaves_m: null,
            roof_type: 'unknown',
            roof_pitch_deg: null,
            floors_est: null,
            confidence: 0.1,
            provenance: 'assumed',
            source: 'OSM',
            epoch: null,
            algorithm_version: 'v0',
        };
        expect(HeightProfileSchema.parse(p)).toEqual(p);
    });
});

describe('HeightProfileSchema — the honesty gate (provenance + confidence mandatory)', () => {
    it('REJECTS a profile with no provenance', () => {
        const { provenance: _omit, ...noProv } = measured;
        expect(HeightProfileSchema.safeParse(noProv).success).toBe(false);
    });

    it('REJECTS a profile with no confidence', () => {
        const { confidence: _omit, ...noConf } = measured;
        expect(HeightProfileSchema.safeParse(noConf).success).toBe(false);
    });

    it('REJECTS a confidence outside 0..1', () => {
        expect(HeightProfileSchema.safeParse({ ...measured, confidence: 1.5 }).success).toBe(false);
        expect(HeightProfileSchema.safeParse({ ...measured, confidence: -0.1 }).success).toBe(false);
    });

    it('REJECTS an unknown provenance token (no silent fabrication tier)', () => {
        expect(HeightProfileSchema.safeParse({ ...measured, provenance: 'vibes' }).success).toBe(false);
    });

    it('REJECTS an empty source and an empty algorithm_version', () => {
        expect(HeightProfileSchema.safeParse({ ...measured, source: '' }).success).toBe(false);
        expect(HeightProfileSchema.safeParse({ ...measured, algorithm_version: '' }).success).toBe(false);
    });

    it('REJECTS an out-of-range roof pitch', () => {
        expect(HeightProfileSchema.safeParse({ ...measured, roof_pitch_deg: 120 }).success).toBe(false);
    });

    it('REJECTS a non-integer floors_est', () => {
        expect(HeightProfileSchema.safeParse({ ...measured, floors_est: 3.5 }).success).toBe(false);
    });
});

describe('enums', () => {
    it('RoofType covers the LoD2-recoverable set', () => {
        expect(RoofTypeSchema.options).toEqual(['flat', 'gable', 'hip', 'shed', 'complex', 'unknown']);
    });
    it('HeightProvenance is ordered strongest-first', () => {
        expect(HeightProvenanceSchema.options).toEqual([
            'lidar_ndsm', 'national_lod2', 'national_lod1', 'osm_tag', 'levels_x_h', 'assumed',
        ]);
    });
});

describe('heightProvenanceToProfile — shipped tri-state → profile enum', () => {
    it('maps tagged → osm_tag', () => {
        expect(heightProvenanceToProfile('tagged')).toBe('osm_tag');
    });
    it('maps derived-levels → levels_x_h', () => {
        expect(heightProvenanceToProfile('derived-levels')).toBe('levels_x_h');
    });
    it('maps assumed → assumed', () => {
        expect(heightProvenanceToProfile('assumed')).toBe('assumed');
    });
});

describe('minimalProfileFromScalar — honest backfill, no fabricated geometry', () => {
    it('maps a scalar height to building_height_m only, leaving every nDSM field null', () => {
        const p = minimalProfileFromScalar({
            height_m: 19.2,
            heightProvenance: 'derived-levels',
            floors: 6,
            source: 'CATASTRO',
            algorithm_version: 'bake-v1',
        });
        expect(HeightProfileSchema.parse(p)).toEqual(p); // valid by construction
        expect(p.building_height_m).toBe(19.2);
        expect(p.roof_p90_m).toBeNull();
        expect(p.roof_type).toBe('unknown');
        expect(p.provenance).toBe('levels_x_h');
        expect(p.floors_est).toBe(6);
        expect(p.confidence).toBe(NOMINAL_CONFIDENCE.levels_x_h);
    });

    it('defaults floors to null, epoch to null, and honours an explicit confidence', () => {
        const p = minimalProfileFromScalar({
            height_m: null,
            heightProvenance: 'assumed',
            source: 'OSM',
            algorithm_version: 'bake-v1',
            confidence: 0.05,
        });
        expect(p.floors_est).toBeNull();
        expect(p.epoch).toBeNull();
        expect(p.confidence).toBe(0.05);
        expect(p.provenance).toBe('assumed');
        expect(p.building_height_m).toBeNull();
    });
});
