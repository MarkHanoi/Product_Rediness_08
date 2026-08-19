/**
 * §GRID-PIN-REPORTED-SUCCESS-AND-MOVED-NOTHING (L-1110)
 *
 * THE DEFECT, MEASURED AT THE SEAM THAT LIES
 * ──────────────────────────────────────────
 * `GridStore.update()` carries the §40 §3 PIN guard: on a pinned grid it strips every
 * geometry key out of the patch, `console.warn`s, and returns. `UpdateGridCommand`
 * never asked about `isPinned` and never compared before/after — so it returned
 * `{ success: true, info: ['Grid "A" updated.'] }` for an edit the store had already
 * thrown away. The refusal existed only in a console line, and the user was told the
 * grid had moved.
 *
 * It is the same class as the L-1109 delete census — an operation that changes nothing
 * while reporting that it did — and it is live on four surfaces: the Grid Properties
 * position field, the Grid Manager row, the plan-canvas inline dimension editor, and
 * the `grid.update` bus verb. It also sat directly under the contextual Move affordance
 * SV2 was asked to build, which is why it had to be closed before any button was
 * surfaced.
 *
 * WHY THIS TEST DRIVES THE REAL STORE
 * ───────────────────────────────────
 * The whole defect is a DISAGREEMENT between two components: the store refuses, the
 * command reports success. A fake store built from the command's expectations cannot
 * express that disagreement — it would be a fake built from the header, unable to
 * falsify the header. So `GridStore` here is the real one, and the assertion that
 * matters is not "canExecute returns ok:false" but "the stored position is UNCHANGED
 * and the command said so".
 */

import { describe, it, expect } from 'vitest';
import { GridStore } from '@pryzm/core-app-model';
import { UpdateGridCommand } from '../src/grids/UpdateGridCommand';
import type { CommandContext } from '../src/types';

function ctxWith(store: GridStore): CommandContext {
    return { stores: { gridStore: store } } as unknown as CommandContext;
}

function storeWithGrid(over: Record<string, unknown> = {}): GridStore {
    const store = new GridStore();
    store.add({ id: 'g1', name: 'A', axis: 'X', position: 5, ...over } as never);
    return store;
}

describe('§L-1110 — a PINNED grid refuses a geometry edit instead of reporting success', () => {
    it('THE DEFECT: moving a pinned grid leaves the position untouched', () => {
        // The precondition the whole bug rests on. If the store ever stopped dropping
        // the field, this test would be asserting nothing and must be revisited.
        const store = storeWithGrid({ isPinned: true });
        store.update('g1', { position: 42 });
        expect(store.get('g1')!.position).toBe(5);
    });

    it('canExecute REFUSES, and names the grid, the blocked field, and the way out', () => {
        const store = storeWithGrid({ isPinned: true });
        const res = new UpdateGridCommand({ gridId: 'g1', updates: { position: 42 } })
            .canExecute(ctxWith(store));

        expect(res.ok).toBe(false);
        const reason = (res as { reason: string }).reason;
        // C16 CA-18 — a refusal must be actionable: WHICH grid, WHAT is blocked, and
        // WHAT the user can do instead. A bare "update failed" is the defect, restated.
        expect(reason).toContain('A');
        expect(reason).toContain('PINNED');
        expect(reason).toContain('position');
        expect(reason).toMatch(/unpin/i);
    });

    it('every geometry key the store strips is a key the command refuses', () => {
        // The two lists must not drift: a key the store silently drops but the command
        // accepts is this defect, re-created for one field.
        const store = storeWithGrid({ isPinned: true });
        for (const key of ['position', 'axis', 'extentMin', 'extentMax'] as const) {
            const updates = { [key]: key === 'axis' ? 'Y' : 99 } as never;
            const res = new UpdateGridCommand({ gridId: 'g1', updates }).canExecute(ctxWith(store));
            expect(res.ok, `pinned grid accepted a change to "${key}"`).toBe(false);
        }
    });

    it('NON-geometry edits still pass while pinned — the guard is not a blanket lock', () => {
        // The store deliberately allows name/colour/visibility on a pinned grid. A
        // command that refused those would be a different defect: a refusal that is
        // wrong. This is the arm that keeps the fix honest in both directions.
        const store = storeWithGrid({ isPinned: true });
        for (const updates of [{ name: 'A-renamed' }, { isVisible: false }, { color: '#ff0000' }]) {
            const res = new UpdateGridCommand({ gridId: 'g1', updates }).canExecute(ctxWith(store));
            expect(res.ok, `pinned grid wrongly refused ${JSON.stringify(updates)}`).toBe(true);
        }
    });

    it('UNPINNING is still expressible — the guard cannot trap a grid pinned forever', () => {
        // `isPinned` is not a geometry key, so the unpin path must survive. If this
        // failed, the fix would have made pinning irreversible through this command.
        const store = storeWithGrid({ isPinned: true });
        const res = new UpdateGridCommand({ gridId: 'g1', updates: { isPinned: false } })
            .canExecute(ctxWith(store));
        expect(res.ok).toBe(true);
    });

    it('an UNPINNED grid moves, and actually moves — the happy path is untouched', () => {
        const store = storeWithGrid({ isPinned: false });
        const cmd = new UpdateGridCommand({ gridId: 'g1', updates: { position: 42 } });
        expect(cmd.canExecute(ctxWith(store)).ok).toBe(true);

        const result = cmd.execute(ctxWith(store));
        expect(result.success).toBe(true);
        // The assertion that separates "reported success" from "did something".
        expect(store.get('g1')!.position).toBe(42);
    });

    it('undo restores the position even when the grid was pinned AFTER the move', () => {
        // Without `_force` on the undo write, the store's pin guard drops the very
        // field undo exists to restore, and undo reports success having restored
        // nothing — the same lie, one layer down.
        const store = storeWithGrid({ isPinned: false });
        const cmd = new UpdateGridCommand({ gridId: 'g1', updates: { position: 42 } });
        cmd.execute(ctxWith(store));
        expect(store.get('g1')!.position).toBe(42);

        store.update('g1', { isPinned: true });
        cmd.undo(ctxWith(store));

        expect(store.get('g1')!.position).toBe(5);
    });
});
