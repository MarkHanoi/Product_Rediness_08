/**
 * hubDeferredWork — §PERF104 (L-11540..L-11545)
 *
 * The pure half of "opening ONE project must not wait for maintenance of ALL of
 * them". No DOM, no storage, no network: a yielding runner plus the vocabulary
 * for saying what a deferred audit did and did NOT establish.
 *
 * ── WHY THIS MODULE EXISTS AT ALL ────────────────────────────────────────────
 * The founder: *"it is extremely slow with not even 200 elements — THIS IS NOT
 * NORMAL!!!"*. He is right, and lane PERF100 already established that nothing is
 * corrupted: the hub-mount work is real, correct, and in the wrong PLACE. It is
 * whole-corpus maintenance — every project's version container envelope-parsed,
 * every project's preview reconciled — sequenced ahead of the ONE project the
 * user asked for.
 *
 * Measured at founder scale by `__tests__/perf104OpenPath.spec.ts` (77 local
 * projects, the opened container 1.63 MB / 10 versions / 5 361 journal records):
 *
 *     residency audit ×77        109 ms   ← ONE uninterrupted main-thread task
 *     getLatestVersion (opened)   89 ms   ← of which journal-attach 80 ms
 *
 * 109 ms is not 44 seconds. ⛔ **That is the point, and it must not be
 * overstated**: the defect this module fixes is that the audit is a SINGLE
 * uninterrupted task holding the main thread, and that it (plus the whole-corpus
 * list enumeration and the up-to-50 concurrent thumbnail POSTs behind it) is
 * scheduled AHEAD of a gesture the user has already made. A 109 ms block and a
 * 109 ms total spread over yielding chunks are the same number and completely
 * different products.
 *
 * ── THE CORRECTNESS CONSTRAINT THIS MODULE CARRIES ───────────────────────────
 * ⛔ §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400). The residency audit exists
 * because a saturated 50-row page is indistinguishable from a complete list, so
 * *"not in the response"* is not *"not on the server"*. Deferring the audit must
 * NOT quietly restore the conclusion it was written to prevent. A deferral has
 * exactly one honest report — **UNDETERMINED** — and it must never be allowed to
 * read as *"missing"*, *"local-only"*, or, worst of all, as silence.
 *
 * That is why {@link ResidencyAuditOutcome} has no boolean anywhere in it and why
 * every `undetermined` variant carries the REASON it could not conclude. A
 * deferral that skipped the audit, or relaxed a gate to make it cheap, would be a
 * regression wearing a fix's name (§REFUSING-HALF-NEEDS-ITS-ESCAPE-HATCH).
 */

import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm.platform.hubDeferredWork');

// ── Yielding ─────────────────────────────────────────────────────────────────

/**
 * Hand the main thread back to the browser for one MACROTASK.
 *
 * ⛔ `await Promise.resolve()` would NOT do — a microtask drains inside the same
 * task, so a loop yielding that way still blocks input, paint and the network
 * callbacks the open path needs. `setTimeout(…, 0)` is the cheapest primitive
 * that actually ends the task. It is not a delay dressed up as a fix: the work
 * still runs, and runs to completion, it simply stops being one unbroken block.
 *
 * ⚠ Deliberately NOT `requestIdleCallback`: P3 owns the frame bus, and an idle
 * callback can be starved indefinitely on a busy tab, which would turn a deferral
 * into an abandonment. `setTimeout` is not a rival rAF — it schedules no frames.
 */
