// @vitest-environment happy-dom
//
// §CTX-SEAT-FIRST-FOR-BAKED-LAYERS (L-12964) — founder, Córdoba 2026-09-06, verbatim: "the trees and
// maybe other assets sits under the visual plane on the 3d view originally — after the user selects the
// parcel they are nicely visually again".
//
// THE MECHANISM UNDER TEST, established by reading the four call sites — NOT inferred from the two
// numbers below. `sampleGround` consults `contextGroundCache` (filled by `sampleTerrainMostDetailed`,
// the DETAILED provider read, independent of the camera) and, ON A MISS, falls back to
// `globe.getHeight` — the CURRENTLY TESSELLATED mesh, which at start-up is two coarse level-2 tiles
// seen from 600 m up. The buildings never take that fallback (`sampleContextGroundsBatch` over their
// centroids runs first) and neither do the §12 ground layers (`resolveGroundDrapePieces` batches every
// seat point and its relief probes). THE CANOPIES AND THE STREET LIFE WERE THE ONLY LAYERS BAKING A
// PER-POINT GROUND WITH NOTHING PRE-SAMPLED — and they are exactly the two the founder can see sitting
// under the plane. They bake that ground into their instance matrices, so a coarse answer is permanent
// until a full rebuild; selecting a parcel is what finally batch-samples the neighbourhood and rebuilds
// them, which is why the founder sees them "nicely visually again" at that moment and not before.
//
// ⚠ WHAT THE FOUNDER'S TWO NUMBERS DO **NOT** ESTABLISH (C57 §1.5) — stated here so this file is not
// read as proof of something it does not measure:
//   startup      [CTX-TERRAIN-GAP] t+8s … centroidTerrainSurface=161.6m seatBase=161.6m
//                                        … renderedTerrainTiles=2 camH=600m
//   after parcel [CTX-DIAG] seat-first: terrain ground sampled 168.5 m
// `seatBase` is ALREADY a `sampleTerrainMostDetailed` reading, so at t+8s, at that point, the coarse
// mesh and the detailed sampler AGREED at 161.6 — evidence AGAINST "the detailed sampler would have
// answered 168.5 there", not for it. The 6.9 m may be relief between two DIFFERENT points (the site
// centroid vs the committed parcel) or the detailed answer moving as tiles arrive; the paste cannot
// separate them. The §COARSE-VS-DETAILED probe now shipped in `logTerrainGapDiagnostic` measures the
// disagreement directly so the next paste can. The two constants below are therefore a FIXTURE that
// exercises the seat ladder with a coarse and a detailed source that differ — they are named after the
// founder's readings, and they are not a claim that his 6.9 m was measured at one point.
//
// ⛔ THE FIX UNDER TEST IS NOT AN OFFSET. Nothing is nudged up by 6.9 m — that number is what the coarse
// mesh happened to be wrong by at Córdoba, and it has a different size and sign on the next site. The
// canopy points are put through the SAME detailed sampler the parcel path uses, BEFORE any of them is
// baked. The last case pins that: with the pre-sample removed, the seat drops back to the coarse mesh.
//
// Drives the SHIPPED `loadContextTrees` bound to a stub `this`, with `sampleGround` /
// `resolveContextSafeBase` the real prototype methods, so what is asserted is
// the real seat ladder and the real ORDER, not a paraphrase of it.

import { describe, it, expect, vi } from 'vitest';

const COARSE_GLOBE_M = 161.6;    // globe.getHeight at start-up: renderedTerrainTiles=2, camH=600m
const DETAILED_M = 168.5;        // sampleTerrainMostDetailed — the parcel path's "seat-first" reading
const CORDOBA = { lat: 37.88779, lon: -4.79761 };

