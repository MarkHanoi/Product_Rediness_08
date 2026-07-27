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
    resolveGroundSample,
    ringCentroidLatLon,
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

// ─────────────────────────────────────────────────────────────────────────────────────
// §GLOBE-ELLIPSOID-PICK-IS-NOT-GROUND (L-477) — the pick SUCCEEDED and was WRONG.
// ─────────────────────────────────────────────────────────────────────────────────────
// L-259 (above) closed "no pick yet → silent 0". This closes the harder twin: a pick that
// COMES BACK, reports success, and is an ellipsoid hit. Where the photoreal tiles have not
// streamed at that LOD there is no primitive for `clampToHeightMostDetailed` to hit, so the
// ray continues onto the rendered globe — which on this keyless build IS the ellipsoid — and
// the API reports an ordinary successful pick at h ≈ 0.
//
// Measured live in Barcelona (L-466 case 2): base **-0.54 m ELLIPSOIDAL, resolved=y**, where
// the true tile surface is ≈ +50 m. The building was drawn ~50 m under the city, and the
// system reported it as resolved. Failure-reported-as-success, the same shape as L-467 /
// L-469 / L-476 in other layers.
//
// ⚠ The reduction takes the MINIMUM over footprint + street ring, so ONE ellipsoid hit does
// not dilute the answer — it WINS. That is why rejection must happen BEFORE the min.
describe('§GLOBE-ELLIPSOID-PICK-IS-NOT-GROUND (L-477) — a near-ellipsoid pick is not a measurement', () => {
    /** Barcelona: geoid separation ≈ +49 m, so the photoreal ground is ≈ +50 m ELLIPSOIDAL. */
    const BCN_TILE_GROUND_M = 50.3;

    it('THE BUG: a single ellipsoid hit among good tile picks no longer drags the base underground', () => {
        // Street-ring picks all agree on ~50 m; one ray fell through un-streamed tiles to ~0.
        const anchor = resolveGlobeGroundAnchor(base({
            tileSampleHeights: [BCN_TILE_GROUND_M, BCN_TILE_GROUND_M + 0.4, -0.54, BCN_TILE_GROUND_M + 0.2],
        }));
        expect(anchor.status).toBe('resolved');
        // Before the fix this was -0.54 — the min — and the building sat ~50 m under Barcelona.
        expect(anchor.heightM).toBeCloseTo(BCN_TILE_GROUND_M, 5);
        expect(anchor.source).toBe('photoreal-tile-clamp');
    });

    it('THE FOUNDER-REPORTED CASE: picks that are ALL ellipsoid hits resolve to UNRESOLVED, not to ~0', () => {
        const anchor = resolveGlobeGroundAnchor(base({ tileSampleHeights: [-0.54, 0, 0.31, -1.2] }));
        // The honest answer is "we have not measured the ground yet" — which is the truth:
        // the tiles had not streamed. UNRESOLVED makes the caller hold the building hidden
        // and retry (`decideGroundAnchorAction`) instead of burying it at a confident 0.
        expect(anchor.status).toBe('unresolved');
        expect(anchor.heightM).toBeNull();
        expect(anchor.source).toBe('unresolved');
    });

    it('and that UNRESOLVED state makes the caller RETRY rather than place — the refusal is the fix', () => {
        const anchor = resolveGlobeGroundAnchor(base({ tileSampleHeights: [-0.54] }));
        expect(decideGroundAnchorAction(anchor, 3)).toBe('hold-hidden-retry');
        // And when the budget is spent it is revealed with a LOUD warning — never silently.
        expect(decideGroundAnchorAction(anchor, 0)).toBe('reveal-unknown-datum-warn');
    });

    it('never mislabels an all-ellipsoid run as a real tile clamp, even when a sphere ground rescues it', () => {
        const anchor = resolveGlobeGroundAnchor(base({
            tileSampleHeights: [-0.54, 0.2],
            tilesetSphereGroundHeightM: BCN_TILE_GROUND_M,
        }));
        expect(anchor.status).toBe('resolved');
        expect(anchor.heightM).toBeCloseTo(BCN_TILE_GROUND_M, 5);
        // The evidence log must not claim we clamped to the tile mesh when every pick was junk.
        expect(anchor.source).toBe('tileset-bounding-sphere');
    });

    it('THE CORROBORATION ESCAPE: near-zero picks ARE believed when the tileset itself says ground is near zero', () => {
        // Genuinely low ground near a small geoid separation. Blanket-rejecting near-zero picks
        // would refuse to place a building here forever, so independent evidence re-admits them.
        const anchor = resolveGlobeGroundAnchor(base({
            tileSampleHeights: [1.4, 1.8, 2.1],
            tilesetSphereGroundHeightM: 1.5,
        }));
        expect(anchor.status).toBe('resolved');
        expect(anchor.heightM).toBeCloseTo(1.4, 5);
        expect(anchor.source).toBe('photoreal-tile-clamp');
    });

    it('leaves ordinary elevated ground untouched (Paris ≈ 80 m ellipsoidal, Menorca ≈ 54 m)', () => {
        expect(resolveGlobeGroundAnchor(base({ tileSampleHeights: [80.1, 81.0] })).heightM)
            .toBeCloseTo(80.1, 5);
        expect(resolveGlobeGroundAnchor(base({ tileSampleHeights: [MENORCA_TILE_GROUND_ELLIPSOIDAL_M] })).heightM)
            .toBeCloseTo(MENORCA_TILE_GROUND_ELLIPSOIDAL_M, 5);
    });

    it('does NOT touch the flat-ground study: with photoreal tiles OFF, 0 is still the true datum', () => {
        // ADR-0268 §156 — no tiles means the rendered globe surface IS the ellipsoid, so 0 is a
        // true datum statement, not a fall-through. This rule must never reach that path.
        const anchor = resolveGlobeGroundAnchor(base({ photorealTilesActive: false, tileSampleHeights: [] }));
        expect(anchor.status).toBe('resolved');
        expect(anchor.heightM).toBe(0);
        expect(anchor.source).toBe('ellipsoid-flat-ground');
    });

    it('reduceTileGroundHeight keeps its historical L-179/L-184 semantics when the flag is OFF', () => {
        // The legacy `selectPhotorealTileBaseHeight` surface delegates without the flag, so the
        // opt-in must be exactly that: opt-in. Guards against a silent behaviour change there.
        expect(reduceTileGroundHeight([50.3, -0.54], null, 0)).toBeCloseTo(-0.54, 5);
        expect(reduceTileGroundHeight([50.3, -0.54], null, 0, { rejectEllipsoidPicks: true }))
            .toBeCloseTo(50.3, 5);
    });
});

