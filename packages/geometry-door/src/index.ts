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
// §FIX-DOOR-CREATION-PARITY (L-260 A) — the ONE door config (single source of truth
// for the architect's door-type + system-type choice) and the ONE `door.create`
// chokepoint. 3D tool, plan tool, batch generators and AI all resolve here, so a
// plan-created door and a 3D-created door are byte-identical by construction (C11 §3).
export {
    getDoorToolConfig,
    setDoorToolConfig,
    resetDoorToolConfig,
    DEFAULT_DOOR_TOOL_CONFIG,
    type DoorToolConfig,
    type DoorTypeChoice,
} from './DoorToolConfigStore';
export {
    buildDoorOpening,
    buildDoorStoreRecord,
    type DoorOpeningData,
    type BuildDoorOpeningInput,
    type BuildDoorStoreRecordInput,
} from './DoorOpeningFactory';
// ── §FIX-UNTYPED-HOSTED-ELEMENT-BACKFILL (L-274) ─────────────────────────────
// The MIGRATION half of the parity fix: converging the creation paths does NOT heal
// the records the broken path already wrote. Pure planner; applied by
// `BackfillHostedElementTypesCommand` (C03/C16 — migrations are commands).
export {
    planDoorTypeBackfill,
    resolveDefaultDoorSystemTypeId,
    isDoorUntyped,
    type DoorTypeBackfillPlan,
    type HostedTypeBackfillEntry,
} from './DoorTypeBackfill';

// §FIX-HOSTED-TYPE-CHANGE (L-620) — the properties-panel "Door Type" swap planner.
export {
    planDoorTypeChange,
    PRESERVED_ON_TYPE_CHANGE as DOOR_PRESERVED_ON_TYPE_CHANGE,
    type DoorTypeChangePlan,
} from './DoorTypeChange';
export { DoorBuilder } from './DoorBuilder';
export { DoorDependencyTracker } from './DoorDependencyTracker';
// §GR-10/GR-14 — a distinction only this package can see is one nobody can act on.
export type { DoorTrackerDetermination } from './DoorDependencyTracker';
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
