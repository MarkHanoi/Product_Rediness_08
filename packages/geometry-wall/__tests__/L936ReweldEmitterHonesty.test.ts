/**
 * L-936 §L-936-EMITTER-HONESTY — the three sentences `§MOVE-REWELD-DISPATCH`
 * owed and did not say, pinned so they cannot be lost again.
 *
 * ─── WHY THIS FILE IS A REGRESSION PIN AND NOT A LOGGING PREFERENCE ──────────
 *
 * L-936 was opened on a reading of one console line:
 *
 *     §MOVE-REWELD-DISPATCH: moved wall X → 1 junction re-weld(s)
 *                            via joinedTo-graph [X]
 *
 * read as *"the joinedTo query returned only the mover"*. It did not.
 * `L936InteriorLPairMove.measure.test.ts` measured the same gesture end-to-end:
 * the graph named TWO partners, and the engine — correctly, for the rule in
 * force that day — planned a re-seat for the SUBJECT alone. The line printed
 * `entries`, which is the plan, and never printed the partners at all, so
 * **"a partner was found and deliberately left where it is" and "no partner was
 * found" rendered as the same eleven words.** Six reports in this family
 * (L-921, L-922, L-925, L-926, L-928, L-932) were triaged against that output.
 *
 * The two silences measured beside it are the same defect without the sentence:
 * an empty plan returned bare, and a plan-stage refusal handed to an
 * `onConsequence` sink that `engineLauncher.ts` does not compose.
 *
 * ⭐ THE SUBJECT OF THIS FILE IS HONESTY OF REPORTING, NOT THE FOLLOW ITSELF.
 * Every assertion below is about whether the emitted sentence matches the facts
 * the cascade actually carries. `partners considered`, `baselines re-seated` and
 * `junctions refused` are THREE INDEPENDENT FACTS and none of them may be
 * silent, whichever way the engine's geometric branch happens to go.
 *
 * ─── WHY THE FIXTURES MOVED ON 2026-08-17, AND THE HISTORY THAT MUST NOT BE
 *     RE-FLIPPED SILENTLY ────────────────────────────────────────────────────
 *
 * These assertions have flipped more than once, and the reason is always the
 * same discriminator being sharpened rather than anyone changing their mind:
 *
 *   original      the neighbour LENGTHENS to close the corner.
 *   2026-08-15    C83 §10.2.2 reversed it — *"a re-weld MUST NOT close a joint
 *                 by moving a non-subject wall's baseline"*, minted from L-922:
 *                 an interior move dragged a PERIMETER baseline 2.19 m and
 *                 re-seated three hosted doors, one clamped 0.541 → 0.000.
 *   2026-08-17    C83 §10.6 re-reversed it for a MUTUAL corner (founder: *"two
 *                 interior walls connected on L shape, one gets moved, the other
 *                 in this precise scenario should follow"*).
 *   2026-08-17    §10.6.3 keyed that follow on **junctionDegree === 2**, stored
 *                 or measured — not on the `'L'` letter.
 *
 * §10.2.2 was RIGHT about L-922's T/degree-3 and OVER-BROAD about degree-2,
 * because until the discriminator was threaded NOTHING COULD TELL THEM APART.
 * ⚠ Do not flip these arms again without adding a discriminator; flipping them
 * on a symptom is how this family cost six reports.
 *
 * WHAT THAT DID TO THIS FILE: the fixture's corner at (4,5) was a bare 2-wall
 * junction, so post-amendment it FOLLOWS, and the arms that pinned "subject
 * only" and "empty plan" had nothing left to report. The emitter's requirement
 * did not change — those two states still exist at every junction of degree ≥ 3
 * — so three arms keep their subject and take a **degree-3 T fixture** (outcome
 * (a): fixture re-scoped, assertion untouched), and one arm is **inverted**
 * (outcome (b)) to pin the state the amendment creates: a partner that FOLLOWED,
 * which the line must be able to say and must not label subject-only.
 *
 * ⚠ NEGATIVE CONTROL, and read this before deleting arm 1. Arm 1 is the only
 * arm the amendment can reach; arms 2-4 sit at degree 3, where the L-922 guard
 * refuses the follow exactly as it did before. If someone reverts
 * `isMutualCorner` to `return false`, arm 1 is what goes red.
 *
 * Fixture: the founder's own — two INTERIOR walls in an L, sharing the corner
 * (4,5), each terminating on a perimeter wall at its far end. `i-c` is added
 * ONLY where a degree-3 junction is the subject.
 *
 * @file packages/geometry-wall/__tests__/L936ReweldEmitterHonesty.test.ts
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

import { WallMoveReweldService } from '../src/WallMoveReweldService';
import type { ReweldWallStoreRef, ReweldJoinedWallsQuery } from '../src/WallMoveReweldService';
import type { MoveReweldEntry } from '../src/WallMoveReweld';
import type { WallData } from '../src/WallTypes';

const LEVEL = 'L0';
const THICK = 0.2;

type XZ = [number, number];

function wall(id: string, s: XZ, e: XZ): WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: s[0], y: 0, z: s[1] }, { x: e[0], y: 0, z: e[1] }],
        height: 3, thickness: THICK, baseOffset: 0, openings: [],
    } as unknown as WallData;
}

/** The three surfaces the service reads, plus a hand-fired 'update' carrying
 *  prevState — the §STEP7 shape `WallStore` emits in production. */
