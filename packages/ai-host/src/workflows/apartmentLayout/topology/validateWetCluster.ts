// T2.4 — `validateWetCluster` pure validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §19.2 T2.4).
//
// Wet rooms (kitchen + bathroom + ensuite + wc + utility) SHOULD cluster around
// a shared vertical plumbing stack. The Part B framework §3.B treats wet-zone
// fragmentation as a SOFT penalty scaled by the number of distinct stack groups.
//
// "Stack group" today is approximated by the SHARED-WALL graph over wet rooms:
// two wet rooms in the same group iff they share a wall (transitively). A
// single group ⇒ perfectly clustered; N groups ⇒ N − 1 plumbing penalty units.
//
// Pure: reads room placements + nothing else. Produces only SOFT findings.

import type { BubbleGraph } from '../tgl/bubbleGraph.js';
import { WET_ROOM_TYPES } from './adjacencyRules.js';
import type { TopologyFinding, TopologyValidation } from './types.js';

/**
 * Minimal room placement consumed by the validator — id + axis-aligned rect.
 * Mirrors `RoomPlacement` (subdivide.ts) without importing it.
 */
export interface WetRoomPlacement {
    readonly id: string;
    readonly rect: { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number };
}

const SHARE_TOL = 0.05; // metres — two walls "share" if collinear within 5 cm

/**
 * Two axis-aligned rectangles share a wall iff:
 *   (a) one's right edge ≈ the other's left edge AND z-ranges overlap, OR
 *   (b) vice versa horizontally, OR
 *   (c) one's top edge ≈ the other's bottom edge AND x-ranges overlap, OR
 *   (d) vice versa vertically.
 */
function rectsShareWall(
    a: WetRoomPlacement['rect'],
    b: WetRoomPlacement['rect'],
): boolean {
    const zOverlap = Math.max(a.z0, b.z0) < Math.min(a.z1, b.z1) - SHARE_TOL;
    const xOverlap = Math.max(a.x0, b.x0) < Math.min(a.x1, b.x1) - SHARE_TOL;
    const vert =
        (Math.abs(a.x1 - b.x0) < SHARE_TOL || Math.abs(b.x1 - a.x0) < SHARE_TOL) && zOverlap;
    const horiz =
        (Math.abs(a.z1 - b.z0) < SHARE_TOL || Math.abs(b.z1 - a.z0) < SHARE_TOL) && xOverlap;
    return vert || horiz;
}

/**
 * Validate wet-room clustering. Returns SOFT findings scaled by the number of
 * distinct stack groups: a single group ⇒ no penalty; N groups ⇒ N − 1
 * `wetFragmentation` findings each with delta = 1 / numWet.
 */
export function validateWetCluster(
    bubble: BubbleGraph,
    placements: readonly WetRoomPlacement[],
): TopologyValidation {
    // Extract wet rooms with their rectangles. Match placement id ↔ bubble room.
    const typeById = new Map<string, string>();
    for (const r of bubble.rooms) typeById.set(r.id, r.type);
    const wets: WetRoomPlacement[] = [];
    for (const p of placements) {
        const t = typeById.get(p.id);
        if (t && WET_ROOM_TYPES.has(t as never)) wets.push(p);
    }
    if (wets.length <= 1) {
        // Zero or one wet room — no cluster to fragment.
        return { admissible: true, hardFindings: [], softFindings: [] };
    }

    // Union-Find over the shared-wall graph.
    const parent: number[] = wets.map((_, i) => i);
    const find = (i: number): number => { while (parent[i]! !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
    const union = (a: number, b: number): void => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
    for (let i = 0; i < wets.length; i++) {
        for (let j = i + 1; j < wets.length; j++) {
            if (rectsShareWall(wets[i]!.rect, wets[j]!.rect)) union(i, j);
        }
    }
    const groups = new Set<number>();
    for (let i = 0; i < wets.length; i++) groups.add(find(i));
    const numGroups = groups.size;
    if (numGroups <= 1) {
        return { admissible: true, hardFindings: [], softFindings: [] };
    }

    // Each ADDITIONAL group beyond one is one penalty unit; per-finding delta is
    // 1 / numWet so the aggregate penalty stays bounded.
    const soft: TopologyFinding[] = [];
    const delta = 1 / wets.length;
    const numExtra = numGroups - 1;
    for (let k = 0; k < numExtra; k++) {
        soft.push({
            category: 'wetCluster', severity: 'soft', metric: 'wetFragmentation',
            roomIdA: wets[0]!.id, delta,
            reason: `wet rooms split across ${numGroups} stack groups (${numExtra} extra plumbing run${numExtra === 1 ? '' : 's'})`,
        });
    }
    return { admissible: true, hardFindings: [], softFindings: soft };
}
