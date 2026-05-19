// CommitterHost — orchestrates fan-out from a store delta to the
// registered PrimitiveCommitters and keeps the SceneRegistry in sync.
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S04 Track B —
//   the host is the wiring node that sits between L0 EventLog replay
//   (or live store deltas) and the THREE scene graph.  S04 ships the
//   skeleton + a CubeStore-driven smoke test; S05 wires it into the
//   FrameScheduler as the on-tick committer pump.
//
// The host owns NO THREE objects directly — it delegates everything to
// the registered committers.  It DOES own the SceneRegistry (so the
// renderer + picking layer have a single ID lookup) and the
// MaterialPool (so cross-committer material sharing is possible).

import type * as THREE from '@pryzm/renderer-three/three';
import { withSpan } from './otel.js';
import { SceneRegistry } from './SceneRegistry.js';
import { MaterialPool } from './MaterialPool.js';
import { LODManager } from './LODManager.js';
import type { ElementId, PrimitiveCommitter } from './types.js';

export interface CommitterHostOptions {
  registry?: SceneRegistry;
  materialPool?: MaterialPool;
  /** LOD manager — defaults to a new LODManager with standard thresholds (Wave A18-T15). */
  lodManager?: LODManager;
}

/** A delta the host knows how to apply.  Stores convert their per-tick
 *  diff into one of these and call `host.commit()`. */
export type SceneDelta =
  | { kind: 'add'; primitiveType: string; id: ElementId; dto: unknown }
  | { kind: 'update'; primitiveType: string; id: ElementId; dto: unknown }
  | { kind: 'remove'; primitiveType: string; id: ElementId };

export class CommitterHost {
  readonly registry: SceneRegistry;
  readonly materialPool: MaterialPool;
  readonly lodManager: LODManager;
  private readonly committers = new Map<string, PrimitiveCommitter>();

  /** Current camera-to-scene-center distance (metres).  Updated each frame
   *  by the render loop via `setViewDistance()`.  Used by `applyDelta()` to
   *  compute the LOD tier for each committed primitive. */
  private _viewDistance = 0;

  constructor(opts: CommitterHostOptions = {}) {
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
  setViewDistance(distanceMetres: number): void {
    this._viewDistance = distanceMetres;
  }

  /** Returns the LOD tier for the current view distance (0 | 1 | 2). */
  get currentLODTier() {
    return this.lodManager.computeLOD(this._viewDistance);
  }

  register(committer: PrimitiveCommitter): void {
    if (this.committers.has(committer.primitiveType)) {
      throw new Error(
        `[CommitterHost] primitiveType "${committer.primitiveType}" is already registered.`,
      );
    }
    this.committers.set(committer.primitiveType, committer);
  }

  get(primitiveType: string): PrimitiveCommitter | undefined {
    return this.committers.get(primitiveType);
  }

  /** Apply a single delta.  Returns the bound Object3D for add/update,
   *  or undefined for remove.  Wraps every delta in
   *  `pryzm.scene.commit` for OTel — sibling to
   *  `pryzm.persistence.append` and `pryzm.command.execute`. */
  async commit(delta: SceneDelta): Promise<THREE.Object3D | undefined> {
    return withSpan(
      'pryzm.scene.commit',
      {
        'pryzm.scene.delta_kind': delta.kind,
        'pryzm.scene.primitive_type': delta.primitiveType,
        'pryzm.scene.element_id': delta.id,
      },
      () => this.applyDelta(delta),
    );
  }

  /** Batch variant — applies deltas in order under ONE OTel span. */
  async commitBatch(deltas: readonly SceneDelta[]): Promise<void> {
    if (deltas.length === 0) return;
    return withSpan(
      'pryzm.scene.commit.batch',
      { 'pryzm.scene.batch_size': deltas.length },
      async () => {
        for (const d of deltas) await this.applyDelta(d);
      },
    );
  }

  /** Batch + extra OTel attributes.  The dispatcher (S05-T5) calls
   *  this so the `pryzm.scene.commit.batch` span carries
   *  `pryzm.scene.added/updated/removed` counts (S05-D6, spec line 552). */
  async commitBatchWithCounts(
    deltas: readonly SceneDelta[],
    extraAttrs: Readonly<Record<string, number | string | boolean>>,
  ): Promise<void> {
    if (deltas.length === 0) return;
    return withSpan(
      'pryzm.scene.commit.batch',
      { 'pryzm.scene.batch_size': deltas.length, ...extraAttrs },
      async () => {
        for (const d of deltas) await this.applyDelta(d);
      },
    );
  }

  /** Tear down: dispose every committer + the material pool, clear the
   *  registry.  Idempotent. */
  dispose(): void {
    for (const c of this.committers.values()) c.onDispose();
    this.committers.clear();
    this.registry.clear();
    this.materialPool.dispose();
  }

  private applyDelta(delta: SceneDelta): THREE.Object3D | undefined {
    const lodTier = this.lodManager.computeLOD(this._viewDistance);

    if (delta.kind !== 'remove' && lodTier === 2 && this.lodManager.shouldSkip(this._viewDistance)) {
      return undefined;
    }

    const committer = this.committers.get(delta.primitiveType);
    if (committer === undefined) {
      throw new Error(
        `[CommitterHost] no committer registered for primitiveType "${delta.primitiveType}".`,
      );
    }
    if (delta.kind === 'add') {
      const obj = committer.onAdd(delta.id, delta.dto);
      this.registry.add(delta.id, obj);
      return obj;
    }
    if (delta.kind === 'update') {
      const obj = this.registry.get(delta.id);
      if (obj === undefined) {
        throw new Error(
          `[CommitterHost] update for unknown element id ${delta.id} (${delta.primitiveType}).`,
        );
      }
      committer.onUpdate(delta.id, delta.dto, obj);
      return obj;
    }
    // remove
    const removed = this.registry.remove(delta.id);
    if (removed === undefined) {
      throw new Error(
        `[CommitterHost] remove for unknown element id ${delta.id} (${delta.primitiveType}).`,
      );
    }
    committer.onRemove(delta.id, removed);
    return undefined;
  }
}
