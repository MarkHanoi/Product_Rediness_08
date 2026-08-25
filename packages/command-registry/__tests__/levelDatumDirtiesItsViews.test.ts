/**
 * §LEVEL-DATUM-DIRTIES-ITS-VIEWS — L-11041 (lane LEVELHEIGHT61).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE MEASUREMENT THIS EXISTS TO PIN
 * ─────────────────────────────────────────────────────────────────────────────
 * The founder set Ground's floor-to-floor height to 4.00 m. His console:
 *
 *     [CommandManager] EXECUTE: SET_LEVEL_HEIGHT
 *     [CommandManager] snapshot commandType="SET_LEVEL_HEIGHT (Y4e)" scope=[…] elapsed=0.8ms
 *     [RuleEngine] Model updated, ready for re-validation
 *     … and then NOTHING.
 *
 * ⛔ No `ViewDependencyTracker` flush. No re-projection. The very next line is an
 * unrelated hover pick. Every other mutation in the same log — `MOVE_WINDOW`,
 * `CREATE_SLABS_ON_ALL_FLOORS`, `UPDATE_WINDOW_SYSTEM_TYPE` — is followed by a
 * VDT flush and a full re-projection. `SET_LEVEL_HEIGHT` is followed by neither.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY, EXACTLY
 * ─────────────────────────────────────────────────────────────────────────────
 * `ViewDependencyTracker` is driven ENTIRELY by `StoreEventBus` **element**
 * events. **A level is not a store element.** It lives in a `Map` inside
 * `BimKernel`. So a datum edit dirtied nothing at all.
 *
 * It went unnoticed for as long as it did because the ELEVATION half accidentally
 * covered for it: `BimKernel.updateLevel({elevation})` dispatches
 * `spatial-authority-reconcile`, whose consumer re-invokes the wall / slab /
 * column / roof builders, and THOSE emit store events which dirty the view. Two
 * things break that relay, and a pure height edit breaks both:
 *
 *   1. `BimKernel.updateLevel` dispatches **only** on an elevation change
 *      (BimKernel.ts:370) — so the EDITED level's own views were never covered,
 *      even on the runs where the cascade fired for the levels above it; and
 *   2. `SpatialAuthority`'s listener returns early when the level has no
 *      `childrenIds` — so editing the TOPMOST level (nothing above it, commonly
 *      nothing on it yet) produces no dispatch and no relay whatsoever. That is
 *      the founder's console signature exactly.
 *
 * ⭐ THE FIX IS NOT A SECOND MUTATION PATH (C03 §2.1). `markLevelsDirty` holds no
 * model state — it holds a dirty SET. It is the same call
 * `BatchCoordinator.onComplete()` already makes for the same reason.
 *
 * The other half of the founder's report — that the plan window was a hard 3.0 m
 * constant that `level.height` could never reach — is proven in
 * `apps/editor/__tests__/levelHeightIsThePlanRange.test.ts` (L-11040).
 *
 * DATA/COMMAND test: faithful in-memory stubs, no THREE, no DOM. The tracker
 * itself is the REAL singleton, spied at its public boundary — not a fake
 * ([[fake-more-capable-than-real]]).
 *
 * Governance: C03 §2.1 · C04 §3.3 · C72 §2.1 · ADR-0345.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { viewDependencyTracker } from '@pryzm/core-app-model';
import { SetLevelHeightCommand } from '../src/levels/SetLevelHeightCommand';
import { UpdateLevelCommand } from '../src/levels/UpdateLevelCommand';
import type { CommandContext } from '../src/types';

interface StubLevel {
    id: string;
    name: string;
    elevation: number;
    height: number;
    isVisible: boolean;
    order: number;
    childrenIds: string[];
}

function lvl(id: string, name: string, elevation: number, height: number, childrenIds: string[] = []): StubLevel {
    return { id, name, elevation, height, isVisible: true, order: elevation, childrenIds };
}

/** Mirrors `BimKernel.updateLevel`: patch-merge, silent no-op on an unknown id. */
function makeCtx(levels: StubLevel[]) {
    const byId = new Map(levels.map((l) => [l.id, { ...l }]));
    const ctx = {
        bimManager: {
            getLevels: () => Array.from(byId.values()),
            getLevelById: (id: string) => byId.get(id),
            updateLevel: (id: string, updates: Partial<StubLevel>) => {
                const cur = byId.get(id);
                if (!cur) return;
                byId.set(id, { ...cur, ...updates });
            },
        },
        stores: {},
    } as unknown as CommandContext;
    return { ctx, byId };
}

