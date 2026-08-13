// GR-10 — assembleRoomDaylightInput differentiating tests (the pure half of
// the §DIAG-DAYLIGHT console pass).
//
// The old shape iterated `wall.openings ?? []`: a wall whose opening set was
// NEVER RECORDED contributed zero window apertures and the room was scored
// DARKER than anyone measured — a positive, wrong daylight verdict computed
// from absence. The assembly now returns the room as UNDETERMINED (typed,
// named walls) and the console pass EXCLUDES it visibly. The undetermined
// assertions fail against the `?? []` shape, which returned a scorable input
// in every case.

import { describe, it, expect } from 'vitest';
import { assembleRoomDaylightInput, type WallLike } from '../src/ui/daylight/roomDaylightAssembly';

const ROOM = {
    id: 'r1',
    levelId: 'L0',
    name: 'living',
    boundary: { polygon: [{ x: 0, z: 0 }, { x: 4, z: 0 }, { x: 4, z: 4 }, { x: 0, z: 4 }] },
};

const wall = (id: string, a: [number, number], b: [number, number], openings?: WallLike['openings']): WallLike => ({
    id,
    levelId: 'L0',
    baseLine: [{ x: a[0], z: a[1] }, { x: b[0], z: b[1] }],
    ...(openings !== undefined ? { openings } : {}),
});

const SOUTH_WITH_WINDOW = wall('w-s', [0, 0], [4, 0], [
    { type: 'window', offset: 1, width: 1.2, height: 1.4, sillHeight: 0.9 },
]);
const EAST_EMPTY = wall('w-e', [4, 0], [4, 4], []);
const NORTH_EMPTY = wall('w-n', [4, 4], [0, 4], []);
const WEST_EMPTY = wall('w-w', [0, 4], [0, 0], []);

describe('assembleRoomDaylightInput — unrecorded openings refuse the room (C75 §1.4)', () => {
    it('fully recorded walls → a scorable input; empty opening sets are real windowless answers', () => {
        const out = assembleRoomDaylightInput(ROOM, [SOUTH_WITH_WINDOW, EAST_EMPTY, NORTH_EMPTY, WEST_EMPTY], undefined);
        expect(out.kind).toBe('input');
        if (out.kind === 'input') {
            expect(out.input.roomId).toBe('r1');
            expect(out.input.windows).toHaveLength(1);
            expect(out.input.windows[0]!.sillM).toBe(0.9);
        }
    });

    it('ONE wall with an UNRECORDED opening set makes the ROOM undetermined, walls named', () => {
        const unrecordedEast = wall('w-e', [4, 0], [4, 4]); // openings never recorded
        const out = assembleRoomDaylightInput(ROOM, [SOUTH_WITH_WINDOW, unrecordedEast, NORTH_EMPTY, WEST_EMPTY], undefined);
        // The old `?? []` shape returned a scorable input here, with the east
        // wall silently contributing "no windows".
        expect(out.kind).toBe('undetermined');
        if (out.kind === 'undetermined') {
            expect(out.reason).toBe('RELATIONSHIP_NOT_RECORDED');
            expect(out.unrecordedWallIds).toEqual(['w-e']);
            expect(out.detail).toContain('w-e');
            expect(out.name).toBe('living');
        }
    });

    it('negative control: a KNOWN-INTERIOR wall is skipped before its openings are read', () => {
        const unrecordedEast = wall('w-e', [4, 0], [4, 4]);
        const facades = new Map([['w-e', { isExterior: false }]]);
        const out = assembleRoomDaylightInput(ROOM, [SOUTH_WITH_WINDOW, unrecordedEast, NORTH_EMPTY, WEST_EMPTY], facades);
        expect(out.kind).toBe('input'); // interior walls host no sky — unknown openings there are irrelevant
    });

    it('degenerate boundary is the legacy skip, not a refusal and not an input', () => {
        const out = assembleRoomDaylightInput(
            { id: 'r2', levelId: 'L0', boundary: { polygon: [{ x: 0, z: 0 }] } },
            [],
            undefined,
        );
        expect(out).toEqual({ kind: 'skipped-degenerate', roomId: 'r2' });
    });
});
