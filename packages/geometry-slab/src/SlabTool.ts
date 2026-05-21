import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import * as BUI from '@thatopen/ui';
import { CreateSlabCommand } from '@pryzm/command-registry';
// W3 FIX §01 §2.4: Static import replaces dynamic import().then() to eliminate
// the async race where UpdateSlabLayersCommand could fire after an undo.
import { UpdateSlabLayersCommand } from '@pryzm/command-registry';
// §11-SLAB-PROFILE-EDIT-CONTRACT: Profile edit mode dependencies.
import { UpdateSlabPolygonCommand } from '@pryzm/command-registry';
import { SlabProfileEditor } from './SlabProfileEditor.js';
// §11 §1.4: Sketch degradation imports.
import { HostReferenceEdge, FreeLineEdge, SketchEdge } from './SketchTypes.js';
import { WallFaceResolver } from './WallFaceResolver.js';
import { VisualStyle } from '@pryzm/core-app-model/material-library';
import { projectContext } from '@pryzm/core-app-model';
import { DimensionPreview } from '@pryzm/geometry-wall';
import { SlabPickWallsController } from './SlabPickWallsController.js';
import { snapToAxisOrDiagonal } from './SlabSnapUtils.js';
// DOC-5.3 — Direct 2D element creation in plan view (unified coordinate resolver)
import { planView2DCreationMode } from '@pryzm/core-app-model';

export interface SlabToolCallbacks {
    applyHighlight: (obj: THREE.Object3D) => void;
    updateInspector: (obj: THREE.Object3D) => void;
    zoomToAll: () => Promise<void>;
    getHdriTexture: () => Promise<THREE.Texture | null>;
    getCurrentVisualStyle: () => VisualStyle;
}

/**
 * Legacy in-tree slab tool (PRYZM 1 layout).  The spec moves this to a
 * stand-alone plugin in Phase E.2 (`15-subphases-E-families.md` row E.2).
 *
 * @deprecated TODO(E.2) — replaced by `plugins/slab/src/tool.ts`.  The
 *   plugin scaffold exists (`plugins/slab/{src,__tests__,package.json,
 *   tsconfig.json}`) but bus-dispatch wiring is incomplete (verify with
 *   `rg "runtime\.bus\.executeCommand" plugins/slab/src/`).  Deletion of
 *   this file is gated on E-bus.1 (S79) retiring the **4 residual
 *   `commandManager.execute` reaches** in this file (CreateSlabCommand,
 *   UpdateSlabLayersCommand, UpdateSlabPolygonCommand, UpdateSlabCommand).
 *   Migration order:
 *     1. E-finish.0.A: thread `runtime` into `ToolsPanelController` so
 *        the slab tool button activates via runtime (currently the slab
 *        family is NOT registered in `Layout.ts:481-540` — instead the
 *        slab tool is passed as `slabTool: props.slabTool` to
 *        `ToolsPanelController`, a Phase B legacy path).  Add
 *        `runtime.tools.register('slab', mode => service.activateSlabTool(mode))`
 *        to `Layout.ts` first.
 *     2. E-bus.1: bind `slab.create`, `slab.update-layers`, `slab.update-polygon`,
 *        `slab.update` handlers in `plugins/slab/src/handlers/` and replace
 *        each of the 4 `commandManager.execute(...)` reaches in this file
 *        with `runtime.bus.executeCommand('slab.<verb>', ...)`.
 *     3. E-finish.2 (E.2 lane): delete `src/elements/slabs/` +
 *        `src/commands/slabs/` once `rg "elements/slabs|commands/slabs" src/`
 *        returns 0 hits.
 *   See `docs/03_PRYZM3/00_NEW_ARCHITECTURE/phases/audits/PHASES-A-F-RECONCILIATION-2026-04-29/05-phase-E-audit-and-plan.md`.
 */

/**
 * FIX-6 §03 §2.2 / §01 §3.5 — Dependency injection contract.
 *
 * All previously-window.* accessed dependencies in SlabTool are now resolved
 * through this interface. Getter functions are used instead of direct values so
 * that EngineBootstrap can pass them before the targets are fully initialised
 * (the closures are evaluated lazily at first call, not at construction time).
 *
 * getCommandManager    — CommandManager for all command execution.
 * getSlabStore         — SlabStore for read-only data access in public methods.
 * getSlabBuilder       — SlabFragmentBuilder for post-creation root lookup.
 * getSlabSystemTypeStore — SlabSystemTypeStore for pending-type application.
 * getBimManager        — BimManager for level elevation resolution.
 * getWallTool          — WallTool for createWallsFromSlab utility.
 */
export interface SlabToolDeps {
    getCommandManager?:       () => any;
    getSlabStore?:            () => any;
    getSlabBuilder?:          () => any;
    getSlabSystemTypeStore?:  () => any;
    getBimManager?:           () => any;
    getWallTool?:             () => any;
    /**
     * FIX-6 §01 §3.5: Replaces window.unselectAll?.() at every
     * enter*Mode() call site. Clears the current selection before the tool
     * captures pointer events, preventing stale selection state.
     */
    getUnselectAll?:          () => (() => void) | undefined;
    /**
     * M1 §SLAB-SYSTEM-AUDIT-2026: Replaces window.fastPathProjectorService
     * reads in clearSketch() and _updatePreviewSurface().
     */
    getFastPathProjectorService?: () => any;
    /** Sprint Y dep-inversion: factory for SlabDimensionsEditor (UI layer — not importable from packages). */
    createDimensionsEditor?: (deps: { getSlabStore?: () => any; getCommandManager?: () => any }) => any;
}

export class SlabTool {
    private world: OBC.World;
    private components: OBC.Components;
    private callbacks: SlabToolCallbacks;

    /** FIX-6: Injected dependencies — replaces all window.* reads in this class. */
    private _deps: SlabToolDeps = {};

    private isSketching = false;
    private activeTool: 'NONE' | 'FLOOR_SKETCH' | 'REGION_SLAB' | 'POLYLINE_SLAB' | 'HOLLOW_SLAB' = 'NONE';
    private currentPointerListeners: (() => void) | null = null;

    private polylineData = {
        points: [] as THREE.Vector3[],
        previewLine: null as THREE.Line | null,
        closingLinePreview: null as THREE.Line | null,   // I4: closing edge ghost line
        previewFillMesh: null as THREE.Mesh | null,       // I5: translucent fill polygon
        markers: [] as THREE.Mesh[]
    };

    private dimensionPreview: DimensionPreview | null = null;

    private regionPreview: THREE.Mesh | null = null;
    private wallStore: any = null;
    private pickWallsController: SlabPickWallsController | null = null;

    private regionDetection = {
        candidatePolygon: null as THREE.Vector2[] | null,
        active: false
    };

    private floorSketch = {
        firstPoint: null as THREE.Vector3 | null,
        secondPoint: null as THREE.Vector3 | null,
        holeFirstPoint: null as THREE.Vector3 | null,
        holeSecondPoint: null as THREE.Vector3 | null,
        firstPointMesh: null as THREE.Mesh | null,
        // O2-FIX: THREE.LineLoop is unsupported by the WebGPU TSL renderer — use
        // THREE.Line with a closed geometry (first vertex repeated at end of corners[]).
        previewRect: null as THREE.Line | null,
        previewSurface: null as THREE.Mesh | null,
        previewHoleRect: null as THREE.Line | null,
        awaitingConfirmation: false
    };

    public slabWidth = 6;
    public slabDepth = 6;
    public currentSlab: THREE.Object3D | null = null;

    /**
     * System type selected in the pre-draw panel — applied after creation.
     * Pre-set to the RC Monolithic 200mm type (the universal structural default).
     * Matches the same "sensible default on activation" principle used by
     * DoorTool (Solid Timber) and WindowTool (Timber Casement).
     * Never reset by clearSketch() or cleanupSketchMode() — persists across
     * all drawing sessions within the same tool lifetime.
     */
    private pendingSystemTypeId: string | undefined = 'st-monolithic-rc-200';

    // ── I2: Axis/angle snap state ─────────────────────────────────────────
    /** True while the Shift key is held — disables axis/angle snap. */
    private shiftPressed = false;
    /** Cleanup handles for the Shift key listeners attached in enterPolylineMode. */
    private _onShiftDown: ((e: KeyboardEvent) => void) | null = null;
    private _onShiftUp:   ((e: KeyboardEvent) => void) | null = null;
    /** §11 §2.6: Enter key handler — confirms slab when #confirm-btns is visible. */
    private _onEnterKey:  ((e: KeyboardEvent) => void) | null = null;

    // ── I3: Double-click detection ────────────────────────────────────────
    /**
     * Timestamp (ms) of the most recent POLYLINE_SLAB pointerdown.
     * Two clicks within 300 ms are treated as a double-click → close polygon.
     * Reset to 0 in clearSketch() so a new drawing session starts fresh.
     */
    private _lastPolylineClickTime = 0;

