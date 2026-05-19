/**
 * CropRegionFilterService — Phase VR-3 Crop Region Enforcement
 * src/core/presentation/CropRegionFilterService.ts
 *
 * Enforces the active plan view's ViewCropSettings by hiding Three.js scene
 * objects whose XZ bounding box falls entirely outside the crop region rectangle.
 *
 * Design:
 *   - Self-contained new file — NO modifications to any existing service.
 *   - Constructed in EngineBootstrap AFTER ViewRangeFilterService so its event
 *     listeners are registered later and therefore fire after VRF's listeners.
 *     Pipeline order: VG styles → View Range Z filter → Crop XY filter.
 *   - Objects are hidden via `obj.visible = false` and flagged with
 *     `userData._crfHidden = true`. Flag is cleared when the view changes,
 *     the crop is disabled, or the service is disposed.
 *   - Only objects with `userData.elementType` are evaluated. Annotation helpers,
 *     grid/level geometry, tool previews, and internal helpers are always skipped.
 *   - Crop uses XZ coordinates (level plane). Y-axis (vertical) is handled by VRF.
 *
 * Contract compliance:
 *   §01 §2    — Read-only of stores; no Command calls; no store writes.
 *   §02 §1.2  — No level-to-worldY resolution required (XZ filter only).
 *   §03 §1.1  — No mutation of ViewDefinition or any store data.
 *   §05 §7    — No DOM, no @thatopen/ui elements. Pure Three.js scene traversal.
 *   §07       — No server routes; client-side only.
 *
 * Element types never filtered (always visible regardless of crop):
 *   Preview, Snap, EdgeOverlay, Dimension, SelectionBox,
 *   BimLevel, BimGrid, Grid, GridLine, Level, LevelLine,
 *   TransformHelper, WallEdge
 *
 * Usage (EngineBootstrap — after ViewRangeFilterService):
 *   import { CropRegionFilterService } from '../core/presentation/CropRegionFilterService';
 *   const cropFilterService = new CropRegionFilterService(world.scene.three as THREE.Scene);
 *   window.cropFilterService = cropFilterService;
 */

import * as THREE from '@pryzm/renderer-three/three';
import { setUD, deleteUD } from './userDataSafe';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import { PLAN_VIEW_TYPES } from '../views/ViewDefinitionTypes';

// ─── Constants ────────────────────────────────────────────────────────────────

/** userData flag — set when this service hid the object. Cleared on recalculation. */
const CRF_FLAG = '_crfHidden';

/**
 * Element types that must never be filtered by the crop region.
 * Mirrors the UNFILTERED_TYPES in ViewRangeFilterService for consistency.
 */
const UNFILTERED_TYPES = new Set<string>([
    'Preview', 'Snap', 'EdgeOverlay', 'Dimension', 'SelectionBox',
    'BimLevel', 'BimGrid', 'Grid', 'GridLine', 'Level', 'LevelLine',
    'TransformHelper', 'WallEdge',
]);

/**
 * Reusable Box3 — avoids per-object allocation during scene traversal.
 * Single-threaded JS makes this safe to share across traversal calls.
 */
const _tmpBox = new THREE.Box3();

// ─── Service ──────────────────────────────────────────────────────────────────

export class CropRegionFilterService {

    private readonly _scene: THREE.Scene;
    private _activeViewId: string | null = null;
    private readonly _listeners: Array<() => void> = [];

    constructor(scene: THREE.Scene) {
        this._scene = scene;
        this._subscribeToEvents();
    }

    // ── Event wiring ─────────────────────────────────────────────────────────

    private _subscribeToEvents(): void {
        const on = (event: string, handler: (e: Event) => void): void => {
            window.addEventListener(event, handler);
            this._listeners.push(() => window.removeEventListener(event, handler));
        };

        // Primary trigger: plan view selected.
        // Constructed after ViewRangeFilterService → this listener fires after VRF's.
        on('view-selected', (e) => {
            const detail = (e as CustomEvent).detail;
            const viewId: string | null = detail?.viewId ?? detail?.view?.id ?? null;
            this._activeViewId = viewId;
            this._applyFilter();
        });

        // View deactivated — restore all CRF-hidden objects.
        on('view-closed', () => {
            this._activeViewId = null;
            this._clearCrfFlags();
        });

        // Crop settings changed on the active view — re-enforce immediately.
        // ViewDefinitionStore.setCrop dispatches 'vd:view-updated'.
        on('vd:view-updated', (e) => {
            const viewId = (e as CustomEvent).detail?.viewId;
            if (viewId === this._activeViewId) this._applyFilter();
        });

        // Re-apply after VG re-apply events.
        // VGSceneApplicator's listener (registered earlier) runs first and
        // restores visibility; we then re-enforce the crop region.
        const reapply = (): void => {
            if (this._activeViewId) this._applyFilter();
        };
        on('vg:category-style-set',      reapply);
        on('vg:category-style-reset',    reapply);
        on('vg:model-template-assigned', reapply);
        on('vg:template-updated',        reapply);
        on('presentation-mode-changed',  reapply);

        // Re-apply after ViewRangeFilterService updates (VRF listener registered earlier).
        on('vd:view-range-changed', reapply);
    }

