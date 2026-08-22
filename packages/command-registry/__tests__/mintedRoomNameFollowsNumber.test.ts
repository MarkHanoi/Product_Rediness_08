/**
 * §MINTED-NAME-FOLLOWS-NUMBER (L-4510..L-4513)
 *
 * The founder, 2026-08-21, over a Level 1 floor plan: *"why in Level 1 are the
 * graphics not correct?"* — and on that plan, `Room 01-002` appears TWICE with
 * different areas (25.1 m² and 20.5 m²).
 *
 * THE MECHANISM, in `RoomNumbering.assignUniqueRoomNumbers`. It MINTS
 * `Room <number>` as a room's name, but its "may I overwrite this name?" test
 * recognised only `''`, `'Room'`, and the bare number — never `Room NN-NNN`, the
 * shape it had just minted itself. So a RENUMBERED room got a new number and kept
 * a name naming somebody else's number. Two rooms, one label.
 *
 * ⚠ NOT a duplicate-detection bug. `RoomTagAutoPopulator`'s
 * `0 duplicate(s) removed` in the founder's log is CORRECT and uninformative: its
 * duplicates are TAGS keyed by room GUID (`TagReconciler`, `targetId: r.id`), and
 * two rooms sharing a NAME are two distinct GUIDs each legitimately holding one
 * tag. There was no guard on room-name collision anywhere on this path — ABSENT,
 * not unreachable (C01 §6.1). `§DUP-NAME-UNIQUE` exists only in
 * `packages/ai-host/.../tgl/emitGeometry.ts`, is imported by exactly one non-test
 * file (`runDeterministicLayout.ts`), runs BEFORE numbers exist, and is not on any
 * executor's path.
 *
 * Recorded once before as L-896 with `Room 00-001`; the mechanism was never closed.
 *
 * Maps C84 §9 (element integrity / authored-vs-derived), EI-7e (authored numbers
 * are never renumbered), L-127 (no baked literals).
 */

import { describe, it, expect } from 'vitest';
import {
    assignUniqueRoomNumbers,
    isSystemMintedRoomName,
} from '../src/rooms/RoomNumbering';
import type { RoomData } from '@pryzm/room-topology';

/** A detected room as it reaches the numberer. */
const room = (over: Partial<RoomData> & { id: string }): RoomData => ({
    levelId: 'lvl-1',
    name: undefined,
    roomNumber: undefined,
    ...over,
} as unknown as RoomData);

const namesOf   = (rs: RoomData[]) => rs.map(r => r.name);
const numbersOf = (rs: RoomData[]) => rs.map(r => r.roomNumber);

describe('§MINTED-NAME-FOLLOWS-NUMBER A — the founder screenshot', () => {
    it('THE TEETH: two rooms arriving as the SAME minted name do not leave as the same name', () => {
        // Exactly the screenshot: one level, two rooms, both carrying `01-002` and the
        // name minted from it. The second must be renumbered — and its NAME must follow.
        const out = assignUniqueRoomNumbers([
            room({ id: 'r-a', roomNumber: '01-002', name: 'Room 01-002' }),
            room({ id: 'r-b', roomNumber: '01-002', name: 'Room 01-002' }),
        ], '01');

        expect(new Set(numbersOf(out)).size).toBe(2);
        // RED against the old predicate, which left both named `Room 01-002`.
        expect(new Set(namesOf(out)).size).toBe(2);
    });

    it('THE RULE: every system-minted name names its OWN number, for every room', () => {
        // Stated as the rule rather than as the pair of strings, so it survives any
        // change to the numbering scheme.
        const out = assignUniqueRoomNumbers([
            room({ id: 'r-a', roomNumber: '01-002', name: 'Room 01-002' }),
            room({ id: 'r-b', roomNumber: '01-002', name: 'Room 01-002' }),
            room({ id: 'r-c', roomNumber: '01-002', name: 'Room 01-002' }),
            room({ id: 'r-d' }),
            room({ id: 'r-e', name: 'Room' }),
        ], '01');

        for (const r of out) {
            expect(r.name).toBe(`Room ${r.roomNumber}`);
        }
        expect(new Set(namesOf(out)).size).toBe(out.length);
    });

    it('a room renumbered because the LEVEL PREFIX moved also has its name repaired', () => {
        // `resolveRoomLevelPrefix` keys on the level's INDEX in the elevation-sorted
        // list, so inserting a level below shifts every prefix above it. Every room on
        // the shifted level then fails `expectedPattern` and is renumbered en masse —
        // which used to strand every one of their names at the old prefix.
        const out = assignUniqueRoomNumbers([
            room({ id: 'r-a', roomNumber: '01-001', name: 'Room 01-001' }),
            room({ id: 'r-b', roomNumber: '01-002', name: 'Room 01-002' }),
        ], '02');   // the level moved from index 1 to index 2

        expect(numbersOf(out).every(n => String(n).startsWith('02-'))).toBe(true);
        expect(namesOf(out).some(n => String(n).includes('01-'))).toBe(false);
        for (const r of out) expect(r.name).toBe(`Room ${r.roomNumber}`);
    });

    it('the KEEP branch repairs a minted name that names a DIFFERENT number', () => {
        // The room keeps its number (it is well-formed and free), but arrived holding a
        // name stranded by an EARLIER renumber. Keeping the number is not enough.
        const out = assignUniqueRoomNumbers([
            room({ id: 'r-a', roomNumber: '01-007', name: 'Room 01-002' }),
        ], '01');

        expect(out[0].roomNumber).toBe('01-007');
        expect(out[0].name).toBe('Room 01-007');
    });

    it('a settled, already-consistent set is returned UNCHANGED by identity (idempotent)', () => {
        // The tag populator re-runs on every view activation. If this pass rewrote a
        // settled set it would emit store events forever (§A.21.D25).
        const input = [
            room({ id: 'r-a', roomNumber: '01-001', name: 'Room 01-001' }),
            room({ id: 'r-b', roomNumber: '01-002', name: 'Room 01-002' }),
        ];
        const out = assignUniqueRoomNumbers(input, '01');
        expect(out[0]).toBe(input[0]);
        expect(out[1]).toBe(input[1]);

        // …and running it on its own output changes nothing.
        expect(assignUniqueRoomNumbers(out, '01')).toEqual(out);
    });
});

