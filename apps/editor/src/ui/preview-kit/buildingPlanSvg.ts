// §BUILDING-PREVIEW-MODULAR — the SHARED, building-type-AGNOSTIC plan-preview renderer.
// Consumes a `BuildingPlanDescriptor` and returns an SVG STRING. One renderer for every
// typology (house / residential / commercial / transport / …): a new typology supplies a
// descriptor (footprint polygon + cells + legend + palette), never a new renderer.
//
// Ported from the residential preview's polished bits (graded line weights, a real core
// lift+stair glyph, per-cell door ticks, a continuous corridor fill, a wrapping colour
// legend, a north arrow + scale bar) AND fixed to draw the REAL footprint POLYGON (the
// drawn L / clip polygon) as the heavy shell boundary — not a bounding-box rectangle.
//
// PURE: no DOM, no THREE — geometry in plan-XZ metres ({ x, z }), z→y on draw.

import type {
    BuildingPlanDescriptor, PlanCell, PlanCorridor, PlanCore, PlanEdge,
    PlanLegendEntry, PlanPt, PlanRect,
} from './buildingPlanDescriptor.js';

// ── PRYZM brand palette (white + purple #6600FF, NO black) ──────────────────────────────
const PLATE_FILL = '#ffffff';
const SHELL_STROKE = '#2a1a52';     // deep indigo — the heavy exterior shell
const PARTY_STROKE = '#5b4a86';     // medium — party walls between cells
const PARTITION_STROKE = '#9b8cc4'; // thin — interior partition / cell edges
const CORE_FILL = '#6600ff';
const CORE_STROKE = '#4a00bf';
const CORRIDOR_FILL = '#f2eeff';
const DOOR_STROKE = '#6600ff';
const REJECT_HATCH = '#d9cef0';
const REJECT_STROKE = '#b9a8e0';
const INK = '#2a1a52';
const INK_SOFT = '#6b5f8c';

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const r2 = (v: number): string => (Math.round(v * 100) / 100).toString();

interface Bounds { x0: number; z0: number; x1: number; z1: number }

function accPt(b: Bounds, p: PlanPt): void {
    if (p.x < b.x0) b.x0 = p.x; if (p.z < b.z0) b.z0 = p.z;
    if (p.x > b.x1) b.x1 = p.x; if (p.z > b.z1) b.z1 = p.z;
}
function accRect(b: Bounds, r: PlanRect): void {
    accPt(b, { x: Math.min(r.x0, r.x1), z: Math.min(r.z0, r.z1) });
    accPt(b, { x: Math.max(r.x0, r.x1), z: Math.max(r.z0, r.z1) });
}

export interface BuildingPlanSvgResult {
    /** The SVG string ('' when there is no geometry to draw). */
    readonly svg: string;
    readonly levelLabel: string;
    /** Count of NON-muted (placed) cells. */
    readonly placed: number;
    /** Count of muted (rejected / no-fit) cells. */
    readonly muted: number;
}

/**
 * Render a `BuildingPlanDescriptor` to an SVG string. `targetPx` is the plate's longest-
 * side draw size; the SVG reserves a footer strip below for the scale bar + legend.
 */
