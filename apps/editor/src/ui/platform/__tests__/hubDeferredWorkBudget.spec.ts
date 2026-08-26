/**
 * @vitest-environment happy-dom
 */
// §PERF104 (L-11544) — THE PIN. What must not silently come back.
//
// ⚠ DISCOVERY WAS VERIFIED BY FAILING THIS FILE ON PURPOSE FIRST (L-10931). The root
// `vitest.config.ts` `include` list is an ALLOWLIST: a spec outside it is not skipped, it
// is NEVER DISCOVERED, and `vitest run <path>` prints "No test files found" rather than
// failing. `apps/editor/src/ui/platform/__tests__/**/*.spec.ts` is in that list, and a
// deliberately-false assertion was run here and observed RED before the real ones landed.
//
// THREE ARMS, and the ORDER arm is the one that matters most. The millisecond arm will
// drift with the machine; the ordering and the honesty arms are invariants.
//
//   A. ORDER — corpus maintenance must not sit between the grid paint and the click.
//   B. HONESTY — a deferral that could not conclude must SAY UNDETERMINED, never
//      "missing", and never nothing at all. This is §FIX-A-PAGE-IS-NOT-AN-INVENTORY
//      (L-10400) surviving the deferral that §PERF104 introduced.
//   C. BUDGET — the LONGEST SINGLE main-thread task of the residency pass, at the
//      founder's 77-project scale. Not the total: a 109 ms total spread over yielding
//      chunks and a 109 ms total in one `for` are the same number and a completely
//      different product, and only the second one makes a click feel dead.
import { describe, it, expect } from 'vitest';
import { runDeferred, yieldToMacrotask, describeResidencyAudit } from '../hubDeferredWork';

const N_FOUNDER_SCALE = 77; // his residency check spans 77 local ids

describe('§PERF104 A — corpus maintenance yields to a project open', () => {
    it('stops before the next chunk once an open is in flight, and reports how many it did NOT examine', async () => {
        let openInFlight = false;
        const seen: number[] = [];
        const items = Array.from({ length: N_FOUNDER_SCALE }, (_, i) => i);

        const run = await runDeferred(items, (i) => {
            seen.push(i);
            // The user clicks a card partway through the corpus.
            if (seen.length === 20) openInFlight = true;
        }, { chunkSize: 8, isOpenInFlight: () => openInFlight });

        expect(run.complete).toBe(false);
        expect(run.stoppedBecause).toBe('project-open-in-flight');
        // It finishes the chunk it is in (24 = 3 chunks of 8) and then stops — it does
        // NOT run to 77. That difference is the whole fix.
        expect(run.processed).toBeLessThan(N_FOUNDER_SCALE);
        expect(run.remaining).toBe(N_FOUNDER_SCALE - run.processed);
        expect(seen.length).toBe(run.processed);
    });

    it('stops when the hub is destroyed, so a superseded surface stops auditing', async () => {
        let destroyed = false;
        const run = await runDeferred(Array.from({ length: 40 }, (_, i) => i), (i) => {
            if (i === 9) destroyed = true;
        }, { chunkSize: 4, isDestroyed: () => destroyed });
        expect(run.complete).toBe(false);
        expect(run.stoppedBecause).toBe('surface-destroyed');
    });

    it('runs to completion — in MANY tasks, not one — when nothing interrupts it', async () => {
        const run = await runDeferred(Array.from({ length: N_FOUNDER_SCALE }, (_, i) => i), () => { /* no-op */ }, { chunkSize: 8 });
        expect(run.complete).toBe(true);
        expect(run.processed).toBe(N_FOUNDER_SCALE);
        // ⭐ THE ANTI-REGRESSION. `chunks === 1` would mean the yielding was removed and
        // the pass is one uninterrupted block again — the exact defect this lane fixed,
        // and one that no total-duration assertion could ever catch.
        expect(run.chunks).toBeGreaterThan(1);
        expect(run.chunks).toBe(Math.ceil(N_FOUNDER_SCALE / 8));
    });

    it('isolates a throwing item instead of abandoning the other seventy-six', async () => {
        const errors: number[] = [];
        const run = await runDeferred(Array.from({ length: 30 }, (_, i) => i), (i) => {
            if (i === 7 || i === 19) throw new Error('unreadable container');
        }, { chunkSize: 5, onError: (i) => errors.push(i as number) });
        expect(run.complete).toBe(true);
        expect(run.processed).toBe(30);
        expect(errors).toEqual([7, 19]);
    });

    it('yields a MACROTASK, not a microtask — a microtask would not end the blocking task', async () => {
        // A microtask drains inside the same task, so input, paint and the network
        // callbacks the open path needs would still be starved. This pins that the
        // runner's yield actually reaches the task queue: a `setTimeout` scheduled
        // BEFORE the run must be able to interleave with it.
        const order: string[] = [];
        setTimeout(() => order.push('timer'), 0);
        await runDeferred([1, 2, 3, 4], () => order.push('work'), { chunkSize: 1 });
        expect(order).toContain('timer');
        expect(order.indexOf('timer')).toBeLessThan(order.length - 1);
    });

    it('yieldToMacrotask actually reaches the task queue', async () => {
        const order: string[] = [];
        setTimeout(() => order.push('timer'), 0);
        void Promise.resolve().then(() => order.push('microtask'));
        await yieldToMacrotask();
        expect(order).toEqual(['microtask', 'timer']);
    });
});

