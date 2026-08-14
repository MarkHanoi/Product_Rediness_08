// §FEAT-SLAB-TYPE-BATCH (RAC Phase U7.2) — retype MANY slabs in ONE undo step:
// "change all slabs to RC 250" / "change the selected slabs to composite deck".
//
// PRODUCT INTENT: the founder's "change all slabs to concrete 250". The COMMAND
// is the deliverable; on the chat side this capability is PURE METADATA (a
// CapabilityExecutionSpec table entry + registry entry) — zero new resolver code,
// exactly as set-door-type proved in U4.3.
//
// WHY A NEW COMMAND: the ONE live single-slab type route is
// `UpdateSlabLayersCommand` (geometry `slabStore.update()` → SlabFragmentBuilder
// rebuild). The plugin-bus `slab.setType` handler `produceCommand`s the plugin's
// DETACHED DTO store and its own header says so ("No @pryzm/types-builtin/slab
// catalogue exists yet … this handler simply records the type id on the DTO") —
// the §FIX-MATERIAL-DEAD-DISPATCH / L-620 disease this family exists to avoid.
// `UpdateSlabLayersCommand` is single-slab by payload; N dispatches would be N
// undo entries. This batch orchestrates it per slab:
//   1. REUSE, not rival — the reference is resolved by `resolveCatalogueRef`
//      (the ONE ladder) and the child is the proven layers command.
//   2. ONE undo entry — undo() replays each child's undo in reverse; each child
//      restores its EXACT pre-image snapshot (C03 §4.5).
//   3. §CONTEXT-DATA-HONESTY — "Retyped N of M slabs — K skipped: <reason>";
//      an unresolvable type ref refuses by LISTING the real catalogue names,
//      and an empty scope is a visible decline, never a throw.
//
// LAYER-STACK FAMILY (initBusHandlers §FIX-TYPE-SWAP-ALL-FAMILIES): a slab type
// is MATERIALISED, not referenced — the child command demands a non-empty layer
// stack and a positive thickness, so the batch stamps a deep clone of the type's
// own layers and its derived `totalThickness`. That is edit-type semantics
// (§03-1.3): a later edit to the TYPE does not silently re-shape slabs already
// stamped from it.
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
// TYPE-ONLY (erased at runtime). The catalogue itself arrives through
// `ctx.stores.slabSystemTypeStore`, which the editor already threads: importing
// the `@pryzm/geometry-slab` BARREL for the singleton would drag SlabTool — and
// with it @thatopen/ui and the DOM — into every consumer of this command,
// including the pure resolver and the CI gate (§SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD).
import type { SlabSystemType } from '@pryzm/geometry-slab';
import { resolveCatalogueRef } from '../catalogue/resolveCatalogueRef';
import { childRefusalText } from '../refusal/childRefusalText';
import { UpdateSlabLayersCommand } from './UpdateSlabLayersCommand';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/** Words carrying no discriminating power in a slab-type reference — "change
 *  all slabs to the RC 250 slab type" must resolve on "rc 250". */
const SLAB_TYPE_DOMAIN_NOISE = ['slab', 'slabs', 'type', 'the', 'a'];

/** The read surface a slab-type catalogue must offer — the `CatalogueReader`
 *  shape `resolveCatalogueRef` consumes, declared here so callers can inject
 *  the project's store without this module importing it. */
export interface SlabSystemTypeCatalogueReader {
    getById(id: string): SlabSystemType | undefined;
    getAll(): SlabSystemType[];
}

/**
 * Forgiving slab-type lookup — id, exact name, then the shared
 * `resolveCatalogueRef` ladder (ambiguity ⇒ null, never a coin-flip). Takes the
 * catalogue as a parameter, exactly as `resolveWallSystemTypeRef` does.
 */
export function resolveSlabSystemTypeRef(
    catalogue: SlabSystemTypeCatalogueReader,
    ref: string,
): SlabSystemType | null {
    return resolveCatalogueRef<SlabSystemType>(catalogue, ref, {
        domainNoise: SLAB_TYPE_DOMAIN_NOISE,
        spanDomain: 'pryzm.slab.systemType',
    }).entry;
}

/** The real catalogue names, for honest refusal copy. */
export function slabSystemTypeNames(catalogue: SlabSystemTypeCatalogueReader): string[] {
    return catalogue.getAll().map((t) => t.name);
}

export interface UpdateSlabsSystemTypeBatchInput {
    /** `'all'` = every slab in the project (ALL levels), or an explicit id list. */
    slabIds: string[] | 'all';
    /** Slab system type reference — id or name (forgiving lookup). */
    systemType: string;
}

/** One skipped slab, with the human-readable refusal it produced. */
export interface SlabTypeBatchSkip {
    slabId: string;
    reason: string;
}

export class UpdateSlabsSystemTypeBatchCommand implements Command {
    readonly affectedStores = ['slab'] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_SLABS_SYSTEM_TYPE_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    /** Children that actually EXECUTED — undo replays these in reverse. */
    private executedChildren: UpdateSlabLayersCommand[] = [];
    private _skipped: SlabTypeBatchSkip[] = [];

