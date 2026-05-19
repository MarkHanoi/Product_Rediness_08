/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command (NEW FILE)
 * Phase:             PROJECT-LOAD-PERFORMANCE-13 §2 — Phase 1
 *                    "Single ImportProjectCommand fast load path"
 * Files Modified:    ImportProjectCommand.ts (new)
 *                    ProjectLoader.ts (dispatch site behind feature flag)
 *                    types.ts             (added CommandType.IMPORT_PROJECT)
 * Classification:    B (performance enhancement — no semantic model changes)
 *
 * Impact Assessment:
 *   Semantic Impact:     No — element creation semantics are unchanged.
 *                        Each per-element CreateXCommand is still constructed
 *                        and its execute() is still invoked; this command merely
 *                        replaces the per-element CommandManager.execute() round
 *                        trip with a direct in-line call.
 *   Constraint Impact:   No
 *   Undo/Redo Impact:    Yes — replaces N per-element history entries with a
 *                        single ImportProjectCommand audit-stack entry. The
 *                        command itself is `nonUndoable` because:
 *                          (a) Contract 20 GAP-3 — ProjectLoader explicitly
 *                              calls commandManager.clearHistory() at the end
 *                              of every load, so the entry is dropped anyway;
 *                          (b) the upstream CommandManager.execute() fast path
 *                              (`isLoad`) skips the undo-stack push entirely
 *                              for PROJECT_LOAD-sourced commands.
 *                        Either path keeps the user-visible undo history empty
 *                        immediately after a project open, matching today's
 *                        behaviour exactly.
 *   Store Registry Impact: Indirect — declares all element-store keys in
 *                          `affectedStores` so the (already-skipped) snapshot
 *                          scope is correct should this command ever be invoked
 *                          outside of the PROJECT_LOAD source.
 *   Event Bus Impact:    Improved — the outer ProjectLoader still wraps the
 *                        whole load body in storeEventBus.beginBatch() /
 *                        endBatch(), so builders flush exactly once. This
 *                        command does not open or close any batches.
 *
 * Risk Level:   Medium.  We replace a hot path that has been hardened over
 *               many sprints.  Mitigations:
 *                 - Default-on feature flag (PRYZM_USE_IMPORT_COMMAND) with a
 *                   localStorage runtime override and a Vite env override so
 *                   the legacy per-command path can be re-enabled without code
 *                   changes if a regression is found.
 *                 - Sub-command construction, validation and execution call
 *                   sites are byte-identical to those previously inlined in
 *                   ProjectLoader (see _runStepN methods) so element creation
 *                   semantics are preserved.
 *                 - Cancellation predicate is checked between each step so a
 *                   project switch mid-import behaves as before.
 *
 * Rationale:
 *   Per docs/PROJECT-LOAD-PERFORMANCE-13-PHASE-IMPLEMENTATION-PLAN.md §2 +
 *   §18.2 (Phase 1 adjustments), the realistic Phase-1 win is no longer the
 *   per-command structuredClone (which the PROJECT_LOAD fast path in
 *   CommandManager already skips since CommandManager.ts L70-101) nor the
 *   per-builder fan-out (which storeEventBus.beginBatch already collapses
 *   into a single endBatch flush since ProjectLoader.ts L248).
 *
 *   What remains, and what this command removes, is the per-element overhead
 *   of routing every CreateXCommand through CommandManager.execute():
 *     - One try/catch + result-construction allocation per element.
 *     - One commandExecutedCallbacks fan-out per element (PropertyInspector
 *       and other Contract 31.7 listeners would otherwise re-render N times
 *       for every project open).
 *     - One audit-stack history entry per element (already gated behind
 *       `isLoad` but still allocated in the legacy code path).
 *
 *   Replacing N CommandManager round trips with one ImportProjectCommand
 *   wrapper preserves all per-element semantics while reducing the load to
 *   exactly one CommandManager dispatch and one callback fan-out.
 */