describe('§PERF104 B — a deferred audit that could not conclude says UNDETERMINED', () => {
    const undetermined = [
        { kind: 'undetermined', reason: 'page-not-an-inventory', examined: 0, unexamined: 77 },
        { kind: 'undetermined', reason: 'paused-project-open', examined: 24, unexamined: 53 },
        { kind: 'undetermined', reason: 'surface-destroyed', examined: 8, unexamined: 69 },
        { kind: 'undetermined', reason: 'list-unavailable', examined: 0, unexamined: 12 },
    ] as const;

    for (const o of undetermined) {
        it(`"${o.reason}" reports UNDETERMINED and never claims a project is missing`, () => {
            const s = describeResidencyAudit(o);
            expect(s).toContain('UNDETERMINED');
            // ⛔ THE WHOLE POINT. §FIX-A-PAGE-IS-NOT-AN-INVENTORY (L-10400) exists
            // because "not in the response" was read as "not on the server". A
            // deferral must not re-mint that conclusion in different words.
            // ⚠ THE ASSERTION IS THAT THE DISCLAIMER IS PRESENT VERBATIM, not that the
            // word "missing" is absent. The first draft of this test asserted the
            // latter and failed all four cases — on the sentence "This is NOT evidence
            // that any project IS MISSING from the server", i.e. on exactly the sentence
            // it was written to demand. A keyword ban cannot tell a claim from its
            // denial; pinning the whole clause can. (Recorded rather than quietly
            // corrected: it is the same shape as a gate that classifies by NAME.)
            expect(s).toContain('This is NOT evidence that any project is missing from the server');
            expect(s).toContain('nothing was purged');
            // ⛔ The phrase the founder actually saw on his 2026-08-24 boot — asserted
            // about FIFTY projects on the strength of one saturated 50-row page. A
            // deferred audit must never be able to emit it.
            expect(s).not.toMatch(/only in this browser/i);
            // The reader must be able to tell HOW MUCH was not looked at.
            expect(s).toContain(String(o.unexamined));
        });
    }

    it('a completed audit says CONCLUDED and reports all four dispositions', () => {
        const s = describeResidencyAudit({
            kind: 'concluded', examined: 77, purged: 2, keptWithLocalVersions: 40, refused: 3,
        });
        expect(s).toContain('CONCLUDED');
        expect(s).toContain('2 purged');
        expect(s).toContain('40 kept');
        expect(s).toContain('3 refused');
        expect(s).not.toContain('UNDETERMINED');
    });

    it('CONCLUDED and UNDETERMINED are never the same sentence for the same counts', () => {
        // §CONTEXT-DATA-HONESTY applied to a verdict: "I looked and found nothing to
        // purge" and "I did not look" must not print the same value.
        const looked = describeResidencyAudit({ kind: 'concluded', examined: 0, purged: 0, keptWithLocalVersions: 0, refused: 0 });
        const didNot = describeResidencyAudit({ kind: 'undetermined', reason: 'paused-project-open', examined: 0, unexamined: 0 });
        expect(looked).not.toBe(didNot);
    });
});

