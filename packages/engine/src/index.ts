/**
 * @pryzm/engine — Public API surface for the PRYZM BIM engine.
 *
 * **Sprint F-2.1 (2026-05-15) — type-only contracts package.**
 * **Updated Sprint F-2.4 (2026-05-15):** Re-exports `IDataWorkbench` and
 * related UI-layer types from `@pryzm/editor-ui` so consumers can import
 * everything engine-related from a single package.
 *
 * This package holds the _interface definitions_ (type contracts) for the BIM
 * engine layer. The concrete implementations currently live in
 * `apps/editor/src/engine/` and will be migrated here in Sprints F-2.2–F-2.5.
 *
 * Roadmap: docs/03_PRYZM3/04-PLAN-FORWARD/51-POST-EXTRACTION-ROADMAP.md §Phase F-2
 *
 * ---
 * ## Surface audit (F-2.1 → F-2.4)
 *
 * | Contract                  | Implemented by (until F-2.x)                               |
 * |---------------------------|-------------------------------------------------------------|
 * | `ViewType`                | `apps/editor/src/engine/ViewController.ts`                  |
 * | `ViewMode`                | `apps/editor/src/engine/ViewController.ts`                  |
 * | `IViewController`         | `apps/editor/src/engine/ViewController.ts`                  |
 * | `IViewSwitchListener`     | `apps/editor/src/engine/ViewController.ts`                  |
 * | `IBimService`             | `apps/editor/src/engine/BimService.ts`                      |
 * | `ISelectionManager`       | `packages/input-host/src/SelectionManager.ts`               |
 * | `ISelectionBoundsRegistry`| `packages/input-host/src/SelectionBoundsRegistry.ts`        |
 * | `EngineBootstrapFn`       | `apps/editor/src/engine/engineLauncher.ts`                  |
 * | `IEngineContext`          | `apps/editor/src/engine/EngineContext.ts`                    |
 * | `IInspectModeCoordinator` | `apps/editor/src/engine/inspect/InspectModeCoordinator.ts`  |
 * | `IPreviewManager`         | `apps/editor/src/engine/preview/PreviewManager.ts`          |
 * | `ElementSchema`           | `apps/editor/src/engine/preview/PreviewManager.ts`          |
 * | `IDataWorkbench`          | `apps/editor/src/ui/dataworkbench/DataWorkbench.ts`         |
 * | `IInitUIParams`           | `apps/editor/src/engine/initUI.ts`                          |
 * | `InitUIFn`                | `apps/editor/src/engine/initUI.ts`                          |
 *
 * Full audit document: `packages/engine/SURFACE-AUDIT.md`
 */

export type { ViewType, ViewMode } from './types/ViewType.js';
export type { IViewController, IViewSwitchListener } from './types/IViewController.js';
export type { IBimService } from './types/IBimService.js';
export type { ISelectionManager, ISelectionBoundsRegistry } from './types/ISelectionManager.js';
export type { EngineBootstrapFn } from './types/EngineBootstrapFn.js';
export type { IEngineContext } from './types/IEngineContext.js';

// F-2.4: Re-export editor-ui contracts through the engine barrel so consumers
// can `import type { IDataWorkbench } from '@pryzm/engine'` rather than
// knowing which sub-package owns each interface.
export type {
  IInspectModeCoordinator,
  IPreviewManager,
  ElementSchema,
  IDataWorkbench,
  WorkbenchMode,
  WorkbenchTabId,
  IInitUIParams,
  InitUIFn,
} from '@pryzm/editor-ui';
