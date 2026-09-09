// @vitest-environment happy-dom
//
// §FIX-GLOBE-CLAMP-TO-PHOTOREAL-TILES (L-179) — the placed building must sit ON the loaded
// Google Photorealistic 3D-Tiles surface, NEVER at flat ellipsoid 0 (which buried it ~650 m
// under Madrid's real ground). `selectPhotorealTileBaseHeight` is the PURE reduction that
// turns the tile-surface height picks (clampToHeightMostDetailed / sampleHeightMostDetailed
// over the footprint + street ring) into the base height. These tests pin its decision logic
// without a live Cesium viewer (the module only touches `Cesium.Ion.defaultAccessToken` at
// import — mocked below).
//
// Regression: the prior §GLOBE-TERRAIN-HEIGHT path preferred an ion World-Terrain sample; on
// an elevated city whose terrain datum disagreed with the tiles that mis-seated the model
// (L-142 727 m-underground) and, when it failed, the whole clamp bailed to flat 0. The fix
// removes ion terrain entirely and clamps only to the self-consistent tile surface.

import { describe, it, expect, vi } from 'vitest';

// `cesium` is a large browser module; the only thing CesiumViewport touches at IMPORT time is
// `Cesium.Ion.defaultAccessToken`. A minimal stub lets the import succeed — the pure static
// under test never calls into Cesium.
vi.mock('cesium', () => ({ Ion: { defaultAccessToken: '' } }));

import { CesiumViewport } from '../src/ui/geospatial/CesiumViewport';

const pick = CesiumViewport.selectPhotorealTileBaseHeight;

describe('§FIX-GLOBE-CLAMP-TO-PHOTOREAL-TILES — selectPhotorealTileBaseHeight', () => {
    it('takes the MINIMUM finite sample (roofs are above the ground they stand on)', () => {
        // Footprint + street-ring samples: some land on neighbour roofs (higher), the street
        // min is the true ground. Madrid-scale ellipsoid heights (~650 m).
        expect(pick([662.4, 651.1, 650.0, 658.2], null)).toBe(650.0);
    });

    it('ignores null / undefined / NaN picks and reduces the finite ones', () => {
        expect(pick([null, 655.3, undefined, Number.NaN, 654.9], null)).toBe(654.9);
    });

    it('seats on the tileset bounding-sphere ground when NO pick resolved (Madrid ~650 m)', () => {
        // The picking APIs returned nothing (tiles not height-pickable at this LOD), but the
        // tileset sphere gives a real elevated ground → seat there, NOT at flat 0 (underground).
        expect(pick([null, undefined], 650.0)).toBe(650.0);
        expect(pick([], 650.0)).toBe(650.0);
    });

    it('returns null (→ caller retries) when nothing resolved and there is no sphere ground', () => {
        expect(pick([null, undefined, Number.NaN], null)).toBeNull();
        expect(pick([], null)).toBeNull();
    });

    it('rejects a bogus ~0 sphere ground (ellipsoid 0 must not masquerade as real ground)', () => {
        // |sphereGround| ≤ 1 m is treated as the keyless ellipsoid-0 artefact, not a seat.
        expect(pick([], 0)).toBeNull();
        expect(pick([], 0.5)).toBeNull();
        expect(pick([], -0.9)).toBeNull();
    });

    it('a real pick always WINS over the sphere fallback', () => {
        // Even when a sphere estimate exists, an actual tile-surface pick is authoritative.
        expect(pick([648.0, 649.5], 700.0)).toBe(648.0);
    });

    it('handles genuinely below-ellipsoid ground (e.g. reclaimed land) without flooring to 0', () => {
        expect(pick([-4.2, -3.1, -3.9], null)).toBe(-4.2);
    });

    it('is a pure function — same inputs, same output, no hidden state', () => {
        const a = pick([650, 651], 660);
        const b = pick([650, 651], 660);
        expect(a).toBe(b);
        expect(a).toBe(650);
    });

    // §FIX-GLOBE-AUTOFRAME-AND-SEAT (L-184) — a real tile pick is sunk by the seat epsilon so
    // the model seats FLUSH on the tile ground instead of perching a hair above it.
    it('sinks a real tile pick by the seat epsilon (seats flush, no float)', () => {
        // min = 650.0; seat 0.3 m lower so the model is flush, not floating on tile-mesh noise.
        expect(pick([662.4, 651.1, 650.0, 658.2], null, 0.3)).toBeCloseTo(649.7, 6);
    });

    it('does NOT apply the seat epsilon to the coarse sphere-ground fallback', () => {
        // No real pick resolved → the sphere estimate is already downward-biased; leave it as-is.
        expect(pick([], 650.0, 0.3)).toBe(650.0);
        expect(pick([null, undefined], 650.0, 0.3)).toBe(650.0);
    });

    it('never turns a null (retry) result into a spurious base via the epsilon', () => {
        expect(pick([], null, 0.3)).toBeNull();
        expect(pick([null, Number.NaN], null, 5)).toBeNull();
    });

    it('defaults the seat epsilon to 0 (back-compat with the 2-arg callers)', () => {
        expect(pick([650, 651], null)).toBe(650);
    });
});

