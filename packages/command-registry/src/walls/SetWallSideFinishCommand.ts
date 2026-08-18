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
    side: WallFinishSide;
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

    private _child(wallId: string): SetWallSideFinishCommand {
        return new SetWallSideFinishCommand({
            wallId,
            side: this.input.side,
            finish: { ...this.input.finish },
        });
    }

    /**
     * THE HONEST REFUSAL, per wall. Returns the refusal text, or `null` to proceed.
     *
     * Only room-scoped requests can hit it: they are the only ones that ask a
     * GEOMETRIC question ("the face that looks into room X") rather than a
     * semantic one ("the interior finish").
     */
    private _sideRefusal(wallId: string): string | null {
        const counts = this.input.roomBoundCounts;
        if (!counts) return null;                    // not a room scope — nothing geometric asked
        if (this.input.side !== 'interior') return null; // "exterior" is never the shared face
        const auth = authoriseRoomScopedSideFinish(wallId, counts.get(wallId) ?? null);
        return auth.ok ? null : auth.text;
    }

    private _valueLabel(): string {
        const f = this.input.finish;
        return `${this.input.side} finish ${f.materialName ?? f.materialId}`;
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

        const refusals: string[] = [];
        let acceptable = 0;
        for (const wallId of ids) {
            const sideRefusal = this._sideRefusal(wallId);
            if (sideRefusal !== null) { refusals.push(sideRefusal); continue; }
            const v = this._child(wallId).canExecute(ctx);
            if (v.ok) acceptable++;
            // §REFUSAL-IDENTITY (GE-09): a stated reason passes VERBATIM; a silent
            // child is NAMED as silent — never re-worded into a manufactured verdict.
            else refusals.push(childRefusalText(v.reason, 'SetWallSideFinishCommand.canExecute', `wall ${wallId}`));
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

                for (const wallId of ids) {
                    const sideRefusal = this._sideRefusal(wallId);
                    if (sideRefusal !== null) {
                        this._skipped.push({ wallId, reason: sideRefusal });
                        continue;
                    }
                    const child = this._child(wallId);
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({
                            wallId,
                            reason: childRefusalText(v.reason, 'SetWallSideFinishCommand.canExecute', `wall ${wallId}`),
                        });
                        continue;
                    }
                    // §L960-STEP3 — asked BEFORE the child writes, because the
                    // question is "what will this wall look like afterwards" and
                    // `maskedSideAfterSetting` composes the next value itself.
                    const maskedSide = maskedSideAfterSetting(
                        (ctx.stores.wallStore.getById(wallId) ?? {}) as never,
                        this.input.side,
                        this.input.finish,
                    );
                    const r = child.execute(ctx);
                    if (r.success) {
                        this.executedChildren.push(child);
                        affected.push(wallId);
                        if (maskedSide) this._masked.push({ wallId, maskedSide });
                    } else {
                        this._skipped.push({
                            wallId,
                            reason: childRefusalText(r.info?.[0], 'SetWallSideFinishCommand.execute', `wall ${wallId}`),
                        });
                    }
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
                const maskedCount = this._masked.length;
                const maskedTail = maskedCount === 0
                    ? ''
                    : this.input.side === 'interior'
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