    // ── §11 Profile Edit Mode (Phases 4 + 5) ─────────────────────────────
    /**
     * The interactive vertex-drag handle overlay for post-creation slab editing.
     * Lazily created on first `enterProfileEditMode()` call and reused thereafter.
     * §11-SLAB-PROFILE-EDIT-CONTRACT §2.1
     */
    private profileEditor: SlabProfileEditor | null = null;
    /** True while the profile edit overlay is active on screen. */
    private isInProfileEditMode = false;
    /** ID of the slab currently being edited in profile edit mode. */
    private profileEditSlabId: string | null = null;

    /**
     * Floating Width/Depth input panel for FLOOR_SKETCH slabs (Mode A).
     * Lazily created on first Mode A double-click and reused thereafter.
     * §11 §1.2 Mode A — Rectangular Dimension Editor
     * §11 §4.4 Property Panel — Dimension Edit
     */
    private dimensionsEditor: any | null = null;

    /** Called by the pre-draw panel when the user picks a slab type. */
    setSystemTypeId(id: string | undefined): void {
        this.pendingSystemTypeId = id;
    }

    getSystemTypeId(): string | undefined {
        return this.pendingSystemTypeId;
    }

    constructor(
        world: OBC.World,
        components: OBC.Components,
        _container: HTMLElement,
        callbacks: SlabToolCallbacks,
        deps: SlabToolDeps = {}
    ) {
        this.world = world;
        this.components = components;
        this.callbacks = callbacks;
        this._deps = deps;

        if (this.world.renderer) {
            this.dimensionPreview = new DimensionPreview(
                this.world.scene.three as THREE.Scene,
                this.world.camera.three,
                this.world.renderer.three.domElement as HTMLCanvasElement
            );
        }
    }

    public setWallStore(store: any) {
        this.wallStore = store;
    }

    /**
     * Late-bind dependency injections that were not available at construction time.
     * Called by EngineBootstrap after slabStore, slabBuilder, slabSystemTypeStore,
     * commandManagerRef, and wallTool are all fully initialised.
     */
    public setDeps(deps: Partial<SlabToolDeps>): void {
        this._deps = { ...this._deps, ...deps };
    }

    /**
     * W7 FIX §02 §1.3: Resolve level elevation for preview geometry placement.
     * Replaces all `level?.elevation ?? 0` silent fallback patterns.
     * Returns the authoritative elevation from BimManager, or logs an explicit
     * error and returns 0 as a last resort (preview-only — not stored semantically).
     */
    private resolveElevationForPreview(levelId: string): number {
        // FIX-6: resolved from injected deps, not from window.bimManager.
        const bimManager = this._deps.getBimManager?.();
        const level = bimManager?.getLevelById(levelId);
        if (!level) {
            console.error(
                `[SlabTool] §02 §1.3: Level "${levelId}" not found in BimManager. ` +
                `Preview geometry will be placed at Y=0. This is a preview-only fallback — ` +
                `no semantic data is affected.`
            );
            return 0;
        }
        return level.elevation;
    }

    get isActive(): boolean {
        return this.isSketching;
    }

    get toolMode(): 'NONE' | 'FLOOR_SKETCH' | 'REGION_SLAB' | 'POLYLINE_SLAB' | 'HOLLOW_SLAB' {
        return this.activeTool;
    }

    private clearSketch(): void {
        // M1 §SLAB-SYSTEM-AUDIT-2026: Use injected dep; window global is the legacy fallback.
        (this._deps.getFastPathProjectorService?.() ?? window.fastPathProjectorService)?.clearFastPath();
        // §11 Phase 4: Exit profile edit mode before clearing sketch state.
        // This ensures handles are disposed and the HUD is removed when a new
        // drawing session starts or the slab tool is deactivated.
        if (this.isInProfileEditMode) {
            this.exitProfileEditMode();
        }
        // §11 Phase 5: Also dismiss the Mode A dimension edit panel if it is open.
        this._hideDimensionEditPanel();
        this._lastPolylineClickTime = 0; // I3: reset double-click timer for next session
        this.clearPolyline();
        if (this.dimensionPreview) {
            this.dimensionPreview.hide();
        }
        if (this.regionPreview) {
            this.regionPreview.geometry.dispose();
            (this.regionPreview.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.regionPreview);
            this.regionPreview = null;
        }

        if (this.floorSketch.firstPointMesh) {
            this.floorSketch.firstPointMesh.geometry.dispose();
            (this.floorSketch.firstPointMesh.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.floorSketch.firstPointMesh);
            this.floorSketch.firstPointMesh = null;
        }

        if (this.floorSketch.previewRect) {
            this.floorSketch.previewRect.geometry.dispose();
            (this.floorSketch.previewRect.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.floorSketch.previewRect);
            this.floorSketch.previewRect = null;
        }

        if (this.floorSketch.previewSurface) {
            this.floorSketch.previewSurface.geometry.dispose();
            (this.floorSketch.previewSurface.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.floorSketch.previewSurface);
            this.floorSketch.previewSurface = null;
        }

        if (this.floorSketch.previewHoleRect) {
            this.floorSketch.previewHoleRect.geometry.dispose();
            (this.floorSketch.previewHoleRect.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.floorSketch.previewHoleRect);
            this.floorSketch.previewHoleRect = null;
        }

        this.floorSketch.firstPoint = null;
        this.floorSketch.secondPoint = null;
        this.floorSketch.holeFirstPoint = null;
        this.floorSketch.holeSecondPoint = null;
        this.floorSketch.awaitingConfirmation = false;
    }

    private async createSlabFromPolygon(polygon: THREE.Vector2[], dimensions?: { width: number, depth: number }, holes?: THREE.Vector2[][]): Promise<void> {
        // FIX-6: commandManager resolved from injected deps, not from window.commandManager.
        const commandManager = this._deps.getCommandManager?.();
        if (!commandManager) return;

        // FIX-6: projectContext is a module-level singleton import — use it directly.
        // Removed the window.projectContext fallback pattern.
        const levelId = projectContext.activeLevelId;

        // W5 FIX §2.6: Pre-generate the slab ID in the tool and inject it into the
        // command payload. This guarantees ID stability across execute/undo/redo cycles.
        // C2 FIX §2.6: Pre-generate the IFC GUID here so it is stable on redo.
        // The command uses this value directly — no crypto.randomUUID() inside execute().
        const slabId   = crypto.randomUUID();
        const ifcGuid  = crypto.randomUUID();

        // §02 §1.2: position.y = 0 — the builder resolves worldY from BimManager.
        const payload = {
            id: slabId,
            ifcGuid,
            width: dimensions?.width ?? 0,
            depth: dimensions?.depth ?? 0,
            thickness: 0.2,
            position: { x: 0, y: 0, z: 0 },
            levelId: levelId,
            polygon: polygon.map(p => ({ x: p.x, y: p.y })),
            holes: holes ? holes.map(h => h.map(p => ({ x: p.x, y: p.y }))) : undefined
        };

        const command = new CreateSlabCommand(payload);
        // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('slab.update', {}).catch(() => {}); }
        const result = commandManager.execute(command);
        if (result.success) {
            // W6 FIX §02 §6.1: Use the builder's proper getRootById() API instead of
            // accessing the internal slabRoots Map directly.
            // FIX-6: resolved from injected deps, not from window.slabBuilder.
            const builder = this._deps.getSlabBuilder?.();
            if (builder) {
                this.currentSlab = builder.getRootById(slabId) ?? null;
            }

            // If the user pre-selected a slab system type, apply its layers immediately
            // after creation via the dedicated UpdateSlabLayersCommand (§01 §2.1).
            // W3 FIX §01 §2.4: Synchronous — no dynamic import().then() race condition.
            // FIX-6: resolved from injected deps, not from window.slabSystemTypeStore.
            if (this.pendingSystemTypeId) {
                const typeStore = this._deps.getSlabSystemTypeStore?.();
                const slabType = typeStore?.getById?.(this.pendingSystemTypeId);
                if (slabType && Array.isArray(slabType.layers) && slabType.layers.length > 0) {
                    const layersCmd = new UpdateSlabLayersCommand({
                        slabId,
                        systemTypeId: this.pendingSystemTypeId!,
                        layers: structuredClone(slabType.layers),
                        thickness: slabType.totalThickness,
                    });
                    // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
                    if (window.runtime?.bus) { window.runtime.bus.executeCommand('slab.update', {}).catch(() => {}); }
                    commandManager.execute(layersCmd);
                }
            }
        }
    }

