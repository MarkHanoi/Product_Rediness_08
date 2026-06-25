// Residential building (multi-family) — pure SVG floor-plan thumbnail for the
// onboarding LIVE PREVIEW (founder 2026-06-23: "the slider should redraw the actual
// plan, not just the count/mix"). Given the orchestrator's OK result it draws ONE
// representative upper floor top-down as a READABLE ARCHITECTURAL PLAN: a thick shell
// outline, the public-corridor band, the centred CORE (lift + stair symbol), and every
// apartment cell tinted by typology with its area, a colour LEGEND, a north arrow and a
// scale bar. Re-rendered on every slider drag.
//
// §RESI-PREVIEW-PRODUCTION (2026-06-24) — promoted from a flat coloured-cell grid (with a
// big red × for rejects) to a proper plan drawing: graded line weights (thick shell /
// medium party walls / thin partitions), per-typology tints + legend, a real core symbol,
// per-apartment door ticks, a north arrow + scale bar, and tasteful light-hatch rejects.
//
// PURE: no DOM, no THREE — returns an SVG STRING. All geometry is the engine's LOCAL
// (principal-axis) plan frame in metres ({ x, z }); a thumbnail needs no world rotation,
// so we draw LOCAL directly and just normalise z→y. Type-only ai-host import (erased).

import type { ResidentialBuildingOk, PlacedApartment } from '@pryzm/ai-host';

interface Rectish { x0: number; z0: number; x1: number; z1: number }
type Edge = 'x0' | 'x1' | 'z0' | 'z1';

// ── PRYZM brand palette (white + purple #6600FF, NO black) ──────────────────────────
// Typology fills graduate light→saturated by bedroom count, all in the purple family.
const TYPO_FILL: Record<string, string> = {
    T1: '#efeaff',
    T2: '#dcd0ff',
    T3: '#c3adff',
    T4: '#a883ff',
};
const TYPO_LABEL: Record<string, string> = {
    T1: 'Studio / 1-bed',
    T2: '2-bed',
    T3: '3-bed',
    T4: '4-bed',
};
const PLATE_FILL = '#ffffff';
const SHELL_STROKE = '#2a1a52';     // deep indigo (NOT black) — the heavy exterior shell
const PARTY_STROKE = '#5b4a86';     // medium — party walls between apartments
const PARTITION_STROKE = '#9b8cc4'; // thin — interior partition / cell edges
const CORE_FILL = '#6600ff';        // brand purple — the central core reads as the anchor
const CORE_STROKE = '#4a00bf';
const CORRIDOR_FILL = '#f2eeff';    // pale purple circulation band
const CORRIDOR_STROKE = '#cfc2f2';
const DOOR_STROKE = '#6600ff';      // apartment entrance ticks onto the corridor
const REJECT_HATCH = '#d9cef0';     // soft purple hatch for "no layout" cells (NOT alarming red)
const REJECT_STROKE = '#b9a8e0';
const INK = '#2a1a52';              // text ink (deep indigo)
const INK_SOFT = '#6b5f8c';

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Pick a representative UPPER floor (first upper level with apartments); fall back
 *  to any level that has apartments, else the last level. */
function pickLevelIndex(result: ResidentialBuildingOk): number {
    const per = result.perLevelApartments;
    let firstWithApts = -1;
    for (let i = 0; i < per.length; i++) {
        const p = per[i];
        if (!p) continue;
        if (p.apartments.length > 0) {
            if (p.role === 'upper') return i;
            if (firstWithApts < 0) firstWithApts = i;
        }
    }
    return firstWithApts >= 0 ? firstWithApts : Math.max(0, per.length - 1);
}

/**
 * Build a top-down floor-plan SVG (string) for one representative floor of the
 * residential building. Returns '' when there is no geometry to draw (the caller
 * shows a text hint instead). `targetPx` is the plate's longest-side draw size; the
 * SVG reserves extra room below for the legend/scale strip.
 */
