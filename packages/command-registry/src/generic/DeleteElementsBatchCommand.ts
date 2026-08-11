// §FEAT-SCOPED-DELETE (RAC Phase U9.2) — delete a RESOLVED id set in ONE undo
// step: "delete all furniture in the kitchen", "remove every window on level 2".
//
// ── WHY THIS COMPOSES RATHER THAN IMPLEMENTS ────────────────────────────────
//
// `DeleteElementCommand` is ~900 lines of per-kind delete semantics that took a
// string of production defects to get right: the window/door dual-store cascade
// (L-308, the mesh that survived the delete), the orphaned-hosted-element branch
// (L-82), the stair auto-opening heal (L-298), the neighbour-baseline snapshot
// that makes a wall delete reversible through the join resolver, and delegation
// to DeleteSlab/Column/Stair for their registry + SemanticGraph cleanup.
//
// A batch delete that re-derived any of that would be a second, worse copy of
// it, and the divergence would show up as elements that come back wrong on
// Ctrl-Z. So this command owns exactly ONE thing the child does not: making N
// deletes atomic in the undo stack, and reporting honestly about the ones that
// did not happen. Everything else is the child's, unchanged.
//
// ── UNDO ORDER IS REVERSE, AND THAT IS LOAD-BEARING ─────────────────────────
//
// Children are undone last-in-first-out. Deleting a wall cascades its hosted
// windows/doors; if a batch contains both a wall and one of its own windows,
// the window's child ran first (it was still hosted) and must be restored LAST,
// after its host wall is back. Reverse order is what makes that hold without
// this command knowing anything about hosting.
//
// ── HONEST PARTIAL OUTCOMES (§CONTEXT-DATA-HONESTY) ─────────────────────────
//
// "Deleted 40 of 42 — 2 skipped: Element <id> not found in any store". An id
// that vanished between scope resolution and execution is a COUNTED SKIP with
// its reason, never a silent shrink of the number and never a thrown batch.
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
import { DeleteElementCommand } from '../walls/DeleteElementCommand';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

export interface DeleteElementsBatchInput {
    /** The ids to delete. ALWAYS an explicit list — there is deliberately no
     *  `'all'` form. A destructive verb must be able to state the COUNT it is
     *  about to act on before the user confirms it, and `'all'` is a promise to
     *  find out afterwards. The chat resolves the scope to ids first. */
    elementIds: string[];
    /** Optional noun for the report copy ("furniture", "window"). Absent ⇒
     *  the neutral "element". Never used to FILTER — the ids are the scope. */
    elementKind?: string;
}

/** One id the batch could not delete, with the reason it gave. */
export interface DeleteBatchSkip {
    elementId: string;
    reason: string;
}

export class DeleteElementsBatchCommand implements Command {
    // The union of everything DeleteElementCommand can touch — the batch
    // affects exactly what its children affect, so the scope is copied from
    // the child rather than re-guessed.
    readonly affectedStores = [
        'wall', 'slab', 'column', 'curtainWall', 'furniture', 'handrail', 'roof', 'floor',
        'ceiling', 'beam', 'plumbing', 'stair', 'level', 'window', 'door',
    ] as const;
    id = crypto.randomUUID();
    type = CommandType.DELETE_ELEMENTS_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    private executedChildren: DeleteElementCommand[] = [];
    private _skipped: DeleteBatchSkip[] = [];

    constructor(private input: DeleteElementsBatchInput) {
        this.targetIds = [...new Set(input.elementIds)];
    }

    get skipped(): readonly DeleteBatchSkip[] { return this._skipped; }

    private get _noun(): string {
        return this.input.elementKind ?? 'element';
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const ids = this.targetIds;
        if (ids.length === 0) {
            return { ok: false, reason: 'No elements to delete.' };
        }
        // ALL-OR-NOTHING is deliberately NOT the rule here (unlike a retype):
        // a scope of 42 furniture items where one id has already gone stale is
        // still a sentence worth executing. What is refused is a batch where
        // NOTHING is deletable — that is a scope the user got wrong, and
        // silently doing nothing while reporting success is the lie this
        // repository has fixed too many times.
        const refusals: string[] = [];
        let deletable = 0;
        for (const id of ids) {
            const v = new DeleteElementCommand(id).canExecute(ctx);
            if (v.ok) deletable++;
            else refusals.push(v.reason ?? `Element ${id} could not be deleted`);
        }
        if (deletable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} ${this._noun}${ids.length === 1 ? '' : 's'} could be ` +
                    `deleted — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.element.delete.batch', (span) => {
            try {
                this.executedChildren = [];
                this._skipped = [];

                const ids = this.targetIds;
                const deleted: string[] = [];

                for (const id of ids) {
                    const child = new DeleteElementCommand(id);
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({ elementId: id, reason: v.reason ?? 'not deletable' });
                        continue;
                    }
                    let r: CommandResult;
                    try {
                        r = child.execute(ctx);
                    } catch (e) {
                        // A child that throws (the element vanished between the
                        // guard and the delete, or a cascade hit a torn store)
                        // becomes a counted skip. A batch must never take the
                        // whole ask down with one bad id.
                        this._skipped.push({ elementId: id, reason: (e as Error).message });
                        continue;
                    }
                    if (r.success) {
                        this.executedChildren.push(child);
                        deleted.push(...r.affectedElementIds);
                    } else {
                        this._skipped.push({
                            elementId: id,
                            reason: r.info?.[0] ?? 'the delete was refused',
                        });
                    }
                }

                const total = ids.length;
                const done = this.executedChildren.length;
                const skippedCount = this._skipped.length;

                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) {
                    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                }
                const reasonLines = [...reasonCounts.entries()].map(
                    ([reason, count]) => `${count}× ${reason}`,
                );

                // `deleted` counts CASCADED ids too (a wall's openings, a
                // table's chairs), so it is reported separately from the N-of-M
                // the user asked for — conflating them would overstate the ask.
                const cascaded = deleted.length - done;
                const summary =
                    `Deleted ${done} of ${total} ${this._noun}${total === 1 ? '' : 's'}` +
                    (cascaded > 0 ? ` (plus ${cascaded} hosted/child element${cascaded === 1 ? '' : 's'})` : '') +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.delete.batch.total', total);
                span.setAttribute('pryzm.delete.batch.deleted', done);
                span.setAttribute('pryzm.delete.batch.skipped', skippedCount);
                span.setAttribute('pryzm.delete.batch.kind', this._noun);

                return {
                    success: done > 0,
                    affectedElementIds: deleted,
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
        const restored: string[] = [];
        // REVERSE order — see the header: a hosted child deleted by its own
        // host's cascade must come back after the host does.
        for (let i = this.executedChildren.length - 1; i >= 0; i--) {
            const child = this.executedChildren[i];
            if (!child) continue;
            const r = child.undo(ctx);
            if (r.success) restored.push(...r.affectedElementIds);
        }
        return { success: true, affectedElementIds: restored };
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

    static deserialize(serialized: SerializedCommand): DeleteElementsBatchCommand {
        return new DeleteElementsBatchCommand(
            serialized.payload as unknown as DeleteElementsBatchInput,
        );
    }
}
