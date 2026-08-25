// §CHAT-OPENING-SHAPE (L-10943) — the BATCH profile route, driven through the
// REAL stores.
//
// ⭐ THE ASSERTION THAT MATTERS IS THE WALL ONE, and it is the same one
// `OpeningProfileChangeRoute.test.ts` exists for: `WallStore.updateWindow`
// copies exactly FOUR fields onto `wall.openings[]` (width, height, sillHeight,
// offset). A batch that wrote only the windowStore would report "Changed 3 of 3"
// over three walls still cutting rectangles — the frame and the void diverging
// (C86 §11 #1), which is the defect this whole family keeps producing. So the
// test reads `wall.openings[]`, the record the geometry arms consume, not the
// standalone record that would have passed against a broken version.
//
// ⛔ AND IT DRIVES THE BATCH, NOT THE CHILD. A suite that exercised
// `UpdateWindowParameterCommand` directly would prove nothing about the thing
// this lane shipped: the composition, the counted skips and the ONE undo entry
// are the batch's own contract.

import { describe, it, expect, beforeEach } from 'vitest';
import { wallStore } from '@pryzm/geometry-wall';
import { windowStore as standaloneWindowStore } from '@pryzm/geometry-window';
import { UpdateOpeningProfileBatchCommand } from '../src/generic/UpdateOpeningProfileBatchCommand';

const WALL_ID = 'wall-profile-batch';
const CURVED_WALL_ID = 'wall-profile-batch-curved';

function ctx(): any {
    return { stores: { wallStore } };
}

// ADR-0318 — `WallStore` REFUSES to invent a level rather than answer with a
// fiction, so the engine half must be attached before a wall can be added.
const LEVEL = { id: 'level-0', name: 'Level 0', elevation: 0, height: 3 };
const bimKernel: any = {
    getLevels: () => [LEVEL],
    getLevelById: (id: string) => (id === LEVEL.id ? LEVEL : undefined),
    registerElement: () => {},
};

/** Seed N windows on one straight wall; returns their ids. */
function seed(n: number, opts: { curved?: boolean } = {}): string[] {
    wallStore.attachEngine({} as never, bimKernel);
    wallStore.clear?.();
    standaloneWindowStore.clear?.();

    const wallId = opts.curved === true ? CURVED_WALL_ID : WALL_ID;
    wallStore.add({
        id: wallId,
        type: 'wall',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 20, y: 0, z: 0 }],
        height: 3,
        thickness: 0.3,
        levelId: 'level-0',
        ...(opts.curved === true ? { curve: { control: { x: 10, y: 0, z: 2 }, segments: 12 } } : {}),
    } as never);

    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
        const windowId = `win-batch-${i}`;
        const openingId = `op-batch-${i}`;
        wallStore.addOpening(wallId, {
            id: openingId,
            type: 'window',
            offset: 2 + i * 3,
            width: 1.2,
            height: 1.5,
            sillHeight: 0.9,
            elementId: windowId,
        } as never);
        standaloneWindowStore.add({
            id: windowId,
            openingId,
            wallId,
            offset: 2 + i * 3,
            width: 1.2,
            height: 1.5,
            sillHeight: 0.9,
        } as never);
        ids.push(windowId);
    }
    return ids;
}

function openingFor(windowId: string): any {
    for (const wall of [WALL_ID, CURVED_WALL_ID]) {
        const hit = wallStore.getById(wall)?.openings?.find((o: any) => o.elementId === windowId);
        if (hit) return hit;
    }
    return undefined;
}

