// §FEAT-WALL-RAKE-BATCH (ADR-0315 U-phase, founder ask #1) — rake MANY walls
// in ONE undo step: "make all walls angled by 120 degrees".
//
// PRODUCT INTENT: "make the selected walls angled by 70" / "all walls on the
// ground floor angled by 60" / "make all walls angled by 120 degrees",
// dispatched by the RAC chat. The COMMAND is the deliverable; the chat is a
// thin wrapper in front of it, exactly like §FEAT-WALL-COLOR-BATCH.
//
// WHY A NEW COMMAND EXISTS AT ALL:
//   • The ONE live single-wall rake route is `element.updateParameters`
//     (`UpdateElementParameterCommand` with `{ rakeAngleDeg }` — the property
//     panel's path, L-813-hardened rebuild included). It is single-wall by
//     payload; N dispatches would be N undo entries and N rebuild storms.
//   • CRITICALLY, that generic command does NOT consult `rakeAuthorability` —
//     `WallStore.update` refuses internally and the command still reports
//     success. A naive fan-out would tell the user "raked 24 walls" while the
//     curved/layered/opening-hosting ones silently stayed vertical: a refusal
//     and a success would be the same value, the §CONTEXT-DATA-HONESTY defect
//     (L-716, L-752, L-779). The property panel pre-checks for exactly this
//     reason (PropertyDescriptorGenerator.rakeRefusalReason); a batch must too.
// So the missing primitive is "rake a wall SET on the geometry store as one
// history entry, refusing per wall with the store's OWN policy", built the
// same way as UpdateWallsColorBatchCommand: pure orchestration over the
// proven single-wall command.
//
// DESIGN (same three house rules as the colour batch):
//   1. REUSE, not rival — the authorability judgement is the exported single
//      gate `rakeAuthorability` from @pryzm/geometry-wall (the same function
//      `WallStore.update` itself consults — one policy, one place, C65 §3.5),
//      and per wall this instantiates the existing UpdateElementParameterCommand.
//   2. ONE undo entry — the batch is a single Command on the history stack;
//      undo() replays each child's undo in reverse order.
//   3. §CONTEXT-DATA-HONESTY — per-wall refusals are recorded and grouped
//      ("Raked N of M walls — K skipped: <reason>"), all-refused is a visible
//      no-op via canExecute, empty scope declines with a message.
//
// SCOPE: `wallIds: 'all'` = every wall in the project across ALL levels; a
// per-level / per-room / selection variant is expressible by passing the
// explicit id list (the chat's ScopeResolver produces it).
//
// VALUE CONTRACT: `rakeAngleDeg` in degrees, 90 = vertical, valid range
// [RAKE_MIN_DEG, RAKE_MAX_DEG] (15–165). The LANGUAGE side ("angled by 70",
// "make them vertical") is resolved by the chat; this command owns no phrase
// table.
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
import {
    rakeAuthorability,
    arcMinTurnRadius,
    isRakeInRange,
    RAKE_MIN_DEG,
    RAKE_MAX_DEG,
    type RakeSubject,
} from '@pryzm/geometry-wall';
import { UpdateElementParameterCommand } from '../generic/UpdateElementParameterCommand';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

export interface UpdateWallsRakeBatchInput {
    /** `'all'` = every wall in the project (ALL levels), or an explicit id list
     *  (selection / level / room scopes resolved by the caller). */
    wallIds: string[] | 'all';
    /** Target lean in degrees; 90 = vertical. Range [15, 165]. */
    rakeAngleDeg: number;
}

/** One skipped wall, with the human-readable refusal it produced. */
export interface WallRakeBatchSkip {
    wallId: string;
    reason: string;
}

/** The wall-record subset this batch reads to judge authorability. Field
 *  fallbacks mirror the property panel's (layers may live on the record or on
 *  its wallType; openings may be `openings` or legacy `childrenIds`). */
interface WallRecordLike {
    readonly id: string;
    readonly curve?: unknown;
    readonly layers?: ReadonlyArray<unknown>;
    readonly wallType?: { readonly layers?: ReadonlyArray<unknown> };
    readonly openings?: ReadonlyArray<unknown>;
    readonly childrenIds?: ReadonlyArray<unknown>;
}

/**
 * §FEAT-RAKE-CURVED — the wall's tightest centreline turn radius, or `undefined` when this
 * record cannot answer (straight wall, malformed curve, missing baseline).
 *
 * `undefined` is deliberate and is NOT `Infinity`: it means *"this record did not tell
 * me"*, which `rakeAuthorability` reads as unjudgeable. A STRAIGHT wall never needs a
 * radius because the collapse arm does not apply to it at all — so returning `undefined`
 * there costs nothing and avoids asserting a fact about a curve that does not exist.
 */
function _curveMinRadius(w: WallRecordLike): number | undefined {
    const rec = w as unknown as {
        baseLine?: ReadonlyArray<{ x: number; z: number }>;
        curve?: { control?: { x: number; z: number }; segments?: number } | null;
    };
    if (!rec.curve || !rec.curve.control || !rec.baseLine || rec.baseLine.length < 2) return undefined;
    try {
        const r = arcMinTurnRadius(rec as never);
        return Number.isFinite(r) ? r : undefined;
    } catch {
        // A radius we cannot compute is a radius we must not pretend to know.
        return undefined;
    }
}

export class UpdateWallsRakeBatchCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_WALLS_RAKE_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    /** Children that actually EXECUTED — undo replays these in reverse. */
    private executedChildren: UpdateElementParameterCommand[] = [];
    private _skipped: WallRakeBatchSkip[] = [];

    constructor(private input: UpdateWallsRakeBatchInput) {
        this.targetIds = input.wallIds === 'all' ? [] : [...input.wallIds];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly WallRakeBatchSkip[] { return this._skipped; }

    private _resolveWalls(ctx: CommandContext): WallRecordLike[] {
        const store = ctx.stores.wallStore as unknown as {
            getAll(): WallRecordLike[];
            getById?(id: string): WallRecordLike | undefined;
        };
        if (this.input.wallIds === 'all') return store.getAll();
        const out: WallRecordLike[] = [];
        // De-dup an explicit list so one wall is never raked (or counted) twice.
        for (const id of new Set(this.input.wallIds)) {
            const w = store.getById?.(id);
            if (w !== undefined) out.push(w);
            else this._skipped.push({ wallId: id, reason: 'wall not found' });
        }
        return out;
    }

    /** The store's OWN refusal policy, applied to the TARGET angle on this
     *  wall's actual shape — never a re-typed copy of the rules. */
    private _refusal(w: WallRecordLike): string | null {
        // §FEAT-RAKE-CURVED — `height` and `curveMinRadiusM` are supplied HERE, and this is
        // not optional politeness. `rakeAuthorability`'s curved-collapse arm needs both to
        // run, and it treats "absent" as UNJUDGEABLE and lets the wall through — the
        // §CONTEXT-DATA-HONESTY shape. That is right for a caller that holds neither (a
        // property panel judging a wall TYPE) and WRONG for this one: a batch command holds
        // the actual wall records, so omitting them would silently disable the only
        // geometric refusal a curved rake still has. `RakeSubject.height` states that the
        // authoritative caller must supply both; this is that caller.
        const subject: RakeSubject = {
            rakeAngleDeg: this.input.rakeAngleDeg,
            curve: w.curve,
            layers: w.layers ?? w.wallType?.layers,
            openings: w.openings ?? w.childrenIds,
            height: typeof (w as { height?: number }).height === 'number'
                ? (w as { height?: number }).height
                : undefined,
            curveMinRadiusM: _curveMinRadius(w),
        };
        const verdict = rakeAuthorability(subject);
        return verdict.ok ? null : (verdict.reason ?? verdict.code ?? 'refused');
    }

    private _child(wallId: string): UpdateElementParameterCommand {
        return new UpdateElementParameterCommand({
            elementId: wallId,
            elementType: 'wall',
            parameters: { rakeAngleDeg: this.input.rakeAngleDeg },
        });
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const deg = this.input.rakeAngleDeg;
        if (typeof deg !== 'number' || !Number.isFinite(deg)) {
            return { ok: false, reason: 'rakeAngleDeg must be a finite number of degrees (90 = vertical).' };
        }
        if (!isRakeInRange(deg)) {
            return {
                ok: false,
                reason:
                    `A wall can lean between ${RAKE_MIN_DEG}° and ${RAKE_MAX_DEG}° ` +
                    `(90° = vertical); ${deg}° is outside that range.`,
            };
        }

        this._skipped = [];
        const walls = this._resolveWalls(ctx);
        if (walls.length === 0) {
            // Empty scope is a VISIBLE decline, never a throw (§CONTEXT-DATA-HONESTY).
            return {
                ok: false,
                reason: this.input.wallIds === 'all'
                    ? 'There are no walls in this project to rake.'
                    : 'None of the requested walls exist any more.',
            };
        }

        // Not-found ids are pre-announced too (mixed ⇒ proceed with a warning,
        // same contract as the colour batch's child-canExecute pass).
        const refusals: string[] = this._skipped.map(
            (s) => `Wall ${s.wallId}: ${s.reason}`,
        );
        let acceptable = 0;
        for (const w of walls) {
            const r = this._refusal(w);
            if (r === null) acceptable++;
            else refusals.push(r);
        }
        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${walls.length} wall${walls.length === 1 ? '' : 's'} can lean to ` +
                    `${deg}° — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.wall.updateRake.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];

                const walls = this._resolveWalls(ctx);
                this.targetIds = walls.map((w) => w.id);
                const affected: string[] = [];

                for (const w of walls) {
                    const refusal = this._refusal(w);
                    if (refusal !== null) {
                        this._skipped.push({ wallId: w.id, reason: refusal });
                        continue;
                    }
                    const child = this._child(w.id);
                    const r = child.execute(ctx);
                    if (r.success) {
                        this.executedChildren.push(child);
                        affected.push(w.id);
                    } else {
                        this._skipped.push({ wallId: w.id, reason: r.info?.[0] ?? 'execution refused' });
                    }
                }

                const total = walls.length + this._skipped.filter((s) => s.reason === 'wall not found').length;
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

                const deg = this.input.rakeAngleDeg;
                const summary =
                    `Raked ${changed} of ${total} wall${total === 1 ? '' : 's'} to ${deg}°` +
                    (deg === 90 ? ' (vertical)' : '') +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.wall.rakeBatch.total', total);
                span.setAttribute('pryzm.wall.rakeBatch.changed', changed);
                span.setAttribute('pryzm.wall.rakeBatch.skipped', skippedCount);
                span.setAttribute('pryzm.wall.rakeBatch.angleDeg', deg);
                span.setAttribute('pryzm.wall.rakeBatch.scope', this.input.wallIds === 'all' ? 'all' : 'ids');

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
        // Reverse order — symmetric with execution; each child restores the
        // exact prior rakeAngleDeg it snapshotted (including `undefined` for
        // never-raked walls, which resolveRakeDeg reads as vertical).
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
            payload: this.input,
        };
    }

    static deserialize(serialized: SerializedCommand): UpdateWallsRakeBatchCommand {
        return new UpdateWallsRakeBatchCommand(
            serialized.payload as UpdateWallsRakeBatchInput,
        );
    }
}
