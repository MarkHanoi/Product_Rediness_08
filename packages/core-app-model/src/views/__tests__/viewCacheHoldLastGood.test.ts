/**
 * @vitest-environment happy-dom
 *
 * §PERF-ELEV-CROP-DRAG-FLOW (L-222) — HOLD-LAST-GOOD (double-buffer) regression guard.
 *
 * The founder-reported elevation crop-drag FLICKER is an ORDERING defect: during a drag
 * the coarse `invalidate()` disposed the cached drawing and EMPTIED the cache, so a
 * projection completing out-of-generation landed into an empty cache and was
 * force-accepted by §FIX-PLAN-BLANK-STALEGEN — periodically DISPLAYING the OLDER of two
 * competing projections. The fix keeps the last-good drawing warm on a view-definition
 * UPDATE (bump the generation, do NOT dispose), so a superseded projection lands into a
 * NON-empty cache and is REJECTED — an older generation is never displayed.
 *
 * These tests exercise the REAL cache so the generation arithmetic + accept/reject
 * decision are pinned exactly. TechnicalDrawing is stubbed to the surface the cache
 * touches (`onDisposed.trigger`).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import * as OBC from '@thatopen/components';
import { ViewTechnicalDrawingCache } from '../ViewTechnicalDrawingCache';
import { storeEventBus } from '../../StoreEventBus';

const VIEW = 'vd-sys-elev-south';

function makeDrawing(tag: string): OBC.TechnicalDrawing {
    let disposed = false;
    return {
        __tag: tag,
        get __disposed() { return disposed; },
        onDisposed: { trigger: () => { disposed = true; } },
    } as unknown as OBC.TechnicalDrawing;
}

describe('§PERF-ELEV-CROP-DRAG-FLOW (L-222) — cache holds last-good drawing across view-def updates', () => {
    let cache: ViewTechnicalDrawingCache;

    beforeEach(() => {
        cache = new ViewTechnicalDrawingCache();
    });

    it('bumpGeneration() keeps the warm drawing and rejects an older projection (never blanks, never shows stale)', () => {
        const good = makeDrawing('good');
        cache.set(VIEW, good);
        const genOld = cache.beginProjection(VIEW);   // an in-flight projection's generation

        cache.bumpGeneration(VIEW);                    // hold-last-good bump (no dispose)

        // Warm drawing retained — the plan canvas keeps rendering it (no blank window).
        expect(cache.get(VIEW)).toBe(good);
        expect((good as unknown as { __disposed: boolean }).__disposed).toBe(false);

        // The now-stale in-flight projection completes into a NON-empty cache → REJECTED.
        const stale = makeDrawing('stale');
        expect(cache.setIfCurrent(VIEW, genOld, stale)).toBe(false);
        expect(cache.get(VIEW)).toBe(good);            // older generation never displayed
    });

    it('a view-definition UPDATE store event keeps the drawing warm (double-buffer) and bumps the generation', () => {
        const warm = makeDrawing('warm');
        cache.set(VIEW, warm);
        const staleGen = cache.beginProjection(VIEW);

        storeEventBus.emit({ elementType: 'view-definition', elementId: VIEW, operation: 'update', timestamp: Date.now() });

        // The UPDATE must NOT dispose/empty the cache (that was the flicker window).
        expect(cache.get(VIEW)).toBe(warm);
        expect((warm as unknown as { __disposed: boolean }).__disposed).toBe(false);

        // Generation was bumped → the in-flight projection is now stale → rejected.
        const stale = makeDrawing('stale');
        expect(cache.setIfCurrent(VIEW, staleGen, stale)).toBe(false);
        expect(cache.get(VIEW)).toBe(warm);
    });

    it('a view-definition DELETE store event still fully invalidates (dispose + drop)', () => {
        const d = makeDrawing('d');
        cache.set(VIEW, d);
        storeEventBus.emit({ elementType: 'view-definition', elementId: VIEW, operation: 'delete', timestamp: Date.now() });
        expect(cache.get(VIEW)).toBeUndefined();
        expect((d as unknown as { __disposed: boolean }).__disposed).toBe(true);
    });

    it('displayed generation is MONOTONIC across a burst of updates: only the current-gen projection ever shows', () => {
        const g0 = makeDrawing('g0');
        cache.set(VIEW, g0);

        // Simulate a drag burst: three updates, each starting a projection; they can
        // complete out of order. Only the newest generation may ever be displayed.
        const genA = cache.beginProjection(VIEW);
        cache.bumpGeneration(VIEW);
        const genC = cache.beginProjection(VIEW);   // the newest in-flight generation

        // Older projection A lands late → rejected (cache non-empty with g0).
        expect(cache.setIfCurrent(VIEW, genA, makeDrawing('A'))).toBe(false);
        expect(cache.get(VIEW)).toBe(g0);

        // Newest projection C lands → accepted → swapped in atomically.
        const c = makeDrawing('C');
        expect(cache.setIfCurrent(VIEW, genC, c)).toBe(true);
        expect(cache.get(VIEW)).toBe(c);
    });
});
