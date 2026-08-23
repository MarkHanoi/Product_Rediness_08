/**
 * SetLevelHeightCommand — L-7201 / ADR-0345.
 *
 * THE FOUNDER'S CASE, PINNED: Ground is 3.0 m floor-to-floor with Level 1 at
 * 3.000 and Level 2 at 6.000. Set Ground's height to 2.9 and Level 1 must land
 * at 2.900, Level 2 at 5.900, both keeping their own 3.0 m storey heights — and
 * one Ctrl+Z must put all of it back.
 *
 * These are DIFFERENTIATING tests. Each one fails against a plausible wrong
 * implementation, named at the case:
 *   · "writes the height and moves nothing"  → the pre-L-7201 behaviour;
 *   · "moves only the next level up"         → a one-step cascade;
 *   · "re-proportions the stack"             → recomputing every elevation from
 *     the sum of heights below instead of translating rigidly;
 *   · "clamps a crossing edit"               → silently inventing a stack;
 *   · "reports success unconditionally"      → the L-2401 CompositeCommand defect.
 *
 * DATA/COMMAND test: faithful in-memory stubs, no THREE, no DOM. The reconcile
 * itself is a window event consumed by the app layer and is not exercised here —
 * `SpatialAuthorityArming.test.ts` and `SpatialAuthority.reconcile.test.ts` own
 * that half. What IS asserted here is that the command performs the elevation
 * writes that fire it, which is the part this command is responsible for.
 */

import { describe, it, expect } from 'vitest';
import {
    SetLevelHeightCommand,
    MIN_LEVEL_HEIGHT_M,
    MAX_LEVEL_HEIGHT_M,
} from '../src/levels/SetLevelHeightCommand';
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

function lvl(id: string, name: string, elevation: number, height: number): StubLevel {
    return { id, name, elevation, height, isVisible: true, order: elevation, childrenIds: [] };
}

/**
 * A BimManager stub whose `updateLevel` behaves like the real one: patch-merge,
 * silent no-op on an unknown id. The no-op matters — it is what the command's
 * read-back verification exists to catch.
 */
function makeCtx(levels: StubLevel[], extraStores: Record<string, unknown> = {}) {
    const byId = new Map(levels.map((l) => [l.id, { ...l }]));
    const reconciles: Array<{ levelId: string; delta: number }> = [];

    const bimManager = {
        getLevels: () => Array.from(byId.values()),
        getLevelById: (id: string) => byId.get(id),
        updateLevel: (id: string, updates: Partial<StubLevel>) => {
            const cur = byId.get(id);
            if (!cur) return; // real BimKernel: `if (!level) return;`
            const prevElevation = cur.elevation;
            const next = { ...cur, ...updates };
            byId.set(id, next);
            // Mirrors BimKernel.updateLevel: dispatches ONLY on an elevation change.
            if (updates.elevation !== undefined && updates.elevation !== prevElevation) {
                reconciles.push({ levelId: id, delta: updates.elevation - prevElevation });
            }
        },
    };

    const ctx = {
        bimManager,
        stores: { ...extraStores },
    } as unknown as CommandContext;

    return { ctx, byId, reconciles };
}

/** The founder's stack: Ground 0.000 (h 3.0), Level 1 3.000, Level 2 6.000. */
function founderStack() {
    return [
        lvl('L0', 'Ground', 0, 3.0),
        lvl('L1', 'Level 1', 3.0, 3.0),
        lvl('L2', 'Level 2', 6.0, 3.0),
    ];
}

