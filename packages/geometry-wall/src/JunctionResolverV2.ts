// JunctionResolverV2 — Pascal-style per-wall miter trimming (ADR-0055 P1).
//
// PURE module (no THREE, no DOM). Resolves wall miters at L (2-wall), T (3-wall
// with one passthrough), Y (3-wall radial), and X (4-wall) junctions UNIFORMLY,
// in plan view (XZ). For every wall end that participates in a junction this
// module produces a `leftCorner` and `rightCorner` point. Adjacent walls SHARE
// their boundary corner by construction — no void to fill, no infill prism, no
// dark wedge.
//
// Algorithm (port of pascalorg/editor `packages/core/src/systems/wall/wall-mitering.ts`):
//   1. JUNCTION DETECTION — two passes:
//        (a) endpoint cluster: walls whose endpoints fall within `snapEpsilonM`.
//        (b) T-projection:   for each wall, project every OTHER wall's endpoint
//            onto its segment; if the projection lies strictly INTERIOR (not on
//            the wall's own endpoints) and within `snapEpsilonM` perpendicular,
//            attach that endpoint to the passthrough wall as a T-junction.
//   2. RING SWEEP — for each junction with ≥2 participating wall-ends:
//        - Build entries: one per wall-end (real). For passthrough walls in a
//          T-junction, push the passthrough wall TWICE — once with the body's
//          forward direction, once with the reversed direction. The ring then
//          looks like a 4-way cross from the sweep's perspective and the same
//          algorithm produces correct mitres for L / T / Y / X uniformly.
//        - Sort entries CCW by `atan2(dir.z, dir.x)` (direction = AWAY from the
//          junction along the wall body).
//        - For each adjacent pair (curr, next):
//             intersect curr.LEFT_edge_line ∩ next.RIGHT_edge_line.
//             that point becomes BOTH curr's `left` corner AND next's `right`.
//        - Parallel guard: |det| < 1e-9 → fall back to the perpendicular cap.
//
// Output: `WallMiter[]` index-aligned with the input walls. Each `WallMiter`
// carries (optionally) `startLeft / startRight / endLeft / endRight`, plus a
// pivot vertex (`startPivot / endPivot`) at the junction centre for the 5/6-vertex
// footprint that P2 will assemble in `WallFootprint2D`.
//
// Convention (plan XZ, +y up, looking down on the floor with z increasing forward):
//   - direction vector = (end − start), unit-normalised.
//   - LEFT perpendicular = (-dir.z, +dir.x).   RIGHT = (+dir.z, -dir.x).
//   - "left side" of a wall as the observer walks from start → end.

export interface WallInput {
    readonly id: string;
    readonly start: { readonly x: number; readonly z: number };
    readonly end:   { readonly x: number; readonly z: number };
    readonly thickness: number;
}

export interface Pt2 { readonly x: number; readonly z: number }

export interface WallMiter {
    readonly id: string;
    /** Inner-side corner at the start-end junction (LEFT of wall direction). */
    readonly startLeft?:  Pt2;
    /** Inner-side corner at the start-end junction (RIGHT of wall direction). */
    readonly startRight?: Pt2;
    /** Inner-side corner at the end junction (LEFT of wall direction). */
    readonly endLeft?:    Pt2;
    /** Inner-side corner at the end junction (RIGHT of wall direction). */
    readonly endRight?:   Pt2;
    /** Pivot vertex at the start junction (= consensus point). The footprint
     *  polygon hinges on this so adjacent walls share corners exactly. */
    readonly startPivot?: Pt2;
    /** Pivot vertex at the end junction. */
    readonly endPivot?:   Pt2;
}

export interface ResolveOptions {
    /** Endpoint snap radius (m). Default 1 mm. */
    readonly snapEpsilonM?: number;
    /** Perpendicular tolerance for T-projection (m). Default 1 mm. */
    readonly tProjectionEpsilonM?: number;
}

