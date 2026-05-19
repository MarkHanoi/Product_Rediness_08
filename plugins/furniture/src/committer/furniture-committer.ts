// FurnitureCommitter — `PrimitiveCommitter<FurnitureData, THREE.Mesh>`
// (S27 / ADR-0027).
//
// LOD swaps surface as a producer hash change (the hash includes
// `lod=<n>` and a per-LOD content fingerprint); the committer's
// standard rebuild path therefore handles mesh-swap on `setActiveLod`
// without any LOD-aware special-casing.

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceFurniture,
  NO_JOINS,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { FurnitureData } from '../store.js';
import { buildFurnitureBufferGeometry, disposeFurnitureGeometry } from './geometry-bridge.js';
import { makeFurnitureMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'origin', 'rotation', 'scale', 'activeLod', 'representations', 'levelId', 'catalogId',
] as const;
const MATERIAL_FIELDS = ['materialId', 'materialSlots'] as const;

export interface FurnitureCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  hashSkips: number;
  lodSwaps: number;
}

interface SceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: FurnitureData;
}

export interface FurnitureCommitterDeps {
  readonly materialPool: MaterialPool;
  readonly worldY?: () => number;
}

function dirty(prev: FurnitureData, next: FurnitureData, fields: readonly (keyof FurnitureData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'origin' || k === 'representations' || k === 'materialSlots') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class FurnitureCommitter implements PrimitiveCommitter<FurnitureData, THREE.Mesh> {
  readonly primitiveType = 'furniture';
  private readonly entries = new Map<ElementId, SceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY: () => number;
  readonly stats: FurnitureCommitterStats = {
    rebuilds: 0, materialSwaps: 0, hashSkips: 0, lodSwaps: 0,
  };

  constructor(deps: FurnitureCommitterDeps) {
    if (!deps.materialPool) throw new Error('[FurnitureCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: FurnitureData): THREE.Mesh {
    const desc = produceFurniture(dto, NO_JOINS, this.worldY());
    const mesh = new THREE.Mesh(buildFurnitureBufferGeometry(desc), this.acquireMaterials(desc));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'furniture';
    mesh.userData.catalogId = dto.catalogId;
    mesh.userData.activeLod = dto.activeLod;
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh,
      materialHandles: this.lastHandles,
      descriptorHash: desc.hash,
      prevDto: dto,
    });
    return mesh;
  }

  onUpdate(id: ElementId, dto: FurnitureData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) { this.onAdd(id, dto); return; }
    const lodChanged = entry.prevDto.activeLod !== dto.activeLod;
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof FurnitureData)[]);
    const matChanged  = dirty(entry.prevDto, dto, MATERIAL_FIELDS as readonly (keyof FurnitureData)[]);
    entry.prevDto = dto;
    if (geomChanged) {
      const desc = produceFurniture(dto, NO_JOINS, this.worldY());
      if (desc.hash === entry.descriptorHash) { this.stats.hashSkips += 1; return; }
      for (const h of entry.materialHandles) h.release();
      disposeFurnitureGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = buildFurnitureBufferGeometry(desc);
      mesh.material = this.acquireMaterials(desc);
      entry.materialHandles = this.lastHandles;
      entry.descriptorHash = desc.hash;
      mesh.userData.activeLod = dto.activeLod;
      this.stats.rebuilds += 1;
      if (lodChanged) this.stats.lodSwaps += 1;
      return;
    }
    if (matChanged) {
      const desc = produceFurniture(dto, NO_JOINS, this.worldY());
      for (const h of entry.materialHandles) h.release();
      mesh.material = this.acquireMaterials(desc);
      entry.materialHandles = this.lastHandles;
      this.stats.materialSwaps += 1;
    }
  }

  onRemove(id: ElementId, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const h of entry.materialHandles) h.release();
    disposeFurnitureGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeFurnitureGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private lastHandles: MaterialHandle[] = [];
  private acquireMaterials(desc: BufferGeometryDescriptor): THREE.Material[] {
    const handles = desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeFurnitureMaterialFactory(key)),
    );
    this.lastHandles = handles;
    return handles.map((h) => h.material);
  }
}
