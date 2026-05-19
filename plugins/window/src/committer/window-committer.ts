// WindowCommitter — `PrimitiveCommitter<WindowData, THREE.Mesh>` (S11-T2).
//
// Mirrors `plugins/door/src/committer/door-committer.ts`.

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceWindow,
  composeWindowGeometryHash,
  type WindowWorldPlacement,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { WallsState, WallData } from '@pryzm/plugin-wall';
import type { WindowData } from '../store.js';
import { buildWindowBufferGeometry, disposeWindowGeometry } from './geometry-bridge.js';
import { makeWindowMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'width',
  'height',
  'sillHeight',
  'offset',
  'frameThickness',
  'frameWidth',
  'wallId',
  'windowType',
] as const;
const MATERIAL_FIELDS = ['frameColor'] as const;

export interface WindowCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  hashSkips: number;
}

interface WindowSceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: WindowData;
}

export interface WindowCommitterDeps {
  readonly wallsSnapshot: () => WallsState;
  readonly materialPool: MaterialPool;
}

function geometryDirty(prev: WindowData, next: WindowData): boolean {
  for (const k of GEOMETRY_FIELDS) {
    if ((prev as Record<string, unknown>)[k] !== (next as Record<string, unknown>)[k]) {
      return true;
    }
  }
  return false;
}

function materialDirty(prev: WindowData, next: WindowData): boolean {
  for (const k of MATERIAL_FIELDS) {
    if ((prev as Record<string, unknown>)[k] !== (next as Record<string, unknown>)[k]) {
      return true;
    }
  }
  return false;
}

function wallLength(wall: WallData): number {
  const [a, b] = wall.baseLine;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

/** Resolve world placement for a window given its host wall.
 *  `offset` is the distance from the wall start to the window's LEFT
 *  edge.  Producer expects bottom-CENTRE of the opening as
 *  `placement.origin`. */
export function resolveWindowPlacement(
  win: WindowData, wall: WallData,
): WindowWorldPlacement {
  const [start, end] = wall.baseLine;
  const len = wallLength(wall);
  const dx = (end.x - start.x) / (len || 1);
  const dz = (end.z - start.z) / (len || 1);
  const nx = -dz;
  const nz = dx;
  const tCentre = win.offset + win.width / 2;
  return {
    axis: { x: dx, y: 0, z: dz },
    normal: { x: nx, y: 0, z: nz },
    origin: {
      x: start.x + dx * tCentre,
      y: start.y + win.sillHeight,
      z: start.z + dz * tCentre,
    },
    wallThickness: wall.thickness,
  };
}

export class WindowCommitter implements PrimitiveCommitter<WindowData, THREE.Mesh> {
  readonly primitiveType = 'window';

  private readonly entries = new Map<ElementId, WindowSceneEntry>();
  private readonly wallsSnapshot: () => WallsState;
  private readonly materialPool: MaterialPool;
  readonly stats: WindowCommitterStats = {
    rebuilds: 0,
    materialSwaps: 0,
    hashSkips: 0,
  };

  constructor(deps: WindowCommitterDeps) {
    if (!deps.wallsSnapshot) throw new Error('[WindowCommitter] wallsSnapshot is required');
    if (!deps.materialPool) throw new Error('[WindowCommitter] materialPool is required');
    this.wallsSnapshot = deps.wallsSnapshot;
    this.materialPool = deps.materialPool;
  }

  onAdd(id: ElementId, dto: WindowData): THREE.Mesh {
    const wall = this.wallsSnapshot()[dto.wallId];
    if (!wall) {
      const empty = new THREE.Mesh(new THREE.BufferGeometry(), []);
      empty.userData.elementId = id;
      empty.userData.primitiveType = 'window';
      this.entries.set(id, {
        mesh: empty,
        materialHandles: [],
        descriptorHash: '',
        prevDto: dto,
      });
      return empty;
    }
    const placement = resolveWindowPlacement(dto, wall);
    const desc = produceWindow(dto, placement);
    const geometry = buildWindowBufferGeometry(desc);
    const handles = this.acquireHandles(desc);
    const mesh = new THREE.Mesh(geometry, handles.map((h) => h.material));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'window';
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh,
      materialHandles: handles,
      descriptorHash: desc.hash,
      prevDto: dto,
    });
    return mesh;
  }

  onUpdate(id: ElementId, dto: WindowData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) {
      this.onAdd(id, dto);
      return;
    }
    const wall = this.wallsSnapshot()[dto.wallId];
    if (!wall) return;

    const geomChanged = geometryDirty(entry.prevDto, dto);
    const matChanged = materialDirty(entry.prevDto, dto);
    entry.prevDto = dto;

    if (geomChanged) {
      const placement = resolveWindowPlacement(dto, wall);
      const newHash = composeWindowGeometryHash(dto, placement);
      if (newHash === entry.descriptorHash) {
        this.stats.hashSkips += 1;
        return;
      }
      const desc = produceWindow(dto, placement);
      for (const h of entry.materialHandles) h.release();
      const newGeometry = buildWindowBufferGeometry(desc);
      const newHandles = this.acquireHandles(desc);
      disposeWindowGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = newGeometry;
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }

    if (matChanged) {
      const placement = resolveWindowPlacement(dto, wall);
      const desc = produceWindow(dto, placement);
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
    disposeWindowGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeWindowGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private acquireHandles(desc: BufferGeometryDescriptor): MaterialHandle[] {
    return desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeWindowMaterialFactory(key)),
    );
  }
}
