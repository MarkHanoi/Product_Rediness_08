import { L as LODManager, a as withSpan } from './LODManager-DHqndFcX.js';

class SceneRegistry {
  entriesById = /* @__PURE__ */ new Map();
  /** Insert or replace.  Throws if the id is already bound to a
   *  DIFFERENT object — the caller should `remove(id)` first. */
  add(id, obj) {
    const existing = this.entriesById.get(id);
    if (existing && existing !== obj) {
      throw new Error(
        `[SceneRegistry] id ${id} is already bound to a different Object3D; call remove(id) before re-binding.`
      );
    }
    this.entriesById.set(id, obj);
  }
  get(id) {
    return this.entriesById.get(id);
  }
  has(id) {
    return this.entriesById.has(id);
  }
  /** Detach + return the Object3D for the id, or undefined if absent. */
  remove(id) {
    const existing = this.entriesById.get(id);
    if (existing === void 0) return void 0;
    this.entriesById.delete(id);
    return existing;
  }
  size() {
    return this.entriesById.size;
  }
  ids() {
    return this.entriesById.keys();
  }
  values() {
    return this.entriesById.values();
  }
  entries() {
    return this.entriesById.entries();
  }
  /** Drop every binding.  Does NOT dispose the underlying objects —
   *  callers (committer host) are responsible for material/geometry
   *  release before calling clear(). */
  clear() {
    this.entriesById.clear();
  }
}

class MaterialPool {
  pool = /* @__PURE__ */ new Map();
  /** True after `dispose()` — further `acquire()` calls throw. */
  disposed = false;
  /**
   * Acquire (or create) a Material for the given hash.  The factory
   * runs ONCE per hash per pool lifetime — subsequent acquires reuse
   * the cached Material and bump the ref count.
   */
  acquire(hash, factory) {
    if (this.disposed) {
      throw new Error("[MaterialPool] cannot acquire from a disposed pool.");
    }
    let entry = this.pool.get(hash);
    if (entry === void 0) {
      const material = factory();
      entry = { material, refs: 0 };
      this.pool.set(hash, entry);
    }
    entry.refs += 1;
    return this.makeHandle(hash, entry);
  }
  /** Number of distinct cached materials. */
  size() {
    return this.pool.size;
  }
  /** Live ref count for a hash (test hook).  Returns 0 if absent. */
  refCount(hash) {
    return this.pool.get(hash)?.refs ?? 0;
  }
  /** Release every Material in the pool, regardless of outstanding refs.
   *  Called when the project / plugin is torn down. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.pool.values()) {
      entry.material.dispose();
    }
    this.pool.clear();
  }
  makeHandle(hash, entry) {
    const pool = this;
    let released = false;
    const handle = {
      get material() {
        if (released) {
          throw new Error(`[MaterialPool] handle for ${hash} is already released.`);
        }
        return entry.material;
      },
      hash,
      release() {
        if (released) return entry.refs;
        released = true;
        entry.refs -= 1;
        if (entry.refs <= 0) {
          entry.material.dispose();
          pool.pool.delete(hash);
        }
        return entry.refs;
      },
      [Symbol.dispose]() {
        this.release();
      }
    };
    return handle;
  }
}

class CommitterHost {
  registry;
  materialPool;
  lodManager;
  committers = /* @__PURE__ */ new Map();
  /** Current camera-to-scene-center distance (metres).  Updated each frame
   *  by the render loop via `setViewDistance()`.  Used by `applyDelta()` to
   *  compute the LOD tier for each committed primitive. */
  _viewDistance = 0;
  constructor(opts = {}) {
    this.registry = opts.registry ?? new SceneRegistry();
    this.materialPool = opts.materialPool ?? new MaterialPool();
    this.lodManager = opts.lodManager ?? new LODManager();
  }
  /**
   * setViewDistance — called every frame by the render loop with the current
   * camera-to-scene-center distance in metres.  Drives the LOD tier selection
   * in `applyDelta()`.
   *
   * Wave A18-T15: wire point from `packages/render-runtime/` frame callback.
   */
  setViewDistance(distanceMetres) {
    this._viewDistance = distanceMetres;
  }
  /** Returns the LOD tier for the current view distance (0 | 1 | 2). */
  get currentLODTier() {
    return this.lodManager.computeLOD(this._viewDistance);
  }
  register(committer) {
    if (this.committers.has(committer.primitiveType)) {
      throw new Error(
        `[CommitterHost] primitiveType "${committer.primitiveType}" is already registered.`
      );
    }
    this.committers.set(committer.primitiveType, committer);
  }
  get(primitiveType) {
    return this.committers.get(primitiveType);
  }
  /** Apply a single delta.  Returns the bound Object3D for add/update,
   *  or undefined for remove.  Wraps every delta in
   *  `pryzm.scene.commit` for OTel — sibling to
   *  `pryzm.persistence.append` and `pryzm.command.execute`. */
  async commit(delta) {
    return withSpan(
      "pryzm.scene.commit",
      {
        "pryzm.scene.delta_kind": delta.kind,
        "pryzm.scene.primitive_type": delta.primitiveType,
        "pryzm.scene.element_id": delta.id
      },
      () => this.applyDelta(delta)
    );
  }
  /** Batch variant — applies deltas in order under ONE OTel span. */
  async commitBatch(deltas) {
    if (deltas.length === 0) return;
    return withSpan(
      "pryzm.scene.commit.batch",
      { "pryzm.scene.batch_size": deltas.length },
      async () => {
        for (const d of deltas) await this.applyDelta(d);
      }
    );
  }
  /** Batch + extra OTel attributes.  The dispatcher (S05-T5) calls
   *  this so the `pryzm.scene.commit.batch` span carries
   *  `pryzm.scene.added/updated/removed` counts (S05-D6, spec line 552). */
  async commitBatchWithCounts(deltas, extraAttrs) {
    if (deltas.length === 0) return;
    return withSpan(
      "pryzm.scene.commit.batch",
      { "pryzm.scene.batch_size": deltas.length, ...extraAttrs },
      async () => {
        for (const d of deltas) await this.applyDelta(d);
      }
    );
  }
  /** Tear down: dispose every committer + the material pool, clear the
   *  registry.  Idempotent. */
  dispose() {
    for (const c of this.committers.values()) c.onDispose();
    this.committers.clear();
    this.registry.clear();
    this.materialPool.dispose();
  }
  applyDelta(delta) {
    const lodTier = this.lodManager.computeLOD(this._viewDistance);
    if (delta.kind !== "remove" && lodTier === 2 && this.lodManager.shouldSkip(this._viewDistance)) {
      return void 0;
    }
    const committer = this.committers.get(delta.primitiveType);
    if (committer === void 0) {
      throw new Error(
        `[CommitterHost] no committer registered for primitiveType "${delta.primitiveType}".`
      );
    }
    if (delta.kind === "add") {
      const obj = committer.onAdd(delta.id, delta.dto);
      this.registry.add(delta.id, obj);
      return obj;
    }
    if (delta.kind === "update") {
      const obj = this.registry.get(delta.id);
      if (obj === void 0) {
        throw new Error(
          `[CommitterHost] update for unknown element id ${delta.id} (${delta.primitiveType}).`
        );
      }
      committer.onUpdate(delta.id, delta.dto, obj);
      return obj;
    }
    const removed = this.registry.remove(delta.id);
    if (removed === void 0) {
      throw new Error(
        `[CommitterHost] remove for unknown element id ${delta.id} (${delta.primitiveType}).`
      );
    }
    committer.onRemove(delta.id, removed);
    return void 0;
  }
}