class StoreDouble implements ReweldWallStoreRef {
    private readonly byId = new Map<string, WallData>();
    private readonly subs: Array<(e: 'add' | 'update' | 'remove', w: WallData, p?: WallData) => void> = [];

    add(w: WallData): void { this.byId.set(w.id, w); }
    getById(id: string): WallData | undefined { return this.byId.get(id); }
    getByLevel(levelId: string): WallData[] {
        return [...this.byId.values()].filter(w => w.levelId === levelId);
    }
    subscribe(cb: (e: 'add' | 'update' | 'remove', w: WallData, p?: WallData) => void): () => void {
        this.subs.push(cb);
        return () => { const i = this.subs.indexOf(cb); if (i >= 0) this.subs.splice(i, 1); };
    }

    /** Rigid translation, committed then announced — what UpdateWallBaselineCommand does. */
    translate(id: string, dx: number, dz: number): void {
        const prev = this.byId.get(id)!;
        const next = {
            ...prev,
            baseLine: prev.baseLine.map(p => ({ x: p.x + dx, y: p.y, z: p.z + dz })),
        } as unknown as WallData;
        this.byId.set(id, next);
        for (const cb of this.subs) cb('update', next, prev);
    }
}

interface Harness {
    store: StoreDouble;
    service: WallMoveReweldService;
    logs: string[];
    warns: string[];
    /** The entries the service actually handed to the cascade factory — the
     *  FACTS the dispatch line claims to be summarising. Nothing applies them
     *  (the command double is inert), so the store keeps the post-move,
     *  pre-repair geometry, which is what the dangling-corner arm measures. */
    cascaded: MoveReweldEntry[];
    /** How many times the cascade was actually executed (0 or 1 here). */
    executed: number;
    restore(): void;
}

/**
 * Built WITHOUT `onConsequence` — deliberately mirroring the production
 * composition in `engineLauncher.ts`, which does not pass one.
 *
 * `tJunctionAtCorner` adds `i-c`, a wall running WEST out of the shared corner
 * (4,5), so three wall ends meet there and the junction is genuinely degree 3 —
 * the same re-scope applied to *"the engine REPORTS the refusal"* in
 * `command-registry/__tests__/wallMoveReweldSeam.test.ts`. That is a T: `i-a`
 * stems into a straight east-west run. It is also the L-922 shape, i.e. the
 * configuration whose follow is FORBIDDEN and must stay forbidden.
 *
 * ⚠ `i-c` is collinear with the mover, so the ENGINE skips it near-parallel —
 * one of the two documented silent skips in `WallMoveReweld.ts`'s header (an
 * absence, not an event). The arms below assert that the EMITTER still names it
 * among the partners, which is precisely how an engine-internal silence is kept
 * from becoming an emitter-level one.
 */