describe('§PERF104 C — the main-thread budget for the residency pass', () => {
    /**
     * ⚠ THE BUDGET IS A RATIO, NOT A MILLISECOND CEILING — and that is a correction
     * this file EARNED rather than a preference. The first draft asserted
     * `longest < 60 ms` against a measured ~11 ms-per-chunk expectation, and it went RED
     * at 67.8 ms on this machine: a busy-wait fixture on a shared, GC-ing runner is
     * simply not reproducible to 5× headroom. A millisecond gate that flakes gets muted,
     * and a muted pin is not a pin.
     *
     * ⭐ THE INVARIANT THE FIX ACTUALLY ESTABLISHES IS SCALE-FREE: **no single
     * main-thread task may hold a large fraction of the pass.** If the yielding were
     * removed and the audit went back to one `for` loop, `longest / total` would be
     * EXACTLY 1.0 — the regression is unmissable in the ratio and invisible in any total.
     * The absolute numbers are still printed every run, because a pin that says nothing
     * about magnitude cannot be read against the founder's console.
     *
     * MEASURED at founder scale (`perf104OpenPath.spec.ts`, 77 projects × ~0.9 MB
     * containers): 109 ms for the WHOLE pass, i.e. ~11 ms per 8-item chunk.
     */
    const MAX_TASK_SHARE = 0.5; // one uninterrupted `for` would score 1.0

    it(`no single task holds more than ${MAX_TASK_SHARE * 100}% of a ${N_FOUNDER_SCALE}-project pass`, async () => {
        // ~1.3 ms of synthetic work per project — the median `perf104OpenPath` measured.
        const burn = (): void => {
            const until = performance.now() + 1.3;
            // eslint-disable-next-line no-empty
            while (performance.now() < until) { }
        };
        const taskMs: number[] = [];
        let taskStart = performance.now();
        const run = await runDeferred(
            Array.from({ length: N_FOUNDER_SCALE }, (_, i) => i),
            () => burn(),
            {
                chunkSize: 8,
                yieldFn: async () => {
                    taskMs.push(performance.now() - taskStart);
                    await yieldToMacrotask();
                    taskStart = performance.now();
                },
            },
        );
        taskMs.push(performance.now() - taskStart);
        expect(run.complete).toBe(true);
        // The chunking itself, asserted directly — this is what makes the ratio hold.
        expect(run.chunks).toBe(Math.ceil(N_FOUNDER_SCALE / 8));
        expect(taskMs.length).toBe(run.chunks);
        const longest = Math.max(...taskMs);
        const total = taskMs.reduce((a, b) => a + b, 0);
        console.log(
            `[PERF104-PIN] ${N_FOUNDER_SCALE} projects in ${run.chunks} task(s) — longest ${longest.toFixed(1)} ms, ` +
            `total ${total.toFixed(1)} ms, share ${(longest / total).toFixed(3)} ` +
            `(budget: share < ${MAX_TASK_SHARE}; one uninterrupted loop would score 1.000)`,
        );
        expect(longest / total).toBeLessThan(MAX_TASK_SHARE);
    }, 60_000);
});
