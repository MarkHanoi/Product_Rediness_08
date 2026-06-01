import * as THREE from '@pryzm/renderer-three/three';
import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { CreateWallCommand } from './CreateWallCommand';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

export interface CreateWallsFromSlabPayload {
    slabId: string;
    wallHeight?: number;
    wallThickness?: number;
}

export class CreateWallsFromSlabCommand implements Command {
    readonly affectedStores = ["wall", "level"] as const;
    readonly id: string;
    readonly type = CommandType.CREATE_WALLS_FROM_SLAB;
    readonly timestamp: number;
    targetIds: string[] = [];
    private createdWallIds: string[] = [];

    constructor(private payload: CreateWallsFromSlabPayload) {
        this.id = `cmd-walls-from-slab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        this.timestamp = Date.now();
    }

    canExecute(context: CommandContext): CommandValidationResult {
        const slabStore = context.stores.slabStore;
        if (!slabStore) return { ok: false, reason: "Slab store not available" };
        const slab = slabStore.getById(this.payload.slabId);
        if (!slab) return { ok: false, reason: "Slab not found" };
        // We allow selection if either type or elementType matches 'slab'
        if (slab.type !== 'slab' && (slab as any).elementType !== 'slab') {
             return { ok: false, reason: "Selected element is not a slab" };
        }
        if (!slab.levelId) return { ok: false, reason: "Slab is missing levelId" };
        if (!slab.polygon || slab.polygon.length < 3) {
            return { ok: false, reason: "Slab must have a valid polygon perimeter" };
        }
        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slabStore = context.stores.slabStore;
        if (!slabStore) return { success: false, affectedElementIds: [] };
        const slab = slabStore.getById(this.payload.slabId);
        if (!slab || !slab.polygon) return { success: false, affectedElementIds: [] };

        // §2.6 Redo idempotency guard: if we already have a known set of wall IDs from
        // a previous execute() call (e.g. this is a redo after undo), skip any that still
        // exist in the store.  createdWallIds is intentionally NOT cleared by undo() so
        // this guard is reliable across multiple undo/redo cycles.
        if (this.createdWallIds.length > 0) {
            const stillPresent = this.createdWallIds.filter(id => context.stores.wallStore.getById(id));
            if (stillPresent.length === this.createdWallIds.length) {
                // All walls already exist — this is a double-execute, return early.
                return { success: true, affectedElementIds: [...this.createdWallIds] };
            }
        }

        const wallHeight = this.payload.wallHeight ?? 3.0;
        const wallThickness = this.payload.wallThickness ?? 0.2;
        const levelId = slab.levelId;
        if (!levelId) {
            return { success: false, affectedElementIds: [], info: ["Execution failed: Slab missing levelId"] };
        }

        // ✅ FIX C3: Use context.bimManager exclusively (Contract §1.1 — Single Spatial Authority).
        // The old code fell back to window.bimManager which silently defaulted
        // elevation to 0 whenever context.bimManager was null, placing walls at the wrong level.
        const bimManager = context.bimManager;
        if (!bimManager) {
            return { success: false, affectedElementIds: [], info: ["BimManager not available in context"] };
        }
        const level = bimManager.getLevelById(levelId);
        if (!level) {
            return { success: false, affectedElementIds: [], info: [`Level ${levelId} not found`] };
        }
        const elevation = level.elevation;

        const polygon = slab.polygon;
        const wallIds: string[] = [];
        const slabPos = slab.position;

        // Ensure we follow a consistent winding order for walls
        const points = polygon.map((p: { x: number; y: number }) => new THREE.Vector2(p.x, p.y));
        const area = points.reduce((acc: number, p: THREE.Vector2, i: number) => {
            const next = points[(i + 1) % points.length];
            return acc + (next.x - p.x) * (next.y + p.y);
        }, 0);

        const isCW = area > 0;
        const orderedPoints = isCW ? [...points].reverse() : points;

        for (let i = 0; i < orderedPoints.length; i++) {
            const startPoint = orderedPoints[i];
            const endPoint = orderedPoints[(i + 1) % orderedPoints.length];

            // ✅ FIX C2: Wall IDs are deterministic and pre-composed from the parent command ID
            // so undo always targets the exact same IDs on every redo (Contract §2.6).
            const wallId = `wall-slab-${this.id}-${i}`;

            const wallCommand = new CreateWallCommand(
                wallId,
                {
                    start: { x: startPoint.x + slabPos.x, z: startPoint.y + slabPos.z },
                    end: { x: endPoint.x + slabPos.x, z: endPoint.y + slabPos.z },
                    height: wallHeight,
                    thickness: wallThickness,
                    levelId: levelId
                }
            );

            // Explicitly validate before executing sub-command (Contract §2.8)
            const validation = wallCommand.canExecute(context);
            if (!validation.ok) {
                console.warn(`[CreateWallsFromSlab] Skipping wall ${i}: ${validation.reason}`);
                continue;
            }

            console.log(`[CreateWallsFromSlab] Executing CreateWallCommand for level ${levelId} at elevation ${elevation}`);
            const result = wallCommand.execute(context);
            if (result.success && result.affectedElementIds.length > 0) {
                wallIds.push(result.affectedElementIds[0]);
            }
        }

        this.createdWallIds = wallIds;
        this.targetIds = wallIds;

        // E.5.x §P2e-wall-slab: fire-and-forget bus dispatch for event-sourcing in the plugin store.
        // The legacy wallStore.add() path (via nested CreateWallCommand) is still the authoritative
        // geometry trigger; the bus handler writes the same data to the plugin WallsState as a
        // parallel record — one undo-stack entry for the entire batch (§2 P6 of 01-VISION.md).
        // Mirrors CreateWallsOnAllSlabsCommand P2e-walls exactly.
        // Anchor: docs/archive/pryzm3-internal/04-PLAN-FORWARD/23-L2-COMMAND-EVENT-BUS-IMPLEMENTATION-PLAN.md §P2e-wall-slab
        try {
            const runtimeBus = window.runtime?.bus;
            if (runtimeBus?.registry?.has?.('wall.batch.create') && wallIds.length > 0) {
                const wallSpecs = wallIds
                    .map((id: string) => context.stores.wallStore.getById(id))
                    .filter(Boolean)
                    .map((wall: any) => ({
                        id:           wall.id,
                        start:        { x: wall.baseLine[0].x, z: wall.baseLine[0].z },
                        end:          { x: wall.baseLine[1].x, z: wall.baseLine[1].z },
                        levelId:      wall.levelId,
                        height:       wall.height,
                        thickness:    wall.thickness,
                        baseOffset:   wall.baseOffset,
                        materialColor: wall.materialColor,
                        materialId:   wall.materialId,
                        systemTypeId: wall.systemTypeId,
                    }));
                if (wallSpecs.length > 0) {
                    runtimeBus.executeCommand('wall.batch.create', { walls: wallSpecs });
                    console.log(
                        `[CreateWallsFromSlabCommand] E.5.x §P2e-wall-slab: wall.batch.create dispatched — ` +
                        `${wallSpecs.length} wall(s) committed to plugin store`
                    );
                }
            }
        } catch (busErr) {
            console.warn('[CreateWallsFromSlabCommand] E.5.x bus dispatch failed (non-fatal):', busErr);
        }

        return {
            success: true,
            affectedElementIds: wallIds,
            info: [`Created ${wallIds.length} walls from slab perimeter`]
        };
    }

    undo(context: CommandContext): CommandResult {
        // §2.6 FIX: createdWallIds is intentionally kept populated here.
        // Clearing it would lose the stable ID set that the redo path (execute()) relies
        // on for its idempotency guard.  The deterministic IDs (wall-slab-<cmdId>-<i>)
        // mean redo would recompute the same values anyway, but keeping the list
        // explicit makes the invariant clear and safe across multiple undo/redo cycles.
        //
        // §3.5 / §18.4: elementRegistry.unregister() is called so that redo (which
        // re-executes CreateWallCommand.execute()) can call
        // elementRegistry.registerSemantic() without hitting a duplicate-ID crash.
        for (const wallId of this.createdWallIds) {
            context.stores.wallStore.remove(wallId);
            if (context.bimManager?.unregisterElement) {
                context.bimManager.unregisterElement(wallId);
            }
            elementRegistry.unregister(wallId);
        }
        return {
            success: true,
            affectedElementIds: [...this.createdWallIds]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            payload: this.payload as any,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1
        };
    }
}