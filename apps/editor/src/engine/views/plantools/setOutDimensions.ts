// §WALL-SETOUT (founder 2026-06-20) — pure set-out dimension geometry.
//
// When drawing a wall (esp. an internal partition) the user has no feedback on how
// far the point they're placing sits from the SURROUNDING walls. This computes the
// orthogonal set-out distances — the architect's "this partition is 1200 mm off
// that wall" — from a live point to the nearest qualifying wall along each axis.
//
// §WALL-SETOUT-4SIDE (founder 2026-07-06) — the set-out is now projected to BOTH
// sides of each axis: nearest wall to +X AND −X, nearest to +Z AND −Z (up to FOUR
// dims total, not just the single nearest per axis). Each dim is tagged with the
// `side` it points to and a `role`: the NEARER side on each axis is the PRIMARY
// pair (the two the founder already saw — rendered blue); the farther side is the
// SECONDARY pair (rendered grey). Colour is decided in the render layer from the
// tag — this module stays pure.
//
// §WALL-SETOUT-TAB-INPUT — `solveSetOutPoint` back-solves the live vertex from a
// typed set-out distance (TAB-to-edit numeric entry): move the point along the
// dim's axis so the perpendicular distance to that wall equals the typed mm, on the
// SAME side. Pure maths so it is unit-tested; the tool handler dispatches the
// resulting point through the existing wall-creation command (P6).
//
// PURE: no DOM, no THREE, no canvas. Plain 2D maths over wall segments so it is
// fully unit-testable without a browser. The render layer (WallPlanToolHandler
// `_drawWallPreview`) consumes the result and draws the dimension lines.

import { trace } from '@opentelemetry/api';

const _setOutTracer = trace.getTracer('@pryzm/editor.set-out-dimensions', '0.1.0');

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

/** §WALL-SETOUT-4SIDE — which side of the point the measured wall lies on. `+x`
 *  means the wall is toward +X (so the set-out runs along X); mirror for the rest. */
export type SetOutSide = '+x' | '-x' | '+z' | '-z';

/** §WALL-SETOUT-4SIDE — the PRIMARY pair is the nearer wall on each axis (blue in the
 *  render layer, the two the founder already saw); the SECONDARY pair is the farther
 *  wall on each axis (grey). */
export type SetOutRole = 'primary' | 'secondary';

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
    /** §WALL-SETOUT-4SIDE — which side of the point the wall lies on. */
    readonly side: SetOutSide;
    /** §WALL-SETOUT-4SIDE — nearer-per-axis (`primary`) vs farther (`secondary`). */
    readonly role: SetOutRole;
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

/** A candidate before role assignment (role is decided once we know both sides). */
type Candidate = Omit<SetOutDimension, 'role'>;

/** Keep the nearer of two same-axis candidates (either may be null). */
function nearer(a: Candidate | null, b: Candidate | null): Candidate | null {
    if (!a) return b;
    if (!b) return a;
    return a.distanceMm <= b.distanceMm ? a : b;
}

/** Return the FARTHER of two candidates, or null unless BOTH exist. */
function farther(a: Candidate | null, b: Candidate | null): Candidate | null {
    if (!a || !b) return null;
    return a.distanceMm <= b.distanceMm ? b : a;
}

const withRole = (c: Candidate | null, role: SetOutRole): SetOutDimension | null =>
    c ? { ...c, role } : null;

