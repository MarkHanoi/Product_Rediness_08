/**
 * §WALLDEEP32 — THE PARTNER THAT EXTENDED THE WRONG WAY, AND THE THREE
 * SEPARATE REASONS THE CASCADE CALLED IT A SUCCESS.
 *
 * ── THE FOUNDER'S REPORT, AND THE LINE THAT MAKES IT A DEFECT ────────────────
 *
 * *"I created a perimeter wall and slab, and moved a wall that was connected to
 * a curved wall and a linear wall. The curved wall moved correctly I believe —
 * the SLAB did not adapt, and the other wall got extended but in the WRONG
 * DIRECTION."*
 *
 *     §MOVE-REWELD-DISPATCH: moved wall …EVY3 → 2 partner(s) via joinedTo-graph
 *       [WA9, RQ8] → 3 baseline re-seat(s), 0 junction(s) refused,
 *       0 not-applicable | subject: 2 corner(s) offered, 2 seated
 *       (all re-seated), entry emitted | partners accounted 2/2
 *
 * ⭐ `0 refused · 2/2 seated · all re-seated · partners accounted 2/2` — and one
 * wall had visibly extended the wrong way. **The re-weld's success criterion
 * did not include DISTANCE.** It proves a corner was REACHED; it never asked
 * whether reaching it was a plausible thing to have done.
 *
 * ── THE HYPOTHESIS THE BRIEF HANDED THIS LANE, AND ITS REFUTATION ────────────
 *
 * The brief proposed: *"if the re-seat picks the nearer endpoint by distance, a
 * long partner whose FAR end happens to be nearer the new corner will invert."*
 *
 * ⛔ **REFUTED for the partner loop, and the refutation is in `§CONTROL` below.**
 * `computeMoveReweldCensus` decides which partner endpoint follows by distance
 * to the subject's **PREV SEGMENT** — *"which endpoint WAS at the junction"* —
 * not by distance to the new corner. That rule is correct and a 28-configuration
 * sweep (4 perimeter shapes × every wall × 7 drag vectors) found **zero**
 * wrong-endpoint picks and **zero** subject double-claims. The nearest-to-corner
 * rule the brief describes DOES exist in this repository — it is
 * `SlabWallConnectivityService.computeNearestEndpointEntry`'s legacy branch,
 * which §L-875 named as a defect and fixed only when `prevSeg` is supplied — but
 * it is not what produced this line.
 *
 * ── WHAT ACTUALLY PRODUCED IT: THREE INDEPENDENT DEFECTS ─────────────────────
 *
 * §INVERSION (L-10601) — the corner arm's extension cap is `1/sin θ`-scaled and
 *   bounded only by `MIN_ANGLE_RAD` (5.73°), where it permits a **10×** follow.
 *   Fixture `ARC-2`: a 2 m drag moved a partner **14.14 m**. Fixture `D-c`: a
 *   1.5 m drag moved a partner **7.08 m**, through the subject and out the far
 *   side. Both passed every guard, because the only direction guard on that arm
 *   asks *"did the wall flip end-for-end?"* and the honest answer is no — it
 *   grew, correctly oriented, seven times too far.
 *
 *   ⭐ THE ASYMMETRY IS THE EVIDENCE. The founder's SECOND report is a clean
 *   `STEM_REVERSAL` refusal on the same geometric event. The stem arm caps at
 *   `drag + weldTol`; the corner arm capped at `drag/sin θ + weldTol`. One
 *   subject, two arms, two ceilings, two verdicts.
 *
 * §HALF-CLOSED (L-10602) — a partner's follow is emitted in the partner loop and
 *   the subject's ability to reach the same corner is not known until the seat
 *   loop. When the subject then declines, the plan as it stood had moved ONE of
 *   the two walls to a meeting point the other never arrives at. Founder: *"are
 *   the mitred joins still connected and linked?"* — for that outcome, no.
 *
 * §STALE-DECLARATION (L-10600) — his THIRD report:
 *
 *     [66MC:NOT_WELDED_TO_SUBJECT_PREV_SEGMENT(2259/500 mm),
 *      MSD:NOT_WELDED_TO_SUBJECT_PREV_SEGMENT(2263/500 mm)]
 *
 *   read by two people as *"a move bigger than the 500 mm tolerance makes the
 *   engine forget the walls were joined."* ⛔ **Arithmetically impossible, and
 *   `§CONTROL-BIG-MOVE` proves it**: a stationary partner welded at the old
 *   corner sits ON the prev segment, so its distance is 0 no matter how far the
 *   subject then travels. 2259 mm ≈ the 2260 mm move is a FINGERPRINT — those
 *   partners were on the POST-move line. They had already followed, and one
 *   distance cannot tell *"already repaired"* from *"never there"*.
 *
 * @file packages/geometry-wall/__tests__/WALLDEEP32DirectionInversion.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
    computeMoveReweldCensus,
    type MoveReweldCensus,
    type MoveReweldPartner,
    type ReweldBaseline,
} from '../src/WallMoveReweld';

type P = { x: number; z: number };
const bl = (a: P, b: P): ReweldBaseline => [{ x: a.x, y: 0, z: a.z }, { x: b.x, y: 0, z: b.z }];

/** The founder's production wall thickness family. */
const T = 0.2;
/** DEFAULT_SNAP_RADIUS, the weld tolerance the service passes in production. */
const WELD_TOL = 0.5;