import {
    Command, CommandType, CommandValidationResult,
    CommandResult, SerializedCommand, CommandContext,
} from '../types';
import type { ProjectSnapshot } from '@pryzm/core-app-model';
import {
    findOpeningElementData,
    migrateRoofSnapshotToCommand,
} from './projectLoaderUtils';
import { ClearProjectCommand } from './ClearProjectCommand';
import { AddLevelCommand } from '../levels/AddLevelCommand';
import { AddGridCommand } from '../grids/AddGridCommand';
import { CreateColumnCommand } from '../columns/CreateColumnCommand';
import { CreateWallCommand } from '../walls/CreateWallCommand';
import { CreateWallOpeningCommand } from '../walls/CreateWallOpeningCommand';
import { CreateSlabCommand } from '../slabs/CreateSlabCommand';
import { CreateCeilingCommand } from '../ceilings/CreateCeilingCommand';
import { CreateFloorCommand } from '../floors/CreateFloorCommand';
import { CreateStairCommand } from '../stair/CreateStairCommand';
import { CreateFurnitureCommand } from '../furniture/CreateFurnitureCommand';
import { CreateHandrailCommand } from '../handrails/CreateHandrailCommand';
import { CreatePlumbingFixtureCommand } from '../plumbing/CreatePlumbingFixtureCommand';
import { CreateCurtainWallCommand } from '../curtainwall/CreateCurtainWallCommand';
import { CreateBeamCommand } from '../beam/CreateBeamCommand';
import { BatchCreateRoomsCommand } from '../rooms/BatchCreateRoomsCommand';
import { CreateRoomBoundingLineCommand } from '../roomBoundingLines/CreateRoomBoundingLineCommand';
import { deserializeRoom } from '@pryzm/room-topology';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';

/**
 * Mutable bookkeeping owned by the command and read by the caller after
 * `execute()` returns.  Mirrors the LoadResult counters that ProjectLoader
 * historically populated inline.
 */
export interface ImportProjectStats {
    loaded: number;
    failed: number;
    errors: string[];
    warnings: string[];
    /**
     * Set of level IDs that successfully landed in the BimManager during this
     * import.  Returned to the caller so the post-load REDETECT_ROOMS sweep
     * fires only for levels that actually have geometry (matches the legacy
     * behaviour at ProjectLoader.ts ~L1257).
     */
    loadedLevelIds: Set<string>;
}

export interface ImportProjectCommandOptions {
    /**
     * Predicate consulted between major steps so the caller can abort an
     * in-flight load when the user switches projects.  Defaults to a
     * never-cancel predicate, matching the legacy ProjectLoader signature.
     */
    isCancelled?: () => boolean;
}

export class ImportProjectCommand implements Command {
    /**
     * Declare every element-store key the per-element sub-commands may touch.
     * The PROJECT_LOAD fast path in CommandManager skips snapshot creation
     * entirely, so this declaration is mostly defensive — it ensures that if
     * this command is ever dispatched outside of PROJECT_LOAD (e.g. by a
     * future migration tool) the scoped snapshot remains correct rather than
     * defaulting to ALL legacy stores.
     *
     * Keys correspond to StoreRegistry registrations.  Order does not matter.
     */
    readonly affectedStores = [
        'wall', 'slab', 'level', 'column', 'beam', 'roof', 'curtainWall',
        'furniture', 'handrail', 'stair', 'door', 'window',
        // Optional element stores (registered by their owning modules):
        // 'ceiling', 'floor', 'opening', 'plumbing', 'room',
        // 'roomBoundingLine', 'grid' — not yet StoreKeys but enumerated here
        // so future StoreRegistry expansion picks them up automatically.
    ] as const;

    readonly id = crypto.randomUUID();
    readonly type = CommandType.IMPORT_PROJECT;
    readonly timestamp = Date.now();
    readonly targetIds: string[] = [];

