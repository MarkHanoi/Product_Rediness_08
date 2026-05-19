// CubeCommitter — the canonical L5 PrimitiveCommitter for the toy-cube
// plugin.  THREE imports are allowed here per ADR-005 + the
// `pryzm/no-three-outside-committer` rule's `plugins/<name>/src/committer.ts`
// allowlist (S05).
//
// Mirrors the in-test committer used by
// `packages/scene-committer/__tests__/cube-committer-e2e.test.ts` but
// owns its own geometry and material so consumers can use it without
// having to plumb a MaterialPool reference.  This is what
// `apps/editor/bootstrap.render.ts` registers when invoked through the
// `?pryzm2=1` URL flag (S06-T7 / Hello-Cube demo).

import * as THREE from '@pryzm/renderer-three/three';
import type {
  ElementId,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';

export interface CubeDto {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export class CubeCommitter implements PrimitiveCommitter<CubeDto, THREE.Mesh> {
  readonly primitiveType = 'cube';
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly material = new THREE.MeshStandardMaterial({
    color: 0x4f86ff,
    roughness: 0.6,
    metalness: 0.05,
  });

  onAdd(_id: ElementId, dto: CubeDto): THREE.Mesh {
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.position.set(dto.x, dto.y, dto.z);
    mesh.name = `cube:${_id}`;
    return mesh;
  }

  onUpdate(_id: ElementId, dto: CubeDto, mesh: THREE.Mesh): void {
    mesh.position.set(dto.x, dto.y, dto.z);
  }

  onRemove(_id: ElementId, _mesh: THREE.Mesh): void {
    // Geometry + material are shared across cubes — they're released
    // in onDispose.  No per-instance teardown needed.
  }

  onDispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
