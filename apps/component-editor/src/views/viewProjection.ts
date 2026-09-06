// viewProjection — the PLAN / ELEVATION projection basis for the Family
// Creator (lane CE-VIEWS-AND-MEASURE).
//
// ─── WHY THIS EXISTS RATHER THAN `packages/view-state` ───────────────────────
// The lane brief required reuse over rebuild. `packages/view-state` was read
// first and CANNOT serve this surface, for three measured reasons:
//
//   1. IT CANNOT EXPRESS THESE VIEWS. `view-state/src/ViewDefinition.ts:25`
//      is `ViewKindEnum = z.enum(['3d-perspective', '3d-orthographic'])`, and
//      its own header says *"'plan' / 'section' kinds land in 2A / 2B"*. A
//      plan view and an elevation view are exactly the two kinds it does not
//      have. Forking it would not be reuse either — it would be a rival.
//   2. IT REQUIRES A RENDERER. `view-state/src/ViewController.ts:29` imports
//      `CameraController` from `@pryzm/renderer` (L4) and `FrameScheduler`
//      and `ActiveViewStore`. ADR-0316 blesses this app's second composition
//      root *"no project, no site, no collaboration, NO RENDERER"* and says
//      explicitly: if you are here to add a renderer, the ADR no longer
//      applies. `__tests__/app/secondCompositionRoot.invariants.test.ts`
//      lists `@pryzm/renderer` in FORBIDDEN_IMPORTS — importing it is a
//      test failure, by design.
//   3. TAKING THE DEP IS NOT AVAILABLE TO THIS LANE. It would require editing
//      `apps/component-editor/package.json`, which the fleet rules forbid.
//
// `apps/editor/src/engine/ViewController.ts` is worse on every axis: it is an
// L7 file in a DIFFERENT app (a sideways L7→L7 import the layer model
// forbids) and its line 1 is `import * as THREE from
// '@pryzm/renderer-three/three'`, which the `family-editor-no-three-leak`
// gate holds at ZERO files for this package.
//
// ─── WHAT A VIEW IS HERE ─────────────────────────────────────────────────────
// In a family editor a view is NOT a camera — it is a WORK PLANE. The author
// sketches on it. So a view is fully described by an orthonormal world basis:
//
//   right — the world direction that runs LEFT→RIGHT across the screen
//   up    — the world direction that runs BOTTOM→TOP up the screen
//
// and the sketch-plane coordinates the existing `sketch/transform.ts` already
// uses, `(x, z)` in millimetres, where +x is screen-right and +z is
// screen-DOWN (that file: *"No sign flip on Z — the sketcher's 'looking down
// at the floor' view treats +Z as towards the bottom of the screen"*).
//
// Hence screen-down `v = -up`, and:
//
//   project(P)   → { x: P·right,  z: -(P·up) }
//   unproject(s) → right*s.x - up*s.z
//
// PLAN is chosen so that it reproduces `transform.ts` EXACTLY — world +X to
// the right, world +Z down the screen — which is what makes this module an
// extension of the existing sketcher rather than a second one. That identity
// is asserted, not asserted-by-comment: see `__tests__/views/viewProjection.test.ts`,
// "PLAN reproduces the legacy transform.ts convention exactly".
//
// LAYER — L0-equivalent: pure math. No THREE, no DOM, no rAF, no
// `(window as any)`. Every export is a total function of its arguments.

/** A world-space vector in millimetres (the sketcher's unit — see `entities.ts`). */
export interface WorldVec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A point on the active work plane, in the `(x, z)` millimetre convention
 *  that `sketch/transform.ts` and `sketch/entities.ts` already speak. */
export interface PlanePoint {
  readonly x: number;
  readonly z: number;
}

/**
 * The three views a family author works in.
 *
 * `'plan'` is the horizontal work plane (looking down −Y) — the view the
 * sketcher has always been in. The two elevations are VERTICAL work planes,
 * which is what makes a family 3D rather than an extruded plan.
 */
export type SketchViewKind = 'plan' | 'elevation-front' | 'elevation-side';

export const SKETCH_VIEW_KINDS: readonly SketchViewKind[] = Object.freeze([
  'plan',
  'elevation-front',
  'elevation-side',
]);

export interface ViewBasis {
  readonly kind: SketchViewKind;
  /** Author-visible label for the view bar. */
  readonly label: string;
  /** World direction that runs left→right across the screen. Unit. */
  readonly right: WorldVec3;
  /** World direction that runs bottom→top up the screen. Unit. */
  readonly up: WorldVec3;
  /** Direction the author looks along (into the screen). Unit. `up × right`. */
  readonly viewDir: WorldVec3;
  /**
   * True when the work plane is VERTICAL — i.e. the screen's vertical axis
   * is world Y, so a dimension drawn vertically reads as a HEIGHT. This is
   * the property that distinguishes an elevation from a plan; measurement
   * and the HUD both key on it rather than on the kind string.
   */
  readonly isVertical: boolean;
  /** Axis letters for the HUD, in screen order: [horizontal, vertical]. */
  readonly axisLabels: readonly [string, string];
}

