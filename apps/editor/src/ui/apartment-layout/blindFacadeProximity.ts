// PW.2 (§DIAG-PARTY-WALL, 2026-06-10) — pure proximity geometry for blind-façade
// detection. NO THREE / NO DOM / NO I/O — plain 2D math so it is unit-testable and
// deterministic (ADR-0061). All coordinates are editor world-XZ metres.
//
// THE RULE (SPEC-PARTY-WALL-AWARENESS §5)
// ---------------------------------------
// A shell/perimeter wall is BLIND when a neighbouring building footprint EDGE runs
//   (a) roughly PARALLEL to the wall,
//   (b) within `setbackM` of it (perpendicular distance), and
//   (c) on the wall's OUTWARD side (the side facing away from the building interior).
// The midpoint of the wall is the probe point; the neighbour edge's nearest point
// must also lie within the wall's span (the projection overlaps) so a far-away
// parallel wall fragment doesn't trigger.

/** A 2D point in editor world-XZ metres. */
export interface XZ {
    readonly x: number;
    readonly z: number;
}

/** A shell wall segment in world-XZ. */
export interface ProximityShellWall {
    readonly id: string;
    readonly start: XZ;
    readonly end: XZ;
}

/** A neighbour footprint as an XZ ring (already projected to the editor frame). */
export interface ProximityFootprint {
    readonly ring: ReadonlyArray<XZ>;
}

/** Tunables for the blind-façade proximity test. */
export interface ProximityConfig {
    /** Max perpendicular distance (m) from wall to neighbour edge to count as blind. */
    readonly setbackM: number;
    /** Max angle (deg) between wall + neighbour edge to count as "parallel". */
    readonly parallelToleranceDeg: number;
    /**
     * Centroid of the building INTERIOR (world-XZ). The "outward side" is the side
     * of the wall AWAY from this point. When omitted, the outward-side gate is
     * skipped (any side counts) — a conservative fallback that still respects the
     * distance + parallel + span gates.
     */
    readonly interiorPoint?: XZ;
}

/** Sensible default config — pure party-wall to ~1 m setback, 25° parallel band. */
export const DEFAULT_PROXIMITY_CONFIG: ProximityConfig = {
    setbackM: 1.0,
    parallelToleranceDeg: 25,
};

function sub(a: XZ, b: XZ): XZ {
    return { x: a.x - b.x, z: a.z - b.z };
}
function dot(a: XZ, b: XZ): number {
    return a.x * b.x + a.z * b.z;
}
function len(a: XZ): number {
    return Math.hypot(a.x, a.z);
}

