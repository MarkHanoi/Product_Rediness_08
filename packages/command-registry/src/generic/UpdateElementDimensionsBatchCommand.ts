// §FEAT-BULK-DIMENSIONS (L-949) — change ONE OR SEVERAL dimensions on a
// RESOLVED SET of elements, in ONE undo step: "make all windows 2 meters
// height", "make all doors 2m wide by 1m high with 0.1 sill".
//
// ── THE FOUNDER'S ASK, AND WHY IT HAD NO ROUTE ──────────────────────────────
//
// "I have requested the possibility to ask to bulk change any element (doors,
// windows, walls) dimensions (or multiple dims)." Every dimension route on the
// bus was SELECTION-scoped and SINGLE-element: `element.updateParameters` takes
// one `elementId`. "All windows" had no expression at the command layer, so the
// chat could only decline — and it did, out loud
// (§FIX-CHAT-DIMENSION-ALL-SCOPE: "set all slabs thickness to 0.2m" used to
// resize the ONE selected wall, so the grammar was made to refuse instead).
// That refusal was correct and it stays correct; what it lacked was the escape
// hatch this command is (L-942: a refusing half and its escape hatch ship
// together, or neither ships).
//
// ── HOW THIS ANSWERS ADR-0314 RATHER THAN IGNORING IT ───────────────────────
//
// ADR-0314 D3 rules that `set-dimensions` "stays one-element-only (its contract
// is one dispatch = one rebuild for one element)", and D2 says that where no
// batch command exists the chat may fan out per element "only with an honest
// summary — fan-out is a STOPGAP; per-family batch commands are the roadmap
// answer." This command IS that roadmap answer, and it keeps every property the
// one-element contract bought:
//
//   1. THE SET IS RESOLVED ONCE, BY THE CALLER, BEFORE DISPATCH. The chat
//      resolves `'all'` / a level / a room to explicit ids through the ONE
//      injected scope resolver and hands them over. This command NEVER re-reads
//      the selection, and there is deliberately no `'all'` form in the payload
//      (see `elementIds`) — a mass edit that promises to find out its own size
//      afterwards cannot state a real count on the Confirm card.
//   2. ONE DISPATCH = ONE REBUILD, PER ELEMENT. Every requested dimension for a
//      given element travels in ONE child `UpdateElementParameterCommand`, so a
//      hosted opening's id is re-minted once, AFTER all of its values are
//      applied — exactly the property §FIX-CHAT-COMPOUND-DIMENSIONS proved in
//      production. Fanning `set-dimensions` out as N SEPARATE dispatches per
//      element is what ADR-0314 forbade, and it is not what happens here.
//   3. A STALE ID IS REFUSED, NEVER REPAIRED AND NEVER SILENTLY DROPPED.
//      C13 §3.12 (§C13-STALE-AFTER-CLEAR, ADR-0299 §RECOVERY-MUST-REFUSE): an
//      id the authoritative store no longer holds becomes a COUNTED SKIP with
//      the child's own words, reported as "Changed N of M — K skipped". It is
//      never healed by re-resolving the scope (which would act on elements the
//      user never named) and never quietly removed from the denominator.
//   4. ONE UNDO ENTRY, bought by dispatching ONE command — never by holding a
//      batch open (C16 §8.6 B-6). `undo()` replays the children in reverse.
//
// ── WHY IT COMPOSES `UpdateElementParameterCommand` ─────────────────────────
//
// That command is the LIVE single-element dimension route the property panel,
// the CRDT read leg and the chat's own compound arm all already use: it routes
// by `elementType` to the geometry store the builders read, clamps openings,
// and triggers the per-kind rebuild. Re-deriving any of that here would be a
// second, worse copy whose divergence would show up as elements that come back
// wrong on Ctrl+Z.
//
// ── L-947 (the child's HARD-CODED `affectedStores = ["wall"]`) ──────────────
//
// The child declares `affectedStores = ["wall"] as const` while its
// `resolveStore()` routes fifteen kinds — a known HIGH defect being fixed
// concurrently. It does NOT reach this command's undo, and the reason is
// structural rather than lucky:
//
//   • `CommandManagerImpl` takes the transaction snapshot from the TOP-LEVEL
//     command's `affectedStores` (Contract 01 §2.2), and the top-level command
//     here is THIS one. `affectedStores` below is the UNION of everything the
//     child can route to — the same discipline `DeleteElementsBatchCommand`
//     uses — so the rollback snapshot covers every store a child may write.
//   • Ctrl+Z runs `entry.command.undo()`, i.e. THIS command's `undo()`, which
//     replays each child's own `undo()`. That path reads no `affectedStores`
//     at all.
//
// So this batch's undo is correct independently of L-947. What L-947 still
// governs is the SINGLE-element `element.updateParameters` route, which is not
// this file.
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
import { UpdateElementParameterCommand } from './UpdateElementParameterCommand';
import { childRefusalText } from '../refusal/childRefusalText';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/** The dimension fields this batch carries. Deliberately a CLOSED set: each one
 *  is a field the chat's single-dimension capability already proves live for the
 *  kinds it is dispatched against, and a field nothing reads is the
 *  ElementCapabilities lie (a write reported as "Done" over a no-op). */
