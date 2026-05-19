/**
 * @file packages/scene-committer/src/SceneLayers.ts
 *
 * SceneLayers — Three.js Layers constants for PRYZM scene organisation.
 *
 * Three.js Object3D.layers uses a 32-bit bitmask. Camera.layers controls
 * which layers the camera renders. Raycasters can also filter by layer.
 *
 * Layer assignments:
 *
 *   BIM_LAYER = 0        — permanent BIM geometry (walls, slabs, doors, …)
 *                          Default layer; all Three.js objects start on it.
 *
 *   EDITOR_LAYER = 1     — editor-only aids that should not appear in print
 *                          or rendered sheet exports: the OBC SimpleGrid,
 *                          tool preview / ghost meshes, axis helpers.
 *
 *   ANNOTATION_LAYER = 2 — 2D annotation geometry (dimension strings, tags,
 *                          grid bubbles, level markers).  Plan-view cameras
 *                          disable this layer so annotation geometry is not
 *                          rasterised into the 3D depth buffer; the annotation
 *                          pipeline draws it in screen space instead.
 *
 * Contract:
 *   01-BIM-ENGINE-CORE §5 — Pure constants; no side effects.
 *   02-BIM-SPATIAL-PROJECTION §8.3 — Layer separation.
 *   C04 §2 — Scene committer scope.
 *
 * Migrated: Wave A16-T3 (S122) — extracted from src/engine/subsystems/core/scene/
 */

/** Layer 0 — permanent BIM geometry. The Three.js default layer. */
export const BIM_LAYER = 0;

/** Layer 1 — editor-only aids (OBC grid, preview meshes, transform helpers). */
export const EDITOR_LAYER = 1;

/** Layer 2 — 2D annotation geometry (dimensions, tags, grid bubbles). */
export const ANNOTATION_LAYER = 2;

/**
 * Layer 3 — Plan-view linework (EdgeProjector + StairPlanSymbolRegistry).
 *
 * Objects on this layer are invisible by default (group.visible = false).
 *
 * Plan-view activation:
 *   camera.layers.enable(PLAN_SYMBOL_LAYER) → linework becomes renderable
 *
 * Returning to 3D:
 *   camera.layers.disable(PLAN_SYMBOL_LAYER) → linework no longer rendered
 *
 * This camera-layer flip takes <1ms, replacing the 50–300ms GPU stall from
 * the OBC Clipper approach.
 *
 * Contract:
 *   §02-BIM-SPATIAL-PROJECTION §8.3 — PLAN_SYMBOL_LAYER = 3.
 *   §01-BIM-ENGINE-CORE §5 — pure constant; no side effects.
 */
export const PLAN_SYMBOL_LAYER = 3;

/**
 * Layer 5 — TechnicalDrawing vector overlay (EdgeProjector linework).
 *
 * Objects on this layer are the LineSegments produced by EdgeProjectorService.project()
 * and injected into the Three.js scene by ViewController after projection completes.
 *
 * The SelectionManager raycaster targets only BIM_LAYER (0), so vector lines on
 * this layer are rendered but never selectable or intercepted by modelling tools.
 *
 * Contract: §02-BIM-SPATIAL-PROJECTION §8.3 — DOCUMENTATION_LAYER = 5.
 *           §01-BIM-ENGINE-CORE §5 — pure constant; no side effects.
 */
export const DOCUMENTATION_LAYER = 5;
