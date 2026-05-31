// A-8 — Sequencing validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §A-class table, §A-8 row.)
//
// Codifies the residential ARRIVAL-SEQUENCE rule: from the entrance vertex,
// the BFS depth of each room class roughly increases with privacy. The user
// should encounter spaces in increasing privacy gradient as they walk into
// the apartment — public foyer / circulation FIRST, social rooms SECOND,
// private bedrooms LAST, ensuites DEEPEST.
//
// A-8 vs A-4:
//   A-4 (privacy gradient) fires on DIRECT-EDGE defects: a bedroom whose
//   only non-bedroom neighbour is another bedroom, or an ensuite reachable
//   from a non-bedroom. It does NOT need a graph search.
//   A-8 (sequencing) fires on TOPOLOGICAL-DEPTH defects: a bedroom that is
//   reachable from the entrance FEWER steps than the social rooms (i.e. the
//   visitor hits a bedroom door before they hit a living-room door). It
//   requires a BFS from the entrance vertex.
//
// Concrete v1 rule set (sequencing axes):
//   (1) depth(any bedroom)   >= depth(any social room)
//       — a bedroom must NOT be encountered earlier than the social rooms
//   (2) depth(ensuite)        >  depth(its host bedroom)
//       — an ensuite must be hosted FROM the bedroom (one step deeper)
//   (3) depth(any habitable)  <  Infinity
//       — every room must be reachable from the entrance at all
//
// Why A-8 is a WARNING (not an error):
//   A sub-optimal sequence is still LEGAL in every residential code we know
//   of. The framework intentionally treats sequencing as a soft penalty so
//   the Pareto optimiser can trade it against shape / fit quality. The
//   modal-side surfacer renders A-8 violations as "sequence sub-optimal"
//   rather than blocking the candidate. Unreachable rooms are also emitted
//   under A-8 (rule 3) — they're a separate kind of sequencing failure (no
//   sequence at all) and still warning-severity because the upstream
//   adjacency / door-build pipeline is the canonical fix path.
//
// Design rules (identical to A-1 … A-7):
//   • NO imports from `tgl/bubbleGraph.ts`.
//   • NO imports from `rules/programRules.ts`.
//   • Pure: same `(rooms, edges, entranceRoomId)` ⇒ same violation list.
//   • Skip the entire validator if no entrance room exists in `rooms`
//     (defensive — sequencing without an entrance is undefined).

import type { AdjacencyEdge, TopologyViolation } from './types.js';

/**
 * Social room types — primary daytime / shared-use spaces. A visitor walking
 * into the apartment should encounter at least one of these BEFORE reaching
 * any bedroom. Aliases (`living`, `dining`) are accepted because programme
 * naming has historically drifted; the canonical form is the longer name.
 */
const SOCIAL_TYPES: ReadonlySet<string> = new Set([
    'living_room',
    'living',
    'dining_room',
    'dining',
    'family_room',
]);

/** Bedroom-family types — both count as a "private room" for rule (1). */
const BEDROOM_TYPES: ReadonlySet<string> = new Set([
    'bedroom',
    'master_bedroom',
    'master',
]);

/**
 * BFS over the undirected adjacency graph defined by `edges`, starting at
 * `entranceRoomId`. Returns a map of `roomId → depth` for every room that
 * appears in `rooms`. Rooms unreachable from the entrance receive depth
 * `Infinity`. The entrance itself is depth `0`.
 *
 * Iteration order is queue-driven (FIFO) so a given BFS layer is visited in
 * insertion order — deterministic for a given `rooms` + `edges`.
 */
