/**
 * @pryzm/core-app-model — rendering sub-barrel (Sprint K 2026-05-10)
 * Extracted from src/engine/subsystems/core/rendering/
 * 26 files / 6717 LOC moved from src/ to packages/.
 */

export * from './AutoOrbitGenerator.js';
export * from './CameraPathAnimator.js';
export * from './ClearcoatMaterialUpgrader.js';
export * from './EnhancedBloomService.js';
export * from './ExportQualityPresets.js';
export * from './FrameCoordinator.js';
export * from './FrustumCullingService.js';
export * from './LevelScoped3DCullingService.js';
export * from './LevelMassingRenderer.js';
export * from './HDRIEnvironmentManager.js';
export * from './InstancedElementRenderer.js';
// §TOPO-AGGREGATE-IS-NOT-AN-ELEMENT (L-10530) — the canonical "is this a real
// element id?" predicate, beside the minter that makes the question necessary.
// Also reachable as `@pryzm/core-app-model/render-aggregate-identity` for
// consumers that must not pull the renderer barrel in at module load.
export * from './renderAggregateIdentity.js';
export * from './InstanceGroup.js';
export * from './SharedMaterialCache.js';
export * from './PanoramaCapture.js';
export * from './PascalSceneLighting.js';
export * from './NeutralStudioEnvironment.js';
export * from './PathTracingUtils.js';
export * from './PBRSceneUpgrader.js';
export * from './perfTrace.js';
export * from './PhotorealisticRenderer.js';
export * from './ProceduralSkyService.js';
export * from './RealSunService.js';
export * from './RealEnvironmentService.js';
export * from './RealtimeLightingService.js';
export * from './ReflectionProbeService.js';
export * from './RenderingAuditData.js';
export * from './RenderingPipelineCoordinator.js';
export * from './RenderMaterialLibrary.js';
export * from './RenderPerformanceService.js';
export * from './SceneQualityTierManager.js';
export * from './ElementInstanceBridge.js';
export * from './FurnitureInstanceBridge.js';
export * from './ShadowQualityUpgrader.js';
export * from './SharedRenderingState.js';
export * from './SSGIService.js';
export * from './ToolInteractionRef.js';
export * from './UnifiedFrameLoop.js';
export * from './ViewportPathTracer.js';
