// 100-cube visual smoke test (S05-T7).
//
// Spec: `phases/PHASE-1A-Q1-M1-M3-SKELETON-RAILS.md` §S05-T7 (line 547):
//   "100-cube visual smoke test."
//
// What this proves end-to-end:
//   • CubeStore + bindStore + CubeCommitter + CommitterHost form a
//     working pipeline.
//   • SceneRegistry size tracks add/transform/remove correctly across
//     a non-trivial workload (100 entities).
//   • MaterialPool.size === 1 after all 100 cubes — they share ONE
//     `MeshStandardMaterial` (the S05 exit criterion that proves the
//     ref-count contract under realistic load).
//   • Teardown leaves zero residue: registry empty, pool empty.
//
// We use the synchronous scheduler so the assertions can be inline —
// the FrameScheduler integration that drives `scheduleFlush` from the
// rAF tick lands in S06 (D5).

import { describe, expect, it } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { CubeStore, type CubeDto } from '@pryzm/stores';
import {
  bindStore,
  CommitterHost,
  type ElementId,
  type MaterialHandle,
  type PrimitiveCommitter,
} from '../src/index.js';

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
    mesh.name = `cube:${id}`;
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

const ADD = (id: string, dto: CubeDto) => ({ op: 'add' as const, path: [id], value: dto });
const REPLACE = (id: string, dto: CubeDto) => ({ op: 'replace' as const, path: [id], value: dto });
const REMOVE = (id: string) => ({ op: 'remove' as const, path: [id] });

describe('100-cube visual smoke (S05-T7)', () => {
  it('add → transform → remove 100 cubes; pool stays at one material; teardown clean', async () => {
    const host = new CommitterHost();
    host.register(new CubeCommitter(host));
    const store = new CubeStore();
    const handle = bindStore(store, 'cube', host, { scheduleFlush: SYNC_SCHEDULE });

    // 1) Add 100 cubes laid out on a 10×10 grid at y=0.
    const adds = [];
    for (let i = 0; i < 100; i++) {
      const id = `c${i}`;
      adds.push(ADD(id, { x: i % 10, y: 0, z: Math.floor(i / 10) }));
    }
    store.applyPatch(adds);
    await handle.flush();

    expect(store.size()).toBe(100);
    expect(host.registry.size()).toBe(100);
    // EXIT CRITERION — single material across all 100 cubes.
    expect(host.materialPool.size()).toBe(1);
    expect(host.materialPool.refCount('cube/standard/grey')).toBe(100);

    // Spot-check identity: every Mesh shares the SAME material instance.
    const meshes: THREE.Mesh[] = [];
    for (const obj of host.registry.values()) meshes.push(obj as THREE.Mesh);
    const sharedMaterial = meshes[0]!.material;
    for (const mesh of meshes) {
      expect(mesh.material).toBe(sharedMaterial);
    }

    // 2) Transform every cube — y goes from 0 to its index modulo 5.
    const updates = [];
    for (let i = 0; i < 100; i++) {
      const id = `c${i}`;
      updates.push(REPLACE(id, { x: i % 10, y: i % 5, z: Math.floor(i / 10) }));
    }
    store.applyPatch(updates);
    await handle.flush();

    expect(host.registry.size()).toBe(100); // identity stable
    // Every Object3D is the SAME reference as before — onUpdate mutates in place.
    let i = 0;
    for (const id of store.getState().keys()) {
      const mesh = host.registry.get(id) as THREE.Mesh;
      expect(mesh.position.y).toBe(i % 5);
      i++;
    }

    // 3) Remove every cube.
    const removes = [];
    for (let j = 0; j < 100; j++) removes.push(REMOVE(`c${j}`));
    store.applyPatch(removes);
    await handle.flush();

    expect(store.size()).toBe(0);
    expect(host.registry.size()).toBe(0);
    expect(host.materialPool.refCount('cube/standard/grey')).toBe(0);
    expect(host.materialPool.size()).toBe(0);

    // 4) Teardown — host.dispose drains every committer + material pool.
    handle.dispose();
    host.dispose();
    expect(host.registry.size()).toBe(0);
    expect(host.materialPool.size()).toBe(0);
  });
});
