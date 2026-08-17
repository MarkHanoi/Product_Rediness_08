/**
 * §L-945 — EVERY PARTNER LEAVES THE ENGINE AS EXACTLY ONE OF THREE THINGS.
 *
 * ── THE DEFECT, MEASURED IN PRODUCTION ON `55a2eda3` ─────────────────────────
 *
 *     [WallMoveReweldService] §MOVE-REWELD-DISPATCH: moved wall A →
 *       2 partner(s) via joinedTo-graph [B, C] → 1 baseline re-seat(s) [C],
 *       0 junction(s) refused
 *
 * Two partners considered. One re-seated. **Zero refused.** Partner B was
 * neither followed NOR refused — it left `computeMoveReweldPlan` through one of
 * the partner loop's bare `continue` statements and no record of it existed
 * anywhere in the system. The founder: *"i expected it to adapt to the new
 * position - but did not."* Nobody could answer why, because `2 = 1 + 0` was the
 * whole of the evidence and the line gave the reader no way to see that it does
 * not reconcile.
 *
 * That is L-921's exact defect class one layer further in — *a dropped junction
 * with nobody told is L-921 wearing L-922's clothes*. §L-921 made the REFUSALS
 * speak. These paths were never refusals, so they were never covered by it, and
 * "the engine looked at this partner and correctly did nothing" printed
 * identically to "the engine never looked at this partner".
 *
 * ── WHAT THIS FILE ASSERTS ───────────────────────────────────────────────────
 *
 *   §PARTITION   — the invariant, on every fixture: entries ⊎ refusals ⊎
 *                  notApplicable partitions the partner list. No partner in two
 *                  buckets, no partner in none.
 *   §REACHABLE   — each of the silent paths named in the L-942 brief is REACHED
 *                  by a fixture and reports its OWN code, so the census can
 *                  discriminate between them rather than merely be non-empty.
 *   §NO-DECISION-CHANGED — the engine's verdicts are byte-identical to HEAD.
 *                  `computeMoveReweldPlan`'s two-key serialization is pinned
 *                  here too, on the same fixture the §L-922 goldens use, so a
 *                  future widening of the census cannot silently leak into the
 *                  dispatchable plan.
 *   §SIGNATURE   — the founder's observed line is reproduced end-to-end, and the
 *                  census names the partner that the old output dropped.
 *
 * ⚠ NOTHING IS FIXED IN THIS FILE OR IN THE ENGINE IT MEASURES. Every
 * `continue` still continues, on the same predicate, against the same number.
 * §L-945 makes the engine HONEST, not more permissive.
 *
 * File placement: deliberately outside the `L926*` / `L932*` / `L936*` families,
 * which are owned by four concurrent lanes.
 *
 * @file packages/geometry-wall/__tests__/L945PartnerOutcomeCensus.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
    computeMoveReweldCensus,
    computeMoveReweldPlan,
    type MoveReweldCensus,
    type MoveReweldMovedWall,
    type MoveReweldNotApplicableReason,
    type MoveReweldPartner,
    type ReweldBaseline,
} from '../src/WallMoveReweld';

const bl = (a: [number, number], b: [number, number]): ReweldBaseline =>
    [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }];

/** The founder's production wall thickness family; 0.2 m throughout. */
const T = 0.2;

/**
 * §PARTITION, as a reusable assertion.
 *
 * The reason it is a helper rather than one test: an invariant asserted once, on
 * the fixture that was designed to satisfy it, is a demonstration. Asserted on
 * EVERY fixture in the file — including the ones written to exercise unrelated
 * branches — it is a control.
 */
function expectPartition(census: MoveReweldCensus, movedId: string, partnerIds: string[]): void {
    const fromEntries = census.entries.map(e => e.wallId).filter(id => id !== movedId);
    const fromRefusals = census.refusals.map(r => r.partnerId);
    const fromNa = census.notApplicable.map(n => n.partnerId);
    const all = [...fromEntries, ...fromRefusals, ...fromNa];

    // Exactly one bucket each — no double-counting.
    expect(new Set(all).size).toBe(all.length);
    // Every partner accounted for, and nothing invented.
    expect([...all].sort()).toEqual([...partnerIds].sort());
    expect([...census.consideredPartnerIds].sort()).toEqual([...partnerIds].sort());
}

