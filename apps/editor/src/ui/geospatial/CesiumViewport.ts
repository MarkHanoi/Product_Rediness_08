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
import { getCurrentSiteOrigin } from "../site/siteDispatch";
// A.21.D24 — pure 3D climate-overlay geometry generators (no THREE/Cesium/DOM)
// + the pure wind-rose chart helper. The Cesium placement below anchors these
// ENU points with the SAME eastNorthUpToFixedFrame used for the massing.
import {
    sunArcEnuPoints,
    sunArcHourMarkers,
    windStreakSegments,
    windStreamlinePaths,
    heatTintColorHex,
    heatFieldCells,
} from "../climate/climateOverlayGeometry";
import { windRoseBars } from "../climate/climateChartData";

// H7 (07-BIM-SECURITY-CONTRACT §6.1): Cesium Ion token MUST be loaded from the
// VITE_CESIUM_TOKEN environment variable and MUST NOT be hardcoded in source.
// Set VITE_CESIUM_TOKEN in your .env.local file (never commit that file).
// The fallback below is a legacy dev token — it will be removed in a future
// release once all environments have the env var configured.
const _cesiumToken = import.meta.env.VITE_CESIUM_TOKEN as string | undefined;
// GIS-CESIUM-GOOGLE-KEY (A.21.D31) — SECOND credential path for real photoreal
// 3D tiles. A Google Maps Platform API key streams the SAME Google Photorealistic
// 3D Tiles directly (via `createGooglePhotorealistic3DTileset`) WITHOUT needing a
// Cesium ion token. The ion-asset path (asset 2275207) can be finicky to set up;
// a Google key is a common, founder-friendly alternative. Either credential
// unlocks the real-tiles path; with NEITHER we keep the keyless Forma/ESRI globe.
// Set VITE_GOOGLE_MAPS_KEY in .env.local (never commit that file).
const _googleMapsKey = import.meta.env.VITE_GOOGLE_MAPS_KEY as string | undefined;
console.log(
    `[gis][cesium] VITE_CESIUM_TOKEN ${_cesiumToken ? 'PRESENT' : 'ABSENT'}, ` +
    `VITE_GOOGLE_MAPS_KEY ${_googleMapsKey ? 'PRESENT' : 'ABSENT'} — ` +
    `${(_cesiumToken || _googleMapsKey) ? 'photoreal globe path available' : 'forcing Forma flat-ground (no photoreal globe)'}.`
);
if (!_cesiumToken) {
    console.warn(
        '[CesiumViewport] VITE_CESIUM_TOKEN is not set. ' +
        'Set it in .env.local to avoid exposing a token in source code. ' +
        'Falling back to dev token — do not use in production.'
    );
}
// §SECURITY (A.21.D36) — NO hardcoded ion token in source (this is a public repo).
// The token comes ONLY from the VITE_CESIUM_TOKEN build secret; absent it, the
// globe uses the keyless ESRI-satellite / Forma flat-ground path (photorealAvailable
// gates on !!_cesiumToken). The previously-committed fallback token (id 395639) was
// removed and should be rotated/revoked in Cesium ion.
Cesium.Ion.defaultAccessToken = _cesiumToken ?? '';

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
 * GIS-CESIUM-ZRAISE — z-index the Cesium container is raised to while GIS is
 * active. Must be > the PRYZM WebGPU overlay canvas (z-index:2 in
 * initScene.ts OVERLAY_CSS) and > the OBC WebGL canvas (z auto/0) so Cesium
 * actually paints on top of the BIM view, but < the floating Forma/result
 * toggles (z-index 30/31 in GISAreaLayout) so those chrome controls stay clickable.
 */
const CESIUM_Z = 15;

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
  /** Crisp graphite silhouette outline (§2) — dark enough for strong edge
   *  definition + contrast (founder: "stronger contrast"), not pure black. */
  silhouette: '#2B2B2B',
  /** Proposed-building volume fill (§2) — STRONG WHITE (founder: "strong white as
   *  forma"). Fully opaque; the single solid mass reads as a clean white volume. */
  proposedFill: '#FFFFFF',
  /** Context-building fill (§2). */
  contextFill: '#E8E5DF',
  /** Subtle graphite outline for context massing (lighter than proposed). */
  contextOutline: '#9A958C',
  /** Soft shadow tint (§2 Shadows) — rgba(20,20,20,0.30). */
  shadowTint: 'rgba(20,20,20,0.30)',
  /** Parcel-boundary dashed line + fill (§2 Special elements / §3). */
  boundaryLine: '#2D6A4F',
  boundaryFill: 'rgba(45,106,79,0.08)',
  /** §A.21.D34(d) — coarse GLAZING tint for window insets (cool blue-grey, reads
   *  as glass against the white shell without competing with the massing).
   *  §A.21.D39#6 — this is now the BASE colour for a TRANSLUCENT glass material
   *  (alpha applied at fill time = FORMA_GLAZING_ALPHA); a slightly cooler/bluer
   *  hue reads as real tinted glazing rather than an opaque blue-grey panel. */
  glazing: '#7FA8D8',
  /** §A.21.D34(d) — coarse DOOR-leaf tint (warm graphite, darker than glazing so
   *  the front door reads distinctly from windows). */
  doorLeaf: '#4A4540',
  /** §A.21.D34(d) — coarse STAIR volume tint (light graphite, sits between the
   *  white shell and the dark door so the stairwell mass reads). */
  stair: '#B9B3A8',
} as const;

/**
 * §A.21.D-FORMA (2026-06-05) — clean pastel use-colours for the proposed massing,
 * matching the founder's Forma reference (soft yellow residential, orange amenity,
 * green podium, lilac public). The single building mass is coloured by its
 * dominant programme; a plain residential apartment reads warm-cream-yellow.
 */
const FORMA_USE_COLOURS = {
  residential: '#F0E4A8', // soft yellow / cream
  amenity:     '#F2C58C', // warm orange
  podium:      '#C7DEA8', // ground / green podium
  public:      '#E2C2E8', // lilac / commercial-public
} as const;
type FormaUse = keyof typeof FORMA_USE_COLOURS;

/**
 * §A.21.D-FORMA z-fighting fix — every extruded mass is seated this far BELOW the
 * sampled ground height so its bottom face is buried inside the ground plane and
 * can never become coplanar with it (the classic Cesium flat-ground z-fight). The
 * visible top + sides are unaffected; the buried base is simply never seen.
 */
const FORMA_BASE_SINK_M = 0.6;

/**
 * FORMA.3 — NW oblique camera handoff (SPEC §4.5): heading 325°, pitch −45°.
 * The destination altitude scales with √areaM2 so the whole plot is framed.
 */
const FORMA_FLY_HEADING_DEG = 325;
const FORMA_FLY_PITCH_DEG = -45;
const FORMA_FLY_DURATION_S = 1.2;
/**
 * FORMA-PLAN-OBLIQUE — the Autodesk-Forma "plan" preset: a near-top-down but
 * still tilted camera so the directional shadows read as the depth cue (Forma's
 * "plan" is a Cesium plan-oblique, NOT a flat map). Heading North (0°), pitch
 * −68° (within the founder's −65°…−72° band). Same √areaM2 altitude framing as
 * the 3D oblique, so the whole plot fills the view.
 */
const FORMA_PLAN_HEADING_DEG = 0;
const FORMA_PLAN_PITCH_DEG = -68;
/** Altitude (m) = FORMA_FLY_ALT_K · √areaM2, clamped so tiny/huge plots frame sanely. */
const FORMA_FLY_ALT_K = 3.2;
const FORMA_FLY_ALT_MIN_M = 80;
const FORMA_FLY_ALT_MAX_M = 4000;

/** Silhouette edge width in px (§2 — 1.5px). */
const FORMA_SILHOUETTE_WIDTH = 1.5;
/** Ambient-occlusion intensity (§2 — ≈ 2.5). */
const FORMA_AO_INTENSITY = 2.5;
/** Directional-light intensity for the Forma key light. §A.21.D-FORMA2 raised
 *  1.8 → 2.3 so strong-white masses read crisp + bright with stronger highlights
 *  (founder: "strong white + stronger contrast"). */
const FORMA_LIGHT_INTENSITY = 2.3;
/**
 * §A.21.D-FORMA2 — shadow strength (fraction of light remaining IN shadow).
 * Lower = darker/stronger shadow. 0.30 gives the crisp Forma cast shadow the
 * founder asked for while still leaving enough fill that shaded faces don't
 * crush to pure black. Replaces the old `max(0.3, 1 - FORMA_AMBIENT)` (= 0.45,
 * too weak).
 */
const FORMA_SHADOW_DARKNESS = 0.30;

/**
 * §A.21.D39#6 — GLASS translucency for window panels. The glazing inset is now a
 * see-through blue-tinted material (alpha in the 0.25–0.40 band the founder asked
 * for) so you can read INTO the building through the windows instead of meeting an
 * opaque panel. The panel is also flagged `ShadowMode.DISABLED` so the sun-path
 * shadow pass casts THROUGH the glazing (glass does not block light); the white
 * shell + the opaque door leaf still cast solid shadows. 0.30 = clearly glass,
 * still enough tint to read as a window against the white shell.
 */
