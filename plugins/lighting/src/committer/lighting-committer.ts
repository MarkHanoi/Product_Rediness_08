// LightingCommitter — `PrimitiveCommitter<LightingData, THREE.Group>` (S26).
//
// This file is the only place in the codebase permitted to touch
// `THREE.PointLight` (P2 architecture lint exception).  Every fixture
// is committed as a Group containing the body Mesh and a child
// PointLight whose `intensity`/`distance`/`color` mirror the DTO.

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceLighting,
  NO_JOINS,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { LightingData } from '../store.js';
import { buildLightingBufferGeometry, disposeLightingGeometry } from './geometry-bridge.js';
import { makeLightingMaterialFactory } from './material-bridge.js';

const GEOMETRY_FIELDS = [
  'origin', 'kind', 'width', 'depth', 'thickness', 'rotation',
  'dropLength', 'levelId',
] as const;
const MATERIAL_FIELDS = ['materialId'] as const;
const LIGHT_FIELDS = ['intensity', 'range', 'color', 'isEmergency'] as const;

export interface LightingCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  lightUpdates: number;
  hashSkips: number;
}

interface SceneEntry {
  group: THREE.Group;
  mesh: THREE.Mesh;
  light: THREE.PointLight;
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: LightingData;
}

export interface LightingCommitterDeps {
  readonly materialPool: MaterialPool;
  readonly worldY?: () => number;
}

function colorTuple(c: LightingData['color']): THREE.Color {
  const [r, g, b] = c;
  return new THREE.Color(r, g, b);
}

function dirty(prev: LightingData, next: LightingData, fields: readonly (keyof LightingData)[]): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'origin' || k === 'color') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) return true;
  }
  return false;
}

export class LightingCommitter implements PrimitiveCommitter<LightingData, THREE.Group> {
  readonly primitiveType = 'lighting';
  private readonly entries = new Map<ElementId, SceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY: () => number;
  readonly stats: LightingCommitterStats = {
    rebuilds: 0, materialSwaps: 0, lightUpdates: 0, hashSkips: 0,
  };

  constructor(deps: LightingCommitterDeps) {
    if (!deps.materialPool) throw new Error('[LightingCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY = deps.worldY ?? (() => 0);
  }

  onAdd(id: ElementId, dto: LightingData): THREE.Group {
    const desc = produceLighting(dto, NO_JOINS, this.worldY());
    const mesh = new THREE.Mesh(buildLightingBufferGeometry(desc), this.acquireMaterials(desc));
    mesh.userData.elementId = id;
    mesh.userData.primitiveType = 'lighting';

    const light = new THREE.PointLight(colorTuple(dto.color), dto.intensity, dto.range);
    light.userData.elementId = id;
    light.userData.role = 'lighting.point';

    const group = new THREE.Group();
    group.add(mesh);
    group.add(light);
    group.userData.elementId = id;
    group.userData.primitiveType = 'lighting';

    this.stats.rebuilds += 1;
    this.entries.set(id, {
      group, mesh, light,
      materialHandles: this.lastHandles,
      descriptorHash: desc.hash,
      prevDto: dto,
    });
    return group;
  }

  onUpdate(id: ElementId, dto: LightingData, _group: THREE.Group): void {
    const entry = this.entries.get(id);
    if (!entry) { this.onAdd(id, dto); return; }

    const geomChanged = dirty(entry.prevDto, dto, GEOMETRY_FIELDS as readonly (keyof LightingData)[]);
    const matChanged  = dirty(entry.prevDto, dto, MATERIAL_FIELDS as readonly (keyof LightingData)[]);
    const lightChanged = dirty(entry.prevDto, dto, LIGHT_FIELDS as readonly (keyof LightingData)[]);
    entry.prevDto = dto;

    if (geomChanged) {
      const desc = produceLighting(dto, NO_JOINS, this.worldY());
      if (desc.hash !== entry.descriptorHash) {
        for (const h of entry.materialHandles) h.release();
        disposeLightingGeometry(entry.mesh.geometry as THREE.BufferGeometry);
        entry.mesh.geometry = buildLightingBufferGeometry(desc);
        entry.mesh.material = this.acquireMaterials(desc);
        entry.materialHandles = this.lastHandles;
        entry.descriptorHash = desc.hash;
        this.stats.rebuilds += 1;
      } else {
        this.stats.hashSkips += 1;
      }
    } else if (matChanged) {
      const desc = produceLighting(dto, NO_JOINS, this.worldY());
      for (const h of entry.materialHandles) h.release();
      entry.mesh.material = this.acquireMaterials(desc);
      entry.materialHandles = this.lastHandles;
      this.stats.materialSwaps += 1;
    }

    if (lightChanged) {
      entry.light.color = colorTuple(dto.color);
      entry.light.intensity = dto.intensity;
      entry.light.distance = dto.range;
      entry.light.userData.isEmergency = dto.isEmergency;
      this.stats.lightUpdates += 1;
    }
  }

  onRemove(id: ElementId, _group: THREE.Group): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    for (const h of entry.materialHandles) h.release();
    disposeLightingGeometry(entry.mesh.geometry as THREE.BufferGeometry);
    entry.group.remove(entry.mesh, entry.light);
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const [id, entry] of this.entries) {
      for (const h of entry.materialHandles) h.release();
      disposeLightingGeometry(entry.mesh.geometry as THREE.BufferGeometry);
      void id;
    }
    this.entries.clear();
  }

  private lastHandles: MaterialHandle[] = [];
  private acquireMaterials(desc: BufferGeometryDescriptor): THREE.Material[] {
    const handles = desc.materialKeys.map((key) =>
      this.materialPool.acquire(key, makeLightingMaterialFactory(key)),
    );
    this.lastHandles = handles;
    return handles.map((h) => h.material);
  }
}
