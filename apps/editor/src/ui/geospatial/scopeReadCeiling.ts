// §SITE-SCOPE D2 — WHERE COMPLETENESS ACTUALLY ENDS *AT THIS SITE* (lane SCOPE-CUT-2, 2026-09-07).
//
// ⭐⭐ RE-AIMED 2026-09-07 (lane SCOPE-FILL, L-13098) — SAME BISECTION, DIFFERENT SUBJECT, AND THE
// CHANGE OF SUBJECT IS THE WHOLE FINDING. Everything below was written about the BUILDINGS read.
// Measured against the shipped tiles, the buildings read loses nothing at a coarser zoom (Barcelona
// 953 footprints at z15 vs 953 across its four z16 children; area to 0.02 %; identical down to
// z13). The layer that DOES lose is `trees` — a measured 60 % per zoom step, from tippecanoe's
// DEFAULT `--drop-rate 2.5`, not from `--drop-densest-as-needed`. So this module now bisects for
// the POINT budget (`CTX_SCOPE_READ_MAX_TILES_POINTS`), and its answer CLAMPS the tree read and the
// tree ring rather than merely warning about them: a zoom step thins the canopy in the WHOLE box,
// including at the founder's own site, so it must never be taken. Buildings, roads, rail, water and
// parks are free to fill the slab to its rim at whatever zoom their extent lands on.
//
// ⚠ THE LATITUDE ARGUMENT BELOW IS UNCHANGED AND STILL THE REASON THIS FILE EXISTS. Only the cap
// and the consequence moved.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// THE DEFECT THIS EXISTS FOR, FOUND BY RE-RUNNING THE ARITHMETIC RATHER THAN READING THE TABLE
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// `CTX_SCOPE_READ_COMPLETE_CEILING_M` is ONE NUMBER — 1 781 m — and the slider's "complete" mark and
// its caption were both driven by it directly. That number was measured on Barcelona, Madrid,
// Córdoba and Lisbon, where the default scope's fetch bbox needs 81 / 81 / 64 / 81 tiles at zoom 16
// against a 112-tile cap. It is TRUE there.
//
// ⛔ IT IS FALSE IN THE NORTH, AND FALSE IN THE OPTIMISTIC DIRECTION. Re-measured with this repo's
// own `farFetchHalfDeg` → `contextFetchBbox` → `tileCountCovering`, the SAME 1 781 m scope needs
// **169 tiles at Oslo (59.91° N) and 225 at Reykjavík (64.15° N)** — both already over the cap, so
// `zoomForExtent` has ALREADY stepped those reads to z15 at the DEFAULT scope, before the user
// touches the slider. The slider nonetheless said *"Complete at this scope"*.
//
// WHY LATITUDE DOES THIS, AND WHY IT IS NOT A ROUNDING ERROR. Two multiplications stack:
//   1. `contextBboxAround` widens the box in LONGITUDE by `1 / cos φ` so the metric extent stays
//      square — at Oslo that is ×2.01, at Reykjavík ×2.30.
//   2. A Web-Mercator tile spans a CONSTANT number of longitude degrees at a given zoom, so that
//      widening lands one-for-one on the x tile count, while the y count grows too because a
//      Mercator degree of latitude covers fewer metres as φ rises.
// The product is a ~2× tile count at Oslo and ~2.8× at Reykjavík for the identical scope in metres.
//
// ⭐ SO THE MARK IS COMPUTED PER SITE. A ceiling that over-claims is the §CONTEXT-DATA-HONESTY
// failure in its politest form: it does not lose data loudly, it tells the founder the data he is
// missing is present. The founder's own constraint on this feature — *"within the scope should be
// sound — really detailed and completed"* — is a statement ABOUT the mark, so the mark has to be
// true where he is standing, not where it was measured.
//
// ⚠ WHY A SEPARATE MODULE AND NOT A FUNCTION IN `contextExtentBudget.ts`. That file is imported BY
// `contextTiles.ts` and `contextBuildings.ts`; this computation needs `tileCountCovering` from the
// first and `contextFetchBbox` from the second. Putting it there would close a cycle, and a
// circular module graph in this codebase does not fail loudly — it yields `undefined` at module
// load and blanks the screen (memory `scc-no-barrel-access-at-module-load`). This module sits ABOVE
// all three and is imported only by `CesiumViewport` and its spec, so the graph stays a DAG.

import {
    farFetchHalfDeg,
    CTX_SCOPE_READ_MAX_TILES_POINTS,
    CTX_SCOPE_MIN_RADIUS_M,
    CTX_SCOPE_MAX_RADIUS_M,
    CTX_SCOPE_READ_COMPLETE_CEILING_M,
} from './contextExtentBudget';
import { contextFetchBbox } from './contextBuildings';
import { tileCountCovering } from './contextTiles';

