// §GROUND-WELD (A.21.D39, 2026-06-07) — weld interior partitions to a pre-drawn shell.
//
// THE DEFECT (recurring D14/D25/D28/D34/D36): on the GROUND floor of a generated
// multi-storey house the interior partition walls are emitted but room detection
// finds only ONE merged room — while the UPPER floors subdivide fine. The upper
// storeys build their shell with the SAME emitter that produced the partitions
// (`_buildPerimeterShell` → the footprint ring), so partition endpoints land
// exactly on the shell edges. The GROUND reuses the user's PRE-DRAWN shell (drawn
// edge-by-edge, then mitred/trimmed by the editor's WallJoinResolver, then raised
// by D38's UpdateWallHeightCommand) — so a partition endpoint that SHOULD terminate
// on the shell can sit > the RoomDetectionEngine's 20 mm node grid away from the
// actual (post-miter) shell-wall centreline, and the loop never closes →
// `rooms_total=1`.
//
// The robust, GENERAL fix (NOT another per-plot patch): before room detection runs,
// WELD every interior partition endpoint that is near a shell wall ONTO that shell
// wall's centreline, and weld coincident partition↔partition endpoints to a single
// shared point. This is the exact guarantee `repairSegments` gives WITHIN the engine,
// extended across the editor's separately-built shell — so the ground floor closes
// every room the same way the upper floors do, independent of how the shell was
// produced or how far the editor moved its endpoints.
//
// PURE + DETERMINISTIC L2 — no stores, no DOM, no THREE. The editor's
// HouseLayoutExecutor calls this over the GROUND interior partitions + the gathered
// (pre-drawn) shell walls, then dispatches the welded partitions.

export interface XZ { readonly x: number; readonly z: number }

/** A wall the weld operates on. `id` is preserved; only endpoints move. World METRES. */
export interface WeldWall {
    readonly id: string;
    readonly start: XZ;
    readonly end: XZ;
}

export interface WeldOptions {
    /** Max perpendicular distance (m) for a partition endpoint to be welded ONTO a
     *  shell wall line. Default 0.30 m — matches RoomDetectionEngine's corner-snap
     *  threshold (`_snapNearbyCorners`), comfortably covering a 0.2 m shell wall's
     *  half-thickness + miter overrun without fusing genuinely distinct geometry. */
    readonly shellSnapTolM?: number;
    /** Max distance (m) for two partition endpoints to be welded together. Default
     *  0.05 m — below any real room dimension, above float / grid dust. */
    readonly partitionWeldTolM?: number;
    /** Final coordinate grid (m) so welded coords are stable + reproducible and a
     *  weld never straddles the 20 mm detection node grid. Default 0.001 m. */
    readonly gridM?: number;
}

const DEFAULT_SHELL_SNAP_M = 0.30;
const DEFAULT_PARTITION_WELD_M = 0.05;
const DEFAULT_GRID_M = 0.001;
const EPS = 1e-9;

interface UnitSeg { readonly ax: number; readonly az: number; readonly ux: number; readonly uz: number; readonly len: number }

function unitSeg(a: XZ, b: XZ): UnitSeg {
    const dx = b.x - a.x, dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len < EPS) return { ax: a.x, az: a.z, ux: 1, uz: 0, len: 0 };
    return { ax: a.x, az: a.z, ux: dx / len, uz: dz / len, len };
}

/** Closest point on segment `s` to `p`, plus the perpendicular distance + along param. */
function closestOnSeg(p: XZ, s: UnitSeg): { x: number; z: number; perp: number; along: number } {
    if (s.len < EPS) return { x: s.ax, z: s.az, perp: Math.hypot(p.x - s.ax, p.z - s.az), along: 0 };
    const rx = p.x - s.ax, rz = p.z - s.az;
    const t = Math.max(0, Math.min(s.len, rx * s.ux + rz * s.uz));
    const cx = s.ax + s.ux * t, cz = s.az + s.uz * t;
    return { x: cx, z: cz, perp: Math.hypot(p.x - cx, p.z - cz), along: t };
}

