// T1.C — `validateCorridorConnectivity` pure validator
// (single-apartment-fix-pass-spec #2 + APARTMENT-LAYOUT-STATUS-2026-05-29
// §3 Tier 1B + APARTMENT-FURNITURE-AND-ACTIVITY-IMPLEMENTATION-PLAN T1.C).
//
// Architectural rule:
//   EVERY private room (bedroom, master, bathroom, ensuite, wc) MUST have a
//   DIRECT DOOR to either a circulation room (hall, corridor) OR the entry.
//
// What this catches that the existing validators do NOT:
//   • A bedroom whose only door is into the living room — privacy violation
//     and a circulation defect (the user crosses the public space to reach
//     a private one).
//   • A non-ensuite bathroom whose only door is into a bedroom — already
//     partially covered by §BATH-CORRIDOR-ONLY in programRules, but that
//     enforces it at GENERATION time on the bubble graph; this validator is
//     an after-the-fact GATE against later mutations.
//   • A bedroom that has lost its corridor door to a wall reconciliation
//     pass — would silently ship with a private room reached only through
//     another private room.
//
// Special cases (intentional pass):
//   • An ENSUITE is allowed to be reached ONLY through its master bedroom
//     (that IS the architectural rule; mandatory adjacency master↔ensuite
//     handles the inverse — the ensuite MUST be connected to the master).
//     We pass an ensuite when it has either a corridor door OR a master door.
//   • Studio / open-plan apartments without any private rooms produce a
//     clean pass (nothing to validate).
//
// Severity: SOFT. The §BATH-CORRIDOR-ONLY rule already prevents the worst
// programme-level violations at generation time; this is a regression net.
// Soft-only so the validator never strands an otherwise admissible layout.

import type { BubbleGraph } from '../tgl/bubbleGraph.js';
import type { DoorOpening } from './validateMandatoryAdjacencies.js';
import type { TopologyFinding, TopologyValidation } from './types.js';

/** Private rooms that MUST connect to circulation (or, for ensuites, master). */
const PRIVATE_ROOM_TYPES = new Set<string>([
    'bedroom', 'master', 'bathroom', 'ensuite', 'wc',
]);

/** Rooms that are themselves circulation (any door into one of these = pass). */
const CIRCULATION_ROOM_TYPES = new Set<string>([
    'hall', 'corridor',
]);

export function validateCorridorConnectivity(
    bubble: BubbleGraph,
    openings: readonly DoorOpening[],
): TopologyValidation {
    // Index room type by id for O(1) lookup during the connectivity scan.
    const typeById = new Map<string, string>();
    for (const r of bubble.rooms) typeById.set(r.id, r.type);

    // Collect every door-connected neighbour per room (unordered).
    const neighbours = new Map<string, Set<string>>();
    const addNeighbour = (a: string, b: string) => {
        if (!neighbours.has(a)) neighbours.set(a, new Set<string>());
        neighbours.get(a)!.add(b);
    };
    for (const o of openings) {
        if (o.type !== 'door') continue;
        const [a, b] = o.betweenRoomIds as readonly [string, string?];
        if (!a || !b) continue;
        addNeighbour(a, b);
        addNeighbour(b, a);
    }

    const soft: TopologyFinding[] = [];

    for (const room of bubble.rooms) {
        if (!PRIVATE_ROOM_TYPES.has(room.type)) continue;

        const ns = neighbours.get(room.id) ?? new Set<string>();
        // Pass if ANY door-neighbour is a circulation room.
        let circulationFound = false;
        let masterFound = false;
        for (const nId of ns) {
            const nType = typeById.get(nId);
            if (!nType) continue;
            if (CIRCULATION_ROOM_TYPES.has(nType)) {
                circulationFound = true;
                break;
            }
            if (nType === 'master') masterFound = true;
        }
        if (circulationFound) continue;

        // Ensuite-specific exception: a master-only door is fine.
        if (room.type === 'ensuite' && masterFound) continue;

        // Soft finding — record the room + (when present) the single private
        // neighbour the user is forced to cross.
        const firstPrivateNeighbour: string | undefined =
            Array.from(ns).find(n => typeById.get(n) && typeById.get(n) !== room.type)
            ?? Array.from(ns)[0];
        const reason = firstPrivateNeighbour
            ? `${room.type} "${room.id}" reached only through "${firstPrivateNeighbour}" (no direct hall/corridor door)`
            : `${room.type} "${room.id}" has no door to a hall/corridor (isolated)`;
        soft.push({
            category: 'sequence',
            severity: 'soft',
            metric: 'corridorConnectivity',
            roomIdA: room.id,
            ...(firstPrivateNeighbour ? { roomIdB: firstPrivateNeighbour } : {}),
            delta: 0.5,
            reason,
        });
    }

    return { admissible: true, hardFindings: [], softFindings: soft };
}
