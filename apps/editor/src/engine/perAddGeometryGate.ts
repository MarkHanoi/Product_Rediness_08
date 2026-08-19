/**
 * §FIX-LOAD-TRAVERSE-BATCH (P2) — per-add geometry-pass gate policy.
 *
 * The `initScene` per-`bim-*-added` handler runs two full `scene.traverse()`
 * passes (PBR mesh collection + tier mesh-count) for every geometry-add event.
 * During a heavy project load, thousands of add-events fire OUTSIDE any
 * `batchCoordinator` batch (`ImportProjectCommand` drains under the SEPARATE
 * `storeEventBus` batch), so the pre-existing `batchCoordinator.isBatching`
 * guard does NOT engage and each add re-walks a growing scene → O(n²).
 *
 * This module isolates the *decision* — "should the per-add pass be deferred?" —
 * from the giant `initScene` closure so it is unit-testable in isolation. The
 * consolidated tier/PBR pass runs exactly once after load via the
 * `pryzm-project-loaded` event (see initScene). Pure module: no THREE, no DOM,
 * no I/O; reads only a runtime flag. No P8 span required.
 *
 * §PRYZM-PERF (INSTR1) — this module also COUNTS its own decisions, because the
 * gate is the cheapest honest place to measure the per-add traversal cost it
 * governs. See the counter block in `shouldDeferPerAddGeometryPass`. The counters
 * are off by default (one typed-global read) and the module stays pure: the
 * counter registry has no I/O, no THREE and no DOM either.
 */

import { bumpPerf, notePerf, PERF_KEYS } from '@pryzm/frame-scheduler';

/**
 * True while `ProjectLoader` is replaying a persisted snapshot. ProjectLoader
 * sets `globalThis.__pryzmProjectLoadActive` for the whole load window and
 * clears it in its `finally` block BEFORE the `pryzm-project-loaded` event
 * fires, so the consolidated post-load pass is never itself skipped.
 */
export function isProjectLoadActive(): boolean {
    return (globalThis as { __pryzmProjectLoadActive?: boolean }).__pryzmProjectLoadActive === true;
}

/**
 * Whether the per-add tier/PBR pass should be SKIPPED (deferred to a
 * consolidated pass). Skipped during a `batchCoordinator` batch (the pre-existing
 * P1.3 guard) OR during a project load (§FIX-LOAD-TRAVERSE-BATCH). Otherwise the
 * interactive path runs the per-add pass exactly as before.
 *
 * @param isBatching current `batchCoordinator.isBatching` value.
 */
export function shouldDeferPerAddGeometryPass(isBatching: boolean): boolean {
    const defer = isBatching || isProjectLoadActive();

    // ── §PRYZM-PERF (INSTR1) — count the per-add traversals from the GATE ─────
    //
    // ⭐ WHY HERE AND NOT AT THE TRAVERSALS THEMSELVES. The two full
    // `scene.traverse()` passes this gate governs live inside `initScene`'s
    // `runTierPbrPass` (`collectNewPbrMeshes` and `countMeshes`). This function is
    // the DECISION immediately upstream of both, so counting it yields exactly the
    // same numbers — with one call site instead of two, in a pure module that is
    // unit-testable, and without editing the 4000-line composition root.
    //
    // Each non-deferred consultation costs TWO full walks of a GROWING scene, which
    // is the O(n^2) the founder's 367-element batch is suspected of paying: 367 adds
    // x 2 = 734 traversals of a scene on its way to 2069 meshes.
    //
    // ⭐ THE BOOLEAN THAT DECIDES THE WHOLE QUESTION. `note.gestureRanInsideBatch`
    // is the single most valuable thing this function knows, and it cannot be
    // reconstructed after the fact. If it reads FALSE, the gate never engaged and
    // the founder paid 734 traversals; if TRUE, he paid 2. One gesture settles it —
    // and the deferred count proves the gate ran rather than merely existing.
    //
    // Both flags are recorded as LAST-WRITE-WINS notes, so the report shows the
    // state at the END of the gesture. Counters are the durable evidence; the notes
    // are the context that makes them readable.
    if (defer) {
        bumpPerf(PERF_KEYS.TRAVERSE_PER_ADD_DEFERRED);
    } else {
        // Two traversals per undeferred add — count each, so the report's
        // "TOTAL traversals" is a walk count, not an event count.
        bumpPerf(PERF_KEYS.TRAVERSE_PER_ADD_PBR);
        bumpPerf(PERF_KEYS.TRAVERSE_PER_ADD_TIER);
    }
    notePerf(PERF_KEYS.NOTE_IN_BATCH, isBatching);
    notePerf(PERF_KEYS.NOTE_PROJECT_LOAD_ACTIVE, isProjectLoadActive());

    return defer;
}