function bfsDepths(
    rooms: ReadonlyArray<{ id: string; type: string }>,
    edges: ReadonlyArray<AdjacencyEdge>,
    entranceRoomId: string,
): Map<string, number> {
    // Build symmetric adjacency: roomId → array of neighbour ids.
    const known = new Set<string>();
    for (const r of rooms) known.add(r.id);

    const adj = new Map<string, string[]>();
    for (const r of rooms) adj.set(r.id, []);
    for (const e of edges) {
        if (!known.has(e.aId) || !known.has(e.bId)) continue;  // dangling edge
        adj.get(e.aId)!.push(e.bId);
        adj.get(e.bId)!.push(e.aId);
    }

    // BFS. Init every known room to Infinity, then walk.
    const depth = new Map<string, number>();
    for (const r of rooms) depth.set(r.id, Number.POSITIVE_INFINITY);
    depth.set(entranceRoomId, 0);

    const queue: string[] = [entranceRoomId];
    let head = 0;
    while (head < queue.length) {
        const cur = queue[head++]!;
        const d = depth.get(cur)!;
        for (const next of adj.get(cur) ?? []) {
            if (depth.get(next) === Number.POSITIVE_INFINITY) {
                depth.set(next, d + 1);
                queue.push(next);
            }
        }
    }
    return depth;
}

/**
 * The input shape for the A-8 sequencing validator. Mirrors the other A-class
 * stand-alone validators (POJO `rooms` + `edges`) and adds the entrance
 * vertex id — sequencing is undefined without an arrival point.
 */
export interface SequencingInput {
    readonly rooms: ReadonlyArray<{ id: string; type: string }>;
    readonly edges: ReadonlyArray<AdjacencyEdge>;
    readonly entranceRoomId: string;
}

/**
 * Validate the sequencing rule against a realised layout.
 *
 * Algorithm:
 *   1. If `rooms` does not contain a room with id === `entranceRoomId`,
 *      return `[]` (defensive — sequencing has no meaning without an
 *      arrival vertex).
 *   2. BFS over the symmetric `edges` graph from `entranceRoomId`. Record
 *      depth per room; unreachable rooms get `Infinity`.
 *   3. If there is at least one social room AND at least one bedroom:
 *        compute `maxSocialDepth = max(depth) over reachable social rooms`.
 *        For each REACHABLE bedroom whose depth < maxSocialDepth, emit ONE
 *        violation ("bedroom shallower than social rooms — privacy gradient
 *        sequencing violated"). (If NO social rooms are reachable we skip
 *        this rule — the comparator is undefined.)
 *   4. For each ensuite, find its host bedroom (the adjacent room whose
 *      type is in BEDROOM_TYPES). If the ensuite has NO bedroom neighbour
 *      we DO NOT emit here — A-4 (privacy gradient) already covers the
 *      orphan-ensuite case as an error; double-firing would noise the
 *      modal. If the ensuite IS hosted but its depth ≤ host depth, emit
 *      ONE violation ("ensuite at depth X is not deeper than its host
 *      bedroom at depth Y — sequence sub-optimal").
 *   5. For each room with depth === Infinity, emit ONE violation
 *      ("<type> at <id> is unreachable from entrance — sequencing graph
 *      is disconnected"). The entrance itself can never be unreachable
 *      (it's seeded at depth 0).
 *
 * severity = 'warning' for all five sub-rules — sequencing is mitigatable
 * (a sub-optimal sequence is still legal). The admissibility gate does NOT
 * drop a candidate that only fails A-8; the Pareto optimiser uses the
 * count to push toward better candidates.
 *
 * Pure: same `(rooms, edges, entranceRoomId)` ⇒ same violation list.
 * Violations are emitted in rooms-array order so test assertions can
 * rely on stable output.
 */
