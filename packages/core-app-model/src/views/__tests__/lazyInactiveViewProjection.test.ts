/**
 * @vitest-environment happy-dom
 *
 * §FIX-LAZY-INACTIVE-VIEW-PROJECTION (L-117 / L-118 / L-121, C04 §3.3 / DOC-1.4).
 *
 * ROOT CAUSE this suite pins: `ViewDependencyTracker._getAffectedViews()` marks
 * EVERY section/elevation view dirty on any geometry change, and `_flush()`
 * eagerly reprojected them all. With the four always-present L-110 default
 * elevations (§FEAT-DEFAULT-ELEVATIONS), a single edit produced the observed
 * `flush — 5 dirty view(s): vd-sys-p, vd-sys-e ×4`, and each elevation re-exported
 * the WHOLE model (`No levelId — exporting all N elements`). On a 2000+ element
 * tower that is 4×full-tower reprojections per edit → WebGPU device-loss crash on
 * first navigation (L-117) and the wall+door-move main-thread freeze (L-121).
 *
 * The fix: an INACTIVE view is marked dirty but its reprojection is DEFERRED
 * (never invoked) until the view is actually activated; only the ACTIVE view
 * reprojects eagerly. `notifyViewActivated(viewId)` triggers exactly one full
 * reprojection of a view that accumulated deferred dirty state.
 *
 * The heavy singletons (OBC-importing cache, view store, frame loop, registry) are
 * mocked so the tracker's DECISION logic is exercised hermetically — identical
 * harness to `wallMovePlanReprojectionDefer.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock the OBC-importing cache + the other singleton collaborators. ──────────
const invalidate = vi.fn();
const invalidateElement = vi.fn();
const cacheGet = vi.fn(() => null);
vi.mock('../ViewTechnicalDrawingCache', () => ({
    viewTechnicalDrawingCache: {
        invalidate: (viewId: string) => invalidate(viewId),
        invalidateElement: (viewId: string, elementId: string) => invalidateElement(viewId, elementId),
        get: (viewId: string) => cacheGet(viewId),
        clear: () => {},
        beginProjection: () => 1,
        setIfCurrent: () => true,
    },
}));

let _views: Array<{ id: string; viewType: string; spatial: { levelId?: string } }> = [];
vi.mock('../ViewDefinitionStore', () => ({
    viewDefinitionStore: {
        getAll: () => _views,
        get: (id: string) => _views.find(v => v.id === id),
    },
}));

vi.mock('../../ElementRegistry', () => ({
    elementRegistry: { onUnregister: (_cb: (id: string) => void) => () => {} },
}));

// Run queued flushes synchronously so we can assert without a real frame loop.
vi.mock('../../rendering/UnifiedFrameLoop', () => ({
    unifiedFrameLoop: { queueLowPriority: (cb: () => void) => { cb(); } },
}));

// OTel helper is a no-op span emitter — stub it so no provider wiring is needed.
vi.mock('../otel', () => ({
    emitViewProjectionEvent: () => {},
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

// ── The founder's scene: one plan on L0 + the four L-110 default elevations. ──
const PLAN = { id: 'vd-sys-p', viewType: 'plan', spatial: { levelId: 'L0' } };
const ELEV_N = { id: 'vd-sys-elev-north', viewType: 'elevation', spatial: {} };
const ELEV_E = { id: 'vd-sys-elev-east',  viewType: 'elevation', spatial: {} };
const ELEV_S = { id: 'vd-sys-elev-south', viewType: 'elevation', spatial: {} };
const ELEV_W = { id: 'vd-sys-elev-west',  viewType: 'elevation', spatial: {} };
const ALL_ELEVS = [ELEV_N, ELEV_E, ELEV_S, ELEV_W];

function setDrag(on: boolean): void {
    (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = on;
}

describe('§FIX-LAZY-INACTIVE-VIEW-PROJECTION — inactive views defer; only the active view reprojects', () => {
    let tracker: ViewDependencyTracker;
    let projected: string[];
    /** Set of viewIds the predicate reports VISIBLE. Mutable per-test. */
    let activeViewIds: Set<string>;

    beforeEach(() => {
        vi.useFakeTimers();
        invalidate.mockClear();
        invalidateElement.mockClear();
        cacheGet.mockClear();
        _views = [PLAN, ...ALL_ELEVS];
        setDrag(false);
        projected = [];
        activeViewIds = new Set<string>();
        tracker = new ViewDependencyTracker();
        tracker.init();
        tracker.setActiveViewPredicate((viewId) => activeViewIds.has(viewId));
        tracker.onReprojectionNeeded = async (viewId) => { projected.push(viewId); };
        tracker.registerElement('wall-1', 'L0');
        tracker.registerElement('door-1', 'L0');
    });
    afterEach(() => {
        tracker.destroy();
        vi.useRealTimers();
        setDrag(false);
    });

    it('3D view active (no 2D view visible): an edit dirties the 4 elevations but projects NONE', async () => {
        // 3D is active → NO 2D documentation view is visible → activeViewIds empty.
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        await vi.advanceTimersByTimeAsync(400);

        // The core assertion: the 4 elevations' projection was NOT invoked at all.
        expect(projected).toHaveLength(0);
        for (const elev of ALL_ELEVS) expect(projected).not.toContain(elev.id);
    });

    it('activating a deferred elevation projects it exactly once', async () => {
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        await vi.advanceTimersByTimeAsync(400);
        expect(projected).toHaveLength(0);

        // User opens the west elevation → it must project once (and only once).
        activeViewIds.add(ELEV_W.id);
        tracker.notifyViewActivated(ELEV_W.id);
        await vi.advanceTimersByTimeAsync(400);

        expect(projected).toEqual([ELEV_W.id]);

        // Re-activating with no new dirtying does nothing (no deferred state left).
        tracker.notifyViewActivated(ELEV_W.id);
        await vi.advanceTimersByTimeAsync(400);
        expect(projected).toEqual([ELEV_W.id]);
    });

    it('plan active: an edit reprojects ONLY the plan; the 4 elevations defer', async () => {
        activeViewIds.add(PLAN.id);

        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        await vi.advanceTimersByTimeAsync(400);

        expect(projected).toEqual([PLAN.id]);
        for (const elev of ALL_ELEVS) expect(projected).not.toContain(elev.id);
    });

    it('L-121: wall + hosted door + wall MOVE with 3D active → 0 elevation projections, bounded work', async () => {
        // Reproduce the freeze scenario: a wall move fans out many intermediate
        // store events (wall rebuild + hosted-door opening update + room redetect).
        // With 3D active (no visible 2D view) NOTHING must reproject during the move.

        // ── Drag in flight: per-mousemove wall updates are dropped (existing guard). ─
        setDrag(true);
        for (let i = 0; i < 30; i++) {
            _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        }
        // Drag-end authoritative commits: wall rebuild + hosted door update.
        setDrag(false);
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        _emitStoreEvent!({ elementId: 'door-1', elementType: 'door', operation: 'update' });
        await vi.advanceTimersByTimeAsync(400);

        // ZERO reprojections — the 5-view (plan + 4 elevation) fan-out that froze the
        // main thread is fully eliminated while the 3D view is the active surface.
        expect(projected).toHaveLength(0);

        // The elevations still reproject correctly the moment one is opened (L-110).
        activeViewIds.add(ELEV_N.id);
        tracker.notifyViewActivated(ELEV_N.id);
        await vi.advanceTimersByTimeAsync(400);
        expect(projected).toEqual([ELEV_N.id]);
    });

    it('a deferred inactive view is not double-projected by repeated edits while inactive', async () => {
        // Several edits arrive while the elevations are inactive.
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        await vi.advanceTimersByTimeAsync(400);
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        await vi.advanceTimersByTimeAsync(400);
        expect(projected).toHaveLength(0);

        // Activate once → exactly one projection despite two intervening edits.
        activeViewIds.add(ELEV_S.id);
        tracker.notifyViewActivated(ELEV_S.id);
        await vi.advanceTimersByTimeAsync(400);
        expect(projected).toEqual([ELEV_S.id]);
    });

    it('NO predicate wired (headless/legacy): every dirty view reprojects — no regression', async () => {
        tracker.setActiveViewPredicate(null);
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        await vi.advanceTimersByTimeAsync(400);

        // Legacy eager behaviour: plan + all 4 elevations projected.
        expect(projected).toContain(PLAN.id);
        for (const elev of ALL_ELEVS) expect(projected).toContain(elev.id);
        expect(projected).toHaveLength(5);
    });
});
