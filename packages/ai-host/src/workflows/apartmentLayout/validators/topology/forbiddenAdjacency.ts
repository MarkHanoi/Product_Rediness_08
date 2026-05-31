// A-3 — Forbidden-adjacency validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §A-class table).
//
// Pure function over POJO rooms + an unordered adjacency edge list. Returns
// one TopologyViolation per OFFENDING EDGE between rooms of a forbidden
// type-pair. Sister to A-1 / A-2 but inverts the polarity: A-1 + A-2 fire
// when an expected edge is MISSING; A-3 fires when a FORBIDDEN edge is
// PRESENT. Severity is `'error'` — direct hygiene / privacy / acoustic
// violations are admissibility-gate hard rejects.
//
// Note on semantics: "forbidden adjacency" means no shared wall AND no
// direct door between rooms of these types. An open-plan kitchen ↔ living
// flow is NOT forbidden because there is no direct kitchen↔private-bedroom
// edge — the bedroom is reached via corridor. The validator inspects ONLY
// the adjacency edge set it is handed; the caller is responsible for
// building `edges` to reflect realised direct connections (the same set
// passed to A-1 / A-2).
//
// Design rules (identical to A-1 / A-2):
//   • NO imports from `tgl/bubbleGraph.ts`.
//   • NO imports from `rules/programRules.ts`.
//   • The canonical forbidden pairs live INLINE here as `FORBIDDEN_ADJACENCIES`.

import type { AdjacencyEdge, TopologyViolation } from './types.js';

/**
 * The canonical residential FORBIDDEN-adjacency table. Six rules — one per
 * row of the framework's A-3 column — chosen so each is an unambiguous
 * hygiene / privacy / acoustic defect, never a stylistic call:
 *
 *  • bathroom ↔ kitchen      — hygiene separation (wet-fixture ↔ food prep)
 *  • wc ↔ kitchen            — hygiene separation
 *  • wc ↔ dining_room        — hygiene separation
 *  • bedroom ↔ kitchen       — acoustic + smell; open-plan kitchen IS OK,
 *                              direct door from a private bedroom is NOT
 *  • master_bedroom ↔ kitchen — as above for the master
 *  • ensuite ↔ kitchen       — hygiene + privacy combined
 *
 * The validator treats the pair as UNORDERED: a forbidden `(bathroom, kitchen)`
 * rule fires regardless of whether the edge appears as `(BA, K)` or `(K, BA)`.
 */
export const FORBIDDEN_ADJACENCIES: ReadonlyArray<{
    readonly fromType: string;
    readonly toType: string;
    readonly reason: string;
}> = [
    {
        fromType: 'bathroom',
        toType: 'kitchen',
        reason: 'hygiene separation — no direct door between wet-fixture room and food prep',
    },
    {
        fromType: 'wc',
        toType: 'kitchen',
        reason: 'hygiene separation',
    },
    {
        fromType: 'wc',
        toType: 'dining_room',
        reason: 'hygiene separation',
    },
    {
        fromType: 'bedroom',
        toType: 'kitchen',
        reason: 'acoustic + smell separation (open-plan kitchen IS permitted, but a direct door from a private bedroom is not)',
    },
    {
        fromType: 'master_bedroom',
        toType: 'kitchen',
        reason: 'acoustic + smell separation (open-plan kitchen IS permitted, but a direct door from a private bedroom is not)',
    },
    {
        fromType: 'ensuite',
        toType: 'kitchen',
        reason: 'hygiene + privacy combined',
    },
];

/**
 * Validate the forbidden-adjacency table against a realised layout.
 *
 * For every forbidden `(fromType, toType)` rule, scan `edges` and emit ONE
 * TopologyViolation per edge whose endpoints have those room types (in
 * either orientation). The `roomAId` is always set to the FROMTYPE-side
 * endpoint of the offending edge so the modal can highlight a canonical
 * "owning" room.
 *
 *  - `rooms` is a flat list of `{ id, type }` — used only to look up each
 *    edge endpoint's type. Unknown ids (edge references a room not in the
 *    rooms list) are silently ignored — the validator does not pretend to
 *    diagnose dangling-edge bugs.
 *  - `edges` is the realised adjacency set; symmetric, the validator never
 *    tests orientation.
 *
 * Pure: same `(rooms, edges)` ⇒ same violation list. Rule iteration is
 * deterministic; per-rule violations are emitted in `edges`-array order so
 * test assertions can rely on stable output.
 */
export function validateForbiddenAdjacency(
    rooms: ReadonlyArray<{ id: string; type: string }>,
    edges: ReadonlyArray<AdjacencyEdge>,
): TopologyViolation[] {
    const violations: TopologyViolation[] = [];
    // Pre-index rooms by id for O(1) type lookup.
    const typeOf = new Map<string, string>();
    for (const r of rooms) typeOf.set(r.id, r.type);

    for (const rule of FORBIDDEN_ADJACENCIES) {
        for (const e of edges) {
            const aType = typeOf.get(e.aId);
            const bType = typeOf.get(e.bId);
            if (aType === undefined || bType === undefined) continue;

            // Determine if this edge matches the forbidden pair (unordered).
            let fromId: string | null = null;
            if (aType === rule.fromType && bType === rule.toType) {
                fromId = e.aId;
            } else if (bType === rule.fromType && aType === rule.toType) {
                fromId = e.bId;
            }
            if (fromId === null) continue;

            violations.push({
                classId: 'A-3',
                severity: 'error',
                roomAId: fromId,
                roomATypeName: rule.fromType,
                roomBTypeName: rule.toType,
                message: `[${fromId}] (${rule.fromType}) ↔ ${rule.toType}: FORBIDDEN — ${rule.reason}`,
            });
        }
    }
    return violations;
}
