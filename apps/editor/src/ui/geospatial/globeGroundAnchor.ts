// §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — PURE vertical-datum + georeference
// decisions for the Cesium "3D globe" building anchor. No Cesium, no THREE, no DOM, no
// I/O — deterministic reductions that pin the two founder-visible defects' logic so they
// are unit-testable WITHOUT a live Cesium viewer (which cannot run headless). Mirrors the
// `globePlacementDecisions.ts` precedent (L-193): pure decisions are P8 span-exempt.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// THE VERTICAL DEFECT (i) — "still at 0 elevation… sometimes correct, sometimes not"
// ─────────────────────────────────────────────────────────────────────────────────────
// EVERY height Cesium consumes through `Cartesian3.fromDegrees(lon, lat, h)` /
// `Transforms.eastNorthUpToFixedFrame` is **ELLIPSOIDAL (WGS-84)** — NOT orthometric
// (above mean sea level). `h = 0` is therefore **the WGS-84 ellipsoid, not sea level**.
// In the Balearics (the founder's Menorca site) the geoid–ellipsoid separation is
// ≈ **+49 m**, so real ground a few metres above MSL sits at ≈ +52…55 m ELLIPSOIDAL.
//
// The photoreal Google 3D-Tiles mesh is authored in ellipsoidal heights, so the VISIBLE
// ground on the globe is ~50 m above `h = 0`. Anchoring the building at the pre-sample
// default `formaTerrainBaseHeight = 0` therefore buries it ~50 m UNDER the tiles — which
// is exactly "we are really close to sea level and it still goes underground".
//
// THE RACE (why it is intermittent): the tile-surface height sample
// (`scene.clampToHeightMostDetailed` / `sampleHeightMostDetailed`) is ASYNCHRONOUS and
// only returns a height once tiles have STREAMED at that LOD. The old policy retried
// 3 × 1.2 s and then GAVE UP, silently leaving the base at 0 ("keyless / ellipsoid →
// base 0 is already a correct flat-ground seat" — true ONLY when no photoreal tiles are
// shown). Tiles in < 3.6 s → correct; slow network / cold cache → buried. A geodetic
// transform is deterministic; the VARIABLE was *when the ground height was known*.
//
// THE RULE (now normative — C12 §1.4): while the photoreal tiles are the visible ground,
// `0` is NOT a legal ground height. The ground datum is either RESOLVED (a real
// measurement off the tile mesh, or the tileset's own bounding-sphere ground) or it is
// UNRESOLVED — and an UNRESOLVED datum must never be silently coerced to 0.
//
// ─────────────────────────────────────────────────────────────────────────────────────
// THE HORIZONTAL DEFECT (ii) — "the house is not in the correct location, neither the view"
// ─────────────────────────────────────────────────────────────────────────────────────
// An elevation error cannot move a building horizontally. PRYZM has TWO independent
// georeference authorities:
//   • the **LTP-ENU origin** (`getCurrentSiteOrigin()`) — the frame the parcel boundary
//     and every authored wall's scene-XZ is BAKED in (`boundaryProjection.latLonToSceneXZ`
//     projects about it at commit time), and
//   • the **geocoded address** (`siteModelStore.getLocation()`).
// They coincide until a boundary is committed; from then on `setLtpOriginIfSafe` FREEZES
// the LTP origin (C19 §1.3 boundary-shift guard) while the store location can still move.
// Anchoring or FRAMING at the address while the geometry lives in the LTP frame offsets
// the view (and any consumer that anchors off it) by the separation between them.
// `originSeparationMeters` makes that divergence measurable + loggable so it can never
// again be diagnosed by guesswork.

/** The ONE vertical datum Cesium's placement APIs accept. Stated explicitly so no caller
 *  can pass an orthometric (MSL) height without the conversion being visible in the type. */
export type GroundDatum = 'ellipsoidal-wgs84';

/** Where a resolved ground height came from — printed in the anchor evidence log. */
export type GroundHeightSource =
    /** A real height pick off the loaded photoreal 3D-Tiles MESH (authoritative). */
    | 'photoreal-tile-clamp'
    /** The photoreal tileset's own root bounding-sphere ground estimate (coarse but real). */
    | 'tileset-bounding-sphere'
    /** No photoreal tiles are shown → the rendered globe surface IS the WGS-84 ellipsoid,
     *  so 0 is the TRUE ground for that surface (the Forma flat-ground study / keyless globe). */
    | 'ellipsoid-flat-ground'
    /** The ground height is NOT known yet (tiles still streaming / no picking API). */
    | 'unresolved';

