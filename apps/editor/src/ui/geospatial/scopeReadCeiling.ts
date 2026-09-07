// §SITE-SCOPE D2 — WHERE COMPLETENESS ACTUALLY ENDS *AT THIS SITE* (lane SCOPE-CUT-2, 2026-09-07).
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
    CTX_BUILDINGS_MAX_TILES_PER_FETCH,
    CTX_SCOPE_MIN_RADIUS_M,
    CTX_SCOPE_MAX_RADIUS_M,
    CTX_SCOPE_READ_COMPLETE_CEILING_M,
} from './contextExtentBudget';
import { contextFetchBbox } from './contextBuildings';
import { tileCountCovering } from './contextTiles';

/** The zoom the buildings + canopy bake carries its full footprint set at. Below it the bake's
 *  `--drop-densest-as-needed` has DELETED features from dense cores rather than coarsening them. */
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

/** z16 tiles the buildings/canopy fetch bbox needs for a circumscribing radius of `radiusM` here. */
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
    capTiles: number = CTX_BUILDINGS_MAX_TILES_PER_FETCH,
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
                `${capTiles}-tile cap. The read is below z${SCOPE_READ_FULL_ZOOM} at every scope, so the bake has ` +
                'already dropped footprints from dense cores. The mark is NOT a completeness promise here.',
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
                `${roof} m needs ${tiles} tiles of ${capTiles} at ${lat.toFixed(4)}°. No completeness ceiling bites.`,
        };
    }

    // Bisect for the largest radius still inside the cap. Integer metres — finer than the slider.
    let lo = floor, hi = roof;
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (tilesForRadius(lat, lon, mid) <= capTiles) lo = mid;
        else hi = mid;
    }
    const tiles = tilesForRadius(lat, lon, lo);
    const tighter = lo < CTX_SCOPE_READ_COMPLETE_CEILING_M;
    return {
        radiusM: lo,
        tilesAtCeiling: tiles,
        capTiles,
        tighterThanReference: tighter,
        neverCompleteHere: false,
        line:
            `[scope-read-ceiling] complete to ${lo} m at ${lat.toFixed(4)}° (${tiles} z${SCOPE_READ_FULL_ZOOM} tiles of ` +
            `${capTiles}); past it the read steps to a coarser zoom and the bake has already deleted footprints ` +
            `from dense cores.` +
            (tighter
                ? ` ⚠ TIGHTER than the ${CTX_SCOPE_READ_COMPLETE_CEILING_M} m mid-latitude reference by ` +
                  `${CTX_SCOPE_READ_COMPLETE_CEILING_M - lo} m — the 1/cos φ longitude widening costs ` +
                  `${(1 / Math.cos((lat * Math.PI) / 180)).toFixed(2)}× the tiles here.`
                : ''),
    };
}
