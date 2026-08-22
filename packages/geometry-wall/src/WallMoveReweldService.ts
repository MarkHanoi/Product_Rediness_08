/**
 * @pryzm/geometry-wall — WallMoveReweldService (§MOVE-REWELD-DISPATCH,
 * Phase C item 3 — the wiring `WallMoveReweld.ts`'s header specified and
 * `WallMoveJunctionReweld.measure.test.ts` measured as MISSING).
 *
 * L-871 / L-872 — THE DEFECT THIS CLOSES (founder-reported, live prod):
 * wall-extend-on-move existed ONLY for walls in the outer loop of a slab
 * sketch (`SlabWallConnectivityService`, keyed on slab-loop membership). Every
 * other joined pair — free-drawn rooms, polyline partitions, and above all the
 * INTERIOR WALL ABUTTING MID-SPAN (T-junction) — received no cascade when its
 * partner moved. Measured consequence (founder console, 2026-08-14): moving a
 * perimeter segment re-sized both floor finishes (§C79-5.2) and corner-welded
 * the slab-loop neighbours, but NO re-baseline was ever issued for the interior
 * wall; the room loop opened; REDETECT_ROOMS collapsed 2 rooms → 1 and a room
 * was destroyed by a MOVE ("Unregistered element …").
 *
 * WHAT THIS SERVICE DOES (the four steps the WallMoveReweld header prescribes):
 *   1. On a committed wall baseline change (wallStore 'update' with prevState,
 *      §STEP7 / C72 §3.1), read the moved wall's `joinedTo` partners AS OF
 *      BEFORE the move — the junction→graph edges the WallRebuildCoordinator
 *      flush retained (ADR-0321 §CONNECT-3), which at event time still describe
 *      the PRE-move topology. That covers L corners AND T/Y/X abutments — the
 *      junction index classifies mid-span abutments as 'T'
 *      (JunctionResolverV2.ts:1373).
 *   2. Call `computeMoveReweld({ moved, partners })` — the pure engine with the
 *      graveyard guard-rails (§CLAMP-COSHARE-WELD revert, §POST-RESOLVE-
 *      OVEREXTEND cap, degenerate-stub refusal, near-parallel skip).
 *   3. Dispatch the entries as ONE CascadeWallBaselineCommand
 *      (cause 'move-reweld', source STRUCTURAL_CASCADE) — the existing
 *      undoable path, prevBaseLine included, one undo step per user move.
 *   4. Run behind a `propagating` latch + `isJoinResolving()` suppression +
 *      the §L-871 cross-service `isCascadeApplying()` latch, so the handler
 *      never feeds its own event path and never re-cascades the slab
 *      service's writes (§REENTRANT-SET).
 *
 * REFUSAL ≠ EMPTINESS (C71 §4.4): `getJoinedWalls` answering
 * `{ok:true, joinedWallIds:[]}` is a POSITIVE "joins nothing" — no re-weld.
 * `{ok:false}` means the graph has NO ANSWER for this wall (no flush has
 * covered its level since load). Treating that as "joins nothing" would
 * convert absent evidence into a broken room loop — exactly the defect class
 * this service exists to close — so the service falls back to a same-level
 * geometric scan and SAYS SO. Over-inclusion is safe: `computeMoveReweld`
 * step 1 keeps only partners whose endpoint was actually welded (within
 * weldTol) to the moved wall's PREV segment.
 *
 * COMMAND CLASS BY INJECTION, not import: geometry-wall ↔ command-registry is
 * an existing package-level cycle, and a barrel access at module load is the
 * known white-screen defect (§SCC). This service therefore receives a command
 * FACTORY + a late-binding CommandManager ref at construction — the exact
 * pattern `FinishHostDependencyTracker` established for the same reason.
 */

import type { WallData } from './WallTypes';
import {
    computeMoveReweldCensus,
    type MoveReweldEntry,
    type MoveReweldNotApplicable,
    type MoveReweldPartner,
    type MoveReweldRefusal,
    type MoveReweldSubjectSeat,
    type ReweldBaseline,
} from './WallMoveReweld';
import { DEFAULT_SNAP_RADIUS } from './WallJoinResolver';
import {
    auditWallTopology,
    summariseWallTopologyAudit,
    // §L-4700 — THE DIFF IS NO LONGER THIS FILE'S. It used to be a local `key()`
    // closure right here; `wallPlacementGate` needs the identical question
    // PRE-COMMIT, and two copies of an attribution rule in two layers is exactly
    // how L-942 shipped broken twice. One derivation, two consumers.
    attributeWallTopology,
} from './WallTopologyIntegrity';

type WallEventType = 'add' | 'update' | 'remove';

