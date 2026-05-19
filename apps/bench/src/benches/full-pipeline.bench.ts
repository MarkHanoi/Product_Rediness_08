// Bench: `pipeline.full.cube-tick` — < 5 ms p95 (S05-T9 hard-fail).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S05-T9 (line 555):
//   "Full pipeline bench — handler → patch → store → committer →
//    registry.  < 5 ms p95 (excludes render)."
//
// Pipeline measured (one sample = one full tick):
//   1. CommandBus.executeCommand('cube.move', …) — handler runs
//      produceCommand under Immer, returns forward+inverse patches.
//   2. PatchEmitter.encode (msgpack-v2 per ADR-004 / S04).
//   3. PatchEmitter listener → attachStores routes the patches to
//      CubeStore (L1).
//   4. CubeStore.applyPatch → DirtyDiff.
//   5. bindStore subscriber receives the diff, schedules flush,
//      flush() fires synchronously (we use a sync scheduler so the
//      whole tick lands inside one `measure` sample).
//   6. CommitterHost.commitBatch → CubeCommitter.onUpdate mutates
//      mesh.position in place; SceneRegistry stays at size 1.
//
// We exclude the render: there's no draw call in this loop — the
// SceneRegistry is the canonical "scene built" state for L5.

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import {
  CommandBus,
  PatchEmitter,
  UndoStack,
} from '@pryzm/command-bus';
import { attachStores, CubeStore, type CubeDto } from '@pryzm/stores';
import { MoveCubeCommand } from '@pryzm/plugin-toy-cube';
import {
  bindStore,
  CommitterHost,
  type ElementId,
  type MaterialHandle,
  type PrimitiveCommitter,
} from '@pryzm/scene-committer';
import { measure } from '../timing.js';
import { writeBenchSample } from '../save-baseline.js';

class CubeCommitter implements PrimitiveCommitter<CubeDto, THREE.Mesh> {
  readonly primitiveType = 'cube';
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly materialHandles = new Map<ElementId, MaterialHandle>();
  constructor(private readonly host: CommitterHost) {}
  onAdd(id: ElementId, dto: CubeDto): THREE.Mesh {
    const handle = this.host.materialPool.acquire(
      'cube/standard/grey',
      () => new THREE.MeshStandardMaterial({ color: 0x808080 }),
    );
    this.materialHandles.set(id, handle);
    const mesh = new THREE.Mesh(this.geometry, handle.material);
    mesh.position.set(dto.x, dto.y, dto.z);
    return mesh;
  }
  onUpdate(_id: ElementId, dto: CubeDto, mesh: THREE.Mesh): void {
    mesh.position.set(dto.x, dto.y, dto.z);
  }
  onRemove(id: ElementId): void {
    this.materialHandles.get(id)?.release();
    this.materialHandles.delete(id);
  }
  onDispose(): void {
    for (const h of this.materialHandles.values()) h.release();
    this.materialHandles.clear();
    this.geometry.dispose();
  }
}

const SYNC_SCHEDULE = (flush: () => void): void => {
  flush();
};

describe('pipeline.full.cube-tick', () => {
  it('handler → patch → store → committer → registry under the < 5 ms p95 budget', async () => {
    const cubeStore = new CubeStore();
    // The bus's storesProvider returns the Record<id, dto> view that
    // produceCommand mutates.  We materialise it from the Store on
    // every command; bootstrap will memoise this in S06 if it shows
    // up in this bench's profile.
    //
    // IMPORTANT — the bus's storesProvider must START EMPTY so the
    // warm-up command actually creates `c1` (Immer detects no patches
    // when the handler observes no draft change, so a pre-seeded `c1`
    // + zero-delta move would produce zero patches and the registry
    // would never see an `add`).  After warm-up we re-snapshot from
    // the Store so subsequent moves see the latest state.
    let cubeRecord: Record<string, CubeDto> = {};
    const emitter = new PatchEmitter();
    const bus = new CommandBus({
      audit: { actorId: 'bench', projectId: 'bench', clientId: 'bench' },
      storesProvider: () => ({ cube: cubeRecord }),
      emitter,
      undoStack: new UndoStack({ maxSize: 200 }),
    });
    bus.register(new MoveCubeCommand());

    // Seed the cube into the store BEFORE wiring attachStores.  We do
    // this by emitting one initial command outside the timed loop so
    // the L1 store has c1 to update on every measured tick.
    const detach = attachStores(emitter, { cube: cubeStore });

    const host = new CommitterHost();
    host.register(new CubeCommitter(host));
    const handle = bindStore(cubeStore, 'cube', host, { scheduleFlush: SYNC_SCHEDULE });

    // Warm-up: seed registry with c1.
    await bus.executeCommand('cube.move', { id: 'c1', dx: 0, dy: 0, dz: 0 });
    cubeRecord = Object.fromEntries(cubeStore.getState()) as Record<string, CubeDto>;
    await handle.flush();
    if (host.registry.size() !== 1) {
      throw new Error(`expected registry size 1 after warm-up, got ${host.registry.size()}`);
    }

    const sample = await measure(
      'pipeline.full.cube-tick',
      async () => {
        await bus.executeCommand('cube.move', { id: 'c1', dx: 1, dy: 0, dz: 0 });
        // Refresh the bus's view of the store (storesProvider snapshot).
        cubeRecord = Object.fromEntries(cubeStore.getState()) as Record<string, CubeDto>;
        // SYNC_SCHEDULE flushed already; await to drain the microtask
        // queue (commitBatchWithCounts is async).
        await handle.flush();
      },
      { samples: 500, warmup: 100, warnMs: 3.0, budgetMs: 5.0 },
    );

    writeBenchSample(sample);
    handle.dispose();
    detach();
    host.dispose();

    // Smoke assertion — the regression gate compares against baseline.json.
    expect(sample.p95).toBeGreaterThan(0);
    // Diagnostic — non-fatal even if exceeded; check-regression.mjs is
    // the canonical hard-fail.
    expect(sample.samples).toBe(500);
  });
});
