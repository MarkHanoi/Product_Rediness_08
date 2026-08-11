// §FEAT-CEILING-TYPE-BATCH (RAC Phase U7.2) — retype MANY ceilings in ONE undo
// step: "change all ceilings to suspended act 600x600".
//
// The slab batch's twin, one family over, and the same three reasons for
// existing:
//   1. The ONE live single-ceiling type route is `UpdateCeilingLayersCommand`
//      (geometry `ceilingStore.update()` — the store the 3D CeilingTool and the
//      project loader write, and the builders read). The plugin-bus
//      `ceiling.updateLayers` handler produceCommands the DETACHED plugin Immer
//      ceiling store, which is populated ONLY for plan-tool ceilings —
//      initBusHandlers records the founder-visible symptom verbatim ("ceiling
//      not found: <id>"). Routing a chat verb there would be L-620 again.
//   2. It is single-ceiling by payload, so N dispatches would be N undo
//      entries; this batch buys ONE (ADR-0314: never by holding a batch open).
//   3. §CONTEXT-DATA-HONESTY — "Retyped N of M ceilings — K skipped: <reason>",
//      and an unresolvable type ref refuses by LISTING the real catalogue names
//      (ten built-ins ship: Plasterboard 12.5mm, Suspended ACT 600×600, Exposed
//      Concrete Soffit, …).
//
// LAYER-STACK FAMILY: a ceiling type is MATERIALISED, not referenced — the
// child demands a non-empty layer stack and a positive thickness, so the batch
// stamps a deep clone of the type's own layers and its derived totalThickness
// (edit-type semantics, §R-10: editing the TYPE later must not silently
// re-shape ceilings already stamped from it).
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
// TYPE-ONLY (erased at runtime) — the catalogue arrives through
// `ctx.stores.ceilingSystemTypeStore`, which the editor already threads. Same
// reasoning as the slab twin: importing a package BARREL for a singleton drags
// whatever else that barrel re-exports into every consumer, including the pure
// resolver and the CI gate (§SCC-NO-BARREL-ACCESS-AT-MODULE-LOAD).
import type { CeilingSystemType } from '@pryzm/core-app-model';
import { resolveCatalogueRef } from '../catalogue/resolveCatalogueRef';
import { UpdateCeilingLayersCommand } from './UpdateCeilingLayersCommand';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/** Words carrying no discriminating power in a ceiling-type reference. */
const CEILING_TYPE_DOMAIN_NOISE = ['ceiling', 'ceilings', 'type', 'the', 'a'];

/** The read surface a ceiling-type catalogue must offer. */
export interface CeilingSystemTypeCatalogueReader {
    getById(id: string): CeilingSystemType | undefined;
    getAll(): CeilingSystemType[];
}

/** Forgiving ceiling-type lookup — the ONE `resolveCatalogueRef` ladder. */
export function resolveCeilingSystemTypeRef(
    catalogue: CeilingSystemTypeCatalogueReader,
    ref: string,
): CeilingSystemType | null {
    return resolveCatalogueRef<CeilingSystemType>(catalogue, ref, {
        domainNoise: CEILING_TYPE_DOMAIN_NOISE,
        spanDomain: 'pryzm.ceiling.systemType',
    }).entry;
}

/** The real catalogue names, for honest refusal copy. */
export function ceilingSystemTypeNames(catalogue: CeilingSystemTypeCatalogueReader): string[] {
    return catalogue.getAll().map((t) => t.name);
}

export interface UpdateCeilingsSystemTypeBatchInput {
    /** `'all'` = every ceiling in the project (ALL levels), or an explicit id list. */
    ceilingIds: string[] | 'all';
    /** Ceiling system type reference — id or name (forgiving lookup). */
    systemType: string;
}

/** One skipped ceiling, with the human-readable refusal it produced. */
export interface CeilingTypeBatchSkip {
    ceilingId: string;
    reason: string;
}

export class UpdateCeilingsSystemTypeBatchCommand implements Command {
    readonly affectedStores = ['ceiling'] as const;
    id = crypto.randomUUID();
    type = CommandType.UPDATE_CEILINGS_SYSTEM_TYPE_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    private executedChildren: UpdateCeilingLayersCommand[] = [];
    private _skipped: CeilingTypeBatchSkip[] = [];

    constructor(private input: UpdateCeilingsSystemTypeBatchInput) {
        this.targetIds = input.ceilingIds === 'all' ? [] : [...input.ceilingIds];
    }

    get skipped(): readonly CeilingTypeBatchSkip[] { return this._skipped; }

    private _resolveCeilingIds(ctx: CommandContext): string[] {
        if (this.input.ceilingIds === 'all') {
            // The GEOMETRY ceiling store and nothing else, so the command's
            // reachable set is ceilings only.
            return (ctx.stores.ceilingStore?.getAll() ?? []).map((c: { id: string }) => c.id);
        }
        return Array.from(new Set(this.input.ceilingIds));
    }

