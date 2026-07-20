// §FEAT-FORMA-CONTEXT-EXTENT-LOD (L-187) — unit tests for the PURE far-ring selection: the
// budget guard the founder asked for. The near ring stays extruded + shadowed; the far
// annulus is nearest-N capped, deduped against the near set, and excludes the inner disc so
// the shadow/geometry budget never blows up on a naïve radius multiply. No network here.

import { describe, it, expect } from 'vitest';
import {
    ringCentroidLonLat,
    selectFarRingFootprints,
    selectNearFootprints,
    selectNearRingRenderTiers,
    CONTEXT_NEAR_SHADOW_RADIUS_M,
    CONTEXT_NEAR_MAX_BUILDINGS,
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

// §FEAT-FORMA-CONTEXT-NEAR-CAP (L-454) — the near ring was UNCAPPED while the cheap far ring
// was capped at 900: the plan bounded the wrong half. These cover the tiering that bounds the
// EXPENSIVE half (extruded + outlined + shadow-casting) WITHOUT losing coverage.
describe('§FEAT-FORMA-CONTEXT-NEAR-CAP selectNearRingRenderTiers', () => {
    // At the equator 0.001° lon ≈ 111.32 m, so the 600 m shadow horizon ≈ 0.00539°.
    const INSIDE = 0.004;    // ~445 m — inside the shadow horizon
    const OUTSIDE = 0.007;   // ~779 m — beyond it, but still inside the 0.008° near bbox

    it('gives the expensive tier only to footprints inside the shadow-map horizon', () => {
        const { shadowed, demoted } = selectNearRingRenderTiers({
            features: [feat(1, INSIDE, 0), feat(2, OUTSIDE, 0)],
            centerLat: 0, centerLon: 0,
        });
        expect(shadowed.map((f) => f.properties.osmId)).toEqual([1]);
        expect(demoted.map((f) => f.properties.osmId)).toEqual([2]);
        expect(shadowed[0]!.properties.ring).toBe('near');
        expect(demoted[0]!.properties.ring).toBe('far');
        expect(shadowed[0]!.properties.distM!).toBeLessThan(CONTEXT_NEAR_SHADOW_RADIUS_M);
        expect(demoted[0]!.properties.distM!).toBeGreaterThan(CONTEXT_NEAR_SHADOW_RADIUS_M);
    });

    // THE load-bearing guarantee: dropping the overflow would punch a donut hole in the fabric
    // (footprints vanish while genuinely FARTHER far-ring blocks keep drawing).
    it('DEMOTES the overflow, never drops it — coverage is preserved exactly', () => {
        const features = [
            feat(1, INSIDE, 0), feat(2, OUTSIDE, 0), feat(3, 0, INSIDE),
            feat(4, 0, OUTSIDE), feat(5, -INSIDE, 0), feat(6, -OUTSIDE, 0),
        ];
        const { shadowed, demoted } = selectNearRingRenderTiers({
            features, centerLat: 0, centerLon: 0, cap: 2,
        });
        const ids = [...shadowed, ...demoted].map((f) => f.properties.osmId).sort((a, b) => a - b);
        expect(ids).toEqual([1, 2, 3, 4, 5, 6]);                 // nothing lost
        expect(shadowed.length + demoted.length).toBe(features.length);
        const shadowedIds = new Set(shadowed.map((f) => f.properties.osmId));
        expect(demoted.some((f) => shadowedIds.has(f.properties.osmId))).toBe(false); // disjoint
    });

    it('applies the count backstop NEAREST-FIRST, so the least important lose shadows', () => {
        const features = [
            feat(1, 0.005, 0),   // ~557 m — 3rd nearest
            feat(2, 0.001, 0),   // ~111 m — nearest
            feat(3, 0.003, 0),   // ~334 m — 2nd
        ];
        const { shadowed, demoted } = selectNearRingRenderTiers({
            features, centerLat: 0, centerLon: 0, cap: 2,
        });
        // All three are inside the 600 m horizon, so ONLY the backstop separates them.
        expect(shadowed.map((f) => f.properties.osmId)).toEqual([2, 3]);
        expect(demoted.map((f) => f.properties.osmId)).toEqual([1]);
        expect(shadowed[0]!.properties.distM!).toBeLessThan(shadowed[1]!.properties.distM!);
    });

    it('treats cap <= 0 as "no backstop" (matches the far ring convention)', () => {
        const features = Array.from({ length: 5 }, (_, i) => feat(i + 1, 0.0005 * (i + 1), 0));
        const { shadowed, demoted } = selectNearRingRenderTiers({
            features, centerLat: 0, centerLon: 0, cap: 0,
        });
        expect(shadowed).toHaveLength(5);   // all within the horizon, no cap applied
        expect(demoted).toHaveLength(0);
    });

    it('is order-independent — it sorts, so input order cannot change the tiers', () => {
        const features = [feat(1, 0.005, 0), feat(2, 0.001, 0), feat(3, 0.003, 0)];
        const forward = selectNearRingRenderTiers({
            features, centerLat: 0, centerLon: 0, cap: 2,
        });
        const reversed = selectNearRingRenderTiers({
            features: [...features].reverse(), centerLat: 0, centerLon: 0, cap: 2,
        });
        expect(forward.shadowed.map((f) => f.properties.osmId))
            .toEqual(reversed.shadowed.map((f) => f.properties.osmId));
    });

    // ⚠ COUPLING GUARD: CONTEXT_NEAR_SHADOW_RADIUS_M is not a taste value — it MUST track the
    // Cesium shadow map's own `sm.maximumDistance` (CesiumViewport §FORMA-GRAZING-BANDING-FIX).
    // Beyond it Cesium renders no shadow at all, so a caster there is pure waste. If that knob
    // moves and this does not, the tiers silently drift apart again — which is the L-454 defect.
    it('pins the shadow radius to the Cesium shadow-map maximumDistance (600 m)', () => {
        expect(CONTEXT_NEAR_SHADOW_RADIUS_M).toBe(600);
        // The backstop must sit ABOVE the densest fabric observed live (Barcelona ~1,433
        // footprints/km² × the 1.131 km² shadow disc ≈ 1,621) only as a runaway guard — the
        // DISTANCE rule stays the primary mechanism, never the count.
        expect(CONTEXT_NEAR_MAX_BUILDINGS).toBeGreaterThan(900);
    });
});
