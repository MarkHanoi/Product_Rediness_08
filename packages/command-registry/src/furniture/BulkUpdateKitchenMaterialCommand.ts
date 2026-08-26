// §RACKITCHEN127 — change carcass / door-front / countertop material for MANY
// kitchens (or ONE) in ONE undo step.
//
// PRODUCT INTENT (founder, verbatim): "I want to change the carcass body, door
// front and countertop material via RAC for kitchens — for ALL kitchens in a
// floor, for ALL kitchens in the project, etc." Typing "change all kitchen
// countertops on level 2 to marble" into the RAC/PRYZM AI chat must apply
// across every matching kitchen, scoped by a single element, a level, or the
// whole project.
//
// DESIGN (the three house rules §FEAT-WALL-TYPE-BATCH established, in order —
// this command is the SAME SHAPE applied to kitchens):
//
//  1. REUSE, not rival. Per kitchen this instantiates the existing
//     `UpdateFurnitureParametersCommand` — the single-element path
//     `KitchenRunInspector` already dispatches for a hand-edited kitchen's
//     materials. There is no second "recolour one kitchen" implementation.
//
//     ⚠ `UpdateFurnitureParametersCommand.execute()` REPLACES
//     `furniture.kitchenConfig` wholesale with `payload.kitchenConfig` (it is
//     `this.payload.kitchenConfig ?? furniture.kitchenConfig`, not a merge —
//     see that file). A child built from a BARE `{ [field]: materialId }`
//     patch would silently erase the kitchen's layout (numUnits, arm lengths,
//     upperUnits, the OTHER two material fields…) the moment this command
//     touched it. `_child()` below reads the kitchen's CURRENT kitchenConfig
//     out of the live store and spreads it — exactly what `KitchenRunInspector`
//     does with its own `base` object — so only the one targeted field moves.
//
//  2. ONE undo entry. The batch is a single Command on the history stack;
//     undo() replays each child's undo in reverse order.
//
//  3. §CONTEXT-DATA-HONESTY partial-failure policy. Every kitchen the scope
//     resolves to is changed; a vanished element is skipped WITH a reason;
//     "Changed N of M kitchens' <target> to <material> — K skipped: <reason>"
//     (C84 EI-7: `affectedElementIds` names every kitchen actually touched); a
//     scope matching ZERO kitchens is a visible NO-OP via `canExecute`
//     (C74 / CA-18 — refuses by name, stating the scope, never silently).
//
// SCOPE (the founder's three asks, literally):
//   • `{ kind: 'element', elementId }` — one kitchen (mirrors the properties-
//     panel / KitchenRunInspector single-kitchen edit, expressed as this same
//     command so RAC's "change this kitchen's countertop to marble" and the
//     panel's hand-edit are ONE code path, not two).
//   • `{ kind: 'level', levelId }` — every kitchen on that level, no others.
//   • `{ kind: 'project' }` — every kitchen in the project (every kitchen
//     `ctx.stores.furnitureStore` holds — that store is project-scoped, same
//     as `wallStore` is for `UpdateWallsSystemTypeBatchCommand`'s `'all'`).
//
// "Kitchen" identification: `furniture.kitchenConfig !== undefined` — the SAME
// test `FurniturePropertySection.ts` already uses to decide whether to render
// the kitchen material properties at all (`if (furniture.kitchenConfig)`).
// `furnitureType` is deliberately NOT re-matched against the kitchen_* union
// here — one detection rule, not two that could drift (C84 EI-9).
//
// MATERIAL RESOLUTION: `materialRef` is a STANDARD_MATERIAL_LIBRARY id OR
// label, resolved by `resolveKitchenMaterialRef` on the SAME forgiving
// `resolveCatalogueRef` ladder every other project catalogue in this package
// uses (exact id → exact name → case-insensitive name → unambiguous word
// subset) — so the RAC can say "marble" and mean 'stone-marble-carrara'.
//
// P8 — execute() carries an OpenTelemetry span.

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
import { resolveCatalogueRef, type CatalogueReader, type CatalogueEntry } from '../catalogue/resolveCatalogueRef';
import { UpdateFurnitureParametersCommand } from './UpdateFurnitureParametersCommand';
// material-library is a pure data table (id/label/category) — the same import
// FurniturePropertySection.ts (apps/editor) already uses to resolve these same
// three fields for display, and command-registry already depends on
// @pryzm/core-app-model pervasively (BeamData, AssetCatalogEntry, CeilingData…).
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

