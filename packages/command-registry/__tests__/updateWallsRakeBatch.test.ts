// §FEAT-WALL-RAKE-BATCH (ADR-0315) — batch wall rake semantics.
//
// Pins the contract points that make this batch HONEST:
//   1. AUTHORABILITY IS THE STORE'S OWN GATE: curved / layered / opening-
//      hosting walls are SKIPPED with rakeAuthorability's reason — the exact
//      walls WallStore.update would silently refuse if we fanned out through
//      the generic parameter command (the §CONTEXT-DATA-HONESTY defect this
//      command exists to prevent).
//   2. PARTIAL FAILURE: "Raked N of M — K skipped" with grouped reasons;
//      ALL-refused / empty scope / out-of-range = visible no-op via
//      canExecute, never a throw.
//   3. SINGLE UNDO: one batch = one Command; undo() restores EVERY touched
//      wall's prior rakeAngleDeg — including `undefined` for never-raked walls.
//   4. 'all' spans ALL LEVELS; explicit ids are de-duped; vanished ids skip.
//   5. VALUE CONTRACT: range judged by geometry-wall's isRakeInRange (15–165),
//      never re-typed here; 90 (vertical) is a legal target on ANY wall shape.

import { describe, it, expect, beforeEach } from 'vitest';
import { UpdateWallsRakeBatchCommand } from '../src/walls/UpdateWallsRakeBatchCommand';
import type { CommandContext } from '../src/types';

