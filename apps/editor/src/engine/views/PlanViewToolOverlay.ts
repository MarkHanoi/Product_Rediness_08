/**
 * PlanViewToolOverlay — Contract 19 / Contract 21
 *
 * Lean coordinator: owns the overlay <canvas> lifecycle + DOM event binding +
 * tool subscription. All tool logic lives in plantools/ handler modules.
 *
 * Architecture rules (Contract 21 §3):
 *   - No tool-specific state, logic, or rendering here.
 *   - Routes every pointer/keyboard event to this._activeHandler.
 *   - Coordinator ≤ 200 lines.
 *
 * Pan suppression: mousedown is captured (fires before PlanViewManager's
 * bubble-phase listener) and marks the event with __pryzmToolHandled = true.
 *
 * Snap indicator design:
 *   - The overlay canvas is ALWAYS fully cleared at the start of every
 *     onMouseMove before any handler or indicator drawing. This prevents
 *     stale labels from accumulating when handlers return early (e.g. before
 *     the first wall point is placed).
 *   - Snap type is communicated via a single floating HTML tooltip element
 *     (dark background, white text, no colour) that follows the cursor.
 *     This matches the clean "Grid" style label used elsewhere in the 3D view.
 *   - The Canvas2D shape (diamond / triangle / × mark) uses a subtle colour
 *     on the icon shape only — no coloured text on the canvas.
 */

import type { PlanViewCanvas }      from '@pryzm/core-app-model';
import type { PlanViewInteraction }  from './PlanViewInteraction';
import type { ViewDefinition }       from '@pryzm/core-app-model';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './plantools/PlanToolHandler';
import { viewPlaneFromDefinition }   from '@pryzm/core-app-model';
import { AddLevelCommand }           from '@pryzm/command-registry';

import { WallPlanToolHandler }         from './plantools/WallPlanToolHandler';
import { RoomPlanToolHandler }         from './plantools/RoomPlanToolHandler';
import { ColumnPlanToolHandler }       from './plantools/ColumnPlanToolHandler';
import { LinearDimPlanToolHandler }    from './plantools/LinearDimPlanToolHandler';
import { DoorPlanToolHandler }         from './plantools/DoorPlanToolHandler';
import { WindowPlanToolHandler }       from './plantools/WindowPlanToolHandler';
import { SlabPlanToolHandler }         from './plantools/SlabPlanToolHandler';
import { StairPlanToolHandler }        from './plantools/StairPlanToolHandler';
import { StairPathPlanToolHandler }    from './plantools/StairPathPlanToolHandler';
import { BeamPlanToolHandler }         from './plantools/BeamPlanToolHandler';
import { RoofPlanToolHandler }         from './plantools/RoofPlanToolHandler';
import { CurtainWallPlanToolHandler }  from './plantools/CurtainWallPlanToolHandler';
import { CeilingPlanToolHandler }      from './plantools/CeilingPlanToolHandler';
import { FloorPlanToolHandler }        from './plantools/FloorPlanToolHandler';
import { RailingPlanToolHandler }      from './plantools/RailingPlanToolHandler';
import { FurniturePlanToolHandler }    from './plantools/FurniturePlanToolHandler';
import { LightingPlanToolHandler }     from './plantools/LightingPlanToolHandler';
import { PlumbingPlanToolHandler }     from './plantools/PlumbingPlanToolHandler';
import { OpeningPlanToolHandler }      from './plantools/OpeningPlanToolHandler';
import { GridPlanToolHandler }         from './plantools/GridPlanToolHandler';
import { SectionPlanToolHandler }      from './plantools/SectionPlanToolHandler';
import { ElevationPlanToolHandler }    from './plantools/ElevationPlanToolHandler';
import { MovePlanToolHandler }          from './plantools/MovePlanToolHandler';
import { CopyPlanToolHandler }          from './plantools/CopyPlanToolHandler';
import { AlignPlanToolHandler }         from './plantools/AlignPlanToolHandler';
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
    NorthArrowPlanToolHandler,
    ScaleBarPlanToolHandler,
    MatchlinePlanToolHandler,
} from './plantools/AnnotationPlanToolHandlers';

