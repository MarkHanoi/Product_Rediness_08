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

/** Axis-aligned perimeter span in WORLD-XZ METRES — same shape D-TGL's
 *  `windowSpansWorld` / `doorSpansWorld` already use. Lets the thumbnail
 *  render pre-existing exterior openings (the user-drawn front door and
 *  windows on the perimeter walls) without the LayoutOption schema needing
 *  to carry them. */
export interface PerimeterSpan {
    readonly a: { readonly x: number; readonly z: number };
    readonly b: { readonly x: number; readonly z: number };
}

export interface ThumbnailOptions {
    readonly width?: number;          // px, default 320
    readonly height?: number;         // px, default 240
    readonly padding?: number;        // px, default 12
    readonly wallColor?: string;      // default slate-900
    readonly doorColor?: string;      // default PRYZM purple
    readonly windowColor?: string;    // default sky blue
    readonly wallWidth?: number;      // stroke px, default 2.5
    readonly background?: string;     // default transparent ('none')
    readonly showLabels?: boolean;    // default true
    readonly showDoors?: boolean;     // default true
    /** §MODAL-DYNAMIC part-3 (2026-05-29): small "5 m" scale bar at the
     *  bottom-right. Snaps to a nice round metre value (1, 2, 5, 10, 20 m). */
    readonly showScaleBar?: boolean;  // default true
    /** §WINDOW-SYMBOLS (2026-05-29): perimeter-wall WINDOW spans in WORLD-XZ
     *  metres. Rendered as glazing marks (white gap + thin centre line) on
     *  the host wall. Omitted/empty ⇒ no window symbols. */
    readonly windowSpansWorld?: ReadonlyArray<PerimeterSpan>;
    /** §WINDOW-SYMBOLS: pre-existing perimeter DOORS (e.g. the hand-placed
     *  front door from §DOOR-AVOIDANCE). Rendered the same way as the
     *  generated interior doors but in PURPLE on the perimeter walls. */
    readonly doorSpansWorld?: ReadonlyArray<PerimeterSpan>;
}

const DEFAULTS = {
    width: 320, height: 240, padding: 12,
    wallColor: '#0f172a', doorColor: '#6600FF', windowColor: '#0ea5e9',
    wallWidth: 2.5, background: 'none',
    showLabels: true, showDoors: true, showScaleBar: true,
} as const;

/** Occupancy → fill palette. Tiny residential-focused subset; falls back to
 *  a neutral slate fill for anything unmapped. Mirrors the editor's
 *  DataVisualizerService palette so the modal preview and the live editor
 *  use the same colour language. Exported so the modal-html legend uses the
 *  SAME swatches as the thumbnails — no drift. */
