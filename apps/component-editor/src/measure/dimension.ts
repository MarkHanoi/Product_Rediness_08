// dimension — the family author's MEASUREMENT primitive: a dimension they can
// place, read, and drive the sketch from (lane CE-VIEWS-AND-MEASURE).
//
// ─── WHAT "READS THE TRUE DISTANCE" MEANS, AND WHY IT IS NOT OBVIOUS ─────────
// A dimension drawn on a VERTICAL work plane must report a HEIGHT in
// millimetres, not a screen length. The two are only the same number while the
// projection basis is orthonormal — so the measurement is taken by lifting
// both endpoints back into world space through `unprojectFromView()` and
// measuring THERE (`worldDistanceMm`). That is one extra step, and it is the
// step that makes an elevation dimension a real dimension:
// `__tests__/measure/dimension.test.ts` asserts a point 2400 mm up the front
// elevation measures 2400 mm from the origin, in world Y.
//
// ─── THE DRAFTING STANDARD IS SPEC-AUTODIMENSION §12, NOT A NEW ONE ─────────
// §12.2's three exterior string offsets (1200 / 800 / 400 mm) are the offsets
// a placed dimension snaps to; §12.11 puts dimensions at the THIN end of the
// lineweight hierarchy (`dimensionRender.ts` enforces that against the 1.5 px
// entity weight `sketchRender.ts` already uses); §12.14's lettering lives in
// `annotationTextStandard.ts`. This module invents no second dimension style.
//
// ─── DIVISION OF LABOUR WITH LANE CE-PARAMS-AND-PLANES ──────────────────────
// That lane owns parameter BINDING. This module owns the MEASURE surface, and
// the seam between them is deliberate: `LinearDimension.drivingConstraintId`
// points at a `constraint.addDistance` constraint, and that command's `value`
// is ALREADY declared as `number | string` where a string is a parameter name
// (`commands/constraint/types.ts`). So a dimension driven by a literal today
// becomes a dimension driven by a parameter the moment that lane resolves the
// name — with no change here. No rival dimension-parameter path is created.
//
// LAYER — L0-equivalent: pure. No DOM, no THREE, no rAF, no `(window as any)`.

import type { EntityId } from '../sketch/entities.js';
import type { SketchDocSnapshot } from '../stores/sketchDocStore.js';
import {
  worldDistanceMm,
  type PlanePoint,
  type SketchViewKind,
} from '../views/viewProjection.js';

export type DimensionId = string & { readonly __brand: 'DimensionId' };

/**
 * SPEC-AUTODIMENSION §12.2 — the three continuous exterior strings, ranked
 * outermost→innermost. `null` is an interior dimension (§12.3), which is
 * allowed only where construction genuinely requires it and is placed at the
 * author's own offset.
 */
export type DimensionStringRank = 1 | 2 | 3 | null;

/** §12.2 — offset from the measured geometry, in millimetres, per string. */
export const DIM_STRING_OFFSET_MM: Readonly<Record<1 | 2 | 3, number>> = Object.freeze({
  1: 1200,
  2: 800,
  3: 400,
});

/** §12.3 default for a free-placed interior dimension. */
export const DEFAULT_INTERIOR_OFFSET_MM = 250;

export interface LinearDimension {
  readonly id: DimensionId;
  readonly kind: 'linear';
  /** The work plane this dimension annotates. A dimension belongs to ONE
   *  view — an elevation dimension is meaningless on the plan. */
  readonly view: SketchViewKind;
  readonly p1: EntityId;
  readonly p2: EntityId;
  /** Perpendicular offset of the dimension line from the measured segment (mm). */
  readonly offsetMm: number;
  readonly stringRank: DimensionStringRank;
  /**
   * Id of the `constraint.addDistance` constraint this dimension DRIVES, or
   * `null` for a reporting-only dimension. A driving dimension is the author's
   * handle on the geometry: change its value and the solver moves the sketch.
   */
  readonly drivingConstraintId: string | null;
}

