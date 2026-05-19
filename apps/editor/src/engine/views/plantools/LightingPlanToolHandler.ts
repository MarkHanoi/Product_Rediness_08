/**
 * LightingPlanToolHandler — Plan-view click-to-place tool for lighting fixtures.
 *
 * Mirrors FurniturePlanToolHandler. Reads the active fixture type from
 *   window._pryzmActiveLightingType
 * Falls back to 'downlight' if not set.
 *
 * Y is auto-resolved: floor-mounted fixtures sit on level elevation,
 * ceiling-mounted ones on (elevation + level.height).
 *
 * Dispatches CreateLightingCommand so placement is undoable and unified
 * with all other lighting writes.
 */

import { LightingFixtureType, FLOOR_MOUNTED_FIXTURES } from '@pryzm/core-app-model';
import type { PlanToolHandler, PlanToolDrawContext, WorldPoint } from './PlanToolHandler';

const STROKE = '#0ea5e9';   // sky-500 — distinct from furniture violet & column cyan
const FILL   = 'rgba(14,165,233,0.12)';

function _activeType(): LightingFixtureType {
    return (window._pryzmActiveLightingType ?? 'downlight') as LightingFixtureType;
}

function _label(t: string): string { return t.replace(/_/g, ' '); }

function _resolveY(levelId: string, type: LightingFixtureType): number {
    try {
        const bm = window.projectContext?.bimManager;
        const level = bm?.getLevelById?.(levelId);
        if (level) {
            const elev = typeof level.elevation === 'number' ? level.elevation : 0;
            const ht   = typeof level.height    === 'number' ? level.height    : 3.0;
            return FLOOR_MOUNTED_FIXTURES.has(type) ? elev : (elev + ht);
        }
    } catch { /* ignore */ }
    return FLOOR_MOUNTED_FIXTURES.has(type) ? 0.0 : 3.0;
}

export class LightingPlanToolHandler implements PlanToolHandler {
    private _ctx: PlanToolDrawContext | null = null;
    private _cursor: WorldPoint | null = null;

    activate(ctx: PlanToolDrawContext): void {
        this._ctx = ctx;
        this._cursor = null;
        console.log('[LightingPlanToolHandler] Activated, type:', _activeType());
    }

    deactivate(): void {
        this._cursor = null;
        this._clearOverlay();
        this._ctx = null;
    }

    onMouseMove(pt: WorldPoint): void {
        this._cursor = pt;
        this._drawPreview();
    }

    onClick(pt: WorldPoint): void {
        this._commit(pt);
    }

    onKeyDown(e: KeyboardEvent): boolean {
        if (e.key === 'Escape') { this.cancel(); return true; }
        return false;
    }

    cancel(): void {
        this._cursor = null;
        this._clearOverlay();
    }

    redraw(): void {
        if (this._cursor) this._drawPreview();
    }

    private _commit(pt: WorldPoint): void {
        const c = this._ctx;
        if (!c) return;

        const levelId = c.viewDef.spatial?.levelId;
        if (!levelId) {
            console.error('[LightingPlanToolHandler] ViewDefinition.spatial.levelId is missing');
            return;
        }

        const type = _activeType();
        const y    = _resolveY(levelId, type);
        // [P6 E.5.4] §01-BIM-ENGINE-CORE-CONTRACT §1 — bus-primary
        window.runtime?.bus?.executeCommand('lighting.create', {
            fixtureType: type,
            position: { x: pt.worldX, y, z: pt.worldZ },
            levelId,
        })?.catch((e: Error) => console.error('[LightingPlanToolHandler] lighting.create failed:', e));
        console.log('[LightingPlanToolHandler] Lighting created', type, 'at', pt);

        this._clearOverlay();
    }

