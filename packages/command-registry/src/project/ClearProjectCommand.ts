/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command (NEW FILE)
 * Phase:             Platform Phase — P4 Persistence
 * Files Modified:    ClearProjectCommand.ts (new)
 * Classification:    A
 *
 * Impact Assessment:
 *   Semantic Impact:     Yes — clears the entire project state
 *   Constraint Impact:   No
 *   Undo/Redo Impact:    No — ClearProjectCommand is intentionally NOT undoable.
 *                        It is always issued as part of a LoadProjectSnapshot sequence
 *                        which replaces the history stack.
 *   Store Registry Impact: Yes — all stores cleared
 *   Event Bus Impact:    Yes — dispatches 'bim-project-cleared' after clearing
 *
 * Risk Level:   Medium (modifies global application state)
 * Rationale:
 *   Required as the first step of ProjectLoader.load(). Ensures the scene is clean
 *   before dispatching create commands for the snapshot elements. Goes through the
 *   CommandManager to remain contract-compliant.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext
} from '../types';
import { projectContext } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { semanticIndex } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { visibilityRuleEngine } from '@pryzm/core-app-model';
import { sheetStore } from '@pryzm/core-app-model';
import { scheduleStore } from '@pryzm/core-app-model';
import { roomBoundingLineStore } from '@pryzm/core-app-model';
import { annotationStore } from '@pryzm/core-app-model';
import { projectScopeRegistry } from '@pryzm/core-app-model';
import { storeEventBus } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export class ClearProjectCommand implements Command {
    readonly affectedStores = ["wall", "slab", "level", "column", "beam", "roof", "curtainWall", "furniture", "handrail", "stair"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.CLEAR_PROJECT;
    readonly timestamp = Date.now();
    readonly targetIds: string[] = [];

    canExecute(_ctx: CommandContext): CommandValidationResult {
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const {
            wallStore, slabStore, columnStore, gridStore, stairStore,
            beamStore, curtainWallStore, roofStore, plumbingStore,
            furnitureStore, handrailStore, openingStore, curtainPanelStore,
            ceilingStore,
        } = ctx.stores;

        // §CLEAR-PROJECT-BATCH (2026-07-02) — switching away from a large project
        // (40-storey office: 1065 walls, 78 stairs, 940 room-bounding-lines, 40 levels)
        // tears every element down ONE-BY-ONE. The prior implementation logged a line
        // PER store category inside a console.group; combined with the per-element logs
        // downstream (StairStore/StairMeshBuilder, now gated) that is a measurable cost
        // at this scale (DevTools serialises + paints every line). Collapse the
        // per-category logging into a single summary line emitted at the end. The
        // spatial-tree refresh that each `bim-level-removed` triggered is now coalesced
        // to ONE rebuild per burst in SpatialTree.refreshTree (same §-tag).
        const __clearCounts: Record<string, number> = {};
        const __t0 = (typeof performance !== 'undefined') ? performance.now() : Date.now();

        // §C13-CLEAR-EVENTS-DO-NOT-CROSS (L-713) — THE TEARDOWN'S OWN EVENTS MUST NOT
        // REACH THE INCOMING PROJECT.
        //
        // This command runs INSIDE the StoreEventBus batch that `ProjectLoader` opens for
        // the INCOMING project (ProjectLoader.ts:590 → ImportProjectCommand → here), by
        // design, so builders see clear-then-create in order. But step 18e below
        // (`projectScopeRegistry.clearAll()`) reaches `WindowStore.clear()` /
        // `DoorStore.clear()`, which emit one `delete` per element OF THE OUTGOING
        // PROJECT. Those were buffered and then flushed at ProjectLoader.ts:2012 into the
        // NEW project's subscribers — 74 of them on a project that loaded 0 elements,
        // which is what the founder saw as "remnants of the previous project".
        //
        // Step 0 clears `elementRegistry` FIRST, so by construction every event emitted
        // below names an element nothing can resolve — `ViewDependencyTracker` logged
        // §G3-STALE-EVENT for each and coarse-invalidated every non-3D view of the NEW
        // project. Suppressing them loses nothing: every subscriber of this bus is a
        // DERIVED INDEX that the steps below reset wholesale anyway, and the per-store
        // `subscribe()` channel builders use for mesh teardown is a different channel and
        // is deliberately NOT suppressed.
        //
        // The drop is counted and logged by `suppressDuring` — never silent.
        const __clearResult = storeEventBus.suppressDuring(
            'C13 ClearProjectCommand teardown',
            (): CommandResult => {
        try {
            // 0. Clear ElementRegistry atomically FIRST — before any store mutations.
            //    §3.5 commands are responsible for elementRegistry registration, but
            //    ClearProjectCommand removes elements from stores without going through
            //    each element's Delete command. Clearing the registry here prevents the
            //    "ID already exists in ElementRegistry" crash when reloading a project
            //    (IDs from the previous session would otherwise remain registered and
            //    conflict with the CreateWallCommand/CreateSlabCommand calls in the loader).
            elementRegistry.clear();

            // 1. Curtain panels (hosted on curtain walls)
            if (curtainPanelStore) {
                const panels = curtainPanelStore.getAll();
                __clearCounts.curtainPanels = panels.length;
                panels.forEach(p => curtainPanelStore.remove(p.id));
            }

            // 2. Standalone openings (slab openings)
            const openings = openingStore.getAll();
            __clearCounts.openings = openings.length;
            openings.forEach(o => openingStore.remove(o.id));

            // 3. Walls (embedded window/door openings cascade automatically)
            const walls = wallStore.getAll();
            __clearCounts.walls = walls.length;
            walls.forEach(w => wallStore.remove(w.id));

            // 4. Curtain walls
            const curtainWalls = curtainWallStore.getAll();
            __clearCounts.curtainWalls = curtainWalls.length;
            curtainWalls.forEach(c => curtainWallStore.remove(c.id));

            // 5. Slabs
            const slabs = slabStore.getAll();
            __clearCounts.slabs = slabs.length;
            slabs.forEach(s => slabStore.remove(s.id));

            // 5b. Ceilings
            if (ceilingStore) {
                const ceilings = ceilingStore.getAll();
                __clearCounts.ceilings = ceilings.length;
                ceilings.forEach(c => ceilingStore.remove(c.id));
            }

            // 6. Columns
            const columns = columnStore.getAll();
            __clearCounts.columns = columns.length;
            columns.forEach(c => columnStore.remove(c.id));

            // 7. Beams
            const beams = beamStore.getAll();
            __clearCounts.beams = beams.length;
            beams.forEach(b => beamStore.remove(b.id));

            // 8. Stairs
            const stairs = stairStore.getAll();
            __clearCounts.stairs = stairs.length;
            stairs.forEach(s => stairStore.remove(s.id));

            // 9. Roofs
            const roofs = roofStore.getAll();
            __clearCounts.roofs = roofs.length;
            roofs.forEach(r => roofStore.remove(r.id));

            // 10. Furniture
            const furniture = furnitureStore.getAll();
            __clearCounts.furniture = furniture.length;
            furniture.forEach(f => furnitureStore.remove(f.id));

            // 11. Handrails
            const handrails = handrailStore.getAll();
            __clearCounts.handrails = handrails.length;
            handrails.forEach(h => handrailStore.remove(h.id));

            // 12. Plumbing
            const plumbing = plumbingStore.getAll();
            __clearCounts.plumbing = plumbing.length;
            plumbing.forEach(p => plumbingStore.remove(p.id));

            // 12b. Rooms
            const roomStore = ctx.stores.roomStore;
            if (roomStore) {
                const rooms = roomStore.getAll();
                __clearCounts.rooms = rooms.length;
                rooms.forEach(r => roomStore.remove(r.id));
            }

            // 12c. Room Bounding Lines (singleton store — always present)
            const rbLines = roomBoundingLineStore.getAll();
            __clearCounts.roomBoundingLines = rbLines.length;
            rbLines.forEach(rb => roomBoundingLineStore.remove(rb.id));

            // 13. Grids (remove from store AND BimManager scene objects)
            const grids = gridStore.getAll();
            __clearCounts.grids = grids.length;
            grids.forEach(g => {
                gridStore.remove(g.id);
                if (typeof (ctx.bimManager as any).removeGrid === 'function') {
                    (ctx.bimManager as any).removeGrid(g.id);
                }
            });

            // 14. Levels (reverse order to avoid dependency issues)
            // §CLEAR-PROJECT-BATCH — each removeLevel fires `bim-level-removed`, which
            // SpatialTree now coalesces to ONE tree rebuild for the whole burst (was one
            // full rebuild per level = 40× on a 40-storey teardown).
            const levels = wallStore.getLevels().slice().reverse();
            __clearCounts.levels = levels.length;
            levels.forEach(l => ctx.bimManager.removeLevel(l.id));

            // 15. Reset semantic tag index (Phase A — clears all tags with the project)
            semanticIndex.reset();

            // 16. Reset ViewDefinition store (Phase B — clears all views with the project)
            viewDefinitionStore.reset();

            // 17. Reset VisibilityRule engine (Phase C — clears all rules with the project)
            visibilityRuleEngine.reset();

            // 18a. Reset Sheet store (Phase III — clears all sheets with the project)
            sheetStore.reset();

            // 18b. Reset Schedule store (Phase III — clears all schedules with the project)
            //      Re-seed immediately so built-in schedules are always present for new projects.
            //      (EngineBootstrap only runs once; it cannot re-seed after this reset.)
            scheduleStore.reset();
            scheduleStore.seedDefaultSchedules();

            // 18c. Clear Annotation store (§ANN-A2 — clears all annotations + dimensions)
            annotationStore.clear();

            // 18d. Clear per-engine FloorStore (was missing — see Contract 45 §2).
            const floorStore = (ctx.stores as any).floorStore;
            if (floorStore && typeof floorStore.clear === 'function') {
                __clearCounts.floors = floorStore.getAll?.().length ?? 0;
                floorStore.clear();
            }

            // 18e. Contract 45 — clear EVERY module-singleton store registered in
            //      ProjectScopeRegistry. This closes the historical gap between
            //      ProjectSerializer (~34 stores) and the hand-written list above
            //      (~16 stores). Stores covered include: ifcModelStore, dxfOverlayStore,
            //      vgGovernanceStore, visibilityIntentStore, viewIntentInstanceStore,
            //      hierarchyStore, templateStore, templateAssignmentStore,
            //      elementCodeStore, semanticGraphManager, temporalGraphManager,
            //      decisionRecordStore, lifecycleStateManager, maintenanceRecordStore,
            //      requirementStore, assetCatalogStore, doorStore, windowStore,
            //      and the four *SystemTypeStores. See docs/02-decisions/contracts/45-*.md.
            const report = projectScopeRegistry.clearAll();
            __clearCounts.scopeStores = report.cleared.length;
            if (report.failures.length) {
                console.error(`[ClearProjectCommand] ${report.failures.length} scope clear failures:`, report.failures);
            }
            projectScopeRegistry.reseedAll();

            // 19. §C13-G3: Reset activeLevelId to the universal default 'L0'.
            //     ClearProjectCommand removes ALL levels from BimManager (step 14 above),
            //     so any non-default activeLevelId (e.g. 'L-10-1777891581763-10' from a
            //     multi-storey Project A) becomes a dangling reference.  Tools that read
            //     activeLevelId (WallTool.getWorldPoint, FurnitureDragDropHandler, etc.)
            //     would look up a level that no longer exists and abort silently.
            //     Resetting here — before 'bim-project-cleared' fires — ensures every
            //     downstream listener and the subsequently loaded project start with a
            //     valid, universally present level context.
            projectContext.activeLevelId = 'L0';

            // 20. Signal platform shell and any other listeners
            _bus.emit('bim-project-cleared', {}); // F.events.17

            // §CLEAR-PROJECT-BATCH — ONE summary line for the whole teardown (was one
            // log per store category + one per removed stair/level). activeLevelId reset
            // to L0 is included so the C13-G3 reset stays observable in the log.
            const __dtMs = ((typeof performance !== 'undefined') ? performance.now() : Date.now()) - __t0;
            const __total = Object.values(__clearCounts).reduce((a, b) => a + b, 0);
            console.log(
                `[ClearProjectCommand] §CLEAR-PROJECT-BATCH clear complete in ${__dtMs.toFixed(1)}ms ` +
                `(${__total} elements, activeLevelId→L0):`,
                __clearCounts,
            );
        } catch (err) {
            console.error('[ClearProjectCommand] Error during clear:', err);
            return { success: false, affectedElementIds: [], error: String(err) };
        }

        return { success: true, affectedElementIds: [] };
            },
        );
        return __clearResult;
    }

    undo(_ctx: CommandContext): CommandResult {
        // ClearProject is not undoable — always issued before a full snapshot load
        return { success: false, affectedElementIds: [], info: ['ClearProject is not undoable'] };
    }

    serialize(): SerializedCommand {
        return {
            type: this.type,
            timestamp: this.timestamp,
            targetIds: this.targetIds,
            payload: {},
            version: 1
        };
    }
}