/**
 * Canonicalise NEGATIVE ZERO to `+0`.
 *
 * ⭐ Not cosmetic. `-dot(world, up)` produces `-0` whenever the dot product is
 * zero — which is the COMMON case, since it is exactly what an on-axis point
 * gives. `-0 === 0` is true, but `Object.is(-0, 0)` is false, so a `-0`
 * silently breaks deep-equality on any snapshot that carries a coordinate, and
 * more seriously `Math.atan2(0, -0)` is `π` where `Math.atan2(0, 0)` is `0`.
 * `measure/dimensionRender.letterValue()` decides from an `atan2` whether a
 * dimension value is drawn upside-down, so an unnormalised `-0` flips
 * annotation text through 180° for exactly the axis-aligned dimensions an
 * author draws most. Normalising here keeps every projection output canonical.
 */
function z0(n: number): number {
  return n === 0 ? 0 : n;
}

function vec(x: number, y: number, z: number): WorldVec3 {
  return Object.freeze({ x: z0(x), y: z0(y), z: z0(z) });
}

/** `a × b`. Exported for the spec, which proves each basis is right-handed. */
export function cross(a: WorldVec3, b: WorldVec3): WorldVec3 {
  return vec(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

/** `a · b`. */
export function dot(a: WorldVec3, b: WorldVec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function basis(
  kind: SketchViewKind,
  label: string,
  right: WorldVec3,
  up: WorldVec3,
  axisLabels: readonly [string, string],
): ViewBasis {
  return Object.freeze({
    kind,
    label,
    right,
    up,
    // The author looks INTO the screen. With `right` and `up` as the screen
    // axes of a right-handed world, that direction is `up × right`.
    viewDir: cross(up, right),
    isVertical: Math.abs(up.y) > 0.5,
    axisLabels,
  });
}

/**
 * The three bases. World convention matches the rest of the kernel: Y is UP,
 * the XZ plane is the floor (see `sketch/entities.ts`: *"XZ plane in
 * millimetres. +X right, +Z away from the viewer when looking down the
 * world-Y axis"*).
 *
 *   plan            right=+X  up=−Z   → looking down −Y  (north-up site plan)
 *   elevation-front right=+X  up=+Y   → looking along −Z (author stands at +Z)
 *   elevation-side  right=−Z  up=+Y   → looking along −X (author stands at +X)
 *
 * Both elevations put world +Y up the screen, so a height is a height in
 * either of them. `elevation-side`'s `right` is −Z, not +Z, because an author
 * standing at +X and looking toward the origin has world −Z on their right;
 * getting that sign wrong mirrors the model, which is the classic elevation bug.
 */
const BASES: Readonly<Record<SketchViewKind, ViewBasis>> = Object.freeze({
  plan: basis('plan', 'Plan', vec(1, 0, 0), vec(0, 0, -1), ['X', 'Z']),
  'elevation-front': basis('elevation-front', 'Front', vec(1, 0, 0), vec(0, 1, 0), ['X', 'Y']),
  'elevation-side': basis('elevation-side', 'Side', vec(0, 0, -1), vec(0, 1, 0), ['Z', 'Y']),
});

/** Look up a view's basis. Throws on an unknown kind rather than defaulting —
 *  silently falling back to plan would draw an elevation as a floor plan. */
export function viewBasis(kind: SketchViewKind): ViewBasis {
  const b = BASES[kind];
  if (!b) throw new Error(`viewBasis: unknown view kind "${kind}".`);
  return b;
}

export function isSketchViewKind(value: unknown): value is SketchViewKind {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(BASES, value);
}

/**
 * World (mm) → work-plane `(x, z)` (mm). The out-of-plane component is
 * DISCARDED — that is what a projection is, and it is why `unproject` is not
 * a two-sided inverse. `project(unproject(s)) === s` always; the reverse holds
 * only for points already on the plane.
 */
export function projectToView(world: WorldVec3, kind: SketchViewKind): PlanePoint {
  const b = viewBasis(kind);
  return { x: z0(dot(world, b.right)), z: z0(-dot(world, b.up)) };
}

/** Work-plane `(x, z)` (mm) → world (mm), on the plane through the origin. */
export function unprojectFromView(plane: PlanePoint, kind: SketchViewKind): WorldVec3 {
  const b = viewBasis(kind);
  return vec(
    b.right.x * plane.x - b.up.x * plane.z,
    b.right.y * plane.x - b.up.y * plane.z,
    b.right.z * plane.x - b.up.z * plane.z,
  );
}

/**
 * The TRUE world distance between two points of the SAME work plane.
 *
 * Because the basis is orthonormal, this equals the plane-local distance —
 * and that equality is the whole point: it is the proof that a dimension read
 * off an elevation is a real height in millimetres and not a screen length.
 * `__tests__/measure/dimension.test.ts` asserts the two agree in all three
 * views, so a future non-orthonormal basis (a skewed or scaled work plane)
 * breaks the test rather than silently reporting wrong dimensions.
 */
export function worldDistanceMm(a: PlanePoint, b: PlanePoint, kind: SketchViewKind): number {
  const wa = unprojectFromView(a, kind);
  const wb = unprojectFromView(b, kind);
  return Math.hypot(wb.x - wa.x, wb.y - wa.y, wb.z - wa.z);
}