/** The three WallStore surfaces this service reads. `subscribe` MUST forward
 *  prevState (§STEP7) — without it there is no "as of before the move". */
export interface ReweldWallStoreRef {
    subscribe(
        cb: (event: WallEventType, wall: WallData, prevState?: WallData) => void
    ): () => void;
    getById(id: string): WallData | undefined;
    getByLevel(levelId: string): WallData[];
}

/** Mirror of SemanticGraphManager.getJoinedWalls's typed result (C71 §4.4).
 *  Declared structurally so the graph manager is injectable, not imported. */
export type ReweldJoinedWallsQuery =
    | {
        readonly ok: true;
        readonly wallId: string;
        readonly joinedWallIds: readonly string[];
        /**
         * §C83 §10.6 — per-partner junction discriminator, same order as
         * `joinedWallIds`. OPTIONAL on this mirror so an injected graph that
         * predates the widening still satisfies the type; absent ⇒ no partner
         * carries metadata ⇒ nothing follows, which is the conservative branch
         * and byte-identical to pre-§10.6 behaviour.
         */
        readonly junctions?: readonly {
            readonly wallId: string;
            readonly junctionType?: 'L' | 'T' | 'Y' | 'X' | 'N-WAY';
            readonly junctionDegree?: number;
        }[];
    }
    | { readonly ok: false; readonly wallId: string; readonly reason: string; readonly detail?: string };

export interface ReweldCommandLike {
    canExecute(context: unknown): {
        ok: boolean;
        reason?: string;
        /**
         * §L-921 — WHERE THE NUMBERS LIVE, and the field this interface used to
         * omit. `CascadeWallBaselineCommand.canExecute` returns one string per
         * refused opening carrying the metres required against the metres
         * available; the service logged `reason` alone, so the evidence was
         * discarded one line after it was computed. Declared here so it cannot
         * be dropped again by accident.
         */
        blockingIssues?: string[];
    };
}

/**
 * A re-weld consequence the USER must be told about.
 *
 * §L-921. The refusals below used to end at `console.warn`, and a console line
 * is not a user-facing message — "we told the user" and "we wrote a line nobody
 * reads" must never print as the same outcome. The service does not know what a
 * user-facing surface looks like (it is L2 and must not), so it does not try:
 * it hands the finding to an injected sink and the composition root decides.
 */
export interface ReweldConsequenceReport {
    readonly movedWallId: string;
    /** `plan` = no cascade could be formed; `cascade` = the cascade declined. */
    readonly stage: 'plan' | 'cascade';
    /** The refusal's own code — its IDENTITY, never flattened to prose here. */
    readonly reason: string;
    /** The walls whose junctions are consequently left unrepaired. */
    readonly partnerIds: readonly string[];
    /** One sentence per issue, each carrying its numbers. */
    readonly detail: readonly string[];
}

export interface ReweldCommandManagerLike {
    getContext(): unknown;
    execute(command: ReweldCommandLike, metadata?: unknown): unknown;
    /** §L-874 — true while the manager is replaying an undo/redo. Optional so
     *  narrow test stubs keep working; the real CommandManager implements it. */
    isReverting?: () => boolean;
}

/** Late-binding ref — constructed before commandManager exists, resolved live
 *  at event-fire time (SlabDependencyTracker's CommandManagerRef pattern). */
export interface ReweldCommandManagerRef {
    current: ReweldCommandManagerLike | undefined;
}

export type ReweldCascadeCommandFactory = (input: {
    entries: MoveReweldEntry[];
    cause: 'move-reweld';
    /**
     * §L-990 — the subject of the gesture and where it stood BEFORE it.
     *
     * The cascade cannot otherwise tell a crossing this re-weld CREATES from one
     * that was already standing when the user started dragging: by the time this
     * subscriber runs, the subject has already been re-baselined, so the world
     * the command sees contains the move. Handing it the previous baseline is
     * what makes the difference computable. OPTIONAL on this mirror so a narrow
     * injected factory that predates the field still satisfies the type; absent
     * ⇒ no attribution ⇒ pre-§L-990 behaviour, byte-identically.
     */
    movedSubject?: {
        wallId: string;
        /** `ReweldBaseline` — the SAME pair type `computeMoveReweldCensus` takes,
         *  so the pre-flight, the engine and the cascade all name one shape.
         *  (`Point3D` is not in scope in this module; naming it here was a root-tsc
         *  error, `TS2304`, that the package-local tsconfig did not surface.) */
        prevBaseLine: ReweldBaseline;
    };
}) => ReweldCommandLike;

