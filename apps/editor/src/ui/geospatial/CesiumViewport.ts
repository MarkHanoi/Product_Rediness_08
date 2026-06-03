import * as Cesium from "cesium";
import { TransformGizmo, GizmoMode } from "./TransformGizmo";

// H7 (07-BIM-SECURITY-CONTRACT §6.1): Cesium Ion token MUST be loaded from the
// VITE_CESIUM_TOKEN environment variable and MUST NOT be hardcoded in source.
// Set VITE_CESIUM_TOKEN in your .env.local file (never commit that file).
// The fallback below is a legacy dev token — it will be removed in a future
// release once all environments have the env var configured.
const _cesiumToken = import.meta.env.VITE_CESIUM_TOKEN as string | undefined;
if (!_cesiumToken) {
    console.warn(
        '[CesiumViewport] VITE_CESIUM_TOKEN is not set. ' +
        'Set it in .env.local to avoid exposing a token in source code. ' +
        'Falling back to dev token — do not use in production.'
    );
}
Cesium.Ion.defaultAccessToken =
    _cesiumToken ??
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI1ZTgyY2VlNC0yZTMyLTRmNzktYmE2MC03MWFlMjlmODI1YWEiLCJpZCI6Mzk1NjM5LCJpYXQiOjE3NzIyNDA0OTB9.ofCy5m_GGYtnYgz5d7qzr3B0ZjshQ7j4sjXz7o8-jsc';

export class CesiumViewport {
  private container: HTMLDivElement;
  private viewer: Cesium.Viewer | null = null;
  private handler: Cesium.ScreenSpaceEventHandler | null = null;
  private currentModel: Cesium.Model | null = null;
  private gizmo: TransformGizmo | null = null;

  /** Phase B (S73-WIRE) — runtime threaded by parent. */
  public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

  constructor(private parent: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
      this.runtime = runtime;
    this.container = document.createElement("div");
    this.container.id = "cesium-viewport-container";
    this.container.style.position = "absolute";
    this.container.style.inset = "0";
    this.container.style.zIndex = "0";
    this.container.style.pointerEvents = "auto";
    this.container.style.background = "#000";
  }

