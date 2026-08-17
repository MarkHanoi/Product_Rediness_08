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
    /** Which wall ids the refused cascade would have re-welded. */
    readonly partnerIds: readonly string[];
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
        // the caller supplied none (or when the level-scan fallback ran), and
        // that emptiness IS the pre-§10.6 branch: no entry ⇒ no junctionType ⇒
        // `isMutualCorner` false ⇒ nothing follows.
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
            return {
                allowed: false,
                ok: true,               // the cascade itself never got to object
                entries,
                reason: 'INCUMBENT_EXTENSION_REQUIRED',
                blockingIssues: plan.refusals.map(
                    r => `INCUMBENT_EXTENSION_REQUIRED: ${r.partnerId}: the new corner falls ` +
                         `${r.beyondMm} mm past that wall's end, so closing the joint would ` +
                         `require lengthening it`,
                ),
                partnerIds: plan.refusals.map(r => r.partnerId),
                incumbentWallIds: plan.refusals.map(r => r.partnerId),
                incumbentBreach: true,
                maxIncumbentShiftMm: plan.refusals.reduce((m, r) => Math.max(m, r.beyondMm), 0),
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

        const cmd = new CascadeWallBaselineCommand({ entries, cause: 'move-reweld' });
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
            if (role === 'dependent-stem' || role === 'mutual-corner') continue;
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
            partnerIds: entries.map(e => e.wallId),
            incumbentWallIds: incumbent.map(i => i.id),
            incumbentBreach,
            maxIncumbentShiftMm: incumbent.reduce((m, i) => Math.max(m, i.shiftMm), 0),
        };
    } catch (err) {
        // A pre-flight that crashed knows nothing, and "knows nothing" is not
        // "refused" (§CONTEXT-DATA-HONESTY: failure and empty must never share a
        // value). Audible, then out of the way.
        console.warn('[moveReweldPreflight] §L-921-ATOMIC-GESTURE preview failed (non-fatal):', err);
        return EMPTY;
    }
}