/** The resolved (or explicitly unresolved) ground anchor for the globe building. */
export interface GlobeGroundAnchor {
    readonly status: 'resolved' | 'unresolved';
    /** Ellipsoidal WGS-84 metres. `null` when `status === 'unresolved'` — there is NO
     *  fallback number, by design: a silent 0 is the L-259 bug. */
    readonly heightM: number | null;
    readonly datum: GroundDatum;
    readonly source: GroundHeightSource;
}

export interface GlobeGroundAnchorInput {
    /** True when Google Photorealistic 3D-Tiles are LOADED and visible — i.e. the visible
     *  ground is the tile mesh (ellipsoidal, geoid included), NOT the ellipsoid surface. */
    readonly photorealTilesActive: boolean;
    /** True when the scene exposes a height-picking API (`clampToHeightMostDetailed` /
     *  `sampleHeightMostDetailed`). False on an old Cesium build → the tile ground can
     *  never be measured, which is a CAPABILITY gap, not a race. */
    readonly heightPickingAvailable: boolean;
    /** Every height pick returned by the tile-surface sampler (footprint + street ring). */
    readonly tileSampleHeights: readonly (number | null | undefined)[];
    /** The photoreal tileset's bounding-sphere ground estimate, or null. */
    readonly tilesetSphereGroundHeightM: number | null;
    /** Seat the model this many metres BELOW a real tile pick so it sits flush on tile-mesh
     *  noise instead of perching (L-184). Never applied to the coarse sphere estimate. */
    readonly seatEpsilonM?: number;
}

/**
 * §FIX-GLOBE-CLAMP-TO-PHOTOREAL-TILES (L-179) — the PURE reduction of the tile-surface
 * height picks to a base height. A building roof is always ABOVE the ground it stands on,
 * so the MINIMUM over the footprint + surrounding street ring recovers the true street
 * ground even when the centroid is occluded by a neighbouring tile building. Falls back to
 * the tileset bounding-sphere ground when it is finite and materially non-zero (|h| > 1 m —
 * a bogus ellipsoid-0 sphere must NOT masquerade as real ground), else null.
 *
 * `CesiumViewport.selectPhotorealTileBaseHeight` delegates here so there is ONE reduction.
 */
export function reduceTileGroundHeight(
    sampledHeights: readonly (number | null | undefined)[],
    sphereGroundHeightM: number | null,
    seatEpsilonM = 0,
): number | null {
    let min: number | null = null;
    for (const h of sampledHeights) {
        if (typeof h === 'number' && Number.isFinite(h)) {
            min = min === null ? h : Math.min(min, h);
        }
    }
    if (min !== null) return min - seatEpsilonM;
    if (
        sphereGroundHeightM !== null &&
        Number.isFinite(sphereGroundHeightM) &&
        Math.abs(sphereGroundHeightM) > 1
    ) {
        return sphereGroundHeightM;
    }
    return null;
}

/**
 * §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — THE ONE DATUM BOUNDARY (C12 §1.4).
 * Resolve the ground height the building must be anchored at, ALWAYS in the ellipsoidal
 * WGS-84 datum Cesium's placement APIs consume, and NEVER inventing a 0 when the ground is
 * unknown.
 *
 *   • no photoreal tiles      → the rendered globe surface IS the ellipsoid ⇒ RESOLVED at 0
 *                               (`ellipsoid-flat-ground`); this is a true datum statement,
 *                               not a fallback.
 *   • tiles + a real pick     → RESOLVED at min(picks) − seatEpsilon (`photoreal-tile-clamp`).
 *   • tiles + only a sphere   → RESOLVED at the sphere ground (`tileset-bounding-sphere`).
 *   • tiles + nothing yet     → **UNRESOLVED** (`heightM: null`). The caller MUST hold the
 *                               building hidden and retry — anchoring at 0 here is the
 *                               ~50 m Menorca burial (geoid–ellipsoid separation).
 *   • tiles + no picking API  → **UNRESOLVED** (capability gap; the caller degrades LOUDLY).
 */
