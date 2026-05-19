/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 1 (Current)
 * Files Modified:    CreateCurtainWallsFromSlabCommand.ts
 *
 * Critical Fixes (from CURTAIN-WALL-CONTRACT-AUDIT.md + §2026-03-14 audit):
 *   #2  Removed direct curtainWallBuilder.build() call
 *   #4  IDs drawn from constructor-level idPool — NOT generated inside execute() (§2.6)
 *       On redo, createdIds (populated on first execute) are reused — pool remains intact
 *   #5  Throws SpatialAuthorityError if level not found — no silent Y=0 fallback
 *   #7  createdIds preserved across undo for redo idempotency
 *   #8  baseLine stored at level-plane (Y=0); baseOffset is relative, not absolute elevation
 *   #12 idPool pre-generated in constructor so execute() never calls crypto.randomUUID() (§2.6)
 *
 * Performance Fixes (§37-BATCH-CW-PERF-SPRINT.md):
 *   §REG-MANY-P3  Replaces per-wall bimManager.registerElement() calls with a single
 *                 post-loop bimManager.registerMany(registrationIds, levelId) call.
 *                 For a rectangular slab (4 edges): 4 individual O(L × n) calls → 1 O(L + 4) call.
 *
 * Contract References:
 *   §02 §1.2   Builder resolves worldY = elevation + baseOffset from BimManager
 *   §2.4       bimManager.registerElement + elementRegistry per created wall
 *   §2.7       No direct builder call; store.add() → storeEventBus → subscriber → builder
 *   §Critical  Throw on missing level — forbidden to silently fallback to Y=0
 *
 * Impact Assessment:
 *   Other Commands:  None
 *   Builder Impact:  None — builder driven by storeEventBus subscriber
 *
 * Risk Level: Low
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import * as THREE from '@pryzm/renderer-three/three';
import { CurtainWallData } from '@pryzm/geometry-curtain-wall';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { batchCoordinator } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface CreateCurtainWallsFromSlabPayload {
    slabId: string;
    height?: number;
    gridXSpacing?: number;
    gridYSpacing?: number;
}

