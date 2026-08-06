// ─── §FIX-STAIR-RAILING-TYPE-PICKER — the stair-railing type swap command ────────
//
// THE DEFECT THIS PINS: `CommandType.UPDATE_STAIR_RAILING` had been declared in the
// enum since the railing sub-system was authored and NO command ever implemented it.
// §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) closed the swap for the STANDALONE handrail
// family only (`handrailStore` / `UpdateHandrailCommand`); a stair's railing is a
// different element in a different store, so it had no update path of any kind and
// the property panel showed "Element Type —" with no picker.
//
// Asserted here:
//   (1) a catalogue type is materialised WHOLE onto the record the builder reads,
//       and the type's HEIGHT / INFILL drive the geometry fields;
//   (2) the element id, its host stair and its side are untouched — a TYPE change is
//       in place, never a delete + recreate, and never a re-side;
//   (3) undo restores the EXACT prior record — including UNSETTING `typeId` on a
//       railing that had never been individually typed (a merge cannot do this, which
//       is why the store gained `restoreSnapshot`);
//   (4) the store emits an update so the mesh rebuilds (the builder now listens);
//   (5) the command REFUSES out-of-range or non-finite geometry rather than writing
//       NaN into the store.

import { describe, it, expect, beforeEach } from 'vitest';
import { handrailTypeStore } from '@pryzm/core-app-model';
import { resolveStairRailingTypeFields } from '@pryzm/geometry-stair';
import { UpdateStairRailingCommand } from '../src/stair/UpdateStairRailingCommand';
import type { CommandContext } from '../src/types';

const RAIL_ID = 'test-stair-railing-1';

function makeRailing(): Record<string, unknown> {
    return {
        id: RAIL_ID,
        stairId: 'stair-1',
        side: 'left',
        topRailHeight: 1.1,
        handrailHeight: 0.9,
        balusterSpacing: 0.15,
        balusterShape: 'rectangular',
        balusterWidth: 0.04,
        postAtStart: true,
        postAtEnd: true,
        material: 'steel',
        railingType: 'flat-bar',
        // NOTE: no `typeId` — the pre-fix state of every railing in every project.
    };
}

/** Faithful in-memory StairRailingStore stub: merge on update, verbatim on restore. */
function makeCtx() {
    const map = new Map<string, Record<string, unknown>>([[RAIL_ID, makeRailing()]]);
    const updates: string[] = [];
    const stairRailingStore = {
        get: (id: string) => map.get(id),
        update: (id: string, patch: Record<string, unknown>) => {
            const cur = map.get(id);
            if (!cur) return;
            map.set(id, { ...cur, ...patch });
            updates.push(id);
        },
        restoreSnapshot: (id: string, record: Record<string, unknown>) => {
            map.set(id, record);
            updates.push(id);
        },
    };
    return {
        ctx: { stores: { stairRailingStore } } as unknown as CommandContext,
        read: () => map.get(RAIL_ID)!,
        updates,
    };
}

describe('stair-railing type swap — §FIX-STAIR-RAILING-TYPE-PICKER', () => {
    let env: ReturnType<typeof makeCtx>;
    beforeEach(() => { env = makeCtx(); });

    it('(1) materialises a catalogue type WHOLE; height + infill drive the geometry', () => {
        const def = handrailTypeStore.getById('glass-guardrail')!;
        const fields = resolveStairRailingTypeFields(def);

        const cmd = new UpdateStairRailingCommand({ id: RAIL_ID, ...fields });
        expect(cmd.canExecute(env.ctx).ok).toBe(true);
        expect(cmd.execute(env.ctx).success).toBe(true);

        const after = env.read();
        expect(after.typeId).toBe('glass-guardrail');
        // INFILL → construction form (the builder's switch), HEIGHT → top rail.
        expect(after.railingType).toBe('glass-panel');
        expect(after.topRailHeight).toBe(def.height);
        expect(after.balusterWidth).toBe(def.thickness);
        expect(after.material).toBe('steel');
    });

    it('(1) a 900 mm open round type produces the circular form at 0.9 m', () => {
        const def = handrailTypeStore.getById('stainless-handrail')!;
        new UpdateStairRailingCommand({ id: RAIL_ID, ...resolveStairRailingTypeFields(def) }).execute(env.ctx);
        const after = env.read();
        expect(after.railingType).toBe('circular');
        expect(after.topRailHeight).toBe(0.9);
        expect(after.balusterShape).toBe('round');
        expect(after.material).toBe('chrome');
    });

    it('(1) the "no posts" type suppresses the newel posts', () => {
        const def = handrailTypeStore.getById('stair-handrail')!;
        new UpdateStairRailingCommand({ id: RAIL_ID, ...resolveStairRailingTypeFields(def) }).execute(env.ctx);
        expect(env.read().postAtStart).toBe(false);
        expect(env.read().postAtEnd).toBe(false);
    });

    it('(2) in place — id, host stair and side survive the swap', () => {
        const before = structuredClone(env.read());
        const def = handrailTypeStore.getById('timber-baluster')!;
        new UpdateStairRailingCommand({ id: RAIL_ID, ...resolveStairRailingTypeFields(def) }).execute(env.ctx);

        const after = env.read();
        expect(after.id).toBe(RAIL_ID);
        expect(after.stairId).toBe(before.stairId);
        expect(after.side).toBe(before.side);
        // A type change describes nothing about spacing, so spacing is untouched.
        expect(after.balusterSpacing).toBe(before.balusterSpacing);
    });

    it('(3) undo restores the EXACT prior record, UNSETTING typeId', () => {
        const before = structuredClone(env.read());
        expect(before.typeId).toBeUndefined();

        const def = handrailTypeStore.getById('timber-baluster')!;
        const cmd = new UpdateStairRailingCommand({ id: RAIL_ID, ...resolveStairRailingTypeFields(def) });
        cmd.execute(env.ctx);
        expect(env.read().typeId).toBe('timber-baluster');

        expect(cmd.undo(env.ctx).success).toBe(true);
        expect(env.read()).toEqual(before);
        // The point of restoreSnapshot: a merge could not have removed this key, and a
        // railing that keeps claiming a type it no longer has stops following its stair.
        expect('typeId' in env.read()).toBe(false);
    });

    it('(4) the store is notified so the railing mesh rebuilds', () => {
        const def = handrailTypeStore.getById('steel-guardrail')!;
        new UpdateStairRailingCommand({ id: RAIL_ID, ...resolveStairRailingTypeFields(def) }).execute(env.ctx);
        expect(env.updates).toContain(RAIL_ID);
    });

    it('(5) REFUSES an unknown railing rather than silently succeeding', () => {
        const cmd = new UpdateStairRailingCommand({ id: 'nope', topRailHeight: 1.0 });
        expect(cmd.canExecute(env.ctx).ok).toBe(false);
    });

    it('(5) REFUSES out-of-range / non-finite geometry instead of writing NaN', () => {
        for (const bad of [Number.NaN, 0, -1, 9]) {
            expect(new UpdateStairRailingCommand({ id: RAIL_ID, topRailHeight: bad }).canExecute(env.ctx).ok).toBe(false);
        }
        for (const bad of [Number.NaN, 0, -0.02]) {
            expect(new UpdateStairRailingCommand({ id: RAIL_ID, balusterWidth: bad }).canExecute(env.ctx).ok).toBe(false);
            expect(new UpdateStairRailingCommand({ id: RAIL_ID, balusterSpacing: bad }).canExecute(env.ctx).ok).toBe(false);
        }
        expect(env.read().topRailHeight).toBe(1.1);   // untouched by the refusals
    });
});
