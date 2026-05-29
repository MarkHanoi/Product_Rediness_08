// T2.6 — `validateCirculationSequence` pure validator
// (APARTMENT-DIMENSIONAL-CONSTRAINTS-AND-SPATIAL-PROPORTION-FRAMEWORK-2026-05-29
// Part B §19.2 T2.6; cognition stack §3.B Spatial Hierarchy Engine).
//
// Catches the "compression-release" architectural anti-pattern: the entry hall
// MUST release into a LARGER habitable space (the spatial climax) — not a
// smaller one. A vestibule that releases into a compressed living room reads
// as architecturally backwards.
//
// Today the validator implements:
//   • Find the entry room (hall if present, else the bubble's entryId).
//   • Find every adjacent habitable room (living / dining / kitchen) by
//     looking at the door set.
//   • If the entry's area is GREATER than every adjacent habitable's area,
//     emit ONE soft finding ("entry compresses release").
//   • If no entry exists OR no habitable adjacency, clean pass.
//
// SOFT only. Always admissible.
//
// Why this complements L2-β-1 hierarchy:
//   • L2-β-1 (§PRIVACY-DEPTH) checks depth tiers: private rooms deep, public
//     rooms shallow. That's a privacy-flow check.
//   • T2.6 checks the AREA RATIO between entry and first habitable. That's a
//     proportional / compositional check. The two are orthogonal.

import type { BubbleGraph } from '../tgl/bubbleGraph.js';
import type { DoorOpening } from './validateMandatoryAdjacencies.js';
import type { TopologyFinding, TopologyValidation } from './types.js';

/**
 * Minimal placement shape (id + axis-aligned rect) — same as T2.4 / T2.3.
 */
export interface SequencePlacement {
    readonly id: string;
    readonly rect: { readonly x0: number; readonly z0: number; readonly x1: number; readonly z1: number };
}

const HABITABLE_NEIGHBOUR_TYPES = new Set<string>(['living', 'dining', 'kitchen']);

export function validateCirculationSequence(
    bubble: BubbleGraph,
    placements: readonly SequencePlacement[],
    openings: readonly DoorOpening[],
): TopologyValidation {
    // Identify the entry room. Prefer the hall (architectural entry); fall back
    // to bubble.entryId when no hall exists (open-plan studios).
    const typeById = new Map<string, string>();
    for (const r of bubble.rooms) typeById.set(r.id, r.type);
    const hallId = bubble.rooms.find(r => r.type === 'hall')?.id ?? null;
    const entryId = hallId ?? bubble.entryId;
    if (!entryId) {
        return { admissible: true, hardFindings: [], softFindings: [] };
    }
    const entryPlacement = placements.find(p => p.id === entryId);
    if (!entryPlacement) {
        return { admissible: true, hardFindings: [], softFindings: [] };
    }
    const entryArea = area(entryPlacement.rect);
    if (entryArea <= 0) {
        return { admissible: true, hardFindings: [], softFindings: [] };
    }

    // Find rooms door-connected to the entry. Open thresholds (boundaries) are
    // ALSO sequence-relevant; the bubble's `edges` list captures both via
    // `via: 'door' | 'open'`, so consume that PLUS the realised door openings.
    const adjacentIds = new Set<string>();
    for (const e of bubble.edges) {
        if (e.a === entryId) adjacentIds.add(e.b);
        else if (e.b === entryId) adjacentIds.add(e.a);
    }
    for (const o of openings) {
        if (o.type !== 'door') continue;
        const [a, b] = o.betweenRoomIds as readonly [string, string?];
        if (a === entryId && b) adjacentIds.add(b);
        else if (b === entryId && a) adjacentIds.add(a);
    }

    const adjacentHabitables: SequencePlacement[] = [];
    for (const id of adjacentIds) {
        const t = typeById.get(id);
        if (!t || !HABITABLE_NEIGHBOUR_TYPES.has(t)) continue;
        const p = placements.find(q => q.id === id);
        if (p) adjacentHabitables.push(p);
    }
    if (adjacentHabitables.length === 0) {
        // Entry has no habitable neighbour — nothing to release into; this
        // is its own architectural issue but not THIS validator's concern.
        return { admissible: true, hardFindings: [], softFindings: [] };
    }

    // Find the largest adjacent habitable. If the entry exceeds it, we have a
    // compression anti-pattern.
    let maxNeighbourArea = 0;
    let largestNeighbourId = adjacentHabitables[0]!.id;
    for (const p of adjacentHabitables) {
        const a = area(p.rect);
        if (a > maxNeighbourArea) {
            maxNeighbourArea = a;
            largestNeighbourId = p.id;
        }
    }

    if (entryArea > maxNeighbourArea + 1e-6) {
        // The entry is BIGGER than its first habitable release space — the
        // architectural "anti-climax" reading. Soft penalty proportional to
        // how much bigger.
        const ratio = entryArea / Math.max(1e-6, maxNeighbourArea);
        const delta = Math.min(1, (ratio - 1) / 2);
        const soft: TopologyFinding[] = [{
            category: 'sequence', severity: 'soft', metric: 'compressionRelease',
            roomIdA: entryId, roomIdB: largestNeighbourId, delta,
            reason: `entry (${entryArea.toFixed(1)} m²) is larger than its first habitable space (${maxNeighbourArea.toFixed(1)} m²) — no compression-release sequence`,
        }];
        return { admissible: true, hardFindings: [], softFindings: soft };
    }

    return { admissible: true, hardFindings: [], softFindings: [] };
}

function area(r: SequencePlacement['rect']): number {
    return Math.max(0, r.x1 - r.x0) * Math.max(0, r.z1 - r.z0);
}
