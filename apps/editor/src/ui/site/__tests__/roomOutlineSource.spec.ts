/**
 * §ROOMS-ON-THE-VIEWS (§26.6.4 · L-13046) — the ONE read of a room's detected outline.
 *
 * ⭐ WHAT THESE ARMS ARE FOR. A suite that only proved *"a polygon comes back"* would pass over
 * the three failures this reader is actually exposed to, and every one of them produces a picture
 * the founder could not tell apart from a correct one:
 *
 *   1. "NO OUTLINE RECORDED" READ AS "A DEGENERATE OUTLINE". `roomOutlineVertexCount` returns
 *      `null` for a record with no polygon array and a NUMBER for one that has an array — so a
 *      room declared in the programme before any wall encloses it says *"nothing has detected this
 *      yet"*, not *"PRYZM looked and found a broken shape"*. A `?? 0` anywhere on that path is the
 *      §CONTEXT-DATA-HONESTY conflation, and it would slander the user's model.
 *   2. A SILENTLY SHORTENED RING. A ring with one non-finite vertex must drop WHOLE, never
 *      vertex-by-vertex: a room drawn with three of its four corners still looks like a room, and
 *      it is the one failure a reader has no way to detect.
 *   3. AN UNKNOWN STOREY DRAWN AS THE GROUND FLOOR. `worldY` is `null` when the level's elevation
 *      could not be read — never 0 — because a first-floor outline drawn at the datum is
 *      indistinguishable from a ground-floor one (§L-446, in geometry).
 */

import { describe, it, expect } from 'vitest';
import {
    roomOutlineVertexCount,
    readRoomOutlineFrom,
} from '../roomOutlineSource';

const SQUARE = [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 3 }, { x: 0, z: 3 }];
const room = (over: Record<string, unknown> = {}): unknown => ({
    id: 'r1',
    name: 'Kitchen',
    levelId: 'L1',
    boundary: { polygon: SQUARE, height: 2.6, baseOffset: 0.1 },
    ...over,
});

/** A storey table with ONE storey. Anything else is "could not be read", never 0. */
const levels = (id: string, elevation: number) => (levelId: string): number | null =>
    levelId === id ? elevation : null;
const noLevels = (): number | null => null;

describe('§26.6.4 — roomOutlineVertexCount: "not recorded" and "recorded and short" are different values', () => {
    it('⛔ returns null for NO polygon array, and a NUMBER for one that exists', () => {
        expect(roomOutlineVertexCount(room())).toBe(4);
        // No boundary at all — a programme room that no wall encloses yet.
        expect(roomOutlineVertexCount({ id: 'r' })).toBeNull();
        // A boundary with no polygon key.
        expect(roomOutlineVertexCount({ id: 'r', boundary: { height: 2.6 } })).toBeNull();
        // ⭐ AN EMPTY ARRAY IS `0`, NOT `null` — an outline WAS recorded and it is empty. The row
        // prints a different sentence for that, which is the whole point of this distinction.
        expect(roomOutlineVertexCount({ id: 'r', boundary: { polygon: [] } })).toBe(0);
        expect(roomOutlineVertexCount({ id: 'r', boundary: { polygon: [{ x: 0, z: 0 }, { x: 1, z: 1 }] } })).toBe(2);
    });

    it('never throws on rubbish', () => {
        expect(roomOutlineVertexCount(null)).toBeNull();
        expect(roomOutlineVertexCount(undefined)).toBeNull();
        expect(roomOutlineVertexCount('room')).toBeNull();
        expect(roomOutlineVertexCount({ boundary: { polygon: 'square' } })).toBeNull();
    });
});

describe('§26.6.4 — readRoomOutlineFrom: the ring, its storey, and the honest nulls', () => {
    it('reads the ring in scene XZ and seats it at level elevation + base offset', () => {
        const o = readRoomOutlineFrom([room()], 'r1', levels('L1', 3))!;
        expect(o).not.toBeNull();
        expect(o.id).toBe('r1');
        expect(o.name).toBe('Kitchen');
        expect(o.ring).toEqual(SQUARE);
        // OPEN ring — the closing segment is implicit, exactly as `RoomBoundary` declares it.
        expect(o.ring.length).toBe(4);
        expect(o.levelId).toBe('L1');
        expect(o.baseOffsetM).toBeCloseTo(0.1, 10);
        expect(o.heightM).toBeCloseTo(2.6, 10);
        expect(o.worldY).toBeCloseTo(3.1, 10);
    });

    it('⛔ worldY is null — NEVER 0 — when the storey elevation could not be read', () => {
        const o = readRoomOutlineFrom([room()], 'r1', noLevels)!;
        expect(o.worldY).toBeNull();
        // The ring is still perfectly readable: an unknown height withholds the height, not the room.
        expect(o.ring.length).toBe(4);
    });

    it('⛔ worldY is null when the record names no storey at all — and 0 is a REAL elevation', () => {
        expect(readRoomOutlineFrom([room({ levelId: undefined })], 'r1', levels('L1', 3))!.worldY).toBeNull();
        // A ground storey at 0 m is a definite answer and must not read as "unknown".
        const ground = readRoomOutlineFrom([room({ boundary: { polygon: SQUARE, baseOffset: 0 } })], 'r1', levels('L1', 0))!;
        expect(ground.worldY).toBe(0);
    });

    it('⛔ a ring with a non-finite vertex drops WHOLE — never silently shortened', () => {
        const broken = room({ boundary: { polygon: [{ x: 0, z: 0 }, { x: Number.NaN, z: 1 }, { x: 4, z: 3 }, { x: 0, z: 3 }] } });
        expect(readRoomOutlineFrom([broken], 'r1', levels('L1', 3))).toBeNull();
    });

    it('returns null for an outline that is not a polygon, and for a room that is not there', () => {
        expect(readRoomOutlineFrom([room({ boundary: { polygon: [{ x: 0, z: 0 }, { x: 1, z: 1 }] } })], 'r1', noLevels)).toBeNull();
        expect(readRoomOutlineFrom([room({ boundary: undefined })], 'r1', noLevels)).toBeNull();
        expect(readRoomOutlineFrom([room()], 'r-other', noLevels)).toBeNull();
        expect(readRoomOutlineFrom([], 'r1', noLevels)).toBeNull();
    });

    it('picks the room by ID, never by position or by name', () => {
        const a = room({ id: 'a', name: 'Kitchen' });
        const b = room({ id: 'b', name: 'Kitchen', boundary: { polygon: [{ x: 9, z: 9 }, { x: 10, z: 9 }, { x: 10, z: 10 }] } });
        const o = readRoomOutlineFrom([a, b], 'b', noLevels)!;
        expect(o.id).toBe('b');
        expect(o.ring[0]).toEqual({ x: 9, z: 9 });
    });

    it('never throws on rubbish records', () => {
        expect(() => readRoomOutlineFrom([null, undefined, 7, 'x', room()], 'r1', noLevels)).not.toThrow();
        expect(readRoomOutlineFrom([null, undefined, 7, 'x', room()], 'r1', noLevels)!.id).toBe('r1');
    });

    it('an unnamed room keeps a null name — never the id typeset as a name', () => {
        expect(readRoomOutlineFrom([room({ name: '   ' })], 'r1', noLevels)!.name).toBeNull();
        expect(readRoomOutlineFrom([room({ name: undefined })], 'r1', noLevels)!.name).toBeNull();
    });
});
