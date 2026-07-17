// §FEAT-FORMA-CONTEXT-EXTENT-LOD (L-187) — unit tests for the PURE far-ring selection: the
// budget guard the founder asked for. The near ring stays extruded + shadowed; the far
// annulus is nearest-N capped, deduped against the near set, and excludes the inner disc so
// the shadow/geometry budget never blows up on a naïve radius multiply. No network here.

import { describe, it, expect } from 'vitest';
import {
    ringCentroidLonLat,
    selectFarRingFootprints,
    selectNearFootprints,
    type ContextBuildingFeature,
} from '../src/ui/geospatial/contextBuildings';

function feat(osmId: number, cLon: number, cLat: number, heightM = 9): ContextBuildingFeature {
    // A tiny 0.0002° square centred on (cLon,cLat).
    const d = 0.0001;
    const ring: number[][] = [
        [cLon - d, cLat - d], [cLon + d, cLat - d],
        [cLon + d, cLat + d], [cLon - d, cLat + d], [cLon - d, cLat - d],
    ];
    return { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { heightM, osmId } };
}

// A near bbox roughly ±0.008° about (0,0).
const NEAR_BBOX = [-0.008, -0.008, 0.008, 0.008] as const;

describe('§FEAT-FORMA-CONTEXT-EXTENT-LOD ringCentroidLonLat', () => {
    it('returns the footprint centre', () => {
        const [lon, lat] = ringCentroidLonLat(feat(1, 2.5, -0.7));
        expect(lon).toBeCloseTo(2.5, 6);
        expect(lat).toBeCloseTo(-0.7, 6);
    });
});

describe('§FEAT-FORMA-CONTEXT-EXTENT-LOD selectFarRingFootprints', () => {
    it('excludes footprints inside the near bbox (inner disc already drawn)', () => {
        const inner = feat(1, 0.001, 0.001);   // inside near bbox
        const outer = feat(2, 0.012, 0.0);      // outside near bbox
        const kept = selectFarRingFootprints({
            farFeatures: [inner, outer],
            centerLat: 0, centerLon: 0,
            nearBbox: NEAR_BBOX, nearOsmIds: new Set(),
        });
        expect(kept.map((f) => f.properties.osmId)).toEqual([2]);
        expect(kept[0]!.properties.ring).toBe('far');
        expect(kept[0]!.properties.distM).toBeGreaterThan(0);
    });

    it('dedupes against the near osm-id set', () => {
        const outerA = feat(10, 0.012, 0.0);
        const outerB = feat(11, 0.013, 0.0);
        const kept = selectFarRingFootprints({
            farFeatures: [outerA, outerB],
            centerLat: 0, centerLon: 0,
            nearBbox: NEAR_BBOX, nearOsmIds: new Set([10]),
        });
        expect(kept.map((f) => f.properties.osmId)).toEqual([11]);
    });

    it('keeps only the nearest N (cap) sorted nearest-first', () => {
        const far = [
            feat(1, 0.030, 0), // ~3.3 km
            feat(2, 0.012, 0), // ~1.3 km
            feat(3, 0.020, 0), // ~2.2 km
        ];
        const kept = selectFarRingFootprints({
            farFeatures: far, centerLat: 0, centerLon: 0,
            nearBbox: NEAR_BBOX, nearOsmIds: new Set(), cap: 2,
        });
        expect(kept).toHaveLength(2);
        // Nearest-first: osmId 2 (closest) then 3.
        expect(kept.map((f) => f.properties.osmId)).toEqual([2, 3]);
        expect(kept[0]!.properties.distM!).toBeLessThan(kept[1]!.properties.distM!);
    });
});

describe('§PERF-CTX-SINGLE-FETCH selectNearFootprints (single-fetch split)', () => {
    it('keeps only footprints whose centroid falls inside the near bbox', () => {
        const inner = feat(1, 0.001, 0.001);   // inside near bbox
        const outer = feat(2, 0.012, 0.0);      // outside near bbox
        const near = selectNearFootprints({ farFeatures: [inner, outer], nearBbox: NEAR_BBOX });
        expect(near.map((f) => f.properties.osmId)).toEqual([1]);
    });

    it('is the exact COMPLEMENT of selectFarRingFootprints — near+far partition with no overlap/gap', () => {
        // A far-extent collection: two inside the near bbox, two outside.
        const full = [
            feat(1, 0.001, 0.001),  // near
            feat(2, -0.004, 0.003), // near
            feat(3, 0.012, 0.0),    // far
            feat(4, 0.0, 0.014),    // far
        ];
        const near = selectNearFootprints({ farFeatures: full, nearBbox: NEAR_BBOX });
        const nearIds = new Set(near.map((f) => f.properties.osmId));
        const far = selectFarRingFootprints({
            farFeatures: full, centerLat: 0, centerLon: 0,
            nearBbox: NEAR_BBOX, nearOsmIds: nearIds,
        });
        const farIds = far.map((f) => f.properties.osmId);
        expect([...nearIds].sort()).toEqual([1, 2]);
        expect(farIds.sort()).toEqual([3, 4]);
        // No footprint appears in both, and together they cover every input exactly once.
        expect(farIds.some((id) => nearIds.has(id))).toBe(false);
        expect(near.length + far.length).toBe(full.length);
    });
});
