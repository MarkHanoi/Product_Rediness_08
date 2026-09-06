// §STREET-LIFE (L-12936, founder 2026-09-05: "would it be possible to add everywhere pedestrians but
// also street lighting etc?") — PURE placement of street lamps and pedestrians for the Forma 3D Site.
//
// TWO KINDS OF OBJECT, AND THE DISTINCTION IS THE POINT (§CONTEXT-DATA-HONESTY, C57 §1.5/§1.9,
// C58 §1.2):
//   • MAPPED lamps come from the baked `furniture` tile layer (OSM `highway=street_lamp` nodes) and
//     are placed AS-IS — `synthetic: false`. They are data.
//   • SYNTHESISED lamps and ALL pedestrians are SCENERY — `synthetic: true` — generated along the road
//     ribbons by the deterministic rules below. They are never presented as data: the console line
//     (`streetLifeLogLine`) counts mapped and synthesised objects SEPARATELY, and a way that already
//     carries a mapped lamp within `LAMP_MAPPED_EXCLUSION_M` gets NO synthesised lamp, so a
//     well-mapped street keeps its real lamp positions and an unmapped one gets scenery.
//
// DETERMINISM: every jitter, side choice, heading and palette index derives from a 32-bit integer
// hash of (way osmId, index). No `Math.random`, no `Date` — the same inputs place the same objects
// on every load, so a settled-base rebuild (`rebuildStreetLifeForBase`) reproduces the scene.
//
// GEOMETRY: a local equirectangular frame around the site origin (metres east/north), the same
// approximation `formaGroundColour.nearestVertexM` uses. Ways are walked by arc length; each object
// sits on the LEFT or RIGHT of the centre-line at half the ribbon width + a kerb offset, using the
// SAME class → width table the renderer draws the ribbons with (`roadRibbonWidthM`, pinned by spec
// to `CesiumViewport.roadWidthM`).
//
// Pure: no Cesium, no DOM, no network — testable. Layering: apps/editor (L7) importing a type from a
// sibling loader and a helper from formaGroundColour.ts (both apps/editor).

import type { ContextWay } from './contextRoads';
import { pointInRing, URBAN_NEAR_M, type LanduseAreaLike } from './formaGroundColour';

// ── Tunables (all exported so the spec asserts against the shipped values, never a copy) ──────────

/** Synthesised lamp spacing along a road way. */
export const LAMP_SPACING_M = 30;
/** Synthesised lamps stand this far OUTSIDE the ribbon edge (on the kerb). */
export const LAMP_EDGE_OFFSET_M = 1.2;
/** A way with a MAPPED lamp within this distance gets NO synthesised lamps (the data wins). */
export const LAMP_MAPPED_EXCLUSION_M = 60;
/** Per-lamp along-way jitter amplitude (± half of this) — breaks the metronome without moving a lamp
 *  off its ribbon. */
export const LAMP_JITTER_M = 4;
/** Road classes that receive synthesised lamps. Service roads, tracks and motorways do not. */
export const LAMP_ROAD_CLASSES: ReadonlySet<string> = new Set([
    'residential', 'living_street', 'tertiary', 'secondary', 'primary',
]);
/** Hard nearest-first cap on synthesised lamps (ADR-0094 budget; mapped lamps are not capped here). */
export const LAMP_SYNTHETIC_CAP = 1500;

/** Pedestrian ways walked along their centre-line. */
export const PEDESTRIAN_WAY_CLASSES: ReadonlySet<string> = new Set(['footway', 'pedestrian', 'path', 'steps']);
/** Road classes whose SIDEWALKS get pedestrians (offset half width + kerb). */
export const PEDESTRIAN_SIDEWALK_CLASSES: ReadonlySet<string> = new Set(['residential', 'tertiary']);
/** Sidewalk offset beyond the ribbon edge. */
export const PEDESTRIAN_SIDEWALK_OFFSET_M = 1.0;
/** One person per N metres of way, URBAN (inside / within URBAN_NEAR_M of an urban landuse polygon). */
export const PEDESTRIAN_URBAN_SPACING_M = 25;
/** One person per N metres of way, elsewhere. */
export const PEDESTRIAN_RURAL_SPACING_M = 80;
/** Hard nearest-first cap on pedestrians. */
export const PEDESTRIAN_CAP = 800;
/** Number of entries in the renderer's muted clothing palette; `palette` is always in [0, N). */
export const PEDESTRIAN_PALETTE_SIZE = 6;

