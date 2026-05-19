/**
 * ColumnTool
 *
 * Interactive placement tool for structural columns.
 * Supports concrete (rectangular/circular) and steel UC/UB parametric profiles.
 *
 * Steel profiles are drawn from SteelProfileLibrary at placement time.
 * The preview mesh is regenerated when the profile selection changes.
 *
 * Contract compliance:
 *   §B.1  — ToolManager integration, ESC key cancel
 *   §D.1  — position is plain Point3D DTO (not THREE.Vector3)
 *   §3.5  — store.add() only; no builder calls from store
 */

import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ColumnStore } from './ColumnStore.js';
import { SteelProfileLibrary } from '@pryzm/plugin-structural';
import { generateColumnISection } from '@pryzm/plugin-structural';
import { CreateColumnCommand } from '@pryzm/command-registry';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { resolveSlabBaseOffsetForPoint } from './SlabColumnCoupling.js';
import { SpatialAuthorityError } from '@pryzm/core-app-model';
import { PREVIEW_COLOR, createGhostBodyMaterial, tagPreview, disposePreviewObject } from '@pryzm/core-app-model';

type ProfileMode = 'rectangular' | 'circular' | 'UC' | 'UB';

/**
 * §COLUMN-AUDIT-2026 §W6 — ColumnToolDeps replaces the five `window.*`
 * reads scattered across this class (toolManager, pryzmCanvas, bimManager,
 * slabStore, commandManager). Each entry is a getter so the bootstrap can
 * register a tool BEFORE the dependency is available; the getter resolves
 * lazily at call time.
 *
 * All getters fall back to their respective window globals when not provided
 * — this preserves backward compatibility for callers that have not migrated
 * to the new constructor signature.
 */
export interface ColumnToolDeps {
    getCommandManager?: () => any;
    getColumnStore?:    () => ColumnStore | undefined;
    getBimManager?:     () => any;
    getSlabStore?:      () => any;
    getToolManager?:    () => any;
    getCanvas?:         () => any;
}

export class ColumnTool {
    private world: OBC.World;
    private store: ColumnStore;
    private commandManager: any;
    /** §W6: lazy dependency resolvers — replace direct window.* reads. */
    private _deps: ColumnToolDeps;
    private _isActive = false;
    private callbacks: any;
    private previewMesh: THREE.Object3D | null = null;
    private _disposed = false;
    private _escListener: ((e: KeyboardEvent) => void) | null = null;

    // ── Profile state ──────────────────────────────────────────────────────────
    private _profileMode: ProfileMode = 'UC';
    private _columnWidth  = 0.4;
    private _columnDepth  = 0.4;
    private _steelProfileName = SteelProfileLibrary.defaultUC().name;
    private _rotation = 0;

    constructor(
        world: OBC.World,
        callbacks: any,
        columnStore?: ColumnStore,
        commandManager?: any,
        deps: ColumnToolDeps = {},
    ) {
        this.world = world;
        this.callbacks = callbacks;
        this.store = columnStore
            ?? deps.getColumnStore?.()
            ?? window.columnStore; // TODO(TASK-08)
        this.commandManager = commandManager
            ?? deps.getCommandManager?.()
            ?? callbacks.commandManager
            ?? window.commandManager; // TODO(TASK-06)
        this._deps = deps;

        // §W5: store publication moved to engine/subsystems/initBuilders.ts —
        //      the bootstrap is the sole owner of the window.columnStore
        //      global. The redundant assignment that used to live here was both
        //      a contract violation (tool side-effect on a global) and a
        //      multi-instance hazard (M16 — second tool overwrote the first).
    }

    /** §W6: late-bind for dependencies that resolve after construction. */
    public setDeps(deps: Partial<ColumnToolDeps>): void {
        this._deps = { ...this._deps, ...deps };
    }

