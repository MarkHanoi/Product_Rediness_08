/**
 * §ROOM-TOMBSTONE (L-10814) — C94 §TOBE.6 **RM-3**.
 *
 * ## THE FOUNDER'S RULING, 2026-08-24: DERIVATION + TOMBSTONE
 *
 * Keep derivation exactly as it is; make the LOSS durable instead of the room; OFFER the
 * former name / number / occupancy back, never re-apply it.
 *
 * ## ⭐ THE ARM THAT ENCODES THE RULING'S BOUNDARY
 *
 * `the recovered room keeps a DIFFERENT id` is the most important assertion in this file.
 * The ruling grants **meaning, not identity** — rooms stay a pure function of walls, RM-5
 * stays blocked, and the four C72 §9.4 ledger cells stay SILENT. If a future lane ever
 * makes that arm fail, it has quietly granted persistent identity that was never ruled.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomStore } from '@pryzm/room-topology';
import { ReDetectRoomsCommand } from '../src/rooms/ReDetectRoomsCommand';
import {
    captureRoomTombstone, findTombstonesFor, consumeTombstone, clearRoomTombstones,
    listTombstones, describeTombstoneLimits, describeRoomTombstoneState,
    roomMeaningNotifier, MAX_TOMBSTONES_PER_LEVEL,
    type RoomMeaningOffer,
} from '../src/rooms/roomTombstoneRegister';
import type { CommandContext } from '../src/types';

const LEVEL = 'L0';

function uuid(n: number): string {
    return `746ae083-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/** A square room of `size` m centred on (cx, cz), with whatever meaning is passed in. */
function roomAt(n: number, cx: number, cz: number, size: number, over: Record<string, unknown> = {}): any {
    const h = size / 2;
    const area = size * size;
    return {
        id: uuid(n), type: 'room', levelId: LEVEL, parentId: LEVEL,
        name: 'Room 00-001', roomNumber: '00-001',
        boundary: {
            polygon: [
                { x: cx - h, z: cz - h }, { x: cx + h, z: cz - h },
                { x: cx + h, z: cz + h }, { x: cx - h, z: cz + h },
            ],
            height: 2.7, baseOffset: 0, detectionMethod: 'auto-topology',
        },
        boundingWallIds: ['w1', 'w2', 'w3', 'w4'],
        boundingSlabIds: [], boundingColumnIds: [],
        occupancyType: 'unclassified', finishes: {}, properties: {},
        computed: {
            area, grossArea: area, perimeter: size * 4,
            volume: area * 2.7, centroid: { x: cx, z: cz },
            boundingBox: { minX: cx - h, minZ: cz - h, maxX: cx + h, maxZ: cz + h },
        },
        metadata: { createdAt: 1, modifiedAt: 1, createdBy: 'test', version: 1, detectionVersion: 1 },
        ...over,
    };
}

/** The authored room the founder cares about: named, numbered, classified. */
const AUTHORED = {
    name: 'Kitchen', roomNumber: 'G.101', occupancyType: 'kitchen',
    department: 'Domestic', revitId: '884201',
};

beforeEach(() => { clearRoomTombstones(); });

describe('§ROOM-TOMBSTONE — only AUTHORED meaning is kept', () => {
    it('⭐ an authored room is tombstoned, and its meaning is captured whole', () => {
        const t = captureRoomTombstone(roomAt(1, 0, 0, 4, AUTHORED));
        expect(t).toBeDefined();
        expect(t!.meaning.name).toBe('Kitchen');
        expect(t!.meaning.roomNumber).toBe('G.101');
        expect(t!.meaning.occupancyType).toBe('kitchen');
        expect(t!.meaning.department).toBe('Domestic');
        expect(t!.meaning.revitId).toBe('884201');
        // The census record is REUSED, not re-derived — one implementation (L-10812).
        expect(t!.census.authored).toBe(true);
        expect(t!.census.areaM2).toBeCloseTo(16, 3);
    });

    it('⛔ a never-touched room is NOT tombstoned — it has no meaning to offer', () => {
        expect(captureRoomTombstone(roomAt(2, 0, 0, 4))).toBeUndefined();
        expect(listTombstones()).toHaveLength(0);
    });

    it('a room with no usable polygon is not kept — there would be nothing to match on', () => {
        const r = roomAt(3, 0, 0, 4, AUTHORED);
        r.boundary.polygon = [{ x: 0, z: 0 }];
        expect(captureRoomTombstone(r)).toBeUndefined();
    });

    it('never throws on a malformed record — it runs inside a delete that already began', () => {
        expect(() => captureRoomTombstone({} as never)).not.toThrow();
        expect(captureRoomTombstone({} as never)).toBeUndefined();
    });
});

describe('§ROOM-TOMBSTONE — the bound the ruling was chosen for', () => {
    it(`⭐ holds at most ${MAX_TOMBSTONES_PER_LEVEL} per level, FIFO — bounded by rooms lost, never by N`, () => {
        for (let i = 0; i < MAX_TOMBSTONES_PER_LEVEL + 10; i++) {
            captureRoomTombstone(roomAt(100 + i, i * 10, 0, 4, { ...AUTHORED, name: `Room-${i}` }));
        }
        const held = listTombstones(LEVEL);
        expect(held).toHaveLength(MAX_TOMBSTONES_PER_LEVEL);
        // FIFO: the OLDEST are gone, the newest survive.
        expect(held.some(t => t.meaning.name === 'Room-0')).toBe(false);
        expect(held.some(t => t.meaning.name === `Room-${MAX_TOMBSTONES_PER_LEVEL + 9}`)).toBe(true);
    });

    it('⛔ C13/ADR-0298 — a project switch clears it, or a wrong offer would look right', () => {
        captureRoomTombstone(roomAt(4, 0, 0, 4, AUTHORED));
        expect(describeRoomTombstoneState().tombstones).toBe(1);
        clearRoomTombstones();
        expect(describeRoomTombstoneState().tombstones).toBe(0);
        expect(listTombstones()).toHaveLength(0);
    });
});

