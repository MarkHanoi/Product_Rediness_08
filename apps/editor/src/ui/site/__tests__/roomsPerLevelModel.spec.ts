/**
 * §ROOMS-PER-LEVEL (L-13039, STR §25.5 / §26.6.4) — the project's rooms GROUPED PER STOREY.
 *
 * ⭐ THE FOUR PROPERTIES THIS SUITE EXISTS TO PIN, in the order they can hurt:
 *   1. **NO ROOM IS DROPPED OR DEFAULTED.** A room with no level, or with a level the project does
 *      not have, lands in the explicit "level not known" group with its exact reason. The counts
 *      must add up: groups + unplaced = every room passed in.
 *   2. **AN UNKNOWN AREA IS NULL, NEVER 0.** It is excluded from the storey sum AND counted, so a
 *      sum is never read as complete when it is not.
 *   3. **EACH STOREY CARRIES ITS LEVEL ENVELOPE — one, none, rivals, or UNREADABLE** — four
 *      different facts, kept apart.
 *   4. **"COULD NOT READ THE STOREYS" IS NOT "NO STOREYS".** `levels === null` puts every room
 *      under `levels-unreadable`; `levels === []` is a project with rooms and no storeys.
 */

import { describe, it, expect } from 'vitest';
import { systemProvenance } from '@pryzm/schemas/provenance';
import { groupRoomsPerLevel, describeUnplacedReason, levelLabel } from '../roomsPerLevelModel';
import type { AdoptLevelCandidate } from '../adoptProposalAsEnvelope';
import type { ExistingLevelEnvelope, LevelEnvelopeReadResult } from '../levelEnvelopeSupersession';

const L0: AdoptLevelCandidate = { id: 'L0', name: 'Ground', elevation: 0, height: 3 };
const L1: AdoptLevelCandidate = { id: 'L1', name: 'Level 1', elevation: 3, height: 3 };
const L2: AdoptLevelCandidate = { id: 'L2', name: null, elevation: 6, height: null };

const env = (levelId: string, id: string, area: number | null): ExistingLevelEnvelope => ({
    id, levelId, name: `Proposed · ${area ?? '?'}`, footprintAreaM2: area,
    provenance: systemProvenance('computed', 'test'),
});
const readable = (rows: readonly ExistingLevelEnvelope[]): LevelEnvelopeReadResult => ({ readable: true, rows });

const ROOMS = [
    { id: 'r1', name: 'Living', levelId: 'L0', occupancyType: 'living-room', computed: { area: 24 } },
    { id: 'r2', name: 'Kitchen', levelId: 'L0', occupancyType: 'kitchen', computed: { area: 12.5 } },
    { id: 'r3', name: 'Bedroom 1', levelId: 'L1', occupancyType: 'bedroom', area: 14 },
    { id: 'r4', name: 'Bathroom 1', levelId: 'L1', occupancyType: 'bathroom' },          // no area
    { id: 'r5', name: 'Store', levelId: 'L9', occupancyType: 'storage', computed: { area: 3 } }, // unknown storey
    { id: 'r6', name: 'Hall', occupancyType: 'hall', computed: { area: 6 } },                    // no storey
];

describe('groupRoomsPerLevel — "Ground: these rooms · L1: those rooms"', () => {
    it('groups rooms by their storey, lowest storey first, and every room is accounted for', () => {
        const m = groupRoomsPerLevel(ROOMS, [L1, L0, L2], readable([env('L0', 'e0', 210)]));
        expect(m.levelsReadable).toBe(true);
        expect(m.totalRooms).toBe(6);
        expect(m.groups.map((g) => g.levelId)).toEqual(['L0', 'L1']);      // L2 has neither rooms nor envelope
        expect(m.groups[0]!.rooms.map((r) => r.name)).toEqual(['Living', 'Kitchen']);
        expect(m.groups[1]!.rooms.map((r) => r.name)).toEqual(['Bedroom 1', 'Bathroom 1']);
        const placed = m.groups.reduce((s, g) => s + g.rooms.length, 0);
        expect(placed + m.unplaced.length).toBe(6);
    });

    it('labels a storey by its recorded name, else by its elevation — never by an index', () => {
        expect(levelLabel(L0)).toBe('Ground');
        expect(levelLabel(L2)).toBe('storey at 6.00 m');
    });

    it('⛔ a room with NO level id and a room on an UNKNOWN storey are LISTED with their reasons', () => {
        const m = groupRoomsPerLevel(ROOMS, [L0, L1], readable([]));
        expect(m.unplaced.map((u) => [u.room.name, u.reason])).toEqual([
            ['Store', 'level-not-known'],
            ['Hall', 'no-level-id'],
        ]);
        expect(describeUnplacedReason(m.unplaced[0]!)).toContain('"L9"');
        expect(describeUnplacedReason(m.unplaced[1]!)).toContain('carries no storey');
        // …and neither was quietly put on Ground.
        expect(m.groups.find((g) => g.levelId === 'L0')!.rooms.map((r) => r.name)).not.toContain('Hall');
    });

    it('⛔ an unknown area is NULL, excluded from the sum, and COUNTED beside it', () => {
        const m = groupRoomsPerLevel(ROOMS, [L0, L1], readable([]));
        const l1 = m.groups.find((g) => g.levelId === 'L1')!;
        expect(l1.areaM2).toBe(14);             // Bedroom 1 only
        expect(l1.roomsWithoutArea).toBe(1);    // Bathroom 1
        expect(l1.rooms.find((r) => r.name === 'Bathroom 1')!.areaM2).toBeNull();
        const l0 = m.groups.find((g) => g.levelId === 'L0')!;
        expect(l0.areaM2).toBeCloseTo(36.5, 6);
        expect(l0.roomsWithoutArea).toBe(0);
    });

    it('a storey whose rooms ALL lack an area sums to NULL, not 0', () => {
        const m = groupRoomsPerLevel([{ id: 'x', name: 'WC', levelId: 'L0' }], [L0], readable([]));
        expect(m.groups[0]!.areaM2).toBeNull();
        expect(m.groups[0]!.roomsWithoutArea).toBe(1);
    });

    it('resolves the room kind through the ONE name→kind resolver', () => {
        const m = groupRoomsPerLevel(ROOMS, [L0, L1], readable([]));
        expect(m.groups[0]!.rooms.map((r) => r.kind)).toEqual(['living', 'kitchen']);
    });
});

