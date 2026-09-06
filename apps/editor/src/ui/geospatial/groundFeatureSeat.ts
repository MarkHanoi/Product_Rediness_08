// §GROUND-DRAPE-ON-RELIEF (L-12924, founder Lisbon Baixa 2026-09-05: "the grey layer (urban
// landuse) and probably others is CUTTING the buildings — not set on the correct height").
//
// THE DEFECT. The 3D-Site (Forma) ground-context layers — landuse, parks, roads, rail, water,
// sea — are flat features seated by ONE scalar `height` (C12 §12.3). Every loader wrote
// `formaTerrainBaseHeight + <ladder offset>` and `reseatContextGroundFeaturesForBase` rewrote
// exactly that ONE number into every entity ("1413 road/park/water entity(ies) lifted onto
// settled ground (base 71.0 m)"). The context BUILDINGS, by contrast, are seated PER FOOTPRINT
// ("sampleTerrainMostDetailed resolved 6349/6349 real ground heights"). On a hillside the two
// disagree by the relief: Lisbon's Baixa sits ~10 m orthometric and Chiado ~90 m, so a drape at
// the parcel-centroid base floats tens of metres ABOVE the ground downhill — a grey plane through
// the buildings — and sits UNDER it uphill. The same shape is latent in Madrid, Zürich and Sète.
//
// THE RULE THIS FILE OWNS. C12 §12.3 says every layer MUST carry an absolute scalar and be
// re-seatable; the honest extension on relief is a PER-FEATURE scalar: each feature seats on the
// terrain sampled at ITS OWN representative point (polygon centroid / corridor midpoint), with the
// §12.4 ladder offset applied RELATIVE TO THAT HEIGHT. A feature whose own extent spans more relief
// than a ladder offset can hide (`GROUND_DRAPE_RELIEF_SPLIT_M`) is SPLIT into pieces — grid cells
// for a polygon, length-bounded segments for a corridor — each seated on its own sample, so the
// drape follows the hill as a staircase of flat pieces instead of one tilted-in-space plane.
//
// WHY NOT `CLAMP_TO_GROUND` (a Cesium GroundPrimitive). L-635 recorded "clampToGround renders
// nothing on baked terrain" and attributed it to `depthTestAgainstTerrain=false`. That attribution
// is REFUTED BY THE SHIPPED CESIUM SOURCE, and the two lines are quoted so the next reader re-reads
// them rather than this sentence (`node_modules/cesium/Build/CesiumUnminified/Cesium.js`, 1.143.0,
// MEASURED 2026-09-05):
//   · **248276** `const clearGlobeDepth = ... = defined(globe) && globe.show && (!globe.depthTestAgainstTerrain || mode === SCENE2D);`
//     — the depth CLEAR that flag triggers is itself gated on `globe.show`, so with the globe hidden
//     it never runs at all.
//   · **247764–247781** `globeDepth.executeCopyDepth(...)` → `performPass(frustumCommands, Pass.TERRAIN_CLASSIFICATION)`
//     → `if (clearGlobeDepth) { clearDepth.execute(...) }` — the classification pass runs BEFORE that
//     clear and is guarded only by `!renderTranslucentDepthForPick`.
// So `depthTestAgainstTerrain=false` does not starve classification. What starves it is a HIDDEN
// globe: with `globe.show=false` the GLOBE pass contributes no depth for the classification pass to
// paint into — and `globe.show=false` is exactly what Forma held when L-635 was measured (it is also
// why `globe.getHeight` returned garbage there, §CTX-PERFOOTPRINT-SAMPLE). With the globe now shown
// under relief (§TERRAIN-NORMALS) clamping is plausible BY CODE PATH — but one field observation
// (L-11840, heatmap invisible with the globe shown) is not explained by that reading, and NOTHING
// here is browser-verified. So this lane ships the per-feature scalar + split and does NOT wire
// clamping: evaluated, cited, not shipped. Wiring it needs a browser session, not another re-read.
//
// Pure: no Cesium, no DOM. The viewport executes these verdicts; the tests pin them.
import { ringCentroidLatLon } from './globeGroundAnchor';

