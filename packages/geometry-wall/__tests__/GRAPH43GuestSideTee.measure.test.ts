/**
 * ⭐⭐ §GRAPH43-A-T-HAS-TWO-DIRECTIONS (L-10800) — A T-JUNCTION HAS A GUEST AND A
 *    HOST, AND THE MOVE-REWELD ENGINE ONLY EVER ASKS ONE OF THE TWO QUESTIONS.
 *
 * ── THE FOUNDER'S REPORT, 2026-08-24 ─────────────────────────────────────────
 *
 *     §MOVE-REWELD-DISPATCH: moved wall wall_…F58EE…
 *       → 3 partner(s) via joinedTo-graph
 *       → 1 baseline re-seat(s) […FFSN6…], 0 junction(s) refused,
 *         2 not-applicable [
 *           …F0DP3… : DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE(1002/500 mm),
 *           …VXZQ… : DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE(1256/500 mm)]
 *       | subject: no corner offered | partners accounted 3/3
 *
 *     §OPENED-REGION: Room 00-004 (85.7 m²) is no longer its own room — it has
 *       merged into the space next to it. 3.42 m of the boundary it used to have
 *       now has no wall on it.
 *
 * *"one interior partition adapted … but the other did not … we probably lost a
 * room … I was expecting the wall to extend."* He also described the gesture as
 * moving a wall **PAST** two partitions — and C85 already carries the same
 * founder sentence from an earlier session: *"only when the wall surpasses the
 * vertex it corrupts"* (`MoveReweldPartner.junctionType`, `55a2eda3`).
 *
 * ── HYPOTHESES TESTED, AND ONE REFUTED ───────────────────────────────────────
 *
 * The lane brief proposed that `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE` might be
 * an ENDPOINT-TO-ENDPOINT measure, which would be the wrong question for a T.
 * ⛔ **REFUTED, and recorded so it is not re-proposed.** `WallMoveReweld.ts` uses
 * `distToSegment` on both arms (`:1235`, `:1236`, `:1268`, `:1269`) —
 * point-to-SEGMENT throughout, and the two arms are symmetric with each other.
 * There is no endpoint/segment asymmetry.
 *
 * ⭐ **THE ASYMMETRY IS OF A DIFFERENT KIND, AND IT IS DIRECTIONAL.** All four of
 * those measurements take a PARTNER endpoint and measure it against the
 * SUBJECT's segment. The mirror question — *is the SUBJECT's endpoint on the
 * PARTNER's segment?* — is asked NOWHERE in the engine. A T satisfies exactly one
 * of the two. So when the subject is the T's GUEST, the engine is measuring a
 * pair of points that have nothing to do with the joint, and it reports the
 * partner's ARM LENGTH as though it were a gap.
 *
 * ⚠ **CONSEQUENCE FOR EVERY READER OF THAT CONSOLE LINE.** `1002/500 mm` has been
 * read — by the founder, by the lane brief, and by `WallMoveReweld.ts`'s own
 * reason-code doc (*"two authorities disagree"*) — as evidence that the
 * `joinedTo` record was STALE. **§THE-NUMBER-IS-THE-ARM below shows a join closed
 * to 0 mm producing exactly that line.** It is not evidence of staleness, and
 * spending it as such is how L-922 dragged three perimeter doors.
 *
 * ── WHAT THIS FILE DOES NOT CLAIM ────────────────────────────────────────────
 *
 * It does not claim the founder's two partitions WERE guest-side Ts. It claims
 * something narrower and stronger: **his exact console signature is reproducible
 * from an ordinary, valid T-junction, in two geometrically opposite situations
 * that HEAD prints under one name.** Which of them his was is precisely what the
 * new reason codes exist to answer on his next gesture — the instrument before
 * the cure.
 *
 * ⛔ NOTHING IS FIXED IN THE ENGINE BY THIS COMMIT. Every `continue` still
 * continues, on the same predicate. Only the LABEL and the NUMBER change — the
 * §L-945 discipline applied to the one verdict §L-945 itself left conflated.
 * Acting on a guest-side T is C85 §10.7 W-M-13, gated on a founder ruling
 * (C85 §10.8).
 *
 * @file packages/geometry-wall/__tests__/GRAPH43GuestSideTee.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
    computeMoveReweldCensus,
    type MoveReweldCensus,
    type MoveReweldMovedWall,
    type MoveReweldPartner,
    type ReweldBaseline,
} from '../src/WallMoveReweld';

const bl = (a: [number, number], b: [number, number]): ReweldBaseline =>
    [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }];

/** The founder's production wall thickness family; 0.2 m throughout. */
const T = 0.2;
/** `DEFAULT_SNAP_RADIUS`, and the `/500 mm` in every line above. */
const WELD_TOL = 0.5;

