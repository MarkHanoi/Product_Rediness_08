/**
 * LightingPlanSymbolRenderer — draws placed lighting fixtures on the 2D
 * plan view canvas. Mirrors the symbol drawer used by LightingPlanToolHandler
 * during placement so an in-flight preview and a committed fixture look
 * identical.
 *
 * Sprint M: extracted to @pryzm/core-app-model with drawLightingSymbol inlined
 * (was imported from LightingPlanToolHandler which depends on src/ commands).
 */

import type { LightingData, LightingFixtureType } from '../../lighting/LightingTypes.js';

const STROKE_DEFAULT   = '#0ea5e9';
const FILL_DEFAULT     = 'rgba(14,165,233,0.12)';
const STROKE_SELECTED  = '#7c3aed';
const FILL_SELECTED    = 'rgba(124,58,237,0.18)';

export interface RenderLightingSymbolsOptions {
    levelId?: string | null;
    selectedId?: string | null;
}

interface SymbolStyle { stroke: string; fill: string; }

function drawLightingSymbol(
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

export function renderLightingSymbols(
    ctx: CanvasRenderingContext2D,
    pixelsPerMetre: number,
    worldToScreen: (worldX: number, worldZ: number) => { sx: number; sy: number },
    options: RenderLightingSymbolsOptions = {},
): void {
    const store = window.lightingStore; // TODO(TASK-08)
    if (!store?.getAll) return;

    let fixtures: LightingData[] = [];
    try {
        fixtures = store.getAll() as LightingData[];
    } catch { return; }

    if (!fixtures.length) return;

    const { levelId = null, selectedId = null } = options;

    ctx.save();
    for (const f of fixtures) {
        if (levelId && f.levelId !== levelId) continue;
        const { sx, sy } = worldToScreen(f.position.x, f.position.z);
        const isSelected = !!selectedId && f.id === selectedId;
        drawLightingSymbol(
            ctx, sx, sy, pixelsPerMetre,
            f.fixtureType as LightingFixtureType,
            {
                stroke: isSelected ? STROKE_SELECTED : STROKE_DEFAULT,
                fill:   isSelected ? FILL_SELECTED   : FILL_DEFAULT,
            },
        );
    }
    ctx.restore();
}