export function resolveGlobeGroundAnchor(input: GlobeGroundAnchorInput): GlobeGroundAnchor {
    if (!input.photorealTilesActive) {
        return {
            status: 'resolved',
            heightM: 0,
            datum: 'ellipsoidal-wgs84',
            source: 'ellipsoid-flat-ground',
        };
    }
    if (!input.heightPickingAvailable) {
        return { status: 'unresolved', heightM: null, datum: 'ellipsoidal-wgs84', source: 'unresolved' };
    }
    const hasRealPick = input.tileSampleHeights.some(
        (h) => typeof h === 'number' && Number.isFinite(h),
    );
    const h = reduceTileGroundHeight(
        input.tileSampleHeights,
        input.tilesetSphereGroundHeightM,
        input.seatEpsilonM ?? 0,
    );
    if (h === null) {
        return { status: 'unresolved', heightM: null, datum: 'ellipsoidal-wgs84', source: 'unresolved' };
    }
    return {
        status: 'resolved',
        heightM: h,
        datum: 'ellipsoidal-wgs84',
        source: hasRealPick ? 'photoreal-tile-clamp' : 'tileset-bounding-sphere',
    };
}

/** What the globe placement must DO with a (possibly unresolved) ground anchor. */
export type GroundAnchorAction =
    /** The datum is known — seat the building at `anchor.heightM` and SHOW it. */
    | 'seat-and-reveal'
    /** The datum is NOT known yet — keep the building HIDDEN (never buried at 0) and retry. */
    | 'hold-hidden-retry'
    /** The retry budget is spent and the datum is still unknown — reveal at the last-known
     *  base but LOG LOUDLY: the placement is not trustworthy. Never silent. */
    | 'reveal-unknown-datum-warn';

/**
 * §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — the terminal policy for an unresolved
 * ground datum. THE INVARIANT: a building is NEVER anchored at a fabricated 0 while the
 * photoreal tiles are the visible ground. It is either seated on a measured ground, held
 * hidden while the tiles stream, or (budget exhausted) revealed with an explicit,
 * user-visible warning that the ground could not be measured.
 */
export function decideGroundAnchorAction(
    anchor: GlobeGroundAnchor,
    retriesLeft: number,
): GroundAnchorAction {
    if (anchor.status === 'resolved') return 'seat-and-reveal';
    return retriesLeft > 0 ? 'hold-hidden-retry' : 'reveal-unknown-datum-warn';
}

/** A geographic point in the ONE frame that matters: WGS-84 degrees. */
export interface LatLon {
    readonly lat: number;
    readonly lon: number;
}

/**
 * §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259, defect ii) — the horizontal separation in
 * METRES between two candidate site origins (local-equirectangular about `a`; exact to
 * millimetres at parcel/neighbourhood scale, which is the only scale this is used at).
 *
 * Used to INSTRUMENT the georeference: PRYZM resolves the site origin from two independent
 * authorities (the LTP-ENU frame the geometry is baked in vs the geocoded address). When
 * they diverge, anything anchored/framed off the address lands `originSeparationMeters`
 * away from the building. Returns NaN for a non-finite input (never throws).
 */
export function originSeparationMeters(a: LatLon | null, b: LatLon | null): number {
    if (!a || !b) return Number.NaN;
    if (
        !Number.isFinite(a.lat) || !Number.isFinite(a.lon) ||
        !Number.isFinite(b.lat) || !Number.isFinite(b.lon)
    ) {
        return Number.NaN;
    }
    const DEG2RAD = Math.PI / 180;
    const R = 6371000;
    const cosLat = Math.cos(a.lat * DEG2RAD);
    const east = (b.lon - a.lon) * DEG2RAD * R * cosLat;
    const north = (b.lat - a.lat) * DEG2RAD * R;
    return Math.hypot(east, north);
}

/** The origin authorities in play at the moment a building is anchored on the globe. */
export interface GeorefOriginEvidence {
    /** The LTP-ENU origin — the frame the boundary + walls' scene-XZ are BAKED in. */
    readonly ltpOrigin: LatLon | null;
    /** The geocoded address on the C19 SiteModel (NOT necessarily the geometry frame). */
    readonly storeLocation: LatLon | null;
    /** The origin the placement actually used. */
    readonly anchorOrigin: LatLon;
}

/**
 * §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259, defect ii) — TRUE when the two origin
 * authorities disagree by more than `toleranceM` (default 1 m). A true result means the
 * building and anything framed/anchored off the address are in DIFFERENT places — the
 * horizontal defect. Pure; safe on partial evidence (unknown → false, nothing to compare).
 */
export function georefOriginsDiverge(ev: GeorefOriginEvidence, toleranceM = 1): boolean {
    const sep = originSeparationMeters(ev.ltpOrigin, ev.storeLocation);
    return Number.isFinite(sep) && sep > toleranceM;
}
