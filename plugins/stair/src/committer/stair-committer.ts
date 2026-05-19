// StairCommitter — `PrimitiveCommitter<StairData, THREE.Mesh>` (S14-T1).
//
// Mirrors `plugins/slab/src/committer/slab-committer.ts`.

import * as THREE from '@pryzm/renderer-three/three';
import { produceStair, NO_JOINS, type BufferGeometryDescriptor } from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { StairData } from '../store.js';
import { buildStairBufferGeometry, disposeStairGeometry } from './geometry-bridge.js';
import { makeStairMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'shape', 'origin', 'rotation', 'treadDepth', 'riserHeight',
  'width', 'numRisers', 'levelId',
] as const;
const MATERIAL_FIELDS = ['materialId'] as const;

export interface StairCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  hashSkips: number;
}

interface SceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: StairData;
}

export interface StairCommitterDeps {
  readonly materialPool: MaterialPool;
  readonly worldY?: () => number;
}

function dirty(prev: StairData, next: StairData, fields: readonly (keyof StairData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'origin') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class StairCommitter implements PrimitiveCommitter<StairData, THREE.Mesh> {
  readonly primitiveType = 'stair';
  private readonly entries = new Map<ElementId, SceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY: () => number;
  readonly stats: StairCommitterStats = { rebuilds: 0, materialSwaps: 0, hashSkips: 0 };

  constructor(deps: StairCommitterDeps) {
    if (!deps.materialPool) throw new Error('[StairCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: StairData): THREE.Mesh {
    const desc = produceStair(dto, NO_JOINS, this.worldY());
    const geometry = buildStairBufferGeometry(desc);
    const handles = this.acquireHandles(desc);
    const mesh = new THREE.Mesh(geometry, handles.map((h) => h.material));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'stair';
    this.stats.rebuilds += 1;
    this.entries.set(id, { mesh, materialHandles: handles, descriptorHash: desc.hash, prevDto: dto });
    return mesh;
  }

  onUpdate(id: ElementId, dto: StairData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) { this.onAdd(id, dto); return; }
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof StairData)[]);
    const matChanged = dirty(entry.prevDto, dto, MATERIAL_FIELDS as readonly (keyof StairData)[]);
    entry.prevDto = dto;
    if (geomChanged) {
      const desc = produceStair(dto, NO_JOINS, this.worldY());
      if (desc.hash === entry.descriptorHash) { this.stats.hashSkips += 1; return; }
      for (const h of entry.materialHandles) h.release();
      const newGeom = buildStairBufferGeometry(desc);
      const newHandles = this.acquireHandles(desc);
      disposeStairGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = newGeom;
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }
    if (matChanged) {
      const desc = produceStair(dto, NO_JOINS, this.worldY());
      for (const h of entry.materialHandles) h.release();
      const newHandles = this.acquireHandles(desc);
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      this.stats.materialSwaps += 1;
    }
  }

  onRemove(id: ElementId, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const h of entry.materialHandles) h.release();
    disposeStairGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeStairGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private acquireHandles(desc: BufferGeometryDescriptor): MaterialHandle[] {
    return desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeStairMaterialFactory(key)),
    );
  }
}