export function buildBuildingPlanSvg(
    d: BuildingPlanDescriptor,
    opts: { targetPx?: number } = {},
): BuildingPlanSvgResult {
    const target = opts.targetPx ?? 300;
    // Plate bounds over the footprint + everything drawn (so a cell poking past the
    // footprint bbox — shouldn't happen, but defensive — is still framed).
    const b: Bounds = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
    if (d.footprint.length >= 3) for (const p of d.footprint) accPt(b, p);
    if (d.core) accRect(b, d.core.rect);
    for (const c of d.corridors) accRect(b, c.rect);
    for (const c of d.cells) accRect(b, c.rect);
    if (!Number.isFinite(b.x0) || b.x1 - b.x0 < 1e-3 || b.z1 - b.z0 < 1e-3) {
        return { svg: '', levelLabel: d.levelLabel, placed: 0, muted: 0 };
    }

    const w = b.x1 - b.x0, dep = b.z1 - b.z0;
    const PAD = 0.9;
    const scale = target / Math.max(w, dep);
    const W = (w + 2 * PAD) * scale;
    const drawH = (dep + 2 * PAD) * scale;
    const X = (x: number): number => ((x - b.x0) + PAD) * scale;
    const Y = (z: number): number => ((z - b.z0) + PAD) * scale;

    const legend = buildLegend(d.legend, W, drawH);
    const FOOTER = 16 + legend.height;
    const H = drawH + FOOTER;

    const polyPts = (poly: readonly PlanPt[]): string =>
        poly.map(p => `${r2(X(p.x))},${r2(Y(p.z))}`).join(' ');
    const rectEl = (r: PlanRect, fill: string, stroke: string, sw: number, extra = ''): string => {
        const x0 = Math.min(r.x0, r.x1), z0 = Math.min(r.z0, r.z1);
        return `<rect x="${r2(X(x0))}" y="${r2(Y(z0))}" width="${r2(Math.abs(r.x1 - r.x0) * scale)}" ` +
            `height="${r2(Math.abs(r.z1 - r.z0) * scale)}" fill="${fill}" stroke="${stroke}" ` +
            `stroke-width="${sw}" stroke-linejoin="miter"${extra ? ' ' + extra : ''}/>`;
    };
    /** Draw a cell as its real polygon when present, else its rect. */
    const cellShape = (c: PlanCell | PlanCorridor, fill: string, stroke: string, sw: number, extra = ''): string =>
        c.polygon && c.polygon.length >= 3
            ? `<polygon points="${polyPts(c.polygon)}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="miter"${extra ? ' ' + extra : ''}/>`
            : rectEl(c.rect, fill, stroke, sw, extra);

    const parts: string[] = [];

    // defs: a light diagonal hatch for muted (rejected) cells (brand-tinted, not red).
    parts.push(
        `<defs><pattern id="bpReject" width="7" height="7" patternUnits="userSpaceOnUse" ` +
        `patternTransform="rotate(45)"><rect width="7" height="7" fill="#faf8ff"/>` +
        `<line x1="0" y1="0" x2="0" y2="7" stroke="${REJECT_HATCH}" stroke-width="1.4"/></pattern></defs>`,
    );

    // ── plate fill = the REAL footprint polygon (the L / clip polygon), no stroke yet ──
    // §BUILDING-PREVIEW-MODULAR L-SHAPE FIX — draw the actual footprint, not a bbox rect.
    parts.push(`<polygon points="${polyPts(d.footprint)}" fill="${PLATE_FILL}" stroke="none"/>`);

    // ── circulation bands (under the cells), continuous fill (no internal seams) ──────────
    for (const c of d.corridors) parts.push(cellShape(c, CORRIDOR_FILL, 'none', 0));

    // ── cells: fill + thin partition stroke; muted cells hatch ────────────────────────────
    // §BUILDING-PREVIEW-QUALITY — when a cell carries internal `subRooms` we draw each room
    // (tinted by roomType) so the unit reads like a real little plan (house-grade detail), then a
    // thin partition stroke between rooms; otherwise the cell renders as one flat tinted box.
    let placed = 0, muted = 0;
    const doorTicks: string[] = [];
    for (const c of d.cells) {
        if (c.muted) {
            muted++;
            parts.push(cellShape(c, 'url(#bpReject)', REJECT_STROKE, 1, 'stroke-dasharray="3 2"'));
        } else {
            placed++;
            const fill = d.palette.fills[c.fillKey] ?? d.palette.defaultFill;
            const rooms = c.subRooms ?? [];
            if (rooms.length > 0 && d.roomPalette) {
                // Base unit fill first (so any gaps between room polygons read as the unit tint), then
                // each room polygon tinted by its type + a thin partition stroke (house-grade detail).
                parts.push(cellShape(c, fill, 'none', 0));
                for (const rm of rooms) {
                    if (rm.polygon.length < 3) continue;
                    const rf = d.roomPalette.fills[rm.roomType] ?? d.roomPalette.defaultFill;
                    parts.push(`<polygon points="${polyPts(rm.polygon)}" fill="${rf}" stroke="${PARTITION_STROKE}" stroke-width="0.8" stroke-linejoin="miter"/>`);
                }
            } else {
                parts.push(cellShape(c, fill, PARTITION_STROKE, 1));
            }
        }
        parts.push(...cellLabels(c, X, Y, scale));
        if (!c.muted && c.doorEdge) {
            const tick = doorTickSvg(c.doorEdge, c.rect, X, Y, scale);
            if (tick) doorTicks.push(tick);
        }
    }

    // ── party-wall emphasis between adjacent placed cells (graded weight) ─────────────────
    for (const c of d.cells) {
        if (c.muted) continue;
        parts.push(cellShape(c, 'none', PARTY_STROKE, 1.4));
    }
    for (const t of doorTicks) parts.push(t);

    // ── the core symbol (lift + stair) ────────────────────────────────────────────────────
    if (d.core) parts.push(coreSymbolSvg(d.core, X, Y));

    // ── the SHELL outline LAST — the heaviest line, tracing the REAL footprint polygon ────
    parts.push(`<polygon points="${polyPts(d.footprint)}" fill="none" stroke="${SHELL_STROKE}" stroke-width="2.4" stroke-linejoin="miter"/>`);

    if (d.northArrow !== false) parts.push(northArrowSvg(W));
    if (d.scaleBar !== false) parts.push(scaleBarSvg(scale, drawH + 9, W));
    parts.push(legend.svg);

    const svg =
        `<svg viewBox="0 0 ${r2(W)} ${r2(H)}" preserveAspectRatio="xMidYMid meet" ` +
        `width="100%" role="img" aria-label="Floor plan: ${placed} unit(s)" ` +
        `style="display:block">${parts.join('')}</svg>`;
    return { svg, levelLabel: d.levelLabel, placed, muted };
}