function makeHarness(opts?: { tJunctionAtCorner?: boolean }): Harness {
    const degree3 = opts?.tJunctionAtCorner === true;

    const store = new StoreDouble();
    store.add(wall('p-south', [0, 0], [10, 0]));
    store.add(wall('p-east', [10, 0], [10, 8]));
    store.add(wall('i-a', [4, 0], [4, 5]));    // vertical partition
    store.add(wall('i-b', [4, 5], [10, 5]));   // horizontal partition — THE MOVER
    if (degree3) store.add(wall('i-c', [4, 5], [0, 5])); // the third wall at the corner

    // Exactly what the flush writes for this fixture (measured in
    // `L936InteriorLPairMove.measure.test.ts` STAGE B, real solve, real writer),
    // plus `i-c` where the fixture carries it.
    const edges: Record<string, string[]> = {
        'i-a': ['p-south', 'i-b', ...(degree3 ? ['i-c'] : [])],
        'i-b': ['i-a', 'p-east', ...(degree3 ? ['i-c'] : [])],
        'i-c': ['i-a', 'i-b'],
        'p-south': ['p-west', 'p-east', 'i-a'],
        'p-east': ['p-south', 'p-north', 'i-b'],
    };
    const getJoinedWalls = (wallId: string): ReweldJoinedWallsQuery =>
        edges[wallId]
            ? { ok: true, wallId, joinedWallIds: edges[wallId]! }
            : { ok: false, wallId, reason: 'wall-unknown-to-joinedTo-writer' };
    // ⚠ NO `junctions` metadata is supplied, deliberately: this mirrors a graph
    // that predates the §10.6 widening, so `isMutualCorner` takes its MEASURED
    // arm (`measureJunctionDegree`) rather than a stored record. That is the
    // path a real level-scan / pre-widening flush lands on, and it is the arm
    // §10.6.3 #2 authorises — degree is *how many walls meet here*, counted,
    // never the mutual-vs-terminating category guessed from a shape.

    const logs: string[] = [];
    const warns: string[] = [];
    const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')); });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => { warns.push(a.map(String).join(' ')); });

    const h: Harness = {
        store, logs, warns, cascaded: [], executed: 0,
        service: undefined as unknown as WallMoveReweldService,
        restore() { h.service.dispose(); logSpy.mockRestore(); warnSpy.mockRestore(); },
    };

    h.service = new WallMoveReweldService(store, {
        commandManagerRef: {
            current: { getContext: () => ({}), execute: () => { h.executed++; return undefined; } },
        },
        makeCascadeCommand: ({ entries }) => {
            h.cascaded = entries;
            return { canExecute: () => ({ ok: true }) };
        },
        getJoinedWalls,
    });

    return h;
}

let h: Harness | undefined;
afterEach(() => { h?.restore(); h = undefined; });

const dispatchLine = (): string | undefined => h!.logs.find(l => l.includes('§MOVE-REWELD-DISPATCH'));
const entryFor = (id: string): MoveReweldEntry | undefined => h!.cascaded.find(e => e.wallId === id);

