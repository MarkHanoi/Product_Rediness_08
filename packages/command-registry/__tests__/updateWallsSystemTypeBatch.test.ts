// §FEAT-WALL-TYPE-BATCH (RAC prep) — batch wall retype semantics.
//
// Pins the three contract points the founder specified:
//   1. PARTIAL FAILURE (§CONTEXT-DATA-HONESTY): mixed raked/vertical walls —
//      every wall that CAN take the layered type is changed, each raked wall is
//      SKIPPED with the ADR-0310 refusal reason, and the result reports
//      "Changed N of M — K skipped". A refusal and a success are never the same
//      observable. ALL-refused = visible no-op (canExecute ok:false), never a throw.
//   2. SINGLE UNDO: one batch = one Command; undo() restores EVERY touched wall
//      byte-for-byte (child snapshots via the reused UpdateWallSystemTypeCommand).
//   3. EMPTY SCOPE declines visibly; 'all' spans ALL LEVELS.
// Plus the forgiving type-ref resolver (exact id → exact name → case-insensitive).

import { describe, it, expect, beforeEach } from 'vitest';
import {
    UpdateWallsSystemTypeBatchCommand,
    resolveWallSystemTypeRef,
} from '../src/walls/UpdateWallsSystemTypeBatchCommand';
import { wallSystemTypeStore } from '@pryzm/geometry-wall';
import type { CommandContext } from '../src/types';

type Pt = { x: number; y: number; z: number };
interface W {
    id: string;
    levelId: string;
    baseLine: [Pt, Pt];
    thickness: number;
    systemTypeId?: string | null;
    layers?: unknown[] | null;
    rakeAngleDeg?: number;
    openings: unknown[];
    childrenIds: string[];
}

function p(x: number, z: number): Pt { return { x, y: 0, z }; }

function wall(id: string, over: Partial<W> = {}): W {
    return {
        id, levelId: 'L0',
        baseLine: [p(0, 0), p(5, 0)],
        thickness: 0.2,
        openings: [], childrenIds: [],
        ...over,
    };
}

/** Canonical serialisation — key-order-independent equality oracle. */
function canon(v: unknown): string {
    const sort = (x: unknown): unknown => {
        if (Array.isArray(x)) return x.map(sort);
        if (x && typeof x === 'object') {
            const o = x as Record<string, unknown>;
            return Object.fromEntries(Object.keys(o).sort().map(k => [k, sort(o[k])]));
        }
        return x;
    };
    return JSON.stringify(sort(v));
}

/** Minimal WallStore double with the surface the (reused) single-wall command
 *  touches: getById / getAll / updateWall(full state) / restoreSnapshot. */
function makeWallStore(seed: W[]) {
    const map = new Map<string, W>(seed.map(w => [w.id, structuredClone(w)]));
    return {
        map,
        getById(id: string) { return map.get(id); },
        getAll() { return [...map.values()]; },
        updateWall(next: W) { map.set(next.id, structuredClone(next)); },
        restoreSnapshot(snap: W) { map.set(snap.id, structuredClone(snap)); },
    };
}

function makeCtx(store: ReturnType<typeof makeWallStore>): CommandContext {
    return {
        stores: {
            wallStore: store,
            wallSystemTypeStore, // the real catalogue singleton (built-ins)
        },
    } as unknown as CommandContext;
}

const PARTITION_ID   = 'wt-interior-partition';
const PARTITION_NAME = 'Interior – Partition 100mm';
const BRICK_ID       = 'wt-exterior-brick';

describe('resolveWallSystemTypeRef — forgiving lookup for the RAC', () => {
    it('resolves exact id, exact name, and case-insensitive name — in that precedence', () => {
        expect(resolveWallSystemTypeRef(wallSystemTypeStore, PARTITION_ID)?.id).toBe(PARTITION_ID);
        expect(resolveWallSystemTypeRef(wallSystemTypeStore, PARTITION_NAME)?.id).toBe(PARTITION_ID);
        expect(resolveWallSystemTypeRef(wallSystemTypeStore, '  interior – partition 100MM ')?.id).toBe(PARTITION_ID);
        expect(resolveWallSystemTypeRef(wallSystemTypeStore, 'Exterior – Brick 300mm')?.id).toBe(BRICK_ID);
    });

    it('returns null (never throws) for an unknown reference', () => {
        expect(resolveWallSystemTypeRef(wallSystemTypeStore, 'no-such-type')).toBeNull();
    });
});

