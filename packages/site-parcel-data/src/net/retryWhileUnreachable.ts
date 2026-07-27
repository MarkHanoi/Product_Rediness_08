// STRUCTURAL-SEAM-4 (C57 §1.5 / C58 §1.13.8) — the bounded auto-retry at the fetch seam.
//
// The FIX's third leg: a `transient` outcome (the source did not answer) is RESOLVED BY THE MACHINE
// with a small, bounded, backed-off retry BEFORE it can reach a card. Only a STILL-failing transient
// surfaces — as "temporarily unavailable, retrying" — never as "no plan here". This is the
// `overpassProxy.js` retry pattern (C57 §1.5.2), generalised over the shared `FetchOutcome`.
//
// ⚠ It retries ONLY `transient`. A `found`/`absent`/`aborted` returns IMMEDIATELY: re-asking a
// source that already answered "nothing here" (absent) would reintroduce the failure≠empty
// conflation this whole seam removes, and retrying an `aborted` would fight a newer request. The
// clock is INJECTABLE (`sleepImpl`) so tests are deterministic and this stays the ONE impure hop
// above the pure resolvers.

import type { FetchOutcome } from '@pryzm/schemas';
import { isTransientOutcome } from '@pryzm/schemas';

export interface UnreachableRetryPolicy {
    /** Total attempts, including the first (≥ 1). Small + fixed — never an unbounded loop. */
    readonly attempts: number;
    /** Backoff base in ms; the delay before retry N is `baseDelayMs · 2^(N-1)` (exp backoff). */
    readonly baseDelayMs: number;
    /** Injectable sleep (tests pass a no-op / fake clock). Defaults to a real `setTimeout`. */
    readonly sleepImpl?: (ms: number) => Promise<void>;
}

/**
 * The default zoning-resolver retry: 3 attempts (2 retries) with 300 ms → 600 ms backoff. Small and
 * bounded — a transient blip self-heals within ~1 s, and a systematically-down source (e.g. Madrid
 * sigma HTTP 500) gives up after 3 tries and surfaces the honest "temporarily unavailable, retrying"
 * refusal rather than spinning for ever.
 */
export const DEFAULT_ZONING_RETRY: UnreachableRetryPolicy = { attempts: 3, baseDelayMs: 300 };

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run `op` (a fetch/resolve that returns a `FetchOutcome`), retrying with bounded backoff ONLY while
 * the outcome is `transient`. Returns the first non-transient outcome, or the last transient after
 * `attempts` tries. Never throws (it is the caller's job to make `op` non-throwing — every zoning
 * resolver already is).
 */
export async function retryWhileUnreachable<T>(
    op: () => Promise<FetchOutcome<T>>,
    policy: UnreachableRetryPolicy = DEFAULT_ZONING_RETRY,
): Promise<FetchOutcome<T>> {
    const attempts = Math.max(1, policy.attempts);
    const sleep = policy.sleepImpl ?? realSleep;
    let last: FetchOutcome<T> = { status: 'transient', reason: 'not-attempted' };
    for (let i = 0; i < attempts; i++) {
        last = await op();
        if (!isTransientOutcome(last)) return last; // found | absent | aborted → done, no retry
        if (i < attempts - 1) await sleep(policy.baseDelayMs * 2 ** i);
    }
    return last; // still transient after every attempt → the honest "unreachable" surfaces
}
