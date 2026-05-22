/**
 * WallEndpointController
 *
 * Displays draggable sphere handles at a wall's two endpoints (baseLine[0] and
 * baseLine[1]).  Dragging a handle moves the visible sphere handles in real
 * time; the wall's authoritative state is committed to WallStore exactly once
 * on mouse-up via an UpdateWallBaselineCommand for full undo/redo support.
 *
 * §LIVE-DRAG-ISOLATION §WALL-AUDIT-2026 (Apr 2026)
 * ------------------------------------------------
 * Earlier revisions called `wallStore.update()` on every mouse-move frame so
 * the geometry would track the drag continuously.  That live-update loop had
 * three architectural defects that broke the §01-CORE-CONTRACT undo invariant:
 *   1. Each per-frame update bumped `metadata.version` and emitted a store
 *      'update' event, polluting the audit trail with hundreds of phantom
 *      revisions per drag.
 *   2. The `update()` hook clears `_sourceBaseLine` whenever `baseLine` is set
 *      without it, so the JoinResolver lost the user-drawn pre-trim baseline
 *      every frame; subsequent flushes re-seeded the resolver from the
 *      post-trim baseline and silently dropped previously-mitered corners.
 *   3. The drag-end command captured its undo snapshot AFTER the live updates
 *      had already mutated `_renderVersion` and `_sourceBaseLine`, so undo
 *      reverted to a polluted snapshot.
 *
 * The live-update loop also did not bump `_renderVersion`, so the builder's
 * §VIEW-DIRTY-CHECK guard skipped the geometry rebuild anyway — meaning the
 * "live" loop produced no visible benefit while corrupting the store.
 *
 * Architectural fix: mirror WallTransformController.  During the drag, mutate
 * only the visual sphere handles in the scene; the WallStore stays at its
 * pre-drag state.  On mouse-up, dispatch a single UpdateWallBaselineCommand
 * with the explicit `prevBaseLine` (drag-start) and `newBaseLine` (drag-end)
 * — the standard command pipeline then runs the resolver, builds the wall,
 * and snapshots a clean undo state.
 *
 * CONTRACT COMPLIANCE
 * -------------------
 * §01 §2.1  – No direct store mutations during the drag.  The commit is
 *              delegated to UpdateWallBaselineCommand on mouse-up.
 * §02 §4    – No geometry construction beyond the two lightweight helper spheres.
 * §03 §1.5  – Reads only userData.elementType / userData.id written by
 *              WallFragmentBuilder.
 *
 * PLAN-VIEW IMPROVEMENTS
 * ----------------------
 * Each handle consists of two spheres sharing the same position:
 *  1. A visible sphere (HANDLE_RADIUS) — blue/amber colour, depthTest:false so
 *     it always renders on top regardless of camera angle.
 *  2. An invisible hit-zone sphere (HIT_RADIUS, transparent) — larger target
 *     that is raycasted against so the handle is easy to click in top-down
 *     (plan) view where the visible sphere may appear as a small dot.
 *
 * ISOLATION
 * ---------
 * Instantiated once in EngineBootstrap after WallTransformController.
 * activateFor(obj) / deactivate() are called from the bim-selection-changed
 * listener in EngineBootstrap, in the same block as WallTransformController.
 */

import { UpdateWallBaselineCommand } from '@pryzm/command-registry';
import * as THREE from '@pryzm/renderer-three/three';

// §WALL-HANDLE-STUDY (2026-05-22): visual sphere halved (0.26 → 0.13 m) per the
// architect's request for a smaller, more professional handle. The invisible
// hit-zone is kept generous (≈2.7× the visual) so the handle is still easy to
// grab — robustness of the *grab* must not regress when the *visual* shrinks.
const HANDLE_RADIUS  = 0.13;   // visual sphere radius (m) — half of the old 0.26
const HIT_RADIUS     = 0.35;   // invisible hit-zone radius — easier to grab in plan view
const HANDLE_SEGMENTS = 14;
const HANDLE_COLOR_IDLE   = 0x2563eb; // blue-600
const HANDLE_COLOR_HOVER  = 0x0ea5e9; // sky-500
const HANDLE_COLOR_ACTIVE = 0xf59e0b; // amber-400

export class WallEndpointController {
    private readonly scene:     THREE.Scene;
    private readonly camera:    THREE.Camera;
    private readonly domEl:     HTMLElement;