export interface BatchDimensions {
    height?: number;
    width?: number;
    thickness?: number;
    sillHeight?: number;
}

export const BATCH_DIMENSION_KEYS = ['height', 'width', 'thickness', 'sillHeight'] as const;
export type BatchDimensionKey = (typeof BATCH_DIMENSION_KEYS)[number];

export interface UpdateElementDimensionsBatchInput {
    /** The ids to resize. ALWAYS an explicit list — there is deliberately no
     *  `'all'` form. A mass edit must be able to state the COUNT it is about to
     *  act on before the user agrees to it, and `'all'` is a promise to find out
     *  afterwards. The caller resolves the scope to ids first. */
    elementIds: string[];
    /** The element kind every id is expected to be, for the child's store
     *  routing and the report copy. */
    elementKind: string;
    /** One or more dimensions, all applied to every element in ONE child
     *  dispatch each (see header §2). */
    dimensions: BatchDimensions;
}

/** One id the batch could not resize, with the reason it gave. */
export interface DimensionBatchSkip {
    elementId: string;
    reason: string;
}

export class UpdateElementDimensionsBatchCommand implements Command {
    // THE UNION of everything `UpdateElementParameterCommand.resolveStore()` can
    // route to. The batch affects exactly what its children affect, so the scope
    // is copied from the child's switch rather than re-guessed — and, because
    // the snapshot is taken from the TOP-LEVEL command, this is what makes the
    // rollback correct despite L-947 (see header).
    readonly affectedStores = [
        'wall', 'slab', 'column', 'beam', 'stair', 'curtainWall', 'roof',
        'furniture', 'handrail', 'window', 'door',
    ] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_ELEMENT_DIMENSIONS_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    /** Children that actually EXECUTED — undo replays these in reverse. */
    private executedChildren: UpdateElementParameterCommand[] = [];
    private _skipped: DimensionBatchSkip[] = [];

    constructor(private input: UpdateElementDimensionsBatchInput) {
        // De-dup so one element is never resized (or counted) twice.
        this.targetIds = [...new Set(input.elementIds)];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly DimensionBatchSkip[] { return this._skipped; }

    private get _noun(): string {
        return this.input.elementKind || 'element';
    }

    /** The requested dimensions as a plain parameter bag, with every absent /
     *  non-finite field dropped. A NaN reaching the store is the failure mode
     *  `validateParameters` exists to catch; dropping it here means the batch
     *  refuses in `canExecute` instead of writing a poisoned field. */
    private _parameters(): Record<string, number> {
        const out: Record<string, number> = {};
        for (const key of BATCH_DIMENSION_KEYS) {
            const v = this.input.dimensions?.[key];
            if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
        }
        return out;
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const ids = this.targetIds;
        if (ids.length === 0) {
            // §NO-EMPTY-MEANS-UNKNOWN — an empty target set is a VISIBLE decline,
            // never a cheerful no-op reporting success.
            return { ok: false, reason: `No ${this._noun}s to resize.` };
        }
        const parameters = this._parameters();
        if (Object.keys(parameters).length === 0) {
            return {
                ok: false,
                reason: 'No dimensions were given — say at least one, e.g. "make all windows 2m high".',
            };
        }
        // ALL-OR-NOTHING is deliberately NOT the rule ACROSS the batch (it IS
        // the rule PER ELEMENT — one inapplicable property refuses that whole
        // element, which is the child's own contract). A scope of 42 windows
        // where one id has gone stale is still a sentence worth executing. What
        // is refused is a batch where NOTHING is resizable — that is a scope the
        // user got wrong, and silently doing nothing while reporting success is
        // the lie this repository has fixed too many times.
        const refusals: string[] = [];
        let acceptable = 0;
        for (const id of ids) {
            const v = new UpdateElementParameterCommand({
                elementId: id,
                elementType: this.input.elementKind,
                parameters,
            }).canExecute(ctx);
            if (v.ok) acceptable++;
            else {
                refusals.push(childRefusalText(
                    v.reason,
                    'UpdateElementParameterCommand.canExecute',
                    `${this._noun} ${id}`,
                ));
            }
        }
        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} ${this._noun}${ids.length === 1 ? '' : 's'} could be ` +
                    `resized — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.element.updateDimensions.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];

