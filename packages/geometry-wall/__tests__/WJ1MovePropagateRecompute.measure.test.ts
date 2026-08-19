/**
 * WJ1 — MOVE → PROPAGATE → RECOMPUTE, measured across every non-plain wall variant.
 *
 * **Founder, verbatim:** *"no matter if the wall is curved, raked, curved-raked, layered
 * etc., MOVE → PROPAGATE → RECOMPUTE should always work and always be sound — this is
 * especially important for the WALL JOINTS."*
 *
 * L-1066 closed the corner and said what it had NOT done: *"MOVE-time reweld × any
 * non-plain variant remains entirely unmeasured … the founder's sentence names
 * MOVE → PROPAGATE → RECOMPUTE, and only RECOMPUTE is measured here."* This file measures
 * the other two.
 *
 * ── THE THREE STAGES ARE THREE DIFFERENT MECHANISMS, AND THAT IS WHY THEY GET THREE
 *    SEPARATE READINGS ──────────────────────────────────────────────────────────────
 *
 * ⭐ The memory this repo keeps is *verification ≠ dispatch ≠ rendering*: a fix that is
 *   correct at one of them and absent at the next reads as "working" from either side.
 *   The same split applies here and the stages fail differently.
 *
 *   **MOVE** — the moved wall's own body follows its new baseline. A curved wall's body is
 *     rebuilt from the arc, a raked one re-sheared. Failure mode: the body stays where it
 *     was, or loses its shape (a cone that straightens, a profile that reverts).
 *   **PROPAGATE** — `computeMoveReweld` proposes new baselines for the partners that were
 *     welded to the old segment. Failure mode: it proposes NOTHING and the joint simply
 *     opens; or it proposes something derived from the wrong geometry.
 *   **RECOMPUTE** — `WallJoinResolver.resolveLevel` re-mitres, and the bodies close. This
 *     is the ONLY stage the existing curved/raked suites measure.
 *
 * ⛔ **PROPAGATE IS THE ONE WITH A STRUCTURAL SUSPICION AGAINST IT, and it is named here
 *    before it is measured so the reading cannot be mistaken for a discovery made after
 *    the fact.** `computeMoveReweld` is a PURE engine over `[start, end]` baselines and a
 *    thickness. It has no `curve`, no `rakeAngleDeg`, no `layers` and no `wallProfile` in
 *    its input types at all. For a CURVED wall the baseline is the CHORD while the body is
 *    the ARC, and the two agree only at the endpoints — so a corner solved by intersecting
 *    chords is not obviously the corner the arcs make. Whether that matters is exactly what
 *    this file is for.
 *
 * ── THE NON-VACUITY GUARD IS THE WHOLE DESIGN ─────────────────────────────────────
 *
 * ⭐ "The joint is closed after the move" proves nothing on its own: it is also true of a
 *   move that did not happen. Every row therefore reports THREE joint readings — before the
 *   move, after the move with NO propagation, and after the move WITH propagation — and the
 *   middle one must be OPEN. A variant whose un-propagated reading is already closed has
 *   not been tested by the propagated one, and is reported as such rather than counted.
 */

import { describe, it, expect } from 'vitest';
import {
    COINCIDENT_M, RAKE, VERT, mk, measure, record, dump, setDumpFile, makeA,
    type Cell, type Kind,
} from './support/wallJointHarness';
import { computeMoveReweldCensus, type ReweldBaseline } from '../src/WallMoveReweld';
import type { WallData } from '../src/WallTypes';

setDumpFile('wj1-move-propagate-recompute.txt');

const blOf = (w: WallData): ReweldBaseline =>
    [{ ...w.baseLine[0] }, { ...w.baseLine[1] }] as ReweldBaseline;

