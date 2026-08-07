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

// ── §SLAB-REGION-CURVED — shared curve-aware region tracer (pure, THREE-free) ─
export * from './SlabRegionTracer';

// ── §FEAT-BOUNDARY-CURVE-DRAW (2026-08-06) — the ONE arc model for curved boundary
// drawing (floors / ceilings / slabs), reusing the wall tool's midpoint-Bézier
// semantics + tessellation density (pure, THREE-free) ─────────────────────────
export * from './boundaryArc';

// ── §FEAT-SLAB-DRAW-MODES (2026-08-06) — the ONE path-authoring model (linear /
// ortho / curved) shared by the slab, floor-finish and ceiling boundary tools,
// carrying the WALL tool's ortho constraint verbatim (pure, THREE-free) ────────
export * from './boundaryPath';

// -- §FIX-COMMIT-STEALS-VIEW (2026-08-07) -- consume the Enter/Escape a drawing
// tool acts on, so it cannot also activate a focused toolbar button (a commit was
// switching the active view to 3D). Pure DOM, THREE-free.
export * from './toolKeyGuard';

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
// §FIX-FLOORFINISH-DEFAULT-THICKNESS — coupled interactive-creation defaults (thickness = base offset).
export { DEFAULT_FLOOR_FINISH_BASE_OFFSET_M, DEFAULT_FLOOR_FINISH_THICKNESS_M } from './floor/floorFinishDefaults';
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

// ── §FEAT-SWIMMING-POOL-ELEMENT (L-292, ADR-0124 §5) — ADDITIVE ──────────────
// The L1 ⇄ LEGACY coordinate contract for a slab hole. There are TWO `holes`
// fields with the same name in DIFFERENT coordinate spaces (L1 Vec3 y=elevation
// vs legacy {x,y} y=worldZ) and only the legacy one renders. Any code moving a
// hole loop across that seam MUST route through here — see SlabHoleCoords.ts.
export type { L1HoleVertex, LegacyHoleVertex } from './SlabHoleCoords';
export { l1HolesToLegacy, legacyHolesToL1 } from './SlabHoleCoords';