export function yieldToMacrotask(): Promise<void> {
    return new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

/** Why a deferred run stopped before finishing. */
export type DeferredStopReason =
    /** A project open is in flight; the queue gave the machine back to it. */
    | 'project-open-in-flight'
    /** The owning surface was destroyed (hub replaced / signed out). */
    | 'surface-destroyed';

export interface DeferredRunOptions {
    /**
     * How many items to process before yielding. ⚠ Not a performance dial to be
     * tuned upward for throughput — the whole purpose is the yield, and a chunk
     * large enough to be "efficient" recreates the block this exists to break.
     */
    readonly chunkSize?: number;
    /** True ⇒ stop now with `project-open-in-flight`. Checked BEFORE each chunk. */
    readonly isOpenInFlight?: () => boolean;
    /** True ⇒ stop now with `surface-destroyed`. Checked BEFORE each chunk. */
    readonly isDestroyed?: () => boolean;
    /** Injected for tests; defaults to {@link yieldToMacrotask}. */
    readonly yieldFn?: () => Promise<void>;
}

export interface DeferredRunResult {
    /** True only when every item was processed. */
    readonly complete: boolean;
    readonly processed: number;
    readonly remaining: number;
    /** Present IFF `complete` is false. */
    readonly stoppedBecause?: DeferredStopReason;
    /** How many separate main-thread tasks the run occupied. */
    readonly chunks: number;
}

/**
 * Run `work` over `items` in yielding chunks, stopping early when the caller says
 * the machine is needed elsewhere.
 *
 * ⛔ THE GATE IS CHECKED BEFORE EACH CHUNK, NOT AFTER. Checking after would let a
 * chunk that started before the click finish after it — which is the whole
 * failure mode on a slow device, where one chunk is the longest thing on the
 * frame.
 *
 * `work` may be sync or async; a throw from one item is ISOLATED (reported via
 * `onError`) so a single unreadable project cannot abandon the audit of the other
 * seventy-six. Silent swallowing is not an option — a maintenance pass that stops
 * quietly is exactly the "never ran and passed print the same value" defect.
 */
export async function runDeferred<T>(
    items: readonly T[],
    work: (item: T, index: number) => void | Promise<void>,
    opts: DeferredRunOptions & { readonly onError?: (item: T, err: unknown) => void } = {},
): Promise<DeferredRunResult> {
    const span = _tracer.startSpan('pryzm.platform.hub.runDeferred');
    try {
        const chunkSize = Math.max(1, opts.chunkSize ?? 8);
        const yieldFn = opts.yieldFn ?? yieldToMacrotask;
        let processed = 0;
        let chunks = 0;
        while (processed < items.length) {
            if (opts.isDestroyed?.() === true) {
                return { complete: false, processed, remaining: items.length - processed, stoppedBecause: 'surface-destroyed', chunks };
            }
            if (opts.isOpenInFlight?.() === true) {
                return { complete: false, processed, remaining: items.length - processed, stoppedBecause: 'project-open-in-flight', chunks };
            }
            const end = Math.min(processed + chunkSize, items.length);
            chunks++;
            for (let i = processed; i < end; i++) {
                try {
                    await work(items[i] as T, i);
                } catch (err) {
                    opts.onError?.(items[i] as T, err);
                }
            }
            processed = end;
            if (processed < items.length) await yieldFn();
        }
        span.setAttribute('pryzm.hub.deferred_processed', processed);
        return { complete: true, processed, remaining: 0, chunks };
    } finally {
        span.end();
    }
}

// ── The residency verdict vocabulary ─────────────────────────────────────────

/**
 * Why the local-only residency audit could not conclude. ⭐ Every one of these
 * means UNDETERMINED — never "absent", never "safe", never nothing at all.
 */
export type ResidencyUndeterminedReason =
    /**
     * §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400). The server list was a PAGE, so
     * absence from it is not absence from the server. This is the ORIGINAL
     * reason and it is unchanged by this lane — it is decided by
     * `mayConcludeAbsence(completeness)` on exactly the same input as before.
     */
    | 'page-not-an-inventory'
    /**
     * ⭐ NEW WITH §PERF104. The user opened a project, so the audit gave the
     * machine and the connection budget back to it. Nothing was purged and
     * nothing was claimed. The audit re-runs on the next hub mount, which is a
     * gesture the user makes constantly (sign-in, back-to-hub) — so this is a
     * deferral, not an abandonment. ⛔ It is still UNDETERMINED in the meantime,
     * and must be reported as such rather than as a clean pass.
     */
    | 'paused-project-open'
    /** The hub was replaced or signed out mid-audit. Same honesty rule. */
    | 'surface-destroyed'
    /** The server list could not be fetched at all (offline / 5xx). */
    | 'list-unavailable';

export type ResidencyAuditOutcome =
    | {
        readonly kind: 'concluded';
        /** Local rows examined (i.e. absent from an ENUMERABLE server list). */
        readonly examined: number;
        readonly purged: number;
        readonly keptWithLocalVersions: number;
        readonly refused: number;
    }
    | {
        readonly kind: 'undetermined';
        readonly reason: ResidencyUndeterminedReason;
        readonly examined: number;
        readonly unexamined: number;
    };

/**
 * Render a residency outcome for the console.
 *
 * ⛔ THE `undetermined` BRANCH MUST NEVER PRODUCE A SENTENCE A READER COULD MISTAKE
 * FOR A CLEAN BILL OF HEALTH. This is the same discipline as
 * `describeThumbnailResolution`: an instrument that could not look must say so in
 * the words it prints, because the reader of a production log has nothing else.
 */
export function describeResidencyAudit(o: ResidencyAuditOutcome): string {
    const span = _tracer.startSpan('pryzm.platform.hub.describeResidencyAudit');
    try {
        if (o.kind === 'concluded') {
            return `CONCLUDED over ${o.examined} local-only row(s) — ` +
                `${o.purged} purged, ${o.keptWithLocalVersions} kept (local history), ${o.refused} refused (contradiction).`;
        }
        const why = o.reason === 'page-not-an-inventory'
            ? 'the server list was a PAGE, not an enumeration (L-10400)'
            : o.reason === 'paused-project-open'
                ? 'a project open began and the audit yielded the machine to it (§PERF104)'
                : o.reason === 'surface-destroyed'
                    ? 'the hub was replaced before the audit finished'
                    : 'the server list could not be fetched';
        return `UNDETERMINED — ${why}. ${o.examined} row(s) examined, ${o.unexamined} NOT examined. ` +
            'This is NOT evidence that any project is missing from the server: nothing was purged and ' +
            'nothing was reported as local-only. Residency stays UNDETERMINED until the list can be ' +
            'enumerated in full with no open in flight.';
    } finally {
        span.end();
    }
}
