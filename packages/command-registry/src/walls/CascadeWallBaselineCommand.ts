import { trace, type Tracer } from '@opentelemetry/api';
import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { Point3D } from '@pryzm/core-app-model';
import { serializeWallSnapshot } from './wallSnapshotUtils';
// §HOSTED-OPENING-HOST-MOVE — the SAME wall-side opening gate
// UpdateWallBaselineCommand already asks (§FIX-WALL-SHRINK-REFIT), asked here
// too because the cascade re-baselines walls the user never aimed at.
import { wallOccupancyStore } from '@pryzm/geometry-wall';
// §C83-S1-MOVE (L-885) — the wall-side occupancy predicate + its shared renderer.
// §L-990 — `findWallOpeningCrossings` + `computeWallCrossingOffers` are the SAME
// predicate and the SAME offer engine `evaluateWallPlacement` composes; they are
// imported (rather than re-derived) so the attribution arm below cannot drift
// from the arm it is filtering.
import {
    evaluateWallPlacement,
    wallCrossesOpeningRefusalText,
    findWallOpeningCrossings,
    computeWallCrossingOffers,
} from '@pryzm/geometry-wall';
import type {
    Opening,
    OpeningRefitPlan,
    WallData,
    CandidateWall,
    WallCrossingViolation,
} from '@pryzm/geometry-wall';
// §L-916-FRAME-RECORD-SYNC — `updateOpening` writes the VOID record only; the
// FRAME mesh is positioned from a SECOND store this package must write itself.
import { reseatOpeningWithFrame } from './hostedOpeningFrameSync';

// P8 / C10 §2 — every exported function carries ≥ 1 OTel span. Same tracer-name
// idiom as `UpdateWallsRakeBatchCommand.ts` / `SeatingDatumResolver.ts` here.
function _tracer(): Tracer {
    return trace.getTracer('@pryzm/command-registry');
}

/**
 * One per-wall mutation in a cascade batch.
 *
 * `prevBaseLine` is optional and reserved for callers that want to override the
 * snapshot baseline (e.g. when the store was already mutated outside the
 * command). Today's only caller — SlabWallConnectivityService — invokes this
 * command BEFORE mutating the store, so the prev value is read from the store
 * inside execute().
 */
export interface CascadeWallBaselineEntry {
    wallId: string;
    newBaseLine: [Point3D, Point3D];
    prevBaseLine?: [Point3D, Point3D];
}

export interface CascadeWallBaselineInput {
    /** Each entry mutates one wall; all entries are applied atomically in execute(). */
    entries: CascadeWallBaselineEntry[];
    /** Free-form tag (e.g. "slab-connectivity", "move-reweld") for diagnostics / inspector display. */
    cause?: string;
    /**
     * §L-990 — THE GESTURE'S SUBJECT, AND WHERE IT STOOD BEFORE IT.
     *
     * Supplied only by the move-reweld callers, who are the only ones that know
     * it. Its ONE use is the attribution arm in `canExecute`: without the
     * subject's pre-move baseline this command cannot reconstruct the world as
     * it stood before the gesture, and therefore cannot tell a crossing this
     * cascade would CREATE from one that was already standing.
     *
     * ⚠ ABSENT ⇒ NO ATTRIBUTION IS ATTEMPTED, and every crossing refuses exactly
     * as it did before this field existed. That is deliberate: "I could not find
     * out whether this is new" is not "it is not new", and the conservative
     * branch for an unanswerable question is the pre-existing behaviour, not a
     * guess. `SlabWallConnectivityService` omits it and is byte-identical.
     */
    movedSubject?: {
        wallId: string;
        prevBaseLine: [Point3D, Point3D];
    };
}

/**
 * §L-990 — how much an overlap may grow before the gesture owns it.
 *
 * Same order as `COINCIDENT_M` in the predicate itself: a crossing whose shared
 * interval is unchanged to within a millimetre is the SAME crossing, not a new
 * one. Anything that grows past this is attributable to the gesture and refuses.
 */
const PRE_EXISTING_TOL_M = 1e-3;

