// §FEAT-WALL-MOVE-DIMENSIONS (founder L-29, 2026-07-02) — pure move-time set-out
// geometry: while a SELECTED wall is dragged on plan view, compute the live gap
// dimension(s) in the direction ORTHOGONAL to the wall's own direction vector.
//
// Rationale: a wall normally translates PERPENDICULAR to itself. So for a wall
// running along X (horizontal) the meaningful feedback is the vertical (Z) gap to
// the nearest PARALLEL walls above/below; for a wall along Z it is the horizontal
// (X) gap. This mirrors the founder-loved wall-DRAW set-out affordance
// (`apps/editor/src/engine/views/plantools/setOutDimensions.ts` +
// `WallPlanToolHandler._drawSetOutDimensions`) — SAME architect's "this wall is
// 1200 mm off that wall" — but keyed to the wall's OWN axis and reported on BOTH
// sides (nearest neighbour in +/− perpendicular) so the user sees the gap it is
// closing AND the gap it is opening as it drags.
//
// PURE: no DOM, no THREE, no canvas, no store. Plain 2D maths over wall baselines
// (plan XZ, metres) so it is fully unit-testable without a browser. The render
// layer (`PlanElementDragController._renderWallOverlay`) consumes the result and
// draws blue dashed dimension lines with the SAME renderer the wall-length /
// move-delta dims already use.
//
// L-30 REUSE NOTE: the returned `{ from, to, distanceMm, axis }` shape is the same
// contract the draw-time set-out uses and is intentionally render-agnostic, so the
// follow-up hosted door/window move-along-wall dims can reuse the same dimension
// descriptor + render helper without a new geometry type.

/** A 2D point (plan frame, metres). */
export interface MovePtXZ {
    readonly x: number;
    readonly z: number;
}

/** A wall as the move-dimension maths sees it — its baseline segment (metres, y dropped). */
export interface MoveWallSegment {
    readonly a: MovePtXZ;
    readonly b: MovePtXZ;
}

/**
 * One move set-out dimension: a perpendicular gap from the moving wall to a
 * parallel neighbour, along one world axis. Shape mirrors the draw-time
 * `SetOutDimension` so the same render helper serves both (and L-30).
 */
export interface WallMoveDimension {
    /** The point on the MOVING wall the gap is measured FROM. */
    readonly from: MovePtXZ;
    /** The foot on the neighbour wall (the dimension's far end). */
    readonly to: MovePtXZ;
    /** Distance in millimetres (rounded), for the label. */
    readonly distanceMm: number;
    /** Which world axis the measurement runs along (perpendicular to the moving wall). */
    readonly axis: 'x' | 'z';
    /** Which side of the moving wall the neighbour sits on, along the axis. */
    readonly side: 'plus' | 'minus';
}

export interface WallMoveDimensionOptions {
    /** Max distance (metres) to consider a neighbour wall. Default 8 m. */
    readonly maxDistanceM?: number;
    /** Walls shorter than this (metres) are ignored as noise. Default 0.05 m. */
    readonly minWallLengthM?: number;
}

const DEFAULT_MAX_DISTANCE_M = 8;
const DEFAULT_MIN_WALL_LENGTH_M = 0.05;

/**
 * A neighbour counts as PARALLEL to the moving wall (giving a clean orthogonal
 * gap) when its off-axis extent is within this fraction of its on-axis extent.
 * ~5.7° of skew — same tolerance as the draw-time `setOutDimensions.ts`.
 */
// §C73 §2.3 — was `AXIS_ALIGNED_TOL`, which reads as 0.1 m to anyone who has not
// opened the call sites. It is a RATIO: both uses are `offAxis <= this * onAxis`,
// so the number is a slope (≈5.7° of skew), scale-free, and a metre reading would
// be a category error — on a 6 m wall it would be 60× stricter than intended.
const AXIS_ALIGNED_TOL_RATIO = 0.1;

/**
 * The moving wall's OWN axis must clearly dominate for the perpendicular gap to
 * be meaningful. tan(67.5°) ≈ 2.414 → the wall counts as axis-aligned when its
 * on-axis extent is ≥ 2.414× its off-axis extent (i.e. within ±22.5° of a world
 * axis). Between the ±22.5° neutral zone around 45° neither axis dominates → we
 * return no dimensions (near-diagonal wall). This mirrors L-26's
 * `WallAlignmentGuide.AXIS_DOMINANCE_RATIO` convention so the move affordance and
 * the draw guide agree on what "orthogonal enough" means.
 */
const AXIS_DOMINANCE_RATIO = Math.tan((67.5 * Math.PI) / 180);

const isFinitePt = (p: MovePtXZ | undefined | null): p is MovePtXZ =>
    !!p && Number.isFinite(p.x) && Number.isFinite(p.z);

/** The moving wall's dominant world axis, or `null` when it is near-diagonal. */
export type MovingWallAxis = 'x' | 'z' | null;

/**
 * Classify the moving wall's dominant axis from its direction vector, applying
 * the ±22.5° neutral-zone convention. Returns:
 *   • `'x'` — wall runs along world-X (horizontal): translates along Z.
 *   • `'z'` — wall runs along world-Z (vertical): translates along X.
 *   • `null` — near-diagonal (neutral zone) or degenerate: no clean move set-out.
 */
export function classifyMovingWallAxis(seg: MoveWallSegment): MovingWallAxis {
    if (!isFinitePt(seg?.a) || !isFinitePt(seg?.b)) return null;
    const dx = seg.b.x - seg.a.x;
    const dz = seg.b.z - seg.a.z;
    const adx = Math.abs(dx);
    const adz = Math.abs(dz);
    if (Math.hypot(adx, adz) < DEFAULT_MIN_WALL_LENGTH_M) return null;
    if (adx >= adz * AXIS_DOMINANCE_RATIO) return 'x'; // horizontal wall
    if (adz >= adx * AXIS_DOMINANCE_RATIO) return 'z'; // vertical wall
    return null; // diagonal / neutral zone
}