export function validateSequencing(input: SequencingInput): TopologyViolation[] {
    const { rooms, edges, entranceRoomId } = input;

    // Defensive: no entrance in the rooms list ⇒ skip the whole validator.
    const entrance = rooms.find(r => r.id === entranceRoomId);
    if (entrance === undefined) return [];

    const violations: TopologyViolation[] = [];
    const depth = bfsDepths(rooms, edges, entranceRoomId);

    // Build a tiny adjacency map (id → neighbour types) for the ensuite host
    // lookup. Reuses the same symmetry as bfsDepths.
    const typeOf = new Map<string, string>();
    for (const r of rooms) typeOf.set(r.id, r.type);

    const neighbourTypes = new Map<string, Array<{ id: string; type: string }>>();
    for (const r of rooms) neighbourTypes.set(r.id, []);
    for (const e of edges) {
        const aT = typeOf.get(e.aId);
        const bT = typeOf.get(e.bId);
        if (aT === undefined || bT === undefined) continue;
        neighbourTypes.get(e.aId)!.push({ id: e.bId, type: bT });
        neighbourTypes.get(e.bId)!.push({ id: e.aId, type: aT });
    }

    // ── Rule (3) precondition: are there social rooms / bedrooms at all? ──
    const socialRooms = rooms.filter(r => SOCIAL_TYPES.has(r.type));
    const bedroomRooms = rooms.filter(r => BEDROOM_TYPES.has(r.type));

    // Compute maxSocialDepth over REACHABLE social rooms (Infinity-filtered).
    // If no reachable social rooms exist, the bedroom-depth comparator is
    // undefined and we skip rule (1).
    let maxSocialDepth = Number.NEGATIVE_INFINITY;
    for (const s of socialRooms) {
        const d = depth.get(s.id) ?? Number.POSITIVE_INFINITY;
        if (d !== Number.POSITIVE_INFINITY && d > maxSocialDepth) {
            maxSocialDepth = d;
        }
    }
    const hasReachableSocial = maxSocialDepth !== Number.NEGATIVE_INFINITY;

    // Iterate rooms in input order for stable emit order.
    for (const room of rooms) {
        const d = depth.get(room.id) ?? Number.POSITIVE_INFINITY;

        // ── Rule (1) — bedroom shallower than social rooms ─────────────
        if (
            hasReachableSocial &&
            bedroomRooms.length > 0 &&
            BEDROOM_TYPES.has(room.type) &&
            d !== Number.POSITIVE_INFINITY &&
            d < maxSocialDepth
        ) {
            violations.push({
                classId: 'A-8',
                severity: 'warning',
                roomAId: room.id,
                roomATypeName: room.type,
                roomBTypeName: 'social',
                message:
                    `[${room.id}] (${room.type}) ↔ social: ` +
                    `bedroom at depth ${d} is shallower than social rooms at depth ${maxSocialDepth} ` +
                    `— privacy gradient sequencing violated`,
            });
            // Do NOT continue — a bedroom can also be unreachable (handled
            // in rule (3) below) but that's a contradiction with d < Infinity
            // anyway, so the unreachable arm is naturally skipped for this
            // room. Falling through is safe.
        }

        // ── Rule (2) — ensuite must be strictly deeper than its host ───
        if (room.type === 'ensuite') {
            const hosts = (neighbourTypes.get(room.id) ?? [])
                .filter(n => BEDROOM_TYPES.has(n.type));

            // No host ⇒ defer to A-4 (orphan-ensuite is already an error
            // there); skip emission here to avoid double-firing.
            if (hosts.length > 0) {
                // Use the SHALLOWEST host as the comparator — if even the
                // shallowest host is not strictly less than the ensuite
                // depth, the sequence is wrong. (For a single-host ensuite
                // there's only one anyway; multi-host is an A-4 error but
                // still well-defined for the depth comparison.)
                let minHostDepth = Number.POSITIVE_INFINITY;
                for (const h of hosts) {
                    const hd = depth.get(h.id) ?? Number.POSITIVE_INFINITY;
                    if (hd < minHostDepth) minHostDepth = hd;
                }
                if (
                    d !== Number.POSITIVE_INFINITY &&
                    minHostDepth !== Number.POSITIVE_INFINITY &&
                    d <= minHostDepth
                ) {
                    violations.push({
                        classId: 'A-8',
                        severity: 'warning',
                        roomAId: room.id,
                        roomATypeName: 'ensuite',
                        roomBTypeName: 'bedroom',
                        message:
                            `[${room.id}] (ensuite) ↔ bedroom: ` +
                            `ensuite at depth ${d} is not deeper than its host bedroom at depth ${minHostDepth} ` +
                            `— sequencing sub-optimal`,
                    });
                }
            }
        }

        // ── Rule (3) — unreachable room ────────────────────────────────
        if (d === Number.POSITIVE_INFINITY) {
            violations.push({
                classId: 'A-8',
                severity: 'warning',
                roomAId: room.id,
                roomATypeName: room.type,
                roomBTypeName: 'entrance',
                message:
                    `[${room.id}] (${room.type}) ↔ entrance: ` +
                    `${room.type} at ${room.id} is unreachable from entrance ` +
                    `— sequencing graph is disconnected`,
            });
        }
    }

    return violations;
}
