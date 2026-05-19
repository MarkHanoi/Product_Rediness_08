import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { CreateRoofCommand } from '@pryzm/command-registry';
import { RoofFootprint, RoofType } from './RoofTypes.js';
import { CommandManager } from '@pryzm/command-registry';
import { ProjectContext } from '@pryzm/core-app-model';
import { WallRegionDetector } from './WallRegionDetector.js';
import { RoofSnapEngine } from './RoofSnapEngine.js';
import { PREVIEW_COLOR, tagPreview, disposePreviewObject } from '@pryzm/core-app-model';

export enum RoofToolState {
    IDLE        = 'IDLE',
    MODE_SELECT = 'MODE_SELECT',
    DRAWING     = 'DRAWING',
    CONFIRMING  = 'CONFIRMING',
    COMMITTING  = 'COMMITTING',
}

export interface RoofToolCallbacks {
    applyHighlight:  (obj: THREE.Object3D) => void;
    updateInspector: (obj: THREE.Object3D) => void;
}

export interface RoofToolDeps {
    commandManager:    CommandManager;
    projectContext:    ProjectContext;
    selectionManager?: { setEnabled(on: boolean): void };
    wallStore?:        any;
    bimManager?:       { getLevelById(id: string): { elevation: number } | undefined };
}

export class RoofTool {
    private _state: RoofToolState = RoofToolState.IDLE;
    private activeTool: 'NONE' | 'RECTANGLE' | 'POLYLINE' | 'REGION' = 'NONE';
    private _pendingRoofType: string | null = null;
    private currentPointerListeners: (() => void) | null = null;

    private polylineData = {
        points: [] as THREE.Vector3[],
        markers: [] as THREE.Mesh[],
    };

    private previewMesh: THREE.Line | null = null;
    private previewFill: THREE.Mesh | null = null;
    private snapIndicator: THREE.Mesh | null = null;
    private wallStore: any = null;

    private _pendingPolygon: [number, number][] | null = null;
    private _selectedRoofType: string = 'gable';
    private _selectedSlope: number    = 0.3;
    private _selectedOverhang: number = 0.3;
    private _selectedThickness: number = 0.2;
    private _selectedAutoBaseOffset: boolean = true;

    private readonly _commandManager:   CommandManager;
    private readonly _projectContext:   ProjectContext;
    private readonly _selectionManager?: { setEnabled(on: boolean): void };
    private readonly _bimManager?: { getLevelById(id: string): { elevation: number } | undefined };
    private readonly _regionDetector: WallRegionDetector;
    private readonly _snapEngine:     RoofSnapEngine;

    constructor(
        private world: OBC.World,
        private components: OBC.Components,
        _callbacks: RoofToolCallbacks,
        deps: RoofToolDeps,
    ) {
        this._commandManager   = deps.commandManager;
        this._projectContext   = deps.projectContext;
        this._selectionManager = deps.selectionManager;
        this._bimManager       = deps.bimManager;
        if (deps.wallStore) this.wallStore = deps.wallStore;
        this._regionDetector = new WallRegionDetector();
        this._snapEngine     = new RoofSnapEngine(0.25, 0.3);
    }

    get state(): RoofToolState { return this._state; }

    public setWallStore(store: any): void {
        this.wallStore = store;
    }

    public activate(): void {
        this._selectionManager?.setEnabled(false);
        this._state = RoofToolState.MODE_SELECT;
    }

    public deactivate(): void {
        this._pendingPolygon = null;
        this.cleanup();
        this._selectionManager?.setEnabled(true);
        this._state = RoofToolState.IDLE;
    }

    public enterRectangleMode(): void {
        this._selectionManager?.setEnabled(false);
        this.cleanup();
        this.activeTool = 'RECTANGLE';
        this._state = RoofToolState.DRAWING;
        this._setupToolUI('2-Point Roof', 'Step 1: Click to set first corner');
    }

