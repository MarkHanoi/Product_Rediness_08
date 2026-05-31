// A-2 — Preferred-adjacency validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §A-class table).
//
// Pure function over POJO rooms + an unordered adjacency edge list. Returns
// one TopologyViolation per failed PREFERRED-adjacency rule. Sister to A-1
// (`mandatoryAdjacency.ts`) but every rule produces `severity: 'warning'`
// because preferred-adjacency violations are quality / ergonomics signals,
// not legality blockers — the engine's admissibility gate MUST NOT drop a
// candidate solely on A-2 violations; instead the Pareto rank applies a soft
// penalty and the modal surfaces them as advisory chips.
//
// Design rules (identical to A-1):
//   • NO imports from `tgl/bubbleGraph.ts` — validator stands alone and
//     accepts pre-built adjacency edges from any source.
//   • NO imports from `rules/programRules.ts` — the canonical preferred pairs
//     live INLINE here as `PREFERRED_ADJACENCIES`.
//   • Every A-2 rule uses condition `'if-toType-exists'` — preferred-adjacency
//     is only meaningful when the partner room actually exists in the layout;
//     a missing utility_room can never make the kitchen "lack" its preferred
//     neighbour. (Compare A-1's `'always'` which fires even with no partner.)

import type { AdjacencyEdge, TopologyViolation } from './types.js';

/**
 * The canonical residential PREFERRED-adjacency table. Six rules — one per
 * row of the framework's A-2 column — chosen so each is a recognised
 * ergonomic / service-cluster pairing whose ABSENCE degrades dwelling quality
 * but does not make the layout architecturally invalid:
 *
 *  • kitchen ↔ utility_room        — service cluster (shared plumbing/electrical)
 *  • living_room ↔ balcony         — outdoor extension of social space
 *  • master_bedroom ↔ private_office — home-office privacy gradient
 *  • entrance_hall ↔ wc            — guest-wc convenience near entry
 *  • bedroom ↔ bathroom            — morning routine adjacency
 *  • kitchen ↔ living_room         — open-plan social flow when no separate dining
 *
 * Every rule is `if-toType-exists`: preferred-adjacency is dormant when the
 * preferred partner room isn't part of the layout.
 *
 * `reason` is the human-readable rationale embedded in the emitted message
 * (caller / modal can surface it verbatim alongside the type badges).
 */
export const PREFERRED_ADJACENCIES: ReadonlyArray<{
    readonly fromType: string;
    readonly toType: string | readonly string[];
    readonly condition: 'if-toType-exists';
    readonly reason: string;
}> = [
    {
        fromType: 'kitchen',
        toType: 'utility_room',
        condition: 'if-toType-exists',
        reason: 'service cluster: appliances share plumbing/electrical',
    },
    {
        fromType: 'living_room',
        toType: 'balcony',
        condition: 'if-toType-exists',
        reason: 'outdoor extension of social space',
    },
    {
        fromType: 'master_bedroom',
        toType: 'private_office',
        condition: 'if-toType-exists',
        reason: 'home-office privacy gradient',
    },
    {
        fromType: 'entrance_hall',
        toType: 'wc',
        condition: 'if-toType-exists',
        reason: 'guest-wc convenience near entry',
    },
    {
        fromType: 'bedroom',
        toType: 'bathroom',
        condition: 'if-toType-exists',
        reason: 'morning routine adjacency',
    },
    {
        fromType: 'kitchen',
        toType: 'living_room',
        condition: 'if-toType-exists',
        reason: 'open-plan social flow when no separate dining',
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
 * Validate the preferred-adjacency table against a realised layout.
 *
 * Returns ONE TopologyViolation per failing (fromType room × rule). Each
 * violation has `classId: 'A-2'` and `severity: 'warning'`.
 *
 *  - `rooms` is a flat list of `{ id, type }` — no name, no area, no
 *    geometry. Order does not matter; ids must be unique within the call.
 *  - `edges` is the realised adjacency set (shared wall OR door connection).
 *    Symmetric: the validator never tests orientation.
 *
 * Pure: same `(rooms, edges)` ⇒ same violation list. Rule iteration is
 * deterministic; per-rule violations are emitted in rooms-array order so
 * test assertions can rely on stable output.
 */
export function validatePreferredAdjacency(
    rooms: ReadonlyArray<{ id: string; type: string }>,
    edges: ReadonlyArray<AdjacencyEdge>,
): TopologyViolation[] {
    const violations: TopologyViolation[] = [];
    for (const rule of PREFERRED_ADJACENCIES) {
        const toTypes: readonly string[] =
            typeof rule.toType === 'string' ? [rule.toType] : rule.toType;

        // Every A-2 rule is `if-toType-exists` — skip when no partner exists.
        const anyPartner = rooms.some(r => toTypes.includes(r.type));
        if (!anyPartner) continue;

        const fromRooms = rooms.filter(r => r.type === rule.fromType);
        for (const fromRoom of fromRooms) {
            const partnerIds = rooms
                .filter(r => toTypes.includes(r.type))
                .map(r => r.id);
            const satisfied = partnerIds.some(pid => hasEdge(edges, fromRoom.id, pid));
            if (satisfied) continue;

            const partnerLabel =
                toTypes.length === 1 ? toTypes[0]! : toTypes.join('|');
            violations.push({
                classId: 'A-2',
                severity: 'warning',
                roomAId: fromRoom.id,
                roomATypeName: rule.fromType,
                roomBTypeName: partnerLabel,
                message: `[${fromRoom.id}] (${rule.fromType}) ↛ ${partnerLabel}: ${rule.reason}`,
            });
        }
    }
    return violations;
}
