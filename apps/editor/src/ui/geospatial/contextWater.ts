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
import { pointInRingEvenOdd } from '@pryzm/geometry-kernel';

export interface ContextWaterArea {
    /** Closed ring as [lon,lat] pairs (a lake / pond / reservoir polygon). */
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly osmId: number;
    /** §SEA-BAKE-POLYGONS — interior rings (ISLANDS) of a baked sea polygon, closed [lon,lat] loops.
     *  Absent on lakes/reservoirs and on walk-built sea rings (which never carry holes). */
    readonly holes?: ReadonlyArray<ReadonlyArray<readonly [number, number]>>;
}

/** §SEA-BAKE-POLYGONS — where `ContextWaterCollection.sea` came from, so a console line and a test can
 *  tell "baked polygons, no walk" from "the walk over coastline lines" from "nothing" BY VALUE. */
export type SeaProvenance = 'baked-polygons' | 'coastline-walk' | 'none';
/** §FIX-FORMA-WATERWAY-GROUND-RIBBON (L-10160) — the OSM `waterway=*` class of a centre-line.
 *  It exists ONLY to pick a NOMINAL ribbon width; it is never a surveyed channel width. */
export type ContextWaterwayKind = 'river' | 'canal' | 'stream' | 'drain' | 'ditch' | 'waterway';

export interface ContextWaterway {
    /** Open polyline as [lon,lat] pairs (a river / stream / canal centre-line). */
    readonly coords: ReadonlyArray<readonly [number, number]>;
    readonly osmId: number;
    /**
     * §FIX-FORMA-WATERWAY-GROUND-RIBBON (L-10160) — the `waterway` tag, carried so the renderer can
     * pick a class-typed NOMINAL ribbon width exactly as `loadContextRoads` does from `highway`.
     * ⚠ The tag was previously DROPPED here, which is why the renderer had nothing to size a ribbon
     * with and fell back to a fixed 3-pixel screen-space polyline. `'waterway'` = tag absent/unknown.
     */
    readonly kind: ContextWaterwayKind;
}
export interface ContextWaterCollection {
    readonly type: 'ContextWaterCollection';
    readonly areas: ContextWaterArea[];
    readonly ways: ContextWaterway[];
    /** §FEAT-FORMA-SEA-CONTEXT (L-185) — OPEN-WATER surfaces derived by clipping the site
     *  bbox against `natural=coastline` ways (open ocean/bay is NOT a closed `natural=water`
     *  polygon, so it was previously invisible even on a waterfront site like Rose Bay).
     *  Each ring is a closed [lon,lat] loop on the SEA side of the coastline within the bbox.
     *  §SEA-BAKE-POLYGONS (lane SEA-BAKE, 2026-09-05) — when the baked `sea` layer holds polygons for
     *  this bbox they are used DIRECTLY (with island holes) and no coastline walk runs; the walk over
     *  the water layer's `natural=coastline` lines is the FALLBACK for a bbox the sea layer does not
     *  cover (not yet baked, landlocked, or the layer absent), and CesiumViewport's
     *  §FIX-SEA-COVERAGE-GATE live supplement stays as the safety net below that. */
    readonly sea: ContextWaterArea[];
    /** §SEA-BAKE-POLYGONS — provenance of `sea`, carried BY VALUE (never only in a console line). */
    readonly seaProvenance?: SeaProvenance;
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
    return { type: 'ContextWaterCollection', areas: [], ways: [], sea: [], seaProvenance: 'none' };
}

/** §FIX-FORMA-WATERWAY-GROUND-RIBBON (L-10160) — narrow an OSM `waterway` tag to the classes we
 *  size a ribbon for. Anything else (weir, dock, lock_gate, an absent tag) is `'waterway'`, which
 *  takes the conservative default width — never a guess dressed as a class. */
export function waterwayKind(tag: string | undefined): ContextWaterwayKind {
    switch (tag) {
        case 'river': case 'riverbank': return 'river';
        case 'canal': return 'canal';
        case 'stream': return 'stream';
        case 'drain': return 'drain';
        case 'ditch': return 'ditch';
        default: return 'waterway';
    }
}

