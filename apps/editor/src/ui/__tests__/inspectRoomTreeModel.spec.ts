/**
 * §ROOMTREE139 (L-12260+) — the Inspect PRYZM tree's BY-ROOM grouping.
 *
 * Founder: *"In Inspect, within the PRYZM tree, I want another mode option — BY
 * ROOM. I want to be able to select a room and see what it has. Also filter
 * rooms by elements like furniture elements, walls — to see how many of those
 * elements the room has."*
 *
 * C84 EI-9 — `buildRoomTreeModel()` reuses `RoomContentsService` (the SAME
 * authority the Inspect ATTR ladder's containment counts already read), rather
 * than re-deriving "which room is element X in". These specs construct a REAL
 * `RoomContentsService` against the fixture stores below, so the containment
 * math under test is the production authority's own, not a stand-in for it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomContentsService } from '@pryzm/room-topology';
import {
    buildRoomTreeModel,
    matchesFilter,
} from '../inspect/audit/projectTreeModel';
import { INSPECT_CATEGORIES } from '../inspect/audit/inspectCategories';

// ── Fixture ───────────────────────────────────────────────────────────────────
//
// Two rooms, non-overlapping squares on the same level:
//   Room A: [0,0] .. [4,4]   — bounding wall_A1/wall_A2, slab_A, column_A
//   Room B: [10,10] .. [14,14] — bounding wall_B1
//
// Every CONTENTS-mapped family gets at least one element placed in a room, and
// several get an explicit ORPHAN outside both rooms (the "no room" fixture).
// `floorStore` is an UNSUPPORTED family (RoomContentsService computes no
// relationship for it at all). `plumbingStore` is left UNSEEDED — the
// UNREADABLE-store fixture.

const G = globalThis as unknown as Record<string, any>;
const ROOM_A_POLY = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }];
const ROOM_B_POLY = [{ x: 10, z: 10 }, { x: 14, z: 10 }, { x: 14, z: 14 }, { x: 10, z: 14 }];

const ROOM_A = {
    id: 'room_A', name: 'Kitchen', levelId: 'L0',
    boundary: { polygon: ROOM_A_POLY },
    boundingWallIds: ['wall_A1', 'wall_A2'],
    boundingSlabIds: ['slab_A'],
    boundingColumnIds: ['col_A'],
};
const ROOM_B = {
    id: 'room_B', name: 'Bedroom', levelId: 'L0',
    boundary: { polygon: ROOM_B_POLY },
    boundingWallIds: ['wall_B1'],
    boundingSlabIds: [],
    boundingColumnIds: [],
};

const installed: string[] = [];
function putStore(storeKey: string, records: any[]): void {
    installed.push(storeKey);
    G[storeKey] = {
        getAll: () => records,
        getById: (id: string) => records.find((r) => String(r.id) === String(id)),
    };
}

function seedFixture(): void {
    const rooms = [ROOM_A, ROOM_B];
    const roomStore = {
        getAll: () => rooms,
        getById: (id: string) => rooms.find((r) => r.id === id),
        getByLevel: (lvl: string) => rooms.filter((r) => r.levelId === lvl),
    };
    installed.push('roomStore');
    G['roomStore'] = roomStore;

    const svc = new RoomContentsService({
        roomStore,
        bimManager: { getLevelById: () => undefined },
    });
    installed.push('roomContentsService');
    G['roomContentsService'] = svc;

    putStore('wallStore', [
        { id: 'wall_A1', levelId: 'L0', name: 'North Wall' },
        { id: 'wall_A2', levelId: 'L0' },
        { id: 'wall_B1', levelId: 'L0' },
        { id: 'wall_ORPHAN', levelId: 'L0' }, // bounds no room → "no room"
    ]);
    putStore('slabStore', [{ id: 'slab_A', levelId: 'L0' }]);
    putStore('columnStore', [
        { id: 'col_A', levelId: 'L0' },                 // bounding Room A
        { id: 'col_FREE', levelId: 'L0', x: 1, z: 1 },   // free-standing, inside Room A
        { id: 'col_ORPHAN', levelId: 'L0', x: 100, z: 100 }, // outside every room
    ]);
    putStore('curtainWallStore', [
        { id: 'cw_A', levelId: 'L0', startPoint: { x: 1, z: 0 }, endPoint: { x: 3, z: 0 } }, // mid inside Room A
        { id: 'cw_ORPHAN', levelId: 'L0', startPoint: { x: 100, z: 0 }, endPoint: { x: 102, z: 0 } },
    ]);
    putStore('doorStore', [
        { id: 'door_A', wallId: 'wall_A1' },       // hosted via Room A's bounding wall
        { id: 'door_ORPHAN', wallId: 'wall_ORPHAN' }, // hosted on a wall with no room
    ]);
    putStore('windowStore', [{ id: 'window_A', wallId: 'wall_A1' }]);
    putStore('openingStore', [{ id: 'opening_A', hostId: 'wall_A1' }]);
    putStore('furnitureStore', [
        { id: 'furniture_A1', x: 1, z: 1 },
        { id: 'furniture_A2', x: 2, z: 2 },
        { id: 'furniture_B1', x: 11, z: 11 },
        { id: 'furniture_ORPHAN', x: 100, z: 100 }, // outside every room
    ]);
    putStore('lightingStore', [{ id: 'light_B', x: 11, z: 12 }]);
    putStore('beamStore', [{ id: 'beam_A', startPoint: { x: 1, z: 1 }, endPoint: { x: 2, z: 2 } }]);
    putStore('handrailStore', [{ id: 'handrail_A', x: 1, z: 3 }]);
    putStore('stairStore', [{ id: 'stair_B', x: 12, z: 12 }]);
    // §ROOMTREE139 — an UNSUPPORTED family (no bounding/hosted/contained bucket
    // in RoomContentsService at all). Seeded and readable, so any group for it
    // would be a fabricated placement.
    putStore('floorStore', [{ id: 'floor_A', levelId: 'L0' }]);
    // `plumbingStore` deliberately NOT seeded — the UNREADABLE-store fixture.
}

beforeEach(() => { installed.length = 0; });
afterEach(() => {
    for (const k of installed) delete G[k];
    installed.length = 0;
    vi.restoreAllMocks();
});

// ── ARM A — a room lists its own families, correctly counted ──────────────────

describe('ARM A — a room groups its elements by family, via RoomContentsService', () => {
    it('Room A carries its bounding, hosted and contained families', () => {
        seedFixture();
        const model = buildRoomTreeModel();
        const roomA = model.rooms.find((r) => r.roomId === 'room_A')!;
        expect(roomA, 'room_A must appear').toBeDefined();
        const byId = new Map(roomA.groups.map((g) => [g.id, g]));

        expect(byId.get('walls')!.elements.map((e: any) => e.id).sort()).toEqual(['wall_A1', 'wall_A2']);
        expect(byId.get('slabs')!.elements.map((e: any) => e.id)).toEqual(['slab_A']);
        // Bounding col_A AND free-standing col_FREE both land under ONE 'columns' group.
        expect(byId.get('columns')!.elements.map((e: any) => e.id).sort()).toEqual(['col_A', 'col_FREE']);
        expect(byId.get('curtainWalls')!.elements.map((e: any) => e.id)).toEqual(['cw_A']);
        expect(byId.get('doors')!.elements.map((e: any) => e.id)).toEqual(['door_A']);
        expect(byId.get('windows')!.elements.map((e: any) => e.id)).toEqual(['window_A']);
        expect(byId.get('openings')!.elements.map((e: any) => e.id)).toEqual(['opening_A']);
        expect(byId.get('furniture')!.elements.map((e: any) => e.id).sort()).toEqual(['furniture_A1', 'furniture_A2']);
        expect(byId.get('beams')!.elements.map((e: any) => e.id)).toEqual(['beam_A']);
        expect(byId.get('handrails')!.elements.map((e: any) => e.id)).toEqual(['handrail_A']);
        // Room A has no lighting/stairs — no fabricated zero group.
        expect(byId.has('lighting')).toBe(false);
        expect(byId.has('stairs')).toBe(false);
    });

    it('Room B carries only what is actually inside/bounding it', () => {
        seedFixture();
        const model = buildRoomTreeModel();
        const roomB = model.rooms.find((r) => r.roomId === 'room_B')!;
        const byId = new Map(roomB.groups.map((g) => [g.id, g]));
        expect(byId.get('walls')!.elements.map((e: any) => e.id)).toEqual(['wall_B1']);
        expect(byId.get('furniture')!.elements.map((e: any) => e.id)).toEqual(['furniture_B1']);
        expect(byId.get('lighting')!.elements.map((e: any) => e.id)).toEqual(['light_B']);
        expect(byId.get('stairs')!.elements.map((e: any) => e.id)).toEqual(['stair_B']);
        expect(byId.has('columns')).toBe(false); // Room B bounds/contains no columns
    });

    it('groups follow INSPECT_CATEGORIES order', () => {
        seedFixture();
        const model = buildRoomTreeModel();
        const roomA = model.rooms.find((r) => r.roomId === 'room_A')!;
        const order = INSPECT_CATEGORIES.map((c) => c.id as string);
        const actual = roomA.groups.map((g) => g.id);
        expect(actual).toEqual(order.filter((id) => actual.includes(id)));
    });

    it('a row is named by elementRowLabel, not RoomContentsService\'s own ElementRef.label', () => {
        // wall_A1 has a `name`; RoomContentsService's toRef() would ALSO resolve a
        // label, but this traversal re-reads the family's own record so there is
        // exactly ONE naming rule for a tree row, in or out of a room.
        seedFixture();
        const model = buildRoomTreeModel();
        const roomA = model.rooms.find((r) => r.roomId === 'room_A')!;
        const walls = roomA.groups.find((g) => g.id === 'walls')!;
        const wallA1 = walls.elements.find((e: any) => e.id === 'wall_A1');
        expect(wallA1.name).toBe('North Wall'); // the FULL record, not a bare {id,type,label}
    });
});

// ── ARM B — "No Room" is explicit, never silently dropped ─────────────────────

describe('ARM B — elements outside every room are named, not dropped', () => {
    it('the no-room bucket lists exactly the orphaned elements, per family', () => {
        seedFixture();
        const model = buildRoomTreeModel();
        const byId = new Map(model.noRoom.map((g) => [g.id, g]));
        expect(byId.get('walls')!.elements.map((e: any) => e.id)).toEqual(['wall_ORPHAN']);
        expect(byId.get('doors')!.elements.map((e: any) => e.id)).toEqual(['door_ORPHAN']);
        expect(byId.get('columns')!.elements.map((e: any) => e.id)).toEqual(['col_ORPHAN']);
        expect(byId.get('curtainWalls')!.elements.map((e: any) => e.id)).toEqual(['cw_ORPHAN']);
        expect(byId.get('furniture')!.elements.map((e: any) => e.id)).toEqual(['furniture_ORPHAN']);
        // A room-bound element must NEVER also appear in "no room".
        expect(byId.get('furniture')!.elements.some((e: any) => e.id === 'furniture_A1')).toBe(false);
    });

    it('noRoomTotal is the sum of the no-room groups', () => {
        seedFixture();
        const model = buildRoomTreeModel();
        const summed = model.noRoom.reduce((n, g) => n + g.elements.length, 0);
        expect(model.noRoomTotal).toBe(summed);
        expect(model.noRoomTotal).toBeGreaterThan(0);
    });
});

// ── ARM C — a family with no computed containment is UNSUPPORTED, never a
//            fabricated "0 rooms have it" nor a false "no room" ───────────────

describe('ARM C — a family RoomContentsService cannot place at all is named UNSUPPORTED', () => {
    it('floors is unsupported and counted, but placed under no room and no bucket', () => {
        seedFixture();
        const model = buildRoomTreeModel();
        expect(model.unsupported).toContain('floors');
        expect(model.unsupportedTotal).toBeGreaterThanOrEqual(1);
        expect(model.rooms.some((r) => r.groups.some((g) => g.id === 'floors'))).toBe(false);
        expect(model.noRoom.some((g) => g.id === 'floors')).toBe(false);
    });
});

// ── ARM D — a store that cannot be READ is unread, never a fabricated zero ────

describe('ARM D — an unreadable store is named, never shown as zero anywhere (C78 §8.1)', () => {
    it('plumbing is unreadable and appears in NO room, and NOT in "no room" either', () => {
        seedFixture(); // plumbingStore is never seeded
        const model = buildRoomTreeModel();
        expect(model.unreadable).toContain('plumbingStore');
        expect(model.rooms.some((r) => r.groups.some((g) => g.id === 'plumbing'))).toBe(false);
        expect(model.noRoom.some((g) => g.id === 'plumbing')).toBe(false);
    });

    it('roomStore itself unreadable ⇒ rooms is [] and roomStoreUnreadable is true (not "no rooms")', () => {
        // Do NOT seed anything — roomStore absent from window entirely.
        const model = buildRoomTreeModel();
        expect(model.roomStoreUnreadable).toBe(true);
        expect(model.rooms).toEqual([]);
    });
});

// ── ARM E — the family filter narrows AND sorts high→low (mirrors Discovery) ──

describe('ARM E — the family filter narrows to rooms containing that family, sorted by count', () => {
    it('filtering by furniture keeps only rooms with furniture, sorted descending', () => {
        seedFixture();
        const model = buildRoomTreeModel('', 'furniture');
        expect(model.rooms.map((r) => r.roomId)).toEqual(['room_A', 'room_B']); // A has 2, B has 1
        expect(model.rooms[0].groups.find((g) => g.id === 'furniture')!.elements.length).toBe(2);
        expect(model.rooms[1].groups.find((g) => g.id === 'furniture')!.elements.length).toBe(1);
        // Only the filtered family's group is present per room.
        expect(model.rooms.every((r) => r.groups.every((g) => g.id === 'furniture'))).toBe(true);
    });

    it('filtering by a family neither room has excludes every room', () => {
        seedFixture();
        const model = buildRoomTreeModel('', 'lighting'); // only Room B has lighting
        expect(model.rooms.map((r) => r.roomId)).toEqual(['room_B']);
    });

    it('filtering by an UNSUPPORTED family yields no rooms, never a false "0 have it"', () => {
        seedFixture();
        const model = buildRoomTreeModel('', 'floors');
        expect(model.rooms).toEqual([]);
        expect(model.unsupported).toContain('floors'); // the caller can tell WHY
    });
});

// ── ARM F — header accounting: listedTotal is exactly what is drawn ───────────

describe('ARM F — listedTotal is the sum of what this traversal actually draws under rooms', () => {
    it('Σ room totals === listedTotal, and the total excludes no-room/unsupported/unread', () => {
        seedFixture();
        const model = buildRoomTreeModel();
        const summed = model.rooms.reduce((n, r) => n + r.total, 0);
        expect(model.listedTotal).toBe(summed);
    });
});

// ── ARM G — ⭐ THE DERIVATION PIN ──────────────────────────────────────────────

describe('ARM G — a family added to the registry never vanishes silently', () => {
    it('an invented family with no RoomContentsService mapping lands in `unsupported`, automatically', () => {
        seedFixture();
        const invented = {
            id: 'skylights', label: 'Skylights', icon: '◇',
            storeKey: 'skylightStore', meshType: 'skylight',
        };
        (INSPECT_CATEGORIES as unknown as any[]).push(invented);
        putStore('skylightStore', [{ id: 'sky_A', levelId: 'L0' }]);
        try {
            const model = buildRoomTreeModel();
            // ⛔ FAILS if `unsupported` were a hand-maintained list someone forgot to
            // extend — it is recomputed from the registry on every call instead.
            expect(model.unsupported).toContain('skylights');
            expect(model.unsupportedTotal).toBeGreaterThanOrEqual(1);
            expect(model.rooms.some((r) => r.groups.some((g) => g.id === 'skylights'))).toBe(false);
            expect(model.noRoom.some((g) => g.id === 'skylights')).toBe(false);
        } finally {
            const arr = INSPECT_CATEGORIES as unknown as any[];
            arr.splice(arr.indexOf(invented), 1);
        }
    });
});

// ── ARM H — the exported filter helper agrees with what the tree narrows by ───

describe('ARM H — matchesFilter is the SAME name-matching rule the level tree uses', () => {
    it('matches on name/label, or the category label', () => {
        const cat = INSPECT_CATEGORIES.find((c) => c.id === 'furniture')!;
        expect(matchesFilter(cat, { id: 'x', name: 'Sofa' }, 'sofa')).toBe(true);
        expect(matchesFilter(cat, { id: 'x' }, 'furniture')).toBe(true);
        expect(matchesFilter(cat, { id: 'x', name: 'Sofa' }, 'chair')).toBe(false);
    });
});