export interface WallMoveReweldServiceDeps {
    commandManagerRef: ReweldCommandManagerRef;
    makeCascadeCommand: ReweldCascadeCommandFactory;
    /** Which walls join the moved wall — semanticGraphManager.getJoinedWalls in prod. */
    getJoinedWalls: (wallId: string) => ReweldJoinedWallsQuery;
    /** True while WallJoinResolver's mitre pass is writing (coordinator flush). */
    isJoinResolving?: () => boolean;
    /** True while ANY CascadeWallBaselineCommand is applying its writes —
     *  wire to command-registry's `isCascadeWallBaselineApplying` (§L-871). */
    isCascadeApplying?: () => boolean;
    /** "Was welded" tolerance in metres; defaults to DEFAULT_SNAP_RADIUS. */
    weldTol?: () => number;
    /**
     * §L-921 — where an unrepaired junction goes. Absent ⇒ the finding is still
     * logged, but the caller has accepted that no human will see it; wire it in
     * any composition that has a chat or a card. Never throws through.
     */
    onConsequence?: (report: ReweldConsequenceReport) => void;
}

/** Endpoint displacement below this is not a move (matches WallMoveReweld's
 *  MIN_DISPLACEMENT) — filters ADD_OPENING / property-only 'update' events. */
const MIN_MOVE_M = 1e-6;

/**
 * One sentence per refusal, each carrying BOTH of its numbers (C83 §10.3).
 *
 * Exported so a test can assert the SENTENCE a user would read, not merely the
 * code behind it: §L-921's whole finding was that a refusal computed and a
 * refusal delivered had been printing as the same outcome.
 */
export function describeReweldRefusal(r: MoveReweldRefusal): string {
    switch (r.reason) {
        case 'INCUMBENT_EXTENSION_REQUIRED':
            return `INCUMBENT_EXTENSION_REQUIRED: ${r.partnerId}: the new corner falls `
                 + `${r.beyondMm} mm past that wall's end, so closing the joint would `
                 + `require lengthening it — forbidden by C83 §10.2.2`;
        case 'AMBIGUOUS_WELD_AUTHORSHIP':
            return `AMBIGUOUS_WELD_AUTHORSHIP: ${r.partnerId}: its endpoint meets the moved `
                 + `wall ${r.beyondMm} mm from that wall's end, inside the ${r.limitMm} mm band `
                 + `where a corner and a T-stem are the same picture — and the two follow in `
                 + `OPPOSITE directions, so this junction is left as it is rather than guessed `
                 + `(C83 §10.3)`;
        case 'STEM_REVERSAL':
            return `STEM_REVERSAL: ${r.partnerId} terminates on the moved wall, but following it `
                 + `would carry that end ${r.beyondMm} mm PAST the wall's other end and flip it `
                 + `end-for-end — refused`;
        case 'STEM_COLLAPSE':
            return `STEM_COLLAPSE: ${r.partnerId} terminates on the moved wall, but following it `
                 + `would shorten it to ${r.beyondMm} mm, below the ${r.limitMm} mm minimum a `
                 + `wall can be built at — refused`;
        case 'STEM_EXTENSION_EXCEEDS_CAP':
            return `STEM_EXTENSION_EXCEEDS_CAP: ${r.partnerId} would have to move ${r.beyondMm} mm `
                 + `to follow the moved wall, past the ${r.limitMm} mm this gesture allows — `
                 + `refused rather than spiked out`;
        case 'STEM_HOST_NO_LONGER_BENEATH':
            return `STEM_HOST_NO_LONGER_BENEATH: ${r.partnerId} terminates on the moved wall, but `
                 + `after the move that wall no longer passes beneath it — the seat would fall `
                 + `${r.beyondMm} mm off its end, past the ${r.limitMm} mm allowed — refused`;
    }
}

/**
 * §L-945 — one compact `id:REASON(measured/limit mm)` token per partner that
 * produced neither an entry nor a refusal.
 *
 * THE DEFECT THIS EXISTS FOR, verbatim from production on `55a2eda3`:
 *
 *     §MOVE-REWELD-DISPATCH: moved wall A → 2 partner(s) via joinedTo-graph
 *        [B, C] → 1 baseline re-seat(s) [C], 0 junction(s) refused
 *
 * Two partners, one re-seat, zero refusals — and NOTHING anywhere said what
 * became of the other one. The founder read that line and reported *"i expected
 * it to adapt to the new position - but did not"*, and nobody could answer why,
 * because the answer was never written down. `2 = 1 + 0` does not reconcile and
 * the line gave the reader no way to notice.
 *
 * Terse on purpose: this is a per-gesture console line, not prose. The reason
 * codes are the identity (never flattened, C71) and the two numbers are the C83
 * §10.3 pair. `describeReweldRefusal` remains the sentence-length surface for
 * the things a USER must be told; a not-applicable is a diagnostic, and putting
 * it in the user's chat would bury the refusals that matter.
 */
