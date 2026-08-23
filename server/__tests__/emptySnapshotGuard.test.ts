/**
 * emptySnapshotGuard.test.ts — §GUARD-EMPTY-SNAPSHOT (L-10040)
 *
 * The standard this guard has to meet is asymmetric, so the tests are too:
 *
 *   • ONE test proves the refusal fires on the loss case.
 *   • EIGHT prove it does NOT fire on shapes a correct client actually sends.
 *
 * That ratio is the point. A refusal firing on a legitimate save is worse than
 * the hole it closes, so the false-positive surface is what needs the coverage.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
    BARE_SNAPSHOT_CEILING,
    CONTENT_ARRAYS,
    countSnapshotElements,
    decideSnapshotWrite,
    emptySnapshotRejectionBody,
} from '../emptySnapshotGuard.js';

const _here = dirname(fileURLToPath(import.meta.url));

/** A snapshot in the shape `PlatformShell._makeEmptySnapshot()` produces. */
const EMPTY_SNAPSHOT = {
    projectId: 'p1', projectName: 'P', elementCount: 0,
    walls: [], slabs: [], furniture: [], levels: [{ id: 'L1', elevation: 0 }], grids: [{ id: 'g1' }],
    columns: [], stairs: [], beams: [], curtainWalls: [], roofs: [],
    handrails: [], plumbing: [], windows: [], doors: [],
    viewDefinitions: [], visibilityRules: [], sheets: [], schedules: [], schemaVersion: 1,
};

describe('§GUARD-EMPTY-SNAPSHOT — countSnapshotElements', () => {
    it('returns 0 for the exact shape the editor loads to CLEAR a scene', () => {
        expect(countSnapshotElements(EMPTY_SNAPSHOT)).toBe(0);
    });

    it('⛔ does NOT count levels or grids — both are re-seeded by ClearProjectCommand', () => {
        // If either were counted, a wiped scene would still look populated and
        // this guard could never fire at all: a guard on a path nothing takes.
        expect(CONTENT_ARRAYS).not.toContain('levels');
        expect(CONTENT_ARRAYS).not.toContain('grids');
        // A cleared scene still serialises a default level and a grid; alongside a
        // known-but-empty content array it must still read as BARE.
        expect(countSnapshotElements({ walls: [], levels: [{}, {}, {}], grids: [{}, {}] })).toBe(0);
        // With NO known content array at all the answer is "unreadable", not 0 —
        // levels and grids alone never make a snapshot classifiable.
        expect(countSnapshotElements({ levels: [{}, {}, {}], grids: [{}, {}] })).toBeNull();
    });

    it('counts every one of the 14 families ProjectSerializer sums into elementCount', () => {
        for (const family of [
            'walls', 'slabs', 'ceilings', 'floors', 'columns', 'stairs',
            'beams', 'curtainWalls', 'roofs', 'furniture',
            'handrails', 'plumbing', 'rooms', 'lighting',
        ]) {
            expect(countSnapshotElements({ [family]: [{ id: 'x' }] }), family).toBe(1);
        }
    });

    it('counts HOSTED content too, so a doors-only snapshot is never called bare', () => {
        expect(countSnapshotElements({ walls: [], doors: [{ id: 'd1' }] })).toBe(1);
        expect(countSnapshotElements({ windows: [{ id: 'w' }], openings: [{ id: 'o' }] })).toBe(2);
    });

    it('returns null — NOT zero — for a shape carrying none of the known arrays', () => {
        // "unreadable" and "empty" must not be the same value; the decider
        // accepts the first and only ever refuses on the second.
        expect(countSnapshotElements({ somethingElse: 1 })).toBeNull();
        expect(countSnapshotElements(null)).toBeNull();
        expect(countSnapshotElements('a string')).toBeNull();
        expect(countSnapshotElements([])).toBeNull();
    });
});

describe('§GUARD-EMPTY-SNAPSHOT — decideSnapshotWrite REFUSES exactly one shape', () => {
    it('⛔ refuses an empty snapshot over a populated stored version', () => {
        const v = decideSnapshotWrite({ incomingElementCount: 0, storedElementCount: 793 });
        expect(v.accept).toBe(false);
        expect(v.code).toBe('empty_snapshot_rejected');
    });

    it('the refusal NAMES both counts and the escape hatch, in the message itself', () => {
        const v = decideSnapshotWrite({ incomingElementCount: 0, storedElementCount: 793 });
        expect(v.reason).toContain('0');
        expect(v.reason).toContain('793');
        expect(v.reason).toContain('force');
        // ⭐ and it says what it did NOT do, so a refusal is never read as a delete.
        expect(v.reason).toMatch(/No stored version was modified or deleted/i);
    });

    it('the HTTP body carries both counts, the code and the override by name', () => {
        const body = emptySnapshotRejectionBody(
            decideSnapshotWrite({ incomingElementCount: 0, storedElementCount: 12 }),
        );
        expect(body.code).toBe('empty_snapshot_rejected');
        expect(body.incomingElementCount).toBe(0);
        expect(body.storedElementCount).toBe(12);
        expect(body.override).toMatch(/force/);
    });
});

