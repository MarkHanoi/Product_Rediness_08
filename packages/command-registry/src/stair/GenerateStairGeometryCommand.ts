import {
    Command,
    CommandType,
    CommandValidationResult,
    CommandResult,
    SerializedCommand,
    CommandContext
} from '../types';
import type { StairData, StairRailingConfig } from '@pryzm/geometry-stair';
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

        // ── Propagate the railing-bearing properties to the railing configs ───────
        // (railingType was previously a bespoke stair branch inside
        // UpdateElementParameterCommand; handrailHeight + material joined it under
        // §FIX-STAIR-RAILING-PROPS-STRANDED.)
        this._syncRailingProperties(ctx);

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
     * Propagate the stair's railing-bearing PROPERTIES to the railing configs in
     * StairRailingStore, so the railing rebuild (driven by `bim-stair-updated`) picks
     * them up. No-op when the store is absent.
     *
     * §FIX-STAIR-RAILING-PROPS-STRANDED — this used to sync `railingType` ONLY.
     * `CreateStairCommand.proposeRailings()` seeds each railing's `topRailHeight` from
     * `stair.properties.handrailHeight` and its `material` from
     * `stair.properties.material`, and from that moment the two records diverge: the
     * railing keeps its CREATION-TIME height and material for ever. So editing the
     * stair's material changed the treads/risers/stringers but left the balustrade in
     * the old material, and `handrailHeight` — a StairProperties field with a schema,
     * a default and a code-compliance range in STAIR_CONSTRAINTS — could not affect
     * anything at all after creation. Both are functions of the stair's properties and
     * must follow them, exactly as `railingType` already did.
     */
    private _syncRailingProperties(ctx: CommandContext): void {
        try {
            const stairRailingStore = ctx.stores.stairRailingStore;
            if (!stairRailingStore) return;
            const stair = ctx.stores.stairStore.get(this.stairId);
            const props = stair?.properties;
            if (!props) return;

            const patch: Partial<StairRailingConfig> = {};
            if (props.railingType !== undefined)    patch.railingType   = props.railingType;
            if (props.handrailHeight !== undefined) patch.topRailHeight = props.handrailHeight;
            if (props.material !== undefined)       patch.material      = props.material;
            if (Object.keys(patch).length === 0) return;

            const railings = stairRailingStore.getByStairId(this.stairId);
            railings.forEach(r => {
                // Skip railings already in agreement. `StairRailingStore.update` emits
                // `bim-stair-railing-updated` unconditionally, and this method runs on
                // EVERY stair rebuild — so writing an unchanged value would rebuild every
                // balustrade on every unrelated parameter edit. Same "only write when it
                // differs" discipline as `stairAuthoredLayoutDiffers` above.
                const differs = (Object.keys(patch) as Array<keyof StairRailingConfig>)
                    .some(k => r[k] !== patch[k]);
                if (differs) stairRailingStore.update?.(r.id, patch);
            });
        } catch (e) {
            console.warn('[GenerateStairGeometryCommand] Railing property sync error:', e);
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
