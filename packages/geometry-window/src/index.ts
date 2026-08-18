/**
 * @pryzm/geometry-window — public API barrel
 *
 * Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/windows/
 * Sprint S  (2026-05-11): WindowBuilder, WindowDependencyTracker, WindowLevelCleanupHandler, WindowSection added (Great Purge)
 */

export * from './WindowTypes';
export * from './WindowStore';
export * from './WindowSystemTypeStore';
// §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) — the ONE window dimension authority
// (record → system type → canonical defaults). L-127: no builder invents a dimension.
export {
    resolveWindowDimensions,
    DEFAULT_WINDOW_DIMENSIONS,
    type ResolvedWindowDimensions,
    type WindowDimensionSource,
} from './WindowDimensions';

// ── §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) ────────────────────────
// THE ONE ANSWER to "which window did the architect choose?" (mirrors the door's
// DoorToolConfigStore, L-260 A) and THE ONE `window.create` chokepoint that both
// creation paths commit through, so a plan-created window and a 3D-created window
// are byte-identical records — and therefore the identical symbol (C11 §3, C15).
export {
    getWindowToolConfig,
    setWindowToolConfig,
    resetWindowToolConfig,
    DEFAULT_WINDOW_TOOL_CONFIG,
    type WindowToolConfig,
    type WindowTypeChoice,
} from './WindowToolConfigStore';
export {
    buildWindowOpening,
    buildWindowStoreRecord,
    type WindowOpeningData,
    type BuildWindowOpeningInput,
    type BuildWindowStoreRecordInput,
} from './WindowOpeningFactory';
// ── §FIX-UNTYPED-HOSTED-ELEMENT-BACKFILL (L-274) ─────────────────────────────
// The MIGRATION half of the parity fix: a creation-path fix does not heal the
// records the broken path already wrote. Pure planner; applied by
// `BackfillHostedElementTypesCommand` (C03/C16 — migrations are commands).
export {
    planWindowTypeBackfill,
    resolveDefaultWindowSystemTypeId,
    isWindowUntyped,
    type WindowTypeBackfillPlan,
    type WindowTypeBackfillEntry,
} from './WindowTypeBackfill';

// §FIX-HOSTED-TYPE-CHANGE (L-620) — the properties-panel "Window Type" swap planner.
export {
    planWindowTypeChange,
    PRESERVED_ON_TYPE_CHANGE as WINDOW_PRESERVED_ON_TYPE_CHANGE,
    type WindowTypeChangePlan,
} from './WindowTypeChange';
export { WindowBuilder } from './WindowBuilder';
export { WindowDependencyTracker } from './WindowDependencyTracker';
export { WindowLevelCleanupHandler } from './WindowLevelCleanupHandler';
export { buildWindowSection, setWindowSectionCommandManager } from './WindowSection';

// ── Sprint Z (2026-05-12) — WindowTool + WindowPlanSymbolBuilder ─────────────
export { WindowTool } from './WindowTool';
export { WindowPlanSymbolBuilder, windowPlanSymbolBuilder } from './WindowPlanSymbolBuilder';

// ── §FEAT-CURVED-WINDOW-LEAF (L-957) ────────────────────────────────────────
// `curvedLeafRefusal` is exported so the property panel can IMPORT the gate the
// builder obeys instead of restating its condition. Both directions of exactly
// that mismatch — a panel offering what the geometry refuses, and a panel
// refusing what the geometry builds — shipped and were caught on 2026-08-18; a
// shared gate is the only thing that closes it.
export { leafArc, curvedLeafRefusal, sweptBoxGeometry, arcSeat, type LeafArc } from './CurvedLeafGeometry';
