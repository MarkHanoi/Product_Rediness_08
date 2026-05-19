// BeamCommitter — `PrimitiveCommitter<BeamData, THREE.Mesh>` (S12-T3).

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceBeam,
  NO_JOINS,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { BeamData } from '../store.js';
import { buildBeamBufferGeometry, disposeBeamGeometry } from './geometry-bridge.js';
import { makeBeamMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = ['baseLine', 'shape', 'width', 'depth', 'rotation', 'levelId'] as const;
const MATERIAL_FIELDS = ['materialId'] as const;

export interface BeamCommitterStats {
  rebuilds: number; materialSwaps: number; hashSkips: number;
}

interface BeamSceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: BeamData;
}

export interface BeamCommitterDeps {
  readonly materialPool: MaterialPool;
  readonly worldY?: () => number;
}

function dirty(prev: BeamData, next: BeamData, fields: readonly (keyof BeamData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'baseLine') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class BeamCommitter implements PrimitiveCommitter<BeamData, THREE.Mesh> {
  readonly primitiveType = 'beam';
  private readonly entries = new Map<ElementId, BeamSceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY: () => number;
  readonly stats: BeamCommitterStats = { rebuilds: 0, materialSwaps: 0, hashSkips: 0 };
  private lastHandles: MaterialHandle[] = [];

  constructor(deps: BeamCommitterDeps) {
    if (!deps.materialPool) throw new Error('[BeamCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: BeamData): THREE.Mesh {
    const desc = produceBeam(dto, NO_JOINS, this.worldY());
    const mesh = new THREE.Mesh(buildBeamBufferGeometry(desc), this.acquireMaterials(desc));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'beam';
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh, materialHandles: this.lastHandles, descriptorHash: desc.hash, prevDto: dto,
    });
    return mesh;
  }

  onUpdate(id: ElementId, dto: BeamData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) { this.onAdd(id, dto); return; }
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof BeamData)[]);
    const matChanged = dirty(entry.prevDto, dto, MATERIAL_FIELDS as readonly (keyof BeamData)[]);
    entry.prevDto = dto;
    if (geomChanged) {
      const desc = produceBeam(dto, NO_JOINS, this.worldY());
      if (desc.hash === entry.descriptorHash) { this.stats.hashSkips += 1; return; }
      for (const h of entry.materialHandles) h.release();
      disposeBeamGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = buildBeamBufferGeometry(desc);
      mesh.material = this.acquireMaterials(desc);
      entry.materialHandles = this.lastHandles;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }
    if (matChanged) {
      const desc = produceBeam(dto, NO_JOINS, this.worldY());
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
    disposeBeamGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeBeamGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private acquireMaterials(desc: BufferGeometryDescriptor): THREE.Material[] {
    const handles = desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeBeamMaterialFactory(key)),
    );
    this.lastHandles = handles;
    return handles.map((h) => h.material);
  }
}