export function buildResidentialPlanSvg(
    result: ResidentialBuildingOk,
    opts: { targetPx?: number } = {},
): { svg: string; levelLabel: string; placed: number; rejected: number } {
    const target = opts.targetPx ?? 300;
    const idx = pickLevelIndex(result);
    const per = result.perLevelApartments[idx];
    const core = result.core as Rectish;
    const corridors = (per?.publicCorridor ?? []) as readonly Rectish[];
    const cells = (per?.apartments ?? []) as readonly PlacedApartment[];

    // Plate bbox over everything we will draw (LOCAL metres).
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const acc = (r: Rectish): void => {
        if (r.x0 < x0) x0 = r.x0; if (r.z0 < z0) z0 = r.z0;
        if (r.x1 > x1) x1 = r.x1; if (r.z1 > z1) z1 = r.z1;
    };
    acc(core);
    for (const c of corridors) acc(c);
    for (const c of cells) acc(c.cell.rect as Rectish);
    if (!Number.isFinite(x0) || x1 - x0 < 1e-3 || z1 - z0 < 1e-3) {
        return { svg: '', levelLabel: '', placed: 0, rejected: 0 };
    }

    const w = x1 - x0, d = z1 - z0;
    const PAD = 0.9;                                   // metres of margin around the plate
    const scale = target / Math.max(w, d);
    const W = (w + 2 * PAD) * scale;
    const drawH = (d + 2 * PAD) * scale;
    // Footer strip: a scale bar row + a wrapping colour legend. Its height depends on how
    // many legend rows the present typologies wrap to at this width — measured below.
    const legend = buildLegend(cells, W, drawH);
    const FOOTER = 16 + legend.height;                 // scale-bar row + legend rows
    const H = drawH + FOOTER;
    const X = (x: number): number => ((x - x0) + PAD) * scale;
    const Y = (z: number): number => ((z - z0) + PAD) * scale;
    const n = (v: number): string => (Math.round(v * 100) / 100).toString();

    const rectEl = (
        r: Rectish, fill: string, stroke: string, sw: number, extra = '',
    ): string =>
        `<rect x="${n(X(r.x0))}" y="${n(Y(r.z0))}" width="${n((r.x1 - r.x0) * scale)}" ` +
        `height="${n((r.z1 - r.z0) * scale)}" fill="${fill}" stroke="${stroke}" ` +
        `stroke-width="${sw}" stroke-linejoin="miter"${extra ? ' ' + extra : ''}/>`;

    const parts: string[] = [];

    // ── defs: a light diagonal hatch for rejected cells (tasteful, brand-tinted) ──────
    parts.push(
        `<defs><pattern id="rbReject" width="7" height="7" patternUnits="userSpaceOnUse" ` +
        `patternTransform="rotate(45)">` +
        `<rect width="7" height="7" fill="#faf8ff"/>` +
        `<line x1="0" y1="0" x2="0" y2="7" stroke="${REJECT_HATCH}" stroke-width="1.4"/>` +
        `</pattern></defs>`,
    );

    // ── plate fill (no shell stroke yet — drawn last, on top, as the heaviest line) ──
    parts.push(rectEl({ x0, z0, x1, z1 }, PLATE_FILL, 'none', 0));

    // ── public-corridor band (drawn under the cells) ─────────────────────────────────
    // §RESI-PREVIEW-CORRIDOR-CONTINUOUS — the corridor is emitted as several abutting
    // segment rects (the cross arms + the core lobby). Stroking EACH segment drew the
    // shared internal edges as seams, so one continuous band read as "3 different
    // finishes". Draw the segments as FILL-ONLY (same fill) so they merge seamlessly;
    // the apartment cells (on top) + the shell outline (drawn last) provide the framing.
    for (const c of corridors) parts.push(rectEl(c, CORRIDOR_FILL, 'none', 0));

    // ── apartment cells: typology tint + medium party-wall stroke ────────────────────
    let placed = 0, rejected = 0;
    const doorTicks: string[] = [];
    for (const c of cells) {
        const r = c.cell.rect as Rectish;
        const ok = c.status === 'ok';
        if (ok) placed++; else rejected++;
        if (ok) {
            const fill = TYPO_FILL[c.typology] ?? TYPO_FILL.T2!;
            parts.push(rectEl(r, fill, PARTITION_STROKE, 1));
        } else {
            parts.push(rectEl(r, 'url(#rbReject)', REJECT_STROKE, 1, 'stroke-dasharray="3 2"'));
        }

        const cw = (r.x1 - r.x0) * scale, ch = (r.z1 - r.z0) * scale;
        const cx = (X(r.x0) + X(r.x1)) / 2, cy = (Y(r.z0) + Y(r.z1)) / 2;

        // Per-apartment label: typology + area (placed) / a calm reason (rejected).
        if (cw > 26 && ch > 20) {
            const fs = Math.max(8, Math.min(12, Math.min(cw, ch) / 3.2));
            if (ok) {
                parts.push(
                    `<text x="${n(cx)}" y="${n(cy - fs * 0.32)}" font-size="${n(fs)}" ` +
                    `font-family="system-ui,sans-serif" font-weight="700" fill="${INK}" ` +
                    `text-anchor="middle" dominant-baseline="central">${esc(c.typology)}</text>`,
                );
                if (ch > 30) {
                    const area = Math.round(c.targetAreaM2);
                    parts.push(
                        `<text x="${n(cx)}" y="${n(cy + fs * 0.78)}" font-size="${n(fs * 0.72)}" ` +
                        `font-family="system-ui,sans-serif" font-weight="500" fill="${INK_SOFT}" ` +
                        `text-anchor="middle" dominant-baseline="central">${area} m²</text>`,
                    );
                }
            } else {
                parts.push(
                    `<text x="${n(cx)}" y="${n(cy - fs * 0.3)}" font-size="${n(fs * 0.92)}" ` +
                    `font-family="system-ui,sans-serif" font-weight="600" fill="${INK_SOFT}" ` +
                    `text-anchor="middle" dominant-baseline="central">${esc(c.typology)}</text>`,
                );
                if (ch > 30) {
                    parts.push(
                        `<text x="${n(cx)}" y="${n(cy + fs * 0.72)}" font-size="${n(fs * 0.62)}" ` +
                        `font-family="system-ui,sans-serif" font-weight="500" fill="${INK_SOFT}" ` +
                        `text-anchor="middle" dominant-baseline="central">no fit</text>`,
                    );
                }
            }
        }

        // Apartment entrance: a short door tick on the edge that faces the corridor.
        if (ok) {
            const door = doorTickSvg(c.cell.doorEdge as Edge, r, X, Y, scale);
            if (door) doorTicks.push(door);
        }
    }

    // ── party-wall emphasis: medium strokes BETWEEN adjacent apartment cells ─────────
    // (drawn over the cells so the shared lines read crisply; the engine cells abut,
    //  so re-stroking the cell edges as a group gives the graded-weight look.)
    for (const c of cells) {
        if (c.status !== 'ok') continue;
        const r = c.cell.rect as Rectish;
        parts.push(rectEl(r, 'none', PARTY_STROKE, 1.4));
    }

    // Door ticks on top of the walls.
    for (const t of doorTicks) parts.push(t);

    // ── the CORE (lift + stair symbol), heaviest interior fill ───────────────────────
    parts.push(coreSymbolSvg(core, X, Y));

    // ── the SHELL outline last: the heaviest line in the drawing ─────────────────────
    parts.push(rectEl({ x0, z0, x1, z1 }, 'none', SHELL_STROKE, 2.4));

    // ── north arrow (top-right inside the plate margin) ──────────────────────────────
    parts.push(northArrowSvg(W));

    // ── scale bar + footer strip (legend wraps below it) ─────────────────────────────
    parts.push(scaleBarSvg(scale, drawH + 9, W));
    parts.push(legend.svg);

    const levelLabel = idx <= 0 ? 'Ground floor' : `Floor ${idx}`;
    const svg =
        `<svg viewBox="0 0 ${n(W)} ${n(H)}" preserveAspectRatio="xMidYMid meet" ` +
        `width="100%" role="img" aria-label="Representative floor plan: ${placed} apartment(s)" ` +
        `style="display:block">${parts.join('')}</svg>`;
    return { svg, levelLabel, placed, rejected };
}

