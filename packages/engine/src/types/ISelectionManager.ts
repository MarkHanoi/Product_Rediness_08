/**
 * ISelectionManager — light public interface for the PRYZM selection manager.
 *
 * Sprint F-2.1 surface audit.
 * Concrete implementation: packages/input-host/src/SelectionManager.ts.
 * The full class is already exported from `@pryzm/input-host`; this interface
 * defines the minimal subset that non-engine consumers (plugins, UI panels)
 * actually need, without depending on the concrete class or Three.js.
 *
 * ## Why a separate interface
 * - Plugins at L6/L7 should not import the concrete `SelectionManager` class
 *   (an L3 implementation detail) just to annotate a callback parameter.
 * - This interface lets them depend on `@pryzm/engine` (a contracts-only package)
 *   instead.
 *
 * ## Consumer pattern
 * ```ts
 * import type { ISelectionManager } from '@pryzm/engine';
 *
 * function MyPlugin(sel: ISelectionManager) {
 *     sel.unselectAll();
 * }
 * ```
 */
export interface ISelectionManager {
    /** Whether pointer-click selection is active. Disable during modal tool modes. */
    enabled: boolean;

    /**
     * Clear all highlights and deselect the current object.
     * Also clears the inspector panel (via the registered `onUnselect` callback).
     */
    unselectAll(): void;

    /**
     * Apply a selection highlight to the given 3-D object and attach
     * TransformControls if appropriate.
     *
     * @param obj — A `THREE.Object3D` instance. Typed as `unknown` to keep
     *   this interface free of a direct Three.js dependency; the concrete
     *   implementation casts internally.
     */
    applyHighlight(obj: unknown): void;

    /**
     * Select the scene object with the given element ID (from `userData.id`).
     * Equivalent to clicking the object in the 3-D viewport.
     *
     * @returns `true` if the object was found and selected; `false` otherwise.
     */
    selectById(elementId: string): boolean;

    /**
     * Access the pluggable bounds registry that controls how selection-highlight
     * geometry is computed for each element type.
     * Sprint F-2.0 §E2 deliverable.
     */
    readonly boundsRegistry: ISelectionBoundsRegistry;
}

/**
 * ISelectionBoundsRegistry — minimal public contract for the bounds registry.
 * The concrete class is `SelectionBoundsRegistry` in `@pryzm/input-host`.
 */
export interface ISelectionBoundsRegistry {
    /**
     * Register a custom highlight-bounds builder for the given element type.
     * Overwrites any previously registered builder for that type.
     *
     * @param elementType — Lowercase element-type string (e.g. `'my-beam'`).
     * @param builder     — A function that returns a highlight description.
     *   Return `null` to fall back to the default AABB path.
     */
    register(elementType: string, builder: (obj: unknown) => unknown | null): void;
}
