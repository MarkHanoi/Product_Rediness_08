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
// §WJ-SKEW / §WJ-SKEW-2 / §WJ-SKEW-3 / §WJ-SKEW-4 (2026-06-08/09, tracker §22.7/§22.10/§22.11/§22.12) —
// raised 0.05 → 0.20 → 0.45 → 0.60, then settled back to 0.50 + a per-endpoint room-safety guard.
// ROOT CAUSE of the rotated-plate wall-join cascade: the upstream weld fused endpoints
// only within 0.05 m, but the downstream WallJoinResolver CLUSTERS endpoints within its
// camera tolerance, clamped to [0.05, 1.0] m (≈0.5 m at a typical zoom). On a rotated
// plate the principal-axis snap leaves perimeter-intersection residuals, so two ends of
// ONE partition (or 3 endpoints of a Y-junction) land un-fused by the weld yet inside ONE
// resolver cluster → a degenerate "self-cluster" / `§MULTI-CLUSTER pinned=0 trimmed=3` →
// the wall(s) are dropped/trimmed (§WJR-INVALID) → the room gap merges adjacent rooms AND
// its window/door openings are orphaned (§22.7 ROOM-MERGE + WIN-DROP).
// WJ-SKEW first raised this to 0.20 m; §WJ-SKEW-2 to 0.45 m so the weld radius MATCHED the
// resolver's typical cluster band. §WJ-SKEW-3 raised it to 0.60 m to absorb a near-45°
// (~−44°) Y-junction residual that exceeds 0.45 m.
//
// §WJ-SKEW-4 (this change) — REGRESSION FIX: at 0.60 m the union-find began grabbing BOTH
// endpoints of a SHORT small-room partition (entrance hall ~7 m², corridor ~6 m²) and pulling
// them to two different cluster centroids — shortening / mis-placing the very wall that seals
// the small room, so room detection floods across the gap and merges adjacent rooms
// ("Bathroom + Entrance Hall", "Kitchen + Corridor"). The min-length DROP (0.05 m) only
// catches a FULL collapse, never the partial shortening / endpoint mis-placement that leaves
// a sub-wall gap. The robust fix is NOT to retreat the tolerance (that re-opens the §WJ-SKEW-3
// Y-junction) but to make the FUSE itself room-safe: before a clustered endpoint is collapsed
// to its centroid, check that doing so (a) keeps its partition ≥ a USABLE length and (b) does
// not move the endpoint more than the weld tolerance from its shell-snapped position. If either
// is violated the endpoint is EXCLUDED from the fuse — it keeps its shell-snapped position — so
// a genuine Y-junction whose members stay usable still fuses, but a short small-room partition
// is never shortened/mis-placed into a merge. With the guard in place the DEFAULT settles to
// 0.50 m: still well above the §WJ-SKEW-2 resolver band (so the common rotated case fuses
// directly) while the guard — not raw tolerance — handles the near-45° worst case AND protects
// small rooms. Because an axis-aligned subdivision produces clean COINCIDENT endpoints (zero
// movement → guard never triggers, both guard distances are 0), the guard + 0.50 m are a
// byte-identical NO-OP on axis-aligned plates. The self-endpoint guard (a wall's own two ends
// never fuse, line ~188) + the min-length drop both remain.
const DEFAULT_PARTITION_WELD_M = 0.50;
const DEFAULT_GRID_M = 0.001;
const EPS = 1e-9;

