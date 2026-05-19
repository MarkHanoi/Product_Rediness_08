import * as THREE from '@pryzm/renderer-three/three';
import { WallData } from './WallTypes';

// ─── Public types ─────────────────────────────────────────────────────────────

export type EndpointSide = 'start' | 'end';

export interface ClusterEndpoint {
    wallId: string;
    side:   EndpointSide;
}

/**
 * A group of 3+ wall endpoints that are all within `snapRadius` of each other.
 * These are multi-wall junctions (Y-junctions, star junctions, …) that cannot
 * be correctly handled by the existing pair-wise corner-join loop because the
 * `seen` set lets only ONE corner pair per endpoint register — the remaining
 * pairs are silently dropped or misclassified as T-joins.
 */
export interface JunctionCluster {
    /** All participating endpoints (always ≥ 3). */
    endpoints:      ClusterEndpoint[];
    /**
     * Best geometric meeting point for this cluster.
     * Computed as the average of all valid pairwise centerline-centerline
     * intersections.  Falls back to the centroid of raw endpoint positions if
     * no intersection is computable (e.g. parallel walls).
     */
    consensusPoint: THREE.Vector3;
}

// ─── detectJunctionClusters ───────────────────────────────────────────────────

/**
 * Groups wall endpoints into junction clusters.
 *
 * Algorithm:
 *   1. List every (wallId, side) endpoint pair (2 per wall).
 *   2. Union-Find: merge any two endpoints from *different* walls when their
 *      positions are within `snapRadius` of each other.
 *   3. Collect Union-Find groups that have ≥ 3 members — these are multi-wall
 *      junctions requiring special handling.
 *   4. For each qualifying group, compute the `consensusPoint`:
 *        a. Try every pair of walls in the group.  Use 2-D line-line
 *           intersection of their centerlines (not just the endpoint pair).
 *        b. Average all valid intersection points → robust consensus.
 *        c. Fallback: centroid of raw endpoint positions.
 *
 * Pure computation — no store writes, no scene access.
 *
 * @param walls      All walls on the level (frozen WallData records).
 * @param bl         Working baseline map (may have been adjusted by prior joins).
 * @param snapRadius Distance threshold for endpoint proximity (metres).
 */
