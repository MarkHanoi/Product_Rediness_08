/**
 * §MERGE-AWARDS-NOBODY (L-10815) — C94 **R-3**, ruled 2026-08-24.
 *
 * > **REFUSE TO AWARD. TOMBSTONE BOTH HALVES. OFFER.**
 *
 * ## THE FAILURE BEING CLOSED IS *SILENT MISATTRIBUTION*, NOT LOSS
 *
 * When two authored rooms merged into one face, both claimed it and the winner was
 * decided — after a near-identical `overlap` — by **centroid distance**, a quantity with
 * no semantic meaning (`RoomDetectionEngine.ts:1122-1131`). The survivor then carried one
 * room's polygon under the OTHER room's name, number, occupancy and IFC identity.
 *
 * ⭐ **Losing a name is visible; a WRONG name is not.** A model that reads correct and
 * exports wrong is the one a user can ship to a client without ever noticing. So the arms
 * below assert the misattribution is **IMPOSSIBLE, not merely unlikely**: after a merge of
 * two authored rooms the survivor carries **NEITHER** name until a human chooses.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RoomStore, RoomDetectionEngine } from '@pryzm/room-topology';
import { ReDetectRoomsCommand } from '../src/rooms/ReDetectRoomsCommand';
import {
    clearRoomTombstones, listTombstones, roomMeaningNotifier, isMergeOffer,
    type RoomMeaningOffer,
} from '../src/rooms/roomTombstoneRegister';
import type { CommandContext } from '../src/types';

const LEVEL = 'L0';

const bimManagerStub = {
    getLevelById: (id: string) => (id === LEVEL ? { id, elevation: 0, height: 2.7 } : undefined),
    getLevels: () => [{ id: LEVEL, elevation: 0, height: 2.7 }],
    registerElement: () => {}, unregisterElement: () => {},
};

function wallOf(id: string, s: [number, number], e: [number, number]): unknown {
    return {
        id, type: 'wall',
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 2.7, thickness: 0.2, baseOffset: 0, levelId: LEVEL,
        childrenIds: [], openings: [],
        metadata: { createdAt: 0, modifiedAt: 0, createdBy: 'test', version: 1 },
    };
}

/**
 * TWO rooms side by side, sharing one partition:
 *
 *     0,0 ────── 8,0 ────── 16,0
 *      │    A     │     B     │
 *     0,6 ────── 8,6 ────── 16,6
 *
 * Removing `w-mid` merges them into one 16x6 space — the founder's exact event.
 */
function twoRoomHarness() {
    const walls: unknown[] = [
        wallOf('w-s1', [0, 0], [8, 0]), wallOf('w-s2', [8, 0], [16, 0]),
        wallOf('w-e', [16, 0], [16, 6]),
        wallOf('w-n2', [16, 6], [8, 6]), wallOf('w-n1', [8, 6], [0, 6]),
        wallOf('w-w', [0, 6], [0, 0]),
        wallOf('w-mid', [8, 0], [8, 6]),
    ];
    const wallStore = {
        getByLevel: (l: string) => (l === LEVEL ? walls : []),
        getById: (id: string) => walls.find((w: any) => w.id === id),
        getAll: () => walls, subscribe: () => () => {},
    };
    const roomStore = new RoomStore(null, bimManagerStub as never);
    const ctx = { stores: { roomStore, wallStore }, bimManager: bimManagerStub } as unknown as CommandContext;
    new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
    return { walls, roomStore, ctx };
}

function removeMid(walls: unknown[]): unknown {
    return walls.splice(walls.findIndex((w: any) => w.id === 'w-mid'), 1)[0];
}

beforeEach(() => { clearRoomTombstones(); });

