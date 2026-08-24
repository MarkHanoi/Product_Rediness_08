/**
 * SvpPlanToolOverlay — Contract 17 Phase 2, Contract 26
 *
 * Gives the Split View secondary pane full element-creation parity with the
 * left-panel plan view. Works alongside SplitViewManager and PlanViewToolOverlay.
 *
 * Architecture:
 *   - Creates a transparent overlay canvas positioned over the SVP canvas.
 *   - Instantiates its own separate set of PlanToolHandler instances so the SVP
 *     handler state never interferes with the left-panel's handler state.
 *   - Dispatches `svp:tool-focus` / `svp:tool-blur` window events to coordinate
 *     with PlanViewToolOverlay:
 *       mouse enters SVP  → pause left-panel handler, activate SVP handler
 *       mouse leaves SVP  → cancel SVP handler, resume left-panel handler
 *   - Uses PlanViewCanvas.screenToWorld() for pixel → world conversion (no
 *     secondary WebGPU/WebGL context; pure Canvas2D).
 *   - SvpSnapService mirrors PlanViewInteraction.querySnap() — endpoint /
 *     midpoint / perpendicular — Phase 3 snap parity (Contract 17b).
 *
 * CONTRACT §01 §4  — No direct scene mutations; only creation commands dispatched
 *                    by the PlanToolHandler implementations themselves.
 * CONTRACT §05 §2  — All new CSS uses the svp- prefix.
 * CONTRACT §15     — No WebGPU or WebGL context created here.
 * CONTRACT §17 §4  — Phase 2: element creation in the split view.
 * CONTRACT §26     — Plan view element creation parity.
 */

import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './plantools/PlanToolHandler';
import type { PlanViewCanvas }    from '@pryzm/core-app-model';
import type { ViewDefinition }    from '@pryzm/core-app-model';
import { viewPlaneFromDefinition }  from '@pryzm/core-app-model';
import { viewDefinitionStore }      from '@pryzm/core-app-model';
import { DEFAULT_PLAN_VIEW_ID }     from '@pryzm/core-app-model';

// §FIX-PLAN-VIEW-PARITY (L-73) — the SVP plan pane now builds its handler map from the
// SAME shared registry the MAIN plan overlay uses (createPlanToolHandlers), so the two
// surfaces expose an IDENTICAL capability set by construction. Previously this map was
// a hand-maintained subset that drifted from PlanViewToolOverlay's — north-arrow,
// scale-bar and matchline were missing here, so those tools silently did nothing in
// split view (the founder's L-73 gap), and Move/Align/Copy were re-added ad hoc.
// The factory returns FRESH instances, preserving the long-standing invariant that the
// split pane's tool state never aliases the standalone plan view's.
import { createPlanToolHandlers } from './plantools/planToolHandlerRegistry';

// ── SVP handler registry — one fresh instance per handler key (shared registry) ──
const SVP_TOOL_HANDLERS: Readonly<Record<string, PlanToolHandler>> = createPlanToolHandlers();

const ACTIVE_TOOL_KEYS = new Set(Object.keys(SVP_TOOL_HANDLERS));

// ── Universal snap engine (Contract 32) ─────────────────────────────────────
//
// SVP snap is delegated to the SAME `PlanSnapEngine` used by the left-panel
// PlanViewInteraction.  This guarantees every snap family (endpoint, midpoint,
// perpendicular, grid-line, grid-intersection, segment-intersection, nearest)
// is available in BOTH panes — Contract 32 universal-snap parity.
//
// The previous bespoke `SvpSnapService` only handled endpoint / midpoint /
// perpendicular and shared the same `__cacheVersion` staleness bug; both are
// fixed by routing through the engine.

import { PlanSnapEngine } from '@pryzm/core-app-model';
import { getStairToolConfig } from '@pryzm/geometry-stair';
// §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — the ONE floor-finish config chokepoint.
import { getFloorToolConfig } from '@pryzm/core-app-model/stores';
import { trace } from '@opentelemetry/api';
// §FIX-PLAN-TOOL-ESCAPE-RUNAWAY (L-7800) — the two-stage Escape decision for
// PLAN-ONLY tools (balcony / lift / pool). A no-op for every ToolManager-owned
// tool, so this import cannot change Escape for wall, slab, roof or any sibling.
import { planOnlyToolEscape } from '@app/ui/create/activatePlanOnlyTool';

// §FIX-PLAN-WALLTOOL-ARM-ON-ACTIVATE (L-66) — P8: one OTel span per new exported entry point.
const _svpPlanToolOverlayTracer = trace.getTracer('@pryzm/editor.svp-plan-tool-overlay', '0.1.0');

// ── Main class ────────────────────────────────────────────────────────────

export class SvpPlanToolOverlay {
    private _active     = false;
    private _svpFocused = false;
    private _paused     = false;

    // Injected on attach
    private _svpCanvas:  HTMLCanvasElement | null = null;
    /** §GRID-SPLITVIEW / §GRID-BUTTON-CENSUS - "+ Grid" for the split-view plan pane.
     *  A CHILD of '.svp-pane' ('.vco-create-btn'), never body-parented. */
    private _gridBtn:    HTMLButtonElement | null = null;
    private _planCanvas: PlanViewCanvas   | null = null;
    private _viewId:     string                  = DEFAULT_PLAN_VIEW_ID;

    // Overlay canvas for tool previews
    private _overlay: HTMLCanvasElement        | null = null;
    private _ctx:     CanvasRenderingContext2D | null = null;

    // Snap tooltip
    private _snapTooltip: HTMLDivElement | null = null;

    // Universal snap engine — Contract 32 (shared family with PlanViewInteraction)
    private readonly _snapSvc = new PlanSnapEngine();

    // Tool state
    private _activeTool:    string            = 'none';
    private _activeHandler: PlanToolHandler  | null = null;
    private _toolUnsub:     (() => void)     | null = null;
    /**
     * §FIX-PLAN-TOOL-POINTER-UNREACHABLE (L-7002) — true while the ACTIVE tool was
     * armed PROGRAMMATICALLY (`setActiveTool`) rather than by the ToolManager.
     *
     * The plan-only families (`pool`, `balcony`) and the ContextualEditBar's transient
     * tools are armed this way and are invisible to the ToolManager, so a ToolManager
     * `'none'` notification must not be read as "put that tool away". See the
     * subscription in `attach()` for the measurement.
     */
    private _programmaticTool = false;

