import * as THREE from '@pryzm/renderer-three/three';
import { applyWallEdgeRenderMode, WallEdgeRenderMode } from '@pryzm/geometry-wall';
// §EDGE131 (L-12100) — `isSlabFamilyEdge` is imported rather than re-listing
// `elementType` string literals up here in the UI layer. The owning package
// enumerates its own edge families once (`SLAB_FAMILY_EDGE_TYPES`); a family that
// grows an edge overlay registers there and is picked up by BOTH the visibility
// gate and the render-mode switch below, with nothing to keep in sync by hand.
import { applySlabEdgeRenderMode, isSlabFamilyEdge } from '@pryzm/geometry-slab';

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

    /** §EDGE-GATE-REAPPLY (L-1227) — unsubscribes for the rebuild re-apply. */
    private readonly _unsubs: Array<() => void> = [];

    constructor(scene: THREE.Scene) {
        this._scene = scene;
        this._installRebuildReapply();
    }

    /**
     * §EDGE-GATE-REAPPLY (L-1227) — THE MISSING HALF OF THE VIEW GATE.
     *
     * THE MEASUREMENT. The founder's production probe dump, on entry to the 3D view:
     *
     *     ×5   LineSegments | - | edges | 444444 | layers:1 | VISIBLE
     *
     * Five edge overlays VISIBLE in 3D, where `setVisible(isPlanMode)` had already
     * set every edge overlay it could see to `false`. Not 900 — five. That number is
     * the signature: this is not a broken gate, it is a gate that ran BEFORE these
     * five objects existed.
     *
     * WHY IT WAS ALWAYS GOING TO HAPPEN HERE, AND NOWHERE ELSE IN THE FAMILY.
     * `initScene.ts` gates four 2-D overlays out of the 3-D view on `view-activated`.
     * Three of them ALSO re-apply on element rebuild, and each says why in its own
     * comment — *"the builder always creates the hatch visible, so without this a
     * floor created while in the 3-D view would show its hatch until the next view
     * switch"* (floor hatch), and the same for the room fill. **The edge gate is the
     * one member with no such re-apply.** `WallEdgeOverlayBuilder.ts:143` and
     * `SlabFragmentBuilder.ts:1634` create their lines `visible = false`, which is
     * why the leak is five objects and not five hundred — but a rebuild that runs
     * `_apply()`-then-rebuild, or any builder path that ends visible, lands here.
     *
     * WHY THE SUBSCRIPTION LIVES IN THIS CLASS AND NOT AT THE CALL SITE.
     * The three siblings register their re-apply in `initScene`, next to the
     * `view-activated` handler. Copying that would make this the FOURTH hand-written
     * listener for one rule — the exact shape L-1197 refused for underlays. The
     * service already owns the question *"which edge overlays are visible?"*; it
     * therefore owns keeping the answer true, and does so wherever it is constructed.
     * No `initScene` edit is required, which is also why this is safe to land while
     * another lane holds that file.
     *
     * Deferred to a microtask for the reason the floor-hatch comment gives: the
     * builder that creates the overlay may be responding to the SAME event, and a
     * synchronous re-apply would run before the object exists.
     */
    private _installRebuildReapply(): void {
        if (typeof window === 'undefined') return;
        const reapply = (): void => { queueMicrotask(() => this._apply()); };
        const EVENTS = [
            'bim-wall-added', 'bim-wall-updated',
            'bim-slab-added', 'bim-slab-updated',
            // §EDGE131 (L-12100) — the two families this re-apply could never have
            // reached. L-1227's own probe dump is the evidence: it recorded
            // `×5 LineSegments | - | edges | 444444 | VISIBLE` and read it as a
            // TIMING race, but the `-` in the elementType column is the real
            // finding — `_apply()` filtered those five out by type, so no amount of
            // re-applying would ever have hidden them, and `444444` was not a wall
            // or a slab (`0x555555`) but FloorPanelBuilder's private edge colour.
            // Now that both families register, their rebuilds must re-apply too,
            // for the reason the floor-hatch handler in `initScene` gives: a floor
            // created while already in the 3-D view must not show its perimeter
            // until the next view switch.
            'bim-floor-added', 'bim-floor-updated',
            'bim-ceiling-added', 'bim-ceiling-updated',
        ] as const;
        for (const ev of EVENTS) {
            window.addEventListener(ev, reapply);
            this._unsubs.push(() => window.removeEventListener(ev, reapply));
        }
    }

    /** Drop the rebuild subscriptions. Idempotent. */
    dispose(): void {
        for (const off of this._unsubs) {
            try { off(); } catch { /* teardown must not throw */ }
        }
        this._unsubs.length = 0;
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
            } else if (isSlabFamilyEdge(obj)) {
                // §EDGE131 — slabs, floor finishes AND ceilings. Before L-12100 this
                // arm read `=== 'SlabEdges'`, so the two finish families were
                // restyled by nobody as well as hidden by nobody.
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
        //
        // §EDGE131 (L-12100) — THE GATE MATCHES ON A TYPE, SO AN UNTYPED OVERLAY WAS
        // INVISIBLE TO IT. The condition below is deliberately NOT "every node with
        // `role === 'edges'`": `lineworkProbe.attributeProducer` shows the scene also
        // carries projection linework and the parcel ring, and a catch-all here would
        // seize those. It follows that an overlay must REGISTER a known `elementType`
        // to be governed at all — and until L-12100 the floor-finish and ceiling
        // overlays registered none, so this gate skipped them on every view switch
        // and they drew their perimeter in 3-D on every storey, permanently.
        // `isSlabFamilyEdge` now answers for all three slab-family plate types.
        this._scene.traverse((obj) => {
            if (
                (obj.userData?.role === 'edges' && obj.userData?.elementType === 'WallEdges') ||
                isSlabFamilyEdge(obj)
            ) {
                obj.visible = this._visible;
            }
        });
    }
}
