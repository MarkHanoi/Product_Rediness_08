import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { serializeWallSnapshot, deserializeWallSnapshot } from './wallSnapshotUtils';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';
import type { StairData } from '@pryzm/geometry-stair';
import type { StairRailingConfig } from '@pryzm/geometry-stair';
import type { StairLandingEntity } from '@pryzm/geometry-stair';
import type { FurnitureData } from '@pryzm/geometry-furniture';
import type { WallBaseline } from '@pryzm/geometry-wall';
import { semanticGraphManager } from '@pryzm/core-app-model';
// C2 §SLAB-SYSTEM-AUDIT-2026: Slab branch is now delegated to the dedicated command.
import { DeleteSlabCommand } from '../slabs/DeleteSlabCommand';
import { DeleteColumnCommand } from '../columns/DeleteColumnCommand';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

/**
 * §UNDO-AUDIT-2026 §01-§2.3 — Per-neighbour pre-delete baseline snapshot.
 * When a wall is deleted, WallJoinResolver re-runs and may UN-trim the
 * remaining cluster walls (since the deleted wall no longer pulls them
 * toward a consensus point).  On undo we re-add the wall, but the
 * resolver's next pass alone cannot guarantee the EXACT pre-delete trim
 * geometry — multi-cluster centroids are non-monotonic in cluster size.
 * Restoring this snapshot returns neighbour baselines to their pre-delete
 * values; the next resolver pass then produces the same join state.
 */
interface NeighbourBaselineSnapshot {
    id: string;
    baseLine: WallBaseline;
    _sourceBaseLine: WallBaseline | undefined;
}

export class DeleteElementCommand implements Command {
    readonly affectedStores = ["wall", "slab", "column", "curtainWall", "furniture", "handrail", "roof", "floor", "ceiling", "beam", "plumbing", "stair", "level"] as const;
    id = crypto.randomUUID();
    type = CommandType.DELETE_ELEMENT;
    timestamp = Date.now();
    targetIds: string[];

    private deletedData?: any;
    private elementType?: string;
    // Stair-specific captured state (sub-elements live in separate stores)
    private _stairRailingSnapshots: StairRailingConfig[] = [];
    private _stairLandingSnapshots: StairLandingEntity[] = [];
    // Furniture-specific captured state (associated children e.g. dining chairs)
    private _furnitureChildren: FurnitureData[] = [];
    // §UNDO-AUDIT-2026 §01-§2.3 — wall-branch only; populated by execute() when
    // the deleted element is a wall, consumed by undo() to restore neighbour
    // baselines whose trims were recomputed by the resolver after removal.
    private _neighbourSnapshot: NeighbourBaselineSnapshot[] | null = null;
    // C2 §SLAB-SYSTEM-AUDIT-2026: delegate for the slab branch (holds all captured
    // state so that undo() can restore the slab + openings + registry entries).
    private _slabDelegate: DeleteSlabCommand | null = null;
    /**
     * §COLUMN-AUDIT-2026 §C2 — DeleteElementCommand delegates the column
     * branch to DeleteColumnCommand so that bimManager.unregisterElement,
     * elementRegistry.unregister AND SemanticGraph cleanup all happen
     * together, AND undo restores them as a single unit.
     *
     * Before this fix, DeleteElementCommand did `columnStore.remove(id)` only
     * — leaking the bimManager registration, elementRegistry root, AND the
     * SemanticGraph "sitsOn" relationship. Undo just re-added the column to
     * the store, leaving all three side effects in their (incorrect) state.
     */
    private _columnDelegate: DeleteColumnCommand | null = null;

