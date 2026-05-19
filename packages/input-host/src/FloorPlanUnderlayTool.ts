/**
 * @file FloorPlanUnderlayTool.ts
 * @description Manages the PDF floor plan underlay mesh in the THREE.js scene.
 *
 * CONTRACT (04-BIM §3.1 Tool Layer):
 *  - The underlay is a raw THREE.js object — NOT a semantic BIM element.
 *  - It is NEVER registered in any ElementStore, BimManager, or ElementRegistry.
 *  - It does NOT flow through the Store Event Bus.
 *  - All interaction (drag, rotate, select, delete) targets only this mesh — existing BIM
 *    selection logic is NOT modified.
 *  - The world transform recorded here is used exclusively by FloorPlanCommandBatcher
 *    to compute world coordinates from pixel coordinates.
 *
 * INTERACTION MODEL:
 *  - Click underlay  → select (shows PRYZM purple outline)
 *  - Click elsewhere → deselect
 *  - Drag (when NOT locked) → move underlay; drag is BLOCKED when locked (pinned)
 *  - R key (when NOT locked) → rotate 90°; rotation is BLOCKED when locked (pinned)
 *  - Delete / Backspace (when selected) → dispatches 'underlay:delete-requested' event
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler } from '@pryzm/frame-scheduler';
import { floorPlanUnderlayRef } from '@pryzm/core-app-model';
import {
    TransformUnderlayCommand,
    captureUnderlaySnapshot,
} from '@pryzm/command-registry';

/** Generate a lightweight pseudo-UUID (no external dependency). */
function genId(): string {
    return 'underlay-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

export interface UnderlayOptions {
    /** Blob URL from PDFConversionResult */
    blobUrl: string;
    /** px / meter ratio from scale calibration */
    pxPerMeter: number;
    /** Original image width in pixels */
    widthPx: number;
    /** Original image height in pixels */
    heightPx: number;
    /** Y elevation (active level elevation + small offset) */
    elevationY: number;
}

export interface UnderlayState {
    mesh: THREE.Mesh;
    pxPerMeter: number;
    widthPx: number;
    heightPx: number;
    planWidthMeters: number;
    planHeightMeters: number;
    /** Locked = import is pinned. Prevents drag AND rotation (R key). */
    locked: boolean;
    /** Whether the underlay is currently selected in the scene */
    isSelected: boolean;
}

export class FloorPlanUnderlayTool {
    private state: UnderlayState | null = null;
    private selectionOutline: THREE.Line | null = null;
    private isDragging = false;
    /** Whether drag moved the mesh meaningfully (vs. a pure click) */
    private didDragMove = false;
    /** Snapshot captured at drag-start so the drag can be recorded as a Command on mouse-up. */
    private _dragBeforeSnap: ReturnType<typeof captureUnderlaySnapshot> = null;
    private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    private dragOffset = new THREE.Vector3();
    private raycaster = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private mouseDownPos = new THREE.Vector2();

    private boundOnMouseDown: (e: MouseEvent) => void;
    private boundOnMouseMove: (e: MouseEvent) => void;
    private boundOnMouseUp: (e: MouseEvent) => void;
    private boundOnKeyDown: (e: KeyboardEvent) => void;

    constructor(
        private scene: THREE.Scene,
        private camera: THREE.Camera,
        private domElement: HTMLElement
    ) {
        this.boundOnMouseDown = this.onMouseDown.bind(this);
        this.boundOnMouseMove = this.onMouseMove.bind(this);
        this.boundOnMouseUp = this.onMouseUp.bind(this);
        this.boundOnKeyDown = this.onKeyDown.bind(this);
    }

    // ── Public API ─────────────────────────────────────────────────────────────

    async create(options: UnderlayOptions): Promise<UnderlayState> {
        this.dispose();

        const { blobUrl, pxPerMeter, widthPx, heightPx, elevationY } = options;
        const planWidthMeters = widthPx / pxPerMeter;
        const planHeightMeters = heightPx / pxPerMeter;

        const texture = await this.loadTexture(blobUrl);

        const geometry = new THREE.PlaneGeometry(planWidthMeters, planHeightMeters);
        const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            side: THREE.DoubleSide,
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, elevationY + 0.01, 0);
        mesh.userData = {
            id:   genId(),
            type: 'floor_plan_underlay',
            isUnderlay: true,
            isNonBIM: true,
            pxPerMeter,
            widthPx,
            heightPx,
            planWidthMeters,
            planHeightMeters,
        };

        // Expose tool instance so ContextualEditBar scale action can reach it
        window.floorPlanUnderlayTool = this;

        this.scene.add(mesh);

        this.state = {
            mesh,
            pxPerMeter,
            widthPx,
            heightPx,
            planWidthMeters,
            planHeightMeters,
            locked: false,
            isSelected: false,
        };

        floorPlanUnderlayRef.current = { blobUrl, mesh, planWidthMeters, planHeightMeters, visible: true };

        this.attachListeners();
        return this.state;
    }

    getState(): UnderlayState | null {
        return this.state;
    }

    setOpacity(opacity: number): void {
        if (!this.state) return;
        (this.state.mesh.material as THREE.MeshBasicMaterial).opacity =
            Math.min(1, Math.max(0, opacity));
        window.dispatchEvent(new CustomEvent('underlay:transform-changed')); // TODO(TASK-11)
    }

    setLocked(locked: boolean): void {
        if (!this.state) return;
        this.state.locked = locked;
        window.dispatchEvent(new CustomEvent('underlay:transform-changed')); // TODO(TASK-11)
    }

    setVisible(visible: boolean): void {
        if (!this.state) return;
        this.state.mesh.visible = visible;
        (this.state.mesh.material as THREE.MeshBasicMaterial).opacity = visible ? 1.0 : 0;
        if (floorPlanUnderlayRef.current) {
            floorPlanUnderlayRef.current.visible = visible;
        }
        window.dispatchEvent(new CustomEvent('underlay:transform-changed')); // TODO(TASK-11)
    }

    /** Programmatically select the underlay (shows outline, opens PropertyPanel + CEB). */
    select(): void {
        if (!this.state) return;

        // Clear any existing BIM selection so the two panels don't coexist
        const selMgr = window.selectionManager;
        if (selMgr && typeof selMgr.unselectAll === 'function') {
            selMgr.unselectAll();
        }

        this.state.isSelected = true;
        this.showSelectionOutline();

        // Set the __underlayHit flag so SelectionManager's click handler does not
        // immediately override our selection with unselectAll (race window: mousedown → click).
        window.__underlayHit = true;
        // D.7.5: routed through getFrameScheduler() instead of raw rAF.
        getFrameScheduler().scheduleOnce('floor-plan-underlay-hit-clear', () => { window.__underlayHit = false; });

        // Open PropertyPanel
        const updateInspector = window.updateInspector;
        if (typeof updateInspector === 'function') {
            updateInspector(this.state.mesh);
        }

        // Show ContextualEditBar
        window.dispatchEvent(new CustomEvent('bim-selection-changed', { detail: { object: this.state.mesh } })); // keep DOM for plugins
        (window as any).runtime?.events?.emit('bim-selection-changed', { object: this.state.mesh }); // F.events.16 bridge

        window.dispatchEvent(new CustomEvent('underlay:selected')); // TODO(TASK-11)
        console.log('[FloorPlanUnderlayTool] Selected — id:', this.state.mesh.userData.id);
    }

    /** Programmatically deselect the underlay. */
    deselect(): void {
        if (!this.state) return;
        this.state.isSelected = false;
        this.hideSelectionOutline();

        // Dismiss ContextualEditBar and PropertyPanel
        window.dispatchEvent(new CustomEvent('bim-selection-changed', { detail: { object: null } })); // keep DOM for plugins
        (window as any).runtime?.events?.emit('bim-selection-changed', { object: null }); // F.events.16 bridge

        window.dispatchEvent(new CustomEvent('underlay:deselected')); // TODO(TASK-11)
        console.log('[FloorPlanUnderlayTool] Deselected');
    }

    /**
     * Apply a uniform scale factor to the underlay mesh.
     * Called by UnderlayReferenceScaleTool after the user picks the 3 reference points.
     *
     * The PlaneGeometry is in local XY; rotation.x = -π/2 maps local Y → world Z.
     * Uniform scale therefore requires scaling both mesh.scale.x and mesh.scale.y.
     *
     * IMPORTANT — single source of truth for visual size: `mesh.scale.{x,y}`.
     *
     * `state.planWidthMeters` / `planHeightMeters` describe the INTRINSIC
     * PlaneGeometry size (baked at import), and `state.pxPerMeter` describes
     * the SOURCE PDF/image pixel density. Both are invariants of the imported
     * file — they must NOT change when the user rescales the underlay.
     *
     * Why this matters: the plan-view renderer (PlanViewCanvas._drawUnderlay)
     * computes the on-screen image corners as
     *     mesh.localToWorld(±planWidthMeters/2, ±planHeightMeters/2)
     * `localToWorld` already multiplies by mesh.scale, so if we ALSO multiply
     * planWidthMeters by `factor`, the rendered image grows by factor² instead
     * of factor — exactly the bug the reference-scale tool reports as
     * "result is relative to the original distance, not absolute".
     *
     * Effective on-screen world dimensions, when needed, are
     *     planWidthMeters  * mesh.scale.x
     *     planHeightMeters * mesh.scale.y
     */
    applyScale(factor: number): void {
        if (!this.state || factor <= 0) return;

        const mesh = this.state.mesh;
        mesh.scale.x *= factor;
        mesh.scale.y *= factor;

        const effectiveWidth  = this.state.planWidthMeters  * mesh.scale.x;
        const effectiveHeight = this.state.planHeightMeters * mesh.scale.y;

        console.log('[FloorPlanUnderlayTool] applyScale:', factor,
            '| mesh.scale →', mesh.scale.x.toFixed(4), '×', mesh.scale.y.toFixed(4),
            '| effective world size:', effectiveWidth.toFixed(3), '×',
            effectiveHeight.toFixed(3), 'm');
    }

    /**
     * Rotate the underlay around a world-space pivot (XZ plane).
     * Called by UnderlayReferenceRotateTool after the user picks pivot/reference/target.
     *
     * Convention: deltaRad uses the same sign as the existing R-key rotation
     * (mesh.rotation.z += delta), which rotates CCW when viewed from +Y down.
     * The mesh is also translated so it pivots around (pivotX, pivotZ) instead
     * of its own centre.
     */
    applyRotation(deltaRad: number, pivotX: number, pivotZ: number): void {
        if (!this.state || !isFinite(deltaRad)) return;

        const mesh = this.state.mesh;

        // Rotate the mesh's position around the pivot in world XZ.
        // Sign chosen to match the visual direction of mesh.rotation.z += delta.
        const dx  = mesh.position.x - pivotX;
        const dz  = mesh.position.z - pivotZ;
        const cos = Math.cos(deltaRad);
        const sin = Math.sin(deltaRad);
        mesh.position.x = pivotX + dx * cos + dz * sin;
        mesh.position.z = pivotZ - dx * sin + dz * cos;

        // Rotate the mesh's own orientation. With mesh.rotation.x = -π/2 the
        // mesh's local Z axis points along world +Y, so rotating its z spins
        // around world Y just like the existing R-key shortcut does.
        mesh.rotation.z += deltaRad;

        console.log('[FloorPlanUnderlayTool] applyRotation:',
            (deltaRad * 180 / Math.PI).toFixed(2), '° around (',
            pivotX.toFixed(2), ',', pivotZ.toFixed(2), ')');
    }

    dispose(): void {
        this.detachListeners();
        this.removeSelectionOutline();
        floorPlanUnderlayRef.current = null;

        // Clear window reference — prevents stale pointers after re-import
        if (window.floorPlanUnderlayTool === this) {
            window.floorPlanUnderlayTool = null;
        }

        if (!this.state) return;

        // Dispatch deselection event so CEB + PropertyPanel dismiss themselves
        if (this.state.isSelected) {
            window.dispatchEvent(new CustomEvent('bim-selection-changed', { detail: { object: null } })); // keep DOM for plugins
            (window as any).runtime?.events?.emit('bim-selection-changed', { object: null }); // F.events.16 bridge
        }

        this.scene.remove(this.state.mesh);
        this.state.mesh.geometry.dispose();
        const mat = this.state.mesh.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
        this.state = null;
    }

    /**
     * Convert a pixel coordinate from the PDF image to a world-space Vector3.
     * Uses the mesh's current world transform — must be called AFTER the user
     * has confirmed the underlay position.
     *
     * The plane geometry is in the local XY plane (width → X, height → Y).
     * With rotation.x = -π/2, localToWorld maps: (lx, ly, 0) → world (lx, 0, -ly).
     * Image Y-down is negated so that py increases into +Z world space.
     */
    pixelToWorld(px: number, py: number): THREE.Vector3 | null {
        if (!this.state) return null;
        const { mesh, widthPx, heightPx, planWidthMeters, planHeightMeters } = this.state;

        const localX = (px / widthPx - 0.5) * planWidthMeters;
        // Negate py so image Y-down maps to local Y-up → world -Z (positive depth).
        const localY = -(py / heightPx - 0.5) * planHeightMeters;

        const localPoint = new THREE.Vector3(localX, localY, 0);
        return mesh.localToWorld(localPoint);
    }

    /**
     * Inverse of pixelToWorld — converts a world-space XZ coordinate back to image pixel coords.
     * Used by the room overlay renderer to project room centroids onto the debug canvas.
     *
     * Returns null when the underlay has not yet been placed (state not ready).
     * The returned pixel coordinates are in full-resolution image space (widthPx × heightPx).
     * Scale to canvas size yourself: `canvasX = px.x * (canvas.width / state.widthPx)`.
     */
    worldToPixel(worldX: number, worldZ: number): { x: number; y: number } | null {
        if (!this.state) return null;
        const { mesh, widthPx, heightPx, planWidthMeters, planHeightMeters } = this.state;

        // mesh.worldToLocal is the exact inverse of localToWorld used in pixelToWorld.
        // The underlay lies in the local XY plane; after worldToLocal, z ≈ 0 (ignore it).
        const worldPt = new THREE.Vector3(worldX, mesh.getWorldPosition(new THREE.Vector3()).y, worldZ);
        const local = mesh.worldToLocal(worldPt);

        // Reverse: localX = (px / widthPx - 0.5) * planWidthMeters
        const px = (local.x / planWidthMeters + 0.5) * widthPx;
        // Reverse: localY = -(py / heightPx - 0.5) * planHeightMeters  →  negate to recover py
        const py = (-local.y / planHeightMeters + 0.5) * heightPx;

        return { x: px, y: py };
    }

    // ── Private: texture loader ────────────────────────────────────────────────

    private loadTexture(url: string): Promise<THREE.Texture> {
        return new Promise((resolve, reject) => {
            new THREE.TextureLoader().load(url, resolve, undefined, reject);
        });
    }

    // ── Private: selection outline ─────────────────────────────────────────────

    private showSelectionOutline(): void {
        if (!this.state) return;
        this.removeSelectionOutline();

        const hw = this.state.planWidthMeters / 2;
        const hh = this.state.planHeightMeters / 2;
        const margin = 0.08; // 8 cm margin outside the plan boundary

        // Rectangle in the local XY plane of the underlay mesh
        const pts = [
            new THREE.Vector3(-hw - margin, -hh - margin, 0.001),
            new THREE.Vector3( hw + margin, -hh - margin, 0.001),
            new THREE.Vector3( hw + margin,  hh + margin, 0.001),
            new THREE.Vector3(-hw - margin,  hh + margin, 0.001),
            new THREE.Vector3(-hw - margin, -hh - margin, 0.001),
        ];
        const geo = new THREE.BufferGeometry().setFromPoints(pts);
        const mat = new THREE.LineBasicMaterial({
            color: 0x7c3aed,
            depthTest: false,
            linewidth: 2,
        });
        const line = new THREE.Line(geo, mat);
        line.renderOrder = 999;
        line.userData = { type: 'floor_plan_underlay_outline', isNonBIM: true };

        // Add as child of mesh so it moves/rotates with it automatically
        this.state.mesh.add(line);
        this.selectionOutline = line;

        // Brighten slightly to indicate selected state
        (this.state.mesh.material as THREE.MeshBasicMaterial).opacity =
            Math.min(1, (this.state.mesh.material as THREE.MeshBasicMaterial).opacity + 0.15);
    }

    private hideSelectionOutline(): void {
        this.removeSelectionOutline();
        // Restore opacity (subtract what we added)
        if (this.state) {
            const mat = this.state.mesh.material as THREE.MeshBasicMaterial;
            mat.opacity = Math.max(0.1, mat.opacity - 0.15);
        }
    }

    private removeSelectionOutline(): void {
        if (this.selectionOutline) {
            if (this.state) {
                this.state.mesh.remove(this.selectionOutline);
            }
            (this.selectionOutline.material as THREE.Material).dispose();
            this.selectionOutline.geometry.dispose();
            this.selectionOutline = null;
        }
    }

    // ── Private: drag / rotate / select interaction ────────────────────────────

    private attachListeners(): void {
        this.domElement.addEventListener('mousedown', this.boundOnMouseDown);
        this.domElement.addEventListener('mousemove', this.boundOnMouseMove);
        this.domElement.addEventListener('mouseup', this.boundOnMouseUp);
        window.addEventListener('keydown', this.boundOnKeyDown);
    }

    private detachListeners(): void {
        this.domElement.removeEventListener('mousedown', this.boundOnMouseDown);
        this.domElement.removeEventListener('mousemove', this.boundOnMouseMove);
        this.domElement.removeEventListener('mouseup', this.boundOnMouseUp);
        window.removeEventListener('keydown', this.boundOnKeyDown);
    }

    private updateMouse(e: MouseEvent): void {
        const rect = this.domElement.getBoundingClientRect();
        this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    private onMouseDown(e: MouseEvent): void {
        if (!this.state) return;
        this.updateMouse(e);
        this.mouseDownPos.set(e.clientX, e.clientY);
        this.didDragMove = false;
        this.raycaster.setFromCamera(this.mouse, this.camera);
        const hits = this.raycaster.intersectObject(this.state.mesh);

        if (hits.length === 0) {
            // Clicked empty space → deselect
            if (this.state.isSelected) {
                this.deselect();
            }
            return;
        }

        // Hit the underlay mesh
        e.stopPropagation();

        // Select if not already selected
        if (!this.state.isSelected) {
            this.select();
        }

        // Pinned (locked) — do not allow drag
        if (this.state.locked) return;

        this.isDragging = true;
        this.dragPlane.constant = -this.state.mesh.position.y;
        const hitPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.dragPlane, hitPoint);
        this.dragOffset.copy(this.state.mesh.position).sub(hitPoint);

        // Contract 01 §2.1 — capture the BEFORE state so drag-end can record
        // a TransformUnderlayCommand that Ctrl+Z can undo.
        this._dragBeforeSnap = captureUnderlaySnapshot();
    }

    private onMouseMove(e: MouseEvent): void {
        if (!this.isDragging || !this.state) return;

        const dx = e.clientX - this.mouseDownPos.x;
        const dy = e.clientY - this.mouseDownPos.y;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            this.didDragMove = true;
        }

        if (!this.didDragMove) return;

        e.stopPropagation();
        this.updateMouse(e);
        this.raycaster.setFromCamera(this.mouse, this.camera);

        const worldPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(this.dragPlane, worldPoint);
        if (worldPoint) {
            this.state.mesh.position.x = worldPoint.x + this.dragOffset.x;
            this.state.mesh.position.z = worldPoint.z + this.dragOffset.z;
        }
    }

    private onMouseUp(_e: MouseEvent): void {
        if (this.isDragging && this.didDragMove) {
            // Contract 01 §2.1 — record the drag as a single undoable Command.
            this._pushTransformCommand(this._dragBeforeSnap, 'drag');
            window.dispatchEvent(new CustomEvent('underlay:transform-changed')); // TODO(TASK-11)
        }
        this.isDragging = false;
        this._dragBeforeSnap = null;
    }

    /**
     * Push a TransformUnderlayCommand if a snapshot was captured AND the
     * underlay actually changed. Live mutations have already been applied to
     * the mesh; the command's first execute() is a no-op (idempotent), and
     * undo() restores the snapshot. Calling this from any gesture-end path
     * (drag, R-key, reference scale/rotate) is what makes Ctrl+Z work.
     */
    pushTransformCommand(
        before: ReturnType<typeof captureUnderlaySnapshot>,
        reason: 'drag' | 'rotate-90-key' | 'reference-scale' | 'reference-rotate',
    ): void {
        this._pushTransformCommand(before, reason);
    }

    private _pushTransformCommand(
        before: ReturnType<typeof captureUnderlaySnapshot>,
        reason: 'drag' | 'rotate-90-key' | 'reference-scale' | 'reference-rotate',
    ): void {
        if (!before) return;
        const after = captureUnderlaySnapshot();
        if (!after) return;
        // Skip if nothing actually changed (epsilon test on every field).
        const changed =
            Math.abs(after.posX  - before.posX)  > 1e-6 ||
            Math.abs(after.posY  - before.posY)  > 1e-6 ||
            Math.abs(after.posZ  - before.posZ)  > 1e-6 ||
            Math.abs(after.rotZ  - before.rotZ)  > 1e-6 ||
            Math.abs(after.scaleX - before.scaleX) > 1e-6 ||
            Math.abs(after.scaleY - before.scaleY) > 1e-6 ||
            Math.abs(after.pxPerMeter - before.pxPerMeter) > 1e-6;
        if (!changed) return;

        const cmdMgr = window.commandManager; // TODO(TASK-06)
        if (cmdMgr?.execute) {
            cmdMgr.execute(new TransformUnderlayCommand(before, after, reason)); // TODO(TASK-06)
        }
    }

    private onKeyDown(e: KeyboardEvent): void {
        if (!this.state) return;

        // Only handle keys when no form element is focused
        const activeEl = document.activeElement;
        const isInputFocused =
            activeEl instanceof HTMLInputElement ||
            activeEl instanceof HTMLTextAreaElement ||
            activeEl instanceof HTMLSelectElement;
        if (isInputFocused) return;

        // Rotate 90° — blocked when locked (pinned).
        // Contract 01 §2.1 — record as a TransformUnderlayCommand so Ctrl+Z works.
        if (e.key === 'r' || e.key === 'R') {
            if (this.state.locked) return;
            const before = captureUnderlaySnapshot();
            this.state.mesh.rotation.z += Math.PI / 2;
            this._pushTransformCommand(before, 'rotate-90-key');
            window.dispatchEvent(new CustomEvent('underlay:transform-changed')); // TODO(TASK-11)
            return;
        }

        // Delete underlay — only when selected
        if ((e.key === 'Delete' || e.key === 'Backspace') && this.state.isSelected) {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent('underlay:delete-requested')); // TODO(TASK-11)
        }
    }
}