/** The same wall with its baseline replaced — a MOVE, as the command would commit it. */
function movedBy(w: WallData, dx: number, dz: number): WallData {
    return {
        ...w,
        baseLine: [
            { ...w.baseLine[0], x: w.baseLine[0].x + dx, z: w.baseLine[0].z + dz },
            { ...w.baseLine[1], x: w.baseLine[1].x + dx, z: w.baseLine[1].z + dz },
        ],
        // A curved wall's control point is part of its shape, not of its position: a MOVE
        // must carry it, or the "moved" wall is a differently-shaped wall and every
        // reading below is about the wrong thing.
        ...((w as { curve?: { control: { x: number; y: number; z: number }; segments: number } }).curve
            ? {
                curve: {
                    ...(w as never as { curve: { control: { x: number; y: number; z: number }; segments: number } }).curve,
                    control: {
                        x: (w as never as { curve: { control: { x: number } } }).curve.control.x + dx,
                        y: (w as never as { curve: { control: { y: number } } }).curve.control.y,
                        z: (w as never as { curve: { control: { z: number } } }).curve.control.z + dz,
                    },
                },
            }
            : {}),
        _renderVersion: ((w as { _renderVersion?: number })._renderVersion ?? 0) + 1,
    } as unknown as WallData;
}

/** The partner with its baseline replaced by a proposal — PROPAGATE, applied. */
function withBaseline(w: WallData, b: ReweldBaseline): WallData {
    return {
        ...w,
        baseLine: [{ ...b[0] }, { ...b[1] }],
        _renderVersion: ((w as { _renderVersion?: number })._renderVersion ?? 0) + 1,
    } as unknown as WallData;
}

interface Row {
    label: string;
    before: Cell;
    /** After the move, with NO propagation. MUST be open, or the row proves nothing. */
    unpropagated: Cell;
    after: Cell;
    /** How many baselines PROPAGATE proposed. 0 is the L-871 defect shape. */
    proposed: number;
    refusals: string[];
    /**
     * ⚠ THE CENSUS IS READ, NOT THE PLAN, AND THE FIRST DRAFT LOST EVIDENCE BY NOT DOING
     *   SO. `computeMoveReweldPlan` returns entries + refusals and DROPS the
     *   NOT-APPLICABLE list. The control row came back *"proposed 0, refusals: none"* — a
     *   silence that reads as a crash and was in fact a considered verdict the plan shape
     *   could not carry. Refusal ≠ emptiness (C71 §4.4) applies to the INSTRUMENT too.
     */
    notApplicable: string[];
}

/**
 * One full MOVE → PROPAGATE → RECOMPUTE cycle at an L corner.
 *
 * A is the variant under test and runs +X from the origin; B is a plain raked neighbour
 * running +Z from the shared corner. **A MOVES** — so the variant is the SUBJECT of the
 * move, which is the harder and more interesting direction: a plain wall following a
 * curved wall's move is the case where the chord-vs-arc question actually bites.
 */
function cycle(label: string, aKind: Kind, aRake: number, dx: number, dz: number): Row {
    const A = makeA(aKind, [0, 0], [5, 0], aRake);
    // ⚠ B MATCHES A's RAKE, and the first draft did not — it pinned B at 80° against every
    //   subject, so the `CURVED vertical` row read `topSep 0.406` BEFORE the move had even
    //   happened. That is the L-1060 open corner between a vertical wall and a leaning one:
    //   a real reading, about a different question, arriving as a control failure. A
    //   control must isolate the variable under test, and the variable here is the MOVE.
    const B = makeA('plain', [0, 0], [0, 5], aRake);

    const before = measure(A, B);

    const A2 = movedBy(A, dx, dz);
    const unpropagated = measure(A2, B);

    const plan = computeMoveReweldCensus(
        { id: A.id, prevBaseLine: blOf(A), newBaseLine: blOf(A2), thickness: A.thickness },
        // The junction metadata the `joinedTo` edge carries. Threaded, never re-derived —
        // §C83 §10.6's safety argument is a statement about PARTICIPANT COUNT, and a
        // mutual corner and a terminating corner are the same picture.
        [{ id: B.id, baseLine: blOf(B), junctionType: 'L', junctionDegree: 2 }],
    );

    const entry = plan.entries.find(e => e.wallId === B.id);
    const B2 = entry ? withBaseline(B, entry.newBaseLine) : B;
    const after = measure(A2, B2);

    return {
        label,
        before, unpropagated, after,
        proposed: plan.entries.length,
        refusals: plan.refusals.map(r => `${r.partnerId ?? '?'}:${r.reason}`),
        notApplicable: (plan.notApplicable ?? []).map(r => `${r.partnerId ?? '?'}:${r.reason}`),
    };
}

