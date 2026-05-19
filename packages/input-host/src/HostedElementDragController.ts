/**
 * HostedElementDragController
 *
 * §03-CONTRACT: Doors and windows are "hosted elements" — they live inside a wall
 * and their only free coordinate is `offset` (distance along the wall baseline,
 * measured from S toward E).
 *
 * This controller intercepts TransformControls when a door or window is selected
 * and configures it for single-axis movement that is aligned with the wall direction.
 * On drag-end it dispatches `door.setOffset` / `window.setOffset` via the runtime
 * command bus so that the mutation travels through the bus pipeline exactly as
 * required by §01-CORE-CONTRACT (§P4.2 — bus replaces legacy command classes).
 *
 * §REDO-IDEMPOTENCY §WALL-AUDIT-2026 (Apr 2026): The drag-end commit dispatches
 * the absolute `Set*OffsetCommand` (newOffset / prevOffset) rather than the
 * relative `Move*Command` (distance + direction).  Absolute commands are
 * trivially idempotent under re-execution (redo) — execute() simply re-applies
 * the stored newOffset and undo() the stored prevOffset, with no dependence on
 * the live store's current state.  The relative commands kept their (now
 * idempotency-fixed) shape for the AI-service and serialized-replay paths.
 *
 * Isolation guarantee: this file imports only THREE, the two set-offset commands,
 * and reads wall/command state through narrow getter callbacks.  No other module
 * is modified beyond the wiring points in EngineBootstrap.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { TransformControls } from '@pryzm/renderer-three';

// ── Minimal store shapes (avoids coupling to full WallStore type) ──────────────
interface HostedElement {
    offset: number;
    width: number;
    wallId: string;
}

interface WallBaseline {
    baseLine: [THREE.Vector3, THREE.Vector3];
    baseOffset: number;
}

interface WallStoreAccess {
    getById(id: string): WallBaseline | undefined;
    getDoor(id: string): HostedElement | undefined;
    getWindow(id: string): HostedElement | undefined;
}

/**
 * §P4.2 — Narrow bus interface replacing the legacy CommandManager dependency.
 * Matches the `runtime.bus` shape exposed by PryzmRuntime.
 */
interface BusAccess {
    executeCommand(eventKey: string, payload: unknown): Promise<void>;
}

// ── Constants ──────────────────────────────────────────────────────────────────
/** Minimum movement (metres) that triggers a command. Prevents noise from
 *  accidental micro-drags when the user just clicks to select. */
const MIN_MOVE_THRESHOLD = 0.005;

/** Amber colour used for the wall-direction constraint rail. */
const RAIL_COLOR = 0xf59e0b;

/**
 * Controls constrained dragging of wall-hosted elements (doors and windows).
 *
 * Usage:
 *   1. Instantiate once alongside SelectionManager.
 *   2. Call `activateFor(obj)` whenever an object is selected.
 *   3. Call `handleDragEnd(obj)` inside the `dragging-changed` event when a
 *      hosted element drag finishes.
 *   4. Call `deactivate()` on deselect or when the tool changes.
 */
export class HostedElementDragController {
    private constraintRail: THREE.Group | null = null;
    private isActive = false;
    /** Offset captured from the store at the moment the drag starts. */
    private dragStartOffset = 0;

    constructor(
        private readonly transformControls: TransformControls,
        private readonly scene: THREE.Scene,
        /** Late-binding getter — mirrors how main.ts reads window.wallStore. */ // TODO(TASK-08)
        private readonly getWallStore: () => WallStoreAccess | undefined,
        /**
         * §P4.2 — Late-binding getter for the command bus (replaces the retired
         * `getCommandManager` callback).  Caller supplies `() => window.runtime?.bus`.
         * Contracts: C15 §6 (offset mutation), C14 §2.1 (bus-primary dispatch).
         */
        private readonly getBus: () => BusAccess | undefined,
    ) {}

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Called whenever the selection changes.  If `obj` is a door or window the
     * controller activates 1-D constrained TransformControls; otherwise it
     * deactivates so the standard 3-axis gizmo is restored.
     */
    activateFor(obj: THREE.Object3D): void {
        if (!this.isHostedElement(obj)) {
            this.deactivate();
            return;
        }

        this.isActive = true;

        // ── §R3-FIX: Re-attach TC to the hosted element ──────────────────────
        // WallTransformController.deactivate() calls TC.detach() when a wall was
        // previously selected and a non-wall is selected next.  Since
        // hostedDragController now runs LAST in the bim-selection-changed chain
        // (registerTransformDragHandler.ts), WallTransformController has already
        // fired its deactivate() by the time we reach here.  Re-attaching ensures
        // TC is bound to this window/door regardless of prior controller teardown.
        this.transformControls.attach(obj);

        // ── Configure TransformControls for wall-direction-only movement ───────
        // The door/window frame has rotation.y = -atan2(wallDir.z, wallDir.x),
        // which makes its local X axis align with the wall S→E direction.
        // Showing only the X handle in 'local' space therefore locks the gizmo
        // to the wall direction without any custom math.
        this.transformControls.setSpace('local');
        this.setGizmoAxes(true, false, false);

        // Capture drag-start offset from the authoritative store
        this.dragStartOffset = this.readCurrentOffset(obj);

        // Draw the amber constraint rail along the full wall baseline
        this.showConstraintRail(obj);
    }

