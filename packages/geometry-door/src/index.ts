/**
 * @pryzm/geometry-door — public API barrel
 *
 * Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/doors/
 * Sprint S  (2026-05-11): DoorBuilder, DoorDependencyTracker, DoorLevelCleanupHandler, DoorSection added (Great Purge)
 */

export * from './DoorTypes';
export * from './DoorStore';
export * from './DoorSystemTypeStore';
// §FIX-DOOR-PREVIEW-EXACT (L-127) — single source of truth for door dimensions;
// preview (DoorTool / DoorPlanToolHandler) and geometry (DoorBuilder /
// DoorPlanSymbolBuilder) resolve identical dims here so preview ≡ placed door.
export { resolveDoorDimensions, DEFAULT_DOOR_DIMENSIONS, type ResolvedDoorDimensions } from './DoorDimensions';
export { DoorBuilder } from './DoorBuilder';
export { DoorDependencyTracker } from './DoorDependencyTracker';
export { DoorLevelCleanupHandler } from './DoorLevelCleanupHandler';
export { buildDoorSection, injectDwStyles, setDoorSectionCommandManager } from './DoorSection';

// ── Sprint Z (2026-05-12) — DoorTool + DoorPlanSymbolBuilder ─────────────────
export { DoorTool } from './DoorTool';
export {
    DoorPlanSymbolBuilder,
    doorPlanSymbolBuilder,
    // §FIX-PLAN-DOOR-JAMB-SEAM (2026-07-02) — pure helper; frame-cut jamb ticks on
    // the opening void edges so the wall plan lines close watertight onto the frame.
    computeDoorFrameJambTicks,
} from './DoorPlanSymbolBuilder';
