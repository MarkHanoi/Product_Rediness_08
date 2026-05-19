import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ITool, ToolName, ToolState } from './types.js';
import { SnapManager } from '@pryzm/snapping';
// §WALL-AUDIT-2026-W5: shared camera-zoom-aware tolerance.
import {
    DEFAULT_SNAP_PIXEL_RADIUS,
    getWorldToleranceForActiveCamera,
} from '@pryzm/core-app-model/views';
import { BeamStore } from '@pryzm/core-app-model/stores';
import { CreateBeamCommand } from '@pryzm/command-registry';
import { CommandManager } from '@pryzm/command-registry';
import { SteelProfileLibrary } from '@pryzm/plugin-structural';

export interface BeamTypeConfig {
    id:               string;
    profile:          'rectangular' | 'circular' | 'UB' | 'UC';
    width:            number;
    depth:            number;
    steelProfileName?: string;
}

export class BeamTool implements ITool {
    readonly name: ToolName = 'beam';
    private _isActive = false;
    private _state: ToolState = ToolState.IDLE;

    private world: OBC.World;
    private beamStore: BeamStore;
    private commandManager: CommandManager;
    private snapManager: SnapManager | null = null;

    // ── Type state ──────────────────────────────────────────────────────────
    private _beamWidth        = 0.25;
    private _beamDepth        = 0.40;
    private _sectionType:  'rectangular' | 'UB' | 'UC' = 'UB';
    private _steelProfileName: string = SteelProfileLibrary.defaultUB().name;

    // ── Scene objects ────────────────────────────────────────────────────────
    private startPoint: THREE.Vector3 | null = null;
    private previewLine: THREE.Line | null = null;
    private previewBox:  THREE.Mesh | null = null;
    private startMarker: THREE.Mesh | null = null;

    // ── Event handlers ───────────────────────────────────────────────────────
    private pointerDownHandler: ((e: PointerEvent) => void) | null = null;
    private pointerMoveHandler: ((e: PointerEvent) => void) | null = null;

    constructor(world: OBC.World, beamStore: BeamStore, commandManager: CommandManager) {
        this.world = world;
        this.beamStore = beamStore;
        this.commandManager = commandManager;

        const wallStore = window.wallStore ; // TODO(TASK-07)
        this.snapManager = SnapManager.createWithDefaults(
            world.scene.three as THREE.Scene,
            wallStore,
            window.curtainWallStore ?? null, // TODO(TASK-07)
            {
                doorStore:      window.doorStore, // TODO(TASK-07)
                windowStore:    window.windowStore, // TODO(TASK-07)
                columnStore:    window.columnStore, // TODO(TASK-07)
                slabStore:      window.slabStore, // TODO(TASK-07)
                stairStore:     window.stairStore, // TODO(TASK-07)
                furnitureStore: window.furnitureStore, // TODO(TASK-07)
                beamStore:      beamStore,
                gridStore:      window.gridStore, // TODO(TASK-07)
            },
        );

        console.log('BeamTool initialized with BeamStore:', !!this.beamStore);
    }

    get isActive() { return this._isActive; }
    get state()    { return this._state; }

    setBeamType(config: BeamTypeConfig): void {
        this._beamWidth  = config.width;
        this._beamDepth  = config.depth;
        if (config.steelProfileName) this._steelProfileName = config.steelProfileName;
        if (config.profile === 'UB' || config.profile === 'UC') {
            this._sectionType = config.profile;
        } else {
            this._sectionType = 'rectangular';
        }
    }

    async activate() {
        if (this._isActive) return;
        this._isActive = true;
        this._state = ToolState.IDLE;

        if (this.world.camera?.controls) {
            this.world.camera.controls.enabled = false;
        }

        this.attachListeners();
        this.showUI();
        console.log('BeamTool activated');
    }

    deactivate() {
        if (!this._isActive) return;
        this.cancel();
        this._isActive = false;
        this.detachListeners();
        this.hideUI();

        if (this.world.camera?.controls) {
            this.world.camera.controls.enabled = true;
        }
        console.log('BeamTool deactivated');
    }

