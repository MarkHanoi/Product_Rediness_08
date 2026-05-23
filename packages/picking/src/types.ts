// @pryzm/picking — public types.  Frozen S16 D1 (ADR-0015 §"Decision").
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S16 typed contracts
// (lines 638-700).
//
// Two strategies (`gpu-pick`, `bvh-pick`) implement the SAME `PickStrategy`
// interface so the resolver can swap them without touching call sites.  All
// THREE imports are `import type` to keep this file usable from headless code
// paths (the strategies themselves do touch THREE at runtime — they live
// behind the `THREE`-allowlisted L5 boundary).

import type * as THREE from '@pryzm/renderer-three/three';

/** L1 stable identity for a scene element.  Mirrors `@pryzm/scene-committer`'s
 *  `ElementId`.  Not branded here — the brand is enforced upstream. */
export type ElementId = string;

/** What KIND of element the id refers to.  Mirrors `SelectionKind` in
 *  `@pryzm/stores` so call sites can map both surfaces 1:1.  17 entries:
 *  the 12 Phase-1 families + 5 Phase-2 families (`room`, `furniture`,
 *  `annotation`, `dimension`, `opening`). */
export type ElementKind =
  | 'wall'
  | 'slab'
  | 'door'
  | 'window'
  | 'roof'
  | 'curtainWall'
  | 'grid'
  | 'column'
  | 'beam'
  | 'stair'
  | 'handrail'
  | 'ceiling'
  | 'room'
  | 'furniture'
  | 'annotation'
  | 'dimension'
  | 'opening';

export interface Point2D {
  readonly x: number;
  readonly y: number;
}

export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Result of a single pick.  `faceIndex` is populated by BVH (it falls out
 *  of the raycast); gpu-pick can populate it via a second MRT slot — that
 *  optimisation lands when downstream tooling needs face-resolution. */
export interface PickResult {
  readonly elementId: ElementId;
  readonly elementKind: ElementKind;
  readonly hitPoint: Point3D;
  /** Camera → hit distance in scene units (metres).  For ordering
   *  disambig: gpu-pick = depth from RT; BVH = ray-t. */
  readonly distance: number;
  readonly faceIndex?: number;
}

export type PickStrategyId = 'gpu-pick' | 'bvh-pick';

/** Outcome of a strategy probe.  `ok=false` enters the resolver's fallback
 *  branch and emits `pryzm.picking.gpu-pick.unavailable`.
 *
 *  MEDIUM-2 fix: added `error` field for structured exception reporting.
 *  When `probeAvailability` catches a thrown Error it populates both
 *  `reason` (string summary, for OTel event attributes) and `error`
 *  (original Error object, for `span.recordException`). */
export interface PickProbeResult {
  readonly ok: boolean;
  /** Human-readable failure summary.  Always set when `ok=false`. */
  readonly reason?: string;
  /** Original exception, if the probe threw.  Populated alongside `reason`
   *  so callers can call `span.recordException(result.error)`. */
  readonly error?: Error;
}

/** The element-side surface the picker reads.  Implemented by the host
 *  app using `SceneRegistry` + a kind lookup.  Kept narrow so tests can
 *  fake it without spinning up a full committer host. */
export interface ElementRegistry {
  /** Element kind for an id, or `null` if unknown. */
  kindOf(id: ElementId): ElementKind | null;
  /** All currently-pickable element ids. */
  ids(): readonly ElementId[];
  /** Bound THREE object (or `null` if not yet committed).  `gpu-pick`
   *  needs this to assign per-id `userData.elementId`; `bvh-pick`
   *  needs the geometry to wrap with `MeshBVH`. */
  objectFor(id: ElementId): THREE.Object3D | null;
  /** Optional descriptor hash — used by BVH cache invalidation.  When
   *  absent, BVH treats every pick as a cache miss (slow but correct). */
  descriptorHashOf?(id: ElementId): string | null;
}

