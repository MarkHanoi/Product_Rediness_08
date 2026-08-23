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

/**
 * The symbol's half-extents in SCREEN pixels, about its plan anchor.
 *
 * `rect` distinguishes the one family drawn as a bar (`linear_led`) from the
 * families drawn as a disc — the hit test mirrors the drawn shape rather than
 * approximating every family with one circle.
 */
export interface LightingSymbolExtentPx {
    readonly hx: number;
    readonly hy: number;
    readonly rect: boolean;
}

/**
 * ⭐ §FIX-LIGHT-PLAN-UNSELECTABLE (L-10081) — THE ONE ANSWER to *"how big is this
 * fixture's plan symbol?"*, read by BOTH the drawer and the hit test.
 *
 * The founder could not select a lighting fixture in plan. The reason is structural,
 * not a tuning miss: EVERY other plan symbol that must be clickable (door swing,
 * sofa, bed, wardrobe, kitchen, tree, plumbing fixture, stair tread, column cap) is
 * produced by a plan-symbol BUILDER that INJECTS UUID-registered `THREE.LineSegments`
 * into the technical drawing — see `EdgeProjectorService`'s injection block, *"the
 * A-FURN layer (UUID-registered for selection)"*. `PlanViewCanvas.hitTest()` walks
 * exactly that: `drawing.three` for `LineSegments` carrying an element UUID, and
 * NOTHING else.
 *
 * Lighting is the one family whose plan symbol is painted straight onto the 2-D
 * canvas from the store by {@link renderLightingSymbols}. It contributes ZERO
 * LineSegments, so `hitTest()` could never return a fixture id — the symbol was
 * drawn and hit-testable by nothing. Its own `STROKE_SELECTED` branch below is the
 * tell: the renderer has always been able to PAINT a selected fixture, while nothing
 * in plan could ever SELECT one.
 *
 * Deriving the extents here — instead of writing a second radius table next to the
 * hit test — is what stops the painted symbol and its hit region drifting apart. A
 * new family added to the drawer's switch must be added here too, and `default`
 * covers the twenty LOD-200 families exactly as the drawer's `default` does.
 */
export function lightingSymbolExtentPx(
    type: LightingFixtureType,
    pixelsPerMetre: number,
): LightingSymbolExtentPx {
    const r = (m: number) => Math.max(2, m * pixelsPerMetre);
    const disc = (m: number): LightingSymbolExtentPx => ({ hx: r(m), hy: r(m), rect: false });
    switch (type) {
        case 'downlight':            return disc(0.065);
        case 'pendant':              return disc(0.05);
        // The bar: `rect(cx − w/2, cy − l/2, w, l)` in the drawer, unrotated in
        // screen space, so the hit region is that same axis-aligned rectangle.
        case 'linear_led':           return { hx: r(0.06) / 2, hy: r(1.20) / 2, rect: true };
        case 'pendant_pebble':       return disc(0.18);
        case 'pendant_ceramic_bell': return disc(0.11);
        case 'pendant_conical':      return disc(0.22);
        case 'floor_wood_post':      return disc(0.22);
        // The brass arc sweeps to 1.6 × the body radius; the body disc is what the
        // user aims at, so the hit region is the body, not the sweep.
        case 'floor_arc_brass':      return disc(0.22);
        case 'table_terracotta':     return disc(0.08);
        case 'floor_tripod_black':   return disc(0.25);
        default:                     return disc(0.10);
    }
}