    private updatePreviewRect(p2: THREE.Vector3): void {
        if (!this.floorSketch.firstPoint) return;

        const levelId = projectContext.activeLevelId;
        // W7 FIX §02 §1.3: Explicit fallback with error log — no silent ?? 0.
        const elevation = this.resolveElevationForPreview(levelId);

        const p1 = this.floorSketch.firstPoint;

        if (this.activeTool === 'HOLLOW_SLAB' && this.floorSketch.holeFirstPoint) {
            const h1 = this.floorSketch.holeFirstPoint;
            const corners = [
                new THREE.Vector3(h1.x, elevation + 0.02, h1.z),
                new THREE.Vector3(h1.x, elevation + 0.02, p2.z),
                new THREE.Vector3(p2.x, elevation + 0.02, p2.z),
                new THREE.Vector3(p2.x, elevation + 0.02, h1.z),
                new THREE.Vector3(h1.x, elevation + 0.02, h1.z)
            ];

            if (!this.floorSketch.previewHoleRect) {
                const geo = new THREE.BufferGeometry().setFromPoints(corners);
                const mat = new THREE.LineBasicMaterial({ color: 0xff0000, depthTest: false, linewidth: 2 });
                this.floorSketch.previewHoleRect = new THREE.Line(geo, mat);
                this.floorSketch.previewHoleRect.userData.isPreview = true;
                this.world.scene.three.add(this.floorSketch.previewHoleRect);
            } else {
                this.floorSketch.previewHoleRect.geometry.setFromPoints(corners);
            }
            return;
        }

        const corners = [
            new THREE.Vector3(p1.x, elevation, p1.z),
            new THREE.Vector3(p1.x, elevation, p2.z),
            new THREE.Vector3(p2.x, elevation, p2.z),
            new THREE.Vector3(p2.x, elevation, p1.z),
            new THREE.Vector3(p1.x, elevation, p1.z)
        ];

        if (this.dimensionPreview) {
            // Preview dimension for the second segment (width/depth)
            const dimPoint = new THREE.Vector3(p1.x, elevation, p2.z);
            this.dimensionPreview.update(p1, dimPoint, this.world.camera.three);
        }

        if (!this.floorSketch.previewRect) {
            const geo = new THREE.BufferGeometry().setFromPoints(corners);
            const mat = new THREE.LineBasicMaterial({
                color: 0x007bff,
                depthTest: false,
                linewidth: 2
            });
            this.floorSketch.previewRect = new THREE.Line(geo, mat);
            this.floorSketch.previewRect.userData.isPreview = true;
            this.world.scene.three.add(this.floorSketch.previewRect);
        } else {
            this.floorSketch.previewRect.geometry.setFromPoints(corners);
        }
    }

