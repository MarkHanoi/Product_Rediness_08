/**
 * WallTransformController
 *
 * When a wall is selected, re-orients the TransformControls gizmo so that its
 * three axes align with the wall's natural coordinate system:
 *
 *   local X  →  wall baseline direction (S → E)
 *   local Y  →  world up (unchanged)
 *   local Z  →  wall normal (perpendicular to baseline, in XZ plane)
 *
 * TECHNIQUE — invisible proxy object
 * -----------------------------------
 * TransformControls derives gizmo orientation from the quaternion of its
 * attached object when `space = 'local'`.  The wallGroup itself has an identity
 * quaternion (its child geometry is placed in world-space coordinates), so we
 * cannot simply set the space to 'local' on the wallGroup.
 *
 * Instead this controller:
 *   1. Creates a lightweight invisible THREE.Object3D (proxy) with the wall's
 *      orientation quaternion baked in.
 *   2. Attaches TransformControls to the proxy (not the wallGroup).
 *   3. During each drag gesture, forwards proxy.position delta → wallGroup.position
 *      so the rendered geometry moves in real-time.
 *   4. On deactivation, restores TransformControls to world-space mode.
 *
 * The existing drag-end handler in main.ts reads wallGroup.position to compute
 * the displacement and calls wallStore.update() — that code path is completely
 * unchanged.
 *
 * CONTRACT COMPLIANCE
 * -------------------
 * §01 §2.1  – No direct store mutations inside this file.
 * §02 §4    – No geometry construction.
 * §03 §1.5  – Reads only userData fields written by WallFragmentBuilder
 *              (elementType, baseLine).
 *
 * ISOLATION
 * ---------
 * Two wiring points in main.ts only (mirrors HostedElementDragController):
 *   1. Instantiate after hostedDragController (before selectionManager).
 *   2. Call activateFor(obj) / deactivate() in the bim-selection-changed listener,
 *      AFTER hostedDragController so this controller runs second and wins the
 *      TransformControls attachment.
 *
 * §2.10 BUG-A FIX: In the 'change' listener the controller now also moves all
 * hosted element (door/window) scene groups whose userData.wallId matches the
 * dragged wall, keeping them in sync with the wall during live drag.
 * Their world positions at drag-start are captured in the 'dragging-changed'
 * listener (event.value = true) into _hostedElementDragStart.
 *
 * §2.10 BUG-B FIX: The 'change' listener also updates wallGroup.userData.baseLine
 * on every frame so SelectionManager.applyHighlight() can read a fresh value.
 * The pre-drag baseline is captured into _baseLineDragStart at drag-start.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { TransformControls } from '@pryzm/renderer-three';

export class WallTransformController {
    /** Invisible pivot — TransformControls is attached here instead of wallGroup. */
    private readonly proxy = new THREE.Object3D();

    private isActive = false;
    private currentWallGroup: THREE.Object3D | null = null;

    /** Proxy world position at the start of the current drag gesture. */
    private readonly proxyDragStart = new THREE.Vector3();
    /** WallGroup world position at the start of the current drag gesture. */
    private readonly wallGroupDragStart = new THREE.Vector3();

    /** §2.10 Bug-A: hosted element (door/window) positions at drag-start. */
    private readonly _hostedElementDragStart = new Map<string, THREE.Vector3>();

    /** §2.10 Bug-B: wall userData.baseLine captured at drag-start for live update. */
    private _baseLineDragStart: [
        { x: number; y: number; z: number },
        { x: number; y: number; z: number }
    ] | null = null;

    constructor(
        private readonly transformControls: TransformControls,
        private readonly scene: THREE.Scene,
    ) {
        this.proxy.userData.isHelper = true;
        this.proxy.userData.isWallTransformProxy = true;

        // ── Live drag sync ───────────────────────────────────────────────────
        // Forward proxy position delta → wallGroup so geometry follows in real time.
        this.transformControls.addEventListener('change', () => {
            if (!this.isActive || !this.currentWallGroup) return;
            const delta = this.proxy.position.clone().sub(this.proxyDragStart);
            this.currentWallGroup.position.copy(
                this.wallGroupDragStart.clone().add(delta),
            );

            // §2.10 Bug-A FIX: move hosted element (door/window) scene groups
            // by the same delta so they track the wall during live drag.
            // Only XZ components are displaced; Y is intentionally unchanged
            // (doors/windows inherit their Y from wall elevation, not from drag).
            const wallId = this.currentWallGroup.userData?.id as string | undefined;
            if (wallId) {
                for (const child of this.scene.children) {
                    if (child.userData?.wallId === wallId && !child.userData?.isHelper) {
                        const startPos = this._hostedElementDragStart.get(child.uuid);
                        if (startPos) {
                            child.position.set(
                                startPos.x + delta.x,
                                startPos.y,
                                startPos.z + delta.z,
                            );
                        }
                    }
                }
            }

            // §2.10 Bug-B FIX: keep userData.baseLine in sync during drag so
            // SelectionManager.applyHighlight() always reads the current position.
            if (this._baseLineDragStart) {
                this.currentWallGroup.userData.baseLine = [
                    {
                        x: this._baseLineDragStart[0].x + delta.x,
                        y: this._baseLineDragStart[0].y,
                        z: this._baseLineDragStart[0].z + delta.z,
                    },
                    {
                        x: this._baseLineDragStart[1].x + delta.x,
                        y: this._baseLineDragStart[1].y,
                        z: this._baseLineDragStart[1].z + delta.z,
                    },
                ];
            }
        });

        // ── Drag-start snapshot ──────────────────────────────────────────────
        // Re-capture start positions at the beginning of EACH drag gesture so
        // that multiple consecutive drags on the same selected wall are independent.
        this.transformControls.addEventListener('dragging-changed', (event: any) => {
            // Ignore drag-end events during a view switch — the proxy is being
            // cleaned up by ViewController and the drag is implicitly cancelled.
            if (window.__viewSwitchInProgress) return;
            if (!this.isActive || !this.currentWallGroup) return;
            if (event.value) {
                // Drag begins — re-sync proxy to wallGroup to cancel any Y drift
                // that the post-drag store update may have introduced.
                this.proxy.position.copy(this.currentWallGroup.position);
                this.proxyDragStart.copy(this.proxy.position);
                this.wallGroupDragStart.copy(this.currentWallGroup.position);

                // §2.10 Bug-A FIX: snapshot all hosted element positions for this wall.
                const wallId = this.currentWallGroup.userData?.id as string | undefined;
                this._hostedElementDragStart.clear();
                if (wallId) {
                    for (const child of this.scene.children) {
                        if (child.userData?.wallId === wallId && !child.userData?.isHelper) {
                            this._hostedElementDragStart.set(child.uuid, child.position.clone());
                        }
                    }
                }

                // §2.10 Bug-B FIX: snapshot baseLine so change listener can translate it.
                const bl = this.currentWallGroup.userData?.baseLine as
                    [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] | undefined;
                this._baseLineDragStart = bl
                    ? [{ ...bl[0] }, { ...bl[1] }]
                    : null;
            }
        });
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Called from the bim-selection-changed listener in main.ts whenever the
     * selection changes.
     *
     * - If `obj` is a wall: attaches the oriented proxy to TransformControls
     *   and sets space = 'local' so gizmo axes align with the wall.
     * - Otherwise: deactivates (restores world-space gizmo for other tools).
     */
    activateFor(obj: THREE.Object3D): void {
        if (!this.isWall(obj)) {
            this.deactivate();
            return;
        }

        // Phase B DTO migration: baseLine stored in userData is [Point3D, Point3D].
        // Code below only reads .x/.z which exist on both THREE.Vector3 and Point3D.
        const bl = obj.userData.baseLine as [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] | undefined;
        if (!bl || bl.length < 2) {
            // baseLine not yet written (wall still being constructed) — fall back
            // to the world-space gizmo without crashing.
            this.deactivate();
            return;
        }

        this.isActive = true;
        this.currentWallGroup = obj;

        // ── Position proxy at the wall's start point (= wallGroup.position) ──
        this.proxy.position.copy(obj.position);
        this.proxyDragStart.copy(obj.position);
        this.wallGroupDragStart.copy(obj.position);

        // ── Orient proxy: local X → wall direction, local Z → wall normal ────
        const s = bl[0];
        const e = bl[1];
        const dx = e.x - s.x;
        const dz = e.z - s.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        const wallDir = len > 1e-6
            ? new THREE.Vector3(dx / len, 0, dz / len)
            : new THREE.Vector3(1, 0, 0);   // degenerate wall — arbitrary safe default

        this.proxy.quaternion.setFromUnitVectors(
            new THREE.Vector3(1, 0, 0),
            wallDir,
        );

        // ── Attach controls to the oriented proxy ────────────────────────────
        this.scene.add(this.proxy);
        this.transformControls.attach(this.proxy);
        this.transformControls.setSpace('local');

        console.log(
            `[WallTransform] Wall "${obj.userData.id}" — gizmo aligned with direction`,
            wallDir,
        );
    }

    /**
     * Restores the standard world-space gizmo.
     * Called when a non-wall is selected or when the selection is cleared.
     */
    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this.currentWallGroup = null;
        this._hostedElementDragStart.clear();
        this._baseLineDragStart = null;

        // Remove proxy from scene (keeps the scene graph clean)
        this.scene.remove(this.proxy);

        // Always detach TransformControls from the proxy.
        // If the scene is cleared externally (e.g. snapshot reload) the proxy is
        // removed from the scene graph but TC still holds a reference to it, causing
        // "The attached 3D object must be a part of the scene graph" on every render
        // frame which freezes the scene. Explicit detach here prevents that.
        this.transformControls.detach();
        this.transformControls.setSpace('world');
    }

    /** True while this controller has the gizmo orientation locked to a wall. */
    get active(): boolean {
        return this.isActive;
    }

    dispose(): void {
        this.deactivate();
    }

    // ── Private ────────────────────────────────────────────────────────────────

    private isWall(obj: THREE.Object3D): boolean {
        return (obj.userData?.elementType ?? '').toLowerCase() === 'wall';
    }
}