    cancel() {
        this.clearPreview();
        this.startPoint = null;
        this._state = ToolState.IDLE;
    }

    cleanup()       { this.deactivate(); }
    onActivate()    {}
    onDeactivate()  { this.deactivate(); }
    onCancel()      { this.cancel(); }

    getStateInfo() {
        return {
            name:         this.name,
            state:        this._state,
            isActive:     this._isActive,
            hasPreview:   !!this.previewLine,
            hasListeners: !!this.pointerDownHandler
        };
    }

    dispose() {
        this.cleanup();
        if (this.snapManager) this.snapManager.dispose();
    }

    // ── Listeners ────────────────────────────────────────────────────────────

    private attachListeners() {
        const canvas = this.world.renderer!.three.domElement;
        this.pointerDownHandler = (e) => this.onPointerDown(e);
        this.pointerMoveHandler = (e) => this.onPointerMove(e);
        canvas.addEventListener('pointerdown', this.pointerDownHandler);
        canvas.addEventListener('pointermove', this.pointerMoveHandler);
    }

    private detachListeners() {
        const canvas = this.world.renderer!.three.domElement;
        if (this.pointerDownHandler) canvas.removeEventListener('pointerdown', this.pointerDownHandler);
        if (this.pointerMoveHandler) canvas.removeEventListener('pointermove', this.pointerMoveHandler);
        this.pointerDownHandler = null;
        this.pointerMoveHandler = null;
    }

    // ── Pointer events ───────────────────────────────────────────────────────

    private onPointerDown(e: PointerEvent) {
        if (!this._isActive) return;
        if (e.button !== 0) return;
        const point = this.getWorldPoint(e);
        if (!point) return;

        const snapped = this.getSnappedPoint(point, e);
        snapped.y = this.computeBeamY();   // lock Y to correct elevation

        if (this._state === ToolState.IDLE) {
            this.startPoint = snapped.clone();
            this._state = ToolState.DRAWING;
            this.createStartMarker(snapped);
            console.log('BeamTool: Start point set', snapped);

            if (this.snapManager) {
                this.snapManager.setActiveStartPoint(snapped);
            }
        } else if (this._state === ToolState.DRAWING) {
            console.log('BeamTool: Finishing drawing at', snapped);
            this.finishDrawing(snapped);
        }
    }

    private onPointerMove(e: PointerEvent) {
        if (!this._isActive) return;
        const point = this.getWorldPoint(e);
        if (!point) return;
        const snapped = this.getSnappedPoint(point, e);
        snapped.y = this.computeBeamY();

        if (this._state === ToolState.DRAWING && this.startPoint) {
            this.updatePreview(this.startPoint, snapped);
        }
    }

    // ── Drawing ──────────────────────────────────────────────────────────────

    private finishDrawing(endPoint: THREE.Vector3) {
        if (!this.startPoint) return;

        const isSteelSection = this._sectionType === 'UB' || this._sectionType === 'UC';
        const profile = isSteelSection ? SteelProfileLibrary.get(this._steelProfileName) : undefined;

        let width = this._beamWidth;
        let depth = this._beamDepth;
        if (profile) {
            width = profile.B / 1000;
            depth = profile.D / 1000;
        }

        const command = new CreateBeamCommand({
            startPoint: { x: this.startPoint.x, y: this.startPoint.y, z: this.startPoint.z },
            endPoint:   { x: endPoint.x,        y: endPoint.y,        z: endPoint.z },
            width,
            depth,
            sectionType:      this._sectionType,
            steelProfileName: isSteelSection ? this._steelProfileName : undefined,
        });

        // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('beam.create', {}).catch(() => {}); }
        const result = this.commandManager.execute(command);
        console.log('BeamTool: Command execution result', result);
        this.cancel();
    }

    // ── Beam Tool UI ──────────────────────────────────────────────────────────

