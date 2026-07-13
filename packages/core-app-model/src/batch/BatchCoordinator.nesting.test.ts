/**
 * §FIX-NESTED-BATCH-DROPS-GUARDS (L-271) — re-entrancy semantics of `runBatch()`.
 *
 * THE BUG THIS FILE FIRST REPRODUCED
 * ---------------------------------------------------------------------------
 * `runBatch()` used to detect the re-entrant case, WARN, and then run `fn()`
 * anyway with the guards OFF:
 *
 *   "[BatchCoordinator] runBatch called while already batching — nesting not
 *    supported. Running fn() without batch guards."
 *
 * A warning is not a guard. The founder's live resi-building generation printed
 * that line on every run. What it actually cost (measured, not assumed):
 *
 *   • the inner call's `BatchOptions` were SILENTLY DISCARDED — its `levelIds`
 *     never joined `_pendingLevelIds`, so the level it mutated was never
 *     re-detected by the final sweep; its `totalElementCount` never reached the
 *     loading overlay; its `skipRedetectRooms` / `skipPbrUpgrade` were ignored.
 *   • the builder pauses (§BATCH-{WALL,CW,SLAB}-PAUSE) were NOT re-applied for
 *     work that arrived after the outer batch's synchronous phase, so each
 *     element re-armed its own rAF flush (the O(n²) WallJoinResolver path the
 *     pause exists to prevent).
 *
 * WHAT IT DID **NOT** COST — the refuted hypothesis (see
 * `apps/editor/__tests__/batchNestingUndo.test.ts`): undo. `CommandBus`
 * pushes one ring entry per DISPATCH and never reads the coordinator, so
 * `runBatch` is undo-neutral: nesting cannot fragment undo. One gesture = one
 * undo entry is bought by dispatching ONE `*.batch.create` command (C16 §8.6),
 * not by holding a batch open.
 *
 * THE SEMANTICS NOW PINNED HERE (C16 §8.7 — three states, no silent third way):
 *   N1  IDLE          → open a batch (unchanged).
 *   N2  SYNC phase    → JOIN the live batch by depth-counting (the StoreEventBus
 *                       `beginBatch()` precedent). Options are MERGED, guards are
 *                       inherited, nothing is released until depth returns to 0.
 *   N3  SETTLING, before the final sweep → EXTEND the live batch: re-apply the
 *                       builder pauses, merge the options, run `fn` inside the
 *                       still-open bus bracket, re-arm completion. Still ONE batch.
 *   N4  SETTLING, after the final sweep has begun → joining is UNSAFE (the
 *                       registration queue has already drained; a registration
 *                       pushed now would never run). The work is DEFERRED into a
 *                       clean, fully-guarded batch on settle. Never unguarded.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BatchCoordinator } from './BatchCoordinator';
import { storeEventBus } from '../StoreEventBus';
import { _resetFrameSchedulerForTest } from '@pryzm/frame-scheduler';

function makeControl() {
    const calls = { pause: 0, resume: 0 };
    return {
        calls,
        pause() { calls.pause++; },
        resume() { calls.resume++; },
        resumeAndFlush() { calls.resume++; },
        discardAndSuppress() {},
        restore() {},
        hasPendingBuilds() { return false; },
    };
}

describe('BatchCoordinator re-entrancy (§FIX-NESTED-BATCH-DROPS-GUARDS, L-271)', () => {
    let bc: InstanceType<typeof BatchCoordinator>;
    let wall: ReturnType<typeof makeControl>;

    beforeEach(() => {
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        bc = new BatchCoordinator();
        wall = makeControl();
        bc.registerBuilderControls(wall, undefined, undefined);
    });

    afterEach(() => {
        bc.forceReset();
        _resetFrameSchedulerForTest();
        vi.restoreAllMocks();
    });

    // ── N2 — TRUE nesting (re-entrant inside the synchronous phase) ───────────

    it('N2 — an inner runBatch JOINS the live batch: options are MERGED, not discarded', () => {
        bc.runBatch(() => {
            expect(bc.batchDepth).toBe(1);
            bc.runBatch(() => {
                expect(bc.batchDepth).toBe(2);
            }, { levelIds: ['L1'], totalElementCount: 5, skipRedetectRooms: false });
        }, { levelIds: ['L0'], totalElementCount: 3, skipRedetectRooms: true, skipPbrUpgrade: true });

        // The inner batch's level MUST be swept — before the fix it was dropped on the floor.
        expect([...bc.affectedLevelIds].sort()).toEqual(['L0', 'L1']);
        // The overlay's denominator must count BOTH batches' elements.
        expect(bc.expectedElementCount).toBe(8);
        // skipRedetectRooms is a promise the batch makes to EVERY participant: it may only
        // stay true if EVERY participant can live without a redetect. The inner one cannot.
        expect(bc.skipRedetectRooms).toBe(false);
        // skipPbrUpgrade: the inner call did not opt in → the merged batch must not skip.
        expect(bc.skipPbrUpgrade).toBe(false);
        // Still exactly ONE batch (depth back to the outer's 1 → 0 only at the async sweep).
        expect(bc.isBatching).toBe(true);
    });

    it('N2 — the inner runBatch does NOT re-pause the builders (the outer pause still holds) and does not double-open a bus bracket', () => {
        const depthOutside = storeEventBus.batchDepth;
        bc.runBatch(() => {
            bc.runBatch(() => {
                // Inside the outer's synchronous bracket the bus is already buffering.
                expect(storeEventBus.batchDepth).toBeGreaterThan(depthOutside);
            }, { levelIds: ['L1'], totalElementCount: 1 });
        }, { levelIds: ['L0'], totalElementCount: 1 });
        // ONE pause for the whole batch — the outer one. (Two pauses would be harmless;
        // ZERO for the inner work is the bug, and it is the EXTEND case below that had it.)
        expect(wall.calls.pause).toBe(1);
    });

    it('N2 — registrations queued by the inner batch are deferred, not executed inline', () => {
        let ran = false;
        bc.runBatch(() => {
            bc.runBatch(() => {
                bc.trackRegistration(() => { ran = true; });
            }, { levelIds: ['L1'], totalElementCount: 1 });
        }, { levelIds: ['L0'], totalElementCount: 1 });
        expect(ran).toBe(false);                     // deferred (the guard)
        expect(bc.pendingRegistrationCount).toBe(1); // …and NOT lost
    });

    it('N2 — an inner throw unwinds the depth and never strands the coordinator mid-batch', () => {
        expect(() => {
            bc.runBatch(() => {
                bc.runBatch(() => { throw new Error('inner boom'); }, { levelIds: ['L1'], totalElementCount: 1 });
            }, { levelIds: ['L0'], totalElementCount: 1 });
        }).toThrow('inner boom');
        expect(bc.isBatching).toBe(false);
        expect(bc.batchDepth).toBe(0);
        expect(storeEventBus.batchDepth).toBe(0);
    });

    // ── N3 — DRAIN OVERLAP (a batch requested while the previous is still settling) ──

    it('N3 — a runBatch during the SETTLING phase EXTENDS the live batch: builders re-paused, options merged', () => {
        bc.runBatch(() => {}, { levelIds: ['L0'], totalElementCount: 3, skipRedetectRooms: true });
        // runBatch has returned; the batch is still open (async drain) — this is the state
        // the resi generator's back-to-back sub-batches actually hit.
        expect(bc.isBatching).toBe(true);
        expect(bc.batchDepth).toBe(0); // no synchronous phase in flight

        let sawBracket = false;
        bc.runBatch(() => {
            sawBracket = storeEventBus.batchDepth > 0; // mutations MUST still be buffered
        }, { levelIds: ['L1'], totalElementCount: 4, skipRedetectRooms: false });

        expect(sawBracket).toBe(true);
        // The guard that was being dropped: the builder pause for the NEW work.
        expect(wall.calls.pause).toBe(2);
        expect([...bc.affectedLevelIds].sort()).toEqual(['L0', 'L1']);
        expect(bc.expectedElementCount).toBe(7);
        expect(bc.skipRedetectRooms).toBe(false);
        // Still ONE batch — one overlay, one CRDT blackout window.
        expect(bc.isBatching).toBe(true);
    });

    it('N3 — an EXTEND re-opens the completion window (a batch that grew must not complete on the old drain signal)', () => {
        bc.runBatch(() => {}, { levelIds: ['L0'], totalElementCount: 1 });
        bc.runBatch(() => {}, { levelIds: ['L1'], totalElementCount: 1 });
        // The extended batch is still live and still expects its own drain signal.
        expect(bc.isBatching).toBe(true);
        expect(bc.hasSignalledDrain).toBe(false);
    });

    // ── N4 — post-sweep overlap: DEFER, never run unguarded ───────────────────

    it('N4 — a runBatch after the final sweep has begun is DEFERRED (never run unguarded, never lost)', async () => {
        // The sweep only proceeds (and keeps `isBatching` true through its yielded drain)
        // when the engine's managers are injected — as they are in production.
        bc.inject(
            { execute: () => undefined },
            { getLevelById: () => ({ id: 'L0', elevation: 0, height: 3 }) },
        );
        // MEASURED, NOT ASSUMED: the post-sweep window only EXISTS while the yielded event
        // drain is still in flight. `endBatchYielded()` fires `onComplete` SYNCHRONOUSLY when
        // the buffer is empty (StoreEventBus L317) — so a batch that emitted nothing settles
        // inside `signalBuildQueueDrained()` and there is no N4 window to test. Production
        // generation always buffers thousands of events, so the window is real there. We
        // reproduce it honestly by emitting events, exactly as a real batch does.
        bc.runBatch(() => {
            for (let i = 0; i < 250; i++) {
                storeEventBus.emit({
                    elementId: `w${i}`, elementType: 'wall', operation: 'create', timestamp: 0,
                });
            }
        }, { levelIds: ['L0'], totalElementCount: 250, skipRedetectRooms: true });

        bc.signalBuildQueueDrained();     // the sweep has begun — the registration queue is drained
        expect(bc.hasSignalledDrain).toBe(true);
        expect(bc.isBatching).toBe(true); // …and the batch has NOT settled yet (drain in flight)

        let ran = false;
        bc.runBatch(() => { ran = true; }, { levelIds: ['L9'], totalElementCount: 1 });
        // MUST NOT have run inline with the guards off…
        expect(ran).toBe(false);
        expect(bc.deferredBatchCount).toBe(1);

        // …and MUST NOT be lost: forceReset (project switch) flushes the settle listeners,
        // and a normal settle runs it in a clean, fully-guarded batch.
        bc.forceReset();
        await new Promise(r => setTimeout(r, 0));
        expect(ran).toBe(true);
    });
});
