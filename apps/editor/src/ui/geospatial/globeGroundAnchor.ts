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
 * §GLOBE-ELLIPSOID-PICK-IS-NOT-GROUND (L-477) — how close to the WGS-84 ellipsoid a height
 * pick may land before we refuse to believe it came off the photoreal tile MESH.
 *
 * THE DEFECT THIS EXISTS FOR: `clampToHeightMostDetailed` is documented to clamp onto the
 * nearest PRIMITIVE surface, but where the photoreal tiles have not STREAMED yet at that
 * LOD there is no primitive to hit, and the ray continues onto the rendered globe — whose
 * surface, on this keyless build, IS the ellipsoid. The API reports that as an ordinary
 * successful pick. So the failure does not present as "no height"; it presents as `h ≈ 0`,
 * `status=resolved`, `source=photoreal-tile-clamp` — a confident, well-formed, WRONG datum.
 * Measured live in Barcelona: base **-0.54 m ELLIPSOIDAL, resolved=y**, where the true tile
 * surface is ≈ **+50 m** (geoid separation ≈ 49 m). The building was drawn ~50 m under the
 * city. Same failure-reported-as-success shape as L-467/L-469/L-476, in a different layer.
 *
 * WHY ±2 m IS SAFE WITHOUT A GEOID MODEL. We deliberately do NOT ship an EGM96 grid to
 * decide this: a half-right geoid table would be a new source of confident wrong answers,
 * which is the very failure mode being closed. We rely instead on a property that needs no
 * model — over essentially all inhabited land the ellipsoidal height of the ground is the
 * geoid separation (tens of metres, either sign) PLUS local terrain, so a genuine tile-mesh
 * pick landing within 2 m of the ellipsoid is vanishingly unlikely, while an ellipsoid hit
 * lands there by construction.
 *
 * AND THE FAILURE IS A REFUSAL, WHICH IS WHY THE ASYMMETRY IS ACCEPTABLE. A false REJECT
 * yields `unresolved` → the building is held hidden and the clamp retries as tiles stream
 * (`decideGroundAnchorAction`), and if the budget runs out it is revealed with a LOUD
 * warning. A false ACCEPT silently buries the building. Refusing to place is cheap;
 * placing wrongly is not.
 *
 * ⚠ NOT A TERRAIN PROVIDER. ADR-0268 §156: the photoreal tile mesh IS the ground. Attaching
 * a terrain provider to "fix" this would double-count elevation. This rejects a bad pick; it
 * does not introduce a second elevation source.
 */
export const ELLIPSOID_PICK_EPSILON_M = 2;

/**
 * §GLOBE-ELLIPSOID-PICK-IS-NOT-GROUND (L-477) — the CORROBORATION ESCAPE.
 *
 * Some ground genuinely does sit near the ellipsoid (where the geoid separation is small and
 * the terrain is low). Blanket-rejecting near-zero picks would refuse to place a building
 * there forever. So the rejection is skipped when we hold INDEPENDENT evidence that the
 * ground really is near zero: the tileset's own root bounding-sphere ground — a real, if
 * coarse, measurement of the actual tile data rather than a model or a guess.
 *
 * This can only ever LOOSEN the rule toward the truth, and only on evidence.
 */
function sphereGroundConfirmsNearEllipsoid(sphereGroundHeightM: number | null): boolean {
    return (
        sphereGroundHeightM !== null &&
        Number.isFinite(sphereGroundHeightM) &&
        Math.abs(sphereGroundHeightM) <= SPHERE_GROUND_NEAR_ELLIPSOID_M
    );
}

/** §GLOBE-ELLIPSOID-PICK-IS-NOT-GROUND (L-477) — how near zero the tileset's own coarse
 *  sphere ground must be to corroborate that near-zero picks are real ground. Wider than
 *  `ELLIPSOID_PICK_EPSILON_M` because the sphere estimate is coarse by nature. */
export const SPHERE_GROUND_NEAR_ELLIPSOID_M = 10;

