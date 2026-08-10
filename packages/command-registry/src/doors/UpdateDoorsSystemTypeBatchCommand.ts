// §FEAT-DOOR-TYPE-BATCH (RAC Phase U4.3, ADR-0315 family) — retype MANY doors
// in ONE undo step: "change all doors to solid core flush".
//
// PRODUCT INTENT: "change the door type to …" (selection) / "change all doors
// to …", dispatched by the RAC chat. The COMMAND is the deliverable; the chat
// is a thin wrapper — this capability is U4's extension proof: on the resolver
// side it is PURE METADATA (a CapabilityExecutionSpec table entry + registry
// entry), zero new case code.
//
// WHY A NEW COMMAND: the ONE live single-door type route is
// `UpdateDoorSystemTypeCommand` (§FIX-HOSTED-TYPE-CHANGE, L-620 — geometry
// `doorStore.update()` → DoorBuilder rebuild; the plugin-bus `door.setType`
// writes the DETACHED plugin DTO store and is precisely the disease this
// family exists to avoid). It is single-door by payload; N dispatches would be
// N undo entries. This batch orchestrates it per door, the exact
// `UpdateWindowsSystemTypeBatchCommand` shape one directory over:
//   1. REUSE, not rival — reference resolution is `resolveCatalogueRef` (the
//      ONE ladder) via `resolveDoorSystemTypeRef` below; per door the child is
//      the proven UpdateDoorSystemTypeCommand, whose `planDoorTypeChange` gate
//      (C15: id/openingId/host-wall/void preserved) supplies the per-door
//      refusals.
//   2. ONE undo entry — undo() replays each child's undo in reverse; each
//      child restores its EXACT pre-image via doorStore.replace() (C03 §4.5).
//   3. §CONTEXT-DATA-HONESTY — "Retyped N of M doors — K skipped: <reason>",
//      all-refused / empty scope = visible no-op via canExecute, never a throw;
//      an unresolvable type ref refuses by LISTING the real catalogue names.
//
// HOST WALLS: the child command writes NOTHING to the wall store (C15), but the
// reveal/lining render map is resolved at wall-build time, so the caller (the
// door plugin's bus bridge) nudges the affected host walls exactly as the
// window batch bridge does.
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
    doorStore,
    doorSystemTypeStore,
    type DoorSystemType,
} from '@pryzm/geometry-door';
import { resolveCatalogueRef } from '../catalogue/resolveCatalogueRef';
import { UpdateDoorSystemTypeCommand } from './UpdateDoorSystemTypeCommand';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/** Words that carry no discriminating power in a door-type reference —
 *  "change all doors to the solid core flush door type" must resolve on
 *  "solid core flush", not on "door"/"type". */
const DOOR_TYPE_DOMAIN_NOISE = ['door', 'doors', 'type', 'style', 'the', 'a'];

/**
 * Forgiving door-type lookup — id, exact name, then the shared
 * `resolveCatalogueRef` ladder (ambiguity ⇒ null, never a coin-flip).
 * Mirrors `resolveWindowSystemTypeRef` byte-for-byte in spirit.
 */
export function resolveDoorSystemTypeRef(ref: string): DoorSystemType | null {
    return resolveCatalogueRef<DoorSystemType>(doorSystemTypeStore, ref, {
        domainNoise: DOOR_TYPE_DOMAIN_NOISE,
        spanDomain: 'pryzm.door.systemType',
    }).entry;
}

/** The real catalogue names, for honest refusal copy. */
export function doorSystemTypeNames(): string[] {
    return doorSystemTypeStore.getAll().map((t) => t.name);
}

export interface UpdateDoorsSystemTypeBatchInput {
    /** `'all'` = every door in the project (ALL levels), or an explicit id
     *  list (e.g. the current selection filtered to doors). */
    doorIds: string[] | 'all';
    /** Door system type reference — id or name (forgiving lookup). */
    systemType: string;
}

/** One skipped door, with the human-readable refusal it produced. */
export interface DoorTypeBatchSkip {
    doorId: string;
    reason: string;
}