// ─────────────────────────────────────────────────────────────────────────────────────
// §GLOBE-LONE-OUTLIER-CANNOT-SET-THE-DATUM (L-479) — the founder's two-run measurement.
// ─────────────────────────────────────────────────────────────────────────────────────
// Same parcel, same anchor, minutes apart:
//     picks=48 → 50.87 m  (correct: Barcelona tile surface, geoid ≈ +49 m + terrain)
//     picks=49 → 11.38 m  (buried ~40 m)
// ONE extra pick, ~39 m below the rest, took the whole building underground — because a raw
// `min` gives every single sample a veto over the datum.
describe('§GLOBE-LONE-OUTLIER-CANNOT-SET-THE-DATUM (L-479) — the founder\'s exact two-run case', () => {
    /** ~48 street-ring picks clustered on the real Barcelona tile surface. */
    const goodPicks = Array.from({ length: 48 }, (_, i) => 50.87 + (i % 7) * 0.35);

    it('THE BUG: one fall-through pick 39 m low no longer decides the ground', () => {
        const buried = resolveGlobeGroundAnchor(base({ tileSampleHeights: [...goodPicks, 11.38] }));
        // Before the fix this returned 11.38 — the founder's buried building.
        expect(buried.heightM).toBeGreaterThan(45);
        expect(buried.heightM).toBeLessThan(56);
    });

    it('and the two runs now AGREE, which is the property that was actually broken', () => {
        const runB = resolveGlobeGroundAnchor(base({ tileSampleHeights: goodPicks }));           // 48 picks
        const runA = resolveGlobeGroundAnchor(base({ tileSampleHeights: [...goodPicks, 11.38] })); // 49 picks
        // The founder saw 50.87 vs 11.38 for the same parcel. Same input ± one bad ray must not
        // move the datum by 39 m; a datum that flips on re-entry is indistinguishable from a bug.
        expect(Math.abs((runA.heightM as number) - (runB.heightM as number))).toBeLessThan(2);
    });

    it('still takes the LOW end — it must not perch on a podium or a neighbour roof', () => {
        // 40 street picks at ~50 m + 8 rooftop picks at ~80 m. The answer must be street ground.
        const withRoofs = [
            ...Array.from({ length: 40 }, (_, i) => 50 + (i % 5) * 0.2),
            ...Array.from({ length: 8 }, () => 80),
        ];
        const anchor = resolveGlobeGroundAnchor(base({ tileSampleHeights: withRoofs }));
        expect(anchor.heightM).toBeLessThan(52);   // street, not roof
        expect(anchor.heightM).toBeGreaterThan(49);
    });

    it('preserves the exact previous MIN behaviour on a small sample (no distribution to trust)', () => {
        // Fewer than OUTLIER_ROBUST_MIN_SAMPLES → unchanged semantics, so nothing regresses on
        // the sparse-pick paths that predate the street ring.
        const anchor = resolveGlobeGroundAnchor(base({ tileSampleHeights: [80.1, 81.0, 80.5] }));
        expect(anchor.heightM).toBeCloseTo(80.1, 5);
    });
});