    private _child(ceilingId: string, type: CeilingSystemType): UpdateCeilingLayersCommand {
        return new UpdateCeilingLayersCommand({
            ceilingId,
            systemTypeId: type.id,
            layers: structuredClone(type.layers),
            thickness: type.totalThickness,
        });
    }

    /** The project's ceiling catalogue, or null when the host threaded none —
     *  a missing catalogue is a REFUSAL, never a guess. */
    private _catalogue(ctx: CommandContext): CeilingSystemTypeCatalogueReader | null {
        return (ctx.stores as { ceilingSystemTypeStore?: CeilingSystemTypeCatalogueReader })
            .ceilingSystemTypeStore ?? null;
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const catalogue = this._catalogue(ctx);
        if (catalogue === null) {
            return { ok: false, reason: 'The ceiling type catalogue is not available here.' };
        }
        const type = resolveCeilingSystemTypeRef(catalogue, this.input.systemType);
        if (type === null) {
            return {
                ok: false,
                reason:
                    `There is no ceiling type called "${this.input.systemType}". ` +
                    `The ceiling types here are: ${ceilingSystemTypeNames(catalogue).join(', ')}.`,
            };
        }
        if (type.layers.length === 0 || type.totalThickness <= 0) {
            return {
                ok: false,
                reason: `The ceiling type "${type.name}" has no layer stack to apply.`,
            };
        }

        const ids = this._resolveCeilingIds(ctx);
        if (ids.length === 0) {
            return {
                ok: false,
                reason: this.input.ceilingIds === 'all'
                    ? 'There are no ceilings in this project to retype.'
                    : 'No ceilings selected — select at least one ceiling first.',
            };
        }

        const refusals: string[] = [];
        let acceptable = 0;
        for (const id of ids) {
            const v = this._child(id, type).canExecute(ctx);
            if (v.ok) acceptable++;
            else refusals.push(v.reason ?? `Ceiling ${id} refused the type change`);
        }
        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} ceiling${ids.length === 1 ? '' : 's'} can become ` +
                    `"${type.name}" — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.ceiling.updateSystemType.batch', (span) => {
            try {
                this.executedChildren = [];
                this._skipped = [];

                const catalogue = this._catalogue(ctx);
                if (catalogue === null) {
                    return {
                        success: false,
                        affectedElementIds: [],
                        info: ['The ceiling type catalogue is not available here.'],
                    };
                }
                const type = resolveCeilingSystemTypeRef(catalogue, this.input.systemType);
                if (type === null) {
                    const reason =
                        `There is no ceiling type called "${this.input.systemType}". ` +
                        `The ceiling types here are: ${ceilingSystemTypeNames(catalogue).join(', ')}.`;
                    return { success: false, affectedElementIds: [], info: [reason] };
                }

                const ids = this._resolveCeilingIds(ctx);
                this.targetIds = [...ids];
                const affected: string[] = [];

                for (const id of ids) {
                    const child = this._child(id, type);
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({ ceilingId: id, reason: v.reason ?? 'refused' });
                        continue;
                    }
                    let r: CommandResult;
                    try {
                        r = child.execute(ctx);
                    } catch (e) {
                        // The child throws when the ceiling vanished between
                        // canExecute and execute; a batch must degrade to a
                        // counted skip, never take the whole ask down with it.
                        this._skipped.push({ ceilingId: id, reason: (e as Error).message });
                        continue;
                    }
                    if (r.success) {
                        this.executedChildren.push(child);
                        affected.push(id);
                    } else {
                        this._skipped.push({ ceilingId: id, reason: r.info?.[0] ?? 'execution refused' });
                    }
                }

                const total = ids.length;
                const changed = affected.length;
                const skippedCount = this._skipped.length;

                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) {
                    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                }
                const reasonLines = [...reasonCounts.entries()].map(
                    ([reason, count]) => `${count}× ${reason}`,
                );

                const summary =
                    `Retyped ${changed} of ${total} ceiling${total === 1 ? '' : 's'} to ` +
                    `"${type.name}" (${(type.totalThickness * 1000).toFixed(0)}mm)` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.ceiling.typeBatch.total', total);
                span.setAttribute('pryzm.ceiling.typeBatch.changed', changed);
                span.setAttribute('pryzm.ceiling.typeBatch.skipped', skippedCount);
                span.setAttribute('pryzm.ceiling.typeBatch.scope', this.input.ceilingIds === 'all' ? 'all' : 'ids');

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
            if (!child) continue;
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

    static deserialize(serialized: SerializedCommand): UpdateCeilingsSystemTypeBatchCommand {
        return new UpdateCeilingsSystemTypeBatchCommand(
            serialized.payload as unknown as UpdateCeilingsSystemTypeBatchInput,
        );
    }
}
