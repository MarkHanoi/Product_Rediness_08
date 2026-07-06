// @pryzm/renderer-three — public barrel.
//
// PR 4.A.4 (Wave 4 Track A) introduces this package with a single
// inhabitant: `WorkspaceSurface` — the typed mount/dispose handle
// that backs `runtime.workspace.surface` and retires the
// `(window as any).platformShell.setProjectContext(...)` cast in
// `src/main.ts workspaceMount.show()`.
//
// Wave A15 S119 (P2 Class A+B closure): all three/examples/jsm addons
// and three/tsl types are now re-exported from this barrel so that every
// consumer imports from '@pryzm/renderer-three' instead of directly from
// three sub-paths.  The sole THREE importer in the monorepo remains
// `packages/renderer-three/src/three-re-export.ts`.
//
// Import order: WorkspaceSurface → THREE core → addons → TSL types

export {
  WorkspaceSurface,
  buildWorkspaceSurface,
  WorkspaceSurfaceNotMountedError,
  WorkspaceSurfaceDisposedError,
  type WorkspaceSurfaceHost,
} from './WorkspaceSurface.js';

// §FEAT-GROUND-SHADOW-CATCHER (ADR-0106) — invisible L0 shadow-catcher plane.
export {
  GroundShadowCatcher,
  GROUND_SHADOW_CATCHER_NAME,
  type GroundShadowCatcherOptions,
} from './GroundShadowCatcher.js';

// §FEAT-PROJECT-ORIGIN (L-109) — always-on blue-sphere project-origin marker.
export {
  ProjectOriginMarker,
  PROJECT_ORIGIN_MARKER_NAME,
  type ProjectOriginMarkerOptions,
} from './ProjectOriginMarker.js';

// §PERF-INSTANCE-MATERIAL-DEDUP (L-131 P6) — pure VISUAL-signature serializer used
// by the shared-material cache (core-app-model) so InstancedElementRenderer batches
// same-look elements into one draw call. Pure THREE-reading helper; no allocation.
export { materialInstanceSignature } from './materialSignature.js';

// ── three/examples/jsm addon re-exports ────────────────────────────────────
// Contract C04 §1.1 (P2): only packages/renderer-three/ may touch three sub-paths.

export { TransformControls } from './addons/TransformControls.js';
export type { TransformControlsEventMap } from './addons/TransformControls.js';

export { RGBELoader } from './addons/RGBELoader.js';

export { GLTFLoader } from './addons/GLTFLoader.js';
export type { GLTF } from './addons/GLTFLoader.js';

export { GLTFExporter } from './addons/GLTFExporter.js';
export type { GLTFExporterOptions } from './addons/GLTFExporter.js';

export { Sky } from './addons/Sky.js';

export { CSS2DRenderer, CSS2DObject } from './addons/CSS2DRenderer.js';
export type { CSS2DParameters } from './addons/CSS2DRenderer.js';

export { mergeGeometries, toCreasedNormals, mergeVertices } from './addons/BufferGeometryUtils.js';

export { EffectComposer, Pass } from './addons/postprocessing/EffectComposer.js';
export { RenderPass } from './addons/postprocessing/RenderPass.js';
export { UnrealBloomPass } from './addons/postprocessing/UnrealBloomPass.js';
export { OutputPass } from './addons/postprocessing/OutputPass.js';
export { GTAOPass } from './addons/postprocessing/GTAOPass.js';

// ── three/tsl type re-exports (WebGPU node graph — type-only) ──────────────
// Wave A15 S119 Class A2 closure: 7 TSL pipeline files previously imported
// directly from 'three/tsl'.

export type { PassNode, TSLNode, UniformNode } from './tsl-types.js';

// ── WebGL context loss / restoration ────────────────────────────────────────
// Wave A14 (S118) A14-T6: canonical helper for context-loss recovery.
// Contract C04 §1.4 — renderer-three is the sole THREE owner; recovery lives here.

export { setupContextLossHandlers } from './contextLossHandlers.js';
export type { ContextLossOptions } from './contextLossHandlers.js';

// ── RendererHandle interface + adapters ─────────────────────────────────────
// Wave A15 S121 (A15-T1, A15-T2): typed abstraction over THREE.WebGLRenderer
// and WebGPURenderer (P2 boundary).  All consumers MUST use RendererHandle;
// none may reach into THREE directly.  Contract C04 §1, §1.3.

export type { RendererHandle } from './RendererHandle.js';
export {
  WebGLRendererAdapter,
  type WebGLRendererAdapterOptions,
} from './adapters/WebGLRendererAdapter.js';