const { calls, bakedHeights, cesiumMock } = vi.hoisted(() => {
    const calls: string[] = [];
    const bakedHeights: number[] = [];
    class Cartesian3 { constructor(public x = 0, public y = 0, public z = 0) {} }
    const cesiumMock = {
        Ion: { defaultAccessToken: '' },
        EllipsoidTerrainProvider: class {},
        CesiumTerrainProvider: { fromUrl: async () => { throw new Error('unused'); } },
        Cartographic: { fromDegrees: (lon: number, lat: number) => ({ lon, lat, height: 0 }) },
        sampleTerrainMostDetailed: async (_p: unknown, c: unknown[]) => c,
        Cartesian3: Object.assign(Cartesian3, {
            fromDegrees: (lon: number, lat: number, height: number) => {
                calls.push('bake');
                bakedHeights.push(height);
                return new Cartesian3(lon, lat, height);
            },
        }),
        Color: { fromCssColorString: () => ({ withAlpha: () => ({}) }) },
        EllipsoidGeometry: class { constructor(public o: unknown) {} },
        PerInstanceColorAppearance: Object.assign(class { constructor(public o: unknown) {} }, { VERTEX_FORMAT: {} }),
        ColorGeometryInstanceAttribute: { fromColor: () => ({}) },
        GeometryInstance: class { constructor(public o: unknown) {} },
        Transforms: { eastNorthUpToFixedFrame: (c: unknown) => c },
        Matrix4: { multiplyByScale: (m: unknown) => m },
        Primitive: class { constructor(public o: unknown) {} },
        ShadowMode: { DISABLED: 0 },
    };
    return { calls, bakedHeights, cesiumMock };
});

vi.mock('cesium', () => cesiumMock);

/** Three canopies around the Córdoba parcel — the shape `buildCanopySet` returns. */
const TREES = [0, 1, 2].map((i) => ({
    lat: CORDOBA.lat + i * 0.0001, lon: CORDOBA.lon + i * 0.0001,
    osmId: 100 + i, synthetic: false, radiusScale: 1, heightScale: 1, distM: 10 * i,
}));

vi.mock('../src/ui/geospatial/contextTrees', () => ({
    fetchContextCanopySet: async () => ({
        instances: TREES,
        mappedCount: TREES.length, syntheticCount: 0, mappedAvailable: TREES.length,
        polygonCount: 0, excludedNearMappedTree: 0, syntheticCappedAway: 0,
        bakedTreeCount: TREES.length, greenAreaCount: 0,
        sampledCount: 0, sampledSources: [], sampledSupersededSynthesis: false,
    }),
}));

import { CesiumViewport } from '../src/ui/geospatial/CesiumViewport';

const key = (p: { lat: number; lon: number }): string => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;

type Stub = Record<string, unknown> & { loadContextTrees: (lat: number, lon: number, force?: boolean) => Promise<void> };

function makeStub(over: Record<string, unknown> = {}): Stub {
    const proto = CesiumViewport.prototype as unknown as Record<string, (...a: unknown[]) => unknown>;
    const s: Record<string, unknown> = {
        viewer: {
            scene: {
                requestRender: () => {},
                primitives: { add: () => {}, remove: () => {} },
                // THE COARSE READING the founder measured: the tessellated mesh at t+8s, camH=600m.
                globe: { getHeight: () => COARSE_GLOBE_M },
            },
            terrainProvider: { availability: {} },
        },
        contextTreesPrimitive: null,
        contextTreesAt: null,
        contextTreesAbort: null,
        contextGroundCache: new Map<string, number>(),
        // Pre-settle: the base is still the value the coarse pass left behind.
        formaTerrainBaseHeight: COARSE_GLOBE_M,
        terrainProviderHasElevationData: () => true,
        // §RELIEF-FOR-THIS-SITE (L-13301) — the ONE predicate, stubbed READY for this site (this suite
        // measures the seat-first ordering, not the predicate; its own suite binds the real one).
        groundReliefState: () => ({ kind: 'ready' as const, city: 'cordoba' }),
        clearContextTrees: () => {},
        // The parcel path's sampler: `sampleTerrainMostDetailed` at the site centroid.
        ensureGroundBaseForContext: vi.fn(async function (this: Record<string, unknown>) {
            calls.push('ensureBase');
            this.formaTerrainBaseHeight = DETAILED_M;
            return DETAILED_M;
        }),
        // The DETAILED per-point batch — the same one the buildings and the ground drape use.
        sampleContextGroundsBatch: vi.fn(async function (
            this: Record<string, unknown>, pts: ReadonlyArray<{ lat: number; lon: number }>,
        ) {
            calls.push('batch');
            const cache = this.contextGroundCache as Map<string, number>;
            for (const p of pts) cache.set(key(p), DETAILED_M);
        }),
        ...over,
    };
    for (const m of ['loadContextTrees', 'sampleGround', 'resolveContextSafeBase'] as const) {
        s[m] = (proto[m] as (...a: unknown[]) => unknown).bind(s);
    }
    return s as Stub;
}

