/**
 * §L-921-ATOMIC-GESTURE — ask the move-reweld cascade BEFORE the wall moves.
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE (founder-reported, deploy `023d903a`) ────
 *
 * A wall move and the junction re-weld that repairs its neighbours are ONE
 * gesture to the user and TWO commands to the model, in this order:
 *
 *   UpdateWallBaselineCommand.execute()
 *     └─ wallStore.update()                       ← THE BASELINE IS COMMITTED
 *          └─ (synchronous subscriber)
 *             WallMoveReweldService.onWallUpdated()
 *               └─ CascadeWallBaselineCommand.canExecute()  ← may REFUSE
 *
 * The cascade is a store SUBSCRIBER. It runs *inside* the write it is reacting
 * to, it does not throw, and `UpdateWallBaselineCommand.execute()` returns
 * `{ success: true }` regardless. So the command cannot see the refusal — there
 * is no branch to fix, and the absence IS the finding
 * (§MEASURED-HALF-EXECUTED, `apps/editor/__tests__/wallMoveAcceptHalfExecuted.test.ts`,
 * which pins the measured consequence at an open L junction of **2096 mm**).
 *
 * The result is a HALF-EXECUTED GESTURE: the wall moves, the repair refuses,
 * the partners keep standing at the old junction, and the user is told nothing.
 * C78/C70 are explicit that one gesture is one atomic unit — a move whose
 * dependent cascade refuses must either not happen at all or report what it
 * left unrepaired. It may not half-apply, know it, and stay quiet.
 *
 * ── WHY A PRE-FLIGHT, AND WHY HERE ───────────────────────────────────────────
 *
 * Making the pair atomic *after* the write means unwinding a committed baseline
 * plus its opening re-seats plus its `_renderVersion` bumps from inside a
 * subscriber — a rollback with more failure modes than the defect. Asking the
 * question BEFORE the write costs one predicate evaluation and cannot leave a
 * partial state at all.
 *
 * This module answers exactly one question: *if wall W moved from A to B, would
 * the re-weld cascade refuse, and with what?* It answers it by **building the
 * real `CascadeWallBaselineCommand` and calling its real `canExecute`** — not by
 * re-deriving the rule. A second copy of an opening-fit predicate is precisely
 * the drift this codebase keeps paying for, so there is none here: every reason
 * code and every number in the result was produced by the command that will
 * later refuse.
 *
 * ── FAITHFULNESS, STATED RATHER THAN ASSUMED ─────────────────────────────────
 *
 * A pre-flight is only worth having if it gives the SAME verdict the real
 * cascade will give. Two things make that true rather than hopeful:
 *
 *  1. **Partners are read as of BEFORE the move** — which is what the service
 *     does too: it reads `joinedTo` at event time, when the graph still
 *     describes the pre-move topology (§CONNECT-3). Same inputs, same answer.
 *
 *  2. **The mover is presented at its NEW baseline.** `canExecute`'s C83 arm
 *     judges each entry against `wallStore.getAll()`, so a store still holding
 *     the mover at its OLD position would answer a different question. This
 *     module therefore hands the command a SHIM store that returns the mover
 *     with `newBaseLine` and every other wall verbatim. Without the shim the
 *     pre-flight would be a plausible-looking approximation, which is worse
 *     than none: it would disagree with the real cascade exactly in the corner
 *     cases the gate exists for.
 *
 * REFUSAL ≠ EMPTINESS (C71 §4.4). `entries.length === 0` here means "this move
 * breaks no junction that can be re-welded", which is a POSITIVE ok — the same
 * reading `WallMoveReweldService` gives it. It is never conflated with refusal.
 */

import { trace, type Tracer } from '@opentelemetry/api';
import type { Point3D } from '@pryzm/core-app-model';
import {
    computeMoveReweldPlan,
    describeReweldRefusal,
    DEFAULT_SNAP_RADIUS,
    type WallData,
} from '@pryzm/geometry-wall';
import {
    CascadeWallBaselineCommand,
    type CascadeWallBaselineEntry,
} from './CascadeWallBaselineCommand';
import type { CommandContext } from '../types';