/**
 * The zoom the bake carries its full POINT set at.
 *
 * ⛔ CORRECTED 2026-09-07 (lane SCOPE-FILL, L-13098) — THIS DOC LINE NAMED THE WRONG LAYERS AND THE
 * WRONG MECHANISM. It read: *"The zoom the buildings + canopy bake carries its full footprint set
 * at. Below it the bake's `--drop-densest-as-needed` has DELETED features from dense cores rather
 * than coarsening them."* Measured against the shipped archive, **buildings lose nothing** from z16
 * down to z13 (Barcelona 953 = 953 at z15/z16, area to 0.02 %; roads 1 253 vs 1 254), because
 * `--drop-densest-as-needed` fires only above tippecanoe's ~500 KB tile limit and the largest z15
 * buildings tile sampled is 13 % of it. **Point layers do lose**, by a measured constant 0.400 per
 * step at two cities and three zoom pairs — tippecanoe's DEFAULT `--drop-rate 2.5`, which is
 * unconditional and has nothing to do with density. So this ceiling is about `trees` (and
 * `furniture` / `canopy` when they are published — all three answer 404 at stamp L663a), and the
 * buildings are free to read as wide as the slider goes.
 */
export const SCOPE_READ_FULL_ZOOM = 16;

export interface ScopeReadCeiling {
    /** The largest circumscribing scope radius (m) whose fetch bbox still reads at z16 HERE. */
    readonly radiusM: number;
    /** z16 tiles the bbox needs at `radiusM` — the measurement, not the target. */
    readonly tilesAtCeiling: number;
    /** The per-read fan-out cap the ceiling was found against. */
    readonly capTiles: number;
    /**
     * TRUE when this site's ceiling is TIGHTER than the mid-latitude reference constant, i.e. the
     * flat `CTX_SCOPE_READ_COMPLETE_CEILING_M` would have over-claimed here. The high-latitude case.
     */
    readonly tighterThanReference: boolean;
    /**
     * ⛔ TRUE when even the slider's MINIMUM scope is already over the cap at this latitude — the
     * read is below z16 no matter what the user does. Not reachable in any test city (Reykjavík at
     * the 150 m floor needs 4 tiles), but it is a real state at extreme latitude and it is REPORTED
     * rather than clamped away: `radiusM` then carries the minimum, and this flag says the mark is
     * not a promise. Never silently return the floor as if it were complete.
     */
    readonly neverCompleteHere: boolean;
    /** One console sentence, with both numbers. */
    readonly line: string;
}

/**
 * ⭐ §SCOPE-FILL (L-13098) — THE MID-LATITUDE REFERENCE SITE, and it is a SITE now, not a metre
 * figure. `tighterThanReference` used to compare against `CTX_SCOPE_READ_COMPLETE_CEILING_M`
 * (1 781 m), which was only ever the ceiling THE BUILDINGS CAP yields at a southern European
 * latitude. The moment this module started bisecting for a different budget, that comparison
 * stopped meaning anything: at the 576-tile point budget every one of the six reference cities
 * clears 1 781 m, so the flag would read `false` at Reykjavík — which is the OPPOSITE of the fact
 * it exists to carry.
 *
 * Comparing to the SAME BUDGET'S ceiling at a fixed reference latitude is cap-independent by
 * construction, so the flag keeps its meaning — *"would a flat southern number have over-claimed
 * here?"* — whatever budget the caller passes. Barcelona, because it is the site every measurement
 * in this subsystem was originally taken at.
 */
const REFERENCE_LAT = 41.3874;
const REFERENCE_LON = 2.1686;

/** z16 tiles the fetch bbox needs for a circumscribing radius of `radiusM` here. */
function tilesForRadius(lat: number, lon: number, radiusM: number): number {
    const halfDeg = farFetchHalfDeg({ shape: 'circle', radiusM });
    const bbox = contextFetchBbox(lat, lon, halfDeg);
    return tileCountCovering(bbox as [number, number, number, number], SCOPE_READ_FULL_ZOOM);
}

/**
 * The largest scope radius at which this site's context read is still COMPLETE — measured, at this
 * latitude, against the real fetch bbox. PURE (no I/O: it is arithmetic over the tile grid).
 *
 * ⚠ THE SEARCH IS A BISECTION AND THAT IS SAFE ONLY BECAUSE THE COUNT IS MONOTONE IN THE RADIUS.
 * `farFetchHalfDeg` is non-decreasing in the radius, `contextFetchBbox` grows the box monotonically
 * with the half-extent, and `tileCountCovering` is non-decreasing in the box — so there is exactly
 * one crossing and bisection cannot land on a false one. Stated because a bisection over a
 * non-monotone predicate is a silent wrong answer, not a crash.
 *
 * A non-finite origin returns the mid-latitude reference constant with `tighterThanReference` false
 * — an admission that the site is unknown, never a claim that it is Barcelona.
 */
