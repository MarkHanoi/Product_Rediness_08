/**
 * CurvedWallOpeningBuilder — §FEAT-HOSTED-ON-CURVED-WALL
 *
 * Carves door/window openings out of a CURVED wall by decomposing the arc into
 * solid **bands**, exactly mirroring how the straight-wall path decomposes a
 * wall into box segments (piers · sills · headers) around its openings.
 *
 * ── Why bands and not a box subtraction ──────────────────────────────────────
 * A straight box subtracted through a curved wall has PARALLEL jambs. The wall
 * faces are concentric arcs, so the box over-cuts the face on one side into a
 * wedge and under-cuts the other; the deeper the wall or the tighter the radius,
 * the worse it gets. The physically correct cut through a curved wall has
 * **RADIAL jambs** — each jamb lies in the plane spanned by the local centreline
 * normal and the vertical, i.e. it is perpendicular to the wall face on BOTH
 * faces. That is precisely how a real opening is set out in a curved wall.
 *
 * A radial cut needs no boolean at all. The curved wall is already built as a
 * strip of per-station cross-sections; a radial cut is nothing more than
 * TERMINATING a strip at a station and starting the next one after the void.
 * So this builder:
 *
 *   1. resamples the arc's stations so that stations exist at EXACTLY the
 *      opening edges (arc lengths `offset` and `offset + width`), and
 *   2. emits one closed band solid per (arc-span × vertical-span) rectangle.
 *
 * Every band is produced by the SAME `buildCurvedLayerGeometry` that already
 * builds plain and layered curved walls, so bands are watertight by
 * construction (§FIX-CURVED-WALL-MITER-WATERTIGHT) and the plan poché section
 * closes for a curved wall with openings just as it does without them.
 *
 * ── One opening spanning many tessellation chords ────────────────────────────
 * The arc is tessellated into `curve.segments` chords, but an opening is NOT
 * hosted on a chord — it is hosted on the LOGICAL wall and expressed in arc
 * length (see WallArcParam). An opening 1.2 m wide on a wall tessellated at
 * 0.3 m per chord therefore spans four chords, and it produces exactly ONE void
 * because the void is the GAP between two bands, not a per-chord subtraction.
 * Capping an opening to a chord (the straight-wall over-run fix) would be flatly
 * wrong here and is never done: the only clamp applied is to the FULL arc length.
 *
 * Contract: C15 (hosted elements) as amended for curved hosts; Contract §03-1.2
 * (curved walls); §03-1.3 (layered walls).
 */

import type { Station } from './CurvedWallLayerBuilder';
import { ARC_EPSILON_M } from './WallArcParam';

// ─── Types ────────────────────────────────────────────────────────────────────

/** The opening fields this module consumes. Matches `Opening` structurally. */
export interface ArcOpeningInput {
    /** LEFT-EDGE arc length from `baseLine[0]`, metres (C15 §1 `offset`). */
    offset: number;
    /** Extent along the centreline arc, metres. */
    width: number;
    /** Vertical extent, metres. */
    height: number;
    /** Base of the opening above the wall base, metres. */
    sillHeight?: number;
}

/**
 * A solid band of the curved wall: the arc span `[s0, s1]` × the vertical span
 * `[yLo, yHi]` (both relative to the wall base). The union of all bands is the
 * wall minus its openings.
 */
export interface ArcBand {
    /** Start arc length, metres from `baseLine[0]`. */
    s0: number;
    /** End arc length, metres from `baseLine[0]`. */
    s1: number;
    /** Bottom of the band, metres above the wall base. */
    yLo: number;
    /** Top of the band, metres above the wall base. */
    yHi: number;
    /**
     * `pier`   — full-height masonry between openings (or before/after them);
     * `sill`   — the solid below an opening;
     * `header` — the solid above an opening cluster.
     */
    kind: 'pier' | 'sill' | 'header';
    /** true when this band touches `s = 0` and so carries the start miter cap. */
    atStart: boolean;
    /** true when this band touches `s = length` and so carries the end miter cap. */
    atEnd: boolean;
}

/** An overlapping run of openings, resolved as one arc span. */
interface ArcCluster {
    minLeft: number;
    maxRight: number;
    openings: ArcOpeningInput[];
}

/** Bands thinner than this along the arc or vertically are dropped as noise. */
const MIN_BAND_M = 0.005;

// ─── Band decomposition (pure — no THREE) ─────────────────────────────────────

/**
 * Group openings whose arc spans overlap into clusters, so a run of touching
 * openings shares one header. Same algorithm as `clusterOpenings` on the
 * straight path, restated here over arc length and without the `Opening` type
 * dependency so this stays a pure, testable function.
 */