// ── Types ────────────────────────────────────────────────────────────────────────────────────────

/** A lamp read from the baked `furniture` layer — DATA. */
export interface MappedLamp {
    readonly lon: number;
    readonly lat: number;
    readonly osmId: number;
}

export interface StreetLamp {
    readonly lon: number;
    readonly lat: number;
    /** FALSE = mapped (data, placed as-is). TRUE = synthesised scenery. */
    readonly synthetic: boolean;
    /** The mapped lamp's tile id, or the road way's osmId the lamp was synthesised along. */
    readonly osmId: number;
    /** Metres from the site origin (nearest-first ordering is by this). */
    readonly distM: number;
}

export interface StreetPedestrian {
    readonly lon: number;
    readonly lat: number;
    /** Always TRUE — every pedestrian is scenery. */
    readonly synthetic: true;
    /** Walking direction in the local ENU frame, radians counter-clockwise from east. */
    readonly headingRad: number;
    /** Clothing palette index in [0, PEDESTRIAN_PALETTE_SIZE). */
    readonly palette: number;
    /** The way this person walks along. */
    readonly wayOsmId: number;
    readonly distM: number;
}

export interface StreetLifeOrigin {
    readonly lat: number;
    readonly lon: number;
}

export interface PlaceLampsOptions {
    readonly origin: StreetLifeOrigin;
    /** Ways whose nearest vertex lies beyond this are skipped (default: unbounded). */
    readonly radiusM?: number;
    readonly spacingM?: number;
    readonly edgeOffsetM?: number;
    readonly mappedExclusionM?: number;
    readonly syntheticCap?: number;
}

export interface PlaceLampsResult {
    /** MAPPED lamps first, nearest-first (§MAPPED-LAMPS-NEAREST-FIRST), then synthesised lamps,
     *  also nearest-first. The caller caps by SLICING this array, so both halves must be ordered:
     *  mapped precede synthetic so DATA survives the cap, and each half is nearest-first so what
     *  survives is what is near the site. */
    readonly lamps: StreetLamp[];
    readonly mappedCount: number;
    readonly syntheticCount: number;
    /** Road ways of an eligible class inside the radius. */
    readonly waysEligible: number;
    /** Eligible ways that received ≥1 synthesised lamp. */
    readonly waysLit: number;
    /** Eligible ways skipped because a mapped lamp sits within the exclusion distance. */
    readonly waysSkippedMapped: number;
    /** Synthesised lamps dropped by the nearest-first cap. */
    readonly syntheticDroppedByCap: number;
}

export interface PlacePedestriansOptions {
    readonly origin: StreetLifeOrigin;
    readonly radiusM?: number;
    readonly urbanSpacingM?: number;
    readonly ruralSpacingM?: number;
    readonly sidewalkOffsetM?: number;
    readonly cap?: number;
    /** Metres from an urban polygon's vertex that still counts as urban (default URBAN_NEAR_M). */
    readonly urbanNearM?: number;
}

export interface PlacePedestriansResult {
    /** Nearest-first. */
    readonly people: StreetPedestrian[];
    readonly waysWalked: number;
    readonly urbanWays: number;
    readonly ruralWays: number;
    /** People generated before the cap bit. */
    readonly generated: number;
    readonly droppedByCap: number;
}

// ── Ribbon widths — the renderer's table, duplicated by necessity and PINNED by spec ─────────────

