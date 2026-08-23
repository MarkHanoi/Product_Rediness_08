/**
 * serverSaveRejectionFate — §FIX-REJECTED-SAVE-IS-NOT-A-COMPLETED-SAVE (L-1310)
 *
 * ─── THE DEFECT THIS MODULE EXISTS TO MAKE IMPOSSIBLE ───────────────────────
 *
 * `ServerSyncQueue.attemptSync()` collapsed EVERY 4xx into one branch:
 *
 *     if (res.status >= 400 && res.status < 500) {
 *         this.queue = this.queue.filter(q => q.version.id !== version.id);  // ← discarded
 *         …
 *         if (looksLikePlanGate) { this.queue = []; this._planRejectsSync = true; }
 *     }
 *
 * Three destructive resolutions of one failure, stacked:
 *   1. the rejected upload was **deleted from the queue**, never re-tried;
 *   2. a plan-gating 401/403 **emptied the whole queue** — including uploads for
 *      OTHER projects the server had said nothing about;
 *   3. the same 401/403 latched a **session-wide** flag that made every later
 *      `enqueue()` a no-op, cleared only by a full page reload.
 *
 * ⭐ So the founder's ~50 local-only projects were never merely "not uploaded".
 * Their uploads were **thrown away** — and after the first rejection, nothing
 * could reach the server again for the rest of that browser session. On the free
 * plan the server's per-project version limit is 1, so the SECOND save of the
 * FIRST project tripped it and everything after was silently discarded.
 *
 * ─── THE RULING ─────────────────────────────────────────────────────────────
 *
 * **A failed upload is not a completed upload, and a rejected request is not a
 * reason to stop trying for everything else.**
 *
 * Two distinctions carry the whole fix:
 *
 *   • **"the server said no" ≠ "we could not ask."** A 4xx is an ANSWER: it is
 *     terminal for this attempt and must never be retried in a loop. A 5xx, a
 *     timeout or a network error is a NON-answer: retry it with backoff. They
 *     were already separate here; what was missing is that a terminal answer
 *     was being resolved by DELETING the thing it was an answer about.
 *
 *   • **the SCOPE of a "no" is part of the answer.** "This plan allows one
 *     version of THIS project" says nothing whatsoever about the other 49
 *     projects. Widening a per-project refusal into a per-session shutdown is
 *     how one 403 became fifty silent data losses.
 *
 * So: **refuse, retain, surface.** Nothing here ever returns "discard". The only
 * thing that removes an item from the sync queue is the server accepting it.
 * A blocked item keeps its payload, stops consuming network, and becomes
 * visible — `ServerSyncQueue.getBlockedSaves()` is the list a user can be shown.
 *
 * ⛔ A retry loop is NOT the fix. Retrying a 403 forever is a different bug, and
 * `retryable` below is the field that keeps them apart: it names the EVENT that
 * could change the answer (sign-in, plan change) rather than a delay.
 *
 * ─── WHY THIS IS A PURE FUNCTION IN ITS OWN FILE ────────────────────────────
 *
 * Reaching the old branch required a queue, a network stub, a DOM and a clock.
 * That is why a policy governing whether the user's work survives shipped with
 * no test of its own. Here every rule is one assertion over two values.
 */

/**
 * How far a server refusal actually reaches.
 *
 * ⚠ ORDER OF BLAST RADIUS, and the whole point of the type: the old code had
 * exactly one scope — `'this-session'` — and applied it to a refusal whose real
 * scope was `'this-project'`.
 */
export type RejectionScope =
    /** Only this one version. Another save of the same project may well succeed. */
    | 'this-save'
    /** Every save of THIS project, and no other project. */
    | 'this-project'
    /** Every save, because the client is not authenticated at all. */
    | 'this-session';

/** The event that could make the server answer differently. Never a delay. */
export type RejectionRetryTrigger =
    /** Sign in (or refresh the session) and the same payload may be accepted. */
    | 'on-sign-in'
    /** Change plan / free a version slot and the same payload may be accepted. */
    | 'on-plan-change'
    /** A later attempt may succeed on its own (transient server-side condition). */
    | 'on-next-attempt'
    /** Nothing the user can do in-session changes this answer. Surface it. */
    | 'never';

/**
 * A stable, client-owned classification of WHY a save is not reaching the server.
 * Deliberately independent of the server's own `code` strings so the UI copy has
 * one thing to switch on.
 */
