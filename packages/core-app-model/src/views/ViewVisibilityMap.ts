import * as THREE from '@pryzm/renderer-three/three';
import { storeEventBus } from '../StoreEventBus'; // TODO(TASK-08)

/**
 * @file src/core/views/ViewVisibilityMap.ts
 *
 * ViewVisibilityMap — pre-computed level-membership index for plan views.
 *
 * Builds and caches a `Map<levelId, Set<elementId>>` from the Three.js scene
 * so that plan-view activation can perform O(1) level-membership lookups
 * instead of re-scanning scene children on every view switch.
 *
 * ## How it works
 *
 * On the first query after construction (or after invalidation), the map
 * iterates the direct children of the scene root — exactly one pass,
 * O(N_groups) — and groups each element ID by its `userData.levelId`.
 * Subsequent calls to `getElementIdsForLevel()` return the cached Set
 * immediately, with no further scene traversal.
 *
 * ## Invalidation
 *
 * The map is invalidated:
 *   1. Explicitly via `invalidate()`.
 *   2. On StoreEventBus `create` or `delete` events — element set changes. // TODO(TASK-08)
 *   3. On DOM events: 'model-updated', 'ai-model-update', 'bim-project-cleared',
 *      'bim-level-added', 'bim-level-removed', 'clear-project', 'project-loaded'.
 *
 * StoreEventBus `update` events do NOT invalidate — updating an existing element // TODO(TASK-08)
 * does not change which level it belongs to (levelId is immutable after creation).
 *
 * ## Integration
 *
 * initScene creates the singleton, injects the scene via setScene(), then calls
 * viewController.setViewVisibilityMap() which propagates the reference into
 * PlanViewVisibilityCuller via PlanViewVisibilityCuller.setVisibilityMap().
 *
 * PlanViewVisibilityCuller.activateForLevel() uses the map's pre-computed set
 * to decide which scene roots to hide, replacing the inline userData.levelId
 * comparison with an O(1) Set.has() call.
 *
 * Contract:
 *   01-BIM-ENGINE-CORE §5 — No store mutations; no Builder calls.
 *   02-BIM-SPATIAL-PROJECTION §2 — Reads userData.levelId set by Builders.
 *   05-BIM-UI-ARCHITECTURE — No UI elements created.
 *
 * Phase 3 Performance — Task 3.3.
 */
export class ViewVisibilityMap {

    /** levelId → Set of elementIds that belong to that level. */
    private _levelToIds = new Map<string, Set<string>>();

    /** True when the map must be rebuilt before the next query. */
    private _dirty = true;

    /** The Three.js scene used for lazy rebuilds. */
    private _scene: THREE.Scene | null = null;

    /** DOM events that force a full rebuild on next query. */
    private static readonly INVALIDATING_EVENTS = [
        'model-updated',
        'ai-model-update',
        'bim-project-cleared',
        'bim-level-added',
        'bim-level-removed',
        'clear-project',
        'project-loaded',
    ] as const;

    constructor() {
        // DOM event invalidation
        const handler = () => { this._dirty = true; };
        for (const name of ViewVisibilityMap.INVALIDATING_EVENTS) {
            window.addEventListener(name, handler);
        }

        // StoreEventBus: element creation and deletion change level membership.
        // Updates are ignored because levelId is immutable after creation.
        // Phase 3: set _dirty = true directly. No rAF coalescing needed because
        // _dirty is a simple boolean — N duplicate sets cost nothing, and
        // _ensureFresh() is lazy (only rebuilds on the first query after invalidation).
        storeEventBus.subscribe((event) => {
            if (event.operation === 'create' || event.operation === 'delete') {
                this._dirty = true;
            }
        });
    }

    // ── Scene injection ───────────────────────────────────────────────────────

    /**
     * Provide the Three.js scene used for lazy rebuilds.
     * Call once from initScene after the world is ready.
     */
    setScene(scene: THREE.Scene): void {
        this._scene = scene;
        this._dirty = true;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Mark the map as stale. The next query will trigger a rebuild.
     */
    invalidate(): void {
        this._dirty = true;
    }

    /**
     * Returns the pre-computed Set of element IDs that belong to `levelId`.
     * Returns an empty (frozen) set if no elements are on the level.
     *
     * Rebuilds from scene children if dirty — O(N_groups) for the rebuild,
     * O(1) for all subsequent calls until the next invalidation.
     */
    getElementIdsForLevel(levelId: string): ReadonlySet<string> {
        this._ensureFresh();
        return this._levelToIds.get(levelId) ?? _EMPTY_SET;
    }

    /**
     * Returns true if `elementId` belongs to `levelId`.
     * O(1) after the initial build.
     */
    isOnLevel(elementId: string, levelId: string): boolean {
        this._ensureFresh();
        return this._levelToIds.get(levelId)?.has(elementId) ?? false;
    }

    /**
     * Returns all level IDs that have at least one element.
     */
    getLevelIds(): ReadonlyArray<string> {
        this._ensureFresh();
        return Array.from(this._levelToIds.keys());
    }

    /**
     * Total number of element–level associations in the map.
     */
    get size(): number {
        return Array.from(this._levelToIds.values())
            .reduce((sum, s) => sum + s.size, 0);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /**
     * Rebuild the map from direct scene children — O(N_groups).
     * Preview objects and helpers are excluded.
     */
    private _ensureFresh(): void {
        if (!this._dirty) return;

        this._levelToIds.clear();

        if (this._scene) {
            for (const child of this._scene.children) {
                const id: string | undefined = child.userData?.id;
                const levelId: string | undefined = child.userData?.levelId;

                if (!id || !levelId) continue;
                if (child.userData?.isPreview === true) continue;
                if (child.userData?.isHelper === true) continue;

                let ids = this._levelToIds.get(levelId);
                if (!ids) {
                    ids = new Set<string>();
                    this._levelToIds.set(levelId, ids);
                }
                ids.add(id);
            }

            const total = this.size;
            console.log(
                `[ViewVisibilityMap] Rebuilt — ${total} element(s)` +
                ` across ${this._levelToIds.size} level(s).`,
            );
        }

        this._dirty = false;
    }
}

/** Shared empty set returned for unknown levels — avoids repeated allocation. */
const _EMPTY_SET: ReadonlySet<string> = Object.freeze(new Set<string>());