export class UpdateDoorsSystemTypeBatchCommand implements Command {
    readonly affectedStores = ['door', 'wall'] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_DOORS_SYSTEM_TYPE_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    /** Children that actually EXECUTED — undo replays these in reverse. */
    private executedChildren: UpdateDoorSystemTypeCommand[] = [];
    private _skipped: DoorTypeBatchSkip[] = [];
    /** Host walls of retyped doors — the bridge nudges their rebuild. */
    private _affectedWallIds = new Set<string>();

    constructor(private input: UpdateDoorsSystemTypeBatchInput) {
        this.targetIds = input.doorIds === 'all' ? [] : [...input.doorIds];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly DoorTypeBatchSkip[] { return this._skipped; }

    /** Host wall ids of every retyped door (for the reveal-map rebuild nudge). */
    get affectedWallIds(): readonly string[] { return [...this._affectedWallIds]; }

    private _resolveDoorIds(): string[] {
        if (this.input.doorIds === 'all') {
            return doorStore.getAll().map((d) => d.id);
        }
        // De-dup an explicit list so one door is never retyped (or counted) twice.
        return Array.from(new Set(this.input.doorIds));
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const type = resolveDoorSystemTypeRef(this.input.systemType);
        if (type === null) {
            return {
                ok: false,
                reason:
                    `There is no door type called "${this.input.systemType}". ` +
                    `The door types here are: ${doorSystemTypeNames().join(', ')}.`,
            };
        }

        const ids = this._resolveDoorIds();
        if (ids.length === 0) {
            // Empty scope is a VISIBLE decline, never a throw (§CONTEXT-DATA-HONESTY).
            return {
                ok: false,
                reason: this.input.doorIds === 'all'
                    ? 'There are no doors in this project to retype.'
                    : 'No doors selected — select at least one door first.',
            };
        }

        const refusals: string[] = [];
        let acceptable = 0;
        for (const id of ids) {
            const v = new UpdateDoorSystemTypeCommand({ doorId: id, systemTypeId: type.id })
                .canExecute(ctx);
            if (v.ok) acceptable++;
            else refusals.push(v.reason ?? `Door ${id} refused the type change`);
        }
        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} door${ids.length === 1 ? '' : 's'} can become ` +
                    `"${type.name}" — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.door.updateSystemType.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];
                this._affectedWallIds = new Set();

                const type = resolveDoorSystemTypeRef(this.input.systemType);
                if (type === null) {
                    const reason =
                        `There is no door type called "${this.input.systemType}". ` +
                        `The door types here are: ${doorSystemTypeNames().join(', ')}.`;
                    span.end();
                    return { success: false, affectedElementIds: [], info: [reason] };
                }

                const ids = this._resolveDoorIds();
                this.targetIds = [...ids];
                const affected: string[] = [];

                for (const id of ids) {
                    const child = new UpdateDoorSystemTypeCommand({
                        doorId: id,
                        systemTypeId: type.id,
                    });
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({ doorId: id, reason: v.reason ?? 'refused' });
                        continue;
                    }
                    const r = child.execute(ctx);
                    if (r.success) {
                        this.executedChildren.push(child);
                        affected.push(id);
                        const host = doorStore.getById(id)?.wallId;
                        if (host) this._affectedWallIds.add(host);
                    } else {
                        this._skipped.push({ doorId: id, reason: r.info?.[0] ?? 'execution refused' });
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
                    `Retyped ${changed} of ${total} door${total === 1 ? '' : 's'} to ` +
                    `"${type.name}"` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.door.typeBatch.total', total);
                span.setAttribute('pryzm.door.typeBatch.changed', changed);
                span.setAttribute('pryzm.door.typeBatch.skipped', skippedCount);
                span.setAttribute('pryzm.door.typeBatch.scope', this.input.doorIds === 'all' ? 'all' : 'ids');

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
        // EXACT pre-image via doorStore.replace() (C03 §4.5).
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

    static deserialize(serialized: SerializedCommand): UpdateDoorsSystemTypeBatchCommand {
        return new UpdateDoorsSystemTypeBatchCommand(
            serialized.payload as UpdateDoorsSystemTypeBatchInput,
        );
    }
}
