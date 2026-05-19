import { createId } from '@pryzm/schemas';
import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { ProjectContext } from '@pryzm/core-app-model';
import { CreateWallCommand, CreateWallsFromSlabCommand } from '@pryzm/command-registry';
import { WallToolState, WallToolCallbacks, WallDrawingMode } from './WallTypes';
import { WallStore } from './WallStore';
import { WallIntentResolver, WallAnchor } from './WallIntentResolver';
import { WallPathBuilder, PathBuilderMode } from './WallPathBuilder';
import { PathResolver, WallPath } from './PathResolver';
import { WallFragmentBuilder } from './WallFragmentBuilder';
import { DimensionPreview } from './DimensionPreview';
import { WallDimensionInput } from './WallDimensionInput';
import { WallSnapCycler } from './WallSnapCycler';
import { VisualStyle } from '@pryzm/core-app-model/material-library';
import { SnapManager } from '@pryzm/snapping';
// §WALL-AUDIT-2026-W5: shared camera-zoom-aware tolerance — same value the
// WallJoinResolver uses for its post-creation join pass.
// DOC-5.2 — 2D snap on projected TechnicalDrawing edges (used in getSnappedPoint)
// DOC-5.3 — Direct 2D creation in plan view. planView2DCreationMode is imported
// for structural consistency with SlabTool/RoomTool.
import {
    DEFAULT_SNAP_PIXEL_RADIUS,
    getWorldToleranceForActiveCamera,
    activePlanDrawingRef,
    planView2DSnapService,
    planView2DCreationMode as _planView2DCreationMode,
} from '@pryzm/core-app-model';
import { WallAlignmentGuide } from './WallAlignmentGuide';

/**
 * Legacy in-tree wall tool (PRYZM 1 layout).  The spec moves this to a
 * stand-alone plugin in Phase E.1 (`15-subphases-E-families.md` row E.1).
 *
 * @deprecated TODO(E.1) — replaced by `plugins/wall/src/tool.ts`, which is
 *   already wired (the plugin dispatches via `runtime.bus.executeCommand`
 *   3 times in `tool.ts` and is exercised by 6+ test files including
 *   `tool-polyline.spec.ts`, `tool-arc.spec.ts`, `s10-handlers.test.ts`,
 *   `baseline-fixtures.test.ts`, `reload-persistence.test.ts`, and the
 *   Playwright integration suite).  Deletion of this file (and its
 *   sibling `src/elements/walls/` + `src/commands/walls/` directories)
 *   is gated on E-bus.1 (S79) retiring the 2 residual `commandManager.execute`
 *   reaches at `WallTool.ts:1508` and `:1578` — both inside this class.
 *   Migration order:
 *     1. E-finish.0.A: thread `runtime` into `ToolsPanelController` so
 *        `runtime.tools.activate('wall', mode)` runs the activator
 *        registered at `src/ui/Layout.ts:481` and suppresses the legacy
 *        `service.activateWallTool(mode)` fallback in
 *        `src/ui/tools-panel/panels/CreateRailPanel.ts:762`.
 *     2. E-bus.1: replace `commandManager.execute(new CreateWallCommand(...))`
 *        at lines 1508 and 1578 with `runtime.bus.executeCommand('wall.create', ...)`
 *        bound to `plugins/wall/src/handlers/`.
 *     3. E-finish.2 (E.1 lane): delete `src/elements/walls/` +
 *        `src/commands/walls/` once `rg "elements/walls|commands/walls" src/`
 *        returns 0 hits.
 *   See `docs/03_PRYZM3/00_NEW_ARCHITECTURE/phases/audits/PHASES-A-F-RECONCILIATION-2026-04-29/05-phase-E-audit-and-plan.md`.
 */
export class WallTool {
    private world: OBC.World;
    private callbacks: WallToolCallbacks;
    private projectContext: ProjectContext;

    private state: WallToolState = WallToolState.IDLE;
    private drawingMode: WallDrawingMode = WallDrawingMode.SINGLE;
    /** Contract §03-1.3: currently selected wall system type ID; undefined = plain wall */
    private selectedSystemTypeId: string | undefined = undefined;
    private startPoint: THREE.Vector3 | null = null;
    private firstPoint: THREE.Vector3 | null = null;
    private wallCount = 0;
    private isActive = false;
    private _disposed = false;
    /** §04-WALL-TOOL §5.1 — captured camera-controls input mapping so we can
     *  restore it on deactivate() without disturbing wheel-zoom / pinch / pan. */
    private _savedCameraInput: { left?: number; touchOne?: number } | null = null;

    private wallStore: WallStore;
    private fragmentBuilder: WallFragmentBuilder;
    private snapManager: SnapManager | null = null;
    private intentResolver: WallIntentResolver;
    private pathBuilder: WallPathBuilder;
    private dimensionPreview: DimensionPreview | null = null;

    /**
     * §04-12 Typed Dimension Input — captures digit keystrokes during DRAWING
     * and returns a locked end-point for wall creation.  Isolated to Tool layer.
     */
    private dimensionInput: WallDimensionInput | null = null;

    /**
     * §04-13 TAB Snap Reference Cycling — cycles through nearby wall snap
     * candidates when the user presses Tab in non-ortho drawing modes.
     * Isolated to Tool layer; read-only access to WallStore.
     */
    private snapCycler: WallSnapCycler | null = null;

    /**
     * §04-15 Revit-style Alignment Inference Guide — computes and renders
     * dashed alignment lines during DRAWING state.  Tool layer only; no store
     * mutations.  Priority below snap-cycler lock and typed-dimension lock.
     */
    private alignmentGuide: WallAlignmentGuide | null = null;

    /**
     * §WALL-AUDIT-2026-W4: Stored at construction time from callbacks.bimManager.
     * Constructor enforces non-null injection (throws otherwise) — every consumer
     * site reads this field directly with NO `window.bimManager` fallback.
     */
    private bimManager: any;

    /**
     * §WALL-AUDIT-2026-W4: Stored at construction time from callbacks.commandManager
     * so createWall(), createWallsFromSlab(), and friends do not reach into window
     * globals. Constructor enforces non-null injection (throws otherwise).
     */
    private commandManager: any;

    /**
     * §E FIX: Replaces window.lastPointerMoveEvent — stores the last
     * pointer-move event as a private instance field so no global state escapes.
     */
    private lastPointerMoveEvent: PointerEvent | null = null;

    private startAnchor: WallAnchor | null = null;

    private previewLine: THREE.Line | null = null;
    private startPointMarker: THREE.Mesh | null = null;
    private previewWall: THREE.Object3D | null = null; // CHANGED: Can be Mesh or Group

    private pointerDownHandler: ((e: PointerEvent) => void) | null = null;
    private pointerMoveHandler: ((e: PointerEvent) => void) | null = null;
    private keyDownHandler:     ((e: KeyboardEvent) => void) | null = null;
    private keyUpHandler:       ((e: KeyboardEvent) => void) | null = null;

    /**
     * Orthogonal-constraint override.
     * true  → wall direction is snapped to nearest 0°/90° axis regardless of drawing mode.
     * Activated by holding Shift while drawing; also toggled by Tab in ORTHO modes.
     */
    private isOrthoOverride = false;

    private statusOverlay: HTMLElement | null = null;

    private defaultWallHeight = 2.8;
    private defaultWallThickness = 0.2;

    constructor(
        world: OBC.World,
        callbacks: WallToolCallbacks,
        projectContext: ProjectContext
    ) {
        this.world = world;
        this.callbacks = callbacks;
        this.projectContext = projectContext;

        if (!callbacks.wallStore) {
            throw new Error('WallTool requires wallStore in callbacks');
        }
        this.wallStore = callbacks.wallStore;

        // ✅ FIX §1.1: Fail-fast if required dependencies are not injected.
        // Window-global fallbacks are eliminated — callers MUST supply these
        // through WallToolCallbacks. Reaching into window globals is a Contract §1.1
        // violation (no module should depend on implicit global state).
        if (!callbacks.bimManager) {
            throw new Error('[WallTool] bimManager must be injected via WallToolCallbacks.bimManager. Window-global fallback has been removed.');
        }
        this.bimManager = callbacks.bimManager;

        if (!callbacks.commandManager) {
            throw new Error('[WallTool] commandManager must be injected via WallToolCallbacks.commandManager. Window-global fallback has been removed.');
        }
        this.commandManager = callbacks.commandManager;

        // §4.3 FIX: wallStore removed from builder constructor — the builder must
        // not hold a live store reference. Opening render data is now resolved in the
        // main.ts subscriber and passed into buildWall() via OpeningRenderMap.
        //
        // §WALL-AUDIT-2026-M2: view-projection stores (viewDefinitionStore,
        // viewIntentInstanceStore, visibilityIntentStore) are now passed to the
        // builder via constructor injection so it no longer reads them from
        // window globals.
        //
        // §WALL-AUDIT-2026-M2 (RESOLVED 2026-04-24): the three view-projection
        // stores (viewDefinitionStore / viewIntentInstanceStore / visibilityIntentStore)
        // are now sourced from `WallToolCallbacks` instead of being read directly
        // from window-global. The single allowed bridge from window globals
        // to the wall subsystem now lives in `initTools.ts` where the WallTool is
        // constructed — this constructor no longer touches `window`. The builder
        // treats each store as optional and degrades gracefully when any is
        // absent (intent resolution returns undefined; 3D-only rendering still
        // works correctly).
        this.fragmentBuilder = new WallFragmentBuilder(
            world.scene.three as THREE.Scene,
            this.bimManager,
            {
                viewDefinitionStore:     callbacks.viewDefinitionStore     ?? null,
                viewIntentInstanceStore: callbacks.viewIntentInstanceStore ?? null,
                visibilityIntentStore:   callbacks.visibilityIntentStore   ?? null,
            },
        );
        this.intentResolver = new WallIntentResolver(this.wallStore);
        this.pathBuilder = new WallPathBuilder();

        this.dimensionPreview = new DimensionPreview(
            world.scene.three as THREE.Scene,
            world.camera.three,
            world.renderer!.three.domElement as HTMLCanvasElement
        );

        // §04-12 / §04-13: initialise isolated input modules
        this.dimensionInput = new WallDimensionInput(
            world.renderer!.three.domElement as HTMLCanvasElement
        );
        this.snapCycler = new WallSnapCycler(this.wallStore);

        // §04-15: Alignment inference guide (pure Tool-layer visual aid)
        this.alignmentGuide = new WallAlignmentGuide(
            world.scene.three as THREE.Scene,
            this.wallStore
        );

        this.initSnapManager();
    }

