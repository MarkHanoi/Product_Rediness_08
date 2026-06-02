// A.39.b — `validateEntrySightline` perceptual evaluator
// (APARTMENT-COGNITION-STACK L5 — compression-release pattern).
//
// Architectural intent: when a visitor crosses the front door, the
// "arrival sequence" should compress (small lobby / hall) and then
// release (into a larger living zone). Layouts where the entry opens
// DIRECTLY onto a sleeping zone, or that bury every habitable room
// behind 5+ door-hops, both feel wrong.
//
// The evaluator builds an adjacency graph from the rooms + doors and
// runs BFS from the entry room. Findings:
//
//   - HARD: a private room (master / bedroom / bathroom / ensuite)
//           sits at BFS depth 0 or 1 from the entry — i.e. visible /
//           directly accessible from the front door. Privacy break.
//   - SOFT: the deepest habitable room (master / bedroom / living)
//           sits at BFS depth > 4 — over-buried, the visitor walks
//           through too many thresholds. Compression-release misses.
//   - SOFT: the entry room itself is NOT a circulation room
//           (hall / corridor) — direct-onto-living is a soft miss
//           because there's no compression phase.
//
// L2-pure: no THREE / DOM / RNG.

import type { RoomType } from '../types.js';
import type {
    DimensionalValidation,
    ValidationFinding,
} from './types.js';

const MAX_HABITABLE_DEPTH = 4;
const MIN_HABITABLE_DEPTH = 1;

/** Room types that MUST stay private (not visible from entry). */
const PRIVATE_TYPES: ReadonlySet<RoomType> = new Set<RoomType>([
    'master',
    'bedroom',
    'bathroom',
    'ensuite',
    'wc',
]);

/** Room types that count as the "destination" for compression-release depth. */
const HABITABLE_DESTINATION: ReadonlySet<RoomType> = new Set<RoomType>([
    'master',
    'bedroom',
    'living',
]);

/** Room types that PASS as the compression-phase entry. */
const ENTRY_CIRCULATION: ReadonlySet<RoomType> = new Set<RoomType>([
    'hall',
    'corridor',
]);

export interface SightlineRoomInput {
    readonly roomId: string;
    readonly type: RoomType;
    readonly name?: string;
}

/**
 * One door in the adjacency graph. Each door connects exactly two
 * rooms (by id). The entry door connects the apartment's entry room
 * to the EXTERIOR — pass `'__exterior__'` as one of the room ids.
 */
export interface SightlineDoorInput {
    readonly roomA: string;
    readonly roomB: string;
}

export interface SightlineInput {
    readonly rooms: readonly SightlineRoomInput[];
    readonly doors: readonly SightlineDoorInput[];
    /** Id of the room the front door opens onto. The BFS root. */
    readonly entryRoomId: string;
}

function labelOf(r: SightlineRoomInput | undefined): string {
    if (!r) return '?';
    return r.name ?? r.roomId;
}

/**
 * Build the room-adjacency map from the door list. Each door becomes
 * a bidirectional edge between the two room ids it joins. Doors to
 * `__exterior__` are filtered out (the exterior is not a node).
 */
function buildAdjacency(
    doors: readonly SightlineDoorInput[],
): Map<string, Set<string>> {
    const adj = new Map<string, Set<string>>();
    for (const door of doors) {
        const a = door.roomA;
        const b = door.roomB;
        if (a === '__exterior__' || b === '__exterior__') continue;
        if (!adj.has(a)) adj.set(a, new Set());
        if (!adj.has(b)) adj.set(b, new Set());
        adj.get(a)!.add(b);
        adj.get(b)!.add(a);
    }
    return adj;
}

/**
 * BFS from `entryRoomId` returning a depth map (room id → distance in
 * doors). The entry room itself is at depth 0; rooms not reachable
 * are absent from the map.
 */
