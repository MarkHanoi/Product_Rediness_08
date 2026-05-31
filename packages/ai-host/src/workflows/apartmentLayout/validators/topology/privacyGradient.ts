// A-4 — Privacy-gradient validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §A-class table, §A-4 row.)
//
// Encodes the residential privacy gradient:
//   PUBLIC (entrance_hall, social)
//     → SEMI-PRIVATE (corridor, dining)
//       → PRIVATE (bedrooms, ensuites)
//         → SERVICE (utility, storage)
//
// The framework's full §A-4 rule is "a room MUST NOT be reachable from the
// entrance ONLY through a more-private room". Implementing that in full
// requires a multi-source shortest-path search annotated with privacy bands.
// For v1 we codify the two gradient-violation patterns that account for the
// vast majority of observed failures in residential layouts and that surface
// as direct-edge defects (no graph search needed):
//
//   (a) BEDROOM-VIA-BEDROOM — a bedroom whose ONLY non-bedroom neighbour is
//       another bedroom is reachable only through that other bedroom. Sister
//       to A-1's "no corridor between bedrooms" but framed as a gradient
//       check (a bedroom must have an edge to a semi-private OR public room:
//       corridor, entrance_hall, hall, living_room or dining_room).
//
//   (b) ENSUITE-ISOLATION — an ensuite must be hosted by EXACTLY ONE bedroom
//       (master or otherwise) and have ZERO edges to any non-bedroom room.
//       Two ensuite edges to bedrooms means the ensuite is shared / public-
//       reachable; an ensuite edge to a corridor / kitchen / living_room
//       means the privacy gradient is broken (an ensuite is the most private
//       wet room and must be hidden behind a bedroom).
//
// Design rules (identical to A-1 / A-2 / A-3):
//   • NO imports from `tgl/bubbleGraph.ts`.
//   • NO imports from `rules/programRules.ts`.
//   • The canonical patterns live INLINE here as `PRIVACY_GRADIENT_VIOLATIONS`
//     (documentation / introspection table) and as the rule logic below.
//   • severity = 'error' — gradient violations are admissibility-gate hard
//     rejects (a bedroom only reachable via another bedroom is an
//     unambiguous architectural defect, not a stylistic call).

import type { AdjacencyEdge, TopologyViolation } from './types.js';

/**
 * Documentation / introspection table of the canonical privacy-gradient
 * violation patterns. The `viaType` field uses the literal string `'*'` to
 * mean "any non-bedroom partner". The runtime rule logic lives in
 * `validatePrivacyGradient` — this table is exposed so test fixtures and
 * downstream surfacers can label / group violations by pattern, and so the
 * canonical wording is one read away from the rule code.
 */
export const PRIVACY_GRADIENT_VIOLATIONS: ReadonlyArray<{
    readonly fromType: string;
    readonly viaType: string;
    readonly toType: string;
    readonly reason: string;
}> = [
    {
        // (a) — a bedroom whose only non-bedroom edge is to another bedroom.
        fromType: 'bedroom',
        viaType: 'bedroom',
        toType: 'bedroom',
        reason: 'bedroom accessed only via another bedroom — privacy gradient violation',
    },
    {
        // (a) — same for the master.
        fromType: 'master_bedroom',
        viaType: 'bedroom',
        toType: 'master_bedroom',
        reason: 'master accessed via another bedroom — privacy gradient violation',
    },
    {
        // (b) — ensuite reachable from more than one room, or from a
        // non-bedroom room (corridor, kitchen, ...).
        fromType: 'ensuite',
        viaType: '*',
        toType: 'ensuite',
        reason: 'ensuite accessible from more than one room or from non-bedroom — privacy gradient violation',
    },
];

/**
 * Semi-private and public room types that satisfy "bedroom has a non-bedroom
 * neighbour on the privacy gradient" check. A bedroom edged to any of these
 * is correctly reachable from the entrance without passing through another
 * private room.
 */
const SEMI_PUBLIC_PARTNERS: ReadonlySet<string> = new Set([
    'corridor',
    'entrance_hall',
    'hall',
    'living_room',
    'dining_room',
]);

/** Bedroom-family types — both count as "another bedroom" for rule (a). */
const BEDROOM_TYPES: ReadonlySet<string> = new Set(['bedroom', 'master_bedroom']);

/**
 * Build an adjacency map: `roomId → array of {neighbourId, neighbourType}`.
 * Used for both (a) the bedroom-neighbour scan and (b) the ensuite-neighbour
 * scan. Endpoint orientation is symmetric.
 */
