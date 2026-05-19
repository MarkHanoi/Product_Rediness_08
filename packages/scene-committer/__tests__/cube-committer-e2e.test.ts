// CubeStore + CubeCommitter end-to-end test (S04-T9).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` line 442:
//   "CubeStore + CubeCommitter end-to-end test."
//
// Pipeline exercised:
//   CommandBus.executeCommand('cube.move', …)
//     → PatchEmitter listener → applyToLocalCubeStore (adapter)
//     → CommitterHost.commit(delta)
//     → CubeCommitter.onAdd / onUpdate / onRemove
//     → SceneRegistry binds the THREE.Mesh
//
// What this proves:
//   * The `PrimitiveCommitter` interface is sufficient to reify a store
//     DTO in the THREE scene.
//   * `SceneRegistry` IDs survive add → update → remove (stable
//     reference per ADR-005).
//   * `MaterialPool` shares one MeshStandardMaterial across N cubes
//     (ref count == N).

import { describe, expect, it } from 'vitest';
import { applyPatches } from 'immer';
import * as THREE from '@pryzm/renderer-three/three';
import {
  CommandBus,
  produceCommand,
  type CommandHandler,
  type HandlerContext,
  type HandlerResult,
  type ValidationResult,
} from '@pryzm/command-bus';
import {
  CommitterHost,
  MaterialPool,
  type ElementId,
  type MaterialHandle,
  type PrimitiveCommitter,
  type SceneDelta,
} from '../src/index.js';

interface CubeDto {
  x: number;
  y: number;
  z: number;
}
type CubeStores = Readonly<{ cube: Record<string, CubeDto> } & Record<string, unknown>>;

class MoveCube implements CommandHandler<{ id: string; dx: number; dy: number; dz: number }, CubeStores> {
  readonly type = 'cube.move';
  readonly affectedStores = ['cube'] as const;
  canExecute(): ValidationResult {
    return { valid: true };
  }
  execute(ctx: HandlerContext<CubeStores>, cmd: { id: string; dx: number; dy: number; dz: number }): HandlerResult {
    const [next, forward, inverse] = produceCommand<Record<string, CubeDto>>(
      ctx.stores.cube,
      (draft) => {
        const c = draft[cmd.id] ?? { x: 0, y: 0, z: 0 };
        c.x += cmd.dx;
        c.y += cmd.dy;
        c.z += cmd.dz;
        draft[cmd.id] = c;
      },
    );
    return { forward, inverse, nextStates: { cube: next } };
  }
}

class RemoveCube implements CommandHandler<{ id: string }, CubeStores> {
  readonly type = 'cube.remove';
  readonly affectedStores = ['cube'] as const;
  canExecute(): ValidationResult {
    return { valid: true };
  }
  execute(ctx: HandlerContext<CubeStores>, cmd: { id: string }): HandlerResult {
    const [next, forward, inverse] = produceCommand<Record<string, CubeDto>>(
      ctx.stores.cube,
      (draft) => {
        delete draft[cmd.id];
      },
    );
    return { forward, inverse, nextStates: { cube: next } };
  }
}

/** The CubeCommitter is the canonical PrimitiveCommitter shape — it
 *  owns geometry, fetches materials from the pool, mutates `mesh.position`
 *  in place on update, releases its material on remove. */
class CubeCommitter implements PrimitiveCommitter<CubeDto, THREE.Mesh> {
  readonly primitiveType = 'cube';
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly materialHandles = new Map<ElementId, MaterialHandle>();
  constructor(private readonly pool: MaterialPool) {}
  onAdd(id: ElementId, dto: CubeDto): THREE.Mesh {
    const handle = this.pool.acquire(
      'cube/standard/grey',
      () => new THREE.MeshStandardMaterial({ color: 0x808080 }),
    );
    this.materialHandles.set(id, handle);
    const mesh = new THREE.Mesh(this.geometry, handle.material);
    mesh.position.set(dto.x, dto.y, dto.z);
    mesh.name = `cube:${id}`;
    return mesh;
  }
  onUpdate(_id: ElementId, dto: CubeDto, mesh: THREE.Mesh): void {
    mesh.position.set(dto.x, dto.y, dto.z);
  }
  onRemove(id: ElementId, _mesh: THREE.Mesh): void {
    this.materialHandles.get(id)?.release();
    this.materialHandles.delete(id);
  }
  onDispose(): void {
    for (const h of this.materialHandles.values()) h.release();
    this.materialHandles.clear();
    this.geometry.dispose();
  }
}

