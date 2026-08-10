// §FEAT-WALL-TYPE-BATCH (RAC prep, 2026-08-10) — retype MANY walls in ONE undo step.
//
// PRODUCT INTENT: "Change all walls to Interior – Partition 100mm" / "Change the
// SELECTED walls to Exterior – Brick 300mm", dispatched by the AI-panel pills today
// and by the coming RAC command chat tomorrow. The COMMAND is the deliverable; every
// UI in front of it is a thin wrapper.
//
// DESIGN (three house rules honoured, in order):
//
//  1. REUSE, not rival. Per wall this command instantiates the existing
//     `UpdateWallSystemTypeCommand` — the single-wall path that already snapshots
//     for undo and already carries the ONE rake gate (`rakeAuthorability`, ADR-0310
//     / §FIX-RAKE-REFUSAL-IS-NOT-A-CRASH). There is no second implementation of
//     "change one wall's type" here; the batch is pure orchestration.
//
//  2. ONE undo entry. The batch is a single Command on the history stack; undo()
//     replays each child's undo in reverse order, restoring every touched wall's
//     full pre-change snapshot. A 50-wall retype undoes as ONE step.
//
//  3. §CONTEXT-DATA-HONESTY partial-failure policy. With mixed walls some will
//     legitimately REFUSE (a raked wall cannot take a layered type — ADR-0310).
//     The batch must not crash and must not silently skip:
//       • every wall that CAN accept the type is changed;
//       • the result reports "Changed N of M walls — K skipped: <reason>", so a
//         refusal and a success are never the same observable;
//       • a batch where ALL walls refuse is a visible NO-OP: canExecute returns
//         { ok: false, reason } (CommandManager surfaces it as info[0] and pushes
//         nothing onto the undo stack) — never a thrown error;
//       • an empty wall set likewise declines visibly, it does not throw.
//
// SCOPE: `wallIds: 'all'` means EVERY wall in the project across ALL LEVELS —
// `ctx.stores.wallStore` is the project-wide store (levels partition it via
// `getByLevel`, which this command deliberately does not use). A per-level variant
// is expressible today by passing the explicit id list for that level.
//
// TYPE RESOLUTION: `systemType` accepts an id OR a name, resolved by
// `resolveWallSystemTypeRef` (exact id → exact name → case-insensitive trimmed
// name) so the RAC can say "interior partition" and mean 'wt-interior-partition'.
// `null` detaches the type (returns walls to a monolithic body, keeping their
// current thickness — mirrors the single-wall command's clear semantics).
//
// P8 — both exported functions carry OpenTelemetry spans.

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
    wallSystemTypeStore as defaultWallSystemTypeStore,
    type WallSystemType,
} from '@pryzm/geometry-wall';
import { UpdateWallSystemTypeCommand } from './UpdateWallSystemTypeCommand';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

// ─── Forgiving type lookup (exported for the RAC + pills) ────────────────────

/** The read surface `resolveWallSystemTypeRef` needs — satisfied by the real
 *  `WallSystemTypeStore` and trivially by test doubles. */
export interface WallSystemTypeCatalogueReader {
    getById(id: string): WallSystemType | undefined;
    getAll(): WallSystemType[];
}

/**
 * Resolve a wall system type from a human/RAC-supplied reference.
 *
 * Precedence (first hit wins — deterministic even when a user names a custom
 * type after a built-in id):
 *   1. exact id          ('wt-interior-partition')
 *   2. exact name        ('Interior – Partition 100mm')
 *   3. case-insensitive, whitespace-trimmed name ('interior – partition 100mm')
 *
 * Returns `null` when nothing matches — callers decide how to refuse; this
 * helper never throws. P8: emits one span per resolution.
 */
export function resolveWallSystemTypeRef(
    store: WallSystemTypeCatalogueReader,
    ref: string,
): WallSystemType | null {
    return _tracer().startActiveSpan('pryzm.wall.systemType.resolveRef', (span) => {
        try {
            const byId = store.getById(ref);
            if (byId) {
                span.setAttribute('pryzm.wall.systemType.resolvedBy', 'id');
                return byId;
            }
            const all = store.getAll();
            const byName = all.find(t => t.name === ref);
            if (byName) {
                span.setAttribute('pryzm.wall.systemType.resolvedBy', 'name');
                return byName;
            }
            const needle = ref.trim().toLowerCase();
            const byLooseName = all.find(t => t.name.trim().toLowerCase() === needle) ?? null;
            span.setAttribute(
                'pryzm.wall.systemType.resolvedBy',
                byLooseName ? 'name-case-insensitive' : 'unresolved',
            );
            return byLooseName;
        } finally {
            span.end();
        }
    });
}

// ─── The batch command ───────────────────────────────────────────────────────

export interface UpdateWallsSystemTypeBatchInput {
    /** `'all'` = every wall in the project (ALL levels), or an explicit id list
     *  (e.g. the current selection filtered to walls). */
    wallIds: string[] | 'all';
    /** Wall system type reference — id or name (forgiving lookup) — or `null`
     *  to detach the type from every targeted wall. */
    systemType: string | null;
}

/** One skipped wall, with the human-readable refusal it produced. */
export interface WallTypeBatchSkip {
    wallId: string;
    reason: string;
}

export class UpdateWallsSystemTypeBatchCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_WALLS_SYSTEM_TYPE_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    /** Children that actually EXECUTED — undo replays these in reverse. */
    private executedChildren: UpdateWallSystemTypeCommand[] = [];
    /** Refusals from the last execute() — exposed for callers that want detail. */
    private _skipped: WallTypeBatchSkip[] = [];

    constructor(private input: UpdateWallsSystemTypeBatchInput) {
        this.targetIds = input.wallIds === 'all' ? [] : [...input.wallIds];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly WallTypeBatchSkip[] { return this._skipped; }

    // ── Internals ────────────────────────────────────────────────────────────

    private _catalogue(ctx: CommandContext): WallSystemTypeCatalogueReader {
        // CommandContext.stores.wallSystemTypeStore is optional (injected in
        // main.ts); the module singleton is the same instance in production and
        // the fallback keeps headless/test contexts working.
        return ctx.stores.wallSystemTypeStore ?? defaultWallSystemTypeStore;
    }

    /** Resolve the requested type, or null-detach. `undefined` = unresolvable. */
    private _resolveType(ctx: CommandContext): WallSystemType | null | undefined {
        if (this.input.systemType === null) return null;
        return resolveWallSystemTypeRef(this._catalogue(ctx), this.input.systemType) ?? undefined;
    }

    private _resolveWallIds(ctx: CommandContext): string[] {
        if (this.input.wallIds === 'all') {
            return ctx.stores.wallStore.getAll().map((w: { id: string }) => w.id);
        }
        // De-dup an explicit list so one wall is never retyped (or counted) twice.
        return Array.from(new Set(this.input.wallIds));
    }

    /** Build the single-wall child for one wall id (REUSE of the proven path). */
    private _child(wallId: string, type: WallSystemType | null): UpdateWallSystemTypeCommand {
        return type === null
            ? new UpdateWallSystemTypeCommand({ wallId, systemTypeId: null, layers: null })
            : new UpdateWallSystemTypeCommand({
                wallId,
                systemTypeId: type.id,
                // Per-wall deep copy — walls must not share one mutable layer array.
                layers: type.layers.map(l => ({ ...l })),
                thickness: type.totalThickness,
            });
    }

    private _typeLabel(type: WallSystemType | null): string {
        return type === null ? 'no type (monolithic)' : `"${type.name}"`;
    }

    // ── Command surface ──────────────────────────────────────────────────────

    canExecute(ctx: CommandContext): CommandValidationResult {
        const type = this._resolveType(ctx);
        if (type === undefined) {
            return {
                ok: false,
                reason: `Unknown wall type "${this.input.systemType}" — no wall type with that id or name exists in this project.`,
            };
        }

        const ids = this._resolveWallIds(ctx);
        if (ids.length === 0) {
            // Empty scope is a VISIBLE decline, never a throw (§CONTEXT-DATA-HONESTY).
            return {
                ok: false,
                reason: this.input.wallIds === 'all'
                    ? 'There are no walls in this project to change.'
                    : 'No walls selected — select at least one wall first.',
            };
        }

        const refusals: string[] = [];
        let acceptable = 0;
        for (const wallId of ids) {
            const v = this._child(wallId, type).canExecute(ctx);
            if (v.ok) acceptable++;
            else refusals.push(v.reason ?? `Wall ${wallId} refused the type change`);
        }

        if (acceptable === 0) {
            // ALL refused → the whole batch is a no-op WITH a message (documented
            // policy). CommandManager returns { success:false, info:[reason] } and
            // pushes nothing onto the undo stack — it never throws for this.
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} wall${ids.length === 1 ? '' : 's'} can take ` +
                    `${this._typeLabel(type)} — ${refusals[0]}`,
            };
        }

        // Mixed batch is fine: proceed, surfacing the future skips as warnings.
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.wall.updateSystemType.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];

                const type = this._resolveType(ctx);
                if (type === undefined) {
                    span.setAttribute('pryzm.wall.typeBatch.unresolvedType', true);
                    return {
                        success: false,
                        affectedElementIds: [],
                        info: [`Unknown wall type "${this.input.systemType}".`],
                    };
                }

                const ids = this._resolveWallIds(ctx);
                this.targetIds = [...ids];
                const affected: string[] = [];

                for (const wallId of ids) {
                    const child = this._child(wallId, type);
                    // Per-wall pre-flight through the SAME gate the single-wall UI
                    // uses (rake vs layered, wall existence). A refusal is recorded,
                    // never thrown, and never silently dropped.
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({ wallId, reason: v.reason ?? 'refused' });
                        continue;
                    }
                    const r = child.execute(ctx);
                    if (r.success) {
                        this.executedChildren.push(child);
                        affected.push(wallId);
                    } else {
                        this._skipped.push({
                            wallId,
                            reason: r.info?.[0] ?? 'execution refused',
                        });
                    }
                }

                const total = ids.length;
                const changed = affected.length;
                const skippedCount = this._skipped.length;

                // Group identical refusal reasons so 40 raked walls read as ONE line.
                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) {
                    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                }
                const reasonLines = [...reasonCounts.entries()].map(
                    ([reason, count]) => `${count}× ${reason}`,
                );

                const summary =
                    `Changed ${changed} of ${total} wall${total === 1 ? '' : 's'} to ` +
                    `${this._typeLabel(type)}` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.wall.typeBatch.total', total);
                span.setAttribute('pryzm.wall.typeBatch.changed', changed);
                span.setAttribute('pryzm.wall.typeBatch.skipped', skippedCount);
                span.setAttribute('pryzm.wall.typeBatch.systemType', this.input.systemType ?? '<detach>');
                span.setAttribute('pryzm.wall.typeBatch.scope', this.input.wallIds === 'all' ? 'all' : 'ids');

                return {
                    // Success iff at least one wall changed; the all-refused case is
                    // normally intercepted by canExecute, but execute() re-checks
                    // against live state and reports rather than throwing.
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

    static deserialize(serialized: SerializedCommand): UpdateWallsSystemTypeBatchCommand {
        return new UpdateWallsSystemTypeBatchCommand(
            serialized.payload as UpdateWallsSystemTypeBatchInput,
        );
    }
}
