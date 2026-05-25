// Apartment Layout — pure SVG plan thumbnail (SPEC §11, A5-modal-core).
//
// Builds a 2D plan thumbnail as an SVG STRING from an option's walls + doors.
// SVG is declarative — no canvas, no THREE, no requestAnimationFrame — so it
// sidesteps P3 entirely (no FrameScheduler needed) and unit-tests in plain Node.
// ZERO runtime imports (the ai-host import is type-only → erased).
//
// Walls (mm plan coords) are fit to the viewBox with a uniform scale + padding,
// Y flipped so north reads up; each door is a dot at its centre along the host
// wall. Loud-fail-soft: an option with no walls yields a valid empty SVG.

import type { LayoutOption } from '@pryzm/ai-host';

export interface ThumbnailOptions {
    readonly width?: number;          // px, default 160
    readonly height?: number;         // px, default 120
    readonly padding?: number;        // px, default 8
    readonly wallColor?: string;      // default slate
    readonly doorColor?: string;      // default PRYZM purple accent
    readonly wallWidth?: number;      // stroke px, default 2
    readonly background?: string;     // default transparent ('none')
}

const DEFAULTS = {
    width: 160, height: 120, padding: 8,
    wallColor: '#334155', doorColor: '#6600FF', wallWidth: 2, background: 'none',
} as const;

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/** Build the SVG plan thumbnail string for an option. Pure + deterministic. */
export function buildLayoutThumbnailSvg(option: LayoutOption, opts: ThumbnailOptions = {}): string {
    const W = opts.width ?? DEFAULTS.width;
    const H = opts.height ?? DEFAULTS.height;
    const pad = opts.padding ?? DEFAULTS.padding;
    const wallColor = opts.wallColor ?? DEFAULTS.wallColor;
    const doorColor = opts.doorColor ?? DEFAULTS.doorColor;
    const wallW = opts.wallWidth ?? DEFAULTS.wallWidth;
    const bg = opts.background ?? DEFAULTS.background;

    const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="layout plan thumbnail">`;
    const bgRect = bg !== 'none' ? `<rect x="0" y="0" width="${W}" height="${H}" fill="${bg}"/>` : '';
    const close = '</svg>';

    const walls = option.walls ?? [];
    if (walls.length === 0) return `${open}${bgRect}${close}`;

    // Bounding box over all wall endpoints (mm).
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const w of walls) {
        for (const p of [w.start, w.end]) {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        }
    }
    const contentW = Math.max(maxX - minX, 1e-6);
    const contentH = Math.max(maxY - minY, 1e-6);
    const availW = Math.max(W - 2 * pad, 1);
    const availH = Math.max(H - 2 * pad, 1);
    const scale = Math.min(availW / contentW, availH / contentH);
    const drawnW = contentW * scale;
    const drawnH = contentH * scale;
    const offX = pad + (availW - drawnW) / 2;
    const offY = pad + (availH - drawnH) / 2;

    const mapX = (x: number): number => offX + (x - minX) * scale;
    const mapY = (y: number): number => offY + (maxY - y) * scale; // flip: north up

    const wallEls = walls.map(w =>
        `<line x1="${f1(mapX(w.start.x))}" y1="${f1(mapY(w.start.y))}" x2="${f1(mapX(w.end.x))}" y2="${f1(mapY(w.end.y))}" stroke="${wallColor}" stroke-width="${wallW}" stroke-linecap="round"/>`,
    ).join('');

    const doorEls = (option.doors ?? []).map(d => {
        const w = walls[d.wallRef];
        if (!w) return '';
        const dx = w.end.x - w.start.x;
        const dy = w.end.y - w.start.y;
        const len = Math.hypot(dx, dy) || 1;
        const t = (d.offset + d.width / 2) / len;          // centre fraction along the wall
        const cx = w.start.x + dx * t;
        const cy = w.start.y + dy * t;
        return `<circle cx="${f1(mapX(cx))}" cy="${f1(mapY(cy))}" r="2.5" fill="${doorColor}"/>`;
    }).join('');

    return `${open}${bgRect}${wallEls}${doorEls}${close}`;
}