export interface LatLon { readonly lat: number; readonly lon: number }
/** GeoJSON order — longitude FIRST — the shape every context loader carries. */
export type LonLat = readonly [number, number];

/** The ground-context layers governed by C12 §12. */
export type GroundLayer = 'landuse' | 'parks' | 'roads' | 'rail' | 'sea' | 'water';

/**
 * C12 §12.4 — the ONE declared stacking ladder, in metres above the feature's OWN ground:
 * landuse < parks < roads = sea < rail < water. `reseatContextGroundFeaturesForBase` carries the
 * same literals (it is the owner §12.4 names); `groundFeatureSeat.spec.ts` asserts the two agree.
 * `rail` sits a hair above roads (tracks read over the street grid at crossings, §FORMA-CTX-RAIL).
 */
export const GROUND_LAYER_OFFSET_M: Readonly<Record<GroundLayer, number>> = Object.freeze({
    landuse: 0.005,
    parks: 0.01,
    roads: 0.02,
    sea: 0.02,
    rail: 0.022,
    water: 0.03,
});

/** A feature whose own extent spans MORE relief than this is split into pieces; below it, one
 *  seat at the representative point is within the tolerance a person reads as "on the ground". */
export const GROUND_DRAPE_RELIEF_SPLIT_M = 3;
/** CEILING on the edge of a polygon grid cell / corridor segment when a feature is split — the
 *  piece length used when the feature's relief is not measurable. `drapePieceLengthM` shortens it
 *  on a steep feature; see there for why a FIXED 60 m is not good enough. */
export const GROUND_DRAPE_SPLIT_PIECE_M = 60;
/** FLOOR on the piece edge. Below this the entity count buys nothing a viewer can see, and a road
 *  ribbon becomes more joins than road. */
export const GROUND_DRAPE_MIN_PIECE_M = 15;

/**
 * The piece edge for a feature that IS being split, chosen so each piece's OWN residual relief
 * lands near `GROUND_DRAPE_RELIEF_SPLIT_M` — the same 3 m this module already calls "close enough
 * to read as on the ground".
 *
 * ⭐ WHY THIS EXISTS. A FIXED 60 m piece is internally inconsistent with the split threshold it
 * serves: we declare 3 m the tolerance, then cut a Lisbon-grade 10 % slope into 60 m pieces whose
 * own residual is ~6 m — twice the tolerance we just declared. The founder's complaint is VISUAL,
 * and a staircase with 6 m risers under a road ribbon is a new visual defect, not a fix. So the
 * piece length scales with the MEASURED slope: `span × (tolerance / relief)`, clamped to
 * [`GROUND_DRAPE_MIN_PIECE_M`, `GROUND_DRAPE_SPLIT_PIECE_M`]. A gentle feature keeps long pieces
 * (few entities); a cliff gets short ones. The splitters still enforce
 * `GROUND_DRAPE_MAX_PIECES_PER_FEATURE` on top, so this can never explode the entity count — it
 * only ever asks for pieces the cap may then coarsen.
 *
 * `spanM` is the feature's characteristic length (corridor length / polygon bbox diagonal).
 * Unmeasured relief (null) or a degenerate span returns the ceiling: we do not multiply entities
 * on a guess (§CONTEXT-DATA-HONESTY — UNKNOWN is not ZERO, and it is not "steep" either).
 */
export function drapePieceLengthM(spanM: number, reliefRangeM: number | null): number {
    if (typeof reliefRangeM !== 'number' || !Number.isFinite(reliefRangeM) || reliefRangeM <= GROUND_DRAPE_RELIEF_SPLIT_M) {
        return GROUND_DRAPE_SPLIT_PIECE_M;
    }
    if (!Number.isFinite(spanM) || spanM <= 0) return GROUND_DRAPE_SPLIT_PIECE_M;
    const wanted = spanM * (GROUND_DRAPE_RELIEF_SPLIT_M / reliefRangeM);
    return Math.min(GROUND_DRAPE_SPLIT_PIECE_M, Math.max(GROUND_DRAPE_MIN_PIECE_M, wanted));
}
/** Hard cap on pieces per feature — a city-wide landuse polygon must not become 10 000 entities.
 *  The cell edge is grown until the count fits. */
