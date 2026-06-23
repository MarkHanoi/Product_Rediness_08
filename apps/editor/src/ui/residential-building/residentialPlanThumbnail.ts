// Residential building (multi-family) — pure SVG floor-plan thumbnail for the
// onboarding LIVE PREVIEW (founder 2026-06-23: "the slider should redraw the actual
// plan, not just the count/mix"). Given the orchestrator's OK result it draws ONE
// representative upper floor top-down: the plate outline, the public-corridor grid,
// the centred CORE (blue, like the founder's ideal image), and every apartment cell
// filled by typology (rejected cells hatched). Re-rendered on every slider drag.
//
// PURE: no DOM, no THREE — returns an SVG STRING. All geometry is the engine's LOCAL
// (principal-axis) plan frame in metres ({ x, z }); a thumbnail needs no world rotation,
// so we draw LOCAL directly and just normalise z→y. Type-only ai-host import (erased).

import type { ResidentialBuildingOk, PlacedApartment } from '@pryzm/ai-host';

interface Rectish { x0: number; z0: number; x1: number; z1: number }

/** Typology fill — the PRYZM purple family, light→saturated by bedroom count. */
const TYPO_FILL: Record<string, string> = {
    T1: '#d7c9ff',
    T2: '#b69bff',
    T3: '#8f6cff',
    T4: '#6600ff',
};
const CORE_FILL = '#2563eb';        // blue core, matching the founder's ideal sketch
const CORRIDOR_FILL = '#ededf6';    // pale circulation
const PLATE_STROKE = '#3a3550';
const CELL_STROKE = '#ffffff';
const REJECT_FILL = '#f4d2d2';
const REJECT_STROKE = '#d4534e';

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
 * shows a text hint instead).
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
    const PAD = 0.7;                                   // metres of margin around the plate
    const scale = target / Math.max(w, d);
    const W = (w + 2 * PAD) * scale;
    const H = (d + 2 * PAD) * scale;
    const X = (x: number): number => ((x - x0) + PAD) * scale;
    const Y = (z: number): number => ((z - z0) + PAD) * scale;
    const n = (v: number): string => v.toFixed(1);

    const rectEl = (r: Rectish, fill: string, stroke: string, sw = 1, dash = ''): string =>
        `<rect x="${n(X(r.x0))}" y="${n(Y(r.z0))}" width="${n((r.x1 - r.x0) * scale)}" ` +
        `height="${n((r.z1 - r.z0) * scale)}" fill="${fill}" stroke="${stroke}" ` +
        `stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

    const parts: string[] = [];
    // Plate outline.
    parts.push(rectEl({ x0, z0, x1, z1 }, '#faf9ff', PLATE_STROKE, 1.5));
    // Public-corridor grid (drawn under the cells so cell borders read on top).
    for (const c of corridors) parts.push(rectEl(c, CORRIDOR_FILL, 'none', 0));

    let placed = 0, rejected = 0;
    for (const c of cells) {
        const r = c.cell.rect as Rectish;
        const ok = c.status === 'ok';
        if (ok) placed++; else rejected++;
        const fill = ok ? (TYPO_FILL[c.typology] ?? '#b69bff') : REJECT_FILL;
        const stroke = ok ? CELL_STROKE : REJECT_STROKE;
        parts.push(rectEl(r, fill, stroke, ok ? 1.2 : 1.4, ok ? '' : '3 2'));
        // Typology label centred in the cell when it is big enough to read.
        const cw = (r.x1 - r.x0) * scale, ch = (r.z1 - r.z0) * scale;
        if (cw > 22 && ch > 16) {
            const cx = (X(r.x0) + X(r.x1)) / 2, cy = (Y(r.z0) + Y(r.z1)) / 2;
            const label = ok ? c.typology : '×';
            const colour = (ok && c.typology === 'T4') ? '#ffffff' : '#2a2440';
            parts.push(
                `<text x="${n(cx)}" y="${n(cy)}" font-size="${Math.min(13, ch / 2).toFixed(0)}" ` +
                `font-family="system-ui,sans-serif" font-weight="600" fill="${colour}" ` +
                `text-anchor="middle" dominant-baseline="central">${esc(label)}</text>`,
            );
        }
    }
    // Core on top (always visible), with a thin label.
    parts.push(rectEl(core, CORE_FILL, '#1d4ed8', 1.5));
    const ccx = (X(core.x0) + X(core.x1)) / 2, ccy = (Y(core.z0) + Y(core.z1)) / 2;
    if ((core.x1 - core.x0) * scale > 26) {
        parts.push(
            `<text x="${n(ccx)}" y="${n(ccy)}" font-size="10" font-family="system-ui,sans-serif" ` +
            `font-weight="700" fill="#ffffff" text-anchor="middle" dominant-baseline="central">CORE</text>`,
        );
    }

    const levelLabel = idx <= 0 ? 'Ground floor' : `Floor ${idx}`;
    const svg =
        `<svg viewBox="0 0 ${n(W)} ${n(H)}" preserveAspectRatio="xMidYMid meet" ` +
        `width="100%" role="img" aria-label="Floor plan preview" ` +
        `style="display:block;max-height:300px">${parts.join('')}</svg>`;
    return { svg, levelLabel, placed, rejected };
}
