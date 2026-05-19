/**
 * CurtainWallPlanToolHandler — Plan-view curtain wall creation tool.
 *
 * CONTRACT COMPLIANCE:
 *   §26-PLAN-VIEW-ELEMENT-CREATION-PARITY §2, §4, §5, §6, §8
 *   §21-PLAN-VIEW-TOOL-OVERLAY-MODULARIZATION §4
 *   §01-BIM-ENGINE-CORE §1.5, §2.1
 *
 * ARCHITECTURE (mirrors WallPlanToolHandler exactly):
 *
 *   Mode source of truth: window.curtainWallModePicker.getActiveMode()
 *   Read on every onMouseMove() and onClick() — never cached.
 *   Default mode: 'linear' (NOT 'ortho' — the wall mode picker defaults to 'ortho'
 *   which was the root cause of the "always ortho" bug when sharing window.wallModePicker).
 *
 *   Drawing modes:
 *     linear  — free-angle straight polyline (default)
 *     ortho   — endpoint snapped to nearest 90° cardinal axis
 *     curved  — 3-click arc: start → arc-midpoint → end (quadratic Bézier)
 *     byslab  — falls back to linear in plan view (documented behaviour)
 *
 *   Mode HUD: a persistent mini bar (same wdh-bar CSS as WallDrawingHUD) is shown
 *   inside activate() and dismissed in deactivate(). Keyboard L/O/C switch modes.
 *
 *   Status overlay: a .th-overlay div shows the current instruction text.
 *
 * FIX LOG:
 *   CW-1 (2026-04): Root cause: handler was reading window.wallModePicker.getActiveMode()
 *   which defaults to 'ortho' (set by wall tool activation). Fixed by reading
 *   window.curtainWallModePicker.getActiveMode() which defaults to 'linear' and is
 *   kept in sync by Layout.ts on every activateCurtainWall() call and by
 *   CurtainWallTool._switchMode() on every internal mode switch.
 */

import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';
import { CurtainWallBuilder } from '@pryzm/geometry-curtain-wall';
import { createId } from '@pryzm/schemas';
// §P2.2 (IMPL-PLAN-2026-05-17): CreateCurtainWallCommand + window.commandManager bridge (P4.4).
// Curtain wall creation is now bus-only via the initBusHandlers §E.5.4 bridge.

const DEFAULT_MULLION_DEPTH = 0.18;
const DEFAULT_HEIGHT        = 3.0;
const DEFAULT_BAY_WIDTH     = 1.2;
const DEFAULT_BAY_HEIGHT    = 1.5;
const FALLBACK_COLOUR       = '#0ea5e9';
const ARC_SEGMENTS          = 16;

/**
 * §CURTAIN-WALL-AUDIT-2026 §5.4 / §7 — Dependency-injection struct for the
 * plan-view curtain-wall handler. Optional during the migration; missing
 * deps fall back to the legacy window globals.
 */
export interface CurtainWallPlanToolHandlerDependencies {
    curtainWallStore?: any;
    curtainWallModePicker?: any;
    commandManager?: any;
    vgGovernanceStore?: any;
}

// ─── Helpers (window-fallback aware) ─────────────────────────────────────────

function _getMode(deps?: Partial<CurtainWallPlanToolHandlerDependencies>): string {
    const picker = deps?.curtainWallModePicker ?? window.curtainWallModePicker;
    return picker?.getActiveMode?.() ?? 'linear';
}

function _resolveCWColour(deps?: Partial<CurtainWallPlanToolHandlerDependencies>): string {
    const vg = deps?.vgGovernanceStore ?? window.vgGovernanceStore; // TODO(TASK-08)
    if (vg?.resolveStyle) {
        const style = vg.resolveStyle('curtain-wall');
        if (style?.edgeColor) return style.edgeColor;
    }
    return FALLBACK_COLOUR;
}

function _mullionDepth(deps?: Partial<CurtainWallPlanToolHandlerDependencies>): number {
    const cwStore = deps?.curtainWallStore ?? window.curtainWallStore; // TODO(TASK-08)
    const depth = cwStore?.getDefaultMullionDepth?.();
    return typeof depth === 'number' && depth > 0 ? depth : DEFAULT_MULLION_DEPTH;
}