export const GROUND_DRAPE_MAX_PIECES_PER_FEATURE = 400;

/**
 * §DRAPE-LAYER-BUDGET (L-12989, founder Nürnberg 2026-09-06: "the time it takes to render 3d view
 * once the parcel is selected is massive").
 *
 * ⭐ THE DEFECT THIS CLOSES, IN THE FOUNDER'S OWN NUMBERS. `GROUND_DRAPE_MAX_PIECES_PER_FEATURE`
 * above is a PER-FEATURE cap and, until this constant existed, it was the ONLY cap anywhere in the
 * drape. So 688 land-use polygons, EVERY ONE of them individually inside its 400-piece budget,
 * summed to **36 012 pieces and 48 942 sampled terrain points** for one layer:
 *     `§FORMA-CTX-LANDUSE rendered: 37923 piece(s) of 2599 area(s) … 688 split (>3 m relief) into
 *      36012 piece(s); 48942 terrain point(s) in 2 batch round-trip(s), 15700 ms`
 * A per-item budget with no total is not a budget — it is a rate, and a rate times a crowd is
 * unbounded. Every other layer then queued behind that one in the shared sampler FIFO
 * (§GROUND-SAMPLE-ONE-FLIGHT-AT-A-TIME): parks reported `15637 ms waiting for terrain, 10 ms own
 * work`, rail `15656 ms waiting, 7 ms own work`.
 *
 * ⛔ WHAT THE BUDGET MAY NOT BUY. A feature beyond it falls back to its WHOLE-FEATURE per-feature
 * seat — the L-12924 seat, still its own sampled ground, just not subdivided. It is NEVER dropped,
 * NEVER decimated to a flat layer scalar, and the FLAT/KEYLESS path never reaches this code at all.
 * Reverting relief seating to one scalar per layer is the buried-drape defect L-12924 exists to
 * remove, and is the one fix this lane is forbidden (§CONTEXT-DATA-HONESTY: coarser is honest,
 * fabricated is not).
 *
 * NEAREST-FIRST, because the budget has to be spent where the founder is looking. The pieces that
 * survive are the ones nearest the site; the ones that coarsen are at the far edge of the
 * `CONTEXT_WIDE_HALF_DEG` extent, where a 60 m cell subtends a pixel anyway.
 */
export const GROUND_DRAPE_MAX_PIECES_PER_LAYER = 6000;
/**
 * §DRAPE-LAYER-BUDGET — the companion ceiling on the RELIEF-PROBE batch (3–5 points per feature,
 * `featureReliefProbePoints`), which is the OTHER half of the founder's 48 942: 2 599 areas × ~5
 * probes = **12 930 points before a single piece is cut**. A feature beyond this ceiling is probed
 * at its SEAT POINT ONLY (one point), so it still seats on its own measured ground; what it loses
 * is the relief MEASUREMENT, which `reliefRangeM` then honestly reports as `null` = UNKNOWN, and
 * `decideDrapeStrategy` already refuses to split on unknown relief ("we do not multiply entities on
 * a guess"). So the degraded path is one that already existed and is already tested.
 */
export const GROUND_DRAPE_MAX_PROBE_POINTS_PER_LAYER = 9000;

/** Straight-line ground distance in metres between two lat/lons, in the same local
 *  equirectangular frame the cell grid uses. Non-finite input → `Infinity` (sorts LAST, i.e. a
 *  feature we cannot place is the first to lose its budget, never the first to win it). */