/** Minimal renderer surface gpu-pick depends on.  Real impl wraps
 *  `THREE.WebGLRenderer`; tests substitute a `FakePickRenderer` that
 *  records calls + writes a deterministic pixel buffer. */
export interface GpuPickRenderer {
  /** CSS pixels — matches viewportWidth/viewportHeight in PickContext.
   *  Must NOT be physical (devicePixel) pixels; the NDC ↔ screen mapping in
   *  gpu-pick assumes CSS-pixel coordinates consistent with getBoundingClientRect(). */
  readonly width: number;
  /** CSS pixels — matches viewportWidth/viewportHeight in PickContext.
   *  Must NOT be physical (devicePixel) pixels; the NDC ↔ screen mapping in
   *  gpu-pick assumes CSS-pixel coordinates consistent with getBoundingClientRect(). */
  readonly height: number;
  /** Render `scene` into `target` from `camera`, optionally with
   *  every Mesh's material overridden by `override`. */
  renderToTarget(
    scene: THREE.Scene,
    camera: THREE.Camera,
    target: THREE.WebGLRenderTarget,
    override: THREE.Material | null,
  ): void;
  /** Read an `(x, y, w, h)` pixel block out of `target` into `buffer`.
   *  Mirrors `WebGLRenderer.readRenderTargetPixels`. */
  readPixels(
    target: THREE.WebGLRenderTarget,
    x: number,
    y: number,
    w: number,
    h: number,
    buffer: Uint8Array,
  ): void;
  /** Allocate / reallocate a render target.  Tests return a fake. */
  createRenderTarget(width: number, height: number): THREE.WebGLRenderTarget;
}

export interface PickContext {
  readonly camera: THREE.Camera;
  readonly elementRegistry: ElementRegistry;
  /** Viewport pixels — used by both strategies for screen ↔ NDC. */
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  /** Required for gpu-pick.  bvh-pick uses the registry directly. */
  readonly scene?: THREE.Scene;
  /** Required for gpu-pick.  bvh-pick ignores. */
  readonly renderer?: GpuPickRenderer;
}

/** The single contract every pick implementation honours. */
/** Per-call pick options. */
export interface PickOptions {
  /**
   * §SELECT-PERF — skip the depth pass (hitPoint/distance). The HOVER path only
   * needs the elementId to drive the outline, so the second (depth) render +
   * readback is pure waste there; skipping it ~halves the per-frame hover cost,
   * which is what scales with scene element count. The click path leaves it false
   * so operation tools still receive an accurate world hit point.
   */
  readonly skipDepth?: boolean;
}

export interface PickStrategy {
  readonly id: PickStrategyId;
  /** `false` when the strategy probed unhealthy.  Resolver checks this
   *  to decide fallback. */
  readonly available: boolean;
  pick(screenPoint: Point2D, ctx: PickContext, opts?: PickOptions): PickResult | null;
  pickRect(screenRect: Rect2D, ctx: PickContext): readonly PickResult[];
  /** Probe the strategy's prerequisites (driver quirks, missing context).
   *  Cheap; resolver runs it once at boot. */
  probeAvailability(ctx: PickContext): PickProbeResult;
  dispose(): void;
}

/** Encode a 24-bit slot index into RGB bytes; alpha=255 marks "occupied".
 *  Index 0 reserved for "no hit".  Max addressable = 2^24 - 1 elements. */
export function encodeIndexToRGBA(index: number): readonly [number, number, number, number] {
  if (index <= 0 || index >= 0x1000000) return [0, 0, 0, 0];
  const r = (index >> 16) & 0xff;
  const g = (index >> 8) & 0xff;
  const b = index & 0xff;
  return [r, g, b, 255];
}

/** Decode RGBA bytes back to slot index.  Returns 0 for "no hit". */
export function decodeRGBAToIndex(r: number, g: number, b: number, a: number): number {
  if (a < 128) return 0;
  return ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff);
}
