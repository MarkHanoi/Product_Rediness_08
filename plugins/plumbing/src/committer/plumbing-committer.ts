// PlumbingCommitter — `PrimitiveCommitter<PlumbingData, THREE.Mesh>` (S26).

import * as THREE from '@pryzm/renderer-three/three';
import {
  producePlumbing,
  NO_JOINS,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { PlumbingData } from '../store.js';
import { buildPlumbingBufferGeometry, disposePlumbingGeometry } from './geometry-bridge.js';
import { makePlumbingMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'origin', 'kind', 'diameter', 'wallThickness', 'length',
  'rotation', 'baseOffset', 'bendRadius', 'levelId',
] as const;
const MATERIAL_FIELDS = ['systemTag', 'materialId'] as const;

export interface PlumbingCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  hashSkips: number;
}

interface SceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: PlumbingData;
}

export interface PlumbingCommitterDeps {
  readonly materialPool: MaterialPool;
  readonly worldY?: () => number;
}

function dirty(prev: PlumbingData, next: PlumbingData, fields: readonly (keyof PlumbingData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'origin') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class PlumbingCommitter implements PrimitiveCommitter<PlumbingData, THREE.Mesh> {
  readonly primitiveType = 'plumbing';
  private readonly entries = new Map<ElementId, SceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY: () => number;
  readonly stats: PlumbingCommitterStats = { rebuilds: 0, materialSwaps: 0, hashSkips: 0 };

  constructor(deps: PlumbingCommitterDeps) {
    if (!deps.materialPool) throw new Error('[PlumbingCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: PlumbingData): THREE.Mesh {
    const desc = producePlumbing(dto, NO_JOINS, this.worldY());
    const mesh = new THREE.Mesh(buildPlumbingBufferGeometry(desc), this.acquireMaterials(desc));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'plumbing';
    mesh.userData.systemTag = dto.systemTag;
    this.stats.rebuilds += 1;
    this.entries.set(id, { mesh, materialHandles: this.lastHandles, descriptorHash: desc.hash, prevDto: dto });
    return mesh;
  }

  onUpdate(id: ElementId, dto: PlumbingData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) { this.onAdd(id, dto); return; }
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof PlumbingData)[]);
    const matChanged  = dirty(entry.prevDto, dto, MATERIAL_FIELDS as readonly (keyof PlumbingData)[]);
    entry.prevDto = dto;
    if (geomChanged) {
      const desc = producePlumbing(dto, NO_JOINS, this.worldY());
      if (desc.hash === entry.descriptorHash) { this.stats.hashSkips += 1; return; }
      for (const h of entry.materialHandles) h.release();
      disposePlumbingGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = buildPlumbingBufferGeometry(desc);
      mesh.material = this.acquireMaterials(desc);
      entry.materialHandles = this.lastHandles;
      entry.descriptorHash = desc.hash;
      mesh.userData.systemTag = dto.systemTag;
      this.stats.rebuilds += 1;
      return;
    }
    if (matChanged) {
      const desc = producePlumbing(dto, NO_JOINS, this.worldY());
      for (const h of entry.materialHandles) h.release();
      mesh.material = this.acquireMaterials(desc);
      entry.materialHandles = this.lastHandles;
      mesh.userData.systemTag = dto.systemTag;
      this.stats.materialSwaps += 1;
    }
  }

  onRemove(id: ElementId, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const h of entry.materialHandles) h.release();
    disposePlumbingGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposePlumbingGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private lastHandles: MaterialHandle[] = [];
  private acquireMaterials(desc: BufferGeometryDescriptor): THREE.Material[] {
    const handles = desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makePlumbingMaterialFactory(key)),
    );
    this.lastHandles = handles;
    return handles.map((h) => h.material);
  }
}