describe('SetLevelHeightCommand — the founder case: Ground 3.0 → 2.9', () => {
    it('lowers every level ABOVE by the delta and leaves their own heights untouched', () => {
        const { ctx, byId } = makeCtx(founderStack());
        const cmd = new SetLevelHeightCommand({ levelId: 'L0', height: 2.9 });

        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);

        expect(r.success).toBe(true);
        // The edited level: height changes, elevation does NOT.
        expect(byId.get('L0')!.height).toBeCloseTo(2.9, 9);
        expect(byId.get('L0')!.elevation).toBeCloseTo(0, 9);
        // ⭐ The whole ask. Fails against "writes the height and moves nothing".
        expect(byId.get('L1')!.elevation).toBeCloseTo(2.9, 9);
        // Fails against "moves only the next level up".
        expect(byId.get('L2')!.elevation).toBeCloseTo(5.9, 9);
        // Fails against "re-proportions the stack": a sum-of-heights recompute
        // would leave L1 at 2.9 and L2 at 5.9 too, so the discriminator is that
        // the OTHER levels' own heights are untouched — a recompute that moved
        // L2 by changing its height would trip here.
        expect(byId.get('L1')!.height).toBeCloseTo(3.0, 9);
        expect(byId.get('L2')!.height).toBeCloseTo(3.0, 9);
    });

    it('fires exactly one elevation reconcile per moved level, and none for the edited one', () => {
        const { ctx, reconciles } = makeCtx(founderStack());
        new SetLevelHeightCommand({ levelId: 'L0', height: 2.9 }).execute(ctx);

        // The edited level's FLOOR did not move, so reconciling it would rebuild
        // its walls for nothing. Its ceiling-hung content is handled by the
        // re-seat pass instead.
        expect(reconciles.map((r) => r.levelId)).toEqual(['L1', 'L2']);
        for (const r of reconciles) expect(r.delta).toBeCloseTo(-0.1, 9);
    });

    it('raising the height lifts the stack by the same magnitude', () => {
        const { ctx, byId } = makeCtx(founderStack());
        new SetLevelHeightCommand({ levelId: 'L0', height: 3.5 }).execute(ctx);
        expect(byId.get('L1')!.elevation).toBeCloseTo(3.5, 9);
        expect(byId.get('L2')!.elevation).toBeCloseTo(6.5, 9);
    });

    it('editing a MIDDLE level moves only what is above it — nothing below moves', () => {
        const { ctx, byId } = makeCtx(founderStack());
        new SetLevelHeightCommand({ levelId: 'L1', height: 4.0 }).execute(ctx);

        expect(byId.get('L0')!.elevation).toBeCloseTo(0, 9);   // below: unmoved
        expect(byId.get('L0')!.height).toBeCloseTo(3.0, 9);
        expect(byId.get('L1')!.elevation).toBeCloseTo(3.0, 9); // edited: unmoved
        expect(byId.get('L2')!.elevation).toBeCloseTo(7.0, 9); // above: +1.0
    });

    it('a BASEMENT below the edited level does not move — and that is the rule, not a shortfall', () => {
        const { ctx, byId } = makeCtx([
            lvl('B1', 'Basement', -3.0, 3.0),
            ...founderStack(),
        ]);
        new SetLevelHeightCommand({ levelId: 'L0', height: 2.9 }).execute(ctx);

        // Ground's floor-to-floor governs the gap ABOVE Ground; nothing below it
        // is a function of that number. ADR-0345 §3.
        expect(byId.get('B1')!.elevation).toBeCloseTo(-3.0, 9);
        expect(byId.get('L1')!.elevation).toBeCloseTo(2.9, 9);
    });
});

describe('SetLevelHeightCommand — ONE undo, and it counts what LANDED (not L-2401)', () => {
    it('restores every elevation and the height in a single undo', () => {
        const { ctx, byId } = makeCtx(founderStack());
        const cmd = new SetLevelHeightCommand({ levelId: 'L0', height: 2.9 });
        cmd.execute(ctx);

        const u = cmd.undo(ctx);

        expect(u.success).toBe(true);
        expect(byId.get('L0')!.height).toBeCloseTo(3.0, 9);
        expect(byId.get('L1')!.elevation).toBeCloseTo(3.0, 9);
        expect(byId.get('L2')!.elevation).toBeCloseTo(6.0, 9);
    });

    it('reports FAILURE when a level vanished before undo — never an unconditional true', () => {
        const { ctx, byId } = makeCtx(founderStack());
        const cmd = new SetLevelHeightCommand({ levelId: 'L0', height: 2.9 });
        cmd.execute(ctx);

        // Someone deleted Level 2 between the edit and the undo. `updateLevel`
        // silently no-ops on an unknown id, so an implementation that trusts its
        // own writes reports a clean undo over a stack it did not restore —
        // exactly the CompositeCommand defect (L-2401).
        byId.delete('L2');

        const u = cmd.undo(ctx);
        expect(u.success).toBe(false);
        expect(u.error).toMatch(/2 of 3/);
        // …and the levels that COULD be restored still were.
        expect(byId.get('L1')!.elevation).toBeCloseTo(3.0, 9);
        expect(byId.get('L0')!.height).toBeCloseTo(3.0, 9);
    });

    it('undo before execute refuses rather than corrupting the stack', () => {
        const { ctx } = makeCtx(founderStack());
        const u = new SetLevelHeightCommand({ levelId: 'L0', height: 2.9 }).undo(ctx);
        expect(u.success).toBe(false);
        expect(u.error).toMatch(/No snapshot/i);
    });
});