    private showPreviewSurface(p1: THREE.Vector3, p2: THREE.Vector3): void {
        if (this.floorSketch.previewSurface) {
            this.floorSketch.previewSurface.geometry.dispose();
            (this.floorSketch.previewSurface.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.floorSketch.previewSurface);
        }

        const levelId = projectContext.activeLevelId;
        // W7 FIX §02 §1.3: Explicit fallback with error log — no silent ?? 0.
        const elevation = this.resolveElevationForPreview(levelId);

        const width = Math.abs(p2.x - p1.x);
        const depth = Math.abs(p2.z - p1.z);
        const centerX = (p1.x + p2.x) / 2;
        const centerZ = (p1.z + p2.z) / 2;

        const geo = new THREE.PlaneGeometry(width, depth);
        const mat = new THREE.MeshBasicMaterial({
            color: 0x007bff,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const surface = new THREE.Mesh(geo, mat);
        surface.rotation.x = -Math.PI / 2;
        surface.position.set(centerX, elevation + 0.01, centerZ);
        surface.userData.isPreview = true;
        this.world.scene.three.add(surface);
        this.floorSketch.previewSurface = surface;

        // M1 §SLAB-SYSTEM-AUDIT-2026: Use injected dep; window global is the legacy fallback.
        const _fastSvc = this._deps.getFastPathProjectorService?.() ?? window.fastPathProjectorService;
        if (_fastSvc) {
            _fastSvc.project(surface, this.world.camera.three);
        }
    }

    private async confirmSlabCreation(): Promise<void> {
        if (this.activeTool === 'FLOOR_SKETCH' || this.activeTool === 'HOLLOW_SLAB') {
            const p1 = this.polylineData.points[0];
            const p2 = this.polylineData.points[2]; // Opposite corner in the 4-point rectangle
            if (!p1 || !p2) return;

            const width = Math.abs(p2.x - p1.x);
            const depth = Math.abs(p2.z - p1.z);
            const poly2D = this.polylineData.points.map(p => new THREE.Vector2(p.x, p.z));

            let holes: THREE.Vector2[][] | undefined;
            if (this.activeTool === 'HOLLOW_SLAB' && this.floorSketch.holeFirstPoint && this.floorSketch.holeSecondPoint) {
                const h1 = this.floorSketch.holeFirstPoint;
                const h2 = this.floorSketch.holeSecondPoint;
                holes = [[
                    new THREE.Vector2(h1.x, h1.z),
                    new THREE.Vector2(h1.x, h2.z),
                    new THREE.Vector2(h2.x, h2.z),
                    new THREE.Vector2(h2.x, h1.z)
                ]];
            }

            await this.createSlabFromPolygon(poly2D, { width, depth }, holes);
        } else if (this.activeTool === 'POLYLINE_SLAB') {
            const poly2D = this.polylineData.points.map(p => new THREE.Vector2(p.x, p.z));
            if (poly2D.length < 3) return;
            await this.createSlabFromPolygon(poly2D);
        } else if (this.activeTool === 'REGION_SLAB') {
            if (!this.regionDetection.candidatePolygon) return;
            await this.createSlabFromPolygon(this.regionDetection.candidatePolygon);
        }

        const root = this.currentSlab;

        // FIX-CONTINUOUS: Reset sketch state for the next slab instead of
        // tearing down the whole session.  The tool stays active (pointer
        // listeners intact, camera disabled, HUD visible) until the user
        // presses ESC or clicks ✕.
        this._resetForNextSlab();

        // Ensure highlight and inspector are updated AFTER reset.
        if (root) {
            this.callbacks.applyHighlight(root);
            this.callbacks.updateInspector(root);
        }
    }

    private cancelSlabCreation(): void {
        // FIX-CONTINUOUS: Reuse _resetForNextSlab so cancel also correctly resets
        // the HUD text for all modes (FLOOR_SKETCH, POLYLINE_SLAB, HOLLOW_SLAB).
        this._resetForNextSlab();
    }

    private async addRectanglePoint(point: THREE.Vector3): Promise<void> {
        const levelId = projectContext.activeLevelId;
        // W7 FIX §02 §1.3: Explicit fallback with error log — no silent ?? 0.
        const elevation = this.resolveElevationForPreview(levelId);

        const snappedPoint = point.clone();
        snappedPoint.y = elevation;

        if (this.activeTool === 'HOLLOW_SLAB' && this.polylineData.points.length === 4) {
            if (!this.floorSketch.holeFirstPoint) {
                this.floorSketch.holeFirstPoint = snappedPoint;
                const hudText = document.querySelector('#hud-step-text');
                if (hudText) hudText.innerHTML = 'Step 4: Click opposite corner of the hole';
            } else {
                this.floorSketch.holeSecondPoint = snappedPoint;
                const hudText = document.querySelector('#hud-step-text');
                if (hudText) hudText.innerHTML = 'Hollow Slab ready';
                const confirmBtns = document.getElementById('confirm-btns');
                if (confirmBtns) confirmBtns.style.display = 'flex';
            }
            return;
        }

        if (this.polylineData.points.length === 0) {
            // First point
            this.polylineData.points.push(snappedPoint);
            // FIX-PREVIEW: Set floorSketch.firstPoint so onPointerMove can drive
            // updatePreviewRect() in both 2D and 3D views.  Previously this was never
            // assigned, so the live-preview rectangle was never drawn.
            this.floorSketch.firstPoint = snappedPoint;

            const dotGeo = new THREE.SphereGeometry(0.15, 16, 16);
            const dotMat = new THREE.MeshBasicMaterial({ color: 0x007bff, depthTest: false });
            const dot = new THREE.Mesh(dotGeo, dotMat);
            dot.position.copy(snappedPoint);
            dot.userData.isPreview = true;
            this.world.scene.three.add(dot);
            this.polylineData.markers.push(dot);

            const hudText = document.querySelector('#hud-step-text');
            if (hudText) {
                hudText.innerHTML = 'Step 2: Click opposite corner';
            }
        } else {
            // Second point - create the rectangle points
            const p1 = this.polylineData.points[0];
            const p2 = snappedPoint;

            // Clear current points and markers (the first dot)
            this.clearPolyline();

            // Define rectangle corners in order
            const corners = [
                new THREE.Vector3(p1.x, elevation, p1.z),
                new THREE.Vector3(p1.x, elevation, p2.z),
                new THREE.Vector3(p2.x, elevation, p2.z),
                new THREE.Vector3(p2.x, elevation, p1.z)
            ];

            this.polylineData.points = corners;

            // Create a preview surface
            this.showPreviewSurface(p1, p2);

            const widthStr = Math.abs(p2.x - p1.x).toFixed(2);
            const depthStr = Math.abs(p2.z - p1.z).toFixed(2);
            const hudTextElement = document.querySelector('#hud-step-text');
            if (hudTextElement) {
                hudTextElement.innerHTML = `Preview: ${widthStr}m x ${depthStr}m`;
            }

            const confirmBtns = document.getElementById('confirm-btns');
            if (confirmBtns) confirmBtns.style.display = 'flex';

            if (this.activeTool === 'HOLLOW_SLAB') {
                const hudText = document.querySelector('#hud-step-text');
                if (hudText) hudText.innerHTML = 'Step 3: Click to set first corner of the hole';
                if (confirmBtns) confirmBtns.style.display = 'none';
            }
        }
    }

    private getPlanPoint(e: MouseEvent | PointerEvent | TouchEvent): THREE.Vector3 | null {
        let clientX: number, clientY: number;
        // Guard: TouchEvent is not defined on desktop browsers / non-touch environments.
        if (typeof TouchEvent !== 'undefined' && e instanceof TouchEvent) {
            if (e.touches.length === 1) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                return null;
            }
        } else {
            clientX = (e as MouseEvent).clientX;
            clientY = (e as MouseEvent).clientY;
        }

        const camera = this.world.camera.three;
        const canvas = this.world.renderer!.three.domElement;

        // ── DOC-5.3: 2D creation mode in plan view ────────────────────────────
        // PlanView2DCreationMode resolves the pointer through the DOC-5.2 snap
        // service first (endpoint / midpoint / perpendicular on projected wall edges),
        // then falls back to a ground-plane raycast at the correct level elevation.
        // This replaces the hardcoded Y=0 plane with the authoritative level Y.
        if (planView2DCreationMode.isInPlanView(camera)) {
            const levelId = projectContext.activeLevelId;
            const elevation = this.resolveElevationForPreview(levelId);
            return planView2DCreationMode.resolvePoint(clientX, clientY, camera, canvas, elevation);
        }

        // ── 3D view: existing OBC raycaster + Y=0 ground plane (unchanged) ───
        const rect = canvas.getBoundingClientRect();
        const x = ((clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((clientY - rect.top) / rect.height) * 2 + 1;

        const raycasterObj = this.components.get(OBC.Raycasters).get(this.world);
        const raycaster = (raycasterObj as any).three;
        const mouseVec = new THREE.Vector2(x, y);
        raycaster.setFromCamera(mouseVec, camera);

        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, target);
        return target;
    }

    private onPointerDown = async (e: PointerEvent): Promise<void> => {
        if (this.activeTool === 'NONE') return;

        e.preventDefault();

        if (this.activeTool === 'FLOOR_SKETCH' || this.activeTool === 'HOLLOW_SLAB') {
            const target = e.target as HTMLElement;
            if (target.setPointerCapture) {
                target.setPointerCapture(e.pointerId);
            }
            const point = this.getPlanPoint(e);
            if (!point) return;
            await this.addRectanglePoint(point);
        } else if (this.activeTool === 'REGION_SLAB') {
            const point = this.getPlanPoint(e);
            if (!point) return;

            this.updateRegionDetection(point);

            if (this.regionDetection.candidatePolygon) {
                await this.createSlabFromPolygon(this.regionDetection.candidatePolygon);
                // FIX-CONTINUOUS: Stay in region mode for the next click instead
                // of exiting — clear only the candidate so the next hover/click
                // can detect a fresh region.
                this.clearRegionPreview();
                this.regionDetection.candidatePolygon = null;
                if (this.currentSlab) {
                    this.callbacks.applyHighlight(this.currentSlab);
                    this.callbacks.updateInspector(this.currentSlab);
                }
            }
        } else if (this.activeTool === 'POLYLINE_SLAB') {
            const point = this.getPlanPoint(e);
            if (!point) return;

            // I3: Double-click detection via pointer timestamp.
            // Two pointerdown events within 300 ms → treat as double-click → close polygon.
            // This approach avoids the race between the native 'dblclick' event
            // (which fires after the second pointerdown) and the point-commit logic.
            const now = e.timeStamp;
            const elapsed = now - this._lastPolylineClickTime;
            this._lastPolylineClickTime = now;

            if (elapsed < 300 && this.polylineData.points.length >= 3) {
                // Do not add a stray point — close and commit instead.
                await this.confirmSlabCreation();
                return;
            }

            this.addPolylinePoint(point);
        }
    };

    private onPointerMove = (e: PointerEvent): void => {
        if (this.activeTool === 'NONE') return;

        e.preventDefault();

        // §SLAB-3D-PREVIEW (DAILY-USE 2026-05-21) — throttled probe so the
        // live log shows whether onPointerMove is firing AND in which tool
        // mode + whether the gating "first point set" guard short-circuits.
        // Throttled to 1 in 30 events to avoid log spam during cursor moves.
        // Architect reported "Preview for slab creation on 3d is not present
        // - doesnt render the preview". Two possibilities: (a) onPointerMove
        // never fires (event-listener gap); (b) the firstPoint / polyline
        // guard short-circuits before reaching the preview-render call.
        // Probe distinguishes the two.
        if (((this as { _slabPreviewProbeCount?: number })._slabPreviewProbeCount ?? 0) % 30 === 0) {
            console.log(
                `[SlabTool] §SLAB-3D-PREVIEW pointermove tool=${this.activeTool} ` +
                `firstPointSet=${!!this.floorSketch?.firstPoint} ` +
                `polylinePoints=${this.polylineData?.points?.length ?? 0}`,
            );
        }
        (this as { _slabPreviewProbeCount?: number })._slabPreviewProbeCount =
            ((this as { _slabPreviewProbeCount?: number })._slabPreviewProbeCount ?? 0) + 1;

        if (this.activeTool === 'FLOOR_SKETCH' || this.activeTool === 'HOLLOW_SLAB') {
            if (!this.floorSketch.firstPoint) return;
            const point = this.getPlanPoint(e);
            if (!point) return;
            this.updatePreviewRect(point);
        } else if (this.activeTool === 'POLYLINE_SLAB') {
            if (this.polylineData.points.length === 0) return;
            const point = this.getPlanPoint(e);
            if (!point) return;
            this.updatePolylinePreview(point);
        }
    };

    private addPolylinePoint(point: THREE.Vector3): void {
        const levelId = projectContext.activeLevelId;
        // W7 FIX §02 §1.3: Explicit fallback with error log — no silent ?? 0.
        const elevation = this.resolveElevationForPreview(levelId);

        const snappedPoint = point.clone();
        snappedPoint.y = elevation;

        // I2: Apply axis/angle snap relative to the last committed point.
        // Shift held → bypass snap and commit the raw cursor position.
        const lastPt = this.polylineData.points[this.polylineData.points.length - 1];
        if (lastPt && !this.shiftPressed) {
            const snapped = snapToAxisOrDiagonal(
                { x: lastPt.x,        y: lastPt.z },
                { x: snappedPoint.x,  y: snappedPoint.z }
            );
            snappedPoint.x = snapped.x;
            snappedPoint.z = snapped.y; // our {x,y} represents world {X,Z}
        }

        // Check for closing the loop
        if (this.polylineData.points.length >= 3) {
            const firstPoint = this.polylineData.points[0];
            if (snappedPoint.distanceTo(firstPoint) < 0.5) {
                this.confirmSlabCreation();
                return;
            }
        }

        this.polylineData.points.push(snappedPoint);
        this.updatePolylinePreview(); // Redraw full polyline after adding point

        // Add visual marker
        const dotGeo = new THREE.SphereGeometry(0.1, 16, 16);
        const dotMat = new THREE.MeshBasicMaterial({ 
            color: 0x007bff,
            depthTest: false,
            transparent: true,
            opacity: 0.9
        });
        const dot = new THREE.Mesh(dotGeo, dotMat);
        dot.position.copy(snappedPoint);
        dot.userData.isPreview = true;
        dot.renderOrder = 1000;
        this.world.scene.three.add(dot);
        this.polylineData.markers.push(dot);

        const hudText = document.getElementById('hud-step-text');
        if (hudText) {
            hudText.innerHTML = `Points: ${this.polylineData.points.length} (Click start to close)`;
        }

        if (this.polylineData.points.length >= 3) {
            const btns = document.getElementById('confirm-btns');
            if (btns) btns.style.display = 'flex';
        }
    }

    private updatePolylinePreview(hoverPoint?: THREE.Vector3): void {
        const levelId = projectContext.activeLevelId;
        // W7 FIX §02 §1.3: Explicit fallback with error log — no silent ?? 0.
        const elevation = this.resolveElevationForPreview(levelId);

        // I2: Apply axis/angle snap to the live hover point so the ghost line
        // tracks the same position that would be committed on click.
        let displayHover = hoverPoint;
        if (hoverPoint && this.activeTool === 'POLYLINE_SLAB') {
            const lastPt = this.polylineData.points[this.polylineData.points.length - 1];
            if (lastPt && !this.shiftPressed) {
                const snapped = snapToAxisOrDiagonal(
                    { x: lastPt.x,       y: lastPt.z },
                    { x: hoverPoint.x,   y: hoverPoint.z }
                );
                displayHover = new THREE.Vector3(snapped.x, hoverPoint.y, snapped.y);
            }
        }

        const points: THREE.Vector3[] = this.polylineData.points.map(p => {
            const pt = p.clone();
            pt.y = elevation + 0.01; // slight offset to avoid z-fighting
            return pt;
        });

        // Add hover extension
        if (displayHover) {
            const temp = displayHover.clone();
            temp.y = elevation + 0.01; // slight offset to avoid z-fighting
            points.push(temp);

            if (this.dimensionPreview && this.polylineData.points.length > 0) {
                const lastPoint = this.polylineData.points[this.polylineData.points.length - 1];
                this.dimensionPreview.update(lastPoint, temp, this.world.camera.three);
            }
        } else if (this.dimensionPreview) {
            this.dimensionPreview.hide();
        }

        if (points.length < 2) return;

        if (!this.polylineData.previewLine) {
            const geo = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.LineBasicMaterial({
                color: 0x007bff,
                linewidth: 2,
                depthTest: false
            });

            this.polylineData.previewLine = new THREE.Line(geo, mat);
            this.polylineData.previewLine.userData.isPreview = true;
            this.polylineData.previewLine.renderOrder = 999;
            this.world.scene.three.add(this.polylineData.previewLine);
        } else {
            // Dispose old geometry
            this.polylineData.previewLine.geometry.dispose();

            // Create new geometry with updated point count
            const newGeo = new THREE.BufferGeometry().setFromPoints(points);
            this.polylineData.previewLine.geometry = newGeo;
        }

        // ── I4: Closing-line preview ──────────────────────────────────────────
        // Draws a ghost line from the cursor back to the first committed point,
        // showing the user exactly which edge will close the polygon.
        // Visible only when 2+ committed points exist and the cursor is available.
        if (this.polylineData.points.length >= 2 && displayHover) {
            const closingPts = [
                points[points.length - 1]!,  // hover (elevation-adjusted)
                points[0]!,                   // first committed point
            ];
            if (!this.polylineData.closingLinePreview) {
                const geo = new THREE.BufferGeometry().setFromPoints(closingPts);
                const mat = new THREE.LineBasicMaterial({
                    color: 0x818cf8,
                    depthTest: false,
                    transparent: true,
                    opacity: 0.5,
                });
                const line = new THREE.Line(geo, mat);
                line.userData.isPreview = true;
                line.renderOrder = 1;
                this.world.scene.three.add(line);
                this.polylineData.closingLinePreview = line;
            } else {
                this.polylineData.closingLinePreview.geometry.dispose();
                this.polylineData.closingLinePreview.geometry =
                    new THREE.BufferGeometry().setFromPoints(closingPts);
                this.polylineData.closingLinePreview.visible = true;
            }
        } else if (this.polylineData.closingLinePreview) {
            this.polylineData.closingLinePreview.visible = false;
        }

        // ── I5: Preview fill ──────────────────────────────────────────────────
        // Translucent indigo polygon covering the current drawing area.
        // Appears when 3+ points are available (committed + hover).
        // THREE.Shape is in XY plane; -PI/2 rotation on X maps it to world XZ.
        if (points.length >= 3) {
            const firstPt = points[0]!;
            const shape = new THREE.Shape();
            shape.moveTo(firstPt.x, -firstPt.z);
            for (let i = 1; i < points.length; i++) {
                shape.lineTo(points[i]!.x, -points[i]!.z);
            }
            shape.closePath();
            const fillGeo = new THREE.ShapeGeometry(shape);

            if (!this.polylineData.previewFillMesh) {
                const mat = new THREE.MeshBasicMaterial({
                    color: 0x818cf8,
                    transparent: true,
                    opacity: 0.15,
                    side: THREE.DoubleSide,
                    depthTest: false,
                    depthWrite: false,
                });
                this.polylineData.previewFillMesh = new THREE.Mesh(fillGeo, mat);
                this.polylineData.previewFillMesh.userData.isPreview = true;
                this.polylineData.previewFillMesh.renderOrder = 0;
                this.world.scene.three.add(this.polylineData.previewFillMesh);
            } else {
                this.polylineData.previewFillMesh.geometry.dispose();
                this.polylineData.previewFillMesh.geometry = fillGeo;
                this.polylineData.previewFillMesh.visible = true;
            }

            this.polylineData.previewFillMesh.position.set(0, elevation + 0.01, 0);
            this.polylineData.previewFillMesh.rotation.set(-Math.PI / 2, 0, 0);
        } else if (this.polylineData.previewFillMesh) {
            this.polylineData.previewFillMesh.visible = false;
        }
    }

    private clearPolyline(): void {
        this.polylineData.points = [];
        if (this.polylineData.previewLine) {
            this.polylineData.previewLine.geometry.dispose();
            (this.polylineData.previewLine.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.polylineData.previewLine);
            this.polylineData.previewLine = null;
        }
        // I4: Dispose closing-line preview.
        if (this.polylineData.closingLinePreview) {
            this.polylineData.closingLinePreview.geometry.dispose();
            (this.polylineData.closingLinePreview.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.polylineData.closingLinePreview);
            this.polylineData.closingLinePreview = null;
        }
        // I5: Dispose fill preview mesh.
        if (this.polylineData.previewFillMesh) {
            this.polylineData.previewFillMesh.geometry.dispose();
            (this.polylineData.previewFillMesh.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.polylineData.previewFillMesh);
            this.polylineData.previewFillMesh = null;
        }
        this.polylineData.markers.forEach(m => {
            m.geometry.dispose();
            (m.material as THREE.Material).dispose();
            this.world.scene.three.remove(m);
        });
        this.polylineData.markers = [];
    }

    private onPointerUp = (e: PointerEvent): void => {
        if (this.activeTool === 'NONE') return;

        const target = e.target as HTMLElement;
        if (target.releasePointerCapture) {
            target.releasePointerCapture(e.pointerId);
        }
    };

    /**
     * FIX-CONTINUOUS: Reset the current drawing session for a new slab WITHOUT
     * tearing down the listeners, camera lock, or HUD.  Called by
     * confirmSlabCreation() after each successful slab so the user can
     * immediately draw another one.  The session is fully torn down only when
     * the user presses ESC, clicks ✕, or calls exitSketchMode() explicitly.
     */
    private _resetForNextSlab(): void {
        this.clearSketch(); // disposes preview geometry, resets polyline / floorSketch state

        // Reset HUD to the initial drawing instruction for the active mode.
        const confirmBtns = document.getElementById('confirm-btns');
        if (confirmBtns) confirmBtns.style.display = 'none';
        const hudStepText = document.getElementById('hud-step-text');
        if (hudStepText) {
            if (this.activeTool === 'FLOOR_SKETCH' || this.activeTool === 'HOLLOW_SLAB') {
                hudStepText.innerHTML = 'Step 1: Click to set first corner';
            } else if (this.activeTool === 'POLYLINE_SLAB') {
                hudStepText.innerHTML = 'Click to start path';
            } else if (this.activeTool === 'REGION_SLAB') {
                hudStepText.innerHTML = 'Click an enclosed region';
            }
        }
        // isSketching, camera lock, and pointer listeners intentionally NOT reset here.
    }

    private cleanupSketchMode(): void {
        if (!this.isSketching) return;

        if (this.dimensionPreview) {
            this.dimensionPreview.hide();
        }

        const rendererDom = this.world.renderer?.three.domElement;

        if (this.currentPointerListeners && rendererDom) {
            this.currentPointerListeners();
            this.currentPointerListeners = null;
        }

        // I2: Remove Shift key listeners and reset snap state.
        if (this._onShiftDown) {
            document.removeEventListener('keydown', this._onShiftDown);
            this._onShiftDown = null;
        }
        if (this._onShiftUp) {
            document.removeEventListener('keyup', this._onShiftUp);
            this._onShiftUp = null;
        }
        this.shiftPressed = false;

        // §11 §2.6: Remove Enter key listener.
        if (this._onEnterKey) {
            document.removeEventListener('keydown', this._onEnterKey);
            this._onEnterKey = null;
        }

        if (rendererDom) rendererDom.style.touchAction = "";
        if (this.world.camera?.controls) {
            this.world.camera.controls.enabled = true;
        }
        this.isSketching = false;
    }

    public exitSketchMode(): void {
        if (!this.isSketching) return;
        this.clearSketch();
        this.cleanupSketchMode();
        this.activeTool = 'NONE';
    }

    public cleanup(): void {
        this.exitSketchMode();
        this.clearSketch();
    }

    public dispose(): void {
        this.cleanup();
        if (this.dimensionPreview) {
            this.dimensionPreview.dispose();
            this.dimensionPreview = null;
        }
    }

    public async enterPolylineMode(): Promise<void> {
        // FIX-6 §01 §3.5: resolved from injected deps, not from window.unselectAll.
        this._deps.getUnselectAll?.()?.();
        this.isSketching = true;
        this.activeTool = 'POLYLINE_SLAB';
        await this.setupToolUI("Polyline Slab", "Click to start path");

        // I2: Attach Shift key listeners for axis/angle snap.
        // Shift held → snap disabled (allows freeform angles).
        // Shift released → snap re-engages immediately.
        this._onShiftDown = (e: KeyboardEvent) => { if (e.key === 'Shift') this.shiftPressed = true; };
        this._onShiftUp   = (e: KeyboardEvent) => { if (e.key === 'Shift') this.shiftPressed = false; };
        document.addEventListener('keydown', this._onShiftDown);
        document.addEventListener('keyup',   this._onShiftUp);
    }

    public async enterSketchMode(): Promise<void> {
        // FIX-6 §01 §3.5: resolved from injected deps, not from window.unselectAll.
        this._deps.getUnselectAll?.()?.();
        this.isSketching = true;
        this.activeTool = 'FLOOR_SKETCH';
        await this.setupToolUI("2-Point Slab", "Step 1: Click to set first corner");
    }

    public async enterRegionMode(): Promise<void> {
        // FIX-6 §01 §3.5: resolved from injected deps, not from window.unselectAll.
        this._deps.getUnselectAll?.()?.();
        this.isSketching = true;
        this.activeTool = 'REGION_SLAB';
        // FIX-CONTINUOUS: route through setupToolUI so REGION_SLAB gets the same
        // HUD (with ✕ exit button) and ESC key handler as FLOOR_SKETCH /
        // POLYLINE_SLAB / HOLLOW_SLAB.  Without this, the user could enter
        // region mode (SL → RG) but had no way to exit it short of activating
        // another tool.  setupToolUI's exitTool already branches to
        // exitRegionMode() when activeTool === 'REGION_SLAB'.
        await this.setupToolUI("By Region Slab", "Click an enclosed region");
    }

    private async setupToolUI(title: string, initialStep: string): Promise<void> {
        this.clearSketch();

        if (this.world.camera?.controls) {
            this.world.camera.controls.enabled = false;
        }
        this.isSketching = true;

        const rendererDom = this.world.renderer!.three.domElement;
        rendererDom.style.touchAction = "none";

        const removeEventListeners = () => {
            rendererDom.removeEventListener("pointerdown", this.onPointerDown);
            rendererDom.removeEventListener("pointermove", this.onPointerMove);
            rendererDom.removeEventListener("pointerup", this.onPointerUp);
            rendererDom.removeEventListener("pointercancel", this.onPointerUp);
        };

        this.currentPointerListeners = removeEventListeners;

        rendererDom.addEventListener("pointerdown", this.onPointerDown, { passive: false });
        rendererDom.addEventListener("pointermove", this.onPointerMove, { passive: false });
        rendererDom.addEventListener("pointerup", this.onPointerUp, { passive: false });
        rendererDom.addEventListener("pointercancel", this.onPointerUp, { passive: false });

        const exitTool = () => {
            console.log("Exiting tool via HUD button");
            if (this.activeTool === 'REGION_SLAB') {
                this.exitRegionMode();
            } else {
                this.exitSketchMode();
            }
            const hud = document.getElementById('sketch-hud');
            if (hud) hud.remove();
        };

        const sketchHUDComp = BUI.Component.create(() => {
            const displayTitle = initialStep ? `${title}:` : title;
            return BUI.html`
                <div id="sketch-hud" class="th-overlay" style="z-index:999999;">
                    <div class="th-row">
                        <div id="hud-content" class="th-text">
                            <strong>${displayTitle}</strong> <span id="hud-step-text">${initialStep}</span>
                        </div>
                        <div id="confirm-btns" class="th-btn-row" style="display:none; flex:0 0 auto;">
                            <button id="create-slab-btn" class="th-btn th-btn--success"
                                @click=${async () => {
                                    // FIX-CONTINUOUS: confirmSlabCreation now calls
                                    // _resetForNextSlab() internally — do NOT remove
                                    // the HUD here; it resets to "Step 1" state so
                                    // the user can draw another slab immediately.
                                    await this.confirmSlabCreation();
                                }}>
                                ✓ Create Slab
                            </button>
                            <button class="th-btn th-btn--neutral"
                                @click=${() => this.cancelSlabCreation()}>
                                Cancel
                            </button>
                        </div>
                        <button class="th-btn th-btn--close th-btn--icon"
                            title="Exit slab tool (Esc)"
                            @click=${exitTool}>
                            ✕
                        </button>
                    </div>
                </div>
            `;
        });

        const existingHud = document.getElementById('sketch-hud');
        if (existingHud) existingHud.remove();

        document.body.appendChild(sketchHUDComp);

        // §11 §2.6: Register Enter key shortcut to confirm slab creation.
        // Mirrors the "✓ Create Slab" button click — fires only when #confirm-btns is visible.
        // Guards: skipped if focus is on an <input> or <textarea> (per contract §11 §1).
        if (this._onEnterKey) {
            document.removeEventListener('keydown', this._onEnterKey);
        }
        this._onEnterKey = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.key === 'Escape') {
                // FIX-CONTINUOUS: ESC exits the whole tool session.
                e.preventDefault();
                exitTool();
                return;
            }

            if (e.key !== 'Enter') return;
            const confirmBtns = document.getElementById('confirm-btns');
            if (!confirmBtns || confirmBtns.style.display === 'none') return;
            e.preventDefault();
            // FIX-CONTINUOUS: confirmSlabCreation resets HUD internally — no hud.remove().
            this.confirmSlabCreation();
        };
        document.addEventListener('keydown', this._onEnterKey);
    }

