/**
 * UnderlayRenderService — Phase VR-4 Underlay Rendering Pass
 * src/core/presentation/UnderlayRenderService.ts
 *
 * Implements BIM underlay rendering: shows another level's elements as a
 * ghosted reference within a plan view. Reads `viewDef.underlay` from the
 * active plan view's ViewDefinition and applies a halftone ghost material to
 * all elements whose world-space bounding box overlaps the underlay Z band
 * [baseLevelId elevation, topLevelId elevation].
 *
 * Design:
 *   - Self-contained new file — NO modifications to any existing service.
 *   - Constructed in EngineBootstrap AFTER CropRegionFilterService so its
 *     event listeners fire last in the pipeline:
 *       VG → View Range Z → Crop XY → Underlay ghost pass.
 *   - Elements in the underlay Z band that are hidden by ViewRangeFilterService
 *     (because they are outside the main view range) are made visible again as
 *     underlay geometry with ghost material. They remain non-selectable.
 *   - Ghost material: world-space XZ dot-grid halftone GLSL shader (larger dot
 *     spacing than VGSceneApplicator P4.4 for a lighter underlay appearance).
 *   - Element materials are saved in `userData._underlayOrigMat` before override
 *     and restored on deactivation or view change.
 *   - `userData.underlayActive = true` is set on underlay objects so that
 *     SelectionManager excludes them from the selectable-objects cache.
 *
 * Orientation:
 *   - 'lookingDown' (default): show elements from a level below the current floor plan.
 *   - 'lookingUp': show elements from a level above (reflected ceiling plan context).
 *   Both filter by the same Z range; the orientation is stored on userData for
 *   future annotation/snap behaviour to consume. Full visual distinction between
 *   orientations is deferred to a subsequent engineering phase.
 *
 * Contract compliance:
 *   §01 §2    — Read-only of stores; no Command calls; no store writes.
 *   §02 §1.2  — Level-to-worldY resolved via getLevels() callback (no BimManager import).
 *   §03 §1.1  — No mutation of ViewDefinition or any store data.
 *   §05 §7    — No DOM, no @thatopen/ui elements. Pure Three.js scene traversal.
 *   §07       — No server routes; client-side only.
 *
 * Non-selectable contract:
 *   Objects with `userData.underlayActive = true` must be excluded by SelectionManager's
 *   selectable-objects cache (line 273 guard). The SelectionManager addition is a
 *   one-line additive change that does not affect any existing selection behaviour.
 *
 * Usage (EngineBootstrap — after CropRegionFilterService):
 *   import { UnderlayRenderService } from '../core/presentation/UnderlayRenderService';
 *   const underlayRenderService = new UnderlayRenderService(
 *       world.scene.three as THREE.Scene,
 *       () => bimManager.getLevels(),
 *   );
 *   window.underlayRenderService = underlayRenderService;
 */

import * as THREE from '@pryzm/renderer-three/three';
import { setUD, deleteUD } from './userDataSafe';
import { viewDefinitionStore } from '../views/ViewDefinitionStore';
import { PLAN_VIEW_TYPES } from '../views/ViewDefinitionTypes';
import type { Level } from '@pryzm/core-app-model';

// ─── Constants ────────────────────────────────────────────────────────────────

/** userData key — saves the mesh's material before ghost override. */
const URS_ORIG_MAT_KEY = '_underlayOrigMat';

/** userData flag — marks objects currently rendered as underlay geometry. */
const URS_ACTIVE_KEY   = 'underlayActive';

/** userData key — stores the underlay orientation on the object for consumers. */
const URS_ORIENT_KEY   = '_underlayOrientation';

/**
 * Element types that must never be treated as underlay geometry.
 * Mirrors UNFILTERED_TYPES in ViewRangeFilterService.
 */
const UNFILTERED_TYPES = new Set<string>([
    'Preview', 'Snap', 'EdgeOverlay', 'Dimension', 'SelectionBox',
    'BimLevel', 'BimGrid', 'Grid', 'GridLine', 'Level', 'LevelLine',
    'TransformHelper', 'WallEdge',
]);

// ─── Ghost Halftone Shader ────────────────────────────────────────────────────
// World-space XZ dot-grid — larger spacing and smaller dots than VGSceneApplicator
// P4.4 to produce a lighter, clearly subordinate underlay appearance.
// No UV mapping required; works on any geometry.

const UNDERLAY_VERTEX_SHADER = /* glsl */`
varying vec3 vWorldPos;
void main() {
    vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const UNDERLAY_FRAGMENT_SHADER = /* glsl */`
uniform vec3  u_fillColor;
uniform float u_dotSpacing;
uniform float u_dotSize;
varying vec3  vWorldPos;