export type RejectionCode =
    /** 401 — not authenticated. Nothing can be saved until sign-in. */
    | 'not-authenticated'
    /** 403 with a plan/limit shape — the plan's per-project version cap. */
    | 'plan-version-limit'
    /** 403 without a plan shape — not the owner / no write access. */
    | 'not-permitted'
    /** 400 `invalid_id` — the project's id format is one the server refuses.
     *  ⭐ This is the legacy `proj-<uuid>` family: unsavable as-is, forever, with
     *  no user action that helps. It MUST be named, never left to be discovered
     *  one project at a time. */
    | 'project-id-not-savable'
    /** 400 with validation issues — this snapshot will never be accepted as-is. */
    | 'payload-invalid'
    /** 409 — the server reports a version with this id already exists. */
    | 'server-says-duplicate'
    /** 409 `empty_snapshot_rejected` — the server refused to bury a populated
     *  project under an empty snapshot (§GUARD-EMPTY-SNAPSHOT, L-10040). ⭐ This
     *  is a REFUSAL THAT PROTECTED DATA, and must never be shown as a failure the
     *  user should work around. */
    | 'empty-snapshot-refused'
    /** 410 — the server has no such project row. */
    | 'project-missing-on-server'
    /** 412 — a concurrent writer moved the version count under us. */
    | 'concurrent-edit'
    /** Any other 4xx. Retained and surfaced rather than guessed at. */
    | 'rejected-unclassified';

export type RejectionFate =
    /**
     * The server did not answer (5xx / rate limit). Keep the item ACTIVE and let
     * the existing backoff + circuit breaker do their job.
     */
    | { readonly action: 'retry'; readonly detail: string }
    /**
     * The server answered "no". Keep the payload, stop attempting it, and say so.
     * ⭐ There is deliberately no `'discard'` arm.
     */
    | {
          readonly action: 'block';
          readonly code: RejectionCode;
          readonly scope: RejectionScope;
          readonly retryable: RejectionRetryTrigger;
          readonly detail: string;
      };

/** Shape of the parsed 4xx body we actually read. All fields optional. */
export interface RejectionBody {
    readonly code?: unknown;
    readonly plan?: unknown;
    readonly upgrade?: unknown;
    readonly issues?: unknown;
    readonly error?: unknown;
}

/**
 * Decide what a server response means for a queued version upload.
 *
 * ⚠ ORDER IS LOAD-BEARING. 429 is tested before the generic 4xx arm, because a
 * rate limit is the server declining to ANSWER YET — the old code swept it into
 * the same branch that deleted the payload, so a burst of autosaves during a
 * bulk re-save was discarded by the very mechanism meant to protect the server.
 */
