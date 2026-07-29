// FORMA-CTX-WATER (founder 2026-06-19) — keyless OSM water bodies + waterways.
//
// Sibling of contextRoads.ts / contextBuildings.ts: fetches `natural=water`
// polygons (lakes/ponds/reservoirs) and `waterway` lines (rivers/streams/canals)
// for the site bbox so the Forma flat-ground study can draw the SAME blue water
// the 2D map shows. Reuses the SAME Overpass mirror list, timeout, cache + the
// never-throw contract. Visual-only — never touches the BIM model or the layout
// engine. Founder ask: "in the site view … we need layout data — water — roads".

import {
    OVERPASS_ENDPOINTS, OVERPASS_TIMEOUT_MS,
    contextBboxAround, CONTEXT_BBOX_HALF_DEG,
    fetchOverpassViaProxy,
    type Bbox,
} from './contextBuildings';
import { readContextTileFeatures, type ContextTileFeature } from './contextTiles';

export interface ContextWaterArea {
    /** Closed ring as [lon,lat] pairs (a lake / pond / reservoir polygon). */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly osmId: number;
}
export interface ContextWaterway {
    /** Open polyline as [lon,lat] pairs (a river / stream / canal centre-line). */
    readonly coords: ReadonlyArray<readonly [number, number]>;
    readonly osmId: number;
}
export interface ContextWaterCollection {
    readonly type: 'ContextWaterCollection';
    readonly areas: ContextWaterArea[];
    readonly ways: ContextWaterway[];
    /** §FEAT-FORMA-SEA-CONTEXT (L-185) — OPEN-WATER surfaces derived by clipping the site
     *  bbox against `natural=coastline` ways (open ocean/bay is NOT a closed `natural=water`
     *  polygon, so it was previously invisible even on a waterfront site like Rose Bay).
     *  Each ring is a closed [lon,lat] loop on the SEA side of the coastline within the bbox. */
    readonly sea: ContextWaterArea[];
}

const cache = new Map<string, ContextWaterCollection>();
/**
 * §L-323 FIX B (SS-FIX-FORMA-SITE-SINGLE-EXPORT-AND-CONTEXT-CACHE) — per-bbox IN-FLIGHT promise
 * cache, mirroring the buildings loader. Concurrent consumers of the SAME bbox (3D Forma context +
 * 2D map context, or a rapid globe↔forma re-entry) share the ONE pending Overpass request instead
 * of racing a duplicate POST against the public mirrors' 429 rate limiter.
 */
const inFlight = new Map<string, Promise<ContextWaterCollection>>();
let warnedOnce = false;

function bboxKey(b: Bbox): string { return 'water:' + b.map((n) => n.toFixed(4)).join(','); }

function overpassWaterQuery(bbox: Bbox): string {
    const [w, s, e, n] = bbox;
    const b = `${s},${w},${n},${e}`;
    // Lakes/ponds/reservoirs as polygons + rivers/streams/canals as lines + the COASTLINE
    // ways (§FEAT-FORMA-SEA-CONTEXT L-185) so open ocean/bay renders (it is NOT a closed
    // `natural=water` polygon — it is `natural=coastline` line work with land on the LEFT).
    return `[out:json][timeout:25];(` +
        `way["natural"="water"](${b});` +
        `way["landuse"="reservoir"](${b});` +
        `way["waterway"~"river|stream|canal|riverbank"](${b});` +
        `way["natural"="coastline"](${b});` +
        `);out geom;`;
}

interface OverpassWay {
    type: string; id: number;
    tags?: Record<string, string>;
    geometry?: Array<{ lat: number; lon: number }>;
}

export function emptyWaterCollection(): ContextWaterCollection {
    return { type: 'ContextWaterCollection', areas: [], ways: [], sea: [] };
}

/** Parse Overpass `out geom` elements into water areas + waterways + a coastline-derived
 *  SEA mask. Shared by the §OVERPASS-PROXY path and the direct-mirror fallback below. The
 *  `bbox` is needed to clip the (unbounded) coastline into a closed sea surface (L-185). */