function cellLabels(
    c: PlanCell, X: (x: number) => number, Y: (z: number) => number, scale: number,
): string[] {
    const r = c.rect;
    const cw = Math.abs(r.x1 - r.x0) * scale, ch = Math.abs(r.z1 - r.z0) * scale;
    if (!(cw > 26 && ch > 20)) return [];
    const cx = (X(Math.min(r.x0, r.x1)) + X(Math.max(r.x0, r.x1))) / 2;
    const cy = (Y(Math.min(r.z0, r.z1)) + Y(Math.max(r.z0, r.z1))) / 2;
    const out: string[] = [];
    if (c.muted) {
        const fs = Math.max(8, Math.min(12, Math.min(cw, ch) / 3.2));
        if (c.label) out.push(textEl(cx, cy - fs * 0.3, fs * 0.92, INK_SOFT, 600, c.label));
        if (ch > 30 && c.mutedNote) out.push(textEl(cx, cy + fs * 0.72, fs * 0.62, INK_SOFT, 500, c.mutedNote));
        return out;
    }
    const fs = Math.max(8, Math.min(12, Math.min(cw, ch) / 3.2));
    if (c.label) out.push(textEl(cx, cy - fs * 0.32, fs, INK, 700, c.label));
    if (ch > 30 && c.subLabel) out.push(textEl(cx, cy + fs * 0.78, fs * 0.72, INK_SOFT, 500, c.subLabel));
    return out;
}

function textEl(x: number, y: number, fs: number, fill: string, weight: number, text: string): string {
    return `<text x="${r2(x)}" y="${r2(y)}" font-size="${r2(fs)}" font-family="system-ui,sans-serif" ` +
        `font-weight="${weight}" fill="${fill}" text-anchor="middle" dominant-baseline="central">${esc(text)}</text>`;
}

