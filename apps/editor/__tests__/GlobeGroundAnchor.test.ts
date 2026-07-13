// @vitest-environment happy-dom
//
// §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — THE GUARD.
//
// FOUNDER (Menorca, metres from the sea): "Why is the Cesium 3D globe still incorrect? It is
// still at 0 elevation, it seems? Why sometimes is it correct and sometimes not? We are really
// close to sea level — still goes underground. The house is not in the correct location,
// neither the view."
//
// TWO defects, guarded separately:
//
// (i) VERTICAL — the model is underground, INTERMITTENTLY. A geodetic transform is
//     deterministic, so the variable is WHEN the terrain height is known. The tile-surface
//     height sample is ASYNCHRONOUS; the old policy retried 3 × 1.2 s and then silently left
//     the base at `formaTerrainBaseHeight = 0`. **`0` is the WGS-84 ELLIPSOID, not sea level.**
//     In the Balearics the geoid/ellipsoid separation is ≈ +49 m, so real ground a few metres
//     above MSL sits at ≈ +52 m ELLIPSOIDAL — anchoring at 0 buries the house ~50 m. Tiles that
//     stream inside the old 3.6 s budget → looks right; a cold cache → buried. THAT is the
//     intermittency. The regression that keeps coming back is precisely the LATE-RESOLVING
//     sample, so it is pinned here.
//
// (ii) HORIZONTAL — an elevation error cannot move a building sideways. PRYZM has TWO origin
//     authorities: the LTP-ENU origin (the frame the boundary + walls' scene-XZ are BAKED in)
//     and the geocoded address. Once a boundary is committed the LTP origin is FROZEN (C19
//     §1.3) while the address can still move — anything anchored/framed off the address then
//     lands `originSeparationMeters` away from the building. Guarded by the divergence math.
//
// These are the PURE decisions (no Cesium, no DOM) that the CesiumViewport globe path is now
// built on — see `apps/editor/src/ui/geospatial/globeGroundAnchor.ts` and C12 §1.4/§1.5.

import { describe, it, expect } from 'vitest';

import {
    reduceTileGroundHeight,
    resolveGlobeGroundAnchor,
    decideGroundAnchorAction,
    originSeparationMeters,
    georefOriginsDiverge,
    type GlobeGroundAnchorInput,
} from '../src/ui/geospatial/globeGroundAnchor';

/** Menorca (the founder's site): ground ≈ 5 m above mean sea level, geoid separation ≈ +49 m,
 *  so the photoreal tile surface sits at ≈ 54 m ELLIPSOIDAL. Anchoring at 0 = ~54 m under. */
const MENORCA = { lat: 39.9496, lon: 4.1102 };
const MENORCA_TILE_GROUND_ELLIPSOIDAL_M = 54.2;

const base = (over: Partial<GlobeGroundAnchorInput> = {}): GlobeGroundAnchorInput => ({
    photorealTilesActive: true,
    heightPickingAvailable: true,
    tileSampleHeights: [],
    tilesetSphereGroundHeightM: null,
    ...over,
});

