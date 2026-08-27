/**
 * §ROOM-LOSS-NOTICE (L-12660) — C94 §TOBE.1.2 / RM-3 companion, lane §ROOMLOSS160.
 *
 * ## THE DEFECT THIS REPRODUCES, verbatim from the founder's production console
 * (build `f384db56`):
 *
 *     [ReDetectRoomsCommand] §ROOM-LOSS-CENSUS level='L0' — 2 room(s) dropped by
 *     re-detection, 1 carrying authored data. Their records were REMOVED and are NOT
 *     restorable by undo (C94 §TOBE.1.2). Dressing 01 (224.7 m2
 *     authored[name,occupancyType,department]) - Room 00-005 (55.3 m2 authored[none])
 *
 * The SAME session also logged `§DIAG-ROOM-LOOP BREAK … unresolvedLoopBreaks=2` — the
 * moved curtain wall opened a 282mm gap against the 200mm `hostSnap` floor and the
 * boundary loop never closed. Both `roomLossCensus` (RM-0) and `roomTombstoneRegister`
 * (RM-3) already existed at that build — but RM-3's `roomMeaningNotifier` OFFER fires
 * only once a face later reclaims the same footprint (`ReDetectRoomsCommand`'s `offers`
 * loop). When the gap simply never closes — the founder's measured case — that never
 * happens, and the ONLY place the loss was ever recorded was the console line above.
 * §CONTEXT-DATA-HONESTY: a silent destruction of the user's own classification work.
 *
 * These arms pin the fix: `roomLossNotifier` fires ONCE, unconditionally, in the SAME
 * `execute()` that drops an authored room — independent of whether the region is ever
 * reclaimed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomStore } from '@pryzm/room-topology';
import { ReDetectRoomsCommand } from '../src/rooms/ReDetectRoomsCommand';
import {
    clearRoomTombstones, roomMeaningNotifier, roomLossNotifier,
    type RoomLossNotice,
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

/** A closed 8x6 room, with a `wallStore` whose north wall can be pulled to open the
 *  loop and — unlike `roomTombstone.test.ts`'s harness — is never put back. That is
 *  the founder's actual reported shape: a gap that stays open. */