export function summariseNotApplicable(n: MoveReweldNotApplicable): string {
    const nums = n.measuredMm != null
        ? `(${n.measuredMm}${n.limitMm != null ? `/${n.limitMm}` : ''} mm)`
        : '';
    return `${n.partnerId}:${n.reason}${nums}`;
}

/**
 * §L-945 — the subject's own seat, as one readable clause.
 *
 * Separate from the partner census because the subject is not a partner, and
 * because THIS is the clause that distinguishes the two ways a gesture can end
 * with an open corner: the partner was never reached, or the partner was
 * handled correctly and the SUBJECT then failed to reach the corner it formed.
 * Both printed as an unremarkable absence before.
 */
export function summariseSubjectSeat(s: MoveReweldSubjectSeat): string {
    if (s.cornersOffered.length === 0) return 'subject: no corner offered';
    const parts = [
        `subject: ${s.cornersOffered.length} corner(s) offered`,
        `${s.seatedOn.length} seated`,
    ];
    if (s.declined.length > 0) {
        parts.push(`${s.declined.length} DECLINED [${s.declined.map(summariseNotApplicable).join(', ')}]`);
    }
    parts.push(s.entryEmitted ? 'entry emitted' : 'NO subject entry');
    if (s.suppressed) parts.push(`SUPPRESSED:${s.suppressed}`);
    return parts.join(', ');
}

export class WallMoveReweldService {
    private unsubscribe?: () => void;
    /** §REENTRANT-SET: our own dispatch must not feed our own event path. */
    private propagating = false;

    private readonly isJoinResolving: () => boolean;
    private readonly isCascadeApplying: () => boolean;

    constructor(
        private readonly wallStore: ReweldWallStoreRef,
        private readonly deps: WallMoveReweldServiceDeps,
    ) {
        this.isJoinResolving  = deps.isJoinResolving  ?? (() => false);
        this.isCascadeApplying = deps.isCascadeApplying ?? (() => false);

        this.unsubscribe = wallStore.subscribe((event, wall, prevState) => {
            if (event === 'update') this.onWallUpdated(wall, prevState);
        });
    }

