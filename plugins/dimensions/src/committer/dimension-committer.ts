// DimensionCommitter — `PrimitiveCommitter<DimensionData, THREE.Group>` (S29).
//
// `code-level ADR docs/architecture/adr/0028-plan-view-canvas-architecture.md`
//
// THREE-BOUND — do not import this in any headless context.
//
// RENDERING STRATEGY
// ─────────────────────────────────────────────────────────────────────────────
// Dimensions have two visual layers:
//
//   1. Arrowhead body meshes — produced by `produceDimension()`.
//      Box-prism geometry; uses the shared MaterialPool.
//
//   2. Extension + dimension lines — from `analyseDimension()` analytic record.
//      Rendered as `THREE.Line` primitives with a shared `LineBasicMaterial`.
//
// Both layers are grouped under a `THREE.Group` so the host can add/remove the
// whole dimension element in one scene call.

import * as THREE from '@pryzm/renderer-three/three';
import {
  produceDimension,
  analyseDimension,
  NO_JOINS,
  composeDimensionMaterialKey,
  type BufferGeometryDescriptor,
} from '@pryzm/plugin-sdk';
import type {
  ElementId,
  MaterialHandle,
  MaterialPool,
  PrimitiveCommitter,
} from '@pryzm/plugin-sdk';
import type { DimensionData } from '../store.js';
import {
  buildDimensionBodyGeometry,
  disposeDimensionBodyGeometry,
  buildAnalyticLines,
  disposeLines,
} from './geometry-bridge.js';
import { makeDimensionBodyMaterial, makeDimensionLineMaterial } from './material-bridge.js';

// ── Field lists for dirty-check ──────────────────────────────────────────────

const GEOMETRY_FIELDS = [
  'kind', 'points', 'offsetMm', 'style',
] as const satisfies readonly (keyof DimensionData)[];

const MATERIAL_FIELDS = [
  'style', 'units', 'precision',
] as const satisfies readonly (keyof DimensionData)[];

// ── Internal per-element scene entry ────────────────────────────────────────

interface SceneEntry {
  group: THREE.Group;
  bodyMesh: THREE.Mesh | null;
  lines: THREE.Line[];
  materialHandles: MaterialHandle[];
  descriptorHash: string;
  prevDto: DimensionData;
}

// ── Dependency injection bag ─────────────────────────────────────────────────

export interface DimensionCommitterDeps {
  readonly materialPool: MaterialPool;
  readonly worldY?: () => number;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

export interface DimensionCommitterStats {
  rebuilds: number;
  materialSwaps: number;
  hashSkips: number;
}

// ── Helper ───────────────────────────────────────────────────────────────────

function dirty(
  prev: DimensionData,
  next: DimensionData,
  fields: readonly (keyof DimensionData)[],
): boolean {
  for (const k of fields) {
    const a = (prev as Record<string, unknown>)[k];
    const b = (next as Record<string, unknown>)[k];
    if (k === 'points') {
      if (JSON.stringify(a) !== JSON.stringify(b)) return true;
    } else if (a !== b) {
      return true;
    }
  }
  return false;
}

// ── Committer ────────────────────────────────────────────────────────────────

/**
 * Three-tier committer for dimension elements.
 *
 * Returns a `THREE.Group` (not a raw Mesh) — the host adds/removes the
 * group from the scene as a unit.
 */
export class DimensionCommitter implements PrimitiveCommitter<DimensionData, THREE.Group> {
  readonly primitiveType = 'dimension';

  private readonly entries   = new Map<ElementId, SceneEntry>();
  private readonly materialPool: MaterialPool;
  private readonly worldY:  () => number;
  private readonly lineMat: THREE.LineBasicMaterial;
  private lastHandles: MaterialHandle[] = [];

  readonly stats: DimensionCommitterStats = { rebuilds: 0, materialSwaps: 0, hashSkips: 0 };

  constructor(deps: DimensionCommitterDeps) {
    if (!deps.materialPool) throw new Error('[DimensionCommitter] materialPool is required');
    this.materialPool = deps.materialPool;
    this.worldY       = deps.worldY ?? (() => 0);
    this.lineMat      = makeDimensionLineMaterial();
  }

