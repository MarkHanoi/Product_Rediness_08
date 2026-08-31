/**
 * @vitest-environment happy-dom
 *
 * W4i RECOVERY — `renders_plan` for CEILING and CURTAIN-WALL, EXECUTED.
 *
 * ─── WHY THE SET COULD NOT BE READ, AND WHY THAT IS NOT THE MEASUREMENT ──────
 * The prior W4i run printed `GEOMETRY_ELEMENT_TYPES = null` and stopped. That is
 * a MEASURED FACT about the module surface, not about the family:
 * `ViewDependencyTracker.ts:80` declares `const GEOMETRY_ELEMENT_TYPES = new Set(`
 * with NO `export`, so the barrel has no such binding. Reading the literal out of
 * the source would in any case only prove a string is in a Set — the audit's own
 * C4 control shows a member (`'stair-railing'`) that MATCHES NOTHING because no
 * store emits that spelling. So this file drives the tracker instead.
 *
 * ─── THE ELEMENT-TYPE STRINGS ARE MEASURED, NOT TRANSCRIBED ─────────────────
 * Both spellings below came off a REAL store's REAL `storeEventBus` emit in a
 * REAL dispatch run, not from a source line:
 *   ceiling      — `probe/w4i/LOG.txt`   `[C-1] storeEventBus ceiling events =
 *                  [{"elementType":"ceiling","operation":"create",...}]`
 *   curtainwall  — `probe/w4i/LOG-R.txt` `[R-3] storeEventBus curtainwall events =
 *                  [{"elementType":"curtainwall","operation":"create",...}]`
 *
 * ─── STUB LEDGER ────────────────────────────────────────────────────────────
 * The four heavy singletons are mocked EXACTLY as
 * `views/__tests__/lightingAndRoomReachThePlanView.test.ts` and
 * `planProjectSplitIncremental.test.ts` mock them. `ViewDependencyTracker` itself
 * is the REAL class, unmocked, and it is the object under measurement.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const invalidate = vi.fn();
const invalidateElement = vi.fn();
const beginSwap = vi.fn((_viewId: string) => 1);
vi.mock('../../../../../packages/core-app-model/src/views/ViewTechnicalDrawingCache', () => ({
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
vi.mock('../../../../../packages/core-app-model/src/views/ViewDefinitionStore', () => ({
    viewDefinitionStore: { getAll: () => _views },
}));

vi.mock('../../../../../packages/core-app-model/src/ElementRegistry', () => ({
    elementRegistry: {
        onUnregister: (_cb: (id: string) => void) => () => {},
        clearedSince: (_ts: number) => false,
    },
}));

vi.mock('../../../../../packages/core-app-model/src/rendering/UnifiedFrameLoop', () => ({
    unifiedFrameLoop: { queueLowPriority: (cb: () => void) => { cb(); } },
}));

type Ev = { elementId: string; elementType: string; operation: string; timestamp?: number };
let _emitStoreEvent: ((e: Ev) => void) | null = null;
vi.mock('../../../../../packages/core-app-model/src/StoreEventBus', () => ({
    storeEventBus: {
        subscribe: (cb: (e: Ev) => void) => {
            _emitStoreEvent = cb;
            return () => { _emitStoreEvent = null; };
        },
    },
    StoreChangeEvent: class {},
}));

import { ViewDependencyTracker } from '../../../../../packages/core-app-model/src/views/ViewDependencyTracker';

const PLAN_L0 = { id: 'vd-plan-l0', viewType: 'plan', spatial: { levelId: 'L0' } };
const PLAN_L1 = { id: 'vd-plan-l1', viewType: 'plan', spatial: { levelId: 'L1' } };

describe('W4i-P — do a CEILING and a CURTAIN-WALL mutation reach the plan view?', () => {
    let tracker: ViewDependencyTracker;
    let reprojected: string[];
    let warn: ReturnType<typeof vi.spyOn>;

    const warnText = (): string =>
        (warn.mock.calls as unknown[][]).map(c => String(c[0])).join(String.fromCharCode(10));

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
        // What §P3.2-CL (initTools.ts:2191) and §G3-STALE-FIX-CW (initTools.ts:2092)
        // do in production — the same call, at the same moment relative to add().
        tracker.registerElement('ceil-1', 'L0');
        tracker.registerElement('cw-1', 'L0');
        tracker.registerElement('water-1', 'L0');
        tracker.onReprojectionNeeded = async (viewId) => { reprojected.push(viewId); };
    });

    afterEach(() => {
        tracker.destroy();
        warn.mockRestore();
        vi.useRealTimers();
    });

    // ── ceiling ─────────────────────────────────────────────────────────────

    it('P-1: a CEILING create (the spelling CeilingStore actually emits) reprojects the plan on that storey', async () => {
        await emitAndSettle({ elementId: 'ceil-1', elementType: 'ceiling', operation: 'create' });
        expect(reprojected).toEqual([PLAN_L0.id]);
        expect(warnText()).not.toContain('§G3-STALE-EVENT');
    });

    it('P-2: a CEILING update reprojects the plan', async () => {
        await emitAndSettle({ elementId: 'ceil-1', elementType: 'ceiling', operation: 'update' });
        expect(reprojected).toEqual([PLAN_L0.id]);
    });

    it('P-3: a CEILING delete reprojects the plan', async () => {
        await emitAndSettle({ elementId: 'ceil-1', elementType: 'ceiling', operation: 'delete' });
        expect(reprojected).toEqual([PLAN_L0.id]);
    });

    // ── curtain wall ────────────────────────────────────────────────────────

    it('P-4: a CURTAINWALL create (the spelling CurtainWallStore actually emits) reprojects the plan', async () => {
        await emitAndSettle({ elementId: 'cw-1', elementType: 'curtainwall', operation: 'create' });
        expect(reprojected).toEqual([PLAN_L0.id]);
        expect(warnText()).not.toContain('§G3-STALE-EVENT');
    });

    it('P-5: a CURTAINWALL update reprojects the plan', async () => {
        await emitAndSettle({ elementId: 'cw-1', elementType: 'curtainwall', operation: 'update' });
        expect(reprojected).toEqual([PLAN_L0.id]);
    });

    it('P-6: a CURTAINWALL delete reprojects the plan', async () => {
        await emitAndSettle({ elementId: 'cw-1', elementType: 'curtainwall', operation: 'delete' });
        expect(reprojected).toEqual([PLAN_L0.id]);
    });

    // ── CONTROLS ────────────────────────────────────────────────────────────

    it('C1 — NEGATIVE: `water` is still DROPPED, so a green row above is not the harness saying yes to everything', async () => {
        await emitAndSettle({ elementId: 'water-1', elementType: 'water', operation: 'create' });
        expect(reprojected).toEqual([]);
        expect(warnText()).not.toContain('§G3-STALE-EVENT');
    });

    it('C2 — NEGATIVE: an UNREGISTERED ceiling id takes the §G3-STALE all-views fallback, so registration is load-bearing', async () => {
        await emitAndSettle({ elementId: 'ceil-never-registered', elementType: 'ceiling', operation: 'create' });
        expect(new Set(reprojected)).toEqual(new Set([PLAN_L0.id, PLAN_L1.id]));
        expect(warnText()).toContain('§G3-STALE-EVENT');
    });

    it('C3 — LEVEL SCOPING: a ceiling on L0 does not dirty the L1 plan', async () => {
        await emitAndSettle({ elementId: 'ceil-1', elementType: 'ceiling', operation: 'create' });
        expect(reprojected).not.toContain(PLAN_L1.id);
    });

    it('C4 — SPELLING: `curtain-wall` (the COMMAND/CEB vocabulary) MISSES the Set; only the store spelling `curtainwall` is live', async () => {
        // The two vocabularies are genuinely different here — CommandEventBridge.ts:694
        // is `case 'curtain-wall.create'`, the plugin id is 'curtain-wall', the storeKey
        // is 'curtainwall'. If any future emitter used the hyphenated spelling on
        // storeEventBus it would be dropped SILENTLY, the way 'stairRailing' is today.
        await emitAndSettle({ elementId: 'cw-1', elementType: 'curtain-wall', operation: 'create' });
        expect(reprojected).toEqual([]);
        expect(warnText()).not.toContain('§G3-STALE-EVENT');
    });
});
