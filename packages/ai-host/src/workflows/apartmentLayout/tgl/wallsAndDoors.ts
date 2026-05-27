// TGL P4 — wall + door extraction from the room partition.
//
// Turns the room footprints (P3b) into the actual building fabric:
//   • every room-rectangle edge becomes a wall segment, with collinear shared
//     boundaries DEDUPLICATED — two rooms that share a face produce ONE interior
//     wall that bounds both (never two stacked walls);
//   • a wall touching the void (only one room) is an exterior wall;
//   • bubble edges (P2) are realised as openings: `via:'door'` → one centred door
//     on the shared wall;
//   • open-plan: rooms transitively linked by `via:'open'` form a ZONE, and every
//     wall WITHIN a zone is omitted (not just directly-linked pairs) — so e.g. a
//     hall|kitchen wall doesn't survive as a stub jutting into the open
//     hall–living–kitchen–dining space (which would break room detection). A wall
//     is kept only where it separates two different zones, or a zone from the void.
//
// The extraction sweeps vertical walls (constant x) then horizontal walls
// (constant z): along each wall line the rooms on the −/+ side of every elementary
// sub-interval are resolved, equal runs merged, so each shared boundary yields
// exactly one segment. Pure + deterministic (sorted sweep, stable ids). Metres,
// plan frame { x, z }; the consumer converts to mm.

import type { BubbleGraph } from './bubbleGraph.js';
import type { Pt, Rect } from './rectDecomposition.js';
import type { RoomPlacement } from './subdivide.js';
import { doorAllowedBetween, isCirculation, maxDoorsFor, roomRule } from '../rules/programRules.js';

export interface WallSeg {
    readonly id: string;
    readonly a: Pt;
    readonly b: Pt;
    readonly thickness: number;            // metres
    /** Rooms this wall bounds: 2 ⇒ interior shared, 1 ⇒ exterior. */
    readonly boundsRoomIds: readonly string[];
}

export interface OpeningSpec {
    readonly id: string;
    readonly wallId: string;
    readonly type: 'door' | 'window';
    readonly offsetM: number;              // distance from wall start (a) to opening start
    readonly widthM: number;
    readonly heightM: number;
    readonly sillM: number;
    readonly betweenRoomIds: readonly [string, string?];
}

/** A virtual room-bounding line on an open-plan threshold (no wall, no door). */
export interface BoundarySeg {
    readonly a: Pt;
    readonly b: Pt;
    readonly betweenRoomIds: readonly [string, string];
}

export interface WallsAndDoors {
    readonly segments: readonly WallSeg[];
    readonly openings: readonly OpeningSpec[];
    /** Virtual room-splitters along intra-zone (open-plan) shared boundaries. The
     *  built scene has no wall there, but the RoomDetectionEngine consumes these
     *  exactly like wall segments and so registers each open-plan room separately. */
    readonly boundaries: readonly BoundarySeg[];
    /**
     * Reconciliation doors that violated the program rules (a forbidden room-type
     * pair or a privacy door-cap) but were placed anyway as a LAST RESORT to avoid
     * sealing a room. 0 ⇒ a fully rule-legal layout. P8 prefers candidates with
     * the fewest compromises (so the user gets a logical plan whenever one exists).
     */
    readonly compromises: number;
}

export interface WallsAndDoorsOpts {
    readonly wallThicknessM?: number;      // default 0.1 m
    readonly doorWidthM?: number;          // default 0.9 m
    readonly doorHeightM?: number;         // default 2.1 m
    readonly minClearanceM?: number;       // wall left over each side; default 0.1 m
    /** §EXTEND-TO-PERIMETER (2026-05-27, live-fix for non-rectilinear shells):
     *  the original SHELL POLYGON (NOT the bounding box). If supplied, every
     *  axis-aligned exterior-bounding wall (boundsRoomIds.length === 1) whose
     *  endpoint sits STRICTLY INSIDE the polygon is extended along its axis
     *  until it hits the polygon perimeter. Closes the architect-reported gap
     *  between interior walls and a slanted exterior wall (the rectilinear
     *  decomposition emits the wall at the bounding-box edge, which sits
     *  inside the actual shell). When the wall ALREADY ends on the perimeter
     *  (rectilinear shell) the pass is a no-op. */
    readonly shellPolygon?: readonly Pt[];
}

