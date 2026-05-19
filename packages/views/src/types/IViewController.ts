/**
 * IViewController — public interface for the PRYZM BIM view controller.
 *
 * Sprint F-2.5 (2026-05-15): migrated from `@pryzm/engine` to `@pryzm/views`
 * (view-controller is a view-layer concept; the move breaks the circular
 * dependency that previously prevented `@pryzm/editor-ui` from importing it).
 * `@pryzm/engine` re-exports `IViewController` + `IViewSwitchListener` for
 * full backward compatibility — existing importers need no changes.
 *
 * Sprint F-2.1 surface audit origin: extracted from ViewController.ts public API.
 * Implementation: apps/editor/src/engine/ViewController.ts (until Sprint F-2.5).
 * Reference: docs/03_PRYZM3/04-PLAN-FORWARD/51-POST-EXTRACTION-ROADMAP.md §Phase F-2
 *
 * ## Design rules
 * - All parameters for `activate()` and `zoomToFit()` that reference heavy library
 *   types (OBC.View, THREE.Box3, etc.) are typed as `unknown` here to keep this
 *   contracts package dependency-free. Implementors cast to the concrete type.
 * - Async methods return `Promise<void>`; the caller awaits the view transition.
 * - Setters for camera projection are synchronous because projection changes do
 *   not require an animation frame sequence.
 *
 * ## Consumer pattern
 * ```ts
 * import type { IViewController } from '@pryzm/views';
 * // or: import type { IViewController } from '@pryzm/engine'; (re-exported)
 *
 * function MyPlugin(vc: IViewController) {
 *     vc.setPerspectiveProjection();
 *     await vc.zoomToFit({ animate: true });
 * }
 * ```
 */

import type { ViewMode, ViewType } from './ViewType.js';

export interface IViewController {
    /**
     * Current viewport display mode.
     * Read-only from the consumer's perspective; set implicitly by `activate()`.
     */
    readonly viewMode: ViewMode;

    /**
     * Current camera projection type.
     * Read-only from the consumer's perspective; set by
     * `setPerspectiveProjection()` / `setOrthographicProjection()`.
     */
    readonly viewType: ViewType;

    /**
     * Activate a view (plan / section / elevation / perspective / orthographic).
     * Returns when the view-transition animation is complete.
     *
     * @param view — An `OBC.View` or `ViewDefinition` handle. Typed as `unknown`
     *   here; concrete implementations accept `OBC.View | ViewDefinition`.
     */
    activate(view: unknown): Promise<void>;

    /**
     * Deactivate the currently active plan/section/elevation view and return
     * to the default 3-D perspective viewport.
     * No-op if no non-3D view is active.
     */
    deactivateCurrentView(): Promise<void>;

    /**
     * Frame the camera to fit all visible scene content.
     * @param opts.animate — whether to animate the camera move (default `true`).
     */
    zoomToFit(opts?: { animate?: boolean }): Promise<void>;

    /**
     * Switch the camera to perspective (pinhole) projection.
     * Synchronous; does not start a view-transition animation.
     */
    setPerspectiveProjection(): void;

    /**
     * Switch the camera to orthographic (parallel) projection.
     * Synchronous; does not start a view-transition animation.
     */
    setOrthographicProjection(): void;

    /**
     * Register a listener that is called at the start and end of every
     * view-switch transition. Used by performance-sensitive subsystems
     * (e.g. PostProcessingManager, PlanViewVisibilityCuller) to pause/resume
     * work during the transition.
     *
     * @returns A disposer function; call it to unregister the listener.
     */
    addViewSwitchListener(listener: IViewSwitchListener): () => void;
}

/**
 * IViewSwitchListener — called at the boundaries of a view-switch animation.
 * Implemented by subsystems that must pause during transitions.
 *
 * Sprint F-2.5: migrated from `@pryzm/engine` to `@pryzm/views`.
 * Structurally compatible with `@pryzm/core-app-model`'s `IViewSwitchListener`
 * (both packages define the same two-method protocol).
 *
 * Calling convention matches the concrete ViewController implementation which
 * iterates `_viewSwitchListeners` and calls `onBeforeViewSwitch()` /
 * `onAfterViewSwitch()` synchronously (< 1 ms).
 *
 * Sprint F-2.1: renamed from `onViewSwitchBegin/End` → `onBeforeViewSwitch/
 * onAfterViewSwitch` to match the actual calling convention in ViewController.
 */
export interface IViewSwitchListener {
    /** Called synchronously immediately before any scene mutation begins. */
    onBeforeViewSwitch(): void;
    /** Called synchronously after the new view is fully stable. */
    onAfterViewSwitch(): void;
}