    private initSnapManager(): void {
        // §WALL-AUDIT-2026-W4: curtain-wall and grid stores now arrive via
        // WallToolCallbacks (injected from initTools.ts). The previous
        // window-global reads have been removed — when callers don't supply
        // these, the corresponding snap providers are simply omitted, which
        // matches the prior null-fallback behaviour.
        const cwStore  = this.callbacks.curtainWallStore ?? null;
        const gridStore = this.callbacks.gridStore ?? null;
        // §40 §4 — gridStore lets walls snap to BIM structural grids
        // (orthogonal AND linear) whenever any grid is visible.
        this.snapManager = SnapManager.createWithDefaults(
            this.world.scene.three as THREE.Scene,
            this.wallStore,
            cwStore,
            { gridStore }
        );
    }

    getSnapManager(): SnapManager | null {
        return this.snapManager;
    }

    get active(): boolean {
        return this.isActive;
    }

    get toolState(): WallToolState {
        return this.state;
    }

    getWallStore(): WallStore {
        return this.wallStore;
    }

    getFragmentBuilder(): WallFragmentBuilder {
        return this.fragmentBuilder;
    }

    /** Called by Layout when user picks a wall system type from the toolbar. */
    setSystemTypeId(id: string | undefined): void {
        this.selectedSystemTypeId = id;
    }

    getSystemTypeId(): string | undefined {
        return this.selectedSystemTypeId;
    }

    async activate(mode: WallDrawingMode = WallDrawingMode.SINGLE): Promise<void> {
        if (this.isActive) {
            this.drawingMode = mode;
            this.cancel(); // clear() inside resets pathBuilder to 'Line'
            // §FIX: Explicitly restore the correct path mode after cancel() clears it,
            // so switching from a curved mode back to a straight mode (or vice-versa)
            // while the tool is already active is handled correctly.
            this.pathBuilder.setMode(
                mode === WallDrawingMode.CURVED_WALL || mode === WallDrawingMode.POLYLINE_ARC
                    ? 'Arc' : 'Line'
            );
            return;
        }

        try {
            this.isActive = true;
            this.drawingMode = mode;
            this.state = WallToolState.IDLE;
            this.startPoint = null;
            this.firstPoint = null;
            this.wallCount = 0;

            // Contract §03-1.2: Explicitly set path builder mode for every activation so
            // a stale 'Arc' from a previous session cannot bleed into straight-wall modes.
            if (mode === WallDrawingMode.CURVED_WALL) {
                this.pathBuilder.setMode('Arc');
                this.showStatus('Wall Tool (Curved): Click start, then a point ON the arc (the arc passes through it), then end');
            } else {
                // All other modes (SINGLE, POLYLINE, LINE_ORTHO, POLYLINE_ARC,
                // POLYLINE_MIXED, etc.) start in Line mode.  POLYLINE_ARC overrides
                // to Arc on the first onPointerDown, which is the correct place for it.
                this.pathBuilder.setMode('Line');
                this.showStatus('Wall Tool: Click to set start point');
            }

            // Apply current visual style immediately with whatever HDRI is already cached.
            this.fragmentBuilder.setVisualStyle(this.callbacks.getCurrentVisualStyle());

            // §04-WALL-TOOL §5.1 — Suppress *orbit-on-left-drag* only.
            // Previously we set `controls.enabled = false`, which also killed
            // wheel zoom and pinch — the user reported being "stuck" at the
            // current zoom while drawing.  We now narrow the override to the
            // mouse/touch actions that conflict with point-placement and leave
            // wheel/right-drag/pinch untouched so the user can re-frame the
            // model mid-draw.  Numeric action codes mirror existing usage in
            // ViewController/ViewNavigationManager (1=ROTATE, 2=TRUCK, 0=NONE).
            const _ctrls = this.world.camera?.controls as any;
            if (_ctrls) {
                this._savedCameraInput = {
                    left: _ctrls.mouseButtons?.left,
                    touchOne: _ctrls.touches?.one,
                };
                if (_ctrls.mouseButtons) _ctrls.mouseButtons.left = 0; // ACTION.NONE
                if (_ctrls.touches) _ctrls.touches.one = 0;            // ACTION.TOUCH_NONE
            }

            this.attachEventListeners();
            console.log('WallTool activated with mode:', mode);

            // §WALL-SYSTEM-AUDIT-2026 — FIRST-CLICK PRE-WARM
            // The user-perceived latency between tool activation and the first
            // wall-creation click is dominated by code paths that are JIT-cold
            // until the first onPointerDown:
            //   • SnapManager.gatherCandidates() spatial-index queries
            //   • IntentResolver.resolveHitToAnchor() attribute lookups
            //   • WallFragmentBuilder shader/material warm-up via FastPathProjector
            //   • THREE.Raycaster scene traversal cache
            // We pre-warm these here, AFTER the tool is fully active and the
            // status hint is visible, but BEFORE the first user click.  All
            // calls are wrapped in try/catch and execute against a synthesised
            // origin point so they cannot mutate user state.
            try {
                const _activeLevelId = this.projectContext.activeLevelId;
                const _activeLevel   = _activeLevelId ? this.bimManager?.getLevelById(_activeLevelId) : undefined;
                const _elevation     = _activeLevel?.elevation ?? 0;
                const warmPoint = new THREE.Vector3(0, _elevation, 0);
                this.snapManager?.snap?.(warmPoint, undefined, true /* forceNoSnap */, 0.1);
                this.intentResolver?.resolveHitToAnchor?.(warmPoint, 0.1);
            } catch (e) {
                // Pre-warm failures are non-fatal — first click pays the original cost.
                console.debug('[WallTool] pre-warm skipped:', e);
            }

            // HDRI is loaded fire-and-forget so it never blocks tool activation.
            // It is only needed for Realistic visual style; load it in the background
            // and apply it only if the tool is still active when it resolves.
            void this.callbacks.getHdriTexture()
                .then((hdri) => {
                    if (!this.isActive) return;
                    this.fragmentBuilder.setHdriTexture(hdri);
                    this.fragmentBuilder.setVisualStyle(this.callbacks.getCurrentVisualStyle());
                })
                .catch((error) => {
                    console.warn('WallTool: HDRI unavailable; continuing without environment map.', error);
                });
        } catch (error) {
            console.error('WallTool failed to activate:', error);
            this.deactivate(); // Ensure cleanup on partial failure
            throw error; // Re-throw for ToolManager to handle
        }
    }

    setPathMode(mode: PathBuilderMode): void {
        this.pathBuilder.setMode(mode);
        this.cancel();
    }
    deactivate(): void {
        if (!this.isActive) return;
        this.cancel();
        this.isActive = false;
        this.detachEventListeners();
        this.hideStatus();

        // §04-WALL-TOOL §5.1 — Restore the prior mouse/touch action mapping
        // we captured in activate().  We never touched `controls.enabled`,
        // so wheel zoom remained available throughout the drawing session.
        const _ctrls = this.world.camera?.controls as any;
        if (_ctrls && this._savedCameraInput) {
            if (_ctrls.mouseButtons && this._savedCameraInput.left !== undefined) {
                _ctrls.mouseButtons.left = this._savedCameraInput.left;
            }
            if (_ctrls.touches && this._savedCameraInput.touchOne !== undefined) {
                _ctrls.touches.one = this._savedCameraInput.touchOne;
            }
        }
        this._savedCameraInput = null;

        console.log('WallTool deactivated');

        // §UI-ARCH CONTRACT §1.1: Notify the host (ToolManager) that this tool has
        // self-deactivated so it can reset activeTool → 'none' and re-enable
        // SelectionManager. This covers ALL deactivation paths (button click,
        // programmatic, createFromSelectedSlab, etc.) — not just the Finish/Cancel
        // button which previously had an explicit onCancel call.
        this.callbacks.onCancel?.();
    }

