import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { CreateWallOpeningCommand } from '@pryzm/command-registry';
import {
    WallStore, WallFragmentBuilder, wallOccupancyStore,
    // §REFUSAL-IDENTITY-CANPLACE (GE-09, C58 §1.13.8) — THE renderer for a canPlace
    // refusal; carries the CanPlaceRefusalCode into the HUD text.
    canPlaceRefusalText,
    // §FEAT-HOSTED-ON-CURVED-WALL — arc-length placement on curved hosts.
    isArcHost, wallCentrelineLength, arcLengthAtPointXZ, arcFrameAt,
    // §OPENING-PROFILE (L-1250) — the shape axis, its labels and its refusal all come from the
    // ONE module that owns the vocabulary. The window tool chooses a value; it never spells one.
    type OpeningProfileKind,
    OPENING_PROFILE_LABELS as PROFILE_LABELS,
} from '@pryzm/geometry-wall';
import { PREVIEW_COLOR } from '@pryzm/core-app-model';
// §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — the 3D window tool no longer
// owns any window state: it reads/writes the ONE WindowToolConfigStore and commits
// through the ONE `window.create` chokepoint, exactly as DoorTool does (L-260 A).
import { getWindowToolConfig, setWindowToolConfig, type WindowTypeChoice } from './WindowToolConfigStore';
import { buildWindowOpening } from './WindowOpeningFactory';
import { resolveWindowDimensions } from './WindowDimensions';

/**
 * §WIN-AUDIT-2026 M6 — explicit HUD state machine. Mirrors the door tool.
 * The HUD now reflects the actual snapping/blocked state during hover and
 * during placement so users get precise feedback ("snapping to wall" vs
 * "out of range" vs "occupancy blocked").
 */
type WindowHudState =
    | 'idle'
    | 'no-wall-target'
    | 'wall-snapping'
    | 'curved-wall-blocked'
    | 'out-of-range'
    | 'occupancy-blocked'
    | 'transient-error';

export class WindowTool {
    private world: OBC.World;
    private wallStore: WallStore;
    private _isActive = false;
    private previewWindow: THREE.Mesh | null = null;
    private statusOverlay: HTMLElement | null = null;
    private _disposed = false;
    private _escListener: ((e: KeyboardEvent) => void) | null = null;
    /** §M6 — current HUD state. */
    private _hudState: WindowHudState = 'idle';

    // §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — the DEFAULT_SINGLE_WIDTH /
    // DEFAULT_DOUBLE_WIDTH / DEFAULT_HEIGHT / DEFAULT_SILL_HEIGHT private fields are
    // GONE. They were one of TWO independent truths for the window's structural
    // opening (the other being the bare literals 1.2 / 2.4 / 1.2 / 1.0 inside
    // WindowPlanToolHandler), which is exactly how a window drawn in plan became a
    // different object from the "same" window drawn in 3D. Every dimension now comes
    // from `resolveWindowDimensions()` — record → system type → canonical default.
    private readonly DEFAULT_THICKNESS_OFFSET = 0.02;

