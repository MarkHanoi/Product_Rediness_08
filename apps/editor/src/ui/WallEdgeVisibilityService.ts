import * as THREE from '@pryzm/renderer-three/three';
import { applyWallEdgeRenderMode, WallEdgeRenderMode } from '@pryzm/geometry-wall';
import { applySlabEdgeRenderMode } from '@pryzm/geometry-slab';

/**
 * WallEdgeVisibilityService
 *
 * Manages user-controlled wall-edge overlay visibility as a pure render-layer
 * concern — mirrors the GridToggleService pattern exactly.
 *
 * Wall edge overlays are THREE.LineSegments tagged with:
 *   userData.elementType === 'WallEdges'
 *   userData.role         === 'edges'
 *
 * These tags were stamped at build time by WallEdgeOverlayBuilder so that
 * this service can locate and toggle them without any store access.
 *
 * Contract compliance:
 *  §01-1.1  UI/Tool layer — no store mutations.
 *  §02      No geometry or coordinate changes.
 *  §03      No semantic model touched.
 *  §05-7.1  No direct store write from UI — scene traverse is render-layer only.
 *
 * ── B2: applyRenderMode() ────────────────────────────────────────────────────
 * In addition to visibility toggle, this service now manages the visual render
 * mode of all edge overlays.  applyRenderMode('plan') switches all edges to
 * crisp black (0x000000), depthTest=false, renderOrder=999 — matching the white
 * B1 plan-view background for maximum contrast.  applyRenderMode('3d') restores
 * the default subtle grey settings.
 *
 * This is wired in EngineBootstrap's 'view-activated' handler alongside
 * setVisible() so both operations happen in one scene traversal pass:
 *
 *   const isPlanMode = mode === 'Top' || mode === 'Ground Floor';
 *   wallEdgeVisibilityService.setVisible(isPlanMode);
 *   wallEdgeVisibilityService.applyRenderMode(isPlanMode ? 'plan' : '3d');
 */
export class WallEdgeVisibilityService {
    private _scene: THREE.Scene;
    private _visible: boolean = false;

    constructor(scene: THREE.Scene) {
        this._scene = scene;
    }

    /** Returns true when wall edges are currently shown. */
    get isVisible(): boolean {
        return this._visible;
    }

    /** Show all wall edge overlays. */
    show(): void {
        this._visible = true;
        this._apply();
    }

    /** Hide all wall edge overlays. */
    hide(): void {
        this._visible = false;
        this._apply();
    }

    /** Toggle wall edges on/off. Returns the new state. */
    toggle(): boolean {
        this._visible = !this._visible;
        this._apply();
        return this._visible;
    }

    /** Set visibility directly. */
    setVisible(visible: boolean): void {
        this._visible = visible;
        this._apply();
    }

    /**
     * B2 — Apply a render mode to all edge overlays in the scene.
     *
     * '3d'  — subtle grey material, depth-tested (default, for perspective views).
     * 'plan' — crisp black material, no depth-test, renderOrder=999 (for plan views
     *           that force a white background via B1).
     *
     * Delegates to the per-type apply functions exported from the builder modules
     * so material constants are never duplicated.  Safe to call at any time;
     * objects without the correct userData tags are silently skipped.
     *
     * Call this whenever setVisible() is called so both operations are in sync:
     *   wallEdgeVisibilityService.setVisible(isPlanMode);
     *   wallEdgeVisibilityService.applyRenderMode(isPlanMode ? 'plan' : '3d');
     */
    applyRenderMode(mode: WallEdgeRenderMode): void {
        this._scene.traverse((obj) => {
            if (obj.userData?.role !== 'edges') return;

            if (obj.userData?.elementType === 'WallEdges') {
                applyWallEdgeRenderMode(obj, mode);
            } else if (obj.userData?.elementType === 'SlabEdges') {
                applySlabEdgeRenderMode(obj, mode);
            }
        });
        console.log(`[WallEdgeVisibilityService] Edge render mode set to '${mode}'.`);
    }

    private _apply(): void {
        // ── Doc 20 Fix: use userData.role as the primary discriminator ────────
        // The previous check (instanceof THREE.LineSegments) silently failed for
        // LineSegments2 objects, which extend THREE.Mesh — never THREE.LineSegments.
        // After the Doc 20 migration, edge overlays are THREE.LineSegments; but
        // userData.role = 'edges' is the authoritative, type-system-independent tag
        // stamped by both WallEdgeOverlayBuilder and SlabFragmentBuilder.
        // SlabEdges are included so the V/G toggle correctly hides slab outlines too.
        this._scene.traverse((obj) => {
            if (
                obj.userData?.role === 'edges' &&
                (obj.userData?.elementType === 'WallEdges' ||
                 obj.userData?.elementType === 'SlabEdges')
            ) {
                obj.visible = this._visible;
            }
        });
    }
}
