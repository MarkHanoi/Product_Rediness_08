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
    dropDegeneratePolygonRecords,
    ceilingRestoreBoundaryFields,
} from './projectLoaderUtils';
import { ClearProjectCommand } from './ClearProjectCommand';
import { AddLevelCommand } from '../levels/AddLevelCommand';
import { AddGridCommand } from '../grids/AddGridCommand';
import { CreateColumnCommand } from '../columns/CreateColumnCommand';
import { CreateWallCommand } from '../walls/CreateWallCommand';
import { CreateWallOpeningCommand } from '../walls/CreateWallOpeningCommand';
import { CreateSlabCommand } from '../slabs/CreateSlabCommand';
// §L-B3 (DAILY-USE-AUDIT 2026-05-20) — standalone slab openings (stairwell cuts,
// service penetrations, etc.) are persisted by ProjectSerializer.ts:670 but
// were never restored on load: `ClearProjectCommand` cleared `openingStore`
// and `ImportProjectCommand` never read back `snapshot.openings`. After one
// autosave the field was permanently dropped. Restoring here closes the silent
// data-loss class. Same legacy-command + `runSub` pattern as every other
// element-type restoration in this file.
import { CreateOpeningCommand } from '../slabs/CreateOpeningCommand';
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
 * §LOAD-CHUNKED (2026-06-29) — elements processed between frame yields in the
 * chunked import path. A slab triangulation (the heaviest per-element work that
 * still runs synchronously on restore — walls/doors/windows are deferred by the
 * WallRebuildCoordinator restore flush) is the budget driver; ~120 keeps each
 * chunk inside a frame while keeping the number of paints modest on a typical
 * residential building (≈ 800 elements → ≈ 7 chunks/yields).
 */
