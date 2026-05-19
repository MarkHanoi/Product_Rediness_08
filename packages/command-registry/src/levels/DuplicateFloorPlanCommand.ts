/**
 * DuplicateFloorPlanCommand
 *
 * Clones every element on a source level to one or more target levels.
 * Cloned element types: Walls (+ their openings), Slabs, Columns, Furniture.
 *
 * Elevation handling
 * ──────────────────
 * Each target level has a different elevation than the source.  World-Y values
 * for all cloned elements are shifted by (targetElevation - sourceElevation)
 * so geometry lands at the correct storey height.
 *
 * Undo
 * ────
 * Removes every element created by this command.  The stable pre-generated
 * IDs mean redo is idempotent (§2.6 contract).
 *
 * Contract compliance
 * ───────────────────
 *   §01 §2.6 — element IDs pre-generated and deterministic across redo.
 *   §01 §2.7 — no direct builder calls; geometry rebuild driven by store events.
 *   §01 §3.5 — bimManager.registerElement() called by sub-commands, not here.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import { CreateWallCommand } from '../walls/CreateWallCommand';
import { CreateWallOpeningCommand } from '../walls/CreateWallOpeningCommand';
import { CreateSlabCommand } from '../slabs/CreateSlabCommand';
import { CreateColumnCommand } from '../columns/CreateColumnCommand';
import { CreateFurnitureCommand } from '../furniture/CreateFurnitureCommand';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

export interface DuplicateFloorPlanPayload {
    sourceLevelId:  string;
    targetLevelIds: string[];
}

export class DuplicateFloorPlanCommand implements Command {
    readonly affectedStores = ['wall', 'slab', 'column', 'furniture', 'level'] as const;
    readonly id:        string;
    readonly type =     CommandType.DUPLICATE_FLOOR_PLAN;
    readonly timestamp: number;
    targetIds:          string[] = [];

    private _createdWallIds:      string[] = [];
    private _createdSlabIds:      string[] = [];
    private _createdColumnIds:    string[] = [];
    private _createdFurnitureIds: string[] = [];

    constructor(private payload: DuplicateFloorPlanPayload) {
        this.id        = `cmd-dup-fp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        this.timestamp = Date.now();
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        if (!ctx.bimManager.getLevelById(this.payload.sourceLevelId)) {
            return { ok: false, reason: `Source level "${this.payload.sourceLevelId}" not found.` };
        }
        if (!this.payload.targetLevelIds.length) {
            return { ok: false, reason: 'No target levels specified.' };
        }
        for (const tId of this.payload.targetLevelIds) {
            if (tId === this.payload.sourceLevelId) {
                return { ok: false, reason: 'Source and target level cannot be the same.' };
            }
            if (!ctx.bimManager.getLevelById(tId)) {
                return { ok: false, reason: `Target level "${tId}" not found.` };
            }
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        // §2.6 Redo idempotency — if elements were already created and are still
        // present in the store, skip re-execution.
        if (this._createdWallIds.length > 0) {
            const allPresent = this._createdWallIds.every(id => ctx.stores.wallStore.getById(id));
            if (allPresent) {
                return {
                    success: true,
                    affectedElementIds: this._all(),
                    info: ['DuplicateFloorPlan: redo idempotency — elements already present.'],
                };
            }
        }

        const srcLevel = ctx.bimManager.getLevelById(this.payload.sourceLevelId);
        if (!srcLevel) return { success: false, affectedElementIds: [], info: ['Source level not found.'] };

        // ── Gather source elements ────────────────────────────────────────────
        const srcWalls     = ctx.stores.wallStore.getByLevel(this.payload.sourceLevelId);
        const srcSlabs     = ctx.stores.slabStore.getAll().filter(s => s.levelId === this.payload.sourceLevelId);
        const srcColumns   = ctx.stores.columnStore.getAll().filter(c => c.levelId === this.payload.sourceLevelId);
        const srcFurniture = ctx.stores.furnitureStore.getAll().filter(f => f.levelId === this.payload.sourceLevelId);

        const createdWalls:     string[] = [];
        const createdSlabs:     string[] = [];
        const createdColumns:   string[] = [];
        const createdFurniture: string[] = [];

        for (let li = 0; li < this.payload.targetLevelIds.length; li++) {
            const targetLevelId = this.payload.targetLevelIds[li];
            const tgtLevel = ctx.bimManager.getLevelById(targetLevelId);
            if (!tgtLevel) {
                console.warn(`[DuplicateFloorPlan] Target level "${targetLevelId}" not found — skipping.`);
                continue;
            }

            const elevDelta = tgtLevel.elevation - srcLevel.elevation;

            // ── Walls ─────────────────────────────────────────────────────────
            for (let wi = 0; wi < srcWalls.length; wi++) {
                const w       = srcWalls[wi];
                const newWallId = `wall-dup-${this.id}-${li}-${wi}`;

                const wallCmd = new CreateWallCommand(newWallId, {
                    start:        { x: w.baseLine[0].x, z: w.baseLine[0].z },
                    end:          { x: w.baseLine[1].x, z: w.baseLine[1].z },
                    height:       w.height,
                    thickness:    w.thickness,
                    levelId:      targetLevelId,
                    baseOffset:   w.baseOffset ?? 0,
                    materialId:   w.materialId,
                    materialColor: w.materialColor,
                    systemTypeId: w.systemTypeId,
                    curve: w.curve ? {
                        control:  { x: w.curve.control.x, y: w.curve.control.y + elevDelta, z: w.curve.control.z },
                        segments: w.curve.segments,
                    } : undefined,
                });

                const vr = wallCmd.canExecute(ctx);
                if (!vr.ok) {
                    console.warn(`[DuplicateFloorPlan] Skipping wall ${w.id}: ${vr.reason}`);
                    continue;
                }
                const wr = wallCmd.execute(ctx);
                if (!wr.success) continue;
                createdWalls.push(newWallId);

                // Clone openings (doors + windows) embedded on the source wall
                if (w.openings && w.openings.length > 0) {
                    for (let oi = 0; oi < w.openings.length; oi++) {
                        const op = w.openings[oi];
                        const openCmd = new CreateWallOpeningCommand({
                            wallId: newWallId,
                            openingData: {
                                ...op,
                                id:        `op-dup-${this.id}-${li}-${wi}-${oi}`,
                                elementId: `el-dup-${this.id}-${li}-${wi}-${oi}`,
                            },
                        });
                        const ovr = openCmd.canExecute(ctx);
                        if (!ovr.ok) {
                            console.warn(`[DuplicateFloorPlan] Skipping opening ${op.id}: ${ovr.reason}`);
                            continue;
                        }
                        openCmd.execute(ctx);
                    }
                }
            }

            // ── Slabs ─────────────────────────────────────────────────────────
            for (let si = 0; si < srcSlabs.length; si++) {
                const s       = srcSlabs[si];
                const newSlabId = `slab-dup-${this.id}-${li}-${si}`;

                const slabCmd = new CreateSlabCommand({
                    id:        newSlabId,
                    width:     s.width,
                    depth:     s.depth,
                    thickness: s.thickness,
                    position:  { x: s.position.x, y: s.position.y + elevDelta, z: s.position.z },
                    levelId:   targetLevelId,
                    polygon:   s.polygon ? s.polygon.map((p: { x: number; y: number }) => ({ x: p.x, y: p.y })) : undefined,
                    holes:     s.holes as { x: number; y: number }[][] | undefined,
                });

                const sv = slabCmd.canExecute(ctx);
                if (!sv.ok) {
                    console.warn(`[DuplicateFloorPlan] Skipping slab ${s.id}: ${sv.reason}`);
                    continue;
                }
                const sr = slabCmd.execute(ctx);
                if (sr.success) createdSlabs.push(newSlabId);
            }

            // ── Columns ───────────────────────────────────────────────────────
            for (let ci = 0; ci < srcColumns.length; ci++) {
                const c      = srcColumns[ci];
                const newColId = `col-dup-${this.id}-${li}-${ci}`;

                const colCmd = new CreateColumnCommand({
                    id:               newColId,
                    position:         { x: c.position.x, y: c.position.y + elevDelta, z: c.position.z },
                    height:           c.height,
                    rotation:         c.rotation,
                    profile:          c.profile,
                    width:            c.width,
                    depth:            c.depth,
                    baseOffset:       c.baseOffset ?? 0,
                    levelId:          targetLevelId,
                    materialId:       c.materialId,
                    materialColor:    c.materialColor,
                    steelProfileName: c.steelProfileName,
                });

                const cv = colCmd.canExecute(ctx);
                if (!cv.ok) {
                    console.warn(`[DuplicateFloorPlan] Skipping column ${c.id}: ${cv.reason}`);
                    continue;
                }
                const cr = colCmd.execute(ctx);
                if (cr.success) createdColumns.push(newColId);
            }

            // ── Furniture ─────────────────────────────────────────────────────
            for (let fi = 0; fi < srcFurniture.length; fi++) {
                const f      = srcFurniture[fi];
                const newFurId = `fur-dup-${this.id}-${li}-${fi}`;

                const furCmd = new CreateFurnitureCommand({
                    id:           newFurId,
                    furnitureType: f.furnitureType,
                    position:     { x: f.position.x, y: f.position.y + elevDelta, z: f.position.z },
                    rotation:     f.rotation,
                    levelId:      targetLevelId,
                    baseOffset:   f.baseOffset ?? 0,
                    width:        f.width,
                    length:       f.length,
                    height:       f.height,
                    material:     f.material,
                    color:        f.color,
                });

                const fv = furCmd.canExecute(ctx);
                if (!fv.ok) {
                    console.warn(`[DuplicateFloorPlan] Skipping furniture ${f.id}: ${fv.reason}`);
                    continue;
                }
                const fr = furCmd.execute(ctx);
                if (fr.success) createdFurniture.push(newFurId);
            }
        }

        this._createdWallIds      = createdWalls;
        this._createdSlabIds      = createdSlabs;
        this._createdColumnIds    = createdColumns;
        this._createdFurnitureIds = createdFurniture;
        this.targetIds            = this._all();

        const total   = this.targetIds.length;
        const lvlCount = this.payload.targetLevelIds.length;
        console.log(
            `[DuplicateFloorPlan] Duplicated ${srcWalls.length}W / ` +
            `${srcSlabs.length}Sl / ${srcColumns.length}Co / ${srcFurniture.length}Fu ` +
            `source elements → ${lvlCount} level(s). Created ${total} new elements.`
        );

        return {
            success: true,
            affectedElementIds: this.targetIds,
            info: [
                `Floor plan duplicated to ${lvlCount} level(s): ` +
                `${createdWalls.length} walls, ${createdSlabs.length} slabs, ` +
                `${createdColumns.length} columns, ${createdFurniture.length} furniture items created.`,
            ],
        };
    }

    undo(ctx: CommandContext): CommandResult {
        for (const wallId of this._createdWallIds) {
            if (!ctx.stores.wallStore.getById(wallId)) continue;
            const wall = ctx.stores.wallStore.getById(wallId)!;
            for (const childId of wall.childrenIds ?? []) {
                ctx.bimManager.unregisterElement?.(childId);
                elementRegistry.unregister(childId);
            }
            ctx.bimManager.unregisterElement?.(wallId);
            elementRegistry.unregister(wallId);
            ctx.stores.wallStore.remove(wallId);
        }

        for (const slabId of this._createdSlabIds) {
            if (!ctx.stores.slabStore.getById(slabId)) continue;
            ctx.bimManager.unregisterElement?.(slabId);
            elementRegistry.unregister(slabId);
            ctx.stores.slabStore.remove(slabId);
        }

        for (const colId of this._createdColumnIds) {
            if (!ctx.stores.columnStore.get(colId)) continue;
            ctx.bimManager.unregisterElement?.(colId);
            elementRegistry.unregister(colId);
            ctx.stores.columnStore.remove(colId);
        }

        for (const furId of this._createdFurnitureIds) {
            const furStore = (ctx.stores as any).furnitureStore;
            if (!furStore?.getById?.(furId)) continue;
            elementRegistry.unregister(furId);
            furStore.remove(furId);
        }

        return { success: true, affectedElementIds: this._all() };
    }

    serialize(): SerializedCommand {
        return {
            type:      this.type,
            payload:   this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version:   1,
        };
    }

    private _all(): string[] {
        return [
            ...this._createdWallIds,
            ...this._createdSlabIds,
            ...this._createdColumnIds,
            ...this._createdFurnitureIds,
        ];
    }
}