/** A short entrance-door tick (perpendicular stub + swing dot) on the cell edge facing
 *  the corridor — a light architectural cue that the apartment opens onto circulation. */
function doorTickSvg(
    edge: Edge, r: Rectish,
    X: (x: number) => number, Y: (z: number) => number, scale: number,
): string {
    const cxw = (X(r.x0) + X(r.x1)) / 2;
    const cyw = (Y(r.z0) + Y(r.z1)) / 2;
    const len = Math.min(10, Math.max(5, ((r.x1 - r.x0) + (r.z1 - r.z0)) * scale * 0.08));
    let x = cxw, y = cyw;
    if (edge === 'z0') y = Y(r.z0);
    else if (edge === 'z1') y = Y(r.z1);
    else if (edge === 'x0') x = X(r.x0);
    else x = X(r.x1);
    const horiz = edge === 'z0' || edge === 'z1';
    const half = len / 2;
    const x2 = horiz ? x + half : x;
    const x1p = horiz ? x - half : x;
    const y2 = horiz ? y : y + half;
    const y1p = horiz ? y : y - half;
    const f = (v: number): string => (Math.round(v * 100) / 100).toString();
    return (
        `<line x1="${f(x1p)}" y1="${f(y1p)}" x2="${f(x2)}" y2="${f(y2)}" ` +
        `stroke="${DOOR_STROKE}" stroke-width="2" stroke-linecap="round"/>`
    );
}