                const ids = this.targetIds;
                const parameters = this._parameters();
                const changed: string[] = [];

                for (const id of ids) {
                    // ONE child per element, carrying EVERY requested dimension —
                    // header §2. Never one child per (element × dimension).
                    const child = new UpdateElementParameterCommand({
                        elementId: id,
                        elementType: this.input.elementKind,
                        parameters,
                    });
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({
                            elementId: id,
                            reason: childRefusalText(
                                v.reason,
                                'UpdateElementParameterCommand.canExecute',
                                `${this._noun} ${id}`,
                            ),
                        });
                        continue;
                    }
                    let r: CommandResult;
                    try {
                        r = child.execute(ctx);
                    } catch (e) {
                        // A child that throws (the element vanished between the
                        // guard and the write, or a store refused) becomes a
                        // COUNTED skip. A batch must never take the whole ask
                        // down with one bad id.
                        this._skipped.push({ elementId: id, reason: (e as Error).message });
                        continue;
                    }
                    if (r.success) {
                        this.executedChildren.push(child);
                        changed.push(id);
                    } else {
                        this._skipped.push({
                            elementId: id,
                            reason: childRefusalText(
                                r.info?.[0],
                                'UpdateElementParameterCommand.execute',
                                `${this._noun} ${id}`,
                            ),
                        });
                    }
                }

                const total = ids.length;
                const done = changed.length;
                const skippedCount = this._skipped.length;

                // Group identical refusal reasons so N identical skips read as
                // ONE line ("12× window not found"), never twelve.
                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) {
                    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                }
                const reasonLines = [...reasonCounts.entries()].map(
                    ([reason, count]) => `${count}× ${reason}`,
                );

                const dimensionWords = Object.entries(parameters)
                    .map(([k, v]) => `${DIMENSION_LABELS[k as BatchDimensionKey] ?? k} ${v} m`)
                    .join(', ');
                const summary =
                    `Changed ${done} of ${total} ${this._noun}${total === 1 ? '' : 's'} ` +
                    `(${dimensionWords})` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.dimensions.batch.total', total);
                span.setAttribute('pryzm.dimensions.batch.changed', done);
                span.setAttribute('pryzm.dimensions.batch.skipped', skippedCount);
                span.setAttribute('pryzm.dimensions.batch.kind', this._noun);
                span.setAttribute('pryzm.dimensions.batch.fields', Object.keys(parameters).join(','));

                return {
                    success: done > 0,
                    affectedElementIds: changed,
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
        // Reverse order — symmetric with execution. Each child restores the
        // PRE-EDIT value of exactly the keys it authored (its
        // §UNDO-SCOPED-TO-AUTHORED-FIELDS snapshot), so an unrelated field a
        // collaborator changed in between is not collateral damage (C03 §4.5-4.8).
        const affected: string[] = [];
        for (let i = this.executedChildren.length - 1; i >= 0; i--) {
            const child = this.executedChildren[i];
            if (!child) continue; // noUncheckedIndexedAccess — in range by construction
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

    static deserialize(serialized: SerializedCommand): UpdateElementDimensionsBatchCommand {
        return new UpdateElementDimensionsBatchCommand(
            serialized.payload as unknown as UpdateElementDimensionsBatchInput,
        );
    }
}

/** How each field is SPOKEN in the report — "sill height", never "sillHeight". */
const DIMENSION_LABELS: Readonly<Record<BatchDimensionKey, string>> = {
    height: 'height',
    width: 'width',
    thickness: 'thickness',
    sillHeight: 'sill height',
};
