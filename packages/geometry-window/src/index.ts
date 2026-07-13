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
export { WindowBuilder } from './WindowBuilder';
export { WindowDependencyTracker } from './WindowDependencyTracker';
export { WindowLevelCleanupHandler } from './WindowLevelCleanupHandler';
export { buildWindowSection, setWindowSectionCommandManager } from './WindowSection';

// ── Sprint Z (2026-05-12) — WindowTool + WindowPlanSymbolBuilder ─────────────
export { WindowTool } from './WindowTool';
export { WindowPlanSymbolBuilder, windowPlanSymbolBuilder } from './WindowPlanSymbolBuilder';
