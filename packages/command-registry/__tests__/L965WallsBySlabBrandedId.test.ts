// L-965 DEFECT 2 — "walls by slab" minted ids the wall schema REJECTS, and said so
// only after announcing success.
//
// THE FOUNDER'S CONSOLE, verbatim:
//
//   [CreateWallsFromSlabCommand] E.5.x §P2e-wall-slab: wall.batch.create dispatched —
//   33 wall(s) committed to plugin store
//   Uncaught (in promise) WallSchemaError: wall.batch.create rejected — schema
//   validation failed for walls[0] (id=wall-slab-cmd-walls-from-slab-…-0)
//   Caused by: ZodError: pattern "/^wall_[0-9A-HJKMNP-TV-Z]{26}$/" — Expected wall_<ulid> id
//
// TWO defects in four lines, and this file pins both:
//
//  1. THE ID. `wall-slab-<cmdId>-<i>` is not the branded `wall_<ULID>` shape
//     `defineElement('wall', …)` declares (C11 §3.2). Every HAND-DRAWN wall in the
//     same session was branded correctly, so this generator alone was non-conformant.
//     ⛔ The schema is the contract — the generator was fixed, not the pattern.
//  2. THE SENTENCE. "committed to plugin store" was written on the line after the
//     dispatch call and BEFORE the promise it returned settled, so a total rejection
//     printed as a success. That is the L-951/L-960 family: a success sentence
//     emitted independently of the outcome it describes. It now rides INSIDE the
//     outcome — "ACCEPTED" is reachable only from the resolved branch.
//
// The ORACLE for (1) is deliberately NOT this repo's minting code: the assertions use
// the literal regex from the founder's own error text, so a broken `createId` cannot
// move the subject and the oracle together.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CreateWallsFromSlabCommand } from '../src/walls/CreateWallsFromSlabCommand';
import type { CommandContext } from '../src/types';

/** The pattern out of the founder's ZodError. Written here as a literal, on purpose. */
const BRANDED_WALL_ID = /^wall_[0-9A-HJKMNP-TV-Z]{26}$/;
/** The exact malformed shape the founder's log carried. */
const LEGACY_COMPOSED_ID = /^wall-slab-cmd-walls-from-slab-/;

type Pt = { x: number; y: number; z: number };

interface W {
    id: string;
    levelId: string;
    baseLine: [Pt, Pt];
    height: number;
    thickness: number;
    openings: unknown[];
    childrenIds: string[];
}

function makeWallStore() {
    const map = new Map<string, W>();
    return {
        map,
        add(w: W) { map.set(w.id, w); },
        remove(id: string) { map.delete(id); },
        getById(id: string) { return map.get(id); },
        getAll() { return [...map.values()]; },
        getByLevel(levelId: string) { return [...map.values()].filter(w => w.levelId === levelId); },
        update(id: string, patch: Partial<W>) { const w = map.get(id); if (w) map.set(id, { ...w, ...patch } as W); },
    };
}

/** A 6 m x 4 m rectangular slab — the STRAIGHT case, which must keep working. */
const RECT = [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }];

function makeCtx(polygon: { x: number; y: number }[] = RECT) {
    const wallStore = makeWallStore();
    const slab = { id: 'slab-1', type: 'slab', levelId: 'L0', position: { x: 0, y: 0, z: 0 }, polygon };
    const level = { id: 'L0', elevation: 0, childrenIds: [] as string[] };
    const ctx = {
        stores: {
            wallStore,
            slabStore: { getById: (id: string) => (id === 'slab-1' ? slab : undefined), getAll: () => [slab] },
        },
        bimManager: {
            getLevels: () => [level],
            getLevelById: (id: string) => (id === 'L0' ? level : undefined),
            registerElement: () => {},
            unregisterElement: () => {},
            registerMany: () => {},
        },
    } as unknown as CommandContext;
    return { ctx, wallStore };
}

/** Install a bus double whose `wall.batch.create` settles the way the caller chooses. */
function installBus(mode: 'resolve' | 'reject') {
    const seen: Array<{ walls: Array<{ id: string }> }> = [];
    const bus = {
        registry: { has: (t: string) => t === 'wall.batch.create' },
        executeCommand: (_t: string, payload: { walls: Array<{ id: string }> }) => {
            seen.push(payload);
            return mode === 'resolve'
                ? Promise.resolve({ ok: true })
                : Promise.reject(new Error('wall.batch.create rejected — schema validation failed for walls[0]'));
        },
    };
    (window as unknown as { runtime?: unknown }).runtime = { bus };
    return seen;
}

