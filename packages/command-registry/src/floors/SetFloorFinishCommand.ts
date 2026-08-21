// §FEAT-FLOOR-SURFACE-FINISH (L-1881) — set the surface finish on a floor, and on
// a floor SET in ONE undo step.
//
// PRODUCT INTENT (founder, verbatim, 2026-08-21): *"How can I use one of the newly
// floor finishes created? I tried this in RAC: **finish to wooden parquet** →
// PRYZM AI: Floor surface finish isn't connected to chat yet."*
//
// That refusal was HONEST — there was no route — and this command is the route.
//
// ─── WHY NOT `floor.setMaterial` ────────────────────────────────────────────
//
// Because it is a DEAD VERB and says so in its own file. `plugins/floor/src/
// handlers/SetFloorMaterial.ts` returns `{valid:false}` from `canExecute` with the
// §FIX-DEAD-VERB-REFUSE reason: it writes the plugin's DETACHED Immer DTO store,
// which no renderer, no 2-D projector, no IFC exporter and no persistence path
// reads. Routing a new capability there would have reported success over a model
// nothing had touched — the §FIX-MATERIAL-DEAD-DISPATCH disease.
//
// The live route is the GEOMETRY store: `FloorStore.update()` (core-app-model),
// which merges, freezes, emits `bim-floor-updated`, and is what
// `FloorPanelBuilder` rebuilds from. This command drives that store directly, the
// same way `SetWallSideFinishCommand` drives `wallStore.updateWall`.
//
// ─── WHAT A FLOOR FINISH ACTUALLY IS, MEASURED ──────────────────────────────
//
// `resolveFloorColor` (FloorColourSystem.ts) resolves in this order:
//
//     floor.colour  →  finishSpec.finishColor  →  floor.materialId  →  layers[0]
//
// ⭐ SO WRITING `materialId` ALONE IS INVISIBLE ON ALMOST EVERY REAL FLOOR.
// `CreateFloorsByRoomTypeCommand` gives every auto-generated floor a
// `finishSpec.finishColor` (floorFinish.ts), which sits ABOVE `materialId` in that
// chain. A command that set only the id would return success, persist a real
// field, and change not one pixel — which is precisely the L-995/L-1670 shape this
// family has already paid for twice. So the write is the WHOLE finish:
// `materialId` + `finishSpec.{finishMaterialId,finishColor,finishPattern,
// materialName}`, and the per-instance `colour` override is CLEARED (undoably,
// and DISCLOSED in the report) because a new finish supersedes an older
// hand-picked tint — leaving it would mask the change the user just asked for.
//
// ─── THE THREE HOUSE RULES OF THE SHIPPED BATCH COMMANDS, UNCHANGED ─────────
//   1. REUSE, not rival — the batch orchestrates the single-floor command below.
//   2. ONE undo entry — undo() replays each child's undo in reverse order.
//   3. §CONTEXT-DATA-HONESTY — per-floor refusals are recorded and grouped,
//      all-refused is a visible no-op via canExecute, empty scope declines with a
//      message, and nothing here throws for a refusal.
//
// VALUE CONTRACT: the finish arrives RESOLVED — `{ materialId, materialColor
// '#rrggbb', materialName }`. The finish-NAME vocabulary lives in the chat
// resolver's ONE table (`ai-host/src/intents/finishRef.ts`); this command owns no
// name table. The PATTERN is derived here, from the material's own label, by
// `floorPatternForMaterialLabel` — see that file for why the floor needs one.
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
import type { FloorData } from '@pryzm/core-app-model';
import { describeFloorFinishRenderLimit } from '@pryzm/core-app-model/stores';
import { findMaterialRecord } from '@pryzm/schemas/materials';
import { floorPatternForMaterialLabel } from './floorFinishPattern';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/command-registry', '0.1.0');
    return _cachedTracer;
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/** The RESOLVED finish, exactly as `SetWallSideFinishCommand` receives one. */
export interface FloorSurfaceFinish {
    readonly materialId: string;
    readonly materialColor?: string;
    readonly materialName?: string;
}

// ─── Single floor ────────────────────────────────────────────────────────────

export interface SetFloorFinishInput {
    floorId: string;
    finish: FloorSurfaceFinish;
}

/**
 * The finish fields this command writes, composed from a resolved finish.
 *
 * Extracted as a pure function so the single command, the batch's read-back and
 * the tests all agree on WHAT "the finish landed" means — one definition, never
 * three (C84 EI-8). Returns a `Partial<FloorData>` ready for `FloorStore.update`.
 *
 * ⚠ `finishSpec` is MERGED here rather than handed over whole: `FloorStore.update`
 * does `Object.assign(merged, updates)`, which REPLACES a nested object outright,
 * so passing a bare `{finishColor}` would silently drop `exposedScreed`,
 * `jointWidth`, `coveSkirting` and the rest of the authored spec.
 */