/** A short entrance-door tick on the cell edge facing circulation. */
function doorTickSvg(
    edge: PlanEdge, r: PlanRect,
    X: (x: number) => number, Y: (z: number) => number, scale: number,
): string {
    const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1);
    const z0 = Math.min(r.z0, r.z1), z1 = Math.max(r.z0, r.z1);
    const cxw = (X(x0) + X(x1)) / 2, cyw = (Y(z0) + Y(z1)) / 2;
    const len = Math.min(10, Math.max(5, ((x1 - x0) + (z1 - z0)) * scale * 0.08));
    let x = cxw, y = cyw;
    if (edge === 'z0') y = Y(z0); else if (edge === 'z1') y = Y(z1);
    else if (edge === 'x0') x = X(x0); else x = X(x1);
    const horiz = edge === 'z0' || edge === 'z1';
    const half = len / 2;
    const x2 = horiz ? x + half : x, x1p = horiz ? x - half : x;
    const y2 = horiz ? y : y + half, y1p = horiz ? y : y - half;
    return `<line x1="${r2(x1p)}" y1="${r2(y1p)}" x2="${r2(x2)}" y2="${r2(y2)}" ` +
        `stroke="${DOOR_STROKE}" stroke-width="2" stroke-linecap="round"/>`;
}

/** The central core as a lift + stair glyph. */
function coreSymbolSvg(core: PlanCore, X: (x: number) => number, Y: (z: number) => number): string {
    const r = core.rect;
    const cx0 = X(Math.min(r.x0, r.x1)), cy0 = Y(Math.min(r.z0, r.z1));
    const cx1 = X(Math.max(r.x0, r.x1)), cy1 = Y(Math.max(r.z0, r.z1));
    const cw = cx1 - cx0, ch = cy1 - cy0;
    const out: string[] = [];
    out.push(`<rect x="${r2(cx0)}" y="${r2(cy0)}" width="${r2(cw)}" height="${r2(ch)}" fill="${CORE_FILL}" stroke="${CORE_STROKE}" stroke-width="1.6"/>`);
    const horiz = cw >= ch;
    const midX = horiz ? cx0 + cw / 2 : cx1;
    const midY = horiz ? cy1 : cy0 + ch / 2;
    out.push(`<line x1="${r2(horiz ? midX : cx0)}" y1="${r2(horiz ? cy0 : midY)}" x2="${r2(horiz ? midX : cx1)}" y2="${r2(horiz ? cy1 : midY)}" stroke="#ffffff" stroke-width="1" stroke-opacity="0.6"/>`);
    const lx0 = cx0, ly0 = cy0, lx1 = horiz ? midX : cx1, ly1 = horiz ? cy1 : midY;
    const inset = Math.min(lx1 - lx0, ly1 - ly0) * 0.22;
    if (inset > 1.5) {
        out.push(
            `<line x1="${r2(lx0 + inset)}" y1="${r2(ly0 + inset)}" x2="${r2(lx1 - inset)}" y2="${r2(ly1 - inset)}" stroke="#ffffff" stroke-width="1.1" stroke-opacity="0.85"/>`,
            `<line x1="${r2(lx1 - inset)}" y1="${r2(ly0 + inset)}" x2="${r2(lx0 + inset)}" y2="${r2(ly1 - inset)}" stroke="#ffffff" stroke-width="1.1" stroke-opacity="0.85"/>`,
        );
    }
    const sx0 = horiz ? midX : cx0, sy0 = horiz ? cy0 : midY, sx1 = cx1, sy1 = cy1;
    const treads = 4;
    for (let i = 1; i < treads; i++) {
        const t = i / treads;
        if (horiz) {
            const yy = sy0 + (sy1 - sy0) * t;
            out.push(`<line x1="${r2(sx0 + 2)}" y1="${r2(yy)}" x2="${r2(sx1 - 2)}" y2="${r2(yy)}" stroke="#ffffff" stroke-width="0.8" stroke-opacity="0.7"/>`);
        } else {
            const xx = sx0 + (sx1 - sx0) * t;
            out.push(`<line x1="${r2(xx)}" y1="${r2(sy0 + 2)}" x2="${r2(xx)}" y2="${r2(sy1 - 2)}" stroke="#ffffff" stroke-width="0.8" stroke-opacity="0.7"/>`);
        }
    }
    if (cw > 26 && ch > 16) {
        out.push(`<text x="${r2(cx0 + cw / 2)}" y="${r2(cy0 + ch / 2)}" font-size="9" font-family="system-ui,sans-serif" font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">${esc(core.label ?? 'CORE')}</text>`);
    }
    return out.join('');
}