export class CreateCurtainWallsFromSlabCommand implements Command {
    // §CURTAIN-WALL-AUDIT-2026 §13 — slab + level are read dependencies (the slab
    // edges and level elevation are sampled to seed each wall) but are never
    // mutated. Only the curtainWall store is mutated.
    readonly affectedStores = ["curtainWall"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.CREATE_CURTAIN_WALLS_FROM_SLAB;
    readonly timestamp = Date.now();
    targetIds: string[] = [];

    /**
     * §2.6: IDs pre-generated at construction time, not inside execute().
     * Pool size of 50 covers any realistic slab perimeter edge count.
     * execute() draws from this pool in order; redo reuses createdIds instead.
     */
    private readonly idPool: ReadonlyArray<string> = Array.from({ length: 50 }, () => crypto.randomUUID());

    /**
     * §Critical #4/#7: IDs actually consumed from idPool on first execute().
     * NOT cleared on undo — required so redo can use the same IDs for symmetry.
     */
    private createdIds: string[] = [];

    constructor(private payload: CreateCurtainWallsFromSlabPayload) {}

    canExecute(context: CommandContext): CommandValidationResult {
        const slabStore = context.stores.slabStore;
        if (!slabStore) return { ok: false, reason: 'Slab store not available' };

        const slab = slabStore.getById(this.payload.slabId);
        if (!slab) return { ok: false, reason: `Slab '${this.payload.slabId}' not found` };

        if (!slab.polygon || slab.polygon.length < 3) {
            return { ok: false, reason: 'Slab must have a valid polygon perimeter (≥ 3 points)' };
        }

        if (!slab.levelId) {
            return { ok: false, reason: 'Slab is missing a levelId' };
        }

        const level = context.bimManager.getLevelById(slab.levelId);
        if (!level) {
            return { ok: false, reason: `Level '${slab.levelId}' not found in BimManager` };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slabStore = context.stores.slabStore;
        const curtainWallStore = context.stores.curtainWallStore;

        if (!slabStore || !curtainWallStore) {
            return { success: false, affectedElementIds: [], info: ['Stores not available'] };
        }

        const slab = slabStore.getById(this.payload.slabId);
        if (!slab || !slab.polygon) return { success: false, affectedElementIds: [] };

        const levelId = slab.levelId;

        // §Critical #5: Throw on missing level — no silent fallback to Y=0
        const level = context.bimManager.getLevelById(levelId);
        if (!level) {
            throw new Error(`SpatialAuthorityError: Level '${levelId}' not found in BimManager`);
        }
        const elevation = level.elevation;

        const height = this.payload.height ?? 3.0;
        const polygon = slab.polygon;
        const slabPos = slab.position;

        // Ensure CCW winding order for consistent wall facing direction
        const points = (polygon as any[]).map((p: any) => new THREE.Vector2(p.x, p.y));
        const area = points.reduce((acc: number, p: any, i: number) => {
            const next = points[(i + 1) % points.length];
            return acc + (next.x - p.x) * (next.y + p.y);
        }, 0);
        const orderedPoints = area > 0 ? [...points].reverse() : points;

        // §Critical #4: On redo, reuse the same IDs saved from the first execute().
        const isRedo = this.createdIds.length > 0;
        const newIds: string[] = [];
        // §REG-MANY-P3: Collect IDs of walls that are actually new (not skipped by has() guard)
        // so registerMany() is called once after the loop instead of once per wall.
        const registrationIds: string[] = [];

        // E.5.x §P2e-CW-slab: collect specs for curtain-wall.batch.create bus dispatch.
        // Mirrors CreateCurtainWallsOnAllSlabsCommand P2e pattern exactly.
        const busCwSpecs: Array<{
            id: string;
            levelId: string;
            baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
            height: number;
            bayWidth: number;
            bayHeight: number;
            mullionThickness: number;
        }> = [];

        for (let i = 0; i < orderedPoints.length; i++) {
            const start2D = orderedPoints[i];
            const end2D = orderedPoints[(i + 1) % orderedPoints.length];

            // §Critical #8: baseLine at level-plane (Y = 0); builder resolves worldY via BimManager
            // P0.3 DTO Migration: plain Point3D objects — no THREE.Vector3 in store data.
            const start = { x: start2D.x + slabPos.x, y: 0, z: start2D.y + slabPos.z };
            const end   = { x: end2D.x   + slabPos.x, y: 0, z: end2D.y   + slabPos.z };

            const dx = end.x - start.x, dz = end.z - start.z;
            if (Math.sqrt(dx * dx + dz * dz) < 0.001) continue;

            // §2.6: Draw from constructor-level pool, never generate inside execute()
            const cwId = isRedo ? this.createdIds[newIds.length] : this.idPool[newIds.length];

            // Collect bus spec for every valid segment (including redo — handler is idempotent).
            busCwSpecs.push({
                id: cwId,
                levelId,
                baseLine: [start, end],
                height,
                bayWidth:         this.payload.gridXSpacing ?? 1.2,
                bayHeight:        this.payload.gridYSpacing ?? 1.5,
                mullionThickness: 0.05,
            });

            // Skip already-existing walls on redo (idempotency guard)
            if (curtainWallStore.has?.(cwId)) {
                newIds.push(cwId);
                continue;
            }

            const cwData: CurtainWallData = {
                id: cwId,
                type: 'curtain-wall',
                levelId,
                baseLine: [start, end],
                height,
                // §Critical #8: baseOffset is relative to level elevation, not absolute
                baseOffset: 0.0,
                gridXSpacing: this.payload.gridXSpacing ?? 1.2,
                gridYSpacing: this.payload.gridYSpacing ?? 1.5,
                mullionSize: 0.08,
                panelThickness: 0.02,
                mullionColor: '#333333',
                properties: {
                    // §02 §1.2: Do NOT store absolute elevation — builder resolves it live from BimManager
                    mark: `CW-${cwId.slice(0, 6).toUpperCase()}`
                },
                // §2.4 redo symmetry: use cwId as IFC GUID for deterministic stability across redo
                ifcData: { guid: cwId, ifcClass: 'IfcCurtainWall' }
            };

            // §2.7: store.add() → storeEventBus → subscriber in main.ts → builder.build()
            curtainWallStore.add(cwData);

            // §REG-MANY-P3: Accumulate for post-loop batch registration instead of
            // calling bimManager.registerElement() per wall.  registerMany() fires once
            // below — O(L + N) vs O(N × L × n_avg) for sequential registerElement() calls.
            registrationIds.push(cwId);

            newIds.push(cwId);
        }

        // §REG-MANY-P3: Register all newly-created walls in one batch call.
        // §2.4: Spatial registration after successful store mutations (invariant preserved —
        // all store.add() calls above ran before this point).
        if (registrationIds.length > 0) {
            context.bimManager.registerMany(registrationIds, levelId);
            for (const id of registrationIds) {
                if (!elementRegistry.getStoreType(id)) {
                    try {
                        elementRegistry.registerSemantic(id, 'curtainwall');
                    } catch {
                        // Already registered via builder's first-build guard
                    }
                }
            }
        }

        // §Critical #4/#7: Save createdIds — NOT cleared on undo
        if (!isRedo) {
            this.createdIds = newIds;
        }
        this.targetIds = [...this.createdIds];

        // E.5.x §P2e-CW-slab: fire-and-forget bus dispatch for event-sourcing in the plugin store.
        // The legacy curtainWallStore.add() path above is still the authoritative geometry trigger;
        // the bus handler writes the same data to the plugin CurtainWallsState as a parallel record.
        // Mirrors CreateCurtainWallsOnAllSlabsCommand P2e exactly.
        try {
            const runtimeBus = window.runtime?.bus;
            if (runtimeBus?.registry?.has?.('curtain-wall.batch.create') && busCwSpecs.length > 0) {
                runtimeBus.executeCommand('curtain-wall.batch.create', {
                    curtainWalls: busCwSpecs,
                    height,
                }).catch((busErr: unknown) => {
                    console.warn(
                        '[CreateCurtainWallsFromSlabCommand] E.5.x P2e curtain-wall.batch.create bus dispatch failed ' +
                        '(non-fatal — legacy curtainWallStore is authoritative):',
                        busErr,
                    );
                });
                console.log(
                    `[CreateCurtainWallsFromSlabCommand] E.5.x §P2e-CW-slab: curtain-wall.batch.create dispatched — ` +
                    `${busCwSpecs.length} CW(s) committed to plugin store`
                );
            }
        } catch (busErr) {
            console.warn('[CreateCurtainWallsFromSlabCommand] E.5.x bus dispatch failed (non-fatal):', busErr);
        }

        return {
            success: true,
            affectedElementIds: [...this.createdIds],
            info: [`Created ${newIds.length} curtain walls from slab perimeter at elevation ${elevation.toFixed(2)}m`]
        };
    }

    undo(context: CommandContext): CommandResult {
        const curtainWallStore = context.stores.curtainWallStore;
        if (!curtainWallStore) return { success: false, affectedElementIds: [] };

        for (const id of this.createdIds) {
            // §2.4: Unregister before store deletion (reverse of execute ordering)
            context.bimManager.unregisterElement(id);
            elementRegistry.unregister(id);
            // store.remove() → storeEventBus → subscriber → builder.remove()
            curtainWallStore.remove(id);
        }

        // §CURTAIN-WALL-AUDIT-2026 §6.5 — coalesce one removal event for the
        // whole batch; listeners (SelectionManager / FrustumCullingService /
        // UnifiedBrowserPanel) only need to refresh once.
        if (!batchCoordinator.isBatching) {
            _bus.emit('bim-curtainwall-removed', { ids: [...this.createdIds] }); // F.events.17
        } else {
            batchCoordinator.trackPostBatchWindowEvent('bim-curtainwall-removed');
        }

        // E.5.x §P2e-CW-slab-undo: mirror the execute() bus dual-write with a batch.delete
        // so the plugin CurtainWallsState is kept in sync with the legacy store removal.
        // Fire-and-forget — legacy store is authoritative; plugin store failure is non-fatal.
        const runtimeBus = window.runtime?.bus;
        if (runtimeBus?.registry?.has?.('curtain-wall.batch.delete') && this.createdIds.length > 0) {
            runtimeBus.executeCommand('curtain-wall.batch.delete', { ids: [...this.createdIds] })
                .catch((busErr: unknown) => {
                    console.warn(
                        '[CreateCurtainWallsFromSlabCommand] E.5.x P2e curtain-wall.batch.delete bus dispatch failed ' +
                        '(non-fatal — legacy store removal succeeded):',
                        busErr,
                    );
                });
        }

        // §Critical #4/#7: Do NOT clear this.createdIds — redo must reuse them
        return { success: true, affectedElementIds: [...this.createdIds] };
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