/**
 * Compute the live move set-out dimension(s) from a MOVING wall to the nearest
 * PARALLEL neighbour wall(s) in the direction perpendicular to the moving wall.
 *
 * Returns 0, 1, or 2 dimensions — the nearest qualifying neighbour on the `+`
 * side and on the `−` side of the moving wall along its perpendicular axis. A
 * neighbour qualifies when:
 *   • it is parallel to the moving wall (same dominant axis), and
 *   • the moving wall's representative point (its midpoint) projects ONTO the
 *     neighbour's span — so the perpendicular's foot is on the neighbour, never
 *     past its end (which would be a misleading gap), and
 *   • the gap is within `maxDistanceM`.
 *
 * A near-diagonal moving wall (neutral zone) yields `[]` — there is no clean
 * orthogonal translation, so a perpendicular gap would be meaningless.
 *
 * @param movingWall  the wall being dragged, as its live (already-moved) baseline.
 * @param neighbours  the other walls on the SAME level, as baselines.
 */
export function computeWallMoveDimensions(
    movingWall: MoveWallSegment,
    neighbours: readonly MoveWallSegment[],
    opts: WallMoveDimensionOptions = {},
): WallMoveDimension[] {
    const axis = classifyMovingWallAxis(movingWall);
    if (!axis) return [];

    const maxD = opts.maxDistanceM ?? DEFAULT_MAX_DISTANCE_M;
    const minLen = opts.minWallLengthM ?? DEFAULT_MIN_WALL_LENGTH_M;

    // Representative point on the moving wall — its midpoint. The gap is measured
    // from here along the perpendicular axis.
    const mid: MovePtXZ = {
        x: (movingWall.a.x + movingWall.b.x) / 2,
        z: (movingWall.a.z + movingWall.b.z) / 2,
    };

    // For a HORIZONTAL wall (axis 'x'): it translates along Z; we want parallel
    // (near-horizontal) neighbours and measure the Z gap.
    // For a VERTICAL wall (axis 'z'): it translates along X; parallel
    // (near-vertical) neighbours, X gap.
    const perpAxis: 'x' | 'z' = axis === 'x' ? 'z' : 'x';

    let bestPlus: WallMoveDimension | null = null;  // neighbour at greater coord
    let bestMinus: WallMoveDimension | null = null; // neighbour at lesser coord

    for (const seg of neighbours) {
        if (!isFinitePt(seg?.a) || !isFinitePt(seg?.b)) continue;
        const dx = seg.b.x - seg.a.x;
        const dz = seg.b.z - seg.a.z;
        const adx = Math.abs(dx);
        const adz = Math.abs(dz);
        const len = Math.hypot(dx, dz);
        if (len < minLen) continue;

        if (axis === 'x') {
            // Moving wall is HORIZONTAL (runs along X). Parallel neighbour is
            // near-horizontal (runs along X); gap runs along Z.
            if (!(adx > minLen && adz <= AXIS_ALIGNED_TOL_RATIO * adx)) continue;
            const loX = Math.min(seg.a.x, seg.b.x);
            const hiX = Math.max(seg.a.x, seg.b.x);
            // The moving wall's midpoint must project onto the neighbour's X span.
            if (mid.x < loX || mid.x > hiX) continue;
            const wallZ = (seg.a.z + seg.b.z) / 2;
            const signed = wallZ - mid.z; // + → neighbour is at greater Z
            const dist = Math.abs(signed);
            if (dist > maxD || dist < 1e-9) continue;
            const dim: WallMoveDimension = {
                from: mid,
                to: { x: mid.x, z: wallZ },
                distanceMm: Math.round(dist * 1000),
                axis: perpAxis,
                side: signed >= 0 ? 'plus' : 'minus',
            };
            if (signed >= 0) {
                if (bestPlus === null || dist < bestPlus.distanceMm / 1000) bestPlus = dim;
            } else {
                if (bestMinus === null || dist < bestMinus.distanceMm / 1000) bestMinus = dim;
            }
        } else {
            // Moving wall is VERTICAL (runs along Z). Parallel neighbour is
            // near-vertical (runs along Z); gap runs along X.
            if (!(adz > minLen && adx <= AXIS_ALIGNED_TOL_RATIO * adz)) continue;
            const loZ = Math.min(seg.a.z, seg.b.z);
            const hiZ = Math.max(seg.a.z, seg.b.z);
            if (mid.z < loZ || mid.z > hiZ) continue;
            const wallX = (seg.a.x + seg.b.x) / 2;
            const signed = wallX - mid.x; // + → neighbour is at greater X
            const dist = Math.abs(signed);
            if (dist > maxD || dist < 1e-9) continue;
            const dim: WallMoveDimension = {
                from: mid,
                to: { x: wallX, z: mid.z },
                distanceMm: Math.round(dist * 1000),
                axis: perpAxis,
                side: signed >= 0 ? 'plus' : 'minus',
            };
            if (signed >= 0) {
                if (bestPlus === null || dist < bestPlus.distanceMm / 1000) bestPlus = dim;
            } else {
                if (bestMinus === null || dist < bestMinus.distanceMm / 1000) bestMinus = dim;
            }
        }
    }

    const out: WallMoveDimension[] = [];
    if (bestMinus) out.push(bestMinus);
    if (bestPlus) out.push(bestPlus);
    return out;
}