    private showUI(): void {
        let modal = document.getElementById('beam-tool-ui');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'beam-tool-ui';
            document.body.appendChild(modal);
        }
        modal.className = 'th-overlay th-structural-picker';

        const ubProfiles = SteelProfileLibrary.UB.map(p =>
            `<option value="${p.name}" ${p.name === this._steelProfileName ? 'selected' : ''}>${p.name} (${p.mass} kg/m)</option>`
        ).join('');
        const ucProfiles = SteelProfileLibrary.UC.map(p =>
            `<option value="${p.name}" ${p.name === this._steelProfileName ? 'selected' : ''}>${p.name} (${p.mass} kg/m)</option>`
        ).join('');

        modal.innerHTML = `
            <span class="th-title">Beam Placement</span>
            <div style="font-size:11px;opacity:0.65;margin-bottom:6px;">Click start → Click end</div>

            <div class="th-section">
                <label class="th-label">Section Type</label>
                <div class="th-btn-row">
                    <button class="th-btn ${this._sectionType === 'UB' ? 'th-btn--active' : ''}" id="beam-mode-ub">Steel UB</button>
                    <button class="th-btn ${this._sectionType === 'UC' ? 'th-btn--active' : ''}" id="beam-mode-uc">Steel UC</button>
                    <button class="th-btn ${this._sectionType === 'rectangular' ? 'th-btn--active' : ''}" id="beam-mode-rect">Concrete</button>
                </div>
            </div>

            <div id="beam-steel-ui" style="display:${this._sectionType !== 'rectangular' ? 'block' : 'none'}">
                <label class="th-label">Profile</label>
                <select id="beam-steel-profile" class="th-input" style="width:100%;margin-bottom:4px;" size="1">
                    <optgroup label="Universal Beams (UB)">${ubProfiles}</optgroup>
                    <optgroup label="Universal Columns (UC)">${ucProfiles}</optgroup>
                </select>
                <div id="beam-profile-info" class="th-info-row" style="font-size:11px;opacity:0.7;"></div>
            </div>

            <div id="beam-concrete-ui" style="display:${this._sectionType === 'rectangular' ? 'block' : 'none'}">
                <label class="th-label">Width (m)</label>
                <input id="beam-width" type="number" class="th-input" value="${this._beamWidth}" step="0.05" min="0.1" />
                <label class="th-label">Depth (m)</label>
                <input id="beam-depth" type="number" class="th-input" value="${this._beamDepth}" step="0.05" min="0.1" />
            </div>

            <div class="th-btn-row" style="margin-top:8px;">
                <button id="beam-cancel-btn" class="th-btn th-btn--primary" style="width:100%;">Cancel (ESC)</button>
            </div>
        `;

        this._updateBeamProfileInfo();

        ['ub', 'uc', 'rect'].forEach(mode => {
            document.getElementById(`beam-mode-${mode}`)?.addEventListener('click', e => {
                e.stopPropagation();
                const map: Record<string, 'UB' | 'UC' | 'rectangular'> = { ub: 'UB', uc: 'UC', rect: 'rectangular' };
                this._sectionType = map[mode];
                if (this._sectionType === 'UB') this._steelProfileName = SteelProfileLibrary.defaultUB().name;
                if (this._sectionType === 'UC') this._steelProfileName = SteelProfileLibrary.defaultUC().name;
                const isSteel = this._sectionType !== 'rectangular';
                (document.getElementById('beam-steel-ui')    as HTMLElement).style.display = isSteel ? 'block' : 'none';
                (document.getElementById('beam-concrete-ui') as HTMLElement).style.display = isSteel ? 'none' : 'block';
                modal!.querySelectorAll('.th-btn[id^="beam-mode-"]').forEach(btn => btn.classList.remove('th-btn--active'));
                (e.target as HTMLElement).classList.add('th-btn--active');
                const select = document.getElementById('beam-steel-profile') as HTMLSelectElement | null;
                if (select && isSteel) {
                    select.value = this._steelProfileName;
                }
                this._updateBeamProfileInfo();
            });
        });

