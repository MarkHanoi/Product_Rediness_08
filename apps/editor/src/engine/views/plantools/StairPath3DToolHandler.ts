/**
 * StairPath3DToolHandler — sketch the modern polyline stair (I / L / U / curved)
 * directly in the 3D view, on the active level's ground plane.
 *
 * SPEC-STAIR-3D-CREATION (2026-05-22). Stair creation used to be plan-only
 * because the StairPathToolController's only view coupling was
 * `PlanViewCanvas.worldToScreen`. With that abstracted behind
 * `StairSketchCoordinateProvider` (§3 S1), this handler supplies a 3D provider
 * (project through the perspective camera) and forwards canvas pointer events as
 * world points resolved by a ground-plane raycast — exactly the slab/floor 3D
 * pattern (SlabTool.getPlanPoint, StairTool._getWorldPoint). Commit is the SAME
 * CreateStairCommand the plan path uses, so geometry, auto-opening, railings,
 * persistence and undo are identical (§3 S4).
 *
 * THREE is reached via the sanctioned `@pryzm/renderer-three/three` facade
 * (P2 — the same import StairTool/geometry packages already use).
 */

import * as THREE from '@pryzm/renderer-three/three';
import {
    StairPathToolController,
    resolveStairVerticalSpan,
    DEFAULT_STOREY_HEIGHT,
    type StairSketchCoordinateProvider,
    type StairLevelOption,
} from '@pryzm/geometry-stair';
// §FIX-STAIR-3D-CREATION-BLOCKED — the 3D sketch handler realises an implied
// level above (ADR-0098) through the SAME command the plan handler uses (P6).
import { AddLevelCommand } from '@pryzm/command-registry';

/** The minimal slice of the OBC `world` this handler reads (resolved live). */
interface World3DRefs {
    camera: { three: THREE.Camera };
    scene: { three: THREE.Object3D };
    renderer: { three: { domElement: HTMLCanvasElement } };
}

interface StairPath3DDeps {
    /** The live OBC world — camera/canvas read at activate() time. */
    getWorld: () => World3DRefs | null | undefined;
    /**
     * CommandManager for CreateStairCommand dispatch (StairPathToolController).
     * Method syntax (not an arrow property) so the concrete `CommandManager`
     * — whose `execute` takes a specific Command type — is assignable here
     * (method parameters are checked bivariantly).
     */
    commandManager: { execute(cmd: unknown): void };
    /** Resolve the active level id (base of the stair). */
    getActiveLevelId: () => string | null | undefined;
    /** Level catalogue accessor (sorted ascending by elevation is NOT required). */
    getLevels: () => Array<{ id: string; name?: string; label?: string; elevation?: number; height?: number }>;
}

export class StairPath3DToolHandler {
    private _ctrl: StairPathToolController | null = null;
    private _canvas: HTMLCanvasElement | null = null;
    private _onPointerDown: ((e: PointerEvent) => void) | null = null;
    private _onPointerMove: ((e: PointerEvent) => void) | null = null;
    private _onDblClick:    ((e: MouseEvent) => void) | null = null;
    private _onContextMenu: ((e: MouseEvent) => void) | null = null;
    /** Camera-controls enabled-state captured at activate() so we can restore it. */
    private _restoreControls: (() => void) | null = null;
    /** SelectionManager enabled-state captured at activate() so we can restore it. */
    private _restoreSelection: (() => void) | null = null;
    /**
     * §FIX-STAIR-DUAL-VIEW-ACTIVATION — the API object this handler published to
     * `window.stairPathTool`. Kept so `deactivate()` only clears the global when it
     * still OWNS it: with plan + 3D armed in parallel (the fix), the plan handler
     * publishes its own API when the pointer enters the plan pane, and its teardown
     * on mouse-leave must not blank the relay the 3D sketch is still using.
     */
    private _publishedApi: unknown = null;
    /**
     * §FIX-STAIR-DUAL-VIEW-ACTIVATION — shape remembered across a plan-focus
     * suspension so `resumeAfterPlanBlur()` restores the same sketch mode.
     */
    private _shape: 'I' | 'L' | 'U' | undefined;
    /** True while suspended because the plan pane owns the pointer. */
    private _suspendedForPlanFocus = false;
    private _unsubPlanFocus: (() => void) | null = null;
    private _unsubPlanBlur:  (() => void) | null = null;

