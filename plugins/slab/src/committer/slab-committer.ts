// SlabCommitter — `PrimitiveCommitter<SlabData, THREE.Mesh>` (S12-T2).
//
// Mirrors `plugins/roof/src/committer/roof-committer.ts`.  Slabs do
// not depend on a host element — placement is fully described by the
// boundary polygon + thickness.  Producer is `produceSlab(slab,
// joinData, worldY)`; we pass NO_JOINS as the placeholder.

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceSlab,
  NO_JOINS,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { SlabData } from '../store.js';
import { buildSlabBufferGeometry, disposeSlabGeometry } from './geometry-bridge.js';
import { makeSlabMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'boundary',
  'holes',
  'thickness',
  'baseOffset',
  'levelId',
] as const;
const MATERIAL_FIELDS = ['materialId', 'materialColor', 'systemTypeId'] as const;

export interface SlabCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  hashSkips: number;
}

interface SlabSceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: SlabData;
}

export interface SlabCommitterDeps {
  readonly materialPool: MaterialPool;
  /** World-Y offset for the level the slab lives on.  Defaults to 0. */
  readonly worldY?: () => number;
}

function dirty(prev: SlabData, next: SlabData, fields: readonly (keyof SlabData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'boundary' || k === 'holes') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class SlabCommitter implements PrimitiveCommitter<SlabData, THREE.Mesh> {
  readonly primitiveType = 'slab';

  private readonly entries = new Map<ElementId, SlabSceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY: () => number;
  readonly stats: SlabCommitterStats = {
    rebuilds: 0,
    materialSwaps: 0,
    hashSkips: 0,
  };

  constructor(deps: SlabCommitterDeps) {
    if (!deps.materialPool) throw new Error('[SlabCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: SlabData): THREE.Mesh {
    const desc = produceSlab(dto, NO_JOINS, this.worldY());
    const geometry = buildSlabBufferGeometry(desc);
    const handles = this.acquireHandles(desc);
    const mesh = new THREE.Mesh(geometry, handles.map((h) => h.material));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'slab';
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh,
      materialHandles: handles,
      descriptorHash: desc.hash,
      prevDto: dto,
    });
    return mesh;
  }

  onUpdate(id: ElementId, dto: SlabData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) {
      this.onAdd(id, dto);
      return;
    }
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof SlabData)[]);
    const matChanged = dirty(entry.prevDto, dto, MATERIAL_FIELDS as readonly (keyof SlabData)[]);
    entry.prevDto = dto;

    if (geomChanged) {
      const desc = produceSlab(dto, NO_JOINS, this.worldY());
      if (desc.hash === entry.descriptorHash) {
        this.stats.hashSkips += 1;
        return;
      }
      for (const h of entry.materialHandles) h.release();
      const newGeometry = buildSlabBufferGeometry(desc);
      const newHandles = this.acquireHandles(desc);
      disposeSlabGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = newGeometry;
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }

    if (matChanged) {
      const desc = produceSlab(dto, NO_JOINS, this.worldY());
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
    disposeSlabGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeSlabGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private acquireHandles(desc: BufferGeometryDescriptor): MaterialHandle[] {
    return desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeSlabMaterialFactory(key)),
    );
  }
}