    public exitRegionMode(): void {
        this.clearSketch();
        this.cleanupSketchMode();
        this.activeTool = 'NONE';
        const hud = document.getElementById('sketch-hud');
        if (hud) hud.remove();
    }

    public async enterHollowMode(): Promise<void> {
        // FIX-6 §01 §3.5: resolved from injected deps, not from window.unselectAll.
        this._deps.getUnselectAll?.()?.();
        this.isSketching = true;
        this.activeTool = 'HOLLOW_SLAB';
        await this.setupToolUI("Hollow Slab", "Step 1: Click to set first corner");
    }

    /**
     * Activate the "Pick Walls" slab creation mode.
     * The user clicks on walls to define the slab boundary; each wall contributes
     * a HostReferenceEdge to the slab sketch. The resulting slab follows wall
     * geometry changes automatically via SlabDependencyTracker.
     */
    public enterPickWallsMode(): void {
        this.exitSketchMode();
        this.clearSketch();

        if (!this.pickWallsController) {
            // W2 §SLAB-SYSTEM-AUDIT-2026: Pass injected deps so the controller no
            // longer reads from window.* globals (commandManager, bimManager,
            // projectContext, unselectAll).
            this.pickWallsController = new SlabPickWallsController(this.world, this.wallStore, {
                getCommandManager: this._deps.getCommandManager,
                getBimManager:     this._deps.getBimManager,
                getActiveLevelId:  () => this._deps.getBimManager?.()?.activeLevelId
                                      ?? (this._deps.getSlabStore?.() as any)?.activeLevelId
                                      ?? window.projectContext?.activeLevelId,
                getUnselectAll:    this._deps.getUnselectAll,
            });
        }
        this.pickWallsController.enter();
    }