/**
 * §FIX-FORMA-WATERWAY-GROUND-RIBBON (L-10160) — is this centre-line a DUPLICATE of a water AREA
 * we are already drawing?
 *
 * OSM maps a large river BOTH ways: `waterway=river` as a centre-line AND `natural=water` /
 * `waterway=riverbank` as the real wetted polygon. `waterFromElements` splits those into `areas`
 * and `ways`, so both reach the renderer. While the centre-line was a 3-pixel hairline that
 * overlap was invisible; as a metric ground ribbon it becomes a second, differently-shaped band
 * of NOMINAL width laid over the river's ACTUAL surface — a fabricated edge on top of a real one.
 *
 * The area is the better answer whenever it exists, so the centre-line is dropped when the
 * MAJORITY of its vertices fall inside one. A majority (not "any vertex") because a tributary
 * that merely joins a mapped river touches its polygon at the confluence and must still draw.
 * PURE + deterministic; no I/O, no Cesium.
 */
export function waterwayDuplicatesArea(
    way: ContextWaterway,
    areas: ReadonlyArray<ContextWaterArea>,
): boolean {
    if (areas.length === 0 || way.coords.length === 0) return false;
    let inside = 0;
    for (const pt of way.coords) {
        for (const a of areas) {
            if (a.ring.length >= 4 && pointInRing(pt, a.ring)) { inside++; break; }
        }
    }
    return inside * 2 > way.coords.length;
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
            ways.push({
                coords: el.geometry.map((p) => [p.lon, p.lat] as const),
                osmId: el.id,
                kind: waterwayKind(el.tags?.['waterway']),
            });
        }
    }
    const sea = buildSeaMaskFromCoastline(coastlines, bbox).map(
        (ring, i): ContextWaterArea => ({ ring, osmId: -1 - i }),
    );
    return { type: 'ContextWaterCollection', areas, ways, sea, seaProvenance: 'coastline-walk' };
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
 *
 * §SEA-BAKE-POLYGONS — when `seaPolygons` (features of the baked `sea` layer) is non-empty, the sea
 * comes from THEM and the coastline walk does not run at all: the polygons are closed by construction
 * (osmcoastline, bake-side) and survive tile clipping closed, which the coastline lines never did
 * (L-12921 / L-12909 / L-807 — every baked coastal city fell through to the live supplement).
 */
function waterFromTileFeatures(
    features: ContextTileFeature[], bbox: Bbox, seaPolygons?: ContextTileFeature[] | null,
): ContextWaterCollection {
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
                ways.push({ coords, osmId, kind: waterwayKind(tags['waterway']) });
            }
        }
    }
    if (seaPolygons && seaPolygons.length > 0) {
        const { sea, refused } = seaFromTilePolygons(seaPolygons, bbox);
        for (const r of refused) console.warn(`[gis] §SEA-BAKE-POLYGONS baked sea polygon REFUSED (${r.reason}): ${r.detail}`);
        return { type: 'ContextWaterCollection', areas, ways, sea, seaProvenance: 'baked-polygons' };
    }
    const sea = buildSeaMaskFromCoastline(coastlines, bbox).map(
        (ring, i): ContextWaterArea => ({ ring, osmId: -1 - i }),
    );
    return { type: 'ContextWaterCollection', areas, ways, sea, seaProvenance: 'coastline-walk' };
}

/**
 * §SEA-BAKE-POLYGONS — baked `sea` tile features → sea areas, PURE. Each outer ring becomes one
 * `ContextWaterArea` carrying its island holes. The one refusal, kept from the walk (§CONTEXT-DATA-
 * HONESTY — sea over the city is not honest): a polygon that contains the bbox CENTRE (and not inside
 * one of its own holes) would put the site in the water; it is refused BY NAME as `land-centre` and
 * not drawn. Every other piece is kept — the sea is many per-tile pieces, and one refused piece must
 * not empty the bay.
 */
