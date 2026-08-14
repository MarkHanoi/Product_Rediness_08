/**
 * @vitest-environment happy-dom
 *
 * §DIAG-3D-STALE-AFTER-WALL-MOVE — REFUTATION PIN.
 *
 * Founder, live build 46232e2d: *"user moves a wall in 3d — in plan view renders
 * correctly, but seems like the 3d environment did not catch up with the change"*,
 * and the differential they ran afterwards: *"once the user creates a window on the
 * wall — in plan view — the wall in 3d comes to the updated place"*.
 *
 * The console line that looked like the culprit was:
 *
 *     [ViewDependencyTracker] flush — 1 active dirty view(s): vd-sys-p (+4 deferred inactive)
 *
 * The obvious reading — "the 3D pane is one of the four views classified INACTIVE, so
 * its rebuild is deferred and the user sees stale geometry" — IS FALSE, and this suite
 * exists so nobody spends another session acting on it.
 *
 * `ViewDependencyTracker._getAffectedViews()` skips `viewType === '3d'` UNCONDITIONALLY
 * (§PERF-3D-SKIP). A 3D view is therefore never dirty, never deferred, never flushed and
 * never force-projected — it is structurally OUTSIDE this class. The "+4 deferred
 * inactive" are the four L-110 default elevations (§FEAT-DEFAULT-ELEVATIONS), exactly as
 * `lazyInactiveViewProjection.test.ts` documents.
 *
 * CONSEQUENCE, and the reason this is a test rather than a comment: no change to the
 * active/inactive predicate, to `notifyViewActivated`, or to split-pane registration can
 * make a stale 3D viewport refresh. The 3D viewport displays the LIVE THREE.js scene; its
 * refresh path is the wall mesh rebuild (WallRebuildCoordinator → WallFragmentBuilder),
 * not 2D edge re-projection. Any fix for the founder's defect belongs THERE.
 *
 * Same hermetic harness as `lazyInactiveViewProjection.test.ts`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invalidate = vi.fn();
const invalidateElement = vi.fn();
const beginSwap = vi.fn((_viewId: string) => 1);
vi.mock('../ViewTechnicalDrawingCache', () => ({
    viewTechnicalDrawingCache: {
        invalidate: (viewId: string) => invalidate(viewId),
        invalidateElement: (viewId: string, elementId: string) => invalidateElement(viewId, elementId),
        get: () => null,
        clear: () => {},
        beginProjection: () => 1,
        beginSwap: (viewId: string) => beginSwap(viewId),
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
    elementRegistry: {
        onUnregister: (_cb: (id: string) => void) => () => {},
        clearedSince: () => false,
    },
}));

vi.mock('../../rendering/UnifiedFrameLoop', () => ({
    unifiedFrameLoop: { queueLowPriority: (cb: () => void) => { cb(); } },
}));

vi.mock('../otel', () => ({ emitViewProjectionEvent: () => {} }));

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

// The founder's split-view scene: a plan pane, a 3D pane, and the four default elevations.
const PLAN   = { id: 'vd-sys-p',   viewType: 'plan',      spatial: { levelId: 'L0' } };
const VIEW3D = { id: 'vd-sys-3d',  viewType: '3d',        spatial: { levelId: 'L0' } };
const ELEVS  = ['north', 'east', 'south', 'west'].map(d => ({
    id: `vd-sys-elev-${d}`, viewType: 'elevation', spatial: {} as { levelId?: string },
}));

function setDrag(on: boolean): void {
    (window as unknown as { __wallDragInProgress?: boolean }).__wallDragInProgress = on;
}

describe('§DIAG-3D-STALE-AFTER-WALL-MOVE — the 3D view is structurally outside ViewDependencyTracker', () => {
    let tracker: ViewDependencyTracker;
    let projected: string[];
    let activeViewIds: Set<string>;

    beforeEach(() => {
        vi.useFakeTimers();
        invalidate.mockClear();
        invalidateElement.mockClear();
        beginSwap.mockClear();
        _views = [PLAN, VIEW3D, ...ELEVS];
        setDrag(false);
        projected = [];
        activeViewIds = new Set<string>();
        tracker = new ViewDependencyTracker();
        tracker.init();
        tracker.setActiveViewPredicate(viewId => activeViewIds.has(viewId));
        tracker.onReprojectionNeeded = async (viewId) => { projected.push(viewId); };
        tracker.registerElement('wall-1', 'L0');
    });
    afterEach(() => {
        tracker.destroy();
        vi.useRealTimers();
        setDrag(false);
    });

    it('a wall MOVE never dirties the 3D view — even with the plan pane active and visible', async () => {
        // Split view: BOTH panes mounted and visible. This is the founder's layout.
        activeViewIds.add(PLAN.id);
        activeViewIds.add(VIEW3D.id);

        // The settled drag-end baseline commit.
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        await vi.advanceTimersByTimeAsync(400);

        // The plan re-projects — this is the half the founder sees working.
        expect(projected).toContain(PLAN.id);
        // The 3D view is NOT projected, and crucially it is not DEFERRED either:
        // it was never a candidate. Marking the split panes "active" changes nothing.
        expect(projected).not.toContain(VIEW3D.id);
        expect(invalidate).not.toHaveBeenCalledWith(VIEW3D.id);
        expect(invalidateElement).not.toHaveBeenCalledWith(VIEW3D.id, 'wall-1');
        expect(beginSwap).not.toHaveBeenCalledWith(VIEW3D.id);
    });

    it('a WINDOW create (the coarse path that visibly fixed the founder\'s 3D) also never touches the 3D view', async () => {
        // The founder's differential: creating a window made the 3D snap to the correct
        // place. If the tracker were the mechanism, the window create would have to reach
        // the 3D view. It does not — so whatever refreshed the 3D happened elsewhere.
        activeViewIds.add(PLAN.id);
        activeViewIds.add(VIEW3D.id);
        tracker.registerElement('window-1', 'L0');

        _emitStoreEvent!({ elementId: 'window-1', elementType: 'window', operation: 'create' });
        await vi.advanceTimersByTimeAsync(400);

        expect(projected).toContain(PLAN.id);
        expect(projected).not.toContain(VIEW3D.id);
    });

    it('notifyViewActivated() on the 3D view is a no-op — there is no wake-up path to reach', async () => {
        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        await vi.advanceTimersByTimeAsync(400);
        projected.length = 0;

        activeViewIds.add(VIEW3D.id);
        tracker.notifyViewActivated(VIEW3D.id);
        await vi.advanceTimersByTimeAsync(400);

        // Nothing deferred for it ⇒ nothing to flush. "Activate the 3D pane" cannot be
        // the fix for a stale 3D viewport.
        expect(projected).toHaveLength(0);
    });

    it('the "+N deferred inactive" in the founder log are the ELEVATIONS, not the 3D pane', async () => {
        // Only the plan pane is visible; the elevations are closed.
        activeViewIds.add(PLAN.id);

        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        await vi.advanceTimersByTimeAsync(400);

        expect(projected).toEqual([PLAN.id]);

        // Each deferred view wakes on activation — and all four are elevations.
        for (const elev of ELEVS) {
            activeViewIds.add(elev.id);
            tracker.notifyViewActivated(elev.id);
            await vi.advanceTimersByTimeAsync(400);
        }
        expect(projected.slice(1).sort()).toEqual(ELEVS.map(e => e.id).sort());
        expect(projected).not.toContain(VIEW3D.id);
    });

    it('even with NO predicate wired (legacy eager-for-all), the 3D view still never projects', async () => {
        // Proves the exclusion is structural (§PERF-3D-SKIP in _getAffectedViews), not a
        // consequence of the active/inactive classification the prime lead pointed at.
        tracker.setActiveViewPredicate(null);

        _emitStoreEvent!({ elementId: 'wall-1', elementType: 'wall', operation: 'update' });
        await vi.advanceTimersByTimeAsync(400);

        expect(projected).toContain(PLAN.id);
        for (const elev of ELEVS) expect(projected).toContain(elev.id);
        expect(projected).not.toContain(VIEW3D.id);
        expect(projected).toHaveLength(5);   // plan + 4 elevations. Never 6.
    });
});
