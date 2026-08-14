// §GR-10/GR-14 — "no producer ever recorded this room's bounding walls" ≠
// "this room bounds zero walls" (C78 §1.4 · C71 §4.4 · C79 §5.2.0).
//
// THE SITES: `check-no-empty-means-unknown` ARM C, eleven of them in
// `packages/room-topology/src/RoomContentsService.ts` — every one of the shape
// `room.boundingWallIds ?? []` / `boundingSlabIds ?? []` / `boundingColumnIds ?? []`.
//
// THE DISCIPLINE THIS FILE ENFORCES: every assertion below is DIFFERENTIATING.
// Each one names two inputs that produced BYTE-IDENTICAL output before the fix,
// asserts they are still identical on the old fields — that is what made the
// defect invisible — and then asserts they DIFFER on the new one. Collapse the
// two cases back together and these fail; a test that merely asserted the new
// shape existed would prove nothing and would have passed on the defect.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    RoomContentsService,
    determineBoundingIds,
    boundingIdsOrUnknown,
    boundingDoubt,
} from '../src/RoomContentsService';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const POLY = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];

/** A room that WAS examined and bounds exactly zero walls — a real answer. */
const DETERMINED_EMPTY = {
    id: 'room-determined',
    levelId: 'L0',
    boundingWallIds: [],
    boundingSlabIds: [],
    boundingColumnIds: [],
    boundary: { polygon: POLY },
} as never;

/** The SAME room with the three bounding fields never written by any producer. */
const UNRECORDED = {
    id: 'room-unrecorded',
    levelId: 'L0',
    boundary: { polygon: POLY },
} as never;

function service(rooms: unknown[], extra: Record<string, unknown> = {}): RoomContentsService {
    return new RoomContentsService({
        roomStore: {
            getAll: () => rooms,
            getById: (id: string) => (rooms as { id: string }[]).find((r) => r.id === id),
            getByLevel: () => [],
        },
        bimManager: { getLevelById: () => undefined },
        ...extra,
    } as never);
}

// ═════════════════════════════════════════════════════════════════════════════
// The discriminator itself
// ═════════════════════════════════════════════════════════════════════════════

