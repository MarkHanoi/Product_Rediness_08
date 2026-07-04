/**
 * @vitest-environment happy-dom
 *
 * §FIX-PLAN-BLANK-STALEGEN (L-90, CRITICAL BLOCKER) — regression guard.
 *
 * ROOT CAUSE this suite pins: creating a wall in plan view could leave the WHOLE
 * plan blank (all walls vanish; 3D fine). TWO independent re-projection drivers race
 * the same view's monotonic generation counter:
 *   • PlanViewManager._onProjectionStale        (30 ms coalesce)
 *   • ViewDependencyTracker._flush → onReprojectionNeeded (300 ms debounce)
 * A wall create fires both, and the follow-up REDETECT_ROOMS fires the coarse
 * (room-type) full path too. One driver's `invalidate(viewId)` disposes + deletes
 * the only cached drawing AND bumps the generation WHILE the other driver's
 * `project()` is still in flight. That projection then completes tagged
 * staleGen < currentGen → `setIfCurrent` REJECTED it → the cache was left EMPTY →
 * blank plan (the founder's log: `Stale projection rejected staleGen=17 currentGen=18`).
 *
 * The fix (ViewTechnicalDrawingCache.setIfCurrent): a stale rejection must NEVER
 * leave the cache empty — when the cache currently holds NO drawing for the view,
 * accept the stale completion so a drawing is always present. When a good drawing
 * already exists the reject is preserved (don't clobber newer with older).
 *
 * These tests exercise the REAL cache (not a mock) so the generation arithmetic +
 * accept/reject decision are pinned exactly. TechnicalDrawing is stubbed to the tiny
 * surface the cache touches (`onDisposed.trigger`).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as OBC from '@thatopen/components';
import { ViewTechnicalDrawingCache } from '../ViewTechnicalDrawingCache';

const VIEW = 'vd-sys-plan-l0';

/** Minimal TechnicalDrawing stub — only `onDisposed.trigger()` is invoked by the cache. */
function makeDrawing(tag: string): OBC.TechnicalDrawing {
    return { __tag: tag, onDisposed: { trigger: () => {} } } as unknown as OBC.TechnicalDrawing;
}

describe('§FIX-PLAN-BLANK-STALEGEN (L-90) — stale-gen rejection must never blank the plan', () => {
    let cache: ViewTechnicalDrawingCache;

    beforeEach(() => {
        cache = new ViewTechnicalDrawingCache();
    });

    it('reproduces the staleGen<currentGen race: the completing projection is accepted into the EMPTY cache (never blank)', () => {
        // ── Warm drawing already cached (the pre-create state). ────────────────────
        const warm = makeDrawing('warm');
        cache.set(VIEW, warm);

        // ── Driver A (e.g. ViewDependencyTracker flush) begins a projection. ───────
        const genA = cache.beginProjection(VIEW); // captured before its await

        // ── Driver B (e.g. PlanViewManager full/room path) invalidates concurrently:
        //    disposes + DELETES the only drawing AND bumps the generation. ──────────
        cache.invalidate(VIEW);
        expect(cache.get(VIEW)).toBeUndefined(); // cache is now EMPTY (the blank window)

        // ── Driver A's projection completes with the now-stale generation. ────────
        const fresh = makeDrawing('fresh');
        const accepted = cache.setIfCurrent(VIEW, genA, fresh);

        // FIX: rather than reject-and-leave-blank, the stale completion is accepted
        // because the cache was empty. The plan is NEVER blank after the create.
        expect(accepted).toBe(true);
        expect(cache.get(VIEW)).toBe(fresh);
    });

    it('a newer current-gen projection still wins: it overwrites the stale-accepted drawing when it lands', () => {
        cache.set(VIEW, makeDrawing('warm'));
        const staleGen = cache.beginProjection(VIEW);     // Driver A
        cache.invalidate(VIEW);                            // empties + bumps
        const currentGen = cache.beginProjection(VIEW);    // Driver B (the winner) starts

        // Driver A completes first (stale) → accepted into empty cache (anti-blank).
        const staleDrawing = makeDrawing('stale');
        expect(cache.setIfCurrent(VIEW, staleGen, staleDrawing)).toBe(true);
        expect(cache.get(VIEW)).toBe(staleDrawing);

        // Driver B completes → gen matches current → normal accept → overwrites.
        const winner = makeDrawing('winner');
        expect(cache.setIfCurrent(VIEW, currentGen, winner)).toBe(true);
        expect(cache.get(VIEW)).toBe(winner);
    });

    it('does NOT clobber a good cached drawing with an older stale projection (guard still holds when non-empty)', () => {
        const good = makeDrawing('good');
        cache.set(VIEW, good);

        // An old projection began at genOld; a newer one bumped the generation.
        const genOld = cache.beginProjection(VIEW);
        cache.beginProjection(VIEW); // newer generation supersedes genOld

        // The old projection completes late — cache is NON-empty, so it must be rejected
        // (accepting would clobber the newer good drawing with older geometry).
        const stale = makeDrawing('stale');
        expect(cache.setIfCurrent(VIEW, genOld, stale)).toBe(false);
        expect(cache.get(VIEW)).toBe(good);
    });

    it('current-gen projection into an empty cache is accepted via the normal path (baseline)', () => {
        const gen = cache.beginProjection(VIEW);
        const drawing = makeDrawing('d');
        expect(cache.setIfCurrent(VIEW, gen, drawing)).toBe(true);
        expect(cache.get(VIEW)).toBe(drawing);
    });
});
