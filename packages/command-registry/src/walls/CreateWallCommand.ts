/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 1 (Current)
 * Files Modified:    CreateWallCommand.ts
 * Classification:    A
 *
 * Impact Assessment:
 *   Semantic Impact:     No
 *   Constraint Impact:   No
 *   Graph Impact:        No
 *   Propagation Impact:  No
 *   Topology Impact:     No
 *   World Model Impact:  No
 *   Event Bus Impact:    No
 *   Store Registry Impact: No (WallSystemTypeStore is a Side System)
 *   Undo/Redo Impact:    Yes — structuredClone makes layer snapshot fully deep-isolated
 *   Spatial Impact:      No
 *   Idempotency Impact:  No
 *
 * Risk Level:   Low
 * Rationale:
 *   Fix 1: Replace shallow spread layer clone with structuredClone (§01 §2.2).
 *   Fix 2: Receive wallSystemTypeStore via ctx.stores injection instead of
 *          window global (§01 §1.1 — Side Systems must be injected).
 *   Fix 3 (v8): Removed _resolveAndRebuild() — the subscriber in main.ts already
 *          handles WallJoinResolver.resolveLevel() after every store mutation.
 *          The old method was both a §2.7 violation (direct builder call) and
 *          caused triple rebuilds on every wall creation.
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { WallData, WallCurve, WallLayer, WallBaseline } from '@pryzm/geometry-wall';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { generateMark } from '@pryzm/core-app-model';
import { batchCoordinator } from '@pryzm/core-app-model';

/**
 * §UNDO-AUDIT-2026 §01-§2.3 — Per-neighbour pre-create snapshot used to
 * restore baselines that were re-trimmed by WallJoinResolver after this
 * command's execute(). Captured BEFORE wallStore.add() so it reflects the
 * exact state the user would expect on undo.
 */
interface NeighbourBaselineSnapshot {
    id: string;
    baseLine: WallBaseline;
    _sourceBaseLine: WallBaseline | undefined;
}

export class CreateWallCommand implements Command {
    readonly affectedStores = ["wall", "level"] as const;
    id = crypto.randomUUID();
    type = CommandType.CREATE_WALL;
    timestamp = Date.now();
    targetIds: string[];

    /**
     * §UNDO-AUDIT-2026 §01-§2.3
     * Snapshot of every wall's pre-create baseline geometry. Populated in
     * execute(); consumed in undo() to restore neighbour walls whose
     * baselines were re-trimmed by the asynchronous WallJoinResolver pass
     * triggered by adding the new wall.
     */
    private _neighbourSnapshot: NeighbourBaselineSnapshot[] | null = null;

    /**
     * §WALL-AUDIT-2026-M9 — Stable IFC GUID for the wall, generated ONCE in
     * the constructor and reused across redo. Previously WallStore.add()
     * minted a fresh `crypto.randomUUID()` whenever the wall arrived without
     * `ifcData.guid`, so undo+redo of a CreateWallCommand produced a different
     * GUID each cycle. That broke round-tripping with IFC exports and any
     * external system that keyed off the wall by its IFC GUID.
     *
     * Generating it here makes the GUID property of THIS command — execute()
     * stamps it on the wall, undo() removes the wall, redo() runs execute()
     * again and stamps the SAME guid. The store fallback at WallStore.add()
     * remains as a last-resort safety net for legacy / AI-generated walls
     * that do not carry an `ifcData` block.
     */
    private readonly _ifcGuid: string;