    // Last snap result (for drawing indicator in onMouseMove).
    // Contract 32 — snapType is the full universal-snap union.
    private _lastSnapInfo: {
        worldX: number; worldZ: number;
        snapType:
            | 'endpoint' | 'midpoint' | 'perpendicular'
            | 'grid-line' | 'grid-intersection' | 'intersection' | 'nearest';
        screenX: number; screenY: number;
    } | null = null;

    // Window-level focus listeners (remove on detach)
    private _focusUnlisteners: Array<() => void> = [];

    // Bound event handlers
    private readonly _bMouseEnter = this._onMouseEnter.bind(this);
    private readonly _bMouseLeave = this._onMouseLeave.bind(this);
    private readonly _bMouseDown  = this._onMouseDown.bind(this);
    private readonly _bMouseMove  = this._onMouseMove.bind(this);
    private readonly _bMouseUp    = this._onMouseUp.bind(this);
    private readonly _bDblClick   = this._onDblClick.bind(this);
    private readonly _bKeyDown    = this._onKeyDown.bind(this);

    // ── Lifecycle ─────────────────────────────────────────────────────────

    /**
     * Attach the overlay to the SVP canvas.
     * Called by SplitViewManager after its own canvas is ready.
     */
    attach(
        svpCanvas:  HTMLCanvasElement,
        planCanvas: PlanViewCanvas,
        viewId:     string,
    ): void {
        this.detach();
        this._active     = true;
        this._svpCanvas  = svpCanvas;
        this._planCanvas = planCanvas;
        this._viewId     = viewId;

        // ── Wire snap service ─────────────────────────────────────────────
        this._snapSvc.attach(planCanvas, viewId);

        // ── Transparent overlay canvas for tool previews ───────────────────
        const overlay = document.createElement('canvas');
        overlay.style.cssText = [
            'position:fixed',
            'top:0',
            'left:0',
            'pointer-events:none',
            'z-index:6',
        ].join(';');
        document.body.appendChild(overlay);
        this._overlay = overlay;
        this._ctx     = overlay.getContext('2d');

        // ── Snap tooltip ─────────────────────────────────────────────────
        const tip = document.createElement('div');
        tip.id = 'svp-overlay-snap-tip';
        Object.assign(tip.style, {
            position:      'fixed',
            pointerEvents: 'none',
            background:    'rgba(22,26,34,0.92)',
            color:         '#e2e8f0',
            fontSize:      '11px',
            fontFamily:    'system-ui, sans-serif',
            fontWeight:    '500',
            padding:       '3px 8px',
            borderRadius:  '4px',
            border:        '1px solid rgba(255,255,255,0.10)',
            boxShadow:     '0 2px 8px rgba(0,0,0,0.35)',
            zIndex:        '10001',
            display:       'none',
            userSelect:    'none',
            whiteSpace:    'nowrap',
        });
        document.body.appendChild(tip);
        this._snapTooltip = tip;

        this._syncOverlaySize();
        this._mountGridButton();

        // ── SVP canvas events ─────────────────────────────────────────────
        svpCanvas.addEventListener('mouseenter', this._bMouseEnter);
        svpCanvas.addEventListener('mouseleave', this._bMouseLeave);
        svpCanvas.addEventListener('mousedown',  this._bMouseDown, { capture: true });
        svpCanvas.addEventListener('dblclick',   this._bDblClick,  { capture: true });
        window.addEventListener('mousemove', this._bMouseMove);
        window.addEventListener('mouseup',   this._bMouseUp);
        // §FIX-PLAN-SPACE-ROUTING (L-129) — capture phase, see _onKeyDown. Mirrors
        // the main plan overlay so the split-view plan pane wins SPACE over the 3D
        // placement tools' document-capture consumers.
        window.addEventListener('keydown',   this._bKeyDown, { capture: true });

        // ── Coordinate with PlanViewToolOverlay ───────────────────────────
        // F.events.10 — svp:tool-focus-ack via runtime.events
        const subFocusAck = window.runtime?.events?.on('svp:tool-focus-ack', (payload: unknown) => {
            const svpOwns = (payload as Record<string, unknown>)?.svp === true;
            if (!svpOwns) this._paused = false;
        });
        if (subFocusAck) this._focusUnlisteners.push(() => subFocusAck.dispose());

        // F.events.10 — svp:drawing-refreshed via runtime.events
        const subDrawingRefreshed = window.runtime?.events?.on('svp:drawing-refreshed', () => {
            this._snapSvc.notifyDrawingChanged();
        });
        if (subDrawingRefreshed) this._focusUnlisteners.push(() => subDrawingRefreshed.dispose());

        // ── Subscribe to toolManager ──────────────────────────────────────
        const tm = window.toolManager;
        if (tm?.subscribe) {
            this._activeTool = tm.getActiveTool?.() ?? 'none';
            this._toolUnsub  = tm.subscribe((tool: string) => {
                // ⛔ §FIX-PLAN-TOOL-POINTER-UNREACHABLE (L-7002) — DO NOT CLOBBER A
                // PLAN-ONLY TOOL WITH THE TOOLMANAGER'S IDLE STATE.
                //
                // MEASURED, 2026-08-22, before this guard: arm `balcony` through the
                // palette (`activatePlanOnlyTool` -> `setActiveTool('balcony')`), then
                // let the ToolManager notify `'none'` — as it does on EVERY
                // `deactivateAll()`, which selection, Escape and half the UI trigger.
                //   `isPlacing()` true  ->  notify('none')  ->  `isPlacing()` FALSE.
                // The tool disarmed itself with nothing on screen changing, and the
                // user's next click did nothing. That is one measured cause of the
                // founder's `Handler activated: balcony` x11: a person re-arming a tool
                // that keeps putting itself away.
                //
                // A plan-only tool (`pool`, `balcony`) has NO `TOOL_MANAGER_TOOL_KEYS`
                // entry by design, so the ToolManager can neither own it nor know it is
                // armed. `'none'` from the ToolManager therefore means "the TOOLMANAGER
                // has no tool", which is ALREADY TRUE and says nothing about this
                // overlay. A notification naming a REAL tool is different — that tool
                // genuinely takes over, and the branch below runs as it always did.
                if (this._programmaticTool && tool === 'none') return;
                this._programmaticTool = false;
                this._deactivateHandler();
                this._activeTool = tool;
                if (this._svpFocused && !this._paused) {
                    this._activateHandler(tool);
                }
                this._updateCursor();
                this._hideSnapTooltip();
            });
        }

        console.log('[SvpPlanToolOverlay] Attached with snap service. viewId:', viewId);
    }