function northArrowSvg(W: number): string {
    const cx = W - 16, top = 8, bot = 26;
    return `<g><polygon points="${cx},${top} ${cx - 5},${bot} ${cx},${bot - 5} ${cx + 5},${bot}" fill="${SHELL_STROKE}"/>` +
        `<text x="${cx}" y="${bot + 8}" font-size="8" font-family="system-ui,sans-serif" font-weight="700" fill="${INK_SOFT}" text-anchor="middle">N</text></g>`;
}

function scaleBarSvg(scale: number, y: number, W: number): string {
    const candidates = [1, 2, 5, 10, 20, 50];
    let metres = 5;
    for (const c of candidates) { if (c * scale <= Math.min(72, W * 0.32)) metres = c; }
    const px = metres * scale, x = 6;
    return `<g><line x1="${r2(x)}" y1="${r2(y)}" x2="${r2(x + px)}" y2="${r2(y)}" stroke="${INK}" stroke-width="1.4"/>` +
        `<line x1="${r2(x)}" y1="${r2(y - 3)}" x2="${r2(x)}" y2="${r2(y + 3)}" stroke="${INK}" stroke-width="1.4"/>` +
        `<line x1="${r2(x + px)}" y1="${r2(y - 3)}" x2="${r2(x + px)}" y2="${r2(y + 3)}" stroke="${INK}" stroke-width="1.4"/>` +
        `<text x="${r2(x + px + 5)}" y="${r2(y + 3)}" font-size="8.5" font-family="system-ui,sans-serif" fill="${INK_SOFT}">${metres} m</text></g>`;
}

/** A compact wrapping colour-key legend. Flows L→R and wraps within `W`; returns the
 *  markup + total height consumed (so the footer/viewBox can size to it). */
function buildLegend(
    entries: readonly PlanLegendEntry[], W: number, drawH: number,
): { svg: string; height: number } {
    if (entries.length === 0) return { svg: '', height: 0 };
    const swatch = 8, gap = 4, itemGap = 11, rowH = 12, charW = 4.7, left = 6;
    const maxX = Math.max(left + 40, W - 4);
    const parts: string[] = [];
    let rowX = left, row = 0;
    const top = drawH + 18;
    for (const it of entries) {
        const itemW = swatch + gap + it.label.length * charW + itemGap;
        if (rowX > left && rowX + itemW > maxX) { row++; rowX = left; }
        const yy = top + row * rowH;
        parts.push(
            `<rect x="${r2(rowX)}" y="${r2(yy)}" width="${swatch}" height="${swatch}" rx="1.5" fill="${it.fill}" stroke="${it.stroke}" stroke-width="1"/>` +
            `<text x="${r2(rowX + swatch + gap)}" y="${r2(yy + swatch - 0.5)}" font-size="8" font-family="system-ui,sans-serif" fill="${INK_SOFT}">${esc(it.label)}</text>`,
        );
        rowX += itemW;
    }
    return { svg: `<g>${parts.join('')}</g>`, height: (row + 1) * rowH + 4 };
}
