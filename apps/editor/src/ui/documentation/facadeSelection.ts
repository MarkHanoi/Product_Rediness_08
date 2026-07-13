// §FEAT-AUTO-TAG-BATCH-EXECUTOR (L-265) — "WHICH WALLS ARE ON THIS FAÇADE?", ONCE.
//
// Extracted VERBATIM from `buildElevationSnapshot` (§FEAT-AUTO-DIMENSION-ELEVATION-VIEWS,
// L-263), which is now a caller rather than an owner. Auto-dimension and auto-tag ask the
// SAME question of an elevation — which walls does the viewer actually see — and answering
// it twice is how the two executors would drift into disagreeing about the same drawing
// (dimensions measuring one wall while a tag names another).
//
// THE HEURISTIC, STATED AS ONE (unchanged from L-263):
//   A wall is on the façade if
//     (a) its baseline runs ACROSS the view (|dir · right| ≥ FACADE_PARALLEL_MIN), and
//     (b) it lies within FACADE_DEPTH_BAND_M of the CLOSEST such wall to the viewer.
//   True elevation visibility is hidden-line removal, which the drawing pipeline owns and
//   which an executor must not duplicate. This is a heuristic, it is named as one, and when
//   it selects nothing the caller must SAY SO rather than annotate the wrong wall.
//
// The (H, V) frame comes from the platform's ONE `ViewPlane` (Contract 24 §3.1) — there is
// no second notion of "up" here either.

import { viewPlaneFromDefinition } from '@pryzm/core-app-model';
import type { ViewDefinition } from '@pryzm/core-app-model';

/** |dir · right| below this and the wall is edge-on to the viewer — not on this façade. */
export const FACADE_PARALLEL_MIN = 0.7;   // ≈ within 45° of the view's horizontal axis
/** Walls within this depth of the closest façade wall are on the SAME façade plane. */
export const FACADE_DEPTH_BAND_M = 0.6;   // one wall thickness + tolerance

export interface Vec3Like { x: number; y: number; z: number }

/** The view's (H, V) frame + the horizontal plane vectors the façade test needs. */
export interface ViewFacadeFrame {
    hWorldAxis: 'x' | 'z';
    hSign: 1 | -1;
    right: { x: number; z: number };
    normal: { x: number; z: number };
}

/** Minimal wall shape the façade test reads. */
export interface FacadeWallLike {
    id: string;
    levelId?: string;
    baseLine?: readonly [Vec3Like, Vec3Like];
}

/**
 * The view's (H, V) frame, derived from the ViewPlane and NOTHING else.
 *
 * Mirrors `PlanViewManager._buildContext()`: the canvas H sign is the sign of the view's
 * `right` vector on the horizontal axis. Returns null when the view is not vertical — the
 * caller must not pretend a plan is an elevation.
 */
export function resolveViewFacadeFrame(viewDef: ViewDefinition): ViewFacadeFrame | null {
    const plane = viewPlaneFromDefinition(viewDef, 0);
    if (!plane.isVertical) return null;
    const hWorldAxis = plane.hWorldAxis;
    const rightH = hWorldAxis === 'x' ? plane.right.x : plane.right.z;
    const hSign: 1 | -1 = rightH < 0 ? -1 : 1;
    return {
        hWorldAxis,
        hSign,
        right:  { x: plane.right.x,  z: plane.right.z },
        normal: { x: plane.normal.x, z: plane.normal.z },
    };
}

export interface FacadeSelection<W extends FacadeWallLike> {
    /** The walls on the nearest façade plane, in input order. */
    readonly walls: readonly W[];
    /** The depth coordinate of that plane along the view normal (the plane the tags sit in). */
    readonly depth: number;
}

/**
 * Select the walls on the façade this elevation looks at.
 *
 * PURE — exported so the selection is unit-testable against known geometry without a
 * runtime, a browser, or a ViewPlane.
 *
 * @param isEligible optional per-wall gate (L-263 uses it to require a KNOWN level
 *                   elevation, because a wall whose level has no elevation cannot be
 *                   measured — or tagged — in a vertical view).
 */
export function selectFacadeWalls<W extends FacadeWallLike>(
    walls: readonly W[],
    frame: ViewFacadeFrame,
    isEligible: (wall: W) => boolean = () => true,
): FacadeSelection<W> | null {
    const depthOf = (p: { x: number; z: number }): number => p.x * frame.normal.x + p.z * frame.normal.z;

    const candidates: { wall: W; depth: number }[] = [];
    for (const w of walls) {
        const bl = w.baseLine;
        if (!bl || bl.length < 2) continue;
        if (!isEligible(w)) continue;
        const dx = bl[1].x - bl[0].x;
        const dz = bl[1].z - bl[0].z;
        const len = Math.hypot(dx, dz);
        if (len < 1e-6) continue;
        // (a) does the wall run ACROSS the view, or edge-on to it?
        const dot = Math.abs((dx / len) * frame.right.x + (dz / len) * frame.right.z);
        if (dot < FACADE_PARALLEL_MIN) continue;
        const mid = { x: (bl[0].x + bl[1].x) / 2, z: (bl[0].z + bl[1].z) / 2 };
        candidates.push({ wall: w, depth: depthOf(mid) });
    }
    if (candidates.length === 0) return null;

    // (b) keep the band closest to the viewer. `normal` points AWAY from the viewer, so
    // the SMALLEST depth is the nearest façade.
    const nearest = Math.min(...candidates.map((c) => c.depth));
    const facade = candidates.filter((c) => c.depth - nearest <= FACADE_DEPTH_BAND_M);

    return { walls: facade.map((c) => c.wall), depth: nearest };
}
