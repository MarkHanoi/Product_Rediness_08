// RoomCommitter — `PrimitiveCommitter<RoomData, THREE.Mesh>` (S25).
//
// Mirrors `plugins/slab/src/committer/slab-committer.ts`.  The room
// producer needs sibling-element state (every wall on the room's
// level), so the committer accepts a `wallsProvider` callback the
// host wires at bootstrap.  The committer never holds a reference to
// the wall store directly — preserving K1B-2's "each plugin owns its
// store" boundary.

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceRoom,
  type BufferGeometryDescriptor,
  type RoomBoundaryContext,
} from '@pryzm/plugin-sdk';
import type { Wall } from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { RoomData } from '../store.js';
import { buildRoomBufferGeometry, disposeRoomGeometry } from './geometry-bridge.js';
import { makeRoomMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'boundaryMode',
  'seedPoint',
  'heightOffset',
  'levelId',
  'boundary',
] as const;
const MATERIAL_FIELDS = ['materialId', 'materialColor'] as const;

export interface RoomCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  hashSkips: number;
  unenclosedSkips: number;
}

interface RoomSceneEntry {
  mesh: THREE.Mesh;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: RoomData;
}

/** Returns every wall on the room's level.  The host wires this to
 *  whatever shape its wall store carries — the room committer only
 *  needs read access. */
export type RoomWallsProvider = (levelId: string) => readonly Readonly<Wall>[];

export interface RoomCommitterDeps {
  readonly materialPool: MaterialPool;
  readonly wallsProvider: RoomWallsProvider;
  /** World-Y offset for the level the room lives on.  Defaults to 0. */
  readonly worldY?: () => number;
}

function dirty(prev: RoomData, next: RoomData, fields: readonly (keyof RoomData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'seedPoint' || k === 'boundary') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class RoomCommitter implements PrimitiveCommitter<RoomData, THREE.Mesh> {
  readonly primitiveType = 'room';

  private readonly entries = new Map<ElementId, RoomSceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly wallsProvider: RoomWallsProvider;
  private readonly worldY: () => number;
  readonly stats: RoomCommitterStats = {
    rebuilds: 0,
    materialSwaps: 0,
    hashSkips: 0,
    unenclosedSkips: 0,
  };

  constructor(deps: RoomCommitterDeps) {
    if (!deps.materialPool) throw new Error('[RoomCommitter] materialPool is required');
    if (!deps.wallsProvider) throw new Error('[RoomCommitter] wallsProvider is required');
    this.materialPool = deps.materialPool;
    this.wallsProvider = deps.wallsProvider;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: RoomData): THREE.Mesh {
    const ctx: RoomBoundaryContext = { walls: this.wallsProvider(dto.levelId) };
    let desc: BufferGeometryDescriptor;
    try {
      desc = produceRoom(dto, ctx, this.worldY());
    } catch {
      // Un-enclosed at create time: park an empty mesh; the next
      // wall edit will trigger the cross-rule re-recompute.
      this.stats.unenclosedSkips += 1;
      const placeholder = new THREE.Mesh(new THREE.BufferGeometry());
      placeholder.userData.elementId = id;
      placeholder.userData.primitiveType = 'room';
      placeholder.visible = false;
      this.entries.set(id, {
        mesh: placeholder,
        materialHandles: [],
        descriptorHash: '',
        prevDto: dto,
      });
      return placeholder;
    }
    const geometry = buildRoomBufferGeometry(desc);
    const handles = this.acquireHandles(desc);
    const mesh = new THREE.Mesh(geometry, handles.map((h) => h.material));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'room';
    mesh.renderOrder = -1; // draw under everything else; helps depth-stable rendering of the fill
    this.stats.rebuilds += 1;
    this.entries.set(id, {
      mesh,
      materialHandles: handles,
      descriptorHash: desc.hash,
      prevDto: dto,
    });
    return mesh;
  }

  onUpdate(id: ElementId, dto: RoomData, mesh: THREE.Mesh): void {
    const entry = this.entries.get(id);
    if (!entry) {
      this.onAdd(id, dto);
      return;
    }
    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof RoomData)[]);
    const matChanged = dirty(entry.prevDto, dto, MATERIAL_FIELDS as readonly (keyof RoomData)[]);
    entry.prevDto = dto;

    if (geomChanged) {
      let desc: BufferGeometryDescriptor;
      try {
        desc = produceRoom(
          dto,
          { walls: this.wallsProvider(dto.levelId) },
          this.worldY(),
        );
      } catch {
        // Became un-enclosed mid-edit: hide the mesh and wait for
        // the next valid recompute.
        this.stats.unenclosedSkips += 1;
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      if (desc.hash === entry.descriptorHash) {
        this.stats.hashSkips += 1;
        return;
      }
      for (const h of entry.materialHandles) h.release();
      const newGeometry = buildRoomBufferGeometry(desc);
      const newHandles = this.acquireHandles(desc);
      disposeRoomGeometry(mesh.geometry as THREE.BufferGeometry);
      mesh.geometry = newGeometry;
      mesh.material = newHandles.map((h) => h.material);
      entry.materialHandles = newHandles;
      entry.descriptorHash = desc.hash;
      this.stats.rebuilds += 1;
      return;
    }

    if (matChanged) {
      let desc: BufferGeometryDescriptor;
      try {
        desc = produceRoom(
          dto,
          { walls: this.wallsProvider(dto.levelId) },
          this.worldY(),
        );
      } catch {
        // Material change on an un-enclosed room — nothing to swap;
        // surface the mesh-hide and bail.
        this.stats.unenclosedSkips += 1;
        mesh.visible = false;
        return;
      }
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
    disposeRoomGeometry(mesh.geometry as THREE.BufferGeometry);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeRoomGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private acquireHandles(desc: BufferGeometryDescriptor): MaterialHandle[] {
    return desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeRoomMaterialFactory(key)),
    );
  }
}