export function groundDistanceM(a: LatLon, b: LatLon): number {
    if (!a || !b || !Number.isFinite(a.lat) || !Number.isFinite(a.lon) || !Number.isFinite(b.lat) || !Number.isFinite(b.lon)) {
        return Number.POSITIVE_INFINITY;
    }
    const [x, y] = lonLatToLocalM([b.lon, b.lat], a);
    return Math.hypot(x, y);
}

/** One feature bidding for a share of a layer-wide budget. `cost` is what granting it would spend
 *  (pieces, or probe points); `distanceM` is how far its seat is from the site. */
export interface DrapeBudgetCandidate {
    readonly index: number;
    readonly distanceM: number;
    readonly cost: number;
}

export interface DrapeBudgetVerdict {
    /** Feature indices granted their full cost. */
    readonly granted: ReadonlySet<number>;
    /** Total cost granted — never above `budget`. */
    readonly spent: number;
    /** Features that bid and lost. */
    readonly denied: number;
    /** What they would have cost — the number this budget actually removed. */
    readonly deniedCost: number;
}

/**
 * §DRAPE-LAYER-BUDGET — spend one layer-wide budget NEAREST FIRST.
 *
 * Greedy, sorted by distance ascending (ties by index, so the verdict is deterministic and a test
 * can pin it). A bid that does not fit is SKIPPED, not a stop: the scan continues, so a single
 * expensive near feature cannot strand the whole remaining budget, and the cheap near features
 * behind it still get their pieces. A zero/negative/non-finite cost buys nothing and is not
 * granted (there is nothing to grant).
 *
 * ⚠ It is a CEILING, not a target. A layer whose bids all fit spends less and grants everything —
 * which is what a flat city does, and why this cannot slow the common case down.
 */
export function spendDrapeBudgetNearestFirst(
    candidates: ReadonlyArray<DrapeBudgetCandidate>,
    budget: number,
): DrapeBudgetVerdict {
    const order = candidates.slice().sort((a, b) => {
        const da = Number.isFinite(a.distanceM) ? a.distanceM : Number.POSITIVE_INFINITY;
        const db = Number.isFinite(b.distanceM) ? b.distanceM : Number.POSITIVE_INFINITY;
        return da === db ? a.index - b.index : da - db;
    });
    const granted = new Set<number>();
    let spent = 0;
    let denied = 0;
    let deniedCost = 0;
    const cap = Number.isFinite(budget) && budget > 0 ? budget : 0;
    for (const c of order) {
        const cost = Number.isFinite(c.cost) && c.cost > 0 ? c.cost : 0;
        if (cost === 0) continue;
        if (spent + cost <= cap) { granted.add(c.index); spent += cost; continue; }
        denied++;
        deniedCost += cost;
    }
    return { granted, spent, denied, deniedCost };
}

const M_PER_DEG_LAT = 110_574;
const M_PER_DEG_LON_EQUATOR = 111_320;

/** Local equirectangular metres about `origin` — accurate to well under a metre across a city
 *  block, which is all the cell grid needs. Pure and invertible (`localToLonLat`). */
export function lonLatToLocalM(p: LonLat, origin: LatLon): readonly [number, number] {
    const kx = M_PER_DEG_LON_EQUATOR * Math.cos((origin.lat * Math.PI) / 180);
    return [(p[0] - origin.lon) * kx, (p[1] - origin.lat) * M_PER_DEG_LAT];
}
export function localToLonLat(xy: readonly [number, number], origin: LatLon): LonLat {
    const kx = M_PER_DEG_LON_EQUATOR * Math.cos((origin.lat * Math.PI) / 180);
    return [origin.lon + xy[0] / kx, origin.lat + xy[1] / M_PER_DEG_LAT];
}

/** The polygon's representative seat point — the SAME vertex-mean centroid rule the context
 *  buildings are ground-sampled at (`ringCentroidLatLon`), so a drape and the building on it
 *  read the same ground. Null when the ring has no finite vertex. */
export function polygonSeatPoint(ring: ReadonlyArray<LonLat>): LatLon | null {
    return ringCentroidLatLon(ring);
}