function bfsDepth(
    entryRoomId: string,
    adj: Map<string, Set<string>>,
): Map<string, number> {
    const depth = new Map<string, number>();
    depth.set(entryRoomId, 0);
    const queue: string[] = [entryRoomId];
    while (queue.length > 0) {
        const node = queue.shift()!;
        const d = depth.get(node)!;
        const neighbors = adj.get(node);
        if (!neighbors) continue;
        for (const next of neighbors) {
            if (depth.has(next)) continue;
            depth.set(next, d + 1);
            queue.push(next);
        }
    }
    return depth;
}

/**
 * Run the compression-release evaluation. Returns a DimensionalValidation
 * with:
 *   - hard findings for any private room within 1 door of the entry
 *   - soft findings for over-buried habitable destinations + a
 *     non-circulation entry room
 *
 * `admissible: false` ⇒ a private room is publicly visible — the
 * Pareto rank drops the candidate.
 */
export function validateEntrySightline(
    input: SightlineInput,
): DimensionalValidation {
    const hard: ValidationFinding[] = [];
    const soft: ValidationFinding[] = [];
    const { rooms, doors, entryRoomId } = input;

    const roomById = new Map(rooms.map((r) => [r.roomId, r]));
    const entryRoom = roomById.get(entryRoomId);

    // Degenerate input: entry not found → no findings (the caller's
    // upstream validator will catch the missing room).
    if (!entryRoom) {
        return { admissible: true, hardFindings: [], softFindings: [] };
    }

    // SOFT — entry room is not a circulation room. Compression-release
    // pattern asks for hall / corridor at depth 0.
    if (!ENTRY_CIRCULATION.has(entryRoom.type)) {
        soft.push({
            roomId: entryRoom.roomId,
            severity: 'soft',
            metric: 'entryNotCirculation',
            delta: 0.4,
            reason: `entry opens directly onto ${labelOf(entryRoom)} (${entryRoom.type}) — compression-release expects a hall or corridor at the threshold`,
        });
    }

    const adj = buildAdjacency(doors);
    const depth = bfsDepth(entryRoomId, adj);

    // HARD — private rooms within 1 door of the entry.
    for (const room of rooms) {
        if (!PRIVATE_TYPES.has(room.type)) continue;
        const d = depth.get(room.roomId);
        if (d === undefined) continue;
        if (d <= MIN_HABITABLE_DEPTH) {
            hard.push({
                roomId: room.roomId,
                severity: 'hard',
                metric: 'privateRoomTooShallow',
                delta: 1,
                reason: `${labelOf(room)} (${room.type}) is at sightline depth ${d} from entry — private rooms must sit at depth ≥ 2 (privacy break)`,
            });
        }
    }

    // SOFT — habitable destinations buried > MAX_HABITABLE_DEPTH.
    let deepestHabitable = -1;
    let deepestRoom: SightlineRoomInput | undefined;
    for (const room of rooms) {
        if (!HABITABLE_DESTINATION.has(room.type)) continue;
        const d = depth.get(room.roomId);
        if (d === undefined) continue;
        if (d > deepestHabitable) {
            deepestHabitable = d;
            deepestRoom = room;
        }
    }
    if (deepestRoom && deepestHabitable > MAX_HABITABLE_DEPTH) {
        const range = Math.max(1, deepestHabitable);
        const delta = Math.min(
            1,
            (deepestHabitable - MAX_HABITABLE_DEPTH) / range,
        );
        soft.push({
            roomId: deepestRoom.roomId,
            severity: 'soft',
            metric: 'destinationTooDeep',
            delta,
            reason: `${labelOf(deepestRoom)} (${deepestRoom.type}) is at sightline depth ${deepestHabitable} — beyond ${MAX_HABITABLE_DEPTH} the compression-release pattern breaks (visitor walks through too many thresholds)`,
        });
    }

    return {
        admissible: hard.length === 0,
        hardFindings: hard,
        softFindings: soft,
    };
}