    private _drawPreview(): void {
        const c = this._ctx;
        if (!c || !this._cursor) return;
        const { ctx, overlayCanvas, planCanvas, dpr } = c;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cssW = overlayCanvas.width  / dpr;
        const cssH = overlayCanvas.height / dpr;
        ctx.clearRect(0, 0, cssW, cssH);

        ctx.save();

        const type = _activeType();
        const ppu  = planCanvas.getPixelsPerUnit();
        const { sx, sy } = planCanvas.worldToScreen(this._cursor.worldX, this._cursor.worldZ);

        // Draw the same symbol the placed fixture will render in plan view
        drawLightingSymbol(ctx, sx, sy, ppu, type, { stroke: STROKE, fill: FILL });

        // Crosshair
        ctx.strokeStyle = STROKE;
        ctx.lineWidth   = 0.75;
        ctx.beginPath();
        ctx.moveTo(sx - 12, sy); ctx.lineTo(sx + 12, sy);
        ctx.moveTo(sx, sy - 12); ctx.lineTo(sx, sy + 12);
        ctx.stroke();

        // Label
        const labelText = _label(type);
        ctx.font = 'bold 10px sans-serif';
        const tw = ctx.measureText(labelText).width;
        const ly = sy + 24;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fillRect(sx - tw / 2 - 4, ly - 8, tw + 8, 15);
        ctx.fillStyle    = '#0c4a6e';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, sx, ly);

        ctx.font         = '11px sans-serif';
        ctx.fillStyle    = 'rgba(12,74,110,0.85)';
        ctx.textAlign    = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('Click to place · Esc to cancel', 12, cssH - 12);

        ctx.restore();
    }

    private _clearOverlay(): void {
        const c = this._ctx;
        if (!c) return;
        c.ctx.setTransform(1, 0, 0, 1, 0, 0);
        c.ctx.clearRect(0, 0, c.overlayCanvas.width, c.overlayCanvas.height);
    }
}

// ── Symbol drawer (shared with LightingPlanSymbolRenderer) ──────────────────

interface SymbolStyle { stroke: string; fill: string; }

export function drawLightingSymbol(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    pixelsPerMetre: number,
    type: LightingFixtureType,
    style: SymbolStyle,
): void {
    const r = (m: number) => Math.max(2, m * pixelsPerMetre);
    ctx.save();
    ctx.strokeStyle = style.stroke;
    ctx.fillStyle   = style.fill;
    ctx.lineWidth   = 1.25;

    switch (type) {
        case 'downlight': {
            const rad = r(0.065);
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy);
            ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad);
            ctx.stroke();
            break;
        }
        case 'pendant': {
            const rad = r(0.05);
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fillStyle = style.stroke; ctx.fill();
            break;
        }
        case 'linear_led': {
            const w = r(0.06), l = r(1.20);
            ctx.beginPath(); ctx.rect(cx - w / 2, cy - l / 2, w, l); ctx.fill(); ctx.stroke();
            break;
        }
        case 'pendant_pebble': {
            const rad = r(0.18);
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            break;
        }
        case 'pendant_ceramic_bell': {
            const rad = r(0.11);
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fillStyle = style.stroke; ctx.fill();
            break;
        }
        case 'pendant_conical': {
            const rad = r(0.22);
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([2, 2]);
            ctx.beginPath(); ctx.arc(cx, cy, rad * 0.45, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            break;
        }
        case 'floor_wood_post': {
            const rad = r(0.22);
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = style.stroke; ctx.font = `${Math.max(8, rad)}px sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('W', cx, cy);
            break;
        }
        case 'floor_arc_brass': {
            const rad = r(0.22);
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, rad * 1.6, -Math.PI * 0.6, -Math.PI * 0.1); ctx.stroke();
            break;
        }
        case 'table_terracotta': {
            const rad = r(0.08);
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            break;
        }
        case 'floor_tripod_black': {
            const rad = r(0.25);
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath();
            for (let i = 0; i < 3; i++) {
                const a = -Math.PI / 2 + i * (Math.PI * 2 / 3);
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
            }
            ctx.stroke();
            break;
        }
        default: {
            const rad = r(0.10);
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
        }
    }

    ctx.restore();
}