function diffToDeltas(diff, snapshot, primitiveType) {
  const deltas = [];
  for (const id of diff.removed) {
    deltas.push({ kind: "remove", primitiveType, id });
  }
  for (const id of diff.added) {
    const dto = snapshot.get(id);
    if (dto === void 0) continue;
    deltas.push({ kind: "add", primitiveType, id, dto });
  }
  for (const id of diff.updated) {
    const dto = snapshot.get(id);
    if (dto === void 0) continue;
    deltas.push({ kind: "update", primitiveType, id, dto });
  }
  return deltas;
}
function bindStore(store, primitiveType, host, opts = {}) {
  const schedule = opts.scheduleFlush ?? defaultSchedule;
  const onError = opts.onError;
  const pending = {
    added: /* @__PURE__ */ new Set(),
    updated: /* @__PURE__ */ new Set(),
    removed: /* @__PURE__ */ new Set(),
    scheduled: false
  };
  let disposed = false;
  let inFlight = null;
  const listener = (diff) => {
    mergeDiff(pending, diff);
    if (!pending.scheduled) {
      pending.scheduled = true;
      schedule(() => {
        if (disposed) {
          pending.scheduled = false;
          pending.added.clear();
          pending.updated.clear();
          pending.removed.clear();
          return;
        }
        void runFlush().catch((err) => {
          if (onError) onError(err);
          else throw err;
        });
      });
    }
  };
  const unsubscribe = store.subscribeDirty(listener);
  function runFlush() {
    let next;
    if (inFlight === null) {
      next = doFlush();
    } else {
      next = inFlight.then(() => doFlush());
    }
    inFlight = next;
    next.finally(() => {
      if (inFlight === next) inFlight = null;
    });
    return next;
  }
  async function doFlush() {
    pending.scheduled = false;
    if (pending.added.size === 0 && pending.updated.size === 0 && pending.removed.size === 0) {
      return;
    }
    const drained = {
      added: new Set(pending.added),
      updated: new Set(pending.updated),
      removed: new Set(pending.removed)
    };
    pending.added.clear();
    pending.updated.clear();
    pending.removed.clear();
    const snapshot = store.getState();
    const deltas = diffToDeltas(drained, snapshot, primitiveType);
    if (deltas.length === 0) return;
    await host.commitBatchWithCounts(deltas, {
      "pryzm.scene.added": drained.added.size,
      "pryzm.scene.updated": drained.updated.size,
      "pryzm.scene.removed": drained.removed.size
    });
  }
  return {
    flush: () => runFlush(),
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
    }
  };
}
function mergeDiff(pending, diff) {
  for (const id of diff.removed) {
    if (pending.added.has(id)) {
      pending.added.delete(id);
    } else {
      pending.updated.delete(id);
      pending.removed.add(id);
    }
  }
  for (const id of diff.added) {
    if (pending.removed.has(id)) {
      pending.removed.delete(id);
      pending.updated.add(id);
    } else {
      pending.added.add(id);
    }
  }
  for (const id of diff.updated) {
    if (!pending.added.has(id) && !pending.removed.has(id)) {
      pending.updated.add(id);
    }
  }
}
function defaultSchedule(flush) {
  queueMicrotask(flush);
}

export { CommitterHost as C, MaterialPool as M, SceneRegistry as S, bindStore as b, diffToDeltas as d };
