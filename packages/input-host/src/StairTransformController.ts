/**
 * StairTransformController
 *
 * Makes a stair movable via the TransformControls (move) gizmo in the 3D view,
 * the SAME way walls/columns/beams are — by mirroring WallTransformController's
 * invisible-proxy technique.
 *
 * THE PROBLEM
 * -----------
 * The stair mesh bakes its geometry in WORLD coordinates (StairMeshBuilder reads
 * stair.startPosition + flight overrides and translates each tread/riser to its
 * absolute world position), so the stair Object3D / group sits at local origin
 * (0,0,0). Attaching TransformControls directly to that group would place the
 * gizmo at the world origin (0,0,0) rather than at the stair, and the gizmo's
 * displayed position would be meaningless.
 *
 * THE TECHNIQUE — invisible proxy object (mirrors WallTransformController)
 * -----------------------------------------------------------------------
 *   1. Create a lightweight invisible THREE.Object3D (proxy) positioned at the
 *      stair's world anchor (= bounding-box centre of the baked mesh; falls back
 *      to userData.startPosition). The gizmo therefore RENDERS AT THE STAIR.
 *   2. Attach TransformControls to the proxy (not the stair group).
 *   3. During each drag gesture, forward (proxy.position − proxyDragStart) →
 *      stairGroup.position so the baked world geometry follows in real time
 *      (group at (0,0,0) + a position offset visually translates the stair).
 *   4. On deactivation, restore TransformControls to world-space mode + detach.
 *
 * The drag-END handler in registerTransformDragHandler.ts reads stairGroup.position
 * (the live offset), dispatches `stair.move` { stairId, delta } on the bus, and
 * the command resets the group offset to (0,0,0) once the geometry is rebuilt at
 * the new anchor. That keeps the move PERSISTENT (survives reselect / save / undo).
 *
 * CONTRACT COMPLIANCE
 * -------------------
 * P6  – No store mutation here; the move is persisted by MoveStairCommand via the
 *       bus from the drag-end handler.
 * P2  – THREE imported only from @pryzm/renderer-three.
 * Reads only userData fields written by StairMeshBuilder (elementType/type, id,
 * startPosition).
 *
 * ISOLATION — two wiring points only (mirrors WallTransformController):
 *   1. Instantiate in createTransformControllers (initTransformControllers.ts).
 *   2. activateFor(obj) / deactivate() in the bim-selection-changed listener
 *      (registerTransformDragHandler.ts).
 */

import * as THREE from '@pryzm/renderer-three/three';
import { TransformControls } from '@pryzm/renderer-three';

export class StairTransformController {
    /** Invisible pivot — TransformControls is attached here instead of the stair group. */
    private readonly proxy = new THREE.Object3D();

    private isActive = false;
    private currentStairGroup: THREE.Object3D | null = null;

    /** Proxy world position at the start of the current drag gesture. */
    private readonly proxyDragStart = new THREE.Vector3();
    /** Stair group position at the start of the current drag gesture. */
    private readonly stairGroupDragStart = new THREE.Vector3();

    constructor(
        private readonly transformControls: TransformControls,
        private readonly scene: THREE.Scene,
    ) {
        this.proxy.userData.isHelper = true;
        this.proxy.userData.isStairTransformProxy = true;

        // ── Live drag sync ───────────────────────────────────────────────────
        // Forward proxy position delta → stairGroup so geometry follows in real time.
        // Y is left to LevelPlaneConstraint (stair moves in the level plane).
        this.transformControls.addEventListener('change', () => {
            if (!this.isActive || !this.currentStairGroup) return;
            const delta = this.proxy.position.clone().sub(this.proxyDragStart);
            this.currentStairGroup.position.copy(
                this.stairGroupDragStart.clone().add(delta),
            );
        });

        // ── Drag-start snapshot ──────────────────────────────────────────────
        this.transformControls.addEventListener('dragging-changed', (event: any) => {
            if ((window as any).__viewSwitchInProgress) return;
            if (!this.isActive || !this.currentStairGroup) return;
            if (event.value) {
                this.proxy.position.copy(this.proxyAnchorFor(this.currentStairGroup));
                this.proxyDragStart.copy(this.proxy.position);
                this.stairGroupDragStart.copy(this.currentStairGroup.position);
            }
        });
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Called from the bim-selection-changed listener whenever the selection changes.
     * - If `obj` is a stair: positions the proxy AT THE STAIR and attaches the gizmo.
     * - Otherwise: deactivates (restores world-space gizmo for other tools).
     */
    activateFor(obj: THREE.Object3D): void {
        if (!this.isStair(obj)) {
            this.deactivate();
            return;
        }

        this.isActive = true;
        this.currentStairGroup = obj;

        // ── Position proxy at the stair's world anchor so the gizmo renders AT the stair ──
        const anchor = this.proxyAnchorFor(obj);
        this.proxy.position.copy(anchor);
        this.proxy.quaternion.identity();
        this.proxyDragStart.copy(anchor);
        this.stairGroupDragStart.copy(obj.position);

        this.scene.add(this.proxy);
        this.transformControls.attach(this.proxy);
        this.transformControls.setSpace('world');

        console.log(`[StairTransform] Stair "${obj.userData?.id}" — gizmo anchored at`, anchor);
    }

    /** Restores the standard world-space gizmo. Called when a non-stair is selected. */
    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this.currentStairGroup = null;
        this.scene.remove(this.proxy);
        this.transformControls.detach();
        this.transformControls.setSpace('world');
    }

    /** True while this controller has the gizmo anchored to a stair. */
    get active(): boolean {
        return this.isActive;
    }

    dispose(): void {
        this.deactivate();
    }

    // ── Private ────────────────────────────────────────────────────────────────

    /**
     * World-space anchor where the gizmo should sit for `obj`. Uses the current
     * bounding-box centre of the baked mesh (accounts for any live group offset)
     * so the gizmo tracks the stair, with userData.startPosition as a fallback.
     */
    private proxyAnchorFor(obj: THREE.Object3D): THREE.Vector3 {
        const box = new THREE.Box3();
        box.setFromObject(obj);
        if (!box.isEmpty()) {
            return box.getCenter(new THREE.Vector3());
        }
        const sp = obj.userData?.startPosition as { x?: number; y?: number; z?: number } | undefined;
        if (sp && typeof sp.x === 'number') {
            return new THREE.Vector3(sp.x, sp.y ?? 0, sp.z ?? 0).add(obj.position);
        }
        return obj.position.clone();
    }

    private isStair(obj: THREE.Object3D): boolean {
        const t = (obj.userData?.elementType ?? obj.userData?.type ?? '').toString().toLowerCase();
        return t === 'stair' || t === 'stairs';
    }
}