export function clusterArcOpenings(openings: ReadonlyArray<ArcOpeningInput>): ArcCluster[] {
    const sorted = [...openings]
        .filter(o => Number.isFinite(o.offset) && Number.isFinite(o.width) && o.width > 0)
        .sort((a, b) => a.offset - b.offset);

    const clusters: ArcCluster[] = [];
    for (const op of sorted) {
        const left = op.offset;
        const right = op.offset + op.width;
        const last = clusters[clusters.length - 1];
        if (last && left < last.maxRight - ARC_EPSILON_M) {
            last.maxRight = Math.max(last.maxRight, right);
            last.openings.push(op);
        } else {
            clusters.push({ minLeft: left, maxRight: right, openings: [op] });
        }
    }
    return clusters;
}

/**
 * Decompose a curved wall of arc length `totalLength` and height `wallHeight`
 * into the bands that remain once `openings` are carved out.
 *
 * PURE and shape-agnostic: it knows only arc lengths and heights, never the
 * curve itself. That makes the carve LOGIC identical for straight and curved
 * hosts — only the geometry generator differs — and makes it directly testable.
 *
 * Vertical decomposition inside a cluster mirrors the straight path exactly:
 * openings are processed bottom-up, the solid below each opening becomes a
 * `sill` band, and the solid above the topmost opening becomes a `header` band
 * spanning the whole cluster.
 */
export function computeCurvedWallBands(
    openings: ReadonlyArray<ArcOpeningInput>,
    totalLength: number,
    wallHeight: number,
): ArcBand[] {
    const bands: ArcBand[] = [];
    if (!(totalLength > 0) || !(wallHeight > 0)) return bands;

    const push = (s0: number, s1: number, yLo: number, yHi: number, kind: ArcBand['kind']): void => {
        const a = Math.max(0, Math.min(s0, totalLength));
        const b = Math.max(0, Math.min(s1, totalLength));
        if (b - a <= MIN_BAND_M) return;
        if (yHi - yLo <= MIN_BAND_M) return;
        bands.push({
            s0: a,
            s1: b,
            yLo,
            yHi,
            kind,
            atStart: a <= ARC_EPSILON_M,
            atEnd: b >= totalLength - ARC_EPSILON_M,
        });
    };

    const clusters = clusterArcOpenings(openings);
    if (clusters.length === 0) {
        push(0, totalLength, 0, wallHeight, 'pier');
        return bands;
    }

    let cursor = 0;
    for (const cluster of clusters) {
        // Full-height pier before this cluster.
        push(cursor, cluster.minLeft, 0, wallHeight, 'pier');

        // Bottom-up through the cluster's openings: solid below each one.
        const verticalSorted = [...cluster.openings].sort(
            (a, b) => (a.sillHeight ?? 0) - (b.sillHeight ?? 0),
        );
        let currentY = 0;
        for (const op of verticalSorted) {
            const sill = op.sillHeight ?? 0;
            if (sill - currentY > MIN_BAND_M) {
                // The sill band spans only THIS opening's arc extent, not the
                // whole cluster — a low window beside a tall door must keep the
                // masonry under the window without blocking the door.
                push(op.offset, op.offset + op.width, currentY, sill, 'sill');
            }
            currentY = Math.max(currentY, sill + op.height);
        }

        // Header over the whole cluster.
        push(cluster.minLeft, cluster.maxRight, currentY, wallHeight, 'header');

        cursor = Math.max(cursor, cluster.maxRight);
    }

    // Full-height pier after the last cluster.
    push(cursor, totalLength, 0, wallHeight, 'pier');

    return bands;
}

// ─── Station resampling ───────────────────────────────────────────────────────

/**
 * Cumulative arc lengths of a station list, measured along the station
 * centreline chords — the same polyline `wallCentreline` measures, expressed in
 * the LOCAL (start-relative) coordinates that `computeStations` emits.
 */
export function stationArcLengths(stations: ReadonlyArray<Station>): number[] {
    const cum: number[] = [0];
    for (let i = 1; i < stations.length; i++) {
        const cur = stations[i]!;
        const prv = stations[i - 1]!;
        cum.push(cum[i - 1]! + Math.hypot(cur.cx - prv.cx, cur.cz - prv.cz));
    }
    return cum;
}

/**
 * Slice the station list to the arc span `[s0, s1]`, INSERTING exact stations at
 * `s0` and `s1` so the band terminates precisely at the opening edge rather than
 * snapping to the nearest tessellation vertex.
 *
 * This is what makes the carve exact: the resulting jamb plane passes through
 * the centreline point at arc length `s0`, oriented by the local outward normal,
 * so the void measured along the CENTRELINE is exactly `width` (asserted in
 * the tests) regardless of how the opening straddles the tessellation.
 *
 * An interpolated station inherits the NORMAL of the chord it lies on — that
 * chord's normal is the true face plane there, so the jamb is exactly
 * perpendicular to the built face (no wedge).
 */