/** `hostWallId|openingId` — the identity of one crossing, independent of pose. */
function crossingKey(v: WallCrossingViolation): string {
    return `${v.hostWallId}|${v.openingId}`;
}

/**
 * §L-871/§L-872 — cross-service structural-cascade latch.
 *
 * TWO services now dispatch this command from wallStore 'update' subscriptions:
 * `SlabWallConnectivityService` (slab-loop corner welds) and
 * `WallMoveReweldService` (joinedTo junction re-welds, incl. T-abutments).
 * Each carries its OWN `propagating` flag, which only guards against feeding
 * its OWN event path — it cannot stop the OTHER service from treating this
 * command's store writes as fresh user moves and dispatching a second cascade
 * (extra undo entries; in the worst ordering, a ping-pong of identity welds).
 *
 * The command is the ONE chokepoint every structural wall cascade passes
 * through (C11 §5.4 shape), so the latch lives here: depth-counted around the
 * mutation phases of execute() AND undo(). Both services consult it before
 * propagating. Module-level rather than instance state because the reactors
 * never see the instance — they see store events.
 */
let _cascadeApplyDepth = 0;

/** True while a CascadeWallBaselineCommand is applying (or undoing) its wall
 *  writes. Store-event reactors that would dispatch a FURTHER cascade must
 *  treat these updates as structural propagation, not user moves. */
export function isCascadeWallBaselineApplying(): boolean {
    return _cascadeApplyDepth > 0;
}

/**
 * §WALL-AUDIT-2026-W1: CascadeWallBaselineCommand
 *
 * BATCHED, UNDOABLE wrapper for structural cascades that must trim/extend the
 * baseLine of MULTIPLE walls in a single user-facing operation.
 *
 * Background
 * ----------
 * SlabWallConnectivityService keeps the corners of a "By Pick Walls" slab
 * topologically welded: when the user drags one wall, the service snaps the
 * endpoints of the predecessor / successor walls (and the moved wall itself)
 * to the new corner intersections. Previously the service called
 * `wallStore.update()` directly — a structural mutation outside the command
 * pipeline. The cascade was reversible ONLY because CreateWallCommand happened
 * to capture a neighbour-baseline snapshot for its own undo. If the service
 * were ever invoked from any other path, the cascade became silently
 * irreversible (audit §01 §2.1, §08).
 *
 * This command makes the cascade architecturally undoable: it captures a full
 * WallData snapshot of every affected wall (using the same `serializeWallSnapshot`
 * + `wallStore.restoreSnapshot` machinery as UpdateWallBaselineCommand, so
 * `metadata.version` is preserved on undo per FIX-1 / M2 / M11) and applies all
 * mutations atomically.
 *
 * Contract compliance
 * -------------------
 * §01 §2.1 — All mutations go through `wallStore.update()` inside execute().
 * §01 §2.3 — Full snapshots captured for every entry; undo uses
 *            `restoreSnapshot()` so version numbers do not drift.
 * §08      — Cascade is undoable; no neighbour mutation escapes the pipeline.
 *
 * Note: the service still falls back to the legacy direct-update path when no
 * commandManager has been injected (e.g. very early bootstrap, tests). That
 * code path is unchanged from the pre-W1 behaviour.
 */
