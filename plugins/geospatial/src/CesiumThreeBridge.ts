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
import * as THREE from "@pryzm/renderer-three/three";

/**
 * §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — the bridge is wired to the CesiumViewport (the
 * single viewer owner) either by a live `Viewer` (legacy) OR — preferred — a PROVIDER that
 * re-reads the owner's CURRENT viewer on demand. A provider is what makes activation survive a
 * WebGPU device-loss cascade: CesiumViewport disposes+recreates its viewer during recovery, and
 * a value captured at construction then points at the DESTROYED viewer (whose `.scene` getter
 * throws). Passing `() => cesiumViewport.getViewer()` lets the bridge re-acquire the new viewer.
 */
export type CesiumViewerRef = Cesium.Viewer | (() => Cesium.Viewer | null | undefined);

export class CesiumThreeBridge {
  /** Re-reads the CURRENT viewer from the single owner (never a stale captured ref). */
  private viewerProvider: () => Cesium.Viewer | null | undefined;
  /** The viewer bound for the ACTIVE session — set by `activate()` from `viewerProvider`. */
  private cesiumViewer: Cesium.Viewer | null = null;
  private threeCamera: THREE.PerspectiveCamera;
  private threeScene: THREE.Scene;
  private postRenderCallback?: () => void;
  /**
   * §BRIDGE-GIVES-THE-CAMERA-BACK (L-13307) — the BIM camera's own fov/near/far, captured on the
   * FIRST frame this bridge drives it and restored on `deactivate()`.
   *
   * ⛔ `null` means "not currently driving", and the null-check in `syncCameras` is what keeps
   * this a one-shot capture: that method runs on Cesium's `postRender`, so a capture without the
   * guard would overwrite the remembered BIM range with Cesium's own on the second frame and
   * restore the leak it exists to undo.
   */
  private bimDepthRange: { fov: number; near: number; far: number } | null = null;
  private gisRoot: THREE.Group;

  // Floating origin anchor (ECEF)
  private anchorECEF?: Cesium.Cartesian3;

  constructor(
    viewerRef: CesiumViewerRef,
    threeWorld: any
  ) {
    // §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — normalise to a provider so the bridge ALWAYS
    // re-acquires the live viewer on activate. A raw Viewer is wrapped for backward compatibility.
    this.viewerProvider = typeof viewerRef === "function" ? viewerRef : () => viewerRef;
    this.threeCamera = threeWorld.camera.three;
    this.threeScene = threeWorld.scene.three;

    // Create a dedicated root for BIM geometry during GIS mode
    // This allows us to keep the scene identity while transforming the content
    this.gisRoot = new THREE.Group();
    this.gisRoot.name = "GIS_BIM_ROOT";
    // §GLB-EXPORT-AUTHORING-FRAME (L-1420) — DECLARE the frame this group imposes on its
    // subtree, so world-space consumers can DERIVE it instead of matching on the name
    // "GIS_BIM_ROOT". `setAnchor()` gives this group the full ECEF
    // `eastNorthUpToFixedFrame` matrix (translation ~6.37e6 m), which is the C12 §1.5
    // known violation of the §1.1 LTP-ENU mandate — still OPEN, still a P1. Until §9's
    // SiteFrame lands and the group becomes LTP-ENU-relative, the honest mitigation is
    // that the frame SAYS what it is: `@pryzm/file-format`'s `isGeoreferencedFrame`
    // reads this key (arm A) and divides the matrix out before serialising a GLB, so the
    // exported model is site-local metres rather than ECEF. The key is the string
    // constant `SCENE_FRAME_USERDATA_KEY`; it is written literally here because
    // `plugins/` (L6) must not import `file-format` (L3) for a userData tag.
    this.gisRoot.userData.pryzmSceneFrame = "geo-ecef";
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

    type Mat4Array = [
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
      number, number, number, number,
    ];
    const et = enuTransform as unknown as Mat4Array;
    const m = new THREE.Matrix4();
    m.set(
      et[0],  et[4],  et[8],  et[12],
      et[1],  et[5],  et[9],  et[13],
      et[2],  et[6],  et[10], et[14],
      et[3],  et[7],  et[11], et[15],
    );

    this.gisRoot.matrixAutoUpdate = false;
    this.gisRoot.matrix.copy(m);
    this.gisRoot.updateMatrixWorld(true);

    console.log("🌍 ENU transform applied to GIS BIM root");
  }