describe('the level envelope on each storey — one, none, rivals, unreadable', () => {
    it('ONE envelope: carried with its name and area', () => {
        const m = groupRoomsPerLevel(ROOMS, [L0, L1], readable([env('L0', 'e0', 210)]));
        const l0 = m.groups.find((g) => g.levelId === 'L0')!.envelope;
        expect(l0).toEqual({ kind: 'one', id: 'e0', name: 'Proposed · 210', areaM2: 210 });
        expect(m.groups.find((g) => g.levelId === 'L1')!.envelope).toEqual({ kind: 'none' });
    });

    it('⛔ RIVALS are reported as rivals — PRYZM does not pick one for the rooms', () => {
        const m = groupRoomsPerLevel(ROOMS, [L0, L1], readable([env('L0', 'a', 431), env('L0', 'b', 301), env('L0', 'c', 144)]));
        const e = m.groups.find((g) => g.levelId === 'L0')!.envelope;
        expect(e.kind).toBe('rival');
        if (e.kind === 'rival') expect(e.count).toBe(3);
    });

    it('a storey with an envelope but NO rooms is still a group — "no rooms yet" is a finding', () => {
        const m = groupRoomsPerLevel([], [L0, L1, L2], readable([env('L2', 'e2', 100)]));
        expect(m.groups.map((g) => g.levelId)).toEqual(['L2']);
        expect(m.groups[0]!.rooms).toEqual([]);
        expect(m.groups[0]!.areaM2).toBeNull();
    });

    it('⛔ an UNREADABLE store is carried as unreadable on every storey with rooms, never as "none"', () => {
        const m = groupRoomsPerLevel(ROOMS, [L0, L1],
            { readable: false, reason: 'store-threw', text: 'Reading the space-envelope store failed' });
        for (const g of m.groups) {
            expect(g.envelope.kind).toBe('unreadable');
            if (g.envelope.kind === 'unreadable') expect(g.envelope.text).toContain('failed');
        }
    });
});

describe('"could not read the storeys" is not "no storeys"', () => {
    it('levels === null ⇒ every room is unplaced for THAT reason, and levelsReadable is false', () => {
        const m = groupRoomsPerLevel(ROOMS, null, readable([]));
        expect(m.levelsReadable).toBe(false);
        expect(m.groups).toEqual([]);
        expect(m.unplaced.length).toBe(6);
        expect(new Set(m.unplaced.map((u) => u.reason))).toEqual(new Set(['levels-unreadable']));
    });

    it('levels === [] ⇒ a project with rooms and no storeys: every room is "level not known"', () => {
        const m = groupRoomsPerLevel(ROOMS, [], readable([]));
        expect(m.levelsReadable).toBe(true);
        expect(m.unplaced.length).toBe(6);
        expect(m.unplaced.filter((u) => u.reason === 'level-not-known').length).toBe(5);
        expect(m.unplaced.filter((u) => u.reason === 'no-level-id').length).toBe(1);
    });

    it('is total: garbage records neither throw nor become rooms with invented fields', () => {
        const m = groupRoomsPerLevel([{}, { name: 42, levelId: 7, computed: { area: 'x' } }], [L0], readable([]));
        expect(m.totalRooms).toBe(2);
        for (const u of m.unplaced) {
            expect(u.room.name).toBeNull();
            expect(u.room.areaM2).toBeNull();
            expect(u.reason).toBe('no-level-id');
        }
    });

    it('is deterministic — the same inputs give byte-identical output', () => {
        const a = JSON.stringify(groupRoomsPerLevel(ROOMS, [L1, L0], readable([env('L0', 'e0', 210)])));
        const b = JSON.stringify(groupRoomsPerLevel(ROOMS, [L0, L1], readable([env('L0', 'e0', 210)])));
        expect(a).toBe(b);
    });
});