/** Resolve the §12.2 offset for a rank, or the §12.3 interior default. */
export function offsetForRank(rank: DimensionStringRank): number {
  return rank === null ? DEFAULT_INTERIOR_OFFSET_MM : DIM_STRING_OFFSET_MM[rank];
}

export interface MeasuredDimension {
  /** TRUE world distance in millimetres. */
  readonly mm: number;
  /** The two measured points, in work-plane coordinates. */
  readonly a: PlanePoint;
  readonly b: PlanePoint;
}

/**
 * Measure a dimension against a document snapshot.
 *
 * Returns `null` — never `0` — when an endpoint is missing. ⭐ That
 * distinction is the §CONTEXT-DATA-HONESTY rule at the measurement layer: a
 * dimension whose points were deleted has FAILED, and `0 mm` is a legitimate
 * reading for two coincident points. Collapsing the two would make a broken
 * dimension indistinguishable from a valid one, on screen, silently.
 */
export function measureLinearDimension(
  doc: SketchDocSnapshot,
  dim: LinearDimension,
): MeasuredDimension | null {
  const pa = doc.pointById[dim.p1];
  const pb = doc.pointById[dim.p2];
  if (!pa || !pb) return null;
  const a: PlanePoint = { x: pa.x, z: pa.z };
  const b: PlanePoint = { x: pb.x, z: pb.z };
  return { mm: worldDistanceMm(a, b, dim.view), a, b };
}

export interface DimensionGeometry {
  /** The measured segment's endpoints, on the work plane. */
  readonly a: PlanePoint;
  readonly b: PlanePoint;
  /** The offset dimension line's endpoints. */
  readonly lineA: PlanePoint;
  readonly lineB: PlanePoint;
  /** Where the value is lettered — the midpoint of the dimension line. */
  readonly textAt: PlanePoint;
  /** Unit perpendicular the dimension was offset along. */
  readonly normal: PlanePoint;
  /** TRUE world distance, millimetres. */
  readonly mm: number;
}

const DEGENERATE_MM = 1e-9;

/**
 * Full placement geometry for one dimension: witness-line feet, offset
 * dimension line, and the text anchor.
 *
 * Returns `null` for a missing endpoint (see `measureLinearDimension`) and for
 * a DEGENERATE segment — two coincident points have no perpendicular, so there
 * is no direction to offset along. Drawing one anyway would put a dimension
 * line through an undefined normal, which renders as a NaN streak.
 */
export function dimensionGeometry(
  doc: SketchDocSnapshot,
  dim: LinearDimension,
): DimensionGeometry | null {
  const measured = measureLinearDimension(doc, dim);
  if (!measured) return null;
  const { a, b, mm } = measured;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const planeLen = Math.hypot(dx, dz);
  if (planeLen < DEGENERATE_MM) return null;

  // Perpendicular in the work plane, rotated +90° from the segment direction.
  const normal: PlanePoint = { x: -dz / planeLen, z: dx / planeLen };
  const off = dim.offsetMm;
  const lineA: PlanePoint = { x: a.x + normal.x * off, z: a.z + normal.z * off };
  const lineB: PlanePoint = { x: b.x + normal.x * off, z: b.z + normal.z * off };
  return {
    a,
    b,
    lineA,
    lineB,
    textAt: { x: (lineA.x + lineB.x) / 2, z: (lineA.z + lineB.z) / 2 },
    normal,
    mm,
  };
}

/**
 * Format a dimension value for lettering.
 *
 * GA convention: whole millimetres. Sub-millimetre values keep one decimal so
 * a nearly-coincident pair reads as `0.4` rather than collapsing to `0` and
 * looking like a satisfied coincident constraint.
 */
export function formatDimensionValue(mm: number): string {
  if (!Number.isFinite(mm)) return '—';
  if (mm < 1) return mm.toFixed(1);
  return String(Math.round(mm));
}
