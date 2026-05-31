// A-7 — Frontage-topology validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §A-class table, §A-7 row.)
//
// Pure function over POJO rooms carrying a precomputed `hasExteriorEdge`
// boolean. Returns one TopologyViolation per habitable, daylight-requiring
// room that does NOT touch the apartment's exterior shell.
//
// A-7 vs G-7 (the sister Part-A dimensional class):
//   G-7 (frontage LENGTH) checks that the exterior-edge LENGTH is sufficient
//   to admit a code-compliant window opening.
//   A-7 (frontage TOPOLOGY) checks the prior CONNECTIVITY question: does the
//   room touch the exterior at all? A room can't have a window if its
//   perimeter never meets the apartment's outer polygon — G-7's length check
//   is meaningless on an interior room.
//
// Why A-7 is an ERROR (not a warning like A-5 / A-6):
//   Habitable rooms — living rooms, bedrooms, kitchens — are subject to a
//   REGULATORY daylight / openable-area floor in virtually every residential
//   building code (UK Building Regs Part F + Part O, IRC §303, NCC Vol. 2).
//   An interior bedroom without exterior access is NOT a habitable bedroom;
//   it's a non-habitable inner room and must be re-classified or re-laid-out
//   before any further work. The admissibility gate MUST drop a candidate
//   that fails A-7 — this is not a soft penalty.
//
// Why some rooms are NOT in NEEDS_FRONTAGE:
//   • corridor, entrance_hall — pure circulation, daylight optional
//   • bathroom, wc, ensuite   — code-permitted to be interior with mechanical
//                                ventilation (the framework's wet-room
//                                ventilation discipline is enforced
//                                elsewhere); a daylit bathroom is preferred,
//                                not required
//   • storage, utility_room    — service spaces, daylight optional
//   • balcony                  — already exterior by definition; the rule is
//                                vacuous and we exclude it to avoid
//                                false-confidence positives
//
// Design rules:
//   • NO imports from `tgl/bubbleGraph.ts` — the validator does not need
//     adjacency; the caller hands it the precomputed exterior-edge flag.
//   • NO imports from `rules/programRules.ts`.
//   • The canonical habitable-needs-frontage type set lives INLINE here as
//     `NEEDS_FRONTAGE`.

import type { TopologyViolation } from './types.js';

/**
 * The canonical residential HABITABLE-needs-frontage type set. Every room
 * type in this list is a daylight-dependent habitable space; absence of an
 * exterior edge means the room cannot receive natural light and therefore
 * fails its programme contract.
 *
 *  • living_room / living          — primary habitable space
 *  • master_bedroom / master       — primary sleeping space
 *  • bedroom                       — secondary sleeping space
 *  • kitchen                       — habitable in most modern codes; even
 *                                     when not, a windowless kitchen is a
 *                                     significant programme failure
 *  • dining_room / dining          — habitable use; daylight expected
 *  • private_office / study        — workspace; code-required daylight
 *
 * Aliases (`living`, `master`, `dining`) are accepted because programme
 * naming has historically drifted; the canonical form is the longer name.
 */
export const NEEDS_FRONTAGE: ReadonlyArray<string> = [
    'living_room',
    'living',
    'master_bedroom',
    'master',
    'bedroom',
    'kitchen',
    'dining_room',
    'dining',
    'private_office',
    'study',
];

/**
 * Validate the frontage-topology rule against a realised layout.
 *
 * For every room whose `type` is in NEEDS_FRONTAGE and whose
 * `hasExteriorEdge` flag is FALSE, emit ONE TopologyViolation.
 *
 *  - `rooms` is a flat list of `{ id, type, hasExteriorEdge }`. The boolean
 *    is computed UPSTREAM by the caller — typically by intersecting the
 *    room's perimeter against the apartment outer polygon. The validator is
 *    a pure POJO check on the precomputed flag; it has no geometry input.
 *  - Rooms NOT in NEEDS_FRONTAGE are skipped regardless of their flag
 *    value (corridors / bathrooms / utility / storage / balcony / etc.).
 *
 * Severity is `'error'` — daylight access is a regulatory floor, not a
 * stylistic preference. Failing rooms must be re-laid-out or re-classified
 * before the candidate is admissible.
 *
 * Pure: same `rooms` ⇒ same violation list. Violations are emitted in
 * rooms-array order so test assertions can rely on stable output.
 */
export function validateFrontageTopology(
    rooms: ReadonlyArray<{ id: string; type: string; hasExteriorEdge: boolean }>,
): TopologyViolation[] {
    const needSet = new Set<string>(NEEDS_FRONTAGE);
    const violations: TopologyViolation[] = [];

    for (const room of rooms) {
        if (!needSet.has(room.type)) continue;
        if (room.hasExteriorEdge) continue;

        violations.push({
            classId: 'A-7',
            severity: 'error',
            roomAId: room.id,
            roomATypeName: room.type,
            roomBTypeName: 'exterior',
            message:
                `[${room.id}] (${room.type}) ↛ exterior: ` +
                `habitable room has no exterior edge — cannot receive daylight ` +
                `or admit a code-required window opening`,
        });
    }
    return violations;
}
