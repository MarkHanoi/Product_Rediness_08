// A-1 — Mandatory-adjacency validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §A-class table).
//
// Pure function over POJO rooms + an unordered adjacency edge list. Returns
// one TopologyViolation per failed mandatory-adjacency rule.
//
// Design rules:
//   • NO imports from `tgl/bubbleGraph.ts` — the validator stands alone and
//     accepts pre-built adjacency edges from any source.
//   • NO imports from `rules/programRules.ts` — the canonical mandatory pairs
//     live INLINE here as `MANDATORY_ADJACENCIES`. The two databases are
//     complementary: programRules' `accessFrom` is a PERMISSION matrix (what
//     CAN connect), MANDATORY_ADJACENCIES is the REQUIRED set (what MUST).
//   • Conditions decouple presence-checks from connectivity-checks: an
//     `if-toType-exists` rule produces ZERO violations when the partner room
//     isn't present (e.g. no en-suite means no master↔ensuite obligation).

import type { AdjacencyEdge, TopologyViolation } from './types.js';

/**
 * The canonical residential mandatory-adjacency table. Six rules — one per
 * row of the framework's A-1 column — chosen so each violation is an
 * UNAMBIGUOUS architectural defect, not a stylistic preference.
 *
 *  • master ↔ ensuite      — programme constraint when an en-suite exists
 *  • kitchen ↔ dining_room — service efficiency when a separate dining exists
 *  • entrance_hall ↔ social/circulation — arrival sequence: a visitor must
 *                            land in either the social zone or circulation,
 *                            never directly in a private space
 *  • utility_room ↔ kitchen — shared plumbing/electrical service cluster
 *  • wc ↔ corridor|entrance_hall — privacy programme: no WC straight off a
 *                            bedroom (the framework's privacy gradient §A-4)
 *  • bathroom ↔ corridor|entrance_hall — the existing §BATH-CORRIDOR-ONLY
 *                            rule, codified formally for this validator
 *
 * Conditions:
 *   `always`             — violation when the fromType room exists and has no
 *                          edge to any toType candidate.
 *   `if-toType-exists`   — violation ONLY if at least one toType candidate
 *                          exists in the rooms list (e.g. master needs
 *                          ensuite only when an ensuite was minted).
 *   `if-fromType-exists` — violation only when the fromType room exists at
 *                          all. (Equivalent to `always` since the rule loop
 *                          already iterates fromType matches — kept for
 *                          documentation clarity in cases like utility_room
 *                          where presence of the room is itself optional.)
 */
export const MANDATORY_ADJACENCIES: ReadonlyArray<{
    readonly fromType: string;
    readonly toType: string | readonly string[];
    readonly condition?: 'always' | 'if-toType-exists' | 'if-fromType-exists';
    readonly message: string;
}> = [
    {
        fromType: 'master_bedroom',
        toType: 'ensuite',
        condition: 'if-toType-exists',
        message: 'master_bedroom must be adjacent to ensuite when ensuite is present',
    },
    {
        fromType: 'kitchen',
        toType: 'dining_room',
        condition: 'if-toType-exists',
        message: 'kitchen must be adjacent to dining_room when a separate dining_room exists',
    },
    {
        fromType: 'entrance_hall',
        toType: ['living_room', 'kitchen', 'corridor'],
        condition: 'always',
        message: 'entrance_hall must reach a social space or circulation',
    },
    {
        fromType: 'utility_room',
        toType: 'kitchen',
        condition: 'if-fromType-exists',
        message: 'utility_room must be adjacent to kitchen',
    },
    {
        fromType: 'wc',
        toType: ['corridor', 'entrance_hall'],
        condition: 'always',
        message: 'wc must be accessible from a circulation space, not directly off a private room',
    },
    {
        fromType: 'bathroom',
        toType: ['corridor', 'entrance_hall'],
        condition: 'always',
        message: 'bathroom must be accessible from a circulation space',
    },
];

/**
 * Whether `(aId, bId)` and `(bId, aId)` appear as an edge in `edges` — the
 * adjacency relation is symmetric, so we accept either orientation.
 */
function hasEdge(edges: ReadonlyArray<AdjacencyEdge>, aId: string, bId: string): boolean {
    for (const e of edges) {
        if ((e.aId === aId && e.bId === bId) || (e.aId === bId && e.bId === aId)) return true;
    }
    return false;
}

/**
 * Validate the mandatory-adjacency table against a realised layout.
 *
 * Returns ONE TopologyViolation per failing (fromType room × rule). A single
 * fromType room can produce multiple violations across different rules (e.g.
 * a `wc` that fails BOTH the corridor/hall reachability AND a hypothetical
 * future rule would emit two entries — keeps modal surfacing one-rule-per-
 * row clean).
 *
 *  - `rooms` is a flat list of `{ id, type }` — no name, no area, no
 *    geometry. Order does not matter; ids must be unique within the call.
 *  - `edges` is the realised adjacency set (shared wall OR door connection).
 *    Symmetric: the validator never tests orientation.
 *
 * Pure: same `(rooms, edges)` ⇒ same violation list. The MANDATORY_ADJACENCIES
 * table iteration is deterministic; per-rule violations are emitted in
 * rooms-array order so test assertions can rely on stable output.
 */
export function validateMandatoryAdjacency(
    rooms: ReadonlyArray<{ id: string; type: string }>,
    edges: ReadonlyArray<AdjacencyEdge>,
): TopologyViolation[] {
    const violations: TopologyViolation[] = [];
    for (const rule of MANDATORY_ADJACENCIES) {
        const toTypes: readonly string[] =
            typeof rule.toType === 'string' ? [rule.toType] : rule.toType;
        const condition = rule.condition ?? 'always';

        // `if-toType-exists` — skip the rule entirely when no candidate
        // partner room exists in the layout.
        if (condition === 'if-toType-exists') {
            const anyPartner = rooms.some(r => toTypes.includes(r.type));
            if (!anyPartner) continue;
        }

        const fromRooms = rooms.filter(r => r.type === rule.fromType);
        // `if-fromType-exists` — the for-loop below already iterates only
        // matching fromRooms, so this branch is a no-op (kept for
        // condition-table completeness). `always` falls through identically.

        for (const fromRoom of fromRooms) {
            // The fromRoom needs at LEAST ONE adjacency edge to a room of
            // any partner type. (The partner room MUST exist in the layout
            // — an edge to a phantom id is silently ignored.)
            const partnerIds = rooms
                .filter(r => toTypes.includes(r.type))
                .map(r => r.id);
            const satisfied = partnerIds.some(pid => hasEdge(edges, fromRoom.id, pid));
            if (satisfied) continue;

            const partnerLabel =
                toTypes.length === 1 ? toTypes[0]! : toTypes.join('|');
            violations.push({
                classId: 'A-1',
                severity: 'error',
                roomAId: fromRoom.id,
                roomATypeName: rule.fromType,
                roomBTypeName: partnerLabel,
                // Embed BOTH ids in the message for traceability (the
                // partner id is omitted when no partner exists; the human-
                // readable type label is always present).
                message: `[${fromRoom.id}] (${rule.fromType}) ↛ ${partnerLabel}: ${rule.message}`,
            });
        }
    }
    return violations;
}