export function composeFloorFinishUpdate(
    existing: FloorData,
    finish: FloorSurfaceFinish,
    pattern: ReturnType<typeof floorPatternForMaterialLabel>,
): Partial<FloorData> {
    return {
        materialId: finish.materialId,
        finishSpec: {
            ...existing.finishSpec,
            finishMaterialId: finish.materialId,
            ...(finish.materialColor !== undefined ? { finishColor: finish.materialColor } : {}),
            finishPattern: pattern,
            ...(finish.materialName !== undefined ? { materialName: finish.materialName } : {}),
        },
        // §FLOOR-FINISH-BEATS-TINT — see the header. `undefined` (not a delete)
        // because `Object.assign` copies it and `resolveFloorColor` tests
        // truthiness, so the override stops winning while the field's shape is
        // unchanged for persistence.
        colour: undefined,
    };
}

/** Did the finish REALLY land on this record? The one read-back predicate. */
export function floorCarriesFinish(
    record: FloorData | undefined,
    finish: FloorSurfaceFinish,
): boolean {
    if (!record) return false;
    if (record.materialId !== finish.materialId) return false;
    if (record.finishSpec?.finishMaterialId !== finish.materialId) return false;
    if (finish.materialColor !== undefined && record.finishSpec?.finishColor !== finish.materialColor) {
        return false;
    }
    return true;
}

export class SetFloorFinishCommand implements Command {
    readonly affectedStores = ['floor'] as const;
    readonly id: string;
    readonly type = CommandType.SET_FLOOR_FINISH;
    readonly timestamp: number;
    targetIds: string[];

    /** Pre-update snapshot captured in execute() — used by undo(). */
    private _beforeSnapshot: FloorData | null = null;

    constructor(private readonly _input: SetFloorFinishInput) {
        this.id = `cmd-floor-finish-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = [_input.floorId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const { floorStore } = ctx.stores as { floorStore?: { getById(id: string): FloorData | undefined } };
        if (!floorStore) return { ok: false, reason: 'FloorStore not available.' };
        if (!floorStore.getById(this._input.floorId)) {
            return { ok: false, reason: `Floor "${this._input.floorId}" not found.` };
        }
        const f = this._input.finish;
        if (!f || typeof f.materialId !== 'string' || f.materialId.length === 0) {
            return { ok: false, reason: 'finish.materialId is required.' };
        }
        if (f.materialColor !== undefined && !HEX_COLOR_RE.test(f.materialColor)) {
            return {
                ok: false,
                reason: `finish.materialColor must be a '#rrggbb' hex string, got "${f.materialColor}".`,
            };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const { floorStore } = ctx.stores as {
            floorStore?: {
                getById(id: string): FloorData | undefined;
                update(id: string, updates: Partial<FloorData>): FloorData | undefined;
            };
        };
        if (!floorStore) throw new Error('[SetFloorFinishCommand] FloorStore not available.');

        const existing = floorStore.getById(this._input.floorId);
        if (!existing) return { success: false, affectedElementIds: [] };

        this._beforeSnapshot = structuredClone(existing) as FloorData;

        const label = this._input.finish.materialName
            ?? findMaterialRecord(this._input.finish.materialId)?.label
            ?? this._input.finish.materialId;
        const pattern = floorPatternForMaterialLabel(label);

        const updated = floorStore.update(
            this._input.floorId,
            composeFloorFinishUpdate(existing, this._input.finish, pattern),
        );
        if (!updated) return { success: false, affectedElementIds: [] };

        return { success: true, affectedElementIds: [this._input.floorId] };
    }

    undo(ctx: CommandContext): CommandResult {
        const { floorStore } = ctx.stores as {
            floorStore?: { restoreSnapshot?(s: FloorData): void; update(id: string, u: Partial<FloorData>): unknown };
        };
        if (!floorStore || !this._beforeSnapshot) {
            return { success: false, affectedElementIds: [] };
        }
        // `restoreSnapshot` preserves the audit trail (preserveMetadata=true) —
        // the same route `UpdateFloorCommand.undo` takes.
        if (typeof floorStore.restoreSnapshot === 'function') {
            floorStore.restoreSnapshot(this._beforeSnapshot);
        } else {
            floorStore.update(this._beforeSnapshot.id, this._beforeSnapshot);
        }
        return { success: true, affectedElementIds: [this._beforeSnapshot.id] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: this._input,
        };
    }
}

// ─── Batch ───────────────────────────────────────────────────────────────────

export interface SetFloorFinishBatchInput {
    /** `'all'` = every floor finish in the project (ALL levels), or an id list. */
    floorIds: string[] | 'all';
    finish: FloorSurfaceFinish;
}

export interface FloorFinishBatchSkip {
    floorId: string;
    reason: string;
}

export class SetFloorFinishBatchCommand implements Command {
    readonly affectedStores = ['floor'] as const;
    readonly id: string;
    readonly type = CommandType.SET_FLOOR_FINISH_BATCH;
    readonly timestamp: number;
    targetIds: string[];

    private _executedChildren: SetFloorFinishCommand[] = [];
    private _skipped: FloorFinishBatchSkip[] = [];
    private _tintCleared: string[] = [];

    constructor(private readonly _input: SetFloorFinishBatchInput) {
        this.id = `cmd-floor-finish-batch-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
        this.targetIds = _input.floorIds === 'all' ? [] : [..._input.floorIds];
    }