export function scopeReadCompleteCeilingM(
    lat: number,
    lon: number,
    capTiles: number = CTX_SCOPE_READ_MAX_TILES_POINTS,
): ScopeReadCeiling {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return {
            radiusM: CTX_SCOPE_READ_COMPLETE_CEILING_M,
            tilesAtCeiling: -1,
            capTiles,
            tighterThanReference: false,
            neverCompleteHere: false,
            line:
                `[scope-read-ceiling] NOT MEASURED: no site origin (lat=${String(lat)} lon=${String(lon)}) — ` +
                `falling back to the mid-latitude reference ${CTX_SCOPE_READ_COMPLETE_CEILING_M} m. ` +
                'That is an admission, not a measurement: at high latitude the true ceiling is tighter.',
        };
    }

    const floor = CTX_SCOPE_MIN_RADIUS_M;
    const roof = CTX_SCOPE_MAX_RADIUS_M;

    const atFloor = tilesForRadius(lat, lon, floor);
    if (atFloor > capTiles) {
        return {
            radiusM: floor,
            tilesAtCeiling: atFloor,
            capTiles,
            tighterThanReference: true,
            neverCompleteHere: true,
            line:
                `[scope-read-ceiling] ⛔ NEVER COMPLETE HERE: even the smallest scope the slider offers ` +
                `(${floor} m) needs ${atFloor} z${SCOPE_READ_FULL_ZOOM} tiles at ${lat.toFixed(4)}°, over the ` +
                `${capTiles}-tile cap. The POINT read (trees) is below z${SCOPE_READ_FULL_ZOOM} at every scope, and ` +
                'tippecanoe\'s default --drop-rate 2.5 removes ~60% of the points per step. Buildings and linework ' +
                'are unaffected (measured z16→z13). The mark is NOT a canopy-completeness promise here.',
        };
    }
    if (tilesForRadius(lat, lon, roof) <= capTiles) {
        const tiles = tilesForRadius(lat, lon, roof);
        return {
            radiusM: roof,
            tilesAtCeiling: tiles,
            capTiles,
            tighterThanReference: false,
            neverCompleteHere: false,
            line:
                `[scope-read-ceiling] the WHOLE slider range reads at z${SCOPE_READ_FULL_ZOOM} here: ` +
                `${roof} m needs ${tiles} tiles of ${capTiles} at ${lat.toFixed(4)}°. The canopy is complete to the ` +
                'slab rim at every scope, and no completeness ceiling bites.',
        };
    }

    const lo = bisectCeiling(lat, lon, capTiles);
    const tiles = tilesForRadius(lat, lon, lo);
    // §SCOPE-FILL — the SAME budget at the reference latitude. See `REFERENCE_LAT`.
    const tighter = lo < bisectCeiling(REFERENCE_LAT, REFERENCE_LON, capTiles);
    return {
        radiusM: lo,
        tilesAtCeiling: tiles,
        capTiles,
        tighterThanReference: tighter,
        neverCompleteHere: false,
        line:
            `[scope-read-ceiling] canopy complete to ${lo} m at ${lat.toFixed(4)}° (${tiles} z${SCOPE_READ_FULL_ZOOM} ` +
            `tiles of ${capTiles}); past it the POINT read would step a zoom and tippecanoe's default --drop-rate 2.5 ` +
            `would remove ~60% of the trees IN THE WHOLE BOX, including next to the site — so the tree read and the ` +
            `tree ring are CLAMPED here instead (§SCOPE-FILL). Buildings, roads, rail, water and parks keep filling ` +
            `to the slab rim: their feature set is zoom-invariant z16→z13 (measured).` +
            (tighter
                ? ` ⚠ TIGHTER than the ${bisectCeiling(REFERENCE_LAT, REFERENCE_LON, capTiles)} m this same ` +
                  `${capTiles}-tile budget reaches at the ${REFERENCE_LAT}° reference, by ` +
                  `${bisectCeiling(REFERENCE_LAT, REFERENCE_LON, capTiles) - lo} m — the 1/cos φ longitude ` +
                  `widening costs ${(1 / Math.cos((lat * Math.PI) / 180)).toFixed(2)}× the tiles here.`
                : ''),
    };
}

/**
 * The largest integer radius in [min, max] whose fetch bbox fits `capTiles` at z16, HERE.
 *
 * ⚠ THE SEARCH IS A BISECTION AND THAT IS SAFE ONLY BECAUSE THE COUNT IS MONOTONE IN THE RADIUS.
 * `farFetchHalfDeg` is non-decreasing in the radius, `contextFetchBbox` grows the box monotonically
 * with the half-extent, and `tileCountCovering` is non-decreasing in the box — so there is exactly
 * one crossing and bisection cannot land on a false one. Stated because a bisection over a
 * non-monotone predicate is a silent wrong answer, not a crash.
 *
 * The caller has already handled the two saturated cases (over the cap at the floor, under it at
 * the roof), so this is only ever asked about an interval that really does contain the crossing.
 */
function bisectCeiling(lat: number, lon: number, capTiles: number): number {
    let lo = CTX_SCOPE_MIN_RADIUS_M;
    let hi = CTX_SCOPE_MAX_RADIUS_M;
    if (tilesForRadius(lat, lon, lo) > capTiles) return lo;
    if (tilesForRadius(lat, lon, hi) <= capTiles) return hi;
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (tilesForRadius(lat, lon, mid) <= capTiles) lo = mid;
        else hi = mid;
    }
    return lo;
}
