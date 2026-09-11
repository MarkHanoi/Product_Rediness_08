// §SWALLOW-SIDE-INDEX — why the `catch { /* … */ }` blocks below are empty.
//
// Every one of them wraps a write to a SIDE INDEX (elementRegistry,
// bimManager, semanticGraphManager, roomSpatialIndex) that is derived from the
// element stores, never authoritative over them. The store mutation — the
// command's actual contract — has already committed and is NOT inside the try.
// A side index that rejects an unregister for an id it never held, or a
// register for an id it already holds, is reporting a no-op, not a failure:
// re-deriving the index from the stores would produce the same result either
// way. Re-throwing here would abort a command whose real work succeeded and
// leave the undo stack describing a mutation that was rolled back only halfway.
//
// This is NOT a §CONTEXT-DATA-HONESTY breach: nothing downstream reads a
// success/failure value from these calls, so there is no refusal being
// disguised as a result. If a side index ever becomes load-bearing for a
// query, these blocks must become reported failures.

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { serializeWallSnapshot, deserializeWallSnapshot } from './wallSnapshotUtils';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';
import type { FurnitureData } from '@pryzm/geometry-furniture';
import type { WallBaseline } from '@pryzm/geometry-wall';
import { semanticGraphManager } from '@pryzm/core-app-model';
import type { Relationship } from '@pryzm/core-app-model';
// C2 §SLAB-SYSTEM-AUDIT-2026: Slab branch is now delegated to the dedicated command.
import { DeleteSlabCommand } from '../slabs/DeleteSlabCommand';
import { DeleteColumnCommand } from '../columns/DeleteColumnCommand';
import { DeleteStairCommand } from '../stair/DeleteStairCommand';

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
    // §FIX-WINDOW-DELETE-LEAVES-MESH (L-308): "window" and "door" are now declared.
    // Deleting a hosted window/door mutates the external windowStore/doorStore
    // singletons (so their builders dispose the 3D frame+glazing mesh) — the scope
    // must say so. Their absence was the smoking gun: the command removed the wall
    // opening but never touched the external store, so WindowBuilder/DoorBuilder
    // never received a 'remove' event and the mesh floated on the healed wall.
    readonly affectedStores = ["wall", "slab", "column", "curtainWall", "furniture", "handrail", "roof", "floor", "ceiling", "beam", "plumbing", "stair", "level", "window", "door", "spaceEnvelope"] as const;
    id = crypto.randomUUID();
    type = CommandType.DELETE_ELEMENT;
    timestamp = Date.now();
    targetIds: string[];

    private deletedData?: any;
    private elementType?: string;
    // §FIX-STAIR-DELETE-LEAVES-HOLE (L-298): stair state (snapshot, railings, landings
    // AND the auto-opening heal) now lives in the DeleteStairCommand delegate — see
    // _stairDelegate below. The former inline _stairRailing/_stairLanding snapshots are gone.
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
    /**
     * §FIX-STAIR-DELETE-LEAVES-HOLE (L-298) — the stair branch now delegates to
     * DeleteStairCommand so that the auto-opening heal (remove the slab hole on
     * delete, restore it on undo) lives in ONE place and both delete paths — the
     * generic delete key AND the dedicated command — behave identically. Mirrors the
     * slab (_slabDelegate) and column (_columnDelegate) delegation above; before this,
     * this inline stair branch left the stair's opening in the floor forever.
     */
    private _stairDelegate: DeleteStairCommand | null = null;

    /**
     * ⭐ §FIX-ORPHANED-HOSTED-MESH (L-3404) — set ONLY when `execute()` removed a scene
     * object that no store held. It is the id, not a boolean, so `undo()` can name the
     * thing it cannot restore instead of saying "something".
     */
    private _reapedOrphanId: string | null = null;
    /**
     * §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES (BIM 3.0 C7) — wall-family branches only
     * (wall + cascaded children, window, door, window-orphan, door-orphan).
     *
     * THE BUG: thirteen element kinds in this file purge the SemanticGraph on
     * delete (semanticGraphManager.removeAllRelationshipsForElement) — the wall
     * family never did. A well-formed edge pointing at a deleted id is NOT
     * self-erasing: it survives serialize()/deserialize() and persists forever,
     * so `hosts`/`hostedBy`/`boundedBy`/`supports` edges referencing deleted
     * walls accumulated in every saved project.
     *
     * THE UNDO SIDE: the other kinds RE-CREATE their edges on undo by
     * reconstructing them from their own snapshot (beam re-adds sitsOn/supports,
     * furniture/slab/column re-add sitsOn). A wall cannot reconstruct its edges
     * that way — `boundedBy` (room→wall) and `supports` (wall→beam) are authored
     * by OTHER elements' commands and are invisible in the wall snapshot. So the
     * wall family captures getRelationships() verbatim BEFORE removal (the
     * standard prevState pattern) and re-adds them on undo. addRelationship() is
     * idempotent, so redo/undo cycles cannot duplicate edges.
     */
    private _removedRelationships: Relationship[] | null = null;
    // §FIX-ENVELOPE-DELETE-NOT-FOUND (2026-09-11) — snapshot child ids before remove
    // so undo can re-point withinId back to the restored parent.
    private _spaceEnvelopeChildIds: string[] = [];

    constructor(private elementId: string) {
        this.targetIds = [elementId];
    }

    /**
     * §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — capture every graph edge touching any
     * of `ids` (source OR target), deduped by relationship id (an edge like
     * wall—hosts→window touches two of the ids and must be captured once).
     * MUST run before any removeAllRelationshipsForElement call in the branch.
     */
    private _captureRelationships(ids: string[]): void {
        const byRelId = new Map<string, Relationship>();
        for (const eid of ids) {
            for (const rel of semanticGraphManager.getRelationships(eid)) {
                byRelId.set(rel.id, { ...rel });
            }
        }
        this._removedRelationships = [...byRelId.values()];
    }

    /**
     * §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — undo side: re-add the captured edges.
     * addRelationship() regenerates ids but is idempotent on
     * (source, target, type, authoredBy), so a second undo after redo cannot
     * duplicate.
     */
    private _restoreRelationships(): void {
        if (!this._removedRelationships) return;
        for (const rel of this._removedRelationships) {
            try {
                semanticGraphManager.addRelationship({
                    type: rel.type,
                    sourceId: rel.sourceId,
                    targetId: rel.targetId,
                    createdBy: rel.createdBy,
                    // §FIX-CONNECTEDBY-EDGE-KEYING — carry the identity field
                    // through verbatim. This is the GENERIC delete that L-298
                    // routes stairs through, so a dropped `authoredBy` here would
                    // restore a circulation edge unkeyed and let it collide with a
                    // rival stair's/lift's edge on the same level pair.
                    ...(rel.authoredBy !== undefined ? { authoredBy: rel.authoredBy } : {}),
                    ...(rel.metadata ? { metadata: rel.metadata } : {}),
                });
            } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
        }
    }

    canExecute(ctx: CommandContext): CommandValidationResult {
        const id = this.elementId;
        const stores = ctx.stores;

        if (stores.wallStore.getById(id) ||
            stores.wallStore.getWindow(id) ||
            stores.wallStore.getDoor(id)) return { ok: true };

        // §FIX-WINDOW-OOB-OPENING-RESTORE (L-82): an orphaned hosted element —
        // present only in the external windowStore/doorStore because a prior
        // out-of-bounds dimension edit desynced it from the WallStore — must STILL
        // be deletable. Without this the selectable-but-orphaned window could
        // never be removed (canExecute rejected it before execute() ran).
        if (windowStore.has(id) || doorStore.has(id)) return { ok: true };

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
        // §FIX-ENVELOPE-DELETE-NOT-FOUND (2026-09-11) — spaceEnvelope is a first-class
        // element family with its own store and command-bus handler, but the generic
        // delete probe did not include it. Selecting an envelope and pressing Delete
        // fell through to the terminal refusal "Element X not found in any store".
        if ((stores as any).spaceEnvelope?.get?.(id)) return { ok: true };

        // ⭐ §FIX-ORPHANED-HOSTED-MESH (L-3404, founder 2026-08-22) — THE HATCH THIS
        // REFUSAL DID NOT HAVE.
        //
        // The founder undid an ADD_OPENING and was left with a window he could SELECT and
        // could not DELETE: every branch above failed and this line refused him, correctly
        // — no store held the record — with NO removal path of any kind behind the refusal.
        // That is a regression with a contract citation attached
        // ([[refusing-half-needs-its-escape-hatch]]).
        //
        // ⛔ THIS EXTENDS THE EXISTING HATCH RATHER THAN MINTING A RIVAL. The
        // §FIX-WINDOW-OOB-OPENING-RESTORE line above covers an orphan still present in
        // windowStore/doorStore. His orphan was in NEITHER — undo removed both — so it fell
        // straight through to here. Same defect shape, one store deeper.
        //
        // ⚠ ORDER MATTERS AND IT IS DELIBERATE: this is the LAST branch, so a scene root
        // can only authorise a delete when EVERY store has already said no. That is the
        // definition of the orphan, and it is why this cannot mask a normal element whose
        // own branch is missing — such an element has a store record and never reaches here.
        //
        // ⭐ The root cause is fixed at source (WindowBuilder/DoorBuilder dispose() now
        // cancel the queued build, L-3400). This hatch exists for orphans ALREADY minted in
        // a live session and for any future path that mints one — a class this file cannot
        // close on its own.
        if (elementRegistry.getRoot(id)) return { ok: true };

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

            // §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — capture BEFORE any removal:
            // the wall's edges (hosts, boundedBy, supports, …) AND every cascaded
            // child's edges (hostedBy) in one deduped snapshot for undo.
            this._captureRelationships([id, ...childrenIds]);

            childrenIds.forEach(childId => {
                elementRegistry.unregister(childId);
                if (bimMgr?.unregisterElement) {
                    try { bimMgr.unregisterElement(childId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                }
                // §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — the cascaded child's
                // hostedBy edge (and the wall's hosts edge to it) must not
                // survive the delete. Mirrors the thirteen other kinds.
                try { semanticGraphManager.removeAllRelationshipsForElement(childId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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

            // §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — purge the wall's own edges
            // (boundedBy from rooms, supports to beams, any remaining hosts).
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }

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

            // §FIX-WINDOW-DELETE-LEAVES-MESH (L-308): capture the EXTERNAL windowStore
            // record before removal so undo restores the exact typed window (all its
            // frame/glazing/system-type fields), not a lossy reconstruction. This is the
            // record WindowBuilder renders from — restoring it re-creates the 3D mesh.
            const winStoreRecord = windowStore.getById(id);
            if (winStoreRecord) this.deletedData.windowStoreRecord = { ...winStoreRecord };

            const wallId = windowElement.wallId;
            const wall = wallStore.getById(wallId);
            if (wall && wall.openings) {
                const opening = wall.openings.find((op: any) => op.elementId === id);
                if (opening) {
                    this.deletedData.openingDescriptor = { ...opening };
                }
            }

            // §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — capture (for undo) then purge
            // the window's hostedBy edge + the host wall's hosts edge to it.
            this._captureRelationships([id]);

            wallStore.removeWindow(id);
            // §3.5 FIX: Unregister from elementRegistry (moved from WallStore.removeOpening()).
            elementRegistry.unregister(id);
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            // §FIX-WINDOW-DELETE-LEAVES-MESH (L-308): free the EXTERNAL windowStore
            // singleton too. wallStore.removeWindow() only cleans the wall's internal
            // window map + re-cuts the void; it never reaches windowStore, so
            // WindowBuilder (a pure windowStore subscriber) never receives a 'remove'
            // event and its 3D frame+glazing group survives on the now-solid wall.
            // This mirrors the wall-delete CASCADE branch above and the create path
            // (CreateWallOpeningCommand's dual-store write). remove() is idempotent.
            windowStore.remove(id);
            // wallStore.removeWindow() → removeOpening() → emit('update') fires the Store Event Bus
            // → subscriber in main.ts → wallFragmentBuilder.updateWall(). No direct builder call needed.

            return { success: true, affectedElementIds: [id] };
        }

        // 3. Doors
        const doorElement = wallStore.getDoor(id);
        if (doorElement) {
            this.deletedData = { ...doorElement };
            this.elementType = 'door';

            // §FIX-WINDOW-DELETE-LEAVES-MESH (L-308) — door counterpart: capture the
            // external doorStore record so undo restores the exact typed door.
            const doorStoreRecord = doorStore.getById(id);
            if (doorStoreRecord) this.deletedData.doorStoreRecord = { ...doorStoreRecord };

            const wallId = doorElement.wallId;
            const wall = wallStore.getById(wallId);
            if (wall && wall.openings) {
                const opening = wall.openings.find((op: any) => op.elementId === id);
                if (opening) {
                    this.deletedData.openingDescriptor = { ...opening };
                }
            }

            // §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — capture (for undo) then purge
            // the door's hostedBy edge + the host wall's hosts edge to it.
            this._captureRelationships([id]);

            wallStore.removeDoor(id);
            // §3.5 FIX: Unregister from elementRegistry (moved from WallStore.removeOpening()).
            elementRegistry.unregister(id);
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            // §FIX-WINDOW-DELETE-LEAVES-MESH (L-308) — door counterpart of the window
            // fix above: free the external doorStore singleton so DoorBuilder (a pure
            // doorStore subscriber) receives a 'remove' event and disposes the leaf +
            // frame mesh. Without this the door delete healed the wall but orphaned the
            // 3D leaf/frame — the same defect the window had. remove() is idempotent.
            doorStore.remove(id);
            // wallStore.removeDoor() → removeOpening() → emit('update') fires the Store Event Bus
            // → subscriber in main.ts → wallFragmentBuilder.updateWall(). No direct builder call needed.

            return { success: true, affectedElementIds: [id] };
        }

        // 3b. Orphaned hosted elements (window / door) — §FIX-WINDOW-OOB-OPENING-RESTORE (L-82).
        // Present in the external windowStore/doorStore but NOT in wallStore.windows /
        // .doors (desynced by a prior out-of-bounds dimension edit). The 3D mesh is
        // still selectable, so the element MUST remain deletable: free the external
        // store record, drop any lingering wall opening, and unregister — mirroring
        // the normal branch so the element cleanly disappears and undo can restore it.
        if (windowStore.has(id)) {
            const orphan = windowStore.getById(id);
            this.elementType = 'window-orphan';
            this.deletedData = orphan ? { ...orphan } : { id };
            const orphanWall = orphan?.wallId ? wallStore.getById(orphan.wallId) : undefined;
            const opening = orphanWall?.openings?.find(
                (op: any) => op.elementId === id || op.id === orphan?.openingId,
            );
            if (opening && orphan?.wallId) {
                this.deletedData.openingDescriptor = { ...opening };
                wallStore.removeOpening(orphan.wallId, opening.id);
            }
            // §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — an orphan can still carry
            // graph edges (its hostedBy edge is exactly what makes the stale-edge
            // defect visible); capture for undo, then purge.
            this._captureRelationships([id]);
            windowStore.remove(id);
            elementRegistry.unregister(id);
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            return { success: true, affectedElementIds: [id] };
        }
        if (doorStore.has(id)) {
            const orphan = doorStore.getById(id);
            this.elementType = 'door-orphan';
            this.deletedData = orphan ? { ...orphan } : { id };
            const orphanWall = orphan?.wallId ? wallStore.getById(orphan.wallId) : undefined;
            const opening = orphanWall?.openings?.find(
                (op: any) => op.elementId === id || op.id === orphan?.openingId,
            );
            if (opening && orphan?.wallId) {
                this.deletedData.openingDescriptor = { ...opening };
                wallStore.removeOpening(orphan.wallId, opening.id);
            }
            // §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — door-orphan counterpart of the
            // window-orphan branch above: capture for undo, then purge.
            this._captureRelationships([id]);
            doorStore.remove(id);
            elementRegistry.unregister(id);
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
            try { cwBimMgr?.unregisterElement?.(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { elementRegistry.unregister(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
                try { bimMgr?.unregisterElement?.(child.id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { semanticGraphManager.removeAllRelationshipsForElement(child.id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { elementRegistry.unregister(child.id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                furnitureStore.remove(child.id);
                try { builder?.removeFurniture?.(child.id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            });

            // Remove parent
            try { bimMgr?.unregisterElement?.(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { elementRegistry.unregister(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            furnitureStore.remove(id);
            try { builder?.removeFurniture?.(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }

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
            try { bimMgr?.unregisterElement?.(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            // §FIX-HANDRAIL-DELETE-LEAVES-GRAPH-EDGES — this branch already
            // purged, but undo restored NOTHING, which C71 §5.6 rates worse than
            // no purge because it looks correct: delete+undo silently erased the
            // handrail's graph presence for good. Capture verbatim first.
            this._captureRelationships([id]);
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { elementRegistry.unregister(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
            try { bimMgr?.unregisterElement?.(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            // §FIX-ROOF-DELETE-LEAVES-GRAPH-EDGES — this branch already purged,
            // but undo restored NOTHING, which C71 §5.6 rates worse than no
            // purge because it looks correct: delete+undo silently erased the
            // roof's graph presence for good. Capture verbatim first.
            this._captureRelationships([id]);
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { elementRegistry.unregister(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { (ctx as any).topologyGraph?.removeNode?.(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
            try { bimMgr?.unregisterElement?.(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            // §FIX-FLOOR-DELETE-LEAVES-GRAPH-EDGES — this branch already purged,
            // but undo restored NOTHING, which C71 §5.6 rates worse than no purge
            // because it looks correct: delete+undo silently erased the floor's
            // graph presence for good. Capture verbatim first.
            this._captureRelationships([id]);
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { elementRegistry.unregister(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
                try { elementRegistry.unregister(h.elementId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { bimMgr?.unregisterElement?.(h.elementId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            });
            try { bimMgr?.unregisterElement?.(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            // §FIX-CEILING-DELETE-LEAVES-GRAPH-EDGES — this branch already purged,
            // but undo restored NOTHING, which C71 §5.6 rates worse than no purge
            // because it looks correct: delete+undo silently erased the ceiling's
            // graph presence for good. Capture verbatim first.
            this._captureRelationships([id]);
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { elementRegistry.unregister(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
            try { bimMgr?.unregisterElement?.(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { elementRegistry.unregister(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
            try { bimMgr?.unregisterElement?.(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { semanticGraphManager.removeAllRelationshipsForElement(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            try { elementRegistry.unregister(id); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
            plumbingStore.remove(id);
            return { success: true, affectedElementIds: [id] };
        }

        // 13b. Space envelopes — remove the parent and clear withinId on children
        // (C114 §8), mirroring the command-bus handler's produceCommand patch set.
        const spaceEnvelopeStore = (ctx.stores as any).spaceEnvelope;
        const envelope = spaceEnvelopeStore?.get?.(id);
        if (envelope) {
            this.deletedData = structuredClone(envelope);
            this.elementType = 'spaceEnvelope';
            const bimMgr = ctx.bimManager;
            // Snapshot children BEFORE the remove so undo can re-point withinId.
            const childrenBefore = spaceEnvelopeStore.childrenOf(id);
            this._spaceEnvelopeChildIds = childrenBefore.map(c => c.id);
            // Build patches: remove parent + null-out withinId on each child.
            const patches: any[] = [{ op: 'remove', path: [id] }];
            for (const child of childrenBefore) {
                patches.push({ op: 'replace', path: [child.id, 'withinId'], value: null });
            }
            try { spaceEnvelopeStore.applyPatch(patches); } catch { /* best-effort */ }
            try { bimMgr?.unregisterElement?.(id); } catch { /* §SWALLOW-SIDE-INDEX */ }
            try { elementRegistry.unregister(id); } catch { /* §SWALLOW-SIDE-INDEX */ }
            return { success: true, affectedElementIds: [id] };
        }

        // 14. Stairs — delegate to the dedicated command so the auto-opening heal
        // (§FIX-STAIR-DELETE-LEAVES-HOLE, L-298) — remove the stair's slab hole on
        // delete and restore it on undo — happens in ONE place. Mirrors the slab and
        // column branches above. Previously this inline branch removed the stair but
        // NOT its opening, leaving the void in the floor forever.
        const stair = ctx.stores.stairStore?.getById?.(id);
        if (stair) {
            this.elementType = 'stair';
            const delegate = new DeleteStairCommand({ stairId: id });
            this._stairDelegate = delegate;
            return delegate.execute(ctx);
        }

        // ⭐ §FIX-ORPHANED-HOSTED-MESH (L-3404) — REAP THE ORPHAN, AND SAY SO.
        //
        // Reached only when every store branch above declined, which is exactly the state
        // `canExecute`'s last line authorised. `reapOrphanRoot` detaches the scene root and
        // drops both registry entries; it returns false when there was nothing there, so
        // "I cleaned up an orphan" and "there was no orphan either" stay DIFFERENT answers
        // ([[context-data-honesty-family]] — failure and empty must not be the same value).
        //
        // ⛔ IT IS REPORTED AS WHAT IT IS, NOT AS A NORMAL DELETE. The user gets their model
        // cleaned, and the result says the object had no record — because a green tick that
        // implies a BIM element was deleted, when what was removed was a stray mesh, is the
        // silent-success shape this repo keeps paying for.
        if (elementRegistry.reapOrphanRoot(id)) {
            this._reapedOrphanId = id;
            this.elementType = 'orphan-scene-node';
            return {
                success: true,
                affectedElementIds: [id],
                info: [
                    `Removed a stray 3-D object for ${id}. It was present in the scene but in ` +
                    `NO store, so there was no BIM element to delete — nothing else changed, and ` +
                    `this cannot be undone because there is no record to restore (L-3404).`,
                ],
            };
        }

        return { success: false, affectedElementIds: [], info: ['Element not found in any store'] };
    }

    undo(ctx: CommandContext): CommandResult {
        // ⭐ §FIX-ORPHANED-HOSTED-MESH (L-3404) — AN ORPHAN REAP IS NOT REVERSIBLE, AND IT
        // SAYS SO INSTEAD OF REPORTING AN UNQUALIFIED SUCCESS.
        //
        // What was removed had no store record; there is literally nothing to restore, and
        // re-creating a mesh from nothing would invent an element. `success: true` is
        // correct — the model IS in the state the user asked for, and returning false here
        // would wedge the undo stack over an operation that had no model effect — but it is
        // QUALIFIED with the reason, which is the distinction ISSUE-LOG L-2400/L-2421 record
        // 65 undo bodies failing to draw.
        if (this._reapedOrphanId) {
            return {
                success: true,
                affectedElementIds: [],
                info: [
                    `Nothing to restore for ${this._reapedOrphanId}: what was removed was a ` +
                    `stray 3-D object with no store record, so undo has no element to bring ` +
                    `back. The model is unchanged (L-3404).`,
                ],
            };
        }

        // OI-041: slab and column execute() immediately delegate — this.deletedData is never
        // set in those branches; the guard must also accept a live delegate as proof of execute().
        if (!this.deletedData && !this._slabDelegate && !this._columnDelegate && !this._stairDelegate) {
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
                            try { bimMgr.registerElement(op.elementId, this.deletedData.levelId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                        }
                        const opType = op.type === 'door' ? 'door' : 'window';
                        try { elementRegistry.registerSemantic(op.elementId, opType as any); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }

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
                                } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
                                } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
                // §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — re-add the exact edges
                // execute() captured and purged (wall's hosts/boundedBy/supports
                // + every cascaded child's hostedBy). Mirrors the beam branch's
                // edge re-authoring below, but verbatim from the pre-delete
                // capture because a wall cannot reconstruct edges other
                // elements' commands authored.
                this._restoreRelationships();
                break;
            case 'window':
                stores.wallStore.addWindow(this.deletedData);
                // §3.5 FIX: Re-register in elementRegistry (moved from WallStore.addWindow()).
                // Use try/catch in case redo is called twice — registerSemantic throws on duplicate.
                try { elementRegistry.registerSemantic(this.deletedData.id, 'window'); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                if (this.deletedData.openingDescriptor) {
                    // restoreOpening() writes through the store's internal mutable map and emits
                    // the update event so the subscriber rebuilds geometry correctly.
                    stores.wallStore.restoreOpening(
                        this.deletedData.wallId,
                        this.deletedData.openingDescriptor
                    );
                }
                // §FIX-WINDOW-DELETE-LEAVES-MESH (L-308): restore the external windowStore
                // record so WindowBuilder fires 'add' and REBUILDS the 3D frame+glazing
                // mesh. execute() called windowStore.remove(id); a single Ctrl-Z must undo
                // BOTH the opening removal and the mesh disposal. Mirrors the wall-branch
                // undo's dual-store restore. Guard against a duplicate on redo re-entry.
                if (this.deletedData.windowStoreRecord && !windowStore.has(this.deletedData.id)) {
                    try { windowStore.add(this.deletedData.windowStoreRecord); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                }
                // §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — restore hostedBy/hosts.
                this._restoreRelationships();
                break;
            case 'door':
                stores.wallStore.addDoor(this.deletedData);
                // §3.5 FIX: Re-register in elementRegistry (moved from WallStore.addDoor()).
                try { elementRegistry.registerSemantic(this.deletedData.id, 'door'); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                if (this.deletedData.openingDescriptor) {
                    // restoreOpening() is the correct store API for re-adding an
                    // opening to a wall after undo without mutating frozen objects.
                    stores.wallStore.restoreOpening(
                        this.deletedData.wallId,
                        this.deletedData.openingDescriptor
                    );
                }
                // §FIX-WINDOW-DELETE-LEAVES-MESH (L-308) — door counterpart: restore the
                // external doorStore record so DoorBuilder rebuilds the leaf+frame mesh.
                if (this.deletedData.doorStoreRecord && !doorStore.has(this.deletedData.id)) {
                    try { doorStore.add(this.deletedData.doorStoreRecord); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                }
                // §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — restore hostedBy/hosts.
                this._restoreRelationships();
                break;
            case 'window-orphan': {
                // §FIX-WINDOW-OOB-OPENING-RESTORE (L-82): restore an orphaned window
                // that was deleted from the external windowStore. Re-add the record
                // (so its 3D mesh returns) and, if it still had a wall opening,
                // restore that so the wall re-cuts.
                const snap = this.deletedData;
                if (!windowStore.has(snap.id)) {
                    try { windowStore.add(snap); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                }
                try { elementRegistry.registerSemantic(snap.id, 'window'); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                if (snap.openingDescriptor && snap.wallId) {
                    try { stores.wallStore.restoreOpening(snap.wallId, snap.openingDescriptor); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                }
                // §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — restore captured edges.
                this._restoreRelationships();
                break;
            }
            case 'door-orphan': {
                // §FIX-WINDOW-OOB-OPENING-RESTORE (L-82): door counterpart of the above.
                const snap = this.deletedData;
                if (!doorStore.has(snap.id)) {
                    try { doorStore.add(snap); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                }
                try { elementRegistry.registerSemantic(snap.id, 'door'); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                if (snap.openingDescriptor && snap.wallId) {
                    try { stores.wallStore.restoreOpening(snap.wallId, snap.openingDescriptor); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                }
                // §FIX-WALL-DELETE-LEAVES-GRAPH-EDGES — restore captured edges.
                this._restoreRelationships();
                break;
            }
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
                try { cwBimMgr?.registerElement?.(cwSnap.id, cwSnap.levelId ?? cwSnap.baseLevelId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { elementRegistry.registerSemantic(cwSnap.id, 'curtainwall' as any); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
                try { bimMgr?.registerElement?.(snapshot.id, snapshot.levelId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                furnitureStore?.add?.(snapshot);
                try {
                    semanticGraphManager.addRelationship({
                        type: 'sitsOn',
                        sourceId: snapshot.id,
                        targetId: snapshot.levelId,
                        createdBy: 'DeleteElementCommand.undo',
                        metadata: { furnitureType: snapshot.furnitureType },
                    });
                } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { builder?.updateFurniture?.(snapshot); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }

                // Restore associated children
                this._furnitureChildren.forEach(child => {
                    try { bimMgr?.registerElement?.(child.id, child.levelId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                    furnitureStore?.add?.(child);
                    try {
                        semanticGraphManager.addRelationship({
                            type: 'sitsOn',
                            sourceId: child.id,
                            targetId: child.levelId,
                            createdBy: 'DeleteElementCommand.undo',
                            metadata: { furnitureType: child.furnitureType },
                        });
                    } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                    try { builder?.updateFurniture?.(child); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
                try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { elementRegistry.registerSemantic(snap.id, 'handrail' as any); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                // §FIX-HANDRAIL-DELETE-LEAVES-GRAPH-EDGES — restore verbatim.
                this._restoreRelationships();
                break;
            }
            case 'roof': {
                const snap = this.deletedData;
                // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
                const store = ctx.stores.roofStore;
                store?.add?.(snap);
                try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { elementRegistry.registerSemantic(snap.id, 'roof' as any); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                // §FIX-ROOF-DELETE-LEAVES-GRAPH-EDGES — restore verbatim.
                this._restoreRelationships();
                break;
            }
            case 'floor': {
                const snap = this.deletedData;
                // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
                const store = ctx.stores.floorStore;
                store?.add?.(snap);
                try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { elementRegistry.registerSemantic(snap.id, 'floor' as any); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                // §FIX-FLOOR-DELETE-LEAVES-GRAPH-EDGES — restore verbatim.
                this._restoreRelationships();
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
                try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { elementRegistry.registerSemantic(snap.id, 'ceiling' as any); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                // §FIX-CEILING-DELETE-LEAVES-GRAPH-EDGES — restore verbatim.
                this._restoreRelationships();
                break;
            }
            case 'beam': {
                const snap = this.deletedData;
                // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
                const store = ctx.stores.beamStore;
                store?.add?.(snap);
                try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { elementRegistry.registerSemantic(snap.id, 'beam' as any); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
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
                } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                break;
            }
            case 'plumbing': {
                const snap = this.deletedData;
                // §WALL-AUDIT-2026-W2: ctx.bimManager is non-optional in CommandContext;
            // window.bimManager fallback removed.
            const bimMgr = ctx.bimManager;
                const store = ctx.stores.plumbingStore;
                store?.add?.(snap);
                try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                try { elementRegistry.registerSemantic(snap.id, 'plumbing-fixture' as any); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                break;
            }
            case 'stair':
                // §FIX-STAIR-DELETE-LEAVES-HOLE (L-298): forward to the DeleteStairCommand
                // delegate so the stair, its railings/landings AND its auto-opening hole
                // are all restored as one unit — a single Ctrl-Z reopens exactly what the
                // delete removed. Mirrors the slab/column delegate forwarding above.
                if (this._stairDelegate) {
                    return this._stairDelegate.undo(ctx);
                }
                break;
            case 'spaceEnvelope': {
                const snap = this.deletedData;
                const bimMgr = ctx.bimManager;
                const store = (ctx.stores as any).spaceEnvelope;
                if (store && snap) {
                    // Restore parent + re-point withinId on children that were cleared.
                    const patches: any[] = [{ op: 'add', path: [snap.id], value: snap }];
                    for (const childId of this._spaceEnvelopeChildIds) {
                        patches.push({ op: 'replace', path: [childId, 'withinId'], value: snap.id });
                    }
                    try { store.applyPatch(patches); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                    try { bimMgr?.registerElement?.(snap.id, snap.levelId); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                    try { elementRegistry.registerSemantic(snap.id, 'spaceEnvelope'); } catch { /* §SWALLOW-SIDE-INDEX — see file header */ }
                }
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