const VARIANTS: ReadonlyArray<readonly [string, Kind, number]> = [
    ['plain VERTICAL (control)', 'plain', VERT],
    ['plain RAKED', 'plain', RAKE],
    ['LAYERED raked', 'layered3', RAKE],
    ['raked + WINDOW', 'plain+window', RAKE],
    ['raked + DOOR', 'plain+door', RAKE],
    ['CURVED vertical', 'curved', VERT],
    ['CURVED raked', 'curved', RAKE],
    ['CURVED layered raked', 'curved+layered3', RAKE],
    ['CURVED raked + WINDOW', 'curved+window', RAKE],
];

describe('WJ1 — MOVE → PROPAGATE → RECOMPUTE, every non-plain variant', () => {
    const rows: Row[] = [];

    it('the matrix, and it is the artefact', () => {
        for (const [label, kind, rake] of VARIANTS) {
            // ⭐ LATERAL, NOT AXIAL, and the reason is a real property of the engine rather
            //   than a convenience. Sliding A along its OWN axis puts the re-solved corner
            //   1 m BEHIND A's new start — off the moved segment entirely — and
            //   `computeMoveReweld` declines by design (*"a wall that slid away along its
            //   own axis has no re-formable corner there, and extending the partner toward
            //   empty air is wrong"*). That decline is CORRECT and is asserted separately
            //   below; using it as the main fixture would have measured the guard instead
            //   of the variants.
            const r = cycle(label, kind, rake, 0, 1);
            rows.push(r);
            const n = (v: number) => (Number.isFinite(v) ? v.toExponential(3) : '   -   ');
            record(
                `${label.padEnd(26)} PROPOSED=${r.proposed}`,
                r.after,
            );
            // eslint-disable-next-line no-console
            console.log(
                `  ${label.padEnd(26)} | before sep ${n(r.before.baseSep)}/${n(r.before.topSep)}` +
                ` | UNPROP sep ${n(r.unpropagated.baseSep)}/${n(r.unpropagated.topSep)}` +
                ` | after sep ${n(r.after.baseSep)}/${n(r.after.topSep)}` +
                ` | proposed ${r.proposed}` +
                (r.refusals.length ? ` | refusals ${r.refusals.join(',')}` : '') +
                (r.notApplicable.length ? ` | n/a ${r.notApplicable.join(',')}` : ''),
            );
        }
        dump('WJ1: MOVE → PROPAGATE → RECOMPUTE');
        expect(rows).toHaveLength(VARIANTS.length);
    });

    it('STAGE 0 — CONTROL: every variant starts CLOSED, or nothing below means anything', () => {
        for (const r of rows) {
            expect(r.before.baseSep, `${r.label}: closed at the floor before the move`)
                .toBeLessThan(COINCIDENT_M);
            expect(r.before.topSep, `${r.label}: closed at the top before the move`)
                .toBeLessThan(COINCIDENT_M);
        }
    });

    it('⭐ THE NON-VACUITY GUARD — without PROPAGATE the move OPENS the joint', () => {
        // Without this, "closed after the move" is also true of a move that did not happen,
        // and every assertion in the next test is satisfied by a builder that ignores the
        // move entirely. The 1 m displacement must be VISIBLE as a gap.
        for (const r of rows) {
            expect(r.unpropagated.baseSep, `${r.label}: the un-propagated move leaves a gap`)
                .toBeGreaterThan(0.1);
        }
    });

    it('STAGE 2 — PROPAGATE proposes a baseline for EVERY variant', () => {
        // The L-871 defect shape is PROPOSED = 0: the engine declines, the partner never
        // moves, the room loop opens and REDETECT_ROOMS destroys a room on a MOVE. A
        // variant that silently proposes nothing is that defect wearing a wall shape.
        for (const r of rows) {
            expect(
                r.proposed,
                `${r.label}: proposed ${r.proposed} | refusals: ${r.refusals.join(',') || 'none'}` +
                ` | n/a: ${r.notApplicable.join(',') || 'none'}`,
            ).toBeGreaterThan(0);
        }
    });

    /**
     * ⭐ THE GUARD THAT DECLINES, ASSERTED AS A GUARD — because a decline and a crash are
     * the same silence from outside, and this one is CORRECT.
     *
     * Sliding a wall along its OWN axis moves the re-solved corner off the new segment.
     * `computeMoveReweld` refuses rather than extending the partner toward empty air, and
     * that refusal is one of its named scars. This asserts the refusal is REACHED and
     * REPORTED for a non-plain subject too — a variant that fell out of the engine's
     * classification would produce the same zero with nothing said about it.
     */
    it('an AXIAL slide is DECLINED with a stated reason, on every variant', () => {
        for (const [label, kind, rake] of VARIANTS) {
            const r = cycle(label, kind, rake, 1, 0);
            expect(r.proposed, `${label}: axial slide proposes nothing`).toBe(0);
            expect(
                r.refusals.length + r.notApplicable.length,
                `${label}: and SAYS WHY — silence is the defect, not the zero`,
            ).toBeGreaterThan(0);
        }
    });

    it('STAGE 3 — RECOMPUTE closes the joint again, at the FLOOR and at the TOP', () => {
        for (const r of rows) {
            expect(r.after.baseSep, `${r.label}: re-closed at the floor`)
                .toBeLessThan(COINCIDENT_M);
            expect(r.after.topSep, `${r.label}: re-closed at the top`)
                .toBeLessThan(COINCIDENT_M);
            expect(Math.abs(r.after.openUp), `${r.label}: and does not OPEN with height`)
                .toBeLessThan(COINCIDENT_M);
        }
    });

    it('STAGE 1 — the MOVED wall keeps its SHAPE: a cone stays a cone, a lean stays a lean', () => {
        // The stage that a joint reading cannot see. Two walls that both collapsed to
        // upright boxes would close perfectly. Measured as the body's own lean, before and
        // after, on the variants that have one.
        for (const [label, kind, rake] of VARIANTS) {
            if (rake === VERT) continue;
            const A = makeA(kind, [0, 0], [5, 0], rake);
            const far = () => mk([50, 50], [55, 50], { rake: VERT });
            const beforeLean = measure(A, far()).leanA;
            const afterLean = measure(movedBy(A, 1, 0), far()).leanA;
            expect(beforeLean, `${label}: leans before the move`).toBeGreaterThan(0.1);
            expect(afterLean, `${label}: leans by the SAME amount after`)
                .toBeCloseTo(beforeLean, 6);
        }
    });
});

/**
 * §WJ1-MOVE-PROPAGATE-BLANKS — declared, not discovered.
 *
 *  1. **The PROPAGATE stage is exercised through the PURE ENGINE, not through
 *     `WallMoveReweldService`.** The service adds the store subscription, the `joinedTo`
 *     graph query, the cascade command and three re-entrancy latches — none of which this
 *     file constructs. So this measures *"does the engine produce the right baseline for
 *     this variant"*, NOT *"does a user's drag reach the engine"*. The second question is
 *     `WallMoveJunctionReweld.measure.test.ts`'s, and it is a DIFFERENT question — the
 *     committed-≠-reachable split this repo has been caught by before.
 *  2. **One neighbour, one topology.** L corners only, one partner, a 1 m axial move.
 *     T-stems under a variant move, and three-wall junctions, are not measured here.
 *  3. **The CHORD-vs-ARC suspicion is measured only by its OUTCOME.** If a curved row is
 *     green, the chord-solved corner was good enough at this displacement — that is not the
 *     same as proving it is good enough at every displacement or curvature. A curvature
 *     sweep would be the honest generalisation.
 *  4. **`_sourceBaseLine` is not maintained across the synthetic move.** The real command
 *     path carries it; this file replaces `baseLine` only.
 */
