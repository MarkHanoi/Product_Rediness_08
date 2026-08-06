import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import type { StairData } from '@pryzm/geometry-stair';
import {
    deriveStairGeometry,
    stairDerivedGeometryDiffers,
    reconcilePathAuthoredStairLayout,
    stairAuthoredLayoutDiffers,
} from '@pryzm/geometry-stair';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface GenerateStairGeometryInput {
    stairId: string;
}

/**
 * Regenerate a stair's geometry so it agrees with its current parameters.
 *
 * §FIX-STAIR-PARAM-NO-REGEN (L-215): a stair parameter edit writes only the
 * PRIMITIVE fields (width / riserHeight / treadDepth / …). The fields
 * StairMeshBuilder actually consumes — `flights[].riserCount`, `landings[].depth`,
 * total `riserCount`, adjusted `riserHeight` — are DERIVED and were left stale, so
 * the mesh rebuilt identically (founder: "width doesn't update the landing shape;
 * riser height doesn't update the preview; tread depth doesn't update"). This
 * command now RECONCILES those derived fields from the primitives (via the pure
 * @pryzm/geometry-stair `deriveStairGeometry`) and persists them, then rebuilds
 * the 3D mesh. Persisting through `stairStore.update` emits `bim-stair-updated`,
 * which the railing builder AND the selection-highlight re-resolver already listen
 * to — so the flight, landing, treads/risers, railing and the selection overlay
 * all refresh together and the stale purple ghost is disposed with the old mesh.
 */
export class GenerateStairGeometryCommand implements Command {
    readonly affectedStores = ["stair"] as const;
    readonly id: string;
    readonly type = CommandType.GENERATE_STAIR_GEOMETRY;
    readonly timestamp: number;
    readonly targetIds: string[];

    private stairId: string;
    private geometryGenerated: boolean = false;
    // §FIX-STAIR-PARAM-NO-REGEN — snapshot of the derived fields BEFORE reconciliation,
    // so undo can restore them if this command is ever run standalone on the undo stack.
    private _derivedSnapshot: Pick<StairData, 'flights' | 'landings' | 'riserCount' | 'riserHeight'> | null = null;

