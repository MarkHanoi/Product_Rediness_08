import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import { StairData, StairProperties, STAIR_CONSTRAINTS } from '@pryzm/geometry-stair';
// §STAIR-LEVEL-SPAN-CHANGE (L-1533) — base/top level is a SPAN, not two id fields.
// The re-solve is pure and lives beside the creation-path span resolver; the
// accept-set is the three authorities that already exist, never a fourth.
import { evaluateStairLevelSpanChange } from '@pryzm/geometry-stair';
import { GenerateStairGeometryCommand } from './GenerateStairGeometryCommand';
// §STAIR-VOID-FOLLOWS-SPAN (L-1532, closes L-1432) — a parameter edit must move
// EVERY void this stair owns, in every horizontal family, on every deck — and
// close the ones whose deck left the span. `reconcileStairOpening` alone did the
// slab only, and only for decks the stair still reaches.
import {
    cascadeStairVoids,
    undoStairVoidCascade,
    toStairVoidSource,
    EMPTY_STAIR_VOID_CASCADE,
    type StairVoidCascade,
} from './StairVoidCascade';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();


export interface UpdateStairParametersInput {
    stairId: string;
    updates: {
        width?: number;
        fireRating?: string;
        accessibilityType?: 'standard' | 'accessible';
        riserHeight?: number;
        treadDepth?: number;
        typeId?: string;
        properties?: Partial<StairProperties>;
        /**
         * §STAIR-LEVEL-SPAN-CHANGE (L-1533) — the founder's item 0.2, "be able to
         * change stair Base level + top level".
         *
         * ⛔ NOT A FIELD WRITE. Either of these re-solves the WHOLE stair: total
         * rise, riser height, riser count, the per-flight distribution, the
         * auto-openings punched per deck (§L-1433) and the floor/ceiling pierces
         * (§L-1431) — all inside THIS command's single undo unit. See
         * `_resolveSpanChange` and `StairLevelSpanChange.ts`.
         *
         * Supplying one leaves the other as it is, so "move the top up one storey"
         * is `{ topLevelId }` alone.
         */
        baseLevelId?: string;
        topLevelId?: string;
    };
}

/** §L-1533 — the re-solved span, carried from canExecute's check to execute's write. */
interface ResolvedSpanChange {
    readonly baseLevelId: string;
    readonly topLevelId: string;
    readonly riserHeight: number;
    readonly riserCount: number;
    readonly flightRiserCounts: readonly number[];
}

export class UpdateStairParametersCommand implements Command {
    // §FIX-STAIR-MOVE-STRANDS-VOID (review C-02) — a geometry-affecting parameter
    // edit re-reconciles the auto-carved slab void, so this command touches the
    // opening + slab stores exactly like DeleteStairCommand does.
    //
    // ⭐ §STAIR-VOID-FOLLOWS-SPAN (L-1532, closes L-1432) — 'floor' and 'ceiling'
    // JOIN the declaration. L-1431 widened `CreateStairCommand`'s declaration for
    // exactly this reason and stopped there; this command cut voids in neither
    // family, and would have been unable to DECLARE them if it had. A cascade that
    // mutates a store it does not declare is invisible to the scoped snapshot
    // (C03 §4.6 U-2) — the same defect, on the same family, one command over.
    readonly affectedStores = ["stair", "opening", "slab", "floor", "ceiling"] as const;
    readonly id: string;
    readonly type = CommandType.UPDATE_STAIR_PARAMETERS;
    readonly timestamp: number;
    readonly targetIds: string[];

    private stairId: string;
    private updates: UpdateStairParametersInput['updates'];
    // Phase 1: snapshot stores full StairData for proper undo via restoreSnapshot
    private _snapshot: StairData | null = null;
    // §FIX-STAIR-MOVE-STRANDS-VOID — before/after of the void cascade, reverted
    // inside THIS command's undo() (one undo unit for edit + every void it moved).
    /** §L-1433 / §L-1532 — one record PER PIERCED DECK, in EVERY family. */
    private _voidCascade: StairVoidCascade = EMPTY_STAIR_VOID_CASCADE;
    /** §L-1533 — the re-solved span, computed in canExecute, applied in execute. */
    private _spanChange: ResolvedSpanChange | null = null;
    private executed: boolean = false;