    constructor(private elementId: string) {
        this.targetIds = [elementId];
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const id = this.elementId;
        const stores = ctx.stores;

        if (stores.wallStore.getById(id) || 
            stores.wallStore.getWindow(id) || 
            stores.wallStore.getDoor(id)) return { ok: true };

        // §WALL-AUDIT-2026-W2: All polymorphic store lookups go through ctx.stores —
        // window-global fallbacks removed. CommandContext now lists slabStore,
        // columnStore, curtainWallStore, stairStore, furnitureStore, openingStore
        // as non-optional fields, so reaching into the global namespace is both
        // unnecessary and a §1.1 / §3.5 violation.
        if (stores.slabStore?.getById?.(id)) return { ok: true };
        if (stores.columnStore?.get?.(id)) return { ok: true };
        if (stores.curtainWallStore?.get?.(id)) return { ok: true };
        if (stores.stairStore?.getById?.(id)) return { ok: true };
        if ((stores as any).furnitureStore?.get?.(id)) return { ok: true };
        // §ROOF-DELETE-FIX: include all element types that execute() handles
        // so the command isn't rejected before reaching the per-type branches.
        if ((stores as any).handrailStore?.getById?.(id)) return { ok: true };
        if ((stores as any).roofStore?.getById?.(id)) return { ok: true };
        if ((stores as any).floorStore?.getById?.(id)) return { ok: true };
        if ((stores as any).ceilingStore?.getById?.(id)) return { ok: true };
        if ((stores as any).beamStore?.get?.(id) ?? (stores as any).beamStore?.getById?.(id)) return { ok: true };
        if ((stores as any).plumbingStore?.get?.(id) ?? (stores as any).plumbingStore?.getById?.(id)) return { ok: true };

        return { ok: false, reason: `Element ${id} not found in any store` };
    }