// §FIX-GLOBE-3DTILES-CRASH (L-183) — the intermittent "3D globe crashes" was an unhandled
// promise rejection from a Cesium tile height-sample (clampToHeightMostDetailed /
// sampleHeightMostDetailed) thrown when the 3D-tileset wasn't ready — escaping a `void`-ed
// call and tripping ViewportCrashGuard → full reload. `safeSampleTileHeights` is the guard:
// it NEVER rejects, returning the finite heights on success and an empty array on any throw so
// the caller degrades to its sphere fallback / retry (tiles stream in) instead of crashing.
describe('§FIX-GLOBE-3DTILES-CRASH — safeSampleTileHeights swallows sample throws', () => {
    const safe = CesiumViewport.safeSampleTileHeights;

    it('returns the finite heights on success (prefers the real tile surface)', async () => {
        const heights = await safe(
            () => Promise.resolve([{ height: 650.1 }, { height: 651.4 }]),
            (r: { height: number }) => r.height,
        );
        // §GROUND-PICKS-KEEP-THEIR-POSITION (L-13277) — the sampler now returns the SAMPLE
        // INDEX beside each height. It has to: ground and roof differ only in whether height
        // is a function of POSITION, and compacting to a bare `number[]` threw that away
        // before the classifier ever ran.
        expect(heights).toEqual([{ idx: 0, h: 650.1 }, { idx: 1, h: 651.4 }]);
    });

    it('swallows a REJECTED sampler (tileset not ready) → empty array, no unhandled rejection', async () => {
        // The whole point: this must RESOLVE (not reject) so the `void`-ed caller never crashes.
        await expect(
            safe(
                () => Promise.reject(new Error('tileset has not streamed a height at this LOD')),
                (r: { height: number }) => r.height,
            ),
        ).resolves.toEqual([]);
    });

    it('swallows a SYNCHRONOUSLY-throwing sampler → empty array', async () => {
        await expect(
            safe(
                () => { throw new Error('scene destroyed mid-await'); },
                (r: { height: number }) => r.height,
            ),
        ).resolves.toEqual([]);
    });

    it('skips a per-item extract that throws (degenerate cartesian) but keeps the good picks', async () => {
        const heights = await safe(
            () => Promise.resolve([{ ok: true }, { ok: false }, { ok: true }]),
            (r: { ok: boolean }) => {
                if (!r.ok) throw new Error('Cartographic.fromCartesian failed');
                return 650;
            },
        );
        // ⛔ THE INDICES ARE 0 AND 2, NOT 0 AND 1. The middle item's extract threw and was
        // dropped, so the surviving picks are NOT contiguous — which is exactly why the index
        // must be carried explicitly and cannot be inferred from the output's own position.
        expect(heights).toEqual([{ idx: 0, h: 650 }, { idx: 2, h: 650 }]);
    });

    it('drops null / undefined / NaN heights (tiles not height-pickable at this point)', async () => {
        const heights = await safe(
            () => Promise.resolve([{ height: null }, { height: 649.2 }, { height: Number.NaN }]),
            (r: { height: number | null }) => r.height,
        );
        // §GROUND-PICKS-KEEP-THEIR-POSITION (L-13277) — idx 1, because the null at 0 was
        // dropped. The surviving pick's ORIGINAL sample index is the whole point.
        expect(heights).toEqual([{ idx: 1, h: 649.2 }]);
    });

    it('returns [] when the sampler is unavailable (older Cesium build / API missing)', async () => {
        await expect(safe(undefined, (r: { height: number }) => r.height)).resolves.toEqual([]);
    });

    it('returns [] when the sampler resolves a non-array', async () => {
        await expect(
            safe(
                () => Promise.resolve(null as unknown as { height: number }[]),
                (r: { height: number }) => r.height,
            ),
        ).resolves.toEqual([]);
    });
});

