/**
 * §FIX-PLAN-GEN-SELF-SUPERSEDE (L-705) — the blank-view RECOVERY had become the PIPELINE.
 *
 * THE OBSERVATION (founder, 2026-08-07). This line appeared on EVERY edit, for hours,
 * across multiple sessions — and it reads as a success message, so nobody looked:
 *
 *   [ViewTechnicalDrawingCache] §FIX-PLAN-BLANK-STALEGEN — accepting a stale projection
 *     into an EMPTY cache to avoid a blank view:
 *     viewId=vd-sys-plan-l0 staleGen=54 currentGen=55 lastAcceptedGen=53
 *
 * ADR-0299: *"a recovery whose steady state is 'always on' is masking a broken normal
 * path."* It was. The arithmetic is the fingerprint: the gap is EXACTLY ONE, EVERY time,
 * and `lastAcceptedGen` trails by exactly two. A genuine race between two uncoordinated
 * drivers (L-307) produces a gap of two or more, and a VARYING one. A gap that is always
 * one is a driver superseding ITSELF.
 *
 * THE DEFECT. `ViewDependencyTracker._flush()` takes a generation with `beginProjection()`
 * and hands it to `onReprojectionNeeded`. When that handler's incremental-graft fast-path
 * (L-65) fell through, it called `invalidate(viewId)` and CARRIED ON with the generation it
 * already held. `invalidate()` bumps the generation and empties the cache — so the fallback
 * pass was born stale-by-one into a cache the handler had itself just emptied, which is
 * precisely the condition §FIX-PLAN-BLANK-STALEGEN force-accepts. Every edit, forever.
 *
 * Severity beyond the noise: it also armed §PERF-PROJECTION-CANCEL-SUPERSEDED (L-704)
 * against the very pass it was protecting (`currentGeneration !== gen` is true from the
 * instant of the self-invalidate), so past CHUNK_SIZE native groups the fallback pass would
 * be ABANDONED and produce nothing at all.
 *
 * These tests assert GENERATIONS and COMMIT PATHS, never pixels. The pass/fail criterion is
 * *"does the cache receive a CURRENT-generation projection"*, not *"does something render"*
 * — the second was true throughout and is exactly what hid this.
 *
 * Governance: C04 §3.3 (projection scheduling / invalidation), DOC-1.5f (generation guard),
 * ADR-0299 (§RECOVERY-MUST-REFUSE), ADR-0297 L2 (release at a frame boundary).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

const asDrawing = (d: FakeDrawing): OBC.TechnicalDrawing => d as unknown as OBC.TechnicalDrawing;

const VIEW = 'vd-sys-plan-l0';

/** Every §FIX-PLAN-BLANK-STALEGEN fire, at either severity, in call order. */
function recoveryFires(warn: ReturnType<typeof vi.spyOn>, error: ReturnType<typeof vi.spyOn>): string[] {
    const all = [...warn.mock.calls, ...error.mock.calls].map(c => String(c[0]));
    return all.filter(m => m.includes('§FIX-PLAN-BLANK-STALEGEN'));
}