    constructor(private _deps: StairPath3DDeps) {}

    /** True when the handler currently owns an active controller. */
    get active(): boolean { return this._ctrl !== null; }

    /** True while suspended because the split-view plan pane has tool focus. */
    get suspendedForPlanFocus(): boolean { return this._suspendedForPlanFocus; }

    /**
     * §FIX-STAIR-DUAL-VIEW-ACTIVATION — plan/3D focus arbitration.
     *
     * With both surfaces armed, the pane the pointer is over must own the sketch.
     * `SvpPlanToolOverlay` already broadcasts exactly that on `mouseenter` /
     * `mouseleave` (`svp:tool-focus` / `svp:tool-blur`), and `PlanViewToolOverlay`
     * already consumes the same pair to pause/resume itself. We consume it verbatim
     * — no new mechanism — so at most ONE `StairPathToolController` is live at a
     * time. That matters concretely: the controller mounts singleton DOM by id
     * (`#spt-param-panel`, `#spt-hud-bar`, `#spt-run-info`), so two live controllers
     * would collide.
     */
    suspendForPlanFocus(): void {
        if (this._suspendedForPlanFocus || !this._ctrl) return;
        this._suspendedForPlanFocus = true;
        this._teardown();
    }

    /** Re-arm the 3D sketch when the plan pane gives the pointer back. */
    resumeAfterPlanBlur(): void {
        if (!this._suspendedForPlanFocus) return;
        this._suspendedForPlanFocus = false;
        this.activate(this._shape);
    }