    detach(): void {
        if (!this._active) return;
        this._active     = false;
        this._svpFocused = false;
        this._paused     = false;
        this._programmaticTool = false;

        this._toolUnsub?.();
        this._toolUnsub = null;

        this._deactivateHandler();

        this._svpCanvas?.removeEventListener('mouseenter', this._bMouseEnter);
        this._svpCanvas?.removeEventListener('mouseleave', this._bMouseLeave);
        this._svpCanvas?.removeEventListener('mousedown',  this._bMouseDown, { capture: true } as EventListenerOptions);
        this._svpCanvas?.removeEventListener('dblclick',   this._bDblClick,  { capture: true } as EventListenerOptions);
        window.removeEventListener('mousemove', this._bMouseMove);
        window.removeEventListener('mouseup',   this._bMouseUp);
        window.removeEventListener('keydown',   this._bKeyDown, { capture: true } as EventListenerOptions);

        for (const fn of this._focusUnlisteners) fn();
        this._focusUnlisteners = [];

        this._snapSvc.detach();

        if (this._svpCanvas) {
            this._svpCanvas.style.cursor = '';
            this._svpCanvas.classList.remove('svp-tool-active');
        }

        this._overlay?.remove();
        this._overlay = null;
        this._ctx     = null;

        // §GRID-SPLITVIEW — tear down the "+ Grid" entry button with the overlay.
        this._gridBtn?.remove();
        this._gridBtn = null;

        this._snapTooltip?.remove();
        this._snapTooltip = null;

        this._svpCanvas  = null;
        this._planCanvas = null;

        console.log('[SvpPlanToolOverlay] Detached');
    }

    /** Call when SVP canvas is resized so the overlay buffer stays in sync. */
    notifyResize(): void {
        this._syncOverlaySize();
        this._activeHandler?.redraw();
    }

    /** Update the viewId (e.g. when the user changes the level in the SVP header). */
    setViewId(viewId: string): void {
        this._viewId = viewId;
        this._snapSvc.setViewId(viewId);
    }

    /**
     * §FIX-PLAN-WALLTOOL-ARM-ON-ACTIVATE (L-66) — split-view parity for the wall
     * draw-arm invariant (see PlanViewToolOverlay.ensureWallDrawArmed). Guarantees the
     * SVP wall handler is armed when the "Draw Wall" panel is up AND this pane already
     * has mouse focus, so the first click in the split-view plan pane draws without an
     * "Apply" pre-click. Unlike the left panel, the SVP handler is scoped to focus (it
     * mounts on mouseenter / tears down on mouseleave), so this only re-arms a focused
     * pane that raced the async tool-activate; when the pane is not focused it is a
     * no-op (the mouseenter path arms it on hover, before any click). Idempotent.
     */
    ensureWallDrawArmed(): void {
        _svpPlanToolOverlayTracer.startActiveSpan('pryzm.svp_plan_tools.ensure_wall_draw_armed', (span) => {
            try {
                const focused = this._active && this._svpFocused && !this._paused;
                const isWall  = this._activeTool === 'wall';
                const alreadyArmed = this._activeHandler !== null;
                span.setAttribute('pryzm.svp.focused', focused);
                span.setAttribute('pryzm.svp.is_wall', isWall);
                span.setAttribute('pryzm.svp.already_armed', alreadyArmed);
                if (!focused || !isWall || alreadyArmed) {
                    span.setAttribute('pryzm.svp.armed_now', false);
                    return;
                }
                this._activateHandler('wall');
                this._updateCursor();
                span.setAttribute('pryzm.svp.armed_now', this._activeHandler !== null);
            } catch (err) {
                span.recordException(err as Error);
            } finally {
                span.end();
            }
        });
    }

    /** True while this overlay is attached to a live SVP canvas (Contract 34/17). */
    isAttached(): boolean {
        return this._active;
    }

    /**
     * §FIX-PLAN-SPACE-ROUTING (L-129) — true while a plan-tool placement handler is
     * armed on this split-view overlay. The global SPACE-pan shortcut (initTools)
     * consults this so it yields SPACE to the active plan handler while placing.
     */
    isPlacing(): boolean {
        return this._active && !this._paused && this._activeHandler !== null;
    }

    /**
     * §FIX-PLAN-TOOL-FINISH-GESTURE (L-9303) — does the handler armed on THIS surface
     * hold uncommitted stroke state right now?
     *
     * ⭐ THE ESCAPE DECISION IS A PROPERTY OF THE TOOL, NOT OF ONE PANE. A plan-only
     * tool is armed on EVERY attached plan surface at once (`activatePlanOnlyTool`
     * loops both overlays), and the two hold SEPARATE handler instances from the shared
     * registry — so the outline lives in exactly one of them. Both overlays listen for
     * Escape on `window` in the capture phase, and the FIRST to run used to decide the
     * two-stage gesture from its OWN handler alone. With the main plan surface also up,
     * that first reader is the EMPTY one: it reports "no stroke", `planOnlyToolEscape`
     * takes stage 2, and the half-drawn outline in the other pane is disarmed out from
     * under the architect. This method is what lets `planOnlyToolEscape` ask the
     * question of the WHOLE tool instead of one arbitrary pane.
     */
    hasActiveStroke(): boolean {
        if (!this._active || !this._activeHandler) return false;
        return !!(this._activeHandler as { hasActiveStroke?: () => boolean }).hasActiveStroke?.();
    }

