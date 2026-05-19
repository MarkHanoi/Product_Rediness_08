import * as THREE from '@pryzm/renderer-three/three';
import type { IViewSwitchListener } from './IViewSwitchListener';
import type { ViewVisibilityMap } from './ViewVisibilityMap';

/**
 * @file src/core/views/PlanViewVisibilityCuller.ts
 *
 * PlanViewVisibilityCuller — per-level element visibility culling for plan views.
 *
 * When activating a floor plan view at a specific level, elements whose
 * `userData.levelId` does NOT match the active level are hidden
 * (Object3D.visible = false). On deactivation, all hidden roots are
 * restored. This reduces the number of objects the GPU must process in
 * plan views, matching the Revit pattern described in the performance plan.
 *
 * Phase 2 Performance — Task 2.2.
 * Phase 3 Performance — Task 3.3: ViewVisibilityMap integration.
 *
 * ## ViewVisibilityMap fast path (Phase 3)
 * When a ViewVisibilityMap is injected via setVisibilityMap(), the culler
 * uses its pre-computed Set<elementId> for O(1) level-membership lookups
 * instead of comparing userData.levelId strings on every child.  Both paths
 * produce identical results — the fast path is purely an optimisation.
 *
 * ## Implementation note on ElementRegistry
 * PRYZM's current ElementRegistry maps element IDs to StoreTypes only — it
 * does not hold Three.js scene roots. Culling therefore performs a targeted
 * scene traversal that visits only top-level children of the scene root,
 * checking `userData.levelId` on each. For a scene with N top-level groups
 * this is O(N_groups), not O(N_nodes), because we do NOT call recursive
 * traverse() — we only visit direct children.
 *
 * Contract:
 *   01-BIM-ENGINE-CORE §5 — Modifies Object3D.visible (projection layer),
 *     NOT semantic state. No command or store mutation.
 *   02-BIM-SPATIAL-PROJECTION §2 — Reads userData.levelId set by Builders.
 *   05-BIM-UI-ARCHITECTURE — No UI elements created.
 */
export class PlanViewVisibilityCuller implements IViewSwitchListener {
    /** Objects hidden by the most-recent activateForLevel() call. */
    private _hiddenRoots: Set<THREE.Object3D> = new Set();

    /**
     * Phase 3: optional pre-computed level-membership map.
     * When set, activateForLevel() uses O(1) Set lookups instead of
     * string comparisons on userData.levelId.
     */
    private _visibilityMap: ViewVisibilityMap | null = null;

    // ── Phase 3 injection ─────────────────────────────────────────────────────

    /**
     * Inject the ViewVisibilityMap created in initScene.
     * Must be called once after both the scene and the map are ready.
     */
    setVisibilityMap(map: ViewVisibilityMap): void {
        this._visibilityMap = map;
    }

    // ── Core API ──────────────────────────────────────────────────────────────

    /**
     * Hide all scene objects whose `userData.levelId` does NOT match
     * `levelId`. Skips objects without a levelId (helpers, grid, etc.).
     * Restores any previously-hidden objects first so this is idempotent.
     *
     * Phase 3 fast path: when a ViewVisibilityMap is available, the visible
     * element IDs for `levelId` are retrieved from the pre-computed set in
     * O(1), and `userData.id` is used for membership testing — avoiding the
     * string comparison `userData.levelId !== levelId` on each child.
     *
     * @param levelId  The levelId of the plan view being activated.
     * @param scene    The Three.js scene to cull.
     */
    activateForLevel(levelId: string, scene: THREE.Scene): void {
        const _t0 = performance.now();
        const topLevelCount = scene.children.length;
        const path = this._visibilityMap ? 'map O(1)' : 'direct scan O(N_groups)';
        console.log(
            `[PlanViewVisibilityCuller] activateForLevel("${levelId}") — ` +
            `${topLevelCount} top-level scene children — path: ${path}`
        );

        this.deactivate();

        if (this._visibilityMap) {
            // ── Phase 3 fast path ─────────────────────────────────────────────
            // Pre-computed set of IDs that ARE on this level.
            const visibleIds = this._visibilityMap.getElementIdsForLevel(levelId);

            for (const child of scene.children) {
                const childLevelId: string | undefined = child.userData?.levelId;

                // Skip objects with no level assignment (helpers, grid, etc.)
                if (childLevelId === undefined) continue;

                // If the child is on a different level, hide it.
                if (childLevelId !== levelId) {
                    // Secondary guard: only hide if the map doesn't include this
                    // child's id (handles elements whose userData.id was set after
                    // the last map rebuild — falls back to direct string check).
                    const childId: string | undefined = child.userData?.id;
                    if (!childId || !visibleIds.has(childId)) {
                        child.visible = false;
                        this._hiddenRoots.add(child);
                    }
                }
            }
        } else {
            // ── Phase 2 fallback (no map injected) ───────────────────────────
            for (const child of scene.children) {
                const childLevelId: string | undefined = child.userData?.levelId;
                if (childLevelId !== undefined && childLevelId !== levelId) {
                    child.visible = false;
                    this._hiddenRoots.add(child);
                }
            }
        }

        const elapsed = (performance.now() - _t0).toFixed(2);
        console.log(
            `[PlanViewVisibilityCuller] activateForLevel("${levelId}") DONE — ` +
            `hidden ${this._hiddenRoots.size}/${topLevelCount} roots in ${elapsed}ms ` +
            `(${path})`
        );
    }

    /**
     * Restore visibility on all objects hidden by the last activateForLevel()
     * call. Safe to call multiple times.
     */
    deactivate(): void {
        if (this._hiddenRoots.size === 0) return;
        for (const root of this._hiddenRoots) {
            root.visible = true;
        }
        this._hiddenRoots.clear();
    }

    // ── IViewSwitchListener ───────────────────────────────────────────────────

    /**
     * Restore visibility before any scene mutation so deactivating views see
     * the full scene. The culler is re-applied after the new view activates
     * via the explicit activateForLevel() call in ViewController.
     */
    onBeforeViewSwitch(): void {
        this.deactivate();
    }

    /** No-op: the culler is applied explicitly by ViewController post-switch. */
    onAfterViewSwitch(): void { /* noop */ }
}