    public exitPickWallsMode(): void {
        this.pickWallsController?.exit();
    }

    private updateRegionDetection(point: THREE.Vector3): void {
        if (!this.wallStore) return;

        const region = this.findRegionAtPoint(point);

        if (region && region.length >= 3) {
            this.regionDetection.candidatePolygon = region;
            this.showRegionPreview(region);
        } else {
            this.clearRegionPreview();
        }
    }

    private findRegionAtPoint(pt: THREE.Vector3): THREE.Vector2[] | null {
        const walls = this.wallStore.getAll();
        const segments: [THREE.Vector2, THREE.Vector2][] = [];
        for (const w of walls) {
            const a = new THREE.Vector2(w.baseLine[0].x, w.baseLine[0].z);
            const b = new THREE.Vector2(w.baseLine[1].x, w.baseLine[1].z);
            segments.push([a, b]);
        }

        const loops = this.buildClosedLoops(segments);
        const click2D = new THREE.Vector2(pt.x, pt.z);

        for (const loop of loops) {
            if (this.isPointInPolygon(click2D, loop)) {
                return loop;
            }
        }

        return null;
    }

    private buildClosedLoops(segments: [THREE.Vector2, THREE.Vector2][]): THREE.Vector2[][] {
        const points: THREE.Vector2[] = [];
        const adj = new Map<number, number[]>();
        const tolerance = 0.15; // Increased tolerance from 0.05 to 0.15 for better region detection

        const getPointIdx = (p: THREE.Vector2) => {
            for (let i = 0; i < points.length; i++) {
                if (points[i].distanceTo(p) < tolerance) return i;
            }
            points.push(p.clone());
            return points.length - 1;
        };

        for (const [a, b] of segments) {
            const u = getPointIdx(a);
            const v = getPointIdx(b);
            if (u === v) continue;
            if (!adj.has(u)) adj.set(u, []);
            if (!adj.has(v)) adj.set(v, []);
            adj.get(u)!.push(v);
            adj.get(v)!.push(u);
        }

        const loops: THREE.Vector2[][] = [];
        const visitedEdges = new Set<string>();

        for (let i = 0; i < points.length; i++) {
            const neighbors = adj.get(i) || [];
            for (const neighbor of neighbors) {
                if (visitedEdges.has(`${i}-${neighbor}`)) continue;

                const loop = this.traceSpecificLoop(i, neighbor, adj, points, visitedEdges);
                if (loop && loop.length >= 3) {
                    loops.push(loop);
                }
            }
        }

        return loops;
    }