    /**
     * §FIX-PLAN-ELEMENT-TOOL-PARITY (L-95) — C11 element-creation/plan-tools pipeline.
     *
     * Split-view parity for `PlanViewToolOverlay.setActiveTool`. The ContextualEditBar
     * element tools (Move / Copy-place / Align) activate a plan-tool handler PROGRAMMATICALLY
     * via `<overlay>.setActiveTool(tool)`, bypassing the ToolManager. Previously only the
     * MAIN overlay exposed this, so in the split-view plan pane a "Move window" (etc.) had
     * no overlay to drive — the tool did nothing. This mirrors the main overlay's method so
     * the SAME handler (from the single shared `planToolHandlerRegistry`) runs against the
     * SVP canvas and commits the SAME command (e.g. window → `window.setOffset` / MOVE_WINDOW).
     *
     * `setActiveTool('none')` deactivates without activating another. Idempotent + safe:
     * no-op when this overlay is not attached. The handler drives clicks via `_onMouseDown`
     * (which only needs `_activeHandler`), so it works whether or not the pane has hover
     * focus at activation time; entering the pane arms hover preview via `_onMouseEnter`.
     */
    setActiveTool(tool: string): void {
        _svpPlanToolOverlayTracer.startActiveSpan('pryzm.svp_plan_tools.set_active_tool', (span) => {
            try {
                span.setAttribute('pryzm.svp.tool', tool);
                span.setAttribute('pryzm.svp.attached', this._active);
                if (!this._active) {
                    // Not the active plan surface — the caller routes to whichever overlay
                    // IS attached (see ContextualEditBar._activatePlanTool). No warning noise.
                    return;
                }
                // ⭐ §FIX-PLAN-TOOL-POINTER-UNREACHABLE (L-7001) — IDEMPOTENT RE-ARM.
                // Arming the tool that is ALREADY armed used to tear the handler down
                // and build a new one, which (a) discarded any in-progress stroke — a
                // half-drawn pool outline evaporating because the user clicked the
                // palette row again to check it had "taken" — and (b) is one measured
                // cause of the founder's `Handler activated: balcony` repeating x11,
                // x8, x5. A second click on the same row is now a no-op, exactly as a
                // second press of an already-pressed toggle should be.
                if (tool === this._activeTool && this._activeHandler !== null) {
                    this._programmaticTool = true;
                    span.setAttribute('pryzm.svp.armed', true);
                    span.setAttribute('pryzm.svp.rearm_skipped', true);
                    return;
                }
                this._deactivateHandler();
                this._activeTool = tool;
                this._programmaticTool = tool !== 'none';
                this._updateCursor();
                if (tool !== 'none') {
                    this._activateHandler(tool);
                }
                this._clearOverlay();
                span.setAttribute('pryzm.svp.armed', this._activeHandler !== null);
            } catch (err) {
                span.recordException(err as Error);
            } finally {
                span.end();
            }
        });
    }

    // ── Focus coordination ────────────────────────────────────────────────

    /**
     * Returns true if `el` is inside a floating tool-UI panel that belongs to
     * the currently active tool (e.g. the stair param panel, a HUD overlay).
     * When the mouse moves from the SVP canvas into one of these panels we must
     * NOT tear down the handler — the user is adjusting parameters, not leaving.
     */
    private _isToolUiElement(el: EventTarget | null): boolean {
        if (!(el instanceof Element)) return false;
        // Stair path param panel
        const sptPanel = document.getElementById('spt-param-panel');
        if (sptPanel && sptPanel.contains(el)) return true;
        // Stair path HUD bar (bottom status strip)
        const sptHudBar = document.getElementById('spt-hud-bar');
        if (sptHudBar && sptHudBar.contains(el)) return true;
        // Stair path per-run info strip
        const sptRunInfo = document.getElementById('spt-run-info');
        if (sptRunInfo && sptRunInfo.contains(el)) return true;
        // Generic: any element that carries the data attribute used by tool overlays
        const asEl = el as HTMLElement;
        if (asEl.closest?.('[data-svp-tool-ui]')) return true;
        return false;
    }

    private _onMouseEnter(_e: MouseEvent): void {
        if (!ACTIVE_TOOL_KEYS.has(this._activeTool)) return;
        this._svpFocused = true;
        if (this._paused) return;
        // Guard: if a handler is already active for this tool, do NOT create a
        // second one — this prevents the flicker loop caused by the mouse rapidly
        // entering/leaving (e.g. when the param panel overlaps the SVP canvas).
        if (this._activeHandler) return;
        window.runtime?.events?.emit('svp:tool-focus', {}); // F.events.10
        this._activateHandler(this._activeTool);
        this._updateCursor();
    }

    private _onMouseLeave(e: MouseEvent): void {
        if (!this._svpFocused) return;
        // Do NOT deactivate if the mouse moved into a floating tool UI panel.
        // Destroying the handler while the user is clicking a panel control
        // would cause the panel to vanish mid-interaction (the primary flicker).
        if (this._isToolUiElement(e.relatedTarget)) return;
        this._svpFocused = false;
        // §T-B1 (DAILY-USE-AUDIT 2026-05-20) — DO NOT deactivate the handler if it is
        // mid-stroke. Architect drawing a 6-point slab in the SVP reaches for the
        // toolbar; without this guard `_deactivateHandler()` calls
        // `handler.deactivate()` which sets `_points = []` / `_wallFirstPoint = null`
        // and the entire polyline evaporates. We blur focus + hide the snap tooltip
        // but PRESERVE the handler's intermediate state so the user can come back
        // and continue the stroke. The handler's own `deactivate()` runs only on
        // (a) Escape, (b) explicit tool switch (ToolManager), (c) project switch.
        const handlerActiveStroke = !!(this._activeHandler as { hasActiveStroke?: () => boolean } | null)?.hasActiveStroke?.();
        if (!handlerActiveStroke) {
            this._deactivateHandler();
        }
        this._hideSnapTooltip();
        // Only clear the preview overlay when the handler IS being deactivated;
        // mid-stroke we keep the partial polyline visible so the user can see
        // what's pending when they return.
        if (!handlerActiveStroke) this._clearOverlay();
        window.runtime?.events?.emit('svp:tool-blur', {}); // F.events.10
        this._updateCursor();
    }

    // ── Tool handler lifecycle ────────────────────────────────────────────