    public enterPolylineMode(): void {
        this._selectionManager?.setEnabled(false);
        this.cleanup();
        this.activeTool = 'POLYLINE';
        this._state = RoofToolState.DRAWING;
        this._setupToolUI('Polyline Roof', 'Click to add vertices · Enter to finish · Escape to cancel');
    }

    public enterRegionMode(): void {
        this._selectionManager?.setEnabled(false);
        this.cleanup();
        this.activeTool = 'REGION';
        this._pendingRoofType = 'by_region';
        this._state = RoofToolState.DRAWING;
        this._setupToolUI('Region Roof', 'Click inside a closed wall area');
    }

    public enterSingleSlopeMode(): void {
        this._selectionManager?.setEnabled(false);
        this.cleanup();
        this.activeTool = 'REGION';
        this._pendingRoofType = 'shed';
        this._state = RoofToolState.DRAWING;
        this._setupToolUI('Single Slope Roof', 'Click inside a closed wall area');
    }

    public enterHipRoofMode(): void {
        this._selectionManager?.setEnabled(false);
        this.cleanup();
        this.activeTool = 'REGION';
        this._pendingRoofType = 'hip';
        this._state = RoofToolState.DRAWING;
        this._setupToolUI('Hip Roof (Auto)', 'Click inside a closed wall area');
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Event wiring
    // ──────────────────────────────────────────────────────────────────────────

    private _setupEventListeners(): void {
        const dom    = this.world.renderer!.three.domElement;
        const onDown = (e: PointerEvent)  => this._handlePointerDown(e);
        const onMove = (e: PointerEvent)  => this._handlePointerMove(e);
        const onKey  = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (this._state === RoofToolState.CONFIRMING) {
                    this._cancelConfirming();
                } else {
                    this.deactivate();
                }
                return;
            }
            // Phase 12: Enter key finishes poly-roof placement
            if (e.key === 'Enter') {
                if (this._state === RoofToolState.CONFIRMING) {
                    // Apply the current parameters from the confirming panel
                    (document.getElementById('rfmp-btn-apply') as HTMLButtonElement | null)?.click();
                } else if (this.activeTool === 'POLYLINE' && this.polylineData.points.length >= 3) {
                    // Enough points placed — move to confirming state
                    this._initConfirmPolyline();
                }
            }
        };

        dom.addEventListener('pointerdown', onDown);
        dom.addEventListener('pointermove', onMove);
        window.addEventListener('keydown', onKey);

