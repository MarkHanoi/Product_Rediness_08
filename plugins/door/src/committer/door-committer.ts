// DoorCommitter — `PrimitiveCommitter<DoorData, THREE.Group>` (S11-T1).
//
// Mirrors `plugins/wall/src/committer/wall-committer.ts` minus the
// per-wall complexity (no curve, no layered openings, no proxy mesh).
//
// Per-element bookkeeping:
//   • `mesh`              — visible THREE.Mesh holding the descriptor.
//   • `materialHandles`   — one per descriptor group (currently 2:
//                            frame + leaf).  Released on rebuild and
//                            on remove.
//   • `descriptorHash`    — `composeDoorGeometryHash(...)` output.
//                            Skips rebuild when unchanged.
//   • `prevDto`           — previous DoorData snapshot — used to
//                            decide rebuild vs material-only swap.
//
// Geometry-affecting fields (rebuild):
//   `width`, `height`, `sillHeight`, `offset`, `frameThickness`,
//   `frameWidth`, `wallId` (if changed, host wall changed → re-bind
//   placement).
//
// Material-only fields (rebind handles, no geometry rebuild):
//   `frameColor`, `leafColor`.

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceDoor,
  composeDoorGeometryHash,
  type DoorWorldPlacement,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { WallsState, WallData } from '@pryzm/plugin-wall';
import type { DoorData } from '../store.js';
import { buildDoorBufferGeometry, disposeDoorGeometry } from './geometry-bridge.js';
import { makeDoorMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'width',
  'height',
  'sillHeight',
  'offset',
  'frameThickness',
  'frameWidth',
  'wallId',
  // TASK-04 (MASTER-IMPL-PLAN-2026-05-18 BUG-3): swing is geometry-affecting —
  // a swing change must trigger a full produceDoor() rebuild so the hinge side
  // and open-angle geometry reflect the new direction.
  'swing',
] as const;
const MATERIAL_FIELDS = ['frameColor', 'leafColor'] as const;

export interface DoorCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  hashSkips: number;
}

interface DoorSceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: DoorData;
}

export interface DoorCommitterDeps {
  /** Snapshot accessor — returns the current `WallsState` so the door
   *  committer can resolve placement against its host wall. */
  readonly wallsSnapshot: () => WallsState;
  /** Material pool — typically the host's shared pool. */
  readonly materialPool: MaterialPool;
}

function geometryDirty(prev: DoorData, next: DoorData): boolean {
  for (const k of GEOMETRY_FIELDS) {
    if ((prev as Record<string, unknown>)[k] !== (next as Record<string, unknown>)[k]) {
      return true;
    }
  }
  return false;
}

function materialDirty(prev: DoorData, next: DoorData): boolean {
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

/** Resolve world placement for a door given its host wall.  The door's
 *  `offset` is the distance from the wall start to the door's LEFT
 *  edge, in metres; the producer expects the bottom-CENTRE of the door
 *  as `placement.origin`. */
export function resolveDoorPlacement(door: DoorData, wall: WallData): DoorWorldPlacement {
  const [start, end] = wall.baseLine;
  const len = wallLength(wall);
  const dx = (end.x - start.x) / (len || 1);
  const dz = (end.z - start.z) / (len || 1);
  // Outward XZ normal — perpendicular, sign matches PRYZM 1's "left"
  // (rotate +90° about world Y).
  const nx = -dz;
  const nz = dx;

  // Centre of the door along the baseline.
  const tCentre = door.offset + door.width / 2;
  return {
    axis: { x: dx, y: 0, z: dz },
    normal: { x: nx, y: 0, z: nz },
    origin: {
      x: start.x + dx * tCentre,
      y: start.y + door.sillHeight,
      z: start.z + dz * tCentre,
    },
    wallThickness: wall.thickness,
  };
}

export class DoorCommitter implements PrimitiveCommitter<DoorData, THREE.Mesh> {
  readonly primitiveType = 'door';

  private readonly entries = new Map<ElementId, DoorSceneEntry>();
  private readonly wallsSnapshot: () => WallsState;
  private readonly materialPool: MaterialPool;
  readonly stats: DoorCommitterStats = {
    rebuilds: 0,
    materialSwaps: 0,
    hashSkips: 0,
  };

  constructor(deps: DoorCommitterDeps) {
    if (!deps.wallsSnapshot) throw new Error('[DoorCommitter] wallsSnapshot is required');
    if (!deps.materialPool) throw new Error('[DoorCommitter] materialPool is required');
    this.wallsSnapshot = deps.wallsSnapshot;
    this.materialPool = deps.materialPool;
  }

  onAdd(id: ElementId, dto: DoorData): THREE.Mesh {
    const wall = this.wallsSnapshot()[dto.wallId];
    if (!wall) {
      // Defensive — emit an empty mesh that will be re-built once the
      // host wall arrives.  PRYZM 1 emits a warning in the same case.
      const empty = new THREE.Mesh(new THREE.BufferGeometry(), []);
      empty.userData.elementId = id;
      empty.userData.primitiveType = 'door';
      this.entries.set(id, {
        mesh: empty,
        materialHandles: [],
        descriptorHash: '',
        prevDto: dto,
      });
      return empty;
    }
    const placement = resolveDoorPlacement(dto, wall);
    const desc = produceDoor(dto, placement);
    const geometry = buildDoorBufferGeometry(desc);
    const handles = this.acquireHandles(desc);
    const mesh = new THREE.Mesh(
      geometry,
      handles.map((h) => h.material),
    );
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'door';
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh,
      materialHandles: handles,
      descriptorHash: desc.hash,
      prevDto: dto,
    });
    return mesh;
  }

  onUpdate(id: ElementId, dto: DoorData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) {
      // Unknown id — re-add.
      this.onAdd(id, dto);
      return;
    }

    const wall = this.wallsSnapshot()[dto.wallId];
    if (!wall) return; // host wall vanished — leave mesh as-is

    const geomChanged = geometryDirty(entry.prevDto, dto);
    const matChanged = materialDirty(entry.prevDto, dto);
    entry.prevDto = dto;

    if (geomChanged) {
      const placement = resolveDoorPlacement(dto, wall);
      const newHash = composeDoorGeometryHash(dto, placement);
      if (newHash === entry.descriptorHash) {
        this.stats.hashSkips += 1;
        return;
      }
      const desc = produceDoor(dto, placement);
      // Release old handles.
      for (const h of entry.materialHandles) h.release();
      const newGeometry = buildDoorBufferGeometry(desc);
      const newHandles = this.acquireHandles(desc);
      disposeDoorGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = newGeometry;
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }

    if (matChanged) {
      // Material-only swap — rebind colours without rebuilding geometry.
      const placement = resolveDoorPlacement(dto, wall);
      const desc = produceDoor(dto, placement);
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
    disposeDoorGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeDoorGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private acquireHandles(desc: BufferGeometryDescriptor): MaterialHandle[] {
    return desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeDoorMaterialFactory(key)),
    );
  }
}
