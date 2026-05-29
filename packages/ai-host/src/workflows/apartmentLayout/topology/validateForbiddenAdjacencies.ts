// T2.2 — `validateForbiddenAdjacencies` pure validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §19.2 T2.2).
//
// Walks the door set and reports any pair that VIOLATES the symmetric
// `doorAllowedBetween` rule — the classic forbidden adjacencies (bedroom↔
// bedroom direct, bathroom↔hall, ensuite↔corridor, etc.).
//
// `enumerate.ts` already tracks `compromises` (count of reconciliation doors
// that broke a rule). This validator extends that by producing a STRUCTURED
// FINDING per violation so the modal (D4 / T4) can name the specific pair —
// the legacy `compromises` count gives the user no idea which rooms are at
// fault.

import type { BubbleGraph } from '../tgl/bubbleGraph.js';
import { doorAllowedBetween, roomRule } from '../rules/programRules.js';
import type { DoorOpening } from './validateMandatoryAdjacencies.js';
import type { TopologyFinding, TopologyValidation } from './types.js';

export function validateForbiddenAdjacencies(
    bubble: BubbleGraph,
    openings: readonly DoorOpening[],
): TopologyValidation {
    const typeById = new Map<string, string>();
    const nameById = new Map<string, string>();
    for (const r of bubble.rooms) {
        typeById.set(r.id, r.type);
        nameById.set(r.id, r.name);
    }

    const hard: TopologyFinding[] = [];
    for (const o of openings) {
        if (o.type !== 'door') continue;
        const [a, b] = o.betweenRoomIds as readonly [string, string?];
        if (!a || !b) continue;
        const ta = typeById.get(a);
        const tb = typeById.get(b);
        if (!ta || !tb) continue;
        if (doorAllowedBetween(ta, tb)) continue;
        // Forbidden door realised. Hard finding.
        const labelA = nameById.get(a) ?? a;
        const labelB = nameById.get(b) ?? b;
        hard.push({
            category: 'forbidden', severity: 'hard',
            metric: `door-${ta}-${tb}`,
            roomIdA: a, roomIdB: b, delta: 1.0,
            reason: `forbidden door between ${labelA} (${ta}) and ${labelB} (${tb}) — ${roomRule(ta).privacy} ↔ ${roomRule(tb).privacy}`,
        });
    }

    return { admissible: hard.length === 0, hardFindings: hard, softFindings: [] };
}
