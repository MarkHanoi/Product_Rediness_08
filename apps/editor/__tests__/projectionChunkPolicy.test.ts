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
    PER_LAYER_YIELD_ELEMENT_TYPE,
    groupNeedsPerLayerYield,
    shouldYieldAfterGroup,
    shouldCancelAtGroupBoundary,
    estimateFrameYields,
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

    it('a curtain-wall group does NOT also pay the group-boundary yield', () => {
        // It has already yielded once per layer; a further whole frame buys nothing.
        for (let n = 1; n <= 2 * GROUP_CHUNK_SIZE; n++) {
            expect(shouldYieldAfterGroup(true, n)).toBe(false);
        }
    });

    it('an ordinary group yields once every GROUP_CHUNK_SIZE work-groups', () => {
        const yielded: number[] = [];
        for (let n = 1; n <= 12; n++) if (shouldYieldAfterGroup(false, n)) yielded.push(n);
        expect(GROUP_CHUNK_SIZE).toBe(4);
        expect(yielded).toEqual([4, 8, 12]);
    });

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
     */
    async function run(
        groups: readonly Group[],
        layersPerGroup: number,
        isSuperseded: () => boolean,
    ): Promise<{ yields: number; groupsVisited: number; cancelled: boolean }> {
        let yields = 0;
        let workGroupsDone = 0;
        let loopIndex = -1;

        for (const g of groups) {
            loopIndex++;
            if (g.cacheHit) continue;                       // the projector's `continue`

            const isCWGroup = groupNeedsPerLayerYield(g.type);
            for (let l = 0; l < layersPerGroup; l++) {
                if (isCWGroup) { yields++; await Promise.resolve(); }
            }

            workGroupsDone++;
            if (shouldYieldAfterGroup(isCWGroup, workGroupsDone)) {
                yields++;
                await Promise.resolve();
            }
            if (shouldCancelAtGroupBoundary({
                perLayerYielded: isCWGroup,
                workGroupsDone,
                loopIndex,
                groupsTotal: groups.length,
                isSuperseded,
            })) {
                return { yields, groupsVisited: loopIndex + 1, cancelled: true };
            }
        }
        return { yields, groupsVisited: groups.length, cancelled: false };
    }

    const mk = (n: number, type: string, cacheHit = false): Group[] =>
        Array.from({ length: n }, () => ({ type, cacheHit }));

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
        const r = await run(groups, 3, () => false);
        expect(r.cancelled).toBe(false);
        expect(r.groupsVisited).toBe(365);
        // 17 CW × 3 layers = 51, plus floor(348 / 4) = 87 → 138.
        expect(r.yields).toBe(51 + 87);
    });

    it('the SAME batch before the fix would have spent 1,095 yields and never cancelled', async () => {
        // Reproduce the pre-L-5401 batch-wide rule on the same input, for the ledger.
        const batchWideYields = 365 * 3;
        expect(batchWideYields).toBe(1095);
        const after = (await run([...mk(17, 'curtainwall'), ...mk(348, 'wall')], 3, () => false)).yields;
        expect(after).toBe(138);
        expect(batchWideYields / after).toBeGreaterThan(7);
    });

    it('cache hits do not consume the yield budget and do not break the final-group guard', async () => {
        // 300 hits, 65 misses. A complete pass must never be cancelled.
        const groups = [...mk(300, 'wall', true), ...mk(65, 'wall')];
        const r = await run(groups, 3, () => false);
        expect(r.cancelled).toBe(false);
        expect(r.yields).toBe(Math.floor(65 / GROUP_CHUNK_SIZE));   // 16, not 91
    });
});
