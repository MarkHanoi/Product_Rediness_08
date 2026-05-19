/**
 * IPlanViewManager — contract for the Canvas2D plan/elevation view.
 *
 * Sprint F-2.3 (2026-05-15).
 * Concrete implementation: `apps/editor/src/engine/views/PlanViewManager.ts`
 *
 * § Design notes
 *
 * `ViewDefinition` is imported from `@pryzm/core-app-model`.
 *
 * `PlanViewCanvas`, `EdgeProjectorService`, and `UnifiedFrameLoop` are
 * typed `unknown` at F-2.3 to avoid pulling their heavy concrete types into
 * a contracts-only package.  They will be narrowed in Sprint F-2.4 when
 * `@thatopen/components` and the geometry packages are added as peer deps.
 */

import type { ViewDefinition } from '@pryzm/core-app-model';

/**
 * IPlanViewManager — manages the full-screen Canvas2D plan/elevation view.
 *
 * Lifecycle: `activate(viewDef)` → view is rendered → `deactivate()`.
 *
 * FrameScheduler contract (C06): `PlanViewManager` calls
 * `beginMotion('plan-zoom')` / `endMotion('plan-zoom')` internally.  The
 * interface does not expose those methods because callers do not need to
 * drive the motion gate directly.
 */
export interface IPlanViewManager {
  /** `true` when the plan view is currently displayed. */
  readonly isActive: boolean;

  /**
   * The Canvas2D rendering surface.
   * Typed `unknown` at F-2.3; narrowed to `PlanViewCanvas` in Sprint F-2.4.
   */
  readonly planViewCanvas: unknown;

  /**
   * Inject the unified frame-loop after construction.
   * Typed `unknown` at F-2.3; narrowed to `UnifiedFrameLoop` in Sprint F-2.4.
   */
  setUnifiedFrameLoop(loop: unknown): void;

  /**
   * Inject the EdgeProjectorService after construction.
   * Typed `unknown` at F-2.3; narrowed to `EdgeProjectorService` in Sprint F-2.4.
   */
  setEdgeProjectorService(service: unknown): void;

  /**
   * Activate the plan view for the given `ViewDefinition`.
   * If a view is already active it is deactivated first.
   */
  activate(viewDef: ViewDefinition): void;

  /** Deactivate the plan view and restore the 3D renderer container. */
  deactivate(): void;
}
