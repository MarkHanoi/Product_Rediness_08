// §MANUALENV159 (L-12640) — SESSION store for the RAW user-supplied study-height decision, keyed
// by site id. Sibling of `contextDerivedStudyEnvelopeState.ts`, and deliberately NOT the same
// module: that file is explicitly SESSION-ONLY (a median-of-neighbours study is cheap to
// recompute and reflects "right now" data, so persisting the COMPUTED object would misrepresent
// it — see that file's own header). A user-supplied height is the opposite kind of fact: it is an
// explicit decision the user made ("assume 24.5 m"), nothing external will ever hand it back, and
// losing it on reload would be the exact §RATES157 failure ("yesterday I added many cost prices,
// today they are gone") applied to this feature instead of the rate book.
//
// WHAT IS PERSISTED IS THE RAW DECISION (heightM + setbackM), NOT THE COMPUTED STUDY. The
// computed `ContextDerivedStudyEnvelope` (footprint, area, disclaimer) is RECOMPUTED on load
// against the CURRENT parcel ring — mirrors the derived study's own "recomputed on demand"
// philosophy exactly; only the HEIGHT NUMBER ITSELF is what persistence needs to remember, because
// unlike neighbour data it does not exist anywhere else to be re-read. See `restoreSiteState` in
// `siteDispatch.ts` for the recompute-on-load call site, and `ProjectSerializer.ts` /
// `ProjectLoader.ts` for the C47 additive-optional `ProjectSnapshot.manualStudyHeight` field this
// module serializes to/from (the exact pattern §RATES157 used for `ProjectSnapshot.rates`).
//
// NO DOM, NO STORE, NO FETCH — dependency-free, matching `contextDerivedStudyEnvelopeState.ts`.

/** One project's remembered "assume this height" decision for one site. */
export interface UserSuppliedStudyHeightRecord {
    readonly heightM: number;
    /** Inward offset from the parcel ring, metres. 0 = the parcel ring itself. */
    readonly setbackM: number;
    /** When this decision was typed/saved (ISO-8601) — shown on the badge so it never reads as
     *  fresher than it is. */
    readonly savedAtIso: string;
}

let _bySiteId: Map<string, UserSuppliedStudyHeightRecord> = new Map();

/** Record (or overwrite) the user-supplied study-height decision for `siteId`. */
export function setUserSuppliedStudyHeight(
    siteId: string,
    record: UserSuppliedStudyHeightRecord,
): void {
    _bySiteId.set(siteId, record);
}

/** The recorded decision for `siteId`, or `null` if the user never typed one. */
export function getUserSuppliedStudyHeight(siteId: string): UserSuppliedStudyHeightRecord | null {
    return _bySiteId.get(siteId) ?? null;
}

/** Drop the recorded decision for `siteId` (e.g. the user clears the input). */
export function clearUserSuppliedStudyHeight(siteId: string): void {
    _bySiteId.delete(siteId);
}

/** Drop every recorded decision. C13 §4 — project teardown must not leak project A's typed
 *  height into project B. */
export function resetUserSuppliedStudyHeightState(): void {
    _bySiteId = new Map();
}

/**
 * Every recorded decision, keyed by site id — the shape `ProjectSerializer.ts` writes onto
 * `ProjectSnapshot.manualStudyHeight.bySiteId`. `undefined` (never `{}`) when nothing is recorded,
 * so an untouched project's snapshot carries no `manualStudyHeight` key at all — mirrors
 * §RATES157's own "omitted entirely, never an empty stub" rule.
 */
export function serializeUserSuppliedStudyHeights():
    Record<string, UserSuppliedStudyHeightRecord> | undefined {
    if (_bySiteId.size === 0) return undefined;
    const out: Record<string, UserSuppliedStudyHeightRecord> = {};
    for (const [siteId, record] of _bySiteId) out[siteId] = record;
    return out;
}

/**
 * Repopulate this session's state from a loaded `ProjectSnapshot.manualStudyHeight.bySiteId`.
 * REPLACES the whole map (a project load is a full-state operation, same as
 * `resetContextDerivedStudyEnvelopeState` at project-switch) — never merges with whatever a PRIOR
 * project left behind. Does NOT recompute the displayed study itself; the caller
 * (`restoreSiteState`) does that once the parcel ring it needs is also restored.
 */
export function restoreUserSuppliedStudyHeights(
    data: Record<string, UserSuppliedStudyHeightRecord> | null | undefined,
): void {
    _bySiteId = new Map(data ? Object.entries(data) : []);
}
