/**
 * §G3-STALE-FIX (lane L3b, 2026-08-31) — CreatePlumbingFixtureCommand registers
 * the fixture with the ViewDependencyTracker, and its undo unregisters it.
 *
 * THE MEASURED DEFECT (L2b table, `no-registration-families-measurement.md` row
 * "plumbing"): the live `plumbing.createFixture` bus verb delegates to this
 * legacy command, which did `bimManager.registerElement` (:64) but NEVER
 * `viewDependencyTracker.registerElement` — so `PlumbingStore.ts:40`'s
 * `'plumbing'` create emit fell into the §G3-STALE fallback (console.warn +
 * EVERY non-3D view dirtied, coarse) instead of targeting the fixture's level.
 *
 * Precedent copied, not invented: `CW90VdtRegistration.test.ts`; the REAL
 * `PlumbingStore` (the store the mesh builder and symbol pass read) as in
 * `wallAnchorFollowsHost.test.ts`.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { viewDependencyTracker } from '@pryzm/core-app-model';
import { PlumbingStore } from '@pryzm/geometry-plumbing';
import { CreatePlumbingFixtureCommand } from '../src/plumbing/CreatePlumbingFixtureCommand';
import type { CommandContext } from '../src/types';

const LEVEL = 'L0';

function makeCtx() {
    const plumbingStore = new PlumbingStore();
    const level = { id: LEVEL, name: 'Ground', elevation: 0, height: 3, childrenIds: [] as string[] };
    const bimManager = {
        getLevels: () => [level],
        getLevelById: (id: string) => (id === LEVEL ? level : undefined),
        registerElement: () => {},
        unregisterElement: () => {},
    };
    const ctx = { stores: { plumbingStore }, bimManager } as unknown as CommandContext;
    return { ctx, plumbingStore };
}

function makeCommand(id: string): CreatePlumbingFixtureCommand {
    return new CreatePlumbingFixtureCommand({
        id,
        fixtureType: 'toilet',
        position: { x: 1, y: 0, z: 2 },
        rotation: { x: 0, y: 0, z: 0 },
        levelId: LEVEL,
        baseOffset: 0,
        width: 0.4,
        length: 0.7,
        height: 0.8,
    });
}

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('§G3-STALE-FIX L3b — CreatePlumbingFixtureCommand ↔ ViewDependencyTracker', () => {
    it('⭐ execute() registers (id, levelId) BEFORE plumbingStore.add emits the create event', () => {
        const calls: string[] = [];
        const reg = vi
            .spyOn(viewDependencyTracker, 'registerElement')
            .mockImplementation(() => { calls.push('vdt'); });

        const { ctx, plumbingStore } = makeCtx();
        const add = plumbingStore.add.bind(plumbingStore);
        vi.spyOn(plumbingStore, 'add').mockImplementation((rec: any) => {
            calls.push('add');
            return add(rec);
        });

        const res = makeCommand('plumbing-vdt-1').execute(ctx);

        expect(res.success).toBe(true);
        expect(reg).toHaveBeenCalledWith('plumbing-vdt-1', LEVEL);
        // Register first, THEN the add whose 'plumbing' event the VDT must
        // resolve to a level (else §G3-STALE coarse fallback).
        expect(calls.indexOf('vdt')).toBeLessThan(calls.indexOf('add'));
    });

    it('undo() unregisters the fixture id (symmetric — no phantom level association after Ctrl+Z)', () => {
        vi.spyOn(viewDependencyTracker, 'registerElement').mockImplementation(() => {});
        const unreg = vi
            .spyOn(viewDependencyTracker, 'unregisterElement')
            .mockImplementation(() => {});

        const { ctx, plumbingStore } = makeCtx();
        const cmd = makeCommand('plumbing-vdt-2');
        expect(cmd.execute(ctx).success).toBe(true);
        expect(plumbingStore.get('plumbing-vdt-2')).toBeDefined();

        const res = cmd.undo(ctx);

        expect(res.success).toBe(true);
        expect(plumbingStore.get('plumbing-vdt-2')).toBeUndefined();
        expect(unreg).toHaveBeenCalledWith('plumbing-vdt-2');
    });
});