/**
 * Metric ground-ribbon width by OSM highway class. ⚠ This MUST equal `roadWidthM` inside
 * `CesiumViewport.loadContextRoads` (the closure that draws the ribbons); the placement offsets
 * hang off the ribbon EDGE, so a drift here would stand lamps in the carriageway or float
 * pedestrians off the kerb. `contextStreetLife.spec.ts` parses that closure's `case … return N`
 * lines from the source and asserts equality — a rename or retune there fails the spec by name.
 * (Not imported from CesiumViewport: that module drags Cesium into a pure spec.)
 */
export function roadRibbonWidthM(highway: string): number {
    switch (highway) {
        case 'motorway': case 'motorway_link': case 'trunk': case 'trunk_link': return 14;
        case 'primary': case 'primary_link': return 11;
        case 'secondary': case 'secondary_link': return 9;
        case 'tertiary': case 'tertiary_link': return 7;
        case 'residential': case 'unclassified': case 'living_street': return 6;
        case 'service': return 4;
        default: return 6;
    }
}

// ── Deterministic hashing ────────────────────────────────────────────────────────────────────────

/** 32-bit integer mix of two integers (murmur3-style finaliser). Same inputs → same output, always. */
export function hash32(a: number, b: number): number {
    let h = (Math.imul((a % 2147483647) | 0, 0x9E3779B1) ^ Math.imul(((b % 2147483647) | 0) + 0x7F4A7C15, 0x85EBCA77)) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D) >>> 0;
    h ^= h >>> 12; h = Math.imul(h, 0x297A2D39) >>> 0;
    h ^= h >>> 15;
    return h >>> 0;
}
/** Uniform-ish [0, 1) from `hash32`. */
export function hash01(a: number, b: number): number {
    return hash32(a, b) / 4294967296;
}

// ── Local metric frame ───────────────────────────────────────────────────────────────────────────

const R_EARTH = 6378137;
const D2R = Math.PI / 180;

interface Frame {
    toXY(lon: number, lat: number): readonly [number, number];
    toLonLat(x: number, y: number): readonly [number, number];
}

function frameAt(origin: StreetLifeOrigin): Frame {
    const c = Math.cos(origin.lat * D2R);
    const kx = D2R * R_EARTH * c, ky = D2R * R_EARTH;
    return {
        toXY: (lon, lat) => [(lon - origin.lon) * kx, (lat - origin.lat) * ky],
        toLonLat: (x, y) => [origin.lon + x / kx, origin.lat + y / ky],
    };
}

interface Polyline {
    readonly pts: Array<readonly [number, number]>;
    /** Cumulative arc length at each vertex; `cum[n-1]` is the total length. */
    readonly cum: number[];
    readonly length: number;
    /** Distance from the origin to the nearest vertex. */
    readonly nearestM: number;
}

function toPolyline(way: ContextWay, frame: Frame): Polyline | null {
    const pts: Array<readonly [number, number]> = [];
    for (const c of way.coords) {
        const lon = c[0], lat = c[1];
        if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
        pts.push(frame.toXY(lon, lat));
    }
    if (pts.length < 2) return null;
    const cum = [0];
    let nearest = Infinity;
    for (let i = 0; i < pts.length; i++) {
        const p = pts[i]!;
        const d = Math.hypot(p[0], p[1]);
        if (d < nearest) nearest = d;
        if (i > 0) {
            const q = pts[i - 1]!;
            cum.push(cum[i - 1]! + Math.hypot(p[0] - q[0], p[1] - q[1]));
        }
    }
    const length = cum[cum.length - 1]!;
    if (!(length > 0)) return null;
    return { pts, cum, length, nearestM: nearest };
}

