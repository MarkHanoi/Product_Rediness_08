// §VEG-REAL-CANOPY-BAKE (L-12935) — the PURE half of contextCanopyBaked.ts.
//
// Nothing here mounts a viewer or reads a tile. What it pins is the part that decides what the user
// sees and what the console CLAIMS about it:
//   • the reader drops a cell with no measured `cover` rather than defaulting one (a fabricated
//     substitute would make an unmeasured cell indistinguishable from a measured one),
//   • every instance carries `sampled: true` and `synthetic: false` — the three vegetation sources
//     stay countable apart (C57 §1.5/§1.9),
//   • the radial cull, the nearest-first cap and the mapped-tree exclusion,
//   • determinism (a terrain re-seat must re-render the same stand, not a fresh scatter),
//   • supersession — a measurement stands the synthesis down only when it actually covers the site.

import { describe, it, expect } from 'vitest';
import {
    canopyFromTileFeatures, buildSampledCanopyInstances, supersedesSynthesis,
    emptyBakedCanopy, MAX_SAMPLED_CANOPIES,
    type BakedCanopyPoint,
} from '../contextCanopyBaked';
import type { ContextTileFeature } from '../contextTiles';

function feature(lon: number, lat: number, tags: Record<string, string>, id = 1): ContextTileFeature {
    return { rings: [[[lon, lat]]], tags, syntheticId: id } as unknown as ContextTileFeature;
}

const TAGS = { canopy: '1', cover: '74', src: 'eea-hrl-tcd-2018', sampled: 'true', vintage: '2018', loss_adjusted: 'true', res_m: '10' };

describe('canopyFromTileFeatures', () => {
    it('reads a point layer feature as one measured cell, carrying the provenance', () => {
        const got = canopyFromTileFeatures([feature(2.17, 48.77, TAGS)]);
        expect(got.points.length).toBe(1);
        const p = got.points[0]!;
        expect(p.lon).toBe(2.17);
        expect(p.lat).toBe(48.77);
        expect(p.cover).toBe(74);
        expect(p.src).toBe('eea-hrl-tcd-2018');
        expect(p.vintage).toBe(2018);
        expect(p.lossAdjusted).toBe(true);
        expect(p.resM).toBe(10);
        expect(got.sources).toEqual(['eea-hrl-tcd-2018']);
        expect(got.available).toBe(true);
    });

    it('DROPS a feature with no measured cover instead of defaulting one', () => {
        // The whole claim of this layer is that the number is measured. A default would erase the
        // difference between "the raster says 74 %" and "we do not know" — the context-data-honesty
        // failure in its purest form.
        const noCover = { canopy: '1', src: 'x' };
        expect(canopyFromTileFeatures([feature(2.17, 48.77, noCover)]).points.length).toBe(0);
        expect(canopyFromTileFeatures([feature(2.17, 48.77, { ...TAGS, cover: 'NaN' })]).points.length).toBe(0);
        expect(canopyFromTileFeatures([feature(2.17, 48.77, { ...TAGS, cover: '140' })]).points.length).toBe(0);
        expect(canopyFromTileFeatures([feature(2.17, 48.77, { ...TAGS, cover: '-3' })]).points.length).toBe(0);
    });

    it('carries the Hansen vintage honestly — loss_adjusted false survives the read', () => {
        const h = { canopy: '1', cover: '88', src: 'hansen-gfc-2023v1.11-tc2000', vintage: '2000', loss_adjusted: 'false', res_m: '30' };
        const p = canopyFromTileFeatures([feature(151.17, -33.65, h)]).points[0]!;
        expect(p.vintage).toBe(2000);
        // ⚠ `false` here means canopy felled since 2000 may still be drawn. A reader that coerced this
        // to `true` (or dropped it) would silently upgrade a 25-year-old observation to current fact.
        expect(p.lossAdjusted).toBe(false);
    });

    it('reports two sources when a bbox straddles a border', () => {
        const got = canopyFromTileFeatures([
            feature(2.17, 48.77, TAGS, 1),
            feature(2.18, 48.78, { ...TAGS, src: 'hansen-gfc-2023v1.11-tc2000' }, 2),
        ]);
        expect(got.sources).toEqual(['eea-hrl-tcd-2018', 'hansen-gfc-2023v1.11-tc2000']);
    });

    it('an empty collection is NOT available by default — absence and emptiness differ', () => {
        expect(emptyBakedCanopy().available).toBe(false);
        expect(emptyBakedCanopy(true).available).toBe(true);
        expect(canopyFromTileFeatures([]).available).toBe(true); // an honest `ok` with zero features.
    });

    it('ignores a malformed vertex without throwing', () => {
        const bad = { rings: [[[Number.NaN, 48.77]], []], tags: TAGS, syntheticId: 1 } as unknown as ContextTileFeature;
        expect(() => canopyFromTileFeatures([bad])).not.toThrow();
        expect(canopyFromTileFeatures([bad]).points.length).toBe(0);
    });
});