describe('§MERGE-AWARDS-NOBODY — the merged space carries NEITHER name', () => {
    it('⭐⭐ RED ON HEAD: two authored rooms merge and the survivor is UNNAMED', () => {
        const { walls, roomStore, ctx } = twoRoomHarness();
        const before = roomStore.getByLevel(LEVEL);
        expect(before).toHaveLength(2);

        // Both rooms are authored, with names a user would recognise.
        const [a, b] = before;
        roomStore.update(a!.id, { name: 'Living', occupancyType: 'living-room' } as never);
        roomStore.update(b!.id, { name: 'Kitchen', occupancyType: 'kitchen' } as never);

        removeMid(walls);
        new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);

        const after = roomStore.getByLevel(LEVEL);
        expect(after).toHaveLength(1);
        const survivor = after[0]!;

        // ⭐ THE WHOLE POINT OF THE RULING: neither name was awarded.
        expect(survivor.name).not.toBe('Living');
        expect(survivor.name).not.toBe('Kitchen');
        expect(survivor.occupancyType).not.toBe('living-room');
        expect(survivor.occupancyType).not.toBe('kitchen');

        // ⛔ AND NO IDENTITY EITHER — the survivor is a NEW room, not one of the two.
        expect(survivor.id).not.toBe(a!.id);
        expect(survivor.id).not.toBe(b!.id);
    });

    it('⭐ BOTH rooms are tombstoned — proven where no offer consumes them', () => {
        // ⚠ THIS ARM DELIBERATELY DOES NOT USE THE MERGE. On a merge the tombstones are
        // captured and then CONSUMED in the same command, at the moment the offer is
        // published — so reading the register afterwards correctly shows it empty, and an
        // earlier draft of this arm failed for exactly that reason. The capture is proven
        // here instead by a case where nothing comes home to claim them: open the shell
        // so NO room closes at all. Both records die, both meanings are kept.
        const { walls, roomStore, ctx } = twoRoomHarness();
        const [a, b] = roomStore.getByLevel(LEVEL);
        roomStore.update(a!.id, { name: 'Living' } as never);
        roomStore.update(b!.id, { name: 'Kitchen' } as never);

        removeMid(walls);
        walls.splice(walls.findIndex((w: any) => w.id === 'w-n1'), 1);
        walls.splice(walls.findIndex((w: any) => w.id === 'w-n2'), 1);
        new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);

        expect(roomStore.getByLevel(LEVEL)).toHaveLength(0);
        expect(listTombstones(LEVEL).map(t => t.meaning.name).sort()).toEqual(['Kitchen', 'Living']);
    });

    it('⭐ the user is OFFERED both, as ONE offer with TWO candidates', () => {
        const { walls, roomStore, ctx } = twoRoomHarness();
        const [a, b] = roomStore.getByLevel(LEVEL);
        roomStore.update(a!.id, { name: 'Living' } as never);
        roomStore.update(b!.id, { name: 'Kitchen' } as never);

        const offers: RoomMeaningOffer[] = [];
        const off = roomMeaningNotifier.subscribe(o => { offers.push(o); });
        try {
            removeMid(walls);
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
        } finally { off(); }

        expect(offers).toHaveLength(1);
        expect(isMergeOffer(offers[0]!.candidates)).toBe(true);
        expect(offers[0]!.candidates.map(c => c.meaning.name).sort()).toEqual(['Kitchen', 'Living']);
        // The offer names the NEW room, never one of the lost ones.
        expect(offers[0]!.roomId).not.toBe(a!.id);
        expect(offers[0]!.roomId).not.toBe(b!.id);
    });
});