    execute(ctx: CommandContext): CommandResult {
        const id = this.elementId;
        const wallStore = ctx.stores.wallStore;

        // 1. Walls
        const wall = wallStore.getById(id);
        if (wall) {
            // §2.2 FIX: Full semantic snapshot using serializer (handles Vector3 baseLine).
            this.deletedData = serializeWallSnapshot(wall);
            this.elementType = 'wall';

            // §UNDO-AUDIT-2026 §01-§2.3 — Capture every other wall on the same
            // level BEFORE the delete fires the resolver re-trim pass.  Removing
            // a cluster member changes the consensus point for the remaining
            // walls; on undo we restore these baselines so the next resolver
            // pass produces the exact pre-delete join geometry.
            this._neighbourSnapshot = wallStore.getAll()
                .filter(w => w.id !== id && w.levelId === wall.levelId)
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

            // §3.5 FIX + §G FIX: Unregister children from both elementRegistry AND
            // BimManager before wallStore.remove() clears the childrenIds.
            // Children (windows/doors) are registered in BimManager via
            // CreateWallOpeningCommand.execute(); the delete must mirror that.
            // WallStore.remove() cascades to removeOpening() which no longer touches
            // either registry (Contract §3.5 — Store is data-only).
            // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
            const childrenIds: string[] = wall.childrenIds ?? [];
            childrenIds.forEach(childId => {
                elementRegistry.unregister(childId);
                if (bimMgr?.unregisterElement) {
                    try { bimMgr.unregisterElement(childId); } catch (_) {}
                }
                // §CASCADE-DELETE: Mirror CreateWallOpeningCommand's dual-store write.
                // WallStore.remove() only cleans the internal maps (wallStore.doors /
                // wallStore.windows). The external DoorStore / WindowStore singletons
                // are not reached by that path — their builders (DoorBuilder, WindowBuilder)
                // never receive a 'remove' event, so hosted 3D meshes survive wall deletion.
                // Both remove() methods are idempotent — safe to call for every child id.
                doorStore.remove(childId);
                windowStore.remove(childId);
            });

            wallStore.remove(id);

            // Unregister wall from BimManager spatial hierarchy.
            if (bimMgr?.unregisterElement) bimMgr.unregisterElement(id);

            // §3.5 FIX: Unregister wall from elementRegistry (moved from WallStore.remove()).
            elementRegistry.unregister(id);

            // §2.7 FIX: Removed direct builder.removeWall(id) call.
            // wallStore.remove() emits 'remove' → subscriber in main.ts calls
            // builder.removeWall() exactly once. The previous direct call here
            // caused a double removal on every delete operation.

            return { success: true, affectedElementIds: [id] };
        }

        // 2. Windows
        const windowElement = wallStore.getWindow(id);
        if (windowElement) {
            this.deletedData = { ...windowElement };
            this.elementType = 'window';

            const wallId = windowElement.wallId;
            const wall = wallStore.getById(wallId);
            if (wall && wall.openings) {
                const opening = wall.openings.find((op: any) => op.elementId === id);
                if (opening) {
                    this.deletedData.openingDescriptor = { ...opening };
                }
            }

            wallStore.removeWindow(id);
            // §3.5 FIX: Unregister from elementRegistry (moved from WallStore.removeOpening()).
            elementRegistry.unregister(id);
            // wallStore.removeWindow() → removeOpening() → emit('update') fires the Store Event Bus
            // → subscriber in main.ts → wallFragmentBuilder.updateWall(). No direct builder call needed.

            return { success: true, affectedElementIds: [id] };
        }

        // 3. Doors
        const doorElement = wallStore.getDoor(id);
        if (doorElement) {
            this.deletedData = { ...doorElement };
            this.elementType = 'door';

            const wallId = doorElement.wallId;
            const wall = wallStore.getById(wallId);
            if (wall && wall.openings) {
                const opening = wall.openings.find((op: any) => op.elementId === id);
                if (opening) {
                    this.deletedData.openingDescriptor = { ...opening };
                }
            }

            wallStore.removeDoor(id);
            // §3.5 FIX: Unregister from elementRegistry (moved from WallStore.removeOpening()).
            elementRegistry.unregister(id);
            // wallStore.removeDoor() → removeOpening() → emit('update') fires the Store Event Bus
            // → subscriber in main.ts → wallFragmentBuilder.updateWall(). No direct builder call needed.

            return { success: true, affectedElementIds: [id] };
        }

        // 4. Slabs
        // C2 §SLAB-SYSTEM-AUDIT-2026: Delegate to DeleteSlabCommand so that all C1 +
        // W3 fixes (bimManager unregister, elementRegistry, SemanticGraph, opening
        // cleanup) live in one place.  DeleteElementCommand still records elementType
        // so that undo() can forward to the delegate.
        const slabStore = ctx.stores.slabStore;
        const slab = slabStore?.getById?.(id);
        if (slab) {
            this.elementType = 'slab';
            const delegate = new DeleteSlabCommand(id);
            this._slabDelegate = delegate;
            return delegate.execute(ctx);
        }

        // 5. Columns
        // §COLUMN-AUDIT-2026 §C2: Delegate to DeleteColumnCommand so all four
        // side effects (store, bimManager, elementRegistry, SemanticGraph) are
        // performed together AND restored together by undo().
        const columnStore = ctx.stores.columnStore;
        const column = columnStore?.get?.(id);
        if (column) {
            this.elementType = 'column';
            const delegate = new DeleteColumnCommand({ columnId: id });
            this._columnDelegate = delegate;
            return delegate.execute(ctx);
        }

        // 6. Curtain Walls
        // §WALL-AUDIT-2026-W2: read store from ctx.stores; window-global fallback removed.
        // OI-036: added elementRegistry + bimManager + SemanticGraph cleanup (was store-only).
        const cwStore = ctx.stores.curtainWallStore;
        const cw = cwStore?.get?.(id);
        if (cw) {
            this.deletedData = { ...cw };
            this.elementType = 'curtainwall';
            const cwBimMgr = ctx.bimManager;
            cwStore.remove(id);
            try { cwBimMgr?.unregisterElement?.(id); } catch (_) {}
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch (_) {}
            try { elementRegistry.unregister(id); } catch (_) {}
            return { success: true, affectedElementIds: [id] };
        }

        // 7. Furniture — mirrors CreateFurnitureCommand.undo() and cascades to associated children
        // §WALL-AUDIT-2026-W2: read store from ctx.stores; window-global fallback removed.
        const furnitureStore = (ctx.stores as any).furnitureStore;
        const furniture: FurnitureData | undefined = furnitureStore?.get?.(id);
        if (furniture) {
            this.deletedData = structuredClone(furniture);
            this.elementType = 'furniture';

            // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
            // §WALL-AUDIT-2026-W2 (RESOLVED 2026-04-24): the FurnitureFragmentBuilder
            // is now exposed on CommandContext (`ctx.furnitureFragmentBuilder`).
            // The previous window.furnitureFragmentBuilder fallback is
            // retained ONLY for the bootstrap-order race window where the furniture
            // subsystem registers its fragment builder on the window after the
            // first commandContext is built. The second pass in `initTools.ts`
            // re-reads the window global; runtime code paths after that always
            // hit the injected `ctx.furnitureFragmentBuilder` first.
            const builder = (ctx as any).furnitureFragmentBuilder ?? window.furnitureFragmentBuilder;

            // Cascade to associated children (e.g. dining chairs created with parentFurnitureId)
            const all: FurnitureData[] = furnitureStore.getAll?.() ?? [];
            this._furnitureChildren = all.filter(f =>
                (f.properties as any)?.parentFurnitureId === id
            ).map(f => structuredClone(f));

            this._furnitureChildren.forEach(child => {
                try { bimMgr?.unregisterElement?.(child.id); } catch (_) {}
                try { semanticGraphManager.removeAllRelationshipsForElement(child.id); } catch (_) {}
                try { elementRegistry.unregister(child.id); } catch (_) {}
                furnitureStore.remove(child.id);
                try { builder?.removeFurniture?.(child.id); } catch (_) {}
            });

            // Remove parent
            try { bimMgr?.unregisterElement?.(id); } catch (_) {}
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch (_) {}
            try { elementRegistry.unregister(id); } catch (_) {}
            furnitureStore.remove(id);
            try { builder?.removeFurniture?.(id); } catch (_) {}

            return {
                success: true,
                affectedElementIds: [id, ...this._furnitureChildren.map(c => c.id)],
            };
        }

        // 8. Handrails (mirrors DeleteHandrailCommand)
        const handrailStore = ctx.stores.handrailStore;
        const handrail = handrailStore?.getById?.(id);
        if (handrail) {
            this.deletedData = structuredClone(handrail);
            this.elementType = 'handrail';
            // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
            try { bimMgr?.unregisterElement?.(id); } catch (_) {}
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch (_) {}
            try { elementRegistry.unregister(id); } catch (_) {}
            handrailStore.remove(id);
            return { success: true, affectedElementIds: [id] };
        }

        // 9. Roofs (mirrors DeleteRoofCommand)
        const roofStore = ctx.stores.roofStore;
        const roof = roofStore?.getById?.(id);
        if (roof) {
            this.deletedData = structuredClone(roof);
            this.elementType = 'roof';
            // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
            try { bimMgr?.unregisterElement?.(id); } catch (_) {}
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch (_) {}
            try { elementRegistry.unregister(id); } catch (_) {}
            try { (ctx as any).topologyGraph?.removeNode?.(id); } catch (_) {}
            roofStore.remove(id);
            return { success: true, affectedElementIds: [id] };
        }

        // 10. Floors (mirrors RemoveFloorCommand)
        const floorStore = ctx.stores.floorStore;
        const floor = floorStore?.getById?.(id);
        if (floor) {
            this.deletedData = structuredClone(floor);
            this.elementType = 'floor';
            // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
            try { bimMgr?.unregisterElement?.(id); } catch (_) {}
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch (_) {}
            try { elementRegistry.unregister(id); } catch (_) {}
            // Non-null assertion: `floor` exists ⇒ floorStore exists.
            floorStore!.remove(id);
            return { success: true, affectedElementIds: [id] };
        }

        // 11. Ceilings (mirrors RemoveCeilingCommand)
        const ceilingStore = ctx.stores.ceilingStore;
        const ceiling = ceilingStore?.getById?.(id);
        if (ceiling) {
            this.deletedData = structuredClone(ceiling);
            this.elementType = 'ceiling';
            // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
            const holes: any[] = (ceiling as any).holes ?? [];
            holes.forEach(h => {
                if (!h?.elementId) return;
                try { elementRegistry.unregister(h.elementId); } catch (_) {}
                try { bimMgr?.unregisterElement?.(h.elementId); } catch (_) {}
            });
            try { bimMgr?.unregisterElement?.(id); } catch (_) {}
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch (_) {}
            try { elementRegistry.unregister(id); } catch (_) {}
            // Non-null assertion: `ceiling` exists ⇒ ceilingStore exists.
            ceilingStore!.remove(id);
            return { success: true, affectedElementIds: [id] };
        }

        // 12. Beams
        const beamStore = ctx.stores.beamStore;
        const beam = beamStore?.get?.(id);
        if (beam) {
            this.deletedData = structuredClone(beam);
            this.elementType = 'beam';
            // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
            try { bimMgr?.unregisterElement?.(id); } catch (_) {}
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch (_) {}
            try { elementRegistry.unregister(id); } catch (_) {}
            beamStore.remove(id);
            return { success: true, affectedElementIds: [id] };
        }

        // 13. Plumbing fixtures
        const plumbingStore = ctx.stores.plumbingStore;
        const plumbing = plumbingStore?.get?.(id);
        if (plumbing) {
            this.deletedData = structuredClone(plumbing);
            this.elementType = 'plumbing';
            // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
            try { bimMgr?.unregisterElement?.(id); } catch (_) {}
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch (_) {}
            try { elementRegistry.unregister(id); } catch (_) {}
            plumbingStore.remove(id);
            return { success: true, affectedElementIds: [id] };
        }

        // 14. Stairs — full snapshot incl. railings & landings (mirrors DeleteStairCommand)
        const stair = ctx.stores.stairStore?.getById?.(id);
        if (stair) {
            this.deletedData = structuredClone(stair as StairData);
            this.elementType = 'stair';

            if (ctx.stores.stairRailingStore) {
                this._stairRailingSnapshots = ctx.stores.stairRailingStore
                    .getByStairId(id)
                    .map((r: StairRailingConfig) => structuredClone(r));
            }
            if (ctx.stores.stairLandingStore) {
                this._stairLandingSnapshots = ctx.stores.stairLandingStore
                    .getByStairId(id)
                    .map((l: StairLandingEntity) => structuredClone(l));
            }

            // Remove sub-elements first so their builders clean up before the parent.
            ctx.stores.stairRailingStore?.removeByStairId(id);
            ctx.stores.stairLandingStore?.removeByStairId(id);
            // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
            this._stairRailingSnapshots.forEach(r => {
                try { bimMgr?.unregisterElement?.(r.id); } catch (_) {}
                try { elementRegistry.unregister(r.id); } catch (_) {}
            });

            ctx.stores.stairStore.remove(id);
            try { bimMgr?.unregisterElement?.(id); } catch (_) {}
            try { elementRegistry.unregister(id); } catch (_) {}

            _bus.emit('ai-model-update', {}); // F.events.17
            return { success: true, affectedElementIds: [id] };
        }

        return { success: false, affectedElementIds: [], info: ['Element not found in any store'] };
    }

