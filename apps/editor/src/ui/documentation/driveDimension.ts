// §FIX-DIMENSION-DRIVES-MODEL (L-291b, ADR-122 ACCEPTED — OPTION A) — AN EDITED DIMENSION
// MOVES THE BUILDING.
//
// ─────────────────────────────────────────────────────────────────────────────
// THE RULE THIS SERVES
// ─────────────────────────────────────────────────────────────────────────────
//   AN EDITED ANNOTATION WRITES TO THE MODEL. NEVER TO THE DRAWING.
//   The drawing can never lie about the model, because it is only ever a READOUT of it.
//
// Type 3200 on a wall dimension and THE WALL MOVES TO 3200. The dimension then reads 3200
// because the MODEL SAYS SO — not because anyone wrote 3200 into a label. There is no
// override field, and there must never be one (ADR-122 rejects it explicitly).
//
// ─────────────────────────────────────────────────────────────────────────────
// WHICH ELEMENT MOVES — DECIDED, NOT GUESSED
// ─────────────────────────────────────────────────────────────────────────────
// A dimension references TWO things (L-287), so one typed number is UNDER-DETERMINED: move
// the left wall, or the right one? The product must answer this the same way every time,
// because a user who cannot predict which wall moves will not use the feature twice.
//
//   1. If the user has an element SELECTED and the dimension references it → THAT moves.
//      (This is the founder's own mental model: "select the wall, then set the distance".)
//   2. Otherwise → the SECOND reference (the "to" end) moves, and the FIRST (the "from" end)
//      is held. A dimension is read left-to-right / from-to; the thing after the "to" is the
//      thing that gives.
//   3. If neither end is a movable wall → THE EDIT FAILS, LOUDLY. It does not pick something
//      arbitrary, and it does not silently do nothing.
//
// ─────────────────────────────────────────────────────────────────────────────
// IT IS NOT A NEW MUTATION PATH
// ─────────────────────────────────────────────────────────────────────────────
// The drive dispatches `wall.updateBaseline` — THE SAME command the wall DRAG dispatches
// (PlanElementDragController, MovePlanToolHandler, the 3D gizmo). So junction re-solve,
// hosted-opening re-anchoring, rebuild-with-voids and undo routing all behave EXACTLY as
// they do when the user drags that wall. ADR-122's stated risk — "a half-built drive is far
// worse than none" — is closed by having no second path to half-build. If a drag corners
// correctly, so does this; if it does not, that is one bug in one place.
//
// PURE core (`resolveDimensionDrive`): no stores, no bus, no DOM. The whole "which element
// moves, by how much, and why not" decision is testable without a runtime — which is the only
// way a rule this consequential can be trusted.

import type { AnnotationElement } from '@pryzm/plugin-annotations';

export interface Vec3Like { x: number; y: number; z: number }

/** The wall fields the drive reads. Structural — mirrors the live store record. */
export interface DriveWallLike {
  readonly id: string;
  readonly baseLine?: readonly [Vec3Like, Vec3Like];
  /** A locked element must not be moved by a drawing edit — it must SAY it is locked. */
  readonly locked?: boolean;
  readonly properties?: { readonly locked?: boolean } | null;
}

/** Why a drive could not be performed. Every one of these MUST reach the user (P8). */
export type DriveFailure =
  /** The dimension is anchored to baked points, not elements — it measures nothing it can move. */
  | 'not-associative'
  /** Neither end of the dimension is a wall that exists in the model. */
  | 'no-movable-reference'
  /** The element the rule selected is locked. */
  | 'locked'
  /** The dimension has no usable measurement axis (degenerate geometry). */
  | 'degenerate'
  /** The typed value is not a positive distance. */
  | 'invalid-value';

export interface DriveResolution {
  readonly ok: true;
  /** The wall the RULE chose to move — stated, so the UI can name it before it moves. */
  readonly wallId: string;
  /** Which reference index moved (0 = the "from" end, 1 = the "to" end). */
  readonly refIndex: number;
  /** Signed metres the wall travels along the measurement axis. */
  readonly deltaM: number;
  /** The current measured distance, metres (derived — never read from a label). */
  readonly currentM: number;
  /** The wall's new baseline. Both endpoints translate: this is a MOVE, exactly as a drag is. */
  readonly newBaseLine: readonly [Vec3Like, Vec3Like];
  readonly prevBaseLine: readonly [Vec3Like, Vec3Like];
}

export interface DriveRejection {
  readonly ok: false;
  readonly failure: DriveFailure;
  /** A sentence the USER reads. Never a console line they never see (the L-214/218/220 class). */
  readonly message: string;
}

export type DriveResult = DriveResolution | DriveRejection;

const EPS = 1e-6;

