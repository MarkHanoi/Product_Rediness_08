import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { CreateWallOpeningCommand } from '@pryzm/command-registry';
import { WallStore, WallFragmentBuilder, wallOccupancyStore } from '@pryzm/geometry-wall';
// DOC-5.2 — 2D snap on projected TechnicalDrawing edges for door placement in plan view

import { activePlanDrawingRef, planView2DSnapService } from '@pryzm/core-app-model';
import { PREVIEW_COLOR } from '@pryzm/core-app-model';

/**
 * §DOOR-AUDIT-2026 M6 — explicit HUD state machine. The previous
 * implementation only modelled two states: `idle` and a transient error.
 * The tool now drives a richer state surface so the HUD message reflects
 * the actual reason placement is permitted or blocked.
 *
 * State transitions (enforced by `setHudState`):
 *   idle              → wall-snapping       (cursor enters a valid wall)
 *   idle              → no-wall-target      (cursor leaves any wall)
 *   wall-snapping     → out-of-range        (hover position can't fit width)
 *   wall-snapping     → curved-wall-blocked (host wall is curved)
 *   wall-snapping     → occupancy-blocked   (overlaps existing opening)
 *   any               → transient-error     (placement failed loudly)
 *   any               → idle                (deactivate / ESC)
 */
type DoorHudState =
    | 'idle'
    | 'no-wall-target'
    | 'wall-snapping'
    | 'curved-wall-blocked'
    | 'out-of-range'
    | 'occupancy-blocked'
    | 'transient-error';

export class DoorTool {
    private world: OBC.World;
    private wallStore: WallStore;
    private _isActive = false;
    private previewDoor: THREE.Mesh | null = null;
    private statusOverlay: HTMLElement | null = null;
    private _disposed = false;
    private _escListener: ((e: KeyboardEvent) => void) | null = null;
    /** §M6 — current HUD state. Read by tests + telemetry. */
    private _hudState: DoorHudState = 'idle';

    // A3: wall object cache — built once at activate(), kept in sync via wallStore subscription.
    // Eliminates the O(n) scene.traverse() that previously ran on every pointermove event.
    private cachedWallObjects: THREE.Object3D[] = [];
    private wallStoreUnsubscribe: (() => void) | null = null;

    // A4: commandManager injected via constructor; falls back to window global during migration.
    private commandManager: any;

    // PLAN-03: injected selectionManager — set via setSelectionManager() after ToolManager is ready.
    private selectionManager: any = null;

    constructor(world: OBC.World, wallStore: WallStore, _fragmentBuilder: WallFragmentBuilder, _callbacks: any, commandManager?: any) {
        this.world = world;
        this.wallStore = wallStore;
        this.commandManager = commandManager ?? null;
        if (!this.commandManager) {
            console.error('[DoorTool] commandManager not injected via constructor — door placement will not function until provided.');
        }
    }

    /** PLAN-03: Called by EngineBootstrap after selectionManager is available. */
    setSelectionManager(sm: any): void {
        this.selectionManager = sm;
    }

    get active(): boolean { return this._isActive; }

    public doorType: 'single' | 'double' = 'single';
    /** Pre-selected to Solid Timber — the standard residential/commercial default. */
    public systemTypeId: string | undefined = 'dt-solid-timber';

    async activate() {
        if (this._isActive) return;
        this._isActive = true;
        this._escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') this.deactivate(); };
        document.addEventListener('keydown', this._escListener);
        this.attachListeners();
        // §M6 — start in idle. Pointer-move will transition us to wall-snapping
        // / no-wall-target / blocked states based on the active hover.
        this.setHudState('idle');

        // A3: build the cache immediately, then keep it current as walls are added/removed.
        // EngineBootstrap's subscriber fires before ours (it registered first), so the
        // Three.js objects are already in the scene when rebuildWallCache() is called here.
        this.rebuildWallCache();
        this.wallStoreUnsubscribe = this.wallStore.subscribe((event) => {
            if (event === 'add' || event === 'remove') {
                this.rebuildWallCache();
            }
        });
    }

