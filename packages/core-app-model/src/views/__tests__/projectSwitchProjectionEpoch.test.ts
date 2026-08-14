/**
 * @vitest-environment happy-dom
 *
 * §C13-PROJECTION-EPOCH (L-910) — a NEW project must never display the PREVIOUS
 * project's projection.
 *
 * THE DEFECT THIS SUITE PINS (founder, 2026-08-14 — ISSUE-LOG L-910):
 * start a NEW project in the same session (zero authored walls) and the PREVIOUS
 * project's hidden-line plan linework renders in the viewport while the plan pane
 * shows the empty state. The stores are empty — the leak is downstream, in the
 * projection cache.
 *
 * MECHANISM: the C13 project-switch teardown chokepoint (initScene.ts,
 * `pryzm-project-switch` handler) calls `viewTechnicalDrawingCache.clear()`, which
 * resets `_generations` AND `_lastAcceptedGen` to zero. That puts the cache into
 * EXACTLY the state §FIX-PLAN-BLANK-STALEGEN's force-accept branch was written for
 * (`setIfCurrent`: empty cache + `gen > lastAcceptedGen`): any projection that was
 * IN FLIGHT for project A when the switch fired resolves AFTER the purge carrying
 * `gen ≥ 1 > 0` and is FORCE-ACCEPTED into project B's cache. View definition ids
 * are system-deterministic (`vd-sys-plan-l0` in EVERY project), so project A's
 * drawing lands under project B's own default plan view id — from where the plan
 * pane reads it and the view-activation path mounts its THREE group into B's scene.
 *
 * The anti-blank recovery is keyed on "the cache looks empty" — but after a project
 * switch, "empty" does not mean "cold start", it means "different project". An empty
 * new project and a purged cache must be causally linked by PROJECT IDENTITY, not
 * coincidentally aligned by counter arithmetic.
 *
 * THE FIX: `clear()` — called ONLY at the project lifecycle boundary (project
 * switch / close, initScene.ts §L-325 chokepoint + `bim-project-cleared`) — bumps a
 * lifecycle EPOCH. Generations issued by `beginProjection` live above the current
 * epoch's floor; `setIfCurrent` refuses ANY completion whose generation was issued
 * below the floor, i.e. begun in a previous project's lifetime — regardless of how
 * empty the cache looks. The intra-project anti-blank guarantee (L-90) and INVARIANT
 * D (L-703) are untouched: all pre-existing suites in this directory must stay green.
 *
 * These tests exercise the REAL cache (not a mock), driving the exact call the
 * project-switch chokepoint makes (`clear()`), so the accept/refuse decision is
 * pinned at the seam the leak went through.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as OBC from '@thatopen/components';
import { ViewTechnicalDrawingCache } from '../ViewTechnicalDrawingCache';

/** The system-deterministic ground-floor plan view id — IDENTICAL in every project. */
const VIEW = 'vd-sys-plan-l0';

/** Minimal TechnicalDrawing stub — only `onDisposed.trigger()` is invoked by the cache. */
function makeDrawing(tag: string): OBC.TechnicalDrawing {
    return { __tag: tag, onDisposed: { trigger: () => {} } } as unknown as OBC.TechnicalDrawing;
}

