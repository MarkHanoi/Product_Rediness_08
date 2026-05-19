// GridCommitter — `PrimitiveCommitter<GridData, THREE.Mesh>` (S12-T4).

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceGrid,
  NO_JOINS,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { GridData } from '../store.js';
import { buildGridBufferGeometry, disposeGridGeometry } from './geometry-bridge.js';
import { makeGridMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = ['lines', 'rotation', 'levelId'] as const;

export interface GridCommitterStats {
  rebuilds: number; hashSkips: number;
}

interface GridSceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: GridData;
}

export interface GridCommitterDeps {
  readonly materialPool: MaterialPool;
  readonly worldY?: () => number;
}

function dirty(prev: GridData, next: GridData, fields: readonly (keyof GridData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'lines') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class GridCommitter implements PrimitiveCommitter<GridData, THREE.Mesh> {
  readonly primitiveType = 'grid';
  private readonly entries = new Map<ElementId, GridSceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY: () => number;
  readonly stats: GridCommitterStats = { rebuilds: 0, hashSkips: 0 };
  private lastHandles: MaterialHandle[] = [];

  constructor(deps: GridCommitterDeps) {
    if (!deps.materialPool) throw new Error('[GridCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: GridData): THREE.Mesh {
    const desc = produceGrid(dto, NO_JOINS, this.worldY());
    const mesh = new THREE.Mesh(buildGridBufferGeometry(desc), this.acquireMaterials(desc));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'grid';
    mesh.renderOrder = 1;
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh, materialHandles: this.lastHandles, descriptorHash: desc.hash, prevDto: dto,
    });
    return mesh;
  }

  onUpdate(id: ElementId, dto: GridData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) { this.onAdd(id, dto); return; }
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof GridData)[]);
    entry.prevDto = dto;
    if (!geomChanged) return;
    const desc = produceGrid(dto, NO_JOINS, this.worldY());
    if (desc.hash === entry.descriptorHash) { this.stats.hashSkips += 1; return; }
    for (const h of entry.materialHandles) h.release();
    disposeGridGeometry(mesh.geometry as THREE.BufferGeometry);
    mesh.geometry = buildGridBufferGeometry(desc);
    mesh.material = this.acquireMaterials(desc);
    entry.materialHandles = this.lastHandles;
    entry.descriptorHash = desc.hash;
    this.stats.rebuilds += 1;
  }

  onRemove(id: ElementId, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const h of entry.materialHandles) h.release();
    disposeGridGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeGridGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private acquireMaterials(desc: BufferGeometryDescriptor): THREE.Material[] {
    const handles = desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeGridMaterialFactory(key)),
    );
    this.lastHandles = handles;
    return handles.map((h) => h.material);
  }
}
