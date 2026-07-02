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
vi.mock('../ViewTechnicalDrawingCache', () => ({
    viewTechnicalDrawingCache: {
        invalidate: (viewId: string) => invalidate(viewId),
        invalidateElement: (viewId: string, elementId: string) => invalidateElement(viewId, elementId),
        clear: () => {},
        beginProjection: () => 1,
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

    it('a create/delete (element-set change) takes the coarse whole-drawing invalidate', () => {
        setDrag(false);
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'create' });
        vi.advanceTimersByTime(400);
        expect(invalidate).toHaveBeenCalledTimes(1);
        expect(invalidate).toHaveBeenCalledWith(PLAN_VIEW.id);
        expect(invalidateElement).not.toHaveBeenCalled();
    });
});