const DEFAULT_SNAP = 0.001;
const DEFAULT_T_EPS = 0.001;
const PARALLEL_DET = 1e-9;

// ─── Geometry helpers ─────────────────────────────────────────────────────────

function sub(a: Pt2, b: Pt2): Pt2 { return { x: a.x - b.x, z: a.z - b.z }; }
function add(a: Pt2, b: Pt2): Pt2 { return { x: a.x + b.x, z: a.z + b.z }; }
function scale(a: Pt2, k: number): Pt2 { return { x: a.x * k, z: a.z * k }; }
function dot(a: Pt2, b: Pt2): number { return a.x * b.x + a.z * b.z; }
function lenSq(a: Pt2): number { return a.x * a.x + a.z * a.z; }
function len(a: Pt2): number { return Math.hypot(a.x, a.z); }
function unit(a: Pt2): Pt2 { const L = len(a) || 1; return { x: a.x / L, z: a.z / L }; }
function leftPerp(d: Pt2): Pt2 { return { x: -d.z, z: d.x }; }     // CCW 90°

/** 2-D line-line intersection: `p1 + t*d1 = p2 + s*d2`. Returns null when parallel. */
function intersectLines(p1: Pt2, d1: Pt2, p2: Pt2, d2: Pt2): Pt2 | null {
    const det = d1.x * d2.z - d1.z * d2.x;
    if (Math.abs(det) < PARALLEL_DET) return null;
    const w = sub(p2, p1);
    const t = (w.x * d2.z - w.z * d2.x) / det;
    return { x: p1.x + t * d1.x, z: p1.z + t * d1.z };
}

/** Closest-point parameter `t ∈ [0,1]` of `p` projected onto segment a→b. */
function projectOnSeg(p: Pt2, a: Pt2, b: Pt2): { t: number; foot: Pt2; perpDist: number } {
    const ab = sub(b, a);
    const L2 = lenSq(ab);
    if (L2 < 1e-12) return { t: 0, foot: a, perpDist: len(sub(p, a)) };
    const tRaw = dot(sub(p, a), ab) / L2;
    const t = Math.max(0, Math.min(1, tRaw));
    const foot = { x: a.x + ab.x * t, z: a.z + ab.z * t };
    return { t, foot, perpDist: len(sub(p, foot)) };
}

// ─── Junction detection (two passes) ──────────────────────────────────────────

interface EndpointRef {
    readonly wallIdx: number;
    readonly isStart: boolean;       // is this the wall's START endpoint?
    /** Original endpoint position (BEFORE snap). */
    readonly origin: Pt2;
}

interface JunctionDraft {
    /** Consensus point — the centroid of clustered endpoints, then refined by T-projection. */
    point: Pt2;
    /** Real endpoint references (the wall's start or end is AT this junction). */
    realEndpoints: EndpointRef[];
    /** Passthrough wall indices (the wall's body crosses this junction; both halves act as separate "directions" in the sweep). */
    passthroughWalls: number[];
}

/** Group endpoints by spatial proximity (within `eps`). Pure greedy clustering. */
function clusterEndpoints(walls: readonly WallInput[], eps: number): EndpointRef[][] {
    const refs: EndpointRef[] = [];
    walls.forEach((w, i) => {
        refs.push({ wallIdx: i, isStart: true,  origin: w.start });
        refs.push({ wallIdx: i, isStart: false, origin: w.end   });
    });
    const used = new Array<boolean>(refs.length).fill(false);
    const clusters: EndpointRef[][] = [];
    for (let i = 0; i < refs.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        const cluster: EndpointRef[] = [refs[i]!];
        for (let j = i + 1; j < refs.length; j++) {
            if (used[j]) continue;
            if (len(sub(refs[i]!.origin, refs[j]!.origin)) <= eps) {
                used[j] = true;
                cluster.push(refs[j]!);
            }
        }
        clusters.push(cluster);
    }
    return clusters;
}