// §FIX-GLOBE-REENTRY-MODEL-LOST (L-186) — after a globe→forma→globe round-trip the PRYZM house
// vanished: the Forma "3D Site" study path DESTROYS the globe model (clearRealModelOnGlobe), but
// the placement cache still thought it was placed (unchanged signature + stale "placed" flag) and
// short-circuited to an EMPTY globe. `shouldReuseGlobeRealModel` gates reuse on the model STILL
// being live, so a cleared model is re-placed on re-entry.
describe('§FIX-GLOBE-REENTRY-MODEL-LOST — shouldReuseGlobeRealModel', () => {
    const reuse = CesiumViewport.shouldReuseGlobeRealModel;

    it('reuses the model when geometry is unchanged AND the model is still live', () => {
        expect(reuse('sigA', 'sigA', true, true)).toBe(true);
    });

    it('does NOT reuse after a forma round-trip destroyed the model (THE BUG) — forces re-place', () => {
        // Same signature, still-flagged placed, but the primitive is GONE → must re-place.
        expect(reuse('sigA', 'sigA', true, false)).toBe(false);
    });

    it('does NOT reuse when the geometry signature changed (a real edit) — re-export', () => {
        expect(reuse('sigB', 'sigA', true, true)).toBe(false);
    });

    it('does NOT reuse when nothing was placed yet', () => {
        expect(reuse('sigA', 'sigA', false, true)).toBe(false);
    });

    it('does NOT reuse when there is no prior signature (first placement)', () => {
        expect(reuse('sigA', null, true, true)).toBe(false);
        expect(reuse(null, null, true, true)).toBe(false);
    });

    it('is a pure function — deterministic on identical inputs', () => {
        expect(reuse('s', 's', true, true)).toBe(reuse('s', 's', true, true));
    });
});

// §FIX-GLOBE-REAL-MODEL-UNDERGROUND-CLAMP (L-198) — the REAL detailed GLB was placed at the
// stale pre-await base (~0 = ellipsoid/sea-level) even though the photoreal-tile clamp had
// already resolved the true ground (e.g. Madrid 706.9 m) — so the model sank ~707 m
// underground while the massing sat correctly on the tiles. `renderRealModelOnGlobe` captured
// its base BEFORE `await Cesium.Model.fromGltfAsync(...)`; the clamp settles DURING that parse
// and the reseat-on-settle missed the not-yet-assigned primitive. `resolveGlobeRealModelBaseHeight`
// is the PURE reduction the fix re-evaluates AFTER the parse so the model seats on the same
// clamped base the massing uses (never flat 0).
describe('§FIX-GLOBE-REAL-MODEL-UNDERGROUND-CLAMP — resolveGlobeRealModelBaseHeight', () => {
    const resolve = CesiumViewport.resolveGlobeRealModelBaseHeight;

    it('uses the tile-clamped base (NOT 0) when the caller passes no override — THE BUG', () => {
        // Madrid: clamp settled 706.9 m during the async GLB parse; the real model must seat
        // there, exactly like the massing — never at the pre-await ellipsoid 0.
        expect(resolve(undefined, 706.9)).toBe(706.9);
    });

    it('falls back to the clamped base for a non-finite / undefined override', () => {
        expect(resolve(undefined, 650.0)).toBe(650.0);
        expect(resolve(Number.NaN, 650.0)).toBe(650.0);
        expect(resolve(Number.POSITIVE_INFINITY, 650.0)).toBe(650.0);
    });

    it('honours an explicit FINITE caller override (including a genuine 0 at sea level)', () => {
        expect(resolve(12.5, 706.9)).toBe(12.5);
        expect(resolve(0, 706.9)).toBe(0);        // an EXPLICIT sea-level pin wins
        expect(resolve(-4.2, 100)).toBe(-4.2);    // reclaimed land below the ellipsoid
    });

    it('re-evaluated post-parse yields the settled base even if the pre-await base was 0', () => {
        // Models the L-198 race: pre-await formaTerrainBaseHeight = 0, clamp settles 706.9 during
        // the parse → re-evaluating against the fresh SSOT re-seats flush, not underground.
        const preAwait = resolve(undefined, 0);       // captured before fromGltfAsync
        const postAwait = resolve(undefined, 706.9);  // re-read after the clamp settled mid-parse
        expect(preAwait).toBe(0);
        expect(postAwait).toBe(706.9);
        expect(postAwait).not.toBe(preAwait);
    });

    it('is a pure function — deterministic on identical inputs', () => {
        expect(resolve(undefined, 706.9)).toBe(resolve(undefined, 706.9));
    });
});
