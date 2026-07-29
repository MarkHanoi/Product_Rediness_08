import * as Cesium from "cesium";
// §CESIUM-GIZMO-REMOVED (founder 2026-06-19) — the move-on-globe transform gizmo
// (the green/purple origin axis lines the founder repeatedly asked to remove) is
// gone entirely; nothing constructs it, so the axes can never reappear in real mode.
// MAP-DATA-OVERTURE — keyless OSM/Overture context-building loader (bbox → GeoJSON
// footprints + heights). Used to surround the proposed massing with real buildings
// that cast shadows (Forma/Archistar-style context). Same data path as the 2D map.
import {
    // §PERF-CTX-SINGLE-FETCH (L-368) — ONE far-extent Overpass fetch returns { near, far }
    // (near = extruded+shadows, far = §FEAT-FORMA-CONTEXT-EXTENT-LOD flat/low-poly shadowless,
    // nearest-N capped) split client-side, so the far ring never waits on a second network hop.
    fetchContextBuildingsNearAndFar,
    CONTEXT_BBOX_HALF_DEG,
    // §FEAT-FORMA-CONTEXT-NEAR-CAP (L-454) — bound the EXPENSIVE half. The near ring was
    // uncapped while the cheap far ring was capped; this tiers it by the shadow-map horizon
    // (demoting the overflow rather than dropping it, so coverage is unchanged).
    selectNearRingRenderTiers,
    CONTEXT_NEAR_SHADOW_RADIUS_M,
    CONTEXT_NEAR_MAX_BUILDINGS,
    // §PLOT-CLEAR-ENVELOPE (L-402c) — pure filter that removes the OSM context
    // building sitting ON the committed working plot (the building the user is
    // replacing) so it can't bury the translucent #6600FF buildable-envelope volume.
    partitionFootprintsByParcel,
    // §CTX-PAN-DEBOUNCE (L-402c) — pure gate for the pan-driven REFETCH (never gates the
    // initial load, which is a direct loadContextBuildings call in renderFormaMassing).
    shouldRefetchContextOnPan,
    type ContextBuildingCollection,
    type ContextBuildingFeature,
} from "./contextBuildings";
// §CTX-USE-COLOUR (L-599) — pure "what is this building" classification + palette + legend.
// ⭐ ACTUAL use only (OSM `building=*`); PERMITTED use (clau/MUC) is a DIFFERENT layer and is
// deliberately not merged — their disagreement is the development signal.
import {
    classifyContextUse,
    summariseContextUse,
    CONTEXT_USE_STYLE,
    type ContextUseLegend,
} from "./contextBuildingUse";
// §CTX-QUERY-PANEL (L-592) — pure read-only query model for a picked context building. Every
// judgement about what may be SAID about it (height provenance, synthetic-vs-OSM id) lives there.
import { buildContextBuildingQuery, type ContextBuildingQueryModel } from "./contextBuildingQuery";
// §FACADE-STUDY-SUBJECT (L-596) — the EXPLICIT choice of what the sun study runs on, and the
// refusals that stop it ever silently substituting one subject for the other (the L-272 trap).
import {
    resolveFacadeStudySubject,
    includeProposedMassingAsOccluder,
    type FacadeStudySubject,
    type EnvelopeStudyInput,
} from "./facadeStudySubject";
// C06 §7 / §233 — z-index comes from the single named scale, never a hand-picked literal.
import { zCss } from "../layout/zLayers";
// C58 §1.14 / STRUCTURAL-SEAM-1 — the massing render is a DUMB RASTERISER of `MassingSolid[]`
// derived by the pure L2 `envelopeToMassing`. This viewport holds NO per-field knowledge of the
// envelope: it maps each solid's hue to the SAME two colours the flat surfaces use (imported from the
// single colour authority), and extrudes `[baseHeightM, topHeightM]` — it never re-derives a height.
import { CONFIDENT_VIOLET_CSS, PROVISIONAL_GREY_CSS } from "../site/envelopeRenderStyle";
import type { MassingSolid } from "@pryzm/site-parcel-data";
import { fetchContextRoads, type ContextRoadCollection } from "./contextRoads";
import { fetchContextWater, type ContextWaterCollection } from "./contextWater";
import { fetchContextParks, type ContextParkCollection } from "./contextParks";
import { fetchContextLanduse, type ContextLanduseCollection } from "./contextLanduse";
// PW.2 (§DIAG-PARTY-WALL) — capture neighbour footprints for the layout pipeline
// (party/blind-wall detection in resolveBlindFacades). Editor-side store, no engine dep.
import { setNeighbourFootprints } from "../site/neighbourFootprintStore";
// FORMA.5 — pure NOAA solar-position calculator (L2, no THREE / no I/O).
// `solarSample(lat, lon, utcIso)` → { altitudeRad, azimuthRad, isAboveHorizon }.
// This is the SAME pure algorithm the ClimatePanel sun-path uses; FORMA.5 reads
// it to drive the Cesium directional light (read-only consumer — SPEC §6).
import { solarSample } from "@pryzm/climate-host";
import { getCurrentSiteOrigin } from "../site/siteDispatch";
// §L-430 slice 2b — the scene(PROJECT-north) → ENU(TRUE-north) frame boundary, extracted
// headless so it is unit-testable (this file is not). See sceneEnuFrame.ts for why.
import { sceneXZToEnu } from "./sceneEnuFrame";
// §SITE-FRAME-PROBE (L-536) — the SAME pure derivation the authoring frame is DEFINED by, so the
// probe below can re-derive θ from the very ring it is about to draw and report a VERDICT instead
// of three numbers a reader has to interpret. See the probe block in renderFormaMassing.
import { deriveProjectNorthAngleFromParcel } from "../site/overlay/projectTrueNorth";
// §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — pure vertical-datum + georeference
// decisions (no Cesium/THREE/DOM): the ONE datum boundary (C12 §1.4) that decides whether
// the globe ground height is RESOLVED (a measurement off the photoreal tile mesh, or the
// ellipsoid when no tiles are shown) or UNRESOLVED — in which case the building is held
// HIDDEN rather than silently anchored at ellipsoid 0 (~50 m underground in Menorca, where
// the geoid/ellipsoid separation is ≈ +49 m). Plus the origin-divergence instrumentation
// for the separate HORIZONTAL defect (C12 §1.5).
import {
  type GlobeGroundAnchor,
  type GeorefOriginEvidence,
  reduceTileGroundHeight,
  resolveGlobeGroundAnchor,
  decideGroundAnchorAction,
  originSeparationMeters,
  georefOriginsDiverge,
  resolveGroundSample,
  ringCentroidLatLon,
} from "./globeGroundAnchor";
// FORMA.6 — pure building-fidelity helpers (no THREE/Cesium/DOM): the floor-filter
// show-all decision + geometry signature for the REAL full-fidelity Forma model.
import { realModelStaysVisible } from "./formaBuildingFidelity";
// §TERRAIN-RENDER (Phase 3) — resolve a site's lon/lat to a baked-terrain city + its R2
// quantized-mesh tileset URL, so we can attach a CesiumTerrainProvider where terrain exists.
import { decideBakedTerrainAttach, terrainTilesetUrl } from "./terrainCoverage";
// §FORMA-SCENE-QUALITY (ADR-0089) — tuned "architectural model" quality constants
// (clean neutral massing, soft gradient shadowing/fog, sky-gradient backdrop) +
// the pure CSS sky-gradient builder. Cesium-free helper; see formaSceneQuality.ts.
import { FORMA_QUALITY, buildFormaSkyGradientCss } from "./formaSceneQuality";
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
// §SITE-METRIC-HEATMAP — pure Hektar/Forma-style ground-grid metric bridge (no
// Cesium/THREE/DOM): composes @pryzm/street-analytics into coloured ground cells in
// the SAME site-ENU frame as the climate overlays, plus the per-metric legend.
import {
    buildSiteMetricGrid,
    prepareSunHoursGrid,
    // §SITE-METRIC-TEXTURE — rasterise ANY metric's coloured cells into ONE smooth
    // bilinearly-interpolated ground texture (display decoupled from the compute grid;
    // removes the per-cell entity cap so EVERY metric reads fine + smooth, not blocky).
    rasterizeMetricTexture,
    // §SITE-METRIC-DAYLIGHT-VSC — chunkable Vertical Sky Component ground grid.
    prepareDaylightVscGrid,
    siteMetricLegend,
    // §SITE-METRIC-COST-TIER — per-metric grid resolution budget (expensive raycast
    // metrics get a coarser/cheaper grid than the O(1) field metrics). Single source
    // of truth for cell size + cap so the renderer never hard-codes resolution.
    siteMetricGridBudget,
    type SiteMetric,
    type MetricFootprint,
    type MetricGridCell,
    type SunHoursCell,
    type MetricTexture,
    type DaylightVscCell,
    // §FORMA-FACADE-ANALYSIS (ADR-0093) — sun-hours on the DESIGNED building's outer
    // façade + roof (on-demand toggle), using the SAME ramp + direct-beam shadow test
    // as the ground sun-hours heatmap. Pure compute (no Cesium/THREE), chunkable.
    prepareFacadeSunGrid,
    // §FORMA-FACADE-SMOOTH (founder 2026-07-01) — rasterise the per-face façade sun field
    // into ONE smooth bilinearly-interpolated texture per wall face (+ roof) so the façade
    // reads as a continuous gradient like the floor heatmap, not ~2159 discrete quads.
    rasterizeFacadeSunTexture,
    // §FEAT-FACADE-ANALYSIS-MATCH-SUNHOURS-QUALITY (L-227) — normalise the façade study to its
    // realised max WALL intensity so the gradient fills the SAME cold→warm ramp span as the
    // ground heatmap (fixes the compressed "flat cyan" façade), mirroring computeSunHoursOnModel.
    normalizeFacadeStudy,
    // §FEAT-FACADE-ANALYSIS-SMOOTH-PER-FACE (L-232) — plan the façade sampling density (finer
    // sun cadence + sub-storey spacing) bounded by a building-size work budget, so the gradient
    // reads as smoothly as the ground WITHOUT growing the (separately-capped) drape textures.
    planFacadeSampling,
    // §FIX-FACADE-ANALYSIS-REAL-GEOMETRY (L-144 / L-160b) — punch the REAL authored
    // window/door openings out of the façade study so the analysis surface is the real
    // walls-with-openings, not a solid perimeter prism. + §PERF-SUNHOURS-WORKER probe type
    // (the raycast itself runs in the worker via computeSunIntensitiesForProbes).
    facadeOpeningUvRects,
    // §FIX-FACADE-ANALYSIS-DRAPE-QUALITY (L-272, founder 2026-07-13) — the façade drape must
    // RECONSTRUCT the field the way the ground drape does (a kernel stated in METRES over a
    // display several times finer than the compute lattice), and over ONE field per envelope
    // PLANE (consecutive collinear ring edges merged into one panel) so a wall traced as N
    // edges yields ONE continuous ramp instead of N seamed studies.
    smoothFacadeField,
    mergeCollinearFacadeEdges,
    FACADE_RECON_SIGMA_M,
    // §FIX-FACADE-ANALYSIS-ON-REAL-MODEL (L-177, founder-escalated) — build the WALL
    // (cylindrical) + ROOF (top-down) sun-hours lookup textures a Cesium CustomShader
    // drapes onto the REAL placed GLB model, replacing the separate envelope-prism paint.
    buildRealModelSunDrape,
    type FacadeDrapeFace,
    type RealModelSunDrape,
    type FacadeOpening,
    type FacadeOpeningRect,
    type SunProbe,
    type FacadeSamplePoint,
    type FacadeSunPrep,
    type FacadeSunTexture,
} from "../climate/siteMetricGrids";
// §PERF-SUNHOURS-WORKER (L-143 / L-160c, ADR-0110) — off-main-thread sun-hours raycast.
// The pool computes per-probe intensities in a Web Worker so the heavy real-geometry
// façade + ground grid never freeze the 3D site view; unavailable/errored → the existing
// synchronous chunked path is the fallback (never worse than today).
import { getSolarWorkerPool, isSolarSuperseded } from "../../workers/SolarWorkerPool";
// §ANALYSIS-REAL-POPULATION + §ANALYSIS-REAL-TEMPERATURE + §ANALYSIS-REAL-WIND
// (ADR-0095) — REAL free-dataset baselines (NASA POWER climate + WorldPop population)
// for the analysis metrics. Async + cached + non-fatal; the render path peeks the
// cache synchronously and kicks a fetch that repaints when real data lands.
import {
    fetchRealClimateBaseline,
    fetchRealPopulationSample,
    peekRealClimateBaseline,
    peekRealPopulationSample,
} from "../climate/siteRealData";
// §SITE-METRIC-HEATMAP-CHUNKED — frame-budget-friendly deferral so the larger /
// finer ground heatmap (esp. the per-cell sun-hours raycast) fills in progressively
// across frames instead of freezing the WebGPU viewport on one synchronous build.
import { deferWork, getFrameScheduler, type DeferWorkCanceller } from "@pryzm/frame-scheduler";

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

/**
 * §FIX-GLOBE-AUTOFRAME-AND-SEAT (L-184) — a small DOWNWARD seat epsilon (metres) applied
 * to the resolved photoreal-tile ground height so the building sits FLUSH on the tile
 * surface instead of perching a hair above it. The min-over-footprint+street-ring pick is
 * biased slightly HIGH by tile-mesh thickness / canopy / LOD noise, leaving a visible float
 * gap; sinking the base by a sub-metre epsilon absorbs that noise. Deliberately tiny so it
 * NEVER buries the model (a few decimetres into a metres-tall building is invisible), and
 * applied ONLY to a real tile pick — never to the coarse bounding-sphere fallback, which is
 * already a downward-biased estimate.
 */
const GLOBE_GROUND_SEAT_EPSILON_M = 0.3;

/**
 * §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — the tile-height clamp's RETRY BUDGET.
 *
 * ROOT CAUSE of the founder's intermittent "still at 0 elevation / underground" globe: the
 * photoreal tile-surface height sample is ASYNCHRONOUS (it can only return a height once
 * tiles have STREAMED at that LOD). The old policy retried 3 × 1.2 s ≈ 3.6 s and then GAVE
 * UP, leaving the base at the initial `formaTerrainBaseHeight = 0` — which is the WGS-84
 * ELLIPSOID, not sea level. At Menorca the geoid/ellipsoid separation is ≈ +49 m, so
 * ellipsoid-0 is ~50 m BELOW the visible tile ground → the house is buried. Tiles arriving
 * inside 3.6 s → looks right; a cold cache / slow link → buried. That single race explains
 * BOTH "still 0 elevation" AND "sometimes correct".
 *
 * The budget below is generous (≈ 15 s) AND is no longer the only trigger: the tileset's own
 * load events (`initialTilesLoaded` / `allTilesLoaded`) re-fire the clamp the moment tiles
 * land (see `attachPhotorealTilesLoadedHook`). While the ground is UNRESOLVED the building is
 * held HIDDEN — never anchored at a fabricated 0 (C12 §1.4).
 */
const GLOBE_GROUND_CLAMP_MAX_RETRIES = 12;
const GLOBE_GROUND_CLAMP_RETRY_MS = 1200;

/**
 * §SITE-CINEMATIC-ARRIVAL (founder, 2026-06-17) — the OPPOSITE of the quick
 * snap-zoom. On an interactive location change the camera should establish like
 * a film shot: start FAR/high above the target, then SLOWLY descend with an
 * easing curve to the precise plot. Two-stage:
 *   (a) jump to a high vantage straight above the target (instant — this is the
 *       "establishing" altitude the slow descent starts from), then
 *   (b) flyTo down to the normal site framing over SITE_ARRIVAL_FLY_DURATION_S
 *       with a decelerating ease so it glides to a stop on the plot.
 */
const SITE_ARRIVAL_FLY_DURATION_S = 5;
/** Establishing-shot altitude (m) the slow descent begins from. */
const SITE_ARRIVAL_HIGH_ALT_M = 9000;

/**
 * GIS-CESIUM-ZRAISE — z-index the Cesium container is raised to while GIS is
 * active. Must be > the PRYZM WebGPU overlay canvas (z-index:2 in
 * initScene.ts OVERLAY_CSS) and > the OBC WebGL canvas (z auto/0) so Cesium
 * actually paints on top of the BIM view, but < the floating Forma/result
 * toggles (z-index 30/31 in GISAreaLayout) so those chrome controls stay clickable.
 */
const CESIUM_Z = 15;

/**
 * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the GROUND-SETTLE readiness signal, i.e.
 * the L-259 (§FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF) seat-and-reveal outcome, made public.
 *
 * `settled` is TRUE once the async ground clamp has REACHED A TERMINAL — either the datum was
 * MEASURED (`source` = photoreal-tile-clamp / tileset-bounding-sphere / ellipsoid-flat-ground)
 * or the viewport explicitly gave up and revealed the building anyway with a loud warning
 * (`source` = 'unresolved'). It is FALSE only when the viewport was torn down before the clamp
 * terminated — the consumer must treat that as a FAILURE, never as "wait forever".
 */
export interface GroundSettleSignal {
  readonly settled: boolean;
  readonly source: GlobeGroundAnchor['source'];
  readonly baseHeightM: number;
}

/** §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — Cesium's OWN tile-streaming counters. */
export interface TileLoadProgress {
  /** Tile/imagery requests in flight (network). */
  readonly pending: number;
  /** Tiles downloaded but not yet processed/uploaded to the GPU. */
  readonly processing: number;
  /** TRUE when Cesium reports nothing outstanding for the current view. */
  readonly tilesLoaded: boolean;
}

/**
 * FORMA.2 — Forma-style "massing study" palette (SPEC-FORMA-SITE-VIEW.md §2 / §9).
 * This is the analysis-canvas palette, deliberately distinct from PRYZM chrome
 * (white + #6600FF). Single source of truth for the Cesium Forma render mode.
 */
/** §GLOBE-FIRST-FRAME-COLOUR (founder 2026-06-18 "cesium originally shows black") —
 *  the globe baseColor + scene background shown BEFORE imagery tiles stream in.
 *  Cesium's default (and the prior photoreal path) was PURE BLACK, so the GIS view
 *  opened black for the seconds before tiles loaded. §GLOBE-FIRST-FRAME-BASE only
 *  re-frames the CAMERA (a delayed repair); it never set the colour. Brand rule:
 *  white + #6600FF, NO pure black — a soft lavender-white reads as an intentional
 *  loading map, not a blank/error frame. */
const GLOBE_LOADING_COLOUR = '#EDECF5';

const FORMA_PALETTE = {
  /** Flat neutral light-grey massing ground (§2 Ground & water).
   *  §FORMA-SCENE-QUALITY (ADR-0089) — was a warm beige (#D9D5CE) that read
   *  slightly "sandy"; the Spacio/Forma reference ground is a cooler, cleaner
   *  architectural light-grey so the white massing + soft shadows read against a
   *  neutral plane (not a warm desert). Still soft, never stark. */
  ground: '#DDDCD9',
  /** Scene background — soft neutral (§2 Sky / background). §FORMA-SCENE-QUALITY:
   *  this is now the FALLBACK flat fill; the visible backdrop is the soft vertical
   *  sky GRADIENT painted on the container (buildFormaSkyGradientCss) showing
   *  through the alpha canvas. Kept here so a no-alpha GPU still gets a clean
   *  neutral clear colour instead of black. */
  background: '#E9EAEC',
  /** Crisp graphite silhouette outline (§2) — dark enough for strong edge
   *  definition + contrast (founder: "stronger contrast"), not pure black. */
  silhouette: '#2B2B2B',
  /** Proposed-building volume fill (§2). §FORMA-SCENE-QUALITY (ADR-0089) — was
   *  PURE white (#FFFFFF), which blew out under the key light so faces lost their
   *  value range and the mass read flat. A soft near-white (a hair below 100%)
   *  keeps the clean architectural-model look while letting the directional
   *  shading + AO/contact-shadow gradient define the faces (founder: "not pure-
   *  white blown-out … a hint of value range so faces read"). */
  proposedFill: '#F4F4F2',
  /** Context-building fill (§2). §FORMA-SCENE-QUALITY — a touch cooler/greyer than
   *  the warm beige it was, so context massing recedes as neutral grey behind the
   *  brighter proposed mass (the reference's "context = quiet grey" read). */
  contextFill: '#D9D8D3',
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
   *  hue reads as real tinted glazing rather than an opaque blue-grey panel.
   *  §A.21.D50 — cooler/deeper glass blue (#4F86C6) so the translucent panel reads
   *  as see-through tinted glazing against the white shell instead of compositing
   *  to a near-white opaque-looking pane (the founder's "still opaque" defect). */
  glazing: '#4F86C6',
  /** §A.21.D34(d) — coarse DOOR-leaf tint (warm graphite, darker than glazing so
   *  the front door reads distinctly from windows). */
  doorLeaf: '#4A4540',
  /** §A.21.D34(d) — coarse STAIR volume tint (light graphite, sits between the
   *  white shell and the dark door so the stairwell mass reads). */
  stair: '#B9B3A8',
  /** FORMA-CTX §22.2 — thin grey road centre-lines (Forma/Archistar look).
   *  §FORMA-CTX-ROAD-RIBBON (founder 2026-07-01) — now used as flat GROUND ribbons
   *  (not floating lines); a LIGHT warm-grey street tone matching the 2D basemap so
   *  the street grid reads as pale streets on the neutral ground, under the buildings. */
  road: '#C9C7C2',
  /** §FORMA-CTX-ROAD-RIBBON — subtle casing outline for the street ribbons. */
  roadEdge: '#B4B1AB',
  /** FORMA-CTX-WATER (founder 2026-06-19) — soft blue lakes/rivers, matching the
   *  2D map's water tone so the site reads with its real water context. */
  water: '#AEC9DB',
  /** §FORMA-CTX-PARKS (founder 2026-07-01) — natural park green for leisure=park /
   *  landuse=grass|forest / natural=wood|grassland areas, matching the 2D basemap's
   *  green space (e.g. Central Park) so the 3D site reads as the same neighbourhood. */
  park: '#A9C77E',
  /** §FORMA-CTX-PARKS — subtle green edge for the park areas. */
  parkEdge: '#8FB86B',
  /** §FORMA-CTX-LANDUSE (founder 2026-07-29) — URBAN land-use (residential/commercial/industrial…)
   *  painted a soft neutral grey so built-up ground reads distinctly from the neutral base + rural. */
  urban: '#C4C1BB',
  urbanEdge: '#AEABA4',
  /** §FORMA-CTX-LANDUSE — RURAL land-use (farmland/meadow/orchard/vineyard…) a warm earthy brown/tan
   *  so agricultural ground reads brown, matching the founder's "brown in rural areas". */
  rural: '#CDB98C',
  ruralEdge: '#B8A374',
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
 * §FACADE-STUDY-SUBJECT (L-596) × C58 §1.14 — collapse the envelope's `MassingSolid[]` to the ONE
 * ring + height the envelope sun study runs on: the tallest VOLUME-CLAIMING solid (the FAR solid or
 * the tallest tier — never the translucent legal-ceiling shell). Returns a ring with a null height
 * when the envelope is a flat footprint slab (no volume claim), so the study REFUSES with the
 * §ENVELOPE-NO-FABRICATED-HEIGHT (L-525a) message rather than inventing one. Null → no envelope.
 * Pure: the render holds no envelope knowledge; it only picks the tallest solid the engine produced.
 */
function envelopeStudyInputFromSolids(
  env: { solids: ReadonlyArray<MassingSolid> } | null | undefined,
): EnvelopeStudyInput | null {
  const solids = env?.solids ?? [];
  if (solids.length === 0) return null;
  let tallest: MassingSolid | null = null;
  for (const s of solids) {
    if (!s.claimsVolume) continue;
    if (!tallest || s.topHeightM - s.baseHeightM > tallest.topHeightM - tallest.baseHeightM) tallest = s;
  }
  if (tallest) {
    return { ring: tallest.ring, maxHeightM: tallest.topHeightM - tallest.baseHeightM };
  }
  // Only footprint slabs (no claimed height): expose the ring with a null height so the study
  // refuses honestly instead of fabricating a height (L-525a).
  return { ring: solids[0]!.ring, maxHeightM: null };
}

/**
 * FORMA.3 — NW oblique camera handoff (SPEC §4.5): heading 325°, pitch −45°.
 * The destination altitude scales with √areaM2 so the whole plot is framed.
 */
const FORMA_FLY_HEADING_DEG = 325;
const FORMA_FLY_PITCH_DEG = -45;
const FORMA_FLY_DURATION_S = 1.2;
// §GLOBE-SITE-IN-VIEW (L-635) — the old distance/height heuristics for the corrective reframe
// (`GLOBE_STALE_FRAME_BASE_JUMP_M`, `FORMA_STRANDED_CAMERA_HEIGHT_M`) were removed: they both MISSED
// Madrid (base-0 frame is underground at LOW height; a re-frame leaves base-jump ≈ 0). The reframe now
// gates on the honest predicate `siteFramedInCurrentView()` — is the settled site actually in frustum.
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

/**
 * §FLY-TOUR-GROUND-CLEARANCE (founder bug, 2026-06-17) — Forma framing/tour
 * altitudes are computed in metres ABOVE THE SITE GROUND, but a camera
 * `destination` height is absolute WGS84-ellipsoid height. When the site sits on
 * non-zero terrain (city ground far above the ellipsoid, or tile-clamped
 * `formaTerrainBaseHeight`) and `globe.depthTestAgainstTerrain = true` (Forma
 * mode, set ~line 1087), an absolute height below ground puts the camera
 * UNDERGROUND → fully black globe. Every fly destination must therefore be
 * seated on `formaTerrainBaseHeight` and kept at least this many metres clear of
 * the ground so the camera never dives beneath the surface mid-tour. */
const FORMA_FLY_MIN_GROUND_CLEARANCE_M = 25;

/** Silhouette edge width in px (§2 — 1.5px). */
const FORMA_SILHOUETTE_WIDTH = 1.5;
/** Ambient-occlusion intensity (§2 — ≈ 2.5). */
const FORMA_AO_INTENSITY = 2.5;
/**
 * §FORMA-AO-OPT-IN (ADR-0087) — DEFAULT OFF. Cesium's ambient-occlusion
 * post-process is a cosmetic effect whose generated fragment shader FAILS TO
 * COMPILE on some GPU/driver combos (notably the founder's machine). Cesium
 * treats a shader-compile failure as FATAL: it raises `scene.renderError`,
 * shows its error panel, and STOPS the entire render loop — so one optional
 * effect blanks the whole Forma massing view ("Rendering has stopped").
 *
 * §FORMA-SCENE-QUALITY (ADR-0089) — AO is the lovely "gradient shadowing in the
 * crevices" the founder ranked #1, so we now ATTEMPT it BY DEFAULT, but ONLY
 * behind the full capability path: (a) `isAmbientOcclusionSupported(scene)` /
 * WEBGL_depth_texture feature-detect, (b) a guarded construct, and (c) the
 * `scene.renderError` guard (§FORMA-RENDER-ERROR-GUARD) which latches
 * `formaPostProcessFaulted` and sheds AO on the FIRST compile failure while
 * keeping the loop alive. GPUs that compile it get the AO; GPUs that can't
 * degrade to the soft directional shadows + fog gradient (which already read as
 * gentle ambient depth) — never the "Rendering has stopped" overlay. The opt-in
 * flag still works as an explicit OVERRIDE (`window.__pryzmFormaAO === false`
 * force-disables it on a machine known to choke even past the feature-detect). */
const FORMA_AO_DEFAULT_ENABLED = true;
/** Directional-light intensity for the Forma key light. §A.21.D-FORMA2 raised
 *  1.8 → 2.3 so strong-white masses read crisp + bright with stronger highlights
 *  (founder: "strong white + stronger contrast"). */
const FORMA_LIGHT_INTENSITY = 2.3;
/**
 * §A.21.D-FORMA2 / §FORMA-SCENE-QUALITY (ADR-0089) — shadow strength now lives in
 * `FORMA_QUALITY.shadowDarkness` (formaSceneQuality.ts) so the "soft gradient
 * shadowing" look is tuned in one place alongside the fog/sky constants. The old
 * standalone `FORMA_SHADOW_DARKNESS = 0.30` (a harder cast) was superseded by the
 * slightly-lighter 0.34 there, which lets the PCF penumbra read as a falloff
 * gradient (founder's #1 ask) rather than a stark silhouette.
 */

/**
 * §A.21.D39#6 — GLASS translucency for window panels. The glazing inset is a
 * see-through blue-tinted material so you can read INTO the building through the
 * windows instead of meeting an opaque panel. The panel is also flagged
 * `ShadowMode.DISABLED` so the sun-path shadow pass casts THROUGH the glazing
 * (glass does not block light); the white shell + the opaque door leaf still cast
 * solid shadows.
 *
 * §A.21.D50 — WHY THE FOUNDER STILL SAW OPAQUE WINDOWS. Two compounding causes:
 *   1. The D43(c) `outline:false` translucency path was correct, BUT the glazing
 *      panel floats PROUD of the OPAQUE white shell (the shell sits ~5 cm behind
 *      it). A pale tint (#7FA8D8) at α=0.30 composited over solid white reads as a
 *      near-white, near-opaque panel — exactly the "not transparent" the founder
 *      reported. Lowering α makes it MORE white (wrong direction); a COOLER, more
 *      saturated glass tint at a slightly lower α reads as real tinted glazing that
 *      is visibly distinct from both the white shell and the opaque graphite doors.
 *   2. Cesium renders a translucent surface ONLY when both faces are not culled in
 *      a way that drops it; a single-sided flat panel viewed from behind vanishes.
 *      We keep the panel double-sided-safe by leaving `outline:false` (outlined
 *      geometry forces the OPAQUE pipeline) and using a dedicated glass tint here.
 * 0.26 + the cooler tint = clearly glass, clearly see-through-looking, never opaque.
 */
const FORMA_GLAZING_ALPHA = 0.26;

/**
 * §A.21.D-GLOBE3 (2026-06-08) — REAL app-scene fallback colours, mirrored from the
 * three.js BIM fragment builders so the building on the photoreal "3D globe" reads
 * in the SAME colours the editor 3D view shows for an un-finished element:
 *   • wall  → WallFragmentBuilder  `wall.materialColor ?? '#d4c5b0'` (warm plaster)
 *   • slab  → SlabFragmentBuilder  `data.materialColor || '#808080'` (grey)
 *   • roof  → RoofFragmentBuilder  `data.materialColor || '#c8a46e'` (tan)
 * These are used ONLY on the keepPhotoreal globe path; the Forma flat-ground study
 * keeps its abstract white massing palette (FORMA_PALETTE.proposedFill) unchanged.
 */
const BIM_DEFAULT_WALL_COLOUR = '#d4c5b0';
const BIM_DEFAULT_SLAB_COLOUR = '#808080';
const BIM_DEFAULT_ROOF_COLOUR = '#c8a46e';

// §SITE-METRIC-RADIUS-DECOUPLE (founder 2026-06-29, ADR-0079) — the DEFAULT analysis
// disc radius (m) for the metric heatmap, INDEPENDENT of camera/overlay framing. This
// is ≥ 2× the old prod default (~115 m), covering a real neighbourhood, and is the
// floor `siteMetricRadiusM()` clamps the massing-derived extent up to.
const DEFAULT_SITE_METRIC_RADIUS_M = 240;

export class CesiumViewport {
  private container: HTMLDivElement;
  private viewer: Cesium.Viewer | null = null;
  private handler: Cesium.ScreenSpaceEventHandler | null = null;
  private currentModel: Cesium.Model | null = null;
  /** §A.21.D49 — the REAL detailed PRYZM model (the BIM scene serialised to glTF)
   *  placed on the PHOTOREAL globe, kept separate from `currentModel` (which the
   *  transform gizmo / legacy place-on-Earth path own) so the two never clobber
   *  each other. Replaced on each `renderRealModelOnGlobe`; dropped on dispose. */
  private realModelOnGlobe: Cesium.Model | null = null;
  /** §A.21.D49 — the object URL backing `realModelOnGlobe`, revoked when the model
   *  is replaced/dropped so per-toggle GLB blobs don't leak. */
  private realModelOnGlobeUrl: string | null = null;
  /** §A.21.D49 — the site origin of the placed real model, so the async photoreal
   *  tile clamp can RE-SEAT it (cheap modelMatrix update, no GLB reload) once
   *  `formaTerrainBaseHeight` settles. */
  private realModelOnGlobeOrigin: { lat: number; lon: number } | null = null;

  // ---- FORMA.6 — REAL full-fidelity building on the FORMA (flat-ground) study ----
  /** FORMA.6 — building fidelity on the FORMA flat-ground study view:
   *   • 'real'    (default — founder's ask) = the live PRYZM BIM scene serialised
   *     to glTF and placed as a native Cesium.Model (every element: walls with CSG
   *     openings, windows, doors, roof, slabs, furniture, stairs — full fidelity),
   *     replacing the abstract pastel massing blocks.
   *   • 'massing' = the existing abstract white/pastel volume study (still reachable
   *     for the massing-study workflow).
   *  Toggled via `setFormaBuildingFidelity`. */
  private formaBuildingFidelity: 'massing' | 'real' = 'real';
  /** FORMA.6 — the REAL detailed PRYZM model placed on the FORMA flat-ground study
   *  (kept SEPARATE from `realModelOnGlobe`, which is the photoreal-globe overlay,
   *  so the two views never clobber each other's primitive). Replaced on each
   *  `renderRealModelOnForma`; dropped on dispose / fidelity→massing. */
  private realModelOnForma: Cesium.Model | null = null;
  /** FORMA.6 — the object URL backing `realModelOnForma`, revoked when replaced/dropped. */
  private realModelOnFormaUrl: string | null = null;
  /** FORMA.6 — the site origin of the placed Forma real model, so the async terrain
   *  clamp can RE-SEAT it (cheap modelMatrix update, no GLB reload) once
   *  `formaTerrainBaseHeight` settles. */
  private realModelOnFormaOrigin: { lat: number; lon: number } | null = null;
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
  /** §FORMA-AO-OPT-IN (ADR-0087) — whether AO is wanted at all this session.
   *  Defaults OFF (the AO shader crashes on some GPUs); set true via
   *  `window.__pryzmFormaAO` before mount to opt in. */
  private formaAoOptIn = FORMA_AO_DEFAULT_ENABLED;
  /** §FORMA-RENDER-ERROR-GUARD (ADR-0087) — set once the post-process shader has
   *  faulted, so we never re-enable AO/silhouette after Cesium reported a
   *  render error for them (avoids a crash → disable → re-enable → crash loop). */
  private formaPostProcessFaulted = false;
  /** §ENVELOPE-VIA-MASSING (L-402d) — a STABLE per-instance id so the render
   *  diagnostics can prove the envelope/massing entities land in the SAME viewer
   *  the camera framed (a paned re-parent must never split the two). */
  private static instanceSeq = 0;
  private readonly instanceId = `cvp-${(CesiumViewport.instanceSeq++)}`;
  /** Disposer for the `scene.renderError` subscription (called on dispose). */
  private renderErrorSub: (() => void) | null = null;
  /** §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — remover for the canvas
   *  webglcontextlost/restored listeners (called on dispose). */
  private contextLossSub: (() => void) | null = null;
  /** §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — re-entrancy guard so a burst of
   *  render-errors / context-loss events triggers at most ONE re-init at a time. */
  private gpuRecoveryInFlight = false;
  /** §FORMA-SCENE-QUALITY (ADR-0089) — the container's `style.background` captured
   *  the first time the Forma sky-gradient backdrop is applied, restored when the
   *  gradient is cleared (leaving Forma) so the photoreal/globe path gets its
   *  original opaque container background back. `null` = no backdrop applied. */
  private formaPrevContainerBg: string | null = null;

  // ---- FORMA.3 — authored-massing entity placement state ----
  /** Entities placed for the authored massing (proposed buildings + boundary),
   *  so a re-render can clear the previous set before placing the new one. */
  private formaMassingEntities: Cesium.Entity[] = [];
  /**
   * §SITE-OVERLAY-NOT-BUILDING (L-464) — the subset of `formaMassingEntities` that is SITE
   * CONTEXT (buildable envelope, parcel boundary) rather than the proposed BUILDING.
   *
   * They share the massing array so they share its CLEAR lifecycle — that part was right — but
   * they must NOT share its SHOW/HIDE lifecycle: the site constraint does not stop applying
   * because the proposal is being re-drawn or the ground datum is still resolving.
   * `setGlobeBuildingShown` skips everything in here.
   */
  private formaSiteOverlayEntities = new Set<Cesium.Entity>();
  /** The last-known site lat/lon (= ENU anchor) + the boundary centroid (in ENU
   *  metres) + plot area the massing was placed against — used by the
   *  "Zoom to Site" / "Reset View" affordance to repeat the NW oblique flyTo. */
  private formaMassingOrigin:
    | { lat: number; lon: number; centroidEast: number; centroidNorth: number; areaM2: number }
    | null = null;
  /** §FLY-TOUR — re-entrancy guard so a second click can't start a tour while one
   *  is mid-flight (the chained flyTo promises would fight over the camera). */
  private _flyTourRunning = false;

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

  // §ANALYSIS-REAL-* (ADR-0095) — per-site (rounded lat/lon) guards so we schedule the
  // real-data fetch + one repaint per site once, not on every metric repaint (avoids a
  // fetch/repaint loop). The fetchers themselves cache + de-dupe; these only gate the
  // "kick + repaint-when-landed" scheduling.
  private realDataKickedClimate = new Set<string>();
  private realDataKickedPop = new Set<string>();

  // ---- FORMA.4 — coordinate bridge: terrain clamp + live-update cache ----
  /** Ground height (metres above the ellipsoid) sampled at the boundary
   *  centroid, used as the Z base of every extrusion + the boundary overlay so
   *  buildings sit on sloped ground. 0 until a terrain sample succeeds. */
  private formaTerrainBaseHeight = 0;
  /**
   * §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — has the GLOBE ground datum actually
   * been RESOLVED (a measurement), as opposed to still sitting at the `formaTerrainBaseHeight
   * = 0` INITIAL VALUE? `0` is the WGS-84 ELLIPSOID, not sea level and not the photoreal tile
   * surface (≈ +49 m of geoid separation in the Balearics alone), so "base is 0" and "the
   * ground is unknown" were indistinguishable — and the code treated the second as the first.
   * This flag makes the distinction explicit: while it is FALSE and photoreal tiles are the
   * visible ground, the building is HELD HIDDEN rather than buried at ellipsoid 0 (C12 §1.4).
   */
  private globeGroundResolved = false;
  /** L-259 — where the resolved ground height came from (for the anchor evidence log). */
  private globeGroundSource: GlobeGroundAnchor['source'] = 'unresolved';
  /** L-259 — true while the globe building is hidden PURELY because the ground datum is
   *  unresolved (so the reveal is idempotent and never fights the floor filter). */
  private globeBuildingHiddenForGround = false;
  /** L-259 — the tileset load-event hook is attached at most once per tileset. */
  private photorealTilesLoadedHookAttached = false;

  // ── §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — the GROUND-SETTLE readiness signal ──
  //
  // The view-activation loading overlay must dismiss on a REAL signal, never a timer. The
  // signal ALREADY EXISTS: L-259 built the whole "is the ground datum known?" machinery
  // (resolveGlobeGroundAnchor → decideGroundAnchorAction → seat-and-reveal / hold-hidden-
  // retry / reveal-unknown-datum-warn). We EXPOSE it rather than invent a second notion.
  //
  // Every TERMINAL of both clamp paths (photoreal tile clamp AND bare terrain clamp) funnels
  // through `reframeAfterBaseSettle()` — seat-and-reveal, base-unchanged, centroid-unchanged,
  // retries-exhausted, and the crash-guard catch. `hold-hidden-retry` deliberately does NOT
  // reach it (the tiles are still streaming — that is exactly when the overlay must stay up).
  // So `reframeAfterBaseSettle` IS the settle chokepoint, and we notify from there.
  //
  // NOT EVERY path reaches it: a superseded placement token or a viewer torn down mid-await
  // bails silently. That is precisely why the CONSUMER runs a progress-stall watchdog and can
  // fail visibly — a readiness signal that never arrives must never trap the user.
  /** True while an async ground clamp is in flight for the current placement. */
  private groundClampInFlight = false;
  /** Callers awaiting the ground-settle signal (drained on settle, and on dispose). */
  private groundSettleWaiters: Array<(s: GroundSettleSignal) => void> = [];
  /** Last globe-tile queue length reported by Cesium's own tileLoadProgressEvent. */
  private lastGlobeTileQueue = 0;
  /** The (lat,lon) the terrain height was last sampled at — so a live-update
   *  only re-samples terrain when the centroid actually moves (SPEC §4.6 /
   *  task #2 "re-clamp terrain only when the centroid changes"). */
  private formaTerrainSampledAt: { lat: number; lon: number } | null = null;
  /** One-time guard so the "terrain sample failed → base 0" warning logs once. */
  private formaTerrainWarned = false;
  /** Monotonic token serialising overlapping async terrain samples — only the
   *  latest placement's clamp is allowed to commit (newer placement wins). */
  private formaTerrainToken = 0;
  /** §TERRAIN-RENDER (Phase 3) — the city whose baked quantized-mesh terrain provider is
   *  currently attached to the viewer (`null` = default flat EllipsoidTerrainProvider). */
  private formaTerrainCity: string | null = null;
  /** §TERRAIN-SEAT-RACE (L-635) — the in-flight (or resolved) baked-terrain attach per city. Concurrent
   *  callers `await` the SAME attach so none samples the flat ellipsoid before the provider is live (the
   *  seat-at-0-under-700 m-terrain sink bug). A resolved entry (attached OR 404-no-op) also stops re-hammering
   *  the network on repeat pans — it replaces the old fire-once `formaTerrainProbedCities` Set. Cleared on
   *  dispose (project switch) and on a terrain toggle-ON re-probe. */
  private formaTerrainAttach = new Map<string, Promise<void>>();
  /** §TERRAIN-TOGGLE (founder 2026-07-27) — the user TERRAIN ON/OFF escape hatch for the 3D Site.
   *  Default TRUE — terrain is mandatory for ALL cities (founder). The terrain-ON seat/camera bug on
   *  high-ground cities (Madrid/Zürich/Amsterdam) is being FIXED, not worked around by defaulting off.
   *  We keep it ON so the `[CTX-TERRAIN-GAP]` diagnostic below measures the real terrain-on state
   *  (are the context buildings sitting BELOW the terrain surface, and by how much) on every open. */
  private formaTerrainEnabled = true;
  /** §CESIUM-REALMODEL-TOKEN — monotonic tokens serialising overlapping async
   *  real-model placements (GLB export → `Cesium.Model.fromGltfAsync` → add). Two
   *  rapid view toggles could each await the model load and BOTH add a primitive
   *  (duplicate / stale model) — `clearRealModelOn*` alone is last-write-wins and
   *  cannot see that a NEWER placement started after this one's await began. Each
   *  render bumps its token at the start, captures `myToken` locally, and bails
   *  after the await (before mutating the scene) when a newer placement superseded
   *  it — mirroring the `formaTerrainToken` guard. Separate Forma/Globe tokens
   *  because the two views track SEPARATE primitives and can place independently. */
  private realModelOnFormaToken = 0;
  private realModelOnGlobeToken = 0;
  /** §GLOBE-FIRST-FRAME-BASE — the initial camera framing (`frameCentroid:true`)
   *  fires SYNCHRONOUSLY in `renderFormaMassing`, BEFORE the async terrain/tile
   *  height sample has resolved, so it frames at the stale `formaTerrainBaseHeight`
   *  (0 m on the very first activation). When the site sits on non-zero terrain
   *  (e.g. base ≈ 382 m) that frames the camera ~382 m BELOW the building → the
   *  globe opens BLACK / underground (a second activation then works because the
   *  base is already resolved). This flag records that an initial framing happened
   *  against an unresolved base; the async clamp re-issues the SAME framing once it
   *  settles the real base, so the first activation lands looking at the building.
   *  Carries the preset so the re-frame matches the original (oblique vs plan). */
  private formaReframeOnBaseSettle: 'oblique' | 'plan' | null = null;
  /** §GLOBE-FRAME-NO-JUMP — TRUE once the initial "open already framed on the
   *  building" re-fly has fired for the current placement run. The async tile/terrain
   *  clamp can settle the base height MORE THAN ONCE (photoreal tiles stream in
   *  progressively, each re-place can re-sample a slightly different surface height),
   *  and the old §GLOBE-FIRST-FRAME-BASE-ROBUST block re-flew UNCONDITIONALLY on every
   *  such settle → the camera was yanked back to the site repeatedly (the founder's
   *  "jumps off / flies away" regression). This latch makes the corrective re-frame
   *  fire AT MOST ONCE per framing placement. Re-armed by a fresh `frameCentroid` open
   *  in `renderFormaMassing`. */
  private formaInitialReframeFired = false;
  /** §GLOBE-FRAME-NO-JUMP — TRUE once the USER has driven the camera themselves (a
   *  drag/zoom that did NOT originate from one of our own programmatic `flyTo`s).
   *  Once the user has taken control we must NEVER re-fly them back to the site on a
   *  late base-settle — that would override their view. Distinguished from our own
   *  flights via `formaProgrammaticFlyInFlight`. Reset on each fresh framing open. */
  private formaUserMovedCamera = false;
  /** §GLOBE-SITE-IN-VIEW (L-635) — bounded one-shot "rescue" reframe: after the first frame has fired,
   *  if the site is STILL off-screen (stale/underground frame) we reframe ONCE more, then latch this so
   *  we never loop or fight a user. Reset with `formaInitialReframeFired` on every fresh site-open. */
  private formaOffscreenRescueUsed = false;
  /** §GLOBE-FRAME-NO-JUMP — TRUE while one of our own `flyToFormaSite/Plan` flights
   *  is in progress, so the `moveStart`/`moveEnd` camera listeners can tell our
   *  programmatic motion apart from genuine user input (only the latter sets
   *  `formaUserMovedCamera`). */
  private formaProgrammaticFlyInFlight = false;
  /** §FEAT-GLOBE-DEFAULT-AUTOFRAME (L-226) — generation token for the in-flight flag.
   *  `formaProgrammaticFlyInFlight` was a bare boolean shared by EVERY programmatic
   *  flight (the cinematic site-arrival, `flyToFormaSite`, `flyToModelBoundingSphere`).
   *  Cesium CANCELS an in-progress camera tween when a new `flyTo`/`flyToBoundingSphere`
   *  starts, firing the OLD flight's `cancel` callback — which cleared the shared flag to
   *  `false` even though the NEWER flight it was just replaced by is still gliding. The
   *  new flight's `moveStart` then fired with the flag falsely cleared, so the listener
   *  mis-latched `formaUserMovedCamera = true`; the later tile-base settle then saw the
   *  "user moved" latch and SUPPRESSED the one corrective re-frame — stranding the camera
   *  at the base-0 frame (founder: default globe points at Z=0 / sea level; had to click
   *  Zoom to Site). Token-gating makes a stale flight's teardown a NO-OP: only the MOST
   *  RECENT flight may release the flag. Mirrors the existing `formaTerrainToken` idiom. */
  private formaFlyToken = 0;

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

  // ---- §SITE-METRIC-HEATMAP — Hektar/Forma-style switchable ground heatmap ----
  /** Entities for the active site-metric ground heatmap (its own layer so it can
   *  be cleared independently of the sun-path/wind/heat climate overlays). */
  private siteMetricEntities: Cesium.Entity[] = [];
  /** The metric currently shown as a ground heatmap, or null (off). 'daylight' is
   *  BIM-view-only; the others (sun hours / temperature / wind / population) draw. */
  private siteMetricActive: SiteMetric | null = null;
  /** Analysis-day preset for the sun-hours ground heatmap (Forma pattern). */
  private siteMetricSunDay: 'summer' | 'winter' | 'equinox' = 'summer';
  /** §SITE-METRIC-RADIUS-DECOUPLE — explicit analysis-disc radius (m), or null = the
   *  decoupled default. Set via `setSiteMetricRadiusOverride` (future slider). */
  private siteMetricRadiusOverrideM: number | null = null;
  /** Cancellers for the in-flight CHUNKED metric build (cleared/cancelled on every
   *  re-render + dispose so a stale build never paints over a newer one). */
  private siteMetricChunkCancellers: DeferWorkCanceller[] = [];
  /** Monotonic build token — a chunk callback bails if a newer build superseded it. */
  private siteMetricBuildSeq = 0;
  /** §CESIUM-PERF-METRIC-TEXTURE-CACHE (2026-07-01) — the rasterised heatmap texture,
   *  cached per (metric · rounded origin · sun-day · radius). Switching BACK to a
   *  previously-computed metric then re-paints the cached texture in ONE draw instead
   *  of re-running the 512×512 raster over ~3700 cells (and, for sun-hours/daylight,
   *  the chunked per-cell raycast). Invalidated on site-location / massing-origin /
   *  sun-day change so a stale field never shows. `paintMetricTexture` still builds a
   *  fresh canvas per paint (canvases aren't reusable across removed entities), but the
   *  expensive COMPUTE is skipped. */
  private siteMetricTextureCache = new Map<string, MetricTexture>();

  // ---- §FORMA-FACADE-ANALYSIS (ADR-0093) — sun-hours on the DESIGNED building ----
  /** ON-demand façade analysis toggle (DEFAULT OFF — analysis paints only on the
   *  ground until the user turns this on). When ON AND the active metric is sun-hours,
   *  the designed building's outer façade + roof are coloured by direct sun-hours. */
  private facadeAnalysisOn = false;
  /** Coloured façade quad entities (own layer — cleared independently). */
  private facadeAnalysisEntities: Cesium.Entity[] = [];
  /** Cancellers for the in-flight CHUNKED façade build. */
  private facadeAnalysisChunkCancellers: DeferWorkCanceller[] = [];
  /** Monotonic façade build token — a chunk bails if a newer build superseded it. */
  private facadeAnalysisBuildSeq = 0;
  /** §PERF-SUNHOURS-NO-RECOMPUTE (L-143) — the (geometry · occluders · sun-day) signature
   *  of the LAST painted façade study. `renderFacadeAnalysis` skips the whole per-point
   *  raycast when this is unchanged AND the entities are still present, so a massing
   *  re-render / repaint that doesn't actually change the façade never recomputes. Reset
   *  to null by `clearFacadeAnalysis` so a genuine clear always forces a fresh build. */
  private facadeAnalysisLastKey: string | null = null;
  /** §FORMA-FACADE-VISIBLE (founder 2026-07-01) — TRUE while the normal building
   *  materials (massing blocks + real GLB) are being SUPPRESSED so ONLY the sun-hours
   *  façade texture reads on the tower ("once façade analysis is on only those colours
   *  should render"). Set when the analysis paints, cleared when it's turned OFF, so the
   *  suppression is fully reversible and the floor-filter respects it. */
  private facadeSuppressingMassing = false;
  /** §FIX-FACADE-ANALYSIS-ON-REAL-MODEL (L-177, founder-escalated) — TRUE while the
   *  sun-hours study is DRAPED onto the REAL GLB model via a Cesium CustomShader (the
   *  analysis colours the real house's own faces, no separate envelope prism). When true,
   *  the real model stays VISIBLE (not suppressed) and NO façade polygon entities are
   *  painted. Cleared when the analysis is turned off / the model is dropped. */
  private facadeDrapingRealModel = false;

  /** The last OSM context collection (footprints + heights, lon/lat) so the
   *  population/wind/heat grids can read built density. Captured on context load. */
  private lastContextCollection: ContextBuildingCollection | null = null;

  // ---- MAP-DATA-OVERTURE — context-building (surrounding massing) state ----
  /** Cesium entities placed for the surrounding OSM/Overture context buildings,
   *  so a refresh / location change can clear the previous set. */
  private contextBuildingEntities: Cesium.Entity[] = [];
  /** §PLOT-CLEAR-ENVELOPE (L-418) — each PLACED context entity paired with the OSM
   *  footprint FEATURE it was drawn from (near + far rings), so a LATER parcel commit
   *  can RE-APPLY the plot-clear to the ALREADY-PLACED context (hide the on-plot
   *  building) WITHOUT a context re-fetch. WHY THIS EXISTS: the placement-time filter
   *  (loadContextBuildings) only fires when context is (re)placed; when the parcel is
   *  committed AFTER context is already on screen — the "select a parcel from
   *  already-loaded 3D context" flow — nothing re-filtered the existing entities, so the
   *  opaque on-plot building stayed and OCCLUDED the translucent #6600FF buildable
   *  envelope (founder: "the building from context data should disappear so I can see the
   *  purple envelope"). Kept in placement order; feature refs are the SAME objects
   *  `partitionFootprintsByParcel` returns, so reference-identity membership classifies
   *  them (handles duplicate osmIds from multipolygon relations). Reset in
   *  clearContextBuildings alongside `contextBuildingEntities`. */
  private contextBuildingPlacements: Array<{ entity: Cesium.Entity; feature: ContextBuildingFeature }> = [];
  /**
   * §CTX-QUERY-PANEL (L-592) — O(1) entity → feature lookup for the LEFT_CLICK pick.
   *
   * A linear scan of `contextBuildingPlacements` would be ~10k comparisons per click, which is
   * survivable, but the pick handler runs on the founder's WebGL-fallback box with up to ~9,762
   * footprints placed and this is the one lookup on the interaction path. Maintained in lock-step
   * with `contextBuildingPlacements` at BOTH push sites (near + far ring) and cleared with it in
   * `clearContextBuildings` — if the two ever diverge the panel simply does not open (a miss is a
   * no-op, never a wrong building).
   */
  private contextFeatureByEntity = new Map<Cesium.Entity, ContextBuildingFeature>();
  /** §CTX-QUERY-PANEL (L-592) — the read-only info panel DOM, or null when nothing is picked. */
  private contextQueryPanel: HTMLElement | null = null;
  /** §CTX-QUERY-PANEL (L-592) — the yellow rim drawn round the picked footprint (one entity). */
  private contextQueryHighlight: Cesium.Entity | null = null;
  /**
   * §CTX-USE-COLOUR (L-599) — is the use-colouring MODE on? DEFAULT OFF.
   *
   * ⚠ A MODE, never a permanent repaint: the scene's massing semantics (proposed = #6600FF,
   * context = off-white `FORMA_PALETTE.contextFill`, unknown-height = translucent + cooler) are
   * load-bearing, so turning this off must restore EXACTLY the previous appearance — which is why
   * `contextUseMaterialBackup` snapshots the real material objects rather than recomputing them.
   */
  private contextUseColourOn = false;
  /** §CTX-USE-COLOUR (L-599) — the pre-colouring material of every entity this mode repainted. */
  private contextUseMaterialBackup = new Map<Cesium.Entity, Cesium.MaterialProperty>();
  /** §CTX-USE-COLOUR (L-599) — the legend DOM (a colour with no legend is an uninterpreted fact). */
  private contextUseLegendEl: HTMLElement | null = null;
  /**
   * §FACADE-STUDY-SUBJECT (L-596) — WHAT the sun study runs on. DEFAULT 'building' (unchanged
   * behaviour). 'envelope' is an EXPLICIT user choice and is labelled on screen for as long as it
   * paints; it is NEVER selected automatically as a fallback (that is the L-272 defect).
   */
  private facadeStudySubject: FacadeStudySubject = 'building';
  /** §FACADE-STUDY-SUBJECT (L-596) — the "ENVELOPE STUDY" badge DOM while such a study is shown. */
  private facadeSubjectBadge: HTMLElement | null = null;

  /**
   * §CTX-LOADING-BADGE (L-524b) — the "surrounding buildings are still coming" indicator.
   *
   * Founder, after v259 made context noticeably faster: *"still not enough — could you add a
   * loading layer whenever there is no context buildings?"* Correct instinct, and it is an HONESTY
   * fix as much as a UX one. An empty 3D Site is AMBIGUOUS: "still fetching", "this area genuinely
   * has no buildings", and "the fetch failed" all render as the same blank ground, and the user
   * cannot tell which — the same failure/empty conflation the context-data honesty family
   * (L-422/L-457/L-467/L-469) keeps producing, surfaced at the UI instead of in the data.
   *
   * Deliberately a small badge, NOT the full-screen `LoadingOverlayController`: the site,
   * the parcel and the envelope are already useful and interactive before the neighbourhood
   * arrives, so blocking the view would be a downgrade. Context is a progressive enhancement and
   * the indicator should say so.
   *
   * §CTX-BADGE-TOP-CENTRE (L-524c) — it shipped at bottom-left and was INVISIBLE in practice, so
   * the honesty fix above never actually reached the founder's eye. Bottom-left is a contested
   * corner in this viewport, by TWO independent occupants:
   *   1. Cesium renders `.cesium-widget-credits` there by default (inside the widget, i.e. inside
   *      `this.container`), and
   *   2. `initScene.ts` mounts the "3D detail" control at `position:fixed; bottom:12px; left:12px;
   *      z-index:40` — `fixed`, so it escapes this container entirely, and z-40 > the badge's z-30.
   * MOVING it is the entire fix — raising z-index CANNOT work here, and it is worth writing down
   * why so nobody "fixes" this again with a bigger number. `this.container` sets an explicit
   * `z-index: CESIUM_Z (15)`, which makes it a STACKING CONTEXT: every z-index inside is resolved
   * against its siblings *within* the container, then the whole container competes with the page
   * as a single unit at 15. So a `position:fixed` control at z-40 sits above this badge no matter
   * what value the badge carries. The z-41 below is therefore scoped to the container's own
   * children (the Cesium widget and its credits) — correct and useful there, and deliberately not
   * load-bearing for the overlap that caused the bug.
   *
   * Top-centre is unoccupied in this container (the only other child is the Cesium widget). A
   * diagnostic nobody can see is worse than no diagnostic, because a hidden "loading" badge reads
   * as "nothing is loading" — the very failure/empty conflation this badge exists to break.
   */
  private contextLoadingBadge: HTMLDivElement | null = null;

  /** Show/hide the badge. Idempotent, never throws — a diagnostic affordance must not be able to
   *  break the viewport (the §DECOUPLE-ENVELOPE-FROM-CONTEXT lesson). */
  private setContextLoadingVisible(show: boolean, label = 'Loading surrounding buildings…'): void {
    try {
      if (show) {
        if (!this.contextLoadingBadge) {
          const el = document.createElement('div');
          el.setAttribute('data-testid', 'pryzm-context-loading-badge');
          Object.assign(el.style, {
            position: 'absolute', left: '50%', top: '12px',
            transform: 'translateX(-50%)', zIndex: '41',
            display: 'flex', alignItems: 'center', gap: '8px',
            whiteSpace: 'nowrap',
            padding: '7px 12px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.94)', color: '#6600FF',
            font: '500 12px/1.2 system-ui, sans-serif',
            boxShadow: '0 1px 6px rgba(0,0,0,0.14)', pointerEvents: 'none',
          } satisfies Partial<CSSStyleDeclaration>);
          const dot = document.createElement('span');
          Object.assign(dot.style, {
            width: '8px', height: '8px', borderRadius: '50%', background: '#6600FF',
            animation: 'pryzmCtxPulse 1s ease-in-out infinite',
          } satisfies Partial<CSSStyleDeclaration>);
          if (!document.getElementById('pryzm-ctx-badge-kf')) {
            const kf = document.createElement('style');
            kf.id = 'pryzm-ctx-badge-kf';
            kf.textContent = '@keyframes pryzmCtxPulse{0%,100%{opacity:1}50%{opacity:0.25}}';
            document.head.appendChild(kf);
          }
          el.appendChild(dot);
          el.appendChild(document.createTextNode(label));
          this.container.appendChild(el);
          this.contextLoadingBadge = el;
        } else {
          this.contextLoadingBadge.lastChild!.textContent = label;
        }
      } else if (this.contextLoadingBadge) {
        this.contextLoadingBadge.remove();
        this.contextLoadingBadge = null;
      }
    } catch { /* never allowed to affect the render */ }
  }
  /** The (lat,lon) the context buildings were last loaded for — skip a refetch
   *  when the site hasn't moved (the loader also caches per bbox). */
  private contextBuildingsAt: { lat: number; lon: number } | null = null;
  /** §PLOT-CLEAR-ENVELOPE (L-402c) — the committed working-plot (parcel) boundary
   *  projected to [lon,lat], captured on the last renderFormaMassing. loadContextBuildings
   *  removes any OSM footprint sitting ON this plot (the building the user is replacing)
   *  so the translucent #6600FF buildable-envelope study volume reads on a clear plot.
   *  Null = no parcel committed → nothing suppressed (unchanged behaviour). */
  private committedParcelLonLat: Array<[number, number]> | null = null;
  /** §CTX-PAN-DEBOUNCE (L-402c) — epoch-ms of the last context (re)load, so a pan can't
   *  trigger repeated multi-second Overpass reloads while the camera is framed on the plot. */
  private contextLastLoadAtMs = 0;
  /** FORMA-CTX §22.2 — OSM road centre-line polylines (visual-only context). */
  private contextRoadEntities: Cesium.Entity[] = [];
  private contextRoadsAbort: AbortController | null = null;
  /** FORMA-CTX-WATER — OSM water polygons + waterway polylines (visual-only). */
  private contextWaterEntities: Cesium.Entity[] = [];
  private contextWaterAbort: AbortController | null = null;
  /** §FORMA-CTX-PARKS — OSM park / green-space polygons (visual-only context). */
  private contextParkEntities: Cesium.Entity[] = [];
  private contextParkAbort: AbortController | null = null;
  private contextLanduseEntities: Cesium.Entity[] = [];
  private contextLanduseAbort: AbortController | null = null;
  /** Abort handle for an in-flight context-building fetch (cancelled on a newer
   *  load / dispose so a stale response can't repaint the wrong site). */
  private contextBuildingsAbort: AbortController | null = null;
  /** One-time guard so the "context buildings unavailable" warning logs once. */
  private contextBuildingsWarned = false;
  // §SITEFRAME-GROUND-RESEAT (L-632) → §CTX-BUILDINGS-RENDER-FIRST (L-635) — the one-shot
  // terrain-settle re-seat and its `tileLoadProgressEvent` listener are PULLED: the re-fetch they
  // drove blanked/raced Madrid context (see `armContextTerrainReseat`). No listener state remains.
  /** §A.21.D-GLOBE (2026-06-05) — debounce handle for the pan-driven context-building
   *  refresh so a flurry of camera moves coalesces into one Overpass fetch. */
  private contextPanRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  /** §A.21.D-GLOBE3 (2026-06-08) — TRUE once a Google Photorealistic 3D-Tiles
   *  primitive actually loaded at mount (ion-token OR google-key path). When the
   *  photoreal tiles ARE present they already supply real photoreal buildings for
   *  the area, so PRYZM's OWN extruded OSM/Overpass context boxes would DUPLICATE +
   *  overlap them. We therefore SUPPRESS (and tear down) our context extrusions on
   *  the photoreal "3D globe" path and only render them in the KEYLESS fallback
   *  (ESRI satellite / no 3D buildings) where they are the only surrounding context. */
  private photorealTilesActive = false;

  /** §GLOBE-TILE-CLAMP-FLUSH (founder 2026-07-01, ADR-0095) — the actual loaded Google
   *  Photorealistic 3D-Tiles primitive, kept so the height clamp can (a) hit ONLY the
   *  tiles via `scene.clampToHeightMostDetailed(..., [thisTileset])`-style exclusion of
   *  everything else and (b) fall back to the tileset's own root bounding-sphere / boundingSphere
   *  ground height when the picking APIs return 0 on the keyless ellipsoid (no geoid terrain
   *  provider → ellipsoid-height 0 ≠ the visible NYC street surface which is tens of metres up). */
  private photorealTileset: Cesium.Cesium3DTileset | null = null;

  // §FIX-GLOBE-CLAMP-TO-PHOTOREAL-TILES (L-179, 2026-07-06) — the ion World Terrain
  // sample provider (`photorealTerrainProvider` / `photorealTerrainLoadTried`) added by
  // §GLOBE-TERRAIN-HEIGHT (bd23f6a3) is REMOVED. On the photoreal "3D globe" the building
  // must sit on the SAME surface it is depth-tested against — the loaded Google
  // Photorealistic 3D-Tiles mesh — not on a bare-earth terrain sample whose vertical datum
  // is independent of the tiles. Preferring World Terrain (a) re-introduced the L-142
  // 727 m-underground regression when the two datums disagree, and (b) opened an async
  // network await whose token-abort race left the base at flat 0 → the model buried
  // ~650 m under Madrid's photoreal ground. The globe now clamps ONLY to the tile surface
  // (see `clampToPhotorealTilesThenReplace`). No ion terrain host, no CSP change.

  /**
   * Phase B (S73-WIRE) — runtime threaded by parent.
   *
   * §L-446 — NO LONGER `readonly`. It was a construct-time snapshot, and the §L-446 probe
   * proved that snapshot is `null` in production:
   *
   *     [§L-446] runtime=NULL siteModelStore=MISSING getLocation=MISSING
   *              location=NULL trueNorth=undefined
   *
   * The viewport is built inside a lazy `Promise.all([...])` import, which can resolve before
   * the parent holds a runtime. Because the field was `readonly` and assigned once, a null at
   * that instant was PERMANENT — so `readProjectNorthRad()` returned 0 forever, and
   * `enuFrameWithProjectNorth` short-circuited to the bare ENU frame on every call.
   *
   * That is the whole rotation defect. θ was being produced correctly the entire time
   * (`site Project North set → θ = 44.65°` in the same session) — the viewport simply could
   * not see it. Every sign, axis and matrix I verified was right; they were multiplying a θ
   * that was always zero.
   *
   * Now late-injectable via {@link setRuntime} so the viewport HEALS the moment a runtime
   * exists, instead of being permanently deaf to it.
   */
  public runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

  /**
   * §L-446 — inject the runtime after construction.
   *
   * Idempotent and NEVER downgrades a live runtime to null: a later call with null must not
   * undo a successful injection, or the viewport would silently regress to θ = 0 and the
   * rotation bug would return intermittently — far harder to diagnose than the original.
   */
  public setRuntime(
    rt: import('@pryzm/runtime-composer/types').PryzmRuntime | null,
  ): void {
    if (!rt || this.runtime === rt) return;
    const wasNull = this.runtime === null;
    this.runtime = rt;
    if (wasNull) {
      // Re-arm the diagnostic: a θ of 0 AFTER healing is a genuinely different claim from a
      // θ of 0 caused by the null runtime, and must be re-reported rather than stay latched.
      CesiumViewport._projNorthDiagWarned = false;
      console.log(
        '[CesiumViewport][§L-446] runtime injected post-construction — project north is now ' +
        'readable (it was NULL at construction, which forced θ = 0 and rendered the model in ' +
        'PROJECT space on a TRUE-north globe).',
      );
    }
  }

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
   * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — resolves once the async GROUND CLAMP for
   * the placement currently in flight has reached a TERMINAL (§FIX-CESIUM-GLOBE-ELEVATION-
   * AND-GEOREF / L-259: seat-and-reveal, or the explicit give-up). This is the signal the
   * "3D globe" / "3D Site" loading overlay dismisses on — the building is anchored on ground
   * that has actually been MEASURED, which is exactly what L-259 proved you cannot assume.
   *
   * Resolves IMMEDIATELY when no clamp is in flight (nothing to wait for). Callers must
   * therefore issue the placement FIRST, then await this. `settled:false` means the viewport
   * was torn down mid-clamp — a FAILURE, to be surfaced, never waited on.
   */
  public whenGroundSettled(): Promise<GroundSettleSignal> {
    if (!this.groundClampInFlight) return Promise.resolve(this.groundSettleSnapshot());
    return new Promise<GroundSettleSignal>((resolve) => {
      this.groundSettleWaiters.push(resolve);
    });
  }

  /**
   * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — subscribe to Cesium's OWN tile-streaming
   * counters, so the loading overlay's progress bar advances on REAL data (tiles actually
   * downloaded / uploaded) rather than an indeterminate crawl. Emits an immediate snapshot,
   * then on every tile-load progress event from the globe surface and the photoreal tileset.
   * Returns an unsubscribe. Fully guarded: an old Cesium build without one of these events
   * simply contributes nothing (the consumer degrades to indeterminate, never to a lie).
   */
  public onTileLoadProgress(cb: (p: TileLoadProgress) => void): () => void {
    const disposers: Array<() => void> = [];
    const emit = (): void => {
      try { cb(this.tileLoadSnapshot()); } catch { /* a listener must never break Cesium */ }
    };
    try {
      const ev = this.viewer?.scene?.globe?.tileLoadProgressEvent as
        | { addEventListener?: (cb: (queued: number) => void) => (() => void) | undefined }
        | undefined;
      const off = ev?.addEventListener?.((queued: number) => {
        this.lastGlobeTileQueue = Number.isFinite(queued) ? Math.max(0, queued) : 0;
        emit();
      });
      if (typeof off === 'function') disposers.push(off);
    } catch { /* no globe tile event on this build */ }
    try {
      const ts = this.photorealTileset as unknown as {
        loadProgress?: { addEventListener?: (cb: () => void) => (() => void) | undefined };
        allTilesLoaded?: { addEventListener?: (cb: () => void) => (() => void) | undefined };
      } | null;
      const offA = ts?.loadProgress?.addEventListener?.(() => emit());
      if (typeof offA === 'function') disposers.push(offA);
      const offB = ts?.allTilesLoaded?.addEventListener?.(() => emit());
      if (typeof offB === 'function') disposers.push(offB);
    } catch { /* no tileset (Forma study / keyless) — globe events alone */ }
    emit();
    return () => {
      for (const d of disposers) {
        try { d(); } catch { /* best-effort */ }
      }
    };
  }

  /**
   * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — a SYNCHRONOUS poll of the same tile
   * counters `onTileLoadProgress` streams. Necessary because the viewer runs with
   * `requestRenderMode: true`: on a quiescent scene Cesium stops rendering, so tile-progress
   * EVENTS go quiet and an event-only readiness gate would wait for an event that never comes.
   * The counters themselves are plain synchronous reads.
   */
  public sampleTileLoadProgress(): TileLoadProgress {
    return this.tileLoadSnapshot();
  }

  /**
   * §SS-FIX-FORMA-TILES-READINESS-KEYLESS-GATE (L-327) — does this viewport have a REAL tile /
   * terrain provider that will actually STREAM tiles? The view-activation loading overlay gates
   * its `tiles` stage on Cesium's streaming counters reaching zero; on a keyless-ellipsoid
   * flat-ground Forma study the globe surface is HIDDEN (`globe.show === false`) and no photoreal
   * 3D tileset is attached ("no real terrain provider attached (keyless ellipsoid ground)"), so
   * tiles NEVER stream and the gate would sit until the 25 s stall watchdog fires a bogus "map
   * tiles stopped streaming" error on a view that is already ready.
   *
   * This lets the (Cesium-free, C01 §2) readiness state machine SKIP the tiles gate on that path
   * via the injected `ViewActivationSignals` port — WITHOUT importing Cesium. Returns TRUE when a
   * real streaming source exists:
   *   • an active photoreal 3D tileset (`photorealTilesActive`), OR
   *   • the globe surface shown (`globe.show !== false`) → imagery/terrain tiles stream.
   * Consistent with `tileLoadSnapshot()`, which treats a hidden globe as "tiles irrelevant".
   *
   * Span-free (a synchronous state read polled by the readiness chain — no async/IO; the P8 span
   * mandate targets new exported MODULE functions, not hot UI class getters).
   */
  public hasRealTileProvider(): boolean {
    try {
      // §L-371 — Forma massing mode ALWAYS renders its own flat neutral ground (keyless
      // ellipsoid, imagery layer hidden, no photoreal/terrain tileset streaming), so tiles
      // NEVER reach "loaded" here. This MUST be checked FIRST: a prior globe view leaves
      // `photorealTilesActive === true` (it is not reset on Forma re-entry), and the old order
      // returned that stale `true` before considering the mode → the readiness tiles-gate stayed
      // armed and stalled 25 s with a bogus "map tiles stopped streaming" on a Forma study that
      // is actually ready (the intermittent L-371 false-timeout; skips correctly only when the
      // probe happened to run with the stale flag already cleared). Forma mode is the
      // authoritative "there will never be streaming tiles" signal.
      if (this.formaMode) return false;
      if (this.photorealTilesActive) return true;
      const globe = this.viewer?.scene?.globe as { show?: boolean } | undefined;
      return !!globe && globe.show !== false;
    } catch {
      return false;
    }
  }

  /**
   * §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — THE INPUT GATE. The founder's requirement
   * is not cosmetic: "ONLY when everything is loaded and ready can the user jump in and
   * navigate". The overlay's backdrop already blocks pointer events by z-order, but a z-order
   * gate is a rendering accident, not a contract — so we ALSO disable Cesium's own camera
   * controller for the duration. Idempotent + guarded.
   */
  public setNavigationEnabled(on: boolean): void {
    try {
      const controller = this.viewer?.scene?.screenSpaceCameraController;
      if (!controller) return;
      controller.enableInputs = on;
    } catch { /* viewer torn down — nothing to gate */ }
  }

  /** L-270 — the ground-settle state RIGHT NOW (no clamp in flight → this is terminal). */
  private groundSettleSnapshot(): GroundSettleSignal {
    return {
      settled: true,
      source: this.globeGroundSource,
      baseHeightM: this.formaTerrainBaseHeight,
    };
  }

  /** L-270 — snapshot Cesium's own tile counters (photoreal tileset + globe surface queue). */
  private tileLoadSnapshot(): TileLoadProgress {
    let pending = this.lastGlobeTileQueue;
    let processing = 0;
    try {
      // `statistics` is present on every shipping Cesium3DTileset but is not in the bundled
      // .d.ts — feature-detect through unknown rather than pin a typings version.
      const stats = (this.photorealTileset as unknown as {
        statistics?: { numberOfPendingRequests?: number; numberOfTilesProcessing?: number };
      } | null)?.statistics;
      if (stats) {
        pending += Math.max(0, stats.numberOfPendingRequests ?? 0);
        processing += Math.max(0, stats.numberOfTilesProcessing ?? 0);
      }
    } catch { /* tileset gone */ }
    let globeLoaded = true;
    try {
      const g = this.viewer?.scene?.globe as { tilesLoaded?: boolean } | undefined;
      // `globe.show === false` in Forma mode → its tiles are irrelevant, treat as loaded.
      const globeShown = this.viewer?.scene?.globe?.show !== false;
      globeLoaded = !globeShown || (g?.tilesLoaded ?? true);
    } catch { /* viewer gone */ }
    let tilesetLoaded = true;
    try {
      const ts = this.photorealTileset as unknown as { tilesLoaded?: boolean } | null;
      tilesetLoaded = ts?.tilesLoaded ?? true;
    } catch { /* tileset gone */ }
    return {
      pending,
      processing,
      tilesLoaded: pending === 0 && processing === 0 && globeLoaded && tilesetLoaded,
    };
  }

  /**
   * L-270 — drain the ground-settle waiters. Called from `reframeAfterBaseSettle()` (the
   * chokepoint EVERY clamp terminal funnels through) and from `dispose()` (where the answer
   * is an honest `settled:false` — the consumer surfaces an error instead of hanging).
   */
  private notifyGroundSettled(settled: boolean): void {
    this.groundClampInFlight = false;
    const waiters = this.groundSettleWaiters;
    if (waiters.length === 0) return;
    this.groundSettleWaiters = [];
    const snapshot: GroundSettleSignal = settled
      ? this.groundSettleSnapshot()
      : { settled: false, source: this.globeGroundSource, baseHeightM: this.formaTerrainBaseHeight };
    for (const resolve of waiters) {
      try { resolve(snapshot); } catch { /* a waiter must never break the clamp */ }
    }
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

  /**
   * §GLOBE-CRASH-GUARD — TRUE only when the Cesium viewer is present AND not
   * destroyed. `dispose()` nulls `this.viewer` AFTER calling `viewer.destroy()`,
   * and Cesium fires `cancel` on in-flight `camera.flyTo`s + can emit `moveEnd`
   * DURING `destroy()` — at which point `this.viewer` is still non-null but the
   * underlying scene/camera is already torn down, so touching `camera`/`scene`
   * throws. Deferred callbacks (setTimeout retries, rAF resize, flyTo
   * complete/cancel, async base-settle clamps that resume after an `await`) must
   * gate on this, NOT a bare `this.viewer` null-check, so a quick open→close (or
   * a settle resolving on a torn-down viewer) degrades to a no-op instead of
   * crashing the viewport. Wrapped so even a Cesium-internal throw in
   * `isDestroyed()` is treated as "not live". */
  private isViewerLive(): boolean {
    const v = this.viewer;
    if (!v) return false;
    try {
      return !v.isDestroyed();
    } catch {
      return false;
    }
  }

  public async mount(): Promise<void> {
    if (this.viewer) {
      console.warn("CesiumViewer already exists — skipping mount.");
      return;
    }

    // §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (founder L-231) — GATE globe activation on the
    // BIM renderer being live. If the WebGPU device was just lost, the browser's GPU process
    // is mid-reset; constructing the Cesium Viewer NOW makes its first WebGL shader compile
    // fail ("Fragment shader failed to compile. Compile log: null") and Cesium halts behind a
    // dead-end "Rendering has stopped" panel with no recovery. `createRenderer` sets
    // `globalThis.__pryzmRendererRecovering` for the whole loss→rebind window; wait (bounded)
    // for it to clear so Cesium comes up against a settled GPU.
    await this._awaitRendererLive(12_000);

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
        // §FORMA-SCENE-QUALITY (ADR-0089) — request an ALPHA-capable WebGL context
        // so Forma mode can set `scene.backgroundColor = TRANSPARENT` and reveal the
        // soft CSS sky-GRADIENT painted on the container (a flat scene clear colour
        // can't be a gradient). Harmless to the photoreal path: geometry still draws
        // opaque, only the cleared background becomes see-through (and there the
        // container background is the brand-safe loading colour, never black). A GPU
        // that ignores `alpha:true` simply clears opaque to FORMA_PALETTE.background
        // (the no-alpha fallback) — clean neutral, no crash.
        contextOptions: { webgl: { alpha: true } },
        // §CESIUM-PERF-REQUEST-RENDER-MODE (2026-07-01) — render ON-DEMAND, not every
        // frame. Both Cesium views (photoreal globe + Forma massing) sit IDLE most of
        // the time — the camera parks, no entity changes — yet the default continuous
        // render loop redraws the whole scene 60×/s regardless, burning GPU (visible as
        // the heavy webgl-fallback footer). With `requestRenderMode` Cesium renders only
        // when the scene actually changes; Cesium AUTO-requests a render on camera
        // move/zoom/tilt, tileset load, and imagery-layer change, so interactive drag is
        // unaffected. Our OWN scene mutations (sun/shadow scrub, model placement, metric
        // overlay, context load, Forma toggle) ALREADY call `scene.requestRender()` at
        // ~40 sites — this flag simply stops the wasted idle frames between them.
        // `maximumRenderTimeChange` still forces a periodic redraw so the sun/atmosphere
        // stay correct if the simulation clock advances without an explicit request.
        requestRenderMode: true,
        maximumRenderTimeChange: 1.0,
        // No token → no default base imagery layer (zero ESRI/ion/Bing request).
        // Token present → omit so Cesium installs its default ion base layer.
        ...(photorealAvailable ? {} : { baseLayer: false as const }),
      });
      console.log(
        `[gis][cesium] imagery mode = ${photorealAvailable
          ? 'PHOTOREAL-WITH-TOKEN (default ion base layer installed; arcgis/google/bing tiles allowed via CSP)'
          : 'KEYLESS-SATELLITE (no token → no default ion layer; FREE ESRI World Imagery satellite basemap installed below for the 3D globe view; Google Photorealistic 3D Tiles need a VITE_CESIUM_TOKEN)'}.`
      );

      // §CESIUM-QUALITY-MSAA (L-509, founder 2026-07-21 "better quality on the 3D globe") —
      // enable multi-sample anti-aliasing so the photoreal tile edges + the envelope prism read
      // CRISP instead of jagged/pixelated. This is the SAFE quality lever: it is independent of
      // the tileset `maximumScreenSpaceError` (deliberately held at 12 — the §CESIUM-SSE-RETUNE
      // balance that keeps the height clamp accurate; lowering it would risk the float-bug) and
      // of `requestRenderMode` (MSAA resolves per rendered frame, on-demand rendering unchanged).
      // 4× is the standard quality/perf sweet spot; guarded + feature-detected so an older Cesium
      // or a GPU without MSAA simply skips it (no crash, no regression). Modest GPU cost, paid
      // only when the scene actually redraws.
      try {
        const sc = this.viewer.scene as unknown as { msaaSamples?: number };
        if (typeof sc.msaaSamples === 'number') {
          sc.msaaSamples = 4;
          console.log('[gis][cesium] §CESIUM-QUALITY-MSAA — 4× MSAA enabled (crisper tile + prism edges).');
        }
      } catch { /* MSAA unsupported on this build/GPU — non-fatal, skip */ }

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
        // §CESIUM-PERF-TILESET-SSE (2026-07-01) — the previous `maximumScreenSpaceError
        // = 2` demanded EXTREME detail (a tile is refined until its screen error is ≤2
        // px — far past Cesium's default of 16), which streams + keeps resident a HUGE
        // number of leaf tiles for the Google Photorealistic set. That is a primary
        // driver of the "slow / heavy" globe: constant tile fetch + GPU upload + memory
        // thrash. §CESIUM-SSE-RETUNE (founder 2026-07-01) — 20 was too coarse: the
        // Google tiles read as distorted spiky blobs near the building and, worse, the
        // clamp sampled a coarse/wrong surface so the model floated. 12 is the balance:
        // still far fewer tiles than the old 2 (big perf saving) but crisp enough that
        // the context reads cleanly AND the near-building tiles are detailed enough for
        // an accurate height clamp. `dynamicScreenSpaceError` keeps distant tiles coarser.
        tileset.maximumScreenSpaceError = 12;
        tileset.dynamicScreenSpaceError = true;
        tileset.preloadFlightDestinations = true;
        tileset.preferLeaves = true;
        tileset.progressiveResolutionHeightFraction = 0.5;
        tileset.foveatedScreenSpaceError = true;
        tileset.foveatedConeSize = 0.1;
        tileset.foveatedInterpolationCallback = Cesium.Math.lerp;
        tileset.foveatedTimeDelay = 0.05;
        // §CESIUM-PERF-TILESET-MEMORY — cap GPU/host memory so the tileset stops
        // thrashing (unbounded caches let it grow until the browser stutters/OOMs on a
        // long session). Cesium ≥1.107 uses `cacheBytes` (soft target) +
        // `maximumCacheOverflowBytes` (hard ceiling above it); older builds use
        // `maximumMemoryUsage` (MB). Feature-detect + set whichever exists so we don't
        // hard-depend on one Cesium version. Guarded — an unknown build just skips.
        try {
          const anyTs = tileset as unknown as {
            cacheBytes?: number;
            maximumCacheOverflowBytes?: number;
            maximumMemoryUsage?: number;
          };
          if (typeof anyTs.cacheBytes === 'number') {
            anyTs.cacheBytes = 384 * 1024 * 1024;              // ~384 MB soft target
            if (typeof anyTs.maximumCacheOverflowBytes === 'number') {
              anyTs.maximumCacheOverflowBytes = 256 * 1024 * 1024; // +256 MB hard overflow
            }
          } else if (typeof anyTs.maximumMemoryUsage === 'number') {
            anyTs.maximumMemoryUsage = 512;                   // MB (older Cesium)
          }
        } catch { /* unknown Cesium build — leave tileset defaults */ }
      };

      if (_cesiumToken) try {
        const tileset = await Cesium.Cesium3DTileset.fromIonAssetId(
          2275207 // Google Photorealistic 3D Tiles
        );

        applyTilesetQuality(tileset);

        // Add tileset without auto-zoom
        this.viewer.scene.primitives.add(tileset);
        photogrammetryLoaded = true;
        // §GLOBE-TILE-CLAMP-FLUSH — keep the primitive so the clamp can bounding-sphere
        // it as a fallback ground height when picking returns ellipsoid-0.
        this.photorealTileset = tileset;
        // §PLOT-CLEAR-PHOTOREAL (L-429) — a tileset can load AFTER the parcel was committed
        // (globe entered post-draw), so re-apply the parcel void to the freshly-placed tiles.
        this.applyParcelClipToPhotorealTiles();
        // §A.21.D-GLOBE3 — photoreal tiles ARE the surrounding context now → suppress
        // PRYZM's own OSM/Overpass context extrusions (they'd duplicate the tiles).
        this.photorealTilesActive = true;
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
          // §GLOBE-TILE-CLAMP-FLUSH — keep the primitive for the bounding-sphere fallback.
          this.photorealTileset = tileset;
        // §PLOT-CLEAR-PHOTOREAL (L-429) — a tileset can load AFTER the parcel was committed
        // (globe entered post-draw), so re-apply the parcel void to the freshly-placed tiles.
        this.applyParcelClipToPhotorealTiles();
          // §A.21.D-GLOBE3 — photoreal tiles ARE the surrounding context now → suppress
          // PRYZM's own OSM/Overpass context extrusions (they'd duplicate the tiles).
          this.photorealTilesActive = true;
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
        // §GLOBE-FIRST-FRAME-COLOUR — paint the globe base + scene background a
        // brand-safe loading colour so the FIRST visible frame is never pure black
        // while imagery tiles are still streaming. Tiles overwrite the base once
        // loaded; Forma mode overrides both with its palette.
        globe.baseColor = Cesium.Color.fromCssColorString(GLOBE_LOADING_COLOUR);
        scene.backgroundColor = Cesium.Color.fromCssColorString(GLOBE_LOADING_COLOUR);
        console.log('[CesiumViewport] Scene quality: sun lighting + atmosphere enabled; base colour ' + GLOBE_LOADING_COLOUR + ' (no black flash).');
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
      // §FORMA-RENDER-ERROR-GUARD (ADR-0087) — install BEFORE any Forma mode is
      // applied, so a post-process shader-compile failure disables the offending
      // stage and keeps the loop alive instead of letting Cesium stop rendering.
      this.installRenderErrorGuard();
      // §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — wire canvas WebGL context-loss
      // recovery so a GPU-process reset (e.g. from a BIM-side WebGPU device loss) does not
      // strand Cesium behind the dead-end "Rendering has stopped" panel.
      this.installContextLossGuard();

      try {
        const win = window as unknown as {
          __pryzmFormaMode?: boolean;
          __pryzmFormaAO?: boolean;
          pryzmSetCesiumFormaMode?: (on: boolean) => void;
          pryzmSetFormaTerrain?: (on: boolean) => void;
          pryzmContextDiag?: () => Record<string, unknown>;
        };
        win.pryzmSetCesiumFormaMode = (on: boolean) => this.setFormaMode(on);
        // §TERRAIN-TOGGLE (founder 2026-07-27) — console escape hatch to flip the 3D-Site
        // terrain on/off for quick study without touching the panel checkbox.
        win.pryzmSetFormaTerrain = (on: boolean) => this.setFormaTerrainEnabled(on);
        // §CTX-DIAG-PROBE (L-635) — ONE-COMMAND state dump. Run `pryzmContextDiag()` in the
        // 3D-Site console and paste the single object: it says definitively whether context
        // buildings are (a) never placed, (b) placed but seated far off the camera, or (c)
        // seated right but not drawn — ending the fetch-vs-seat-vs-render guessing.
        win.pryzmContextDiag = () => this.contextDiag();
        const flag = win.__pryzmFormaMode;
        // §FORMA-AO-OPT-IN (ADR-0087) — AO is OFF unless explicitly opted in.
        if (typeof win.__pryzmFormaAO === 'boolean') this.formaAoOptIn = win.__pryzmFormaAO;
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

      // §CESIUM-GIZMO-REMOVED — no transform gizmo (no origin axis lines), and no
      // t/r keyboard listener that would have rendered them. Selection feedback is
      // the yellow silhouette below.

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
        // §GLOBE-CRASH-GUARD — a quick open→close can dispose the viewer before this
        // 100ms timer fires; gate on isViewerLive() so resize never hits a dead viewer.
        if (!this.isViewerLive()) return;
        this.viewer!.resize();
        this.viewer!.scene.requestRender();

        console.log(
          "Canvas size:",
          this.viewer!.canvas.clientWidth,
          this.viewer!.canvas.clientHeight
        );
      }, 100);

      // §L-520 — the one-shot 100 ms resize above MISSES the founder's case: the re-parented
      // canvas mounts 0×0 (the multi-pane host lays out after Cesium mounts), so the 3D Site
      // renders BLANK/white until some LATER external reflow happens to resize it (the log shows
      // `canvas 0x0` at mount, then `1140x1098` only after a reflow — nothing paints in between).
      // A ResizeObserver guarantees a resize + repaint the MOMENT the pane reaches a non-zero
      // size, regardless of timing — so the ground + context paint on first layout instead of
      // waiting for an incidental reflow. Self-disconnects once the viewer is disposed (it fires
      // on the teardown resize, sees a dead viewer, and unsubscribes), so no accumulating leak
      // across project switches. Guarded: if ResizeObserver is unavailable the 100 ms timer above
      // remains the fallback.
      try {
        const ro = new ResizeObserver(() => {
          if (!this.isViewerLive()) { ro.disconnect(); return; }
          const w = this.container.clientWidth;
          const h = this.container.clientHeight;
          if (w > 0 && h > 0) {
            this.viewer!.resize();
            this.viewer!.scene.requestRender();
          }
        });
        ro.observe(this.container);
      } catch { /* ResizeObserver unavailable — the 100 ms timer remains the fallback */ }

      // §GLOBE-FRAME-NO-JUMP — record genuine USER camera control so a late
      // base-settle never re-flies (yanks) the user back to the site. A move that
      // begins while one of OUR programmatic flyTos is in flight
      // (`formaProgrammaticFlyInFlight`) is ours, not the user's, so it does NOT
      // count. Once a real user drag/zoom starts, latch `formaUserMovedCamera`.
      this.viewer.camera.moveStart.addEventListener(() => {
        if (!this.formaProgrammaticFlyInFlight) this.formaUserMovedCamera = true;
      });

      // Debug listener + §A.21.D-GLOBE pan-driven context-building refresh.
      this.viewer.camera.moveEnd.addEventListener(() => {
        // §GLOBE-CRASH-GUARD — `destroy()` can emit a final `moveEnd` while the
        // viewer is non-null but its camera is already torn down; reading
        // `positionCartographic` then throws. Gate on isViewerLive() + wrap.
        if (!this.isViewerLive()) return;
        try {
          const carto = this.viewer!.camera.positionCartographic;
          // §GLOBE-TILE-CLAMP-NO-SELF-HIT (ADR-0095) — removed the per-moveEnd
          // "RUNTIME VERIFICATION" LAT/LON/HEIGHT console spam (fired on EVERY camera
          // stop → hundreds of lines flooding the console). The pan-driven context
          // refresh below is the only behaviour this handler needs.
          this.maybeRefreshContextOnPan(
            Cesium.Math.toDegrees(carto.latitude),
            Cesium.Math.toDegrees(carto.longitude),
            carto.height,
          );
        } catch (e) {
          console.warn('[CesiumViewport] moveEnd handler skipped (viewer tearing down):', e);
        }
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
        // §FORMA-CLICK-NO-NAV (2026-06-30) — a scene click in the 3D-Site / Forma
        // view must STAY in the view (interact with the scene), never route home.
        // `scene.pick()` runs an off-screen render pass; on a heavy Forma scene
        // (white materials + site-metric textures + many primitives) it can throw a
        // transient WebGL/context error. Previously this throw escaped the Cesium
        // ScreenSpaceEventHandler callback as an unhandled `window` 'error' event
        // whose message ("WebGL" / "context lost" / "renderer") matched
        // ViewportCrashGuard's render-error keywords — a few stray clicks crossed its
        // consecutive-throw threshold, the SceneCrashFallback appeared, and its
        // "Back to projects" link (`<a href="/">`) full-reloaded the app to a FRESH
        // BOOT at the project hub, LOSING the open project. We now CATCH + LOG the
        // pick/selection error here (the ViewportCrashGuard "swallow transient
        // render throw" posture) so a non-fatal scene click can never escalate to a
        // route-home/reload. Legitimate navigation (the explicit "Views"/hub buttons)
        // is unaffected — only the accidental pick-crash → hub path is closed.
        try {
          if (!this.viewer) return;

          const pickedObject = this.viewer.scene.pick(movement.position);

          if (!Cesium.defined(pickedObject)) {
            // §CTX-QUERY-PANEL (L-592) — a click on empty sky/ground dismisses the context
            // info panel. Inside the guard, like everything else in this handler.
            this.closeContextBuildingQuery();
            return;
          }

          // §CTX-QUERY-PANEL (L-592) — THE MISSING BRANCH. `scene.pick` on an Entity-backed
          // primitive returns a `{ id: Entity }`, and this handler previously branched only on
          // `Cesium.Model` / `Cesium3DTileFeature` — so a picked CONTEXT BUILDING fell straight
          // through to "clicked away — deselect" and the neighbourhood was inert.
          //
          // The pairing of record already existed (`contextBuildingPlacements`, L-418); all that
          // was missing was resolving the picked entity back through it and showing a READ-ONLY
          // panel. A context building is NOT a model object (C19: transient scene decoration,
          // never persisted; C57: not a parcel), so nothing here selects it into the model, makes
          // it editable, or persists anything.
          //
          // ⚠ It also does NOT route through `SelectionBus` / `gpu-pick`. Those are the BIM-side
          // selection model; the 3D-Site scene has its own ad-hoc `ScreenSpaceEventHandler` path
          // and no contract currently owns a unified one (logged as a COVERAGE GAP in the L-592
          // spike). Inventing a second selection framework here would make that gap worse.
          {
            const pickedEntity: unknown = (pickedObject as { id?: unknown }).id;
            if (pickedEntity instanceof Cesium.Entity) {
              // The selection rim sits on top of the building it rims, so a second click on the
              // same building can land on the rim. That is still "the same pick" — keep the panel.
              if (pickedEntity === this.contextQueryHighlight) return;
              const feature = this.contextFeatureByEntity.get(pickedEntity);
              if (feature) {
                if (this.currentModel) this.currentModel.silhouetteSize = 0;
                this.showContextBuildingQuery(feature);
                return;
              }
            }
          }
          // Anything else picked (the massing, the envelope, a road…) closes the panel: the
          // panel describes ONE context building and must never outlive the pick that opened it.
          this.closeContextBuildingQuery();

          // If GLB model clicked
          if (pickedObject.primitive instanceof Cesium.Model) {
            const model = pickedObject.primitive as Cesium.Model;
            this.currentModel = model;
            console.log("✅ BIM model selected");

            // §CESIUM-GIZMO-REMOVED (founder 2026-06-19) — the transform gizmo that drew
            // RED(X)/GREEN(Y)/BLUE(Z) origin axis lines on selection (the green/purple
            // lines at the building corner) is gone. The yellow silhouette below is the
            // selection feedback; no axes are ever attached.

            // Use silhouette for persistent visual feedback
            model.silhouetteColor = Cesium.Color.YELLOW;
            model.silhouetteSize = 3;

            return;
          }

          // Clicked away - deselect
          if (this.currentModel) {
            this.currentModel.silhouetteSize = 0;
          }

          // Optional: still allow tile feature selection
          if (pickedObject instanceof Cesium.Cesium3DTileFeature) {
            console.log("Tile feature selected");
          }
        } catch (err) {
          // §FORMA-CLICK-NO-NAV — swallow + log; the viewport stays live and the
          // user keeps their open project. Never re-throw (that re-arms the
          // crash-guard → hub-navigation path this guard exists to close).
          console.warn(
            "[gis][cesium] §FORMA-CLICK-NO-NAV — scene-click pick/selection threw (non-fatal, swallowed; view kept):",
            err,
          );
        }
      },
      Cesium.ScreenSpaceEventType.LEFT_CLICK
    );
  }

  // ── §CTX-QUERY-PANEL (L-592) — read-only query of ONE context building ────────
  //
  // 🔴 THE RULE THAT GATES THIS FEATURE: the panel MUST surface `heightProvenance`.
  // MEASURED (L-582, 23,251 Barcelona footprints): 0.9% surveyed · 79.3% `building:levels` × our
  // assumed 3.2 m · 19.8% a fabricated 9 m. The scene already draws the assumed ones translucent
  // (§CTX-ASSUMED-HEIGHT-VISIBLE) so a guess does not RENDER like a measurement — a panel reading
  // "Height: 9 m" would undo that in one line of text. All of that judgement lives in the pure,
  // unit-tested `contextBuildingQuery.ts`; this method only paints its answer.

  /** Open (or replace) the read-only panel for a picked context building. Never throws. */
  private showContextBuildingQuery(feature: ContextBuildingFeature): void {
    try {
      const model = buildContextBuildingQuery({
        heightM: feature.properties.heightM,
        ...(feature.properties.heightProvenance !== undefined
          ? { heightProvenance: feature.properties.heightProvenance } : {}),
        ...(feature.properties.floors !== undefined ? { floors: feature.properties.floors } : {}),
        osmId: feature.properties.osmId,
        ...(feature.properties.osmIdSource !== undefined
          ? { osmIdSource: feature.properties.osmIdSource } : {}),
        ...(feature.properties.useTag !== undefined ? { useTag: feature.properties.useTag } : {}),
        ...(feature.properties.name !== undefined ? { name: feature.properties.name } : {}),
        ...(feature.properties.ring !== undefined ? { ring: feature.properties.ring } : {}),
        ...(feature.properties.distM !== undefined ? { distM: feature.properties.distM } : {}),
      });
      this.renderContextBuildingQueryPanel(model);
      this.setContextQueryHighlight(feature);
      this.viewer?.scene.requestRender();
    } catch (e) {
      // A panel is a nice-to-have; it may never escalate. (An escaping throw here would land in
      // §FORMA-CLICK-NO-NAV's catch anyway, but failing quietly is better than relying on that.)
      console.warn('[CesiumViewport][ctx-query] §CTX-QUERY-PANEL — panel build failed, ignored:', e);
    }
  }

  /** Dismiss the panel + its rim highlight. Idempotent, never throws. */
  private closeContextBuildingQuery(): void {
    try {
      if (this.contextQueryPanel) { this.contextQueryPanel.remove(); this.contextQueryPanel = null; }
      if (this.contextQueryHighlight && this.viewer) {
        try { this.viewer.entities.remove(this.contextQueryHighlight); } catch { /* gone */ }
        this.viewer.scene.requestRender();
      }
      this.contextQueryHighlight = null;
    } catch { /* never allowed to affect the view */ }
  }

  /**
   * A single YELLOW rim polyline round the picked footprint at its drawn top.
   *
   * Yellow deliberately — it is ALREADY this handler's selection colour (the GLB silhouette
   * above), so selection reads as one idea. It is emphatically NOT #6600FF: that is the proposed
   * buildable envelope, and a purple rim on a neighbour would read as "this is your envelope".
   * ONE entity, replaced on each pick, removed on dismiss — no per-frame cost.
   */
  private setContextQueryHighlight(feature: ContextBuildingFeature): void {
    const viewer = this.viewer;
    if (!viewer) return;
    if (this.contextQueryHighlight) {
      try { viewer.entities.remove(this.contextQueryHighlight); } catch { /* gone */ }
      this.contextQueryHighlight = null;
    }
    const ring = feature.geometry.coordinates[0];
    if (!ring || ring.length < 4) return;
    const top = this.formaTerrainBaseHeight + Math.max(0.1, feature.properties.heightM) + 0.15;
    const positions = ring
      .filter((p) => p[0] != null && p[1] != null)
      .map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon!, lat!, top));
    if (positions.length < 3) return;
    this.contextQueryHighlight = viewer.entities.add({
      name: 'pryzm-context-query-highlight',
      polyline: {
        positions,
        width: 3,
        material: Cesium.Color.fromCssColorString('#FFD400'),
        clampToGround: false,
      },
    });
  }

  /** Paint the pure query model as DOM. Read-only by construction — no inputs, no actions. */
  private renderContextBuildingQueryPanel(model: ContextBuildingQueryModel): void {
    if (this.contextQueryPanel) { this.contextQueryPanel.remove(); this.contextQueryPanel = null; }
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'pryzm-context-building-query');
    Object.assign(el.style, {
      position: 'absolute', top: '12px', right: '12px', width: '286px', maxWidth: 'calc(100% - 24px)',
      // C06 §7 / §233 — the named `popover` slot from zLayers, never a hand-picked literal.
      zIndex: zCss('popover'),
      padding: '12px 13px 11px', borderRadius: '10px',
      background: 'rgba(255,255,255,0.97)', color: '#2a2440',
      font: '400 12px/1.45 system-ui, sans-serif',
      boxShadow: '0 2px 14px rgba(0,0,0,0.18)', pointerEvents: 'auto',
      maxHeight: 'calc(100% - 24px)', overflowY: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);

    const head = document.createElement('div');
    Object.assign(head.style, { display: 'flex', alignItems: 'flex-start', gap: '8px' } satisfies Partial<CSSStyleDeclaration>);
    const title = document.createElement('div');
    title.textContent = model.title;
    Object.assign(title.style, { flex: '1', font: '600 13px/1.3 system-ui', color: '#1c1630' } satisfies Partial<CSSStyleDeclaration>);
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close');
    Object.assign(close.style, {
      appearance: 'none', border: 'none', background: 'transparent', cursor: 'pointer',
      font: '600 16px/1 system-ui', color: '#7a7391', padding: '0 2px',
    } satisfies Partial<CSSStyleDeclaration>);
    close.addEventListener('click', () => this.closeContextBuildingQuery());
    head.appendChild(title);
    head.appendChild(close);
    el.appendChild(head);

    const sub = document.createElement('div');
    sub.textContent = model.subtitle;
    Object.assign(sub.style, { marginTop: '3px', font: '400 10.5px/1.35 system-ui', color: '#7a7391' } satisfies Partial<CSSStyleDeclaration>);
    el.appendChild(sub);

    for (const row of model.rows) {
      const r = document.createElement('div');
      Object.assign(r.style, { marginTop: '9px' } satisfies Partial<CSSStyleDeclaration>);
      const lab = document.createElement('div');
      lab.textContent = row.label;
      Object.assign(lab.style, {
        font: '600 9.5px/1 system-ui', letterSpacing: '0.06em', textTransform: 'uppercase',
        color: '#9a93b0',
      } satisfies Partial<CSSStyleDeclaration>);
      const val = document.createElement('div');
      val.textContent = row.value;
      Object.assign(val.style, {
        marginTop: '2px', font: '600 12.5px/1.25 system-ui',
        // An ABSENCE is styled as an absence — never with the same weight as a datum.
        color: row.isUnknown ? '#9a93b0' : '#1c1630',
        fontStyle: row.isUnknown ? 'italic' : 'normal',
      } satisfies Partial<CSSStyleDeclaration>);
      r.appendChild(lab);
      r.appendChild(val);
      if (row.caveat) {
        const cav = document.createElement('div');
        cav.textContent = row.caveat;
        Object.assign(cav.style, {
          marginTop: '2px', font: '400 10px/1.4 system-ui', color: '#7a7391',
        } satisfies Partial<CSSStyleDeclaration>);
        r.appendChild(cav);
      }
      el.appendChild(r);
    }

    const foot = document.createElement('div');
    foot.textContent = model.footnote;
    Object.assign(foot.style, {
      marginTop: '11px', paddingTop: '8px', borderTop: '1px solid #ece8f6',
      font: '400 9.5px/1.4 system-ui', color: '#9a93b0',
    } satisfies Partial<CSSStyleDeclaration>);
    el.appendChild(foot);

    this.container.appendChild(el);
    this.contextQueryPanel = el;
  }

  // ── §CTX-USE-COLOUR (L-599) — colour context buildings by ACTUAL use ─────────
  //
  // A toggleable MODE, never a permanent repaint (the scene's massing semantics are load-bearing:
  // proposed = #6600FF, context = off-white, unknown height = translucent + cooler). Turning it
  // OFF restores the EXACT material objects that were there before, not a recomputed lookalike.
  //
  // The 9% of buildings with no recorded use are left UNCOLOURED — the absence of colour is the
  // statement, because a colour reads as a fact (see `contextBuildingUse.ts` for the full
  // rationale, the measured distribution, and why permitted-use is a separate layer).

  /** §CTX-USE-COLOUR — toggle the use-colouring mode. DEFAULT OFF. Never throws. */
  public setContextUseColouring(on: boolean): void {
    const want = !!on;
    if (want === this.contextUseColourOn) return;
    this.contextUseColourOn = want;
    try {
      if (want) this.applyContextUseColouring();
      else this.restoreContextUseColouring();
    } catch (e) {
      console.warn('[CesiumViewport][ctx-use] §CTX-USE-COLOUR toggle failed — context left as-is:', e);
    }
  }

  /** §CTX-USE-COLOUR — current mode state. */
  public getContextUseColouring(): boolean {
    return this.contextUseColourOn;
  }

  /**
   * §CTX-USE-COLOUR — the legend for what is ACTUALLY ON SCREEN.
   *
   * ⚠ Counted live from the placed features, never quoted from the L-599 probe: the probe measured
   * 9.0% unknown across central Eixample + Gràcia, but another neighbourhood has another answer,
   * and printing the probe's constant as if it described the current view would be a real number
   * from the wrong place.
   */
  public getContextUseLegend(): ContextUseLegend | null {
    if (this.contextBuildingPlacements.length === 0) return null;
    return summariseContextUse(
      this.contextBuildingPlacements.map((p) => classifyContextUse(p.feature.properties.useTag)),
    );
  }

  /**
   * Paint every placed context entity by its use class.
   *
   * PERF: O(n) ONCE per toggle (and once per context (re)load while the mode is on) — never per
   * frame. On the founder's WebGL-fallback box that is ~9,762 material assignments at the moment
   * the user flips the switch, then nothing. Entity material assignment does not rebuild geometry.
   */
  private applyContextUseColouring(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    let coloured = 0, leftUncoloured = 0;
    for (const { entity, feature } of this.contextBuildingPlacements) {
      const poly = entity.polygon;
      if (!poly) continue;
      const cls = classifyContextUse(feature.properties.useTag);
      const css = CONTEXT_USE_STYLE[cls].colorCss;
      if (css === null) {
        // 'unknown' — DELIBERATELY untouched. The ordinary context fill (and, for an
        // unknown-height building, its translucency) stays exactly as it was: no colour = no
        // claim. Giving this class a swatch would be the L-582 fabrication pattern in colour form.
        leftUncoloured++;
        continue;
      }
      if (!this.contextUseMaterialBackup.has(entity)) {
        this.contextUseMaterialBackup.set(entity, poly.material);
      }
      // Preserve the §CTX-ASSUMED-HEIGHT-VISIBLE channel: an unknown-HEIGHT building stays
      // translucent even while it is coloured by use, and the far ring stays aerially recessive.
      // The two honesty signals ride different channels (alpha vs hue) so they compose.
      const alpha = entity.name === 'pryzm-forma-context-building-assumed-height' ? 0.55
        : entity.name === 'pryzm-forma-context-building-far' ? 0.82
        : 1.0;
      poly.material = new Cesium.ColorMaterialProperty(
        Cesium.Color.fromCssColorString(css).withAlpha(alpha),
      );
      coloured++;
    }
    this.renderContextUseLegend();
    viewer.scene.requestRender();
    console.log(
      `[CesiumViewport][ctx-use] §CTX-USE-COLOUR ON — ${coloured} building(s) coloured by ACTUAL ` +
        `OSM use, ${leftUncoloured} left UNCOLOURED (no use tag — the absence is the signal). ` +
        `This is what a building IS, not what the land MAY BE (clau/MUC zoning is a separate layer).`,
    );
  }

  /** Restore the exact pre-colouring materials. Exact by construction — snapshots, not recompute. */
  private restoreContextUseColouring(): void {
    const viewer = this.viewer;
    let restored = 0;
    for (const [entity, material] of this.contextUseMaterialBackup) {
      const poly = entity.polygon;
      if (!poly) continue;
      poly.material = material;
      restored++;
    }
    this.contextUseMaterialBackup.clear();
    if (this.contextUseLegendEl) { this.contextUseLegendEl.remove(); this.contextUseLegendEl = null; }
    viewer?.scene.requestRender();
    console.log(`[CesiumViewport][ctx-use] §CTX-USE-COLOUR OFF — restored ${restored} original material(s).`);
  }

  /**
   * §CTX-USE-COLOUR — re-apply after a context (re)load, so newly-placed buildings are not left
   * in the base fill while the mode says they are coloured. Cheap no-op when the mode is off.
   */
  private refreshContextUseColouringAfterLoad(): void {
    if (!this.contextUseColourOn) return;
    try { this.applyContextUseColouring(); } catch (e) {
      console.warn('[CesiumViewport][ctx-use] re-colour after load failed (non-fatal):', e);
    }
  }

  /** The legend — a colour without one is an uninterpreted fact, and the 9% needs saying in words. */
  private renderContextUseLegend(): void {
    if (this.contextUseLegendEl) { this.contextUseLegendEl.remove(); this.contextUseLegendEl = null; }
    const legend = this.getContextUseLegend();
    if (!legend) return;
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'pryzm-context-use-legend');
    Object.assign(el.style, {
      position: 'absolute', bottom: '12px', right: '12px', width: '206px',
      // C06 §7 / §233 — named slot, never a literal.
      zIndex: zCss('contextualBar'),
      padding: '10px 11px', borderRadius: '9px',
      background: 'rgba(255,255,255,0.96)', color: '#2a2440',
      font: '400 11px/1.4 system-ui, sans-serif',
      boxShadow: '0 2px 12px rgba(0,0,0,0.16)', pointerEvents: 'none',
      maxHeight: '46%', overflowY: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);

    const h = document.createElement('div');
    h.textContent = 'Building use (OSM)';
    Object.assign(h.style, { font: '600 11px/1.2 system-ui', color: '#1c1630' } satisfies Partial<CSSStyleDeclaration>);
    el.appendChild(h);
    const sub = document.createElement('div');
    sub.textContent = 'What each building IS — not what the land may be zoned for.';
    Object.assign(sub.style, { marginTop: '2px', font: '400 9.5px/1.35 system-ui', color: '#7a7391' } satisfies Partial<CSSStyleDeclaration>);
    el.appendChild(sub);

    for (const row of legend.rows) {
      const r = document.createElement('div');
      Object.assign(r.style, {
        display: 'flex', alignItems: 'flex-start', gap: '7px', marginTop: '6px',
      } satisfies Partial<CSSStyleDeclaration>);
      const sw = document.createElement('span');
      Object.assign(sw.style, {
        flex: '0 0 auto', width: '11px', height: '11px', marginTop: '2px', borderRadius: '3px',
        background: row.style.colorCss ?? 'transparent',
        // The 'unknown' row gets a DASHED EMPTY swatch — visibly "no colour was applied",
        // not a colour that happens to be pale.
        border: row.style.colorCss ? '1px solid rgba(0,0,0,0.14)' : '1px dashed #b6afc9',
      } satisfies Partial<CSSStyleDeclaration>);
      const txt = document.createElement('span');
      Object.assign(txt.style, { flex: '1' } satisfies Partial<CSSStyleDeclaration>);
      const line = document.createElement('div');
      line.textContent = `${row.style.label} · ${row.count} (${(row.share * 100).toFixed(1)}%)`;
      Object.assign(line.style, {
        font: '500 10.5px/1.25 system-ui',
        color: row.cls === 'unknown' ? '#7a7391' : '#2a2440',
      } satisfies Partial<CSSStyleDeclaration>);
      txt.appendChild(line);
      if (row.style.note) {
        const n = document.createElement('div');
        n.textContent = row.style.note;
        Object.assign(n.style, { font: '400 9px/1.3 system-ui', color: '#9a93b0' } satisfies Partial<CSSStyleDeclaration>);
        txt.appendChild(n);
      }
      r.appendChild(sw);
      r.appendChild(txt);
      el.appendChild(r);
    }
    this.container.appendChild(el);
    this.contextUseLegendEl = el;
  }

  /**
   * Read the current Site's geographic origin (lat/lon). A 0/0 location is the `ensureSite`
   * placeholder (siteDispatch §94) and is treated as "unset" so we don't frame the camera on
   * Null Island.
   *
   * §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259, defect ii — "the house is not in the
   * correct location, neither the view") — PRECEDENCE INVERTED, and this is the fix, not a
   * tidy-up. PRYZM has TWO georeference authorities:
   *
   *   • the **LTP-ENU origin** (`getCurrentSiteOrigin()`) — the frame EVERY authored
   *     coordinate is BAKED in: `boundaryProjection.latLonToSceneXZ` projects the parcel ring
   *     about it at commit time, the generator authors walls in that scene-XZ, and
   *     `GISAreaLayout.getFormaOrigin()` anchors the Cesium ENU frame at it. It IS the scene
   *     origin (C12 §1.1).
   *   • the **geocoded address** (`siteModelStore.getLocation()`) — a LABEL, not a frame.
   *
   * They coincide until a parcel boundary is committed; from then on `setLtpOriginIfSafe`
   * FREEZES the LTP origin (C19 §1.3 boundary-shift guard) while the store location may still
   * move (a later geocode, a restore ordering, an onboarding re-dispatch). The OLD code read
   * the ADDRESS first here, so the camera framing, the Forma sun anchor and the OSM context
   * were all anchored at a point that can be arbitrarily far from the building the massing/GLB
   * are anchored at — an elevation bug cannot move a building horizontally, but THIS can.
   *
   * The LTP-ENU origin is therefore the SSOT for every Cesium anchor AND every Cesium camera
   * frame (C12 §1.5). The address stays as the pre-boundary fallback (before any origin is
   * pinned the two are the same point by construction). Any divergence is logged in metres —
   * it must never again be diagnosed by guesswork.
   */
  private readSiteLocation(): { lat: number; lon: number } | null {
    const store = this.runtime?.siteModelStore as
      | { getLocation?: () => { latitude: number; longitude: number } | null }
      | undefined;
    const raw = store?.getLocation?.();
    const address =
      raw && (raw.latitude !== 0 || raw.longitude !== 0)
        ? { lat: raw.latitude, lon: raw.longitude }
        : null;
    // §CESIUM-SITE-ORIGIN — the process-wide LTP-ENU origin, set by the onboarding location
    // step (siteDispatch) BEFORE Cesium mounts in the GIS handoff. It is BOTH the earliest
    // available signal AND the authoritative scene frame.
    const ltpRaw = getCurrentSiteOrigin();
    const ltp = ltpRaw && (ltpRaw.lat !== 0 || ltpRaw.lon !== 0) ? { lat: ltpRaw.lat, lon: ltpRaw.lon } : null;

    if (ltp && address && georefOriginsDiverge({ ltpOrigin: ltp, storeLocation: address, anchorOrigin: ltp })) {
      console.warn(
        `[CesiumViewport][georef] §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF — the LTP-ENU scene ` +
          `origin and the geocoded Site address DIVERGE by ` +
          `${originSeparationMeters(ltp, address).toFixed(1)} m ` +
          `(LTP ${ltp.lat.toFixed(6)},${ltp.lon.toFixed(6)} vs address ${address.lat.toFixed(6)},${address.lon.toFixed(6)}). ` +
          `Anchoring + framing on the LTP-ENU origin — it is the frame the boundary + walls ` +
          `are baked in (C12 §1.5). The address is a label, not a frame.`,
      );
    }
    return ltp ?? address;
  }

  /**
   * §L-430 slice 2b — θ, the PROJECT→TRUE-north angle (radians, clockwise), read from
   * `SiteLocation.trueNorth`. This closes **ADR-0115 §Remaining #2** ("globe applies θ to the
   * placed model"), open since 2026-07-02: this viewport previously never read `trueNorth` at
   * all, so a model authored on project north would have been placed on the globe at the
   * WRONG BEARING while the plan looked perfect.
   *
   * Consumed via `sceneXZToEnu(x, z, θ)` — the scene-XZ → ENU frame boundary. It is
   * deliberately NOT applied inside `enuToCartesian`, which already receives east/north:
   * rotating there would double-rotate anything whose east/north was produced from a source
   * that is already true-north (terrain samples, OSM context, the sun anchor). θ belongs at
   * the ONE place authored scene coordinates cross into the world frame, and nowhere else.
   *
   * Returns 0 when unavailable, which is exactly the identity — so an un-rotated site is
   * byte-identical to the pre-L-430 globe (ADR-0070).
   */
  private readProjectNorthRad(): number {
    try {
      // §SEAM-2 INCREMENT 1 (g4) — read the store via `this.runtime || window.runtime`, mirroring the
      // §L-412 Bug-2 boundary read. `this.runtime` can still be null on the legacy / lazy-import boot
      // path (documented on the field at :1108), and a null runtime made θ_read latch 0 —
      // INDISTINGUISHABLE from a site that genuinely has no project north (the §L-446 ambiguity below).
      // The window.runtime fallback lets a present-but-nonzero θ be READ, so a real Barcelona θ≈45°
      // reaches the globe; 0 is returned only when trueNorth is truly 0. θ-independent: identity for
      // Denmark (θ≈0), correct for Barcelona (θ≈45°). The narrow window slot carries the full runtime
      // at runtime (siteDispatch reads siteModelStore off it the same way); the cast is the established
      // pattern for that gap between the narrow type and the live object.
      const rt = (this.runtime
        ?? (window.runtime as unknown as import('@pryzm/runtime-composer/types').PryzmRuntime | undefined))
        ?? undefined;
      const store = rt?.siteModelStore as
        | { getLocation?: () => { trueNorth?: number } | null }
        | undefined;
      const theta = store?.getLocation?.()?.trueNorth;
      const ok = typeof theta === 'number' && Number.isFinite(theta);

      // §L-446 DIAGNOSTIC — θ read as 0 is INDISTINGUISHABLE from "this site genuinely has no
      // project north", and both make enuFrameWithProjectNorth return the bare ENU frame. That
      // ambiguity is exactly why this defect survived a fix: the rotation is skipped SILENTLY.
      //
      // The whole read chain is statically correct — siteModelStore is on PryzmRuntime
      // (types.ts §3593, wired at composeRuntime:1538), getLocation() exists
      // (stores/SiteModelStore.ts:72), and trueNorth is schema-backed with .default(0)
      // (schemas/site/SiteLocation.ts:33). So a 0 here is a RUNTIME-STATE failure, and only a
      // runtime probe can say which link is empty. Report each link separately rather than
      // logging "theta=0", which would not distinguish them.
      //
      // Warn-once: this is called per placement and per massing render — unthrottled it would
      // flood the console the founder is reading.
      if (!ok || theta === 0) {
        if (!CesiumViewport._projNorthDiagWarned) {
          CesiumViewport._projNorthDiagWarned = true;
          console.warn(
            '[CesiumViewport][§L-446] project north resolved to 0 — the model will render in ' +
            'PROJECT space on a TRUE-north globe. Which link is empty: ' +
            `runtime=${this.runtime ? 'present' : (rt ? 'via-window (g4 fallback)' : 'NULL')} ` +
            `siteModelStore=${store ? 'present' : 'MISSING'} ` +
            `getLocation=${typeof store?.getLocation === 'function' ? 'present' : 'MISSING'} ` +
            `location=${store?.getLocation?.() ? 'present' : 'NULL'} ` +
            `trueNorth=${JSON.stringify(theta)}. ` +
            'If every link is present and trueNorth is 0, the site genuinely has no project ' +
            'north and this is CORRECT — not a bug.',
          );
        }
      }
      return ok ? theta : 0;
    } catch {
      return 0;
    }
  }

  /** §L-446 — warn-once latch for the project-north diagnostic above. */
  private static _projNorthDiagWarned = false;

  /**
   * Point the camera at a site location so the user sees their plot (top-down at
   * ~600 m, near-nadir pitch) instead of the washed-out globe limb.
   *
   * @param instant when true (framing at mount), jump there with `setView`;
   *   otherwise (an interactive location change) glide with a ~1.5 s `flyTo`.
   */
  /**
   * §SITE-FRAME-ON-TERRAIN (L-635) — PUBLIC terrain-aware site framing for external callers
   * (GISAreaLayout.reframeSiteIn3D's no-massing/pre-plot fallback, which used to fly to a RAW ellipsoid
   * 600 m — under Madrid's ~700 m plateau → blank until zoom-out; Barcelona's ~63 m ground stayed below
   * 600 m, which is why it always looked fine). Delegates to the terrain-aware frameSiteLocation:
   * attaches the baked terrain, samples the REAL ground height, and frames the §SITE-VIEWPOINT-CONSISTENT
   * preset ABOVE it. Safe when no massing is placed.
   */
  public frameSiteLocationOnTerrain(lat: number, lon: number): void {
    this.frameSiteLocation(lat, lon, { instant: false });
  }

  private frameSiteLocation(lat: number, lon: number, opts: { instant?: boolean } = {}): void {
    // §SITE-FRAME-ON-TERRAIN (L-635) — SITE_FRAME_HEIGHT_M (600 m) is a height above the GROUND, but a
    // high city's ground is hundreds of metres above the WGS-84 ellipsoid (Madrid ~700 m). Framing at a
    // raw ellipsoid-relative altitude parked THIS no-massing pre-plot camera ~100 m UNDER Madrid's
    // terrain → the 3D Site read BLANK until the user zoomed out (Barcelona's ~12 m ground stayed above
    // it). There is no massing origin on this path, so the massing/photoreal base-settle reframe never
    // fires — resolve the REAL ground height (attach the baked terrain if any, then
    // sampleTerrainMostDetailed; getHeight is unusable in Forma) and frame relative to it. A flat /
    // no-terrain city resolves to 0, exactly the previous behaviour.
    if (!this.isViewerLive()) return;
    void this.frameSiteLocationOnResolvedGround(lat, lon, opts);
  }

  /** §SITE-FRAME-ON-TERRAIN (L-635) — resolve the true ground height at (lat,lon), then frame above it. */
  private async frameSiteLocationOnResolvedGround(
    lat: number, lon: number, opts: { instant?: boolean },
  ): Promise<void> {
    let groundBase = 0;
    try {
      await this.maybeAttachTerrainProvider(lat, lon); // idempotent shared attach; no-op on flat cities.
      const v = this.viewer;
      if (this.isViewerLive() && v) {
        const provider = v.terrainProvider as Cesium.TerrainProvider | undefined;
        if (provider && this.terrainProviderHasElevationData(provider)) {
          const [r] = await Cesium.sampleTerrainMostDetailed(provider, [Cesium.Cartographic.fromDegrees(lon, lat)]);
          const h = r?.height;
          if (typeof h === 'number' && Number.isFinite(h)) groundBase = h;
        }
      }
    } catch { /* stay at ground 0 — flat framing, never worse than before */ }
    // §CAMERA-UNDERGROUND-FIX (L-639) — if this frame RACED the terrain attach and resolved 0 (or a low
    // value) while the settled city ground is already higher, frame relative to the higher settled base so
    // the camera can never park BELOW a high city's terrain (Burgos ~912 m) → frustum-cull → white.
    if (this.formaTerrainBaseHeight > groundBase + 1) groundBase = this.formaTerrainBaseHeight;
    this.frameSiteLocationAtGround(lat, lon, groundBase, opts);
  }

  /** §SITE-FRAME-ON-TERRAIN (L-635) — the actual camera framing, seated at `groundBase + SITE_FRAME_HEIGHT_M`. */
  private frameSiteLocationAtGround(
    lat: number, lon: number, groundBase: number, opts: { instant?: boolean } = {},
  ): void {
    // §GLOBE-CRASH-GUARD — this runs from the deferred `site.location-changed`
    // subscription too, which can land after the viewport is disposed; gate on
    // isViewerLive() (not a bare null-check) so a settle on a torn-down viewer
    // no-ops instead of touching a destroyed camera.
    if (!this.isViewerLive()) return;
    const viewer = this.viewer;
    if (!viewer) return; // isViewerLive() already proved this, kept for TS narrowing.
    const destination = Cesium.Cartesian3.fromDegrees(lon, lat, groundBase + SITE_FRAME_HEIGHT_M);
    const orientation = {
      heading: 0,
      pitch: Cesium.Math.toRadians(SITE_FRAME_PITCH_DEG),
      roll: 0,
    };
    if (opts.instant) {
      viewer.camera.setView({ destination, orientation });
    } else {
      // §SITE-CINEMATIC-ARRIVAL — slow two-stage establishing descent. (a) Jump
      // high straight above the target so the slow flyTo starts from altitude
      // (a "snap from where the camera was" would race across the globe first);
      // then (b) glide down to the framing destination with a decelerating ease.
      // §GLOBE-FRAME-NO-JUMP-2 — this cinematic arrival is OUR programmatic motion
      // (a geocode/location-change flight), NOT the user grabbing the camera. Mark
      // it in-flight so the `moveStart` listener does NOT mis-latch
      // `formaUserMovedCamera` — otherwise a location-change flight that is still
      // gliding when the async photoreal/terrain base-settle resolves would make
      // `performInitialReframe` think the user had taken control and SUPPRESS the
      // one corrective re-frame, stranding the camera at the stale (underground)
      // base. Cleared on complete/cancel, exactly as `flyToFormaSite` does.
      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(lon, lat, groundBase + SITE_ARRIVAL_HIGH_ALT_M),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-90), roll: 0 },
      });
      // §FEAT-GLOBE-DEFAULT-AUTOFRAME (L-226) — token-gated in-flight flag. When the
      // default "3D globe" entry fires its `flyToFormaSite` reframe ~350 ms later, that
      // newer flight CANCELS this still-gliding arrival tween; Cesium then runs THIS
      // flight's `cancel` callback. A bare boolean would clear the shared flag `false`
      // mid-glide of the newer flight, so its `moveStart` mis-latched `formaUserMovedCamera`
      // and the base-settle reframe self-suppressed (camera stuck at Z=0). Token-gating
      // makes this stale cancel a no-op once the reframe flight has superseded it.
      const arrivalToken = this.beginProgrammaticFly();
      const clearArrivalFlag = (): void => { this.endProgrammaticFly(arrivalToken); };
      // §GLOBE-CRASH-GUARD — compose with §GLOBE-FRAME-NO-JUMP-2: if `flyTo` throws
      // synchronously the `complete`/`cancel` callbacks never run, so the in-flight
      // flag would stick `true` forever (the moveStart listener would then never
      // latch `formaUserMovedCamera`). Clear it on a synchronous throw so the flag
      // is released on EVERY exit path.
      try {
        viewer.camera.flyTo({
          destination,
          orientation,
          duration: SITE_ARRIVAL_FLY_DURATION_S,
          easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
          complete: clearArrivalFlag,
          cancel: clearArrivalFlag,
        });
      } catch (e) {
        clearArrivalFlag();
        console.warn('[CesiumViewport] site-arrival flyTo failed; flag cleared:', e);
      }
    }
    viewer.scene.requestRender();
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
      // §CESIUM-PERF-METRIC-TEXTURE-CACHE — the site moved, so cached heatmap fields
      // (keyed by origin) are stale for the fallback (no-massing) origin path. Flush.
      this.invalidateSiteMetricTextureCache();
      // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259, defect ii) — "the house is not in the
      // correct location, NEITHER THE VIEW". This handler used to fly the camera to the
      // event's raw lat/lon UNCONDITIONALLY — i.e. to the geocoded ADDRESS — even when a
      // building was already placed and anchored in the LTP-ENU frame (which, once a boundary
      // is committed, is FROZEN and can differ from the address; see readSiteLocation). It also
      // fires on PROJECT RESTORE (§FIX-GIS-SITE-STATE-NOT-PERSISTED re-emits site.location-
      // changed), so a restored GIS project framed the address while the house sat elsewhere.
      // The camera must follow the BUILDING whenever one is placed — the building IS the site.
      if (this.formaMassingOrigin) {
        const sep = originSeparationMeters(
          { lat: this.formaMassingOrigin.lat, lon: this.formaMassingOrigin.lon },
          { lat: loc.latitude, lon: loc.longitude },
        );
        console.log(
          `[CesiumViewport][georef] site.location-changed with a PLACED building — framing the ` +
            `BUILDING (LTP-ENU anchor), not the address ` +
            `(${Number.isFinite(sep) ? sep.toFixed(1) : '?'} m apart). §L-259 defect (ii).`,
        );
        this.flyToFormaSite();
      } else {
        this.frameSiteLocation(loc.latitude, loc.longitude, { instant: false });
      }
      // MAP-DATA-OVERTURE — refresh the surrounding context buildings for the new
      // site (only while the Forma massing canvas is active; in photoreal the
      // Google/ESRI tiles already show real buildings). Best-effort, guarded.
      if (this.formaMode) {
        void this.loadContextBuildings(loc.latitude, loc.longitude, true);
      } else {
        // §CTX-PREFETCH-ON-LOCATION (L-470) — WARM THE CACHE THE MOMENT THE LOCATION IS KNOWN.
        //
        // THE LATENCY THIS REMOVES: nothing fetched context until the 3D Site actually rendered,
        // i.e. AFTER the parcel was committed — so the founder watched a blank pane for the full
        // round-trip (~10 s on a dense far-extent bbox). But the location is known much earlier:
        // the user then spends tens of seconds drawing or selecting a parcel. That entire window
        // was dead time we were not using.
        //
        // Fire-and-forget, deliberately: this renders NOTHING and touches no entity. It only
        // primes the per-bbox cache in `contextBuildings.ts`, so the later real call — same
        // lat/lon, therefore the same bbox key — becomes a cache HIT instead of a round trip.
        //
        // ⚠ STILL ONE NETWORK QUERY PER SITE (C12 §8). The prefetch and the render read the SAME
        // key; the second is served from cache. This adds no upstream load and no second query —
        // it moves the one query EARLIER, into time the user is already spending.
        void fetchContextBuildingsNearAndFar(loc.latitude, loc.longitude).catch(() => {
          /* never throws by contract; a failed prefetch simply leaves the cache cold */
        });
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
   * §TERRAIN-TOGGLE (founder 2026-07-27) — the user TERRAIN ON/OFF control for the 3D Site.
   * LIVE (no reload):
   *   • OFF → detach the baked terrain provider (revert to the flat ellipsoid), reset the clamp
   *     base to 0, and re-place context at the flat base — the pre-terrain "buildings always
   *     visible on flat ground" study. The escape hatch for high-relief cities.
   *   • ON  → re-attach the baked terrain for the current site + re-clamp/re-place onto it.
   * `depthTestAgainstTerrain` is held OFF in Forma either way (context is never depth-culled),
   * so the ON case shows terrain relief WITH all context + massing rendered on top.
   * The default is ON (terrain everywhere, per L-631); this is the founder's study/escape control.
   */
  public setFormaTerrainEnabled(on: boolean): void {
    const viewer = this.viewer;
    if (!viewer) {
      console.warn('[CesiumViewport] setFormaTerrainEnabled called before mount — ignored.');
      return;
    }
    if (on === this.formaTerrainEnabled) return;
    this.formaTerrainEnabled = on;
    // §CTX-DEPTH-CULL-FIX — the depth test stays OFF in Forma regardless of the toggle so
    // context buildings are never culled under relief when terrain is ON.
    try { viewer.scene.globe.depthTestAgainstTerrain = false; } catch { /* ignore */ }
    console.log(`[CTX-DIAG] terrain toggled → ${on ? 'on' : 'off'}`);
    const at = this.contextBuildingsAt ?? this.formaMassingOrigin;
    if (on) {
      // Re-probe cities (the OFF→detach cleared the attached city; probed-set memo would
      // otherwise skip the re-attach for a city already attached earlier this session).
      this.formaTerrainAttach.clear();
      // §GLOBE-TOGGLE-REFRAME (L-635) — attaching terrain RAISES the ground to the real base
      // (Madrid ~700 m; ~0 on flat cities). The camera is still at its flat-ground (base-0) pose,
      // so on a high-relief city it ends up FAR BELOW the risen terrain → the white grazing
      // "mask" that PERSISTS: Barcelona's ~12 m rise is sub-visible so it self-heals, but
      // Madrid's ~700 m never recovers because the toggle path never re-framed. Arm the one-shot
      // corrective reframe + clear the per-open latches so the terrain-settle re-frames the camera
      // onto the risen ground — the SAME "camera below" mechanism the initial-load defer fixes,
      // now applied to the toggle too. (Only ON needs it: toggling OFF lowers the ground, leaving
      // the camera safely ABOVE it.) The settle terminal (`reframeAfterBaseSettle`) consumes it.
      this.formaInitialReframeFired = false;
      this.formaOffscreenRescueUsed = false;
      this.formaUserMovedCamera = false;
      this.formaReframeOnBaseSettle = 'oblique';
      if (at) void this.maybeAttachTerrainProvider(at.lat, at.lon);
    } else {
      this.detachBakedTerrain();
      // Re-place context at the reset flat base so buildings seat on the ellipsoid ground now.
      if (at) void this.loadContextBuildings(at.lat, at.lon, true);
    }
    viewer.scene.requestRender();
  }

  /** @returns whether the user TERRAIN ON/OFF toggle is currently ON (default true). */
  public isFormaTerrainEnabled(): boolean {
    return this.formaTerrainEnabled;
  }

  /**
   * §TERRAIN-TOGGLE — detach the baked quantized-mesh terrain provider and revert to the default
   * flat `EllipsoidTerrainProvider` (base 0). Mirrors the reset `applyFormaMode` does on the
   * flat-ground study: clears the attached city + sampled-at memo + clamp base so the next clamp
   * treats the ellipsoid surface (0) as ground. Never throws.
   */
  private detachBakedTerrain(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    try {
      viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
    } catch (e) {
      console.warn('[CesiumViewport][terrain] detach failed:', e);
    }
    this.formaTerrainCity = null;
    this.formaTerrainSampledAt = null;
    this.formaTerrainBaseHeight = 0;
    try { viewer.scene.globe.depthTestAgainstTerrain = false; } catch { /* ignore */ }
    // §TERRAIN-NORMALS (L-636) — flat ellipsoid ground has no relief to shade; restore the §2 flat-lit look.
    try { viewer.scene.globe.enableLighting = false; } catch { /* ignore */ }
    console.log('[CesiumViewport][terrain] detached baked terrain → flat ellipsoid ground (base 0), flat-lit.');
    viewer.scene.requestRender();
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
      // §CTX-DEPTH-CULL-FIX (founder 2026-07-27) — HOLD THE TERRAIN DEPTH TEST OFF IN FORMA.
      // With baked relief now draped in Forma (L-631), `depthTestAgainstTerrain = true` culled
      // any extruded context building (and the envelope) whose base sat BELOW the terrain mesh —
      // exactly the Madrid/Zürich failure (~650 m baked ground buried the base-0 footprints, so
      // roads drape-rendered flat but buildings vanished). Barcelona's low relief never tripped it.
      // Turning the depth test OFF renders context + massing on top of the visible terrain in ALL
      // cities; the only cosmetic cost is a footprint may visually intersect a steep slope — vastly
      // better than vanishing, and it matches how low-relief Barcelona already looks. The flat/
      // terrain-OFF path is unaffected (no relief to test against). §SITEFRAME reseat (deferred) is
      // the eventual per-footprint in-place seat that would let the depth test return safely.
      globe.depthTestAgainstTerrain = false;
    } catch (e) {
      console.warn('[CesiumViewport][forma] ground/imagery config failed:', e);
    }

    // §A.21.D43(a) — RESET the base height to the FLAT Forma ground (0).
    // `formaTerrainBaseHeight` is a persistent instance field that the PHOTOREAL
    // "3D globe" path writes a non-zero value into (the sampled Google-3D-Tiles
    // MESH height — see clampToPhotorealTilesThenReplace). When the user then
    // switches BACK to the Forma flat-ground study (whose ground is the ellipsoid
    // surface at height 0, NOT sampled terrain), that leftover photoreal height
    // leaked in as the seat for BOTH the proposed massing and the context boxes —
    // so they floated ABOVE the grey ground with a shadow gap underneath (founder
    // regression). The keyless Forma terrain clamp resolves to 0 anyway (ellipsoid
    // provider), so 0 is the correct flat-ground base. We also clear the sampled-at
    // memo so the next Forma terrain clamp doesn't early-out thinking it's already
    // seated. The globe/photoreal path is unaffected: it re-samples + re-seats on
    // entry (restorePhotorealMode → renderBuildingOnGlobe → clampToPhotorealTiles).
    this.formaTerrainBaseHeight = 0;
    this.formaTerrainSampledAt = null;
    // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — the base just went back to the ellipsoid
    // 0 that the FORMA flat-ground study legitimately uses. That is NOT a measured GLOBE ground:
    // the next photoreal-globe entry must re-measure the tile ground before it may anchor there.
    this.globeGroundResolved = false;
    this.globeGroundSource = 'unresolved';
    this.globeBuildingHiddenForGround = false;
    // §GLOBE-FIRST-FRAME-BASE — drop any pending one-shot re-frame across the mode
    // switch; the next placement re-arms it if it frames against an unresolved base.
    this.formaReframeOnBaseSettle = null;
    // §GLOBE-FRAME-NO-JUMP — the next framing open re-arms these (in renderFormaMassing);
    // clearing here keeps a half-finished prior run from leaking its latch across the switch.
    this.formaInitialReframeFired = false;
    this.formaOffscreenRescueUsed = false;
    this.formaUserMovedCamera = false;
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

    // --- Sky / background: soft neutral gradient backdrop (§2 + §FORMA-SCENE-QUALITY). ---
    try {
      // SkyBox.show is missing from the class in cesium's generated .d.ts
      // (emitted as a stray module-level `var show`); access via a safe cast.
      if (scene.skyBox) (scene.skyBox as unknown as { show: boolean }).show = false;
      if (scene.skyAtmosphere) scene.skyAtmosphere.show = false;
      if (scene.sun) scene.sun.show = false;
      if (scene.moon) scene.moon.show = false;

      // §FORMA-SCENE-QUALITY (ADR-0089) — SOFT GROUND-AO / DEPTH GRADIENT via fog.
      // Cesium's SSAO post-process is the fragile path (it crashes on some GPUs,
      // see §FORMA-AO-OPT-IN); fog is the robust, GPU-agnostic way to get the
      // reference's "gentle gradient toward the horizon" so far massing melts into
      // the ground plane instead of meeting a hard line. Very light density, high
      // minimum brightness, and a neutral tint matched to the sky horizon so it
      // reads as atmospheric depth, never as haze or black.
      scene.fog.enabled = true;
      scene.fog.density = FORMA_QUALITY.fogDensity;
      const fogAny = scene.fog as unknown as { minimumBrightness?: number; color?: Cesium.Color };
      if ('minimumBrightness' in fogAny) fogAny.minimumBrightness = FORMA_QUALITY.fogMinBrightness;
      if ('color' in fogAny) fogAny.color = Cesium.Color.fromCssColorString(FORMA_QUALITY.fogColor);

      // §FORMA-SCENE-QUALITY — the soft VERTICAL SKY GRADIENT backdrop. Cesium's
      // WebGL canvas clears to `backgroundColor` (a single flat colour), so a true
      // gradient sky is painted as a CSS background on the container and revealed
      // through the (alpha) canvas. We therefore set the scene clear colour to
      // TRANSPARENT so the gradient shows; the flat FORMA_PALETTE.background stays
      // as the no-alpha fallback (a GPU/context without alpha clears opaque to it,
      // still a clean neutral, never black). Robust on BOTH backends: Cesium is
      // WebGL regardless of the BIM editor's WebGPU renderer, and a transparent
      // clear is a core GL feature.
      scene.backgroundColor = Cesium.Color.TRANSPARENT;
      this.applyFormaSkyBackdrop(true);
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

    // --- Shadows: SOFT GRADIENT contact shadows (§2 Shadows + §FORMA-SCENE-QUALITY). ---
    try {
      // §FORMA-GRAZING-BANDING-FIX (founder 2026-06-30) — depth precision FIRST. The
      // initial Forma fly-in lands at a LOW oblique angle (pitch ≈ −68°); at that
      // grazing angle the flat ground + context-building faces showed horizontal LINE
      // BANDING. Root cause is twofold (both worst at grazing angles): (1) shadow-map
      // projective aliasing / self-shadow acne on the large flat receiver, and (2)
      // depth-buffer z-fighting between near-coplanar surfaces. A logarithmic depth
      // buffer keeps Z precision even across the wide near/far span of a site scene, so
      // coplanar ground vs context bases stop fighting. Cesium defaults it ON, but the
      // photoreal/globe entry path or a prior frustum tweak can leave it off — assert it.
      scene.logarithmicDepthBuffer = true;

      viewer.shadows = true;
      const sm = scene.shadowMap;
      if (sm) {
        sm.enabled = true;
        sm.softShadows = true;
        // §FORMA-GRAZING-BANDING-FIX — 4096 over the WHOLE default 5 km shadow volume
        // gave very low texel density on the ground, so each shadow-map texel projected
        // into long thin strips across the flat receiver → the horizontal moiré bands at
        // grazing angles. Two coordinated fixes:
        //   • `maximumDistance` — clamp the shadow volume to the SITE scale (~600 m, the
        //     fly-in framing height) instead of 5 km. The same map now covers ~70× less
        //     area, so texel density (and therefore the sampling rate on the flat ground)
        //     rises dramatically and the projective aliasing bands collapse. `fadingEnabled`
        //     softens the cut-off so distant context fades rather than hard-clipping.
        //   • `size` 2048 — at the clamped distance 2048² is already FINER per-metre than
        //     4096 was over 5 km, and a smaller map further reduces the moiré (fewer texels
        //     stretched per ground pixel = less aliasing). Cheaper, and crisper here.
        sm.size = 2048;
        sm.maximumDistance = 600;
        sm.fadingEnabled = true;
        // §FORMA-GRAZING-BANDING-FIX — NORMAL-OFFSET bias is THE Cesium knob that kills
        // self-shadow acne on a flat receiver: it pushes the shadow comparison along the
        // surface normal so a coplanar lit ground doesn't shadow itself into stripes.
        // Cesium defaults it on, but assert it explicitly (the founder symptom is exactly
        // flat-surface self-shadowing at grazing angles).
        sm.normalOffset = true;
        // §FORMA-SCENE-QUALITY (ADR-0089) — the founder's #1 ask is "soft GRADIENT
        // shadowing", not a hard graphite cast. `darkness` = fraction of light
        // remaining in shadow; FORMA_QUALITY.shadowDarkness (0.34) is a touch
        // lighter than the old 0.30 so the PCF soft edge reads as a falloff
        // gradient under eaves/in crevices rather than a stark silhouette — still
        // clearly present. Combined with the fog ground-AO gradient above, this is
        // the robust "gradient shadowing" that holds even when SSAO can't compile.
        sm.darkness = FORMA_QUALITY.shadowDarkness;
        // Wider PCF tap radius softens the penumbra (Cesium exposes it loosely).
        const smAny = sm as unknown as { softShadowSamples?: number; _pointBias?: unknown };
        if ('softShadowSamples' in smAny && typeof smAny.softShadowSamples === 'number') {
          smAny.softShadowSamples = Math.max(smAny.softShadowSamples ?? 0, FORMA_QUALITY.shadowSoftBlur);
        }
      }
    } catch (e) {
      console.warn('[CesiumViewport][forma] shadow config failed:', e);
    }

    // --- Post-process: AO + silhouette (FEATURE-DETECTED; degrade gracefully). ---
    // §FORMA-AO-OPT-IN (ADR-0087) + §FORMA-SCENE-QUALITY (ADR-0089) — AO now
    // defaults ON because it is the founder's #1 "gradient shadowing in the
    // crevices" ask, but ONLY through the full capability path: it is built only
    // when wanted AND not already faulted; ensureFormaPostProcess() further gates
    // on `isAmbientOcclusionSupported(scene)` (WEBGL_depth_texture); and the
    // §FORMA-RENDER-ERROR-GUARD sheds it + latches `formaPostProcessFaulted` on the
    // FIRST compile failure, so a GPU that can't compile HBAO degrades to the soft
    // directional shadows + fog ground-AO gradient (never the render-stop overlay).
    // `window.__pryzmFormaAO === false` is the explicit force-OFF override.
    const aoWanted = this.formaAoOptIn && !this.formaPostProcessFaulted;
    this.ensureFormaPostProcess(aoWanted);
    if (this.formaAoStage) this.formaAoStage.enabled = aoWanted;
    if (this.formaSilhouetteComposite) this.formaSilhouetteComposite.enabled = !this.formaPostProcessFaulted;

    const aoLabel = this.formaPostProcessFaulted
      ? ', AO=disabled (render-error guard → fog+shadow gradient)'
      : !this.formaAoOptIn
        ? ', AO=off (forced via window.__pryzmFormaAO=false)'
        : this.formaAoStage
          ? ', AO (gradient shadowing)'
          : ', AO=unavailable (GPU → fog+shadow gradient)';
    console.log(
      '[CesiumViewport] FORMA mode applied: neutral ground ' + FORMA_PALETTE.ground +
        ', soft sky-gradient backdrop, fog ground-AO, soft shadows 2048@600m (§FORMA-GRAZING-BANDING-FIX)' +
        aoLabel +
        (this.formaSilhouetteComposite && !this.formaPostProcessFaulted ? ', silhouette' : ', silhouette=unavailable') + '.'
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

    // FORMA.6 — leaving the Forma flat-ground study: drop the study real model so it
    // never lingers over the photoreal globe (the globe has its OWN realModelOnGlobe
    // overlay). Harmless no-op when no Forma real model is placed.
    try { this.clearRealModelOnForma(); } catch { /* already gone */ }

    // §CESIUM-VIEW-SOUNDNESS (founder 2026-07-01) — the site-analysis overlays (ground
    // sun-hours/temperature/wind heatmap + the §FORMA-FACADE-ANALYSIS façade texture) are
    // FORMA-STUDY overlays painted on the flat ENU ground. They must NOT linger over the
    // photoreal globe (they'd float as a stray coloured disc + tower skin on the tiles).
    // Clear them on the way out; re-entering Forma re-paints whatever was toggled ON via
    // refreshActiveClimateOverlays, so this is fully reversible. Also un-suppress the
    // building materials (the façade study may have hidden them) so nothing is left
    // invisible if the study re-runs later.
    try {
      this.clearSiteMetricOverlay();
      this.clearFacadeAnalysis();
      if (this.facadeSuppressingMassing) this.setBuildingMaterialsVisibleForFacade(true);
    } catch (e) {
      console.warn('[CesiumViewport][forma] leaving-Forma overlay clear failed:', e);
    }

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
      // §GLOBE-FIRST-FRAME-COLOUR — brand-safe base instead of pure black so a
      // photoreal restore before tiles re-stream doesn't flash black.
      globe.baseColor = Cesium.Color.fromCssColorString(GLOBE_LOADING_COLOUR);
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
      // §FORMA-SCENE-QUALITY (ADR-0089) — leaving Forma: turn the soft ground-AO
      // fog back OFF (the photoreal/globe path runs without it here) and remove the
      // CSS sky-gradient backdrop so the photoreal canvas paints over an opaque
      // clear colour again (not a transparent-revealed gradient).
      scene.fog.enabled = false;
      this.applyFormaSkyBackdrop(false);
      // §GLOBE-FIRST-FRAME-COLOUR — brand-safe OPAQUE background, not pure black.
      scene.backgroundColor = Cesium.Color.fromCssColorString(GLOBE_LOADING_COLOUR);
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
    // OSM context-building overlay. WHEN the Google Photorealistic 3D Tiles
    // actually LOADED (§A.21.D-GLOBE3 `photorealTilesActive` — ion-token OR
    // google-key path) they already show real 3D buildings, so the overlay is
    // redundant + DUPLICATES the tiles → clear it. On the KEYLESS path (or when a
    // credential was set but the tiles never streamed) the ESRI satellite is FLAT
    // (no 3D buildings), so the "3D globe" would show "only a 2D map" — KEEP +
    // (re)load the extruded overlay so the globe still has 3D context buildings.
    // (Gating on the REAL tiles-active flag, not merely a credential being present,
    // means a failed/blocked tile stream still gets the keyless OSM context.)
    try {
      if (this.photorealTilesActive) {
        this.contextBuildingsAbort?.abort();
        this.clearContextBuildings();
        this.contextBuildingsAt = null;
        // FORMA-CTX road-leak fix (2026-06-17) — the OSM road centre-lines are a FORMA-only
        // context overlay; on the photoreal globe the 3D tiles already show the real roads, so
        // the grey Forma lines must be cleared too (they were leaking onto the tiles as floating
        // white ways — the founder's "overlapping layer present in 3D tiles"). Mirrors the
        // context-buildings suppression directly above; idempotent.
        this.contextRoadsAbort?.abort();
        this.clearContextRoads();
        this.contextWaterAbort?.abort();
        this.clearContextWater();
        // §FORMA-CTX-PARKS — same FORMA-only suppression on the photoreal globe (the
        // 3D tiles already show the real green space).
        this.contextParkAbort?.abort();
        this.clearContextParks();
        this.contextLanduseAbort?.abort();
        this.clearContextLanduse();
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
   *
   * §FORMA-AO-OPT-IN (ADR-0087) — the AO stage is only CONSTRUCTED when
   * `buildAo` is true (it defaults OFF because its fragment shader crashes the
   * Cesium render loop on some GPUs). Silhouette is always built.
   */
  private ensureFormaPostProcess(buildAo: boolean): void {
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
    if (buildAo && !this.formaAoStage) {
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
   * §FORMA-RENDER-ERROR-GUARD (ADR-0087) — keep the Cesium render loop ALIVE
   * when a post-process fragment shader fails to compile.
   *
   * Cesium treats a shader-compile failure (e.g. the AO HBAO gaussian shader on
   * an unsupported GPU/driver) as FATAL: it raises `scene.renderError`, calls
   * `showErrorPanel`, and STOPS the render loop — so one optional cosmetic
   * effect would blank the entire Forma massing view ("Rendering has stopped").
   *
   * We subscribe to `scene.renderError` and, on any render error, DISABLE the
   * Forma post-process stages (AO + silhouette), mark the post-process as
   * faulted so apply/restore never re-enables them, and request a fresh render.
   * The massing geometry + shadows still draw; only the broken effect is shed.
   * Cesium re-arms its render loop on the next `requestRender()`, so dropping
   * the faulty stage restores the view. Failures here are non-fatal.
   */
  private installRenderErrorGuard(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const scene = viewer.scene;
    // `renderError` is a Cesium Event<(scene, error) => void>; the generated
    // .d.ts types it loosely — addEventListener returns a remover function.
    const evt = (scene as unknown as {
      renderError?: { addEventListener?: (cb: (scene: unknown, error: unknown) => void) => (() => void) };
    }).renderError;
    if (!evt || typeof evt.addEventListener !== 'function') {
      console.warn('[CesiumViewport][forma] scene.renderError unavailable — cannot install render-error guard.');
      return;
    }
    try {
      const remover = evt.addEventListener((_scene: unknown, error: unknown) => {
        // Only act once — and only when a post-process stage is actually live.
        if (this.formaPostProcessFaulted) return;
        const hadPostProcess =
          (this.formaAoStage?.enabled ?? false) || (this.formaSilhouetteComposite?.enabled ?? false);
        this.formaPostProcessFaulted = true;
        console.error(
          '[CesiumViewport][forma] §FORMA-RENDER-ERROR-GUARD: render error caught ' +
            '(likely a post-process shader compile failure) — disabling AO + silhouette ' +
            'and keeping the scene rendering. Error:',
          error
        );
        try {
          if (this.formaAoStage) this.formaAoStage.enabled = false;
          if (this.formaSilhouetteComposite) this.formaSilhouetteComposite.enabled = false;
        } catch (e) {
          console.warn('[CesiumViewport][forma] disabling faulted post-process failed:', e);
        }
        // Re-arm the render loop so the massing redraws without the broken stage.
        if (hadPostProcess) {
          try {
            this.viewer?.scene.requestRender();
          } catch (e) {
            console.warn('[CesiumViewport][forma] requestRender after render-error failed:', e);
          }
        } else {
          // §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — the render error is NOT a Forma
          // post-process stage (no AO/silhouette live). This is the "Fragment shader failed to
          // compile. Compile log: null" class that hits when Cesium's WebGL context was reset
          // under it (a GPU-process reset from a BIM-side WebGPU device loss). Shedding a
          // post-FX stage cannot fix it — Cesium latches "Rendering has stopped". Attempt a
          // bounded viewer RE-INIT against the (now settled) GPU instead of a dead end.
          console.error(
            '[CesiumViewport] §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE render error is NOT a ' +
            'post-process stage (likely a GPU-reset shader-compile failure) — attempting a ' +
            'viewer re-init instead of halting. Error:', error,
          );
          void this.recoverFromGpuReset('renderError');
        }
      });
      this.renderErrorSub = typeof remover === 'function' ? remover : null;
      console.log('[CesiumViewport][forma] §FORMA-RENDER-ERROR-GUARD installed (post-process crashes are non-fatal).');
    } catch (e) {
      console.warn('[CesiumViewport][forma] failed to install render-error guard:', e);
    }
  }

  /**
   * §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — resolve once the BIM/WebGPU renderer is
   * live (not mid device-loss recovery). `createRenderer` sets `globalThis.__pryzmRendererRecovering`
   * for the whole loss→rebind window; poll it (cheap) up to `maxWaitMs`, then proceed regardless
   * so a stuck flag can never permanently block the globe. Resolves immediately when the flag is
   * already clear — the overwhelmingly common path.
   */
  /**
   * §SS-FIX-RECOVERY-LOOP-TERMINAL-STATE (L-324 P4) — TRUE once the BIM renderer's device-loss
   * recovery has hit its TERMINAL cap: the browser has blocked all page GL contexts ("Web page
   * caused context loss and was blocked"), so no fresh WebGPU/WebGL context can be acquired. The
   * render agent (L-324 P3, `createRenderer.ts`) owns SETTING `globalThis.
   * __pryzmRendererTerminalReloadRequired` when the device-loss cap trips into that blocked state;
   * Cesium only READS it (never sets it) to gate its own re-mount. Defensive + additive: absent/
   * false → the normal recovery path runs, so nothing regresses. Mirrors the existing
   * `__pryzmRendererRecovering` read in `_awaitRendererLive`.
   */
  private _rendererRecoveryTerminal(): boolean {
    try {
      return (globalThis as unknown as { __pryzmRendererTerminalReloadRequired?: boolean })
        .__pryzmRendererTerminalReloadRequired === true;
    } catch {
      return false;
    }
  }

  private async _awaitRendererLive(maxWaitMs: number): Promise<void> {
    const recovering = () =>
      (globalThis as unknown as { __pryzmRendererRecovering?: boolean }).__pryzmRendererRecovering === true;
    if (!recovering()) return;
    console.warn(
      '[CesiumViewport] §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE renderer is mid device-loss ' +
      `recovery — deferring globe activation (up to ${maxWaitMs} ms) so Cesium's first shader ` +
      'compile lands on a settled GPU.',
    );
    const start = Date.now();
    while (recovering() && Date.now() - start < maxWaitMs) {
      await new Promise<void>((r) => setTimeout(r, 100));
    }
    console.log(
      '[CesiumViewport] §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE globe activation gate released ' +
      `after ${Date.now() - start} ms (recovering=${recovering()}).`,
    );
  }

  /**
   * §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — attach WebGL context-loss recovery to the
   * Cesium canvas. Without this, a GPU-process reset (e.g. a BIM-side WebGPU device loss) that
   * takes Cesium's WebGL context down leaves Cesium permanently dead: the browser does NOT
   * restore a lost context unless `webglcontextlost` is `preventDefault()`-ed. We preventDefault
   * (so the browser fires `webglcontextrestored`) and, on restore — or on the first non-post-
   * process render error after a reset — re-initialise the viewer against the settled GPU.
   */
  private installContextLossGuard(): void {
    const canvas = this.viewer?.scene?.canvas as HTMLCanvasElement | undefined;
    if (!canvas || typeof canvas.addEventListener !== 'function') {
      console.warn('[CesiumViewport] §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE canvas unavailable — context-loss guard not installed.');
      return;
    }
    const onLost = (e: Event) => {
      // CRITICAL: preventDefault makes the loss RECOVERABLE (else the browser never restores).
      try { e.preventDefault(); } catch { /* older browsers */ }
      console.error('[CesiumViewport] §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE Cesium WebGL context LOST — preventing default so the browser can restore it.');
    };
    const onRestored = () => {
      console.warn('[CesiumViewport] §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE Cesium WebGL context RESTORED — re-initialising the viewer.');
      void this.recoverFromGpuReset('webglcontextrestored');
    };
    canvas.addEventListener('webglcontextlost', onLost, false);
    canvas.addEventListener('webglcontextrestored', onRestored, false);
    this.contextLossSub = () => {
      try { canvas.removeEventListener('webglcontextlost', onLost, false); } catch { /* detached */ }
      try { canvas.removeEventListener('webglcontextrestored', onRestored, false); } catch { /* detached */ }
    };
    console.log('[CesiumViewport] §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE context-loss guard installed.');
  }

  /**
   * §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — best-effort re-initialise the Cesium viewer
   * after a GPU reset / context loss so the globe recovers instead of dead-ending on Cesium's
   * "Rendering has stopped" panel. Re-entrancy-guarded (one re-init at a time); waits for the BIM
   * renderer to be live; disposes + re-mounts against the settled GPU and restores GIS
   * visibility. Never throws — a failed re-init logs and leaves the prior state (no worse than
   * the dead-end panel it replaces).
   */
  private async recoverFromGpuReset(source: string): Promise<void> {
    if (this.gpuRecoveryInFlight) return;
    // §SS-FIX-RECOVERY-LOOP-TERMINAL-STATE (L-324 P4) — do NOT attempt a fresh WebGL context for
    // Cesium while the renderer's device-loss recovery has hit its TERMINAL cap. Once the browser
    // reports "Web page caused context loss and was blocked" the render agent (L-324 P3) sets the
    // terminal flag; re-mounting Cesium here would spend one more context-creation attempt against
    // an already-blocked page, deepening the block and keeping the "RECOVERING RENDERER…" cascade
    // alive with no exit. Skip the re-mount and leave the honest reload CTA in place.
    if (this._rendererRecoveryTerminal()) {
      console.error(
        `[CesiumViewport] §SS-FIX-RECOVERY-LOOP-TERMINAL-STATE (L-324) renderer recovery is TERMINAL ` +
        `(page GL contexts blocked) — SKIPPING Cesium re-mount after ${source} (a reload is required).`,
      );
      return;
    }
    this.gpuRecoveryInFlight = true;
    console.warn(`[CesiumViewport] §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE recovering Cesium after ${source} …`);
    try {
      await this._awaitRendererLive(12_000);
      // The renderer may have gone terminal DURING the settle wait — re-check before touching GL.
      if (this._rendererRecoveryTerminal()) {
        console.error(
          '[CesiumViewport] §SS-FIX-RECOVERY-LOOP-TERMINAL-STATE (L-324) renderer went TERMINAL ' +
          'during the recovery wait — aborting Cesium re-mount (a reload is required).',
        );
        return;
      }
      try { this.dispose(); } catch (e) { console.warn('[CesiumViewport] recovery dispose failed:', e); }
      // Clear any residual child nodes so the re-mount does not stack internal containers.
      try { while (this.container.firstChild) this.container.removeChild(this.container.firstChild); }
      catch { /* best-effort */ }
      await this.mount();
      try { this.setVisible(true); } catch (e) { console.warn('[CesiumViewport] recovery setVisible failed:', e); }
      console.log('[CesiumViewport] §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE Cesium re-initialised — rendering resumed.');
    } catch (e) {
      console.error('[CesiumViewport] §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE Cesium re-init failed (leaving prior state):', e);
    } finally {
      this.gpuRecoveryInFlight = false;
    }
  }

  /**
   * §FORMA-SCENE-QUALITY (ADR-0089) — paint (or clear) the soft vertical sky
   * GRADIENT backdrop on the Cesium container.
   *
   * Cesium's WebGL canvas clears to a single flat `scene.backgroundColor`, so a
   * true gradient sky (the Spacio/Forma reference backdrop) is a CSS background
   * on the container, revealed through the canvas wherever Forma mode sets the
   * scene clear colour to TRANSPARENT. This is robust on both backends: Cesium is
   * always WebGL (independent of the BIM editor's WebGPU renderer) and a
   * transparent clear + CSS backdrop is core-platform, not GPU-feature-gated.
   *
   * `on=false` removes the gradient (restores the container's opaque base) so the
   * photoreal globe paints over a solid clear colour again. Best-effort + safe to
   * call before/after the viewer exists. Span-free (UI DOM styling, no async/IO —
   * matches this file's other private UI helpers).
   */
  private applyFormaSkyBackdrop(on: boolean): void {
    try {
      const el = this.container;
      if (!el) return;
      if (on) {
        // Remember the previous opaque background once so a later clear restores it.
        if (this.formaPrevContainerBg === null) {
          this.formaPrevContainerBg = el.style.background || '';
        }
        el.style.background = buildFormaSkyGradientCss();
      } else if (this.formaPrevContainerBg !== null) {
        el.style.background = this.formaPrevContainerBg;
        this.formaPrevContainerBg = null;
      }
    } catch (e) {
      console.warn('[CesiumViewport][forma] applyFormaSkyBackdrop failed:', e);
    }
  }

  /**
   * §A.21.D-GLOBE3 — resolve the fill `Cesium.Color` for a massing element.
   *
   * On the photoreal "3D globe" (`useReal` = the keepPhotoreal path) the building
   * should read in its REAL editor material colours: prefer the element's own
   * `materialColor` hex, else the BIM builder's default for that element type
   * (`fallbackReal`). On the Forma flat-ground STUDY path (`useReal` false) we keep
   * the abstract massing palette (`formaColor`) exactly as before. Never throws —
   * a malformed hex degrades to the supplied Forma colour. `alpha`, when given,
   * is applied to the resolved colour (e.g. furniture / glazing translucency).
   */
  private resolveMassFill(
    useReal: boolean,
    materialColor: string | undefined,
    fallbackReal: string,
    formaColor: Cesium.Color,
    alpha?: number,
  ): Cesium.Color {
    if (!useReal) return alpha !== undefined ? formaColor.withAlpha(alpha) : formaColor;
    const hex = materialColor && materialColor.trim() ? materialColor : fallbackReal;
    try {
      const c = Cesium.Color.fromCssColorString(hex);
      // fromCssColorString returns a transparent/black colour for an unparseable
      // string; guard against an all-zero result by falling back to the Forma fill.
      if (c.red === 0 && c.green === 0 && c.blue === 0 && c.alpha === 0) {
        return alpha !== undefined ? formaColor.withAlpha(alpha) : formaColor;
      }
      return alpha !== undefined ? c.withAlpha(alpha) : c;
    } catch {
      return alpha !== undefined ? formaColor.withAlpha(alpha) : formaColor;
    }
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
      /** §A.21.D-GLOBE3 — the wall's REAL BIM finish hex (the same colour the
       *  three.js editor scene paints for this wall). Used to colour the shell on
       *  the photoreal "3D globe" so the house reads in its real app-scene colours
       *  instead of the abstract Forma white. Ignored on the Forma study path. */
      materialColor?: string;
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
      /** §A.21.D-GLOBE3 — REAL BIM slab finish hex (globe path only). */
      materialColor?: string;
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
      /** §A.21.D-GLOBE3 — REAL BIM roof finish hex (globe path only). */
      materialColor?: string;
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
    /**
     * §FORMA-FULL-HEIGHT (founder 2026-07-01, ADR-0095) — the TRUE total building
     * height in metres (top of the tallest storey above the ground plane). Optional
     * override for the case where the authored `walls` fed to the massing collapse to
     * a SINGLE ground band (e.g. a 40-storey tower whose upper storeys are perf-capped
     * to shell-massing, so only the ground shell walls are present → the shell would
     * otherwise extrude to just one 4 m storey and sink among the tall context). When
     * provided (or derivable from slabs/roofs/real-model below), the massing shell is
     * extruded to this full height (tiled per storey band) and the façade sun-hours
     * study paints across the WHOLE elevation, not just the ground ring.
     */
    fullBuildingHeightM?: number;
    /**
     * C58 §1.14 / STRUCTURAL-SEAM-1 — the BUILDABLE ENVELOPE study volume, as the COMPLETE set of
     * solids to draw, already derived from the whole `BuildableEnvelope` by the pure L2
     * `envelopeToMassing`. This viewport is a DUMB RASTERISER: it extrudes each solid's
     * `[baseHeightM, topHeightM]` (metres above the site datum) through the SAME `toCartesian` ENU
     * projection as the parcel boundary + the white massing (SPEC-BUILDABLE-ENVELOPE-UX §4 — no
     * re-derivation) and reads `style` for hue/fill. It MUST NOT re-derive a height from a scalar and
     * holds NO per-field knowledge of the envelope (tiers / FAR / upper-bound / confidence are all
     * decided upstream). Empty / null → no envelope drawn (unchanged behaviour). Every honesty field
     * — `tiers[]`, `farLimitedHeight_m`, `footprintIsUpperBound`, `maxVolumeM3` — reaches the picture
     * through this one carrier, so no jurisdiction can overstate at the render.
     */
    envelope?: { solids: ReadonlyArray<MassingSolid> } | null;
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

    // §A.21.D49 — on the Forma flat-ground STUDY path (keepPhotoreal falsy) the
    // detailed real model is NOT wanted (study mode is massing-by-design). Drop any
    // lingering real-model primitive so switching from the photoreal globe back to
    // the study view never leaves the detailed house floating over the study blocks.
    if (!input.keepPhotoreal) {
      this.clearRealModelOnGlobe();
    }

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

    // §L-430 slice 2b — θ (project→true north) for THIS massing pass. Read once per render
    // (not per vertex) so a mid-render store change cannot rotate half the building.
    const thetaRad = this.readProjectNorthRad();

    const toCartesian = (x: number, z: number, up: number): Cesium.Cartesian3 => {
      // scene-XZ → ENU local (east, north, up). §L-430: routed through the shared, tested
      // frame boundary (`sceneEnuFrame.ts`) instead of the old inline `east = x, north = −z`,
      // so the authored PROJECT-north geometry is rotated onto TRUE north for the globe.
      // θ = 0 ⇒ identical to the previous inline mapping.
      const { east, north } = sceneXZToEnu(x, z, thetaRad);
      const local = new Cesium.Cartesian3(east, north, up);
      return Cesium.Matrix4.multiplyByPoint(enu, local, new Cesium.Cartesian3());
    };

    // §CTX-LOADING-BADGE (L-524b) — a forma pass is running; if no context footprint has been
    // placed yet, say so rather than presenting empty ground as a finished scene. Cleared by the
    // context render below the moment the first building lands (or by its own no-data branch).
    this.setContextLoadingVisible(this.contextBuildingPlacements.length === 0);

    // §SITE-FRAME-PROBE (L-530) — WHY THIS LOGS RATHER THAN FIXES.
    //
    // Founder 2026-07-21: the plot boundary no longer lines up with the context buildings in the
    // 3D Site. Three mechanisms produce that symptom and they need OPPOSITE fixes, so guessing
    // would be a coin flip:
    //   (1) TRANSLATION — the boundary's scene-XZ was computed against a different origin than the
    //       `originLat/Lon` this ENU frame is built at (the anchor-vs-parcel-centroid split, the
    //       same family as L-521 and L-524a). Symptom: correct shape + correct rotation, offset.
    //   (2) ROTATION — θ (project north) differed between the WRITE (siteDispatch de-rotates the
    //       parcel ring by θ) and this READ. `readProjectNorthRad` has a documented history of
    //       latching 0 forever when the store link is absent at first read. Symptom: correct
    //       position, wrong bearing — very visible in Barcelona, where the Cerdà grid is ~45° off
    //       true north.
    //   (3) NEITHER — context and boundary are both right and the eye is comparing an OSM
    //       footprint set to a cadastral parcel that genuinely disagree.
    //
    // These are distinguishable in one line, so log the frame inputs and let the next test settle
    // it. Cheap, safe, and it converts an argument into a measurement. Never throws — a diagnostic
    // must not be able to blank the site (the §DECOUPLE-ENVELOPE-FROM-CONTEXT lesson, immediately
    // below, was exactly that failure).
    try {
      if (boundary && boundary.length >= 3) {
        let sx = 0;
        let sz = 0;
        for (const p of boundary) {
          sx += p.x;
          sz += p.z;
        }
        const cx = sx / boundary.length;
        const cz = sz / boundary.length;
        const carto = Cesium.Cartographic.fromCartesian(toCartesian(cx, cz, 0));
        const cLat = carto ? Cesium.Math.toDegrees(carto.latitude) : Number.NaN;
        const cLon = carto ? Cesium.Math.toDegrees(carto.longitude) : Number.NaN;
        // Metres between the ENU origin and where the boundary's centroid actually lands. A plot
        // drawn ON its site reads a few tens of metres; hundreds of metres means the boundary was
        // authored against a DIFFERENT origin — mechanism (1).
        const dEast = (cLon - originLon) * 111320 * Math.cos((originLat * Math.PI) / 180);
        const dNorth = (cLat - originLat) * 110540;
        // §SITE-FRAME-PROBE VERDICT (L-536) — THE PROBE NOW ANSWERS ITS OWN QUESTION.
        //
        // The first cut printed origin/θ/centroid/offset and asked the reader to interpret them.
        // That was not enough: it could report `theta=43.71°` on a session where the frames were
        // SPLIT and on one where they were fine, because it never checked θ against the ring.
        //
        // THE INVARIANT THAT SETTLES IT (verified offline on 800 real Catastro parcels,
        // scratchpad/probe-l536-theta.mts, 0 violations): `dispatchParcelBoundary` de-rotates the
        // committed ring by θ, so the STORED ring is square in the authoring frame — and therefore
        // re-deriving θ from the stored ring MUST return ≈ 0. `boundary` here IS that stored ring.
        //
        //   residual ≈ 0            → the ring is de-rotated; applying θ is correct.        CONSISTENT
        //   residual ≈ θ (θ ≠ 0)    → the ring is still in the TRUE frame while θ is being
        //                             applied on top ⇒ DOUBLE ROTATION. This is the L-536
        //                             signature: same origin, same vertex count, bearing off by
        //                             ~θ — which on a 17–43 vertex cadastral outline does not read
        //                             as "rotated", it reads as A DIFFERENT SHAPE from the 2D map.
        //   residual ≠ 0, θ = 0     → the ring WAS de-rotated but θ never reached this viewport
        //                             (the L-446 null-runtime class, or a lost θ write) ⇒ the model
        //                             sits on the globe in PROJECT space. Same visible symptom.
        //
        // The residual is folded into (−45°, +45°] mod 90° by the derivation itself, so a value
        // near ±45° is "as far from square as it is possible to be", not a large number.
        const thetaDeg = (thetaRad * 180) / Math.PI;
        const residualDeg = (deriveProjectNorthAngleFromParcel(boundary) * 180) / Math.PI;
        const SQUARE_TOL_DEG = 0.5;
        const ringIsSquare = Math.abs(residualDeg) <= SQUARE_TOL_DEG;
        const thetaIsZero = Math.abs(thetaDeg) <= SQUARE_TOL_DEG;
        const verdict = ringIsSquare
          ? thetaIsZero
            ? 'CONSISTENT (θ = 0 and the ring is square — an axis-aligned site, or a site with no ' +
              'project north; both are the identity, nothing to disagree about)'
            : 'CONSISTENT (the ring is square in the authoring frame and θ is being re-applied ' +
              'exactly once — the 3D boundary should match the 2D map vertex-for-vertex)'
          : thetaIsZero
            ? '⚠ FRAME SPLIT — θ = 0 HERE but the stored ring is NOT square (residual ' +
              `${residualDeg.toFixed(2)}°), so it WAS de-rotated at commit and this viewport never ` +
              'got the θ back. The parcel is being drawn in PROJECT space on a TRUE-north globe: ' +
              'the 3D Site will not match the 2D map. Suspect the runtime→siteModelStore link ' +
              '(§L-446) or a θ write that never landed.'
            : '⚠ DOUBLE ROTATION — the stored ring is NOT square (residual ' +
              `${residualDeg.toFixed(2)}°) yet θ = ${thetaDeg.toFixed(2)}° is being applied to it. ` +
              'The ring was never de-rotated at commit (or θ is STALE from a PREVIOUS parcel — ' +
              '§L-536-THETA-RESET, the redraw path) so the rotation is happening twice. This is ' +
              'the "3D Site shows a different SHAPE from the 2D map" report.';
        console.log(
          `[CesiumViewport][forma] §SITE-FRAME-PROBE origin=${originLat.toFixed(6)},${originLon.toFixed(6)} ` +
            `theta=${thetaDeg.toFixed(2)}° ringResidual=${residualDeg.toFixed(2)}° ` +
            `boundaryCentroid=${cLat.toFixed(6)},${cLon.toFixed(6)} ` +
            `offsetFromOrigin=${Math.hypot(dEast, dNorth).toFixed(1)} m (E ${dEast.toFixed(1)}, N ${dNorth.toFixed(1)}) ` +
            `verts=${boundary.length}\n` +
            `  FRAME VERDICT: ${verdict}\n` +
            `  TRANSLATION: offset ≫ plot size ⇒ ORIGIN mismatch (L-521 family). offset ≈ the plot's ` +
            `own first-vertex→centroid distance (tens of metres on a city lot) ⇒ fine.\n` +
            `  ⚠ NOT A BUG IF: you are comparing the 2D boundary to the PURPLE volume. That is the ` +
            `buildable ENVELOPE (inset by the setbacks / the Art. 242 profunditat edificable), not ` +
            `the boundary — it is SUPPOSED to be a smaller, simpler shape. Compare the dashed green ` +
            `parcel outline instead. And the 2D PLAN draws the AUTHORING frame, so it is de-rotated ` +
            `by θ from the 2D map BY DESIGN (ADR-0115) — in Barcelona that is ~45°.`,
        );
      }
    } catch {
      /* diagnostic only — never allowed to affect the render */
    }

    // §PLOT-CLEAR-ENVELOPE (L-402c) — project the committed parcel ring to [lon,lat]
    // ONCE (the SAME ENU frame as the OSM footprints), so loadContextBuildings can drop
    // any context building sitting ON the plot (the building the user is replacing),
    // leaving the plot clear for the translucent #6600FF buildable-envelope study
    // volume. Captured here (not re-derived per pan) so pan-refresh + terrain-replace
    // reuse it. Cleared to null when no parcel is drawn.
    //
    // §DECOUPLE-ENVELOPE-FROM-CONTEXT (L-402c fix) — GUARDED. This runs at the TOP of the
    // render pass, BEFORE the parcel boundary + envelope + massing are drawn. An UNCAUGHT
    // throw here (a degenerate cartesian → Cartographic.fromCartesian returning undefined →
    // reading `.longitude` of undefined) would abort the WHOLE pass: no parcel, no envelope,
    // no massing, no context — the "empty 3D Site". The plot-clear is a nice-to-have context
    // filter and must NEVER be able to blank the site. On any failure → null (context stays
    // unfiltered, everything else still renders).
    this.committedParcelLonLat = null;
    if (boundary && boundary.length >= 3) {
      try {
        const projected: Array<[number, number]> = [];
        for (const p of boundary) {
          const carto = Cesium.Cartographic.fromCartesian(toCartesian(p.x, p.z, 0));
          if (!carto) continue; // center-of-ellipsoid / degenerate — skip this vertex.
          projected.push([
            Cesium.Math.toDegrees(carto.longitude),
            Cesium.Math.toDegrees(carto.latitude),
          ]);
        }
        this.committedParcelLonLat = projected.length >= 3 ? projected : null;
      } catch (e) {
        console.warn('[CesiumViewport][forma] parcel→lon/lat projection failed — plot-clear disabled:', e);
        this.committedParcelLonLat = null;
      }
    }

    // §PLOT-CLEAR-ENVELOPE (L-418) — now that the committed parcel is known, RE-APPLY the
    // plot-clear to any context buildings that were ALREADY placed (the "select a parcel from
    // already-loaded 3D context" flow, where context was placed while `committedParcelLonLat`
    // was still null so nothing was suppressed). Hides the on-plot building that would
    // otherwise OCCLUDE the translucent #6600FF buildable envelope; restores hidden entities
    // when the parcel changed/cleared. No re-fetch — loadContextBuildings early-returns when
    // the site hasn't moved. Fully guarded: this is at the TOP of the render pass and MUST NOT
    // be able to blank the site (same invariant as the parcel projection above).
    this.reapplyPlotClearToContext();
    // §PLOT-CLEAR-PHOTOREAL (L-429) — the OSM/entity plot-clear above cannot touch the Google
    // photoreal tile MESH, so cut a parcel-shaped void into the tileset too (or restore it when
    // the parcel cleared). Same committed ring, same never-throw posture.
    //
    // §L-448 — DEFAULT OFF. Founder-reported, twice: clipping the Google tileset does not
    // produce a clean parcel-shaped void. It smears a large blurred quad across the
    // surrounding blocks and shatters the mesh into loose triangles, so the real context —
    // the ENTIRE POINT of the photoreal globe — becomes unreadable. Founder: "I cannot eye
    // test anything."
    //
    // The trade this feature was making is a bad one. It exists so a proposed design is not
    // hidden BEHIND the existing building on the plot; the cost is destroying the legibility
    // of every neighbouring building. A design you cannot judge in context is worth less than
    // one partially occluded by the structure it replaces — and the occlusion case is already
    // handled for OSM/entity context by the plot-clear above, which works correctly.
    //
    // Google's photoreal tiles are a single fused mesh with no per-building segmentation, so
    // a clean per-parcel cut is not something a clipping plane can express at this tile
    // resolution. Doing it properly needs a different mechanism (e.g. classification or a
    // masked overlay), not a tuned clipping volume — so this is switched off rather than
    // adjusted, and re-enabling it is opt-in until that mechanism exists.
    this.applyParcelClipToPhotorealTiles();

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

    // §A.21.D-GLOBE3 — REAL app-scene colours on the photoreal "3D globe". When the
    // building is placed ON the photoreal tiles (keepPhotoreal), colour every
    // element from its REAL BIM material/finish (the same colour the three.js editor
    // scene shows) instead of the abstract Forma white massing. On the Forma
    // flat-ground STUDY path this stays false → the white massing palette is
    // unchanged. (Glazing keeps its translucent tint either way — see below.)
    const useRealColours = input.keepPhotoreal === true;

    // Dominant wall finish hex per storey band (the shell shares one footprint, so
    // it needs ONE colour per band). We pick the most-common non-empty
    // `materialColor` among the band's walls; empty → the BIM wall default. Built by
    // re-grouping the input walls with the SAME elevation tolerance the band grouper
    // uses, so band index i lines up with bands[i].
    const STOREY_BAND_TOL_M = 0.5;
    const bandWallColour = (bandBaseElev: number): string | undefined => {
      const counts = new Map<string, number>();
      for (const w of walls) {
        const elev = typeof w.baseElevation === 'number' && Number.isFinite(w.baseElevation) ? w.baseElevation : 0;
        if (Math.abs(elev - bandBaseElev) > STOREY_BAND_TOL_M) continue;
        const c = w.materialColor && w.materialColor.trim() ? w.materialColor : '';
        if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      let best: string | undefined;
      let bestN = 0;
      for (const [c, n] of counts) if (n > bestN) { bestN = n; best = c; }
      return best;
    };

    // Group walls into storey bands keyed by their (rounded) base elevation. Each
    // band's height = the tallest wall on that storey. Bands are sorted from the
    // ground up so the band index doubles as the floor number for the selector.
    // §NO-PHANTOM-MASSING (L-447) — a nominal band is legitimate ONLY when the project has
    // authored building geometry that simply is not walls (slab-only / roof-only). With nothing
    // authored at all, the nominal band is a building that does not exist, extruded over the
    // parcel and standing between the viewer and the two things that ARE true there: the
    // boundary and the buildable envelope. Founder, three times: "we don't need this white
    // volume — we need the site boundary on 3d site + the buildable volume."
    const hasAuthoredGeometry =
      walls.length > 0 ||
      (input.slabs?.length ?? 0) > 0 ||
      (input.roofs?.length ?? 0) > 0;
    const bands = this.groupWallsIntoStoreyBands(walls, hasAuthoredGeometry);

    // §FORMA-FULL-HEIGHT (founder 2026-07-01, ADR-0095) — BUG 2 ROOT CAUSE + FIX.
    // ROOT CAUSE: the massing shell was extruded from ONLY the storey bands present in
    // the authored `walls`. For a tall tower whose upper storeys are perf-capped to
    // shell-massing (only the GROUND shell walls are authored), every wall sits at
    // baseElevation ≈ 0 → ONE 4 m band → the massing rendered a 4 m stub that sank among
    // the tall OSM context ("the building is under the ground") AND the façade study,
    // which reads `formaStoreyBands`, only painted that 4 m ground ring.
    // FIX: resolve the TRUE full building height from every height signal available
    // (explicit override, slabs' top elevations, roofs, and the placed real model's
    // bounding sphere). If the tallest band tops out MATERIALLY below that, TILE the
    // ground band's footprint upward into stacked storey bands to fill the full height,
    // so BOTH the shell prism AND the façade quads span the whole tower. Multi-storey
    // authored buildings (bands already reach the full height) are untouched.
    const fullBuildingHeightM = this.resolveFullBuildingHeight(input, bands);
    this.tileBandsToFullHeight(bands, fullBuildingHeightM);

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
      // §A.21.D40#1 (mirror-shadow) — the ground-floor band is sunk
      // FORMA_BASE_SINK_M BELOW the grey globe ground so its base never z-fights
      // the ground. With `viewer.shadows = true`, a CLOSED buried bottom face also
      // casts a downward shadow that the ground (the shadow receiver) shows as a
      // large flat grey quad mirrored beneath the house — the "mirror shadow".
      // The buried base is never visible (it's underground), so we simply DROP its
      // bottom face on the sunk ground floor: no buried caster → no mirror shadow,
      // while the visible sides + top still cast the building's real ground shadow.
      const closeBandBottom = bi !== 0;

      // §A.21.D-GLOBE3 — the shell fill for THIS storey: the real wall finish on the
      // photoreal globe, else the white Forma massing fill.
      const bandFill = this.resolveMassFill(
        useRealColours, bandWallColour(band.baseElevation), BIM_DEFAULT_WALL_COLOUR, massFill,
      );

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
              material: bandFill,
              outline: true,
              outlineColor: massOutline,
              outlineWidth: 1.5,
              shadows: Cesium.ShadowMode.ENABLED,
              perPositionHeight: false,
              closeTop: true,
              closeBottom: closeBandBottom, // §A.21.D40#1 — no buried bottom on the sunk ground floor (kills the mirror shadow).
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
        // §A.21.D-SHELL-RING — derive THIS storey's perimeter ring, most-reliable
        // source first:
        //   1. Reconstruct the exterior ring from the band's shell walls (mitred
        //      single polygon — preferred, matches the wall mass exactly).
        //   2. FALLBACK: the storey's FLOOR-PLATE (slab) outer ring. A generated
        //      house ALWAYS authors a floor slab per storey whose outer ring IS the
        //      shell footprint; using it as the extrusion outline gives the SAME
        //      clean single-polygon silhouette when the wall-loop trace can't close
        //      (e.g. interior partitions teed at perimeter nodes defeat the
        //      containment trace → the old "perimeter ring unavailable" log).
        // Only when BOTH are unavailable do we drop to per-wall boxes.
        const wallRing = this.reconstructPerimeterRing(band.walls);
        const ring = wallRing ?? this.slabRingForBand(input.slabs ?? [], band.baseElevation);
        const ringSource = wallRing ? 'wall-loop' : 'floor-slab';
        if (ring && ring.length >= 3) {
          try {
            const positions = ring.map((p) => toCartesian(p.x, p.z, bandBottom));
            const ent = viewer.entities.add({
              name: `pryzm-forma-massing-shell-storey-${bi}`,
              polygon: {
                hierarchy: new Cesium.PolygonHierarchy(positions),
                height: bandBottom,
                extrudedHeight: bandTop,
                material: bandFill,
                outline: true,
                outlineColor: massOutline,
                outlineWidth: 1.5,
                shadows: Cesium.ShadowMode.ENABLED,
                perPositionHeight: false,
                closeTop: true,
                closeBottom: closeBandBottom, // §A.21.D40#1 — no buried bottom on the sunk ground floor (kills the mirror shadow).
              },
            });
            this.formaMassingEntities.push(ent);
            silhouetteTargets.push(ent);
            console.log(`[CesiumViewport][forma] storey ${bi}: shell extruded as a single ${ring.length}-vertex perimeter prism (no corner gaps; ring from ${ringSource}).`);
          } catch (e) {
            console.warn(`[CesiumViewport][forma] storey ${bi} perimeter prism failed — per-wall fallback:`, e);
            this.extrudeWallsAsBoxes(band.walls, bandBottom, baseHeight + band.baseElevation, bi, viewer, toCartesian, bandFill, massOutline, silhouetteTargets, closeBandBottom);
          }
        } else {
          // Neither the wall-loop trace NOR a floor-slab ring was usable (open /
          // degenerate shell AND no matching slab plate) → per-wall boxes.
          console.log(`[CesiumViewport][forma] storey ${bi}: perimeter ring unavailable (no wall-loop, no floor-slab) — falling back to per-wall boxes.`);
          this.extrudeWallsAsBoxes(band.walls, bandBottom, baseHeight + band.baseElevation, bi, viewer, toCartesian, bandFill, massOutline, silhouetteTargets, closeBandBottom);
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
      const isSunkGroundSlab = Math.abs(s.topElevation) < 0.5;
      const top = baseHeight + s.topElevation - (isSunkGroundSlab ? FORMA_BASE_SINK_M : 0);
      const bottom = top - Math.max(0.05, s.thickness);
      // Hide with the storey it sits on (the slab tops the storey BELOW it; use
      // its own elevation for the band lookup — good enough for the selector).
      if (!isBandVisible(bandIndexForElevation(s.topElevation))) continue;
      try {
        const positions = s.ring.map((p) => toCartesian(p.x, p.z, bottom));
        // §A.21.D-GLOBE3 — real slab finish on the globe; white massing in the study.
        const slabFill = this.resolveMassFill(useRealColours, s.materialColor, BIM_DEFAULT_SLAB_COLOUR, massFill);
        const ent = viewer.entities.add({
          name: 'pryzm-forma-slab',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: bottom,
            extrudedHeight: top,
            material: slabFill,
            outline: true,
            outlineColor: massOutline,
            outlineWidth: 1.0,
            shadows: Cesium.ShadowMode.ENABLED,
            perPositionHeight: false,
            closeTop: true,
            // §A.21.D40#1 — a sunk ground-floor slab buried below the grey ground
            // would cast a downward shadow the ground shows as a mirrored grey
            // quad; drop its (invisible, buried) bottom face. Upper slabs keep it.
            closeBottom: !isSunkGroundSlab,
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
      // §A.21.D-GLOBE3 — real roof finish on the globe; white massing in the study.
      const roofFill = this.resolveMassFill(useRealColours, r.materialColor, BIM_DEFAULT_ROOF_COLOUR, massFill);
      try {
        if (r.pitch > 0.01) {
          // Coarse pitched cap: raise a centre "ridge fan" — triangles from each
          // boundary edge up to the footprint centroid, lifted by the rise. This
          // gives a hip-like solid mass without a full roof-geometry build (the
          // exact pitched form lives in the BIM view; the globe is a massing read).
          // §L-430 — deliberately NOT rotated (θ omitted). This call is a round-trip:
          // scene → ENU → scene, used only to get the ring's centroid back in SCENE space
          // for the ridge fan below. Passing θ here without inverting it on the way back
          // would rotate the roof apex off its own footprint — the classic double-rotation
          // defect. The vertices this feeds are converted to ENU later by `toCartesian`,
          // which is where θ is correctly applied exactly once.
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
                material: roofFill,
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
              material: roofFill,
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
            // §A.21.D43(c) — TRANSLUCENT GLAZING FIX. The window glazing material
            // already carries FORMA_GLAZING_ALPHA (0.30), but a Cesium polygon with
            // `outline: true` is drawn through the outlined-geometry pipeline, which
            // renders the FILL OPAQUE regardless of the material's alpha — so the
            // FORMA-mode window insets still read as solid blue panels (founder
            // defect). Dropping the outline on the GLAZING ONLY lets the translucent
            // material path honour the alpha so windows read as real see-through
            // glass. Doors are opaque, so their outline is kept (it reads as the door
            // frame and the alpha-1 fill is unaffected by the outlined pipeline).
            outline: o.kind === 'door',
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
        // §GLOBE-SCOPED-DETAIL (founder 2026-07-01) — SCOPED-AREA FLAT/BLURRY FIX. On the
        // photoreal "3D globe" the flat clamped fill polygon below is a tinted disc laid
        // over the site → the analysed region reads FLAT + washed-out against the crisp
        // surrounding 3D tiles (founder screenshot). Skip the FILL on the photoreal path
        // and keep ONLY the thin dashed OUTLINE (added next), so the photoreal tiles read
        // through the scoped area at full 3D detail. On the Forma flat-ground STUDY path
        // (no tiles) the faint fill still helps read the plot, so we keep it there.
        if (!input.keepPhotoreal) {
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
          this.formaSiteOverlayEntities.add(ent);   // §SITE-OVERLAY-NOT-BUILDING (L-464)
        }

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
        // §SITE-OVERLAY-NOT-BUILDING (L-468) — the DASHED BOUNDARY LINE is site context too.
        // The first pass registered only the flat fill, which is skipped entirely on the
        // photoreal path (`if (!input.keepPhotoreal)` above) — so on the globe, the very place
        // the founder reported the problem, nothing at all was protected.
        this.formaSiteOverlayEntities.add(line);

        // Centroid (ENU metres) + area for the NW oblique flyTo. §L-430 — rotated, so the
        // camera flies to where the plot REALLY is rather than to a rotated copy of it.
        const c = this.polygonCentroidAndAreaXZ(boundary, thetaRad);
        centroidEast = c.east;
        centroidNorth = c.north;
        areaM2 = c.area;
      } catch (e) {
        console.warn('[CesiumViewport][forma] boundary overlay failed:', e);
      }
    }

    // ── C58 §1.14 buildable-envelope study volume — the DUMB RASTERISER ─────────
    // §ENVELOPE-VIA-MASSING (L-402d) / STRUCTURAL-SEAM-1 — the buildable envelope is
    // a set of MASSING VOLUMES built EXACTLY like the storey-band massing prisms above:
    // the SAME `viewer.entities.add({ polygon: { hierarchy, height, extrudedHeight,
    // material } })` construction, the SAME `formaMassingEntities` lifecycle (cleared
    // by `clearFormaMassing` on every re-render), the SAME `toCartesian` ENU frame.
    //
    // ⚠ THIS LOOP HOLDS NO ENVELOPE KNOWLEDGE. Every decision — how many solids, each
    // solid's ring / base / top, its hue, its fill, whether it is an upper-bound study
    // extent, a FAR solid, a legal-ceiling shell, a tier or a flat footprint slab — was
    // made by the pure L2 `envelopeToMassing` and arrives as `input.envelope.solids`.
    // The render never re-derives a height from a scalar (C58 §1.14.2). That inversion
    // is what makes render-side over-statement structurally impossible: every honesty
    // field (`tiers[]`, `farLimitedHeight_m`, `footprintIsUpperBound`, `maxVolumeM3`,
    // `confidence`) reaches the picture through this one carrier, proven non-overstating
    // for every registered pack by `check-envelope-solid-never-overstates`.
    //
    // §L-616 folds in as the `far-massing` + `height-shell` roles; §L-619 (the DK/
    // Copenhagen no-setbacks case) folds in as `style.footprintUpperBound` driving the
    // near-wireframe fill — ONE code path, not two.
    const envSolids = input.envelope?.solids ?? [];
    const envelopePresent = envSolids.length > 0;
    let envelopeEntitiesAdded = 0;
    // The SINGLE colour authority: a solid's hue → the same two colours the flat surfaces use.
    const hueCss = (hue: MassingSolid['style']['hue']): string =>
      hue === 'confident' ? CONFIDENT_VIOLET_CSS : PROVISIONAL_GREY_CSS;
    // Every entity is pushed to BOTH the massing list AND the §SITE-OVERLAY-NOT-BUILDING (L-468)
    // survival set — the buildable envelope is a compliance constraint, not a massing block, so it
    // must survive the "real model supersedes the massing" step. Shadows OFF (a study volume must
    // not cast a solid building shadow). The extrusion is EXACTLY the solid's [base, top]; the base
    // sink (no z-fight) applies only to a ground-touching solid (baseHeightM === 0).
    for (const solid of envSolids) {
      if (!solid.ring || solid.ring.length < 3) continue;
      try {
        const cssHex = hueCss(solid.style.hue);
        const bottom = baseHeight + solid.baseHeightM - (solid.baseHeightM === 0 ? FORMA_BASE_SINK_M : 0);
        const top = baseHeight + solid.topHeightM;
        const positions = solid.ring.map((p) => toCartesian(p.x, p.z, bottom));
        const e = viewer.entities.add({
          name: solid.id,
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: bottom,
            extrudedHeight: top,
            material: Cesium.Color.fromCssColorString(cssHex).withAlpha(solid.style.fillAlpha),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString(cssHex).withAlpha(1.0),
            outlineWidth: 2,
            shadows: Cesium.ShadowMode.DISABLED,
            perPositionHeight: false,
            closeTop: true,
            closeBottom: true,
          },
        });
        this.formaMassingEntities.push(e);
        this.formaSiteOverlayEntities.add(e);
        envelopeEntitiesAdded += 1;
      } catch (e) {
        console.warn(`[CesiumViewport][forma] envelope solid "${solid.id}" failed — skipped:`, e);
      }
    }
    if (envelopePresent) {
      const roles = envSolids.map((s) => `${s.role}@${s.topHeightM.toFixed(1)}m`).join(', ');
      const upper = envSolids.some((s) => s.style.footprintUpperBound);
      const grey = envSolids.some((s) => s.style.hue === 'provisional');
      console.log(
        `[CesiumViewport][forma] §ENVELOPE-VIA-MASSING (§1.14 rasteriser) drew ${envelopeEntitiesAdded}/` +
          `${envSolids.length} solid(s): [${roles}]${upper ? ' · UPPER-BOUND (max extent)' : ''}` +
          `${grey ? ' · provisional grey' : ' · confident violet'}.`,
      );
    }
    // §ENVELOPE-VIA-MASSING diagnostic — envelope present? entities added? which viewer?
    // The founder's next console tells us EXACTLY where the paned render dies: if this
    // logs `present=y added≥1` on the SAME instanceId the camera framed, the envelope is
    // in the shown viewer and any invisibility is a camera/occlusion issue, not a wrong
    // viewer / short-circuited add.
    console.log(
      `[CesiumViewport][forma] §ENVELOPE-VIA-MASSING render diag: envelope present=${envelopePresent ? 'y' : 'n'}, ` +
        `envelope entities added=${envelopeEntitiesAdded}, total massing entities=${this.formaMassingEntities.length}, ` +
        `viewer=${this.instanceId}, container=${this.container?.id ?? 'n/a'}.`,
    );

    // §SITE-OVERLAY-DATUM-DIAG (L-466) — WHERE, VERTICALLY, DID THE OVERLAY LAND?
    //
    // `present=y added=1` above proves the envelope was DRAWN. It says nothing about whether
    // it is drawn somewhere you can SEE. On the photoreal globe the ground is the Google tile
    // mesh (Barcelona ≈ +57 m ELLIPSOIDAL: ~49 m geoid separation + ~8 m terrain), but the
    // overlay is seated at `formaTerrainBaseHeight`. If the datum never resolved that value is
    // still 0 — the ellipsoid — so the envelope renders ~57 m BENEATH the visible surface and
    // the parcel clip reads as an empty black shaft. Identical symptom to "not rendered", and
    // the existing diag cannot tell them apart. This line can.
    //
    // Deliberately logged on EVERY massing render (not only on failure): the founder's report
    // is "the envelope is not there", and the whole point is that the answer is a NUMBER
    // nobody currently has. C12 §1.4 — an unresolved datum must be visible as unresolved.
    if (input.keepPhotoreal) {
      const unresolved = this.globeGroundSource === 'unresolved' || !this.globeGroundResolved;
      console.log(
        `[CesiumViewport][globe] §SITE-OVERLAY-DATUM-DIAG: site overlay seated at base ` +
          `${baseHeight.toFixed(2)} m ELLIPSOIDAL · groundSource=${this.globeGroundSource} · ` +
          `resolved=${this.globeGroundResolved ? 'y' : 'n'}` +
          (unresolved || Math.abs(baseHeight) < 1e-3
            ? ' — ⚠ BURIED-RISK: the photoreal tile surface is tens of metres above the ellipsoid, ' +
              'so an overlay at ~0 m sits UNDER the visible ground and reads as "not rendered". ' +
              'This is a DATUM failure, not a draw failure (C12 §1.4).'
            : ' — datum measured; overlay should sit on the visible tile surface.'),
      );
    }

    // FIX A.21.D28#2 — `area ≈ 0 m²`. The footprint area + centroid were computed
    // ONLY from the parcel boundary; a house generated from scratch (no drawn
    // parcel) left `areaM2 = 0` and `centroidEast/North = 0`, which (a) logged the
    // wrong footprint and (b) framed the camera + scaled the overlay radius off the
    // site origin instead of the building. When there is no usable boundary area,
    // derive the footprint from the authored geometry's XZ bounding box (walls,
    // else slab rings) — the SAME scene-XZ data the massing already renders.
    if (areaM2 <= 0) {
      const bbox = this.footprintBBoxXZ(walls, slabs, thetaRad);
      if (bbox) {
        centroidEast = bbox.east;
        centroidNorth = bbox.north;
        areaM2 = bbox.area;
      }
    }

    // Feed the proposed-building entities into the FORMA.2 silhouette stage (§3).
    this.setFormaSilhouetteTargets(silhouetteTargets);

    // §CESIUM-PERF-METRIC-TEXTURE-CACHE — the overlay anchor may have moved (new plot
    // / re-located site), so any cached heatmap fields are stale. Flush them; the
    // active metric (if any) recomputes for the new origin, everything else lazily.
    const prevOrigin = this.formaMassingOrigin;
    if (!prevOrigin || prevOrigin.lat !== originLat || prevOrigin.lon !== originLon) {
      this.invalidateSiteMetricTextureCache();
    }
    this.formaMassingOrigin = { lat: originLat, lon: originLon, centroidEast, centroidNorth, areaM2 };

    if (input.frameCentroid) {
      const preset = input.framePreset === 'plan' ? 'plan' : 'oblique';
      // §GLOBE-FRAME-NO-JUMP — a fresh framing open (NOT a `_skipTerrainClamp`
      // re-place, which carries `frameCentroid:false` and never reaches here): RE-ARM
      // the per-open guards so the one corrective re-frame is allowed to fire again,
      // and a stale "user moved" / "already fired" latch from a prior open can't
      // suppress (or, worse, a prior open's view can't be re-flown). The async clamp
      // below settles the real base and fires `performInitialReframe` AT MOST ONCE.
      this.formaInitialReframeFired = false;
      this.formaOffscreenRescueUsed = false;
      this.formaUserMovedCamera = false;
      // §GLOBE-FIRST-FRAME-ABOVE (L-635) — on the Forma baked-terrain path, DEFER the first
      // camera frame to the async ground-settle instead of framing synchronously here. Framing
      // now uses `formaTerrainBaseHeight` = 0 (the terrain sample below hasn't run yet), which
      // seats the camera AND the orbit pivot at the WGS-84 ELLIPSOID. On a terrain-attached city
      // (Madrid ~700 m, Amsterdam offset) that is UNDER the real surface, so the landing is a
      // white grazing wash with the roads/parks/water viewed edge-on and the pivot ~700 m too low
      // — the founder-reported "camera below / pivots around the wrong root / roads-parks gone".
      // Barcelona only ever looked right because base 0 ≈ its real ~12 m ground. The view-activation
      // loading overlay already blocks on `whenGroundSettled()`, so deferring shows a clean loader
      // → then exactly ONE correct above-ground frame: the clamp's terminal (settled / unchanged /
      // flat-ellipsoid-0 alike) funnels through `reframeAfterBaseSettle()` → `performInitialReframe`
      // once, with the settled base. The photoreal 3D-globe path (its ground is the Google mesh,
      // already final) keeps the immediate frame — there is no underground window to avoid there.
      const deferFrameToGroundSettle = !input._skipTerrainClamp && !input.keepPhotoreal;
      if (deferFrameToGroundSettle) {
        this.formaReframeOnBaseSettle = preset;
      } else {
        if (preset === 'plan') this.flyToFormaPlan();
        else this.flyToFormaSite();
        // Arm the one-shot re-frame so a late DIFFERENT base still re-flies once; a re-place
        // pass (`_skipTerrainClamp`) never runs an async clamp, so it must never arm.
        this.formaReframeOnBaseSettle = input._skipTerrainClamp ? null : preset;
      }
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
      // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — an async ground clamp is about to
      // start. ARM the settle signal so `whenGroundSettled()` (awaited by the view-activation
      // loading overlay) blocks until this clamp reaches a terminal, instead of resolving
      // instantly against the stale previous state. Every terminal — seat-and-reveal,
      // base-unchanged, centroid-unchanged, retries-exhausted, crash-guard catch — funnels
      // through `reframeAfterBaseSettle()`, which drains the waiters.
      this.groundClampInFlight = true;
      if (input.keepPhotoreal) {
        // §A.21.D40#3 — on the PHOTOREAL "3D globe" the visible ground is the
        // Google 3D-Tiles MESH, not the terrain provider (which is the keyless
        // ellipsoid → height 0). Placing the building at the terrain height left it
        // sitting at/below the ellipsoid → buried under (and occluded by) the
        // opaque tile mesh, so the house "didn't appear". Sample the height of the
        // loaded TILESET surface at the site and re-seat the building on top of it.
        void this.clampToPhotorealTilesThenReplace(input);
      } else {
        void this.clampTerrainThenReplace(input);
      }
      // MAP-DATA-OVERTURE — surround the proposed massing with real context
      // buildings (keyless OSM). Best-effort + non-blocking; guarded internally.
      // Skipped on the terrain re-place pass (_skipTerrainClamp) so we don't
      // refetch — the terrain clamp re-seats existing context entities cheaply via
      // the unchanged-centre skip.
      //
      // §A.21.D-GLOBE3 (2026-06-08) — DUPLICATION FIX: on the photoreal "3D globe"
      // (keepPhotoreal) WITH the Google 3D-Tiles loaded, the TILES already provide
      // real photoreal buildings for the area, so our own extruded OSM/Overpass
      // boxes would DUPLICATE + overlap them (founder: flat white blocks over the
      // photoreal roofs). SUPPRESS our context extrusions in that case — and tear
      // down any that a prior keyless render left behind so they don't leak onto the
      // tiles. We still render context on the Forma flat-ground STUDY path and on
      // the KEYLESS globe fallback (no tiles), where they are the only context.
      if (input.keepPhotoreal && this.photorealTilesActive) {
        if (this.contextBuildingEntities.length > 0) {
          console.log(
            '[CesiumViewport][globe] §A.21.D-GLOBE3 — photoreal 3D-Tiles active → ' +
              'clearing PRYZM context extrusions (the tiles ARE the context).',
          );
        }
        this.contextBuildingsAbort?.abort();
        this.contextBuildingsAbort = null;
        this.clearContextBuildings();
        this.contextBuildingsAt = null;
      } else {
        // §DECOUPLE-ENVELOPE-FROM-CONTEXT (L-402c fix) — the parcel boundary, buildable
        // envelope and massing are ALREADY drawn synchronously above; context now streams
        // in AFTER, asynchronously (each loader is `void`-fired + guarded internally). Wrap
        // the kickoff so that even a SYNCHRONOUS throw at call time (e.g. constructing a
        // loader) can NEVER unwind back into renderFormaMassing and undo the just-rendered
        // envelope/massing. A slow or failed context load must never block or blank the site.
        try {
          void this.loadContextBuildings(originLat, originLon);
          void this.loadContextRoads(originLat, originLon);   // FORMA-CTX §22.2
          void this.loadContextWater(originLat, originLon);   // FORMA-CTX-WATER
          void this.loadContextParks(originLat, originLon);   // §FORMA-CTX-PARKS
          void this.loadContextLanduse(originLat, originLon); // §FORMA-CTX-LANDUSE (grey urban / brown rural)
        } catch (e) {
          console.warn('[CesiumViewport][forma] context kickoff threw — envelope/massing kept:', e);
        }
      }
    }

    // §A.21.D49 — if the REAL detailed model is on the tiles, this massing render is
    // either (a) the initial pass (real model placed right after) or (b) a clamp
    // re-place that just settled `formaTerrainBaseHeight`. In case (b) re-seat the
    // real model to the new base and re-hide the freshly re-created massing blocks so
    // the abstract pastel mass never resurfaces on top of the detailed model.
    if (input.keepPhotoreal && this.realModelOnGlobe && !this.realModelOnGlobe.isDestroyed()) {
      this.reseatRealModelOnGlobe();
      this.clearFormaMassingEntitiesOnly();
    }

    // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — THE VERTICAL INVARIANT. On the photoreal
    // globe the visible ground is the Google 3D-Tiles MESH (ellipsoidal heights, geoid
    // included), NOT the WGS-84 ellipsoid. Until the tile-height clamp has MEASURED that
    // ground, `formaTerrainBaseHeight` is still its initial 0 = the ellipsoid = ~49 m BELOW
    // mean sea level in the Balearics — so placing the house there buries it (the founder's
    // "we are really close to sea level and it still goes underground"). We therefore HOLD the
    // just-placed building HIDDEN until the datum resolves; `commitPhotorealBase` re-places it
    // at the measured base and reveals it. Never a silent 0.
    if (input.keepPhotoreal && this.globeGroundUnknownWhileTilesShown()) {
      this.holdGlobeBuildingForUnresolvedGround();
    }

    // FORMA.6 — the SAME logic for the FORMA flat-ground study real model. On the
    // study path (keepPhotoreal falsy), if the real full-fidelity model is already
    // placed (case b: a terrain-clamp re-place just settled `formaTerrainBaseHeight`)
    // re-seat it and hide the freshly re-created massing blocks so the pastel mass
    // never resurfaces on top of the detailed model.
    if (!input.keepPhotoreal && this.realModelOnForma && !this.realModelOnForma.isDestroyed() && this.realModelOnForma.show) {
      this.reseatRealModelOnForma();
      this.clearFormaMassingEntitiesOnly();
    }
  }

  /**
   * §A.21.D40#3 — PHOTOREAL "3D globe" height clamp. Unlike the terrain clamp
   * (which samples the terrain PROVIDER — the keyless ellipsoid = height 0), this
   * samples the height of the loaded Google Photorealistic 3D-Tiles MESH at the
   * site via `scene.sampleHeightMostDetailed`, which raycasts against tilesets.
   * The building is then re-seated on TOP of the visible tile ground so it reads
   * as a grounded volume in the real city instead of being buried beneath the
   * tiles. Fully guarded + best-effort:
   *   • API/feature unavailable, sample null/NaN, or no tileset loaded → keep the
   *     current base (no re-place), log once. Never throws, never blanks the view.
   *   • a newer placement supersedes this one (token) → bail.
   */
  /**
   * §GLOBE-TILE-CLAMP-NO-SELF-HIT (ADR-0095) — has the site centroid NOT moved since the
   * given prior clamp? Computes the placement centroid (boundary centroid → lat/lon, or
   * the origin when no boundary) the SAME way the clamp does, and compares to the last
   * sampled point within ~0.1 m. Used to skip a redundant re-sample / re-seat on a mere
   * globe view switch (the creep-up feedback loop). Pure read; guarded/best-effort.
   */
  private centroidUnchangedFor(
    input: Parameters<CesiumViewport['renderFormaMassing']>[0],
    prev: { lat: number; lon: number },
  ): boolean {
    let cLat = input.originLat, cLon = input.originLon;
    try {
      if (input.boundary && input.boundary.length >= 3) {
        const oc = Cesium.Cartesian3.fromDegrees(input.originLon, input.originLat, 0);
        const e = Cesium.Transforms.eastNorthUpToFixedFrame(oc);
        // §L-430 — authored boundary → TRUE-north ENU before it becomes a real lat/lon.
        const ct = this.polygonCentroidAndAreaXZ(input.boundary, this.readProjectNorthRad());
        const cc = Cesium.Matrix4.multiplyByPoint(e, new Cesium.Cartesian3(ct.east, ct.north, 0), new Cesium.Cartesian3());
        const cg = Cesium.Cartographic.fromCartesian(cc);
        cLat = Cesium.Math.toDegrees(cg.latitude);
        cLon = Cesium.Math.toDegrees(cg.longitude);
      }
    } catch { return false; }
    return Math.abs(prev.lat - cLat) < 1e-6 && Math.abs(prev.lon - cLon) < 1e-6;
  }

  /**
   * §FIX-GLOBE-CLAMP-TO-PHOTOREAL-TILES (L-179) — PURE reduction of the photoreal-tile
   * height picks to the building base height. Given every FINITE height sampled off the
   * loaded Google 3D-Tiles surface (via clampToHeightMostDetailed / sampleHeightMostDetailed
   * over the footprint + surrounding street ring) and an optional tileset bounding-sphere
   * ground estimate, returns:
   *   • the MINIMUM finite sample — a building roof is always ABOVE the ground it stands on,
   *     so the min over the footprint+street ring reliably recovers the true street ground
   *     even when the centroid itself is occluded by a neighbouring tile building; else
   *   • the sphere ground estimate when it is finite and materially non-zero (|h| > 1 m — a
   *     bogus ellipsoid-0 sphere must not be mistaken for real ground); else
   *   • null → tiles have not streamed a height at this LOD yet (caller retries).
   * §FIX-GLOBE-AUTOFRAME-AND-SEAT (L-184) — a real tile-surface pick is sunk by `seatEpsilonM`
   * (metres) so the model seats FLUSH rather than perching on tile-mesh noise; the epsilon is
   * NOT applied to the coarse sphere fallback (already downward-biased) nor to a null result.
   * No Cesium, no I/O, deterministic → P8 span-exempt (pure). Unit-tested (globe clamp math).
   */
  static selectPhotorealTileBaseHeight(
    sampledHeights: readonly (number | null | undefined)[],
    sphereGroundHeight: number | null,
    seatEpsilonM = 0,
  ): number | null {
    // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — ONE reduction, now owned by the pure
    // `globeGroundAnchor` module (which also owns the datum + resolved/unresolved decision).
    // This static is preserved as the tested public surface (L-179/L-184) and delegates.
    return reduceTileGroundHeight(sampledHeights, sphereGroundHeight, seatEpsilonM);
  }

  /**
   * §FIX-GLOBE-3DTILES-CRASH (L-183) — run ONE Cesium photoreal-tile height sampler and
   * NEVER let it reject. `clampToHeightMostDetailed` / `sampleHeightMostDetailed` return
   * promises that REJECT/THROW when the 3D-tileset hasn't streamed a height at this LOD, the
   * scene has no depth-testable primitive yet, or the viewer is torn down mid-await — an
   * intermittent race right after the "3D globe" toggle. Because the clamp is invoked via a
   * `void`-ed call, such a rejection would escape as an unhandled window 'error', trip
   * ViewportCrashGuard's consecutive-throw escalation, and reload the whole view (the founder's
   * intermittent "3D globe crashes"). Swallowing it here (→ empty array) lets the caller fall
   * through to its sphere-ground fallback and its retry (tiles stream in) so the globe DEGRADES
   * GRACEFULLY. Both the sampler await AND each per-item `extract` (which calls Cesium math that
   * can throw on a degenerate cartesian) are guarded. Dependency-injected → unit-testable
   * without a live Cesium viewer.
   */
  static async safeSampleTileHeights<T>(
    sampler: (() => Promise<T[]>) | undefined,
    extract: (item: T) => number | null | undefined,
  ): Promise<number[]> {
    if (typeof sampler !== 'function') return [];
    let items: T[];
    try {
      items = await sampler();
    } catch {
      return [];
    }
    const out: number[] = [];
    if (!Array.isArray(items)) return out;
    for (const it of items) {
      let h: number | null | undefined;
      try {
        h = extract(it);
      } catch {
        continue;
      }
      if (typeof h === 'number' && Number.isFinite(h)) out.push(h);
    }
    return out;
  }

  /**
   * §GLOBE-TILE-CLAMP-FLUSH (ADR-0095) — best-effort ground-height estimate from the
   * loaded Google Photorealistic 3D-Tiles primitive's own bounding sphere, used ONLY as
   * a last resort when both height-picking APIs return nothing (keyless ellipsoid → 0).
   * The tileset root bounding sphere centre lat/lon/height gives the ellipsoid height of
   * the tiled region's centre — a much better ground seat than a hard 0. Returns null if
   * no tileset / no sphere. Pure read; guarded.
   */
  private photorealTilesetGroundHeight(): number | null {
    try {
      const ts = this.photorealTileset;
      if (!ts || ts.isDestroyed()) return null;
      const sphere = ts.root?.boundingSphere ?? ts.boundingSphere;
      if (!sphere || !sphere.center) return null;
      const cg = Cesium.Cartographic.fromCartesian(sphere.center);
      if (!cg || typeof cg.height !== 'number' || !Number.isFinite(cg.height)) return null;
      // Sphere centre ≈ ground + half the tiled buildings' height. Bias DOWN by the
      // sphere radius fraction so we approach the ground, not the mid-air centre.
      return cg.height - Math.min(sphere.radius ?? 0, 60) * 0.5;
    } catch {
      return null;
    }
  }

  /**
   * §FIX-GLOBE-3DTILES-CRASH (L-183) — crash-guard WRAPPER. `clampToPhotorealTilesThenReplace`
   * is fired via `void` (from renderFormaMassing and the retry setTimeout), so ANY rejection
   * it produces — a torn-down viewer, a degenerate footprint whose ENU math throws, a transient
   * Cesium throw in the re-place/re-frame tail — would surface as an unhandled window 'error',
   * cross ViewportCrashGuard's consecutive-throw threshold, and reload the whole view (the
   * founder's intermittent "3D globe crashes"). The inner method already swallows the sample
   * awaits; this belt wraps EVERYTHING ELSE so a failure DEGRADES to the flat base 0 (a correct
   * flat-ground seat) instead of crashing. NEVER rejects.
   */
  private async clampToPhotorealTilesThenReplace(
    input: Parameters<CesiumViewport['renderFormaMassing']>[0],
    retriesLeft = GLOBE_GROUND_CLAMP_MAX_RETRIES,
  ): Promise<void> {
    try {
      await this.clampToPhotorealTilesThenReplaceInner(input, retriesLeft);
    } catch (e) {
      // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — a THROWN clamp leaves the ground
      // datum UNRESOLVED. We must not leave the building hidden forever, but we must also
      // never pretend ellipsoid-0 is the ground: reveal it and say so, LOUDLY.
      this.warnTerrainOnce(
        'globe tile-clamp THREW — the ground datum is UNRESOLVED; revealing the building at ' +
          `base ${this.formaTerrainBaseHeight.toFixed(2)} m (may be underground): ` + String(e),
      );
      try { this.revealGlobeBuildingForGround('clamp-threw'); } catch { /* best-effort */ }
      // Best-effort disarm of the one-shot re-frame so a failed clamp never leaves it armed.
      try { this.reframeAfterBaseSettle(); } catch { /* reframe best-effort */ }
    }
  }

  private async clampToPhotorealTilesThenReplaceInner(
    input: Parameters<CesiumViewport['renderFormaMassing']>[0],
    retriesLeft = GLOBE_GROUND_CLAMP_MAX_RETRIES,
  ): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    const scene = viewer.scene;

    // §GLOBE-TILE-CLAMP-NO-SELF-HIT (founder 2026-07-01, ADR-0095) — DON'T re-sample /
    // re-seat on a mere view switch when the site centroid hasn't moved and we already
    // have a settled ground height. The old code re-ran the whole clamp on every globe
    // re-entry; combined with the self-hit bug (below) that RE-SEATED the model on top
    // of itself each time → it CREPT UP ~one building height per view switch. If the
    // centroid is unchanged, reuse the cached `formaTerrainBaseHeight` and just re-place
    // absolutely at it (never relative to the model's current position).
    // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — the shortcut is now ALSO gated on the
    // ground datum actually being RESOLVED. Previously a centroid match alone reused
    // `formaTerrainBaseHeight` — which on a viewport whose sample had never landed is the
    // INITIAL 0, i.e. the WGS-84 ellipsoid (~50 m below the visible tile ground in Menorca).
    // "Same centroid" is not "known ground".
    if (!input._skipTerrainClamp) {
      const prev = this.formaTerrainSampledAt;
      if (prev && this.globeGroundResolved && this.centroidUnchangedFor(input, prev)) {
        console.log(
          `[CesiumViewport][globe] §GLOBE-TILE-CLAMP-NO-SELF-HIT centroid unchanged — ` +
            `reusing settled ground height ${this.formaTerrainBaseHeight.toFixed(2)} m ` +
            `(source ${this.globeGroundSource}; no re-sample, no creep).`,
        );
        this.revealGlobeBuildingForGround('centroid-unchanged-resolved');
        this.reframeAfterBaseSettle();
        return;
      }
    }

    // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — CHASE THE RACE. The tile-height sample
    // can only succeed once tiles have STREAMED at this LOD, so re-fire the clamp the MOMENT
    // the tileset reports tiles loaded instead of relying on the blind retry timer alone.
    this.attachPhotorealTilesLoadedHook(input);

    // §GIS-LOC (2026-06-08) — GROUND-height sampling that rejects tile-building roofs.
    //
    // THE BUG: `sampleHeightMostDetailed` raycasts the LOADED photoreal tilesets, which
    // include the surrounding REAL buildings. Sampling a SINGLE point (the boundary
    // centroid) in a dense city very often lands on an existing building's ROOF, so the
    // "ground" height came back as a ROOFTOP (~15–20 m) and the house floated up there
    // (founder screenshots: house at neighbour-rooftop height, while Forma — which uses
    // a FLAT base 0 — was correctly seated).
    //
    // THE FIX: sample height at MANY points across the plot — the centroid PLUS every
    // boundary vertex — and take the MINIMUM finite height. A building roof is always
    // ABOVE the ground it stands on, so the minimum over a plot's footprint reliably
    // recovers the real ground/street height even when the centroid itself is occluded
    // by a tile building. On a clear, flat plot every sample agrees → identical to the
    // old single-point clamp. The representative `sampleLat/Lon` (centroid) is kept for
    // the log + `formaTerrainSampledAt` change-detection.
    let sampleLat = input.originLat;
    let sampleLon = input.originLon;
    const samplePts: { lat: number; lon: number }[] = [];
    if (input.boundary && input.boundary.length >= 3) {
      const originCartesian = Cesium.Cartesian3.fromDegrees(input.originLon, input.originLat, 0);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(originCartesian);
      // scene-XZ → ENU(east = x, north = −z) → lat/lon, matching the massing placement.
      const enuToLatLon = (east: number, north: number): { lat: number; lon: number } => {
        const cart = Cesium.Matrix4.multiplyByPoint(
          enu, new Cesium.Cartesian3(east, north, 0), new Cesium.Cartesian3(),
        );
        const cg = Cesium.Cartographic.fromCartesian(cart);
        return { lat: Cesium.Math.toDegrees(cg.latitude), lon: Cesium.Math.toDegrees(cg.longitude) };
      };
      // §L-430 slice 2b — the boundary is AUTHORED scene geometry, so it must be rotated
      // onto true north before it becomes a lat/lon. Terrain sampling at an unrotated ring
      // would probe ground heights at the WRONG REAL-WORLD PLACE — the building would seat
      // itself to a neighbouring plot's ground level, which reads as a plausible elevation
      // bug rather than a frame bug. Note `enuToLatLon` itself takes ENU and is NOT rotated
      // (its street-ring callers below already work in ENU).
      const thetaRad = this.readProjectNorthRad();
      const boundaryEnu = input.boundary.map((p) => sceneXZToEnu(p.x, p.z, thetaRad));
      const c = this.polygonCentroidAndAreaXZ(input.boundary, thetaRad);
      const centroidLL = enuToLatLon(c.east, c.north);
      sampleLat = centroidLL.lat;
      sampleLon = centroidLL.lon;
      // §GLOBE-DONT-MEASURE-THE-HOLE (L-479) — ⚠ DO NOT SAMPLE INSIDE THE PARCEL WHILE THE
      // PHOTOREAL VOID IS CUT.
      //
      // THE DEFECT: `§PLOT-CLEAR-PHOTOREAL` (L-429) punches a PARCEL-SHAPED VOID through the
      // photoreal tileset so the proposal reads on a clear plot — and it runs BEFORE this
      // clamp in the same placement pass (founder console, in order: "parcel-shaped void
      // clipped into the photoreal tileset (8-vertex ring)" … then "ground anchor:
      // resolved source=photoreal-tile-clamp height=11.38 m picks=49"). The centroid and every
      // boundary vertex are, by construction, INSIDE that hole. Their rays therefore pass
      // through the removed surface and hit whatever lies beyond it.
      //
      // ⚠ AND THE REDUCTION TAKES THE **MINIMUM**, so those fall-through picks do not merely
      // dilute the answer — they WIN. Barcelona resolved to 11.38 m where the tile surface is
      // ≈ +50 m (geoid ≈ +49 m), burying the building ~40 m. It is the L-477 failure mode with
      // a different origin: not a pick that hit the ellipsoid, but a pick that hit nothing
      // because WE had just deleted the ground we were trying to measure. L-477's ±2 m guard
      // cannot catch it — 11.38 m is a perfectly plausible height.
      //
      // THE FOUNDER DATED IT EXACTLY: *"this was working perfectly fine until the envelope was
      // rendering on the 3d tiles scene."* That is the commit that introduced the void.
      //
      // THE FIX: rely on the STREET RING only, which is already the documented principle —
      // §GLOBE-GROUND-STREET-RING: "the building base must sit on the STREET ground, and the
      // MINIMUM over these points reliably recovers it." The street ring is OUTSIDE the parcel,
      // so it is outside the void and still measures real tile mesh. The in-parcel picks were
      // only ever a convenience; once the plot is cleared they are actively wrong.
      //
      // When no void is cut (the Forma flat-ground study, or no photoreal tileset), the
      // in-parcel picks are still good and are kept — so nothing regresses on that path.
      const parcelVoidCut = this.photorealTilesActive;
      if (!parcelVoidCut) {
        samplePts.push(centroidLL);
        for (const p of boundaryEnu) samplePts.push(enuToLatLon(p.east, p.north));
      } else {
        console.log(
          '[CesiumViewport][globe] §GLOBE-DONT-MEASURE-THE-HOLE (L-479) — photoreal void is cut ' +
            'over this parcel, so the in-parcel ground picks would ray straight through it. ' +
            'Measuring the ground from the STREET RING only (§GLOBE-GROUND-STREET-RING).',
        );
      }
      // §GLOBE-GROUND-STREET-RING (founder 2026-07-01) — ALSO sample a ring in the
      // SURROUNDING STREET (each footprint vertex pushed ~1.7× outward from the centroid,
      // plus 8 compass points ~30 m beyond the footprint). The building base must sit on
      // the STREET ground, and the MINIMUM over these points reliably recovers it even when
      // the whole footprint sits on an elevated podium/roof — WITHOUT needing an absolute
      // height cap (the old §GLOBE-FLOAT-SAFETY cap wrongly rejected Paris's real ~80 m
      // ground as a "rooftop" and buried the tower 80 m underground).
      // §L-430 — push outward in ENU using the ROTATED ring, so the street ring lands on the
      // real surrounding streets rather than on a rotated copy of them.
      const east = c.east, north = c.north;
      for (const p of boundaryEnu) {
        const ox = east + (p.east - east) * 1.7;
        const oy = north + (p.north - north) * 1.7;
        samplePts.push(enuToLatLon(ox, oy));
      }
      // Footprint half-extent → a comfortable street ring radius beyond it. (Rotation-
      // invariant in principle — it is a distance — but computed from the rotated ring so
      // it stays consistent with the centroid it is measured against.)
      let ext = 0;
      for (const p of boundaryEnu) {
        ext = Math.max(ext, Math.hypot(p.east - east, p.north - north));
      }
      // §FIX-GLOBE-AUTOFRAME-AND-SEAT (L-184) — DENSER + WIDER street sampling so the min
      // reliably catches TRUE street ground rather than perching on the nearest slightly
      // elevated tile (podium / canopy / neighbour rooftop). Two concentric rings of 16
      // compass points each (near ≈ ext+25 m, far ≈ ext+55 m) — more chances to hit an open
      // street cell → a lower, truer ground min → the model seats flush (with the small
      // downward seat epsilon applied in the reduction) instead of floating.
      for (const ringR of [ext + 25, ext + 55]) {
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          samplePts.push(enuToLatLon(east + Math.cos(a) * ringR, north + Math.sin(a) * ringR));
        }
      }
    } else {
      samplePts.push({ lat: sampleLat, lon: sampleLon });
    }

    // §FIX-GLOBE-CLAMP-TO-PHOTOREAL-TILES (L-179, 2026-07-06) — the building is seated on
    // the SAME surface Cesium depth-tests it against: the loaded Google Photorealistic
    // 3D-Tiles mesh. The prior §GLOBE-TERRAIN-HEIGHT path preferred an ion World-Terrain
    // bare-earth sample here; that (a) re-introduced the L-142 727 m-underground regression
    // whenever the terrain datum disagreed with the tiles, and (b) added a slow ion network
    // await whose token-abort race (a retry/re-render bumping `formaTerrainToken` mid-await)
    // returned out of the WHOLE clamp before the tile-mesh fallback ran → the base stayed at
    // flat 0 and the real GLB sank ~650 m under Madrid's photoreal ground. We now go straight
    // to the tile-surface clamp below (min over the footprint + surrounding STREET ring, so a
    // wall-to-wall city's rooftops never win — the street min IS the ground), with NO ion
    // terrain and NO CSP terrain host. See §GLOBE-GROUND-STREET-RING for the roof-rejection.

    // §GLOBE-TILE-CLAMP-FLUSH (founder 2026-07-01, ADR-0095) — RESIDUAL FLOAT ROOT CAUSE.
    // The prior clamp used `scene.sampleHeightMostDetailed`, which projects each point
    // straight DOWN and returns the first hit against tilesets AND the terrain provider.
    // On the keyless build the terrain provider is the bare ELLIPSOID (height 0), and the
    // Google Photorealistic 3D Tiles are NOT registered as pickable-for-height primitives
    // the same way — so the "min over the footprint" repeatedly resolved to the ellipsoid
    // 0.00 m. But the visible NYC street surface sits tens of metres ABOVE the ellipsoid
    // (geoid + local ground). Seating the tower at ellipsoid-0 therefore left it floating
    // BELOW/above the tile street → the "still floating but less" gap.
    //
    // THE FIX: prefer `scene.clampToHeightMostDetailed(cartesians, objectsToExclude, width)`,
    // which clamps each 3D position onto the nearest PRIMITIVE surface (the loaded photoreal
    // tile MESH, geoid included) — NOT the terrain provider — so it returns the true visible
    // street height. We exclude the placed model + context so it never self-hits. We take the
    // MIN across the footprint grid (roofs are higher than ground). If clamping is unavailable
    // or returns nothing usable, fall back to `sampleHeightMostDetailed`, and finally to the
    // photoreal tileset's own bounding-sphere ground height — anything but a silent 0.
    const clampFn = (scene as unknown as {
      clampToHeightMostDetailed?: (
        cartesians: Cesium.Cartesian3[],
        objectsToExclude?: unknown[],
        width?: number,
      ) => Promise<Cesium.Cartesian3[]>;
    }).clampToHeightMostDetailed;
    const sampleFn = (scene as unknown as {
      sampleHeightMostDetailed?: (
        positions: Cesium.Cartographic[],
        objectsToExclude?: unknown[],
        width?: number,
      ) => Promise<Cesium.Cartographic[]>;
    }).sampleHeightMostDetailed;
    const heightPickingAvailable = typeof clampFn === 'function' || typeof sampleFn === 'function';
    if (!heightPickingAvailable) {
      // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — a CAPABILITY gap (old Cesium build),
      // not the async race: the tile ground can never be measured here, so no amount of
      // retrying helps. Degrade LOUDLY (base 0 = the WGS-84 ellipsoid, which is NOT the tile
      // ground when tiles are shown) and reveal the building rather than hiding it forever.
      this.warnTerrainOnce(
        'scene.clampToHeightMostDetailed/sampleHeightMostDetailed unavailable — the globe ground ' +
          'datum CANNOT be measured on this Cesium build; the building is shown at base ' +
          `${this.formaTerrainBaseHeight.toFixed(2)} m (ellipsoidal) and may sit under the tiles.`,
      );
      this.revealGlobeBuildingForGround('no-height-picking-api');
      // §GLOBE-FIRST-FRAME-BASE — no sampling API → base stays at the flat 0 we
      // framed at; disarm the one-shot so it never fires stale later.
      this.reframeAfterBaseSettle();
      return;
    }

    // §GLOBE-TILE-CLAMP-NO-SELF-HIT — exclude the ALREADY-PLACED model (and our own
    // context extrusions) from the height raycast so the sample can never land on the
    // thing we're re-seating (which stacked it ~one storey per view switch) or on our
    // context boxes. Best-effort: only include live, non-destroyed primitives/entities.
    const exclude: unknown[] = [];
    if (this.realModelOnGlobe && !this.realModelOnGlobe.isDestroyed()) exclude.push(this.realModelOnGlobe);
    for (const e of this.contextBuildingEntities) { if (e) exclude.push(e); }
    const excludeArg = exclude.length > 0 ? exclude : undefined;

    const myToken = ++this.formaTerrainToken;
    // §FIX-GLOBE-CLAMP-TO-PHOTOREAL-TILES — collect every finite tile-surface height pick
    // (clamp + sample), then reduce to the base via the pure `selectPhotorealTileBaseHeight`
    // (min over footprint+street ring; tileset bounding-sphere ground as the last resort).
    // §FIX-GLOBE-3DTILES-CRASH (L-183) — route BOTH height APIs through `safeSampleTileHeights`
    // so a tileset-not-ready rejection/throw NEVER escapes (was the intermittent crash) and,
    // crucially, does NOT abort the whole clamp: an empty result falls through to the
    // sphere-ground fallback + the retry below, so a globe that wasn't ready yet self-heals as
    // tiles stream in (previously a single sample throw bailed the placement at flat base 0).
    // Prefer clampToHeightMostDetailed against the loaded photoreal tile MESH; clamp positions
    // must sit ABOVE the surface so the down-projection finds the mesh (start 1 km up).
    let tileHeights = await CesiumViewport.safeSampleTileHeights(
      typeof clampFn === 'function'
        ? () => clampFn.call(
            scene,
            samplePts.map((s) => Cesium.Cartesian3.fromDegrees(s.lon, s.lat, 1000)),
            excludeArg,
          )
        : undefined,
      (c: Cesium.Cartesian3) => (c ? Cesium.Cartographic.fromCartesian(c)?.height : null),
    );
    // Fallback: sampleHeightMostDetailed (may still resolve if clamp found nothing).
    if (tileHeights.length === 0) {
      tileHeights = await CesiumViewport.safeSampleTileHeights(
        typeof sampleFn === 'function'
          ? () => sampleFn.call(
              scene,
              samplePts.map((s) => Cesium.Cartographic.fromDegrees(s.lon, s.lat)),
              excludeArg,
            )
          : undefined,
        (r: Cesium.Cartographic) => r?.height,
      );
    }

    // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — THE ONE DATUM BOUNDARY (C12 §1.4).
    // Reduce every signal to an explicit ground ANCHOR that is either RESOLVED (with its
    // source recorded) or UNRESOLVED. There is deliberately NO numeric fallback: `0` is the
    // WGS-84 ELLIPSOID, and with photoreal tiles as the visible ground that is ~50 m BELOW
    // real ground at Menorca (geoid separation ≈ +49 m) — the founder's burial. The sphere
    // ground is a real (coarse) measurement and is allowed; a fabricated 0 is not.
    // §GLOBE-PICK-SPREAD-DIAG (L-479) — print the DISTRIBUTION, not just the min. A single
    // number cannot distinguish "the ground really is 11 m here" from "most rays fell through
    // a hole". A tight cluster is a real surface; a wide spread with a low tail is fall-through.
    if (tileHeights.length > 0) {
      const sorted = [...tileHeights].filter((h) => typeof h === 'number' && Number.isFinite(h)).sort((a, b) => a - b);
      if (sorted.length > 0) {
        const at = (f: number): number => sorted[Math.min(sorted.length - 1, Math.floor(f * sorted.length))];
        console.log(
          `[CesiumViewport][globe] §GLOBE-PICK-SPREAD-DIAG ${sorted.length} finite pick(s) — ` +
            `min ${sorted[0].toFixed(2)} · p25 ${at(0.25).toFixed(2)} · median ${at(0.5).toFixed(2)} · ` +
            `p75 ${at(0.75).toFixed(2)} · max ${sorted[sorted.length - 1].toFixed(2)} m ELLIPSOIDAL. ` +
            `spread ${(sorted[sorted.length - 1] - sorted[0]).toFixed(2)} m. ` +
            `A tight cluster = a real tile surface; a low tail far below the median = rays ` +
            `falling through un-streamed tiles or the §PLOT-CLEAR-PHOTOREAL void (L-479).`,
        );
      }
    }

    const anchor = resolveGlobeGroundAnchor({
      photorealTilesActive: this.photorealTilesActive,
      heightPickingAvailable,
      tileSampleHeights: tileHeights,
      tilesetSphereGroundHeightM: this.photorealTilesetGroundHeight(),
      seatEpsilonM: GLOBE_GROUND_SEAT_EPSILON_M, // L-184 — seat flush, no float
    });
    if (anchor.source === 'tileset-bounding-sphere') {
      console.log(
        `[CesiumViewport][globe] §GLOBE-TILE-CLAMP-FLUSH picking returned no height — ` +
          `falling back to tileset bounding-sphere ground ${(anchor.heightM ?? 0).toFixed(2)} m ` +
          `(ellipsoidal).`,
      );
    }

    // A newer placement started after us — let it own the clamp; bail.
    // §GLOBE-CRASH-GUARD — also bail if the viewer was disposed during the await.
    if (myToken !== this.formaTerrainToken || !this.isViewerLive()) return;

    // §GLOBE-FLOAT-SAFETY superseded by §GLOBE-GROUND-STREET-RING (founder 2026-07-01):
    // the old absolute cap (reject > 80 m) wrongly buried cities whose ground is genuinely
    // elevated (Paris ground ≈ 80 m ellipsoid = geoid + terrain → the tower sank 80 m
    // underground). A fixed threshold can't separate "elevated flat ground" from "neighbour
    // rooftop". Instead we now take the MINIMUM over the footprint PLUS a surrounding-street
    // ring (added above): the street min IS the ground in both cases — no absolute cap.

    const action = decideGroundAnchorAction(anchor, retriesLeft);
    console.log(
      `[CesiumViewport][globe] §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF ground anchor: ` +
        `status=${anchor.status} source=${anchor.source} ` +
        `height=${anchor.heightM === null ? 'UNKNOWN' : anchor.heightM.toFixed(2) + ' m'} ` +
        `datum=${anchor.datum} | tiles=${this.photorealTilesActive ? 'ACTIVE' : 'off'} ` +
        `picks=${tileHeights.length} retriesLeft=${retriesLeft} → ${action}.`,
    );

    if (action === 'hold-hidden-retry') {
      // THE FIX FOR (i): tiles have not streamed a height at this LOD yet. The building is
      // HELD HIDDEN (never anchored at a fabricated 0) and we retry — the tileset load hook
      // above ALSO re-fires the clamp the instant tiles land, so this is not a blind timer.
      this.holdGlobeBuildingForUnresolvedGround();
      this.warnTerrainOnce(
        'photoreal tile height UNRESOLVED (tiles still streaming) — the building is held HIDDEN ' +
          'rather than anchored at ellipsoid 0 (which is ~50 m underground where the geoid ' +
          'separation is large). Retrying as tiles stream in.',
      );
      // §GLOBE-CRASH-GUARD — skip the retry if the viewport was disposed in the meantime.
      setTimeout(() => {
        if (this.isViewerLive()) void this.clampToPhotorealTilesThenReplace(input, retriesLeft - 1);
      }, GLOBE_GROUND_CLAMP_RETRY_MS);
      return;
    }

    if (action === 'reveal-unknown-datum-warn') {
      // The retry budget is spent and the tiles STILL never gave a height. We refuse to hide
      // the house forever, but we must not pretend we know the ground: reveal at the last
      // known base and say so explicitly (never silent — this is the C12 §1.4 escape hatch).
      console.error(
        `[CesiumViewport][globe] §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF — the globe GROUND DATUM ` +
          `could not be measured after ${GLOBE_GROUND_CLAMP_MAX_RETRIES} attempts (photoreal tiles ` +
          `never returned a height). Revealing the building at base ` +
          `${this.formaTerrainBaseHeight.toFixed(2)} m ELLIPSOIDAL — if the site's geoid separation ` +
          `is large (≈ +49 m in the Balearics) it may read as underground. This is a DATA problem ` +
          `(tiles), not a transform problem.`,
      );
      this.revealGlobeBuildingForGround('retries-exhausted-datum-unknown');
      this.reframeAfterBaseSettle();
      return;
    }

    // action === 'seat-and-reveal' — a measured ground datum.
    this.globeGroundSource = anchor.source;
    this.commitPhotorealBase(
      input,
      anchor.heightM as number,
      sampleLat,
      sampleLon,
      `photoreal-tile clamp (${anchor.source})`,
    );
  }

  /**
   * §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — CHASE THE RACE. The tile-height sample can
   * only succeed once the photoreal tileset has STREAMED tiles at this LOD, so subscribe ONCE to
   * the tileset's own load events and re-fire the clamp the moment they land, instead of waiting
   * out a blind retry timer (the old 3 × 1.2 s budget expired on a cold cache → the base stayed
   * at ellipsoid 0 → the building was buried; a warm cache won the race → it looked correct.
   * THAT is the intermittency). Best-effort + guarded: an old Cesium build without the events
   * simply falls back to the (now much longer) retry budget.
   */
  private attachPhotorealTilesLoadedHook(
    input: Parameters<CesiumViewport['renderFormaMassing']>[0],
  ): void {
    if (this.photorealTilesLoadedHookAttached) return;
    const ts = this.photorealTileset;
    if (!ts || ts.isDestroyed()) return;
    try {
      const onLoaded = (): void => {
        if (!this.isViewerLive()) return;
        if (this.globeGroundResolved) return; // already measured — nothing to re-fire.
        console.log(
          '[CesiumViewport][globe] §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF — photoreal tiles ' +
            'reported LOADED while the ground datum was unresolved → re-running the height clamp now.',
        );
        void this.clampToPhotorealTilesThenReplace(input, GLOBE_GROUND_CLAMP_MAX_RETRIES);
      };
      const events = ts as unknown as {
        initialTilesLoaded?: { addEventListener?: (cb: () => void) => void };
        allTilesLoaded?: { addEventListener?: (cb: () => void) => void };
      };
      events.initialTilesLoaded?.addEventListener?.(onLoaded);
      events.allTilesLoaded?.addEventListener?.(onLoaded);
      this.photorealTilesLoadedHookAttached = true;
    } catch (e) {
      console.warn('[CesiumViewport][globe] tileset load-hook attach failed (non-fatal):', e);
    }
  }

  /**
   * §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — HOLD the globe building hidden while the
   * ground datum is UNRESOLVED. The alternative (what the code did before) is to anchor it at
   * `formaTerrainBaseHeight = 0` — the WGS-84 ELLIPSOID, which is ~49 m BELOW mean sea level in
   * the Balearics — i.e. bury it. A house you cannot see yet is honest; a house 50 m under the
   * street is a georeferencing lie. Hidden state is idempotent + reversible
   * (`revealGlobeBuildingForGround`), and only ever applies while photoreal tiles are the
   * visible ground.
   */
  private holdGlobeBuildingForUnresolvedGround(): void {
    if (!this.photorealTilesActive) return; // ellipsoid IS the ground → 0 is correct, show it.
    if (this.globeBuildingHiddenForGround) return;
    this.globeBuildingHiddenForGround = true;
    this.setGlobeBuildingShown(false);
  }

  /**
   * §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — the ground datum is now known (or we have
   * explicitly given up and said so): SHOW the globe building. Idempotent; marks the datum
   * resolved so the centroid-unchanged shortcut and the real-model placement can trust it.
   */
  private revealGlobeBuildingForGround(reason: string): void {
    this.globeGroundResolved = true;
    if (!this.globeBuildingHiddenForGround) return;
    this.globeBuildingHiddenForGround = false;
    this.setGlobeBuildingShown(true);
    console.log(
      `[CesiumViewport][globe] §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF — revealing the building ` +
        `at base ${this.formaTerrainBaseHeight.toFixed(2)} m ELLIPSOIDAL (${reason}).`,
    );
  }

  /** L-259 — toggle BOTH globe representations (massing entities + the real GLB primitive).
   *  The massing entities are only CREATED for visible storey bands, so a blanket show flip
   *  cannot resurrect a floor the user filtered out. Guarded; never throws. */
  private setGlobeBuildingShown(shown: boolean): void {
    for (const ent of this.formaMassingEntities) {
      // §SITE-OVERLAY-NOT-BUILDING (L-464) — the buildable ENVELOPE and the parcel BOUNDARY ride
      // in `formaMassingEntities` for their CLEAR lifecycle, but they are SITE CONTEXT, not the
      // proposed building. Hiding them here made both flash on and vanish a moment later:
      // whenever the building is hidden — while the ground datum resolves, or when the real GLB
      // replaces the massing — the compliance overlay went with it. Founder: "I see for a second
      // the envelope and boundary - then disappear."
      //
      // ⚠ WHY THIS MATTERS BEYOND THE FLICKER: an envelope that vanishes reads as "there is no
      // constraint here" — the silent false negative C58 §1.4 forbids, and the same class of
      // defect as L-445. The constraint does not stop applying because the proposal is being
      // re-drawn.
      if (this.formaSiteOverlayEntities.has(ent)) continue;
      try { ent.show = shown; } catch { /* entity gone */ }
    }
    const model = this.realModelOnGlobe;
    if (model && !model.isDestroyed()) {
      try { model.show = shown; } catch { /* model gone */ }
    }
    try { this.viewer?.scene.requestRender(); } catch { /* viewer gone */ }
  }

  /** L-259 — TRUE when the globe building must be hidden right now because the ground datum is
   *  still unknown (photoreal tiles are the visible ground and no height has been measured). */
  private globeGroundUnknownWhileTilesShown(): boolean {
    return this.photorealTilesActive && !this.globeGroundResolved;
  }

  /**
   * §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — the ANCHOR EVIDENCE log. Emitted at the
   * exact moment a building is anchored on the globe, so the two defects can never again be
   * argued about from screenshots: it prints the lat/lon actually used, BOTH origin authorities
   * and their separation in metres (defect ii), whether the tiles/height-sample had RESOLVED,
   * which height value was used and in WHICH DATUM (defect i), and the resulting ECEF Cartesian3
   * re-projected back to lat/lon/height (so a wrong anchor is self-evident).
   */
  private logGlobeAnchorEvidence(
    what: string,
    originLat: number,
    originLon: number,
    baseHeightM: number,
    position: Cesium.Cartesian3 | null,
  ): void {
    try {
      const store = this.runtime?.siteModelStore as
        | { getLocation?: () => { latitude: number; longitude: number } | null }
        | undefined;
      const raw = store?.getLocation?.();
      const ltpRaw = getCurrentSiteOrigin();
      const ev: GeorefOriginEvidence = {
        ltpOrigin: ltpRaw && (ltpRaw.lat !== 0 || ltpRaw.lon !== 0) ? { lat: ltpRaw.lat, lon: ltpRaw.lon } : null,
        storeLocation: raw && (raw.latitude !== 0 || raw.longitude !== 0)
          ? { lat: raw.latitude, lon: raw.longitude }
          : null,
        anchorOrigin: { lat: originLat, lon: originLon },
      };
      const sepLtpAddress = originSeparationMeters(ev.ltpOrigin, ev.storeLocation);
      const sepAnchorLtp = originSeparationMeters(ev.anchorOrigin, ev.ltpOrigin);
      let echo = 'n/a';
      if (position) {
        const cg = Cesium.Cartographic.fromCartesian(position);
        if (cg) {
          echo =
            `${Cesium.Math.toDegrees(cg.latitude).toFixed(6)},` +
            `${Cesium.Math.toDegrees(cg.longitude).toFixed(6)} @ ${cg.height.toFixed(2)} m`;
        }
      }
      console.log(
        `[CesiumViewport][georef] §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF ANCHOR EVIDENCE (${what})\n` +
          `  • anchor lat/lon      : ${originLat.toFixed(6)}, ${originLon.toFixed(6)}\n` +
          `  • LTP-ENU origin      : ${ev.ltpOrigin ? `${ev.ltpOrigin.lat.toFixed(6)}, ${ev.ltpOrigin.lon.toFixed(6)}` : 'UNSET'} ` +
          `(anchor↔LTP ${Number.isFinite(sepAnchorLtp) ? sepAnchorLtp.toFixed(1) + ' m' : 'n/a'})\n` +
          `  • Site address (store): ${ev.storeLocation ? `${ev.storeLocation.lat.toFixed(6)}, ${ev.storeLocation.lon.toFixed(6)}` : 'UNSET'} ` +
          `(LTP↔address ${Number.isFinite(sepLtpAddress) ? sepLtpAddress.toFixed(1) + ' m' : 'n/a'}` +
          `${georefOriginsDiverge(ev) ? ' ⚠ DIVERGED — defect (ii)' : ''})\n` +
          `  • photoreal tiles     : ${this.photorealTilesActive ? 'ACTIVE (tile mesh IS the ground)' : 'off (ellipsoid IS the ground)'}\n` +
          `  • ground datum        : ${
            this.globeGroundSource === 'unresolved'
              ? 'UNRESOLVED — no measurement (see the §L-259 error above)'
              : `MEASURED via ${this.globeGroundSource}`
          }\n` +
          `  • base height used    : ${baseHeightM.toFixed(2)} m ELLIPSOIDAL (WGS-84 — NOT above sea level)\n` +
          `  • resulting Cartesian3: ${echo}`,
      );
    } catch {
      /* evidence logging must never affect the placement */
    }
  }

  /**
   * §GLOBE-TERRAIN-HEIGHT / §GLOBE-TILE-CLAMP — shared COMMIT tail for the photoreal
   * base height. Records the sampled centroid, no-ops when the resolved base equals the
   * base we already framed at, else stores `formaTerrainBaseHeight`, re-places the
   * massing absolutely at that base (never relative → no creep), and issues the one-shot
   * §GLOBE-FRAME-NO-JUMP re-frame. `source` names the origin (terrain / tile) for the log.
   * Extracted so BOTH the bare-earth World Terrain sample and the tile-mesh clamp seat the
   * building identically. Assumes the caller already passed the token / viewer-live guard.
   */
  private commitPhotorealBase(
    input: Parameters<CesiumViewport['renderFormaMassing']>[0],
    sampledHeight: number,
    sampleLat: number,
    sampleLon: number,
    source: string,
  ): void {
    this.formaTerrainSampledAt = { lat: sampleLat, lon: sampleLon };
    if (Math.abs(sampledHeight - this.formaTerrainBaseHeight) < 1e-3) {
      // §GLOBE-FIRST-FRAME-BASE — the resolved base equals the base we framed at
      // (e.g. a sea-level / flat site where the initial frame at base 0 was already
      // correct). No re-place is needed, but the one-shot must DISARM here so it
      // never leaks to a later location change's clamp. reframeAfterBaseSettle is a
      // no-op when nothing armed it and a (harmless) re-fly at the correct base when
      // the initial frame ran against this same base.
      //
      // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — the height is now MEASURED even
      // though it happens to equal the value we already held: the datum is RESOLVED, so the
      // building must be revealed (it may have been held hidden while the tiles streamed).
      this.logGlobeAnchorEvidence(`${source} (base unchanged)`, sampleLat, sampleLon, sampledHeight, null);
      this.revealGlobeBuildingForGround(`${source} — base unchanged`);
      this.reframeAfterBaseSettle();
      return; // already seated
    }

    this.formaTerrainBaseHeight = sampledHeight;
    // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — the ground datum is MEASURED. Mark it
    // resolved BEFORE the re-place below, so the re-place (and the real-model reseat it
    // triggers) seats at the measured base AND the building is revealed rather than held.
    this.revealGlobeBuildingForGround(source);
    this.logGlobeAnchorEvidence(source, sampleLat, sampleLon, sampledHeight, null);
    console.log(
      `[CesiumViewport][globe] ${source}: base height ${sampledHeight.toFixed(2)} m ELLIPSOIDAL ` +
        `at LAT ${sampleLat.toFixed(6)} LON ${sampleLon.toFixed(6)} — re-placing.`,
    );
    // Re-place at the resolved base. `_skipTerrainClamp` prevents re-entry;
    // `frameCentroid:false` so the re-place never re-flies the camera.
    this.renderFormaMassing({ ...input, frameCentroid: false, _skipTerrainClamp: true });
    // §GLOBE-FRAME-NO-JUMP (supersedes §GLOBE-FIRST-FRAME-BASE-ROBUST). The base just
    // changed MATERIALLY (we are past the base-unchanged guard above; e.g. 0 → 381.9 m),
    // so the initial frame — which flew at the stale base 0 — parked the camera under
    // the real terrain (the underground/black view). We STILL re-frame so the FIRST
    // globe open lands on the building with no Zoom-to-Site click; BUT the previous
    // version re-flew UNCONDITIONALLY on every base settle, and photoreal tiles stream
    // in progressively (the base can settle more than once), so it re-fired and YANKED
    // the camera — or fired after the user had already moved (founder: "jumps off /
    // flies away"). Route through `performInitialReframe`, which fires AT MOST ONCE per
    // open and never after the user has taken control. Consume any pending arm first so
    // a later `reframeAfterBaseSettle()` can't double-fire.
    if (input.frameCentroid) {
      this.formaReframeOnBaseSettle = null; // we own the re-frame here
      this.performInitialReframe(
        input.framePreset === 'plan' ? 'plan' : 'oblique',
        source,
      );
    } else {
      this.reframeAfterBaseSettle();
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
      // §L-430 — authored boundary → TRUE-north ENU before it becomes a real lat/lon.
      const c = this.polygonCentroidAndAreaXZ(input.boundary, this.readProjectNorthRad());
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
      // §GLOBE-FIRST-FRAME-BASE — centroid already clamped (base unchanged); the
      // initial frame is correct as-is. Disarm the one-shot so it can't leak.
      this.reframeAfterBaseSettle();
      return;
    }

    const provider = viewer.terrainProvider as Cesium.TerrainProvider | undefined;
    if (!provider || !this.terrainProviderHasElevationData(provider)) {
      // §A.21.D-TERRAIN-GUARD — ROOT CAUSE of "terrain clamp degraded
      // (sampleTerrainMostDetailed rejected — TypeError: Cannot read properties of
      // undefined (reading 'computeMaximumLevelAtPosition'))". The keyless / no-token
      // build NEVER attaches a real terrain provider, so `viewer.terrainProvider` is
      // Cesium's default EllipsoidTerrainProvider. That provider is TRUTHY (so the old
      // `if (!provider)` guard passed it through) but has NO `availability` — and
      // `Cesium.sampleTerrainMostDetailed` dereferences
      // `provider.availability.computeMaximumLevelAtPosition(...)` internally, throwing
      // the TypeError above on EVERY Forma placement. The flat ellipsoid surface IS
      // height 0, so base 0 is already the correct flat-ground seat — there is nothing
      // to sample. We therefore SKIP the call entirely (no throw, no per-render
      // TypeError) when the provider carries no real elevation data, recording the
      // sample point so we don't re-attempt for the same centroid. If a real terrain
      // provider is attached later (a CesiumTerrainProvider with `availability`), this
      // guard passes and the sample runs as before. NOTE: we deliberately do NOT
      // create/await a world-terrain provider here — the project ships no Cesium ion
      // terrain asset, and pulling one in would add a new ion-token dependency; on the
      // keyless path flat base 0 is the intended, correct ground.
      if (!provider) {
        // No provider at all → flat base 0 (already placed).
      } else {
        this.warnTerrainOnce(
          'no real terrain provider attached (keyless ellipsoid ground) — clamping to flat base 0',
        );
      }
      this.formaTerrainSampledAt = { lat: sampleLat, lon: sampleLon };
      // §GLOBE-FIRST-FRAME-BASE — keyless / ellipsoid ground stays at flat base 0,
      // which is exactly what the initial frame used → it's already correct. Disarm
      // the one-shot so it never fires stale on a subsequent location change.
      this.reframeAfterBaseSettle();
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
    // §GLOBE-CRASH-GUARD — also bail if the viewer was disposed during the await.
    if (myToken !== this.formaTerrainToken || !this.isViewerLive()) return;

    this.formaTerrainSampledAt = { lat: sampleLat, lon: sampleLon };

    // If the height is effectively unchanged from what we already placed at,
    // there is nothing to re-place (e.g. flat ellipsoid provider → 0 → 0).
    if (Math.abs(sampledHeight - this.formaTerrainBaseHeight) < 1e-3) {
      // §GLOBE-FIRST-FRAME-BASE — base resolved to the same value the initial frame
      // used → already correct; disarm the one-shot so it can't leak.
      this.reframeAfterBaseSettle();
      return;
    }

    this.formaTerrainBaseHeight = sampledHeight;
    console.log(
      `[CesiumViewport][forma] terrain clamp: base height ${sampledHeight.toFixed(2)} m ` +
        `at LAT ${sampleLat.toFixed(6)} LON ${sampleLon.toFixed(6)} — re-placing.`,
    );
    // Re-place at the new base. `_skipTerrainClamp` prevents an infinite loop;
    // `frameCentroid:false` so the re-place never re-flies the camera (task #2).
    this.renderFormaMassing({ ...input, frameCentroid: false, _skipTerrainClamp: true });
    // §GLOBE-FIRST-FRAME-BASE — same one-shot re-frame as the photoreal path: if
    // the initial framing used the stale (pre-sample) base, re-fly once now that
    // the terrain base is resolved so the first activation isn't framed underground.
    this.reframeAfterBaseSettle();
    // §CTX-BUILDINGS-INPLACE-RESEAT (L-635) — the base height changed, so re-seat the context
    // buildings onto the new ground. This was a `loadContextBuildings(force)` RE-FETCH, and that
    // re-fetch is exactly what blanked Madrid: it `clearContextBuildings()` FIRST, then re-fetches,
    // and any abort of that fetch (a concurrent pan or `site.location-changed` load — each aborts
    // the previous, see §7053 doc) between the clear and the re-place leaves the scene EMPTY. High-
    // relief Madrid widens that window (slow terrain sample + PMTiles read) so it lost the race every
    // time, while flat Barcelona never entered it. The in-place re-seat cannot race: it rebuilds the
    // EXISTING entities' scalar heights from their cached footprints — no network, no clear, no abort.
    // If nothing is placed yet (initial load still in flight), it's a no-op and the initial load seats
    // correctly itself via the now-settled `resolveContextSafeBase` — both orderings converge.
    // §A.21.D-GLOBE3 — skip on the photoreal "3D globe" where the loaded tiles already supply context.
    if (!(input.keepPhotoreal && this.photorealTilesActive)) {
      this.reseatContextPlacementsForBase();
      // §CTX-GROUND-FEATURES-RESEAT (L-635) — the SAME lift for roads/parks/water. They were seated at
      // load-time `formaTerrainBaseHeight` (0 before the terrain settled) and — unlike the buildings —
      // never re-seated, so on a high city they stayed ~700 m UNDER the risen terrain, out of the camera
      // frame: Madrid's ground read as bare white (no green parks / no streets) while flat Barcelona's
      // base-0 features sat exactly on its ~0 ground. Lift them onto the settled base so the ground reads.
      this.reseatContextGroundFeaturesForBase();
    }
  }

  /**
   * §CTX-GROUND-FEATURES-RESEAT (L-635) — lift the ALREADY-PLACED context ROAD / PARK / WATER entities
   * onto the settled terrain ground, mirroring {@link reseatContextPlacementsForBase} for buildings.
   * These flat features are seated by a single scalar `height` (roads = corridor.height; parks/water
   * areas = polygon.height), so re-seating is just rewriting that one number per entity. Waterway
   * POLYLINES carry their height in the positions (no scalar) — left as-is (thin, low-visibility). No
   * network, no clear, no AbortController — structurally cannot race. Fully guarded; never throws.
   */
  private reseatContextGroundFeaturesForBase(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    if (!this.groundReliefAttached()) return;              // flat/keyless path already seats exactly.
    const base = this.formaTerrainBaseHeight;              // the just-settled city ground (~700 m Madrid).
    let n = 0;
    // Preserve the original ground-stack layering (parks below roads below water) via small offsets, and
    // keep every feature just ABOVE the terrain so it reads (depthTestAgainstTerrain=false draws it over).
    const lift = (entities: readonly Cesium.Entity[], kind: 'polygon' | 'corridor', offset: number): void => {
      for (const ent of entities) {
        try {
          const g = kind === 'polygon' ? ent.polygon : ent.corridor;
          if (!g || !g.height) continue;                   // e.g. a waterway polyline has neither — skip.
          g.height = new Cesium.ConstantProperty(base + offset);
          n++;
        } catch { /* skip one entity; the re-seat must never break the pass. */ }
      }
    };
    lift(this.contextLanduseEntities, 'polygon', 0.005);
    lift(this.contextParkEntities, 'polygon', 0.01);
    lift(this.contextRoadEntities, 'corridor', 0.02);
    lift(this.contextWaterEntities, 'polygon', 0.03);
    if (n > 0) viewer.scene.requestRender();
    console.log(
      `[CTX-DIAG] ground-features re-seat: ${n} road/park/water entity(ies) lifted onto settled ` +
        `ground (base ${base.toFixed(1)} m) — no re-fetch, no race.`,
    );
  }

  /**
   * §CTX-BUILDINGS-INPLACE-RESEAT (L-635) — re-seat the ALREADY-PLACED context building entities
   * onto the settled terrain ground WITHOUT a re-fetch. This is the "right future enhancement" the
   * §7053 pull-doc called for, now shipped: every context polygon is drawn with
   * `perPositionHeight:false`, so it is seated entirely by its two SCALAR heights (`height` = base,
   * `extrudedHeight` = top). Re-seating is therefore purely updating those two numbers per entity —
   * preserving each footprint's OWN extruded thickness (near/far/height-clamped alike, read back off
   * the entity so we never need to know which tier it came from). No network, no `clearContextBuildings`,
   * no AbortController — so it structurally cannot race the pan / location-change loads that made the
   * old `loadContextBuildings(force)` re-seat blank the scene. Fully guarded; never throws into a frame.
   */
  private reseatContextPlacementsForBase(): void {
    const viewer = this.viewer;
    if (!viewer) return;
    if (!this.groundReliefAttached()) return;              // flat/keyless path already seats exactly.
    if (this.contextBuildingPlacements.length === 0) return; // nothing placed yet — initial load will seat.
    const now = Cesium.JulianDate.now();
    const safeBase = this.formaTerrainBaseHeight;          // the just-settled city ground (~650 m Madrid).
    let reseated = 0;
    for (const { entity, feature } of this.contextBuildingPlacements) {
      try {
        const poly = entity.polygon;
        if (!poly || !poly.height || !poly.extrudedHeight) continue;
        const curBase = poly.height.getValue(now) as number | undefined;
        const curTop = poly.extrudedHeight.getValue(now) as number | undefined;
        if (typeof curBase !== 'number' || typeof curTop !== 'number') continue;
        const thickness = curTop - curBase;                // the footprint's own height, clamp-agnostic.
        const ring = feature.geometry.coordinates[0];
        const c = ring ? ringCentroidLatLon(ring) : null;
        // Per-point relief where its tile has streamed, else the settled safe base (never a culling ~0).
        const fGround = c ? this.sampleGround(c.lat, c.lon, safeBase) : safeBase;
        const fBase = fGround - FORMA_BASE_SINK_M;
        if (Math.abs(fBase - curBase) < 1e-3) continue;    // already seated at this ground.
        poly.height = new Cesium.ConstantProperty(fBase);
        poly.extrudedHeight = new Cesium.ConstantProperty(fBase + thickness);
        reseated++;
      } catch {
        // Skip a single entity; the re-seat must never break the whole pass.
      }
    }
    if (reseated > 0) viewer.scene.requestRender();
    console.log(
      `[CTX-DIAG] in-place re-seat: ${reseated}/${this.contextBuildingPlacements.length} context ` +
        `building(s) lifted onto settled ground (base ${safeBase.toFixed(1)} m) — no re-fetch, no race.`,
    );
  }

  /**
   * §A.21.D-TERRAIN-GUARD — TRUE only when `provider` is a REAL terrain provider
   * that can be sampled for elevation. `Cesium.sampleTerrainMostDetailed` reaches
   * into `provider.availability` (it calls `availability.computeMaximumLevelAtPosition`
   * to pick the LOD to request); the default `EllipsoidTerrainProvider` — the keyless
   * build's `viewer.terrainProvider` — has `availability === undefined`, so sampling
   * it throws `Cannot read properties of undefined (reading 'computeMaximumLevelAtPosition')`.
   * We feature-detect by:
   *   • rejecting an explicit `EllipsoidTerrainProvider` instance (flat ground, no data), and
   *   • requiring `provider.availability` to be present (a CesiumTerrainProvider / world
   *     terrain exposes it once ready).
   * Both checks are defensive (wrapped) so a Cesium-build quirk can never blank the view.
   */
  private terrainProviderHasElevationData(provider: Cesium.TerrainProvider): boolean {
    try {
      // The flat ellipsoid surface has no elevation data to sample.
      if (provider instanceof Cesium.EllipsoidTerrainProvider) return false;
      // sampleTerrainMostDetailed needs availability to pick the LOD; without it
      // the call throws the computeMaximumLevelAtPosition TypeError.
      const availability = (provider as unknown as { availability?: unknown }).availability;
      return availability != null;
    } catch {
      return false;
    }
  }

  /** Log the "terrain clamp degraded → base 0" message at most once. */
  private warnTerrainOnce(reason: string): void {
    if (this.formaTerrainWarned) return;
    this.formaTerrainWarned = true;
    console.warn('[CesiumViewport][forma] terrain clamp degraded (' + reason + ').');
  }

  /**
   * §SITEFRAME-GROUND (C12 §9 T0, C58 §1.14, C19 §1.4) — the per-point GROUND AUTHORITY.
   *
   * Returns the WGS-84 ELLIPSOIDAL ground height (m) at an arbitrary (lat, lon) by sampling
   * the ATTACHED baked terrain provider through the globe's already-loaded tile geometry
   * (`globe.getHeight` — a synchronous, in-memory read of the tessellated tiles; NO network,
   * so it is cheap enough to call once per placed footprint and never needs batching). This
   * REPLACES the single-centroid `formaTerrainBaseHeight` scalar as the concept consumers read
   * when they span the wider relief: instead of every neighbour sitting at the ONE centroid
   * height (so blocks on higher ground get buried by the mesh → the white z-fighting shells,
   * and blocks on lower ground float), each reads the ground UNDER ITSELF.
   *
   * HONEST FALLBACK (never throws): when no real terrain provider is attached, or the tile at
   * this point is not yet loaded (so `getHeight` returns `undefined`), we fall back to the
   * resolved centroid base `formaTerrainBaseHeight` — which is itself the honest flat-0 when no
   * terrain exists. Crucially this fallback only fires where there is NO visible relief to
   * z-fight (an unloaded tile is off-screen / not tessellated), so correctness holds exactly
   * where it is needed: wherever relief is drawn, its tiles ARE loaded and `getHeight` is exact.
   */
  /**
   * §CTX-DIAG-PROBE (L-635) — the definitive one-command context state dump (exposed as
   * `window.pryzmContextDiag()`). Reads the LIVE runtime, not a theory: how many context
   * entities exist, where they are seated, where the camera is, and whether the first one
   * falls inside the view frustum — so "never placed" vs "placed but off-camera" vs "seated
   * right, not drawn" is decided from data. Never throws.
   */
  private contextDiag(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    try {
      const viewer = this.viewer;
      out.hasViewer = !!viewer;
      out.formaMode = this.formaMode;
      out.contextEntities = this.contextBuildingEntities.length;
      out.contextPlacements = this.contextBuildingPlacements.length;
      out.contextBuildingsAt = this.contextBuildingsAt;
      out.formaTerrainEnabled = this.formaTerrainEnabled;
      out.formaTerrainCity = this.formaTerrainCity;
      out.formaTerrainBaseHeight = Number(this.formaTerrainBaseHeight.toFixed(2));
      out.groundReliefAttached = this.groundReliefAttached();
      const provider = viewer?.terrainProvider;
      out.terrainProviderType = provider ? provider.constructor?.name ?? 'unknown' : 'none';
      out.depthTestAgainstTerrain = !!viewer?.scene.globe.depthTestAgainstTerrain;
      // Camera position in geographic terms.
      if (viewer) {
        const camCarto = viewer.camera.positionCartographic;
        out.cameraLat = Number(Cesium.Math.toDegrees(camCarto.latitude).toFixed(5));
        out.cameraLon = Number(Cesium.Math.toDegrees(camCarto.longitude).toFixed(5));
        out.cameraHeightM = Number(camCarto.height.toFixed(1));
        // Ground height the globe currently reports at the site centroid (undefined = tile not streamed).
        if (this.contextBuildingsAt) {
          const g = viewer.scene.globe.getHeight(
            Cesium.Cartographic.fromDegrees(this.contextBuildingsAt.lon, this.contextBuildingsAt.lat),
          );
          out.globeGetHeightAtSite = typeof g === 'number' ? Number(g.toFixed(1)) : 'undefined(tile not streamed)';
        }
      }
      // First context entity: its seated base/top + whether the camera can see it.
      const first = this.contextBuildingEntities[0];
      if (first?.polygon && viewer) {
        const now = Cesium.JulianDate.now();
        const base = first.polygon.height?.getValue(now);
        const top = first.polygon.extrudedHeight?.getValue(now);
        out.firstEntitySeatBaseM = typeof base === 'number' ? Number(base.toFixed(1)) : base;
        out.firstEntitySeatTopM = typeof top === 'number' ? Number(top.toFixed(1)) : top;
        out.firstEntityShow = first.show;
        // Is the first entity inside the current view frustum? (visibility, not just existence.)
        try {
          const bs = first.polygon.hierarchy?.getValue(now);
          const positions = bs?.positions as Cesium.Cartesian3[] | undefined;
          if (positions && positions.length) {
            const sphere = Cesium.BoundingSphere.fromPoints(positions);
            const vis = viewer.camera.frustum
              .computeCullingVolume(viewer.camera.position, viewer.camera.direction, viewer.camera.up)
              .computeVisibility(sphere);
            out.firstEntityInFrustum = vis !== Cesium.Intersect.OUTSIDE;
          }
        } catch { /* frustum probe best-effort */ }
      }
      // §CTX-RENDER-SPLIT-PROBE (L-636) — the discriminating render state between a CORRECT baked-terrain
      // city (Barcelona/Copenhagen) and a WHITE-MASK one (Madrid/Amsterdam/Zürich). Both attach baked
      // terrain, so the differentiator is NOT "terrain vs flat" — it is somewhere in how the globe surface,
      // its lighting/imagery, the ground features, or the terrain tiles themselves render. Dump all of it so
      // a Madrid-vs-Copenhagen paste decides the root FROM DATA, not another theory.
      if (viewer) {
        const globe = viewer.scene.globe;
        out.globeShow = globe.show;                                   // is the terrain MESH drawn, or only sampled?
        out.globeEnableLighting = globe.enableLighting;               // flat-lit (no relief form) vs sun-shaded?
        out.globeShowGroundAtmosphere = globe.showGroundAtmosphere;
        try { out.globeBaseColor = globe.baseColor?.toCssColorString(); } catch { /* best-effort */ }
        try { out.sceneBackground = viewer.scene.backgroundColor?.toCssColorString(); } catch { /* best-effort */ }
        out.imageryLayerCount = viewer.imageryLayers.length;
        try { out.imageryFirstShow = viewer.imageryLayers.length ? viewer.imageryLayers.get(0).show : null; } catch { /* best-effort */ }
        out.roadEntities = this.contextRoadEntities.length;           // 0 = ground features never loaded (pre-plot)
        out.waterEntities = this.contextWaterEntities.length;
        out.parkEntities = this.contextParkEntities.length;
        // Terrain provider internals: vertex normals gate lighting; availability gates tile loading.
        const tp = provider as unknown as { hasVertexNormals?: boolean; availability?: unknown; _maximumLevel?: number };
        out.terrainHasVertexNormals = tp?.hasVertexNormals;
        out.terrainHasAvailability = !!tp?.availability;
        out.terrainMaxLevel = tp?._maximumLevel;
        out.globeTilesLoaded = globe.tilesLoaded;                     // false = terrain tiles still failing/streaming → white gaps
        // Relief profile: sample the globe height on a 3×3 grid ±1 km around the site. A uniform value =
        // flat/mesa; varying = real relief loaded; 'undefined' cells = tiles NOT tessellated (→ white).
        if (this.contextBuildingsAt) {
          const { lat: cLat, lon: cLon } = this.contextBuildingsAt;
          const dLat = 0.009, dLon = 0.009 / Math.cos(cLat * Math.PI / 180); // ~1 km
          const grid: (number | string)[] = [];
          for (let iy = -1; iy <= 1; iy++) {
            for (let ix = -1; ix <= 1; ix++) {
              const h = globe.getHeight(Cesium.Cartographic.fromDegrees(cLon + ix * dLon, cLat + iy * dLat));
              grid.push(typeof h === 'number' ? Number(h.toFixed(1)) : 'undef');
            }
          }
          out.reliefGrid3x3 = grid;                                   // [NW,N,NE, W,C,E, SW,S,SE]
        }
      }
    } catch (e) {
      out.error = String(e);
    }
    console.log('[CTX-DIAG] pryzmContextDiag →', out);
    return out;
  }

  private sampleGround(lat: number, lon: number, baseOverride?: number): number {
    // §CTX-BUILDINGS-RENDER-FIRST (L-635) — the fallback base is normally the settled centroid
    // (`formaTerrainBaseHeight`), but a caller placing context under attached relief passes an
    // explicit SAFE base so an un-tessellated point can never fall back to a depth-culling ~0.
    const fallback = typeof baseOverride === 'number' && Number.isFinite(baseOverride)
      ? baseOverride
      : this.formaTerrainBaseHeight;
    // §CTX-PERFOOTPRINT-SAMPLE (L-635) — PREFER the batch `sampleTerrainMostDetailed` height for this
    // footprint if one was pre-sampled this load. This is the fix for "buildings sit below the terrain":
    // `globe.getHeight` returns GARBAGE in Forma mode (the globe is show=false, so no tessellated tiles
    // to read — the live diag showed seat[finite=0 fallback=101] on every load and getHeight ≈ -6.3e6 m),
    // so per-footprint relief NEVER resolved and every building sat at the single flat centroid base while
    // the roads draped on the real relief. `sampleTerrainMostDetailed` reads the terrain provider directly
    // (works regardless of globe.show) and returns the correct height — batched once per load below.
    const cached = this.contextGroundCache.get(`${lat.toFixed(6)},${lon.toFixed(6)}`);
    if (typeof cached === 'number' && Number.isFinite(cached)) return cached;
    try {
      const globe = this.viewer?.scene.globe;
      const provider = this.viewer?.terrainProvider;
      if (!globe || !provider || !this.terrainProviderHasElevationData(provider)) return fallback;
      // `getHeight` is `undefined` where the tile is not yet tessellated → the pure fallback rule
      // (`resolveGroundSample`) reuses the centroid base rather than a stray 0 (the L-259 rule).
      return resolveGroundSample(globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat)), fallback);
    } catch {
      return fallback;
    }
  }

  /** §CTX-PERFOOTPRINT-SAMPLE (L-635) — per-footprint terrain heights sampled via
   *  `sampleTerrainMostDetailed` for THIS context load, keyed `lat.toFixed(6),lon.toFixed(6)`.
   *  Consulted by `sampleGround` so each building seats on its OWN real ground (not one flat base). */
  private contextGroundCache = new Map<string, number>();

  /**
   * §CTX-PERFOOTPRINT-SAMPLE (L-635) — batch-sample the REAL terrain height under each footprint centroid
   * via `sampleTerrainMostDetailed` (one network round-trip for the whole set) and cache them keyed by
   * `lat,lon`, so `sampleGround` returns per-footprint relief instead of the broken `globe.getHeight`.
   * No-op on the flat/keyless path (fallback base is already exact there). Never throws.
   */
  private async sampleContextGroundsBatch(centroids: ReadonlyArray<{ lat: number; lon: number }>): Promise<void> {
    this.contextGroundCache.clear();
    const viewer = this.viewer;
    if (!viewer || centroids.length === 0) return;
    const provider = viewer.terrainProvider as Cesium.TerrainProvider | undefined;
    if (!provider || !this.terrainProviderHasElevationData(provider)) return; // flat/keyless → base is exact.
    try {
      const cartos = centroids.map((c) => Cesium.Cartographic.fromDegrees(c.lon, c.lat));
      const sampled = await Cesium.sampleTerrainMostDetailed(provider, cartos);
      let ok = 0;
      for (let i = 0; i < sampled.length; i++) {
        const h = sampled[i]?.height;
        if (typeof h === 'number' && Number.isFinite(h)) {
          this.contextGroundCache.set(`${centroids[i].lat.toFixed(6)},${centroids[i].lon.toFixed(6)}`, h);
          ok++;
        }
      }
      console.log(`[CTX-DIAG] per-footprint terrain: sampleTerrainMostDetailed resolved ${ok}/${centroids.length} real ground heights (getHeight is unusable in Forma).`);
    } catch (e) {
      console.warn('[CTX-DIAG] per-footprint terrain batch-sample failed — falling back to centroid base:', e);
    }
  }

  /**
   * §CTX-BUILDINGS-RENDER-FIRST (L-635) — the SAFE base height context footprints must seat on so
   * they are never depth-culled under attached relief. THE INVARIANT: with real terrain attached
   * (`depthTestAgainstTerrain` culls anything below the mesh), a footprint whose own tile has not
   * tessellated must fall back to a base AT the settled ground — never the pre-clamp ellipsoid 0
   * that sits ~650 m under Madrid's mesh (invisible).
   *
   *   • no relief attached          → the flat centroid base is exact (ellipsoid IS the ground).
   *   • relief + a resolved base     → `formaTerrainBaseHeight` (the clamped city ground).
   *   • relief but base still ≈ 0    → the centroid clamp has not landed (or its sample failed).
   *     Recover the ground from whatever terrain has ALREADY streamed at the site centroid via
   *     `globe.getHeight` (the coarse root tile is usually resolved right after attach), so context
   *     seats at ~real ground and stays visible instead of vanishing while we wait for the clamp.
   */
  private resolveContextSafeBase(lat: number, lon: number): number {
    const base = this.formaTerrainBaseHeight;
    if (!this.groundReliefAttached()) return base;          // flat path — exact as-is.
    if (Math.abs(base) >= 1) return base;                    // clamp already resolved a real ground.
    // Relief attached but base ≈ 0 → seating here would depth-cull. Recover from streamed terrain.
    const centroidGround = this.sampleGround(lat, lon);
    return Number.isFinite(centroidGround) && Math.abs(centroidGround) >= 1 ? centroidGround : base;
  }

  /**
   * §SITEFRAME-GROUND (C12 §9 T0) — TRUE when a REAL baked terrain provider (relief) is
   * currently attached, so `sampleGround` yields per-point elevation AND ground-clamped
   * overlays (the site-metric heatmap) should DRAPE on the mesh instead of hovering on one
   * flat centroid plane (where the relief occludes them → the faint heatmap). FALSE on the
   * keyless / un-baked-city / ellipsoid path, where the flat base is exactly correct and the
   * legacy flat placement must be preserved byte-for-byte (no regression).
   */
  private groundReliefAttached(): boolean {
    const provider = this.viewer?.terrainProvider;
    return !!provider && this.terrainProviderHasElevationData(provider);
  }

  /**
   * §TERRAIN-RENDER (Phase 3, North Star §6.3 / terrain.mjs §9) — attach the BAKED
   * quantized-mesh terrain tileset for the site's city so real ground renders under the
   * massing. Attaching a `CesiumTerrainProvider` (which exposes `availability`) is exactly
   * what flips `terrainProviderHasElevationData()` TRUE, so the next `clampTerrainThenReplace`
   * runs `sampleTerrainMostDetailed` and re-seats on real ground. The baked heights are already
   * WGS-84 ELLIPSOIDAL (terrain.mjs bakes the `napToEllipsoidal` geoid lift in), so the sample
   * agrees with the building/envelope datum — nothing floats or buries (the datum-share, C12 §1.4).
   *
   * GUARD — NO REGRESSION FOR UN-BAKED CITIES:
   *   • no tiles base configured (local/dev Overpass path) → return, keep flat.
   *   • lon/lat outside every baked-terrain city bbox → return, keep flat.
   *   • already attached for this city → return (idempotent; called on every context load/pan).
   *   • `CesiumTerrainProvider.fromUrl` throws (layer.json 404 — city listed but not yet baked
   *     in R2, or the same-origin proxy doesn't serve `terrain/`) → keep the default
   *     EllipsoidTerrainProvider (flat base 0). The city is remembered so we don't re-attempt.
   * Self-correcting: a city lights up with NO code change the moment CI publishes its tileset.
   */
  private async maybeAttachTerrainProvider(lat: number, lon: number): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) { console.log('[CesiumViewport][terrain] skip: no viewer'); return; }
    // §A.21.D-GLOBE3 — on the paid photoreal path the Google 3D tiles already carry ground +
    // buildings at real elevation; laying our terrain mesh under them would double-ground / z-fight
    // the globe. Leave the photoreal path exactly as it was (the free Forma path is where terrain renders).
    // §L-631 — FOUNDER DIRECTIVE (2026-07-26): terrain ON everywhere in 3D Site, issues solved as they
    // come. Un-revert of L-626: in Forma the photoreal tileset is show=false and the globe is shown, so
    // draping our baked terrain is correct; skip our terrain ONLY on the true photoreal (non-Forma) path
    // where Google 3D tiles already carry ground. KNOWN interim regression until the SiteFrame reseat
    // (T1) lands: base-0 context buildings z-fight the relief → white shells; heatmap on flat ground →
    // faint (L-584/L-585 reseat is the in-flight fix). Accepted per founder decision.
    // §TERRAIN-TOGGLE (founder 2026-07-27) — the pure gate: user toggle OFF, the photoreal path,
    // or an un-baked city each keep flat ground (no regression). Only a positive decision attaches.
    const decision = decideBakedTerrainAttach({
      terrainEnabled: this.formaTerrainEnabled,
      photorealActive: this.photorealTilesActive,
      formaMode: this.formaMode,
      lon, lat,
    });
    if (!decision.attach) {
      console.log(`[CesiumViewport][terrain] skip: ${decision.reason} (lat=${lat.toFixed(5)} lon=${lon.toFixed(5)} → flat ground)`);
      return;
    }
    const city = decision.city;
    console.log(`[CesiumViewport][terrain] evaluate lat=${lat.toFixed(5)} lon=${lon.toFixed(5)} → city=${city}`);
    if (city === this.formaTerrainCity) { console.log(`[CesiumViewport][terrain] skip: '${city}' already attached`); return; }
    // §TERRAIN-SEAT-RACE (L-635) — SHARED, AWAITABLE, IDEMPOTENT attach. The old `formaTerrainProbedCities`
    // Set was `.add(city)`-ed BEFORE the `fromUrl` await, so a concurrent caller saw `has(city)` and
    // returned WITHOUT awaiting the in-flight attach — leaving `ensureGroundBaseForContext` to sample the
    // still-flat ellipsoid → context seated at base 0, ~700 m UNDER Madrid's mesh (the sink bug). Now every
    // concurrent caller awaits the SAME attach Promise, so none proceeds against the ellipsoid.
    const existing = this.formaTerrainAttach.get(city);
    if (existing) { await existing; return; }
    const url = terrainTilesetUrl(city);
    console.log(`[CesiumViewport][terrain] '${city}' → tileset url=${url ?? 'NULL (no tiles base configured)'}`);
    if (!url) return;                                  // no tiles base configured → flat (unchanged)
    const attach = (async (): Promise<void> => {
      let provider: Cesium.CesiumTerrainProvider;
      try {
        // fromUrl fetches `${url}/layer.json`; a 404 means "not baked yet" → rejects → we stay flat.
        // §TERRAIN-NORMALS (L-636) — request the baked Oct-Encoded Per-Vertex Normals so the globe can
        // slope-shade relief under enableLighting. Without normals every slope paints the flat baseColor →
        // high-relief cities (Madrid/Zürich) render as a featureless white mask while flat cities look fine.
        provider = await Cesium.CesiumTerrainProvider.fromUrl(url, { requestVertexNormals: true });
      } catch {
        console.log(`[CesiumViewport][terrain] no baked terrain for '${city}' (${url}) — keeping flat ground.`);
        return;                                          // resolved no-op → future calls await this, no re-hammer
      }
      // Superseded / disposed during the await → drop it (a newer site owns the viewer now).
      if (!this.isViewerLive() || this.viewer !== viewer) return;
      if (this.formaTerrainCity === city) return;        // a concurrent call for the SAME city already attached.
      viewer.terrainProvider = provider;
      this.formaTerrainCity = city;
      // §TERRAIN-NORMALS (L-636) — with baked relief + per-vertex normals attached, LIGHT the globe so the
      // terrain slope-shades (form reads as light/shadow) instead of flat-lighting every slope the same
      // near-white baseColor (the "white mask"). Flat/un-baked cities keep enableLighting=false (§2 look);
      // detachBakedTerrain resets it. Harmless on the ellipsoid, but only relief benefits from the shading.
      try { viewer.scene.globe.enableLighting = true; } catch { /* ignore */ }
      // §GLOBE-RENDER-PROBE (L-639) — DEFENSIVELY force the globe surface to render the attached terrain.
      // High-elevation interior cities (Burgos ~912m) show the terrain provider working (sampleTerrain=912m,
      // buildings seat right) but the RENDERED globe collapsed (getHeight=-6.3e6, no visible ground). Assert
      // globe.show + force a full quadtree re-tessellation (clearing the surface tile tree) so a stale/empty
      // tile set can't leave high terrain undrawn. Harmless on cities that already render.
      try {
        const globeR = viewer.scene.globe;
        globeR.show = true;
        const surf = (globeR as unknown as { _surface?: { invalidateAllTiles?: () => void; tileProvider?: unknown } })._surface;
        surf?.invalidateAllTiles?.();
      } catch { /* ignore */ }
      console.log(`[CesiumViewport][terrain] attached baked terrain for '${city}' (${url}) — normals ON, globe lit + shown, tiles invalidated, re-clamping ground.`);
      viewer.scene.requestRender();
      // §CAMERA-UNDERGROUND-FIX (L-639) — THE interior-city white-terrain root. `frameSiteLocationOnResolvedGround`
      // races this attach: on a high city it resolves groundBase=0 (terrain not yet attached) and parks the
      // pre-plot camera at 0+600 = 600 m. But the terrain is at ~912 m, so the camera sits 312 m UNDERGROUND →
      // Cesium frustum-culls every terrain tile (renderedTerrainTiles=0) → white, with buildings floating.
      // (Coastal cities <600 m ground never tripped it — the camera stayed above.) Now that the real terrain
      // is attached, sample the ground here and, if the camera is at/below it, RE-FRAME above the terrain.
      try {
        const [gr] = await Cesium.sampleTerrainMostDetailed(provider, [Cesium.Cartographic.fromDegrees(lon, lat)]);
        const gh = gr?.height;
        const camH = viewer.camera.positionCartographic.height;
        if (typeof gh === 'number' && Number.isFinite(gh) && camH < gh + 5 && !this.formaUserMovedCamera) {
          console.log(`[CesiumViewport][terrain] §CAMERA-UNDERGROUND-FIX camera ${camH.toFixed(0)} m is under terrain ${gh.toFixed(0)} m — re-framing above.`);
          this.frameSiteLocationAtGround(lat, lon, gh, { instant: false });
        }
      } catch { /* best-effort camera lift */ }
      // The massing was seated on the flat base before terrain arrived. Drop the sampled-at cache and
      // re-clamp so it (and context) seats on the real sampled ground.
      this.formaTerrainSampledAt = null;
      const input = this.formaLastMassingInput;
      if (input) void this.clampTerrainThenReplace(input);
    })();
    this.formaTerrainAttach.set(city, attach);
    await attach;
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
  /**
   * §GLOBE-CAMERA-FOLLOWS-BUILDING — TRUE once `renderFormaMassing`/
   * `renderBuildingOnGlobe` has placed a building and seated `formaMassingOrigin`
   * (the centroid the camera frames to). Lets a caller decide whether the
   * building-anchored `flyToFormaSite()` will actually fly (vs. no-op), so it can
   * fall back to a Site-location framing when no building is placed.
   */
  public hasFormaMassingPlaced(): boolean {
    return this.formaMassingOrigin != null;
  }

  /**
   * §FIX-GLOBE-AUTOFRAME-AND-SEAT (L-184) — arm the ONE-SHOT corrective re-frame for a fresh
   * "3D globe" ENTRY so no manual "Zoom to Site" is needed. The globe placement path
   * (`renderBuildingOnGlobe`) runs with `frameCentroid:false` — it deliberately does not fly,
   * leaving GISAreaLayout's immediate `reframeSiteIn3D()` to frame the building. But that
   * immediate frame lands at the FLAT base 0 (the async photoreal-tile height clamp hasn't
   * settled yet); when the clamp then re-seats the model on the real Google-tile ground, the
   * camera is NOT re-framed and stays parked at the base-0 overview (founder had to click "Zoom
   * to Site" by hand). Arming here routes the tile-base settle through `performInitialReframe`
   * (fires AT MOST ONCE, honours a user who has already grabbed the camera, frames the
   * building's bounding sphere at the SETTLED base) — the SAME machinery the flat-ground "3D
   * Site" view already uses. Also resets the fire/user-moved latches so a stale mount framing
   * can't suppress it. Call ONLY on a fresh globe entry — never on a fidelity flip, which must
   * not yank the camera. Public, Cesium-free, best-effort.
   */
  public armGlobeReframeOnBaseSettle(preset: 'oblique' | 'plan' = 'oblique'): void {
    this.formaReframeOnBaseSettle = preset;
    this.formaInitialReframeFired = false;
    this.formaOffscreenRescueUsed = false;
    this.formaUserMovedCamera = false;
  }

  /**
   * §GLOBE-FIRST-FRAME-BASE — one-shot camera re-frame fired by the terrain/tile
   * clamp once it settles a NEW `formaTerrainBaseHeight`. The initial framing in
   * `renderFormaMassing` ran synchronously, before the async height sample, so on
   * the FIRST activation it framed the camera against base 0 while the building
   * ends up seated on the real terrain (e.g. base ≈ 382 m) → the camera is left
   * ~382 m underground → the globe opens black. We re-issue the SAME framing (the
   * recorded oblique/plan preset) now that the base — and therefore the absolute
   * camera altitude in `flyToFormaSite` — is correct. Disarmed after one fire so
   * later moves/clamps never re-fly (they keep `frameCentroid:false` semantics).
   * No-op when nothing armed it (re-place passes, or a base that didn't change).
   */
  private reframeAfterBaseSettle(): void {
    // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — THE SETTLE CHOKEPOINT. Every terminal
    // of BOTH clamp paths calls this method (seat-and-reveal, base-unchanged, centroid-
    // unchanged-resolved, retries-exhausted, no-terrain-provider, and the crash-guard catch),
    // and `hold-hidden-retry` deliberately does NOT — it is still streaming. So this is the
    // one honest place to say "the ground datum has settled". Notified BEFORE the early
    // `!preset` return, because whether a corrective re-frame was ARMED is a camera concern
    // and has nothing to do with whether the datum settled.
    this.notifyGroundSettled(true);

    const preset = this.formaReframeOnBaseSettle;
    if (!preset) return;
    this.formaReframeOnBaseSettle = null; // consume the arm regardless of outcome
    this.performInitialReframe(preset, 'base-settle arm');
  }

  /**
   * §GLOBE-FRAME-NO-JUMP — the SINGLE funnel for the corrective "open already framed
   * on the building" re-fly that the async tile/terrain base-settle triggers. The
   * base can settle MORE THAN ONCE (photoreal tiles stream progressively; each
   * re-place may re-sample a slightly different surface height), so the old code that
   * re-flew on every settle yanked the camera repeatedly (founder: "jumps off / flies
   * away"). This funnel enforces the three invariants:
   *   1. FIRE AT MOST ONCE per framing placement (`formaInitialReframeFired` latch).
   *   2. NEVER re-fly after the user has taken camera control (`formaUserMovedCamera`).
   *   3. NEVER fly to an invalid (null / NaN) target — `flyToFormaSite` rejects those.
   * Shared by BOTH tile sources (Forma terrain clamp via `reframeAfterBaseSettle`, and
   * Google photoreal tiles via `clampToPhotorealTilesThenReplace`).
   */
  private performInitialReframe(preset: 'oblique' | 'plan', reason: string): void {
    if (!this.formaMassingOrigin) return;
    // §GLOBE-SITE-IN-VIEW (L-635) — the honest signal: is the site (seated on the SETTLED base) actually
    // inside the camera frustum? This replaces the two fragile heuristics (camera-height > 100 km and
    // base-jump > 20 m) that BOTH missed Madrid — its base-0 initial frame parks the camera ~700 m
    // UNDERGROUND at a LOW height (so the height guard missed), and a re-frame can leave base-jump ≈ 0
    // (so the jump guard suppressed). Frustum visibility is the thing we actually care about.
    const siteVisible = this.siteFramedInCurrentView();
    if (this.formaInitialReframeFired) {
      // Already framed once. Only re-fire if the site is genuinely off-screen (a stale / underground /
      // base-0 frame), and only ONE more time, so we never loop or yank a user who CAN see the site.
      if (siteVisible || this.formaOffscreenRescueUsed) return;
      this.formaOffscreenRescueUsed = true;
    }
    if (this.formaUserMovedCamera && siteVisible) {
      // The TRUE §GLOBE-FRAME-NO-JUMP case: the user has a real view OF THE SITE — honour it, never yank.
      this.formaInitialReframeFired = true;
      console.log('[CesiumViewport][forma] §GLOBE-FRAME-NO-JUMP — user framed the site; suppressing re-frame.');
      return;
    }
    // Either the user hasn't taken control, OR the site is off-screen (stranded / underground / base-0
    // frame) — reframe once regardless of the (often spurious view-switch) user-moved latch. THIS is the
    // Madrid/Zürich/Amsterdam fix: the buildings ARE seated on the terrain, the camera just wasn't looking.
    this.formaInitialReframeFired = true;
    console.log(
      `[CesiumViewport][forma] §GLOBE-SITE-IN-VIEW reframe — settled base ` +
        `${this.formaTerrainBaseHeight.toFixed(1)} m, siteVisible=${siteVisible} (${preset}, via ${reason}).`,
    );
    if (preset === 'plan') this.flyToFormaPlan();
    else this.flyToFormaSite();
  }

  /**
   * §GLOBE-SITE-IN-VIEW (L-635) — TRUE iff the site (its bounding sphere, centred on the SETTLED base
   * `formaTerrainBaseHeight`) is inside the camera frustum at a sane look-at range. The honest predicate
   * behind the corrective reframe: neither camera height nor base-jump proves the user can SEE the site
   * (a base-0 frame is underground at low height; a re-frame can leave base-jump ≈ 0 yet off-axis). Never
   * throws — on any failure returns false so the caller reframes (safe default: get the site on screen).
   */
  private siteFramedInCurrentView(): boolean {
    const viewer = this.viewer;
    const sphere = this.modelBoundingSphere();     // centred at formaTerrainBaseHeight (the settled ground)
    if (!viewer || !sphere) return false;
    try {
      const vis = viewer.camera.frustum
        .computeCullingVolume(viewer.camera.position, viewer.camera.direction, viewer.camera.up)
        .computeVisibility(sphere);
      if (vis === Cesium.Intersect.OUTSIDE) return false;
      const dist = Cesium.Cartesian3.distance(viewer.camera.position, sphere.center);
      return Number.isFinite(dist) && dist < Math.max(50_000, sphere.radius * 200); // sane look-at range
    } catch {
      return false;
    }
  }

  /**
   * §GLOBE-FIT-BUILDING (founder 2026-07-01, ADR-0095) — compute the placed building's
   * BOUNDING SPHERE (world Cartesian centre + radius) so the camera can FIT the whole
   * tower like "zoom-extents" on the main BIM view — instead of the √area altitude
   * heuristic that could clip/off-centre a tall building. Prefers the REAL model
   * primitive's own bounding sphere (exact); else derives one from the massing storey
   * bands (footprint half-diagonal × storey height) about the site centroid. Returns
   * null when nothing is placed / the math is non-finite. Pure read; guarded.
   */
  private modelBoundingSphere(): Cesium.BoundingSphere | null {
    const o = this.formaMassingOrigin;
    if (!o || !Number.isFinite(o.lat) || !Number.isFinite(o.lon)) return null;
    // Prefer the real model's own bounding sphere (exact, includes its true height).
    const model = this.realModelOnGlobe;
    if (model && !model.isDestroyed()) {
      const bs = (model as unknown as { boundingSphere?: Cesium.BoundingSphere }).boundingSphere;
      if (bs && Number.isFinite(bs.radius) && bs.radius > 0) return bs;
    }
    try {
      // Massing fallback: centre at the site centroid seated on the ground base; radius
      // = the footprint half-diagonal combined with the total building height so the
      // sphere encloses the whole tower (not just its plan).
      const originCartesian = Cesium.Cartesian3.fromDegrees(o.lon, o.lat, 0);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(originCartesian);
      let totalH = 0;
      for (const b of this.formaStoreyBands) {
        const top = (b.baseElevation || 0) + (b.heightM || 0);
        if (top > totalH) totalH = top;
      }
      if (!(totalH > 0)) totalH = 9;
      const half = Math.max(4, Math.sqrt(Math.max(1, o.areaM2)) / 2);
      const centreUp = this.formaTerrainBaseHeight + totalH / 2;
      const centre = Cesium.Matrix4.multiplyByPoint(
        enu, new Cesium.Cartesian3(o.centroidEast, o.centroidNorth, centreUp), new Cesium.Cartesian3(),
      );
      const radius = Math.max(6, Math.hypot(half, totalH / 2) * 1.15);
      if (!Number.isFinite(radius)) return null;
      return new Cesium.BoundingSphere(centre, radius);
    } catch {
      return null;
    }
  }

  /**
   * §GLOBE-FIT-BUILDING (ADR-0095) — fly the camera to FIT the placed building's
   * bounding sphere, pulling out slightly so the WHOLE tower is framed (zoom-extents),
   * with a gentle downward pitch. Shared by BOTH the initial 3D-Site/3D-Globe landing
   * and the "Zoom to Site" button. Returns true when it flew; false when no bounding
   * sphere could be resolved (the caller then falls back to the √area heuristic).
   */
  /**
   * §FEAT-GLOBE-DEFAULT-AUTOFRAME (L-226) — begin one of OUR programmatic camera flights.
   * Sets the in-flight flag and returns a fresh generation token. Pair with
   * `endProgrammaticFly(token)` on the flight's complete/cancel (and on a synchronous
   * throw). Starting a new flight supersedes any earlier one, so an earlier flight's
   * `cancel` callback — fired because Cesium cancelled its tween when this newer flight
   * began — cannot clear the flag out from under us (its token is now stale). This keeps
   * `formaProgrammaticFlyInFlight` TRUE for the whole span a flight of ours is animating,
   * so the `moveStart` listener never mistakes the handoff for the user grabbing the camera.
   */
  private beginProgrammaticFly(): number {
    this.formaProgrammaticFlyInFlight = true;
    return ++this.formaFlyToken;
  }

  /**
   * §FEAT-GLOBE-DEFAULT-AUTOFRAME (L-226) — release the in-flight flag for `token`, but
   * ONLY when it is still the most recent flight. A superseded/cancelled flight passing its
   * stale token is a no-op, so it can't clear the flag while a newer flight is mid-air.
   */
  private endProgrammaticFly(token: number): void {
    if (token === this.formaFlyToken) this.formaProgrammaticFlyInFlight = false;
  }

  private flyToModelBoundingSphere(orientationOverride?: { headingDeg: number; pitchDeg: number }): boolean {
    const viewer = this.viewer;
    if (!viewer) return false;
    const sphere = this.modelBoundingSphere();
    if (!sphere) return false;
    const headingDeg = orientationOverride?.headingDeg ?? FORMA_FLY_HEADING_DEG;
    const pitchDeg = orientationOverride?.pitchDeg ?? FORMA_FLY_PITCH_DEG;
    try {
      const flyToken = this.beginProgrammaticFly();
      const clearFlyFlag = (): void => { this.endProgrammaticFly(flyToken); };
      // Offset range ≈ 2.5× radius so the whole building sits comfortably in frame with
      // margin (matches "fit all" on the BIM view), from the same oblique heading/pitch.
      const range = Math.max(20, sphere.radius * 2.5);
      viewer.camera.flyToBoundingSphere(sphere, {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(headingDeg),
          Cesium.Math.toRadians(pitchDeg),
          range,
        ),
        duration: FORMA_FLY_DURATION_S,
        complete: clearFlyFlag,
        cancel: clearFlyFlag,
      });
      viewer.scene.requestRender();
      console.log(
        `[CesiumViewport][forma] §GLOBE-FIT-BUILDING flyToBoundingSphere: radius ` +
          `${sphere.radius.toFixed(1)} m, range ${range.toFixed(0)} m (heading ${headingDeg}°, pitch ${pitchDeg}°).`,
      );
      return true;
    } catch (e) {
      this.formaProgrammaticFlyInFlight = false;
      this.formaFlyToken++; // invalidate any pending clear so a late callback can't re-toggle.
      console.warn('[CesiumViewport][forma] §GLOBE-FIT-BUILDING flyToBoundingSphere failed — falling back:', e);
      return false;
    }
  }

  public flyToFormaSite(orientationOverride?: { headingDeg: number; pitchDeg: number }): void {
    const viewer = this.viewer;
    const o = this.formaMassingOrigin;
    if (!viewer || !o) {
      console.warn('[CesiumViewport][forma] flyToFormaSite: no massing placed yet — ignored.');
      return;
    }
    // §GLOBE-FIT-BUILDING — prefer fitting the actual building bounding sphere (whole
    // tower framed, zoom-extents) for BOTH the initial landing and Zoom-to-Site; fall
    // back to the √area altitude heuristic below only when no sphere resolves.
    if (this.flyToModelBoundingSphere(orientationOverride)) return;
    // §GLOBE-FRAME-NO-JUMP — never fly to an invalid frame target. A NaN/non-finite
    // lat/lon/centroid (e.g. a placement that failed to resolve a footprint) would
    // send the camera "off" to nowhere — the founder's "jumps off / flies away".
    if (
      !Number.isFinite(o.lat) || !Number.isFinite(o.lon) ||
      !Number.isFinite(o.centroidEast) || !Number.isFinite(o.centroidNorth) ||
      !Number.isFinite(o.areaM2)
    ) {
      console.warn(
        '[CesiumViewport][forma] flyToFormaSite: invalid frame target ' +
          `(lat=${o.lat}, lon=${o.lon}, east=${o.centroidEast}, north=${o.centroidNorth}, ` +
          `area=${o.areaM2}) — ignored.`,
      );
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
      // §FLY-TOUR-GROUND-CLEARANCE — `alt` is height above ground; seat it on the
      // (tile-clamped) site ground so the camera never frames from underground
      // (black globe) when the site sits on non-zero terrain.
      const absAlt = this.formaTerrainBaseHeight + Math.max(alt, FORMA_FLY_MIN_GROUND_CLEARANCE_M);
      const destination = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, absAlt);
      // §GLOBE-FRAME-NO-JUMP — mark this flight as OURS so the moveStart listener
      // doesn't mis-read the resulting camera motion as a user taking control.
      // Cleared on complete/cancel (and defensively, the moveStart guard only
      // latches when this is false). §FEAT-GLOBE-DEFAULT-AUTOFRAME — token-gated so a
      // superseded flight's late cancel can't clear the flag mid-glide.
      const flyToken = this.beginProgrammaticFly();
      const clearFlyFlag = (): void => { this.endProgrammaticFly(flyToken); };
      viewer.camera.flyTo({
        destination,
        orientation: {
          heading: Cesium.Math.toRadians(headingDeg),
          pitch: Cesium.Math.toRadians(pitchDeg),
          roll: 0,
        },
        duration: FORMA_FLY_DURATION_S,
        complete: clearFlyFlag,
        cancel: clearFlyFlag,
      });
      viewer.scene.requestRender();
      console.log(
        `[CesiumViewport][forma] oblique flyTo: heading ${headingDeg}°, ` +
          `pitch ${pitchDeg}°, alt ${Math.round(alt)} m above ground ` +
          `(abs ${Math.round(absAlt)} m, base ${Math.round(this.formaTerrainBaseHeight)} m).`
      );
    } catch (e) {
      // §GLOBE-CRASH-GUARD — if flyTo (or the centroid math) threw synchronously
      // after we set the in-flight flag, its complete/cancel callbacks never ran;
      // clear the flag here so it cannot stick `true` and freeze the moveStart
      // user-control latch. Composes with §GLOBE-FRAME-NO-JUMP. §FEAT-GLOBE-DEFAULT-
      // AUTOFRAME — bump the token so the now-orphaned clearFlyFlag can't re-toggle it.
      this.formaProgrammaticFlyInFlight = false;
      this.formaFlyToken++;
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

  /** §FLY-TOUR — whether a cinematic fly-through is currently running (the GIS
   *  toolbar disables the "▶ Fly tour" button while true). */
  public isFlyTourRunning(): boolean {
    return this._flyTourRunning;
  }

  /**
   * §FLY-TOUR — cinematic flythrough around the placed building. A chained
   * `camera.flyTo` sequence: far top-down overview → oblique approach → low
   * oblique close-up (slight circle) → pull back up to the standard Forma
   * framing. Each leg eases (CUBIC_IN_OUT) for film-like accel/decel and the
   * legs are chained via the per-flyTo `complete` promise so they never overlap.
   *
   * Robust + re-entrant-safe: no-op (resolves immediately) when no building is
   * placed or a tour is already running; never throws. Window-level framing
   * (diving to specific openings) is a deferred follow-up — this pass circles
   * the building centroid.
   *
   * @returns a promise that resolves when the tour finishes (or is skipped).
   */
  public async flyTour(): Promise<void> {
    const viewer = this.viewer;
    const o = this.formaMassingOrigin;
    if (!viewer || !o) {
      console.warn('[CesiumViewport][forma] flyTour: no massing placed yet — ignored.');
      return;
    }
    if (this._flyTourRunning) {
      console.log('[CesiumViewport][forma] flyTour: already running — ignored.');
      return;
    }
    this._flyTourRunning = true;
    console.log('[CesiumViewport][forma] flyTour: starting cinematic flythrough.');
    try {
      // Re-derive the building centroid (same ENU anchor as placement/flyToFormaSite).
      const originCartesian = Cesium.Cartesian3.fromDegrees(o.lon, o.lat, 0);
      const enu = Cesium.Transforms.eastNorthUpToFixedFrame(originCartesian);
      const centroidCartesian = Cesium.Matrix4.multiplyByPoint(
        enu,
        new Cesium.Cartesian3(o.centroidEast, o.centroidNorth, 0),
        new Cesium.Cartesian3()
      );
      const carto = Cesium.Cartographic.fromCartesian(centroidCartesian);
      const lon = carto.longitude;
      const lat = carto.latitude;
      const span = Math.sqrt(Math.max(1, o.areaM2)); // ~plot edge length (m)
      // §FLY-TOUR-GROUND-CLEARANCE — `opts.alt` is height ABOVE GROUND; seat it on
      // the (tile-clamped) site ground and never let the camera dip below the
      // minimum clearance, or with depthTestAgainstTerrain on we'd go black.
      const groundBase = this.formaTerrainBaseHeight;

      const ease = Cesium.EasingFunction.CUBIC_IN_OUT;
      // Promise-wrap a single flyTo leg via its `complete` callback.
      const leg = (opts: {
        alt: number;
        headingDeg: number;
        pitchDeg: number;
        duration: number;
      }): Promise<void> =>
        new Promise<void>((resolve) => {
          const absAlt = groundBase + Math.max(opts.alt, FORMA_FLY_MIN_GROUND_CLEARANCE_M);
          viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromRadians(lon, lat, absAlt),
            orientation: {
              heading: Cesium.Math.toRadians(opts.headingDeg),
              pitch: Cesium.Math.toRadians(opts.pitchDeg),
              roll: 0,
            },
            duration: opts.duration,
            easingFunction: ease,
            complete: () => resolve(),
            cancel: () => resolve(),
          });
          viewer.scene.requestRender();
        });

      // 1) Far overview — high, near top-down.
      await leg({
        alt: Cesium.Math.clamp(span * 12, 600, 6000),
        headingDeg: 0,
        pitchDeg: -85,
        duration: 3.5,
      });
      // 2) Approach — closer, oblique NW.
      await leg({
        alt: Cesium.Math.clamp(span * 4, 200, 1500),
        headingDeg: 315,
        pitchDeg: -45,
        duration: 3.5,
      });
      // 3) Dive — low oblique close-up, swung round to the opposite side (circle).
      await leg({
        alt: Cesium.Math.clamp(span * 0.9, 30, 120),
        headingDeg: 135,
        pitchDeg: -18,
        duration: 4,
      });
      // 4) Pull back up to the standard Forma framing.
      this.flyToFormaSite();
      console.log('[CesiumViewport][forma] flyTour: complete.');
    } catch (e) {
      console.warn('[CesiumViewport][forma] flyTour failed:', e);
    } finally {
      this._flyTourRunning = false;
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
    // §SITE-OVERLAY-NOT-BUILDING — the FULL clear genuinely disposes everything, so the
    // overlay membership must reset with it. Without this the Set retains destroyed entities
    // forever: an unbounded leak, and a stale reference that could make a LATER entity (a
    // recycled object identity) wrongly test as "site overlay" and survive a clear it should
    // not have. Membership must not outlive the entities it describes.
    this.formaSiteOverlayEntities.clear();
    this.setFormaSilhouetteTargets([]);
  }

  /**
   * §A.21.D49 — remove ONLY the Forma massing polygon entities (the pastel/white
   * blocks), leaving the real-model-on-globe primitive and the stored storey-band
   * metadata intact. Used when the detailed `renderRealModelOnGlobe` succeeds: the
   * massing pass already ran (to establish the tile clamp + floor selector), and we
   * now hide its abstract blocks so only the real model shows on the tiles.
   */
  public clearFormaMassingEntitiesOnly(): void {
    const viewer = this.viewer;
    // §SITE-OVERLAY-NOT-BUILDING (L-464, completed by L-468) — ⚠ THIS IS WHERE THE ENVELOPE
    // WAS ACTUALLY DYING, and why the first L-464 fix did nothing on the photoreal globe.
    //
    // This method REMOVES entities; it does not hide them. So the `setGlobeBuildingShown`
    // skip-set added by L-464 was irrelevant here — a show/hide guard cannot save an entity
    // from `entities.remove()`. Founder log, decisive: "REAL detailed model placed on tiles —
    // massing blocks hidden", immediately after which the envelope vanished even though the
    // datum had resolved (54.29 m) and the draw diag said `present=y added=1`.
    //
    // The buildable envelope and the parcel boundary are SITE CONTEXT, not abstract massing
    // blocks. The whole point of this method is "the real model supersedes the massing" — the
    // real model does NOT supersede the planning constraint the design must sit inside. An
    // envelope that disappears the moment your building appears is the silent false negative
    // C58 §1.4 forbids, and it disappears at exactly the moment it becomes most useful.
    const kept: Cesium.Entity[] = [];
    if (viewer) {
      for (const ent of this.formaMassingEntities) {
        if (this.formaSiteOverlayEntities.has(ent)) { kept.push(ent); continue; }
        try { viewer.entities.remove(ent); } catch { /* already gone */ }
      }
    }
    // Keep the overlays in the array so the NEXT full re-render still clears them (they share
    // the CLEAR lifecycle — that part was always right; only the SUPERSEDE step was wrong).
    this.formaMassingEntities = kept;
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
  /**
   * §CTX-BUILDINGS-SEAT-FIRST (L-635) — ensure the terrain ground base for a context site is
   * RESOLVED before its buildings are placed, so they seat once at the true city elevation instead
   * of at ellipsoid 0 then re-seated (the base-0-then-lift race). Awaited in PARALLEL with the
   * footprint fetch (no added latency). Steps, each guarded so it can only ever return a usable base:
   *   1. Attach the baked terrain for this city (idempotent; no-op on flat/keyless/terrain-off).
   *   2. No real elevation provider (flat / un-baked / terrain toggled off) → base 0 is EXACT ground.
   *   3. Already sampled for this exact centroid (clampTerrainThenReplace may have run) → reuse it.
   *   4. Otherwise `sampleTerrainMostDetailed` at the centroid → set `formaTerrainBaseHeight`.
   * Returns the resolved base (0 on the flat path). Never throws.
   */
  private async ensureGroundBaseForContext(lat: number, lon: number): Promise<number> {
    try {
      await this.maybeAttachTerrainProvider(lat, lon);   // idempotent; attaches baked terrain if any.
    } catch { /* attach failure → stay on whatever ground we have */ }
    const viewer = this.viewer;
    if (!viewer) return this.formaTerrainBaseHeight;
    const provider = viewer.terrainProvider as Cesium.TerrainProvider | undefined;
    // Flat / keyless / un-baked city / terrain toggled off → the ellipsoid IS the ground (base 0).
    if (!provider || !this.terrainProviderHasElevationData(provider)) return this.formaTerrainBaseHeight;
    // Already resolved for this exact centroid → reuse (don't re-sample the network every load).
    const prev = this.formaTerrainSampledAt;
    if (
      prev && Math.abs(prev.lat - lat) < 1e-6 && Math.abs(prev.lon - lon) < 1e-6 &&
      Math.abs(this.formaTerrainBaseHeight) >= 1e-3
    ) {
      return this.formaTerrainBaseHeight;
    }
    try {
      const carto = Cesium.Cartographic.fromDegrees(lon, lat);
      const [result] = await Cesium.sampleTerrainMostDetailed(provider, [carto]);
      const h = result?.height;
      if (typeof h === 'number' && Number.isFinite(h)) {
        this.formaTerrainBaseHeight = h;
        this.formaTerrainSampledAt = { lat, lon };
        console.log(
          `[CTX-DIAG] seat-first: terrain ground sampled ${h.toFixed(1)} m at LAT ${lat.toFixed(5)} ` +
            `LON ${lon.toFixed(5)} — context will be placed on it (no base-0 pass, no re-seat).`,
        );
        // §CAMERA-UNDERGROUND-FIX (L-639) — THE interior-city white-terrain root, fixed at the settle point.
        // The pre-plot camera was framed at a stale base (0 → 600 m) BEFORE this resolved the real ground
        // (h ≈ 912 m for Burgos). It now sits 300 m UNDERGROUND → Cesium frustum-culls EVERY terrain tile
        // (renderedTerrainTiles=0) → white, buildings floating. Being clearly below the ground is NEVER a
        // valid camera state, so re-frame above it UNCONDITIONALLY (no user-moved guard — the earlier guard
        // was latched by the arrival flight and blocked the fix). A camera already above the ground (coastal,
        // or a user who zoomed out) is > h so this no-ops.
        const camH = viewer.camera.positionCartographic.height;
        if (camH < h - 10) {
          console.log(`[CesiumViewport][terrain] §CAMERA-UNDERGROUND-FIX camera ${camH.toFixed(0)} m is UNDER ground ${h.toFixed(0)} m — re-framing above.`);
          this.frameSiteLocationAtGround(lat, lon, h, { instant: false });
        }
      }
    } catch (e) {
      this.warnTerrainOnce('seat-first ground sample failed — using current base: ' + String(e));
    }
    return this.formaTerrainBaseHeight;
  }

  public async loadContextBuildings(lat: number, lon: number, force = false): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;

    // §TERRAIN-RENDER (Phase 3) / §CTX-SEAT-FIRST-PROBED-RACE (L-635) — the baked-terrain attach for
    // this site's city now happens INSIDE `ensureGroundBaseForContext` (awaited, in the Promise.all
    // below), NOT here as a fire-and-forget. A `void` call here was the Madrid-blank bug: it added the
    // city to `formaTerrainProbedCities` BEFORE its `CesiumTerrainProvider.fromUrl` resolved, so the
    // AWAITED attach inside `ensureGroundBaseForContext` hit the "already probed → return" guard and
    // came back before terrain was actually attached → the ground sample saw the flat ellipsoid →
    // context seated at base 0 (invisible ~650 m under Madrid's mesh). Barcelona (~12 m ground) hid
    // the bug because base 0 ≈ its real ground. Attaching ONLY via the awaited path removes the race:
    // the sample can't run until the provider is truly live. (No-op reloads early-return below with
    // terrain already attached from the first load, so nothing regresses.)

    // Skip when unchanged (≈0.1 m) and we already have entities, unless forced.
    const prev = this.contextBuildingsAt;
    if (
      !force && prev &&
      Math.abs(prev.lat - lat) < 1e-6 && Math.abs(prev.lon - lon) < 1e-6 &&
      this.contextBuildingEntities.length > 0
    ) {
      return;
    }

    // §CTX-PAN-DEBOUNCE (L-402c) — stamp the load time so the pan-refresh cooldown can
    // stop a fetch repeating within its window (counts from the moment we commit to fetch).
    this.contextLastLoadAtMs = Date.now();

    // §CTX-LOADING-BADGE-ARM (L-585) — ARM THE BADGE WHERE THE WAIT ACTUALLY BEGINS.
    //
    // Founder 2026-07-22: *"add the 'loading' surrounding buildings also when the context
    // buildings are not showing even if the boundary + envelope are showing."* That is precisely
    // the state this method opens in, and the badge was NOT shown for it. It was armed in exactly
    // ONE place — `renderFormaMassing` — so every other entry into a context load ran silent:
    // the `site.location-changed` load, the pan refresh, and the `clampTerrainThenReplace`
    // re-seat. The boundary and envelope paint synchronously and the context streams in after
    // (§DECOUPLE-ENVELOPE-FROM-CONTEXT), so "envelope up, neighbourhood missing, no explanation"
    // was the DEFAULT presentation of a perfectly healthy in-flight load.
    //
    // Arming it here — at the one point every load must pass, immediately before the await —
    // makes the indicator a property of THE FETCH rather than of one caller. Only when nothing is
    // on screen yet: a refresh that already has neighbours drawn must not flash a badge over a
    // scene that looks complete.
    if (this.contextBuildingPlacements.length === 0) this.setContextLoadingVisible(true);

    // Cancel any in-flight load; start a fresh one.
    this.contextBuildingsAbort?.abort();
    this.contextBuildingsAbort = new AbortController();
    const signal = this.contextBuildingsAbort.signal;

    // §PERF-CTX-SINGLE-FETCH (L-368) — ONE far-extent Overpass fetch; near + far split
    // client-side. `near` is rendered immediately (below); `far` is rendered right after
    // from the SAME data with no second network hop (was a gated fire-and-forget fetch).
    let near: ContextBuildingCollection;
    let far: ContextBuildingCollection;
    try {
      // §CTX-BUILDINGS-SEAT-FIRST (L-635) — resolve the terrain ground base IN PARALLEL with the
      // footprint fetch, so context is seated ONCE at the real city elevation (~650 m Madrid) the
      // first time — never at ellipsoid 0 then re-seated later (the base-0-then-lift race that left
      // Madrid/Zürich/Amsterdam blank while flat Barcelona/Copenhagen rendered). The terrain sample
      // overlaps the ~1–2 s Overpass/PMTiles read, so it adds no wall-clock: `ensureGroundBaseForContext`
      // attaches the baked terrain + samples the centroid ground and sets `formaTerrainBaseHeight`
      // BEFORE the placement loop below reads it via `resolveContextSafeBase`. Flat/keyless/terrain-off
      // resolves to 0 immediately (no regression).
      const [split] = await Promise.all([
        fetchContextBuildingsNearAndFar(lat, lon, signal),
        this.ensureGroundBaseForContext(lat, lon),
      ]);
      near = split.near;
      far = split.far;
    } catch (e) {
      // fetchContextBuildingsNearAndFar never throws, but be defensive.
      this.warnContextOnce('fetch threw — no context buildings: ' + String(e));
      // §CTX-LOADING-BADGE-ARM (L-585) — a FAILURE must not keep saying "loading". Leaving the
      // badge spinning here promises an arrival that is never coming, which is the same
      // failure-vs-empty conflation the badge exists to break — and it says something DIFFERENT
      // from "this area has no data", so it gets its own words.
      this.setContextLoadingVisible(true, 'Surrounding buildings unavailable');
      return;
    }
    // §CTX-DIAG (L-635) — footprints fetched, BEFORE any seating/culling. This isolates a
    // fetch/data problem (0 here = Overpass/PMTiles returned nothing or was aborted) from a
    // seating/depth-cull problem (non-zero here but nothing on screen = culled under the mesh).
    console.log(
      `[CTX-DIAG] footprints fetched: near=${near.features.length} far=${far.features.length} ` +
        `for LAT ${lat.toFixed(5)} LON ${lon.toFixed(5)} (force=${force}).`,
    );
    const collection = near;
    // A newer load (or dispose) superseded us.
    // §CTX-LOADING-BADGE-ARM (L-585) — the badge is deliberately LEFT AS-IS on this path: a newer
    // load superseded us and armed it for itself, so clearing it here would blank the indicator
    // for a wait that is still running.
    if (signal.aborted || !this.viewer || this.viewer !== viewer) {
      // §CTX-DIAG (L-635) — an aborted/superseded load is the classic "context never appears"
      // cause: a re-fetch (terrain re-clamp, pan) cancelled this one mid-flight. Named so a chain
      // of these in the console reads as "the fetch keeps getting restarted", not "no data".
      console.log('[CTX-DIAG] context load ABORTED/superseded before placement (a newer load or dispose took over).');
      return;
    }

    // PW.2 (§DIAG-PARTY-WALL) — capture the neighbour footprints for the layout
    // pipeline (resolveBlindFacades reads them + projects them into world-XZ to
    // suppress windows/doors on a party/blind wall). Visual-only until PW.2; this
    // is the cleanest fetch-capture point. Best-effort, never throws.
    setNeighbourFootprints(lat, lon, collection);

    // §SITE-METRIC-HEATMAP — retain the footprints so the population / wind / heat
    // ground grids can read the surrounding built density; refresh an active heatmap.
    this.lastContextCollection = collection;
    if (this.siteMetricActive) this.renderSiteMetricOverlay();

    this.clearContextBuildings();
    this.contextBuildingsAt = { lat, lon };

    if (collection.features.length === 0) {
      this.warnContextOnce('no context footprints returned for this site (sparse/offline).');
      // §CTX-LOADING-BADGE-ARM (L-585) — ⚠ THIS RETURN USED TO LEAVE THE BADGE SPINNING FOREVER.
      // An empty ring is a settled ANSWER, and the badge must state it rather than keep implying
      // that buildings are still on the way. Same wording as the rendered-but-empty branch below,
      // because it is the same fact.
      this.setContextLoadingVisible(true, 'No surrounding building data for this area');
      return;
    }

    // ONE ENU frame at the site origin — identical anchor to renderFormaMassing.
    const originCartesian = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(originCartesian);
    // §A.21.D-FORMA — bury the bottom face below ground so it never z-fights the
    // flat ground plane (same fix as the proposed massing). §SITEFRAME-GROUND (T1): this is
    // now only the CENTROID reference (for logging / the no-relief fallback); each footprint
    // is re-seated on its OWN sampled ground in the loop below.
    const base = this.formaTerrainBaseHeight - FORMA_BASE_SINK_M;
    // §A.21.D-FORMA2 — fully OPAQUE context (was 0.92) so nothing in the Forma
    // scene reads as transparent; the white proposed mass still stands out against
    // the muted off-white context.
    const fill = Cesium.Color.fromCssColorString(FORMA_PALETTE.contextFill);
    // §CTX-SOLID-CONTEXT (L-636) — the translucent "assumed height" fill was REMOVED: on a city whose
    // OSM heights are mostly guessed (Madrid), a scene of 55%-alpha brightened boxes doesn't self-shadow
    // and reads as flat white, while a real-height city (Barcelona) rendered opaque + shaded. Per founder
    // direction (visual parity), ALL context renders with the opaque `fill`. Honest "unknown height" is
    // deferred to the height DATA (re-bake), not a washed material (C58 §1.4 trade-off, logged in L-636).
    const outline = Cesium.Color.fromCssColorString(FORMA_PALETTE.contextOutline).withAlpha(0.6);

    // §PLOT-CLEAR-ENVELOPE (L-402c) — drop any OSM footprint sitting ON the committed
    // working plot (the building the user is replacing) so the plot reads CLEAR and the
    // translucent #6600FF buildable-envelope study volume is not buried behind it. The
    // surrounding neighbourhood context is untouched (only substantially-on-plot
    // footprints are removed). Pure decision (partitionFootprintsByParcel); no-op when
    // no parcel is committed. Applied to BOTH the near ring (here) and the far ring (below).
    const parcelLonLat = this.committedParcelLonLat;
    const nearSplit = this.plotClearSplit(collection.features, parcelLonLat);
    if (nearSplit.removed.length > 0) {
      console.log(
        `[CesiumViewport][forma] §PLOT-CLEAR-ENVELOPE — suppressed ${nearSplit.removed.length} ` +
          `on-plot context building(s) so the buildable envelope reads on a clear plot ` +
          `(${nearSplit.kept.length} neighbourhood footprint(s) kept).`,
      );
    }

    // §FEAT-FORMA-CONTEXT-NEAR-CAP (L-454) — the near ring was UNCAPPED while the far ring was
    // capped at 900: the plan bounded the CHEAP half and left the expensive one (extruded +
    // outlined + shadow-casting) unbounded. Split it into its two render tiers HERE, at the
    // render boundary — deliberately NOT in the fetch, because `collection` above also feeds
    // setNeighbourFootprints (party-wall resolution) and the site-metric density heatmaps,
    // which need the COMPLETE set or they report a wrong density number.
    const nearTiers = selectNearRingRenderTiers({
      features: nearSplit.kept, centerLat: lat, centerLon: lon,
    });
    if (nearTiers.demoted.length > 0) {
      console.log(
        `[CesiumViewport][forma] §FEAT-FORMA-CONTEXT-NEAR-CAP — near ring tiered: ` +
          `${nearTiers.shadowed.length} shadow-casting (within ` +
          `${CONTEXT_NEAR_SHADOW_RADIUS_M} m, cap ${CONTEXT_NEAR_MAX_BUILDINGS}) + ` +
          `${nearTiers.demoted.length} demoted to shadowless/true-height ` +
          `(of ${nearSplit.kept.length} kept). Coverage unchanged; shadow casters bounded.`,
      );
    }

    // §CTX-PERFOOTPRINT-SAMPLE (L-635) — batch-sample the REAL terrain height under EVERY footprint about
    // to be placed (near shadowed + demoted + far), in ONE sampleTerrainMostDetailed round-trip, so each
    // building seats on its OWN relief. THE FIX for "buildings sit below the terrain": getHeight is
    // unusable in Forma (globe show=false → garbage), so without this every building sat at one flat base
    // while roads draped on the real relief. `sampleGround` reads this cache first. No-op on flat/keyless.
    const groundCentroids: Array<{ lat: number; lon: number }> = [];
    for (const f of nearTiers.shadowed) { const c = ringCentroidLatLon(f.geometry.coordinates[0]); if (c) groundCentroids.push(c); }
    for (const f of nearTiers.demoted) { const c = ringCentroidLatLon(f.geometry.coordinates[0]); if (c) groundCentroids.push(c); }
    for (const f of far.features) { const c = ringCentroidLatLon(f.geometry.coordinates[0]); if (c) groundCentroids.push(c); }
    await this.sampleContextGroundsBatch(groundCentroids);
    if (signal.aborted || !this.viewer || this.viewer !== viewer) return; // a newer load superseded us during the sample.

    // §CTX-BUILDINGS-RENDER-FIRST (L-635) — resolve the SAFE base ONCE for this placement so an
    // un-tessellated footprint under attached relief can never fall back to a depth-culling ~0.
    const contextSafeBase = this.resolveContextSafeBase(lat, lon);
    let placed = 0;
    // §CTX-DIAG (L-635) — per-point seat provenance for the founder-readable log below: how many
    // footprints got a REAL per-point terrain height off `globe.getHeight` vs fell back to the
    // settled centroid base because their tile had not tessellated yet. A low finite-rate on a
    // relief city (Madrid) is the signature of "seated before terrain streamed" — the exact
    // condition the safe-base guarantee (never a depth-culling 0) exists to survive.
    let seatFinite = 0;
    let seatFallback = 0;
    for (const f of nearTiers.shadowed) {
      try {
        const ring = f.geometry.coordinates[0];
        if (!ring || ring.length < 4) continue;
        // §SITEFRAME-GROUND (C12 §9 T1) — seat THIS footprint on the ground UNDER ITSELF
        // (per-point relief) rather than the single centroid base. With real terrain attached
        // that removes the white z-fighting shells: a neighbour on higher ground no longer has
        // the mesh punch up through its flat-centroid seat, and one on lower ground no longer
        // floats. Falls back to the centroid base when no relief is loaded here (no z-fight to fix).
        const fCentroid = ringCentroidLatLon(ring);
        // §CTX-BUILDINGS-RENDER-FIRST (L-635) — seat on the per-point relief when its tile has
        // streamed, else the SAFE base (settled ground, never a culling ~0), NOT a raw formaTerrainBaseHeight.
        const fGround = fCentroid ? this.sampleGround(fCentroid.lat, fCentroid.lon, contextSafeBase) : contextSafeBase;
        // §CTX-DIAG (L-635) — a seat equal to the safe base is (approximately) a fallback; a
        // different value came from a finite per-point `getHeight`. Approximate by construction
        // (a point can legitimately equal the base) but exact enough to read the streaming state.
        if (Number.isFinite(fGround) && fGround !== contextSafeBase) seatFinite++;
        else seatFallback++;
        const fBase = fGround - FORMA_BASE_SINK_M;
        const fTop = fGround;
        // lon/lat → local ENU metres about the origin, then ENU → ECEF.
        const positions = ring.map(([flon, flat]) => {
          const fc = Cesium.Cartesian3.fromDegrees(flon!, flat!, 0);
          // Local ENU offset of this point from the origin (vector in metres).
          const localOffset = Cesium.Matrix4.multiplyByPoint(
            Cesium.Matrix4.inverse(enu, new Cesium.Matrix4()),
            fc,
            new Cesium.Cartesian3(),
          );
          // Re-place at this footprint's own ground base in the SAME ENU frame.
          return Cesium.Matrix4.multiplyByPoint(
            enu,
            new Cesium.Cartesian3(localOffset.x, localOffset.y, fBase),
            new Cesium.Cartesian3(),
          );
        });
        // §CTX-MISSING-HEIGHT-FALLBACK (L-636) — a footprint with NO source height (heightM ≈ 0) was
        // extruded to Math.max(0.1, 0) = a 0.1 m FLAT sliver. Fall back to a legible 9 m block so it reads
        // as a building, not a flat outline. (Provenance handling for the FILL is below.)
        const rawHeightM = f.properties.heightM;
        const h = (Number.isFinite(rawHeightM) && rawHeightM >= 2) ? rawHeightM : 9;
        // §CTX-ASSUMED-HEIGHT-VISIBLE (L-527 interim) — a GUESS MUST NOT RENDER LIKE A MEASUREMENT.
        //
        // ~35-40% of Barcelona OSM footprints carry no `height` and no `building:levels`, so they
        // fall back to a flat 9 m default (`§CTX-HEIGHT-PROVENANCE` logs the share every run).
        // Painted in the SAME opaque off-white as the surveyed ones, those guesses were
        // indistinguishable from real data — the founder reads a block of flat 9 m boxes as a
        // rendering fault rather than as "we don't have this data", and any shadow, daylight or
        // party-wall study against them silently inherits the fabrication (C58 §1.4 in spirit).
        // This is the L-459 defect class, and it is the SAME mistake the envelope's hardcoded
        // `: 9` made — fixed there in v259 by refusing to invent, and fixed here by refusing to
        // DISGUISE.
        //
        // The real fix is measured heights (LiDAR nDSM — L-527/L-511c/L-512b), which is a build,
        // not a patch. The honest interim is to make the assumption legible: assumed-height
        // buildings render slightly translucent and cooler, so they read as "unknown height"
        // instead of as surveyed massing. **Deliberately NOT done: inventing a better-looking
        // number** (e.g. inheriting a neighbourhood median). That would make fabricated data MORE
        // convincing, which is strictly worse than leaving it visibly wrong.
        // §CTX-SOLID-CONTEXT (L-636 — founder side-by-side: Madrid buildings render FLAT WHITE while
        // Barcelona renders SHADED, SAME geometry). Root: Madrid's OSM heights are mostly flagged
        // 'assumed', so they took the TRANSLUCENT+cooler `assumedFill`, which does NOT self-shadow under
        // the sun → flat white; Barcelona's real heights took the OPAQUE `fill` → shaded. Render ALL
        // near-ring context with the OPAQUE fill so the sun-shadow pass shades every building = visual
        // parity with Barcelona. ⚠ HONESTY TRADE-OFF (C58 §1.4 / §CTX-ASSUMED-HEIGHT-VISIBLE): the washed
        // material was the DELIBERATE "unknown height" signal; per founder direction we drop the material
        // signal for visual parity. The honest fix is real height DATA (re-bake Madrid MDS heights) so
        // fewer footprints are 'assumed' at all. `isAssumedHeight` retained for the entity name/log only.
        const isAssumedHeight = f.properties.heightProvenance === 'assumed';
        const bodyFill = fill;
        const ent = viewer.entities.add({
          name: isAssumedHeight
            ? 'pryzm-forma-context-building-assumed-height'
            : 'pryzm-forma-context-building',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: fBase,
            // Top preserved above ground: this footprint's own ground + its height.
            extrudedHeight: fTop + Math.max(0.1, h),
            material: bodyFill,
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
        // §PLOT-CLEAR-ENVELOPE (L-418) — pair the entity with its source footprint so a
        // later parcel commit can re-filter this already-placed near ring without a refetch.
        this.contextBuildingPlacements.push({ entity: ent, feature: f });
        // §CTX-QUERY-PANEL (L-592) — the O(1) pick lookup, maintained in lock-step.
        this.contextFeatureByEntity.set(ent, f);
        placed++;
      } catch {
        // Skip a single malformed footprint; never break the whole load.
      }
    }

    viewer.scene.requestRender();
    console.log(
      `[CesiumViewport][forma] context buildings rendered: ${placed} extruded footprint(s) ` +
        `around LAT ${lat} LON ${lon} (§SITEFRAME-GROUND per-footprint seat, centroid base ` +
        `${base.toFixed(1)} m${this.groundReliefAttached() ? ', relief ON' : ', flat'}, ${FORMA_PALETTE.contextFill}@0.92, shadows on).`,
    );
    // §CTX-DIAG (L-635) — THE FOUNDER-READABLE STABILITY LINE. Everything needed to tell
    // "buildings placed but culled" from "no data" from "still fetching" in ONE line:
    //   • placed         — how many entities are actually in the scene now.
    //   • base           — the settled ground the un-tessellated footprints seat on. On a relief
    //                      city this MUST be the clamped ground (~650 m Madrid), never 0 — a 0 here
    //                      with relief ON is the depth-cull bug (buildings sink under the mesh).
    //   • relief         — whether real baked terrain is attached (so depthTestAgainstTerrain culls).
    //   • seat finite/fb — per-point terrain hits vs fallbacks: a fallback-heavy run on relief is
    //                      "seated before terrain streamed" and relies on the safe base being right.
    const reliefOn = this.groundReliefAttached();
    const baseAtRisk = reliefOn && Math.abs(contextSafeBase) < 1;
    // §TERRAIN-TOGGLE / §CTX-DEPTH-CULL-FIX (founder 2026-07-27) — the depth-cull isolation line:
    //   • terrainOn — the USER toggle (baked terrain attached at all).
    //   • depthCull — the LIVE `depthTestAgainstTerrain` state. With the fix this is FALSE in Forma,
    //                 so buildings render regardless of base-vs-relief height. If it ever reads TRUE
    //                 with relief on and base≈0, THAT is the vanish bug.
    //   • buildingsVisible≈ — placed when nothing culls; 0 only if the depth test is on AND the base
    //                 is under un-streamed relief. So flipping terrain OFF (or the depthCull fix)
    //                 makes buildingsVisible≈ jump back to placed — the founder's live confirmation.
    const depthCull = !!viewer.scene.globe.depthTestAgainstTerrain;
    const buildingsVisibleApprox = (depthCull && baseAtRisk) ? 0 : placed;
    console.log(
      `[CTX-DIAG] terrainOn=${this.formaTerrainEnabled} depthCull=${depthCull} ` +
        `buildingsPlaced=${placed} buildingsVisible≈${buildingsVisibleApprox} | ` +
        `clampBase=${this.formaTerrainBaseHeight.toFixed(1)}m ` +
        `seatBase=${contextSafeBase.toFixed(1)}m relief=${reliefOn ? 'ON' : 'off'} ` +
        `seat[finite=${seatFinite} fallback=${seatFallback}] ` +
        `safeBase=${baseAtRisk ? 'AT-RISK(base≈0 under relief → could cull IF depthCull on; terrain not yet streamed at centroid)' : 'ok'}`,
    );
    // §CTX-LOADING-BADGE (L-524b) — first buildings are on screen, so the wait is over. If the
    // ring came back genuinely EMPTY we say THAT instead of silently clearing: "no context data
    // here" and "still loading" are different facts and must not look identical (the failure-vs-
    // empty conflation of L-467/L-469, which is exactly what an unexplained blank scene is).
    this.setContextLoadingVisible(
      this.contextBuildingPlacements.length === 0,
      'No surrounding building data for this area',
    );

    // §FEAT-FORMA-CONTEXT-EXTENT-LOD (L-187) / §PERF-CTX-SINGLE-FETCH (L-368) — the near ring
    // (above) is now on screen; draw the wider FAR ring as flat/low-poly SHADOWLESS blocks
    // (nearest-N capped) so the neighbourhood extends without the naïve-radius shadow/geometry
    // perf cliff. The far set was split from the SAME single fetch — no second network hop, so
    // this renders immediately from `far` rather than gating on a separate Overpass round-trip.
    // §PLOT-CLEAR-ENVELOPE — the far ring gets the SAME on-plot filter (a large plot could
    // reach a far footprint), so the plot stays clear at every LOD tier.
    // §FEAT-FORMA-CONTEXT-NEAR-CAP (L-454) — the DEMOTED near-tier first: cheap shading, but
    // TRUE height (no 24 m clamp) because these are the site's own immediate neighbours.
    // plotClearSplit already ran on the near set above, so no second filter is needed.
    if (nearTiers.demoted.length > 0) {
      this.renderContextBuildingsFarRing(
        { type: 'FeatureCollection', features: nearTiers.demoted }, lat, lon, viewer,
        { heightClampM: null, label: 'near ring (demoted tier)' },
      );
    }

    const farSplit = this.plotClearSplit(far.features, parcelLonLat);
    this.renderContextBuildingsFarRing(
      { type: 'FeatureCollection', features: farSplit.kept }, lat, lon, viewer,
    );

    // §CTX-USE-COLOUR (L-599) — if the use MODE is on, colour the freshly-placed set (and refresh
    // the legend counts, which describe THIS scene). No-op when the mode is off.
    this.refreshContextUseColouringAfterLoad();

    // §SITEFRAME-GROUND-RESEAT (L-632) — these footprints were just seated on `sampleGround` at ONE
    // instant. With baked relief attached, most of the terrain has NOT streamed yet at that instant,
    // so their per-point `getHeight` fell back to the centroid base and they can sit under the mesh
    // (invisible). Arm a SINGLE re-seat for when the terrain finishes streaming so they settle onto
    // their real ground. No-op on the flat/keyless path (load-time seat is already exact there).
    this.armContextTerrainReseat(lat, lon);

    // §CTX-TERRAIN-GAP (L-635, founder-requested) — MEASURE whether the placed context buildings sit
    // BELOW the terrain surface, and by how much, sampled NOW and again after the terrain finishes
    // streaming (the gap can only appear once real relief has tessellated). This is the empirical
    // answer to "are the buildings always below the terrain in these cities" — it counts, per load,
    // how many placed footprints have their base under the live terrain surface at their own location.
    this.logTerrainGapDiagnostic(lat, lon);
  }

  /**
   * §CTX-TERRAIN-GAP (L-635) — empirical terrain-vs-building-seat measurement. For each placed context
   * footprint, compares its seated base to the LIVE terrain surface height (`globe.getHeight`) AT THAT
   * footprint's own location, and reports how many sit below the mesh and the worst gap. Sampled at
   * t+0, t+3s and t+8s because the terrain streams progressively — a building can seat correctly at
   * t+0 (coarse tile) yet end up under a finer mesh that streams in later. Pure logging; never throws.
   */
  private logTerrainGapDiagnostic(lat: number, lon: number): void {
    const viewer = this.viewer;
    if (!viewer) return;
    const sample = (tag: string): void => {
      try {
        if (!this.isViewerLive()) return;
        const globe = viewer.scene.globe;
        const now = Cesium.JulianDate.now();
        const centroidSurface = globe.getHeight(Cesium.Cartographic.fromDegrees(lon, lat));
        let checked = 0;
        let below = 0;
        let worstGapM = 0;      // most-negative (base − surface); < 0 means base under the terrain
        let sumGapM = 0;
        for (const { entity, feature } of this.contextBuildingPlacements.slice(0, 120)) {
          const ring = feature.geometry.coordinates[0];
          const c = ring ? ringCentroidLatLon(ring) : null;
          if (!c) continue;
          const surf = globe.getHeight(Cesium.Cartographic.fromDegrees(c.lon, c.lat));
          const base = entity.polygon?.height?.getValue(now);
          if (typeof surf !== 'number' || typeof base !== 'number') continue;
          const gap = base - surf;                 // negative ⇒ building base is UNDER the terrain surface
          checked++;
          sumGapM += gap;
          if (gap < -1) below++;
          if (gap < worstGapM) worstGapM = gap;
        }
        const avgGap = checked ? (sumGapM / checked) : 0;
        // §GLOBE-RENDER-PROBE (L-639) — dump Cesium's ACTUAL globe-render state so a high-city (Burgos)
        // console paste reveals WHY the globe won't draw correct terrain: is the globe shown, are tiles
        // loaded, is it the baked provider, and HOW MANY terrain tiles are actually in the render list.
        const gAny = globe as unknown as { show?: boolean; tilesLoaded?: boolean; _surface?: { _tilesToRender?: unknown[]; _levelZeroTiles?: Array<{ x: number; y: number; level: number; state?: number; renderable?: boolean; upsampledFromParent?: boolean; data?: { terrainState?: number } }> } };
        const provAny = viewer.terrainProvider as unknown as { constructor?: { name?: string }; hasVertexNormals?: boolean };
        const renderedTiles = Array.isArray(gAny._surface?._tilesToRender) ? gAny._surface!._tilesToRender!.length : -1;
        // §GLOBE-RENDER-PROBE2 (L-639) — dump the level-0 quadtree tile states so we see WHY 0 tiles render.
        // state: 0=START 1=LOADING 2=DONE 3=FAILED; R=renderable; U=upsampled; ts=terrainState.
        const lz = gAny._surface?._levelZeroTiles ?? [];
        const lzDump = lz.map((t) => `L0(${t.x},${t.y})st${t.state ?? '?'}${t.renderable ? 'R' : '-'}${t.upsampledFromParent ? 'U' : ''}ts${t.data?.terrainState ?? '?'}`).join(' ');
        // §CULL-PROBE (L-639) — the DECISIVE question: root(0,0) is DONE+renderable but renders 0. Ask Cesium
        // WHY. computeTileVisibility → 0=NONE (culled, the bug) / 1=PARTIAL / 2=FULL. Plus the tile's stored
        // min/max height, its bounding-volume CENTRE magnitude (want ~6.38e6 = ellipsoid surface; ~0 = a
        // geocentre-collapsed encode), and the horizon occlusion-point magnitude (want ~1.0 scaled; ~6.3e6 =
        // the unscaled-ECEF encoder bug that horizon-culls the whole shell). One paste ends the guessing.
        let cullDump = '';
        try {
          const surf = gAny._surface as unknown as { tileProvider?: { computeTileVisibility?: (t: unknown, fs: unknown, o: unknown) => number }; _occluders?: unknown };
          const tp = surf?.tileProvider;
          const fs = (viewer.scene as unknown as { frameState?: unknown }).frameState;
          // Inspect the ACTIVE root (DONE=state 2 + renderable), not a hardcoded hemisphere: Barcelona
          // (lon +2) lives in root(1,0), Burgos (lon −3) in root(0,0). The other root FAILS (st3) and is
          // meaningless. Fall back to the first tile if none is renderable yet.
          const rootList = lz as Array<{ x: number; y: number; state?: number; renderable?: boolean; data?: { tileBoundingRegion?: { minimumHeight?: number; maximumHeight?: number; boundingVolume?: { center?: { x: number; y: number; z: number } }; _orientedBoundingBox?: { center?: { x: number; y: number; z: number } } }; occludeePointInScaledSpace?: { x: number; y: number; z: number } } }>;
          const root = rootList.find((t) => t.state === 2 && t.renderable) ?? rootList[0];
          if (root && tp?.computeTileVisibility && fs) {
            const vis = tp.computeTileVisibility(root, fs, surf._occluders);
            const tbr = root.data?.tileBoundingRegion;
            const c = tbr?.boundingVolume?.center ?? tbr?._orientedBoundingBox?.center;
            const cMag = c ? Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z) : -1;
            const op = root.data?.occludeePointInScaledSpace;
            const opMag = op ? Math.sqrt(op.x * op.x + op.y * op.y + op.z * op.z) : -1;
            cullDump = ` | §CULL-PROBE root(${root.x},${root.y}) vis=${vis}(0=NONE/2=FULL) minH=${tbr?.minimumHeight?.toFixed(0)} maxH=${tbr?.maximumHeight?.toFixed(0)} bvCtrMag=${cMag.toFixed(0)}(want~6.38e6) occPtMag=${opMag.toFixed(4)}(want~1.0)`;
          } else {
            cullDump = ` | §CULL-PROBE missing root=${!!root} tp=${!!tp?.computeTileVisibility} fs=${!!fs}`;
          }
        } catch (e) { cullDump = ` | §CULL-PROBE err:${(e as Error).message}`; }
        console.log(
          `[CTX-TERRAIN-GAP] ${tag} terrainOn=${this.formaTerrainEnabled} relief=${this.groundReliefAttached() ? 'ON' : 'off'} ` +
            `centroidTerrainSurface=${typeof centroidSurface === 'number' ? centroidSurface.toFixed(1) + 'm' : 'undefined(not streamed)'} ` +
            `seatBase=${this.formaTerrainBaseHeight.toFixed(1)}m | of ${checked} sampled footprints: ` +
            `${below} BELOW terrain (avgGap=${avgGap.toFixed(1)}m, worst=${worstGapM.toFixed(1)}m under). ` +
            `${below > 0 ? '⚠ BUILDINGS UNDER MESH — this is the sink bug.' : '✓ buildings on/above surface.'} ` +
            `| §GLOBE-RENDER globeShow=${gAny.show} tilesLoaded=${gAny.tilesLoaded} provider=${provAny?.constructor?.name} normals=${provAny?.hasVertexNormals} renderedTerrainTiles=${renderedTiles} camH=${viewer.camera.positionCartographic.height.toFixed(0)}m | L0-TILES[${lz.length}]: ${lzDump}${cullDump}`,
        );
      } catch (e) {
        console.warn('[CTX-TERRAIN-GAP] sample failed:', e);
      }
    };
    sample('t+0 ');
    setTimeout(() => sample('t+3s'), 3000);
    setTimeout(() => sample('t+8s'), 8000);
  }

  /**
   * §SITEFRAME-GROUND-RESEAT (L-632) → §CTX-BUILDINGS-RENDER-FIRST (L-635) — PULLED.
   *
   * WHAT THIS USED TO DO: subscribe to Cesium's `tileLoadProgressEvent` and, when the terrain tile
   * queue drained to 0, re-run `loadContextBuildings(force)` ONCE so every footprint re-sampled its
   * now-tessellated per-point ground. The intent was correct (better per-point seating); the
   * MECHANISM was structurally unsafe and destabilised Madrid — the founder's URGENT regression
   * ("context buildings NOT rendering, all white/empty, slower with each terrain change"):
   *
   *   1. IT RE-FETCHES. `reseatContextForSettledTerrain` called `loadContextBuildings(force)`, which
   *      `clearContextBuildings()` FIRST and then re-places from a fresh fetch. Any abort (a pan, a
   *      later re-clamp), empty read, or slow Madrid PMTiles/Overpass read between the clear and the
   *      re-place leaves the scene BLANK — buildings that were on screen vanish. Clearing visible
   *      geometry on the promise of a re-fetch is the wrong shape for a "progressive enhancement".
   *   2. IT RACES THE OTHER LOADS. Madrid's terrain re-clamp ALSO calls `loadContextBuildings(force)`
   *      (clampTerrainThenReplace), and each `loadContextBuildings` aborts the previous in-flight
   *      fetch. attach→clamp→load + drain→reseat→load stacked up as repeated multi-second fetches
   *      that cancel each other — exactly "slower, and worse with each terrain change".
   *   3. THE DRAIN SIGNAL IS UNRELIABLE ON HIGH RELIEF. Madrid terrain streams continuously as the
   *      camera flies in, so "queue hits 0 after being pending" fires late, never, or repeatedly.
   *
   * WHY PULLING IT IS SUFFICIENT (not just safe): the terrain re-clamp path already re-places context
   * AFTER `formaTerrainBaseHeight` is set to the settled city ground (`clampTerrainThenReplace` →
   * `loadContextBuildings(force)` at the §MAP-DATA-OVERTURE re-seat). So context ends up seated at the
   * settled ground (~650 m Madrid) — VISIBLE, never depth-culled — WITHOUT this listener. What we lose
   * is only per-FOOTPRINT relief refinement (all near footprints share the settled centroid base),
   * which is the mandate's accepted trade: *slightly-imperfect seating over vanished buildings*.
   *
   * The right future enhancement (NOT this hotfix) is an IN-PLACE re-seat that rebuilds the existing
   * `contextBuildingPlacements` entities' heights from their CACHED features once terrain settles —
   * no network, no clear, no race — behind a hard timeout. Until that exists, this stays pulled.
   *
   * Signature + call site kept so re-enabling is a one-method change; `lat,lon` logged so the pulled
   * decision is visible in the founder's console at the exact site it would have armed for.
   */
  private armContextTerrainReseat(lat: number, lon: number): void {
    if (!this.groundReliefAttached()) return; // flat/keyless path already seats exactly — nothing to note.
    console.log(
      `[CTX-DIAG] terrain re-seat: DISABLED (pulled, L-635) at LAT ${lat.toFixed(5)} LON ${lon.toFixed(5)} — ` +
        `context stays at the settled-ground base (${this.formaTerrainBaseHeight.toFixed(1)} m), visible; ` +
        `the tileLoadProgress re-fetch that blanked/raced Madrid is removed.`,
    );
  }

  /**
   * §DECOUPLE-ENVELOPE-FROM-CONTEXT (L-402c fix) — GUARDED wrapper around the pure
   * `partitionFootprintsByParcel` plot-clear filter. The filter is pure + unit-tested and
   * never throws today, but the plot-clear is a NICE-TO-HAVE — it must NEVER be able to
   * strip (or, via an unexpected throw, blank) the context. On ANY failure fall back to
   * keeping EVERY footprint (context intact, plot simply not cleared). Never throws.
   */
  private plotClearSplit(
    features: readonly ContextBuildingFeature[],
    parcel: Array<[number, number]> | null,
  ): { kept: ContextBuildingFeature[]; removed: ContextBuildingFeature[] } {
    try {
      return partitionFootprintsByParcel(features, parcel);
    } catch (e) {
      console.warn('[CesiumViewport][forma] plot-clear filter threw — context kept unfiltered:', e);
      return { kept: [...features], removed: [] };
    }
  }

  /**
   * §PLOT-CLEAR-ENVELOPE (L-418) — RE-APPLY the plot-clear to the ALREADY-PLACED context
   * building entities on a parcel commit, WITHOUT a context re-fetch.
   *
   * WHY: the placement-time filter (loadContextBuildings → plotClearSplit) only runs when
   * context is (re)placed. In the "select a parcel from already-loaded 3D context" flow —
   * or when the context loaded BEFORE the parcel was committed — the ORDER is: context
   * placed FIRST (`committedParcelLonLat` still null → 0 removed), THEN the parcel committed
   * in renderFormaMassing. Nothing re-filtered the existing entities, so the opaque on-plot
   * context building stayed and OCCLUDED the translucent #6600FF buildable-envelope prism
   * (founder: "the building from context data should disappear so I can see the purple
   * envelope"). loadContextBuildings also EARLY-RETURNS when the site hasn't moved, so a
   * re-fetch is neither triggered nor wanted here — we simply toggle entity visibility.
   *
   * This RE-RUNS the pure, unit-tested `partitionFootprintsByParcel` (via the guarded
   * `plotClearSplit`) over the placed features and hides the on-plot ones — and RESTORES any
   * previously-hidden entity when the parcel changed or was cleared (`committedParcelLonLat`
   * null → nothing on-plot → everything shown). `entity.show` toggling is cheap (no geometry
   * rebuild). It is a nice-to-have context filter: FULLY GUARDED, it must NEVER throw into
   * the render pass (mirrors the placement-time invariant). Never throws.
   */
  private reapplyPlotClearToContext(): void {
    try {
      if (this.contextBuildingPlacements.length === 0) return; // no context on screen yet.
      const parcel = this.committedParcelLonLat;
      // Reference-identity set of on-plot features (the SAME objects plotClearSplit returns),
      // so duplicate osmIds from multipolygon relations are still classified per-entity.
      const onPlot = new Set<ContextBuildingFeature>(
        parcel
          ? this.plotClearSplit(this.contextBuildingPlacements.map((p) => p.feature), parcel).removed
          : [], // no parcel committed → nothing on-plot → restore every entity below.
      );
      let toggled = 0;
      for (const { entity, feature } of this.contextBuildingPlacements) {
        const wantShow = !onPlot.has(feature);
        if (entity.show !== wantShow) { entity.show = wantShow; toggled++; }
      }
      if (toggled > 0) {
        console.log(
          `[CesiumViewport][forma] §PLOT-CLEAR-ENVELOPE (L-418) re-filter on parcel commit — ` +
            `${onPlot.size} on-plot context building(s) hidden so the buildable envelope reads ` +
            `on a clear plot (${toggled} entity show-state change(s), no re-fetch).`,
        );
        this.viewer?.scene.requestRender();
      }
    } catch (e) {
      // NICE-TO-HAVE — must never blank/strip the context. On any failure leave it as-is.
      console.warn('[CesiumViewport][forma] §PLOT-CLEAR-ENVELOPE re-filter threw — context left as-is:', e);
    }
  }

  /**
   * §PLOT-CLEAR-PHOTOREAL (L-429) — cut a PARCEL-SHAPED VOID in the Google Photorealistic
   * 3D-Tiles mesh so the user's proposed design is VISIBLE instead of buried inside the
   * existing building.
   *
   * WHY THIS IS DIFFERENT FROM §PLOT-CLEAR-ENVELOPE (L-418): the OSM/Forma context is a set
   * of per-building ENTITIES, so the on-plot one can simply be hidden. Google photoreal tiles
   * are ONE immutable textured mesh — the existing building CANNOT be removed from it
   * (founder: "in cesium 3d tiles the building is still present, you cannot see it"). Cesium's
   * native answer is a CLIPPING POLYGON on the tileset: geometry INSIDE the polygon is clipped
   * away, leaving a void exactly on the committed parcel, with real photoreal context intact
   * all around it — which is precisely the Archistar-style "your design in its real street".
   *
   * Reuses the SAME `committedParcelLonLat` ring the plot-clear already projects once per
   * render (one geometry source). No parcel ⇒ the clip is REMOVED (full photoreal restored).
   * Fully guarded: a clipping failure must NEVER break the globe — on any error we drop the
   * clip and keep the tileset intact.
   */
  private applyParcelClipToPhotorealTiles(): void {
    // §L-448 — OPT-IN. Guarded HERE, at the single chokepoint, rather than at the call sites:
    // there are three (two tileset-load-after-commit paths + the massing render), and gating
    // one would silently leave the other two applying the clip — the same class of half-applied
    // migration that caused L-446.
    //
    // Set `globalThis.__pryzmPlotClearPhotoreal = true` to re-enable.
    // §L-452 — DEFAULT RESTORED TO ON. L-448 turned this OFF because clipping smears and
    // shatters the surrounding photoreal mesh. That corruption is real — but turning it off
    // was a BAD TRADE and I got the priority wrong: the void is not merely an occlusion
    // nicety, it is the DEPTH-CLEARING MECHANISM. Without it the proposed building renders
    // BURIED UNDER the tile mesh and cannot be seen at all, which blocks the founder harder
    // than the corruption did — they could at least evaluate position through a corrupted hole,
    // but nothing can be evaluated through an opaque one.
    //
    // So: corrupted-but-visible beats clean-but-invisible, until the correct fix lands.
    // THE CORRECT FIX (L-452, not this line): stop clipping the tileset at all and instead
    // render the proposal so it is not depth-occluded by it — Cesium's newer
    // `Cesium3DTileset.clippingPolygons` cuts a true polygonal void rather than the
    // plane-volume approximation that produces the smear, and is the first thing to try.
    // Set `globalThis.__pryzmPlotClearPhotoreal = false` to opt OUT and see clean context.
    if ((globalThis as Record<string, unknown>).__pryzmPlotClearPhotoreal === false) return;

    try {
      const tileset = this.photorealTileset;
      if (!tileset) return; // keyless / flat-ground study — nothing to clip.
      const parcel = this.committedParcelLonLat;

      // No committed parcel → restore the untouched photoreal mesh.
      if (!parcel || parcel.length < 3) {
        if (tileset.clippingPolygons) {
          tileset.clippingPolygons = undefined as unknown as Cesium.ClippingPolygonCollection;
          console.log('[CesiumViewport][globe] §PLOT-CLEAR-PHOTOREAL — no parcel; photoreal tiles restored (clip removed).');
          this.viewer?.scene.requestRender();
        }
        return;
      }

      // Feature-detect: ClippingPolygon landed in Cesium 1.111 (we ship 1.140). If a host
      // bundles an older Cesium, degrade silently to the un-clipped tileset.
      const CP = (Cesium as unknown as { ClippingPolygon?: unknown; ClippingPolygonCollection?: unknown });
      if (typeof CP.ClippingPolygon !== 'function' || typeof CP.ClippingPolygonCollection !== 'function') {
        console.warn('[CesiumViewport][globe] §PLOT-CLEAR-PHOTOREAL — ClippingPolygon unavailable in this Cesium build; photoreal tiles left un-clipped.');
        return;
      }

      // Ring → flat [lon,lat,…] degrees (Cartesian3 positions on the ellipsoid).
      const degrees: number[] = [];
      for (const [lon, lat] of parcel) {
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        degrees.push(lon, lat);
      }
      if (degrees.length < 6) return; // < 3 usable vertices — leave the tileset alone.

      const positions = Cesium.Cartesian3.fromDegreesArray(degrees);
      const polygon = new Cesium.ClippingPolygon({ positions });
      // `inverse: false` (default) clips geometry INSIDE the polygon — i.e. removes the tile
      // mesh over the plot, leaving the void. (`inverse: true` would keep ONLY the plot.)
      tileset.clippingPolygons = new Cesium.ClippingPolygonCollection({ polygons: [polygon], inverse: false });

      console.log(
        `[CesiumViewport][globe] §PLOT-CLEAR-PHOTOREAL — parcel-shaped void clipped into the photoreal ` +
          `tileset (${degrees.length / 2}-vertex ring); the proposed design now reads inside real context.`,
      );
      this.viewer?.scene.requestRender();
    } catch (e) {
      // NICE-TO-HAVE — must NEVER break the globe. Drop the clip, keep the tiles.
      console.warn('[CesiumViewport][globe] §PLOT-CLEAR-PHOTOREAL clip failed — photoreal tiles left un-clipped:', e);
      try {
        if (this.photorealTileset?.clippingPolygons) {
          this.photorealTileset.clippingPolygons = undefined as unknown as Cesium.ClippingPolygonCollection;
        }
      } catch { /* give up silently — the tileset stays as-is */ }
    }
  }

  /**
   * §FEAT-FORMA-CONTEXT-EXTENT-LOD (L-187, founder-approved) / §PERF-CTX-SINGLE-FETCH (L-368) —
   * draw the wider FAR ring of context footprints as FLAT low-poly blocks with SHADOWS OFF.
   * This is the distance-based LOD tier: the near ring (loadContextBuildings) stays extruded +
   * shadow-casting; the far annulus is nearest-N capped and rendered cheaply so the shadow +
   * geometry budget stays bounded (A.24 / device-loss). RENDER-ONLY: the `far` collection was
   * already split from the SAME single far-extent fetch in loadContextBuildings — there is NO
   * separate network round-trip here any more. Additive to the near set (shares
   * `contextBuildingEntities`, so clearContextBuildings drops both). Never throws.
   */
  private renderContextBuildingsFarRing(
    far: ContextBuildingCollection, lat: number, lon: number, viewer: Cesium.Viewer,
    /**
     * §FEAT-FORMA-CONTEXT-NEAR-CAP (L-454) — `heightClampM: null` disables the 24 m low-poly
     * clamp. Used for the DEMOTED near-ring tier: those footprints are inside the near bbox
     * (the site's own immediate neighbourhood), so squashing a real tower to 24 m would be a
     * visible geometry lie. They take the cheap SHADING (shadows/outline off) at TRUE height.
     * `label` only distinguishes the two passes in the diagnostic log.
     */
    opts: { readonly heightClampM?: number | null; readonly label?: string } = {},
  ): void {
    const heightClampM = opts.heightClampM === undefined ? 24 : opts.heightClampM;
    const label = opts.label ?? 'far ring';
    if (!this.viewer || this.viewer !== viewer) return;
    // A newer near/far load or a dispose superseded us, or the site moved.
    if (!this.contextBuildingsAt
      || Math.abs(this.contextBuildingsAt.lat - lat) > 1e-9
      || Math.abs(this.contextBuildingsAt.lon - lon) > 1e-9) return;
    if (far.features.length === 0) return;

    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(Cesium.Cartesian3.fromDegrees(lon, lat, 0));
    const invEnu = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
    // §SITEFRAME-GROUND (T1) — each far footprint is re-seated on its OWN sampled ground in the
    // loop (per-point relief), falling back to the centroid base where no relief is loaded, so
    // the wider ring tracks the terrain instead of z-fighting one flat centroid plane.
    // A hair MORE transparent + no outline than the near ring so the distant massing reads
    // as clearly secondary (aerial-perspective) and stays cheap.
    const fill = Cesium.Color.fromCssColorString(FORMA_PALETTE.contextFill).withAlpha(0.82);

    // §CTX-BUILDINGS-RENDER-FIRST (L-635) — same safe base as the near ring: an un-tessellated far
    // footprint under attached relief must fall back to the settled ground, never a culling ~0.
    const contextSafeBase = this.resolveContextSafeBase(lat, lon);
    let placed = 0;
    for (const f of far.features) {
      try {
        const ring = f.geometry.coordinates[0];
        if (!ring || ring.length < 4) continue;
        // §SITEFRAME-GROUND (T1) — seat this far footprint on the ground under itself.
        const fCentroid = ringCentroidLatLon(ring);
        const fGround = fCentroid ? this.sampleGround(fCentroid.lat, fCentroid.lon, contextSafeBase) : contextSafeBase;
        const fBase = fGround - FORMA_BASE_SINK_M;
        const fTop = fGround;
        const positions = ring.map(([flon, flat]) => {
          const fc = Cesium.Cartesian3.fromDegrees(flon!, flat!, 0);
          const localOffset = Cesium.Matrix4.multiplyByPoint(invEnu, fc, new Cesium.Cartesian3());
          return Cesium.Matrix4.multiplyByPoint(
            enu, new Cesium.Cartesian3(localOffset.x, localOffset.y, fBase), new Cesium.Cartesian3(),
          );
        });
        // §FEAT-FORMA-CONTEXT-EXTENT-LOD — LOW-POLY: cap the far height so distant blocks read
        // as simple massing (never a stray far skyscraper dominating), and SHADOWS OFF — the
        // shadow pass is the perf driver the founder flagged, so the far ring never casts.
        // §CTX-MISSING-HEIGHT-FALLBACK (L-636) — same as the near ring: a 0-height far footprint became a
        // 0.1 m flat sliver → white wireframe z-fighting the terrain. Fall back to the 9 m assumed height so
        // it extrudes into a legible low-poly block instead of a flat outline.
        const rawFarHeightM = f.properties.heightM;
        const trueH = (Number.isFinite(rawFarHeightM) && rawFarHeightM >= 2) ? rawFarHeightM : 9;
        const h = heightClampM === null ? trueH : Math.min(heightClampM, trueH);
        const ent = viewer.entities.add({
          name: 'pryzm-forma-context-building-far',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: fBase,
            extrudedHeight: fTop + h,
            material: fill,
            outline: false,
            shadows: Cesium.ShadowMode.DISABLED,   // far ring never casts/receives (budget)
            perPositionHeight: false,
            closeBottom: false,
          },
        });
        this.contextBuildingEntities.push(ent);
        // §PLOT-CLEAR-ENVELOPE (L-418) — pair the far-ring entity with its footprint too, so
        // the re-filter also hides a far block sitting on a large committed plot (parity with
        // the near ring, which the placement-time filter already covers for both).
        this.contextBuildingPlacements.push({ entity: ent, feature: f });
        // §CTX-QUERY-PANEL (L-592) — far-ring buildings are queryable too (parity with near).
        this.contextFeatureByEntity.set(ent, f);
        placed++;
      } catch { /* skip a malformed far footprint */ }
    }
    viewer.scene.requestRender();
    console.log(
      `[CesiumViewport][forma] §FEAT-FORMA-CONTEXT-EXTENT-LOD ${label} rendered: ${placed} ` +
        `shadowless footprint(s) (nearest-first, capped; height ` +
        `${heightClampM === null ? 'TRUE (unclamped)' : `clamped ${heightClampM} m`}).`,
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
   *   • only once the camera ground point has moved >~1100 m from the last load
   *     centre (roughly a third of the widened §A.21.D43(b) fetch bbox);
   *   • debounced 600 ms so a flurry of moves coalesces into ONE fetch.
   * loadContextBuildings() itself aborts any in-flight fetch and clears the old
   * entities, so repeated pans never leak or stack footprints.
   */
  private maybeRefreshContextOnPan(camLat: number, camLon: number, camHeight: number): void {
    // §CTX-PAN-DEBOUNCE (L-402c) — during SITE AUTHORING the camera is framed on the
    // committed plot; small pans to look around the envelope must NOT thrash the Overpass
    // fetch (founder: "context reloads on every pan, ~3 s each"). The gate is a PURE decision
    // (`shouldRefetchContextOnPan`, unit-tested) that: (1) anchors the "left the loaded area?"
    // test on the FIXED site origin (`formaMassingOrigin`) when a massing is active — so
    // panning around the framed plot never accumulates into a refetch; (2) requires leaving
    // the whole FAR-ring coverage (~1.5 km); (3) enforces a hard cooldown. This governs ONLY
    // the REPEAT refetch — the INITIAL load is a direct `loadContextBuildings` call in
    // renderFormaMassing and is NEVER gated here, so the first frame always loads promptly.
    const anchor = this.formaMassingOrigin ?? this.contextBuildingsAt;
    const should = shouldRefetchContextOnPan({
      camLat, camLon, camHeightM: camHeight,
      anchor: anchor ? { lat: anchor.lat, lon: anchor.lon } : null,
      hasContextLayer: !!this.contextBuildingsAt || this.contextBuildingEntities.length > 0,
      nowMs: Date.now(),
      lastLoadAtMs: this.contextLastLoadAtMs,
    });
    if (!should) return;

    if (this.contextPanRefreshTimer !== null) clearTimeout(this.contextPanRefreshTimer);
    this.contextPanRefreshTimer = setTimeout(() => {
      this.contextPanRefreshTimer = null;
      if (!this.viewer) return;
      console.log(
        `[CesiumViewport][forma] §A.21.D-GLOBE pan-refresh — reloading context buildings ` +
          `around LAT ${camLat.toFixed(5)} LON ${camLon.toFixed(5)} (camera left the loaded area).`,
      );
      void this.loadContextBuildings(camLat, camLon, true);
    }, 1200);
  }

  /** MAP-DATA-OVERTURE — remove all context-building entities (idempotent). */
  public clearContextBuildings(): void {
    // §PERF-CTX-SINGLE-FETCH (L-368) — the far ring no longer has its own fetch/abort (it is
    // split from the single near+far fetch cancelled via `contextBuildingsAbort`), so there is
    // nothing extra to abort here.
    const viewer = this.viewer;
    if (viewer) {
      for (const ent of this.contextBuildingEntities) {
        try { viewer.entities.remove(ent); } catch { /* already gone */ }
      }
    }
    this.contextBuildingEntities = [];
    // §PLOT-CLEAR-ENVELOPE (L-418) — the entity refs are gone, so drop their footprint
    // pairings too (they are repopulated on the next placement).
    this.contextBuildingPlacements = [];
    // §CTX-QUERY-PANEL (L-592) — the pick lookup and any open panel/highlight refer to entities
    // that no longer exist; drop them together or a stale panel would describe a removed building.
    this.contextFeatureByEntity.clear();
    this.closeContextBuildingQuery();
    // §CTX-USE-COLOUR (L-599) — the backup map keys are those same dead entities. Drop them (the
    // MODE flag is deliberately kept, so the next load re-colours) and clear the stale legend.
    this.contextUseMaterialBackup.clear();
    if (this.contextUseLegendEl) { this.contextUseLegendEl.remove(); this.contextUseLegendEl = null; }
  }

  /**
   * FORMA-CTX §22.2 — load OSM road centre-lines (keyless Overpass — contextRoads.ts)
   * and draw them as thin grey polylines on the Forma flat-ground study, mirroring
   * loadContextBuildings' ENU bridge. Visual-only: NO layout/model impact. Pedestrian
   * ways are fetched but not yet drawn (slice 2). Never throws.
   */
  public async loadContextRoads(lat: number, lon: number, force = false): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
    if (!force && this.contextRoadEntities.length > 0 && this.contextBuildingsAt &&
        Math.abs(this.contextBuildingsAt.lat - lat) < 1e-6 &&
        Math.abs(this.contextBuildingsAt.lon - lon) < 1e-6) return;

    this.contextRoadsAbort?.abort();
    this.contextRoadsAbort = new AbortController();
    const signal = this.contextRoadsAbort.signal;

    let collection: ContextRoadCollection;
    try { collection = await fetchContextRoads(lat, lon, signal); }
    catch { return; }
    if (signal.aborted || !this.viewer || this.viewer !== viewer) return;

    this.clearContextRoads();
    if (collection.ways.length === 0) return;

    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(lon, lat, 0),
    );
    const invEnu = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
    // §FORMA-CTX-ROAD-RIBBON (founder 2026-07-01, ADR-0095) — BUG 3 ROOT CAUSE + FIX.
    // ROOT CAUSE: roads were drawn as raw floating POLYLINES at a fixed height above the
    // ground (`arcType: NONE`, `clampToGround: false`), so on the flat Forma ground they
    // hung in mid-air and — because the context BUILDINGS extrude upward from the same
    // ground — the white lines draped straight THROUGH the buildings ("really bad" per the
    // founder's screenshots).
    // FIX: render each road as a FLAT GROUND RIBBON (a `corridor` polygon of metric width,
    // width-scaled by the OSM highway class) seated at the ground plane just below the
    // buildings' visible base, so the streets lie flat on the surface UNDER the buildings —
    // matching the 2D basemap's street grid — instead of slicing through them. The corridor
    // is a ground-hugging polygon (no `extrudedHeight`), so it can never rise into a building.
    const base = this.formaTerrainBaseHeight + 0.02; // hair above the ground plane; below buildings
    const roadColor = Cesium.Color.fromCssColorString(FORMA_PALETTE.road).withAlpha(0.9);

    // §FORMA-CTX-ROAD-RIBBON — metric ribbon width by OSM highway class (a real street
    // map reads major roads wider than side streets). Conservative widths so the grid
    // stays clean, never a slab.
    const roadWidthM = (highway: string): number => {
      switch (highway) {
        case 'motorway': case 'motorway_link': case 'trunk': case 'trunk_link': return 14;
        case 'primary': case 'primary_link': return 11;
        case 'secondary': case 'secondary_link': return 9;
        case 'tertiary': case 'tertiary_link': return 7;
        case 'residential': case 'unclassified': case 'living_street': return 6;
        case 'service': return 4;
        default: return 6;
      }
    };

    let placed = 0;
    for (const way of collection.ways) {
      if (way.kind !== 'road') continue; // slice 1 = roads only
      try {
        const positions = way.coords.map(([flon, flat]) => {
          const fc = Cesium.Cartesian3.fromDegrees(flon, flat, 0);
          const off = Cesium.Matrix4.multiplyByPoint(invEnu, fc, new Cesium.Cartesian3());
          return this.enuToCartesian(enu, off.x, off.y, base);
        });
        if (positions.length < 2) continue;
        const ent = viewer.entities.add({
          name: 'pryzm-forma-context-road',
          corridor: {
            positions,
            width: roadWidthM(way.highway),
            // §CTX-ABS-SEAT (L-635) — seat at the ABSOLUTE settled ground height, NOT CLAMP_TO_GROUND.
            // Forma sets globe.depthTestAgainstTerrain=false, so the GroundPrimitive classification pass
            // clampToGround relies on has no terrain stencil to paint into → clamped features render
            // NOTHING on baked terrain (Madrid/Amsterdam). An absolute height draws in the standard opaque
            // pass, depth-flag-independent, so it renders on any provider. `base` = the settled city ground.
            height: base,
            cornerType: Cesium.CornerType.ROUNDED,
            material: roadColor,
            outline: false,
          },
        });
        this.contextRoadEntities.push(ent);
        placed++;
      } catch { /* skip one malformed way */ }
    }
    viewer.scene.requestRender();
    console.log(`[CesiumViewport][forma] §FORMA-CTX-ROAD-RIBBON flat ground road ribbon(s) rendered: ${placed} way(s) (was floating centre-lines).`);
  }

  /** FORMA-CTX §22.2 — remove all road polylines (idempotent). */
  public clearContextRoads(): void {
    const viewer = this.viewer;
    if (viewer) for (const ent of this.contextRoadEntities) {
      try { viewer.entities.remove(ent); } catch { /* gone */ }
    }
    this.contextRoadEntities = [];
  }

  /**
   * FORMA-CTX-WATER (founder 2026-06-19) — fetch OSM water bodies + waterways
   * for the site and draw them as flat blue polygons / polylines on the Forma
   * flat-ground study, mirroring loadContextRoads' ENU bridge. Visual-only: NO
   * layout/model impact. Never throws (fetch degrades to a quiet no-op).
   */
  public async loadContextWater(lat: number, lon: number, force = false): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
    if (!force && this.contextWaterEntities.length > 0 && this.contextBuildingsAt &&
        Math.abs(this.contextBuildingsAt.lat - lat) < 1e-6 &&
        Math.abs(this.contextBuildingsAt.lon - lon) < 1e-6) return;

    this.contextWaterAbort?.abort();
    this.contextWaterAbort = new AbortController();
    const signal = this.contextWaterAbort.signal;

    let collection: ContextWaterCollection;
    try { collection = await fetchContextWater(lat, lon, signal); }
    catch { return; }
    if (signal.aborted || !this.viewer || this.viewer !== viewer) return;

    this.clearContextWater();
    if (collection.areas.length === 0 && collection.ways.length === 0 && collection.sea.length === 0) return;

    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(lon, lat, 0),
    );
    const invEnu = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
    // Sit water just BELOW the road hair-line but still above the ground plane so
    // roads draw over it and it never z-fights the flat ground.
    const base = this.formaTerrainBaseHeight + 0.03;
    const waterFill = Cesium.Color.fromCssColorString(FORMA_PALETTE.water).withAlpha(0.85);
    const waterLine = Cesium.Color.fromCssColorString(FORMA_PALETTE.water).withAlpha(0.95);

    let placed = 0;
    // §FEAT-FORMA-SEA-CONTEXT (L-185) — open ocean/bay from the coastline sea-mask. These
    // are large bbox-scale surfaces, so draw them FIRST + a hair BELOW the lakes/rivers so
    // the smaller water bodies + road ribbons read cleanly on top and never z-fight. A
    // slightly deeper blue so the sea reads as water, not the neutral Forma ground.
    const seaBase = this.formaTerrainBaseHeight + 0.02;
    const seaFill = Cesium.Color.fromCssColorString(FORMA_PALETTE.water).withAlpha(0.9);
    for (const area of collection.sea) {
      try {
        const positions = area.ring.map(([flon, flat]) => {
          const fc = Cesium.Cartesian3.fromDegrees(flon, flat, 0);
          const off = Cesium.Matrix4.multiplyByPoint(invEnu, fc, new Cesium.Cartesian3());
          return this.enuToCartesian(enu, off.x, off.y, seaBase);
        });
        if (positions.length < 4) continue;
        const ent = viewer.entities.add({
          name: 'pryzm-forma-context-sea',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: seaBase,
            material: seaFill,
            outline: false,
          },
        });
        this.contextWaterEntities.push(ent);
        placed++;
      } catch { /* skip one malformed sea ring */ }
    }
    // Filled lake/pond/reservoir polygons.
    for (const area of collection.areas) {
      try {
        const positions = area.ring.map(([flon, flat]) => {
          const fc = Cesium.Cartesian3.fromDegrees(flon, flat, 0);
          const off = Cesium.Matrix4.multiplyByPoint(invEnu, fc, new Cesium.Cartesian3());
          return this.enuToCartesian(enu, off.x, off.y, base);
        });
        if (positions.length < 4) continue;
        const ent = viewer.entities.add({
          name: 'pryzm-forma-context-water',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: base, // §CTX-ABS-SEAT (L-635) — absolute settled ground, NOT clampToGround (renders nothing on baked terrain: depthTestAgainstTerrain=false).
            material: waterFill,
            outline: false,
          },
        });
        this.contextWaterEntities.push(ent);
        placed++;
      } catch { /* skip one malformed area */ }
    }
    // River/stream/canal centre-lines.
    for (const way of collection.ways) {
      try {
        const positions = way.coords.map(([flon, flat]) => {
          const fc = Cesium.Cartesian3.fromDegrees(flon, flat, 0);
          const off = Cesium.Matrix4.multiplyByPoint(invEnu, fc, new Cesium.Cartesian3());
          return this.enuToCartesian(enu, off.x, off.y, base);
        });
        if (positions.length < 2) continue;
        const ent = viewer.entities.add({
          name: 'pryzm-forma-context-waterway',
          polyline: {
            positions,
            width: 3,
            clampToGround: false, // §CTX-ABS-SEAT (L-635) — clampToGround renders nothing on baked terrain (depthTestAgainstTerrain=false); the positions already carry the absolute base height.
            arcType: Cesium.ArcType.NONE,
            material: waterLine,
            depthFailMaterial: new Cesium.ColorMaterialProperty(waterLine),
          },
        });
        this.contextWaterEntities.push(ent);
        placed++;
      } catch { /* skip one malformed waterway */ }
    }
    viewer.scene.requestRender();
    console.log(`[CesiumViewport][forma] FORMA-CTX-WATER rendered: ${placed} water feature(s) (incl. ${collection.sea.length} §FEAT-FORMA-SEA-CONTEXT sea surface(s)).`);
  }

  /** FORMA-CTX-WATER — remove all water polygons/polylines (idempotent). */
  public clearContextWater(): void {
    const viewer = this.viewer;
    if (viewer) for (const ent of this.contextWaterEntities) {
      try { viewer.entities.remove(ent); } catch { /* gone */ }
    }
    this.contextWaterEntities = [];
  }

  /**
   * §FORMA-CTX-PARKS (founder 2026-07-01, ADR-0095) — BUG 4. Fetch OSM parks / green
   * space (leisure=park, landuse=grass|forest|…, natural=wood|grassland) for the site
   * and draw them as flat GROUND-CLAMPED green polygons on the Forma flat-ground study,
   * mirroring loadContextWater's ENU bridge, so the 3D-Site view matches the 2D basemap
   * the boundary was drawn on (green parks + blue water + street grid = the same
   * recognisable neighbourhood). Parks sit at the BOTTOM of the ground stack (below the
   * water + road ribbons + buildings) so nothing is occluded. Visual-only: NO layout /
   * model impact. Never throws (fetch degrades to a quiet no-op).
   */
  public async loadContextParks(lat: number, lon: number, force = false): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
    if (!force && this.contextParkEntities.length > 0 && this.contextBuildingsAt &&
        Math.abs(this.contextBuildingsAt.lat - lat) < 1e-6 &&
        Math.abs(this.contextBuildingsAt.lon - lon) < 1e-6) return;

    this.contextParkAbort?.abort();
    this.contextParkAbort = new AbortController();
    const signal = this.contextParkAbort.signal;

    let collection: ContextParkCollection;
    try { collection = await fetchContextParks(lat, lon, signal); }
    catch { return; }
    if (signal.aborted || !this.viewer || this.viewer !== viewer) return;

    this.clearContextParks();
    if (collection.areas.length === 0) return;

    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(lon, lat, 0),
    );
    const invEnu = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
    // Parks sit at the very bottom of the ground stack — just ABOVE the flat ground
    // plane but BELOW water (base + 0.03) + roads (base + 0.02) so the street grid +
    // water read on top of the green, and the buildings extrude up from the same ground.
    const base = this.formaTerrainBaseHeight + 0.01;
    const parkFill = Cesium.Color.fromCssColorString(FORMA_PALETTE.park).withAlpha(0.85);
    const parkEdge = Cesium.Color.fromCssColorString(FORMA_PALETTE.parkEdge).withAlpha(0.6);

    let placed = 0;
    for (const area of collection.areas) {
      try {
        const positions = area.ring.map(([flon, flat]) => {
          const fc = Cesium.Cartesian3.fromDegrees(flon, flat, 0);
          const off = Cesium.Matrix4.multiplyByPoint(invEnu, fc, new Cesium.Cartesian3());
          return this.enuToCartesian(enu, off.x, off.y, base);
        });
        if (positions.length < 4) continue;
        const ent = viewer.entities.add({
          name: 'pryzm-forma-context-park',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: base, // §CTX-ABS-SEAT (L-635) — absolute settled ground, NOT clampToGround (renders nothing on baked terrain: depthTestAgainstTerrain=false).
            material: parkFill,
            outline: true,
            outlineColor: parkEdge,
            outlineWidth: 1,
          },
        });
        this.contextParkEntities.push(ent);
        placed++;
      } catch { /* skip one malformed park */ }
    }
    viewer.scene.requestRender();
    console.log(`[CesiumViewport][forma] §FORMA-CTX-PARKS rendered: ${placed} green area(s).`);
  }

  /** §FORMA-CTX-PARKS — remove all park polygons (idempotent). */
  public clearContextParks(): void {
    const viewer = this.viewer;
    if (viewer) for (const ent of this.contextParkEntities) {
      try { viewer.entities.remove(ent); } catch { /* gone */ }
    }
    this.contextParkEntities = [];
  }

  /**
   * §FORMA-CTX-LANDUSE (founder 2026-07-29) — colour the TERRAIN by land use. Fetch OSM land-use polygons
   * for the site and drape them as flat ground-clamped fills: URBAN (residential/commercial/industrial…)
   * in grey, RURAL (farmland/meadow/orchard/vineyard…) in brown — the founder's "grey urban / brown
   * rural". Green (parks) + blue (water) come from their own layers. These sit at the VERY BOTTOM of the
   * ground stack (base + 0.005, below parks at +0.01) so parks + water + road ribbons + buildings all read
   * on top. Mirrors loadContextParks' ENU bridge exactly. Visual-only; never throws.
   */
  public async loadContextLanduse(lat: number, lon: number, force = false): Promise<void> {
    const viewer = this.viewer;
    if (!viewer) return;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return;
    if (!force && this.contextLanduseEntities.length > 0 && this.contextBuildingsAt &&
        Math.abs(this.contextBuildingsAt.lat - lat) < 1e-6 &&
        Math.abs(this.contextBuildingsAt.lon - lon) < 1e-6) return;

    this.contextLanduseAbort?.abort();
    this.contextLanduseAbort = new AbortController();
    const signal = this.contextLanduseAbort.signal;

    let collection: ContextLanduseCollection;
    try { collection = await fetchContextLanduse(lat, lon, signal); }
    catch { return; }
    if (signal.aborted || !this.viewer || this.viewer !== viewer) return;

    this.clearContextLanduse();
    if (collection.areas.length === 0) return;

    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(
      Cesium.Cartesian3.fromDegrees(lon, lat, 0),
    );
    const invEnu = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
    // Bottom of the ground stack — just above the flat ground, below parks (base + 0.01).
    const base = this.formaTerrainBaseHeight + 0.005;
    const urbanFill = Cesium.Color.fromCssColorString(FORMA_PALETTE.urban).withAlpha(0.9);
    const urbanEdge = Cesium.Color.fromCssColorString(FORMA_PALETTE.urbanEdge).withAlpha(0.5);
    const ruralFill = Cesium.Color.fromCssColorString(FORMA_PALETTE.rural).withAlpha(0.9);
    const ruralEdge = Cesium.Color.fromCssColorString(FORMA_PALETTE.ruralEdge).withAlpha(0.5);

    let placed = 0;
    for (const area of collection.areas) {
      try {
        const positions = area.ring.map(([flon, flat]) => {
          const fc = Cesium.Cartesian3.fromDegrees(flon, flat, 0);
          const off = Cesium.Matrix4.multiplyByPoint(invEnu, fc, new Cesium.Cartesian3());
          return this.enuToCartesian(enu, off.x, off.y, base);
        });
        if (positions.length < 4) continue;
        const isUrban = area.kind === 'urban';
        const ent = viewer.entities.add({
          name: 'pryzm-forma-context-landuse',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(positions),
            height: base, // §CTX-ABS-SEAT (L-635) — absolute settled ground, not clampToGround.
            material: isUrban ? urbanFill : ruralFill,
            outline: true,
            outlineColor: isUrban ? urbanEdge : ruralEdge,
            outlineWidth: 1,
          },
        });
        this.contextLanduseEntities.push(ent);
        placed++;
      } catch { /* skip one malformed land-use polygon */ }
    }
    viewer.scene.requestRender();
    const urban = collection.areas.filter((a) => a.kind === 'urban').length;
    console.log(`[CesiumViewport][forma] §FORMA-CTX-LANDUSE rendered: ${placed} area(s) (${urban} urban-grey, ${placed - urban} rural-brown).`);
  }

  /** §FORMA-CTX-LANDUSE — remove all land-use polygons (idempotent). */
  public clearContextLanduse(): void {
    const viewer = this.viewer;
    if (viewer) for (const ent of this.contextLanduseEntities) {
      try { viewer.entities.remove(ent); } catch { /* gone */ }
    }
    this.contextLanduseEntities = [];
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
    // §SITE-METRIC-HEATMAP — the temperature / wind ground grids read the dataset;
    // repaint an active heatmap when fresh climate data lands.
    if (this.siteMetricActive === 'temperature' || this.siteMetricActive === 'wind') {
      this.renderSiteMetricOverlay();
    }
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

  // ── §SITE-METRIC-HEATMAP — Hektar/Forma-style switchable ground heatmap ──────
  //
  // ONE colour-binned ground heatmap at a time (sun hours · temperature · wind ·
  // population), mapped onto the site in the SAME site-ENU frame as the massing +
  // the other overlays. The DATA comes from the pure `buildSiteMetricGrid` bridge
  // (sun-hours via the @pryzm/solar-analysis NOAA sun-samples + a pure analytic
  // shadow-ray test against the massing/context; temperature/wind/population via
  // @pryzm/street-analytics). 'daylight' is BIM-view-only (per-room VSC), so
  // selecting it here clears any ground heatmap.

  /**
   * Show ONE site metric as a colour-binned ground heatmap (or clear with null).
   * Ground-grid metrics draw here: sun hours / daylight VSC / temperature / wind /
   * population. §SITE-METRIC-DAYLIGHT-VSC (2026-06-30) — 'daylight' is now a real
   * side-3D ground grid (per-cell Vertical Sky Component against the massing + OSM
   * context), no longer a BIM-view-only pass.
   * The analysis controls own the metric switch + legend; this just renders.
   */
  public setSiteMetricOverlay(metric: SiteMetric | null): void {
    this.siteMetricActive = metric;
    if (metric) this.renderSiteMetricOverlay();
    else this.clearSiteMetricOverlay();
    // §FORMA-FACADE-ANALYSIS — the façade study follows the active metric: it only
    // paints when sun-hours is active AND the façade toggle is ON. Repaint/clear to
    // stay in sync with a metric switch (e.g. sun-hours → temperature clears it).
    if (this.facadeAnalysisOn) {
      if (metric === 'sunHours') this.renderFacadeAnalysis();
      else {
        this.clearFacadeAnalysis();
        // §FORMA-FACADE-VISIBLE — metric left sun-hours: no façade texture now shows, so
        // bring the normal building materials back (they were suppressed for the study).
        if (this.facadeSuppressingMassing) this.setBuildingMaterialsVisibleForFacade(true);
      }
    }
  }

  /** The active ground-heatmap metric, or null. */
  public getSiteMetricOverlay(): SiteMetric | null {
    return this.siteMetricActive;
  }

  /** Set the sun-hours analysis-day preset (summer/winter/equinox) and repaint if
   *  the sun-hours heatmap is currently shown. */
  public setSiteMetricSunDay(day: 'summer' | 'winter' | 'equinox'): void {
    this.siteMetricSunDay = day;
    if (this.siteMetricActive === 'sunHours') this.renderSiteMetricOverlay();
    // §FORMA-FACADE-ANALYSIS — the façade study uses the SAME analysis day, so repaint
    // it too when it's active (matches the ground heatmap's day preset).
    if (this.facadeAnalysisOn && this.siteMetricActive === 'sunHours') this.renderFacadeAnalysis();
  }

  // ---- §FORMA-FACADE-ANALYSIS (ADR-0093) — sun-hours on the designed building ----

  /**
   * §FORMA-FACADE-ANALYSIS — toggle the on-demand FAÇADE sun analysis (DEFAULT OFF).
   * When ON and the active metric is sun-hours, colour the user's DESIGNED building's
   * outer façade + roof by direct sun-hours (the SAME ramp + shadow test as the ground
   * heatmap), NOT the context buildings. When OFF, analysis paints only on the ground.
   * Clears cleanly on OFF / when the active metric isn't sun-hours.
   */
  public setFacadeAnalysis(on: boolean): void {
    this.facadeAnalysisOn = !!on;
    if (this.facadeAnalysisOn && this.siteMetricActive === 'sunHours') {
      this.renderFacadeAnalysis();
    } else {
      this.clearFacadeAnalysis();
      // §FORMA-FACADE-VISIBLE — analysis OFF (or metric ≠ sun-hours): restore the normal
      // building materials that were suppressed while the tower showed pure sun-hours.
      if (this.facadeSuppressingMassing) this.setBuildingMaterialsVisibleForFacade(true);
    }
  }

  /** §FORMA-FACADE-ANALYSIS — current façade-analysis toggle state. */
  public getFacadeAnalysis(): boolean {
    return this.facadeAnalysisOn;
  }

  /**
   * §FACADE-STUDY-SUBJECT (L-596) — choose WHAT the sun study runs on: the DESIGNED BUILDING
   * (default, unchanged) or the BUILDABLE ENVELOPE (pre-planning: which envelope faces earn
   * glazing before anything is designed).
   *
   * 🔴 THIS IS AN EXPLICIT, LABELLED MODE — AND IT MUST STAY ONE. Read L-272 before touching it:
   * an earlier version silently took `input.boundary` (the PARCEL ring) as the façade source when
   * the building was missing, and PRESENTED the result as the building's façade study. The output
   * was a phantom envelope at the plot line, self-shadowed by the real building inside it, with no
   * authored opening able to project onto any face. The founder's request here is legitimately
   * "analyse the envelope" — so the user CHOOSES it, the code never substitutes it, and the answer
   * is badged as an ENVELOPE study for as long as it is on screen. `resolveFacadeStudySubject`
   * (pure, unit-tested) returns a REFUSAL rather than a substitution in every missing-input case.
   */
  public setFacadeStudySubject(subject: FacadeStudySubject): void {
    if (subject !== 'building' && subject !== 'envelope') return;
    if (this.facadeStudySubject === subject) return;
    this.facadeStudySubject = subject;
    // The subject is part of the study's identity, so a switch must recompute — the
    // §PERF-SUNHOURS-NO-RECOMPUTE key folds it in (see facadeAnalysisKey) and therefore MISSES
    // here rather than serving the other subject's painted result.
    if (this.facadeAnalysisOn && this.siteMetricActive === 'sunHours') this.renderFacadeAnalysis();
    else this.clearFacadeAnalysis();
  }

  /** §FACADE-STUDY-SUBJECT (L-596) — the currently chosen study subject. */
  public getFacadeStudySubject(): FacadeStudySubject {
    return this.facadeStudySubject;
  }

  /**
   * §FACADE-STUDY-SUBJECT (L-596) — the on-screen badge that names the study's SUBJECT.
   *
   * Not decoration: an envelope study and a building façade study answer DIFFERENT QUESTIONS, and
   * a viewer who cannot tell which one is painted will read a legal-envelope result as a building
   * result. The badge is shown for as long as the study is painted, and the refusal path uses the
   * same surface to say WHY nothing was painted (a refusal is a result — L-467/L-469).
   */
  private setFacadeSubjectBadge(text: string | null, tone: 'study' | 'refused' = 'study'): void {
    try {
      if (text === null) {
        if (this.facadeSubjectBadge) { this.facadeSubjectBadge.remove(); this.facadeSubjectBadge = null; }
        return;
      }
      if (!this.facadeSubjectBadge) {
        const el = document.createElement('div');
        el.setAttribute('data-testid', 'pryzm-facade-subject-badge');
        Object.assign(el.style, {
          position: 'absolute', left: '12px', top: '12px', maxWidth: '270px',
          // C06 §7 / §233 — named slot from zLayers, never a hand-picked literal.
          zIndex: zCss('contextualBar'),
          padding: '8px 11px', borderRadius: '8px',
          background: 'rgba(255,255,255,0.96)',
          font: '400 11px/1.4 system-ui, sans-serif',
          boxShadow: '0 1px 8px rgba(0,0,0,0.14)', pointerEvents: 'none',
        } satisfies Partial<CSSStyleDeclaration>);
        this.container.appendChild(el);
        this.facadeSubjectBadge = el;
      }
      this.facadeSubjectBadge.textContent = text;
      this.facadeSubjectBadge.style.color = tone === 'refused' ? '#8a5200' : '#1c1630';
      this.facadeSubjectBadge.style.border =
        tone === 'refused' ? '1px solid #f0d59a' : '1px solid #e3dcfa';
    } catch { /* a badge may never affect the render */ }
  }

  /**
   * §FORMA-FACADE-ANALYSIS — paint the designed building's façade + roof by sun-hours.
   * Reuses the building FOOTPRINT (`formaLastMassingInput.boundary`, scene-XZ → ENU)
   * and storey heights, samples points across each exterior wall face + roof, and runs
   * the SAME direct-beam shadow test the ground grid uses (chunked across frames so the
   * per-point raycast never freezes the viewport). Each point becomes a small coloured
   * quad on the building surface, in the SAME blue→teal→gold→warm sun-hours ramp.
   */
  private renderFacadeAnalysis(): void {
    const viewer = this.viewer;
    const origin = this.overlayOrigin();
    // §PERF-SUNHOURS-NO-RECOMPUTE (L-143) — the façade study is the heaviest raycast pass
    // and (unlike the ground heatmap) was recomputed on EVERY massing re-render /
    // refreshActiveClimateOverlays, including the terrain-settle re-clamps that fire as the
    // camera/tiles stream. Gate it: if the façade inputs (origin · designed-building
    // geometry · occluder set · sun-day) are byte-for-byte the last painted study AND its
    // entities are still on screen, this repaint is a NO-OP — keep the painted gradient +
    // material suppression exactly as they are and skip the whole per-point raycast. A
    // genuine change (re-place / re-locate / new day / new context) changes the key and
    // recomputes. `clearFacadeAnalysis` nulls the key so an explicit clear always rebuilds.
    if (viewer && origin && this.facadeAnalysisOn && this.siteMetricActive === 'sunHours') {
      const key = this.facadeAnalysisKey(origin);
      // §FIX-FACADE-ANALYSIS-ON-REAL-MODEL — a live REAL-model drape counts as "already
      // painted" too (it adds no entities), so an unchanged repaint short-circuits.
      const alreadyPainted = this.facadeAnalysisEntities.length > 0 || this.facadeDrapingRealModel;
      if (key !== null && key === this.facadeAnalysisLastKey && alreadyPainted) {
        return; // unchanged inputs + already painted → no recompute, no re-clear
      }
    }
    this.clearFacadeAnalysis();                       // also cancels in-flight chunks
    // §FORMA-FACADE-VISIBLE — un-suppress the building's own materials up-front: this
    // repaint replaces the old façade texture, and if it BAILS before painting (no
    // viewer / footprint / prep) the building must NOT be left invisible. onDone
    // re-suppresses once the new texture has actually painted. Never leaves a hidden
    // tower with no gradient on it.
    if (this.facadeSuppressingMassing) this.setBuildingMaterialsVisibleForFacade(true);
    if (!viewer || !origin || !this.facadeAnalysisOn) return;
    if (this.siteMetricActive !== 'sunHours') return; // priority metric = sun-hours

    // §FORMA-FACADE-FOOTPRINT-FIX (founder 2026-07-01, ADR-0095) — resolve the DESIGNED
    // building's exterior footprint robustly, most-reliable source first, so the façade
    // study paints in BOTH Real and Massing fidelity modes (formaLastMassingInput persists
    // in both — it's the massing fallback under the real model). The old code used ONLY
    // `input.boundary`, which is null whenever no parcel ring was drawn (the founder's
    // "no building footprint — skipping" log), so sun-on-façade never painted.
    //
    // §FIX-FACADE-ANALYSIS-DRAPE-QUALITY (L-272) — the ORDER was wrong, and on the founder's own
    // flow (location → DRAW THE SITE BOUNDARY → generate) it was catastrophically wrong.
    // `input.boundary` is the drawn **PARCEL** ring (see `renderFormaMassing`: "Parcel boundary
    // ring in scene-XZ metres, or null when not drawn") — it is the SITE, not the building. Taking
    // it first meant the façade study's faces were the PARCEL EDGES: the sun lattice was evaluated
    // on a phantom envelope standing out at the plot line (with the real building sitting INSIDE it
    // as an occluder, self-shadowing the phantom), no authored opening could project onto any face
    // (they are metres away → `facadeOpeningUvRects` returns none), and the shader then draped that
    // phantom study onto the real GLB by nearest-face projection — smearing a study of a plot
    // boundary across a building's walls. The DESIGNED BUILDING's envelope is its WALL LOOP; the
    // parcel is only a last-ditch stand-in when there is no authored geometry at all:
    //   1. the massing wall-loop perimeter reconstructed from the authored walls
    //      (reconstructPerimeterRing — the SAME single-polygon silhouette the shell extrusion
    //      uses, so the study faces ARE the building's real exterior wall lines);
    //   2. else the ground-storey FLOOR-SLAB outer ring (a generated building always authors a
    //      floor plate whose outer ring IS the shell footprint);
    //   3. else the drawn parcel boundary (massing-only preview with no authored walls/slabs —
    //      the plot is then the only silhouette we have, and it is flagged as such below);
    //   4. else a square about the massing centroid (formaMassingOrigin) so an already-placed
    //      building without a traceable loop still gets a study.
    // scene-XZ → the metric Pt convention (x = east, z = north).
    //
    // §L-430 slice 2b — θ IS REQUIRED HERE, and this is the most consequential site in the
    // migration. This study evaluates the AUTHORED façade against occluders that are
    // TRUE-north by origin (`siteMetricFootprints` = OSM context) and against SUN directions
    // that are likewise true-north. If the building ring stayed in the PROJECT frame while
    // its occluders and its sun did not, the study would be computing shadows and sky
    // exposure for a building rotated by θ relative to its own surroundings — producing a
    // fully-populated, plausible-looking, and wrong façade heatmap. Frame-mixing is the
    // failure mode; rotating the ring (and its openings) to true north is what prevents it.
    const input = this.formaLastMassingInput;
    const thetaRad = this.readProjectNorthRad();
    const sceneRingToMetric = (
      r: ReadonlyArray<{ x: number; z: number }>,
    ): { x: number; z: number }[] => r.map((p) => {
      const e = sceneXZToEnu(p.x, p.z, thetaRad);
      return { x: e.east, z: e.north };
    });

    let ring: { x: number; z: number }[] | null = null;
    let ringSource = '';

    // §FACADE-STUDY-SUBJECT (L-596) — THE EXPLICIT SUBJECT BRANCH.
    //
    // 🔴 Read L-272 before editing. The two subjects NEVER fall through into each other: the pure
    // `resolveFacadeStudySubject` returns `refused` (with a reason naming the missing input) rather
    // than substituting the other subject's geometry. That is the whole difference between this
    // feature and the L-272 defect, which silently used the PARCEL ring and presented the result as
    // a building façade study.
    const studySubject = this.facadeStudySubject;
    // The building path's own ring cascade decides "is there a building?" below; for the envelope
    // path we do not need it, so `hasBuildingRing` is only asserted for the building subject.
    let envelopeHeightM = 0;
    if (studySubject === 'envelope') {
      const resolution = resolveFacadeStudySubject({
        subject: 'envelope',
        envelope: envelopeStudyInputFromSolids(input?.envelope),
        hasBuildingRing: false,
      });
      if (resolution.status === 'refused') {
        // A REFUSAL IS A RESULT. It names the missing input on screen instead of painting the
        // building (the L-272 substitution) or leaving a silent blank (L-467/L-469).
        console.log(`[CesiumViewport][forma-facade] §FACADE-STUDY-SUBJECT envelope study refused — ${resolution.reason}`);
        this.setFacadeSubjectBadge(`Envelope study unavailable — ${resolution.reason}`, 'refused');
        return;
      }
      ring = sceneRingToMetric(resolution.ring!);
      ringSource = 'buildable-envelope';
      envelopeHeightM = resolution.heightM!;
      this.setFacadeSubjectBadge(`${resolution.label} — ${resolution.caption}`);
    } else {
      this.setFacadeSubjectBadge(null);
    }

    if (!ring && input) {
      // The authored walls include the perimeter shell; reconstructPerimeterRing traces
      // the outer boundary loop (interior partitions branch off + are not followed).
      const wallRing = this.reconstructPerimeterRing(input.walls);
      if (wallRing && wallRing.length >= 3) { ring = sceneRingToMetric(wallRing); ringSource = 'wall-loop'; }
    }
    if (!ring && input) {
      const slabRing = this.slabRingForBand(input.slabs ?? [], 0);
      if (slabRing && slabRing.length >= 3) { ring = sceneRingToMetric(slabRing); ringSource = 'floor-slab'; }
    }
    if (!ring && input?.boundary && input.boundary.length >= 3) {
      ring = sceneRingToMetric(input.boundary);
      ringSource = 'parcel-boundary';
    }
    if (!ring && studySubject === 'building') {
      // Last resort: a square about the placed massing centroid (already ENU metres —
      // east = centroidEast, north = centroidNorth — so NO z-flip here).
      const o = this.formaMassingOrigin;
      if (o && o.areaM2 > 0) {
        const half = Math.max(2, Math.sqrt(o.areaM2) / 2);
        const cx = o.centroidEast, cz = o.centroidNorth;
        ring = [
          { x: cx - half, z: cz - half }, { x: cx + half, z: cz - half },
          { x: cx + half, z: cz + half }, { x: cx - half, z: cz + half },
        ];
        ringSource = 'massing-centroid-square';
      }
    }
    if (!ring || ring.length < 3) {
      // §FACADE-STUDY-SUBJECT (L-596) — the BUILDING subject's refusal, routed through the same
      // pure resolver so the wording (and the "switch to the envelope — it is a different
      // question" hint) is stated in exactly one place. It still REFUSES; it does not reach for
      // the envelope, which is the L-272 substitution this feature exists to keep closed.
      const refusal = resolveFacadeStudySubject({
        subject: 'building', envelope: envelopeStudyInputFromSolids(input?.envelope), hasBuildingRing: false,
      });
      const reason = refusal.status === 'refused' ? refusal.reason : 'no building footprint';
      console.log(`[CesiumViewport][forma-facade] no building footprint (no boundary / wall-loop / slab / massing) — skipping façade analysis. ${reason}`);
      this.setFacadeSubjectBadge(`Façade study unavailable — ${reason}`, 'refused');
      return;
    }
    console.log(`[CesiumViewport][forma-facade] §FORMA-FACADE-FOOTPRINT-FIX footprint from ${ringSource} (${ring.length} pts), subject=${studySubject}.`);
    // §FIX-FACADE-ANALYSIS-DRAPE-QUALITY (L-272) — ENVELOPE-ONLY drape (see `applyRealModelSunDrape`).
    // The inner band is only meaningful when the ring IS the building's own wall line; on a parcel
    // ring or a centroid square, "inside the ring" says nothing about "inside the building", so the
    // test is disabled (0) rather than guessed. 0.75 m ≈ a generous exterior-wall thickness + reveal:
    // a fragment deeper than that BEHIND its wall line is interior structure seen through a punched
    // opening, not façade.
    const facadeInnerBandM = ringSource === 'wall-loop' || ringSource === 'floor-slab' ? 0.75 : 0;
    // §FORMA-FULL-HEIGHT (founder 2026-07-01, ADR-0095) — Building top height = the
    // tallest storey band's base + height (the roof level). Because the massing shell is
    // now TILED to the full building height (tileBandsToFullHeight above publishes the
    // full stack into `formaStoreyBands`), this height now spans the WHOLE tower rather
    // than the single 4 m ground band — so the façade study paints the entire elevation,
    // not just the bottom ring.
    let heightM = 0;
    if (studySubject === 'envelope') {
      // §FACADE-STUDY-SUBJECT (L-596) — the envelope's CONSTRUCTED legal height (Art. 327.2 for
      // Barcelona 13a). Never the storey-band stack: the storeys belong to a design, and the
      // envelope study is explicitly about the case where no design exists. `resolveFacadeStudy
      // Subject` already refused when this height is absent (§ENVELOPE-NO-FABRICATED-HEIGHT,
      // L-525a) — there is no stand-in height on this path, by design.
      heightM = envelopeHeightM;
    } else {
      for (const b of this.formaStoreyBands) {
        const top = (b.baseElevation || 0) + (b.heightM || 0);
        if (top > heightM) heightM = top;
      }
      if (!(heightM > 0)) heightM = 3; // single-storey fallback
    }

    // Occluders = OSM context + the proposed massing (the same set the ground grid uses).
    // §FACADE-STUDY-SUBJECT (L-596) — for the ENVELOPE subject the proposed massing is DROPPED:
    // a design sitting inside the envelope is the same space counted twice, and letting it shade
    // the envelope reproduces the exact "real building self-shadowing the phantom" artefact L-272
    // records. Real OSM neighbours stay in the set for both subjects — those genuinely shade it.
    const occluders = this.siteMetricFootprints(origin, {
      includeProposedMassing: includeProposedMassingAsOccluder(studySubject),
    });

    // §FIX-FACADE-ANALYSIS-REAL-GEOMETRY (L-144 / L-160b) — the REAL authored window +
    // door openings, in the metric frame (east = x, north = −z, matching sceneRingToMetric).
    // These are the SAME openings the real full-fidelity GLB is built from (the founder's
    // "228 openings"). Each is punched out of its exterior façade face below, so the study
    // surface is the real walls WITH their openings, not a solid perimeter prism. When there
    // are no openings (older callers / apartment massing) every face stays solid — the fast
    // preview / fallback tier (A.24), unchanged behaviour.
    // §L-430 — rotated with the SAME θ as `sceneRingToMetric` above; an opening left in the
    // project frame would be punched into the wrong face of its own (rotated) façade.
    // §FACADE-STUDY-SUBJECT (L-596) — NO openings on the envelope subject. The authored openings
    // belong to the DESIGNED building; punching them into envelope faces would assert window
    // positions on a volume that has none, which is precisely the "no authored opening could
    // project onto any face" confusion L-272 produced from the other direction. An envelope face
    // is a solid legal plane, and the study answers which of those planes earn glazing.
    const metricOpenings: FacadeOpening[] = (studySubject === 'envelope' ? [] : (input?.openings ?? [])).map((o) => {
      const a = sceneXZToEnu(o.a.x, o.a.z, thetaRad);
      const b = sceneXZToEnu(o.b.x, o.b.z, thetaRad);
      return {
        a: { x: a.east, z: a.north },
        b: { x: b.east, z: b.north },
        baseElevation: o.baseElevation,
        sill: o.sill,
        height: o.height,
        kind: o.kind,
      };
    });

    // §FEAT-FACADE-ANALYSIS-SMOOTH-PER-FACE (L-232, founder 2026-07-11) — the 2.5 m lattice + the
    // 25-min sun cadence were too coarse for a façade: after L-227 stretches the wall field to the
    // full ramp, the finite sun-sample quantisation (∼5% steps) reads as per-storey banding, and a
    // storey (∼3 m) carried barely one vertical node. `planFacadeSampling` picks a FINER, sub-storey
    // spacing + a finer sun cadence (∼half the ground's, to counter the L-227 range stretch so the
    // façade's contour fineness matches the ground's), BOTH bounded by a work budget that SHRINKS as
    // the building grows. This is CPU raycast work only (chunked below); the DISPLAY drape textures
    // are separately capped and UNCHANGED, so a tall tower adds ZERO GPU footprint — the 40-storey
    // WebGPU device-loss history (L-231) cannot recur from this path.
    const facadePerimeterM = ring.reduce((acc, p, i) => {
      const q = ring[(i + 1) % ring.length]!;
      return acc + Math.hypot(q.x - p.x, q.z - p.z);
    }, 0);
    const facadeStoreyH = this.formaStoreyBands.length > 0
      ? heightM / this.formaStoreyBands.length : 3;
    const facadePlan = planFacadeSampling({
      perimeterM: facadePerimeterM,
      heightM,
      storeyHeightM: facadeStoreyH,
      groundStepMinutes: 25,     // the ground heatmap's cadence — the parity anchor
    });
    // The DISPLAY is DECOUPLED (each face → a fine bilinear texture, exactly like the ground
    // §SITE-METRIC-SUN-TEXTURE); we build the lattice PER FACE (each ring edge × the full 0..H
    // height) so it samples continuously up the WHOLE tower — no per-storey tiling.
    const LATTICE_SPACING_M = facadePlan.spacingM;
    // Sun/occluder machinery (sun samples, occluder prisms, the pure per-point evaluator) is reused
    // verbatim from the ground grid via prepareFacadeSunGrid; we only supply our OWN per-face lattice
    // geometry to `evaluateIntensity`. maxSamples caps the built-in point set (unused on our path but
    // kept generous), while the per-face lattice below is bounded by `facadePlan.maxNodes`.
    const prep: FacadeSunPrep | null = prepareFacadeSunGrid({
      footprintRings: [ring],
      heightM,
      occluders,
      latDeg: origin.lat,
      lngDeg: origin.lon,
      sunDay: this.siteMetricSunDay,
      sunStepMinutes: facadePlan.stepMinutes,
      sampleSpacingM: LATTICE_SPACING_M,
      maxSamples: 20000,
    });
    if (!prep) return;

    const seq = ++this.facadeAnalysisBuildSeq;
    const base = this.formaTerrainBaseHeight;
    const originCart = Cesium.Cartesian3.fromDegrees(origin.lon, origin.lat, base);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(originCart);

    // Ring centroid → the outward direction for each face (mirrors buildFacadeSamplePoints).
    let cx = 0, cz = 0;
    for (const p of ring) { cx += p.x; cz += p.z; }
    cx /= ring.length; cz /= ring.length;

    // Build one FACE job per ring edge: a (nU × nV) lattice spanning the face rectangle
    // (0..segLen along × 0..H up), continuously up the full elevation. Each node is a
    // FacadeSamplePoint fed to the SAME `prep.evaluateIntensity`. The whole tower's faces
    // are evaluated across frames (chunked) so the per-point raycast never freezes the
    // viewport, then each face is rasterised to ONE smooth texture + painted once.
    interface FaceJob {
      nU: number; nV: number; segLen: number;
      // world corners of the face rectangle (bottom-start, bottom-end, top-end, top-start)
      corners: Cesium.Cartesian3[];
      intensities: Array<number | null>;
      // sampler geometry: face start (ax,az), along-unit (ux,uz), outward normal (nE,nN).
      geo: { ax: number; az: number; ux: number; uz: number; nE: number; nN: number };
      // §FIX-FACADE-ANALYSIS-REAL-GEOMETRY — the authored openings on THIS face, in face
      // UV (u along, v up with v0 = bottom); punched as transparent holes in the texture.
      openings: FacadeOpeningRect[];
    }
    const enuLocal = (e: number, n: number, u: number): Cesium.Cartesian3 =>
      Cesium.Matrix4.multiplyByPoint(enu, new Cesium.Cartesian3(e, n, u), new Cesium.Cartesian3());

    // §FIX-FACADE-ANALYSIS-DRAPE-QUALITY (L-272) — the drape's faces are the envelope's COPLANAR
    // PANELS, not the raw ring edges. `reconstructPerimeterRing` on a real 192-wall model emits
    // several collinear edges along a single physical wall; one lattice + one atlas cell + one
    // reconstruction kernel PER EDGE therefore seamed the study at every internal vertex (the
    // founder's "patchwork"). Merging collinear runs gives ONE continuous field per envelope plane
    // that the drape merely SAMPLES — exactly continuous across those seams — while a REAL corner
    // (normal flips ⇒ the sun field is physically discontinuous) still ends a panel and stays crisp.
    const panels = mergeCollinearFacadeEdges(ring);
    const faceJobs: FaceJob[] = [];
    for (let i = 0; i < panels.length; i++) {
      const p = panels[i]!;
      const a = { x: p.ax, z: p.az }; const b = { x: p.bx, z: p.bz };
      const dx = b.x - a.x, dz = b.z - a.z;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 1e-3) continue;
      const ux = dx / segLen, uz = dz / segLen;                 // along-face unit
      let nE = -uz, nN = ux;                                     // outward face normal
      const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      if ((mx - cx) * nE + (mz - cz) * nN < 0) { nE = -nE; nN = -nN; }
      const nU = Math.max(2, Math.round(segLen / LATTICE_SPACING_M) + 1);
      const nV = Math.max(2, Math.round(heightM / LATTICE_SPACING_M) + 1);
      // Face rectangle corners (perPositionHeight polygon). Order: BL, BR, TR, TL.
      const bl = enuLocal(a.x, a.z, 0), br = enuLocal(b.x, b.z, 0);
      const tr = enuLocal(b.x, b.z, heightM), tl = enuLocal(a.x, a.z, heightM);
      // §FIX-FACADE-ANALYSIS-REAL-GEOMETRY — the authored openings that lie on THIS face.
      const faceOpenings = facadeOpeningUvRects(
        { ax: a.x, az: a.z, ux, uz, segLen }, heightM, metricOpenings,
      );
      faceJobs.push({
        nU, nV, segLen,
        corners: [bl, br, tr, tl],
        intensities: new Array<number | null>(nU * nV).fill(null),
        geo: { ax: a.x, az: a.z, ux, uz, nE, nN },
        openings: faceOpenings,
      });
    }

    // Roof: a single flat lattice over the ring bbox at the top (point-in-ring filtered),
    // painted as ONE textured polygon of the ring itself.
    let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
    for (const p of ring) {
      if (p.x < minE) minE = p.x; if (p.x > maxE) maxE = p.x;
      if (p.z < minN) minN = p.z; if (p.z > maxN) maxN = p.z;
    }
    const roofW = Math.max(1e-3, maxE - minE), roofD = Math.max(1e-3, maxN - minN);
    const roofNU = Math.max(2, Math.round(roofW / LATTICE_SPACING_M) + 1);
    const roofNV = Math.max(2, Math.round(roofD / LATTICE_SPACING_M) + 1);
    const roofRing = ring.map((p) => ({ e: p.x, n: p.z }));
    const roofInts = new Array<number | null>(roofNU * roofNV).fill(null);
    const roofRingWorld = ring.map((p) => enuLocal(p.x, p.z, heightM + 0.05));

    // Flatten all lattice nodes into one work list (face nodes + roof nodes) so the chunk
    // driver evaluates them uniformly across frames. Each entry knows where to store its
    // result. total nodes ≈ perimeter·H / spacing² — coarse, so this is affordable.
    type NodeRef =
      | { kind: 'face'; job: FaceJob; u: number; v: number }
      | { kind: 'roof'; u: number; v: number };
    const nodes: NodeRef[] = [];
    for (const job of faceJobs) {
      for (let v = 0; v < job.nV; v++) for (let u = 0; u < job.nU; u++) nodes.push({ kind: 'face', job, u, v });
    }
    for (let v = 0; v < roofNV; v++) for (let u = 0; u < roofNU; u++) nodes.push({ kind: 'roof', u, v });

    const pointInRoof = (e: number, n: number): boolean => {
      // ray-cast even-odd (same convention as buildFacadeSamplePoints' pointInRing).
      let inside = false;
      for (let i = 0, j = roofRing.length - 1; i < roofRing.length; j = i++) {
        const ei = roofRing[i]!.e, ni = roofRing[i]!.n, ej = roofRing[j]!.e, nj = roofRing[j]!.n;
        if ((ni > n) !== (nj > n) && e < ((ej - ei) * (n - ni)) / (nj - ni || 1e-9) + ei) inside = !inside;
      }
      return inside;
    };

    // §PERF-SUNHOURS-NO-RECOMPUTE (L-143) — record the signature of the study we are about
    // to compute, so a later repaint with identical inputs (a massing re-render that didn't
    // change the façade) short-circuits at the top of `renderFacadeAnalysis` instead of
    // re-running this per-point raycast. The build is chunked/async; entities only appear on
    // completion, so a same-key repaint mid-build (entities still empty) safely rebuilds.
    this.facadeAnalysisLastKey = this.facadeAnalysisKey(origin);

    this.facadeChunkBuild(seq, nodes.length, 400, (lo, hi) => {
      for (let i = lo; i < hi; i++) {
        const ref = nodes[i]!;
        if (ref.kind === 'face') {
          const job = ref.job;
          const geo = job.geo;
          const t = job.nU > 1 ? ref.u / (job.nU - 1) : 0;
          const along = t * job.segLen;
          const up = job.nV > 1 ? (ref.v / (job.nV - 1)) * heightM : 0;
          const px = geo.ax + geo.ux * along;
          const pz = geo.az + geo.uz * along;
          const sp: FacadeSamplePoint = {
            east: px + geo.nE * 0.25, north: pz + geo.nN * 0.25,
            up: Math.max(0.3, up), surface: 'wall', normE: geo.nE, normN: geo.nN,
          };
          job.intensities[ref.v * job.nU + ref.u] = prep.evaluateIntensity(sp);
        } else {
          const e = minE + (roofNU > 1 ? ref.u / (roofNU - 1) : 0) * roofW;
          const n = minN + (roofNV > 1 ? ref.v / (roofNV - 1) : 0) * roofD;
          // Outside the plan → hole (flood-filled) so the roof texture still fills the ring.
          const val = pointInRoof(e, n)
            ? prep.evaluateIntensity({ east: e, north: n, up: heightM + 0.05, surface: 'roof', normE: 0, normN: 0 })
            : null;
          roofInts[ref.v * roofNU + ref.u] = val;
        }
      }
    }, () => {
      // §FEAT-FACADE-ANALYSIS-MATCH-SUNHOURS-QUALITY (L-227, founder 2026-07-09) — the raw
      // per-point field (`lit / samples.length`) collapses a vertical façade into the COLD
      // HALF of the ramp: a wall only takes the sun samples on its OUTWARD side (back-face
      // cull), so it can never reach the all-day sample count the fraction divides by, and the
      // whole building read as a near-flat cyan. Normalise the study to its realised MAXIMUM
      // WALL intensity — exactly as `computeSunHoursOnModel` normalises by `maxSunHours` (the
      // ground pass the founder calls "amazing") — so the REAL per-point variation (N vs S
      // faces, context-shaded base vs sunlit top) spans the FULL cold→warm `sunHoursRgb` ramp,
      // matching the ground heatmap's fidelity. This is a range rescale of the genuine field,
      // NOT a saturation boost; combined with dropping the vivid variant below the façade now
      // reads the IDENTICAL ramp + scale as the ground it sits on.
      {
        const normed = normalizeFacadeStudy(faceJobs.map((j) => j.intensities), roofInts);
        for (let fi = 0; fi < faceJobs.length; fi++) faceJobs[fi]!.intensities = normed.walls[fi]!;
        for (let i = 0; i < roofInts.length; i++) roofInts[i] = normed.roof[i] ?? null;

        // §FIX-FACADE-ANALYSIS-DRAPE-QUALITY (L-272, founder 2026-07-13) — RECONSTRUCT the field
        // before it is draped. MEASURED root of the "terrible" façade (head-less repro, same engine
        // + ramp + frame as the ground): the ground paints a 7.1 m compute field at 0.94 m/texel —
        // a 7.5× upsample, so the binary lit/blocked sun-sample quantum (1/N) is spread over ~7
        // texels and reads as a gradient — while the façade painted its 1.2 m field at 1.0 m/texel,
        // a 1.17× upsample, i.e. the RAW field at its own Nyquist, with L-227's wall-max normalise
        // STRETCHING that quantum to ~2.7% of the ramp. Result: every single sun-sample flip became
        // a one-texel step — 8.3× the ground's texel-to-texel |Δ| and 11.4× its Laplacian (the
        // blotch). It was never the lattice density (texels/m was already at parity) and never the
        // normalisation (already global, one divisor).
        // The kernel is stated in METRES, so a 1 m pier and a 30 m wall are reconstructed at the
        // SAME physical fidelity, and each displayed texel becomes the field's local AREA MEAN —
        // precisely the estimator the ground gets for free from its coarse lattice. σ = 2 m sits far
        // below the ground's ~7 m effective reconstruction support, so the façade still resolves MORE
        // genuine detail than the ground while its noise floor drops below it (measured: blotch
        // Laplacian −3.1×, field P95−P05 contrast −2.5%). The BVH intensities are untouched
        // (ADR-0110) — this is DISPLAY reconstruction, one field, both drapes.
        const sigmaNodes = FACADE_RECON_SIGMA_M / Math.max(0.1, LATTICE_SPACING_M);
        for (const job of faceJobs) {
          job.intensities = smoothFacadeField(job.intensities, job.nU, job.nV, sigmaNodes);
        }
        const roofSmoothed = smoothFacadeField(roofInts, roofNU, roofNV, sigmaNodes);
        for (let i = 0; i < roofInts.length; i++) roofInts[i] = roofSmoothed[i] ?? null;
      }
      // §FIX-FACADE-ANALYSIS-ON-REAL-MODEL (L-177, founder-escalated) — when the REAL
      // full-fidelity GLB is placed, DRAPE the sun-hours result onto ITS OWN faces via a
      // Cesium CustomShader instead of painting the separate translucent envelope prism.
      // The BVH intensities computed above are byte-identical (ADR-0110); only the DISPLAY
      // target changes. On any failure we fall through to the polygon envelope (no regression).
      //
      // §FACADE-STUDY-SUBJECT (L-596) — ⚠ NEVER DRAPE AN ENVELOPE STUDY ONTO THE REAL MODEL.
      // That is L-272's actual mechanism of harm: the drape projects the study onto the GLB's
      // nearest faces, so draping a study of the LEGAL ENVELOPE across a designed building's walls
      // would smear one question's answer over another object entirely. On the envelope subject we
      // always paint the envelope's own faces (the polygon tier below), whether or not a real model
      // happens to be placed.
      const drapeModel = studySubject === 'building'
        && this.realModelOnForma && !this.realModelOnForma.isDestroyed()
        ? this.realModelOnForma : null;
      if (drapeModel) {
        try {
          const drapeFaces: FacadeDrapeFace[] = faceJobs.map((job) => ({
            ax: job.geo.ax, az: job.geo.az,
            bx: job.geo.ax + job.geo.ux * job.segLen,
            bz: job.geo.az + job.geo.uz * job.segLen,
            nU: job.nU, nV: job.nV,
            intensities: job.intensities,
            openings: job.openings,
          }));
          const drape = buildRealModelSunDrape({
            faces: drapeFaces,
            centroidE: cx, centroidN: cz, heightM,
            roofIntensities: roofInts, roofNU, roofNV,
            roofMinE: minE, roofMinN: minN, roofSpanE: roofW, roofSpanN: roofD,
            // §FEAT-FACADE-ANALYSIS-MATCH-SUNHOURS-QUALITY (L-227) — plain `sunHoursRgb`, the
            // IDENTICAL ramp the ground heatmap uses. The vivid saturation/contrast boost
            // (§FORMA-FACADE-VISIBLE) was a cosmetic patch for the compressed cold-band field —
            // it turned the mid-band teal into the founder's "flat cyan" and diverged the façade
            // from the ground scale. With the field now range-normalised above, the honest ramp
            // reads boldly on its own; drop the boost so façade + ground are one scale.
            vivid: false, alpha: 1,
          });
          if (this.applyRealModelSunDrape(drape, facadeInnerBandM)) {
            this.facadeDrapingRealModel = true;
            // Keep the REAL model VISIBLE — the analysis now lives on its own faces, so
            // never suppress it (the old path hid it behind the envelope prism).
            if (this.facadeSuppressingMassing) this.setBuildingMaterialsVisibleForFacade(true);
            try { viewer.scene.requestRender(); } catch { /* viewer gone */ }
            let holes = 0;
            for (const j of faceJobs) holes += j.openings.length;
            console.log(
              `[CesiumViewport][forma-facade] §FIX-FORMA-FACADE-ANALYSIS-QUALITY-PER-FACE draped sun-hours ` +
                `onto the REAL GLB model — PER-FACE PLANAR atlas ${drape.wallW}×${drape.wallH} ` +
                `(${drape.faceCount} face cell(s) ${drape.cellW}×${drape.cellH}) + roof ${drape.roofW}×${drape.roofH}, ` +
                `${faceJobs.length} face(s), ${holes} opening(s), H ${heightM.toFixed(1)} m, day ${this.siteMetricSunDay}). ` +
                `No envelope prism painted; no angular wrap.`,
            );
            this.logFacadeDrapeQuality(faceJobs, ring.length, drape.cellW, drape.cellH, heightM, LATTICE_SPACING_M);
            return;
          }
          console.warn('[CesiumViewport][forma-facade] real-model drape unavailable (no CustomShader / 2D ctx) — envelope-prism fallback.');
        } catch (e) {
          console.warn('[CesiumViewport][forma-facade] real-model drape failed — envelope-prism fallback:', e);
        }
      }
      // §FORMA-FACADE-SMOOTH — rasterise + paint ONE textured polygon per face + roof.
      // Each face texture is a smooth bilinear gradient continuous both along the face and
      // up the FULL elevation (V spans 0..H in a single lattice), so there are no seams
      // between storeys and no discrete quads. This is the MASSING-mode representation (the
      // abstract volumes ARE the building) and the fallback when no real model is placed.
      let facesPainted = 0;
      for (const job of faceJobs) {
        const aspect = job.segLen / Math.max(1e-3, heightM);
        // §FEAT-FACADE-ANALYSIS-MATCH-SUNHOURS-QUALITY (L-227) — near-opaque (0.98) + the PLAIN
        // `sunHoursRgb` ramp (vivid=false), IDENTICAL to the ground heatmap, on the study now
        // range-normalised to fill the full cold→warm span (no vivid saturation lie).
        // §FIX-FACADE-ANALYSIS-REAL-GEOMETRY — punch the real window/door openings as holes.
        const tex: FacadeSunTexture = rasterizeFacadeSunTexture(job.intensities, job.nU, job.nV, aspect, 0.98, false, job.openings);
        const material = this.facadeTextureMaterial(tex);
        if (!material) continue;
        const ent = viewer.entities.add({
          // §FACADE-STUDY-SUBJECT (L-596) — the SUBJECT is baked into the entity name so the
          // scene itself records which question this surface answers.
          name: studySubject === 'envelope' ? 'pryzm-facade-sun-envelope' : 'pryzm-facade-sun',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(job.corners),
            material,
            perPositionHeight: true,
            outline: false,
            stRotation: 0,
          },
        });
        this.facadeAnalysisEntities.push(ent);
        facesPainted++;
      }
      // Roof — one textured polygon of the ring. Aspect = bbox width / depth.
      const roofTex = rasterizeFacadeSunTexture(roofInts, roofNU, roofNV, roofW / Math.max(1e-3, roofD), 0.98, false);
      const roofMat = this.facadeTextureMaterial(roofTex);
      if (roofMat && roofRingWorld.length >= 3) {
        const ent = viewer.entities.add({
          name: studySubject === 'envelope' ? 'pryzm-facade-sun-envelope-roof' : 'pryzm-facade-sun-roof',
          polygon: {
            hierarchy: new Cesium.PolygonHierarchy(roofRingWorld),
            material: roofMat,
            perPositionHeight: true,
            outline: false,
          },
        });
        this.facadeAnalysisEntities.push(ent);
      }
      // §FORMA-FACADE-VISIBLE — the analysis has now PAINTED, so suppress the building's
      // own materials: the tower reads as a pure sun-hours gradient object, not the grey/
      // pastel massing (or the real GLB) showing through. Reversed in setFacadeAnalysis(OFF).
      //
      // §FACADE-STUDY-SUBJECT (L-596) — NOT on the envelope subject. Suppressing the design would
      // hide the very thing the user is comparing the envelope against, and the envelope study is
      // a SEPARATE volume rather than a repaint of the building's own surfaces.
      if (studySubject === 'building' && this.facadeAnalysisOn && this.facadeAnalysisEntities.length > 0) {
        this.setBuildingMaterialsVisibleForFacade(false);
      }
      try { viewer.scene.requestRender(); } catch { /* viewer gone */ }
      let openingHoles = 0;
      for (const j of faceJobs) openingHoles += j.openings.length;
      console.log(
        `[CesiumViewport][forma-facade] §FORMA-FACADE-SMOOTH + §FIX-FACADE-ANALYSIS-REAL-GEOMETRY painted ` +
          `${this.facadeAnalysisEntities.length} smooth textured façade surface(s) (${facesPainted} wall face(s) + roof, ` +
          `${nodes.length} lattice node(s), ${openingHoles} real opening hole(s) from ${metricOpenings.length} authored, ` +
          `H ${heightM.toFixed(1)} m, day ${this.siteMetricSunDay}).`,
      );
      // The polygon-envelope tier rasterises each face at FACADE_TEXTURE_MAX (≤256 per axis), so
      // its m/texel differs from the atlas tier's — pass 0 for the cell dims to say "polygon tier".
      this.logFacadeDrapeQuality(faceJobs, ring.length, 0, 0, heightM, LATTICE_SPACING_M);
    });
  }

  /**
   * §FIX-FACADE-ANALYSIS-DRAPE-QUALITY (L-272) — print the façade study's equivalent of the ground
   * heatmap's benchmark line (`sunHours heatmap: smooth texture 512×512 (~0.9 m/texel) from
   * 1623/1623 cell(s)`), so the two drapes of the ONE field are directly comparable on screen:
   * DISPLAY m/texel, the compute lattice's samples-per-face (min/median/max — a narrow pier and a
   * long wall must be sampled at the same texels/m), the drape face count vs the raw ring-edge
   * count (how many coplanar edges merged into one continuous panel field), the reconstruction
   * kernel, and the normalisation SCOPE (global — one divisor for the whole envelope, never
   * per-face). This log line is the instrument the L-272 fix was measured with; keep it.
   */
  private logFacadeDrapeQuality(
    faceJobs: ReadonlyArray<{ nU: number; nV: number; segLen: number }>,
    ringEdgeCount: number,
    cellW: number,
    cellH: number,
    heightM: number,
    latticeSpacingM: number,
  ): void {
    if (faceJobs.length === 0) return;
    const perFace = faceJobs.map((j) => j.nU * j.nV).sort((a, b) => a - b);
    const med = perFace[Math.floor(perFace.length / 2)]!;
    const maxFaceW = faceJobs.reduce((m, j) => Math.max(m, j.segLen), 0);
    const atlas = cellW > 0 && cellH > 0;
    // Atlas tier: one uniformly-sized cell per face, sized from the WIDEST face → that face is the
    // worst case. Polygon tier: each face gets its OWN aspect-fitted texture capped per axis at
    // FACADE_TEXTURE_MAX (256) — mirror `rasterizeFacadeSunTexture`'s sizing exactly so the number
    // printed is the number rendered.
    let texU = cellW, texV = cellH;
    if (!atlas) {
      const a = Math.max(0.05, Math.min(20, maxFaceW / Math.max(1e-3, heightM)));
      texU = Math.max(4, Math.min(256, Math.round(a >= 1 ? 256 : 256 * a)));
      texV = Math.max(4, Math.min(256, Math.round(a >= 1 ? 256 / a : 256)));
    }
    const mPerTexelU = maxFaceW / Math.max(1, texU);
    const mPerTexelV = heightM / Math.max(1, texV);
    console.log(
      `[CesiumViewport][forma-facade] §FIX-FACADE-ANALYSIS-DRAPE-QUALITY (L-272) ${atlas ? 'REAL-MODEL ATLAS' : 'POLYGON-ENVELOPE'} drape: ` +
        `~${mPerTexelU.toFixed(2)} m/texel along × ~${mPerTexelV.toFixed(2)} m/texel up ` +
        `[ground benchmark ≈0.9 m/texel] from a ${latticeSpacingM.toFixed(2)} m compute lattice ` +
        `(upsample ≈${(latticeSpacingM / Math.max(0.01, mPerTexelU)).toFixed(1)}×; the ground's is ≈7.5×); ` +
        `samples/face min ${perFace[0]} · median ${med} · max ${perFace[perFace.length - 1]}; ` +
        `${faceJobs.length} coplanar panel(s) merged from ${ringEdgeCount} ring edge(s); ` +
        `reconstruction σ ${FACADE_RECON_SIGMA_M.toFixed(1)} m; normalisation GLOBAL (one divisor, whole envelope).`,
    );
  }

  /** §FORMA-FACADE-SMOOTH — wrap a rasterised façade texture in a Cesium
   *  ImageMaterialProperty (RGBA → canvas → transparent image material), the SAME
   *  display mechanism the ground heatmap uses (`paintMetricTexture`). Returns null if
   *  no 2D context is available (headless). */
  private facadeTextureMaterial(tex: FacadeSunTexture): Cesium.ImageMaterialProperty | null {
    const canvas = document.createElement('canvas');
    canvas.width = tex.width;
    canvas.height = tex.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(tex.width, tex.height);
    img.data.set(tex.rgba);
    ctx.putImageData(img, 0, 0);
    return new Cesium.ImageMaterialProperty({ image: canvas, transparent: true });
  }

  /**
   * §FIX-FORMA-FACADE-ANALYSIS-QUALITY-PER-FACE (L-199) — attach a Cesium CustomShader to the
   * REAL placed GLB so the sun-hours study colours the model's OWN faces (no separate envelope
   * prism). The shader reads each fragment's model-space position (positionMC: x = east, y = up,
   * z with north = −z — the SAME ENU mapping the model is placed with, §A.21.D54) and looks up:
   *   • ROOF — when the fragment is within `roofBand` of the building top — from the top-down
   *     bbox lookup (u = east, v = north). Planar; unchanged.
   *   • WALL — otherwise — by selecting the NEAREST façade face (planar projection against the
   *     FACE TABLE) and sampling that face's own PLANAR gradient cell in the wall ATLAS
   *     (u = along-face, v = height). This REPLACES L-177's cylindrical (u = centroid-angle)
   *     unwrap, whose pole singularity at the footprint centre read as radial spikes from the
   *     roof apex and smeared across faces on rectangular + balconied towers. Balconies / insets
   *     snap to their parent wall (nearest face) → a clean flat gradient, no angular wrap.
   * Openings (alpha 0) `discard` so the real window/door voids read through. UNLIT so the
   * analysis colours are the pure ramp, not darkened by the Forma sun (the founder: "only those
   * colours should render"). A.24 Presentation tier: ONE shader + three small texture uploads,
   * no per-frame work — inside the device-loss budget.
   *
   * §FIX-FACADE-ANALYSIS-DRAPE-QUALITY (L-272) — DRAPE ONLY THE ENVELOPE. The GLB is the whole
   * BIM model, and the shader coloured EVERY fragment of it — including the interior partitions
   * that the punched window/door voids expose. A sun-hours value on an interior wall is
   * meaningless noise, and it was being painted in the same vivid ramp as the façade, so every
   * opening framed a patch of fake analysis. The wall branch now takes the SIGNED plan distance
   * from the fragment to its nearest envelope panel (outward positive — the panel's outward
   * normal is resolved from the footprint centroid, the same star-shaped assumption the whole
   * drape already makes) and renders anything deeper than `innerBandM` BEHIND the envelope line
   * as neutral un-analysed structure instead of study colour. Protrusions (balconies, loggias,
   * reveals) are on the OUTWARD side and keep their analysis; nothing is discarded, so the fix
   * can never remove geometry. `innerBandM = 0` disables the test — the caller passes 0 whenever
   * the footprint ring is NOT the building's own wall line (a drawn parcel boundary or the
   * massing-centroid square), because then "inside the ring" says nothing about "inside the
   * building".
   *
   * The lookup textures are uploaded straight from the drape's RGBA typed arrays (no DOM canvas),
   * so this works head-lessly. The FACE TABLE is NEAREST-filtered (its bytes are 16-bit
   * fixed-point endpoints, not colours — must not be interpolated). Returns false if CustomShader
   * is unavailable in this Cesium build (caller falls back to the per-face polygon envelope).
   */
  private applyRealModelSunDrape(drape: RealModelSunDrape, innerBandM = 0): boolean {
    const model = this.realModelOnForma;
    if (!model || model.isDestroyed()) return false;
    if (typeof Cesium.CustomShader !== 'function') return false;
    try {
      const wallTex = new Cesium.TextureUniform({
        typedArray: Uint8Array.from(drape.wallRgba),
        width: drape.wallW, height: drape.wallH, repeat: false,
      });
      const roofTex = new Cesium.TextureUniform({
        typedArray: Uint8Array.from(drape.roofRgba),
        width: drape.roofW, height: drape.roofH, repeat: false,
      });
      // FACE TABLE — data texture (encoded geometry, NOT colour) → NEAREST both ways so the
      // shader recovers the exact 16-bit endpoint bytes without filtering.
      const faceTableTex = new Cesium.TextureUniform({
        typedArray: Uint8Array.from(drape.faceTableRgba),
        width: drape.faceTableW, height: drape.faceTableH, repeat: false,
        minificationFilter: Cesium.TextureMinificationFilter.NEAREST,
        magnificationFilter: Cesium.TextureMagnificationFilter.NEAREST,
      });
      const shader = new Cesium.CustomShader({
        mode: Cesium.CustomShaderMode.MODIFY_MATERIAL,
        lightingModel: Cesium.LightingModel.UNLIT,
        uniforms: {
          u_pryzmWallTex: { type: Cesium.UniformType.SAMPLER_2D, value: wallTex },
          u_pryzmRoofTex: { type: Cesium.UniformType.SAMPLER_2D, value: roofTex },
          u_pryzmFaceTbl: { type: Cesium.UniformType.SAMPLER_2D, value: faceTableTex },
          u_pryzmHeight: { type: Cesium.UniformType.FLOAT, value: Math.max(0.001, drape.heightM) },
          u_pryzmRoofBand: { type: Cesium.UniformType.FLOAT, value: Math.max(0.5, drape.heightM * 0.03) },
          u_pryzmCentroid: { type: Cesium.UniformType.VEC2, value: new Cesium.Cartesian2(drape.centroidE, drape.centroidN) },
          u_pryzmRoofBBox: { type: Cesium.UniformType.VEC4, value: new Cesium.Cartesian4(drape.roofMinE, drape.roofMinN, drape.roofSpanE, drape.roofSpanN) },
          u_pryzmFaceCount: { type: Cesium.UniformType.FLOAT, value: Math.max(0, drape.faceCount) },
          u_pryzmCellW: { type: Cesium.UniformType.FLOAT, value: Math.max(1, drape.cellW) },
          u_pryzmEncRange: { type: Cesium.UniformType.FLOAT, value: Math.max(1, drape.encodeRange) },
          // §FIX-FACADE-ANALYSIS-DRAPE-QUALITY (L-272) — envelope-only drape. 0 = test disabled.
          u_pryzmInnerBand: { type: Cesium.UniformType.FLOAT, value: Math.max(0, innerBandM) },
          // §L-430 slice 2b — θ (project→true north). REQUIRED FOR CORRECTNESS, not cosmetics:
          // `positionMC` below is the model's LOCAL (project-frame) position, but the face
          // table, centroid and roof bbox this shader compares it against are all built from
          // `sceneRingToMetric` / the massing centroid, which are now TRUE-frame. Without this
          // rotation the two frames disagree by θ and every fragment samples the WRONG face —
          // the drape would slide around the building. θ = 0 ⇒ identity ⇒ unchanged.
          u_pryzmProjNorth: { type: Cesium.UniformType.FLOAT, value: this.readProjectNorthRad() },
        },
        fragmentShaderText: [
          '#define PRYZM_MAX_FACES 128',
          // Decode a 16-bit fixed-point value (hi,lo normalised bytes) → metres rel centroid.
          'float pryzmDec16(float hiN, float loN) {',
          '  float u16 = floor(hiN * 255.0 + 0.5) * 256.0 + floor(loN * 255.0 + 0.5);',
          '  return (u16 / 65535.0 * 2.0 - 1.0) * u_pryzmEncRange;',
          '}',
          'void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {',
          '  vec3 p = fsInput.attributes.positionMC;',
          // §L-430 — base ENU mapping (north = −z, §A.21.D54) THEN rotate the project frame
          // onto true north, matching `projectVectorToTrueNorth` exactly:
          //     east' =  e·cosθ + n·sinθ ;  north' = −e·sinθ + n·cosθ
          // The face table / centroid / roof bbox are true-frame; positionMC is project-frame.
          '  float e0 = p.x;',
          '  float n0 = -p.z;',
          '  float csT = cos(u_pryzmProjNorth);',
          '  float snT = sin(u_pryzmProjNorth);',
          '  float east  =  e0 * csT + n0 * snT;',
          '  float north = -e0 * snT + n0 * csT;',
          '  float upM = p.y;',
          '  vec4 col;',
          '  if (upM >= u_pryzmHeight - u_pryzmRoofBand) {',
          '    vec2 ruv = vec2((east - u_pryzmRoofBBox.x) / max(u_pryzmRoofBBox.z, 0.001),',
          '                    (north - u_pryzmRoofBBox.y) / max(u_pryzmRoofBBox.w, 0.001));',
          '    col = texture(u_pryzmRoofTex, clamp(ruv, 0.0, 1.0));',
          '  } else {',
          // WALL — nearest-face planar projection against the face table.
          '    int count = int(u_pryzmFaceCount + 0.5);',
          '    vec2 frag = vec2(east - u_pryzmCentroid.x, north - u_pryzmCentroid.y);',
          '    float bestD = 1.0e20;',
          '    int bestIdx = -1;',
          '    float bestW = 0.0;',
          // §FIX-FACADE-ANALYSIS-DRAPE-QUALITY (L-272) — SIGNED plan distance to the winning panel
          // (outward positive) so an INTERIOR fragment can be told from an envelope one.
          '    float bestSigned = 0.0;',
          '    for (int i = 0; i < PRYZM_MAX_FACES; i++) {',
          '      if (i >= count) { break; }',
          '      float fy = (float(i) + 0.5) / float(count);',
          '      vec4 ta = texture(u_pryzmFaceTbl, vec2(0.25, fy));',  // col 0 → endpoint A
          '      vec4 tb = texture(u_pryzmFaceTbl, vec2(0.75, fy));',  // col 1 → endpoint B
          '      vec2 a = vec2(pryzmDec16(ta.r, ta.g), pryzmDec16(ta.b, ta.a));',
          '      vec2 b = vec2(pryzmDec16(tb.r, tb.g), pryzmDec16(tb.b, tb.a));',
          '      vec2 e = b - a;',
          '      float L = length(e);',
          '      if (L < 0.001) { continue; }',
          '      vec2 ud = e / L;',
          '      float along = dot(frag - a, ud);',
          '      float w = clamp(along / L, 0.0, 1.0);',
          '      vec2 nearest = a + ud * (w * L);',
          '      float d = distance(frag, nearest);',
          // Outward normal of this panel: the perpendicular that points AWAY from the footprint
          // centroid (frag/a/b are already centroid-relative) — the same rule the CPU lattice uses.
          '      vec2 nrm = vec2(-ud.y, ud.x);',
          '      if (dot(nrm, (a + b) * 0.5) < 0.0) { nrm = -nrm; }',
          '      if (d < bestD) { bestD = d; bestIdx = i; bestW = w; bestSigned = dot(frag - a, nrm); }',
          '    }',
          '    if (bestIdx < 0) { discard; }',
          // ENVELOPE-ONLY: a fragment further than `innerBand` BEHIND its nearest envelope panel is
          // interior structure (a partition, a core wall) exposed through a punched opening — it is
          // not part of the façade study, so it renders as neutral un-analysed material rather than
          // fake sun data. Protrusions (balconies/reveals) sit on the OUTWARD side and are kept.
          // Nothing is discarded here, so this can never remove geometry.
          '    if (u_pryzmInnerBand > 0.0 && bestSigned < -u_pryzmInnerBand) {',
          '      material.diffuse = vec3(0.72);',
          '      material.alpha = 1.0;',
          '      return;',
          '    }',
          '    float vFrac = clamp(upM / max(u_pryzmHeight, 0.001), 0.0, 1.0);',
          // Atlas cell U with a half-texel inset so LINEAR filtering never bleeds across faces.
          '    float halfTexel = 0.5 / max(u_pryzmCellW, 1.0);',
          '    float wIn = mix(halfTexel, 1.0 - halfTexel, bestW);',
          '    float atlasU = (float(bestIdx) + wIn) / float(count);',
          '    col = texture(u_pryzmWallTex, vec2(atlasU, vFrac));',
          '  }',
          '  if (col.a < 0.05) { discard; }',
          '  material.diffuse = col.rgb;',
          '  material.alpha = 1.0;',
          '}',
        ].join('\n'),
      });
      model.customShader = shader;
      return true;
    } catch (e) {
      console.warn('[CesiumViewport][forma-facade] §FIX-FORMA-FACADE-ANALYSIS-QUALITY-PER-FACE CustomShader construct failed:', e);
      return false;
    }
  }

  /** §FIX-FACADE-ANALYSIS-ON-REAL-MODEL — remove the sun-hours drape shader from the real
   *  model (restoring its normal materials) and clear the draping flag. Idempotent. */
  private clearRealModelSunDrape(): void {
    this.facadeDrapingRealModel = false;
    const model = this.realModelOnForma;
    if (!model || model.isDestroyed()) return;
    // Cesium's Model.customShader is runtime-nullable (assigning undefined removes the
    // shader) but its .d.ts types it non-null; cast around the imprecise type.
    try { (model as { customShader: Cesium.CustomShader | undefined }).customShader = undefined; }
    catch { /* model gone */ }
    try { this.viewer?.scene.requestRender(); } catch { /* viewer gone */ }
  }

  /** §FORMA-FACADE-ANALYSIS — chunked driver for the per-point façade raycast (mirrors
   *  `chunkBuild` but on the façade build's own token + cancellers). */
  private facadeChunkBuild(
    seq: number,
    total: number,
    batch: number,
    work: (lo: number, hi: number) => void,
    onDone: () => void,
  ): void {
    const viewer = this.viewer;
    const step = (start: number): void => {
      if (seq !== this.facadeAnalysisBuildSeq || !this.viewer || this.viewer !== viewer) return;
      const end = Math.min(total, start + batch);
      try { work(start, end); } catch (e) { console.warn('[CesiumViewport][forma-facade] chunk failed:', e); }
      try { viewer.scene.requestRender(); } catch { /* viewer gone */ }
      if (end < total) {
        const cancel = deferWork(() => step(end), 0);
        this.facadeAnalysisChunkCancellers.push(cancel);
      } else {
        onDone();
      }
    };
    if (total <= 0) { onDone(); return; }
    step(0);
  }

  /** §FORMA-FACADE-ANALYSIS — remove the façade quads + cancel any in-flight build. */
  private clearFacadeAnalysis(): void {
    this.facadeAnalysisBuildSeq++;
    for (const cancel of this.facadeAnalysisChunkCancellers) { try { cancel(); } catch { /* ignore */ } }
    this.facadeAnalysisChunkCancellers = [];
    const viewer = this.viewer;
    if (viewer) {
      for (const e of this.facadeAnalysisEntities) { try { viewer.entities.remove(e); } catch { /* gone */ } }
    }
    this.facadeAnalysisEntities = [];
    // §FIX-FACADE-ANALYSIS-ON-REAL-MODEL — also strip the real-model drape shader (restores
    // the model's own materials); no-op when the study was painted as polygons instead.
    this.clearRealModelSunDrape();
    // §PERF-SUNHOURS-NO-RECOMPUTE (L-143) — an explicit clear drops the memoised study so
    // the next render always rebuilds (the painted result no longer exists to reuse).
    this.facadeAnalysisLastKey = null;
    // §FACADE-STUDY-SUBJECT (L-596) — the badge names a study that is no longer on screen, so it
    // goes with it. A label outliving its study is worse than no label.
    this.setFacadeSubjectBadge(null);
  }

  /**
   * §FORMA-FACADE-VISIBLE (founder 2026-07-01) — while façade analysis is ON, SUPPRESS
   * the building's own materials so ONLY the sun-hours texture reads on the tower ("once
   * façade analysis is on only those colours should render"). Hides BOTH representations
   * (whichever is live): the abstract massing polygon entities AND the REAL full-fidelity
   * GLB model. Fully reversible — passing `visible = true` re-shows them exactly.
   *
   * The façade-analysis entities themselves live in `facadeAnalysisEntities` (a SEPARATE
   * layer), so they are never touched here. The real model's floor-filter show-state is
   * re-honoured on restore (via `applyFormaRealModelFloorFilter`), so a partial-floor
   * filter that was active before analysis is preserved.
   *
   * @param visible false = suppress (analysis ON), true = restore (analysis OFF).
   */
  private setBuildingMaterialsVisibleForFacade(visible: boolean): void {
    const viewer = this.viewer;
    this.facadeSuppressingMassing = !visible;
    // Massing polygon blocks.
    for (const ent of this.formaMassingEntities) {
      try { ent.show = visible; } catch { /* gone */ }
    }
    // Real full-fidelity GLB model. On restore, defer to the floor-filter's own show
    // decision (which itself now respects the suppression flag, cleared just above).
    const model = this.realModelOnForma;
    if (model && !model.isDestroyed()) {
      if (!visible) {
        try { model.show = false; } catch { /* gone */ }
      } else {
        this.applyFormaRealModelFloorFilter();
      }
    }
    try { viewer?.scene.requestRender(); } catch { /* viewer gone */ }
  }

  /** Project the OSM context + proposed massing footprints into the site-ENU frame
   *  (east/north metres about the overlay origin) for the street-analytics grids. */
  private siteMetricFootprints(
    origin: { lat: number; lon: number },
    /**
     * §FACADE-STUDY-SUBJECT (L-596) — `includeProposedMassing: false` drops the PROPOSED massing
     * from the occluder set, keeping only the real OSM neighbours.
     *
     * Used ONLY by the ENVELOPE façade study, and it is the L-272 lesson stated as code: the
     * envelope is the volume a building COULD occupy, so a design that happens to exist inside it
     * is not a neighbour casting shade onto it — it is the same space counted twice, which is
     * exactly the "real building self-shadowing the phantom" artefact L-272 records. DEFAULT true
     * ⇒ every existing caller (ground heatmaps, the building façade study) is byte-unchanged.
     */
    opts: { readonly includeProposedMassing?: boolean } = {},
  ): MetricFootprint[] {
    const includeProposedMassing = opts.includeProposedMassing !== false;
    const out: MetricFootprint[] = [];
    const originCart = Cesium.Cartesian3.fromDegrees(origin.lon, origin.lat, 0);
    const enu = Cesium.Transforms.eastNorthUpToFixedFrame(originCart);
    const inv = Cesium.Matrix4.inverse(enu, new Cesium.Matrix4());
    const collection = this.lastContextCollection;
    if (collection) {
      for (const f of collection.features) {
        const ring = f.geometry.coordinates[0];
        if (!ring || ring.length < 4) continue;
        const enuRing: { x: number; z: number }[] = [];
        for (const [flon, flat] of ring) {
          if (flon == null || flat == null) continue;
          const fc = Cesium.Cartesian3.fromDegrees(flon, flat, 0);
          const local = Cesium.Matrix4.multiplyByPoint(inv, fc, new Cesium.Cartesian3());
          // ENU x = east, y = north → StreetGrid XZ (x = east, z = north).
          enuRing.push({ x: local.x, z: local.y });
        }
        if (enuRing.length >= 3) {
          out.push({
            ring: enuRing,
            heightM: Math.max(0.1, f.properties.heightM),
            // Real OSM floor count (when tagged) → truthful population GFA proxy.
            ...(f.properties.floors !== undefined ? { floors: f.properties.floors } : {}),
          });
        }
      }
    }
    // The proposed massing as one footprint so the field reads its density/shelter
    // even when OSM context is sparse (a square about the massing centroid).
    const o = includeProposedMassing ? this.formaMassingOrigin : null;
    if (o && o.areaM2 > 0) {
      const half = Math.sqrt(o.areaM2) / 2;
      const cx = o.centroidEast;
      const cz = o.centroidNorth;
      out.push({
        ring: [
          { x: cx - half, z: cz - half }, { x: cx + half, z: cz - half },
          { x: cx + half, z: cz + half }, { x: cx - half, z: cz + half },
        ],
        heightM: 9,
      });
    }
    return out;
  }

  /**
   * Render the active site-metric ground heatmap — LARGER disc + FINER cells, built
   * PROGRESSIVELY across frames so it never freezes the WebGPU viewport.
   *
   * §SITE-METRIC-HEATMAP-LARGER/FINER/CHUNKED (founder 2026-06-28):
   *  - disc radius = `siteMetricRadiusM()` (~2× the overlay radius, clamped to OSM
   *    context coverage so it never spills into an empty zone);
   *  - target cell ≈ 3.5 m (climate metrics) / 5 m (sun hours, the heaviest),
   *    clamped UP by the pure builder's hard cell cap so a big disc stays bounded;
   *  - the cells are PAINTED in per-frame batches via `deferWork`, and for sun-hours
   *    the heavy per-cell raycast is also evaluated inside those batches (the field
   *    fills in, reading as "computing"). A monotonic build token + the chunk
   *    cancellers guarantee a stale build never paints over a newer toggle/date.
   */
  private renderSiteMetricOverlay(): void {
    const viewer = this.viewer;
    const metric = this.siteMetricActive;
    const origin = this.overlayOrigin();
    this.clearSiteMetricOverlay();                 // also cancels in-flight chunks
    if (!viewer || !metric || !origin) return;

    const seq = ++this.siteMetricBuildSeq;         // this build's token
    const radius = this.siteMetricRadiusM();
    const base = this.formaTerrainBaseHeight;

    // §CESIUM-PERF-METRIC-TEXTURE-CACHE — a previously-computed field for this exact
    // (metric · origin · day · radius) can be re-painted directly, skipping the whole
    // raster (and, for sun-hours/daylight, the chunked raycast). Sun-day only affects
    // sun-hours, but folding it into every key is harmless (it's constant for the rest).
    const cacheKey = this.siteMetricCacheKey(metric, origin, radius);
    const cachedTex = this.siteMetricTextureCache.get(cacheKey);
    if (cachedTex) {
      this.paintMetricTexture(cachedTex, metric, origin, base, 0.16);
      console.log(`[CesiumViewport][site-metric] ${metric} heatmap: REUSED cached texture ${cachedTex.size}×${cachedTex.size} (no recompute) for key ${cacheKey}.`);
      return;
    }
    // §SITE-METRIC-TEXTURE — the heatmap renders as ONE geographic ground rectangle
    // (paintMetricTexture builds its own Cartographic bounds from the origin), so no
    // per-cell ENU matrix is needed here any more.
    const footprints = this.siteMetricFootprints(origin);
    // §SITE-METRIC-TEXTURE (founder 2026-06-30, ADR-0086) — UNIVERSAL smooth render.
    // EVERY metric (temperature/wind/population/daylight/sunHours) now DISPLAYS as ONE
    // bilinearly-interpolated ground texture instead of one Cesium ENTITY per cell. The
    // per-cell entity cap is GONE, so the display is arbitrarily fine + smooth (no
    // blocky cells) regardless of the compute cell size — the founder's "cells are
    // massive" applies to temperature too, and the cap was why shrinking the cell size
    // alone didn't help. We rasterise from whatever cells a metric produced (in RGB
    // space off each cell's own `colorHex`, so every existing ramp + legend is honoured)
    // and finish the chunked build by painting that single texture once.
    const finishTexture = (
      cells: ReadonlyArray<MetricGridCell>,
      cellSizeM: number,
      label: string,
    ): void => {
      if (seq !== this.siteMetricBuildSeq) return;     // a newer toggle/date superseded
      const tex = rasterizeMetricTexture(cells, radius, cellSizeM);
      // §CESIUM-PERF-METRIC-TEXTURE-CACHE — remember the finished field so a later
      // switch back to this metric re-paints it without recomputing.
      this.siteMetricTextureCache.set(cacheKey, tex);
      this.paintMetricTexture(tex, metric, origin, base, 0.16);
      console.log(`[CesiumViewport][site-metric] ${metric} heatmap: smooth texture ${tex.size}×${tex.size} (≈${((2 * tex.radiusM) / tex.size).toFixed(1)} m/texel) from ${tex.sampleCount}/${cells.length} cell(s), radius ${radius.toFixed(0)} m (chunked${label ? `, ${label}` : ''}).`);
    };

    try {
      const legend = siteMetricLegend(metric, this.climateOverlayDataset);
      const legendTitle = legend ? legend.title : '';
      if (metric === 'sunHours') {
        // §SITE-METRIC-SUN-TEXTURE — DECOUPLE DISPLAY from COMPUTE. Sun-hours raycasts
        // PER CELL × sun-sample × prism, so a FINE compute grid freezes the viewport
        // ("§perf cell-cap … clamping 5.0→8.1 m"). We COMPUTE the intensity field on the
        // affordable COARSE raycast grid (batched across frames so it never blocks), then
        // DISPLAY it through the SAME universal fine texture (≈10× finer than the compute
        // cells) — fine/smooth like the cheap metrics, no raycast hang.
        const budget = siteMetricGridBudget('sunHours');
        const prep = prepareSunHoursGrid({
          radius,
          footprints,
          dataset: null,
          heightAboveGround: 0.16,
          cellSizeM: budget.cellSizeM,
          maxCells: budget.maxCells,
          latDeg: origin.lat,
          lngDeg: origin.lon,
          sunDay: this.siteMetricSunDay,
          sunStepMinutes: 25,        // sane cadence for the heaviest metric
        });
        if (!prep) return;

        // The existing synchronous chunked raycast — the FALLBACK when the worker is
        // unavailable / errors (behaviour identical to before the worker landed). Compute
        // the coloured cells across frames; the texture is built ONCE at the end.
        const paintFromChunkedRaycast = (): void => {
          const sunCells: MetricGridCell[] = [];
          this.chunkBuild(seq, prep.cells.length, 220, (lo, hi) => {
            for (let i = lo; i < hi; i++) {
              const cell = prep.evaluate(prep.cells[i] as SunHoursCell);
              if (cell) sunCells.push(cell);
            }
          }, () => finishTexture(sunCells, prep.cellSizeM, legendTitle));
        };

        // §PERF-SUNHOURS-WORKER (L-143 / L-160c, ADR-0110) — run the heavy per-cell raycast
        // OFF the main thread when the worker is live, so navigating / toggling the 3D site
        // view never freezes on the ~1 min raycast. The worker computes byte-identical
        // intensities (same BVH + sun samples); we then paint them through the SAME ramp via
        // `cellFromIntensity`. A superseded toggle/date is dropped by the seq guard; any
        // worker failure falls back to the synchronous chunked path (never worse than today).
        const pool = getSolarWorkerPool();
        if (pool.isReady()) {
          const validIdx: number[] = [];
          const probes: SunProbe[] = [];
          for (let i = 0; i < prep.cells.length; i++) {
            const c = prep.cells[i] as SunHoursCell;
            // Mirror evaluateIntensity's null mask: skip cells under a mass / outside the
            // round analysis disc (they contribute no field value).
            if (c.underBuilding || Math.hypot(c.x, c.z) > prep.radiusM * 1.02) continue;
            validIdx.push(i);
            probes.push({ east: c.x, north: c.z, up: 0.5 });
          }
          pool.computeIntensities(probes, footprints, {
            latDeg: origin.lat, lngDeg: origin.lon, sunDay: this.siteMetricSunDay, stepMinutes: 25,
          }).then((intensities) => {
            if (seq !== this.siteMetricBuildSeq) return;   // a newer toggle/date superseded
            const sunCells: MetricGridCell[] = [];
            for (let k = 0; k < validIdx.length; k++) {
              const cell = prep.cellFromIntensity(prep.cells[validIdx[k]!] as SunHoursCell, intensities[k] ?? null);
              if (cell) sunCells.push(cell);
            }
            finishTexture(sunCells, prep.cellSizeM, `${legendTitle}, worker`);
          }).catch((e) => {
            if (isSolarSuperseded(e) || seq !== this.siteMetricBuildSeq) return;
            console.warn('[CesiumViewport][site-metric] §PERF-SUNHOURS-WORKER sun-hours worker failed — chunked fallback:', e);
            paintFromChunkedRaycast();
          });
          return;
        }
        paintFromChunkedRaycast();
        return;
      }

      if (metric === 'daylight') {
        // §SITE-METRIC-DAYLIGHT-VSC — per-cell sky sweep against the context prisms
        // (heavy like sun-hours, so COMPUTE stays chunked on the expensive-tier budget);
        // DISPLAY through the same universal smooth texture so it isn't blocky either.
        const budget = siteMetricGridBudget('daylight');
        const prep = prepareDaylightVscGrid({
          radius,
          footprints,
          dataset: null,
          heightAboveGround: 0.16,
          cellSizeM: budget.cellSizeM,
          maxCells: budget.maxCells,  // the sweep stays chunked
        });
        if (!prep) return;
        const vscCells: MetricGridCell[] = [];
        this.chunkBuild(seq, prep.cells.length, 220, (lo, hi) => {
          for (let i = lo; i < hi; i++) {
            const cell = prep.evaluate(prep.cells[i] as DaylightVscCell);
            if (cell) vscCells.push(cell);
          }
        }, () => finishTexture(vscCells, budget.cellSizeM, legendTitle));
        return;
      }

      // Cheap O(1) field metrics (temperature/wind/population): the whole-grid pure build
      // is fast, so COMPUTE on a fine grid; DISPLAY through the universal texture so the
      // result is smooth + uncapped (the old per-cell entity cap left temperature blocky
      // at ~2.5 m even with a small cell-size number). §SITE-METRIC-CLIMATE-FALLBACK —
      // pass lat/lon so temperature/wind synthesise bundled regional normals when the
      // live ClimateStore dataset is still null.
      const cheapBudget = siteMetricGridBudget(metric);
      // §ANALYSIS-REAL-* (ADR-0095) — peek the REAL free-dataset cache (NASA POWER
      // climate + WorldPop population) synchronously; kick an async fetch that repaints
      // this exact metric when the real data lands. When the cache is empty/failed the
      // real* fields are undefined → the pure builder degrades honestly (temperature
      // uses bundled normals labelled "estimate"; population uses the OSM proxy pattern;
      // NO synthetic radial fallback). Non-fatal by construction.
      this.kickRealSiteData(metric, origin);
      const realClim = peekRealClimateBaseline(origin.lat, origin.lon);
      const realPop = peekRealPopulationSample(origin.lat, origin.lon);
      const cells: MetricGridCell[] = buildSiteMetricGrid(metric, {
        radius,
        footprints,
        dataset: this.climateOverlayDataset,
        heightAboveGround: 0.16,
        cellSizeM: cheapBudget.cellSizeM,
        maxCells: cheapBudget.maxCells,
        latDeg: origin.lat,
        lngDeg: origin.lon,
        ...(realClim ? {
          realBaselineTempC: realClim.warmAirTempC,
          realWindMeanMs: realClim.windMeanMs,
          realWindFromDeg: realClim.windFromDeg,
        } : {}),
        ...(realPop ? { realPopulationPerHa: realPop.personsPerHa } : {}),
      });
      finishTexture(cells, cheapBudget.cellSizeM, legendTitle);
    } catch (e) {
      console.warn('[CesiumViewport][site-metric] overlay failed:', e);
    }
  }

  /**
   * §ANALYSIS-REAL-POPULATION + §ANALYSIS-REAL-TEMPERATURE + §ANALYSIS-REAL-WIND
   * (ADR-0095) — kick the async REAL free-dataset fetches (NASA POWER climate + WorldPop
   * population) for the site, and repaint the ACTIVE metric once real data lands so the
   * heatmap upgrades from the labelled estimate to real values in place. De-duped per
   * rounded lat/lon (the fetchers cache + de-dupe in-flight; this guard just avoids
   * scheduling a redundant repaint). NON-FATAL: a fetch failure resolves null and the
   * metric simply stays in its honest estimate state (no synthetic fallback). Only the
   * cheap climate/population metrics consume real data; sun-hours/daylight are pure
   * geometry and skip this.
   */
  private kickRealSiteData(metric: SiteMetric, origin: { lat: number; lon: number }): void {
    if (metric !== 'temperature' && metric !== 'wind' && metric !== 'population') return;
    const key = `${origin.lat.toFixed(2)},${origin.lon.toFixed(2)}`;
    // Climate (temperature + wind) — one NASA POWER request.
    if (metric === 'temperature' || metric === 'wind') {
      if (!peekRealClimateBaseline(origin.lat, origin.lon) && !this.realDataKickedClimate.has(key)) {
        this.realDataKickedClimate.add(key);
        void fetchRealClimateBaseline(origin.lat, origin.lon).then((r) => {
          if (r && this.siteMetricActive && (this.siteMetricActive === 'temperature' || this.siteMetricActive === 'wind')) {
            this.renderSiteMetricOverlay();
          }
        }).catch(() => { /* non-fatal — fetcher already logged */ });
      }
    }
    // Population — WorldPop gridded density.
    if (metric === 'population') {
      if (!peekRealPopulationSample(origin.lat, origin.lon) && !this.realDataKickedPop.has(key)) {
        this.realDataKickedPop.add(key);
        void fetchRealPopulationSample(origin.lat, origin.lon).then((r) => {
          if (r && this.siteMetricActive === 'population') this.renderSiteMetricOverlay();
        }).catch(() => { /* non-fatal — fetcher already logged */ });
      }
    }
  }

  /**
   * §SITE-METRIC-TEXTURE (founder 2026-06-30, ADR-0086) — paint ANY metric's rasterised
   * field as ONE smooth ground rectangle (a single draw call) instead of thousands of
   * discrete polygon entities. This is the UNIVERSAL render for every metric: removing
   * the per-cell entity cap is what lets temperature (and all others, not just
   * sun-hours) display fine + smooth instead of blocky. The texture's RGBA is wrapped in
   * a canvas and used as an `ImageMaterialProperty`; the rectangle is the analysis
   * disc's 2R×2R bounding square centred on the site origin (north-up ENU ≈ cartographic
   * at this scale — the metric grid uses true `eastNorthUpToFixedFrame`, no project-north
   * spin). Texels outside the round disc carry alpha 0, so the visible field is the
   * Forma-style circle. The single entity joins `siteMetricEntities`, so
   * `clearSiteMetricOverlay` removes it like any other heatmap layer. Span-free (a
   * private render helper; the compute path's `rasterizeMetricTexture` carries the
   * §-tagged breadcrumb).
   */
  private paintMetricTexture(
    tex: MetricTexture,
    metric: SiteMetric,
    origin: { lat: number; lon: number },
    base: number,
    up: number,
  ): void {
    const viewer = this.viewer;
    if (!viewer) return;
    // RGBA → canvas (ImageMaterialProperty accepts an HTMLCanvasElement directly).
    const canvas = document.createElement('canvas');
    canvas.width = tex.size;
    canvas.height = tex.size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Build the ImageData via the canvas (its backing buffer is a plain ArrayBuffer,
    // sidestepping the Uint8ClampedArray<ArrayBufferLike> vs ImageDataArray overload).
    const img = ctx.createImageData(tex.size, tex.size);
    img.data.set(tex.rgba);
    ctx.putImageData(img, 0, 0);
    // ±R metres → degrees about the origin (north-up). E/W widens by cos(lat).
    const R = tex.radiusM;
    const dLat = (R / 111_320);
    const dLon = R / (111_320 * Math.max(0.05, Math.cos((origin.lat * Math.PI) / 180)));
    // §SITEFRAME-GROUND (C12 §9 T1) — when REAL relief is attached the heatmap must DRAPE on the
    // terrain mesh, not hover on the ONE flat centroid plane (where the surrounding relief rises
    // above the plane and occludes it → the faint heatmap the founder saw with terrain ON). We
    // clamp the rectangle to ground (a terrain-classified ground primitive that carries the image
    // material), so it paints ONTO the relief. On the keyless / un-baked / ellipsoid path there is
    // no relief to occlude it, so we keep the exact flat `height: base + up` placement (no regression).
    const drape = this.groundReliefAttached();
    const ent = viewer.entities.add({
      name: `pryzm-site-metric-${metric}`,
      rectangle: {
        coordinates: Cesium.Rectangle.fromDegrees(
          origin.lon - dLon, origin.lat - dLat,
          origin.lon + dLon, origin.lat + dLat,
        ),
        ...(drape
          ? {
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
              classificationType: Cesium.ClassificationType.TERRAIN,
            }
          : { height: base + up }),
        material: new Cesium.ImageMaterialProperty({
          image: canvas,
          transparent: true,
        }),
      },
    });
    this.siteMetricEntities.push(ent);
    try { viewer.scene.requestRender(); } catch { /* viewer gone */ }
  }

  /**
   * Drive a [0,total) range in `batch`-sized chunks, one chunk per deferred tick, so
   * the heavy build never blocks a frame. Each chunk bails if a newer build (`seq`)
   * superseded it; `requestRender` after each chunk reveals the field progressively;
   * `onDone` runs after the last chunk. Cancellers are tracked for clear/dispose.
   */
  private chunkBuild(
    seq: number,
    total: number,
    batch: number,
    work: (lo: number, hi: number) => void,
    onDone: () => void,
  ): void {
    const viewer = this.viewer;
    const step = (start: number): void => {
      if (seq !== this.siteMetricBuildSeq || !this.viewer || this.viewer !== viewer) return;
      const end = Math.min(total, start + batch);
      try { work(start, end); } catch (e) { console.warn('[CesiumViewport][site-metric] chunk failed:', e); }
      try { viewer.scene.requestRender(); } catch { /* viewer gone */ }
      if (end < total) {
        const cancel = deferWork(() => step(end), 0);
        this.siteMetricChunkCancellers.push(cancel);
      } else {
        onDone();
      }
    };
    if (total <= 0) { onDone(); return; }
    step(0);
  }

  /** Remove the site-metric heatmap entities + cancel any in-flight chunked build. */
  private clearSiteMetricOverlay(): void {
    // Invalidate any in-flight chunk callbacks + cancel their pending timers.
    this.siteMetricBuildSeq++;
    for (const cancel of this.siteMetricChunkCancellers) { try { cancel(); } catch { /* ignore */ } }
    this.siteMetricChunkCancellers = [];
    const viewer = this.viewer;
    if (viewer) {
      for (const e of this.siteMetricEntities) { try { viewer.entities.remove(e); } catch { /* gone */ } }
    }
    this.siteMetricEntities = [];
  }

  /**
   * §CESIUM-PERF-METRIC-TEXTURE-CACHE — a stable key for the rasterised heatmap of a
   * (metric · origin · sun-day · radius). Origin is rounded to ~1 m (5 decimals) so a
   * sub-metre camera/framing jitter reuses the cache; a real re-location changes it.
   * The sun-day is folded in for every metric (constant for the non-sun ones — cheap +
   * harmless), so a day change only ever misses the sun-hours key.
   */
  private siteMetricCacheKey(
    metric: SiteMetric,
    origin: { lat: number; lon: number },
    radius: number,
  ): string {
    return `${metric}|${origin.lat.toFixed(5)},${origin.lon.toFixed(5)}|${this.siteMetricSunDay}|r${Math.round(radius)}|${this.siteMetricGeometrySig()}`;
  }

  /**
   * §PERF-SUNHOURS-NO-RECOMPUTE (L-143) — a cheap signature of the OCCLUDER GEOMETRY that
   * feeds the heatmap (OSM context + the massing), folded into the texture cache key so a
   * cached field is reused iff the geometry is unchanged. This is the "geometry-hash" half
   * of the (geometry · sun-params · date/location · resolution) cache contract: an ordinary
   * camera orbit/zoom changes NONE of these, so `renderSiteMetricOverlay` re-runs from a
   * camera move only ever REPAINTS the cached texture — it NEVER re-runs the raycast. The
   * signature changes only when the context set is genuinely refetched (a >1.1 km pan moves
   * `contextBuildingsAt` + swaps the feature set) or the massing is re-placed at a new
   * area/origin — exactly the cases where the sun-hours field truly differs. Deliberately
   * cheap (no ring projection) so it costs nothing on a cache hit.
   */
  private siteMetricGeometrySig(): string {
    const ctx = this.lastContextCollection;
    const at = this.contextBuildingsAt;
    const ctxSig = ctx
      ? `c${ctx.features.length}@${at ? `${at.lat.toFixed(4)},${at.lon.toFixed(4)}` : '?'}`
      : 'c0';
    const o = this.formaMassingOrigin;
    const massSig = o ? `m${Math.round(o.areaM2)}` : 'm0';
    return `${ctxSig}|${massSig}`;
  }

  /**
   * §PERF-SUNHOURS-NO-RECOMPUTE (L-143) — a byte-stable signature of everything the façade
   * sun-hours study depends on: the site origin, the DESIGNED building geometry (its
   * boundary/wall/slab identity + total storey height), the OCCLUDER set
   * (`siteMetricGeometrySig`), and the analysis sun-day. An unchanged signature ⇒ an
   * identical façade result ⇒ `renderFacadeAnalysis` can skip the per-point raycast. Cheap
   * (no ring reconstruction): the massing identity is proxied by the input's
   * boundary/wall/slab counts + endpoints + the storey-band height stack — any real
   * re-author (re-place, re-locate, add storeys, new context) changes at least one term.
   */
  private facadeAnalysisKey(origin: { lat: number; lon: number }): string {
    const inp = this.formaLastMassingInput;
    const b = inp?.boundary ?? null;
    const bSig = b && b.length > 0
      ? `b${b.length}:${b[0]!.x.toFixed(1)},${b[0]!.z.toFixed(1)}:${b[b.length - 1]!.x.toFixed(1)},${b[b.length - 1]!.z.toFixed(1)}`
      : 'b0';
    const wSig = `w${inp?.walls?.length ?? 0}`;
    const sSig = `s${inp?.slabs?.length ?? 0}`;
    let heightM = 0;
    for (const band of this.formaStoreyBands) {
      const top = (band.baseElevation || 0) + (band.heightM || 0);
      if (top > heightM) heightM = top;
    }
    // §FACADE-STUDY-SUBJECT (L-596) — the SUBJECT and the envelope's own identity are part of the
    // study's identity, so switching subject (or re-resolving the envelope to a new ring/height)
    // MISSES this key and recomputes. ⚠ This EXTENDS the §PERF-SUNHOURS-NO-RECOMPUTE cache; it
    // does not defeat it: with the subject unchanged the key is byte-identical to before, so every
    // existing repaint that short-circuited still short-circuits.
    // C58 §1.14 — the envelope's identity for the study cache is the tallest volume-claiming solid's
    // ring + height (the study subject), derived the SAME way the façade study resolves it.
    const envStudy = envelopeStudyInputFromSolids(inp?.envelope);
    const envSig = envStudy && envStudy.ring.length
      ? `e${envStudy.ring.length}:${(envStudy.maxHeightM ?? 0).toFixed(1)}:${envStudy.ring[0]!.x.toFixed(1)},${envStudy.ring[0]!.z.toFixed(1)}`
      : 'e0';
    return `${this.facadeStudySubject}|${envSig}|${origin.lat.toFixed(5)},${origin.lon.toFixed(5)}|${bSig}|${wSig}|${sSig}|h${heightM.toFixed(1)}|${this.siteMetricSunDay}|${this.siteMetricGeometrySig()}`;
  }

  /** §CESIUM-PERF-METRIC-TEXTURE-CACHE — drop every cached heatmap texture. Called
   *  when the site location / massing origin moves (all keys go stale). A sun-day
   *  change is handled by the key itself, so it does NOT need to flush here. */
  private invalidateSiteMetricTextureCache(): void {
    if (this.siteMetricTextureCache.size > 0) {
      this.siteMetricTextureCache.clear();
    }
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

  /**
   * §SITE-METRIC-HEATMAP-LARGER (founder 2026-06-28) — the analysis DISC radius for
   * the metric ground heatmap.
   *
   * §SITE-METRIC-RADIUS-DECOUPLE (founder 2026-06-29, ADR-0079) — the disc is an
   * INDEPENDENT analysis extent, NOT a function of the overlay/camera framing. The old
   * `overlayRadiusM()*2` made the disc track the massing-area framing (≈115 m in prod),
   * so it shrank/grew with the view instead of covering a fixed neighbourhood. We now
   * default to a fixed `DEFAULT_SITE_METRIC_RADIUS_M` (≥ 230 m — at least DOUBLE the
   * old default), overridable per-session via `siteMetricRadiusOverrideM`, and floored
   * at the massing-derived extent so a very large plot still gets full coverage. Still
   * CLAMPED to the OSM context coverage (±CONTEXT_BBOX_HALF_DEG bbox) so cells never
   * spill into an empty no-context zone. The arcs/streaks overlays keep `overlayRadiusM`.
   */
  private siteMetricRadiusM(): number {
    // Independent default (decoupled from camera/overlay framing); a large plot can
    // still widen it via the massing-derived `overlayRadiusM()*2` floor.
    const wantBase = this.siteMetricRadiusOverrideM ?? DEFAULT_SITE_METRIC_RADIUS_M;
    const want = Math.max(wantBase, this.overlayRadiusM() * 2);
    // Context bbox half-extent in metres (N/S is uniform — the binding/smaller
    // coverage, since E/W is widened by latitude in contextBboxAround).
    const contextHalfM = CONTEXT_BBOX_HALF_DEG * 111_320; // deg latitude → m
    // Leave a ~10% margin inside the context edge so cells always sit on real context.
    const coverageCap = Math.max(DEFAULT_SITE_METRIC_RADIUS_M, contextHalfM * 0.9);
    return Math.min(Math.max(DEFAULT_SITE_METRIC_RADIUS_M, want), coverageCap);
  }

  /**
   * §SITE-METRIC-RADIUS-DECOUPLE — set an explicit analysis-disc radius (m) for the
   * metric heatmap (null = the decoupled default). Clamped + repainted on change so a
   * future "analysis radius" slider can drive it directly. Idempotent.
   */
  public setSiteMetricRadiusOverride(radiusM: number | null): void {
    const next = radiusM != null && Number.isFinite(radiusM) && radiusM > 0
      ? Math.max(40, Math.min(2000, radiusM))
      : null;
    if (next === this.siteMetricRadiusOverrideM) return;
    this.siteMetricRadiusOverrideM = next;
    if (this.siteMetricActive) this.renderSiteMetricOverlay();
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

  /**
   * §L-430 slice 2b — the site ENU frame with θ (project→true north) applied, for placing a
   * whole rigid model (glTF) rather than individual points.
   *
   * WHY A MATRIX AND NOT PER-VERTEX: a placed model must rotate its POSITION AND ITS HEADING
   * TOGETHER. Rotating position alone leaves the building correctly sited but facing the
   * wrong way — which reads as a modelling error rather than a frame bug, and is therefore
   * easy to misdiagnose for a long time. Baking θ into the placement matrix makes the two
   * inseparable by construction.
   *
   * SIGN — derived, not guessed. It must agree with the massing's per-point mapping exactly,
   * or the real GLB and the pastel massing blocks separate (the §A.21.D54 / §GLOBE-HEADING-90
   * defect class this file already fights):
   *     sceneXZToEnu(1, 0, θ) = { east: cosθ, north: −sinθ }   // scene +X in the true frame
   *     Rz(α) · (1, 0)        = ( cosα,       sinα        )
   *   ⇒ α = −θ
   * The ENU frame's local axes are X=east, Y=north, Z=up, so this is a rotation about local Z
   * post-multiplied INSIDE the ENU frame — i.e. applied to the model before Cesium's own glTF
   * axis correction, exactly where the massing applies it to its points.
   *
   * θ = 0 ⇒ the rotation is the identity and the returned matrix is byte-identical to a bare
   * `eastNorthUpToFixedFrame(position)`.
   */
  private enuFrameWithProjectNorth(position: Cesium.Cartesian3): Cesium.Matrix4 {
    const m = Cesium.Transforms.eastNorthUpToFixedFrame(position);
    const theta = this.readProjectNorthRad();
    if (theta === 0) return m;
    return Cesium.Matrix4.multiplyByMatrix3(m, Cesium.Matrix3.fromRotationZ(-theta), m);
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
    this.clearSiteMetricOverlay();
    // §FORMA-FACADE-ANALYSIS — drop the façade quads too (massing re-render / dispose).
    this.clearFacadeAnalysis();
  }

  /** Re-draw whichever climate overlays are currently toggled ON (called after a
   *  massing re-place / location / terrain change so they track the plot). */
  private refreshActiveClimateOverlays(): void {
    if (this.climateOverlayOn.sunPath) this.renderSunPathOverlay();
    if (this.climateOverlayOn.wind) this.renderWindOverlay();
    if (this.climateOverlayOn.heat) this.renderHeatOverlay();
    if (this.siteMetricActive) this.renderSiteMetricOverlay();
    // §FORMA-FACADE-ANALYSIS — re-paint the façade study on the freshly-placed massing
    // (it tracks the building footprint/heights, which just changed).
    if (this.facadeAnalysisOn && this.siteMetricActive === 'sunHours') this.renderFacadeAnalysis();
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
   * §A.21.D49 — place the REAL, FULL-FIDELITY PRYZM model (the actual BIM scene —
   * walls with their CSG openings, windows, doors, roof, slabs, in the app's real
   * materials) on the PHOTOREAL globe, INSTEAD of the simplified Forma massing
   * (pastel/white extruded blocks).
   *
   * WHY a glTF model primitive and not the `CesiumThreeBridge` overlay:
   * The editor renders the BIM scene with the **WebGPU** renderer; Cesium renders
   * **WebGL** on its own canvas which `setVisible(true)` raises ABOVE and HIDES the
   * BIM canvases. The `CesiumThreeBridge` only re-parents + camera-syncs the main
   * THREE scene — it owns no canvas/renderer of its own, so its overlay is never
   * actually drawn on the (raised) Cesium surface, and it assumes WebGL not WebGPU.
   * Rebuilding the elements as Cesium polygons is exactly the Forma massing we are
   * replacing. The renderer-agnostic bridge is **glTF**: we serialise the live BIM
   * THREE scene to GLB (`exportFragmentsToGLB`, real meshes + materials) and load it
   * as a native `Cesium.Model` scene primitive. Cesium depth-tests it against the
   * Google 3D-Tiles natively, so it occludes/seats correctly on the tiles, and the
   * WebGPU↔WebGL split is sidestepped entirely.
   *
   * Placement reuses the EXACT photoreal anchoring the massing uses: one
   * `eastNorthUpToFixedFrame` at the site origin, seated at `formaTerrainBaseHeight`
   * (the v50 `sampleHeightMostDetailed` tile clamp — already resolved by the massing
   * pass that runs alongside this). Orientation matches the established
   * `loadBimGltf` convention (bare ENU frame; Cesium handles the glTF Y-up→Z-up).
   *
   * Fully guarded + best-effort: any failure leaves the (already-rendered) massing
   * in place as the fallback and returns false. Never throws.
   *
   * @returns true if the real model primitive was added; false on any failure (the
   *   caller then keeps the Forma massing as the fallback).
   */
  public async renderRealModelOnGlobe(input: {
    glbUrl: string;
    originLat: number;
    originLon: number;
    /** Override base height; defaults to the tile-clamped `formaTerrainBaseHeight`. */
    baseHeight?: number;
  }): Promise<boolean> {
    const viewer = this.viewer;
    if (!viewer) {
      console.warn('[CesiumViewport][globe] renderRealModelOnGlobe before mount — ignored.');
      return false;
    }
    if (!input.glbUrl) {
      console.warn('[CesiumViewport][globe] renderRealModelOnGlobe: no GLB url — ignored.');
      return false;
    }
    // §CESIUM-REALMODEL-TOKEN — claim this placement; a rapid re-toggle that starts
    // AFTER us bumps the token, so our post-await guard drops this now-stale build.
    const myToken = ++this.realModelOnGlobeToken;
    try {
      // Keep the photoreal sun-driven shadows on (same as the keepPhotoreal massing
      // path) so the real model grounds itself on the tiles.
      try {
        viewer.shadows = true;
        const sm = viewer.scene.shadowMap;
        if (sm) { sm.enabled = true; sm.softShadows = true; }
      } catch (e) {
        console.warn('[CesiumViewport][globe] shadow setup failed (non-fatal):', e);
      }

      // §FIX-GLOBE-REAL-MODEL-UNDERGROUND-CLAMP (L-198) — PRE-await base for the initial
      // matrix handed to `fromGltfAsync`. This is re-evaluated AFTER the parse (below) so a
      // photoreal-tile clamp that settles DURING the async GLB parse is honoured — otherwise
      // the model lands at the stale pre-await base (~0 → ~707 m underground in elevated
      // cities) and the reseat-on-settle misses it (the primitive isn't assigned yet).
      const baseHeight = CesiumViewport.resolveGlobeRealModelBaseHeight(
        input.baseHeight,
        this.formaTerrainBaseHeight,
      );

      // ONE ENU frame at the site origin, seated at the tile-clamped base height —
      // the SAME anchor the massing uses, so the real model lands exactly where the
      // pastel blocks did (and ON the tiles via the v50 clamp).
      //
      // §A.21.D54 / §GLOBE-HEADING-90 — PRECISE LOCATION + HEADING. The Forma massing
      // places each scene point with `enu · (x, −z, up)` — i.e. the explicit mapping
      // scene→ENU is (east = x, north = −z, up = y). For the real glTF model to
      // coincide with the massing (founder: massing is correctly located, the real
      // model is rotated + off-position), Cesium's INTERNAL glTF axis conversion must
      // produce the SAME mapping.
      //
      // Cesium builds its axis-correction as
      //   correction = (upAxis===Y ? Y_UP_TO_Z_UP) · (forwardAxis===Z ? Z_UP_TO_X_UP)
      // (ModelUtility.getAxisCorrectionMatrix). The PREVIOUS `forwardAxis: Z` therefore
      // applied the EXTRA Z_UP_TO_X_UP turn, giving scene→ENU = (east = z, north = x) —
      // a +90° heading rotation about up vs the massing. That is exactly the founder's
      // "rotated wrong + lands in the wrong place" defect (the rotation about the ENU
      // origin throws every non-origin vertex off-position).
      //
      // The mapping we WANT is the massing's (east = x, north = −z, up = y), which is
      // precisely `Y_UP_TO_Z_UP` ALONE: (x, y, z) ↦ (x, −z, y). We get that by using
      // `upAxis: Y` and NOT triggering the forward turn — i.e. `forwardAxis: X` (only
      // `forwardAxis === Z` adds Z_UP_TO_X_UP). Verified: scene+x→east, scene+z→south
      // (north = −z), scene+y→up — identical to `toCartesian(x, z, up)`.
      const position = Cesium.Cartesian3.fromDegrees(input.originLon, input.originLat, baseHeight);
      const modelMatrix = this.enuFrameWithProjectNorth(position); // §L-430 θ

      // Same option shape as the established `loadBimGltf` path (Cesium depth-tests
      // scene primitives against the loaded 3D-Tiles natively → correct occlusion).
      // §GLOBE-HEADING-90 — upAxis=Y + forwardAxis=X = Y_UP_TO_Z_UP only, so the ENU
      // mapping matches the massing's (east=x, north=−z, up=y) and the model is
      // true-north-aligned (NOT the prior 90°-rotated forwardAxis=Z).
      const newModel = await Cesium.Model.fromGltfAsync({
        url: input.glbUrl,
        modelMatrix,
        scale: 1.0,
        allowPicking: true,
        upAxis: Cesium.Axis.Y,
        forwardAxis: Cesium.Axis.X,
      });

      // A re-toggle may have torn the viewer down while the GLB parsed — bail.
      // §CESIUM-REALMODEL-TOKEN — also bail if a NEWER placement superseded us while
      // the GLB parsed (`myToken` stale) or the viewer is no longer live: the newer
      // call owns the primitive, so adding ours would duplicate / leave a stale model.
      if (!this.viewer || myToken !== this.realModelOnGlobeToken || !this.isViewerLive()) {
        if (!newModel.isDestroyed()) newModel.destroy();
        return false;
      }

      // Replace any prior real-model primitive (dedup) + revoke its blob URL.
      this.clearRealModelOnGlobe();

      // §FIX-GLOBE-REAL-MODEL-UNDERGROUND-CLAMP (L-198) — RE-EVALUATE the base AFTER the
      // async GLB parse. The photoreal-tile clamp (`commitPhotorealBase`) can settle a
      // materially different ground height (e.g. 0 → 706.9 m) DURING `fromGltfAsync` above;
      // the pre-await `baseHeight` would then bury the model ~707 m under the tiles. Re-read
      // the tile-clamped SSOT here (unless the caller pinned an explicit finite override) and
      // re-seat the primitive's matrix so it lands FLUSH on the tiles the massing sits on.
      const seatBase = CesiumViewport.resolveGlobeRealModelBaseHeight(
        input.baseHeight,
        this.formaTerrainBaseHeight,
      );
      const seatPosition = Cesium.Cartesian3.fromDegrees(input.originLon, input.originLat, seatBase);
      if (Math.abs(seatBase - baseHeight) > 1e-3) {
        // §L-446 — MUST be enuFrameWithProjectNorth, NOT the raw ENU frame.
        //
        // This re-seat rebuilds the matrix from scratch, so a raw `eastNorthUpToFixedFrame`
        // here SILENTLY DISCARDS the project-north rotation applied when the model was first
        // placed above. The model then renders in PROJECT space on a TRUE-north globe — i.e.
        // rotated by θ against the real world — while the parcel void, boundary and massing
        // (which take the θ-aware path) stay correctly aligned. That is exactly the reported
        // defect: the building sits skewed inside its own correctly-oriented plot.
        //
        // It is also VERTICALLY CONDITIONAL (`> 1e-3`), which is why it presents as
        // intermittent: on flat ground seatBase == baseHeight, the branch never runs, and the
        // orientation is correct. It only corrupts when the terrain clamp moves — so a bug
        // report depends on the site's ground, not on the code path being exercised.
        newModel.modelMatrix = this.enuFrameWithProjectNorth(seatPosition);
      }

      // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — THE VERTICAL INVARIANT, applied to the
      // REAL model too. If the tile-height clamp has NOT yet measured the ground, `seatBase` is
      // still the initial 0 (the WGS-84 ellipsoid — ~49 m below MSL in the Balearics), so the
      // GLB would land underground. Add it HIDDEN; `commitPhotorealBase` re-seats it (via
      // `reseatRealModelOnGlobe`) and reveals it the moment the datum resolves. Never a silent 0.
      const holdForGround = this.globeGroundUnknownWhileTilesShown();
      if (holdForGround) {
        newModel.show = false;
        this.globeBuildingHiddenForGround = true;
      }

      this.realModelOnGlobe = newModel;
      this.realModelOnGlobeUrl = input.glbUrl;
      this.realModelOnGlobeOrigin = { lat: input.originLat, lon: input.originLon };
      this.viewer.scene.primitives.add(newModel);
      this.viewer.scene.requestRender();

      this.logGlobeAnchorEvidence(
        'renderRealModelOnGlobe',
        input.originLat,
        input.originLon,
        seatBase,
        seatPosition,
      );
      console.log(
        `[CesiumViewport][globe] §A.21.D49 REAL model placed on photoreal tiles ` +
          `at LAT ${input.originLat.toFixed(6)} LON ${input.originLon.toFixed(6)} base ` +
          `${seatBase.toFixed(2)} m ELLIPSOIDAL` +
          `${holdForGround ? ' — HELD HIDDEN until the tile ground datum resolves (L-259)' : ''}.`,
      );
      return true;
    } catch (err) {
      console.warn('[CesiumViewport][globe] §A.21.D49 renderRealModelOnGlobe failed (keeping massing fallback):', err);
      return false;
    }
  }

  /**
   * §A.21.D49 — drop the real-model-on-globe primitive (if any) and revoke its
   * backing object URL. Safe to call when nothing is placed.
   */
  public clearRealModelOnGlobe(): void {
    try {
      if (this.realModelOnGlobe && this.viewer) {
        this.viewer.scene.primitives.remove(this.realModelOnGlobe);
        if (!this.realModelOnGlobe.isDestroyed()) this.realModelOnGlobe.destroy();
      }
    } catch {
      /* already gone */
    }
    this.realModelOnGlobe = null;
    this.realModelOnGlobeOrigin = null;
    if (this.realModelOnGlobeUrl) {
      try { URL.revokeObjectURL(this.realModelOnGlobeUrl); } catch { /* not a blob url */ }
      this.realModelOnGlobeUrl = null;
    }
  }

  /**
   * §FIX-GLOBE-REENTRY-MODEL-LOST (L-186) — TRUE only when the real detailed PRYZM model is
   * CURRENTLY live on the photoreal globe (present and not destroyed). The globe placement
   * caller (GISAreaLayout §CESIUM-PERF-GLOBE-GLB-CACHE) skips the costly GLB re-export when the
   * building geometry is unchanged AND a model is "already placed" — but the Forma "3D Site"
   * study path calls `clearRealModelOnGlobe()` (it renders massing with keepPhotoreal:false),
   * DESTROYING this primitive. After a globe→forma→globe round-trip the caller's own "placed"
   * flag is stale-true while the primitive is gone, so it short-circuited to an EMPTY globe (the
   * founder's "house lost on re-entry"). Gating the reuse on this live check forces a re-place
   * when the model was actually cleared. Public, Cesium-free read.
   */
  public hasRealModelOnGlobe(): boolean {
    return this.realModelOnGlobe != null && !this.realModelOnGlobe.isDestroyed();
  }

  /**
   * §FIX-GLOBE-REENTRY-MODEL-LOST (L-186) — PURE decision for the globe real-model perf cache:
   * reuse the already-placed model (skip the GLB re-export) ONLY when the building signature is
   * unchanged, a model was placed, AND that model is STILL LIVE on the globe (`modelPresent`).
   * The last conjunct is the fix: a model destroyed by a Forma round-trip must be RE-PLACED, not
   * assumed present. No I/O, deterministic → P8 span-exempt (pure). Unit-tested.
   */
  static shouldReuseGlobeRealModel(
    signature: string | null,
    lastSignature: string | null,
    placed: boolean,
    modelPresent: boolean,
  ): boolean {
    return (
      modelPresent &&
      placed &&
      lastSignature !== null &&
      signature === lastSignature
    );
  }

  /**
   * §FIX-GLOBE-REAL-MODEL-UNDERGROUND-CLAMP (L-198) — PURE resolution of the base height
   * the REAL detailed model seats at on the photoreal-tiles globe. Prefers an explicit,
   * FINITE caller override; otherwise the tile-clamped ground base (`formaTerrainBaseHeight`).
   *
   * ROOT of L-198: `renderRealModelOnGlobe` captured the base BEFORE its `await
   * Cesium.Model.fromGltfAsync(...)`. The photoreal-tile clamp (`commitPhotorealBase`,
   * base e.g. 706.9 m in Madrid) settles asynchronously and can resolve DURING that GLB
   * parse; the reseat-on-settle (renderFormaMassing → reseatRealModelOnGlobe) then finds
   * `realModelOnGlobe` still null (assigned only after the await) and skips, so the model
   * was placed at the stale pre-await base (~0 = ellipsoid/sea-level → ~707 m underground)
   * and never re-seated. The fix RE-EVALUATES this reduction AFTER the parse so a clamp
   * that settled mid-parse is honoured. No I/O, deterministic → P8 span-exempt (pure).
   * Unit-tested (globe real-model base resolution).
   */
  static resolveGlobeRealModelBaseHeight(
    explicitBase: number | undefined,
    clampedBase: number,
  ): number {
    return typeof explicitBase === 'number' && Number.isFinite(explicitBase)
      ? explicitBase
      : clampedBase;
  }

  /**
   * §A.21.D49 — re-seat the already-placed real model at the CURRENT
   * `formaTerrainBaseHeight` (cheap modelMatrix update, no GLB reload). Called when
   * the async photoreal tile clamp settles after the model was first placed at a
   * stale base. No-op when no real model is placed.
   */
  private reseatRealModelOnGlobe(): void {
    const model = this.realModelOnGlobe;
    const origin = this.realModelOnGlobeOrigin;
    if (!model || !origin || model.isDestroyed()) return;
    try {
      const position = Cesium.Cartesian3.fromDegrees(origin.lon, origin.lat, this.formaTerrainBaseHeight);
      model.modelMatrix = this.enuFrameWithProjectNorth(position); // §L-430 θ
      this.viewer?.scene.requestRender();
    } catch (e) {
      console.warn('[CesiumViewport][globe] §A.21.D49 reseatRealModelOnGlobe failed (non-fatal):', e);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // FORMA.6 — REAL FULL-FIDELITY building on the FORMA flat-ground study view
  // ════════════════════════════════════════════════════════════════════════
  //
  // The founder asked for "in Forma view the same as the 3D globe tiles view —
  // the building/elements coming from the PRYZM WebGPU scene" with FULL element
  // fidelity. The §A.21.D49 globe path already does exactly this for the photoreal
  // globe; FORMA.6 brings the SAME glTF bridge to the Forma flat-ground STUDY view
  // (Forma directional light / soft shadows / AO + flat warm-grey ground hit the
  // real meshes), via a SEPARATE tracked primitive so the two views never clobber
  // each other.
  //
  // SAME bridge as the globe (renderer-agnostic across the WebGPU↔WebGL split):
  // the caller serialises the live BIM THREE scene to GLB (`exportFragmentsToGLB`,
  // file-format — owns the THREE access, P2-safe) and hands us the blob URL. We
  // load it as a native `Cesium.Model` at the SAME single `eastNorthUpToFixedFrame`
  // anchor + `formaTerrainBaseHeight` terrain clamp the massing uses, with the SAME
  // explicit Y-up / Z-forward axes (§A.21.D54) so it lands exactly where the pastel
  // massing did — at the boundary, upright, metres, true-north-aligned.

  /**
   * FORMA.6 — set the FORMA study building fidelity ('real' = full PRYZM model,
   * 'massing' = abstract pastel volumes). Default is 'real'. When switching to
   * 'massing', the real-model primitive is dropped + the massing blocks are
   * re-shown (re-rendered from the last input). Switching to 'real' leaves the
   * massing up until the caller re-exports + calls `renderRealModelOnForma`
   * (the massing is the graceful fallback while the GLB exports).
   */
  public setFormaBuildingFidelity(fidelity: 'massing' | 'real'): void {
    if (fidelity !== 'massing' && fidelity !== 'real') {
      console.warn(`[CesiumViewport][forma6] setFormaBuildingFidelity: bad value ${String(fidelity)} — ignored.`);
      return;
    }
    if (this.formaBuildingFidelity === fidelity) return;
    this.formaBuildingFidelity = fidelity;
    console.log(`[CesiumViewport][forma6] building fidelity → ${fidelity}.`);
    if (fidelity === 'massing') {
      // Drop the real model + bring the abstract massing back (re-render the last
      // input, no re-fly / no re-clamp — cheap toggle).
      this.clearRealModelOnForma();
      const input = this.formaLastMassingInput;
      if (input && !input.keepPhotoreal) {
        this.renderFormaMassing({ ...input, frameCentroid: false, _skipTerrainClamp: true });
      }
    }
    // → 'real': the caller (GISAreaLayout) re-exports the GLB and calls
    // renderRealModelOnForma; the massing stays as the fallback until then.
  }

  /** FORMA.6 — current Forma study building fidelity. */
  public getFormaBuildingFidelity(): 'massing' | 'real' {
    return this.formaBuildingFidelity;
  }

  /**
   * FORMA.6 — load the REAL full-fidelity PRYZM model (the live BIM THREE scene
   * serialised to GLB) onto the FORMA flat-ground study at the site ENU origin,
   * replacing the abstract massing blocks. Mirrors `renderRealModelOnGlobe` but:
   *   • seats at `formaTerrainBaseHeight` (the Forma terrain clamp, NOT the
   *     photoreal-tile clamp), so it sits on the SAME flat warm-grey ground as the
   *     massing;
   *   • tracks a SEPARATE primitive (`realModelOnForma`) so the photoreal globe
   *     overlay and the study overlay never collide.
   *
   * Fully guarded + best-effort: any failure leaves the (already-rendered) massing
   * in place as the fallback and returns false. Never throws.
   *
   * No-op (returns false) when fidelity is 'massing' (caller chose the study look).
   *
   * @returns true if the real model primitive was added; false on any failure (the
   *   caller then keeps the Forma massing as the fallback).
   */
  public async renderRealModelOnForma(input: {
    glbUrl: string;
    originLat: number;
    originLon: number;
    /** Override base height; defaults to the Forma terrain-clamped `formaTerrainBaseHeight`. */
    baseHeight?: number;
  }): Promise<boolean> {
    const viewer = this.viewer;
    if (!viewer) {
      console.warn('[CesiumViewport][forma6] renderRealModelOnForma before mount — ignored.');
      return false;
    }
    if (this.formaBuildingFidelity !== 'real') {
      console.log('[CesiumViewport][forma6] fidelity is "massing" — skipping real-model placement.');
      return false;
    }
    if (!input.glbUrl) {
      console.warn('[CesiumViewport][forma6] renderRealModelOnForma: no GLB url — ignored.');
      return false;
    }
    // §CESIUM-REALMODEL-TOKEN — claim this placement; a rapid re-toggle that starts
    // AFTER us bumps the token, so our post-await guard drops this now-stale build.
    const myToken = ++this.realModelOnFormaToken;
    try {
      const baseHeight =
        typeof input.baseHeight === 'number' && Number.isFinite(input.baseHeight)
          ? input.baseHeight
          : this.formaTerrainBaseHeight;

      // SAME single ENU anchor + axis convention as the massing (and the globe real
      // model, §A.21.D54 / §GLOBE-HEADING-90): scene→ENU is (east = x, north = −z,
      // up = y). Cesium's correction is Y_UP_TO_Z_UP·(forwardAxis===Z ? Z_UP_TO_X_UP);
      // forwardAxis=X (NOT Z) gives Y_UP_TO_Z_UP alone = (x, y, z) ↦ (x, −z, y), the
      // massing mapping exactly. forwardAxis=Z added a spurious +90° heading turn.
      const position = Cesium.Cartesian3.fromDegrees(input.originLon, input.originLat, baseHeight);
      const modelMatrix = this.enuFrameWithProjectNorth(position); // §L-430 θ

      const newModel = await Cesium.Model.fromGltfAsync({
        url: input.glbUrl,
        modelMatrix,
        scale: 1.0,
        allowPicking: true,
        upAxis: Cesium.Axis.Y,
        forwardAxis: Cesium.Axis.X,
        // Cast soft shadows onto the flat Forma ground (Forma shadowMap is on).
        shadows: Cesium.ShadowMode.ENABLED,
      });

      // A re-toggle may have torn the viewer down while the GLB parsed — bail.
      // §CESIUM-REALMODEL-TOKEN — also bail if a NEWER placement superseded us while
      // the GLB parsed (`myToken` stale) or the viewer is no longer live: the newer
      // call owns the primitive, so adding ours would duplicate / leave a stale model.
      if (!this.viewer || myToken !== this.realModelOnFormaToken || !this.isViewerLive()) {
        if (!newModel.isDestroyed()) newModel.destroy();
        return false;
      }
      // The user may have flipped to 'massing' while the GLB parsed — bail.
      if (this.formaBuildingFidelity !== 'real') {
        if (!newModel.isDestroyed()) newModel.destroy();
        return false;
      }

      // Replace any prior Forma real-model primitive (dedup) + revoke its blob URL.
      this.clearRealModelOnForma();

      this.realModelOnForma = newModel;
      this.realModelOnFormaUrl = input.glbUrl;
      this.realModelOnFormaOrigin = { lat: input.originLat, lon: input.originLon };
      this.viewer.scene.primitives.add(newModel);

      // Hide the abstract massing blocks so the two don't double-render (keep the
      // storey-band metadata + selector intact).
      this.clearFormaMassingEntitiesOnly();
      // Re-apply the current floor filter to the freshly placed model.
      this.applyFormaRealModelFloorFilter();
      this.viewer.scene.requestRender();

      console.log(
        `[CesiumViewport][forma6] REAL full-fidelity model placed on the Forma study ` +
          `at LAT ${input.originLat.toFixed(6)} LON ${input.originLon.toFixed(6)} base ${baseHeight.toFixed(2)} m.`,
      );

      // §FIX-FACADE-ANALYSIS-ON-REAL-MODEL (L-177, founder-escalated) — if the sun-hours
      // façade study was already ON (showing the ENVELOPE PRISM because no real model was
      // placed yet), REBUILD it now that the real GLB exists so the analysis DRAPES onto the
      // real house and the prism is dropped. The study inputs (origin/geometry/occluders/day)
      // are unchanged, so the memo key matches — force a rebuild by nulling it first, else
      // the no-recompute guard would keep the stale envelope prism.
      if (this.facadeAnalysisOn && this.siteMetricActive === 'sunHours') {
        this.facadeAnalysisLastKey = null;
        this.renderFacadeAnalysis();
      }
      return true;
    } catch (err) {
      console.warn('[CesiumViewport][forma6] renderRealModelOnForma failed (keeping massing fallback):', err);
      return false;
    }
  }

  /**
   * FORMA.6 — drop the Forma real-model primitive (if any) and revoke its backing
   * object URL. Safe to call when nothing is placed.
   */
  public clearRealModelOnForma(): void {
    try {
      if (this.realModelOnForma && this.viewer) {
        this.viewer.scene.primitives.remove(this.realModelOnForma);
        if (!this.realModelOnForma.isDestroyed()) this.realModelOnForma.destroy();
      }
    } catch {
      /* already gone */
    }
    this.realModelOnForma = null;
    this.realModelOnFormaOrigin = null;
    // §FIX-FACADE-ANALYSIS-ON-REAL-MODEL — the drape shader lived on the now-destroyed
    // model; clear the flag so a re-placed model / re-toggle rebuilds the drape cleanly.
    this.facadeDrapingRealModel = false;
    if (this.realModelOnFormaUrl) {
      try { URL.revokeObjectURL(this.realModelOnFormaUrl); } catch { /* not a blob url */ }
      this.realModelOnFormaUrl = null;
    }
  }

  /**
   * FORMA.6 — re-seat the already-placed Forma real model at the CURRENT
   * `formaTerrainBaseHeight` (cheap modelMatrix update, no GLB reload). Called when
   * the async terrain clamp settles after the model was first placed at a stale
   * base. No-op when no Forma real model is placed.
   */
  private reseatRealModelOnForma(): void {
    const model = this.realModelOnForma;
    const origin = this.realModelOnFormaOrigin;
    if (!model || !origin || model.isDestroyed()) return;
    try {
      const position = Cesium.Cartesian3.fromDegrees(origin.lon, origin.lat, this.formaTerrainBaseHeight);
      model.modelMatrix = this.enuFrameWithProjectNorth(position); // §L-430 θ
      this.viewer?.scene.requestRender();
    } catch (e) {
      console.warn('[CesiumViewport][forma6] reseatRealModelOnForma failed (non-fatal):', e);
    }
  }

  /**
   * FORMA.6 — honour the multi-floor visibility filter (`setVisibleFormaLevels`)
   * for the real model. The GLB is a SINGLE primitive (no per-storey nodes exposed
   * here), so partial-floor filtering can't slice it the way the per-storey massing
   * is sliced. We therefore degrade gracefully: when a PARTIAL filter is active
   * (some-but-not-all storeys), hide the whole real model and fall back to the
   * per-storey massing (which IS sliceable); when the filter is "show all"
   * (null/empty), show the real model. This keeps the floor selector meaningful
   * without faking per-storey slicing of a monolithic GLB.
   *
   * @returns true if the real model should remain the visible representation;
   *   false if it was hidden in favour of the sliceable massing.
   */
  private applyFormaRealModelFloorFilter(): boolean {
    const model = this.realModelOnForma;
    if (!model || model.isDestroyed()) return false;
    const showAll = realModelStaysVisible(this.formaVisibleLevels, this.formaStoreyBands.length);
    // §FORMA-FACADE-VISIBLE — while façade analysis is suppressing the building's own
    // materials, the real model stays HIDDEN regardless of the floor filter (only the
    // sun-hours texture reads). The show-all return value is preserved so callers still
    // know the filter is "show all" (they clear the massing blocks accordingly).
    model.show = showAll && !this.facadeSuppressingMassing;
    if (!showAll) {
      console.log(
        '[CesiumViewport][forma6] partial floor filter active — hiding the monolithic real model, ' +
          'showing the sliceable massing for the selected storeys.',
      );
    }
    this.viewer?.scene.requestRender();
    return showAll;
  }

  /**
   * §FORMA-FULL-HEIGHT (ADR-0095) — resolve the TRUE total building height (metres above
   * the ground plane) from every signal the massing input carries, so a tower whose
   * authored `walls` collapse to a single ground band still extrudes + paints full-height.
   * MAX over:
   *   • the explicit `fullBuildingHeightM` override (caller-supplied), if finite/positive;
   *   • the tallest storey band's top (baseElevation + heightM) — the current behaviour;
   *   • every slab `topElevation` (a per-floor plate → its top is that storey's ceiling);
   *   • every roof `baseElevation + thickness` (the capping level);
   *   • the placed real model's bounding-sphere height (2 × radius is an upper bound; we
   *     use the sphere DIAMETER only as a last-resort ceiling so we never UNDER-shoot a
   *     tall GLB, but never let it BALLOON the massing — clamped to ≤ 4× the band top).
   * Pure read; guarded. Returns the resolved height (≥ the tallest band top).
   */
  private resolveFullBuildingHeight(
    input: Parameters<CesiumViewport['renderFormaMassing']>[0],
    bands: ReadonlyArray<{ baseElevation: number; heightM: number }>,
  ): number {
    let bandTop = 0;
    for (const b of bands) {
      const top = (b.baseElevation || 0) + (b.heightM || 0);
      if (top > bandTop) bandTop = top;
    }
    let full = bandTop;
    const bump = (h: number | undefined): void => {
      if (typeof h === 'number' && Number.isFinite(h) && h > full) full = h;
    };
    if (typeof input.fullBuildingHeightM === 'number' && Number.isFinite(input.fullBuildingHeightM)) {
      bump(input.fullBuildingHeightM);
    }
    for (const s of input.slabs ?? []) bump((s.topElevation || 0));
    for (const r of input.roofs ?? []) bump((r.baseElevation || 0) + (r.thickness || 0));
    // Real-model bounding sphere → an approximate full height; only used to RAISE a
    // collapsed single-band massing, and clamped so a wide-but-short model can't inflate.
    try {
      const model = this.realModelOnForma && !this.realModelOnForma.isDestroyed()
        ? this.realModelOnForma
        : (this.realModelOnGlobe && !this.realModelOnGlobe.isDestroyed() ? this.realModelOnGlobe : null);
      const bs = model ? (model as unknown as { boundingSphere?: Cesium.BoundingSphere }).boundingSphere : null;
      if (bs && Number.isFinite(bs.radius) && bs.radius > 0 && bandTop > 0) {
        // A slab/wall footprint half-diagonal is baked into the sphere radius, so the
        // model height ≲ 2r; only apply it when it clearly exceeds the band top and cap
        // the lift to a sane multiple so nothing balloons.
        const approxModelH = Math.min(bs.radius * 2, bandTop * 4);
        if (approxModelH > full * 1.2) full = approxModelH;
      }
    } catch { /* best-effort */ }
    return full > 0 ? full : bandTop;
  }

  /**
   * §FORMA-FULL-HEIGHT (ADR-0095) — when the authored bands top out MATERIALLY below the
   * resolved full building height (the perf-capped tall-tower case = a SINGLE ground band),
   * TILE the ground band's footprint upward into evenly-stacked storey bands (each the same
   * height as the ground band) until the stack reaches `fullHeightM`. The synthesised bands
   * reuse the ground band's walls (so the shell prism re-extrudes the SAME footprint) and
   * carry no `levelId` (they're massing-only). Mutates `bands` in place. No-op when the bands
   * already reach the full height (authored multi-storey buildings), or when there is no
   * usable ground band footprint. Guarded.
   */
  private tileBandsToFullHeight(
    bands: Array<{
      baseElevation: number;
      heightM: number;
      levelId?: string;
      walls: Array<{ a: { x: number; z: number }; b: { x: number; z: number }; height: number; thickness: number }>;
    }>,
    fullHeightM: number,
  ): void {
    if (!(fullHeightM > 0) || bands.length === 0) return;
    let bandTop = 0;
    for (const b of bands) {
      const top = (b.baseElevation || 0) + (b.heightM || 0);
      if (top > bandTop) bandTop = top;
    }
    // Already tall enough (authored multi-storey) → nothing to do. 0.75 m slack absorbs
    // rounding so we don't tile a building that's essentially already full-height.
    if (bandTop >= fullHeightM - 0.75) return;
    const ground = bands[0]!;
    const storeyH = ground.heightM > 0.5 ? ground.heightM : 3;
    // Start stacking from the current top; cap the count so a bad height can't spawn
    // thousands of bands (safety — 200 storeys is well beyond any real building).
    const MAX_TILED_STOREYS = 200;
    let elev = bandTop;
    let added = 0;
    while (elev < fullHeightM - 0.75 && added < MAX_TILED_STOREYS) {
      const h = Math.min(storeyH, fullHeightM - elev);
      if (!(h > 0.1)) break;
      bands.push({
        baseElevation: elev,
        heightM: h,
        levelId: undefined, // massing-only synthesised storey (not an authored level)
        walls: ground.walls, // reuse the ground footprint → same perimeter prism
      });
      elev += h;
      added++;
    }
    if (added > 0) {
      bands.sort((p, q) => p.baseElevation - q.baseElevation);
      console.log(
        `[CesiumViewport][forma] §FORMA-FULL-HEIGHT tiled ${added} massing storey band(s) ` +
          `(${storeyH.toFixed(1)} m each) up to full building height ${fullHeightM.toFixed(1)} m ` +
          `— shell + façade now span the whole tower (was a single ${bandTop.toFixed(1)} m stub).`,
      );
    }
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
    /**
     * §NO-PHANTOM-MASSING (L-447) — emit a nominal 3 m band when there are NO walls?
     *
     * Only the caller can answer: it is the one that can see slabs and roofs, and therefore
     * whether "no walls" means "a slab-only building" (massing legitimately stands for something)
     * or "nothing authored at all" (any massing is a phantom drawn over the parcel). Defaults to
     * `true` so no other call site changes behaviour.
     */
    allowNominalBand = true,
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
    // §NO-PHANTOM-MASSING (L-447) — ⚠ THIS IS THE "WHITE VOLUME" THE FOUNDER REPORTED 3 TIMES.
    //
    // The old behaviour, and its own comment said so plainly: "no walls at all → one nominal
    // ground band, so an empty/boundary-only scene still extrudes a single 3 m block from the
    // footprint". That block is a BUILDING THAT DOES NOT EXIST, drawn over the parcel — and
    // `tileBandsToFullHeight` then stacked it to the resolved full height (founder console:
    // `0 wall(s) across 2 storey(s) [#0@0.0m·3.0m, #1@3.0m·1.0m]`).
    //
    // It is precisely what the founder asked to be rid of, three times: *"we don't need this
    // white volume — we need the site boundary on 3d site + the buildable volume."* And it is
    // worse than clutter: an opaque white pad over the plot is the thing that reads as "here is
    // your building" on an EMPTY project, and it sits between the viewer and the two things that
    // are actually true there — the parcel boundary and the buildable envelope.
    //
    // A nominal band is still emitted when the project HAS authored building geometry that
    // simply is not walls (a slab-only or roof-only scene), because there the massing legitimately
    // stands for something. `allowNominalBand` is decided by the caller, which is the only place
    // that can see slabs and roofs. Consumers already guard `bands.length === 0` (the draw loop,
    // `resolveFullBuildingHeight`, `tileBandsToFullHeight`), so an empty list is safe.
    if (bands.length === 0 && allowNominalBand) {
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

    // FORMA.6 — when the REAL full-fidelity model is the active representation, the
    // GLB is monolithic (no per-storey slicing here). Apply the filter to the model:
    //   • "show all" → keep the real model visible (and don't re-create massing).
    //   • partial filter → hide the real model + fall through to the per-storey
    //     massing render below (which IS sliceable) so the selected storeys still
    //     show. Re-selecting "all" re-shows the real model + clears the massing.
    if (this.realModelOnForma && !this.realModelOnForma.isDestroyed()) {
      const realStaysVisible = this.applyFormaRealModelFloorFilter();
      if (realStaysVisible) {
        // Show-all: the real model covers it; drop any massing blocks shown for a
        // prior partial filter so they don't double-render over the model.
        this.clearFormaMassingEntitiesOnly();
        return;
      }
      // Partial filter: real model hidden; render the sliceable massing for the
      // selected storeys (fall through).
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
    /** §A.21.D40#1 — false on the sunk ground floor: drop the buried bottom face
     *  so it does not cast the mirror shadow (see the footprint-mass path). */
    closeBottom = true,
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
            closeBottom,
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
   * §A.21.D-SHELL-RING — pick the FLOOR-PLATE (slab) outer ring that best matches a
   * storey band's base elevation, used as the perimeter-ring FALLBACK when the
   * wall-loop reconstruction can't close (the source of the old "perimeter ring
   * unavailable — falling back to per-wall boxes" log + the loose per-wall look).
   *
   * A generated house authors one floor slab per storey whose OUTER ring IS the
   * shell footprint, so extruding that ring gives the SAME clean single-polygon
   * silhouette as a reconstructed wall loop. We match by elevation: a slab's
   * `topElevation` is the storey's floor plane, so the slab nearest the band's
   * `baseElevation` is that storey's plate. Returns the ring (≥3 pts) or null when
   * there are no usable slabs (→ caller drops to per-wall boxes).
   */
  private slabRingForBand(
    slabs: ReadonlyArray<{ ring: ReadonlyArray<{ x: number; z: number }>; topElevation: number }>,
    bandBaseElevation: number,
  ): Array<{ x: number; z: number }> | null {
    let best: ReadonlyArray<{ x: number; z: number }> | null = null;
    let bestD = Infinity;
    for (const s of slabs) {
      if (!s.ring || s.ring.length < 3) continue;
      const d = Math.abs((s.topElevation ?? 0) - bandBaseElevation);
      if (d < bestD) { bestD = d; best = s.ring; }
    }
    // Only accept a slab that plausibly belongs to THIS storey (its plate sits at
    // ~floor level): within one storey height (≈ 4 m) of the band base. A slab far
    // above/below is a different floor and would give the wrong footprint.
    if (!best || bestD > 4) return null;
    return best.map((p) => ({ x: p.x, z: p.z }));
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

    // Boundary trace (standard CLOCKWISE wall-follower). We start at the
    // hull-extreme node (guaranteed on the outer ring) and, at every node, take
    // the smallest clockwise turn from the reversed-incoming heading. This walks
    // the OUTER face of the planar graph and is robust to interior partitions:
    // an interior wall that tees INTO a perimeter node raises that node's degree,
    // but the clockwise rule keeps the trace hugging the outer boundary rather
    // than diving down the interior spur. §A.21.D50 — earlier code assumed
    // interior endpoints always land mid-span (creating no perimeter node); real
    // apartments routinely tee interior partitions AT perimeter corners, so we no
    // longer rely on that. The trace is then VALIDATED by CONTAINMENT (every graph
    // node lies inside/on the ring) — see below — so a wrong interior-face trace
    // self-rejects rather than render garbage.
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
    // §A.21.D50 — VALIDATE the trace is a genuine OUTER boundary, but DON'T assume
    // it covers most of the graph's nodes.
    //
    // ROOT CAUSE the old gate failed on: `getFormaWalls()` returns the ENTIRE wall
    // set — exterior shell AND every interior partition — so `adj.size` counts all
    // interior nodes too. A correct outer-boundary trace visits ONLY the perimeter
    // nodes, which in a real apartment is a minority of all nodes, so the old
    // `visited.size ≥ 60% of adj.size` gate rejected the (correct) ring and fell
    // back to per-wall boxes — the source of the "perimeter ring unavailable" log
    // and the mitre-less corner gaps.
    //
    // The TRUE invariant of an outer boundary is that it ENCLOSES every other graph
    // node (interior partition endpoints all lie inside the shell). So we validate
    // by containment, not by coverage: every snapped node must lie inside (or on)
    // the candidate ring. A wrong interior-face trace (which would leave some nodes
    // outside it) self-rejects → per-wall-box fallback. This is robust to any number
    // of interior partitions, L/U shells, and skewed plots.
    const RING_EPS_M = SNAP_M * 2; // on-edge tolerance (~10 cm) so perimeter nodes count as inside.
    const insideOrOn = (px: number, pz: number): boolean => {
      // Even-odd ray cast + an on-edge test (perimeter nodes sit exactly on the ring).
      let inside = false;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i]!.x, zi = ring[i]!.z;
        const xj = ring[j]!.x, zj = ring[j]!.z;
        // On-segment? (distance from point to segment ≤ tolerance) → treat as inside.
        const ex = xj - xi, ez = zj - zi;
        const len2 = ex * ex + ez * ez;
        if (len2 > 1e-12) {
          let t = ((px - xi) * ex + (pz - zi) * ez) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const cx = xi + t * ex, cz = zi + t * ez;
          if ((px - cx) * (px - cx) + (pz - cz) * (pz - cz) <= RING_EPS_M * RING_EPS_M) return true;
        }
        const intersects = (zi > pz) !== (zj > pz)
          && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi;
        if (intersects) inside = !inside;
      }
      return inside;
    };
    for (const c of coord.values()) {
      if (!insideOrOn(c.x, c.z)) return null; // a node outside the ring → not the outer boundary.
    }
    return ring;
  }

  /**
   * Polygon centroid (area-weighted) + absolute area of a scene-XZ ring,
   * returned in ENU metres. Used to frame the NW oblique camera on the plot centre
   * with an altitude ∝ √area, and to anchor terrain sampling.
   *
   * §L-430 slice 2b — takes θ (project→true north) and returns TRUE-north ENU.
   * Rotation is linear about the origin, so rotating the CENTROID is exactly equivalent
   * to rotating every vertex first and then taking the centroid; and |area| is
   * rotation-invariant, so the area term needs no correction. θ = 0 ⇒ the previous
   * `east = x, north = −z` mapping, unchanged.
   */
  private polygonCentroidAndAreaXZ(
    ring: ReadonlyArray<{ x: number; z: number }>,
    projectNorthRad = 0,
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
      return { ...sceneXZToEnu(ax, az, projectNorthRad), area: 0 };
    }
    cx /= 6 * signedArea;
    cz /= 6 * signedArea;
    return { ...sceneXZToEnu(cx, cz, projectNorthRad), area: Math.abs(signedArea) };
  }

  /**
   * FIX A.21.D28#2 — footprint centroid + area from the building's authored
   * geometry when no parcel boundary is drawn. Computes the XZ bounding box of
   * all wall endpoints (else all slab ring vertices), returning its centre +
   * area in ENU metres (`east = x`, `north = −z`, matching the placement frame).
   * Returns null when there is no usable geometry. The bounding box is a coarse
   * but ALWAYS-non-zero footprint — enough to frame the camera + scale the
   * climate-overlay radius onto the building instead of collapsing to the origin.
   *
   * §L-430 slice 2b — θ rotates the returned CENTRE onto true north. NOTE the deliberate
   * asymmetry: an axis-aligned bounding box is FRAME-DEPENDENT (the AABB of a shape in the
   * project frame is not the AABB of that shape in the true frame), so `area` here remains a
   * project-frame approximation. That is acceptable ONLY because both consumers — camera
   * framing distance and the climate-overlay radius — want a coarse "how big is this
   * roughly", never a compliance figure. Do NOT reuse this area for anything metric (GFA,
   * coverage, FAR); use `polygonCentroidAndAreaXZ`, whose area IS rotation-invariant.
   */
  private footprintBBoxXZ(
    walls: ReadonlyArray<{ a: { x: number; z: number }; b: { x: number; z: number } }>,
    slabs: ReadonlyArray<{ ring: ReadonlyArray<{ x: number; z: number }> }>,
    projectNorthRad = 0,
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
    return { ...sceneXZToEnu(cx, cz, projectNorthRad), area: w * d };
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
    // ADR-003 / P3 — `requestAnimationFrame` may only be called inside
    // `packages/frame-scheduler`. This is the canonical one-shot "next frame"
    // deferral, which `FrameScheduler.scheduleOnce()` exists to replace; the
    // 'overlay' phase is the C11 §6.1 slot for viewport/HUD work. When the pump
    // is not running (headless / before composeRuntime starts it) we fall back to
    // `deferWork(…, 0)` — also frame-scheduler-owned — so the second resize still
    // happens after layout flushes instead of being silently dropped.
    const secondPass = (): void => {
      // §GLOBE-CRASH-GUARD — the viewport can be disposed between this being
      // scheduled and firing; gate on isViewerLive() (destroyed-but-non-null safe).
      if (!this.isViewerLive()) return;
      try {
        this.viewer!.resize();
        this.viewer!.scene.requestRender();
      } catch { /* viewer torn down mid-frame */ }
    };
    const scheduler = getFrameScheduler();
    if (scheduler.isRunning) scheduler.scheduleOnce('cesium-force-resize', secondPass, 'overlay');
    else deferWork(secondPass, 0);
  }

  /**
   * §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1a) — force the viewer to
   * re-measure its container and re-render. Used when the multi-pane `PaneHost`
   * re-parents / re-sizes the single Cesium container into a PANE element (e.g. the
   * RIGHT pane) OUTSIDE the setVisible flow. Cesium's request-render loop does not
   * always re-measure the container on a pure CSS bounds / re-parent change, so this
   * reuses the same `forceResizeAndRender` path setVisible(true) uses. Safe /
   * idempotent (no-ops when the viewer is not live). This is the resize primitive
   * C59 §1.3 requires for hosting the ONE Cesium viewer in an arbitrary pane.
   */
  public reflowContainer(): void {
    this.forceResizeAndRender('external-reflow (multi-pane host)');
  }

  /**
   * §FEAT-MULTI-PANE-VIEW-SYSTEM (L-412, C59 Phase 1b) — RE-TARGET the single Cesium
   * container into an arbitrary PANE element (left/right), NEVER a second viewer.
   * Moves the ONE `#cesium-viewport-container` DOM node under `paneEl` (a plain
   * `appendChild` MOVES an already-parented node — it is not cloned), re-points the
   * mount-parent reference so any later re-mount/dispose targets the pane, and reflows
   * so the viewer re-measures the new pane's bounds.
   *
   * This is the seam that dissolves Cesium's `#container` hard-target (C59 §3): the
   * `PaneHost` hands Cesium a pane to mount into instead of the whole `#container`.
   * The container is `position:absolute; inset:0`, so it fills whatever positioned
   * pane it is placed in — the caller must give `paneEl` `position:relative|absolute`.
   * Idempotent: when the container already lives under `paneEl` it just reflows. Safe
   * before the viewer exists (the container node is created in the constructor).
   */
  public reparentContainerTo(paneEl: HTMLElement): void {
    if (!this.container) return;
    if (this.container.parentElement !== paneEl) {
      paneEl.appendChild(this.container); // moves the single node — no clone, no 2nd viewer.
      this.parent = paneEl;               // future (re)mount + dispose target the pane.
      console.log(
        `[gis][cesium] §L-412 reparentContainerTo #${paneEl.id || '(no-id)'} — ` +
        `single container re-targeted into a pane (no new viewer).`,
      );
    }
    this.reflowContainer();
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

    // §FEAT-VIEW-ACTIVATION-LOADING-OVERLAY (L-270) — NEVER HANG. A viewport torn down
    // mid-clamp means the ground-settle signal will never arrive. Say so honestly
    // (`settled:false`) so the loading overlay surfaces a failure with an escape, instead of
    // leaving the user behind an eternal spinner (L-250: a hang is invisible to a cost test).
    try { this.notifyGroundSettled(false); } catch { /* best-effort */ }

    // §CESIUM-PERF-METRIC-TEXTURE-CACHE — release the cached heatmap textures so a
    // disposed viewport doesn't retain their raster buffers.
    try { this.siteMetricTextureCache.clear(); } catch { /* ignore */ }

    // §CTX-QUERY-PANEL (L-592) / §CTX-USE-COLOUR (L-599) / §FACADE-STUDY-SUBJECT (L-596) — drop
    // the DOM chrome and the entity-keyed maps. These hold Cesium.Entity references, so leaving
    // them would retain a destroyed scene's objects across a project switch.
    try { this.closeContextBuildingQuery(); } catch { /* ignore */ }
    try {
      this.contextFeatureByEntity.clear();
      this.contextUseMaterialBackup.clear();
      if (this.contextUseLegendEl) { this.contextUseLegendEl.remove(); this.contextUseLegendEl = null; }
      this.setFacadeSubjectBadge(null);
    } catch { /* ignore */ }

    // FORMA.3 — drop any placed massing/boundary entities first.
    try {
      this.clearFormaMassing();
    } catch (e) {
      console.warn('[CesiumViewport] forma massing dispose failed:', e);
    }
    // §A.21.D49 — drop the real-model-on-globe primitive + revoke its blob URL so a
    // re-mounted viewport (project switch) starts clean.
    try {
      this.clearRealModelOnGlobe();
    } catch (e) {
      console.warn('[CesiumViewport] real-model-on-globe dispose failed:', e);
    }
    // FORMA.6 — drop the Forma study real-model primitive + revoke its blob URL.
    try {
      this.clearRealModelOnForma();
    } catch (e) {
      console.warn('[CesiumViewport] real-model-on-forma dispose failed:', e);
    }
    this.formaMassingOrigin = null;
    // A.21.D24 — drop all 3D climate overlays (sun-path/wind/heat) so they don't
    // leak across project switches; the toggle state is reset to off.
    try {
      this.clearAllClimateOverlays();
      this.climateOverlayOn = { sunPath: false, wind: false, heat: false };
      this.climateOverlayDataset = null;
      // §FORMA-FACADE-VISIBLE — reset the façade-analysis toggle + material-suppression
      // flag so a re-mounted viewport (project switch) starts with the normal building
      // materials visible and the study OFF (the entities were dropped just above).
      this.facadeAnalysisOn = false;
      this.facadeSuppressingMassing = false;
      this.facadeDrapingRealModel = false;
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
      // §SITEFRAME-GROUND-RESEAT (L-632) → §CTX-BUILDINGS-RENDER-FIRST (L-635) — the terrain-settle
      // re-seat listener is pulled, so there is no per-site listener/key to tear down here.
      // §A.21.D-GLOBE3 — re-detect photoreal tiles on the next mount (a re-mounted
      // viewport re-loads its tileset), so the context-suppression decision is fresh.
      this.photorealTilesActive = false;
      // §GLOBE-TILE-CLAMP-FLUSH — drop the tileset ref (the primitive is destroyed with
      // the viewer); a re-mounted viewport re-assigns it on tile load.
      this.photorealTileset = null;
    } catch (e) {
      console.warn('[CesiumViewport] context-building dispose failed:', e);
    }
    // FORMA.4 — reset the terrain-clamp cache so a re-mounted viewport (project
    // switch) re-samples ground height for the new site.
    this.formaTerrainBaseHeight = 0;
    this.formaTerrainSampledAt = null;
    this.formaTerrainToken++;
    // §TERRAIN-RENDER — a re-mounted viewer starts on the default flat ellipsoid again; forget
    // the attached city + the per-session 404 memory so the new site re-resolves + re-attaches.
    this.formaTerrainCity = null;
    this.formaTerrainAttach.clear();
    // §FIX-CESIUM-GLOBE-ELEVATION-AND-GEOREF (L-259) — a re-mounted viewport has measured
    // NOTHING: the ground datum is unknown again (and the tileset load hook belongs to the
    // destroyed tileset). Never let a stale "resolved" flag authorise anchoring at 0.
    this.globeGroundResolved = false;
    this.globeGroundSource = 'unresolved';
    this.globeBuildingHiddenForGround = false;
    this.photorealTilesLoadedHookAttached = false;
    // §GLOBE-FIRST-FRAME-BASE — clear any pending one-shot re-frame on dispose.
    this.formaReframeOnBaseSettle = null;
    // §GLOBE-FRAME-NO-JUMP — reset the per-open framing guards for a re-mounted viewport.
    this.formaInitialReframeFired = false;
    this.formaOffscreenRescueUsed = false;
    this.formaUserMovedCamera = false;
    this.formaProgrammaticFlyInFlight = false;
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

    // §FORMA-RENDER-ERROR-GUARD (ADR-0087) — drop the renderError subscription
    // before destroying the viewer so a re-mount installs a fresh one.
    if (this.renderErrorSub) {
      try {
        this.renderErrorSub();
      } catch (e) {
        console.warn('[CesiumViewport] renderError subscription dispose failed:', e);
      }
      this.renderErrorSub = null;
    }
    // §FIX-WEBGPU-DEVICE-LOSS-CESIUM-CASCADE (L-231) — drop the canvas context-loss listeners
    // before the viewer/canvas is destroyed so a re-mount installs a fresh guard on the new canvas.
    if (this.contextLossSub) {
      try {
        this.contextLossSub();
      } catch (e) {
        console.warn('[CesiumViewport] context-loss subscription dispose failed:', e);
      }
      this.contextLossSub = null;
    }
    this.formaPostProcessFaulted = false;
    // §FORMA-SCENE-QUALITY (ADR-0089) — drop the sky-gradient backdrop on dispose
    // so a re-mounted viewport starts from the container's original background.
    try { this.applyFormaSkyBackdrop(false); } catch { /* container already gone */ }

    if (this.viewer) {
      this.viewer.destroy();
      this.viewer = null;
    }

    // Reset the ready signal so a re-mount (project switch) re-arms whenReady().
    this.isReady = false;
    this.readyPromise = new Promise<void>((resolve) => { this.resolveReady = resolve; });
    // L-270 — a re-mounted viewport streams its tiles again from zero.
    this.lastGlobeTileQueue = 0;

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
   * §FEAT-SITE-ENTRY-GLOBE (L-593, C60 §4) — fly the ONE camera to an explicit WGS84
   * target. The whole public surface the site-entry stage machine needs.
   *
   * WHY THIS EXISTS AT ALL: the entry flow's camera port must not construct a viewer
   * (C59 §2 invariant 1) and must not reach into `viewer.camera` from a UI handler
   * (C59 §2 invariant 3). `flyToFormaSite()` is public but is anchored to a PLACED
   * MASSING — meaningless at globe scale, where nothing is placed — and
   * `frameSiteLocation()` is private and hard-codes the site altitude/pitch. So this is
   * the same primitive with the framing supplied by the caller's pure model
   * (`cameraForState`), which is where framing decisions belong.
   *
   * ⚠ It performs NO stage logic, NO coverage test and NO site write — it is a camera,
   * not a decision. C12: degrees + ellipsoid metres only; no ENU frame is assumed.
   * P3: `flyTo` is Cesium's own tween on the existing viewer render loop; nothing here
   * schedules a rAF.
   */
  public flyToGeographic(target: {
    lat: number;
    lon: number;
    altitudeM: number;
    pitchDeg: number;
    instant?: boolean;
  }): void {
    // §GLOBE-CRASH-GUARD — same gate as frameSiteLocation: a settle that lands after
    // disposal must no-op rather than touch a destroyed camera.
    if (!this.isViewerLive()) return;
    const viewer = this.viewer;
    if (!viewer) return;
    if (!Number.isFinite(target.lat) || !Number.isFinite(target.lon) || !Number.isFinite(target.altitudeM)) {
      console.warn('[CesiumViewport][site-entry] flyToGeographic: invalid target — ignored.', target);
      return;
    }
    const destination = Cesium.Cartesian3.fromDegrees(target.lon, target.lat, target.altitudeM);
    const orientation = {
      heading: 0,
      pitch: Cesium.Math.toRadians(target.pitchDeg),
      roll: 0,
    };
    if (target.instant) {
      viewer.camera.setView({ destination, orientation });
      return;
    }
    // §GLOBE-FRAME-NO-JUMP-2 — this is OUR programmatic motion, not the user grabbing
    // the camera; token-gate it so a superseded flight's `cancel` cannot clear the flag
    // out from under a newer one (see frameSiteLocation for the full rationale).
    const token = this.beginProgrammaticFly();
    const clear = (): void => { this.endProgrammaticFly(token); };
    try {
      viewer.camera.flyTo({ destination, orientation, duration: 1.6, complete: clear, cancel: clear });
    } catch (e) {
      clear();
      console.warn('[CesiumViewport][site-entry] flyToGeographic failed:', e);
    }
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

    // §L-430 — only the FALLBACK branch gets θ. `previousMatrix` is a clone of an
    // already-placed model's matrix and therefore ALREADY carries θ; re-applying it here
    // would double-rotate on every reload, compounding each time.
    const modelMatrix = previousMatrix || this.enuFrameWithProjectNorth(position);

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
        allowPicking: true,
        // §GLOBE-HEADING-90 — pin the massing's axis convention (Y_UP_TO_Z_UP only)
        // instead of Cesium's glTF default (which is forwardAxis=Z → a spurious +90°
        // heading turn). upAxis=Y + forwardAxis=X = scene (x,y,z) ↦ ENU (x,−z,y).
        upAxis: Cesium.Axis.Y,
        forwardAxis: Cesium.Axis.X,
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