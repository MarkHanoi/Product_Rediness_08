/**
 * @pryzm/views — View-layer public API contracts.
 *
 * **Sprint F-2.3 (2026-05-15) — type-only contracts package.**
 * **Sprint F-2.5 (2026-05-15) — ViewType, ViewMode, IViewController, IViewSwitchListener
 * migrated here from `@pryzm/engine` (view concepts belong in the view package).
 * `@pryzm/engine` re-exports all four for backward compatibility.**
 *
 * This package holds _interface definitions_ for the BIM view layer.
 * Concrete implementations currently live in `apps/editor/src/engine/views/`
 * and will be migrated here in a future sprint.
 *
 * Roadmap: docs/archive/pryzm3-internal/04-PLAN-FORWARD/51-POST-EXTRACTION-ROADMAP.md §Phase F-2
 *
 * ---
 * ## Surface (F-2.3 + F-2.5)
 *
 * | Contract              | Implemented by                                              |
 * |-----------------------|-------------------------------------------------------------|
 * | `ViewType`            | `apps/editor/src/engine/ViewController.ts`                  |
 * | `ViewMode`            | `apps/editor/src/engine/ViewController.ts`                  |
 * | `IViewController`     | `apps/editor/src/engine/ViewController.ts`                  |
 * | `IViewSwitchListener` | `apps/editor/src/engine/ViewController.ts`                  |
 * | `ISectionViewService` | `apps/editor/src/engine/views/SectionViewService.ts`        |
 * | `SectionConfig`       | re-exported from `ISectionViewService`                      |
 * | `Vector3Like`         | structural match for `THREE.Vector3`                        |
 * | `IPlanViewManager`    | `apps/editor/src/engine/views/PlanViewManager.ts`           |
 * | `ISplitViewManager`   | `apps/editor/src/engine/views/SplitViewManager.ts`          |
 */

export type { ViewType, ViewMode } from './types/ViewType.js';
export type { IViewController, IViewSwitchListener } from './types/IViewController.js';

export type {
  ISectionViewService,
  SectionConfig,
  Vector3Like,
} from './types/ISectionViewService.js';

export type { IPlanViewManager } from './types/IPlanViewManager.js';
export type { ISplitViewManager } from './types/ISplitViewManager.js';