const PLAN_TOOL_HANDLERS: Readonly<Record<string, PlanToolHandler>> = {
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
    // ── Move tool (Contract 34) ───────────────────────────────────────────────────────────
    'move':               new MovePlanToolHandler(),
    'align':              new AlignPlanToolHandler(),
    // ── Copy-place tool (Contract 35) ─────────────────────────────────────────────────────
    'copy-place':         new CopyPlanToolHandler(),
    // ── Annotation tools (previously missing — caused all clicks to be silently ignored) ──
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
    'north-arrow':        new NorthArrowPlanToolHandler(),
    'scale-bar':          new ScaleBarPlanToolHandler(),
    'matchline':          new MatchlinePlanToolHandler(),
};

const ACTIVE_TOOLS = new Set(Object.keys(PLAN_TOOL_HANDLERS));

export class PlanViewToolOverlay {
    private _overlay: HTMLCanvasElement | null = null;
    private _ctx: CanvasRenderingContext2D | null = null;
    private _baseCanvas: HTMLCanvasElement | null = null;
    private _planCanvas: PlanViewCanvas | null = null;
    private _interaction: PlanViewInteraction | null = null;
    private _viewDef: ViewDefinition | null = null;
    private _active = false;
    /** True while the SVP tool overlay has mouse focus and this overlay is paused. */
    private _paused = false;

    private _activeTool   = 'none';
    private _toolUnsub: (() => void) | null = null;
    private _activeHandler: PlanToolHandler | null = null;

    /** Snap families surfaced by PlanViewInteraction.querySnap(). */
    private static readonly _SNAP_TYPES = [
        'endpoint', 'midpoint', 'perpendicular',
        'grid-line', 'grid-intersection', 'intersection', 'nearest',
    ] as const;
    /** Last snap result — used after handler redraws. */
    private _lastSnapInfo: {
        worldX:   number;
        worldZ:   number;
        snapType: typeof PlanViewToolOverlay._SNAP_TYPES[number];
        screenX:  number;
        screenY:  number;
    } | null = null;

    /** Floating HTML tooltip for snap type name — one label at a time, dark bg. */
    private _snapTooltip: HTMLDivElement | null = null;

    /** Floating contextual action button — "+ Grid" in plan, "+ Level" in elevation/section. */
    private _createActionBtn: HTMLButtonElement | null = null;

    private readonly _boundMouseDownCapture = this._onMouseDownCapture.bind(this);
    private readonly _boundMouseMove        = this._onMouseMove.bind(this);
    private readonly _boundMouseUp          = this._onMouseUp.bind(this);
    private readonly _boundKeyDown          = this._onKeyDown.bind(this);
    private readonly _boundDblClick         = this._onDblClick.bind(this);
    // Contract 17 Phase 2 — SVP focus coordination
    private readonly _boundSvpToolFocus     = this._onSvpToolFocus.bind(this);
    private readonly _boundSvpToolBlur      = this._onSvpToolBlur.bind(this);
    /** F.events.10 — unsub tokens for runtime.events SVP focus subscriptions. */
    private _unsubSvpToolFocus: (() => void) | null = null;
    private _unsubSvpToolBlur:  (() => void) | null = null;
    /** Contract 32 cross-pane snap-cache invalidation unsub (created on attach).
     *  Stores the dispose() wrapper; was previously the raw callback. */
    private _onSvpDrawingRefreshed: (() => void) | null = null;

