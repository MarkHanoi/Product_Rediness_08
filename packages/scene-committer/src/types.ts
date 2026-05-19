// Public types for @pryzm/scene-committer (L5).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S04 Track B
// (lines 442-469) + ADR-005 "PrimitiveCommitter interface".
//
// What lives here (S04):
//   • PrimitiveCommitter<TDto, TElement> — the *only* allowed boundary
//     between L1 store DTOs and the L5 THREE scene graph.  Plugins
//     register one committer per primitive ("wall", "door", "cube", …).
//   • SceneRegistry — Map<ElementId, Object3D>.  Owned by the scene
//     committer host; the renderer reads it.
//   • MaterialPool — hash → ref-counted Material handle.  Returns a
//     Disposable so callers can release with `using` (TC39 explicit
//     resource management).
//
// What does NOT live here:
//   • The committer fan-out loop (S05 — render-runtime).
//   • The renderer (S05 — packages/renderer).
//   • Any lint rule enforcement — that's `eslint-plugin-pryzm`
//     (`no-three-outside-committer`).
//
// Design notes:
//   • THREE is imported as `import type * as THREE` to keep the public
//     surface tree-shakable; runtime THREE imports happen in the
//     concrete committers + the SceneRegistry/MaterialPool impls.
//   • The TDto generic is intentionally `unknown`-friendly — committers
//     are written per primitive and know their own DTO shape.

import type * as THREE from '@pryzm/renderer-three/three';

/** Stable identity for an element across stores → committers → scene. */
export type ElementId = string;

/**
 * The *only* allowed THREE-touching contract.  A `PrimitiveCommitter`
 * receives DTO snapshots from the store layer and emits / mutates /
 * disposes THREE objects in the scene.  Lifecycle:
 *
 *   onAdd      — element appeared (store insert).  Returns the Object3D
 *                that the host adds to the scene graph; the host stores
 *                the same reference in the SceneRegistry under `id`.
 *   onUpdate   — element mutated (store replace).  Mutates `obj` in
 *                place; never returns a new instance (the scene graph
 *                identity must be stable so picking + selection don't
 *                re-bind on every tick).
 *   onRemove   — element gone (store delete).  Detaches from scene
 *                graph, releases material refs, frees buffers.
 *   onDispose  — committer is being torn down (project close, plugin
 *                unload).  Releases all *committer-owned* resources.
 */
export interface PrimitiveCommitter<
  TDto = unknown,
  TElement extends THREE.Object3D = THREE.Object3D,
> {
  /** Display name; appears in OTel spans + diagnostic logs. */
  readonly primitiveType: string;

  onAdd(id: ElementId, dto: TDto): TElement;
  onUpdate(id: ElementId, dto: TDto, obj: TElement): void;
  onRemove(id: ElementId, obj: TElement): void;
  onDispose(): void;
}

/** Disposable handle — TC39 explicit resource management.
 *  Returned by `MaterialPool.acquire`; releasing decrements the ref
 *  count and disposes the underlying Material when it hits zero. */
export interface MaterialHandle<TMaterial extends THREE.Material = THREE.Material> {
  readonly material: TMaterial;
  readonly hash: string;
  /** Returns the current ref count AFTER releasing this handle (test hook). */
  release(): number;
  /** TC39 `using` support — equivalent to `release()`. */
  [Symbol.dispose]?(): void;
}