    private onWallUpdated(wall: WallData, prevState?: WallData): void {
        // Mitre-pass writes are render-time structural corrections, not moves.
        if (this.isJoinResolving()) return;
        // Our own cascade's writes.
        if (this.propagating) return;
        // The OTHER dispatcher's cascade writes (slab corner welds / undo restores).
        if (this.isCascadeApplying()) return;
        // §L-874 — undo/redo replays are not user moves: the history's own
        // cascade entries restore the partners; a fresh forward weld here would
        // compensate the user's Ctrl+Z (the founder's identical-screenshots bug).
        if (this.deps.commandManagerRef.current?.isReverting?.()) return;

        // No prevState → no diff basis ('add' has none; defensive on 'update').
        const prevBL = prevState?.baseLine;
        const newBLAtEmit = wall.baseLine;
        if (!prevBL || !newBLAtEmit || prevBL.length < 2 || newBLAtEmit.length < 2) return;

        // Did the BASELINE actually move? addOpening / colour / layer updates
        // emit 'update' with identical geometry — those are not moves (this is
        // the L-871 door lesson, applied here from birth).
        const disp = Math.max(
            Math.hypot(newBLAtEmit[0].x - prevBL[0].x, newBLAtEmit[0].z - prevBL[0].z),
            Math.hypot(newBLAtEmit[1].x - prevBL[1].x, newBLAtEmit[1].z - prevBL[1].z),
        );
        if (disp < MIN_MOVE_M) return;

        // Re-read the moved wall: if the slab service's corner weld already
        // seated it (its subscriber runs before ours), weld partners against
        // the FINAL committed line, not the emit-time snapshot.
        const moved = this.wallStore.getById(wall.id);
        if (!moved || !moved.baseLine || moved.baseLine.length < 2) return;

        // ── Partners: joinedTo graph first; refusal → level scan (C71 §4.4) ──
        const q = this.deps.getJoinedWalls(wall.id);
        let partnerIds: readonly string[];
        let partnerSource: string;
        if (q.ok) {
            if (q.joinedWallIds.length === 0) return; // POSITIVE "joins nothing"
            partnerIds = q.joinedWallIds;
            partnerSource = 'joinedTo-graph';
        } else {
            // NO ANSWER ≠ joins nothing: fall back to the level's walls and let
            // computeMoveReweld's weldTol filter decide geometrically. Say so.
            partnerIds = this.wallStore
                .getByLevel(moved.levelId)
                .map(w => w.id)
                .filter(id => id !== wall.id);
            partnerSource = `level-scan (graph refused: ${q.reason})`;
            if (partnerIds.length === 0) return;
        }

        // §C83 §10.6 — the STORED discriminator, indexed by partner id.
        //
        // ⚠ Populated ONLY on the `joinedTo-graph` arm. The level-scan fallback
        // resolved its partners geometrically and the graph refused to answer
        // for this wall, so there is no junction record to read.
        //
        // ⚠⚠ CORRECTED 2026-08-22 (lane WALL8, ISSUE-LOG L-4110/L-4111). This
        // comment continued: *"and §10.6.3 #1 is explicit that absent metadata
        // must take the pre-§10.6 branch byte-identically. Leaving this map empty
        // is how that is enforced: a partner with no entry gets no
        // `junctionType`, and `isMutualCorner` reads false."* **That has been
        // FALSE since `55a2eda3`** (2026-08-17, founder-directed): with no stored
        // record `isMutualCorner` MEASURES the degree and follows at 2. An empty
        // map enforces nothing any more.
        //
        // ⛔ AND THIS ARM IS THE ONE WHERE THAT MATTERS MOST — L-4111, OPEN, not
        // changed here. On the graph arm the partner set is the graph's own
        // answer, so a measured degree of 2 confirms a join the graph already
        // asserted. On THIS arm the partner set is EVERY WALL ON THE LEVEL and
        // the graph asserted nothing, so the measured degree is the only thing
        // between a move and a follow on a wall nobody ever said was joined.
        // Narrowing that is a C83 §10.6.3 question for the founder, not a lane's
        // to decide, and widening it is worse. Do not "helpfully" re-derive the
        // junction TYPE here either way — §10.6.3 #2 is unchanged.
        const junctionById = new Map<string, { junctionType?: 'L' | 'T' | 'Y' | 'X' | 'N-WAY'; junctionDegree?: number }>();
        if (q.ok && q.junctions) {
            for (const j of q.junctions) junctionById.set(j.wallId, j);
        }

        const partners: MoveReweldPartner[] = [];
        for (const id of partnerIds) {
            const p = this.wallStore.getById(id);
            if (p?.baseLine && p.baseLine.length >= 2) {
                const j = junctionById.get(p.id);
                partners.push({
                    id: p.id,
                    baseLine: this.toBaseline(p.baseLine),
                    junctionType: j?.junctionType,
                    junctionDegree: j?.junctionDegree,
                });
            }
        }
        if (partners.length === 0) return;

        const plan = computeMoveReweldCensus(
            {
                id: wall.id,
                prevBaseLine: this.toBaseline(prevBL),
                newBaseLine: this.toBaseline(moved.baseLine),
                // §L-926 — the HOST's PRE-move thickness. Without it the engine
                // cannot ask whose endpoint abuts whose body and silently
                // declines every dependent follow (it says so at
                // `MoveReweldMovedWall.thickness`). `prevState` is the geometry
                // the partners were welded to, so its thickness is the one that
                // defines the body they were welded to; `moved` is the fallback
                // for a move event that carried no previous thickness.
                thickness: prevState?.thickness ?? moved.thickness,
            },
            partners,
            { weldTol: this.deps.weldTol?.() ?? DEFAULT_SNAP_RADIUS },
        );
        const entries = plan.entries;

        // §L-921-NO-SILENT-HALF — a junction that CANNOT be closed without
        // moving an incumbent (C83 §10.2.2) is a fact the user must be told.
        // Reporting it is not optional and it happens whether or not there are
        // also entries to dispatch: "the corner is open and nobody said so" is
        // the exact defect this lane exists to abolish.
        if (plan.refusals.length > 0) {
            // §L-926 — the reason is no longer a constant. `19ddf6bb` left this
            // hard-coded to INCUMBENT_EXTENSION_REQUIRED because it was the only
            // code the engine could emit; with weld authorship there are six,
            // and flattening five of them into the sixth would report the wrong
            // fact with the right confidence. The reasons are grouped so a
            // gesture that refuses two junctions for two different causes says
            // both, rather than picking one.
            const byReason = new Map<string, typeof plan.refusals>();
            for (const r of plan.refusals) {
                const bucket = byReason.get(r.reason);
                if (bucket) bucket.push(r); else byReason.set(r.reason, [r]);
            }
            for (const [reason, group] of byReason) {
                // §L-936-EMITTER-HONESTY — audible EVEN WITH NO SINK. Measured
                // 2026-08-17: `engineLauncher.ts` composes this service without
                // `onConsequence`, so every plan-stage refusal in production
                // went to `report()` and stopped there — no chat, no card, and
                // (unlike the cascade-stage branch below) not even a console
                // line. A refusal that is computed with both its numbers and
                // then reaches nobody is L-921 verbatim, one stage earlier.
                console.warn(
                    `[WallMoveReweldService] §MOVE-REWELD-REFUSED: moved wall ${wall.id} — ` +
                    `${reason} × ${group.length}; these junctions are LEFT UNREPAIRED: ` +
                    `[${group.map(r => r.partnerId).join(', ')}]`,
                    { detail: group.map(r => describeReweldRefusal(r)) },
                );
                this.report({
                    movedWallId: wall.id,
                    stage: 'plan',
                    reason,
                    partnerIds: group.map(r => r.partnerId),
                    detail: group.map(r => describeReweldRefusal(r)),
                });
            }
        }
        if (entries.length === 0) {
            // §L-936-EMITTER-HONESTY — THE SILENCE THAT COST SIX REPORTS.
            //
            // This was a bare `return`. Measured on the founder's own fixture
            // (`L936InteriorLPairMove.measure.test.ts`): a perpendicular drag of
            // an interior wall whose L-partner the graph HAD named produced
            // `plans=[] consequences=[]` — an empty plan, no refusal, no line,
            // and a 600 mm dangling corner in the store. From outside, that is
            // indistinguishable from "this wall joins nothing", which is the
            // one thing C71 §4.4 exists to keep distinguishable.
            //
            // Partners are named, because "which walls did the engine look at
            // and decline to move" is the question six lanes could not answer
            // from the old output.
            if (plan.refusals.length === 0) {
                console.warn(
                    `[WallMoveReweldService] §MOVE-REWELD-EMPTY-PLAN: moved wall ${wall.id} — ` +
                    `${partners.length} partner(s) considered via ${partnerSource} ` +
                    `[${partners.map(p => p.id).join(', ')}], 0 re-weld entries and 0 refusals. ` +
                    // §L-945 — AND HERE IS WHY, PER PARTNER. This sentence used to
                    // end at "left exactly as it was", which states the outcome
                    // and withholds the cause; §3 of the L-942 brief called it
                    // "the strongest unexplained clue" precisely because nothing
                    // downstream could turn it into a question about geometry.
                    `Per-partner outcome: ` +
                    `[${plan.notApplicable.map(summariseNotApplicable).join(', ')}]. ` +
                    `${summariseSubjectSeat(plan.subjectSeat)}. ` +
                    `Every junction this move touched was left exactly as it was.`
                );
            }
            // §WALL-TOPOLOGY-INTEGRITY — THE PATH THAT MOST NEEDS THE PROBE.
            // No entries means nothing will be dispatched and nothing further
            // will run: whatever this move left open, it leaves open for good.
            // The founder's session ended on exactly this branch (2 refusals,
            // 1 subject-only re-seat) and the corruption it left was named by
            // four different subsystems and by nothing that read them together.
            this.auditLevelTopology(wall.id, moved.levelId, prevBL, prevState?.thickness);
            return;
        }

        const cm = this.deps.commandManagerRef.current;
        if (!cm) {
            // Never a silent direct write, never an un-undoable weld: this
            // service is born AFTER the W1 command path, so it has no legacy
            // fallback to preserve. Audible, then nothing.
            console.warn(
                `[WallMoveReweldService] §MOVE-REWELD-DISPATCH: commandManager not yet ` +
                `available — ${entries.length} re-weld entry/entries for moved wall ` +
                `${wall.id} NOT dispatched. This should never happen after bootstrap.`
            );
            return;
        }

        this.propagating = true;
        try {
            // §L-990 — the pre-move pose travels WITH the cascade. `prevBL` is
            // the same baseline this method already handed `computeMoveReweldCensus`
            // as the moved wall's `prevBaseLine`, so the attribution arm and the
            // weld engine are reasoning about one and the same "before".
            const cmd = this.deps.makeCascadeCommand({
                entries,
                cause: 'move-reweld',
                movedSubject: { wallId: wall.id, prevBaseLine: this.toBaseline(prevBL) },
            });
            const validation = cmd.canExecute(cm.getContext());
            if (!validation.ok) {
                // §L-921 — THE FOUNDER'S SILENT LINE. This branch used to be a
                // `console.warn` of `validation.reason` and a `return`: the move
                // stayed committed (it was applied by the OTHER command, before
                // this subscriber ever ran), the junction stayed open, and the
                // `blockingIssues` array — the only place the metres live — was
                // discarded one line after it was computed.
                console.warn(
                    `[WallMoveReweldService] move-reweld cascade refused for moved wall ` +
                    `${wall.id}: ${validation.reason ?? 'unspecified'}`,
                    { blockingIssues: validation.blockingIssues },
                );
                this.report({
                    movedWallId: wall.id,
                    stage: 'cascade',
                    reason: validation.reason ?? 'unspecified',
                    partnerIds: entries.map(e => e.wallId).filter(id => id !== wall.id),
                    detail: validation.blockingIssues ?? [],
                });
                return;
            }
            cm.execute(cmd, { source: 'STRUCTURAL_CASCADE' });
            // §L-936-EMITTER-HONESTY — THE COUNT THAT LIED, and the reason this
            // family was reported six times.
            //
            // This line used to read `${entries.length} junction re-weld(s) via
            // ${partnerSource} [${entries.map(e => e.wallId)}]`. `entries` is the
            // ENGINE'S PLAN, and under C83 §10.2.2 a plan that correctly declines
            // to move a corner INCUMBENT still contains the SUBJECT's own re-seat
            // — so a gesture that reached a partner and deliberately left it
            // where it was printed as **"1 junction re-weld(s) … [the moved wall
            // itself]"**. That is a true sentence in a shape that cannot be told
            // apart from "the graph returned nothing but me", and L-936 was
            // opened on exactly that misreading. The partner list was never
            // printed at all, so no reader could check.
            //
            // Three counts now, because they are three different facts:
            //   partners  — what the graph/scan handed the engine
            //   re-seated — whose baseline this cascade actually writes
            //   refused   — junctions the engine will not close, by name
            // and the SUBJECT is labelled, so "the mover adapted" can never
            // again be read as "a partner followed".
            //
            // ── §L-945, THE FOURTH FACT ─────────────────────────────────────
            //
            // Three counts was still one short. Measured on `55a2eda3`:
            //
            //     moved wall A → 2 partner(s) … [B, C] → 1 baseline re-seat(s)
            //     [C], 0 junction(s) refused
            //
            // **2 considered, 1 re-seated, 0 refused.** Partner B was neither
            // followed nor refused, and no reader — including four lanes that
            // tried — could recover what happened to it, because `entries` and
            // `refusals` were the only two things the engine produced and B was
            // in neither. That is L-921's defect one layer in: a dropped
            // junction with nobody told.
            //
            // Every partner now appears in exactly one of the three lists, and
            // the arithmetic is printed so a line that does NOT reconcile is
            // visible as such rather than having to be noticed. The subject's
            // own seat is a fourth clause because the subject is not a partner
            // and its failure to reach a correctly-formed corner is a distinct
            // way for the joint to end up open.
            const reseated = entries.map(e => e.wallId);
            const subjectOnly = reseated.length === 1 && reseated[0] === wall.id;
            const partnerEntryIds = reseated.filter(id => id !== wall.id);
            const accounted = partnerEntryIds.length + plan.refusals.length + plan.notApplicable.length;
            console.log(
                `[WallMoveReweldService] §MOVE-REWELD-DISPATCH: moved wall ${wall.id} → ` +
                `${partners.length} partner(s) via ${partnerSource} ` +
                `[${partners.map(p => p.id).join(', ')}] → ` +
                `${entries.length} baseline re-seat(s) [${reseated.join(', ')}]` +
                (subjectOnly ? ' (THE SUBJECT ONLY — no partner followed)' : '') +
                `, ${plan.refusals.length} junction(s) refused` +
                (plan.refusals.length > 0
                    ? ` [${plan.refusals.map(r => `${r.partnerId}:${r.reason}`).join(', ')}]`
                    : '') +
                `, ${plan.notApplicable.length} not-applicable` +
                (plan.notApplicable.length > 0
                    ? ` [${plan.notApplicable.map(summariseNotApplicable).join(', ')}]`
                    : '') +
                ` | ${summariseSubjectSeat(plan.subjectSeat)}` +
                ` | partners accounted ${accounted}/${partners.length}` +
                // A control that cannot fail is not a control. The engine's own
                // partition is asserted at the point of reading, so a future
                // `continue` that forgets its record is loud rather than silent
                // — which is exactly the failure this whole line is about.
                (accounted !== partners.length ? ' ⛔ §L-945-UNACCOUNTED' : '')
            );
        } finally {
            this.propagating = false;
        }
        // §WALL-TOPOLOGY-INTEGRITY — AFTER the cascade's writes, and outside the
        // `propagating` latch, so the probe measures the world the user is left
        // with rather than the one mid-write. A cascade that SUCCEEDS can still
        // leave the level corrupt: it repairs the junctions it has entries for
        // and is silent about the ones it refused.
        this.auditLevelTopology(wall.id, moved.levelId, prevBL, prevState?.thickness);
    }

