// RoofCommitter — `PrimitiveCommitter<RoofData, THREE.Mesh>` (S11-T3).
//
// Roofs do not depend on a host wall — placement is fully described by
// the boundary polygon.  Producer is `produceRoof(roof, joinData,
// worldY)` from S10.  We pass NO_JOINS as the placeholder and worldY=0
// (level offsets handled by the editor's level system; out of scope
// for the standalone committer).

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceRoof,
  NO_JOINS,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { RoofData } from '../store.js';
import { buildRoofBufferGeometry, disposeRoofGeometry } from './geometry-bridge.js';
import { makeRoofMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'shape',
  'pitch',
  'thickness',
  'overhang',
  'boundary',
  'levelId',
] as const;
const MATERIAL_FIELDS = ['materialId', 'materialColor'] as const;

export interface RoofCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  hashSkips: number;
}

interface RoofSceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: RoofData;
}

export interface RoofCommitterDeps {
  readonly materialPool: MaterialPool;
  /** World-Y offset for the roof slab — defaults to 0 (top of level). */
  readonly worldY?: () => number;
}

function dirty(prev: RoofData, next: RoofData, fields: readonly (keyof RoofData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'boundary') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class RoofCommitter implements PrimitiveCommitter<RoofData, THREE.Mesh> {
  readonly primitiveType = 'roof';

  private readonly entries = new Map<ElementId, RoofSceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY: () => number;
  readonly stats: RoofCommitterStats = {
    rebuilds: 0,
    materialSwaps: 0,
    hashSkips: 0,
  };

  constructor(deps: RoofCommitterDeps) {
    if (!deps.materialPool) throw new Error('[RoofCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: RoofData): THREE.Mesh {
    const desc = produceRoof(dto, NO_JOINS, this.worldY());
    const geometry = buildRoofBufferGeometry(desc);
    const handles = this.acquireHandles(desc);
    const mesh = new THREE.Mesh(geometry, handles.map((h) => h.material));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'roof';
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh,
      materialHandles: handles,
      descriptorHash: desc.hash,
      prevDto: dto,
    });
    return mesh;
  }

  onUpdate(id: ElementId, dto: RoofData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) {
      this.onAdd(id, dto);
      return;
    }
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof RoofData)[]);
    const matChanged = dirty(entry.prevDto, dto, MATERIAL_FIELDS as readonly (keyof RoofData)[]);
    entry.prevDto = dto;

    if (geomChanged) {
      const desc = produceRoof(dto, NO_JOINS, this.worldY());
      if (desc.hash === entry.descriptorHash) {
        this.stats.hashSkips += 1;
        return;
      }
      for (const h of entry.materialHandles) h.release();
      const newGeometry = buildRoofBufferGeometry(desc);
      const newHandles = this.acquireHandles(desc);
      disposeRoofGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = newGeometry;
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }

    if (matChanged) {
      const desc = produceRoof(dto, NO_JOINS, this.worldY());
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
    disposeRoofGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeRoofGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private acquireHandles(desc: BufferGeometryDescriptor): MaterialHandle[] {
    return desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeRoofMaterialFactory(key)),
    );
  }
}
