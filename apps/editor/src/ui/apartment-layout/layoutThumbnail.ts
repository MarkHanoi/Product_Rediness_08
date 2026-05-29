// Apartment Layout — pure SVG plan thumbnail (SPEC §11, A5-modal-core).
//
// Builds a 2D plan thumbnail as an SVG STRING from an option's rooms + walls +
// doors. SVG is declarative — no canvas, no THREE, no requestAnimationFrame —
// so it sidesteps P3 entirely and unit-tests in plain Node. ZERO runtime
// imports (the ai-host import is type-only → erased).
//
// §SUB-ZONE upgrade (2026-05-29): rooms now carry their EXACT polygons (mm)
// from D-TGL emit. The thumbnail renders each room's polygon filled by its
// occupancy + a room label, beneath the walls. Falls back gracefully to a
// walls-only view when polygons aren't supplied (back-compat with older AI
// payloads). Walls (mm plan coords) fit to the viewBox with a uniform scale
// + padding, Y flipped so north reads up; each door is a swing-arc symbol
// rather than a dot.

import type { LayoutOption } from '@pryzm/ai-host';

export interface ThumbnailOptions {
    readonly width?: number;          // px, default 320
    readonly height?: number;         // px, default 240
    readonly padding?: number;        // px, default 12
    readonly wallColor?: string;      // default slate-900
    readonly doorColor?: string;      // default PRYZM purple
    readonly wallWidth?: number;      // stroke px, default 2.5
    readonly background?: string;     // default transparent ('none')
    readonly showLabels?: boolean;    // default true
    readonly showDoors?: boolean;     // default true
}

const DEFAULTS = {
    width: 320, height: 240, padding: 12,
    wallColor: '#0f172a', doorColor: '#6600FF', wallWidth: 2.5, background: 'none',
    showLabels: true, showDoors: true,
} as const;

/** Occupancy → fill palette. Tiny residential-focused subset; falls back to
 *  a neutral slate fill for anything unmapped. Mirrors the editor's
 *  DataVisualizerService palette so the modal preview and the live editor
 *  use the same colour language. */
const OCCUPANCY_FILL: Readonly<Record<string, string>> = {
    'bedroom':              '#dbeafe',  // blue-100 (lighter than the 3D viz so labels read)
    'living-room':          '#bfdbfe',  // blue-200
    'kitchen':              '#fef3c7',  // amber-100
    'bathroom':             '#e0e7ff',  // indigo-100
    'dining-room':          '#d1fae5',  // emerald-100
    'utility-room':         '#e5e7eb',  // slate-200
    'corridor':             '#f1f5f9',  // slate-100
    'entrance-lobby':       '#fed7aa',  // orange-200
    'private-office':       '#cffafe',  // cyan-100
};
const DEFAULT_FILL = '#f8fafc';        // slate-50

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();
const f0 = (n: number): string => Math.round(n).toString();
const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Polygon centroid (shoelace) — for label placement. Returns the bbox centre
 *  on a degenerate polygon. Pure. */
function polyCentroidMm(poly: ReadonlyArray<{ x: number; y: number }>): { x: number; y: number } {
    let cx = 0, cz = 0, a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        const cr = p.x * q.y - q.x * p.y;
        a += cr;
        cx += (p.x + q.x) * cr;
        cz += (p.y + q.y) * cr;
    }
    if (Math.abs(a) < 1e-9) {
        let sx = 0, sy = 0;
        for (const p of poly) { sx += p.x; sy += p.y; }
        return { x: sx / poly.length, y: sy / poly.length };
    }
    return { x: cx / (3 * a), y: cz / (3 * a) };
}

/** Bounding-box width × height of a polygon (mm). For label-size gating. */
function polyBboxMm(poly: ReadonlyArray<{ x: number; y: number }>): { w: number; h: number } {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of poly) {
        if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
    }
    return { w: x1 - x0, h: y1 - y0 };
}

