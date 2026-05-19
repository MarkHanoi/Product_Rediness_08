/**
 * ISplitViewManager — contract for the split-pane 3D + Canvas2D view.
 *
 * Sprint F-2.3 (2026-05-15).
 * Concrete implementation: `apps/editor/src/engine/views/SplitViewManager.ts`
 *
 * § Design notes
 *
 * The split-view panel shows the 3D viewport on the right and an associated
 * Canvas2D plan/section view on the left.  `activate()` and `deactivate()`
 * are the only methods callers outside the engine layer need; `toggle()` is
 * a convenience wrapper.
 *
 * `PlanViewCanvas` is typed `unknown` at F-2.3.
 */

/**
 * ISplitViewManager — manages the split-pane (3D + Canvas2D) layout.
 *
 * FrameScheduler contract (C06): `SplitViewManager` calls
 * `beginMotion('svp-zoom')` / `endMotion('svp-zoom')` internally.
 *
 * Window events dispatched:
 *   `split-view-activated`      — on activate()
 *   `split-view-deactivated`    — on deactivate()
 *   `split-view-layout-changed` — detail: `{ splitRatio: number }`
 *   `split-view-view-changed`   — on view type change inside the panel
 */
export interface ISplitViewManager {
  /** `true` when the split view panel is currently displayed. */
  readonly isActive: boolean;

  /**
   * The Canvas2D surface hosted in the left pane.
   * Typed `unknown` at F-2.3; narrowed to `PlanViewCanvas` in Sprint F-2.4.
   */
  getPlanCanvas(): unknown;

  /** Show the split-view panel.  No-op if already active. */
  activate(): void;

  /** Hide the split-view panel.  No-op if already inactive. */
  deactivate(): void;

  /** Toggle: activate if inactive, deactivate if active. */
  toggle(): void;
}