    /**
     * §WALL-TOPOLOGY-INTEGRITY (L-1570) — RUN THE PROBE, AND SAY WHICH HALF OF
     * WHAT IT FOUND THIS GESTURE IS RESPONSIBLE FOR.
     *
     * ── WHY IT IS WIRED HERE ─────────────────────────────────────────────────
     * `auditWallTopology` is pure and store-free by design, which makes it
     * *present* and not yet *reachable*. This is the one place every committed
     * baseline move funnels through — the same chokepoint argument
     * `wallPlacementGate` makes for its three pre-flights — so wiring it here
     * covers the plan drag AND the 3D gizmo drag-end without either growing its
     * own call, and the two cannot drift apart.
     *
     * ── THE BEFORE/AFTER DIFF IS NOT A REFINEMENT, IT IS THE POINT ───────────
     * A level that was ALREADY corrupt and a gesture that has JUST corrupted it
     * are different facts, and an audit that printed one total would report the
     * first as the second on every subsequent move — the founder would then be
     * shown the same finding forever with no way to tell which drag caused it.
     * §CONTEXT-DATA-HONESTY, and the same separation §L-990 already draws
     * between `blockingIssues` and `preExistingIssues`.
     *
     * The "before" world is the level with the SUBJECT put back on `prevBaseLine`
     * — the identical reconstruction `computeMoveReweldCensus` was handed, so the
     * probe and the weld engine reason about one and the same "before".
     *
     * Never throws through: a probe that breaks a move is worse than no probe.
     */
    private auditLevelTopology(
        movedWallId: string,
        levelId: string,
        prevBL: ReadonlyArray<{ x: number; y: number; z: number }>,
        prevThickness: number | undefined,
    ): void {
        try {
            const after = this.wallStore.getByLevel(levelId);
            if (after.length === 0) return;
            const auditAfter = auditWallTopology(after);
            if (!auditAfter.corrupt) return;

            const before = after.map(w => (
                w.id === movedWallId
                    ? { ...w, baseLine: [prevBL[0], prevBL[1]], thickness: prevThickness ?? w.thickness }
                    : w
            ));
            const auditBefore = auditWallTopology(before as typeof after);
            // §L-4700 — the SHARED attribution. `wallPlacementGate` now asks the
            // same question one step EARLIER, against the PROJECTED level, and the
            // two must never be able to disagree about what "created by this
            // gesture" means.
            const { created } = attributeWallTopology(auditBefore, auditAfter);

            const line = summariseWallTopologyAudit(levelId, auditAfter);
            if (!line) return;
            console.warn(
                `${line}\n  §WALL-TOPOLOGY-ATTRIBUTION: moved wall ${movedWallId} — ` +
                `${created.length} of these ${auditAfter.findings.length} finding(s) were CREATED by ` +
                `this gesture; ${auditAfter.findings.length - created.length} were ALREADY STANDING ` +
                `before it.` +
                (created.length > 0
                    ? ` CREATED: [${created.map(f => `${f.guestWallId}(${f.guestSide})→${f.hostWallId}:${f.kind}(${f.measuredMm}/${f.limitMm} mm)`).join(', ')}]`
                    : ' This gesture created none of them.'),
            );
        } catch (err) {
            console.warn('[WallMoveReweldService] §WALL-TOPOLOGY-INTEGRITY probe failed (non-fatal):', err);
        }
    }

