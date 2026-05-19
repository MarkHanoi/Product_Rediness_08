// CeilingCommitter (S14-T8).

import * as THREE from '@pryzm/renderer-three/three';
import { produceCeiling, NO_JOINS, type BufferGeometryDescriptor } from '@pryzm/plugin-sdk';
import type {
  ElementId, MaterialHandle, MaterialPool, PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { CeilingData } from '../store.js';
import { buildCeilingBufferGeometry, disposeCeilingGeometry } from './geometry-bridge.js';
import { makeCeilingMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = ['boundary', 'ceilingHeight', 'thickness', 'levelId'] as const;
const MATERIAL_FIELDS = ['materialId', 'materialColor'] as const;

export interface CeilingCommitterStats { rebuilds: number; materialSwaps: number; hashSkips: number }

interface SceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: CeilingData;
}

export interface CeilingCommitterDeps {
  readonly materialPool: MaterialPool;
  readonly worldY?: () => number;
}

function dirty(prev: CeilingData, next: CeilingData, fields: readonly (keyof CeilingData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'boundary') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class CeilingCommitter implements PrimitiveCommitter<CeilingData, THREE.Mesh> {
  readonly primitiveType = 'ceiling';
  private readonly entries = new Map<ElementId, SceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY: () => number;
  readonly stats: CeilingCommitterStats = { rebuilds: 0, materialSwaps: 0, hashSkips: 0 };

  constructor(deps: CeilingCommitterDeps) {
    if (!deps.materialPool) throw new Error('[CeilingCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: CeilingData): THREE.Mesh {
    const desc = produceCeiling(dto, NO_JOINS, this.worldY());
    const geom = buildCeilingBufferGeometry(desc);
    const handles = this.acquireHandles(desc);
    const mesh = new THREE.Mesh(geom, handles.map((h) => h.material));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'ceiling';
    this.stats.rebuilds += 1;
    this.entries.set(id, { mesh, materialHandles: handles, descriptorHash: desc.hash, prevDto: dto });
    return mesh;
  }

  onUpdate(id: ElementId, dto: CeilingData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) { this.onAdd(id, dto); return; }
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof CeilingData)[]);
    const matChanged = dirty(entry.prevDto, dto, MATERIAL_FIELDS as readonly (keyof CeilingData)[]);
    entry.prevDto = dto;
    if (geomChanged) {
      const desc = produceCeiling(dto, NO_JOINS, this.worldY());
      if (desc.hash === entry.descriptorHash) { this.stats.hashSkips += 1; return; }
      for (const h of entry.materialHandles) h.release();
      const ng = buildCeilingBufferGeometry(desc);
      const nh = this.acquireHandles(desc);
      disposeCeilingGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = ng;
      mesh.material = nh.map((h) => h.material);
      entry.materialHandles = nh;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }
    if (matChanged) {
      const desc = produceCeiling(dto, NO_JOINS, this.worldY());
      for (const h of entry.materialHandles) h.release();
      const nh = this.acquireHandles(desc);
      mesh.material = nh.map((h) => h.material);
      entry.materialHandles = nh;
      this.stats.materialSwaps += 1;
    }
  }

  onRemove(id: ElementId, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const h of entry.materialHandles) h.release();
    disposeCeilingGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, e] of this.entries) {
      for (const h of e.materialHandles) h.release();
      disposeCeilingGeometry(e.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private acquireHandles(desc: BufferGeometryDescriptor): MaterialHandle[] {
    return desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeCeilingMaterialFactory(key)),
    );
  }
}
