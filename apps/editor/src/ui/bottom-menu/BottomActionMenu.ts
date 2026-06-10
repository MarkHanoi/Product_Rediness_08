import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { WallDrawingMode } from '@pryzm/geometry-wall';
import * as PryzmIcons from '../icons/PryzmIcons';
import { SlabModePicker } from '../SlabModePicker';

export type BAMLevelMode = 'stacked' | 'exploded' | 'solo';
export type BAMWallCutMode = 'cutaway' | 'up' | 'down';

export interface BottomActionMenuProps {
    toolManager: any;
    selectionManager: any;
    navManager: any;
    service: any;
    wallTool: any;
    deleteSelected: () => void;
    zoomToAll?: () => Promise<void> | void;
}

type LevelInfo = { id: string; name?: string; elevation?: number; childrenIds?: string[] };
type StructureToolId = 'wall' | 'curtainWall' | 'door' | 'window' | 'slab' | 'floor' | 'ceiling';

const S = (d: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;

const ICONS = {
    importIfc: S('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>'),
    sectionBox: S('<path d="M2 9V5a2 2 0 0 1 2-2h4"/><path d="M16 3h4a2 2 0 0 1 2 2v4"/><path d="M22 16v4a2 2 0 0 1-2 2h-4"/><path d="M8 21H4a2 2 0 0 1-2-2v-4"/><path d="M7 12h10" stroke-dasharray="3 2"/><path d="M12 7v10" stroke-dasharray="3 2"/>'),
    plus: S('<path d="M12 5v14M5 12h14"/>'),
    floorplan: S('<rect x="3" y="5" width="18" height="15" rx="1"/><line x1="3" y1="11" x2="21" y2="11"/><line x1="10" y1="5" x2="10" y2="20"/>'),
    wallcut: S('<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 12h18" stroke-dasharray="4 2"/><path d="M8 4v16M16 4v16" opacity="0.6"/>'),
    walllow: S('<rect x="3" y="13" width="18" height="7" rx="1"/><path d="M8 13v7M16 13v7"/>'),
    sun: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
    moon: S('<path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z"/>'),
    eye: S('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    roomLabel: S('<path d="M3 7a2 2 0 0 1 2-2h7l7 7-7 7-7-7V7z"/><circle cx="8" cy="10" r="1.4"/>'),
    activeLevel: S('<path d="M4 18h16"/><path d="M7 14h10"/><path d="M10 10h4"/><path d="M12 4v10"/><path d="m8 8 4-4 4 4"/>'),
    reset: S('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 3v6h6"/>'),
    stacked: S('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>'),
    exploded: S('<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 19 12 24 22 19"/><polyline points="2 14 12 19 22 14"/>'),
    solo: S('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'),
    wall: PryzmIcons.wall,
    curtainWall: PryzmIcons.curtainWall,
    door: PryzmIcons.pryzmDoor,
    window: PryzmIcons.pryzmWindow,
    slab: PryzmIcons.pryzmSlab,
    floor: PryzmIcons.pryzmFloor,
    ceiling: PryzmIcons.pryzmCeiling,
};

const STRUCTURE_TOOLS: Array<{ id: StructureToolId; icon: string; label: string; badge: string }> = [
    { id: 'wall',        icon: ICONS.wall,        label: 'Wall',         badge: 'WA' },
    { id: 'curtainWall', icon: ICONS.curtainWall, label: 'Curtain Wall', badge: 'CW' },
    { id: 'door',        icon: ICONS.door,        label: 'Door',         badge: 'DO' },
    { id: 'window',      icon: ICONS.window,      label: 'Window',       badge: 'WN' },
    { id: 'slab',        icon: ICONS.slab,        label: 'Slab',         badge: 'SL' },
    { id: 'floor',       icon: ICONS.floor,       label: 'Floor',        badge: 'FL' },
    { id: 'ceiling',     icon: ICONS.ceiling,     label: 'Ceiling',      badge: 'CE' },
];

const TOOL_STORAGE_KEY = 'pryzm:bam:selected-tool';
const EXPLODE_GAP = 5;

// Phase B.38 (S73-WIRE) — runtime threading per S72 §16.2 row B.38.
export class BottomActionMenu {
    private _el: HTMLElement;
    private _structureRow: HTMLElement;
    private _controlRow: HTMLElement;
    private _toggleRow: HTMLElement;
    private _toggleBtn: HTMLButtonElement;
    private _activeTool: StructureToolId | null = null;
    private _selectedTool: StructureToolId = 'wall';
    private _toolMenuOpen = false;
    private _levelMode: BAMLevelMode = 'stacked';
    private _wallCutMode: BAMWallCutMode = 'up';
    private _is2D = false;
    private _isNight = false;
    private _elementsInViewOnly = false;
    private _activeLevelOnly = false;
    // §ROOM-LABELS-TOGGLE (2026-06-10) — 3D room-name sprite visibility. Default
    // true (current behaviour); the toggle button flips it via RoomLabelRenderer.
    private _roomLabelsVisible = true;
    private _expanded = false;
    private _sectionBoxActive = false;
    private _pendingKey: string | null = null;
    private _pendingTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly _slabModePicker = new SlabModePicker();
    private readonly _originalVisibility = new Map<THREE.Object3D, boolean>();
    private readonly _levelOriginalY = new Map<THREE.Object3D, number>();
    // A.21.D33(b): animation target Y per level root, held in a side Map instead of
    // mutating root.userData — some level roots have a frozen/non-extensible userData
    // (Object.freeze / readonly store record), so assigning a new property threw.
    private readonly _levelTargetY = new Map<THREE.Object3D, number>();
    private readonly _visibleElementIds = new Set<string>();
    private readonly _savedLightIntensities = new Map<THREE.Light, number>();
    private _savedBackground: THREE.Color | THREE.Texture | null | undefined;
    // D.7.5 batch #3: rAF handle replaced by FrameScheduler disposer.
    private _raf: TickListenerDisposer | null = null;

    /** Phase B.38 (S73-WIRE) — runtime threaded by parent (Layout.ts). */
    public readonly runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null;

    constructor(
        private _props: BottomActionMenuProps,
        runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null,
    ) {
        this.runtime = runtime;

        // F.4.1-F.4.5 Wave 14 — runtime.stores.viewState/project + runtime.scene.snap wiring.
        // Phase F stub reads: stubs return defaults (activeLayer=null, zoom=1.0,
        // units='metric', snap.mode='off').  Phase E wires the real stores.
        if (runtime) {
            const viewState = runtime.stores.viewState;
            const project   = runtime.stores.project;
            const snapMode  = runtime.scene.snap.mode;
            console.debug(
                '[BAM] Wave 14 runtime wired —',
                'layer:', viewState.activeLayer,
                'level:', viewState.activeLevel,
                'zoom:', viewState.zoom,
                'units:', project.units,
                'snap:', snapMode,
            );
        }

        const storedTool = window.localStorage?.getItem(TOOL_STORAGE_KEY) as StructureToolId | null;
        if (storedTool && STRUCTURE_TOOLS.some(t => t.id === storedTool)) this._selectedTool = storedTool;

        this._el = document.createElement('div');
        this._el.className = 'bam-container bam-container--collapsed';
        this._structureRow = document.createElement('div');
        this._structureRow.className = 'bam-structure-row';
        this._controlRow = document.createElement('div');
        this._controlRow.className = 'bam-control-row';
        this._toggleRow = document.createElement('div');
        this._toggleRow.className = 'bam-toggle-row';
        this._toggleBtn = document.createElement('button');
        this._toggleBtn.type = 'button';
        this._toggleBtn.className = 'bam-toggle-btn';
        this._toggleBtn.title = 'Show toolbar';
        this._toggleBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`;
        this._toggleBtn.addEventListener('click', () => this._toggleExpanded());
        this._toggleRow.appendChild(this._toggleBtn);
        this._el.appendChild(this._structureRow);
        this._el.appendChild(this._controlRow);
        this._el.appendChild(this._toggleRow);
        this._render();
        this._attachKeyboardShortcuts();

        window.addEventListener('tool:activated', (e: Event) => {
            const mapped = this._mapEngineToolToMenuTool((e as CustomEvent<string>).detail);
            if (mapped) {
                this._activeTool = mapped;
            } else {
                this._activeTool = null;
            }
            this._render();
        });

        window.addEventListener('tool:deactivated', () => {
            this._activeTool = null;
            this._render();
        });

        window.addEventListener('activeLevelChanged', () => {
            if (this._activeLevelOnly || this._levelMode === 'solo') this._applySceneVisibilityFilters();
            this._render();
        });
    }

    get element(): HTMLElement {
        return this._el;
    }

    private _toggleExpanded(): void {
        this._expanded = !this._expanded;
        if (!this._expanded) this._toolMenuOpen = false;
        this._el.classList.toggle('bam-container--collapsed', !this._expanded);
        this._toggleBtn.title = this._expanded ? 'Hide toolbar' : 'Show toolbar';
        this._render();
    }

    private _updateOverlayBottom(): void {
        const BAM_BOTTOM = 6;
        const TOGGLE_H = 18;
        const CONTROL_H = 47;
        const STRUCTURE_H = 50;
        const GAP = 7;
        let height = TOGGLE_H;
        if (this._expanded) {
            height += CONTROL_H;
            if (this._toolMenuOpen) height += STRUCTURE_H;
        }
        document.body.style.setProperty('--th-overlay-bottom', `${BAM_BOTTOM + height + GAP}px`);
    }

    private _mapEngineToolToMenuTool(name: string): StructureToolId | null {
        const key = String(name ?? '').toLowerCase();
        const map: Record<string, StructureToolId> = {
            wall: 'wall', slab: 'slab', door: 'door', window: 'window', ceiling: 'ceiling', floor: 'floor', curtainwall: 'curtainWall', 'curtain-wall': 'curtainWall',
        };
        return map[key] ?? null;
    }

    private _attachKeyboardShortcuts(): void {
        const COMBOS: Record<string, () => void> = {
            WA: () => this._activateStructureToolByShortcut('wall'),
            CW: () => this._activateStructureToolByShortcut('curtainWall'),
            DO: () => this._activateStructureToolByShortcut('door'),
            WN: () => this._activateStructureToolByShortcut('window'),
            SL: () => this._activateStructureToolByShortcut('slab'),
            FL: () => this._activateStructureToolByShortcut('floor'),
            CE: () => this._activateStructureToolByShortcut('ceiling'),
        };
        const SINGLE: Record<string, () => void> = {
            V: () => this._setSelectMode(),
            B: () => this._toggleToolMenu(),
        };
        const comboStarters = new Set(Object.keys(COMBOS).map(k => k[0]));
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const letter = e.key.toUpperCase();
            if (this._pendingKey !== null) {
                const combo = this._pendingKey + letter;
                if (combo in COMBOS) {
                    this._clearPending(false);
                    COMBOS[combo]();
                    e.preventDefault();
                    return;
                }
                this._clearPending(true, SINGLE);
            }
            if (comboStarters.has(letter)) {
                this._pendingKey = letter;
                this._pendingTimer = setTimeout(() => {
                    const k = this._pendingKey;
                    this._pendingKey = null;
                    this._pendingTimer = null;
                    if (k && k in SINGLE) SINGLE[k]();
                }, 1200);
                return;
            }
            if (letter in SINGLE) SINGLE[letter]();
        });
    }

    private _clearPending(fireSingle: boolean, singleMap?: Record<string, () => void>): void {
        if (this._pendingTimer !== null) clearTimeout(this._pendingTimer);
        if (fireSingle && this._pendingKey && singleMap && this._pendingKey in singleMap) singleMap[this._pendingKey]();
        this._pendingKey = null;
        this._pendingTimer = null;
    }

    private _setSelectMode(): void {
        this._props.toolManager?.deactivateAll?.();
        this._props.selectionManager?.setEnabled?.(true);
        this._activeTool = null;
        this._toolMenuOpen = false;
        this._render();
    }

    private _activateStructureToolByShortcut(id: StructureToolId): void {
        this._activateStructureTool(id);
    }

    private _activateStructureTool(id: StructureToolId): void {
        const { toolManager, service } = this._props;
        this._selectedTool = id;
        window.localStorage?.setItem(TOOL_STORAGE_KEY, id);
        this._toolMenuOpen = false;
        switch (id) {
            case 'wall':
                service.activateWallTool(WallDrawingMode.POLYLINE_ORTHO);
                break;
            case 'curtainWall':
                toolManager?.activateCurtainWall?.('SINGLE');
                break;
            case 'door':
                toolManager?.activateDoor?.('single');
                break;
            case 'window':
                toolManager?.activateWindow?.('single');
                break;
            case 'slab':
                this._slabModePicker.show({
                    on2Point: () => service.activateSlabTool('2point'),
                    onPolyline: () => service.activateSlabTool('polyline'),
                    onRegion: () => service.activateSlabTool('region'),
                    onHollow: () => service.activateSlabTool('hollow'),
                    onPickWalls: () => service.activateSlabTool('pickWalls'),
                });
                return;
            case 'floor':
                if (service?.activateFloorTool) service.activateFloorTool();
                else toolManager?.activateFloor?.();
                break;
            case 'ceiling':
                if (service?.activateCeilingTool) service.activateCeilingTool();
                else toolManager?.activateCeiling?.();
                break;
        }
        this._activeTool = id;
        this._render();
    }

    private _toggleToolMenu(): void {
        this._toolMenuOpen = !this._toolMenuOpen;
        this._expanded = true;
        this._el.classList.remove('bam-container--collapsed');
        this._toggleBtn.title = 'Hide toolbar';
        this._render();
    }

    private _cycleLevelMode(): void {
        // §LEVEL-STACK (Bug 2) — the Level-Stack button is now a 2-state TOGGLE
        // (stacked ↔ exploded), NOT a 3-state cycle. The old cycle landed on 'solo'
        // when the user pressed the button a 2nd time expecting to COLLAPSE; solo
        // hides every level except the active one (so "most elements vanish") AND
        // its icon is the sun glyph — exactly the founder's "shows a sun and most
        // elements are not present" report. Solo remains available via the dedicated
        // "Active Level Only" button. Collapsing now fully restores the pre-explode
        // state via _restoreLevelTransforms() (exact original-Y snap-back).
        this._levelMode = this._levelMode === 'exploded' ? 'stacked' : 'exploded';
        if (this._levelMode === 'stacked') {
            // Full collapse: snap every offset root back to its captured original Y
            // and re-apply visibility (no solo/active-level hiding lingers).
            this._restoreLevelTransforms();
        } else {
            this._applyLevelTransforms();
        }
        this._applySceneVisibilityFilters();
        this.runtime?.events?.emit('pryzm-inspect-level-explode', { mode: this._levelMode, soloLevelId: this._getActiveLevelId() ?? undefined, source: 'bottom-menu' }); // F.events.15
        this._render();
    }

    private _toggleWallCutaway(): void {
        const prevMode = this._wallCutMode;
        this._wallCutMode = this._wallCutMode === 'cutaway' ? 'up' : 'cutaway';
        this._applyWallCutawayClipping();
        this._applySceneVisibilityFilters();
        // §DIAG-CUTAWAY-RESTORE — toggling BACK to full height must re-cut every
        // wall's door/window voids (see _restoreWallOpeningsAfterCutaway).
        if (prevMode !== 'up' && this._wallCutMode === 'up') this._restoreWallOpeningsAfterCutaway(prevMode);
        this.runtime?.events?.emit('bam:wall-cut-mode-changed', { mode: this._wallCutMode }); // F.events.14
        this._render();
    }

    private _toggleWallLowHeight(): void {
        const prevMode = this._wallCutMode;
        this._wallCutMode = this._wallCutMode === 'down' ? 'up' : 'down';
        this._applyWallCutawayClipping();
        this._applySceneVisibilityFilters();
        // §DIAG-CUTAWAY-RESTORE — toggling BACK to full height must re-cut every
        // wall's door/window voids (see _restoreWallOpeningsAfterCutaway).
        if (prevMode !== 'up' && this._wallCutMode === 'up') this._restoreWallOpeningsAfterCutaway(prevMode);
        this.runtime?.events?.emit('bam:wall-cut-mode-changed', { mode: this._wallCutMode }); // F.events.14
        this._render();
    }

    /**
     * §DIAG-CUTAWAY-RESTORE (2026-06-10) — re-cut every wall opening (door +
     * window void) after a Wall-Cutaway / Wall-Low-Height toggle returns to full
     * height ('up').
     *
     * ROOT CAUSE this guards against: the cutaway/low toggle hides or clips the
     * wall bodies (visibility flip in `_applySceneVisibilityFilters` +
     * `mat.clippingPlanes` in `_applyWallCutawayClipping`). When toggled back, the
     * wall meshes reappear — but any wall whose segmented opening body had been
     * dropped to an instanced/solid box (or whose group was hidden while another
     * subsystem re-instanced it) comes back SOLID: the door/window leaf shows
     * against an un-carved wall, exactly the §DIAG-OPENING-VOID interior-partition
     * defect. The openings are still in `wall.openings[]` (they are data) — the
     * body geometry just was not rebuilt to carve them.
     *
     * FIX: on the restore edge only, re-queue every opening-bearing wall through
     * the apartment-proven whole-level rebuild
     * (`window.__wallRebuildControl.rebuildWalls`). That path runs `resolveLevel`
     * + `buildWall` from current store data — unregistering each wall from
     * instancing and building the segmented void body — and carries the
     * §DIAG-OPENING-VOID verify-and-fallback. It is a no-op for walls with no
     * openings, so plain walls and the first-press hide are untouched.
     *
     * P6: no direct store writes — we only READ `wall.openings` and call the
     * existing rebuild control surface. P2: no THREE here.
     */
    private _restoreWallOpeningsAfterCutaway(fromMode: BAMWallCutMode): void {
        const store = window.wallStore; // TODO(D.4): replace with runtime.scene wall store — Phase D.4
        const ctl = window.__wallRebuildControl;
        if (!store?.getAll || !ctl?.rebuildWalls) {
            console.warn(
                `[BottomActionMenu] §DIAG-CUTAWAY-RESTORE from=${fromMode} — wall store / rebuild control ` +
                `unavailable (store=${!!store?.getAll}, rebuild=${!!ctl?.rebuildWalls}); skipping opening re-cut.`,
            );
            return;
        }
        let walls: Array<{ id: string; openings?: ReadonlyArray<unknown> }> = [];
        try { walls = store.getAll() ?? []; } catch (e) {
            console.warn('[BottomActionMenu] §DIAG-CUTAWAY-RESTORE — wallStore.getAll() threw; skipping.', e);
            return;
        }
        const openingWallIds: string[] = [];
        for (const w of walls) {
            if (w?.id && (w.openings?.length ?? 0) > 0) openingWallIds.push(String(w.id));
        }
        if (openingWallIds.length === 0) {
            console.log(
                `[BottomActionMenu] §DIAG-CUTAWAY-RESTORE from=${fromMode} — walls restored=${walls.length}, ` +
                `no opening-bearing walls to re-cut.`,
            );
            return;
        }
        try {
            ctl.rebuildWalls(openingWallIds);
            console.log(
                `[BottomActionMenu] §DIAG-CUTAWAY-RESTORE from=${fromMode} — walls restored=${walls.length}, ` +
                `openings re-cut requested for ${openingWallIds.length} wall(s) via whole-level rebuild ` +
                `(carries §DIAG-OPENING-VOID verify+fallback; any wall that comes back solid ⚠ is logged by ` +
                `WallRebuildCoordinator).`,
            );
        } catch (e) {
            console.warn(
                `[BottomActionMenu] §DIAG-CUTAWAY-RESTORE ⚠ from=${fromMode} — rebuildWalls threw for ` +
                `${openingWallIds.length} wall(s); openings may stay solid.`,
                e,
            );
        }
    }

    /**
     * Applies or removes a global renderer clipping plane to simulate BIM cutaway mode.
     * Cutaway: clips everything above the standard BIM section cut height (1.2m).
     * Low:     clips everything above 0.6m so only very low wall stubs are shown.
     * Up:      removes all clipping planes (full wall height).
     *
     * Works with both WebGL and WebGPU renderers via material-level clipping planes.
     * Sets renderer.localClippingEnabled = true so material clipping planes are respected.
     */
    private _applyWallCutawayClipping(): void {
        const renderer = window.world?.renderer?.three; // TODO(D.4): replace with runtime.scene.world (EngineBootstrap split) — Phase D.4
        const scene = this._getScene();
        const CUT_HEIGHTS: Record<string, number | null> = {
            cutaway: 1.2,
            down:    0.6,
            up:      null,
        };
        const cutHeight = CUT_HEIGHTS[this._wallCutMode] ?? null;

        if (renderer) {
            renderer.localClippingEnabled = cutHeight !== null;
        }

        if (!scene) return;

        scene.traverse((obj: any) => {
            if (!(obj instanceof THREE.Mesh)) return;
            const mats: THREE.Material[] = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
            mats.forEach(mat => {
                if (!mat) return;
                if (cutHeight !== null) {
                    mat.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), cutHeight)];
                } else {
                    mat.clippingPlanes = [];
                }
                mat.needsUpdate = true;
            });
        });
    }

    private _toggleDayNight(): void {
        this._isNight = !this._isNight;

        // ── Use the RenderPipelineManager's BackgroundUniform when available.
        // Directly setting scene.background conflicts with the TSL compositor,
        // causing the "super white mask" artifact on day restore (contrast blow-out).
        const rpm = window.renderPipelineManager; // TODO(D.4): replace with runtime.scene.renderPipeline — Phase D.4
        if (rpm) {
            rpm.setTheme(this._isNight ? 'dark' : 'light');
            // Also update the viewport container's CSS background so the div behind
            // the WebGPU canvas matches the rendered scene colour (not stuck at white).
            const vp = window.viewportContainer as HTMLElement | null;
            if (vp) vp.style.background = this._isNight ? '#1f2433' : '#ffffff';
        } else {
            // Fallback for non-WebGPU / pipeline-less rendering paths.
            const scene = this._getScene();
            if (scene) {
                if (this._savedBackground === undefined) this._savedBackground = scene.background;
                scene.background = this._isNight
                    ? new THREE.Color(0x1f2433)
                    : (this._savedBackground ?? new THREE.Color(0xffffff));
            }
        }

        // Light intensity: dim by 62% for night, restore to saved original for day.
        const scene = this._getScene();
        if (scene) {
            scene.traverse((obj: any) => {
                if (!obj.isLight) return;
                const light = obj as THREE.Light;
                if (!this._savedLightIntensities.has(light)) {
                    this._savedLightIntensities.set(light, light.intensity);
                }
                const original = this._savedLightIntensities.get(light) ?? light.intensity;
                light.intensity = this._isNight ? original * 0.38 : original;
            });
        }

        document.body.classList.toggle('pryzm-night-mode', this._isNight);
        this.runtime?.events?.emit('bam:day-night-changed', { mode: this._isNight ? 'night' : 'day' }); // F.events.14
        this._render();
    }

    private _toggleElementsInView(): void {
        this._elementsInViewOnly = !this._elementsInViewOnly;
        if (this._elementsInViewOnly) {
            this._captureElementsInView();
            // Open the Project Browser so the user sees highlighted elements.
            this._openProjectBrowserSection('BROWSER');
            // Broadcast visible IDs so the browser panel / hierarchy can highlight them.
            this.runtime?.events?.emit('pryzm:elements-in-view', { ids: Array.from(this._visibleElementIds), active: true }); // F.events.15
        } else {
            this._visibleElementIds.clear();
            this.runtime?.events?.emit('pryzm:elements-in-view', { ids: [], active: false }); // F.events.15
        }
        this._applySceneVisibilityFilters();
        this._render();
    }

    /**
     * Programmatically opens a section of the ProjectBrowserPanel by clicking
     * the section header button in the DOM.  Falls back to a custom event when
     * the DOM node cannot be found.
     */
    private _openProjectBrowserSection(sectionId: string): void {
        const section = document.querySelector(`[data-section-id="${sectionId}"]`) as HTMLElement | null;
        if (section) {
            const btn = section.querySelector('.pb-section-header') as HTMLElement | null;
            if (btn && btn.getAttribute('aria-expanded') !== 'true') btn.click();
        } else {
            this.runtime?.events?.emit('pryzm:open-panel-section', { section: sectionId }); // F.events.15
        }
    }

    /**
     * §ROOM-LABELS-TOGGLE (2026-06-10) — flips the 3D room-name sprite labels
     * on/off. Drives RoomLabelRenderer.setRoomLabelsVisible() (single owner of
     * the sprites) so future labels honour the flag too; falls back to a direct
     * scene traverse of `userData.type === 'room-label'` sprites if the renderer
     * instance is not yet on window. Does NOT touch the 2D plan-view room tags.
     */
    private _toggleRoomLabels(): void {
        this._roomLabelsVisible = !this._roomLabelsVisible;
        const renderer = window.roomLabelRenderer; // §ROOM-LABELS-TOGGLE — set in initBuilders
        if (renderer?.setRoomLabelsVisible) {
            renderer.setRoomLabelsVisible(this._roomLabelsVisible);
        } else {
            // Fallback: flip the sprites directly (no THREE import needed — pure flag).
            const scene = this._getScene();
            scene?.traverse((obj: any) => {
                if (obj.userData?.type === 'room-label') obj.visible = this._roomLabelsVisible;
            });
        }
        this._render();
    }

    private _toggleActiveLevelOnly(): void {
        if (!this._getActiveLevelId()) this._setActiveLevelToFirstAvailable();
        this._activeLevelOnly = !this._activeLevelOnly;
        this._applySceneVisibilityFilters();
        this._render();
    }

    private async _resetView(): Promise<void> {
        this._elementsInViewOnly = false;
        this._activeLevelOnly = false;
        // §ROOM-LABELS-TOGGLE — restore default (labels visible) on reset.
        if (!this._roomLabelsVisible) this._toggleRoomLabels();
        if (this._isNight) this._toggleDayNight();
        if (this._sectionBoxActive) {
            this._sectionBoxActive = false;
            const tool = window.sectionBoxTool; // TODO(D.4): replace with runtime.tools.sectionBox — Phase D.4
            if (tool?.disable) tool.disable();
        }
        this._visibleElementIds.clear();
        this._levelMode = 'stacked';
        const _wasCut = this._wallCutMode !== 'up';
        this._wallCutMode = 'up';
        this._applyWallCutawayClipping();
        // §DIAG-CUTAWAY-RESTORE — a reset FROM a cut/low state must also re-cut
        // every wall's openings, same as the explicit toggle-back.
        if (_wasCut) this._restoreWallOpeningsAfterCutaway('cutaway');
        this._restoreLevelTransforms();
        for (const [obj, visible] of this._originalVisibility) obj.visible = visible;
        this._originalVisibility.clear();
        this._invalidateSelectionCache();
        this.runtime?.events?.emit('pryzm-inspect-level-explode', { mode: 'stacked', source: 'bottom-menu' }); // F.events.15
        this.runtime?.events?.emit('bam:reset-view-controls', {}); // F.events.14
        try {
            if (this._props.zoomToAll) await this._props.zoomToAll();
            else await this._fitSceneToView();
        } catch (e) {
            console.warn('[BottomActionMenu] reset view failed:', e);
        }
        this._render();
    }

    private _toggleSectionBox(): void {
        console.log('[BottomActionMenu] section box clicked, active=', this._sectionBoxActive);
        this._sectionBoxActive = !this._sectionBoxActive;
        const tool = window.sectionBoxTool; // TODO(D.4): replace with runtime.tools.sectionBox — Phase D.4
        if (!tool) {
            console.warn('[BottomActionMenu] sectionBoxTool not initialised on window');
            this._sectionBoxActive = false;
            this._render();
            return;
        }
        if (this._sectionBoxActive) {
            // Resolve world from all known access paths
            const w = window.world // TODO(D.4): replace with runtime.scene.world (EngineBootstrap split) — Phase D.4
                   ?? window.bimWorld // TODO(D.4): replace with runtime.scene.world — alias removed in D.4 — Phase D.4
                   ?? window.selectionManager?.world; // TODO(D.13): replace with runtime.picking.select — Phase D.13
            const scene    = this._getScene() as THREE.Scene | null;
            const renderer = (w?.renderer?.three ?? window.renderer) as THREE.WebGLRenderer | undefined; // TODO(D.4): replace with runtime.scene.renderer — Phase D.4
            const camera   = (w?.camera?.three   ?? window.selectionManager?.camera?.three) as THREE.Camera | undefined; // TODO(D.13): replace with runtime.picking.select — Phase D.13
            const container = window.viewportContainer as HTMLElement | null; // TODO(D.4): replace with runtime.scene.viewportContainer — Phase D.4
            console.log('[BottomActionMenu] section box context', { hasWorld: !!w, hasRenderer: !!renderer, hasScene: !!scene, hasCamera: !!camera, hasContainer: !!container, hasTool: !!tool, hasEnable: typeof tool?.enable });
            if (!renderer || !scene || !camera || !container) {
                console.warn('[BottomActionMenu] world objects not ready for section box', { renderer: !!renderer, scene: !!scene, camera: !!camera, container: !!container });
                this._sectionBoxActive = false;
                this._render();
                return;
            }
            try {
                tool.enable(renderer, scene, camera, container);
                console.log('[BottomActionMenu] section box ENABLED — renderer.clippingPlanes count:', renderer.clippingPlanes?.length);
            } catch (err) {
                console.error('[BottomActionMenu] section box enable threw:', err);
                this._sectionBoxActive = false;
            }
        } else {
            try {
                tool.disable();
                console.log('[BottomActionMenu] section box DISABLED');
            } catch (err) {
                console.error('[BottomActionMenu] section box disable threw:', err);
            }
        }
        this._render();
    }

    private _toggleCamera(): void {
        this._is2D = !this._is2D;
        const mode = this._is2D ? 'Top' : '3D';
        const vc = window.viewController; // TODO(D.4): replace with runtime.scene.viewController — Phase D.4
        if (vc) vc.activate(mode).catch((e: unknown) => console.warn('[BottomActionMenu] viewController.activate failed:', e));
        else this._props.navManager?.setViewMode?.(mode as any);
        this._render();
    }

    private _makeBtn(opts: { cls?: string; title?: string; svg: string; badge?: string; onClick: () => void }): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'bam-btn bam-icon-lucide' + (opts.cls ? ' ' + opts.cls : '');
        if (opts.title) btn.title = opts.title;
        btn.innerHTML = opts.svg;
        if (opts.badge) {
            const span = document.createElement('span');
            span.className = 'bam-shortcut';
            span.textContent = opts.badge;
            btn.appendChild(span);
        }
        btn.addEventListener('click', opts.onClick);
        return btn;
    }

    private _makeSep(): HTMLElement {
        const sep = document.createElement('div');
        sep.className = 'bam-sep';
        return sep;
    }

    private _render(): void {
        this._renderStructureRow();
        this._renderControlRow();
        this._updateOverlayBottom();
    }

    private _renderStructureRow(): void {
        const row = this._structureRow;
        row.innerHTML = '';
        row.classList.toggle('bam-structure-row--visible', this._toolMenuOpen);
        if (!this._toolMenuOpen) return;
        for (const tool of STRUCTURE_TOOLS) {
            const isActive = this._activeTool === tool.id;
            const btn = this._makeBtn({
                svg: tool.icon,
                title: `${tool.label} (${tool.badge})`,
                badge: tool.badge,
                onClick: () => this._activateStructureTool(tool.id),
            });
            btn.classList.add(isActive ? 'bam-tool--active' : 'bam-tool--inactive');
            if (this._selectedTool === tool.id) btn.classList.add('bam-btn--active-img');
            row.appendChild(btn);
        }
    }

    private _renderControlRow(): void {
        const row = this._controlRow;
        row.innerHTML = '';
        const selected = STRUCTURE_TOOLS.find(t => t.id === this._selectedTool) ?? STRUCTURE_TOOLS[0];
        const toolWrap = document.createElement('div');
        toolWrap.className = 'bam-section';
        toolWrap.appendChild(this._makeBtn({
            svg: this._toolMenuOpen ? ICONS.plus : selected.icon,
            title: this._toolMenuOpen ? 'Close tool menu' : `Tool: ${selected.label}. Click to choose another tool.`,
            cls: [
                'bam-btn--circle-tool',
                this._toolMenuOpen || this._activeTool === selected.id ? 'bam-mode-active-green' : '',
            ].filter(Boolean).join(' '),
            badge: '+',
            onClick: () => this._toggleToolMenu(),
        }));
        row.appendChild(toolWrap);
        row.appendChild(this._makeSep());

        const viewWrap = document.createElement('div');
        viewWrap.className = 'bam-section';
        const camBtn = this._makeBtn({
            svg: ICONS.floorplan,
            title: `Camera: ${this._is2D ? 'Perspective' : 'Orthographic'}`,
            cls: this._is2D ? 'bam-mode-active-amber' : '',
            onClick: () => this._toggleCamera(),
        });
        const twoDLabel = document.createElement('span');
        twoDLabel.className = 'bam-new-badge';
        twoDLabel.textContent = '2D';
        camBtn.appendChild(twoDLabel);
        viewWrap.appendChild(camBtn);

        const levelIconMap: Record<BAMLevelMode, string> = { stacked: ICONS.stacked, exploded: ICONS.exploded, solo: ICONS.solo };
        const levelLabelMap: Record<BAMLevelMode, string> = { stacked: 'Stacked', exploded: 'Exploded', solo: 'Solo active level' };
        viewWrap.appendChild(this._makeBtn({
            svg: levelIconMap[this._levelMode],
            title: `Level Stack: ${levelLabelMap[this._levelMode]}`,
            cls: this._levelMode !== 'stacked' ? 'bam-mode-active-amber' : '',
            onClick: () => this._cycleLevelMode(),
        }));
        viewWrap.appendChild(this._makeBtn({
            svg: ICONS.wallcut,
            title: this._wallCutMode === 'cutaway' ? 'Wall Cutaway: On' : 'Wall Cutaway',
            cls: this._wallCutMode === 'cutaway' ? 'bam-mode-active-amber' : '',
            onClick: () => this._toggleWallCutaway(),
        }));
        viewWrap.appendChild(this._makeBtn({
            svg: ICONS.walllow,
            title: this._wallCutMode === 'down' ? 'Wall Low Height: On' : 'Wall Low Height',
            cls: this._wallCutMode === 'down' ? 'bam-mode-active-amber' : '',
            onClick: () => this._toggleWallLowHeight(),
        }));
        viewWrap.appendChild(this._makeBtn({
            svg: this._isNight ? ICONS.moon : ICONS.sun,
            title: this._isNight ? 'Night mode' : 'Day mode',
            cls: this._isNight ? 'bam-mode-active-amber' : '',
            onClick: () => this._toggleDayNight(),
        }));
        viewWrap.appendChild(this._makeBtn({
            svg: ICONS.eye,
            title: this._elementsInViewOnly ? 'Elements in View: On' : 'Elements in View',
            cls: this._elementsInViewOnly ? 'bam-mode-active-amber' : '',
            onClick: () => this._toggleElementsInView(),
        }));
        viewWrap.appendChild(this._makeBtn({
            svg: ICONS.roomLabel,
            title: this._roomLabelsVisible ? 'Room labels: On — click to hide' : 'Room labels: Off — click to show',
            cls: this._roomLabelsVisible ? 'bam-mode-active-amber' : '',
            onClick: () => this._toggleRoomLabels(),
        }));
        viewWrap.appendChild(this._makeBtn({
            svg: ICONS.activeLevel,
            title: this._activeLevelOnly ? 'Active Level Only: On' : 'Active Level Only',
            cls: this._activeLevelOnly ? 'bam-mode-active-amber' : '',
            onClick: () => this._toggleActiveLevelOnly(),
        }));
        viewWrap.appendChild(this._makeBtn({
            svg: ICONS.reset,
            title: 'Reset view controls',
            onClick: () => { this._resetView(); },
        }));
        viewWrap.appendChild(this._makeBtn({
            svg: ICONS.sectionBox,
            title: this._sectionBoxActive ? 'Section Box: On — click to disable' : 'Section Box',
            cls: this._sectionBoxActive ? 'bam-mode-active-amber' : '',
            onClick: () => this._toggleSectionBox(),
        }));
        row.appendChild(viewWrap);

        row.appendChild(this._makeSep());

        const importWrap = document.createElement('div');
        importWrap.className = 'bam-section';
        const importBtn = this._makeBtn({
            svg: ICONS.importIfc,
            title: 'Import IFC model',
            onClick: () => {
                window.runtime?.events?.emit('import-ifc', {});
            },
        });
        const ifcLabel = document.createElement('span');
        ifcLabel.className = 'bam-new-badge';
        ifcLabel.textContent = 'IFC';
        importBtn.appendChild(ifcLabel);
        importWrap.appendChild(importBtn);
        row.appendChild(importWrap);
    }

    private _getScene(): THREE.Scene | null {
        return window.selectionManager?.world?.scene?.three ?? window.world?.scene?.three ?? window.scene ?? null; // TODO(D.13): replace with runtime.picking.select — Phase D.13
    }

    private _rememberVisibility(obj: THREE.Object3D): void {
        if (!this._originalVisibility.has(obj)) this._originalVisibility.set(obj, obj.visible);
    }

    private _isBimObject(obj: any): boolean {
        if (obj.userData?.isHelper || obj.userData?.isPreview || obj.userData?.role === 'edges') return false;
        return !!obj.userData?.id || !!obj.userData?.levelId || !!obj.userData?.storeyName;
    }

    private _normalizeStoreyName(name: string): string {
        return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    }

    private _getLevels(): LevelInfo[] {
        return window.bimManager?.getLevels?.() ?? window.wallStore?.getLevels?.() ?? window.projectContext?.levels ?? []; // TODO(TASK-08)
    }

    private _getActiveLevelId(): string | null {
        const pc = window.projectContext; // TODO(C.3.x): replace with runtime.persistence.projectContext — Phase C.3.x
        const active = pc?.activeLevelId ?? window.bimManager?.activeLevelId; // TODO(D.4): replace via EngineBootstrap split — bimManager destroyed in D.4 — Phase D.4
        return active ? String(active) : null;
    }

    private _setActiveLevelToFirstAvailable(): void {
        const first = this._getLevels().slice().sort((a, b) => Number(a.elevation ?? 0) - Number(b.elevation ?? 0))[0];
        if (!first?.id) return;
        const pc = window.projectContext; // TODO(C.3.x): replace with runtime.persistence.projectContext — Phase C.3.x
        if (pc) pc.activeLevelId = first.id;
        else window.bimManager?.setActiveLevel?.(first.id); // TODO(D.4): replace via EngineBootstrap split — bimManager destroyed in D.4 — Phase D.4
    }

    private _objectLevelId(obj: any): string {
        if (obj.userData?.source === 'ifc-import' && obj.userData?.storeyName) {
            const norm = this._normalizeStoreyName(obj.userData.storeyName);
            const match = this._getLevels().find(l => this._normalizeStoreyName(l.name ?? '') === norm);
            return match?.id ? String(match.id) : `ifc-storey:${obj.userData.storeyName}`;
        }
        return String(obj.userData?.levelId ?? '');
    }

    private _isWallObject(obj: any): boolean {
        const type = String(obj.userData?.elementType ?? obj.userData?.type ?? '').toLowerCase();
        return type === 'wall' || type === 'walls';
    }

    private _wallVisibleInMode(obj: any): boolean {
        if (!this._isWallObject(obj)) return true;
        if (this._wallCutMode === 'up') return true;
        if (this._wallCutMode === 'down') return false;
        const front = String(obj.userData?.frontSide ?? '').toLowerCase();
        const back = String(obj.userData?.backSide ?? '').toLowerCase();
        if (front === 'interior' && back === 'interior') return false;
        const camera = window.world?.camera?.three as THREE.Camera | undefined; // TODO(D.4): replace with runtime.scene.world (EngineBootstrap split) — Phase D.4
        if (!camera) return true;
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        const wallDir = new THREE.Vector3();
        obj.getWorldDirection?.(wallDir);
        if (wallDir.lengthSq() === 0) return true;
        if (wallDir.dot(cameraDir) < 0) return !(front === 'exterior' && back !== 'exterior');
        return !(back === 'exterior' && front !== 'exterior');
    }

    private _applySceneVisibilityFilters(): void {
        const scene = this._getScene();
        if (!scene) return;
        const activeLevelId = this._getActiveLevelId();
        scene.traverse((obj: any) => {
            if (!this._isBimObject(obj)) return;
            this._rememberVisibility(obj);
            let visible = this._originalVisibility.get(obj) ?? obj.visible;
            if ((this._activeLevelOnly || this._levelMode === 'solo') && activeLevelId) visible = visible && this._objectLevelId(obj) === activeLevelId;
            if (this._elementsInViewOnly && obj.userData?.id) visible = visible && this._visibleElementIds.has(String(obj.userData.id));
            visible = visible && this._wallVisibleInMode(obj);
            obj.visible = visible;
        });
        this._invalidateSelectionCache();
    }

    private _captureElementsInView(): void {
        this._visibleElementIds.clear();
        const scene = this._getScene();
        const camera = window.world?.camera?.three as THREE.Camera | undefined; // TODO(D.4): replace with runtime.scene.world (EngineBootstrap split) — Phase D.4
        if (!scene || !camera) return;
        camera.updateMatrixWorld();
        scene.updateMatrixWorld(true);
        const frustum = new THREE.Frustum();
        const matrix = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(matrix);
        const box = new THREE.Box3();
        scene.traverse((obj: any) => {
            const id = obj.userData?.id;
            if (!id || !this._isBimObject(obj)) return;
            box.setFromObject(obj);
            if (!box.isEmpty() && frustum.intersectsBox(box)) this._visibleElementIds.add(String(id));
        });
    }

    /**
     * §LEVEL-STACK (Bug rooms+furniture) — room-NAME labels are THREE.Sprites that
     * carry only `userData.roomId` + `userData.type='room-label'` (no `id`/`levelId`/
     * `storeyName`), so `_isBimObject` rejects them and they were never bucketed — the
     * "labels float at the wrong storey" report. Room FILL/VOLUME overlays and Furniture
     * roots DO stamp `userData.levelId` at build time, but generator-placed or legacy
     * records can arrive without it. This pre-pass resolves the owning level for any
     * such object via the room store and stamps `userData.levelId` so they enter the
     * SAME `byLevel` bucket the walls use — no separate offset path. Pure visual tag;
     * never mutates a store record.
     */
    private _stampAnnotationLevelTags(scene: THREE.Scene): void {
        const roomStore = window.roomStore as { getById?: (id: string) => { levelId?: string } | undefined } | undefined; // TODO(TASK-08)
        scene.traverse((obj: any) => {
            const ud = obj.userData;
            if (!ud || ud.levelId) return;
            // Room labels (sprites) + any room overlay/volume that lost its tag.
            const roomId = ud.roomId ?? (ud.type === 'room' && ud.id);
            if (roomId && roomStore?.getById) {
                const lvl = roomStore.getById(String(roomId))?.levelId;
                if (lvl) { ud.levelId = String(lvl); return; }
            }
        });
    }

    private _buildLevelRootMap(): Array<{ level: LevelInfo; index: number; roots: THREE.Object3D[] }> {
        const scene = this._getScene();
        if (!scene) return [];
        // §LEVEL-STACK — tag level-less annotations (room labels especially) BEFORE
        // bucketing so they lift with their storey.
        this._stampAnnotationLevelTags(scene);
        const objectById = new Map<string, THREE.Object3D>();
        // §LEVEL-STACK — collect ALL level-tagged objects (including instanced wall
        // groups that carry userData.levelId but NO per-element userData.id) so they
        // lift with their level. Without this, batch/instanced walls were skipped
        // entirely and "left behind" at ground level while CSG walls on the same
        // level lifted (Bug 1).
        const byLevel = new Map<string, THREE.Object3D[]>();
        scene.traverse((obj: any) => {
            const id = obj.userData?.id;
            if (id && !objectById.has(String(id))) objectById.set(String(id), obj);
            if (this._isBimObject(obj)) {
                const lvl = this._objectLevelId(obj);
                if (lvl) {
                    const arr = byLevel.get(lvl);
                    if (arr) arr.push(obj); else byLevel.set(lvl, [obj]);
                }
            }
        });
        // Drop any level-tagged object whose ancestor is ALSO level-tagged for the
        // same level — offsetting both parent and child would compound the Y shift.
        const dropDescendants = (objs: THREE.Object3D[]): THREE.Object3D[] => {
            const set = new Set(objs);
            return objs.filter((o) => {
                for (let p = o.parent; p; p = p.parent) if (set.has(p)) return false;
                return true;
            });
        };
        return this._getLevels()
            .slice()
            .sort((a, b) => Number(a.elevation ?? 0) - Number(b.elevation ?? 0))
            .map((level, index) => {
                const roots = new Set<THREE.Object3D>();
                for (const id of level.childrenIds ?? []) {
                    const obj = objectById.get(String(id));
                    if (obj) roots.add(obj);
                }
                // Always merge in level-tagged objects (id-less instanced groups etc.),
                // not only as a zero-roots fallback.
                if (level.id) {
                    for (const obj of byLevel.get(String(level.id)) ?? []) roots.add(obj);
                }
                return { level, index, roots: dropDescendants(Array.from(roots)) };
            });
    }

    private _applyLevelTransforms(): void {
        const groups = this._buildLevelRootMap();
        // §LEVEL-STACK — diagnostics: log how many roots each level offsets so a
        // mismatch (e.g. instanced walls / room labels / furniture left behind) is
        // visible at a glance. Break the count out by class so the founder's
        // "rooms + furniture don't lift" classes are independently auditable.
        const diag: string[] = [];
        let totalRooms = 0, totalLabels = 0, totalFurniture = 0;
        for (const group of groups) {
            const targetOffset = this._levelMode === 'exploded' ? group.index * EXPLODE_GAP : 0;
            let rooms = 0, labels = 0, furniture = 0;
            for (const root of group.roots) {
                if (!this._levelOriginalY.has(root)) this._levelOriginalY.set(root, root.position.y);
                this._levelTargetY.set(root, (this._levelOriginalY.get(root) ?? root.position.y) + targetOffset);
                const ud = (root as any).userData ?? {};
                if (ud.type === 'room-label') labels++;
                else if (ud.elementType === 'Furniture' || ud.furnitureType) furniture++;
                else if (ud.isRoomOverlay || ud.isRoomVolume || ud.elementType === 'room') rooms++;
            }
            totalRooms += rooms; totalLabels += labels; totalFurniture += furniture;
            diag.push(`${group.level.name ?? group.level.id ?? `#${group.index}`}=${group.roots.length}(rm${rooms}+lbl${labels}+fur${furniture})`);
        }
        console.log(`[§LEVEL-STACK] ${this._levelMode}: offset roots per level — ${diag.join(', ')} (total ${this._levelOriginalY.size}; rooms ${totalRooms}, labels ${totalLabels}, furniture ${totalFurniture})`);
        this._startLevelAnimation();
    }

    private _restoreLevelTransforms(): void {
        // D.7.5 batch #3: dispose the FrameScheduler tick listener.
        if (this._raf !== null) { this._raf(); this._raf = null; }
        let restored = 0, rooms = 0, labels = 0, furniture = 0;
        for (const [obj, y] of this._levelOriginalY) {
            obj.position.y = y; restored++;
            const ud = (obj as any).userData ?? {};
            if (ud.type === 'room-label') labels++;
            else if (ud.elementType === 'Furniture' || ud.furnitureType) furniture++;
            else if (ud.isRoomOverlay || ud.isRoomVolume || ud.elementType === 'room') rooms++;
        }
        console.log(`[§LEVEL-STACK] collapse: restored ${restored} root Y positions (rooms ${rooms}, labels ${labels}, furniture ${furniture})`);
        this._levelOriginalY.clear();
        this._levelTargetY.clear();
    }

    private _startLevelAnimation(): void {
        // D.7.5 batch #3: dispose any previous tick listener before starting a new run.
        if (this._raf !== null) { this._raf(); this._raf = null; }
        // Continuous tick driven by FrameScheduler.addTickListener — the listener
        // self-disposes once every level mesh is within the convergence threshold
        // of its target Y (replaces the previous self-rescheduling rAF chain).
        const tick = () => {
            let done = true;
            for (const obj of this._levelOriginalY.keys()) {
                const target = this._levelTargetY.get(obj) ?? obj.position.y;
                const next = THREE.MathUtils.lerp(obj.position.y, target, 0.22);
                if (Math.abs(next - target) > 0.002) done = false;
                obj.position.y = Math.abs(next - target) <= 0.002 ? target : next;
            }
            if (done && this._raf) {
                this._raf();
                this._raf = null;
            }
        };
        this._raf = getFrameScheduler().addTickListener('bam-level-animation', tick, 'overlay');
    }

    private _invalidateSelectionCache(): void {
        const sm = window.selectionManager ?? this._props.selectionManager; // TODO(D.13): replace with runtime.picking.select — Phase D.13
        if (sm) sm._selectableCache = null;
        this.runtime?.events?.emit('bim-scene-mutated', { source: 'bottom-action-menu' }); // F.events.15
    }

    private async _fitSceneToView(): Promise<void> {
        const world = window.world; // TODO(D.4): replace with runtime.scene.world (EngineBootstrap split) — Phase D.4
        const scene = this._getScene();
        const controls = world?.camera?.controls;
        if (!scene || !controls?.setLookAt) return;
        const box = new THREE.Box3();
        const tmp = new THREE.Box3();
        let hasGeometry = false;
        scene.traverse((obj: any) => {
            if (!(obj instanceof THREE.Mesh) || !obj.visible || obj.userData?.isHelper || obj.userData?.isPreview) return;
            tmp.setFromObject(obj);
            if (!tmp.isEmpty()) {
                box.union(tmp);
                hasGeometry = true;
            }
        });
        if (!hasGeometry || box.isEmpty()) return;
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const distance = Math.min(Math.max(size.length() * 0.75, 8), 80);
        const dir = new THREE.Vector3(1, 0.65, 1).normalize();
        const pos = center.clone().addScaledVector(dir, distance);
        await controls.setLookAt(pos.x, pos.y, pos.z, center.x, center.y, center.z, true);
    }
}