    cleanup(): void {
        this.deactivate();
        this.clearPreview();
        this.state = WallToolState.IDLE;
        this.startPoint = null;
        this.firstPoint = null;
        this.startAnchor = null;
        this.wallCount = 0;
    }

    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this.cleanup();
        this.fragmentBuilder.dispose();

        if (this.dimensionPreview) {
            this.dimensionPreview.dispose();
            this.dimensionPreview = null;
        }

        // §04-12 / §04-13: dispose isolated input modules
        if (this.dimensionInput) {
            this.dimensionInput.dispose();
            this.dimensionInput = null;
        }
        if (this.snapCycler) {
            this.snapCycler.dispose();
            this.snapCycler = null;
        }

        // §04-15: dispose alignment guide (removes scene lines and releases geometry)
        if (this.alignmentGuide) {
            this.alignmentGuide.dispose();
            this.alignmentGuide = null;
        }

        if (this.snapManager) {
            this.snapManager.dispose();
            this.snapManager = null;
        }

        if (this.statusOverlay && this.statusOverlay.parentNode) {
            this.statusOverlay.parentNode.removeChild(this.statusOverlay);
        }
    }

    getState(): WallToolState {
        return this.state;
    }

    cancel(): void {
        this.isOrthoOverride = false;
        this.clearPreview();
        if (this.dimensionPreview) {
            this.dimensionPreview.hide();
            this.dimensionPreview.setInputOverride(null);
        }
        // §04-12 / §04-13: clear typed input and snap cycling on any cancel
        this.dimensionInput?.reset();
        this.snapCycler?.reset();
        // §04-15: remove any rendered alignment guide lines
        this.alignmentGuide?.clear();
        this.state = WallToolState.IDLE;
        this.startPoint = null;
        this.startAnchor = null;
        this.firstPoint = null;
        this.pathBuilder.clear();
        this.wallCount = 0;

        if (this.mixedModeOverlay) {
            this.mixedModeOverlay.remove();
            this.mixedModeOverlay = null;
        }

        // Also ensure any global mixed mode selectors are removed
        const existingSelector = document.getElementById('wall-mixed-mode-selector');
        if (existingSelector) existingSelector.remove();

        if (this.isActive) {
            this.showStatus('Wall Tool: Click to set start point');
        }
    }

    /**
     * Switch drawing mode mid-session while preserving polyline continuity.
     *
     * Unlike activate(), which calls cancel() and resets all drawing state,
     * this method saves the current segment start point, swaps the mode, then
     * restores state so the next click continues from the same position.
     *
     * Called by BimService.switchWallDrawingMode(), which Layout.ts invokes when
     * the user presses L / O / C while the wall tool is already active.
     *
     * CONTRACT: §05 §7.1 — no direct store mutations; §01 §1.2 — tool layer only.
     */
    switchDrawingMode(newMode: WallDrawingMode): void {
        if (!this.isActive) {
            // Tool not yet running — just cache the mode for the next activate()
            this.drawingMode = newMode;
            return;
        }

        // ── Save continuity anchor ─────────────────────────────────────────────
        const savedStart  = this.startPoint?.clone()  ?? null;
        const savedFirst  = this.firstPoint?.clone()  ?? null;
        const savedAnchor = this.startAnchor;
        const wasDrawing  = this.state === WallToolState.DRAWING;

        // ── Clear visuals and path builder only ────────────────────────────────
        this.clearPreview();
        if (this.dimensionPreview) {
            this.dimensionPreview.hide();
            this.dimensionPreview.setInputOverride(null);
        }
        this.dimensionInput?.reset();
        this.snapCycler?.reset();

        // Remove any mixed-mode overlay that belongs to the old mode
        if (this.mixedModeOverlay) {
            this.mixedModeOverlay.remove();
            this.mixedModeOverlay = null;
        }
        const existingSelector = document.getElementById('wall-mixed-mode-selector');
        if (existingSelector) existingSelector.remove();

        // ── Apply new mode ─────────────────────────────────────────────────────
        this.drawingMode = newMode;
        this.isOrthoOverride = (newMode === WallDrawingMode.POLYLINE_ORTHO);

        // pathBuilder.setMode() also clears its internal points array — correct
        // behaviour here because we re-seed it with the saved start point below.
        this.pathBuilder.setMode(
            newMode === WallDrawingMode.POLYLINE_ARC ? 'Arc' : 'Line'
        );

        // ── Restore drawing continuity ─────────────────────────────────────────
        if (wasDrawing && savedStart) {
            this.state       = WallToolState.DRAWING;
            this.startPoint  = savedStart;
            this.firstPoint  = savedFirst;
            this.startAnchor = savedAnchor;

            // Seed the path builder with the saved start so the next click
            // produces a valid WallPath immediately (one point already placed).
            this.pathBuilder.addPoint(savedStart);

            if (this.snapManager) {
                this.snapManager.setActiveStartPoint(savedStart);
            }

            this.createStartMarker(savedStart);
            const modeLabel =
                newMode === WallDrawingMode.POLYLINE       ? 'Linear'
              : newMode === WallDrawingMode.POLYLINE_ORTHO ? 'Orthogonal'
              : newMode === WallDrawingMode.POLYLINE_ARC   ? 'Curved'
              : 'Wall';
            this.showStatus(`Wall Tool (${modeLabel}): Click to set next point  ·  Type m + Enter to lock length`);
        } else {
            // Was idle — stay idle with new mode ready for first click
            this.state       = WallToolState.IDLE;
            this.startPoint  = null;
            this.firstPoint  = null;
            this.startAnchor = null;
            this.showStatus('Wall Tool: Click to set start point');
        }
    }

    private attachEventListeners(): void {
        const canvas = this.world.renderer!.three.domElement;

        // Ensure we don't double-attach
        this.detachEventListeners();

        this.pointerDownHandler = (e: PointerEvent) => this.onPointerDown(e);
        this.pointerMoveHandler = (e: PointerEvent) => this.onPointerMove(e);
        this.keyDownHandler     = (e: KeyboardEvent) => this.onKeyDown(e);
        this.keyUpHandler       = (e: KeyboardEvent) => this.onKeyUp(e);

        canvas.addEventListener('pointerdown', this.pointerDownHandler);
        canvas.addEventListener('pointermove', this.pointerMoveHandler);
        window.addEventListener('keydown', this.keyDownHandler);
        window.addEventListener('keyup',   this.keyUpHandler);
    }

    private detachEventListeners(): void {
        const canvas = this.world.renderer!.three.domElement;

        if (this.pointerDownHandler) {
            canvas.removeEventListener('pointerdown', this.pointerDownHandler);
        }
        if (this.pointerMoveHandler) {
            canvas.removeEventListener('pointermove', this.pointerMoveHandler);
        }
        if (this.keyDownHandler) {
            window.removeEventListener('keydown', this.keyDownHandler);
        }
        if (this.keyUpHandler) {
            window.removeEventListener('keyup', this.keyUpHandler);
        }

        this.pointerDownHandler = null;
        this.pointerMoveHandler = null;
        this.keyDownHandler     = null;
        this.keyUpHandler       = null;

        // Clear ortho override so it doesn't bleed into the next activation.
        this.isOrthoOverride = false;
    }

    private async onPointerDown(event: PointerEvent): Promise<void> {
        if (!this.isActive) return;
        if (event.button !== 0) return;

        const worldPoint = this.getWorldPoint(event);
        if (!worldPoint) return;

        const levelId = this.projectContext.activeLevelId;
        // §WALL-AUDIT-2026-W4: ctor enforces non-null this.bimManager — no window fallback.
        const bimManager = this.bimManager;
        const level = bimManager?.getLevelById(levelId);

        // §Fix4: if level is missing, abort — getWorldPoint already returns null in this case,
        // but guard here too to prevent stale-elevation snappedPoint.y corruption.
        if (!level) {
            if (levelId) {
                console.warn(`[WallTool] onPointerDown: level "${levelId}" not found — click ignored.`);
            }
            return;
        }
        const elevation = level.elevation;

        // Use fuzzy resolution (30cm proximity)
        let currentAnchor = this.intentResolver.resolveHitToAnchor(worldPoint, 0.3);

        if (!currentAnchor) {
            const raycastHit = this.getRaycastHit(event);
            if (raycastHit) {
                currentAnchor = this.intentResolver.resolveHitToAnchor(raycastHit);
            }
        }

        const snappedPoint = currentAnchor ? currentAnchor.point.clone() : this.getSnappedPoint(worldPoint, event);
        snappedPoint.y = elevation;

        // Re-apply ortho constraint when the point came from an anchor snap (which bypasses
        // getSnappedPoint's built-in ortho logic). Only applies during DRAWING — the start
        // point itself has no reference, so constraining it would always snap to origin.
        if (this.state === WallToolState.DRAWING && this.startPoint) {
            const isOrthoMode = this.drawingMode === WallDrawingMode.LINE_ORTHO ||
                                this.drawingMode === WallDrawingMode.POLYLINE_ORTHO ||
                                this.isOrthoOverride;
            if (isOrthoMode) {
                const odx = Math.abs(snappedPoint.x - this.startPoint.x);
                const odz = Math.abs(snappedPoint.z - this.startPoint.z);
                if (odx > odz) {
                    snappedPoint.setZ(this.startPoint.z);
                } else {
                    snappedPoint.setX(this.startPoint.x);
                }
            }
        }

        // Ensure we strictly snap to first point if we are close to it in polyline modes
        const isPolyline = this.drawingMode === WallDrawingMode.POLYLINE || 
                          this.drawingMode === WallDrawingMode.POLYLINE_ARC || 
                          this.drawingMode === WallDrawingMode.POLYLINE_MIXED ||
                          this.drawingMode === WallDrawingMode.POLYLINE_MIXED_2 ||
                          this.drawingMode === WallDrawingMode.POLYLINE_ORTHO;

        if (isPolyline && this.firstPoint && this.state === WallToolState.DRAWING) {
            if (snappedPoint.distanceTo(this.firstPoint) < 0.25) {
                snappedPoint.copy(this.firstPoint);
                // Trigger closure — §UI-ARCH CONTRACT §1.1: fully deactivate so
                // SelectionManager is re-enabled after polyline closes by proximity.
                await this.createWall(this.startPoint!, snappedPoint);
                this.deactivate();
                return;
            }
        }

        if (this.state === WallToolState.IDLE) {
            this.startPoint = snappedPoint;
            this.startAnchor = currentAnchor;
            this.firstPoint = snappedPoint;

            if (this.drawingMode === WallDrawingMode.POLYLINE_ARC) {
                this.pathBuilder.setMode('Arc');
            } else if (this.drawingMode === WallDrawingMode.POLYLINE_MIXED || this.drawingMode === WallDrawingMode.POLYLINE_MIXED_2) {
                this.showMixedModeSelector(snappedPoint);
            } else if (this.drawingMode === WallDrawingMode.LINE_ORTHO || this.drawingMode === WallDrawingMode.POLYLINE_ORTHO) {
                this.pathBuilder.setMode('Line');
            }

            this.pathBuilder.addPoint(snappedPoint);
            this.state = WallToolState.DRAWING;

            if (this.drawingMode === WallDrawingMode.POLYLINE_MIXED_2) {
                this.pathBuilder.setMode('Line'); // Default to Line for the first segment
            }

            if (this.snapManager) {
                this.snapManager.setActiveStartPoint(snappedPoint);
            }

            this.createStartMarker(snappedPoint);
            // §04-12 FIX: Surface the "type mm" hint so users know digit-entry is available.
            this.showStatus(`Wall Tool: Click to set ${this.pathBuilder.getMode() === 'Arc' ? 'a point on the arc' : 'end'} point  ·  Type m + Enter to lock length`);
            return;
        }

        if (this.state === WallToolState.DRAWING) {
            // §04-12 / §04-13: If dimension input or snap cycler is active, the effective
            // end point was already locked.  Reset both on any confirmed click so the next
            // segment starts fresh.
            this.dimensionInput?.reset();
            this.snapCycler?.reset();
            if (this.dimensionPreview) this.dimensionPreview.setInputOverride(null);

            const path = this.pathBuilder.addPoint(snappedPoint);

            if (path) {
                (this as any).isOrthoOverride = false; // Reset override after segment
                this.createWallFromPath(path);
                this.wallCount++;

                if (this.drawingMode === WallDrawingMode.POLYLINE || 
                    this.drawingMode === WallDrawingMode.POLYLINE_ARC || 
                    this.drawingMode === WallDrawingMode.POLYLINE_MIXED ||
                    this.drawingMode === WallDrawingMode.POLYLINE_MIXED_2 ||
                    this.drawingMode === WallDrawingMode.POLYLINE_ORTHO) {

                    this.startPoint = path.end;
                    this.startAnchor = currentAnchor; // Use the end anchor as start for next segment

                    if (this.drawingMode === WallDrawingMode.POLYLINE_MIXED || this.drawingMode === WallDrawingMode.POLYLINE_MIXED_2) {
                        this.showMixedModeSelector(path.end);

                        // For Polyline Mix 2, we automatically prepare the next segment
                        if (this.drawingMode === WallDrawingMode.POLYLINE_MIXED_2) {
                            this.pathBuilder.setMode('Line'); // Reset to Line for next segment
                        }
                    }

                    this.pathBuilder.addPoint(path.end);

                    if (this.snapManager) {
                        this.snapManager.setActiveStartPoint(path.end);
                    }

                    this.createStartMarker(path.end);
                    this.showStatus('Wall Tool: Click to set next point  ·  Type m + Enter to lock length');
                } else {
                    // §UI-ARCH CONTRACT §1.1: For non-polyline modes (SINGLE, LINE_ORTHO,
                    // CURVED_WALL) the wall is complete after one segment. Fully deactivate
                    // so ToolManager re-enables SelectionManager immediately, allowing the
                    // user to click-select the newly created wall without first creating
                    // another element. Previously called cancel() which kept isActive=true.
                    this.deactivate();
                }
            } else {
                // For Arc mode, we need 3 points. After the 2nd point, we update startPoint for preview
                if (this.pathBuilder.getMode() === 'Arc') {
                    this.startPoint = snappedPoint;
                    this.startAnchor = currentAnchor;
                    this.showStatus('Wall Tool: Click to set end point');
                }
            }
        }
    }

    private mixedModeOverlay: HTMLElement | null = null;

    private showMixedModeSelector(point: THREE.Vector3) {
        if (this.mixedModeOverlay) this.mixedModeOverlay.remove();

        this.mixedModeOverlay = document.createElement('div');
        this.mixedModeOverlay.id = 'wall-mixed-mode-selector';
        this.mixedModeOverlay.className = 'th-mode-modal';

        const createOption = (label: string, mode: 'Line' | 'Arc', svgPath: string) => {
            const opt = document.createElement('div');
            opt.className = 'th-mode-opt';
            opt.onclick = () => {
                this.pathBuilder.setMode(mode);
                this.pathBuilder.addPoint(this.startPoint || point);
                this.showStatus(`Wall Tool: Drawing ${mode} segment`);
                this.mixedModeOverlay?.remove();
                this.mixedModeOverlay = null;
            };

            opt.innerHTML = `
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${svgPath}
                </svg>
                <span>${label}</span>
            `;
            return opt;
        };

        const lineOpt = createOption('Straight', 'Line', '<line x1="4" y1="20" x2="20" y2="4"></line>');
        const arcOpt = createOption('Arc', 'Arc', '<path d="M4 20C4 20 4 4 20 4"></path>');

        this.mixedModeOverlay.appendChild(lineOpt);

        if (this.drawingMode === WallDrawingMode.POLYLINE_MIXED_2) {
            const orthoOpt = createOption('Ortho', 'Line', '<path d="M4 20V4H20" stroke-dasharray="2,2"></path>');
            // Special click handler for Ortho in Mixed 2
            const originalClick = orthoOpt.onclick;
            orthoOpt.onclick = (e) => {
                this.isOrthoOverride = true;
                if (originalClick) originalClick.call(orthoOpt, e);
            };
            this.mixedModeOverlay.appendChild(orthoOpt);
        }

        this.mixedModeOverlay.appendChild(arcOpt);
        document.body.appendChild(this.mixedModeOverlay);
    }

    /**
     * Contract §03-1.2: Arc paths produce a single WallData with a curve descriptor
     * (start, end, control stored as plain {x,y,z} for structuredClone safety).
     * Line paths continue to produce a single straight wall.
     * This replaces the old behaviour of exploding arcs into N separate walls.
     */
    private async createWallFromPath(path: WallPath): Promise<void> {
        if (path.kind === 'Arc') {
            await this.createWall(path.start, path.end, undefined, path.control);
        } else {
            await this.createWall(path.start, path.end);
        }
    }

    private getRaycastHit(event: PointerEvent): THREE.Intersection | null {
        const canvas = this.world.renderer!.three.domElement;
        const rect = canvas.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);

        // Filter for walls
        const walls = this.world.scene.three.children.filter(obj => 
            obj instanceof THREE.Mesh && (obj.userData.elementType === 'wall' || obj.userData.wallId)
        );

        const intersects = raycaster.intersectObjects(walls);
        return intersects.length > 0 ? intersects[0] : null;
    }

    private onPointerMove(event: PointerEvent): void {
        if (!this.isActive) return;

        // §E FIX: Store last move event as instance field — no window global pollution.
        this.lastPointerMoveEvent = event;

        const worldPoint = this.getWorldPoint(event);
        if (!worldPoint) return;

        const snappedPoint = this.getSnappedPoint(worldPoint, event);

        const levelId = this.projectContext.activeLevelId;
        // §WALL-AUDIT-2026-W4: ctor enforces non-null this.bimManager — no window fallback.
        const bimManager = this.bimManager;
        const level = bimManager?.getLevelById(levelId);

        // §Fix4: if level is missing, abort — getWorldPoint already returns null in this case,
        // but guard here too to prevent stale-elevation snappedPoint.y corruption.
        if (!level) {
            if (levelId) {
                console.warn(`[WallTool] onPointerMove: level "${levelId}" not found — move ignored.`);
            }
            return;
        }
        const elevation = level.elevation;
        snappedPoint.y = elevation;

        if (this.state === WallToolState.DRAWING && this.startPoint) {
            // §04-13: Refresh snap candidates from the new cursor position
            // (only when not actively cycling through references)
            if (this.snapCycler) {
                this.snapCycler.updateCandidates(snappedPoint);
            }

            // §04-12 / §04-13: determine the effective end-point for preview
            // Priority: snap-cycler lock > dimension-input lock > alignment guide > cursor
            let effectiveEnd: THREE.Vector3 = snappedPoint;
            let dimOverride: string | null = null;

            if (this.snapCycler?.isActive) {
                const lockedPt = this.snapCycler.getLockedPoint();
                if (lockedPt) {
                    effectiveEnd = lockedPt;
                    const label = this.snapCycler.getLockedLabel();
                    const dist = this.startPoint.distanceTo(lockedPt);
                    dimOverride = label ? `${label}: ${dist.toFixed(3)} m` : `${dist.toFixed(3)} m`;
                }
            } else if (this.dimensionInput?.isActive) {
                const lockedEnd = this.dimensionInput.getLockedEndPoint(this.startPoint, snappedPoint);
                if (lockedEnd) {
                    effectiveEnd = lockedEnd;
                    const raw = this.dimensionInput.getRawBuffer();
                    dimOverride = `${raw}| m`;
                }
            }

            // §04-15: Alignment inference guide — lower priority than snap-cycler
            // and dimension-input. Only runs when neither higher-priority lock is active.
            if (this.alignmentGuide) {
                if (!this.snapCycler?.isActive && !this.dimensionInput?.isActive) {
                    const inference = this.alignmentGuide.update(
                        this.startPoint, snappedPoint, levelId, elevation
                    );
                    if (inference) {
                        effectiveEnd = inference.snappedPoint;
                        // Re-apply ortho constraint after alignment guide override.
                        // The guide's inferred snap point can be diagonal; mode must win.
                        const isOrthoMode = this.drawingMode === WallDrawingMode.LINE_ORTHO ||
                                            this.drawingMode === WallDrawingMode.POLYLINE_ORTHO ||
                                            this.isOrthoOverride;
                        if (isOrthoMode && this.startPoint) {
                            const adx = Math.abs(effectiveEnd.x - this.startPoint.x);
                            const adz = Math.abs(effectiveEnd.z - this.startPoint.z);
                            if (adx > adz) {
                                effectiveEnd = new THREE.Vector3(effectiveEnd.x, effectiveEnd.y, this.startPoint.z);
                            } else {
                                effectiveEnd = new THREE.Vector3(this.startPoint.x, effectiveEnd.y, effectiveEnd.z);
                            }
                        }
                    }
                } else {
                    // Higher-priority lock is active — suppress guide lines.
                    this.alignmentGuide.clear();
                }
            }

            this.updatePreview(this.startPoint, effectiveEnd);
            if (this.dimensionPreview) {
                // §04-12 FIX: set the override BEFORE calling update() so that
                // update() reads the current value and renders the correct label
                // on this frame rather than one frame behind.
                this.dimensionPreview.setInputOverride(dimOverride);
                this.dimensionPreview.update(this.startPoint, effectiveEnd, this.world.camera.three);
            }
        } else {
            if (this.dimensionPreview) {
                this.dimensionPreview.hide();
                this.dimensionPreview.setInputOverride(null);
            }
        }
    }

    private getSnappedPoint(worldPoint: THREE.Vector3, event: PointerEvent): THREE.Vector3 {
        let point = worldPoint;
        const screenPos = { x: event.clientX, y: event.clientY };

        // ── Priority 1: 3D SnapManager ────────────────────────────────────────
        // Works in both 3D and plan view — all snap types (endpoint, midpoint,
        // perpendicular, centerline, wall-join, curtain wall, etc.) are available
        // because they query the BIM store in world space, not screen space.
        // The SnapVisualizer renders coloured indicators in the Three.js scene
        // and is visible in plan view (orthographic camera) without changes.
        if (this.snapManager && this.snapManager.isEnabled()) {
            // §WALL-AUDIT-2026-W5: pass camera-zoom-aware tolerance so the snap
            // pipeline uses the same "touching" radius the WallJoinResolver uses.
            const _camForSnap = this.world.camera?.three;
            const _canvasForSnap = this.world.renderer?.three?.domElement as HTMLCanvasElement | undefined;
            const _snapTolerance = getWorldToleranceForActiveCamera(
                DEFAULT_SNAP_PIXEL_RADIUS,
                _camForSnap,
                _canvasForSnap,
            );
            const result = this.snapManager.snap(worldPoint, screenPos, false, _snapTolerance);
            if (result.snapped) {
                point = result.point;
                // Ortho is applied to the snapped point and we return immediately —
                // a BIM-store snap is always the highest-quality result.
                const isOrthoA = this.drawingMode === WallDrawingMode.LINE_ORTHO ||
                                 this.drawingMode === WallDrawingMode.POLYLINE_ORTHO ||
                                 this.isOrthoOverride;
                if (isOrthoA && this.startPoint) {
                    const dxa = Math.abs(point.x - this.startPoint.x);
                    const dza = Math.abs(point.z - this.startPoint.z);
                    if (dxa > dza) return new THREE.Vector3(point.x, point.y, this.startPoint.z);
                    else           return new THREE.Vector3(this.startPoint.x, point.y, point.z);
                }
                return point;
            }
            // SnapManager ran but found nothing — its visualizer is already hidden.
        }

        // ── Priority 2: 2D snap on projected TechnicalDrawing edges ──────────
        // Fallback for plan view when the BIM-store snap didn't fire (e.g. cursor
        // is near a projected line endpoint that is not yet committed to the store).
        // DOC-5.2 compliance: only active in plan view (OrthographicCamera) when
        // a TechnicalDrawing is mounted.
        const drawing2D = activePlanDrawingRef.drawing;
        const camera = this.world.camera.three;
        if (drawing2D && camera instanceof THREE.OrthographicCamera) {
            const canvas = this.world.renderer!.three.domElement;
            const snap2D = planView2DSnapService.querySnap(
                event.clientX, event.clientY,
                drawing2D, camera, canvas,
                worldPoint.y, // level elevation already resolved by getWorldPoint()
            );
            if (snap2D) {
                point = snap2D.worldPos;
            }
        }

        // ── Priority 3: Ortho constraint on whatever point we ended up with ──
        const isOrtho = this.drawingMode === WallDrawingMode.LINE_ORTHO ||
                        this.drawingMode === WallDrawingMode.POLYLINE_ORTHO ||
                        this.isOrthoOverride;
        if (isOrtho && this.startPoint) {
            const dx = Math.abs(point.x - this.startPoint.x);
            const dz = Math.abs(point.z - this.startPoint.z);
            if (dx > dz) return new THREE.Vector3(point.x, point.y, this.startPoint.z);
            else         return new THREE.Vector3(this.startPoint.x, point.y, point.z);
        }

        return point;
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.isActive) return;

        // ── §04-12: Typed Dimension Input ────────────────────────────────────
        // Intercept digit / period / backspace while the user is drawing.
        // The dimension input module consumes the key when it is relevant.
        if (this.state === WallToolState.DRAWING && this.dimensionInput) {
            const consumed = this.dimensionInput.handleKey(event.key);
            if (consumed) {
                event.preventDefault();

                // Update the 3-D preview along the locked direction.
                // §04-12 FIX: set the dim-preview override BEFORE calling update()
                // so the correct label is rendered this frame (not one frame behind).
                if (this.startPoint && this.lastPointerMoveEvent) {
                    const worldPoint = this.getWorldPoint(this.lastPointerMoveEvent);
                    if (worldPoint) {
                        const lockedEnd = this.dimensionInput.getLockedEndPoint(this.startPoint, worldPoint);
                        if (lockedEnd && this.dimensionPreview) {
                            const raw = this.dimensionInput.getRawBuffer();
                            this.dimensionPreview.setInputOverride(raw.length ? `${raw}| m` : null);
                            this.updatePreview(this.startPoint, lockedEnd);
                            this.dimensionPreview.update(this.startPoint, lockedEnd, this.world.camera.three);
                        } else if (this.dimensionPreview) {
                            // Buffer cleared (Backspace to empty) — restore auto label
                            this.dimensionPreview.setInputOverride(null);
                        }
                    }
                } else if (this.dimensionPreview && !this.dimensionInput.isActive) {
                    // Buffer was cleared (e.g. Escape) and no mouse move event yet —
                    // restore the auto label so the override badge disappears.
                    this.dimensionPreview.setInputOverride(null);
                }

                // If Escape cleared the buffer, do NOT propagate to tool deactivation
                if (event.key === 'Escape') return;
                return;
            }
        }

        // ── §04-13: TAB Snap Reference Cycling ───────────────────────────────
        // In non-ortho modes, Tab cycles through nearby snap candidates.
        // In ortho modes, Tab retains its existing ortho-override toggle behaviour.
        if (event.key === 'Tab' && this.state === WallToolState.DRAWING) {
            event.preventDefault();

            const isOrthoMode = this.drawingMode === WallDrawingMode.LINE_ORTHO ||
                                 this.drawingMode === WallDrawingMode.POLYLINE_ORTHO;

            if (isOrthoMode) {
                // Original behaviour: toggle orthogonal override
                this.isOrthoOverride = !this.isOrthoOverride;
            } else if (this.snapCycler && this.startPoint) {
                const candidate = this.snapCycler.cycleNext();
                if (candidate) {
                    const lockedPt = candidate.point;
                    this.updatePreview(this.startPoint, lockedPt);
                    if (this.dimensionPreview) {
                        // §04-12 FIX: set override BEFORE update so label is correct this frame
                        const dist = this.startPoint.distanceTo(lockedPt);
                        this.dimensionPreview.setInputOverride(
                            `${candidate.label}: ${dist.toFixed(3)} m`
                        );
                        this.dimensionPreview.update(this.startPoint, lockedPt, this.world.camera.three);
                    }
                    const count = this.snapCycler.getCandidateCount();
                    const idx = (this.snapCycler as any).currentIndex + 1;
                    this.showStatus(`Tab: ${candidate.label} (${idx}/${count}) — Enter to confirm`);
                } else {
                    // §04-13 FIX: No snap candidates nearby — give visible feedback so
                    // the user knows Tab was received and understands why nothing cycled.
                    this.showStatus('No nearby references to snap to  ·  Move cursor closer to walls, or type m + Enter');
                }
            }
            return;
        }

        // ── Escape ────────────────────────────────────────────────────────────
        if (event.key === 'Escape') {
            // §UI-ARCH CONTRACT §1.1: Escape fully deactivates the tool so that
            // ToolManager resets activeTool → 'none' and re-enables SelectionManager.
            this.deactivate();
            return;
        }

        // ── Enter ─────────────────────────────────────────────────────────────
        if (event.key === 'Enter') {
            if (this.state !== WallToolState.DRAWING) return;

            // §04-12: Confirm dimension-input wall if the user has typed a value
            if (this.dimensionInput?.isActive && this.startPoint && this.lastPointerMoveEvent) {
                const worldPoint = this.getWorldPoint(this.lastPointerMoveEvent);
                if (worldPoint) {
                    const lockedEnd = this.dimensionInput.getLockedEndPoint(this.startPoint, worldPoint);
                    if (lockedEnd) {
                        event.preventDefault();
                        this.dimensionInput.reset();
                        if (this.dimensionPreview) this.dimensionPreview.setInputOverride(null);
                        this.snapCycler?.reset();
                        // Route through pathBuilder so Arc mode is respected
                        const path = this.pathBuilder.addPoint(lockedEnd);
                        if (path) {
                            this.createWallFromPath(path);
                            this.wallCount++;
                            const isPolyline = this.isPolylineMode();
                            if (isPolyline) {
                                // Continue chain from the confirmed endpoint
                                this.startPoint = path.end.clone();
                                this.startAnchor = null;
                                this.pathBuilder.addPoint(path.end);
                                this.snapCycler?.reset();
                                if (this.snapManager) this.snapManager.setActiveStartPoint(path.end);
                                this.createStartMarker(path.end);
                                this.showStatus('Wall Tool: Click or type to set next point');
                            } else {
                                this.deactivate();
                            }
                        } else if (this.pathBuilder.getMode() === 'Arc') {
                            // Arc mode: treat confirmed point as the arc control point
                            this.startPoint = lockedEnd.clone();
                            this.startAnchor = null;
                            this.showStatus('Wall Tool: Click or type to set arc end point');
                        }
                        return;
                    }
                }
            }

            // §04-13: Confirm TAB-selected snap candidate
            if (this.snapCycler?.isActive && this.startPoint) {
                const lockedPt = this.snapCycler.getLockedPoint();
                if (lockedPt) {
                    event.preventDefault();
                    this.snapCycler.reset();
                    if (this.dimensionPreview) this.dimensionPreview.setInputOverride(null);
                    this.dimensionInput?.reset();
                    const path = this.pathBuilder.addPoint(lockedPt);
                    if (path) {
                        this.createWallFromPath(path);
                        this.wallCount++;
                        const isPolyline = this.isPolylineMode();
                        if (isPolyline) {
                            this.startPoint = path.end.clone();
                            this.startAnchor = null;
                            this.pathBuilder.addPoint(path.end);
                            if (this.snapManager) this.snapManager.setActiveStartPoint(path.end);
                            this.createStartMarker(path.end);
                            this.showStatus('Wall Tool: Click or type to set next point');
                        } else {
                            this.deactivate();
                        }
                    }
                    return;
                }
            }

            // Close polyline with Enter when 2+ walls drawn, otherwise deactivate
            const canClose = this.isPolylineMode()
                && this.wallCount >= 2
                && !!this.firstPoint
                && !!this.startPoint;
            if (canClose) {
                event.preventDefault();
                this.closePolyline();
                return;
            }

            // Default: finish / deactivate the tool
            this.deactivate();
        }
    }

    private onKeyUp(event: KeyboardEvent): void {
        if (!this.isActive) return;
        // Release Shift → clear the transient ortho-override so the next segment
        // returns to the mode's normal constraint behaviour.
        if (event.key === 'Shift') {
            this.isOrthoOverride = false;
        }
    }

    /** Returns true for all polyline drawing modes (used by §04-12/13 Enter handling). */
    private isPolylineMode(): boolean {
        return this.drawingMode === WallDrawingMode.POLYLINE ||
               this.drawingMode === WallDrawingMode.POLYLINE_ARC ||
               this.drawingMode === WallDrawingMode.POLYLINE_MIXED ||
               this.drawingMode === WallDrawingMode.POLYLINE_MIXED_2 ||
               this.drawingMode === WallDrawingMode.POLYLINE_ORTHO;
    }

    private getWorldPoint(event: PointerEvent): THREE.Vector3 | null {
        const canvas = this.world.renderer!.three.domElement;
        const rect = canvas.getBoundingClientRect();

        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.world.camera.three);

        const levelId = this.projectContext.activeLevelId;
        // §WALL-AUDIT-2026-W4: ctor enforces non-null this.bimManager — no window fallback.
        const bimManager = this.bimManager;
        const level = bimManager?.getLevelById(levelId);

        // §Fix4 / Contract §5.1: no fallback to 0 — if level is missing, abort the
        // preview intersection rather than silently placing geometry at world origin.
        if (!level) {
            if (levelId) {
                console.warn(`[WallTool] getWorldPoint: level "${levelId}" not found — preview aborted.`);
            }
            return null;
        }
        const elevation = level.elevation;

        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -elevation);
        const intersection = new THREE.Vector3();

        if (raycaster.ray.intersectPlane(groundPlane, intersection)) {
            return intersection;
        }
        return null;
    }

    private createStartMarker(_point: THREE.Vector3): void {
        // Disabled 2026-04-23: the blue 0.15 m sphere previously rendered at the
        // wall start point added no information beyond the preview line itself,
        // it floated 0.15 m above the level datum (so it was visibly out of
        // alignment with the cursor / preview wall on slabs and ramps), and it
        // visually competed with the snap markers. The preview wall + preview
        // baseline already communicate the start point unambiguously.
        //
        // The method is kept (as a no-op) so the existing call sites in the
        // pointer FSM remain valid; clearStartMarker() also stays as a defensive
        // guard for any in-flight markers from older sessions / hot reloads.
        this.clearStartMarker();
    }

    private updatePreview(start: THREE.Vector3, end: THREE.Vector3): void {
        this.clearPreviewWall();
        this.clearPreviewLine();

        const levelId = this.projectContext.activeLevelId;
        // §WALL-AUDIT-2026-W4: ctor enforces non-null this.bimManager — no window fallback.
        const bimManager = this.bimManager;
        const level = bimManager?.getLevelById(levelId);

        // §Fix4: if level is missing, abort preview entirely — do not silently use elevation 0.
        if (!level) {
            if (levelId) {
                console.warn(`[WallTool] updatePreview: level "${levelId}" not found — preview skipped.`);
            }
            return;
        }
        const elevation = level.elevation;

        // §E FIX: Read instance field (was window global).
        const moveEvent = this.lastPointerMoveEvent;
        const worldPoint = moveEvent ? this.getWorldPoint(moveEvent) : null;

        let currentEndAnchor: WallAnchor | null = null;
        if (worldPoint) {
            currentEndAnchor = this.intentResolver.resolveHitToAnchor(worldPoint, 0.3);
            if (!currentEndAnchor && moveEvent) {
                const raycastHit = this.getRaycastHit(moveEvent);
                if (raycastHit) {
                    currentEndAnchor = this.intentResolver.resolveHitToAnchor(raycastHit);
                }
            }
        }

        const placement = this.intentResolver.resolvePlacement(
            this.startAnchor || start,
            currentEndAnchor || end
        );

        const previewStart = placement.start.clone();
        const previewEnd = placement.end.clone();
        previewStart.y = elevation;
        previewEnd.y = elevation;

        if (this.pathBuilder.getMode() === 'Line') {
            this.renderLinePreview(previewStart, previewEnd);
        } else if (this.pathBuilder.getMode() === 'Arc') {
            const points = this.pathBuilder.getPoints();
            if (points.length === 1) {
                // First point placed, previewing control point
                const p0 = points[0].clone();
                p0.y = elevation;
                this.renderLinePreview(p0, previewEnd);
            } else if (points.length === 2) {
                // §WALL-SYSTEM-AUDIT-2026 — UNIFIED ARC INPUT METHOD
                // The 2nd click is interpreted as a point ON the arc at t = 0.5,
                // so we must derive the Bézier control from start, midThrough, end
                // for the live preview as well.  Mirrors WallPathBuilder.addPoint()
                // and WallPlanToolHandler._bezierControl.
                const p0      = points[0].clone();
                const midThru = points[1].clone();
                p0.y      = elevation;
                midThru.y = elevation;
                const control = new THREE.Vector3(
                    2 * midThru.x - 0.5 * (p0.x + previewEnd.x),
                    elevation,
                    2 * midThru.z - 0.5 * (p0.z + previewEnd.z),
                );
                const path: WallPath = { kind: 'Arc', start: p0, control, end: previewEnd };
                this.renderArcPreview(path);
            }
        }
    }

    private renderLinePreview(start: THREE.Vector3, end: THREE.Vector3): void {
        const direction = new THREE.Vector3().subVectors(end, start);
        const length = direction.length();
        if (length < 0.1) return;

        direction.normalize();

        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(start.x, start.y + 0.05, start.z),
            new THREE.Vector3(end.x, end.y + 0.05, end.z)
        ]);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x2196f3, linewidth: 2 });
        this.previewLine = new THREE.Line(lineGeometry, lineMaterial);
        this.previewLine.userData.isPreview = true;
        this.world.scene.three.add(this.previewLine);

        const wallGeometry = new THREE.BoxGeometry(length, this.defaultWallHeight, this.defaultWallThickness);
        const wallMaterial = new THREE.MeshStandardMaterial({
            color: 0x2196f3,
            transparent: true,
            opacity: 0.4,
            depthWrite: false
        });
        this.previewWall = new THREE.Mesh(wallGeometry, wallMaterial);

        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        this.previewWall.position.set(center.x, start.y + this.defaultWallHeight / 2, center.z);

        const angle = Math.atan2(direction.x, direction.z);
        this.previewWall.rotation.y = angle + Math.PI / 2;

        this.previewWall.userData.isPreview = true;
        this.world.scene.three.add(this.previewWall);

        // §WALL-AUDIT-2026-W4: fastPathProjectorService now arrives via callbacks.
        const _fastSvc = this.callbacks.fastPathProjectorService;
        if (_fastSvc) {
            _fastSvc.project(this.previewWall, this.world.camera.three);
        }
    }

    private renderArcPreview(path: WallPath): void {
        const points = PathResolver.toPolyline(path);
        const lineGeometry = new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, 0.05, p.z)));
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x2196f3, linewidth: 2 });
        this.previewLine = new THREE.Line(lineGeometry, lineMaterial);
        this.previewLine.userData.isPreview = true;
        this.world.scene.three.add(this.previewLine);

        // Create a group to hold all wall segments
        if (!this.previewWall) {
            const group = new THREE.Group();
            group.userData.isPreview = true;
            this.previewWall = group;
            this.world.scene.three.add(group);
        }

        // Render preview segments
        for (let i = 0; i < points.length - 1; i++) {
            const s = points[i];
            const e = points[i + 1];
            const dir = new THREE.Vector3().subVectors(e, s);
            const len = dir.length();
            if (len < 0.01) continue;
            dir.normalize();

            const wallGeom = new THREE.BoxGeometry(len, this.defaultWallHeight, this.defaultWallThickness);
            const wallMat = new THREE.MeshStandardMaterial({
                color: 0x2196f3,
                transparent: true,
                opacity: 0.2,
                depthWrite: false
            });
            const segment = new THREE.Mesh(wallGeom, wallMat);
            const center = new THREE.Vector3().addVectors(s, e).multiplyScalar(0.5);
            segment.position.set(center.x, this.defaultWallHeight / 2, center.z);
            segment.rotation.y = Math.atan2(dir.x, dir.z) + Math.PI / 2;
            segment.userData.isPreview = true;

            (this.previewWall as THREE.Group).add(segment);
        }
    }

    private clearPreview(): void {
        this.clearStartMarker();
        this.clearPreviewLine();
        this.clearPreviewWall();
    }

    private clearStartMarker(): void {
        if (this.startPointMarker) {
            this.world.scene.three.remove(this.startPointMarker);
            this.startPointMarker.geometry.dispose();
            (this.startPointMarker.material as THREE.Material).dispose();
            this.startPointMarker = null;
        }
    }

    private clearPreviewLine(): void {
        if (this.previewLine) {
            this.world.scene.three.remove(this.previewLine);
            this.previewLine.geometry.dispose();
            (this.previewLine.material as THREE.Material).dispose();
            this.previewLine = null;
        }
    }

    // CHANGED: Complete replacement with safe version
    private clearPreviewWall(): void {
        // §WALL-AUDIT-2026-W4: fastPathProjectorService via callbacks (no window read).
        this.callbacks.fastPathProjectorService?.clearFastPath();
        if (!this.previewWall) return;

        this.world.scene.three.remove(this.previewWall);

        // If it's a Group (Arc mode)
        if (this.previewWall instanceof THREE.Group) {
            this.previewWall.children.forEach(child => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose();

                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material?.dispose();
                    }
                }
            });
        }

        // If it's a Mesh (Line mode)
        else if (this.previewWall instanceof THREE.Mesh) {
            this.previewWall.geometry?.dispose();

            if (Array.isArray(this.previewWall.material)) {
                this.previewWall.material.forEach(m => m.dispose());
            } else {
                this.previewWall.material?.dispose();
            }
        }

        this.previewWall = null;
    }

    async createFromSelectedSlab(targetSlab?: any): Promise<void> {
        // Ensure tools don't interfere with selection
        this.deactivate();

        // §WALL-AUDIT-2026-W4: selectionManager and slabTool now arrive via
        // WallToolCallbacks. When the explicit `targetSlab` argument is passed,
        // these callbacks are not consulted at all.
        const selectionManager = this.callbacks.selectionManager;
        let selected = targetSlab || selectionManager?.selectedObject;

        // If nothing is selected, check if we have a current slab in the tool
        if (!selected) {
            const slabTool = this.callbacks.slabTool;
            if (slabTool?.currentSlab) {
                selected = slabTool.currentSlab;
            }
        }

        if (!selected || (selected.userData?.elementType?.toLowerCase() !== 'slab' && selected.userData?.type?.toLowerCase() !== 'slab')) {
            alert('Please select a slab first. (Click the slab to select it, then click "By Slab" again)');
            return;
        }

        const slabId = selected.userData.id;
        // §WALL-AUDIT-2026-W4: ctor enforces non-null this.commandManager — no window fallback.
        const commandManager = this.commandManager;

        // E.5.x P2d: resolve slab polygon from PRYZM-1 slabStore, then dispatch
        // wall.createFromSlab via the command bus with the full {levelId, perimeter}
        // payload that CreateWallsFromSlabHandler expects.
        //
        // window.slabStore is typed as `slabStore?: any` in src/global-window.d.ts §6
        // so no unsafe window cast is needed.  The bimManager resolves elevation
        // from the level record (same authority path as CreateWallsFromSlabCommand).
        //
        // Falls back to the legacy commandManager path when:
        //   • runtime is not yet available
        //   • 'wall.createFromSlab' is not registered in the bus
        //   • slabStore is missing / slab not found / polygon is degenerate
        //   • bus.executeCommand throws (e.g. canExecute validation failure)
        const runtime = this.callbacks.runtime;
        if (runtime && runtime.bus.registry.has('wall.createFromSlab')) {
            try {
                // ── Resolve slab geometry ──────────────────────────────────────────
                const slab = window.slabStore?.getById(slabId); // TODO(TASK-08)
                const levelId: string | undefined = slab?.levelId;
                const polygon: Array<{ x: number; y: number }> | undefined = slab?.polygon;
                const level = levelId ? this.bimManager?.getLevelById(levelId) : null;
                const elevation: number = level?.elevation ?? 0;

                if (slab && levelId && polygon && polygon.length >= 3) {
                    const pos: { x?: number; z?: number } = slab.position ?? {};
                    const offsetX = pos.x ?? 0;
                    const offsetZ = pos.z ?? 0;

                    // Map PRYZM-1 2D polygon (p.x = plan-X, p.y = plan-Z) to the 3D
                    // {x, y, z} vertices that CreateWallsFromSlabHandler expects.
                    const perimeter = polygon.map((p: { x: number; y: number }) => ({
                        x: p.x + offsetX,
                        y: elevation,
                        z: p.y + offsetZ,
                    }));

                    runtime.bus.executeCommand('wall.createFromSlab', {
                        levelId,
                        perimeter,
                        height:    this.defaultWallHeight,
                        thickness: this.defaultWallThickness,
                    });

                    if (selectionManager) selectionManager.unselectAll();
                    console.log(
                        `[WallTool] P2d ✅ wall.createFromSlab dispatched via runtime.bus — ` +
                        `slabId=${slabId} levelId=${levelId} edges=${perimeter.length}`,
                    );
                    return;
                }

                console.warn(
                    '[WallTool] P2d: slab not found in slabStore or polygon degenerate ' +
                    `(slabId=${slabId} polygon=${polygon?.length ?? 'missing'}) — falling back to commandManager.`,
                );
            } catch (err) {
                // Unexpected bus failure — fall through to the legacy path.
                console.warn('[WallTool] runtime.bus wall.createFromSlab failed — falling back to commandManager:', err);
            }
        }

        // Legacy fallback path.
        if (!commandManager) {
            console.error('CommandManager not available');
            return;
        }

        const command = new CreateWallsFromSlabCommand({
            slabId: slabId,
            wallHeight: this.defaultWallHeight,
            wallThickness: this.defaultWallThickness
        });

        const result = commandManager.execute(command);

        if (result.success) {
            // De-select the slab to show the new walls clearly
            if (selectionManager) selectionManager.unselectAll();
            console.log('Perimeter walls created for slab via command:', slabId);
        } else {
            console.error('Failed to create walls from slab:', result.info);
        }
    }

    private async createWall(start: THREE.Vector3, end: THREE.Vector3, levelId?: string, curveControl?: THREE.Vector3): Promise<void> {
        if (this.dimensionPreview) {
            this.dimensionPreview.hide();
        }
        const wallId = createId('wall');
        const finalLevelId = levelId || this.projectContext.activeLevelId;

        if (!finalLevelId) {
            throw new Error("Spatial Authority Violation: No active level selected for wall creation.");
        }

        // §WALL-AUDIT-2026-W4: ctor enforces non-null this.bimManager — no window fallback.
        const bimManager = this.bimManager;
        const level = bimManager?.getLevelById(finalLevelId);

        // §Fix4 / Contract §5.1: no fallback to 0 — if level is missing, abort wall creation.
        // CreateWallCommand also validates the level, but we catch it here for a clearer error.
        if (!level) {
            console.error(
                `[WallTool] §Fix4: createWall aborted — level "${finalLevelId}" not found in BimManager. ` +
                'Wall creation requires a valid level with a known elevation.'
            );
            return;
        }
        const elevation = level.elevation;
        const baseOffset = 0;

        const s = start.clone();
        const e = end.clone();
        s.y = elevation;
        e.y = elevation;

        // Contract §03-1.2: stamp curve descriptor when a control point is provided.
        // Control Y is set to elevation so the arc stays in the level plane.
        const curve = curveControl
            ? {
                control: { x: curveControl.x, y: elevation, z: curveControl.z },
                segments: 24
              }
            : undefined;

        const payload = {
            start: { x: s.x, z: s.z },
            end:   { x: e.x, z: e.z },
            height: this.defaultWallHeight,
            // Contract §03-1.3: thickness is overridden by the command if a systemTypeId is set
            thickness: this.defaultWallThickness,
            levelId: finalLevelId,
            baseOffset: baseOffset,
            curve,
            systemTypeId: this.selectedSystemTypeId
        };

        // E.5.x (E-bus.1 P2d): prefer runtime.bus.executeCommand('wall.create', ...)
        // when the runtime is available and the handler is registered in the bus.
        // Falls back to the legacy CreateWallCommand path otherwise.
        //
        // NOTE(E.5.x P2b-geometry): Bus records the command event for event-sourcing
        // and future undo-bus migration.  The legacy commandManager path BELOW still
        // runs unconditionally so WallFragmentBuilder geometry is triggered via the
        // wallStore.add() → subscriber chain.  Remove the legacy fall-through once
        // bus handlers schedule geometry directly (Phase E.5.x P3+).
        const runtime = this.callbacks.runtime;
        if (runtime && runtime.bus.registry.has('wall.create')) {
            console.log(`[WallTool] Dispatching wall.create via runtime.bus (E.5.x P2b) for level ${finalLevelId}${curve ? ' (curved)' : ''}`);
            try {
                // §FIX-WALL-SCHEMA-ID (2026-05-15): wallId is now createId('wall') = wall_<ULID>,
                // matching the ^wall_[0-9A-HJKMNP-TV-Z]{26}$ regex.  No hex-encode hack needed.
                runtime.bus.executeCommand('wall.create', { ...payload, id: wallId });
                console.log('[WallTool] wall.create dispatched to bus (id:', wallId, ')');
            } catch (err) {
                console.error('[WallTool] runtime.bus.executeCommand(wall.create) failed — proceeding via legacy path only:', err);
            }
            // No return — fall through to legacy commandManager for geometry build.
        }

        // Legacy fallback path (E-bus.1 — active until all callers supply runtime).
        console.log(`[WallTool] Executing CreateWallCommand with levelId: ${finalLevelId}${curve ? ' (curved)' : ''}`);
        const command = new CreateWallCommand(wallId, payload);
        // §WALL-AUDIT-2026-W4: ctor enforces non-null this.commandManager — no window fallback.
        const commandManager = this.commandManager;

        if (commandManager) {
            const result = commandManager.execute(command);
            if (result.success) {
                console.log('Wall created via command:', wallId);
            }
        } else {
            // §18.4 FIX: The fallback path that directly called wallStore.add() and
            // bimManager.registerElement() bypassed the command system entirely,
            // creating wall state without undo history, without validation, and with
            // dual spatial registration. This violates Contract §18.4 and §23.1.
            // If CommandManager is unavailable, wall creation must fail explicitly.
            console.error(
                '[WallTool] §18.4 VIOLATION PREVENTED: CommandManager is unavailable. ' +
                'Wall creation requires a functional CommandManager to maintain undo ' +
                'history and spatial integrity. Aborting wall creation for wall:', wallId
            );
        }
    }

    private showStatus(message: string): void {
        if (!this.statusOverlay) {
            this.statusOverlay = document.createElement('div');
            this.statusOverlay.className = 'th-overlay';

            // ── Instruction text ──────────────────────────────────────────────
            const text = document.createElement('span');
            text.id = 'wall-tool-status-text';
            text.className = 'th-text';
            this.statusOverlay.appendChild(text);

            // ── Separator (shown only when Close Polyline is available) ───────
            const sep = document.createElement('span');
            sep.id = 'wall-tool-sep';
            sep.className = 'th-sep';
            sep.style.display = 'none';
            this.statusOverlay.appendChild(sep);

            // ── Close Polyline inline action button ───────────────────────────
            const closeBtn = document.createElement('button');
            closeBtn.id = 'close-polyline-btn';
            closeBtn.className = 'th-close-btn';
            closeBtn.style.display = 'none';
            closeBtn.innerHTML = `<span class="th-key">↵</span><span>Close Polyline</span>`;
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                this.closePolyline();
            };
            this.statusOverlay.appendChild(closeBtn);

            document.body.appendChild(this.statusOverlay);
        }

        // Strip the "Wall Tool: " prefix and shorten the length-lock hint
        const displayMsg = message
            .replace(/^Wall Tool\s*[:(]\s*/i, '')
            .replace(/Type m \+ Enter to lock length/i, 'm+↵ lock');

        const textEl = this.statusOverlay.querySelector('#wall-tool-status-text');
        if (textEl) textEl.textContent = displayMsg;

        const canClose = this.isPolylineMode()
            && this.wallCount >= 2
            && !!this.firstPoint
            && !!this.startPoint;

        const closeBtn = this.statusOverlay.querySelector('#close-polyline-btn') as HTMLButtonElement;
        const sep      = this.statusOverlay.querySelector('#wall-tool-sep')       as HTMLElement;
        if (closeBtn) closeBtn.style.display = canClose ? '' : 'none';
        if (sep)      sep.style.display      = canClose ? '' : 'none';

        this.statusOverlay.style.display = 'flex';
    }

    private async closePolyline(): Promise<void> {
        if (this.firstPoint && this.startPoint) {
            // §2.11 Bug-C2 FIX: skip creation if the closing segment is shorter than
            // the minimum wall length (0.1 m) to avoid placing a degenerate mesh that
            // the raycaster cannot hit (the "limbo wall" defect).
            // This matches the guard in UpdateWallBaselineCommand.canExecute.
            const MIN_WALL_LEN = 0.1;
            if (this.startPoint.distanceTo(this.firstPoint) < MIN_WALL_LEN) {
                this.deactivate();
                return;
            }
            await this.createWall(this.startPoint, this.firstPoint);
            // §UI-ARCH CONTRACT §1.1: Polyline is closed — fully deactivate so
            // SelectionManager is re-enabled and the user can select walls immediately.
            this.deactivate();
        }
    }

    private hideStatus(): void {
        if (this.statusOverlay) {
            this.statusOverlay.style.display = 'none';
        }
    }

    updateVisualStyle(style: VisualStyle): void {
        this.fragmentBuilder.setVisualStyle(style);
        this.fragmentBuilder.updateAllMaterials();
    }

    async updateHdriTexture(): Promise<void> {
        const hdri = await this.callbacks.getHdriTexture();
        this.fragmentBuilder.setHdriTexture(hdri);
        this.fragmentBuilder.updateAllMaterials();
    }
}