/** The feature's characteristic length in metres — corridor total length, or a ring's bounding-box
 *  diagonal — the `spanM` `drapePieceLengthM` divides by. 0 for a degenerate feature. */
export function featureSpanM(coords: ReadonlyArray<LonLat>, kind: 'polygon' | 'corridor'): number {
    const pts = coords.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
    if (pts.length < 2) return 0;
    const origin = { lat: pts[0]![1], lon: pts[0]![0] };
    if (kind === 'corridor') {
        const cum = cumulativeLengthsM(pts, origin);
        return cum[cum.length - 1]!;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
        const [x, y] = lonLatToLocalM(p, origin);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return Math.hypot(maxX - minX, maxY - minY);
}

/** Cumulative length (metres) along a corridor's vertices. */
function cumulativeLengthsM(coords: ReadonlyArray<LonLat>, origin: LatLon): number[] {
    const out: number[] = [0];
    let acc = 0;
    let prev = lonLatToLocalM(coords[0]!, origin);
    for (let i = 1; i < coords.length; i++) {
        const cur = lonLatToLocalM(coords[i]!, origin);
        acc += Math.hypot(cur[0] - prev[0], cur[1] - prev[1]);
        out.push(acc);
        prev = cur;
    }
    return out;
}

/** The corridor's representative seat point — the point at HALF its length (interpolated on the
 *  segment that crosses the midpoint), not the middle vertex: a road with one long straight and
 *  many short bends would otherwise seat at the bendy end. Null for fewer than one finite vertex. */
export function corridorSeatPoint(coords: ReadonlyArray<LonLat>): LatLon | null {
    const pts = coords.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
    if (pts.length === 0) return null;
    if (pts.length === 1) return { lat: pts[0]![1], lon: pts[0]![0] };
    const origin = { lat: pts[0]![1], lon: pts[0]![0] };
    const cum = cumulativeLengthsM(pts, origin);
    const half = cum[cum.length - 1]! / 2;
    for (let i = 1; i < pts.length; i++) {
        if (cum[i]! >= half) {
            const segLen = cum[i]! - cum[i - 1]!;
            const t = segLen > 0 ? (half - cum[i - 1]!) / segLen : 0;
            const a = pts[i - 1]!;
            const b = pts[i]!;
            return { lon: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t };
        }
    }
    const last = pts[pts.length - 1]!;
    return { lat: last[1], lon: last[0] };
}

/** 3–5 probe points across a feature, used ONLY to MEASURE its relief range (max−min of the
 *  sampled ground): the seat point plus up to four vertices spread evenly by index. De-duplicated
 *  so a triangle does not probe one corner twice. */
export function featureReliefProbePoints(
    coords: ReadonlyArray<LonLat>,
    seat: LatLon | null,
): LatLon[] {
    const pts = coords.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
    const out: LatLon[] = [];
    const seen = new Set<string>();
    const push = (p: LatLon): void => {
        const k = `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`;
        if (seen.has(k)) return;
        seen.add(k);
        out.push(p);
    };
    if (seat) push(seat);
    if (pts.length === 0) return out;
    // A closed ring repeats its first vertex; spread over the distinct vertices.
    const n = pts.length > 1 && pts[0]![0] === pts[pts.length - 1]![0] && pts[0]![1] === pts[pts.length - 1]![1]
        ? pts.length - 1 : pts.length;
    const picks = n <= 4 ? Array.from({ length: n }, (_, i) => i) : [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)];
    for (const i of picks) { const p = pts[i]!; push({ lat: p[1], lon: p[0] }); }
    return out.slice(0, 5);
}

/** max−min over the FINITE samples; null when fewer than two points measured (relief UNKNOWN —
 *  which is not the same value as "flat", C84 EI-6 / §CONTEXT-DATA-HONESTY). */
export function reliefRangeM(heights: ReadonlyArray<number | null | undefined>): number | null {
    let lo = Infinity;
    let hi = -Infinity;
    let n = 0;
    for (const h of heights) {
        if (typeof h === 'number' && Number.isFinite(h)) { n++; if (h < lo) lo = h; if (h > hi) hi = h; }
    }
    return n >= 2 ? hi - lo : null;
}

