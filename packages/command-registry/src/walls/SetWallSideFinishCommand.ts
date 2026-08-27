// §FEAT-WALL-SIDE-FINISH — set the finish material on ONE SIDE of a wall, and
// on a wall SET in ONE undo step.
//
// PRODUCT INTENT (founder, verbatim): "I want the possibility to change the wall
// layer finish material on EACH SIDE of the wall … plus this should be doable via
// AI chat, e.g. 'change / make all walls in room X finish wall Y', 'make all
// inner finishes walls in ground floor to X'."
//
// WHAT SIDE MEANS HERE. `'interior'` / `'exterior'` are the SEMANTIC side — the
// axis `WallLayerFunction` already declares (`'finish-interior'` /
// `'finish-exterior'`) and that `AddWallLayerBatchInput.side` already ships. They
// are NOT `WallData.frontSide`/`backSide`, the two GEOMETRIC faces, which have
// zero writers and zero readers repo-wide (measured 2026-08-18) and are therefore
// `undefined` at runtime. See `WallSideFinishResolver` for the full reasoning and
// for `authoriseRoomScopedSideFinish`, the refusal that fires where a request
// genuinely needs the geometric mapping.
//
// WHY NOT REUSE AddWallLayerBatchCommand. That command ADDS a construction layer
// and therefore MOVES the wall's thickness (§03-WALL-THICKNESS-CONTRACT §1:
// thickness == layer sum). Re-finishing a face must not move it by 12mm, and the
// founder's default wall (`wt-monolithic`) has ONE layer, so an in-stack write
// would make the two sides the same field. `sideFinishes` is a distinct,
// appearance-only assignment BESIDE the stack; the two commands are orthogonal
// and both remain correct for their own ask.
//
// DESIGN — the three house rules of the shipped batch commands, unchanged:
//   1. REUSE, not rival — the batch orchestrates the single-wall command below;
//      there is no second "set one wall's side finish" anywhere.
//   2. ONE undo entry — the batch is a single Command on the history stack;
//      undo() replays each child's undo in reverse order.
//   3. §CONTEXT-DATA-HONESTY — per-wall refusals are recorded and grouped
//      ("Finished N of M walls — K skipped: <reason>"), all-refused is a visible
//      no-op via canExecute, empty scope declines with a message, and nothing
//      here throws for a refusal.
//
// VALUE CONTRACT: the finish arrives RESOLVED — `{ materialId, materialColor
// '#rrggbb', materialName }`. The finish-NAME vocabulary ("plaster", "oak")
// lives in the chat resolver's ONE table (`ai-host/src/intents/finishRef.ts`),
// exactly as colour names live in `colorRef.ts`; this command owns no name table
// and reads no material library — so Lane Y's master-library work cannot break it.
//
// P8: execute() carries an OpenTelemetry span.

import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext,
} from '../types';
import { trace, type Tracer } from '@opentelemetry/api';
import { childRefusalText } from '../refusal/childRefusalText';
import { serializeWallSnapshot } from './wallSnapshotUtils';
import {
    withWallSideFinish,
    resolveWallSideFinish,
    authoriseRoomScopedSideFinish,
    maskedSideAfterSetting,
    describeSingleLayerRenderLimit,
    type WallFinishSide,
    type WallSideFinish,
} from '@pryzm/geometry-wall';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * §RACSIDE144 — the BATCH-ONLY widening. `@pryzm/geometry-wall`'s own
 * `WallFinishSide` stays exactly `'interior' | 'exterior'`: every SINGLE-wall
 * write (`SetWallSideFinishCommand` below) is still one side at a time, and
 * `withWallSideFinish` / `resolveWallSideFinish` / `maskedSideAfterSetting`
 * are untouched (C84 EI-8 — one producer per question, not re-typed here).
 * `'both'` exists only on the BATCH input: the founder's "inner and outer" ask
 * applies as TWO per-wall child writes inside ONE `SetWallSideFinishBatchCommand`
 * instance, so it stays ONE undo entry (C16 §8.6) rather than two commands.
 */
export type WallFinishSideOrBoth = WallFinishSide | 'both';

/** The concrete sides to write for a batch `side` value, in a fixed order.
 *  Order does not change the OUTCOME (`maskedSideAfterSetting`'s "exterior
 *  wins" rule is a fixed return value, not order-dependent), but a fixed order
 *  keeps a re-run (redo) deterministic and the masked-disclosure math sane —
 *  it reads the wall's CURRENT sideFinishes on each step, so writing exterior
 *  before interior lets the interior write see the just-written exterior. */
