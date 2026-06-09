// Apartment Layout — pure SVG bubble/adjacency "Living Graph" (DEMO-2).
//
// Builds the room-adjacency diagram for ONE LayoutOption as an SVG STRING:
// one occupancy-coloured CIRCLE per room (positioned at the room centroid,
// scaled to fit), one LINE per adjacency edge, and a short room-type label
// per node. SVG is declarative — no canvas, no THREE, no requestAnimationFrame
// (sidesteps P3) and unit-tests in plain Node. The ai-host import is type-only
// → erased at compile time, so this module has ZERO runtime imports beyond the
// shared OCCUPANCY_FILL palette re-used from layoutThumbnail.ts (a pure const).
//
// Edge source: `option.rooms[].adjacentTo` (room NAMES) — the SAME source the
// card validator already projects (layoutCardModel.ts projectEdges). Populated
// on the D-TGL path (emitGeometry.ts) + the AI-relay path (generate.ts); empty
// on the bare procedural fallback (proceduralLayout.ts), in which case the graph
// renders nodes-only (still valid). Edges are deduped symmetric (A↔B once).
//
// Node position: room.centroid (mm, D-TGL) → polygon centroid (shoelace) →
// deterministic ring fallback (AI-relay rooms carry neither). Always finite.

import type { LayoutOption, LayoutRoom } from '@pryzm/ai-host';
import { OCCUPANCY_FILL, DEFAULT_OCCUPANCY_FILL } from './layoutThumbnail.js';

export interface BubbleGraphOptions {
    readonly width?: number;        // px, default 160
    readonly height?: number;       // px, default 160
    readonly padding?: number;      // px, default 18 (room for node radius + label)
    readonly background?: string;   // default transparent ('none')
    readonly edgeColor?: string;    // default slate-400
    readonly nodeStroke?: string;   // default slate-700
    readonly showLabels?: boolean;  // default true
    /** §LIVE-MODAL.D (R4 graph half) — when true, nodes become CLICKABLE: each
     *  circle carries `data-room-name="<minted name>"` + `class="alm-graph-node"`
     *  + `pointer-events:auto` + `role="button"`/`tabindex` so a delegated click
     *  can land on a node and open the inline area/type editor (the C52 edit
     *  surface, A.26 / ADR-0061). DEFAULT-OFF: the apartment floating overlay +
     *  the static-picture use-sites are byte-identical (nodes stay inert). */
    readonly interactive?: boolean; // default false
}

const DEFAULTS = {
    width: 160, height: 160, padding: 18,
    background: 'none', edgeColor: '#94a3b8', nodeStroke: '#334155',
    showLabels: true,
} as const;

/** RoomType → occupancy string, for rooms that carry `type` but not
 *  `occupancy` (AI-relay path). Mirrors the residential subset in
 *  OCCUPANCY_FILL so the bubble node colour matches the plan thumbnail. */
const TYPE_TO_OCCUPANCY: Readonly<Record<string, string>> = {
    master:   'bedroom',
    bedroom:  'bedroom',
    living:   'living-room',
    kitchen:  'kitchen',
    dining:   'dining-room',
    bathroom: 'bathroom',
    ensuite:  'bathroom',
    wc:       'bathroom',
    hall:     'entrance-lobby',
    corridor: 'corridor',
    study:    'private-office',
    utility:  'utility-room',
};

/** Short node label per RoomType — keeps the bubble readable at ~16px radius. */
const TYPE_SHORT_LABEL: Readonly<Record<string, string>> = {
    master:   'Master',
    bedroom:  'Bed',
    living:   'Living',
    kitchen:  'Kitchen',
    dining:   'Dining',
    bathroom: 'Bath',
    ensuite:  'Ensuite',
    wc:       'WC',
    hall:     'Hall',
    corridor: 'Corr.',
    study:    'Study',
    utility:  'Util.',
};

const f1 = (n: number): string => (Math.round(n * 10) / 10).toString();
const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Polygon centroid (shoelace). Falls back to the vertex mean on a degenerate
 *  polygon. Pure. Polygon points are plan-mm {x, y}. */
