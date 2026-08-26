/**
 * projectionChunkPolicy — the SCHEDULING policy of `EdgeProjectorService.project()`,
 * lifted out of the 1,600-line method body so it can be MEASURED and TESTED.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS (lane EPS19, 2026-08-22)
 * ─────────────────────────────────────────────────────────────────────────────
 * The projector's per-group loop makes three scheduling decisions on every group:
 *
 *   1. do I yield a frame after each LAYER?         (curtain-wall relief)
 *   2. do I yield a frame after this GROUP?         (chunking, C10 LONGTASK budget)
 *   3. may I ABANDON this pass because it is superseded?   (L-704)
 *
 * All three lived as inline `if (…)` expressions inside `project()`, and
 * `apps/editor/__tests__/projectionCancellation.test.ts` asserted them against a
 * HAND-WRITTEN MODEL of the loop. The model was more capable than the real loop:
 * it had no curtain-wall branch, so it could not see that decision (3) was
 * UNREACHABLE for any batch containing a curtain wall (§L-5400). A fake built from
 * the header cannot falsify the header.
 *
 * The three decisions are now ONE named, pure, importable policy. `project()` calls
 * it; the test calls the SAME function. There is no model to drift.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONTRACT
 * ─────────────────────────────────────────────────────────────────────────────
 * C04 §3.3 (rendering / scheduling) · C10 (LONGTASK budget) · P3 (single rAF owner —
 * every yield this policy authorises is executed through `getFrameScheduler()`, never
 * a raw `requestAnimationFrame` / `setTimeout`).
 *
 * ⚠ PURITY. No THREE, no OBC, no DOM, no store reads. It answers questions about
 * scheduling from plain numbers and strings, which is exactly why it is testable
 * without an OBC world.
 */

/**
 * `userData.elementType` (lower-cased) of the one native builder whose groups are
 * expensive enough to need per-LAYER relief.
 *
 * MEASURED (§PERF-EDGEPROJECTOR-SUBLAYER-YIELD, 2026-05-06): a CurtainWall group
 * holds ~34 submeshes; `EdgesGeometry` + `matrixWorld` ≈ 68 ms, `mergeGeometries`
 * ≈ 20 ms and `toDrawingSpace` ≈ 50 ms per layer, so 2–4 layers per group is a
 * 160–220 ms LONGTASK — 4× the C10 budget. Every other builder (Wall, Slab, Column,
 * Beam, Door, Window, Furniture …) costs ≤12 ms per GROUP.
 *
 * ⚠ Do NOT probe for `THREE.InstancedMesh` here. `NativeElementMeshExporter` converts
 * every InstancedMesh into N plain `THREE.Mesh` proxies before handing groups to the
 * projector, so an instancing probe is always false — that was the original detection
 * bug (§PERF-EDGEPROJECTOR-CHUNK-ADAPTIVE, corrected 2026-05-05).
 */
export const PER_LAYER_YIELD_ELEMENT_TYPE = 'curtainwall';

/**
 * Groups per frame-yield for ordinary (non-per-layer) groups.
 *
 * 4 × ~12 ms ≈ 48 ms — just inside the 50 ms LONGTASK threshold.
 *
 * ⚠ **THIS CONSTANT NO LONGER DECIDES YIELDS (lane PERF105, L-11560).** It is retained
 * because `shouldCancelAtGroupBoundary` still uses it as the CANCELLATION cadence —
 * a deliberately separate decision since L-5400 — and because the `estimateFrameYields`
 * ledger is written in its terms. The yield decision moved to
 * `shouldYieldAfterGroupTimed`, for the reason recorded there.
 */
export const GROUP_CHUNK_SIZE = 4;

/**
 * §PERF105-YIELD-IS-A-TIME-BUDGET (L-11560) — the elapsed-work slice, in ms, after
 * which the projection loop yields a display frame.
 *
 * ─── WHY A BUDGET REPLACED A GROUP COUNT ────────────────────────────────────
 *
 * `GROUP_CHUNK_SIZE = 4` is a PROXY for elapsed time, and its calibration —
 * "4 × ~12 ms ≈ 48 ms" — was measured in 2026-05 against a projector that then had
 * no per-element cache and a much denser per-group pipeline. **It is now wrong by
 * 5.5×.**
 *
 * MEASURED (`packages/room-topology/probes/probe-perf105-02-projection-group-cost.local.mts`,
 * 2026-08-26 — `updateWorldMatrix` + `EdgesGeometry` + `mergeGeometries` per group, the
 * CPU half of the per-group pipeline, at realistic mesh counts per family):
 *
 *     wall 0.89 ms · window 1.76 · door 2.15 · slab 0.47 · stair 4.77
 *     curtainwall 23.74 · furniture 3.59 · lighting 0.30 · column 0.22
 *     → mean 2.19 ms per group, NOT 12 ms.
 *
 * So four ordinary groups are ~8.8 ms of work, and four LIGHTING groups are **1.2 ms**
 * — and the loop then spends a whole 16.7 ms display frame relieving it. On a
 * 169-group model the pass does **370 ms of CPU work and spends 800 ms waiting for
 * 48 frames: 68 % of the elapsed re-projection is yield, not work.** That is the
 * founder's *"extremely slow with not even 200 elements"* on the interaction clock.
 *
 * ⛔ THIS IS NOT "YIELD LESS AND HOPE". The yields exist to bound the LONGTASK, and a
 * budget bounds it DIRECTLY instead of through a proxy that has drifted. 16 ms is
 * **stricter** than the 50 ms the replaced comment claimed to be enforcing, and it is
 * C10 NFT-4's interactive frame budget (16.6 ms p95) — one slice, one frame's worth of
 * work. The policy also becomes self-calibrating: a 23.7 ms curtain-wall group blows
 * the budget on its own and yields; four lighting groups do not, and no longer buy a
 * frame of latency for 1.2 ms of work.
 *
 * LEDGER (`estimateTimedFrameYields`, pinned in `projectionChunkPolicy.test.ts`):
 * the same 370 ms of work costs **48 yields ⇒ 23 yields**, 800 ms ⇒ 384 ms of calendar
 * time, with every slice still ≤ 16 ms.
 */
