/**
 * §CW-4 / C87 §13.6 — POST + TRANSOM SPACING RE-DERIVES THE GRID.
 *
 * RED-FIRST, and the arm that matters is the SECOND one: before this change the
 * spacing write landed on the record and `gridSystem` kept its old lines, so the
 * builder — which reads `cw.gridSystem ?? migrateToGridSystem(...)`
 * (`CurtainWallBuilder.ts:1135`) — re-rendered the wall UNCHANGED while the store
 * said otherwise. A test that only asserted `gridXSpacing === 2` would have passed
 * against the defect. This asserts the LINE COUNT, which is what the user sees.
 *
 * Uses the REAL `migrateToGridSystem` and a minimal in-memory store double that
 * implements the three methods the command calls (`get` / `update` / `set`) with
 * the deep-clone-on-get semantics `CurtainWallStore` documents.
 */
import { describe, it, expect } from 'vitest';
import { UpdateCurtainWallCommand } from '../src/curtainwall/UpdateCurtainWallCommand';
import { migrateToGridSystem } from '@pryzm/geometry-curtain-wall';

function makeStore(seed: any) {
    const map = new Map<string, any>([[seed.id, seed]]);
    return {
        map,
        get: (id: string) => { const v = map.get(id); return v ? JSON.parse(JSON.stringify(v)) : undefined; },
        update: (id: string, patch: any) => { map.set(id, { ...map.get(id), ...patch }); },
        set: (id: string, v: any) => { map.set(id, v); },
    };
}

function makeCtx(store: any) {
    return {
        stores: { curtainWallStore: store },
        bimManager: { registerElement() {}, unregisterElement() {} },
    } as any;
}

function seedWall(gridSystem?: any) {
    return {
        id: 'cw-1',
        type: 'curtain-wall',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 12, y: 0, z: 0 }],
        height: 6,
        baseOffset: 0,
        gridXSpacing: 3,
        gridYSpacing: 3,
        mullionSize: 0.05,
        panelThickness: 0.02,
        ...(gridSystem ? { gridSystem } : {}),
    };
}

const innerCount = (lines: any[]) => lines.filter(l => l.t > 0.001 && l.t < 0.999).length;

describe('§CW-4 — post/transom spacing re-derives the grid system', () => {
    it('regenerates gridSystem when gridXSpacing changes on a wall that ALREADY has one', () => {
        // 12 m at 3 m = 4 bays = 5 u-lines (3 inner). Halve the spacing -> 8 bays, 7 inner.
        const seeded = migrateToGridSystem(12, 6, 3, 3, 'cw-1');
        expect(innerCount(seeded.uLines)).toBe(3);

        const store = makeStore(seedWall(seeded));
        const cmd = new UpdateCurtainWallCommand({ id: 'cw-1', updates: { gridXSpacing: 1.5 } as any });
        const r = cmd.execute(makeCtx(store));

        expect(r.success).toBe(true);
        const after = store.map.get('cw-1');
        expect(after.gridXSpacing).toBe(1.5);
        // ⭐ THE ARM THAT WOULD HAVE CAUGHT THE DEFECT.
        expect(innerCount(after.gridSystem.uLines)).toBe(7);
        // The untouched axis keeps its line count.
        expect(innerCount(after.gridSystem.vLines)).toBe(1);
    });

    it('reports the discarded hand-inserted lines rather than dropping them silently (C84 EI-6)', () => {
        const seeded = migrateToGridSystem(12, 6, 3, 3, 'cw-1');
        seeded.uLines.push({ id: 'hand-1', t: 0.37 });
        seeded.uLines.sort((a, b) => a.t - b.t);
        const store = makeStore(seedWall(seeded));

        const cmd = new UpdateCurtainWallCommand({ id: 'cw-1', updates: { gridXSpacing: 6 } as any });
        const r = cmd.execute(makeCtx(store));

        expect(r.success).toBe(true);
        expect((r.info ?? []).join(' ')).toMatch(/discarded/i);
    });

    it('undo restores the PREVIOUS gridSystem, not merely the previous spacing', () => {
        const seeded = migrateToGridSystem(12, 6, 3, 3, 'cw-1');
        const store = makeStore(seedWall(seeded));
        const ctx = makeCtx(store);

        const cmd = new UpdateCurtainWallCommand({ id: 'cw-1', updates: { gridXSpacing: 1.5 } as any });
        cmd.execute(ctx);
        expect(innerCount(store.map.get('cw-1').gridSystem.uLines)).toBe(7);

        cmd.undo(ctx);
        const back = store.map.get('cw-1');
        expect(back.gridXSpacing).toBe(3);
        expect(innerCount(back.gridSystem.uLines)).toBe(3);
    });

    it('REFUSES to write a degenerate grid on a zero-length baseline, and says so', () => {
        const seed = seedWall(migrateToGridSystem(12, 6, 3, 3, 'cw-1'));
        seed.baseLine = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
        const store = makeStore(seed);

        const r = new UpdateCurtainWallCommand({ id: 'cw-1', updates: { gridXSpacing: 1.5 } as any })
            .execute(makeCtx(store));

        expect(r.success).toBe(true);
        expect((r.info ?? []).join(' ')).toMatch(/NOT re-derived/);
        // The old grid is intact — a refusal must not corrupt.
        expect(innerCount(store.map.get('cw-1').gridSystem.uLines)).toBe(3);
    });

    it('does NOT touch gridSystem when the update carries no spacing change', () => {
        const seeded = migrateToGridSystem(12, 6, 3, 3, 'cw-1');
        const store = makeStore(seedWall(seeded));
        new UpdateCurtainWallCommand({ id: 'cw-1', updates: { mullionSize: 0.09 } as any }).execute(makeCtx(store));
        const after = store.map.get('cw-1');
        expect(after.mullionSize).toBe(0.09);
        expect(after.gridSystem).toEqual(seeded);
    });
});
