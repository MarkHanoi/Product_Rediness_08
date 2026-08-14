// §FEAT-WALL-COLOR-BATCH (ADR-0314) — recolour MANY walls in ONE undo step.
//
// PRODUCT INTENT: "make all walls white" / "paint the selected walls #ff0000",
// dispatched by the RAC chat. The COMMAND is the deliverable; the chat is a
// thin wrapper in front of it, exactly like §FEAT-WALL-TYPE-BATCH.
//
// WHY A NEW COMMAND EXISTS AT ALL (the GAP-C evidence, ADR-0314 §Wall colour):
//   • `wall.updateColor` is the ONE live single-wall colour route (legacy
//     UpdateWallColorCommand → wallStore.updateWall() → fragment rebuild). It
//     is single-wall by payload; N dispatches would be N undo entries and N
//     rebuild storms.
//   • `wall.bulkSetVisuals` has the right batch shape but `produceCommand`s the
//     plugin's DETACHED DTO store — the §FIX-MATERIAL-DEAD-DISPATCH disease;
//     nothing that renders, exports or persists reads it. Wiring the chat to it
//     would repeat the exact lie Gate G7 removed from the inspector.
// So the missing primitive is "recolour a wall SET on the geometry store as one
// history entry", built the same way as UpdateWallsSystemTypeBatchCommand:
// pure orchestration over the proven single-wall command.
//
// DESIGN (same three house rules as the type batch):
//   1. REUSE, not rival — per wall this instantiates the existing
//      `UpdateWallColorCommand`; there is no second "recolour one wall" here.
//   2. ONE undo entry — the batch is a single Command on the history stack;
//      undo() replays each child's undo in reverse order.
//   3. §CONTEXT-DATA-HONESTY — per-wall refusals are recorded and grouped
//      ("Recoloured N of M walls — K skipped: <reason>"), all-refused is a
//      visible no-op via canExecute, empty scope declines with a message,
//      nothing here throws for a refusal.
//
// SCOPE: `wallIds: 'all'` = every wall in the project across ALL levels
// (`ctx.stores.wallStore` is project-wide); a per-level or filtered variant is
// expressible by passing the explicit id list.
//
// VALUE CONTRACT: `materialColor` must arrive as a '#rrggbb' hex string — the
// LANGUAGE side ("white", "light grey") is resolved by the chat resolver's
// colour value source; this command deliberately owns no colour-name table so
// there is exactly one name→hex site (ADR-0314 §Value sources).
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
import { UpdateWallColorCommand } from './UpdateWallColorCommand';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export interface UpdateWallsColorBatchInput {
    /** `'all'` = every wall in the project (ALL levels), or an explicit id list
     *  (e.g. the current selection filtered to walls). */
    wallIds: string[] | 'all';
    /** New override colour as '#rrggbb'. Omit to leave colour untouched. */
    materialColor?: string;
    /** Catalogue material id, or `null` to clear the binding. Omit = untouched. */
    materialId?: string | null;
}

/** One skipped wall, with the human-readable refusal it produced. */
export interface WallColorBatchSkip {
    wallId: string;
    reason: string;
}

export class UpdateWallsColorBatchCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_WALLS_COLOR_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    /** Children that actually EXECUTED — undo replays these in reverse. */
    private executedChildren: UpdateWallColorCommand[] = [];
    private _skipped: WallColorBatchSkip[] = [];

    constructor(private input: UpdateWallsColorBatchInput) {
        this.targetIds = input.wallIds === 'all' ? [] : [...input.wallIds];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly WallColorBatchSkip[] { return this._skipped; }

    private _resolveWallIds(ctx: CommandContext): string[] {
        if (this.input.wallIds === 'all') {
            return ctx.stores.wallStore.getAll().map((w: { id: string }) => w.id);
        }
        // De-dup an explicit list so one wall is never recoloured (or counted) twice.
        return Array.from(new Set(this.input.wallIds));
    }

    private _child(wallId: string): UpdateWallColorCommand {
        return new UpdateWallColorCommand({
            wallId,
            ...(this.input.materialColor !== undefined ? { materialColor: this.input.materialColor } : {}),
            ...(this.input.materialId !== undefined ? { materialId: this.input.materialId } : {}),
        });
    }

    private _valueLabel(): string {
        const parts: string[] = [];
        if (this.input.materialColor !== undefined) parts.push(this.input.materialColor);
        if (this.input.materialId !== undefined) {
            parts.push(this.input.materialId === null ? 'no material (cleared)' : `material "${this.input.materialId}"`);
        }
        return parts.join(' + ');
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (this.input.materialColor === undefined && this.input.materialId === undefined) {
            return { ok: false, reason: 'No visual properties specified — provide materialColor and/or materialId.' };
        }
        if (this.input.materialColor !== undefined && !HEX_COLOR_RE.test(this.input.materialColor)) {
            return { ok: false, reason: `materialColor must be a '#rrggbb' hex string, got "${this.input.materialColor}".` };
        }

        const ids = this._resolveWallIds(ctx);
        if (ids.length === 0) {
            // Empty scope is a VISIBLE decline, never a throw (§CONTEXT-DATA-HONESTY).
            return {
                ok: false,
                reason: this.input.wallIds === 'all'
                    ? 'There are no walls in this project to recolour.'
                    : 'No walls selected — select at least one wall first.',
            };
        }

        const refusals: string[] = [];
        let acceptable = 0;
        for (const wallId of ids) {
            const v = this._child(wallId).canExecute(ctx);
            if (v.ok) acceptable++;
            // §REFUSAL-IDENTITY (GE-09): a stated reason passes VERBATIM; a silent
            // child is NAMED as silent — never re-worded into a manufactured verdict.
            else refusals.push(childRefusalText(v.reason, 'UpdateWallColorCommand.canExecute', `wall ${wallId}`));
        }

        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} wall${ids.length === 1 ? '' : 's'} can take ` +
                    `${this._valueLabel()} — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.wall.updateColor.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];

                const ids = this._resolveWallIds(ctx);
                this.targetIds = [...ids];
                const affected: string[] = [];

                for (const wallId of ids) {
                    const child = this._child(wallId);
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({ wallId, reason: childRefusalText(v.reason, 'UpdateWallColorCommand.canExecute', `wall ${wallId}`) });
                        continue;
                    }
                    const r = child.execute(ctx);
                    if (r.success) {
                        this.executedChildren.push(child);
                        affected.push(wallId);
                    } else {
                        // Same seam, same discipline — a child that FAILED its execute
                        // without a message is named, not paraphrased as 'execution refused'.
                        this._skipped.push({ wallId, reason: childRefusalText(r.info?.[0], 'UpdateWallColorCommand.execute', `wall ${wallId}`) });
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

                const summary =
                    `Recoloured ${changed} of ${total} wall${total === 1 ? '' : 's'} to ` +
                    `${this._valueLabel()}` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.wall.colorBatch.total', total);
                span.setAttribute('pryzm.wall.colorBatch.changed', changed);
                span.setAttribute('pryzm.wall.colorBatch.skipped', skippedCount);
                span.setAttribute('pryzm.wall.colorBatch.scope', this.input.wallIds === 'all' ? 'all' : 'ids');

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
            payload: this.input,
        };
    }

    static deserialize(serialized: SerializedCommand): UpdateWallsColorBatchCommand {
        return new UpdateWallsColorBatchCommand(
            serialized.payload as UpdateWallsColorBatchInput,
        );
    }
}