describe('determineBoundingIds — the three facts `?? []` merged into one value', () => {
    it('DETERMINED and EMPTY — a room examined and bounding zero walls is a real answer', () => {
        const d = determineBoundingIds({ id: 'r', boundingWallIds: [] }, 'boundingWallIds');
        expect(d.kind).toBe('determined');
        // Load-bearing: refusing on a legitimately empty list is the mirror-image
        // defect. `[]` MAY mean zero results — that is the whole of C71 §4.4.
        expect(d.kind === 'determined' && d.elements).toEqual([]);
    });

    it('DETERMINED and non-empty', () => {
        const d = determineBoundingIds({ id: 'r', boundingWallIds: ['w1', 'w2'] }, 'boundingWallIds');
        expect(d.kind === 'determined' && d.elements).toEqual(['w1', 'w2']);
    });

    it('UNDETERMINED — the field is absent, so nobody wrote the relationship', () => {
        const d = determineBoundingIds({ id: 'r' }, 'boundingWallIds');
        expect(d.kind).toBe('undetermined');
        expect(d.kind === 'undetermined' && d.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });

    it('UNDETERMINED — null, undefined, and a non-array all fail to determine', () => {
        for (const raw of [null, undefined, 'nope', 7, {}]) {
            expect(determineBoundingIds({ id: 'r', boundingWallIds: raw } as never, 'boundingWallIds').kind)
                .toBe('undetermined');
        }
        expect(determineBoundingIds(null, 'boundingWallIds').kind).toBe('undetermined');
        expect(determineBoundingIds(undefined, 'boundingSlabIds').kind).toBe('undetermined');
    });

    it('the slab and column arms behave identically to the wall arm', () => {
        expect(determineBoundingIds({ id: 'r', boundingSlabIds: [] }, 'boundingSlabIds').kind).toBe('determined');
        expect(determineBoundingIds({ id: 'r' }, 'boundingSlabIds').kind).toBe('undetermined');
        expect(determineBoundingIds({ id: 'r', boundingColumnIds: [] }, 'boundingColumnIds').kind).toBe('determined');
        expect(determineBoundingIds({ id: 'r' }, 'boundingColumnIds').kind).toBe('undetermined');
        expect(determineBoundingIds({ id: 'r' }, 'boundingCurtainWallIds').kind).toBe('undetermined');
    });

    it('THE DIFFERENTIATOR — examined-and-empty is NOT EQUAL to never-recorded', () => {
        // Before this change both sides were `[]` and this line could not have
        // been written at all.
        const examined = determineBoundingIds({ id: 'r', boundingWallIds: [] }, 'boundingWallIds');
        const unwritten = determineBoundingIds({ id: 'r' }, 'boundingWallIds');
        expect(examined.kind).not.toBe(unwritten.kind);
        // …while `boundingIdsOrUnknown` keeps the SAME distinction as [] vs null.
        expect(boundingIdsOrUnknown({ id: 'r', boundingWallIds: [] }, 'boundingWallIds')).toEqual([]);
        expect(boundingIdsOrUnknown({ id: 'r' }, 'boundingWallIds')).toBeNull();
    });

    it('the detail NAMES the field, so a rendered refusal says which relationship failed', () => {
        const d = determineBoundingIds({ id: 'r' }, 'boundingSlabIds');
        expect(d.kind === 'undetermined' && d.detail).toContain('boundingSlabIds');
    });

    it('TOTAL — no input makes the discriminator throw', () => {
        for (const bad of [undefined, null, 0, '', [], { boundingWallIds: 7 }]) {
            expect(() => determineBoundingIds(bad as never, 'boundingWallIds')).not.toThrow();
        }
    });
});

describe('boundingDoubt — "no doubt" is null, never an empty record', () => {
    it('no unexamined rooms → null, so an always-present record cannot rebuild the ambiguity', () => {
        expect(boundingDoubt([])).toBeNull();
    });

    it('unexamined rooms → a record that NAMES them and their count', () => {
        const d = boundingDoubt(['room-a', 'room-b']);
        expect(d?.reason).toBe('RELATIONSHIP_NOT_RECORDED');
        expect(d?.detail).toContain('room-a');
        expect(d?.detail).toContain('room-b');
        expect(d?.scope).toContain('2');
    });

    it('a long list is truncated but still reports the TRUE total (C80 §1.4 — both numbers)', () => {
        const d = boundingDoubt(Array.from({ length: 20 }, (_, i) => `r${i}`));
        expect(d?.scope).toContain('20');
        expect(d?.detail).toContain('+12 more');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// getContents — "this room contains nothing" vs "nobody recorded what it bounds"
// ═════════════════════════════════════════════════════════════════════════════

describe('getContents — an empty bucket now says WHY it is empty', () => {
    it('a fully determined room carries NO `undetermined` and reports EXACT totals', () => {
        const c = service([DETERMINED_EMPTY]).getContents('room-determined')!;
        expect(c.undetermined, 'a determined-empty room must not be dressed as a refusal').toBeUndefined();
        expect(c.totals.exact).toBe(true);
        expect(c.totals.total).toBe(0);
    });

    it('DIFFERENTIATING — an unrecorded room yields the SAME empty buckets, now distinguishable', () => {
        const determined = service([DETERMINED_EMPTY]).getContents('room-determined')!;
        const unrecorded = service([UNRECORDED]).getContents('room-unrecorded')!;

        // Identical on every field the old shape had. THIS is why the defect was
        // invisible: a caller reading these buckets learned nothing either way.
        expect(unrecorded.bounding.walls).toEqual(determined.bounding.walls);
        expect(unrecorded.bounding.columns).toEqual(determined.bounding.columns);
        expect(unrecorded.hosted.doors).toEqual(determined.hosted.doors);
        expect(unrecorded.hosted.windows).toEqual(determined.hosted.windows);
        expect(unrecorded.hosted.openings).toEqual(determined.hosted.openings);
        expect(unrecorded.totals.total).toBe(determined.totals.total);

        // …and NOT identical where it counts.
        expect(unrecorded.undetermined).toBeDefined();
        expect(unrecorded.totals.exact).toBe(false);
        expect(determined.totals.exact).toBe(true);
    });

    it('every unrecorded bounding field is named separately — walls, columns AND slabs', () => {
        const c = service([UNRECORDED]).getContents('room-unrecorded')!;
        const scopes = (c.undetermined ?? []).map((u) => u.scope).join(' | ');
        expect(scopes).toContain('bounding walls');
        expect(scopes).toContain('bounding columns');
        expect(scopes).toContain('bounding slabs');
        expect(c.undetermined).toHaveLength(3);
        for (const u of c.undetermined!) expect(u.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });

    it('a PARTIALLY recorded room refuses only the field that is missing', () => {
        const partial = { ...(DETERMINED_EMPTY as object), id: 'room-partial' } as Record<string, unknown>;
        delete partial.boundingSlabIds;
        const c = service([partial]).getContents('room-partial')!;
        expect(c.undetermined).toHaveLength(1);
        expect(c.undetermined![0]!.scope).toContain('bounding slabs');
        // The determined fields are still answered — refusal is scoped, not global.
        expect(c.totals.exact).toBe(false);
    });

    it('walls that ARE recorded still resolve to real refs — the reader is not now refusing everything', () => {
        const room = { ...(DETERMINED_EMPTY as object), id: 'room-w', boundingWallIds: ['w1'] };
        const c = service([room], {
            wallStore: { getAll: () => [{ id: 'w1', name: 'North wall' }] },
        }).getContents('room-w')!;
        expect(c.bounding.walls.map((r) => r.id)).toEqual(['w1']);
        expect(c.undetermined).toBeUndefined();
        expect(c.totals.exact).toBe(true);
    });

    it('an unrecorded wall list empties the HOSTED buckets too, and says so', () => {
        // doors/windows/openings are found THROUGH boundingWallIds, so an
        // unrecorded wall list silently zeroes three more buckets. The refusal
        // has to cover them or the fix is cosmetic.
        const doors = { getAll: () => [{ id: 'd1', wallId: 'w1' }] };
        const withWalls = service([{ ...(DETERMINED_EMPTY as object), id: 'rw', boundingWallIds: ['w1'] }], { doorStore: doors })
            .getContents('rw')!;
        const without = service([UNRECORDED], { doorStore: doors }).getContents('room-unrecorded')!;

        expect(withWalls.hosted.doors).toHaveLength(1);
        expect(without.hosted.doors).toHaveLength(0);
        expect(without.undetermined?.some((u) => u.scope.includes('bounding walls'))).toBe(true);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// The over-report the exclusion set hid
// ═════════════════════════════════════════════════════════════════════════════

describe('contained free-standing columns — an unknown exclusion set is declared, not hidden', () => {
    const columnStore = { getAll: () => [{ id: 'c1', levelId: 'L0', position: { x: 2, z: 1 } }] };

    it('a DECLARED bounding column is excluded from the free-standing bucket', () => {
        const room = { ...(DETERMINED_EMPTY as object), id: 'rc', boundingColumnIds: ['c1'] };
        const c = service([room], { columnStore }).getContents('rc')!;
        expect(c.contained.columns).toHaveLength(0);
        expect(c.undetermined).toBeUndefined();
    });

    it('DIFFERENTIATING — with the list unrecorded the SAME column is reported, and the doubt is declared', () => {
        const c = service([UNRECORDED], { columnStore }).getContents('room-unrecorded')!;
        // Over-inclusive: nothing said c1 was bounding, so it lands in "contained".
        expect(c.contained.columns).toHaveLength(1);
        // The caller is warned rather than quietly handed a wrong classification.
        expect(c.undetermined?.some((u) => u.scope.includes('bounding columns'))).toBe(true);
        expect(c.totals.exact).toBe(false);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// getRoomForElement — the sharpest site: a SUBSET answered as a census
// ═════════════════════════════════════════════════════════════════════════════

describe('getRoomForElement — an unscannable room is named, not silently answered "no"', () => {
    const BOUNDS_W9 = { id: 'room-9', levelId: 'L0', boundingWallIds: ['wall-9'], boundary: { polygon: POLY } };

    it('a room examined and ruled out answers "none" with NO `undetermined`', () => {
        const r = service([BOUNDS_W9]).getRoomForElement('wall-1', 'wall');
        expect(r.rooms).toEqual([]);
        expect(r.relationship).toBe('none');
        expect(r.undetermined, 'a determined "no room" must not be dressed as a refusal').toBeUndefined();
    });

    it('DIFFERENTIATING — an UNRECORDED room returns the SAME empty answer but is distinguishable', () => {
        const ruledOut = service([BOUNDS_W9]).getRoomForElement('wall-1', 'wall');
        const unscanned = service([UNRECORDED]).getRoomForElement('wall-1', 'wall');

        // Identical on every pre-existing field — the defect, exactly.
        expect(unscanned.rooms).toEqual(ruledOut.rooms);
        expect(unscanned.relationship).toBe(ruledOut.relationship);
        expect(unscanned.primaryRoomId).toBe(ruledOut.primaryRoomId);

        // …and NOT identical where it counts.
        expect(unscanned.undetermined?.reason).toBe('RELATIONSHIP_NOT_RECORDED');
        expect(unscanned.undetermined?.detail).toContain('room-unrecorded');
        expect(ruledOut.undetermined).toBeUndefined();
    });

    it('a POSITIVE match alongside an unscannable room is flagged as a SUBSET, not a census', () => {
        // The half a naive fix misses. Rooms were found — but another room could
        // also bound this wall and nobody can tell, so the answer is incomplete.
        const bounds = { id: 'room-hit', levelId: 'L0', boundingWallIds: ['wall-1'], boundary: { polygon: POLY } };
        const r = service([bounds, UNRECORDED]).getRoomForElement('wall-1', 'wall');
        expect(r.primaryRoomId).toBe('room-hit');
        expect(r.relationship).toBe('bounding');
        expect(r.undetermined?.reason).toBe('RELATIONSHIP_NOT_RECORDED');
        expect(r.undetermined?.detail).toContain('room-unrecorded');
    });

    it('a fully determined project answers positively with NO doubt attached', () => {
        const bounds = { id: 'room-hit', levelId: 'L0', boundingWallIds: ['wall-1'], boundary: { polygon: POLY } };
        const r = service([bounds, BOUNDS_W9]).getRoomForElement('wall-1', 'wall');
        expect(r.primaryRoomId).toBe('room-hit');
        expect(r.undetermined).toBeUndefined();
    });

    it('the SLAB and COLUMN branches read their own field, not the wall field', () => {
        const slabRoom = { id: 'rs', levelId: 'L0', boundingSlabIds: ['slab-1'], boundary: { polygon: POLY } };
        expect(service([slabRoom]).getRoomForElement('slab-1', 'slab').primaryRoomId).toBe('rs');
        // Same room asked about a COLUMN: boundingColumnIds is unrecorded, so the
        // answer is a refusal — not the false "no" the shared `?? []` produced.
        const col = service([slabRoom]).getRoomForElement('col-1', 'column');
        expect(col.undetermined?.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });

    it('the HOSTED branch (door → host wall → rooms) carries the same doubt', () => {
        const doorStore = { getAll: () => [{ id: 'd1', wallId: 'wall-1' }] };
        const ruledOut = service([BOUNDS_W9], { doorStore }).getRoomForElement('d1', 'door');
        const unscanned = service([UNRECORDED], { doorStore }).getRoomForElement('d1', 'door');
        expect(unscanned.rooms).toEqual(ruledOut.rooms);
        expect(ruledOut.undetermined).toBeUndefined();
        expect(unscanned.undetermined?.reason).toBe('RELATIONSHIP_NOT_RECORDED');
    });

    it('THE TWO UNKNOWNS DO NOT COLLAPSE EITHER — unreadable store ≠ unrecorded field', () => {
        const unreadable = new RoomContentsService({
            roomStore: { getAll: () => { throw new Error('torn down'); } },
            bimManager: { getLevelById: () => undefined },
        } as never).getRoomForElement('wall-1', 'wall');
        const unrecorded = service([UNRECORDED]).getRoomForElement('wall-1', 'wall');

        expect(unreadable.undetermined?.reason).toBe('RELATIONSHIP_NOT_READABLE');
        expect(unrecorded.undetermined?.reason).toBe('RELATIONSHIP_NOT_RECORDED');
        expect(unreadable.undetermined?.reason).not.toBe(unrecorded.undetermined?.reason);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// UNION PIN — no rival vocabulary (C78 §8.1, CLOSED at eleven)
// ═════════════════════════════════════════════════════════════════════════════

describe('the reasons are command-bus vocabulary, not a fork', () => {
    const union = (): string => {
        const s = readFileSync(resolve(REPO, 'packages/command-bus/src/consequence.ts'), 'utf8');
        const start = s.indexOf('export type UndeterminedReason');
        expect(start, 'UndeterminedReason not found — command-bus moved').toBeGreaterThan(-1);
        return s.slice(start, s.indexOf(';', start));
    };

    it('both members this service produces exist in the closed union', () => {
        expect(union()).toContain("'RELATIONSHIP_NOT_RECORDED'");
        expect(union()).toContain("'RELATIONSHIP_NOT_READABLE'");
    });

    it('the union is still closed at ELEVEN — extending it would fail HERE', () => {
        expect(union().match(/\|\s*'[A-Z_]+'/g)).toHaveLength(11);
    });

    it('the wall arm DELEGATES to core-app-model rather than re-implementing it', () => {
        const src = readFileSync(resolve(REPO, 'packages/room-topology/src/RoomContentsService.ts'), 'utf8');
        expect(src).toContain("from '@pryzm/core-app-model'");
        expect(src).toContain('determineBoundingWalls(');
    });
});
