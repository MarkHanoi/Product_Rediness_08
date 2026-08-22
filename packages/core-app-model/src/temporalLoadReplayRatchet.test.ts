// §FIX-TEMPORAL-LOAD-REPLAY-RATCHET (L-5820) — opening a project made the next
// open more expensive, for ever.
//
// THE DEFECT
// ----------
// `TemporalGraphManager.init()` subscribes to `StoreEventBus` and mints one
// `NodeMutationRecord` per create/update/delete. A project LOAD writes every
// restored element into its store, so a load emits one `create` per restored
// element. `ProjectLoader` wraps the whole hydration in `storeEventBus.beginBatch()`
// and calls `endBatch()` from its `finally` — which is AFTER the Phase G
// `temporalGraphManager.deserialize()` that clear-then-restores the real journal.
//
// So the replay's events were delivered to the manager *after* the journal had been
// restored, and were appended on top of it. The journal is embedded WHOLE inside
// every `ProjectSnapshot`; the local store keeps 20 snapshots and every autosave
// POSTs one to the server. Each open therefore added ~one record per element to a
// payload written twenty times over. Nothing in the loop ever paid it back.
//
// MEASURED (lane LOAD30, 2026-08-22, `node --expose-gc
// tools/perf/bench-version-container.mjs`): a 264-element project's MODEL is
// ~0.1 MB and its whole 20-version container 0.3 MB. The founder's container is
// ~35 MB, and the local decode of it cost 2231 ms of synchronous main-thread work
// on every project open. The journal is that difference.
//
// ⭐ WHY THESE TESTS REPRODUCE THE ORDER RATHER THAN CALL THE FIX
// ---------------------------------------------------------------
// A test that only asserts `suspendRecording()` suppresses records would pass
// against a manager wired into a loader that suspends at the wrong moment — it
// would prove the SWITCH works while saying nothing about the DEFECT, which was
// entirely a question of WHEN the flush lands relative to the restore. So the
// central test below replays `ProjectLoader`'s real sequence against the real
// `storeEventBus` and the real manager:
//
//     beginBatch() → emit N element creates → deserialize(journal) → endBatch()
//
// and asserts the journal afterwards is EXACTLY what was deserialised. That
// assertion FAILS on the pre-fix code (it read `journal + N`), which is what makes
// it a test of the defect and not a restatement of the patch.
//
// ⛔ Nothing here is stubbed. The real `StoreEventBus` buffers and flushes, and the
// real `TemporalGraphManager` subscribes to it.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { storeEventBus } from './StoreEventBus';
import { TemporalGraphManager } from './TemporalGraph';
import type { SerializedTemporalGraph, NodeMutationRecord } from './types/TemporalTypes';

/** A journal as it would arrive inside a stored snapshot. */
function storedJournal(n: number): SerializedTemporalGraph {
    const mutations: NodeMutationRecord[] = Array.from({ length: n }, (_, i) => ({
        id: `mut-stored-${i}`,
        elementId: `el-${i}`,
        elementType: 'wall',
        mutationType: 'update',
        mutatedAt: 1_700_000_000_000 + i,
        mutatedBy: 'system',
        commandId: 'system',
        sessionId: 'session-from-a-previous-day',
    }));
    return { version: 1, edges: [], mutations, sessionId: 'session-from-a-previous-day' };
}

/** One element-store write, exactly as a restored wall/slab/room produces. */
function emitCreate(i: number): void {
    storeEventBus.emit({
        elementId: `el-${i}`,
        elementType: 'wall',
        operation: 'create',
        timestamp: Date.now(),
    });
}