/** The central core rendered as an architectural lift + stair symbol: a filled box, a
 *  lift "X" diagonal, and stair treads — distinct from every apartment. */
function coreSymbolSvg(
    core: Rectish,
    X: (x: number) => number, Y: (z: number) => number,
): string {
    const cx0 = X(core.x0), cy0 = Y(core.z0), cx1 = X(core.x1), cy1 = Y(core.z1);
    const cw = cx1 - cx0, ch = cy1 - cy0;
    const f = (v: number): string => (Math.round(v * 100) / 100).toString();
    const out: string[] = [];
    out.push(
        `<rect x="${f(cx0)}" y="${f(cy0)}" width="${f(cw)}" height="${f(ch)}" ` +
        `fill="${CORE_FILL}" stroke="${CORE_STROKE}" stroke-width="1.6"/>`,
    );
    // Split the core box into a lift half (X) and a stair half (treads) along its long axis.
    const horiz = cw >= ch;
    const midX = horiz ? cx0 + cw / 2 : cx1;
    const midY = horiz ? cy1 : cy0 + ch / 2;
    out.push(
        `<line x1="${f(horiz ? midX : cx0)}" y1="${f(horiz ? cy0 : midY)}" ` +
        `x2="${f(horiz ? midX : cx1)}" y2="${f(horiz ? cy1 : midY)}" ` +
        `stroke="#ffffff" stroke-width="1" stroke-opacity="0.6"/>`,
    );
    // Lift "X" in the first half.
    const lx0 = cx0, ly0 = cy0;
    const lx1 = horiz ? midX : cx1, ly1 = horiz ? cy1 : midY;
    const inset = Math.min(lx1 - lx0, ly1 - ly0) * 0.22;
    if (inset > 1.5) {
        out.push(
            `<line x1="${f(lx0 + inset)}" y1="${f(ly0 + inset)}" x2="${f(lx1 - inset)}" y2="${f(ly1 - inset)}" stroke="#ffffff" stroke-width="1.1" stroke-opacity="0.85"/>`,
            `<line x1="${f(lx1 - inset)}" y1="${f(ly0 + inset)}" x2="${f(lx0 + inset)}" y2="${f(ly1 - inset)}" stroke="#ffffff" stroke-width="1.1" stroke-opacity="0.85"/>`,
        );
    }
    // Stair treads in the second half (a few parallel rungs).
    const sx0 = horiz ? midX : cx0, sy0 = horiz ? cy0 : midY;
    const sx1 = cx1, sy1 = cy1;
    const treads = 4;
    for (let i = 1; i < treads; i++) {
        const t = i / treads;
        if (horiz) {
            const yy = sy0 + (sy1 - sy0) * t;
            out.push(`<line x1="${f(sx0 + 2)}" y1="${f(yy)}" x2="${f(sx1 - 2)}" y2="${f(yy)}" stroke="#ffffff" stroke-width="0.8" stroke-opacity="0.7"/>`);
        } else {
            const xx = sx0 + (sx1 - sx0) * t;
            out.push(`<line x1="${f(xx)}" y1="${f(sy0 + 2)}" x2="${f(xx)}" y2="${f(sy1 - 2)}" stroke="#ffffff" stroke-width="0.8" stroke-opacity="0.7"/>`);
        }
    }
    // Label when the core is big enough.
    if (cw > 26 && ch > 16) {
        out.push(
            `<text x="${f(cx0 + cw / 2)}" y="${f(cy0 + ch / 2)}" font-size="9" ` +
            `font-family="system-ui,sans-serif" font-weight="700" fill="#ffffff" ` +
            `text-anchor="middle" dominant-baseline="central">CORE</text>`,
        );
    }
    return out.join('');
}