    constructor(input: UpdateStairParametersInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.stairId = input.stairId;
        this.updates = input.updates;
        this.targetIds = [input.stairId];
        Object.freeze(this.targetIds);
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const blockingIssues: string[] = [];
        const warnings: string[] = [];
        const { stairStore, wallStore } = ctx.stores;

        const stair = stairStore.get(this.stairId);
        if (!stair) {
            blockingIssues.push(`Stair "${this.stairId}" not found`);
            return { ok: false, reason: blockingIssues[0], blockingIssues };
        }

        if (this.updates.width !== undefined) {
            if (this.updates.width < STAIR_CONSTRAINTS.MIN_WIDTH) {
                blockingIssues.push(`Stair width ${(this.updates.width * 1000).toFixed(0)}mm is below minimum ${(STAIR_CONSTRAINTS.MIN_WIDTH * 1000).toFixed(0)}mm`);
            }
            const accessType = this.updates.accessibilityType || stair.accessibilityType;
            if (accessType === 'accessible' && this.updates.width < STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH) {
                blockingIssues.push(`Accessible stair width below minimum ${(STAIR_CONSTRAINTS.MIN_ACCESSIBLE_WIDTH * 1000).toFixed(0)}mm`);
            }
        }

        if (this.updates.riserHeight !== undefined) {
            if (this.updates.riserHeight < STAIR_CONSTRAINTS.MIN_RISER_HEIGHT) {
                blockingIssues.push(`Riser height ${(this.updates.riserHeight * 1000).toFixed(0)}mm is below minimum ${(STAIR_CONSTRAINTS.MIN_RISER_HEIGHT * 1000).toFixed(0)}mm`);
            }
            if (this.updates.riserHeight > STAIR_CONSTRAINTS.MAX_RISER_HEIGHT) {
                blockingIssues.push(`Riser height ${(this.updates.riserHeight * 1000).toFixed(0)}mm exceeds maximum ${(STAIR_CONSTRAINTS.MAX_RISER_HEIGHT * 1000).toFixed(0)}mm`);
            }

            const levels = wallStore.getLevels();
            const baseLevel = levels.find(l => l.id === stair.baseLevelId);
            const topLevel = levels.find(l => l.id === stair.topLevelId);

            if (baseLevel && topLevel) {
                const levelHeight = topLevel.elevation - baseLevel.elevation;
                const totalRisers = stair.riserCount || stair.flights.reduce((sum, f) => sum + f.riserCount, 0);
                const calculatedHeight = this.updates.riserHeight * totalRisers;
                const difference = Math.abs(calculatedHeight - levelHeight);

                if (difference > STAIR_CONSTRAINTS.HEIGHT_TOLERANCE) {
                    blockingIssues.push(`New total stair height ${(calculatedHeight * 1000).toFixed(0)}mm does not match level height ${(levelHeight * 1000).toFixed(0)}mm`);
                }
            }
        }

        if (this.updates.treadDepth !== undefined && this.updates.treadDepth < STAIR_CONSTRAINTS.MIN_TREAD_DEPTH) {
            blockingIssues.push(`Tread depth ${(this.updates.treadDepth * 1000).toFixed(0)}mm is below minimum ${(STAIR_CONSTRAINTS.MIN_TREAD_DEPTH * 1000).toFixed(0)}mm`);
        }

        // §STAIR-LEVEL-SPAN-CHANGE (L-1533) — the founder's item 0.2.
        const span = this._resolveSpanChange(ctx);
        if (span && !span.ok) {
            blockingIssues.push(...span.refusals);
        }

        if (blockingIssues.length > 0) {
            return { ok: false, reason: blockingIssues[0], blockingIssues, warnings };
        }

        return { ok: true, warnings };
    }

