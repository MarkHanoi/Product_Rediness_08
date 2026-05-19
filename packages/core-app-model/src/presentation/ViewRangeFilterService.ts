/**
 * ViewRangeFilterService — Phase VI View Range Enforcement
 * src/core/presentation/ViewRangeFilterService.ts
 *
 * Enforces the active plan view's ViewRangeSettings by hiding Three.js scene
 * objects whose level falls outside the view's depth-to-top vertical band.
 *
 * Design:
 *   - Completely self-contained new file — NO modifications to existing services.
 *   - Additive to VGSceneApplicator: VG applies category styles first (its
 *     listener fires earlier), then this service overrides visibility for
 *     out-of-range objects. On VG re-apply events this service also re-enforces
 *     so VG can never accidentally un-hide an out-of-range element.
 *   - Objects are hidden via `obj.visible = false` and flagged with
 *     `userData._vrfHidden = true`. The flag is used only to restore objects
 *     when the view range is deactivated or the active view changes.
 *   - Only objects with `userData.levelId` set are filtered. Helpers, previews,
 *     grids, levels, and annotation types are always skipped.
 *
 * Contract compliance:
 *   §01 §2    — Read-only of stores; no Command calls; no store writes.
 *   §02 §1.2  — Level-to-world Y resolved via BimManager (getLevels callback).
 *   §03 §1.1  — No mutation of ViewDefinition or any store data.
 *   §05 §7    — No DOM, no @thatopen/ui, no bim-* elements. Pure Three.js traversal.
 *   §07       — No server routes; client-side only.
 *
 * Element types that are NEVER filtered (always visible regardless of range):
 *   - Preview, Snap, EdgeOverlay, Dimension, SelectionBox
 *   - BimLevel, BimGrid, Grid, GridLine, Level, LevelLine
 *   - TransformHelper, WallEdge (legacy singular form)
 *
 * Usage (EngineBootstrap):
 *   import { ViewRangeFilterService } from '../core/presentation/ViewRangeFilterService';
 *   const vrfService = new ViewRangeFilterService(
 *       world.scene.three as THREE.Scene,
 *       () => bimManager.getLevels(),
 *   );
 *   window.viewRangeFilterService = vrfService;
 */

import * as THREE from '@pryzm/renderer-three/three';
import { setUD, deleteUD } from './userDataSafe';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import { PLAN_VIEW_TYPES } from '../views/ViewDefinitionTypes';
import type { Level } from '@pryzm/core-app-model';
import { elementSpatialIndex } from '@pryzm/core-app-model';
import {
    resolveEffectiveViewRange,
    resolveViewRangeWorldY,
    resolveEffectivePlanDepthY,
} from '@pryzm/core-app-model';

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * userData flag name. When true, this service hid the object.
 * Cleared when the filter is deactivated or recalculated.
 */
const VRF_FLAG = '_vrfHidden';

/**
 * Element types that must never be filtered by the view range.
 * Includes annotation helpers, grid/level geometry, and tool previews.
 */
const UNFILTERED_TYPES = new Set<string>([
    'Preview', 'Snap', 'EdgeOverlay', 'Dimension', 'SelectionBox',
    'BimLevel', 'BimGrid', 'Grid', 'GridLine', 'Level', 'LevelLine',
    'TransformHelper', 'WallEdge',
]);

/**
 * Reusable Box3 — avoids per-object allocation during scene traversal.
 * Only one traversal runs at a time (single-threaded JS), so sharing is safe.
 */
const _tmpBox = new THREE.Box3();

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Resolves a (levelId, offset) ViewRangeBound to an absolute world Y coordinate.
 * Returns null when the referenced level does not exist in the project.
 */
function resolveWorldY(levelId: string, offset: number, levels: Level[]): number | null {
    const level = levels.find(l => l.id === levelId);
    return level != null ? level.elevation + offset : null;
}

/**
 * Tests whether a scene object's vertical extent overlaps the [minY, maxY] band.
 *
 * Strategy (in priority order):
 *   1. Use the object's actual world-space bounding box (most accurate).
 *      Correctly handles multi-storey elements (tall walls, atrium columns)
 *      whose physical extent spans multiple levels.
 *   2. If the bbox is empty (e.g. a Group node with no direct geometry),
 *      fall back to the level datum from userData.levelId.  This matches the
 *      original behaviour and keeps Group-level nodes visible when their
 *      children's individual meshes will be evaluated separately in the traversal.
 *
 * Audit fix (§21 root-cause 1): replaces the previous `level.elevation` proxy
 * which used only the level datum and produced incorrect results for elements
 * that physically span outside their host level's range.
 */