export const GROUP_YIELD_BUDGET_MS = 16;

/**
 * Does the loop yield a display frame now, given how long it has worked since the
 * last one?
 *
 * This is the SINGLE yield decision — it replaces both the per-`GROUP_CHUNK_SIZE`
 * group yield AND the curtain-wall per-LAYER yield. The two existed because a
 * curtain-wall group cost ~20× an ordinary one and a group COUNT cannot express that;
 * a time budget can, so one rule now covers both and there is no longer a family
 * special case to keep in sync with the builders.
 *
 * ⚠ THE CALLER OWNS THE CLOCK, and must restamp it AFTER the yield resolves, not
 * before it starts — a display frame is ~16.7 ms of calendar time, so charging the
 * frame itself against the next slice would make every subsequent group yield and
 * invert the fix.
 *
 * @param msSinceLastYield  elapsed ms of WORK since the loop last yielded.
 */
export function shouldYieldAfterGroupTimed(
    msSinceLastYield: number,
    budgetMs: number = GROUP_YIELD_BUDGET_MS,
): boolean {
    return msSinceLastYield >= budgetMs;
}

/**
 * Does THIS group need a frame yield after every layer?
 *
 * ⚠ §PERF-CW-YIELD-IS-PER-GROUP (L-5401) — THIS USED TO BE A BATCH-WIDE FLAG.
 * `project()` computed `_hasCWElements = nativeMeshGroups.some(g => …'curtainwall')`
 * ONCE for the whole pass, and then asked `if (_hasCWElements)` inside the LAYER loop
 * of EVERY group. So a single curtain wall anywhere in the model made all 365 groups
 * yield a full display frame after every layer they emitted.
 *
 * MEASURED CONSEQUENCE for the founder's model (365 groups, ~2.4 layers/group):
 * ~876 frame yields ≈ 14.6 s of calendar time for ONE projection pass — instead of
 * the ~91 yields (≈1.5 s) the per-type calibration was designed to cost. See
 * `estimateFrameYields()` and the ledger in `projectionChunkPolicy.test.ts`.
 *
 * The answer is a property of the GROUP, not of the batch.
 */
export function groupNeedsPerLayerYield(elementTypeLower: string | undefined): boolean {
    return elementTypeLower === PER_LAYER_YIELD_ELEMENT_TYPE;
}

/**
 * ⛔ `shouldYieldAfterGroup(perLayerYielded, workGroupsDone)` WAS HERE AND IS GONE
 * (lane PERF105, L-11560). It decided the yield from a group COUNT:
 *
 *     if (perLayerYielded) return false;
 *     return workGroupsDone % GROUP_CHUNK_SIZE === 0;
 *
 * It was DELETED rather than deprecated because leaving it beside
 * `shouldYieldAfterGroupTimed` would be two rival answers to one question — the
 * defect shape this repo keeps re-committing — and because the whole point of
 * lifting the policy into this module (L-5401) was that there is exactly ONE place
 * the loop's scheduling can be read from. Its measured replacement, and the numbers
 * that condemned the group count, are documented on `GROUP_YIELD_BUDGET_MS` above.
 *
 * `GROUP_CHUNK_SIZE` itself SURVIVES: `shouldCancelAtGroupBoundary` still uses it as
 * the cancellation cadence, which L-5400 established is a DIFFERENT decision that must
 * not ride on the yield.
 */

/** Inputs to the cancellation decision at a group boundary. */
export interface CancelDecisionInput {
    /** `groupNeedsPerLayerYield()` for the group just finished. */
    perLayerYielded: boolean;
    /** Groups that ran the full pipeline so far (cache misses). */
    workGroupsDone: number;
    /** TRUE loop position — cache hits included. 0-based index of the group just finished. */
    loopIndex: number;
    /** Total groups handed to this pass. */
    groupsTotal: number;
    /** The driver's generation predicate. Absent ⇒ the caller opted out of cancellation. */
    isSuperseded?: () => boolean;
}

