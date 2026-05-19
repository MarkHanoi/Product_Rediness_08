// InstancedMeshCoalescer — ADR-046 · C04 §3.5
//
// Coalesces per-wall InstancedMesh objects that land in the scene after a
// curtain-wall batch into a single merged InstancedMesh per
// (levelId, geometryUUID, materialUUID) group.
//
// Scene-traversal design:
//   The coalescer operates on the live THREE.Scene — it does NOT require a
//   SceneRegistry.  CurtainWallBuilder adds wall Groups (and their child
//   InstancedMesh objects) directly to `world.scene.three`, so the registry
//   is not the right abstraction for this post-batch aggregation pass.
//
//   userData contract (CurtainWallBuilder._buildOne, CurtainWallInstanceManager):
//     wallGroup.userData.levelId — the level UUID (string)
//     wallGroup.userData.id      — the element ID  (string)
//     instancedMesh.parent       — the wall Group
//
// Design invariants honoured:
//   P2 — THREE imported only via '@pryzm/renderer-three/three'.
//   P3 — rAF-free: all deferred work goes through getFrameScheduler().scheduleOnce().
//   P8 — Every exported method carries an OTel span.
//   C04 §2.3 — Coalescing scheduled at 'post-render' (after geometry build,
//               after render pass, before overlay).
//   C04 §3.5 — LOD-system entry point: scene-committer provides per-group IM.
//
// Draw-call arithmetic (5-level curtain-wall batch, 10 walls/level):
//   Before coalescing: 5 levels × 10 walls × 3 IM/wall  = 150 draw calls
//   After  coalescing: 5 levels × 3 material types       = 15 draw calls  ✓
//
// Pick resolution (ADR-046 §"Pick resolution"):
//   Source InstancedMeshes are HIDDEN (visible=false) after coalescing but
//   remain in the scene graph under their parent wall Group so that
//   GpuPickStrategy.syncPickScene() can still traverse and find them.
//   GpuPickStrategy creates per-instance pick clones in world space — see
//   packages/picking/src/gpu-pick.ts collectInstancedMeshes().
//
// Undo (decoalesce):
//   Restores source InstancedMesh visibility, shrinks or destroys the merged
//   InstancedMesh, and rebuilds the per-instance index → ElementId map.

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { withSpan, withSpanSync } from './otel.js';
import type { ElementId } from './types.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface SourceRecord {
  /** ElementId of the owning wall element. */
  readonly elementId: ElementId;
  /** The hidden per-wall InstancedMesh. */
  readonly obj: THREE.InstancedMesh;
  /** Number of instances this IM contributes to the merged group. */
  readonly count: number;
}

interface CoalescedGroup {
  /** The merged InstancedMesh added to the scene. */
  instancedMesh: THREE.InstancedMesh;
  /** merged-instance-index → owning ElementId (for pick resolution). */
  instanceIndexToElementId: Map<number, ElementId>;
  /** All per-wall hidden source IMs that feed into this group. */
  sources: SourceRecord[];
}

// ---------------------------------------------------------------------------
// Public class
// ---------------------------------------------------------------------------

/**
 * InstancedMeshCoalescer — ADR-046 § C04 §3.5
 *
 * Reduces draw calls after a curtain-wall batch by merging same-geometry,
 * same-material `THREE.InstancedMesh` objects (produced by
 * `CurtainWallInstanceManager` per wall) into one unified `InstancedMesh`
 * per `(levelId, geometryUUID, materialUUID)` group.
 *
 * Lifecycle:
 *   1. Call `onBatchStart()` from the `setBatchLifecycleCallbacks` onStart hook.
 *   2. Call `onBatchEnd()`   from the `setBatchLifecycleCallbacks` onEnd hook.
 *   3. Coalescing is scheduled automatically at `'post-render'` priority.
 *
 * The constructor takes only a `getScene` getter — no SceneRegistry required.
 */
export class InstancedMeshCoalescer {
  /** Snapshot of InstancedMesh UUIDs present in the scene at batch-start. */
  private _preBatchUUIDs = new Set<string>();

  /** Active coalesced groups keyed by "${levelId}:${geoUUID}:${matUUID}". */
  private readonly _groups = new Map<string, CoalescedGroup>();