/** The measurement axis in world XZ — the direction the dimension actually measures along. */
function measurementAxis(ann: AnnotationElement): { x: number; z: number } | null {
  const mn = ann.geometry2D.measurementNormal;
  let dx: number;
  let dz: number;
  if (mn && (Math.abs(mn.x) > EPS || Math.abs(mn.z) > EPS)) {
    dx = mn.x; dz = mn.z;
  } else {
    const [p, q] = ann.geometry2D.modelPoints ?? [];
    if (!p || !q) return null;
    dx = q.x - p.x; dz = q.z - p.z;
  }
  const len = Math.hypot(dx, dz);
  if (len < EPS) return null;
  return { x: dx / len, z: dz / len };
}

/** The distance the dimension currently MEASURES — derived from its points, never a label. */
export function measuredDistanceM(ann: AnnotationElement): number | null {
  const [p, q] = ann.geometry2D.modelPoints ?? [];
  if (!p || !q) return null;
  const axis = measurementAxis(ann);
  if (!axis) return null;
  // Along the measurement axis (an ortho dim measures the AXIS extent, not the diagonal —
  // §FIX-AUTODIM-ORTHO-COMPLETE-CHAINS). Read the same number the renderer prints.
  return Math.abs((q.x - p.x) * axis.x + (q.z - p.z) * axis.z);
}

function isLocked(wall: DriveWallLike): boolean {
  return wall.locked === true || wall.properties?.locked === true;
}

/**
 * Resolve a typed value into "which wall moves, and by how much" — or into a REASON it
 * cannot be done. PURE.
 *
 * `targetM` is what the user typed, in metres. It never touches the annotation: the drawing
 * is not edited, the model is.
 */
export function resolveDimensionDrive(
  ann: AnnotationElement,
  targetM: number,
  deps: {
    readonly selectedElementId?: string | null;
    readonly getWall: (id: string) => DriveWallLike | undefined;
  },
): DriveResult {
  if (!Number.isFinite(targetM) || targetM <= 0) {
    return { ok: false, failure: 'invalid-value', message: 'Enter a positive distance.' };
  }

  const refs = ann.references ?? [];
  // §L-287 — a dimension anchored to BAKED POINTS measures nothing it can move. Say so; do
  // not quietly do nothing, and emphatically do not fall back to editing the text.
  const elementRefs = refs.filter((r) => r.elementType !== 'point');
  if (elementRefs.length === 0) {
    return {
      ok: false,
      failure: 'not-associative',
      message: 'This dimension is not linked to any element, so it cannot move one. Re-run Auto-Dimension to re-anchor it.',
    };
  }

  const axis = measurementAxis(ann);
  const currentM = measuredDistanceM(ann);
  if (!axis || currentM === null) {
    return { ok: false, failure: 'degenerate', message: 'This dimension has no measurable direction.' };
  }

  // ── THE RULE (stated above): the user's selection wins; otherwise the "to" end moves.
  const candidates = refs
    .map((r, i) => ({ ref: r, index: i, wall: r.elementType === 'wall' ? deps.getWall(r.elementId) : undefined }))
    .filter((c): c is { ref: typeof refs[number]; index: number; wall: DriveWallLike } => !!c.wall?.baseLine);

  if (candidates.length === 0) {
    return {
      ok: false,
      failure: 'no-movable-reference',
      message: 'Neither end of this dimension is a wall that can be moved.',
    };
  }

  const chosen =
    candidates.find((c) => c.ref.elementId === deps.selectedElementId)
    ?? candidates.find((c) => c.index === refs.length - 1)   // the "to" end
    ?? candidates[candidates.length - 1]!;

  if (isLocked(chosen.wall)) {
    return {
      ok: false,
      failure: 'locked',
      message: `Wall ${chosen.wall.id.slice(0, 8)} is locked — unlock it to drive this dimension.`,
    };
  }

  // ── The move. Both endpoints translate, exactly as a wall DRAG translates them; junctions
  //    re-solve downstream because it is the same command.
  const deltaM = targetM - currentM;
  // The "from" end moving must shorten where the "to" end moving lengthens — the sign is the
  // rule's, not the axis's.
  const sign = chosen.index === refs.length - 1 ? 1 : -1;
  const moveX = sign * deltaM * axis.x;
  const moveZ = sign * deltaM * axis.z;

  const bl = chosen.wall.baseLine!;
  return {
    ok: true,
    wallId: chosen.wall.id,
    refIndex: chosen.index,
    deltaM,
    currentM,
    prevBaseLine: [{ ...bl[0] }, { ...bl[1] }],
    newBaseLine: [
      { x: bl[0].x + moveX, y: bl[0].y, z: bl[0].z + moveZ },
      { x: bl[1].x + moveX, y: bl[1].y, z: bl[1].z + moveZ },
    ],
  };
}
