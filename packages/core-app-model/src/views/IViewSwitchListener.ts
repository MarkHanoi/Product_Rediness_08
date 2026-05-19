/**
 * @file src/core/views/IViewSwitchListener.ts
 *
 * IViewSwitchListener — typed protocol for view-switch coordination.
 *
 * Replaces the `window.renderPipelineManager` and
 * `window.__viewSwitchInProgress` globals with an explicit,
 * type-safe registration mechanism.
 *
 * Phase 2 Performance — Task 2.1.
 *
 * Contract: 01-BIM-ENGINE-CORE §4 (no window globals for inter-subsystem
 * coordination), §5 (no side effects beyond the listener's own domain).
 *
 * Both callbacks are synchronous and must remain fast (<1 ms).
 * No async operations, no store mutations, no scene traversals.
 */
export interface IViewSwitchListener {
    /**
     * Fired synchronously BEFORE any scene mutation (deactivate, cleanup,
     * camera change). Implementations should clear state that would be
     * invalidated by the scene mutation (e.g., outline arrays, selection).
     */
    onBeforeViewSwitch(): void;

    /**
     * Fired synchronously AFTER the new view is fully stable (camera
     * positioned, projection set, listeners registered). Implementations
     * should re-enable anything they suspended in onBeforeViewSwitch().
     */
    onAfterViewSwitch(): void;
}