/** A small north arrow in the top-right of the plate. */
function northArrowSvg(W: number): string {
    const cx = W - 16, top = 8, bot = 26;
    return (
        `<g>` +
        `<polygon points="${cx},${top} ${cx - 5},${bot} ${cx},${bot - 5} ${cx + 5},${bot}" ` +
        `fill="${SHELL_STROKE}"/>` +
        `<text x="${cx}" y="${bot + 8}" font-size="8" font-family="system-ui,sans-serif" ` +
        `font-weight="700" fill="${INK_SOFT}" text-anchor="middle">N</text>` +
        `</g>`
    );
}

/** A simple scale bar at the bottom-left of the footer strip. Picks a round metre
 *  segment (1/2/5/10/20 m) that fits comfortably under the plan. */
function scaleBarSvg(scale: number, y: number, W: number): string {
    const candidates = [1, 2, 5, 10, 20, 50];
    let metres = 5;
    for (const c of candidates) { if (c * scale <= Math.min(72, W * 0.32)) metres = c; }
    const px = metres * scale;
    const x = 6;
    const f = (v: number): string => (Math.round(v * 100) / 100).toString();
    return (
        `<g>` +
        `<line x1="${f(x)}" y1="${f(y)}" x2="${f(x + px)}" y2="${f(y)}" stroke="${INK}" stroke-width="1.4"/>` +
        `<line x1="${f(x)}" y1="${f(y - 3)}" x2="${f(x)}" y2="${f(y + 3)}" stroke="${INK}" stroke-width="1.4"/>` +
        `<line x1="${f(x + px)}" y1="${f(y - 3)}" x2="${f(x + px)}" y2="${f(y + 3)}" stroke="${INK}" stroke-width="1.4"/>` +
        `<text x="${f(x + px + 5)}" y="${f(y + 3)}" font-size="8.5" font-family="system-ui,sans-serif" fill="${INK_SOFT}">${metres} m</text>` +
        `</g>`
    );
}

/** A compact wrapping colour-key legend for the typologies actually present, plus the
 *  core + corridor swatches. Flows left→right and wraps to new rows within `W`; returns
 *  the markup AND the total height consumed (so the footer/viewBox can size to it). The
 *  legend sits below the scale-bar row at `drawH + ROW1`. */
function buildLegend(
    cells: readonly PlacedApartment[], W: number, drawH: number,
): { svg: string; height: number } {
    const present = new Set<string>();
    for (const c of cells) if (c.status === 'ok') present.add(c.typology);
    const items: Array<{ fill: string; stroke: string; label: string }> = [];
    for (const t of ['T1', 'T2', 'T3', 'T4']) {
        if (present.has(t)) items.push({ fill: TYPO_FILL[t]!, stroke: PARTITION_STROKE, label: `${t} · ${TYPO_LABEL[t]!}` });
    }
    items.push({ fill: CORE_FILL, stroke: CORE_STROKE, label: 'Core' });
    items.push({ fill: CORRIDOR_FILL, stroke: CORRIDOR_STROKE, label: 'Corridor' });

    const f = (v: number): string => (Math.round(v * 100) / 100).toString();
    const swatch = 8, gap = 4, itemGap = 11, rowH = 12, charW = 4.7, left = 6;
    const maxX = Math.max(left + 40, W - 4);
    const parts: string[] = [];
    let rowX = left, row = 0;
    const top = drawH + 18;                  // first legend row, below the scale-bar baseline
    for (const it of items) {
        const itemW = swatch + gap + it.label.length * charW + itemGap;
        if (rowX > left && rowX + itemW > maxX) { row++; rowX = left; }
        const yy = top + row * rowH;
        parts.push(
            `<rect x="${f(rowX)}" y="${f(yy)}" width="${swatch}" height="${swatch}" rx="1.5" ` +
            `fill="${it.fill}" stroke="${it.stroke}" stroke-width="1"/>` +
            `<text x="${f(rowX + swatch + gap)}" y="${f(yy + swatch - 0.5)}" font-size="8" ` +
            `font-family="system-ui,sans-serif" fill="${INK_SOFT}">${esc(it.label)}</text>`,
        );
        rowX += itemW;
    }
    return { svg: `<g>${parts.join('')}</g>`, height: (row + 1) * rowH + 4 };
}