  onAdd(id: ElementId, dto: DimensionData): THREE.Group {
    const worldY   = this.worldY();
    const desc     = produceDimension(dto, NO_JOINS, worldY);
    const analytic = analyseDimension(dto);
    const group    = new THREE.Group();
    group.userData.elementId     = id;
    group.userData.primitiveType = 'dimension';

    const bodyMesh = this.buildBodyMesh(dto, desc);
    const lines    = buildAnalyticLines(analytic, worldY);

    if (bodyMesh) group.add(bodyMesh);
    for (const ln of lines) {
      ln.material = this.lineMat;
      group.add(ln);
    }

    this.stats.rebuilds += 1;
    this.entries.set(id, {
      group,
      bodyMesh,
      lines,
      materialHandles: this.lastHandles,
      descriptorHash: desc.hash,
      prevDto: dto,
    });

    return group;
  }

  onUpdate(id: ElementId, dto: DimensionData, group: THREE.Group): void {
    const entry = this.entries.get(id);
    if (!entry) { this.onAdd(id, dto); return; }

    const worldY    = this.worldY();
    const needsGeom = dirty(entry.prevDto, dto, GEOMETRY_FIELDS);
    const needsMat  = dirty(entry.prevDto, dto, MATERIAL_FIELDS);

    if (!needsGeom && !needsMat) {
      this.stats.hashSkips += 1;
      entry.prevDto = dto;
      return;
    }

    if (needsGeom) {
      const desc     = produceDimension(dto, NO_JOINS, worldY);
      const analytic = analyseDimension(dto);

      if (entry.bodyMesh) {
        group.remove(entry.bodyMesh);
        disposeDimensionBodyGeometry(entry.bodyMesh.geometry);
        for (const h of entry.materialHandles) h.release();
      }
      for (const ln of entry.lines) {
        group.remove(ln);
      }
      disposeLines(entry.lines);

      const bodyMesh = this.buildBodyMesh(dto, desc);
      const lines    = buildAnalyticLines(analytic, worldY);
      if (bodyMesh) group.add(bodyMesh);
      for (const ln of lines) {
        ln.material = this.lineMat;
        group.add(ln);
      }

      entry.bodyMesh        = bodyMesh;
      entry.lines           = lines;
      entry.materialHandles = this.lastHandles;
      entry.descriptorHash  = desc.hash;
      this.stats.rebuilds  += 1;
    }

    if (needsMat && !needsGeom) {
      const key = composeDimensionMaterialKey(dto);
      if (entry.bodyMesh) {
        for (const h of entry.materialHandles) h.release();
        const mat     = this.acquireMaterial(key);
        entry.bodyMesh.material = mat;
        entry.materialHandles   = this.lastHandles;
      }
      this.stats.materialSwaps += 1;
    }

    entry.prevDto = dto;
  }

  onRemove(id: ElementId, _group: THREE.Group): void {
    const entry = this.entries.get(id);
    if (!entry) return;
    if (entry.bodyMesh) disposeDimensionBodyGeometry(entry.bodyMesh.geometry);
    disposeLines(entry.lines);
    for (const h of entry.materialHandles) h.release();
    this.entries.delete(id);
  }

  onDispose(): void {
    for (const entry of this.entries.values()) {
      if (entry.bodyMesh) disposeDimensionBodyGeometry(entry.bodyMesh.geometry);
      disposeLines(entry.lines);
      for (const h of entry.materialHandles) h.release();
    }
    this.entries.clear();
    this.lineMat.dispose();
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private buildBodyMesh(dto: DimensionData, desc: BufferGeometryDescriptor): THREE.Mesh | null {
    if (desc.position.length === 0) return null;
    const key  = composeDimensionMaterialKey(dto);
    const mat  = this.acquireMaterial(key);
    const geo  = buildDimensionBodyGeometry(desc);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData.primitiveType = 'dimension';
    return mesh;
  }

  private acquireMaterial(key: string): THREE.MeshStandardMaterial {
    const handle = this.materialPool.acquire(key, () => makeDimensionBodyMaterial(key));
    this.lastHandles = [handle];
    return handle.material as THREE.MeshStandardMaterial;
  }
}