/** Position and unit tangent at arc length `s` (clamped to [0, length]). */
function alongPolyline(pl: Polyline, s: number): { x: number; y: number; tx: number; ty: number } {
    const target = Math.min(Math.max(s, 0), pl.length);
    let i = 1;
    while (i < pl.cum.length - 1 && pl.cum[i]! < target) i++;
    const a = pl.pts[i - 1]!, b = pl.pts[i]!;
    const segLen = pl.cum[i]! - pl.cum[i - 1]!;
    const t = segLen > 0 ? (target - pl.cum[i - 1]!) / segLen : 0;
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const n = Math.hypot(dx, dy) || 1;
    return { x: a[0] + dx * t, y: a[1] + dy * t, tx: dx / n, ty: dy / n };
}

/** Squared distance from point P to segment AB. */
function distSqToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = Math.min(1, Math.max(0, t));
    const qx = ax + dx * t, qy = ay + dy * t;
    return (px - qx) * (px - qx) + (py - qy) * (py - qy);
}

// ── Mapped-lamp proximity index (uniform grid, cell = exclusion distance) ────────────────────────

class PointGrid {
    private readonly cells = new Map<string, Array<readonly [number, number]>>();
    constructor(private readonly cellM: number) {}
    private key(cx: number, cy: number): string { return cx + ',' + cy; }
    add(x: number, y: number): void {
        const k = this.key(Math.floor(x / this.cellM), Math.floor(y / this.cellM));
        let arr = this.cells.get(k);
        if (!arr) { arr = []; this.cells.set(k, arr); }
        arr.push([x, y]);
    }
    /** TRUE if any indexed point lies within `withinM` of segment AB. */
    anyNearSegment(ax: number, ay: number, bx: number, by: number, withinM: number): boolean {
        if (this.cells.size === 0) return false;
        const w2 = withinM * withinM;
        const minX = Math.min(ax, bx) - withinM, maxX = Math.max(ax, bx) + withinM;
        const minY = Math.min(ay, by) - withinM, maxY = Math.max(ay, by) + withinM;
        const cx0 = Math.floor(minX / this.cellM), cx1 = Math.floor(maxX / this.cellM);
        const cy0 = Math.floor(minY / this.cellM), cy1 = Math.floor(maxY / this.cellM);
        for (let cx = cx0; cx <= cx1; cx++) for (let cy = cy0; cy <= cy1; cy++) {
            const arr = this.cells.get(this.key(cx, cy));
            if (!arr) continue;
            for (const [px, py] of arr) {
                if (distSqToSegment(px, py, ax, ay, bx, by) <= w2) return true;
            }
        }
        return false;
    }
}

// ── Lamps ────────────────────────────────────────────────────────────────────────────────────────

/**
 * Mapped lamps as-is (`synthetic:false`) + synthesised lamps along eligible road ribbons
 * (`synthetic:true`), nearest-first, capped. Never throws; malformed ways/lamps are skipped.
 */