    /**
     * Hand an unrepaired-junction finding to the injected sink.
     *
     * Never throws through: a broken reporter must not turn a reported defect
     * into an unreported one, which would be the failure mode this method
     * exists to prevent.
     */
    private report(r: ReweldConsequenceReport): void {
        try {
            this.deps.onConsequence?.(r);
        } catch (err) {
            console.warn('[WallMoveReweldService] §L-921 consequence sink threw (non-fatal):', err);
        }
    }

    /** Normalise a stored baseline (THREE.Vector3s or plain Point3D) to the
     *  plain-object pair computeMoveReweld consumes. */
    private toBaseline(bl: ReadonlyArray<{ x: number; y: number; z: number }>): ReweldBaseline {
        // Indexed reads are narrowed explicitly rather than asserted: every
        // caller checks `length >= 2` first, so the fallbacks are unreachable —
        // but an unreachable zero is still better than a `!`, which would make
        // a future caller's missing length check a runtime NaN instead of a
        // type error. (Pre-existing strictness error at HEAD, closed here
        // because this file's build feeds the stricter root tsc.)
        const a = bl[0] ?? { x: 0, y: 0, z: 0 };
        const b = bl[1] ?? { x: 0, y: 0, z: 0 };
        return [
            { x: a.x, y: a.y, z: a.z },
            { x: b.x, y: b.y, z: b.z },
        ];
    }

    dispose(): void {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
    }
}