    /**
     * The undo path is intentionally a no-op:
     *   1. CommandManager's PROJECT_LOAD fast path (CommandManager.ts L94-127)
     *      skips both snapshot creation and the undo-history push, so this
     *      command never lands on the undo stack when invoked correctly.
     *   2. ProjectLoader explicitly calls commandManager.clearHistory() at the
     *      end of every load (Contract 20 GAP-3) so any stale entries are
     *      removed regardless.
     *   3. The natural way to "undo" a load is to open a different snapshot,
     *      which begins with ClearProjectCommand and replays the new state.
     *
     * `nonUndoable=true` makes that contract explicit at the type level.
     */
    readonly nonUndoable = true;

    /**
     * Public mutable counter bag.  Populated by `execute()`; the caller
     * (ProjectLoader) reads it after dispatch to assemble its LoadResult.
     */
    public readonly stats: ImportProjectStats = {
        loaded: 0,
        failed: 0,
        errors: [],
        warnings: [],
        loadedLevelIds: new Set<string>(),
    };

    constructor(
        private readonly snapshot: ProjectSnapshot,
        private readonly opts: ImportProjectCommandOptions = {},
    ) {}

    canExecute(_ctx: CommandContext): CommandValidationResult {
        if (!this.snapshot) {
            return { ok: false, reason: 'ImportProjectCommand requires a non-null ProjectSnapshot' };
        }
        if (!Array.isArray(this.snapshot.levels)) {
            return { ok: false, reason: 'ProjectSnapshot.levels must be an array' };
        }
        return { ok: true };
    }