/**
 * Compute the orthogonal set-out dimensions from `point` to the nearest qualifying
 * walls. §WALL-SETOUT-4SIDE: returns up to FOUR dimensions — the nearest wall the
 * point projects onto toward +X, −X, +Z and −Z, within `maxDistanceM`. The nearer
 * wall on each axis is tagged `role: 'primary'` (the pair the founder already saw),
 * the farther `role: 'secondary'`. Order is [primaryX, primaryZ, secondaryX,
 * secondaryZ] with missing sides omitted, so a single wall per axis reduces to the
 * original 1-or-2-dim behaviour.
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

    // §WALL-SETOUT-4SIDE — nearest qualifying wall on EACH side of EACH axis.
    let bestXPlus: Candidate | null = null;   // nearest near-vertical wall at x ≥ point.x
    let bestXMinus: Candidate | null = null;  // nearest near-vertical wall at x < point.x
    let bestZPlus: Candidate | null = null;   // nearest near-horizontal wall at z ≥ point.z
    let bestZMinus: Candidate | null = null;  // nearest near-horizontal wall at z < point.z

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
                if (dist <= maxD) {
                    const cand: Candidate = {
                        from: point,
                        to: { x: wallX, z: point.z },
                        distanceMm: Math.round(dist * 1000),
                        axis: 'x',
                        side: wallX >= point.x ? '+x' : '-x',
                    };
                    if (cand.side === '+x') bestXPlus = nearer(bestXPlus, cand);
                    else bestXMinus = nearer(bestXMinus, cand);
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
                if (dist <= maxD) {
                    const cand: Candidate = {
                        from: point,
                        to: { x: point.x, z: wallZ },
                        distanceMm: Math.round(dist * 1000),
                        axis: 'z',
                        side: wallZ >= point.z ? '+z' : '-z',
                    };
                    if (cand.side === '+z') bestZPlus = nearer(bestZPlus, cand);
                    else bestZMinus = nearer(bestZMinus, cand);
                }
            }
        }
    }

    // §WALL-SETOUT-4SIDE — assign roles: nearer side per axis = primary, farther = secondary.
    const xNear = withRole(nearer(bestXPlus, bestXMinus), 'primary');
    const zNear = withRole(nearer(bestZPlus, bestZMinus), 'primary');
    const xFar = withRole(farther(bestXPlus, bestXMinus), 'secondary');
    const zFar = withRole(farther(bestZPlus, bestZMinus), 'secondary');

    const out: SetOutDimension[] = [];
    if (xNear) out.push(xNear);
    if (zNear) out.push(zNear);
    if (xFar) out.push(xFar);
    if (zFar) out.push(zFar);
    return out;
}

/**
 * §WALL-SETOUT-TAB-INPUT — back-solve the live vertex from a typed set-out distance.
 *
 * Given a `point`, the `dim` the user is editing (its axis + side + wall foot `to`)
 * and the typed distance in millimetres, return the point moved ALONG that dim's
 * axis so the perpendicular distance to the wall equals `distanceMm`, keeping the
 * point on the SAME side of the wall. The off-axis coordinate is preserved, so
 * editing the X dim then the Z dim composes into one point.
 *
 * Pure — the tool handler dispatches the resulting point through the existing
 * wall-creation command (P6). Non-finite / negative input is clamped to 0.
 *
 * P8: emits `pryzm.wall.solve_setout_point`.
 */
export function solveSetOutPoint(
    point: PtXZ,
    dim: Pick<SetOutDimension, 'axis' | 'side' | 'to'>,
    distanceMm: number,
): PtXZ {
    return _setOutTracer.startActiveSpan('pryzm.wall.solve_setout_point', (span) => {
        try {
            span.setAttribute('pryzm.wall.setout_axis', dim.axis);
            span.setAttribute('pryzm.wall.setout_side', dim.side);
            span.setAttribute('pryzm.wall.setout_distance_mm', Number.isFinite(distanceMm) ? distanceMm : -1);
            if (!isFinitePt(point)) return point;
            const dist = Number.isFinite(distanceMm) ? Math.max(0, distanceMm) / 1000 : 0;
            if (dim.axis === 'x') {
                const wallX = dim.to.x;
                const newX = dim.side === '+x' ? wallX - dist : wallX + dist;
                return { x: newX, z: point.z };
            }
            const wallZ = dim.to.z;
            const newZ = dim.side === '+z' ? wallZ - dist : wallZ + dist;
            return { x: point.x, z: newZ };
        } finally {
            span.end();
        }
    });
}