describe('SetLevelHeightCommand — refuses with the numbers, never clamps (C74)', () => {
    it('refuses a non-positive height and quotes it', () => {
        const { ctx } = makeCtx(founderStack());
        const v = new SetLevelHeightCommand({ levelId: 'L0', height: -1 }).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('greater than 0');
        expect(v.reason).toContain('-1.000');
    });

    it('refuses a height below the storey minimum and quotes BOTH numbers', () => {
        const { ctx } = makeCtx(founderStack());
        const v = new SetLevelHeightCommand({ levelId: 'L0', height: 0.05 }).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('0.050');
        expect(v.reason).toContain(MIN_LEVEL_HEIGHT_M.toFixed(2));
    });

    it('refuses an out-of-range height and suggests the metres reading (unit slip)', () => {
        const { ctx } = makeCtx(founderStack());
        const v = new SetLevelHeightCommand({ levelId: 'L0', height: 2900 }).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain(String(MAX_LEVEL_HEIGHT_M));
        expect(v.reason).toContain('2.900'); // the mm→m suggestion
    });

    it('refuses a non-finite height', () => {
        const { ctx } = makeCtx(founderStack());
        expect(new SetLevelHeightCommand({ levelId: 'L0', height: NaN }).canExecute(ctx).ok).toBe(false);
    });

    it('refuses an unknown level', () => {
        const { ctx } = makeCtx(founderStack());
        const v = new SetLevelHeightCommand({ levelId: 'nope', height: 2.9 }).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('not found');
    });

    it('refuses a CROSSING edit on an inconsistent stack, naming both levels and both numbers', () => {
        // Ground claims 3.0 m but Level 1 actually sits at 2.0 — an inconsistent
        // stack (importable, and reachable via a direct elevation edit). Setting
        // the height to 0.3 gives δ = −2.7, which would drop Level 1 to −0.7,
        // BELOW Ground at 0.000.
        const { ctx, byId } = makeCtx([
            lvl('L0', 'Ground', 0, 3.0),
            lvl('L1', 'Level 1', 2.0, 3.0),
        ]);
        const cmd = new SetLevelHeightCommand({ levelId: 'L0', height: 0.3 });
        const v = cmd.canExecute(ctx);

        expect(v.ok).toBe(false);
        expect(v.reason).toContain('Level 1');
        expect(v.reason).toContain('Ground');
        expect(v.reason).toContain('-0.700');   // where it WOULD have gone
        expect(v.reason).toContain('0.000');    // what it would have crossed
        expect(v.reason).toContain('may not cross');
        // ⛔ Fails against "clamps": nothing moved, because nothing was executed.
        expect(byId.get('L1')!.elevation).toBeCloseTo(2.0, 9);
    });

    it('an unchanged height is an idempotent no-op, not an empty undo entry', () => {
        const { ctx, byId } = makeCtx(founderStack());
        const r = new SetLevelHeightCommand({ levelId: 'L0', height: 3.0 }).execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds).toEqual([]);
        expect(byId.get('L1')!.elevation).toBeCloseTo(3.0, 9);
    });
});