describe('L-936 §L-936-EMITTER-HONESTY — the dispatch line reports partners, re-seats and refusals as THREE facts', () => {
    it('a partner that FOLLOWED is named as a re-seat, and the subject-only label is WITHHELD (degree-2 mutual corner)', () => {
        // ── OUTCOME (b): INVERTED. ────────────────────────────────────────────
        // This arm used to be the subject-only one and asserted §10.2.2's
        // "the incumbent is byte-identical" on THIS fixture. C83 §10.6.3 keyed
        // the follow on junctionDegree === 2 and this corner has exactly two
        // participants (i-a's top end + the mover's west end — p-east's
        // endpoints are 5 m and 3 m away and are not welded here), so the
        // partner now FOLLOWS. The emitter requirement is unchanged and is what
        // is still being asserted: the line must distinguish "a partner
        // followed" from "the subject adapted alone". It could not, and that
        // misreading is L-936 itself.
        h = makeHarness();

        // The oblique drag. i-b: (4,5)→(10,5) translated by (-0.4, -0.6).
        h.store.translate('i-b', -0.4, -0.6);

        const line = dispatchLine();
        expect(line, 'the dispatch must still announce itself').toBeDefined();

        // ── FACT 1: what the graph handed the engine. Unchanged by the
        //    amendment, and the fact the old line omitted entirely.
        expect(line).toContain('2 partner(s) via joinedTo-graph');
        expect(line).toContain('i-a');
        expect(line).toContain('p-east');   // named even though never welded here

        // ── FACT 2: whose baseline the cascade actually writes. TWO now — the
        //    partner AND the subject — and the subject-only label must be gone.
        expect(line).toContain('2 baseline re-seat(s)');
        expect(line).toContain('[i-a, i-b]');
        expect(line).not.toContain('THE SUBJECT ONLY');

        // ── FACT 3 ────────────────────────────────────────────────────────────
        expect(line).toContain('0 junction(s) refused');

        // ── AND THE LINE'S COUNTS ARE THE CASCADE'S COUNTS ────────────────────
        // L-936's defect in one sentence: the printed number came from a
        // different array than the reader assumed. Cross-check it against what
        // was actually dispatched, so the sentence cannot drift from the facts.
        expect(h.executed).toBe(1);
        expect(h.cascaded.map(e => e.wallId)).toEqual(['i-a', 'i-b']);

        // ── THE GEOMETRY THOSE WORDS CLAIM, DERIVED — NOT READ OFF A RUN ──────
        // i-a's own infinite line:      x = 4            (through (4,0),(4,5))
        // the mover's NEW infinite line: z = 5 - 0.6 = 4.4  (through (3.6,4.4),(9.6,4.4))
        // analytic intersection:        (4, 4.4)
        // i-a therefore SHORTENS 5.0 → 4.4 m. θ = 90°, so the corner slides
        // m·(1/sin θ) = 0.6 m along i-a and m·cot θ = 0 m along the mover.
        const ia = entryFor('i-a')!;
        expect(ia.role).toBe('mutual-corner');
        expect(ia.newBaseLine[1].x).toBeCloseTo(4, 9);
        expect(ia.newBaseLine[1].z).toBeCloseTo(4.4, 9);

        // §10.6.2 condition 4 — A PIVOT, NEVER A TRANSLATION. The far endpoint
        // is BYTE-IDENTICAL (this is the L-922 guard: `baseLine[0]` is the datum
        // every hosted opening's offset is measured from), and the direction is
        // unchanged.
        expect(ia.newBaseLine[0]).toEqual({ x: 4, y: 0, z: 0 });
        expect(ia.prevBaseLine).toEqual([{ x: 4, y: 0, z: 0 }, { x: 4, y: 0, z: 5 }]);
        const dirBefore = Math.sign(ia.prevBaseLine[1].z - ia.prevBaseLine[0].z);
        const dirAfter = Math.sign(ia.newBaseLine[1].z - ia.newBaseLine[0].z);
        expect(dirAfter).toBe(dirBefore);
        expect(ia.newBaseLine[1].x - ia.newBaseLine[0].x).toBeCloseTo(0, 9); // still vertical

        // AND THE BUILDING STILL CLOSES — the founder's actual complaint was
        // *"neither the slab nor the walls connect"*, which is a statement about
        // COINCIDENCE, not about where either wall sat. The mover's west end and
        // i-a's top end must be the same point after the cascade.
        const ib = entryFor('i-b')!;
        expect(ib.newBaseLine[0].x).toBeCloseTo(ia.newBaseLine[1].x, 9);
        expect(ib.newBaseLine[0].z).toBeCloseTo(ia.newBaseLine[1].z, 9);
        expect(ib.newBaseLine[1].x).toBeCloseTo(9.6, 9); // the mover's own far end, untouched
        expect(ib.newBaseLine[1].z).toBeCloseTo(4.4, 9);
    });

    it('a SUBJECT-ONLY plan says so, and names the partners it declined to move (degree-3 T — no partner may follow)', () => {
        // ── OUTCOME (a): FIXTURE re-scoped, assertion untouched. ──────────────
        // The subject is the LABEL, and the state it labels still exists — at
        // every junction of degree ≥ 3, which is exactly the L-922 configuration
        // the guard exists for. `i-c` makes this corner genuinely degree 3, so
        // the engine takes the incumbent-preserving branch and only the SUBJECT
        // adapts, which is the shape the old line could not distinguish from
        // "the graph returned nothing but me".
        h = makeHarness({ tJunctionAtCorner: true });

        h.store.translate('i-b', -0.4, -0.6);

        const line = dispatchLine();
        expect(line, 'the dispatch must still announce itself').toBeDefined();

        // ── FACT 1: three partners considered, ALL NAMED — including `i-c`,
        //    which the engine skipped near-parallel without a word. An
        //    engine-internal silent skip must not become an emitter silence.
        expect(line).toContain('3 partner(s) via joinedTo-graph');
        expect(line).toContain('i-a');
        expect(line).toContain('p-east');
        expect(line).toContain('i-c');

        // ── FACT 2: the disambiguation the whole row turned on.
        //    The corner is i-a's line x = 4 ∩ the mover's new line z = 4.4, i.e.
        //    (4, 4.4) — which lies ON i-a's existing segment (4,0)→(4,5), so the
        //    subject can terminate there and i-a is not touched at all.
        expect(line).toContain('1 baseline re-seat(s)');
        expect(line).toContain('THE SUBJECT ONLY — no partner followed');

        // ── FACT 3 ────────────────────────────────────────────────────────────
        expect(line).toContain('0 junction(s) refused');

        // The cascade agrees with the sentence: one entry, and it is the mover.
        expect(h.cascaded.map(e => e.wallId)).toEqual(['i-b']);
        // §10.2.2 in the only form that matters here — the incumbents came out
        // untouched, so nothing at all was said about i-a or i-c.
        expect(entryFor('i-a')).toBeUndefined();
        expect(entryFor('i-c')).toBeUndefined();
        // The mover extended west onto the corner it can legally reach.
        expect(h.cascaded[0]!.newBaseLine[0].x).toBeCloseTo(4, 9);
        expect(h.cascaded[0]!.newBaseLine[0].z).toBeCloseTo(4.4, 9);
    });

    it('an EMPTY plan is no longer a bare return — the 600 mm dangling corner at a degree-3 T gets a sentence', () => {
        // ── OUTCOME (a): FIXTURE re-scoped, assertion untouched. ──────────────
        // Measured on the founder's own fixture: plans=[] consequences=[],
        // 600 mm dangling, and NOT ONE LINE printed. At degree 3 that state is
        // unchanged by §10.6, so the arm keeps its subject and gains `i-c`.
        h = makeHarness({ tJunctionAtCorner: true });

        // Perpendicular, into the partner: the mover's line drops z = 5 → 4.4.
        // The corner (4, 4.4) lands ON i-a's body, so the incumbent is preserved
        // — and the mover's own west end is ALREADY at (4, 4.4), so it has
        // nothing to adapt either. Nobody moves, and the joint stays open.
        h.store.translate('i-b', 0, -0.6);

        expect(dispatchLine(), 'no cascade was formed, so no dispatch may claim one').toBeUndefined();
        expect(h.executed).toBe(0);

        const warn = h.warns.find(w => w.includes('§MOVE-REWELD-EMPTY-PLAN'));
        expect(warn, 'an empty plan over NAMED partners must not be silent').toBeDefined();
        expect(warn).toContain('3 partner(s) considered via joinedTo-graph');
        expect(warn).toContain('i-a');
        expect(warn).toContain('i-c');
        expect(warn).toContain('0 re-weld entries and 0 refusals');

        // THE DANGLING CORNER IS REAL, MEASURED FROM THE STORE — the sentence
        // above is only owed because the building is left open. i-a's top end
        // stayed at (4,5); the mover's west end sits at (4,4.4).
        const iaTop = h.store.getById('i-a')!.baseLine[1]!;
        const ibWest = h.store.getById('i-b')!.baseLine[0]!;
        expect(Math.hypot(ibWest.x - iaTop.x, ibWest.z - iaTop.z)).toBeCloseTo(0.6, 9);
    });

    it('a plan-stage REFUSAL at a degree-3 T is audible with NO `onConsequence` sink — the production composition', () => {
        // ── OUTCOME (a): FIXTURE re-scoped, assertion untouched. ──────────────
        // §10.6 did NOT weaken the L-922 guard; it keyed it. At degree 3 an
        // incumbent still may not be lengthened, so this refusal is exactly the
        // one that existed before — and it must reach a human with no sink
        // wired, which is what `engineLauncher.ts` actually composes.
        h = makeHarness({ tJunctionAtCorner: true });

        // Perpendicular, AWAY from the partner: the mover's line rises to
        // z = 5.6, so the corner is i-a's line x = 4 ∩ z = 5.6 → (4, 5.6). That
        // falls 600 mm past i-a's end at (4,5); closing it would LENGTHEN an
        // incumbent, which C83 §10.2.2 forbids at any degree ≥ 3.
        h.store.translate('i-b', 0, +0.6);

        const warn = h.warns.find(w => w.includes('§MOVE-REWELD-REFUSED'));
        expect(warn, 'a refusal with no sink must still reach the console').toBeDefined();
        expect(warn).toContain('INCUMBENT_EXTENSION_REQUIRED');
        expect(warn).toContain('LEFT UNREPAIRED');
        expect(warn).toContain('i-a');

        // A refusal is not an entry: nothing may be dispatched off the back of
        // one, and no dispatch line may imply a repair happened.
        expect(h.executed).toBe(0);
        expect(dispatchLine()).toBeUndefined();
        // …and a refusal is not an EMPTY plan either. The two carry different
        // sentences precisely because they are different facts (L-936's thesis).
        expect(h.warns.find(w => w.includes('§MOVE-REWELD-EMPTY-PLAN'))).toBeUndefined();
    });
});