    execute(ctx: CommandContext): CommandResult {
        const snapshot   = this.snapshot;
        const stats      = this.stats;
        const isCancel   = this.opts.isCancelled ?? (() => false);

        /**
         * Run a sub-command without going through CommandManager.
         *
         * The PROJECT_LOAD fast path in CommandManager already skips snapshot,
         * undo push, and verbose logging.  The remaining per-call overhead it
         * imposes is:
         *   - constructing a `validation` object,
         *   - allocating a `result` object on success,
         *   - fanning out commandExecutedCallbacks (Contract 31.7) once per
         *     sub-command — for N elements this is N PropertyInspector
         *     refreshes.
         *
         * By calling cmd.execute(ctx) directly we keep validation (the
         * sub-command's own `canExecute` is the source of truth for element
         * shape) but collapse the N callback fan-outs into the single
         * fan-out fired by CommandManager when *this* outer command resolves.
         *
         * Errors are caught locally and turned into a non-fatal CommandResult
         * so that one bad element does not abort the entire import — the
         * legacy ProjectLoader path used the same recover-and-continue model.
         */
        const runSub = (cmd: Command): CommandResult => {
            try {
                const validation = cmd.canExecute(ctx);
                if (!validation.ok) {
                    return {
                        success: false,
                        affectedElementIds: [],
                        info: [validation.reason ?? 'Sub-command validation failed'],
                    };
                }
                return cmd.execute(ctx);
            } catch (err) {
                return {
                    success: false,
                    affectedElementIds: [],
                    error: err instanceof Error ? err.message : String(err),
                };
            }
        };

        const recordFail = (label: string, r: CommandResult) => {
            stats.failed++;
            const msg = `${label}: ${r.error ?? r.info?.join(', ') ?? 'failed'}`;
            stats.errors.push(msg);
            console.warn(`[ImportProjectCommand] Failed: ${msg}`);
        };

        try {
            // ── Step 0: Clear current project ────────────────────────────────
            // ClearProjectCommand resets every element store, the
            // ElementRegistry, the SemanticIndex, the visibility caches, etc.
            // It must run inside the outer storeEventBus batch (the caller
            // opened it) so the bim-X-cleared events are buffered ahead of
            // the bim-X-added events that follow.
            const clearResult = runSub(new ClearProjectCommand());
            if (!clearResult.success) {
                const msg = 'ClearProjectCommand failed: ' + (clearResult.error ?? 'unknown');
                stats.errors.push(msg);
                return { success: false, affectedElementIds: [], error: msg };
            }

            if (isCancel()) {
                return { success: false, affectedElementIds: [], info: ['Cancelled before levels'] };
            }

            // ── Step 1: Levels (PlanOrdering priority 10) ────────────────────
            console.log(`[ImportProjectCommand] Loading ${snapshot.levels.length} levels`);
            for (const level of snapshot.levels) {
                // Skip levels the BimManager already created (typically L0).
                const existing = ctx.bimManager.getLevelById(level.id);
                if (existing) {
                    stats.warnings.push(`Level ${level.id} already exists — skipped`);
                    stats.loadedLevelIds.add(level.id);
                    continue;
                }
                const cmd = new AddLevelCommand({
                    levelId:   level.id,
                    name:      level.name,
                    elevation: level.elevation,
                    height:    level.height ?? 3.0,
                });
                const r = runSub(cmd);
                if (r.success) {
                    stats.loaded++;
                    stats.loadedLevelIds.add(level.id);
                } else {
                    recordFail(`Level ${level.id}`, r);
                }
            }

            if (isCancel()) {
                return { success: false, affectedElementIds: [], info: ['Cancelled before grids'] };
            }

            // ── Step 2: Grids (PlanOrdering priority 11) ─────────────────────
            console.log(`[ImportProjectCommand] Loading ${snapshot.grids.length} grids`);
            for (const grid of snapshot.grids) {
                const cmd = new AddGridCommand({
                    gridId:      grid.id,
                    orientation: grid.axis as 'X' | 'Y',
                    position:    grid.position,
                    name:        grid.name,
                });
                const r = runSub(cmd);
                r.success ? stats.loaded++ : recordFail(`Grid ${grid.id}`, r);
            }

            if (isCancel()) {
                return { success: false, affectedElementIds: [], info: ['Cancelled before columns'] };
            }

            // ── Step 3: Columns (priority 15) ────────────────────────────────
            console.log(`[ImportProjectCommand] Loading ${snapshot.columns.length} columns`);
            for (const col of snapshot.columns) {
                const cmd = new CreateColumnCommand({
                    id:         col.id,
                    position:   col.position,
                    height:     col.height,
                    rotation:   col.rotation ?? 0,
                    profile:    col.profile ?? 'rectangular',
                    width:      col.width,
                    depth:      col.depth,
                    baseOffset: col.baseOffset ?? 0,
                    levelId:    col.levelId,
                    materialId: col.materialId,
                });
                const r = runSub(cmd);
                r.success ? stats.loaded++ : recordFail(`Column ${col.id}`, r);
            }

            if (isCancel()) {
                return { success: false, affectedElementIds: [], info: ['Cancelled before walls'] };
            }

            // ── B7b: Restore DoorStore / WindowStore from rich snapshot data ──
            // Done BEFORE walls so CreateWallOpeningCommand's `!doorStore.has()`
            // guard prevents duplicate insertion on redo.  ClearProjectCommand
            // does not know about these stores, so we clear them explicitly
            // here.
            doorStore.clear();
            windowStore.clear();
            if (Array.isArray(snapshot.doors) && snapshot.doors.length > 0) {
                for (const d of snapshot.doors) {
                    try { doorStore.add(d); }
                    catch (err) { console.warn('[ImportProjectCommand] Skipping invalid door record:', err); }
                }
                console.log(`[ImportProjectCommand] Restored ${snapshot.doors.length} door records from snapshot`);
            }
            if (Array.isArray(snapshot.windows) && snapshot.windows.length > 0) {
                for (const w of snapshot.windows) {
                    try { windowStore.add(w); }
                    catch (err) { console.warn('[ImportProjectCommand] Skipping invalid window record:', err); }
                }
                console.log(`[ImportProjectCommand] Restored ${snapshot.windows.length} window records from snapshot`);
            }

            // ── Step 4: Walls + per-wall openings (priority 20) ──────────────
            console.log(`[ImportProjectCommand] Loading ${snapshot.walls.length} walls`);
            for (const wall of snapshot.walls) {
                const bl = wall.baseLine;
                const cmd = new CreateWallCommand(wall.id, {
                    start:         { x: bl[0].x, z: bl[0].z },
                    end:           { x: bl[1].x, z: bl[1].z },
                    height:        wall.height,
                    thickness:     wall.thickness,
                    levelId:       wall.levelId,
                    baseOffset:    wall.baseOffset,
                    materialId:    wall.materialId,
                    materialColor: wall.materialColor,
                    curve:         wall.curve,
                    systemTypeId:  wall.systemTypeId,
                });
                const r = runSub(cmd);
                if (r.success) {
                    stats.loaded++;
                    if (Array.isArray(wall.openings) && wall.openings.length > 0) {
                        for (const opening of wall.openings) {
                            const elementData = findOpeningElementData(snapshot, opening);
                            const openingCmd = new CreateWallOpeningCommand({
                                wallId: wall.id,
                                openingData: { ...opening, ...elementData },
                            });
                            const or = runSub(openingCmd);
                            or.success ? stats.loaded++ : recordFail(`Opening ${opening.id}`, or);
                        }
                    }
                } else {
                    recordFail(`Wall ${wall.id}`, r);
                }
            }

            if (isCancel()) {
                return { success: false, affectedElementIds: [], info: ['Cancelled before slabs'] };
            }

            // ── Step 5: Slabs (priority 21) ──────────────────────────────────
            console.log(`[ImportProjectCommand] Loading ${snapshot.slabs.length} slabs`);
            for (const slab of snapshot.slabs) {
                const cmd = new CreateSlabCommand({
                    id:        slab.id,
                    width:     slab.width,
                    depth:     slab.depth,
                    thickness: slab.thickness,
                    position:  slab.position,
                    levelId:   slab.levelId,
                    polygon:   slab.polygon,
                    holes:     slab.holes,
                    sketch:    slab.sketch,
                });
                const r = runSub(cmd);
                r.success ? stats.loaded++ : recordFail(`Slab ${slab.id}`, r);
            }

            // ── Step 5b: Ceilings (priority 21.5) ────────────────────────────
            const snapshotCeilings = (snapshot as any).ceilings;
            if (Array.isArray(snapshotCeilings) && snapshotCeilings.length > 0) {
                console.log(`[ImportProjectCommand] Loading ${snapshotCeilings.length} ceilings`);
                for (const ceiling of snapshotCeilings) {
                    try {
                        const cmd = new CreateCeilingCommand({
                            ceilingId:    ceiling.id ?? crypto.randomUUID(),
                            ifcGuid:      ceiling.ifcGuid ?? ceiling.ifc?.guid ?? crypto.randomUUID(),
                            levelId:      ceiling.levelId,
                            polygon:      ceiling.polygon,
                            height:       ceiling.height,
                            thickness:    ceiling.thickness,
                            baseOffset:   ceiling.baseOffset,
                            systemTypeId: ceiling.systemTypeId,
                            label:        ceiling.label,
                            layers:       ceiling.layers,
                            finishSpec:   ceiling.finishSpec,
                            holeElements: ceiling.holeElements,
                            createdBy:    ceiling.createdBy,
                        });
                        const r = runSub(cmd);
                        r.success ? stats.loaded++ : recordFail(`Ceiling ${ceiling.id}`, r);
                    } catch (e) {
                        recordFail(`Ceiling ${ceiling.id ?? '?'}`,
                            { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
            }

            // ── Step 5c: Floor finishes (priority 21.8) ──────────────────────
            const snapshotFloors = (snapshot as any).floors;
            if (Array.isArray(snapshotFloors) && snapshotFloors.length > 0) {
                console.log(`[ImportProjectCommand] Loading ${snapshotFloors.length} floor finishes`);
                for (const floor of snapshotFloors) {
                    try {
                        const cmd = new CreateFloorCommand({
                            floorId:      floor.id ?? crypto.randomUUID(),
                            ifcGuid:      floor.ifcGuid ?? floor.ifcData?.guid ?? crypto.randomUUID(),
                            levelId:      floor.levelId,
                            polygon:      floor.boundary?.polygon ?? floor.polygon,
                            baseOffset:   floor.boundary?.baseOffset ?? floor.baseOffset ?? 0,
                            thickness:    floor.boundary?.thickness ?? floor.thickness ?? 0.075,
                            systemTypeId: floor.systemTypeId,
                            label:        floor.label,
                            layers:       floor.layers,
                            finishSpec:   floor.finishSpec,
                            serviceHoles: floor.serviceHoles,
                            hostSlabId:   floor.hostSlabId,
                            createdBy:    floor.metadata?.createdBy ?? floor.createdBy ?? 'project-load',
                        });
                        const r = runSub(cmd);
                        r.success ? stats.loaded++ : recordFail(`Floor ${floor.id}`, r);
                    } catch (e) {
                        recordFail(`Floor ${floor.id ?? '?'}`,
                            { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
            }

            if (isCancel()) {
                return { success: false, affectedElementIds: [], info: ['Cancelled before stairs'] };
            }

            // ── Step 6: Stairs (priority 22) ─────────────────────────────────
            console.log(`[ImportProjectCommand] Loading ${snapshot.stairs.length} stairs`);
            for (const stair of snapshot.stairs) {
                try {
                    const cmd = new CreateStairCommand({
                        baseLevelId:       stair.baseLevelId,
                        topLevelId:        stair.topLevelId,
                        shape:             stair.shape,
                        riserHeight:       stair.riserHeight,
                        treadDepth:        stair.treadDepth,
                        width:             stair.width,
                        startPosition:     stair.startPosition ?? { x: 0, y: 0, z: 0 },
                        flights:           stair.flights ?? [],
                        landings:          stair.landings,
                        fireRating:        stair.fireRating,
                        accessibilityType: stair.accessibilityType,
                    });
                    const r = runSub(cmd);
                    r.success ? stats.loaded++ : recordFail(`Stair ${stair.id}`, r);
                } catch (e) {
                    recordFail(`Stair ${stair.id}`,
                        { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            if (isCancel()) {
                return { success: false, affectedElementIds: [], info: ['Cancelled before furniture'] };
            }

            // ── Step 7: Furniture (priority 23) ──────────────────────────────
            console.log(`[ImportProjectCommand] Loading ${snapshot.furniture.length} furniture items`);
            for (const f of snapshot.furniture) {
                try {
                    const cmd = new CreateFurnitureCommand({
                        id:                    f.id,
                        furnitureType:         f.furnitureType,
                        position:              f.position,
                        rotation:              f.rotation,
                        levelId:               f.levelId,
                        baseOffset:            f.baseOffset ?? 0.2,
                        width:                 f.width,
                        length:                f.length,
                        height:                f.height,
                        widthBranchTwo:        f.widthBranchTwo,
                        lengthBranchTwo:       f.lengthBranchTwo,
                        widthMain:             f.widthMain,
                        lengthSide:            f.lengthSide,
                        seatDepthMain:         f.seatDepthMain,
                        seatDepthSide:         f.seatDepthSide,
                        material:              f.material ?? 'wood',
                        color:                 f.color,
                        hasHeadboard:          f.hasHeadboard,
                        lo3:                   f.lo3,
                        startPoint:            f.startPoint,
                        cornerPoint:           f.cornerPoint,
                        endPoint:              f.endPoint,
                        wardrobeConfig:        f.wardrobeConfig,
                        // RUN-config restore (mirrors ProjectLoader §Step 7
                        // Contract 13 §2 — the FurnitureFactory throws without
                        // these for kitchen / wardrobe RUN groups).
                        kitchenConfig:         f.kitchenConfig,
                        wardrobeCabinetConfig: f.wardrobeCabinetConfig,
                        furnitureCategory:     f.furnitureCategory,
                        metadata:              f.metadata,
                    });
                    const r = runSub(cmd);
                    r.success ? stats.loaded++ : recordFail(`Furniture ${f.id}`, r);
                } catch (e) {
                    recordFail(`Furniture ${f.id}`,
                        { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            if (isCancel()) {
                return { success: false, affectedElementIds: [], info: ['Cancelled before roofs'] };
            }

            // ── Step 8: Roofs (priority 24) ──────────────────────────────────
            console.log(`[ImportProjectCommand] Loading ${snapshot.roofs.length} roofs`);
            for (const roof of snapshot.roofs) {
                const cmd = migrateRoofSnapshotToCommand(roof);
                if (!cmd) {
                    recordFail(`Roof ${roof.id}`,
                        { success: false, affectedElementIds: [], error: 'Failed to build roof command from snapshot' });
                    continue;
                }
                const r = runSub(cmd);
                r.success ? stats.loaded++ : recordFail(`Roof ${roof.id}`, r);
            }

            if (isCancel()) {
                return { success: false, affectedElementIds: [], info: ['Cancelled before handrails'] };
            }

            // ── Step 9: Handrails (priority 25) ──────────────────────────────
            console.log(`[ImportProjectCommand] Loading ${snapshot.handrails.length} handrails`);
            for (const hr of snapshot.handrails) {
                const bl = hr.baseLine;
                const cmd = new CreateHandrailCommand({
                    id:         hr.id,
                    start:      { x: bl[0].x, z: bl[0].z },
                    end:        { x: bl[1].x, z: bl[1].z },
                    height:     hr.height,
                    thickness:  hr.thickness,
                    levelId:    hr.levelId,
                    baseOffset: hr.baseOffset,
                });
                const r = runSub(cmd);
                r.success ? stats.loaded++ : recordFail(`Handrail ${hr.id}`, r);
            }

            if (isCancel()) {
                return { success: false, affectedElementIds: [], info: ['Cancelled before plumbing'] };
            }

            // ── Step 10: Plumbing (priority 25) ──────────────────────────────
            console.log(`[ImportProjectCommand] Loading ${snapshot.plumbing.length} plumbing fixtures`);
            for (const p of snapshot.plumbing) {
                try {
                    const cmd = new CreatePlumbingFixtureCommand({
                        id:            p.id,
                        fixtureType:   p.fixtureType,
                        toiletVariant: p.toiletVariant,
                        position:      p.position,
                        rotation:      p.rotation,
                        levelId:       p.levelId,
                        baseOffset:    p.baseOffset ?? 0,
                        width:         p.width,
                        height:        p.height,
                        length:        p.length,
                        color:         p.color,
                        startPoint:    p.startPoint,
                        endPoint:      p.endPoint,
                    });
                    const r = runSub(cmd);
                    r.success ? stats.loaded++ : recordFail(`Plumbing ${p.id}`, r);
                } catch (e) {
                    recordFail(`Plumbing ${p.id}`,
                        { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            if (isCancel()) {
                return { success: false, affectedElementIds: [], info: ['Cancelled before curtain walls'] };
            }

            // ── Step 11: Curtain walls (priority 26) ─────────────────────────
            console.log(`[ImportProjectCommand] Loading ${snapshot.curtainWalls.length} curtain walls`);
            for (const cw of snapshot.curtainWalls) {
                try {
                    const bl = cw.baseLine;
                    const cmd = new CreateCurtainWallCommand({
                        id:           cw.id,
                        start:        { x: bl[0].x, z: bl[0].z },
                        end:          { x: bl[1].x, z: bl[1].z },
                        height:       cw.height,
                        levelId:      cw.levelId,
                        baseOffset:   cw.baseOffset,
                        gridXSpacing: cw.gridXSpacing,
                        gridYSpacing: cw.gridYSpacing,
                    });
                    const r = runSub(cmd);
                    r.success ? stats.loaded++ : recordFail(`CurtainWall ${cw.id}`, r);
                } catch (e) {
                    recordFail(`CurtainWall ${cw.id}`,
                        { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            if (isCancel()) {
                return { success: false, affectedElementIds: [], info: ['Cancelled before beams'] };
            }

            // ── Step 12: Beams (priority 30) ─────────────────────────────────
            console.log(`[ImportProjectCommand] Loading ${snapshot.beams.length} beams`);
            for (const b of snapshot.beams) {
                try {
                    const cmd = new CreateBeamCommand({
                        startPoint:  b.startPoint,
                        endPoint:    b.endPoint,
                        width:       b.width,
                        depth:       b.depth,
                        levelId:     b.levelId,
                        material:    b.material,
                        loadBearing: b.loadBearing,
                        fireRating:  b.fireRating,
                    });
                    const r = runSub(cmd);
                    r.success ? stats.loaded++ : recordFail(`Beam ${b.id}`, r);
                } catch (e) {
                    recordFail(`Beam ${b.id}`,
                        { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            // ── Step 13: Rooms (priority 31 — after walls for boundary accuracy) ──
            const snapshotRooms = (snapshot as any).rooms;
            if (Array.isArray(snapshotRooms) && snapshotRooms.length > 0) {
                console.log(`[ImportProjectCommand] Loading ${snapshotRooms.length} rooms`);
                const hydrated: any[] = [];
                for (const raw of snapshotRooms) {
                    try {
                        hydrated.push(deserializeRoom(raw));
                    } catch (e) {
                        recordFail(`Room ${raw.id ?? '?'}`,
                            { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
                if (hydrated.length > 0) {
                    const cmd = new BatchCreateRoomsCommand(hydrated);
                    const r = runSub(cmd);
                    if (r.success) {
                        stats.loaded += hydrated.length;
                    } else {
                        stats.failed += hydrated.length;
                        stats.errors.push(`Rooms batch: ${r.error ?? 'failed'}`);
                    }
                }
            }

            // ── Step 13b: Room bounding lines (priority 31.5) ────────────────
            const snapshotRoomBoundingLines = (snapshot as any).roomBoundingLines;
            if (Array.isArray(snapshotRoomBoundingLines) && snapshotRoomBoundingLines.length > 0) {
                console.log(`[ImportProjectCommand] Loading ${snapshotRoomBoundingLines.length} room bounding line(s)`);
                for (const rbl of snapshotRoomBoundingLines) {
                    try {
                        const cmd = new CreateRoomBoundingLineCommand({
                            id:        rbl.id,
                            levelId:   rbl.levelId,
                            start:     rbl.placement?.start ?? { x: 0, z: 0 },
                            end:       rbl.placement?.end   ?? { x: 1, z: 0 },
                            name:      rbl.properties?.name,
                            color:     rbl.properties?.color,
                            createdBy: rbl.metadata?.createdBy ?? 'system',
                        });
                        const r = runSub(cmd);
                        r.success ? stats.loaded++ : recordFail(`RoomBoundingLine ${rbl.id}`, r);
                    } catch (e) {
                        recordFail(`RoomBoundingLine ${rbl?.id ?? '?'}`,
                            { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
            }

            // Success means the orchestrator did not throw and Clear succeeded.
            // Per-element failures are surfaced through `stats.failed/errors`,
            // which the caller inspects to set its own LoadResult.success flag
            // (mirrors the legacy ProjectLoader: `result.errors.length === 0
            // || result.loaded > 0`).
            return { success: true, affectedElementIds: [] };

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            stats.errors.push(msg);
            console.error('[ImportProjectCommand] Fatal error during import:', err);
            return { success: false, affectedElementIds: [], error: msg };
        }
    }

    undo(_ctx: CommandContext): CommandResult {
        // See class-level comment: this command is `nonUndoable` because the
        // CommandManager fast path skips the undo push for PROJECT_LOAD and
        // ProjectLoader clears the history at the end of every load anyway.
        // Returning info (not error) keeps the API parity with
        // ClearProjectCommand which uses the same idiom.
        return {
            success: false,
            affectedElementIds: [],
            info: ['ImportProjectCommand is not undoable — open a different snapshot to revert.'],
        };
    }

    serialize(): SerializedCommand {
        // The full ProjectSnapshot is far too large to embed in the audit log
        // and is already persisted by the project-save subsystem (Contract 13
        // §1).  We record only the project name + element count so the audit
        // entry is human-readable when inspected.
        return {
            type: this.type,
            timestamp: this.timestamp,
            targetIds: this.targetIds,
            payload: {
                projectName:  this.snapshot?.projectName,
                elementCount: this.snapshot?.elementCount,
            },
            version: 1,
        };
    }
}