/** §GLOBE-LONE-OUTLIER-CANNOT-SET-THE-DATUM (L-479) — the low quantile used INSTEAD of the raw
 *  minimum once there are enough samples. 0.1 keeps the "lowest open street cell" behaviour the
 *  min was chosen for, while denying any single fall-through pick a veto over the datum. */
export const GROUND_LOW_QUANTILE = 0.1;

/** §GLOBE-LONE-OUTLIER-CANNOT-SET-THE-DATUM (L-479) — below this many credible picks there is no
 *  distribution worth reasoning about, so the exact previous `min` behaviour is preserved. The
 *  live sampler produces ~48 (two 16-point compass rings + pushed-out vertices), so the robust
 *  path is the normal one and this is the degenerate-input guard. */
export const OUTLIER_ROBUST_MIN_SAMPLES = 12;

/** §GLOBE-SLOPE-SEAT (L-12919) — a low-end span (median − low quantile) at or below this is a
 *  PLATEAU: the picks are ground with roofs above, and the low quantile IS the ground. Above it
 *  the picks are either a slope or a roof-heavy ring, and the gap test below decides which. 6 m
 *  is two storeys: a real street plateau with roofs in the ring never spreads its low half that
 *  far, while a 74 m Sète hillside does at once. */
export const SLOPE_RAMP_MIN_SPAN_M = 6;

/** §GLOBE-SLOPE-SEAT (L-12919) — the largest step between two CONSECUTIVE sorted picks in the
 *  low half above which the distribution is BIMODAL (ground cluster, then roofs): a roof is a
 *  jump of a storey or more, a hillside is a ramp of ~1 m per pick over a 64-pick ring. */
export const ROOF_GAP_M = 4;

export interface TileGroundPickClass {
    /** `few` = under the robust threshold (min rule) · `plateau` = flat ground, low quantile ·
     *  `roof-gap` = roofs in the ring, low quantile · `slope` = continuous ramp, MEDIAN. */
    readonly arm: 'few' | 'plateau' | 'roof-gap' | 'slope';
    readonly lowM: number | null;
    readonly medianM: number | null;
    /** median − low quantile, metres. */
    readonly spanM: number;
    /** largest consecutive step between the low quantile and the median, metres. */
    readonly maxGapM: number;
}

/**
 * §GLOBE-SLOPE-SEAT (L-12919, founder 2026-09-05 at Sète, 43.3994 3.6851) — classify the sorted
 * credible picks so the reduction can tell a HILLSIDE from a FLAT CITY WITH ROOFS. THE EVIDENCE:
 * 64 street-ring picks spanning 132 → 206 m (p25 161.7 · median 177.5 · p75 187.0) and the seat
 * resolved to 154.84 m — the 10th percentile, i.e. the downhill street corner — so the overlay,
 * the void cap and the building all sat ~20 m UNDER the visible tiles on the uphill half of the
 * plot. The low-quantile rule exists for flat cities where the ring's high picks are neighbours'
 * ROOFS (§GLOBE-GROUND-STREET-RING): there the low half of the distribution is a tight plateau
 * and the picks above it jump by a storey. On a hillside the picks form a continuous RAMP with no
 * such jump, and the ground under the parcel centre is the MEDIAN of the ring around it, not its
 * lowest corner. Pure; the caller logs the arm beside the spread.
 */
