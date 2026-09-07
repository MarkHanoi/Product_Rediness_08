// removeEnvelopes — the ONE way an envelope leaves the store, and the ONE rule about its children.
//
// @command-gate: not-a-command-bus-handler
//
// ⭐ WHY THE MARKER (the precedent is `containmentGate.ts`, which states it in full). Two checks
// classify a file as a CommandBus handler by DIRECTORY — anything one level under a plugin's
// `src/handlers/` — and both would go RED on this file:
//   • `tools/ga-gate/check-otel-spans.ts` ZONE A (zero tolerance, no baseline);
//   • `tests/commands/__tests__/affected-stores.test.ts` R1 + R4.
// It is not a handler: it exports ONE pure draft mutator that the bus cannot dispatch. ⚠ A span
// here would be the wrong fix — its two callers (`DeleteSpaceEnvelopeHandler`,
// `CreateSpaceEnvelopeBatchHandler`) are both instrumented, so a span here would nest inside
// theirs and instrument the same work twice.
//
// §KEEPING-A-MASSING-OPTION-ACCUMULATES-INSTEAD-OF-REPLACING (L-13038, 2026-09-07) · C114 §8 ·
// C84 EI-9.
//
// ── ⛔ WHY IT IS SHARED RATHER THAN COPIED ──────────────────────────────────────────────────
// `spaceEnvelope.delete` and the `supersedes` half of `spaceEnvelope.batch.create` remove an
// envelope for two different reasons, but they must remove it the SAME WAY: the children naming
// it in `withinId` are NOT cascaded, their `withinId` is CLEARED, and both halves land in ONE
// patch pair so a single Ctrl+Z restores the parent AND re-points its children. Two copies of
// that rule is C84 EI-9 — a second answer to one question, which drifts the first time either
// side is touched. C114 §8 states the rule once; this file is the one implementation of it.
//
// ⛔ CASCADING IS FORBIDDEN, AND THE REASON IS IN C114 §8: cascading would destroy an
// architect's room layout because they replaced the storey outline they sketched it against.

import type { SpaceEnvelopeData, SpaceEnvelopesState } from '../store.js';

/**
 * Remove `ids` from an Immer draft of the space-envelope store, clearing the dangling
 * `withinId` of every envelope that named one of them.
 *
 * Ids that are not present are skipped in silence — the CALLER is the one that must decide
 * whether a missing id is a refusal (both callers check first, in `canExecute`, so reaching
 * here with an absent id means the store changed under the command and dropping it is the
 * conservative act, not a hidden failure).
 *
 * PURE over its draft; no store, no DOM, no I/O, no clock. Never throws.
 */
export function removeEnvelopesFromDraft(
    draft: SpaceEnvelopesState,
    ids: readonly string[],
): void {
    if (ids.length === 0) return;
    const removed = new Set(ids);
    const d = draft as Record<string, SpaceEnvelopeData>;
    // Children FIRST, read off the draft before anything is deleted, so the scan cannot miss a
    // record that a later delete removed from under it.
    const orphans = Object.values(d)
        .filter((e) => e.withinId !== null && removed.has(e.withinId) && !removed.has(e.id))
        .map((e) => e.id);
    for (const id of removed) delete d[id];
    // Clear, never cascade (C114 §8). One patch pair holds both halves.
    for (const id of orphans) {
        const cur = d[id];
        if (cur) d[id] = { ...cur, withinId: null };
    }
}