    private traceSpecificLoop(startIdx: number, nextIdx: number, adj: Map<number, number[]>, points: THREE.Vector2[], visitedEdges: Set<string>): THREE.Vector2[] | null {
        const loopIdxs = [startIdx, nextIdx];
        visitedEdges.add(`${startIdx}-${nextIdx}`);
        visitedEdges.add(`${nextIdx}-${startIdx}`);

        let currIdx = nextIdx;
        let prevIdx = startIdx;

        while (true) {
            const neighbors = adj.get(currIdx) || [];
            if (neighbors.length < 2) return null;

            // Find next neighbor based on smallest angle (to find minimal cycles)
            const pCurr = points[currIdx];
            const pPrev = points[prevIdx];
            const vPrev = new THREE.Vector2().subVectors(pPrev, pCurr).normalize();

            let bestNeighbor = -1;
            let bestAngle = Infinity;

            for (const n of neighbors) {
                if (n === prevIdx) continue;
                const vNext = new THREE.Vector2().subVectors(points[n], pCurr).normalize();

                // Signed angle from vPrev to vNext
                let angle = Math.atan2(vNext.y, vNext.x) - Math.atan2(vPrev.y, vPrev.x);
                if (angle <= 0) angle += Math.PI * 2;

                if (angle < bestAngle) {
                    bestAngle = angle;
                    bestNeighbor = n;
                }
            }

            if (bestNeighbor === -1) return null;
            if (bestNeighbor === startIdx) break;

            if (loopIdxs.includes(bestNeighbor)) return null; // Avoid self-intersections

            visitedEdges.add(`${currIdx}-${bestNeighbor}`);
            visitedEdges.add(`${bestNeighbor}-${currIdx}`);

            loopIdxs.push(bestNeighbor);
            prevIdx = currIdx;
            currIdx = bestNeighbor;

            if (loopIdxs.length > 50) return null; // Safety break
        }

        return loopIdxs.map(idx => points[idx]);
    }