/** The three kitchen surfaces the founder named, verbatim. */
export type KitchenMaterialTarget = 'carcass' | 'doorFront' | 'countertop';

/** target → the `KitchenCabinetConfig` field it writes (`packages/geometry-furniture/src/KitchenTypes.ts`). */
const TARGET_FIELD: Readonly<Record<KitchenMaterialTarget, 'carcassMaterialId' | 'frontMaterialId' | 'countertopMaterialId'>> = {
    carcass: 'carcassMaterialId',
    doorFront: 'frontMaterialId',
    countertop: 'countertopMaterialId',
};

const TARGET_LABEL: Readonly<Record<KitchenMaterialTarget, string>> = {
    carcass: 'carcass body',
    doorFront: 'door/front',
    countertop: 'countertop',
};

export type KitchenMaterialScope =
    | { readonly kind: 'element'; readonly elementId: string }
    | { readonly kind: 'level'; readonly levelId: string }
    | { readonly kind: 'project' };

export interface BulkUpdateKitchenMaterialInput {
    readonly scope: KitchenMaterialScope;
    readonly target: KitchenMaterialTarget;
    /** STANDARD_MATERIAL_LIBRARY id or label — forgiving lookup. */
    readonly materialRef: string;
}

/** One skipped kitchen, with the human-readable refusal it produced. */
export interface KitchenMaterialBatchSkip {
    readonly kitchenId: string;
    readonly reason: string;
}

// ─── Forgiving material lookup (exported for the RAC + any future UI) ────────

/** `STANDARD_MATERIAL_LIBRARY` entries carry `{id,label,category}`;
 *  `resolveCatalogueRef` wants `{id,name}` — this is that adapter, built once. */
interface MaterialCatalogueEntry extends CatalogueEntry {
    readonly category: string;
}

let _materialReader: CatalogueReader<MaterialCatalogueEntry> | null = null;
function materialReader(): CatalogueReader<MaterialCatalogueEntry> {
    if (_materialReader) return _materialReader;
    const all: MaterialCatalogueEntry[] = STANDARD_MATERIAL_LIBRARY.map((m) => ({
        id: m.id,
        name: m.label,
        category: m.category,
    }));
    _materialReader = {
        getById: (id) => all.find((m) => m.id === id),
        getAll: () => all,
    };
    return _materialReader;
}

/** Domain noise on top of the generic set: nobody discriminates a kitchen
 *  material by saying "material" or naming the surface they're painting. */
const KITCHEN_MATERIAL_DOMAIN_NOISE: readonly string[] = [
    'material', 'materials', 'colour', 'color', 'finish',
    'carcass', 'body', 'door', 'front', 'countertop', 'worktop', 'counter', 'kitchen',
];

/**
 * Resolve a kitchen-material reference (id or label) against
 * `STANDARD_MATERIAL_LIBRARY` on the shared 4-tier ladder. Returns `null` on
 * no-match or ambiguity — never throws (§CONTEXT-DATA-HONESTY).
 */
export function resolveKitchenMaterialRef(ref: string): MaterialCatalogueEntry | null {
    return resolveCatalogueRef<MaterialCatalogueEntry>(materialReader(), ref, {
        domainNoise: KITCHEN_MATERIAL_DOMAIN_NOISE,
        spanDomain: 'pryzm.kitchen.material',
    }).entry;
}

// ─── The batch command ───────────────────────────────────────────────────────