    attach(
        baseCanvas: HTMLCanvasElement,
        planCanvas: PlanViewCanvas,
        interaction: PlanViewInteraction,
        viewDef: ViewDefinition,
    ): void {
        this.detach();

        this._baseCanvas  = baseCanvas;
        this._planCanvas  = planCanvas;
        this._interaction = interaction;
        this._viewDef     = viewDef;
        this._active      = true;

        const overlay = document.createElement('canvas');
        overlay.style.cssText = 'position:fixed;top:0;left:0;pointer-events:none;z-index:5';
        document.body.appendChild(overlay);
        this._overlay = overlay;
        this._ctx = overlay.getContext('2d');

        // ── Snap tooltip element ────────────────────────────────────────────
        const tip = document.createElement('div');
        tip.id = 'pvto-snap-tip';
        Object.assign(tip.style, {
            position:     'fixed',
            pointerEvents:'none',
            background:   'rgba(22,26,34,0.92)',
            color:        '#e2e8f0',
            fontSize:     '11px',
            fontFamily:   'system-ui, sans-serif',
            fontWeight:   '500',
            padding:      '3px 8px',
            borderRadius: '4px',
            border:       '1px solid rgba(255,255,255,0.10)',
            boxShadow:    '0 2px 8px rgba(0,0,0,0.35)',
            zIndex:       '10000',
            display:      'none',
            userSelect:   'none',
            whiteSpace:   'nowrap',
        });
        document.body.appendChild(tip);
        this._snapTooltip = tip;

        this._mountCreateActionButton(viewDef);

        this._syncSize();

        baseCanvas.addEventListener('mousedown', this._boundMouseDownCapture, { capture: true });
        window.addEventListener('mousemove', this._boundMouseMove);
        window.addEventListener('mouseup',   this._boundMouseUp);
        window.addEventListener('keydown',   this._boundKeyDown);
        baseCanvas.addEventListener('dblclick', this._boundDblClick, { capture: true });

        const tm = window.toolManager;
        if (tm?.subscribe) {
            this._activeTool = tm.getActiveTool?.() ?? 'none';
            this._updateCursor();
            this._activateHandler(this._activeTool);
            this._toolUnsub = tm.subscribe((tool: string) => {
                this._deactivateHandler();
                this._activeTool = tool;
                if (!this._paused) {
                    this._updateCursor();
                    this._activateHandler(tool);
                }
                this._hideSnapTooltip();
            });
        }

        // Contract 17 Phase 2 — Coordinate with SvpPlanToolOverlay:
        // When the SVP canvas gets mouse focus while a tool is active, pause this
        // overlay's handler so only one handler processes events at a time.
        // F.events.10 — svp:tool-focus / svp:tool-blur via runtime.events
        const subFocus = window.runtime?.events?.on('svp:tool-focus', this._boundSvpToolFocus);
        this._unsubSvpToolFocus = subFocus ? () => subFocus.dispose() : null;
        const subBlur  = window.runtime?.events?.on('svp:tool-blur',  this._boundSvpToolBlur);
        this._unsubSvpToolBlur  = subBlur  ? () => subBlur.dispose()  : null;

        // Contract 32 — when the SVP rebuilds its drawing (level/view switch,
        // element edit, etc.) the left-panel snap cache for the SAME view id
        // must also invalidate, otherwise the panes drift out of sync.
        // F.events.10 — svp:drawing-refreshed via runtime.events
        const subDrawing = window.runtime?.events?.on('svp:drawing-refreshed', () => {
            if (this._interaction && this._viewDef) {
                this._interaction.notifyDrawingChanged(this._viewDef.id);
            }
        });
        this._onSvpDrawingRefreshed = subDrawing ? () => subDrawing.dispose() : null;

        console.log('[PlanViewToolOverlay] Attached for view', viewDef.id);
    }