function _snapOrtho(start: WorldPoint, raw: WorldPoint): WorldPoint {
    const dx      = raw.worldX - start.worldX;
    const dz      = raw.worldZ - start.worldZ;
    const angle   = Math.atan2(dz, dx);
    const snapped = Math.round(angle / (Math.PI / 2)) * (Math.PI / 2);
    const dist    = Math.hypot(dx, dz);
    return {
        worldX: start.worldX + Math.cos(snapped) * dist,
        worldZ: start.worldZ + Math.sin(snapped) * dist,
    };
}

/**
 * Compute a Canvas2D quadratic Bézier control point from three world points.
 * The control point ensures the Bézier curve passes through `midThrough` at t=0.5.
 *   P(0.5) = 0.25·P0 + 0.5·P1 + 0.25·P2 = midThrough
 *   ⟹ P1 = 2·midThrough − 0.5·(P0 + P2)
 */
function _bezierControl(
    start: WorldPoint,
    midThrough: WorldPoint,
    end: WorldPoint,
): { x: number; z: number } {
    return {
        x: 2 * midThrough.worldX - 0.5 * (start.worldX + end.worldX),
        z: 2 * midThrough.worldZ - 0.5 * (start.worldZ + end.worldZ),
    };
}

/**
 * Sample N+1 evenly spaced points along a quadratic Bézier curve.
 * Returns an array of { worldX, worldZ } points (N segments between them).
 */
