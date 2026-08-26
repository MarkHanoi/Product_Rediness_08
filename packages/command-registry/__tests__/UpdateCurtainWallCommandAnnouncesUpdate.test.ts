// §CWLEVEL149 (L-12460) — THE FOUNDER, verbatim, on his 462-element/7-level demo
// project: "now i have updated all curtain walls via RAC to another type... and i
// have isolated a level but all curtain walls from other levels poped up - why? I
// have selected a CW from level 3 and the data is correct - level 3 - so the levels
// seems correct - not sure where the corruption might be?"
//
// MEASURED, not assumed (see the lane's own investigation): the geometry record's
// `levelId` is untouched by a curtain-wall type swap end to end — the RAC bulk
// swap fans out N `UpdateCurtainWallCommand`s (one per wall, via
// `element.changeType`'s curtain-wall branch, `initBusHandlers.ts:2211`), and
// `resolveCurtainWallTypeFields()` (core-app-model/CurtainWallTypeStore.ts:560)
// never writes `levelId`. A dedicated end-to-end reproduction against the REAL
// `CurtainWallStore` + `CurtainWallBuilder` + `elementRegistry` +
// `LevelIsolationResolver` (apps/editor/__tests__/
// CurtainWallBulkTypeSwapPreservesLevelIsolation.test.ts) confirms the record, the
// rebuilt mesh's `userData.levelId`, and the level-isolation decision all agree
// before AND after a bulk swap.
//
// THE ACTUAL GAP: `UpdateCurtainWallCommand` — the ONLY writer of a curtain wall's
// geometry record on an update (§Critical #9 in this file's own header) — never
// announced the write. `CreateCurtainWallCommand` (this directory) has always
// paired `bim-curtainwall-added`/`-removed` with a window event, but the sibling
// event `bim-curtainwall-updated` was not even declared in
// `packages/event-bus/src/catalog.ts`, so no command could type-check emitting it.
// `UnifiedBrowserPanel.ts:154` (the Project Browser "Curtain Walls" category list —
// exactly the "ELEMENTS > Curtain Walls 90" list the founder screenshotted) and
// `SchedulePanel.ts:45` have been listening for an event that could never fire.
//
// So the geometry record was never wrong (the properties panel's live re-read on
// selection proves that), and the Project Browser was never told to re-read it —
// a reachability gap (§committed-is-not-reachable), not a second data authority.
//
// This is the regression guard for the fix: `UpdateCurtainWallCommand` now
// announces every write it makes (execute AND undo), routed through
// `batchCoordinator` exactly the way `bim-curtainwall-added` already is, so a
// 90-wall RAC batch fires the event ONCE, not 90 times.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateCurtainWallCommand } from '../src/curtainwall/UpdateCurtainWallCommand';
import { batchCoordinator } from '@pryzm/core-app-model';
import type { CommandContext } from '../src/types';
import type { CurtainWallData } from '@pryzm/geometry-curtain-wall';

const CW_ID = 'cw-announce-1';

function makeCtx(id: string = CW_ID): { ctx: CommandContext; store: { get(id: string): CurtainWallData | undefined }; id: string } {
    const record: CurtainWallData = {
        id,
        type: 'curtain-wall',
        levelId: 'L3',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 6, y: 0, z: 0 }],
        height: 3.2,
        baseOffset: 0,
        gridXSpacing: 1.5,
        gridYSpacing: 1.5,
        mullionSize: 0.05,
        panelThickness: 0.024,
        mullionColor: '#888888',
        properties: {},
    } as unknown as CurtainWallData;

    const map = new Map<string, CurtainWallData>([[id, record]]);
    const curtainWallStore = {
        get(cwId: string) { const v = map.get(cwId); return v ? { ...v } : undefined; },
        set(cwId: string, v: CurtainWallData) { map.set(cwId, { ...v }); },
        update(cwId: string, patch: Partial<CurtainWallData>) {
            const v = map.get(cwId);
            if (v) map.set(cwId, { ...v, ...patch });
        },
    };
    const ctx = {
        stores: { curtainWallStore },
        bimManager: { unregisterElement: () => {}, registerElement: () => {} },
    } as unknown as CommandContext;
    return { ctx, store: curtainWallStore, id };
}