function buildAdjacency(
    rooms: ReadonlyArray<{ id: string; type: string }>,
    edges: ReadonlyArray<AdjacencyEdge>,
): Map<string, Array<{ id: string; type: string }>> {
    const typeOf = new Map<string, string>();
    for (const r of rooms) typeOf.set(r.id, r.type);

    const adj = new Map<string, Array<{ id: string; type: string }>>();
    for (const r of rooms) adj.set(r.id, []);

    for (const e of edges) {
        const aT = typeOf.get(e.aId);
        const bT = typeOf.get(e.bId);
        if (aT === undefined || bT === undefined) continue;  // dangling edge
        adj.get(e.aId)!.push({ id: e.bId, type: bT });
        adj.get(e.bId)!.push({ id: e.aId, type: aT });
    }
    return adj;
}

/**
 * Validate privacy-gradient violations against a realised layout.
 *
 * Emits ONE TopologyViolation per failing room:
 *
 *   (a) For each bedroom / master_bedroom: if it has NO edge to a
 *       semi-private or public neighbour (corridor / entrance_hall / hall /
 *       living_room / dining_room), AND it has at least one edge to ANOTHER
 *       bedroom, emit a violation. (Bedrooms with no neighbours at all are
 *       caught by A-1's mandatory adjacency rules; this rule specifically
 *       targets the "bedroom accessed only via another bedroom" pattern.)
 *
 *   (b) For each ensuite: count edges, partition by partner type.
 *         - 0 bedroom partners → violation (orphan ensuite).
 *         - 2+ bedroom partners → violation (shared ensuite — ensuites are
 *           single-host by definition).
 *         - any non-bedroom partner → violation (gradient leak).
 *       Multiple defects on the same ensuite produce ONE violation
 *       (the first detected wins; the message names the specific defect).
 *
 * Pure: same `(rooms, edges)` ⇒ same violation list. Rooms-array iteration
 * order determines emit order for stable test assertions.
 */
export function validatePrivacyGradient(
    rooms: ReadonlyArray<{ id: string; type: string }>,
    edges: ReadonlyArray<AdjacencyEdge>,
): TopologyViolation[] {
    const violations: TopologyViolation[] = [];
    const adj = buildAdjacency(rooms, edges);

    for (const room of rooms) {
        // ── Rule (a) — bedroom-via-bedroom gradient check ──────────────
        if (BEDROOM_TYPES.has(room.type)) {
            const neighbours = adj.get(room.id) ?? [];
            const hasSemiPublic = neighbours.some(n => SEMI_PUBLIC_PARTNERS.has(n.type));
            const hasBedroomNeighbour = neighbours.some(n => BEDROOM_TYPES.has(n.type));

            // Only fire when the bedroom IS connected to another bedroom but
            // has no semi-private / public escape — that's the gradient
            // violation. A bedroom with no neighbours at all is an A-1
            // concern (mandatory adjacency), not A-4.
            if (hasBedroomNeighbour && !hasSemiPublic) {
                violations.push({
                    classId: 'A-4',
                    severity: 'error',
                    roomAId: room.id,
                    roomATypeName: room.type,
                    roomBTypeName: 'bedroom',
                    message: `[${room.id}] (${room.type}) ↔ bedroom: ${room.type === 'master_bedroom'
                        ? 'master accessed via another bedroom — privacy gradient violation'
                        : 'bedroom accessed only via another bedroom — privacy gradient violation'}`,
                });
                continue;  // do not double-fire rule (b) on the same room
            }
        }

        // ── Rule (b) — ensuite isolation ───────────────────────────────
        if (room.type === 'ensuite') {
            const neighbours = adj.get(room.id) ?? [];
            const bedroomNeighbours = neighbours.filter(n => BEDROOM_TYPES.has(n.type));
            const nonBedroomNeighbours = neighbours.filter(n => !BEDROOM_TYPES.has(n.type));

            let defect: string | null = null;
            if (nonBedroomNeighbours.length > 0) {
                defect = `ensuite reachable from non-bedroom (${nonBedroomNeighbours[0]!.type}) — privacy gradient violation`;
            } else if (bedroomNeighbours.length === 0) {
                defect = 'ensuite has no bedroom host — privacy gradient violation';
            } else if (bedroomNeighbours.length >= 2) {
                defect = `ensuite shared by ${bedroomNeighbours.length} bedrooms — ensuites must be single-host`;
            }

            if (defect !== null) {
                violations.push({
                    classId: 'A-4',
                    severity: 'error',
                    roomAId: room.id,
                    roomATypeName: 'ensuite',
                    roomBTypeName: 'bedroom',
                    message: `[${room.id}] (ensuite) ↔ bedroom: ${defect}`,
                });
            }
        }
    }

    return violations;
}