function drawLightingSymbol(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    pixelsPerMetre: number,
    type: LightingFixtureType,
    style: SymbolStyle,
): void {
    // §FIX-LIGHT-PLAN-UNSELECTABLE (L-10081) — the drawn size comes from the SAME
    // table the hit region is derived from, so the mark and its hit region cannot
    // drift apart. `rad` is the disc radius for every family but `linear_led`, which
    // reads both half-extents.
    const e = lightingSymbolExtentPx(type, pixelsPerMetre);
    const rad = e.hx;
    ctx.save();
    ctx.strokeStyle = style.stroke;
    ctx.fillStyle   = style.fill;
    ctx.lineWidth   = 1.25;

    switch (type) {
        case 'downlight': {
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(cx - rad, cy); ctx.lineTo(cx + rad, cy);
            ctx.moveTo(cx, cy - rad); ctx.lineTo(cx, cy + rad);
            ctx.stroke();
            break;
        }
        case 'pendant': {
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, 1.5, 0, Math.PI * 2); ctx.fillStyle = style.stroke; ctx.fill();
            break;
        }
        case 'linear_led': {
            const w = e.hx * 2, l = e.hy * 2;
            ctx.beginPath(); ctx.rect(cx - w / 2, cy - l / 2, w, l); ctx.fill(); ctx.stroke();
            break;
        }
        case 'pendant_pebble': {
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            break;
        }
        case 'pendant_ceramic_bell': {
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, 2, 0, Math.PI * 2); ctx.fillStyle = style.stroke; ctx.fill();
            break;
        }
        case 'pendant_conical': {
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([2, 2]);
            ctx.beginPath(); ctx.arc(cx, cy, rad * 0.45, 0, Math.PI * 2); ctx.stroke();
            ctx.setLineDash([]);
            break;
        }
        case 'floor_wood_post': {
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.fillStyle = style.stroke; ctx.font = `${Math.max(8, rad)}px sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText('W', cx, cy);
            break;
        }
        case 'floor_arc_brass': {
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, cy, rad * 1.6, -Math.PI * 0.6, -Math.PI * 0.1); ctx.stroke();
            break;
        }
        case 'table_terracotta': {
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            break;
        }
        case 'floor_tripod_black': {
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
            ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2); ctx.stroke();
        }
    }

    ctx.restore();
}

/**
 * ⭐ §FIX-LIGHT-PLAN-UNSELECTABLE (L-10081) — the hit region for the symbol
 * {@link renderLightingSymbols} paints, read by `PlanViewCanvas.hitTest()`.
 *
 * Same store, same level filter, same `worldToScreen`, same per-family extents as the
 * drawer — so what the user aims at IS what is tested, by construction. `grabPx` is a
 * FLOOR, not an addition: a downlight is a 6.5 cm disc, which at 1:100 is ~1 screen
 * pixel, so a symbol smaller than the grab radius must still be reachable (the same
 * rule `hitTestGrid` / `hitTestLevel` already apply to their own thin marks).
 *
 * ⚠ CALL IT AS A FALLBACK, AFTER the linework hit test. Lighting fixtures sit on the
 * ceiling and their symbols overlay walls, furniture and room fills; a lighting
 * region that competed with projected linework would steal clicks from elements that
 * are already selectable today. Consulted only when nothing else was hit, this can
 * add a selection and can never take one away.
 *
 * @returns the nearest fixture id under the cursor, or `null`.
 */
export function hitTestLightingSymbol(
    sx: number,
    sy: number,
    pixelsPerMetre: number,
    worldToScreen: (worldX: number, worldZ: number) => { sx: number; sy: number },
    options: RenderLightingSymbolsOptions & { grabPx?: number } = {},
): string | null {
    const store = window.lightingStore; // TODO(TASK-08)
    if (!store?.getAll) return null;

    let fixtures: LightingData[] = [];
    try {
        fixtures = store.getAll() as LightingData[];
    } catch { return null; }
    if (!fixtures.length) return null;

    const { levelId = null, grabPx = 8 } = options;

    let bestId: string | null = null;
    let bestScore = Infinity;

    for (const f of fixtures) {
        if (levelId && f.levelId !== levelId) continue;
        const p = worldToScreen(f.position.x, f.position.z);
        const dx = sx - p.sx;
        const dy = sy - p.sy;

        const e = lightingSymbolExtentPx(f.fixtureType as LightingFixtureType, pixelsPerMetre);
        const hx = Math.max(e.hx, grabPx);
        const hy = Math.max(e.hy, grabPx);

        const inside = e.rect
            ? (Math.abs(dx) <= hx && Math.abs(dy) <= hy)
            : ((dx * dx) / (hx * hx) + (dy * dy) / (hy * hy)) <= 1;
        if (!inside) continue;

        // Nearest anchor wins when symbols overlap — deterministic, and it matches the
        // "closest mark to the cursor" rule the linework hit test uses.
        const score = dx * dx + dy * dy;
        if (score < bestScore) {
            bestScore = score;
            bestId = f.id;
        }
    }

    return bestId;
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
