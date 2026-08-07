/**
 * §PERF-PROJECTION-CANCEL-SUPERSEDED (L-704) — superseded work is CANCELLED, not
 * completed-and-discarded.
 *
 * THE WASTE. `ViewTechnicalDrawingCache.setIfCurrent()` rejects a superseded projection
 * only AFTER it has run to completion; nothing ever cancelled one. The founder's
 * 2026-08-06 session shows three complete plan projections computed and thrown away per
 * wall drawn:
 *
 *   Stale projection rejected — viewId=vd-sys-plan-l0 staleGen=2 currentGen=5
 *   Stale projection rejected — viewId=vd-sys-plan-l0 staleGen=3 currentGen=5
 *   Stale projection rejected — viewId=vd-sys-plan-l0 staleGen=4 currentGen=5
 *
 * These tests assert the CONTRACT of the cancellation seam — the predicate the four
 * projection drivers pass, the error's identity across a lazy-loaded chunk boundary, and
 * that the loop stops early. They deliberately do NOT drive the real
 * `EdgeProjectorService.project()`, which needs an OBC world; the chunk loop's
 * cancellation shape is modelled instead, so this stays a fast unit test.
 *
 * Governance: SPEC-30 §9 ("No 'render everything every frame.' Incremental re-resolve …
 * is mandatory"), C10 LONGTASK budget, ADR-0098 F3.
 */

import { describe, it, expect } from 'vitest';
import {
    ProjectionSupersededError,
    isProjectionSuperseded,
} from '../src/engine/views/projectionCancellation';

describe('§PERF-PROJECTION-CANCEL-SUPERSEDED — the cancellation signal', () => {
    it('is recognised by instance AND by name (the projector is a lazily loaded chunk)', () => {
        const real = new ProjectionSupersededError('vd-sys-plan-l0', 4, 100);
        expect(isProjectionSuperseded(real)).toBe(true);

        // Same class, different module instance — `instanceof` cannot be relied upon
        // across the Phase 6 lazy-import boundary, so the name check must carry it.
        const acrossChunkBoundary = Object.assign(new Error('superseded'), {
            name: 'ProjectionSupersededError',
        });
        expect(isProjectionSuperseded(acrossChunkBoundary)).toBe(true);
    });

    it('does NOT swallow a genuine projection failure', () => {
        expect(isProjectionSuperseded(new Error('WebGL context lost'))).toBe(false);
        expect(isProjectionSuperseded(new TypeError('boom'))).toBe(false);
        expect(isProjectionSuperseded(undefined)).toBe(false);
        expect(isProjectionSuperseded(null)).toBe(false);
        expect(isProjectionSuperseded('ProjectionSupersededError')).toBe(false);
    });

    it('reports how much work was avoided', () => {
        const err = new ProjectionSupersededError('vd-sys-plan-l0', 8, 5000);
        expect(err.viewId).toBe('vd-sys-plan-l0');
        expect(err.groupsCompleted).toBe(8);
        expect(err.groupsTotal).toBe(5000);
        expect(err.message).toContain('8/5000');
    });
});

describe('§PERF-PROJECTION-CANCEL-SUPERSEDED — the driver predicate', () => {
    /** The exact expression every projection driver passes as `isSuperseded`. */
    const makePredicate = (currentGen: () => number, myGen: number) =>
        () => currentGen() !== myGen;

    it('is false while this pass is still the one the view wants', () => {
        let gen = 5;
        expect(makePredicate(() => gen, 5)()).toBe(false);
    });

    it('turns true the moment a newer generation is started', () => {
        let gen = 5;
        const superseded = makePredicate(() => gen, 5);
        expect(superseded()).toBe(false);
        gen = 6;                       // another driver called beginProjection()
        expect(superseded()).toBe(true);
    });

    /**
     * The founder's sequence: generations 2, 3 and 4 all lose to 5. Under the OLD
     * behaviour each ran to completion (3 full passes of wasted work). Under the new
     * behaviour each stops at its first chunk boundary after being superseded.
     */
    it('cancels every superseded pass in the founder\'s 5-generation burst', () => {
        const currentGen = 5;
        const losers = [2, 3, 4];
        const cancelled = losers.filter(g => makePredicate(() => currentGen, g)());
        expect(cancelled).toEqual([2, 3, 4]);
        expect(makePredicate(() => currentGen, 5)()).toBe(false);   // the winner runs on
    });
});

