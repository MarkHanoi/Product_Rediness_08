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
import {
    OCCUPANCY_FILL, DEFAULT_OCCUPANCY_FILL, PRYZM_PURPLE,
    buildLayoutThumbnailSvg, computePlanTransform,
    type ThumbnailOptions,
} from './layoutThumbnail.js';

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

// ─────────────────────────────────────────────────────────────────────────────
// §GRAPH-OVER-PLAN (2026-06-16, founder) — the "living graph" OVERLAID ON the
// plan thumbnail, so the plan + the connectivity graph are ONE combined surface
// (replacing the separate side-by-side graph panel). The plan is drawn by the
// shared `buildLayoutThumbnailSvg`; the overlay (edges + nodes + short labels)
// is composited INTO the same SVG, mapped through the IDENTICAL
// `computePlanTransform`, so every node sits on its room's polygon CENTROID and
// every edge traces the door/adjacency connection across the real plan.
//
// Connections are derived from the SAME source the bubble graph uses —
// `room.adjacentTo` (room NAMES) — symmetric-deduped (A↔B once). NEXT-GEN VISUAL:
// nodes are radial-gradient violet discs (#7C3AED→#6600FF) whose RADIUS SCALES
// WITH DEGREE (hub rooms like the corridor/hall are bigger), each with a soft
// violet halo glow + a thin white inner ring; edges are thin smooth #6600FF lines
// (~0.55 opacity, thicker/gradient for hub↔hub) drawn BEHIND the nodes; labels
// are minimal — a small dim pill only for hub nodes. Brand: white + #6600FF /
// #8B5CF6 only, NO blue, NO black. All <defs> are uniquely id'd (FNV hash of the
// option) so many overlays on one page never clash. No RNG — node positions are
// deterministic centroids. Pure → Node-testable.
// ─────────────────────────────────────────────────────────────────────────────

export interface PlanGraphOverlayOptions extends ThumbnailOptions {
    /** Base node radius in px BEFORE degree-scaling (the radius of a degree-0
     *  node). Hub nodes grow from here as `base + k·degree`. Default 5. */
    readonly nodeRadius?: number;
    /** Edge opacity (0..1) for a baseline (non-hub) edge. Hub↔hub edges are
     *  drawn slightly more opaque. Default 0.55. */
    readonly edgeOpacity?: number;
    /** Draw the short room-type label — only for the larger HUB nodes — as a
     *  small dim pill. Default true. */
    readonly showGraphLabels?: boolean;
    /** §LIVE-MODAL.D — make nodes clickable (data-room-name + alm-graph-node +
     *  pointer-events:auto + role/tabindex) so the modal's delegated handler can
     *  open the inline editor. Default false (inert picture). */
    readonly interactiveNodes?: boolean;
}

/** Tiny deterministic FNV-1a hash → short base36 suffix, so every overlay's
 *  `<defs>` ids are UNIQUE on a page with many thumbnails (gradients/filters
 *  must not collide). Derived from option content → stable across re-renders. */
function overlayUid(option: LayoutOption): string {
    let h = 0x811c9dc5;
    const feed = (s: string): void => {
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
    };
    feed(option.summary ?? '');
    for (const r of option.rooms ?? []) {
        if (r && typeof r.name === 'string') feed(r.name);
    }
    return (h >>> 0).toString(36);
}

/**
 * Build the plan thumbnail with the connectivity graph overlaid on top, as ONE
 * SVG string. `opts` are forwarded verbatim to `buildLayoutThumbnailSvg` (so the
 * plan honours the same width/height/padding/bounds/perimeter/scale-bar options),
 * and reused by `computePlanTransform` so the overlay shares the plan's exact
 * coordinate frame. Pure + deterministic.
 */