export type DrapeStrategy = 'single' | 'split';

/** Split only when relief is attached AND the feature MEASURED more relief than the tolerance.
 *  Unknown relief (null) keeps a single seat: we do not multiply entities on a guess. */
export function decideDrapeStrategy(input: { reliefAttached: boolean; reliefRangeM: number | null }): DrapeStrategy {
    if (!input.reliefAttached) return 'single';
    return typeof input.reliefRangeM === 'number' && input.reliefRangeM > GROUND_DRAPE_RELIEF_SPLIT_M ? 'split' : 'single';
}

export type GroundSeatSource = 'flat-base' | 'per-feature' | 'base-fallback';

export interface GroundSeatInput {
    /** `groundReliefAttached()` — a real baked terrain provider is on the viewer. */
    readonly reliefAttached: boolean;
    /** The settled base to fall back to (the flat base, or the SAFE base under relief). */
    readonly baseM: number;
    readonly layer: GroundLayer;
    /** The terrain height sampled at the feature's OWN seat point; non-finite = not measured. */
    readonly groundAtPointM: number | null | undefined;
}

/**
 * THE seat decision. Flat / keyless: `base + ladder` — byte-identical to the pre-L-12924
 * behaviour (base 0, one scalar for the whole layer). Relief attached: the feature's OWN ground
 * + ladder when measured; the safe base + ladder when not (never a stray 0 — the L-259 rule).
 */
export function decideGroundFeatureSeat(input: GroundSeatInput): { heightM: number; source: GroundSeatSource } {
    const offset = GROUND_LAYER_OFFSET_M[input.layer];
    if (!input.reliefAttached) return { heightM: input.baseM + offset, source: 'flat-base' };
    const g = input.groundAtPointM;
    if (typeof g === 'number' && Number.isFinite(g)) return { heightM: g + offset, source: 'per-feature' };
    return { heightM: input.baseM + offset, source: 'base-fallback' };
}

/** Sutherland–Hodgman clip of a (possibly concave) subject polygon against one axis-aligned
 *  rectangle in local metres. The clip window is convex, so the result is correct for any
 *  simple subject (a concave subject may yield zero-width bridges — harmless for a flat drape). */
export function clipPolygonToRect(
    poly: ReadonlyArray<readonly [number, number]>,
    minX: number, minY: number, maxX: number, maxY: number,
): Array<readonly [number, number]> {
    type P = readonly [number, number];
    let out: P[] = poly.slice();
    const clipEdge = (inside: (p: P) => boolean, intersect: (a: P, b: P) => P): void => {
        const input = out;
        out = [];
        if (input.length === 0) return;
        let prev = input[input.length - 1]!;
        for (const cur of input) {
            const curIn = inside(cur);
            const prevIn = inside(prev);
            if (curIn) {
                if (!prevIn) out.push(intersect(prev, cur));
                out.push(cur);
            } else if (prevIn) {
                out.push(intersect(prev, cur));
            }
            prev = cur;
        }
    };
    const atX = (x: number) => (a: P, b: P): P => {
        const t = (x - a[0]) / (b[0] - a[0]);
        return [x, a[1] + (b[1] - a[1]) * t];
    };
    const atY = (y: number) => (a: P, b: P): P => {
        const t = (y - a[1]) / (b[1] - a[1]);
        return [a[0] + (b[0] - a[0]) * t, y];
    };
    clipEdge((p) => p[0] >= minX, atX(minX));
    clipEdge((p) => p[0] <= maxX, atX(maxX));
    clipEdge((p) => p[1] >= minY, atY(minY));
    clipEdge((p) => p[1] <= maxY, atY(maxY));
    return out;
}

function shoelaceArea(poly: ReadonlyArray<readonly [number, number]>): number {
    let a = 0;
    for (let i = 0, n = poly.length; i < n; i++) {
        const p = poly[i]!;
        const q = poly[(i + 1) % n]!;
        a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a) / 2;
}

