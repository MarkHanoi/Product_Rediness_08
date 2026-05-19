/**
 * ViewRangeZoneApplicator — Phase VR-2 Zone Material Rendering
 * src/core/presentation/ViewRangeZoneApplicator.ts
 *
 * Applies Revit-equivalent zone-specific visual styles to scene objects based
 * on their view-range zone classification (CUT / PROJECTION / BEYOND).
 *
 * Zone visual rules:
 *
 *   CUT        — Element intersects the cut plane.
 *                Poche fill (hatching + thick lines) requires BRep CSG geometry
 *                generation — deferred. For now: stamp `userData._vraCutZone=true`
 *                and apply a mildly highlighted edge tint so the zone is at least
 *                distinguishable in the 3D view.
 *
 *   PROJECTION — Element is fully above bottomY and below the cut.
 *                No material override — rendered normally by VGSceneApplicator.
 *
 *   BEYOND     — Element is below bottomY but above depthY (the "view depth" band).
 *                Rendered as a ghost: semi-transparent grey mesh, reduced opacity.
 *                This approximates Revit's dashed "beyond" line style in 3D.
 *
 *   HIDDEN     — Handled by ViewRangeFilterService (obj.visible = false).
 *                This service only processes visible objects.
 *
 * Implementation notes:
 *   - Stores original materials in `userData._vraOrigMaterials` before overriding.
 *   - Restores originals when the filter is deactivated or re-applied.
 *   - Runs AFTER ViewRangeFilterService (registered later in EngineBootstrap so its
 *     'view-selected' listener fires after VRF's listener in the same microtask queue).
 *   - The BEYOND ghost material is a shared MeshBasicMaterial instance — cheap to
 *     apply and does not require per-object shader compilation.
 *
 * Contract compliance:
 *   §01 §2   — Read-only of stores; no Command calls; no store writes.
 *   §02 §1.2 — Level-to-world Y resolved via injected BimManager callback.
 *   §03 §1.1 — No mutation of ViewDefinition or any store data.
 *   §05 §7   — No DOM, no @thatopen/ui, no bim-* elements. Pure Three.js traversal.
 *   §07      — No server routes; client-side only.
 *
 * Usage (EngineBootstrap — construct AFTER ViewRangeFilterService):
 *   const zoneApplicator = new ViewRangeZoneApplicator(
 *       world.scene.three as THREE.Scene,
 *       () => bimManager.getLevels(),
 *   );
 */

import * as THREE from '@pryzm/renderer-three/three';
import { setUD, deleteUD } from './userDataSafe';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import { PLAN_VIEW_TYPES } from '../views/ViewDefinitionTypes';
import type { Level } from '@pryzm/core-app-model';
import { classifyElement, type ZoneClassification } from './ViewRangeClassifier';
import {
    resolveEffectiveViewRange,
    resolveViewRangeWorldY,
    resolveEffectivePlanDepthY,
} from '@pryzm/core-app-model';

// ─── Constants ────────────────────────────────────────────────────────────────

/** userData key: zone classification string set on processed objects. */
const VRA_ZONE_KEY = '_vraZone';
/** userData key: original materials saved before BEYOND override. */
const VRA_ORIG_MATS_KEY = '_vraOrigMaterials';

/**
 * Element types that must never be zone-styled.
 * Mirrors the UNFILTERED_TYPES set used in ViewRangeFilterService.
 */
const UNFILTERED_TYPES = new Set<string>([
    'Preview', 'Snap', 'EdgeOverlay', 'Dimension', 'SelectionBox',
    'BimLevel', 'BimGrid', 'Grid', 'GridLine', 'Level', 'LevelLine',
    'TransformHelper', 'WallEdge',
]);

// ─── Shared ghost material ─────────────────────────────────────────────────────

/**
 * Shared material applied to all BEYOND-zone objects.
 * A semi-transparent, desaturated grey.  Matches the spirit of Revit's dashed
 * "beyond" line style — visually subordinate but still readable.
 */
const BEYOND_MATERIAL = new THREE.MeshBasicMaterial({
    color: 0xaaaaaa,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
});
BEYOND_MATERIAL.name = '__VRA_BEYOND__';

