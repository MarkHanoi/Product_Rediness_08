/**
 * @vitest-environment happy-dom
 *
 * §FIX-WALLMOVE-PLAN-INCREMENTAL / §FIX-WALLMOVE-REDETECT-DEFER
 * (ADR-0098 finding F3 / queue Q6, 2026-07-02).
 *
 * ROOT CAUSE this suite pins: `PlanElementDragController._moveWall` live-updates the
 * WallStore on EVERY mousemove, and `WallStore.emit` fans that out to the
 * ViewDependencyTracker's storeEventBus subscription. The OLD path re-armed the
 * 300 ms debounce on each mousemove and, on flush, disposed the WHOLE drawing via
 * the coarse `invalidate(viewId)` → a full EdgeProjector + HiddenLineRemoval + NME
 * export re-projection. During a drag that fired repeatedly → main-thread peg.
 *
 * The fix:
 *   1. DEFER: while `window.__wallDragInProgress === true`, `_onStoreEvent` is a
 *      no-op — no dirty-mark, no debounce re-arm. N mousemoves → ZERO flush schedules.
 *   2. INCREMENTAL: a settled single-element `update` (the drag-end commit) drops
 *      ONLY that element's projection lines via `invalidateElement` and keeps the
 *      rest of the drawing warm, instead of the coarse whole-drawing `invalidate`.
 *
 * The heavy singletons (OBC-importing cache, view store, frame loop, registry) are
 * mocked so the tracker's DECISION logic is exercised hermetically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock the OBC-importing cache + the other singleton collaborators. ──────────
const invalidate = vi.fn();
const invalidateElement = vi.fn();
const beginSwap = vi.fn((_viewId: string) => 1);
vi.mock('../ViewTechnicalDrawingCache', () => ({
    viewTechnicalDrawingCache: {
        invalidate: (viewId: string) => invalidate(viewId),
        invalidateElement: (viewId: string, elementId: string) => invalidateElement(viewId, elementId),
        clear: () => {},
        beginProjection: () => 1,
        // §FIX-PLAN-COMPUTE-THEN-SWAP (L-706) — the coarse flush path now takes its
        // generation via `beginSwap` (take a generation, KEEP the drawing on screen)
        // instead of `invalidate` + `beginProjection` (discard, then recompute into a
        // blank view — the founder's white flash on every element create).
        beginSwap: (viewId: string) => beginSwap(viewId),
        setIfCurrent: () => true,
    },
}));

let _views: Array<{ id: string; viewType: string; spatial: { levelId?: string } }> = [];
vi.mock('../ViewDefinitionStore', () => ({
    viewDefinitionStore: { getAll: () => _views },
}));

vi.mock('../../ElementRegistry', () => ({
    elementRegistry: { onUnregister: (_cb: (id: string) => void) => () => {} },
}));

// Run queued flushes synchronously so we can assert without a real frame loop.
vi.mock('../../rendering/UnifiedFrameLoop', () => ({
    unifiedFrameLoop: { queueLowPriority: (cb: () => void) => { cb(); } },
}));

// storeEventBus.subscribe returns an unsubscribe; the tracker binds _onStoreEvent.
let _emitStoreEvent: ((e: { elementId: string; elementType: string; operation: string }) => void) | null = null;
vi.mock('../../StoreEventBus', () => ({
    storeEventBus: {
        subscribe: (cb: (e: { elementId: string; elementType: string; operation: string }) => void) => {
            _emitStoreEvent = cb;
            return () => { _emitStoreEvent = null; };
        },
    },
    StoreChangeEvent: class {},
}));

import { ViewDependencyTracker } from '../ViewDependencyTracker';

const PLAN_VIEW = { id: 'planview-0001', viewType: 'plan', spatial: { levelId: 'L0' } };

function setDrag(on: boolean): void {
    (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = on;
}

describe('§FIX-WALLMOVE-PLAN-INCREMENTAL — plan re-projection deferral + incrementalization', () => {
    let tracker: ViewDependencyTracker;

    beforeEach(() => {
        vi.useFakeTimers();
        invalidate.mockClear();
        invalidateElement.mockClear();
        beginSwap.mockClear();
        _views = [PLAN_VIEW];
        setDrag(false);
        tracker = new ViewDependencyTracker();
        tracker.init();
        tracker.registerElement('wall-1', 'L0');
    });
    afterEach(() => {
        tracker.destroy();
        vi.useRealTimers();
        setDrag(false);
    });

    it('N wall updates DURING a drag schedule ZERO re-projection; the release update runs ONE (incremental)', () => {
        // ── Drag in flight: the per-mousemove wall store update stream. ────────────
        setDrag(true);
        for (let i = 0; i < 25; i++) {
            _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        }
        vi.advanceTimersByTime(400); // past DEBOUNCE_MS — nothing must have flushed
        expect(invalidate).not.toHaveBeenCalled();
        expect(invalidateElement).not.toHaveBeenCalled();

        // ── Drag ends: the single authoritative commit emits ONE wall update. ─────
        setDrag(false);
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        vi.advanceTimersByTime(400); // fire the debounce → flush

        // Incremental: exactly the moved wall's lines dropped; drawing stays warm.
        expect(invalidateElement).toHaveBeenCalledTimes(1);
        expect(invalidateElement).toHaveBeenCalledWith(PLAN_VIEW.id, 'wall-1');
        // The coarse whole-drawing invalidate must NOT run for a single-wall move.
        expect(invalidate).not.toHaveBeenCalled();
    });

    it('§FIX-PLAN-PROJECT-INCREMENTAL: a create of a pure-projection type (wall) is element-scoped (warm drawing kept)', () => {
        // L-65: adding a wall must NOT dispose the whole drawing — only the new wall
        // is dirtied; every other element re-uses its cached projection.
        setDrag(false);
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'create' });
        vi.advanceTimersByTime(400);
        expect(invalidateElement).toHaveBeenCalledTimes(1);
        expect(invalidateElement).toHaveBeenCalledWith(PLAN_VIEW.id, 'wall-1');
        expect(invalidate).not.toHaveBeenCalled();
    });

    it('a create of a NON-pure-projection type (door — has a symbol pass) takes the coarse FULL pass, holding the drawing', () => {
        setDrag(false);
        tracker.registerElement('door-1', 'L0');
        _emitStoreEvent!({ elementId: 'door-1', elementType: 'door', operation: 'create' });
        vi.advanceTimersByTime(400);
        // §FIX-PLAN-COMPUTE-THEN-SWAP (L-706) — CONTRACT CHANGED, DELIBERATELY.
        // This used to assert `invalidate(viewId)` — discard the drawing, THEN spend the
        // whole re-projection computing its replacement into a blank view. That gap is
        // the founder's 2026-08-07 report: *"every single time I create an element ... it
        // goes white and renders again"*. The coarse path is still a FULL re-projection
        // (nothing about the work changed, and `graftIds` is still undefined below); what
        // changed is that the current drawing STAYS ON SCREEN until the replacement
        // commits. `beginSwap` still bumps the generation, so an in-flight older pass is
        // rejected exactly as before.
        expect(beginSwap).toHaveBeenCalledTimes(1);
        expect(beginSwap).toHaveBeenCalledWith(PLAN_VIEW.id);
        expect(invalidate).not.toHaveBeenCalled();
        expect(invalidateElement).not.toHaveBeenCalled();
    });

    it('a delete still takes the coarse whole-drawing pass, holding the drawing until the replacement commits', () => {
        setDrag(false);
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'delete' });
        vi.advanceTimersByTime(400);
        // §FIX-PLAN-COMPUTE-THEN-SWAP (L-706) — CONTRACT CHANGED, DELIBERATELY.
        // This used to assert `invalidate(viewId)` — discard the drawing, THEN spend the
        // whole re-projection computing its replacement into a blank view. That gap is
        // the founder's 2026-08-07 report: *"every single time I create an element ... it
        // goes white and renders again"*. The coarse path is still a FULL re-projection
        // (nothing about the work changed, and `graftIds` is still undefined below); what
        // changed is that the current drawing STAYS ON SCREEN until the replacement
        // commits. `beginSwap` still bumps the generation, so an in-flight older pass is
        // rejected exactly as before.
        expect(beginSwap).toHaveBeenCalledTimes(1);
        expect(beginSwap).toHaveBeenCalledWith(PLAN_VIEW.id);
        expect(invalidate).not.toHaveBeenCalled();
        expect(invalidateElement).not.toHaveBeenCalled();
    });
});

describe('§FIX-PLAN-PROJECT-INCREMENTAL — graft-eligibility handed to the reprojection driver', () => {
    let tracker: ViewDependencyTracker;
    let graftCalls: Array<{ viewId: string; graftIds: ReadonlySet<string> | undefined }>;

    beforeEach(() => {
        vi.useFakeTimers();
        invalidate.mockClear();
        invalidateElement.mockClear();
        beginSwap.mockClear();
        _views = [PLAN_VIEW];
        setDrag(false);
        graftCalls = [];
        tracker = new ViewDependencyTracker();
        tracker.init();
        tracker.registerElement('wall-1', 'L0');
        tracker.registerElement('door-1', 'L0');
        tracker.onReprojectionNeeded = async (viewId, _gen, graftIds) => {
            graftCalls.push({ viewId, graftIds });
        };
    });
    afterEach(() => {
        tracker.destroy();
        vi.useRealTimers();
        setDrag(false);
    });

    it('a single pure-projection create passes ONLY that element as the graft set', async () => {
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'create' });
        await vi.advanceTimersByTimeAsync(400);
        expect(graftCalls).toHaveLength(1);
        expect(graftCalls[0].viewId).toBe(PLAN_VIEW.id);
        expect(graftCalls[0].graftIds).toBeInstanceOf(Set);
        expect([...graftCalls[0].graftIds!]).toEqual(['wall-1']);
    });

    it('a view touched by a non-pure-projection change is NOT offered the graft (graftIds undefined)', async () => {
        // wall create (graftable) + door update (not graftable) on the SAME view →
        // the view is demoted to a full reprojection (correctness over speed).
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'create' });
        _emitStoreEvent!({ elementId: 'door-1', elementType: 'door', operation: 'update' });
        await vi.advanceTimersByTimeAsync(400);
        expect(graftCalls).toHaveLength(1);
        expect(graftCalls[0].graftIds).toBeUndefined();
    });
});
