/**
 * §PERF-CANCEL-IS-NOT-A-YIELD-RIDER / §PERF-CW-YIELD-IS-PER-GROUP /
 * §CANCEL-DENOMINATORS-MUST-COMMENSURATE — L-5400, L-5401, L-5404.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THESE TESTS EXIST, AND WHY THE OLD ONES COULD NOT HAVE CAUGHT THIS
 * ─────────────────────────────────────────────────────────────────────────────
 * `projectionCancellation.test.ts` asserts the cancellation CONTRACT against a
 * hand-written MODEL of `EdgeProjectorService.project()`'s group loop:
 *
 *     if (groupsProcessed % chunkSize === 0) { await yield; if (…) cancel; }
 *
 * The real loop read:
 *
 *     if (!_hasCWElements && _chunkGroupIdx % CHUNK_SIZE === 0) { await yield; if (…) cancel; }
 *
 * The model had no curtain-wall term, so it could not express — let alone falsify —
 * the fact that for ANY batch containing a curtain wall the whole branch was skipped
 * and CANCELLATION NEVER RAN. A fake built from the header cannot falsify the header.
 *
 * These tests import the REAL policy (`projectionChunkPolicy.ts`) that `project()`
 * now calls. There is no model to drift.
 *
 * Governance: C04 §3.3 (rendering/scheduling) · C10 (LONGTASK budget) · P3 (single
 * rAF owner) · SPEC-30 §9 ("no render-everything-every-frame").
 */

import { describe, it, expect } from 'vitest';
import {
    GROUP_CHUNK_SIZE,
    GROUP_YIELD_BUDGET_MS,
    PER_LAYER_YIELD_ELEMENT_TYPE,
    groupNeedsPerLayerYield,
    shouldYieldAfterGroupTimed,
    shouldCancelAtGroupBoundary,
    estimateFrameYields,
    estimateTimedFrameYields,
} from '../src/engine/views/projectionChunkPolicy';

// ─────────────────────────────────────────────────────────────────────────────
// L-5401 — the per-layer yield is a property of the GROUP, not of the batch
// ─────────────────────────────────────────────────────────────────────────────