void main() {
    vec2 coord = fract(vWorldPos.xz / u_dotSpacing);
    float dist = length(coord - 0.5);
    if (dist > u_dotSize * 0.5) discard;
    gl_FragColor = vec4(u_fillColor, 1.0);
}
`;

/**
 * Creates the underlay ghost halftone material.
 * Colour defaults to mid-grey (#888888) with larger dot spacing than VG halftone.
 */
function createUnderlayGhostMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        uniforms: {
            u_fillColor:  { value: new THREE.Color(0x888888) },
            u_dotSpacing: { value: 0.25 },  // larger than VG's 0.15 → lighter appearance
            u_dotSize:    { value: 0.35 },  // slightly smaller dots
        },
        vertexShader:   UNDERLAY_VERTEX_SHADER,
        fragmentShader: UNDERLAY_FRAGMENT_SHADER,
        transparent:    false,
        side:           THREE.DoubleSide,
        depthWrite:     true,
    });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolves a level ID to its world Y elevation.
 * Returns null if the level is not found in the levels list.
 */
function resolveWorldY(levelId: string, levels: Level[]): number | null {
    const level = levels.find(l => l.id === levelId);
    return level != null ? level.elevation : null;
}

/** Reusable Box3 to avoid per-object allocation during traversal. */
const _tmpBox = new THREE.Box3();

// ─── Service ──────────────────────────────────────────────────────────────────

export class UnderlayRenderService {

    private readonly _scene: THREE.Scene;
    private readonly _getBimLevels: () => Level[];
    private _activeViewId: string | null = null;
    private readonly _listeners: Array<() => void> = [];

    /** Shared ghost material instance. Reused for all underlay meshes. */
    private readonly _ghostMat: THREE.ShaderMaterial = createUnderlayGhostMaterial();

    constructor(scene: THREE.Scene, getBimLevels: () => Level[]) {
        this._scene      = scene;
        this._getBimLevels = getBimLevels;
        this._subscribeToEvents();
    }

    // ── Event wiring ─────────────────────────────────────────────────────────

    private _subscribeToEvents(): void {
        const on = (event: string, handler: (e: Event) => void): void => {
            window.addEventListener(event, handler);
            this._listeners.push(() => window.removeEventListener(event, handler));
        };

        // Primary trigger: plan view selected.
        // Constructed last → this listener fires after VG, VRF, and CRF listeners.
        on('view-selected', (e) => {
            const detail = (e as CustomEvent).detail;
            const viewId: string | null = detail?.viewId ?? detail?.view?.id ?? null;
            this._activeViewId = viewId;
            this._applyUnderlay();
        });

        // View deactivated — restore all underlay materials and clear flags.
        on('view-closed', () => {
            this._activeViewId = null;
            this._clearUnderlayState();
        });

        // Underlay settings changed — re-evaluate.
        // ViewDefinitionStore.setUnderlay dispatches 'vd:view-updated'.
        on('vd:view-updated', (e) => {
            const viewId = (e as CustomEvent).detail?.viewId;
            if (viewId === this._activeViewId) this._applyUnderlay();
        });

        // Re-apply after VG + VRF + CRF re-apply events.
        // Because this service is constructed LAST, these listeners fire after
        // VG, VRF, and CRF have all completed their passes.
        const reapply = (): void => {
            if (this._activeViewId) this._applyUnderlay();
        };
        on('vg:category-style-set',      reapply);
        on('vg:category-style-reset',    reapply);
        on('vg:model-template-assigned', reapply);
        on('vg:template-updated',        reapply);
        on('presentation-mode-changed',  reapply);
        on('vd:view-range-changed',      reapply);
    }

    // ── Core underlay logic ───────────────────────────────────────────────────

    /**
     * Evaluates the active view's ViewUnderlaySettings and applies a ghost
     * halftone material to all elements whose bounding box overlaps the underlay
     * Z band [baseLevelY, topLevelY].
     *
     * Elements in the underlay band that are currently hidden (by VRF because
     * they are outside the main view range) are made visible again as underlay
     * geometry. They are marked with `userData.underlayActive = true` to prevent
     * SelectionManager from including them in the selectable-objects cache.
     *
     * If no underlay is configured, or `baseLevelId` is missing, this is a no-op.
     */
    private _applyUnderlay(): void {
        // Always clear previous underlay state before recalculating.
        this._clearUnderlayState();

        if (!this._activeViewId) return;

        const viewDef = viewDefinitionStore.get(this._activeViewId);

        // Only plan-family views with an underlay configured are processed.
        if (
            !viewDef ||
            !(PLAN_VIEW_TYPES as readonly string[]).includes(viewDef.viewType) ||
            !viewDef.underlay?.baseLevelId
        ) {
            return;
        }

        const underlay = viewDef.underlay!;
        const levels   = this._getBimLevels();

        const baseLevelY = resolveWorldY(underlay.baseLevelId!, levels);
        if (baseLevelY === null) {
            console.warn(
                `[UnderlayRenderService] Cannot resolve baseLevelId="${underlay.baseLevelId}"` +
                ` for view "${this._activeViewId}"`
            );
            return;
        }

        // topLevelId is optional — if absent, use baseLevelId elevation + standard storey height.
        let topLevelY: number;
        if (underlay.topLevelId) {
            const resolved = resolveWorldY(underlay.topLevelId, levels);
            if (resolved === null) {
                console.warn(
                    `[UnderlayRenderService] Cannot resolve topLevelId="${underlay.topLevelId}"` +
                    ` for view "${this._activeViewId}" — using baseLevelY + 5m fallback`
                );
                topLevelY = baseLevelY + 5.0;
            } else {
                topLevelY = resolved;
            }
        } else {
            // No topLevelId — use baseLevelY + 5m as a safe storey-height fallback.
            topLevelY = baseLevelY + 5.0;
        }

        const minY = Math.min(baseLevelY, topLevelY);
        const maxY = Math.max(baseLevelY, topLevelY);

        console.log(
            `[UnderlayRenderService] Applying underlay Y∈[${minY.toFixed(3)}, ${maxY.toFixed(3)}]` +
            ` orientation="${underlay.orientation ?? 'lookingDown'}"` +
            ` for view "${this._activeViewId}"`
        );

        let underlayCount = 0;

        this._scene.traverse((obj: THREE.Object3D) => {
            // Skip non-BIM objects.
            const elementType = obj.userData?.elementType as string | undefined;
            if (!elementType) return;

            // Skip annotation/helper types.
            if (UNFILTERED_TYPES.has(elementType)) return;

            // Skip tool previews and internal helpers.
            if (obj.userData?.isPreview === true) return;
            if (obj.userData?.isHelper  === true) return;

            // Compute the world-space bounding box.
            _tmpBox.setFromObject(obj);
            if (_tmpBox.isEmpty()) return;

            // Z (Y in world-space) overlap test against the underlay band.
            const overlapsUnderlay = _tmpBox.max.y >= minY && _tmpBox.min.y <= maxY;
            if (!overlapsUnderlay) return;

            // ── Apply underlay ghost style ─────────────────────────────────

            // Make the object visible (it may have been hidden by VRF because it
            // is outside the main view's depth–top range).
            obj.visible = true;

            // Mark as underlay geometry → excluded from selection raycasting.
            setUD(obj, URS_ACTIVE_KEY, true);
            setUD(obj, URS_ORIENT_KEY, underlay.orientation ?? 'lookingDown');

            // Apply ghost material only to Mesh instances.
            // Line segments (edge overlays) and Groups are left unchanged — the
            // ghost halftone on the fill meshes is sufficient visual distinction.
            if (obj instanceof THREE.Mesh) {
                if (!obj.userData[URS_ORIG_MAT_KEY]) {
                    // Save the current material (which may already be a VG clone).
                    setUD(obj, URS_ORIG_MAT_KEY, obj.material);
                }
                obj.material = this._ghostMat;
            }

            underlayCount++;
        });

        console.log(
            `[UnderlayRenderService] Applied underlay ghost to ${underlayCount} objects` +
            ` for view "${this._activeViewId}"`
        );
    }

    /**
     * Restores all underlay objects to their pre-underlay materials and removes
     * all `underlayActive` / orientation flags. Objects hidden by VRF remain
     * hidden — only the ghost material override is reversed here.
     */
    private _clearUnderlayState(): void {
        this._scene.traverse((obj: THREE.Object3D) => {
            if (!obj.userData[URS_ACTIVE_KEY]) return;

            // Restore material if we saved the original.
            if (obj instanceof THREE.Mesh && obj.userData[URS_ORIG_MAT_KEY]) {
                obj.material = obj.userData[URS_ORIG_MAT_KEY] as THREE.Material;
                deleteUD(obj, URS_ORIG_MAT_KEY);
            }

            // Remove underlay flags.
            deleteUD(obj, URS_ACTIVE_KEY);
            deleteUD(obj, URS_ORIENT_KEY);

            // If this object was made visible by the underlay pass AND was
            // previously hidden by VRF (_vrfHidden still set), re-hide it so
            // the scene returns to the pre-underlay visibility state.
            if (obj.userData._vrfHidden === true) {
                obj.visible = false;
            }
        });
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Forces an immediate re-evaluation of the underlay pass.
     * Can be called externally when levels are added or underlay settings change.
     */
    reapply(): void {
        this._applyUnderlay();
    }

    /**
     * Removes all event listeners, restores materials, and clears all flags.
     * Call when the engine is torn down.
     */
    dispose(): void {
        for (const unsub of this._listeners) unsub();
        this._listeners.length = 0;
        this._clearUnderlayState();
        this._ghostMat.dispose();
    }
}
