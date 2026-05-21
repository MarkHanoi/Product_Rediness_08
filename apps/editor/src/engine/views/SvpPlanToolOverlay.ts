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

// ── Handler imports — separate instances from left-panel singletons ────────
import { WallPlanToolHandler }        from './plantools/WallPlanToolHandler';
import { RoomPlanToolHandler }        from './plantools/RoomPlanToolHandler';
import { ColumnPlanToolHandler }      from './plantools/ColumnPlanToolHandler';
import { LinearDimPlanToolHandler }   from './plantools/LinearDimPlanToolHandler';
import { DoorPlanToolHandler }        from './plantools/DoorPlanToolHandler';
import { WindowPlanToolHandler }      from './plantools/WindowPlanToolHandler';
import { SlabPlanToolHandler }        from './plantools/SlabPlanToolHandler';
import { StairPlanToolHandler }       from './plantools/StairPlanToolHandler';
import { StairPathPlanToolHandler }   from './plantools/StairPathPlanToolHandler';
import { BeamPlanToolHandler }        from './plantools/BeamPlanToolHandler';
import { RoofPlanToolHandler }        from './plantools/RoofPlanToolHandler';
import { CurtainWallPlanToolHandler } from './plantools/CurtainWallPlanToolHandler';
import { CeilingPlanToolHandler }     from './plantools/CeilingPlanToolHandler';
import { FloorPlanToolHandler }       from './plantools/FloorPlanToolHandler';
import { RailingPlanToolHandler }     from './plantools/RailingPlanToolHandler';
import { FurniturePlanToolHandler }   from './plantools/FurniturePlanToolHandler';
import { LightingPlanToolHandler }    from './plantools/LightingPlanToolHandler';
import { PlumbingPlanToolHandler }    from './plantools/PlumbingPlanToolHandler';
import { OpeningPlanToolHandler }     from './plantools/OpeningPlanToolHandler';
import { GridPlanToolHandler }        from './plantools/GridPlanToolHandler';
import { SectionPlanToolHandler }     from './plantools/SectionPlanToolHandler';
import { ElevationPlanToolHandler }   from './plantools/ElevationPlanToolHandler';
// ── Edit-in-place tools (Contracts 34 / 35) — Move / Align / Copy-place ───
// These were missing from the SVP registry, so the Move tool worked in the
// Standalone Plan View but silently fell through to default selection in the
// Split View Pane (notably visible when moving furniture such as sofas).
import { MovePlanToolHandler }        from './plantools/MovePlanToolHandler';
import { AlignPlanToolHandler }       from './plantools/AlignPlanToolHandler';
import { CopyPlanToolHandler }        from './plantools/CopyPlanToolHandler';
import {
    TextNotePlanToolHandler,
    ElementTagPlanToolHandler,
    DoorTagPlanToolHandler,
    WindowTagPlanToolHandler,
    AngularDimPlanToolHandler,
    RadiusDimPlanToolHandler,
    DiameterDimPlanToolHandler,
    SlopeDimPlanToolHandler,
    SpotElevationPlanToolHandler,
    KeynotePlanToolHandler,
    LevelTagPlanToolHandler,
    GridBubblePlanToolHandler,
    RevisionCloudPlanToolHandler,
    CalloutDetailPlanToolHandler,
} from './plantools/AnnotationPlanToolHandlers';