function objectInYRange(
    obj:    THREE.Object3D,
    minY:   number,
    maxY:   number,
    levels: Level[],
): boolean {
    _tmpBox.setFromObject(obj);

    if (!_tmpBox.isEmpty()) {
        // Overlap test: element bbox [min.y, max.y] overlaps [minY, maxY]
        return _tmpBox.max.y >= minY && _tmpBox.min.y <= maxY;
    }

    // Fallback: level datum
    const levelId = obj.userData?.levelId as string | undefined;
    if (!levelId) return true;   // no level context → do not hide
    const level = levels.find(l => l.id === levelId);
    if (!level) return true;     // unknown level → do not hide
    return level.elevation >= minY && level.elevation <= maxY;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ViewRangeFilterService {

    private readonly _scene: THREE.Scene;
    private readonly _getBimLevels: () => Level[];
    private _activeViewId: string | null = null;
    private readonly _listeners: Array<() => void> = [];

    constructor(scene: THREE.Scene, getBimLevels: () => Level[]) {
        this._scene = scene;
        this._getBimLevels = getBimLevels;
        elementSpatialIndex.bindScene(scene);
        this._subscribeToEvents();
    }

    // ── Event wiring ─────────────────────────────────────────────────────────

    private _subscribeToEvents(): void {
        const on = (event: string, handler: (e: Event) => void): void => {
            window.addEventListener(event, handler);
            this._listeners.push(() => window.removeEventListener(event, handler));
        };

        // Primary trigger: plan view selected.
        // VGSceneApplicator registered its listener before us (it is constructed
        // earlier in EngineBootstrap), so its applyAll() runs synchronously first.
        // Our handler therefore always runs AFTER VG has applied category styles.
        on('view-selected', (e) => {
            const detail = (e as CustomEvent).detail;
            const viewId: string | null = detail?.viewId ?? detail?.view?.id ?? null;
            this._activeViewId = viewId;
            this._applyFilter();
        });

        // View deactivated — clear all VRF flags so full visibility is restored
        // (VGSceneApplicator's resetAll also fires here, but we clear independently
        // so objects we hid are restored regardless of VG state).
        on('view-closed', () => {
            this._activeViewId = null;
            this._clearVrfFlags();
        });

        // VG re-apply events: VGSceneApplicator runs first (earlier listener),
        // restoring visibility for all VG-visible objects. We then re-enforce
        // the view range so out-of-range objects are hidden again.
        const reapply = (): void => {
            if (this._activeViewId) this._applyFilter();
        };
        on('vg:category-style-set',      reapply);
        on('vg:category-style-reset',    reapply);
        on('vg:model-template-assigned', reapply);
        on('vg:template-updated',        reapply);
        on('presentation-mode-changed',  reapply);

        // Re-enforce when the intent's belowLevelDepth changes so the
        // BEYOND zone depth is immediately updated in plan view.
        on('vi:intent-updated', reapply);
        on('vi:instance-updated', reapply);

        // View range saved via SetViewRangeCommand — immediately re-evaluate
        on('vd:view-range-changed', (e) => {
            const viewId = (e as CustomEvent).detail?.viewId;
            if (viewId === this._activeViewId) this._applyFilter();
        });
    }

    // ── Core filter logic ─────────────────────────────────────────────────────

    /**
     * Evaluates the active view's ViewRangeSettings and hides all scene objects
     * whose level elevation is outside the [depth, top] vertical band.
     *
     * Objects without a `userData.levelId` are left unchanged (no level context
     * means we cannot make a range decision — do not hide).
     *
     * Objects in UNFILTERED_TYPES are always skipped.
     */
    private _applyFilter(): void {
        // Always clear previous VRF flags before recalculating so that objects
        // that were hidden in a previous filter pass are correctly evaluated.
        this._clearVrfFlags();

        if (!this._activeViewId) return;

        const viewDef = viewDefinitionStore.get(this._activeViewId);

        // Only plan-family views are subject to filtering.
        // resolveEffectiveViewRange synthesises defaults when viewDef.viewRange
        // is not yet explicitly stored, so views that have never had their range
        // saved still get correct BEYOND-zone depth treatment.
        if (
            !viewDef ||
            !(PLAN_VIEW_TYPES as readonly string[]).includes(viewDef.viewType)
        ) {
            return;
        }

        const levels = this._getBimLevels();
        const effectiveRange = resolveEffectiveViewRange(viewDef, levels);
        if (!effectiveRange) return;

        const { top, depth } = effectiveRange;

        const topY = resolveViewRangeWorldY(top, levels) ?? resolveWorldY(top.levelId, top.offset, levels);

        // Use the intent-driven depth (belowLevelDepth from PlanViewRangeDefaults)
        // so the BEYOND zone extends 1.20 m below the current level floor,
        // making elements from the storey below visible as reference geometry.
        const depthY = resolveEffectivePlanDepthY(
            this._activeViewId,
            viewDef.viewType as string,
            viewDef.spatial?.levelId,
            depth,
            levels,
        );

        if (topY === null || depthY === null) {
            console.warn(
                `[ViewRangeFilterService] Cannot resolve bounds for view "${this._activeViewId}".` +
                ` top.levelId="${top.levelId}" depth.levelId="${depth.levelId}"`
            );
            return;
        }

        const minY = Math.min(depthY, topY);
        const maxY = Math.max(depthY, topY);

        console.log(
            `[ViewRangeFilterService] Enforcing range Y∈[${minY.toFixed(3)}, ${maxY.toFixed(3)}]` +
            ` for view "${this._activeViewId}"`
        );

        const visibleIds = new Set(elementSpatialIndex.queryVisible(minY, maxY));

        if (elementSpatialIndex.size > 0) {
            for (const { elementId, object: obj } of elementSpatialIndex.entries) {
                const elementType = obj.userData?.elementType as string | undefined;
                if (!elementType) continue;
                if (UNFILTERED_TYPES.has(elementType)) continue;
                if (obj.userData?.isPreview === true) continue;
                if (obj.userData?.isHelper  === true) continue;
                if (visibleIds.has(elementId)) continue;
                const levelId = obj.userData?.levelId as string | undefined;
                if (!levelId) continue;
                setUD(obj, VRF_FLAG, true);
                obj.visible = false;
            }
            return;
        }

        this._scene.traverse((obj: THREE.Object3D) => {
            // Skip objects with no elementType (not a BIM element)
            const elementType = obj.userData?.elementType as string | undefined;
            if (!elementType) return;

            // Skip unfiltered annotation / helper types
            if (UNFILTERED_TYPES.has(elementType)) return;

            // Skip tool previews and internal helpers
            if (obj.userData?.isPreview === true) return;
            if (obj.userData?.isHelper  === true) return;

            // Only filter objects that have level information.
            // Objects without levelId are not spatial BIM elements — skip.
            const levelId = obj.userData?.levelId as string | undefined;
            if (!levelId) return;

            // §21 fix: use objectInYRange (bbox-based) instead of level.elevation.
            // This correctly handles multi-storey elements whose physical extent
            // crosses multiple level datums.
            const inRange = objectInYRange(obj, minY, maxY, levels);

            if (!inRange && obj.visible) {
                setUD(obj, VRF_FLAG, true);
                obj.visible = false;
            }
        });
    }

    /**
     * Clears all VRF hidden flags and restores objects to visible.
     * Called when deactivating the filter (view closed, view changed to non-plan).
     * VGSceneApplicator will then re-apply its own visibility rules on the next event.
     */
    private _clearVrfFlags(): void {
        this._scene.traverse((obj: THREE.Object3D) => {
            if (obj.userData[VRF_FLAG]) {
                obj.visible = true;
                deleteUD(obj, VRF_FLAG);
            }
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Forces an immediate re-evaluation of the current view range filter.
     * Can be called externally when levels are added/modified.
     */
    reapply(): void {
        this._applyFilter();
    }

    /**
     * Removes all event listeners and restores full visibility.
     * Call when the engine is torn down.
     */
    dispose(): void {
        for (const unsub of this._listeners) unsub();
        this._listeners.length = 0;
        this._clearVrfFlags();
    }
}