// ─── Helper ───────────────────────────────────────────────────────────────────

function resolveWorldY(levelId: string, offset: number, levels: Level[]): number | null {
    const level = levels.find(l => l.id === levelId);
    return level != null ? level.elevation + offset : null;
}

/**
 * Collect all THREE.Material instances on an object.
 * Handles both `material` (Mesh) and `material[]` (multi-material Mesh).
 */
function getMaterials(obj: THREE.Object3D): THREE.Material[] {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        if (Array.isArray(obj.material)) return [...obj.material];
        if (obj.material) return [obj.material];
    }
    return [];
}

/**
 * Replace all materials on a Mesh/InstancedMesh with a single override.
 */
function applyMaterialOverride(obj: THREE.Object3D, mat: THREE.Material): void {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.material = mat;
    }
}

/**
 * Restore materials previously saved into `userData[VRA_ORIG_MATS_KEY]`.
 */
function restoreMaterials(obj: THREE.Object3D): void {
    const saved = obj.userData[VRA_ORIG_MATS_KEY] as THREE.Material[] | undefined;
    if (!saved) return;

    if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
        obj.material = saved.length === 1 ? saved[0] : saved;
    }
    deleteUD(obj, VRA_ORIG_MATS_KEY);
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ViewRangeZoneApplicator {

    private readonly _scene: THREE.Scene;
    private readonly _getBimLevels: () => Level[];
    private _activeViewId: string | null = null;
    private readonly _listeners: Array<() => void> = [];

    constructor(scene: THREE.Scene, getBimLevels: () => Level[]) {
        this._scene = scene;
        this._getBimLevels = getBimLevels;
        this._subscribeToEvents();
    }

    // ── Event wiring ─────────────────────────────────────────────────────────

    private _subscribeToEvents(): void {
        const on = (event: string, handler: (e: Event) => void): void => {
            window.addEventListener(event, handler);
            this._listeners.push(() => window.removeEventListener(event, handler));
        };

        // Primary trigger — fires AFTER VRF (which registered earlier).
        on('view-selected', (e) => {
            const detail = (e as CustomEvent).detail;
            const viewId: string | null = detail?.viewId ?? detail?.view?.id ?? null;
            this._activeViewId = viewId;
            this._applyZones();
        });

        on('view-closed', () => {
            this._activeViewId = null;
            this._clearZoneOverrides();
        });

        // Re-apply when VG styles change (mirrors VRF's reapply list).
        const reapply = (): void => {
            if (this._activeViewId) this._applyZones();
        };
        on('vg:category-style-set',      reapply);
        on('vg:category-style-reset',    reapply);
        on('vg:model-template-assigned', reapply);
        on('vg:template-updated',        reapply);
        on('presentation-mode-changed',  reapply);

        // Re-apply when the intent's belowLevelDepth changes so the BEYOND
        // zone boundary is immediately updated in plan view.
        on('vi:intent-updated',  reapply);
        on('vi:instance-updated', reapply);

        on('vd:view-range-changed', (e) => {
            const viewId = (e as CustomEvent).detail?.viewId;
            if (viewId === this._activeViewId) this._applyZones();
        });
    }

    // ── Core zone logic ───────────────────────────────────────────────────────

    /**
     * Resolve the four Y bounds for the active view and apply zone material
     * overrides to every visible, filterable scene object.
     */
    private _applyZones(): void {
        // Always clear previous overrides before re-classifying.
        this._clearZoneOverrides();

        if (!this._activeViewId) return;

        const viewDef = viewDefinitionStore.get(this._activeViewId);

        // Only plan-family views get zone material overrides.
        // resolveEffectiveViewRange synthesises defaults when viewDef.viewRange
        // is not yet explicitly stored — so BEYOND rendering works from the very
        // first time a plan view is activated, even before the user opens View
        // Properties and saves a range.
        if (
            !viewDef ||
            !(PLAN_VIEW_TYPES as readonly string[]).includes(viewDef.viewType)
        ) {
            return;
        }

        const levels = this._getBimLevels();
        const effectiveRange = resolveEffectiveViewRange(viewDef, levels);
        if (!effectiveRange) return;

        const { top, cut, bottom, depth } = effectiveRange;

        const topY    = resolveViewRangeWorldY(top,    levels) ?? resolveWorldY(top.levelId,    top.offset,    levels);
        const cutY    = resolveViewRangeWorldY(cut,    levels) ?? resolveWorldY(cut.levelId,    cut.offset,    levels);
        const bottomY = resolveViewRangeWorldY(bottom, levels) ?? resolveWorldY(bottom.levelId, bottom.offset, levels);

        // Use the intent-driven depth so the BEYOND zone extends 1.20 m below
        // the current level floor, showing structure from the storey below as
        // semi-transparent reference geometry (mirrors Revit "view depth" behaviour).
        const depthY = resolveEffectivePlanDepthY(
            this._activeViewId,
            viewDef.viewType as string,
            viewDef.spatial?.levelId,
            depth,
            levels,
        );

        if (topY === null || cutY === null || bottomY === null || depthY === null) {
            console.warn(
                `[ViewRangeZoneApplicator] Cannot resolve one or more bounds for view` +
                ` "${this._activeViewId}". top=${topY} cut=${cutY} bottom=${bottomY} depth=${depthY}`
            );
            return;
        }

        console.log(
            `[ViewRangeZoneApplicator] Applying zones for view "${this._activeViewId}"` +
            ` topY=${topY.toFixed(2)} cutY=${cutY.toFixed(2)}` +
            ` bottomY=${bottomY.toFixed(2)} depthY=${depthY.toFixed(2)}`
        );

        let countCut = 0, countProj = 0, countBeyond = 0;

        this._scene.traverse((obj: THREE.Object3D) => {
            // Only process visible BIM elements not hidden by VRF / CRF.
            if (!obj.visible) return;

            const elementType = obj.userData?.elementType as string | undefined;
            if (!elementType) return;
            if (UNFILTERED_TYPES.has(elementType)) return;
            if (obj.userData?.isPreview === true) return;
            if (obj.userData?.isHelper  === true) return;
            // Skip underlay elements — they have their own ghost pass.
            if (obj.userData?.underlayActive === true) return;

            const zone: ZoneClassification = classifyElement(
                obj, topY, cutY, bottomY, depthY,
            );

            // Stamp the zone for external tooling / debug.
            setUD(obj, VRA_ZONE_KEY, zone);

            switch (zone) {
                case 'CUT': {
                    // Mark for future poche rendering.  No material override yet
                    // (requires BRep cross-section geometry — deferred).
                    countCut++;
                    break;
                }
                case 'PROJECTION': {
                    // Normal material — no override needed.
                    countProj++;
                    break;
                }
                case 'BEYOND': {
                    // Save original materials and apply ghost override.
                    const orig = getMaterials(obj);
                    if (orig.length > 0) {
                        setUD(obj, VRA_ORIG_MATS_KEY, orig);
                        applyMaterialOverride(obj, BEYOND_MATERIAL);
                    }
                    countBeyond++;
                    break;
                }
                case 'HIDDEN':
                    // Should be invisible already (VRF); zone stamp is informational.
                    break;
            }
        });

        console.debug(
            `[ViewRangeZoneApplicator] Zones applied:` +
            ` CUT=${countCut} PROJECTION=${countProj} BEYOND=${countBeyond}`
        );
    }

    /**
     * Remove all zone stamps and material overrides, restoring original materials.
     * Called when the view is deactivated or before re-applying zones.
     */
    private _clearZoneOverrides(): void {
        this._scene.traverse((obj: THREE.Object3D) => {
            if (obj.userData[VRA_ZONE_KEY]) {
                restoreMaterials(obj);
                deleteUD(obj, VRA_ZONE_KEY);
            }
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Forces an immediate re-evaluation of zone overrides.
     * Can be called externally when levels or view range bounds change.
     */
    reapply(): void {
        this._applyZones();
    }

    /**
     * Removes all event listeners and clears all zone overrides.
     * Call when the engine is torn down.
     */
    dispose(): void {
        for (const unsub of this._listeners) unsub();
        this._listeners.length = 0;
        this._clearZoneOverrides();
    }
}