describe('§MINTED-NAME-FOLLOWS-NUMBER B — AUTHORED names are never touched', () => {
    it('a human name survives a renumber intact', () => {
        const out = assignUniqueRoomNumbers([
            room({ id: 'r-a', roomNumber: '01-002', name: 'Kitchen' }),
            room({ id: 'r-b', roomNumber: '01-002', name: 'Master Bedroom' }),
        ], '01');

        expect(namesOf(out)).toEqual(['Kitchen', 'Master Bedroom']);
        expect(new Set(numbersOf(out)).size).toBe(2);
    });

    it('a human name that merely CONTAINS a number shape is still authored', () => {
        for (const authored of ['Room 2', 'Storage 01-002 (north)', 'Roommate', 'room 01-002', 'Office 101']) {
            expect(isSystemMintedRoomName(authored, '')).toBe(false);
        }
    });

    it('EI-7e (C84 §9) fence: an AUTHORED NUMBER is still kept verbatim', () => {
        const out = assignUniqueRoomNumbers([
            room({ id: 'r-a', roomNumber: '101', name: 'Kitchen', metadata: { roomNumberAuthored: true } } as never),
            room({ id: 'r-b', roomNumber: '01-002', name: 'Room 01-002' }),
        ], '01');
        expect(out[0].roomNumber).toBe('101');
        expect(out[0].name).toBe('Kitchen');
    });
});

describe('§MINTED-NAME-FOLLOWS-NUMBER C — the predicate itself', () => {
    it('recognises what the numberer mints, at any prefix/sequence width', () => {
        // L-127: the widths in `padStart(2)` / `padStart(3)` are MINIMA, not fixed.
        for (const minted of ['Room 00-001', 'Room 01-002', 'Room 12-345', 'Room 100-0001']) {
            expect(isSystemMintedRoomName(minted, '')).toBe(true);
        }
    });

    it('recognises the empty / placeholder / bare-number system seeds', () => {
        expect(isSystemMintedRoomName(undefined, '')).toBe(true);
        expect(isSystemMintedRoomName('', '')).toBe(true);
        expect(isSystemMintedRoomName('Room', '')).toBe(true);
        // HouseLayoutExecutor seeds "01", "02"… and the name can equal that seed.
        expect(isSystemMintedRoomName('01', '01')).toBe(true);
    });

    it('an EMPTY incoming number never makes an arbitrary name look system-minted', () => {
        // Guarding the `name === incoming` arm: with `incoming === ''` a falsy-equality
        // slip would classify every authored name as replaceable.
        expect(isSystemMintedRoomName('Kitchen', '')).toBe(false);
    });
});