    constructor(
        private wallId: string,
        private wallData: {
            start: { x: number, z: number },
            end: { x: number, z: number },
            height: number,
            thickness: number,
            levelId: string,
            baseOffset?: number,
            materialId?: string,
            materialColor?: string,
            /** Contract §03-1.2: optional curve descriptor. Omit for straight walls. */
            curve?: WallCurve,
            /** Contract §03-1.3: optional wall system type ID. Omit for plain walls. */
            systemTypeId?: string,
        }
    ) {
        this.targetIds = [wallId];
        this._ifcGuid = crypto.randomUUID();
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const level = ctx.bimManager.getLevelById(this.wallData.levelId);
        if (!level) return { ok: false, reason: 'Level not found' };
        if (this.wallData.height <= 0) return { ok: false, reason: 'Invalid height' };
        if (this.wallData.thickness <= 0) return { ok: false, reason: 'Invalid thickness' };

        if (ctx.stores.wallStore.getById(this.wallId)) {
            return { ok: false, reason: 'Wall already exists' };
        }

        // Contract §03-1.2: curved walls do not support openings at creation time.
        if (this.wallData.curve && this.wallData.curve.segments < 4) {
            return { ok: false, reason: 'Curved wall must have at least 4 segments' };
        }

        // Validate systemTypeId if provided
        if (this.wallData.systemTypeId) {
            const typeStore = (ctx.stores as any).wallSystemTypeStore;
            if (typeStore && !typeStore.getById(this.wallData.systemTypeId)) {
                return { ok: false, reason: `Unknown wall system type: ${this.wallData.systemTypeId}` };
            }
        }

        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const bimManager = ctx.bimManager;
        const level = bimManager.getLevelById(this.wallData.levelId);
        if (!level) throw new Error(`SpatialAuthorityError: Level ${this.wallData.levelId} not found`);

        // Contract §03-1.7 — Marks are generated in the Command layer (has access to
        // BimManager for floor index + WallStore for per-level count). The mark is
        // passed into the wall data so WallStore never needs to derive it.
        const mark = generateMark('wall', this.wallData.levelId, {
            getLevels: () => bimManager.getLevels(),
            countElementsOnLevel: (_type, lvlId) =>
                ctx.stores.wallStore.getByLevel(lvlId).length,
        });

        const elevation = level.elevation;
        const baseOffset = this.wallData.baseOffset ?? 0;
        const worldY = elevation + baseOffset;

        // ── Resolve wall system type layers ──────────────────────────────────
        // Contract §01 §2.2: use structuredClone so the stamped snapshot is
        // fully deep-isolated from the type store. Shallow spread is insufficient
        // if WallLayer ever gains nested objects.
        let resolvedLayers: WallLayer[] | undefined;
        let resolvedThickness = this.wallData.thickness;

        if (this.wallData.systemTypeId) {
            const typeStore = (ctx.stores as any).wallSystemTypeStore;
            const sysType = typeStore?.getById(this.wallData.systemTypeId);
            if (sysType) {
                // §01 §2.2 — structuredClone for correct deep snapshot
                resolvedLayers = structuredClone(sysType.layers) as WallLayer[];
                resolvedThickness = sysType.totalThickness;
            }
        }

        const newWall: WallData = {
            id: this.wallId,
            type: 'wall',
            levelId: this.wallData.levelId,

            // Phase B DTO migration: baseLine is [Point3D, Point3D] — plain {x,y,z} objects.
            baseLine: [
                { x: this.wallData.start.x, y: worldY, z: this.wallData.start.z },
                { x: this.wallData.end.x,   y: worldY, z: this.wallData.end.z   },
            ],

            // Contract §03-1.2: stamp curve at worldY
            curve: this.wallData.curve
                ? {
                    control: {
                        x: this.wallData.curve.control.x,
                        y: worldY,
                        z: this.wallData.curve.control.z
                    },
                    segments: this.wallData.curve.segments
                }
                : undefined,

            height: this.wallData.height,
            thickness: resolvedThickness,
            baseOffset: baseOffset,

            openings: [],
            childrenIds: [],

            materialId: this.wallData.materialId,
            materialColor: this.wallData.materialColor,

            // Contract §03-1.3: frozen layer snapshot stamped at execution time.
            // These are intrinsic geometric data, not a graph relationship.
            systemTypeId: this.wallData.systemTypeId,
            layers: resolvedLayers
                ? Object.freeze(resolvedLayers.map(l => Object.freeze({ ...l }))) as WallLayer[]
                : undefined,

            // Contract §03-1.7: mark is generated by Command (not Store).
            properties: { mark },

            // §WALL-AUDIT-2026-M9: stamp the stable IFC GUID generated in this
            // command's constructor so undo+redo always sees the SAME guid. The
            // WallStore.add() fallback only fires for legacy/AI-bypass walls
            // that arrive without an ifcData block.
            ifcData: {
                guid: this._ifcGuid,
                ifcClass: 'IfcWall',
            },

            // §VIEW-DIRTY-CHECK §2.2: stamp initial render version = 1 so the
            // builder's dirty check can distinguish this wall from an un-versioned
            // legacy wall and correctly skip rebuild after view switches.
            _renderVersion: 1,
        };

        // §UNDO-AUDIT-2026 §01-§2.3 — Capture every existing wall's baseline
        // and source-baseline BEFORE wallStore.add() triggers the resolver.
        // The asynchronous WallJoinResolver pass (EngineBootstrap subscriber)
        // re-trims neighbouring walls' baseLines to a new consensus point when
        // this new wall joins their cluster.  Without this snapshot, undo()
        // can only remove the new wall — neighbour trims survive, leaving
        // walls visually "stuck" at the post-join geometry.  Restoring this
        // snapshot in undo() reverts those side-effects deterministically.
        //
        // Scoped to the same level as the new wall — joins are level-local
        // (resolver is invoked per-level), so cross-level walls cannot be
        // affected by this command and don't need to be snapshotted.
        this._neighbourSnapshot = ctx.stores.wallStore.getAll()
            .filter(w => w.levelId === this.wallData.levelId)
            .map(w => ({
                id: w.id,
                baseLine: [
                    { x: w.baseLine[0].x, y: w.baseLine[0].y, z: w.baseLine[0].z },
                    { x: w.baseLine[1].x, y: w.baseLine[1].y, z: w.baseLine[1].z },
                ] as WallBaseline,
                _sourceBaseLine: w._sourceBaseLine
                    ? [
                        { x: w._sourceBaseLine[0].x, y: w._sourceBaseLine[0].y, z: w._sourceBaseLine[0].z },
                        { x: w._sourceBaseLine[1].x, y: w._sourceBaseLine[1].y, z: w._sourceBaseLine[1].z },
                    ] as WallBaseline
                    : undefined,
            }));

        // 1️⃣ Store first — triggers Store Event Bus → subscriber in main.ts
        //    handles WallJoinResolver + geometry rebuild (§2.7 compliant).
        ctx.stores.wallStore.add(newWall);

        // 2️⃣ Spatial registration AFTER successful store mutation (§5 ordering).
        // §A40-W01: Skip per-wall registerElement() when inside a batch envelope;
        // the parent CreateWallsOnAllSlabsCommand calls bimManager.registerMany()
        // once per level group via batchCoordinator.trackRegistration() — O(L+N)
        // instead of O(L×N²/2) for N sequential registerElement() calls.
        // Non-batch paths (single CreateWallCommand) still register synchronously.
        if (!batchCoordinator.isBatching) {
            bimManager.registerElement(this.wallId, this.wallData.levelId);
        }

        // 3️⃣ §3.5 FIX: Type registration moved here from WallStore.add().
        //    Store must not register spatial/type elements (Contract §3.5).
        //    elementRegistry.registerSemantic throws if the ID already exists,
        //    which acts as a redo-safety guard (undo calls unregister, so redo is clean).
        elementRegistry.registerSemantic(this.wallId, 'wall');

        // ✅ §2.7 FIX (v8): Removed _resolveAndRebuild() — the subscriber in main.ts
        // already runs WallJoinResolver.resolveLevel() and calls builder.buildWall()
        // for every wall on the level on each store mutation. Calling it here too
        // caused triple rebuilds and was a direct §2.7 builder-call violation.

        return {
            success: true,
            affectedElementIds: [this.wallId]
        };
    }

