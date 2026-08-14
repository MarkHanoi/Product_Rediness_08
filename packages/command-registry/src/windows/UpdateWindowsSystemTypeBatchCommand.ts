// §FEAT-WINDOW-TYPE-BATCH (ADR-0315, founder ask #4) — retype MANY windows in
// ONE undo step: "change all windows to timber casement".
//
// PRODUCT INTENT: "change the window type to Steel Crittal Style" (selection) /
// "change all windows to upvc casement", dispatched by the RAC chat. The
// COMMAND is the deliverable; the chat is a thin wrapper, exactly like
// §FEAT-WALL-TYPE-BATCH one directory over.
//
// WHY A NEW COMMAND: the ONE live single-window type route is
// `UpdateWindowSystemTypeCommand` (§FIX-HOSTED-TYPE-CHANGE, L-620 — geometry
// `windowStore.update()` → WindowBuilder rebuild; the plugin-bus
// `window.setType` writes the DETACHED plugin DTO store and is precisely the
// disease this family exists to avoid). It is single-window by payload; N
// dispatches would be N undo entries. This batch orchestrates it per window:
//   1. REUSE, not rival — reference resolution is `resolveCatalogueRef` (the
//      ONE ladder) via `resolveWindowSystemTypeRef` below; per window the
//      child is the proven UpdateWindowSystemTypeCommand, whose
//      `planWindowTypeChange` gate (C15: id/openingId/host-wall/void
//      preserved) supplies the per-window refusals.
//   2. ONE undo entry — undo() replays each child's undo in reverse; each
//      child restores its EXACT pre-image via windowStore.replace() (C03 §4.5).
//   3. §CONTEXT-DATA-HONESTY — "Retyped N of M windows — K skipped: <reason>",
//      all-refused / empty scope = visible no-op via canExecute, never a throw;
//      an unresolvable type ref refuses by LISTING the real catalogue names.
//
// HOST WALLS: the child command writes NOTHING to the wall store (C15), but the
// reveal/lining render map is resolved at wall-build time, so the caller (the
// initBusHandlers bridge) nudges the affected host walls exactly as the
// Inspector's element.changeType route does.
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
    windowStore,
    windowSystemTypeStore,
    type WindowSystemType,
} from '@pryzm/geometry-window';
import { resolveCatalogueRef } from '../catalogue/resolveCatalogueRef';
import { childRefusalText } from '../refusal/childRefusalText';
import { UpdateWindowSystemTypeCommand } from './UpdateWindowSystemTypeCommand';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/** Words that carry no discriminating power in a window-type reference —
 *  "change all windows to the timber casement window type" must resolve on
 *  "timber casement", not on "window"/"type". */
const WINDOW_TYPE_DOMAIN_NOISE = ['window', 'windows', 'type', 'style', 'the', 'a'];

/**
 * Forgiving window-type lookup — id, exact name, then the shared
 * `resolveCatalogueRef` ladder (ambiguity ⇒ null, never a coin-flip).
 * Mirrors `resolveWallSystemTypeRef` byte-for-byte in spirit.
 */
export function resolveWindowSystemTypeRef(ref: string): WindowSystemType | null {
    return resolveCatalogueRef<WindowSystemType>(windowSystemTypeStore, ref, {
        domainNoise: WINDOW_TYPE_DOMAIN_NOISE,
        spanDomain: 'pryzm.window.systemType',
    }).entry;
}

/** The real catalogue names, for honest refusal copy. */
export function windowSystemTypeNames(): string[] {
    return windowSystemTypeStore.getAll().map((t) => t.name);
}

export interface UpdateWindowsSystemTypeBatchInput {
    /** `'all'` = every window in the project (ALL levels), or an explicit id
     *  list (e.g. the current selection filtered to windows). */
    windowIds: string[] | 'all';
    /** Window system type reference — id or name (forgiving lookup). */
    systemType: string;
}

/** One skipped window, with the human-readable refusal it produced. */
export interface WindowTypeBatchSkip {
    windowId: string;
    reason: string;
}

export class UpdateWindowsSystemTypeBatchCommand implements Command {
    readonly affectedStores = ['window', 'wall'] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_WINDOWS_SYSTEM_TYPE_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    /** Children that actually EXECUTED — undo replays these in reverse. */
    private executedChildren: UpdateWindowSystemTypeCommand[] = [];
    private _skipped: WindowTypeBatchSkip[] = [];
    /** Host walls of retyped windows — the bridge nudges their rebuild. */
    private _affectedWallIds = new Set<string>();