    // ── Core filter logic ─────────────────────────────────────────────────────

    /**
     * Evaluates the active view's ViewCropSettings and hides all scene objects
     * whose XZ bounding box falls entirely outside the crop region.
     *
     * Objects already hidden by ViewRangeFilterService (visible = false) are
     * skipped — they are already not rendered and we should not double-flag them.
     *
     * If crop is disabled or has no region defined, the filter is a no-op.
     */
    private _applyFilter(): void {
        // Clear previous CRF flags before recalculating.
        this._clearCrfFlags();

        if (!this._activeViewId) return;

        const viewDef = viewDefinitionStore.get(this._activeViewId);

        // Only plan-family views with an enabled crop region are subject to filtering.
        if (
            !viewDef ||
            !(PLAN_VIEW_TYPES as readonly string[]).includes(viewDef.viewType) ||
            !viewDef.crop?.enabled ||
            !viewDef.crop?.region
        ) {
            return;
        }

        const { region } = viewDef.crop;
        // Normalise so min < max regardless of how the user drew the region.
        const minX = Math.min(region.min[0], region.max[0]);
        const maxX = Math.max(region.min[0], region.max[0]);
        const minZ = Math.min(region.min[1], region.max[1]);
        const maxZ = Math.max(region.min[1], region.max[1]);

        console.log(
            `[CropRegionFilterService] Enforcing crop X∈[${minX.toFixed(3)}, ${maxX.toFixed(3)}]` +
            ` Z∈[${minZ.toFixed(3)}, ${maxZ.toFixed(3)}]` +
            ` for view "${this._activeViewId}"`
        );

        this._scene.traverse((obj: THREE.Object3D) => {
            // Skip non-BIM objects (no elementType).
            const elementType = obj.userData?.elementType as string | undefined;
            if (!elementType) return;

            // Skip annotation helpers, grids, levels.
            if (UNFILTERED_TYPES.has(elementType)) return;

            // Skip tool previews and internal helpers.
            if (obj.userData?.isPreview === true) return;
            if (obj.userData?.isHelper  === true) return;

            // Skip objects already hidden (by VRF, VG, or another filter).
            // We do not want to double-flag and then incorrectly restore them.
            if (!obj.visible) return;

            // Compute the world-space bounding box of the object.
            _tmpBox.setFromObject(obj);

            // If the bbox is empty (e.g. an empty Group with no geometry),
            // skip — its children will be evaluated individually.
            if (_tmpBox.isEmpty()) return;

            // XZ overlap test: element bbox outside crop region → hide.
            // An element is visible as long as its bbox partially overlaps the crop.
            const noOverlapX = _tmpBox.max.x < minX || _tmpBox.min.x > maxX;
            const noOverlapZ = _tmpBox.max.z < minZ || _tmpBox.min.z > maxZ;

            if (noOverlapX || noOverlapZ) {
                setUD(obj, CRF_FLAG, true);
                obj.visible = false;

                console.debug(
                    `[CropRegionFilterService] Hide "${elementType}" ` +
                    `bbox=[${_tmpBox.min.x.toFixed(2)},${_tmpBox.min.z.toFixed(2)}]–` +
                    `[${_tmpBox.max.x.toFixed(2)},${_tmpBox.max.z.toFixed(2)}]`
                );
            }
        });
    }

    /**
     * Clears all CRF-hidden flags and restores objects to visible.
     * Called when the view closes, crop is disabled, or the active view changes.
     */
    private _clearCrfFlags(): void {
        this._scene.traverse((obj: THREE.Object3D) => {
            if (obj.userData[CRF_FLAG]) {
                obj.visible = true;
                deleteUD(obj, CRF_FLAG);
            }
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Forces an immediate re-evaluation of the crop region filter.
     * Can be called externally when crop settings are modified programmatically.
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
        this._clearCrfFlags();
    }
}