function silenceConsole() {
    const logs: string[] = [];
    const errors: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    return { logs, errors };
}

describe('L-965 §WALLS-BY-SLAB-BRANDED-ID — the ids the schema actually accepts', () => {
    beforeEach(() => { silenceConsole(); });
    afterEach(() => {
        vi.restoreAllMocks();
        delete (window as unknown as { runtime?: unknown }).runtime;
    });

    it('every wall created from a slab carries a branded wall_<ULID> id', () => {
        installBus('resolve');
        const { ctx, wallStore } = makeCtx();
        const cmd = new CreateWallsFromSlabCommand({ slabId: 'slab-1' });

        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);

        expect(r.success).toBe(true);
        expect(r.affectedElementIds.length).toBe(4);   // NON-REGRESSION: a rectangle is still 4 walls
        for (const id of r.affectedElementIds) {
            expect(id, `${id} must be a branded wall id`).toMatch(BRANDED_WALL_ID);
            expect(id).not.toMatch(LEGACY_COMPOSED_ID);
        }
        // …and the ids the STORE holds are the same branded ids, not a parallel set.
        expect(wallStore.getAll().map(w => w.id).sort()).toEqual([...r.affectedElementIds].sort());
    });

    it('the ids handed to wall.batch.create are the branded ones — walls[0] is what was rejected', () => {
        const seen = installBus('resolve');
        const { ctx } = makeCtx();
        new CreateWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);

        expect(seen).toHaveLength(1);
        expect(seen[0]!.walls.length).toBe(4);
        for (const w of seen[0]!.walls) expect(w.id).toMatch(BRANDED_WALL_ID);
    });

    it('ids are STABLE across undo → redo — the §2.6 idempotency guard still holds', () => {
        installBus('resolve');
        const { ctx, wallStore } = makeCtx();
        const cmd = new CreateWallsFromSlabCommand({ slabId: 'slab-1' });

        const first = cmd.execute(ctx).affectedElementIds;
        expect(cmd.undo(ctx).success).toBe(true);
        expect(wallStore.getAll()).toHaveLength(0);           // undo actually removed them

        const second = cmd.execute(ctx).affectedElementIds;
        expect(second).toEqual(first);                        // NOT a fresh set of ULIDs
        expect(wallStore.getAll()).toHaveLength(4);           // and no duplicates
    });

    it('two SEPARATE commands never collide, even on the same slab', () => {
        installBus('resolve');
        const { ctx } = makeCtx();
        const a = new CreateWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx).affectedElementIds;
        const b = new CreateWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx).affectedElementIds;
        expect(new Set([...a, ...b]).size).toBe(a.length + b.length);
    });
});

describe('L-965 §OUTCOME-CARRIES-THE-SENTENCE — no success line for a dispatch that failed', () => {
    let logs: string[];
    let errors: string[];

    beforeEach(() => { ({ logs, errors } = silenceConsole()); });
    afterEach(() => {
        vi.restoreAllMocks();
        delete (window as unknown as { runtime?: unknown }).runtime;
    });

    it('a REJECTED batch never prints "committed to plugin store", and is not left uncaught', async () => {
        installBus('reject');
        const { ctx } = makeCtx();
        new CreateWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);

        // Let the dispatch promise settle — the whole point is that the sentence is
        // written LATER than the call, from the branch that knows the answer.
        await new Promise(r => setTimeout(r, 0));

        expect(
            logs.filter(l => /committed to plugin store/.test(l)),
            'the founder saw exactly this line for a batch that was rejected in full',
        ).toEqual([]);
        expect(errors.some(e => /REJECTED/.test(e) && /0 of 4/.test(e))).toBe(true);
    });

    it('an ACCEPTED batch says so, and only after it settled', async () => {
        installBus('resolve');
        const { ctx } = makeCtx();
        new CreateWallsFromSlabCommand({ slabId: 'slab-1' }).execute(ctx);

        // Synchronously after execute() returns, nothing has been claimed yet.
        expect(logs.filter(l => /committed to plugin store/.test(l))).toEqual([]);

        await new Promise(r => setTimeout(r, 0));

        expect(logs.some(l => /ACCEPTED/.test(l) && /4 wall\(s\) committed to plugin store/.test(l))).toBe(true);
        expect(errors.filter(e => /REJECTED/.test(e))).toEqual([]);
    });
});
