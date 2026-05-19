// StructuralCommitter — `PrimitiveCommitter<StructuralData, THREE.Mesh>` (S26).

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceStructural,
  NO_JOINS,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { StructuralData } from '../store.js';
import { buildStructuralBufferGeometry, disposeStructuralGeometry } from './geometry-bridge.js';
import { makeStructuralMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'origin', 'endOffset', 'kind', 'width', 'depth', 'thickness',
  'radius', 'rotation', 'baseOffset', 'levelId',
] as const;
const MATERIAL_FIELDS = ['materialId'] as const;

export interface StructuralCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  hashSkips: number;
}

interface SceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: StructuralData;
}

export interface StructuralCommitterDeps {
  readonly materialPool: MaterialPool;
  readonly worldY?: () => number;
}

function dirty(prev: StructuralData, next: StructuralData, fields: readonly (keyof StructuralData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'origin' || k === 'endOffset') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class StructuralCommitter implements PrimitiveCommitter<StructuralData, THREE.Mesh> {
  readonly primitiveType = 'structural';
  private readonly entries = new Map<ElementId, SceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY: () => number;
  readonly stats: StructuralCommitterStats = { rebuilds: 0, materialSwaps: 0, hashSkips: 0 };

  constructor(deps: StructuralCommitterDeps) {
    if (!deps.materialPool) throw new Error('[StructuralCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: StructuralData): THREE.Mesh {
    const desc = produceStructural(dto, NO_JOINS, this.worldY());
    const mesh = new THREE.Mesh(buildStructuralBufferGeometry(desc), this.acquireMaterials(desc));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'structural';
    mesh.userData.kind = dto.kind;
    this.stats.rebuilds += 1;
    this.entries.set(id, { mesh, materialHandles: this.lastHandles, descriptorHash: desc.hash, prevDto: dto });
    return mesh;
  }

  onUpdate(id: ElementId, dto: StructuralData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) { this.onAdd(id, dto); return; }
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof StructuralData)[]);
    const matChanged  = dirty(entry.prevDto, dto, MATERIAL_FIELDS as readonly (keyof StructuralData)[]);
    entry.prevDto = dto;
    if (geomChanged) {
      const desc = produceStructural(dto, NO_JOINS, this.worldY());
      if (desc.hash === entry.descriptorHash) { this.stats.hashSkips += 1; return; }
      for (const h of entry.materialHandles) h.release();
      disposeStructuralGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = buildStructuralBufferGeometry(desc);
      mesh.material = this.acquireMaterials(desc);
      entry.materialHandles = this.lastHandles;
      entry.descriptorHash = desc.hash;
      mesh.userData.kind = dto.kind;
      this.stats.rebuilds += 1;
      return;
    }
    if (matChanged) {
      const desc = produceStructural(dto, NO_JOINS, this.worldY());
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
    disposeStructuralGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeStructuralGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private lastHandles: MaterialHandle[] = [];
  private acquireMaterials(desc: BufferGeometryDescriptor): THREE.Material[] {
    const handles = desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeStructuralMaterialFactory(key)),
    );
    this.lastHandles = handles;
    return handles.map((h) => h.material);
  }
}
