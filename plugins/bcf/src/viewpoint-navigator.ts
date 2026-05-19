/**
 * BCF viewpoint navigator — converts a `BCFViewpoint` into a camera target
 * suitable for the editor's camera-controls store.
 *
 * Phase 3-B Sprint S60 D1–D2 — closes the S59 carry item
 * "BCF viewpoint *camera-restore* glue in `apps/3d-view-app`" recorded in
 * `apps/bench/reports/M30-3B.md` §3.2.
 *
 * The module is intentionally framework-free — no THREE, no React, no DOM —
 * so the bake-worker can sanity-check viewpoints server-side and the editor
 * can apply them client-side from the same import. Vector maths is hand-rolled
 * against pure `[x, y, z]` triples so no math library appears in the
 * dependency closure.
 */

import type { BCFViewpoint, BCFViewpointPosition } from './types.js';

export interface Vec3Tuple {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface PerspectiveCameraTarget {
  readonly kind: 'perspective';
  readonly position: Vec3Tuple;
  /** Forward direction (unit vector). */
  readonly direction: Vec3Tuple;
  /** Up vector (unit, orthogonal to direction). */
  readonly up: Vec3Tuple;
  /**
   * A focus point along the direction at the requested target distance.
   * Camera-controls libraries (orbit / map controls) typically prefer a
   * `target` over a `direction`; this is the value to feed into them.
   */
  readonly target: Vec3Tuple;
  /** Vertical field-of-view in **radians** (BCF stores it in degrees). */
  readonly fovRad: number;
  /** Vertical field-of-view in degrees as authored — exposed for round-trip. */
  readonly fovDeg: number;
  /** Distance from `position` to `target` in metres. */
  readonly targetDistance: number;
}

export interface OrthogonalCameraTarget {
  readonly kind: 'orthogonal';
  readonly position: Vec3Tuple;
  readonly direction: Vec3Tuple;
  readonly up: Vec3Tuple;
  readonly target: Vec3Tuple;
  /**
   * BCF orthogonal camera scale: world units that fit into the viewport
   * height. Editor maps this to the camera's `zoom` or `top/bottom`
   * frustum bounds.
   */
  readonly viewToWorldScale: number;
  readonly targetDistance: number;
}

export type CameraTarget = PerspectiveCameraTarget | OrthogonalCameraTarget;

export interface NavigatorOptions {
  /**
   * Target distance applied when projecting the viewpoint's `direction`
   * to a focus point. Defaults to 10 metres — the same conventional
   * placeholder Solibri uses when no model bounding-sphere is supplied.
   */
  readonly targetDistance?: number;
}

const DEFAULT_TARGET_DISTANCE_M = 10;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Compute the camera target for a viewpoint. Returns `null` when the
 * viewpoint has no `position` block — pure-comments topics legitimately
 * carry viewpoints with only a snapshot, and the navigator must not
 * synthesise camera state from nothing.
 */
export function viewpointToCameraTarget(
  viewpoint: BCFViewpoint,
  opts: NavigatorOptions = {},
): CameraTarget | null {
  const position = viewpoint.position;
  if (!position) return null;
  return positionToCameraTarget(position, opts);
}

/**
 * Helper version that takes the `BCFViewpointPosition` directly. Useful
 * for tests + for callers that have already deconstructed the viewpoint.
 */
export function positionToCameraTarget(
  position: BCFViewpointPosition,
  opts: NavigatorOptions = {},
): CameraTarget {
  const distance = opts.targetDistance ?? DEFAULT_TARGET_DISTANCE_M;
  if (!isFinite(distance) || distance <= 0) {
    throw new Error(`viewpoint-navigator: targetDistance must be a positive number, got ${distance}`);
  }
  const direction = normalise(position.cameraDirection);
  const up = orthogonalUp(direction, position.cameraUpVector);
  const target = add(position.cameraViewPoint, scale(direction, distance));

  if (position.cameraType === 'perspective') {
    const fovDeg = position.fieldOfView ?? 60;
    return {
      kind: 'perspective',
      position: vec3(position.cameraViewPoint),
      direction,
      up,
      target,
      fovRad: fovDeg * DEG_TO_RAD,
      fovDeg,
      targetDistance: distance,
    };
  }
  return {
    kind: 'orthogonal',
    position: vec3(position.cameraViewPoint),
    direction,
    up,
    target,
    viewToWorldScale: position.viewToWorldScale ?? 1,
    targetDistance: distance,
  };
}

/**
 * Resolve a viewpoint by GUID lookup so call sites can write
 * `navigateToViewpoint(topic, vpGuid)` without scanning the array.
 */
export function selectViewpointByGuid(
  viewpoints: readonly BCFViewpoint[],
  guid: string,
): BCFViewpoint | null {
  return viewpoints.find(vp => vp.guid === guid) ?? null;
}

/**
 * Pure projection — given an arbitrary target distance, compute the
 * focus point at that distance along the viewpoint's direction.
 * Useful for the editor when it knows the model's bounding-sphere
 * radius and wants to fit the camera to it instead of the default
 * 10 m placeholder.
 */
export function focusPointAtDistance(
  position: BCFViewpointPosition,
  distance: number,
): Vec3Tuple {
  if (!isFinite(distance) || distance <= 0) {
    throw new Error(`viewpoint-navigator: distance must be a positive number, got ${distance}`);
  }
  return add(position.cameraViewPoint, scale(normalise(position.cameraDirection), distance));
}

// --- vector primitives ---------------------------------------------------

function vec3(v: Vec3Tuple): Vec3Tuple {
  return { x: v.x, y: v.y, z: v.z };
}

function add(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function sub(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(v: Vec3Tuple, s: number): Vec3Tuple {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function dot(a: Vec3Tuple, b: Vec3Tuple): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(v: Vec3Tuple): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

function normalise(v: Vec3Tuple): Vec3Tuple {
  const len = length(v);
  if (len === 0) {
    throw new Error('viewpoint-navigator: cannot normalise a zero-length vector');
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

/**
 * Build an "up" vector that is guaranteed orthogonal to `direction` even
 * when the BCF authoring tool emitted a non-orthogonal pair (which
 * Solibri occasionally does after a free orbit). Uses the standard
 * Gram–Schmidt orthogonalisation.
 */
function orthogonalUp(direction: Vec3Tuple, upHint: Vec3Tuple): Vec3Tuple {
  const upLen = length(upHint);
  const fallback: Vec3Tuple = Math.abs(direction.z) > 0.99
    ? { x: 0, y: 1, z: 0 }
    : { x: 0, y: 0, z: 1 };
  const seed = upLen === 0 ? fallback : upHint;
  // Project `seed` onto the plane orthogonal to `direction`.
  const projected = sub(seed, scale(direction, dot(seed, direction)));
  const projectedLen = length(projected);
  if (projectedLen === 0) {
    // Seed was parallel to direction. Try the fallback.
    const projectedFallback = sub(fallback, scale(direction, dot(fallback, direction)));
    return normalise(projectedFallback);
  }
  return { x: projected.x / projectedLen, y: projected.y / projectedLen, z: projected.z / projectedLen };
}
