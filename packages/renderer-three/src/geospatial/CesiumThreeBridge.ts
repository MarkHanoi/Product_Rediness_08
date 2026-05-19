/**
 * @file CesiumThreeBridge.ts
 * @migration S89-WIRE (2026-05-01) — moved from `src/geospatial/CesiumThreeBridge.ts`
 *   to `plugins/geospatial/src/CesiumThreeBridge.ts` (L7 plugin tier).
 *
 *   Layer rationale: this file imports both `cesium` (external GIS SDK) and `three`
 *   (L4 render engine), making it L7+ territory.  It belongs alongside the other
 *   geospatial plugin code in `plugins/geospatial/`, not inside the monolith `src/`.
 *
 *   The `src/geospatial/` directory is deleted by this migration.  There were 0
 *   structural importers — the bridge was pending wiring to the geospatial plugin
 *   (Wave 8/11 per `15-PACKAGE-POPULATION-GAP.md §0.0.5`).  The plugin's
 *   `contributions.ts` should import and register the bridge when the geospatial
 *   plugin is fully wired.
 */

import * as Cesium from "cesium";
import * as THREE from "three";

export class CesiumThreeBridge {
  private cesiumViewer: Cesium.Viewer;
  private threeCamera: THREE.PerspectiveCamera;
  private threeScene: THREE.Scene;
  private postRenderCallback?: () => void;
  private gisRoot: THREE.Group;

  // Floating origin anchor (ECEF)
  private anchorECEF?: Cesium.Cartesian3;

  constructor(
    cesiumViewer: Cesium.Viewer,
    threeWorld: any
  ) {
    this.cesiumViewer = cesiumViewer;
    this.threeCamera = threeWorld.camera.three;
    this.threeScene = threeWorld.scene.three;

    // Create a dedicated root for BIM geometry during GIS mode
    // This allows us to keep the scene identity while transforming the content
    this.gisRoot = new THREE.Group();
    this.gisRoot.name = "GIS_BIM_ROOT";
  }

  /**
   * MUST be called when placing BIM on Earth.
   * Pass the same Cartesian3 used for ENU placement.
   */
  public setAnchor(cartesian: Cesium.Cartesian3) {
    this.anchorECEF = Cesium.Cartesian3.clone(cartesian);
    console.log("📍 Anchor set (ECEF):", this.anchorECEF);

    // 1. Move all BIM elements into the GIS root
    // We only move objects that aren't already part of the basic scene (lights, grid, etc. are handled separately)
    const objectsToMove = this.threeScene.children.filter(obj => 
        obj.userData.id || obj.userData.elementType || obj.name.includes("Wall") || obj.name.includes("Slab")
    );

    objectsToMove.forEach(obj => this.gisRoot.add(obj));
    this.threeScene.add(this.gisRoot);

    // 2. Apply ENU transform to the GIS root, NOT the scene
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(
      this.anchorECEF
    );

    const m = new THREE.Matrix4();
    m.set(
      enuTransform[0]!, enuTransform[4]!, enuTransform[8]!,  enuTransform[12]!,
      enuTransform[1]!, enuTransform[5]!, enuTransform[9]!,  enuTransform[13]!,
      enuTransform[2]!, enuTransform[6]!, enuTransform[10]!, enuTransform[14]!,
      enuTransform[3]!, enuTransform[7]!, enuTransform[11]!, enuTransform[15]!,
    );

    this.gisRoot.matrixAutoUpdate = false;
    this.gisRoot.matrix.copy(m);
    this.gisRoot.updateMatrixWorld(true);

    console.log("🌍 ENU transform applied to GIS BIM root");
  }

  public activate() {
    console.log("CesiumThreeBridge ACTIVATED");

    // Disable Three.js interaction while in GIS mode
    const anyCamera = this.threeCamera as any;
    if (anyCamera.controls) {
      anyCamera.controls.enabled = false;
    }

    this.postRenderCallback = () => {
      this.syncCamera();
    };

    this.cesiumViewer.scene.postRender.addEventListener(
      this.postRenderCallback
    );

    this._cesiumTransformUnsub = (window as any).runtime?.events?.on('cesium-model-transformed', this.handleModelTransform); // F.events.15
  }

