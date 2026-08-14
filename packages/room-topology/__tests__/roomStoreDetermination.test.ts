// §GR-10/GR-14 — "the room store did not answer" ≠ "this element is in no room".
//
// THE SITE: `check-no-empty-means-unknown` ARM A at
// `packages/room-topology/src/RoomContentsService.ts:195` — a `return []` reached
// by three distinguishable cases (no rooms / no `getAll` / `getAll` threw).
//
// THE DISCIPLINE THIS FILE ENFORCES: every arm below is DIFFERENTIATING — it
// fails if `[]` and unknown are conflated. A test that only asserted
// `rooms).toEqual([])` would have passed on the defect, which is why the old
// behaviour survived this long inside a package that has tests.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRoomsDetermined } from '../src/roomStoreDetermination';
import { RoomContentsService } from '../src/RoomContentsService';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ROOM = {
    id: 'room-1',
    levelId: 'L0',
    boundingWallIds: ['wall-1'],
    boundary: { polygon: [[0, 0], [4, 0], [4, 3], [0, 3]] },
} as never;

/** Build the service over a room store of the caller's choosing. */
function service(roomStore: unknown): RoomContentsService {
    return new RoomContentsService({ roomStore, bimManager: { getLevelById: () => undefined } } as never);
}

describe('readRoomsDetermined — the four cases the old `return []` merged', () => {
    it('DETERMINED and EMPTY — a project with no rooms is a real answer, never a refusal', () => {
        const d = readRoomsDetermined({ getAll: () => [] });
        expect(d.kind).toBe('determined');
        // The load-bearing half: an empty project must NOT be reported as unknown.
        // Refusing on empty is the mirror-image defect and just as wrong.
        expect(d.kind === 'determined' && d.rooms).toEqual([]);
    });

    it('DETERMINED and non-empty', () => {
        const d = readRoomsDetermined({ getAll: () => [ROOM] });
        expect(d.kind === 'determined' && d.rooms).toHaveLength(1);
    });

    it('UNDETERMINED — the store has no `getAll` (the case the `as any` cast hid)', () => {
        const d = readRoomsDetermined({ notGetAll: () => [] });
        expect(d.kind).toBe('undetermined');
        expect(d.kind === 'undetermined' && d.reason).toBe('RELATIONSHIP_NOT_READABLE');
    });

    it('UNDETERMINED — the store is absent entirely', () => {
        expect(readRoomsDetermined(undefined).kind).toBe('undetermined');
        expect(readRoomsDetermined(null).kind).toBe('undetermined');
    });

    it('UNDETERMINED — `getAll` THREW; a throw is "I could not look", not "there is nothing"', () => {
        const d = readRoomsDetermined({ getAll: () => { throw new Error('store torn down'); } });
        expect(d.kind).toBe('undetermined');
        expect(d.kind === 'undetermined' && d.detail).toContain('store torn down');
    });

    it('UNDETERMINED — `getAll` returned undefined, which the old `?? []` absorbed silently', () => {
        expect(readRoomsDetermined({ getAll: () => undefined }).kind).toBe('undetermined');
    });

    it('THE DIFFERENTIATOR — empty-and-read is NOT EQUAL to could-not-read', () => {
        // This is the assertion the whole row reduces to. Before this change both
        // sides of it were `[]` and it could not have been written at all.
        const empty = readRoomsDetermined({ getAll: () => [] });
        const broken = readRoomsDetermined({ getAll: () => { throw new Error('x'); } });
        expect(empty.kind).not.toBe(broken.kind);
    });

    it('TOTAL — no input makes the reader throw, so no caller needs the try/catch that rebuilt the defect', () => {
        for (const bad of [undefined, null, 0, '', [], { getAll: 7 }, { getAll: () => 'nope' }]) {
            expect(() => readRoomsDetermined(bad)).not.toThrow();
        }
    });
});

describe('RoomContentsService.getRoomForElement — the answer says which of the two it is', () => {
    it('a readable store with no match answers "none" and carries NO `undetermined`', () => {
        const r = service({ getAll: () => [ROOM] }).getRoomForElement('wall-999', 'wall');
        expect(r.rooms).toEqual([]);
        expect(r.relationship).toBe('none');
        expect(r.undetermined, 'a determined "no room" must not be dressed as a refusal').toBeUndefined();
    });

    it('a readable store WITH a match still answers positively (the reader is not now refusing everything)', () => {
        const r = service({ getAll: () => [ROOM] }).getRoomForElement('wall-1', 'wall');
        expect(r.primaryRoomId).toBe('room-1');
        expect(r.relationship).toBe('bounding');
        expect(r.undetermined).toBeUndefined();
    });

    it('DIFFERENTIATING — an UNREADABLE store returns the SAME empty `rooms` but is now distinguishable', () => {
        const broken = service({ getAll: () => { throw new Error('room store torn down'); } })
            .getRoomForElement('wall-1', 'wall');
        const honest = service({ getAll: () => [] }).getRoomForElement('wall-1', 'wall');

        // Identical on every field the old shape had — which is precisely why the
        // defect was invisible, and why the new field is the whole fix.
        expect(broken.rooms).toEqual(honest.rooms);
        expect(broken.relationship).toBe(honest.relationship);

        // …and NOT identical where it counts.
        expect(broken.undetermined?.reason).toBe('RELATIONSHIP_NOT_READABLE');
        expect(honest.undetermined).toBeUndefined();
    });

    it('a mis-wired store (no `getAll`) is undetermined, not "no rooms"', () => {
        const r = service({}).getRoomForElement('wall-1', 'wall');
        expect(r.undetermined?.reason).toBe('RELATIONSHIP_NOT_READABLE');
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// UNION PIN — no rival vocabulary (C78 §8.1, CLOSED at eleven)
// ═════════════════════════════════════════════════════════════════════════════

describe('the reason is command-bus vocabulary, not a fork', () => {
    const union = (): string => {
        const s = readFileSync(resolve(REPO, 'packages/command-bus/src/consequence.ts'), 'utf8');
        const start = s.indexOf('export type UndeterminedReason');
        expect(start, 'UndeterminedReason not found — command-bus moved').toBeGreaterThan(-1);
        return s.slice(start, s.indexOf(';', start));
    };

    it('the member this module produces exists in the closed union', () => {
        expect(union()).toContain("'RELATIONSHIP_NOT_READABLE'");
    });

    it('the union is still closed at ELEVEN — extending it here would fail HERE', () => {
        expect(union().match(/\|\s*'[A-Z_]+'/g)).toHaveLength(11);
    });
});