// P8 / C10 §2 — every exported function carries ≥ 1 OTel span. Same tracer-name
// idiom as `SeatingDatumResolver.ts` / `roomBoundarySketch.ts` in this package.
function _tracer(): Tracer {
    return trace.getTracer('@pryzm/command-registry');
}

/** The three reads this pre-flight needs. Structural, so any store satisfies it. */
export interface PreflightWallStoreRef {
    getById(id: string): WallData | undefined;
    getAll(): WallData[];
    getByLevel?(levelId: string): WallData[];
}

export interface MoveReweldPreflightInput {
    readonly wallStore: PreflightWallStoreRef;
    readonly wallId: string;
    /** Where the wall stands now. */
    readonly prevBaseLine: readonly [Point3D, Point3D];
    /** Where it is proposed to go. */
    readonly newBaseLine: readonly [Point3D, Point3D];
    /**
     * The `joinedTo` partners, when the caller can resolve them. `null` or
     * omitted ⇒ fall back to a same-level scan and let `computeMoveReweld`'s
     * weld tolerance decide geometrically — the SAME fallback, for the same
     * stated reason, as `WallMoveReweldService` (C71 §4.4: "no answer" is not
     * "joins nothing").
     */
    readonly joinedWallIds?: readonly string[] | null;
    /**
     * §C83 §10.6 — the per-partner junction DISCRIMINATOR, from the same
     * `getJoinedWalls` call that produced `joinedWallIds`.
     *
     * ⚠ L-942 SHIPPED TWICE BECAUSE THIS FIELD DID NOT EXIST. The first fix
     * threaded the discriminator into `WallMoveReweldService` and proved the
     * follow at that layer — but the GATE builds its own partner list, from this
     * input, and the user's gesture goes through the GATE. So `isMutualCorner`
     * read false on every real move, every mutual corner was scored an
     * incumbent, and production stayed hard-blocked while the service-layer
     * tests were green. **`committed ≠ reachable`, at the one layer that
     * decides whether the gesture happens.**
     *
     * ABSENT ⇒ DO NOT FOLLOW (§10.6.3 #1), same as everywhere else: the
     * level-scan fallback below resolves partners geometrically and has no
     * junction records, so it must behave byte-identically to pre-§10.6.
     */
    readonly junctions?: readonly {
        readonly wallId: string;
        readonly junctionType?: 'L' | 'T' | 'Y' | 'X' | 'N-WAY';
        readonly junctionDegree?: number;
    }[] | null;
    readonly weldTol?: number;
}