    /** Resolve a dependency: deps getter → window global → undefined. */
    private _resolve<T>(getter: keyof ColumnToolDeps, globalName: string): T | undefined {
        const fn = this._deps[getter] as (() => T | undefined) | undefined;
        const v = fn?.();
        if (v !== undefined && v !== null) return v;
        return (window as unknown as Record<string, unknown>)[globalName] as T | undefined;
    }

    get isActive(): boolean {
        return this._isActive;
    }

    setColumnType(config: {
        profile: ProfileMode;
        width?: number;
        depth?: number;
        steelProfileName?: string;
        rotation?: number;
    }): void {
        this._profileMode = config.profile;
        if (config.width  != null) this._columnWidth  = config.width;
        if (config.depth  != null) this._columnDepth  = config.depth;
        if (config.steelProfileName) this._steelProfileName = config.steelProfileName;
        if (config.rotation != null) this._rotation = config.rotation;
        this.clearPreview();
    }

    activate() {
        if (this._isActive) return;
        this._isActive = true;
        if (this.world.camera?.controls) this.world.camera.controls.enabled = false;
        this.attachListeners();
        this.showUI();
        this._escListener = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.deactivate();
                return;
            }
            const target = e.target as HTMLElement | null;
            if (target?.closest?.('#column-tool-ui input, #column-tool-ui select')) return;
            if (e.key.toLowerCase() === 'r') {
                e.preventDefault();
                this.rotatePreview(Math.PI / 2);
            }
        };
        document.addEventListener('keydown', this._escListener);
    }

    deactivate() {
        if (!this._isActive) return;
        this._isActive = false;
        if (this._escListener) {
            document.removeEventListener('keydown', this._escListener);
            this._escListener = null;
        }
        if (this.world.camera?.controls) this.world.camera.controls.enabled = true;
        this.detachListeners();
        this.clearPreview();
        this.hideUI();

        const tm = this._resolve<any>('getToolManager', 'toolManager');
        if (tm) tm.currentTool = null;

        const canvas = this.world.renderer!.three.domElement;
        canvas.style.pointerEvents = 'auto';

        setTimeout(() => { window.dispatchEvent(new Event('resize')); }, 100);
    }

    cleanup(): void { this.deactivate(); this.clearPreview(); }
    dispose(): void { if (this._disposed) return; this._disposed = true; this.cleanup(); }

    // ── Pointer events ─────────────────────────────────────────────────────────

    private attachListeners() {
        const canvas = this.world.renderer!.three.domElement;
        canvas.addEventListener('pointerdown', this.onPointerDown, true);
        canvas.addEventListener('pointermove', this.onPointerMove, true);
    }

    private detachListeners() {
        const canvas = this.world.renderer!.three.domElement;
        canvas.removeEventListener('pointerdown', this.onPointerDown, true);
        canvas.removeEventListener('pointermove', this.onPointerMove, true);
    }

    private onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('#column-tool-ui')) return;

        const point = this.getPoint(e);
        if (!point) return;

        const levelId = this.store.activeLevelId;
        if (!levelId) {
            // §M2: surface the spatial-authority class type instead of raw Error
            //      so the global ErrorBoundary classifies + handles uniformly.
            throw new SpatialAuthorityError(
                'No active level selected for column creation.',
            );
        }

        const isSteelSection = this._profileMode === 'UC' || this._profileMode === 'UB';
        const steelProfile = isSteelSection ? SteelProfileLibrary.get(this._steelProfileName) : undefined;

        // Derive width/depth from steel profile for storage (metres)
        let width = this._columnWidth;
        let depth = this._columnDepth;
        if (isSteelSection && steelProfile) {
            width = steelProfile.B / 1000;
            depth = steelProfile.D / 1000;
        }

        const id = crypto.randomUUID();
        const payload = {
            id,
            position:         { x: point.x, y: point.y, z: point.z },
            height:           3,
            rotation:         this._rotation,
            profile:          this._profileMode,
            width,
            depth,
            levelId,
            baseOffset:       0,
            ...(isSteelSection && this._steelProfileName
                ? { steelProfileName: this._steelProfileName }
                : {}),
        };

        const cm = this.commandManager ?? this._resolve<any>('getCommandManager', 'commandManager');
        if (!cm) {
            console.error('[ColumnTool] commandManager not available');
            return;
        }

        const result = cm.execute(new CreateColumnCommand(payload));
        if (!result.success) {
            console.error('[ColumnTool] CreateColumnCommand failed:', result.info?.join(', ') ?? result.error ?? 'unknown error');
            return;
        }

        const mesh = elementRegistry.getRoot(id);
        if (mesh) {
            this.callbacks.applyHighlight?.(mesh);
            this.callbacks.updateInspector?.(mesh);
        }

        const renderer = this.world.renderer as any;
        if (
            renderer &&
            renderer.mode === OBC.RendererMode.MANUAL &&
            'needsUpdate' in renderer &&
            !this._resolve<any>('getCanvas', 'pryzmCanvas')
        ) {
            renderer.needsUpdate = true;
        }
    };

    private onPointerMove = (e: PointerEvent) => {
        e.stopPropagation();
        const point = this.getPoint(e);
        if (!point) return;
        this.updatePreview(point);
    };

    private getPoint(e: PointerEvent): THREE.Vector3 | null {
        const canvas = this.world.renderer!.three.domElement;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);
        // §SLAB-BASE: cast against the level datum first, then lift the hit's Y
        // to the slab top under the cursor (if a slab covers that XZ). This way
        // the preview anchors to the visible floor — exactly matching the world
        // Y that CreateColumnCommand will resolve at click time.
        const baseElev = this.getActiveLevelElevation();
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -baseElev);
        const intersect = new THREE.Vector3();
        if (!raycaster.ray.intersectPlane(plane, intersect)) return null;
        intersect.y = baseElev + this.getSlabOffsetAt(intersect.x, intersect.z);
        return intersect;
    }

    private getActiveLevelElevation(): number {
        const levelId = this.store.activeLevelId;
        const bimManager = this._resolve<any>('getBimManager', 'bimManager');
        return levelId && bimManager?.getLevelById ? (bimManager.getLevelById(levelId)?.elevation ?? 0) : 0;
    }

    /**
     * §SLAB-BASE — Resolve the slab top-face offset (metres above level datum)
     * at world (x, z) on the active level. Returns 0 when no slab covers the
     * point, preserving legacy "sit on level datum" behaviour.
     */
    private getSlabOffsetAt(x: number, z: number): number {
        const levelId = this.store.activeLevelId;
        const slabStore = this._resolve<any>('getSlabStore', 'slabStore');
        if (!levelId || !slabStore) return 0;
        return resolveSlabBaseOffsetForPoint(levelId, x, z, slabStore);
    }

    // ── Preview ────────────────────────────────────────────────────────────────

    private updatePreview(point: THREE.Vector3) {
        if (!this.previewMesh) {
            this.previewMesh = this._buildPreviewMesh();
            this.world.scene.three.add(this.previewMesh);
        }
        this.previewMesh.position.set(point.x, point.y, point.z);
        this.previewMesh.rotation.y = this._rotation;
    }

    private _buildPreviewMesh(): THREE.Object3D {
        // §41 — PreviewStyle is the SINGLE SOURCE OF TRUTH for preview visuals.
        // Columns are point-placed volumes → PREVIEW_COLOR.VOLUME (purple).
        // Use the standard ghost body material (depthWrite off, double-sided,
        // opacity 0.4) so the preview obeys the white-background alpha contract.
        const mat = createGhostBodyMaterial({ color: PREVIEW_COLOR.VOLUME });
        const HEIGHT = 3;
        const isSteelSection = this._profileMode === 'UC' || this._profileMode === 'UB';

        if (isSteelSection) {
            const profile = SteelProfileLibrary.get(this._steelProfileName);
            if (profile) {
                const geo = generateColumnISection(profile, HEIGHT, 'medium');
                return tagPreview(new THREE.Mesh(geo, mat));
            }
        }

        // Fallback: box or cylinder — both base-aligned at local Y = 0 to match
        // the committed geometry pivot (ColumnFragmentBuilder line 148).
        const w = this._columnWidth;
        const d = this._columnDepth;
        const geo = this._profileMode === 'circular'
            ? new THREE.CylinderGeometry(w / 2, w / 2, HEIGHT, 16)
            : new THREE.BoxGeometry(w, HEIGHT, d);
        geo.translate(0, HEIGHT / 2, 0);

        return tagPreview(new THREE.Mesh(geo, mat));
    }

    private clearPreview() {
        // §41 §1.4 — disposePreviewObject handles geometry + material dispose
        // and parent removal in one call.
        disposePreviewObject(this.previewMesh);
        this.previewMesh = null;
    }

    // ── UI ─────────────────────────────────────────────────────────────────────

    private showUI() {
        let modal = document.getElementById('column-tool-ui');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'column-tool-ui';
            document.body.appendChild(modal);
        }
        modal.className = 'th-overlay th-structural-picker';

        const ucProfiles  = SteelProfileLibrary.UC.map(p => `<option value="${p.name}">${p.name} (${p.mass} kg/m)</option>`).join('');
        const ubProfiles  = SteelProfileLibrary.UB.map(p => `<option value="${p.name}">${p.name} (${p.mass} kg/m)</option>`).join('');

        modal.innerHTML = `
            <span class="th-title">Column Placement</span>

            <div class="th-section">
                <label class="th-label">Section Type</label>
                <div class="th-btn-row">
                    <button class="th-btn ${this._profileMode === 'UC' ? 'th-btn--active' : ''}" id="col-mode-uc">Steel UC</button>
                    <button class="th-btn ${this._profileMode === 'UB' ? 'th-btn--active' : ''}" id="col-mode-ub">Steel UB</button>
                    <button class="th-btn ${this._profileMode === 'rectangular' ? 'th-btn--active' : ''}" id="col-mode-rect">Concrete</button>
                    <button class="th-btn ${this._profileMode === 'circular' ? 'th-btn--active' : ''}" id="col-mode-circ">Round</button>
                </div>
            </div>

            <div id="col-steel-ui" style="display:${(this._profileMode === 'UC' || this._profileMode === 'UB') ? 'block' : 'none'}">
                <label class="th-label">Profile</label>
                <select id="col-steel-profile" class="th-input" style="width:100%;margin-bottom:6px;" size="1">
                    <optgroup label="Universal Columns (UC)">${ucProfiles}</optgroup>
                    <optgroup label="Universal Beams (UB)">${ubProfiles}</optgroup>
                </select>
                <div id="col-profile-info" class="th-info-row" style="font-size:11px;opacity:0.7;"></div>
                <label class="th-label" style="margin-top:8px;">Orientation</label>
                <div class="th-btn-row">
                    <button class="th-btn" id="col-rotate-left">Rotate 90°</button>
                    <button class="th-btn" id="col-flip">Flip 180°</button>
                </div>
                <div id="col-orientation-info" class="th-info-row" style="font-size:11px;opacity:0.7;"></div>
            </div>

            <div id="col-concrete-ui" style="display:${(this._profileMode === 'rectangular' || this._profileMode === 'circular') ? 'block' : 'none'}">
                <label class="th-label">Width (m)</label>
                <input id="col-width" type="number" class="th-input" value="${this._columnWidth}" step="0.05" min="0.1" max="2" />
                <label class="th-label">Depth (m)</label>
                <input id="col-depth" type="number" class="th-input" value="${this._columnDepth}" step="0.05" min="0.1" max="2" />
            </div>

            <div class="th-btn-row" style="margin-top:8px;">
                <button id="column-finish-btn" class="th-btn th-btn--primary" style="width:100%;">Finish (ESC)</button>
            </div>
        `;

        this._updateProfileInfo();
        this._updateOrientationInfo();

        // Mode buttons
        ['uc', 'ub', 'rect', 'circ'].forEach(mode => {
            document.getElementById(`col-mode-${mode}`)?.addEventListener('click', e => {
                e.stopPropagation();
                const modeMap: Record<string, ProfileMode> = {
                    uc: 'UC', ub: 'UB', rect: 'rectangular', circ: 'circular',
                };
                this._profileMode = modeMap[mode];
                if (this._profileMode === 'UC') this._steelProfileName = SteelProfileLibrary.defaultUC().name;
                if (this._profileMode === 'UB') this._steelProfileName = SteelProfileLibrary.defaultUB().name;
                this.clearPreview();

                const isSteel = this._profileMode === 'UC' || this._profileMode === 'UB';
                (document.getElementById('col-steel-ui')   as HTMLElement).style.display = isSteel ? 'block' : 'none';
                (document.getElementById('col-concrete-ui') as HTMLElement).style.display = isSteel ? 'none' : 'block';

                modal!.querySelectorAll('.th-btn[id^="col-mode-"]').forEach(btn => btn.classList.remove('th-btn--active'));
                (e.target as HTMLElement).classList.add('th-btn--active');
                const select = document.getElementById('col-steel-profile') as HTMLSelectElement | null;
                if (select && (this._profileMode === 'UC' || this._profileMode === 'UB')) {
                    select.value = this._steelProfileName;
                }

                this._updateProfileInfo();
            });
        });

        // Steel profile dropdown
        const profileSelect = document.getElementById('col-steel-profile') as HTMLSelectElement;
        if (profileSelect) {
            profileSelect.value = this._steelProfileName;
            profileSelect.addEventListener('change', e => {
                e.stopPropagation();
                this._steelProfileName = (e.target as HTMLSelectElement).value;

                // Determine series from selection
                const p = SteelProfileLibrary.get(this._steelProfileName);
                if (p) this._profileMode = p.series as ProfileMode;

                this.clearPreview();
                this._updateProfileInfo();
            });
        }

        // Concrete size inputs
        document.getElementById('col-width')?.addEventListener('change', e => {
            this._columnWidth = parseFloat((e.target as HTMLInputElement).value) || this._columnWidth;
            this.clearPreview();
        });
        document.getElementById('col-depth')?.addEventListener('change', e => {
            this._columnDepth = parseFloat((e.target as HTMLInputElement).value) || this._columnDepth;
            this.clearPreview();
        });

        document.getElementById('column-finish-btn')?.addEventListener('click', e => {
            e.stopPropagation();
            this.deactivate();
        });

        document.getElementById('col-rotate-left')?.addEventListener('click', e => {
            e.stopPropagation();
            this.rotatePreview(Math.PI / 2);
        });

        document.getElementById('col-flip')?.addEventListener('click', e => {
            e.stopPropagation();
            this.rotatePreview(Math.PI);
        });

        modal.style.display = 'flex';
    }

    private rotatePreview(delta: number): void {
        const tau = Math.PI * 2;
        this._rotation = ((this._rotation + delta) % tau + tau) % tau;
        if (this.previewMesh) this.previewMesh.rotation.y = this._rotation;
        this._updateOrientationInfo();
    }

    private _updateOrientationInfo(): void {
        const infoEl = document.getElementById('col-orientation-info');
        if (!infoEl) return;
        const degrees = Math.round(THREE.MathUtils.radToDeg(this._rotation)) % 360;
        infoEl.textContent = `Current rotation: ${degrees}°  ·  Press R to rotate 90°`;
    }

    private _updateProfileInfo(): void {
        const infoEl = document.getElementById('col-profile-info');
        if (!infoEl) return;

        const p = SteelProfileLibrary.get(this._steelProfileName);
        if (p) {
            infoEl.textContent =
                `D=${p.D}mm  B=${p.B}mm  t=${p.t}mm  T=${p.T}mm  Mass=${p.mass} kg/m`;
        } else {
            infoEl.textContent = '';
        }
    }

    private hideUI() {
        const modal = document.getElementById('column-tool-ui');
        if (modal) modal.style.display = 'none';
        this.callbacks.onCancel?.();
    }
}