describe('buildSampledCanopyInstances', () => {
    const site = { lat: 48.77, lon: 2.17 };
    /** A grid of cells around the site, roughly 12 m apart. */
    function grid(n: number, cover = 70): BakedCanopyPoint[] {
        const out: BakedCanopyPoint[] = [];
        const d = 12 / 110_574;
        for (let i = -n; i <= n; i++) {
            for (let j = -n; j <= n; j++) {
                out.push({ lon: site.lon + j * d * 1.5, lat: site.lat + i * d, cover, src: 'eea-hrl-tcd-2018', vintage: 2018, lossAdjusted: true, resM: 10 });
            }
        }
        return out;
    }

    it('labels every instance `sampled: true` and `synthetic: false`', () => {
        const { canopies } = buildSampledCanopyInstances(grid(3), { site, maxRadiusM: 1000 });
        expect(canopies.length).toBeGreaterThan(0);
        for (const c of canopies) {
            expect(c.sampled).toBe(true);
            // ⚠ THE HONESTY LINE. A sampled canopy is NOT the woods-fill synthesis: its cover is
            // measured. Flipping this to `true` would let the two be summed into one number.
            expect(c.synthetic).toBe(false);
            expect(c.cover).toBe(70);
            expect(c.src).toBe('eea-hrl-tcd-2018');
            expect(c.osmId).toBeLessThan(0); // never an OSM id.
        }
    });

    it('culls radially about the site', () => {
        const far: BakedCanopyPoint[] = [
            { lon: site.lon, lat: site.lat + 0.0005, cover: 70, src: 'x', vintage: null, lossAdjusted: null, resM: null }, // ~55 m
            { lon: site.lon, lat: site.lat + 0.02, cover: 70, src: 'x', vintage: null, lossAdjusted: null, resM: null },   // ~2.2 km
        ];
        const { canopies } = buildSampledCanopyInstances(far, { site, maxRadiusM: 300 });
        expect(canopies.length).toBe(1);
        expect(canopies[0]!.distM).toBeLessThan(300);
    });

    it('caps NEAREST-FIRST and reports how many were cut', () => {
        const pts = grid(12); // 625 cells
        const { canopies, cappedAway, available } = buildSampledCanopyInstances(pts, { site, maxRadiusM: 5000, maxCount: 40 });
        expect(canopies.length).toBe(40);
        expect(cappedAway).toBe(available - 40);
        for (let i = 1; i < canopies.length; i++) {
            expect(canopies[i]!.distM).toBeGreaterThanOrEqual(canopies[i - 1]!.distM);
        }
    });

    it('keeps clear of MAPPED trees so a surveyed tree is never double-drawn', () => {
        const pts: BakedCanopyPoint[] = [
            { lon: site.lon, lat: site.lat, cover: 70, src: 'x', vintage: null, lossAdjusted: null, resM: null },
            { lon: site.lon + 0.001, lat: site.lat, cover: 70, src: 'x', vintage: null, lossAdjusted: null, resM: null },
        ];
        const got = buildSampledCanopyInstances(pts, {
            site, maxRadiusM: 1000, mappedTrees: [{ lon: site.lon, lat: site.lat }], mappedTreeExclusionM: 2,
        });
        expect(got.excludedNearMappedTree).toBe(1);
        expect(got.canopies.length).toBe(1);
    });

    it('is DETERMINISTIC — a terrain re-seat re-renders the same stand', () => {
        const pts = grid(4);
        const a = buildSampledCanopyInstances(pts, { site, maxRadiusM: 1000, maxCount: 25 });
        const b = buildSampledCanopyInstances(pts, { site, maxRadiusM: 1000, maxCount: 25 });
        expect(JSON.stringify(a.canopies)).toBe(JSON.stringify(b.canopies));
    });

    it('the cap is stable when cells tie on distance — a regular grid ties constantly', () => {
        // Four cells at the same radius. Without a total order the cap would pick a different three
        // on each read and the stand would shimmer between renders.
        const d = 0.0005;
        const ring: BakedCanopyPoint[] = [
            { lon: site.lon + d, lat: site.lat, cover: 70, src: 'x', vintage: null, lossAdjusted: null, resM: null },
            { lon: site.lon - d, lat: site.lat, cover: 70, src: 'x', vintage: null, lossAdjusted: null, resM: null },
            { lon: site.lon, lat: site.lat + d, cover: 70, src: 'x', vintage: null, lossAdjusted: null, resM: null },
            { lon: site.lon, lat: site.lat - d, cover: 70, src: 'x', vintage: null, lossAdjusted: null, resM: null },
        ];
        const first = buildSampledCanopyInstances(ring, { site, maxRadiusM: 1000, maxCount: 2 }).canopies.map((c) => c.lon + ',' + c.lat);
        const shuffled = [ring[2]!, ring[0]!, ring[3]!, ring[1]!];
        const second = buildSampledCanopyInstances(shuffled, { site, maxRadiusM: 1000, maxCount: 2 }).canopies.map((c) => c.lon + ',' + c.lat);
        expect(second).toEqual(first);
    });

    it('modulates the crown by the MEASURED cover, within bounds', () => {
        const at = (cover: number) => buildSampledCanopyInstances(
            [{ lon: site.lon, lat: site.lat, cover, src: 'x', vintage: null, lossAdjusted: null, resM: null }],
            { site, maxRadiusM: 1000 },
        ).canopies[0]!;
        const thin = at(30);
        const full = at(100);
        // Same cell ⇒ same hash ⇒ the ONLY difference is the cover factor. A denser measurement draws
        // a fuller crown; this is the one place the measurement changes what is rendered.
        expect(full.radiusScale).toBeGreaterThan(thin.radiusScale);
        for (const c of [thin, full]) {
            expect(c.radiusScale).toBeGreaterThan(0.5);
            expect(c.radiusScale).toBeLessThan(1.6);
            expect(c.heightScale).toBeGreaterThanOrEqual(0.8);
            expect(c.heightScale).toBeLessThanOrEqual(1.3);
        }
    });

    it('returns nothing for an empty input or a zero cap, without throwing', () => {
        expect(buildSampledCanopyInstances([], { site, maxRadiusM: 1000 }).canopies).toEqual([]);
        expect(buildSampledCanopyInstances(grid(2), { site, maxRadiusM: 1000, maxCount: 0 }).canopies).toEqual([]);
    });

    it('MAX_SAMPLED_CANOPIES is a real cap, not Infinity', () => {
        expect(Number.isFinite(MAX_SAMPLED_CANOPIES)).toBe(true);
        expect(MAX_SAMPLED_CANOPIES).toBeGreaterThan(0);
    });
});

describe('supersession — a measurement stands the synthesis down only where it covers the site', () => {
    it('supersedes on real coverage', () => {
        expect(supersedesSynthesis(5000)).toBe(true);
        expect(supersedesSynthesis(50)).toBe(true);
    });

    it('does NOT supersede on a handful of far-edge cells', () => {
        // ⚠ This is the branch that matters. Suppressing the woods-fill because three cells clipped
        // the corner of the bbox would REMOVE vegetation from the site rather than improve it —
        // "the layer exists" is not "the layer covers here".
        expect(supersedesSynthesis(0)).toBe(false);
        expect(supersedesSynthesis(3)).toBe(false);
        expect(supersedesSynthesis(49)).toBe(false);
    });
});
