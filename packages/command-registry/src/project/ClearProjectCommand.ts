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
import { annotationStore } from '@pryzm/plugin-annotations';
import { projectScopeRegistry } from '@pryzm/core-app-model';
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

        console.group('[ClearProjectCommand] Clearing all project data');

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
                console.log(`  Removing ${panels.length} curtain panels`);
                panels.forEach(p => curtainPanelStore.remove(p.id));
            }

            // 2. Standalone openings (slab openings)
            const openings = openingStore.getAll();
            console.log(`  Removing ${openings.length} openings`);
            openings.forEach(o => openingStore.remove(o.id));

            // 3. Walls (embedded window/door openings cascade automatically)
            const walls = wallStore.getAll();
            console.log(`  Removing ${walls.length} walls`);
            walls.forEach(w => wallStore.remove(w.id));

            // 4. Curtain walls
            const curtainWalls = curtainWallStore.getAll();
            console.log(`  Removing ${curtainWalls.length} curtain walls`);
            curtainWalls.forEach(c => curtainWallStore.remove(c.id));

            // 5. Slabs
            const slabs = slabStore.getAll();
            console.log(`  Removing ${slabs.length} slabs`);
            slabs.forEach(s => slabStore.remove(s.id));

            // 5b. Ceilings
            if (ceilingStore) {
                const ceilings = ceilingStore.getAll();
                console.log(`  Removing ${ceilings.length} ceilings`);
                ceilings.forEach(c => ceilingStore.remove(c.id));
            }

            // 6. Columns
            const columns = columnStore.getAll();
            console.log(`  Removing ${columns.length} columns`);
            columns.forEach(c => columnStore.remove(c.id));

            // 7. Beams
            const beams = beamStore.getAll();
            console.log(`  Removing ${beams.length} beams`);
            beams.forEach(b => beamStore.remove(b.id));

            // 8. Stairs
            const stairs = stairStore.getAll();
            console.log(`  Removing ${stairs.length} stairs`);
            stairs.forEach(s => stairStore.remove(s.id));

            // 9. Roofs
            const roofs = roofStore.getAll();
            console.log(`  Removing ${roofs.length} roofs`);
            roofs.forEach(r => roofStore.remove(r.id));

            // 10. Furniture
            const furniture = furnitureStore.getAll();
            console.log(`  Removing ${furniture.length} furniture items`);
            furniture.forEach(f => furnitureStore.remove(f.id));

            // 11. Handrails
            const handrails = handrailStore.getAll();
            console.log(`  Removing ${handrails.length} handrails`);
            handrails.forEach(h => handrailStore.remove(h.id));

            // 12. Plumbing
            const plumbing = plumbingStore.getAll();
            console.log(`  Removing ${plumbing.length} plumbing fixtures`);
            plumbing.forEach(p => plumbingStore.remove(p.id));

            // 12b. Rooms
            const roomStore = ctx.stores.roomStore;
            if (roomStore) {
                const rooms = roomStore.getAll();
                console.log(`  Removing ${rooms.length} rooms`);
                rooms.forEach(r => roomStore.remove(r.id));
            }

            // 12c. Room Bounding Lines (singleton store — always present)
            const rbLines = roomBoundingLineStore.getAll();
            console.log(`  Removing ${rbLines.length} room bounding lines`);
            rbLines.forEach(rb => roomBoundingLineStore.remove(rb.id));

            // 13. Grids (remove from store AND BimManager scene objects)
            const grids = gridStore.getAll();
            console.log(`  Removing ${grids.length} grids`);
            grids.forEach(g => {
                gridStore.remove(g.id);
                if (typeof (ctx.bimManager as any).removeGrid === 'function') {
                    (ctx.bimManager as any).removeGrid(g.id);
                }
            });

            // 14. Levels (reverse order to avoid dependency issues)
            const levels = wallStore.getLevels().slice().reverse();
            console.log(`  Removing ${levels.length} levels`);
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
            console.log('[ClearProjectCommand] Annotation store cleared');

            // 18d. Clear per-engine FloorStore (was missing — see Contract 45 §2).
            const floorStore = (ctx.stores as any).floorStore;
            if (floorStore && typeof floorStore.clear === 'function') {
                const count = floorStore.getAll?.().length ?? 0;
                floorStore.clear();
                console.log(`  Cleared ${count} floors`);
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
            console.log(`[ClearProjectCommand] ProjectScopeRegistry cleared ${report.cleared.length} scopes:`, report.cleared);
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
            console.log('[ClearProjectCommand] activeLevelId reset to L0 (project-scoped state cleared).');

            // 20. Signal platform shell and any other listeners
            _bus.emit('bim-project-cleared', {}); // F.events.17

            console.log('[ClearProjectCommand] Clear complete');
        } catch (err) {
            console.error('[ClearProjectCommand] Error during clear:', err);
            return { success: false, affectedElementIds: [], error: String(err) };
        }

        console.groupEnd();
        return { success: true, affectedElementIds: [] };
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