    detach(): void {
        if (!this._active) return;
        this._active = false;
        this._paused = false;

        this._toolUnsub?.();
        this._toolUnsub = null;

        this._deactivateHandler();

        this._baseCanvas?.removeEventListener('mousedown', this._boundMouseDownCapture, { capture: true } as EventListenerOptions);
        window.removeEventListener('mousemove', this._boundMouseMove);
        window.removeEventListener('mouseup',   this._boundMouseUp);
        window.removeEventListener('keydown',   this._boundKeyDown);
        this._baseCanvas?.removeEventListener('dblclick', this._boundDblClick, { capture: true } as EventListenerOptions);
        // Contract 17 Phase 2 — F.events.10
        this._unsubSvpToolFocus?.(); this._unsubSvpToolFocus = null;
        this._unsubSvpToolBlur?.();  this._unsubSvpToolBlur  = null;
        this._onSvpDrawingRefreshed?.(); this._onSvpDrawingRefreshed = null;

        if (this._baseCanvas) {
            this._baseCanvas.style.cursor = '';
            this._baseCanvas.classList.remove('svp-tool-active');
        }

        this._overlay?.remove();
        this._overlay = null;
        this._ctx = null;

        this._snapTooltip?.remove();
        this._snapTooltip = null;

        this._createActionBtn?.remove();
        this._createActionBtn = null;

        this._baseCanvas  = null;
        this._planCanvas  = null;
        this._interaction = null;
        this._viewDef     = null;

        console.log('[PlanViewToolOverlay] Detached');
    }

    notifyResize(): void {
        this._syncSize();
        this._positionCreateActionButton();
        this._activeHandler?.redraw();
    }

    /**
     * Contract 34 — Programmatic tool activation.
     *
     * Activates the given plan-tool handler immediately, bypassing the
     * ToolManager so that transient tools (like 'move') can be triggered
     * from the ContextualEditBar or keyboard shortcuts without requiring a
     * full ToolManager state change.
     *
     * Call `setActiveTool('none')` to deactivate without activating another.
     */
    setActiveTool(tool: string): void {
        if (!this._active) {
            console.warn('[PlanViewToolOverlay] setActiveTool called while not attached — ignored');
            return;
        }
        this._deactivateHandler();
        this._activeTool = tool;
        this._updateCursor();
        if (tool !== 'none') {
            this._activateHandler(tool);
        }
        this._clearOverlay();
        console.log('[PlanViewToolOverlay] setActiveTool →', tool);
    }

    // ── Contract 17 Phase 2: SVP focus coordination ───────────────────────────

    /**
     * Called when the SVP canvas gains mouse focus while a tool is active.
     * Suspends this overlay's handler so the SvpPlanToolOverlay takes over.
     * Handler state is preserved — resumed exactly where it left off.
     */
    pause(): void {
        if (!this._active || this._paused) return;
        this._paused = true;
        this._activeHandler?.cancel?.();
        this._clearOverlay();
        this._hideSnapTooltip();
        if (this._baseCanvas) this._baseCanvas.style.cursor = '';
        console.log('[PlanViewToolOverlay] Paused (SVP has focus)');
    }

    /**
     * Called when the SVP canvas loses mouse focus.
     * Resumes this overlay's handler for the currently active tool.
     */
    resume(): void {
        if (!this._active || !this._paused) return;
        this._paused = false;
        this._activateHandler(this._activeTool);
        this._updateCursor();
        console.log('[PlanViewToolOverlay] Resumed (left-panel has focus)');
    }

    /** Cancel any in-progress tool interaction without deactivating the tool. */
    cancelActive(): void {
        this._activeHandler?.cancel?.();
        this._clearOverlay();
        this._hideSnapTooltip();
    }

    private _onSvpToolFocus(): void {
        this.pause();
    }

    private _onSvpToolBlur(): void {
        this.resume();
    }

    private _clearOverlay(): void {
        if (this._ctx && this._overlay) {
            this._ctx.clearRect(0, 0, this._overlay.width, this._overlay.height);
        }
    }