function harness() {
    const walls: unknown[] = [
        wallOf('w-south', [0, 0], [8, 0]), wallOf('w-east', [8, 0], [8, 6]),
        wallOf('w-north', [8, 6], [0, 6]), wallOf('w-west', [0, 6], [0, 0]),
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

beforeEach(() => {
    clearRoomTombstones();
    delete (globalThis as { __pryzmProjectLoadActive?: boolean }).__pryzmProjectLoadActive;
    delete (globalThis as { __pryzmBuildingGenActive?: boolean }).__pryzmBuildingGenActive;
});

describe('§ROOM-LOSS-NOTICE — the founder’s reported case: the gap never closes', () => {
    it('⭐⭐ RED ON HEAD (pre-fix): an authored room dropped by a PERMANENTLY broken loop '
        + 'is announced immediately — the offer channel alone never fires because nothing ever '
        + 'reclaims the space', () => {
        const { walls, roomStore, ctx } = harness();
        const original = roomStore.getByLevel(LEVEL)[0]!;
        const originalId = original.id;

        // The user classifies it — exactly the founder's "Dressing 01" shape: name,
        // occupancyType, department all authored.
        roomStore.update(originalId, {
            name: 'Dressing 01', roomNumber: '00-004', occupancyType: 'changing-room',
            department: 'Residential',
        } as never);

        const offers: unknown[] = [];
        const losses: RoomLossNotice[] = [];
        const offOffer = roomMeaningNotifier.subscribe(o => { offers.push(o); });
        const offLoss = roomLossNotifier.subscribe(n => { losses.push(n); });
        try {
            // Open the boundary — a curtain-wall move leaving a >hostSnap gap that this
            // engine (§L-871, "wall-only arms") has no repair pass for — and, critically,
            // LEAVE IT OPEN. This is the founder's actual measured state, not a transient
            // one: §DIAG-ROOM-LOOP BREAK's gap never closes in his session.
            walls.splice(walls.findIndex((w: any) => w.id === 'w-north'), 1);
            const result = new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
            expect(result.success).toBe(true);
            expect(roomStore.getById(originalId)).toBeUndefined();   // the room is gone
        } finally { offOffer(); offLoss(); }

        // The old mechanism: silence, forever, because nothing ever reclaims the space.
        expect(offers).toHaveLength(0);

        // ⭐ THE FIX: the user is told NOW, in the SAME execute() that dropped the room —
        // not conditioned on some later pass finding a match that, in this shape, will
        // never come.
        expect(losses).toHaveLength(1);
        const notice = losses[0]!;
        expect(notice.levelId).toBe(LEVEL);
        expect(notice.tombstones).toHaveLength(1);
        const t = notice.tombstones[0]!;
        expect(t.meaning.name).toBe('Dressing 01');
        expect(t.meaning.roomNumber).toBe('00-004');
        expect(t.meaning.occupancyType).toBe('changing-room');
        expect(t.meaning.department).toBe('Residential');
        expect(t.census.authored).toBe(true);
    });

    it('⛔ a never-touched room dropped by the same permanent gap produces NO loss notice — '
        + 'there is nothing authored to announce', () => {
        const { walls, roomStore, ctx } = harness();
        expect(roomStore.getByLevel(LEVEL)).toHaveLength(1);   // untouched — no classification

        const losses: RoomLossNotice[] = [];
        const off = roomLossNotifier.subscribe(n => { losses.push(n); });
        try {
            walls.splice(walls.findIndex((w: any) => w.id === 'w-north'), 1);
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
        } finally { off(); }

        expect(losses).toHaveLength(0);
    });

    it('a listener that throws cannot break re-detection', () => {
        const { walls, roomStore, ctx } = harness();
        roomStore.update(roomStore.getByLevel(LEVEL)[0]!.id, { name: 'Kitchen' } as never);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const off = roomLossNotifier.subscribe(() => { throw new Error('boom'); });
        try {
            walls.splice(walls.findIndex((w: any) => w.id === 'w-north'), 1);
            expect(new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx).success).toBe(true);
        } finally { off(); vi.restoreAllMocks(); }
    });

    it('⚠ suppressed during a project load/restore — same gate as the census, so a wholesale '
        + 'reload does not read as user-visible loss', () => {
        const { walls, roomStore, ctx } = harness();
        roomStore.update(roomStore.getByLevel(LEVEL)[0]!.id, {
            name: 'Kitchen', occupancyType: 'kitchen',
        } as never);
        (globalThis as { __pryzmProjectLoadActive?: boolean }).__pryzmProjectLoadActive = true;
        const losses: RoomLossNotice[] = [];
        const off = roomLossNotifier.subscribe(n => { losses.push(n); });
        try {
            walls.splice(walls.findIndex((w: any) => w.id === 'w-north'), 1);
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
        } finally {
            off();
            delete (globalThis as { __pryzmProjectLoadActive?: boolean }).__pryzmProjectLoadActive;
        }
        expect(losses).toHaveLength(0);
    });
});

describe('§ROOM-LOSS-NOTICE — the loss notice does not consume the tombstone, and does not '
    + 'duplicate a LATER RM-3 offer', () => {
    it('drop announces the loss once; a LATER reclaiming pass still fires the RM-3 restore '
        + 'offer normally, exactly once, for the same tombstone', () => {
        const { walls, roomStore, ctx } = harness();
        const originalId = roomStore.getByLevel(LEVEL)[0]!.id;
        roomStore.update(originalId, { name: 'Kitchen', occupancyType: 'kitchen' } as never);

        const offers: unknown[] = [];
        const losses: RoomLossNotice[] = [];
        const offOffer = roomMeaningNotifier.subscribe(o => { offers.push(o); });
        const offLoss = roomLossNotifier.subscribe(n => { losses.push(n); });
        try {
            const north = walls.splice(walls.findIndex((w: any) => w.id === 'w-north'), 1)[0];
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);          // drop — announced now
            walls.push(north);
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);          // reclaim, a later pass
        } finally { offOffer(); offLoss(); }

        // The loss notice does NOT consume the tombstone (only `roomMeaningNotifier`'s own
        // offer loop does, via `consumeTombstone`) — so the later reclaim still offers it.
        expect(losses).toHaveLength(1);   // announced once, on the pass that dropped it
        expect(offers).toHaveLength(1);   // and still offered once, on the pass that reclaimed it
    });
});
