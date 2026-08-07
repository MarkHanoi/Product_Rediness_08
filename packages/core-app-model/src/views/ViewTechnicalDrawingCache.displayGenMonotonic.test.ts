/**
 * §FIX-PLAN-DISPLAY-GEN-MONOTONIC (L-703) — INVARIANT D regression suite.
 *
 * THE BUG (founder, 2026-08-06): *"I already drew 3 walls, NONE of them appeared in
 * the plan view screen where I am drawing."*
 *
 * Root cause: §FIX-PLAN-BLANK-STALEGEN accepted ANY stale projection into an empty
 * cache. With two uncoordinated re-projection drivers racing one view's generation
 * (L-307), a slow generation-1 projection (ONE wall) landed after generations 2..4 had
 * been rejected and was installed while currentGen=5 — so the plan displayed one wall
 * while five existed.
 *
 *   INVARIANT D — the drawing displayed for a view is NEVER older than one already
 *   displayed for that view.
 *
 * These tests assert ORDERING and COUNTS, never pixels. They also pin the guarantee the
 * mitigation was originally written for (L-90: never blank on a genuine cold cache), so
 * a future change cannot fix one by reintroducing the other.
 *
 * Governance: SPEC-30 §9 (incremental re-resolve mandatory), SPEC-04 §4.2,
 * `V1-LAUNCH-IMPLEMENTATION-PLAN.md:1835` (hold-last-good; keep the cold-cache guard),
 * ADR-0297 L2 (release at a frame boundary, never in place).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type * as OBC from '@thatopen/components';
import { ViewTechnicalDrawingCache } from './ViewTechnicalDrawingCache';

// ── Test doubles ─────────────────────────────────────────────────────────────

interface FakeDrawing {
    readonly label: string;
    disposed: boolean;
    readonly onDisposed: { trigger: () => void };
}

let _seq = 0;
function makeDrawing(label = `drawing-${++_seq}`): FakeDrawing {
    const d: FakeDrawing = {
        label,
        disposed: false,
        onDisposed: { trigger: () => { d.disposed = true; } },
    };
    return d;
}

/** Cast helper — the cache only ever calls `onDisposed.trigger()` on a drawing. */
const asDrawing = (d: FakeDrawing): OBC.TechnicalDrawing => d as unknown as OBC.TechnicalDrawing;

const VIEW = 'vd-sys-plan-l0';

/**
 * Drain the frame-boundary release queue (ADR-0297 L2). The cache defers disposal via
 * `unifiedFrameLoop.queueLowPriority`; in the happy-dom test environment that queue is
 * driven by rAF, so we flush it by advancing timers/microtasks. When the frame loop is
 * unavailable the cache releases inline and this is a no-op.
 */