    activate(shape?: 'I' | 'L' | 'U'): boolean {
        // Re-entrancy guard — destroy any prior controller first.
        this.deactivate();
        this._shape = shape;
        this._bindPlanFocusArbitration();

        const world = this._deps.getWorld();
        if (!world) {
            console.error('[StairPath3DToolHandler] no 3D world available');
            return false;
        }
        const camera = world.camera.three;
        const canvas = world.renderer.three.domElement;
        this._canvas = canvas;

        const lvl = this._resolveStairLevels();
        if (!lvl) {
            console.error('[StairPath3DToolHandler] could not resolve two levels for stair');
            return false;
        }

        const groundY = lvl.baseLevelElevation;

        // 3D coordinate provider — project world XZ on the ground plane through
        // the perspective camera into canvas-local px for the overlay polyline.
        // The overlay canvas is sized to the 3D canvas rect, so canvas-local px
        // (0..width / 0..height) is the correct space.
        const provider: StairSketchCoordinateProvider = {
            worldToScreen: (x: number, z: number) => {
                const v = new THREE.Vector3(x, groundY, z);
                v.project(camera);                       // → NDC (-1..1)
                const rect = canvas.getBoundingClientRect();
                return {
                    sx: (v.x * 0.5 + 0.5) * rect.width,
                    sy: (-v.y * 0.5 + 0.5) * rect.height,
                };
            },
        };

        // §STAIR-ACTIVATE-GUARD (2026-06-23) — controller construction,
        // _ctrl.activate() and _bindPointerEvents() all run AFTER we disable
        // camera-controls (§STAIR-CLICK-FIX) and SelectionManager
        // (§STAIR-CLICK-FIX-2). If any of them throws, deactivate() would never
        // run and both stay permanently off → the whole viewport goes dead
        // (no orbit, no selection). Wrap the setup so a throw always restores
        // controls + selection via deactivate().
        try {
        this._ctrl = new StairPathToolController({
            container:          document.body,
            coordinateCanvas:   canvas,             // overlay aligns to the 3D viewport
            coordinateProvider: provider,
            commandManager:     this._deps.commandManager,
            baseLevelId:        lvl.baseLevelId,
            topLevelId:         lvl.topLevelId,
            baseLevelElevation: lvl.baseLevelElevation,
            topLevelElevation:  lvl.topLevelElevation,
            levelOptions:       lvl.levels,
            width:              1.2,
            turnDirection:      'left',
            secondRunSide:      'left',
            initialShape:       shape,
            onCancel: () => this.deactivate(),
            onComplete: () => this.deactivate(),
        });
        this._ctrl.activate();

        // §STAIR-CLICK-FIX (2026-06-22) — the 3D sketch handler binds its own DOM
        // listeners directly on the THREE canvas (it bypasses ToolManager, which
        // is what normally disables camera-controls for the element tools). With
        // camera-controls still live, a press-drag-release on the canvas is eaten
        // by the orbit gesture and our place-point click never produces a stair —
        // the exact "tool activates but clicking does nothing" symptom. Disable
        // camera-controls for the lifetime of the sketch and restore on deactivate.
        try {
            const controls = (world as unknown as {
                camera?: { controls?: { enabled?: boolean } };
            }).camera?.controls;
            if (controls && typeof controls.enabled === 'boolean') {
                const prev = controls.enabled;
                controls.enabled = false;
                this._restoreControls = () => { try { controls.enabled = prev; } catch { /* ignore */ } };
                console.log('[Stair] §STAIR-CONTROLS-OFF camera-controls disabled while sketching');
            }
        } catch (err) {
            console.warn('[Stair] could not toggle camera-controls (non-fatal):', err);
        }

        // §STAIR-CLICK-FIX-2 (2026-06-23) — disabling camera-controls (above)
        // stops the ORBIT gesture from eating the press, but the SelectionManager
        // binds a *bubble-phase* `click` listener on this same canvas
        // (SelectionManager.ts) and `click` is a SEPARATE synthetic event — the
        // capture-phase pointerdown `stopPropagation()` below does NOT suppress it
        // (SelectionManager itself documents this). Because the 3D stair handler is
        // invoked DIRECTLY by BimService and BYPASSES ToolManager, the
        // `selectionManager.setEnabled(false)` that ToolManager.activateTool() runs
        // for every other element tool never fires here — so each place-point click
        // also raycasts + selects an element, surfacing the contextual edit bar and
        // making it look like "the click did nothing / no start point was set".
        // Mirror ToolManager: disable selection for the lifetime of the sketch and
        // restore it on deactivate (same capture/restore shape as _restoreControls).
        try {
            const sm = window.selectionManager;
            if (sm && typeof sm.setEnabled === 'function') {
                const prevEnabled = sm.enabled !== false;   // default-on if unset
                sm.setEnabled(false);
                this._restoreSelection = () => { try { sm.setEnabled(prevEnabled); } catch { /* ignore */ } };
                console.log('[Stair] §STAIR-SELECTION-OFF SelectionManager disabled while sketching');
            }
        } catch (err) {
            console.warn('[Stair] could not toggle SelectionManager (non-fatal):', err);
        }

        this._bindPointerEvents(camera, canvas, groundY);

        // Parity with the plan handler — expose the public API global so the
        // ribbon param relays (window.stairPathTool.updateParams) still work.
        this._publishedApi = this._getPublicApi();
        window.stairPathTool = this._publishedApi as typeof window.stairPathTool;
        window.runtime?.events?.emit('stair-path-tool:activated', {});
        console.log(`[StairPath3DToolHandler] activated in 3D (shape=${shape ?? 'free'}, groundY=${groundY})`);
        return true;
        } catch (e) {
            // §STAIR-ACTIVATE-GUARD — restore camera-controls + selection.
            console.warn('[stair] activate failed', e);
            this.deactivate();
            return false;
        }
    }

    /**
     * Subscribe to the split-view plan pane's existing focus broadcast. Idempotent —
     * `activate()` re-enters through `deactivate()`, which unbinds first.
     */
    private _bindPlanFocusArbitration(): void {
        if (this._unsubPlanFocus || this._unsubPlanBlur) return;
        const events = window.runtime?.events;
        if (!events?.on) return;
        const subFocus = events.on('svp:tool-focus', () => this.suspendForPlanFocus());
        const subBlur  = events.on('svp:tool-blur',  () => this.resumeAfterPlanBlur());
        this._unsubPlanFocus = subFocus ? () => subFocus.dispose() : null;
        this._unsubPlanBlur  = subBlur  ? () => subBlur.dispose()  : null;
    }

    private _unbindPlanFocusArbitration(): void {
        this._unsubPlanFocus?.(); this._unsubPlanFocus = null;
        this._unsubPlanBlur?.();  this._unsubPlanBlur  = null;
    }

    deactivate(): void {
        this._unbindPlanFocusArbitration();
        this._suspendedForPlanFocus = false;
        this._teardown();
    }