    deactivate() {
        if (!this._isActive) return;
        this._isActive = false;
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
        this.detachListeners();
        this.hideStatus();
        this.clearPreview();

        // A3: tear down subscription and cache on deactivate.
        this.wallStoreUnsubscribe?.();
        this.wallStoreUnsubscribe = null;
        this.cachedWallObjects = [];

        // PLAN-03: use injected selectionManager only — no window global fallback.
        if (this.selectionManager?.setEnabled) {
            this.selectionManager.setEnabled(true);
        }
    }

    cleanup(): void {
        this.deactivate();
        this.clearPreview();
    }

    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this.clearPreview(); // PLAN-01: ensure geometry/material leak is prevented on destroy
        this.cleanup();
        if (this.statusOverlay && this.statusOverlay.parentNode) {
            this.statusOverlay.parentNode.removeChild(this.statusOverlay);
            this.statusOverlay = null;
        }
    }

    private attachListeners() {
        const canvas = this.world.renderer!.three.domElement;
        canvas.addEventListener('pointermove', this.onPointerMove);
        canvas.addEventListener('pointerdown', this.onPointerDown);
    }

    private detachListeners() {
        const canvas = this.world.renderer!.three.domElement;
        canvas.removeEventListener('pointermove', this.onPointerMove);
        canvas.removeEventListener('pointerdown', this.onPointerDown);
    }

    private onPointerMove = (e: PointerEvent) => {
        const hit = this.getWallHit(e);
        if (hit) {
            // §M6 — wall under cursor → check curved/occupancy live so HUD
            // reflects the placement constraint *before* the user clicks.
            const wallRoot = this.findWallRoot(hit.object);
            const wallId = wallRoot?.userData?.id || wallRoot?.uuid;
            const wallData = wallId ? this.wallStore.getById(wallId) : undefined;
            if (wallData?.curve) {
                this.setHudState('curved-wall-blocked');
            } else if (wallData) {
                const refined = this._get2DRefinedHit(hit, e);
                const occupancy = this._evaluateOccupancyAt(refined, wallData);
                this.setHudState(occupancy.ok ? 'wall-snapping' : occupancy.state);
            } else {
                this.setHudState('wall-snapping');
            }
            this.updatePreview(this._get2DRefinedHit(hit, e));
        } else {
            this.setHudState('no-wall-target');
            this.clearPreview();
        }
    }

    /**
     * §M6 — evaluate the same occupancy constraint placeDoor() will run, so the
     * HUD can transition into `out-of-range` / `occupancy-blocked` *during*
     * hover. Pure read; no state mutation.
     */
    private _evaluateOccupancyAt(
        hit: THREE.Intersection,
        wallData: any,
    ): { ok: true } | { ok: false; state: 'out-of-range' | 'occupancy-blocked' } {
        try {
            const startPt = wallData.baseLine[0];
            const endPt   = wallData.baseLine[1];
            const start = new THREE.Vector3(startPt.x, startPt.y, startPt.z);
            const end   = new THREE.Vector3(endPt.x, endPt.y, endPt.z);
            const wallDir = new THREE.Vector3().subVectors(end, start);
            const wallLength = wallDir.length();
            if (wallLength < 0.001) return { ok: false, state: 'out-of-range' };
            const wallDirN = wallDir.clone().normalize();
            const hitDir = new THREE.Vector3().subVectors(hit.point, start);
            const rawOffset = hitDir.dot(wallDirN);
            const width = this.doorType === 'double' ? 2.0 : 1.0;
            const halfW = width / 2;
            if (rawOffset < halfW || rawOffset > wallLength - halfW) {
                return { ok: false, state: 'out-of-range' };
            }
            const occ = wallOccupancyStore.canPlace(wallData, rawOffset, width);
            if (!occ.valid) return { ok: false, state: 'occupancy-blocked' };
            return { ok: true };
        } catch {
            return { ok: false, state: 'out-of-range' };
        }
    }

    private onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;

        const hit = this.getWallHit(e);
        if (hit) {
            this.placeDoor(this._get2DRefinedHit(hit, e));
        }
    }

    /**
     * DOC-5.2 — Refine the 3D raycast hit.point using the 2D snap system in plan view.
     *
     * In plan view (OrthographicCamera + mounted TechnicalDrawing), the projected wall
     * edges give sub-pixel accurate snap positions. If a 2D snap candidate is found
     * within the snap radius, the returned hit's point is replaced with the 2D snap
     * world position. The hit.object remains unchanged — wall identification always uses
     * the 3D raycast result.
     *
     * Falls back to the original hit unchanged when:
     *   - Camera is not OrthographicCamera (3D view)
     *   - No TechnicalDrawing is mounted (activePlanDrawingRef.drawing is null)
     *   - No 2D snap candidate within radius
     *
     * §02 §6.1 — Tool layer only; no store writes; drawing is read-only.
     */
    private _get2DRefinedHit(hit: THREE.Intersection, e: PointerEvent): THREE.Intersection {
        const drawing2D = activePlanDrawingRef.drawing;
        const camera = this.world.camera.three;
        if (!drawing2D || !(camera instanceof THREE.OrthographicCamera)) return hit;

        const canvas = this.world.renderer!.three.domElement;

        // Resolve the level elevation from the wall data via WallStore (no window globals)
        const wallRoot = this.findWallRoot(hit.object);
        const wallId = wallRoot?.userData?.id ?? wallRoot?.uuid;
        const wallData = wallId ? this.wallStore.getById(wallId) : null;
        const level = wallData ? this.wallStore.getLevelById(wallData.levelId) : null;
        const elevation: number = (level as any)?.elevation ?? hit.point.y;

        const snap2D = planView2DSnapService.querySnap(
            e.clientX, e.clientY,
            drawing2D, camera, canvas,
            elevation,
        );

        if (!snap2D) return hit;

        console.log(`[DoorTool] DOC-5.2 2D snap: ${snap2D.snapType}`, snap2D.worldPos);

        // Return a shallow copy with the refined hit point; all other fields unchanged
        return { ...hit, point: snap2D.worldPos };
    }

    // A3: Populate cache by traversing the scene once. Called at activate() and
    // whenever a wall is added or removed from WallStore.
    private rebuildWallCache(): void {
        this.cachedWallObjects = [];
        this.world.scene.three.traverse(obj => {
            if (obj.userData?.elementType === 'Wall' || obj.userData?.elementType === 'wall') {
                this.cachedWallObjects.push(obj);
            }
        });
    }

    private getWallHit(e: PointerEvent) {
        const rect = this.world.renderer!.three.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);

        // A3: use the pre-built cache — no O(n) traverse per pointermove event.
        const intersects = raycaster.intersectObjects(this.cachedWallObjects, true);
        return intersects.length > 0 ? intersects[0] : null;
    }

    private updatePreview(hit: THREE.Intersection) {
        this.clearPreview();
        const wall = this.findWallRoot(hit.object);
        if (!wall) return;

        const wallId = wall.userData.id || wall.uuid;
        const wallData = this.wallStore.getById(wallId);
        if (!wallData) return;

        // PLAN-05: Curved walls are not supported — skip preview silently.
        if (wallData.curve) {
            return;
        }

        const width = this.doorType === 'double' ? 2.0 : 1.0;
        const doorHeight = 2.1;
        const thickness = wallData.thickness;

        // §DOOR-AUDIT-2026 (PreviewStyle compliance) — doors are wall-hosted; use
        // the canonical HOSTED green from the shared PreviewStyle palette.
        const geo = new THREE.BoxGeometry(width, doorHeight, thickness + 0.02);
        const mat = new THREE.MeshBasicMaterial({ color: PREVIEW_COLOR.HOSTED, transparent: true, opacity: 0.5 });
        this.previewDoor = new THREE.Mesh(geo, mat);

        // ── Position along wall baseline ──────────────────────────────────────
        // Project hit.point onto the wall baseline so the preview centre snaps
        // to the wall surface rather than floating at the raw raycast point.
        const startPt = wallData.baseLine[0];
        const endPt   = wallData.baseLine[1];
        const start = new THREE.Vector3(startPt.x, startPt.y, startPt.z);
        const end   = new THREE.Vector3(endPt.x, endPt.y, endPt.z);
        const wallDir = new THREE.Vector3().subVectors(end, start);
        const wallLength = wallDir.length();
        const wallDirN = wallDir.clone().normalize();

        // Clamp offset so the preview stays within the wall
        let offset = new THREE.Vector3().subVectors(hit.point, start).dot(wallDirN);
        offset = Math.max(width / 2, Math.min(offset, wallLength - width / 2));

        // Centre of preview in world XZ
        const previewCenter = start.clone().addScaledVector(wallDirN, offset);

        // §DOOR-AUDIT-2026 (DOOR-PREVIEW-ELEVATION) — preview must respect the same
        // SpatialAuthority contract as the placed door: if the wall has no resolvable
        // level, suppress the preview rather than rendering at Y=0.
        if (!wallData.levelId) {
            console.warn(`[DoorTool] Wall ${wallId} has no levelId — preview suppressed.`);
            return;
        }
        const level = this.wallStore.getLevelById(wallData.levelId);
        const elevation = (level as any)?.elevation;
        if (elevation == null || !isFinite(elevation)) {
            console.warn(`[DoorTool] Level "${wallData.levelId}" missing elevation — preview suppressed.`);
            return;
        }

        this.previewDoor.position.set(previewCenter.x, elevation + doorHeight / 2, previewCenter.z);

        // ── Rotation: align with wall direction (§01 Builder-only projection) ─
        // WallFragmentBuilder builds geometry with wall direction = local +X,
        // using rotation.y = -atan2(dir.z, dir.x). Apply the same rotation so
        // the preview box depth (local Z) runs perpendicular to the wall face.
        // Do NOT copy wall.quaternion — the wall root group has identity rotation;
        // the builder encodes orientation into vertex positions, not the group transform.
        const angle = Math.atan2(wallDirN.z, wallDirN.x);
        this.previewDoor.rotation.y = -angle;

        this.previewDoor.userData.isPreview = true;
        this.previewDoor.userData.levelId = wallData.levelId;
        this.world.scene.three.add(this.previewDoor);
    }

    private findWallRoot(obj: THREE.Object3D): THREE.Object3D | null {
        let curr: THREE.Object3D | null = obj;
        while (curr) {
            const type = curr.userData?.elementType;
            if (type === 'Wall' || type === 'wall') return curr;
            curr = curr.parent;
        }
        return null;
    }

    // PLAN-01: Dispose geometry and material before removing from scene to prevent GPU leak.
    private clearPreview() {
        if (this.previewDoor) {
            this.world.scene.three.remove(this.previewDoor);
            this.previewDoor.geometry.dispose();
            (this.previewDoor.material as THREE.Material).dispose();
            this.previewDoor = null;
        }
    }

    private placeDoor(hit: THREE.Intersection) {
        const wallRoot = this.findWallRoot(hit.object);
        if (!wallRoot) return;

        const wallId = wallRoot.userData.id || wallRoot.uuid;
        const wallData = this.wallStore.getById(wallId);
        if (!wallData) return;

        // PLAN-05: Block door placement on curved walls at the tool layer.
        if (wallData.curve) {
            this.setHudState('curved-wall-blocked');
            return;
        }

        const levelId = wallData.levelId;
        if (!levelId) {
            throw new Error("Spatial Authority Violation: Host wall has no level context.");
        }

        const startPt2 = wallData.baseLine[0];
        const endPt2   = wallData.baseLine[1];
        const start = new THREE.Vector3(startPt2.x, startPt2.y, startPt2.z);
        const end   = new THREE.Vector3(endPt2.x, endPt2.y, endPt2.z);

        const wallDir = new THREE.Vector3().subVectors(end, start);
        const wallLength = wallDir.length();

        if (wallLength < 0.001) {
            console.warn("[DoorTool] Invalid wall baseline length");
            return;
        }

        const wallDirNormalized = wallDir.clone().normalize();
        const hitDir = new THREE.Vector3().subVectors(hit.point, start);

        let offset = hitDir.dot(wallDirNormalized);

        // PLAN-10: Clamp using CENTER convention (not 0 to wallLength).
        // offset is the distance from baseLine[0] to the CENTRE of the opening.
        const width = this.doorType === 'double' ? 2.0 : 1.0;
        const halfW = width / 2;
        offset = Math.max(halfW, Math.min(offset, wallLength - halfW));

        if (!isFinite(offset)) {
            console.error("[DoorTool] Computed door offset is invalid:", offset);
            return;
        }

        // A5: Pre-validate with WallOccupancyStore before dispatching the command.
        // Gives the user immediate, visible feedback instead of a silent no-op when
        // the opening would overlap an existing one or extend beyond the wall end.
        const occupancy = wallOccupancyStore.canPlace(wallData, offset, width);
        if (!occupancy.valid) {
            this.setHudState('occupancy-blocked', occupancy.reason);
            this.clearPreview();
            return;
        }

        // A4: use injected commandManager only — no window global fallback.
        const cm = this.commandManager;
        if (cm) {
            // B6: Pass rich payload so DoorStore receives full parametric data.
            // frameDepth matches wall thickness for accurate frame geometry.
            cm.execute(new CreateWallOpeningCommand({
                wallId,
                openingData: {
                    type: 'door',
                    doorType: this.doorType,
                    width,
                    height: 2.1,
                    offset: offset,
                    sillHeight: 0,
                    frameDepth: wallData.thickness,
                    systemTypeId: this.systemTypeId,
                }
            }));
        }

        this.clearPreview();
    }

    /**
     * §M6 — single transition function for the HUD state machine. Updates
     * `_hudState` and renders the matching message + colour. Pass `customMsg`
     * to override the default text (used for occupancy reasons).
     */
    private setHudState(state: DoorHudState, customMsg?: string): void {
        this._hudState = state;
        const label = this.doorType === 'double' ? 'Double Door' : 'Single Door';
        let msg: string;
        let isError = false;
        switch (state) {
            case 'idle':
                msg = `${label}: Hover over a wall to place`;
                break;
            case 'no-wall-target':
                msg = `${label}: Hover over a wall to place`;
                break;
            case 'wall-snapping':
                msg = `${label}: Click to place — snapping to wall`;
                break;
            case 'curved-wall-blocked':
                msg = customMsg ?? 'Doors cannot be placed on curved walls';
                isError = true;
                break;
            case 'out-of-range':
                msg = customMsg ?? `${label}: Move closer to the wall centre — opening too close to the wall end`;
                isError = true;
                break;
            case 'occupancy-blocked':
                msg = customMsg ?? 'Cannot place door here — opening overlaps existing one';
                isError = true;
                break;
            case 'transient-error':
                msg = customMsg ?? 'Door placement failed';
                isError = true;
                break;
        }
        this.showStatus(msg, isError);
    }

    /** §M6 — exposed for tests / telemetry. */
    public getHudState(): DoorHudState { return this._hudState; }

    // Contract §UI_UX_LAYOUT_REFERENCE §6: uses .th-overlay pill bar (not .th-status-pill).
    // isError=true colours the text to indicate a transient error — no red backgrounds.
    private showStatus(msg: string, isError = false): void {
        if (!this.statusOverlay) {
            this.statusOverlay = document.createElement('div');
            this.statusOverlay.className = 'th-overlay';

            const text = document.createElement('span');
            text.id = 'door-tool-status-text';
            text.className = 'th-text';
            this.statusOverlay.appendChild(text);

            const sep = document.createElement('span');
            sep.className = 'th-sep';
            this.statusOverlay.appendChild(sep);

            const escHint = document.createElement('span');
            escHint.className = 'th-esc';
            escHint.textContent = 'ESC to finish';
            this.statusOverlay.appendChild(escHint);

            document.body.appendChild(this.statusOverlay);
        }

        const textEl = this.statusOverlay.querySelector<HTMLElement>('#door-tool-status-text');
        if (textEl) {
            textEl.textContent = msg;
            // Permitted semantic error colour (§06 §4.1) — only for transient error messages.
            textEl.style.color = isError ? '#c62828' : '';
        }

        this.statusOverlay.style.display = 'flex';
    }

    private hideStatus(): void {
        if (this.statusOverlay) {
            this.statusOverlay.style.display = 'none';
        }
    }
}