export const IMPORT_CHUNK_SIZE = 120;

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
    /**
     * §LOAD-HEAL-DEGENERATE-POLYGON — set of level IDs that had at least one
     * degenerate ROOM polygon dropped during this import. The post-load
     * §LOAD-REDETECT-FREEZE skip normally suppresses redetect for any level that
     * carries persisted rooms; but a level whose (degenerate) rooms we just
     * dropped MUST be redetected so it re-seals from the join-resolved walls.
     * The caller removes these levels from the skip-set.
     */
    healedRoomLevelIds: Set<string>;
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
        healedRoomLevelIds: new Set<string>(),
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

    /**
     * Build the shared `runSub` + `recordFail` helpers used by both the
     * synchronous `execute()` driver and the chunked `executeChunked()` driver.
     * Kept as one factory so the two drivers run BYTE-IDENTICAL per-element
     * semantics — the only difference between them is *when* they yield.
     */
    private _makeHelpers(ctx: CommandContext): {
        runSub: (cmd: Command) => CommandResult;
        recordFail: (label: string, r: CommandResult) => void;
    } {
        const stats = this.stats;
        /**
         * Run a sub-command without going through CommandManager.  (See the
         * original execute() doc-block: validation is preserved, the per-element
         * CommandManager callback fan-out is collapsed to the single fan-out
         * fired when this outer command resolves.)  Errors are caught locally so
         * one bad element does not abort the import.
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
        return { runSub, recordFail };
    }

    /**
     * Synchronous import (Command-interface entry point + flag-off fallback).
     *
     * Drains the `*_orchestrate()` generator to completion WITHOUT yielding, so
     * behaviour is byte-identical to the original monolithic execute(): all
     * element creation + the synchronous geometry it drives (e.g. slab
     * triangulation via the `bim-slab-added` DOM event) runs in one JS task.
     * Used when chunked load is disabled, and for any non-load caller.
     */
    execute(ctx: CommandContext): CommandResult {
        const { runSub, recordFail } = this._makeHelpers(ctx);
        const gen = this._orchestrate(ctx, runSub, recordFail);
        let step = gen.next();
        while (!step.done) step = gen.next();      // run-to-completion, no yielding
        return step.value;
    }

    /**
     * §LOAD-CHUNKED (2026-06-29) — chunked, frame-yielding import.
     *
     * Drains the SAME `*_orchestrate()` generator as execute(), but `await`s the
     * caller-supplied `yieldFn` at every generator checkpoint (between element
     * steps and every CHUNK_SIZE elements inside the heavy slab/wall/door loops).
     * The caller (ProjectLoader) backs `yieldFn` with the frame scheduler (P3 —
     * no new rAF), so the browser PAINTS between chunks: the loading overlay and
     * partial scene stay responsive instead of freezing for the whole build.
     *
     * Per-element semantics are identical to execute() — same sub-commands, same
     * order, same stats bookkeeping. Only the cadence differs.  C11 §6.1 / line
     * 285: "batch creation geometry build MUST be spread across multiple frames
     * via the scheduler — not run as a single synchronous loop."
     */
    async executeChunked(
        ctx: CommandContext,
        yieldFn: () => Promise<void>,
    ): Promise<CommandResult> {
        const { runSub, recordFail } = this._makeHelpers(ctx);
        const gen = this._orchestrate(ctx, runSub, recordFail);
        let step = gen.next();
        while (!step.done) {
            await yieldFn();
            step = gen.next();
        }
        return step.value;
    }

    /**
     * The single source of truth for the import orchestration.  Both execute()
     * (sync) and executeChunked() (async) drive this generator; it `yield`s at
     * each step boundary and every IMPORT_CHUNK_SIZE elements inside the heavy
     * loops so the async driver can paint a frame there.  The sync driver simply
     * ignores the yields and runs straight through.
     */
    private *_orchestrate(
        ctx: CommandContext,
        runSub: (cmd: Command) => CommandResult,
        recordFail: (label: string, r: CommandResult) => void,
    ): Generator<void, CommandResult, void> {
        const snapshot   = this.snapshot;
        const stats      = this.stats;
        const isCancel   = this.opts.isCancelled ?? (() => false);
        // Elements processed between frame yields. ~120 keeps each chunk's
        // synchronous geometry (a slab triangulation is the heaviest per-element
        // cost on restore) comfortably inside a frame budget while keeping the
        // total chunk count — and thus the number of paints — modest.
        const CHUNK = IMPORT_CHUNK_SIZE;

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
            let _wallChunk = 0;
            for (const wall of snapshot.walls) {
                // §LOAD-CHUNKED — yield a frame every CHUNK walls (+ their openings)
                // so the chunked driver can paint. Wall BODIES are deferred to the
                // restore flush, but each CreateWallCommand/opening still does store +
                // registry + spatial-index work that adds up across ≈200 walls.
                if (++_wallChunk >= CHUNK) { _wallChunk = 0; yield; }
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
            let _slabChunk = 0;
            for (const slab of snapshot.slabs) {
                // §LOAD-CHUNKED — slab build (outset + triangulate) fires SYNCHRONOUSLY
                // via the `bim-slab-added` DOM event, so this is the heaviest per-element
                // work on restore. Yield a frame every CHUNK slabs so a building with many
                // floor plates does not triangulate them all in one blocking task.
                if (++_slabChunk >= CHUNK) { _slabChunk = 0; yield; }
                const cmd = new CreateSlabCommand({
                    id:        slab.id,
                    // §LOAD-FLOOD-GATE (2026-06-29) — thread the persisted IFC GUID
                    // (or mint a fresh one) so CreateSlabCommand.execute() never hits
                    // its `§2.6 C2 ifcGuid not injected` warning. On a heavy load that
                    // warning fired once PER SLAB *with a full stack trace*, adding real
                    // main-thread console cost during the hot restore loop. Threading
                    // the GUID also round-trips the IFC key (parity with the ceiling /
                    // floor / curtain-wall restores that already pass ifcGuid).
                    ifcGuid:   (slab as { ifcData?: { guid?: string } }).ifcData?.guid ?? crypto.randomUUID(),
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
            // §LOAD-HEAL-DEGENERATE-POLYGON — DROP ceilings whose persisted
            // polygon is degenerate (an OLD project's collapsed-wall room left a
            // zero-area / <3-distinct-vertex ring). They would otherwise fail
            // `validateCeilingBoundary` one-by-one → the "120 elements failed"
            // banner. Dropping them lets the post-load redetect re-seal rooms.
            const rawCeilings = (snapshot as any).ceilings;
            const { kept: snapshotCeilings, dropped: droppedCeilings } =
                dropDegeneratePolygonRecords<any>(rawCeilings, (c) => c?.polygon ?? c?.boundary?.polygon);
            if (droppedCeilings.length > 0) {
                console.warn(`[ImportProjectCommand] §LOAD-HEAL-DEGENERATE-POLYGON — dropped ${droppedCeilings.length} degenerate ceiling polygon(s) from an old snapshot (rooms will re-seal via post-load redetect)`);
            }
            if (Array.isArray(snapshotCeilings) && snapshotCeilings.length > 0) {
                console.log(`[ImportProjectCommand] Loading ${snapshotCeilings.length} ceilings`);
                for (const ceiling of snapshotCeilings) {
                    try {
                        // §OPEN-OLD-CEILING-RESTORE (2026-07-01) — the serialized
                        // ceiling nests polygon/height/thickness/baseOffset under
                        // `boundary`. Reading the flat fields yielded `undefined` →
                        // validateCeilingPolygon(undefined) failed → every ceiling
                        // counted as a failed element. `ceilingRestoreBoundaryFields`
                        // reads `boundary` first (flat fallback for any legacy record).
                        const cb = ceilingRestoreBoundaryFields(ceiling);
                        const cmd = new CreateCeilingCommand({
                            ceilingId:    ceiling.id ?? crypto.randomUUID(),
                            ifcGuid:      ceiling.ifcGuid ?? ceiling.ifc?.guid ?? ceiling.ifcData?.guid ?? crypto.randomUUID(),
                            levelId:      ceiling.levelId,
                            polygon:      cb.polygon,
                            height:       cb.height,
                            thickness:    cb.thickness,
                            baseOffset:   cb.baseOffset,
                            systemTypeId: ceiling.systemTypeId,
                            label:        ceiling.label,
                            layers:       ceiling.layers,
                            finishSpec:   ceiling.finishSpec,
                            holeElements: ceiling.holeElements,
                            createdBy:    ceiling.metadata?.createdBy ?? ceiling.createdBy,
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
            // §LOAD-HEAL-DEGENERATE-POLYGON — same heal for floor finishes; a
            // floor's ring lives at `.boundary.polygon` (or legacy `.polygon`).
            const rawFloors = (snapshot as any).floors;
            const { kept: snapshotFloors, dropped: droppedFloors } =
                dropDegeneratePolygonRecords<any>(rawFloors, (f) => f?.boundary?.polygon ?? f?.polygon);
            if (droppedFloors.length > 0) {
                console.warn(`[ImportProjectCommand] §LOAD-HEAL-DEGENERATE-POLYGON — dropped ${droppedFloors.length} degenerate floor polygon(s) from an old snapshot (rooms will re-seal via post-load redetect)`);
            }
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

            // ── Step 5d: Standalone slab/floor openings (priority 21.9) ───────
            // §L-B3 (DAILY-USE-AUDIT 2026-05-20) — restore standalone openings
            // (stairwell cuts in slabs, service penetrations, etc.) that the
            // serializer persists at `snapshot.openings`. Must run AFTER slabs
            // (which provide the host) and BEFORE stairs (some stairs reference
            // their landing opening). Per-element try/catch + `runSub` follows
            // the same resilient-loop pattern as every other restoration step
            // in this method (walls, slabs, ceilings, floors, etc.).
            const snapshotOpenings = (snapshot as { openings?: unknown[] }).openings;
            if (Array.isArray(snapshotOpenings) && snapshotOpenings.length > 0) {
                console.log(`[ImportProjectCommand] Loading ${snapshotOpenings.length} standalone openings`);
                for (const opening of snapshotOpenings as Array<{
                    id?: string;
                    hostId?: string;
                    levelId?: string;
                    profile?: { x: number; y: number }[];
                    baseOffset?: number;
                }>) {
                    try {
                        if (!opening.id || !opening.hostId || !opening.levelId || !Array.isArray(opening.profile)) {
                            recordFail(
                                `Opening ${opening.id ?? '?'}`,
                                { success: false, affectedElementIds: [], info: ['malformed standalone opening — missing id/hostId/levelId/profile'] },
                            );
                            continue;
                        }
                        const cmd = new CreateOpeningCommand({
                            id:         opening.id,
                            hostId:     opening.hostId,
                            levelId:    opening.levelId,
                            profile:    opening.profile,
                            baseOffset: opening.baseOffset ?? 0,
                        });
                        const r = runSub(cmd);
                        r.success ? stats.loaded++ : recordFail(`Opening ${opening.id}`, r);
                    } catch (e) {
                        recordFail(
                            `Opening ${opening.id ?? '?'}`,
                            { success: false, affectedElementIds: [], info: [String(e)] },
                        );
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
            yield; // §LOAD-CHUNKED — paint a frame before the furniture-build step
            let _furnChunk = 0;
            for (const f of snapshot.furniture) {
                if (++_furnChunk >= CHUNK) { _furnChunk = 0; yield; }
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
            yield; // §LOAD-CHUNKED — paint a frame before the roof-build step
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
            yield; // §LOAD-CHUNKED — paint a frame before the (mullion-grid) curtain-wall build step
            let _cwChunk = 0;
            for (const cw of snapshot.curtainWalls) {
                if (++_cwChunk >= CHUNK) { _cwChunk = 0; yield; }
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
            // §LOAD-HEAL-DEGENERATE-POLYGON — DROP rooms whose persisted boundary
            // ring is degenerate (the collapsed-wall perimeter never sealed). They
            // would fail `deserializeRoom` / room-schema validation and count
            // toward the failure banner; the post-load redetect re-creates a clean
            // room from the join-resolved walls. A room WITHOUT a boundary polygon
            // (e.g. a bare semantic stub) is kept — only HAVING a degenerate ring
            // triggers the drop.
            const rawRooms = (snapshot as any).rooms;
            const { kept: snapshotRooms, dropped: droppedRooms } =
                dropDegeneratePolygonRecords<any>(rawRooms, (r) => r?.boundary?.polygon);
            if (droppedRooms.length > 0) {
                console.warn(`[ImportProjectCommand] §LOAD-HEAL-DEGENERATE-POLYGON — dropped ${droppedRooms.length} degenerate room polygon(s) from an old snapshot (rooms will re-seal via post-load redetect)`);
                // Remember which levels lost a room so the caller forces a
                // redetect there (the §LOAD-REDETECT-FREEZE skip is keyed on the
                // RAW snapshot rooms, which still list the dropped ones).
                for (const r of droppedRooms) {
                    const lvl = r?.levelId;
                    if (typeof lvl === 'string' && lvl.length > 0) stats.healedRoomLevelIds.add(lvl);
                }
            }
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
                let __rblSkipped = 0;
                for (const rbl of snapshotRoomBoundingLines) {
                    try {
                        // §RBL-NO-PERSIST-DEGENERATE (2026-07-02) — DROP degenerate legacy
                        // records (undefined placement) on load-migrate rather than
                        // recreating a bogus 1 m origin line (the old `?? {x:0,z:0}` /
                        // `?? {x:1,z:0}` default). The serializer's matching filter re-saves
                        // the snapshot without them, so the 940-record count self-heals.
                        if (rbl?.placement?.start == null || rbl?.placement?.end == null) {
                            __rblSkipped++;
                            continue;
                        }
                        const cmd = new CreateRoomBoundingLineCommand({
                            id:        rbl.id,
                            levelId:   rbl.levelId,
                            start:     rbl.placement.start,
                            end:       rbl.placement.end,
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
                if (__rblSkipped > 0) {
                    console.warn(`[ImportProjectCommand] §RBL-NO-PERSIST-DEGENERATE — skipped ${__rblSkipped} degenerate room-bounding-line(s) on load (dropped on next save).`);
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