export function buildPlanGraphOverlaySvg(
    option: LayoutOption,
    opts: PlanGraphOverlayOptions = {},
): string {
    const planSvg = buildLayoutThumbnailSvg(option, opts);
    const baseRadius = opts.nodeRadius ?? 5;
    const edgeOpacity = opts.edgeOpacity ?? 0.55;
    const showGraphLabels = opts.showGraphLabels ?? true;
    const interactive = opts.interactiveNodes ?? false;

    const tf = computePlanTransform(option, opts);
    const rooms = (option.rooms ?? []).filter(
        (r): r is LayoutRoom => !!r && typeof r.name === 'string' && r.name.length > 0,
    );
    // No transform or no named rooms → nothing to overlay; return the plain plan.
    if (!tf.ok || rooms.length === 0) return planSvg;

    // 1. Node centres in SVG px — each room's polygon/centroid mapped through the
    //    plan transform. Rooms with neither centroid nor polygon are skipped (no
    //    deterministic on-plan position — the plan has no geometry for them).
    const centres = new Map<number, { x: number; y: number }>();
    rooms.forEach((r, i) => {
        const c = roomCentreMm(r);
        if (!c) return;
        centres.set(i, { x: tf.mapX(c.x), y: tf.mapY(c.y) });
    });
    if (centres.size === 0) return planSvg;

    // 2. Edges — symmetric-dedupe (name → index). Collected first so we can compute
    //    each node's DEGREE (drives node size + hub detection) and so DOOR NODES can
    //    be placed on each real-door edge. Drawn BEHIND the nodes.
    //
    // §DOOR-GRAPH-NODES (founder 2026-06-29, "DOORS must become first-class ENTITIES
    // in the circulation graph") — a circulation edge between two rooms is REAL only
    // when a DOOR connects them. So each edge is tagged `door` from the room's
    // `doorAdjacentTo` (the realised opening graph, emitGeometry.ts), and a small
    // door NODE is rendered at the edge midpoint (room — door — room). Rooms that
    // merely SHARE A WALL but have no door between them (`adjacentTo` only) render as
    // a faint DASHED no-door edge with NO door node, so a room reachable only without
    // a door is visibly NOT solidly connected. When the engine build predates
    // `doorAdjacentTo` (no room carries it) we fall back to the old `adjacentTo`
    // edges with every edge flagged `door` (pre-deploy parity — graph unchanged).
    const idxByName = new Map<string, number>();
    rooms.forEach((r, i) => idxByName.set(r.name, i));
    // DEGREE counts DOOR connections only (the real access graph drives hub sizing).
    const degree = new Map<number, number>();           // node index → door-connection count
    const edges: Array<{ i: number; j: number; door: boolean }> = [];
    const seen = new Set<string>();
    // Has any room a door graph? (post-deploy engine). Drives the fallback below.
    const hasDoorGraph = rooms.some(r => Array.isArray(r.doorAdjacentTo));
    // Per-room door-neighbour name set (for O(1) "is this a real door?" lookup).
    const doorNamesByIdx = rooms.map(r =>
        new Set(Array.isArray(r.doorAdjacentTo) ? r.doorAdjacentTo.filter(n => typeof n === 'string') : []));
    rooms.forEach((r) => {
        const i = idxByName.get(r.name)!;
        // Union of wall-adjacency + door-adjacency names so a door that is NOT also
        // listed in adjacentTo still yields an edge (robust to one-sided data).
        const adjNames = new Set<string>();
        for (const n of (Array.isArray(r.adjacentTo) ? r.adjacentTo : [])) if (typeof n === 'string') adjNames.add(n);
        for (const n of doorNamesByIdx[i]!) adjNames.add(n);
        for (const other of adjNames) {
            if (other === r.name) continue;
            const j = idxByName.get(other);
            if (j === undefined) continue;
            const a = centres.get(i), b = centres.get(j);
            if (!a || !b) continue;                         // a node has no plan position
            const key = r.name < other ? `${r.name}|${other}` : `${other}|${r.name}`;
            if (seen.has(key)) continue;
            seen.add(key);
            // A door exists iff either side lists the other in doorAdjacentTo, OR
            // (pre-deploy, no door graph at all) we treat every wall edge as a door.
            const door = hasDoorGraph
                ? (doorNamesByIdx[i]!.has(other) || doorNamesByIdx[j]!.has(r.name))
                : true;
            edges.push({ i, j, door });
            if (door) {
                degree.set(i, (degree.get(i) ?? 0) + 1);
                degree.set(j, (degree.get(j) ?? 0) + 1);
            }
        }
    });

    // Degree-driven sizing: r = base + k·degree, clamped. A node is a "hub" when
    // its degree is at/above the connectivity median (the corridor/hall etc.).
    const DEG_K = 2.2;                                   // px of radius per connection
    const RADIUS_MAX = baseRadius + 14;
    const nodeRadius = (i: number): number =>
        Math.min(RADIUS_MAX, baseRadius + DEG_K * (degree.get(i) ?? 0));
    const maxDeg = Math.max(0, ...Array.from(degree.values()));
    const hubThreshold = Math.max(2, Math.ceil(maxDeg * 0.6));
    const isHub = (i: number): boolean => (degree.get(i) ?? 0) >= hubThreshold;

    // Unique <defs> ids (gradients/filters) so many overlays on one page never
    // collide. `uid` is deterministic from option content.
    const uid = overlayUid(option);
    const gradId = `almNodeGrad-${uid}`;
    const haloId = `almHalo-${uid}`;
    const edgeGradId = `almEdgeGrad-${uid}`;

    // Radial node gradient (#7C3AED → #6600FF), a soft outer-glow blur filter for
    // the halo, and a faint along-edge violet gradient. All brand purple + white.
    const defs =
        `<defs>` +
        `<radialGradient id="${gradId}" cx="0.5" cy="0.42" r="0.65">` +
        `<stop offset="0%" stop-color="#7C3AED"/>` +
        `<stop offset="100%" stop-color="${PRYZM_PURPLE}"/>` +
        `</radialGradient>` +
        `<linearGradient id="${edgeGradId}" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0%" stop-color="#8B5CF6"/>` +
        `<stop offset="100%" stop-color="${PRYZM_PURPLE}"/>` +
        `</linearGradient>` +
        `<filter id="${haloId}" x="-60%" y="-60%" width="220%" height="220%">` +
        `<feGaussianBlur stdDeviation="2.4"/>` +
        `</filter>` +
        `</defs>`;

    // 3. Edges — thin smooth violet lines BEHIND the nodes; hub↔hub edges read a
    //    touch thicker + more opaque, with a faint along-edge gradient. §DOOR-GRAPH-NODES
    //    — a DOOR edge is solid violet; a NO-DOOR (wall-shared only) edge is a faint
    //    DASHED violet line at low opacity so the lack of a real connection reads at a
    //    glance (the two rooms touch but you can't walk between them).
    const edgeEls: string[] = edges.map(({ i, j, door }) => {
        const a = centres.get(i)!, b = centres.get(j)!;
        if (!door) {
            return (
                `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" ` +
                `stroke="${PRYZM_PURPLE}" stroke-width="1" stroke-opacity="${Math.max(0.12, edgeOpacity - 0.35)}" ` +
                `stroke-dasharray="2 3" stroke-linecap="round" pointer-events="none"/>`
            );
        }
        const hub = isHub(i) && isHub(j);
        const w = hub ? 2.2 : 1.5;
        const op = hub ? Math.min(1, edgeOpacity + 0.2) : edgeOpacity;
        const stroke = hub ? `url(#${edgeGradId})` : PRYZM_PURPLE;
        return (
            `<line x1="${f1(a.x)}" y1="${f1(a.y)}" x2="${f1(b.x)}" y2="${f1(b.y)}" ` +
            `stroke="${stroke}" stroke-width="${w}" stroke-opacity="${op}" ` +
            `stroke-linecap="round" pointer-events="none"/>`
        );
    });
    // 3b. §DOOR-GRAPH-NODES — a small WHITE disc with a purple ring at the MIDPOINT of
    //     each real-door edge: the door is a first-class node sitting BETWEEN the two
    //     rooms it connects (room — door — room). White fill + #6600FF ring keeps it
    //     brand + distinct from the larger room discs. pointer-events:none (inert —
    //     only room nodes are interactive). Drawn after edges, before halos/rooms, so
    //     the room discs paint on top where they overlap.
    const DOOR_R = Math.max(2.2, baseRadius * 0.5);
    const doorNodeEls: string[] = edges
        .filter(e => e.door)
        .map(({ i, j }) => {
            const a = centres.get(i)!, b = centres.get(j)!;
            const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
            return (
                `<circle class="alm-graph-door-node" cx="${f1(mx)}" cy="${f1(my)}" r="${f1(DOOR_R)}" ` +
                `fill="#ffffff" stroke="${PRYZM_PURPLE}" stroke-width="1.3" pointer-events="none">` +
                `<title>door</title></circle>`
            );
        });

    // 4. Halos — soft violet outer glow under each node so the dots "pop" on the
    //    plan. Painted between the edges and the crisp node discs.
    const haloEls: string[] = [];
    // 5. Nodes — radial-gradient disc + a thin WHITE inner ring for separation.
    //    Degree-scaled radius. §LIVE-MODAL.D interactive nodes opt in to editor hooks.
    const nodeEls: string[] = [];
    const labelEls: string[] = [];
    // §GRAPH-COMPLIANCE-RED (founder 2026-06-18, "this bedroom doesn't have direct
    // access to corridor — is not compliant — the node should be red") — paint a
    // PRIVATE room that is NOT on circulation as a RED node, so a hard rule violation
    // the inspector reports as "Not on circulation ✗" is visible at a glance on the
    // graph itself. A room is on-circulation iff it IS a corridor/hall/stair OR abuts a
    // corridor/hall (same predicate the node inspector uses). Restricted to the private
    // rooms that MUST reach circulation directly — bedroom/master/bathroom/wc — so an
    // open-plan public cluster (living↔kitchen↔dining) and an en-suite reached via its
    // master (architecturally allowed) do NOT false-positive red.
    const CIRC_NEIGHBOUR = new Set(['corridor', 'hall']);
    const RED_IF_LANDLOCKED = new Set(['bedroom', 'master', 'bathroom', 'wc']);
    // §PUBLIC-FLOW — the public spaces a STAIR may legitimately be entered from
    // (founder: "the stair needs to be accessed by living / dining or corridor … public
    // spaces need to flow from the entrance → corridor → stair").
    const STAIR_ACCESS = new Set(['corridor', 'hall', 'living', 'dining', 'kitchen']);
    const typeByName = new Map(rooms.map(r => [r.name, String(r.type ?? '').toLowerCase()]));
    // Wall-adjacency fallback (only used when the engine build predates `doorAdjacentTo`).
    const neighbourTypes: Array<Set<string>> = rooms.map(() => new Set<string>());
    edges.forEach(({ i, j }) => {
        neighbourTypes[i]?.add(String(rooms[j]?.type ?? '').toLowerCase());
        neighbourTypes[j]?.add(String(rooms[i]?.type ?? '').toLowerCase());
    });
    // §CIRC-REACH (founder 2026-06-18, "the corridor is the spine — but it's isolated;
    // it needs to be directly or indirectly connected to the entrance hall, otherwise how
    // do you access it?") — circulation is a GLOBAL property, not a per-type label. BFS
    // from the storey ENTRANCE over the DOOR graph; any room cut off from the entrance —
    // INCLUDING the corridor/stair spine itself — is non-compliant however valid its local
    // doors are. The entrance is the hall (ground) or, on an upper floor that has no hall,
    // the stair (you arrive from the floor below). Only runs when EVERY room carries a
    // `doorAdjacentTo` (post-deploy engine) so pre-deploy builds never false-positive.
    // §DUP-NAME-SAFE — resolve a referenced name to ALL rooms bearing it (the engine mints
    // duplicate display names); a name→single-index map masked sealed same-named rooms.
    const reachIdxByName = new Map<string, number[]>();
    rooms.forEach((r, i) => {
        const arr = reachIdxByName.get(r.name);
        if (arr) arr.push(i); else reachIdxByName.set(r.name, [i]);
    });
    const hasFullDoorGraph = rooms.length > 0 && rooms.every(r => Array.isArray(r.doorAdjacentTo));
    const reachableFromEntrance = new Set<number>();
    if (hasFullDoorGraph) {
        // Undirected door adjacency (be robust if `doorAdjacentTo` is only one-sided).
        const doorAdj: number[][] = rooms.map(() => []);
        rooms.forEach((r, i) => {
            for (const n of (r.doorAdjacentTo ?? [])) {
                for (const j of (reachIdxByName.get(n) ?? [])) {
                    if (j !== i) { doorAdj[i]!.push(j); doorAdj[j]!.push(i); }
                }
            }
        });
        let root = rooms.findIndex(r => String(r.type ?? '').toLowerCase() === 'hall');
        if (root < 0) root = rooms.findIndex(r => String(r.type ?? '').toLowerCase() === 'stair');
        if (root >= 0) {
            const queue = [root];
            reachableFromEntrance.add(root);
            while (queue.length) {
                const cur = queue.shift()!;
                for (const nb of doorAdj[cur] ?? []) {
                    if (!reachableFromEntrance.has(nb)) { reachableFromEntrance.add(nb); queue.push(nb); }
                }
            }
        }
    }
    // True only when we have a real door graph AND established an entrance root: a room
    // outside the entrance-reachable set is an isolated island (e.g. an unreachable spine).
    const entranceUnreachable = (i: number): boolean =>
        hasFullDoorGraph && reachableFromEntrance.size > 0 && !reachableFromEntrance.has(i);
    const isNonCompliant = (i: number): boolean => {
        const r = rooms[i];
        const t = String(r?.type ?? '').toLowerCase();
        // §CIRC-REACH — cut off from the entrance over the door graph → red, including the
        // corridor/stair spine (supersedes the local "I am a corridor, so I'm the spine ✓").
        if (entranceUnreachable(i)) return true;
        const doorNbrs = Array.isArray(r?.doorAdjacentTo) ? r!.doorAdjacentTo : null;
        // §PUBLIC-FLOW — a STAIR with NO door onto the public circulation is flagged red
        // (founder: "the stair needs to be accessed by living/dining or corridor; public
        // spaces flow entrance → corridor → stair"). Mirrors the engine's
        // §DIAG-STAIR-CIRC `doorOntoCirculation=NO (SEALED)`.
        if (t === 'stair') {
            if (!doorNbrs) return false;   // no door graph (pre-deploy) → don't flag
            for (const n of doorNbrs) if (STAIR_ACCESS.has(typeByName.get(n) ?? '')) return false;
            return true;
        }
        if (!RED_IF_LANDLOCKED.has(t)) return false;
        // §DOOR-GRAPH — follow the DOOR graph (real access), NOT wall-adjacency: a private
        // room is on circulation only if it has an actual DOOR onto a corridor/hall
        // (founder: "just because it's adjacent … needs a door, otherwise not compliant").
        if (doorNbrs) {
            for (const n of doorNbrs) if (CIRC_NEIGHBOUR.has(typeByName.get(n) ?? '')) return false;
            return true; // private room with no DOOR to corridor/hall → not on circulation
        }
        for (const nt of neighbourTypes[i] ?? []) if (CIRC_NEIGHBOUR.has(nt)) return false;
        return true; // a private room with no corridor/hall neighbour → not on circulation
    };
    const RED = '#E5484D';
    rooms.forEach((r, i) => {
        const c = centres.get(i);
        if (!c) return;
        const rad = nodeRadius(i);
        const bad = isNonCompliant(i);
        haloEls.push(
            `<circle cx="${f1(c.x)}" cy="${f1(c.y)}" r="${f1(rad + 2.5)}" ` +
            `fill="${bad ? RED : '#8B5CF6'}" fill-opacity="${bad ? 0.55 : 0.45}" filter="url(#${haloId})" pointer-events="none"/>`,
        );
        const title = `<title>${esc(r.name)}${typeof r.area === 'number' && r.area > 0 ? ` — ${Math.round(r.area)} m²` : ''}${bad ? ' — ⚠ not on circulation' : ''}</title>`;
        const interactiveAttrs = interactive
            ? ` data-room-name="${esc(r.name)}" class="alm-graph-node${bad ? ' alm-graph-node--noncompliant' : ''}" role="button" tabindex="0" aria-label="Edit ${esc(r.name)}${bad ? ' (not on circulation)' : ''}" pointer-events="auto" style="cursor:pointer"`
            : ` class="${bad ? 'alm-graph-node--noncompliant' : ''}" pointer-events="none"`;
        nodeEls.push(
            `<circle cx="${f1(c.x)}" cy="${f1(c.y)}" r="${f1(rad)}" ` +
            `fill="${bad ? RED : `url(#${gradId})`}" stroke="#ffffff" stroke-width="1.4" stroke-opacity="0.95"${interactiveAttrs}>${title}</circle>`,
        );
        // 6. Labels — reduce clutter: a small dim violet pill ONLY for hub nodes
        //    (the room name already shows on the plan cell). White halo keeps it
        //    legible over the purple edges + light room fills.
        if (showGraphLabels && isHub(i)) {
            const label = esc(roomShort(r));
            if (label) {
                labelEls.push(
                    `<text x="${f1(c.x)}" y="${f1(c.y + rad + 9)}" text-anchor="middle" ` +
                    `font-family="system-ui,-apple-system,sans-serif" font-size="8" font-weight="600" ` +
                    `fill="${PRYZM_PURPLE}" fill-opacity="0.85" stroke="#ffffff" stroke-width="2.4" ` +
                    `paint-order="stroke" pointer-events="none">${label}</text>`,
                );
            }
        }
    });

    // §GRAPH-GREY-BASE (2026-06-17, founder) — in the GRAPH view the underlying
    // plan must read as a soft GREY base so the violet graph (nodes + edges) pops.
    // The standalone coloured plan panel (`buildLayoutThumbnailSvg` called direct)
    // is untouched; ONLY the plan-under-graph is desaturated, here, by wrapping the
    // plan's existing content in a `<g>` carrying an `feColorMatrix saturate(0)`
    // filter + a slight opacity. The room-fill HEX attributes stay in the markup
    // (so legend/centroid asserts are stable) — the filter only DESATURATES them at
    // paint time; wall outlines stay dark (legible) because grey is already neutral.
    // Pure SVG (no CSS dependency) → still deterministic + Node-testable.
    const greyId = `almPlanGrey-${uid}`;
    const greyDefs =
        `<defs><filter id="${greyId}" color-interpolation-filters="sRGB">` +
        `<feColorMatrix type="saturate" values="0"/>` +
        `</filter></defs>`;

    // 7. Composite: desaturate the plan body, then inject the overlay group
    //    (defs + edges + halos + nodes + labels) just BEFORE the plan's closing
    //    </svg> so it paints ON TOP, in full colour, in the SAME viewBox.
    const overlay =
        `<g class="alm-plan-graph-overlay" aria-label="room connectivity graph">` +
        defs + edgeEls.join('') + doorNodeEls.join('') + haloEls.join('') + nodeEls.join('') + labelEls.join('') +
        `</g>`;
    const closeIdx = planSvg.lastIndexOf('</svg>');
    if (closeIdx < 0) return planSvg + overlay;            // defensive — shouldn't happen
    // Find the end of the plan's opening <svg ...> tag so we can wrap everything
    // between it and </svg> in the desaturating group.
    const openEnd = planSvg.indexOf('>');
    if (openEnd < 0 || openEnd >= closeIdx) {              // defensive — malformed plan
        return planSvg.slice(0, closeIdx) + overlay + planSvg.slice(closeIdx);
    }
    const head = planSvg.slice(0, openEnd + 1);
    const body = planSvg.slice(openEnd + 1, closeIdx);
    const greyOpen = `<g class="alm-plan-grey-base" filter="url(#${greyId})" opacity="0.62">`;
    return head + greyDefs + greyOpen + body + `</g>` + overlay + planSvg.slice(closeIdx);
}

// ─────────────────────────────────────────────────────────────────────────────
// §DOOR-GRAPH-NODES / §CIRCULATION-REACH (founder 2026-06-29) — the door-aware
// circulation REACHABILITY metric. The founder's directive: "MAXIMUM score = every
// habitable room cell is reachable through circulation … DOORS are the enablers".
// This is the SINGLE door-aware source of truth that the modal's circulation %, the
// red-node logic, and tests share — a room is "reached" ONLY via a path of
// DOOR-connected rooms from the storey entrance (hall on the ground floor, else the
// stair, mirroring `unreachableHabitableRoomIds` in the engine). It returns 1.0
// (true 100%) iff EVERY habitable room has such a door path; a room reachable only
// through a wall (no door) or only through another private room counts as UNREACHED.
//
// Habitable = NOT a pure circulation space (corridor/hall/stair are the spine, not
// destinations) and NOT served-within-parent (an en-suite reached via its master is
// architecturally allowed). Mirrors the engine `REACH_HABITABLE_TYPES` set.
//
// PURE + deterministic — no I/O, no THREE, no DOM, no RNG, sorted output. P8 note:
// like the engine's `unreachableHabitableRoomIds` (ADR-0061) this is a pure graph
// predicate with NO OpenTelemetry span — adding one would force a runtime telemetry
// import into this explicitly ZERO-runtime-import module. Consistent precedent.
// ─────────────────────────────────────────────────────────────────────────────

/** Circulation/entrance room types — the spine, not habitable destinations. */
const REACH_CIRCULATION_TYPES = new Set(['corridor', 'hall', 'stair']);
/** Served-within-parent types — reached via their parent room by design (en-suite). */
const REACH_SERVED_WITHIN = new Set(['ensuite']);

export interface CirculationReachability {
    /** Habitable rooms reachable from the entrance over the DOOR graph. */
    readonly reached: number;
    /** Total habitable rooms (the denominator). */
    readonly total: number;
    /** reached / total ∈ [0,1]. 1.0 ⇔ every habitable room has a door path to the
     *  entrance — the founder's "MAXIMUM circulation". Neutral 1.0 when no habitable
     *  rooms (nothing to reach). */
    readonly fraction: number;
    /** Names of the habitable rooms that are NOT reachable through doors — the rooms
     *  blocking a 100% score (sorted, deterministic). */
    readonly unreachedRoomNames: readonly string[];
    /** True when the layout carries a real door graph (`doorAdjacentTo` on every
     *  room). When false, `fraction` is computed over wall-adjacency as a degraded
     *  fallback and should be treated as approximate (pre-deploy builds). */
    readonly hasDoorGraph: boolean;
}

/**
 * §CIRCULATION-REACH — compute door-aware circulation reachability for a layout
 * option. BFS from the entrance over the DOOR graph (`room.doorAdjacentTo`), falling
 * back to `adjacentTo` only when no room carries a door graph. Pure + deterministic.
 *
 * This is the correctness fix behind the founder's "score TOO LOW": a room must be
 * reached through an actual DOOR path, not mere wall adjacency — so a layout that
 * LOOKS connected (rooms touching) but lacks circulation doors scores BELOW 1.0, and
 * only a layout where every habitable room genuinely doors onto circulation hits 1.0.
 */
export function computeCirculationReachability(option: LayoutOption): CirculationReachability {
    const rooms = (option.rooms ?? []).filter(
        (r): r is LayoutRoom => !!r && typeof r.name === 'string' && r.name.length > 0,
    );
    const hasDoorGraph = rooms.length > 0 && rooms.every(r => Array.isArray(r.doorAdjacentTo));
    const typeOf = (r: LayoutRoom): string => String(r.type ?? '').toLowerCase();
    const isCirc = (t: string): boolean => REACH_CIRCULATION_TYPES.has(t);
    const isHabitable = (r: LayoutRoom): boolean => {
        const t = typeOf(r);
        return !isCirc(t) && !REACH_SERVED_WITHIN.has(t);
    };
    const habitable = rooms.filter(isHabitable);
    if (habitable.length === 0) {
        return { reached: 0, total: 0, fraction: 1, unreachedRoomNames: [], hasDoorGraph };
    }

    // Build the permeability adjacency: door graph when present, else wall adjacency.
    // §DUP-NAME-SAFE (2026-07-02, founder "Circulation 100% while rooms sealed") — the
    // access edges (`doorAdjacentTo` / `adjacentTo`) reference rooms BY NAME, and the
    // engine can mint DUPLICATE display names (e.g. several residual "Storage" cells,
    // "Bedroom", …). A name→SINGLE-index map collapsed every same-named room to ONE node,
    // so a SEALED room inherited a same-named CONNECTED sibling's reachability and was
    // counted as reached — the metric reported 100% over physically isolated rooms. Key the
    // graph by ARRAY INDEX and resolve every referenced name to ALL rooms bearing it, so a
    // sealed duplicate is its own node and correctly shows as unreached.
    const idxByName = new Map<string, number[]>();
    rooms.forEach((r, i) => {
        const arr = idxByName.get(r.name);
        if (arr) arr.push(i); else idxByName.set(r.name, [i]);
    });
    const adj: number[][] = rooms.map(() => []);
    const linkNames = (fromIdx: number, others: readonly string[] | undefined): void => {
        for (const n of (others ?? [])) {
            if (typeof n !== 'string') continue;
            for (const j of (idxByName.get(n) ?? [])) {
                if (j === fromIdx) continue;
                adj[fromIdx]!.push(j);
                adj[j]!.push(fromIdx);                        // undirected (robust to one-sided data)
            }
        }
    };
    rooms.forEach((r, i) => linkNames(i, hasDoorGraph ? r.doorAdjacentTo : r.adjacentTo));

    // Deterministic entrance root: hall → CORRIDOR → stair → any circulation → first room.
    // §ROOT-CORRIDOR-BEFORE-STAIR (2026-07-02) — the earlier rule preferred the STAIR over the
    // corridor, but on an UPPER floor the stair keep-out often ships DOOR-LESS (it opens onto the
    // corridor, not the reverse) — rooting BFS at a sealed stair reached NOTHING → a fully
    // corridor-connected floor scored 0%. SPEC-CIRCULATION-GRAPH FF-R1 makes the CORRIDOR the
    // upper-floor root (the landing you arrive onto); the stair merely touches it. Preferring the
    // corridor matches the engine's own reach root (`unreachableHabitableRoomIds`: entry → lowest
    // circulation) and never anchors on an isolated stair.
    const sorted = rooms
        .map((r, i) => ({ r, i }))
        .sort((a, b) => (a.r.name < b.r.name ? -1 : a.r.name > b.r.name ? 1 : a.i - b.i));
    const root =
        sorted.find(x => typeOf(x.r) === 'hall') ??
        sorted.find(x => typeOf(x.r) === 'corridor') ??
        sorted.find(x => typeOf(x.r) === 'stair') ??
        sorted.find(x => isCirc(typeOf(x.r))) ??
        sorted[0]!;
    const rootIdx = root.i;

    // BFS over the permeability graph.
    const reachedSet = new Set<number>([rootIdx]);
    const queue = [rootIdx];
    while (queue.length) {
        const cur = queue.shift()!;
        for (const nb of (adj[cur] ?? []).slice().sort((x, y) => x - y)) {
            if (!reachedSet.has(nb)) { reachedSet.add(nb); queue.push(nb); }
        }
    }

    const unreached: string[] = [];
    let reached = 0;
    rooms.forEach((r, i) => {
        if (!isHabitable(r)) return;
        if (reachedSet.has(i)) reached += 1;
        else unreached.push(r.name);
    });
    unreached.sort();
    return {
        reached,
        total: habitable.length,
        fraction: reached / habitable.length,
        unreachedRoomNames: unreached,
        hasDoorGraph,
    };
}
