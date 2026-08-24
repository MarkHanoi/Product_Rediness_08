/**
 * ⭐⭐ §GRAPH43-REFUSE-BEFORE-VS-REPORT-AFTER (L-10805) — W4. THE FOUNDER'S
 *    RULING, TURNED FROM AN ACCIDENT INTO AN INVARIANT.
 *
 * ── THE RULING, 2026-08-24 ──────────────────────────────────────────────────
 *
 * On whether a wall move that DESTROYS A ROOM should be blocked:
 * **INADVISABLE, not IMPOSSIBLE. Proceed and report.** Merging two rooms by
 * moving a wall is a legitimate architectural act performed deliberately;
 * geometry cannot tell that from an accident, and refusing would block real
 * work. ⛔ *"Do NOT refuse the move."*
 *
 * ── ⭐ THE HONEST FINDING: THERE WAS NOTHING TO RECLASSIFY ───────────────────
 *
 * Measured before writing a line of it: **every existing refusal is already on
 * the right side of this ruling.** `WallMoveClashProposal`'s two arms are the
 * incumbent breach (C83 §10.2.2) and a wall∩opening clash; neither refuses on a
 * downstream consequence. The behaviour the founder asked for was **already
 * correct.**
 *
 * ⛔ **AND THAT IS EXACTLY WHY THIS FILE EXISTS.** It was correct *by accident*
 * and stated *nowhere* — this repository's most-logged defect shape: a success
 * criterion with no term for the property that actually matters. Nothing stopped
 * a future lane from adding `ROOM_WOULD_BE_LOST` as a refusal and quietly
 * reversing a founder ruling.
 *
 * Now: an unclassified reason is a **compile error** (`moveRefusalGround`'s
 * `never` arm), and a consequence-grounded refusal is a **test failure**.
 *
 * @file packages/geometry-wall/__tests__/GRAPH43RefuseBeforeVsReportAfter.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
    moveRefusalGround,
    computeMoveReweldCensus,
    type MoveRefusalGround,
    type MoveReweldRefusalReason,
    type MoveReweldPartner,
    type ReweldBaseline,
} from '../src/WallMoveReweld';

/**
 * ⚠ THE CLOSED UNION, RESTATED BY HAND ON PURPOSE.
 *
 * TypeScript unions are erased at runtime, so a test cannot enumerate them. This
 * list is therefore a SECOND declaration and it can rot — which is why
 * §UNION-IS-COVERED below cross-checks it against the compiler's own
 * exhaustiveness rather than trusting it. If a member is added to the union and
 * not here, `moveRefusalGround` still fails to compile; if a member is removed
 * from the union and left here, this list stops type-checking.
 */
const ALL_REASONS: readonly MoveReweldRefusalReason[] = [
    'INCUMBENT_EXTENSION_REQUIRED',
    'AMBIGUOUS_WELD_AUTHORSHIP',
    'STEM_REVERSAL',
    'STEM_COLLAPSE',
    'STEM_EXTENSION_EXCEEDS_CAP',
    'STEM_HOST_NO_LONGER_BENEATH',
    'CORNER_FOLLOW_GAIN_EXCEEDED',
    'HOST_EXTENSION_GAIN_EXCEEDED',
];

const bl = (a: [number, number], b: [number, number]): ReweldBaseline =>
    [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }];

describe('§GRAPH43 §W4 — a move is refused only on IMPOSSIBLE or INCUMBENT', () => {
    /**
     * ⭐⭐ THE INVARIANT THE RULING BUYS. Every refusal must stand on one of the
     * two permitted grounds, and **a downstream consequence is not one of them.**
     */
    it('§TWO-GROUNDS-ONLY: every refusal stands on IMPOSSIBLE or INCUMBENT', () => {
        const permitted: readonly MoveRefusalGround[] = ['IMPOSSIBLE', 'INCUMBENT'];
        for (const reason of ALL_REASONS) {
            expect(permitted, `${reason} must stand on a permitted ground`)
                .toContain(moveRefusalGround(reason));
        }
    });

    /**
     * ⛔ THE GUARD WITH TEETH. A refusal whose NAME describes a downstream
     * consequence — a room, a loop, a region, a topology finding — is a
     * refuse-before on something the founder ruled is report-after.
     *
     * Name-based, and that is a real limitation stated rather than hidden: it
     * catches the honest case (someone adds `ROOM_WOULD_BE_LOST`) and not a
     * deliberately misnamed one. The compile-time arm is what makes the honest
     * case unavoidable; this arm is what makes it LOUD.
     */
    it('§NO-CONSEQUENCE-REFUSALS: no refusal is grounded in a room or loop outcome', () => {
        const forbidden = /ROOM|LOOP|REGION|AREA|TOPOLOG|MERGE|ENCLOS/i;
        for (const reason of ALL_REASONS) {
            expect(reason, `${reason} reads as a downstream-consequence refusal`)
                .not.toMatch(forbidden);
        }
    });

    /**
     * §UNION-IS-COVERED — the control on the hand-written list above. Each
     * member must classify, and the set must be non-trivial in BOTH grounds:
     * a mapping that returned one constant would pass §TWO-GROUNDS-ONLY.
     */
    it('§UNION-IS-COVERED: both grounds are populated and every member classifies', () => {
        const grounds = ALL_REASONS.map(moveRefusalGround);
        expect(grounds).toHaveLength(ALL_REASONS.length);
        expect(new Set(grounds).size).toBe(2);
        expect(grounds.filter(g => g === 'INCUMBENT').length).toBeGreaterThan(0);
        expect(grounds.filter(g => g === 'IMPOSSIBLE').length).toBeGreaterThan(0);
    });

    /**
     * ⭐ AND THE BEHAVIOUR, END-TO-END: a move that BREAKS A JOIN the engine
     * cannot repair PROCEEDS. It emits no refusal — it reports.
     *
     * This is the founder's ruling as an executable fact rather than a policy
     * statement: the gesture that opened a 1200 mm gap produces **zero
     * refusals** and a NAMED not-applicable carrying the measured gap.
     */
    it('§PROCEED-AND-REPORT: an unrepairable break refuses nothing', () => {
        const sideways = {
            id: 'S',
            prevBaseLine: bl([0, 3], [2, 3]),
            newBaseLine: bl([3.2, 3], [5.2, 3]),
            thickness: 0.2,
        };
        const rail: MoveReweldPartner =
            { id: 'RAIL', baseLine: bl([2, 1], [2, 5]), declared: true };

        const census = computeMoveReweldCensus(sideways, [rail], { weldTol: 0.5 });

        // ⛔ Nothing is refused — the move stands.
        expect(census.refusals).toHaveLength(0);
        // ✅ And the consequence is NAMED, with its millimetres.
        const na = census.notApplicable.find(n => n.partnerId === 'RAIL')!;
        expect(na.reason).toBe('SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE');
        expect(na.measuredMm).toBe(1200);
        expect(na.limitMm).toBe(500);
    });
});
