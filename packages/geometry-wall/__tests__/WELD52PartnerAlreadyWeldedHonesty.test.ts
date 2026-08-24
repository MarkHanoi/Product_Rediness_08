// §WELD52-SAY-WHAT-YOU-MEASURED — ISSUE-LOG L-10830.
//
// WHAT THE FOUNDER REPORTED (production console, `bc3aa61b`, 2026-08-24)
// ----------------------------------------------------------------------------
// One wall drag produced, in this order:
//
//   [SlabWallConnectivityService] §L-925-DIRECTION-STABLE wall …ENM2FR: …
//   EXECUTE: UPDATE_WALL_BASELINE
//   [SlabWallConnectivityService] §L-925-DIRECTION-STABLE wall …ENM2FR: (AGAIN)
//   EXECUTE: CASCADE_WALL_BASELINE
//   [WallMoveReweldService] §MOVE-REWELD-EMPTY-PLAN: moved wall …JEWFN4 —
//      2 partner(s) considered, 0 re-weld entries and 0 refusals …
//      […:PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT(0/500 mm) ⇒ … If it looks
//      unadapted on screen, the defect is DOWNSTREAM of this cascade (render /
//      invalidation / mesh cache), NOT in the weld engine]
//
// ⛔ THE LAST CLAUSE IS THE DEFECT THIS FILE PINS. The founder read it,
// concluded the store was correct and the renderer stale, and briefed a lane
// onto GPU invalidation. **The weld had been performed by a different service.**
// An hour went to the wrong subsystem on the authority of a sentence that had
// measured none of it.
//
// WHY A STRING TEST IS THE RIGHT TEST HERE, AND NOT A WEAKER ONE
// ----------------------------------------------------------------------------
// The disposition is CORRECT and does not change: `PARTNER_ALREADY_WELDED_TO_
// NEW_SEGMENT` is a success, the partner IS on the new line, and this engine
// rightly emits nothing. Nothing about the geometry is wrong, so there is no
// number in the model to assert. **The artefact that was wrong is the sentence**,
// and the cost was paid by a human reading it. So the sentence is the subject.
//
// Every arm below asserts a MEASURED quantity of that artefact — the mm pair it
// must carry, and the count of causal claims it is permitted to make about
// subsystems it cannot observe (zero). ⛔ Not one arm asserts "no error thrown":
// today's gesture throws nothing and still sent a reader an hour astray.
//
// ⚠ EXPECTED TO FAIL ON `ecc3a643` (HEAD before the fix): arms §NO-VERDICT and
// §NAMES-THE-CANDIDATE both fail there, because the shipped string asserts the
// render/invalidation/mesh-cache cause outright and never names the service that
// actually performs the weld.

import { describe, it, expect } from 'vitest';
import {
    computeMoveReweldCensus,
    type MoveReweldNotApplicable,
} from '../src/WallMoveReweld';
import { summariseNotApplicable } from '../src/WallMoveReweldService';

const WELD_TOL = 0.5;

/**
 * The founder's topology, reduced to the two facts that produce the outcome:
 * a subject that MOVED, and a partner whose endpoint is OFF the subject's
 * pre-move line and ON its post-move line.
 *
 * The subject slides +2 m in x. `p-follower` sits at x = 2 — i.e. exactly on
 * where the subject is GOING and 2 m from where it WAS. That is precisely the
 * state a prior weld authority leaves behind, and it is indistinguishable, from
 * inside this engine, from a partner that was always there. That
 * indistinguishability is the whole point of the assertions below.
 */
const subject = {
    id: 'subject',
    prevBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 4 }],
    newBaseLine: [{ x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 4 }],
} as unknown as Parameters<typeof computeMoveReweldCensus>[0];

const follower = {
    id: 'p-follower',
    baseLine: [{ x: 2, y: 0, z: 4 }, { x: 6, y: 0, z: 4 }],
    declared: true,
} as unknown as Parameters<typeof computeMoveReweldCensus>[1][number];

function alreadyWelded(): MoveReweldNotApplicable {
    const census = computeMoveReweldCensus(subject, [follower], { weldTol: WELD_TOL });
    const n = census.notApplicable.find(
        x => x.reason === 'PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT',
    );
    expect(
        n,
        'fixture drift: this topology must still produce PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT — ' +
        `got [${census.notApplicable.map(x => `${x.partnerId}:${x.reason}`).join(', ')}]`,
    ).toBeDefined();
    return n!;
}

describe('§WELD52 §THE-MEASUREMENT — the outcome and its numbers are unchanged', () => {
    it('§CONTROL: the disposition is a not-applicable at 0 mm against a 500 mm tolerance', () => {
        const n = alreadyWelded();

        // CONTROL. The fix is editorial; if any of these three move, the fix has
        // spent geometry to buy a sentence and must be rejected.
        expect(n.reason).toBe('PARTNER_ALREADY_WELDED_TO_NEW_SEGMENT');
        expect(n.measuredMm, 'the partner endpoint is EXACTLY on the new line').toBe(0);
        expect(n.limitMm, 'the C83 §10.3 pair — measured against the weld tolerance').toBe(500);
    });

    it('§CONTROL: it is still a not-applicable and NOT a refusal', () => {
        const census = computeMoveReweldCensus(subject, [follower], { weldTol: WELD_TOL });
        expect(census.refusals, 'a closed join must never print as a refusal').toHaveLength(0);
        expect(census.entries, 'nothing to re-weld ⇒ no entry').toHaveLength(0);
    });

    it('§CONTROL: the sentence still carries both numbers', () => {
        // §L-921 — a diagnostic without its two numbers is an opinion.
        expect(summariseNotApplicable(alreadyWelded())).toContain('(0/500 mm)');
    });
});

