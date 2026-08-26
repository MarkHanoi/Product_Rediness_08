// §CONTEXT-DERIVED-STUDY-ENVELOPE (§ENVAMS148) — SESSION-ONLY holder for the last computed
// context-derived study envelope (or its refusal), keyed by site id.
//
// ── WHY THIS IS NOT ON THE PERSISTED PARCEL (C19), UNLIKE `BuildableDeterminationRecord` ──────
// `BuildableDeterminationRecord` (C58, §GIS-ENVELOPE-DETERMINATION-PERSIST) is a DATED SNAPSHOT of
// an actual determination — it must survive a reload because re-deriving it needs network and the
// answer is meant to be stable until the parcel is re-committed. A context-derived study makes NO
// determination (see `@pryzm/schemas`'s `ContextDerivedStudyEnvelope` header): it is explicitly
// INDICATIVE, cheap to recompute, and its whole point is to reflect whatever real neighbour data
// exists RIGHT NOW. Persisting it onto the C19 Parcel would misrepresent it as the kind of durable
// fact `BuildableDeterminationRecord` is — the exact category error the schema was designed to
// make impossible. So it lives here: in-memory, session-scoped, recomputed on demand — the same
// shape as `envelopeResolutionState.ts`'s "fourth state", and for the same reason (a concern real
// enough to need a shared read point, but not real enough to earn C19 persistence).
//
// NO DOM, NO STORE, NO FETCH — dependency-free so `siteDispatch.ts` (512 KB) and any future rail
// panel can both read this without the panel importing the dispatcher.

import type { ContextDerivedStudyEnvelopeResult } from '@pryzm/site-parcel-data';

let _bySiteId: Map<string, ContextDerivedStudyEnvelopeResult> = new Map();

/** Record the last context-derived study result computed for `siteId` (ok or a typed refusal). */
export function setContextDerivedStudyEnvelope(
    siteId: string,
    result: ContextDerivedStudyEnvelopeResult,
): void {
    _bySiteId.set(siteId, result);
}

/** The last context-derived study result for `siteId`, or `null` if none was ever computed. */
export function getContextDerivedStudyEnvelope(
    siteId: string,
): ContextDerivedStudyEnvelopeResult | null {
    return _bySiteId.get(siteId) ?? null;
}

/** Drop every recorded study. C13 §4 — project teardown must not leak project A's study into B. */
export function resetContextDerivedStudyEnvelopeState(): void {
    _bySiteId = new Map();
}
