// @pryzm/renderer-three — §SCENE6-EMPTY-DRAW-GUARD (L-10002), C04 §1.4.
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS FOR, AND WHY IT IS NOT A MICRO-OPTIMISATION
// ─────────────────────────────────────────────────────────────────────────────
//
// A draw call submitted with a vertex count of 0 is not a no-op on the WebGPU
// backend. Chromium's own message for it is:
//
//     "Draw with a vertex count of 0 is unusual."
//
// — which is exactly what the founder's Pascal capture shows. Pascal's fix
// (`packages/viewer/src/components/viewer/index.tsx:109-144`, MIT) records the
// consequence, and it is the reason this file exists rather than a lint rule:
// one degenerate mesh **poisons the command encoder**, and a poisoned encoder
// flickers *the whole canvas* — not the offending object. The symptom therefore
// has no visual relationship to its cause, which is the worst property a
// rendering defect can have.
//
// AUDIT-C §2.6 measured PRYZM's state: `grep -rn "setRenderObjectFunction|
// hasDrawableGeometry"` → **0 hits**. PRYZM has WebGPU as its primary backend
// (`WebGPURendererAdapter`) and no guard at all.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⛔ THE DESIGN RULE: THE PREDICATE IS CONSERVATIVE, ALWAYS, IN ONE DIRECTION
// ─────────────────────────────────────────────────────────────────────────────
//
// This guard SKIPS draws. A false positive therefore does not cost performance,
// it makes something the user authored **disappear**, which is categorically
// worse than the flicker it prevents. So `isDrawSkippable()` returns true only
// on positive proof that the draw submits zero vertices, and every uncertain,
// unrecognised or unreadable shape falls through to "draw it". There is no
// heuristic in this file and there must never be one: if you cannot name the
// field that proves the count is zero, the answer is `false`.
//
// ⚠ WHAT IT DELIBERATELY DOES *NOT* DO. It does not repair the degenerate
// geometry, does not log per-frame, and does not report the object as broken.
// A zero-vertex draw is usually a *transient* — a mesh built one frame ahead of
// its buffers, a group range mid-rewrite (see `GeometryMergeBatcher`) — and
// treating a transient as a fault is how a guard becomes a second bug. It
// counts, so the condition is visible, and it moves on.
//
// ─────────────────────────────────────────────────────────────────────────────
// SCOPE — STATED, BECAUSE THE GAP IS REAL AND PASCAL HAS IT TOO
// ─────────────────────────────────────────────────────────────────────────────
//
// Three r183 swaps `_renderObjectFunction` for its own during the shadow pass
// (`three.webgpu.js:43831-43848`) and the toon-outline pass (`:39799-39824`),
// restoring the previous one afterwards. Those passes therefore run WITHOUT
// this guard. That is not a bug in this file, it is the shape of the hook three
// exposes — and it is stated here so nobody reads "empty draws are guarded" as
// "empty draws cannot happen". The main colour pass is guarded; shadow and
// toon-outline draws are not.
//
// P2 NOTE: this file is inside `packages/renderer-three/` — the sole THREE
// owner — so it may import `three` directly.

import * as THREE from 'three';

// ── The renderer surface this guard needs ────────────────────────────────────
//
// Typed structurally rather than as `WebGPURenderer` so the guard can be
// installed from the adapter (which holds a `THREE.WebGLRenderer`-typed handle
// by r183's inheritance) without a cast to `any`. P4: no `(window as any)`, and
// no `as any` bridges either — the shape is written out.

/** The argument list three r183 passes to a render-object function. */
export type RenderObjectArgs = [
  object: THREE.Object3D,
  scene: THREE.Scene,
  camera: THREE.Camera,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  group: { start: number; count: number; materialIndex?: number } | null,
  lightsNode: unknown,
  clippingContext?: unknown,
  passId?: string | null,
];

/** The subset of `THREE.Renderer` (r183 WebGPU) this guard binds to. */
export interface RenderObjectFunctionHost {
  getRenderObjectFunction?: () => ((...args: RenderObjectArgs) => void) | null;
  setRenderObjectFunction?: (fn: ((...args: RenderObjectArgs) => void) | null) => void;
  renderObject?: (...args: RenderObjectArgs) => void;
}

// ── Stats ────────────────────────────────────────────────────────────────────

export interface EmptyDrawGuardStats {
  /** Draws skipped since install. */
  readonly skipped: number;
  /** Draws inspected since install (skipped + passed). */
  readonly inspected: number;
  /**
   * The reason of the most recent skip, for a human reading a console. Not a
   * histogram — a histogram of a transient is noise, and the founder needs
   * "did this fire at all", not a distribution.
   */
  readonly lastReason: string | null;
}

let _skipped = 0;
let _inspected = 0;
let _lastReason: string | null = null;

/**
 * Cumulative guard stats for the process. Module-level rather than published on
 * `window` deliberately — P4 forbids `(window as any)`, and a package that
 * exports its own reader needs no global at all.
 */
export function getEmptyDrawGuardStats(): EmptyDrawGuardStats {
  return { skipped: _skipped, inspected: _inspected, lastReason: _lastReason };
}

