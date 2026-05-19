// MaterialPool — content-hash → ref-counted Material handle.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S04 Track B
//   "T8: MaterialPool — hash → ref-counted Material handle (Disposable)".
//
// Why ref counting:
//   A real BIM project has thousands of walls all sharing one
//   `MeshStandardMaterial`.  Per-element material allocation would
//   thrash the GPU shader cache and inflate GLB exports.  The pool
//   stores one Material per content hash and hands out `MaterialHandle`
//   handles; the underlying Material is `dispose()`-d only when the
//   last handle releases.
//
// Disposable (TC39):
//   The handle implements `[Symbol.dispose]` so callers can `using`
//   it; equivalent to manually calling `release()`.  See ADR-005 §3.
//
// Hashing:
//   The pool does NOT hash the material itself — it accepts a hash
//   string from the caller.  The caller (committer) chooses what to
//   include in the hash (color, texture URL, transparency, …).  This
//   keeps the pool generic and lets each primitive optimise its own
//   parameter space.

import type * as THREE from '@pryzm/renderer-three/three';
import type { MaterialHandle } from './types.js';

interface PoolEntry<M extends THREE.Material = THREE.Material> {
  material: M;
  refs: number;
}

export class MaterialPool {
  private readonly pool = new Map<string, PoolEntry>();
  /** True after `dispose()` — further `acquire()` calls throw. */
  private disposed = false;

  /**
   * Acquire (or create) a Material for the given hash.  The factory
   * runs ONCE per hash per pool lifetime — subsequent acquires reuse
   * the cached Material and bump the ref count.
   */
  acquire<M extends THREE.Material>(hash: string, factory: () => M): MaterialHandle<M> {
    if (this.disposed) {
      throw new Error('[MaterialPool] cannot acquire from a disposed pool.');
    }
    let entry = this.pool.get(hash) as PoolEntry<M> | undefined;
    if (entry === undefined) {
      const material = factory();
      entry = { material, refs: 0 };
      this.pool.set(hash, entry as PoolEntry);
    }
    entry.refs += 1;
    return this.makeHandle(hash, entry);
  }

  /** Number of distinct cached materials. */
  size(): number {
    return this.pool.size;
  }

  /** Live ref count for a hash (test hook).  Returns 0 if absent. */
  refCount(hash: string): number {
    return this.pool.get(hash)?.refs ?? 0;
  }

  /** Release every Material in the pool, regardless of outstanding refs.
   *  Called when the project / plugin is torn down. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.pool.values()) {
      entry.material.dispose();
    }
    this.pool.clear();
  }

  private makeHandle<M extends THREE.Material>(
    hash: string,
    entry: PoolEntry<M>,
  ): MaterialHandle<M> {
    const pool = this;
    let released = false;
    const handle: MaterialHandle<M> = {
      get material(): M {
        if (released) {
          throw new Error(`[MaterialPool] handle for ${hash} is already released.`);
        }
        return entry.material;
      },
      hash,
      release(): number {
        if (released) return entry.refs;
        released = true;
        entry.refs -= 1;
        if (entry.refs <= 0) {
          // Last reference — dispose the GPU resources and forget.
          entry.material.dispose();
          pool.pool.delete(hash);
        }
        return entry.refs;
      },
      [Symbol.dispose](): void {
        this.release();
      },
    };
    return handle;
  }
}