describe('§FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (i) — the ground datum is measured or UNKNOWN, never a silent 0', () => {
    it('THE BUG: with photoreal tiles shown and NO height sample yet, the ground is UNRESOLVED — NOT 0', () => {
        const anchor = resolveGlobeGroundAnchor(base({ tileSampleHeights: [] }));
        expect(anchor.status).toBe('unresolved');
        // The critical assertion: there is NO fallback number. A `0` here is the burial.
        expect(anchor.heightM).toBeNull();
        expect(anchor.source).toBe('unresolved');
    });

    it('an UNRESOLVED datum HOLDS the building hidden while retries remain (never anchored at 0)', () => {
        const anchor = resolveGlobeGroundAnchor(base());
        expect(decideGroundAnchorAction(anchor, 12)).toBe('hold-hidden-retry');
        expect(decideGroundAnchorAction(anchor, 1)).toBe('hold-hidden-retry');
    });

    it('THE LATE-RESOLVE REGRESSION: the sample lands AFTER the model was placed → seat at the measured tile ground, not 0', () => {
        // t0 — the globe opens, tiles have not streamed: no picks.
        const t0 = resolveGlobeGroundAnchor(base({ tileSampleHeights: [] }));
        expect(decideGroundAnchorAction(t0, 12)).toBe('hold-hidden-retry');
        expect(t0.heightM).toBeNull();

        // t1 — tiles stream in (the tileset's initialTilesLoaded fires / a retry lands) and the
        // clamp finally returns Menorca's real tile-surface heights.
        const t1 = resolveGlobeGroundAnchor(
            base({
                tileSampleHeights: [
                    MENORCA_TILE_GROUND_ELLIPSOIDAL_M + 6.1, // a neighbour's roof
                    MENORCA_TILE_GROUND_ELLIPSOIDAL_M,       // street ground
                    MENORCA_TILE_GROUND_ELLIPSOIDAL_M + 0.4,
                ],
                seatEpsilonM: 0.3,
            }),
        );
        expect(t1.status).toBe('resolved');
        expect(decideGroundAnchorAction(t1, 11)).toBe('seat-and-reveal');
        expect(t1.source).toBe('photoreal-tile-clamp');
        // Seated on the STREET min, sunk by the seat epsilon — ~54 m ELLIPSOIDAL, i.e. ~50 m
        // ABOVE where the old code left it. That 50 m IS the founder's "underground".
        expect(t1.heightM).toBeCloseTo(MENORCA_TILE_GROUND_ELLIPSOIDAL_M - 0.3, 6);
        expect(t1.heightM! - 0).toBeGreaterThan(45); // the burial depth the old fallback caused
    });

    it('a coarse tileset bounding-sphere ground is a REAL measurement and may be used (never fabricated)', () => {
        const anchor = resolveGlobeGroundAnchor(
            base({ tileSampleHeights: [], tilesetSphereGroundHeightM: 51.0, seatEpsilonM: 0.3 }),
        );
        expect(anchor.status).toBe('resolved');
        expect(anchor.source).toBe('tileset-bounding-sphere');
        // The seat epsilon is NOT applied to the already-downward-biased sphere estimate.
        expect(anchor.heightM).toBe(51.0);
    });

    it('a bogus ~0 bounding sphere (the keyless ellipsoid artefact) must NOT masquerade as ground', () => {
        const anchor = resolveGlobeGroundAnchor(base({ tilesetSphereGroundHeightM: 0.4 }));
        expect(anchor.status).toBe('unresolved');
        expect(anchor.heightM).toBeNull();
    });

    it('with NO photoreal tiles the rendered globe surface IS the ellipsoid → 0 is the TRUE ground', () => {
        // The Forma flat-ground study / keyless globe: this 0 is a datum statement, not a guess.
        const anchor = resolveGlobeGroundAnchor(base({ photorealTilesActive: false }));
        expect(anchor.status).toBe('resolved');
        expect(anchor.heightM).toBe(0);
        expect(anchor.source).toBe('ellipsoid-flat-ground');
        expect(decideGroundAnchorAction(anchor, 0)).toBe('seat-and-reveal');
    });

    it('no height-picking API (old Cesium build) is a CAPABILITY gap → unresolved, and it degrades LOUDLY, not silently', () => {
        const anchor = resolveGlobeGroundAnchor(base({ heightPickingAvailable: false }));
        expect(anchor.status).toBe('unresolved');
        // Budget spent → we refuse to hide the house forever, but the datum is declared unknown.
        expect(decideGroundAnchorAction(anchor, 0)).toBe('reveal-unknown-datum-warn');
    });

    it('the retry budget always terminates — an unresolved datum never hides the building forever', () => {
        const anchor = resolveGlobeGroundAnchor(base());
        expect(decideGroundAnchorAction(anchor, 0)).toBe('reveal-unknown-datum-warn');
    });

    it('EVERY height it returns is ELLIPSOIDAL WGS-84 — the one datum Cesium\'s APIs consume', () => {
        // The whole class of bug is feeding an ORTHOMETRIC (MSL) height into an ELLIPSOIDAL API.
        // The type carries the datum so a caller cannot lose track of it.
        for (const a of [
            resolveGlobeGroundAnchor(base({ photorealTilesActive: false })),
            resolveGlobeGroundAnchor(base({ tileSampleHeights: [54.2] })),
            resolveGlobeGroundAnchor(base({ tilesetSphereGroundHeightM: 51 })),
            resolveGlobeGroundAnchor(base()),
        ]) {
            expect(a.datum).toBe('ellipsoidal-wgs84');
        }
    });

    it('handles genuinely below-ellipsoid ground (reclaimed land) without flooring to 0', () => {
        const anchor = resolveGlobeGroundAnchor(base({ tileSampleHeights: [-4.2, -3.1] }));
        expect(anchor.status).toBe('resolved');
        expect(anchor.heightM).toBe(-4.2);
    });

    it('reduceTileGroundHeight takes the MIN (roofs are above the ground they stand on) and ignores junk', () => {
        expect(reduceTileGroundHeight([62.4, 51.1, 50.0, 58.2], null)).toBe(50.0);
        expect(reduceTileGroundHeight([null, 55.3, undefined, Number.NaN, 54.9], null)).toBe(54.9);
        expect(reduceTileGroundHeight([], null)).toBeNull();
    });

    it('is a pure function — identical inputs, identical anchor (no hidden state, no time dependence)', () => {
        const a = resolveGlobeGroundAnchor(base({ tileSampleHeights: [54.2, 55.0] }));
        const b = resolveGlobeGroundAnchor(base({ tileSampleHeights: [54.2, 55.0] }));
        expect(a).toEqual(b);
    });
});