function _sampleBezier(
    p0: WorldPoint,
    ctrl: { x: number; z: number },
    p2: WorldPoint,
    segments: number,
): Array<{ worldX: number; worldZ: number }> {
    const pts: Array<{ worldX: number; worldZ: number }> = [];
    for (let i = 0; i <= segments; i++) {
        const t  = i / segments;
        const mt = 1 - t;
        pts.push({
            worldX: mt * mt * p0.worldX + 2 * mt * t * ctrl.x + t * t * p2.worldX,
            worldZ: mt * mt * p0.worldZ + 2 * mt * t * ctrl.z + t * t * p2.worldZ,
        });
    }
    return pts;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export class CurtainWallPlanToolHandler implements PlanToolHandler {
    private _ctx:    PlanToolDrawContext | null = null;

    private _startPt:     WorldPoint | null = null;
    private _arcMidPt:    WorldPoint | null = null;
    private _segmentCount = 0;
    private _cursor:      WorldPoint | null = null;

    // ── DOM elements (owned by this handler, cleaned up in deactivate) ────────
    private _modeBar:       HTMLElement | null = null;
    private _modeBarKeyHnd: ((e: KeyboardEvent) => void) | null = null;
    private _statusOverlay: HTMLElement | null = null;

    /** §CURTAIN-WALL-AUDIT-2026 §5.4 — DI deps (optional during migration). */
    private _deps: Partial<CurtainWallPlanToolHandlerDependencies>;

    constructor(deps: Partial<CurtainWallPlanToolHandlerDependencies> = {}) {
        this._deps = deps;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Lifecycle
    // ─────────────────────────────────────────────────────────────────────────

    activate(ctx: PlanToolDrawContext): void {
        this._ctx           = ctx;
        this._startPt       = null;
        this._arcMidPt      = null;
        this._segmentCount  = 0;
        this._cursor        = null;
        // §CURTAIN-WALL-AUDIT-2026 §7 (PERF-FIX-1): defer per-wall shadow passes
        // while the user is actively placing curtain walls in plan view. Shadows
        // are batched and re-enabled in one idle-callback flush on deactivate.
        // Mirrors CurtainWallTool.activate() so plan and 3D parity is maintained.
        CurtainWallBuilder.beginPlacementMode();
        this._showModeBar();
        this._syncStatusOverlay();
        console.log('[CurtainWallPlanToolHandler] Activated — mode:', _getMode(this._deps));
    }

    deactivate(): void {
        // §CURTAIN-WALL-AUDIT-2026 §7: end placement mode — schedules one
        // consolidated shadow flush for all walls placed during this session.
        CurtainWallBuilder.endPlacementMode();
        this._clearOverlay();
        this._removeModeBar();
        this._removeStatusOverlay();
        this._startPt       = null;
        this._arcMidPt      = null;
        this._segmentCount  = 0;
        this._cursor        = null;
        this._ctx           = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Event handlers
    // ─────────────────────────────────────────────────────────────────────────

    onMouseMove(pt: WorldPoint): void {
        const mode = _getMode(this._deps);
        let resolved = pt;
        if (this._startPt && mode === 'ortho') {
            resolved = _snapOrtho(this._startPt, pt);
        }
        this._cursor = resolved;
        if (this._startPt) this._drawPreview();
    }

    onClick(pt: WorldPoint): void {
        const mode = _getMode(this._deps);
        let resolved = pt;
        if (this._startPt && mode === 'ortho') {
            resolved = _snapOrtho(this._startPt, pt);
        }

        if (!this._startPt) {
            this._startPt       = resolved;
            this._arcMidPt      = null;
            this._segmentCount  = 0;
            this._syncStatusOverlay();
            console.log('[CurtainWallPlanToolHandler] Start point set', resolved, 'mode:', mode);
            return;
        }

        if (mode === 'curved' && !this._arcMidPt) {
            this._arcMidPt = pt;
            this._cursor   = null;
            this._syncStatusOverlay();
            console.log('[CurtainWallPlanToolHandler] Arc midpoint set', pt);
            return;
        }

        this._commit(resolved);
    }

    onDoubleClick(_pt: WorldPoint): void {}

    onKeyDown(e: KeyboardEvent): boolean {
        // Mode switching — L/O/C (same shortcuts as wall tool)
        const key = e.key.toLowerCase();
        if (key === 'l') {
            e.preventDefault();
            this._setMode('linear');
            return true;
        }
        if (key === 'o') {
            e.preventDefault();
            this._setMode('ortho');
            return true;
        }
        if (key === 'c') {
            e.preventDefault();
            this._setMode('curved');
            return true;
        }

        if (e.key === 'Escape') {
            if (this._arcMidPt) {
                this._arcMidPt = null;
                this._clearOverlay();
                this._syncStatusOverlay();
                return true;
            }
            this.cancel();
            return true;
        }
        return false;
    }

    cancel(): void {
        this._startPt       = null;
        this._arcMidPt      = null;
        this._segmentCount  = 0;
        this._cursor        = null;
        this._syncStatusOverlay();
        this._clearOverlay();
    }

    redraw(): void {
        if (this._startPt && this._cursor) this._drawPreview();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mode switch — updates picker + HUD highlight
    // ─────────────────────────────────────────────────────────────────────────

    private _setMode(mode: string): void {
        const picker = this._deps.curtainWallModePicker ?? window.curtainWallModePicker;
        picker?.setActiveMode?.(mode);
        this._updateModeBarHighlight(mode);
        // If switching away from curved mid-draw, clear arc state
        if (mode !== 'curved') {
            this._arcMidPt = null;
        }
        this._syncStatusOverlay();
        // Redraw preview with new mode constraint
        if (this._startPt && this._cursor) this._drawPreview();
        console.log('[CurtainWallPlanToolHandler] Mode switched to', mode);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Commit
    // ─────────────────────────────────────────────────────────────────────────

    private _commit(endPt: WorldPoint): void {
        const c  = this._ctx;
        const sp = this._startPt;
        if (!c || !sp) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[CurtainWallPlanToolHandler] ViewDefinition.spatial.levelId is missing');
            return;
        }

        const len = Math.hypot(endPt.worldX - sp.worldX, endPt.worldZ - sp.worldZ);
        if (len < 0.05) {
            console.warn('[CurtainWallPlanToolHandler] Curtain wall too short — ignored');
            this._arcMidPt = null;
            return;
        }

        const mode = _getMode(this._deps);

        if (mode === 'curved' && this._arcMidPt) {
            // ── Curved: Bézier arc sampled into ARC_SEGMENTS straight segments ──
            // Mirrors CurtainWallTool._createArcSegments() — the command has no curve
            // field; we approximate the arc by issuing N straight segment commands.
            const ctrl = _bezierControl(sp, this._arcMidPt, endPt);
            const pts  = _sampleBezier(sp, ctrl, endPt, ARC_SEGMENTS);
            // §P3.1-CW (IMPL-PLAN-2026-05-17): typed bus dispatch — curtainwall.create (no hyphen).
            // Routes directly to CreateCurtainWallHandler (registered via registerCurtainWallHandlers
            // in engineLauncher.ts). The legacy bridge in initBusHandlers.ts §E.5.4 has been removed.
            // baseLine uses [Vec3, Vec3] format as required by CreateCurtainWallPayload.
            // C11 §3.2 + C11 §7.0 FIX-CW-ID: pre-generate a branded curtainwall_<ulid>
            // id per segment using createId('curtainwall') from @pryzm/schemas.
            // The CEB extracts id from record.payload → emits ev.id on 'curtain-wall.created'.
            // The initTools §P3.1-CW bridge guards on !ev.id — if id is omitted the
            // guard silently drops every event → no mesh, no plan view projection.
            for (let i = 0; i < pts.length - 1; i++) {
                window.runtime?.bus?.executeCommand('curtainwall.create', {
                    id:       createId('curtainwall'),
                    baseLine: [
                        { x: pts[i].worldX,     y: 0, z: pts[i].worldZ     },
                        { x: pts[i + 1].worldX, y: 0, z: pts[i + 1].worldZ },
                    ],
                    height:           DEFAULT_HEIGHT,
                    bayWidth:         DEFAULT_BAY_WIDTH,
                    bayHeight:        DEFAULT_BAY_HEIGHT,
                    mullionThickness: DEFAULT_MULLION_DEPTH,
                    levelId,
                })?.catch((e: Error) => console.error('[CurtainWallPlanToolHandler] curtainwall.create arc seg', i, 'failed:', e));
            }
            console.log(`[CurtainWallPlanToolHandler] Arc created (${ARC_SEGMENTS} segments)`);
            this._segmentCount += ARC_SEGMENTS;
            // Arc is always one-shot — reset to AWAITING_FIRST_POINT
            this._startPt  = null;
            this._arcMidPt = null;
            this._cursor   = null;
            this._syncStatusOverlay();
            this._clearOverlay();
            return;
        }

        // ── Linear / Ortho: single straight segment, then chain ──────────────
        // §P3.1-CW (IMPL-PLAN-2026-05-17): typed bus dispatch — curtainwall.create (no hyphen).
        // Routes directly to CreateCurtainWallHandler (registered via registerCurtainWallHandlers
        // in engineLauncher.ts). The legacy curtain-wall.create bridge is removed.
        //
        // C11 §3.2 + C11 §7.0 FIX-CW-ID: pre-generate a branded curtainwall_<ulid>
        // id using createId('curtainwall') from @pryzm/schemas.
        // The CEB extracts id from record.payload → emits ev.id on 'curtain-wall.created'.
        // The initTools §P3.1-CW bridge guards on !ev.id — if id is omitted the guard
        // silently drops every event → legacy store never updated → no mesh, no plan view.
        // CurtainWall.parse() enforces ^curtainwall_[ULID]{26}$ — createId('curtainwall')
        // generates that format. crypto.randomUUID() must NOT be used.
        const cwId = createId('curtainwall');
        window.runtime?.bus?.executeCommand('curtainwall.create', {
            id:       cwId,
            baseLine: [
                { x: sp.worldX,    y: 0, z: sp.worldZ },
                { x: endPt.worldX, y: 0, z: endPt.worldZ },
            ],
            height:           DEFAULT_HEIGHT,
            bayWidth:         DEFAULT_BAY_WIDTH,
            bayHeight:        DEFAULT_BAY_HEIGHT,
            mullionThickness: DEFAULT_MULLION_DEPTH,
            levelId,
        })?.catch((e: Error) => console.error('[CurtainWallPlanToolHandler] curtainwall.create bus failed:', e));

        // Optimistic chaining — advance state immediately (bus is fire-and-forget)
        console.log('[CurtainWallPlanToolHandler] Segment created mode:', mode);
        this._segmentCount++;
        // Polyline chaining: endpoint becomes new start
        this._startPt  = endPt;
        this._arcMidPt = null;
        this._cursor   = null;
        this._syncStatusOverlay();
        this._clearOverlay();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Preview drawing
    // ─────────────────────────────────────────────────────────────────────────

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c || !this._startPt || !this._cursor) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        ctx.save();

        const colour = _resolveCWColour(this._deps);
        const sp = this._startPt;
        const cp = this._cursor;
        const mode = _getMode(this._deps);

        const sA = planCanvas.worldToScreen(sp.worldX, sp.worldZ);
        const sB = planCanvas.worldToScreen(cp.worldX, cp.worldZ);

        if (mode === 'curved' && this._arcMidPt) {
            // ── Curved state 2: draw arc from start through arcMidPt to cursor ──
            const sm   = planCanvas.worldToScreen(this._arcMidPt.worldX, this._arcMidPt.worldZ);
            const ctrl = _bezierControl(sp, this._arcMidPt, cp);
            const sc   = planCanvas.worldToScreen(ctrl.x, ctrl.z);

            ctx.strokeStyle = colour;
            ctx.lineWidth   = 2.5;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(sA.sx, sA.sy);
            ctx.quadraticCurveTo(sc.sx, sc.sy, sB.sx, sB.sy);
            ctx.stroke();

            // Arc midpoint marker
            ctx.fillStyle = colour;
            ctx.beginPath(); ctx.arc(sm.sx, sm.sy, 5, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
            ctx.stroke();

            // Chord length label
            const distM = Math.hypot(cp.worldX - sp.worldX, cp.worldZ - sp.worldZ);
            const label  = `~${distM.toFixed(2)} m (arc)`;
            const midX   = (sA.sx + sB.sx) / 2;
            const midY   = (sA.sy + sB.sy) / 2;
            ctx.font = 'bold 11px sans-serif';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.fillRect(midX - tw / 2 - 4, midY - 9, tw + 8, 16);
            ctx.fillStyle    = '#0c4a6e';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY);

        } else if (mode === 'curved' && !this._arcMidPt) {
            // ── Curved state 1: awaiting arc midpoint — dashed preview ──
            ctx.strokeStyle = colour;
            ctx.lineWidth   = 2;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(sA.sx, sA.sy);
            ctx.lineTo(sB.sx, sB.sy);
            ctx.stroke();
            ctx.setLineDash([]);

        } else {
            // ── Linear / Ortho / By-slab (linear fallback): solid thickness band ──
            const ppu   = planCanvas.getPixelsPerUnit();
            const depth = _mullionDepth(this._deps);
            const thickPx   = Math.max(3, depth * ppu);
            const segDx     = sB.sx - sA.sx;
            const segDy     = sB.sy - sA.sy;
            const screenLen = Math.hypot(segDx, segDy);

            if (screenLen >= 0.5) {
                const halfW  = thickPx / 2;
                const perpX  = -segDy / screenLen;
                const perpY  =  segDx / screenLen;
                const corners = [
                    { x: sA.sx + perpX * halfW, y: sA.sy + perpY * halfW },
                    { x: sA.sx - perpX * halfW, y: sA.sy - perpY * halfW },
                    { x: sB.sx - perpX * halfW, y: sB.sy - perpY * halfW },
                    { x: sB.sx + perpX * halfW, y: sB.sy + perpY * halfW },
                ];
                ctx.fillStyle   = colour + '38';
                ctx.strokeStyle = colour;
                ctx.lineWidth   = 1.5;
                ctx.setLineDash([]);
                ctx.beginPath();
                ctx.moveTo(corners[0].x, corners[0].y);
                ctx.lineTo(corners[1].x, corners[1].y);
                ctx.lineTo(corners[2].x, corners[2].y);
                ctx.lineTo(corners[3].x, corners[3].y);
                ctx.closePath();
                ctx.fill();
                ctx.stroke();

                // Center dashed guideline
                ctx.setLineDash([6, 4]);
                ctx.lineWidth   = 1;
                ctx.strokeStyle = colour + 'aa';
                ctx.beginPath();
                ctx.moveTo(sA.sx, sA.sy);
                ctx.lineTo(sB.sx, sB.sy);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // Length label at midpoint
            const distM  = Math.hypot(cp.worldX - sp.worldX, cp.worldZ - sp.worldZ);
            const label  = `${distM.toFixed(2)} m`;
            const midX   = (sA.sx + sB.sx) / 2;
            const midY   = (sA.sy + sB.sy) / 2;
            ctx.font = 'bold 11px sans-serif';
            const tw = ctx.measureText(label).width;
            ctx.fillStyle    = 'rgba(255,255,255,0.92)';
            ctx.fillRect(midX - tw / 2 - 4, midY - 9, tw + 8, 16);
            ctx.fillStyle    = '#0c4a6e';
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, midX, midY);
        }

        // Start and end dots
        ctx.fillStyle = colour;
        ctx.beginPath(); ctx.arc(sA.sx, sA.sy, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(sB.sx, sB.sy, 4, 0, Math.PI * 2); ctx.fill();

        ctx.restore();
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Mode bar HUD (persistent L/O/C mini bar — same wdh-bar CSS as WallDrawingHUD)
    // ─────────────────────────────────────────────────────────────────────────

    private _showModeBar(): void {
        this._removeModeBar();

        const bar = document.createElement('div');
        bar.className = 'wdh-bar';
        bar.setAttribute('data-cwph', '1');

        const lbl = document.createElement('span');
        lbl.className = 'wdh-mode-lbl';
        lbl.textContent = 'Curtain Wall:';
        bar.appendChild(lbl);

        const currentMode = _getMode(this._deps);
        const modes: Array<{ key: string; label: string; modeId: string }> = [
            { key: 'L', label: 'Linear',     modeId: 'linear'  },
            { key: 'O', label: 'Orthogonal', modeId: 'ortho'   },
            { key: 'C', label: 'Curved',     modeId: 'curved'  },
        ];

        for (const m of modes) {
            const btn = document.createElement('button');
            btn.className = 'wdh-btn' + (m.modeId === currentMode ? ' wdh-btn--active' : '');
            btn.dataset.cwMode = m.modeId;
            btn.innerHTML = `<span class="wdh-key">${m.key}</span><span class="wdh-lbl">${m.label}</span>`;
            btn.title = `Switch to ${m.label} mode (${m.key})`;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._setMode(m.modeId);
            });
            bar.appendChild(btn);
        }

        const esc = document.createElement('span');
        esc.className = 'wdh-esc';
        esc.textContent = 'ESC to cancel';
        bar.appendChild(esc);

        document.body.appendChild(bar);
        this._modeBar = bar;

        // Keyboard shortcuts — bubbling (fires after capture-phase handlers)
        this._modeBarKeyHnd = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
            const key = e.key.toLowerCase();
            if (key === 'l') { e.stopImmediatePropagation(); this._setMode('linear'); }
            if (key === 'o') { e.stopImmediatePropagation(); this._setMode('ortho'); }
            if (key === 'c') { e.stopImmediatePropagation(); this._setMode('curved'); }
        };
        window.addEventListener('keydown', this._modeBarKeyHnd);
    }

    private _removeModeBar(): void {
        if (this._modeBarKeyHnd) {
            window.removeEventListener('keydown', this._modeBarKeyHnd);
            this._modeBarKeyHnd = null;
        }
        if (this._modeBar) {
            this._modeBar.remove();
            this._modeBar = null;
        }
    }

    private _updateModeBarHighlight(mode: string): void {
        if (!this._modeBar) return;
        this._modeBar.querySelectorAll<HTMLButtonElement>('[data-cw-mode]').forEach(btn => {
            btn.classList.toggle('wdh-btn--active', btn.dataset.cwMode === mode);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Status overlay (.th-overlay) — instruction text below mode bar
    // ─────────────────────────────────────────────────────────────────────────

    private _ensureStatusOverlay(): HTMLElement {
        if (!this._statusOverlay) {
            const overlay = document.createElement('div');
            overlay.className = 'th-overlay';
            const text = document.createElement('span');
            text.id = 'cwph-status-text';
            text.className = 'th-text';
            overlay.appendChild(text);
            document.body.appendChild(overlay);
            this._statusOverlay = overlay;
        }
        return this._statusOverlay;
    }

    private _removeStatusOverlay(): void {
        this._statusOverlay?.remove();
        this._statusOverlay = null;
    }

    private _syncStatusOverlay(): void {
        if (!this._ctx) { this._removeStatusOverlay(); return; }
        const mode    = _getMode(this._deps);
        const overlay = this._ensureStatusOverlay();
        const textEl  = overlay.querySelector('#cwph-status-text');

        if (textEl) {
            if (!this._startPt) {
                textEl.textContent = 'Click to start curtain wall · L/O/C to switch mode';
            } else if (mode === 'curved' && !this._arcMidPt) {
                textEl.textContent = 'Click arc midpoint · Esc to cancel arc';
            } else if (mode === 'curved' && this._arcMidPt) {
                textEl.textContent = 'Click end point to commit arc curtain wall';
            } else {
                textEl.textContent = 'Click next point · chains automatically · Esc to cancel';
            }
        }
        overlay.style.display = 'flex';
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Canvas overlay clear
    // ─────────────────────────────────────────────────────────────────────────

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