/** Midpoint of a segment. */
function midpoint(a: XZ, b: XZ): XZ {
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

/**
 * Closest point on segment [a,b] to point p, and the parametric t∈[0,1].
 * Standard projection-and-clamp.
 */
function closestPointOnSegment(p: XZ, a: XZ, b: XZ): { point: XZ; t: number } {
    const ab = sub(b, a);
    const abLen2 = dot(ab, ab);
    if (abLen2 < 1e-12) return { point: a, t: 0 };
    let t = dot(sub(p, a), ab) / abLen2;
    t = Math.max(0, Math.min(1, t));
    return { point: { x: a.x + ab.x * t, z: a.z + ab.z * t }, t };
}

/** Perpendicular distance from p to the INFINITE line through a→b. */
function perpDistanceToLine(p: XZ, a: XZ, b: XZ): number {
    const ab = sub(b, a);
    const abLen = len(ab);
    if (abLen < 1e-9) return len(sub(p, a));
    // 2D cross product magnitude / base length.
    const ap = sub(p, a);
    const cross = ab.x * ap.z - ab.z * ap.x;
    return Math.abs(cross) / abLen;
}

/** Acute angle (deg) between two direction vectors, folded into [0,90]. */
function acuteAngleDeg(u: XZ, v: XZ): number {
    const lu = len(u);
    const lv = len(v);
    if (lu < 1e-9 || lv < 1e-9) return 90;
    let cos = dot(u, v) / (lu * lv);
    cos = Math.max(-1, Math.min(1, cos));
    let deg = (Math.acos(cos) * 180) / Math.PI;
    if (deg > 90) deg = 180 - deg; // fold (a line has no direction)
    return deg;
}

/** Why a wall was marked blind — for §DIAG-PARTY-WALL logging. */
export interface BlindHit {
    readonly wallId: string;
    /** Index of the neighbour footprint that triggered it. */
    readonly footprintIndex: number;
    /** Perpendicular distance (m) from the wall midpoint to the neighbour edge. */
    readonly distanceM: number;
    /** Angle (deg) between the wall and the neighbour edge. */
    readonly angleDeg: number;
}

/**
 * Test a single shell wall against a single neighbour edge [ea,eb]. Returns the
 * perpendicular distance if it qualifies as blind (parallel + within setback +
 * overlapping span + outward side), else `null`.
 */
function edgeBlindHit(
    wall: ProximityShellWall,
    ea: XZ,
    eb: XZ,
    cfg: ProximityConfig,
): { distanceM: number; angleDeg: number } | null {
    const wallDir = sub(wall.end, wall.start);
    if (len(wallDir) < 1e-6) return null; // degenerate wall
    const edgeDir = sub(eb, ea);
    if (len(edgeDir) < 1e-6) return null; // degenerate edge

    // (a) parallel?
    const angleDeg = acuteAngleDeg(wallDir, edgeDir);
    if (angleDeg > cfg.parallelToleranceDeg) return null;

    // (b) within setback? Use the wall midpoint as the probe, measured to the
    // INFINITE neighbour line (so a long neighbour wall counts even if the probe
    // projects slightly past the captured ring vertex).
    const mid = midpoint(wall.start, wall.end);
    const distanceM = perpDistanceToLine(mid, ea, eb);
    if (distanceM > cfg.setbackM) return null;

    // (c) span overlap — the nearest point on the FINITE neighbour edge to the
    // wall midpoint must be a genuine projection (t strictly interior OR the wall
    // midpoint's own nearest point on the wall covers it). We require the neighbour
    // edge's closest-point parameter to be within [0,1] with a small margin so a
    // disjoint-but-collinear fragment far along the wall doesn't trigger.
    const near = closestPointOnSegment(mid, ea, eb);
    // The closest point must be within the setback too (guards the "parallel but
    // offset past the end" case where perp-distance-to-infinite-line is small but
    // the actual nearest edge point is far).
    const nearDist = len(sub(mid, near.point));
    if (nearDist > cfg.setbackM + 1e-6) return null;

    // (d) outward side — the neighbour must be on the side of the wall AWAY from
    // the building interior. Skipped when no interior point is supplied.
    if (cfg.interiorPoint) {
        // Wall normal (either of two); pick the one pointing AWAY from interior.
        const n: XZ = { x: -wallDir.z, z: wallDir.x };
        const toInterior = sub(cfg.interiorPoint, mid);
        // Outward normal points opposite to interior.
        const outward: XZ = dot(n, toInterior) > 0 ? { x: -n.x, z: -n.z } : n;
        const toNeighbour = sub(near.point, mid);
        // Neighbour edge must be on the outward side (non-negative dot). A tiny
        // tolerance lets a touching (party) wall on the line itself pass.
        if (dot(outward, toNeighbour) < -1e-6) return null;
    }

    return { distanceM, angleDeg };
}

/**
 * Compute the BLIND shell-wall ids: for each wall, the FIRST neighbour edge that
 * qualifies (parallel + within setback + span overlap + outward side) marks it
 * blind. Returns the hits (one per blind wall) for diagnostics; the caller turns
 * them into a `Set<string>`. Pure + deterministic.
 *
 * @param walls       shell walls in world-XZ.
 * @param footprints  neighbour footprints (XZ rings, already projected).
 * @param cfg         proximity tunables (defaults to `DEFAULT_PROXIMITY_CONFIG`).
 */
export function computeBlindFacadeHits(
    walls: readonly ProximityShellWall[],
    footprints: readonly ProximityFootprint[],
    cfg: ProximityConfig = DEFAULT_PROXIMITY_CONFIG,
): readonly BlindHit[] {
    const hits: BlindHit[] = [];
    if (walls.length === 0 || footprints.length === 0) return hits;

    for (const wall of walls) {
        let best: BlindHit | null = null;
        for (let fi = 0; fi < footprints.length; fi++) {
            const ring = footprints[fi]!.ring;
            if (ring.length < 2) continue;
            // Walk each edge of the (possibly-closed) ring.
            for (let i = 0; i < ring.length; i++) {
                const ea = ring[i]!;
                const eb = ring[(i + 1) % ring.length]!;
                const hit = edgeBlindHit(wall, ea, eb, cfg);
                if (hit && (best === null || hit.distanceM < best.distanceM)) {
                    best = {
                        wallId: wall.id,
                        footprintIndex: fi,
                        distanceM: hit.distanceM,
                        angleDeg: hit.angleDeg,
                    };
                }
            }
        }
        if (best) hits.push(best);
    }
    return hits;
}
