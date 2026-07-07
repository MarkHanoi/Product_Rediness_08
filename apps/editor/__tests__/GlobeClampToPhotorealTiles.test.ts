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
});