const EPS = 1e-6;
const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;
const pairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);

interface Face { readonly coord: number; readonly s0: number; readonly s1: number; readonly roomId: string; readonly side: 'neg' | 'pos' }
interface Run { readonly start: number; readonly end: number; readonly neg: string | null; readonly pos: string | null }

/** Group faces by their (rounded) coordinate; returns coords ascending. */
function groupByCoord(faces: readonly Face[]): Array<{ coord: number; faces: Face[] }> {
    const map = new Map<number, Face[]>();
    for (const f of faces) {
        const c = round6(f.coord);
        (map.get(c) ?? map.set(c, []).get(c)!).push(f);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([coord, fs]) => ({ coord, faces: fs }));
}

/** Resolve the merged wall runs along one wall line (a single coord group). */
function runsForLine(faces: readonly Face[]): Run[] {
    const cuts = Array.from(new Set(faces.flatMap(f => [round6(f.s0), round6(f.s1)]))).sort((a, b) => a - b);
    const covers = (f: Face, m: number): boolean => f.s0 - EPS <= m && m <= f.s1 + EPS;
    const runs: Run[] = [];
    for (let i = 0; i + 1 < cuts.length; i++) {
        const lo = cuts[i]!, hi = cuts[i + 1]!;
        const mid = (lo + hi) / 2;
        const neg = faces.find(f => f.side === 'neg' && covers(f, mid))?.roomId ?? null;
        const pos = faces.find(f => f.side === 'pos' && covers(f, mid))?.roomId ?? null;
        if (neg === null && pos === null) continue;            // gap in the wall line
        const prev = runs[runs.length - 1];
        if (prev && Math.abs(prev.end - lo) < EPS && prev.neg === neg && prev.pos === pos) {
            runs[runs.length - 1] = { ...prev, end: hi };       // merge contiguous equal run
        } else {
            runs.push({ start: lo, end: hi, neg, pos });
        }
    }
    return runs;
}

// ─── §EXTEND-TO-PERIMETER helpers (2026-05-27) ───────────────────────────────
// For non-rectilinear shell polygons, the rect-decomposition uses axis-aligned
// rectangles, so interior wall endpoints land on the BOUNDING-BOX edges — not
// the actual perimeter. Where the perimeter slants, this leaves a visible gap
// between the interior wall and the exterior wall (architect's red-arrow
// screenshot 2026-05-27).
//
// The fix is purely geometric: for each axis-aligned wall, walk along its
// AXIS direction in the OUTWARD direction (away from the wall's room) and
// find the first intersection with the shell polygon. Move the endpoint
// there. Walls already ending on the polygon perimeter (rectilinear case)
// hit at distance ≈ 0 → no-op.

const POLY_EPS = 1e-4;

/** True if `p` lies on (within POLY_EPS of) any polygon edge. */
function pointOnPolygonBoundary(p: Pt, poly: readonly Pt[]): boolean {
    if (poly.length < 2) return false;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const ex = b.x - a.x, ez = b.z - a.z;
        const L2 = ex * ex + ez * ez;
        if (L2 < 1e-20) continue;
        const wx = p.x - a.x, wz = p.z - a.z;
        const t = (wx * ex + wz * ez) / L2;
        if (t < -POLY_EPS || t > 1 + POLY_EPS) continue;
        const projx = a.x + t * ex, projz = a.z + t * ez;
        const dx = p.x - projx, dz = p.z - projz;
        if (dx * dx + dz * dz <= POLY_EPS * POLY_EPS) return true;
    }
    return false;
}

/** Standard point-in-polygon (ray-cast). True if `p` is STRICTLY inside `poly`.
 *  Points ON the polygon boundary return FALSE (so an exterior wall whose
 *  endpoint already sits on the perimeter is not "inside" — no extension). */