describe('§FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (ii) — the horizontal georeference: ONE origin authority', () => {
    it('measures the separation between the two origin authorities in METRES', () => {
        // ~100 m north of the LTP origin.
        const north100 = { lat: MENORCA.lat + 100 / 111320, lon: MENORCA.lon };
        expect(originSeparationMeters(MENORCA, north100)).toBeCloseTo(100, 0);
        // ~50 m east.
        const east50 = {
            lat: MENORCA.lat,
            lon: MENORCA.lon + 50 / (111320 * Math.cos((MENORCA.lat * Math.PI) / 180)),
        };
        expect(originSeparationMeters(MENORCA, east50)).toBeCloseTo(50, 0);
    });

    it('THE BUG: a frozen LTP origin + a moved geocoded address = the building and the view in DIFFERENT places', () => {
        // The boundary + walls are baked about the LTP origin (frozen by C19 §1.3 once the
        // parcel is committed). A later geocode moves the Site address ~140 m away. Anything
        // anchored/framed off the address (the OLD readSiteLocation precedence) is 140 m off.
        const ltp = MENORCA;
        const address = { lat: MENORCA.lat + 0.001, lon: MENORCA.lon + 0.0005 };
        const ev = { ltpOrigin: ltp, storeLocation: address, anchorOrigin: ltp };
        expect(georefOriginsDiverge(ev)).toBe(true);
        expect(originSeparationMeters(ltp, address)).toBeGreaterThan(100);
    });

    it('does NOT flag a divergence when both authorities agree (the normal, healthy case)', () => {
        const ev = { ltpOrigin: MENORCA, storeLocation: { ...MENORCA }, anchorOrigin: MENORCA };
        expect(georefOriginsDiverge(ev)).toBe(false);
        expect(originSeparationMeters(MENORCA, MENORCA)).toBe(0);
    });

    it('tolerates missing / non-finite evidence without throwing (a partial site is not a divergence)', () => {
        expect(originSeparationMeters(null, MENORCA)).toBeNaN();
        expect(originSeparationMeters(MENORCA, null)).toBeNaN();
        expect(originSeparationMeters({ lat: Number.NaN, lon: 0 }, MENORCA)).toBeNaN();
        expect(georefOriginsDiverge({ ltpOrigin: null, storeLocation: MENORCA, anchorOrigin: MENORCA })).toBe(false);
    });

    it('sub-metre noise (float round-trips) is not a divergence', () => {
        const jitter = { lat: MENORCA.lat + 1e-6, lon: MENORCA.lon + 1e-6 };
        expect(originSeparationMeters(MENORCA, jitter)).toBeLessThan(1);
        expect(georefOriginsDiverge({ ltpOrigin: MENORCA, storeLocation: jitter, anchorOrigin: MENORCA })).toBe(false);
    });
});
