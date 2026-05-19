/**
 * @pryzm/geometry-slab — public API barrel
 *
 * Sprint E P9-W10 (2026-05-10): extracted from src/engine/subsystems/slabs/
 * + co-migrated services (WallFaceResolver, SketchLoopIntersector).
 *
 * Sprint Y (2026-05-12): SlabTool, SlabPickWallsController, SlabLevelCleanupHandler
 * promoted — commands dep resolved via @pryzm/command-registry (Sprint H done).
 */

// ── Core types ────────────────────────────────────────────────────────────────
export * from './SketchTypes';
export * from './SlabTypes';
export * from './SlabValidator';

// ── Store ─────────────────────────────────────────────────────────────────────
export * from './SlabStore';
export * from './SlabSystemTypeStore';

// ── Geometry utilities ────────────────────────────────────────────────────────
export * from './SlabGeomUtils';
export * from './SlabGeometryUtils';
export * from './SlabSnapUtils';

// ── Fragment builder + edge-render mode ───────────────────────────────────────
export * from './SlabFragmentBuilder';

// ── Profile editor ────────────────────────────────────────────────────────────
export * from './SlabProfileEditor';

// ── Sketch-resolution services (co-migrated from subsystems/services/) ────────
export * from './WallFaceResolver';
// Segment2D is exported from WallFaceResolver; explicitly name SketchLoopIntersector exports to avoid re-export ambiguity
export type { Point2D } from './SketchLoopIntersector';
export { SketchLoopIntersector } from './SketchLoopIntersector';

// ── Sprint H P9.2 (2026-05-10) — Column-slab coupling ───────────────────────
export { resolveSlabBaseOffsetForColumn, resolveSlabBaseOffsetForPoint } from './SlabColumnCoupling.js';

// ── Sprint U (2026-05-12) — Ceiling subsystem ────────────────────────────────
export type { CeilingCreationParams, CeilingModalOptions, CeilingDrawingMode, CeilingToolDeps } from './ceiling/CeilingTool';
export { CeilingTool } from './ceiling/CeilingTool';
export type { CeilingBuilderDeps } from './ceiling/CeilingPanelBuilder';
export { CeilingPanelBuilder } from './ceiling/CeilingPanelBuilder';

// ── Sprint U (2026-05-12) — Floor subsystem ──────────────────────────────────
export type { FloorCreationParams, FloorModalOptions, FloorDrawingMode, FloorToolDeps } from './floor/FloorTool';
export { FloorTool } from './floor/FloorTool';
export { FloorPanelBuilder } from './floor/FloorPanelBuilder';
export type { SlabBindingHandlerDeps } from './floor/FloorSlabBindingHandler';
export { FloorSlabBindingHandler } from './floor/FloorSlabBindingHandler';

// ── Sprint Y (2026-05-12) — Slab tool + controllers ──────────────────────────
export type { SlabToolCallbacks, SlabToolDeps } from './SlabTool';
export { SlabTool } from './SlabTool';
export type { SlabPickWallsControllerDeps } from './SlabPickWallsController';
export { SlabPickWallsController } from './SlabPickWallsController';
export type { CommandManagerRef } from './SlabLevelCleanupHandler';
export { SlabLevelCleanupHandler } from './SlabLevelCleanupHandler';

// ── Sprint AG (2026-05-12) — Slab dependency tracking + wall connectivity ────
// CommandManagerRef is already exported via SlabLevelCleanupHandler (same interface shape).
export { SlabDependencyTracker } from './SlabDependencyTracker';
export { SlabWallConnectivityService } from './SlabWallConnectivityService';