export const OCCUPANCY_FILL: Readonly<Record<string, string>> = {
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
export const DEFAULT_OCCUPANCY_FILL = '#f8fafc';   // slate-50, for unmapped occupancies
const DEFAULT_FILL = DEFAULT_OCCUPANCY_FILL;

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

/** Snap a target width in metres to the nearest "nice" round value from a
 *  fixed ladder. Bounded ≤ 50 m so the bar never dominates the thumbnail. */
const NICE_METRES: readonly number[] = [1, 2, 5, 10, 20, 50];
function niceScaleMetres(targetM: number): number {
    if (!isFinite(targetM) || targetM <= 0) return 1;
    let best = NICE_METRES[0]!;
    let bestDiff = Math.abs(targetM - best);
    for (const m of NICE_METRES) {
        const d = Math.abs(targetM - m);
        if (d < bestDiff) { best = m; bestDiff = d; }
    }
    return best;
}

/** Build the SVG plan thumbnail string for an option. Pure + deterministic. */
export function buildLayoutThumbnailSvg(option: LayoutOption, opts: ThumbnailOptions = {}): string {
    const W = opts.width ?? DEFAULTS.width;
    const H = opts.height ?? DEFAULTS.height;
    const pad = opts.padding ?? DEFAULTS.padding;
    const wallColor = opts.wallColor ?? DEFAULTS.wallColor;
    const doorColor = opts.doorColor ?? DEFAULTS.doorColor;
    const windowColor = opts.windowColor ?? DEFAULTS.windowColor;
    const wallW = opts.wallWidth ?? DEFAULTS.wallWidth;
    const bg = opts.background ?? DEFAULTS.background;
    const showLabels = opts.showLabels ?? DEFAULTS.showLabels;
    const showDoors = opts.showDoors ?? DEFAULTS.showDoors;
    const showScaleBar = opts.showScaleBar ?? DEFAULTS.showScaleBar;

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

    // 1. Room polygons (BENEATH walls) — filled by occupancy. Each polygon
    //    carries `data-room-name` + class `alm-room-polygon` so the modal can
    //    wire click → focus the matching `area_n_<name>` input (§CLICK-FOCUS).
    //    §A11Y (2026-05-29) — named polygons also get `role="button"` +
    //    `tabindex="0"` + an aria-label so a keyboard-only user can Tab to a
    //    room and press Enter/Space to focus its area input.
    const roomEls = rooms.map(r => {
        if (!r.polygon || r.polygon.length < 3) return '';
        const fill = OCCUPANCY_FILL[r.occupancy ?? ''] ?? DEFAULT_FILL;
        const pts = r.polygon.map(p => `${f1(mapX(p.x))},${f1(mapY(p.y))}`).join(' ');
        const nameAttr = r.name
            ? ` data-room-name="${esc(r.name)}" class="alm-room-polygon" role="button" tabindex="0" aria-label="Edit area of ${esc(r.name)}"`
            : '';
        return `<polygon points="${pts}" fill="${fill}" stroke="${wallColor}" stroke-width="0.4" stroke-opacity="0.3"${nameAttr}/>`;
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

    // 5. §WINDOW-SYMBOLS (2026-05-29) — perimeter-wall openings (windows and
    //    pre-existing exterior doors). Spans are in WORLD-XZ METRES; convert
    //    to mm (×1000) then map to SVG coords the same way as walls. Windows
    //    render as a white gap + a thin centre-line in sky-blue (the standard
    //    architectural glazing convention). Perimeter doors render as a
    //    white gap + a small bar in PURPLE (matches the interior door symbol's
    //    palette so the user can read the front door at a glance).
    const renderSpanSymbol = (span: PerimeterSpan, kind: 'window' | 'door'): string => {
        // mm coords
        const axMm = span.a.x * 1000, ayMm = span.a.z * 1000;
        const bxMm = span.b.x * 1000, byMm = span.b.z * 1000;
        const sx = mapX(axMm), sy = mapY(ayMm);
        const ex = mapX(bxMm), ey = mapY(byMm);
        const widthPx = Math.hypot(ex - sx, ey - sy);
        if (widthPx < 1) return '';
        const opening = `<line x1="${f1(sx)}" y1="${f1(sy)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="#ffffff" stroke-width="${wallW + 1}" stroke-linecap="butt"/>`;
        if (kind === 'window') {
            // Triple-line glazing: thin centre stroke on top of the white gap.
            const glazing = `<line x1="${f1(sx)}" y1="${f1(sy)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="${windowColor}" stroke-width="1.1" stroke-linecap="butt"/>`;
            return `${opening}${glazing}`;
        }
        // Perimeter door: a short bar in purple (the inward leaf isn't known
        // from the span alone — show a leaf-coloured stripe to indicate the
        // opening location).
        const leaf = `<line x1="${f1(sx)}" y1="${f1(sy)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="${doorColor}" stroke-width="1.6" stroke-linecap="butt"/>`;
        return `${opening}${leaf}`;
    };
    const windowSpans = opts.windowSpansWorld ?? [];
    const perimDoorSpans = opts.doorSpansWorld ?? [];
    const windowEls = windowSpans.map(s => renderSpanSymbol(s, 'window')).join('');
    const perimDoorEls = perimDoorSpans.map(s => renderSpanSymbol(s, 'door')).join('');

    // T1.W-D (2026-05-30) — render the engine-emitted internal-side windows
    // from option.windows (T1.W-B output). Same triple-line glazing symbol
    // as the perimeter windows above, but with the host-wall lookup pattern
    // of doors (walls[w.wallRef]). Empty when the option carries no windows.
    const optionWindows = option.windows ?? [];
    const optionWindowEls = optionWindows.map(w => {
        const host = walls[w.wallRef];
        if (!host) return '';
        const dx = host.end.x - host.start.x;
        const dy = host.end.y - host.start.y;
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len;
        const ax = host.start.x + ux * w.offset;
        const ay = host.start.y + uy * w.offset;
        const bx = host.start.x + ux * (w.offset + w.width);
        const by = host.start.y + uy * (w.offset + w.width);
        const sx = mapX(ax), sy = mapY(ay);
        const ex = mapX(bx), ey = mapY(by);
        const widthPx = Math.hypot(ex - sx, ey - sy);
        if (widthPx < 1) return '';
        const opening = `<line x1="${f1(sx)}" y1="${f1(sy)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="#ffffff" stroke-width="${wallW + 1}" stroke-linecap="butt"/>`;
        const glazing = `<line x1="${f1(sx)}" y1="${f1(sy)}" x2="${f1(ex)}" y2="${f1(ey)}" stroke="${windowColor}" stroke-width="1.1" stroke-linecap="butt"/>`;
        return `${opening}${glazing}`;
    }).join('');

    // 6. Scale bar — bottom-right of the thumbnail. Target ~70 px wide; snap
    //    to nearest nice metre value (1, 2, 5, 10, 20, 50). Skipped on tiny
    //    thumbs (W < 120) or when scale is degenerate.
    let scaleBarEls = '';
    if (showScaleBar && W >= 120 && scale > 0 && isFinite(scale)) {
        const targetMm = 70 / scale;
        const niceM = niceScaleMetres(targetMm / 1000);
        const barMm = niceM * 1000;
        const barPx = barMm * scale;
        if (barPx > 12 && barPx < W - 2 * pad) {
            const bx1 = W - pad;
            const bx0 = bx1 - barPx;
            const by = H - pad - 4;
            const label = `${niceM} m`;
            scaleBarEls =
                `<g class="alm-scalebar">` +
                `<line x1="${f1(bx0)}" y1="${f1(by)}" x2="${f1(bx1)}" y2="${f1(by)}" stroke="#0f172a" stroke-width="1.5"/>` +
                `<line x1="${f1(bx0)}" y1="${f1(by - 3)}" x2="${f1(bx0)}" y2="${f1(by + 3)}" stroke="#0f172a" stroke-width="1.5"/>` +
                `<line x1="${f1(bx1)}" y1="${f1(by - 3)}" x2="${f1(bx1)}" y2="${f1(by + 3)}" stroke="#0f172a" stroke-width="1.5"/>` +
                `<text x="${f1((bx0 + bx1) / 2)}" y="${f1(by - 5)}" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="9" fill="#334155">${label}</text>` +
                `</g>`;
        }
    }

    return `${open}${bgRect}${roomEls}${wallEls}${doorEls}${windowEls}${perimDoorEls}${optionWindowEls}${labelEls}${scaleBarEls}${close}`;
}