/** Build the SVG plan thumbnail string for an option. Pure + deterministic. */
export function buildLayoutThumbnailSvg(option: LayoutOption, opts: ThumbnailOptions = {}): string {
    const W = opts.width ?? DEFAULTS.width;
    const H = opts.height ?? DEFAULTS.height;
    const pad = opts.padding ?? DEFAULTS.padding;
    const wallColor = opts.wallColor ?? DEFAULTS.wallColor;
    const doorColor = opts.doorColor ?? DEFAULTS.doorColor;
    const wallW = opts.wallWidth ?? DEFAULTS.wallWidth;
    const bg = opts.background ?? DEFAULTS.background;
    const showLabels = opts.showLabels ?? DEFAULTS.showLabels;
    const showDoors = opts.showDoors ?? DEFAULTS.showDoors;

    const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="layout plan thumbnail">`;
    const bgRect = bg !== 'none' ? `<rect x="0" y="0" width="${W}" height="${H}" fill="${bg}"/>` : '';
    const close = '</svg>';

    const walls = option.walls ?? [];
    const rooms = option.rooms ?? [];
    const doors = option.doors ?? [];

    // Bounding box: prefer the union of room polygons (the EXACT shell), fall
    // back to wall endpoints (back-compat for AI options without polygons).
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let havePoly = false;
    for (const r of rooms) {
        if (!r.polygon || r.polygon.length < 3) continue;
        havePoly = true;
        for (const p of r.polygon) {
            if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
        }
    }
    if (!havePoly) {
        for (const w of walls) {
            for (const p of [w.start, w.end]) {
                if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
                if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
            }
        }
    }
    if (!isFinite(minX) || !isFinite(maxX)) return `${open}${bgRect}${close}`;

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

    // 1. Room polygons (BENEATH walls) — filled by occupancy.
    const roomEls = rooms.map(r => {
        if (!r.polygon || r.polygon.length < 3) return '';
        const fill = OCCUPANCY_FILL[r.occupancy ?? ''] ?? DEFAULT_FILL;
        const pts = r.polygon.map(p => `${f1(mapX(p.x))},${f1(mapY(p.y))}`).join(' ');
        return `<polygon points="${pts}" fill="${fill}" stroke="${wallColor}" stroke-width="0.4" stroke-opacity="0.3"/>`;
    }).join('');

    // 2. Room labels — `Name\nA m²`, centred at the polygon centroid; only
    //    drawn when the room is big enough on screen (≥ ~64×24 px) that text
    //    fits inside its polygon.
    const labelEls = !showLabels ? '' : rooms.map(r => {
        if (!r.polygon || r.polygon.length < 3) return '';
        const bb = polyBboxMm(r.polygon);
        const wpx = bb.w * scale, hpx = bb.h * scale;
        if (wpx < 64 || hpx < 24) return '';
        const c = polyCentroidMm(r.polygon);
        const cx = mapX(c.x), cy = mapY(c.y);
        const name = esc(r.name ?? '');
        const area = (typeof r.area === 'number' && r.area > 0) ? `${f0(r.area)} m²` : '';
        const nameLine = name
            ? `<tspan x="${f1(cx)}" dy="0" font-weight="600">${name}</tspan>` : '';
        const areaLine = area
            ? `<tspan x="${f1(cx)}" dy="11" font-size="9" fill="#475569">${area}</tspan>` : '';
        return `<text x="${f1(cx)}" y="${f1(cy)}" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="10" fill="#0f172a" pointer-events="none">${nameLine}${areaLine}</text>`;
    }).join('');

    // 3. Walls.
    const wallEls = walls.map(w =>
        `<line x1="${f1(mapX(w.start.x))}" y1="${f1(mapY(w.start.y))}" x2="${f1(mapX(w.end.x))}" y2="${f1(mapY(w.end.y))}" stroke="${wallColor}" stroke-width="${wallW}" stroke-linecap="round"/>`,
    ).join('');

    // 4. Doors — a short OPENING-WIDTH gap line + a quarter-circle SWING arc on
    //    the inward side. The host wall is drawn under the opening anyway; the
    //    arc indicates which way the leaf swings. SVG arc rx=ry=width so it's
    //    a true quarter circle.
    const doorEls = !showDoors ? '' : doors.map(d => {
        const w = walls[d.wallRef];
        if (!w) return '';
        const dx = w.end.x - w.start.x;
        const dy = w.end.y - w.start.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        // Opening span endpoints in mm.
        const ax = w.start.x + ux * d.offset;
        const ay = w.start.y + uy * d.offset;
        const bx = w.start.x + ux * (d.offset + d.width);
        const by = w.start.y + uy * (d.offset + d.width);
        // SVG-y flip for the arc-end (the door swings INTO the room — we don't
        // know which side here, so we draw the arc on the LEFT of the wall
        // direction; in plan that's "above" in screen y for east-pointing walls
        // which reads as inside the room for most rectilinear shells).
        const sx = mapX(ax), sy = mapY(ay);
        const ex = mapX(bx), ey = mapY(by);
        const widthPx = Math.hypot(ex - sx, ey - sy);
        if (widthPx < 1) return '';
        // Quarter-circle arc from (sx,sy) sweeping to (sx + perp · width).
        // Perp in screen coords (Y flipped) = (-(ey-sy), (ex-sx))/widthPx — left
        // of the wall direction.
        const px = sx + (-(ey - sy)) * 1.0;
        const py = sy + ((ex - sx)) * 1.0;
        const opening = `<line x1="${f1(sx)}" y1="${f1(sy)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="#ffffff" stroke-width="${wallW + 1}" stroke-linecap="butt"/>`;
        const arc = `<path d="M ${f1(sx)} ${f1(sy)} A ${f1(widthPx)} ${f1(widthPx)} 0 0 1 ${f1(px)} ${f1(py)}" fill="none" stroke="${doorColor}" stroke-width="1.4"/>`;
        const hinge = `<circle cx="${f1(sx)}" cy="${f1(sy)}" r="2" fill="${doorColor}"/>`;
        return `${opening}${arc}${hinge}`;
    }).join('');

    return `${open}${bgRect}${roomEls}${wallEls}${doorEls}${labelEls}${close}`;
}