  public async mount(): Promise<void> {
    if (this.viewer) {
      console.warn("CesiumViewer already exists — skipping mount.");
      return;
    }

    console.log("CesiumViewport: Mount started");

    const cesiumInternalContainer = document.createElement("div");
    cesiumInternalContainer.style.position = "absolute";
    cesiumInternalContainer.style.top = "0";
    cesiumInternalContainer.style.left = "0";
    cesiumInternalContainer.style.width = "100%";
    cesiumInternalContainer.style.height = "100%";

    this.container.appendChild(cesiumInternalContainer);
    this.parent.appendChild(this.container);

    try {
      console.log("CesiumViewport: Creating viewer...");

      this.viewer = new Cesium.Viewer(cesiumInternalContainer, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: false,
        infoBox: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        navigationHelpButton: false,
        scene3DOnly: true
      });

      // Disable depth test against terrain
      this.viewer.scene.globe.depthTestAgainstTerrain = false;

      // ----------------------------
      // 🗺️ Base map imagery — keyless OpenStreetMap (A.8.b)
      // ----------------------------
      // The default Cesium World Imagery needs a valid ion token, and the Google
      // Photorealistic 3D Tiles below need BOTH an ion token AND a linked Google
      // Maps key — when either is missing the globe renders as a faint, near-white
      // ellipsoid ("you can see things but really light"), which is useless for
      // site-boundary drawing. OSM tiles need NO key, so the map is ALWAYS visible
      // for authoring. The Google 3D tiles remain an enhancement layered on top
      // when a key is configured. (Prod CSP: tile.openstreetmap.org added to
      // img-src in server/securityHeaders.js; dev CSP is report-only.)
      try {
        this.viewer.imageryLayers.removeAll();
        this.viewer.imageryLayers.addImageryProvider(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            maximumLevel: 19,
            credit: '© OpenStreetMap contributors',
          })
        );
        console.log('[CesiumViewport] OSM base imagery installed (keyless basemap).');
      } catch (e) {
        console.warn('[CesiumViewport] OSM base imagery failed to install:', e);
      }

      // ----------------------------
      // 🌎 Google Photorealistic 3D Tiles with fallback (enhancement; needs a key)
      // ----------------------------
      let photogrammetryLoaded = false;

      try {
        const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(
          2275207 // Google Photorealistic 3D Tiles
        );

        // Improve visual sharpness
        tileset.maximumScreenSpaceError = 2;
        tileset.dynamicScreenSpaceError = true;
        tileset.preloadFlightDestinations = true;
        tileset.preferLeaves = true;
        tileset.progressiveResolutionHeightFraction = 0.5;
        tileset.foveatedScreenSpaceError = true;
        tileset.foveatedConeSize = 0.1;
        tileset.foveatedInterpolationCallback = Cesium.Math.lerp;
        tileset.foveatedTimeDelay = 0.05;

        // Add tileset without auto-zoom
        this.viewer.scene.primitives.add(tileset);
        photogrammetryLoaded = true;
        console.log("✅ Google Photorealistic 3D Tiles loaded (no auto zoom)");
      } catch (err) {
        console.error("❌ Failed to load photogrammetry:", err);
      }

      // Only hide globe if photogrammetry actually loaded
      this.viewer.scene.globe.show = !photogrammetryLoaded;

      if (!photogrammetryLoaded) {
        console.warn("⚠️ Falling back to default Cesium globe");
      }

      // Camera controls
      const controller = this.viewer.scene.screenSpaceCameraController;
      controller.enableZoom = true;
      controller.enableRotate = true;
      controller.enableTilt = true;

      // Setup selection handler
      this.setupSelectionHandler();

      // Setup Gizmo
      this.gizmo = new TransformGizmo(this.viewer);

      // Keyboard listener for gizmo modes
      window.addEventListener('keydown', (e) => {
        if (!this.gizmo) return;
        if (e.key === 't') this.gizmo.setMode(GizmoMode.TRANSLATE);
        if (e.key === 'r') this.gizmo.setMode(GizmoMode.ROTATE);
      });

      // 🔥 Set initial camera to a reasonable position (Sydney Opera House)
      const initialPosition = Cesium.Cartesian3.fromDegrees(
        151.2153, // Sydney lon
        -33.8568, // Sydney lat
        1000 // 200m altitude
      );

      this.viewer.camera.setView({
        destination: initialPosition,
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(-45),
          roll: 0
        }
      });

      // Force resize after layout stabilizes
      setTimeout(() => {
        if (!this.viewer) return;
        this.viewer.resize();
        this.viewer.scene.requestRender();

        console.log(
          "Canvas size:",
          this.viewer.canvas.clientWidth,
          this.viewer.canvas.clientHeight
        );
      }, 100);

      // Debug listener
      this.viewer.camera.moveEnd.addEventListener(() => {
        if (!this.viewer) return;
        const carto = this.viewer.camera.positionCartographic;

        console.log("CesiumViewport RUNTIME VERIFICATION:");
        console.log("LAT:", Cesium.Math.toDegrees(carto.latitude));
        console.log("LON:", Cesium.Math.toDegrees(carto.longitude));
        console.log("HEIGHT:", carto.height);
      });

      console.log("CesiumViewport: Viewer ready with Google Photorealistic 3D Tiles");
    } catch (error) {
      console.error("Cesium initialization failed:", error);
      throw error;
    }
  }

  // Use silhouette for visual feedback
  private setupSelectionHandler(): void {
    if (!this.viewer) return;

    this.handler = new Cesium.ScreenSpaceEventHandler(this.viewer.scene.canvas);

    this.handler.setInputAction(
      (movement: { position: Cesium.Cartesian2 }) => {
        if (!this.viewer) return;

        const pickedObject = this.viewer.scene.pick(movement.position);

        if (!Cesium.defined(pickedObject)) return;

        // If GLB model clicked
        if (pickedObject.primitive instanceof Cesium.Model) {
          const model = pickedObject.primitive as Cesium.Model;
          this.currentModel = model;
          console.log("✅ BIM model selected");

          // Attach gizmo
          if (this.gizmo) {
            this.gizmo.attach(model);
          }

          // Use silhouette for persistent visual feedback
          model.silhouetteColor = Cesium.Color.YELLOW;
          model.silhouetteSize = 3;

          return;
        }

        // Clicked away - deselect
        if (this.currentModel) {
          this.currentModel.silhouetteSize = 0;
          if (this.gizmo) {
            this.gizmo.attach(null);
          }
        }

        // Optional: still allow tile feature selection
        if (pickedObject instanceof Cesium.Cesium3DTileFeature) {
          console.log("Tile feature selected");
        }
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    );
  }

  public setVisible(visible: boolean): void {
    if (this.container) {
      this.container.style.display = visible ? "block" : "none";
      if (visible && this.viewer) {
        this.viewer.resize();
        this.viewer.scene.requestRender();
      }
    }
  }

  public dispose(): void {
    console.log("Disposing Cesium...");

    if (this.handler) {
      this.handler.destroy();
      this.handler = null;
    }

    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }

    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }

  public getViewer(): Cesium.Viewer | null {
    return this.viewer;
  }

  public transformModel(translation: Cesium.Cartesian3, rotationAngle: number) {
    if (!this.currentModel || !this.viewer) return;

    // Get current position (ECEF) from matrix
    const matrix = this.currentModel.modelMatrix;
    const currentPosECEF = Cesium.Matrix4.getTranslation(matrix, new Cesium.Cartesian3());

    // 1. Convert translation (Local ENU) to ECEF delta
    // We use the current position to create a local ENU -> ECEF transformation matrix
    const enuToEcef = Cesium.Transforms.eastNorthUpToFixedFrame(currentPosECEF);

    // Transform the local translation vector (e.g. [0, 1, 0] for North) into ECEF coordinates
    const translationECEF = Cesium.Matrix4.multiplyByPointAsVector(
      enuToEcef,
      translation,
      new Cesium.Cartesian3()
    );

    // Apply translation in ECEF space
    const newPosECEF = Cesium.Cartesian3.add(currentPosECEF, translationECEF, new Cesium.Cartesian3());

    // 2. Apply rotation around the local Up axis
    // Get the current rotation matrix
    const currentRotation = Cesium.Matrix4.getMatrix3(matrix, new Cesium.Matrix3());

    // Create rotation around Z (which is 'Up' in the local ENU frame used by eastNorthUpToFixedFrame)
    const rotation = Cesium.Matrix3.fromRotationZ(Cesium.Math.toRadians(rotationAngle));
    Cesium.Matrix3.multiply(currentRotation, rotation, currentRotation);

    // 3. Rebuild the model matrix
    const newMatrix = Cesium.Matrix4.fromRotationTranslation(currentRotation, newPosECEF);
    this.currentModel.modelMatrix = newMatrix;

    // Notify bridge to update the Three.js anchor
    window.runtime?.events?.emit('cesium-model-transformed', { matrix: newMatrix, position: newPosECEF }); // F.events.16
  }

  /**
   * Load a BIM GLB file from either a URL or Blob URL
   * 
   * @param url - Can be a server path OR a Blob URL from exporter
   * @param options - Position options with lat/lon and optional height
   * @param scale - Scale factor for the model (default: 1000.0 for mm to m conversion)
   */
  public async loadBimGltf(
    url: string,
    options: { lat: number; lon: number; height?: number },
    scale: number = 1.0,
    flyTo: boolean = true
  ): Promise<void> {
    if (!this.viewer) {
      console.error("Viewer not initialized");
      return;
    }

    // URL validation
    if (!url) {
      console.error("❌ loadBimGltf called with undefined URL");
      return;
    }

    // Clean placement at correct ellipsoid height
    const { lat, lon, height = 0 } = options; 

    console.log("🚀 Loading BIM GLB at:", { lat, lon, height });

    // Store old model matrix if replacing
    let previousMatrix: Cesium.Matrix4 | null = null;
    if (this.currentModel) {
      previousMatrix = Cesium.Matrix4.clone(this.currentModel.modelMatrix);
    }

    const position = (lon !== undefined && lat !== undefined) 
      ? Cesium.Cartesian3.fromDegrees(lon, lat, height)
      : (previousMatrix ? Cesium.Matrix4.getTranslation(previousMatrix, new Cesium.Cartesian3()) : Cesium.Cartesian3.ZERO);

    const modelMatrix = previousMatrix || Cesium.Transforms.eastNorthUpToFixedFrame(position);

    // Clean up old model
    if (this.viewer && this.currentModel) {
      this.viewer.scene.primitives.remove(this.currentModel);
      if (!this.currentModel.isDestroyed()) {
        this.currentModel.destroy();
      }
      this.currentModel = null;
    }

    try {
      const newModel = await Cesium.Model.fromGltfAsync({
        url,
        modelMatrix,
        scale,
        allowPicking: true
      });

      this.currentModel = newModel;
      this.viewer.scene.primitives.add(newModel);

      this.viewer.scene.requestRender();

      if (flyTo) {
        setTimeout(() => {
          if (!this.viewer) return;
          this.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, height + 150),
            duration: 2
          });
        }, 200);
      }
    } catch (err) {
      console.error("❌ Failed to load GLB:", err);
    }
  }

  /**
   * Helper method to test different scales when model is invisible
   * @param url - GLB URL
   * @param options - Position options
   */
  public async testModelScales(
    url: string,
    options: { lat: number; lon: number; height?: number }
  ): Promise<void> {
    const scales = [1000.0, 1.0, 0.01, 0.1, 10.0, 100.0, 0.001];

    console.log("🧪 Testing different scales to find the right one...");
    console.log("📏 First test: 1000.0 (mm to meters conversion)");

    for (const scale of scales) {
      console.log(`\n🔍 Testing scale: ${scale}`);
      console.log("------------------------");

      await this.loadBimGltf(url, options, scale);

      // Wait a bit to see if model appears
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Store local references
      const viewer = this.viewer;
      const model = this.currentModel;

      if (viewer && model) {
        viewer.scene.primitives.remove(model);

        if (!model.isDestroyed()) {
          model.destroy();
        }

        this.currentModel = null;
        console.log(`🧹 Removed model with scale ${scale}`);
      }

      // Wait a bit before next test
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log("✅ Scale testing complete!");
  }
}