    /** Skips recorded by the most recent execute() (empty before execution). */
    get skipped(): readonly FloorFinishBatchSkip[] { return this._skipped; }

    /**
     * Floors that carried a hand-picked `colour` override which this finish
     * SUPERSEDED. Not a skip — the write is correct and wanted — but it is a
     * second change the user did not literally ask for, so it is said out loud
     * rather than discovered later (§CONTEXT-DATA-HONESTY).
     */
    get tintCleared(): readonly string[] { return this._tintCleared; }

    private _resolveFloorIds(ctx: CommandContext): string[] {
        const { floorStore } = ctx.stores as { floorStore?: { getAll(): Array<{ id: string }> } };
        if (this._input.floorIds === 'all') {
            return (floorStore?.getAll() ?? []).map((f) => f.id);
        }
        return Array.from(new Set(this._input.floorIds));
    }

    private _child(floorId: string): SetFloorFinishCommand {
        return new SetFloorFinishCommand({ floorId, finish: { ...this._input.finish } });
    }

    private _valueLabel(): string {
        const f = this._input.finish;
        return `finish ${f.materialName ?? f.materialId}`;
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const { floorStore } = ctx.stores as { floorStore?: unknown };
        if (!floorStore) return { ok: false, reason: 'FloorStore not available.' };

        const ids = this._resolveFloorIds(ctx);
        if (ids.length === 0) {
            return {
                ok: false,
                reason: this._input.floorIds === 'all'
                    ? 'There are no floor finishes in this project to change.'
                    : 'No floors selected — select at least one floor first.',
            };
        }

        const refusals: string[] = [];
        let acceptable = 0;
        for (const floorId of ids) {
            const v = this._child(floorId).canExecute(ctx);
            if (v.ok) acceptable++;
            // §REFUSAL-IDENTITY (GE-09) — a stated reason passes VERBATIM.
            else refusals.push(childRefusalText(v.reason, 'SetFloorFinishCommand.canExecute', `floor ${floorId}`));
        }
        if (acceptable === 0) {
            return {
                ok: false,
                reason:
                    `None of the ${ids.length} floor${ids.length === 1 ? '' : 's'} can take the ` +
                    `${this._valueLabel()} — ${refusals[0]}`,
            };
        }
        return { ok: true, warnings: refusals.length > 0 ? refusals : undefined };
    }