describe('§A — ⭐ the founder\'s sentence, at the command layer', () => {
    let ids: string[];
    beforeEach(() => { ids = seed(3); });

    it('⭐⭐ "change all windows to segmental" reaches wall.openings[] for EVERY window', () => {
        const cmd = new UpdateOpeningProfileBatchCommand({
            elementIds: ids,
            elementKind: 'window',
            openingProfile: 'segmental-arch',
        });
        expect(cmd.canExecute(ctx()).ok).toBe(true);
        const res = cmd.execute(ctx());

        expect(res.success).toBe(true);
        expect(res.affectedElementIds).toHaveLength(3);
        for (const id of ids) {
            // Necessary, and NOT sufficient.
            expect(standaloneWindowStore.getById(id)?.openingProfile).toBe('segmental-arch');
            // ⭐ The record every wall-body arm consumes.
            expect(openingFor(id)?.openingProfile).toBe('segmental-arch');
        }
    });

    it('⛔ NON-VACUITY — the seeded windows are NOT already segmental', () => {
        for (const id of ids) expect(openingFor(id)?.openingProfile).toBeUndefined();
    });

    it('the summary states a REAL count and the shape in the mode bar\'s own words', () => {
        const res = new UpdateOpeningProfileBatchCommand({
            elementIds: ids, elementKind: 'window', openingProfile: 'segmental-arch',
        }).execute(ctx());
        expect(res.info?.[0]).toContain('Changed 3 of 3 windows to Segmental');
    });

    it('CIRCULAR squares the box on every window — the child\'s consequence survives the batch', () => {
        new UpdateOpeningProfileBatchCommand({
            elementIds: ids, elementKind: 'window', openingProfile: 'circular',
        }).execute(ctx());
        for (const id of ids) {
            const win = standaloneWindowStore.getById(id)!;
            expect(win.width).toBe(1.2);
            expect(win.height).toBe(1.2);   // carried down from 1.5 — width IS the diameter
            expect(openingFor(id)?.openingProfile).toBe('circular');
        }
    });
});

describe('§B — ONE undo entry, and it really restores', () => {
    it('⭐ undo() puts every window back, on BOTH records', () => {
        const ids = seed(3);
        const cmd = new UpdateOpeningProfileBatchCommand({
            elementIds: ids, elementKind: 'window', openingProfile: 'round-arch',
        });
        expect(cmd.execute(ctx()).success).toBe(true);
        for (const id of ids) expect(openingFor(id)?.openingProfile).toBe('round-arch');

        const undone = cmd.undo(ctx());
        expect(undone.success).toBe(true);
        for (const id of ids) {
            // The pre-edit value was ABSENT (every pre-L-1200 opening is a
            // rectangle by default), so undo restores absence — not 'rectangular'.
            expect(standaloneWindowStore.getById(id)?.openingProfile).toBeUndefined();
            expect(openingFor(id)?.openingProfile).toBeUndefined();
        }
    });

    it('redo after undo re-applies — execute() resets, it does not throw', () => {
        const ids = seed(2);
        const cmd = new UpdateOpeningProfileBatchCommand({
            elementIds: ids, elementKind: 'window', openingProfile: 'round-arch',
        });
        cmd.execute(ctx());
        cmd.undo(ctx());
        expect(cmd.execute(ctx()).success).toBe(true);
        for (const id of ids) expect(openingFor(id)?.openingProfile).toBe('round-arch');
    });
});

describe('§C — ⛔ a stale id is a COUNTED SKIP, never a repaired one', () => {
    it('reports "Changed N of M" with the reason, and still applies the rest', () => {
        const ids = seed(3);
        const res = new UpdateOpeningProfileBatchCommand({
            elementIds: [...ids, 'win-that-never-existed'],
            elementKind: 'window',
            openingProfile: 'segmental-arch',
        }).execute(ctx());

        expect(res.success).toBe(true);
        expect(res.affectedElementIds).toHaveLength(3);
        expect(res.info?.[0]).toContain('Changed 3 of 4');
        expect(res.info?.[0]).toContain('1 skipped');
        expect(res.info!.join(' ')).toMatch(/not found/i);
    });

    it('⛔ a batch where NOTHING is reshapable REFUSES — it does not report a cheerful no-op', () => {
        seed(1);
        const cmd = new UpdateOpeningProfileBatchCommand({
            elementIds: ['ghost-a', 'ghost-b'], elementKind: 'window', openingProfile: 'circular',
        });
        const v = cmd.canExecute(ctx());
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('None of the 2 windows');
    });

    it('an EMPTY id set is a visible decline', () => {
        seed(1);
        const v = new UpdateOpeningProfileBatchCommand({
            elementIds: [], elementKind: 'window', openingProfile: 'circular',
        }).canExecute(ctx());
        expect(v.ok).toBe(false);
    });
});