describe('ViewTechnicalDrawingCache — §FIX-PLAN-GEN-SELF-SUPERSEDE (L-705)', () => {
    let cache: ViewTechnicalDrawingCache;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let logSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        cache = new ViewTechnicalDrawingCache();
        warnSpy  = vi.spyOn(console, 'warn').mockImplementation(() => {});
        errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        logSpy   = vi.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        warnSpy.mockRestore();
        errorSpy.mockRestore();
        logSpy.mockRestore();
    });

    /**
     * Seed the view the way the running product reaches steady state: one healthy,
     * generation-matching commit. Returns the generation that was accepted.
     */
    function seedHealthyCommit(): number {
        const gen = cache.beginProjection(VIEW);
        expect(cache.setIfCurrent(VIEW, gen, asDrawing(makeDrawing('seed')))).toBe(true);
        return gen;
    }

    // ── 1. REPRODUCTION — the defect, before the fix ─────────────────────────

    describe('the driver sequence that produced the founder log', () => {
        /**
         * The BROKEN handler, transcribed exactly: it is handed a generation, later
         * decides it must discard the drawing, and then commits under the generation it
         * was originally handed.
         */
        function editWithSelfSupersede(): boolean {
            const gen = cache.beginProjection(VIEW);   // ViewDependencyTracker._flush()
            cache.invalidate(VIEW);                    // graft fall-through — bumps the gen
            return cache.setIfCurrent(VIEW, gen, asDrawing(makeDrawing()));
        }

        it('reproduces the founder\'s exact arithmetic: staleGen = currentGen-1, lastAccepted = currentGen-2', () => {
            const seeded = seedHealthyCommit();          // lastAccepted = seeded, current = seeded
            editWithSelfSupersede();

            const currentGen = cache.currentGeneration(VIEW);
            const staleGen   = currentGen - 1;

            // The projection that landed was tagged one generation behind the counter …
            expect(staleGen).toBe(seeded + 1);
            // … and the last thing displayed BEFORE it trailed by two. 54 / 55 / 53.
            expect(seeded).toBe(currentGen - 2);

            const fires = recoveryFires(warnSpy, errorSpy);
            expect(fires).toHaveLength(1);
            expect(fires[0]).toContain(`staleGen=${staleGen} currentGen=${currentGen} lastAcceptedGen=${seeded}`);
        });

        it('leaves the cache permanently behind the generation counter — no commit is ever CURRENT', () => {
            seedHealthyCommit();
            for (let i = 0; i < 5; i++) editWithSelfSupersede();

            // THE ASSERTION THAT MATTERS: what the view displays is never what the view
            // was asked for. Something renders on every edit, which is why this survived.
            expect(cache.lastAcceptedGeneration(VIEW)).toBeLessThan(cache.currentGeneration(VIEW));
            expect(cache.has(VIEW)).toBe(true);
        });

        it('makes the blank-view RECOVERY the routine writer — it fires on every edit', () => {
            seedHealthyCommit();
            for (let i = 0; i < 5; i++) editWithSelfSupersede();
            expect(recoveryFires(warnSpy, errorSpy)).toHaveLength(5);
        });
    });

    // ── 2. THE FIX — restartProjection() ─────────────────────────────────────

    describe('restartProjection() — a driver that discards the drawing re-declares its generation', () => {
        /** The FIXED handler. Same discard, one call instead of two. */
        function editWithRestart(): boolean {
            let gen = cache.beginProjection(VIEW);
            gen = cache.restartProjection(VIEW);   // graft fall-through: discard + re-declare
            return cache.setIfCurrent(VIEW, gen, asDrawing(makeDrawing()));
        }

        it('commits at the CURRENT generation — the assertion the log could not make', () => {
            seedHealthyCommit();
            expect(editWithRestart()).toBe(true);
            expect(cache.lastAcceptedGeneration(VIEW)).toBe(cache.currentGeneration(VIEW));
        });

        it('silences the blank-view recovery entirely across a burst of edits', () => {
            seedHealthyCommit();
            for (let i = 0; i < 20; i++) expect(editWithRestart()).toBe(true);

            expect(recoveryFires(warnSpy, errorSpy)).toHaveLength(0);
            expect(cache.lastAcceptedGeneration(VIEW)).toBe(cache.currentGeneration(VIEW));
            expect(cache.isProvisionalStale(VIEW)).toBe(false);
        });

        it('does not suppress cancellation either — the pass is no longer superseded at birth', () => {
            seedHealthyCommit();
            let gen = cache.beginProjection(VIEW);
            gen = cache.restartProjection(VIEW);
            // This is the §PERF-PROJECTION-CANCEL-SUPERSEDED (L-704) predicate verbatim.
            // Under the defect it was ALREADY true here, so the projector abandoned a pass
            // nothing else was going to replace.
            expect(cache.currentGeneration(VIEW) !== gen).toBe(false);
        });

        it('discards the warm drawing it replaces (ADR-0297 L2) and empties the cache', () => {
            const warm = makeDrawing('warm');
            const gen0 = cache.beginProjection(VIEW);
            cache.setIfCurrent(VIEW, gen0, asDrawing(warm));

            const before = cache.currentGeneration(VIEW);
            const gen1 = cache.restartProjection(VIEW);

            expect(cache.has(VIEW)).toBe(false);
            expect(gen1).toBeGreaterThan(before);
            expect(gen1).toBe(cache.currentGeneration(VIEW));
        });
    });

    // ── 3. ADR-0299 — the recovery must announce when it is doing the job ────

    describe('the recovery is loud when it stops being rare', () => {
        function staleAccept(): void {
            const gen = cache.beginProjection(VIEW);
            cache.invalidate(VIEW);
            cache.setIfCurrent(VIEW, gen, asDrawing(makeDrawing()));
        }

        it('warns (does not error) on the genuine cold-cache case it was written for', () => {
            // L-90's original scenario: nothing has ever been displayed. This MUST still be
            // accepted, and must NOT be alarmed about — it is the guard working as designed.
            const gen = cache.beginProjection(VIEW);
            cache.invalidate(VIEW);
            expect(cache.setIfCurrent(VIEW, gen, asDrawing(makeDrawing()))).toBe(true);

            expect(warnSpy.mock.calls.some(c => String(c[0]).includes('§FIX-PLAN-BLANK-STALEGEN'))).toBe(true);
            expect(errorSpy).not.toHaveBeenCalled();
        });

        it('escalates to console.error once it has written the view 3× in a row', () => {
            seedHealthyCommit();
            staleAccept();
            staleAccept();
            expect(errorSpy).not.toHaveBeenCalled();

            staleAccept();

            const alarms = errorSpy.mock.calls.map(c => String(c[0]))
                .filter(m => m.includes('§FIX-PLAN-GEN-SELF-SUPERSEDE'));
            expect(alarms).toHaveLength(1);
            // It must name the DEFECT class and the diagnostic, not just the symptom.
            expect(alarms[0]).toContain('currentGen - staleGen = 1');
            expect(alarms[0]).toContain('restartProjection');
            expect(alarms[0]).toContain('DO NOT widen this guard');
        });

        it('a healthy generation-matching commit resets the alarm', () => {
            seedHealthyCommit();
            staleAccept();
            staleAccept();

            seedHealthyCommit();      // the normal path works again
            errorSpy.mockClear();

            staleAccept();
            staleAccept();
            expect(errorSpy).not.toHaveBeenCalled();   // streak restarted, threshold not met
        });

        it('does not widen the guard — a REGRESSING projection is still refused', () => {
            // INVARIANT D (§FIX-PLAN-DISPLAY-GEN-MONOTONIC) is untouched by any of this.
            const gen1 = cache.beginProjection(VIEW);
            const gen2 = cache.beginProjection(VIEW);
            expect(cache.setIfCurrent(VIEW, gen2, asDrawing(makeDrawing('newer')))).toBe(true);

            cache.invalidate(VIEW);
            expect(cache.setIfCurrent(VIEW, gen1, asDrawing(makeDrawing('older')))).toBe(false);
            expect(cache.has(VIEW)).toBe(false);
        });
    });
});