function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
    if (poly.length < 3) return false;
    if (pointOnPolygonBoundary(p, poly)) return false;     // on the edge ⇒ NOT inside
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]!, b = poly[j]!;
        const yi = a.z, yj = b.z, xi = a.x, xj = b.x;
        const intersect = ((yi > p.z) !== (yj > p.z)) &&
            (p.x < (xj - xi) * (p.z - yi) / ((yj - yi) || 1e-30) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

/** Cast a ray from `from` along (dx, dz) (unit) and return the t parameter to
 *  the FIRST polygon edge it crosses. Returns Infinity if no hit.
 *
 *  Solve: from + t·D = a + u·(b−a),  with t > 0 and 0 ≤ u ≤ 1.
 *  In matrix form [D | -(b−a)] · [t, u]ᵀ = a − from.
 *  det = Dx·(−ez) − (−ex)·Dz = ex·Dz − Dx·ez. */
function rayHitPolygon(from: Pt, dx: number, dz: number, poly: readonly Pt[]): number {
    let best = Number.POSITIVE_INFINITY;
    if (poly.length < 2) return best;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!, b = poly[(i + 1) % poly.length]!;
        const ex = b.x - a.x;
        const ez = b.z - a.z;
        const det = ex * dz - dx * ez;
        if (Math.abs(det) < 1e-12) continue;                  // parallel
        const wx = a.x - from.x;
        const wz = a.z - from.z;
        // Cramer's rule on  [Dx  -ex] [t]   [wx]
        //                   [Dz  -ez] [u] = [wz]
        const t = (wx * (-ez) - wz * (-ex)) / det;
        const u = (dx * wz - dz * wx) / det;
        if (t > POLY_EPS && u >= -POLY_EPS && u <= 1 + POLY_EPS && t < best) {
            best = t;
        }
    }
    return best;
}

/** Extend the endpoint `from` along (dx, dz) (unit) up to the first polygon
 *  perimeter hit (if any) and return the new endpoint. `from` MUST be strictly
 *  inside the polygon (or this is a no-op). */
function extendToPolygon(from: Pt, dx: number, dz: number, poly: readonly Pt[]): Pt {
    const t = rayHitPolygon(from, dx, dz, poly);
    if (!Number.isFinite(t) || t < POLY_EPS) return from;
    return { x: from.x + dx * t, z: from.z + dz * t };
}

/** For each exterior-bounding wall whose endpoint is strictly INSIDE the
 *  shell polygon, extend that endpoint along the wall's axis (outward) to
 *  the polygon perimeter. Returns a NEW segments array (immutable swap). */
function extendExteriorWallsToShell(
    segments: readonly WallSeg[],
    poly: readonly Pt[],
): WallSeg[] {
    if (poly.length < 3) return [...segments];
    const out: WallSeg[] = [];
    for (const s of segments) {
        // Only walls bounding ONE room (the "exterior-facing" side of the
        // partition) need extension. Interior shared walls (2 rooms) stay
        // as they are — both rooms agree on the wall endpoints.
        if (s.boundsRoomIds.length !== 1) { out.push(s); continue; }

        const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z;
        const L = Math.hypot(dx, dz) || 1;
        const ux = dx / L, uz = dz / L;

        // For axis-aligned walls only — the engine emits axis-aligned segments
        // so this is always true; the guard keeps the helper robust if that
        // ever changes.
        const isV = Math.abs(ux) < POLY_EPS;
        const isH = Math.abs(uz) < POLY_EPS;
        if (!isV && !isH) { out.push(s); continue; }

        let newA = s.a, newB = s.b;
        // For each endpoint, extend OUTWARD along the wall axis if it's
        // strictly inside the polygon.
        if (pointInPolygon(s.a, poly)) {
            // Outward from a = AWAY from b = direction −u.
            newA = extendToPolygon(s.a, -ux, -uz, poly);
        }
        if (pointInPolygon(s.b, poly)) {
            // Outward from b = AWAY from a = direction +u.
            newB = extendToPolygon(s.b, +ux, +uz, poly);
        }
        out.push({ ...s, a: newA, b: newB });
    }
    return out;
}

