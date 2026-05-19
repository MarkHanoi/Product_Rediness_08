// CurtainWallCommitter — `PrimitiveCommitter<CurtainWallData, THREE.Mesh>` (S12-T5).

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceCurtainWall,
  NO_JOINS,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { CurtainWallData } from '../store.js';
import { buildCurtainWallBufferGeometry, disposeCurtainWallGeometry } from './geometry-bridge.js';
import { makeCurtainWallMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'baseLine', 'height', 'mullionThickness', 'bayWidth', 'bayHeight', 'panels', 'levelId',
] as const;
const MATERIAL_FIELDS = ['materialId'] as const;

export interface CurtainWallCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  hashSkips: number;
  /** Material-pool dedup counters (S13 perf fix per `code-level ADR
   *  docs/architecture/adr/0011-curtain-wall-triage-and-producer-split.md`).
   *  `poolHits` is the number of `materialPool.acquire()` calls that
   *  resolved to an already-cached material; `poolMisses` is the number
   *  that allocated a fresh THREE.Material via the factory. */
  poolHits: number;
  poolMisses: number;
}

interface CWSceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: CurtainWallData;
}

export interface CurtainWallCommitterDeps {
  readonly materialPool: MaterialPool;
  readonly worldY?: () => number;
}

function dirty(prev: CurtainWallData, next: CurtainWallData, fields: readonly (keyof CurtainWallData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'baseLine' || k === 'panels') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class CurtainWallCommitter implements PrimitiveCommitter<CurtainWallData, THREE.Mesh> {
  readonly primitiveType = 'curtainwall';
  private readonly entries = new Map<ElementId, CWSceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY: () => number;
  readonly stats: CurtainWallCommitterStats = {
    rebuilds: 0, materialSwaps: 0, hashSkips: 0, poolHits: 0, poolMisses: 0,
  };
  private lastHandles: MaterialHandle[] = [];

  constructor(deps: CurtainWallCommitterDeps) {
    if (!deps.materialPool) throw new Error('[CurtainWallCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: CurtainWallData): THREE.Mesh {
    const desc = produceCurtainWall(dto, NO_JOINS, this.worldY());
    const mesh = new THREE.Mesh(buildCurtainWallBufferGeometry(desc), this.acquireMaterials(desc));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'curtainwall';
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh, materialHandles: this.lastHandles, descriptorHash: desc.hash, prevDto: dto,
    });
    return mesh;
  }

  onUpdate(id: ElementId, dto: CurtainWallData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) { this.onAdd(id, dto); return; }
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof CurtainWallData)[]);
    const matChanged = dirty(entry.prevDto, dto, MATERIAL_FIELDS as readonly (keyof CurtainWallData)[]);
    entry.prevDto = dto;
    if (geomChanged) {
      const desc = produceCurtainWall(dto, NO_JOINS, this.worldY());
      if (desc.hash === entry.descriptorHash) { this.stats.hashSkips += 1; return; }
      for (const h of entry.materialHandles) h.release();
      disposeCurtainWallGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = buildCurtainWallBufferGeometry(desc);
      mesh.material = this.acquireMaterials(desc);
      entry.materialHandles = this.lastHandles;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }
    if (matChanged) {
      const desc = produceCurtainWall(dto, NO_JOINS, this.worldY());
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
    disposeCurtainWallGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeCurtainWallGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private acquireMaterials(desc: BufferGeometryDescriptor): THREE.Material[] {
    // S13 perf hot-path: route every panel/mullion material through
    // MaterialPool with a content-addressed key so 50 panels of the
    // same kind+colour share ONE THREE.Material across the whole scene.
    // We instrument hits/misses for the orbit-fps bench gate.
    const handles = desc.materialKeys.map((key) => {
      const before = this.materialPool.refCount(key);
      const handle = this.materialPool.acquire(key, makeCurtainWallMaterialFactory(key));
      // refCount went from 0 → 1 means we just allocated (a miss);
      // anything > 0 → > 1 means we shared an existing entry (a hit).
      if (before === 0) this.stats.poolMisses += 1;
      else this.stats.poolHits += 1;
      return handle;
    });
    this.lastHandles = handles;
    return handles.map((h) => h.material);
  }
}