// ── SVP handler registry — one fresh instance per handler key ─────────────
const SVP_TOOL_HANDLERS: Readonly<Record<string, PlanToolHandler>> = {
    'wall':               new WallPlanToolHandler(),
    'room':               new RoomPlanToolHandler(),
    'column':             new ColumnPlanToolHandler(),
    'linear-dim':         new LinearDimPlanToolHandler(),
    'door':               new DoorPlanToolHandler(),
    'window':             new WindowPlanToolHandler(),
    'slab':               new SlabPlanToolHandler(),
    'stair':              new StairPlanToolHandler(),
    'stair-path':         new StairPathPlanToolHandler(),
    'beam':               new BeamPlanToolHandler(),
    'roof':               new RoofPlanToolHandler(),
    'curtain-wall':       new CurtainWallPlanToolHandler(),
    'ceiling':            new CeilingPlanToolHandler(),
    'floor':              new FloorPlanToolHandler(),
    'railing':            new RailingPlanToolHandler(),
    'furniture':          new FurniturePlanToolHandler(),
    'lighting':           new LightingPlanToolHandler(),
    'plumbing':           new PlumbingPlanToolHandler(),
    'opening':            new OpeningPlanToolHandler(),
    'grid':               new GridPlanToolHandler(),
    'section-mark':       new SectionPlanToolHandler(),
    'elevation-mark':     new ElevationPlanToolHandler(),
    // ── Edit-in-place tools (Contracts 34 / 35) — separate instances from the
    //    PlanViewToolOverlay so SVP move/align/copy state never aliases the
    //    Standalone Plan View tool state. Fixes the "Move tool does nothing
    //    on sofas in Split View" gap (docs 09 §3 / 10 Stage S1).
    'move':               new MovePlanToolHandler(),
    'align':              new AlignPlanToolHandler(),
    'copy-place':         new CopyPlanToolHandler(),
    'text-note':          new TextNotePlanToolHandler(),
    'element-tag':        new ElementTagPlanToolHandler(),
    'door-tag':           new DoorTagPlanToolHandler(),
    'window-tag':         new WindowTagPlanToolHandler(),
    'angular-dimension':  new AngularDimPlanToolHandler(),
    'radius-dimension':   new RadiusDimPlanToolHandler(),
    'diameter-dimension': new DiameterDimPlanToolHandler(),
    'slope-dimension':    new SlopeDimPlanToolHandler(),
    'spot-elevation':     new SpotElevationPlanToolHandler(),
    'keynote':            new KeynotePlanToolHandler(),
    'level-tag':          new LevelTagPlanToolHandler(),
    'grid-bubble':        new GridBubblePlanToolHandler(),
    'revision-cloud':     new RevisionCloudPlanToolHandler(),
    'callout-detail':     new CalloutDetailPlanToolHandler(),
};

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

// ── Main class ────────────────────────────────────────────────────────────

export class SvpPlanToolOverlay {
    private _active     = false;
    private _svpFocused = false;
    private _paused     = false;

    // Injected on attach
    private _svpCanvas:  HTMLCanvasElement | null = null;
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

        // ── SVP canvas events ─────────────────────────────────────────────
        svpCanvas.addEventListener('mouseenter', this._bMouseEnter);
        svpCanvas.addEventListener('mouseleave', this._bMouseLeave);
        svpCanvas.addEventListener('mousedown',  this._bMouseDown, { capture: true });
        svpCanvas.addEventListener('dblclick',   this._bDblClick,  { capture: true });
        window.addEventListener('mousemove', this._bMouseMove);
        window.addEventListener('mouseup',   this._bMouseUp);
        window.addEventListener('keydown',   this._bKeyDown);

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

        this._toolUnsub?.();
        this._toolUnsub = null;

        this._deactivateHandler();