function centroid(pts: readonly Pt2[]): Pt2 {
    const n = pts.length || 1;
    let sx = 0, sz = 0;
    for (const p of pts) { sx += p.x; sz += p.z; }
    return { x: sx / n, z: sz / n };
}

/** Build the junction set: cluster ALL endpoints, attach T-passthroughs, KEEP
 *  every junction that ends up with ≥2 participants (real endpoints + passthroughs
 *  count together). A T-junction has only ONE real endpoint plus the passthrough
 *  wall — discarding single-endpoint clusters before T-projection misses these. */
function detectJunctions(walls: readonly WallInput[], opts: Required<ResolveOptions>): JunctionDraft[] {
    const clusters = clusterEndpoints(walls, opts.snapEpsilonM);
    const drafts: JunctionDraft[] = clusters.map(c => ({
        point: centroid(c.map(r => r.origin)), realEndpoints: c, passthroughWalls: [],
    }));

    // T-projection: for each cluster, find walls whose BODY (not endpoint) crosses
    // the consensus point.
    for (const j of drafts) {
        const ownWalls = new Set(j.realEndpoints.map(r => r.wallIdx));
        for (let i = 0; i < walls.length; i++) {
            if (ownWalls.has(i)) continue;
            const w = walls[i]!;
            const proj = projectOnSeg(j.point, w.start, w.end);
            if (proj.t > 0.001 && proj.t < 0.999 && proj.perpDist <= opts.tProjectionEpsilonM) {
                j.passthroughWalls.push(i);
            }
        }
    }
    // A junction needs at least 2 participants total (≥2 real endpoints, OR ≥1
    // real endpoint and ≥1 passthrough — the T-case). A single endpoint with no
    // passthrough is the wall's free end (no junction).
    return drafts.filter(j => j.realEndpoints.length + j.passthroughWalls.length >= 2);
}

// ─── Ring sweep ───────────────────────────────────────────────────────────────

interface SweepEntry {
    readonly wallIdx: number;
    readonly isStart: boolean;        // for real endpoints — which end is at this junction
    readonly isPassthrough: boolean;  // passthrough walls produce two entries (one per direction)
    readonly direction: Pt2;          // unit vector AWAY from the junction along the wall body
    readonly thickness: number;
    readonly angle: number;           // atan2(direction.z, direction.x), used for CCW sort
}

function buildSweepEntries(j: JunctionDraft, walls: readonly WallInput[]): SweepEntry[] {
    const entries: SweepEntry[] = [];
    for (const r of j.realEndpoints) {
        const w = walls[r.wallIdx]!;
        // direction AWAY from this endpoint along the wall body.
        const dir = r.isStart ? unit(sub(w.end, w.start)) : unit(sub(w.start, w.end));
        entries.push({
            wallIdx: r.wallIdx, isStart: r.isStart, isPassthrough: false,
            direction: dir, thickness: w.thickness, angle: Math.atan2(dir.z, dir.x),
        });
    }
    // Passthroughs: TWO entries, opposite directions. They become barriers in the
    // sweep — they take part in the angular ordering and produce mitre corners for
    // the *abutting* walls, but their own footprint is NOT modified (the passthrough
    // wall continues straight through; the corners we compute belong to other walls).
    for (const wi of j.passthroughWalls) {
        const w = walls[wi]!;
        const fwd = unit(sub(w.end, w.start));
        const rev = { x: -fwd.x, z: -fwd.z };
        entries.push({
            wallIdx: wi, isStart: false, isPassthrough: true,
            direction: fwd, thickness: w.thickness, angle: Math.atan2(fwd.z, fwd.x),
        });
        entries.push({
            wallIdx: wi, isStart: false, isPassthrough: true,
            direction: rev, thickness: w.thickness, angle: Math.atan2(rev.z, rev.x),
        });
    }
    entries.sort((a, b) => a.angle - b.angle);
    return entries;
}

/**
 * Apply the ring sweep to a junction: compute the shared corner between each
 * adjacent pair of wall-ends, and write it as `left` of curr and `right` of next
 * in the `WallMiter[]` accumulator. Passthrough walls are NOT modified (they pass
 * the junction straight); the corner becomes part of the abutting wall only.
 */