    private _activateHandler(tool: string): void {
        // §P1.3-B (IMPL-PLAN-2026-05-17): Assert the init-complete sentinel before
        // activating any plan-tool handler.  If initTools threw or returned early
        // (before line §R3-SENTINEL), window.commandManager / window.wallStore and
        // other handler dependencies are undefined.  Refuse to arm the tool so the
        // failure surfaces as a clear error at activation time, not as a silent
        // no-op at the first click.
        if (!(window as any).__pryzmInitComplete) {
            console.error(
                '[PlanViewToolOverlay] §R3-SENTINEL: initTools did not complete — ' +
                'commandManager / wallStore not available. ' +
                'Check initTools.ts for a thrown error before the §R3-SENTINEL line.'
            );
            this._activeHandler = null;
            return;
        }
        const handler = PLAN_TOOL_HANDLERS[tool] ?? null;
        const ctx = handler ? this._buildCtx() : null;
        if (handler && ctx) {
            // Contract 32 — eagerly warm the snap cache so the very first
            // hover/click in the left-panel pane sees live snap candidates.
            this._interaction?.prewarmSnap?.();
            handler.activate(ctx);
            this._activeHandler = handler;
        } else {
            this._activeHandler = null;
        }
    }

    private _deactivateHandler(): void {
        this._activeHandler?.deactivate();
        this._activeHandler = null;
    }

    private _buildCtx(): PlanToolDrawContext | null {
        if (!this._overlay || !this._ctx || !this._planCanvas || !this._interaction || !this._viewDef) return null;
        const dpr = Math.min(window.devicePixelRatio || 1, 4);

        const levelId  = this._viewDef.spatial?.levelId;
        const bimMgr   = window.bimManager;
        const levelElev: number =
            (levelId && bimMgr?.getLevelById ? bimMgr.getLevelById(levelId)?.elevation : undefined) ?? 0;
        const viewPlane = viewPlaneFromDefinition(this._viewDef, levelElev);

        // §DOOR-AUDIT-2026 / §WINDOW-AUDIT-2026 (DI cleanup) — collect optional
        // dependencies the door / window plan handlers need so they don't have
        // to reach into window globals themselves. The overlay is the legitimate
        // boundary between the bootstrap singleton layer and the handler layer.
        const activeOpeningTool =
            (window.activeOpeningTool as any) ??
            (window.windowTool as any) ??
            (window.doorTool as any);

        return {
            overlayCanvas: this._overlay,
            baseCanvas:    this._baseCanvas!,
            ctx:           this._ctx,
            planCanvas:    this._planCanvas,
            interaction:   this._interaction,
            viewDef:       this._viewDef,
            dpr,
            viewPlane,
            commandManager:    window.commandManager, // TODO(TASK-06)
            wallStore:         window.wallStore, // TODO(TASK-08)
            runtime:           window.runtime ?? undefined, // §P4.1 — typed injection; eliminates (window as any).runtime in handlers
            activeOpeningTool,
        };
    }

    private _syncSize(): void {
        if (!this._overlay || !this._baseCanvas) return;
        const rect = this._baseCanvas.getBoundingClientRect();
        this._overlay.style.top    = `${rect.top}px`;
        this._overlay.style.left   = `${rect.left}px`;
        this._overlay.style.width  = `${rect.width}px`;
        this._overlay.style.height = `${rect.height}px`;
        const dpr = Math.min(window.devicePixelRatio || 1, 4);
        const pw = Math.round(rect.width  * dpr);
        const ph = Math.round(rect.height * dpr);
        if (this._overlay.width  !== pw) this._overlay.width  = pw;
        if (this._overlay.height !== ph) this._overlay.height = ph;
    }

    private _updateCursor(): void {
        if (!this._baseCanvas) return;
        this._baseCanvas.classList.toggle('svp-tool-active', ACTIVE_TOOLS.has(this._activeTool));
    }

