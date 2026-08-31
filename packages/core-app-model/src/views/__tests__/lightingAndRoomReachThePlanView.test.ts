/**
 * @vitest-environment happy-dom
 *
 * §PLAN-MEMBERSHIP-LIGHTING / §PLAN-MEMBERSHIP-ROOM (Wave 4a + 4e, 2026-08-31) —
 * the dispatch→readback probe for the two families this wave moved from
 * "paints, but nothing ever asks it to" to "a mutation dirties the plan view".
 *
 * ─── WHAT THIS PINS, AND WHY IT IS NOT A TAUTOLOGY ──────────────────────────
 * The audit at `audit/element-creation/2026-08-29/` measured `renders_plan` at
 * 15 of 29 families and found `GEOMETRY_ELEMENT_TYPES` — a MEMBERSHIP LIST, not
 * a bug — to be the mechanism behind most of the other 14. Both families here
 * were already PAINTED on every plan repaint:
 *
 *   • lighting — `renderLightingSymbols` (`../symbols/LightingPlanSymbolRenderer`),
 *     called from `PlanViewCanvas._renderLightingPlanSymbols()`;
 *   • room     — `PlanViewCanvas._renderRoomFills()` plus projected linework from
 *     `RoomBoundingLineBuilder` (`'room'` is in
 *     `EdgeProjectorService.CACHEABLE_ELEMENT_TYPES`).
 *
 * …and both already EMITTED on `storeEventBus` (`LightingStore.ts:89` §L-1087;
 * `RoomStore.ts:273/377/415`). The single missing link was INVALIDATION: the
 * tracker dropped every event of those two types one line into `_onStoreEvent`,
 * so placing a lamp or editing a room dirtied NO view and the user saw the
 * change only when some unrelated edit happened to repaint the plan.
 *
 * This suite therefore asserts the link that was missing — a store event of each
 * type reaches the PLAN store (`onReprojectionNeeded` for the plan view on that
 * storey) — and it carries the controls that stop it degenerating into "the Set
 * contains the string I just added to it".
 *
 * CONTROLS, all four executed:
 *   (C1) NEGATIVE — `water` is a family the same audit measured as having NO plan
 *        symbol builder AND no `storeEventBus` emitter at all. It must still be
 *        dropped. A harness that reported everything green would fail here.
 *   (C2) NEGATIVE, and this is the sharper one — an UNREGISTERED lighting id must
 *        NOT take the targeted path; it falls into the §G3-STALE fallback (mark
 *        every non-3D view + warn). This is what makes the registration half of
 *        the pair load-bearing rather than decorative, and it is the regression
 *        the §FT-LIGHTING / §FT-ROOM-PLAN bridges exist to prevent.
 *   (C3) LEVEL SCOPING — a fixture on L0 must not dirty the L1 plan.
 *   (C4) SPELLING — the tracker keys on `StoreChangeEvent.elementType` exactly.
 *        `'stairRailing'` (what `StairRailingStore` actually emits) is NOT the
 *        `'stair-railing'` in the Set, and this suite records that as a measured
 *        MISS rather than pretending the Set covers that family.
 *
 * The heavy singletons are mocked exactly as `planProjectSplitIncremental.test.ts`
 * does, so the tracker's DECISION logic is exercised hermetically.
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
        // Required by the unresolved-level branch (§C13-STALE-AFTER-CLEAR). `false`
        // means "no project clear happened", which routes an unregistered id to the
        // §G3-STALE fallback — the branch control C2 measures.
        clearedSince: (_ts: number) => false,
    },
}));

vi.mock('../../rendering/UnifiedFrameLoop', () => ({
    unifiedFrameLoop: { queueLowPriority: (cb: () => void) => { cb(); } },
}));

type Ev = { elementId: string; elementType: string; operation: string; timestamp?: number };
let _emitStoreEvent: ((e: Ev) => void) | null = null;
vi.mock('../../StoreEventBus', () => ({
    storeEventBus: {
        subscribe: (cb: (e: Ev) => void) => {
            _emitStoreEvent = cb;
            return () => { _emitStoreEvent = null; };
        },
    },
    StoreChangeEvent: class {},
}));

import { ViewDependencyTracker } from '../ViewDependencyTracker';

const PLAN_L0 = { id: 'vd-plan-l0', viewType: 'plan', spatial: { levelId: 'L0' } };
const PLAN_L1 = { id: 'vd-plan-l1', viewType: 'plan', spatial: { levelId: 'L1' } };

describe('§PLAN-MEMBERSHIP — lighting and room mutations reach the plan view', () => {
    let tracker: ViewDependencyTracker;
    let reprojected: string[];
    let warn: ReturnType<typeof vi.spyOn>;

    /** Every string console.warn was called with this test, joined. */
    const warnText = (): string =>
        (warn.mock.calls as unknown[][]).map(c => String(c[0])).join(String.fromCharCode(10));

    /** Emit a store event and run the debounce out to the conservative envelope. */
    async function emitAndSettle(e: Ev): Promise<void> {
        _emitStoreEvent!({ timestamp: Date.now(), ...e });
        await vi.advanceTimersByTimeAsync(400);
    }

    beforeEach(() => {
        vi.useFakeTimers();
        invalidate.mockClear();
        invalidateElement.mockClear();
        beginSwap.mockClear();
        _views = [PLAN_L0, PLAN_L1];
        reprojected = [];
        warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        tracker = new ViewDependencyTracker();
        tracker.init();
        // What the §FT-LIGHTING and §FT-ROOM-PLAN bridges do in production, at the
        // moment they do it: BEFORE the store add() that emits the event.
        tracker.registerElement('lt-1', 'L0');
        tracker.registerElement('room-1', 'L0');
        tracker.registerElement('water-1', 'L0');
        tracker.registerElement('rail-1', 'L0');
        tracker.onReprojectionNeeded = async (viewId) => { reprojected.push(viewId); };
    });

    afterEach(() => {
        tracker.destroy();
        warn.mockRestore();
        vi.useRealTimers();
    });

    // ── lighting ────────────────────────────────────────────────────────────

    it('a lighting CREATE reprojects the plan view on that storey', async () => {
        await emitAndSettle({ elementId: 'lt-1', elementType: 'lighting', operation: 'create' });

        expect(reprojected).toEqual([PLAN_L0.id]);
        // A registered id took the TARGETED path — no §G3-STALE all-views sweep.
        expect(warnText()).not.toContain('§G3-STALE-EVENT');
    });

    it('a lighting UPDATE (a fixture moved / re-typed) reprojects the plan view', async () => {
        await emitAndSettle({ elementId: 'lt-1', elementType: 'lighting', operation: 'update' });
        expect(reprojected).toEqual([PLAN_L0.id]);
    });

    it('a lighting DELETE reprojects the plan view — the symbol must stop being painted', async () => {
        await emitAndSettle({ elementId: 'lt-1', elementType: 'lighting', operation: 'delete' });
        expect(reprojected).toEqual([PLAN_L0.id]);
    });

    // ── room ────────────────────────────────────────────────────────────────

    it('a room CREATE reprojects the plan view on that storey', async () => {
        await emitAndSettle({ elementId: 'room-1', elementType: 'room', operation: 'create' });

        expect(reprojected).toEqual([PLAN_L0.id]);
        expect(warnText()).not.toContain('§G3-STALE-EVENT');
    });

    it('a room UPDATE (rename / re-detect / boundary edit) reprojects the plan view', async () => {
        await emitAndSettle({ elementId: 'room-1', elementType: 'room', operation: 'update' });
        expect(reprojected).toEqual([PLAN_L0.id]);
    });

    it('a room DELETE reprojects the plan view', async () => {
        await emitAndSettle({ elementId: 'room-1', elementType: 'room', operation: 'delete' });
        expect(reprojected).toEqual([PLAN_L0.id]);
    });

    // ── C1: the negative control that proves the harness can say NO ─────────

    it('C1 — `water` is still DROPPED: it has no plan symbol builder, so it must not claim plan', async () => {
        await emitAndSettle({ elementId: 'water-1', elementType: 'water', operation: 'create' });

        // Not merely "not reprojected": the event never reached the level-resolution
        // step at all, so there is no §G3-STALE warn either.
        expect(reprojected).toEqual([]);
        expect(warnText()).not.toContain('§G3-STALE-EVENT');
    });

    // ── C2: registration is load-bearing, not decorative ───────────────────

    it('C2 — an UNREGISTERED lighting id takes the §G3-STALE all-views fallback, which is what the bridge prevents', async () => {
        await emitAndSettle({ elementId: 'lt-never-registered', elementType: 'lighting', operation: 'create' });

        // BOTH plan views, not one — the coarse sweep. This is the regression that
        // adding 'lighting' to the Set WITHOUT registering ids would have shipped,
        // once per fixture (48 per auto-furnish run).
        expect(new Set(reprojected)).toEqual(new Set([PLAN_L0.id, PLAN_L1.id]));
        expect(warnText()).toContain('§G3-STALE-EVENT');
    });

    // ── C3: level scoping ──────────────────────────────────────────────────

    it('C3 — a fixture on L0 does not dirty the L1 plan', async () => {
        await emitAndSettle({ elementId: 'lt-1', elementType: 'lighting', operation: 'create' });
        expect(reprojected).not.toContain(PLAN_L1.id);
    });

    // ── C4: the measured spelling miss, recorded rather than papered over ──

    it('C4 — `stairRailing` (what StairRailingStore actually emits) MISSES the Set: the member is spelled `stair-railing`', async () => {
        await emitAndSettle({ elementId: 'rail-1', elementType: 'stairRailing', operation: 'create' });
        // Dropped at the membership check — no reprojection, no fallback warn.
        expect(reprojected).toEqual([]);

        // …while the hyphenated spelling in the Set does pass the check. Nothing in
        // production emits it on `storeEventBus` (it is a `userData.elementType`
        // value), so this half is the proof the miss is a SPELLING gap and not an
        // intentional exclusion.
        await emitAndSettle({ elementId: 'rail-1', elementType: 'stair-railing', operation: 'create' });
        expect(reprojected).toEqual([PLAN_L0.id]);
    });
});