    private _activateHandler(tool: string): void {
        // §P1.3-B (IMPL-PLAN-2026-05-17): Assert the init-complete sentinel before
        // activating any plan-tool handler (mirrors PlanViewToolOverlay §R3-SENTINEL).
        if (!window.__pryzmInitComplete) {
            console.error(
                '[SvpPlanToolOverlay] §R3-SENTINEL: initTools did not complete — ' +
                'commandManager / wallStore not available. ' +
                'Check initTools.ts for a thrown error before the §R3-SENTINEL line.'
            );
            this._activeHandler = null;
            return;
        }
        const handler = SVP_TOOL_HANDLERS[tool] ?? null;
        const ctx     = handler ? this._buildCtx() : null;
        if (handler && ctx) {
            // Contract 32 — eagerly warm the snap cache so the very first
            // hover/click in the SVP pane sees live snap candidates.
            this._snapSvc.prewarmCache();
            handler.activate(ctx);
            this._activeHandler = handler;
            console.log('[SvpPlanToolOverlay] Handler activated:', tool);
        } else {
            this._activeHandler = null;
        }
    }

    private _deactivateHandler(): void {
        this._activeHandler?.deactivate();
        this._activeHandler = null;
    }

    private _buildCtx(): PlanToolDrawContext | null {
        if (!this._overlay || !this._ctx || !this._planCanvas || !this._svpCanvas) return null;

        const dpr    = Math.min(window.devicePixelRatio || 1, 4);
        const viewDef: ViewDefinition | null = viewDefinitionStore.get(this._viewId) ?? null;
        if (!viewDef) return null;

        const bimMgr   = window.bimManager;
        const levelId  = viewDef.spatial?.levelId;
        const levelElev: number =
            (levelId && bimMgr?.getLevelById
                ? bimMgr.getLevelById(levelId)?.elevation
                : undefined) ?? 0;
        const viewPlane = viewPlaneFromDefinition(viewDef, levelElev);

        // §DOOR-AUDIT-2026 / §WINDOW-AUDIT-2026 (DI cleanup) — see PlanViewToolOverlay.
        const activeOpeningTool =
            (window.activeOpeningTool as any) ??
            (window.windowTool as any) ??
            (window.doorTool as any);

        return {
            overlayCanvas: this._overlay,
            baseCanvas:    this._svpCanvas,
            ctx:           this._ctx,
            planCanvas:    this._planCanvas,
            interaction:   this._snapSvc as any,
            viewDef,
            dpr,
            viewPlane,
            commandManager:    window.commandManager, // TODO(TASK-06)
            wallStore:         window.wallStore, // TODO(TASK-08)
            runtime:           window.runtime ?? undefined, // §P4.1 — typed injection; eliminates (window as any).runtime in handlers
            activeOpeningTool,
            // §FIX-STAIR-PLAN-CREATION-BLOCKED (L-243) P2 — same stair-config chokepoint
            // as the main overlay, so split-view keeps L-73 parity by construction.
            stairConfig:       getStairToolConfig(),
            // §FIX-FLOOR-FINISH-CREATION-PARITY (L-255) — inject the architect's resolved
            // floor-finish config (finish TYPE · assembly THICKNESS · BASE OFFSET = the FFL
            // elevation) from the single FloorToolConfigStore chokepoint, so the plan floor
            // tool reads exactly what the 3D FloorTool reads. Without this the plan path had no
            // access to the choice at all — the FloorModePicker's finish dropdown writes
            // `floorTool.setSystemTypeId()`, a 3D-tool instance field, and the plan handler has
            // no FloorTool instance to read it from.
            floorConfig:       getFloorToolConfig(),
        };
    }

    // ── Mouse events ──────────────────────────────────────────────────────

    private _onMouseDown(e: MouseEvent): void {
        if (e.button !== 0 || !this._activeHandler) return;
        // Signal to SplitViewManager not to start a pan drag
        (e as any).__pryzmToolHandled = true;
        const pt = this._toWorld(e.clientX, e.clientY);
        if (pt) this._activeHandler.onClick(pt);
    }

    private _onMouseMove(e: MouseEvent): void {
        if (!this._activeHandler || !this._svpFocused) return;
        this._syncOverlaySize();

        // 1. Clear overlay before redraw
        if (this._ctx && this._overlay) {
            this._ctx.clearRect(0, 0, this._overlay.width, this._overlay.height);
        }

        // 2. Resolve snap candidate — snap takes priority over raw position
        let pt: WorldPoint | null = null;
        this._lastSnapInfo = null;

        if (this._svpCanvas && this._planCanvas) {
            const rect = this._svpCanvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const snapResult = this._snapSvc.querySnap(sx, sy);
            if (snapResult) {
                this._lastSnapInfo = {
                    worldX:   snapResult.worldX,
                    worldZ:   snapResult.worldZ,
                    snapType: snapResult.snapType,
                    screenX:  e.clientX,
                    screenY:  e.clientY,
                };
                // §ADPT34-A-SNAP-MUST-SURVIVE-THE-HANDOFF (L-10660) — carry the snap's
                // IDENTITY onto the WorldPoint, exactly as `PlanViewToolOverlay._toWorld`
                // does. Before this, both SVP construction sites built a bare
                // `{ worldX, worldZ }`, so every point a handler received in the SPLIT
                // pane had `snapType === undefined` — which makes `isStrongSnap(pt)`
                // permanently false and silently disables all three of L-935's
                // "an explicit object snap beats ortho / angle-lock / alignment
                // inference" branches in `WallPlanToolHandler`. The snap was DRAWN
                // (`_lastSnapInfo` feeds the indicator + tooltip) but never DELIVERED,
                // so the pane looked like it was snapping while the committed geometry
                // obeyed ortho. L-73 unified the handler SET across both plan surfaces;
                // it did not unify the CONTEXT those handlers are handed.
                pt = {
                    worldX:       snapResult.worldX,
                    worldZ:       snapResult.worldZ,
                    snapType:     snapResult.snapType,
                    snapSourceId: snapResult.sourceId,
                };
            } else {
                pt = this._planCanvas.screenToWorld(sx, sy);
            }
        } else {
            pt = this._toWorld(e.clientX, e.clientY);
        }

        if (!pt) { this._hideSnapTooltip(); return; }

        // 3. Let handler draw its preview (overlay already cleared above)
        this._activeHandler.onMouseMove(pt);

        // 4. Draw snap indicator ON TOP of handler preview
        if (this._lastSnapInfo) {
            this._drawSnapShape(
                this._lastSnapInfo.worldX,
                this._lastSnapInfo.worldZ,
                this._lastSnapInfo.snapType,
            );
            this._showSnapTooltip(
                this._lastSnapInfo.screenX,
                this._lastSnapInfo.screenY,
                this._lastSnapInfo.snapType,
            );
        } else {
            this._hideSnapTooltip();
        }
    }

