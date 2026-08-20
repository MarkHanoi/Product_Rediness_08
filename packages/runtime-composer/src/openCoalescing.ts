/**
 * openCoalescing — §FIX-OPEN-COALESCE-KEYED-ON-NOTHING
 *
 * ─── THE DEFECT THIS MODULE EXISTS TO MAKE IMPOSSIBLE ───────────────────────
 *
 * `buildPersistence.ts`'s `openProject` de-duplicated concurrent opens with:
 *
 *     if (openProjectInflight !== null) return openProjectInflight;
 *
 * That guard **ignores `projectId`**. The async body closes over the FIRST
 * call's id, so an open requested for B while A was still in flight was handed
 * A's promise — and `projectContext.set(...)`, the stream-load and
 * `setProjectContext(...)` all ran for A while the caller believed it had
 * opened B. The promise then RESOLVED, which reports success.
 *
 * ⭐ Could B's open EVER win? **No** — not once, not by racing, not by timing.
 * During the in-flight window B was unsatisfiable BY CONSTRUCTION. And the
 * window is a network refresh plus an engine boot, so it is seconds wide on a
 * real hub: clicking a second card during a slow load silently opened the
 * first one.
 *
 * ⭐ It is the same shape as the reconciler defect one layer down (L-1289):
 * **ONE VALUE** — "an open is in flight" — standing in for a **DIFFERENT
 * QUESTION** — "the open YOU asked for is in flight". Neither could fail
 * honestly, so both answered confidently and wrongly.
 *
 * ─── WHY THE DECISION IS A PURE FUNCTION IN ITS OWN FILE ────────────────────
 *
 * Exactly the argument made for `localOnlyProjectFate.ts` and for the same
 * reason. Inlined in `openProject`, this policy is reachable only by
 * constructing the whole persistence slot — which dynamically imports
 * `@pryzm/persistence-client` and `@pryzm/stores` and, through them, the
 * command-registry and every geometry barrel behind it. A three-state decision
 * should not require the object graph of the entire application to assert. Here
 * each state is one line.
 */

/** What `openProject` should do with an incoming request. */
export type OpenDisposition =
    /** Nothing is in flight — run the open now. */
    | { readonly kind: 'start' }
    /**
     * The SAME project is already opening. Hand back the existing promise.
     * This is the genuine-duplicate case the four `launchWorkspace` call sites
     * produce (L-1282) and coalescing it is correct.
     */
    | { readonly kind: 'coalesce' }
    /**
     * A DIFFERENT project is already opening. The new request must still
     * happen, but CHAINED after the current one rather than concurrently.
     *
     * ⚠ Concurrency was considered and rejected: two overlapping opens would
     * both drive `projectContext` and `attachedSurface.setProjectContext`,
     * producing a last-writer-wins interleave of two engine loads — a worse
     * defect than the one being fixed. Sequencing makes the LAST-REQUESTED
     * project the one the user ends on, which is what they asked for.
     */
    | { readonly kind: 'supersede'; readonly supersededProjectId: string };

export interface OpenCoalescingState {
    /** Is an open currently in flight? */
    readonly hasInflight: boolean;
    /**
     * WHICH project the in-flight open is for.
     *
     * ⚠ `null` while nothing is in flight. If `hasInflight` is true and this is
     * `null`, the state is INCOHERENT — an open is running whose identity was
     * never recorded, which is precisely the pre-fix world. It is treated as a
     * supersede-with-unknown rather than silently coalesced, because coalescing
     * is the branch that returns the WRONG PROJECT.
     */
    readonly inflightProjectId: string | null;
}

/**
 * Decide how to handle an open request for `requestedProjectId`.
 *
 * ⚠ ORDER IS LOAD-BEARING. Identity is compared BEFORE any decision to reuse
 * the in-flight promise, so "something is running" can never be mistaken for
 * "your thing is running".
 */
export function decideOpenDisposition(
    state: OpenCoalescingState,
    requestedProjectId: string,
): OpenDisposition {
    if (!state.hasInflight) return { kind: 'start' };

    // The incoherent case — see `inflightProjectId`. Never coalesce here.
    if (state.inflightProjectId === null) {
        return { kind: 'supersede', supersededProjectId: '' };
    }

    if (state.inflightProjectId === requestedProjectId) return { kind: 'coalesce' };

    return { kind: 'supersede', supersededProjectId: state.inflightProjectId };
}
