// T2.1 — `validateMandatoryAdjacencies` pure validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §19.2 T2.1).
//
// Verifies every mandatory adjacency declared by `mandatoryAdjacenciesFor`
// (T1.2) is realised by a DOOR in the post-walls-and-doors output. Catches the
// case where the bubble-graph builder declared the edge but the door
// reconciliation pass had to drop it because no shared wall was geometrically
// available.
//
// Today's mandatory edges (per T1.2):
//   • master ↔ ensuite (when program.masterEnSuite)
//   • hall ↔ corridor (when both exist)
//   • hall ↔ living   (when both exist)
//
// Unrealised mandatory ⇒ HARD finding. The enumerate gate (T3.1, later commit)
// drops the candidate. Today's bubble graph reliably produces these so
// production layouts ALREADY pass — the value is detecting regressions if a
// future change to walls-and-doors silently breaks the invariant.

import type { BubbleGraph } from '../tgl/bubbleGraph.js';
import type { ApartmentProgram, RoomType } from '../types.js';
import { mandatoryAdjacenciesFor } from './adjacencyRules.js';
import type { TopologyFinding, TopologyValidation } from './types.js';

/**
 * Minimal opening shape consumed by the validator. Mirrors the field already on
 * `wallsAndDoors.openings` — taking it as a structural slice keeps the
 * topology layer decoupled from the wallsAndDoors module.
 */
export interface DoorOpening {
    readonly type: 'door' | 'window';
    readonly betweenRoomIds: readonly [string, string?];
}

export function validateMandatoryAdjacencies(
    program: ApartmentProgram,
    bubble: BubbleGraph,
    openings: readonly DoorOpening[],
): TopologyValidation {
    const declared = mandatoryAdjacenciesFor(program);
    if (declared.length === 0) {
        return { admissible: true, hardFindings: [], softFindings: [] };
    }

    // Per-type, pick the first room id (deterministic — bubble graph builds in
    // a stable order). For multi-bedroom programs we only check master + the
    // bedrooms set; framework's mandatory entries cover one-per-type today.
    const idByType = new Map<RoomType, string>();
    for (const r of bubble.rooms) {
        if (!idByType.has(r.type)) idByType.set(r.type, r.id);
    }

    // Index doors by unordered pair-key for O(1) lookup.
    const doorPairKeys = new Set<string>();
    for (const o of openings) {
        if (o.type !== 'door') continue;
        const [a, b] = o.betweenRoomIds as readonly [string, string?];
        if (a && b) doorPairKeys.add(pairKey(a, b));
    }

    const hard: TopologyFinding[] = [];
    for (const m of declared) {
        const ida = idByType.get(m.a);
        const idb = idByType.get(m.b);
        if (!ida || !idb) {
            // Bubble graph didn't even create one of the rooms — programme/
            // bubble mismatch. HARD finding so the enumerate gate drops it.
            hard.push({
                category: 'mandatory', severity: 'hard', metric: m.id, delta: 1.0,
                roomIdA: ida ?? `(missing ${m.a})`,
                ...(idb ? { roomIdB: idb } : {}),
                reason: `mandatory ${m.id}: room "${ida ? m.b : m.a}" not in the program`,
            });
            continue;
        }
        const key = pairKey(ida, idb);
        if (!doorPairKeys.has(key)) {
            hard.push({
                category: 'mandatory', severity: 'hard', metric: m.id, delta: 1.0,
                roomIdA: ida, roomIdB: idb,
                reason: `mandatory ${m.id} not realised: no door between ${m.a} (${ida}) and ${m.b} (${idb})`,
            });
        }
    }

    return { admissible: hard.length === 0, hardFindings: hard, softFindings: [] };
}

const pairKey = (a: string, b: string): string => a < b ? `${a}|${b}` : `${b}|${a}`;