export function placeLamps(
    mapped: ReadonlyArray<MappedLamp>,
    roads: ReadonlyArray<ContextWay>,
    opts: PlaceLampsOptions,
): PlaceLampsResult {
    const frame = frameAt(opts.origin);
    const spacing = opts.spacingM ?? LAMP_SPACING_M;
    const edgeOffset = opts.edgeOffsetM ?? LAMP_EDGE_OFFSET_M;
    const exclusion = opts.mappedExclusionM ?? LAMP_MAPPED_EXCLUSION_M;
    const cap = opts.syntheticCap ?? LAMP_SYNTHETIC_CAP;
    const radius = opts.radiusM ?? Infinity;

    const lamps: StreetLamp[] = [];
    const grid = new PointGrid(Math.max(1, exclusion));
    for (const m of mapped) {
        if (!Number.isFinite(m.lon) || !Number.isFinite(m.lat)) continue;
        const [x, y] = frame.toXY(m.lon, m.lat);
        grid.add(x, y);
        lamps.push({ lon: m.lon, lat: m.lat, synthetic: false, osmId: m.osmId, distM: Math.hypot(x, y) });
    }
    const mappedCount = lamps.length;
    // §MAPPED-LAMPS-NEAREST-FIRST (lane LAYERS-FURNITURE-SEA, 2026-09-06) — the MAPPED half is not
    // capped here (see LAMP_SYNTHETIC_CAP), but its CALLER caps: the renderer takes
    // `.slice(0, STREET_LIFE_MAX_LAMPS)` (1200) over `mapped ++ synthetic`. Unsorted, that slice keeps
    // the first 1200 mapped lamps in TILE-READ order — an arbitrary corner of the bbox — and can leave
    // the site itself unlit while lamps stand 800 m away. π·890² ≈ 2.5 km² of a Nordic or Dutch city
    // carries well over 1200 mapped `highway=street_lamp` nodes, so this is the NORMAL case exactly
    // where OSM lighting is best mapped, not an edge case. It has never been visible because
    // `furniture` 404s in every region (measured 2026-09-06: `tiles/furniture.pmtiles` HTTP 404), so
    // `mappedCount` is 0 everywhere and the mapped half is empty; it would have appeared the day the
    // layer published, in the cities the founder would check first. Sorting here (the synthetic half
    // already sorts) makes the caller's cap keep the NEAREST mapped lamps, and mapped still precedes
    // every synthetic lamp in the returned array, so DATA continues to win over SCENERY.
    lamps.sort((a, b) => a.distM - b.distM);

    const synth: StreetLamp[] = [];
    let waysEligible = 0, waysLit = 0, waysSkippedMapped = 0;
    for (const way of roads) {
        if (way.kind !== 'road' || !LAMP_ROAD_CLASSES.has(way.highway)) continue;
        const pl = toPolyline(way, frame);
        if (!pl || pl.nearestM > radius) continue;
        waysEligible++;
        // The data wins: a way that already carries a mapped lamp within the exclusion distance
        // gets no scenery lamps at all.
        let nearMapped = false;
        for (let i = 1; i < pl.pts.length && !nearMapped; i++) {
            const a = pl.pts[i - 1]!, b = pl.pts[i]!;
            nearMapped = grid.anyNearSegment(a[0], a[1], b[0], b[1], exclusion);
        }
        if (nearMapped) { waysSkippedMapped++; continue; }

        const halfWidth = roadRibbonWidthM(way.highway) / 2;
        const offset = halfWidth + edgeOffset;
        const phase = hash01(way.osmId, 0) * spacing;
        const sideFlip = hash32(way.osmId, 1) & 1;
        let placed = 0;
        for (let k = 0; ; k++) {
            const s = phase + k * spacing + (hash01(way.osmId, k + 2) - 0.5) * LAMP_JITTER_M;
            if (s > pl.length) break;
            if (s < 0) continue;
            const at = alongPolyline(pl, s);
            const side = ((k + sideFlip) & 1) === 0 ? 1 : -1;   // alternate kerbs along the way.
            const nx = -at.ty * side, ny = at.tx * side;        // left normal, flipped per side.
            const x = at.x + nx * offset, y = at.y + ny * offset;
            const [lon, lat] = frame.toLonLat(x, y);
            synth.push({ lon, lat, synthetic: true, osmId: way.osmId, distM: Math.hypot(x, y) });
            placed++;
            if (k > 100000) break; // defensive: a way can never need this many.
        }
        if (placed > 0) waysLit++;
    }
    synth.sort((a, b) => a.distM - b.distM);
    const kept = synth.length > cap ? synth.slice(0, cap) : synth;
    return {
        lamps: lamps.concat(kept),
        mappedCount,
        syntheticCount: kept.length,
        waysEligible,
        waysLit,
        waysSkippedMapped,
        syntheticDroppedByCap: synth.length - kept.length,
    };
}

// ── Urban test ───────────────────────────────────────────────────────────────────────────────────

interface UrbanRing {
    readonly ring: ReadonlyArray<readonly [number, number]>;
    readonly minLon: number; readonly minLat: number; readonly maxLon: number; readonly maxLat: number;
}

