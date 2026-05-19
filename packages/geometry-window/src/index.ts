/**
 * @pryzm/geometry-window — public API barrel
 *
 * Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/windows/
 * Sprint S  (2026-05-11): WindowBuilder, WindowDependencyTracker, WindowLevelCleanupHandler, WindowSection added (Great Purge)
 */

export * from './WindowTypes';
export * from './WindowStore';
export * from './WindowSystemTypeStore';
export { WindowBuilder } from './WindowBuilder';
export { WindowDependencyTracker } from './WindowDependencyTracker';
export { WindowLevelCleanupHandler } from './WindowLevelCleanupHandler';
export { buildWindowSection, setWindowSectionCommandManager } from './WindowSection';

// ── Sprint Z (2026-05-12) — WindowTool + WindowPlanSymbolBuilder ─────────────
export { WindowTool } from './WindowTool';
export { WindowPlanSymbolBuilder, windowPlanSymbolBuilder } from './WindowPlanSymbolBuilder';