// ── Task 2.3 (2026-05-09) — WebGPU adapter + factory ────────────────────────
// C04 §1.4: packages/renderer-three/ MUST own the WebGPU → WebGL2 → WebGL1
// fallback chain and MUST log the selected backend at init time.

export {
  WebGPURendererAdapter,
  type WebGPURendererAdapterOptions,
} from './adapters/WebGPURendererAdapter.js';

export { RendererHandleFactory } from './RendererHandleFactory.js';

// ── Task 5.1 (2026-05-09) — Rendering pipeline + camera service ─────────────
// Migrated from src/engine/subsystems/rendering/ (C01 §3 LOC ratio target).
// P2 boundary: these were already renderer-only code — promotion to package.

export { RenderPipelineManager, type IViewSwitchListener } from './pipeline/RenderPipelineManager.js';
export type { PipelineStatus, PipelinePhase } from './pipeline/RenderPipelineManager.js';

export { createBackgroundUniform } from './pipeline/BackgroundUniform.js';
export type { BackgroundUniform, BgTheme } from './pipeline/BackgroundUniform.js';
export { DARK_BG_HEX, LIGHT_BG_HEX } from './pipeline/BackgroundUniform.js';

export type { OutlinePassResult } from './pipeline/OutlinePass.js';

export { createScenePass, MRT_OUTPUT, MRT_DIFFUSE, MRT_NORMAL, MRT_VELOCITY } from './pipeline/ScenePass.js';

export type { SSGIPassResult, SSGIQualityParams } from './pipeline/SSGIPass.js';

export type { TRAAFilterResult } from './pipeline/TRAAPass.js';

export { createZonePass, SCENE_LAYER, ZONE_LAYER } from './pipeline/ZonePass.js';

export { LTPENUCameraService, ltpEnuCameraService } from './LTPENUCameraService.js';
export type { GeospatialAdapterLike } from './LTPENUCameraService.js';

// B3: Typed renderer accessor — replaces `(world.renderer as any).three as any`.
export { getThreeRenderer } from './accessors.js';
export type { ObcRendererLike } from './accessors.js';

// §I2 — WebGPU-safe disposal helpers for the element-builder rebuild path.
// Builders MUST route material/geometry disposal through these so the WebGPU
// NodeManager `usedTimes` device-loss TypeError can never abort a rebuild().
// See ./safeDispose.ts and RenderPipelineManager._safeDisposeRenderPipeline (§I.2.1).
export {
  isUsedTimesDisposeError,
  isShaderCompileError,
  safeDisposeMaterial,
  safeDisposeMaterials,
  safeDisposeGeometry,
  safeDisposeObject3D,
  // §FIX-DELETED-TEXTURE-BIND — shared env/PBR texture disposal safety.
  safeDisposeTexture,
  detachTextureFromScene,
} from './safeDispose.js';

// C27 INS-α-7 — IsolationAnimator (subscribes to FrameScheduler + IsolationStateStore).
// DO NOT REMOVE — auto-fixer guard
export * from './IsolationAnimator.js';

// ── ADR-0074 P1b (C21 §10) — solar sun-hours analysis pass + heatmap overlay ──
// Additive + ISOLATED: a CPU-raycast occlusion pass over the building's roof/slab
// + wall meshes that paints a TOGGLEABLE per-vertex heatmap WITHOUT touching the
// normal render path. The P2 home for the geometry side of the sun-hours feature;
// reuses @pryzm/solar-analysis for the sun math + accumulation.
export {
  computeSunHoursOnModel,
  clearSunHoursOverlay,
  type ComputeSunHoursOptions,
  type ComputeSunHoursOnModelResult,
} from './solar/computeSunHoursOnModel.js';
export {
  DEFAULT_SUN_HOURS_RAMP,
  sampleRamp,
  sunHoursToColor,
  type RgbF,
  type RampStop,
} from './solar/heatmapRamp.js';
export { gridTriangle, type FaceGridOptions } from './solar/faceGrid.js';
// Pure UI-shared solar helpers (THREE-free): season presets, day-of-year + HH:MM
// labels for the solar control panel, and the exterior/glazing filter predicates.
export {
  SEASON_DAY_OF_YEAR,
  SEASON_LABEL,
  seasonToDayOfYear,
  clampDayOfYear,
  dayOfYearLabel,
  clampTimeMinutes,
  timeMinutesLabel,
  type SeasonPreset,
} from './solar/solarPresets.js';
export {
  isExteriorFace,
  isGlazingSurface,
  EXTERIOR_PROBE_EPS,
  UPWARD_NORMAL_Y,
  type GlazingDescriptor,
} from './solar/solarSurfaceFilter.js';
