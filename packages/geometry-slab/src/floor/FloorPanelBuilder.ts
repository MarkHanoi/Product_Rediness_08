/**
 * FloorPanelBuilder — Geometry Engine (Projection Layer).
 *
 * Contract: docs/01_ELEMENTS/08_Floors_Contract/02-FLOOR-GEOMETRY-ENGINE-CONTRACT.md
 *
 * Rules:
 * - Pure projection layer — transforms FloorData → THREE.js scene nodes.
 * - NEVER reads from FloorStore during a build — all data passed as argument.
 * - NEVER calls commands or stores.
 * - All deps injected at construction time — no window.* reads.
 * - Called ONLY from EngineBootstrap DOM event subscribers.
 *
 * GEOMETRY INVARIANTS:
 * - Top face sits at FFL = level.elevation + boundary.baseOffset
 * - Body extends DOWNWARD by boundary.thickness (inverse of CeilingPanelBuilder)
 * - Top face normals point UP (0, +1, 0)
 * - Polygon winding is CCW when viewed from above
 */

import * as THREE from '@pryzm/renderer-three/three';
import { FloorData, FloorServiceHole, FloorVertex } from '@pryzm/core-app-model/stores';
import { computeFloorArea as computeArea, computeFloorBoundingBox as computeBoundingBox, ensureFloorCCW as ensureCCW,  } from '@pryzm/core-app-model/stores';
import { resolveFloorColor, resolveLayerColor,  } from '@pryzm/core-app-model/stores';
import { BimManager } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

// ── Constants ────────────────────────────────────────────────────────────────

const FLOOR_TESSELLATION_DIVISIONS = 1;
const EDGE_Y_OFFSET = 0.002; // 2 mm above top face to avoid Z-fighting

// ── Material factories ───────────────────────────────────────────────────────

function makeFloorTopMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.90,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

function makeLayerMaterial(color: string): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.92,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
}

const FLOOR_EDGE_MATERIAL = new THREE.LineBasicMaterial({
  color: 0x444444,
  linewidth: 1,
});

const FLOOR_TILE_GRID_MATERIAL = new THREE.LineBasicMaterial({
  color: 0x888888,
  linewidth: 1,
});

// ── FloorBuilderDeps ─────────────────────────────────────────────────────────

export interface FloorBuilderDeps {
  getVisualStyle?: () => number;
}

// ── FloorPanelBuilder ────────────────────────────────────────────────────────

export class FloorPanelBuilder {
  private readonly _scene: THREE.Scene;
  private readonly _bimManager: BimManager | null;
  private _floorRoots = new Map<string, THREE.Group>();

