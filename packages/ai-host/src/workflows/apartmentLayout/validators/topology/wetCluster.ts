// A-6 — Wet-cluster validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §A-class table, §A-6 row.)
//
// Pure function over POJO rooms + an unordered adjacency edge list. Returns
// one TopologyViolation per wet-room that is NOT clustered with at least one
// other wet-room.
//
// Why A-6 is a WARNING (not an error like A-1 / A-3 / A-4):
//   Wet-cluster is a CONSTRUCTION-EFFICIENCY heuristic — clustering wet rooms
//   reduces vertical plumbing-riser and waste-stack runs, simplifies the
//   service core, and lowers cost. None of that is a regulatory or
//   admissibility blocker; a non-clustered wet room is BUILDABLE, just
//   sub-optimal. The Pareto rank applies a soft penalty; the modal surfaces
//   A-6 as an advisory chip the user can knowingly accept.
//
// RELATIONSHIP TO A-3 (forbiddenAdjacency):
//   A-3 blocks SOME wet-to-wet adjacencies (notably bathroom↔kitchen,
//   wc↔kitchen, wc↔dining_room — but dining_room isn't wet). A-6 does NOT
//   override A-3: a wet-room satisfies A-6 only via a PERMITTED neighbour
//   (e.g. bathroom↔utility_room, kitchen↔utility_room, wc↔bathroom). When
//   bathroom is adjacent ONLY to kitchen the layout will simultaneously fail
//   A-3 (error) and A-6 will see a wet-room with one wet-room neighbour, so
//   A-6 reports clean; this is the intended decoupling — the two classes are
//   independent angles on the same defect, and A-3's hard reject already
//   forces a fix.
//
// Design rules (identical to A-1 / A-2 / A-3 / A-4 / A-5):
//   • NO imports from `tgl/bubbleGraph.ts`.
//   • NO imports from `rules/programRules.ts`.
//   • The canonical wet-fixture type set lives INLINE here as `WET_TYPES`.

import type { AdjacencyEdge, TopologyViolation } from './types.js';

/**
 * The canonical residential WET-FIXTURE room type set. A wet room is one
 * with one or more plumbed fixtures (basin, WC, shower, bath, sink, washing
 * machine) and an associated drainage stack — these are the rooms whose
 * clustering saves vertical service runs.
 *
 *  • bathroom      — basin + bath / shower + WC
 *  • wc            — WC + basin (cloakroom / guest WC)
 *  • ensuite       — basin + shower + WC (private to a bedroom)
 *  • kitchen       — sink + (often) dishwasher; major drainage demand
 *  • utility_room  — washing machine + utility sink; major drainage demand
 *  • utility       — alias for utility_room (older programme name)
 *
 * Order is documentary; the validator iterates rooms, not the type list.
 */
export const WET_TYPES: ReadonlyArray<string> = [
    'bathroom',
    'wc',
    'ensuite',
    'kitchen',
    'utility_room',
    'utility',
];

/**
 * Whether `(aId, bId)` appears as an edge in `edges` (either orientation).
 * The adjacency relation is symmetric.
 */
function hasEdge(edges: ReadonlyArray<AdjacencyEdge>, aId: string, bId: string): boolean {
    for (const e of edges) {
        if ((e.aId === aId && e.bId === bId) || (e.aId === bId && e.bId === aId)) return true;
    }
    return false;
}

/**
 * Validate the wet-cluster rule against a realised layout.
 *
 * Algorithm:
 *   1. Collect every wet-room (`type` in WET_TYPES) from `rooms`.
 *   2. If only ONE wet-room exists in the apartment, the cluster rule is
 *      trivially satisfied — emit ZERO violations (a single-wet-room
 *      apartment cannot meaningfully "cluster").
 *   3. Otherwise, for each wet-room, count its wet-room neighbours (via
 *      `edges`). If the count is zero, emit ONE violation.
 *
 *  - `rooms` is a flat list of `{ id, type }` — used to enumerate wet rooms
 *    and to look up edge-endpoint types.
 *  - `edges` is the realised adjacency set; symmetric, the validator never
 *    tests orientation. Edges referencing room ids not in `rooms` are
 *    silently ignored.
 *
 * Pure: same `(rooms, edges)` ⇒ same violation list. Violations are emitted
 * in rooms-array order so test assertions can rely on stable output.
 */
export function validateWetCluster(
    rooms: ReadonlyArray<{ id: string; type: string }>,
    edges: ReadonlyArray<AdjacencyEdge>,
): TopologyViolation[] {
    const wetSet = new Set<string>(WET_TYPES);
    const wetRooms = rooms.filter(r => wetSet.has(r.type));

    // Trivial-cluster short-circuit: a single wet-room can't fail to cluster.
    if (wetRooms.length <= 1) return [];

    // Pre-index wet-room ids for O(1) neighbour-type membership tests.
    const wetIds = new Set<string>(wetRooms.map(r => r.id));

    const violations: TopologyViolation[] = [];
    const totalWet = wetRooms.length;

    for (const room of wetRooms) {
        // Count wet-room neighbours via the symmetric edge relation.
        let wetNeighbours = 0;
        for (const other of wetRooms) {
            if (other.id === room.id) continue;
            if (!wetIds.has(other.id)) continue;
            if (hasEdge(edges, room.id, other.id)) wetNeighbours += 1;
        }
        if (wetNeighbours > 0) continue;

        violations.push({
            classId: 'A-6',
            severity: 'warning',
            roomAId: room.id,
            roomATypeName: room.type,
            roomBTypeName: 'wet-cluster',
            message:
                `[${room.id}] (${room.type}) ↛ wet-cluster: ` +
                `wet-room ${room.type} not clustered: 0 wet-room neighbours ` +
                `despite ${totalWet} wet-rooms in apartment`,
        });
    }
    return violations;
}