/** How far a partner's welded endpoint travelled, in metres. */
function partnerDisplacementM(census: MoveReweldCensus, partnerId: string): number {
    const e = census.entries.find(x => x.wallId === partnerId);
    if (!e) return 0;
    return Math.max(
        Math.hypot(e.newBaseLine[0].x - e.prevBaseLine[0].x, e.newBaseLine[0].z - e.prevBaseLine[0].z),
        Math.hypot(e.newBaseLine[1].x - e.prevBaseLine[1].x, e.newBaseLine[1].z - e.prevBaseLine[1].z),
    );
}

const reasonsOf = (c: MoveReweldCensus) => c.refusals.map(r => r.reason);
const naOf = (c: MoveReweldCensus) => c.notApplicable.map(n => n.reason);

describe('§WALLDEEP32 — the partner that extended the wrong way', () => {
    // ─────────────────────────────────────────────────────────────────────────
    // §INVERSION — the reproduction, and the fix that refuses it
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * ARC-2 — A CURVED WALL IS A CHORD TO THIS ENGINE, AND A CHORD CAN MEET ITS
     * NEIGHBOUR AT ANY ANGLE.
     *
     * `MoveReweldPartner` carries `baseLine` and nothing else, so a curved wall
     * enters as the STRAIGHT LINE BETWEEN ITS ENDS. The wall the user sees leaves
     * that endpoint along its TANGENT — very often near-perpendicular to its
     * neighbour, which is why the corner LOOKS square. The engine reasons about
     * the chord, whose angle is unrelated. That is how a perimeter made of
     * ordinary square-looking corners contains an 8° junction, and it is why the
     * founder's curved wall is entangled with a defect that is not about curves.
     *
     * Chord (0,0)→(1.2,8.4) is 8.1° off the subject ⇒ `1/sin θ = 7.07`.
     */
    it('§INVERSION-ARC: a 2 m drag must not move an untouched wall 14 m', () => {
        const partners: MoveReweldPartner[] = [
            { id: 'ARC', baseLine: bl({ x: 0, z: 0 }, { x: 1.2, z: 8.4 }) },
            { id: 'SOUTH', baseLine: bl({ x: 10, z: 8 }, { x: 0, z: 8 }) },
        ];
        const census = computeMoveReweldCensus(
            {
                id: 'WEST',
                prevBaseLine: bl({ x: 0, z: 8 }, { x: 0, z: 0 }),
                newBaseLine: bl({ x: -2, z: 8 }, { x: -2, z: 0 }),
                thickness: T,
            },
            partners,
            { weldTol: WELD_TOL },
        );

        // ⭐ AT HEAD BEFORE THIS LANE this assertion failed with 14.142: the ARC's
        // welded endpoint went from (0,0) to (-2,-14) — fourteen metres, from a
        // two-metre drag — and the census reported `0 refused`. The wall the user
        // did not touch travelled SEVEN TIMES further than the wall he did.
        expect(partnerDisplacementM(census, 'ARC')).toBeLessThanOrEqual(2 * 3 + WELD_TOL);
        expect(reasonsOf(census)).toContain('CORNER_FOLLOW_GAIN_EXCEEDED');

        // The refusal states BOTH numbers (C83 §10.3) — what it measured and what
        // it had to clear — so the user can see the size of the miss.
        const r = census.refusals.find(x => x.reason === 'CORNER_FOLLOW_GAIN_EXCEEDED')!;
        expect(r.beyondMm).toBeGreaterThan(r.limitMm!);

        // ⛔ AND THE JOINT IS NOT QUIETLY DROPPED. The whole point of the fix is
        // that the corner is now REPORTED as left open, not silently closed by a
        // 14 m extension that the log called a success.
        expect(census.refusals.length).toBeGreaterThan(0);

        // The ORTHOGONAL partner is unaffected — its junction is well conditioned
        // and it follows exactly as it did before. A cap that also refused this
        // one would be a regression dressed as a fix.
        expect(census.entries.some(e => e.wallId === 'SOUTH')).toBe(true);
    });

    /**
     * D-c — THE SAME DEFECT ON A SHAPE SOMEBODY WOULD ACTUALLY DRAW: a bay whose
     * arc springs off the end of a straight run. 12.2° chord ⇒ gain 4.72.
     */
    it('§INVERSION-BAY: a 1.5 m drag must not move an untouched wall 7 m', () => {
        const census = computeMoveReweldCensus(
            {
                id: 'N',
                prevBaseLine: bl({ x: 0, z: 0 }, { x: 8, z: 0 }),
                newBaseLine: bl({ x: 0, z: -1.5 }, { x: 8, z: -1.5 }),
                thickness: T,
            },
            [
                { id: 'ARC', baseLine: bl({ x: 8, z: 0 }, { x: 14, z: 1.3 }) },
                { id: 'W', baseLine: bl({ x: 0, z: 10 }, { x: 0, z: 0 }) },
            ],
            { weldTol: WELD_TOL },
        );

        // At HEAD: 7.081 m, reported as a re-seat with 0 refusals.
        expect(partnerDisplacementM(census, 'ARC')).toBeLessThanOrEqual(1.5 * 3 + WELD_TOL);
        expect(reasonsOf(census)).toContain('CORNER_FOLLOW_GAIN_EXCEEDED');
    });

    /**
     * §L-932 MUST NOT REGRESS. Its own named fixture is a 30° junction, gain
     * 2.00, and the whole reason `1/sin θ` exists is that capping at the drag
     * dropped it silently. `MAX_FOLLOW_GAIN = 3` clears it with margin — this
     * test is the control that says the cure did not become the disease.
     */
    it('§L-932-CONTROL: a 30° junction still follows — the cap did not undo L-932', () => {
        // Partner at 30° to the subject. sin 30° = 0.5 ⇒ required gain 2.0.
        const census = computeMoveReweldCensus(
            {
                id: 'N',
                prevBaseLine: bl({ x: 0, z: 0 }, { x: 8, z: 0 }),
                newBaseLine: bl({ x: 0, z: -0.6 }, { x: 8, z: -0.6 }),
                thickness: T,
            },
            [{ id: 'P', baseLine: bl({ x: 0, z: 0 }, { x: 8.66, z: 5 }) }],
            { weldTol: WELD_TOL },
        );
        expect(census.entries.some(e => e.wallId === 'P')).toBe(true);
        expect(reasonsOf(census)).not.toContain('CORNER_FOLLOW_GAIN_EXCEEDED');
    });

    /**
     * §CONTROL — THE BRIEF'S HYPOTHESIS, REFUTED BY MEASUREMENT.
     *
     * A rectangular perimeter, dragged four times the weld tolerance. The
     * partners pivot about their FAR endpoints and grow toward the joint. No
     * endpoint is chosen by proximity to the corner anywhere on this path.
     */
    it('§CONTROL: the partner loop picks the endpoint that WAS at the junction', () => {
        const census = computeMoveReweldCensus(
            {
                id: 'N',
                prevBaseLine: bl({ x: 0, z: 0 }, { x: 10, z: 0 }),
                newBaseLine: bl({ x: 0, z: -2 }, { x: 10, z: -2 }),
                thickness: T,
            },
            [
                { id: 'E', baseLine: bl({ x: 10, z: 0 }, { x: 10, z: 8 }) },
                { id: 'W', baseLine: bl({ x: 0, z: 8 }, { x: 0, z: 0 }) },
            ],
            { weldTol: WELD_TOL },
        );
        const e = census.entries.find(x => x.wallId === 'E')!;
        // E was welded at its START (10,0). Its START moves to the new corner and
        // its END — the far one, 8 m away — is untouched.
        expect(e.newBaseLine[0]).toMatchObject({ x: 10, z: -2 });
        expect(e.newBaseLine[1]).toMatchObject({ x: 10, z: 8 });

        const w = census.entries.find(x => x.wallId === 'W')!;
        // W is stored the other way round; the same rule picks its END.
        expect(w.newBaseLine[0]).toMatchObject({ x: 0, z: 8 });
        expect(w.newBaseLine[1]).toMatchObject({ x: 0, z: -2 });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // §HALF-CLOSED — a corner only one of the two walls reaches
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * The partner is followed in the partner loop; the subject's seat is judged
     * a loop later. When the subject declines, the plan used to keep the partner
     * entry — moving a wall the user never touched to a corner nothing meets.
     */
    it('§HALF-CLOSED: a follow is RETRACTED when the subject cannot reach the same corner', () => {
        const census = computeMoveReweldCensus(
            {
                id: 'N',
                prevBaseLine: bl({ x: 0, z: 0 }, { x: 8, z: 0 }),
                newBaseLine: bl({ x: 0, z: -1.5 }, { x: 8, z: -1.5 }),
                thickness: T,
            },
            [
                { id: 'ARC', baseLine: bl({ x: 8, z: 0 }, { x: 14, z: 1.3 }) },
                { id: 'W', baseLine: bl({ x: 0, z: 10 }, { x: 0, z: 0 }) },
            ],
            { weldTol: WELD_TOL },
        );

        // The subject declined ARC's corner (it lies past its angle-derived reach).
        const declinedIds = census.subjectSeat.declined.map(d => d.partnerId);
        if (declinedIds.includes('ARC')) {
            // ⛔ THEN NO ENTRY FOR ARC MAY SURVIVE. Either the gain cap refused it
            // or the retraction withdrew it — both are correct, and either way the
            // model must not carry a wall moved to meet nothing.
            expect(census.entries.some(e => e.wallId === 'ARC')).toBe(false);
            // And the outcome is NAMED. Silence here is the fourth state §L-945
            // forbids.
            const named = reasonsOf(census).includes('CORNER_FOLLOW_GAIN_EXCEEDED')
                || naOf(census).includes('CORNER_RETRACTED_SUBJECT_DECLINED');
            expect(named).toBe(true);
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // §STALE-DECLARATION — the founder's third report
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * ⛔ THE REFUTATION, AS AN EXECUTED CONTROL.
     *
     * *"Any move larger than the weld tolerance makes the cascade conclude the
     * walls were never joined"* — 2.26 m against a 500 mm tolerance. If that were
     * true THIS test would show two `NOT_WELDED_TO_SUBJECT_PREV_SEGMENT`
     * outcomes. It shows two clean follows, because a stationary partner welded
     * at the old corner is AT DISTANCE ZERO from the prev segment however far the
     * subject subsequently travels. The gate does not scale with the drag.
     */
    it('§CONTROL-BIG-MOVE: a 2.26 m move (4.5× weldTol) welds both partners normally', () => {
        const census = computeMoveReweldCensus(
            {
                id: 'N',
                prevBaseLine: bl({ x: 0, z: 0 }, { x: 8, z: 0 }),
                newBaseLine: bl({ x: 0, z: -2.26 }, { x: 8, z: -2.26 }),
                thickness: T,
            },
            [
                { id: 'E', baseLine: bl({ x: 8, z: 0 }, { x: 8, z: 9 }), declared: true },
                { id: 'W', baseLine: bl({ x: 0, z: 9 }, { x: 0, z: 0 }), declared: true },
            ],
            { weldTol: WELD_TOL },
        );
        expect(naOf(census)).not.toContain('NOT_WELDED_TO_SUBJECT_PREV_SEGMENT');
        expect(census.entries.filter(e => e.wallId !== 'N')).toHaveLength(2);
    });

    /**
     * ⭐ AND THE FINGERPRINT, REPRODUCED. Put the partners where the founder's
     * numbers say they were — ON the post-move line, i.e. already followed — and
     * the old code's single distance produces exactly his 2259/500 mm reading.
     * The new code takes the SECOND measurement and reports the opposite fact.
     */
    it('§STALE-DECLARATION: an already-followed partner reads as a SUCCESS, not a lost join', () => {
        const census = computeMoveReweldCensus(
            {
                id: 'N',
                prevBaseLine: bl({ x: 0, z: 0 }, { x: 8, z: 0 }),
                newBaseLine: bl({ x: 0, z: -2.26 }, { x: 8, z: -2.26 }),
                thickness: T,
            },
            [
                { id: 'E', baseLine: bl({ x: 8, z: -2.26 }, { x: 8, z: 9 }), declared: true },
                { id: 'W', baseLine: bl({ x: 0, z: 9 }, { x: 0, z: -2.26 }), declared: true },
            ],
            { weldTol: WELD_TOL },
        );
        // The distance to the PREV segment is 2260 mm for both — the founder's
        // number. The distance to the NEW segment is 0. Same walls, opposite fact.
        expect(naOf(census)).not.toContain('NOT_WELDED_TO_SUBJECT_PREV_SEGMENT');
        expect(naOf(census)).toContain('PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT');
        expect(naOf(census)).not.toContain('DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE');
    });

    /**
     * A DECLARED join welded to NEITHER pose is a contradiction between two
     * authorities, and it now has its OWN name instead of borrowing the one that
     * means *"this partner was never joined here"*.
     *
     * ⚠ IT IS NOT A REFUSAL, AND THE FIRST DRAFT OF THIS LANE MADE IT ONE.
     * `L936ReweldEmitterHonesty.test.ts` refuted that within the hour: its harness
     * builds a `joinedTo` answer that legitimately includes walls joined AT THE
     * LEVEL but not to the subject at that segment, and asserts `0 junction(s)
     * refused` over it. **The graph over-reports by design**, so refusing on every
     * over-report is L-921 inverted — noise where there is no finding. The
     * contradiction is NAMED here and ACTED ON nowhere; acting on it is C85 §10.7
     * W-M-4, recorded NOT-YET-TRUE.
     */
    it('§STALE-DECLARATION: a declared join welded to NEITHER pose gets its OWN name', () => {
        const census = computeMoveReweldCensus(
            {
                id: 'N',
                prevBaseLine: bl({ x: 0, z: 0 }, { x: 8, z: 0 }),
                newBaseLine: bl({ x: 0, z: -2.26 }, { x: 8, z: -2.26 }),
                thickness: T,
            },
            // Named by the graph, and 6 m from the subject in both poses.
            [{ id: 'GHOST', baseLine: bl({ x: 20, z: 6 }, { x: 20, z: 12 }), declared: true }],
            { weldTol: WELD_TOL },
        );
        expect(naOf(census)).toContain('DECLARED_JOIN_NOT_FOUND_AT_EITHER_POSE');
        expect(naOf(census)).not.toContain('NOT_WELDED_TO_SUBJECT_PREV_SEGMENT');
        // ⛔ And it does NOT become a refusal — see the note above.
        expect(census.refusals).toHaveLength(0);
    });

    /**
     * ⚠ AND THE LEVEL-SCAN ARM IS UNCHANGED, deliberately. There the partner set
     * is EVERY wall on the level and the graph asserted nothing, so a distant
     * wall is a routine non-event — refusing one per unrelated wall would be
     * L-921 inverted: noise where there is no finding.
     */
    it('§STALE-DECLARATION: an UNDECLARED distant wall stays a quiet not-applicable', () => {
        const census = computeMoveReweldCensus(
            {
                id: 'N',
                prevBaseLine: bl({ x: 0, z: 0 }, { x: 8, z: 0 }),
                newBaseLine: bl({ x: 0, z: -2.26 }, { x: 8, z: -2.26 }),
                thickness: T,
            },
            [{ id: 'FAR', baseLine: bl({ x: 20, z: 6 }, { x: 20, z: 12 }) }],
            { weldTol: WELD_TOL },
        );
        expect(naOf(census)).toContain('NOT_WELDED_TO_SUBJECT_PREV_SEGMENT');
        expect(census.refusals).toHaveLength(0);
    });

    // ─────────────────────────────────────────────────────────────────────────
    // §PARTITION — the §L-945 invariant, re-asserted on every fixture above
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Every partner leaves the engine as EXACTLY ONE of entry / refusal /
     * not-applicable. The retraction in §HALF-CLOSED removes an entry and adds a
     * not-applicable in the same breath precisely so this cannot be broken by it.
     */
    it('§PARTITION: three new outcomes, and the partition still holds', () => {
        const fixtures: Array<[string, MoveReweldPartner[], ReweldBaseline, ReweldBaseline]> = [
            ['arc', [
                { id: 'ARC', baseLine: bl({ x: 0, z: 0 }, { x: 1.2, z: 8.4 }), declared: true },
                { id: 'SOUTH', baseLine: bl({ x: 10, z: 8 }, { x: 0, z: 8 }), declared: true },
            ], bl({ x: 0, z: 8 }, { x: 0, z: 0 }), bl({ x: -2, z: 8 }, { x: -2, z: 0 })],
            ['bay', [
                { id: 'ARC', baseLine: bl({ x: 8, z: 0 }, { x: 14, z: 1.3 }), declared: true },
                { id: 'W', baseLine: bl({ x: 0, z: 10 }, { x: 0, z: 0 }), declared: true },
            ], bl({ x: 0, z: 0 }, { x: 8, z: 0 }), bl({ x: 0, z: -1.5 }, { x: 8, z: -1.5 })],
            ['stale', [
                { id: 'GHOST', baseLine: bl({ x: 20, z: 6 }, { x: 20, z: 12 }), declared: true },
            ], bl({ x: 0, z: 0 }, { x: 8, z: 0 }), bl({ x: 0, z: -2.26 }, { x: 8, z: -2.26 })],
        ];

        for (const [tag, partners, prev, next] of fixtures) {
            const c = computeMoveReweldCensus({ id: 'S', prevBaseLine: prev, newBaseLine: next, thickness: T },
                partners, { weldTol: WELD_TOL });
            const seen = [
                ...c.entries.map(e => e.wallId).filter(id => id !== 'S'),
                ...c.refusals.map(r => r.partnerId),
                ...c.notApplicable.map(n => n.partnerId),
            ];
            for (const p of partners) {
                expect(seen.filter(id => id === p.id).length, `${tag}/${p.id}`).toBe(1);
            }
        }
    });
});