  /**
   * §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — resolve the CURRENT, live, scene-bearing viewer
   * from the owner. Returns null when no usable viewer exists (missing, or DESTROYED by a
   * device-loss recovery). Probes `.scene` defensively: on a torn-down Cesium `Viewer` the
   * `scene` getter reads `_cesiumWidget.scene` off `undefined` and throws — the exact
   * "Cannot read properties of undefined (reading 'scene')" crash this fix targets.
   */
  private resolveLiveViewer(): Cesium.Viewer | null {
    let viewer: Cesium.Viewer | null | undefined;
    try {
      viewer = this.viewerProvider();
    } catch {
      return null;
    }
    if (!viewer) return null;
    try {
      if (viewer.isDestroyed()) return null;
    } catch {
      return null;
    }
    try {
      if (!viewer.scene) return null;
    } catch {
      return null;
    }
    return viewer;
  }

  public activate() {
    console.log("CesiumThreeBridge ACTIVATED");

    // §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — bind to the LIVE viewer, re-acquired from the
    // owner on every activate. After a WebGPU device-loss cascade CesiumViewport disposes and
    // recreates its viewer; reading `.scene` off the old (disposed) reference throws an unhandled
    // TypeError that hangs the view-activation overlay for 25s. Fail FAST + LOUD instead so the
    // caller (GISAreaLayout) can surface the loading overlay's "Try again".
    const viewer = this.resolveLiveViewer();
    if (!viewer) {
      throw new Error(
        "CesiumThreeBridge.activate: no live Cesium viewer/scene available " +
        "(viewer missing or disposed by device-loss recovery — retry activation)."
      );
    }
    this.cesiumViewer = viewer;

    // Disable Three.js interaction while in GIS mode
    const anyCamera = this.threeCamera as any;
    if (anyCamera.controls) {
      anyCamera.controls.enabled = false;
    }

    // Idempotent: drop any prior post-render listener before re-adding so a re-activate
    // (or an activate after a viewer swap) never double-syncs the camera.
    if (this.postRenderCallback) {
      try {
        viewer.scene.postRender.removeEventListener(this.postRenderCallback);
      } catch { /* prior viewer already gone */ }
    }
    this.postRenderCallback = () => {
      this.syncCamera();
    };

    viewer.scene.postRender.addEventListener(
      this.postRenderCallback
    );

    window.addEventListener('cesium-model-transformed', this.handleModelTransform);
  }

  private handleModelTransform = (e: any) => {
    const { position } = e.detail;
    if (position) {
      this.setAnchor(position);
    }
  };

