// containmentGate — the ONE place every mutating verb asks "does this record still respect
// room ⊂ level?" before it writes.
// §RESI-STAGE-G (2026-09-05) · STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §12 · C114 §12a / §14 ·
// C84 EI-9.2 · C83 §1.2.
//
// ⭐ ONE QUESTION, ONE ASKER. Six verbs can move a room out of its level (create, move,
// moveFace, setFootprint, setParameter, setWithin) and two can shrink a level around its
// rooms. Each of them calls THIS, so the gate, the pre-flight and the commit ask the same
// question (C84 EI-9.2) — and the question itself is the geometry package's, not this
// file's: `roomContainmentRefusal` / `levelOrphanRefusal` are the containment test the
// drag preview also runs. A refusal is returned as `ValidationResult.reason` verbatim,
// both numbers included, and never paraphrased (C84 EI-8a).
//
// ⛔ NEVER CLAMPS. A candidate that would leave its level is refused with the excursion;
// nothing here moves the room back to the bound, because a silently-corrected edit is a
// well-formed wrong answer with no symptom.

import {
    levelOrphanRefusal,
    roomContainmentRefusal,
    type SpaceEnvelopeContextEntry,
    type SpaceEnvelopePrism,
} from '@pryzm/geometry-space-envelope';
import type { SpaceEnvelopeData, SpaceEnvelopesState } from '../store.js';

/** The record as the contextual planner sees it. */
export function contextEntryOf(record: SpaceEnvelopeData): SpaceEnvelopeContextEntry {
    return {
        prism: prismOf(record),
        role: record.role,
        levelId: record.levelId,
        withinId: record.withinId,
        name: record.name,
    };
}

export function prismOf(record: {
    readonly id: string;
    readonly footprint: readonly { readonly x: number; readonly y: number; readonly z: number }[];
    readonly baseOffset: number;
    readonly height: number;
}): SpaceEnvelopePrism {
    return { id: record.id, footprint: record.footprint, baseOffset: record.baseOffset, height: record.height };
}

/** Every record in the store as a context entry — the WORLD a verdict is judged against. */
export function contextWorldOf(state: SpaceEnvelopesState): readonly SpaceEnvelopeContextEntry[] {
    return Object.values(state).map(contextEntryOf);
}

function label(name: string | undefined, id: string): string {
    const n = name?.trim();
    return n && n.length > 0 ? `'${n}'` : `'${id}'`;
}

/**
 * The refusal reason for writing `candidate` into a store holding `state`, or `null`.
 *
 * `candidate` is the record AS IT WOULD BE after the verb — the same object the handler
 * is about to write — so the gate cannot judge a different geometry than the one that
 * lands. `extraLevels` lets a batch create check a room against a level minted in the
 * same batch, which is not in `state` yet.
 */
export function containmentRefusalFor(
    state: SpaceEnvelopesState,
    candidate: SpaceEnvelopeData,
    extraLevels: readonly SpaceEnvelopeData[] = [],
): string | null {
    if (candidate.role === 'room' && candidate.withinId) {
        const level = state[candidate.withinId] ?? extraLevels.find((e) => e.id === candidate.withinId);
        if (level) {
            const r = roomContainmentRefusal(prismOf(candidate), prismOf(level), {
                room: label(candidate.name, candidate.id),
                level: label(level.name, level.id),
            });
            if (r) return r.message;
        }
        return null;
    }
    if (candidate.role === 'level') {
        const rooms = Object.values(state)
            .filter((e) => e.role === 'room' && e.withinId === candidate.id && e.id !== candidate.id)
            .map(contextEntryOf);
        const r = levelOrphanRefusal(prismOf(candidate), rooms, label(candidate.name, candidate.id));
        if (r) return r.message;
    }
    return null;
}