    /**
     * Called from the `dragging-changed` handler in main.ts when a drag ends.
     * Computes the new offset, clamps it, and fires the appropriate command.
     */
    handleDragEnd(obj: THREE.Object3D): void {
        if (!this.isActive) return;
        if (!this.isHostedElement(obj)) return;

        const wallStore = this.getWallStore();
        const bus = this.getBus();
        if (!wallStore || !bus) return;

        const elementId: string = obj.userData.id;
        const wallId: string = obj.userData.wallId;
        const type = (obj.userData.elementType as string).toLowerCase();

        const wall = wallStore.getById(wallId);
        const elem = type === 'door'
            ? wallStore.getDoor(elementId)
            : wallStore.getWindow(elementId);

        if (!wall || !elem) return;

        const [start, end] = wall.baseLine;
        const wallVec = new THREE.Vector3().subVectors(end, start);
        const wallLength = wallVec.length();
        const wallDir = wallVec.clone().normalize();

        // Compute the new offset as the projection of (worldPosition - wallStart) onto
        // wallDir.  Using obj.position directly was wrong because it projected from the
        // world origin instead of from the wall's start point, producing random offsets
        // for any wall not sitting at (0,0,0).
        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);
        const rawNewOffset = new THREE.Vector3().subVectors(worldPos, start).dot(wallDir);
        const clampedNewOffset = Math.max(0, Math.min(rawNewOffset, wallLength - elem.width));
        const delta = clampedNewOffset - this.dragStartOffset;

        if (Math.abs(delta) < MIN_MOVE_THRESHOLD) {
            // Movement is negligible — snap the object back visually.
            // The store rebuild triggered by the next selection event will
            // authoratively restore the correct position anyway.
            const wallStart = new THREE.Vector3(start.x, start.y ?? 0, start.z);
            this.restorePosition(obj, wallStart, wallDir, this.dragStartOffset);
            return;
        }

        // §P4.2 §REDO-IDEMPOTENCY §01-CORE-CONTRACT: dispatch absolute-offset via bus.
        // `door.setOffset` / `window.setOffset` handlers (initBusHandlers.ts) call
        // SetDoor/WindowOffsetCommand internally, preserving idempotency semantics:
        // execute() always sets newOffset; undo() always reverts to prevOffset.
        if (type === 'door') {
            bus.executeCommand('door.setOffset', {
                doorId:    elementId,
                newOffset: clampedNewOffset,
                prevOffset: this.dragStartOffset,
            }).catch((e: unknown) => console.error('[HostedElementDragController] door.setOffset failed:', e));
        } else {
            bus.executeCommand('window.setOffset', {
                windowId:  elementId,
                newOffset: clampedNewOffset,
                prevOffset: this.dragStartOffset,
            }).catch((e: unknown) => console.error('[HostedElementDragController] window.setOffset failed:', e));
        }

        // Update start offset for subsequent drags in the same selection session.
        // §SELECTION-SYNC: re-anchor on the value the command actually committed
        // so that a follow-up drag's prevOffset matches what's currently in the
        // store.  Stale dragStartOffset would corrupt undo for the SECOND drag.
        this.dragStartOffset = clampedNewOffset;