    private _onMouseUp(e: MouseEvent): void {
        if (!this._activeHandler?.onMouseUp || !this._svpFocused) return;
        const pt = this._toWorld(e.clientX, e.clientY);
        if (pt) this._activeHandler.onMouseUp(pt);
    }

    private _onDblClick(e: MouseEvent): void {
        if (!this._activeHandler?.onDoubleClick) return;
        (e as any).__pryzmToolHandled = true;
        const pt = this._toWorld(e.clientX, e.clientY);
        if (pt) this._activeHandler.onDoubleClick(pt);
    }

    /**
     * §FIX-PLAN-SPACE-ROUTING (L-129) — split-view plan keyboard routing. Runs in
     * the CAPTURE phase on `window` (see attach()) so it claims the key before the
     * `document`-capture SPACE consumers installed by the 3D placement tools that
     * are armed in parallel (FurnitureTool / door flip). See the twin comment in
     * PlanViewToolOverlay._onKeyDown for the full rationale.
     */
    private _onKeyDown(e: KeyboardEvent): void {
        if (!this._activeHandler) return;
        // Contract 38 — when PlanViewManager is the primary viewport (3D renderer
        // is hidden), the SVP canvas is always conceptually "focused" from a keyboard
        // perspective: there is no competing 3D view that could intercept the same keys.
        // Only require hover focus when the 3D view is the primary viewport.
        const planViewIsPrimary = Boolean(window.planViewManager?.isActive);
        // ⭐⭐ §FIX-PLAN-TOOL-FINISH-GESTURE (L-9300) — A PRESERVED STROKE OWNS THE
        // KEYBOARD, WHEREVER THE POINTER IS.
        //
        // THE FOUNDER, on the pool: *"if I create 3 segments on preview and click Enter
        // the 4th should connect with the first point"*. On the boundary line, minutes
        // later: *"doesn't actually work — it doesn't create"*. Both tools finish on
        // **Enter or a double-click**, and both failed at exactly that step.
        //
        // ⚠ THE TWO FEATURES IN THIS FILE CONTRADICTED EACH OTHER. `_onMouseLeave`
        // DELIBERATELY keeps a half-drawn stroke alive when the pointer leaves the pane
        // (§T-B1 — so a six-point outline does not evaporate because the architect
        // reached for the toolbar) while setting `_svpFocused = false`. This guard then
        // threw away the only key that can FINISH that preserved stroke. The stroke was
        // kept and made unfinishable in the same file.
        //
        // ⛔ AND IT WAS A SPLIT-VIEW-ONLY BREAK. `PlanViewToolOverlay._onKeyDown` has no
        // hover gate at all — `if (!this._activeHandler || this._paused) return;` and
        // nothing more — so Enter has always worked on the MAIN plan surface. The
        // founder's working layout is 3-D + the SPLIT pane, which is why he is the one
        // who found it. MEASURED, `planOnlyToolFinishGesture.spec.ts` ARM B: before this
        // line, four clicks + `mouseleave` + Enter produced ZERO `pool.create` and ZERO
        // `boundaryLine.create`; with the pointer left on the pane, both committed.
        //
        // ⭐ IT ALSO REPAIRS ESCAPE, AND THAT IS THE `Handler activated: pool` x7 IN HIS
        // LOG. Escape is decided in this same method, below the guard: with the pointer
        // off the pane the overlay never claimed it, so the SESSION's bubble-phase
        // fallback ran `planOnlyToolEscape(false)` — "no overlay held a stroke" — and
        // DISARMED a tool that was mid-outline. A person whose tool keeps putting itself
        // away clicks the palette again, which is precisely the repeated-arm shape.
        //
        // The stroke test is deliberately narrower than "always listen": with no stroke
        // in progress this overlay still yields the keyboard exactly as before, so no
        // 3-D tool armed in parallel loses a key it used to get.
        const hasStroke = !!(
            this._activeHandler as { hasActiveStroke?: () => boolean }
        ).hasActiveStroke?.();
        if (!this._svpFocused && !planViewIsPrimary && !hasStroke) return;
        // Never hijack keys typed into a text-entry field (dimension inputs, etc.).
        if (SvpPlanToolOverlay._isFormFieldTarget(e.target)) return;

        if (e.key === 'Escape') {
            // ⭐ §FIX-PLAN-TOOL-ESCAPE-RUNAWAY (L-7800) — SAMPLE THE STROKE BEFORE
            // CANCELLING IT. `cancel()` resets `_points` / `_loopAnchor`, so anything
            // that asks afterwards reads a false negative. This overlay is the only
            // place in the tree that can observe the stroke at the right instant,
            // which is why the two-stage decision is driven from here rather than
            // from the session's own (bubble-phase, therefore later) listener.
            const hadStroke = !!(
                this._activeHandler as { hasActiveStroke?: () => boolean }
            ).hasActiveStroke?.();
            this._activeHandler.cancel();
            this._hideSnapTooltip();
            e.preventDefault();
            // Tell the session's fallback listener this Escape is already accounted
            // for — see `beginPlanOnlyToolSession`'s `onKey` for why the marker exists.
            (e as { __pryzmPlanToolEscape?: boolean }).__pryzmPlanToolEscape = true;
            // A no-op unless a PLAN-ONLY session is live (balcony / lift / pool):
            // every ToolManager-owned tool keeps the Escape it always had.
            planOnlyToolEscape(hadStroke);
            // NOT stopImmediatePropagation — let a redundantly-armed 3D tool also
            // reset on Escape (its listener is on document).
            return;
        }
        // §T-B2 (DAILY-USE-AUDIT 2026-05-20) — honour the handler's "I consumed it"
        // signal. On true, stopImmediatePropagation so neither the global
        // Backspace/Delete handler (initUI.ts) nor the 3D tool's document-capture
        // SPACE consumer also acts on a key the active plan handler just claimed.
        const handled = this._activeHandler.onKeyDown?.(e);
        if (handled === true) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }

    /** True when the key event targets a text-entry field — never hijack those. */
    private static _isFormFieldTarget(target: EventTarget | null): boolean {
        const el = target as HTMLElement | null;
        if (!el || !el.tagName) return false;
        const tag = el.tagName.toUpperCase();
        return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable === true;
    }

    // ── Coordinate resolution ─────────────────────────────────────────────

    /**
     * Convert client coordinates to world coordinates, snapping when within
     * SNAP_RADIUS_PX of a projected endpoint/midpoint/perpendicular.
     */
    private _toWorld(clientX: number, clientY: number): WorldPoint | null {
        if (!this._svpCanvas || !this._planCanvas) return null;
        const rect = this._svpCanvas.getBoundingClientRect();
        const sx   = clientX - rect.left;
        const sy   = clientY - rect.top;
        const snap = this._snapSvc.querySnap(sx, sy);
        // §ADPT34-A-SNAP-MUST-SURVIVE-THE-HANDOFF (L-10660) — the CLICK path. Same
        // defect, second site: `onClick` resolves its point through here, so a snap
        // could not reach a handler's commit branch either. Mirrors
        // `PlanViewToolOverlay._toWorld` field-for-field.
        if (snap) {
            return {
                worldX:       snap.worldX,
                worldZ:       snap.worldZ,
                snapType:     snap.snapType,
                snapSourceId: snap.sourceId,
            };
        }
        return this._planCanvas.screenToWorld(sx, sy);
    }

    // ── Overlay helpers ───────────────────────────────────────────────────

    private _syncOverlaySize(): void {
        if (!this._overlay || !this._svpCanvas) return;
        const rect = this._svpCanvas.getBoundingClientRect();
        this._overlay.style.top    = `${rect.top}px`;
        this._overlay.style.left   = `${rect.left}px`;
        this._overlay.style.width  = `${rect.width}px`;
        this._overlay.style.height = `${rect.height}px`;
        const dpr = Math.min(window.devicePixelRatio || 1, 4);
        const pw  = Math.round(rect.width  * dpr);
        const ph  = Math.round(rect.height * dpr);
        if (this._overlay.width  !== pw) this._overlay.width  = pw;
        if (this._overlay.height !== ph) this._overlay.height = ph;
        // §GRID-BUTTON-CENSUS - nothing to reposition; the button is a CSS-positioned
        // child of '.svp-pane' and moves with the pane.
    }