// §SITEFRAME-GROUND (C12 §9 T0/T1) — the per-point ground authority the terrain reseat is built
// on. These pin the PURE decisions behind `CesiumViewport.sampleGround` (the fallback rule) and
// the per-footprint seat point (the ring centroid), so the reseat that removes the white
// z-fighting context shells + the faint (terrain-occluded) heatmap is testable without a viewer.
describe('§SITEFRAME-GROUND — resolveGroundSample (the per-point fallback rule)', () => {
    it('a FINITE sample wins — the point seats on its OWN relief, not the centroid', () => {
        // Neighbour on higher ground: real terrain here is 61 m, centroid base is 54 m.
        expect(resolveGroundSample(61.2, 54)).toBeCloseTo(61.2, 6);
        // Neighbour on lower ground: real terrain 47 m — it no longer floats at the centroid.
        expect(resolveGroundSample(47.0, 54)).toBeCloseTo(47.0, 6);
        // Zero is a legal MEASURED ground (sea-level ellipsoid) when it comes from a finite sample.
        expect(resolveGroundSample(0, 54)).toBe(0);
    });

    it('an UNKNOWN sample falls back to the centroid base — never a stray 0 (the L-259 rule per-point)', () => {
        // `globe.getHeight` returns undefined where the tile is not yet tessellated.
        expect(resolveGroundSample(undefined, 54)).toBe(54);
        expect(resolveGroundSample(null, 54)).toBe(54);
        expect(resolveGroundSample(Number.NaN, 54)).toBe(54);
        expect(resolveGroundSample(Number.POSITIVE_INFINITY, 54)).toBe(54);
    });

    it('with no terrain attached the centroid base is the honest flat 0 → fallback stays 0', () => {
        expect(resolveGroundSample(undefined, 0)).toBe(0);
    });
});

describe('§SITEFRAME-GROUND — ringCentroidLatLon (the footprint seat point)', () => {
    it('returns the vertex-mean lat/lon of a [lon,lat] ring (longitude FIRST)', () => {
        // A closed square around (lon 1.8, lat 40.8); the closing vertex repeats the first.
        const ring = [
            [1.0, 40.0],
            [3.0, 40.0],
            [3.0, 42.0],
            [1.0, 42.0],
            [1.0, 40.0],
        ];
        const c = ringCentroidLatLon(ring);
        expect(c).not.toBeNull();
        // mean lon = (1+3+3+1+1)/5 = 1.8 ; mean lat = (40+40+42+42+40)/5 = 40.8
        expect(c!.lon).toBeCloseTo(1.8, 6);
        expect(c!.lat).toBeCloseTo(40.8, 6);
    });

    it('ignores non-finite vertices and returns null for an empty / all-invalid ring', () => {
        expect(ringCentroidLatLon([null, undefined, [Number.NaN, 5]])).toBeNull();
        expect(ringCentroidLatLon([])).toBeNull();
        // One good vertex among junk still yields that vertex.
        const c = ringCentroidLatLon([null, [2.5, 41.5], [Number.NaN, Number.NaN]]);
        expect(c!.lon).toBeCloseTo(2.5, 6);
        expect(c!.lat).toBeCloseTo(41.5, 6);
    });
});