    undo(ctx: CommandContext): CommandResult {
        const existing = ctx.stores.wallStore.getById(this.wallId);
        if (!existing) {
            return { success: true, affectedElementIds: [] };
        }

        // ✅ FIX: Unregister hosted child elements (openings/doors) before removing the
        // wall. Without this, their spatial registrations in bimManager and their semantic
        // entries in elementRegistry are leaked on every undo, accumulating indefinitely
        // across undo/redo cycles.  WallStore.remove() clears the in-store maps but
        // does not touch bimManager or elementRegistry (§3.5 contract — Store must not
        // call spatial-registration APIs).
        const childrenIds = existing.childrenIds ?? [];
        for (const childId of childrenIds) {
            ctx.bimManager.unregisterElement(childId);
            elementRegistry.unregister(childId);
        }

        ctx.bimManager.unregisterElement(this.wallId);
        // §3.5 FIX: Unregister from elementRegistry before store removal.
        // Mirrors the registration done in execute(). Safe to call even if the
        // entry is absent (unregister is a no-op for unknown IDs).
        elementRegistry.unregister(this.wallId);
        ctx.stores.wallStore.remove(this.wallId);

        // §UNDO-AUDIT-2026 §01-§2.3 — Restore neighbour baselines that were
        // re-trimmed by WallJoinResolver during execute().  Each wallStore.update
        // here re-emits a store 'update' event, which the EngineBootstrap
        // subscriber batches into one resolver pass per animation frame.  By
        // putting the source baselines back to their pre-create values, that
        // resolver pass derives the same join state that existed before the
        // new wall was added — fully deterministic reversal per §2.3.
        if (this._neighbourSnapshot) {
            for (const snap of this._neighbourSnapshot) {
                if (snap.id === this.wallId) continue; // the now-removed wall
                const current = ctx.stores.wallStore.getById(snap.id);
                if (!current) continue;
                ctx.stores.wallStore.update(snap.id, {
                    baseLine: [
                        { x: snap.baseLine[0].x, y: snap.baseLine[0].y, z: snap.baseLine[0].z },
                        { x: snap.baseLine[1].x, y: snap.baseLine[1].y, z: snap.baseLine[1].z },
                    ],
                    // _sourceBaseLine MUST be passed in the same update() — the
                    // WallStore.update() hook (line ~365) clears _sourceBaseLine
                    // whenever baseLine is set without it.  Passing undefined
                    // here would erase the resolver's idempotency anchor.
                    ...(snap._sourceBaseLine ? { _sourceBaseLine: [
                        { x: snap._sourceBaseLine[0].x, y: snap._sourceBaseLine[0].y, z: snap._sourceBaseLine[0].z },
                        { x: snap._sourceBaseLine[1].x, y: snap._sourceBaseLine[1].y, z: snap._sourceBaseLine[1].z },
                    ] } : {}),
                } as any);
            }
        }

        // Rebuild for remaining walls triggered automatically via store 'remove' event
        // → subscriber in main.ts re-runs WallJoinResolver and rebuilds affected walls.

        return {
            success: true,
            affectedElementIds: [this.wallId]
        };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: {
                wallId: this.wallId,
                ...this.wallData
            }
        };
    }
}
