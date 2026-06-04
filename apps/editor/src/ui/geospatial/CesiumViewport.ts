import * as Cesium from "cesium";
import { TransformGizmo, GizmoMode } from "./TransformGizmo";
// MAP-DATA-OVERTURE — keyless OSM/Overture context-building loader (bbox → GeoJSON
// footprints + heights). Used to surround the proposed massing with real buildings
// that cast shadows (Forma/Archistar-style context). Same data path as the 2D map.
import {
    fetchContextBuildings,
    type ContextBuildingCollection,
} from "./contextBuildings";
// FORMA.5 — pure NOAA solar-position calculator (L2, no THREE / no I/O).
// `solarSample(lat, lon, utcIso)` → { altitudeRad, azimuthRad, isAboveHorizon }.
// This is the SAME pure algorithm the ClimatePanel sun-path uses; FORMA.5 reads
// it to drive the Cesium directional light (read-only consumer — SPEC §6).
import { solarSample } from "@pryzm/climate-host";

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

/**
 * Camera framing for a site location. ~600 m looking almost straight down so the
 * user sees their parcel + immediate surroundings, NOT the globe limb/horizon.
 * The keyless ESRI World Imagery has tiles up to z19, so this altitude reads as a
 * crisp aerial photo of the plot. Pitch is near-nadir (-80°) with a slight tilt
 * so the scene still has some depth/3D feel rather than a flat orthophoto.
 */
const SITE_FRAME_HEIGHT_M = 600;
const SITE_FRAME_PITCH_DEG = -80;
const SITE_FLY_DURATION_S = 1.5;

/**
 * FORMA.2 — Forma-style "massing study" palette (SPEC-FORMA-SITE-VIEW.md §2 / §9).
 * This is the analysis-canvas palette, deliberately distinct from PRYZM chrome
 * (white + #6600FF). Single source of truth for the Cesium Forma render mode.
 */
const FORMA_PALETTE = {
  /** Flat warm-grey massing ground (§2 Ground & water). */
  ground: '#D9D5CE',
  /** Scene background — kills the photo sky (§2 Sky / background). */
  background: '#E8E8E6',
  /** Black silhouette outline on proposed buildings (§2). */
  silhouette: '#1C1C1C',
  /** Proposed-building volume fill (§2). */
  proposedFill: '#FFFFFF',
  /** Context-building fill (§2). */
  contextFill: '#E8E5DF',
  /** Soft shadow tint (§2 Shadows) — rgba(20,20,20,0.30). */
  shadowTint: 'rgba(20,20,20,0.30)',
  /** Parcel-boundary dashed line + fill (§2 Special elements / §3). */
  boundaryLine: '#2D6A4F',
  boundaryFill: 'rgba(45,106,79,0.08)',
} as const;

/**
 * FORMA.3 — NW oblique camera handoff (SPEC §4.5): heading 325°, pitch −45°.
 * The destination altitude scales with √areaM2 so the whole plot is framed.
 */
const FORMA_FLY_HEADING_DEG = 325;
const FORMA_FLY_PITCH_DEG = -45;
const FORMA_FLY_DURATION_S = 1.2;
/** Altitude (m) = FORMA_FLY_ALT_K · √areaM2, clamped so tiny/huge plots frame sanely. */
const FORMA_FLY_ALT_K = 3.2;
const FORMA_FLY_ALT_MIN_M = 80;
const FORMA_FLY_ALT_MAX_M = 4000;

/** Silhouette edge width in px (§2 — 1.5px). */
const FORMA_SILHOUETTE_WIDTH = 1.5;
/** Ambient-occlusion intensity (§2 — ≈ 2.5). */
const FORMA_AO_INTENSITY = 2.5;
/**
 * Ambient fill so shaded faces never crush to black (§2 — ≈ 0.55). Cesium has
 * no first-class global-ambient knob; we approximate it by keeping
 * `globe.enableLighting=false` (flat-lit ground) and clamping the shadow map
 * darkness so the shaded tone never goes below this fraction of full light.
 */
const FORMA_AMBIENT = 0.55;
/** Directional-light intensity for the Forma key light (task brief — 1.8). */
const FORMA_LIGHT_INTENSITY = 1.8;

export class CesiumViewport {
  private container: HTMLDivElement;
  private viewer: Cesium.Viewer | null = null;
  private handler: Cesium.ScreenSpaceEventHandler | null = null;
  private currentModel: Cesium.Model | null = null;
  private gizmo: TransformGizmo | null = null;
  /** Disposer for the `site.location-changed` runtime subscription (cleaned up
   *  in dispose() so it does not leak across project switches). */
  private locationSub: (() => void) | null = null;
  /** When true, the NEXT `site.location-changed` does not re-fly the camera — set
   *  by a caller (GISAreaLayout's geocode `onFlyTo`) that has ALREADY framed the
   *  exact plot bbox, so the event-driven point-flyTo doesn't override the better
   *  extent framing with a redundant second flight. One-shot. */
  private suppressNextLocationFly = false;

  // ---- mount/ready signal (replaces the fragile 400ms timer in callers) ----
  /** Resolves once `mount()` has fully constructed the Cesium viewer. Callers
   *  (GISAreaLayout's Forma 3D activation) await this instead of guessing with a
   *  setTimeout, so setFormaMode + renderFormaMassing never race the mount. */
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  /** True once mount() has resolved — lets `whenReady()` short-circuit on a
   *  viewer that is already up. */
  private isReady = false;

  // ---- FORMA.2 — Forma "massing study" render mode state ----
  /** True when the Forma render mode is currently active. */
  private formaMode = false;
  /** The default scene light, captured the first time we enter Forma mode so
   *  toggling back to photoreal restores it exactly. */
  private originalLight: Cesium.Light | null = null;
  /** Whether the captured originalLight has been taken (vs. undefined-at-construction). */
  private originalLightCaptured = false;
  /** AO post-process stage (added once, toggled via `.enabled`). May stay null
   *  if the GPU/Cesium build can't construct it (feature-detected). */
  private formaAoStage: Cesium.PostProcessStage | null = null;
  /** Silhouette post-process stage + its composite (added once, toggled via
   *  `.enabled`). The composite is what's added to `scene.postProcessStages`. */
  private formaSilhouetteStage: Cesium.PostProcessStage | null = null;
  private formaSilhouetteComposite: Cesium.PostProcessStageComposite | null = null;
  /** One-time guard so the "post-process unavailable" warning logs only once. */
  private formaPostProcessWarned = false;

  // ---- FORMA.3 — authored-massing entity placement state ----
  /** Entities placed for the authored massing (proposed buildings + boundary),
   *  so a re-render can clear the previous set before placing the new one. */
  private formaMassingEntities: Cesium.Entity[] = [];
  /** The last-known site lat/lon (= ENU anchor) + the boundary centroid (in ENU
   *  metres) + plot area the massing was placed against — used by the
   *  "Zoom to Site" / "Reset View" affordance to repeat the NW oblique flyTo. */
  private formaMassingOrigin:
    | { lat: number; lon: number; centroidEast: number; centroidNorth: number; areaM2: number }
    | null = null;

  // ---- FORMA.4 — coordinate bridge: terrain clamp + live-update cache ----
  /** Ground height (metres above the ellipsoid) sampled at the boundary
   *  centroid, used as the Z base of every extrusion + the boundary overlay so
   *  buildings sit on sloped ground. 0 until a terrain sample succeeds. */
  private formaTerrainBaseHeight = 0;
  /** The (lat,lon) the terrain height was last sampled at — so a live-update
   *  only re-samples terrain when the centroid actually moves (SPEC §4.6 /
   *  task #2 "re-clamp terrain only when the centroid changes"). */
  private formaTerrainSampledAt: { lat: number; lon: number } | null = null;
  /** One-time guard so the "terrain sample failed → base 0" warning logs once. */
  private formaTerrainWarned = false;
  /** Monotonic token serialising overlapping async terrain samples — only the
   *  latest placement's clamp is allowed to commit (newer placement wins). */
  private formaTerrainToken = 0;

  // ---- FORMA.5 — sun-driven light + time/season scrubber state ----
  /** The datetime the Forma directional light is currently solved for. Drives
   *  the sun vector via `solarSample`; updated by `setFormaSunTime`. Defaults to
   *  "now" so the very first Forma frame already shows a plausible real sun. */
  private formaSunDate: Date = new Date();
  /** The lat/lon the sun vector was last solved at (= site origin). Lets the
   *  scrubber recompute without re-reading the store, and lets a location change
   *  re-solve the sun. null until the first solve. */
  private formaSunLatLon: { lat: number; lon: number } | null = null;
  /** Last solved sun position (degrees) — surfaced to the scrubber UI readout
   *  ("alt 34° · az 128°") + used to decide night fallback. */
  private formaSunLast: { altitudeDeg: number; azimuthDeg: number; isAboveHorizon: boolean } | null = null;
  /** Observers (the scrubber UI) notified whenever the sun is re-solved. */
  private formaSunListeners = new Set<(p: { altitudeDeg: number; azimuthDeg: number; isAboveHorizon: boolean; date: Date }) => void>();