// §WJ-SKEW-4 guard thresholds (room-safety):
//   USABLE-MIN — a fused partition must stay ≥ this long, well above the 0.05 m degeneracy
//   floor (so a partial shortening is caught, not just a full collapse) and below a real
//   corridor strip (1.2 m) so genuine short walls are never falsely excluded.
const USABLE_MIN_LEN_M = 0.8;
//   MOVE-CAP — a fused endpoint may not travel more than this from its shell-snapped position.
//   Set equal to the default weld tolerance: a member of a genuine cluster sits within ~one
//   tolerance of the centroid, but an outlier endpoint dragged across a room boundary by
//   transitivity moves further — that one is excluded. Scales with the configured tolerance.
const MOVE_CAP_FACTOR = 1.0;

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

    // ── Pass 1.5: PARTITION-SPAN SNAP (§T-JUNCTION-WELD, 2026-06-08) ───────────────
    // Pass 1 snaps endpoints onto a SHELL wall's span; Pass 2 welds endpoint↔ENDPOINT.
    // NEITHER handles an interior T-junction — one partition ENDING on ANOTHER
    // partition's MID-SPAN (endpoint-to-midspan, not endpoint-to-endpoint). The editor's
    // WallJoinResolver then clusters that lone endpoint with nearby ones, finds no pinned
    // pair (`§MULTI-CLUSTER pinned=0 trimmed=N`), trims it back, and the resulting gap lets
    // RoomDetectionEngine FLOOD across the partition → the recurring "Living/Kitchen/Dining
    // merged into one 600 m² blob" defect (PM-6). FIX: before the endpoint weld, snap any
    // partition endpoint that lands within `shellSnapTolM` of ANOTHER partition's SPAN
    // INTERIOR exactly onto that span, so the T closes on the host centreline and the
    // resolver sees a real (pinnable) junction. Segments are snapshotted from the
    // shell-snapped endpoints so the pass is order-independent. Byte-identical on a clean
    // axis-aligned plate (its endpoints are already coincident at corners, not mid-span).
    const spanSegs = partitions.map((_, i) => unitSeg(eps[i * 2]!, eps[i * 2 + 1]!));
    const TJUNC_MARGIN_M = 0.10;   // only the span INTERIOR — near-end cases belong to Pass 2
    for (let i = 0; i < eps.length; i++) {
        const ownPart = i >> 1;
        let bestPerp = shellSnapTolM;
        let best: { x: number; z: number } | null = null;
        for (let q = 0; q < spanSegs.length; q++) {
            if (q === ownPart) continue;                 // never snap onto its own span
            const s = spanSegs[q]!;
            if (s.len < EPS) continue;
            const c = closestOnSeg(eps[i]!, s);
            // Genuine T-junction: perpendicular hit strictly INSIDE the host span.
            if (c.perp < bestPerp && c.along > TJUNC_MARGIN_M && c.along < s.len - TJUNC_MARGIN_M) {
                bestPerp = c.perp; best = { x: c.x, z: c.z };
            }
        }
        if (best) { eps[i]!.x = best.x; eps[i]!.z = best.z; }
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

    // Pre-compute every endpoint's cluster centroid (a singleton's centroid is itself), so
    // the room-safety length guard below can measure a partition's prospective length against
    // BOTH ends' fused positions — catching the both-ends-pulled-inward shortening, not just a
    // single end moving.
    const centroidX = new Array<number>(n);
    const centroidZ = new Array<number>(n);
    for (const members of clusters.values()) {
        let sx = 0, sz = 0;
        for (const m of members) { sx += eps[m]!.x; sz += eps[m]!.z; }
        const px = snapToGrid(sx / members.length), pz = snapToGrid(sz / members.length);
        for (const m of members) { centroidX[m] = px; centroidZ[m] = pz; }
    }

    // §WJ-SKEW-4 — ROOM-SAFE cluster collapse. Each cluster member is moved to the cluster
    // centroid ONLY IF that move keeps its partition usable (≥ USABLE_MIN_LEN_M) AND the
    // endpoint travels ≤ the weld tolerance (MOVE_CAP) from its shell-snapped position. A
    // member that would VIOLATE either guard is EXCLUDED from the fuse: it keeps its
    // shell-snapped position, so a short small-room partition is never shortened or
    // mis-placed across a room boundary, while a genuine Y-junction (members close to the
    // centroid, both arms long) still fuses cleanly. The length guard measures against the
    // OTHER end's PROSPECTIVE fused position (its own cluster centroid) — so a partition whose
    // BOTH ends are pulled inward by neighbouring junctions is caught (the combined shortening
    // is seen, not just one end). Using the precomputed centroids keeps the pass fully
    // deterministic and order-independent. On axis-aligned plates the centroid equals the
    // coincident endpoints so both guard distances are 0 → no exclusion (byte-identical no-op).
    const moveCapSq = (partitionWeldTolM * MOVE_CAP_FACTOR) * (partitionWeldTolM * MOVE_CAP_FACTOR);
    const usableMinSq = USABLE_MIN_LEN_M * USABLE_MIN_LEN_M;
    const welded = new Array<{ x: number; z: number }>(n);
    for (const members of clusters.values()) {
        const px = centroidX[members[0]!]!, pz = centroidZ[members[0]!]!;
        for (const m of members) {
            // The other endpoint of this partition, at its PROSPECTIVE fused position.
            const ox = centroidX[m ^ 1]!, oz = centroidZ[m ^ 1]!;
            const newLenSq = (px - ox) * (px - ox) + (pz - oz) * (pz - oz);
            const moveSq = (px - eps[m]!.x) * (px - eps[m]!.x) + (pz - eps[m]!.z) * (pz - eps[m]!.z);
            // EXCLUDE the move if it would over-shorten the partition or drag the endpoint
            // too far (across a room boundary). A singleton cluster trivially passes
            // (centroid === endpoint → moveSq 0, length unchanged).
            if (newLenSq < usableMinSq || moveSq > moveCapSq) {
                welded[m] = { x: snapToGrid(eps[m]!.x), z: snapToGrid(eps[m]!.z) };
            } else {
                welded[m] = { x: px, z: pz };
            }
        }
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
