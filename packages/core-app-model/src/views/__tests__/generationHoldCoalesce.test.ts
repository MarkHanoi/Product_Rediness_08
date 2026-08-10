/**
 * @vitest-environment happy-dom
 *
 * §GEN-VIEW-COALESCE (audit GENERATIVE-PIPELINE-AUDIT-2026-08-10 §3 / P1-1, C04/C10) —
 * lease-scoped view-invalidation coalescing.
 *
 * THE FINDING this suite pins: every chained generation pass (apartment → ceiling →
 * furnish → lighting) ended its sub-batch with a `markLevelsDirtyImmediate` that
 * coarse-invalidated 5-6 views — 4+ FULL re-projection waves per generation. The fix
 * holds invalidation for the whole `beginBuildingGeneration` lease and flushes ONCE at
 * release.
 *
 * ⚠ L-716 class ("can this gate ever be true?"): the suite PROVES the release path —
 * both the normal end and the tracker's own watchdog — so an aborted generation can
 * never leave views permanently frozen.
 *
 * Heavy singletons are mocked exactly as in wallMovePlanReprojectionDefer.test.ts so the
 * tracker's decision logic runs hermetically.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invalidate = vi.fn();
const invalidateElement = vi.fn();
const beginSwap = vi.fn((_viewId: string) => 1);
vi.mock('../ViewTechnicalDrawingCache', () => ({
    viewTechnicalDrawingCache: {
        invalidate: (viewId: string) => invalidate(viewId),
        invalidateElement: (viewId: string, elementId: string) => invalidateElement(viewId, elementId),
        clear: () => {},
        beginProjection: () => 1,
        beginSwap: (viewId: string) => beginSwap(viewId),
        setIfCurrent: () => true,
    },
}));

let _views: Array<{ id: string; viewType: string; spatial: { levelId?: string } }> = [];
vi.mock('../ViewDefinitionStore', () => ({
    viewDefinitionStore: { getAll: () => _views },
}));

vi.mock('../../ElementRegistry', () => ({
    elementRegistry: {
        onUnregister: (_cb: (id: string) => void) => () => {},
        clearedSince: () => false,
    },
}));

// Run queued flushes synchronously so assertions need no real frame loop.
vi.mock('../../rendering/UnifiedFrameLoop', () => ({
    unifiedFrameLoop: { queueLowPriority: (cb: () => void) => { cb(); } },
}));

let _emitStoreEvent: ((e: { elementId: string; elementType: string; operation: string; timestamp?: number }) => void) | null = null;
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

// One plan view per level + four always-affected elevations (the audit's 5-6 view fan-out).
const PLAN_L0 = { id: 'planview-L0', viewType: 'plan', spatial: { levelId: 'L0' } };
const PLAN_L1 = { id: 'planview-L1', viewType: 'plan', spatial: { levelId: 'L1' } };
const ELEVS = ['n', 'e', 's', 'w'].map((d) => ({ id: `elev-${d}`, viewType: 'elevation', spatial: {} as { levelId?: string } }));

describe('§GEN-VIEW-COALESCE — generation-lease view-invalidation hold', () => {
    let tracker: ViewDependencyTracker;

    beforeEach(() => {
        vi.useFakeTimers();
        invalidate.mockClear();
        invalidateElement.mockClear();
        beginSwap.mockClear();
        _views = [PLAN_L0, PLAN_L1, ...ELEVS];
        tracker = new ViewDependencyTracker();
        tracker.init();
        tracker.registerElement('wall-1', 'L1');
    });
    afterEach(() => {
        tracker.endGenerationHold();   // never leak a hold across tests
        tracker.destroy();
        vi.useRealTimers();
    });

    it('outside a generation, markLevelsDirtyImmediate flushes immediately (zero behavior change)', () => {
        tracker.markLevelsDirtyImmediate(['L1']);
        // planview-L1 + 4 elevations take a swap generation each — one wave.
        expect(beginSwap).toHaveBeenCalledTimes(5);
    });

    it('4 chained sub-batch ends + tail store events during the hold ⇒ ZERO waves; release ⇒ exactly ONE', () => {
        tracker.beginGenerationHold();
        expect(tracker.isGenerationHoldActive).toBe(true);

        // The 4 chained passes (apartment/ceiling/furnish/lighting) each end their batch.
        for (let pass = 0; pass < 4; pass++) tracker.markLevelsDirtyImmediate(['L0', 'L1']);
        // Non-batched finish-chain tail events land too (glass/PBR, finish sync).
        for (let i = 0; i < 50; i++) {
            _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update', timestamp: Date.now() });
        }
        vi.advanceTimersByTime(1_000);      // past every debounce envelope
        expect(beginSwap).not.toHaveBeenCalled();
        expect(invalidate).not.toHaveBeenCalled();
        expect(invalidateElement).not.toHaveBeenCalled();

        // Release: ONE coalesced wave covering both levels' plans + the 4 elevations.
        tracker.endGenerationHold();
        expect(tracker.isGenerationHoldActive).toBe(false);
        const flushedViews = new Set(beginSwap.mock.calls.map((c) => c[0]));
        expect(flushedViews).toEqual(new Set(['planview-L0', 'planview-L1', 'elev-n', 'elev-e', 'elev-s', 'elev-w']));
        expect(beginSwap).toHaveBeenCalledTimes(6);   // one swap per view — ONE wave, not 4

        // Idempotent: a second end flushes nothing more.
        tracker.endGenerationHold();
        expect(beginSwap).toHaveBeenCalledTimes(6);
    });

    it('release with nothing held flushes nothing (an aborted pre-build generation)', () => {
        tracker.beginGenerationHold();
        tracker.endGenerationHold();
        vi.advanceTimersByTime(1_000);
        expect(beginSwap).not.toHaveBeenCalled();
    });

    it('L-716 guarantee — the watchdog force-ends a hold whose lease never released', () => {
        tracker.beginGenerationHold();
        tracker.markLevelsDirtyImmediate(['L1']);
        expect(beginSwap).not.toHaveBeenCalled();

        // The lease's own hard cap is 6 min; the tracker's watchdog fires at 7 min.
        vi.advanceTimersByTime(7 * 60_000 + 1);
        expect(tracker.isGenerationHoldActive).toBe(false);
        // The held level still flushed — views were never left frozen OR stale.
        expect(beginSwap.mock.calls.map((c) => c[0])).toContain('planview-L1');
    });

    it('markDirty / notifyViewActivated BYPASS the hold (a view opened mid-generation still projects)', () => {
        tracker.beginGenerationHold();
        tracker.markDirty('planview-L0');
        vi.advanceTimersByTime(1_000);     // debounced explicit markDirty flushes normally
        expect(beginSwap.mock.calls.map((c) => c[0])).toContain('planview-L0');
    });
});