/**
 * Extract walls + doors from the room footprints. Door/open edges of `graph` that
 * have no realised shared wall (rooms not actually adjacent in this placement) are
 * skipped — best-effort, never throws (placement quality is a P3 concern).
 */
export function buildWallsAndDoors(
    placements: readonly RoomPlacement[],
    graph: BubbleGraph,
    opts: WallsAndDoorsOpts = {},
): WallsAndDoors {
    const thickness = opts.wallThicknessM ?? 0.1;
    const doorW = opts.doorWidthM ?? 0.9;
    const doorH = opts.doorHeightM ?? 2.1;
    const clear = opts.minClearanceM ?? 0.1;

    // Faces: a vertical face at x with the room on the +x ('pos') / −x ('neg') side;
    // a horizontal face at z with the room above ('pos') / below ('neg').
    const vFaces: Face[] = [];
    const hFaces: Face[] = [];
    for (const { roomId, rect } of placements) {
        const r: Rect = rect;
        vFaces.push({ coord: r.x0, s0: r.z0, s1: r.z1, roomId, side: 'pos' });   // left face
        vFaces.push({ coord: r.x1, s0: r.z0, s1: r.z1, roomId, side: 'neg' });   // right face
        hFaces.push({ coord: r.z0, s0: r.x0, s1: r.x1, roomId, side: 'pos' });   // bottom face
        hFaces.push({ coord: r.z1, s0: r.x0, s1: r.x1, roomId, side: 'neg' });   // top face
    }

    // Open-plan ZONES: rooms connected (transitively) by 'open' thresholds form one
    // open space. A wall between any two rooms in the SAME zone is omitted — not just
    // directly-linked pairs. (Otherwise e.g. a hall|kitchen wall survives as a stub
    // jutting into the open hall–living–kitchen–dining space, which breaks room
    // detection.) Union-find over the 'open' edges gives the zones.
    const zoneRoot = new Map<string, string>();
    const find = (x: string): string => {
        let r = x;
        while ((zoneRoot.get(r) ?? r) !== r) r = zoneRoot.get(r)!;
        while ((zoneRoot.get(x) ?? x) !== r) { const n = zoneRoot.get(x)!; zoneRoot.set(x, r); x = n; }
        return r;
    };
    const union = (a: string, b: string): void => { zoneRoot.set(find(a), find(b)); };
    for (const r of graph.rooms) zoneRoot.set(r.id, r.id);
    for (const e of graph.edges) if (e.via === 'open') union(e.a, e.b);
    const sameZone = (a: string, b: string): boolean => find(a) === find(b);

    const segments: WallSeg[] = [];
    const boundaries: BoundarySeg[] = [];
    const sharedWallByPair = new Map<string, WallSeg>();
    let wid = 0;

    const emit = (axis: 'v' | 'h', coord: number, run: Run): void => {
        const ids = [run.neg, run.pos].filter((x): x is string => x !== null);
        const bounds = ids.length === 2 ? [...ids].sort() : ids;
        const a: Pt = axis === 'v' ? { x: coord, z: run.start } : { x: run.start, z: coord };
        const b: Pt = axis === 'v' ? { x: coord, z: run.end } : { x: run.end, z: coord };
        if (bounds.length === 2 && sameZone(bounds[0]!, bounds[1]!)) {
            // Intra-zone (open-plan) shared boundary: no wall, no door — but emit a
            // virtual RoomBoundingLine so the editor's RoomDetectionEngine still
            // separates the two open-plan spaces (the user's "room boundary" device,
            // matching how kitchen↔living is already split today). Without this they
            // collapse into one merged room on detection.
            boundaries.push({ a, b, betweenRoomIds: [bounds[0]!, bounds[1]!] });
            return;
        }
        const seg: WallSeg = { id: `w${wid++}`, a, b, thickness, boundsRoomIds: bounds };
        segments.push(seg);
        if (bounds.length === 2) sharedWallByPair.set(pairKey(bounds[0]!, bounds[1]!), seg);
    };

    for (const { coord, faces } of groupByCoord(vFaces)) for (const run of runsForLine(faces)) emit('v', coord, run);
    for (const { coord, faces } of groupByCoord(hFaces)) for (const run of runsForLine(faces)) emit('h', coord, run);

    // ── Doors ────────────────────────────────────────────────────────────────────
    // A door needs a real shared wall + must fit; one door per wall. The pipeline:
    //   (1) place the doors the bubble graph asks for (intended adjacencies);
    //   (2a) RECONCILE over PERMITTED pairs only — Kruskal over shared walls where
    //        `doorAllowedBetween` holds AND neither room is over its privacy cap,
    //        circulation first — so every room reachable from the entry through
    //        ARCHITECTURALLY LEGAL doors (no bedroom-through-bedroom, no bathroom
    //        off a kitchen, no en-suite off a corridor);
    //   (2b) LAST RESORT — if a room is still sealed, connect it across ANY shared
    //        wall (ignoring permission/caps) so it is never door-less, counting each
    //        such door as a `compromise` (P8 then prefers candidates with zero).
    const openings: OpeningSpec[] = [];
    const wallHasDoor = new Set<string>();
    const doorCount = new Map<string, number>(graph.rooms.map(r => [r.id, 0]));
    const typeOf = new Map(graph.rooms.map(r => [r.id, r.type]));
    let oid = 0;
    let compromises = 0;
    const addDoor = (wall: WallSeg, a: string, b: string): boolean => {
        if (wallHasDoor.has(wall.id)) return false;
        const len = Math.hypot(wall.b.x - wall.a.x, wall.b.z - wall.a.z);
        const width = Math.min(doorW, len - 2 * clear);
        if (width < 0.6 - EPS) return false;                    // wall too short for a usable door
        openings.push({
            id: `o${oid++}`, wallId: wall.id, type: 'door',
            offsetM: round6((len - width) / 2), widthM: round6(width), heightM: doorH, sillM: 0,
            betweenRoomIds: [a, b],
        });
        wallHasDoor.add(wall.id);
        doorCount.set(a, (doorCount.get(a) ?? 0) + 1);
        doorCount.set(b, (doorCount.get(b) ?? 0) + 1);
        return true;
    };
    const underCap = (id: string): boolean => (doorCount.get(id) ?? 0) < maxDoorsFor(typeOf.get(id) ?? '');
    const permitted = (a: string, b: string): boolean =>
        doorAllowedBetween(typeOf.get(a) ?? '', typeOf.get(b) ?? '');

    // Connectivity DSU (rooms connected via open thresholds + placed doors).
    const cRoot = new Map<string, string>(graph.rooms.map(r => [r.id, r.id]));
    const cFind = (x: string): string => { while (cRoot.get(x)! !== x) { cRoot.set(x, cRoot.get(cRoot.get(x)!)!); x = cRoot.get(x)!; } return x; };
    const cUnion = (a: string, b: string): void => { const ra = cFind(a), rb = cFind(b); if (ra !== rb) cRoot.set(ra, rb); };
    for (const e of graph.edges) if (e.via === 'open') cUnion(e.a, e.b);

    // (1) bubble-requested doors, where realised. These are the INTENDED adjacencies
    // (corridor→bedroom, master↔ensuite, corridor→bathroom) — all rule-legal by
    // construction, so they are placed unconditionally and seed the door caps.
    for (const e of graph.edges) {
        if (e.via !== 'door') continue;
        const wall = sharedWallByPair.get(pairKey(e.a, e.b));
        if (wall && addDoor(wall, e.a, e.b)) cUnion(e.a, e.b);
    }

    // Shared-wall candidates, ranked: circulation-touching first, then longer walls,
    // then stable id (deterministic).
    const shared = segments
        .filter(s => s.boundsRoomIds.length === 2)
        .map(s => {
            const [a, b] = s.boundsRoomIds as readonly [string, string];
            const touchesCirc = isCirculation(typeOf.get(a) ?? '') || isCirculation(typeOf.get(b) ?? '') ? 1 : 0;
            return { seg: s, a, b, pref: touchesCirc, len: Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) };
        })
        .sort((p, q) => q.pref - p.pref || q.len - p.len || (p.seg.id < q.seg.id ? -1 : 1));

    // (2a) reconcile over PERMITTED, under-cap pairs only. TWO PASSES so a private
    // room's PRIMARY door always lands on circulation/public — never on a bathroom
    // (the user's bug: "bedrooms connect with bathrooms only"). With a single pass
    // a bedroom adjacent to both a corridor and a bathroom could spend its
    // maxDoors=1 budget on the bathroom and never connect to circulation.
    //
    // pass-i: only doors where a 'private' room reaches a 'circulation' / 'public'
    //         neighbour (the primary-access rule).
    // pass-ii: any remaining permitted pair (ensuite ↔ master, bathroom ↔ bedroom
    //         as a SECONDARY access once both have circulation).
    const isCircOrPublic = (t: string): boolean => {
        const p = roomRule(t).privacy;
        return p === 'circulation' || p === 'public';
    };
    const isPrimaryAccessPair = (a: string, b: string): boolean => {
        const ta = typeOf.get(a) ?? '', tb = typeOf.get(b) ?? '';
        const pa = roomRule(ta).privacy, pb = roomRule(tb).privacy;
        // A door is "primary access" when it connects a private/service room to
        // a circulation/public room. We also accept circulation↔circulation /
        // circulation↔public in this pass (those are uncapped public connectivity).
        if (pa === 'private' || pa === 'service') return isCircOrPublic(tb);
        if (pb === 'private' || pb === 'service') return isCircOrPublic(ta);
        return isCircOrPublic(ta) && isCircOrPublic(tb);
    };
    for (const c of shared) {
        if (cFind(c.a) === cFind(c.b)) continue;
        if (!permitted(c.a, c.b)) continue;
        if (!underCap(c.a) || !underCap(c.b)) continue;
        if (!isPrimaryAccessPair(c.a, c.b)) continue;       // pass-i: primary access only
        if (addDoor(c.seg, c.a, c.b)) cUnion(c.a, c.b);
    }
    for (const c of shared) {
        if (cFind(c.a) === cFind(c.b)) continue;
        if (!permitted(c.a, c.b)) continue;
        if (!underCap(c.a) || !underCap(c.b)) continue;
        if (addDoor(c.seg, c.a, c.b)) cUnion(c.a, c.b);     // pass-ii: any remaining permitted
    }

    // (2b) last resort — over-cap fallback. We RELAX the per-room maxDoors cap to
    // reconnect a still-sealed room, but we NEVER cross a forbidden pair (the user's
    // explicit rule: "there is a bedroom connected directly and only to another
    // bedroom — this is not acceptable"). A room that has no permitted neighbour at
    // all stays sealed; enumerate's legality gate then chooses a different strategy.
    for (const c of shared) {
        if (cFind(c.a) === cFind(c.b)) continue;
        if (!permitted(c.a, c.b)) continue;                   // HARD reject forbidden pairs
        if (addDoor(c.seg, c.a, c.b)) { cUnion(c.a, c.b); compromises++; }
    }

    // §EXTEND-TO-PERIMETER — for non-rectilinear shells, walk every exterior-
    // bounding wall and extend any endpoint that's strictly inside the shell
    // polygon outward to the perimeter. Rectilinear shells: pass-through.
    const segmentsOut = opts.shellPolygon && opts.shellPolygon.length >= 3
        ? extendExteriorWallsToShell(segments, opts.shellPolygon)
        : segments;

    return { segments: segmentsOut, openings, boundaries, compromises };
}

/** True when a door between these two room types satisfies the program rules. */
export function isLegalDoorPair(typeA: string, typeB: string): boolean {
    return doorAllowedBetween(typeA, typeB);
}
