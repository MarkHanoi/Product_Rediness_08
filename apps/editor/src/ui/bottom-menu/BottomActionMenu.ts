import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { WallDrawingMode } from '@pryzm/geometry-wall';
import * as PryzmIcons from '../icons/PryzmIcons';
// §FEAT-PERSISTENT-MODE-BAR (2026-08-07) — the slab's pre-flight launcher menu is
// gone: every one of its entries re-activated the tool and wiped the in-progress
// polyline. The slab now activates immediately and carries the wall's persistent
// DrawingModeBar, from which every mode is reachable MID-DRAW.
// §FEAT-PERSISTENT-MODE-BAR — the slab's shared, surface-independent mode store.
import { resolveActiveSlabDrawMode } from '@app/engine/views/plantools/activeSlabDrawMode';
// §FIX-SLAB-FAMILY-MODE-SURFACE-INDEPENDENT (L-956) — the GESTURE half of "the mode
// last chosen". See the call site below: that promise named By Region / Hollow /
// Pick Walls, and `resolveActiveSlabDrawMode()`'s return type (`linear|ortho|curved`)
// structurally cannot express any of them.
import { resolveSlabReentryMode } from '@app/engine/views/plantools/activeSlabFamilyMode';
import { resolveLevelIsolation } from '../../engine/inspect/LevelIsolationResolver';
import { resolveNightBackground } from '../../engine/inspect/NightModeBackgroundResolver';
// §FIX-LIGHT-NIGHT-CONTRIBUTION — the role stamped on artificial fixture lights,
// which the environment dimmer below must skip.
import { FIXTURE_LIGHT_ROLE } from '@pryzm/core-app-model';
import { relationshipArrayOrUnknown } from '../relationshipDetermination';

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
    // §ISOLATE-ROOM-LABELS-PER-FLOOR (2026-06-26) — while a floor is isolated the
    // tag-toggle drives ONLY the isolated level's labels. This tracks that
    // per-level on/off state (default ON), and `_roomLabelsVisibleBeforeIsolate`
    // captures the pre-isolation GLOBAL flag so clearing isolation restores the
    // prior behaviour exactly (see _toggleActiveLevelOnly / _toggleRoomLabels).
    private _isolatedLevelLabelsVisible = true;
    private _roomLabelsVisibleBeforeIsolate: boolean | null = null;
    // §CEILING-HIDDEN-IN-3D (2026-06-24) — ceilings cap each room in the 3D
    // authoring view and block seeing the interior layout, so they are HIDDEN BY
    // DEFAULT whenever the 3D/perspective view is active. Tracks whether the live
    // viewport is the 3D view (vs a plan/section/elevation Canvas2D view). The
    // editor opens in 3D, so this starts true. Updated from the authoritative
    // 'view-activated' event (mode === '3D'). Plan views, schedules and exports
    // read from the store / a separate projection and are unaffected — this is a
    // pure scene-`.visible` filter, never a geometry or store mutation.
    private _view3DActive = true;
    // §CEILING-HIDDEN-IN-3D — user override: a default-on hide that stays
    // toggle-able. When the user explicitly shows ceilings in 3D (e.g. via the
    // V/G browser / a future toggle) this flips false and the 3D filter stops
    // hiding them until reset. Default true = ceilings hidden in 3D.
    private _hideCeilingsIn3D = true;
    private _expanded = false;
    private _sectionBoxActive = false;
    private _pendingKey: string | null = null;
    private _pendingTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly _originalVisibility = new Map<THREE.Object3D, boolean>();
    // §WALL-CUTAWAY-XRAY (2026-06-24) — original wall materials captured when the
    // Wall-Cutaway (x-ray) toggle turns ON, so OFF restores them exactly. Keyed by
    // the wall Mesh; value is the pre-xray material (or array), never cloned/lost.
    private readonly _xrayOriginalMaterials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
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

        // §CEILING-HIDDEN-IN-3D (2026-06-24) — keep the ceiling-hide in lock-step
        // with the live view mode. The ViewController emits 'view-activated' with
        // mode === '3D' for the perspective authoring view and a plan/section/
        // elevation mode otherwise. Re-run the scene visibility filter on every
        // switch so ceilings hide entering 3D and restore leaving it (plan views
        // get their ceilings back). Listening here mirrors the existing
        // activeLevelChanged wiring; no new global reads.
        this.runtime?.events?.on('view-activated', (payload: unknown) => {
            const mode = (payload as { mode?: string } | undefined)?.mode;
            if (mode === undefined) return;
            const next3D = mode === '3D';
            if (next3D === this._view3DActive) return;
            this._view3DActive = next3D;
            this._applySceneVisibilityFilters();
        });

        // §CEILING-HIDDEN-IN-3D — hide ceilings on initial paint (editor opens in
        // the 3D view). Deferred a tick so the scene + ceiling roots exist; the
        // filter is idempotent and recomputes from the captured originals.
        queueMicrotask(() => { if (this._view3DActive) this._applySceneVisibilityFilters(); });

        // §LEVEL-STACK-LOCKS-VIEW-Y (L-1010) — publish THIS menu's explode offset
        // on its own global, deliberately separate from LevelExplodeController's
        // `pryzmLevelExplodeOffsetForObject`. Two owners writing one global would
        // race on init order; two globals summed by the reader cannot. See
        // `initTransformControllers.ts` for the reader.
        window.pryzmBamLevelExplodeOffsetForObject = (obj: unknown): number =>
            this.getLevelExplodeOffsetForObject(obj as THREE.Object3D | null | undefined);
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
                // §FEAT-PERSISTENT-MODE-BAR (founder 2026-08-07) — "I would like
                // EXACTLY THE SAME PANEL as the wall." The wall activates IMMEDIATELY
                // and shows a persistent bar; the slab used to open a blocking
                // pre-flight menu first, and every one of its entries re-activated the
                // tool (destroying any in-progress polyline). Activate straight away in
                // the mode last chosen — every mode, including 2-Point / By Region /
                // Hollow / Pick Walls, stays reachable from the bar, mid-draw.
                // §FIX-SLAB-FAMILY-MODE-SURFACE-INDEPENDENT (L-956) — the comment
                // above promised "the mode last chosen — every mode, including
                // 2-Point / By Region / Hollow / Pick Walls". It passed
                // `resolveActiveSlabDrawMode()`, which returns `linear|ortho|curved`
                // and so could name NONE of those four: after choosing By Region,
                // re-entering the slab tool silently gave a polyline. Both axes are
                // now restored — the gesture, and (inside the polyline family only)
                // the constraint.
                service.activateSlabTool(
                    resolveSlabReentryMode(resolveActiveSlabDrawMode()) as never,
                );
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

    /**
     * §WALL-CUTAWAY-XRAY (2026-06-24) — "Wall Cutaway" now means X-RAY (walls go
     * semi-transparent so you can see INTO rooms), NOT a section/clip.
     *
     * ROOT CAUSE of the old behaviour: this handler used to call
     * `_applyWallCutawayClipping()`, which set a 1.2m clipping PLANE on every
     * material — slicing the wall tops off (a section cut), never making them
     * see-through. The founder expected x-ray transparency. The codebase already
     * has an x-ray recipe (DiagnosticMaterialManager._applyXray: transparent
     * MeshPhong @ low opacity, depthWrite:false), but that lives inside the
     * Inspect-mode (F2) lens stack with its own overlay group / DeltaMap context;
     * wiring this lightweight toolbar toggle into it would be heavy and fragile.
     * Instead we apply the same material recipe locally and capture/restore the
     * originals exactly like the level filter captures `_originalVisibility`.
     *
     * The separate "Wall Low Height" button keeps the clipping path (it is a
     * genuine cut-down). Cutaway and Low-Height are mutually exclusive because
     * both share `_wallCutMode`; toggling cutaway ON from a 'down' state clears
     * the clip first so the two never fight.
     */
    private _toggleWallCutaway(): void {
        const turningOn = this._wallCutMode !== 'cutaway';
        // If switching in from Low-Height (clipping) mode, drop the clip plane first.
        if (turningOn && this._wallCutMode === 'down') {
            this._wallCutMode = 'up';
            this._applyWallCutawayClipping();
            this._restoreWallOpeningsAfterCutaway('down');
        }
        this._wallCutMode = turningOn ? 'cutaway' : 'up';
        this._applyWallCutawayXray(turningOn);
        this.runtime?.events?.emit('bam:wall-cut-mode-changed', { mode: this._wallCutMode }); // F.events.14
        this._render();
    }

    /**
     * §WALL-CUTAWAY-XRAY — make every wall mesh semi-transparent (ON) or restore
     * its captured original material (OFF). Pure projection-layer material swap:
     * no store writes, no commands, no clipping.
     *
     * ON:  clone the live material, force `transparent=true`, `opacity≈0.28`,
     *      `depthWrite=false` (so you can see through overlapping walls), and
     *      `side=DoubleSide` (interior faces read through the x-ray). The original
     *      is stashed in `_xrayOriginalMaterials` before the swap.
     * OFF: re-assign each captured original and clear the map. Idempotent — safe
     *      to call when nothing was captured (no-op).
     */
    private _applyWallCutawayXray(enable: boolean): void {
        const scene = this._getScene();
        if (!scene) return;

        if (!enable) {
            for (const [mesh, original] of this._xrayOriginalMaterials) {
                mesh.material = original;
            }
            this._xrayOriginalMaterials.clear();
            this._invalidateSelectionCache();
            return;
        }

        const XRAY_OPACITY = 0.28;
        scene.traverse((obj: any) => {
            if (!(obj instanceof THREE.Mesh)) return;
            if (!this._isWallMeshOrDescendant(obj)) return;
            if (this._xrayOriginalMaterials.has(obj)) return; // already x-rayed

            const apply = (mat: THREE.Material): THREE.Material => {
                // Skip shader materials (grid etc. never reach here, but be safe).
                if (mat instanceof THREE.ShaderMaterial) return mat;
                const clone = mat.clone();
                (clone as any).transparent = true;
                (clone as any).opacity = XRAY_OPACITY;
                (clone as any).depthWrite = false;
                (clone as any).side = THREE.DoubleSide;
                clone.needsUpdate = true;
                return clone;
            };

            this._xrayOriginalMaterials.set(obj, obj.material);
            obj.material = Array.isArray(obj.material)
                ? obj.material.map((m: THREE.Material) => apply(m))
                : apply(obj.material as THREE.Material);
        });
        this._invalidateSelectionCache();
    }

    /**
     * §WALL-CUTAWAY-XRAY — true when this mesh is a wall body, OR a descendant of a
     * wall Group (wall fragment meshes carry no `elementType`; it lives on the
     * parent Group). Walks the ancestor chain, mirroring DiagnosticMaterialManager.
     */
    private _isWallMeshOrDescendant(obj: THREE.Object3D): boolean {
        let cur: THREE.Object3D | null = obj;
        while (cur) {
            const ud = (cur as any).userData;
            if (ud?.isHelper || ud?.isPreview || ud?.role === 'edges') return false;
            if (this._isWallObject(cur)) return true;
            cur = cur.parent;
        }
        return false;
    }

    private _toggleWallLowHeight(): void {
        const prevMode = this._wallCutMode;
        // §WALL-CUTAWAY-XRAY — Low-Height (clipping) and Cutaway (x-ray) share
        // `_wallCutMode` and are mutually exclusive; if x-ray was on, restore the
        // opaque wall materials before clipping so the two never stack.
        if (prevMode === 'cutaway') this._applyWallCutawayXray(false);
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
     * Applies or removes a global renderer clipping plane for the Wall Low-Height
     * mode ('down'). 'up' removes all clipping planes (full wall height). NOTE:
     * since §WALL-CUTAWAY-XRAY, the 'cutaway' mode is x-ray transparency and no
     * longer routes through here — it has no clip height.
     *
     * Works with both WebGL and WebGPU renderers via material-level clipping planes.
     * Sets renderer.localClippingEnabled = true so material clipping planes are respected.
     */
    private _applyWallCutawayClipping(): void {
        const renderer = window.world?.renderer?.three; // TODO(D.4): replace with runtime.scene.world (EngineBootstrap split) — Phase D.4
        const scene = this._getScene();
        const CUT_HEIGHTS: Record<string, number | null> = {
            down:    0.6,
            up:      null,
            cutaway: null, // §WALL-CUTAWAY-XRAY — x-ray mode does not clip
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

        // ── §NIGHT-BG-WEBGL-FALLBACK — resolve the background per LIVE backend.
        // Directly setting scene.background conflicts with the TSL compositor on
        // native WebGPU (causes a "super white mask" on day restore), so there we
        // drive the BackgroundUniform via setTheme(). But on the WebGL2 backend
        // (the §PERF fallback most prod sessions run) the pipeline never builds a
        // BackgroundUniform — setTheme() is a SILENT no-op — so we MUST paint
        // scene.background + the renderer clear-color directly, otherwise NIGHT
        // mode leaves the viewport stuck WHITE. The old `if (rpm) {…} else {…}`
        // branch always took the WebGPU arm (rpm exists regardless of backend),
        // making the WebGL path unreachable. The resolver decides which path can
        // actually paint the colour for the live renderer.
        const rpm = window.renderPipelineManager; // TODO(D.4): replace with runtime.scene.renderPipeline — Phase D.4
        const webGpuUniformLive = rpm?.status?.webGpuActive === true;
        const bg = resolveNightBackground(this._isNight, webGpuUniformLive);

        if (bg.applyPath === 'webgpu-uniform' && rpm) {
            // Native WebGPU TSL pipeline — animate the background uniform.
            rpm.setTheme(this._isNight ? 'dark' : 'light');
        } else {
            // WebGL2 / pipeline-less path — paint scene.background AND the renderer
            // clear-color so the canvas is actually repainted by the OBC loop.
            const scene = this._getScene();
            if (scene) {
                if (this._savedBackground === undefined) this._savedBackground = scene.background;
                scene.background = this._isNight
                    ? new THREE.Color(bg.hex)
                    : (this._savedBackground ?? new THREE.Color(bg.hex));
            }
            try {
                const renderer = window.world?.renderer?.three as THREE.WebGLRenderer | undefined; // TODO(D.4): replace with runtime.scene.world — Phase D.4
                renderer?.setClearColor(new THREE.Color(bg.hex), 1);
            } catch {
                // PostproductionRenderer may override clear-color — scene.background
                // still provides the painted fallback.
            }
        }

        // Always update the viewport container's CSS background so the div behind
        // the canvas matches the rendered scene colour (not stuck at white) on
        // either backend.
        const vp = window.viewportContainer as HTMLElement | null;
        // §NIGHT-DARK-BLUE-BG (2026-06-11) — deep navy blue at night (must match
        // DARK_BG_HEX in renderer-three BackgroundUniform / SCENE_BG_DARK_HEX).
        if (vp) vp.style.background = bg.hex;

        // Light intensity: dim by 62% for night, restore to saved original for day.
        //
        // §FIX-LIGHT-NIGHT-CONTRIBUTION (2026-08-06) — this traversal is the
        // ENVIRONMENT dimmer: sun, ambient, hemisphere. It must NOT touch
        // artificial FIXTURE lights. It previously multiplied them by 0.38 too,
        // so "night" made the room's lamps 62% DIMMER — the exact opposite of
        // what night mode has to do to artificial light, and a direct
        // contributor to the black-room defect. Fixture lights carry
        // FIXTURE_LIGHT_ROLE and are owned by LightingFragmentBuilder /
        // LampBuilder, which apply FIXTURE_NIGHT_MULTIPLIER themselves.
        const scene = this._getScene();
        if (scene) {
            scene.traverse((obj: any) => {
                if (!obj.isLight) return;
                if (obj.userData?.role === FIXTURE_LIGHT_ROLE) return;
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

    /** §ISOLATE-ROOM-LABELS-PER-FLOOR — true while a single floor is isolated. */
    private _isFloorIsolated(): boolean {
        return this._activeLevelOnly || this._levelMode === 'solo';
    }

    /**
     * §ROOM-LABELS-TOGGLE (2026-06-10) / §ISOLATE-ROOM-LABELS-PER-FLOOR (2026-06-26)
     * — flips the 3D room-name sprite labels on/off.
     *
     * DEFAULT (no floor isolated): global flip via
     * RoomLabelRenderer.setRoomLabelsVisible() — the single owner of the sprites,
     * so future labels honour the flag too. Falls back to a direct scene traverse
     * of `userData.type === 'room-label'` sprites if the renderer instance is not
     * yet on window. Does NOT touch the 2D plan-view room tags.
     *
     * WHILE A FLOOR IS ISOLATED: the button drives ONLY the isolated level's
     * labels (setRoomLabelsVisibleForLevel) — the founder's request. Other
     * storeys' labels are already hidden by the isolation filter and must stay
     * hidden; flipping the GLOBAL flag here would wrongly reveal them. The global
     * flag is left untouched so clearing isolation restores the prior behaviour.
     */
    private _toggleRoomLabels(): void {
        const renderer = window.roomLabelRenderer; // §ROOM-LABELS-TOGGLE — set in initBuilders

        if (this._isFloorIsolated()) {
            // Scope the toggle to the isolated floor only.
            this._isolatedLevelLabelsVisible = !this._isolatedLevelLabelsVisible;
            const activeLevelId = this._getActiveLevelId();
            if (activeLevelId) {
                if (renderer?.setRoomLabelsVisibleForLevel) {
                    renderer.setRoomLabelsVisibleForLevel(activeLevelId, this._isolatedLevelLabelsVisible);
                } else {
                    // Fallback: flip only the isolated level's label sprites directly.
                    const scene = this._getScene();
                    if (scene) this._stampAnnotationLevelTags(scene);
                    scene?.traverse((obj: any) => {
                        if (obj.userData?.type === 'room-label'
                            && String(obj.userData?.levelId ?? '') === activeLevelId) {
                            obj.visible = this._isolatedLevelLabelsVisible;
                        }
                    });
                }
            }
            this._render();
            return;
        }

        this._roomLabelsVisible = !this._roomLabelsVisible;
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
        if (this._activeLevelOnly) {
            this._enterRoomLabelIsolation();
        } else {
            this._exitRoomLabelIsolation();
        }
        this._applySceneVisibilityFilters();
        this._render();
    }

    /**
     * §ISOLATE-ROOM-LABELS-PER-FLOOR — on floor isolate: remember the
     * pre-isolation GLOBAL room-label flag, then scope subsequent toggling to the
     * isolated floor only. The isolation scene-filter already hides every OTHER
     * storey's label sprite (§FLOOR-ISOLATE-ROOMTAG), so by default ONLY the
     * isolated floor's labels remain — and they inherit the current global
     * on/off state (we never surprise the user by forcing labels back on if they
     * had hidden them). The per-floor toggle starts from that same state.
     */
    private _enterRoomLabelIsolation(): void {
        if (this._roomLabelsVisibleBeforeIsolate === null) {
            this._roomLabelsVisibleBeforeIsolate = this._roomLabelsVisible;
        }
        // Per-floor toggle seeds from the global label state, then diverges.
        this._isolatedLevelLabelsVisible = this._roomLabelsVisible;
        const activeLevelId = this._getActiveLevelId();
        const renderer = window.roomLabelRenderer;
        if (activeLevelId && renderer?.setRoomLabelsVisibleForLevel) {
            renderer.setRoomLabelsVisibleForLevel(activeLevelId, this._isolatedLevelLabelsVisible);
        }
    }

    /**
     * §ISOLATE-ROOM-LABELS-PER-FLOOR — on isolation clear: restore the remembered
     * pre-isolation room-label visibility (the prior GLOBAL behaviour), undoing
     * any per-floor toggling done while isolated.
     */
    private _exitRoomLabelIsolation(): void {
        const prior = this._roomLabelsVisibleBeforeIsolate;
        this._roomLabelsVisibleBeforeIsolate = null;
        this._isolatedLevelLabelsVisible = true;
        if (prior === null) return;
        this._roomLabelsVisible = prior;
        const renderer = window.roomLabelRenderer;
        if (renderer?.setRoomLabelsVisible) {
            renderer.setRoomLabelsVisible(prior);
        }
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
        const _prevCutMode = this._wallCutMode;
        this._wallCutMode = 'up';
        // §WALL-CUTAWAY-XRAY — restore wall transparency if cutaway (x-ray) was on.
        this._applyWallCutawayXray(false);
        this._applyWallCutawayClipping();
        // §DIAG-CUTAWAY-RESTORE — a reset FROM the Low-Height (clipping) state must
        // re-cut every wall's openings, same as the explicit toggle-back. Cutaway
        // is now x-ray and never carved openings, so it needs no opening re-cut.
        if (_prevCutMode === 'down') this._restoreWallOpeningsAfterCutaway('down');
        this._restoreLevelTransforms();
        for (const [obj, visible] of this._originalVisibility) obj.visible = visible;
        this._originalVisibility.clear();
        // §CEILING-HIDDEN-IN-3D (2026-06-24) — "Reset view" clears every override
        // but the 3D ceiling-hide is a default, not an override: re-apply it so a
        // reset while in the 3D view leaves the interior visible (ceilings stay
        // hidden). No-op in plan views or when the user toggled the hide off.
        if (this._view3DActive && this._hideCeilingsIn3D) this._applySceneVisibilityFilters();
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

    // §CEILING-HIDDEN-IN-3D (2026-06-24) — a scene object is a ceiling when its
    // userData is stamped by CeilingPanelBuilder (elementType/type === 'ceiling').
    // Matches the same tag LevelExplodeController._isCeilingRoot uses, so the
    // 3D-view default-hide and the explode-hide agree on what a ceiling is.
    private _isCeilingObject(obj: any): boolean {
        const type = String(obj.userData?.elementType ?? obj.userData?.type ?? '').toLowerCase();
        return type === 'ceiling';
    }

    private _wallVisibleInMode(obj: any): boolean {
        if (!this._isWallObject(obj)) return true;
        // §WALL-CUTAWAY-XRAY — 'cutaway' is now an x-ray transparency effect (see
        // _applyWallCutawayXray): walls stay VISIBLE, just see-through, so the
        // active-level filter must NOT hide them. 'up' = full opaque walls (no
        // hide). Only 'down' (Wall Low-Height clipping) hides the wall body.
        return this._wallCutMode !== 'down';
    }

    private _applySceneVisibilityFilters(): void {
        const scene = this._getScene();
        if (!scene) return;
        // §FLOOR-ISOLATE-ROOMTAG (2026-06-24) — room-NAME labels are THREE.Sprites
        // carrying only `userData.roomId` + `userData.type='room-label'` (no
        // `id`/`levelId`/`storeyName`), so `_isBimObject` rejected them and the
        // active-level / solo isolation traverse below SKIPPED them entirely —
        // every storey's room tags stayed visible on the isolated floor. Stamp
        // `userData.levelId` from the room store FIRST (same pre-pass the level
        // explode/stack path uses) so labels enter the SAME per-level bucket the
        // walls/floors use and hide/restore with their storey. Pure visual tag.
        this._stampAnnotationLevelTags(scene);
        const activeLevelId = this._getActiveLevelId();
        scene.traverse((obj: any) => {
            if (!this._isBimObject(obj)) return;
            this._rememberVisibility(obj);
            let visible = this._originalVisibility.get(obj) ?? obj.visible;
            if ((this._activeLevelOnly || this._levelMode === 'solo') && activeLevelId) visible = visible && this._objectLevelId(obj) === activeLevelId;
            if (this._elementsInViewOnly && obj.userData?.id) visible = visible && this._visibleElementIds.has(String(obj.userData.id));
            visible = visible && this._wallVisibleInMode(obj);
            // §CEILING-HIDDEN-IN-3D (2026-06-24) — hide ceiling roots while the 3D
            // view is active (default-on, toggle-able) so they don't cap the rooms
            // and block the interior layout. Visibility is recomputed from the
            // captured original each pass, so switching to a plan view (where
            // _view3DActive is false) restores the ceiling on the next filter run.
            if (this._view3DActive && this._hideCeilingsIn3D && this._isCeilingObject(obj)) visible = false;
            obj.visible = visible;
        });
        this._applyRegistryLevelIsolation(activeLevelId);
        this._invalidateSelectionCache();
    }

    /**
     * §ISOLATE-ALL-ELEMENTS-WIRED (2026-06-26) — single-source-of-truth pass that
     * corrects the per-level isolation decision for EVERY registered element
     * root, on top of the raw scene-traverse above.
     *
     * WHY: the traverse keys isolation on a single stamped `userData.levelId`.
     * That (a) silently drops any element type whose root failed to stamp a
     * levelId, and (b) WRONGLY hides span elements — a stair / lift (and its
     * railing / handrail) physically crosses base→top, so isolating the TOP
     * level must keep it visible even though its primary `levelId` is the base.
     * The founder's "stair shows but railing missing on Ground Floor" is this
     * class of bug.
     *
     * The resolver enumerates `elementRegistry.getAllRoots()` (the one place
     * every Create-command / builder registers its root) so coverage is by construction —
     * a new element type that registers a root is isolated automatically. We only
     * RE-decide elements that the resolver places, and only while a single floor
     * is isolated; the ceiling-in-3D hide and elements-in-view filters still win
     * (we never force-show something those hid). Pure `.visible` writes — no
     * store/registry mutation.
     */
    private _applyRegistryLevelIsolation(activeLevelId: string | null): void {
        if (!this._isFloorIsolated() || !activeLevelId) return;
        const decisions = resolveLevelIsolation(activeLevelId);
        for (const d of decisions) {
            const root = d.root as THREE.Object3D;
            this._rememberVisibility(root);
            const base = this._originalVisibility.get(root) ?? root.visible;
            // Start from the captured original, AND the isolation decision.
            let visible = base && d.visibleInIsolation;
            // Preserve the other independent filters that may hide this root.
            visible = visible && this._wallVisibleInMode(root);
            if (this._elementsInViewOnly && root.userData?.id) {
                visible = visible && this._visibleElementIds.has(String(root.userData.id));
            }
            if (this._view3DActive && this._hideCeilingsIn3D && this._isCeilingObject(root)) visible = false;
            root.visible = visible;
        }
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

    private _buildLevelRootMap(): Array<{
        level: LevelInfo;
        index: number;
        roots: THREE.Object3D[];
        /** GR-10 / C75 §1.4 — false when `level.childrenIds` was never recorded:
         *  the roots below came ONLY from scene tags, so an under-count is
         *  possible and the §LEVEL-STACK diag says so instead of silently
         *  treating the level as childless. */
        childrenRecorded: boolean;
    }> {
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
                // GR-10 / C75 §1.4 — `level.childrenIds ?? []` read "this level's
                // children were never recorded" as "this level has no children".
                // The two facts diverge observably here: with an UNRECORDED list
                // the roots come solely from scene tags (an under-count is
                // possible — exactly the "left behind at ground level" class this
                // method's own comments document), so the entry says so and the
                // §LEVEL-STACK diag prints it.
                const childIds = relationshipArrayOrUnknown<unknown>(level.childrenIds);
                if (childIds !== null) {
                    for (const id of childIds) {
                        const obj = objectById.get(String(id));
                        if (obj) roots.add(obj);
                    }
                }
                // Always merge in level-tagged objects (id-less instanced groups etc.),
                // not only as a zero-roots fallback.
                if (level.id) {
                    for (const obj of byLevel.get(String(level.id)) ?? []) roots.add(obj);
                }
                return {
                    level,
                    index,
                    roots: dropDescendants(Array.from(roots)),
                    childrenRecorded: childIds !== null,
                };
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
            // GR-10 — an unrecorded child list is SAID, not silently absorbed:
            // the roots for such a level are scene-tag-only and may under-count.
            diag.push(
                `${group.level.name ?? group.level.id ?? `#${group.index}`}=${group.roots.length}` +
                `(rm${rooms}+lbl${labels}+fur${furniture})` +
                (group.childrenRecorded ? '' : ' [childrenIds UNRECORDED — scene-tag roots only]'),
            );
        }
        console.log(`[§LEVEL-STACK] ${this._levelMode}: offset roots per level — ${diag.join(', ')} (total ${this._levelOriginalY.size}; rooms ${totalRooms}, labels ${totalLabels}, furniture ${totalFurniture})`);
        this._startLevelAnimation();
    }

    /**
     * §LEVEL-STACK-LOCKS-VIEW-Y (L-1010) — the VIEW-ONLY Y offset this menu's
     * level-stack explode is currently applying to `obj` (or to the nearest
     * tracked ancestor of `obj`). 0 when collapsed.
     *
     * WHY THIS EXISTS: the explode is a pure view transform, but anything that
     * LATCHES `position.y` as a durable value — `LevelPlaneConstraint` above all —
     * must be able to subtract it. `LevelExplodeController` already publishes the
     * same number via `window.pryzmLevelExplodeOffsetForObject`, but that one
     * reports 0 whenever inspect mode is inactive, which is precisely the founder's
     * flow (he used THIS button, not the inspect panel). Two rival explode owners
     * and only one of them answering the oracle is how a real offset got reported
     * as no offset. This menu now answers for its own.
     */
    getLevelExplodeOffsetForObject(obj: THREE.Object3D | null | undefined): number {
        if (!obj || this._levelOriginalY.size === 0) return 0;
        for (let cur: THREE.Object3D | null = obj; cur; cur = cur.parent) {
            const base = this._levelOriginalY.get(cur);
            if (base === undefined) continue;
            const target = this._levelTargetY.get(cur);
            return target === undefined ? 0 : target - base;
        }
        return 0;
    }

    private _restoreLevelTransforms(): void {
        // D.7.5 batch #3: dispose the FrameScheduler tick listener.
        if (this._raf !== null) { this._raf(); this._raf = null; }
        // §LEVEL-STACK-COUNT-IS-NOT-PROOF (L-1012) — this used to print one number,
        // "restored N", and the founder's log balanced at 340/340 while an element
        // was demonstrably still in the wrong place. A single total cannot be wrong,
        // which is exactly what makes it useless: this map holds every root captured
        // at explode time, INCLUDING roots a rebuild has since detached from the
        // scene. Writing `position.y` on a detached Object3D changes nothing anybody
        // can see, yet it incremented the count. Split the tally so a collapse that
        // restored mostly ghosts SAYS so, and drop the ghosts instead of leaking
        // them into the next explode.
        let live = 0, stale = 0, rooms = 0, labels = 0, furniture = 0;
        const scene = this._getScene();
        const attached = (o: THREE.Object3D): boolean => {
            if (!scene) return true; // cannot tell — do not claim either way
            for (let cur: THREE.Object3D | null = o; cur; cur = cur.parent) if (cur === scene) return true;
            return false;
        };
        for (const [obj, y] of this._levelOriginalY) {
            obj.position.y = y;
            if (attached(obj)) live++; else { stale++; continue; }
            const ud = (obj as any).userData ?? {};
            if (ud.type === 'room-label') labels++;
            else if (ud.elementType === 'Furniture' || ud.furnitureType) furniture++;
            else if (ud.isRoomOverlay || ud.isRoomVolume || ud.elementType === 'room') rooms++;
        }
        console.log(
            `[§LEVEL-STACK] collapse: restored ${live} LIVE root Y positions ` +
            `(rooms ${rooms}, labels ${labels}, furniture ${furniture})` +
            (stale > 0
                ? ` — plus ${stale} STALE root(s) detached by a rebuild since the explode; ` +
                  `their restore was a no-op and their live replacements were never lifted ` +
                  `(see L-1013). Total captured ${this._levelOriginalY.size}.`
                : ''),
        );
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