    /**
     * Tear down the live sketch (controller, canvas listeners, camera-controls and
     * SelectionManager restores, published API) WITHOUT dropping the plan-focus
     * arbitration subscription — so a suspension can be resumed.
     */
    private _teardown(): void {
        if (this._canvas) {
            // Removal options MUST match the capture flag used at add time.
            if (this._onPointerDown) this._canvas.removeEventListener('pointerdown', this._onPointerDown, { capture: true } as EventListenerOptions);
            if (this._onPointerMove) this._canvas.removeEventListener('pointermove', this._onPointerMove);
            if (this._onDblClick)    this._canvas.removeEventListener('dblclick',    this._onDblClick,    { capture: true } as EventListenerOptions);
            if (this._onContextMenu) this._canvas.removeEventListener('contextmenu', this._onContextMenu, { capture: true } as EventListenerOptions);
        }
        this._onPointerDown = this._onPointerMove = null;
        this._onDblClick = this._onContextMenu = null;
        this._canvas = null;

        // §STAIR-CLICK-FIX — restore camera-controls to its pre-sketch state.
        if (this._restoreControls) { this._restoreControls(); this._restoreControls = null; }
        // §STAIR-CLICK-FIX-2 — restore SelectionManager to its pre-sketch state.
        if (this._restoreSelection) { this._restoreSelection(); this._restoreSelection = null; }

        if (this._ctrl) {
            this._ctrl.deactivate();
            this._ctrl.destroy();
            this._ctrl = null;
        }
        // §FIX-STAIR-DUAL-VIEW-ACTIVATION — only clear the relay global if we still
        // own it. The plan handler publishes its own API while the pointer is in the
        // plan pane; blanking THAT would silently break the ribbon param relay.
        if (this._publishedApi && window.stairPathTool === this._publishedApi) {
            window.stairPathTool = undefined;
        }
        this._publishedApi = null;
        window.runtime?.events?.emit('stair-path-tool:deactivated', {});
    }

    // ── Pointer → world (ground-plane raycast) ────────────────────────────────

    private _bindPointerEvents(camera: THREE.Camera, canvas: HTMLCanvasElement, groundY: number): void {
        const raycaster = new THREE.Raycaster();
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -groundY);

        const toWorld = (e: MouseEvent): { x: number; z: number } | null => {
            const rect = canvas.getBoundingClientRect();
            const ndc = new THREE.Vector2(
                ((e.clientX - rect.left) / rect.width) * 2 - 1,
                -((e.clientY - rect.top) / rect.height) * 2 + 1,
            );
            raycaster.setFromCamera(ndc, camera);
            const target = new THREE.Vector3();
            // intersectPlane returns null when the ray is parallel/behind — honour it.
            return raycaster.ray.intersectPlane(plane, target) ? { x: target.x, z: target.z } : null;
        };