  constructor(
    scene: THREE.Scene,
    bimManager?: BimManager,
    _deps: FloorBuilderDeps = {}
  ) {
    this._scene = scene;
    this._bimManager = bimManager ?? null;
    void _deps;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  buildFloor(floor: FloorData): void {
    const level = this._bimManager?.getLevelById(floor.levelId);
    const levelElevation = level?.elevation ?? 0;

    // Phase 1: sloped floors not yet supported.
    if (floor.slope) {
      console.warn(`[FloorPanelBuilder] Sloped floor "${floor.id}" not supported in Phase 1. Building flat.`);
    }

    // §57 Day 5 finish (DAILY-USE 2026-05-21, Round 36) — capture prior
    // version for monotonic per-build bumping. Reusable-root pattern (root
    // preserved across rebuilds; only children cleared). Defaults to 0 on
    // first build.
    let root = this._floorRoots.get(floor.id);
    const _priorVersion: number = (root?.userData?.version as number | undefined) ?? 0;
    if (!root) {
      root = new THREE.Group();
      root.name = `floor-${floor.id}`;
      this._scene.add(root);
      this._floorRoots.set(floor.id, root);
    }
    elementRegistry.registerRoot(floor.id, root);

    // Clear all previous children (preserve root for identity stability).
    while (root.children.length > 0) {
      const child = root.children[0]!;
      this._disposeObject(child);
      root.remove(child);
    }

    // Enforce CCW winding before tessellation.
    const polygon = ensureCCW(floor.boundary.polygon);

    // FLOOR GEOMETRY RULE:
    // Top face at FFL = level.elevation + boundary.baseOffset
    // Body extends DOWNWARD by boundary.thickness
    const worldY_top = levelElevation + floor.boundary.baseOffset;   // FFL — top face
    const worldY_bottom = worldY_top - floor.boundary.thickness;       // Bottom of assembly

    if (floor.layers && floor.layers.length > 0) {
      this._buildLayeredFloor(floor, polygon, worldY_top, root);
    } else {
      this._buildSinglePanelFloor(floor, polygon, worldY_top, worldY_bottom, root);
    }

    // Edge overlay (always — rendered slightly ABOVE top face to avoid Z-fighting).
    this._buildEdgeOverlay(polygon, floor.serviceHoles, worldY_top, root);

    // Tile grid overlay (if applicable).
    if (floor.finishSpec?.finishPattern && floor.finishSpec.finishPattern !== 'none') {
      this._buildTileGridOverlay(floor, polygon, worldY_top, root);
    }

    // Required userData for SelectionManager dispatch and highlighting.
    root.userData = {
      id: floor.id,
      elementType: 'floor',
      type: 'floor',
      selectable: true,
      levelId: floor.levelId,
      polygon: floor.boundary.polygon,
      baseOffset: floor.boundary.baseOffset,
      thickness: floor.boundary.thickness,
      area: computeArea(polygon),
      hostSlabId: floor.hostSlabId,
      // §57 Day 5 finish — monotonic per-build counter for NMEexporter
      // proxy cache invalidation. Mirrors CeilingPanelBuilder (Round 36).
      version: _priorVersion + 1,
    };

    root.visible = floor.visible !== false;
  }

  removeFloor(floorId: string): void {
    const root = this._floorRoots.get(floorId);
    if (!root) return;

    while (root.children.length > 0) {
      const child = root.children[0]!;
      this._disposeObject(child);
      root.remove(child);
    }
    this._scene.remove(root);
    this._floorRoots.delete(floorId);
    elementRegistry.unregisterRoot(floorId);
  }

  getRootById(floorId: string): THREE.Group | undefined {
    return this._floorRoots.get(floorId);
  }

  dispose(): void {
    for (const id of Array.from(this._floorRoots.keys())) {
      this.removeFloor(id);
    }
  }

  // ── Private builders ───────────────────────────────────────────────────────

  /**
   * Single-panel floor (no layers).
   *
   * GEOMETRY:
   * - Top face at worldY_top (= FFL)
   * - Bottom face at worldY_bottom (= FFL - thickness)
   * - ExtrudeGeometry extrudes in +Y from worldY_bottom to worldY_top
   */
  private _buildSinglePanelFloor(
    floor: FloorData,
    polygon: FloorVertex[],
    worldY_top: number,
    worldY_bottom: number,
    root: THREE.Group
  ): void {
    const shape = this._buildShapeWithHoles(polygon, floor.serviceHoles);
    const color = resolveFloorColor(floor);

    if (floor.boundary.thickness > 0.005) {
      // Extruded body — extrude from worldY_bottom upward by thickness.
      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: floor.boundary.thickness,
        bevelEnabled: false,
      };
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      // ExtrudeGeometry extrudes in +Z before rotation.
      // rotateX(-PI/2) maps Z→Y, so the extrusion direction becomes +Y.
      geometry.rotateX(-Math.PI / 2);
      // Translate so the bottom of the extrusion sits at worldY_bottom.
      geometry.translate(0, worldY_bottom, 0);
      geometry.computeVertexNormals();

      const material = makeFloorTopMaterial(color);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'floor-body';
      mesh.userData = { floorId: floor.id, role: 'body' };
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      root.add(mesh);
    } else {
      // Ultra-thin floor — ShapeGeometry only (flat top face).
      const geometry = new THREE.ShapeGeometry(shape, FLOOR_TESSELLATION_DIVISIONS);
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, worldY_top, 0);
      geometry.computeVertexNormals();

      const material = makeFloorTopMaterial(color);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = 'floor-top';
      mesh.userData = { floorId: floor.id, role: 'top' };
      mesh.receiveShadow = true;
      root.add(mesh);
    }
  }

  /**
   * Layered floor: one extruded mesh per layer, stacked top-to-bottom.
   *
   * GEOMETRY: layers are placed from top (FFL) downward.
   * Layer[0] = topmost finish layer (e.g. tile, carpet, timber).
   * currentBottomY starts at worldY_top and decrements with each layer.
   */
  private _buildLayeredFloor(
    floor: FloorData,
    polygon: FloorVertex[],
    worldY_top: number,
    root: THREE.Group
  ): void {
    let currentBottomY = worldY_top;

    for (const layer of floor.layers!) {
      const shape = this._buildShapeWithHoles(polygon, floor.serviceHoles);
      const extrudeSettings: THREE.ExtrudeGeometryOptions = {
        depth: layer.thickness,
        bevelEnabled: false,
      };
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geometry.rotateX(-Math.PI / 2);
      // Each layer extrudes downward from the current bottom:
      // The geometry extrudes in +Y (after rotation), so we place it at
      // (currentBottomY - layer.thickness) so the top of this layer is at currentBottomY.
      const layerBottomY = currentBottomY - layer.thickness;
      geometry.translate(0, layerBottomY, 0);
      geometry.computeVertexNormals();

      const color = resolveLayerColor(layer, 0);
      const material = makeLayerMaterial(color);

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `floor-layer-${layer.function}`;
      mesh.userData = { floorId: floor.id, layerFunction: layer.function };
      mesh.receiveShadow = true;
      root.add(mesh);

      currentBottomY = layerBottomY;
    }
  }

  /** Build a THREE.Shape from the boundary polygon and service holes. */
  private _buildShapeWithHoles(
    polygon: FloorVertex[],
    serviceHoles: FloorData['serviceHoles']
  ): THREE.Shape {
    const shape = new THREE.Shape();
    const firstPt = polygon[0]!;
    shape.moveTo(firstPt.x, -firstPt.z);
    for (let i = 1; i < polygon.length; i++) {
      const pt = polygon[i]!;
      shape.lineTo(pt.x, -pt.z);
    }
    shape.closePath();

    for (const hole of (serviceHoles || [])) {
      const holePath = this._buildHolePath(hole);
      if (holePath) shape.holes.push(holePath);
    }

    return shape;
  }

  private _buildHolePath(hole: FloorServiceHole): THREE.Path | null {
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

  /**
   * Edge overlay lines at the top perimeter of the floor.
   * Rendered ABOVE the top face (worldY_top + EDGE_Y_OFFSET) to prevent Z-fighting.
   */
  private _buildEdgeOverlay(
    polygon: FloorVertex[],
    _serviceHoles: FloorData['serviceHoles'],
    worldY_top: number,
    root: THREE.Group
  ): void {
    const points: THREE.Vector3[] = [];
    const edgeY = worldY_top + EDGE_Y_OFFSET;

    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i]!;
      const b = polygon[(i + 1) % polygon.length]!;
      points.push(new THREE.Vector3(a.x, edgeY, a.z));
      points.push(new THREE.Vector3(b.x, edgeY, b.z));
    }

    if (points.length >= 2) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const edgeLines = new THREE.LineSegments(geometry, FLOOR_EDGE_MATERIAL.clone());
      edgeLines.name = 'floor-edge-overlay';
      edgeLines.userData = { floorId: root.userData.id, role: 'edges' };
      root.add(edgeLines);
    }
  }

  /**
   * Tile / plank grid overlay on the top face.
   * Rendered 1 mm above FFL to be visible over the body mesh.
   */
  private _buildTileGridOverlay(
    floor: FloorData,
    polygon: FloorVertex[],
    worldY_top: number,
    root: THREE.Group
  ): void {
    const pattern = floor.finishSpec?.finishPattern;
    if (!pattern || pattern === 'none' || pattern === 'seamless' || pattern === 'terrazzo') return;

    const bb = computeBoundingBox(polygon);
    const gridY = worldY_top + 0.001;

    let spacingX = 0.6;
    let spacingZ = 0.6;

    switch (pattern) {
      case 'tile-300x300': spacingX = 0.3;  spacingZ = 0.3;  break;
      case 'tile-600x600': spacingX = 0.6;  spacingZ = 0.6;  break;
      case 'tile-600x300': spacingX = 0.6;  spacingZ = 0.3;  break;
      case 'tile-herringbone': spacingX = 0.3; spacingZ = 0.3; break;
      case 'plank-90':     spacingX = 100;  spacingZ = 0.12; break;
      case 'plank-45':     spacingX = 100;  spacingZ = 0.12; break;
      case 'plank-herringbone': spacingX = 0.6; spacingZ = 0.12; break;
      default: spacingX = 0.6; spacingZ = 0.6;
    }

    const gridPoints: THREE.Vector3[] = [];

    if (spacingX < 50) {
      for (let x = bb.minX; x <= bb.maxX; x += spacingX) {
        gridPoints.push(new THREE.Vector3(x, gridY, bb.minZ));
        gridPoints.push(new THREE.Vector3(x, gridY, bb.maxZ));
      }
    }
    for (let z = bb.minZ; z <= bb.maxZ; z += spacingZ) {
      gridPoints.push(new THREE.Vector3(bb.minX, gridY, z));
      gridPoints.push(new THREE.Vector3(bb.maxX, gridY, z));
    }

    if (gridPoints.length >= 2) {
      const geometry = new THREE.BufferGeometry().setFromPoints(gridPoints);
      const gridLines = new THREE.LineSegments(geometry, FLOOR_TILE_GRID_MATERIAL.clone());
      gridLines.name = 'floor-tile-grid';
      gridLines.userData = { floorId: floor.id, role: 'tile-grid' };
      root.add(gridLines);
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

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