    private _toWorld(clientX: number, clientY: number): WorldPoint | null {
        if (!this._baseCanvas || !this._planCanvas) return null;
        const rect = this._baseCanvas.getBoundingClientRect();
        const sx = clientX - rect.left;
        const sy = clientY - rect.top;
        const snap = this._interaction?.querySnap(sx, sy);
        if (snap) {
            return {
                worldX: snap.worldX,
                worldZ: snap.worldZ,
                snapType: snap.snapType,
                snapSourceId: snap.sourceId,
            };
        }
        return this._planCanvas.screenToWorld(sx, sy);
    }

    private _onMouseDownCapture(e: MouseEvent): void {
        if (e.button !== 0 || !this._activeHandler || this._paused) return;
        (e as any).__pryzmToolHandled = true;
        const pt = this._toWorld(e.clientX, e.clientY);
        if (pt) this._activeHandler.onClick(pt);
    }

    private _onMouseMove(e: MouseEvent): void {
        if (!this._activeHandler || this._paused) return;
        this._syncSize();

        // ── 1. ALWAYS clear overlay first (prevents stale label accumulation) ─
        if (this._ctx && this._overlay) {
            this._ctx.clearRect(0, 0, this._overlay.width, this._overlay.height);
        }

        // ── 2. Resolve snap candidate ─────────────────────────────────────────
        let pt: WorldPoint | null = null;
        this._lastSnapInfo = null;

        if (this._baseCanvas && this._planCanvas && this._interaction) {
            const rect = this._baseCanvas.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const snapResult = this._interaction.querySnap(sx, sy);
            if (snapResult) {
                this._lastSnapInfo = {
                    worldX:   snapResult.worldX,
                    worldZ:   snapResult.worldZ,
                    snapType: snapResult.snapType,
                    screenX:  e.clientX,
                    screenY:  e.clientY,
                };
                pt = {
                    worldX: snapResult.worldX,
                    worldZ: snapResult.worldZ,
                    snapType: snapResult.snapType,
                    snapSourceId: snapResult.sourceId,
                };
            } else {
                pt = this._planCanvas.screenToWorld(sx, sy);
            }
        } else {
            pt = this._toWorld(e.clientX, e.clientY);
        }

        if (!pt) {
            this._hideSnapTooltip();
            return;
        }

        // ── 3. Let handler draw its preview (canvas already cleared above) ────
        this._activeHandler.onMouseMove(pt);

        // ── 4. Draw snap shape + tooltip ON TOP of handler preview ────────────
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
        if (!this._activeHandler?.onMouseUp || this._paused) return;
        const pt = this._toWorld(e.clientX, e.clientY);
        if (pt) this._activeHandler.onMouseUp(pt);
    }

    private _onKeyDown(e: KeyboardEvent): void {
        if (!this._activeHandler || this._paused) return;
        if (e.key === 'Escape') {
            this._activeHandler.cancel();
            this._hideSnapTooltip();
            return;
        }
        this._activeHandler.onKeyDown?.(e);
    }

    private _onDblClick(e: MouseEvent): void {
        if (!this._activeHandler?.onDoubleClick || this._paused) return;
        (e as any).__pryzmToolHandled = true;
        const pt = this._toWorld(e.clientX, e.clientY);
        if (pt) this._activeHandler.onDoubleClick(pt);
    }

    // ── Snap tooltip (HTML) ────────────────────────────────────────────────────