export function classifyTileGroundPicks(sortedCredible: readonly number[]): TileGroundPickClass {
    const n = sortedCredible.length;
    if (n < OUTLIER_ROBUST_MIN_SAMPLES) {
        return { arm: 'few', lowM: n > 0 ? sortedCredible[0]! : null, medianM: null, spanM: 0, maxGapM: 0 };
    }
    const lowIdx = Math.min(Math.floor(GROUND_LOW_QUANTILE * n), n - 1);
    const midIdx = Math.min(Math.floor(0.5 * n), n - 1);
    const lowM = sortedCredible[lowIdx]!;
    const medianM = sortedCredible[midIdx]!;
    const spanM = medianM - lowM;
    let maxGapM = 0;
    for (let i = lowIdx + 1; i <= midIdx; i++) {
        const gap = sortedCredible[i]! - sortedCredible[i - 1]!;
        if (gap > maxGapM) maxGapM = gap;
    }
    if (spanM <= SLOPE_RAMP_MIN_SPAN_M) return { arm: 'plateau', lowM, medianM, spanM, maxGapM };
    if (maxGapM > ROOF_GAP_M) return { arm: 'roof-gap', lowM, medianM, spanM, maxGapM };
    return { arm: 'slope', lowM, medianM, spanM, maxGapM };
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
    opts: { readonly rejectEllipsoidPicks?: boolean } = {},
): number | null {
    // §GLOBE-ELLIPSOID-PICK-IS-NOT-GROUND (L-477) — see `ELLIPSOID_PICK_EPSILON_M`. When the
    // photoreal tiles are the visible ground, a pick that lands within a couple of metres of
    // the ellipsoid did not hit the tile mesh; it fell THROUGH un-streamed tiles onto the
    // globe. Discarding it is essential BEFORE the min: this reduction takes the MINIMUM over
    // the footprint + street ring, so ONE ellipsoid hit does not merely dilute the answer, it
    // WINS outright and drags the whole building underground — which is precisely how the
    // founder's Barcelona base resolved to -0.54 m while the true tile surface is ~+50 m.
    const rejectNearZero =
        opts.rejectEllipsoidPicks === true && !sphereGroundConfirmsNearEllipsoid(sphereGroundHeightM);

    const credible: number[] = [];
    for (const h of sampledHeights) {
        if (typeof h === 'number' && Number.isFinite(h)) {
            if (rejectNearZero && Math.abs(h) <= ELLIPSOID_PICK_EPSILON_M) continue;
            credible.push(h);
        }
    }

    // §GLOBE-LONE-OUTLIER-CANNOT-SET-THE-DATUM (L-479) — THE GROUND IS A LOW PLATEAU, NOT THE
    // SINGLE LOWEST SAMPLE.
    //
    // THE EVIDENCE, two runs over the SAME parcel at the SAME anchor minutes apart:
    //     picks=48 → 50.87 m  (correct: Barcelona tile surface, geoid ≈ +49 m + terrain)
    //     picks=49 → 11.38 m  (buried ~40 m)
    // ONE additional pick, ~39 m below the rest, moved the whole building underground. A raw
    // `min` gives every single sample a veto over the datum, so one ray through a hole (the
    // §PLOT-CLEAR-PHOTOREAL void, an un-streamed tile, a genuine gap in the mesh) decides it.
    //
    // WHY NOT JUST KEEP THE MIN: the min is here for a real reason (§GLOBE-GROUND-STREET-RING)
    // — it stops the model perching on a podium or a neighbour's roof, and a fixed absolute cap
    // was already tried and wrongly buried Paris's genuinely elevated ~80 m ground. So we keep
    // "take the LOW end", but take a robust low END rather than the extreme: the 10th percentile
    // once there are enough samples to have one. With ~48 street-ring picks that still lands in
    // the open-street cells the min was chosen to find, while a lone fall-through can no longer
    // outvote them. Below the sample threshold there is no distribution to reason about, so we
    // fall back to the exact previous behaviour and change nothing.
    if (credible.length === 0) {
        // fall through to the sphere-ground fallback below
    } else if (credible.length < OUTLIER_ROBUST_MIN_SAMPLES) {
        return Math.min(...credible) - seatEpsilonM;
    } else {
        const sorted = [...credible].sort((a, b) => a - b);
        // §GLOBE-SLOPE-SEAT (L-12919, Sète 2026-09-05) — the low quantile is the DOWNHILL CORNER on a
        // hillside, not the ground under the parcel. See `classifyTileGroundPicks`.
        const cls = classifyTileGroundPicks(sorted);
        if (cls.arm === 'slope' && cls.medianM !== null) return cls.medianM - seatEpsilonM;
        const idx = Math.floor(GROUND_LOW_QUANTILE * sorted.length);
        return sorted[Math.min(idx, sorted.length - 1)] - seatEpsilonM;
    }
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
    // §GLOBE-ELLIPSOID-PICK-IS-NOT-GROUND (L-477) — we are past `photorealTilesActive`, so the
    // tile mesh IS the visible ground and a near-ellipsoid pick is a fall-through onto the
    // globe, not a measurement. Reject those picks. If that leaves nothing, the answer is
    // UNRESOLVED — the SAME state as "tiles have not streamed yet", which is exactly what it
    // is — and `decideGroundAnchorAction` holds the building hidden and retries.
    const rejectEllipsoidPicks = true;
    const credible = rejectEllipsoidPicks && !sphereGroundConfirmsNearEllipsoid(input.tilesetSphereGroundHeightM)
        ? input.tileSampleHeights.filter(
            (h) => typeof h === 'number' && Number.isFinite(h) && Math.abs(h) > ELLIPSOID_PICK_EPSILON_M,
        )
        : input.tileSampleHeights;
    // `hasRealPick` must reflect the picks we actually BELIEVE, so a run whose only picks were
    // ellipsoid hits is not mislabelled `photoreal-tile-clamp` in the evidence log.
    const hasRealPick = credible.some(
        (h) => typeof h === 'number' && Number.isFinite(h),
    );
    const h = reduceTileGroundHeight(
        input.tileSampleHeights,
        input.tilesetSphereGroundHeightM,
        input.seatEpsilonM ?? 0,
        { rejectEllipsoidPicks },
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

// ─────────────────────────────────────────────────────────────────────────────────────
// §SITEFRAME-GROUND (C12 §9 — SiteFrame ground authority, DRAFT) — the PURE core of the
// per-point ground sampler (T0). The Cesium wrapper (`CesiumViewport.sampleGround`) reads the
// attached baked terrain via `globe.getHeight`; these are the deterministic, Cesium-free
// decisions it is built on, so the fallback rule + the footprint seat point are unit-testable
// WITHOUT a live viewer — the same precedent as the L-259 anchor decisions above.
// ─────────────────────────────────────────────────────────────────────────────────────

/**
 * §SITEFRAME-GROUND (T0) — the per-point fallback rule. `sampled` is the raw ground height off
 * the attached terrain (`globe.getHeight`, which is `undefined`/`NaN` where the tile has not yet
 * tessellated); `centroidBaseM` is the resolved centroid base to fall back to. A FINITE sample
 * wins (the point sits on its OWN relief); anything else falls back to the centroid — NEVER a
 * stray 0 (the L-259 rule applied per-point). When no terrain is attached the centroid base is
 * itself the honest flat-0, so the fallback stays correct. Deterministic; no Cesium/DOM.
 */
/**
 * §GLOBE-HEIGHT-READABLE (L-13078) — the widest |height| that can be an EARTH SURFACE ELEVATION.
 *
 * Challenger Deep is −10 935 m and Everest +8 849 m; the geoid separation adds at most ±107 m. So
 * ±20 000 m is roughly twice the deepest real reading in either direction — deliberately generous,
 * because this predicate must never reject a measurement, only an artefact.
 */
export const GLOBE_SURFACE_HEIGHT_BAND_M = 20_000;

/**
 * §GLOBE-HEIGHT-READABLE (L-13078, founder Barcelona 2026-09-07) — is a `globe.getHeight` reading
 * an ELEVATION at all?
 *
 * ⭐ THE DEFECT THIS EXISTS FOR, AND IT IS WORSE THAN AN `undefined`. The founder's console printed
 * `centroidTerrainSurface=-6328484.2m` and, in the same line, a
 * `§COARSE-VS-DETAILED … mean|Δ|=6328546.71m`. That is not terrain error. `Globe.prototype.getHeight`
 * (Cesium 1.143 `Cesium.js:218354`) builds its pick ray with the origin placed ON THE Z AXIS
 * (`getSurfaceNormalIntersectionWithZAxis`, :218399) and returns
 * `cartesianToCartographic(intersection).height` (:218429). When the only tile with a rendered mesh
 * is a coarse/degenerate root, the pick can return the ray ORIGIN, and the "height" that comes back
 * is then a pure function of LATITUDE: −6 328 484.24 m at lat 41.38250, against Barcelona's own
 * open coordinate 41.38258. It is reproducible arithmetic, not a measurement.
 *
 * ⛔ AND EVERY `Number.isFinite` GUARD IN THIS REPO PASSES IT. Cesium does not return `undefined`
 * here — it returns a finite, plausibly-typed, physically impossible number. Only a VALUE-DOMAIN
 * check can reject it, which is what this is. Subtract it from a real detailed height and you get
 * ~an Earth radius of "terrain error"; compare a real base against it and `base − surf > 0` is
 * unconditionally true, which is how a `0 BELOW terrain ✓` can be printed by the SAME artefact that
 * printed the 6 328 km alarm. A probe that cannot fail is not evidence.
 *
 * Pure; no Cesium, no DOM. `undefined` / `null` / `NaN` are unreadable too — the honest answer for
 * all of them is the same: this is not a measurement, do not treat it as one.
 */
export function isReadableGlobeSurfaceHeight(h: number | null | undefined): h is number {
    return typeof h === 'number' && Number.isFinite(h) && Math.abs(h) <= GLOBE_SURFACE_HEIGHT_BAND_M;
}

export function resolveGroundSample(sampled: number | null | undefined, centroidBaseM: number): number {
    // §GLOBE-HEIGHT-READABLE (L-13078) — ⚠ THIS USED TO READ `Number.isFinite(sampled)`, and that is
    // the guard the −6 328 484 m artefact walks straight through. The rule the doc comment above
    // states — "a FINITE sample wins … anything else falls back to the centroid — NEVER a stray 0"
    // — was written against `undefined`, the failure mode Cesium had when it was written. The
    // Earth-radius ray-origin reading is the same class of non-measurement and gets the same answer:
    // fall back to the centroid base. Nothing else changes; every in-band reading still wins, which
    // `GlobeGroundAnchor.test.ts` §SITEFRAME-GROUND already pins.
    return isReadableGlobeSurfaceHeight(sampled) ? sampled : centroidBaseM;
}

// ─────────────────────────────────────────────────────────────────────────────────────
// §TERRAIN-BASE-PROVENANCE (L-584 honesty half, C12 §1.4 / §7.2) — the BAKED-TERRAIN
// path's equivalent of the L-259 globe anchor above.
//
// THE DEFECT. `CesiumViewport.clampTerrainThenReplace` samples ONE point (the parcel
// centroid) off the attached baked quantized-mesh terrain, and on ANY failure — the
// promise rejecting, or a NaN/undefined height coming back — it assigned
// `sampledHeight = 0` and seated the whole massing there. Three separate states
// therefore collapsed onto the SAME VALUE:
//
//     (a) "no elevation provider is attached, so the ellipsoid IS the ground"  → 0
//     (b) "terrain is attached and really did measure 0 m here"                → 0
//     (c) "terrain is attached and the measurement FAILED"                     → 0
//
// (a) and (b) are true datum statements. (c) is a fabrication, and it is strictly
// worse than it looks: it also DISCARDS an already-measured base. On Burgos
// (ground ≈ 912 m) one transient sample rejection would have re-placed the building
// at 0 — 912 m underground — with nothing but a single `console.warn` that a benign
// earlier warning may already have latched away.
//
// C12 §1.4 / §1.6 already forbid exactly this ("a fabricated `0` … is forbidden";
// the datum is RESOLVED or UNRESOLVED, never silently coerced). The photoreal path
// obeys it via `resolveGlobeGroundAnchor`; the baked-terrain path did not. This
// reduction closes that asymmetry with the SAME vocabulary.
//
// SCOPE — deliberately narrow. This makes the failure DISTINGUISHABLE and RECORDED; it
// does NOT change the seating policy (no hold-hidden on this path) and it does NOT
// touch WHERE the sample is taken. The centroid-vs-façade half of L-584 is a separate,
// consciously deferred decision gated on terrain posting resolution
// (`packages/site-parcel-data/src/geometry/facadeRasantDatum.ts` — which ships a hard
// `terrain-posting-too-coarse` refusal precisely so it is not closed falsely).
// ─────────────────────────────────────────────────────────────────────────────────────

/** Where the baked-terrain clamp's `formaTerrainBaseHeight` actually came from. */
export type TerrainBaseSource =
    /** A real, finite `sampleTerrainMostDetailed` reading off the attached terrain. */
    | 'terrain-sample'
    /** No provider carries elevation data → the rendered globe surface IS the WGS-84
     *  ellipsoid, so 0 is the TRUE ground. A datum statement, not a fallback. */
    | 'ellipsoid-flat-ground'
    /** A sample was ATTEMPTED against real terrain and FAILED (rejected / NaN). The
     *  base is the last value we held — it is NOT a measurement of this site. */
    | 'unmeasured-fallback';

/** The baked-terrain clamp's resolved base, carrying its own provenance. */
export interface TerrainBaseResolution {
    readonly baseHeightM: number;
    readonly source: TerrainBaseSource;
    /** FALSE only for `unmeasured-fallback`. Callers must never present a false
     *  `measured` base as "seated on real ground" (§CONTEXT-DATA-HONESTY). */
    readonly measured: boolean;
}

export interface TerrainBaseInput {
    /** True when `terrainProviderHasElevationData(viewer.terrainProvider)` — i.e. a real
     *  `CesiumTerrainProvider` (with `availability`) is attached, not the default ellipsoid. */
    readonly hasElevationProvider: boolean;
    /** The height `sampleTerrainMostDetailed` returned, or null/undefined/NaN when it did not. */
    readonly sampledHeightM: number | null | undefined;
    /** True when the sample call itself REJECTED (threw), as opposed to resolving unusably. */
    readonly sampleFailed: boolean;
    /** The base currently held (`formaTerrainBaseHeight`). Retained on failure INSTEAD of
     *  fabricating 0 — a stale-but-measured base is closer to the truth than the ellipsoid,
     *  and it matches what `ensureGroundBaseForContext` already does on its own catch. */
    readonly lastKnownBaseM: number;
}

/**
 * §TERRAIN-BASE-PROVENANCE — reduce a baked-terrain sample attempt to a base height PLUS
 * the provenance of that height. Total, pure, never throws.
 *
 *   • no elevation provider     → 0, `ellipsoid-flat-ground`, measured (a true statement)
 *   • a finite sample           → that height, `terrain-sample`, measured
 *   • rejected / NaN / missing  → `lastKnownBaseM`, `unmeasured-fallback`, NOT measured
 *
 * Note the last case never invents 0: fabricating the ellipsoid over a previously measured
 * 912 m ground is the burial this exists to prevent.
 */
export function resolveTerrainClampBase(input: TerrainBaseInput): TerrainBaseResolution {
    if (!input.hasElevationProvider) {
        return { baseHeightM: 0, source: 'ellipsoid-flat-ground', measured: true };
    }
    const h = input.sampledHeightM;
    if (!input.sampleFailed && typeof h === 'number' && Number.isFinite(h)) {
        return { baseHeightM: h, source: 'terrain-sample', measured: true };
    }
    const last = Number.isFinite(input.lastKnownBaseM) ? input.lastKnownBaseM : 0;
    return { baseHeightM: last, source: 'unmeasured-fallback', measured: false };
}

/**
 * §SITEFRAME-GROUND (T1) — the [lon,lat] ring's vertex-mean centroid, the single point a
 * footprint is ground-sampled at. A footprint is small against the terrain LOD, so one seat for
 * the whole block is sound. Non-finite vertices are ignored; returns null when the ring has no
 * finite vertex. Pure. NOTE the GeoJSON order: each pair is [lon, lat] (longitude FIRST).
 */
export function ringCentroidLatLon(
    ring: ReadonlyArray<ReadonlyArray<number> | null | undefined>,
): LatLon | null {
    let sx = 0;
    let sy = 0;
    let n = 0;
    for (const p of ring) {
        const lon = p?.[0];
        const lat = p?.[1];
        if (typeof lon === 'number' && typeof lat === 'number' && Number.isFinite(lon) && Number.isFinite(lat)) {
            sx += lon;
            sy += lat;
            n++;
        }
    }
    return n > 0 ? { lat: sy / n, lon: sx / n } : null;
}