        this._svpCanvas?.removeEventListener('mouseenter', this._bMouseEnter);
        this._svpCanvas?.removeEventListener('mouseleave', this._bMouseLeave);
        this._svpCanvas?.removeEventListener('mousedown',  this._bMouseDown, { capture: true } as EventListenerOptions);
        this._svpCanvas?.removeEventListener('dblclick',   this._bDblClick,  { capture: true } as EventListenerOptions);
        window.removeEventListener('mousemove', this._bMouseMove);
        window.removeEventListener('mouseup',   this._bMouseUp);
        window.removeEventListener('keydown',   this._bKeyDown);

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
        if (!(window as any).__pryzmInitComplete) {
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
                pt = { worldX: snapResult.worldX, worldZ: snapResult.worldZ };
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

    private _onKeyDown(e: KeyboardEvent): void {
        if (!this._activeHandler) return;
        // Contract 38 — when PlanViewManager is the primary viewport (3D renderer
        // is hidden), the SVP canvas is always conceptually "focused" from a keyboard
        // perspective: there is no competing 3D view that could intercept the same keys.
        // Only require hover focus when the 3D view is the primary viewport.
        const planViewIsPrimary = Boolean(window.planViewManager?.isActive);
        if (!this._svpFocused && !planViewIsPrimary) return;
        if (e.key === 'Escape') {
            this._activeHandler.cancel();
            this._hideSnapTooltip();
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        // §T-B2 (DAILY-USE-AUDIT 2026-05-20) — propagate handler's "I consumed it"
        // signal so the global Backspace/Delete handler in initUI.ts doesn't also
        // delete the previously-selected element when the user pops a polyline
        // vertex. Mirrors the PlanViewToolOverlay fix; the PlanToolHandler interface
        // contract declares `onKeyDown(e): boolean` for exactly this purpose.
        const handled = this._activeHandler.onKeyDown?.(e);
        if (handled === true) {
            e.preventDefault();
            e.stopPropagation();
        }
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
        if (snap) return { worldX: snap.worldX, worldZ: snap.worldZ };
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

        if (snapType === 'endpoint') {
            ctx.strokeStyle = '#22c55e';
            ctx.fillStyle   = 'rgba(34,197,94,0.18)';
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
            ctx.strokeStyle = '#06b6d4';
            ctx.fillStyle   = 'rgba(6,182,212,0.18)';
            ctx.lineWidth   = 1.5 * dpr;
            ctx.beginPath();
            ctx.moveTo(px,       py - SZ);
            ctx.lineTo(px + SZ,  py + SZ);
            ctx.lineTo(px - SZ,  py + SZ);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

        } else if (snapType === 'grid-line' || snapType === 'grid-intersection') {
            // Grid snaps — orange square with a centered dot (Revit convention).
            ctx.strokeStyle = '#f59e0b';
            ctx.fillStyle   = 'rgba(245,158,11,0.20)';
            ctx.lineWidth   = 1.5 * dpr;
            ctx.beginPath();
            ctx.rect(px - SZ, py - SZ, SZ * 2, SZ * 2);
            ctx.fill();
            ctx.stroke();
            if (snapType === 'grid-intersection') {
                ctx.beginPath();
                ctx.arc(px, py, SZ * 0.35, 0, Math.PI * 2);
                ctx.fillStyle = '#f59e0b';
                ctx.fill();
            }

        } else if (snapType === 'intersection') {
            // Geometry intersection — yellow X.
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth   = 1.7 * dpr;
            ctx.beginPath();
            ctx.moveTo(px - SZ, py - SZ); ctx.lineTo(px + SZ, py + SZ);
            ctx.moveTo(px + SZ, py - SZ); ctx.lineTo(px - SZ, py + SZ);
            ctx.stroke();

        } else if (snapType === 'nearest') {
            // Lowest-priority — small hollow circle.
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth   = 1.2 * dpr;
            ctx.beginPath();
            ctx.arc(px, py, SZ * 0.55, 0, Math.PI * 2);
            ctx.stroke();

        } else {
            ctx.strokeStyle = '#a78bfa';
            ctx.lineWidth   = 1.5 * dpr;
            ctx.beginPath();
            ctx.moveTo(px - SZ, py - SZ); ctx.lineTo(px + SZ, py + SZ);
            ctx.moveTo(px + SZ, py - SZ); ctx.lineTo(px - SZ, py + SZ);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(px, py, SZ * 0.45, 0, Math.PI * 2);
            ctx.strokeStyle = '#a78bfa';
            ctx.stroke();
        }

        ctx.restore();
    }
}

/** Module-level singleton — one SVP tool overlay per app. */
export const svpPlanToolOverlay = new SvpPlanToolOverlay();