export function detectJunctionClusters(
    walls:       WallData[],
    bl:          Map<string, [THREE.Vector3, THREE.Vector3]>,
    snapRadius:  number,
): JunctionCluster[] {

    if (walls.length < 3) return [];   // Need ≥ 3 walls for a multi-wall cluster.

    // ── 1. Build flat endpoint list ───────────────────────────────────────────
    const endpoints: ClusterEndpoint[] = [];
    for (const wall of walls) {
        endpoints.push({ wallId: wall.id, side: 'start' });
        endpoints.push({ wallId: wall.id, side: 'end'   });
    }
    const n = endpoints.length;

    // ── 2. Union-Find ─────────────────────────────────────────────────────────
    const parent = endpoints.map((_, i) => i);
    const rank   = new Array<number>(n).fill(0);

    function find(i: number): number {
        if (parent[i] !== i) parent[i] = find(parent[i]);
        return parent[i];
    }

    function unite(i: number, j: number): void {
        const ri = find(i), rj = find(j);
        if (ri === rj) return;
        if (rank[ri] < rank[rj]) { parent[ri] = rj; }
        else if (rank[ri] > rank[rj]) { parent[rj] = ri; }
        else { parent[rj] = ri; rank[ri]++; }
    }

    for (let i = 0; i < n; i++) {
        const epI = endpoints[i];
        const posI = _getPos(epI, bl);

        for (let j = i + 1; j < n; j++) {
            const epJ = endpoints[j];
            // Skip endpoints belonging to the same wall — they can never form a
            // junction with each other (they are the two ends of a single wall).
            if (epI.wallId === epJ.wallId) continue;

            const posJ = _getPos(epJ, bl);
            if (posI.distanceTo(posJ) <= snapRadius) {
                unite(i, j);
            }
        }
    }

    // ── 3. Collect groups with ≥ 3 members ────────────────────────────────────
    const groups = new Map<number, ClusterEndpoint[]>();
    for (let i = 0; i < n; i++) {
        const root = find(i);
        if (!groups.has(root)) groups.set(root, []);
        groups.get(root)!.push(endpoints[i]);
    }

    const clusters: JunctionCluster[] = [];

    for (const [, members] of groups) {
        if (members.length < 3) continue;

        // ── 4. Compute consensus point ─────────────────────────────────────
        const consensusPoint = _computeConsensusPoint(members, bl);
        clusters.push({ endpoints: members, consensusPoint });

        // PERF-FIX (Apr 2026): Gate noisy per-cluster log behind opt-in flag.
        if ((globalThis as any).window?.__pryzmDebugWalls) {
            console.log(
                `[WallJunctionClustering] Cluster detected: ${members.length} endpoints → ` +
                `consensus=(${consensusPoint.x.toFixed(3)}, ${consensusPoint.z.toFixed(3)})`
            );
        }
    }

    return clusters;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _getPos(
    ep: ClusterEndpoint,
    bl: Map<string, [THREE.Vector3, THREE.Vector3]>,
): THREE.Vector3 {
    const [ws, we] = bl.get(ep.wallId)!;
    return ep.side === 'start' ? ws : we;
}

/**
 * Computes the best geometric meeting point for a multi-wall cluster.
 *
 * Strategy:
 *   FIRST check for a "committed corner" — two endpoints from different walls
 *   that are already exactly coincident (within PINNED_TOLERANCE).  This happens
 *   when the user connects a new wall to an existing corner between two walls that
 *   were already joined.  In that case the two original walls' shared position is
 *   the true, user-placed anchor and must NOT be moved.  We return it directly.
 *
 *   Only when no committed corner exists do we fall back to averaging centerline-
 *   centerline intersections (the original logic for fresh Y/star junctions where
 *   no two walls are pre-joined).
 *
 *   Without this guard, all three walls are trimmed to a freshly-computed consensus
 *   that may differ from the original corner, displacing the two pre-existing walls.
 */
const PINNED_TOLERANCE = 0.001; // 1 mm — endpoints within this are "already joined"

function _computeConsensusPoint(
    members: ClusterEndpoint[],
    bl:      Map<string, [THREE.Vector3, THREE.Vector3]>,
): THREE.Vector3 {

    // ── Priority 1: committed corner (two endpoints already exactly coincident) ──
    // Iterate over all pairs of members from DIFFERENT walls.  If any two share
    // an exact position (within 1 mm) that corner is the pinned anchor — return it
    // immediately without touching the other walls' intersection math.
    for (let i = 0; i < members.length; i++) {
        const posI = _getPos(members[i], bl);
        for (let j = i + 1; j < members.length; j++) {
            if (members[i].wallId === members[j].wallId) continue; // same wall — skip
            const posJ = _getPos(members[j], bl);
            if (posI.distanceTo(posJ) <= PINNED_TOLERANCE) {
                // Return the midpoint of the two coincident positions (effectively
                // identical) so floating-point noise is averaged out.
                return new THREE.Vector3(
                    (posI.x + posJ.x) * 0.5,
                    (posI.y + posJ.y) * 0.5,
                    (posI.z + posJ.z) * 0.5,
                );
            }
        }
    }

    // ── Priority 2: average of centerline-centerline intersections ──────────────
    // Used for fresh Y/star junctions where no two endpoints are pre-joined.
    const wallIds = [...new Set(members.map(m => m.wallId))];
    const intersections: THREE.Vector3[] = [];

    for (let i = 0; i < wallIds.length; i++) {
        const [aS, aE] = bl.get(wallIds[i])!;

        for (let j = i + 1; j < wallIds.length; j++) {
            const [bS, bE] = bl.get(wallIds[j])!;
            const ix = _intersect2D(aS, aE, bS, bE);
            if (ix) intersections.push(ix);
        }
    }

    if (intersections.length > 0) {
        const sum = new THREE.Vector3();
        for (const p of intersections) sum.add(p);
        return sum.divideScalar(intersections.length);
    }

    // ── Priority 3: centroid of raw endpoint positions (last resort) ─────────────
    const sum = new THREE.Vector3();
    for (const m of members) sum.add(_getPos(m, bl));
    return sum.divideScalar(members.length);
}

/** 2-D (XZ) infinite-line intersection. Returns null if lines are parallel. */
function _intersect2D(
    a0: THREE.Vector3, a1: THREE.Vector3,
    b0: THREE.Vector3, b1: THREE.Vector3,
): THREE.Vector3 | null {
    const dax = a1.x - a0.x, daz = a1.z - a0.z;
    const dbx = b1.x - b0.x, dbz = b1.z - b0.z;
    const denom = dax * dbz - daz * dbx;
    if (Math.abs(denom) < 1e-9) return null;
    const t = ((b0.x - a0.x) * dbz - (b0.z - a0.z) * dbx) / denom;
    // Preserve Y from the first line's start point (all walls share the same floor Y).
    return new THREE.Vector3(a0.x + t * dax, a0.y, a0.z + t * daz);
}