/** Test seam. Production never calls this. */
export function resetEmptyDrawGuardStats(): void {
  _skipped = 0;
  _inspected = 0;
  _lastReason = null;
}

// ── The predicate ────────────────────────────────────────────────────────────

/**
 * Returns a REASON STRING when the draw provably submits zero vertices, and
 * `null` in every other case — including every case this function does not
 * understand.
 *
 * ⛔ Read the direction of the doubt before editing: `null` means "draw it".
 * Adding a clause that returns a reason on anything short of proof deletes
 * geometry from the user's screen.
 *
 * The clauses, each naming the field that proves the count:
 *
 *   1. NO POSITION       — `geometry.attributes.position` absent. Nothing can be
 *                          assembled without it; three's own draw path reads it
 *                          unconditionally.
 *   2. ZERO POSITIONS    — `position.count === 0`.
 *   3. EMPTY INDEX       — indexed geometry whose `index.count === 0`. The
 *                          position buffer can be non-empty and the draw still
 *                          submits nothing.
 *   4. EMPTY GROUP       — the multi-material `group` being drawn has
 *                          `count === 0`. This is the clause `GeometryMergeBatcher`
 *                          produces when every wall in a run is released: the
 *                          buffer is intact and one range collapsed to zero.
 *   5. EMPTY DRAW RANGE  — `drawRange.count === 0`. `drawRange.count` defaults to
 *                          `Infinity`, so a literal 0 is always deliberate.
 *   6. ZERO INSTANCES    — `InstancedMesh.count === 0`. An instanced draw with no
 *                          instances is the same degenerate submission.
 */
export function emptyDrawReason(
  object: THREE.Object3D,
  geometry: THREE.BufferGeometry | null | undefined,
  group: { start: number; count: number } | null | undefined,
): string | null {
  // Not a geometry-bearing draw we can reason about → draw it.
  if (!geometry || typeof geometry !== 'object') return null;

  const attributes = geometry.attributes as
    | Record<string, { count?: number } | undefined>
    | undefined;
  if (!attributes) return null;

  const position = attributes.position;
  if (position === undefined) return 'no position attribute';
  if (typeof position.count === 'number' && position.count === 0) return 'position.count === 0';

  const index = geometry.index as { count?: number } | null | undefined;
  if (index && typeof index.count === 'number' && index.count === 0) return 'index.count === 0';

  if (group && typeof group.count === 'number' && group.count === 0) return 'group.count === 0';

  const drawRange = geometry.drawRange as { start: number; count: number } | undefined;
  if (drawRange && drawRange.count === 0) return 'drawRange.count === 0';

  // `isInstancedMesh` is a three brand field, not a cast.
  const instanced = object as THREE.Object3D & { isInstancedMesh?: boolean; count?: number };
  if (instanced.isInstancedMesh === true && instanced.count === 0) {
    return 'InstancedMesh.count === 0';
  }

  return null;
}

// ── Install ──────────────────────────────────────────────────────────────────

export interface EmptyDrawGuardHandle {
  /** Restores whatever render-object function was in place before install. */
  uninstall(): void;
  /** Live stats for this process. */
  stats(): EmptyDrawGuardStats;
}

/**
 * Installs the guard on a three r183 `Renderer` (WebGPU or its WebGL2 backend).
 *
 * ⭐ CHAINS, NEVER REPLACES. It captures the function already installed (three
 * itself installs one for MRT and post-processing passes) and delegates to it,
 * falling back to `renderer.renderObject` when none is set — which is exactly
 * what three does internally (`three.webgpu.js:58174`:
 * `this._renderObjectFunction || this.renderObject`). Replacing instead of
 * chaining would silently disable whichever pass had installed first.
 *
 * Returns `null` when the renderer does not expose the hook (the classic
 * `THREE.WebGLRenderer` last-resort rung does not) — the caller treats that as
 * "no guard available on this backend", never as an error.
 */
export function installEmptyDrawGuard(
  renderer: RenderObjectFunctionHost | null | undefined,
  opts: { onSkip?: (reason: string, object: THREE.Object3D) => void } = {},
): EmptyDrawGuardHandle | null {
  if (
    !renderer ||
    typeof renderer.setRenderObjectFunction !== 'function' ||
    typeof renderer.getRenderObjectFunction !== 'function' ||
    typeof renderer.renderObject !== 'function'
  ) {
    return null;
  }

  const previous = renderer.getRenderObjectFunction();
  const fallback = renderer.renderObject.bind(renderer);
  const delegate = previous ?? fallback;

  const guarded = (...args: RenderObjectArgs): void => {
    const [object, , , geometry, , group] = args;
    _inspected++;
    const reason = emptyDrawReason(object, geometry, group);
    if (reason !== null) {
      _skipped++;
      _lastReason = reason;
      opts.onSkip?.(reason, object);
      return;
    }
    delegate(...args);
  };

  renderer.setRenderObjectFunction(guarded);

  let installed = true;
  return {
    uninstall(): void {
      if (!installed) return;
      installed = false;
      // Restore exactly what was there — `null` included, which is meaningful
      // to three (it means "use my own renderObject").
      renderer.setRenderObjectFunction?.(previous);
    },
    stats: getEmptyDrawGuardStats,
  };
}
