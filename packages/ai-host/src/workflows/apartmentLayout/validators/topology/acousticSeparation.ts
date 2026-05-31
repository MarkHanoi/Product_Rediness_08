// A-5 — Acoustic-separation validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §A-class table, §A-5 row.)
//
// Pure function over POJO rooms + an unordered adjacency edge list. Returns
// one TopologyViolation per OFFENDING EDGE between rooms of an acoustically
// incompatible type-pair. Sister to A-3 (`forbiddenAdjacency.ts`) — same
// iteration shape, different table, DIFFERENT severity.
//
// Why A-5 is a WARNING (not an error like A-3):
//   A-3 is a HARD legal / hygiene blocker (wet-fixture ↔ food prep is never
//   acceptable). A-5 is a SOFT acoustic concern — the defect can be
//   mitigated by construction (insulated stud wall, acoustic seal at door,
//   double glazing) so the admissibility gate MUST NOT drop a candidate
//   solely on A-5 violations. The Pareto rank applies a soft penalty
//   instead, and the modal surfaces them as advisory chips.
//
// OVERLAP WITH A-3 — INTENTIONAL:
//   The (kitchen, bedroom) and (kitchen, master_bedroom) edges appear in
//   BOTH A-3 and A-5 with DIFFERENT severities. A single offending edge
//   therefore fires two distinct classes:
//     - A-3 error: privacy / smell / hygiene (hard reject)
//     - A-5 warning: acoustic / activity noise (soft penalty)
//   This is by design: the rule classes are independent angles on the same
//   defect, and the modal surfacer groups violations by class — the user
//   sees the kitchen↔bedroom edge tagged with both labels and understands
//   which axis is hard vs soft. Tests pin this co-firing.
//
// Design rules (identical to A-1 / A-2 / A-3):
//   • NO imports from `tgl/bubbleGraph.ts`.
//   • NO imports from `rules/programRules.ts`.
//   • The canonical incompatible pairs live INLINE here as
//     `ACOUSTIC_INCOMPATIBLE`.

import type { AdjacencyEdge, TopologyViolation } from './types.js';

/**
 * The canonical residential ACOUSTIC-incompatible adjacency table. Six rules
 * — one per row of the framework's A-5 column — chosen so each is a
 * recognised noise-vs-sleep / activity-vs-rest pairing whose direct edge
 * degrades dwelling acoustic quality:
 *
 *  • utility_room ↔ bedroom         — washer / dryer / boiler noise vs sleep
 *  • utility_room ↔ master_bedroom  — same
 *  • kitchen ↔ bedroom              — extractor / activity noise vs sleep
 *                                     (open-plan is configured at the
 *                                     apartment level, not a direct bedroom
 *                                     edge — this rule only fires on a
 *                                     DIRECT edge to a bedroom)
 *  • kitchen ↔ master_bedroom       — same
 *  • living_room ↔ bedroom          — TV / conversation noise vs sleep
 *  • living_room ↔ master_bedroom   — same
 *
 * The validator treats the pair as UNORDERED: a `(utility_room, bedroom)`
 * rule fires regardless of whether the edge appears as `(U, B)` or `(B, U)`.
 */
export const ACOUSTIC_INCOMPATIBLE: ReadonlyArray<{
    readonly aType: string;
    readonly bType: string;
    readonly reason: string;
}> = [
    {
        aType: 'utility_room',
        bType: 'bedroom',
        reason: 'washing machine / dryer noise incompatible with sleeping',
    },
    {
        aType: 'utility_room',
        bType: 'master_bedroom',
        reason: 'washing machine / dryer noise incompatible with sleeping',
    },
    {
        aType: 'kitchen',
        bType: 'bedroom',
        reason: 'kitchen activity + extractor noise incompatible with sleeping (direct edge — open plan is configured at the apartment level, not a direct bedroom edge)',
    },
    {
        aType: 'kitchen',
        bType: 'master_bedroom',
        reason: 'kitchen activity + extractor noise incompatible with sleeping (direct edge — open plan is configured at the apartment level, not a direct bedroom edge)',
    },
    {
        aType: 'living_room',
        bType: 'bedroom',
        reason: 'TV / conversation noise incompatible with sleeping',
    },
    {
        aType: 'living_room',
        bType: 'master_bedroom',
        reason: 'TV / conversation noise incompatible with sleeping',
    },
];

/**
 * Validate the acoustic-incompatibility table against a realised layout.
 *
 * For every incompatible `(aType, bType)` rule, scan `edges` and emit ONE
 * TopologyViolation per edge whose endpoints have those room types (in
 * either orientation). The `roomAId` is always set to the ATYPE-side
 * endpoint of the offending edge so the modal can highlight a canonical
 * "owning" (noise-source) room.
 *
 *  - `rooms` is a flat list of `{ id, type }` — used only to look up each
 *    edge endpoint's type. Unknown ids (edge references a room not in the
 *    rooms list) are silently ignored.
 *  - `edges` is the realised adjacency set; symmetric, the validator never
 *    tests orientation.
 *
 * Pure: same `(rooms, edges)` ⇒ same violation list. Rule iteration is
 * deterministic; per-rule violations are emitted in `edges`-array order so
 * test assertions can rely on stable output.
 */
export function validateAcousticSeparation(
    rooms: ReadonlyArray<{ id: string; type: string }>,
    edges: ReadonlyArray<AdjacencyEdge>,
): TopologyViolation[] {
    const violations: TopologyViolation[] = [];
    // Pre-index rooms by id for O(1) type lookup.
    const typeOf = new Map<string, string>();
    for (const r of rooms) typeOf.set(r.id, r.type);

    for (const rule of ACOUSTIC_INCOMPATIBLE) {
        for (const e of edges) {
            const aType = typeOf.get(e.aId);
            const bType = typeOf.get(e.bId);
            if (aType === undefined || bType === undefined) continue;

            // Determine if this edge matches the incompatible pair
            // (unordered). The canonical "owning" endpoint is the aType
            // side — the noise-source room.
            let aId: string | null = null;
            if (aType === rule.aType && bType === rule.bType) {
                aId = e.aId;
            } else if (bType === rule.aType && aType === rule.bType) {
                aId = e.bId;
            }
            if (aId === null) continue;

            violations.push({
                classId: 'A-5',
                severity: 'warning',
                roomAId: aId,
                roomATypeName: rule.aType,
                roomBTypeName: rule.bType,
                message: `[${aId}] (${rule.aType}) ↔ ${rule.bType}: ACOUSTIC — ${rule.reason}`,
            });
        }
    }
    return violations;
}