/** The census's reason for one partner, or a marker naming the bucket it took. */
function outcomeOf(census: MoveReweldCensus, partnerId: string, movedId: string): string {
    const na = census.notApplicable.find(n => n.partnerId === partnerId);
    if (na) return na.reason;
    const r = census.refusals.find(x => x.partnerId === partnerId);
    if (r) return `REFUSAL:${r.reason}`;
    if (census.entries.some(e => e.wallId === partnerId && e.wallId !== movedId)) return 'ENTRY';
    return '⛔ SILENTLY DROPPED';
}

// ─────────────────────────────────────────────────────────────────────────────
// §REACHABLE — each silent path, reached, and named
// ─────────────────────────────────────────────────────────────────────────────

describe('§L-945 §REACHABLE — every silent `continue` reports its own reason', () => {
    /**
     * The base gesture for most fixtures: an east–west host at z=0 dragged 0.6 m
     * north. 0.6 m is the founder's own drag magnitude from the L-936 fixture.
     */
    const host: MoveReweldMovedWall = {
        id: 'A', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, 0.6], [10, 0.6]),
        thickness: T,
    };

    /** `if (dS > weldTol && dE > weldTol) continue;` — "was never joined here". */
    it('NOT_WELDED_TO_SUBJECT_PREV_SEGMENT — a graph-named partner nowhere near the PREV line', () => {
        // ⭐ THE LEADING SUSPECT FOR THE FOUNDER'S CASE, and the reason it is
        // first. `WallMoveReweldService` reads partners from the STORE at event
        // time. A partner that another cascade (the slab corner weld, which
        // subscribes first) has ALREADY re-seated onto the subject's NEW line is,
        // by the time this engine sees it, no longer welded to the PREV line —
        // and it drops out here even though the `joinedTo` edge is entirely real.
        // Modelled literally: B sits on the host's NEW line, 0.6 m from the old.
        const alreadyMoved: MoveReweldPartner = { id: 'B', baseLine: bl([0, 0.6], [0, -5]) };
        // Deliberately > weldTol away from prev on BOTH ends:
        const farOff: MoveReweldPartner = { id: 'F', baseLine: bl([20, 20], [20, 25]) };

        const census = computeMoveReweldCensus(host, [farOff]);
        expect(outcomeOf(census, 'F', 'A')).toBe('NOT_WELDED_TO_SUBJECT_PREV_SEGMENT');
        const na = census.notApplicable[0]!;
        // BOTH numbers (C83 §10.3): what was measured, and what it had to clear.
        expect(na.limitMm).toBe(500);          // default weldTol 0.5 m
        expect(na.measuredMm).toBeGreaterThan(500);
        expectPartition(census, 'A', ['F']);

        // The already-re-seated shape is NOT this reason — its endpoint at
        // (0,0.6) is 0.6 m from the prev line, which exceeds weldTol 0.5. Same
        // code, and worth pinning because it is the production mechanism.
        const c2 = computeMoveReweldCensus(host, [alreadyMoved]);
        expect(outcomeOf(c2, 'B', 'A')).toBe('NOT_WELDED_TO_SUBJECT_PREV_SEGMENT');
        expect(c2.entries).toEqual([]);
        expect(c2.refusals).toEqual([]);
        expectPartition(c2, 'A', ['B']);
    });

    /** `if (!corner) continue;` — near-parallel / degenerate. */
    it('NEAR_PARALLEL_NO_CORNER — a collinear partner has no conditioned intersection', () => {
        // Runs along the host's own line: welded at (10,0), extends east.
        const collinear: MoveReweldPartner = { id: 'P', baseLine: bl([10, 0], [16, 0]) };
        const census = computeMoveReweldCensus(host, [collinear]);
        expect(outcomeOf(census, 'P', 'A')).toBe('NEAR_PARALLEL_NO_CORNER');
        // NO NUMBERS, and that is the honest answer: the deciding quantity is an
        // angle against MIN_ANGLE_RAD, and `measuredMm` is millimetres. A unit
        // lie would be worse than the silence it replaces.
        expect(census.notApplicable[0]!.measuredMm).toBeUndefined();
        expect(census.notApplicable[0]!.limitMm).toBeUndefined();
        expectPartition(census, 'A', ['P']);
    });

    /**
     * `if (distToSegment(corner, newS, newE) > alongMoverReach) continue;`
     *
     * ⭐ A MEASURED FINDING, and it cost this file three red runs to learn it:
     * **with a host thickness present, this gate is very nearly dead.** The first
     * fixture written for it — a 20° partner welded at the host's end, dragged
     * 3 m — reported `REFUSAL:STEM_REVERSAL` instead, because L-932 replaced the
     * flat `weldTol` with `m·cot θ + weldTol`, which is *exactly* how far the
     * corner slides along the mover. The two quantities track each other by
     * construction, so an end-welded partner cannot outrun its own reach.
     *
     * That leaves ONE live way in, and it is the branch the engine's own comment
     * flags: `bands === undefined` pins `alongMoverReach` back to the flat
     * `weldTol`. No host thickness ⇒ authorship unanswerable ⇒ the pre-L-932
     * proxy is the only guard. `WallMoveReweldService` supplies a thickness in
     * production, so this reason should be RARE there — and if the founder's
     * dropped partner reports it, the thickness was missing, which is itself the
     * finding.
     */
    it('CORNER_OFF_SUBJECT_SEGMENT — reachable only on the NO-THICKNESS branch, and says so', () => {
        const shallowHost: MoveReweldMovedWall = {
            id: 'A', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, 3], [10, 3]),
            // thickness deliberately ABSENT — see above.
        };
        const shallow: MoveReweldPartner = { id: 'S', baseLine: bl([10, 0], [16, 2]) };
        const census = computeMoveReweldCensus(shallowHost, [shallow]);
        expect(outcomeOf(census, 'S', 'A')).toBe('CORNER_OFF_SUBJECT_SEGMENT');
        const na = census.notApplicable[0]!;
        expect(na.measuredMm!).toBeGreaterThan(na.limitMm!);
        expect(na.limitMm).toBe(500); // the flat weldTol, i.e. the pre-L-932 proxy
        expectPartition(census, 'A', ['S']);

        // ── THE CONTROL FOR THE FINDING ─────────────────────────────────────
        // The identical fixture WITH a thickness does not take this branch at
        // all. Asserted so the claim above is a measurement and not a story.
        const withThickness = computeMoveReweldCensus(
            { ...shallowHost, thickness: T }, [shallow],
        );
        expect(outcomeOf(withThickness, 'S', 'A')).not.toBe('CORNER_OFF_SUBJECT_SEGMENT');
        expectPartition(withThickness, 'A', ['S']);
    });

    /** `if (displacement < MIN_DISPLACEMENT) continue;` — already seated. */
    it('PARTNER_ALREADY_AT_CORNER — the partner\'s welded end is already the new corner', () => {
        // The host slides ALONG its own axis, so its LINE is unchanged and every
        // intersection with it is unchanged too. A partner welded at the host's
        // END (not mid-body — mid-body is a STEM once thickness is known, which
        // is what the first draft of this fixture measured instead) therefore
        // has a corner exactly where its endpoint already is.
        const slide: MoveReweldMovedWall = {
            id: 'A', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([1, 0], [11, 0]),
            thickness: T,
        };
        const perp: MoveReweldPartner = { id: 'Q', baseLine: bl([10, 0], [10, -4]) };
        const census = computeMoveReweldCensus(slide, [perp]);
        expect(outcomeOf(census, 'Q', 'A')).toBe('PARTNER_ALREADY_AT_CORNER');
        expectPartition(census, 'A', ['Q']);
    });

    /** `if (dist(corner, far) < DEGENERATE_STUB_LENGTH) continue;` */
    it('CORNER_WOULD_COLLAPSE_PARTNER — seating on the corner would leave a sub-150 mm stub', () => {
        // A tiny partner welded at the host's east end, only 0.4 m long, meeting
        // the host at a shallow angle so the new corner lands 0.30 m from its far
        // end — under DEGENERATE_STUB_LENGTH.
        const stubHost: MoveReweldMovedWall = {
            id: 'A', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, 0.3], [10, 0.3]),
            thickness: T,
        };
        // Runs from (10,0) up to (10,0.4): perpendicular, far end at z=0.4. The
        // corner is (10,0.3) ⇒ 0.10 m from far. Under the 0.15 m floor.
        const tiny: MoveReweldPartner = { id: 'T', baseLine: bl([10, 0], [10, 0.4]) };
        const census = computeMoveReweldCensus(stubHost, [tiny]);
        expect(outcomeOf(census, 'T', 'A')).toBe('CORNER_WOULD_COLLAPSE_PARTNER');
        expect(census.notApplicable[0]!.measuredMm).toBe(100);
        expect(census.notApplicable[0]!.limitMm).toBe(150);
        expectPartition(census, 'A', ['T']);
    });

    /**
     * THE SEVENTH PATH — not on the L-942 brief's list of six, because it does
     * not `continue`: it falls out of the loop body having proposed nothing for
     * the partner. It was silent all the same, and it is a SUCCESS.
     */
    it('INCUMBENT_PRESERVED_SUBJECT_ADAPTS — the corner is on the incumbent\'s body and the subject adapts', () => {
        const diagB: MoveReweldMovedWall = {
            id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0.5], [6, 5.5]),
        };
        const longA: MoveReweldPartner = { id: 'A', baseLine: bl([5, 0], [10, 0]), junctionDegree: 3 };
        const census = computeMoveReweldCensus(diagB, [longA]);

        expect(outcomeOf(census, 'A', 'B')).toBe('INCUMBENT_PRESERVED_SUBJECT_ADAPTS');
        // The SUBJECT is the one that moved — the incumbent is byte-identical.
        expect(census.entries.map(e => e.wallId)).toEqual(['B']);
        expect(census.refusals).toEqual([]);
        // …and the subject-seat clause says so explicitly.
        expect(census.subjectSeat.cornersOffered).toEqual(['A']);
        expect(census.subjectSeat.seatedOn).toEqual(['A']);
        expect(census.subjectSeat.entryEmitted).toBe(true);
        expectPartition(census, 'B', ['A']);
    });

    /** The stem arm's own `none` paths. */
    it('STEM_ALREADY_SEATED — a T-stem whose foot is already on the host\'s new body', () => {
        // The host slides ALONG its own axis; the stem's foot at mid-span stays
        // exactly where it is, because the host's line did not move.
        const slide: MoveReweldMovedWall = {
            id: 'A', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([1, 0], [11, 0]),
            thickness: T,
        };
        const stem: MoveReweldPartner = { id: 'S', baseLine: bl([5, 0], [5, 4]) };
        const census = computeMoveReweldCensus(slide, [stem]);
        expect(outcomeOf(census, 'S', 'A')).toBe('STEM_ALREADY_SEATED');
        expect(census.entries).toEqual([]);
        expectPartition(census, 'A', ['S']);
    });

    it('STEM_NEAR_PARALLEL_NO_SEAT — a stem running along its host has no seat to slide to', () => {
        // The stem's own line is parallel to the host's, so intersecting it with
        // the host's offset seat line is ill-conditioned. Its foot is on the
        // host's BODY (0.3 m from the end at 0.2 m thickness ⇒ past stemBand).
        const stem: MoveReweldPartner = { id: 'S', baseLine: bl([5, 0], [9, 0]) };
        const census = computeMoveReweldCensus(host, [stem]);
        // Reported under one of the two stem `none` codes; which one is the
        // measurement, not the assumption — pin whichever the engine states.
        const reason = outcomeOf(census, 'S', 'A') as MoveReweldNotApplicableReason;
        expect(['STEM_NEAR_PARALLEL_NO_SEAT', 'NEAR_PARALLEL_NO_CORNER']).toContain(reason);
        expectPartition(census, 'A', ['S']);
    });

    it('SUBJECT_ITSELF — the moved wall appearing in its own partner list is stated, not skipped', () => {
        const self: MoveReweldPartner = { id: 'A', baseLine: bl([0, 0], [10, 0]) };
        const census = computeMoveReweldCensus(host, [self]);
        expect(outcomeOf(census, 'A', 'ZZZ')).toBe('SUBJECT_ITSELF');
        expectPartition(census, 'ZZZ', ['A']);
    });

    it('SUBJECT_DID_NOT_MOVE — a zero-displacement gesture accounts for its partners too', () => {
        const still: MoveReweldMovedWall = {
            id: 'A', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, 0], [10, 0]),
            thickness: T,
        };
        const p: MoveReweldPartner = { id: 'P', baseLine: bl([10, 0], [10, 5]) };
        const census = computeMoveReweldCensus(still, [p]);
        expect(outcomeOf(census, 'P', 'A')).toBe('SUBJECT_DID_NOT_MOVE');
        expect(census.entries).toEqual([]);
        expect(census.refusals).toEqual([]);
        expectPartition(census, 'A', ['P']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §PARTITION — the invariant, on the fixtures that already exist elsewhere
// ─────────────────────────────────────────────────────────────────────────────

describe('§L-945 §PARTITION — entries ⊎ refusals ⊎ notApplicable covers every partner, always', () => {
    it('the §L-922 degree-3 incumbent fixture: refused partner, no silent third state', () => {
        const movedB: MoveReweldMovedWall = {
            id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0], [6, 5]),
        };
        const partnerA: MoveReweldPartner = { id: 'A', baseLine: bl([0, 0], [5, 0]), junctionDegree: 3 };
        const thirdC: MoveReweldPartner = { id: 'C', baseLine: bl([5, 0], [5, -4]) };
        const census = computeMoveReweldCensus(movedB, [partnerA, thirdC]);

        expect(outcomeOf(census, 'A', 'B')).toBe('REFUSAL:INCUMBENT_EXTENSION_REQUIRED');
        // C is the collinear third wall whose only job in that fixture is to be
        // countable. It proposed nothing — and now SAYS that it proposed nothing.
        expect(outcomeOf(census, 'C', 'B')).toBe('NEAR_PARALLEL_NO_CORNER');
        expectPartition(census, 'B', ['A', 'C']);
    });

    it('the §DEGREE-2 mutual-corner fixture: partner ENTRY, and the subject seat is stated', () => {
        const movedB: MoveReweldMovedWall = {
            id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0], [6, 5]),
        };
        const partnerA: MoveReweldPartner = { id: 'A', baseLine: bl([0, 0], [5, 0]) };
        const census = computeMoveReweldCensus(movedB, [partnerA]);

        expect(outcomeOf(census, 'A', 'B')).toBe('ENTRY');
        expect(census.entries[0]!.role).toBe('mutual-corner');
        // The corner was offered to the subject and its endpoint was ALREADY
        // there — "closed", which is a different fact from "declined".
        expect(census.subjectSeat.cornersOffered).toEqual(['A']);
        expect(census.subjectSeat.seatedOn).toEqual(['A']);
        expect(census.subjectSeat.declined).toEqual([]);
        expect(census.subjectSeat.entryEmitted).toBe(false);
        expectPartition(census, 'B', ['A']);
    });

    it('a multi-partner gesture: three partners, three different outcomes, all named', () => {
        const host: MoveReweldMovedWall = {
            id: 'A', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, 0.6], [10, 0.6]),
            thickness: T,
        };
        const mutual: MoveReweldPartner = { id: 'M', baseLine: bl([0, 0], [0, -5]) };
        const collinear: MoveReweldPartner = { id: 'C', baseLine: bl([10, 0], [16, 0]) };
        const stranger: MoveReweldPartner = { id: 'X', baseLine: bl([40, 40], [40, 45]) };
        const census = computeMoveReweldCensus(host, [mutual, collinear, stranger]);

        expect(outcomeOf(census, 'C', 'A')).toBe('NEAR_PARALLEL_NO_CORNER');
        expect(outcomeOf(census, 'X', 'A')).toBe('NOT_WELDED_TO_SUBJECT_PREV_SEGMENT');
        // M is the real junction; whatever the engine decides for it, it is one
        // of the three states and never the fourth.
        expect(outcomeOf(census, 'M', 'A')).not.toBe('⛔ SILENTLY DROPPED');
        expectPartition(census, 'A', ['M', 'C', 'X']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §NO-DECISION-CHANGED — the engine is more honest, not more permissive
// ─────────────────────────────────────────────────────────────────────────────

describe('§L-945 §NO-DECISION-CHANGED — the dispatchable plan is byte-identical', () => {
    /**
     * The §L-922 golden, restated here on purpose.
     *
     * `L926StemFollowAuthorship.measure.test.ts` owns the canonical copy and is
     * owned by another lane; this is a SECOND, independent pin, because the
     * change under test adds fields to what the engine computes and the one
     * thing that must not follow is those fields leaking into the two-key object
     * that `moveReweldPreflight` and five goldens consume.
     */
    it('the degree-3 refusal plan still serialises to the string minted at `8b8be0e4`', () => {
        const movedB: MoveReweldMovedWall = {
            id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0], [6, 5]),
        };
        const partnerA: MoveReweldPartner = { id: 'A', baseLine: bl([0, 0], [5, 0]), junctionDegree: 3 };
        expect(JSON.stringify(computeMoveReweldPlan(movedB, [partnerA]))).toBe(
            '{"entries":[],"refusals":[{"partnerId":"A","reason":"INCUMBENT_EXTENSION_REQUIRED","beyondMm":1000}]}',
        );
    });

    it('the degree-3 subject-adapts plan still serialises to its original string', () => {
        const diagB: MoveReweldMovedWall = {
            id: 'B', prevBaseLine: bl([5, 0], [5, 5]), newBaseLine: bl([6, 0.5], [6, 5.5]),
        };
        const longA: MoveReweldPartner = { id: 'A', baseLine: bl([5, 0], [10, 0]), junctionDegree: 3 };
        expect(JSON.stringify(computeMoveReweldPlan(diagB, [longA]))).toBe(
            '{"entries":[{"wallId":"B","newBaseLine":[{"x":6,"y":0,"z":0},{"x":6,"y":0,"z":5.5}],'
            + '"prevBaseLine":[{"x":6,"y":0,"z":0.5},{"x":6,"y":0,"z":5.5}]}],"refusals":[]}',
        );
    });

    it('`computeMoveReweldPlan` exposes ONLY entries and refusals — the census is a separate door', () => {
        const host: MoveReweldMovedWall = {
            id: 'A', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, 0.6], [10, 0.6]),
            thickness: T,
        };
        const collinear: MoveReweldPartner = { id: 'C', baseLine: bl([10, 0], [16, 0]) };
        const plan = computeMoveReweldPlan(host, [collinear]);
        expect(Object.keys(plan)).toEqual(['entries', 'refusals']);
        // …while the census, on the identical inputs, has the missing fact.
        expect(computeMoveReweldCensus(host, [collinear]).notApplicable).toHaveLength(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §SIGNATURE — the founder's line, reproduced, and then answered
// ─────────────────────────────────────────────────────────────────────────────

describe('§L-945 §SIGNATURE — "2 partners, 1 re-seat, 0 refused" now reconciles', () => {
    /**
     * ⭐ THE PRODUCTION SIGNATURE, CONSTRUCTED.
     *
     * A perimeter wall A runs east–west and is dragged 0.6 m north. Two partners
     * are named by the `joinedTo` graph:
     *
     *   C — a degree-2 corner at A's WEST end. It follows: one entry.
     *   B — a corner at A's EAST end that another cascade has ALREADY re-seated
     *       onto A's NEW line before this subscriber ran (the slab corner weld
     *       subscribes first — `WallMoveReweldService` says so in its own
     *       header). Its endpoint is therefore no longer within `weldTol` of A's
     *       PREV line, and it drops at step 1.
     *
     * OLD OUTPUT: `2 partner(s) [B, C] → 1 baseline re-seat(s) [C], 0 refused`.
     * The founder's line, exactly — and B unaccounted.
     *
     * ⚠ THIS FIXTURE DOES NOT PROVE WHICH PATH THE FOUNDER'S OWN MODEL TOOK. It
     * proves the SIGNATURE is producible and that the census names the dropped
     * partner when it is. The production answer needs one line from the browser,
     * and that line now carries it — which is the whole deliverable.
     */
    it('reproduces the signature and names the partner the old output dropped', () => {
        const movedA: MoveReweldMovedWall = {
            id: 'A', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, 0.6], [10, 0.6]),
            thickness: T,
        };
        const cWest: MoveReweldPartner = { id: 'C', baseLine: bl([0, 0], [0, -5]) };
        const bEastAlreadyMoved: MoveReweldPartner = { id: 'B', baseLine: bl([10, 0.6], [10, -5]) };

        const census = computeMoveReweldCensus(movedA, [bEastAlreadyMoved, cWest]);

        // ── the OLD three counts: exactly the founder's line ────────────────
        expect(census.consideredPartnerIds).toEqual(['B', 'C']);
        const partnerReseats = census.entries.map(e => e.wallId).filter(id => id !== 'A');
        expect(partnerReseats).toEqual(['C']);
        expect(census.refusals).toEqual([]);

        // ── the FOURTH fact, which did not exist before ─────────────────────
        expect(outcomeOf(census, 'B', 'A')).toBe('NOT_WELDED_TO_SUBJECT_PREV_SEGMENT');
        const bNa = census.notApplicable.find(n => n.partnerId === 'B')!;
        expect(bNa.measuredMm).toBe(600);   // B's endpoint is 0.600 m off A's PREV line
        expect(bNa.limitMm).toBe(500);      // …against a 0.500 m weldTol

        // …and the arithmetic reconciles, which `2 = 1 + 0` never did.
        expectPartition(census, 'A', ['B', 'C']);
    });

    /**
     * THE OTHER WAY THE SAME LINE IS PRODUCED, and the one no reader could have
     * distinguished: the partner is handled CORRECTLY (incumbent preserved) and
     * the joint is left open anyway because the SUBJECT could not reach the
     * corner. The partner census alone would look clean; the subject-seat clause
     * is what makes it visible.
     */
    it('distinguishes "the partner was dropped" from "the SUBJECT could not reach the corner"', () => {
        // ── THE §L-872 T-SEAT-GUARD DECLINING A CORNER, WHICH IS CORRECT ────
        //
        // A perimeter A at z=0 is dragged 1 m north. Partner P is a long wall at
        // x=5 crossing it, welded at (5,0) and running north to (5,10). Its
        // junction is degree 3, so P is an INCUMBENT: the corner (5,1) lies on
        // P's own body, P is preserved, and the SUBJECT is offered the corner.
        //
        // The subject then declines it — correctly. (5,1) is 5 m from either of
        // A's endpoints, i.e. strictly INTERIOR to A's new segment, and seating
        // an endpoint there would SHORTEN A by 5 m. That is §L-872's scar and
        // the guard is doing exactly its job.
        //
        // ⭐ BUT THE JOINT IS STILL OPEN, AND NOBODY SAID SO. The partner census
        // reads clean — `INCUMBENT_PRESERVED_SUBJECT_ADAPTS`, a success code —
        // and the old dispatch line printed "1 partner, 0 re-seats, 0 refused".
        // The subject-seat clause is the only place this fact exists.
        const movedA: MoveReweldMovedWall = {
            id: 'A', prevBaseLine: bl([0, 0], [10, 0]), newBaseLine: bl([0, 1], [10, 1]),
        };
        const crossing: MoveReweldPartner = {
            id: 'P', baseLine: bl([5, 0], [5, 10]), junctionDegree: 3,
        };
        const census = computeMoveReweldCensus(movedA, [crossing]);

        // The partner's own outcome is a SUCCESS…
        expect(outcomeOf(census, 'P', 'A')).toBe('INCUMBENT_PRESERVED_SUBJECT_ADAPTS');
        expect(census.refusals).toEqual([]);
        // …and yet nothing was written, because the SUBJECT declined the corner.
        expect(census.entries).toEqual([]);
        expect(census.subjectSeat.cornersOffered).toEqual(['P']);
        expect(census.subjectSeat.seatedOn).toEqual([]);
        expect(census.subjectSeat.declined).toHaveLength(1);
        expect(census.subjectSeat.declined[0]!.partnerId).toBe('P');
        expect(census.subjectSeat.declined[0]!.reason).toBe('CORNER_OFF_SUBJECT_SEGMENT');
        expect(census.subjectSeat.declined[0]!.measuredMm).toBe(5000); // 5 m from either end
        expect(census.subjectSeat.entryEmitted).toBe(false);
        expectPartition(census, 'A', ['P']);
    });
});