    undo(ctx: CommandContext): CommandResult {
        // OI-041: slab and column execute() immediately delegate — this.deletedData is never
        // set in those branches; the guard must also accept a live delegate as proof of execute().
        if (!this.deletedData && !this._slabDelegate && !this._columnDelegate) {
            throw new Error("Undo called before execute");
        }
        const stores = ctx.stores;

        switch (this.elementType) {
            case 'wall':
                stores.wallStore.add(deserializeWallSnapshot(this.deletedData));
                // Re-register with BimManager spatial hierarchy.
                {
                    // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
                    if (bimMgr?.registerElement) {
                        bimMgr.registerElement(this.deletedData.id, this.deletedData.levelId);
                    }
                    // §5 FIX: Re-register child openings (windows/doors) in BimManager
                    // and elementRegistry. execute() unregisters them individually; undo
                    // must mirror that exactly to keep spatial authority consistent.
                    // wallStore.add() already repopulates the sub-maps (Fix 2) but the
                    // cross-system registrations are command-layer responsibility (§3.5).
                    // §CASCADE-DELETE UNDO: wallStore.add() repopulates the internal maps
                    // (wallStore.doors / wallStore.windows) but NOT the external DoorStore /
                    // WindowStore singletons. Restore those here, mirroring CreateWallOpeningCommand.
                    const openings: any[] = this.deletedData.openings ?? [];
                    openings.forEach((op: any) => {
                        if (!op.elementId) return;
                        if (bimMgr?.registerElement) {
                            try { bimMgr.registerElement(op.elementId, this.deletedData.levelId); } catch (_) {}
                        }
                        const opType = op.type === 'door' ? 'door' : 'window';
                        try { elementRegistry.registerSemantic(op.elementId, opType as any); } catch (_) {}

                        // Restore the external singleton store so DoorBuilder / WindowBuilder
                        // receive an 'add' event and re-render the hosted element.
                        // wallStore.add() already repopulated wallStore.doors / wallStore.windows
                        // via _repopulateHostedElementsFromOpenings(); use those as the source
                        // of truth to build the correct external-store payload.
                        const wallId = this.deletedData.id;
                        if (op.type === 'door') {
                            const restored = stores.wallStore.getDoor(op.elementId);
                            if (restored && !doorStore.has(op.elementId)) {
                                try {
                                    doorStore.add({
                                        id:          restored.id,
                                        openingId:   restored.openingId,
                                        wallId,
                                        width:       restored.width,
                                        height:      restored.height,
                                        sillHeight:  restored.sillHeight,
                                        offset:      restored.offset,
                                        doorType:    restored.doorType,
                                        mark:        restored.properties?.mark,
                                        systemTypeId: (op as any).systemTypeId,
                                    });
                                } catch (_) {}
                            }
                        } else if (op.type === 'window') {
                            const restored = stores.wallStore.getWindow(op.elementId);
                            if (restored && !windowStore.has(op.elementId)) {
                                try {
                                    windowStore.add({
                                        id:          restored.id,
                                        openingId:   restored.openingId,
                                        wallId,
                                        width:       restored.width,
                                        height:      restored.height,
                                        sillHeight:  restored.sillHeight,
                                        offset:      restored.offset,
                                        windowType:  restored.windowType,
                                        mark:        restored.properties?.mark,
                                        systemTypeId: (op as any).systemTypeId,
                                    });
                                } catch (_) {}
                            }
                        }
                    });
                }
                // §3.5 FIX: Re-register wall in elementRegistry (moved from WallStore.add()).
                elementRegistry.registerSemantic(this.deletedData.id, 'wall');

                // §UNDO-AUDIT-2026 §01-§2.3 — Restore neighbour baselines that
                // were re-trimmed by the resolver after the wall was removed.
                // Each update() emits an 'update' event; the EngineBootstrap
                // subscriber batches them into one resolver pass per frame.
                // With the pre-delete baselines + _sourceBaseLines back in
                // place, the next pass derives the same join state that
                // existed before the delete — full deterministic reversal.
                if (this._neighbourSnapshot) {
                    for (const snap of this._neighbourSnapshot) {
                        if (snap.id === this.deletedData.id) continue;
                        const current = stores.wallStore.getById(snap.id);
                        if (!current) continue;
                        stores.wallStore.update(snap.id, {
                            baseLine: [
                                { x: snap.baseLine[0].x, y: snap.baseLine[0].y, z: snap.baseLine[0].z },
                                { x: snap.baseLine[1].x, y: snap.baseLine[1].y, z: snap.baseLine[1].z },
                            ],
                            // _sourceBaseLine MUST be passed in the same update()
                            // — WallStore.update() clears _sourceBaseLine when
                            // baseLine is set without it, and erasing the
                            // resolver's idempotency anchor would break joins.
                            ...(snap._sourceBaseLine ? { _sourceBaseLine: [
                                { x: snap._sourceBaseLine[0].x, y: snap._sourceBaseLine[0].y, z: snap._sourceBaseLine[0].z },
                                { x: snap._sourceBaseLine[1].x, y: snap._sourceBaseLine[1].y, z: snap._sourceBaseLine[1].z },
                            ] } : {}),
                        } as any);
                    }
                }
                break;
            case 'window':
                stores.wallStore.addWindow(this.deletedData);
                // §3.5 FIX: Re-register in elementRegistry (moved from WallStore.addWindow()).
                // Use try/catch in case redo is called twice — registerSemantic throws on duplicate.
                try { elementRegistry.registerSemantic(this.deletedData.id, 'window'); } catch (_) {}
                if (this.deletedData.openingDescriptor) {
                    // restoreOpening() writes through the store's internal mutable map and emits
                    // the update event so the subscriber rebuilds geometry correctly.
                    stores.wallStore.restoreOpening(
                        this.deletedData.wallId,
                        this.deletedData.openingDescriptor
                    );
                }
                break;
            case 'door':
                stores.wallStore.addDoor(this.deletedData);
                // §3.5 FIX: Re-register in elementRegistry (moved from WallStore.addDoor()).
                try { elementRegistry.registerSemantic(this.deletedData.id, 'door'); } catch (_) {}
                if (this.deletedData.openingDescriptor) {
                    // restoreOpening() is the correct store API for re-adding an
                    // opening to a wall after undo without mutating frozen objects.
                    stores.wallStore.restoreOpening(
                        this.deletedData.wallId,
                        this.deletedData.openingDescriptor
                    );
                }
                break;
            case 'slab':
                // C2 §SLAB-SYSTEM-AUDIT-2026: Forward to the stored DeleteSlabCommand delegate.
                // All C1 + W3 restoration logic lives in DeleteSlabCommand.undo().
                if (this._slabDelegate) {
                    return this._slabDelegate.undo(ctx);
                }
                break;
            case 'column':
                // §COLUMN-AUDIT-2026 §C2: forward to the stored DeleteColumnCommand
                // delegate so all four side effects (store, bimManager,
                // elementRegistry, SemanticGraph) are restored as a unit.
                if (this._columnDelegate) {
                    return this._columnDelegate.undo(ctx);
                }
                break;
            case 'curtainwall': {
                // §WALL-AUDIT-2026-W2: ctx.stores.curtainWallStore is non-optional; window fallback removed.
                // OI-037: add bimManager.registerElement + elementRegistry.registerSemantic so the
                // element re-enters the pick/spatial registries and is fully interactive after undo.
                const cwSnap = this.deletedData;
                const cwBimMgr = ctx.bimManager;
                ctx.stores.curtainWallStore?.add?.(cwSnap);
                try { cwBimMgr?.registerElement?.(cwSnap.id, cwSnap.levelId ?? cwSnap.baseLevelId); } catch (_) {}
                try { elementRegistry.registerSemantic(cwSnap.id, 'curtainwall' as any); } catch (_) {}
                break;
            }
            case 'furniture': {
                const snapshot = this.deletedData as FurnitureData;
                // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional; window fallback removed.
                const bimMgr = ctx.bimManager;
                // §WALL-AUDIT-2026-W2: read store from ctx.stores; window-global fallback removed.
                const furnitureStore = (ctx.stores as any).furnitureStore;
                // §WALL-AUDIT-2026-W2 (RESOLVED 2026-04-24): prefer the injected
                // `ctx.furnitureFragmentBuilder`; window-global fallback retained
                // only for the bootstrap-order race window (see execute() comment
                // for the full rationale).
                const builder = (ctx as any).furnitureFragmentBuilder ?? window.furnitureFragmentBuilder;

                // Restore parent first
                try { bimMgr?.registerElement?.(snapshot.id, snapshot.levelId); } catch (_) {}
                furnitureStore?.add?.(snapshot);
                try {
                    semanticGraphManager.addRelationship({
                        type: 'sitsOn',
                        sourceId: snapshot.id,
                        targetId: snapshot.levelId,
                        createdBy: 'DeleteElementCommand.undo',
                        metadata: { furnitureType: snapshot.furnitureType },
                    });
                } catch (_) {}
                try { builder?.updateFurniture?.(snapshot); } catch (_) {}

                // Restore associated children
                this._furnitureChildren.forEach(child => {
                    try { bimMgr?.registerElement?.(child.id, child.levelId); } catch (_) {}
                    furnitureStore?.add?.(child);
                    try {
                        semanticGraphManager.addRelationship({
                            type: 'sitsOn',
                            sourceId: child.id,
                            targetId: child.levelId,
                            createdBy: 'DeleteElementCommand.undo',
                            metadata: { furnitureType: child.furnitureType },
                        });
                    } catch (_) {}
                    try { builder?.updateFurniture?.(child); } catch (_) {}
                });
                break;
            }
            case 'handrail': {
                const snap = this.deletedData;
                // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
                const store = ctx.stores.handrailStore;
                store?.add?.(snap);
                try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch (_) {}
                try { elementRegistry.registerSemantic(snap.id, 'handrail' as any); } catch (_) {}
                break;
            }
            case 'roof': {
                const snap = this.deletedData;
                // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
                const store = ctx.stores.roofStore;
                store?.add?.(snap);
                try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch (_) {}
                try { elementRegistry.registerSemantic(snap.id, 'roof' as any); } catch (_) {}
                break;
            }
            case 'floor': {
                const snap = this.deletedData;
                // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
                const store = ctx.stores.floorStore;
                store?.add?.(snap);
                try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch (_) {}
                try { elementRegistry.registerSemantic(snap.id, 'floor' as any); } catch (_) {}
                break;
            }
            case 'ceiling': {
                const snap = this.deletedData;
                // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
                const store = ctx.stores.ceilingStore;
                if (store?.restoreSnapshot) store.restoreSnapshot(snap);
                else store?.add?.(snap);
                try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch (_) {}
                try { elementRegistry.registerSemantic(snap.id, 'ceiling' as any); } catch (_) {}
                break;
            }
            case 'beam': {
                const snap = this.deletedData;
                // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
                const store = ctx.stores.beamStore;
                store?.add?.(snap);
                try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch (_) {}
                try { elementRegistry.registerSemantic(snap.id, 'beam' as any); } catch (_) {}
                // §BEAM-AUDIT-2026-W7b: re-author the SemanticGraph edges that
                // CreateBeamCommand originally wrote, so undoing a delete leaves
                // DependencyResolver with the same load-path topology it had
                // before. Without this, structural validation walks lose the
                // beam's `sitsOn` and `supports` links permanently.
                try {
                    semanticGraphManager.addRelationship({
                        type: 'sitsOn',
                        sourceId: snap.id,
                        targetId: snap.levelId,
                        createdBy: 'DeleteElementCommand.undo',
                        metadata: { restoredBy: 'DeleteElementCommand.undo' },
                    });
                    if (snap.startSupportId) {
                        semanticGraphManager.addRelationship({
                            type: 'supports',
                            sourceId: snap.startSupportId,
                            targetId: snap.id,
                            createdBy: 'DeleteElementCommand.undo',
                            metadata: { role: 'startSupport' },
                        });
                    }
                    if (snap.endSupportId && snap.endSupportId !== snap.startSupportId) {
                        semanticGraphManager.addRelationship({
                            type: 'supports',
                            sourceId: snap.endSupportId,
                            targetId: snap.id,
                            createdBy: 'DeleteElementCommand.undo',
                            metadata: { role: 'endSupport' },
                        });
                    }
                } catch (_) {}
                break;
            }
            case 'plumbing': {
                const snap = this.deletedData;
                // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
                const store = ctx.stores.plumbingStore;
                store?.add?.(snap);
                try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch (_) {}
                try { elementRegistry.registerSemantic(snap.id, 'plumbing-fixture' as any); } catch (_) {}
                break;
            }
            case 'stair': {
                const snapshot = this.deletedData as StairData;
                // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
                try { bimMgr?.registerElement?.(snapshot.id, snapshot.baseLevelId); } catch (_) {}
                try { elementRegistry.registerSemantic(snapshot.id, 'stair'); } catch (_) {}

                ctx.stores.stairStore.restoreSnapshot(snapshot);

                this._stairRailingSnapshots.forEach(r => {
                    try { bimMgr?.registerElement?.(r.id, snapshot.baseLevelId); } catch (_) {}
                    try { elementRegistry.registerSemantic(r.id, 'stair-railing'); } catch (_) {}
                    ctx.stores.stairRailingStore?.add(r);
                });
                this._stairLandingSnapshots.forEach(l => {
                    // OI-040: landings were store-only; add bimManager + elementRegistry
                    // re-registration to match the railing treatment above.
                    try { bimMgr?.registerElement?.(l.id, snapshot.baseLevelId); } catch (_) {}
                    try { elementRegistry.registerSemantic(l.id, 'stair-landing' as any); } catch (_) {}
                    ctx.stores.stairLandingStore?.add(l);
                });

                _bus.emit('ai-model-update', {}); // F.events.17
                break;
            }
        }
        return { success: true, affectedElementIds: [this.elementId] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            targetIds: this.targetIds,
            timestamp: this.timestamp,
            version: 1,
            payload: { elementId: this.elementId }
        };
    }
}
