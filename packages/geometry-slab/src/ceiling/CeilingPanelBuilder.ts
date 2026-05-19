/**
 * CeilingPanelBuilder — Geometry Engine (Projection Layer)
 *
 * Contract: docs/01_ELEMENTS/12_Ceilings/03-CEILING-COMMAND-PIPELINE-CONTRACT.md
 *
 * Rules:
 * - Pure projection layer — transforms CeilingData → THREE.js scene nodes.
 * - NEVER reads from CeilingStore during a build.
 * - NEVER calls commands or stores.
 * - All deps injected at construction time — no window.* reads.
 * - Called ONLY from EngineBootstrap DOM event subscribers.
 *
 * C11 §2 step 3 (Task 1.2) — geometry builds are deferred via FrameScheduler
 *   adaptive drain. `buildCeiling()` enqueues the data; `_drainBuildQueue()`
 *   processes up to `_buildsPerFrame` items per pre-render tick.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { CeilingData, CeilingHoleElement, CeilingVertex } from '@pryzm/core-app-model/stores';
import { computeCeilingArea as computeArea, computeCeilingBoundingBox as computeBoundingBox, ensureCeilingCCW as ensureCCW,  } from '@pryzm/core-app-model/stores';
import { getSoffitColor, LAYER_FUNCTION_COLORS,  } from '@pryzm/core-app-model/stores';
import { BimManager } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

// ── Constants ──────────────────────────────────────────────────────────────
const CEILING_TESSELLATION_DIVISIONS = 1;
const GRID_LINE_OFFSET = 0.001;  // 1 mm below soffit to avoid Z-fighting

// ── Shared materials (lazily created) ─────────────────────────────────────
function makeSoffitMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

function makeLayerMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.9,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

const CEILING_EDGE_MATERIAL = new THREE.LineBasicMaterial({
  color: 0x444444,
  linewidth: 1,
});

const CEILING_GRID_MATERIAL = new THREE.LineBasicMaterial({
  color: 0x888888,
  linewidth: 1,
});

// ── CeilingBuilderDeps ─────────────────────────────────────────────────────
export interface CeilingBuilderDeps {
  getVisualStyle?: () => number;
}

// ── CeilingPanelBuilder ────────────────────────────────────────────────────
export class CeilingPanelBuilder {
  private readonly _scene: THREE.Scene;
  private readonly _bimManager: BimManager | null;
  private _ceilingRoots = new Map<string, THREE.Group>();

  // ── C11 §2 step 3: FrameScheduler adaptive drain ────────────────────────
  /** Pending ceiling builds keyed by id — later update wins (dedup). */
  private _pendingBuilds = new Map<string, CeilingData>();
  /** FrameScheduler disposer for the drain loop — null when idle. */
  private _rafHandle: TickListenerDisposer | null = null;
  /** Adaptive per-frame budget, starts at 5, adjusts by ±1 each frame. */
  private _buildsPerFrame = 5;
  private static readonly _MAX_BUILDS = 12;
  private static readonly _MIN_BUILDS = 2;

  constructor(
    scene: THREE.Scene,
    bimManager?: BimManager,
    _deps: CeilingBuilderDeps = {}
  ) {
    this._scene = scene;
    this._bimManager = bimManager ?? null;
    void _deps;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * C11 §2 step 3 — enqueue a ceiling build; drain fires on the next
   * pre-render tick so geometry is never built synchronously in a DOM event
   * handler. Later calls for the same id overwrite earlier ones (dedup).
   */
  buildCeiling(ceiling: CeilingData): void {
    this._pendingBuilds.set(ceiling.id, ceiling);
    if (this._rafHandle === null) {
      this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
    }
  }

  removeCeiling(ceilingId: string): void {
    this._pendingBuilds.delete(ceilingId);
    const root = this._ceilingRoots.get(ceilingId);
    if (!root) return;

    while (root.children.length > 0) {
      const child = root.children[0]!;
      this._disposeObject(child);
      root.remove(child);
    }
    this._scene.remove(root);
    this._ceilingRoots.delete(ceilingId);
    elementRegistry.unregisterRoot(ceilingId);
  }

  getRootById(ceilingId: string): THREE.Group | undefined {
    return this._ceilingRoots.get(ceilingId);
  }

  dispose(): void {
    this._rafHandle?.();
    this._rafHandle = null;
    this._pendingBuilds.clear();
    for (const id of Array.from(this._ceilingRoots.keys())) {
      this.removeCeiling(id);
    }
  }

  // ── C11 §2 step 3 — drain ──────────────────────────────────────────────────

  /**
   * Adaptive drain: processes up to `_buildsPerFrame` ceilings per
   * pre-render tick. Budget auto-adjusts ±1 based on observed frame cost
   * (target: 8–20 ms per drain pass).
   */
  private _drainBuildQueue(): void {
    this._rafHandle = null;
    const t0 = performance.now();

    const ids = [...this._pendingBuilds.keys()].slice(0, this._buildsPerFrame);
    for (const id of ids) {
      const ceiling = this._pendingBuilds.get(id)!;
      this._pendingBuilds.delete(id);
      try {
        this._buildCeilingSync(ceiling);
      } catch (err) {
        console.error('[CeilingPanelBuilder] build error:', err);
      }
    }

    const frameMs = performance.now() - t0;
    if (frameMs < 8 && this._buildsPerFrame < CeilingPanelBuilder._MAX_BUILDS) {
      this._buildsPerFrame++;
    } else if (frameMs > 20 && this._buildsPerFrame > CeilingPanelBuilder._MIN_BUILDS) {
      this._buildsPerFrame--;
    }

    if (this._pendingBuilds.size > 0) {
      this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
    }
  }

  // ── Private builders ───────────────────────────────────────────────────────

  /**
   * Synchronous ceiling build — called only from `_drainBuildQueue()`.
   * Contains the original buildCeiling() logic.
   */
  private _buildCeilingSync(ceiling: CeilingData): void {
    const level = this._bimManager?.getLevelById(ceiling.levelId);
    const levelElevation = level?.elevation ?? 0;

    // Phase 2: sloped ceilings not yet supported.
    if (ceiling.slope) {
      console.warn(`[CeilingPanelBuilder] Sloped ceiling "${ceiling.id}" not supported in Phase 1. Building flat.`);
    }

    let root = this._ceilingRoots.get(ceiling.id);
    if (!root) {
      root = new THREE.Group();
      root.name = `ceiling-${ceiling.id}`;
      this._scene.add(root);
      this._ceilingRoots.set(ceiling.id, root);
    }
    elementRegistry.registerRoot(ceiling.id, root);

    // Clear all previous children (preserve root for identity stability).
    while (root.children.length > 0) {
      const child = root.children[0]!;
      this._disposeObject(child);
      root.remove(child);
    }

    // Ensure CCW winding before tessellation.
    const polygon = ensureCCW(ceiling.boundary.polygon);
    const worldY_top = levelElevation + ceiling.boundary.baseOffset + ceiling.boundary.height;
    const worldY_soffit = worldY_top - ceiling.boundary.thickness;

    if (ceiling.layers && ceiling.layers.length > 0) {
      this._buildLayeredCeilingPanel(ceiling, polygon, worldY_top, root);
    } else {
      this._buildSinglePanelCeiling(ceiling, polygon, worldY_top, worldY_soffit, root);
    }

    // Edge overlay (always).
    this._buildEdgeOverlay(polygon, ceiling.holeElements, worldY_soffit, root);

    // Grid pattern overlay (if applicable).
    if (ceiling.finishSpec.soffitPattern && ceiling.finishSpec.soffitPattern !== 'none') {
      this._buildGridOverlay(ceiling, polygon, worldY_soffit, root);
    }

    // Required userData for SelectionManager dispatch and highlighting.
    root.userData = {
      id: ceiling.id,
      elementType: 'ceiling',
      type: 'ceiling',
      selectable: true,
      levelId: ceiling.levelId,
      polygon: ceiling.boundary.polygon,
      height: ceiling.boundary.height,
      thickness: ceiling.boundary.thickness,
      area: computeArea(polygon),
    };
  }

  /** Single-panel ceiling (no layers). */
  private _buildSinglePanelCeiling(
    ceiling: CeilingData,
    polygon: CeilingVertex[],
    _worldY_top: number,
    worldY_soffit: number,
    root: THREE.Group
  ): void {
    const shape = this._buildShapeWithHoles(polygon, ceiling.holeElements);
    const color = getSoffitColor(ceiling);

    if (ceiling.boundary.thickness > 0.01) {
      // Extruded body: soffit at worldY_soffit, top at worldY_top.
      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: ceiling.boundary.thickness,
        bevelEnabled: false,
      };
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, worldY_soffit, 0);
      geometry.computeVertexNormals();

      const material = makeSoffitMaterial(color);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'ceiling-body';
      mesh.userData = { ceilingId: ceiling.id, role: 'body' };
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      root.add(mesh);
    } else {
      // Flat soffit — ShapeGeometry only.
      const geometry = new THREE.ShapeGeometry(shape, CEILING_TESSELLATION_DIVISIONS);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, worldY_soffit, 0);
      geometry.computeVertexNormals();

      const material = makeSoffitMaterial(color);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'ceiling-soffit';
      mesh.userData = { ceilingId: ceiling.id, role: 'soffit' };
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }

  /** Layered ceiling: one extruded mesh per layer, stacked top-to-bottom. */
  private _buildLayeredCeilingPanel(
    ceiling: CeilingData,
    polygon: CeilingVertex[],
    worldY_top: number,
    root: THREE.Group
  ): void {
    let currentTopY = worldY_top;

    for (const layer of ceiling.layers!) {
      const shape = this._buildShapeWithHoles(polygon, ceiling.holeElements);
      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: layer.thickness,
        bevelEnabled: false,
      };
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geometry.rotateX(-Math.PI / 2);
      const bottomY = currentTopY - layer.thickness;
      geometry.translate(0, bottomY, 0);
      geometry.computeVertexNormals();

      const color = layer.materialColor ?? LAYER_FUNCTION_COLORS[layer.function];
      const material = makeLayerMaterial(color);

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `ceiling-layer-${layer.function}`;
      mesh.userData = { ceilingId: ceiling.id, layerFunction: layer.function };
      mesh.receiveShadow = true;
      root.add(mesh);

      currentTopY = bottomY;
    }
  }

  /** Build a THREE.Shape from the boundary polygon and hole elements. */
  private _buildShapeWithHoles(
    polygon: CeilingVertex[],
    holeElements: CeilingHoleElement[]
  ): THREE.Shape {
    const shape = new THREE.Shape();
    const firstPt = polygon[0]!;
    shape.moveTo(firstPt.x, -firstPt.z);
    for (let i = 1; i < polygon.length; i++) {
      const pt = polygon[i]!;
      shape.lineTo(pt.x, -pt.z);
    }
    shape.closePath();

    for (const hole of holeElements) {
      const holePath = this._buildHolePath(hole);
      if (holePath) shape.holes.push(holePath);
    }

    return shape;
  }

  private _buildHolePath(hole: CeilingHoleElement): THREE.Path | null {
    const path = new THREE.Path();
    switch (hole.shape) {
      case 'rectangular': {
        if (hole.offsetX === undefined || hole.width === undefined || hole.depth === undefined) return null;
        const ox = hole.offsetX;
        const oz = hole.offsetZ ?? 0;
        path.moveTo(ox, -oz);
        path.lineTo(ox + hole.width, -oz);
        path.lineTo(ox + hole.width, -(oz + hole.depth));
        path.lineTo(ox, -(oz + hole.depth));
        path.closePath();
        break;
      }
      case 'circular': {
        if (hole.centerX === undefined || hole.radius === undefined) return null;
        path.absarc(hole.centerX, -(hole.centerZ ?? 0), hole.radius, 0, Math.PI * 2, false);
        break;
      }
      case 'polygon': {
        if (!hole.polygon || hole.polygon.length < 3) return null;
        path.moveTo(hole.polygon[0]!.x, -hole.polygon[0]!.z);
        for (let i = 1; i < hole.polygon.length; i++) {
          path.lineTo(hole.polygon[i]!.x, -hole.polygon[i]!.z);
        }
        path.closePath();
        break;
      }
    }
    return path;
  }

  /** Edge overlay lines at soffit perimeter. */
  private _buildEdgeOverlay(
    polygon: CeilingVertex[],
    _holeElements: CeilingHoleElement[],
    worldY_soffit: number,
    root: THREE.Group
  ): void {
    const points: THREE.Vector3[] = [];
    const edgeY = worldY_soffit - 0.002;

    // Outer boundary edges.
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % polygon.length]!;
      points.push(new THREE.Vector3(a.x, edgeY, a.z));
      points.push(new THREE.Vector3(b.x, edgeY, b.z));
    }

    if (points.length >= 2) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const edgeLines = new THREE.LineSegments(geometry, CEILING_EDGE_MATERIAL.clone());
      edgeLines.name = 'ceiling-edge-overlay';
      edgeLines.userData = { ceilingId: root.userData.id, role: 'edges' };
      root.add(edgeLines);
    }
  }

  /** Grid pattern overlay for ACT and linear systems. */
  private _buildGridOverlay(
    ceiling: CeilingData,
    polygon: CeilingVertex[],
    worldY_soffit: number,
    root: THREE.Group
  ): void {
    const pattern = ceiling.finishSpec.soffitPattern;
    if (!pattern || pattern === 'none' || pattern === 'coffered' || pattern === 'linear-baffles') return;

    const bb = computeBoundingBox(polygon);
    const gridY = worldY_soffit - GRID_LINE_OFFSET;

    let spacingX = 0.6;
    let spacingZ = 0.6;

    switch (pattern) {
      case 'grid-1200x600': spacingX = 1.2; spacingZ = 0.6; break;
      case 'grid-1200x300': spacingX = 1.2; spacingZ = 0.3; break;
      case 'strip-planks':  spacingX = 100;  spacingZ = 0.15; break;
      default: spacingX = 0.6; spacingZ = 0.6;
    }

    const gridPoints: THREE.Vector3[] = [];

    // Z-parallel lines (X sweep).
    for (let x = bb.minX; x <= bb.maxX; x += spacingX) {
      gridPoints.push(new THREE.Vector3(x, gridY, bb.minZ));
      gridPoints.push(new THREE.Vector3(x, gridY, bb.maxZ));
    }
    // X-parallel lines (Z sweep).
    for (let z = bb.minZ; z <= bb.maxZ; z += spacingZ) {
      gridPoints.push(new THREE.Vector3(bb.minX, gridY, z));
      gridPoints.push(new THREE.Vector3(bb.maxX, gridY, z));
    }

    if (gridPoints.length >= 2) {
      const geometry = new THREE.BufferGeometry().setFromPoints(gridPoints);
      const gridLines = new THREE.LineSegments(geometry, CEILING_GRID_MATERIAL.clone());
      gridLines.name = 'ceiling-grid-overlay';
      gridLines.userData = { ceilingId: ceiling.id, role: 'grid-pattern' };
      root.add(gridLines);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private _disposeObject(obj: THREE.Object3D): void {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => m.dispose());
      } else {
        (mesh.material as THREE.Material)?.dispose();
      }
    } else if ((obj as THREE.LineSegments).isLine) {
      const line = obj as THREE.LineSegments;
      line.geometry?.dispose();
      (line.material as THREE.Material)?.dispose();
    }
  }
}