function waterFromElements(elements: OverpassWay[], bbox: Bbox): ContextWaterCollection {
    const areas: ContextWaterArea[] = [];
    const ways: ContextWaterway[] = [];
    const coastlines: Array<Array<readonly [number, number]>> = [];
    for (const el of elements) {
        if (el.type !== 'way' || !el.geometry || el.geometry.length < 2) continue;
        // §FEAT-FORMA-SEA-CONTEXT — coastline ways feed the sea-mask, NOT the area/line sets.
        if (el.tags?.['natural'] === 'coastline') {
            coastlines.push(el.geometry.map((p) => [p.lon, p.lat] as const));
            continue;
        }
        const isArea = el.tags?.['natural'] === 'water'
            || el.tags?.['landuse'] === 'reservoir'
            || el.tags?.['waterway'] === 'riverbank'
            || isClosed(el.geometry);
        if (isArea && el.geometry.length >= 4) {
            areas.push({ ring: el.geometry.map((p) => [p.lon, p.lat] as const), osmId: el.id });
        } else {
            ways.push({ coords: el.geometry.map((p) => [p.lon, p.lat] as const), osmId: el.id });
        }
    }
    const sea = buildSeaMaskFromCoastline(coastlines, bbox).map(
        (ring, i): ContextWaterArea => ({ ring, osmId: -1 - i }),
    );
    return { type: 'ContextWaterCollection', areas, ways, sea };
}

/** Is a lon/lat ring closed (first point ≈ last)? Ring-shaped twin of `isClosed` below, used to
 *  classify tile linework the same way the Overpass path classifies `out geom` geometry. */
function isClosedRing(ring: number[][]): boolean {
    if (ring.length < 4) return false;
    const a = ring[0]!, z = ring[ring.length - 1]!;
    return Math.abs(a[0]! - z[0]!) < 1e-9 && Math.abs(a[1]! - z[1]!) < 1e-9;
}

/**
 * §CTX-PMTILES-READER (L-513b) — convert baked-tile water features into the same
 * `ContextWaterCollection` shape `waterFromElements` produces. The water layer is MIXED
 * (LAYER_IS_AREAL.water = false), so the reader returns BOTH polygon rings and linestrings; we split
 * them exactly as the Overpass path does — `natural=water`/`landuse=reservoir`/`waterway=riverbank`
 * or a geometrically closed ring → `areas`, everything else linear → `waterways`. Any baked
 * `natural=coastline` linework feeds the SAME §FEAT-FORMA-SEA-CONTEXT sea-mask builder (L-185); when
 * no coastline is baked, `sea` is legitimately empty. `osmId` derives from the stable synthetic id.
 */
function waterFromTileFeatures(features: ContextTileFeature[], bbox: Bbox): ContextWaterCollection {
    const areas: ContextWaterArea[] = [];
    const ways: ContextWaterway[] = [];
    const coastlines: Array<Array<readonly [number, number]>> = [];
    for (const f of features) {
        const tags = f.tags;
        for (let ri = 0; ri < f.rings.length; ri++) {
            const ring = f.rings[ri]!;
            if (ring.length < 2) continue;
            const coords = ring.map((p) => [p[0]!, p[1]!] as const);
            if (tags['natural'] === 'coastline') { coastlines.push(coords.slice()); continue; }
            const osmId = f.syntheticId * 16 + ri;
            const isArea = tags['natural'] === 'water'
                || tags['landuse'] === 'reservoir'
                || tags['waterway'] === 'riverbank'
                || isClosedRing(ring);
            if (isArea && ring.length >= 4) {
                areas.push({ ring: coords, osmId });
            } else {
                ways.push({ coords, osmId });
            }
        }
    }
    const sea = buildSeaMaskFromCoastline(coastlines, bbox).map(
        (ring, i): ContextWaterArea => ({ ring, osmId: -1 - i }),
    );
    return { type: 'ContextWaterCollection', areas, ways, sea };
}