describe('§FIX-TEMPORAL-LOAD-REPLAY-RATCHET (L-5820)', () => {
    let mgr: TemporalGraphManager;

    beforeEach(() => {
        // ⚠ `clear()`, not `reset()`. An earlier draft of this file called
        // `storeEventBus.reset?.()` — a method the bus does NOT have. Optional
        // chaining made it a SILENT no-op, so the suite passed while resetting
        // nothing; a leaked `beginBatch()` depth from one test would have been
        // invisible to the next. ABSENT is not UNREACHABLE, and `?.` on a name that
        // does not exist is how the difference gets hidden.
        storeEventBus.clear();
        mgr = new TemporalGraphManager();
        mgr.init(); // real subscription to the real bus
    });

    afterEach(() => {
        mgr.destroy();
        storeEventBus.clear();
    });

    // ── The defect, in the order it actually occurs ──────────────────────────

    it('⭐ a project LOAD leaves the journal at exactly what the snapshot carried', () => {
        const journal = storedJournal(500);

        // ProjectLoader's real sequence.
        storeEventBus.beginBatch();
        mgr.suspendRecording();                 // ← the fix, at the loader's batch open
        for (let i = 0; i < 264; i++) emitCreate(i);   // hydration writes 264 elements
        mgr.deserialize(journal);               // Phase G restore, INSIDE the batch
        storeEventBus.endBatch();               // ← the flush, in the loader's finally
        mgr.resumeRecording();

        // 500, not 764. Pre-fix this read 764 and grew by 264 on every subsequent
        // open — the ratchet, stated as a number.
        expect(mgr.mutationCount).toBe(500);
    });

    it('⭐ the ratchet is gone across REPEATED opens — the number that used to climb', () => {
        let journal = storedJournal(500);

        for (let open = 0; open < 5; open++) {
            storeEventBus.beginBatch();
            mgr.suspendRecording();
            for (let i = 0; i < 264; i++) emitCreate(i);
            mgr.deserialize(journal);
            storeEventBus.endBatch();
            mgr.resumeRecording();
            // What the next autosave would persist becomes the next open's input.
            journal = mgr.serialize();
        }

        // Five opens, still 500. Pre-fix: 500 + 5 × 264 = 1820, and unbounded.
        expect(mgr.mutationCount).toBe(500);
    });

    it('the flush lands AFTER the restore — the ordering the defect depended on', () => {
        // Proves the premise rather than assuming it: with recording live, the
        // buffered creates really do arrive after `deserialize()` has run, so
        // clear-then-restore cannot absorb them. This is the pre-fix behaviour,
        // asserted so that a future change to the loader's batch window cannot
        // silently invalidate the reasoning above.
        const journal = storedJournal(10);
        storeEventBus.beginBatch();
        for (let i = 0; i < 7; i++) emitCreate(i);
        mgr.deserialize(journal);
        expect(mgr.mutationCount).toBe(10);   // nothing delivered yet
        storeEventBus.endBatch();
        expect(mgr.mutationCount).toBe(17);   // ⛔ the 7 replayed creates, appended
    });

    // ── Real edits are untouched — the half that must NOT change ─────────────

    it('⛔ records the USER\'s edits after the load resumes', () => {
        const journal = storedJournal(500);

        storeEventBus.beginBatch();
        mgr.suspendRecording();
        for (let i = 0; i < 264; i++) emitCreate(i);
        mgr.deserialize(journal);
        storeEventBus.endBatch();
        mgr.resumeRecording();

        // The user now draws three walls.
        emitCreate(1001);
        emitCreate(1002);
        emitCreate(1003);

        expect(mgr.mutationCount).toBe(503);
        expect(mgr.isRecordingSuspended()).toBe(false);
    });

    it('⛔ suspension DELETES nothing — the restored journal survives verbatim', () => {
        const journal = storedJournal(50);
        storeEventBus.beginBatch();
        mgr.suspendRecording();
        for (let i = 0; i < 30; i++) emitCreate(i);
        mgr.deserialize(journal);
        storeEventBus.endBatch();
        mgr.resumeRecording();

        const out = mgr.serialize();
        expect(out.mutations.map(m => m.id)).toEqual(journal.mutations.map(m => m.id));
    });

    // ── The counter's edges ─────────────────────────────────────────────────

    it('nests — an inner resume cannot un-suspend an outer load', () => {
        mgr.suspendRecording();
        mgr.suspendRecording();
        mgr.resumeRecording();
        expect(mgr.isRecordingSuspended()).toBe(true);
        emitCreate(1);
        expect(mgr.mutationCount).toBe(0);
        mgr.resumeRecording();
        expect(mgr.isRecordingSuspended()).toBe(false);
        emitCreate(2);
        expect(mgr.mutationCount).toBe(1);
    });

    it('an UNBALANCED resume floors at zero — never leaves the manager deaf', () => {
        // A load that threw before suspending, or a stray resume, must not push the
        // depth negative: a negative depth would need N extra suspends to come back
        // to 0 and would silently swallow the user's real edits in between.
        mgr.resumeRecording();
        mgr.resumeRecording();
        expect(mgr.isRecordingSuspended()).toBe(false);
        mgr.suspendRecording();
        expect(mgr.isRecordingSuspended()).toBe(true);
        emitCreate(1);
        expect(mgr.mutationCount).toBe(0);
        mgr.resumeRecording();
        emitCreate(2);
        expect(mgr.mutationCount).toBe(1);
    });
});