export class BulkUpdateKitchenMaterialCommand implements Command {
    readonly affectedStores = ['furniture'] as const;
    id = crypto.randomUUID();
    type = CommandType.BULK_UPDATE_KITCHEN_MATERIAL;
    timestamp = Date.now();
    targetIds: string[];

    /** Children that actually EXECUTED — undo replays these in reverse. */
    private executedChildren: UpdateFurnitureParametersCommand[] = [];
    /** Refusals from the last execute() — exposed for callers that want detail. */
    private _skipped: KitchenMaterialBatchSkip[] = [];

    constructor(private input: BulkUpdateKitchenMaterialInput) {
        this.targetIds = input.scope.kind === 'element' ? [input.scope.elementId] : [];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly KitchenMaterialBatchSkip[] { return this._skipped; }

    // ── Internals ────────────────────────────────────────────────────────────

    private _furnitureStore(ctx: CommandContext): { getAll(): any[]; get(id: string): any } {
        return (ctx.stores as any).furnitureStore;
    }

    private _isKitchen(f: any): boolean {
        return f !== undefined && f !== null && f.kitchenConfig !== undefined;
    }

    /** Resolve the requested material, or `undefined` if it cannot be found. */
    private _resolveMaterial(): MaterialCatalogueEntry | undefined {
        return resolveKitchenMaterialRef(this.input.materialRef) ?? undefined;
    }

    /** Resolve the kitchen ids the scope reaches. Never throws. */
    private _resolveKitchenIds(ctx: CommandContext): string[] {
        const store = this._furnitureStore(ctx);
        const kitchens = store.getAll().filter((f) => this._isKitchen(f));
        const scope = this.input.scope;
        if (scope.kind === 'element') {
            return kitchens.filter((f) => f.id === scope.elementId).map((f) => f.id);
        }
        if (scope.kind === 'level') {
            return kitchens.filter((f) => f.levelId === scope.levelId).map((f) => f.id);
        }
        // 'project' — every kitchen the (project-scoped) furniture store holds.
        return kitchens.map((f) => f.id);
    }

    private _scopeLabel(): string {
        const scope = this.input.scope;
        if (scope.kind === 'element') return 'the selected kitchen';
        if (scope.kind === 'level') return `the kitchens on level "${scope.levelId}"`;
        return 'the kitchens in this project';
    }

    /** Honest reason for a scope that resolves to zero kitchens — distinguishes
     *  "nothing there" from "that element exists but isn't a kitchen". */
    private _emptyScopeReason(ctx: CommandContext): string {
        const scope = this.input.scope;
        if (scope.kind === 'element') {
            const f = this._furnitureStore(ctx).get(scope.elementId);
            if (f === undefined) return `No element found with id "${scope.elementId}".`;
            return `Element "${scope.elementId}" is not a kitchen (furnitureType "${f.furnitureType ?? 'unknown'}") — nothing to change.`;
        }
        if (scope.kind === 'level') {
            return `There are no kitchens on level "${scope.levelId}" to change.`;
        }
        return 'There are no kitchens in this project to change.';
    }

    /** Build the single-kitchen child (REUSE of the proven single-element path).
     *  Reads the kitchen's CURRENT kitchenConfig and spreads it — see the file
     *  header: the child command REPLACES kitchenConfig wholesale, so a bare
     *  `{ [field]: materialId }` patch would erase every other field. */
    private _child(ctx: CommandContext, kitchenId: string, materialId: string): UpdateFurnitureParametersCommand {
        const furniture = this._furnitureStore(ctx).get(kitchenId);
        const field = TARGET_FIELD[this.input.target];
        const kitchenConfig = { ...(furniture?.kitchenConfig ?? {}), [field]: materialId };
        return new UpdateFurnitureParametersCommand({ id: kitchenId, kitchenConfig });
    }

    private _valueLabel(material: MaterialCatalogueEntry): string {
        return `${TARGET_LABEL[this.input.target]} to "${material.name}"`;
    }

    // ── Command surface ──────────────────────────────────────────────────────

    canExecute(ctx: CommandContext): CommandValidationResult {
        const material = this._resolveMaterial();
        if (material === undefined) {
            return {
                ok: false,
                reason: `Unknown material "${this.input.materialRef}" — no material with that id or name exists in the material library.`,
            };
        }

        const ids = this._resolveKitchenIds(ctx);
        if (ids.length === 0) {
            // Empty scope is a VISIBLE decline, never a throw (§CONTEXT-DATA-HONESTY).
            return { ok: false, reason: this._emptyScopeReason(ctx) };
        }

        const refusals: string[] = [];
        let acceptable = 0;
        for (const kitchenId of ids) {
            const v = this._child(ctx, kitchenId, material.id).canExecute(ctx);
            if (v.ok) acceptable++;
            // §REFUSAL-IDENTITY (GE-09): a stated reason passes VERBATIM; a silent
            // child is NAMED as silent — never re-worded into a manufactured verdict.
            else refusals.push(childRefusalText(v.reason, 'UpdateFurnitureParametersCommand.canExecute', `kitchen ${kitchenId}`));
        }

        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} kitchen${ids.length === 1 ? '' : 's'} in ${this._scopeLabel()} ` +
                    `can take ${this._valueLabel(material)} — ${refusals[0]}`,
            };
        }

        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.kitchen.updateMaterial.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];

                const material = this._resolveMaterial();
                if (material === undefined) {
                    span.setAttribute('pryzm.kitchen.materialBatch.unresolvedMaterial', true);
                    return {
                        success: false,
                        affectedElementIds: [],
                        info: [`Unknown material "${this.input.materialRef}".`],
                    };
                }

                const ids = this._resolveKitchenIds(ctx);
                if (ids.length === 0) {
                    return { success: false, affectedElementIds: [], info: [this._emptyScopeReason(ctx)] };
                }
                this.targetIds = [...ids];
                const affected: string[] = [];

                for (const kitchenId of ids) {
                    const child = this._child(ctx, kitchenId, material.id);
                    // Per-kitchen pre-flight through the SAME gate the single-kitchen
                    // UI uses (KitchenRunInspector → UpdateFurnitureParametersCommand).
                    // A refusal is recorded, never thrown, never silently dropped.
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({ kitchenId, reason: childRefusalText(v.reason, 'UpdateFurnitureParametersCommand.canExecute', `kitchen ${kitchenId}`) });
                        continue;
                    }
                    const r = child.execute(ctx);
                    if (r.success) {
                        this.executedChildren.push(child);
                        affected.push(kitchenId);
                    } else {
                        this._skipped.push({
                            kitchenId,
                            reason: childRefusalText(r.info?.[0], 'UpdateFurnitureParametersCommand.execute', `kitchen ${kitchenId}`),
                        });
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
                    `Changed ${changed} of ${total} kitchen${total === 1 ? "'s" : "s'"} ` +
                    `${this._valueLabel(material)}` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.kitchen.materialBatch.total', total);
                span.setAttribute('pryzm.kitchen.materialBatch.changed', changed);
                span.setAttribute('pryzm.kitchen.materialBatch.skipped', skippedCount);
                span.setAttribute('pryzm.kitchen.materialBatch.target', this.input.target);
                span.setAttribute('pryzm.kitchen.materialBatch.scope', this.input.scope.kind);

                return {
                    // Success iff at least one kitchen changed; the all-refused case
                    // is normally intercepted by canExecute, but execute() re-checks
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
        // full pre-change kitchen (kitchenConfig) snapshot.
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

    static deserialize(serialized: SerializedCommand): BulkUpdateKitchenMaterialCommand {
        return new BulkUpdateKitchenMaterialCommand(
            serialized.payload as unknown as BulkUpdateKitchenMaterialInput,
        );
    }
}
