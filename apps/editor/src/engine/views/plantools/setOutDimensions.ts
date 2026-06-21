// §WALL-SETOUT (founder 2026-06-20) — pure set-out dimension geometry.
//
// When drawing a wall (esp. an internal partition) the user has no feedback on how
// far the point they're placing sits from the SURROUNDING walls. This computes the
// orthogonal set-out distances — the architect's "this partition is 1200 mm off
// that wall" — from a live point to the nearest qualifying wall along each axis.
//
// PURE: no DOM, no THREE, no canvas. Plain 2D maths over wall segments so it is
// fully unit-testable without a browser. The render layer (WallPlanToolHandler
// `_drawWallPreview`) consumes the result and draws the blue dimension lines.

/** A 2D point (plan frame, metres). */
export interface PtXZ {
    readonly x: number;
    readonly z: number;
}

/** A wall as the set-out maths sees it — its baseline segment (metres, y dropped). */
export interface SetOutSegment {
    readonly a: PtXZ;
    readonly b: PtXZ;
}

/** One set-out dimension: a perpendicular from `point` to a wall, along one axis. */
export interface SetOutDimension {
    /** The live point the dimension is measured FROM. */
    readonly from: PtXZ;
    /** The foot of the perpendicular ON the wall (the dimension's far end). */
    readonly to: PtXZ;
    /** Distance in millimetres (rounded), for the label. */
    readonly distanceMm: number;
    /** Which world axis the measurement runs along. */
    readonly axis: 'x' | 'z';
}

export interface SetOutOptions {
    /** Max distance (metres) to consider a wall a set-out reference. Default 8 m. */
    readonly maxDistanceM?: number;
    /** Walls shorter than this (metres) are ignored as noise. Default 0.05 m. */
    readonly minWallLengthM?: number;
}

const DEFAULT_MAX_DISTANCE_M = 8;
const DEFAULT_MIN_WALL_LENGTH_M = 0.05;
/** A wall counts as axis-aligned (so it gives a clean orthogonal set-out) when its
 *  off-axis extent is within this fraction of its on-axis extent. ~5.7° of skew. */
const AXIS_ALIGNED_TOL = 0.1;

const isFinitePt = (p: PtXZ | undefined | null): p is PtXZ =>
    !!p && Number.isFinite(p.x) && Number.isFinite(p.z);

/**
 * Compute the orthogonal set-out dimensions from `point` to the nearest qualifying
 * walls — one along +/−X (nearest vertical wall) and one along +/−Z (nearest
 * horizontal wall). Returns 0, 1, or 2 dimensions (the nearest on each axis that
 * the point genuinely projects onto, within `maxDistanceM`).
 *
 * A wall qualifies for the X axis when it is (near-)vertical (runs along Z) and the
 * point's Z lies within the wall's Z span — so the horizontal perpendicular's foot
 * is ON the wall, never past its end (which would be a misleading dimension). The
 * Z axis is the mirror. Skewed walls are skipped (no clean orthogonal set-out).
 */
export function computeSetOutDimensions(
    point: PtXZ,
    segments: readonly SetOutSegment[],
    opts: SetOutOptions = {},
): SetOutDimension[] {
    if (!isFinitePt(point)) return [];
    const maxD = opts.maxDistanceM ?? DEFAULT_MAX_DISTANCE_M;
    const minLen = opts.minWallLengthM ?? DEFAULT_MIN_WALL_LENGTH_M;

    let bestX: SetOutDimension | null = null; // nearest near-vertical wall (dim along X)
    let bestZ: SetOutDimension | null = null; // nearest near-horizontal wall (dim along Z)

    for (const seg of segments) {
        if (!isFinitePt(seg?.a) || !isFinitePt(seg?.b)) continue;
        const dx = seg.b.x - seg.a.x;
        const dz = seg.b.z - seg.a.z;
        const adx = Math.abs(dx);
        const adz = Math.abs(dz);
        const len = Math.hypot(dx, dz);
        if (len < minLen) continue;

        // Near-VERTICAL wall (runs along Z) → measures a set-out along X.
        if (adz > minLen && adx <= AXIS_ALIGNED_TOL * adz) {
            const loZ = Math.min(seg.a.z, seg.b.z);
            const hiZ = Math.max(seg.a.z, seg.b.z);
            if (point.z >= loZ && point.z <= hiZ) {
                const wallX = (seg.a.x + seg.b.x) / 2;  // ~constant for a vertical wall
                const dist = Math.abs(point.x - wallX);
                if (dist <= maxD && (bestX === null || dist < bestX.distanceMm / 1000)) {
                    bestX = {
                        from: point,
                        to: { x: wallX, z: point.z },
                        distanceMm: Math.round(dist * 1000),
                        axis: 'x',
                    };
                }
            }
        }

        // Near-HORIZONTAL wall (runs along X) → measures a set-out along Z.
        if (adx > minLen && adz <= AXIS_ALIGNED_TOL * adx) {
            const loX = Math.min(seg.a.x, seg.b.x);
            const hiX = Math.max(seg.a.x, seg.b.x);
            if (point.x >= loX && point.x <= hiX) {
                const wallZ = (seg.a.z + seg.b.z) / 2;
                const dist = Math.abs(point.z - wallZ);
                if (dist <= maxD && (bestZ === null || dist < bestZ.distanceMm / 1000)) {
                    bestZ = {
                        from: point,
                        to: { x: point.x, z: wallZ },
                        distanceMm: Math.round(dist * 1000),
                        axis: 'z',
                    };
                }
            }
        }
    }

    const out: SetOutDimension[] = [];
    if (bestX) out.push(bestX);
    if (bestZ) out.push(bestZ);
    return out;
}