describe('§MERGE-AWARDS-NOBODY — what it deliberately does NOT change', () => {
    it('⛔ THE SPLIT DIRECTION IS UNTOUCHED — one room, two faces, PARTITION-FIX still awards', () => {
        // The transpose of a merge. Start merged, then draw the partition back in: two
        // faces claim ONE room, which is decided by `used` exactly as before. If this
        // arm ever fails, §MERGE-AWARDS-NOBODY has over-reached into the split case.
        const { walls, roomStore, ctx } = twoRoomHarness();
        const mid = removeMid(walls);
        new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
        const merged = roomStore.getByLevel(LEVEL)[0]!;
        roomStore.update(merged.id, { name: 'Great Room' } as never);

        walls.push(mid);
        new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);

        const after = roomStore.getByLevel(LEVEL);
        expect(after).toHaveLength(2);
        // Exactly ONE half inherits the parent id and its name — the PARTITION-FIX result.
        expect(after.filter(r => r.id === merged.id)).toHaveLength(1);
        expect(after.filter(r => r.name === 'Great Room')).toHaveLength(1);
    });

    it('an ordinary RESHAPE still keeps its identity — one claimant, no contest', () => {
        const { walls, roomStore, ctx } = twoRoomHarness();
        const [a] = roomStore.getByLevel(LEVEL);
        roomStore.update(a!.id, { name: 'Living' } as never);

        // Move the west wall out: room A reshapes, nothing merges.
        const w = walls.find((x: any) => x.id === 'w-w') as any;
        w.baseLine = [{ x: -2, y: 0, z: 6 }, { x: -2, y: 0, z: 0 }];
        const s1 = walls.find((x: any) => x.id === 'w-s1') as any;
        s1.baseLine = [{ x: -2, y: 0, z: 0 }, { x: 8, y: 0, z: 0 }];
        const n1 = walls.find((x: any) => x.id === 'w-n1') as any;
        n1.baseLine = [{ x: 8, y: 0, z: 6 }, { x: -2, y: 0, z: 6 }];

        new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);

        const living = roomStore.getByLevel(LEVEL).find(r => r.name === 'Living');
        expect(living).toBeDefined();
        expect(living!.id).toBe(a!.id);          // identity survived a plain reshape
    });

    it('⭐⭐ MOVING THE SHARED PARTITION IS A RESHAPE, NOT A MERGE — both keep their names', () => {
        // ⚠ THE ARM THAT CAUGHT THE FIRST IMPLEMENTATION OF THIS RULE, kept here so the
        // over-reach cannot come back. The first rule was "two or more claimants means a
        // merge", on the reasoning that a mere neighbour never clears
        // STRUCTURAL_MATCH_MIN_OVERLAP. That is true for two rooms sharing ONE party wall
        // out of 4+4 (~0.14) — but two rooms made by PARTITIONING one rectangle share
        // THREE walls (both long sides and the partition), so each scores 3/5 = 0.6
        // against the other's face and files an ordinary claim. Moving the shared
        // partition therefore READ AS A MERGE and both rooms lost their names.
        //
        // ⭐ Competition alone is not a merge. A merge is competition where the loser has
        // NOWHERE ELSE TO GO. Here both rooms are assigned — each to its own face — so
        // nothing is contested.
        const { walls, roomStore, ctx } = twoRoomHarness();
        const [a, b] = [...roomStore.getByLevel(LEVEL)]
            .sort((x, y) => x.computed.centroid.x - y.computed.centroid.x);
        roomStore.update(a!.id, { name: 'Living' } as never);
        roomStore.update(b!.id, { name: 'Kitchen' } as never);

        // Slide the shared partition from x = 8 to x = 11: Living grows, Kitchen shrinks.
        const mid = walls.find((w: any) => w.id === 'w-mid') as any;
        mid.baseLine = [{ x: 11, y: 0, z: 0 }, { x: 11, y: 0, z: 6 }];
        const s1 = walls.find((w: any) => w.id === 'w-s1') as any;
        s1.baseLine = [{ x: 0, y: 0, z: 0 }, { x: 11, y: 0, z: 0 }];
        const s2 = walls.find((w: any) => w.id === 'w-s2') as any;
        s2.baseLine = [{ x: 11, y: 0, z: 0 }, { x: 16, y: 0, z: 0 }];
        const n1 = walls.find((w: any) => w.id === 'w-n1') as any;
        n1.baseLine = [{ x: 11, y: 0, z: 6 }, { x: 0, y: 0, z: 6 }];
        const n2 = walls.find((w: any) => w.id === 'w-n2') as any;
        n2.baseLine = [{ x: 16, y: 0, z: 6 }, { x: 11, y: 0, z: 6 }];

        new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);

        const after = [...roomStore.getByLevel(LEVEL)]
            .sort((x, y) => x.computed.centroid.x - y.computed.centroid.x);
        expect(after).toHaveLength(2);
        // ⭐ BOTH identities survive, each on its own side. No tombstone, no offer.
        expect(after[0]!.name).toBe('Living');
        expect(after[1]!.name).toBe('Kitchen');
        expect(after[0]!.id).toBe(a!.id);
        expect(after[1]!.id).toBe(b!.id);
        expect(listTombstones(LEVEL)).toHaveLength(0);
    });

    it('a merge of two NEVER-TOUCHED rooms produces no tombstones and no offer', () => {
        const { walls, ctx } = twoRoomHarness();
        const offers: RoomMeaningOffer[] = [];
        const off = roomMeaningNotifier.subscribe(o => { offers.push(o); });
        try {
            removeMid(walls);
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
        } finally { off(); }
        expect(listTombstones(LEVEL)).toHaveLength(0);
        expect(offers).toHaveLength(0);
    });
});

describe('§MERGE-AWARDS-NOBODY — undoing the merge (C94 R-3 condition 5)', () => {
    it('⚠ MEASURED: putting the wall back yields two rooms, and neither carries a stale name', () => {
        // The user merges, is asked, and presses Ctrl+Z before answering. The undo re-runs
        // detection from the restored walls. What must NOT happen is a name reappearing on
        // the wrong half — the very misattribution this ruling removed.
        const { walls, roomStore, ctx } = twoRoomHarness();
        const [a, b] = roomStore.getByLevel(LEVEL);
        roomStore.update(a!.id, { name: 'Living' } as never);
        roomStore.update(b!.id, { name: 'Kitchen' } as never);

        const mid = removeMid(walls);
        new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
        expect(roomStore.getByLevel(LEVEL)).toHaveLength(1);

        walls.push(mid);                                  // the undo
        new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);

        const after = roomStore.getByLevel(LEVEL);
        expect(after).toHaveLength(2);
        // ⭐ Both halves come back UNNAMED. The meaning was already offered once and the
        // tombstones consumed, so nothing re-attaches itself behind the user's back.
        expect(after.map(r => r.name)).not.toContain('Living');
        expect(after.map(r => r.name)).not.toContain('Kitchen');
    });

    it('⭐ the offer is put ONCE — an undo/redo cycle does not re-ask', () => {
        const { walls, roomStore, ctx } = twoRoomHarness();
        const [a, b] = roomStore.getByLevel(LEVEL);
        roomStore.update(a!.id, { name: 'Living' } as never);
        roomStore.update(b!.id, { name: 'Kitchen' } as never);

        const offers: RoomMeaningOffer[] = [];
        const off = roomMeaningNotifier.subscribe(o => { offers.push(o); });
        try {
            const mid = removeMid(walls);
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);   // merge  -> 1 offer
            walls.push(mid);
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);   // undo   -> none
            removeMid(walls);
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);   // redo   -> none
        } finally { off(); }

        // Consumed on publish: the question was answered by being asked, and a channel
        // that re-asks on every wall nudge is the one that gets muted.
        expect(offers).toHaveLength(1);
    });
});