describe('UpdateWallsSystemTypeBatchCommand — §CONTEXT-DATA-HONESTY batch semantics', () => {
    let store: ReturnType<typeof makeWallStore>;
    let ctx: CommandContext;

    beforeEach(() => {
        store = makeWallStore([
            wall('w1'),
            // §FEAT-RAKE-LAYERED (2026-08-18) — this was `{ rakeAngleDeg: 45 }` alone,
            // "raked → refuses a layered type (ADR-0310)". A raked wall TAKES a layered
            // type now (t / sin θ bands are built), so the refuser has to be the
            // combination that is still unbuilt: raked × layered × HOSTS AN OPENING, whose
            // body would be assembled by the un-sheared opening-segment builder. The
            // contract point under test — partial failure is visible, never a crash and
            // never a silent skip — is unchanged; only the refusing shape moved.
            wall('w2', { rakeAngleDeg: 45, openings: [{ id: 'o1' }] }),
            wall('w3', { levelId: 'L1' }),              // different level — 'all' must reach it
        ]);
        ctx = makeCtx(store);
    });

    it('mixed batch: changes every acceptor, skips each raked wall WITH its reason, reports N of M', () => {
        const cmd = new UpdateWallsSystemTypeBatchCommand({
            wallIds: ['w1', 'w2', 'w3'],
            systemType: PARTITION_NAME,                  // by NAME — resolver in the command path
        });

        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(true);                         // mixed ⇒ proceed
        expect(v.warnings?.length).toBe(1);              // the raked refusal is pre-announced

        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds).toEqual(['w1', 'w3']);
        expect(r.info?.[0]).toMatch(/^Changed 2 of 3 walls to "Interior – Partition 100mm" — 1 skipped$/);
        // Grouped refusal reason travels with the result — visible, not silent.
        expect(r.info?.slice(1).join('\n')).toMatch(/1× .*raked/i);

        // Acceptors actually retyped (id + materialised layers + catalogue thickness).
        const w1 = store.getById('w1')!;
        expect(w1.systemTypeId).toBe(PARTITION_ID);
        expect((w1.layers as unknown[]).length).toBe(3);
        expect(w1.thickness).toBeCloseTo(0.1, 6);

        // The raked wall is OBSERVABLY untouched — refusal ≠ success.
        expect(store.getById('w2')!.systemTypeId).toBeUndefined();
        expect(cmd.skipped.length).toBe(1);
        expect(cmd.skipped[0].wallId).toBe('w2');
        expect(cmd.skipped[0].reason).toMatch(/raked/i);
    });

    it('ONE undo restores every changed wall byte-for-byte and leaves the skipped wall alone', () => {
        const before = canon(store.getAll());

        const cmd = new UpdateWallsSystemTypeBatchCommand({
            wallIds: ['w1', 'w2', 'w3'],
            systemType: PARTITION_ID,
        });
        expect(cmd.execute(ctx).success).toBe(true);
        expect(canon(store.getAll())).not.toBe(before);  // it really changed things

        const u = cmd.undo(ctx);
        expect(u.success).toBe(true);
        expect(canon(store.getAll())).toBe(before);      // whole project byte-identical
    });

    it('undo → redo → undo is a fixed point (execute() resets, never throws on reuse)', () => {
        const before = canon(store.getAll());
        const cmd = new UpdateWallsSystemTypeBatchCommand({ wallIds: 'all', systemType: BRICK_ID });

        for (let cycle = 0; cycle < 3; cycle++) {
            expect(cmd.execute(ctx).success).toBe(true); // redo path re-runs execute()
            cmd.undo(ctx);
            expect(canon(store.getAll()), `cycle ${cycle}`).toBe(before);
        }
    });

    it("'all' scope = every wall in the project across ALL levels (the documented default)", () => {
        const cmd = new UpdateWallsSystemTypeBatchCommand({ wallIds: 'all', systemType: BRICK_ID });
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        // w1 (L0), w3 (L1) changed; w2 raked-skipped — levels do not scope the batch.
        expect(r.affectedElementIds.sort()).toEqual(['w1', 'w3']);
        expect(store.getById('w3')!.systemTypeId).toBe(BRICK_ID);
        expect(r.info?.[0]).toMatch(/Changed 2 of 3 walls/);
    });

    it('ALL-refused batch is a visible NO-OP with a message — never a thrown error', () => {
        // §FEAT-RAKE-LAYERED — both refusers carry an opening for the same reason as
        // `w2` above: a rake alone no longer refuses a layered type.
        const rakedOnly = makeWallStore([
            wall('r1', { rakeAngleDeg: 45, openings: [{ id: 'o1' }] }),
            wall('r2', { rakeAngleDeg: 60, openings: [{ id: 'o2' }] }),
        ]);
        const rakedCtx = makeCtx(rakedOnly);
        const beforeState = canon(rakedOnly.getAll());

        const cmd = new UpdateWallsSystemTypeBatchCommand({
            wallIds: ['r1', 'r2'],
            systemType: PARTITION_ID,
        });

        // canExecute is the declared refusal channel: CommandManager surfaces the
        // reason as info[0] and pushes NOTHING onto the undo stack.
        const v = cmd.canExecute(rakedCtx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/None of the 2 walls can take "Interior – Partition 100mm"/);
        expect(v.reason).toMatch(/raked/i);

        // Even a validation-skipping caller gets a report, not a crash:
        expect(() => {
            const r = cmd.execute(rakedCtx);
            expect(r.success).toBe(false);
            expect(r.info?.[0]).toMatch(/Changed 0 of 2 walls .* 2 skipped/);
        }).not.toThrow();
        expect(canon(rakedOnly.getAll())).toBe(beforeState); // truly a no-op
    });

    it('EMPTY selection declines visibly (no throw, actionable reason)', () => {
        const cmd = new UpdateWallsSystemTypeBatchCommand({ wallIds: [], systemType: PARTITION_ID });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/No walls selected/);
    });

    it("'all' on a wall-less project declines visibly too", () => {
        const emptyCtx = makeCtx(makeWallStore([]));
        const cmd = new UpdateWallsSystemTypeBatchCommand({ wallIds: 'all', systemType: PARTITION_ID });
        const v = cmd.canExecute(emptyCtx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/no walls in this project/i);
    });

    it('unknown type reference refuses with a human-readable reason', () => {
        const cmd = new UpdateWallsSystemTypeBatchCommand({ wallIds: ['w1'], systemType: 'Adamantium 999mm' });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toMatch(/Unknown wall type "Adamantium 999mm"/);
    });

    it('systemType null DETACHES: clears type + layers, preserves each wall thickness', () => {
        // Give w1 a type first.
        new UpdateWallsSystemTypeBatchCommand({ wallIds: ['w1'], systemType: PARTITION_ID }).execute(ctx);
        expect(store.getById('w1')!.systemTypeId).toBe(PARTITION_ID);
        const thicknessBefore = store.getById('w1')!.thickness;

        const detach = new UpdateWallsSystemTypeBatchCommand({ wallIds: ['w1'], systemType: null });
        expect(detach.canExecute(ctx).ok).toBe(true);
        expect(detach.execute(ctx).success).toBe(true);
        const w1 = store.getById('w1')!;
        expect(w1.systemTypeId).toBeNull();
        expect(w1.layers).toBeNull();
        expect(w1.thickness).toBe(thicknessBefore);      // monolithic body keeps its thickness
    });

    it('a raked wall CAN take a SINGLE-layer type (the ADR-0310 gate is about layered types only)', () => {
        const cmd = new UpdateWallsSystemTypeBatchCommand({
            wallIds: ['w2'],
            systemType: 'wt-monolithic',                 // 1 layer — authorable on a rake
        });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(store.getById('w2')!.systemTypeId).toBe('wt-monolithic');
    });

    it('duplicate ids in an explicit list are de-duplicated (one wall is never counted twice)', () => {
        const cmd = new UpdateWallsSystemTypeBatchCommand({
            wallIds: ['w1', 'w1', 'w3'],
            systemType: PARTITION_ID,
        });
        const r = cmd.execute(ctx);
        expect(r.info?.[0]).toMatch(/Changed 2 of 2 walls/);
    });
});