function urbanRings(landuse: ReadonlyArray<LanduseAreaLike>): UrbanRing[] {
    const out: UrbanRing[] = [];
    for (const a of landuse) {
        if (a.kind !== 'urban' || a.ring.length < 3) continue;
        let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
        for (const [x, y] of a.ring) {
            if (x < minLon) minLon = x; if (x > maxLon) maxLon = x;
            if (y < minLat) minLat = y; if (y > maxLat) maxLat = y;
        }
        out.push({ ring: a.ring, minLon, minLat, maxLon, maxLat });
    }
    return out;
}

/**
 * TRUE when (lon,lat) is inside an urban landuse polygon or within `nearM` of one of its vertices —
 * the `formaGroundColour` rule (a village is a residential polygon around its houses). Bbox
 * pre-filtered so a city's hundreds of polygons cost a few comparisons per query.
 */
export function isUrbanAt(
    rings: ReadonlyArray<UrbanRing>, lon: number, lat: number, nearM: number,
): boolean {
    const dLat = nearM / (D2R * R_EARTH);
    const dLon = nearM / (D2R * R_EARTH * Math.max(0.05, Math.cos(lat * D2R)));
    for (const r of rings) {
        if (lon < r.minLon - dLon || lon > r.maxLon + dLon || lat < r.minLat - dLat || lat > r.maxLat + dLat) continue;
        if (pointInRing(lon, lat, r.ring)) return true;
        const c = Math.cos(lat * D2R);
        for (const [x, y] of r.ring) {
            const dx = (x - lon) * D2R * R_EARTH * c, dy = (y - lat) * D2R * R_EARTH;
            if (dx * dx + dy * dy <= nearM * nearM) return true;
        }
    }
    return false;
}

/** Build the urban index once for many `isUrbanAt` queries. */
export function buildUrbanIndex(landuse: ReadonlyArray<LanduseAreaLike>): UrbanRing[] {
    return urbanRings(landuse);
}

// ── Pedestrians ──────────────────────────────────────────────────────────────────────────────────

/**
 * Low-poly people along footway/pedestrian/path/steps centre-lines and along the SIDEWALKS of
 * residential/tertiary roads. Density is decided PER WAY at its midpoint: urban 1 per 25 m, else
 * 1 per 80 m. Nearest-first, capped. Every person is `synthetic: true`. Never throws.
 */
export function placePedestrians(
    roads: ReadonlyArray<ContextWay>,
    landuse: ReadonlyArray<LanduseAreaLike>,
    opts: PlacePedestriansOptions,
): PlacePedestriansResult {
    const frame = frameAt(opts.origin);
    const urbanSpacing = opts.urbanSpacingM ?? PEDESTRIAN_URBAN_SPACING_M;
    const ruralSpacing = opts.ruralSpacingM ?? PEDESTRIAN_RURAL_SPACING_M;
    const sidewalkOffset = opts.sidewalkOffsetM ?? PEDESTRIAN_SIDEWALK_OFFSET_M;
    const cap = opts.cap ?? PEDESTRIAN_CAP;
    const radius = opts.radiusM ?? Infinity;
    const nearM = opts.urbanNearM ?? URBAN_NEAR_M;
    const rings = urbanRings(landuse);

    const people: StreetPedestrian[] = [];
    let waysWalked = 0, urbanWays = 0, ruralWays = 0;
    for (const way of roads) {
        const onCentre = PEDESTRIAN_WAY_CLASSES.has(way.highway);
        const onSidewalk = !onCentre && way.kind === 'road' && PEDESTRIAN_SIDEWALK_CLASSES.has(way.highway);
        if (!onCentre && !onSidewalk) continue;
        const pl = toPolyline(way, frame);
        if (!pl || pl.nearestM > radius) continue;

        const mid = alongPolyline(pl, pl.length / 2);
        const [midLon, midLat] = frame.toLonLat(mid.x, mid.y);
        const urban = isUrbanAt(rings, midLon, midLat, nearM);
        const spacing = urban ? urbanSpacing : ruralSpacing;
        const offset = onSidewalk ? roadRibbonWidthM(way.highway) / 2 + sidewalkOffset : 0;

        const phase = hash01(way.osmId, 11) * spacing;
        let placed = 0;
        for (let k = 0; ; k++) {
            const s = phase + k * spacing;
            if (s > pl.length) break;
            const at = alongPolyline(pl, s);
            const h = hash32(way.osmId, 13 + k);
            const side = (h & 1) === 0 ? 1 : -1;
            // Centre-line walkers spread ±0.6 m so a busy footway is not a queue; sidewalk walkers
            // stand on the kerb side chosen by the hash bit.
            const lateral = onSidewalk ? offset * side : ((h >>> 1) & 0xff) / 255 * 1.2 - 0.6;
            const x = at.x - at.ty * lateral, y = at.y + at.tx * lateral;
            const heading = Math.atan2(at.ty, at.tx) + (((h >>> 9) & 1) === 0 ? 0 : Math.PI);
            const [lon, lat] = frame.toLonLat(x, y);
            people.push({
                lon, lat, synthetic: true, headingRad: heading,
                palette: (h >>> 10) % PEDESTRIAN_PALETTE_SIZE,
                wayOsmId: way.osmId, distM: Math.hypot(x, y),
            });
            placed++;
            if (k > 100000) break;
        }
        if (placed > 0) { waysWalked++; if (urban) urbanWays++; else ruralWays++; }
    }
    people.sort((a, b) => a.distM - b.distM);
    const kept = people.length > cap ? people.slice(0, cap) : people;
    return {
        people: kept, waysWalked, urbanWays, ruralWays,
        generated: people.length, droppedByCap: people.length - kept.length,
    };
}

