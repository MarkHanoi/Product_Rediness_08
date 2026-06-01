/**
 * @pryzm/editor-ui — Public API contracts for the PRYZM editor UI layer.
 *
 * **Sprint F-2.4 (2026-05-15) — type-only contracts package.**
 *
 * This package holds the _interface definitions_ (type contracts) for the
 * editor UI layer.  The concrete implementations currently live in
 * `apps/editor/src/{engine,ui}/` and will be migrated here in Sprint F-2.5.
 *
 * Roadmap: docs/archive/pryzm3-internal/04-PLAN-FORWARD/51-POST-EXTRACTION-ROADMAP.md §Phase F-2
 *
 * ---
 * ## Surface (F-2.4)
 *
 * | Contract                  | Implemented by (until F-2.5)                                        |
 * |---------------------------|---------------------------------------------------------------------|
 * | `IInspectModeCoordinator` | `apps/editor/src/engine/inspect/InspectModeCoordinator.ts`          |
 * | `IPreviewManager`         | `apps/editor/src/engine/preview/PreviewManager.ts`                  |
 * | `ElementSchema`           | `apps/editor/src/engine/preview/PreviewManager.ts` (exported type)  |
 * | `IDataWorkbench`          | `apps/editor/src/ui/dataworkbench/DataWorkbench.ts`                 |
 * | `WorkbenchMode`           | `apps/editor/src/ui/dataworkbench/DataWorkbench.ts` (internal type) |
 * | `WorkbenchTabId`          | `apps/editor/src/ui/dataworkbench/DataWorkbench.ts` (internal type) |
 * | `IInitUIParams`           | `apps/editor/src/engine/initUI.ts` (UIParams shape)                 |
 * | `InitUIFn`                | `apps/editor/src/engine/initUI.ts` (function signature)             |
 *
 * Full audit document: `packages/engine/SURFACE-AUDIT.md`
 */

export type { IInspectModeCoordinator } from './types/IInspectModeCoordinator.js';
export type {
  IPreviewManager,
  ElementSchema,
} from './types/IPreviewManager.js';
export type {
  IDataWorkbench,
  WorkbenchMode,
  WorkbenchTabId,
} from './types/IDataWorkbench.js';
export type {
  IInitUIParams,
  InitUIFn,
} from './types/IInitUI.js';