    /** Visible sphere at baseLine[0] */
    private handleStart: THREE.Mesh | null = null;
    /** Visible sphere at baseLine[1] */
    private handleEnd:   THREE.Mesh | null = null;

    /** Invisible hit-zone sphere at baseLine[0] (larger, for easy clicking in plan view) */
    private hitStart: THREE.Mesh | null = null;
    /** Invisible hit-zone sphere at baseLine[1] */
    private hitEnd:   THREE.Mesh | null = null;

    private activeWallId:  string | null = null;
    private draggingHandle: 0 | 1 | null = null;  // 0 = start, 1 = end

    /**
     * TAB-focused handle index (null = no TAB focus).
     * When non-null, the next left-click anywhere on the viewport will drag that
     * handle to the clicked ground position — bypassing the sphere raycast so the
     * handle is always reachable in plan (top-down) view.
     * Pressing Tab again cycles:  null → 0 → 1 → null.
     */
    private tabFocusedHandle: 0 | 1 | null = null;

    /** baseLine at drag-start, for undo snapshot */
    private dragStartBaseLine: [THREE.Vector3, THREE.Vector3] | null = null;
    /** live baseLine during drag */
    private liveBaseLine:      [THREE.Vector3, THREE.Vector3] | null = null;

    private groundY = 0;

    private _onMouseDown: (e: MouseEvent) => void;
    private _onMouseMove: (e: MouseEvent) => void;
    private _onMouseUp:   (e: MouseEvent) => void;
    private _onKeyDown:   (e: KeyboardEvent) => void;

    constructor(scene: THREE.Scene, camera: THREE.Camera, domEl: HTMLElement) {
        this.scene  = scene;
        this.camera = camera;
        this.domEl  = domEl;

        this._onMouseDown = this.onMouseDown.bind(this);
        this._onMouseMove = this.onMouseMove.bind(this);
        this._onMouseUp   = this.onMouseUp.bind(this);
        this._onKeyDown   = this.onKeyDown.bind(this);
    }