// ─────────────────────────────────────────────────────────────────────────────
// §FEAT-FORMA-SEA-CONTEXT (L-185, founder) — coastline → closed SEA surface
// ─────────────────────────────────────────────────────────────────────────────
//
// Open ocean/bay is mapped in OSM as `natural=coastline` LINE work (with LAND on the LEFT
// of the way direction, WATER on the RIGHT), never as a closed `natural=water` polygon. So
// a waterfront site (Sydney / Rose Bay) showed context buildings + parks + roads but the
// bay rendered as neutral ground. FIX (pure + testable, never-throw): stitch the coastline
// ways into polylines, CLIP them to the site bbox, and close each crossing strand back
// along the bbox boundary on the WATER (right-hand) side — yielding a closed sea polygon
// the Forma study fills as blue water at ground level. Convex/simple coasts (the common
// waterfront case) resolve cleanly; a strand we cannot close is skipped (non-fatal).

/** Round a coord to ~1e-7 deg (~1 cm) so shared way endpoints match for stitching. */
function nodeKey(p: readonly [number, number]): string {
    return `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
}

/** Stitch coastline ways that share endpoints into longer polylines (OSM splits a coast
 *  into many ways). Greedy endpoint-matching in either orientation. PURE + exported for tests. */
export function stitchCoastlineWays(
    ways: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
): Array<Array<readonly [number, number]>> {
    const segs = ways
        .filter((w) => w.length >= 2)
        .map((w) => w.slice() as Array<readonly [number, number]>);
    const used = new Array<boolean>(segs.length).fill(false);
    const out: Array<Array<readonly [number, number]>> = [];
    for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const chain = segs[i]!.slice();
        // Extend forwards + backwards by matching endpoints against unused segments.
        let extended = true;
        while (extended) {
            extended = false;
            const tail = chain[chain.length - 1]!;
            const head = chain[0]!;
            for (let j = 0; j < segs.length; j++) {
                if (used[j]) continue;
                const s = segs[j]!;
                const sHead = s[0]!, sTail = s[s.length - 1]!;
                if (nodeKey(tail) === nodeKey(sHead)) { chain.push(...s.slice(1)); used[j] = true; extended = true; break; }
                if (nodeKey(tail) === nodeKey(sTail)) { chain.push(...s.slice(0, -1).reverse()); used[j] = true; extended = true; break; }
                if (nodeKey(head) === nodeKey(sTail)) { chain.unshift(...s.slice(0, -1)); used[j] = true; extended = true; break; }
                if (nodeKey(head) === nodeKey(sHead)) { chain.unshift(...s.slice(1).reverse()); used[j] = true; extended = true; break; }
            }
        }
        out.push(chain);
    }
    return out;
}

function inBbox(p: readonly [number, number], b: Bbox): boolean {
    return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3];
}

/** Liang–Barsky clip of segment p→q against the bbox. Returns the parameter interval
 *  [u1,u2] ⊆ [0,1] of the portion INSIDE the bbox, or null if the segment misses it. */
function liangBarsky(
    p: readonly [number, number], q: readonly [number, number], b: Bbox,
): { u1: number; u2: number } | null {
    const [w, s, e, n] = b;
    const dx = q[0] - p[0], dy = q[1] - p[1];
    let u1 = 0, u2 = 1;
    const edges: ReadonlyArray<readonly [number, number]> = [
        [-dx, p[0] - w], // left
        [dx, e - p[0]],  // right
        [-dy, p[1] - s], // bottom
        [dy, n - p[1]],  // top
    ];
    for (const [pk, qk] of edges) {
        if (Math.abs(pk) < 1e-12) { if (qk < 0) return null; continue; } // parallel + outside
        const t = qk / pk;
        if (pk < 0) { if (t > u2) return null; if (t > u1) u1 = t; }     // entering
        else { if (t < u1) return null; if (t < u2) u2 = t; }            // leaving
    }
    return u1 <= u2 ? { u1, u2 } : null;
}

/** Clip a polyline to the bbox → strands lying inside, each starting/ending ON the boundary
 *  (or at a polyline end that is itself inside). PURE + exported for tests. */
export function clipPolylineToBbox(
    line: ReadonlyArray<readonly [number, number]>, b: Bbox,
): Array<Array<readonly [number, number]>> {
    const strands: Array<Array<readonly [number, number]>> = [];
    const at = (p: readonly [number, number], q: readonly [number, number], u: number): [number, number] =>
        [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    let cur: Array<readonly [number, number]> | null = null;
    for (let i = 0; i < line.length; i++) {
        const p = line[i]!;
        const pIn = inBbox(p, b);
        if (pIn) {
            if (!cur) {
                cur = [];
                // Entering: add the boundary crossing from the previous (outside) point.
                if (i > 0) { const seg = liangBarsky(line[i - 1]!, p, b); if (seg) cur.push(at(line[i - 1]!, p, seg.u1)); }
            }
            cur.push(p);
        } else {
            if (cur) {
                // Exiting: add the boundary crossing to this (outside) point + close the strand.
                const prev = line[i - 1]!;
                const seg = liangBarsky(prev, p, b); if (seg) cur.push(at(prev, p, seg.u2));
                if (cur.length >= 2) strands.push(cur);
                cur = null;
            } else if (i > 0) {
                // Both previous + current outside, but the SEGMENT may still cross the bbox.
                const prev = line[i - 1]!;
                const seg = liangBarsky(prev, p, b);
                if (seg && seg.u2 > seg.u1) strands.push([at(prev, p, seg.u1), at(prev, p, seg.u2)]);
            }
        }
    }
    if (cur && cur.length >= 2) strands.push(cur);
    return strands;
}

/** Rectangle-perimeter parameter (0..4, CCW from SW corner) of a boundary point. */
function perimeterParam(p: readonly [number, number], b: Bbox): number {
    const [w, s, e, n] = b;
    const spanX = (e - w) || 1e-9, spanY = (n - s) || 1e-9;
    const eps = 1e-7 * Math.max(spanX, spanY) + 1e-9;
    if (Math.abs(p[1] - s) <= eps) return 0 + Math.max(0, Math.min(1, (p[0] - w) / spanX));       // south
    if (Math.abs(p[0] - e) <= eps) return 1 + Math.max(0, Math.min(1, (p[1] - s) / spanY));       // east
    if (Math.abs(p[1] - n) <= eps) return 2 + Math.max(0, Math.min(1, (e - p[0]) / spanX));       // north
    if (Math.abs(p[0] - w) <= eps) return 3 + Math.max(0, Math.min(1, (n - p[1]) / spanY));       // west
    // Not exactly on an edge (numeric) — snap to nearest edge.
    const dS = Math.abs(p[1] - s), dN = Math.abs(p[1] - n), dW = Math.abs(p[0] - w), dE = Math.abs(p[0] - e);
    const m = Math.min(dS, dN, dW, dE);
    if (m === dS) return (p[0] - w) / spanX;
    if (m === dE) return 1 + (p[1] - s) / spanY;
    if (m === dN) return 2 + (e - p[0]) / spanX;
    return 3 + (n - p[1]) / spanY;
}

/** The bbox corner point at integer perimeter param k (0..3). */
function cornerAt(k: number, b: Bbox): [number, number] {
    const [w, s, e, n] = b;
    switch (((k % 4) + 4) % 4) {
        case 0: return [w, s];
        case 1: return [e, s];
        case 2: return [e, n];
        default: return [w, n];
    }
}

/** Corner points crossed walking the bbox perimeter from param `from` to `to` in `dir`
 *  (+1 = CCW / increasing, −1 = CW / decreasing). */
function boundaryWalk(from: number, to: number, dir: 1 | -1, b: Bbox): Array<[number, number]> {
    const pts: Array<[number, number]> = [];
    let t = from;
    // Normalise the sweep so we always move `dir` and stop at `to`.
    let guard = 0;
    if (dir === 1) {
        let k = Math.floor(from) + 1;
        let target = to > from ? to : to + 4;
        while (k < target && guard++ < 8) { pts.push(cornerAt(k, b)); k++; }
    } else {
        let k = Math.ceil(from) - 1;
        let target = to < from ? to : to - 4;
        while (k > target && guard++ < 8) { pts.push(cornerAt(k, b)); k--; }
    }
    void t;
    return pts;
}

/** Total length (in lon/lat units) of a polyline — used to pick the DOMINANT coastline
 *  (§SEA-DOMINANT-COAST) so short port/jetty/river fragments do not each spawn a sea ring. */
function polylineLength(line: ReadonlyArray<readonly [number, number]>): number {
    let d = 0;
    for (let i = 1; i < line.length; i++) d += Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]);
    return d;
}

/** Euclidean distance (in lon/lat units) from point p to segment a→b. Used only for the
 *  §SEA-WATER-SIDE-ROBUST "is the site ~on the coast?" guard, where the small anisotropy of
 *  lon vs lat is immaterial (the threshold is a few metres). */
function distPointToSegment(
    p: readonly [number, number], a: readonly [number, number], b: readonly [number, number],
): number {
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const wx = p[0] - a[0], wy = p[1] - a[1];
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(wx, wy);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(p[0] - b[0], p[1] - b[1]);
    const t = c1 / c2;
    return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/** Even-odd point-in-polygon (ring = [lon,lat] loop). */
function pointInRing(pt: readonly [number, number], ring: ReadonlyArray<readonly [number, number]>): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i]![0], yi = ring[i]![1], xj = ring[j]![0], yj = ring[j]![1];
        if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / ((yj - yi) || 1e-12) + xi) inside = !inside;
    }
    return inside;
}

/**
 * §FEAT-FORMA-SEA-CONTEXT — build closed SEA rings from coastline ways clipped to `bbox`.
 * OSM convention: walking a coastline way in its stored direction, LAND is on the LEFT and
 * WATER on the RIGHT. For each strand crossing the bbox we close it back along the boundary
 * on the water (right) side, using a test point just off the strand's right to pick the
 * boundary-walk direction. PURE + exported for tests. Never throws; unclosable strands are
 * dropped.
 */
export function buildSeaMaskFromCoastline(
    ways: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
    bbox: Bbox,
): Array<Array<readonly [number, number]>> {
    if (ways.length === 0) return [];
    const [w, s, e, n] = bbox;
    if (!(e > w) || !(n > s)) return [];
    const spanX = e - w, spanY = n - s;
    const eps = 1e-4 * Math.min(spanX, spanY);
    const rings: Array<Array<readonly [number, number]>> = [];

    // §SEA-DOMINANT-COAST (L-642) — close ONLY the LONGEST stitched coastline into a sea surface.
    // A large sea bbox captures many SHORT coastline fragments (port breakwaters, jetties, marina
    // walls, river mouths); each fragment, closed independently along the bbox perimeter, yields a
    // spurious ring, and their union tiles the whole box blue — the founder's "huge square blue …
    // it should follow the coastline, which it doesn't". The real shoreline is ONE long line, so
    // using only it gives a single clean seaward polygon that hugs the coast. Dropped fragments are
    // simply not drawn (§CONTEXT-DATA-HONESTY: never a fabricated plane).
    const stitched = stitchCoastlineWays(ways);
    let dominant: ReadonlyArray<readonly [number, number]> | null = null;
    let dominantLen = -1;
    for (const l of stitched) { const len = polylineLength(l); if (len > dominantLen) { dominantLen = len; dominant = l; } }
    const centre: readonly [number, number] = [(w + e) / 2, (s + n) / 2];
    for (const line of dominant ? [dominant] : []) {
        for (const strand of clipPolylineToBbox(line, bbox)) {
            if (strand.length < 2) continue;
            const start = strand[0]!, end = strand[strand.length - 1]!;
            // Only strands that both enter AND exit on the boundary can be closed to a sea area.
            const startP = perimeterParam(start, bbox);
            const endP = perimeterParam(end, bbox);
            if (!Number.isFinite(startP) || !Number.isFinite(endP)) continue;

            // Water-side test point: just off the RIGHT of a mid strand segment. Right of a
            // direction (dx,dy) is (dy,-dx). Normalise in metric-ish (scale lat by cos not
            // needed here — sign is all that matters).
            const mi = Math.max(1, Math.floor(strand.length / 2));
            const a = strand[mi - 1]!, c = strand[mi]!;
            const dx = c[0] - a[0], dy = c[1] - a[1];
            const rlen = Math.hypot(dx, dy) || 1e-12;
            const rx = (dy / rlen) * eps, ry = (-dx / rlen) * eps;
            const test: [number, number] = [(a[0] + c[0]) / 2 + rx, (a[1] + c[1]) / 2 + ry];

            // Two candidate closings: walk the boundary from end→start CCW (+1) or CW (−1).
            const build = (dir: 1 | -1): Array<readonly [number, number]> => {
                const ring = strand.slice();
                for (const cp of boundaryWalk(endP, startP, dir, bbox)) ring.push(cp);
                return ring;
            };
            const ringA = build(1), ringB = build(-1);
            // §SEA-WATER-SIDE-ROBUST (L-642) — the two closings PARTITION the bbox (they share the
            // coastline strand + the two complementary arcs of the perimeter), so exactly ONE of them
            // contains the bbox CENTRE. The centre is the site origin, which — WHEN it is inland of the
            // coast — is a known LAND point (the user's parcel is never out at sea), so the SEA ring is
            // the one that does NOT contain it. This is robust where the OSM way-direction right-hand
            // test (`test`) is not: a wide or complex coast (port breakwaters, river mouths) can invert
            // the stored orientation through stitching and paint the LAND side blue (the founder's
            // "blue everywhere — square, not only the seaside"). BUT if the site sits ~on the shoreline
            // the centre is on the strand and the side-test is ambiguous (two identical coasts of
            // opposite orientation must yield opposite seas — only the way-direction can tell them
            // apart), so there we defer to the right-hand test.
            let dCentre = Infinity;
            for (let k = 1; k < strand.length; k++) {
                dCentre = Math.min(dCentre, distPointToSegment(centre, strand[k - 1]!, strand[k]!));
            }
            let pick: Array<readonly [number, number]> | null;
            if (dCentre > eps) {
                pick = pointInRing(centre, ringA) ? ringB : ringA;   // sea = the side WITHOUT the land centre
            } else {
                pick = pointInRing(test, ringA) ? ringA : (pointInRing(test, ringB) ? ringB : null);
            }
            if (!pick || pick.length < 4) continue;
            // HARD GUARD — the sea must NEVER contain the land centre. If the chosen ring still does
            // (a mis-closure on a pathological strand), drop it: no sea is honest, sea-over-the-city
            // is not.
            if (dCentre > eps && pointInRing(centre, pick)) continue;
            rings.push(pick);
        }
    }
    return rings;
}

/** Is this way a closed ring (first point ≈ last point)? Lakes are closed; a
 *  river centre-line is open. `natural=water`/`reservoir` are areas regardless. */
function isClosed(geom: Array<{ lat: number; lon: number }>): boolean {
    if (geom.length < 4) return false;
    const a = geom[0]!, z = geom[geom.length - 1]!;
    return Math.abs(a.lat - z.lat) < 1e-9 && Math.abs(a.lon - z.lon) < 1e-9;
}

export async function fetchContextWater(
    lat: number, lon: number, signal?: AbortSignal,
    // §FEAT-FORMA-SEA-CONTEXT-EXTENT (L-642) — the caller may request a WIDER extent so the sea
    // mask (built by clipping the coastline to this bbox) covers the open sea across the zoom-out
    // view, not just the ~890 m near disc (the founder: "the sea is not all coloured as it should").
    // The sea is a few large flat polygons — cheap even at 4× the radius. Cache is keyed by bbox,
    // so a narrow lakes/rivers read and a wide sea read coexist.
    halfDeg: number = CONTEXT_BBOX_HALF_DEG,
): Promise<ContextWaterCollection> {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
        return emptyWaterCollection();
    }
    const bbox = contextBboxAround(lat, lon, halfDeg);
    const key = bboxKey(bbox);
    const hit = cache.get(key);
    if (hit) return hit;
    // §L-323 FIX B — share ONE in-flight request per bbox across concurrent consumers.
    const pending = inFlight.get(key);
    if (pending) return pending;
    const p = fetchWaterForBbox(bbox, key, signal).finally(() => { inFlight.delete(key); });
    inFlight.set(key, p);
    return p;
}

/**
 * §L-323 FIX B — the actual Overpass fetch for ONE bbox (same-origin proxy → direct-mirror
 * fallback), shared via the `inFlight` map so concurrent callers dedupe to one request. Populates
 * the in-memory `cache` on success. NEVER throws — any failure resolves to an empty collection.
 */
async function fetchWaterForBbox(
    bbox: Bbox, key: string, signal?: AbortSignal,
): Promise<ContextWaterCollection> {
    // §CTX-PMTILES-READER (L-513b) — THE BAKED TILES COME FIRST, mirroring contextBuildings. Fall
    // back to Overpass ONLY on `unavailable` (a real read failure); an honest empty `ok` is an ANSWER
    // (§CONTEXT-DATA-HONESTY). `aborted` = caller cancelled → render nothing (§L-579); `disabled`
    // falls through to the Overpass path below unchanged.
    const tiled = await readContextTileFeatures('water', bbox, signal);
    if (tiled.status === 'ok') {
        const collection = waterFromTileFeatures(tiled.features, bbox);
        cache.set(key, collection);
        console.log(
            `[gis] §CTX-PMTILES-READER water: ${collection.areas.length} area(s) + ` +
                `${collection.ways.length} waterway(s) + ${collection.sea.length} sea surface(s) from ` +
                `${tiled.tilesRead} baked tile(s) in ${tiled.ms} ms — no Overpass call.`,
        );
        return collection;
    }
    if (tiled.status === 'aborted') return emptyWaterCollection();
    if (tiled.status === 'unavailable') {
        console.warn(
            `[gis] §CTX-PMTILES-READER water: tiles configured but unreadable (${tiled.reason}) ` +
                '— falling back to live Overpass. This is a DEGRADED path, not the intended one.',
        );
    }

    const query = overpassWaterQuery(bbox);

    // §OVERPASS-PROXY — same-origin proxy FIRST (shared server cache dodges the
    // per-browser 429). `null` = proxy unreachable → direct-mirror fallback below.
    const viaProxy = await fetchOverpassViaProxy<OverpassWay>(query, signal);
    if (signal?.aborted) return emptyWaterCollection();
    if (viaProxy) {
        const collection = waterFromElements(viaProxy.elements ?? [], bbox);
        cache.set(key, collection);
        console.log(`[gis] context water: ${collection.areas.length} area(s) + ${collection.ways.length} waterway(s) + ${collection.sea.length} sea surface(s) for bbox ${key} via /api/overpass proxy.`);
        return collection;
    }

    const body = 'data=' + encodeURIComponent(query);
    for (const endpoint of OVERPASS_ENDPOINTS) {
        // §GIS-ABORT-REASON — explicit reasons; non-fatal graceful-degrade (water
        // context is skipped, the scene still renders).
        const ctrl = new AbortController();
        const timer = setTimeout(
            () => ctrl.abort(new DOMException(`Overpass timeout after ${OVERPASS_TIMEOUT_MS}ms (mirror slow/rate-limited)`, 'TimeoutError')),
            OVERPASS_TIMEOUT_MS,
        );
        const onAbort = (): void => ctrl.abort(new DOMException('caller cancelled (view/location change)', 'AbortError'));
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body, signal: ctrl.signal,
            });
            if (!res.ok) {
                console.warn(`[gis] context water: ${endpoint} HTTP ${res.status} — next mirror.`);
                continue;
            }
            const json = (await res.json()) as { elements?: OverpassWay[] };
            const collection = waterFromElements(json.elements ?? [], bbox);
            cache.set(key, collection);
            console.log(`[gis] context water: ${collection.areas.length} area(s) + ${collection.ways.length} waterway(s) + ${collection.sea.length} sea surface(s) for bbox ${key} via ${new URL(endpoint).host}.`);
            return collection;
        } catch (e) {
            if (signal?.aborted) return emptyWaterCollection();
            console.warn(`[gis] context water: ${endpoint} fetch failed — next mirror:`, e);
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', onAbort);
        }
    }
    if (!warnedOnce) {
        warnedOnce = true;
        console.warn('[gis] context water unavailable (all Overpass mirrors failed/offline) — non-fatal.');
    }
    return emptyWaterCollection();
}