function sidesToApply(side: WallFinishSideOrBoth): readonly WallFinishSide[] {
    return side === 'both' ? ['exterior', 'interior'] : [side];
}

// ─── Single wall ─────────────────────────────────────────────────────────────

export interface SetWallSideFinishInput {
    wallId: string;
    side: WallFinishSide;
    finish: WallSideFinish;
}

/**
 * Sets the finish on ONE side of ONE wall, leaving the other side untouched.
 *
 * The independence is the whole feature, so the next value is composed by
 * `withWallSideFinish()` — which copies the untouched side BY VALUE. A spread
 * that shared a reference would produce exactly the "both faces are one value"
 * defect this model exists to avoid, and would still pass a naive round-trip
 * assertion.
 */
export class SetWallSideFinishCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    id = crypto.randomUUID();
    type = CommandType.SET_WALL_SIDE_FINISH;
    timestamp = Date.now();
    targetIds: string[];

    private prevSnapshot: any = null;

    constructor(private input: SetWallSideFinishInput) {
        this.targetIds = [input.wallId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const wall = ctx.stores.wallStore.getById(this.input.wallId);
        if (!wall) return { ok: false, reason: `Wall ${this.input.wallId} not found` };
        if (this.input.side !== 'interior' && this.input.side !== 'exterior') {
            return {
                ok: false,
                reason:
                    `side must be 'interior' or 'exterior' (the semantic side), got ` +
                    `"${String(this.input.side)}".`,
            };
        }
        const f = this.input.finish;
        if (!f || typeof f.materialId !== 'string' || f.materialId.length === 0) {
            return { ok: false, reason: 'finish.materialId is required.' };
        }
        if (f.materialColor !== undefined && !HEX_COLOR_RE.test(f.materialColor)) {
            return {
                ok: false,
                reason: `finish.materialColor must be a '#rrggbb' hex string, got "${f.materialColor}".`,
            };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const wall = ctx.stores.wallStore.getById(this.input.wallId);
        if (!wall) return { success: false, affectedElementIds: [] };

        this.prevSnapshot = serializeWallSnapshot(wall);

        const nextState: any = { ...serializeWallSnapshot(wall) };
        nextState.sideFinishes = withWallSideFinish(wall as any, this.input.side, this.input.finish);

        ctx.stores.wallStore.updateWall(nextState);
        return { success: true, affectedElementIds: [this.input.wallId] };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.prevSnapshot) return { success: false, affectedElementIds: [] };
        // restoreSnapshot() preserves metadata.version (no audit-trail drift).
        ctx.stores.wallStore.restoreSnapshot(this.prevSnapshot);
        return { success: true, affectedElementIds: [this.input.wallId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: this.input,
        };
    }
}

// ─── Batch ───────────────────────────────────────────────────────────────────

export interface SetWallSideFinishBatchInput {
    /** `'all'` = every wall in the project (ALL levels), or an explicit id list. */
    wallIds: string[] | 'all';
    /** §RACSIDE144 — `'both'` applies TWO per-wall child writes (exterior then
     *  interior), still ONE undo entry. See {@link WallFinishSideOrBoth}. */
    side: WallFinishSideOrBoth;
    finish: WallSideFinish;
    /**
     * Present ONLY when the scope came from a ROOM ("all walls in the kitchen").
     * Maps wallId → how many rooms bound that wall (`boundingRoomCount` from
     * `classifyFacades`). A wall bounding ≥2 rooms has TWO interior faces, and
     * which one looks into the named room is `frontSide`/`backSide` — never
     * written in this build. Those walls are REFUSED BY NAME rather than guessed
     * at, because guessing re-finishes the room next door and the user would
     * find out from a render.
     *
     * Absent ⇒ the scope was not room-derived ("all walls on the ground floor",
     * a selection, an explicit list), the semantic side is unambiguous, and no
     * geometric question is being asked. §NO-EMPTY-MEANS-UNKNOWN: an absent map
     * means "not a room scope", never "all counts are zero".
     */
    roomBoundCounts?: ReadonlyMap<string, number | null>;
}

export interface WallSideFinishBatchSkip {
    wallId: string;
    reason: string;
}

/**
 * §L960-STEP3 — a wall whose finish WAS written but which the 3D view cannot show.
 *
 * NOT a skip: the write is correct, wanted, undoable and visible in the property
 * panel and in schedules. What is missing is the PIXELS, and that is precisely the
 * half L-960 was about — the chat said "Done" and the drawing did not change.
 */
export interface WallSideFinishBatchMasked {
    wallId: string;
    /** The side that will NOT be visible in 3D once this write lands. */
    maskedSide: WallFinishSide;
}

export class SetWallSideFinishBatchCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    id = crypto.randomUUID();
    type = CommandType.SET_WALL_SIDE_FINISH_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    private executedChildren: SetWallSideFinishCommand[] = [];
    private _skipped: WallSideFinishBatchSkip[] = [];
    private _masked: WallSideFinishBatchMasked[] = [];

    constructor(private input: SetWallSideFinishBatchInput) {
        this.targetIds = input.wallIds === 'all' ? [] : [...input.wallIds];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly WallSideFinishBatchSkip[] { return this._skipped; }

    /**
     * Walls written successfully whose finish the 3D view cannot show (§L960-STEP3).
     *
     * ⚠ THIS IS A TRIPWIRE, NOT A LIVE PATH — and saying which it is, is the point.
     * Before L-960 the GPU-instanced arm and every plain fragment arm dropped the
     * finish silently, so ANY 1-layer wall landed here in spirit and the user was
     * told "Done" anyway. Those arms honour it now, so a wall that carries ONE
     * finish always renders it and this list stays EMPTY.
     *
     * What survives is a property of the GEOMETRY and not of the renderer: a wall
     * drawn as one solid has ONE surface, so if BOTH sides carry a finish only one
     * of them can be painted. That case is real, and it must be said in the same
     * breath as "Done" rather than discovered from a render.
     */
    get masked(): readonly WallSideFinishBatchMasked[] { return this._masked; }

    private _resolveWallIds(ctx: CommandContext): string[] {
        if (this.input.wallIds === 'all') {
            return ctx.stores.wallStore.getAll().map((w: { id: string }) => w.id);
        }
        // De-dup an explicit list so one wall is never finished (or counted) twice.
        return Array.from(new Set(this.input.wallIds));
    }

    /** §RACSIDE144 — `side` is now a PARAMETER, not read off `this.input.side`
     *  directly: a `'both'` batch input applies this per-wall via TWO children,
     *  one per real {@link WallFinishSide}, never a wall-set command that
     *  itself understands 'both'. */
    private _child(wallId: string, side: WallFinishSide): SetWallSideFinishCommand {
        return new SetWallSideFinishCommand({
            wallId,
            side,
            finish: { ...this.input.finish },
        });
    }

    /**
     * THE HONEST REFUSAL, per wall and per SIDE. Returns the refusal text, or
     * `null` to proceed.
     *
     * Only room-scoped requests can hit it: they are the only ones that ask a
     * GEOMETRIC question ("the face that looks into room X") rather than a
     * semantic one ("the interior finish"). §RACSIDE144 — `side` is now a
     * parameter so a `'both'` batch asks this once per real side; "exterior" is
     * never the shared face, so a `'both'` write is refused only on its
     * interior half, exactly as an `'interior'`-only write already was.
     */
    private _sideRefusal(wallId: string, side: WallFinishSide): string | null {
        const counts = this.input.roomBoundCounts;
        if (!counts) return null;             // not a room scope — nothing geometric asked
        if (side !== 'interior') return null; // "exterior" is never the shared face
        const auth = authoriseRoomScopedSideFinish(wallId, counts.get(wallId) ?? null);
        return auth.ok ? null : auth.text;
    }

    private _valueLabel(): string {
        const f = this.input.finish;
        const sideLabel = this.input.side === 'both' ? 'interior and exterior' : this.input.side;
        return `${sideLabel} finish ${f.materialName ?? f.materialId}`;
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const ids = this._resolveWallIds(ctx);
        if (ids.length === 0) {
            // Empty scope is a VISIBLE decline, never a throw (§CONTEXT-DATA-HONESTY).
            return {
                ok: false,
                reason: this.input.wallIds === 'all'
                    ? 'There are no walls in this project to finish.'
                    : 'No walls selected — select at least one wall first.',
            };
        }

        // §RACSIDE144 — a wall counts as ACCEPTABLE when at least one of its
        // requested sides can take the write; `'both'` tries both and a wall
        // is only unacceptable if NEITHER side can (both refusals are still
        // recorded, so a partial-side gate reads as a partial refusal, not a
        // silent narrowing).
        const isBoth = this.input.side === 'both';
        const refusals: string[] = [];
        let acceptable = 0;
        for (const wallId of ids) {
            let wallAcceptable = false;
            for (const side of sidesToApply(this.input.side)) {
                const subject = isBoth ? `wall ${wallId} (${side} face)` : `wall ${wallId}`;
                const sideRefusal = this._sideRefusal(wallId, side);
                if (sideRefusal !== null) { refusals.push(sideRefusal); continue; }
                const v = this._child(wallId, side).canExecute(ctx);
                if (v.ok) { wallAcceptable = true; continue; }
                // §REFUSAL-IDENTITY (GE-09): a stated reason passes VERBATIM; a silent
                // child is NAMED as silent — never re-worded into a manufactured verdict.
                refusals.push(childRefusalText(v.reason, 'SetWallSideFinishCommand.canExecute', subject));
            }
            if (wallAcceptable) acceptable++;
        }

        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} wall${ids.length === 1 ? '' : 's'} can take the ` +
                    `${this._valueLabel()} — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.wall.setSideFinish.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];
                this._masked = [];

                const ids = this._resolveWallIds(ctx);
                this.targetIds = [...ids];
                const affected: string[] = [];

                // §RACSIDE144 — `'both'` applies TWO per-wall child writes
                // (exterior then interior; see `sidesToApply`'s header for why
                // the order is fixed but does not change the outcome). A wall
                // is `affected` once if EITHER side actually landed — C84 EI-7
                // names WALLS changed, not sides — and a per-side failure is
                // still recorded as its own skip, so "changed 1 of 2 sides" is
                // never silently reported as either a full success or a full
                // refusal for that wall.
                const isBoth = this.input.side === 'both';
                for (const wallId of ids) {
                    let wallChanged = false;
                    let wallMaskedSide: WallFinishSide | null = null;
                    for (const side of sidesToApply(this.input.side)) {
                        const subject = isBoth ? `wall ${wallId} (${side} face)` : `wall ${wallId}`;
                        const sideRefusal = this._sideRefusal(wallId, side);
                        if (sideRefusal !== null) {
                            this._skipped.push({ wallId, reason: sideRefusal });
                            continue;
                        }
                        const child = this._child(wallId, side);
                        const v = child.canExecute(ctx);
                        if (!v.ok) {
                            this._skipped.push({
                                wallId,
                                reason: childRefusalText(v.reason, 'SetWallSideFinishCommand.canExecute', subject),
                            });
                            continue;
                        }
                        // §L960-STEP3 — asked BEFORE the child writes, because the
                        // question is "what will this wall look like afterwards" and
                        // `maskedSideAfterSetting` composes the next value itself. For
                        // 'both', the wall is re-read on EACH iteration, so the
                        // interior write (applied second) sees the exterior write
                        // (applied first) already landed — which is what lets this
                        // correctly detect "both sides now carry a finish" on a
                        // single-layer wall without a second copy of that rule.
                        const maskedSide = maskedSideAfterSetting(
                            (ctx.stores.wallStore.getById(wallId) ?? {}) as never,
                            side,
                            this.input.finish,
                        );
                        const r = child.execute(ctx);
                        if (r.success) {
                            // The child is retained for undo REGARDLESS of the read-back
                            // below: whatever the store did accept must still be revertible.
                            this.executedChildren.push(child);
                            // ── §WALL-FINISH-READBACK (L-1670 · C67 rule 12, C16 CA-21) ──
                            //
                            // "Set … on 59 of 59 walls" counted successful CALLS, never
                            // records. `SetWallSideFinishCommand.execute` returns
                            // `{ success: true }` the moment `updateWall()` returns — and
                            // `WallStore.updateWall` projects the snapshot onto a field
                            // WHITELIST, so a field it does not name is dropped in silence
                            // while the call still succeeds. That is not hypothetical: it is
                            // exactly L-995, where `sideFinishes` was missing from that
                            // whitelist and the chat reported 17 of 17 walls over a model
                            // nothing had touched. The whitelist is fixed, but a COUNT
                            // DERIVED FROM A RETURN VALUE cannot notice if it regresses.
                            //
                            // So the count is now MEASURED: re-read the record from the
                            // authority and ask the shipped ladder (`resolveWallSideFinish`,
                            // the one function that answers "what finish does this side
                            // carry?" — C84 EI-8, not a second spelling here) whether the
                            // side really carries what we just wrote. A side that fails is
                            // NOT counted as changed and is named as a skip, so the failure
                            // reads as a partial refusal instead of a confident lie.
                            const after = ctx.stores.wallStore.getById(wallId);
                            const landed = after
                                ? resolveWallSideFinish(after as never, side).materialId === this.input.finish.materialId
                                : false;
                            if (!landed) {
                                this._skipped.push({
                                    wallId,
                                    reason:
                                        `${subject}: the store accepted the write and reported success, but reading ` +
                                        `the record back shows its ${side} finish is NOT ` +
                                        `${this.input.finish.materialName ?? this.input.finish.materialId}. The value did ` +
                                        `not reach the authority, so nothing about this ${isBoth ? 'side' : 'wall'} changed — ` +
                                        `do not trust a success count over this wall.`,
                                });
                                continue;
                            }
                            wallChanged = true;
                            if (maskedSide) wallMaskedSide = maskedSide;
                        } else {
                            this._skipped.push({
                                wallId,
                                reason: childRefusalText(r.info?.[0], 'SetWallSideFinishCommand.execute', subject),
                            });
                        }
                    }
                    if (wallChanged) affected.push(wallId);
                    if (wallMaskedSide) this._masked.push({ wallId, maskedSide: wallMaskedSide });
                }

                const total = ids.length;
                const changed = affected.length;
                const skippedCount = this._skipped.length;

                // Group identical refusal reasons so 40 identical skips read as ONE line.
                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) {
                    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                }
                const reasonLines = [...reasonCounts.entries()].map(
                    ([reason, count]) => `${count}× ${reason}`,
                );

                // §L960-STEP3 — THE DISCLOSURE RIDES THE SUCCESS SENTENCE ITSELF.
                //
                // Deliberately concatenated into `summary` rather than appended as a
                // separate `info` line: L-960 is a chat that announced a change the
                // drawing did not carry, and a caveat on a line a UI may not render is
                // the same defect with an alibi. Whoever shows the success sentence
                // shows the caveat, or shows neither.
                //
                // The wording is `describeSingleLayerRenderLimit()` VERBATIM — the one
                // place that sentence is written (C84 EI-8) — with a lead-in that names
                // WHICH side is lost, because "interior" and "exterior" are not
                // interchangeable to the person who just asked for one of them.
                // §RACSIDE144 — `'both'` reads the SAME branch as `'interior'`:
                // the masked side is always 'interior' (the pure rule's fixed
                // answer, "exterior wins" on a single-layer wall), and for a
                // `'both'` request the user explicitly asked for the interior
                // face too, so "will NOT show it" is the honest statement —
                // not the "this now covers the interior" wording, which is only
                // for a REQUESTED exterior silently masking a PRE-EXISTING
                // interior the user did not just ask to change.
                const maskedCount = this._masked.length;
                const maskedTail = maskedCount === 0
                    ? ''
                    : this.input.side !== 'exterior'
                        ? ` — ⚠ on ${maskedCount} of them the 3D view will NOT show it: ` +
                          `${describeSingleLayerRenderLimit()}`
                        : ` — ⚠ on ${maskedCount} of them this now covers the interior finish ` +
                          `in the 3D view: ${describeSingleLayerRenderLimit()}`;

                const summary =
                    `Set the ${this._valueLabel()} on ${changed} of ${total} wall${total === 1 ? '' : 's'}` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '') +
                    maskedTail;

                span.setAttribute('pryzm.wall.sideFinishBatch.total', total);
                span.setAttribute('pryzm.wall.sideFinishBatch.changed', changed);
                span.setAttribute('pryzm.wall.sideFinishBatch.skipped', skippedCount);
                span.setAttribute('pryzm.wall.sideFinishBatch.maskedInView', maskedCount);
                span.setAttribute('pryzm.wall.sideFinishBatch.side', this.input.side);
                span.setAttribute('pryzm.wall.sideFinishBatch.scope', this.input.wallIds === 'all' ? 'all' : 'ids');

                return {
                    success: changed > 0,
                    affectedElementIds: affected,
                    info: [summary, ...reasonLines],
                };
            } catch (err) {
                span.recordException(err as Error);
                throw err;
            } finally {
                span.end();
            }
        });
    }

    undo(ctx: CommandContext): CommandResult {
        // Reverse order — symmetric with execution; each child restores its own
        // full pre-change wall snapshot (metadata.version preserved).
        const affected: string[] = [];
        for (let i = this.executedChildren.length - 1; i >= 0; i--) {
            const child = this.executedChildren[i];
            if (!child) continue; // noUncheckedIndexedAccess — index is in range by construction
            const r = child.undo(ctx);
            if (r.success) affected.push(...r.affectedElementIds);
        }
        return { success: true, affectedElementIds: affected };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: {
                wallIds: this.input.wallIds,
                side: this.input.side,
                finish: this.input.finish,
            },
        };
    }
}