  /** Disposer for any in-flight 'post-render' scheduleOnce. */
  private _coalescePending: TickListenerDisposer | null = null;

  constructor(private readonly _getScene: () => THREE.Scene | null) {}

  // ── Batch lifecycle hooks ────────────────────────────────────────────────

  /**
   * Must be called from the `onStart` leg of
   * `batchCoordinator.setBatchLifecycleCallbacks()`.
   *
   * Snapshots UUIDs of all InstancedMesh objects currently in the scene so
   * `onBatchEnd`'s coalesce pass can identify which IMs are newly built.
   *
   * P8: `pryzm.scene.coalesce.start` OTel span.
   */
  onBatchStart(): void {
    withSpanSync(
      'pryzm.scene.coalesce.start',
      {},
      () => {
        const scene = this._getScene();
        this._preBatchUUIDs = new Set<string>();
        if (scene === null) return;
        scene.traverse((obj) => {
          if (
            obj instanceof THREE.InstancedMesh &&
            !(obj.userData as Record<string, unknown>).isCoalesced
          ) {
            this._preBatchUUIDs.add(obj.uuid);
          }
        });
      },
    );
  }

  /**
   * Must be called from the `onEnd` leg of
   * `batchCoordinator.setBatchLifecycleCallbacks()`.
   *
   * Schedules `_coalesce()` at `'post-render'` priority (C04 §2.3) so the
   * work runs AFTER geometry has been committed to the scene graph and the
   * render pass has completed — matrices are stable before the next frame.
   *
   * P8: `pryzm.scene.coalesce.schedule` OTel span.
   */
  onBatchEnd(): void {
    withSpanSync(
      'pryzm.scene.coalesce.schedule',
      { 'pryzm.scene.pre_batch_uuid_count': this._preBatchUUIDs.size },
      () => {
        // Cancel any lingering in-flight coalesce from a prior batch.
        if (this._coalescePending !== null) {
          this._coalescePending();
          this._coalescePending = null;
        }
        this._coalescePending = getFrameScheduler().scheduleOnce(
          'instanced-mesh-coalesce',
          () => {
            this._coalescePending = null;
            void this._coalesce();
          },
          'post-render',
        );
      },
    );
  }

  // ── Pick resolution ──────────────────────────────────────────────────────

  /**
   * Given a merged InstancedMesh managed by this coalescer and an instance
   * index, returns the ElementId of the wall that owns that instance.
   *
   * Called by `GpuPickStrategy` raycaster integration when a pick ray hits a
   * coalesced IM directly (THREE.Raycaster.intersectObjects path).
   *
   * Returns `undefined` when `mesh` is not managed by this coalescer.
   *
   * P8: `pryzm.scene.coalesce.resolve_instance` OTel span.
   */
  resolveInstanceToElementId(
    mesh: THREE.InstancedMesh,
    instanceIndex: number,
  ): ElementId | undefined {
    return withSpanSync(
      'pryzm.scene.coalesce.resolve_instance',
      {
        'pryzm.scene.instance_index': instanceIndex,
        'pryzm.scene.mesh_uuid': mesh.uuid,
      },
      () => {
        for (const group of this._groups.values()) {
          if (group.instancedMesh === mesh) {
            return group.instanceIndexToElementId.get(instanceIndex);
          }
        }
        return undefined;
      },
    );
  }

  /**
   * Returns `true` if `obj` is a merged InstancedMesh owned by this
   * coalescer.  Used as a guard in pick/highlight code to skip re-processing
   * merged IMs that are not individually registered elements.
   */
  isMergedMesh(obj: THREE.Object3D): boolean {
    for (const group of this._groups.values()) {
      if (group.instancedMesh === obj) return true;
    }
    return false;
  }

  // ── Undo support ─────────────────────────────────────────────────────────

  /**
   * Remove an element from its coalesced group.  Called by the command
   * layer when an element is deleted or undone.
   *
   * Behaviour:
   *   • Restores the element's source InstancedMeshes to visible.
   *   • If the group still has ≥2 remaining elements: rebuilds the merged
   *     InstancedMesh without the removed element's instances.
   *   • If < 2 elements remain: restores all source visibility and removes
   *     the merged InstancedMesh from the scene.
   *
   * P8: `pryzm.scene.coalesce.decoalesce` OTel span.
   */
  decoalesce(elementId: ElementId): void {
    withSpanSync(
      'pryzm.scene.coalesce.decoalesce',
      { 'pryzm.scene.element_id': elementId },
      () => this._decoalesceInternal(elementId),
    );
  }

