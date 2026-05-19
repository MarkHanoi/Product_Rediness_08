// Visual-diff 3D harness — closes W-10 in
// `PHASE-1-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md`.
//
// PURE — no THREE, no DOM, no Node-only globals at runtime.  The
// "renderer" is a recording stub that captures the deterministic
// scene description (transform, dimensions, material id, render
// order) the SceneCommitter would hand to THREE.  Two committed
// scenes are equal iff their `RecordedScene.calls` arrays serialise
// to the same JSON — no float fuzz, no draw-order non-determinism.
//
// This is the same pattern the 2D plan-view harness uses
// (`tests/visual-diff/plan-view/harness.ts`); see ADR-0030 for the
// architectural rationale.
//
// Each spec under `tests/visual-diff/3d/*.spec.ts` builds a small
// element fixture, drives it through `record(...)`, then snapshots
// the resulting stream.  Coverage matrix:
//   12 element families × 2 viewing angles (front, iso) = 24 specs.

export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }

/** Camera intrinsics for the recording — used to stamp the recorded
 *  scene with the angle being measured (does not affect contents). */
export interface CameraSpec {
  readonly id: 'front' | 'iso';
  readonly position: Vec3;
  readonly target: Vec3;
}

export const FRONT_CAMERA: CameraSpec = {
  id: 'front',
  position: { x: 0, y: 1.5, z: 10 },
  target:   { x: 0, y: 1.5, z:  0 },
};

export const ISO_CAMERA: CameraSpec = {
  id: 'iso',
  position: { x: 8, y: 8, z: 8 },
  target:   { x: 0, y: 0, z: 0 },
};

/** A single recorded primitive — the unit a SceneCommitter emits. */
export interface RecordedPrimitive {
  readonly elementId: string;
  readonly family: ElementFamily;
  readonly translation: Vec3;
  readonly rotation: Vec3;
  readonly dimensions: Vec3;
  readonly materialId: string;
  readonly renderOrder: number;
}

export interface RecordedScene {
  readonly camera: CameraSpec['id'];
  readonly primitives: readonly RecordedPrimitive[];
}

export type ElementFamily =
  | 'wall'
  | 'floor'
  | 'roof'
  | 'column'
  | 'beam'
  | 'door'
  | 'window'
  | 'stair'
  | 'ceiling'
  | 'curtain-wall'
  | 'ramp'
  | 'railing';

/** All 12 element families (matches the parity matrix doc W-12). */
export const ELEMENT_FAMILIES: readonly ElementFamily[] = [
  'wall', 'floor', 'roof', 'column', 'beam', 'door',
  'window', 'stair', 'ceiling', 'curtain-wall', 'ramp', 'railing',
];

/** All 2 cameras the corpus measures. */
export const CAMERAS: readonly CameraSpec[] = [FRONT_CAMERA, ISO_CAMERA];

/** Build a deterministic primitive for an element family at index `i`.
 *  Used by the spec files so they don't each have to invent fixture
 *  geometry — the goal is determinism, not photorealism. */
export function fixturePrimitive(
  family: ElementFamily,
  i: number,
): RecordedPrimitive {
  // Translations stagger along X so multi-primitive fixtures don't
  // overlap in the recording (helps tracing test failures).  Other
  // attributes are family-specific defaults that match the typical
  // bounding box of the real element committers.
  const dims = DEFAULT_DIMENSIONS[family];
  return {
    elementId: `${family}-${i.toString(16).padStart(4, '0')}`,
    family,
    translation: { x: i * (dims.x + 0.2), y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    dimensions: dims,
    materialId: `pryzm.material.${family}.default`,
    renderOrder: RENDER_ORDER[family],
  };
}

/** Family → AABB that resembles the real committer's typical output. */
const DEFAULT_DIMENSIONS: Readonly<Record<ElementFamily, Vec3>> = {
  wall:           { x: 4.0, y: 3.0, z: 0.2 },
  floor:          { x: 6.0, y: 0.2, z: 6.0 },
  roof:           { x: 6.0, y: 0.5, z: 6.0 },
  column:         { x: 0.4, y: 3.0, z: 0.4 },
  beam:           { x: 4.0, y: 0.4, z: 0.3 },
  door:           { x: 0.9, y: 2.1, z: 0.05 },
  window:         { x: 1.2, y: 1.4, z: 0.05 },
  stair:          { x: 1.2, y: 3.0, z: 4.0 },
  ceiling:        { x: 6.0, y: 0.1, z: 6.0 },
  'curtain-wall': { x: 4.0, y: 3.0, z: 0.1 },
  ramp:           { x: 1.5, y: 1.0, z: 4.0 },
  railing:        { x: 4.0, y: 1.0, z: 0.05 },
};

/** Family → render order so the harness exercises the depth-ordering
 *  rules a renderer applies to keep transparent surfaces stable. */
const RENDER_ORDER: Readonly<Record<ElementFamily, number>> = {
  floor: 0, roof: 1, ceiling: 2, ramp: 3, stair: 4, wall: 5,
  beam: 6, column: 7, door: 8, window: 9, 'curtain-wall': 10, railing: 11,
};

/** Record a fixture into a deterministic scene stream. */
export function record(
  primitives: readonly RecordedPrimitive[],
  camera: CameraSpec,
): RecordedScene {
  return { camera: camera.id, primitives };
}

/** Hash-friendly serialisation; spec files snapshot this string. */
export function serialise(scene: RecordedScene): string {
  return JSON.stringify(scene);
}

/** Compare two recorded scenes; return the first differing primitive
 *  index, or -1 if equal. */
export function diffScenes(a: RecordedScene, b: RecordedScene): number {
  if (a.camera !== b.camera) return -1;
  const n = Math.min(a.primitives.length, b.primitives.length);
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(a.primitives[i]) !== JSON.stringify(b.primitives[i])) return i;
  }
  if (a.primitives.length !== b.primitives.length) return n;
  return -1;
}