    constructor(input: GenerateStairGeometryInput) {
        this.id = crypto.randomUUID();
        this.timestamp = Date.now();
        this.stairId = input.stairId;
        this.targetIds = [input.stairId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const { stairStore } = ctx.stores;
        const stair = stairStore.get(this.stairId);

        if (!stair) {
            return { ok: false, reason: `Stair "${this.stairId}" not found` };
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const { stairStore } = ctx.stores;
        const stair = stairStore.get(this.stairId);

        if (!stair) {
            return { success: false, affectedElementIds: [], info: [`Stair "${this.stairId}" not found`] };
        }

        // ── Reconcile derived geometry from the (already-written) primitives ──────
        // The parameter edit that dispatched this command wrote width/riserHeight/
        // treadDepth/… to the store; here we bring the DERIVED fields back into
        // agreement so the rebuilt mesh reflects the new parameters.
        this._reconcileDerivedGeometry(ctx, stair);

        // ── Propagate a changed railing TYPE to the railing configs ───────────────
        // (Previously a bespoke stair branch inside UpdateElementParameterCommand.)
        this._syncRailingType(ctx);

        // ── Authoritative 3D mesh rebuild ─────────────────────────────────────────
        // Read the latest stair (reconciliation above may have updated the store).
        const latest = stairStore.get(this.stairId) ?? stair;
        const stairMeshBuilder = ctx.stores.stairMeshBuilder;

        if (stairMeshBuilder) {
            stairMeshBuilder.updateStair(latest);
            this.geometryGenerated = true;
            console.log(`[GenerateStairGeometryCommand] Generated geometry for stair ${this.stairId}`);
        } else {
            console.warn(`[GenerateStairGeometryCommand] StairMeshBuilder not available`);
        }

        _bus.emit('bim-stair-geometry-updated', { id: this.stairId }); // F.events.17

        return {
            success: true,
            affectedElementIds: [this.stairId],
            info: [this.geometryGenerated ? 'Stair geometry generated' : 'Geometry builder not available']
        };
    }

    /**
     * Bring `flights` / `landings` / `riserCount` / `riserHeight` into agreement
     * with the stair's primitive parameters (width, target riserHeight, treadDepth,
     * shape, …) and the connecting level height. Skips stairs authored from a 2D
     * polyline / curved path (`deriveStairGeometry` returns null for those) so their
     * bespoke per-flight layout is preserved.
     */
    private _reconcileDerivedGeometry(ctx: CommandContext, stair: StairData): void {
        const levelHeight = this._resolveLevelHeight(ctx, stair);
        const derived = deriveStairGeometry(stair, levelHeight);

        if (!derived) {
            // §FIX-STAIR-AUTHORED-PARAM-DEAF — PATH-AUTHORED stair (drawn with the
            // stair-path tool; carries per-flight treadDepth / landing centre). This
            // used to `return` outright, which is why the founder's width edit never
            // fixed the landing and the tread-depth edit did nothing at all: NOTHING
            // was reconciled, so the mesh rebuilt from creation-time fields.
            //
            // We must not re-split the drawn flights (that would discard the drawn
            // footprint), but landing DEPTH, landing CENTRE, per-flight TREAD DEPTH
            // and the flight START pins ARE functions of `width` / `treadDepth` and
            // must follow them. `reconcilePathAuthoredStairLayout` re-runs the exact
            // forward chain StairSolver2D + StairPathAdapter used at creation, so it
            // is a no-op when nothing relevant changed.
            const layout = reconcilePathAuthoredStairLayout(stair);
            if (!layout) return;
            if (!stairAuthoredLayoutDiffers(stair, layout)) return;

            this._derivedSnapshot = {
                flights: structuredClone(stair.flights),
                landings: structuredClone(stair.landings),
                riserCount: stair.riserCount,
                riserHeight: stair.riserHeight,
            };
            ctx.stores.stairStore.update(this.stairId, {
                flights: layout.flights,
                landings: layout.landings,
            });
            return;
        }

        if (!stairDerivedGeometryDiffers(stair, derived)) return; // already consistent

        this._derivedSnapshot = {
            flights: structuredClone(stair.flights),
            landings: structuredClone(stair.landings),
            riserCount: stair.riserCount,
            riserHeight: stair.riserHeight,
        };

        ctx.stores.stairStore.update(this.stairId, {
            flights: derived.flights,
            landings: derived.landings,
            riserCount: derived.riserCount,
            riserHeight: derived.riserHeight,
        });
    }

    /** Level height between the stair's base and top levels; falls back to the
     *  current total rise (riserHeight × riserCount) when levels are unavailable. */
    private _resolveLevelHeight(ctx: CommandContext, stair: StairData): number {
        try {
            const levels = ctx.stores.wallStore?.getLevels?.() ?? [];
            const base = levels.find(l => l.id === stair.baseLevelId);
            const top = levels.find(l => l.id === stair.topLevelId);
            if (base && top) return top.elevation - base.elevation;
        } catch (e) {
            console.warn('[GenerateStairGeometryCommand] level lookup failed:', e);
        }
        return stair.riserHeight * stair.riserCount;
    }

    /**
     * When `properties.railingType` changed, propagate it to the railing configs in
     * StairRailingStore so the railing rebuild (driven by `bim-stair-updated`) picks
     * up the new type. No-op when the store or a railingType is absent.
     */
    private _syncRailingType(ctx: CommandContext): void {
        try {
            const stairRailingStore = ctx.stores.stairRailingStore;
            if (!stairRailingStore) return;
            const stair = ctx.stores.stairStore.get(this.stairId);
            const railingType = stair?.properties?.railingType;
            if (railingType === undefined) return;
            const railings = stairRailingStore.getByStairId(this.stairId);
            railings.forEach(r => {
                stairRailingStore.update?.(r.id, { railingType });
            });
        } catch (e) {
            console.warn('[GenerateStairGeometryCommand] Railing type sync error:', e);
        }
    }

    undo(_ctx: CommandContext): CommandResult {
        // Restore derived fields if reconciliation changed them (standalone undo).
        if (this._derivedSnapshot) {
            _ctx.stores.stairStore.update(this.stairId, { ...this._derivedSnapshot });
            this._derivedSnapshot = null;
        }

        if (!this.geometryGenerated) {
            return { success: true, affectedElementIds: [], info: ['No geometry was generated to undo'] };
        }

        const stairMeshBuilder = _ctx.stores.stairMeshBuilder;
        if (stairMeshBuilder) {
            // Rebuild from the (restored) store state rather than removing the mesh
            // outright — undo should leave a correct stair, not a gap.
            const stair = _ctx.stores.stairStore.get(this.stairId);
            if (stair) {
                stairMeshBuilder.updateStair(stair);
            } else {
                stairMeshBuilder.removeStair(this.stairId);
            }
            console.log(`[GenerateStairGeometryCommand] Reverted geometry for stair ${this.stairId}`);
        }

        return { success: true, affectedElementIds: [this.stairId], info: ['Stair geometry reverted'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: { stairId: this.stairId, geometryGenerated: this.geometryGenerated },
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}