/** Spy the REAL tracker at its public boundary; the flush itself is not our subject. */
function spyTracker() {
    return vi.spyOn(viewDependencyTracker, 'markLevelsDirty').mockImplementation(() => { /* no flush in a data test */ });
}

/** Every level id passed to the tracker across all calls, de-duplicated. */
function dirtied(spy: ReturnType<typeof spyTracker>): string[] {
    return Array.from(new Set(spy.mock.calls.flatMap((c) => c[0] as string[]))).sort();
}

afterEach(() => { vi.restoreAllMocks(); });

// ─────────────────────────────────────────────────────────────────────────────
// The founder's exact case
// ─────────────────────────────────────────────────────────────────────────────

describe('L-11041 — SET_LEVEL_HEIGHT tells the view tracker its drawings are stale', () => {
    it("THE FOUNDER'S CASE — Ground 3.0 → 4.0 dirties Ground AND the level that rode up", () => {
        const spy = spyTracker();
        const { ctx } = makeCtx([lvl('L0', 'Ground', 0, 3.0), lvl('L1', 'Level 1', 3.0, 3.0)]);

        const r = new SetLevelHeightCommand({ levelId: 'L0', height: 4.0 }).execute(ctx);

        expect(r.success).toBe(true);
        // ⭐ THE ARM THAT WAS MISSING. Before this lane the tracker heard nothing:
        // this expectation is `[]` against the old command.
        expect(dirtied(spy)).toEqual(['L0', 'L1']);
    });

    it('⭐ THE TOPMOST LEVEL — the case the elevation relay could never have covered', () => {
        // No level above ⇒ no `updateLevel({elevation})` ⇒ no
        // `spatial-authority-reconcile` ⇒ no builder re-run ⇒ no store event.
        // Nothing downstream fires AT ALL, which is precisely what the founder's
        // console shows. Only an explicit mark can reach the view here.
        const spy = spyTracker();
        const { ctx, byId } = makeCtx([lvl('L0', 'Ground', 0, 3.0), lvl('L1', 'Level 1', 3.0, 3.0)]);

        const r = new SetLevelHeightCommand({ levelId: 'L1', height: 4.0 }).execute(ctx);

        expect(r.success).toBe(true);
        expect(byId.get('L1')!.height).toBeCloseTo(4.0, 9);
        expect(dirtied(spy)).toEqual(['L1']);
    });

    it('a level with NO children still dirties its views — the SpatialAuthority early-return case', () => {
        // `SpatialAuthority`'s listener bails on `childrenIds.length === 0`, so a
        // level whose elements have not been drawn yet used to keep a stale plan
        // window for ever. The command does not consult `childrenIds` at all.
        const spy = spyTracker();
        const { ctx } = makeCtx([lvl('L0', 'Ground', 0, 3.0, []), lvl('L1', 'Level 1', 3.0, 3.0, [])]);

        new SetLevelHeightCommand({ levelId: 'L0', height: 4.0 }).execute(ctx);

        expect(dirtied(spy)).toEqual(['L0', 'L1']);
    });

    it('the whole moved stack is dirtied, not just the next level up', () => {
        const spy = spyTracker();
        const { ctx } = makeCtx([
            lvl('L0', 'Ground', 0, 3.0),
            lvl('L1', 'Level 1', 3.0, 3.0),
            lvl('L2', 'Level 2', 6.0, 3.0),
            lvl('L3', 'Level 3', 9.0, 3.0),
        ]);

        new SetLevelHeightCommand({ levelId: 'L0', height: 4.0 }).execute(ctx);

        expect(dirtied(spy)).toEqual(['L0', 'L1', 'L2', 'L3']);
    });

    it('an idempotent no-op edit dirties NOTHING — a re-commit on blur must not thrash the projector', () => {
        const spy = spyTracker();
        const { ctx } = makeCtx([lvl('L0', 'Ground', 0, 3.0), lvl('L1', 'Level 1', 3.0, 3.0)]);

        const r = new SetLevelHeightCommand({ levelId: 'L0', height: 3.0 }).execute(ctx);

        expect(r.success).toBe(true);
        expect(spy).not.toHaveBeenCalled();
    });

    it('UNDO re-dirties exactly what execute did — a stale drawing in the other direction is the same defect', () => {
        const { ctx } = makeCtx([lvl('L0', 'Ground', 0, 3.0), lvl('L1', 'Level 1', 3.0, 3.0)]);
        const cmd = new SetLevelHeightCommand({ levelId: 'L0', height: 4.0 });
        cmd.execute(ctx);

        const spy = spyTracker();          // installed AFTER execute — undo only
        const u = cmd.undo(ctx);

        expect(u.success).toBe(true);
        expect(dirtied(spy)).toEqual(['L0', 'L1']);
    });

    it('a tracker that throws must NOT fail a commit that already landed', () => {
        vi.spyOn(viewDependencyTracker, 'markLevelsDirty').mockImplementation(() => {
            throw new Error('tracker unavailable');
        });
        vi.spyOn(console, 'warn').mockImplementation(() => { /* silence the expected warn */ });
        const { ctx, byId } = makeCtx([lvl('L0', 'Ground', 0, 3.0), lvl('L1', 'Level 1', 3.0, 3.0)]);

        const r = new SetLevelHeightCommand({ levelId: 'L0', height: 4.0 }).execute(ctx);

        expect(r.success).toBe(true);
        expect(byId.get('L1')!.elevation).toBeCloseTo(4.0, 9);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The sibling command — the elevation input beside the height input
// ─────────────────────────────────────────────────────────────────────────────

describe('L-11041 — UPDATE_LEVEL dirties its views for a DATUM edit, and only for one', () => {
    it('an elevation edit dirties the level', () => {
        const spy = spyTracker();
        const { ctx } = makeCtx([lvl('L0', 'Ground', 0, 3.0)]);

        new UpdateLevelCommand({ levelId: 'L0', updates: { elevation: 0.5 } }).execute(ctx);

        expect(dirtied(spy)).toEqual(['L0']);
    });

    it('a HEIGHT edit dirties it too — BimKernel dispatches nothing at all for this one', () => {
        const spy = spyTracker();
        const { ctx } = makeCtx([lvl('L0', 'Ground', 0, 3.0)]);

        new UpdateLevelCommand({ levelId: 'L0', updates: { height: 4.0 } }).execute(ctx);

        expect(dirtied(spy)).toEqual(['L0']);
    });

    it('a NAME, COLOUR or VISIBILITY edit dirties nothing — no projected geometry moved', () => {
        // Scoped deliberately: a re-projection is expensive and a rename changes
        // no linework. Widening this would make every keystroke in the name field
        // a full plan re-projection.
        const spy = spyTracker();
        const { ctx } = makeCtx([lvl('L0', 'Ground', 0, 3.0)]);

        new UpdateLevelCommand({ levelId: 'L0', updates: { name: 'Planta Baja' } }).execute(ctx);
        new UpdateLevelCommand({ levelId: 'L0', updates: { color: '#6600FF' } }).execute(ctx);
        new UpdateLevelCommand({ levelId: 'L0', updates: { isVisible: false } }).execute(ctx);

        expect(spy).not.toHaveBeenCalled();
    });

    it('UNDO of a datum edit re-dirties the level', () => {
        const { ctx } = makeCtx([lvl('L0', 'Ground', 0, 3.0)]);
        const cmd = new UpdateLevelCommand({ levelId: 'L0', updates: { height: 4.0 } });
        cmd.execute(ctx);

        const spy = spyTracker();
        cmd.undo(ctx);

        expect(dirtied(spy)).toEqual(['L0']);
    });
});