export function decideRejectionFate(status: number, body: RejectionBody | null | undefined): RejectionFate {
    const b: RejectionBody = body ?? {};
    const code = typeof b.code === 'string' ? b.code : '';

    // ── Non-answers: retry with the existing backoff ──────────────────────────
    if (status === 429) {
        return { action: 'retry', detail: 'Rate limited — the server declined to answer yet, not to accept.' };
    }
    if (status >= 500 || status < 400) {
        return { action: 'retry', detail: `Status ${status} is not a terminal client-side refusal.` };
    }

    // ── 401: the client is not authenticated. Genuinely session-wide. ─────────
    if (status === 401) {
        return {
            action: 'block',
            code: 'not-authenticated',
            scope: 'this-session',
            retryable: 'on-sign-in',
            detail: 'Not signed in — no project can sync until the session is re-authenticated. '
                + 'Every queued version is retained and will be re-attempted after sign-in.',
        };
    }

    // ── 403: a REFUSAL ABOUT ONE PROJECT. Never widen it to the session. ──────
    if (status === 403) {
        const looksLikePlanGate =
            code === 'version_limit_reached'
            || typeof b.plan === 'string'
            || typeof b.upgrade === 'string';
        if (looksLikePlanGate) {
            return {
                action: 'block',
                code: 'plan-version-limit',
                scope: 'this-project',
                retryable: 'on-plan-change',
                // ⭐ The sentence the old latch got wrong, written out.
                detail: 'The plan\'s version limit for THIS project is reached. This says nothing about '
                    + 'other projects — their uploads continue. The rejected version is retained, not discarded.',
            };
        }
        return {
            action: 'block',
            code: 'not-permitted',
            scope: 'this-project',
            retryable: 'on-sign-in',
            detail: 'The server refused write access to this project (not the owner, or no write membership).',
        };
    }

    if (status === 400) {
        if (code === 'invalid_id') {
            return {
                action: 'block',
                code: 'project-id-not-savable',
                scope: 'this-project',
                retryable: 'never',
                detail: 'The server refuses this project\'s ID FORMAT, so no version of it can ever reach the '
                    + 'server as things stand. This is a defect to be named to the user, not a transient failure.',
            };
        }
        return {
            action: 'block',
            code: 'payload-invalid',
            scope: 'this-save',
            retryable: 'never',
            detail: 'The server rejected this snapshot as invalid. The NEXT save of the same project is '
                + 'unaffected and is still attempted.',
        };
    }

    if (status === 409) {
        // §GUARD-EMPTY-SNAPSHOT (L-10040) — the server refused to bury a populated
        // project under an empty snapshot. ⚠ It shares 409 with the duplicate-id
        // case and means something entirely different: nothing was stored because
        // storing it would have DESTROYED the stored state, not because it was
        // already there. Rendering it as "already there" would tell the founder
        // their save was redundant when the server was in fact protecting them.
        if (code === 'empty_snapshot_rejected') {
            return {
                action: 'block',
                code: 'empty-snapshot-refused',
                scope: 'this-save',
                retryable: 'never',
                detail: 'The server refused to replace the stored model with an empty snapshot. '
                    + 'Nothing on the server was changed or deleted. The next save that carries elements '
                    + 'is accepted normally; an intentional emptying must be sent with force:true.',
            };
        }
        return {
            action: 'block',
            code: 'server-says-duplicate',
            scope: 'this-save',
            retryable: 'never',
            detail: 'The server reports a version with this id already exists. Retained rather than deleted, '
                + 'because "already there" and "silently dropped" must not look the same afterwards.',
        };
    }

    if (status === 410) {
        return {
            action: 'block',
            code: 'project-missing-on-server',
            scope: 'this-project',
            retryable: 'never',
            // ⭐ §FIX-RECONCILE-NEVER-PURGE-ON-CONTRADICTION (L-1289) applies here too:
            // the server not having a row is not proof the user deleted anything.
            detail: 'The server has no row for this project. Its versions are retained locally — absence on '
                + 'the server is not evidence of deletion.',
        };
    }

    if (status === 412) {
        return {
            action: 'block',
            code: 'concurrent-edit',
            scope: 'this-save',
            retryable: 'never',
            detail: 'A concurrent writer changed the server-side version count. The local snapshot is retained.',
        };
    }

    return {
        action: 'block',
        code: 'rejected-unclassified',
        scope: 'this-save',
        retryable: 'never',
        detail: `The server refused with ${status} and a shape this client does not recognise. `
            + 'Retained and surfaced rather than guessed at.',
    };
}

/**
 * One-line human copy for a block, for banners and logs.
 * Kept beside the policy so a new `RejectionCode` cannot ship without copy.
 */
export function describeRejection(code: RejectionCode, scope: RejectionScope): string {
    switch (code) {
        case 'not-authenticated':
            return 'You are signed out on the server. Nothing is syncing — your work is saved in this browser only. Sign in to upload it.';
        case 'plan-version-limit':
            return 'This project has reached its plan version limit on the server, so this save stayed in your browser. Other projects are still syncing.';
        case 'not-permitted':
            return 'The server refused to store a version of this project (no write access). The version is saved in this browser only.';
        case 'project-id-not-savable':
            return 'This project cannot be uploaded: the server rejects its ID format. Export it to keep a durable copy.';
        case 'payload-invalid':
            return 'The server rejected this version as invalid. It is saved in this browser only.';
        case 'server-says-duplicate':
            return 'The server already has a version with this id, so this upload was not stored again.';
        case 'empty-snapshot-refused':
            return 'The server refused to overwrite your saved model with an empty one. Nothing on the server was changed — your last full save is intact.';
        case 'project-missing-on-server':
            return 'The server has no record of this project, so its versions stayed in this browser.';
        case 'concurrent-edit':
            return 'Someone else saved this project first. Your version is kept in this browser — reload to merge.';
        case 'rejected-unclassified':
        default:
            return `The server refused this save (${scope}). It is saved in this browser only.`;
    }
}