function polyCentroidMm(poly: ReadonlyArray<{ x: number; y: number }>): { x: number; y: number } {
    let cx = 0, cz = 0, a = 0;
    for (let i = 0; i < poly.length; i++) {
        const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
        const cr = p.x * q.y - q.x * p.y;
        a += cr; cx += (p.x + q.x) * cr; cz += (p.y + q.y) * cr;
    }
    if (Math.abs(a) < 1e-9) {
        let sx = 0, sy = 0;
        for (const p of poly) { sx += p.x; sy += p.y; }
        return { x: sx / poly.length, y: sy / poly.length };
    }
    return { x: cx / (3 * a), y: cz / (3 * a) };
}

/** Resolve a room's node centre in mm-plan coordinates. Priority:
 *  centroid → polygon centroid → null (caller applies the ring fallback). */
function roomCentreMm(r: LayoutRoom): { x: number; y: number } | null {
    if (r.centroid && Number.isFinite(r.centroid.x) && Number.isFinite(r.centroid.y)) {
        return { x: r.centroid.x, y: r.centroid.y };
    }
    if (r.polygon && r.polygon.length >= 3) {
        const c = polyCentroidMm(r.polygon);
        if (Number.isFinite(c.x) && Number.isFinite(c.y)) return c;
    }
    return null;
}

/** Occupancy fill for a room: explicit `occupancy` wins; else map `type`. */
function roomFill(r: LayoutRoom): string {
    const occ = r.occupancy ?? TYPE_TO_OCCUPANCY[r.type] ?? '';
    return OCCUPANCY_FILL[occ] ?? DEFAULT_OCCUPANCY_FILL;
}

/** Short readable label for a node. */
function roomShort(r: LayoutRoom): string {
    return TYPE_SHORT_LABEL[r.type] ?? (r.type ? String(r.type) : (r.name ?? '?'));
}