describe('§PERF-CW-YIELD-IS-PER-GROUP (L-5401)', () => {
    it('only a curtain-wall group needs per-layer relief', () => {
        expect(groupNeedsPerLayerYield(PER_LAYER_YIELD_ELEMENT_TYPE)).toBe(true);
        for (const t of ['wall', 'slab', 'column', 'beam', 'door', 'window', 'furniture', 'roof']) {
            expect(groupNeedsPerLayerYield(t)).toBe(false);
        }
        // An unstamped group is not a curtain wall.
        expect(groupNeedsPerLayerYield(undefined)).toBe(false);
    });

    /**
     * ⚠ TWO ASSERTIONS THAT STOOD HERE WERE DELETED WITH THEIR SUBJECT (lane PERF105,
     * L-11560): `shouldYieldAfterGroup(true, n) === false` for every n, and "an ordinary
     * group yields once every GROUP_CHUNK_SIZE work-groups". They pinned a group COUNT
     * as the yield rule. That rule is gone — see `§PERF105-YIELD-IS-A-TIME-BUDGET`
     * below for the measurement that condemned it — so pinning it here would be pinning
     * a behaviour the projector no longer has. The L-5401 finding they belonged to
     * (per-layer relief is a property of the GROUP, not the BATCH) is untouched and is
     * still asserted by the test above and by the LEDGER tests below.
     */

    /**
     * ⭐ THE LEDGER. The founder's model as measured by ELEV12: 365 groups
     * re-projected on every crop-drag frame, ~2.4 projection layers per group.
     * Suppose 17 of the 365 are curtain walls (the count the original
     * §PERF-EDGEPROJECTOR-SUBLAYER-YIELD note used).
     *
     * BEFORE (batch-wide `_hasCWElements`): every one of the 365 groups yields a
     * display frame per layer, AND the group-boundary yield is dead code because its
     * `!_hasCWElements` guard is false.
     *
     * AFTER (per-group): the 17 curtain walls yield per layer; the other 348 yield
     * once per 4 groups.
     *
     * At 60 Hz a display frame is ~16.7 ms of CALENDAR time — the wall-clock the
     * founder experiences while navigating with a plan pane open.
     */
    it('LEDGER — one curtain wall cost 876 frame yields; it now costs 128', () => {
        const CW = 17, OTHER = 348, LAYERS = 2.4;
        const before = estimateFrameYields(CW, OTHER, LAYERS, /* batchWide */ true);
        const after  = estimateFrameYields(CW, OTHER, LAYERS, /* batchWide */ false);

        expect(before).toBe(876);                       // (17 + 348) × 2.4
        expect(after).toBe(128);                        // 41 per-layer + 87 per-chunk
        expect(after).toBeLessThan(before / 6);

        // In calendar time at 60 Hz:
        const ms = (frames: number): number => Math.round(frames * (1000 / 60));
        expect(ms(before)).toBe(14600);                 // ~14.6 s for ONE pass
        expect(ms(after)).toBe(2133);                   // ~2.1 s
    });

    it('LEDGER — a model with NO curtain wall is unchanged, to the yield', () => {
        // This is the regression guard for "did the fix move a number it should not".
        const before = estimateFrameYields(0, 365, 2.4, true);
        const after  = estimateFrameYields(0, 365, 2.4, false);
        expect(after).toBe(before);
        expect(after).toBe(91);                         // floor(365 / 4)
    });

    it('LEDGER — an all-curtain-wall batch is unchanged, to the yield', () => {
        const before = estimateFrameYields(17, 0, 2.4, true);
        const after  = estimateFrameYields(17, 0, 2.4, false);
        expect(after).toBe(before);
        expect(after).toBe(41);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §PERF105-YIELD-IS-A-TIME-BUDGET (L-11560) — THE BENCHMARK PIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MEASURED per-group CPU cost of the projector's `updateWorldMatrix` +
 * `EdgesGeometry` + `mergeGeometries` pipeline, by element family, at realistic
 * mesh counts — `packages/room-topology/probes/probe-perf105-02-projection-group-cost.local.mts`,
 * 2026-08-26. These are the numbers `GROUP_CHUNK_SIZE = 4` was calibrated against and
 * is now wrong about: the calibration assumed **~12 ms per group**.
 *
 * ⚠ These are COSTS OF THE PIPELINE, not of this policy — the policy is pure and
 * cannot be timed. They are frozen here so that if the pipeline gets 5× cheaper (or
 * 5× dearer) again, the yield budget is re-derived from a number in the repo rather
 * than from a comment written eighteen months earlier.
 */
const MEASURED_MS_PER_GROUP: ReadonlyArray<readonly [type: string, ms: number, count: number, layers: number]> = [
    ['wall',        0.890, 62, 2],
    ['window',      1.764, 26, 2],
    ['door',        2.154, 20, 2],
    ['slab',        0.470,  3, 2],
    ['stair',       4.768,  2, 2],
    ['curtainwall', 23.743, 4, 3],
    ['furniture',   3.591, 32, 1],
    ['lighting',    0.302, 14, 1],
    ['column',      0.223,  6, 2],
];

describe('§PERF105-YIELD-IS-A-TIME-BUDGET (L-11560)', () => {
    const FRAME_MS = 1000 / 60;
    const workMs   = MEASURED_MS_PER_GROUP.reduce((a, [, ms, n]) => a + ms * n, 0);
    const groups   = MEASURED_MS_PER_GROUP.reduce((a, [, , n]) => a + n, 0);
    const cw       = MEASURED_MS_PER_GROUP.filter(([t]) => t === 'curtainwall').reduce((a, [, , n]) => a + n, 0);
    const other    = groups - cw;
    const meanLay  = MEASURED_MS_PER_GROUP.reduce((a, [, , n, l]) => a + n * l, 0) / groups;

    it('the group COUNT proxy is calibrated 5× too pessimistic — that is the whole defect', () => {
        const meanMs = workMs / groups;
        expect(groups).toBe(169);
        expect(meanMs).toBeGreaterThan(2.0);
        expect(meanMs).toBeLessThan(2.5);
        // The comment on GROUP_CHUNK_SIZE claims "4 × ~12 ms ≈ 48 ms".
        expect(12 / meanMs).toBeGreaterThan(5);
        // So four ordinary groups are nowhere near a LONGTASK …
        expect(meanMs * GROUP_CHUNK_SIZE).toBeLessThan(GROUP_YIELD_BUDGET_MS);
        // … and four LIGHTING groups bought a 16.7 ms frame to relieve ~1.2 ms.
        const lighting = MEASURED_MS_PER_GROUP.find(([t]) => t === 'lighting')![1];
        expect(lighting * GROUP_CHUNK_SIZE).toBeLessThan(2);
    });

    /**
     * ⭐ THE PIN THE FOUNDER'S COMPLAINT BUYS. A ~200-element model re-projects on
     * almost every edit (§DIAG-GRAFT-FALLTHROUGH marks the view COARSE for any
     * door/window/furniture/stair/column/roof create, a delete, or a batch). Under the
     * count policy that pass spent MORE time waiting for frames than doing the work.
     */
    it('BUDGET PIN — a 200-element pass halves its yields; it does NOT become work-dominated', () => {
        const yieldsBefore = estimateFrameYields(cw, other, meanLay, /* batchWide */ false);
        const yieldsAfter  = estimateTimedFrameYields(workMs);

        const elapsedBefore = workMs + yieldsBefore * FRAME_MS;
        const elapsedAfter  = workMs + yieldsAfter  * FRAME_MS;

        // BEFORE: 48 yields ≈ 800 ms of calendar time against 370 ms of work — 68 %
        // of the elapsed re-projection was the scheduler, not the projector.
        expect(yieldsBefore).toBe(48);
        expect(yieldsBefore * FRAME_MS / elapsedBefore).toBeGreaterThan(0.65);

        // AFTER: 23 yields, 1171 ms ⇒ 754 ms elapsed.
        expect(yieldsAfter).toBe(23);
        expect(elapsedAfter).toBeLessThan(elapsedBefore * 0.67);

        // ⚠ STATED HONESTLY, BECAUSE THE FIRST DRAFT OF THIS TEST ASSERTED `< 0.40`
        // AND WAS WRONG (measured 0.508). At a 16 ms budget a pass alternates one
        // slice of work with one ~16.7 ms display frame, so it CANNOT fall below ~50 %
        // yield by construction — halving the yields halves the waste and no more.
        // ⛔ The remaining half is NOT to be recovered by widening the budget (that
        // trades the founder's frame rate for his latency). It is recovered by the
        // per-element projection cache, whose hits skip the work AND the yield
        // together — and which is measuring hitRate=0 % in production (L-11562).
        expect(yieldsAfter * FRAME_MS / elapsedAfter).toBeGreaterThan(0.45);
        expect(yieldsAfter * FRAME_MS / elapsedAfter).toBeLessThan(0.55);

        // ⛔ THE BUDGET FLOOR. This is the assertion that stops the next lane from
        // "fixing" a perf number by widening the budget: every slice must still fit
        // inside C10 NFT-4's 16.6 ms interactive frame.
        expect(GROUP_YIELD_BUDGET_MS).toBeLessThanOrEqual(16.6);
    });

    it("the founder's own console line — 49 groups, 30 yields ⇒ 10", () => {
        // §PERF-CACHE-STATS/§PERF-EDGEPROJECTOR-CHUNK, production, 2026-08-26:
        //   "49 group(s), 30 frame yield(s) … 43 ISO layer(s)"
        // 42 of the 49 were cache misses; floor(42/4) = 10 per-chunk yields, so the
        // remaining ~20 were per-LAYER yields on curtain-wall groups.
        expect(Math.floor(42 / GROUP_CHUNK_SIZE)).toBe(10);
        // Same pass, priced by work rather than by count. 42 misses at the measured
        // family mix is well under the 370 ms of the full model.
        const passWorkMs = 42 * (workMs / groups);
        expect(estimateTimedFrameYields(passWorkMs)).toBeLessThanOrEqual(10);
        // 30 frames ⇒ ≤10 frames: 501 ms of calendar latency becomes ≤167 ms.
        expect(30 * FRAME_MS).toBeGreaterThan(490);
        expect(estimateTimedFrameYields(passWorkMs) * FRAME_MS).toBeLessThan(170);
    });

    it('the budget is a WORK clock — a yield never pays for itself', () => {
        // A slice under budget does not yield …
        expect(shouldYieldAfterGroupTimed(GROUP_YIELD_BUDGET_MS - 0.001)).toBe(false);
        // … and one at or over it does.
        expect(shouldYieldAfterGroupTimed(GROUP_YIELD_BUDGET_MS)).toBe(true);
        expect(shouldYieldAfterGroupTimed(999)).toBe(true);
        // ⚠ The clock must be restamped AFTER the frame resolves. If a caller stamped
        // it BEFORE, the ~16.7 ms frame would itself exceed the budget and every
        // following group would yield — the fix inverted. This asserts the trap is
        // real, so the invariant in EdgeProjectorService is not "obvious" folklore.
        expect(shouldYieldAfterGroupTimed(FRAME_MS)).toBe(true);
    });

    it('a single expensive group still gets its relief — the LONGTASK guarantee is intact', () => {
        const cwMs = MEASURED_MS_PER_GROUP.find(([t]) => t === 'curtainwall')![1];
        expect(cwMs).toBeGreaterThan(GROUP_YIELD_BUDGET_MS);
        // Its ~3 layers are ~7.9 ms each. One layer is under budget; two are 15.8 ms —
        // still under, by 0.2 ms — so the group yields ONCE, at its third layer,
        // instead of three times. (The first draft of this test asserted the yield at
        // two layers and was wrong by that 0.2 ms; the real cadence is what is pinned.)
        expect(shouldYieldAfterGroupTimed(cwMs / 3)).toBe(false);
        expect(shouldYieldAfterGroupTimed((cwMs / 3) * 2)).toBe(false);
        expect(shouldYieldAfterGroupTimed(cwMs)).toBe(true);
        // ⭐ The old rule bought 3 frames (50 ms) to relieve 23.7 ms of work: the
        // relief cost more than twice the work it relieved.
        expect(3 * FRAME_MS).toBeGreaterThan(2 * cwMs);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// L-5400 — cancellation does not ride on the yield
// ─────────────────────────────────────────────────────────────────────────────

describe('§PERF-CANCEL-IS-NOT-A-YIELD-RIDER (L-5400)', () => {
    const base = { workGroupsDone: 4, loopIndex: 3, groupsTotal: 365 };

    /**
     * ⭐ THE DEFECT, STATED AS A TEST. Under the old code this was UNREACHABLE:
     * `if (!_hasCWElements && …)` was false for the whole pass, so a superseded
     * projection of a model containing one curtain wall computed all 365 groups
     * and handed back a drawing `setIfCurrent()` threw away.
     */
    it('a curtain-wall group IS a cancellation point — it was not, and that was the bug', () => {
        expect(shouldCancelAtGroupBoundary({
            ...base, perLayerYielded: true, isSuperseded: () => true,
        })).toBe(true);
    });

    it('a curtain-wall group can cancel at ANY group boundary, not only every 4th', () => {
        for (const workGroupsDone of [1, 2, 3, 5, 6, 7]) {
            expect(shouldCancelAtGroupBoundary({
                ...base, workGroupsDone, perLayerYielded: true, isSuperseded: () => true,
            })).toBe(true);
        }
    });

    it('an ordinary group keeps its every-GROUP_CHUNK_SIZE cadence exactly', () => {
        const cancelled: number[] = [];
        for (let n = 1; n <= 12; n++) {
            if (shouldCancelAtGroupBoundary({
                ...base, workGroupsDone: n, perLayerYielded: false, isSuperseded: () => true,
            })) cancelled.push(n);
        }
        expect(cancelled).toEqual([4, 8, 12]);   // byte-identical to pre-L-5400 behaviour
    });

    it('never cancels a pass that has not been superseded', () => {
        expect(shouldCancelAtGroupBoundary({
            ...base, perLayerYielded: true, isSuperseded: () => false,
        })).toBe(false);
        expect(shouldCancelAtGroupBoundary({
            ...base, perLayerYielded: false, isSuperseded: () => false,
        })).toBe(false);
    });

    it('a driver that passes no predicate keeps run-to-completion behaviour', () => {
        expect(shouldCancelAtGroupBoundary({ ...base, perLayerYielded: true })).toBe(false);
        expect(shouldCancelAtGroupBoundary({ ...base, perLayerYielded: false })).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// L-5404 — the two counters are NOT the same number
// ─────────────────────────────────────────────────────────────────────────────

describe('§CANCEL-DENOMINATORS-MUST-COMMENSURATE (L-5404)', () => {
    /**
     * `_chunkGroupIdx` counts groups that ran the FULL pipeline; a cache HIT
     * `continue`s before it. `nativeMeshGroups.length` counts EVERY group. The old
     * guard compared them:
     *
     *     if (_chunkGroupIdx < nativeMeshGroups.length && isSuperseded()) …
     *
     * On a warm cache the left side can never reach the right, so "work remains"
     * stayed TRUE after the final group — and a COMPLETE drawing became cancellable.
     * That is precisely the inverted waste L-705 was raised to close, re-opened
     * through the cache-hit `continue`.
     */
    it('a COMPLETE pass is never cancelled, even when most groups were cache hits', () => {
        const groupsTotal = 100;
        // 92 cache hits, 8 misses. The final group is loopIndex 99.
        expect(shouldCancelAtGroupBoundary({
            perLayerYielded: false,
            workGroupsDone:  8,          // a multiple of GROUP_CHUNK_SIZE → boundary IS due
            loopIndex:       99,         // …but this is the LAST group
            groupsTotal,
            isSuperseded:    () => true,
        })).toBe(false);

        // The pre-fix comparison (8 < 100) would have said "work remains" → cancel.
        expect(8 < groupsTotal).toBe(true);
    });

    it('still cancels while genuine work remains on a warm-cache pass', () => {
        expect(shouldCancelAtGroupBoundary({
            perLayerYielded: false,
            workGroupsDone:  8,
            loopIndex:       50,
            groupsTotal:     100,
            isSuperseded:    () => true,
        })).toBe(true);
    });

    it('a complete pass with NO cache hits is also never cancelled (L-705 unchanged)', () => {
        // 8 groups, 8 misses, GROUP_CHUNK_SIZE=4 → a boundary lands after the last group.
        expect(shouldCancelAtGroupBoundary({
            perLayerYielded: false,
            workGroupsDone:  8,
            loopIndex:       7,
            groupsTotal:     8,
            isSuperseded:    () => true,
        })).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The whole loop, driven by the real policy
// ─────────────────────────────────────────────────────────────────────────────

describe('the group loop, driven by the REAL policy', () => {
    interface Group { type: string; cacheHit: boolean }

    /**
     * The loop shape of `EdgeProjectorService.project()`'s Source-C pass, with every
     * scheduling decision delegated to the same policy the projector calls. The only
     * thing modelled here is the LOOP; the POLICY is the real one.
     *
     * ⭐ §PERF105-YIELD-IS-A-TIME-BUDGET (L-11560) — THE MODEL NOW CARRIES A CLOCK.
     * The yield decision reads elapsed WORK, so a loop model with no notion of cost
     * could not drive it — and a model that cannot express the quantity the policy
     * reads is exactly the "fake more capable than real" failure this file's own
     * header records. `msPerGroup` is the MEASURED per-family cost (see
     * `MEASURED_MS_PER_GROUP`), and `now` advances only for WORK: the frame a yield
     * costs is calendar time, and charging it to the work clock would make the next
     * group yield unconditionally.
     */
    async function run(
        groups: readonly Group[],
        layersPerGroup: number,
        isSuperseded: () => boolean,
        msPerGroup: (type: string) => number = () => 3,
    ): Promise<{ yields: number; groupsVisited: number; cancelled: boolean; workMs: number }> {
        let yields = 0;
        let workGroupsDone = 0;
        let loopIndex = -1;
        let now = 0;             // simulated WORK clock, ms
        let lastYieldAt = 0;

        for (const g of groups) {
            loopIndex++;
            if (g.cacheHit) continue;                       // the projector's `continue`

            const isCWGroup = groupNeedsPerLayerYield(g.type);
            const perLayerMs = msPerGroup(g.type) / layersPerGroup;
            for (let l = 0; l < layersPerGroup; l++) {
                now += perLayerMs;
                if (isCWGroup && shouldYieldAfterGroupTimed(now - lastYieldAt)) {
                    yields++;
                    await Promise.resolve();
                    lastYieldAt = now;                      // restamped AFTER the frame
                }
            }

            workGroupsDone++;
            if (shouldYieldAfterGroupTimed(now - lastYieldAt)) {
                yields++;
                await Promise.resolve();
                lastYieldAt = now;
            }
            if (shouldCancelAtGroupBoundary({
                perLayerYielded: isCWGroup,
                workGroupsDone,
                loopIndex,
                groupsTotal: groups.length,
                isSuperseded,
            })) {
                return { yields, groupsVisited: loopIndex + 1, cancelled: true, workMs: now };
            }
        }
        return { yields, groupsVisited: groups.length, cancelled: false, workMs: now };
    }

    const mk = (n: number, type: string, cacheHit = false): Group[] =>
        Array.from({ length: n }, () => ({ type, cacheHit }));

    /** The measured mix, so the loop model and the ledger price the same building. */
    const measuredMs = (type: string): number =>
        MEASURED_MS_PER_GROUP.find(([t]) => t === type)?.[1] ?? 2.2;

    it('⭐ a superseded pass containing ONE curtain wall now abandons immediately', async () => {
        // The curtain wall is group 0, so the very first boundary is a cancellation point.
        const groups = [...mk(1, 'curtainwall'), ...mk(364, 'wall')];
        const r = await run(groups, 3, () => true);
        expect(r.cancelled).toBe(true);
        expect(r.groupsVisited).toBe(1);
        // Pre-L-5400 this returned { cancelled: false, groupsVisited: 365 }.
        expect(r.groupsVisited).toBeLessThan(groups.length);
    });

    it('⭐ a superseded ALL-wall pass is unchanged — it still stops at group 4', async () => {
        const r = await run(mk(365, 'wall'), 3, () => true);
        expect(r.cancelled).toBe(true);
        expect(r.groupsVisited).toBe(GROUP_CHUNK_SIZE);
    });

    it('a pass nobody supersedes always completes, and its output is untouched', async () => {
        const groups = [...mk(17, 'curtainwall'), ...mk(348, 'wall')];
        const r = await run(groups, 3, () => false, measuredMs);
        expect(r.cancelled).toBe(false);
        expect(r.groupsVisited).toBe(365);
        // ⚠ THIS ASSERTION USED TO READ `expect(r.yields).toBe(51 + 87)` — 17 CW × 3
        // layers plus floor(348 / 4). Both halves were the COUNT rule. Priced by the
        // measured work instead (17 × 23.7 ms + 348 × 0.89 ms ≈ 713 ms), the same pass
        // yields far fewer frames while every slice stays ≤ the budget.
        expect(r.workMs).toBeGreaterThan(700);
        expect(r.workMs).toBeLessThan(730);
        expect(r.yields).toBeLessThan(138);
        // A lower bound too — a yield count that COLLAPSED would mean the budget stopped
        // bounding the LONGTASK, which is the failure this test must also catch.
        expect(r.yields).toBeGreaterThanOrEqual(Math.floor(r.workMs / (GROUP_YIELD_BUDGET_MS * 2)));
    });

    it('the SAME batch, across BOTH regime changes — 1,095 → 138 → fewer still', async () => {
        // Pre-L-5401 batch-wide rule: every group yields per layer.
        const batchWideYields = 365 * 3;
        expect(batchWideYields).toBe(1095);
        // L-5401 count rule: 17 CW × 3 layers + floor(348 / 4).
        const countRuleYields = 17 * 3 + Math.floor(348 / GROUP_CHUNK_SIZE);
        expect(countRuleYields).toBe(138);
        // L-11560 budget rule, on the measured cost of the same 365 groups.
        const budget = (await run([...mk(17, 'curtainwall'), ...mk(348, 'wall')], 3, () => false, measuredMs)).yields;
        expect(budget).toBeLessThan(countRuleYields);
        expect(batchWideYields / budget).toBeGreaterThan(7);
    });

    it('cache hits do not consume the yield budget and do not break the final-group guard', async () => {
        // 300 hits, 65 misses. A complete pass must never be cancelled.
        const groups = [...mk(300, 'wall', true), ...mk(65, 'wall')];
        const r = await run(groups, 3, () => false, measuredMs);
        expect(r.cancelled).toBe(false);
        // 65 walls × 0.890 ms ≈ 58 ms of work. The count rule charged 16 frames (267 ms
        // of calendar time) for it; the budget charges 3.
        expect(r.workMs).toBeLessThan(60);
        expect(Math.floor(65 / GROUP_CHUNK_SIZE)).toBe(16);
        expect(r.yields).toBeLessThanOrEqual(4);
        expect(r.yields).toBeGreaterThan(0);
    });
});