describe('§PERF-PROJECTION-CANCEL-SUPERSEDED — the chunk loop stops early', () => {
    /**
     * Models `EdgeProjectorService.project()`'s per-group loop: work per group, a yield
     * every CHUNK_SIZE groups, and the cancellation check AT the yield boundary (the only
     * point where the per-group temp geometries have all been disposed, so abandoning
     * there leaks nothing).
     */
    async function runChunkedProjection(
        groupCount: number,
        chunkSize: number,
        isSuperseded: () => boolean,
    ): Promise<{ groupsProcessed: number; cancelled: boolean }> {
        let groupsProcessed = 0;
        for (let i = 0; i < groupCount; i++) {
            groupsProcessed++;
            if (groupsProcessed % chunkSize === 0) {
                await Promise.resolve();                 // stands in for the vsync yield
                // §FIX-PLAN-GEN-SELF-SUPERSEDE (L-705) — cancel ONLY while work remains.
                if (groupsProcessed < groupCount && isSuperseded()) {
                    return { groupsProcessed, cancelled: true };
                }
            }
        }
        return { groupsProcessed, cancelled: false };
    }

    it('abandons at the first chunk boundary after being superseded, not at the end', async () => {
        const CHUNK_SIZE = 4;
        const r = await runChunkedProjection(5_000, CHUNK_SIZE, () => true);
        expect(r.cancelled).toBe(true);
        // One chunk of work, not 5,000 groups — this is the whole point.
        expect(r.groupsProcessed).toBe(CHUNK_SIZE);
        expect(r.groupsProcessed).toBeLessThan(5_000);
    });

    it('runs to completion when it is NOT superseded (no behaviour change for the winner)', async () => {
        const r = await runChunkedProjection(64, 4, () => false);
        expect(r.cancelled).toBe(false);
        expect(r.groupsProcessed).toBe(64);
    });

    it('omitting the predicate preserves the old run-to-completion behaviour exactly', async () => {
        const noPredicate = undefined as (() => boolean) | undefined;
        const r = await runChunkedProjection(64, 4, () => noPredicate?.() === true);
        expect(r.cancelled).toBe(false);
        expect(r.groupsProcessed).toBe(64);
    });

    /**
     * §FIX-PLAN-GEN-SELF-SUPERSEDE (L-705) — the inverted-waste case.
     *
     * `groupsProcessed % CHUNK_SIZE === 0` is ALSO true at the boundary that follows the
     * LAST group whenever the group count is a multiple of CHUNK_SIZE. Cancelling there
     * pays the entire cost of the projection and then throws the finished drawing away —
     * the exact waste this optimisation exists to prevent, in reverse. A complete drawing
     * is always worth handing back; `setIfCurrent()` remains the authority on whether it
     * may be DISPLAYED, and on an empty cache §FIX-PLAN-BLANK-STALEGEN would rather have
     * it than nothing.
     */
    it('never cancels after the FINAL group — a finished drawing is always handed back', async () => {
        const CHUNK_SIZE = 4;
        // 8 groups = exactly two chunks, so a boundary lands after the last group.
        const r = await runChunkedProjection(8, CHUNK_SIZE, () => true);
        expect(r.groupsProcessed).toBe(CHUNK_SIZE);   // cancelled at the FIRST boundary …
        expect(r.cancelled).toBe(true);

        // … but a pass that only becomes superseded during its last chunk completes.
        let superseded = false;
        const r2 = await runChunkedProjection(8, CHUNK_SIZE, () => superseded);
        expect(r2.cancelled).toBe(false);
        superseded = true;
        const r3 = await runChunkedProjection(4, CHUNK_SIZE, () => superseded);
        expect(r3.cancelled).toBe(false);             // one chunk, all of it real work
        expect(r3.groupsProcessed).toBe(4);
    });

    it('becomes cancellable partway through, and stops within one chunk of that', async () => {
        const CHUNK_SIZE = 4;
        let superseded = false;
        let seen = 0;
        const r = await runChunkedProjection(400, CHUNK_SIZE, () => {
            seen++;
            if (seen === 3) superseded = true;   // a rival driver bumps the generation
            return superseded;
        });
        expect(r.cancelled).toBe(true);
        expect(r.groupsProcessed).toBe(3 * CHUNK_SIZE);
    });
});
