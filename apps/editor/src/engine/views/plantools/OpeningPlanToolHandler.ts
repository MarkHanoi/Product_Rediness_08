/**
 * OpeningPlanToolHandler — Plan-view tool for cutting openings in slabs.
 *
 * CONTRACT COMPLIANCE:
 *   §21 §2  : Immutable context injected on activate(). Handler never attaches DOM listeners
 *             to the canvas, overlayCanvas, baseCanvas, or window events managed by the
 *             coordinator. The HUD element is entirely self-managed (created/destroyed by this
 *             handler) and is independent of the coordinator's event routing.
 *   §24 §3  : Uses PlanToolDrawContext for coordinate transforms and canvas rendering.
 *   §01 §2.7: Commits via CreateOpeningCommand only — no direct store mutation.
 *   §02 §6.1: Host slab resolved from store/selectionManager — no scene traversal.
 *   §05     : No tool-specific UI state — mode is read from window._pryzmActiveOpeningMode.
 *
 * Drawing modes (set via window._pryzmActiveOpeningMode before activateOpeningTool()):
 *
 *   'polyline' (default):
 *     Click to add polygon vertices (min 3).
 *     Double-click OR Enter OR HUD "Create Opening" button closes the polygon and commits.
 *     Backspace or HUD "↩ Undo" removes the last point.
 *     Escape cancels (tool remains active, polygon cleared).
 *
 *   '2point':
 *     Click first corner → live rectangle preview follows mouse.
 *     Click second corner → rectangle profile committed immediately.
 *     Escape cancels.
 *
 * HUD bar:
 *   A floating dark bar at bottom-center of the viewport shows:
 *   - Current state label ("Click first corner", "4 pts — ready to create", …)
 *   - [↩ Undo] ghost button  (polyline only, enabled when ≥1 pts)
 *   - [✓ Create Opening] red button  (polyline only, enabled when ≥3 pts)
 *   The HUD is touch/mouse accessible and always visible while the tool is active.
 *
 * Host slab resolution order (on activate() and on each onClick()):
 *   1. selectionManager.selectedObject → traverse up to userData.elementType === 'slab'.
 *   2. selectionManager.getSelectedId?.() → slabStore.getById().
 *   3. window._pryzmSelectedSlabId (fallback set by ToolManager at button-press time).
 */

import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

export type OpeningDrawingMode = 'polyline' | '2point';

// ── Colour palette — crimson/red, distinct from slab (slate) ──────────────────
const OPEN_FILL_COLOR      = '#dc2626';
const OPEN_EDGE_COLOR      = '#b91c1c';
const OPEN_CLOSE_COLOR     = 'rgba(185,28,28,0.35)';
const OPEN_CROSSHAIR_COLOR = '#b91c1c';
const CROSSHAIR_RADIUS     = 6;
const CROSSHAIR_TICK       = 10;

// ── HUD element IDs ────────────────────────────────────────────────────────────
const HUD_ID        = 'opening-plan-tool-hud';
const HUD_LABEL_ID  = 'opening-plan-tool-hud-label';
const HUD_UNDO_ID   = 'opening-plan-tool-hud-undo';
const HUD_CREATE_ID = 'opening-plan-tool-hud-create';