    constructor(private input: UpdateWindowsSystemTypeBatchInput) {
        this.targetIds = input.windowIds === 'all' ? [] : [...input.windowIds];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly WindowTypeBatchSkip[] { return this._skipped; }

    /** Host wall ids of every retyped window (for the reveal-map rebuild nudge). */
    get affectedWallIds(): readonly string[] { return [...this._affectedWallIds]; }

    private _resolveWindowIds(): string[] {
        if (this.input.windowIds === 'all') {
            return windowStore.getAll().map((w) => w.id);
        }
        // De-dup an explicit list so one window is never retyped (or counted) twice.
        return Array.from(new Set(this.input.windowIds));
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const type = resolveWindowSystemTypeRef(this.input.systemType);
        if (type === null) {
            return {
                ok: false,
                reason:
                    `There is no window type called "${this.input.systemType}". ` +
                    `The window types here are: ${windowSystemTypeNames().join(', ')}.`,
            };
        }

        const ids = this._resolveWindowIds();
        if (ids.length === 0) {
            // Empty scope is a VISIBLE decline, never a throw (§CONTEXT-DATA-HONESTY).
            return {
                ok: false,
                reason: this.input.windowIds === 'all'
                    ? 'There are no windows in this project to retype.'
                    : 'No windows selected — select at least one window first.',
            };
        }

        const refusals: string[] = [];
        let acceptable = 0;
        for (const id of ids) {
            const v = new UpdateWindowSystemTypeCommand({ windowId: id, systemTypeId: type.id })
                .canExecute(ctx);
            if (v.ok) acceptable++;
            // §REFUSAL-IDENTITY (GE-09): a stated reason passes VERBATIM; a silent
            // child is NAMED as silent — never re-worded into a manufactured verdict.
            else refusals.push(childRefusalText(v.reason, 'UpdateWindowSystemTypeCommand.canExecute', `window ${id}`));
        }
        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} window${ids.length === 1 ? '' : 's'} can become ` +
                    `"${type.name}" — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.window.updateSystemType.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];
                this._affectedWallIds = new Set();

                const type = resolveWindowSystemTypeRef(this.input.systemType);
                if (type === null) {
                    const reason =
                        `There is no window type called "${this.input.systemType}". ` +
                        `The window types here are: ${windowSystemTypeNames().join(', ')}.`;
                    span.end();
                    return { success: false, affectedElementIds: [], info: [reason] };
                }

                const ids = this._resolveWindowIds();
                this.targetIds = [...ids];
                const affected: string[] = [];

                for (const id of ids) {
                    const child = new UpdateWindowSystemTypeCommand({
                        windowId: id,
                        systemTypeId: type.id,
                    });
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({ windowId: id, reason: childRefusalText(v.reason, 'UpdateWindowSystemTypeCommand.canExecute', `window ${id}`) });
                        continue;
                    }
                    const r = child.execute(ctx);
                    if (r.success) {
                        this.executedChildren.push(child);
                        affected.push(id);
                        const host = windowStore.getById(id)?.wallId;
                        if (host) this._affectedWallIds.add(host);
                    } else {
                        // Same seam, same discipline — a child that FAILED its execute
                        // without a message is named, not paraphrased as 'execution refused'.
                        this._skipped.push({ windowId: id, reason: childRefusalText(r.info?.[0], 'UpdateWindowSystemTypeCommand.execute', `window ${id}`) });
                    }
                }

                const total = ids.length;
                const changed = affected.length;
                const skippedCount = this._skipped.length;

                // Group identical refusal reasons so N identical skips read as ONE line.
                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) {
                    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                }
                const reasonLines = [...reasonCounts.entries()].map(
                    ([reason, count]) => `${count}× ${reason}`,
                );

                const summary =
                    `Retyped ${changed} of ${total} window${total === 1 ? '' : 's'} to ` +
                    `"${type.name}"` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.window.typeBatch.total', total);
                span.setAttribute('pryzm.window.typeBatch.changed', changed);
                span.setAttribute('pryzm.window.typeBatch.skipped', skippedCount);
                span.setAttribute('pryzm.window.typeBatch.scope', this.input.windowIds === 'all' ? 'all' : 'ids');

                return {
                    success: changed > 0,
                    affectedElementIds: [...affected, ...this._affectedWallIds],
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
        // Reverse order — symmetric with execution; each child restores its
        // EXACT pre-image via windowStore.replace() (C03 §4.5).
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

    static deserialize(serialized: SerializedCommand): UpdateWindowsSystemTypeBatchCommand {
        return new UpdateWindowsSystemTypeBatchCommand(
            serialized.payload as UpdateWindowsSystemTypeBatchInput,
        );
    }
}