const FORMA_GLAZING_ALPHA = 0.30;

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

  // ---- §A.21.D24 — multi-floor massing: storey bands + visibility filter ----
  /** The storey bands of the last-rendered massing (ground-up). Published so the
   *  GISAreaLayout floor selector can build its toggle from the REAL storeys. */
  private formaStoreyBands: Array<{
    index: number;
    baseElevation: number;
    heightM: number;
    levelId?: string;
    wallCount: number;
  }> = [];
  /** Which storey indices are currently shown. null = ALL storeys (default). */
  private formaVisibleLevels: ReadonlyArray<number> | null = null;
  /** The last massing input, kept so `setVisibleFormaLevels` can re-render the
   *  SAME massing with a new floor filter without the caller re-reading state. */
  private formaLastMassingInput: Parameters<CesiumViewport['renderFormaMassing']>[0] | null = null;

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

  // ---- A.21.D24 — 3D climate-analysis overlays (sun-path / wind / heat) ----
  /** Entities placed for each toggleable analysis overlay, so each layer can be
   *  cleared independently without disturbing the massing/context entities. */
  private climateOverlayEntities: {
    sunPath: Cesium.Entity[];
    wind: Cesium.Entity[];
    heat: Cesium.Entity[];
  } = { sunPath: [], wind: [], heat: [] };
  /** Which overlays are currently requested ON (persisted across re-renders so a
   *  massing re-place / location change repaints the active layers). */
  private climateOverlayOn: { sunPath: boolean; wind: boolean; heat: boolean } =
    { sunPath: false, wind: false, heat: false };
  /** The ClimateDataset the wind/heat overlays draw from. Supplied by the
   *  analysis controls (which own the ClimateStore read); null until ingested. */
  private climateOverlayDataset: import('@pryzm/schemas').ClimateDataset | null = null;

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
  /** §A.21.D-GLOBE (2026-06-05) — debounce handle for the pan-driven context-building
   *  refresh so a flurry of camera moves coalesces into one Overpass fetch. */
  private contextPanRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  /** Phase B (S73-WIRE) — runtime threaded by parent. */
  public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

  constructor(private parent: HTMLElement, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null) {
      this.runtime = runtime;
    this.container = document.createElement("div");
    this.container.id = "cesium-viewport-container";
    this.container.style.position = "absolute";
    this.container.style.inset = "0";
    // GIS-CESIUM-ZRAISE — the BIM viewport stacks TWO canvases inside #container:
    // the OBC WebGL canvas (z auto/0, inside <bim-viewport>) and the PRYZM WebGPU
    // overlay canvas at z-index:2 (initScene.ts OVERLAY_CSS). The Cesium container
    // is a SIBLING of both. If it stays at z-index:0 it paints BEHIND the opaque
    // WebGPU overlay → completely invisible even with display:block. So we keep it
    // hidden (display:none, raised z-index) at construction and raise it ABOVE the
    // BIM canvases on setVisible(true). CESIUM_Z (15) is comfortably above the
    // WebGPU overlay's z-index:2 yet below the floating Forma/result toggles (z 30+).
    this.container.style.zIndex = String(CESIUM_Z);
    this.container.style.pointerEvents = "auto";
    this.container.style.background = "#000";
    // Hidden until the GIS toggle calls setVisible(true) — avoids the Cesium
    // container intercepting pointer events / painting over the BIM view at mount.
    this.container.style.display = "none";
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
    console.log(
      `[gis][cesium] mount start — token ${_cesiumToken ? 'present' : 'absent'}, ` +
      `parent #${this.parent.id || '(no-id)'} size ${this.parent.clientWidth}x${this.parent.clientHeight}.`
    );

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

      // GIS-CESIUM-NOTOKEN-IMAGERY (ratified 2026-06-04) — when NO real Cesium
      // token is configured the founder runs the FREE Forma path (flat-grey
      // massing ground, no photoreal globe), so we construct the viewer with NO
      // default base imagery layer. Cesium's default Viewer auto-adds an ion/ESRI
      // World Imagery base layer AND a baseLayerPicker that pulls Bing / Google
      // aerial — under the strict prod CSP every one of those tile requests
      // (server.arcgisonline.com / tile.googleapis.com / dev.virtualearth.net) is
      // CSP-blocked, flooding the console with `connect-src blocked` report-noise
      // and firing failed network calls for imagery we never show. `baseLayer:
      // false` (Viewer.ConstructorOptions — cesium@1.140 @cesium/widgets
      // index.d.ts:2172, `baseLayer?: ImageryLayer | false`) suppresses the
      // default layer entirely; baseLayerPicker stays false so it can't
      // re-introduce Bing/Google providers. The Forma flat-grey globe
      // (globe.baseColor) is the ground — no imagery is needed on this path.
      //
      // When a real token IS present we OMIT the override so Cesium installs its
      // default ion World Imagery and the existing photoreal path works exactly as
      // before; the arcgis/google/bing origins are allowed in
      // server/securityHeaders.js connect-src for that token-only path.
      const photorealAvailable = !!_cesiumToken;
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
        scene3DOnly: true,
        // No token → no default base imagery layer (zero ESRI/ion/Bing request).
        // Token present → omit so Cesium installs its default ion base layer.
        ...(photorealAvailable ? {} : { baseLayer: false as const }),
      });
      console.log(
        `[gis][cesium] imagery mode = ${photorealAvailable
          ? 'PHOTOREAL-WITH-TOKEN (default ion base layer installed; arcgis/google/bing tiles allowed via CSP)'
          : 'KEYLESS-SATELLITE (no token → no default ion layer; FREE ESRI World Imagery satellite basemap installed below for the 3D globe view; Google Photorealistic 3D Tiles need a VITE_CESIUM_TOKEN)'}.`
      );

      // Disable depth test against terrain
      this.viewer.scene.globe.depthTestAgainstTerrain = false;

      // ----------------------------
      // 🗺️ Base map imagery — ESRI satellite, ONLY on the token/photoreal path
      // ----------------------------
      // GIS-CESIUM-NOTOKEN-IMAGERY: the ESRI World Imagery provider below issues
      // tile requests to https://server.arcgisonline.com. On the FREE Forma path
      // (no Cesium token) we deliberately SKIP installing it so the strict prod
      // CSP never blocks an arcgis tile and the console stays quiet — the Forma
      // flat-grey globe is the ground, no aerial photo is wanted. We only install
      // the satellite basemap when a real token is present (the photoreal path),
      // where the operator has accepted the external-imagery dependency and the
      // arcgis origin is allowlisted in server/securityHeaders.js connect-src.
      //
      // The raw tiles are colour-graded on the returned ImageryLayer so they have
      // depth and punch instead of looking pale: brightness slightly <1 (kills the
      // wash), contrast & saturation >1 (richer colour + separation), gamma ~1.1
      // (gentle midtone lift). Tasteful — not blown out.
      // GIS-CESIUM-OSM-GLOBE (2026-06-05): install a base imagery layer on BOTH
      // paths. With a token → ESRI World Imagery satellite. WITHOUT a token →
      // the FREE keyless OpenStreetMap streets basemap, so the "3D globe" view
      // shows the REAL WORLD instead of a grey pixelated ellipsoid (the prior
      // behaviour SKIPPED imagery entirely without a token → no map). The prod
      // CSP already allows it: img-src includes `https:`, so tile.openstreetmap.org
      // tiles are not blocked. CRUCIALLY this does NOT regress the Forma massing
      // view: applyFormaMode() hides every imagery layer + paints the flat warm-
      // grey ground, and restorePhotorealMode() re-shows them — so the OSM map
      // only appears in the non-Forma globe view, never under the massing study.
      try {
        this.viewer.imageryLayers.removeAll();

        const ESRI_WORLD_IMAGERY =
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
        const OSM_STREETS = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

        // GIS-CESIUM-PHOTOREAL (2026-06-05) — default to ESRI World Imagery
        // (SATELLITE AERIAL) on BOTH paths. It is KEYLESS (server.arcgisonline.com,
        // already allowlisted in the CSP connect-src) and gives the photorealistic
        // ground the founder asked for instead of the flat OSM street map. OSM
        // streets remains a graceful fallback if the ESRI provider fails to build.
        // (NOTE: true photorealistic 3D BUILDINGS — Google Photorealistic 3D Tiles
        // streamed via Cesium ion asset 2275207 — still require a VITE_CESIUM_TOKEN;
        // that path lights up automatically below when a token is present.)
        let baseProvider: Cesium.UrlTemplateImageryProvider;
        let baseLabel: string;
        try {
          baseProvider = new Cesium.UrlTemplateImageryProvider({
            url: ESRI_WORLD_IMAGERY, // note {z}/{y}/{x} order for ArcGIS
            maximumLevel: 19,
            credit:
              'Imagery © Esri, Maxar, Earthstar Geographics, and the GIS User Community',
          });
          baseLabel = photorealAvailable
            ? 'ESRI World Imagery (satellite, token path)'
            : 'ESRI World Imagery (satellite — keyless 3D-globe basemap)';
        } catch {
          baseProvider = new Cesium.UrlTemplateImageryProvider({
            url: OSM_STREETS,
            maximumLevel: 19,
            credit: '© OpenStreetMap contributors',
          });
          baseLabel = 'OpenStreetMap streets (fallback)';
        }

        const baseLayer = this.viewer.imageryLayers.addImageryProvider(baseProvider);
        // Colour-grade so the basemap reads rich & crisp instead of washed out.
        baseLayer.brightness = 0.9;  // <1 — pull back the wash
        baseLayer.contrast = 1.15;   // >1 — more tonal depth
        baseLayer.saturation = 1.25; // >1 — richer, more vivid colour
        baseLayer.gamma = 1.1;       // gentle midtone lift, not blown out
        // If the viewer is being constructed straight into Forma mode, keep the
        // imagery hidden so the grey ground is unbroken; setFormaMode toggles it.
        if (this.formaMode) baseLayer.show = false;

        console.log(
          `[CesiumViewport] Base imagery installed: ${baseLabel} ` +
            `(graded; hidden-in-forma=${this.formaMode}).`
        );
      } catch (e) {
        console.warn('[CesiumViewport] Base imagery failed to install:', e);
      }

      // ----------------------------
      // 🌎 Google Photorealistic 3D Tiles — TWO credential paths (A.21.D31)
      // ----------------------------
      // GIS-CESIUM-NOTOKEN-IMAGERY: `fromIonAssetId` streams the Google tiles via
      // the ion CDN and pulls https://tile.googleapis.com. On the FREE Forma path
      // (no credential) the call would only fail (the hardcoded dev token can't
      // unlock a Google-linked asset) while still emitting CSP-blocked googleapis
      // requests — pure noise. So we SKIP it entirely without a credential; the
      // Forma massing scene needs no photogrammetry.
      //
      // GIS-CESIUM-GOOGLE-KEY: a Google Maps Platform API key streams the SAME
      // Google Photorealistic 3D Tiles directly (no ion account needed) via
      // `Cesium.createGooglePhotorealistic3DTileset`. We feature-detect the API
      // because the option-bag signature (`{ key }`) is the modern form; older
      // Cesium builds took a positional `key` argument.
      //
      // Branch order: ion token → google key → keyless fallback.
      let photogrammetryLoaded = false;

      // Apply the shared sharpness/quality props to whichever tileset we load.
      const applyTilesetQuality = (tileset: Cesium.Cesium3DTileset): void => {
        tileset.maximumScreenSpaceError = 2;
        tileset.dynamicScreenSpaceError = true;
        tileset.preloadFlightDestinations = true;
        tileset.preferLeaves = true;
        tileset.progressiveResolutionHeightFraction = 0.5;
        tileset.foveatedScreenSpaceError = true;
        tileset.foveatedConeSize = 0.1;
        tileset.foveatedInterpolationCallback = Cesium.Math.lerp;
        tileset.foveatedTimeDelay = 0.05;
      };

      if (_cesiumToken) try {
        const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(
          2275207 // Google Photorealistic 3D Tiles
        );

        applyTilesetQuality(tileset);

        // Add tileset without auto-zoom
        this.viewer.scene.primitives.add(tileset);
        photogrammetryLoaded = true;
        console.log("✅ Google Photorealistic 3D Tiles loaded — ion-token path (no auto zoom)");
      } catch (err) {
        console.error("❌ Failed to load photogrammetry (ion-token path):", err);
      } else if (_googleMapsKey) try {
        // Feature-detect the direct Google Maps Platform path. Modern Cesium:
        // `createGooglePhotorealistic3DTileset(options)` with `{ key }`; some
        // builds accept a positional `(key, options)`. Guard for both.
        const factory = (
          Cesium as unknown as {
            createGooglePhotorealistic3DTileset?: (
              ...args: unknown[]
            ) => Promise<Cesium.Cesium3DTileset>;
          }
        ).createGooglePhotorealistic3DTileset;

        if (typeof factory !== 'function') {
          console.warn(
            '[gis][cesium] VITE_GOOGLE_MAPS_KEY set but ' +
              'Cesium.createGooglePhotorealistic3DTileset is unavailable in this ' +
              'Cesium build → SKIPPING google-key photoreal tiles.'
          );
        } else {
          // Try the modern option-bag signature first; fall back to positional.
          let tileset: Cesium.Cesium3DTileset;
          try {
            tileset = await factory({ key: _googleMapsKey });
          } catch {
            tileset = await factory(_googleMapsKey);
          }

          applyTilesetQuality(tileset);

          // Add tileset without auto-zoom
          this.viewer.scene.primitives.add(tileset);
          photogrammetryLoaded = true;
          console.log("✅ Google Photorealistic 3D Tiles loaded — google-key path (no auto zoom)");
        }
      } catch (err) {
        console.error("❌ Failed to load photogrammetry (google-key path):", err);
      } else {
        console.log(
          '[gis][cesium] no credential (VITE_CESIUM_TOKEN / VITE_GOOGLE_MAPS_KEY) → ' +
            'Google Photorealistic 3D Tiles SKIPPED (no tile.googleapis.com requests).'
        );
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
        // GIS-CESIUM-NOTOKEN — when VITE_CESIUM_TOKEN is ABSENT we FORCE Forma flat-
        // ground regardless of whether the (hardcoded dev-token) photogrammetry call
        // happened to resolve: without a real configured token the photoreal globe
        // degrades to a washed-out / near-white ellipsoid (audit §1.2.2), so the
        // abstract Forma look — flat warm-grey ground, sky/atmosphere/globe-imagery
        // off — is strictly better and the user sees a legible massing scene, never
        // a blank/black globe. (Previously gated ALSO on !photogrammetryLoaded, which
        // left the broken photoreal path active whenever the dev token loaded tiles.)
        const defaultOn = !_cesiumToken;
        const wantForma = typeof flag === 'boolean' ? flag : defaultOn;
        if (wantForma) {
          console.log(
            `[gis][cesium] FORMA.2 mode ON at mount (` +
              `${typeof flag === 'boolean' ? 'window.__pryzmFormaMode' : 'default — no Cesium token → forcing Forma flat-ground'}).`
          );
          this.setFormaMode(true);
        } else {
          console.log('[gis][cesium] FORMA.2 mode available (token present) — call window.pryzmSetCesiumFormaMode(true) to enable.');
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

      // Debug listener + §A.21.D-GLOBE pan-driven context-building refresh.
      this.viewer.camera.moveEnd.addEventListener(() => {
        if (!this.viewer) return;
        const carto = this.viewer.camera.positionCartographic;

        console.log("CesiumViewport RUNTIME VERIFICATION:");
        console.log("LAT:", Cesium.Math.toDegrees(carto.latitude));
        console.log("LON:", Cesium.Math.toDegrees(carto.longitude));
        console.log("HEIGHT:", carto.height);

        this.maybeRefreshContextOnPan(
          Cesium.Math.toDegrees(carto.latitude),
          Cesium.Math.toDegrees(carto.longitude),
          carto.height,
        );
      });

      console.log("CesiumViewport: Viewer ready with Google Photorealistic 3D Tiles");

      console.log(
        `[gis][cesium] viewer created — container ${this.container.clientWidth}x${this.container.clientHeight}, ` +
        `forma=${this.formaMode}, globe.show=${this.viewer.scene.globe.show}.`
      );

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
    // §CESIUM-SITE-ORIGIN — fall back to the process-wide LTP-ENU origin set by the
    // onboarding location step (siteDispatch). It's set BEFORE Cesium mounts in the
    // GIS handoff, so the store-read above is null even though the real site is
    // known — without this, the camera framed the Sydney default (the founder's bug).
    const ltp = getCurrentSiteOrigin();
    if (ltp && (ltp.lat !== 0 || ltp.lon !== 0)) return { lat: ltp.lat, lon: ltp.lon };
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
        // §A.21.D-FORMA2 — stronger cast shadow for contrast (founder ask).
        // `darkness` = fraction of light remaining in shadow; lower = darker.
        sm.darkness = FORMA_SHADOW_DARKNESS;
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

    // MAP-DATA-OVERTURE / §GLOBE-CONTEXT-BUILDINGS (2026-06-05) — the extruded
    // OSM context-building overlay. WITH a real-tiles credential (Cesium token OR
    // Google Maps key, A.21.D31) the Google Photorealistic 3D Tiles already show
    // real 3D buildings, so the overlay is redundant → clear it. On the KEYLESS
    // path the ESRI satellite is FLAT (no 3D buildings), so the "3D globe" would
    // show "only a 2D map" — KEEP + (re)load the extruded overlay so the globe
    // still has 3D context buildings (founder-reported).
    try {
      if (_cesiumToken || _googleMapsKey) {
        this.contextBuildingsAbort?.abort();
        this.clearContextBuildings();
        this.contextBuildingsAt = null;
      } else {
        const loc = this.readSiteLocation();
        if (loc) void this.loadContextBuildings(loc.lat, loc.lon, true);
      }
    } catch (e) {
      console.warn('[CesiumViewport][forma] context-building restore handling failed:', e);
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
    /** Authored walls (the massing) in scene-XZ metres + authored height/thickness.
     *
     * §A.21.D24 — `baseElevation` (metres above the project floor plane) carries
     * the STOREY the wall belongs to (wall.baseLine.y + baseOffset). When present
     * and non-zero, the massing is extruded PER STOREY stacked at its true
     * elevation so a multi-storey house shows all floors + roof on the globe;
     * when absent/zero (single-storey + apartment) the behaviour is unchanged. */
    walls: ReadonlyArray<{
      a: { x: number; z: number };
      b: { x: number; z: number };
      height: number;
      thickness: number;
      /** Storey base elevation in metres (default 0 = ground floor). */
      baseElevation?: number;
      /** Owning level id (for the floor selector readout). */
      levelId?: string;
    }>;
    /**
     * §A.21.D25 — authored floor SLABS (scene-XZ outer ring + top elevation +
     * thickness). Rendered as a thin solid floor plate per storey so the
     * building reads as solid floor plates rather than open wall boxes. Optional
     * (older callers omit it → no floors, unchanged behaviour).
     */
    slabs?: ReadonlyArray<{
      ring: ReadonlyArray<{ x: number; z: number }>;
      /** Top of the slab in metres above the project floor plane. */
      topElevation: number;
      thickness: number;
      levelId?: string;
    }>;
    /**
     * §A.21.D25 — authored ROOFS (scene-XZ outer ring + base elevation +
     * thickness + pitch radians). Rendered as a capping solid at the top of the
     * building so it closes on top in the site view. Optional.
     */
    roofs?: ReadonlyArray<{
      ring: ReadonlyArray<{ x: number; z: number }>;
      /** Roof base (eave) elevation in metres. */
      baseElevation: number;
      thickness: number;
      /** Pitch in radians (0 = flat); used to raise a simple coarse ridge. */
      pitch: number;
      levelId?: string;
    }>;
    /**
     * §A.21.D25 — coarse FURNITURE boxes (scene-XZ origin + level elevation +
     * footprint size + height + rotation). Optional + already hard-capped by the
     * caller (FORMA_FURNITURE_CAP) so this never floods the globe with entities.
     */
    furniture?: ReadonlyArray<{
      origin: { x: number; z: number };
      baseElevation: number;
      width: number;
      depth: number;
      height: number;
      rotation: number;
    }>;
    /**
     * §A.21.D34(d) — WINDOW + DOOR openings rendered as coarse façade insets so
     * the building reads as having windows + a front door, not blank white. Each
     * is a thin recessed/darker panel on the wall plane spanning [a→b] along the
     * baseline, from (baseElevation + sill) up by `height`, recessed inward by a
     * fraction of `normal`·`thickness`. Optional (older callers omit → no insets).
     */
    openings?: ReadonlyArray<{
      kind: 'window' | 'door';
      a: { x: number; z: number };
      b: { x: number; z: number };
      /** Unit wall normal (scene-XZ). */
      normal: { x: number; z: number };
      thickness: number;
      /** Wall base (storey floor) elevation in metres. */
      baseElevation: number;
      sill: number;
      height: number;
    }>;
    /**
     * §A.21.D34(d) — STAIRS rendered as a coarse extruded volume (run × width
     * footprint, base elevation → base + rise) so the stairwell reads in the
     * massing. Optional.
     */
    stairs?: ReadonlyArray<{
      origin: { x: number; z: number };
      /** Run direction unit vector (scene-XZ). */
      dir: { x: number; z: number };
      run: number;
      width: number;
      baseElevation: number;
      rise: number;
    }>;
    /** When true, fly the camera to the framing preset after placing (§4.5). */
    frameCentroid?: boolean;
    /**
     * §A.21.D24 — floor-visibility filter. When provided, ONLY the storey bands
     * whose 0-based index is in this set are rendered (the floor selector's
     * per-floor / "show all" toggle). `null`/undefined = show ALL storeys.
     */
    visibleLevels?: ReadonlyArray<number> | null;
    /**
     * FORMA-PLAN-OBLIQUE — which camera preset to fly when `frameCentroid` is
     * true: 'oblique' = the NW 3D oblique (default), 'plan' = the near-top-down
     * plan-oblique (heading North, pitch −68°, shadows as the depth cue).
     */
    framePreset?: 'oblique' | 'plan';
    /**
     * Internal (FORMA.4) — when true, this call is the second pass AFTER a
     * terrain sample, so we must NOT kick off another async clamp (avoids an
     * infinite re-sample loop). External callers leave this unset.
     */
    _skipTerrainClamp?: boolean;
    /**
     * §A.21.D39#5 — PLACE-ON-PHOTOREAL-GLOBE. When true, the SAME authored massing
     * (shell prism, slabs, roof, openings, stairs, furniture, boundary) is placed
     * at the site ENU origin WITHOUT switching the scene into the Forma flat-ground
     * look — the photoreal imagery + Google 3D tiles + sky stay shown, so the
     * user's house sits inside the real-world city on the "3D globe" view. We only
     * turn shadows ON (so the building grounds itself on the tiles) and skip the
     * Forma-mode force. Default (unset/false) = the existing Forma massing study.
     */
    keepPhotoreal?: boolean;
  }): void {
    const viewer = this.viewer;
    if (!viewer) {
      console.warn('[CesiumViewport][forma] renderFormaMassing before mount — ignored.');
      return;
    }
    // §A.21.D39#5 — TWO canvases for the SAME massing:
    //   • default → the Forma flat-ground massing study (force Forma mode on).
    //   • keepPhotoreal → the PHOTOREAL "3D globe": keep the real imagery/tiles/sky
    //     so the house sits inside the real-world city; do NOT force Forma. We still
    //     need shadows ON (the photoreal path turns them off) so the building reads
    //     as a grounded 3D volume on the tiles.
    if (input.keepPhotoreal) {
      try {
        // Enable shadows so the placed building grounds itself on the tiles. We
        // KEEP Cesium's native SunLight (restored by restorePhotorealMode) so the
        // globe lighting + shadow direction stay authentic to the real sun — no
        // DirectionalLight override here (that's the Forma-study path).
        viewer.shadows = true;
        const sm = viewer.scene.shadowMap;
        if (sm) { sm.enabled = true; sm.softShadows = true; }
      } catch (e) {
        console.warn('[CesiumViewport][globe] shadow setup failed (non-fatal):', e);
      }
    } else if (!this.formaMode) {
      // Forma look is the canvas for the massing — make sure it's on.
      this.setFormaMode(true);
    }

    this.clearFormaMassing();

    // §A.21.D24 — remember the input so the floor selector can re-render the same
    // massing with a new visibility filter (setVisibleFormaLevels).
    this.formaLastMassingInput = input;

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

    // ── Proposed building massing (§A.21.D-FORMA — clean pastel solid) ─────────
    // Founder ref: clean pastel blocks, no glitching. The OLD path drew one white
    // extrusion PER WALL — N thin rectangles overlapping at every corner, their
    // coplanar top faces z-fighting, reading as a jumble rather than a solid mass.
    // We now extrude ONE solid from the building FOOTPRINT (the drawn boundary ≈
    // the apartment outline), coloured by use, with the base buried below ground so
    // its bottom face never z-fights the ground plane. Falls back to per-wall
    // extrusions only when there is no footprint polygon.
    //
    // §A.21.D24 (multi-floor on the globe) — the OLD path flattened EVERY storey
    // onto a single ground-floor block: it took `max(wall.height)` and extruded
    // the footprint from the ground to that one height, ignoring each wall's
    // `baseElevation` (the storey it lives on). So a 2-storey house + roof showed
    // only the ground floor. We now GROUP walls into STOREY BANDS by their base
    // elevation and extrude ONE solid per band, stacked at its true elevation —
    // so all floors (and a roof level, if its walls/parapet are authored) appear
    // on the globe. Single-storey + apartment models have every wall at
    // baseElevation 0 → exactly one band → identical to the old behaviour.
    void FORMA_USE_COLOURS; void ('residential' as FormaUse);
    const massFill = Cesium.Color.fromCssColorString(FORMA_PALETTE.proposedFill); // #FFFFFF, alpha 1
    const massOutline = Cesium.Color.fromCssColorString(FORMA_PALETTE.silhouette);
    const footprint = boundary && boundary.length >= 3 ? boundary : null;

    // Group walls into storey bands keyed by their (rounded) base elevation. Each
    // band's height = the tallest wall on that storey. Bands are sorted from the
    // ground up so the band index doubles as the floor number for the selector.
    const bands = this.groupWallsIntoStoreyBands(walls);
    // Publish the storey list so the floor selector (GISAreaLayout) can build its
    // toggle from the REAL storeys present, and remember the active filter.
    this.formaStoreyBands = bands.map((b, i) => ({
      index: i,
      baseElevation: b.baseElevation,
      heightM: b.heightM,
      levelId: b.levelId,
      wallCount: b.walls.length,
    }));
    const visible = input.visibleLevels ?? this.formaVisibleLevels;
    this.formaVisibleLevels = visible ?? null;
    const isBandVisible = (i: number): boolean => !visible || visible.includes(i);

    for (let bi = 0; bi < bands.length; bi++) {
      if (!isBandVisible(bi)) continue;
      const band = bands[bi]!;
      // The storey's vertical span: bottom seated at ground+elevation (buried by
      // FORMA_BASE_SINK_M on the ground floor only so it never z-fights the ground;
      // upper storeys butt onto the storey below with a tiny overlap to avoid a
      // visible seam), top = bottom + storey height.
      const bandBottom = baseHeight + band.baseElevation - (bi === 0 ? FORMA_BASE_SINK_M : 0.02);
      const bandTop = baseHeight + band.baseElevation + Math.max(0.1, band.heightM);

      if (footprint) {
        // All storeys of a house/apartment share the drawn outline footprint.
        try {
          const positions = footprint.map((p) => toCartesian(p.x, p.z, bandBottom));
          const ent = viewer.entities.add({
            name: `pryzm-forma-massing-storey-${bi}`,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(positions),
              height: bandBottom,
              extrudedHeight: bandTop,
              material: massFill,
              outline: true,
              outlineColor: massOutline,
              outlineWidth: 1.5,
              shadows: Cesium.ShadowMode.ENABLED,
              perPositionHeight: false,
              closeTop: true,
              closeBottom: true,
            },
          });
          this.formaMassingEntities.push(ent);
          silhouetteTargets.push(ent);
        } catch (e) {
          console.warn(`[CesiumViewport][forma] storey ${bi} footprint mass failed — per-wall fallback:`, e);
        }
      }

      if (!footprint) {
        // §A.21.D30 — no drawn outline → reconstruct THIS storey's EXTERIOR
        // PERIMETER RING from its shell walls and extrude it as ONE watertight
        // closed prism. A single polygon has NO corner gaps/overlaps by
        // construction, so a from-scratch house reads as a clean solid massing
        // block on the globe (matching the Forma "massing study" aesthetic and
        // the BIM-view mitred corners). The per-wall boxes are kept ONLY as the
        // fallback when the ring can't be reconstructed (non-closed / degenerate
        // wall set) — never throw, never render nothing.
        const ring = this.reconstructPerimeterRing(band.walls);
        if (ring && ring.length >= 3) {
          try {
            const positions = ring.map((p) => toCartesian(p.x, p.z, bandBottom));
            const ent = viewer.entities.add({
              name: `pryzm-forma-massing-shell-storey-${bi}`,
              polygon: {
                hierarchy: new Cesium.PolygonHierarchy(positions),
                height: bandBottom,
                extrudedHeight: bandTop,
                material: massFill,
                outline: true,
                outlineColor: massOutline,
                outlineWidth: 1.5,
                shadows: Cesium.ShadowMode.ENABLED,
                perPositionHeight: false,
                closeTop: true,
                closeBottom: true,
              },
            });
            this.formaMassingEntities.push(ent);
            silhouetteTargets.push(ent);
            console.log(`[CesiumViewport][forma] storey ${bi}: shell extruded as a single ${ring.length}-vertex perimeter prism (no corner gaps).`);
          } catch (e) {
            console.warn(`[CesiumViewport][forma] storey ${bi} perimeter prism failed — per-wall fallback:`, e);
            this.extrudeWallsAsBoxes(band.walls, bandBottom, baseHeight + band.baseElevation, bi, viewer, toCartesian, massFill, massOutline, silhouetteTargets);
          }
        } else {
          // Ring not reconstructable (open / degenerate shell) → per-wall boxes.
          console.log(`[CesiumViewport][forma] storey ${bi}: perimeter ring unavailable — falling back to per-wall boxes.`);
          this.extrudeWallsAsBoxes(band.walls, bandBottom, baseHeight + band.baseElevation, bi, viewer, toCartesian, massFill, massOutline, silhouetteTargets);
        }
      }
    }

    // ── §A.21.D25 — floors/slabs + roof + coarse furniture ────────────────────
    // The wall bands above give the building its WALLS; these give it solidity
    // (floor plates), a closed top (roof), and an optional coarse furniture read,
    // so the globe shows a real building, not floating wall blocks. All reuse the
    // SAME ENU frame + base-height + Forma palette as the walls, and all entities
    // go into `formaMassingEntities` (cleared on every re-render). Each is
    // visibility-filtered against the SAME storey bands as the walls, so the
    // Floors selector hides their floors too. Each block is guarded — a bad ring
    // logs + skips, never crashes the placement.

    // Map an elevation to the storey-band index it belongs to (so the floor
    // selector hides slabs/roofs/furniture on hidden storeys). Falls back to the
    // nearest band; if no bands, treat as visible.
    const bandIndexForElevation = (elev: number): number => {
      if (bands.length === 0) return 0;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < bands.length; i++) {
        const d = Math.abs(bands[i]!.baseElevation - elev);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    };

    // Slabs/floors — a thin solid plate per slab at its top elevation. Buried
    // FORMA_BASE_SINK_M only when at ground (elevation ≈ 0) so it never z-fights
    // the ground plane; upper plates sit at their true height.
    const slabs = input.slabs ?? [];
    let slabsPlaced = 0;
    for (const s of slabs) {
      if (!s.ring || s.ring.length < 3) continue;
      const top = baseHeight + s.topElevation - (Math.abs(s.topElevation) < 0.5 ? FORMA_BASE_SINK_M : 0);
      const bottom = top - Math.max(0.05, s.thickness);
      // Hide with the storey it sits on (the slab tops the storey BELOW it; use
      // its own elevation for the band lookup — good enough for the selector).
      if (!isBandVisible(bandIndexForElevation(s.topElevation))) continue;
      try {
        const positions = s.ring.map((p) => toCartesian(p.x, p.z, bottom));
        const ent = viewer.entities.add({
          name: 'pryzm-forma-slab',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: bottom,
            extrudedHeight: top,
            material: massFill,
            outline: true,
            outlineColor: massOutline,
            outlineWidth: 1.0,
            shadows: Cesium.ShadowMode.ENABLED,
            perPositionHeight: false,
            closeTop: true,
            closeBottom: true,
          },
        });
        this.formaMassingEntities.push(ent);
        silhouetteTargets.push(ent);
        slabsPlaced++;
      } catch (e) {
        console.warn('[CesiumViewport][forma] slab plate failed — skipped:', e);
      }
    }

    // Roof — a capping solid at the top of the building. Flat roofs cap as a thin
    // slab; pitched roofs raise a coarse ridge prism so the building closes on
    // top + reads as pitched. (Coarse by design — this is a massing study.)
    const roofs = input.roofs ?? [];
    let roofsPlaced = 0;
    for (const r of roofs) {
      if (!r.ring || r.ring.length < 3) continue;
      if (!isBandVisible(bandIndexForElevation(r.baseElevation))) continue;
      const eave = baseHeight + r.baseElevation;
      try {
        if (r.pitch > 0.01) {
          // Coarse pitched cap: raise a centre "ridge fan" — triangles from each
          // boundary edge up to the footprint centroid, lifted by the rise. This
          // gives a hip-like solid mass without a full roof-geometry build (the
          // exact pitched form lives in the BIM view; the globe is a massing read).
          const c = this.polygonCentroidAndAreaXZ(r.ring);
          // ENU centroid → scene-XZ: east = x, north = -z  ⇒  x = east, z = -north.
          const cx = c.east;
          const cz = -c.north;
          // Rise ≈ half the shorter footprint extent × tan(pitch), clamped sane.
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
          for (const p of r.ring) {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
          }
          const halfSpan = Math.max(0.5, Math.min(maxX - minX, maxZ - minZ) / 2);
          const rise = Math.min(6, Math.max(0.3, halfSpan * Math.tan(r.pitch)));
          const apex = toCartesian(cx, cz, eave + rise);
          // One triangular wedge per boundary edge (edge at eave → apex).
          for (let i = 0; i < r.ring.length; i++) {
            const a = r.ring[i]!;
            const b = r.ring[(i + 1) % r.ring.length]!;
            const tri = [toCartesian(a.x, a.z, eave), toCartesian(b.x, b.z, eave), apex];
            const ent = viewer.entities.add({
              name: 'pryzm-forma-roof-face',
              polygon: {
                hierarchy: new Cesium.PolygonHierarchy(tri),
                perPositionHeight: true,
                material: massFill,
                outline: true,
                outlineColor: massOutline,
                outlineWidth: 1.0,
                shadows: Cesium.ShadowMode.ENABLED,
              },
            });
            this.formaMassingEntities.push(ent);
            silhouetteTargets.push(ent);
          }
          roofsPlaced++;
        } else {
          // Flat roof → a thin capping slab at the eave elevation.
          const positions = r.ring.map((p) => toCartesian(p.x, p.z, eave));
          const ent = viewer.entities.add({
            name: 'pryzm-forma-roof-flat',
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(positions),
              height: eave,
              extrudedHeight: eave + Math.max(0.1, r.thickness),
              material: massFill,
              outline: true,
              outlineColor: massOutline,
              outlineWidth: 1.0,
              shadows: Cesium.ShadowMode.ENABLED,
              perPositionHeight: false,
              closeTop: true,
              closeBottom: true,
            },
          });
          this.formaMassingEntities.push(ent);
          silhouetteTargets.push(ent);
          roofsPlaced++;
        }
      } catch (e) {
        console.warn('[CesiumViewport][forma] roof cap failed — skipped:', e);
      }
    }

    // Furniture — coarse boxes (already capped by the caller). A rotated
    // rectangle footprint extruded to the item height. Subtle so it reads as
    // contents, not massing: uses the context fill so it doesn't compete with the
    // white building mass.
    const furniture = input.furniture ?? [];
    const furnitureFill = Cesium.Color.fromCssColorString(FORMA_PALETTE.contextFill).withAlpha(0.9);
    let furniturePlaced = 0;
    for (const f of furniture) {
      if (!isBandVisible(bandIndexForElevation(f.baseElevation))) continue;
      const hw = Math.max(0.05, f.width) / 2;
      const hd = Math.max(0.05, f.depth) / 2;
      const cos = Math.cos(f.rotation);
      const sin = Math.sin(f.rotation);
      // Local rect corners (CCW) rotated about Y then offset to the origin.
      const corners: Array<{ x: number; z: number }> = [
        { x: -hw, z: -hd }, { x: hw, z: -hd }, { x: hw, z: hd }, { x: -hw, z: hd },
      ].map((p) => ({
        x: f.origin.x + p.x * cos - p.z * sin,
        z: f.origin.z + p.x * sin + p.z * cos,
      }));
      const bottom = baseHeight + f.baseElevation;
      try {
        const positions = corners.map((p) => toCartesian(p.x, p.z, bottom));
        const ent = viewer.entities.add({
          name: 'pryzm-forma-furniture',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: bottom,
            extrudedHeight: bottom + Math.max(0.1, f.height),
            material: furnitureFill,
            outline: false,
            shadows: Cesium.ShadowMode.ENABLED,
            perPositionHeight: false,
            closeTop: true,
            closeBottom: true,
          },
        });
        this.formaMassingEntities.push(ent);
        furniturePlaced++;
      } catch (e) {
        console.warn('[CesiumViewport][forma] furniture box failed — skipped:', e);
      }
    }
    if (slabs.length || roofs.length || furniture.length) {
      console.log(
        `[CesiumViewport][forma] extras placed: ${slabsPlaced}/${slabs.length} slab(s), ` +
          `${roofsPlaced}/${roofs.length} roof(s), ${furniturePlaced}/${furniture.length} furniture box(es).`
      );
    }

    // ── §A.21.D34(d) — WINDOW + DOOR façade insets ────────────────────────────
    // §A.21.D36 — WHY THE INSETS WERE INVISIBLE: the panel was placed at the wall
    // BASELINE (centreline) and nudged INWARD along the normal. But the D30 shell
    // is ONE opaque (#FFFFFF, alpha 1) extruded prism over the building footprint
    // / reconstructed exterior ring — so a panel at the centreline pushed *into*
    // the wall sat fully BEHIND the opaque prism face and was never drawn. FIX:
    // push the panel PROUD of (in front of) the exterior face — out along the
    // OUTWARD normal by thickness/2 (to reach the exterior face) + a small proud
    // gap — so it floats just in front of the white shell and is visible. The
    // reader's `normal` is an arbitrary perpendicular (could point either way), so
    // we orient it OUTWARD = away from the building centroid before pushing.
    const openings = input.openings ?? [];
    // §A.21.D39#6 — TRANSLUCENT blue-tinted GLASS (alpha FORMA_GLAZING_ALPHA) so
    // windows read as see-through glazing, not opaque insets. Doors stay opaque.
    const glazingFill = Cesium.Color.fromCssColorString(FORMA_PALETTE.glazing).withAlpha(FORMA_GLAZING_ALPHA);
    const doorFill = Cesium.Color.fromCssColorString(FORMA_PALETTE.doorLeaf).withAlpha(1.0);
    let openingsPlaced = 0;
    // Building centroid in scene-XZ — used to flip each opening's normal so it
    // points OUTWARD (away from the centre). Prefer the drawn footprint centroid;
    // else the XZ bounding-box centre of the authored walls. Falls back to the
    // origin (0,0) when neither is available (a single wall still reads fine).
    let cenX = 0, cenZ = 0;
    if (footprint && footprint.length >= 3) {
      let sx = 0, sz = 0;
      for (const p of footprint) { sx += p.x; sz += p.z; }
      cenX = sx / footprint.length; cenZ = sz / footprint.length;
    } else if (walls.length) {
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (const w of walls) {
        minX = Math.min(minX, w.a.x, w.b.x); maxX = Math.max(maxX, w.a.x, w.b.x);
        minZ = Math.min(minZ, w.a.z, w.b.z); maxZ = Math.max(maxZ, w.a.z, w.b.z);
      }
      if (Number.isFinite(minX)) { cenX = (minX + maxX) / 2; cenZ = (minZ + maxZ) / 2; }
    }
    for (const o of openings) {
      if (!isBandVisible(bandIndexForElevation(o.baseElevation))) continue;
      // Orient the wall normal OUTWARD (away from the building centroid). Midpoint
      // of the opening → centroid vector; if the normal points toward the centre,
      // flip it so the panel is pushed to the OUTSIDE face of the shell.
      let nx = o.normal.x, nz = o.normal.z;
      const nlen = Math.hypot(nx, nz) || 1;
      nx /= nlen; nz /= nlen;
      const mx = (o.a.x + o.b.x) / 2, mz = (o.a.z + o.b.z) / 2;
      // Outward = direction from centroid to the opening midpoint.
      if (nx * (mx - cenX) + nz * (mz - cenZ) < 0) { nx = -nx; nz = -nz; }
      // Push the panel PROUD of the exterior face: out by half the wall thickness
      // (reach the outer face) + a small proud gap so it floats just in front of
      // the opaque shell prism and is never occluded (and never z-fights it).
      const proud = Math.max(0.04, o.thickness * 0.5) + 0.05;
      const ox = nx * proud;
      const oz = nz * proud;
      const aIn = { x: o.a.x + ox, z: o.a.z + oz };
      const bIn = { x: o.b.x + ox, z: o.b.z + oz };
      const bottom = baseHeight + o.baseElevation + Math.max(0, o.sill);
      const top = bottom + Math.max(0.2, o.height);
      try {
        // Vertical quad (perPositionHeight): the two baseline points at bottom +
        // the same two at top → a flat panel standing in the wall plane.
        const positions = [
          toCartesian(aIn.x, aIn.z, bottom),
          toCartesian(bIn.x, bIn.z, bottom),
          toCartesian(bIn.x, bIn.z, top),
          toCartesian(aIn.x, aIn.z, top),
        ];
        const ent = viewer.entities.add({
          name: o.kind === 'door' ? 'pryzm-forma-door' : 'pryzm-forma-window',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            perPositionHeight: true,
            material: o.kind === 'door' ? doorFill : glazingFill,
            outline: true,
            outlineColor: massOutline,
            outlineWidth: 1.0,
            // §A.21.D39#6 — SHADOW-THROUGH-GLASS. The window glazing is translucent,
            // so it must NOT cast a solid shadow — the sun-path pass casts THROUGH it
            // (ShadowMode.DISABLED). The opaque door leaf CASTS (the frame can), and
            // the white shell already casts the building's own shadow either way.
            shadows: o.kind === 'door' ? Cesium.ShadowMode.CAST_ONLY : Cesium.ShadowMode.DISABLED,
          },
        });
        this.formaMassingEntities.push(ent);
        openingsPlaced++;
      } catch (e) {
        console.warn('[CesiumViewport][forma] opening inset failed — skipped:', e);
      }
    }

    // ── §A.21.D34(d) — STAIRS as coarse extruded volumes ──────────────────────
    // A simple block over the stair footprint (run × width), extruded from the
    // base elevation up by the total rise, so the stairwell reads in the massing.
    // (The true stepped form lives in the BIM view; the globe is a massing read.)
    // Footprint corners: from `origin` along `dir` for `run`, widened by `width`
    // along the perpendicular. Visibility-filtered by storey band; guarded.
    const stairs = input.stairs ?? [];
    const stairFill = Cesium.Color.fromCssColorString(FORMA_PALETTE.stair).withAlpha(0.95);
    let stairsPlaced = 0;
    for (const s of stairs) {
      if (!isBandVisible(bandIndexForElevation(s.baseElevation))) continue;
      // Perpendicular (in XZ) to the run direction → half-width offsets.
      const px = -s.dir.z, pz = s.dir.x;
      const hw = Math.max(0.25, s.width) / 2;
      const run = Math.max(0.5, s.run);
      const ex = s.origin.x + s.dir.x * run;
      const ez = s.origin.z + s.dir.z * run;
      // Footprint rectangle (CCW): origin±half-width → end±half-width.
      const corners: Array<{ x: number; z: number }> = [
        { x: s.origin.x + px * hw, z: s.origin.z + pz * hw },
        { x: s.origin.x - px * hw, z: s.origin.z - pz * hw },
        { x: ex - px * hw, z: ez - pz * hw },
        { x: ex + px * hw, z: ez + pz * hw },
      ];
      const bottom = baseHeight + s.baseElevation - 0.02; // tiny sink: no floor z-fight.
      const top = bottom + Math.max(0.3, s.rise);
      try {
        const positions = corners.map((p) => toCartesian(p.x, p.z, bottom));
        const ent = viewer.entities.add({
          name: 'pryzm-forma-stair',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: bottom,
            extrudedHeight: top,
            material: stairFill,
            outline: true,
            outlineColor: massOutline,
            outlineWidth: 1.0,
            shadows: Cesium.ShadowMode.ENABLED,
            perPositionHeight: false,
            closeTop: true,
            closeBottom: true,
          },
        });
        this.formaMassingEntities.push(ent);
        silhouetteTargets.push(ent);
        stairsPlaced++;
      } catch (e) {
        console.warn('[CesiumViewport][forma] stair volume failed — skipped:', e);
      }
    }
    if (openings.length || stairs.length) {
      console.log(
        `[CesiumViewport][forma] detail placed: ${openingsPlaced}/${openings.length} opening inset(s) ` +
          `(windows + doors), ${stairsPlaced}/${stairs.length} stair volume(s).`
      );
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

    // FIX A.21.D28#2 — `area ≈ 0 m²`. The footprint area + centroid were computed
    // ONLY from the parcel boundary; a house generated from scratch (no drawn
    // parcel) left `areaM2 = 0` and `centroidEast/North = 0`, which (a) logged the
    // wrong footprint and (b) framed the camera + scaled the overlay radius off the
    // site origin instead of the building. When there is no usable boundary area,
    // derive the footprint from the authored geometry's XZ bounding box (walls,
    // else slab rings) — the SAME scene-XZ data the massing already renders.
    if (areaM2 <= 0) {
      const bbox = this.footprintBBoxXZ(walls, slabs);
      if (bbox) {
        centroidEast = bbox.east;
        centroidNorth = bbox.north;
        areaM2 = bbox.area;
      }
    }

    // Feed the proposed-building entities into the FORMA.2 silhouette stage (§3).
    this.setFormaSilhouetteTargets(silhouetteTargets);

    this.formaMassingOrigin = { lat: originLat, lon: originLon, centroidEast, centroidNorth, areaM2 };

    if (input.frameCentroid) {
      if (input.framePreset === 'plan') this.flyToFormaPlan();
      else this.flyToFormaSite();
    }

    // A.21.D24 — re-draw any active 3D climate overlays so the sun-path/wind/heat
    // layers track the new origin + terrain base after a (re)placement.
    this.refreshActiveClimateOverlays();

    viewer.scene.requestRender();
    const visibleCount = this.formaStoreyBands.filter((_, i) => isBandVisible(i)).length;
    console.log(
      `[CesiumViewport][forma] massing rendered: ${walls.length} wall(s) across ` +
        `${this.formaStoreyBands.length} storey(s) [` +
        this.formaStoreyBands
          .map((b) => `#${b.index}@${b.baseElevation.toFixed(1)}m·${b.heightM.toFixed(1)}m`)
          .join(', ') +
        `] — ${visibleCount} shown` +
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
   *
   * FORMA-PLAN-OBLIQUE — accepts an optional heading/pitch override so the same
   * centroid-framing + √areaM2-altitude logic drives BOTH the NW "3D" oblique
   * (the default) and the near-top-down "Plan" preset (`flyToFormaPlan`). Only
   * the camera angle differs; the Forma look, shadows, context + massing are
   * shared.
   */
  public flyToFormaSite(orientationOverride?: { headingDeg: number; pitchDeg: number }): void {
    const viewer = this.viewer;
    const o = this.formaMassingOrigin;
    if (!viewer || !o) {
      console.warn('[CesiumViewport][forma] flyToFormaSite: no massing placed yet — ignored.');
      return;
    }
    const headingDeg = orientationOverride?.headingDeg ?? FORMA_FLY_HEADING_DEG;
    const pitchDeg = orientationOverride?.pitchDeg ?? FORMA_FLY_PITCH_DEG;
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
          heading: Cesium.Math.toRadians(headingDeg),
          pitch: Cesium.Math.toRadians(pitchDeg),
          roll: 0,
        },
        duration: FORMA_FLY_DURATION_S,
      });
      viewer.scene.requestRender();
      console.log(
        `[CesiumViewport][forma] oblique flyTo: heading ${headingDeg}°, ` +
          `pitch ${pitchDeg}°, alt ${Math.round(alt)} m.`
      );
    } catch (e) {
      console.warn('[CesiumViewport][forma] flyToFormaSite failed:', e);
    }
  }

  /**
   * FORMA-PLAN-OBLIQUE — fly the camera to the near-top-down "Plan" preset
   * (heading North 0°, pitch −68°) centred on the same boundary centroid, with
   * the same √areaM2 altitude framing as the 3D oblique. This is the Autodesk-
   * Forma signature "plan view": white massing + OSM context + soft directional
   * shadows read from a near-overhead-but-tilted angle (the shadows ARE the
   * depth cue). The Forma render mode, context buildings + shadows stay engaged;
   * ONLY the camera angle differs from `flyToFormaSite()`. No-op until
   * `renderFormaMassing` has set the origin.
   */
  public flyToFormaPlan(): void {
    this.flyToFormaSite({ headingDeg: FORMA_PLAN_HEADING_DEG, pitchDeg: FORMA_PLAN_PITCH_DEG });
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
    // §A.21.D-FORMA — bury the bottom face below ground so it never z-fights the
    // flat ground plane (same fix as the proposed massing).
    const base = this.formaTerrainBaseHeight - FORMA_BASE_SINK_M;
    const top = this.formaTerrainBaseHeight;
    // §A.21.D-FORMA2 — fully OPAQUE context (was 0.92) so nothing in the Forma
    // scene reads as transparent; the white proposed mass still stands out against
    // the muted off-white context.
    const fill = Cesium.Color.fromCssColorString(FORMA_PALETTE.contextFill);
    const outline = Cesium.Color.fromCssColorString(FORMA_PALETTE.contextOutline).withAlpha(0.6);

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
            // Top preserved above ground: terrain base + the footprint's height.
            extrudedHeight: top + Math.max(0.1, h),
            material: fill,
            outline: true,
            outlineColor: outline,
            outlineWidth: 1,
            // ShadowMode.ENABLED == casts AND receives (Forma context shadows).
            shadows: Cesium.ShadowMode.ENABLED,
            perPositionHeight: false,
            closeBottom: true,
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

  /**
   * §A.21.D-GLOBE (2026-06-05) — refresh context buildings as the camera PANS so
   * they don't render only in one fixed square around the site origin and then
   * vanish when the user moves (founder-reported "buildings stop showing as I move").
   *
   * Gated to avoid hammering Overpass:
   *   • only when context buildings are already an active layer for this view;
   *   • only below ~6 km camera height (above that the fixed bbox is meaningless
   *     and the user is looking at the whole city, not the massing);
   *   • only once the camera ground point has moved >~450 m from the last load
   *     centre (roughly a third of the fetch bbox);
   *   • debounced 600 ms so a flurry of moves coalesces into ONE fetch.
   * loadContextBuildings() itself aborts any in-flight fetch and clears the old
   * entities, so repeated pans never leak or stack footprints.
   */
  private maybeRefreshContextOnPan(camLat: number, camLon: number, camHeight: number): void {
    // Feature inactive for this view (no buildings ever loaded) → do nothing.
    if (!this.contextBuildingsAt && this.contextBuildingEntities.length === 0) return;
    if (!Number.isFinite(camLat) || !Number.isFinite(camLon)) return;
    if (!Number.isFinite(camHeight) || camHeight > 6000) return;

    const at = this.contextBuildingsAt;
    if (at) {
      // Cheap planar degree distance → metres (lat ≈ 111 km/deg; lon scaled by cos).
      const dLatM = (camLat - at.lat) * 111_320;
      const dLonM = (camLon - at.lon) * 111_320 * Math.cos((camLat * Math.PI) / 180);
      const movedM = Math.hypot(dLatM, dLonM);
      if (movedM < 450) return; // still inside the loaded footprint — keep it.
    }

    if (this.contextPanRefreshTimer !== null) clearTimeout(this.contextPanRefreshTimer);
    this.contextPanRefreshTimer = setTimeout(() => {
      this.contextPanRefreshTimer = null;
      if (!this.viewer) return;
      console.log(
        `[CesiumViewport][forma] §A.21.D-GLOBE pan-refresh — reloading context buildings ` +
          `around LAT ${camLat.toFixed(5)} LON ${camLon.toFixed(5)} (camera moved out of the loaded area).`,
      );
      void this.loadContextBuildings(camLat, camLon, true);
    }, 600);
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

  // ── A.21.D24 — 3D climate-analysis overlays (sun-path · wind · heat) ────────
  //
  // These are toggleable READ-ONLY analysis layers over the existing Forma site
  // view. They reuse the SAME single `eastNorthUpToFixedFrame` anchor at the
  // site origin as the massing + context buildings (no parallel projector —
  // SPEC-FORMA-SITE-VIEW §4 / §8.3). All geometry comes from the PURE
  // `climateOverlayGeometry` generators (sun arcs from the tested `solarSample`;
  // wind streaks from the `buildWindRose` aggregate). Every method is fully
  // guarded + idempotent; a missing viewer / origin / dataset degrades to a
  // quiet no-op (never throws, never blocks the view). #6600FF accent for the
  // PRYZM chrome cues; the sun arc uses a warm sun colour.

  /** Supply the ClimateDataset the wind/heat overlays read. Called by the
   *  analysis controls whenever the dataset lands / changes. Re-renders any
   *  active wind/heat layer with the new data. */
  public setClimateOverlayDataset(ds: import('@pryzm/schemas').ClimateDataset | null): void {
    this.climateOverlayDataset = ds;
    if (this.climateOverlayOn.wind) this.renderWindOverlay();
    if (this.climateOverlayOn.heat) this.renderHeatOverlay();
  }

  /** Toggle the 3D sun-path arc overlay (summer/equinox/winter dome arcs). */
  public setSunPathOverlay(on: boolean): void {
    this.climateOverlayOn.sunPath = on;
    if (on) this.renderSunPathOverlay();
    else this.clearOverlayLayer('sunPath');
  }

  /** Toggle the 3D wind overlay (directional streaks sized by wind frequency). */
  public setWindOverlay(on: boolean): void {
    this.climateOverlayOn.wind = on;
    if (on) this.renderWindOverlay();
    else this.clearOverlayLayer('wind');
  }

  /** Toggle the ground heat-tint overlay (warm↔cool disc from monthly temps). */
  public setHeatOverlay(on: boolean): void {
    this.climateOverlayOn.heat = on;
    if (on) this.renderHeatOverlay();
    else this.clearOverlayLayer('heat');
  }

  /** The site origin (= ENU anchor) the overlays place against, or null. Prefers
   *  the massing origin (the plot the user is looking at), else the site location. */
  private overlayOrigin(): { lat: number; lon: number } | null {
    if (this.formaMassingOrigin) {
      return { lat: this.formaMassingOrigin.lat, lon: this.formaMassingOrigin.lon };
    }
    return this.readSiteLocation();
  }

  /** A sensible dome/ring radius (m) for the overlays — scaled to the plot so the
   *  arcs/streaks frame the massing rather than dwarfing or vanishing into it. */
  private overlayRadiusM(): number {
    const area = this.formaMassingOrigin?.areaM2 ?? 0;
    const fromArea = area > 0 ? 1.6 * Math.sqrt(area) : 0;
    return Math.max(40, Math.min(400, fromArea || 80));
  }

  /** A circular proxy of the building MASS the wind streamlines bend around and
   *  the heat field shades behind: centre = the massing centroid (in the overlay
   *  ENU frame, which is anchored at `overlayOrigin()`), radius derived from the
   *  footprint area. Returns null when there's no massing to read (→ a clean,
   *  obstacle-free field). A.21.D35. */
  private overlayObstacle(): { center: { east: number; north: number }; radius: number } | null {
    const o = this.formaMassingOrigin;
    if (!o || !(o.areaM2 > 0)) return null;
    // Equivalent-circle radius of the footprint, gently inflated so streamlines
    // read as flowing AROUND the visible mass rather than clipping its edge.
    const radius = Math.max(6, 1.15 * Math.sqrt(o.areaM2 / Math.PI));
    return { center: { east: o.centroidEast, north: o.centroidNorth }, radius };
  }

  /** The compass bearing (deg, 0 = N) the sun is in — the "hot side" of the
   *  comfort field. Uses the tested NOAA `solarSample` at the current Forma sun
   *  date/time; falls back to South (180°) when the sun is below the horizon (so
   *  the field still reads sensibly in the N-hemisphere convention). A.21.D35. */
  private heatSunBearingDeg(lat: number, lon: number): number {
    try {
      const s = solarSample(lat, lon, this.formaSunDate.toISOString());
      if (s.isAboveHorizon) {
        const deg = (s.azimuthRad * 180) / Math.PI;
        return ((deg % 360) + 360) % 360;
      }
    } catch { /* fall through to the default */ }
    return 180;
  }

  /** ENU(east,north,up) metres → ECEF Cartesian via the site-origin anchor. */
  private enuToCartesian(
    enuMatrix: Cesium.Matrix4,
    east: number,
    north: number,
    up: number,
  ): Cesium.Cartesian3 {
    return Cesium.Matrix4.multiplyByPoint(
      enuMatrix,
      new Cesium.Cartesian3(east, north, up),
      new Cesium.Cartesian3(),
    );
  }

  private renderSunPathOverlay(): void {
    const viewer = this.viewer;
    const origin = this.overlayOrigin();
    this.clearOverlayLayer('sunPath');
    if (!viewer || !origin) return;
    try {
      const radius = this.overlayRadiusM();
      const base = this.formaTerrainBaseHeight;
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
        Cesium.Cartesian3.fromDegrees(origin.lon, origin.lat, 0),
      );
      const year = this.formaSunDate.getUTCFullYear();
      const arcs = sunArcEnuPoints(origin.lat, origin.lon, year, radius);
      // Per-arc colour: summer = warm gold, equinox = #6600FF accent, winter = cool.
      const arcColors = ['#F4B23E', '#6600FF', '#7FB3E0'];
      arcs.forEach((arc, i) => {
        if (arc.points.length < 2) return;
        const positions = arc.points.map((p) => this.enuToCartesian(enu, p.east, p.north, base + p.up));
        const arcColor = Cesium.Color.fromCssColorString(arcColors[i] ?? '#F4B23E').withAlpha(0.95);
        const ent = viewer.entities.add({
          name: `pryzm-climate-sunpath-${arc.label}`,
          polyline: {
            positions,
            width: 3,
            clampToGround: false,
            // FIX A.21.D28#4 — in Forma mode `globe.depthTestAgainstTerrain = true`,
            // so unclamped polylines whose points sit near the ground (the arc
            // ends at the horizon) were occluded/clipped by the globe → the
            // overlay was created (logged) but invisible. ARC_TYPE.NONE connects
            // the explicit Cartesians with straight segments (not geodesics), and
            // a `depthFailMaterial` draws the parts that fail the depth test so the
            // whole arc is always visible over the massing + ground.
            arcType: Cesium.ArcType.NONE,
            material: arcColor,
            depthFailMaterial: new Cesium.PolylineOutlineMaterialProperty({
              color: arcColor,
              outlineWidth: 0,
            }),
          },
        });
        this.climateOverlayEntities.sunPath.push(ent);
      });
      // Whole-hour markers on the summer arc (small gold dots + "9h" labels).
      const markers = sunArcHourMarkers(origin.lat, origin.lon, year, radius);
      for (const m of markers) {
        const pos = this.enuToCartesian(enu, m.point.east, m.point.north, base + m.point.up);
        const ent = viewer.entities.add({
          name: `pryzm-climate-sunhour-${m.hourUtc}`,
          position: pos,
          point: {
            pixelSize: 6,
            color: Cesium.Color.fromCssColorString('#F4B23E'),
            outlineColor: Cesium.Color.fromCssColorString('#6600FF'),
            outlineWidth: 1,
            // FIX A.21.D28#4 — never depth-test the hour dots against the globe
            // (Forma mode enables terrain depth test); otherwise low-altitude
            // markers vanish behind the ground.
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: `${m.hourUtc}h`,
            font: '600 11px system-ui',
            fillColor: Cesium.Color.fromCssColorString('#3a3357'),
            showBackground: true,
            backgroundColor: Cesium.Color.WHITE.withAlpha(0.7),
            style: Cesium.LabelStyle.FILL,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -8),
            scaleByDistance: new Cesium.NearFarScalar(100, 1.0, 2000, 0.4),
            // FIX A.21.D28#4 — keep the labels visible over the globe too.
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
        this.climateOverlayEntities.sunPath.push(ent);
      }
      viewer.scene.requestRender();
      console.log(`[CesiumViewport][climate] sun-path overlay: ${arcs.length} arc(s) + ${markers.length} hour marker(s), radius ${radius.toFixed(0)} m.`);
    } catch (e) {
      console.warn('[CesiumViewport][climate] sun-path overlay failed:', e);
    }
  }

  private renderWindOverlay(): void {
    const viewer = this.viewer;
    const origin = this.overlayOrigin();
    const ds = this.climateOverlayDataset;
    this.clearOverlayLayer('wind');
    if (!viewer || !origin || !ds) return;
    try {
      const rose = windRoseBars(ds.windRose);
      const radius = this.overlayRadiusM();
      const base = this.formaTerrainBaseHeight;
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
        Cesium.Cartesian3.fromDegrees(origin.lon, origin.lat, 0),
      );
      // 6 speed-band shades (calm→gust), light→dark blue → matches the 2D
      // wind-rose speed palette. A.21.D35: blue ramp (not the purple accent) so
      // the flow field reads as Forma-style wind, with deep blue = strongest.
      const bandColors = ['#cfe3ff', '#9fc4f5', '#6fa6ec', '#3f7fe0', '#2057c8', '#123c9c'];

      // ── A.21.D35 — flowing wind STREAMLINES (the Forma differentiator) ──────
      // Many smooth curved flow-lines seeded across the upwind edge and bent
      // around the building mass. STYLISED (a deflection field), not CFD.
      const obstacle = this.overlayObstacle();
      const streamlines = windStreamlinePaths(rose, radius, {
        maxLines: 30,
        sectorCount: 4,
        obstacleRadius: obstacle?.radius ?? radius * 0.16,
        obstacleCenter: obstacle?.center,
        heightAboveGround: 2.0,
      });
      streamlines.forEach((line, li) => {
        if (line.points.length < 2) return;
        const positions = line.points.map((p) =>
          this.enuToCartesian(enu, p.east, p.north, base + p.up),
        );
        const color = Cesium.Color.fromCssColorString(bandColors[line.band] ?? '#3f7fe0');
        const alpha = 0.45 + line.strength * 0.45; // prevailing lines more opaque
        const ent = viewer.entities.add({
          name: `pryzm-climate-windflow-${li}`,
          polyline: {
            positions,
            width: 1.5 + line.strength * 3,
            clampToGround: false,
            // FIX A.21.D28#4 — flow sits ~2 m above ground; with the Forma terrain
            // depth test on, straight segments + a depth-fail material keep the
            // lines visible over the site/massing.
            arcType: Cesium.ArcType.NONE,
            material: new Cesium.PolylineGlowMaterialProperty({
              color: color.withAlpha(alpha),
              glowPower: 0.18,
            }),
            depthFailMaterial: color.withAlpha(alpha * 0.7),
          },
        });
        this.climateOverlayEntities.wind.push(ent);
      });

      // Keep the radial wind-rose ticks as faint directional reference at the
      // rim (the 3D analogue of the wind rose), under the flowing streamlines.
      const streaks = windStreakSegments(rose, radius, 1.0);
      for (const s of streaks) {
        const from = this.enuToCartesian(enu, s.from.east, s.from.north, base + s.from.up);
        const to = this.enuToCartesian(enu, s.to.east, s.to.north, base + s.to.up);
        const color = Cesium.Color.fromCssColorString(bandColors[s.dominantBand] ?? '#3f7fe0');
        const ent = viewer.entities.add({
          name: `pryzm-climate-wind-${s.label}`,
          polyline: {
            positions: [from, to],
            width: 2 + s.frac * 4,
            clampToGround: false,
            arcType: Cesium.ArcType.NONE,
            material: new Cesium.PolylineArrowMaterialProperty(color.withAlpha(0.45)),
            depthFailMaterial: new Cesium.PolylineArrowMaterialProperty(color.withAlpha(0.35)),
          },
        });
        this.climateOverlayEntities.wind.push(ent);
      }
      viewer.scene.requestRender();
      console.log(`[CesiumViewport][climate] wind overlay: ${streamlines.length} streamline(s) + ${streaks.length} rose tick(s) (mean ${rose.meanSpeedMps.toFixed(1)} m/s), radius ${radius.toFixed(0)} m${obstacle ? `, obstacle r=${obstacle.radius.toFixed(0)} m` : ''}.`);
    } catch (e) {
      console.warn('[CesiumViewport][climate] wind overlay failed:', e);
    }
  }

  private renderHeatOverlay(): void {
    const viewer = this.viewer;
    const origin = this.overlayOrigin();
    const ds = this.climateOverlayDataset;
    this.clearOverlayLayer('heat');
    if (!viewer || !origin || !ds) return;
    try {
      const tint = heatTintColorHex(ds);
      const radius = this.overlayRadiusM();
      const base = this.formaTerrainBaseHeight;
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
        Cesium.Cartesian3.fromDegrees(origin.lon, origin.lat, 0),
      );
      // A faint base disc tinted by the annual mean temperature, UNDER the
      // comfort grid, so the field always reads as a wash even at the edges.
      const baseDisc = viewer.entities.add({
        name: 'pryzm-climate-heat-base',
        position: Cesium.Cartesian3.fromDegrees(origin.lon, origin.lat, base + 0.05),
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          height: base + 0.05,
          material: Cesium.Color.fromCssColorString(tint).withAlpha(0.12),
        },
      });
      this.climateOverlayEntities.heat.push(baseDisc);

      // ── A.21.D35 — gradient comfort GROUND MAP (the Forma heat field) ───────
      // A coarse grid of green→red cells: warm-season mean sets the base, the
      // building's sun-facing/sheltered sides modulate per-cell. STYLISED, not a
      // microclimate sim. The sun "hot side" tracks the solar azimuth at the
      // current Forma sun date/time so the warm side faces the real sun.
      const obstacle = this.overlayObstacle();
      const sunBearingDeg = this.heatSunBearingDeg(origin.lat, origin.lon);
      const cells = heatFieldCells(ds, radius, {
        gridCount: 14,
        obstacleRadius: obstacle?.radius ?? radius * 0.16,
        obstacleCenter: obstacle?.center,
        sunBearingDeg,
        heightAboveGround: 0.15,
      });
      cells.forEach((c, ci) => {
        const cz = base + c.center.up;
        // Square cell as a 4-corner polygon in ENU, anchored with the shared frame.
        const h = c.halfSize * 0.96; // tiny gap so cells read as a grid
        const corners = [
          this.enuToCartesian(enu, c.center.east - h, c.center.north - h, cz),
          this.enuToCartesian(enu, c.center.east + h, c.center.north - h, cz),
          this.enuToCartesian(enu, c.center.east + h, c.center.north + h, cz),
          this.enuToCartesian(enu, c.center.east - h, c.center.north + h, cz),
        ];
        const color = Cesium.Color.fromCssColorString(c.colorHex).withAlpha(0.42);
        const ent = viewer.entities.add({
          name: `pryzm-climate-heatcell-${ci}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(corners),
            perPositionHeight: true,
            material: color,
          },
        });
        this.climateOverlayEntities.heat.push(ent);
      });
      viewer.scene.requestRender();
      console.log(`[CesiumViewport][climate] heat overlay: ${cells.length} comfort cell(s) (base tint ${tint}, sun bearing ${sunBearingDeg.toFixed(0)}°), radius ${radius.toFixed(0)} m.`);
    } catch (e) {
      console.warn('[CesiumViewport][climate] heat overlay failed:', e);
    }
  }

  /** Remove one overlay layer's entities (idempotent). */
  private clearOverlayLayer(layer: 'sunPath' | 'wind' | 'heat'): void {
    const viewer = this.viewer;
    const ents = this.climateOverlayEntities[layer];
    if (viewer) {
      for (const e of ents) { try { viewer.entities.remove(e); } catch { /* gone */ } }
    }
    this.climateOverlayEntities[layer] = [];
  }

  /** Remove ALL climate-overlay entities (used on massing re-render + dispose). */
  private clearAllClimateOverlays(): void {
    this.clearOverlayLayer('sunPath');
    this.clearOverlayLayer('wind');
    this.clearOverlayLayer('heat');
  }

  /** Re-draw whichever climate overlays are currently toggled ON (called after a
   *  massing re-place / location / terrain change so they track the plot). */
  private refreshActiveClimateOverlays(): void {
    if (this.climateOverlayOn.sunPath) this.renderSunPathOverlay();
    if (this.climateOverlayOn.wind) this.renderWindOverlay();
    if (this.climateOverlayOn.heat) this.renderHeatOverlay();
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
   * §A.21.D39#5 — place the SAME authored building massing at the site ENU origin
   * on top of the PHOTOREAL globe (real imagery + Google 3D tiles + sky), instead
   * of the Forma flat-ground study. Reuses `renderFormaMassing`'s entire massing
   * placement (shell prism, slabs, roof, openings, stairs, furniture, boundary,
   * terrain clamp, sun-driven shadows) via the `keepPhotoreal` flag — so the
   * user's house sits inside the real-world city on the "3D globe" view. The
   * caller (GISAreaLayout's "3D globe" toggle) must have already exited Forma mode
   * (setFormaMode(false)); this method does NOT re-enter it.
   */
  public renderBuildingOnGlobe(
    input: Omit<Parameters<CesiumViewport['renderFormaMassing']>[0], 'keepPhotoreal'>,
  ): void {
    this.renderFormaMassing({ ...input, keepPhotoreal: true });
  }

  /**
   * §A.21.D24 — group walls into STOREY BANDS by their base elevation so the
   * massing can be extruded per floor (stacked at true elevations) instead of
   * flattened onto a single ground block.
   *
   * Walls whose `baseElevation` falls within `STOREY_BAND_TOL_M` (0.5 m) of each
   * other are treated as the same storey — this absorbs minor authoring jitter
   * (a few mm of baseOffset) while still separating real floors (which are
   * metres apart). Bands are returned sorted GROUND-UP, so the array index is the
   * floor number used by the selector (0 = ground).
   */
  private groupWallsIntoStoreyBands(
    walls: ReadonlyArray<{
      a: { x: number; z: number };
      b: { x: number; z: number };
      height: number;
      thickness: number;
      baseElevation?: number;
      levelId?: string;
    }>,
  ): Array<{
    baseElevation: number;
    heightM: number;
    levelId?: string;
    walls: Array<{ a: { x: number; z: number }; b: { x: number; z: number }; height: number; thickness: number }>;
  }> {
    const STOREY_BAND_TOL_M = 0.5;
    type Band = {
      baseElevation: number;
      heightM: number;
      levelId?: string;
      walls: Array<{ a: { x: number; z: number }; b: { x: number; z: number }; height: number; thickness: number }>;
    };
    const bands: Band[] = [];
    for (const w of walls) {
      const elev = typeof w.baseElevation === 'number' && Number.isFinite(w.baseElevation) ? w.baseElevation : 0;
      const h = w.height > 0 ? w.height : 3;
      let band = bands.find((b) => Math.abs(b.baseElevation - elev) <= STOREY_BAND_TOL_M);
      if (!band) {
        band = { baseElevation: elev, heightM: 0, levelId: w.levelId, walls: [] };
        bands.push(band);
      }
      band.walls.push({ a: w.a, b: w.b, height: h, thickness: w.thickness });
      band.heightM = Math.max(band.heightM, h);
      if (!band.levelId && w.levelId) band.levelId = w.levelId;
    }
    // No walls at all → one nominal ground band (so an empty/boundary-only scene
    // still extrudes a single 3 m block from the footprint, as before).
    if (bands.length === 0) {
      bands.push({ baseElevation: 0, heightM: 3, levelId: undefined, walls: [] });
    }
    bands.sort((p, q) => p.baseElevation - q.baseElevation);
    return bands;
  }

  /**
   * §A.21.D24 — the storey bands of the last-rendered massing, ground-up. The
   * GISAreaLayout floor selector reads this to build its per-floor toggle. Each
   * `index` is the floor number used by `setVisibleFormaLevels`.
   */
  public getFormaStoreyBands(): ReadonlyArray<{
    index: number;
    baseElevation: number;
    heightM: number;
    levelId?: string;
    wallCount: number;
  }> {
    return this.formaStoreyBands;
  }

  /**
   * §A.21.D24 — set which storey indices are shown on the globe and re-render the
   * SAME massing with that filter. `null` shows ALL storeys. No-op until a
   * massing has been placed (nothing to filter yet).
   */
  public setVisibleFormaLevels(indices: ReadonlyArray<number> | null): void {
    this.formaVisibleLevels = indices && indices.length ? [...indices] : null;
    const input = this.formaLastMassingInput;
    if (!input) {
      console.warn('[CesiumViewport][forma] setVisibleFormaLevels: no massing placed yet — stored for next render.');
      return;
    }
    // Re-render the same massing with the new filter; never re-fly, never
    // re-clamp terrain (cheap toggle, the camera stays put).
    this.renderFormaMassing({
      ...input,
      visibleLevels: this.formaVisibleLevels,
      frameCentroid: false,
      _skipTerrainClamp: true,
    });
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
   * §A.21.D30 — the per-wall-box fallback extracted from `renderFormaMassing`.
   * Extrudes each wall of a storey as an independent thickened-rectangle prism.
   * Used ONLY when the storey's perimeter ring can't be reconstructed (open /
   * degenerate shell) — corners may gap, but it never renders nothing.
   */
  private extrudeWallsAsBoxes(
    walls: ReadonlyArray<{ a: { x: number; z: number }; b: { x: number; z: number }; height: number; thickness: number }>,
    bandBottom: number,
    bandElevBase: number,
    bandIndex: number,
    viewer: Cesium.Viewer,
    toCartesian: (x: number, z: number, up: number) => Cesium.Cartesian3,
    massFill: Cesium.Color,
    massOutline: Cesium.Color,
    silhouetteTargets: Cesium.Entity[],
  ): void {
    try {
      for (const w of walls) {
        const ring = this.wallFootprintRing(w.a, w.b, w.thickness);
        if (!ring) continue;
        const positions = ring.map((p) => toCartesian(p.x, p.z, bandBottom));
        const ent = viewer.entities.add({
          name: `pryzm-forma-massing-wall-storey-${bandIndex}`,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            extrudedHeight: bandElevBase + Math.max(0.1, w.height),
            height: bandBottom,
            material: massFill,
            outline: true,
            outlineColor: massOutline,
            outlineWidth: 1.5,
            shadows: Cesium.ShadowMode.ENABLED,
            perPositionHeight: false,
            // §A.21.D-FORMA2 — cap top + bottom so each wall reads as a SOLID
            // opaque volume rather than an open box you can see into/through.
            closeTop: true,
            closeBottom: true,
          },
        });
        this.formaMassingEntities.push(ent);
        silhouetteTargets.push(ent);
      }
    } catch (e) {
      console.warn(`[CesiumViewport][forma] storey ${bandIndex} per-wall extrusion failed:`, e);
    }
  }

  /**
   * §A.21.D30 — reconstruct the ORDERED EXTERIOR PERIMETER RING from a set of
   * shell wall segments, so a storey with no drawn parcel boundary can be
   * extruded as ONE watertight closed polygon (NO corner gaps/overlaps) instead
   * of N independent wall boxes.
   *
   * The shell (perimeter) walls share endpoints by construction (D25
   * §PERIMETER-CLOSE made the perimeter a closed loop of vertex-chained walls),
   * so we can chain segments end-to-end into a single loop. Robust to:
   *   • rectilinear / L / U shells (any orthogonal or non-orthogonal corners);
   *   • principal-axis-rotated (skewed) plots (works on raw XZ — no axis
   *     assumption; corner snapping is a metric tolerance, not a grid);
   *   • interior partition walls present alongside the shell (they branch off
   *     a perimeter node with degree ≠ 2 and are simply not followed — we only
   *     traverse the degree-2 boundary chain).
   *
   * Algorithm: snap endpoints to a tolerance grid → build an adjacency map of
   * node → connected nodes. Start from the node with the smallest (x,z) (always
   * on the convex hull, hence on the outer ring) and walk, at each step turning
   * as far CLOCKWISE as possible from the incoming direction (the standard
   * "wall-follower" that traces the OUTER boundary of a planar graph). Stop when
   * we return to the start. Returns the ordered scene-XZ ring (≥3 pts) or null
   * when the walls don't form a usable closed outer loop (→ caller falls back to
   * per-wall boxes; never throws, never renders nothing).
   */
  private reconstructPerimeterRing(
    walls: ReadonlyArray<{ a: { x: number; z: number }; b: { x: number; z: number } }>,
  ): Array<{ x: number; z: number }> | null {
    if (walls.length < 3) return null;
    const SNAP_M = 0.05; // 5 cm — well below wall thickness, above float noise.
    const key = (p: { x: number; z: number }): string =>
      `${Math.round(p.x / SNAP_M)}|${Math.round(p.z / SNAP_M)}`;

    // Node table: key → representative coordinate + neighbour set.
    const coord = new Map<string, { x: number; z: number }>();
    const adj = new Map<string, Set<string>>();
    const addNode = (p: { x: number; z: number }): string => {
      const k = key(p);
      if (!coord.has(k)) {
        coord.set(k, { x: p.x, z: p.z });
        adj.set(k, new Set());
      }
      return k;
    };
    for (const w of walls) {
      if (!Number.isFinite(w.a.x) || !Number.isFinite(w.a.z) || !Number.isFinite(w.b.x) || !Number.isFinite(w.b.z)) continue;
      const ka = addNode(w.a);
      const kb = addNode(w.b);
      if (ka === kb) continue; // degenerate zero-length segment.
      adj.get(ka)!.add(kb);
      adj.get(kb)!.add(ka);
    }
    if (adj.size < 3) return null;

    // Start at the lexicographically smallest node — guaranteed on the outer
    // boundary (it is an extreme point of the vertex set, hence on the hull).
    let startKey: string | null = null;
    let startCoord: { x: number; z: number } | null = null;
    for (const [k, c] of coord) {
      if (!startCoord || c.x < startCoord.x - 1e-9 || (Math.abs(c.x - startCoord.x) < 1e-9 && c.z < startCoord.z)) {
        startKey = k;
        startCoord = c;
      }
    }
    if (!startKey || !startCoord) return null;

    // Boundary trace. The generator's shell is a clean closed loop where every
    // PERIMETER node has degree exactly 2 (D25 §PERIMETER-CLOSE chains the shell
    // corner-to-corner). Interior partitions are separate walls whose endpoints
    // land mid-span on a perimeter wall (NOT at a shared corner), so they create
    // no perimeter graph node — the simple chain below walks the unambiguous
    // degree-2 loop. At a node we always take the non-backtracking neighbour;
    // when a node is a genuine junction (degree > 2, a rare exact-corner tee) we
    // pick the smallest clockwise turn from the reversed-incoming heading, which
    // keeps the trace on a single coherent face. The result is then VALIDATED
    // (closed, ≥3 verts, encloses positive area, covers a strong majority of the
    // graph's nodes); anything that fails → null → per-wall-box fallback. This
    // makes a wrong interior-face trace self-reject rather than render garbage.
    const angleOf = (dx: number, dz: number): number => Math.atan2(dz, dx); // (-π, π]
    const cwSweep = (from: number, to: number): number => {
      // Clockwise sweep magnitude from heading `from` to heading `to`, (0, 2π].
      let d = from - to;
      while (d <= 1e-9) d += 2 * Math.PI;
      while (d > 2 * Math.PI + 1e-9) d -= 2 * Math.PI;
      return d;
    };

    const ring: Array<{ x: number; z: number }> = [];
    const visited = new Set<string>();
    let prevKey: string | null = null;
    let curKey: string = startKey;
    const MAX_STEPS = adj.size + 2;

    for (let step = 0; step < MAX_STEPS; step++) {
      const cur = coord.get(curKey)!;
      ring.push({ x: cur.x, z: cur.z });
      visited.add(curKey);
      const all = [...adj.get(curKey)!].filter((nk) => nk !== curKey);
      if (all.length === 0) return null; // dead end — not a closed loop.

      // Prefer non-backtracking neighbours (exclude the immediate previous node)
      // unless that leaves nothing (degree-1 spur forces a backtrack → reject).
      const candidates = all.filter((nk) => nk !== prevKey);
      const pool = candidates.length > 0 ? candidates : all;

      let bestKey: string;
      if (pool.length === 1) {
        bestKey = pool[0]!; // unambiguous degree-2 chain step.
      } else {
        // Junction: take the smallest clockwise turn from reversed-incoming.
        let revInAng: number;
        if (prevKey) {
          const prev = coord.get(prevKey)!;
          revInAng = angleOf(prev.x - cur.x, prev.z - cur.z);
        } else {
          revInAng = angleOf(0, 1); // seed at the hull-extreme start node.
        }
        let chosen: string | null = null;
        let bestSweep = Infinity;
        for (const nk of pool) {
          const n = coord.get(nk)!;
          const sweep = cwSweep(revInAng, angleOf(n.x - cur.x, n.z - cur.z));
          if (sweep < bestSweep) { bestSweep = sweep; chosen = nk; }
        }
        bestKey = chosen ?? pool[0]!;
      }

      if (bestKey === startKey) {
        break; // closed the loop.
      }
      // A revisit that is NOT the start means a self-crossing trace → reject.
      if (visited.has(bestKey)) return null;
      prevKey = curKey;
      curKey = bestKey;
    }

    // ── Validate the candidate ring ──────────────────────────────────────────
    if (ring.length < 3) return null;
    // Must enclose positive area (shoelace) — a collapsed/collinear chain is junk.
    let area2 = 0;
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      area2 += p.x * q.z - q.x * p.z;
    }
    if (Math.abs(area2) < 1e-3) return null;
    // Must have closed back to the start (the loop broke on bestKey===startKey)
    // and cover a strong majority of the graph's nodes — a trace that skipped
    // most of the shell is the wrong face → fall back to per-wall boxes.
    if (visited.size < Math.ceil(adj.size * 0.6)) return null;
    return ring;
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

  /**
   * FIX A.21.D28#2 — footprint centroid + area from the building's authored
   * geometry when no parcel boundary is drawn. Computes the XZ bounding box of
   * all wall endpoints (else all slab ring vertices), returning its centre +
   * area in ENU metres (`east = x`, `north = −z`, matching the placement frame).
   * Returns null when there is no usable geometry. The bounding box is a coarse
   * but ALWAYS-non-zero footprint — enough to frame the camera + scale the
   * climate-overlay radius onto the building instead of collapsing to the origin.
   */
  private footprintBBoxXZ(
    walls: ReadonlyArray<{ a: { x: number; z: number }; b: { x: number; z: number } }>,
    slabs: ReadonlyArray<{ ring: ReadonlyArray<{ x: number; z: number }> }>,
  ): { east: number; north: number; area: number } | null {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let seen = 0;
    const acc = (x: number, z: number): void => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
      seen++;
    };
    for (const w of walls) { acc(w.a.x, w.a.z); acc(w.b.x, w.b.z); }
    if (seen === 0) for (const s of slabs) for (const p of s.ring) acc(p.x, p.z);
    if (seen === 0) return null;
    const w = maxX - minX;
    const d = maxZ - minZ;
    if (w <= 0 || d <= 0) return null;
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    return { east: cx, north: -cz, area: w * d };
  }

  /**
   * GIS-CESIUM-ZRAISE — the BIM canvases (OBC WebGL inside <bim-viewport>, and
   * the PRYZM WebGPU overlay <canvas data-pryzm="webgpu">) are siblings of the
   * Cesium container in #container. While Cesium is shown we hide them so the
   * (opaque) BIM render doesn't paint over Cesium, and restore them on hide.
   * Best-effort + idempotent; queried fresh each call (the WebGPU canvas may be
   * (re)created across project loads).
   */
  private setBimCanvasesHidden(hidden: boolean): void {
    const root = this.parent ?? document.getElementById('container');
    if (!root) return;
    const targets: HTMLElement[] = [];
    const webgpu = root.querySelector('canvas[data-pryzm="webgpu"]') as HTMLElement | null;
    if (webgpu) targets.push(webgpu);
    const bimViewport = root.querySelector('bim-viewport') as HTMLElement | null;
    if (bimViewport) targets.push(bimViewport);
    for (const el of targets) {
      if (hidden) {
        if (el.dataset.gisPrevVisibility === undefined) {
          el.dataset.gisPrevVisibility = el.style.visibility || '';
        }
        // Use visibility (not display:none) so the BIM renderer keeps its layout
        // size — restoring is instant and the canvas buffer never resizes to 0.
        el.style.visibility = 'hidden';
      } else if (el.dataset.gisPrevVisibility !== undefined) {
        el.style.visibility = el.dataset.gisPrevVisibility;
        delete el.dataset.gisPrevVisibility;
      } else {
        el.style.visibility = '';
      }
    }
    console.log(
      `[gis][cesium] BIM canvases ${hidden ? 'hidden' : 'restored'} ` +
      `(${targets.length} target(s): ${targets.map((t) => t.tagName.toLowerCase()).join(', ') || 'none'}).`
    );
  }

  /** Force a Cesium resize + render now and again on the next frame — a viewer
   *  mounted into a 0-size / freshly-shown container otherwise renders nothing
   *  until the next user-driven resize. */
  private forceResizeAndRender(reason: string): void {
    if (!this.viewer) return;
    try {
      this.viewer.resize();
      this.viewer.scene.requestRender();
      console.log(
        `[gis][cesium] resize (${reason}) — canvas ${this.viewer.canvas.clientWidth}x${this.viewer.canvas.clientHeight}, ` +
        `container ${this.container.clientWidth}x${this.container.clientHeight}.`
      );
    } catch (e) {
      console.warn('[gis][cesium] forceResizeAndRender failed:', e);
    }
    // One more after layout flushes — the container often gets its real size a
    // frame after display flips from none → block.
    requestAnimationFrame(() => {
      if (!this.viewer) return;
      try {
        this.viewer.resize();
        this.viewer.scene.requestRender();
      } catch { /* viewer torn down mid-frame */ }
    });
  }

  public setVisible(visible: boolean): void {
    if (!this.container) return;
    if (visible) {
      this.container.style.display = "block";
      this.container.style.zIndex = String(CESIUM_Z);
      this.setBimCanvasesHidden(true);
      console.log(`[gis][cesium] setVisible(true) — display:block, z-index:${CESIUM_Z} (above BIM WebGPU overlay z:2).`);
      if (this.viewer) {
        this.forceResizeAndRender('setVisible(true)');
      } else {
        // Viewer still mounting — whenReady() resolves; resize then.
        void this.whenReady().then(() => {
          if (this.container.style.display !== 'none') this.forceResizeAndRender('setVisible→whenReady');
        });
      }
    } else {
      this.container.style.display = "none";
      this.setBimCanvasesHidden(false);
      console.log('[gis][cesium] setVisible(false) — display:none, BIM canvases restored.');
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
    // A.21.D24 — drop all 3D climate overlays (sun-path/wind/heat) so they don't
    // leak across project switches; the toggle state is reset to off.
    try {
      this.clearAllClimateOverlays();
      this.climateOverlayOn = { sunPath: false, wind: false, heat: false };
      this.climateOverlayDataset = null;
    } catch (e) {
      console.warn('[CesiumViewport] climate-overlay dispose failed:', e);
    }
    // MAP-DATA-OVERTURE — cancel + drop context buildings so they don't leak
    // across project switches (a re-mounted viewport reloads them for the new site).
    try {
      this.contextBuildingsAbort?.abort();
      this.contextBuildingsAbort = null;
      if (this.contextPanRefreshTimer !== null) { clearTimeout(this.contextPanRefreshTimer); this.contextPanRefreshTimer = null; }
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

    // GIS-CESIUM-ZRAISE — if the viewport is disposed while still visible, make
    // sure the BIM canvases we hid in setVisible(true) are restored, or the BIM
    // view would stay blank after GIS tears down.
    try {
      this.setBimCanvasesHidden(false);
    } catch (e) {
      console.warn('[gis][cesium] dispose: BIM-canvas restore failed:', e);
    }

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