/**
 * Weld interior partition endpoints onto the pre-drawn shell + to each other so the
 * combined (shell + partitions) graph has EXACT shared junction coordinates and the
 * room detector closes every enclosed area.
 *
 * Algorithm (deterministic, two passes):
 *   1. SHELL SNAP — for each partition endpoint, find the closest shell wall whose
 *      perpendicular distance is within `shellSnapTolM`; if found, move the endpoint
 *      to the exact closest point on that shell line. (The shell walls are NOT
 *      moved — they are the authoritative perimeter.)
 *   2. PARTITION WELD — union-find cluster the (possibly shell-snapped) partition
 *      endpoints within `partitionWeldTolM`; set every member of a cluster to the
 *      cluster mean. Endpoints already snapped to the SAME shell point fall into one
 *      cluster and stay coincident.
 *   3. GRID SNAP — round every coordinate to `gridM` so welds are bit-stable.
 *
 * The shell walls are returned UNCHANGED. Degenerate partitions (collapsed below the
 * editor's 0.05 m min-wall length by the weld) are DROPPED so no phantom wall reaches
 * the resolver. Door host offsets are unaffected (offsets are distances ALONG a wall;
 * we only move endpoints, and a partition's host-wall length is preserved within the
 * weld tolerance — the editor clamps any door that no longer fits, same as today).
 *
 * Returns the welded partition list (same ids, dropped degenerates excluded).
 */
export function weldPartitionsToShell(
    partitions: readonly WeldWall[],
    shellWalls: readonly WeldWall[],
    options: WeldOptions = {},
): WeldWall[] {
    const shellSnapTolM = options.shellSnapTolM ?? DEFAULT_SHELL_SNAP_M;
    const partitionWeldTolM = options.partitionWeldTolM ?? DEFAULT_PARTITION_WELD_M;
    const gridM = options.gridM ?? DEFAULT_GRID_M;
    const snapToGrid = (n: number): number => Math.round(n / gridM) * gridM;
    const MIN_LEN_M = 0.05;     // editor's WallJoinResolver degeneracy floor

    const shellSegs = shellWalls.map(w => unitSeg(w.start, w.end));

    // Working endpoint list — two per partition (mutable copies).
    interface Ep { x: number; z: number }
    const eps: Ep[] = [];
    for (const w of partitions) {
        eps.push({ x: w.start.x, z: w.start.z });
        eps.push({ x: w.end.x, z: w.end.z });
    }

    // ── Pass 1: SHELL SNAP ───────────────────────────────────────────────────────
    for (const ep of eps) {
        let bestPerp = shellSnapTolM;
        let best: { x: number; z: number } | null = null;
        for (const s of shellSegs) {
            if (s.len < EPS) continue;
            const c = closestOnSeg(ep, s);
            if (c.perp < bestPerp) { bestPerp = c.perp; best = { x: c.x, z: c.z }; }
        }
        if (best) { ep.x = best.x; ep.z = best.z; }
    }

    // ── Pass 2: PARTITION WELD (union-find on the shell-snapped endpoints) ─────────
    const n = eps.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
    const union = (i: number, j: number): void => { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; };
    const tolSq = partitionWeldTolM * partitionWeldTolM;
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            // Never weld a partition's own two endpoints together (would collapse it).
            if ((i >> 1) === (j >> 1)) continue;
            const dx = eps[i]!.x - eps[j]!.x, dz = eps[i]!.z - eps[j]!.z;
            if (dx * dx + dz * dz <= tolSq) union(i, j);
        }
    }
    const clusters = new Map<number, number[]>();
    for (let i = 0; i < n; i++) (clusters.get(find(i)) ?? clusters.set(find(i), []).get(find(i))!).push(i);
    const welded = new Array<{ x: number; z: number }>(n);
    for (const members of clusters.values()) {
        let sx = 0, sz = 0;
        for (const m of members) { sx += eps[m]!.x; sz += eps[m]!.z; }
        const px = snapToGrid(sx / members.length), pz = snapToGrid(sz / members.length);
        for (const m of members) welded[m] = { x: px, z: pz };
    }

    // ── Pass 3: rebuild partitions; drop weld-collapsed / sub-min-length stubs ─────
    const out: WeldWall[] = [];
    for (let i = 0; i < partitions.length; i++) {
        const a = welded[i * 2]!;
        const b = welded[i * 2 + 1]!;
        if (Math.hypot(b.x - a.x, b.z - a.z) < MIN_LEN_M) continue;
        out.push({ id: partitions[i]!.id, start: { x: a.x, z: a.z }, end: { x: b.x, z: b.z } });
    }
    return out;
}
