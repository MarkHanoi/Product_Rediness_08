// groupMembership — the ONE answer to "is this envelope in that massing group?".
//
// ADR-0383 D1 / D3 · C114 §6e clause 3 · C84 EI-9.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHY THIS FILE EXISTS, WHEN THE PREDICATE IS ONE EXPRESSION
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `SpaceEnvelopeStore.byGroup()` already asked this question, and its own doc says why a second
// hand-rolled `filter(e => e.group === null)` elsewhere *"would be the same rule with two
// implementations, which is this repository's most-repeated defect"*.
//
// ⚠ AND THEN THE GROUP VERBS COULD NOT CALL IT. A CommandBus handler receives
// `ctx.stores.spaceEnvelope` as a PLAIN RECORD (`SpaceEnvelopesState`), not as the `SpaceEnvelopeStore`
// instance that carries `byGroup`. So the three `spaceEnvelope.group.*` handlers had exactly two
// options: re-type the predicate — which is the defect that method's doc warns against, arriving by
// the route the warning did not anticipate — or extract it. It is extracted, and **`byGroup` now
// calls this**, so there is one implementation with two callers rather than two implementations
// with one caller each.
//
// ⛔ THE EXPRESSION IS `(e.group?.id ?? null) === groupId` AND THE `?? null` IS LOAD-BEARING.
// `null` is the UNGROUPED BUCKET (ADR-0383 D3), not "unspecified", so passing `null` is a real
// question with a real answer — *"which envelopes belong to no building"* — and it must not be
// confused with a missing argument. That is why `groupId` here is REQUIRED and not defaulted.
//
// PURE: no store handle, no DOM, no I/O, no clock, no span (this is called inside handler spans and
// a span here would instrument the same work twice — the `removeEnvelopes.ts` precedent).

import type { SpaceEnvelopeData } from './store.js';

/**
 * Is this envelope in the bucket named by `groupId`?
 *
 * @param groupId the group's id, or `null` for the UNGROUPED bucket. ⛔ Required — see the header.
 */
export function isInMassingGroup(
    envelope: Readonly<{ group?: SpaceEnvelopeData['group'] }>,
    groupId: string | null,
): boolean {
    return (envelope.group?.id ?? null) === groupId;
}

/**
 * Every member of one massing group, in the iteration order of the source.
 *
 * ⛔ NO ROLE FILTER, DELIBERATELY. A `role: 'room'` record that carries the group is a MEMBER —
 * `rename` must reach it or it keeps a stale label, and `dissolve` must reach it or the group
 * survives in a record nothing lists. Callers that need only the storeys of the group filter on
 * `role` THEMSELVES, at the point where that is the actual question (`setStoreys`), so that the
 * membership rule and the storey rule stay two separate decisions.
 */
export function massingGroupMembers(
    envelopes: Iterable<SpaceEnvelopeData>,
    groupId: string | null,
): readonly SpaceEnvelopeData[] {
    const out: SpaceEnvelopeData[] = [];
    for (const e of envelopes) if (isInMassingGroup(e, groupId)) out.push(e);
    return out;
}
