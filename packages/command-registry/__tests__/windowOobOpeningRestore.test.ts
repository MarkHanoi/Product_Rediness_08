// §FIX-WINDOW-OOB-OPENING-RESTORE (L-82) — window dimension edits past the wall
// bounds must NOT orphan/destroy the opening, AND an orphaned window must stay
// deletable + recoverable.
//
// This is a DATA/COMMAND test (no THREE, no DOM). It drives the two commands the
// bug flows through against the REAL geometry-window windowStore singleton and a
// faithful in-memory wallStore stub:
//
//   1. UpdateWindowParameterCommand clamps an out-of-bounds width to the host
//      wall (the frame can never exceed the wall) — so the opening stays a valid,
//      in-bounds, cuttable span and recovers on any later edit.
//   2. DeleteElementCommand can delete an ORPHANED window (present only in the
//      external windowStore, desynced from the wallStore) and undo restores it.

import { describe, it, expect, beforeEach } from 'vitest';
import { windowStore } from '@pryzm/geometry-window';
import { UpdateWindowParameterCommand } from '../src/windows/UpdateWindowParameterCommand';
import { DeleteElementCommand } from '../src/walls/DeleteElementCommand';
import type { CommandContext } from '../src/types';

interface Opening {
    id: string; type: 'window' | 'door'; elementId: string;
    offset: number; width: number; height: number; sillHeight: number;
}
interface FakeWall {
    id: string; type: 'wall'; levelId: string;
    baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
    height: number; thickness: number; openings: Opening[]; childrenIds: string[];
}

function makeWall(id: string, lengthM: number, heightM = 2.4): FakeWall {
    return {
        id, type: 'wall', levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: lengthM, y: 0, z: 0 }],
        height: heightM, thickness: 0.2, openings: [], childrenIds: [],
    };
}

/** Faithful wallStore double: getById / getWindow / updateWindow / removeOpening. */
function makeCtx(walls: FakeWall[]) {
    const byId = new Map(walls.map(w => [w.id, w]));
    // Mirror the internal window map ONLY for windows we explicitly host here.
    const winIndex = new Map<string, { wallId: string; openingId: string }>();
    const updateWindowCalls: Array<{ id: string; patch: any }> = [];

    const wallStore = {
        getById: (id: string) => byId.get(id),
        getWindow: (id: string) => {
            const ref = winIndex.get(id);
            if (!ref) return undefined;
            const w = byId.get(ref.wallId);
            const op = w?.openings.find(o => o.elementId === id);
            return op ? { id, wallId: ref.wallId, openingId: op.id, ...op } : undefined;
        },
        getDoor: () => undefined,
        updateWindow: (id: string, patch: any) => {
            updateWindowCalls.push({ id, patch });
            const ref = winIndex.get(id);
            if (!ref) return;
            const w = byId.get(ref.wallId);
            const op = w?.openings.find(o => o.elementId === id);
            if (op) Object.assign(op, patch);
        },
        removeOpening: (wallId: string, openingId: string) => {
            const w = byId.get(wallId);
            if (w) w.openings = w.openings.filter(o => o.id !== openingId);
        },
        restoreOpening: (wallId: string, opening: Opening) => {
            const w = byId.get(wallId);
            if (w && !w.openings.some(o => o.id === opening.id)) w.openings.push({ ...opening });
        },
        _host: (winId: string, wallId: string, openingId: string) => winIndex.set(winId, { wallId, openingId }),
    };
    const ctx = { stores: { wallStore }, bimManager: {} } as unknown as CommandContext;
    return { ctx, wallStore, updateWindowCalls, byId };
}

const WIN = {
    id: 'win-1', openingId: 'op-1', wallId: 'w1',
    offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9,
};

beforeEach(() => {
    // Clean external store between tests.
    if (windowStore.has(WIN.id)) windowStore.remove(WIN.id);
});

describe('§FIX-WINDOW-OOB-OPENING-RESTORE — UpdateWindowParameterCommand clamp', () => {
    it('clamps an out-of-bounds width to the host wall (frame never exceeds the wall)', () => {
        windowStore.add({ ...WIN });
        const { ctx, updateWindowCalls } = makeCtx([
            { ...makeWall('w1', 3), openings: [{ id: 'op-1', type: 'window', elementId: 'win-1', offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9 }], childrenIds: ['win-1'] },
        ]);
        (ctx.stores.wallStore as any)._host('win-1', 'w1', 'op-1');

        // Request a 6 m wide frame on a 3 m wall.
        const res = new UpdateWindowParameterCommand('win-1', { width: 6 }).execute(ctx);
        expect(res.success).toBe(true);

        // windowStore (the 3D frame) received a clamped width ≤ wall length.
        const stored = windowStore.getById('win-1')!;
        expect(stored.width).toBeLessThanOrEqual(3 + 1e-9);
        expect(stored.width).toBeGreaterThan(0);
        // The SAME clamped value reached the wallStore opening (they stay consistent).
        expect(updateWindowCalls.length).toBe(1);
        expect(updateWindowCalls[0].patch.width).toBeCloseTo(stored.width, 6);
        expect(stored.offset + stored.width).toBeLessThanOrEqual(3 + 1e-9);
    });

    it('leaves an in-bounds edit untouched (recovery back within the wall)', () => {
        windowStore.add({ ...WIN });
        const { ctx } = makeCtx([
            { ...makeWall('w1', 3), openings: [{ id: 'op-1', type: 'window', elementId: 'win-1', offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9 }], childrenIds: ['win-1'] },
        ]);
        (ctx.stores.wallStore as any)._host('win-1', 'w1', 'op-1');

        new UpdateWindowParameterCommand('win-1', { width: 1.2 }).execute(ctx);
        expect(windowStore.getById('win-1')!.width).toBeCloseTo(1.2, 6);
    });
});

describe('§FIX-WINDOW-OOB-OPENING-RESTORE — DeleteElementCommand orphan window', () => {
    it('deletes a window present only in the external windowStore (orphaned)', () => {
        windowStore.add({ ...WIN });
        // wallStore still carries the opening but the window is NOT in its internal
        // window map (getWindow → undefined) — the orphaned state the bug produced.
        const { ctx, byId } = makeCtx([
            { ...makeWall('w1', 3), openings: [{ id: 'op-1', type: 'window', elementId: 'win-1', offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9 }], childrenIds: ['win-1'] },
        ]);
        // deliberately DO NOT _host it → getWindow returns undefined (orphan).

        const cmd = new DeleteElementCommand('win-1');
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const res = cmd.execute(ctx);
        expect(res.success).toBe(true);

        // Window gone from the external store AND its wall opening freed.
        expect(windowStore.has('win-1')).toBe(false);
        expect(byId.get('w1')!.openings.length).toBe(0);
    });

    it('undo restores the orphaned window + its opening', () => {
        windowStore.add({ ...WIN });
        const { ctx, byId } = makeCtx([
            { ...makeWall('w1', 3), openings: [{ id: 'op-1', type: 'window', elementId: 'win-1', offset: 1.0, width: 1.0, height: 1.2, sillHeight: 0.9 }], childrenIds: ['win-1'] },
        ]);

        const cmd = new DeleteElementCommand('win-1');
        cmd.execute(ctx);
        expect(windowStore.has('win-1')).toBe(false);

        cmd.undo(ctx);
        expect(windowStore.has('win-1')).toBe(true);
        expect(byId.get('w1')!.openings.some(o => o.id === 'op-1')).toBe(true);
    });
});
