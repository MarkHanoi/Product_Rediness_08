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
import { evaluateWallPlacement, wallCrossesOpeningRefusalText } from '@pryzm/geometry-wall';
import type { Opening, OpeningRefitPlan } from '@pryzm/geometry-wall';
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
            const allWalls = wallStore.getAll();
            const crossingIssues: string[] = [];
            for (const e of this.entries) {
                const wall = wallStore.getById(e.wallId);
                if (!wall) continue;
                const spatial = evaluateWallPlacement(
                    {
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
                    },
                    allWalls,
                );
                if (!spatial.valid) {
                    crossingIssues.push(
                        wallCrossesOpeningRefusalText(spatial.violations, spatial.offers),
                    );
                }
            }
            if (crossingIssues.length > 0) {
                return {
                    ok: false,
                    reason: 'OCC_CROSSES_HOSTED_OPENING',
                    blockingIssues: crossingIssues,
                };
            }
        }

        return { ok: true };
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
