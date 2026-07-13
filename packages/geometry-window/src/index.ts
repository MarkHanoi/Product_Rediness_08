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
export { WindowBuilder } from './WindowBuilder';
export { WindowDependencyTracker } from './WindowDependencyTracker';
export { WindowLevelCleanupHandler } from './WindowLevelCleanupHandler';
export { buildWindowSection, setWindowSectionCommandManager } from './WindowSection';

// ── Sprint Z (2026-05-12) — WindowTool + WindowPlanSymbolBuilder ─────────────
export { WindowTool } from './WindowTool';
export { WindowPlanSymbolBuilder, windowPlanSymbolBuilder } from './WindowPlanSymbolBuilder';