export class OpeningPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _points: WorldPoint[]            = [];
    private _cursorPt: WorldPoint | null     = null;

    // §T-B1 (DAILY-USE-AUDIT 2026-05-20) — opt-in stroke-preservation per the
    // PlanToolHandler.hasActiveStroke?() contract. Opening polylines must
    // survive temporary off-canvas excursions during multi-click placement.
    hasActiveStroke(): boolean { return this._points.length > 0; }
    private _hostSlabId: string | null       = null;
    private _mode: OpeningDrawingMode        = 'polyline';
    private _hud: HTMLElement | null         = null;

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    activate(ctx: PlanToolDrawContext): void {
        this._ctx        = ctx;
        this._points     = [];
        this._cursorPt   = null;
        this._mode       = (window._pryzmActiveOpeningMode as OpeningDrawingMode) ?? 'polyline';
        this._hostSlabId = this._resolveHostSlab();
        console.log('[OpeningPlanToolHandler] activated — mode:', this._mode,
            '— host slab:', this._hostSlabId ?? 'NONE (will retry on click)');
        this._createHUD();
        this._updateHUD();
        this._drawPreview();
    }

    deactivate(): void {
        this._removeHUD();
        this._clearOverlay();
        this._points     = [];
        this._cursorPt   = null;
        this._hostSlabId = null;
        this._ctx        = null;
        console.log('[OpeningPlanToolHandler] deactivated');
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursorPt = pt;
        this._drawPreview();
    }

    onClick(pt: WorldPoint): void {
        // Retry host resolution on each click in case the user selected slab after activation
        if (!this._hostSlabId) {
            this._hostSlabId = this._resolveHostSlab();
            if (!this._hostSlabId) {
                console.warn('[OpeningPlanToolHandler] onClick: no host slab — ignoring click');
                this._drawPreview();
                return;
            }
        }

        if (this._mode === '2point') {
            this._points.push(pt);
            this._cursorPt = pt;
            console.log(`[OpeningPlanToolHandler] 2-point corner ${this._points.length}`,
                `worldX=${pt.worldX.toFixed(3)} worldZ=${pt.worldZ.toFixed(3)}`);
            if (this._points.length >= 2) {
                this._commit2Point();
            } else {
                this._updateHUD();
                this._drawPreview();
            }
        } else {
            this._points.push(pt);
            this._cursorPt = pt;
            this._updateHUD();
            this._drawPreview();
            console.log(`[OpeningPlanToolHandler] polyline vertex ${this._points.length}`,
                `worldX=${pt.worldX.toFixed(3)} worldZ=${pt.worldZ.toFixed(3)}`);
        }
    }

    onDoubleClick(_pt: WorldPoint): void {
        if (this._mode === 'polyline') {
            console.log(`[OpeningPlanToolHandler] double-click — points=${this._points.length}`);
            if (this._points.length >= 3) this._commitPolyline();
        }
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (this._mode === 'polyline') {
            if (e.key === 'Enter' && this._points.length >= 3) {
                e.preventDefault();
                this._commitPolyline();
                return true;
            }
            if (e.key === 'Backspace' && this._points.length > 0) {
                this._points.pop();
                this._updateHUD();
                this._drawPreview();
                return true;
            }
        }
        if (e.key === 'Escape') {
            this.cancel();
            return true;
        }
        return false;
    }

    cancel(): void {
        this._points   = [];
        this._cursorPt = null;
        this._updateHUD();
        this._clearOverlay();
    }

    redraw(): void {
        this._drawPreview();
    }

    // ─── Host slab resolution ─────────────────────────────────────────────────

    private _resolveHostSlab(): string | null {
        const sm = window.selectionManager;
        if (sm) {
            // Option 1: traverse selected 3D object userData (mirrors OpeningTool 3D logic)
            let host = sm.selectedObject ?? null;
            while (host && !host.userData?.elementType) {
                host = host.parent ?? null;
            }
            if (host?.userData?.elementType?.toLowerCase() === 'slab' && host?.userData?.id) {
                return host.userData.id as string;
            }

            // Option 2: getSelectedId() + slabStore lookup
            const selectedId: string | null = sm.getSelectedId?.() ?? sm.selectedId ?? null;
            if (selectedId) {
                const slabStore = window.slabStore // TODO(TASK-08)
                    ?? window.commandManager?.context?.stores?.slabStore; // TODO(TASK-05)
                if (slabStore?.getById?.(selectedId)) return selectedId;
            }
        }

        // Option 3: explicit fallback stored by ToolManager at button-press time
        const fallback: string | undefined = window._pryzmSelectedSlabId;
        if (fallback) return fallback;

        return null;
    }

    // ─── Commit: polyline ─────────────────────────────────────────────────────

    private _commitPolyline(): void {
        if (!this._ctx || this._points.length < 3) return;

        const hostId = this._hostSlabId;
        if (!hostId) {
            console.error('[OpeningPlanToolHandler] Cannot commit — no host slab');
            return;
        }

        const levelId = this._ctx.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[OpeningPlanToolHandler] ViewDefinition.spatial.levelId missing');
            return;
        }

        const profile = this._points.map(p => ({ x: p.worldX, y: p.worldZ }));
        const id      = crypto.randomUUID();
        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
        window.runtime?.bus?.executeCommand('opening.create', { id, hostId, levelId, profile, baseOffset: 0 })
            ?.catch((e: Error) => console.error('[OpeningPlanToolHandler] opening.create (polyline) failed:', e));
        console.log('[OpeningPlanToolHandler] Opening (polyline) created', id, 'on slab', hostId);

        this._points   = [];
        this._cursorPt = null;
        this._updateHUD();
        this._clearOverlay();
    }

    // ─── Commit: 2-point rectangle ────────────────────────────────────────────

    private _commit2Point(): void {
        if (!this._ctx || this._points.length < 2) return;

        const hostId = this._hostSlabId;
        if (!hostId) {
            console.error('[OpeningPlanToolHandler] Cannot commit — no host slab');
            return;
        }

        const levelId = this._ctx.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[OpeningPlanToolHandler] ViewDefinition.spatial.levelId missing');
            return;
        }

        const a = this._points[0];
        const b = this._points[1];
        const profile = [
            { x: a.worldX, y: a.worldZ },
            { x: b.worldX, y: a.worldZ },
            { x: b.worldX, y: b.worldZ },
            { x: a.worldX, y: b.worldZ },
        ];
        const id     = crypto.randomUUID();
        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
        window.runtime?.bus?.executeCommand('opening.create', { id, hostId, levelId, profile, baseOffset: 0 })
            ?.catch((e: Error) => console.error('[OpeningPlanToolHandler] opening.create (2-point) failed:', e));
        console.log('[OpeningPlanToolHandler] Opening (2-point) created', id, 'on slab', hostId);

        this._points   = [];
        this._cursorPt = null;
        this._updateHUD();
        this._clearOverlay();
    }

    // ─── HUD ─────────────────────────────────────────────────────────────────

    private _createHUD(): void {
        this._removeHUD();

        const hud = document.createElement('div');
        hud.id = HUD_ID;
        Object.assign(hud.style, {
            position:     'fixed',
            bottom:       '72px',
            left:         '50%',
            transform:    'translateX(-50%)',
            zIndex:       '8500',
            display:      'flex',
            alignItems:   'center',
            gap:          '8px',
            padding:      '5px 10px',
            background:   'rgba(22,26,34,0.94)',
            color:        '#e2e8f0',
            fontSize:     '11px',
            fontFamily:   'system-ui, sans-serif',
            fontWeight:   '500',
            borderRadius: '8px',
            border:       '1px solid rgba(255,255,255,0.10)',
            boxShadow:    '0 2px 14px rgba(0,0,0,0.45)',
            userSelect:   'none',
            pointerEvents:'all',
            whiteSpace:   'nowrap',
        });

        // ── Mode badge ─────────────────────────────────────────────────────
        const badge = document.createElement('span');
        Object.assign(badge.style, {
            fontSize:     '9px',
            fontWeight:   '700',
            letterSpacing:'0.08em',
            textTransform:'uppercase',
            color:        '#fca5a5',
            padding:      '1px 5px',
            background:   'rgba(220,38,38,0.2)',
            borderRadius: '3px',
            flexShrink:   '0',
        });
        badge.textContent = this._mode === '2point' ? '2-POINT' : 'POLYLINE';
        hud.appendChild(badge);

        // ── Separator ──────────────────────────────────────────────────────
        const sep1 = document.createElement('span');
        Object.assign(sep1.style, {
            width:      '1px',
            height:     '14px',
            background: 'rgba(255,255,255,0.15)',
            flexShrink: '0',
        });
        hud.appendChild(sep1);

        // ── Status label ───────────────────────────────────────────────────
        const label = document.createElement('span');
        label.id = HUD_LABEL_ID;
        hud.appendChild(label);

        // ── Polyline-only controls ─────────────────────────────────────────
        if (this._mode === 'polyline') {
            const sep2 = document.createElement('span');
            Object.assign(sep2.style, {
                width:      '1px',
                height:     '14px',
                background: 'rgba(255,255,255,0.15)',
                flexShrink: '0',
            });
            hud.appendChild(sep2);

            // Undo button
            const undoBtn = document.createElement('button');
            undoBtn.id   = HUD_UNDO_ID;
            undoBtn.type = 'button';
            undoBtn.textContent = '↩ Undo';
            Object.assign(undoBtn.style, {
                background:  'transparent',
                border:      '1px solid rgba(255,255,255,0.15)',
                color:       'rgba(226,232,240,0.8)',
                fontSize:    '11px',
                fontFamily:  'system-ui, sans-serif',
                fontWeight:  '500',
                cursor:      'pointer',
                padding:     '3px 8px',
                borderRadius:'5px',
                transition:  'opacity 0.12s, background 0.12s',
                flexShrink:  '0',
            });
            undoBtn.addEventListener('mouseover', () => {
                if (!(undoBtn as HTMLButtonElement).disabled) {
                    undoBtn.style.background = 'rgba(255,255,255,0.08)';
                }
            });
            undoBtn.addEventListener('mouseout', () => {
                undoBtn.style.background = 'transparent';
            });
            undoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._points.length > 0) {
                    this._points.pop();
                    this._updateHUD();
                    this._drawPreview();
                }
            });
            hud.appendChild(undoBtn);

            // Create Opening button
            const createBtn = document.createElement('button');
            createBtn.id   = HUD_CREATE_ID;
            createBtn.type = 'button';
            createBtn.textContent = '✓  Create Opening';
            Object.assign(createBtn.style, {
                background:  '#dc2626',
                border:      'none',
                color:       '#fff',
                fontSize:    '11px',
                fontFamily:  'system-ui, sans-serif',
                fontWeight:  '700',
                cursor:      'pointer',
                padding:     '4px 11px',
                borderRadius:'5px',
                transition:  'opacity 0.12s, background 0.12s',
                flexShrink:  '0',
                letterSpacing:'0.02em',
            });
            createBtn.addEventListener('mouseover', () => {
                if (!(createBtn as HTMLButtonElement).disabled) {
                    createBtn.style.background = '#b91c1c';
                }
            });
            createBtn.addEventListener('mouseout', () => {
                if (!(createBtn as HTMLButtonElement).disabled) {
                    createBtn.style.background = '#dc2626';
                }
            });
            createBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this._points.length >= 3) this._commitPolyline();
            });
            hud.appendChild(createBtn);
        }

        document.body.appendChild(hud);
        this._hud = hud;
    }

    private _updateHUD(): void {
        if (!this._hud) return;
        const n         = this._points.length;
        const label     = this._hud.querySelector(`#${HUD_LABEL_ID}`) as HTMLElement | null;
        const createBtn = this._hud.querySelector(`#${HUD_CREATE_ID}`) as HTMLButtonElement | null;
        const undoBtn   = this._hud.querySelector(`#${HUD_UNDO_ID}`) as HTMLButtonElement | null;

        // ── Status text ──────────────────────────────────────────────────────
        if (label) {
            if (this._mode === '2point') {
                label.textContent = !this._hostSlabId
                    ? 'Select a slab first'
                    : n === 0
                        ? 'Click first corner'
                        : 'Click second corner to place';
            } else {
                if (!this._hostSlabId) {
                    label.textContent = 'Select a slab first';
                } else if (n === 0) {
                    label.textContent = 'Click to place first vertex';
                } else {
                    const need = Math.max(0, 3 - n);
                    label.textContent = need > 0
                        ? `${n} pt${n !== 1 ? 's' : ''} — ${need} more to enable`
                        : `${n} pts — Enter or click ✓ to create`;
                }
            }
        }

        // ── Create button state ──────────────────────────────────────────────
        if (createBtn) {
            const ready = n >= 3;
            createBtn.disabled          = !ready;
            createBtn.style.opacity     = ready ? '1' : '0.32';
            createBtn.style.cursor      = ready ? 'pointer' : 'not-allowed';
            createBtn.style.background  = ready ? '#dc2626' : 'rgba(220,38,38,0.4)';
        }

        // ── Undo button state ────────────────────────────────────────────────
        if (undoBtn) {
            const hasPoints = n > 0;
            undoBtn.disabled      = !hasPoints;
            undoBtn.style.opacity = hasPoints ? '1' : '0.32';
            undoBtn.style.cursor  = hasPoints ? 'pointer' : 'not-allowed';
        }
    }

    private _removeHUD(): void {
        if (this._hud) {
            this._hud.remove();
            this._hud = null;
        }
        // Also clean up by ID in case of duplicate
        document.getElementById(HUD_ID)?.remove();
    }

    // ─── Drawing ──────────────────────────────────────────────────────────────

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        if (!this._cursorPt && this._points.length === 0) return;

        ctx.save();

        const screenPts = this._points.map(p => planCanvas.worldToScreen(p.worldX, p.worldZ));
        const curSc     = this._cursorPt
            ? planCanvas.worldToScreen(this._cursorPt.worldX, this._cursorPt.worldZ)
            : null;

        if (this._mode === '2point') {
            this._draw2PointPreview(ctx, screenPts, curSc, cssW, cssH);
        } else {
            this._drawPolylinePreview(ctx, screenPts, curSc, cssW, cssH);
        }

        ctx.restore();
    }

    // ── 2-Point rectangle preview ─────────────────────────────────────────────

    private _draw2PointPreview(
        ctx: CanvasRenderingContext2D,
        screenPts: { sx: number; sy: number }[],
        curSc: { sx: number; sy: number } | null,
        cssW: number,
        cssH: number,
    ): void {
        if (curSc) this._drawCrosshair(ctx, curSc.sx, curSc.sy, screenPts.length >= 1);

        if (screenPts.length === 0) {
            if (!this._hostSlabId) this._drawNoSlabWarning(ctx, cssW, cssH);
            return;
        }

        // First corner placed — live rubber-band rectangle
        if (screenPts.length >= 1 && curSc) {
            const a  = screenPts[0];
            const b  = curSc;
            const rx = Math.min(a.sx, b.sx);
            const ry = Math.min(a.sy, b.sy);
            const rw = Math.abs(b.sx - a.sx);
            const rh = Math.abs(b.sy - a.sy);

            ctx.globalAlpha = 0.14;
            ctx.fillStyle   = OPEN_FILL_COLOR;
            ctx.fillRect(rx, ry, rw, rh);
            ctx.globalAlpha = 1;

            ctx.setLineDash([6, 3]);
            ctx.lineWidth   = 1.5;
            ctx.strokeStyle = OPEN_EDGE_COLOR;
            ctx.strokeRect(rx, ry, rw, rh);
            ctx.setLineDash([]);

            ctx.fillStyle = OPEN_EDGE_COLOR;
            ctx.beginPath();
            ctx.arc(a.sx, a.sy, 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Polyline preview ──────────────────────────────────────────────────────

    private _drawPolylinePreview(
        ctx: CanvasRenderingContext2D,
        screenPts: { sx: number; sy: number }[],
        curSc: { sx: number; sy: number } | null,
        cssW: number,
        cssH: number,
    ): void {
        // ── 1. Translucent polygon fill (3+ points) ───────────────────────────
        if (screenPts.length >= 3) {
            ctx.globalAlpha = 0.14;
            ctx.fillStyle   = OPEN_FILL_COLOR;
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            if (curSc) ctx.lineTo(curSc.sx, curSc.sy);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        // ── 2. Polygon edges (placed points) ──────────────────────────────────
        if (screenPts.length >= 2) {
            ctx.setLineDash([6, 3]);
            ctx.lineWidth   = 1.5;
            ctx.strokeStyle = OPEN_EDGE_COLOR;
            ctx.beginPath();
            ctx.moveTo(screenPts[0].sx, screenPts[0].sy);
            for (let i = 1; i < screenPts.length; i++) ctx.lineTo(screenPts[i].sx, screenPts[i].sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── 3. Rubber-band: last point → cursor ───────────────────────────────
        if (curSc && screenPts.length >= 1) {
            const last = screenPts[screenPts.length - 1];
            ctx.setLineDash([5, 4]);
            ctx.lineWidth   = 1.5;
            ctx.strokeStyle = OPEN_EDGE_COLOR;
            ctx.beginPath();
            ctx.moveTo(last.sx, last.sy);
            ctx.lineTo(curSc.sx, curSc.sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── 4. Closing-edge ghost (cursor → first point, ≥3 pts) ─────────────
        if (curSc && screenPts.length >= 3) {
            ctx.setLineDash([3, 3]);
            ctx.lineWidth   = 1;
            ctx.strokeStyle = OPEN_CLOSE_COLOR;
            ctx.beginPath();
            ctx.moveTo(curSc.sx, curSc.sy);
            ctx.lineTo(screenPts[0].sx, screenPts[0].sy);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // ── 5. Placed-point dots ──────────────────────────────────────────────
        ctx.fillStyle = OPEN_EDGE_COLOR;
        for (const p of screenPts) {
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // ── 6. Cursor crosshair ───────────────────────────────────────────────
        if (curSc) this._drawCrosshair(ctx, curSc.sx, curSc.sy, screenPts.length >= 2);

        // ── 7. Canvas hint text (bottom-left) ────────────────────────────────
        if (!this._hostSlabId && screenPts.length === 0) {
            this._drawNoSlabWarning(ctx, cssW, cssH);
            return;
        }

        const need = 3 - screenPts.length;
        const hint = screenPts.length === 0
            ? 'Click to start opening polygon'
            : need > 0
                ? `${need} more point${need !== 1 ? 's' : ''} needed`
                : 'Dbl-click or Enter to close  ·  Backspace to undo';

        this._drawHint(ctx, cssH, hint);
    }

    // ── Crosshair cursor ──────────────────────────────────────────────────────

    private _drawCrosshair(
        ctx: CanvasRenderingContext2D,
        sx: number, sy: number,
        filledDot: boolean,
    ): void {
        ctx.strokeStyle = OPEN_CROSSHAIR_COLOR;
        ctx.lineWidth   = 1.5;

        ctx.globalAlpha = 0.7;
        ctx.beginPath();
        ctx.arc(sx, sy, CROSSHAIR_RADIUS, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.moveTo(sx - CROSSHAIR_TICK, sy);       ctx.lineTo(sx - CROSSHAIR_RADIUS - 1, sy);
        ctx.moveTo(sx + CROSSHAIR_RADIUS + 1, sy); ctx.lineTo(sx + CROSSHAIR_TICK, sy);
        ctx.moveTo(sx, sy - CROSSHAIR_TICK);       ctx.lineTo(sx, sy - CROSSHAIR_RADIUS - 1);
        ctx.moveTo(sx, sy + CROSSHAIR_RADIUS + 1); ctx.lineTo(sx, sy + CROSSHAIR_TICK);
        ctx.stroke();

        if (filledDot) {
            ctx.fillStyle = OPEN_EDGE_COLOR;
            ctx.beginPath();
            ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Hint text with white backing (bottom-left, matching slab handler) ─────

    private _drawHint(ctx: CanvasRenderingContext2D, cssH: number, text: string): void {
        ctx.font         = 'bold 11px system-ui, sans-serif';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';

        const metrics = ctx.measureText(text);
        const padX = 6, padY = 4;
        const tx = 12, ty = cssH - 12;

        ctx.globalAlpha = 0.7;
        ctx.fillStyle   = '#ffffff';
        ctx.fillRect(
            tx - padX,
            ty - metrics.actualBoundingBoxAscent - padY,
            metrics.width + padX * 2,
            metrics.actualBoundingBoxAscent + padY * 2,
        );
        ctx.globalAlpha = 1;

        ctx.fillStyle = 'rgba(153,27,27,0.95)';
        ctx.fillText(text, tx, ty);
    }

    // ── "No slab selected" centred warning ────────────────────────────────────

    private _drawNoSlabWarning(
        ctx: CanvasRenderingContext2D,
        cssW: number, cssH: number,
    ): void {
        const text = 'Select a slab first, then activate Opening tool';
        ctx.font         = 'bold 12px system-ui, sans-serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        const metrics = ctx.measureText(text);
        const padX = 10, padY = 6;
        const tx   = cssW / 2;
        const ty   = cssH / 2;
        const boxH = (metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent) + padY * 2;

        ctx.globalAlpha = 0.85;
        ctx.fillStyle   = '#fff1f2';
        ctx.fillRect(tx - metrics.width / 2 - padX, ty - boxH / 2, metrics.width + padX * 2, boxH);
        ctx.globalAlpha = 1;

        ctx.fillStyle = 'rgba(185,28,28,0.95)';
        ctx.fillText(text, tx, ty);
    }

    // ── Overlay clear ─────────────────────────────────────────────────────────

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}