/**
 * Split a [lon,lat] ring into axis-aligned grid cells of ~`pieceM` edge (grown until the count
 * fits `GROUND_DRAPE_MAX_PIECES_PER_FEATURE`), each returned as a CLOSED [lon,lat] ring under
 * `coords` — the SAME field name `splitCorridorIntoSegments` returns, because the viewport consumes
 * both through one `piece.coords` path. It returned `ring` until the lane typecheck caught it: the
 * consumer read `p.coords`, got `undefined`, and every SPLIT polygon threw inside the per-piece
 * try/catch and vanished — i.e. the grey landuse would have DISAPPEARED on exactly the Lisbon slope
 * this lane exists to fix. Two names for one field is a defect factory; there is now one name. Cells with < 1 m² of the polygon are dropped (clip slivers). A ring that fits in
 * one cell comes back as itself — the caller then has nothing to split.
 */
export function splitRingIntoGridCells(
    ring: ReadonlyArray<LonLat>,
    pieceM: number = GROUND_DRAPE_SPLIT_PIECE_M,
): Array<{ coords: LonLat[]; seat: LatLon }> {
    const grid = ringDrapeGrid(ring, pieceM);
    if (!grid) return [];
    const { origin, x0, y0, cell, nx, ny } = grid;
    const open = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
        ? ring.slice(0, -1) : ring.slice();
    const local = open.map((p) => lonLatToLocalM(p, origin));
    const out: Array<{ coords: LonLat[]; seat: LatLon }> = [];
    for (let ix = 0; ix < nx; ix++) {
        // ⚠ `x0 + ix * cell`, NOT an accumulating `gx += cell`. Two neighbouring cells must agree
        // on their shared edge BIT FOR BIT — accumulation drifts in the last places, and both the
        // budget's piece ESTIMATE (`ringDrapeGrid`) and anything keyed on a lattice coordinate
        // have to reproduce exactly the edge this loop cut.
        const gx = x0 + ix * cell;
        for (let iy = 0; iy < ny; iy++) {
            const gy = y0 + iy * cell;
            const clipped = clipPolygonToRect(local, gx, gy, gx + cell, gy + cell);
            if (clipped.length < 3 || shoelaceArea(clipped) < 1) continue;
            const lonlat = clipped.map((p) => localToLonLat(p, origin));
            lonlat.push(lonlat[0]!);
            const seat = polygonSeatPoint(lonlat);
            if (!seat) continue;
            out.push({ coords: lonlat, seat });
        }
    }
    return out;
}

/**
 * The axis-aligned metric lattice `splitRingIntoGridCells` cuts a ring on — extracted so the piece
 * COUNT can be predicted (`estimateSplitPieceCount`) without paying for every Sutherland–Hodgman
 * clip, which is what a layer-wide budget has to do before it decides whom to grant.
 *
 * `nx` / `ny` are the cell counts the splitter actually ITERATES, measured from the SNAPPED origin
 * (`x0`/`y0`) rather than from the bbox — the snap can add one column and one row, and a budget
 * that under-counted would be a budget that overspends.
 *
 * Null for a ring with no finite vertex or fewer than three distinct ones.
 */
export interface DrapeGrid {
    readonly origin: LatLon;
    readonly x0: number;
    readonly y0: number;
    readonly cell: number;
    readonly nx: number;
    readonly ny: number;
}
export function ringDrapeGrid(
    ring: ReadonlyArray<LonLat>,
    pieceM: number = GROUND_DRAPE_SPLIT_PIECE_M,
): DrapeGrid | null {
    const origin = polygonSeatPoint(ring);
    if (!origin) return null;
    const open = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
        ? ring.slice(0, -1) : ring.slice();
    if (open.length < 3) return null;
    const local = open.map((p) => lonLatToLocalM(p, origin));
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of local) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
    let cell = Math.max(1, pieceM);
    // Grow the cell until the grid is bounded — a city-wide polygon must not explode the entity count.
    for (;;) {
        const nx = Math.ceil((maxX - minX) / cell) || 1;
        const ny = Math.ceil((maxY - minY) / cell) || 1;
        if (nx * ny <= GROUND_DRAPE_MAX_PIECES_PER_FEATURE) break;
        cell *= 1.5;
    }
    const x0 = Math.floor(minX / cell) * cell;
    const y0 = Math.floor(minY / cell) * cell;
    return {
        origin,
        x0,
        y0,
        cell,
        nx: Math.max(1, Math.ceil((maxX - x0) / cell)),
        ny: Math.max(1, Math.ceil((maxY - y0) / cell)),
    };
}

