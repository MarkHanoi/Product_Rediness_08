// ColumnCommitter — `PrimitiveCommitter<ColumnData, THREE.Mesh>` (S12-T3).

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceColumn,
  NO_JOINS,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { ColumnData } from '../store.js';
import { buildColumnBufferGeometry, disposeColumnGeometry } from './geometry-bridge.js';
import { makeColumnMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'origin', 'shape', 'width', 'depth', 'height', 'baseOffset', 'rotation', 'levelId', 'topLevelId',
] as const;
const MATERIAL_FIELDS = ['materialId'] as const;

export interface ColumnCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  hashSkips: number;
}

interface ColumnSceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: ColumnData;
}

export interface ColumnCommitterDeps {
  readonly materialPool: MaterialPool;
  readonly worldY?: () => number;
}

function dirty(prev: ColumnData, next: ColumnData, fields: readonly (keyof ColumnData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'origin') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class ColumnCommitter implements PrimitiveCommitter<ColumnData, THREE.Mesh> {
  readonly primitiveType = 'column';
  private readonly entries = new Map<ElementId, ColumnSceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY: () => number;
  readonly stats: ColumnCommitterStats = { rebuilds: 0, materialSwaps: 0, hashSkips: 0 };

  constructor(deps: ColumnCommitterDeps) {
    if (!deps.materialPool) throw new Error('[ColumnCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: ColumnData): THREE.Mesh {
    const desc = produceColumn(dto, NO_JOINS, this.worldY());
    const mesh = new THREE.Mesh(buildColumnBufferGeometry(desc), this.acquireMaterials(desc));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'column';
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh,
      materialHandles: this.lastHandles,
      descriptorHash: desc.hash,
      prevDto: dto,
    });
    return mesh;
  }

  onUpdate(id: ElementId, dto: ColumnData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) { this.onAdd(id, dto); return; }
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof ColumnData)[]);
    const matChanged = dirty(entry.prevDto, dto, MATERIAL_FIELDS as readonly (keyof ColumnData)[]);
    entry.prevDto = dto;
    if (geomChanged) {
      const desc = produceColumn(dto, NO_JOINS, this.worldY());
      if (desc.hash === entry.descriptorHash) { this.stats.hashSkips += 1; return; }
      for (const h of entry.materialHandles) h.release();
      disposeColumnGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = buildColumnBufferGeometry(desc);
      mesh.material = this.acquireMaterials(desc);
      entry.materialHandles = this.lastHandles;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }
    if (matChanged) {
      const desc = produceColumn(dto, NO_JOINS, this.worldY());
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
    disposeColumnGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeColumnGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private lastHandles: MaterialHandle[] = [];
  private acquireMaterials(desc: BufferGeometryDescriptor): THREE.Material[] {
    const handles = desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeColumnMaterialFactory(key)),
    );
    this.lastHandles = handles;
    return handles.map((h) => h.material);
  }
}
