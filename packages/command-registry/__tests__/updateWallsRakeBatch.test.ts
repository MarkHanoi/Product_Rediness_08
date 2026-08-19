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
            // ⚠ THIS FIXTURE HAS NOW BEEN REWRITTEN BY FOUR LANES, and the sequence is the
            // point: §FEAT-RAKE-LAYERED made `layers` alone buildable, §RAKE-HOSTED-OPENING
            // made `openings` alone buildable, §FEAT-RAKE-LAYERED-OPENINGS (L-1064) made
            // their intersection buildable, and §FEAT-RAKE-CURVED made `curve` buildable.
            // EVERY SHAPE-BASED REFUSER THIS FIXTURE EVER HELD IS NOW AUTHORABLE.
            //
            // What replaced them is NOT a shape but a NUMBER: a curved wall whose lean
            // would push its top arc through its own centre of curvature. `curvedTight` is
            // that wall — a 3 m-high wall on a hairpin whose turn radius is far under the
            // 8.24 m a 20° rake would shift it. It refuses only because this command
            // SUPPLIES `height` and `curveMinRadiusM`; a caller that omits them gets
            // "unjudgeable ⇒ proceed", which is why this test is also the proof that the
            // command supplies them.
            wall('curved', { curve: { control: p(2.5, 1), segments: 16 } }),
            wall('curvedTight', {
                baseLine: [p(0, 0), p(0.4, 0)],
                curve: { control: p(0.2, 1.6), segments: 16 },
                height: 3,
            }),
            wall('layered', { layers: [{}, {}], openings: [{ id: 'o1' }] }),
            wall('hosting', { openings: [{ id: 'o1' }] }),
            wall('layeredOk', { layers: [{}, {}, {}] }),
        ]);
        ctx = makeCtx(store);
    });

    it("'all' rakes every AUTHORABLE wall across ALL levels; refusers are skipped with the store's own reasons", () => {
        // 70° on a 3 m wall shifts the top by 3·cot(70°) ≈ 1.09 m — fine on the open
        // `curved` arc, impossible on `curvedTight`.
        const cmd = new UpdateWallsRakeBatchCommand({ wallIds: 'all', rakeAngleDeg: 70 });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(true);
        expect(v.warnings?.length).toBe(1);                   // curvedTight only
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        // FOUR founder features now arrive at the COMMAND layer: `layeredOk` (multi-layer),
        // `hosting` (carrying a window), `layered` (BOTH — L-1064) and `curved` (the
        // conical sweep). 8 walls in the fixture, ONE refused, so 7 raked. Every id is
        // listed rather than counted, so a wall silently dropping out is a failure and not
        // an off-by-one nobody reads.
        expect(r.affectedElementIds.sort())
            .toEqual(['curved', 'hosting', 'layered', 'layeredOk', 'w1', 'w2', 'w3']);
        expect(r.info?.[0]).toContain('Raked 7 of 8');
        expect(r.info?.[0]).toContain('1 skipped');
        for (const id of ['w1', 'w2', 'w3', 'hosting', 'layeredOk', 'layered', 'curved']) {
            expect(store.getById(id)?.rakeAngleDeg).toBe(70);
        }
        // The refused wall is UNTOUCHED and its skip carries the gate's reason — which is
        // now about NUMBERS, not about the wall's shape.
        expect(store.getById('curvedTight')?.rakeAngleDeg).toBeUndefined();
        const reasons = cmd.skipped.map(s => s.reason).join(' | ');
        expect(reasons).toContain('turn radius');
        expect(reasons).toContain('radially');
        // §RAKE-HOSTED-OPENING — and NOTHING is skipped for hosting an opening.
        //
        // ⚠ THIS ASSERTION USED TO READ `expect(reasons).not.toContain('HOSTS OPENINGS')`
        // AND IT BROKE ON THE MERGE, FOR AN INSTRUCTIVE REASON. §FEAT-RAKE-LAYERED
        // narrowed the layered refusal and its new sentence legitimately contains the
        // words "a LAYERED wall that HOSTS OPENINGS". So the substring matched the
        // SURVIVING refusal, not the deleted one, and the test failed while the code
        // was correct.
        //
        // A refusal message is prose: it is meant to change as the wording improves.
        // Keying an assertion to a phrase inside it couples the test to the copy-editing
        // rather than to the behaviour — the same defect class as a gate that classifies
        // by NAME (roadmap §7B.5) and as the constant-ternary bug that compared against a
        // value its own enum could not produce. Assert on IDENTITY instead: the question
        // is whether the wall that merely HOSTS an opening was skipped, and that is a fact
        // about ids, not about sentences.
        // ⚠ The field is `wallId`, not `id` — `WallRakeBatchSkip` is
        // `{ wallId, reason }` (UpdateWallsRakeBatchCommand.ts:80,127). Reading `.id`
        // yielded `[undefined, undefined]`, which `.not.toContain('hosting')` passed
        // VACUOUSLY: an array of undefineds contains no 'hosting'. The negative
        // assertion was green for the wrong reason and only the positive one failed.
        // That is the §NEGATIVE-ASSERTION-PASSES-VACUOUSLY shape — a `not.toContain`
        // over a mis-spelled field can never fail, so pair it with a positive
        // assertion on the SAME expression, which is what caught this.
        expect(cmd.skipped.map(s => s.wallId)).not.toContain('hosting');
        expect(cmd.skipped.map(s => s.wallId).sort()).toEqual(['curvedTight']);
        // The refusal must carry BOTH numbers, per the founder's standing direction —
        // never a bare "invalid".
        expect(cmd.skipped[0]!.reason).toMatch(/radially/);
        expect(cmd.skipped[0]!.reason).toMatch(/turn radius/);
    });

    it('90° (vertical) is a legal target on EVERY wall shape — nothing skips', () => {
        const cmd = new UpdateWallsRakeBatchCommand({ wallIds: 'all', rakeAngleDeg: 90 });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);
        expect(r.success).toBe(true);
        expect(r.affectedElementIds.length).toBe(8);
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
        // Scoped to the ONE wall that still refuses. `curved` and `layered` were the
        // refusers here until §FEAT-RAKE-CURVED and L-1064; both are now authorable, so
        // using them would have made this assertion pass for the wrong reason.
        const cmd = new UpdateWallsRakeBatchCommand({ wallIds: ['curvedTight'], rakeAngleDeg: 70 });
        const v = cmd.canExecute(ctx);
        expect(v.ok).toBe(false);
        // The message is generated with the real count, so the substring is asserted
        // exactly as it reads rather than as it was assumed to read.
        expect(v.reason).toContain('None of the 1 wall');
        expect(v.reason).toContain('turn radius');
    });

    it('§FEAT-RAKE-CURVED — an OPEN curve is raked, not skipped: the arm is a number, not a shape', () => {
        // Non-vacuity for the skip above. Same command, same angle, a curve that fits.
        const cmd = new UpdateWallsRakeBatchCommand({ wallIds: ['curved'], rakeAngleDeg: 70 });
        expect(cmd.canExecute(ctx).ok).toBe(true);
        expect(cmd.execute(ctx).success).toBe(true);
        expect(store.getById('curved')?.rakeAngleDeg).toBe(70);
        expect(cmd.skipped.length).toBe(0);
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