describe('§ROOM-TOMBSTONE — matching a region that came home', () => {
    it('matches a face whose shape contains the lost room’s centroid', () => {
        captureRoomTombstone(roomAt(5, 0, 0, 4, AUTHORED));
        expect(findTombstonesFor(roomAt(6, 0, 0, 4))[0]!.meaning.name).toBe('Kitchen');
    });

    it('⛔ refuses a face somewhere else entirely', () => {
        captureRoomTombstone(roomAt(7, 0, 0, 4, AUTHORED));
        expect(findTombstonesFor(roomAt(8, 50, 50, 4))).toHaveLength(0);
    });

    it('⛔ refuses a face of wildly different area even when it contains the centroid', () => {
        // A 4 m room died; a 20 m hall now covers the spot. Same place, different room.
        captureRoomTombstone(roomAt(9, 0, 0, 4, AUTHORED));
        expect(findTombstonesFor(roomAt(10, 0, 0, 20))).toHaveLength(0);
    });

    it('is offered at most once — a declined question is answered, not re-asked', () => {
        const t = captureRoomTombstone(roomAt(11, 0, 0, 4, AUTHORED))!;
        expect(findTombstonesFor(roomAt(12, 0, 0, 4))).toHaveLength(1);
        consumeTombstone(t);
        expect(findTombstonesFor(roomAt(13, 0, 0, 4))).toHaveLength(0);
    });
});

describe('§ROOM-TOMBSTONE — the honesty condition the founder attached to the ruling', () => {
    it('⭐ the limits sentence says a restored name does NOT re-anchor what pointed at the old room', () => {
        const s = describeTombstoneLimits();
        expect(s).toContain('details only');
        expect(s).toMatch(/new room/i);
        expect(s).toMatch(/room tag|schedule/i);
        // ⛔ It must not imply the room itself came back.
        expect(s).not.toMatch(/restored the room|same room|as it was/i);
    });
});

describe('§ROOM-TOMBSTONE — the round trip, through the real command', () => {
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

    it('⭐⭐ RED ON HEAD: name, number and occupancy come back — and the room id is DIFFERENT', () => {
        const { walls, roomStore, ctx } = harness();
        const original = roomStore.getByLevel(LEVEL)[0]!;
        const originalId = original.id;

        // The user authors it.
        roomStore.update(originalId, {
            name: 'Kitchen', roomNumber: 'G.101', occupancyType: 'kitchen',
        } as never);

        const offers: RoomMeaningOffer[] = [];
        const off = roomMeaningNotifier.subscribe(o => { offers.push(o); });
        try {
            // Open the boundary — the room dies, unrecoverably (C94 §TOBE.1.2).
            const north = walls.splice(walls.findIndex((w: any) => w.id === 'w-north'), 1)[0];
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
            expect(roomStore.getById(originalId)).toBeUndefined();
            expect(offers).toHaveLength(0);          // nothing to offer yet — it is still gone

            // Close it again. The region comes home as a BRAND NEW room.
            walls.push(north);
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
        } finally { off(); }

        expect(offers).toHaveLength(1);
        const offer = offers[0]!;

        // ⭐ THE RULING'S BOUNDARY: meaning is offerable, identity is NOT restored.
        expect(offer.roomId).not.toBe(originalId);
        expect(roomStore.getById(originalId)).toBeUndefined();

        // ⭐ THE ROUND TRIP, on measured values: same strings out as went in.
        expect(offer.candidates).toHaveLength(1);
        expect(offer.candidates[0]!.meaning.name).toBe('Kitchen');
        expect(offer.candidates[0]!.meaning.roomNumber).toBe('G.101');
        expect(offer.candidates[0]!.meaning.occupancyType).toBe('kitchen');

        // ⛔ AND NOTHING WAS APPLIED. ASK, never auto-edit.
        const recovered = roomStore.getById(offer.roomId)!;
        expect(recovered.name).not.toBe('Kitchen');
        expect(recovered.occupancyType).toBe('unclassified');
    });

    it('⛔ a NEVER-TOUCHED room that dies and comes back produces NO offer at all', () => {
        const { walls, roomStore, ctx } = harness();
        expect(roomStore.getByLevel(LEVEL)).toHaveLength(1);

        const offers: RoomMeaningOffer[] = [];
        const off = roomMeaningNotifier.subscribe(o => { offers.push(o); });
        try {
            const north = walls.splice(walls.findIndex((w: any) => w.id === 'w-north'), 1)[0];
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
            walls.push(north);
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
        } finally { off(); }

        // Silence is correct: the system would be offering back a name it minted itself.
        expect(offers).toHaveLength(0);
    });

    it('a listener that throws cannot break the re-detect', () => {
        const { walls, roomStore, ctx } = harness();
        roomStore.update(roomStore.getByLevel(LEVEL)[0]!.id, { name: 'Kitchen' } as never);
        vi.spyOn(console, 'warn').mockImplementation(() => {});
        const off = roomMeaningNotifier.subscribe(() => { throw new Error('boom'); });
        try {
            const north = walls.splice(walls.findIndex((w: any) => w.id === 'w-north'), 1)[0];
            new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx);
            walls.push(north);
            expect(new ReDetectRoomsCommand(LEVEL, 0, 2.7).execute(ctx).success).toBe(true);
        } finally { off(); vi.restoreAllMocks(); }
    });
});