describe('SetLevelHeightCommand — names what did NOT follow (ADR-0344: silence is a defect)', () => {
    const beam = { id: 'b1', levelId: 'L1' };
    const stair = { id: 's1', levelId: 'L1' };
    const cw = { id: 'cw1', levelId: 'L2' };

    it('counts stranded beams, stairs and curtain walls on every affected level', () => {
        const { ctx } = makeCtx(founderStack(), {
            beamStore: { getAll: () => [beam] },
            stairStore: { getAll: () => [stair] },
            curtainWallStore: { getAll: () => [cw] },
        });
        const r = new SetLevelHeightCommand({ levelId: 'L0', height: 2.9 }).execute(ctx);

        const notice = (r.info ?? []).find((s) => s.includes('did NOT move'));
        expect(notice).toBeTruthy();
        expect(notice).toContain('1 beam');
        expect(notice).toContain('1 stair');
        expect(notice).toContain('1 curtain wall');
    });

    it('says nothing when no stranded family is present — no false alarm', () => {
        const { ctx } = makeCtx(founderStack(), {
            beamStore: { getAll: () => [] },
            stairStore: { getAll: () => [] },
        });
        const r = new SetLevelHeightCommand({ levelId: 'L0', height: 2.9 }).execute(ctx);
        expect((r.info ?? []).find((s) => s.includes('did NOT move'))).toBeUndefined();
    });

    it('ignores stranded elements on levels the edit did not touch', () => {
        // A beam on the BASEMENT is unaffected by a Ground height change, so
        // warning about it would be a false alarm that teaches users to ignore
        // the notice.
        const { ctx } = makeCtx([lvl('B1', 'Basement', -3, 3), ...founderStack()], {
            beamStore: { getAll: () => [{ id: 'b-base', levelId: 'B1' }] },
        });
        const r = new SetLevelHeightCommand({ levelId: 'L0', height: 2.9 }).execute(ctx);
        expect((r.info ?? []).find((s) => s.includes('did NOT move'))).toBeUndefined();
    });

    it('a throwing store is skipped, not fatal — the edit still lands', () => {
        const { ctx, byId } = makeCtx(founderStack(), {
            beamStore: { getAll: () => { throw new Error('store offline'); } },
        });
        const r = new SetLevelHeightCommand({ levelId: 'L0', height: 2.9 }).execute(ctx);
        expect(r.success).toBe(true);
        expect(byId.get('L1')!.elevation).toBeCloseTo(2.9, 9);
    });
});

describe('SetLevelHeightCommand — re-seats the absolute-Y families in the SAME undo unit', () => {
    /** Furniture stores `position.y` as the floor datum; a level move must carry it. */
    function furnitureCtx() {
        const items = new Map<string, any>([
            ['f-l1', { id: 'f-l1', levelId: 'L1', baseOffset: 0, position: { x: 0, y: 3.0, z: 0 } }],
        ]);
        return makeCtx(founderStack(), {
            furnitureStore: {
                getAll: () => Array.from(items.values()),
                get: (id: string) => items.get(id),
                update: (id: string, d: any) => { items.set(id, d); },
            },
            floorStore: { getByLevel: () => [] },
            ceilingStore: { getByLevel: () => [] },
        });
    }

    it('moves furniture on a shifted level down with it', () => {
        const { ctx } = furnitureCtx();
        const cmd = new SetLevelHeightCommand({ levelId: 'L0', height: 2.9 });
        const r = cmd.execute(ctx);

        const store = (ctx.stores as any).furnitureStore;
        expect(store.get('f-l1').position.y).toBeCloseTo(2.9, 6);
        expect(r.affectedElementIds).toContain('f-l1');
    });

    it('one undo returns the furniture too', () => {
        const { ctx } = furnitureCtx();
        const cmd = new SetLevelHeightCommand({ levelId: 'L0', height: 2.9 });
        cmd.execute(ctx);
        cmd.undo(ctx);

        const store = (ctx.stores as any).furnitureStore;
        expect(store.get('f-l1').position.y).toBeCloseTo(3.0, 6);
    });
});