export interface MoveReweldPreflightResult {
    /**
     * THE DECISION. `ok && !incumbentBreach`. Callers gate on this and nothing
     * else — two refusal arms with one answer, so the gate and the chat accept
     * path cannot drift into disagreeing about whether a move may proceed.
     */
    readonly allowed: boolean;
    /** false ⇒ the cascade WILL refuse; the caller must not commit the move. */
    readonly ok: boolean;
    /**
     * §C83 §10.2.2 — the non-subject walls this re-weld would re-baseline.
     *
     * *"A re-weld MUST NOT close a joint by moving a non-subject wall's
     * baseline"* (minted 2026-08-15 from the founder's §JOINT-AUTHORITY-IS-THE-
     * INCUMBENT: *"The perimeter wall joints NEVER should be changed after
     * creation… the 3rd wall needs to ADAPT and connect with the FACE of the
     * wall originally there"*). L-922 is this violated on the MOVE path: an
     * interior wall was moved and the cascade shifted the PERIMETER's baseline
     * start ~2.19 m, proven by three hosted doors re-seated by the same delta —
     * one of them clamped to offset 0.000, which is §10.2.4's named example of a
     * clamp standing where a refusal belongs.
     *
     * `computeMoveReweld` emits two kinds of entry: seats for the MOVED wall's
     * own endpoints (the subject adapting — permitted, indeed required) and
     * re-baselines of its PARTNERS (incumbents — forbidden). Only the second
     * kind lands here.
     */
    readonly incumbentWallIds: readonly string[];
    /** True ⇒ forbidden by C83 §10.2.2 REGARDLESS of `ok`. */
    readonly incumbentBreach: boolean;
    /** How far the largest incumbent would have been shifted. The refusal names it. */
    readonly maxIncumbentShiftMm: number;
    /** The re-welds the move would require. Empty ⇒ it breaks no junction. */
    readonly entries: readonly CascadeWallBaselineEntry[];
    /** The cascade's own reason code, verbatim (e.g. `OPENING_DOES_NOT_FIT`). */
    readonly reason?: string;
    /**
     * The cascade's own `blockingIssues` — where the NUMBERS live (required vs
     * available metres, per opening, per wall). `WallMoveReweldService` drops
     * this array on the floor today; nothing that consumes this result may.
     */
    readonly blockingIssues?: readonly string[];
    /**
     * §L-990 — crossings that were ALREADY STANDING before this gesture.
     *
     * True, user-relevant, and NOT a reason to refuse: the move neither creates
     * nor deepens them. Carried separately from `blockingIssues` for the reason
     * §CONTEXT-DATA-HONESTY states — a fact reported and a fact that refused must
     * never arrive in the same array, or the caller cannot tell which one stopped
     * the gesture.
     */
    readonly preExistingIssues?: readonly string[];
    /** Which wall ids the refused cascade would have re-welded. */
    readonly partnerIds: readonly string[];
    /**
     * ⭐ §L-1571 — THE JUNCTIONS NOBODY WILL REPAIR, WITH THEIR OWN NAMES.
     *
     * ── THE DEFECT THIS CLOSES (founder session 2026-08-20, item 2.1) ────────
     * `computeMoveReweldPlan` emits SIX distinct refusal codes. This module used
     * to map every one of them onto `reason: 'INCUMBENT_EXTENSION_REQUIRED'`,
     * `incumbentBreach: true`, and a `maxIncumbentShiftMm` taken from
     * `refusal.beyondMm` — a field whose MEANING is different for each code. For
     * `AMBIGUOUS_WELD_AUTHORSHIP` it is `axialFromEndM`, i.e. how far along the
     * moved wall the abutment sits. The founder's console therefore read:
     *
     *   "the re-weld would re-baseline 2 non-subject wall(s) by up to 75 mm"
     *
     * and all three of those claims were false. **No wall would be re-baselined**
     * — the engine refused precisely so that none would be. **75 mm is not a
     * shift** — it is an axial position. **The second number was dropped
     * entirely** (C83 §10.3), so nothing said the 75 mm was being compared
     * against a 101 mm band.
     *
     * ── AND THE MISLABEL WAS LOAD-BEARING, NOT COSMETIC ──────────────────────
     * `incumbentBreach` is the exact flag §L-942-UNBLOCK downgrades to
     * report-only. The founder authorised that downgrade for ONE named trade:
     * a neighbour that over-follows, which is *"KNOWN, VISIBLE, UNDOABLE"*. Five
     * other codes rode through the same flag, and their consequence is neither
     * visible nor undoable — it is a junction left permanently open, which
     * `WallJoinResolver` then closes VISUALLY with a bisector mitre while the
     * endpoints do not meet. The laundering is how a decision taken about one
     * defect came to govern five others it was never asked about.
     *
     * ⚠ THIS FIELD CHANGES NO DECISION. `allowed` is computed exactly as before
     * and every caller's branch is byte-identical; what changes is that the
     * report is TRUE. Whether the non-incumbent refusals should also stop the
     * gesture is a C83 §10.6 amendment and the founder's call — see
     * `wallPlacementGate`'s §L-1571 arm, which states it and does not take it.
     */
    readonly unrepairableJunctions: readonly {
        /** The partner whose junction is left open. */
        readonly partnerId: string;
        /** The refusal's OWN code — its identity, never flattened (C71). */
        readonly reason: string;
        /** C83 §10.3 — what was measured, mm, in the unit that code means. */
        readonly measuredMm: number;
        /** C83 §10.3 — what it had to clear, mm. Absent only where the limit is
         *  structurally zero (`INCUMBENT_EXTENSION_REQUIRED`). */
        readonly limitMm?: number;
        /** The sentence a human reads, minted by `describeReweldRefusal` — the
         *  SAME function the post-move service uses, so the pre-flight and the
         *  backstop cannot describe one junction with two stories. */
        readonly sentence: string;
    }[];
}

