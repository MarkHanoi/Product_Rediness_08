/**
 * @pryzm/render-pipeline — public barrel
 *
 * TSL WebGPU render pipeline passes extracted from src/engine/subsystems/rendering/pipeline/
 * via strangler-fig pattern (A16-T1, 2026-05-03).
 *
 * ## What is exported
 *
 * ### Render passes (A16-T1 — S122 extractions)
 *   BackgroundUniform, ScenePass, ZonePass — fully promoted to this package.
 *   SSGIPass, TRAAPass, OutlinePass, RenderPipelineManager — still live in
 *   `src/engine/subsystems/rendering/pipeline/`; promoted in A16 S124.
 *
 * ### Performance metrics (A16-T2 — C10 §2)
 *   RenderPerformanceService, RenderFrameMetrics, RenderPerformanceSnapshot, …
 *   Available as a tree-shakeable sub-path import:
 *     `import { RenderPerformanceService } from '@pryzm/render-pipeline/metrics'`
 *   Also re-exported from this root barrel.
 *
 * Layer: L4 (Rendering)
 * Contract: C04 §1, C01 §2, C10 §2
 * Spec: docs/archive/pryzm3-internal/04-PLAN-FORWARD/26-WAVE-A16-ENGINE-MIGRATION.md
 */

export * from './BackgroundUniform.js';
export * from './ScenePass.js';
export * from './ZonePass.js';

// A16-T2: Render performance metrics (C10 §2)
export * from './metrics/index.js';
