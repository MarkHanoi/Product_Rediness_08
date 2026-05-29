// T2.3 — `validateAcousticZoning` pure validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §19.2 T2.3).
//
// Acoustic-sensitive rooms (master / bedroom / study — receivers) should not
// share a wall with acoustic-generating rooms (living / dining / kitchen /
// utility — sources) without a buffer.
//
// Today the validator implements the simplest sufficient check:
//   Direct shared wall between source ↔ receiver ⇒ SOFT penalty.
// A future T2.3' (planned with §3.E perceptual layer) will refine this with
// per-pair severity (TV-vs-master much worse than dining-vs-study) + the
// option of an "insulated wall" flag that ABSORBS the penalty.
//
// Pure: reads bubble + placements. Emits SOFT findings only.

import type { BubbleGraph } from '../tgl/bubbleGraph.js';
import { ACOUSTIC_RECEIVER_TYPES, ACOUSTIC_SOURCE_TYPES } from './adjacencyRules.js';
import type { TopologyFinding, TopologyValidation } from './types.js';

/**
 * Minimal placement shape — id + axis-aligned rect, like T2.4 wet-cluster.
 */
export interface AcousticPlacement {
    readonly id: string;
    readonly rect: { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number };
}

const SHARE_TOL = 0.05; // metres — matches T2.4 wet-cluster

/** Two rectangles share a wall (any side, axis-aligned). */
function rectsShareWall(a: AcousticPlacement['rect'], b: AcousticPlacement['rect']): boolean {
    const zOverlap = Math.max(a.z0, b.z0) < Math.min(a.z1, b.z1) - SHARE_TOL;
    const xOverlap = Math.max(a.x0, b.x0) < Math.min(a.x1, b.x1) - SHARE_TOL;
    const vert =
        (Math.abs(a.x1 - b.x0) < SHARE_TOL || Math.abs(b.x1 - a.x0) < SHARE_TOL) && zOverlap;
    const horiz =
        (Math.abs(a.z1 - b.z0) < SHARE_TOL || Math.abs(b.z1 - a.z0) < SHARE_TOL) && xOverlap;
    return vert || horiz;
}

/**
 * For each source ↔ receiver pair that shares a wall, emit a SOFT finding.
 * Per-pair delta is 1 / max(1, totalAcousticPairsPossible) so the aggregate
 * stays bounded even when many bedrooms abut many social rooms.
 */
export function validateAcousticZoning(
    bubble: BubbleGraph,
    placements: readonly AcousticPlacement[],
): TopologyValidation {
    const typeById = new Map<string, string>();
    const nameById = new Map<string, string>();
    for (const r of bubble.rooms) {
        typeById.set(r.id, r.type);
        nameById.set(r.id, r.name);
    }

    const sources: AcousticPlacement[] = [];
    const receivers: AcousticPlacement[] = [];
    for (const p of placements) {
        const t = typeById.get(p.id);
        if (!t) continue;
        if (ACOUSTIC_SOURCE_TYPES.has(t as never)) sources.push(p);
        if (ACOUSTIC_RECEIVER_TYPES.has(t as never)) receivers.push(p);
    }
    if (sources.length === 0 || receivers.length === 0) {
        return { admissible: true, hardFindings: [], softFindings: [] };
    }

    const denom = Math.max(1, sources.length * receivers.length);
    const soft: TopologyFinding[] = [];
    for (const src of sources) {
        for (const rcv of receivers) {
            if (!rectsShareWall(src.rect, rcv.rect)) continue;
            const tSrc = typeById.get(src.id) ?? 'source';
            const tRcv = typeById.get(rcv.id) ?? 'receiver';
            soft.push({
                category: 'acoustic', severity: 'soft', metric: `acoustic-${tSrc}-${tRcv}`,
                roomIdA: src.id, roomIdB: rcv.id, delta: 1 / denom,
                reason: `${nameById.get(src.id) ?? src.id} (${tSrc}) shares a wall with ${nameById.get(rcv.id) ?? rcv.id} (${tRcv}) — acoustic source ↔ receiver`,
            });
        }
    }

    return { admissible: true, hardFindings: [], softFindings: soft };
}