    execute(ctx: CommandContext): CommandResult {
        const { stairStore } = ctx.stores;
        const stair = stairStore.get(this.stairId);

        if (!stair) {
            return { success: false, affectedElementIds: [], info: [`Stair "${this.stairId}" not found`] };
        }

        // Phase 1: Capture a full StairData snapshot for proper restoreSnapshot undo
        this._snapshot = structuredClone(stair as any) as StairData;

        const updatedStair: Partial<StairData> = {};

        // §STAIR-LEVEL-SPAN-CHANGE (L-1533) — resolved HERE and not read from
        // `canExecute`'s run, because `CommandManagerImpl.redo()` calls `execute()`
        // DIRECTLY and never re-validates. The resolve is a pure function of the
        // stair + the level table, and undo has restored both by the time a redo
        // runs, so both calls agree by construction rather than by a cached field.
        const span = this._resolveSpanChange(ctx);
        if (span && !span.ok) {
            // A refusal reaching execute() means the caller skipped canExecute (the
            // redo path, or a direct `cmd.execute(ctx)`). Refuse identically — with
            // BOTH numbers — rather than writing a stair that fails its own validator.
            return { success: false, affectedElementIds: [], info: span.refusals };
        }
        if (span?.ok) {
            const r = span.span;
            this._spanChange = r;
            updatedStair.baseLevelId = r.baseLevelId;
            updatedStair.topLevelId  = r.topLevelId;
            // `levelId` is the stair's OWN level and `CreateStairCommand` sets it to
            // the base level. Leaving it behind would strand the stair on a level it
            // no longer starts from — level isolation, plan projection and
            // `bimManager.registerElement` all read this field, not `baseLevelId`.
            updatedStair.levelId     = r.baseLevelId;
            updatedStair.riserHeight = r.riserHeight;
            updatedStair.riserCount  = r.riserCount;
            updatedStair.flights     = stair.flights.map((f, i) => ({
                ...f,
                riserCount: r.flightRiserCounts[i] ?? f.riserCount,
            }));
        }

        if (this.updates.width !== undefined) updatedStair.width = this.updates.width;
        if (this.updates.fireRating !== undefined) updatedStair.fireRating = this.updates.fireRating;
        if (this.updates.accessibilityType !== undefined) updatedStair.accessibilityType = this.updates.accessibilityType;
        // ⚠ A span change DERIVES riserHeight from the new rise; an explicit
        // `riserHeight` in the same payload would break `riserHeight × riserCount
        // === rise`. The span wins, and says so — silently honouring the explicit
        // value would write a stair that fails its own height-match validator.
        if (this.updates.riserHeight !== undefined) {
            if (this._spanChange) {
                console.warn(
                    `[UpdateStairParametersCommand] riserHeight ${(this.updates.riserHeight * 1000).toFixed(0)}mm ` +
                    `was supplied alongside a level-span change; the span derives ` +
                    `${(this._spanChange.riserHeight * 1000).toFixed(0)}mm and wins ` +
                    `(riserHeight x riserCount must equal the rise).`,
                );
            } else {
                updatedStair.riserHeight = this.updates.riserHeight;
            }
        }
        if (this.updates.treadDepth !== undefined) updatedStair.treadDepth = this.updates.treadDepth;
        if (this.updates.typeId !== undefined) updatedStair.typeId = this.updates.typeId;
        if (this.updates.properties !== undefined) {
            updatedStair.properties = { ...stair.properties, ...this.updates.properties };
        }

        if (this.updates.typeId && ctx.stores.stairTypeStore) {
            const typeDefaults = ctx.stores.stairTypeStore.resolveDefaults(this.updates.typeId);
            if (typeDefaults && !updatedStair.properties) {
                updatedStair.properties = { ...stair.properties, ...(typeDefaults as Partial<StairProperties>) };
            }
        }

        stairStore.update(this.stairId, updatedStair);
        this.executed = true;

        // §FIX-STAIR-AUTHORED-PARAM-DEAF — this command wrote the PRIMITIVES and
        // stopped. Geometry regeneration lived only on the generic
        // `UpdateElementParameterCommand` → ElementRebuildRegistry path, so the same
        // parameter edited through THIS command (the stair param panel / AI route)
        // left the derived fields and the 3D mesh stale — two rival update paths with
        // different outcomes, which is what the founder's console showed
        // (UPDATE_STAIR_PARAMETERS with no GenerateStairGeometryCommand after it).
        //
        // Route through the SAME single geometry command instead of forking a second
        // pipeline (C11 — one element-creation/regeneration path). Undo is unaffected:
        // this command restores a FULL StairData snapshot, which already contains the
        // derived fields the rebuild recomputes.
        if (this._geometryAffecting()) {
            try {
                const res = new GenerateStairGeometryCommand({ stairId: this.stairId }).execute(ctx);
                if (!res.success) {
                    console.warn('[UpdateStairParametersCommand] geometry rebuild failed:', res.info);
                }
            } catch (e) {
                console.warn('[UpdateStairParametersCommand] geometry rebuild error:', e);
            }

            // §STAIR-VOID-FOLLOWS-SPAN (L-1532, closes L-1432) — after the geometry
            // settles (the rebuild may re-derive flights/landings), make EVERY void
            // this stair owns match the stair: the slab void per deck, the
            // floor-finish and ceiling voids per deck, AND the removal of any void
            // whose deck has left the span. This used to be `reconcileStairOpening`
            // alone — the SLAB family only, and only on decks the stair still
            // reaches, so a floor finish kept its hole after a move and a shortened
            // stair kept holes in decks it no longer touched.
            // The cascade is a strict no-op when nothing changed (a riserHeight-only
            // edit does not move the footprint), so a non-footprint edit still never
            // rebuilds a slab.
            try {
                const updated = ctx.stores.stairStore.get(this.stairId);
                this._voidCascade = updated
                    ? cascadeStairVoids(ctx, toStairVoidSource(updated as unknown as StairData))
                    : EMPTY_STAIR_VOID_CASCADE;
            } catch (e) {
                console.warn('[UpdateStairParametersCommand] void cascade failed (non-fatal):', e);
                this._voidCascade = EMPTY_STAIR_VOID_CASCADE;
            }
        }

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[UpdateStairParametersCommand] Updated stair ${this.stairId}`, this.updates);

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair parameters updated successfully'] };
    }

    /**
     * True when at least one edited key feeds the stair's geometry. Mirrors the
     * `geometryParams` set the ElementRebuildRegistry declares for `stair`, so both
     * update paths agree on what triggers a rebuild.
     */
    private _geometryAffecting(): boolean {
        // §L-1533 — `baseLevelId` / `topLevelId` are the MOST geometry-affecting keys
        // this command carries: they set the rise the whole stair is solved against.
        // Omitting them would leave a re-levelled stair rendered at its old height
        // and its voids on its old decks.
        const GEOMETRY_KEYS = [
            'width', 'riserHeight', 'treadDepth', 'typeId', 'properties',
            'baseLevelId', 'topLevelId',
        ] as const;
        return GEOMETRY_KEYS.some(k => this.updates[k] !== undefined);
    }

    /**
     * ⭐ §STAIR-LEVEL-SPAN-CHANGE (L-1533) — resolve AND validate a base/top level
     * change. Returns `null` when the payload asks for no span change at all.
     *
     * ⛔ THIS FUNCTION OWNS NO RULES. It composes the three authorities that
     * already exist, each on the axis it owns, so the accept-set of a re-levelled
     * stair is by construction the same as the accept-set of a newly created one
     * (C84 EI-1 / §STAIR-ONE-LIMIT-AUTHORITY — this family has already paid once
     * for two hand-copied minima that drifted 30 mm apart):
     *
     *   1. `resolveStairLevelSpanChange` — is the SPAN itself authorable, and what
     *      riser distribution does it imply? Refuses same-level, unknown level,
     *      non-climbing and sub-minimum spans, each naming BOTH numbers.
     *   2. `LevelTraversalPolicy.canTraverse` — may THIS STAIR TYPE skip that many
     *      levels? (`maxLevelSkip`.)
     *   3. `StairValidationAuthority.validate` + `checkStairGeometry` — is the
     *      RESULT a legal stair? The authority carries riser/tread/width/count and
     *      the height-match invariant; `checkStairGeometry` adds the §L-1434
     *      per-flight RISE cap, which the authority does not carry. Both run against
     *      the CANDIDATE — the stair as it would be — not the stair as it is.
     *
     * ⚠ §L-1437, LOAD-BEARING: `stairTypeStore` is threaded into BOTH (2) and (3).
     * Two built-in types are LOOSER than `STAIR_CONSTRAINTS`, so validating without
     * it refuses spans the model permits — a false refusal in the voice of a
     * validator, which L-1437 recorded as worse than no check at all.
     *
     * Every refusal states WHAT WAS ASKED and WHAT IS ALLOWED (the founder's
     * standing doctrine): the authority errors carry `currentValue` /
     * `requiredValue`, `checkStairGeometry` refusals carry the same pair, and the
     * span resolver carries `requested` / `limit`.
     */
    private _resolveSpanChange(
        ctx: CommandContext,
    ): { ok: true; span: ResolvedSpanChange } | { ok: false; refusals: string[] } | null {
        const wantBase = this.updates.baseLevelId;
        const wantTop  = this.updates.topLevelId;
        if (wantBase === undefined && wantTop === undefined) return null;

        const stair = ctx.stores.stairStore.get(this.stairId) as StairData | undefined;
        if (!stair) return { ok: false, refusals: [`Stair "${this.stairId}" not found`] };

        const baseLevelId = wantBase ?? stair.baseLevelId;
        const topLevelId  = wantTop  ?? stair.topLevelId;
        if (baseLevelId === stair.baseLevelId && topLevelId === stair.topLevelId) {
            return null;   // the payload named the levels it already has — nothing to do.
        }

        // ⭐ ONE GATE. The composition of the three authorities lives in
        // `evaluateStairLevelSpanChange`, NOT here, so the stair property panel can
        // grey out an unbuildable pair for exactly the reason this command would
        // refuse it. Two call sites re-assembling the same three checks is the shape
        // that produced §STAIR-ONE-LIMIT-AUTHORITY (L-1430) and the rake panel's
        // rival gate (§FEAT-RAKE-LAYERED).
        const verdict = evaluateStairLevelSpanChange({
            stair: stair as never,
            levels: ctx.stores.wallStore.getLevels() as never,
            baseLevelId,
            topLevelId,
            typeId: this.updates.typeId ?? stair.typeId,
            treadDepth: this.updates.treadDepth,
            width: this.updates.width,
            accessibilityType: this.updates.accessibilityType,
            // §L-1437 — the type store is LOAD-BEARING in the validation context:
            // two built-in types are LOOSER than the defaults, and omitting it mints
            // false refusals for spans the model permits.
            typeStore: ctx.stores.stairTypeStore as never,
        });
        if (!verdict.ok) return { ok: false, refusals: [...verdict.refusals] };
        for (const w of verdict.warnings) {
            console.log(`[UpdateStairParametersCommand] level-span note: ${w}`);
        }
        return {
            ok: true,
            span: {
                baseLevelId,
                topLevelId,
                riserHeight: verdict.riserHeight,
                riserCount: verdict.riserCount,
                flightRiserCounts: verdict.flightRiserCounts,
            },
        };
    }

    undo(ctx: CommandContext): CommandResult {
        if (!this.executed || !this._snapshot) {
            return { success: false, affectedElementIds: [], info: ['Cannot undo: command was never executed'] };
        }

        const { stairStore } = ctx.stores;

        // Phase 1: Use restoreSnapshot for correct undo — no version increment, no modifiedAt change
        stairStore.restoreSnapshot(this._snapshot);

        // §STAIR-VOID-FOLLOWS-SPAN (L-1532) — revert the WHOLE void cascade in the
        // SAME undo unit as the edit. The stair record is restored FIRST (above),
        // because the floor/ceiling half re-derives its voids from the restored
        // stair rather than replaying a snapshot of a derived value.
        undoStairVoidCascade(
            ctx,
            this._voidCascade,
            toStairVoidSource(this._snapshot as StairData),
        );
        this._voidCascade = EMPTY_STAIR_VOID_CASCADE;
        this._spanChange = null;

        _bus.emit('ai-model-update', {}); // F.events.17

        console.log(`[UpdateStairParametersCommand] Undone update for stair ${this.stairId}`);

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair parameter update undone'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { stairId: this.stairId, updates: this.updates },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