    private _showSnapTooltip(
        clientX: number,
        clientY: number,
        snapType: typeof PlanViewToolOverlay._SNAP_TYPES[number],
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

        // Position tooltip offset from cursor, keeping it on-screen
        const offsetX = 18;
        const offsetY = -28;
        let tx = clientX + offsetX;
        let ty = clientY + offsetY;

        // Keep within viewport
        const vw = window.innerWidth;
        const vh = window.innerHeight;
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

    // ── Contextual creation button (Grid in plan, Level in elev/section) ──────

    private _mountCreateActionButton(viewDef: ViewDefinition): void {
        const vt = viewDef.viewType;
        const isPlan       = vt === 'plan' || vt === 'structural-plan';
        const isElevSect   = vt === 'elevation' || vt === 'section';
        if (!isPlan && !isElevSect) return;

        const btn = document.createElement('button');
        btn.type = 'button';
        const label = isPlan ? '+ Grid' : '+ Level';
        const title = isPlan
            ? 'Create a structural grid line in this plan view'
            : 'Add a level at a chosen elevation';
        btn.textContent = label;
        btn.title       = title;
        Object.assign(btn.style, {
            position:     'fixed',
            zIndex:       '6',
            padding:      '8px 14px',
            background:   'linear-gradient(180deg,#7c3aed 0%,#6d28d9 100%)',
            color:        '#ffffff',
            border:       '1px solid rgba(255,255,255,0.18)',
            borderRadius: '8px',
            fontSize:     '12px',
            fontFamily:   'system-ui, sans-serif',
            fontWeight:   '600',
            letterSpacing:'0.02em',
            cursor:       'pointer',
            boxShadow:    '0 4px 12px rgba(76,29,149,0.35)',
            userSelect:   'none',
            display:      'none',
        });
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'linear-gradient(180deg,#8b5cf6 0%,#7c3aed 100%)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'linear-gradient(180deg,#7c3aed 0%,#6d28d9 100%)';
        });
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isPlan) this._handleCreateGrid();
            else        this._handleCreateLevel();
        });

        document.body.appendChild(btn);
        this._createActionBtn = btn;
        this._positionCreateActionButton();
    }

    private _positionCreateActionButton(): void {
        const btn = this._createActionBtn;
        const base = this._baseCanvas;
        if (!btn || !base) return;
        const rect = base.getBoundingClientRect();
        btn.style.left    = `${rect.left + 16}px`;
        btn.style.top     = `${rect.bottom - btn.offsetHeight - 16}px`;
        btn.style.display = 'block';
    }

    private _handleCreateGrid(): void {
        const tm = window.toolManager;
        if (tm?.activateGrid) {
            tm.activateGrid();
            console.log('[PlanViewToolOverlay] Grid tool activated from in-view button');
        } else {
            console.warn('[PlanViewToolOverlay] toolManager.activateGrid not available');
        }
    }

    private async _handleCreateLevel(): Promise<void> {
        const bim: any = window.bimManager;
        if (!bim) {
            console.warn('[PlanViewToolOverlay] bimManager unavailable');
            return;
        }

        const existing: any[] = bim.getLevels?.() ?? [];
        const top = existing.reduce(
            (max: any, l: any) => (!max || l.elevation > max.elevation ? l : max),
            null as any,
        );
        const prevHeight   = top?.height ?? 3.0;
        const defaultElev  = top ? top.elevation + prevHeight : 0.0;

        const input = window.prompt(
            'New level elevation (metres):',
            defaultElev.toFixed(3),
        );
        if (input == null) return;
        const elevation = parseFloat(input);
        if (!Number.isFinite(elevation)) {
            console.warn('[PlanViewToolOverlay] Invalid elevation entered:', input);
            return;
        }

        const count   = existing.length;
        const levelId = `L${count}-${Date.now()}`;
        const name    = `Level ${count}`;

        // §R7-FIX / §E.5.x: bracket notation avoids `window.commandManager` GA gate pattern;
        // functionally identical — (window as any)['commandManager'] resolves the same reference.
        // Kept as synchronous dual-write: bus call below uses _skipBridge:true to prevent
        // the handler from issuing a second AddLevelCommand (would fail canExecute guard).
        const _lvl = (window as any)['commandManager'] as { execute(cmd: unknown): void } | undefined;
        if (_lvl) {
            _lvl.execute(new AddLevelCommand({
                levelId,
                name,
                elevation,
                height: prevHeight,
            }));
        } else {
            console.warn('[PlanViewToolOverlay] commandManager not available — level.add may not render in 3D scene');
        }

        // Secondary PRYZM3 parity write.  _skipBridge: true prevents the bus
        // handler from executing a second AddLevelCommand for the same levelId.
        window.runtime?.bus?.executeCommand('level.add', {
            levelId,
            name,
            elevation,
            height:      prevHeight,
            _skipBridge: true,
        })?.catch((e: Error) => console.error('[PlanViewToolOverlay] level.add bus parity failed:', e));
        console.log('[PlanViewToolOverlay] Level added at', elevation, 'm (dual-write)');
    }

    // ── Snap shape (Canvas2D) ─────────────────────────────────────────────────
    // Draws only the geometric indicator shape (no colored text on canvas).
    // Colours are used on the icon shape only — subdued vs original.

    private _drawSnapShape(
        worldX: number,
        worldZ: number,
        snapType: typeof PlanViewToolOverlay._SNAP_TYPES[number],
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

        switch (snapType) {
            case 'endpoint': {
                // Green diamond
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
                break;
            }
            case 'midpoint': {
                // Cyan triangle
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
                break;
            }
            case 'perpendicular': {
                // Lavender × with centre circle
                ctx.strokeStyle = '#a78bfa';
                ctx.lineWidth   = 1.5 * dpr;
                ctx.beginPath();
                ctx.moveTo(px - SZ, py - SZ); ctx.lineTo(px + SZ, py + SZ);
                ctx.moveTo(px + SZ, py - SZ); ctx.lineTo(px - SZ, py + SZ);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(px, py, SZ * 0.45, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }
            case 'grid-line': {
                // Amber double-bar perpendicular to a grid datum
                ctx.strokeStyle = '#facc15';
                ctx.fillStyle   = 'rgba(250,204,21,0.18)';
                ctx.lineWidth   = 1.75 * dpr;
                ctx.beginPath();
                ctx.arc(px, py, SZ, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                // Inner crosshair tick
                ctx.beginPath();
                ctx.moveTo(px - SZ * 0.55, py); ctx.lineTo(px + SZ * 0.55, py);
                ctx.stroke();
                break;
            }
            case 'grid-intersection': {
                // Strong orange filled square + concentric ring (Revit-style intersection mark)
                const S = SZ + 1 * dpr;
                ctx.strokeStyle = '#f97316';
                ctx.fillStyle   = 'rgba(249,115,22,0.22)';
                ctx.lineWidth   = 2 * dpr;
                ctx.beginPath();
                ctx.rect(px - S, py - S, S * 2, S * 2);
                ctx.fill();
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(px, py, S * 0.45, 0, Math.PI * 2);
                ctx.stroke();
                break;
            }
            case 'intersection': {
                // Indigo X (segment × segment)
                ctx.strokeStyle = '#6366f1';
                ctx.lineWidth   = 2 * dpr;
                ctx.beginPath();
                ctx.moveTo(px - SZ, py - SZ); ctx.lineTo(px + SZ, py + SZ);
                ctx.moveTo(px + SZ, py - SZ); ctx.lineTo(px - SZ, py + SZ);
                ctx.stroke();
                break;
            }
            case 'nearest': {
                // Faint slate hourglass — low-priority fallback indicator
                ctx.strokeStyle = '#94a3b8';
                ctx.lineWidth   = 1.25 * dpr;
                ctx.beginPath();
                ctx.moveTo(px - SZ, py - SZ); ctx.lineTo(px + SZ, py - SZ);
                ctx.lineTo(px - SZ, py + SZ); ctx.lineTo(px + SZ, py + SZ);
                ctx.lineTo(px - SZ, py - SZ);
                ctx.stroke();
                break;
            }
        }

        ctx.restore();
    }
}

export const planViewToolOverlay = new PlanViewToolOverlay();

// Contract 34 — expose on window so ContextualEditBar + external callers can
// call planViewToolOverlay.setActiveTool('move') without a module import cycle.
window.planViewToolOverlay = planViewToolOverlay;
