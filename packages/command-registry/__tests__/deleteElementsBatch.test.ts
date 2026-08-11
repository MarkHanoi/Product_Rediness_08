// §FEAT-SCOPED-DELETE (RAC U9.2) — the batch delete's THREE claims, with teeth.
//
// The chat's Confirm card promises three things before the user agrees to it:
// the delete is ONE undo entry, the report is honest about what did not happen,
// and undo brings everything back. This test drives the real command against a
// faithful in-memory furniture store and checks each.
//
// Why furniture: it is the family whose DeleteElementCommand branch also
// CASCADES (child furniture via parentFurnitureId), so the same fixture proves
// the cascade is counted separately from the N-of-M the user agreed to —
// conflating them would overstate the ask on the card.
//
// Data/command test only — no THREE, no DOM.

import { describe, it, expect } from 'vitest';
import { DeleteElementsBatchCommand } from '../src/generic/DeleteElementsBatchCommand';
import type { CommandContext } from '../src/types';

interface FakeFurniture {
    id: string;
    type: 'furniture';
    levelId: string;
    furnitureType: string;
    properties?: Record<string, unknown>;
}

function fur(id: string, parentFurnitureId?: string): FakeFurniture {
    return {
        id,
        type: 'furniture',
        levelId: 'L0',
        furnitureType: 'chair',
        ...(parentFurnitureId !== undefined ? { properties: { parentFurnitureId } } : {}),
    };
}

function makeCtx(items: FakeFurniture[]) {
    const byId = new Map(items.map((f) => [f.id, f]));
    const furnitureStore = {
        get: (id: string) => byId.get(id),
        getAll: () => [...byId.values()],
        add: (f: FakeFurniture) => { byId.set(f.id, f); },
        remove: (id: string) => { byId.delete(id); },
    };
    // DeleteElementCommand's polymorphic guard walks wall → window → door →
    // … before it reaches furniture, so the fixture must offer a wallStore
    // that answers "not mine" rather than being absent.
    const wallStore = {
        getById: () => undefined,
        getWindow: () => undefined,
        getDoor: () => undefined,
        getAll: () => [],
    };
    const ctx = {
        stores: { wallStore, furnitureStore },
        bimManager: { registerElement: () => {}, unregisterElement: () => {} },
        // Short-circuits DeleteElementCommand's `?? window.furnitureFragmentBuilder`
        // fallback, which would be a ReferenceError under the node environment.
        furnitureFragmentBuilder: { removeFurniture: () => {}, updateFurniture: () => {} },
    } as unknown as CommandContext;
    return { ctx, byId };
}

describe('DeleteElementsBatchCommand — one undo entry, honest report', () => {
    it('deletes every id in ONE command and reports N of M', () => {
        const { ctx, byId } = makeCtx([fur('f1'), fur('f2'), fur('f3')]);
        const cmd = new DeleteElementsBatchCommand({
            elementIds: ['f1', 'f2', 'f3'],
            elementKind: 'furniture',
        });

        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);

        expect(r.success).toBe(true);
        expect(byId.size).toBe(0);
        expect(r.info?.[0]).toBe('Deleted 3 of 3 furnitures');
        expect(cmd.skipped).toHaveLength(0);
    });

    it('a stale id is a COUNTED SKIP with its reason, never a silent shrink', () => {
        // The realistic failure: the scope was resolved a moment before the
        // Confirm card was clicked, and one element has since gone.
        const { ctx } = makeCtx([fur('f1'), fur('f2')]);
        const cmd = new DeleteElementsBatchCommand({
            elementIds: ['f1', 'gone', 'f2'],
            elementKind: 'furniture',
        });

        const r = cmd.execute(ctx);

        expect(r.success).toBe(true);
        expect(r.info?.[0]).toBe('Deleted 2 of 3 furnitures — 1 skipped');
        expect(r.info?.[1]).toContain('1×');
        expect(cmd.skipped.map((s) => s.elementId)).toEqual(['gone']);
    });

    it('a batch where NOTHING is deletable refuses instead of reporting success', () => {
        const { ctx } = makeCtx([]);
        const cmd = new DeleteElementsBatchCommand({
            elementIds: ['ghost-1', 'ghost-2'],
            elementKind: 'furniture',
        });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('None of the 2 furnitures');
    });

    it('undo restores every deleted element', () => {
        const { ctx, byId } = makeCtx([fur('f1'), fur('f2')]);
        const cmd = new DeleteElementsBatchCommand({
            elementIds: ['f1', 'f2'],
            elementKind: 'furniture',
        });

        cmd.execute(ctx);
        expect(byId.size).toBe(0);

        const u = cmd.undo(ctx);
        expect(u.success).toBe(true);
        expect([...byId.keys()].sort()).toEqual(['f1', 'f2']);
    });

    it('CASCADED children are reported separately from the N of M agreed to', () => {
        // "Delete the table" also removes its chairs. The card said one item;
        // the report must not claim the user agreed to three.
        const { ctx, byId } = makeCtx([fur('table'), fur('chair-a', 'table'), fur('chair-b', 'table')]);
        const cmd = new DeleteElementsBatchCommand({
            elementIds: ['table'],
            elementKind: 'furniture',
        });

        const r = cmd.execute(ctx);

        expect(byId.size).toBe(0);
        expect(r.info?.[0]).toBe('Deleted 1 of 1 furniture (plus 2 hosted/child elements)');
        expect(r.affectedElementIds).toHaveLength(3);
    });

    it('an empty id list refuses — a destructive verb never runs on nothing', () => {
        const { ctx } = makeCtx([fur('f1')]);
        const v = new DeleteElementsBatchCommand({ elementIds: [] }).canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toBe('No elements to delete.');
    });
});