export function sliceStations(
    stations: ReadonlyArray<Station>,
    cum: ReadonlyArray<number>,
    s0: number,
    s1: number,
): Station[] {
    const n = stations.length;
    if (n < 2) return stations.slice();

    const total = cum[n - 1]!;
    const a = Math.max(0, Math.min(s0, total));
    const b = Math.max(a, Math.min(s1, total));

    const at = (s: number): Station => {
        // Locate the chord containing `s`; clamp to the last chord at the tail.
        let i = n - 2;
        for (let k = 1; k < n; k++) {
            if (cum[k]! >= s - ARC_EPSILON_M) { i = k - 1; break; }
        }
        const p0 = stations[i]!;
        const p1 = stations[i + 1]!;
        const segLen = cum[i + 1]! - cum[i]!;
        const u = segLen > ARC_EPSILON_M ? (s - cum[i]!) / segLen : 0;
        return {
            cx: p0.cx + (p1.cx - p0.cx) * u,
            cz: p0.cz + (p1.cz - p0.cz) * u,
            // Chord `i`'s normal IS the face plane over this chord — the jamb
            // built here is therefore radial to the actual built surface.
            nx: p0.nx,
            nz: p0.nz,
        };
    };

    const out: Station[] = [at(a)];
    for (let i = 0; i < n; i++) {
        if (cum[i]! > a + ARC_EPSILON_M && cum[i]! < b - ARC_EPSILON_M) out.push(stations[i]!);
    }
    const endStation = at(b);
    // The terminal station must carry the normal of the chord it TERMINATES, so
    // the end cap is radial. `at()` already returns the containing chord's
    // normal; when `b` lands exactly on a vertex, prefer the preceding chord.
    out.push(endStation);

    // Guard: a degenerate span must still yield ≥2 distinct stations so the
    // geometry generator's strip loop is well-formed.
    if (out.length < 2) out.push({ ...out[0]! });
    return out;
}

/**
 * §FEAT-WALL-PROFILE-CURVED (WJ1, L-1072) — return the station list with EXTRA stations
 * inserted at each arc length in `sList`, keeping the list sorted and duplicate-free.
 *
 * A swept curved wall is only as sharp as its stations. A profile corner at `u = 2.5`,
 * sampled by stations at 2.40 and 2.61, renders as a BEVEL — the authored corner is simply
 * not in the geometry, and no amount of correct height evaluation puts it back. This is the
 * same exactness `sliceStations` gives an opening jamb, for the same reason and by the same
 * interpolation: an inserted station inherits the NORMAL of the chord it lies on, because
 * that chord's normal is the true face plane there.
 *
 * ⚠ THE SEGMENT COUNT IS NOT RAISED. Inserting where the profile has a corner is exact
 *   where it matters and costs one station per corner; raising `curve.segments` globally
 *   would cost the whole arc and still not land ON the corner.
 */
export function insertStationsAt(
    stations: ReadonlyArray<Station>,
    cum: ReadonlyArray<number>,
    sList: ReadonlyArray<number>,
): Station[] {
    const n = stations.length;
    if (n < 2) return stations.slice();
    const total = cum[n - 1]!;

    const at = (s: number): Station => {
        let i = n - 2;
        for (let k = 1; k < n; k++) {
            if (cum[k]! >= s - ARC_EPSILON_M) { i = k - 1; break; }
        }
        const p0 = stations[i]!;
        const p1 = stations[i + 1]!;
        const segLen = cum[i + 1]! - cum[i]!;
        const u = segLen > ARC_EPSILON_M ? (s - cum[i]!) / segLen : 0;
        return { cx: p0.cx + (p1.cx - p0.cx) * u, cz: p0.cz + (p1.cz - p0.cz) * u, nx: p0.nx, nz: p0.nz };
    };

    const wanted = [...sList]
        .filter(v => Number.isFinite(v) && v > ARC_EPSILON_M && v < total - ARC_EPSILON_M)
        .sort((a, b) => a - b);
    if (wanted.length === 0) return stations.slice();

    const out: Station[] = [];
    let w = 0;
    for (let i = 0; i < n; i++) {
        // Anything strictly before this existing station, and not already ON it.
        while (w < wanted.length && wanted[w]! < cum[i]! - ARC_EPSILON_M) {
            out.push(at(wanted[w]!));
            w++;
        }
        // Consume any request that coincides with this station — it is already there.
        while (w < wanted.length && Math.abs(wanted[w]! - cum[i]!) <= ARC_EPSILON_M) w++;
        out.push(stations[i]!);
    }
    while (w < wanted.length) { out.push(at(wanted[w]!)); w++; }
    return out;
}

/**
 * Unit tangent of the chord a band terminates on, used as the cap tangent for
 * that band's start / end face so the jamb is radial.
 */
export function bandCapTangents(band: Station[]): {
    start: { x: number; z: number };
    end: { x: number; z: number };
} {
    const n = band.length;
    const t = (a: Station, b: Station): { x: number; z: number } => {
        const dx = b.cx - a.cx;
        const dz = b.cz - a.cz;
        const l = Math.hypot(dx, dz) || 1;
        return { x: dx / l, z: dz / l };
    };
    return { start: t(band[0]!, band[1]!), end: t(band[n - 2]!, band[n - 1]!) };
}