describe('§GUARD-EMPTY-SNAPSHOT — the false-positive surface, which is the real risk', () => {
    it('accepts the FIRST version of a project (nothing stored to lose)', () => {
        expect(decideSnapshotWrite({ incomingElementCount: 0, storedElementCount: null }).accept).toBe(true);
        expect(decideSnapshotWrite({ incomingElementCount: 0, storedElementCount: undefined }).accept).toBe(true);
    });

    it('accepts empty over empty — a new project autosaving its scaffold', () => {
        const v = decideSnapshotWrite({ incomingElementCount: 0, storedElementCount: 0 });
        expect(v.accept).toBe(true);
        expect(v.code).toBe('accepted_stored_also_bare');
    });

    it('accepts any snapshot that carries a single element', () => {
        const v = decideSnapshotWrite({ incomingElementCount: 1, storedElementCount: 5000 });
        expect(v.accept).toBe(true);
        expect(v.code).toBe('accepted_not_bare');
    });

    it('accepts a shrink that is not to zero — deleting 4 999 of 5 000 walls is legal', () => {
        expect(decideSnapshotWrite({ incomingElementCount: 1, storedElementCount: 5000 }).accept).toBe(true);
    });

    it('accepts when the incoming shape was unreadable — never refuse on a guess', () => {
        const v = decideSnapshotWrite({ incomingElementCount: null, storedElementCount: 900 });
        expect(v.accept).toBe(true);
        expect(v.code).toBe('accepted_shape_unreadable');
    });

    it('accepts under force:true, and says so in the reason', () => {
        const v = decideSnapshotWrite({ incomingElementCount: 0, storedElementCount: 42, force: true });
        expect(v.accept).toBe(true);
        expect(v.code).toBe('accepted_forced');
        expect(v.reason).toContain('42');
    });

    it('does not treat a truthy non-true `force` as consent', () => {
        // A stray `force: "yes"` from a hand-rolled client must not disable a
        // data-protecting refusal.
        expect(decideSnapshotWrite({ incomingElementCount: 0, storedElementCount: 7, force: 'yes' as never }).accept).toBe(false);
        expect(decideSnapshotWrite({ incomingElementCount: 0, storedElementCount: 7, force: 1 as never }).accept).toBe(false);
    });

    it('accepts when the stored count is NaN / not a number (fail open)', () => {
        expect(decideSnapshotWrite({ incomingElementCount: 0, storedElementCount: NaN }).accept).toBe(true);
        expect(decideSnapshotWrite({ incomingElementCount: 0, storedElementCount: 'many' as never }).accept).toBe(true);
    });

    it('never throws, whatever it is handed', () => {
        expect(() => decideSnapshotWrite(undefined as never)).not.toThrow();
        expect(() => decideSnapshotWrite({} as never)).not.toThrow();
        expect(decideSnapshotWrite(undefined as never).accept).toBe(true);
    });

    it('the ceiling is 0 — raising it would start refusing real one-wall projects', () => {
        expect(BARE_SNAPSHOT_CEILING).toBe(0);
    });
});

describe('§GUARD-EMPTY-SNAPSHOT — the route actually wires it (a module nothing calls guards nothing)', () => {
    const serverJs = readFileSync(resolve(_here, '../../server.js'), 'utf8');

    it('server.js imports the guard', () => {
        expect(serverJs).toMatch(/from\s+'\.\/server\/emptySnapshotGuard\.js'/);
    });

    it('the versions POST route calls decideSnapshotWrite and can return 409', () => {
        const routeStart = serverJs.indexOf("app.post('/api/projects/:id/versions'");
        expect(routeStart).toBeGreaterThan(-1);
        const routeEnd = serverJs.indexOf("app.get('/api/projects/:id/command-log'", routeStart);
        const route = serverJs.slice(routeStart, routeEnd);
        expect(route).toContain('decideSnapshotWrite(');
        expect(route).toContain('countSnapshotElements(');
        expect(route).toContain('res.status(409).json(emptySnapshotRejectionBody(');
    });

    it('⭐ the stored-side read is INSIDE the bare-snapshot branch, so a normal save pays nothing', () => {
        const routeStart = serverJs.indexOf("app.post('/api/projects/:id/versions'");
        const routeEnd = serverJs.indexOf("app.get('/api/projects/:id/command-log'", routeStart);
        const route = serverJs.slice(routeStart, routeEnd);
        const branchAt = route.indexOf('if (_incomingElements === 0)');
        const readAt = route.indexOf('getLatestVersionElementCount(');
        expect(branchAt).toBeGreaterThan(-1);
        expect(readAt).toBeGreaterThan(branchAt);
    });
});