function applyRingSweep(j: JunctionDraft, walls: readonly WallInput[], miters: WallMiter[]): void {
    const entries = buildSweepEntries(j, walls);
    const n = entries.length;
    if (n < 2) return;

    // Helper to mutate the accumulator entry for a wall (immutable shape: we
    // construct a new object each time we attach a corner, so order doesn't matter).
    const setCorner = (wallIdx: number, isStart: boolean, side: 'Left' | 'Right', p: Pt2): void => {
        const cur = miters[wallIdx] ?? { id: walls[wallIdx]!.id };
        const key = (isStart ? 'start' : 'end') + side as 'startLeft' | 'startRight' | 'endLeft' | 'endRight';
        miters[wallIdx] = { ...cur, [key]: p };
    };
    const setPivot = (wallIdx: number, isStart: boolean, p: Pt2): void => {
        const cur = miters[wallIdx] ?? { id: walls[wallIdx]!.id };
        const key = isStart ? 'startPivot' : 'endPivot';
        if (cur[key] === undefined) miters[wallIdx] = { ...cur, [key]: p };
    };

    // Sweep each adjacent pair (wrap-around): curr's LEFT meets next's RIGHT.
    for (let i = 0; i < n; i++) {
        const curr = entries[i]!;
        const next = entries[(i + 1) % n]!;

        // LEFT-edge anchor / direction for `curr` (the wall extends FROM junction in
        // `curr.direction`, so the left edge is offset by halfT*leftPerp(direction)).
        const halfTc = curr.thickness * 0.5;
        const halfTn = next.thickness * 0.5;
        const leftAnchorCurr  = add(j.point, scale(leftPerp(curr.direction),  +halfTc));
        const rightAnchorNext = add(j.point, scale(leftPerp(next.direction),  -halfTn));

        const corner = intersectLines(leftAnchorCurr, curr.direction, rightAnchorNext, next.direction);
        if (corner === null) continue;        // parallel — fall back to perpendicular cap (no corner attached)

        // Attach the corner. Passthrough walls' own footprint isn't modified — we
        // skip writing into them. Real endpoints get the corner on the side facing
        // the adjacent wall.
        if (!curr.isPassthrough) setCorner(curr.wallIdx, curr.isStart, 'Left',  corner);
        if (!next.isPassthrough) setCorner(next.wallIdx, next.isStart, 'Right', corner);
        // Pivot vertex at the junction centre. Each real-endpoint wall pivots on
        // it; pivots are deduplicated (first writer wins).
        if (!curr.isPassthrough) setPivot(curr.wallIdx, curr.isStart, j.point);
        if (!next.isPassthrough) setPivot(next.wallIdx, next.isStart, j.point);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Resolve all junctions for a set of walls on one level. Returns an array
 * INDEX-ALIGNED with the input `walls` — `result[i]` is the miter info for
 * `walls[i]` (with `id` always present). Walls not at any junction have no
 * corner fields, and the consumer falls back to square caps.
 *
 * The result is deterministic for a fixed input (clustering uses input order).
 */
export function resolveJunctions(
    walls: readonly WallInput[],
    opts: ResolveOptions = {},
): WallMiter[] {
    const o: Required<ResolveOptions> = {
        snapEpsilonM: opts.snapEpsilonM ?? DEFAULT_SNAP,
        tProjectionEpsilonM: opts.tProjectionEpsilonM ?? DEFAULT_T_EPS,
    };
    const miters: WallMiter[] = walls.map(w => ({ id: w.id }));
    const junctions = detectJunctions(walls, o);
    for (const j of junctions) applyRingSweep(j, walls, miters);
    return miters;
}

// ─── Internal exports for testing ─────────────────────────────────────────────

export const __internal = {
    intersectLines, projectOnSeg, leftPerp, unit, clusterEndpoints, detectJunctions, buildSweepEntries,
};