    private isPointInPolygon(point: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    private showRegionPreview(polygon: THREE.Vector2[]): void {
        this.clearRegionPreview();

        const shape = new THREE.Shape(polygon);
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({
            color: 0x007bff,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        this.regionPreview = new THREE.Mesh(geometry, material);
        this.regionPreview.rotation.x = -Math.PI / 2;
        this.regionPreview.position.y = 0.02;
        this.regionPreview.userData.isPreview = true;
        this.world.scene.three.add(this.regionPreview);
    }

    private clearRegionPreview(): void {
        if (this.regionPreview) {
            this.regionPreview.geometry.dispose();
            (this.regionPreview.material as THREE.Material).dispose();
            this.world.scene.three.remove(this.regionPreview);
            this.regionPreview = null;
        }
    }

    public async createWallsFromSlab(slabId: string): Promise<void> {
        // FIX-6: resolved from injected deps, not from window.slabStore / window.wallTool.
        const slabStore = this._deps.getSlabStore?.();
        if (!slabStore || !this.wallStore) return;

        const slab = slabStore.getById(slabId);
        if (!slab || !slab.polygon || slab.polygon.length < 2) return;

        const points = slab.polygon.map((p: any) => new THREE.Vector3(p.x + slab.position.x, 0, p.y + slab.position.z));

        if (points[0].distanceTo(points[points.length - 1]) > 0.01) {
            points.push(points[0].clone());
        }

        const wallTool = this._deps.getWallTool?.();
        if (wallTool && typeof wallTool.createWall === 'function') {
            for (let i = 0; i < points.length - 1; i++) {
                await wallTool.createWall(points[i], points[i + 1]);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §11 SLAB PROFILE EDIT MODE — Phase 4 Integration
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Enter post-creation profile edit mode for the given slab.
     *
     * Called by SelectionManager when the user double-clicks a slab.
     * Lazily creates the SlabProfileEditor, activates it, and shows the HUD.
     *
     * §11 §4.2 SlabTool modifications
     * §11 §9 Phase 4 — Integration
     */
    public async enterProfileEditMode(slabId: string): Promise<void> {
        // Idempotent: if already editing the same slab, do nothing.
        if (this.isInProfileEditMode && this.profileEditSlabId === slabId) return;

        // Exit any active profile edit session before starting a new one.
        if (this.isInProfileEditMode) {
            this.exitProfileEditMode();
        }

        // Get slab from store — never from scene userData (§01 R-1).
        // FIX-6: resolved from injected deps, not from window.slabStore.
        const slabStore = this._deps.getSlabStore?.();
        // `let` — may be re-read after sketch degradation (Phase 6).
        let slab = slabStore?.getById(slabId);
        if (!slab) {
            console.warn('[SlabTool] enterProfileEditMode: slab not found in store:', slabId);
            return;
        }

        // §11 §1.2 — Mode A: FLOOR_SKETCH slabs (width > 0 && depth > 0) use the
        // floating dimension edit panel instead of the vertex-drag editor.
        // Mode A is the rectangular-resize path; Mode B (below) is freeform vertex drag.
        if ((slab.width ?? 0) > 0 && (slab.depth ?? 0) > 0) {
            this._showDimensionEditPanel(slabId);
            return;
        }

        // §11 §1.4 — Phase 6: If the slab was created via Pick-Walls (i.e., it carries a
        // SlabSketch with HostReferenceEdges), degrade all edges to FreeLineEdges before
        // entering the vertex-drag editor.  The degradation command fires first so that
        // undo restores the wall constraints; subsequent profile-edit commits are free draws.
        if (slab.sketch) {
            const ok = await this._degradeSketchToPolygon(slabId, slab);
            if (!ok) {
                console.warn(
                    '[SlabTool] §11 Sketch degradation failed — cannot enter profile edit mode for slab:',
                    slabId
                );
                return;
            }
            // Re-read from store: sketch field cleared, polygon field set.
            slab = slabStore.getById(slabId);
            if (!slab) return;
        }

        // Validate polygon: must have ≥ 3 points.
        const polygon = slab.polygon;
        if (!polygon || polygon.length < 3) {
            console.warn(
                '[SlabTool] enterProfileEditMode: slab has no valid polygon (need ≥ 3 pts).',
                slabId
            );
            return;
        }

        // §02 §1.3: Resolve world elevation from BimManager (not from stored Y).
        const elevation = this.resolveElevationForPreview(slab.levelId);

        // Lazily create the profile editor — reused across sessions.
        if (!this.profileEditor) {
            this.profileEditor = new SlabProfileEditor(
                this.world,
                this.components,
                (newPolygon) => this._commitProfileEdit(newPolygon),
                () => this.exitProfileEditMode()
            );
        }

        // Activate the editor overlay (builds handles, attaches pointer listeners).
        this.isInProfileEditMode  = true;
        this.profileEditSlabId    = slabId;
        this.profileEditor.activate(slab, elevation);

        // Show the Finish / Cancel HUD.
        this._showProfileEditHUD();

        console.log(`[SlabTool] §11 Profile edit mode entered — slab: ${slabId}`);
    }

    /**
     * Commit the current working polygon to the store via UpdateSlabPolygonCommand.
     *
     * Called by SlabProfileEditor.onCommit on every pointer-up (vertex drag end)
     * and on double-click vertex delete. Each call creates one undo step.
     *
     * §01 §2.1 Command-First — never calls slabStore directly.
     */
    private _commitProfileEdit(newPolygon: { x: number; y: number }[]): void {
        // FIX-6: resolved from injected deps, not from window.commandManager.
        const commandManager = this._deps.getCommandManager?.();
        if (!commandManager || !this.profileEditSlabId) return;

        const cmd = new UpdateSlabPolygonCommand({
            slabId:  this.profileEditSlabId,
            polygon: newPolygon,
        });
        // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('slab.update', {}).catch(() => {}); }
        commandManager.execute(cmd);
    }

    /**
     * Finish profile edit mode cleanly.
     * Called by the "Finish Edit Mode" HUD button and by the Enter key handler.
     * The last vertex drag has already committed via _commitProfileEdit; this
     * simply exits the overlay and removes the HUD.
     */
    public finishProfileEditMode(): void {
        this.exitProfileEditMode();
    }

    /**
     * Cancel / exit profile edit mode.
     * Disposes all preview geometry (handles, boundary line, fill mesh),
     * removes all pointer/key listeners attached by SlabProfileEditor,
     * and hides the HUD.
     *
     * Safe to call multiple times (idempotent) — matches the contract's
     * requirement that deactivate() is safe to call from clearSketch(),
     * deactivate(), and the ESC handler.
     *
     * §11 §4.2 "exitProfileEditMode" & §11 §8 Contract Compliance Checklist
     */
    public exitProfileEditMode(): void {
        if (this.profileEditor) {
            this.profileEditor.deactivate();
        }
        this.isInProfileEditMode = false;
        this.profileEditSlabId   = null;
        this._hideProfileEditHUD();
        // §11 Phase 5 safety net: if Mode A panel is somehow still open, close it.
        this._hideDimensionEditPanel();

        console.log('[SlabTool] §11 Profile edit mode exited.');
    }

    /**
     * Show the profile edit HUD (Finish / Cancel buttons + instructions).
     *
     * Uses the same BUI component pattern as the sketch HUD so the look-and-feel
     * is consistent with the rest of the tool overlay system.
     *
     * §11 §5.1 Profile Edit HUD
     */
    private _showProfileEditHUD(): void {
        this._hideProfileEditHUD(); // remove any stale instance first

        const hud = BUI.Component.create(() => {
            return BUI.html`
                <div id="profile-edit-hud" class="th-overlay" style="z-index:999999;">
                    <div class="th-row">
                        <div id="hud-content" class="th-text">
                            <strong>✏ Edit Profile:</strong>
                            <span id="hud-step-text">
                                Drag vertex handles to reshape ·
                                <kbd>Shift</kbd> = free angle ·
                                <kbd>Esc</kbd> = cancel ·
                                <kbd>Enter</kbd> = finish
                            </span>
                        </div>
                        <div class="th-btn-row" style="flex:0 0 auto;">
                            <button class="th-btn th-btn--success"
                                @click=${() => this.finishProfileEditMode()}>
                                ✓ Finish Edit Mode
                            </button>
                            <button class="th-btn th-btn--neutral"
                                @click=${() => this.exitProfileEditMode()}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });

        document.body.appendChild(hud);
    }

    /**
     * Remove the profile edit HUD from the DOM.
     * Safe to call when the HUD is not present.
     */
    private _hideProfileEditHUD(): void {
        const hud = document.getElementById('profile-edit-hud');
        if (hud) hud.remove();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §11 §1.4 SKETCH DEGRADATION — Phase 6
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Degrade a PICK_WALLS sketch-based slab to a plain polygon slab.
     *
     * Algorithm (§11 §1.4):
     *   1. Read `sketch.outerLoop.edges`.
     *   2. For each `HostReferenceEdge` call `WallFaceResolver.resolveOrFallback()`
     *      to get the current 2D segment; push its `start` point.
     *   3. For each `FreeLineEdge` push its `start` point.
     *   4. Validate ≥ 3 resolved points.
     *   5. Fire `UpdateSlabPolygonCommand({ clearSketch: true })` — this atomically:
     *        • Sets `slab.polygon` to the resolved points.
     *        • Deletes `slab.sketch` so the builder uses the plain polygon path.
     *        • Keeps `width`/`depth` in sync via the polygon AABB.
     *   6. Show a non-blocking amber toast warning the user that wall constraints
     *      have been detached.
     *
     * Returns `true` on success, `false` if resolution failed or command rejected.
     *
     * §01 §2.1 Command-First — never calls slabStore directly.
     * §07 §2.2 Security  — no window.* beyond commandManager (already used pattern).
     */
    private async _degradeSketchToPolygon(slabId: string, slab: any): Promise<boolean> {
        const sketch = slab.sketch;
        if (!sketch?.outerLoop?.edges?.length) {
            console.warn('[SlabTool] §11 Sketch degradation: outerLoop missing or empty.', slabId);
            return false;
        }

        const edges: SketchEdge[] = sketch.outerLoop.edges;
        const resolvedPoints: { x: number; y: number }[] = [];
        let hostEdgeCount = 0;
        let failedCount  = 0;

        for (const edge of edges) {
            if (edge.type === 'hostReference') {
                hostEdgeCount++;
                const segment = WallFaceResolver.resolveOrFallback(edge as HostReferenceEdge);
                if (segment) {
                    resolvedPoints.push({ x: segment.start.x, y: segment.start.y });
                } else {
                    failedCount++;
                    console.warn(
                        '[SlabTool] §11 Cannot resolve HostReferenceEdge for wall:',
                        (edge as HostReferenceEdge).hostId
                    );
                }
            } else if (edge.type === 'freeLine') {
                const fe = edge as FreeLineEdge;
                resolvedPoints.push({ x: fe.start.x, y: fe.start.y });
            }
        }

        if (resolvedPoints.length < 3) {
            console.warn(
                `[SlabTool] §11 Sketch degradation failed — only ${resolvedPoints.length} of ` +
                `${edges.length} edges resolved (${failedCount} unresolvable host edges).`,
                slabId
            );
            return false;
        }

        // FIX-6: resolved from injected deps, not from window.commandManager.
        const commandManager = this._deps.getCommandManager?.();
        if (!commandManager) {
            console.error('[SlabTool] §11 commandManager unavailable — cannot degrade sketch.');
            return false;
        }

        const cmd = new UpdateSlabPolygonCommand({ slabId, polygon: resolvedPoints, clearSketch: true });
        // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
        if (window.runtime?.bus) { window.runtime.bus.executeCommand('slab.update', {}).catch(() => {}); }
        const result = commandManager.execute(cmd);

        if (!result?.success) {
            console.warn('[SlabTool] §11 UpdateSlabPolygonCommand (clearSketch) failed:', result);
            return false;
        }

        console.log(
            `[SlabTool] §11 Sketch degraded — ${resolvedPoints.length} vertices, ` +
            `${hostEdgeCount} host edge(s) detached, ${failedCount} unresolved.`
        );

        // Show a non-blocking amber toast only when at least one HostReferenceEdge
        // was detached — the user needs to know the slab no longer follows walls.
        if (hostEdgeCount > 0) {
            this._showDegradationToast();
        }

        return true;
    }

    /**
     * Non-blocking amber toast — warns that the slab has been detached from its
     * referenced walls during sketch degradation.
     *
     * Auto-dismisses after 5 s with a 400 ms fade-out. Safe to call multiple times;
     * any existing toast is removed before the new one is inserted.
     *
     * §11 §1.4 — Sketch Degradation: "user is warned via a non-blocking toast"
     */
    private _showDegradationToast(): void {
        const TOAST_ID = 'slab-profile-degrade-toast';
        const existing = document.getElementById(TOAST_ID);
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.style.cssText = [
            'position:fixed',
            'top:80px',
            'left:50%',
            'transform:translateX(-50%)',
            'z-index:1000000',
            'background:#fffbeb',
            'border:1px solid #fde68a',
            'border-radius:var(--app-radius-md)',
            'padding:11px 16px',
            'max-width:380px',
            'box-shadow:0 4px 18px rgba(0,0,0,0.12)',
            'font-family:var(--app-font)',
            'font-size:12px',
            'color:#92400e',
            'display:flex',
            'align-items:flex-start',
            'gap:10px',
            'line-height:1.55',
            'pointer-events:none',
        ].join(';');

        toast.innerHTML = `
            <span style="font-size:17px;flex-shrink:0;padding-top:1px;">⚠</span>
            <div>
                <strong style="display:block;margin-bottom:3px;color:#92400e;">
                    Slab detached from walls
                </strong>
                This slab boundary was constrained to referenced wall faces.
                Editing it converts all edges to free lines — the boundary will
                no longer follow wall movements.
            </div>
        `;

        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.transition = 'opacity 0.4s';
            toast.style.opacity = '0';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
        }, 5000);

        console.log('[SlabTool] §11 Sketch degradation toast displayed.');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §11 §1.2 MODE A — Rectangular Dimension Editor (Phase 5)
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Show the floating Width/Depth dimension edit panel for a FLOOR_SKETCH slab.
     *
     * Lazily creates `SlabDimensionsEditor` on first call and delegates to it.
     * The panel manages its own lifecycle (Apply fires UpdateSlabPolygonCommand,
     * Cancel / ESC calls `hide()`).
     *
     * §11 §4.4 — Property Panel — Dimension Edit
     */
    private _showDimensionEditPanel(slabId: string): void {
        if (!this.dimensionsEditor) {
            // DIMENSION-SYSTEM-AUDIT-2026 §A4 — propagate the same DI bag the
            // tool already uses so the editor never reaches into window globals.
            // Sprint Y dep-inversion: createDimensionsEditor factory injected by initTools.ts
            // to avoid importing UI layer from @pryzm/geometry-slab.
            this.dimensionsEditor = this._deps.createDimensionsEditor?.({
                getSlabStore:      this._deps.getSlabStore,
                getCommandManager: this._deps.getCommandManager,
            }) ?? null;
        }
        this.dimensionsEditor.show(slabId);
        console.log(`[SlabTool] §11 Mode A — dimension edit panel shown for slab: ${slabId}`);
    }

    /**
     * Hide the dimension edit panel if it is currently visible.
     * Called from `clearSketch()` and `exitProfileEditMode()` as a safety net
     * so the panel is always dismissed when the tool deactivates.
     */
    private _hideDimensionEditPanel(): void {
        if (this.dimensionsEditor?.isVisible) {
            this.dimensionsEditor.hide();
        }
    }
}