function moved(a: readonly Point3D[] | undefined): a is readonly [Point3D, Point3D] {
    return !!a && a.length >= 2;
}

/**
 * Would the move-reweld cascade refuse this move? Pure with respect to the
 * model: it reads, it builds a command, it asks `canExecute`, and it never
 * executes anything. Never throws — an unanswerable question returns `ok: true`
 * with empty entries, because a pre-flight that cannot evaluate must not
 * manufacture a refusal (C83 §5.3: a question nobody answered refuses nothing).
 */
export function previewMoveReweld(
    input: MoveReweldPreflightInput,
): MoveReweldPreflightResult {
    return _tracer().startActiveSpan('pryzm.wall.previewMoveReweld', (span) => {
        try {
            const r = _previewMoveReweld(input);
            span.setAttribute('pryzm.wall.id', input.wallId);
            // `allowed` is the DECISION; `ok` and `incumbentBreach` are the two
            // arms it conjoins. All three are emitted separately on purpose — a
            // trace carrying only `allowed` cannot distinguish "the cascade
            // objected" from "the cascade succeeded by shifting an incumbent",
            // and L-922 is precisely the second one wearing the first one's face.
            span.setAttribute('pryzm.preflight.allowed', r.allowed);
            span.setAttribute('pryzm.preflight.ok', r.ok);
            span.setAttribute('pryzm.preflight.incumbentBreach', r.incumbentBreach);
            span.setAttribute('pryzm.preflight.maxIncumbentShiftMm', r.maxIncumbentShiftMm);
            span.setAttribute('pryzm.preflight.entries', r.entries.length);
            span.setAttribute('pryzm.preflight.partners', r.partnerIds.length);
            span.setAttribute('pryzm.preflight.incumbents', r.incumbentWallIds.length);
            // Absent reason on an allowed plan is normal; absent reason on a
            // REFUSED one is a §REFUSAL-IDENTITY defect. Recording presence rather
            // than substituting a sentence keeps the two readable apart.
            span.setAttribute('pryzm.preflight.reasonStated', Boolean(r.reason));
            if (r.reason) span.setAttribute('pryzm.preflight.reason', r.reason);
            return r;
        } finally {
            span.end();
        }
    });
}