  private syncCamera() {
    // §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — the post-render callback only fires for the
    // viewer it was registered on, but guard anyway so a viewer disposed mid-frame degrades to
    // a no-op instead of throwing inside Cesium's render loop.
    const cesiumCamera = this.cesiumViewer?.camera;

    if (!this.anchorECEF || !cesiumCamera) return;

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

      // ⛔ §BRIDGE-GIVES-THE-CAMERA-BACK (L-13307) — REMEMBER THE BIM DEPTH RANGE BEFORE THE
      // FIRST OVERWRITE, so `deactivate()` has something true to restore. This runs on Cesium's
      // `postRender`, i.e. EVERY FRAME, against the SHARED OBC camera that PRYZM 3D also uses —
      // so the capture must happen once, on the first frame, and never again.
      if (this.bimDepthRange === null) {
        this.bimDepthRange = {
          fov: this.threeCamera.fov,
          near: this.threeCamera.near,
          far: this.threeCamera.far,
        };
      }
      this.threeCamera.near = perspectiveFrustum.near;
      this.threeCamera.far = perspectiveFrustum.far;

      this.threeCamera.updateProjectionMatrix();
    }
  }

  public deactivate() {
    console.log("CesiumThreeBridge DEACTIVATED");

    if (this.postRenderCallback) {
      // §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — the bound viewer may already be disposed
      // (device-loss recovery). Guard + try/catch so teardown never throws on a dead viewer.
      try {
        this.cesiumViewer?.scene?.postRender?.removeEventListener(
          this.postRenderCallback
        );
      } catch { /* viewer already disposed */ }
    }

    // Restore objects from GIS root back to scene
    if (this.gisRoot && this.gisRoot.parent === this.threeScene) {
      const children = [...this.gisRoot.children];
      children.forEach(obj => this.threeScene.add(obj));
      this.threeScene.remove(this.gisRoot);
    }

    window.removeEventListener('cesium-model-transformed', this.handleModelTransform);

    this.threeCamera.matrixAutoUpdate = true;

    // ⭐⭐ §BRIDGE-GIVES-THE-CAMERA-BACK (L-13307, founder 2026-09-10) — GIVE THE DEPTH RANGE
    // BACK TOO, not just `matrixAutoUpdate`.
    //
    // ⛔ THE LEAK, MEASURED. `syncCameras` above runs on Cesium's `postRender` — every frame —
    // and writes Cesium's frustum onto `this.threeCamera`, which IS the shared OBC camera the
    // PRYZM 3D view renders through (this bridge is constructed with `props.world`). Cesium ships
    // stock defaults that PRYZM never overrides: **near = 1.0 m, far = 5e8 m**. `deactivate()`
    // restored `matrixAutoUpdate` and nothing else, so after one visit to the 3-D Site the BIM
    // camera carried a near plane 10× coarser than its own (0.1) and a far plane 250 000× its
    // baseline — a depth ratio of 5e8 on a buffer with no logarithmic depth on the live WebGPU
    // backend. Everything the user then walked up to in PRYZM 3D was fighting for depth bits.
    //
    // ⚠ IT IS RESTORED, NOT RE-DERIVED. Writing `near = 0.1, far = 2000` here would be a THIRD
    // opinion about the BIM depth range, alongside `computeFitPose` and
    // `_ensureFarPlaneClearsTheSite` — and on a 331 ha parcel the constant would be the wrong one,
    // which is L-13306. What was taken is what is given back.
    //
    // ⭐ WHY NOT LEAN ON `ViewController._repairCameraDepthRange`. It early-returns whenever
    // `near <= 0.1`, and the leaked near is exactly 1.0, so it DOES fire — and then slams `far`
    // to the 2 000 m baseline, amputating a large site. Restoring at the source means the repair
    // never sees a poisoned camera in the first place, which is where the fix belongs.
    if (this.bimDepthRange !== null) {
      this.threeCamera.fov = this.bimDepthRange.fov;
      this.threeCamera.near = this.bimDepthRange.near;
      this.threeCamera.far = this.bimDepthRange.far;
      this.threeCamera.updateProjectionMatrix();
      console.log(
        `[CesiumThreeBridge] §BRIDGE-GIVES-THE-CAMERA-BACK restored the BIM depth range ` +
        `(fov ${this.bimDepthRange.fov}, near ${this.bimDepthRange.near}, far ${this.bimDepthRange.far}) ` +
        `after driving it from Cesium's frustum.`
      );
      this.bimDepthRange = null;
    }
  }

  public dispose() {
    console.log("CesiumThreeBridge DISPOSED");

    if (this.postRenderCallback) {
      // §FIX-GLOBE-ACTIVATE-STALE-VIEWER (L-313) — the bound viewer may already be disposed
      // (device-loss recovery). Guard + try/catch so teardown never throws on a dead viewer.
      try {
        this.cesiumViewer?.scene?.postRender?.removeEventListener(
          this.postRenderCallback
        );
      } catch { /* viewer already disposed */ }
    }

    // Restore objects from GIS root back to scene
    if (this.gisRoot && this.gisRoot.parent === this.threeScene) {
      const children = [...this.gisRoot.children];
      children.forEach(obj => this.threeScene.add(obj));
      this.threeScene.remove(this.gisRoot);
    }

    window.removeEventListener('cesium-model-transformed', this.handleModelTransform);

    this.threeCamera.matrixAutoUpdate = true;
    // §BRIDGE-GIVES-THE-CAMERA-BACK (L-13307) — `dispose()` is a SECOND exit from this bridge and
    // it does not route through `deactivate()`. A camera released on this path would keep
    // Cesium's near=1.0 / far=5e8 exactly as it did before, so the restore lives on BOTH exits.
    if (this.bimDepthRange !== null) {
      this.threeCamera.fov = this.bimDepthRange.fov;
      this.threeCamera.near = this.bimDepthRange.near;
      this.threeCamera.far = this.bimDepthRange.far;
      this.threeCamera.updateProjectionMatrix();
      this.bimDepthRange = null;
    }
    this.threeScene.matrixAutoUpdate = true; 
    this.threeScene.matrix.identity();
    this.threeScene.updateMatrixWorld(true);
  }
}