describe('CubeStore → CommitterHost → SceneRegistry (S04-T9)', () => {
  it('reifies a cube on add, mutates in place on update, drops on remove', async () => {
    const cubes: Record<string, CubeDto> = {};
    const bus = new CommandBus({
      audit: { actorId: 'u', projectId: 'p', clientId: 'c' },
      storesProvider: () => ({ cube: cubes }),
    });
    bus.register(new MoveCube());
    bus.register(new RemoveCube());

    const host = new CommitterHost();
    host.register(new CubeCommitter(host.materialPool));

    // Wire the patch emitter → cube store → committer.  The CommandBus
    // does NOT auto-apply nextStates back to the storesProvider's
    // returned object (that's an L1 stores-layer concern landing in
    // S05); for this S04 smoke test we play the L1 role inline by
    // applying the forward patches to the local `cubes` map.  Then we
    // diff per-id and translate into SceneDeltas the host can commit.
    bus.patches.subscribe((_bytes, record) => {
      // 1) Snapshot pre-state for the IDs touched by this record.
      const touchedIds = new Set<string>();
      for (const p of record.forward) {
        if (p.path.length > 0) touchedIds.add(p.path[0] as string);
      }
      const before = new Map<string, CubeDto | undefined>();
      for (const id of touchedIds) before.set(id, cubes[id]);
      // 2) Apply forward patches to the local store (L1 role).
      const next = applyPatches(cubes, record.forward as never);
      // produceCommand starts from a frozen draft; applyPatches returns
      // a NEW object — copy back into our mutable `cubes` reference so
      // subsequent commands see the update.
      for (const k of Object.keys(cubes)) delete cubes[k];
      Object.assign(cubes, next);
      // 3) Translate per-id transitions into SceneDeltas.
      for (const id of touchedIds) {
        const wasPresent = before.get(id) !== undefined;
        const isPresent = cubes[id] !== undefined;
        let delta: SceneDelta;
        if (!wasPresent && isPresent) {
          delta = { kind: 'add', primitiveType: 'cube', id, dto: cubes[id]! };
        } else if (wasPresent && isPresent) {
          delta = { kind: 'update', primitiveType: 'cube', id, dto: cubes[id]! };
        } else if (wasPresent && !isPresent) {
          delta = { kind: 'remove', primitiveType: 'cube', id };
        } else {
          continue;
        }
        // Fire-and-forget — committer is sync today.
        void host.commit(delta);
      }
    });

    // 1) Add cube c1 at origin.
    await bus.executeCommand('cube.move', { id: 'c1', dx: 0, dy: 0, dz: 0 });
    expect(host.registry.size()).toBe(1);
    const meshA = host.registry.get('c1') as THREE.Mesh;
    expect(meshA).toBeInstanceOf(THREE.Mesh);
    expect(meshA.position.toArray()).toEqual([0, 0, 0]);
    expect(host.materialPool.size()).toBe(1);
    expect(host.materialPool.refCount('cube/standard/grey')).toBe(1);

    // 2) Update cube c1 — same Object3D reference (stability invariant).
    await bus.executeCommand('cube.move', { id: 'c1', dx: 1, dy: 2, dz: 3 });
    const meshA2 = host.registry.get('c1') as THREE.Mesh;
    expect(meshA2).toBe(meshA);
    expect(meshA2.position.toArray()).toEqual([1, 2, 3]);

    // 3) Add a second cube — material is shared (refs go to 2).
    await bus.executeCommand('cube.move', { id: 'c2', dx: 5, dy: 0, dz: 0 });
    expect(host.registry.size()).toBe(2);
    expect(host.materialPool.size()).toBe(1);
    expect(host.materialPool.refCount('cube/standard/grey')).toBe(2);
    const meshB = host.registry.get('c2') as THREE.Mesh;
    expect(meshB.material).toBe(meshA.material);

    // 4) Remove c1 — registry drops, material refs goes to 1.
    await bus.executeCommand('cube.remove', { id: 'c1' });
    expect(host.registry.has('c1')).toBe(false);
    expect(host.registry.size()).toBe(1);
    expect(host.materialPool.refCount('cube/standard/grey')).toBe(1);

    // 5) Tear down — material pool fully drains.
    host.dispose();
    expect(host.registry.size()).toBe(0);
    expect(host.materialPool.size()).toBe(0);
  });

  it('throws on update for an unknown element', async () => {
    const host = new CommitterHost();
    host.register(new CubeCommitter(host.materialPool));
    await expect(
      host.commit({ kind: 'update', primitiveType: 'cube', id: 'ghost', dto: { x: 0, y: 0, z: 0 } }),
    ).rejects.toThrow(/unknown element/);
    host.dispose();
  });

  it('throws on commit for an unregistered primitiveType', async () => {
    const host = new CommitterHost();
    await expect(
      host.commit({ kind: 'add', primitiveType: 'wall', id: 'w1', dto: {} }),
    ).rejects.toThrow(/no committer registered/);
    host.dispose();
  });
});