        const profileSel = document.getElementById('beam-steel-profile') as HTMLSelectElement;
        profileSel?.addEventListener('change', e => {
            e.stopPropagation();
            this._steelProfileName = (e.target as HTMLSelectElement).value;
            const p = SteelProfileLibrary.get(this._steelProfileName);
            if (p) this._sectionType = p.series as 'UB' | 'UC';
            this._updateBeamProfileInfo();
        });

        document.getElementById('beam-width')?.addEventListener('change', e => {
            this._beamWidth = parseFloat((e.target as HTMLInputElement).value) || this._beamWidth;
        });
        document.getElementById('beam-depth')?.addEventListener('change', e => {
            this._beamDepth = parseFloat((e.target as HTMLInputElement).value) || this._beamDepth;
        });

        document.getElementById('beam-cancel-btn')?.addEventListener('click', e => {
            e.stopPropagation();
            this.deactivate();
        });

        modal.style.display = 'flex';
    }

    private _updateBeamProfileInfo(): void {
        const el = document.getElementById('beam-profile-info');
        if (!el) return;
        const p = SteelProfileLibrary.get(this._steelProfileName);
        el.textContent = p ? `D=${p.D}mm  B=${p.B}mm  t=${p.t}mm  T=${p.T}mm  ${p.mass} kg/m` : '';
    }

    private hideUI(): void {
        const modal = document.getElementById('beam-tool-ui');
        if (modal) modal.style.display = 'none';
    }

    // ── Y elevation helpers ──────────────────────────────────────────────────

    /**
     * Return the floor elevation (Y) of the currently active level.
     * Used by getWorldPoint() to raycast against the correct floor plane so
     * that X,Z click coordinates are accurate for non-ground floors.
     */
    private _getActiveLevelElevation(): number {
        const wallStore: any = window.wallStore ; // TODO(TASK-07)
        const levels: any[] = wallStore?.getLevels?.() ?? [];
        const activeLevelId: string | undefined = wallStore?.activeLevelId;
        const activeLevel = levels.find((l: any) => l.id === activeLevelId);
        return activeLevel?.elevation ?? 0;
    }

    /**
     * Compute the beam centreline Y (metres) so the beam sits directly
     * under the slab of the floor above.
     *   beamCentreY = levelElevation + levelHeight - slabThickness - depth/2
     */
    private computeBeamY(): number {
        const SLAB_THICKNESS = 0.2;
        const FALLBACK_HEIGHT = 3.0;

        const wallStore: any = window.wallStore ; // TODO(TASK-07)
        const levels: any[] = wallStore?.getLevels?.() ?? [];
        const activeLevelId: string | undefined = wallStore?.activeLevelId;

        const activeLevel = levels.find((l: any) => l.id === activeLevelId);
        const elevation: number = activeLevel?.elevation ?? 0;

        const sorted = [...levels].sort((a, b) => a.elevation - b.elevation);
        const idx = sorted.findIndex((l: any) => l.id === activeLevelId);
        // Guard against idx=-1 (active level not in sorted list): when idx is -1,
        // sorted[idx+1] = sorted[0] which gives levelHeight=0 and places the beam
        // at -depth/2 (below the floor).  Fall back to FALLBACK_HEIGHT instead.
        const nextLevel = idx >= 0 ? sorted[idx + 1] : undefined;
        const levelHeight: number = nextLevel
            ? nextLevel.elevation - elevation
            : FALLBACK_HEIGHT;

        return elevation + levelHeight - SLAB_THICKNESS - this._beamDepth / 2;
    }

    // ── Raycasting ───────────────────────────────────────────────────────────

    private getWorldPoint(e: PointerEvent): THREE.Vector3 | null {
        const canvas = this.world.renderer!.three.domElement;
        const rect   = canvas.getBoundingClientRect();
        const mouse  = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width)  *  2 - 1,
            -((e.clientY - rect.top)  / rect.height) *  2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);

        // Intersect with a horizontal plane at the active level's floor elevation.
        // Using Y=0 (ground) for upper floors caused the click X,Z to be offset
        // by parallax because the ray had to travel an extra levelElevation metres
        // further than the visible floor.  Using the actual floor elevation keeps
        // X,Z accurate; Y is always overridden by computeBeamY() afterward.
        const levelY = this._getActiveLevelElevation();
        const plane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), -levelY);
        const target = new THREE.Vector3();
        return raycaster.ray.intersectPlane(plane, target) ? target : null;
    }

    private getSnappedPoint(point: THREE.Vector3, e: PointerEvent): THREE.Vector3 {
        if (this.snapManager && this.snapManager.isEnabled()) {
            // §WALL-AUDIT-2026-W5: pass camera-zoom-aware tolerance.
            const _camForSnap = this.world.camera?.three;
            const _canvasForSnap = this.world.renderer?.three?.domElement as HTMLCanvasElement | undefined;
            const _snapTolerance = getWorldToleranceForActiveCamera(
                DEFAULT_SNAP_PIXEL_RADIUS,
                _camForSnap,
                _canvasForSnap,
            );
            const res = this.snapManager.snap(
                point,
                { x: e.clientX, y: e.clientY },
                false,
                _snapTolerance,
            );
            return res.point;
        }
        return point;
    }

    // ── Preview ──────────────────────────────────────────────────────────────

    private createStartMarker(point: THREE.Vector3) {
        const geometry = new THREE.SphereGeometry(0.15, 16, 16);
        const material = new THREE.MeshBasicMaterial({ color: 0x6600ff });
        this.startMarker = new THREE.Mesh(geometry, material);
        this.startMarker.position.copy(point);
        this.startMarker.userData.isPreview = true;
        this.world.scene.three.add(this.startMarker);
    }

    private updatePreview(start: THREE.Vector3, end: THREE.Vector3) {
        // Clear old preview objects first
        this.clearPreviewLine();
        this.clearPreviewBox();

        // ── Line ──────────────────────────────────────────────────────────────
        const lineGeom = new THREE.BufferGeometry().setFromPoints([
            start.clone(),
            end.clone(),
        ]);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x6600ff, linewidth: 2 });
        this.previewLine = new THREE.Line(lineGeom, lineMat);
        this.previewLine.userData.isPreview = true;
        this.world.scene.three.add(this.previewLine);

        // ── Box ───────────────────────────────────────────────────────────────
        const direction = new THREE.Vector3().subVectors(end, start);
        const length    = direction.length();

        if (length > 0.05) {
            const boxGeom = new THREE.BoxGeometry(length, this._beamDepth, this._beamWidth);
            const boxMat  = new THREE.MeshStandardMaterial({
                color:       0x6600ff,
                transparent: true,
                opacity:     0.35,
                depthWrite:  false,
            });
            this.previewBox = new THREE.Mesh(boxGeom, boxMat);

            const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
            this.previewBox.position.copy(center);

            // Orient along the beam axis
            const angle = Math.atan2(direction.x, direction.z);
            this.previewBox.rotation.y = angle;

            this.previewBox.userData.isPreview = true;
            this.world.scene.three.add(this.previewBox);
        }
    }

    private clearPreviewLine() {
        if (this.previewLine) {
            this.previewLine.geometry.dispose();
            (this.previewLine.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.previewLine);
            this.previewLine = null;
        }
    }

    private clearPreviewBox() {
        if (this.previewBox) {
            this.previewBox.geometry.dispose();
            (this.previewBox.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.previewBox);
            this.previewBox = null;
        }
    }

    private clearStartMarker() {
        if (this.startMarker) {
            this.startMarker.geometry.dispose();
            (this.startMarker.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.startMarker);
            this.startMarker = null;
        }
    }

    private clearPreview() {
        this.clearPreviewLine();
        this.clearPreviewBox();
        this.clearStartMarker();
    }
}