type Pt = { x: number; y: number; z: number };
interface W {
    id: string;
    levelId: string;
    baseLine: [Pt, Pt];
    thickness: number;
    rakeAngleDeg?: number;
    curve?: unknown;
    layers?: unknown[];
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

// UpdateElementParameterCommand (the reused child) writes via store.update(id,
// partial) and reads via getById — mirror WallStore's partial-merge contract.
function makeWallStore(seed: W[]) {
    const map = new Map<string, W>(seed.map(w => [w.id, structuredClone(w)]));
    return {
        map,
        getById(id: string) { return map.get(id); },
        getAll() { return [...map.values()]; },
        update(id: string, partial: Partial<W>) {
            const cur = map.get(id);
            if (cur) map.set(id, { ...cur, ...structuredClone(partial) });
        },
    };
}

function makeCtx(store: ReturnType<typeof makeWallStore>): CommandContext {
    return { stores: { wallStore: store } } as unknown as CommandContext;
}

describe('UpdateWallsRakeBatchCommand — honest batch rake', () => {
    let store: ReturnType<typeof makeWallStore>;
    let ctx: CommandContext;

    beforeEach(() => {
        store = makeWallStore([
            wall('w1'),
            wall('w2', { rakeAngleDeg: 75 }),
            wall('w3', { levelId: 'L1' }),                    // other level — 'all' must reach it
            wall('curved', { curve: { r: 3 } }),              // refused: curved
            // ⚠ TWO LANES REWROTE THIS FIXTURE. §FEAT-RAKE-LAYERED made `layers` alone
            // buildable (plan bands at t / sin θ); §RAKE-HOSTED-OPENING made `openings`
            // alone buildable (the carve rides the wall's own shear). Each lane deleted
            // the other's refuser as stale. Merged, the batch carries BOTH new capabilities
            // and keeps exactly ONE geometry refuser — their intersection.
            wall('layered', { layers: [{}, {}], openings: [{ id: 'o1' }] }), // refused: the ∩
            // …and the two NEW capabilities, measured in the same batch so the command is
            // proven to RAKE them rather than silently skip them.
            wall('hosting', { openings: [{ id: 'o1' }] }),
            wall('layeredOk', { layers: [{}, {}, {}] }),
        ]);
        ctx = makeCtx(store);
    });

    it("'all' rakes every AUTHORABLE wall across ALL levels; refusers are skipped with the store's own reasons", () => {
        const cmd = new UpdateWallsRakeBatchCommand({ wallIds: 'all', rakeAngleDeg: 70 });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(true);
        expect(v.warnings?.length).toBe(2);                   // curved + layered×openings
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        // Both founder features arrive at the COMMAND layer here: `layeredOk` (a
        // multi-layer wall) and `hosting` (a wall carrying a window) each now take a
        // rake. 7 walls in the fixture, 2 refused, so 5 raked.
        expect(r.affectedElementIds.sort()).toEqual(['hosting', 'layeredOk', 'w1', 'w2', 'w3']);
        expect(r.info?.[0]).toContain('Raked 5 of 7');
        expect(r.info?.[0]).toContain('2 skipped');
        for (const id of ['w1', 'w2', 'w3', 'hosting', 'layeredOk']) {
            expect(store.getById(id)?.rakeAngleDeg).toBe(70);
        }
        // The refused walls are UNTOUCHED and each skip carries the gate's reason.
        expect(store.getById('curved')?.rakeAngleDeg).toBeUndefined();
        const reasons = cmd.skipped.map(s => s.reason).join(' | ');
        expect(reasons).toContain('CURVED');
        expect(reasons).toContain('LAYERED');
        // §RAKE-HOSTED-OPENING — and NOTHING is skipped for hosting an opening.
        expect(reasons).not.toContain('HOSTS OPENINGS');
    });

    it('90° (vertical) is a legal target on EVERY wall shape — nothing skips', () => {
        const cmd = new UpdateWallsRakeBatchCommand({ wallIds: 'all', rakeAngleDeg: 90 });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds.length).toBe(7);
        expect(cmd.skipped.length).toBe(0);
        expect(r.info?.[0]).toContain('(vertical)');
    });

    it('one undo entry restores EVERY touched wall — including never-raked (undefined) priors', () => {
        const cmd = new UpdateWallsRakeBatchCommand({ wallIds: ['w1', 'w2'], rakeAngleDeg: 120 });
        cmd.execute(ctx);
        expect(store.getById('w1')?.rakeAngleDeg).toBe(120);
        const u = cmd.undo(ctx);
        expect(u.success).toBe(true);
        expect(store.getById('w1')?.rakeAngleDeg).toBeUndefined();  // was never raked
        expect(store.getById('w2')?.rakeAngleDeg).toBe(75);         // prior angle restored
    });

    it('out-of-range angles decline VISIBLY with the real bounds, never throw', () => {
        for (const deg of [5, 170, Number.NaN]) {
            const v = new UpdateWallsRakeBatchCommand({ wallIds: 'all', rakeAngleDeg: deg })
                .canExecute(ctx);
            expect(v.ok).toBe(false);
        }
        const v = new UpdateWallsRakeBatchCommand({ wallIds: 'all', rakeAngleDeg: 170 }).canExecute(ctx);
        expect(v.reason).toContain('15');
        expect(v.reason).toContain('165');
    });

    it('ALL-refused scope is a visible no-op via canExecute with the first refusal shown', () => {
        const cmd = new UpdateWallsRakeBatchCommand({ wallIds: ['curved', 'layered'], rakeAngleDeg: 70 });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        expect(v.reason).toContain('None of the 2 walls');
    });

    it('vanished ids skip with a reason; duplicates are de-duped; empty scope declines', () => {
        const cmd = new UpdateWallsRakeBatchCommand({ wallIds: ['w1', 'w1', 'ghost'], rakeAngleDeg: 70 });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(true);
        expect(v.warnings?.some(w => w.includes('ghost'))).toBe(true);
        const r = cmd.execute(ctx);
        expect(r.affectedElementIds).toEqual(['w1']);
        expect(r.info?.[0]).toContain('Raked 1 of 2');
        expect(new UpdateWallsRakeBatchCommand({ wallIds: [], rakeAngleDeg: 70 }).canExecute(ctx).ok).toBe(false);
        const empty = makeCtx(makeWallStore([]));
        expect(new UpdateWallsRakeBatchCommand({ wallIds: 'all', rakeAngleDeg: 70 }).canExecute(empty).ok).toBe(false);
    });
});
