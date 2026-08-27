/**
 * §CWWELD169 (L-12800..) — pure-engine arms for `computeCurtainWallMoveReweldCensus`.
 *
 * These pin the two CW↔CW shapes the engine closes (mutual corner, dependent
 * stem) and the one it deliberately declines (subject-as-guest), independent
 * of any store/command wiring — the integration-level "his failure" repro
 * lives in `packages/command-registry/__tests__/CWWELD169CurtainWallCornerReweld.test.ts`.
 */
import { describe, it, expect } from 'vitest';
import {
    computeCurtainWallMoveReweldCensus,
    type CurtainMoveReweldMovedWall,
    type CurtainMoveReweldPartner,
} from '../src/CurtainWallMoveReweld';

function moved(prev: [[number, number], [number, number]], next: [[number, number], [number, number]]): CurtainMoveReweldMovedWall {
    return {
        id: 'subject',
        prevBaseLine: [{ x: prev[0][0], y: 0, z: prev[0][1] }, { x: prev[1][0], y: 0, z: prev[1][1] }],
        newBaseLine:  [{ x: next[0][0], y: 0, z: next[0][1] }, { x: next[1][0], y: 0, z: next[1][1] }],
    };
}
function partner(id: string, a: [number, number], b: [number, number]): CurtainMoveReweldPartner {
    return { id, baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }] };
}

describe('§CWWELD169 — MUTUAL CORNER (degree 2, endpoint-to-endpoint)', () => {
    it('re-seats the partner endpoint that shared the subject\'s pre-move corner onto the new corner', () => {
        // Subject runs (0,0)-(0,6) [north-south]; partner runs (0,6)-(8,6) [east-west],
        // sharing the corner at (0,6). Subject's far end (0,6) moves to (0,6.282) —
        // the founder's ~282mm gap — and the corner must follow.
        const m = moved([[0, 0], [0, 6]], [[0, 0], [0, 6.282]]);
        const p = partner('cw-north', [0, 6], [8, 6]);
        const plan = computeCurtainWallMoveReweldCensus(m, [p]);

        expect(plan.refusals).toHaveLength(0);
        expect(plan.entries).toHaveLength(1);
        const e = plan.entries[0]!;
        expect(e.curtainWallId).toBe('cw-north');
        expect(e.role).toBe('dependent-stem');
        // The (0,6) end followed to (0,6.282); the far end (8,6) is untouched.
        expect(e.newBaseLine[0]).toEqual({ x: 0, y: 0, z: 6.282 });
        expect(e.newBaseLine[1]).toEqual({ x: 8, y: 0, z: 6 });
    });

    it('a THIRD curtain wall sharing the same corner makes the junction AMBIGUOUS — refused, not guessed', () => {
        const m = moved([[0, 0], [0, 6]], [[0, 0], [0, 6.282]]);
        const p1 = partner('cw-north', [0, 6], [8, 6]);
        const p2 = partner('cw-diag', [0, 6], [4, 10]); // also meets at (0,6)
        const plan = computeCurtainWallMoveReweldCensus(m, [p1, p2]);
        expect(plan.entries).toHaveLength(0);
        expect(plan.refusals.length).toBeGreaterThan(0);
        expect(plan.refusals.every(r => r.reason === 'CURTAIN_AMBIGUOUS_JUNCTION')).toBe(true);
    });
});