describe('§CWLEVEL149 — UpdateCurtainWallCommand announces bim-curtainwall-updated', () => {
    let events: Array<{ id?: string }>;
    const onUpdated = (e: Event): void => {
        events.push({ id: (e as CustomEvent).detail?.id });
    };

    beforeEach(() => {
        events = [];
        window.addEventListener('bim-curtainwall-updated', onUpdated);
        vi.spyOn(console, 'log').mockImplementation(() => {});
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => {
        window.removeEventListener('bim-curtainwall-updated', onUpdated);
        vi.restoreAllMocks();
        // §CW4-CW-BY-SLAB-BATCH's own precedent: the post-batch drain runs on a
        // FrameScheduler slot that never arrives in this environment, so any
        // batch left open must be force-reset or it leaks into the next test.
        batchCoordinator.forceReset();
    });

    it('⭐ COLD — a single (non-batched) type-swap-shaped update fires the event exactly once', () => {
        const { ctx } = makeCtx();
        expect(batchCoordinator.isBatching).toBe(false); // precondition, measured not assumed

        const cmd = new UpdateCurtainWallCommand({
            id: CW_ID,
            updates: { systemTypeId: 'cw.glazed.pitch-750', gridXSpacing: 0.75 },
        });
        const res = cmd.execute(ctx);

        expect(res.success).toBe(true);
        // THE ASSERTION THAT IS THE POINT — before the fix this array was empty:
        // the command wrote the record and told NOTHING that it had.
        expect(events).toHaveLength(1);
        expect(events[0]!.id).toBe(CW_ID);
    });

    it('undo ALSO announces — a Ctrl+Z that restores the record must reach the same listeners', () => {
        const { ctx } = makeCtx();
        const cmd = new UpdateCurtainWallCommand({ id: CW_ID, updates: { systemTypeId: 'cw.glazed.pitch-750' } });
        cmd.execute(ctx);
        expect(events).toHaveLength(1);

        cmd.undo(ctx);
        expect(events).toHaveLength(2);
        expect(events[1]!.id).toBe(CW_ID);
    });

    it('WARM — a 90-wall RAC-shaped batch coalesces to ZERO synchronous dispatches ' +
        'during the batch (the same dedup `bim-curtainwall-added` already relies on), ' +
        'never one per wall', () => {
        // One context per wall id — 90 independent curtain walls, the shape a
        // "change all curtain walls to <type>" RAC fan-out actually dispatches
        // (CatalogueFamilies.ts `fanOutPerId: true`, one `element.changeType`
        // command per resolved id).
        const wallCtxs = Array.from({ length: 90 }, (_, i) => makeCtx(`${CW_ID}-${i}`));

        batchCoordinator.runBatch(() => {
            for (const { ctx, id } of wallCtxs) {
                new UpdateCurtainWallCommand({ id, updates: { systemTypeId: 'cw.glazed.pitch-750' } })
                    .execute(ctx);
                // Sampled INSIDE the loop, the way CW4CurtainWallsBySlabBatched.test.ts
                // samples `isBatching` — proves the state every one of the 90 writes
                // actually saw, not merely that `runBatch` was called around them.
                expect(batchCoordinator.isBatching).toBe(true);
            }
            // The coalescing path (`trackPostBatchWindowEvent`) never dispatches
            // synchronously inside an open batch — that is the whole point of the
            // dedup (`_postBatchWindowEvents` accumulates a Set<string>, not a list
            // of 90 identical strings). A regression that reverted to the pre-fix
            // "no announcement at all" shape would ALSO read 0 here, which is why
            // the COLD test above is the one that actually proves the fix — this
            // one proves the fix did not reintroduce the N-dispatch storm
            // `CW4CurtainWallsBySlabBatched.test.ts` already fixed for `-added`.
            expect(events).toHaveLength(0);
        }, { levelIds: ['L3'], totalElementCount: wallCtxs.length });
    });
});