    /** The window's real dimensions for the CURRENT tool choice (pre-creation case). */
    private _dims() {
        const cfg = getWindowToolConfig();
        return resolveWindowDimensions({
            systemTypeId: cfg.systemTypeId,
            windowType:   cfg.windowType,
        });
    }

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
            console.error('[WindowTool] commandManager not injected via constructor — window placement will not function until provided.');
        }
    }

    /** PLAN-03: Called by EngineBootstrap after selectionManager is available. */
    setSelectionManager(sm: any): void {
        this.selectionManager = sm;
    }

    get active(): boolean { return this._isActive; }

    // §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — `windowType` and
    // `systemTypeId` are NOT tool state any more. They are ACCESSORS onto the single
    // `WindowToolConfigStore`, so the 3D tool, the plan tool, the batch generators and
    // the AI planes cannot hold different answers to "which window did the architect
    // choose?". This mirrors DoorTool (L-260 A) exactly.
    //
    // LOAD-BEARING SIDE-EFFECT: `WindowPlanToolHandler` reads
    // `window.windowTool?.systemTypeId` (a P4 global). Because that global is THIS
    // object, the getter below now routes that read into the ONE config store — so the
    // plan path inherits the architect's real choice instead of falling through to the
    // `initTools` bridge's invented `'wt-single-pane'` fallback. The P4 violation still
    // wants deleting, but it can no longer cause a PARITY divergence.
    public get windowType(): WindowTypeChoice { return getWindowToolConfig().windowType; }
    public set windowType(v: WindowTypeChoice) { setWindowToolConfig({ windowType: v }); }

    /**
     * §OPENING-PROFILE (L-1250) — the void SHAPE the architect has chosen, on the SAME config
     * store as the leaf count so the two axes cannot get separate answers. Orthogonal to
     * `windowType`: `double × round-arch` is an ordinary opening and must stay expressible.
     */
    public get openingProfile(): OpeningProfileKind { return getWindowToolConfig().openingProfile; }
    public set openingProfile(v: OpeningProfileKind) { setWindowToolConfig({ openingProfile: v }); }

    /** Pre-selected to Timber Casement — the standard residential default. */
    public get systemTypeId(): string { return getWindowToolConfig().systemTypeId; }
    public set systemTypeId(v: string | undefined) { setWindowToolConfig({ systemTypeId: v }); }

    async activate() {
        if (this._isActive) return;
        this._isActive = true;
        this._escListener = (e: KeyboardEvent) => { if (e.key === 'Escape') this.deactivate(); };
        document.addEventListener('keydown', this._escListener);
        this.attachListeners();
        // §M6 — initial HUD state. Pointer-move drives subsequent transitions.
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
            const wallRoot = this.findWallRoot(hit.object);
            const wallId = wallRoot?.userData?.id || wallRoot?.uuid;
            const wallData = wallId ? this.wallStore.getById(wallId) : undefined;
            // §FEAT-HOSTED-ON-CURVED-WALL — a curved wall is now a first-class host;
            // this only fires when the escape hatch turns the feature off.
            if (wallData?.curve && !isArcHost(wallData)) {
                this.setHudState('curved-wall-blocked');
            } else if (wallData) {
                const occupancy = this._evaluateOccupancyAt(hit, wallData);
                // §REFUSAL-IDENTITY-CANPLACE (GE-09) — a blocked hover carries the
                // occupancy refusal's identity into the HUD, not just a generic state.
                if (occupancy.ok) this.setHudState('wall-snapping');
                else this.setHudState(occupancy.state, occupancy.message);
            } else {
                this.setHudState('wall-snapping');
            }
            this.updatePreview(hit);
        } else {
            this.setHudState('no-wall-target');
            this.clearPreview();
        }
    }

    /** §M6 — mirror of DoorTool live occupancy preview check. */
    private _evaluateOccupancyAt(
        hit: THREE.Intersection,
        wallData: any,
    ): { ok: true } | { ok: false; state: 'out-of-range' | 'occupancy-blocked'; message?: string } {
        try {
            // §FEAT-HOSTED-ON-CURVED-WALL — hover feedback uses the SAME arc-length
            // measure `placeWindow` uses, so the HUD never goes green where placement
            // would then be rejected.
            const wallLength = wallCentrelineLength(wallData);
            if (wallLength < 0.001) return { ok: false, state: 'out-of-range' };
            const rawOffset = arcLengthAtPointXZ(wallData, hit.point.x, hit.point.z).s;
            const width = this._dims().width;
            const halfW = width / 2;
            if (rawOffset < halfW || rawOffset > wallLength - halfW) {
                return { ok: false, state: 'out-of-range' };
            }
            // §OPENING-PROFILE (L-1250) — the HOVER check carries the profile too, so a curved
            // host refuses under the pointer rather than at the click. C84 EI-3: a control that
            // offers a profile the pipeline will refuse is an affordance without an
            // implementation, and the honest fix is to refuse OUT LOUD at the earliest surface.
            const occ = wallOccupancyStore.canPlace(wallData, rawOffset, width, undefined, {
                openingProfile: this.openingProfile,
                heightM:        this._dims().height,
                // §FEAT-WALL-PROFILE-OPENINGS (OPEN38, L-7400) — the SILL, so the host-outline arm can
                // place the rectangle vertically. A window's sill is authored, never assumed.
                sillHeightM:    this._dims().sillHeight,
            });
            // §REFUSAL-IDENTITY-CANPLACE (GE-09, C58 §1.13.8) — the refusal used to be
            // flattened to a bare state here, so the HUD showed one generic sentence
            // for six distinct verdicts. The shared renderer carries occ.code through.
            if (!occ.valid) return { ok: false, state: 'occupancy-blocked', message: canPlaceRefusalText(occ) };
            return { ok: true };
        } catch {
            return { ok: false, state: 'out-of-range' };
        }
    }

    private onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;

        const hit = this.getWallHit(e);
        if (hit) {
            this.placeWindow(hit);
        }
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

        // §FEAT-HOSTED-ON-CURVED-WALL — curved hosts preview like any other wall.
        // Only the disabled escape-hatch mode still suppresses the preview.
        if (wallData.curve && !isArcHost(wallData)) {
            return;
        }

        // Get and validate dimensions — §L-266: the PREVIEW resolves through the SAME
        // authority the committed window does, so preview ≡ placed window (L-127).
        const _d = this._dims();
        const width = _d.width;
        const height = _d.height;
        const thickness = wallData.thickness; // use semantic data, not userData (may be stale)

        // Validate all dimensions are finite numbers
        if (!isFinite(width) || !isFinite(height) || !isFinite(thickness)) {
            console.error("[WindowTool] Invalid preview window dimensions:", { width, height, thickness });
            return;
        }

        // §WINDOW-AUDIT-2026 (PreviewStyle compliance) — windows are wall-hosted, so
        // use the canonical HOSTED green from the shared preview palette.
        const geo = new THREE.BoxGeometry(width, height, thickness + this.DEFAULT_THICKNESS_OFFSET);
        const mat = new THREE.MeshBasicMaterial({ color: PREVIEW_COLOR.HOSTED, transparent: true, opacity: 0.5 });
        this.previewWindow = new THREE.Mesh(geo, mat);

        // ── Position along the wall CENTRELINE ────────────────────────────────
        // §FEAT-HOSTED-ON-CURVED-WALL — project hit.point onto the centreline (the
        // ARC when the host is curved) so the preview centre snaps to the face the
        // user is pointing at, not to a chord that cuts through the wall.
        const wallLength = wallCentrelineLength(wallData);

        // Clamp the preview CENTRE arc length so the span stays within the wall
        let centreS = arcLengthAtPointXZ(wallData, hit.point.x, hit.point.z).s;
        centreS = Math.max(width / 2, Math.min(centreS, wallLength - width / 2));

        // Centre of preview in world XZ, on the centreline
        const _pf = arcFrameAt(wallData, centreS);
        const previewCenter = new THREE.Vector3(_pf.x, 0, _pf.z);

        // §WINDOW-AUDIT-2026 C2 (WIN-PREVIEW-ELEVATION) — preview must respect the
        // same SpatialAuthority contract as the placed window: if the wall has no
        // resolvable level, refuse to show a preview rather than rendering at Y=0.
        if (!wallData.levelId) {
            console.warn(`[WindowTool] Wall ${wallId} has no levelId — preview suppressed.`);
            return;
        }
        const level = this.wallStore.getLevelById(wallData.levelId);
        const elevation = (level as any)?.elevation;
        if (elevation == null || !isFinite(elevation)) {
            console.warn(`[WindowTool] Level "${wallData.levelId}" missing elevation — preview suppressed.`);
            return;
        }

        this.previewWindow.position.set(
            previewCenter.x,
            elevation + _d.sillHeight + height / 2,
            previewCenter.z
        );

        // ── Rotation: align with wall direction (§01 Builder-only projection) ─
        // WallFragmentBuilder builds geometry with wall direction = local +X,
        // using rotation.y = -atan2(dir.z, dir.x). Apply the same rotation so
        // the preview box depth (local Z) runs perpendicular to the wall face.
        // Do NOT copy wall.quaternion — the wall root group has identity rotation;
        // the builder encodes orientation into vertex positions, not the group transform.
        // §FEAT-HOSTED-ON-CURVED-WALL — orient to the TANGENT at the preview centre.
        this.previewWindow.rotation.y = -_pf.angleY;

        this.previewWindow.userData.isPreview = true;
        this.previewWindow.userData.levelId = wallData.levelId;
        this.world.scene.three.add(this.previewWindow);
    }

    private findWallRoot(obj: THREE.Object3D): THREE.Object3D | null {
        let curr: THREE.Object3D | null = obj;
        while (curr) {
            if (curr.userData && (curr.userData.elementType === 'Wall' || curr.userData.elementType === 'wall')) {
                return curr;
            }
            curr = curr.parent;
        }
        return null;
    }

    // PLAN-01: Dispose geometry and material before removing from scene to prevent GPU leak.
    private clearPreview() {
        if (this.previewWindow) {
            this.world.scene.three.remove(this.previewWindow);
            this.previewWindow.geometry.dispose();
            (this.previewWindow.material as THREE.Material).dispose();
            this.previewWindow = null;
        }
    }

    private placeWindow(hit: THREE.Intersection) {
        const wallRoot = this.findWallRoot(hit.object);
        if (!wallRoot) return;

        const wallId = wallRoot.userData.id || wallRoot.uuid;
        const wallData = this.wallStore.getById(wallId);
        if (!wallData) return;

        // §FEAT-HOSTED-ON-CURVED-WALL — curved walls host windows. Only the disabled
        // escape-hatch mode still refuses them.
        if (wallData.curve && !isArcHost(wallData)) {
            this.setHudState('curved-wall-blocked');
            return;
        }

        const levelId = wallData.levelId;
        if (!levelId) {
            throw new Error("Spatial Authority Violation: Host wall has no level context.");
        }

        // §FEAT-HOSTED-ON-CURVED-WALL — the stored `offset` is an ARC LENGTH along the
        // wall centreline. Chord projection would place the window away from the click
        // on a curved wall and compress every offset toward the start (arc > chord).
        const wallLength = wallCentrelineLength(wallData);

        if (wallLength < 0.001) {
            console.warn("[WindowTool] Invalid wall baseline length");
            return;
        }

        const centreAlong = arcLengthAtPointXZ(wallData, hit.point.x, hit.point.z).s;

        // §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — dimensions come from the ONE
        // authority (record → system type → canonical). The width must be known BEFORE the
        // offset, because the offset is the LEFT EDGE of the span.
        const { width, height, sillHeight } = this._dims();

        // Ensure all dimensions are finite numbers
        if (!isFinite(width) || !isFinite(height) || !isFinite(sillHeight)) {
            console.error("[WindowTool] Invalid window dimensions", { width, height, sillHeight });
            return;
        }

        // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): the stored opening `offset` is the
        // LEFT EDGE of the span [offset, offset+width] (the convention used by every
        // generator, the plugin window tool, the occupancy store, and C15 §2 voidStart).
        // The raycast gives the CENTRE the user is pointing at, so convert centre →
        // left edge and clamp the SPAN inside [0, wallLength]. (Previously this stored
        // the centre and passed a centre to the left-edge canPlace — a pre-existing
        // producer/occupancy mismatch fixed here.)
        let offset = centreAlong - width / 2;
        offset = Math.max(0, Math.min(offset, wallLength - width));

        // Validate that the offset is a finite number
        if (!isFinite(offset)) {
            console.error("[WindowTool] Computed window offset is invalid:", offset);
            return;
        }

        // A5: Pre-validate with WallOccupancyStore before dispatching the command.
        // Gives the user immediate, visible feedback instead of a silent no-op when
        // the opening would overlap an existing one or extend beyond the wall end.
        // §OPENING-PROFILE (L-1250) — the COMMIT check. `openingProfileRefusal` names the host,
        // the reason and the live alternative (C16 CA-18), and `canPlaceRefusalText` prefixes its
        // identity code, so the user reads `[OCC_PROFILE_UNSUPPORTED] A circular opening cannot be
        // cut in a CURVED wall: … Use a rectangular opening here, or host it on a straight wall.`
        // ⛔ NEVER a click that silently does nothing, and never a rectangle substituted quietly.
        const occupancy = wallOccupancyStore.canPlace(wallData, offset, width, undefined, {
            openingProfile: this.openingProfile,
            heightM:        height,
            // §FEAT-WALL-PROFILE-OPENINGS (OPEN38, L-7400) — already destructured from `_dims()` above.
            sillHeightM:    sillHeight,
        });
        if (!occupancy.valid) {
            // §REFUSAL-IDENTITY-CANPLACE (GE-09, C58 §1.13.8) — the shared renderer
            // carries occupancy.code into the HUD text, so the refusal the user reads
            // is attributable to its rule (bare `.reason` dropped the identity).
            this.setHudState('occupancy-blocked', canPlaceRefusalText(occupancy));
            this.clearPreview();
            return;
        }

        // A4: use injected commandManager only — no window global fallback.
        const cm = this.commandManager;
        if (cm) {
            // §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266) — the opening record is
            // built by the ONE `window.create` chokepoint from the ONE config (C11 §3).
            // Nothing about the window is resolved here any more: the tool contributes
            // only the host wall and the offset. The plan tool's commit converges on the
            // same record via `buildWindowStoreRecord()`, so the two are byte-identical.
            const openingData = buildWindowOpening({
                wallThickness: wallData.thickness,
                offset,
            });
            cm.execute(new CreateWallOpeningCommand({ wallId, openingData }));
        }

        this.clearPreview();
    }

    /**
     * §M6 — single transition function for the HUD state machine. Mirrors the
     * door tool implementation. Renders the matching message + colour and
     * stores the new state for inspection.
     */
    private setHudState(state: WindowHudState, customMsg?: string): void {
        this._hudState = state;
        const _leaf = this.windowType === 'double' ? 'Double Window' : 'Single Window';
        // §OPENING-PROFILE — name BOTH axes, because the whole point of keeping them orthogonal
        // is lost if the HUD reports only one of them.
        const label = this.openingProfile === 'rectangular'
            ? _leaf
            : `${_leaf} (${PROFILE_LABELS[this.openingProfile]})`;
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
                msg = customMsg ?? 'Windows cannot be placed on curved walls';
                isError = true;
                break;
            case 'out-of-range':
                msg = customMsg ?? `${label}: Move closer to the wall centre — opening too close to the wall end`;
                isError = true;
                break;
            case 'occupancy-blocked':
                msg = customMsg ?? 'Cannot place window here — opening overlaps existing one';
                isError = true;
                break;
            case 'transient-error':
                msg = customMsg ?? 'Window placement failed';
                isError = true;
                break;
        }
        this.showStatus(msg, isError);
    }

    /** §M6 — exposed for tests / telemetry. */
    public getHudState(): WindowHudState { return this._hudState; }

    // Contract §UI_UX_LAYOUT_REFERENCE §6: uses .th-overlay pill bar (not .th-status-pill).
    // isError=true colours the text to indicate a transient error — no red backgrounds.
    private showStatus(msg: string, isError = false): void {
        if (!this.statusOverlay) {
            this.statusOverlay = document.createElement('div');
            this.statusOverlay.className = 'th-overlay';

            const text = document.createElement('span');
            text.id = 'window-tool-status-text';
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

        const textEl = this.statusOverlay.querySelector<HTMLElement>('#window-tool-status-text');
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
