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
//
// §ENV3D164 (L-12700) — PUB/SUB ADDED. Until now this module was READ-ONLY infrastructure: a
// value was written here "for a future rail panel to read", and the rail panel that eventually
// read it (`envelopeCardSections.ts`) is re-rendered by `GISAreaLayout.refreshEnvelopePanel`
// on its own timer, so it never needed to know when the value changed. `ParcelBoundarySceneRenderer`
// (the three.js scene, NOT a panel) has no such re-render loop of its own — it repaints only from
// explicit subscriptions (`site.parcel-boundary-set`, the SiteModelStore, the envelope-visibility
// authority). Without a notification here, a study saved via `applyUserSuppliedStudyHeight` would
// sit in this map until some UNRELATED scene event happened to fire a `refresh()`. The pattern
// mirrors `envelopeVisibility.ts`'s `subscribeBuildableEnvelopeVisibility` exactly: PUSH, not poll,
// so a renderer holds no local timer and cannot drift from what this module actually holds.

import type { ContextDerivedStudyEnvelopeResult } from '@pryzm/site-parcel-data';

let _bySiteId: Map<string, ContextDerivedStudyEnvelopeResult> = new Map();

/** No-argument, matching `envelopeVisibility.ts`'s `Listener` — a snapshot invites a subscriber to
 *  render from a passed value instead of re-asking, which is the exact L-1170 defect one level
 *  down. The notification says only "something changed; re-read the map yourself". */
type Listener = () => void;

const listeners = new Set<Listener>();

/** Notify every subscribed surface. A listener that throws is logged and skipped — one broken
 *  surface must never stop another from repainting (same rule as `envelopeVisibility.ts`). */
function notify(): void {
    for (const fn of [...listeners]) {
        try { fn(); }
        catch (e) { console.warn('[gis][c58] §CONTEXT-DERIVED-STUDY-ENVELOPE listener threw (non-fatal):', e); }
    }
}

/** Record the last context-derived study result computed for `siteId` (ok or a typed refusal). */
export function setContextDerivedStudyEnvelope(
    siteId: string,
    result: ContextDerivedStudyEnvelopeResult,
): void {
    _bySiteId.set(siteId, result);
    notify();
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
    notify();
}

/**
 * Subscribe a rendering surface to this state. Returns its own unsubscribe. §ENV3D164 —
 * `ParcelBoundarySceneRenderer` is the first (and, at time of writing, only) subscriber; it
 * repaints its study-massing volume whenever a study is computed, saved, or the project switches.
 */
export function subscribeContextDerivedStudyEnvelope(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

/** Test-only reset — drops every subscriber without touching the map (pair with
 *  `resetContextDerivedStudyEnvelopeState()` for a full reset). */
export function __resetContextDerivedStudyEnvelopeListenersForTests(): void {
    listeners.clear();
}