function _previewMoveReweld(
    input: MoveReweldPreflightInput,
): MoveReweldPreflightResult {
    const { wallStore, wallId, prevBaseLine, newBaseLine } = input;
    const EMPTY: MoveReweldPreflightResult = {
        allowed: true,
        ok: true,
        entries: [],
        partnerIds: [],
        incumbentWallIds: [],
        incumbentBreach: false,
        maxIncumbentShiftMm: 0,
        unrepairableJunctions: [],
    };

    try {
        const mover = wallStore.getById(wallId);
        if (!mover || !moved(mover.baseLine as readonly Point3D[])) return EMPTY;

        const weldTol =
            typeof input.weldTol === 'number' && input.weldTol > 0
                ? input.weldTol
                : DEFAULT_SNAP_RADIUS;

        // ── Partners, exactly as the service resolves them ────────────────────
        let partnerIds: readonly string[];
        if (input.joinedWallIds && input.joinedWallIds.length > 0) {
            partnerIds = input.joinedWallIds;
        } else if (input.joinedWallIds && input.joinedWallIds.length === 0) {
            return EMPTY;                       // POSITIVE "joins nothing"
        } else {
            const level = wallStore.getByLevel
                ? wallStore.getByLevel(mover.levelId)
                : wallStore.getAll().filter(w => w.levelId === mover.levelId);
            partnerIds = level.map(w => w.id).filter(id => id !== wallId);
        }
        if (partnerIds.length === 0) return EMPTY;

        // §C83 §10.6 — index the stored discriminator by partner id. Empty when
        // the caller supplied none (or when the level-scan fallback ran).
        //
        // ⚠ CORRECTED 2026-08-22 (lane WALL8, ISSUE-LOG L-4110). This comment
        // continued: *"and that emptiness IS the pre-§10.6 branch: no entry ⇒ no
        // junctionType ⇒ `isMutualCorner` false ⇒ nothing follows."* That has been
        // FALSE since `55a2eda3` (2026-08-17, founder-directed, C83 §10.6.3 #1
        // amended in the same commit): with no stored record `isMutualCorner`
        // MEASURES the degree and follows at 2. MEASURED at the gate 2026-08-22 on
        // a closed perimeter with joinedTo edges but no discriminator —
        // `allowed=true, incumbentBreach=false, entries=[w-east:mutual-corner,
        // w-west:mutual-corner]`. An empty map is therefore "no stored answer",
        // NOT "no follow"; the L-922 guard is the DEGREE (stored or measured
        // ≥ 3 never follows), never the emptiness of this map.
        const junctionById = new Map<string, { junctionType?: 'L' | 'T' | 'Y' | 'X' | 'N-WAY'; junctionDegree?: number }>();
        if (input.junctions && input.joinedWallIds && input.joinedWallIds.length > 0) {
            for (const j of input.junctions) junctionById.set(j.wallId, j);
        }

        const partners = [];
        for (const id of partnerIds) {
            const p = wallStore.getById(id);
            if (p && moved(p.baseLine as readonly Point3D[])) {
                const bl = p.baseLine as readonly Point3D[];
                const j = junctionById.get(p.id);
                partners.push({
                    id: p.id,
                    baseLine: [
                        { x: bl[0].x, y: bl[0].y, z: bl[0].z },
                        { x: bl[1].x, y: bl[1].y, z: bl[1].z },
                    ] as [Point3D, Point3D],
                    junctionType: j?.junctionType,
                    junctionDegree: j?.junctionDegree,
                });
            }
        }
        if (partners.length === 0) return EMPTY;

        const plan = computeMoveReweldPlan(
            {
                id: wallId,
                prevBaseLine: [
                    { x: prevBaseLine[0].x, y: prevBaseLine[0].y, z: prevBaseLine[0].z },
                    { x: prevBaseLine[1].x, y: prevBaseLine[1].y, z: prevBaseLine[1].z },
                ],
                newBaseLine: [
                    { x: newBaseLine[0].x, y: newBaseLine[0].y, z: newBaseLine[0].z },
                    { x: newBaseLine[1].x, y: newBaseLine[1].y, z: newBaseLine[1].z },
                ],
                // §L-926 — the mover's thickness, which the weld-authorship
                // band is derived from. WITHOUT IT the engine cannot tell a
                // corner incumbent from a T-stem dependent and conservatively
                // calls everything an incumbent, so this pre-flight refused the
                // founder's gesture outright (measured at `094acd33`:
                // allowed=false, 773 mm). A gate that asks the question with an
                // input missing gets a truthful answer to a different question.
                thickness: mover.thickness,
            },
            partners,
            { weldTol },
        );
        const entries = plan.entries as CascadeWallBaselineEntry[];

        // ── C83 §10.2.2, ARM 2a — the joint that CANNOT be closed ─────────────
        //
        // Since `19ddf6bb` the engine no longer PROPOSES an incumbent's baseline;
        // it refuses instead, and the refusal arrives here in `plan.refusals`
        // rather than as a foreign entry. Reading only `entries` would therefore
        // have let the strongest refusal through as an empty, allowed plan —
        // exactly the "absence read as consent" failure this pre-flight exists to
        // prevent. MEASURED: the L-921 accept-path test refused to refuse until
        // this branch existed.
        if (plan.refusals.length > 0) {
            // ── §L-1571 — SIX CODES, SIX IDENTITIES ──────────────────────────
            //
            // See `unrepairableJunctions`. Only `INCUMBENT_EXTENSION_REQUIRED`
            // is an incumbent-policy refusal, and only it may set the flag
            // §L-942-UNBLOCK was authorised to downgrade. The other five are
            // "this junction cannot be repaired", which is a different fact
            // about a different wall with a different remedy.
            const unrepairable = plan.refusals.map(r => ({
                partnerId: r.partnerId,
                reason: r.reason,
                measuredMm: r.beyondMm,
                ...(r.limitMm != null ? { limitMm: r.limitMm } : {}),
                sentence: describeReweldRefusal(r),
            }));
            const incumbentRefusals = plan.refusals.filter(
                r => r.reason === 'INCUMBENT_EXTENSION_REQUIRED',
            );
            // The reason a caller quotes is the set of codes actually present,
            // in first-seen order. One code stays one code (so every existing
            // `reason === 'INCUMBENT_EXTENSION_REQUIRED'` reader is unchanged on
            // the case it was written for); two codes say two, because picking
            // one of them would report the wrong fact with the right confidence.
            const codes = [...new Set(plan.refusals.map(r => r.reason))];
            return {
                allowed: false,         // UNCHANGED — every refusal still denies
                ok: true,               // the cascade itself never got to object
                entries,
                reason: codes.join('+'),
                // The sentences are `describeReweldRefusal`'s, so each one names
                // its own code and carries BOTH of its numbers (C83 §10.3). The
                // hand-rolled INCUMBENT_EXTENSION_REQUIRED prose that used to
                // stand here asserted a lengthening for refusals that involve no
                // lengthening at all.
                blockingIssues: unrepairable.map(u => u.sentence),
                partnerIds: plan.refusals.map(r => r.partnerId),
                // Only the incumbent-policy refusals are incumbents. A partner
                // refused for AMBIGUOUS_WELD_AUTHORSHIP is not one: nothing was
                // going to move it, which is the whole content of the refusal.
                incumbentWallIds: incumbentRefusals.map(r => r.partnerId),
                incumbentBreach: incumbentRefusals.length > 0,
                maxIncumbentShiftMm: incumbentRefusals.reduce((m, r) => Math.max(m, r.beyondMm), 0),
                unrepairableJunctions: unrepairable,
            };
        }

        // No junction to repair ⇒ nothing can refuse. A POSITIVE ok.
        if (entries.length === 0) return EMPTY;

        // ── The shim: the model AS IT WILL BE the instant the cascade runs ────
        // Only the mover differs, and only in its baseline. See the header —
        // without this the C83 arm answers about the wrong world.
        const movedMover = { ...mover, baseLine: [newBaseLine[0], newBaseLine[1]] } as WallData;
        const shim: PreflightWallStoreRef = {
            getById: (id: string) => (id === wallId ? movedMover : wallStore.getById(id)),
            getAll: () => wallStore.getAll().map(w => (w.id === wallId ? movedMover : w)),
            getByLevel: (levelId: string) =>
                (wallStore.getByLevel
                    ? wallStore.getByLevel(levelId)
                    : wallStore.getAll().filter(w => w.levelId === levelId)
                ).map(w => (w.id === wallId ? movedMover : w)),
        };

        // §L-990 — the subject and its PRE-move pose, handed to the command so
        // its attribution arm can reconstruct the world before the gesture.
        // Without this the shim (which presents the mover at its NEW baseline)
        // is the ONLY world the command can see, and a crossing that was
        // already standing is indistinguishable from one this move creates —
        // which is exactly how a wall with a stem near its own window became
        // permanently unmovable.
        const cmd = new CascadeWallBaselineCommand({
            entries,
            cause: 'move-reweld',
            movedSubject: {
                wallId,
                prevBaseLine: [
                    { x: prevBaseLine[0].x, y: prevBaseLine[0].y, z: prevBaseLine[0].z },
                    { x: prevBaseLine[1].x, y: prevBaseLine[1].y, z: prevBaseLine[1].z },
                ],
            },
        });
        const verdict = cmd.canExecute({ stores: { wallStore: shim } } as unknown as CommandContext);

        // ── C83 §10.2.2 — the INCUMBENT arm ──────────────────────────────────
        //
        // Judged on the entries themselves, not on the cascade's verdict, and
        // that ordering is the point: a cascade that SUCCEEDS by shifting a
        // perimeter 2.19 m is not a success, it is L-922. `ok` and this arm
        // therefore answer two different questions and are reported separately;
        // `allowed` is their conjunction.
        //
        // Only PARTNER entries count. `computeMoveReweld` also emits seats for
        // the subject's own endpoints — the subject adapting to the incumbents'
        // faces, which is exactly what §10.1 requires and must never be read as
        // a breach.
        const incumbent: { id: string; shiftMm: number }[] = [];
        for (const e of entries) {
            if (e.wallId === wallId) continue;          // the SUBJECT adapting — permitted
            // §L-926 — a DEPENDENT is not an incumbent. A wall whose endpoint
            // TERMINATES ON the subject's body follows the subject by rule
            // (C83 §10.6); counting it here made this arm refuse the mandatory
            // direction as if it were the forbidden one, which is `19ddf6bb`'s
            // error committed a second time, at the gate instead of the engine.
            //
            // The verdict is CONSUMED, never re-derived: `role` is stamped by
            // `computeMoveReweldPlan`, the only place that measured whose
            // endpoint abuts whose body. Re-testing it here would be the second
            // copy of a predicate this file's header refuses to keep.
            //
            // §C83 §10.6 — a MUTUAL-CORNER partner is not an incumbent either.
            // Same reasoning one step further out: a corner the subject and
            // exactly ONE partner jointly own, at a stored `L`/degree-2
            // junction, is nobody else's authority to protect. The engine
            // stamped this role only after measuring that; re-testing it here
            // would be the second copy of the predicate this file's header
            // refuses to keep. L-942 is what counting it here cost — every
            // wall-move that broke a junction was hard-blocked in production.
            const role = (e as { role?: string }).role;
            // ⭐ §GRAPH43-EXTEND-THE-HOST (L-10803) — 'host-extension' joins the two
            // roles above for the SAME reason they are here: the verdict is
            // CONSUMED, not re-derived. The engine stamps it only after measuring
            // that (a) the `joinedTo` graph DECLARED this partner, (b) the
            // subject's endpoint was ON that partner's body before the move and
            // is not after it, and (c) the partner's OWN LINE still runs under
            // the subject's new endpoint — so the repair is a pure GROW along
            // that line with the far endpoint untouched.
            //
            // ⛔ That is the opposite of L-922, which this incumbent test exists
            // to catch: L-922 was a wall TRANSLATED sideways (both endpoints
            // displaced, hosted doors dragged with it). A host-extension moves
            // ONE endpoint, ALONG the wall's own axis, and can only lengthen.
            // Re-testing it here by raw endpoint displacement would classify a
            // grow as a drag and block the founder's *"I was expecting the wall
            // to extend"* on the strength of a distance that means the opposite.
            if (role === 'dependent-stem' || role === 'mutual-corner' || role === 'host-extension') continue;
            const before = wallStore.getById(e.wallId);
            const bl = before?.baseLine as readonly Point3D[] | undefined;
            if (!bl || bl.length < 2) continue;
            const shift = Math.max(
                Math.hypot(bl[0].x - e.newBaseLine[0].x, bl[0].z - e.newBaseLine[0].z),
                Math.hypot(bl[1].x - e.newBaseLine[1].x, bl[1].z - e.newBaseLine[1].z),
            );
            incumbent.push({ id: e.wallId, shiftMm: Math.round(shift * 1000) });
        }
        const incumbentBreach = incumbent.length > 0;

        return {
            allowed: verdict.ok && !incumbentBreach,
            ok: verdict.ok,
            entries,
            reason: verdict.reason,
            blockingIssues: (verdict as { blockingIssues?: string[] }).blockingIssues,
            preExistingIssues: (verdict as { warnings?: string[] }).warnings,
            partnerIds: entries.map(e => e.wallId),
            incumbentWallIds: incumbent.map(i => i.id),
            incumbentBreach,
            maxIncumbentShiftMm: incumbent.reduce((m, i) => Math.max(m, i.shiftMm), 0),
            // No refusal reached here — this branch is the cascade's own verdict
            // on a plan the engine WAS able to form. An empty array is therefore
            // a positive "no junction was left unrepairable", not an absence.
            unrepairableJunctions: [],
        };
    } catch (err) {
        // A pre-flight that crashed knows nothing, and "knows nothing" is not
        // "refused" (§CONTEXT-DATA-HONESTY: failure and empty must never share a
        // value). Audible, then out of the way.
        console.warn('[moveReweldPreflight] §L-921-ATOMIC-GESTURE preview failed (non-fatal):', err);
        return EMPTY;
    }
}
