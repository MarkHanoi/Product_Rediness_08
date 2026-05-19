// SceneRegistry — Map<ElementId, Object3D>.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S04 Track B
// "T7: SceneRegistry — Map<ElementId, Object3D>".  This is the
// authoritative ID → scene-node lookup; the picking layer (L4) and the
// renderer (L5) consult it to resolve hits and rebuild draw lists.
//
// Concurrency: single-threaded by construction (every mutation hops via
// the L5 commit pump on the rAF tick).  We do NOT lock — the committer
// host is the sole writer; readers consume snapshots via `entries()`.
//
// Disposal: removing an entry does NOT call `obj.geometry.dispose()` /
// `obj.material.dispose()`.  Material lifecycle is owned by the
// MaterialPool; geometry lifecycle is owned by the committer that
// created the object.  The registry only holds references.

import type * as THREE from '@pryzm/renderer-three/three';
import type { ElementId } from './types.js';

export class SceneRegistry {
  private readonly entriesById = new Map<ElementId, THREE.Object3D>();

  /** Insert or replace.  Throws if the id is already bound to a
   *  DIFFERENT object — the caller should `remove(id)` first. */
  add(id: ElementId, obj: THREE.Object3D): void {
    const existing = this.entriesById.get(id);
    if (existing && existing !== obj) {
      throw new Error(
        `[SceneRegistry] id ${id} is already bound to a different Object3D; ` +
          `call remove(id) before re-binding.`,
      );
    }
    this.entriesById.set(id, obj);
  }

  get(id: ElementId): THREE.Object3D | undefined {
    return this.entriesById.get(id);
  }

  has(id: ElementId): boolean {
    return this.entriesById.has(id);
  }

  /** Detach + return the Object3D for the id, or undefined if absent. */
  remove(id: ElementId): THREE.Object3D | undefined {
    const existing = this.entriesById.get(id);
    if (existing === undefined) return undefined;
    this.entriesById.delete(id);
    return existing;
  }

  size(): number {
    return this.entriesById.size;
  }

  ids(): IterableIterator<ElementId> {
    return this.entriesById.keys();
  }

  values(): IterableIterator<THREE.Object3D> {
    return this.entriesById.values();
  }

  entries(): IterableIterator<[ElementId, THREE.Object3D]> {
    return this.entriesById.entries();
  }

  /** Drop every binding.  Does NOT dispose the underlying objects —
   *  callers (committer host) are responsible for material/geometry
   *  release before calling clear(). */
  clear(): void {
    this.entriesById.clear();
  }
}