  // ── Disposal ─────────────────────────────────────────────────────────────

  /**
   * Tear down all coalesced groups, restore source visibility, and remove
   * merged InstancedMeshes from the scene.  Idempotent.
   *
   * P8: `pryzm.scene.coalesce.dispose` OTel span.
   */
  dispose(): void {
    withSpanSync(
      'pryzm.scene.coalesce.dispose',
      { 'pryzm.scene.group_count': this._groups.size },
      () => {
        if (this._coalescePending !== null) {
          this._coalescePending();
          this._coalescePending = null;
        }
        for (const group of this._groups.values()) {
          this._destroyGroup(group, /* restoreSources */ true);
        }
        this._groups.clear();
        this._preBatchUUIDs.clear();
      },
    );
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private async _coalesce(): Promise<void> {
    return withSpan(
      'pryzm.scene.coalesce',
      { 'pryzm.scene.pre_batch_uuid_count': this._preBatchUUIDs.size },
      () => this._coalesceInternal(),
    );
  }

  private _coalesceInternal(): void {
    const scene = this._getScene();
    if (scene === null) return;

    // ── 1. Find InstancedMesh objects added since batch start ─────────────
    //       (UUID not in pre-batch snapshot, not already a coalesced product)
    const newIMs: THREE.InstancedMesh[] = [];
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.InstancedMesh)) return;
      const ud = obj.userData as Record<string, unknown>;
      if (ud.isCoalesced) return;          // skip merged IMs we already own
      if (ud.__coalescedInto) return;      // skip source IMs already merged
      if (this._preBatchUUIDs.has(obj.uuid)) return; // skip pre-existing IMs
      newIMs.push(obj);
    });

    if (newIMs.length === 0) {
      this._preBatchUUIDs.clear();
      return;
    }

    // ── 2. Group new IMs by (levelId, geometryUUID, materialUUID) ─────────
    //       levelId and elementId come from the parent wall Group's userData.
    const pending = new Map<string, SourceRecord[]>();

    for (const im of newIMs) {
      const parentUD = (im.parent?.userData ?? {}) as Record<string, unknown>;
      const levelId = parentUD.levelId as string | undefined;
      const elementId = (parentUD.id ?? parentUD.elementId) as ElementId | undefined;
      if (!levelId || !elementId) continue;

      const geoUUID = im.geometry.uuid;
      const mat = Array.isArray(im.material) ? im.material[0] : im.material;
      if (!mat) continue;
      const matUUID = mat.uuid;

      const key = `${levelId}:${geoUUID}:${matUUID}`;
      if (!pending.has(key)) pending.set(key, []);
      pending.get(key)!.push({ elementId, obj: im, count: im.count });
    }

    // ── 3. Merge groups with ≥2 source IMs into a single InstancedMesh ────
    let coalescedGroups = 0;
    let totalInstances = 0;

    for (const [key, sources] of pending) {
      if (sources.length < 2) continue;

      const first = sources[0]!;
      const geo = first.obj.geometry;
      const mat = Array.isArray(first.obj.material)
        ? first.obj.material[0]
        : first.obj.material;
      if (!mat) continue;

      const totalCount = sources.reduce((sum, s) => sum + s.count, 0);
      if (totalCount === 0) continue;

      const merged = new THREE.InstancedMesh(geo, mat, totalCount);
      merged.userData.isCoalesced = true;
      merged.userData.coalescedKey = key;
      merged.castShadow = first.obj.castShadow;
      merged.receiveShadow = first.obj.receiveShadow;

      const instanceIndexToElementId = new Map<number, ElementId>();
      const tempMatrix = new THREE.Matrix4();
      let offset = 0;

      for (const src of sources) {
        // Each source IM's instances are in the wall Group's local space.
        // We need world-space matrices for the merged IM (which is a child of
        // the scene root, not a wall Group).
        src.obj.updateWorldMatrix(true, false);

        for (let i = 0; i < src.count; i++) {
          src.obj.getMatrixAt(i, tempMatrix);
          // world = IM world transform × per-instance local matrix
          tempMatrix.premultiply(src.obj.matrixWorld);
          merged.setMatrixAt(offset, tempMatrix);
          instanceIndexToElementId.set(offset, src.elementId);
          offset++;
        }

        // Hide source — keeps it traversable for GpuPickStrategy.
        src.obj.visible = false;
        (src.obj.userData as Record<string, unknown>).__coalescedInto = merged;
      }

      merged.instanceMatrix.needsUpdate = true;
      scene.add(merged);

      this._groups.set(key, {
        instancedMesh: merged,
        instanceIndexToElementId,
        sources: [...sources],
      });

      coalescedGroups++;
      totalInstances += totalCount;
    }

    console.log(
      `[InstancedMeshCoalescer] §ADR-046 post-batch coalesce: ` +
      `newIMs=${newIMs.length} mergedGroups=${coalescedGroups} ` +
      `totalInstances=${totalInstances}`,
    );

    this._preBatchUUIDs.clear();
  }

  private _decoalesceInternal(elementId: ElementId): void {
    for (const [key, group] of this._groups) {
      const memberSources = group.sources.filter(s => s.elementId === elementId);
      if (memberSources.length === 0) continue;

      // Restore visibility of this element's source IMs.
      for (const src of memberSources) {
        src.obj.visible = true;
        delete src.obj.userData.__coalescedInto;
      }

      const remaining = group.sources.filter(s => s.elementId !== elementId);

      if (remaining.length < 2) {
        // Too few sources to justify a merged IM — tear it down.
        this._destroyGroup(group, /* restoreSources */ false);
        this._groups.delete(key);
        // Restore the remaining source(s) visibility too.
        for (const src of remaining) {
          src.obj.visible = true;
          delete src.obj.userData.__coalescedInto;
        }
        return;
      }

      // Rebuild merged IM with only the remaining sources.
      const scene = this._getScene();
      this._destroyGroup(group, /* restoreSources */ false);

      if (scene === null) { this._groups.delete(key); return; }

      const first = remaining[0]!;
      const geo = first.obj.geometry;
      const mat = Array.isArray(first.obj.material)
        ? first.obj.material[0]
        : first.obj.material;
      if (!mat) { this._groups.delete(key); return; }

      const totalCount = remaining.reduce((s, r) => s + r.count, 0);
      const rebuilt = new THREE.InstancedMesh(geo, mat, totalCount);
      rebuilt.userData.isCoalesced = true;
      rebuilt.userData.coalescedKey = key;

      const instanceIndexToElementId = new Map<number, ElementId>();
      const tempMatrix = new THREE.Matrix4();
      let offset = 0;

      for (const src of remaining) {
        src.obj.updateWorldMatrix(true, false);
        for (let i = 0; i < src.count; i++) {
          src.obj.getMatrixAt(i, tempMatrix);
          tempMatrix.premultiply(src.obj.matrixWorld);
          rebuilt.setMatrixAt(offset, tempMatrix);
          instanceIndexToElementId.set(offset, src.elementId);
          offset++;
        }
        src.obj.visible = false;
        (src.obj.userData as Record<string, unknown>).__coalescedInto = rebuilt;
      }

      rebuilt.instanceMatrix.needsUpdate = true;
      scene.add(rebuilt);

      group.instancedMesh = rebuilt;
      group.instanceIndexToElementId = instanceIndexToElementId;
      group.sources = remaining;

      return;
    }
  }

  /**
   * Remove the merged IM from the scene (and optionally restore source
   * InstancedMesh visibility).  Does NOT dispose geometry — it's shared.
   */
  private _destroyGroup(group: CoalescedGroup, restoreSources: boolean): void {
    group.instancedMesh.removeFromParent();
    // Note: geometry.dispose() intentionally omitted — the geometry is a
    // shared reference owned by the per-wall InstancedMeshes still in the
    // scene graph.  Disposing it here would corrupt the per-wall meshes.
    if (restoreSources) {
      for (const src of group.sources) {
        src.obj.visible = true;
        delete src.obj.userData.__coalescedInto;
      }
    }
  }
}