function reset(): void {
    calls.length = 0;
    bakedHeights.length = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
}

describe("§CTX-SEAT-FIRST-FOR-BAKED-LAYERS (L-12964) — \"the trees … sits under the visual plane\"", () => {
    it('bakes every canopy on the DETAILED ground (168.5 m), never the coarse mesh (161.6 m)', async () => {
        reset();
        const s = makeStub();
        await s.loadContextTrees(CORDOBA.lat, CORDOBA.lon);

        expect(bakedHeights.length).toBe(TREES.length);
        // ground + CANOPY_CENTRE_M(3.6) * heightScale(1)
        for (const h of bakedHeights) expect(h).toBeCloseTo(DETAILED_M + 3.6, 6);
        // The founder's symptom, stated as the number: nothing is seated on the coarse reading.
        for (const h of bakedHeights) expect(h).not.toBeCloseTo(COARSE_GLOBE_M + 3.6, 6);
    });

    it('ORDER: the detailed sample runs BEFORE the first canopy is baked (it is baked into the matrix)', async () => {
        reset();
        const s = makeStub();
        await s.loadContextTrees(CORDOBA.lat, CORDOBA.lon);

        expect(calls).toContain('batch');
        expect(calls.indexOf('batch')).toBeLessThan(calls.indexOf('bake'));
        // …and so does the centroid seat-first read the parcel path uses.
        expect(calls.indexOf('ensureBase')).toBeLessThan(calls.indexOf('bake'));
    });

    it('samples EXACTLY the canopy points — the layer cannot free-ride on another layer\'s cache', async () => {
        reset();
        const s = makeStub();
        await s.loadContextTrees(CORDOBA.lat, CORDOBA.lon);

        const batch = (s.sampleContextGroundsBatch as ReturnType<typeof vi.fn>).mock.calls[0][0] as Array<{ lat: number; lon: number }>;
        expect(batch.map(key).sort()).toEqual(TREES.map(key).sort());
    });

    it('THE CONTROL: with the pre-sample removed, the seat falls back to the coarse mesh — so the fix, not the mock, is what moves the number', async () => {
        reset();
        // Exactly the pre-L-12964 world: the batch resolves nothing, so every point misses the cache
        // and `sampleGround` returns `globe.getHeight`.
        const s = makeStub({ sampleContextGroundsBatch: vi.fn(async () => { calls.push('batch'); }) });
        await s.loadContextTrees(CORDOBA.lat, CORDOBA.lon);

        for (const h of bakedHeights) expect(h).toBeCloseTo(COARSE_GLOBE_M + 3.6, 6);
        // …i.e. the whole coarse-vs-detailed difference, whatever it is at a given point, lands
        // directly in the baked seat. The fixture's difference is the founder's 6.9 m; the ASSERTION
        // is that the source, not the size, is what the fix changes.
        expect(DETAILED_M - COARSE_GLOBE_M).toBeCloseTo(6.9, 6);
    });

    it('a canopy load for a NEW site is not swallowed by the buildings having got there first', async () => {
        reset();
        // The early-out read `contextBuildingsAt`, so once the footprints reached site B the canopies
        // could never follow — the previous site's primitive stayed on screen for good.
        const s = makeStub({ contextTreesPrimitive: {}, contextBuildingsAt: { ...CORDOBA }, contextTreesAt: { lat: 37.88507, lon: -4.77718 } });
        await s.loadContextTrees(CORDOBA.lat, CORDOBA.lon);
        expect(bakedHeights.length).toBe(TREES.length);
        expect(s.contextTreesAt).toEqual(CORDOBA);
    });

    it('an unchanged site still early-outs (no re-fetch churn on a repeat call)', async () => {
        reset();
        const s = makeStub({ contextTreesPrimitive: {}, contextTreesAt: { ...CORDOBA } });
        await s.loadContextTrees(CORDOBA.lat, CORDOBA.lon);
        expect(bakedHeights.length).toBe(0);
        expect(calls).toEqual([]);
    });
});