/**
 * §DRAPE-LAYER-BUDGET — an UPPER BOUND on the pieces splitting this feature would produce, cheap
 * enough to run on every feature of a 2 599-area layer before any of them is actually split.
 *
 * Polygons: the lattice cell count. It is an OVER-estimate, because the splitter drops cells that
 * hold less than 1 m² of the polygon — deliberately so: a budget must never be able to overspend,
 * and an L-shaped park bidding for its bounding box and using half of it leaves headroom rather
 * than borrowing it. Corridors: exact (`splitCorridorIntoSegments`' own `nPieces`).
 */
export function estimateSplitPieceCount(
    coords: ReadonlyArray<LonLat>,
    kind: 'polygon' | 'corridor',
    pieceM: number = GROUND_DRAPE_SPLIT_PIECE_M,
): number {
    if (kind === 'corridor') {
        const pts = coords.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
        if (pts.length < 2) return 0;
        const total = cumulativeLengthsM(pts, { lat: pts[0]![1], lon: pts[0]![0] });
        const len = total[total.length - 1]!;
        return Math.max(1, Math.min(GROUND_DRAPE_MAX_PIECES_PER_FEATURE, Math.ceil(len / Math.max(1, pieceM))));
    }
    const grid = ringDrapeGrid(coords, pieceM);
    return grid ? grid.nx * grid.ny : 0;
}

/**
 * Split a corridor's centre-line into consecutive pieces of at most ~`pieceM` length. Pieces SHARE
 * their boundary vertex so the ribbons stay joined; each carries its own midpoint seat. A line
 * shorter than one piece comes back as one piece.
 */
export function splitCorridorIntoSegments(
    coords: ReadonlyArray<LonLat>,
    pieceM: number = GROUND_DRAPE_SPLIT_PIECE_M,
): Array<{ coords: LonLat[]; seat: LatLon }> {
    const pts = coords.filter((p) => Number.isFinite(p?.[0]) && Number.isFinite(p?.[1]));
    if (pts.length < 2) return [];
    const origin = { lat: pts[0]![1], lon: pts[0]![0] };
    const cum = cumulativeLengthsM(pts, origin);
    const total = cum[cum.length - 1]!;
    const nPieces = Math.max(1, Math.min(GROUND_DRAPE_MAX_PIECES_PER_FEATURE, Math.ceil(total / Math.max(1, pieceM))));
    const pieceLen = total / nPieces;
    const out: Array<{ coords: LonLat[]; seat: LatLon }> = [];
    let cur: LonLat[] = [pts[0]!];
    let nextCut = pieceLen;
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]!;
        const b = pts[i]!;
        const segStart = cum[i - 1]!;
        const segEnd = cum[i]!;
        // Emit a cut at every piece boundary that falls strictly inside this segment.
        while (nextCut < segEnd - 1e-6 && out.length < nPieces - 1) {
            const t = (nextCut - segStart) / (segEnd - segStart);
            const cut: LonLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
            cur.push(cut);
            const seat = corridorSeatPoint(cur);
            if (seat) out.push({ coords: cur, seat });
            cur = [cut];
            nextCut += pieceLen;
        }
        cur.push(b);
    }
    if (cur.length >= 2) {
        const seat = corridorSeatPoint(cur);
        if (seat) out.push({ coords: cur, seat });
    }
    return out;
}