describe('§WELD52 §NO-VERDICT — the sentence may not name a cause it cannot observe', () => {
    /**
     * `MoveReweldPartner` (WallMoveReweld.ts:90) carries a CURRENT baseline and
     * NO pre-gesture pose. So three different worlds produce the identical
     * measurement:
     *
     *   1. the partner never left the subject's new line,
     *   2. the subject slid onto a stationary partner,
     *   3. an EARLIER weld authority moved the partner onto the new line during
     *      THIS gesture — which is what actually happened in `bc3aa61b`.
     *
     * An engine that cannot separate three causes may not assert a fourth.
     */
    it('§NO-VERDICT: it does not assert a render / invalidation / mesh-cache defect', () => {
        const s = summariseNotApplicable(alreadyWelded());

        // The exact clause that cost the hour, as it shipped. Its ABSENCE is the fix.
        expect(
            s,
            'the sentence must not conclude that the defect is downstream of the cascade — ' +
            'it measured nothing downstream of the cascade',
        ).not.toMatch(/defect is DOWNSTREAM of this cascade/i);

        // ⚠ The WORDS may still appear — the sentence now warns the reader OFF
        // that inference by name, which is more useful than silence. What is
        // forbidden is the ASSERTION. Pinned as a count of unhedged claims.
        const assertsDownstreamCause =
            /the defect is (?:DOWNSTREAM|in (?:render|the renderer|invalidation|the mesh cache))/i.test(s);
        expect(assertsDownstreamCause, `unhedged downstream verdict in: ${s}`).toBe(false);
    });

    it('§NO-VERDICT: it states that the AUTHOR of the weld is not measured here', () => {
        const s = summariseNotApplicable(alreadyWelded());
        expect(
            s.toUpperCase(),
            'the sentence must concede that it does not know who closed the join',
        ).toContain('NOT MEASURED');
    });

    it('§SAY-WHAT-YOU-MEASURED: it states the measurement it actually took', () => {
        const s = summariseNotApplicable(alreadyWelded());
        // Both halves of the finding: ON the new line, and NOT on the pre-move one.
        expect(s).toMatch(/NEW line/);
        expect(s, 'the second measurement is half the finding (§WD32-DECLARED-JOIN)')
            .toMatch(/PRE-move line/i);
    });
});

describe('§WELD52 §NAMES-THE-CANDIDATE — the one authority that IS evidenced', () => {
    /**
     * The engine cannot observe who welded. But the ORDERING is DECLARED, in
     * `engineLauncher.ts` §03, in as many words:
     *
     *   "Constructed AFTER the slab service so its subscriber runs second:
     *    corner welds land first, and already-seated partners fall below
     *    computeMoveReweld's displacement floor (no re-write)."
     *
     * and `WallStore.subscribe` is FIFO (`:1725` push, `:1769` for-of). So on a
     * slab-loop corner this outcome is the DESIGNED result of a declared
     * ordering. That is a place to LOOK, with its evidence — offered, never
     * asserted as the verdict.
     */
    it('§NAMES-THE-CANDIDATE: it points at the other weld authority, not at the renderer', () => {
        const s = summariseNotApplicable(alreadyWelded());
        expect(
            s,
            'the first place to look is the service that welds FIRST on the same gesture',
        ).toContain('SlabWallConnectivityService');
    });

    it('§NAMES-THE-CANDIDATE: it cites the site where the ordering is declared', () => {
        const s = summariseNotApplicable(alreadyWelded());
        // A named candidate without its evidence is a rumour.
        expect(s).toMatch(/engineLauncher/i);
    });
});

describe('§WELD52 §PARTITION — the neighbouring outcomes are untouched', () => {
    it('§PARTITION: only this one reason-code sentence changed', () => {
        // A guest-side T is a REAL loss and must keep its ⛔ and its own text —
        // this fix must not bleed into the outcome next to it (L-10800).
        const guestBroken = summariseNotApplicable({
            partnerId: 'p', reason: 'SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE',
            measuredMm: 1200, limitMm: 500,
        } as unknown as MoveReweldNotApplicable);
        expect(guestBroken).toContain('⛔');
        expect(guestBroken).toContain('NOTHING WAS DONE ABOUT IT');

        const intact = summariseNotApplicable({
            partnerId: 'p', reason: 'SUBJECT_GUEST_JOIN_INTACT',
            measuredMm: 0, limitMm: 500,
        } as unknown as MoveReweldNotApplicable);
        expect(intact).toContain('CLOSED IN THE STORE');
        expect(intact, 'the untouched sentences must not acquire the new caveat')
            .not.toContain('SlabWallConnectivityService');
    });
});