describe('§CWWELD169 — DEPENDENT STEM (mid-span T, the founder\'s measured shape)', () => {
    it('re-seats a partner whose endpoint terminates MID-SPAN on the subject\'s body, preserving its station', () => {
        // Subject (host) runs (0,0)-(10,0). Partner (guest) terminates at (4,0) —
        // 40% along the host — running north to (4,5). Host translates +2 in z.
        const m = moved([[0, 0], [10, 0]], [[0, 2], [10, 2]]);
        const p = partner('cw-stem', [4, 0], [4, 5]);
        const plan = computeCurtainWallMoveReweldCensus(m, [p]);

        expect(plan.refusals).toHaveLength(0);
        expect(plan.entries).toHaveLength(1);
        const e = plan.entries[0]!;
        expect(e.curtainWallId).toBe('cw-stem');
        // Station preserved at t=0.4 along the NEW host segment → (4, 2).
        expect(e.newBaseLine[0].x).toBeCloseTo(4, 6);
        expect(e.newBaseLine[0].z).toBeCloseTo(2, 6);
        expect(e.newBaseLine[1]).toEqual({ x: 4, y: 0, z: 5 });
    });

    it('a stem endpoint NOT welded to the subject\'s old body is left alone (notApplicable, not an entry)', () => {
        const m = moved([[0, 0], [10, 0]], [[0, 2], [10, 2]]);
        const p = partner('cw-far', [4, 3], [4, 8]); // 3m off the host — not welded
        const plan = computeCurtainWallMoveReweldCensus(m, [p]);
        expect(plan.entries).toHaveLength(0);
        expect(plan.notApplicable).toHaveLength(1);
        expect(plan.notApplicable[0]!.reason).toBe('CURTAIN_NOT_WELDED_TO_SUBJECT_PREV_SEGMENT');
    });
});

describe('§CWWELD169 — declined by name: the subject is itself the guest', () => {
    it('when the SUBJECT\'s own endpoint was on a stationary partner\'s body and the move pulls it off, '
        + 'the engine reports CURTAIN_SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE and creates no entry for it', () => {
        // Partner (host) runs (0,0)-(10,0), stationary. Subject used to terminate
        // AT (4,0) — mid-span on the partner — running north; it then moves away.
        const m = moved([[4, 0], [4, 5]], [[4, 3], [4, 8]]);
        const p = partner('cw-host', [0, 0], [10, 0]);
        const plan = computeCurtainWallMoveReweldCensus(m, [p]);
        expect(plan.entries).toHaveLength(0);
        const broken = plan.notApplicable.filter(n => n.reason === 'CURTAIN_SUBJECT_GUEST_JOIN_BROKEN_BY_MOVE');
        expect(broken).toHaveLength(1);
        expect(broken[0]!.partnerId).toBe('cw-host');
    });
});

describe('§CWWELD169 — guard rails', () => {
    it('refuses a reseat that would collapse the partner below the minimum curtain-wall stub length', () => {
        // Partner is only 0.1m beyond the corner — any follow shortens it below 0.15m.
        const m = moved([[0, 0], [0, 6]], [[0, 0], [0, 6.05]]);
        const p = partner('cw-tiny', [0, 6], [0.1, 6]); // 0.1m long
        const plan = computeCurtainWallMoveReweldCensus(m, [p]);
        expect(plan.entries).toHaveLength(0);
        expect(plan.refusals.some(r => r.reason === 'CURTAIN_STUB_TOO_SHORT')).toBe(true);
    });

    it('refuses a reseat beyond the extension cap', () => {
        const m = moved([[0, 0], [0, 6]], [[0, 0], [0, 6.1]]); // subject moves 0.1m
        const p = partner('cw-north', [0, 6], [8, 6]);
        // maxExtension explicitly tiny — smaller than what the follow requires is impossible
        // here (both are ~0.1m), so force a cap that is clearly exceeded instead.
        const plan = computeCurtainWallMoveReweldCensus(m, [p], { maxExtension: 0.01 });
        expect(plan.entries).toHaveLength(0);
        expect(plan.refusals.some(r => r.reason === 'CURTAIN_EXTENSION_CAP_EXCEEDED')).toBe(true);
    });

    it('an identical prev/new baseline (property-only update) reseats to the SAME point — a harmless '
        + 'no-op the engine does not need to special-case; filtering the event before it reaches this '
        + 'engine (MIN_CURTAIN_MOVE_M) is the SERVICE\'s job, mirroring WallMoveReweldService\'s own gate', () => {
        const m = moved([[0, 0], [0, 6]], [[0, 0], [0, 6]]);
        const p = partner('cw-north', [0, 6], [8, 6]);
        const plan = computeCurtainWallMoveReweldCensus(m, [p]);
        expect(plan.entries).toHaveLength(1);
        expect(plan.entries[0]!.newBaseLine).toEqual(plan.entries[0]!.prevBaseLine);
    });
});
