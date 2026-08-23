/**
 * saveWipeGuard — §GUARD-EMPTY-SNAPSHOT (L-10041)
 *
 * The CLIENT half of the empty-snapshot wipe defence, as a pure function.
 *
 * ─── THE WINDOW THIS CLOSES, NAMED ──────────────────────────────────────────
 *
 * `SaveOrchestrator` already fences autosave against a load in three places —
 * `handleMutation()`, `executeSave()` and `flushBeforeUnload()` all return early
 * on `isLoading`, and `_loadSuppressActive` extends the fence across the
 * fire-and-forget post-load sweep. That is Pascal's `skip-loading` branch, and
 * PRYZM's version of it is the STRONGER of the two.
 *
 * ⛔ But `PlatformShell.setProjectContext()` drops the fence BEFORE the real
 * data has arrived. On the no-local-history path it loads `_makeEmptySnapshot()`
 * to clear the scene, and in that promise's `.then` it calls
 * `orchestrator.setLoading(false)` and `resetDirtyAfterLoad()` and only THEN
 * awaits `warmVersionCache()` / `_loadLatestVersionFromServer()`. For the whole
 * of that await the scene is EMPTY, the load-suppress latch has already been
 * cleared by the empty load finishing, and autosave is armed. Any mutation in
 * that window — a post-clear sweep, a wall rebuild, the user drawing while the
 * spinner is up — serialises the empty scene and writes it as the project's
 * newest version.
 *
 * ⛔ And when the server fetch FAILS (offline, 5xx, a parse error) and the local
 * restore also misses, the project simply stays empty with the fence down. The
 * real model is still on the server. The next autosave buries it.
 *
 * ─── THE RULE, AND WHY IT IS THE NARROWEST ONE THAT CLOSES ANYTHING ─────────
 *
 * REFUSE an AUTOSAVE whose snapshot has zero content elements when the latest
 * stored version of the same project has at least one. Nothing else.
 *
 * ⭐ THE ESCAPE HATCH IS THE SAVE BUTTON, and it needs no new flag, modal or
 * setting: a MANUAL save is explicit user intent and is never refused. A user
 * who really did empty the project presses Save and it is written. A refusal
 * whose "yes" branch waits on a decision would be a regression with a citation
 * attached; this one has a one-gesture escape that already exists.
 *
 * ⚠ WHAT IT DELIBERATELY DOES NOT DO: it never deletes, trims or rewrites a
 * stored version, and it never blocks a project that was always empty. When the
 * stored baseline is UNKNOWN it accepts — an unjustifiable refusal is worse than
 * the hole it closes.
 *
 * Contract: C13 (project lifecycle — a save may not silently destroy the
 * project it names), C48 §1 (the server copy is the recovery path).
 * Source: docs/04-reference/AUDIT/D-collab-persistence.md §3.5 and §6 row 2.
 */

/**
 * The count at or below which a snapshot counts as bare.
 *
 * Pascal uses 4 (`STRUCTURAL_NODE_COUNT`) because its graph always carries a few
 * structural nodes. PRYZM's `ProjectSnapshot.elementCount` sums fourteen content
 * families and is genuinely 0 on a fresh project, so 0 is both correct and the
 * narrowest possible refusal window. Raising it starts refusing real one-wall
 * and two-wall projects.
 */
export const BARE_SNAPSHOT_CEILING = 0;

/** Why a version write was allowed or refused. */
export type WipeGuardVerdict =
    /** Write it. The snapshot carries content. */
    | { readonly action: 'write'; readonly code: 'not-bare'; readonly reason: string }
    /** Write it. There is no populated stored version to lose. */
    | { readonly action: 'write'; readonly code: 'no-stored-baseline'; readonly reason: string }
    /** Write it. The stored latest version is itself bare. */
    | { readonly action: 'write'; readonly code: 'stored-also-bare'; readonly reason: string }
    /** Write it. A manual save is explicit intent and is never refused. */
    | { readonly action: 'write'; readonly code: 'manual-save-is-intent'; readonly reason: string }
    /**
     * Do not write. An automatic save would have replaced a populated project
     * with an empty one.
     * ⭐ `reason` always names BOTH counts and the escape hatch — a refusal that
     * does not say what it refused is a silent failure wearing a guard costume.
     */
    | {
          readonly action: 'refuse';
          readonly code: 'autosave-would-empty-project';
          readonly reason: string;
          readonly incomingElementCount: number;
          readonly storedElementCount: number;
      };

/**
 * Decide whether a version write may proceed. Pure and total: never throws,
 * never reads a clock, never touches a store.
 *
 * @param opts.incomingElementCount — `snapshot.elementCount` of the save about
 *   to be written.
 * @param opts.storedElementCount — the element count of the latest stored
 *   version of the same project, or `null` when there is none or it is not
 *   known. `null` always accepts.
 * @param opts.isAutoSave — false for a user-initiated save, which is never
 *   refused.
 */
export function decideVersionWrite(opts: {
    incomingElementCount: number;
    storedElementCount: number | null;
    isAutoSave: boolean;
}): WipeGuardVerdict {
    const incoming = Number.isFinite(opts.incomingElementCount) ? opts.incomingElementCount : NaN;

    if (!Number.isFinite(incoming) || incoming > BARE_SNAPSHOT_CEILING) {
        return {
            action: 'write',
            code: 'not-bare',
            reason: `The snapshot carries ${Number.isFinite(incoming) ? incoming : 'an unknown number of'} elements.`,
        };
    }
    if (!opts.isAutoSave) {
        return {
            action: 'write',
            code: 'manual-save-is-intent',
            reason: 'A manual save is explicit user intent and is never refused, even when it empties the project.',
        };
    }
    const stored = typeof opts.storedElementCount === 'number' && Number.isFinite(opts.storedElementCount)
        ? opts.storedElementCount
        : null;
    if (stored === null) {
        return {
            action: 'write',
            code: 'no-stored-baseline',
            reason: 'There is no stored version of this project to lose.',
        };
    }
    if (stored <= BARE_SNAPSHOT_CEILING) {
        return {
            action: 'write',
            code: 'stored-also-bare',
            reason: `The latest stored version is itself bare (${stored} elements), so nothing is destroyed.`,
        };
    }
    return {
        action: 'refuse',
        code: 'autosave-would-empty-project',
        incomingElementCount: incoming,
        storedElementCount: stored,
        reason:
            `REFUSED an automatic save: the model currently holds ${incoming} elements while the last saved ` +
            `version of this project holds ${stored}. Writing it would make an empty model the state this ` +
            'project restores to. Nothing was deleted and the stored version is untouched. ' +
            'If the project really was emptied on purpose, use Save to write it explicitly.',
    };
}

/** The toast copy for a refusal. Kept beside the policy so it cannot ship without copy. */
export function describeWipeRefusal(verdict: Extract<WipeGuardVerdict, { action: 'refuse' }>): string {
    return (
        `Auto-save paused — the model is empty but the last save had ${verdict.storedElementCount} elements. ` +
        'Nothing was lost. Press Save if you meant to empty it.'
    );
}