/**
 * May the pass abandon itself at this group boundary?
 *
 * THREE conditions, and each one closes a distinct measured defect:
 *
 * 1. **The boundary must be a cancellation point.** Per-group temp geometries are
 *    disposed by the loop's `finally`, which has already run — so abandoning here
 *    leaks nothing. (§L-704.)
 *
 *    ⚠ §PERF-CANCEL-IS-NOT-A-YIELD-RIDER (L-5400) — the check used to be nested
 *    INSIDE `if (!_hasCWElements && _chunkGroupIdx % CHUNK_SIZE === 0)`, i.e. it rode
 *    on the YIELD. For a batch with a curtain wall the yield branch never ran, so the
 *    cancellation check NEVER RAN EITHER: the pass computed all 365 groups and handed
 *    back a drawing that `setIfCurrent()` then rejected. Cancellation safety comes
 *    from the `finally`, not from the yield — so a group that yielded per-layer is a
 *    perfectly good cancellation point, and is now treated as one.
 *
 * 2. **Work must REMAIN.** (§FIX-PLAN-GEN-SELF-SUPERSEDE, L-705.) Cancelling after the
 *    last group pays the whole cost and then throws the finished drawing away — the
 *    exact waste this optimisation exists to prevent, inverted. `setIfCurrent()` is
 *    still the authority on whether a finished drawing may be DISPLAYED.
 *
 *    ⚠ §CANCEL-DENOMINATORS-MUST-COMMENSURATE (L-5404) — this guard used to read
 *    `_chunkGroupIdx < nativeMeshGroups.length`, comparing a CACHE-MISS counter against
 *    a TOTAL-GROUP count. On any pass with cache hits the left side can never reach the
 *    right, so "work remains" stayed true after the final group and a COMPLETE drawing
 *    was cancellable — re-opening L-705 through the cache-hit `continue`. The guard now
 *    uses the true loop position.
 *
 * 3. **A newer generation must have started.** The driver's own predicate.
 */
export function shouldCancelAtGroupBoundary(input: CancelDecisionInput): boolean {
    const { perLayerYielded, workGroupsDone, loopIndex, groupsTotal, isSuperseded } = input;

    // (1) Is this a cancellation point? Every boundary that yielded is; and for a group
    //     that yielded per-layer, EVERY one of its boundaries is.
    const atCancellationPoint = perLayerYielded || workGroupsDone % GROUP_CHUNK_SIZE === 0;
    if (!atCancellationPoint) return false;

    // (2) Does work remain? `loopIndex` is 0-based, so the final group has
    //     loopIndex === groupsTotal - 1 and nothing remains after it.
    if (loopIndex + 1 >= groupsTotal) return false;

    // (3) Has a newer generation superseded us?
    return isSuperseded?.() === true;
}

/**
 * Frame yields one pass costs — the arithmetic behind the L-5401 ledger.
 *
 * Every yield is one display frame (~16.7 ms at 60 Hz) of CALENDAR time, whether or
 * not the CPU is busy. It is the number that turns "the projector is slow" into a
 * number the founder can feel while navigating.
 *
 * @param cwGroups        groups whose elementType is `curtainwall`.
 * @param otherGroups     every other group.
 * @param layersPerGroup  mean projection layers emitted per group.
 * @param batchWide       model the PRE-L-5401 behaviour: if ANY group is a curtain
 *                        wall, EVERY group yields per layer.
 */
export function estimateFrameYields(
    cwGroups: number,
    otherGroups: number,
    layersPerGroup: number,
    batchWide: boolean,
): number {
    if (batchWide && cwGroups > 0) {
        // Pre-fix: per-layer yield for every group, and the group-boundary yield is
        // dead (its `!_hasCWElements` guard is false), so this is the whole cost.
        return Math.round((cwGroups + otherGroups) * layersPerGroup);
    }
    const perLayer = Math.round(cwGroups * layersPerGroup);
    const perChunk = Math.floor(otherGroups / GROUP_CHUNK_SIZE);
    return perLayer + perChunk;
}

/**
 * §PERF105-YIELD-IS-A-TIME-BUDGET (L-11560) — frame yields one pass costs under the
 * BUDGET policy, so the two regimes can be compared in one ledger instead of one being
 * asserted and the other described.
 *
 * The loop yields whenever the accumulated slice reaches the budget, and never after
 * the final group (there is nothing left to relieve), so a pass doing `workMs` of CPU
 * work crosses the budget `ceil(workMs / budgetMs) - 1` times.
 *
 * ⚠ This is the CALENDAR cost only. The CPU work is unchanged by either policy — that
 * is the whole point: the yields were never doing any of the projection.
 *
 * @param workMs   total CPU ms the pass spends projecting groups.
 */
export function estimateTimedFrameYields(
    workMs: number,
    budgetMs: number = GROUP_YIELD_BUDGET_MS,
): number {
    if (workMs <= 0 || budgetMs <= 0) return 0;
    return Math.max(0, Math.ceil(workMs / budgetMs) - 1);
}