export function seaFromTilePolygons(
    features: ContextTileFeature[], bbox: Bbox,
): { sea: ContextWaterArea[]; refused: SeaMaskRefusal[] } {
    const centre: readonly [number, number] = [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
    const sea: ContextWaterArea[] = [];
    const refused: SeaMaskRefusal[] = [];
    for (const f of features) {
        for (let ri = 0; ri < f.rings.length; ri++) {
            const ring = f.rings[ri]!;
            if (ring.length < 4) continue;
            const outer = ring.map((p) => [p[0]!, p[1]!] as const);
            const holes = (f.holes?.[ri] ?? [])
                .filter((h) => h.length >= 4)
                .map((h) => h.map((p) => [p[0]!, p[1]!] as const));
            if (pointInRing(centre, outer) && !holes.some((h) => pointInRing(centre, h))) {
                refused.push({
                    reason: 'land-centre',
                    detail: `a baked sea polygon (${outer.length} vertices, ${holes.length} island hole(s)) contains the bbox centre `
                        + `${centre[1].toFixed(5)}, ${centre[0].toFixed(5)} — the site would sit in the water; this piece is not drawn.`,
                });
                continue;
            }
            sea.push(holes.length > 0
                ? { ring: outer, osmId: f.syntheticId * 16 + ri, holes }
                : { ring: outer, osmId: f.syntheticId * 16 + ri });
        }
    }
    return { sea, refused };
}

// ─────────────────────────────────────────────────────────────────────────────
// §FEAT-FORMA-SEA-CONTEXT (L-185, founder) — coastline → closed SEA surface
// ─────────────────────────────────────────────────────────────────────────────
//
// Open ocean/bay is mapped in OSM as `natural=coastline` LINE work — LAND on the LEFT of the way
// direction, WATER on the RIGHT — never as a closed `natural=water` polygon. So a waterfront site
// (Sydney / Rose Bay) showed context buildings + parks + roads but the bay rendered as neutral
// ground. The build is PURE + testable + never-throw: stitch the ways into chains (orientation
// preserved), clip them to the site bbox, and close the WATER side along the bbox perimeter.
//
// ── §SEA-LEFT-HAND-WALK (L-12911, 2026-09-05) — the water side is decided by OSM's orientation
//    rule, JOINTLY over every strand in the bbox; never per strand by a bbox heuristic. ──
//
// HISTORY, because three generations of this function each "fixed" the sea and each then drew it
// over a town somewhere:
//   • L-185: per strand, close along the perimeter on the side a test point just RIGHT of the
//     strand's mid-segment falls. Correct for one simple coast.
//   • L-642 (§SEA-WATER-SIDE-ROBUST + §SEA-DOMINANT-COAST): "sea = the side WITHOUT the bbox
//     centre", keep only the longest chain, plus a hard "sea must not contain the centre" guard.
//     Correct while the bbox holds ONE coastline and the site is inland of it.
//   • L-807 (§FIX-SEA-TILE-FRAGMENTATION): keep every chain ≥ 15 % of the longest, because the
//     baked tiles deliver one coast as many fragments.
//   • L-12911 — Sète: the Mediterranean AND the Étang de Thau are both `natural=coastline`, with
//     the town on the spit between them. Closed PER STRAND against the bbox centre, a lagoon-shore
//     strand's "side without the centre" is whichever side the click happens to fall on. Measured
//     on the shipped L662a tiles with the pre-fix code: click (43.41, 3.70) → a 74.8 %-of-bbox ring
//     containing the town centre, Mont St-Clair, the lagoon AND the sea; click (43.398, 3.70) → a
//     25.9 % ring over the town and lagoon but NOT the sea — the flooded side flips with the click.
//     The centre guard passed both times because the CLICK was not inside the ring; the TOWN was.
//
// THE RULE NOW. Every coastline strand crossing the bbox enters at a HEAD and leaves at a TAIL,
// both on the perimeter. Water is on the right of every strand, so the water polygon a strand
// bounds is traversed CLOCKWISE: strand head→tail, then along the perimeter CW (decreasing
// perimeter parameter) to the next strand's HEAD, follow that strand, … until back at the start.
// Walking CCW along the perimeter, heads (land→water) and tails (water→land) therefore ALTERNATE
// for any consistently-oriented coastline set — which is what makes several coastlines (Sète),
// harbours and islands crossing the edge fall out of ONE walk with no special case, and what makes
// the result independent of where the bbox happens to sit.
//
// WHAT IS REFUSED, LOUDLY (§CONTEXT-DATA-HONESTY — no sea is honest, sea-over-the-city is not):
//   • `incomplete-coastline` — a chain END lies strictly INSIDE the bbox. The coastline is a closed
//     network in OSM, so a free end inside the box means a piece is MISSING (a tile-clipped
//     fragment, a way tippecanoe dropped). The walk cannot know which side of a missing piece is
//     water, so NOTHING is drawn. Measured on the shipped L662a water tiles: Sète 98 pieces →
//     59 chains, 74 free ends inside the bbox against 2 on the perimeter; Marseille 390 → 210, 152
//     inside. Baked coastline arrives as fragments; the client's §FIX-SEA-COVERAGE-GATE then
//     supplements from the live coastline, whose ways are complete. The bake-side answer (pre-closed
//     water polygons at bake time) is recorded in L-12911.
//   • `orientation-conflict` — walking CW from a tail meets another TAIL: two strands disagree about
//     which side is water (a reversed way in the data). Nothing is drawn.
//   • `land-centre` — a finished ring contains the bbox centre, i.e. the site. That ring is dropped
//     and named; the others stand. It is a guard, not the decision.

/** Round a coord to ~1e-7 deg (~1 cm) so shared way endpoints match for stitching. */
function nodeKey(p: readonly [number, number]): string {
    return `${p[0].toFixed(7)},${p[1].toFixed(7)}`;
}

/**
 * Stitch coastline ways that share endpoints into longer chains (OSM splits a coast into many
 * ways). ⚠ ORIENTATION-PRESERVING: a way's TAIL is joined only to another way's HEAD. OSM
 * coastline direction is DATA (land left / water right — the whole water-side decision in
 * §SEA-LEFT-HAND-WALK rests on it), so a tail↔tail or head↔head match is a broken coastline, not a
 * puzzle to solve by reversing one side: reversing would hand the walk a 50 % chance of painting
 * the land blue with no trace of why. Such ways stay separate chains and their free ends are
 * refused downstream as `incomplete-coastline`. (Until L-12911 this reversed to match — the header
 * history records what that cost.)
 *
 * Chains start at ways whose head is nobody's tail (true chain starts), so one coastline never
 * splits in two because the scan happened to begin mid-way; whatever remains is closed loops.
 * PURE + exported for tests.
 */
export function stitchCoastlineWays(
    ways: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
): Array<Array<readonly [number, number]>> {
    const segs = ways
        .filter((w) => w.length >= 2)
        .map((w) => w.slice() as Array<readonly [number, number]>);
    const byHead = new Map<string, number[]>();
    const tailKeys = new Set<string>();
    segs.forEach((s, i) => {
        const hk = nodeKey(s[0]!);
        const list = byHead.get(hk);
        if (list) list.push(i); else byHead.set(hk, [i]);
        tailKeys.add(nodeKey(s[s.length - 1]!));
    });
    const isStart = (i: number): boolean => !tailKeys.has(nodeKey(segs[i]![0]!));
    const order = segs.map((_, i) => i).sort((a, b) => Number(isStart(b)) - Number(isStart(a)));
    const used = new Array<boolean>(segs.length).fill(false);
    const out: Array<Array<readonly [number, number]>> = [];
    for (const i of order) {
        if (used[i]) continue;
        used[i] = true;
        const chain = segs[i]!.slice();
        let guard = segs.length;
        while (guard-- > 0) {
            const next = (byHead.get(nodeKey(chain[chain.length - 1]!)) ?? []).find((j) => !used[j]);
            if (next === undefined) break;
            used[next] = true;
            chain.push(...segs[next]!.slice(1));
            if (nodeKey(chain[0]!) === nodeKey(chain[chain.length - 1]!)) break; // closed loop
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

/** Euclidean distance (in lon/lat units) from point p to segment a→b — sign-free, used only for
 *  the "is the site ON the shoreline?" exemption of the land-centre guard, where the small
 *  anisotropy of lon vs lat is immaterial (the threshold is a few metres). */
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

/** Distance from `p` to the nearest edge of a closed loop (last→first edge included). */
function distPointToRing(p: readonly [number, number], ring: ReadonlyArray<readonly [number, number]>): number {
    let d = Infinity;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        d = Math.min(d, distPointToSegment(p, ring[j]!, ring[i]!));
    }
    return d;
}

/** Even-odd point-in-polygon (ring = [lon,lat] loop).
 *  §C73-PIP-CANONICAL — delegates to THE kernel ray cast with `[lon,lat]` tuple
 *  accessors; the private `|| 1e-12` denominator guard is gone as dead code (the
 *  straddle test makes the divisor structurally nonzero — kernel header §1). */
function pointInRing(pt: readonly [number, number], ring: ReadonlyArray<readonly [number, number]>): boolean {
    return pointInRingEvenOdd(pt[0], pt[1], ring.length, (i) => ring[i]![0], (i) => ring[i]![1]);
}

/** §SEA-LEFT-HAND-WALK — why a ring, or the whole build, was refused. Named so a test can assert
 *  the REASON and a console line can carry it: a refusal and an empty result are different values. */
export interface SeaMaskRefusal {
    readonly reason: 'incomplete-coastline' | 'orientation-conflict' | 'walk-failed' | 'land-centre';
    readonly detail: string;
}

export interface SeaMaskResult {
    /** [lon,lat] loops on the WATER side (not explicitly re-closed; consumers treat them as loops). */
    readonly rings: Array<Array<readonly [number, number]>>;
    readonly refused: SeaMaskRefusal[];
    /** Diagnostics for the console line. */
    readonly chains: number;
    readonly strands: number;
    /** Closed coastline loops entirely inside the bbox that enclose LAND (CCW) — islands, not drawn. */
    readonly islands: number;
}

/** Signed shoelace area of a lon/lat loop: > 0 ⇔ counter-clockwise (x east, y north). */
function signedArea(ring: ReadonlyArray<readonly [number, number]>): number {
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        a += ring[j]![0] * ring[i]![1] - ring[i]![0] * ring[j]![1];
    }
    return a / 2;
}

/** Is `p` on the bbox perimeter, within the tolerance `perimeterParam` itself snaps with? */
function onPerimeter(p: readonly [number, number], b: Bbox): boolean {
    const [w, s, e, n] = b;
    const eps = 1e-7 * Math.max(e - w, n - s) + 1e-9;
    return Math.abs(p[0] - w) <= eps || Math.abs(p[0] - e) <= eps
        || Math.abs(p[1] - s) <= eps || Math.abs(p[1] - n) <= eps;
}

/**
 * §SEA-LEFT-HAND-WALK (L-12911) — build the WATER rings for `bbox` from coastline ways, deciding
 * the water side from OSM way orientation alone (see the section header). PURE, silent, never
 * throws; refusals are RETURNED, not logged — `buildSeaMaskFromCoastline` is the logging wrapper.
 */
export function buildSeaMask(
    ways: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
    bbox: Bbox,
): SeaMaskResult {
    if (ways.length === 0) return { rings: [], refused: [], chains: 0, strands: 0, islands: 0 };
    const [w, s, e, n] = bbox;
    if (!(e > w) || !(n > s)) return { rings: [], refused: [], chains: 0, strands: 0, islands: 0 };

    const chains = stitchCoastlineWays(ways);
    const rings: Array<Array<readonly [number, number]>> = [];
    const refused: SeaMaskRefusal[] = [];
    let islands = 0;

    // 1. Split every chain into perimeter-to-perimeter STRANDS. A closed loop that never touches the
    //    perimeter is decided by its winding alone; one that crosses is rotated to start OUTSIDE, so
    //    the clip yields real strands rather than a fake free end at its arbitrary first vertex.
    interface Strand { pts: Array<readonly [number, number]>; head: number; tail: number }
    const strands: Strand[] = [];
    const freeEnds: Array<readonly [number, number]> = [];
    for (const chain of chains) {
        if (chain.length < 2) continue;
        let line: ReadonlyArray<readonly [number, number]> = chain;
        const closed = chain.length >= 4 && nodeKey(chain[0]!) === nodeKey(chain[chain.length - 1]!);
        if (closed) {
            const loop = chain.slice(0, -1);
            const outIdx = loop.findIndex((p) => !inBbox(p, bbox));
            if (outIdx < 0) {
                // Entirely inside: CW (water on the right = inside) is an enclosed water body; CCW is an island.
                if (signedArea(loop) < 0) rings.push(loop.slice()); else islands++;
                continue;
            }
            line = [...loop.slice(outIdx), ...loop.slice(0, outIdx), loop[outIdx]!];
        }
        for (const strand of clipPolylineToBbox(line, bbox)) {
            if (strand.length < 2) continue;
            const head = strand[0]!, tail = strand[strand.length - 1]!;
            if (!onPerimeter(head, bbox)) freeEnds.push(head);
            if (!onPerimeter(tail, bbox)) freeEnds.push(tail);
            strands.push({ pts: strand, head: perimeterParam(head, bbox), tail: perimeterParam(tail, bbox) });
        }
    }
    if (freeEnds.length > 0) {
        const ex = freeEnds[0]!;
        refused.push({
            reason: 'incomplete-coastline',
            detail: `${freeEnds.length} coastline end(s) lie strictly inside the bbox (first at ` +
                `${ex[1].toFixed(5)}, ${ex[0].toFixed(5)}) across ${chains.length} chain(s) — the coastline ` +
                'here is fragments, not a closed network; the water side of a missing piece is unknowable.',
        });
        return { rings: [], refused, chains: chains.length, strands: strands.length, islands };
    }
    if (strands.length === 0) return { rings, refused, chains: chains.length, strands: 0, islands };

    // 2. Every strand end on the perimeter, in CCW order. Heads (land→water) and tails (water→land)
    //    must alternate; the walk below reports a violation as `orientation-conflict`.
    interface End { param: number; kind: 'head' | 'tail'; strand: Strand }
    const ends: End[] = [];
    for (const st of strands) {
        ends.push({ param: st.head, kind: 'head', strand: st });
        ends.push({ param: st.tail, kind: 'tail', strand: st });
    }
    ends.sort((a, b) => a.param - b.param);
    const tailIndex = new Map<Strand, number>();
    ends.forEach((en, i) => { if (en.kind === 'tail') tailIndex.set(en.strand, i); });

    // 3. The walk: head→tail along the strand, CW along the perimeter to the next HEAD, repeat.
    const used = new Set<Strand>();
    for (const start of strands) {
        if (used.has(start)) continue;
        const ring: Array<readonly [number, number]> = [];
        let cur = start;
        let closedRing = false;
        let guard = strands.length + 1;
        while (guard-- > 0) {
            used.add(cur);
            ring.push(...cur.pts);
            const ti = tailIndex.get(cur)!;
            const next = ends[(ti - 1 + ends.length) % ends.length]!;
            if (next.kind !== 'head') {
                refused.push({
                    reason: 'orientation-conflict',
                    detail: `walking the perimeter clockwise from a coastline exit at perimeter ${cur.tail.toFixed(3)} ` +
                        `meets another EXIT at ${next.param.toFixed(3)} — two strands disagree about which side is water.`,
                });
                return { rings: [], refused, chains: chains.length, strands: strands.length, islands };
            }
            // A tail and the next head at the SAME perimeter point (coast touching the edge) add no corners;
            // `boundaryWalk` would otherwise read from === to as a full lap.
            if (Math.abs(next.param - cur.tail) > 1e-12) ring.push(...boundaryWalk(cur.tail, next.param, -1, bbox));
            if (next.strand === start) { closedRing = true; break; }
            if (used.has(next.strand)) break; // would re-enter a finished ring — malformed
            cur = next.strand;
        }
        if (!closedRing) {
            refused.push({
                reason: 'walk-failed',
                detail: `a perimeter walk starting at perimeter ${start.head.toFixed(3)} did not return to its start.`,
            });
            return { rings: [], refused, chains: chains.length, strands: strands.length, islands };
        }
        if (ring.length >= 3) rings.push(ring);
    }

    // 4. HARD GUARD — the bbox centre is the site; a water ring containing it is refused BY NAME.
    //    A centre ON the shoreline (within `eps` of a ring edge) is not "in the water": the ring is
    //    bounded by the coast at the site, and even-odd on a boundary point is arbitrary — so the
    //    guard is skipped there, exactly as the pre-L-12911 `dCentre > eps` arm did.
    const centre: readonly [number, number] = [(w + e) / 2, (s + n) / 2];
    const eps = 1e-4 * Math.min(e - w, n - s);
    const kept = rings.filter((ring) => {
        if (!pointInRing(centre, ring)) return true;
        if (distPointToRing(centre, ring) <= eps) return true;
        refused.push({
            reason: 'land-centre',
            detail: `a ${ring.length}-vertex water ring contains the bbox centre (the site, ` +
                `${centre[1].toFixed(5)}, ${centre[0].toFixed(5)}) — dropped, not drawn.`,
        });
        return false;
    });
    return { rings: kept, refused, chains: chains.length, strands: strands.length, islands };
}

/**
 * §FEAT-FORMA-SEA-CONTEXT — the production entry: `buildSeaMask` plus ONE console line per refusal
 * reason, so a refused sea shows in the founder's console AS a refusal — never as a silent empty
 * (§CONTEXT-DATA-HONESTY). Returns the kept rings. Never throws.
 */
export function buildSeaMaskFromCoastline(
    ways: ReadonlyArray<ReadonlyArray<readonly [number, number]>>,
    bbox: Bbox,
): Array<Array<readonly [number, number]>> {
    const result = buildSeaMask(ways, bbox);
    if (result.refused.length > 0) {
        const seen = new Set<string>();
        for (const r of result.refused) {
            if (seen.has(r.reason)) continue;
            seen.add(r.reason);
            const count = result.refused.filter((x) => x.reason === r.reason).length;
            console.warn(
                `[gis] §SEA-LEFT-HAND-WALK (L-12911) sea mask REFUSED (${r.reason}${count > 1 ? ` ×${count}` : ''}): ` +
                    `${r.detail} chains=${result.chains} strands=${result.strands} kept=${result.rings.length}.`,
            );
        }
    }
    return result.rings;
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
    // §SEA-BAKE-POLYGONS — the baked `sea` layer is read BESIDE the water layer (both cached per tile;
    // an unpublished sea archive costs one 404 per session — §CTX-KNOWN-MISSING). Polygons present ⇒
    // the sea is theirs, no walk. Empty / disabled / unavailable ⇒ the walk over the coastline lines,
    // exactly as before, so a region without a baked sea degrades to yesterday's path, not to nothing.
    const [tiled, seaTiled] = await Promise.all([
        readContextTileFeatures('water', bbox, signal),
        readContextTileFeatures('sea', bbox, signal),
    ]);
    if (tiled.status === 'ok') {
        if (seaTiled.status === 'aborted') return emptyWaterCollection(); // §L-579 — never cache a cancelled read.
        const seaPolygons = seaTiled.status === 'ok' && seaTiled.features.length > 0 ? seaTiled.features : null;
        const collection = waterFromTileFeatures(tiled.features, bbox, seaPolygons);
        cache.set(key, collection);
        const seaWhy = seaPolygons
            ? `${seaPolygons.length} baked sea polygon(s) from ${seaTiled.tilesRead} sea tile(s) — no coastline walk`
            : seaTiled.status === 'ok'
                ? 'sea layer read OK but EMPTY here (not baked for this region, or inland) → coastline walk'
                : `sea layer ${seaTiled.status}${seaTiled.status === 'unavailable' ? ` (${seaTiled.reason})` : ''} → coastline walk`;
        console.log(
            `[gis] §CTX-PMTILES-READER water: ${collection.areas.length} area(s) + ` +
                `${collection.ways.length} waterway(s) + ${collection.sea.length} sea surface(s) [${seaWhy}] from ` +
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