    // ── §GRID-SPLITVIEW (2026-05-23) / §GRID-BUTTON-CENSUS (L-4000..L-4004) ──
    //
    // The split-view plan pane's "+ Grid" entry point. The SVP overlay already
    // registers the grid plan-tool handler and routes it (ACTIVE_TOOL_KEYS
    // includes 'grid'), but there was NO way to ACTIVATE grid from split view -
    // the only "+ Grid" affordance lived in PlanViewToolOverlay (the MAIN plan
    // view). This button mirrors that affordance and calls the same
    // toolManager.activateGrid(); the existing SVP handler dispatch then takes
    // the clicks once the pane is focused (identical to wall/window/stair).
    //
    // THE DEFECT CLOSED 2026-08-22, AND IT WAS THE FOUNDER'S SCREENSHOT.
    // This button was 'document.body.appendChild(btn)' with 'position: fixed'
    // and a hand-picked 'zIndex: 10002', placed from the SVP canvas rect. Its
    // own pane, '.svp-pane', is 'position: fixed; right: 0; width: 40%' at
    // z-index 1 (splitView.ts:37) - correctly BEHIND '#anl-surface' (z 50) and
    // '#dw-workbench' (z 110). The BUTTON was not in the pane, so at 10002 it
    // out-painted both and appeared ALONE inside the Data and Analysis panels
    // at x = 60vw, with no pane around it.
    //
    // Lane DATA3 measured the OTHER "+ Grid" (PlanViewToolOverlay, z-index 6)
    // and concluded the affordance "cannot render over the panel at all". That
    // was true of the button it measured and false of this one. C01 §6 rule 6:
    // a claim of IMPOSSIBILITY is a measurement, and a census of one is not a
    // census. There were always two owners.
    //
    // As a CHILD of '.svp-pane' the button is CONTAINED: the pane is positioned
    // AND carries a z-index, so it creates a stacking context and no descendant
    // of it can out-paint a sibling of the pane whatever number it holds. It
    // also inherits the pane's 'display', so tearing down split view takes the
    // button with it. CSS: '.vco-create-btn' in styles/panels/canvasOverlays.ts,
    // shared byte-for-byte with the main plan view's affordance.
    private _mountGridButton(): void {
        if (this._gridBtn) return;
        const viewDef = viewDefinitionStore.get(this._viewId) ?? null;
        const vt = viewDef?.viewType;
        if (vt !== 'plan' && vt !== 'structural-plan') return; // grids are a plan-view concept

        const btn = document.createElement('button');
        btn.type      = 'button';
        btn.className = 'vco-create-btn';
        btn.textContent = '+ Grid';
        btn.title = 'Create a structural grid line in this plan view';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tm = window.toolManager;
            if (tm?.activateGrid) {
                tm.activateGrid();
                console.log('[SvpPlanToolOverlay] §GRID-SPLITVIEW grid tool activated from split-view "+ Grid" button');
            } else {
                console.warn('[SvpPlanToolOverlay] toolManager.activateGrid not available');
            }
        });

        // The pane, never the body. Degrades to the canvas's own parent rather
        // than unmounting if the pane class ever moves (C06 §14.2).
        const host =
            this._svpCanvas?.closest('.svp-pane') ??
            this._svpCanvas?.parentElement ??
            null;
        if (!host) return;
        host.appendChild(btn);
        this._gridBtn = btn;
    }

    private _clearOverlay(): void {
        if (this._ctx && this._overlay) {
            this._ctx.clearRect(0, 0, this._overlay.width, this._overlay.height);
        }
    }

    private _updateCursor(): void {
        if (!this._svpCanvas) return;
        const hasTool = ACTIVE_TOOL_KEYS.has(this._activeTool);
        const active  = hasTool && this._svpFocused && !this._paused;
        this._svpCanvas.classList.toggle('svp-tool-active', active);
    }

    // ── Snap tooltip ──────────────────────────────────────────────────────

    private _showSnapTooltip(
        clientX: number,
        clientY: number,
        snapType:
            | 'endpoint' | 'midpoint' | 'perpendicular'
            | 'grid-line' | 'grid-intersection' | 'intersection' | 'nearest',
    ): void {
        const tip = this._snapTooltip;
        if (!tip) return;

        const LABELS: Record<string, string> = {
            'endpoint':          'Endpoint',
            'midpoint':          'Midpoint',
            'perpendicular':     'Perpendicular',
            'grid-line':         'Grid',
            'grid-intersection': 'Grid Intersection',
            'intersection':      'Intersection',
            'nearest':           'Nearest',
        };

        tip.textContent = LABELS[snapType] ?? snapType;
        tip.style.display = 'block';

        const offsetX = 18, offsetY = -28;
        let tx = clientX + offsetX;
        let ty = clientY + offsetY;

        const vw = window.innerWidth, vh = window.innerHeight;
        const tipW = tip.offsetWidth  || 90;
        const tipH = tip.offsetHeight || 22;
        if (tx + tipW > vw - 8) tx = clientX - tipW - offsetX;
        if (ty < 8)              ty = clientY + 12;
        if (ty + tipH > vh - 8)  ty = clientY - tipH - 4;

        tip.style.left = `${tx}px`;
        tip.style.top  = `${ty}px`;
    }

    private _hideSnapTooltip(): void {
        if (this._snapTooltip) this._snapTooltip.style.display = 'none';
    }

    // ── Snap shape (Canvas2D) ─────────────────────────────────────────────

    private _drawSnapShape(
        worldX: number,
        worldZ: number,
        snapType:
            | 'endpoint' | 'midpoint' | 'perpendicular'
            | 'grid-line' | 'grid-intersection' | 'intersection' | 'nearest',
    ): void {
        const ctx        = this._ctx;
        const planCanvas = this._planCanvas;
        const overlay    = this._overlay;
        if (!ctx || !planCanvas || !overlay) return;

        const dpr = Math.min(window.devicePixelRatio || 1, 4);
        const { sx, sy } = planCanvas.worldToScreen(worldX, worldZ);
        const px = sx * dpr;
        const py = sy * dpr;
        const SZ = 6 * dpr;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        // §PREVIEW-COLOR-UNIFY-2D (2026-05-23, architect directive) — snap markers
        // now use the single contractual PRYZM purple #6600ff. The snap TYPE remains
        // identifiable by the distinct marker SHAPE (diamond=endpoint, triangle=
        // midpoint, square=grid, X=intersection, circle=nearest) + the snap tooltip,
        // so colour unification keeps the brand consistent without losing snap info.
        const SNAP = '#6600ff';
        const SNAP_FILL = 'rgba(102,0,255,0.18)';
        if (snapType === 'endpoint') {
            ctx.strokeStyle = SNAP;
            ctx.fillStyle   = SNAP_FILL;
            ctx.lineWidth   = 1.5 * dpr;
            ctx.beginPath();
            ctx.moveTo(px,       py - SZ);
            ctx.lineTo(px + SZ,  py);
            ctx.lineTo(px,       py + SZ);
            ctx.lineTo(px - SZ,  py);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

        } else if (snapType === 'midpoint') {
            ctx.strokeStyle = SNAP;
            ctx.fillStyle   = SNAP_FILL;
            ctx.lineWidth   = 1.5 * dpr;
            ctx.beginPath();
            ctx.moveTo(px,       py - SZ);
            ctx.lineTo(px + SZ,  py + SZ);
            ctx.lineTo(px - SZ,  py + SZ);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

        } else if (snapType === 'grid-line' || snapType === 'grid-intersection') {
            // Grid snaps — square with a centered dot (Revit convention; brand purple).
            ctx.strokeStyle = SNAP;
            ctx.fillStyle   = 'rgba(102,0,255,0.20)';
            ctx.lineWidth   = 1.5 * dpr;
            ctx.beginPath();
            ctx.rect(px - SZ, py - SZ, SZ * 2, SZ * 2);
            ctx.fill();
            ctx.stroke();
            if (snapType === 'grid-intersection') {
                ctx.beginPath();
                ctx.arc(px, py, SZ * 0.35, 0, Math.PI * 2);
                ctx.fillStyle = SNAP;
                ctx.fill();
            }

        } else if (snapType === 'intersection') {
            // Geometry intersection — X marker.
            ctx.strokeStyle = SNAP;
            ctx.lineWidth   = 1.7 * dpr;
            ctx.beginPath();
            ctx.moveTo(px - SZ, py - SZ); ctx.lineTo(px + SZ, py + SZ);
            ctx.moveTo(px + SZ, py - SZ); ctx.lineTo(px - SZ, py + SZ);
            ctx.stroke();

        } else if (snapType === 'nearest') {
            // Lowest-priority — small hollow circle.
            ctx.strokeStyle = SNAP;
            ctx.lineWidth   = 1.2 * dpr;
            ctx.beginPath();
            ctx.arc(px, py, SZ * 0.55, 0, Math.PI * 2);
            ctx.stroke();

        } else {
            ctx.strokeStyle = SNAP;
            ctx.lineWidth   = 1.5 * dpr;
            ctx.beginPath();
            ctx.moveTo(px - SZ, py - SZ); ctx.lineTo(px + SZ, py + SZ);
            ctx.moveTo(px + SZ, py - SZ); ctx.lineTo(px - SZ, py + SZ);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(px, py, SZ * 0.45, 0, Math.PI * 2);
            ctx.strokeStyle = SNAP;
            ctx.stroke();
        }

        ctx.restore();
    }
}

/** Module-level singleton — one SVP tool overlay per app. */
export const svpPlanToolOverlay = new SvpPlanToolOverlay();

// §FIX-PLAN-WALLTOOL-ARM-ON-ACTIVATE (L-66) — expose on window so the wall pre-draw
// panel (PropertyPanelPreDraw.showWallPreDraw) can assert the split-view pane's
// draw-arm invariant without importing this module (avoids a UI→engine cycle),
// mirroring how PlanViewToolOverlay is already published on window.
window.svpPlanToolOverlay = svpPlanToolOverlay;
