/**
 * @pryzm/geometry-column — public API barrel
 *
 * Sprint H P9 (2026-05-10): extracted from src/engine/subsystems/columns/
 * Sprint S  (2026-05-11): ColumnFragmentBuilder, ColumnLevelCleanupHandler, ColumnPlanSymbolBuilder added (Great Purge)
 * Sprint W  (2026-05-12): ColumnTool + ColumnToolDeps extracted from src/engine/subsystems/columns/
 */

export * from './ColumnTypes';
export * from './SlabColumnCoupling';
export { ColumnStore } from './ColumnStore';
export type { ColumnEventType, ColumnEventListener } from './ColumnStore';
export { validateColumnData, ColumnDataSchema } from './ColumnValidator';
export type { ColumnDataValidated } from './ColumnValidator';
export { ColumnFragmentBuilder } from './ColumnFragmentBuilder';
export { ColumnLevelCleanupHandler } from './ColumnLevelCleanupHandler';
export { ColumnPlanSymbolBuilder, columnPlanSymbolBuilder, installColumnPlanSymbolBuilder } from './ColumnPlanSymbolBuilder';

// Sprint W — ColumnTool (interactive placement tool, interactive preview, DI via ColumnToolDeps)
export { ColumnTool } from './ColumnTool';
export type { ColumnToolDeps } from './ColumnTool';