async function flushFrameBoundary(): Promise<void> {
    await Promise.resolve();
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await Promise.resolve();
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('ViewTechnicalDrawingCache — §FIX-PLAN-DISPLAY-GEN-MONOTONIC (INVARIANT D)', () => {
    let cache: ViewTechnicalDrawingCache;

    beforeEach(() => {
        cache = new ViewTechnicalDrawingCache();
        cache.clear();
    });

    // ── The founder's bug, asserted directly ─────────────────────────────────

    it('THE FOUNDER BUG: a generation-1 drawing is NEVER displayed after generation 4 has been displayed', () => {
        // Five walls drawn in a burst → five generations started.
        const gens = [1, 2, 3, 4, 5].map(() => cache.beginProjection(VIEW));
        expect(gens).toEqual([1, 2, 3, 4, 5]);

        // Generation 4 completes first and is (correctly) refused as non-current, but the
        // cache is empty, so the cold-cache guard installs it — this IS the intended
        // anti-blank behaviour and must keep working.
        const g4 = makeDrawing('4-walls');
        expect(cache.setIfCurrent(VIEW, 4, asDrawing(g4))).toBe(true);
        expect(cache.lastAcceptedGeneration(VIEW)).toBe(4);

        // The view is then invalidated by the OTHER driver (this is L-307: two drivers,
        // one generation counter) — the cache is now EMPTY again.
        cache.invalidate(VIEW);
        expect(cache.has(VIEW)).toBe(false);

        // Now the SLOW generation-1 projection (ONE wall) finally lands.
        const g1 = makeDrawing('1-wall');
        const accepted = cache.setIfCurrent(VIEW, 1, asDrawing(g1));

        // BEFORE THE FIX this returned true and the founder saw one wall out of five.
        expect(accepted).toBe(false);
        expect(cache.get(VIEW)).toBeUndefined();
        expect(cache.lastAcceptedGeneration(VIEW)).toBe(4);
    });

    it('the displayed generation is monotonic across an arbitrary out-of-order completion sequence', () => {
        for (let i = 0; i < 8; i++) cache.beginProjection(VIEW);

        // Completions arrive shuffled; between each one the rival driver empties the cache.
        const arrivalOrder = [3, 1, 6, 2, 8, 5, 7, 4];
        const displayed: number[] = [];

        for (const gen of arrivalOrder) {
            if (cache.setIfCurrent(VIEW, gen, asDrawing(makeDrawing(`gen-${gen}`)))) {
                displayed.push(gen);
            }
            cache.invalidate(VIEW);
        }

        // Every generation that reached the screen was newer than the one before it.
        for (let i = 1; i < displayed.length; i++) {
            expect(displayed[i]).toBeGreaterThan(displayed[i - 1]);
        }
        // And the sequence is exactly the running maxima of the arrival order.
        expect(displayed).toEqual([3, 6, 8]);
    });

    // ── The guarantee the mitigation was written for (L-90) must survive ──────

    it('KEEPS §FIX-PLAN-BLANK-STALEGEN: a stale projection into a genuinely COLD cache is still accepted', () => {
        cache.beginProjection(VIEW);   // gen 1
        cache.beginProjection(VIEW);   // gen 2 — supersedes it

        // Nothing has ever been displayed (lastAccepted = 0), so gen 1 is better than blank.
        expect(cache.lastAcceptedGeneration(VIEW)).toBe(0);
        const cold = makeDrawing('cold');
        expect(cache.setIfCurrent(VIEW, 1, asDrawing(cold))).toBe(true);
        expect(cache.get(VIEW)).toBe(asDrawing(cold));
    });

    it('a refused regression still requests a catch-up reprojection, so the view cannot stay blank', () => {
        const events: Array<{ viewId?: string; reason?: string }> = [];
        const listener = (e: Event): void => {
            events.push((e as CustomEvent<{ viewId?: string; reason?: string }>).detail);
        };
        window.addEventListener('vd:reprojection-required', listener);
        try {
            cache.beginProjection(VIEW);
            cache.beginProjection(VIEW);
            cache.beginProjection(VIEW);
            cache.setIfCurrent(VIEW, 3, asDrawing(makeDrawing('newest')));  // displayed
            cache.invalidate(VIEW);                                          // emptied
            events.length = 0;

            expect(cache.setIfCurrent(VIEW, 1, asDrawing(makeDrawing('oldest')))).toBe(false);

            const forThisView = events.filter(d => d?.viewId === VIEW);
            expect(forThisView.length).toBe(1);
            expect(forThisView[0].reason).toBe('stale-regression-refused');
        } finally {
            window.removeEventListener('vd:reprojection-required', listener);
        }
    });

    it('a current-generation completion always wins, and overwrites a stale-accepted drawing', () => {
        cache.beginProjection(VIEW);            // gen 1
        const gen2 = cache.beginProjection(VIEW);
        cache.setIfCurrent(VIEW, 1, asDrawing(makeDrawing('stale-accepted')));
        const fresh = makeDrawing('current');
        expect(cache.setIfCurrent(VIEW, gen2, asDrawing(fresh))).toBe(true);
        expect(cache.get(VIEW)).toBe(asDrawing(fresh));
        expect(cache.lastAcceptedGeneration(VIEW)).toBe(2);
        expect(cache.isProvisionalStale(VIEW)).toBe(false);
    });

    // ── Display history is per-project (C13 isolation) ───────────────────────

    it('clear() resets the display history so the next project is not refused its first drawing', () => {
        cache.beginProjection(VIEW);
        cache.beginProjection(VIEW);
        cache.setIfCurrent(VIEW, 2, asDrawing(makeDrawing('project-A')));
        expect(cache.lastAcceptedGeneration(VIEW)).toBe(2);

        cache.clear();
        expect(cache.lastAcceptedGeneration(VIEW)).toBe(0);
        expect(cache.currentGeneration(VIEW)).toBe(0);

        const gen = cache.beginProjection(VIEW);
        expect(cache.setIfCurrent(VIEW, gen, asDrawing(makeDrawing('project-B')))).toBe(true);
    });

    it('invalidate() does NOT reset the display history — that is what detects a regression', () => {
        cache.beginProjection(VIEW);
        cache.beginProjection(VIEW);
        cache.setIfCurrent(VIEW, 2, asDrawing(makeDrawing('shown')));
        cache.invalidate(VIEW);
        expect(cache.lastAcceptedGeneration(VIEW)).toBe(2);
    });

    // ── ADR-0297 L2 — no drawing is leaked, none is disposed in place ────────

    it('ADR-0297 L2: a displaced drawing is always released, and the release queue cannot grow while the loop is stopped', async () => {
        const { unifiedFrameLoop } = await import('../rendering/UnifiedFrameLoop');
        expect(unifiedFrameLoop.isRunning).toBe(false);   // no frame is being encoded

        const first  = makeDrawing('first');
        const second = makeDrawing('second');

        const g1 = cache.beginProjection(VIEW);
        cache.setIfCurrent(VIEW, g1, asDrawing(first));
        const g2 = cache.beginProjection(VIEW);
        cache.setIfCurrent(VIEW, g2, asDrawing(second));

        expect(cache.get(VIEW)).toBe(asDrawing(second));
        // Loop stopped ⇒ L2(b) already satisfied ⇒ released inline, never queued forever.
        await flushFrameBoundary();
        expect(first.disposed).toBe(true);
        expect(second.disposed).toBe(false);   // the installed drawing is never released
    });

    it('ADR-0297 L2: with the frame loop RUNNING, the displaced drawing is deferred, not disposed in place', async () => {
        const { unifiedFrameLoop } = await import('../rendering/UnifiedFrameLoop');
        const queued: Array<() => void | Promise<void>> = [];
        const runningSpy = vi.spyOn(unifiedFrameLoop, 'isRunning', 'get').mockReturnValue(true);
        const queueSpy = vi.spyOn(unifiedFrameLoop, 'queueLowPriority')
            .mockImplementation(task => { queued.push(task); });
        try {
            const first  = makeDrawing('first');
            const second = makeDrawing('second');
            const g1 = cache.beginProjection(VIEW);
            cache.setIfCurrent(VIEW, g1, asDrawing(first));
            const g2 = cache.beginProjection(VIEW);
            cache.setIfCurrent(VIEW, g2, asDrawing(second));

            // Detached from the cache now; NOT disposed inside set().
            expect(cache.get(VIEW)).toBe(asDrawing(second));
            expect(first.disposed).toBe(false);
            expect(queued.length).toBe(1);

            queued.forEach(t => void t());        // the frame boundary arrives
            expect(first.disposed).toBe(true);
        } finally {
            queueSpy.mockRestore();
            runningSpy.mockRestore();
        }
    });

    it('re-setting the SAME drawing object (the incremental-graft path) never releases it', async () => {
        const warm = makeDrawing('warm');
        const g1 = cache.beginProjection(VIEW);
        cache.setIfCurrent(VIEW, g1, asDrawing(warm));
        // The graft path projects into the warm drawing and commits the same object back.
        const g2 = cache.beginProjection(VIEW);
        cache.setIfCurrent(VIEW, g2, asDrawing(warm));

        await flushFrameBoundary();
        expect(warm.disposed).toBe(false);
        expect(cache.get(VIEW)).toBe(asDrawing(warm));
    });

    // ── Per-element invalidation stays view-scoped (unchanged contract) ───────

    it('invalidateElement() does not bump the view generation or the display history', () => {
        const g1 = cache.beginProjection(VIEW);
        cache.setIfCurrent(VIEW, g1, asDrawing(makeDrawing('warm')));
        const genBefore = cache.currentGeneration(VIEW);

        cache.invalidateElement(VIEW, 'wall_01');

        expect(cache.currentGeneration(VIEW)).toBe(genBefore);
        expect(cache.lastAcceptedGeneration(VIEW)).toBe(g1);
        expect(cache.has(VIEW)).toBe(true);
    });

    // ── HOLD-LAST-GOOD (§PERF-ELEV-CROP-DRAG-FLOW L-222) still behaves ───────

    it('bumpGeneration() keeps the warm drawing and makes a superseded completion take the REJECT path', () => {
        const warm = makeDrawing('warm');
        const g1 = cache.beginProjection(VIEW);
        cache.setIfCurrent(VIEW, g1, asDrawing(warm));

        cache.bumpGeneration(VIEW);           // crop drag — hold last good
        expect(cache.get(VIEW)).toBe(asDrawing(warm));   // still rendering

        // The older projection completes into a NON-empty cache → rejected, never displayed.
        expect(cache.setIfCurrent(VIEW, g1, asDrawing(makeDrawing('older')))).toBe(false);
        expect(cache.get(VIEW)).toBe(asDrawing(warm));
    });
});

// ── Blast-radius / scheduling invariants on the tracker ──────────────────────

describe('ViewDependencyTracker — per-edit blast radius (SPEC-30 §9, C16 §8 B-5)', () => {
    it('documents the measured AS-IS: an element create dirties every elevation, not just its level', async () => {
        // This test pins the CURRENT behaviour that the audit reports as the elevation
        // scaling defect: `_getAffectedViews` returns section/elevation views for ANY
        // level, and `NativeElementMeshExporter.exportForView` then exports ALL levels for
        // them. It is deliberately an AS-IS pin: when the deferred
        // §PERF-ELEVATION-LEVEL-SCOPED-EXPORT work lands, this expectation must be
        // tightened, and this test is the place a future author will see why.
        const { PLAN_INCREMENTAL_SAFE_TYPES } = await import('./ViewDependencyTracker');

        // The graft fast-path — the only O(1)-per-edit route — covers exactly the
        // "pure projection, no whole-view symbol pass" types. Anything outside this set
        // (door, window, furniture, stair, column, roof, opening) costs a FULL pass.
        expect([...PLAN_INCREMENTAL_SAFE_TYPES].sort())
            .toEqual(['beam', 'ceiling', 'floor', 'slab', 'wall']);
    });
});
