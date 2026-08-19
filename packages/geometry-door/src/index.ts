/**
 * @pryzm/geometry-door — public API barrel
 *
 * Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/doors/
 * Sprint S  (2026-05-11): DoorBuilder, DoorDependencyTracker, DoorLevelCleanupHandler, DoorSection added (Great Purge)
 */

export * from './DoorTypes';
// §L-1040 (C86 §11 #7, C84 EI-9) — the ONE translation between the L0 `Door.swing`
// enum and the legacy `{ hingesSide, swingDirection }` pair. Exported so the UI
// apply path uses it instead of inlining a fifth copy of the vocabulary.
export * from './DoorSwingVocabulary';
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
// ⭐ C100 §2.1 / S17 — the door's material ladder, exported so a panel can SHOW the
// state (an override marked as an override, per C100 §6.1) instead of restating the
// precedence, and so the L0↔runtime pairing has one named home.
export {
    resolveDoorFinishColour,
    DOOR_COLOR_SENTINEL,
    DOOR_UNRESOLVED_MATERIAL_COLOR,
    type DoorFinishSlot,
    type DoorFinishColour,
    type DoorFinishColourState,
} from './doorFinishColour';
export { DoorBuilder } from './DoorBuilder';
export { DoorDependencyTracker } from './DoorDependencyTracker';
// §GR-10/GR-14 — a distinction only this package can see is one nobody can act on.
export type { DoorTrackerDetermination } from './DoorDependencyTracker';
export { DoorLevelCleanupHandler } from './DoorLevelCleanupHandler';
export { buildDoorSection, injectDwStyles, setDoorSectionCommandManager } from './DoorSection';

// ── §FEAT-CURVED-WINDOW-LEAF / §FEAT-CURVED-DOOR-LEAF (L-957) ───────────────
// The SHARED curved-hosted-leaf geometry, consumed by `DoorBuilder` here and by
// `WindowBuilder` through a re-export shim in `@pryzm/geometry-window` (that
// package already depends on this one — "dw" = doors/windows — so this is the
// only placement that gives both ONE implementation; see the module header).
//
// `curvedLeafRefusal` is exported so a property panel can IMPORT the gate the
// builder obeys instead of restating its condition. Both directions of exactly
// that mismatch — a panel offering what the geometry refuses, and a panel
// refusing what the geometry builds — shipped and were caught on 2026-08-18.
export { leafArc, curvedLeafRefusal, sweptBoxGeometry, arcSeat, type LeafArc } from './CurvedLeafGeometry';

// ── Sprint Z (2026-05-12) — DoorTool + DoorPlanSymbolBuilder ─────────────────
export { DoorTool } from './DoorTool';
export {
    DoorPlanSymbolBuilder,
    doorPlanSymbolBuilder,
    // §FIX-PLAN-DOOR-JAMB-SEAM (2026-07-02) — pure helper; frame-cut jamb ticks on
    // the opening void edges so the wall plan lines close watertight onto the frame.
    computeDoorFrameJambTicks,
} from './DoorPlanSymbolBuilder';