        this.currentPointerListeners = () => {
            dom.removeEventListener('pointerdown', onDown);
            dom.removeEventListener('pointermove', onMove);
            window.removeEventListener('keydown', onKey);
        };
    }

    private _handlePointerDown = async (e: PointerEvent) => {
        if (this._state === RoofToolState.CONFIRMING) return;
        if (this.activeTool === 'NONE') return;
        const rawPoint = this._getRawPlanPoint(e);
        if (!rawPoint) return;

        const { point } = this._snapEngine.snap(rawPoint, this.wallStore ?? undefined);

        if (this.activeTool === 'RECTANGLE') {
            await this._handleRectanglePoint(point);
        } else if (this.activeTool === 'POLYLINE') {
            this._handlePolylinePoint(point);
        } else if (this.activeTool === 'REGION') {
            this._handleRegionClick(point);
        }
    };

    private _handlePointerMove = (e: PointerEvent) => {
        if (this._state === RoofToolState.CONFIRMING) return;
        if (this.activeTool === 'NONE') return;
        const rawPoint = this._getRawPlanPoint(e);
        if (!rawPoint) return;

        const { point, type: snapType } = this._snapEngine.snap(rawPoint, this.wallStore ?? undefined);
        this._updateSnapIndicator(point, snapType);

        if (this.activeTool === 'RECTANGLE' && this.polylineData.points.length > 0) {
            this._updateRectanglePreview(point);
        } else if (this.activeTool === 'POLYLINE' && this.polylineData.points.length > 0) {
            this._updatePolylinePreview(point);
        }
    };

    private async _handleRectanglePoint(point: THREE.Vector3): Promise<void> {
        if (this.polylineData.points.length === 0) {
            this.polylineData.points.push(point.clone());
            this._addMarker(point);
            this._updateHUD('Step 2: Click opposite corner');
        } else {
            const p1      = this.polylineData.points[0];
            const p2      = point;
            const polygon: [number, number][] = [
                [p1.x, p1.z],
                [p1.x, p2.z],
                [p2.x, p2.z],
                [p2.x, p1.z],
            ];
            this._pendingPolygon = polygon;
            this._state = RoofToolState.CONFIRMING;
            this._showConfirmingPanel();
        }
    }

    private _handlePolylinePoint(point: THREE.Vector3): void {
        if (this.polylineData.points.length >= 3) {
            const first = this.polylineData.points[0];
            if (point.distanceTo(first) < 0.5) {
                this._initConfirmPolyline();
                return;
            }
        }

        this.polylineData.points.push(point.clone());
        this._addMarker(point);
        this._updatePolylinePreview();
        const count = this.polylineData.points.length;
        if (count >= 3) {
            this._updateHUD(`${count} points · Enter to finish · click start to close · Escape to cancel`);
            this._showSimpleActionPanel();
        } else {
            this._updateHUD(`${count} point${count > 1 ? 's' : ''} placed · add more to enable finish`);
        }
    }

    private _handleRegionClick(point: THREE.Vector3): void {
        if (!this.wallStore) {
            console.error('[RoofTool] WallStore not available — inject via setWallStore()');
            return;
        }

        // P3.1 — delegate to injectable WallRegionDetector
        const region = this._regionDetector.detect(point, this.wallStore);
        if (region && region.length >= 3) {
            // Show the confirming panel (type/slope/overhang/thickness) so the
            // user can review parameters before committing — same UX as 2-point
            // and polyline modes.  (ROOF-SYSTEM-AUDIT-2026 Bug 3 fix)
            this._pendingPolygon = region;
            this._state = RoofToolState.CONFIRMING;
            this._showConfirmingPanel();
        } else {
            console.warn('[RoofTool] No closed region found at', point);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Polygon normalisation and roof creation
    // ──────────────────────────────────────────────────────────────────────────

    private _normalisePolygon(raw: [number, number][]): { polygon: [number, number][]; centroid: [number, number] } {
        const deduped: [number, number][] = [];
        for (const pt of raw) {
            const last = deduped[deduped.length - 1];
            if (!last || Math.hypot(pt[0] - last[0], pt[1] - last[1]) > 1e-5) {
                deduped.push([pt[0], pt[1]]);
            }
        }

        let area = 0;
        for (let i = 0; i < deduped.length; i++) {
            const j = (i + 1) % deduped.length;
            area += deduped[i][0] * deduped[j][1];
            area -= deduped[j][0] * deduped[i][1];
        }
        area /= 2;
        if (area < 0) deduped.reverse();

        let cx = 0, cz = 0;
        for (const [x, z] of deduped) { cx += x; cz += z; }
        cx /= deduped.length;
        cz /= deduped.length;

        const local: [number, number][] = deduped.map(([x, z]) => [x - cx, z - cz]);
        return { polygon: local, centroid: [cx, cz] };
    }

    private async _createRoofFromPolygon(
        rawPolygon:      [number, number][],
        roofType:        RoofType | string = 'by_region',
        slope?:          number,
        overhang?:       number,
        thickness?:      number,
        autoBaseOffset?: boolean,
    ): Promise<void> {
        const levelId = this._projectContext.activeLevelId;
        if (!levelId) { console.error('[RoofTool] No active level'); return; }

        const { polygon, centroid } = this._normalisePolygon(rawPolygon);
        if (polygon.length < 3) { console.error('[RoofTool] Degenerate polygon after normalisation'); return; }

        const footprint: RoofFootprint = { polygon, centroid };
        const roofId = crypto.randomUUID();
        this._state = RoofToolState.COMMITTING;

        const effectiveSlope    = slope    ?? (roofType !== 'flat' ? 0.3 : undefined);
        const effectiveOverhang = overhang  ?? 0.3;
        const effectiveThickness = thickness ?? 0.2;

        const command = new CreateRoofCommand(roofId, {
            levelId,
            footprint,
            roofType:        roofType as RoofType,
            baseOffset:      autoBaseOffset ? 3.0 : 3.0,
            autoBaseOffset:  autoBaseOffset ?? false,
            thickness:       effectiveThickness,
            overhang:        effectiveOverhang,
            slope:           effectiveSlope,
            materialColor:   '#c8a46e',
        });

        // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('element.update', {}).catch(() => {}); }
        const result = this._commandManager.execute(command);
        if (result.success) {
            console.log(`[RoofTool] Created roof ${result.affectedElementIds[0]} (type=${roofType}, autoBaseOffset=${autoBaseOffset})`);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // CONFIRMING state
    // ──────────────────────────────────────────────────────────────────────────

    private _initConfirmPolyline(): void {
        if (this.polylineData.points.length < 3) return;
        this._pendingPolygon = this.polylineData.points.map(p => [p.x, p.z] as [number, number]);
        this._state = RoofToolState.CONFIRMING;
        this._showConfirmingPanel();
    }

    private _showConfirmingPanel(): void {
        const hud = document.getElementById('rfmp-hud');
        if (!hud) return;

        const existingStep = document.getElementById('rfmp-hud-step');
        if (existingStep) existingStep.textContent = 'Select roof parameters:';

        const existingSimple = document.getElementById('rfmp-simple-actions');
        if (existingSimple) existingSimple.style.display = 'none';

        const existing = document.getElementById('rfmp-confirm-panel');
        if (existing) existing.remove();

        const panel = document.createElement('div');
        panel.id = 'rfmp-confirm-panel';
        panel.className = 'rfmp-confirm-panel';
        panel.style.flexDirection = 'column';
        panel.style.display       = 'flex';

        panel.innerHTML = `
            <label class="rfmp-input-label rfmp-field-label">Roof Type</label>
            <select class="rfmp-input" id="rfmp-type-select">
                <option value="flat">Flat</option>
                <option value="shed">Shed (Single Slope)</option>
                <option value="gable" selected>Gable</option>
                <option value="hip">Hip</option>
                <option value="dutch">Dutch Hip</option>
                <option value="gambrel">Gambrel</option>
                <option value="mansard">Mansard</option>
                <option value="barrel">Barrel</option>
            </select>
            <div id="rfmp-slope-row">
                <label class="rfmp-input-label rfmp-field-label">Slope (rise/run)</label>
                <input class="rfmp-input" id="rfmp-slope" type="number" min="0.01" max="2.0" step="0.05" value="0.30" />
            </div>
            <label class="rfmp-input-label rfmp-field-label">Overhang (m)</label>
            <input class="rfmp-input" id="rfmp-overhang" type="number" min="0" max="2" step="0.05" value="0.30" />
            <label class="rfmp-input-label rfmp-field-label">Thickness (m)</label>
            <input class="rfmp-input" id="rfmp-thickness" type="number" min="0.05" max="1" step="0.05" value="0.20" />
            <div class="rfmp-checkbox-row">
                <input type="checkbox" id="rfmp-auto-height" checked class="rfmp-checkbox" />
                <label class="rfmp-input-label rfmp-checkbox-label" for="rfmp-auto-height">
                    Auto Height (from walls)
                </label>
            </div>
            <div class="rfmp-confirm-actions rfmp-confirm-actions--spaced">
                <button class="rfmp-mode-btn rfmp-mode-btn--active rfmp-confirm-btn" id="rfmp-btn-apply">Apply</button>
                <button class="rfmp-mode-btn rfmp-confirm-btn" id="rfmp-btn-back">Back</button>
                <button class="rfmp-mode-btn rfmp-confirm-btn" id="rfmp-btn-cancel">Cancel</button>
            </div>
        `;
        hud.appendChild(panel);

        const typeSelect = document.getElementById('rfmp-type-select') as HTMLSelectElement;
        const slopeRow   = document.getElementById('rfmp-slope-row') as HTMLElement;

        // Pre-select the roof type based on the mode that was activated
        // (e.g. single-slope mode pre-selects 'shed', hip mode pre-selects 'hip').
        if (typeSelect && this._pendingRoofType) {
            const validPanelTypes = ['flat','shed','gable','hip','dutch','gambrel','mansard','barrel'];
            if (validPanelTypes.includes(this._pendingRoofType)) {
                typeSelect.value = this._pendingRoofType;
            }
        }
        if (slopeRow) slopeRow.style.display = typeSelect?.value === 'flat' ? 'none' : '';

        typeSelect?.addEventListener('change', () => {
            if (slopeRow) slopeRow.style.display = typeSelect.value === 'flat' ? 'none' : '';
        });

        document.getElementById('rfmp-btn-apply')?.addEventListener('click', () => {
            this._selectedRoofType        = (document.getElementById('rfmp-type-select')  as HTMLSelectElement)?.value ?? 'gable';
            this._selectedSlope           = parseFloat((document.getElementById('rfmp-slope')    as HTMLInputElement)?.value ?? '0.3');
            this._selectedOverhang        = parseFloat((document.getElementById('rfmp-overhang') as HTMLInputElement)?.value ?? '0.3');
            this._selectedThickness       = parseFloat((document.getElementById('rfmp-thickness') as HTMLInputElement)?.value ?? '0.2');
            this._selectedAutoBaseOffset  = (document.getElementById('rfmp-auto-height') as HTMLInputElement)?.checked ?? true;
            this._commitFromConfirming();
        });

        document.getElementById('rfmp-btn-back')?.addEventListener('click', ()   => this._cancelConfirming());
        document.getElementById('rfmp-btn-cancel')?.addEventListener('click', () => this.deactivate());
    }

    private _cancelConfirming(): void {
        this._pendingPolygon = null;
        this._state = RoofToolState.DRAWING;
        const panel = document.getElementById('rfmp-confirm-panel');
        if (panel) panel.remove();
        const step = document.getElementById('rfmp-hud-step');
        if (step) {
            if (this.activeTool === 'RECTANGLE') {
                step.textContent = 'Step 1: Click to set first corner';
            } else if (this.activeTool === 'REGION') {
                step.textContent = 'Click inside a closed wall area';
            } else {
                step.textContent = 'Click points (click start to close)';
            }
        }
        this.polylineData.points = [];
        this.polylineData.markers.forEach(m => {
            this.world.scene.three.remove(m);
            m.geometry.dispose();
        });
        this.polylineData.markers = [];
        if (this.previewMesh) {
            disposePreviewObject(this.previewMesh);
            this.previewMesh = null;
        }
        if (this.previewFill) {
            disposePreviewObject(this.previewFill);
            this.previewFill = null;
        }
        const simple = document.getElementById('rfmp-simple-actions');
        if (simple) { simple.style.display = 'none'; }
    }

    private async _commitFromConfirming(): Promise<void> {
        if (!this._pendingPolygon) return;
        const polygon = this._pendingPolygon;
        this._pendingPolygon = null;

        const roofType = this._selectedRoofType;
        const slope    = roofType !== 'flat' ? this._selectedSlope : undefined;

        await this._createRoofFromPolygon(
            polygon,
            roofType,
            slope,
            this._selectedOverhang,
            this._selectedThickness,
            this._selectedAutoBaseOffset,
        );
        this.deactivate();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Preview rendering
    // ──────────────────────────────────────────────────────────────────────────

    private _updateRectanglePreview(p2: THREE.Vector3): void {
        const p1 = this.polylineData.points[0];
        const y  = this._getPreviewY();
        const pts = [
            new THREE.Vector3(p1.x, y, p1.z),
            new THREE.Vector3(p1.x, y, p2.z),
            new THREE.Vector3(p2.x, y, p2.z),
            new THREE.Vector3(p2.x, y, p1.z),
            new THREE.Vector3(p1.x, y, p1.z),
        ];
        this._drawPreviewLine(pts);
    }

    private _updatePolylinePreview(hoverPoint?: THREE.Vector3): void {
        const y    = this._getPreviewY();
        const pts  = this.polylineData.points.map(p => new THREE.Vector3(p.x, y, p.z));
        if (hoverPoint) pts.push(new THREE.Vector3(hoverPoint.x, y, hoverPoint.z));
        if (pts.length >= 2) this._drawPreviewLine(pts);
    }

    private _getPreviewY(): number {
        const levelId = this._projectContext.activeLevelId;
        if (levelId && this._bimManager) {
            const level = this._bimManager.getLevelById(levelId);
            if (level) return level.elevation + 3.0 + 0.05;
        }
        return 3.05;
    }

    private _drawPreviewLine(points: THREE.Vector3[]): void {
        // ── Contract §41 (Element Preview Visual Contract) ──────────────────
        // Use the standard PRIMARY blue, depthTest:false and a high renderOrder
        // so the line is visible against the floor / grid. Mirrors the Slab
        // tool's polygon preview pattern (footprint line + translucent fill).
        if (this.previewMesh) {
            disposePreviewObject(this.previewMesh);
            this.previewMesh = null;
        }
        const geo = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({
            color:     PREVIEW_COLOR.PRIMARY,
            linewidth: 2,
            depthTest: false,
        });
        const line = new THREE.Line(geo, mat);
        line.renderOrder = 999;
        this.previewMesh = tagPreview(line);
        this.world.scene.three.add(this.previewMesh);

        // ── Translucent fill polygon (visible from 3+ points) ───────────────
        if (this.previewFill) {
            disposePreviewObject(this.previewFill);
            this.previewFill = null;
        }
        if (points.length >= 3) {
            const elevation = this._getPreviewY();
            const shape = new THREE.Shape();
            shape.moveTo(points[0]!.x, -points[0]!.z);
            for (let i = 1; i < points.length; i++) {
                shape.lineTo(points[i]!.x, -points[i]!.z);
            }
            shape.closePath();
            const fillGeo = new THREE.ShapeGeometry(shape);
            const fillMat = new THREE.MeshBasicMaterial({
                color:       PREVIEW_COLOR.PRIMARY,
                transparent: true,
                opacity:     0.15,
                side:        THREE.DoubleSide,
                depthTest:   false,
                depthWrite:  false,
            });
            const fill = new THREE.Mesh(fillGeo, fillMat);
            fill.position.set(0, elevation + 0.005, 0);
            fill.rotation.set(-Math.PI / 2, 0, 0);
            fill.renderOrder = 0;
            this.previewFill = tagPreview(fill);
            this.world.scene.three.add(this.previewFill);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // P3.2 — Snap indicator
    // ──────────────────────────────────────────────────────────────────────────

    private _updateSnapIndicator(point: THREE.Vector3, snapType: string): void {
        if (!this.snapIndicator) {
            const geo = new THREE.SphereGeometry(0.08, 8, 8);
            const mat = new THREE.MeshBasicMaterial({ color: 0x4488ff });
            this.snapIndicator = new THREE.Mesh(geo, mat);
            this.world.scene.three.add(this.snapIndicator);
        }
        this.snapIndicator.position.set(point.x, this._getPreviewY(), point.z);
        const mat = this.snapIndicator.material as THREE.MeshBasicMaterial;
        if (snapType === 'vertex')   mat.color.set(0x44ff88);
        else if (snapType === 'midpoint') mat.color.set(0xffaa44);
        else mat.color.set(0x4488ff);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Raycast helpers
    // ──────────────────────────────────────────────────────────────────────────

    private _getRawPlanPoint(e: PointerEvent): THREE.Vector3 | null {
        const dom  = this.world.renderer!.three.domElement;
        const rect = dom.getBoundingClientRect();
        const x = ((e.clientX - rect.left)  / rect.width)  * 2 - 1;
        const y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

        const raycasterObj = this.components.get(OBC.Raycasters).get(this.world);
        const raycaster    = (raycasterObj as any).three;
        raycaster.setFromCamera(new THREE.Vector2(x, y), this.world.camera.three);

        const planeY = this._getPlaneElevation();
        const target = new THREE.Vector3();
        const hit = raycaster.ray.intersectPlane(
            new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY),
            target,
        );
        return hit ? target : null;
    }

    private _getPlaneElevation(): number {
        const levelId = this._projectContext.activeLevelId;
        if (levelId && this._bimManager) {
            const level = this._bimManager.getLevelById(levelId);
            if (level) return level.elevation + 3.0;
        }
        return 3.0;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // HUD helpers
    // ──────────────────────────────────────────────────────────────────────────

    private _setupToolUI(title: string, step: string): void {
        if (this.world.camera?.controls) this.world.camera.controls.enabled = false;
        this._setupEventListeners();

        const existing = document.getElementById('rfmp-hud');
        if (existing) existing.remove();

        const hud = document.createElement('div');
        hud.id = 'rfmp-hud';
        hud.className = 'rfmp-container';
        hud.innerHTML = `
            <div class="rfmp-title">${title}</div>
            <div id="rfmp-hud-step" class="rfmp-input-label">${step}</div>
            <div id="rfmp-simple-actions" class="rfmp-confirm-panel" style="display:none;">
                <button class="rfmp-mode-btn rfmp-mode-btn--active" id="rfmp-btn-finish">Finish</button>
                <button class="rfmp-mode-btn" id="rfmp-btn-cancel-hud">Cancel</button>
            </div>
        `;
        document.body.appendChild(hud);

        document.getElementById('rfmp-btn-finish')?.addEventListener('click', () => this._initConfirmPolyline());
        document.getElementById('rfmp-btn-cancel-hud')?.addEventListener('click', () => this.deactivate());
    }

    private _updateHUD(step: string): void {
        const el = document.getElementById('rfmp-hud-step');
        if (el) el.textContent = step;
    }

    private _showSimpleActionPanel(): void {
        const el = document.getElementById('rfmp-simple-actions');
        if (el) el.style.display = 'flex';
    }

    private _addMarker(p: THREE.Vector3): void {
        const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.1),
            new THREE.MeshBasicMaterial({ color: 0xc8a46e }),
        );
        mesh.position.set(p.x, this._getPreviewY(), p.z);
        this.world.scene.three.add(mesh);
        this.polylineData.markers.push(mesh);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // Cleanup
    // ──────────────────────────────────────────────────────────────────────────

    private cleanup(): void {
        if (this.currentPointerListeners) {
            this.currentPointerListeners();
            this.currentPointerListeners = null;
        }

        this.polylineData.markers.forEach(m => {
            this.world.scene.three.remove(m);
            m.geometry.dispose();
        });
        this.polylineData.markers = [];
        this.polylineData.points  = [];

        if (this.previewMesh) {
            disposePreviewObject(this.previewMesh);
            this.previewMesh = null;
        }
        if (this.previewFill) {
            disposePreviewObject(this.previewFill);
            this.previewFill = null;
        }

        if (this.snapIndicator) {
            this.world.scene.three.remove(this.snapIndicator);
            this.snapIndicator.geometry.dispose();
            this.snapIndicator = null;
        }

        const hud = document.getElementById('rfmp-hud');
        if (hud) hud.remove();

        if (this.world.camera?.controls) this.world.camera.controls.enabled = true;
        this.activeTool = 'NONE';
        this._pendingRoofType = null;
    }
}