/** Build the bubble-graph SVG string for an option. Pure + deterministic. */
export function buildLayoutBubbleGraphSvg(
    option: LayoutOption,
    opts: BubbleGraphOptions = {},
): string {
    const W = opts.width ?? DEFAULTS.width;
    const H = opts.height ?? DEFAULTS.height;
    const pad = opts.padding ?? DEFAULTS.padding;
    const bg = opts.background ?? DEFAULTS.background;
    const edgeColor = opts.edgeColor ?? DEFAULTS.edgeColor;
    const nodeStroke = opts.nodeStroke ?? DEFAULTS.nodeStroke;
    const showLabels = opts.showLabels ?? DEFAULTS.showLabels;
    const interactive = opts.interactive ?? false;

    const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="room adjacency graph">`;
    const bgRect = bg !== 'none' ? `<rect x="0" y="0" width="${W}" height="${H}" fill="${bg}"/>` : '';
    const close = '</svg>';

    const rooms = (option.rooms ?? []).filter(
        (r): r is LayoutRoom => !!r && typeof r.name === 'string' && r.name.length > 0,
    );
    if (rooms.length === 0) return `${open}${bgRect}${close}`;

    // 1. Resolve each room's centre in mm. Rooms with no centroid/polygon get a
    //    deterministic ring position (index-based) so the AI-relay path (which
    //    carries neither) still draws a stable, non-overlapping graph.
    const N = rooms.length;
    const ringR = Math.min(W, H) / 2 - pad;
    const ringCx = W / 2, ringCy = H / 2;
    const centresMm: Array<{ x: number; y: number }> = [];
    let anyReal = false;
    rooms.forEach((r, i) => {
        const c = roomCentreMm(r);
        if (c) { anyReal = true; centresMm.push(c); }
        else {
            const ang = (i / N) * Math.PI * 2 - Math.PI / 2;
            centresMm.push({ x: ringCx + ringR * Math.cos(ang), y: ringCy + ringR * Math.sin(ang) });
        }
    });

    // 2. If ANY room had a real centroid/polygon, scale-fit ALL real centres into
    //    the padded box (Y flipped, north up). Ring-placeholder rooms keep their px
    //    position. When NO room is real, every centre is already a ring px position.
    const mapped: Array<{ x: number; y: number; real: boolean }> = [];
    if (anyReal) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        rooms.forEach((r, i) => {
            if (roomCentreMm(r)) {
                const c = centresMm[i]!;
                if (c.x < minX) minX = c.x; if (c.x > maxX) maxX = c.x;
                if (c.y < minY) minY = c.y; if (c.y > maxY) maxY = c.y;
            }
        });
        const contentW = Math.max(maxX - minX, 1e-6);
        const contentH = Math.max(maxY - minY, 1e-6);
        const availW = Math.max(W - 2 * pad, 1);
        const availH = Math.max(H - 2 * pad, 1);
        const scale = Math.min(availW / contentW, availH / contentH);
        const drawnW = contentW * scale, drawnH = contentH * scale;
        const offX = pad + (availW - drawnW) / 2;
        const offY = pad + (availH - drawnH) / 2;
        const mapX = (x: number): number => offX + (x - minX) * scale;
        const mapY = (y: number): number => offY + (maxY - y) * scale; // flip: north up
        rooms.forEach((r, i) => {
            if (roomCentreMm(r)) {
                const c = centresMm[i]!;
                mapped.push({ x: mapX(c.x), y: mapY(c.y), real: true });
            } else {
                const c = centresMm[i]!;
                mapped.push({ x: c.x, y: c.y, real: false });
            }
        });
    } else {
        for (const c of centresMm) mapped.push({ x: c.x, y: c.y, real: false });
    }

    // 3. Node radius: shrink as room count grows so nodes don't overlap.
    const radius = Math.max(7, Math.min(16, 70 / Math.sqrt(N)));

    // 4. Edges — symmetric dedupe over adjacentTo (name → index). Drawn FIRST so
    //    nodes paint on top. pointer-events:none so a click never lands on a line.
    const idxByName = new Map<string, number>();
    rooms.forEach((r, i) => idxByName.set(r.name, i));
    const seen = new Set<string>();
    const edgeEls: string[] = [];
    rooms.forEach((r) => {
        const adj = Array.isArray(r.adjacentTo) ? r.adjacentTo : [];
        for (const other of adj) {
            if (typeof other !== 'string' || other === r.name) continue;
            const j = idxByName.get(other);
            if (j === undefined) continue;                 // dangling ref — skip
            const key = r.name < other ? `${r.name}|${other}` : `${other}|${r.name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            const a = mapped[idxByName.get(r.name)!]!, b = mapped[j]!;
            edgeEls.push(
                `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" stroke="${edgeColor}" stroke-width="1.4" stroke-opacity="0.7" pointer-events="none"/>`,
            );
        }
    });

    // 5. Nodes — occupancy-coloured circles. By default NO interactive class so a
    //    click in the graph never triggers selection or area-focus; the SVG is inert
    //    as a picture (the apartment overlay + static use-sites). §LIVE-MODAL.D —
    //    when `interactive`, each node carries `data-room-name` + `alm-graph-node`
    //    + `pointer-events:auto` + role/tabindex so a delegated click/keyboard
    //    activation can open the inline area/type editor (the C52 edit surface).
    const nodeEls = rooms.map((r, i) => {
        const c = mapped[i]!;
        const fill = roomFill(r);
        const title = `<title>${esc(r.name)}${typeof r.area === 'number' && r.area > 0 ? ` — ${Math.round(r.area)} m²` : ''}</title>`;
        const interactiveAttrs = interactive
            ? ` data-room-name="${esc(r.name)}" class="alm-graph-node" role="button" tabindex="0" aria-label="Edit ${esc(r.name)}" pointer-events="auto" style="cursor:pointer"`
            : ' pointer-events="none"';
        return `<circle cx="${f1(c.x)}" cy="${f1(c.y)}" r="${f1(radius)}" fill="${fill}" stroke="${nodeStroke}" stroke-width="1.2"${interactiveAttrs}>${title}</circle>`;
    }).join('');

    // 6. Labels — short room-type text centred on the node, only when readable.
    const labelEls = !showLabels || radius < 9 ? '' : rooms.map((r, i) => {
        const c = mapped[i]!;
        const label = esc(roomShort(r));
        if (!label) return '';
        return `<text x="${f1(c.x)}" y="${f1(c.y + 3)}" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="8" font-weight="600" fill="#0f172a" pointer-events="none">${label}</text>`;
    }).join('');

    return `${open}${bgRect}${edgeEls.join('')}${nodeEls}${labelEls}${close}`;
}
