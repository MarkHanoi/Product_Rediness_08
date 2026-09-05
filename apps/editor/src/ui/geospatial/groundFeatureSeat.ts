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
// nothing on baked terrain" and attributed it to `depthTestAgainstTerrain=false`. Re-read against
// cesium 1.143 `Scene.executeCommands` (see the lane record in ISSUE-LOG L-12924): the globe depth
// is COPIED (`globeDepth.executeCopyDepth`) and the TERRAIN_CLASSIFICATION pass runs BEFORE the
// `clearGlobeDepth` clear that `depthTestAgainstTerrain=false` triggers — so the depth flag does
// not starve classification; a HIDDEN globe does (`globe.show=false`, which Forma held when L-635
// was measured). With the globe now shown under relief (§TERRAIN-NORMALS) clamping is plausible by
// code path, but one field observation (L-11840, heatmap invisible with the globe shown) is not
// explained by that reading and nothing here is browser-verified — so this lane ships the
// per-feature scalar + split, and does NOT wire clamping (evaluated, recorded, not shipped).
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
/** Target edge of a polygon grid cell / corridor segment when a feature is split. 60 m at a
 *  Lisbon-grade 10 % slope is ~6 m of relief per piece — still a visible step, but a step on the
 *  ground rather than a plane through the neighbourhood. */
export const GROUND_DRAPE_SPLIT_PIECE_M = 60;
/** Hard cap on pieces per feature — a city-wide landuse polygon must not become 10 000 entities.
 *  The cell edge is grown until the count fits. */
export const GROUND_DRAPE_MAX_PIECES_PER_FEATURE = 400;

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
 * fits `GROUND_DRAPE_MAX_PIECES_PER_FEATURE`), each returned as a CLOSED [lon,lat] ring with its
 * own seat point. Cells with < 1 m² of the polygon are dropped (clip slivers). A ring that fits in
 * one cell comes back as itself — the caller then has nothing to split.
 */
export function splitRingIntoGridCells(
    ring: ReadonlyArray<LonLat>,
    pieceM: number = GROUND_DRAPE_SPLIT_PIECE_M,
): Array<{ ring: LonLat[]; seat: LatLon }> {
    const origin = polygonSeatPoint(ring);
    if (!origin) return [];
    const open = ring.length > 1 && ring[0]![0] === ring[ring.length - 1]![0] && ring[0]![1] === ring[ring.length - 1]![1]
        ? ring.slice(0, -1) : ring.slice();
    const local = open.map((p) => lonLatToLocalM(p, origin));
    if (local.length < 3) return [];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of local) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
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
    const out: Array<{ ring: LonLat[]; seat: LatLon }> = [];
    for (let gx = x0; gx < maxX; gx += cell) {
        for (let gy = y0; gy < maxY; gy += cell) {
            const clipped = clipPolygonToRect(local, gx, gy, gx + cell, gy + cell);
            if (clipped.length < 3 || shoelaceArea(clipped) < 1) continue;
            const lonlat = clipped.map((p) => localToLonLat(p, origin));
            lonlat.push(lonlat[0]!);
            const seat = polygonSeatPoint(lonlat);
            if (!seat) continue;
            out.push({ ring: lonlat, seat });
        }
    }
    return out;
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