    /** Activates handles for the given selected scene object if it is a wall. */
    activateFor(obj: THREE.Object3D): void {
        this.deactivate();

        const elType = (obj.userData?.elementType ?? '').toLowerCase();
        if (elType !== 'wall') return;

        const wallId = obj.userData?.id as string | undefined;
        if (!wallId) return;

        const wallStore = window.wallStore; // TODO(TASK-08)
        const wall = wallStore?.getById?.(wallId);
        if (!wall?.baseLine) return;

        this.activeWallId = wallId;

        const bimManager = window.bimManager;
        const level = bimManager?.getLevelById?.(wall.levelId);
        this.groundY = (level?.elevation ?? 0) + (wall.baseOffset ?? 0);

        // ── Visible handle spheres ────────────────────────────────────────────
        const visGeo = new THREE.SphereGeometry(HANDLE_RADIUS, HANDLE_SEGMENTS, HANDLE_SEGMENTS);

        const matStart = new THREE.MeshStandardMaterial({
            color: HANDLE_COLOR_IDLE,
            roughness: 0.3,
            metalness: 0.1,
            depthTest: false,
        });
        const matEnd = matStart.clone();

        this.handleStart = new THREE.Mesh(visGeo, matStart);
        this.handleEnd   = new THREE.Mesh(visGeo.clone(), matEnd);

        const bl = wall.baseLine;
        const handleY = this.groundY + HANDLE_RADIUS;

        this.handleStart.position.set(bl[0].x, handleY, bl[0].z);
        this.handleEnd.position.set(bl[1].x,   handleY, bl[1].z);

        this.handleStart.renderOrder = 999;
        this.handleEnd.renderOrder   = 999;

        this.handleStart.userData = { role: 'wall-endpoint-handle', handleIndex: 0, wallId };
        this.handleEnd.userData   = { role: 'wall-endpoint-handle', handleIndex: 1, wallId };

        // ── Invisible hit-zone spheres (larger, for plan-view usability) ──────
        const hitGeo = new THREE.SphereGeometry(HIT_RADIUS, 8, 8);
        const hitMat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthTest: false,
            depthWrite: false,
        });

        this.hitStart = new THREE.Mesh(hitGeo, hitMat.clone());
        this.hitEnd   = new THREE.Mesh(hitGeo.clone(), hitMat.clone());

        this.hitStart.position.set(bl[0].x, handleY, bl[0].z);
        this.hitEnd.position.set(bl[1].x,   handleY, bl[1].z);

        this.hitStart.renderOrder = 0;
        this.hitEnd.renderOrder   = 0;

        // Tag hit spheres: handleIndex mirrors the visual sphere so onMouseDown
        // can resolve which endpoint is being dragged regardless of which sphere
        // (visual or hit) was raycasted.
        this.hitStart.userData = { role: 'wall-endpoint-hit', handleIndex: 0, wallId };
        this.hitEnd.userData   = { role: 'wall-endpoint-hit', handleIndex: 1, wallId };

        this.scene.add(this.handleStart);
        this.scene.add(this.handleEnd);
        this.scene.add(this.hitStart);
        this.scene.add(this.hitEnd);

        this.domEl.addEventListener('mousedown', this._onMouseDown);
        this.domEl.addEventListener('mousemove', this._onMouseMove);
        this.domEl.addEventListener('mouseup',   this._onMouseUp);
        // TAB cycling for plan-view — listen on document so the canvas doesn't
        // need to be focused for the key to fire.
        document.addEventListener('keydown', this._onKeyDown);
    }

    deactivate(): void {
        if (this.handleStart) { this.scene.remove(this.handleStart); this.handleStart = null; }
        if (this.handleEnd)   { this.scene.remove(this.handleEnd);   this.handleEnd   = null; }
        if (this.hitStart)    { this.scene.remove(this.hitStart);    this.hitStart    = null; }
        if (this.hitEnd)      { this.scene.remove(this.hitEnd);      this.hitEnd      = null; }
        this.activeWallId      = null;
        this.draggingHandle    = null;
        this.tabFocusedHandle  = null;
        this.dragStartBaseLine = null;
        this.liveBaseLine      = null;
        this.domEl.removeEventListener('mousedown', this._onMouseDown);
        this.domEl.removeEventListener('mousemove', this._onMouseMove);
        this.domEl.removeEventListener('mouseup',   this._onMouseUp);
        document.removeEventListener('keydown', this._onKeyDown);
    }

    private buildRay(e: MouseEvent): THREE.Raycaster {
        const rect = this.domEl.getBoundingClientRect();
        const ndc  = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width)  * 2 - 1,
            -((e.clientY - rect.top)  / rect.height) * 2 + 1,
        );
        const rc = new THREE.Raycaster();
        rc.setFromCamera(ndc, this.camera);
        return rc;
    }

    /**
     * Raycasts against both the visible spheres AND the larger invisible hit-zone
     * spheres.  The hit-zone spheres give a bigger click target in plan view
     * (top-down ortho) where the visible spheres appear as small dots.
     * Returns intersections sorted by distance; the caller can resolve the
     * handleIndex from either the visible or hit-zone userData.
     */
    private raycastHandles(rc: THREE.Raycaster): THREE.Intersection[] {
        const targets: THREE.Mesh[] = [];
        if (this.handleStart) targets.push(this.handleStart);
        if (this.handleEnd)   targets.push(this.handleEnd);
        if (this.hitStart)    targets.push(this.hitStart);
        if (this.hitEnd)      targets.push(this.hitEnd);
        return rc.intersectObjects(targets, false);
    }

    /** Project ray onto horizontal plane y = groundY, return XZ point or null. */
    private projectOnGround(rc: THREE.Raycaster): THREE.Vector3 | null {
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.groundY);
        const pt = new THREE.Vector3();
        const hit = rc.ray.intersectPlane(plane, pt);
        return hit ? pt : null;
    }

    /**
     * Tab key cycles TAB focus:  null → 0 (start handle) → 1 (end handle) → null.
     * The focused handle is coloured amber (ACTIVE).  A subsequent left-click
     * anywhere on the canvas will drag that handle to the clicked position,
     * making endpoints reachable even in top-down plan view where clicking the
     * small sphere dot is impractical.
     */
    private onKeyDown(e: KeyboardEvent): void {
        if (e.key !== 'Tab') return;
        if (!this.activeWallId || this.draggingHandle !== null) return;

        e.preventDefault(); // prevent browser focus-tab behaviour

        // Cycle: null → 0 → 1 → null
        if (this.tabFocusedHandle === null)      this.tabFocusedHandle = 0;
        else if (this.tabFocusedHandle === 0)    this.tabFocusedHandle = 1;
        else                                     this.tabFocusedHandle = null;

        // Update visual colours to reflect the new TAB focus
        this.setHandleColor(
            this.handleStart,
            this.tabFocusedHandle === 0 ? HANDLE_COLOR_ACTIVE : HANDLE_COLOR_IDLE,
        );
        this.setHandleColor(
            this.handleEnd,
            this.tabFocusedHandle === 1 ? HANDLE_COLOR_ACTIVE : HANDLE_COLOR_IDLE,
        );

        console.log(`[WallEndpointController] TAB focus → handle ${this.tabFocusedHandle}`);
    }

    private onMouseDown(e: MouseEvent): void {
        if (e.button !== 0) return;
        if (!this.activeWallId) return;

        const rc   = this.buildRay(e);
        const hits = this.raycastHandles(rc);

        // Determine which handle to drag.  Precedence:
        //   1. Direct sphere hit (works in 3-D perspective view)
        //   2. TAB-focused handle — lets the user click anywhere on the canvas to
        //      reposition the focused handle (plan-view fallback)
        let idx: 0 | 1;
        if (hits.length > 0) {
            idx = (hits[0].object as THREE.Mesh).userData.handleIndex as 0 | 1;
        } else if (this.tabFocusedHandle !== null) {
            idx = this.tabFocusedHandle;
        } else {
            return;
        }

        const wallStore = window.wallStore; // TODO(TASK-08)
        const wall      = wallStore?.getById?.(this.activeWallId);
        if (!wall?.baseLine) return;

        this.draggingHandle    = idx;
        // Phase B DTO migration: baseLine is [Point3D, Point3D] — reconstruct THREE.Vector3
        // for internal tool use (all tool-layer math stays in THREE objects).
        this.dragStartBaseLine = [
            new THREE.Vector3(wall.baseLine[0].x, wall.baseLine[0].y, wall.baseLine[0].z),
            new THREE.Vector3(wall.baseLine[1].x, wall.baseLine[1].y, wall.baseLine[1].z),
        ];
        this.liveBaseLine = [
            new THREE.Vector3(wall.baseLine[0].x, wall.baseLine[0].y, wall.baseLine[0].z),
            new THREE.Vector3(wall.baseLine[1].x, wall.baseLine[1].y, wall.baseLine[1].z),
        ];

        // Set active colour on the VISUAL sphere only
        const visualHandle = idx === 0 ? this.handleStart : this.handleEnd;
        this.setHandleColor(visualHandle, HANDLE_COLOR_ACTIVE);

        e.stopPropagation();
    }

    private onMouseMove(e: MouseEvent): void {
        if (this.draggingHandle === null || !this.activeWallId) {
            // Hover highlight — test against both visual and hit spheres, apply
            // colour only to the visual sphere.
            // TAB-focused handle takes priority: it stays amber unless the cursor
            // is hovering the OTHER handle (in which case show hover on that one).
            const rc   = this.buildRay(e);
            const hits = this.raycastHandles(rc);

            const hoveredIdx = hits.length > 0
                ? (hits[0].object as THREE.Mesh).userData.handleIndex as 0 | 1
                : null;

            const colorFor = (idx: 0 | 1): number => {
                if (hoveredIdx === idx)          return HANDLE_COLOR_HOVER;
                if (this.tabFocusedHandle === idx) return HANDLE_COLOR_ACTIVE;
                return HANDLE_COLOR_IDLE;
            };

            this.setHandleColor(this.handleStart, colorFor(0));
            this.setHandleColor(this.handleEnd,   colorFor(1));
            return;
        }

        const rc  = this.buildRay(e);
        const pt  = this.projectOnGround(rc);
        if (!pt || !this.liveBaseLine) return;

        const newPt = new THREE.Vector3(pt.x, this.groundY, pt.z);

        // Update the dragged endpoint
        this.liveBaseLine[this.draggingHandle] = newPt;

        // Move both visual handle and hit-zone to the new position.
        // §LIVE-DRAG-ISOLATION: VISUAL ONLY — no wallStore mutation here.
        // The store is committed exactly once on mouse-up via the command.
        const handleY = this.groundY + HANDLE_RADIUS;
        if (this.draggingHandle === 0) {
            if (this.handleStart) this.handleStart.position.set(newPt.x, handleY, newPt.z);
            if (this.hitStart)    this.hitStart.position.set(newPt.x, handleY, newPt.z);
        } else {
            if (this.handleEnd) this.handleEnd.position.set(newPt.x, handleY, newPt.z);
            if (this.hitEnd)    this.hitEnd.position.set(newPt.x, handleY, newPt.z);
        }

        e.stopPropagation();
    }

    private onMouseUp(_e: MouseEvent): void {
        if (this.draggingHandle === null || !this.activeWallId) return;

        // Reset handle colour
        const handle = this.draggingHandle === 0 ? this.handleStart : this.handleEnd;
        this.setHandleColor(handle, HANDLE_COLOR_IDLE);

        const wallStore  = window.wallStore; // TODO(TASK-08)
        const cmdMgr     = window.commandManager; // TODO(TASK-06)
        const wall       = wallStore?.getById?.(this.activeWallId);

        if (wall && cmdMgr && this.dragStartBaseLine && this.liveBaseLine) {
            // Phase B DTO migration: convert internal THREE.Vector3 → Point3D for store/command.
            const newBLPt: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] = [
                { x: this.liveBaseLine[0].x, y: this.liveBaseLine[0].y, z: this.liveBaseLine[0].z },
                { x: this.liveBaseLine[1].x, y: this.liveBaseLine[1].y, z: this.liveBaseLine[1].z },
            ];
            const prevBLPt: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }] = [
                { x: this.dragStartBaseLine[0].x, y: this.dragStartBaseLine[0].y, z: this.dragStartBaseLine[0].z },
                { x: this.dragStartBaseLine[1].x, y: this.dragStartBaseLine[1].y, z: this.dragStartBaseLine[1].z },
            ];
            const dx = newBLPt[1].x - newBLPt[0].x;
            const dy = newBLPt[1].y - newBLPt[0].y;
            const dz = newBLPt[1].z - newBLPt[0].z;
            const minLen = 0.1;

            if (Math.sqrt(dx * dx + dy * dy + dz * dz) >= minLen) {
                const cmd = new UpdateWallBaselineCommand({
                    wallId:       this.activeWallId!,
                    newBaseLine:  newBLPt,
                    prevBaseLine: prevBLPt,
                });
                // §WALL-DRAG-COMMIT (DAILY-USE 2026-05-22): timing probe around the
                // rebuild command. The architect reports the scene FREEZES on
                // endpoint drag. The drag itself is visual-only (cheap), so the
                // freeze is on this commit — either the wall-rebuild → room-topology
                // redetect cascade is a long synchronous task / loop, or the
                // rebuild strands the WallTransformController's TransformControls
                // proxy ("attached object must be part of the scene graph" →
                // per-frame throw → freeze). If the "done" line never prints (or
                // prints a huge ms), the hang is INSIDE execute() → rebuild storm.
                const _t0 = performance.now();
                console.log(`[WallEndpointController] §WALL-DRAG-COMMIT execute UpdateWallBaselineCommand wall=${this.activeWallId}`);
                cmdMgr.execute(cmd); // TODO(TASK-06)
                console.log(`[WallEndpointController] §WALL-DRAG-COMMIT done in ${(performance.now() - _t0).toFixed(1)}ms`);
            } else {
                // §LIVE-DRAG-ISOLATION: drag was too short to commit.  The store
                // is already at its pre-drag state (we never mutated it during
                // mouse-move), so we just need to snap the visual handles back
                // to where they started.
                const handleY = this.groundY + HANDLE_RADIUS;
                if (this.draggingHandle === 0) {
                    if (this.handleStart) this.handleStart.position.set(prevBLPt[0].x, handleY, prevBLPt[0].z);
                    if (this.hitStart)    this.hitStart.position.set(prevBLPt[0].x, handleY, prevBLPt[0].z);
                } else {
                    if (this.handleEnd) this.handleEnd.position.set(prevBLPt[1].x, handleY, prevBLPt[1].z);
                    if (this.hitEnd)    this.hitEnd.position.set(prevBLPt[1].x, handleY, prevBLPt[1].z);
                }
            }
        }

        this.draggingHandle    = null;
        this.dragStartBaseLine = null;
        this.liveBaseLine      = null;
        // Clear TAB focus after a drag so the user must re-focus explicitly.
        // This avoids accidental further moves when clicking elsewhere.
        this.tabFocusedHandle = null;
        this.setHandleColor(this.handleStart, HANDLE_COLOR_IDLE);
        this.setHandleColor(this.handleEnd,   HANDLE_COLOR_IDLE);
    }

    private setHandleColor(mesh: THREE.Mesh | null, hex: number): void {
        if (!mesh) return;
        (mesh.material as THREE.MeshStandardMaterial).color.setHex(hex);
    }
}