  private _cesiumTransformUnsub?: (() => void);

  private handleModelTransform = (payload: { matrix: unknown; position: unknown }) => {
    const { position } = payload;
    if (position) {
      this.setAnchor(position as Parameters<typeof this.setAnchor>[0]);
    }
  };

  private syncCamera() {
    const cesiumCamera = this.cesiumViewer.camera;

    if (!this.anchorECEF) return;

    // 1️⃣ Get ENU frame at anchor
    const enuTransform = Cesium.Transforms.eastNorthUpToFixedFrame(
      this.anchorECEF
    );

    const enuMatrix = new Cesium.Matrix4();
    Cesium.Matrix4.inverse(enuTransform, enuMatrix);

    // 2️⃣ Convert Cesium camera position to ENU (local space)
    const cameraECEF = cesiumCamera.positionWC;
    const cameraENU = new Cesium.Cartesian3();

    Cesium.Matrix4.multiplyByPoint(
      enuMatrix,
      cameraECEF,
      cameraENU
    );

    // 3️⃣ Convert Cesium camera orientation to Three.js matrix
    const viewMatrix = cesiumCamera.viewMatrix;
    const view = new THREE.Matrix4().fromArray(
      viewMatrix as unknown as number[]
    );

    view.invert(); // Convert view → world

    // 4️⃣ Apply ENU-relative position
    view.setPosition(
      cameraENU.x,
      cameraENU.y,
      cameraENU.z
    );

    this.threeCamera.matrixAutoUpdate = false;
    this.threeCamera.matrix.copy(view);
    this.threeCamera.updateMatrixWorld(true);

    this.threeCamera.matrix.decompose(
      this.threeCamera.position,
      this.threeCamera.quaternion,
      this.threeCamera.scale
    );

    // 5️⃣ Sync projection
    const frustum = cesiumCamera.frustum;

    if (frustum instanceof Cesium.PerspectiveFrustum) {
      const perspectiveFrustum = frustum as Cesium.PerspectiveFrustum;

      if (perspectiveFrustum.fovy !== undefined) {
        this.threeCamera.fov = Cesium.Math.toDegrees(
          perspectiveFrustum.fovy
        );
      }

      this.threeCamera.near = perspectiveFrustum.near;
      this.threeCamera.far = perspectiveFrustum.far;

      this.threeCamera.updateProjectionMatrix();
    }
  }

  public deactivate() {
    console.log("CesiumThreeBridge DEACTIVATED");

    if (this.postRenderCallback) {
      this.cesiumViewer.scene.postRender.removeEventListener(
        this.postRenderCallback
      );
    }

    // Restore objects from GIS root back to scene
    if (this.gisRoot && this.gisRoot.parent === this.threeScene) {
      const children = [...this.gisRoot.children];
      children.forEach(obj => this.threeScene.add(obj));
      this.threeScene.remove(this.gisRoot);
    }

    this._cesiumTransformUnsub?.(); this._cesiumTransformUnsub = undefined; // F.events.15

    this.threeCamera.matrixAutoUpdate = true;
  }

  public dispose() {
    console.log("CesiumThreeBridge DISPOSED");

    if (this.postRenderCallback) {
      this.cesiumViewer.scene.postRender.removeEventListener(
        this.postRenderCallback
      );
    }

    // Restore objects from GIS root back to scene
    if (this.gisRoot && this.gisRoot.parent === this.threeScene) {
      const children = [...this.gisRoot.children];
      children.forEach(obj => this.threeScene.add(obj));
      this.threeScene.remove(this.gisRoot);
    }

    this._cesiumTransformUnsub?.(); this._cesiumTransformUnsub = undefined; // F.events.15

    this.threeCamera.matrixAutoUpdate = true;
    this.threeScene.matrixAutoUpdate = true; 
    this.threeScene.matrix.identity();
    this.threeScene.updateMatrixWorld(true);
  }
}