        this._onPointerMove = (e: PointerEvent) => {
            const p = toWorld(e);
            if (p) this._ctrl?.feedMove(p.x, p.z);
        };
        this._onPointerDown = (e: PointerEvent) => {
            if (e.button === 2) return;          // right-click handled by contextmenu
            // §STAIR-CLICK-FIX — claim the gesture in the CAPTURE phase before
            // camera-controls / SelectionManager can treat it as an orbit/select,
            // mirroring MarqueeSelectionTool. Without this the place-point press
            // was consumed by the camera and no stair point was ever set.
            e.preventDefault();
            e.stopPropagation();
            const p = toWorld(e);
            console.log('[Stair] §STAIR-CLICK at', p ? `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})` : 'NO-HIT (ground raycast missed)', 'state=', this._ctrl?.state ?? 'null');
            if (!p) return;
            this._ctrl?.feedClick(p.x, p.z);
            console.log('[Stair] §STAIR-POINT-SET state=', this._ctrl?.state ?? 'null');
        };
        this._onDblClick = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const p = toWorld(e);
            console.log('[Stair] §STAIR-CREATE dispatched (double-click finish) at', p ? `(${p.x.toFixed(2)}, ${p.z.toFixed(2)})` : 'NO-HIT');
            if (p) this._ctrl?.feedDoubleClick(p.x, p.z);
        };
        this._onContextMenu = (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            this._ctrl?.feedRightClick();
        };

        // CAPTURE phase + passive:false so preventDefault() actually suppresses
        // the camera orbit gesture (camera-controls binds in the bubble phase).
        canvas.addEventListener('pointermove', this._onPointerMove, { passive: false });
        canvas.addEventListener('pointerdown', this._onPointerDown, { capture: true, passive: false });
        canvas.addEventListener('dblclick',    this._onDblClick,    { capture: true });
        canvas.addEventListener('contextmenu', this._onContextMenu, { capture: true });
    }

    private _getPublicApi() {
        const ctrl = this._ctrl;
        return {
            get state() { return ctrl?.state ?? 'idle'; },
            activate:     () => ctrl?.activate?.(),
            deactivate:   () => ctrl?.deactivate?.(),
            updateParams: (p: Parameters<StairPathToolController['updateParams']>[0]) =>
                ctrl?.updateParams(p),
        };
    }

    // ── Level resolution (base = active level; top = adjacent above) ──────────

    private _resolveStairLevels(): {
        baseLevelId: string;
        topLevelId: string;
        baseLevelElevation: number;
        topLevelElevation: number;
        levels: StairLevelOption[];
    } | null {
        const raw = this._deps.getLevels();
        if (!raw || raw.length === 0) {
            console.error('[StairPath3DToolHandler] project has no levels');
            return null;
        }

        // Base = the active level, else the lowest level in the project.
        const sortedRaw = [...raw].sort(
            (a, b) => (a.elevation ?? a.height ?? 0) - (b.elevation ?? b.height ?? 0),
        );
        const baseLevelId = this._deps.getActiveLevelId() ?? sortedRaw[0]?.id ?? '';

        // §FIX-STAIR-3D-CREATION-BLOCKED — route through the SINGLE vertical-span
        // chokepoint (ADR-0098 / L-243), exactly as StairPathPlanToolHandler does.
        // The old code HARD-REQUIRED two pre-existing levels (`raw.length < 2 →
        // null`); on a fresh single-level project the 3D sketch therefore declined
        // (`activate()` returned false) and BimService fell back to the plan/legacy
        // path — which has no overlay in the 3D view, so nothing was created. That
        // asymmetry is the "stair can only be created in plan now" regression: the
        // plan handler stopped requiring two levels (it IMPLIES the one above), but
        // this 3D handler was never updated to match. Parity is restored here.
        let span = resolveStairVerticalSpan(raw, baseLevelId, DEFAULT_STOREY_HEIGHT);

        if (span.status === 'needs-level-above') {
            // ADR-0098 — the stair IMPLIES the level above; realise it with a
            // COMMAND (P6), then re-resolve against the mutated level set. Never
            // trust the payload we just sent — read the store back.
            if (!this._createImpliedLevelAbove(span.suggestedName, span.suggestedElevation, span.height)) {
                console.error('[StairPath3DToolHandler] could not create the implied level above');
                return null;
            }
            span = resolveStairVerticalSpan(this._deps.getLevels(), baseLevelId, DEFAULT_STOREY_HEIGHT);
        }

        if (span.status !== 'ok') {
            console.error('[StairPath3DToolHandler] stair span unresolvable:',
                span.status === 'unresolvable' ? span.reason : span.status);
            return null;
        }

        const levels: StairLevelOption[] = [...this._deps.getLevels()]
            .sort((a, b) => (a.elevation ?? a.height ?? 0) - (b.elevation ?? b.height ?? 0))
            .map((l, i) => ({
                id:        String(l.id),
                name:      String(l.name ?? l.label ?? `Level ${i + 1}`),
                elevation: Number(l.elevation ?? l.height ?? 0),
            }));

        return {
            baseLevelId:        span.baseLevelId,
            topLevelId:         span.topLevelId,
            baseLevelElevation: span.baseElevation,
            topLevelElevation:  span.topElevation,
            levels,
        };
    }

    /**
     * ADR-0098 / §FIX-STAIR-3D-CREATION-BLOCKED — create the level the stair
     * implies, through `AddLevelCommand` (P6: commands are the only mutation
     * path). `AddLevelCommand.execute()` is synchronous, so a re-resolve against
     * the levels immediately afterwards observes the new level. Mirrors
     * StairPathPlanToolHandler._createImpliedLevelAbove.
     */
    private _createImpliedLevelAbove(name: string, elevation: number, height: number): boolean {
        try {
            const levelId = `level-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
            this._deps.commandManager.execute(new AddLevelCommand({ levelId, name, elevation, height }));
            return true;
        } catch (err) {
            console.error('[StairPath3DToolHandler] AddLevelCommand failed:', err);
            return false;
        }
    }
}
