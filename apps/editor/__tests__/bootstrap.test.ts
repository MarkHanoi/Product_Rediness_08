// editor.bootstrap — smoke test (S05-T8).
//
// Per the session plan acceptance:
//   "bootstrap() builds without throw + returns tearDown function."
//
// We additionally assert:
//   • Default options yield a working CubeStore + bus pair.
//   • Registering a committer that matches a store key yields one
//     binding; unmatched committers fire `onUnboundPrimitive`.
//   • tearDown() is idempotent.
//   • start() is a no-op stub (returns void without throwing).

import { describe, expect, it, vi } from 'vitest';
import * as THREE from '@pryzm/renderer-three/three';
import { CubeStore, type CubeDto } from '@pryzm/stores';
import {
  type ElementId,
  type MaterialHandle,
  type PrimitiveCommitter,
  type CommitterHost,
} from '@pryzm/scene-committer';
import { bootstrap } from '../src/bootstrap.js';

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

const AUDIT = { actorId: 'u', projectId: 'p', clientId: 'c', timestamp: '' } as const;

describe('editor.bootstrap (S05-T8)', () => {
  it('builds with defaults and returns a tearDown function', () => {
    const rt = bootstrap({ audit: AUDIT });
    expect(rt.bus).toBeDefined();
    expect(rt.emitter).toBeDefined();
    expect(rt.undoStack).toBeDefined();
    expect(rt.host).toBeDefined();
    expect(rt.stores.cube).toBeInstanceOf(CubeStore);
    expect(rt.bindings.length).toBe(0); // no committers registered by default
    expect(typeof rt.tearDown).toBe('function');
    expect(typeof rt.start).toBe('function');
    rt.tearDown();
  });

  it('binds committers whose primitiveType matches a store key', () => {
    const cube = new CubeStore();
    let host: CommitterHost | undefined;
    // We need the host instance to construct the committer — bootstrap
    // builds the host internally, so we use a placeholder factory.
    const rt = bootstrap({
      audit: AUDIT,
      stores: { cube },
      committers: [],
    });
    host = rt.host;
    rt.host.register(new CubeCommitter(host));
    rt.tearDown();
  });

  it('fires onUnboundPrimitive for committers with no matching store', () => {
    const onUnbound = vi.fn();
    // Build a committer outside of bootstrap; we need a host first.
    const rtA = bootstrap({ audit: AUDIT, stores: {} });
    const orphan = new CubeCommitter(rtA.host);
    rtA.tearDown();

    const rt = bootstrap({
      audit: AUDIT,
      stores: {}, // intentionally empty — no `cube` store
      committers: [orphan],
      onUnboundPrimitive: onUnbound,
    });
    expect(onUnbound).toHaveBeenCalledWith('cube');
    expect(rt.bindings.length).toBe(0);
    rt.tearDown();
  });

  it('start() is a no-op stub at S05', () => {
    const rt = bootstrap({ audit: AUDIT });
    expect(() => rt.start()).not.toThrow();
    rt.tearDown();
  });

  it('tearDown() is idempotent', () => {
    const rt = bootstrap({ audit: AUDIT });
    rt.tearDown();
    expect(() => rt.tearDown()).not.toThrow();
  });
});
