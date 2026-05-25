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

export interface WallsAndDoors {
    readonly segments: readonly WallSeg[];
    readonly openings: readonly OpeningSpec[];
}

export interface WallsAndDoorsOpts {
    readonly wallThicknessM?: number;      // default 0.1 m
    readonly doorWidthM?: number;          // default 0.9 m
    readonly doorHeightM?: number;         // default 2.1 m
    readonly minClearanceM?: number;       // wall left over each side; default 0.1 m
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
    const sharedWallByPair = new Map<string, WallSeg>();
    let wid = 0;

    const emit = (axis: 'v' | 'h', coord: number, run: Run): void => {
        const ids = [run.neg, run.pos].filter((x): x is string => x !== null);
        const bounds = ids.length === 2 ? [...ids].sort() : ids;
        if (bounds.length === 2 && sameZone(bounds[0]!, bounds[1]!)) return; // intra-zone (open-plan) threshold
        const a: Pt = axis === 'v' ? { x: coord, z: run.start } : { x: run.start, z: coord };
        const b: Pt = axis === 'v' ? { x: coord, z: run.end } : { x: run.end, z: coord };
        const seg: WallSeg = { id: `w${wid++}`, a, b, thickness, boundsRoomIds: bounds };
        segments.push(seg);
        if (bounds.length === 2) sharedWallByPair.set(pairKey(bounds[0]!, bounds[1]!), seg);
    };

    for (const { coord, faces } of groupByCoord(vFaces)) for (const run of runsForLine(faces)) emit('v', coord, run);
    for (const { coord, faces } of groupByCoord(hFaces)) for (const run of runsForLine(faces)) emit('h', coord, run);

    // ── Doors ────────────────────────────────────────────────────────────────────
    // A door needs a real shared wall + must fit; one door per wall. We first place
    // the doors the bubble graph asks for (where the rooms ended up adjacent), then
    // RECONCILE: add doors across shared walls until every room is reachable from
    // the entry (spanning-tree over the room-adjacency graph, preferring doors that
    // touch circulation). This guarantees NO sealed/door-less room even when the
    // squarified placement didn't land the exact bubble-edge rooms adjacent.
    const openings: OpeningSpec[] = [];
    const wallHasDoor = new Set<string>();
    let oid = 0;
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
        return true;
    };

    // Connectivity DSU (rooms connected via open thresholds + placed doors).
    const cRoot = new Map<string, string>(graph.rooms.map(r => [r.id, r.id]));
    const cFind = (x: string): string => { while (cRoot.get(x)! !== x) { cRoot.set(x, cRoot.get(cRoot.get(x)!)!); x = cRoot.get(x)!; } return x; };
    const cUnion = (a: string, b: string): void => { const ra = cFind(a), rb = cFind(b); if (ra !== rb) cRoot.set(ra, rb); };
    for (const e of graph.edges) if (e.via === 'open') cUnion(e.a, e.b);

    // (1) bubble-requested doors, where realised.
    for (const e of graph.edges) {
        if (e.via !== 'door') continue;
        const wall = sharedWallByPair.get(pairKey(e.a, e.b));
        if (wall && addDoor(wall, e.a, e.b)) cUnion(e.a, e.b);
    }

    // (2) reconcile to full reachability — Kruskal over shared walls, circulation first.
    const circulation = new Set<string>(['corridor', 'hall', 'living']);
    const typeOf = new Map(graph.rooms.map(r => [r.id, r.type]));
    const candidates = segments
        .filter(s => s.boundsRoomIds.length === 2)
        .map(s => {
            const [a, b] = s.boundsRoomIds as readonly [string, string];
            const touchesCirc = circulation.has(typeOf.get(a) ?? '') || circulation.has(typeOf.get(b) ?? '') ? 1 : 0;
            return { seg: s, a, b, pref: touchesCirc, len: Math.hypot(s.b.x - s.a.x, s.b.z - s.a.z) };
        })
        .sort((p, q) => q.pref - p.pref || q.len - p.len || (p.seg.id < q.seg.id ? -1 : 1));
    for (const c of candidates) {
        if (cFind(c.a) !== cFind(c.b) && addDoor(c.seg, c.a, c.b)) cUnion(c.a, c.b);
    }

    return { segments, openings };
}