export class CascadeWallBaselineCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    readonly id: string;
    readonly type = CommandType.CASCADE_WALL_BASELINE;
    readonly timestamp: number;
    readonly targetIds: string[];

    private readonly entries: CascadeWallBaselineEntry[];
    private readonly cause: string;
    /** §L-990 — see `CascadeWallBaselineInput.movedSubject`. */
    private readonly movedSubject?: { wallId: string; prevBaseLine: [Point3D, Point3D] };

    /**
     * One full WallData snapshot per affected wall, indexed by wallId.
     * Captured during execute() so undo can `restoreSnapshot()` and preserve
     * metadata.version (no audit-trail drift — same pattern as
     * UpdateWallBaselineCommand).
     */
    private prevSnapshots: Map<string, any> = new Map();

    /**
     * §HOSTED-OPENING-HOST-MOVE — the PRE-EDIT openings this cascade moved, per
     * wall, so undo can put them back.
     *
     * Exists for exactly the reason `UpdateWallBaselineCommand.relocated` does:
     * `WallStore.restoreSnapshot()` restores baseLine / height / thickness /
     * layers / metadata but **NOT `openings`** — openings have their own
     * mutation API. So `prevSnapshots` alone cannot undo a relocation, and
     * without this record an undo would put a 4 m wall back while leaving its
     * door at the offset the 2 m wall forced on it. Silent data loss on the undo
     * path is the same defect as silent data loss on the edit path (C70 C-INV-3:
     * a move mints no new identity, and undo restores the one that was there).
     */
    private relocated: Map<string, Opening[]> = new Map();

    private executed = false;

    constructor(input: CascadeWallBaselineInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        // Deep-copy each entry's points so post-construction mutation of the
        // caller's array cannot poison the command's payload.
        this.entries = input.entries.map(e => ({
            wallId: e.wallId,
            newBaseLine: [{ ...e.newBaseLine[0] }, { ...e.newBaseLine[1] }],
            prevBaseLine: e.prevBaseLine
                ? [{ ...e.prevBaseLine[0] }, { ...e.prevBaseLine[1] }]
                : undefined,
        }));
        this.cause = input.cause ?? 'cascade';
        this.movedSubject = input.movedSubject
            ? {
                wallId: input.movedSubject.wallId,
                prevBaseLine: [
                    { ...input.movedSubject.prevBaseLine[0] },
                    { ...input.movedSubject.prevBaseLine[1] },
                ],
            }
            : undefined;
        this.targetIds = this.entries.map(e => e.wallId);
        Object.freeze(this.targetIds);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const wallStore = ctx.stores.wallStore;
        const missing: string[] = [];
        const tooShort: string[] = [];
        for (const e of this.entries) {
            if (!wallStore.getById(e.wallId)) {
                missing.push(e.wallId);
                continue;
            }
            const dx = e.newBaseLine[1].x - e.newBaseLine[0].x;
            const dy = e.newBaseLine[1].y - e.newBaseLine[0].y;
            const dz = e.newBaseLine[1].z - e.newBaseLine[0].z;
            if (Math.sqrt(dx * dx + dy * dy + dz * dz) < 0.1) {
                tooShort.push(e.wallId);
            }
        }
        if (missing.length > 0) {
            return {
                ok: false,
                reason: 'WALL_NOT_FOUND',
                blockingIssues: missing.map(id => `WALL_NOT_FOUND: ${id}`),
            };
        }
        if (tooShort.length > 0) {
            return {
                ok: false,
                reason: 'WALL_TOO_SHORT',
                blockingIssues: tooShort.map(id => `WALL_TOO_SHORT: ${id} minimum 0.1m`),
            };
        }

        // §HOSTED-OPENING-HOST-MOVE — the pre-flight half of the opening gate.
        // Until now this command had NO opening gate at all: it is the chokepoint
        // every structural wall cascade passes through (see the class doc), and a
        // cascade shortened a 4 m wall to 0.5 m while leaving its 0.9 m door
        // recorded at offset 1.0 — 1.4 m off the end of its host, with no clamp,
        // no refusal and no event (hostedOpeningHostMoveSeam §Z-4). That is the
        // EXACT defect §FIX-WALL-SHRINK-REFIT closed on UpdateWallBaselineCommand,
        // reachable through the OTHER command — and through a gesture the user
        // never aimed at the damaged wall, which makes it strictly worse.
        //
        // Declining HERE is the channel WallMoveReweldService already reads: it
        // calls canExecute() before execute() and logs the refusal (§MOVE-REWELD-
        // DISPATCH step 3). A deliberate policy refusal reaches the caller as a
        // decline, never as a throw.
        //
        // ATOMIC: one refused entry refuses the WHOLE cascade. The class contract
        // is "all entries applied atomically"; a partial weld would leave the
        // topology in a state no user asked for AND still damage nothing usefully.
        const openingIssues: string[] = [];
        for (const e of this.entries) {
            const wall = wallStore.getById(e.wallId);
            if (!wall) continue;   // already reported above
            const plan = wallOccupancyStore.planOpeningRebase(wall, e.newBaseLine);
            for (const r of plan.refusals) {
                openingIssues.push(`OPENING_DOES_NOT_FIT: ${e.wallId}: ${r.reason}`);
            }
        }
        if (openingIssues.length > 0) {
            return { ok: false, reason: 'OPENING_DOES_NOT_FIT', blockingIssues: openingIssues };
        }

        // ── §C83-S1-MOVE — no cascaded wall may be carried ONTO someone's opening ──
        //
        // ISSUE-LOG L-885, the neighbour half. The founder's console shows this
        // command firing immediately after the move they reported
        // (`EXECUTE: UPDATE_WALL_BASELINE` → `EXECUTE: CASCADE_WALL_BASELINE` →
        // `§MOVE-REWELD-DISPATCH: moved wall … → 1 junction re-weld(s)`), so a
        // gate on the moved wall alone would leave the carried neighbours
        // ungated — and a re-weld moves walls the user never dragged.
        //
        // Each entry is judged against the store as it stands. That is a
        // deliberate approximation and it is stated rather than hidden: the
        // cascade applies all entries together, so an entry is not tested against
        // its siblings' post-cascade positions. It cannot produce a FALSE refusal
        // (a wall landing on a door lands on it regardless of where its siblings
        // end up — openings travel with their host), and the residual miss is a
        // door on a sibling that is itself moving clear in the same cascade,
        // which is rarer than the defect this closes.
        //
        // ATOMIC, matching the arm above: one refused entry refuses the WHOLE
        // cascade, because a partial weld leaves a topology no user asked for.
        const _c83g = globalThis as unknown as {
            __pryzmProjectLoadActive?: boolean;
            __pryzmBuildingGenActive?: boolean;
        };
        if (
            _c83g.__pryzmProjectLoadActive !== true &&
            _c83g.__pryzmBuildingGenActive !== true
        ) {
            const allWalls = wallStore.getAll() as unknown as readonly WallData[];
            // §L-990 — the world as it stood BEFORE the gesture, or `null` when
            // no caller told us what the gesture was. `null` disables the
            // attribution arm entirely (see `movedSubject`).
            const preWalls = this.preGestureWalls(allWalls);
            const crossingIssues: string[] = [];
            const preExisting: string[] = [];
            for (const e of this.entries) {
                const wall = wallStore.getById(e.wallId);
                if (!wall) continue;
                const candidate: CandidateWall = {
                    id: e.wallId,   // excludes the subject from its own host list
                    levelId: wall.levelId,
                    thickness: typeof wall.thickness === 'number' ? wall.thickness : 0,
                    baseLine: [e.newBaseLine[0], e.newBaseLine[1]],
                    // §PRE-WELD-TRANSIENT — a cascade is ALL re-weld, so every
                    // entry's joined neighbours are mid-correction by definition.
                    ...(wall.baseLine?.[0] && wall.baseLine?.[1]
                        ? { currentBaseLine: [wall.baseLine[0], wall.baseLine[1]] as const }
                        : {}),
                    ...((wall as { curve?: unknown }).curve !== undefined
                        ? { curve: (wall as { curve?: unknown }).curve }
                        : {}),
                };
                const spatial = evaluateWallPlacement(candidate, allWalls);
                if (spatial.valid) continue;

                // ── §L-990 — ATTRIBUTION: DID THIS GESTURE CREATE THE CROSSING? ──
                //
                // MEASURED (`L990MoveReweldHostIdentity.measure.test.ts` §A/§B,
                // reproducing the founder's sentence to the digit): a stem `S`
                // terminating on the BODY of a wall `M` that hosts a window at
                // 4.000–5.000 overlaps that window by 0.063 m — and it did so
                // BEFORE anyone touched anything. Translating `M` carries `S`
                // with it by the same vector (§L-926 dependent-stem follow), so
                // the station of `S` along `M` is INVARIANT and the overlap is
                // the same 0.063 m afterwards. The old arm re-measured that
                // standing condition, attributed it to the drag, and refused —
                // and since no translation can change it, the wall could never
                // be moved again by any gesture. A refusal whose stated remedy
                // ("move the opening in the way first") is on the very wall the
                // user is dragging is the escape hatch that is not one.
                //
                // ⛔ THIS IS NARROW BY CONSTRUCTION AND MUST STAY SO. Only a
                // crossing that is the SAME crossing (same host, same opening)
                // and NO DEEPER than it already was is downgraded. A crossing
                // this cascade would newly create, or would deepen, still
                // refuses with its full sentence — §B-g (a partition slid along
                // until it passes clean through a door) is untouched, and so is
                // every geometric impossibility. This does not weaken the
                // predicate; it stops the predicate answering a question about
                // the past as if it were about the gesture.
                let novel: readonly WallCrossingViolation[] = spatial.violations;
                if (preWalls) {
                    // The BEFORE evaluation is static: no `currentBaseLine`,
                    // because there is no move in progress in that world. It can
                    // therefore only ever find MORE than the after evaluation,
                    // never fewer — which is the safe direction for a filter.
                    const priorCandidate: CandidateWall = {
                        id: candidate.id!,
                        levelId: candidate.levelId,
                        thickness: candidate.thickness,
                        baseLine: this.preGesturePose(e, wall),
                        ...(candidate.curve !== undefined ? { curve: candidate.curve } : {}),
                    };
                    const before = findWallOpeningCrossings(priorCandidate, preWalls).violations;
                    const priorDepth = new Map<string, number>();
                    for (const v of before) {
                        priorDepth.set(crossingKey(v), Math.max(priorDepth.get(crossingKey(v)) ?? 0, v.overlapM));
                    }
                    novel = spatial.violations.filter((v) => {
                        const prior = priorDepth.get(crossingKey(v));
                        return prior === undefined || v.overlapM > prior + PRE_EXISTING_TOL_M;
                    });
                }

                if (novel.length === 0) {
                    // REPORTED, NOT REFUSED — the same disposition §L-942-UNBLOCK
                    // gives the incumbent arm. The fact is true and the user is
                    // entitled to it; it is simply not a consequence of what they
                    // just did, so it may not veto what they just did.
                    preExisting.push(
                        `${e.wallId}: ` +
                        wallCrossesOpeningRefusalText(spatial.violations, []),
                    );
                    continue;
                }

                // §L-990 — THE CANDIDATE IS NAMED. `wallCrossesOpeningRefusalText`
                // says "this wall" and never which; the sibling
                // `OPENING_DOES_NOT_FIT` arm above has always prefixed `e.wallId`
                // and this one never did. The founder therefore read a sentence
                // about a CASCADED PARTNER as a sentence about the wall they
                // dragged, and concluded — reasonably — that a wall was colliding
                // with its own window. Offers are recomputed against the surviving
                // violations so the numbers in the sentence and the numbers in the
                // offer describe the same set (C83 §4.2).
                crossingIssues.push(
                    `${e.wallId}: ` +
                    wallCrossesOpeningRefusalText(
                        novel,
                        novel.length === spatial.violations.length
                            ? spatial.offers
                            : computeWallCrossingOffers(candidate, allWalls, novel, spatial.undetermined),
                    ),
                );
            }
            if (preExisting.length > 0) {
                console.warn(
                    `[CascadeWallBaselineCommand] §L-990 ${preExisting.length} crossing(s) in this ` +
                    `'${this.cause}' cascade were ALREADY STANDING before the gesture and are ` +
                    `REPORTED, NOT REFUSED — the same disposition §L-942-UNBLOCK gives the ` +
                    `incumbent arm. They are unchanged by this move; Ctrl+Z reverts the move but ` +
                    `will not remove them.`,
                    { preExisting },
                );
            }
            if (crossingIssues.length > 0) {
                return {
                    ok: false,
                    reason: 'OCC_CROSSES_HOSTED_OPENING',
                    blockingIssues: crossingIssues,
                    ...(preExisting.length > 0 ? { warnings: preExisting } : {}),
                };
            }
            if (preExisting.length > 0) {
                return { ok: true, warnings: preExisting };
            }
        }

        return { ok: true };
    }

    /**
     * §L-990 — the wall list AS IT STOOD BEFORE THE GESTURE, or `null` when that
     * is not knowable.
     *
     * Only ONE wall differs between the cascade's world and the pre-gesture
     * world at the moment `canExecute` runs: the SUBJECT, which has already been
     * re-baselined (on the real path by `UpdateWallBaselineCommand`, on the
     * pre-flight path by `moveReweldPreflight`'s shim). The cascade's own
     * entries have not been applied yet — that is what `canExecute` means — so
     * every other wall is already at its pre-gesture pose.
     *
     * Returns `null` without `movedSubject`, and the caller then attempts no
     * attribution at all. C83 §5.3's reading, applied to this question.
     */
    private preGestureWalls(all: readonly WallData[]): readonly WallData[] | null {
        const ms = this.movedSubject;
        if (!ms) return null;
        let found = false;
        const out = all.map((w) => {
            if (w.id !== ms.wallId) return w;
            found = true;
            return {
                ...w,
                baseLine: [{ ...ms.prevBaseLine[0] }, { ...ms.prevBaseLine[1] }],
            } as WallData;
        });
        // The subject is not in the list this command was handed. Rather than
        // pretend the reconstruction succeeded, decline to attribute anything.
        return found ? out : null;
    }

    /** §L-990 — where THIS entry's wall stood before the gesture. */
    private preGesturePose(
        e: CascadeWallBaselineEntry,
        wall: { baseLine?: readonly Point3D[] },
    ): readonly [Point3D, Point3D] {
        if (this.movedSubject && e.wallId === this.movedSubject.wallId) {
            return this.movedSubject.prevBaseLine;
        }
        // A caller that supplied `prevBaseLine` did so precisely because the
        // store was already mutated; prefer it over the store for that reason.
        if (e.prevBaseLine) return e.prevBaseLine;
        const bl = wall.baseLine;
        if (bl && bl.length >= 2) return [bl[0]!, bl[1]!];
        return [e.newBaseLine[0], e.newBaseLine[1]];
    }

    /**
     * P8 / C10 §2 — the cascade's span. Delegating rather than re-indenting a
     * ~140-line body keeps this an ADDITIVE change to a file three lanes have
     * touched this week; same idiom as `roomBoundarySketch.ts` in this package.
     */
    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.wall.cascadeBaseline', (span) => {
            try {
                span.setAttribute('pryzm.cascade.cause', this.cause);
                span.setAttribute('pryzm.cascade.entries', this.entries.length);
                const r = this._execute(ctx);
                span.setAttribute('pryzm.cascade.success', r.success);
                span.setAttribute('pryzm.cascade.affected', r.affectedElementIds.length);
                // A refused cascade re-baselines NOTHING — success:false with zero
                // affected ids is the atomic-abort path, not a partial write, and
                // the reason token is what tells the two apart in a trace.
                if (!r.success) span.setAttribute('pryzm.cascade.reason', r.error ?? r.info?.[0] ?? '');
                return r;
            } finally {
                span.end();
            }
        });
    }

    private _execute(ctx: CommandContext): CommandResult {
        if (this.executed) {
            return { success: false, affectedElementIds: [], info: ['Command already executed'] };
        }

        const wallStore = ctx.stores.wallStore;

        // Phase 1 — capture snapshots BEFORE any mutation. If any entry's wall
        // disappeared between canExecute() and execute(), abort cleanly without
        // touching the store (no partial cascade).
        for (const e of this.entries) {
            const wall = wallStore.getById(e.wallId);
            if (!wall) {
                return {
                    success: false,
                    affectedElementIds: [],
                    info: [`Wall ${e.wallId} disappeared between canExecute and execute`],
                };
            }
            const snapshot = serializeWallSnapshot(wall);
            // If the caller supplied prevBaseLine (live-drag scenarios where
            // the store is already at the new value), override the snapshot
            // baseLine so undo restores the pre-cascade position.
            if (e.prevBaseLine) {
                snapshot.baseLine = [
                    { x: e.prevBaseLine[0].x, y: e.prevBaseLine[0].y, z: e.prevBaseLine[0].z },
                    { x: e.prevBaseLine[1].x, y: e.prevBaseLine[1].y, z: e.prevBaseLine[1].z },
                ];
            }
            this.prevSnapshots.set(e.wallId, snapshot);
        }

        // Phase 1b — §HOSTED-OPENING-HOST-MOVE: plan the opening consequences
        // against the PRE-cascade walls, BEFORE any mutation, for the same
        // atomicity reason Phase 1 captures snapshots first. execute() re-asks
        // the gate canExecute() asked as defence in depth for any caller that
        // dispatched without validating; a refusal here leaves the store
        // completely untouched.
        const plans = new Map<string, OpeningRefitPlan>();
        const refusalSentences: string[] = [];
        for (const e of this.entries) {
            const wall = wallStore.getById(e.wallId)!;   // Phase 1 proved it exists
            const plan = wallOccupancyStore.planOpeningRebase(wall, e.newBaseLine);
            plans.set(e.wallId, plan);
            for (const r of plan.refusals) {
                refusalSentences.push(`${e.wallId}: ${r.reason}`);
            }
        }
        if (refusalSentences.length > 0) {
            const reason = refusalSentences.join('; ');
            console.warn(
                `[CascadeWallBaselineCommand] §HOSTED-OPENING-HOST-MOVE refusing ` +
                `'${this.cause}' cascade (${this.entries.length} entry/entries): ${reason} ` +
                `— no wall was re-baselined.`,
            );
            return {
                success: false,
                affectedElementIds: [],
                info: [`OPENING_DOES_NOT_FIT: ${reason}`],
                error: `OPENING_DOES_NOT_FIT: ${reason}`,
            };
        }

        // Phase 2 — apply all mutations. _renderVersion bumped per entry so the
        // builder dirty-check (§VIEW-DIRTY-CHECK §2.2) sees a real change.
        // §L-871/§L-872: the writes run inside the cross-service latch so no
        // wall-update reactor mistakes them for user moves (see the module doc).
        // §HOSTED-OPENING-HOST-MOVE: the opening re-writes are latched too — they
        // are part of the same structural propagation, and they must not read as
        // a fresh user edit to any reactor.
        this.relocated = new Map();
        _cascadeApplyDepth++;
        try {
            for (const e of this.entries) {
                const wall = wallStore.getById(e.wallId);
                const baseVersion = (wall?._renderVersion ?? 0) + 1;
                wallStore.update(e.wallId, {
                    baseLine: e.newBaseLine,
                    _renderVersion: baseVersion,
                } as any);
            }

            // Phase 3 — §HOSTED-OPENING-HOST-MOVE: re-seat the openings on the
            // walls that just changed. AFTER the baseline write and through
            // `reseatOpeningWithFrame` — which calls `updateOpening`, the
            // sanctioned opening-mutation API — so the store's own clamp sees the
            // NEW wall and agrees and `childrenIds` stays in lock-step with
            // `openings` (C15 §6). `relocations` only ever carries POSITION
            // (offset / sillHeight): anything whose authored width or height no
            // longer fits was refused above, so nothing reaching here can be
            // silently narrowed.
            //
            // §L-916-FRAME-RECORD-SYNC — this block used to call
            // `wallStore.updateOpening` DIRECTLY, and the comment here used to
            // claim that made "the hosted door/window record move with its
            // opening instead of desyncing". That was FALSE for the record that
            // matters. `updateOpening` writes the wall's `openings[]` (the VOID)
            // and WallStore's OWN window/door maps — but the FRAME MESH is built
            // by WindowBuilder/DoorBuilder from `windowStore`/`doorStore` in
            // @pryzm/geometry-window / -door, which nothing on this path touched.
            // WindowDependencyTracker then saw the host move and called
            // `touch()`, faithfully rebuilding the frame at the STALE offset on
            // the NEW baseline: the founder's clean void with no frame in it.
            // MEASURED at Δ 2.000 m — hostedOpeningFrameRecordDesync §D-2.
            for (const e of this.entries) {
                const plan = plans.get(e.wallId);
                if (!plan || plan.relocations.length === 0) continue;
                const pre: Opening[] = [];
                for (const r of plan.relocations) {
                    const next: Opening = {
                        ...r.opening,
                        offset:     r.next.offset,
                        sillHeight: r.next.sillHeight,
                    };
                    try {
                        reseatOpeningWithFrame(
                            wallStore, e.wallId, next, 'CascadeWallBaselineCommand',
                        );
                        pre.push(r.opening);   // PRE-edit record, for undo
                        console.log(
                            `[CascadeWallBaselineCommand] §HOSTED-OPENING-HOST-MOVE re-seated ` +
                            `${r.opening.type} ${r.opening.elementId ?? r.opening.id} on wall ` +
                            `${e.wallId}: offset ${r.opening.offset.toFixed(3)} → ` +
                            `${r.next.offset.toFixed(3)} m (cause '${this.cause}')`,
                        );
                    } catch (err) {
                        console.warn(
                            `[CascadeWallBaselineCommand] §HOSTED-OPENING-HOST-MOVE could not ` +
                            `re-seat opening ${r.opening.id} on wall ${e.wallId}:`, err,
                        );
                    }
                }
                if (pre.length > 0) this.relocated.set(e.wallId, pre);
            }
        } finally {
            _cascadeApplyDepth--;
        }

        this.executed = true;
        return { success: true, affectedElementIds: [...this.targetIds] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.executed || this.prevSnapshots.size === 0) {
            return { success: false, affectedElementIds: [], info: ['Nothing to undo'] };
        }
        const wallStore = ctx.stores.wallStore;
        // Restore in REVERSE order so any in-store hooks that observe
        // dependent walls see the same final state as before execute().
        // §L-871/§L-872: latched for the same reason as execute() — an undo
        // restore is structural propagation, not a user move.
        const restored: string[] = [];
        _cascadeApplyDepth++;
        try {
            for (const e of [...this.entries].reverse()) {
                const snap = this.prevSnapshots.get(e.wallId);
                if (snap) {
                    wallStore.restoreSnapshot(snap);
                    restored.push(e.wallId);
                }
                // §HOSTED-OPENING-HOST-MOVE — restoreSnapshot does NOT carry
                // `openings` (see the `relocated` field doc), so every opening
                // this cascade re-seated must be put back explicitly. Ordered
                // AFTER this wall's snapshot restore so the wall is already back
                // at its original length when the store re-runs its own clamp —
                // which is then a no-op, because these are exactly the offsets
                // that fitted before the cascade.
                //
                // §L-916-FRAME-RECORD-SYNC — the undo goes through the SAME seam
                // as execute(), deliberately. Syncing the frame record forward
                // only would trade a forward desync for an undo desync, which is
                // the same defect one keystroke later: ONE Ctrl+Z must put BOTH
                // records back (C70 C-INV-3). hostedOpeningFrameRecordDesync §D-4
                // is the row that fails if this line ever diverges from Phase 3.
                for (const opening of this.relocated.get(e.wallId) ?? []) {
                    try {
                        reseatOpeningWithFrame(
                            wallStore, e.wallId, opening, 'CascadeWallBaselineCommand.undo',
                        );
                    } catch (err) {
                        console.warn(
                            `[CascadeWallBaselineCommand] §HOSTED-OPENING-HOST-MOVE undo could ` +
                            `not restore opening ${opening.id} on wall ${e.wallId}:`, err,
                        );
                    }
                }
            }
        } finally {
            _cascadeApplyDepth--;
        }
        this.relocated = new Map();
        this.executed = false;
        return { success: true, affectedElementIds: restored };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            timestamp: this.timestamp,
            targetIds: [...this.targetIds],
            version:   1,
            payload: {
                cause: this.cause,
                entries: this.entries.map(e => ({
                    wallId: e.wallId,
                    newBaseLine: [
                        { x: e.newBaseLine[0].x, y: e.newBaseLine[0].y, z: e.newBaseLine[0].z },
                        { x: e.newBaseLine[1].x, y: e.newBaseLine[1].y, z: e.newBaseLine[1].z },
                    ],
                })),
            },
        };
    }
}