    execute(ctx: CommandContext): CommandResult {
        return _tracer().startActiveSpan('pryzm.floor.setFinish.batch', (span) => {
            try {
                // Redo re-runs execute() on the same instance — reset, don't throw.
                this._executedChildren = [];
                this._skipped = [];
                this._tintCleared = [];

                const { floorStore } = ctx.stores as {
                    floorStore?: { getById(id: string): FloorData | undefined };
                };
                const ids = this._resolveFloorIds(ctx);
                this.targetIds = [...ids];
                const affected: string[] = [];

                for (const floorId of ids) {
                    const child = this._child(floorId);
                    const v = child.canExecute(ctx);
                    if (!v.ok) {
                        this._skipped.push({
                            floorId,
                            reason: childRefusalText(v.reason, 'SetFloorFinishCommand.canExecute', `floor ${floorId}`),
                        });
                        continue;
                    }
                    // Asked BEFORE the write: "did this floor carry a hand-picked
                    // tint that the finish is about to supersede?"
                    const hadTint = Boolean(floorStore?.getById(floorId)?.colour);

                    const r = child.execute(ctx);
                    if (!r.success) {
                        this._skipped.push({
                            floorId,
                            reason: childRefusalText(r.info?.[0], 'SetFloorFinishCommand.execute', `floor ${floorId}`),
                        });
                        continue;
                    }
                    // The child is retained for undo REGARDLESS of the read-back
                    // below: whatever the store did accept must stay revertible.
                    this._executedChildren.push(child);

                    // ── §FLOOR-FINISH-READBACK (L-1883 · C67 rule 12, C16 CA-21) ──
                    //
                    // COUNT RECORDS, NEVER SUCCESSFUL CALLS. This is the L-1670
                    // rule, adopted verbatim from `SetWallSideFinishBatchCommand`
                    // rather than re-derived. `SetFloorFinishCommand.execute`
                    // returns `{success:true}` the moment `FloorStore.update`
                    // returns a record — and that store MERGES fields, coerces
                    // `boundary.thickness` from the layer sum, and refuses a
                    // `levelId` change with a console warning while still
                    // returning success. A count derived from a return value
                    // cannot notice any of that, and a floor family that has
                    // already shipped one dead material verb
                    // (`floor.setMaterial`) does not get the benefit of the doubt.
                    //
                    // So: re-read from the authority and ask the one predicate
                    // (`floorCarriesFinish`) whether the record really carries it.
                    // A floor that fails is NOT counted as changed and is named as
                    // a skip, so a failure reads as a partial refusal rather than
                    // a confident lie.
                    if (!floorCarriesFinish(floorStore?.getById(floorId), this._input.finish)) {
                        this._skipped.push({
                            floorId,
                            reason:
                                `floor ${floorId}: the store accepted the write and reported success, but ` +
                                `reading the record back shows its finish is NOT ` +
                                `${this._input.finish.materialName ?? this._input.finish.materialId}. The value ` +
                                `did not reach the authority, so nothing about this floor changed — do not ` +
                                `trust a success count over this floor.`,
                        });
                        continue;
                    }
                    affected.push(floorId);
                    if (hadTint) this._tintCleared.push(floorId);
                }

                const total = ids.length;
                const changed = affected.length;
                const skippedCount = this._skipped.length;

                // Group identical refusal reasons so 40 identical skips read as ONE line.
                const reasonCounts = new Map<string, number>();
                for (const s of this._skipped) {
                    reasonCounts.set(s.reason, (reasonCounts.get(s.reason) ?? 0) + 1);
                }
                const reasonLines = [...reasonCounts.entries()].map(([reason, count]) => `${count}× ${reason}`);

                // ── THE DISCLOSURES RIDE THE SUCCESS SENTENCE ITSELF (§L960-STEP3).
                //
                // Concatenated into `summary` rather than appended as separate
                // `info` lines, for the reason L-960 established: a caveat on a
                // line a UI may not render is the same defect with an alibi.
                // Whoever shows the success sentence shows the caveats, or neither.
                const record = findMaterialRecord(this._input.finish.materialId);
                const hasMaps = record?.maps !== undefined && Object.keys(record.maps).length > 0;
                const mapsTail = (!hasMaps || changed === 0)
                    ? ''
                    : ` — ⚠ ${describeFloorFinishRenderLimit()}`;
                const tintTail = this._tintCleared.length === 0
                    ? ''
                    : ` — ${this._tintCleared.length} of them carried a hand-picked colour override, ` +
                      `which this finish replaces (Ctrl+Z restores it)`;

                const summary =
                    `Set the ${this._valueLabel()} on ${changed} of ${total} floor${total === 1 ? '' : 's'}` +
                    (skippedCount > 0 ? ` — ${skippedCount} skipped` : '') +
                    tintTail + mapsTail;

                span.setAttribute('pryzm.floor.finishBatch.total', total);
                span.setAttribute('pryzm.floor.finishBatch.changed', changed);
                span.setAttribute('pryzm.floor.finishBatch.skipped', skippedCount);
                span.setAttribute('pryzm.floor.finishBatch.tintCleared', this._tintCleared.length);
                span.setAttribute('pryzm.floor.finishBatch.materialHasMaps', hasMaps);
                span.setAttribute('pryzm.floor.finishBatch.scope', this._input.floorIds === 'all' ? 'all' : 'ids');

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
        // full pre-change snapshot.
        const affected: string[] = [];
        for (let i = this._executedChildren.length - 1; i >= 0; i--) {
            const child = this._executedChildren[i];
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
            payload: { floorIds: this._input.floorIds, finish: this._input.finish },
        };
    }
}