const naOf = (c: MoveReweldCensus, id: string) => c.notApplicable.find(n => n.partnerId === id);

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE A — the subject SLIDES ALONG its host. The T stays closed.
//
//   Subject `S`: north–south, (0,0)→(0,3). Its END sits EXACTLY on partition
//   `P`'s body. Dragged 0.6 m east — which, because `P` runs east–west, carries
//   the endpoint ALONG `P` and never off it. Gap before: 0 mm. Gap after: 0 mm.
// ─────────────────────────────────────────────────────────────────────────────

const slideAlong: MoveReweldMovedWall = {
    id: 'S',
    prevBaseLine: bl([0, 0], [0, 3]),
    newBaseLine: bl([0.6, 0], [0.6, 3]),
    thickness: T,
};
/** A partition through `(0,3)` whose WEST arm is `westArm` metres long. */
const hostPartition = (westArm: number): MoveReweldPartner =>
    ({ id: 'P', baseLine: bl([-westArm, 3], [2.5, 3]), declared: true });

describe('§GRAPH43 §THE-CONTROL — the verdict tracks the PARTNER LENGTH, not the join', () => {
    /**
     * ⭐⭐ THE MEASUREMENT THE WHOLE LANE RESTS ON.
     *
     * The joint is IDENTICAL in all three rows: `P`'s centreline passes through
     * `(0,3)`, the subject's pre-move endpoint, and the subject slides along it.
     * Gap: 0 mm, before and after, in every row. The ONLY thing that varies is
     * how far `P` extends west.
     *
     * A wall system that is "conscious of its relationships" cannot give three
     * answers to one question because a neighbour happens to be longer.
     */
    it('one closed join, three partner lengths, two different dispositions', () => {
        // Short enough that P's own west END falls within weldTol of the
        // subject's segment — so the engine's ONE question accidentally returns
        // the right answer, and the wall welds.
        const short = computeMoveReweldCensus(slideAlong, [hostPartition(0.400)], { weldTol: WELD_TOL });
        expect(short.entries.map(e => e.wallId)).toContain('P');
        expect(short.notApplicable).toHaveLength(0);

        // The founder's number, to the millimetre. Same joint. Dropped.
        const founder = computeMoveReweldCensus(slideAlong, [hostPartition(1.002)], { weldTol: WELD_TOL });
        expect(founder.entries.some(e => e.wallId === 'P')).toBe(false);

        // Longer again. Same joint. Dropped, and HEAD's "measured" number grows
        // with the partner rather than with any gap.
        const long = computeMoveReweldCensus(slideAlong, [hostPartition(2.000)], { weldTol: WELD_TOL });
        expect(long.entries.some(e => e.wallId === 'P')).toBe(false);

        // ⭐ The finding in one assertion: the joint never changed, the verdict did.
        expect([
            short.entries.some(e => e.wallId === 'P'),
            founder.entries.some(e => e.wallId === 'P'),
            long.entries.some(e => e.wallId === 'P'),
        ]).toEqual([true, false, false]);
    });

    /**
     * ⛔ THE NUMBER IN THE FOUNDER'S CONSOLE IS NOT A GAP.
     *
     * FAILS ON HEAD (`e6d47536`), measured: HEAD reports
     * `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE` with `measuredMm: 1002` — P's west
     * arm — **about a join that is closed to 0 mm at BOTH poses.**
     */
    it('§THE-NUMBER-IS-THE-ARM: HEAD says "not found, 1002 mm" about a 0 mm join', () => {
        const census = computeMoveReweldCensus(slideAlong, [hostPartition(1.002)], { weldTol: WELD_TOL });
        const na = naOf(census, 'P')!;
        expect(na).toBeDefined();

        // The T is CLOSED, before and after. That verdict did not exist on HEAD.
        expect(na.reason).toBe('SUBJECT_GUEST_JOIN_INTACT');

        // C83 §10.3 — both numbers, and the measured one is the TRUTH: 0 mm.
        expect(na.measuredMm).toBe(0);
        expect(na.limitMm).toBe(500);

        // ⛔ And it is emphatically NOT the arm length HEAD reported.
        expect(na.measuredMm).not.toBe(1002);
    });

    /** The second partition in the founder's line, at its own arm length. */
    it('§THE-SECOND-PARTITION: 1256 mm is the other arm, and that join is closed too', () => {
        const other: MoveReweldPartner =
            { id: 'Q', baseLine: bl([-1.256, 0], [3.0, 0]), declared: true };
        const census = computeMoveReweldCensus(slideAlong, [other], { weldTol: WELD_TOL });
        const na = naOf(census, 'Q')!;
        expect(na.reason).toBe('SUBJECT_GUEST_JOIN_INTACT');
        expect(na.measuredMm).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURE B — the subject is moved PAST its host's end. The T is DESTROYED.
//
//   The founder's own description of the gesture, and C85's earlier record of
//   the same sentence: *"only when the wall surpasses the vertex it corrupts."*
//
//   Subject `S`: an east–west spur, (0,3)→(2,3). Its EAST end sits on partition
//   `P`'s body — `P` is north–south at x=2, running z=1→5. Drag the spur 2.6 m
//   north: its end lands at (2,5.6), which is 600 mm PAST P's north end (2,5).
//   The join was real, was closed to 0 mm, and is now open by 600 mm.
// ─────────────────────────────────────────────────────────────────────────────

const movedPast: MoveReweldMovedWall = {
    id: 'S',
    prevBaseLine: bl([0, 3], [2, 3]),
    newBaseLine: bl([0, 5.6], [2, 5.6]),
    thickness: T,
};
const railPartition: MoveReweldPartner =
    { id: 'RAIL', baseLine: bl([2, 1], [2, 5]), declared: true };

describe('§GRAPH43 §THE-BREAK — a gesture that destroys a real join, named as such', () => {
    /**
     * ⭐⭐ THE ROOM-DESTROYING OUTCOME, WHICH HAD NO NAME ANYWHERE ON HEAD.
     *
     * FAILS ON HEAD: HEAD reports `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE` — the
     * SAME code it reports for FIXTURE A, whose join is perfectly closed, and the
     * same code it reports for a wall 20 m away that was never joined at all.
     * **Three geometrically opposite facts, one name, one bucket, zero refusals.**
     * That is the C72 §9 breach: not that the system is silent — it is not — but
     * that this engine's census cannot distinguish a destroyed relationship from
     * a healthy one.
     */
    it('§THE-BREAK: the join was closed to 0 mm and is now open by 600 mm', () => {
        const census = computeMoveReweldCensus(movedPast, [railPartition], { weldTol: WELD_TOL });
        const na = naOf(census, 'RAIL')!;
        expect(na).toBeDefined();

        expect(na.reason).toBe('SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE');
        // The REAL gap this gesture opened, and the tolerance it had to clear.
        expect(na.measuredMm).toBe(600);
        expect(na.limitMm).toBe(500);

        // ⛔ Still not a refusal, deliberately: the engine has NO ARM that can act
        //    on a guest-side T, so calling it a refusal would claim a decision
        //    that was never taken. C85 §10.8 puts the disposition to the founder.
        expect(census.refusals).toHaveLength(0);
        // ⛔ And nothing was extended — the founder's *"I was expecting the wall
        //    to extend"*, measured.
        expect(census.entries.some(e => e.wallId === 'RAIL')).toBe(false);
    });

    /**
     * ⭐ THE CONFLATION, IN ONE CENSUS. A healthy join and a destroyed one, in the
     * same gesture, printed under one name on HEAD.
     */
    it('§THE-CONFLATION: a closed join and a destroyed join no longer share a name', () => {
        // Both partners host the subject's endpoints. WEST end on `KEEP` (which
        // runs east–west, so the northward drag keeps that T closed only if KEEP
        // moves with it — it does not; use a north–south rail instead).
        const keep: MoveReweldPartner =
            { id: 'KEEP', baseLine: bl([0, 1], [0, 9]), declared: true };
        const census = computeMoveReweldCensus(movedPast, [railPartition, keep], { weldTol: WELD_TOL });

        const reasons = Object.fromEntries(census.notApplicable.map(n => [n.partnerId, n.reason]));
        expect(reasons['RAIL']).toBe('SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE');
        expect(reasons['KEEP']).toBe('SUBJECT_GUEST_JOIN_INTACT');
        // ⭐ Two opposite facts, two names. On HEAD both read
        //   `DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE`.
        expect(new Set(Object.values(reasons)).size).toBe(2);
    });
});

describe('§GRAPH43 §THE-DISCRIMINATOR — why ONE partition adapted and the others did not', () => {
    /**
     * ⭐ THE FOUNDER'S SECOND QUESTION, ANSWERED WITH A MECHANISM.
     *
     * *"one interior partition adapted … but the other did not"* — both were
     * T-joined, so the discriminator cannot be "T versus not-T". It is **WHICH
     * WALL OWNS THE ENDPOINT AT THE T.**
     *
     *   • `STEM` — the PARTITION's endpoint is on the SUBJECT's body. The
     *     engine's one question returns 0 mm, `classifyWeldAuthorship` calls it a
     *     stem, `computeStemFollow` extends it. **This is the one that adapted.**
     *   • `RAIL` — the SUBJECT's endpoint is on the PARTITION's body. The
     *     engine's one question returns the partition's arm length. **Dropped.**
     *
     * The census below is the founder's line, reproduced from geometry: declared
     * partners in, ONE re-seat, ZERO refusals, the rest not-applicable, and
     * `subject: no corner offered` — a stem never offers the subject a corner,
     * and a guest-side T never gets far enough to offer one.
     */
    it('§SIGNATURE: 1 entry, 0 refusals, 2 dropped, no corner offered', () => {
        const stem: MoveReweldPartner =
            { id: 'STEM', baseLine: bl([1, 3], [1, -2]), declared: true };
        const keep: MoveReweldPartner =
            { id: 'KEEP', baseLine: bl([0, 1], [0, 9]), declared: true };

        const census = computeMoveReweldCensus(
            movedPast, [railPartition, keep, stem], { weldTol: WELD_TOL },
        );

        // 1 baseline re-seat — and it is the wall whose ENDPOINT was on the subject.
        expect(census.entries.filter(e => e.wallId !== 'S').map(e => e.wallId)).toEqual(['STEM']);
        // 0 junction(s) refused.
        expect(census.refusals).toHaveLength(0);
        // 2 not-applicable — and they are the two the SUBJECT is a guest of.
        expect(census.notApplicable.map(n => n.partnerId).sort()).toEqual(['KEEP', 'RAIL']);
        // | subject: no corner offered.
        expect(census.subjectSeat.cornersOffered).toHaveLength(0);
        // | partners accounted 3/3.
        expect(
            census.entries.filter(e => e.wallId !== 'S').length
            + census.refusals.length
            + census.notApplicable.length,
        ).toBe(3);
    });
});

describe('§GRAPH43 §ABSENT-IS-NOT-UNREACHABLE — the verdicts are separable', () => {
    /**
     * C01 §6 rule 6 / C72 §9. `notApplicable` was doing the work of several
     * different findings, and only some of them are non-events. This is the one
     * that legitimately keeps the old name: no join in EITHER direction at
     * EITHER pose. It is the only reading that may honestly mean *"stale record"*.
     */
    it('a genuinely unsupported declared edge KEEPS the old name', () => {
        const ghost: MoveReweldPartner =
            { id: 'GHOST', baseLine: bl([20, 6], [20, 12]), declared: true };
        const census = computeMoveReweldCensus(movedPast, [ghost], { weldTol: WELD_TOL });
        expect(naOf(census, 'GHOST')!.reason).toBe('DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE');
        expect(census.refusals).toHaveLength(0);
    });

    /**
     * ⚠ THE UNDECLARED ARM IS UNCHANGED, deliberately. The level-scan fallback
     * offers EVERY wall on the level, so a mirror test firing on all of them
     * would report a guest-join per unrelated wall the subject happens to point
     * at — L-921 inverted, noise where there is no finding.
     */
    it('an UNDECLARED guest-side T is untouched by this change', () => {
        const undeclared: MoveReweldPartner = { id: 'U', baseLine: bl([2, 1], [2, 5]) };
        const census = computeMoveReweldCensus(movedPast, [undeclared], { weldTol: WELD_TOL });
        expect(naOf(census, 'U')!.reason).toBe('NOT_WELDED_TO_SUBJECT_PREV_SEGMENT');
    });

    /**
     * §PARTITION, the §L-945 control: adding reason codes must not let a partner
     * escape the census or land in two buckets.
     */
    it('§PARTITION holds across every fixture in this file', () => {
        const stem: MoveReweldPartner =
            { id: 'STEM', baseLine: bl([1, 3], [1, -2]), declared: true };
        const keep: MoveReweldPartner =
            { id: 'KEEP', baseLine: bl([0, 1], [0, 9]), declared: true };
        const ghost: MoveReweldPartner =
            { id: 'GHOST', baseLine: bl([20, 6], [20, 12]), declared: true };

        const census = computeMoveReweldCensus(
            movedPast, [railPartition, keep, stem, ghost], { weldTol: WELD_TOL },
        );
        const all = [
            ...census.entries.map(e => e.wallId).filter(id => id !== 'S'),
            ...census.refusals.map(r => r.partnerId),
            ...census.notApplicable.map(n => n.partnerId),
        ];
        expect(new Set(all).size).toBe(all.length);
        expect([...all].sort()).toEqual(['GHOST', 'KEEP', 'RAIL', 'STEM']);
    });
});
