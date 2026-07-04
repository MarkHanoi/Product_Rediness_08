/**
 * @vitest-environment happy-dom
 *
 * §FIX-PLAN-PROJECT-SPLIT-INCREMENTAL (L-89, C04 §3.3 / DOC-1.4).
 *
 * In SPLIT view the main viewport is 3D, so PlanViewManager (the snappy 30 ms
 * `_onProjectionStale` driver) is INACTIVE — the secondary plan pane is reprojected
 * ONLY by ViewDependencyTracker._flush → onReprojectionNeeded. The old flat 300 ms
 * debounce made that pane feel like it "waited behind the scenes" before reacting to a
 * create (perceptible before the 2nd click of wall creation).
 *
 * FIX: a purely GRAFT-ELIGIBLE flush (every dirty view touched only by create/update of a
 * pure-projection type — wall/slab/beam/ceiling/floor) flushes on the FAST (~48 ms)
 * envelope, so the split plan reacts near-instantly and grafts ONLY the new element
 * (element-scoped `invalidateElement`, warm drawing kept). Coarse / mixed / batch changes
 * keep the conservative 300 ms envelope. Accuracy is unchanged — only the latency.
 *
 * The heavy singletons are mocked (mirrors wallMovePlanReprojectionDefer.test.ts) so the
 * tracker's DECISION + timing logic is exercised hermetically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

vi.mock('../../rendering/UnifiedFrameLoop', () => ({
    unifiedFrameLoop: { queueLowPriority: (cb: () => void) => { cb(); } },
}));

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

const PLAN_VIEW = { id: 'vd-sys-plan-l0', viewType: 'plan', spatial: { levelId: 'L0' } };

function setDrag(on: boolean): void {
    (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = on;
}

describe('§FIX-PLAN-PROJECT-SPLIT-INCREMENTAL — split-view plan reacts fast + element-scoped', () => {
    let tracker: ViewDependencyTracker;
    let graftCalls: Array<{ viewId: string; graftIds: ReadonlySet<string> | undefined }>;

    beforeEach(() => {
        vi.useFakeTimers();
        invalidate.mockClear();
        invalidateElement.mockClear();
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

    it('a graft-eligible wall create flushes on the FAST (~48 ms) envelope — no 300 ms wait', async () => {
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'create' });

        // Not yet flushed just before the fast envelope.
        await vi.advanceTimersByTimeAsync(40);
        expect(graftCalls).toHaveLength(0);

        // Fires by ~48 ms — the split plan reacts near-instantly, well before 300 ms.
        await vi.advanceTimersByTimeAsync(20); // now ~60 ms total
        expect(graftCalls).toHaveLength(1);
        expect(graftCalls[0].viewId).toBe(PLAN_VIEW.id);
        // Element-scoped incremental projection of ONLY the new wall (drawing kept warm).
        expect(invalidateElement).toHaveBeenCalledWith(PLAN_VIEW.id, 'wall-1');
        expect(invalidate).not.toHaveBeenCalled();
        // Graft set carries ONLY the created wall.
        expect([...(graftCalls[0].graftIds ?? [])]).toEqual(['wall-1']);
    });

    it('a coarse change (door create) keeps the conservative 300 ms envelope', async () => {
        _emitStoreEvent!({ elementId: 'door-1', elementType: 'door', operation: 'create' });

        // Must NOT flush on the fast envelope — a door adds a whole-view symbol pass (coarse).
        await vi.advanceTimersByTimeAsync(60);
        expect(graftCalls).toHaveLength(0);

        // Flushes on the full 300 ms envelope, as a full (non-graft) reprojection.
        await vi.advanceTimersByTimeAsync(260); // ~320 ms total
        expect(graftCalls).toHaveLength(1);
        expect(graftCalls[0].graftIds).toBeUndefined();
        expect(invalidate).toHaveBeenCalledWith(PLAN_VIEW.id);
    });

    it('a delete keeps the 300 ms envelope (coarse whole-drawing invalidate)', async () => {
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'delete' });
        await vi.advanceTimersByTimeAsync(60);
        expect(graftCalls).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(260);
        expect(graftCalls).toHaveLength(1);
        expect(invalidate).toHaveBeenCalledWith(PLAN_VIEW.id);
    });

    it('a wall create mixed with a door update on the same view is DEMOTED to the 300 ms envelope', async () => {
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'create' });
        _emitStoreEvent!({ elementId: 'door-1', elementType: 'door', operation: 'update' });
        // The door update makes the view graft-ineligible → no fast flush.
        await vi.advanceTimersByTimeAsync(60);
        expect(graftCalls).toHaveLength(0);
        await vi.advanceTimersByTimeAsync(260);
        expect(graftCalls).toHaveLength(1);
        expect(graftCalls[0].graftIds).toBeUndefined();
    });
});
