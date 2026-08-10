// §FEAT-WALL-LAYER-ADD-BATCH (ADR-0315, founder ask #2) — add a finish layer
// to a wall SET in ONE undo step: "add a 10mm plaster finish to the inner side
// of the selected wall".
//
// PRODUCT INTENT: "Add a finish layer on the inner side of the selected wall:
// 10mm plaster" / "add a layer of X mm with finish Y", dispatched by the RAC
// chat. The COMMAND is the deliverable; the chat is a thin wrapper.
//
// ROUTE CHOICE (per the 2026-08-10 layer-route audit):
//   • REUSED CHILD: `UpdateWallSystemTypeCommand` with an ad-hoc `layers[]` +
//     derived `thickness` — the property panel's own proven live route
//     (element.changeType → geometry wallStore.updateWall → fragment rebuild),
//     INSTANCE-scoped: layers are the instance's frozen stack (WallTypes.ts —
//     "systemTypeId … NOT used for geometry (layers is)"), so no type-store
//     write and no sibling re-stamp ever happens here.
//   • EXPLICITLY AVOIDED: `wall.setLayers` (writes the DETACHED plugin DTO
//     store — §FIX-MATERIAL-DEAD-DISPATCH disease) and `UpdateWallLayersCommand`
//     (rewrites the TYPE definition and re-stamps every sibling wall; its
//     missing rake gate also turns the layered×raked refusal into a crash).
//
// SEMANTICS:
//   • Layer arrays are authored EXTERIOR-FIRST (WallTypeEditorModal "Layers
//     (exterior face first)"; WallLayerFootprint2D "authored stack,
//     exterior→interior"). So `side:'interior'` PUSHES to the END and
//     `side:'exterior'` UNSHIFTS at index 0.
//   • A monolithic wall (no layers) is first seeded with a structure layer
//     carrying its current body (`thickness` + `materialColor`), so adding a
//     10mm skim produces a real 2-layer assembly instead of losing the body.
//   • `wall.thickness` MUST equal the layer sum (§03-WALL-THICKNESS-CONTRACT
//     §1) — derived here, rounded to 6dp like every existing caller.
//   • RAKED walls refuse honestly: the child's canExecute consults
//     geometry-wall's `rakeAuthorability` against the merged next state
//     (L-812), so "Added the layer to N of M walls — K skipped: <reason>".
//   • VALUE CONTRACT: the finish arrives RESOLVED ({name, materialColor hex,
//     materialId?}) — the finish-NAME vocabulary ("plaster", "render") lives
//     in the chat resolver's ONE table (finishRef.ts), exactly as colour
//     names live in colorRef.ts; this command owns no name table.
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
import { UpdateWallSystemTypeCommand } from './UpdateWallSystemTypeCommand';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
/** Sanity bounds for one finish layer, metres: 1mm .. 0.5m. */
const LAYER_MIN_M = 0.001;
const LAYER_MAX_M = 0.5;

export interface AddWallLayerBatchInput {
    /** `'all'` = every wall in the project (ALL levels), or an explicit id list. */
    wallIds: string[] | 'all';
    /** Which face receives the layer. Layer arrays are EXTERIOR-FIRST, so
     *  interior = append, exterior = prepend. */
    side: 'interior' | 'exterior';
    /** Layer thickness in metres (e.g. 0.01 for "10mm"). */
    thickness: number;
    /** Display name for the layer (e.g. "Plaster · Skim Coat"). */
    name: string;
    /** Render colour as '#rrggbb' — what WallFragmentBuilder actually paints. */
    materialColor: string;
    /** Optional catalogue material id (free-form string on WallLayer). */
    materialId?: string;
    /** WallLayerFunction; defaults from the side (finish-interior / finish-exterior). */
    layerFunction?: string;
}

/** One skipped wall, with the human-readable refusal it produced. */
export interface WallLayerBatchSkip {
    wallId: string;
    reason: string;
}

/** The wall-record subset this batch reads. */
interface WallRecordLike {
    readonly id: string;
    readonly systemTypeId?: string;
    readonly thickness?: number;
    readonly materialColor?: string;
    readonly layers?: ReadonlyArray<Record<string, unknown>>;
}

const round6 = (n: number): number => Number(n.toFixed(6));

export class AddWallLayerBatchCommand implements Command {
    readonly affectedStores = ['wall'] as const;
    id = crypto.randomUUID();
    type = CommandType.ADD_WALL_LAYER_BATCH;
    timestamp = Date.now();
    targetIds: string[];

    /** Children that actually EXECUTED — undo replays these in reverse; each
     *  child restores its full pre-change wall snapshot. */
    private executedChildren: UpdateWallSystemTypeCommand[] = [];
    private _skipped: WallLayerBatchSkip[] = [];