describe('§C13-PROJECTION-EPOCH (L-910) — project switch must refuse cross-project stale completions', () => {
    let cache: ViewTechnicalDrawingCache;

    beforeEach(() => {
        cache = new ViewTechnicalDrawingCache();
    });

    it('REPRO: a project-A projection in flight across the switch is REFUSED after clear(), not force-accepted into project B', () => {
        // ── Project A: the user drew walls; the plan view displayed a drawing. ────
        const gShown = cache.beginProjection(VIEW);
        expect(cache.setIfCurrent(VIEW, gShown, makeDrawing('A-shown'))).toBe(true);

        // ── Project A's LAST projection begins (e.g. the tail of a generation batch)
        //    and is still chunking through EdgeProjectorService when the user leaves. ──
        const inFlightGen = cache.beginProjection(VIEW);

        // ── PROJECT SWITCH — the C13 render-side teardown chokepoint
        //    (initScene `pryzm-project-switch` handler) runs this exact call. ────────
        cache.clear();
        expect(cache.get(VIEW)).toBeUndefined();

        // ── Project B is live. A's in-flight projection resolves NOW, under the SAME
        //    deterministic view id. Its drawing is project A's linework. ─────────────
        const drawingA = makeDrawing('A-linework');
        const accepted = cache.setIfCurrent(VIEW, inFlightGen, drawingA);

        // The completion was begun in project A's lifetime: it must be REFUSED.
        // (RED against pre-fix code: §FIX-PLAN-BLANK-STALEGEN force-accepts it because
        // the cache is empty and gen 2 > lastAcceptedGen 0.)
        expect(accepted).toBe(false);
        expect(cache.get(VIEW)).toBeUndefined();
    });

    it('REPRO: even a NEVER-displayed project-A projection (cold A cache) is refused after the switch', () => {
        // Project A begun a projection but never displayed anything (lastAccepted = 0
        // on both sides of the switch — the hardest case to tell apart numerically).
        const inFlightGen = cache.beginProjection(VIEW);

        cache.clear(); // project switch

        const accepted = cache.setIfCurrent(VIEW, inFlightGen, makeDrawing('A-linework'));
        expect(accepted).toBe(false);
        expect(cache.get(VIEW)).toBeUndefined();
    });

    it('project B\'s OWN first projection after the switch is still accepted (anti-blank guarantee preserved)', () => {
        // Project A activity, then switch.
        const aGen = cache.beginProjection(VIEW);
        cache.setIfCurrent(VIEW, aGen, makeDrawing('A-shown'));
        cache.clear();

        // Project B's first projection for the same deterministic view id.
        const bGen = cache.beginProjection(VIEW);
        const bDrawing = makeDrawing('B-first');
        expect(cache.setIfCurrent(VIEW, bGen, bDrawing)).toBe(true);
        expect(cache.get(VIEW)).toBe(bDrawing);
    });

    it('the L-90 intra-project anti-blank recovery still works INSIDE one project after a switch', () => {
        cache.clear(); // enter a fresh project

        // Two-driver race inside project B: driver A begins, driver B invalidates
        // (empties + bumps), driver A completes stale → accepted into the empty
        // cache (the L-90 guarantee, unchanged — both gens are in B's lifetime).
        cache.set(VIEW, makeDrawing('B-warm'));
        const staleGen = cache.beginProjection(VIEW);
        cache.invalidate(VIEW);
        expect(cache.get(VIEW)).toBeUndefined();

        const staleDrawing = makeDrawing('B-stale-but-better-than-blank');
        expect(cache.setIfCurrent(VIEW, staleGen, staleDrawing)).toBe(true);
        expect(cache.get(VIEW)).toBe(staleDrawing);
    });

    it('a cross-project refusal does NOT poison project B\'s subsequent generations', () => {
        const inFlightGen = cache.beginProjection(VIEW);
        cache.clear();

        // A's completion refused…
        expect(cache.setIfCurrent(VIEW, inFlightGen, makeDrawing('A-linework'))).toBe(false);

        // …and B proceeds normally: begin → supersede → newer wins, older refused.
        const g1 = cache.beginProjection(VIEW);
        const g2 = cache.beginProjection(VIEW);
        expect(cache.setIfCurrent(VIEW, g2, makeDrawing('B-newer'))).toBe(true);
        expect(cache.setIfCurrent(VIEW, g1, makeDrawing('B-older'))).toBe(false);
        expect((cache.get(VIEW) as unknown as { __tag: string }).__tag).toBe('B-newer');
    });

    it('two successive switches (A → B → C) each refuse the previous project\'s in-flight completions', () => {
        const aGen = cache.beginProjection(VIEW);
        cache.clear(); // → B

        const bGen = cache.beginProjection(VIEW);
        cache.clear(); // → C

        expect(cache.setIfCurrent(VIEW, aGen, makeDrawing('A'))).toBe(false);
        expect(cache.setIfCurrent(VIEW, bGen, makeDrawing('B'))).toBe(false);
        expect(cache.get(VIEW)).toBeUndefined();

        const cGen = cache.beginProjection(VIEW);
        expect(cache.setIfCurrent(VIEW, cGen, makeDrawing('C'))).toBe(true);
    });
});
