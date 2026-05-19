/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Projection Layer (Builder)
 * File:             src/elements/roomBoundingLines/RoomBoundingLineBuilder.ts
 * Contracts:        01-BIM-ENGINE-CORE-CONTRACT §2.7 — Builder Isolation Rule
 *                   02-BIM-SPATIAL-PROJECTION-CONTRACT §4.3 — No Orphaned Geometry
 *                   02-BIM-SPATIAL-PROJECTION-CONTRACT §4.2 — Root Identity Preservation
 *
 * Renders RoomBoundingLine elements as dashed lines in the Three.js scene.
 * Visual style: purple dashed line with endpoints, clearly distinct from walls.
 *
 * Builder rules:
 *   - Never mutates stores.
 *   - Never calls CommandManager.
 *   - Creates/disposes Three.js geometry on add/update/remove.
 *   - Registers roots in ElementRegistry.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { RoomBoundingLineData } from '@pryzm/core-app-model/stores';
import { BimManager } from '@pryzm/core-app-model';

const ACTIVE_COLOR   = 0xA855F7;   // violet-500 — matches PRYZM accent palette
const INACTIVE_COLOR = 0x94A3B8;   // slate-400 — muted/disabled
const LINE_OPACITY   = 0.85;
const ENDPOINT_SIZE  = 0.08;       // endpoint diamond size in metres

export class RoomBoundingLineBuilder {
  private _roots: Map<string, THREE.Group> = new Map();
  private _scene: THREE.Scene;
  private _bimManager: BimManager;
  private _visible: boolean = true;

  constructor(scene: THREE.Scene, bimManager: BimManager) {
    this._scene = scene;
    this._bimManager = bimManager;
  }

  // ── Visibility (Intent/Override toggle) ───────────────────────────────────

  setVisible(visible: boolean): void {
    this._visible = visible;
    this._roots.forEach(root => { root.visible = visible; });
  }

  isVisible(): boolean {
    return this._visible;
  }

  // ── Build ────────────────────────────────────────────────────────────────

  build(data: Readonly<RoomBoundingLineData>): void {
    this._dispose(data.id);

    const levelElevation = this._getLevelElevation(data.levelId);
    const y = levelElevation + 0.02; // slight lift above ground plane

    const root = new THREE.Group();
    root.userData = {
      id:      data.id,
      type:    data.type,
      levelId: data.levelId,
      version: 1,
    };
    root.visible = this._visible;

    const color = data.properties.isActive ? ACTIVE_COLOR : INACTIVE_COLOR;

    // ── Dashed line ──────────────────────────────────────────────────────
    const start = new THREE.Vector3(data.placement.start.x, y, data.placement.start.z);
    const end   = new THREE.Vector3(data.placement.end.x,   y, data.placement.end.z);

    const points = [start, end];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineDashedMaterial({
      color,
      linewidth:   2,
      dashSize:    0.25,
      gapSize:     0.12,
      transparent: true,
      opacity:     LINE_OPACITY,
      depthTest:   false,
    });
    const line = new THREE.Line(geo, mat);
    line.computeLineDistances();
    line.renderOrder = 1;
    root.add(line);

    // ── Endpoint diamonds ────────────────────────────────────────────────
    const diamondGeo = this._makeDiamondGeometry(ENDPOINT_SIZE);
    const diamondMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: LINE_OPACITY, depthTest: false });

    const startMesh = new THREE.Mesh(diamondGeo, diamondMat);
    startMesh.position.set(data.placement.start.x, y, data.placement.start.z);
    startMesh.renderOrder = 2;
    root.add(startMesh);

    const endMesh = new THREE.Mesh(diamondGeo.clone(), diamondMat.clone());
    endMesh.position.set(data.placement.end.x, y, data.placement.end.z);
    endMesh.renderOrder = 2;
    root.add(endMesh);

    this._scene.add(root);
    this._roots.set(data.id, root);

    console.debug(`[RoomBoundingLineBuilder] Built '${data.id}' on level '${data.levelId}'`);
  }

  rebuild(data: Readonly<RoomBoundingLineData>): void {
    const existing = this._roots.get(data.id);
    if (existing) {
      // Increment version in userData
      existing.userData.version = (existing.userData.version || 0) + 1;
    }
    this.build(data);
  }

  delete(id: string): void {
    this._dispose(id);
  }

  deleteAllForLevel(levelId: string): void {
    this._roots.forEach((root, id) => {
      if (root.userData.levelId === levelId) this._dispose(id);
    });
  }

  getAllIds(): string[] {
    return Array.from(this._roots.keys());
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _dispose(id: string): void {
    const root = this._roots.get(id);
    if (!root) return;

    root.traverse(obj => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        if (obj.geometry) obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m: THREE.Material) => m.dispose());
        } else if (obj.material) {
          (obj.material as THREE.Material).dispose();
        }
      }
    });

    this._scene.remove(root);
    this._roots.delete(id);
  }

  private _getLevelElevation(levelId: string): number {
    try {
      const level = this._bimManager.getLevelById?.(levelId);
      return level?.elevation ?? 0;
    } catch {
      return 0;
    }
  }

  private _makeDiamondGeometry(size: number): THREE.BufferGeometry {
    const s = size;
    const geo = new THREE.BufferGeometry();
    const verts = new Float32Array([
       0,  0,  s,
       s,  0,  0,
       0,  0, -s,
      -s,  0,  0,
    ]);
    const idx = new Uint16Array([0,1,2, 0,2,3]);
    geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    return geo;
  }
}
