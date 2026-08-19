/**
 * localOnlyProjectFate — §FIX-RECONCILE-NEVER-PURGE-ON-CONTRADICTION (L-1289)
 *
 * ─── THE DEFECT THIS MODULE EXISTS TO MAKE IMPOSSIBLE ───────────────────────
 *
 * `ProjectHub.syncFromServer()` reconciles the local project index against the
 * server list. A local row the server does not know about is either (a) work
 * created offline that must be protected, or (b) a stale husk that should go.
 * It told the two apart by asking `versionRepository.countVersions(id) > 0`.
 *
 * **That question cannot fail honestly.** `countVersions` returns `0` for
 * "genuinely no versions", for "the IndexedDB mirror is cold or absent", and
 * for "the read threw" — three conditions, one value. So when the version
 * database goes away, the reconciler reads 0 and concludes *the user deleted
 * their work*.
 *
 * And the version database goes away routinely: `purgeUserScopedClientState`
 * (`AuthModal.ts`) deletes every IndexedDB database whose name contains
 * "pryzm" on sign-out and on account switch — correctly, per §AUTH-SESSION-LEAK
 * — and `pryzm-project-versions` is one of them. The metadata index
 * `bim-projects-index` is NOT pryzm-prefixed and survives.
 *
 * ⭐ So the index says "these projects exist, with N versions each", the data is
 * gone, and **the reconciler resolved that disagreement by deleting the
 * survivors**. An authority disagreement resolved in the destructive direction
 * is the worst available default: it converts a recoverable inconsistency into
 * an unrecoverable one.
 *
 * ─── THE RULING ─────────────────────────────────────────────────────────────
 *
 * **A reconciler must never treat "I cannot find the data" as "the user deleted
 * it."** Absence of evidence is not evidence of deletion. So the purge branch
 * fires ONLY when two independent authorities AGREE that there is nothing:
 * the version store says zero AND the index row itself claims zero. Every other
 * combination is a CONTRADICTION, and a contradiction is refused and surfaced,
 * never acted on.
 *
 * ⭐ THE KEY MOVE IS THE SECOND AUTHORITY. Asking "is the count 0?" cannot be
 * made safe, because 0 is exactly the value a broken instrument returns. Asking
 * "do the store and the index AGREE?" can be, because the index row carries
 * `versionCount` and survives the purge that destroys the store. The fix is not
 * a better read — it is a second opinion.
 *
 * ─── WHY THIS IS A PURE FUNCTION IN ITS OWN FILE ────────────────────────────
 *
 * The policy is five rules over three inputs. Inlined in the hub's loop it
 * would be reachable only by constructing a hub, a DOM, a server response and
 * an IndexedDB — which is precisely why the original branch shipped untested.
 * Here every rule is one assertion.
 */

/**
 * What a version-store read actually established. Three arms, because the
 * defect above is exactly what happens when the third collapses into the first.
 */
export type VersionProbe =
    /** The store was read and this is the real number. `count: 0` here means
     *  "read successfully, nothing stored" — NOT "could not look". */
    | { readonly kind: 'counted'; readonly count: number }
    /** The store could not be read. NEVER interchangeable with `count: 0`
     *  (C70 L-INV-1: an empty result may only ever mean zero results). */
    | { readonly kind: 'unreadable'; readonly reason: VersionProbeFailure };

export type VersionProbeFailure =
    /** The synchronous mirror never warmed — `warmVersionCache()` threw, was
     *  skipped, or IndexedDB is unavailable in this environment. */
    | 'cache-not-warmed'
    /** Reading the store raised. */
    | 'store-threw'
    /** A payload exists but could not be decoded. */
    | 'payload-undecodable';

export interface LocalOnlyProjectInput {
    readonly projectId: string;
    /** `versionCount` from the surviving metadata index row — the SECOND
     *  authority, and the whole reason this decision can be made safely. */
    readonly indexVersionCount: number;
    /** What the version store established. */
    readonly probe: VersionProbe;
}

export type LocalOnlyFate =
    /** Protect it. Local work exists that the server does not have. */
    | { readonly action: 'keep'; readonly reason: 'store-has-versions' }
    /** Safe to drop: BOTH authorities agree there is nothing here. */
    | { readonly action: 'purge'; readonly reason: 'store-and-index-agree-empty' }
    /** Refuse to act. The authorities disagree, or one could not be consulted. */
    | {
          readonly action: 'refuse';
          readonly reason:
              /** The instrument failed. Absence of evidence, nothing more. */
              | 'store-unreadable'
              /** ⭐ THE SIGN-OUT SIGNATURE: the index remembers N versions and the
               *  store now holds none. This is the exact state a purge leaves
               *  behind, and the exact state that used to trigger deletion. */
              | 'index-claims-versions-store-has-none';
          readonly detail: string;
      };

/**
 * Decide what to do with a local project the server does not list.
 *
 * ⚠ ORDER IS LOAD-BEARING. `unreadable` is tested FIRST, before any count is
 * consulted, so a failed instrument can never reach a branch that reasons about
 * numbers it did not produce.
 */
export function decideLocalOnlyProjectFate(input: LocalOnlyProjectInput): LocalOnlyFate {
    const { projectId, indexVersionCount, probe } = input;

    // 1 — The instrument failed. Nothing below this line is knowable.
    if (probe.kind === 'unreadable') {
        return {
            action: 'refuse',
            reason: 'store-unreadable',
            detail:
                `${projectId}: the version store could not be read (${probe.reason}). ` +
                'Absence of evidence is not evidence of deletion — keeping the project.',
        };
    }

    // 2 — Real local work. Protect it. (Offline creates, free-plan histories.)
    if (probe.count > 0) {
        return { action: 'keep', reason: 'store-has-versions' };
    }

    // 3 — ⭐ THE CONTRADICTION. The store read cleanly and found nothing, but the
    // surviving index row claims history. Something destroyed the store behind
    // the index's back — on the founder's machine, the sign-out purge. Deleting
    // here is what turned a recoverable inconsistency into permanent loss.
    if (indexVersionCount > 0) {
        return {
            action: 'refuse',
            reason: 'index-claims-versions-store-has-none',
            detail:
                `${projectId}: the index row records ${indexVersionCount} version(s) but the ` +
                'version store holds none. The store was destroyed behind the index — most ' +
                'likely the sign-out / account-switch IndexedDB purge. Keeping the project so ' +
                'the loss stays visible and recoverable rather than being completed by this sync.',
        };
    }

    // 4 — Both authorities agree: nothing was ever here. Safe to drop.
    return { action: 'purge', reason: 'store-and-index-agree-empty' };
}