    constructor(private input: AddWallLayerBatchInput) {
        this.targetIds = input.wallIds === 'all' ? [] : [...input.wallIds];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly WallLayerBatchSkip[] { return this._skipped; }

    private _resolveWalls(ctx: CommandContext): WallRecordLike[] {
        const store = ctx.stores.wallStore as unknown as {
            getAll(): WallRecordLike[];
            getById?(id: string): WallRecordLike | undefined;
        };
        if (this.input.wallIds === 'all') return store.getAll();
        const out: WallRecordLike[] = [];
        // De-dup an explicit list so one wall never gains the layer twice.
        for (const id of new Set(this.input.wallIds)) {
            const w = store.getById?.(id);
            if (w !== undefined) out.push(w);
            else this._skipped.push({ wallId: id, reason: 'wall not found' });
        }
        return out;
    }

    /** The next instance layer stack for `w`, exterior-first, with the body
     *  seeded for monolithic walls so nothing is lost. */
    private _nextLayers(w: WallRecordLike): Record<string, unknown>[] {
        const existing: Record<string, unknown>[] =
            Array.isArray(w.layers) && w.layers.length > 0
                ? w.layers.map((l) => ({ ...l }))
                : [{
                    name: 'Wall Body',
                    function: 'structure',
                    thickness: w.thickness ?? 0.2,
                    materialColor: w.materialColor ?? '#cccccc',
                }];
        const layer: Record<string, unknown> = {
            name: this.input.name,
            function: this.input.layerFunction
                ?? (this.input.side === 'interior' ? 'finish-interior' : 'finish-exterior'),
            thickness: this.input.thickness,
            materialColor: this.input.materialColor,
            ...(this.input.materialId !== undefined ? { materialId: this.input.materialId } : {}),
        };
        return this.input.side === 'interior' ? [...existing, layer] : [layer, ...existing];
    }

    private _child(w: WallRecordLike): UpdateWallSystemTypeCommand {
        const layers = this._nextLayers(w);
        const thickness = round6(
            layers.reduce((sum, l) => sum + (typeof l['thickness'] === 'number' ? (l['thickness'] as number) : 0), 0),
        );
        return new UpdateWallSystemTypeCommand({
            wallId: w.id,
            // Instance-scoped: the binding is kept for display; geometry follows layers.
            systemTypeId: w.systemTypeId ?? null,
            layers,
            thickness,
        });
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const t = this.input.thickness;
        if (typeof t !== 'number' || !Number.isFinite(t) || t < LAYER_MIN_M || t > LAYER_MAX_M) {
            return {
                ok: false,
                reason:
                    `A finish layer must be between ${LAYER_MIN_M * 1000}mm and ` +
                    `${LAYER_MAX_M * 1000}mm thick; got ${t}m.`,
            };
        }
        if (!HEX_COLOR_RE.test(this.input.materialColor)) {
            return { ok: false, reason: `materialColor must be a '#rrggbb' hex string, got "${this.input.materialColor}".` };
        }
        if (typeof this.input.name !== 'string' || this.input.name.trim().length === 0) {
            return { ok: false, reason: 'The layer needs a name (e.g. "Plaster · Skim Coat").' };
        }
        if (this.input.side !== 'interior' && this.input.side !== 'exterior') {
            return { ok: false, reason: "side must be 'interior' or 'exterior'." };
        }

        this._skipped = [];
        const walls = this._resolveWalls(ctx);
        if (walls.length === 0) {
            // Empty scope is a VISIBLE decline, never a throw (§CONTEXT-DATA-HONESTY).
            return {
                ok: false,
                reason: this.input.wallIds === 'all'
                    ? 'There are no walls in this project to add a layer to.'
                    : 'None of the requested walls exist any more.',
            };
        }

        const refusals: string[] = this._skipped.map((s) => `Wall ${s.wallId}: ${s.reason}`);
        let acceptable = 0;
        for (const w of walls) {
            const v = this._child(w).canExecute(ctx);
            if (v.ok) acceptable++;
            else refusals.push(v.reason ?? `Wall ${w.id} refused the layer`);
        }
        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${walls.length} wall${walls.length === 1 ? '' : 's'} can take the ` +
                    `${this.input.name} layer — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.wall.addLayer.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this.executedChildren = [];
                this._skipped = [];

                const walls = this._resolveWalls(ctx);
                this.targetIds = walls.map((w) => w.id);
                const affected: string[] = [];

                for (const w of walls) {
                    const child = this._child(w);
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({ wallId: w.id, reason: v.reason ?? 'refused' });
                        continue;
                    }
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

                // Group identical refusal reasons so N identical skips read as ONE line.
                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) {
                    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                }
                const reasonLines = [...reasonCounts.entries()].map(
                    ([reason, count]) => `${count}× ${reason}`,
                );

                const mm = round6(this.input.thickness * 1000);
                const summary =
                    `Added a ${mm}mm ${this.input.name} layer to the ${this.input.side} side of ` +
                    `${changed} of ${total} wall${total === 1 ? '' : 's'}` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '');

                span.setAttribute('pryzm.wall.layerBatch.total', total);
                span.setAttribute('pryzm.wall.layerBatch.changed', changed);
                span.setAttribute('pryzm.wall.layerBatch.skipped', skippedCount);
                span.setAttribute('pryzm.wall.layerBatch.side', this.input.side);
                span.setAttribute('pryzm.wall.layerBatch.thicknessM', this.input.thickness);
                span.setAttribute('pryzm.wall.layerBatch.scope', this.input.wallIds === 'all' ? 'all' : 'ids');

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
        // full pre-change snapshot (baseline, openings, metadata.version intact).
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

    static deserialize(serialized: SerializedCommand): AddWallLayerBatchCommand {
        return new AddWallLayerBatchCommand(
            serialized.payload as AddWallLayerBatchInput,
        );
    }
}