// ── The console line — one honest sentence, counted by kind ─────────────────────────────────────

/** How the `furniture` tile layer answered — failure and empty are DIFFERENT values. */
export type FurnitureLayerState =
    /** Read OK; `mapped` may legitimately be 0 (nothing mapped here). */
    | 'ok'
    /** The archive does not exist for this tileset version (403/404) — not yet baked. Honest EMPTY. */
    | 'absent'
    /** Configured but unreadable for another reason — a FAILURE, not an empty. */
    | 'unavailable'
    /** No tiles URL configured at all. */
    | 'disabled'
    | 'aborted';

export interface StreetLifeStats {
    readonly mapped: number;
    readonly synthesisedLamps: number;
    readonly roadWaysLit: number;
    readonly pedestrians: number;
    readonly furnitureLayer: FurnitureLayerState;
    readonly furnitureReason?: string;
}

/**
 * `[CesiumViewport][forma] §STREET-LIFE (L-12936): N mapped lamp(s) + M synthesised lamp(s) along K
 * road way(s) + P synthetic pedestrian(s) — synthesised objects are SCENERY (not data)` plus a
 * suffix that says how the furniture layer answered, so "0 mapped" is never ambiguous between
 * "none mapped here", "layer not yet baked" and "read failed".
 */
export function streetLifeLogLine(s: StreetLifeStats): string {
    const suffix =
        s.furnitureLayer === 'ok' ? ' · furniture layer read OK'
        : s.furnitureLayer === 'absent' ? ' · furniture layer ABSENT (not yet baked — mapped lamps are an honest EMPTY, not a failure)'
        : s.furnitureLayer === 'unavailable' ? ` · furniture layer read FAILED (${s.furnitureReason ?? 'unknown'}) — mapped count is NOT an answer`
        : s.furnitureLayer === 'disabled' ? ' · context tiles not configured (mapped lamps unavailable)'
        : ' · furniture read aborted';
    return (
        `[CesiumViewport][forma] §STREET-LIFE (L-12936): ${s.mapped} mapped lamp(s) + ` +
        `${s.synthesisedLamps} synthesised lamp(s) along ${s.roadWaysLit} road way(s) + ` +
        `${s.pedestrians} synthetic pedestrian(s) — synthesised objects are SCENERY (not data)` + suffix
    );
}
