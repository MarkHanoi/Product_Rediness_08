/**
 * @vitest-environment happy-dom
 *
 * §FIX-SPLIT-VIEW-PERF-SAFE (L-315, spike L-307 Fix 2) — ROOM-DECOUPLING guard.
 *
 * A room contributes ZERO linework to the EdgeProjectorService TechnicalDrawing
 * (C24 / C24.1 — a room is semantic/overlay, not plan drawing geometry). It is
 * painted as a separate overlay every PlanViewManager frame tick, so a room
 * mutation needs no cache invalidation and MUST NOT trigger a full whole-view
 * re-projection.
 *
 * THE TOOTH (red-first): `ViewTechnicalDrawingCache._onStoreChange` dispatches
 * `vd:projection-stale` on `window` for any non-view, non-annotation element
 * write — that event is what drives a full plan re-projection. Without the
 * `room` skip a room create/update/redetect dispatches `vd:projection-stale`
 * with `elementType='room'` (RED). With the skip it dispatches ZERO such events
 * for a room — while a WALL write STILL dispatches (the regression fence).
 *
 * "The drawing still renders" is vacuous; the assertion here is the negative:
 * a room write produces NO `vd:projection-stale`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
// Use the module-level SINGLETON, which subscribes to storeEventBus exactly once
// at import. Constructing fresh caches per-test would leak subscribers (the bus
// is a process-wide singleton with no per-instance teardown here), inflating the
// wall-fence count. One subscriber → one dispatch.
import { viewTechnicalDrawingCache } from '../ViewTechnicalDrawingCache';
import { storeEventBus } from '../../StoreEventBus';

describe('§FIX-SPLIT-VIEW-PERF-SAFE (L-315) — room store writes must not reproject the plan', () => {
    // Reference the singleton so its constructor-time subscription is live.
    void viewTechnicalDrawingCache;
    let staleEvents: Array<{ elementId?: string; elementType?: string; operation?: string }>;
    let listener: (e: Event) => void;

    beforeEach(() => {
        staleEvents = [];
        listener = (e: Event) => {
            staleEvents.push((e as CustomEvent).detail);
        };
        window.addEventListener('vd:projection-stale', listener);
    });

    afterEach(() => {
        window.removeEventListener('vd:projection-stale', listener);
    });

    it('a room CREATE dispatches NO vd:projection-stale (the tooth)', () => {
        storeEventBus.emit({ elementId: 'room-1', elementType: 'room', operation: 'create', timestamp: Date.now() });
        expect(staleEvents.filter(d => d?.elementType === 'room')).toHaveLength(0);
        expect(staleEvents).toHaveLength(0);
    });

    it('a room UPDATE dispatches NO vd:projection-stale', () => {
        storeEventBus.emit({ elementId: 'room-1', elementType: 'room', operation: 'update', timestamp: Date.now() });
        expect(staleEvents.filter(d => d?.elementType === 'room')).toHaveLength(0);
    });

    it('a room DELETE dispatches NO vd:projection-stale (REDETECT_ROOMS churn)', () => {
        storeEventBus.emit({ elementId: 'room-1', elementType: 'room', operation: 'delete', timestamp: Date.now() });
        expect(staleEvents.filter(d => d?.elementType === 'room')).toHaveLength(0);
    });

    it('REGRESSION FENCE — a WALL write STILL dispatches vd:projection-stale (walls ARE linework)', () => {
        storeEventBus.emit({ elementId: 'wall-1', elementType: 'wall', operation: 'create', timestamp: Date.now() });
        const wallStale = staleEvents.filter(d => d?.elementType === 'wall');
        expect(wallStale).toHaveLength(1);
        expect(wallStale[0]?.elementId).toBe('wall-1');
    });
});
