/**
 * @pryzm/geometry-door — public API barrel
 *
 * Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/doors/
 * Sprint S  (2026-05-11): DoorBuilder, DoorDependencyTracker, DoorLevelCleanupHandler, DoorSection added (Great Purge)
 */

export * from './DoorTypes';
export * from './DoorStore';
export * from './DoorSystemTypeStore';
export { DoorBuilder } from './DoorBuilder';
export { DoorDependencyTracker } from './DoorDependencyTracker';
export { DoorLevelCleanupHandler } from './DoorLevelCleanupHandler';
export { buildDoorSection, injectDwStyles, setDoorSectionCommandManager } from './DoorSection';

// ── Sprint Z (2026-05-12) — DoorTool + DoorPlanSymbolBuilder ─────────────────
export { DoorTool } from './DoorTool';
export { DoorPlanSymbolBuilder, doorPlanSymbolBuilder } from './DoorPlanSymbolBuilder';
