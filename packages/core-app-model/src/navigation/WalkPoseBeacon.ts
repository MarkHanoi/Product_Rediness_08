/**
 * @file WalkPoseBeacon — where the walking user currently is, published once.
 *
 * §WALK-POSITION-ON-PLAN.  The founder walks the model in the 3-D pane of split
 * view and wants to see himself on the plan in the other pane: "a point, purple
 * (PRYZM colour), following along".
 *
 * ── WHY A MODULE-LEVEL BEACON AND NOT A SECOND OVERLAY ───────────────────────
 * The writer (`FirstPersonController`) and the reader (`PlanViewCanvas`) are two
 * classes in this package with no reference to each other, and the app layer
 * constructs them independently.  The alternatives were both worse:
 *
 *   • A new overlay compositor beside `SvpPlanToolOverlay` / `PlanViewToolOverlay`
 *     — a THIRD painter of the same pixels.  That is this repo's dominant defect
 *     shape ("same rule, two implementations"), and it is what makes a fix land
 *     on the surface the user is not looking at.
 *   • A second `requestAnimationFrame` — forbidden outright by P3, which pins the
 *     one rAF owner to `packages/frame-scheduler/src/RafAdapter.ts`.
 *
 * Neither is needed.  `PlanViewCanvas` already repaints BOTH panes at 30 fps off
 * the existing frame bus, and it already draws transient state this exact way
 * (see `_drawSnapIndicator`).  So the marker costs no new loop, no new listener
 * and no new surface: one scalar written by the walker, read by the painter that
 * was going to run anyway.
 *
 * ── WHY THE POSE CARRIES A DIRECTION AND NOT A YAW ───────────────────────────
 * A bare dot cannot tell the founder which way he is facing, and the plan already
 * carries a north arrow — an orientationless dot beside it is ambiguous.  The
 * pose therefore ships a world-space XZ direction rather than the controller's
 * yaw, so the plan renderer never has to know `FirstPersonController`'s Euler
 * convention (YXZ, −Z forward).  Two conventions for one heading is the same
 * two-implementations trap in miniature.
 *
 * ── WHY `levelId` IS ON THE POSE ─────────────────────────────────────────────
 * The plan draws ONE storey.  Rendering the walker on a plan of a floor he is not
 * standing on, with no distinction, would state something false.  The id travels
 * with the pose so the renderer can compare and say which case it is drawing.
 * `null` means "could not be resolved" — it is NOT a synonym for the ground floor.
 */

/** The walking user's pose, in world metres. */
export interface WalkPose {
    /** Eye position, world X. */
    readonly x: number;
    /** Eye position, world Y (elevation). */
    readonly y: number;
    /** Eye position, world Z. */
    readonly z: number;
    /** Unit view direction projected onto XZ (world). Height component dropped. */
    readonly dirX: number;
    /** Unit view direction projected onto XZ (world). Height component dropped. */
    readonly dirZ: number;
    /** Id of the level the walker is standing on; `null` when unresolved. */
    readonly levelId: string | null;
}

let _pose: WalkPose | null = null;

/**
 * Publish the walker's pose, or `null` to retract it.
 *
 * Called by `FirstPersonController` from `_applyPose()` — the one place that
 * already runs on every movement frame AND on every mouse-look delta, so the
 * beacon can never be a frame behind the camera it describes.
 */
export function publishWalkPose(pose: WalkPose | null): void {
    _pose = pose;
}

/**
 * The walker's current pose, or `null` when nobody is walking.
 *
 * `null` is the honest answer for "walk mode is off" AND is what every consumer
 * must render as "draw nothing" — never as a pose at the origin.
 */
export function readWalkPose(): WalkPose | null {
    return _pose;
}