    constructor(private input: UpdateSlabsSystemTypeBatchInput) {
        this.targetIds = input.slabIds === 'all' ? [] : [...input.slabIds];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly SlabTypeBatchSkip[] { return this._skipped; }

    private _resolveSlabIds(ctx: CommandContext): string[] {
        if (this.input.slabIds === 'all') {
            // The GEOMETRY slab store — the one the fragment builders, exporters
            // and persistence read; the command's reachable set is slabs only.
            return (ctx.stores.slabStore?.getAll() ?? []).map((s: { id: string }) => s.id);
        }
        return Array.from(new Set(this.input.slabIds));
    }

    /** The child for one slab, with the type MATERIALISED onto it. */
    private _child(slabId: string, type: SlabSystemType): UpdateSlabLayersCommand {
        return new UpdateSlabLayersCommand({
            slabId,
            systemTypeId: type.id,
            layers: structuredClone(type.layers),
            thickness: type.totalThickness,
        });
    }

    /** The project's slab catalogue, or null when the host did not thread one
     *  (headless tests) — a missing catalogue is a REFUSAL, never a guess. */
    private _catalogue(ctx: CommandContext): SlabSystemTypeCatalogueReader | null {
        return (ctx.stores as { slabSystemTypeStore?: SlabSystemTypeCatalogueReader })
            .slabSystemTypeStore ?? null;
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const catalogue = this._catalogue(ctx);
        if (catalogue === null) {
            return { ok: false, reason: 'The slab type catalogue is not available here.' };
        }
        const type = resolveSlabSystemTypeRef(catalogue, this.input.systemType);
        if (type === null) {
            return {
                ok: false,
                reason:
                    `There is no slab type called "${this.input.systemType}". ` +
                    `The slab types here are: ${slabSystemTypeNames(catalogue).join(', ')}.`,
            };
        }
        if (type.layers.length === 0 || type.totalThickness <= 0) {
            // A catalogue entry that cannot be materialised is a data defect, not
            // a user error — say which type, do not silently stamp an empty stack.
            return {
                ok: false,
                reason: `The slab type "${type.name}" has no layer stack to apply.`,
            };
        }

        const ids = this._resolveSlabIds(ctx);
        if (ids.length === 0) {
            return {
                ok: false,
                reason: this.input.slabIds === 'all'
                    ? 'There are no slabs in this project to retype.'
                    : 'No slabs selected — select at least one slab first.',
            };
        }

        const refusals: string[] = [];
        let acceptable = 0;
        for (const id of ids) {
            const v = this._child(id, type).canExecute(ctx);
            if (v.ok) acceptable++;
            // §REFUSAL-IDENTITY (GE-09): a stated reason passes VERBATIM; a silent
            // child is NAMED as silent — never re-worded into a manufactured verdict.
            else refusals.push(childRefusalText(v.reason, 'UpdateSlabLayersCommand.canExecute', `slab ${id}`));
        }
        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} slab${ids.length === 1 ? '' : 's'} can become ` +
                    `"${type.name}" — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.slab.updateSystemType.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];

                const catalogue = this._catalogue(ctx);
                if (catalogue === null) {
                    return {
                        success: false,
                        affectedElementIds: [],
                        info: ['The slab type catalogue is not available here.'],
                    };
                }
                const type = resolveSlabSystemTypeRef(catalogue, this.input.systemType);
                if (type === null) {
                    const reason =
                        `There is no slab type called "${this.input.systemType}". ` +
                        `The slab types here are: ${slabSystemTypeNames(catalogue).join(', ')}.`;
                    return { success: false, affectedElementIds: [], info: [reason] };
                }

                const ids = this._resolveSlabIds(ctx);
                this.targetIds = [...ids];
                const affected: string[] = [];

                for (const id of ids) {
                    const child = this._child(id, type);
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({ slabId: id, reason: childRefusalText(v.reason, 'UpdateSlabLayersCommand.canExecute', `slab ${id}`) });
                        continue;
                    }
                    const r = child.execute(ctx);
                    if (r.success) {
                        this.executedChildren.push(child);
                        affected.push(id);
                    } else {
                        // Same seam, same discipline — a child that FAILED its execute
                        // without a message is named, not paraphrased as 'execution refused'.
                        this._skipped.push({ slabId: id, reason: childRefusalText(r.info?.[0], 'UpdateSlabLayersCommand.execute', `slab ${id}`) });
                    }
                }

                const total = ids.length;
                const changed = affected.length;
                const skippedCount = this._skipped.length;

                // Group identical refusals so N identical skips read as ONE line.
                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) {
                    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                }
                const reasonLines = [...reasonCounts.entries()].map(
                    ([reason, count]) => `${count}× ${reason}`,
                );

                const summary =
                    `Retyped ${changed} of ${total} slab${total === 1 ? '' : 's'} to ` +
                    `"${type.name}" (${(type.totalThickness * 1000).toFixed(0)}mm)` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.slab.typeBatch.total', total);
                span.setAttribute('pryzm.slab.typeBatch.changed', changed);
                span.setAttribute('pryzm.slab.typeBatch.skipped', skippedCount);
                span.setAttribute('pryzm.slab.typeBatch.scope', this.input.slabIds === 'all' ? 'all' : 'ids');

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

    static deserialize(serialized: SerializedCommand): UpdateSlabsSystemTypeBatchCommand {
        return new UpdateSlabsSystemTypeBatchCommand(
            serialized.payload as unknown as UpdateSlabsSystemTypeBatchInput,
        );
    }
}