describe('§D — ⛔ the FAMILY rule is stated once, not N times', () => {
    it('a door batch asking for CIRCULAR refuses BY NAME, before any child runs', () => {
        seed(2);
        const cmd = new UpdateOpeningProfileBatchCommand({
            elementIds: ['d1', 'd2'], elementKind: 'door', openingProfile: 'circular',
        });
        const v = cmd.canExecute(ctx());
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/door cannot be circular/i);
        expect(v.reason).toMatch(/notch/i);
        // and it offers the three a door CAN be
        expect(v.reason).toMatch(/Rectangular/);
        expect(v.reason).toMatch(/Segmental/);
    });

    it('⛔ NON-VACUITY — a door batch asking for SEGMENTAL is not refused by the family gate', () => {
        seed(0);
        const cmd = new UpdateOpeningProfileBatchCommand({
            elementIds: ['d1'], elementKind: 'door', openingProfile: 'segmental-arch',
        });
        // It still refuses — the ids are not real doors — but NOT with the family rule.
        const v = cmd.canExecute(ctx());
        expect(v.reason ?? '').not.toMatch(/notch/i);
    });

    it('execute() re-checks the family rule — a validator in one caller is a bypassed validator', () => {
        seed(0);
        const res = new UpdateOpeningProfileBatchCommand({
            elementIds: ['d1'], elementKind: 'door', openingProfile: 'circular',
        }).execute(ctx());
        expect(res.success).toBe(false);
        expect(res.info?.[0]).toMatch(/notch/i);
    });
});

describe('§E — ⛔ a CURVED host refuses, out loud, and the model is unchanged', () => {
    it('the reason and the live alternative both survive the batch', () => {
        const ids = seed(2, { curved: true });
        const res = new UpdateOpeningProfileBatchCommand({
            elementIds: ids, elementKind: 'window', openingProfile: 'circular',
        }).execute(ctx());

        expect(res.success).toBe(false);
        const text = (res.info ?? []).join(' ').toLowerCase();
        expect(text).toContain('curved');
        expect(text).toContain('straight wall');   // C16 CA-18 — the live alternative
        for (const id of ids) expect(openingFor(id)?.openingProfile).toBeUndefined();
    });

    it('the same curved host still accepts RECTANGULAR — non-vacuity', () => {
        const ids = seed(2, { curved: true });
        const res = new UpdateOpeningProfileBatchCommand({
            elementIds: ids, elementKind: 'window', openingProfile: 'rectangular',
        }).execute(ctx());
        expect(res.success).toBe(true);
    });
});

describe('§F — hygiene', () => {
    it('duplicate ids are de-duplicated, so one window is never counted twice', () => {
        const ids = seed(2);
        const cmd = new UpdateOpeningProfileBatchCommand({
            elementIds: [...ids, ids[0]!], elementKind: 'window', openingProfile: 'round-arch',
        });
        expect(cmd.targetIds).toHaveLength(2);
        expect(cmd.execute(ctx()).info?.[0]).toContain('Changed 2 of 2');
    });

    it('serialize() carries the wire shape', () => {
        const ids = seed(1);
        const s = new UpdateOpeningProfileBatchCommand({
            elementIds: ids, elementKind: 'window', openingProfile: 'segmental-arch',
        }).serialize();
        expect(s.type).toBe('UPDATE_OPENING_PROFILE_BATCH');
        expect((s.payload as any).openingProfile).toBe('segmental-arch');
        expect((s.payload as any).elementKind).toBe('window');
    });
});