        // Refresh the rail to match the (unchanged) wall position
        this.showConstraintRail(obj);
    }

    /**
     * Restores the standard 3-axis TransformControls and removes the constraint
     * rail.  Must be called on deselect and on tool change.
     */
    deactivate(): void {
        if (!this.isActive) return;
        this.isActive = false;
        this.transformControls.setSpace('world');
        this.setGizmoAxes(true, true, true);
        this.removeConstraintRail();
    }

    /** True when a hosted-element drag is currently in progress. */
    get active(): boolean {
        return this.isActive;
    }

    // ── Private helpers ────────────────────────────────────────────────────────

    private isHostedElement(obj: THREE.Object3D): boolean {
        const type = (obj.userData?.elementType ?? '').toLowerCase();
        return type === 'door' || type === 'window';
    }

    private readCurrentOffset(obj: THREE.Object3D): number {
        const wallStore = this.getWallStore();
        if (!wallStore) return 0;
        const type = (obj.userData.elementType as string).toLowerCase();
        const elem = type === 'door'
            ? wallStore.getDoor(obj.userData.id)
            : wallStore.getWindow(obj.userData.id);
        return elem?.offset ?? 0;
    }

    /** Show/hide individual TransformControls axis handles. */
    private setGizmoAxes(x: boolean, y: boolean, z: boolean): void {
        // TransformControls exposes these as direct boolean properties on the helper.
        (this.transformControls as any).showX = x;
        (this.transformControls as any).showY = y;
        (this.transformControls as any).showZ = z;
    }

    /** Snap the object back to `offset` along `wallDir` without firing a command. */
    private restorePosition(
        obj: THREE.Object3D,
        wallStart: THREE.Vector3,
        wallDir: THREE.Vector3,
        offset: number,
    ): void {
        const correctPos = wallStart.clone().addScaledVector(wallDir, offset);
        // Preserve Y (controlled by sillHeight + height/2 + baseOffset — store-authoritative)
        obj.position.set(correctPos.x, obj.position.y, correctPos.z);
    }

    // ── Constraint rail (amber gizmo along the wall baseline) ─────────────────

    private showConstraintRail(obj: THREE.Object3D): void {
        this.removeConstraintRail();

        const wallStore = this.getWallStore();
        if (!wallStore) return;

        const wall = wallStore.getById(obj.userData.wallId);
        if (!wall) return;

        const [start, end] = wall.baseLine;

        // Compute world Y at the element's vertical centre
        const worldPos = new THREE.Vector3();
        obj.getWorldPosition(worldPos);
        const railY = worldPos.y;

        const railStart = new THREE.Vector3(start.x, railY, start.z);
        const railEnd   = new THREE.Vector3(end.x,   railY, end.z);
        const railDir   = new THREE.Vector3().subVectors(railEnd, railStart).normalize();

        this.constraintRail = new THREE.Group();
        this.constraintRail.userData.isHelper = true;
        this.constraintRail.userData.isHostedConstraintRail = true;

        // Main rail line
        const lineGeo = new THREE.BufferGeometry().setFromPoints([railStart, railEnd]);
        const lineMat = new THREE.LineBasicMaterial({
            color: RAIL_COLOR,
            depthTest: false,
            transparent: true,
            opacity: 0.85,
        });
        const rail = new THREE.Line(lineGeo, lineMat);
        rail.userData.isHelper = true;
        this.constraintRail.add(rail);

        // Arrow cap at the S end (pointing toward E)
        this.constraintRail.add(this.buildArrowCap(railStart, railDir, RAIL_COLOR));
        // Arrow cap at the E end (pointing toward S)
        this.constraintRail.add(this.buildArrowCap(railEnd, railDir.clone().negate(), RAIL_COLOR));

        // Label arrow — small disc at the gizmo centre so users know the rail is interactive
        const discGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12);
        const discMat = new THREE.MeshBasicMaterial({ color: RAIL_COLOR, depthTest: false });
        const disc = new THREE.Mesh(discGeo, discMat);
        disc.position.copy(worldPos);
        disc.userData.isHelper = true;
        this.constraintRail.add(disc);

        this.scene.add(this.constraintRail);
    }

    /**
     * Builds a cone arrow tip placed at `tipWorldPos` pointing in `direction`.
     * The cone's axis is aligned with `direction` using quaternion rotation from +Y.
     */
    private buildArrowCap(
        tipWorldPos: THREE.Vector3,
        direction: THREE.Vector3,
        color: number,
    ): THREE.Mesh {
        const coneGeo = new THREE.ConeGeometry(0.07, 0.22, 8);
        const coneMat = new THREE.MeshBasicMaterial({ color, depthTest: false });
        const cone = new THREE.Mesh(coneGeo, coneMat);

        // Rotate cone from default +Y orientation to `direction`
        const up = new THREE.Vector3(0, 1, 0);
        const dir = direction.clone().normalize();
        if (Math.abs(dir.dot(up)) < 0.9999) {
            cone.quaternion.setFromUnitVectors(up, dir);
        } else if (dir.y < 0) {
            // Anti-parallel — rotate 180° around Z
            cone.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
        }

        // Place tip: offset cone so its tip (not its centre) is at tipWorldPos
        const tipOffset = dir.clone().multiplyScalar(-0.11); // half cone height
        cone.position.copy(tipWorldPos).add(tipOffset);
        cone.userData.isHelper = true;
        return cone;
    }

    private removeConstraintRail(): void {
        if (!this.constraintRail) return;
        this.constraintRail.traverse(obj => {
            if (obj instanceof THREE.Mesh) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    (obj.material as THREE.Material).dispose();
                }
            } else if (obj instanceof THREE.Line) {
                obj.geometry.dispose();
                if (Array.isArray(obj.material)) {
                    obj.material.forEach(m => m.dispose());
                } else {
                    (obj.material as THREE.Material).dispose();
                }
            }
        });
        this.scene.remove(this.constraintRail);
        this.constraintRail = null;
    }
}