  // ---- MAP-DATA-OVERTURE — context-building (surrounding massing) state ----
  /** Cesium entities placed for the surrounding OSM/Overture context buildings,
   *  so a refresh / location change can clear the previous set. */
  private contextBuildingEntities: Cesium.Entity[] = [];
  /** The (lat,lon) the context buildings were last loaded for — skip a refetch
   *  when the site hasn't moved (the loader also caches per bbox). */
  private contextBuildingsAt: { lat: number; lon: number } | null = null;
  /** Abort handle for an in-flight context-building fetch (cancelled on a newer
   *  load / dispose so a stale response can't repaint the wrong site). */
  private contextBuildingsAbort: AbortController | null = null;
  /** One-time guard so the "context buildings unavailable" warning logs once. */
  private contextBuildingsWarned = false;

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
    this.readyPromise = new Promise<void>((resolve) => { this.resolveReady = resolve; });
  }

  /**
   * Resolves once the Cesium viewer is fully mounted (replaces the caller-side
   * 400ms guess). Resolves immediately if mount has already completed. If mount
   * has not been kicked off yet, the returned promise resolves when it does.
   */
  public whenReady(): Promise<void> {
    if (this.isReady && this.viewer) return Promise.resolve();
    return this.readyPromise;
  }

  /** Synchronous check used by callers that must not block. */
  public isMounted(): boolean {
    return this.isReady && this.viewer != null;
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
      // 🗺️ Base map imagery — keyless, rich & crisp (A.8.b / founder feedback)
      // ----------------------------
      // The default Cesium World Imagery needs a valid ion token, and the Google
      // Photorealistic 3D Tiles below need BOTH an ion token AND a linked Google
      // Maps key — when either is missing the globe renders as a faint, near-white
      // ellipsoid ("you can see things but really light"), which is useless for
      // site-boundary drawing.
      //
      // We use ESRI World Imagery (satellite) as the keyless default: it reads as
      // a real aerial photo of the plot — far richer and less washed-out than flat
      // OSM street tiles for a site-context view — and needs NO API key. OSM is
      // kept as an automatic fallback if the ESRI provider fails to construct.
      // Both are plain https tile hosts already covered by `img-src 'self' data:
      // blob: https:` in server/securityHeaders.js (no CSP change required; dev
      // CSP is report-only).
      //
      // The raw tiles are colour-graded on the returned ImageryLayer so they have
      // depth and punch instead of looking pale: brightness slightly <1 (kills the
      // wash), contrast & saturation >1 (richer colour + separation), gamma ~1.1
      // (gentle midtone lift). Tasteful — not blown out.
      try {
        this.viewer.imageryLayers.removeAll();

        const ESRI_WORLD_IMAGERY =
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        const OSM_STREETS = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

        let baseProvider: Cesium.UrlTemplateImageryProvider;
        let baseLabel: string;
        try {
          baseProvider = new Cesium.UrlTemplateImageryProvider({
            url: ESRI_WORLD_IMAGERY, // note {z}/{y}/{x} order for ArcGIS
            maximumLevel: 19,
            credit:
              'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
          });
          baseLabel = 'ESRI World Imagery (satellite)';
        } catch {
          baseProvider = new Cesium.UrlTemplateImageryProvider({
            url: OSM_STREETS,
            maximumLevel: 19,
            credit: '© OpenStreetMap contributors',
          });
          baseLabel = 'OpenStreetMap (streets fallback)';
        }

        const baseLayer = this.viewer.imageryLayers.addImageryProvider(baseProvider);
        // Colour-grade so the basemap reads rich & crisp instead of washed out.
        baseLayer.brightness = 0.9;  // <1 — pull back the wash
        baseLayer.contrast = 1.15;   // >1 — more tonal depth
        baseLayer.saturation = 1.25; // >1 — richer, more vivid colour
        baseLayer.gamma = 1.1;       // gentle midtone lift, not blown out

        console.log(
          `[CesiumViewport] Keyless base imagery installed: ${baseLabel} ` +
            '(graded brightness 0.9 / contrast 1.15 / saturation 1.25 / gamma 1.1).'
        );
      } catch (e) {
        console.warn('[CesiumViewport] Base imagery failed to install:', e);
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

      // ----------------------------
      // ✨ Scene quality — subtle realism (founder feedback: not washed out)
      // ----------------------------
      // Sun-based shading + a visible sky atmosphere give the keyless basemap a
      // sense of depth and light direction instead of a flat, evenly-lit (and
      // therefore pale-looking) globe. Kept tasteful: enableLighting shades the
      // terrain by the sun; skyAtmosphere + the ground atmosphere stay on so the
      // horizon reads as a real sky. Not cranked — no HDR/bloom blow-out.
      try {
        const scene = this.viewer.scene;
        const globe = scene.globe;
        // Sun-based shading on the basemap (off by default in Cesium).
        globe.enableLighting = true;
        // Soften the day/night terminator so shaded ground isn't crushed to black.
        globe.dynamicAtmosphereLighting = true;
        globe.atmosphereBrightnessShift = 0.05; // tiny lift on the lit side
        // Ground + sky atmosphere visible for a real horizon/sky.
        globe.showGroundAtmosphere = true;
        if (scene.skyAtmosphere) {
          scene.skyAtmosphere.show = true;
        }
        console.log('[CesiumViewport] Scene quality: sun lighting + atmosphere enabled.');
      } catch (e) {
        console.warn('[CesiumViewport] Scene quality config failed:', e);
      }

      // Camera controls
      const controller = this.viewer.scene.screenSpaceCameraController;
      controller.enableZoom = true;
      controller.enableRotate = true;
      controller.enableTilt = true;

      // ----------------------------
      // 🏙️ FORMA.2 — Forma massing render mode (additive; photoreal kept intact)
      // ----------------------------
      // Expose a manual-test hook + read an optional init flag. Default is OFF
      // (photoreal stays the default) UNLESS no Cesium token is configured — in
      // that case the photoreal/Google-tiles path degrades to a near-white globe
      // (audit §1.2.2 / inline comment :104-111), so the abstract Forma look is
      // strictly better and we default it ON. Either can be overridden by
      // `window.__pryzmFormaMode` (true/false) before mount.
      try {
        const win = window as unknown as { __pryzmFormaMode?: boolean; pryzmSetCesiumFormaMode?: (on: boolean) => void };
        win.pryzmSetCesiumFormaMode = (on: boolean) => this.setFormaMode(on);
        const flag = win.__pryzmFormaMode;
        const defaultOn = !_cesiumToken && !photogrammetryLoaded;
        const wantForma = typeof flag === 'boolean' ? flag : defaultOn;
        if (wantForma) {
          console.log(
            `[CesiumViewport] FORMA.2 mode ON at mount (` +
              `${typeof flag === 'boolean' ? 'window.__pryzmFormaMode' : 'default — no Cesium token, photoreal degraded'}).`
          );
          this.setFormaMode(true);
        } else {
          console.log('[CesiumViewport] FORMA.2 mode available — call window.pryzmSetCesiumFormaMode(true) to enable.');
        }
      } catch (e) {
        console.warn('[CesiumViewport] FORMA.2 init hook failed:', e);
      }

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

      // ----------------------------
      // 📍 Camera framing — follow the SITE location, not a hard-coded default
      // ----------------------------
      // Founder feedback ("the still-light cesium view pops up"): the viewer used
      // to setView to a hard-coded Sydney Opera House default (LAT -33.8568 LON
      // 151.2153 HEIGHT 1000, pitch -45°) and STAY there even after the user
      // geocoded a real address — so the camera looked at the wrong place on the
      // globe and the user saw the pale atmosphere/limb instead of their plot.
      //
      // Now: if the open project already has a Site location (the user geocoded an
      // address in a prior step), frame THAT plot instantly at mount. Otherwise
      // fall back to the Sydney default purely so the globe isn't pointed at empty
      // space. Either way we subscribe to `site.location-changed` so an
      // interactive geocode smoothly flies the 3D camera to the searched address,
      // matching the 2D Hektar map's behaviour.
      const initialLoc = this.readSiteLocation();
      if (initialLoc) {
        this.frameSiteLocation(initialLoc.lat, initialLoc.lon, { instant: true });
        console.log(
          `[CesiumViewport] Framed existing site location at mount: LAT ${initialLoc.lat} LON ${initialLoc.lon} ` +
            `(height ${SITE_FRAME_HEIGHT_M}m, pitch ${SITE_FRAME_PITCH_DEG}°).`
        );
      } else {
        // Fallback only — no real site yet. (Sydney default; replaced as soon as a
        // real location arrives via mount-read above or site.location-changed below.)
        this.viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(151.2153, -33.8568, 1000),
          orientation: {
            heading: 0,
            pitch: Cesium.Math.toRadians(-45),
            roll: 0
          }
        });
        console.log('[CesiumViewport] No site location yet — using fallback default view until a location is geocoded.');
      }

      // Subscribe to interactive location changes (geocode search / onboarding /
      // console site-create). Smooth flyTo so the 3D view follows the plot.
      this.subscribeToSiteLocation();

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

      // Signal mount/ready so callers (Forma 3D activation) can await instead of
      // guessing with a setTimeout.
      this.isReady = true;
      this.resolveReady();
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

  /**
   * Read the current Site's geographic origin (lat/lon) from the runtime's
   * `siteModelStore`, or null if there's no site / no real location yet. A 0/0
   * location is the `ensureSite` placeholder (siteDispatch §94) and is treated as
   * "unset" so we don't frame the camera on Null Island.
   */
  private readSiteLocation(): { lat: number; lon: number } | null {
    const store = this.runtime?.siteModelStore as
      | { getLocation?: () => { latitude: number; longitude: number } | null }
      | undefined;
    const loc = store?.getLocation?.();
    if (loc && (loc.latitude !== 0 || loc.longitude !== 0)) {
      return { lat: loc.latitude, lon: loc.longitude };
    }
    return null;
  }

  /**
   * Point the camera at a site location so the user sees their plot (top-down at
   * ~600 m, near-nadir pitch) instead of the washed-out globe limb.
   *
   * @param instant when true (framing at mount), jump there with `setView`;
   *   otherwise (an interactive location change) glide with a ~1.5 s `flyTo`.
   */
  private frameSiteLocation(lat: number, lon: number, opts: { instant?: boolean } = {}): void {
    if (!this.viewer) return;
    const destination = Cesium.Cartesian3.fromDegrees(lon, lat, SITE_FRAME_HEIGHT_M);
    const orientation = {
      heading: 0,
      pitch: Cesium.Math.toRadians(SITE_FRAME_PITCH_DEG),
      roll: 0,
    };
    if (opts.instant) {
      this.viewer.camera.setView({ destination, orientation });
    } else {
      this.viewer.camera.flyTo({ destination, orientation, duration: SITE_FLY_DURATION_S });
    }
    this.viewer.scene.requestRender();
  }

  /**
   * Subscribe to `site.location-changed` so a geocode search (GIS rail box A.8.a,
   * onboarding location step, or console site-create) smoothly flies the 3D
   * camera to the searched address — the SAME signal the 2D Hektar map centres
   * on. Idempotent; the disposer is cleaned up in dispose().
   */
  private subscribeToSiteLocation(): void {
    const events = this.runtime?.events;
    if (!events || this.locationSub) return;
    const sub = events.on('site.location-changed', (e) => {
      const loc = e?.location;
      if (!loc || (loc.latitude === 0 && loc.longitude === 0)) return;
      if (this.suppressNextLocationFly) {
        // GISAreaLayout's geocode onFlyTo already framed the exact plot bbox.
        this.suppressNextLocationFly = false;
        console.log('[CesiumViewport] site.location-changed: bbox framing already done by caller — skipping point flyTo.');
        return;
      }
      console.log(
        `[CesiumViewport] site.location-changed → flying camera to LAT ${loc.latitude} LON ${loc.longitude}.`
      );
      // FORMA.5 — re-anchor the sun at the new site so shadows are correct here.
      this.setFormaSunLocation(loc.latitude, loc.longitude);
      this.frameSiteLocation(loc.latitude, loc.longitude, { instant: false });
      // MAP-DATA-OVERTURE — refresh the surrounding context buildings for the new
      // site (only while the Forma massing canvas is active; in photoreal the
      // Google/ESRI tiles already show real buildings). Best-effort, guarded.
      if (this.formaMode) {
        void this.loadContextBuildings(loc.latitude, loc.longitude, true);
      }
    });
    // EventSubscription is both callable and Disposable — store the callable form.
    this.locationSub = () => sub();
  }

  /**
   * FORMA.2 — switch the Cesium scene into the Autodesk-Forma "massing study"
   * look (flat warm-grey ground, no sky/atmosphere, soft shadows, AO +
   * silhouette post-process) and back to the existing photoreal path.
   *
   * Per SPEC-FORMA-SITE-VIEW.md §2 + §8.5: this is an ADDITIVE mode — the
   * photoreal path (ESRI satellite + Google 3D tiles + sun lighting +
   * atmosphere) is fully preserved and restored when toggled off. Post-process
   * stages (AO + silhouette) are feature-detected and degrade gracefully when
   * the GPU/Cesium build doesn't support them.
   *
   * @param on true → Forma massing look; false → restore photoreal.
   */
  public setFormaMode(on: boolean): void {
    if (!this.viewer) {
      console.warn('[CesiumViewport] setFormaMode called before mount — ignored.');
      return;
    }
    if (on === this.formaMode) return;
    this.formaMode = on;
    if (on) {
      this.applyFormaMode();
    } else {
      this.restorePhotorealMode();
    }
    this.viewer.scene.requestRender();
  }

  /** @returns whether the Forma render mode is currently active. */
  public isFormaMode(): boolean {
    return this.formaMode;
  }

  /**
   * Apply the Forma massing aesthetic to the live scene (§2). Each block mirrors
   * the defensive try/catch already used elsewhere in this file so one failing
   * GPU feature never blanks the viewport.
   */
  private applyFormaMode(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const scene = viewer.scene;
    const globe = scene.globe;

    // --- Imagery / tiles: hide satellite + show a FLAT warm-grey ground (§2). ---
    // We keep the imagery layers in place but turn them OFF so toggling back is
    // exact; the globe itself stays shown with a single flat base colour so the
    // massing reads as seated on uniform ground (roads/water are the 2D map's job).
    try {
      for (let i = 0; i < viewer.imageryLayers.length; i++) {
        viewer.imageryLayers.get(i).show = false;
      }
      globe.show = true;
      globe.baseColor = Cesium.Color.fromCssColorString(FORMA_PALETTE.ground);
      globe.showGroundAtmosphere = false;
      globe.enableLighting = false; // Forma ground is flat-lit, not sun-shaded (§2).
      globe.translucency.enabled = false;
      // Flat-ground massing: terrain depth test is harmless and keeps placed
      // geometry seated; leave it enabled for the flat case.
      globe.depthTestAgainstTerrain = true;
    } catch (e) {
      console.warn('[CesiumViewport][forma] ground/imagery config failed:', e);
    }

    // --- Hide the photogrammetry / 3D tilesets while in Forma mode (§2). ---
    try {
      const prims = scene.primitives;
      for (let i = 0; i < prims.length; i++) {
        const p = prims.get(i);
        if (p instanceof Cesium.Cesium3DTileset) {
          p.show = false;
        }
      }
    } catch (e) {
      console.warn('[CesiumViewport][forma] tileset hide failed:', e);
    }

    // --- Sky / background: kill the photo look (§2 Sky / background). ---
    try {
      // SkyBox.show is missing from the class in cesium's generated .d.ts
      // (emitted as a stray module-level `var show`); access via a safe cast.
      if (scene.skyBox) (scene.skyBox as unknown as { show: boolean }).show = false;
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
      if (scene.sun) scene.sun.show = false;
      if (scene.moon) scene.moon.show = false;
      scene.fog.enabled = false;
      scene.backgroundColor = Cesium.Color.fromCssColorString(FORMA_PALETTE.background);
    } catch (e) {
      console.warn('[CesiumViewport][forma] sky/background config failed:', e);
    }

    // --- Lighting: REAL sun direction from NOAA solar position (FORMA.5, §6). ---
    // The directional light direction is solved from the site lat/lon + the
    // current scrubber datetime (`this.formaSunDate`) via the pure `solarSample`
    // calculator — so the FORMA.2 soft shadows fall at the true sun angle. When
    // no site location is known yet, OR the sun is below the horizon, we fall
    // back to a fixed ~10:00 key direction so the scene is never black.
    try {
      if (!this.originalLightCaptured) {
        this.originalLight = scene.light ?? null;
        this.originalLightCaptured = true;
      }
      this.applyFormaSunLight();
    } catch (e) {
      console.warn('[CesiumViewport][forma] lighting config failed:', e);
    }

    // --- Shadows: soft, large, dark-grey translucent tone (§2 Shadows). ---
    try {
      viewer.shadows = true;
      const sm = scene.shadowMap;
      if (sm) {
        sm.enabled = true;
        sm.softShadows = true;
        sm.size = 4096;
        // Soften the shaded tone so shadows read as rgba(20,20,20,0.30), not
        // black. `darkness` is the fraction of light remaining in shadow; we
        // never let it drop below the FORMA_AMBIENT fill (0.55 → ~0.3 shadow),
        // so shaded faces keep the warm ambient lift (§2 Ambient ≈ 0.55).
        sm.darkness = Math.max(0.3, 1 - FORMA_AMBIENT);
      }
    } catch (e) {
      console.warn('[CesiumViewport][forma] shadow config failed:', e);
    }

    // --- Post-process: AO + silhouette (FEATURE-DETECTED; degrade gracefully). ---
    this.ensureFormaPostProcess();
    if (this.formaAoStage) this.formaAoStage.enabled = true;
    if (this.formaSilhouetteComposite) this.formaSilhouetteComposite.enabled = true;

    console.log(
      '[CesiumViewport] FORMA mode applied: flat ground ' + FORMA_PALETTE.ground +
        ', no sky/atmosphere, soft shadows 4096' +
        (this.formaAoStage ? ', AO' : ', AO=unavailable') +
        (this.formaSilhouetteComposite ? ', silhouette' : ', silhouette=unavailable') + '.'
    );
  }

  /**
   * FORMA.5 — solve the REAL sun direction for the site + current scrubber
   * datetime and set the Cesium directional light to it (SPEC §6 sun/shadow).
   *
   * SOLAR → CESIUM LIGHT mapping (the §7 FORMA.5 risk):
   *   • `solarSample(lat, lon, utcIso)` returns altitude above horizon + azimuth
   *     clockwise-from-North, both radians (NOAA convention — the SAME one the
   *     ClimatePanel sun-path renders, so the two views agree).
   *   • The unit vector pointing FROM the scene TOWARD the sun, in the site's
   *     local ENU frame (east, north, up):
   *         east = cos(alt)·sin(az)   north = cos(alt)·cos(az)   up = sin(alt)
   *   • A Cesium `DirectionalLight.direction` points the way light TRAVELS
   *     (sun → ground), i.e. the NEGATIVE of the to-sun vector.
   *   • We transform that ENU vector into ECEF (world) with the SAME
   *     `eastNorthUpToFixedFrame` anchor used for massing placement, so the light
   *     is correct at the real globe location, not just at lon/lat 0.
   *
   * Night / no-location fallback: when the sun is below the horizon, or no site
   * location is known, we use a fixed warm ~10:00 NE→SW key so the scene is
   * never unlit (graceful degradation — SPEC §6 "no data" discipline).
   */
  private applyFormaSunLight(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const scene = viewer.scene;

    // Resolve the anchor lat/lon: the scrubber's cached origin, else the live
    // site location, else null (→ fixed fallback key).
    let latLon = this.formaSunLatLon;
    if (!latLon) {
      const loc = this.readSiteLocation();
      if (loc) {
        latLon = { lat: loc.lat, lon: loc.lon };
        this.formaSunLatLon = latLon;
      }
    }

    let direction: Cesium.Cartesian3;
    let warm = true;
    let solved: { altitudeDeg: number; azimuthDeg: number; isAboveHorizon: boolean } | null = null;

    if (latLon) {
      try {
        const s = solarSample(latLon.lat, latLon.lon, this.formaSunDate.toISOString());
        const altDeg = (s.altitudeRad * 180) / Math.PI;
        const azDeg = (s.azimuthRad * 180) / Math.PI;
        solved = { altitudeDeg: altDeg, azimuthDeg: azDeg, isAboveHorizon: s.isAboveHorizon };
        if (s.isAboveHorizon) {
          // to-sun unit vector in local ENU (east, north, up).
          const cosAlt = Math.cos(s.altitudeRad);
          const toSunEast = cosAlt * Math.sin(s.azimuthRad);
          const toSunNorth = cosAlt * Math.cos(s.azimuthRad);
          const toSunUp = Math.sin(s.altitudeRad);
          // Light travels FROM sun TO ground → negate.
          const localDir = new Cesium.Cartesian3(-toSunEast, -toSunNorth, -toSunUp);
          // ENU → ECEF via the site anchor (vector transform, no translation).
          const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
            Cesium.Cartesian3.fromDegrees(latLon.lon, latLon.lat, 0),
          );
          const ecef = Cesium.Matrix4.multiplyByPointAsVector(enu, localDir, new Cesium.Cartesian3());
          direction = Cesium.Cartesian3.normalize(ecef, new Cesium.Cartesian3());
          // Warm when low, cooler near noon — matches the sun-path intuition.
          warm = altDeg < 25;
        } else {
          // Sun below horizon — keep a soft fixed key so the massing stays visible.
          direction = this.formaFallbackSunDirection();
        }
      } catch (e) {
        console.warn('[CesiumViewport][forma] solarSample failed — fixed key:', e);
        direction = this.formaFallbackSunDirection();
      }
    } else {
      direction = this.formaFallbackSunDirection();
    }

    scene.light = new Cesium.DirectionalLight({
      direction,
      color: Cesium.Color.fromCssColorString(warm ? '#FFE9CC' : '#FFF6EC'),
      intensity: FORMA_LIGHT_INTENSITY,
    });

    this.formaSunLast = solved;
    // Notify the scrubber UI (it renders the alt/az readout + slider position).
    const detail = {
      altitudeDeg: solved?.altitudeDeg ?? 0,
      azimuthDeg: solved?.azimuthDeg ?? 0,
      isAboveHorizon: solved?.isAboveHorizon ?? false,
      date: this.formaSunDate,
    };
    for (const l of this.formaSunListeners) {
      try { l(detail); } catch (e) { console.warn('[CesiumViewport][forma] sun listener threw:', e); }
    }
  }

  /** Fixed warm ~10:00 NE→SW key direction (ECEF-agnostic local approximation),
   *  used when no site location is known or the sun is below the horizon. */
  private formaFallbackSunDirection(): Cesium.Cartesian3 {
    return Cesium.Cartesian3.normalize(
      new Cesium.Cartesian3(-0.55, -0.7, -0.45),
      new Cesium.Cartesian3(),
    );
  }

  /**
   * FORMA.5 — set the datetime the Forma sun is solved for (the time/season
   * scrubber's single write seam). Recomputes the directional light → the soft
   * shadows move live. No-op when not yet mounted. Cheap (one solar solve + one
   * light swap, no per-frame work).
   *
   * @param date the local/UTC instant to solve the sun for.
   */
  public setFormaSunTime(date: Date): void {
    if (!Number.isFinite(date.getTime())) {
      console.warn('[CesiumViewport][forma] setFormaSunTime: invalid date — ignored.');
      return;
    }
    this.formaSunDate = new Date(date.getTime());
    if (!this.viewer || !this.formaMode) return; // applied on next Forma enable.
    try {
      this.applyFormaSunLight();
      this.viewer.scene.requestRender();
    } catch (e) {
      console.warn('[CesiumViewport][forma] setFormaSunTime failed:', e);
    }
  }

  /** FORMA.5 — update the site lat/lon the sun is anchored at (called when the
   *  site location changes). Re-solves the light if Forma mode is active. */
  public setFormaSunLocation(lat: number, lon: number): void {
    this.formaSunLatLon = { lat, lon };
    if (this.viewer && this.formaMode) {
      try {
        this.applyFormaSunLight();
        this.viewer.scene.requestRender();
      } catch (e) {
        console.warn('[CesiumViewport][forma] setFormaSunLocation failed:', e);
      }
    }
  }

  /** FORMA.5 — the datetime the Forma sun is currently solved for (scrubber init). */
  public getFormaSunTime(): Date {
    return new Date(this.formaSunDate.getTime());
  }

  /** FORMA.5 — last solved sun position (alt/az degrees + above-horizon), or
   *  null if not yet solved. Surfaced in the scrubber readout. */
  public getFormaSunPosition(): { altitudeDeg: number; azimuthDeg: number; isAboveHorizon: boolean } | null {
    return this.formaSunLast;
  }

  /** FORMA.5 — subscribe to sun re-solves (the scrubber refreshes its readout).
   *  Returns an idempotent disposer. */
  public onFormaSunChange(
    fn: (p: { altitudeDeg: number; azimuthDeg: number; isAboveHorizon: boolean; date: Date }) => void,
  ): () => void {
    this.formaSunListeners.add(fn);
    return () => { this.formaSunListeners.delete(fn); };
  }

  /**
   * Restore the photoreal aesthetic captured at mount (§8.5 — never delete the
   * photoreal path). Re-shows imagery + tilesets, sun lighting + atmosphere,
   * and disables the Forma post-process stages.
   */
  private restorePhotorealMode(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const scene = viewer.scene;
    const globe = scene.globe;

    try {
      // Re-show imagery; hide globe again only if a tileset is present + shown.
      for (let i = 0; i < viewer.imageryLayers.length; i++) {
        viewer.imageryLayers.get(i).show = true;
      }
      let tilesetShown = false;
      const prims = scene.primitives;
      for (let i = 0; i < prims.length; i++) {
        const p = prims.get(i);
        if (p instanceof Cesium.Cesium3DTileset) {
          p.show = true;
          tilesetShown = true;
        }
      }
      globe.show = !tilesetShown;
      globe.baseColor = Cesium.Color.fromCssColorString('#000000');
      // Restore the photoreal scene-quality settings (mirror mount :209-217).
      globe.enableLighting = true;
      globe.dynamicAtmosphereLighting = true;
      globe.showGroundAtmosphere = true;
      globe.depthTestAgainstTerrain = false;
    } catch (e) {
      console.warn('[CesiumViewport][forma] restore ground/imagery failed:', e);
    }

    try {
      if (scene.skyBox) (scene.skyBox as unknown as { show: boolean }).show = true;
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = true;
      if (scene.sun) scene.sun.show = true;
      if (scene.moon) scene.moon.show = true;
      // Photoreal default has fog off in this viewport already; leave it off.
      scene.backgroundColor = Cesium.Color.BLACK;
    } catch (e) {
      console.warn('[CesiumViewport][forma] restore sky failed:', e);
    }

    try {
      if (this.originalLightCaptured) {
        // Cesium's default scene light is a SunLight; restoring null is invalid,
        // so fall back to a fresh SunLight when we captured nothing concrete.
        scene.light = this.originalLight ?? new Cesium.SunLight();
      }
    } catch (e) {
      console.warn('[CesiumViewport][forma] restore light failed:', e);
    }

    try {
      // Photoreal path did not configure shadows; turn them back off.
      viewer.shadows = false;
      if (scene.shadowMap) scene.shadowMap.enabled = false;
    } catch (e) {
      console.warn('[CesiumViewport][forma] restore shadows failed:', e);
    }

    if (this.formaAoStage) this.formaAoStage.enabled = false;
    if (this.formaSilhouetteComposite) this.formaSilhouetteComposite.enabled = false;

    // MAP-DATA-OVERTURE — the context-building overlay belongs to the Forma canvas
    // only (photoreal already shows real buildings via the satellite/Google tiles).
    try {
      this.contextBuildingsAbort?.abort();
      this.clearContextBuildings();
      this.contextBuildingsAt = null;
    } catch (e) {
      console.warn('[CesiumViewport][forma] context-building clear on restore failed:', e);
    }

    console.log('[CesiumViewport] Photoreal mode restored.');
  }

  /**
   * Construct + register the Forma post-process stages ONCE, feature-detecting
   * every stage. If the GPU/Cesium build can't build a stage (or
   * `scene.postProcessStages` is unsupported), we log once and skip it; the
   * Forma flat materials + shadows still apply. Stages are added with
   * `.enabled = false` and toggled by apply/restore.
   */
  private ensureFormaPostProcess(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const scene = viewer.scene;
    const stages = scene.postProcessStages as Cesium.PostProcessStageCollection | undefined;
    if (!stages) {
      this.warnFormaPostProcessOnce('scene.postProcessStages unavailable');
      return;
    }

    // Ambient occlusion (§2 — intensity ≈ 2.5, bias 0.1, lengthCap 0.03).
    // This Cesium build exposes AO as a BUILT-IN composite on the collection
    // (`stages.ambientOcclusion`, HBAO), not a factory — feature-detect both:
    // prefer the built-in; fall back to a `createAmbientOcclusionStage()`
    // factory if a future/older build has one instead.
    if (!this.formaAoStage) {
      try {
        const collAny = stages as unknown as {
          ambientOcclusion?: Cesium.PostProcessStageComposite;
        };
        const libAny = Cesium.PostProcessStageLibrary as {
          createAmbientOcclusionStage?: () => Cesium.PostProcessStageComposite | Cesium.PostProcessStage;
        };
        // GPU/extension support guard (HBAO needs WEBGL_depth_texture).
        const aoSupported =
          typeof (Cesium.PostProcessStageLibrary as { isAmbientOcclusionSupported?: (s: Cesium.Scene) => boolean }).isAmbientOcclusionSupported === 'function'
            ? (Cesium.PostProcessStageLibrary as { isAmbientOcclusionSupported: (s: Cesium.Scene) => boolean }).isAmbientOcclusionSupported(scene)
            : true;

        let ao: Cesium.PostProcessStageComposite | Cesium.PostProcessStage | undefined =
          collAny.ambientOcclusion; // built-in composite (already in the collection)
        const builtIn = ao != null;
        if (!ao && libAny.createAmbientOcclusionStage) {
          ao = libAny.createAmbientOcclusionStage(); // factory fallback
        }

        if (ao && aoSupported) {
          // Tune via the composite's uniform alias (shape varies across builds).
          const uniforms = (ao as unknown as { uniforms?: Record<string, unknown> }).uniforms;
          if (uniforms) {
            if ('intensity' in uniforms) uniforms.intensity = FORMA_AO_INTENSITY;
            if ('bias' in uniforms) uniforms.bias = 0.1;
            if ('lengthCap' in uniforms) uniforms.lengthCap = 0.03;
            if ('ambientOcclusionOnly' in uniforms) uniforms.ambientOcclusionOnly = false;
          }
          // The built-in composite is already registered — only `add()` a
          // factory-constructed one. Store the handle for the enabled toggle.
          this.formaAoStage = builtIn ? (ao as Cesium.PostProcessStage) : (stages.add(ao as Cesium.PostProcessStage) as Cesium.PostProcessStage);
          this.formaAoStage.enabled = false;
        } else {
          this.warnFormaPostProcessOnce(aoSupported ? 'ambient occlusion stage unavailable' : 'ambient occlusion unsupported by GPU');
        }
      } catch (e) {
        this.warnFormaPostProcessOnce('AO stage construction failed: ' + String(e));
      }
    }

    // Silhouette (§2 — colour #1C1C1C, ~1.5px). Applied to a `selected` array
    // that FORMA.3 will populate with the proposed-building primitives. For now
    // the stage exists with an empty selection (no crash on empty).
    if (!this.formaSilhouetteComposite) {
      try {
        const lib = Cesium.PostProcessStageLibrary as {
          createSilhouetteStage?: () => Cesium.PostProcessStageComposite;
          createEdgeDetectionStage?: () => Cesium.PostProcessStage;
        };
        // Prefer the edge-detection-driven silhouette so we can tune colour/width.
        const edge = lib.createEdgeDetectionStage?.();
        let composite: Cesium.PostProcessStageComposite | undefined;
        if (edge) {
          const eu = (edge as unknown as { uniforms?: Record<string, unknown> }).uniforms;
          if (eu) {
            if ('color' in eu) eu.color = Cesium.Color.fromCssColorString(FORMA_PALETTE.silhouette);
            if ('length' in eu) eu.length = FORMA_SILHOUETTE_WIDTH / 1000; // edge length is normalised
          }
          composite = Cesium.PostProcessStageLibrary.createSilhouetteStage?.([edge]);
          this.formaSilhouetteStage = edge;
        }
        if (!composite) {
          // Fallback: a default silhouette composite with no edge tuning.
          composite = lib.createSilhouetteStage?.();
        }
        if (composite) {
          this.formaSilhouetteComposite = stages.add(composite) as Cesium.PostProcessStageComposite;
          this.formaSilhouetteComposite.enabled = false;
        } else {
          this.warnFormaPostProcessOnce('createSilhouetteStage unavailable');
        }
      } catch (e) {
        this.warnFormaPostProcessOnce('silhouette stage construction failed: ' + String(e));
      }
    }
  }

  /**
   * FORMA.2 (stub for FORMA.3) — set the primitives the silhouette stage should
   * outline (the proposed-building massing). Safe to call with an empty array;
   * does not crash when the silhouette stage is unavailable.
   */
  public setFormaSilhouetteTargets(primitives: unknown[]): void {
    const stage = this.formaSilhouetteStage;
    if (!stage) return;
    try {
      (stage as unknown as { selected: unknown[] }).selected = primitives ?? [];
      this.viewer?.scene.requestRender();
    } catch (e) {
      console.warn('[CesiumViewport][forma] setFormaSilhouetteTargets failed:', e);
    }
  }

  /** Log the "post-process unavailable / failed" message at most once. */
  private warnFormaPostProcessOnce(reason: string): void {
    if (this.formaPostProcessWarned) return;
    this.formaPostProcessWarned = true;
    console.warn(
      '[CesiumViewport][forma] post-process degraded (' + reason + '). ' +
        'Keeping flat materials + shadows; skipping AO/silhouette.'
    );
  }

  /**
   * FORMA.3 — render PRYZM's authored building massing + the drawn parcel
   * boundary into the Cesium scene at the real-world site, in the Forma
   * "white-volume + black-outline" look (SPEC §3 / §4).
   *
   * COORDINATE BRIDGE (SPEC §4, NON-GOAL §8.3 — no parallel projector):
   * the input polygons are PRYZM scene-XZ metres in the local ENU frame
   * (`x = East`, `z = −North`, the `LTPENURebase` convention). We anchor a
   * SINGLE `Cesium.Transforms.eastNorthUpToFixedFrame` matrix at the site
   * origin (lat0/lon0 — which IS the scene origin), so each scene-XZ point maps
   * directly to ENU `(east = x, north = −z, up = h)` with ONE matrix multiply —
   * the exact same anchoring approach `CesiumThreeBridge` / `transformModel`
   * already use. No second UTM derivation, no boundary re-projection.
   *
   * - Proposed buildings → white `#FFFFFF` polygons extruded to their authored
   *   height, `outline:true` outlineColor `#1C1C1C`, shadows CAST_AND_RECEIVE.
   *   The placed primitives are fed into the FORMA.2 silhouette stage.
   * - Parcel boundary → faint-green dashed overlay (`#2D6A4F`, fill
   *   `rgba(45,106,79,0.08)`).
   *
   * Old massing entities are cleared before re-rendering. Idempotent + safe to
   * call before/after `setFormaMode(true)` (it forces Forma mode on).
   *
   * FORMA.4 — TERRAIN CLAMP (SPEC §4.3, task #1): every extrusion + the boundary
   * overlay is seated at `this.formaTerrainBaseHeight`, the ground height sampled
   * at the boundary centroid via `sampleTerrainMostDetailed`, so buildings sit on
   * sloped ground rather than at ellipsoid 0. The sample is async; we place
   * immediately at the LAST KNOWN base height (0 on first run), then kick off
   * `clampTerrainThenReplace()` which re-samples and re-places once the height is
   * known. If there is no terrain provider, the sample rejects, or the height is
   * NaN → we fall back to base 0 and log once (never crash). The sample is
   * skipped entirely when the centroid hasn't moved since the last clamp (task #2
   * "re-clamp terrain only when the centroid changes").
   */
  public renderFormaMassing(input: {
    /** Site geographic origin = the ENU anchor (scene origin). */
    originLat: number;
    originLon: number;
    /** Parcel boundary ring in scene-XZ metres, or null when not drawn. */
    boundary: ReadonlyArray<{ x: number; z: number }> | null;
    /** Authored walls (the massing) in scene-XZ metres + authored height/thickness. */
    walls: ReadonlyArray<{
      a: { x: number; z: number };
      b: { x: number; z: number };
      height: number;
      thickness: number;
    }>;
    /** When true, fly the camera to the NW oblique framing after placing (§4.5). */
    frameCentroid?: boolean;
    /**
     * Internal (FORMA.4) — when true, this call is the second pass AFTER a
     * terrain sample, so we must NOT kick off another async clamp (avoids an
     * infinite re-sample loop). External callers leave this unset.
     */
    _skipTerrainClamp?: boolean;
  }): void {
    const viewer = this.viewer;
    if (!viewer) {
      console.warn('[CesiumViewport][forma] renderFormaMassing before mount — ignored.');
      return;
    }
    // Forma look is the canvas for the massing — make sure it's on.
    if (!this.formaMode) this.setFormaMode(true);

    this.clearFormaMassing();

    const { originLat, originLon, boundary, walls } = input;
    // FORMA.4 — base Z for every extrusion/overlay = the terrain height sampled
    // at the centroid (0 until the first successful sample, kept across the
    // immediate placement so the clamp doesn't flash).
    const baseHeight = this.formaTerrainBaseHeight;
    // ONE ENU frame at the site origin (= scene origin). scene-XZ → ENU is then
    // (east = x, north = −z) with this single matrix (SPEC §4.2).
    const originCartesian = Cesium.Cartesian3.fromDegrees(originLon, originLat, 0);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(originCartesian);

    const toCartesian = (x: number, z: number, up: number): Cesium.Cartesian3 => {
      // scene-XZ → ENU local (east, north, up): east = x, north = −z.
      const local = new Cesium.Cartesian3(x, -z, up);
      return Cesium.Matrix4.multiplyByPoint(enu, local, new Cesium.Cartesian3());
    };

    const silhouetteTargets: Cesium.Entity[] = [];

    // ── Proposed building massing — one white extrusion per authored wall ──────
    // A wall's footprint is its baseLine widened to its thickness (a thin rect),
    // extruded to its authored height. This reads the authored walls directly
    // (SPEC §4 read source) without needing per-room polygons.
    try {
      for (const w of walls) {
        const ring = this.wallFootprintRing(w.a, w.b, w.thickness);
        if (!ring) continue;
        const positions = ring.map((p) => toCartesian(p.x, p.z, baseHeight));
        const ent = viewer.entities.add({
          name: 'pryzm-forma-massing-wall',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            // FORMA.4 — seat on terrain: base + extrude to base + height.
            extrudedHeight: baseHeight + Math.max(0.1, w.height),
            height: baseHeight,
            material: Cesium.Color.fromCssColorString(FORMA_PALETTE.proposedFill),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(FORMA_PALETTE.silhouette),
            outlineWidth: 1.5,
            // ShadowMode.ENABLED == "casts AND receives" (the task's
            // CAST_AND_RECEIVE intent — Cesium names that member ENABLED).
            shadows: Cesium.ShadowMode.ENABLED,
            perPositionHeight: false,
          },
        });
        this.formaMassingEntities.push(ent);
        silhouetteTargets.push(ent);
      }
    } catch (e) {
      console.warn('[CesiumViewport][forma] massing extrusion failed:', e);
    }

    // ── Parcel boundary — faint-green dashed overlay (§2 / §3) ────────────────
    let centroidEast = 0;
    let centroidNorth = 0;
    let areaM2 = 0;
    if (boundary && boundary.length >= 3) {
      try {
        const positions = boundary.map((p) => toCartesian(p.x, p.z, baseHeight + 0.05));
        const ent = viewer.entities.add({
          name: 'pryzm-forma-parcel-boundary',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            material: Cesium.Color.fromCssColorString(FORMA_PALETTE.boundaryLine).withAlpha(0.08),
            height: baseHeight + 0.05,
            outline: false,
          },
        });
        this.formaMassingEntities.push(ent);

        // Dashed top line (closed ring).
        const ringClosed = [...positions, positions[0]!];
        const line = viewer.entities.add({
          name: 'pryzm-forma-parcel-boundary-line',
          polyline: {
            positions: ringClosed,
            width: 2,
            clampToGround: false,
            material: new Cesium.PolylineDashMaterialProperty({
              color: Cesium.Color.fromCssColorString(FORMA_PALETTE.boundaryLine),
              dashLength: 16,
            }),
          },
        });
        this.formaMassingEntities.push(line);

        // Centroid (ENU metres) + area for the NW oblique flyTo.
        const c = this.polygonCentroidAndAreaXZ(boundary);
        centroidEast = c.east;
        centroidNorth = c.north;
        areaM2 = c.area;
      } catch (e) {
        console.warn('[CesiumViewport][forma] boundary overlay failed:', e);
      }
    }

    // Feed the proposed-building entities into the FORMA.2 silhouette stage (§3).
    this.setFormaSilhouetteTargets(silhouetteTargets);

    this.formaMassingOrigin = { lat: originLat, lon: originLon, centroidEast, centroidNorth, areaM2 };

    if (input.frameCentroid) {
      this.flyToFormaSite();
    }

    viewer.scene.requestRender();
    console.log(
      `[CesiumViewport][forma] massing rendered: ${walls.length} wall volume(s)` +
        `${boundary && boundary.length >= 3 ? ' + parcel boundary' : ''}` +
        ` at LAT ${originLat} LON ${originLon} (area ≈ ${Math.round(areaM2)} m², base ${baseHeight.toFixed(1)} m).`
    );

    // FORMA.4 — kick off the async terrain clamp at the boundary centroid. This
    // re-samples + re-places ONLY if the centroid has moved since the last clamp
    // (task #2). Never blocks the placement above (the toggle stays responsive).
    if (!input._skipTerrainClamp) {
      void this.clampTerrainThenReplace(input);
      // MAP-DATA-OVERTURE — surround the proposed massing with real context
      // buildings (keyless OSM). Best-effort + non-blocking; guarded internally.
      // Skipped on the terrain re-place pass (_skipTerrainClamp) so we don't
      // refetch — the terrain clamp re-seats existing context entities cheaply via
      // the unchanged-centre skip.
      void this.loadContextBuildings(originLat, originLon);
    }
  }

  /**
   * FORMA.4 — terrain clamp (SPEC §4.3, task #1). Samples the ground height at
   * the boundary centroid (or the site origin when no boundary is drawn) via
   * `Cesium.sampleTerrainMostDetailed`, then re-places the massing seated at that
   * height. Fully guarded:
   *   • no terrain provider / `EllipsoidTerrainProvider` (the keyless default) →
   *     returns height 0, which is the correct flat-ground base (no-op re-place).
   *   • sample rejects OR returns NaN → fall back to base 0, log once, no crash.
   *   • centroid unchanged since the last clamp → skip the sample entirely
   *     (task #2 "re-clamp terrain only when the centroid changes").
   *   • a newer placement supersedes this one → its token wins; we bail.
   * Headless / no-Cesium-token: `viewer.terrainProvider` is the ellipsoid
   * provider (height 0) so this degrades to base 0 silently.
   */
  private async clampTerrainThenReplace(
    input: Parameters<CesiumViewport['renderFormaMassing']>[0],
  ): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;

    // Sample point = boundary centroid (lat/lon) when drawn, else the origin.
    let sampleLat = input.originLat;
    let sampleLon = input.originLon;
    if (input.boundary && input.boundary.length >= 3) {
      const c = this.polygonCentroidAndAreaXZ(input.boundary);
      // ENU (east, north) → lat/lon via the same anchor used for placement.
      const originCartesian = Cesium.Cartesian3.fromDegrees(input.originLon, input.originLat, 0);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(originCartesian);
      const centroidCartesian = Cesium.Matrix4.multiplyByPoint(
        enu,
        new Cesium.Cartesian3(c.east, c.north, 0),
        new Cesium.Cartesian3(),
      );
      const carto = Cesium.Cartographic.fromCartesian(centroidCartesian);
      sampleLat = Cesium.Math.toDegrees(carto.latitude);
      sampleLon = Cesium.Math.toDegrees(carto.longitude);
    }

    // task #2 — skip the (expensive, network) sample if the centroid is where we
    // already clamped. ~1e-6° ≈ 0.1 m, well under terrain LOD resolution.
    const prev = this.formaTerrainSampledAt;
    if (prev && Math.abs(prev.lat - sampleLat) < 1e-6 && Math.abs(prev.lon - sampleLon) < 1e-6) {
      return;
    }

    const provider = viewer.terrainProvider as Cesium.TerrainProvider | undefined;
    if (!provider) {
      // No provider at all → flat base 0 (already placed). Record so we don't
      // retry every event for the same centroid.
      this.formaTerrainSampledAt = { lat: sampleLat, lon: sampleLon };
      return;
    }

    const myToken = ++this.formaTerrainToken;
    let sampledHeight = 0;
    try {
      const carto = Cesium.Cartographic.fromDegrees(sampleLon, sampleLat);
      const [result] = await Cesium.sampleTerrainMostDetailed(provider, [carto]);
      const h = result?.height;
      sampledHeight = typeof h === 'number' && Number.isFinite(h) ? h : 0;
      if (typeof h !== 'number' || !Number.isFinite(h)) {
        this.warnTerrainOnce('sampled height was NaN/undefined — using base 0.');
      }
    } catch (e) {
      this.warnTerrainOnce('sampleTerrainMostDetailed rejected — using base 0: ' + String(e));
      sampledHeight = 0;
    }

    // A newer placement started after us — let it own the clamp; bail.
    if (myToken !== this.formaTerrainToken || !this.viewer) return;

    this.formaTerrainSampledAt = { lat: sampleLat, lon: sampleLon };

    // If the height is effectively unchanged from what we already placed at,
    // there is nothing to re-place (e.g. flat ellipsoid provider → 0 → 0).
    if (Math.abs(sampledHeight - this.formaTerrainBaseHeight) < 1e-3) return;

    this.formaTerrainBaseHeight = sampledHeight;
    console.log(
      `[CesiumViewport][forma] terrain clamp: base height ${sampledHeight.toFixed(2)} m ` +
        `at LAT ${sampleLat.toFixed(6)} LON ${sampleLon.toFixed(6)} — re-placing.`,
    );
    // Re-place at the new base. `_skipTerrainClamp` prevents an infinite loop;
    // `frameCentroid:false` so the re-place never re-flies the camera (task #2).
    this.renderFormaMassing({ ...input, frameCentroid: false, _skipTerrainClamp: true });
    // MAP-DATA-OVERTURE — the base height changed, so re-seat the context
    // buildings on the new ground too (force, since the centre is unchanged).
    void this.loadContextBuildings(input.originLat, input.originLon, true);
  }

  /** Log the "terrain clamp degraded → base 0" message at most once. */
  private warnTerrainOnce(reason: string): void {
    if (this.formaTerrainWarned) return;
    this.formaTerrainWarned = true;
    console.warn('[CesiumViewport][forma] terrain clamp degraded (' + reason + ').');
  }

  /**
   * FORMA.3 — fly the camera to the NW oblique framing (heading 325°,
   * pitch −45°, altitude ∝ √areaM2) centred on the boundary centroid (SPEC
   * §4.5). Public so a "Zoom to Site" / "Reset View" affordance can repeat it.
   * No-op until `renderFormaMassing` has set the origin.
   */
  public flyToFormaSite(): void {
    const viewer = this.viewer;
    const o = this.formaMassingOrigin;
    if (!viewer || !o) {
      console.warn('[CesiumViewport][forma] flyToFormaSite: no massing placed yet — ignored.');
      return;
    }
    try {
      // Re-derive the centroid Cartesian via the SAME ENU anchor as placement.
      const originCartesian = Cesium.Cartesian3.fromDegrees(o.lon, o.lat, 0);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(originCartesian);
      const centroidCartesian = Cesium.Matrix4.multiplyByPoint(
        enu,
        new Cesium.Cartesian3(o.centroidEast, o.centroidNorth, 0),
        new Cesium.Cartesian3()
      );
      const carto = Cesium.Cartographic.fromCartesian(centroidCartesian);
      const alt = Cesium.Math.clamp(
        FORMA_FLY_ALT_K * Math.sqrt(Math.max(1, o.areaM2)),
        FORMA_FLY_ALT_MIN_M,
        FORMA_FLY_ALT_MAX_M
      );
      const destination = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, alt);
      viewer.camera.flyTo({
        destination,
        orientation: {
          heading: Cesium.Math.toRadians(FORMA_FLY_HEADING_DEG),
          pitch: Cesium.Math.toRadians(FORMA_FLY_PITCH_DEG),
          roll: 0,
        },
        duration: FORMA_FLY_DURATION_S,
      });
      viewer.scene.requestRender();
      console.log(
        `[CesiumViewport][forma] NW oblique flyTo: heading ${FORMA_FLY_HEADING_DEG}°, ` +
          `pitch ${FORMA_FLY_PITCH_DEG}°, alt ${Math.round(alt)} m.`
      );
    } catch (e) {
      console.warn('[CesiumViewport][forma] flyToFormaSite failed:', e);
    }
  }

  /**
   * FORMA.3 — remove all authored-massing + boundary entities (idempotent) and
   * clear the silhouette selection. Called before each re-render and on dispose.
   */
  public clearFormaMassing(): void {
    const viewer = this.viewer;
    if (viewer) {
      for (const ent of this.formaMassingEntities) {
        try {
          viewer.entities.remove(ent);
        } catch {
          /* already gone */
        }
      }
    }
    this.formaMassingEntities = [];
    this.setFormaSilhouetteTargets([]);
  }

  /**
   * MAP-DATA-OVERTURE — load the surrounding context buildings (keyless OSM via
   * Overpass — see contextBuildings.ts) and render them as extruded white-ish
   * `#E8E5DF`@0.92 `PolygonGraphics` around the proposed massing, so the Forma
   * view shows real neighbours casting + receiving shadows (Archistar/Forma look).
   *
   * COORDINATE BRIDGE — reuses the EXACT same single-ENU-anchor approach as
   * `renderFormaMassing` (NO parallel coord system, SPEC §8.3): one
   * `eastNorthUpToFixedFrame` at the site origin; each footprint's lon/lat is
   * converted to local ENU metres relative to that origin and placed with one
   * matrix multiply. Buildings are seated at `formaTerrainBaseHeight` so they sit
   * on the same ground as the massing.
   *
   * CACHING — skips the refetch when the site centre hasn't moved (the loader also
   * caches per bbox). FALLBACK — any failure (offline / Overpass down / no
   * features) leaves the scene with NO context buildings (today's behaviour); it
   * never throws and logs once with a `[forma]` prefix.
   *
   * @param lat,lon the site origin (= ENU anchor = scene origin).
   * @param force re-fetch even when the centre is unchanged (e.g. after a
   *   project switch that cleared the entities).
   */
  public async loadContextBuildings(lat: number, lon: number, force = false): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;

    // Skip when unchanged (≈0.1 m) and we already have entities, unless forced.
    const prev = this.contextBuildingsAt;
    if (
      !force && prev &&
      Math.abs(prev.lat - lat) < 1e-6 && Math.abs(prev.lon - lon) < 1e-6 &&
      this.contextBuildingEntities.length > 0
    ) {
      return;
    }

    // Cancel any in-flight load; start a fresh one.
    this.contextBuildingsAbort?.abort();
    this.contextBuildingsAbort = new AbortController();
    const signal = this.contextBuildingsAbort.signal;

    let collection: ContextBuildingCollection;
    try {
      collection = await fetchContextBuildings(lat, lon, signal);
    } catch (e) {
      // fetchContextBuildings never throws, but be defensive.
      this.warnContextOnce('fetch threw — no context buildings: ' + String(e));
      return;
    }
    // A newer load (or dispose) superseded us.
    if (signal.aborted || !this.viewer || this.viewer !== viewer) return;

    this.clearContextBuildings();
    this.contextBuildingsAt = { lat, lon };

    if (collection.features.length === 0) {
      this.warnContextOnce('no context footprints returned for this site (sparse/offline).');
      return;
    }

    // ONE ENU frame at the site origin — identical anchor to renderFormaMassing.
    const originCartesian = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(originCartesian);
    const base = this.formaTerrainBaseHeight;
    const fill = Cesium.Color.fromCssColorString(FORMA_PALETTE.contextFill).withAlpha(0.92);
    const outline = Cesium.Color.fromCssColorString(FORMA_PALETTE.silhouette).withAlpha(0.35);

    let placed = 0;
    for (const f of collection.features) {
      try {
        const ring = f.geometry.coordinates[0];
        if (!ring || ring.length < 4) continue;
        // lon/lat → local ENU metres about the origin, then ENU → ECEF.
        const positions = ring.map(([flon, flat]) => {
          const fc = Cesium.Cartesian3.fromDegrees(flon!, flat!, 0);
          // Local ENU offset of this point from the origin (vector in metres).
          const localOffset = Cesium.Matrix4.multiplyByPoint(
            Cesium.Matrix4.inverse(enu, new Cesium.Matrix4()),
            fc,
            new Cesium.Cartesian3(),
          );
          // Re-place at the terrain base height in the SAME ENU frame.
          return Cesium.Matrix4.multiplyByPoint(
            enu,
            new Cesium.Cartesian3(localOffset.x, localOffset.y, base),
            new Cesium.Cartesian3(),
          );
        });
        const h = f.properties.heightM;
        const ent = viewer.entities.add({
          name: 'pryzm-forma-context-building',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: base,
            extrudedHeight: base + Math.max(0.1, h),
            material: fill,
            outline: true,
            outlineColor: outline,
            outlineWidth: 1,
            // ShadowMode.ENABLED == casts AND receives (Forma context shadows).
            shadows: Cesium.ShadowMode.ENABLED,
            perPositionHeight: false,
          },
        });
        this.contextBuildingEntities.push(ent);
        placed++;
      } catch {
        // Skip a single malformed footprint; never break the whole load.
      }
    }

    viewer.scene.requestRender();
    console.log(
      `[CesiumViewport][forma] context buildings rendered: ${placed} extruded footprint(s) ` +
        `around LAT ${lat} LON ${lon} (base ${base.toFixed(1)} m, ${FORMA_PALETTE.contextFill}@0.92, shadows on).`,
    );
  }

  /** MAP-DATA-OVERTURE — remove all context-building entities (idempotent). */
  public clearContextBuildings(): void {
    const viewer = this.viewer;
    if (viewer) {
      for (const ent of this.contextBuildingEntities) {
        try { viewer.entities.remove(ent); } catch { /* already gone */ }
      }
    }
    this.contextBuildingEntities = [];
  }

  /** Log the "context buildings unavailable / degraded" message at most once. */
  private warnContextOnce(reason: string): void {
    if (this.contextBuildingsWarned) return;
    this.contextBuildingsWarned = true;
    console.warn('[CesiumViewport][forma] context buildings degraded (' + reason + ').');
  }

  /**
   * FORMA.4 — the single live-update re-render seam. Wired (in GISAreaLayout) to
   * `site.parcel-boundary-set` / `apartment.layout-executed`: clear + re-place
   * the entities from fresh authored walls + boundary, WITHOUT re-flying the
   * camera (`frameCentroid:false` — the user keeps their current viewpoint and
   * sees the massing update in place; only the explicit 3D-activation / Zoom-to-
   * Site flies). Terrain is re-sampled by `renderFormaMassing` only when the
   * centroid moved (task #2).
   */
  public rerenderFormaMassing(input: Parameters<CesiumViewport['renderFormaMassing']>[0]): void {
    this.renderFormaMassing({ ...input, frameCentroid: false });
  }

  /**
   * Build a wall's footprint ring: the baseLine segment widened by its thickness
   * into a 4-vertex rectangle (CCW in scene-XZ). Returns null for a degenerate
   * (zero-length) segment.
   */
  private wallFootprintRing(
    a: { x: number; z: number },
    b: { x: number; z: number },
    thickness: number
  ): Array<{ x: number; z: number }> | null {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return null;
    const half = Math.max(0.01, thickness) / 2;
    // Left-hand normal in XZ: (−dz, dx)/len.
    const nx = (-dz / len) * half;
    const nz = (dx / len) * half;
    return [
      { x: a.x + nx, z: a.z + nz },
      { x: b.x + nx, z: b.z + nz },
      { x: b.x - nx, z: b.z - nz },
      { x: a.x - nx, z: a.z - nz },
    ];
  }

  /**
   * Polygon centroid (area-weighted) + absolute area of a scene-XZ ring,
   * returned in ENU metres (`east = x`, `north = −z`). Used to frame the NW
   * oblique camera on the plot centre with an altitude ∝ √area.
   */
  private polygonCentroidAndAreaXZ(
    ring: ReadonlyArray<{ x: number; z: number }>
  ): { east: number; north: number; area: number } {
    let signedArea = 0;
    let cx = 0;
    let cz = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      const cross = p.x * q.z - q.x * p.z;
      signedArea += cross;
      cx += (p.x + q.x) * cross;
      cz += (p.z + q.z) * cross;
    }
    signedArea *= 0.5;
    if (Math.abs(signedArea) < 1e-6) {
      // Degenerate — fall back to the vertex average.
      let ax = 0;
      let az = 0;
      for (const p of ring) {
        ax += p.x;
        az += p.z;
      }
      ax /= ring.length;
      az /= ring.length;
      return { east: ax, north: -az, area: 0 };
    }
    cx /= 6 * signedArea;
    cz /= 6 * signedArea;
    return { east: cx, north: -cz, area: Math.abs(signedArea) };
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

    // FORMA.3 — drop any placed massing/boundary entities first.
    try {
      this.clearFormaMassing();
    } catch (e) {
      console.warn('[CesiumViewport] forma massing dispose failed:', e);
    }
    this.formaMassingOrigin = null;
    // MAP-DATA-OVERTURE — cancel + drop context buildings so they don't leak
    // across project switches (a re-mounted viewport reloads them for the new site).
    try {
      this.contextBuildingsAbort?.abort();
      this.contextBuildingsAbort = null;
      this.clearContextBuildings();
      this.contextBuildingsAt = null;
    } catch (e) {
      console.warn('[CesiumViewport] context-building dispose failed:', e);
    }
    // FORMA.4 — reset the terrain-clamp cache so a re-mounted viewport (project
    // switch) re-samples ground height for the new site.
    this.formaTerrainBaseHeight = 0;
    this.formaTerrainSampledAt = null;
    this.formaTerrainToken++;
    // FORMA.5 — drop sun observers so the scrubber UI doesn't leak across mounts.
    this.formaSunListeners.clear();
    this.formaSunLast = null;
    this.formaSunLatLon = null;

    // Drop the site.location-changed subscription so it doesn't leak across
    // project switches (a new CesiumViewport re-subscribes on its own mount).
    if (this.locationSub) {
      try {
        this.locationSub();
      } catch (e) {
        console.warn('[CesiumViewport] location subscription dispose failed:', e);
      }
      this.locationSub = null;
    }

    if (this.handler) {
      this.handler.destroy();
      this.handler = null;
    }

    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }

    // Reset the ready signal so a re-mount (project switch) re-arms whenReady().
    this.isReady = false;
    this.readyPromise = new Promise<void>((resolve) => { this.resolveReady = resolve; });

    if (this.container.parentElement) {
      this.container.parentElement.removeChild(this.container);
    }
  }

  public getViewer(): Cesium.Viewer | null {
    return this.viewer;
  }

  /**
   * Tell the viewport that the caller is about to fly the camera to the exact
   * plot bbox itself (GISAreaLayout's geocode `onFlyTo`), so the immediately
   * following `site.location-changed` event does NOT trigger a redundant second
   * (point-altitude) flight. One-shot — cleared by the next location event.
   */
  public suppressNextSiteLocationFly(): void {
    this.suppressNextLocationFly = true;
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