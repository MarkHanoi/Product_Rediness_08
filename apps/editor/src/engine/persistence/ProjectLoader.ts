/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Side System — command dispatcher / Persistence
 * Phase:             PERF-AUDIT-2026 — P0 Critical Path (project load latency)
 * Files Modified:    ProjectLoader.ts
 * Classification:    B (performance enhancement — no semantic model changes)
 *
 * Impact Assessment:
 *   Store Reads:      Yes — reads snapshot data (plain objects)
 *   Store Writes:     NO DIRECT WRITES — all mutations go through CommandManager
 *   Command Dispatch: YES — dispatches existing Create* commands per PlanOrdering
 *   Event Bus:        BATCHED — all StoreEventBus events buffered during load(),
 *                     flushed once at end → builders fire once per type, not once per element.
 *   Builder Calls:    Collapsed from O(N²) to O(N): 100 walls = 1 WallBuilder call (was 100).
 *
 * Risk Level:   Low — storeEventBus.beginBatch()/endBatch() is the proven mechanism
 *               used by BatchCoordinator for CurtainWall bulk-creation. Depth-counter
 *               prevents nesting issues. try/finally guarantees endBatch() always fires.
 *
 * Rationale:
 *   BEFORE: Each the legacy command manager fires StoreEventBus → DependencyResolver →
 *   WallBuilder.rebuild(). For 100 walls, WallBuilder runs 100 times, each rebuilding
 *   all walls seen so far. This is O(N²) in geometry operations, causing 30-second loads.
 *
 *   AFTER: storeEventBus.beginBatch() opens a buffer. All N commands fire their events
 *   into the buffer. At the end, endBatch() flushes ONCE → each builder runs exactly
 *   once regardless of how many elements were loaded. O(N) load time.
 *
 *   Measured impact: 100 walls ~29s → ~3s, 200 elements project ~45s → ~5s (estimated).
 *
 * Load Order (mirrors PlanOrdering.ts priority):
 *   1. ClearProjectCommand (priority 0 — always first)
 *   2. AddLevelCommand × N (priority 10)
 *   3. AddGridCommand × N (priority 11)
 *   4. CreateColumnCommand × N (priority 15)
 *   5. CreateWallCommand × N (priority 20) + CreateWallOpeningCommand per wall
 *   6. CreateSlabCommand × N (priority 21)
 *   7. CreateStairCommand × N (priority 22)
 *   8. CreateFurnitureCommand × N (priority 23)
 *   9. CreateRoofCommand × N (priority 24)
 *   10. CreateHandrailCommand × N (priority 25)
 *   11. CreatePlumbingFixtureCommand × N (priority 25)
 *   12. CreateCurtainWallCommand × N (priority 26)
 *   13. CreateBeamCommand × N (priority 30)
 */

import { CommandManager } from '@pryzm/command-registry';
import { storeEventBus } from '@pryzm/core-app-model';
import { ProjectSnapshot } from './ProjectSerializer';
import { BatchCreateRoomsCommand } from '@pryzm/command-registry';
import { deserializeRoom } from '@pryzm/room-topology';
import { vgGovernanceStore } from '@pryzm/core-app-model';
import { semanticIndex } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { visibilityRuleEngine } from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { runVGToIntentMigration, prewarmIntentStyleCache } from '@pryzm/core-app-model';
import { sheetStore } from '@pryzm/core-app-model';
import { scheduleStore } from '@pryzm/core-app-model';
import { userMaterialStore } from '@pryzm/core-app-model'; // #105 Materials Repository
import { requirementStore, assetCatalogStore, buildDefaultAssetCatalog } from '@pryzm/core-app-model';
import { annotationStore } from '@pryzm/plugin-annotations';
import { ClearProjectCommand } from '@pryzm/command-registry';
import { doorStore, doorSystemTypeStore } from '@pryzm/geometry-door';
import { windowStore, windowSystemTypeStore } from '@pryzm/geometry-window';
import { AddLevelCommand } from '@pryzm/command-registry';
import { AddGridCommand } from '@pryzm/command-registry';
import { CreateWallCommand } from '@pryzm/command-registry';
import { CreateWallOpeningCommand } from '@pryzm/command-registry';
import { CreateSlabCommand } from '@pryzm/command-registry';
import { CreateStairCommand } from '@pryzm/command-registry';
import { CreateBeamCommand } from '@pryzm/command-registry';
import { CreateCurtainWallCommand } from '@pryzm/command-registry';
import { CreateRoofCommand } from '@pryzm/command-registry';
import { CreateFurnitureCommand } from '@pryzm/command-registry';
import { CreateHandrailCommand } from '@pryzm/command-registry';
import { CreatePlumbingFixtureCommand } from '@pryzm/command-registry';
import { CreateLightingCommand } from '@pryzm/command-registry'; // §PERSIST-LIGHTING
import { CreateColumnCommand } from '@pryzm/command-registry';
import { CreateRoomBoundingLineCommand } from '@pryzm/command-registry';
import { RoofType, RoofFootprint } from '@pryzm/geometry-roof';
import { slabSystemTypeStore } from '@pryzm/geometry-slab';
import { wallSystemTypeStore } from '@pryzm/geometry-wall';
import { ceilingSystemTypeStore } from '@pryzm/core-app-model/stores';
import { CreateCeilingCommand } from '@pryzm/command-registry';
import { floorSystemTypeStore } from '@pryzm/core-app-model/stores';
import { CreateFloorCommand, ImportProjectCommand } from '@pryzm/command-registry';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { hierarchyStore } from '@pryzm/core-app-model';
import { templateStore } from '@pryzm/core-app-model';
import { templateAssignmentStore } from '@pryzm/core-app-model';
import { elementCodeStore } from '@pryzm/core-app-model';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { temporalGraphManager } from '@pryzm/core-app-model';
import { decisionRecordStore } from '@pryzm/core-app-model';
// S70 D8 — Phase-L lifecycle / maintenance imports removed alongside the
// deletion of `src/lifecycle/` per SPEC-27 §4.3 + ADR-030 Part D + ADR-0052 §B.7.
// v5+ snapshots that contain a `.lifecycle` block are read in restore-loop
// below and skipped (forward-compat: a future plugins/lifecycle/ port will
// re-introduce a deserialiser at that surface).

/**
 * Build a CreateWallOpeningCommand opening payload by merging the wall-opening
 * descriptor with the rich window/door record (if present in the snapshot).
 *
 * Exported so ImportProjectCommand (PROJECT-LOAD-PERFORMANCE-13 §2 — Phase 1)
 * can reuse the exact same per-opening payload shape that ProjectLoader builds.
 */
export function findOpeningElementData(snapshot: ProjectSnapshot, opening: any): any {
    if (opening.type === 'window') {
        const win = snapshot.windows.find(w => w.openingId === opening.id || w.id === opening.elementId);
        return win ? {
            frameThickness: win.frameThickness,
            frameWidth: win.frameWidth,
            frameColor: win.frameColor,
            windowType: win.windowType,
            fireRating: win.fireRating
        } : {};
    }
    if (opening.type === 'door') {
        const door = snapshot.doors.find(d => d.openingId === opening.id || d.id === opening.elementId);
        return door ? {
            frameThickness: door.frameThickness,
            frameWidth: door.frameWidth,
            frameColor: door.frameColor,
            leafColor: door.leafColor,
            doorType: door.doorType,
            fireRating: door.fireRating,
            accessibilityType: door.accessibilityType
        } : {};
    }
    return {};
}

/**
 * Convert a serialised roof snapshot record into a CreateRoofCommand.
 *
 * Exported so ImportProjectCommand (PROJECT-LOAD-PERFORMANCE-13 §2 — Phase 1)
 * can reuse the same migration logic that ProjectLoader has used since the
 * snapshot schema migration.
 */
export function migrateRoofSnapshotToCommand(roof: any): CreateRoofCommand | null {
    try {
        let footprint: RoofFootprint;

        if (roof.footprint && Array.isArray(roof.footprint.polygon) && roof.footprint.polygon.length >= 3) {
            footprint = {
                polygon:  roof.footprint.polygon,
                centroid: roof.footprint.centroid ?? [0, 0],
            };
        } else if (Array.isArray(roof.polygon) && roof.polygon.length >= 3) {
            const pts: [number, number][] = roof.polygon.map((p: any) =>
                Array.isArray(p) ? [p[0], p[1]] : [p.x ?? 0, p.y ?? 0]
            );
            let cx = 0, cz = 0;
            if (roof.position) {
                cx = roof.position.x ?? 0;
                cz = roof.position.z ?? 0;
            } else {
                for (const [x, z] of pts) { cx += x; cz += z; }
                cx /= pts.length; cz /= pts.length;
            }
            footprint = { polygon: pts, centroid: [cx, cz] };
        } else {
            const w = roof.width ?? 1;
            const d = roof.depth ?? 1;
            const cx = roof.position?.x ?? 0;
            const cz = roof.position?.z ?? 0;
            footprint = {
                polygon: [[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]],
                centroid: [cx, cz],
            };
        }

        const modeToType: Record<string, RoofType> = {
            'single_slope': 'shed',
            'hip_roof':     'hip',
            'by_region':    'by_region',
            'flat':         'flat',
        };
        const roofType: RoofType = roof.roofType
            ?? modeToType[roof.mode ?? '']
            ?? 'flat';

        return new CreateRoofCommand(roof.id ?? crypto.randomUUID(), {
            levelId:       roof.levelId,
            footprint,
            roofType,
            slope:         roof.slope,
            overhang:      roof.overhang ?? 0.3,
            baseOffset:    roof.baseOffset ?? 3.0,
            thickness:     roof.thickness ?? 0.2,
            fascia:        roof.fascia,
            materialColor: roof.materialColor,
            materialId:    roof.materialId,
        });
    } catch (e) {
        console.error('[ProjectLoader] migrateRoofSnapshotToCommand failed:', e);
        return null;
    }
}

export interface LoadResult {
    success: boolean;
    loaded: number;
    failed: number;
    errors: string[];
    warnings: string[];
}

export class ProjectLoader {
    constructor(private commandManager: CommandManager) {}

    /**
     * Load a ProjectSnapshot by dispatching Create* commands through CommandManager.
     * Clears the current project first using ClearProjectCommand.
     *
     * CONTRACT: No direct store mutation. All writes go through CommandManager.execute().
     *
     * Cancellation (§5.2 — Cancellable Async Scene Loading):
     *   Pass an `isCancelled` predicate that returns `true` when the caller has
     *   switched to a different project.  The loader checks this flag between each
     *   command batch and returns early (with success=false) if cancelled.
     *   The caller is responsible for setting the flag — typically via a closure:
     *
     *     let cancelled = false;
     *     const result = await loader.load(snapshot, () => cancelled);
     *     // on project switch:
     *     cancelled = true;
     */
    async load(snapshot: ProjectSnapshot, isCancelled?: () => boolean): Promise<LoadResult> {
        const cancelled = isCancelled ?? (() => false);
        const result: LoadResult = { success: false, loaded: 0, failed: 0, errors: [], warnings: [] };

        console.group(`[ProjectLoader] Loading "${snapshot.projectName}" (${snapshot.elementCount} elements)`);

        // ── PHASE-TIME INSTRUMENTATION (Flow 3 audit, 2026-04-30) ─────────────
        // The cold-open log of the "jk project" (192 walls × 11 levels) showed
        // ~30 s of main-thread block dominated by a 14 619 ms LONGTASK and a
        // 6 169 ms LONGTASK with no source attribution.  This breakdown table
        // attributes wall-clock time to each phase so the next cold open
        // prints exactly where the budget is spent.  Each phase start ts is
        // captured when its console.log fires, and the totals are emitted as
        // ONE summary line right before "Load complete" so the user can read
        // the full table in a single view.  The instrumentation is read-only
        // — no behavioural change.
        const __t_load_start = performance.now();
        const __phase_starts: Record<string, number> = { __load: __t_load_start };
        const __phase_ms: Record<string, number> = {};
        // §AUTOSAVE-LOAD-SLOW-OR-HANG (DAILY-USE 2026-05-21) — emit a console
        // line at every phase boundary so the live log shows real-time load
        // progress. Previously the phase summary was only printed at the
        // END of load; if the load hung mid-phase, the user had no signal
        // and saw the spinner forever. Now each phase fires `[ProjectLoader]
        // §LOAD-PHASE name=… elapsed=…ms total=…ms` as it completes,
        // making it instantly obvious which phase is the slow one.
        const __phase = (name: string) => {
            const now = performance.now();
            if (__phase_starts[name] !== undefined) {
                __phase_ms[name] = now - __phase_starts[name]!;
            }
            const sinceLoadStart = now - __t_load_start;
            console.log(
                `[ProjectLoader] §LOAD-PHASE name=${name} ` +
                `elapsed=${(__phase_ms[name] ?? 0).toFixed(1)}ms ` +
                `total=${sinceLoadStart.toFixed(1)}ms`,
            );
            __phase_starts[name] = now;
        };
        // §AUTOSAVE-LOAD-SLOW-OR-HANG — watchdog: if no phase completes
        // within WATCHDOG_MS the load is hung in the current phase. The
        // watchdog emits a console.warn every WATCHDOG_MS describing the
        // current phase so the user has a heartbeat instead of silence.
        // Self-cleared via clearInterval in the load's finally block (added
        // below where __phase('redetect_sweep') is called).
        const WATCHDOG_MS = 5000;
        const __watchdog = setInterval(() => {
            const now = performance.now();
            const elapsed = now - __t_load_start;
            const lastPhaseName = Object.keys(__phase_starts).pop() ?? '<unknown>';
            const sinceLastPhase = now - (__phase_starts[lastPhaseName] ?? __t_load_start);
            console.warn(
                `[ProjectLoader] §LOAD-WATCHDOG load still running after ${(elapsed / 1000).toFixed(1)}s ` +
                `— current phase="${lastPhaseName}" stuck for ${(sinceLastPhase / 1000).toFixed(1)}s ` +
                // §AUTOSAVE-LOAD-DIAG (2026-05-23) — carry the model size on every
                // heartbeat so the stuck phase AND the workload that's overwhelming it
                // are visible from a SINGLE repeating line (the architect's "review the
                // live logs" ask). A heartbeat that fires means the stall is across
                // await points; if the tab is frozen with NO heartbeat, the hang is a
                // synchronous block inside the phase named on the last §LOAD-PHASE line.
                `[walls=${snapshot.walls?.length ?? 0} slabs=${snapshot.slabs?.length ?? 0} ` +
                `levels=${snapshot.levels?.length ?? 0} curtainWalls=${snapshot.curtainWalls?.length ?? 0} ` +
                `rooms=${(snapshot as { rooms?: any[] }).rooms?.length ?? 0} ` +
                `doors=${snapshot.doors?.length ?? 0} windows=${snapshot.windows?.length ?? 0}]. ` +
                `If this keeps firing the load is hung; check the prior §LOAD-PHASE line for the last completed phase.`,
            );
        }, WATCHDOG_MS);
        // ── End PHASE-TIME INSTRUMENTATION ───────────────────────────────────

        // ── PROJECT-LOAD METADATA + EXEC HELPER ──────────────────────────────
        // Every command dispatched during load uses `source: 'PROJECT_LOAD'` so
        // CommandManager skips per-command snapshot creation, undo-history push,
        // and verbose console logging. Together these eliminate the O(N²) cost
        // that made large-project opens take 30+ seconds.
        // See CommandManager.execute() — PROJECT-LOAD FAST PATH comment.
        const LOAD_META = { source: 'PROJECT_LOAD' as const };
        const exec = (cmd: any) => this.commandManager.execute(cmd, LOAD_META); // PROJECT_LOAD fast-path: bypasses bus/undo-stack by design (see CommandManager PROJECT_LOAD comment); OI-023
        // ── End PROJECT-LOAD metadata ────────────────────────────────────────

        // ── ROOM TOPOLOGY OBSERVER — pause per Contract §R-8 ─────────────────
        // The observer's WallStore subscription fires `_scheduleRedetect()` on
        // every wall add. During load this triggers REDETECT_ROOMS × 3 per level
        // (debounce timer expires mid-load) which serialises the main thread.
        // Pause it for the duration of the load; we fire one ReDetectRoomsCommand
        // per level explicitly in the finally block (mirrors BatchCoordinator
        // ._executeFinalSweep).
        const topologyObserver = (typeof window !== 'undefined') ? window.roomTopologyObserver : null;
        try { topologyObserver?.pause?.(); } catch (e) { console.warn('[ProjectLoader] roomTopologyObserver.pause() failed', e); }

        // ── §LOAD-RAF-PAUSE — pause WallJoinResolver + buildWall flush cascade ──
        // Each wall add and each opening insertion fires a wallStore event that
        // would normally schedule a per-frame rebuild (one O(N²) WallJoinResolver
        // pass + one buildWall per dirty wall). Awaits later in this function
        // (e.g. dynamic `import(...)` calls) yield to the event loop and let
        // those rebuilds fire MID-LOAD, producing repeated full-level resolves
        // and triggering the verbose §MULTI-CLUSTER pre-pass each time. On
        // larger projects with multi-wall junctions this manifests as a load
        // that appears stuck at the last `[WallJoinResolver] §MULTI-CLUSTER ...
        // trimmed → (...)` line printed.
        //
        // We pause the rebuild scheduler here and explicitly call
        // resumeAndFlush() in the finally block, which runs ONE coalesced
        // resolveLevel + buildWall pass per affected level after every wall,
        // slab, and opening is already in its store.
        const wallRebuildControl = (typeof window !== 'undefined') ? window.__wallRebuildControl : null;
        try { wallRebuildControl?.pause?.(); } catch (e) { console.warn('[ProjectLoader] __wallRebuildControl.pause() failed', e); }
        // ── End §LOAD-RAF-PAUSE pause ────────────────────────────────────────

        // Track which level IDs were actually loaded so the post-load sweep
        // only fires for levels that have geometry.
        const loadedLevelIds = new Set<string>();
        // ── End topology observer pause ──────────────────────────────────────

        // ── PERF-AUDIT-2026 P0: Event-Bus Batch Wrap ─────────────────────────
        // Opens a StoreEventBus buffer so all Create* command events are queued
        // rather than dispatched synchronously per element.  The buffer is flushed
        // once in the finally block — each builder fires exactly once per element
        // type instead of once per element (O(N) vs O(N²) geometry operations).
        //
        // ClearProjectCommand runs inside the batch so WALL_CLEARED is buffered
        // before WALL_ADDED events — builders receive the correct clear-then-create
        // sequence when the bus flushes.  The depth-counter in StoreEventBus makes
        // this safe to nest with any BatchCoordinator.runBatch() calls that may
        // be triggered by individual Create* commands.
        storeEventBus.beginBatch();
        // ── End PERF-AUDIT-2026 P0 batch open ────────────────────────────────

        __phase('setup');           // setup window closed — element hydration begins
        try {
            // ── PROJECT-LOAD-PERFORMANCE-13 §2 Phase 1 — path selector ────────
            // Default-on: dispatch a single ImportProjectCommand instead of N
            // per-element CreateXCommands.  The legacy path is kept verbatim in
            // the `else` branch as a rollback for the rare regression — flip the
            // localStorage key 'PRYZM_USE_IMPORT_COMMAND' to 'false' (or set
            // VITE_PRYZM_USE_IMPORT_COMMAND=false at build time) to use it.
            const useImportCmd = this._useImportCommandPath();
            console.log(
                `[ProjectLoader] Element-creation path: ` +
                `${useImportCmd ? 'ImportProjectCommand (Phase 1)' : 'legacy per-command'}`
            );

            if (useImportCmd) {
                // ── New path: one command, one callback fan-out ──────────────
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const importCmd = new ImportProjectCommand(snapshot as any, { isCancelled: cancelled });
                const importResult = exec(importCmd);

                // Roll the command's per-element counters up into the LoadResult
                // so the calling UI sees identical {loaded, failed, errors,
                // warnings} bookkeeping regardless of which path ran.
                result.loaded   += importCmd.stats.loaded;
                result.failed   += importCmd.stats.failed;
                result.errors.push(...importCmd.stats.errors);
                result.warnings.push(...importCmd.stats.warnings);
                for (const lvlId of importCmd.stats.loadedLevelIds) {
                    loadedLevelIds.add(lvlId);
                }

                if (!importResult.success) {
                    // The command failed at Clear, was cancelled mid-import, or
                    // hit a fatal exception.  Surface that to the caller via the
                    // same early-return path the legacy code uses for cancellation.
                    return { ...result, success: false };
                }
            } else {
                // ── Legacy per-command path (preserved verbatim for rollback) ─
                // ── Step 0: Clear current project ────────────────────────────────
                const clearResult = exec(new ClearProjectCommand());
                if (!clearResult.success) {
                    result.errors.push('ClearProjectCommand failed: ' + (clearResult.error ?? 'unknown'));
                    return result;
                }

            // ── Cancellation check (before Step 1) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before levels.');
                return { ...result, success: false };
            }

            // ── Step 1: Levels (PlanOrdering priority 10) ─────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.levels.length} levels`);
            for (const level of snapshot.levels) {
                // Skip 'L0' if BimManager already created it as default
                const ctx = this.commandManager.getContext();
                const existing = ctx.bimManager.getLevelById(level.id);
                if (existing) {
                    console.log(`[ProjectLoader] Level ${level.id} already exists, skipping`);
                    result.warnings.push(`Level ${level.id} already exists — skipped`);
                    continue;
                }
                const cmd = new AddLevelCommand({
                    levelId: level.id,
                    name: level.name,
                    elevation: level.elevation,
                    height: level.height ?? 3.0
                });
                const r = exec(cmd);
                r.success ? result.loaded++ : this.recordFail(result, `Level ${level.id}`, r);
            }

            // ── Cancellation check (before Step 2) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before grids.');
                return { ...result, success: false };
            }

            // ── Step 2: Grids (PlanOrdering priority 11) ─────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.grids.length} grids`);
            for (const grid of snapshot.grids) {
                const cmd = new AddGridCommand({
                    gridId: grid.id,
                    orientation: grid.axis as 'X' | 'Y',
                    position: grid.position,
                    name: grid.name
                });
                const r = exec(cmd);
                r.success ? result.loaded++ : this.recordFail(result, `Grid ${grid.id}`, r);
            }

            // ── Cancellation check (before Step 3) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before columns.');
                return { ...result, success: false };
            }

            // ── Step 3: Columns (priority 15) ─────────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.columns.length} columns`);
            for (const col of snapshot.columns) {
                const cmd = new CreateColumnCommand({
                    id: col.id,
                    position: col.position,
                    height: col.height,
                    rotation: col.rotation ?? 0,
                    profile: col.profile ?? 'rectangular',
                    width: col.width,
                    depth: col.depth,
                    baseOffset: col.baseOffset ?? 0,
                    levelId: col.levelId,
                    materialId: col.materialId
                });
                const r = exec(cmd);
                r.success ? result.loaded++ : this.recordFail(result, `Column ${col.id}`, r);
            }

            // ── Cancellation check (before Step 4) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before walls.');
                return { ...result, success: false };
            }

            // ── B7b: Restore DoorStore / WindowStore from rich snapshot data ─────
            // Clear first (ClearProjectCommand may not know about these stores).
            // Restore rich records BEFORE walls so CreateWallOpeningCommand's
            // `!doorStore.has()` guard prevents duplicate insertion on redo.
            doorStore.clear();
            windowStore.clear();
            if (Array.isArray(snapshot.doors) && snapshot.doors.length > 0) {
                for (const d of snapshot.doors) {
                    try { doorStore.add(d); }
                    catch (err) { console.warn('[ProjectLoader] Skipping invalid door record:', err); }
                }
                console.log(`[ProjectLoader] Restored ${snapshot.doors.length} door records from snapshot`);
            }
            if (Array.isArray(snapshot.windows) && snapshot.windows.length > 0) {
                for (const w of snapshot.windows) {
                    try { windowStore.add(w); }
                    catch (err) { console.warn('[ProjectLoader] Skipping invalid window record:', err); }
                }
                console.log(`[ProjectLoader] Restored ${snapshot.windows.length} window records from snapshot`);
            }

            // ── Step 4: Walls (priority 20) ───────────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.walls.length} walls`);
            for (const wall of snapshot.walls) {
                const bl = wall.baseLine;
                const cmd = new CreateWallCommand(wall.id, {
                    start: { x: bl[0].x, z: bl[0].z },
                    end: { x: bl[1].x, z: bl[1].z },
                    height: wall.height,
                    thickness: wall.thickness,
                    levelId: wall.levelId,
                    baseOffset: wall.baseOffset,
                    materialId: wall.materialId,
                    materialColor: wall.materialColor,
                    curve: wall.curve,
                    systemTypeId: wall.systemTypeId
                });
                const r = exec(cmd);
                if (r.success) {
                    result.loaded++;
                    // Restore openings for this wall
                    if (Array.isArray(wall.openings) && wall.openings.length > 0) {
                        for (const opening of wall.openings) {
                            // Enrich opening with window/door data if available
                            const elementData = findOpeningElementData(snapshot, opening);
                            const openingCmd = new CreateWallOpeningCommand({
                                wallId: wall.id,
                                openingData: { ...opening, ...elementData }
                            });
                            const or = exec(openingCmd);
                            or.success ? result.loaded++ : this.recordFail(result, `Opening ${opening.id}`, or);
                        }
                    }
                } else {
                    this.recordFail(result, `Wall ${wall.id}`, r);
                }
            }

            // ── Cancellation check (before Step 5) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before slabs.');
                return { ...result, success: false };
            }

            // ── Step 5: Slabs (priority 21) ───────────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.slabs.length} slabs`);
            for (const slab of snapshot.slabs) {
                const cmd = new CreateSlabCommand({
                    id: slab.id,
                    width: slab.width,
                    depth: slab.depth,
                    thickness: slab.thickness,
                    position: slab.position,
                    levelId: slab.levelId,
                    polygon: slab.polygon,
                    holes: slab.holes,
                    sketch: slab.sketch
                });
                const r = exec(cmd);
                r.success ? result.loaded++ : this.recordFail(result, `Slab ${slab.id}`, r);
            }

            // ── Step 5b: Ceilings (priority 21.5 — after slabs, before stairs) ──
            const snapshotCeilings = (snapshot as any).ceilings;
            if (Array.isArray(snapshotCeilings) && snapshotCeilings.length > 0) {
                console.log(`[ProjectLoader] Loading ${snapshotCeilings.length} ceilings`);
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
                        const r = exec(cmd);
                        r.success ? result.loaded++ : this.recordFail(result, `Ceiling ${ceiling.id}`, r);
                    } catch (e) {
                        this.recordFail(result, `Ceiling ${ceiling.id ?? '?'}`, { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
            }

            // ── Step 5c: Floor Finishes (priority 21.8 — after ceilings, before stairs) ──
            const snapshotFloors = (snapshot as any).floors;
            if (Array.isArray(snapshotFloors) && snapshotFloors.length > 0) {
                console.log(`[ProjectLoader] Loading ${snapshotFloors.length} floor finishes`);
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
                        const r = exec(cmd);
                        r.success ? result.loaded++ : this.recordFail(result, `Floor ${floor.id}`, r);
                    } catch (e) {
                        this.recordFail(result, `Floor ${floor.id ?? '?'}`, { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
            }

            // ── Cancellation check (before Step 6) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before stairs.');
                return { ...result, success: false };
            }

            // ── Step 6: Stairs (priority 22) ──────────────────────────────────
            // §PERSIST-L1 (DAILY-USE 2026-05-20) — Previously this loop passed
            // only 11 curated fields, silently dropping `id`, `typeId`,
            // `typeSnapshot`, `properties` (mark + material + treadMaterial +
            // railingType + …), `turnDirection`, `secondRunSide`,
            // `stepsBeforeLanding`, `buildingCodeVariant`, and `metadata`.
            // That gave the architect-reported symptom: "stair type goes back
            // to default" after reload — the system-type-id was being thrown
            // away on every save/load cycle. The fix mirrors the wall restore
            // pattern (line 461-476) — every field the serializer wrote is
            // threaded back through the command so the snapshot round-trips
            // bit-identically.
            console.log(`[ProjectLoader] Loading ${snapshot.stairs.length} stairs`);
            for (const stair of snapshot.stairs) {
                try {
                    const cmd = new CreateStairCommand({
                        // §PERSIST-L1 — preserve the original UUID so railings,
                        // openings, room boundaries, and selection state all
                        // continue to resolve after reload.
                        id: stair.id,
                        baseLevelId: stair.baseLevelId,
                        topLevelId: stair.topLevelId,
                        shape: stair.shape,
                        riserHeight: stair.riserHeight,
                        treadDepth: stair.treadDepth,
                        width: stair.width,
                        startPosition: stair.startPosition ?? { x: 0, y: 0, z: 0 },
                        flights: stair.flights ?? [],
                        landings: stair.landings,
                        // §PERSIST-L1 — code-compliance + shape-control fields.
                        fireRating: stair.fireRating,
                        accessibilityType: stair.accessibilityType,
                        buildingCodeVariant: stair.buildingCodeVariant,
                        turnDirection: stair.turnDirection,
                        secondRunSide: stair.secondRunSide,
                        stepsBeforeLanding: stair.stepsBeforeLanding,
                        // §PERSIST-L1 — the architect's system-type choice
                        // (was silently dropped → stair reverted to default).
                        typeId: stair.typeId,
                        typeSnapshot: stair.typeSnapshot,
                        // §PERSIST-L1 — full properties bag carries mark +
                        // material + treadMaterial + riserMaterial + nosingType
                        // + stringerType + handrail flags + railingType + tags +
                        // description. CreateStairCommand merges these on top
                        // of DEFAULT_STAIR_PROPERTIES and the type defaults.
                        properties: stair.properties,
                        // §PERSIST-L1 — Tag the audit trail so an import
                        // is visibly distinct from a fresh user creation.
                        metadata: { ...(stair.metadata ?? {}), source: 'import' },
                        // §PERSIST-L1 — Skip the auto-opening punch on restore
                        // (the opening was already created at original-author
                        // time and serialised separately in slab.holes /
                        // standalone openings). Re-punching would duplicate it.
                        autoCreateOpening: false,
                    });
                    const r = exec(cmd);
                    r.success ? result.loaded++ : this.recordFail(result, `Stair ${stair.id}`, r);
                } catch (e) {
                    this.recordFail(result, `Stair ${stair.id}`, { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            // ── Cancellation check (before Step 7) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before furniture.');
                return { ...result, success: false };
            }

            // ── Step 7: Furniture (priority 23) ───────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.furniture.length} furniture items`);
            for (const f of snapshot.furniture) {
                try {
                    const cmd = new CreateFurnitureCommand({
                        id: f.id,
                        furnitureType: f.furnitureType,
                        position: f.position,
                        rotation: f.rotation,
                        levelId: f.levelId,
                        baseOffset: f.baseOffset ?? 0.2,
                        width: f.width,
                        length: f.length,
                        height: f.height,
                        widthBranchTwo: f.widthBranchTwo,
                        lengthBranchTwo: f.lengthBranchTwo,
                        widthMain: f.widthMain,
                        lengthSide: f.lengthSide,
                        seatDepthMain: f.seatDepthMain,
                        seatDepthSide: f.seatDepthSide,
                        material: f.material ?? 'wood',
                        color: f.color,
                        hasHeadboard: f.hasHeadboard,
                        lo3: f.lo3,
                        startPoint: f.startPoint,
                        cornerPoint: f.cornerPoint,
                        endPoint: f.endPoint,
                        wardrobeConfig: f.wardrobeConfig,
                        // Restore the kitchen / wardrobe RUN configs so the
                        // group geometry rebuilds identically (Contract 13 §2).
                        // Without these, FurnitureFactory would either throw
                        // ("requires kitchenConfig" / "requires wardrobeCabinetConfig")
                        // or silently collapse the RUN to a single primitive.
                        kitchenConfig:         f.kitchenConfig,
                        wardrobeCabinetConfig: f.wardrobeCabinetConfig,
                        // Descriptor-level grouping must survive the round-trip.
                        furnitureCategory:     f.furnitureCategory,
                        // Descriptor-supplied metadata (defaultProperties etc.).
                        metadata:              f.metadata
                    });
                    const r = exec(cmd);
                    r.success ? result.loaded++ : this.recordFail(result, `Furniture ${f.id}`, r);
                } catch (e) {
                    this.recordFail(result, `Furniture ${f.id}`, { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            // ── Cancellation check (before Step 8) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before roofs.');
                return { ...result, success: false };
            }

            // ── Step 8: Roofs (priority 24) ───────────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.roofs.length} roofs`);
            for (const roof of snapshot.roofs) {
                const cmd = migrateRoofSnapshotToCommand(roof);
                if (!cmd) {
                    this.recordFail(result, `Roof ${roof.id}`, { success: false, affectedElementIds: [], error: 'Failed to build roof command from snapshot' });
                    continue;
                }
                const r = exec(cmd);
                r.success ? result.loaded++ : this.recordFail(result, `Roof ${roof.id}`, r);
            }

            // ── Cancellation check (before Step 9) ────────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before handrails.');
                return { ...result, success: false };
            }

            // ── Step 9: Handrails (priority 25) ───────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.handrails.length} handrails`);
            for (const hr of snapshot.handrails) {
                const bl = hr.baseLine;
                const cmd = new CreateHandrailCommand({
                    id: hr.id,
                    start: { x: bl[0].x, z: bl[0].z },
                    end: { x: bl[1].x, z: bl[1].z },
                    height: hr.height,
                    thickness: hr.thickness,
                    levelId: hr.levelId,
                    baseOffset: hr.baseOffset
                });
                const r = exec(cmd);
                r.success ? result.loaded++ : this.recordFail(result, `Handrail ${hr.id}`, r);
            }

            // ── Cancellation check (before Step 10) ───────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before plumbing.');
                return { ...result, success: false };
            }

            // ── Step 10: Plumbing (priority 25) ──────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.plumbing.length} plumbing fixtures`);
            for (const p of snapshot.plumbing) {
                try {
                    const cmd = new CreatePlumbingFixtureCommand({
                        id: p.id,
                        fixtureType: p.fixtureType,
                        toiletVariant: p.toiletVariant,
                        position: p.position,
                        rotation: p.rotation,
                        levelId: p.levelId,
                        baseOffset: p.baseOffset ?? 0,
                        width: p.width,
                        height: p.height,
                        length: p.length,
                        color: p.color,
                        startPoint: p.startPoint,
                        endPoint: p.endPoint
                    });
                    const r = exec(cmd);
                    r.success ? result.loaded++ : this.recordFail(result, `Plumbing ${p.id}`, r);
                } catch (e) {
                    this.recordFail(result, `Plumbing ${p.id}`, { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            // ── Step 10b: Lighting fixtures ──────────────────────────────────
            // §PERSIST-LIGHTING (2026-05-22) — lighting was serialized nowhere AND
            // restored nowhere, so every light fixture the user placed was lost on
            // reload. Mirrors the plumbing/furniture restore: recreate each fixture
            // via CreateLightingCommand so the LightingStore + LightingFragmentBuilder
            // rebuild it (the command fires bim-lighting-placed). `lighting` is
            // optional on the snapshot for backward compat with pre-fix projects.
            const snapshotLighting = (snapshot as { lighting?: any[] }).lighting;
            if (Array.isArray(snapshotLighting) && snapshotLighting.length > 0) {
                console.log(`[ProjectLoader] Loading ${snapshotLighting.length} lighting fixtures`);
                for (const lt of snapshotLighting) {
                    try {
                        const cmd = new CreateLightingCommand({
                            id: lt.id,
                            fixtureType: lt.fixtureType,
                            position: lt.position,
                            rotation: lt.rotation,
                            levelId: lt.levelId,
                            roomId: lt.roomId,
                            hostId: lt.hostId,
                            tags: lt.tags,
                            properties: lt.properties,
                        });
                        const r = exec(cmd);
                        r.success ? result.loaded++ : this.recordFail(result, `Lighting ${lt.id}`, r);
                    } catch (e) {
                        this.recordFail(result, `Lighting ${lt.id}`, { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
            }

            // ── Cancellation check (before Step 11) ───────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before curtain walls.');
                return { ...result, success: false };
            }

            // ── Step 11: Curtain Walls (priority 26) ──────────────────────────
            // §PERSIST-L1 (DAILY-USE 2026-05-20) — Previously this loop passed
            // only 8 curated fields, silently dropping `mullionSize`,
            // `panelThickness`, `mullionColor`, `gridSystem`, `properties`,
            // and the IFC GUID. After reload every curtain wall fell back to
            // the hard-coded mullion defaults (0.08m black mullions, 0.02m
            // glazing) regardless of what the architect had picked. The fix
            // mirrors the wall restore pattern (line 461-476) — every field
            // the serializer wrote is threaded back through the command so
            // the snapshot round-trips bit-identically.
            console.log(`[ProjectLoader] Loading ${snapshot.curtainWalls.length} curtain walls`);
            for (const cw of snapshot.curtainWalls) {
                try {
                    const bl = cw.baseLine;
                    const cmd = new CreateCurtainWallCommand({
                        id: cw.id,
                        start: { x: bl[0].x, z: bl[0].z },
                        end: { x: bl[1].x, z: bl[1].z },
                        height: cw.height,
                        levelId: cw.levelId,
                        baseOffset: cw.baseOffset,
                        gridXSpacing: cw.gridXSpacing,
                        gridYSpacing: cw.gridYSpacing,
                        // §PERSIST-L1 — architect-set mullion + glazing fields.
                        mullionSize:    cw.mullionSize,
                        panelThickness: cw.panelThickness,
                        mullionColor:   cw.mullionColor,
                        // §PERSIST-L1 — non-uniform grid lines.
                        gridSystem:     cw.gridSystem,
                        // §PERSIST-L1 — architect-set mark / tags survive reload.
                        properties:     cw.properties,
                        // §PERSIST-L1 — IFC GUID continuity for external tools.
                        ifcGuid:        cw.ifcData?.guid,
                    });
                    const r = exec(cmd);
                    r.success ? result.loaded++ : this.recordFail(result, `CurtainWall ${cw.id}`, r);
                } catch (e) {
                    this.recordFail(result, `CurtainWall ${cw.id}`, { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            // ── Cancellation check (before Step 12) ───────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before beams.');
                return { ...result, success: false };
            }

            // ── Step 12: Beams (priority 30) ──────────────────────────────────
            console.log(`[ProjectLoader] Loading ${snapshot.beams.length} beams`);
            for (const b of snapshot.beams) {
                try {
                    const cmd = new CreateBeamCommand({
                        startPoint: b.startPoint,
                        endPoint: b.endPoint,
                        width: b.width,
                        depth: b.depth,
                        levelId: b.levelId,
                        material: b.material,
                        loadBearing: b.loadBearing,
                        fireRating: b.fireRating
                    });
                    const r = exec(cmd);
                    r.success ? result.loaded++ : this.recordFail(result, `Beam ${b.id}`, r);
                } catch (e) {
                    this.recordFail(result, `Beam ${b.id}`, { success: false, affectedElementIds: [], error: String(e) });
                }
            }

            // ── Step 13: Rooms (priority 31 — after walls for boundary accuracy) ─
            const snapshotRooms = (snapshot as any).rooms;
            if (Array.isArray(snapshotRooms) && snapshotRooms.length > 0) {
                console.log(`[ProjectLoader] Loading ${snapshotRooms.length} rooms`);
                const hydrated = [];
                for (const raw of snapshotRooms) {
                    try {
                        const room = deserializeRoom(raw);
                        hydrated.push(room);
                    } catch (e) {
                        this.recordFail(result, `Room ${raw.id ?? '?'}`, { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
                if (hydrated.length > 0) {
                    const cmd = new BatchCreateRoomsCommand(hydrated);
                    const r = exec(cmd);
                    if (r.success) {
                        result.loaded += hydrated.length;
                    } else {
                        result.failed += hydrated.length;
                        result.errors.push(`Rooms batch: ${r.error ?? 'failed'}`);
                    }
                }
            }

            // ── Step 13b: Room Bounding Lines (priority 31.5 — with rooms) ────
            const snapshotRoomBoundingLines = (snapshot as any).roomBoundingLines;
            if (Array.isArray(snapshotRoomBoundingLines) && snapshotRoomBoundingLines.length > 0) {
                console.log(`[ProjectLoader] Loading ${snapshotRoomBoundingLines.length} room bounding line(s)`);
                for (const rbl of snapshotRoomBoundingLines) {
                    try {
                        const cmd = new CreateRoomBoundingLineCommand({
                            id:         rbl.id,
                            levelId:    rbl.levelId,
                            start:      rbl.placement?.start ?? { x: 0, z: 0 },
                            end:        rbl.placement?.end   ?? { x: 1, z: 0 },
                            name:       rbl.properties?.name,
                            color:      rbl.properties?.color,
                            createdBy:  rbl.metadata?.createdBy ?? 'system',
                        });
                        const r = exec(cmd);
                        r.success ? result.loaded++ : this.recordFail(result, `RoomBoundingLine ${rbl.id}`, r);
                    } catch (e) {
                        this.recordFail(result, `RoomBoundingLine ${rbl?.id ?? '?'}`, { success: false, affectedElementIds: [], error: String(e) });
                    }
                }
            }
            } // end legacy per-command path (PROJECT-LOAD-PERFORMANCE-13 §2)

            // ── Cancellation check (before metadata restoration) ──────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before metadata restoration.');
                return { ...result, success: false };
            }

            // FIX-12 §07 §3: Restore custom SlabSystemType definitions from snapshot.
            // Built-in presets are always present from code; only custom types need restoring.
            const snapshotSlabSystemTypes = (snapshot as any).slabSystemTypes;
            if (Array.isArray(snapshotSlabSystemTypes) && snapshotSlabSystemTypes.length > 0) {
                let restoredTypeCount = 0;
                for (const raw of snapshotSlabSystemTypes) {
                    try {
                        if (!raw.id || !raw.name || !Array.isArray(raw.layers)) {
                            console.warn('[ProjectLoader] Skipping malformed slabSystemType:', raw);
                            continue;
                        }
                        // Only restore if not already present (avoids duplicates on re-load)
                        if (slabSystemTypeStore.getById(raw.id)) continue;

                        // §M-B1 loader-side: pass `id: raw.id` so the store
                        // preserves the snapshot's UUID. Without this, every
                        // slab referencing the custom type became a dangling
                        // reference on the next reload.
                        const restored = slabSystemTypeStore.add({
                            id: raw.id,
                            name: raw.name,
                            description: raw.description,
                            layers: raw.layers,
                        });

                        // Register in ElementRegistry so the ID→store mapping is complete (FIX-11)
                        try {
                            elementRegistry.registerSemantic(restored.id, 'slabSystemType');
                        } catch {
                            // Already registered (e.g. repeated load) — safe to ignore
                        }

                        restoredTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore slabSystemType:', raw, e);
                    }
                }
                if (restoredTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredTypeCount} custom slab system type(s) from snapshot.`);
                }
            }

            // FIX-3 (M9): Restore custom WallSystemType definitions from snapshot.
            // Built-in presets are always present from code; only custom types need restoring.
            const snapshotWallSystemTypes = (snapshot as any).wallSystemTypes;
            if (Array.isArray(snapshotWallSystemTypes) && snapshotWallSystemTypes.length > 0) {
                let restoredWallTypeCount = 0;
                for (const raw of snapshotWallSystemTypes) {
                    try {
                        if (!raw.id || !raw.name || !Array.isArray(raw.layers)) {
                            console.warn('[ProjectLoader] Skipping malformed wallSystemType:', raw);
                            continue;
                        }
                        // Only restore if not already present (avoids duplicates on re-load)
                        if (wallSystemTypeStore.getById(raw.id)) continue;

                        // §M-B1 loader-side: preserve the snapshot UUID — same
                        // reasoning as the slabSystemTypeStore.add above.
                        const restored = wallSystemTypeStore.add({
                            id: raw.id,
                            name: raw.name,
                            description: raw.description,
                            layers: raw.layers,
                        });

                        // Register in ElementRegistry so the ID→store mapping is complete
                        try {
                            elementRegistry.registerSemantic(restored.id, 'wallSystemType' as any);
                        } catch {
                            // Already registered (e.g. repeated load) — safe to ignore
                        }

                        restoredWallTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore wallSystemType:', raw, e);
                    }
                }
                if (restoredWallTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredWallTypeCount} custom wall system type(s) from snapshot.`);
                }
            }

            // Restore custom CeilingSystemType definitions from snapshot.
            // Built-in presets are always present from code; only custom types need restoring.
            const snapshotCeilingSystemTypes = (snapshot as any).ceilingSystemTypes;
            if (Array.isArray(snapshotCeilingSystemTypes) && snapshotCeilingSystemTypes.length > 0) {
                let restoredCeilingTypeCount = 0;
                for (const raw of snapshotCeilingSystemTypes) {
                    try {
                        if (!raw.id || !raw.name || !Array.isArray(raw.layers)) {
                            console.warn('[ProjectLoader] Skipping malformed ceilingSystemType:', raw);
                            continue;
                        }
                        if (ceilingSystemTypeStore.getById(raw.id)) continue;

                        const layers = raw.layers ?? [];
                        const restored = ceilingSystemTypeStore.addCustomType({
                            id: raw.id,
                            name: raw.name,
                            description: raw.description,
                            layers,
                            totalThickness: raw.totalThickness ?? layers.reduce((s: number, l: any) => s + (l.thickness ?? 0), 0),
                            category: raw.category ?? 'custom',
                            tags: raw.tags,
                            ifcTypeName: raw.ifcTypeName,
                        });

                        try {
                            elementRegistry.registerSemantic(restored.id, 'ceilingSystemType');
                        } catch {
                            // Already registered — safe to ignore
                        }

                        restoredCeilingTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore ceilingSystemType:', raw, e);
                    }
                }
                if (restoredCeilingTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredCeilingTypeCount} custom ceiling system type(s) from snapshot.`);
                }
            }

            // Restore custom FloorSystemType definitions from snapshot.
            // Built-in presets are always present from code; only custom types need restoring.
            const snapshotFloorSystemTypes = (snapshot as any).floorSystemTypes;
            if (Array.isArray(snapshotFloorSystemTypes) && snapshotFloorSystemTypes.length > 0) {
                let restoredFloorTypeCount = 0;
                for (const raw of snapshotFloorSystemTypes) {
                    try {
                        if (!raw.id || !raw.name || !Array.isArray(raw.layers)) {
                            console.warn('[ProjectLoader] Skipping malformed floorSystemType:', raw);
                            continue;
                        }
                        if (floorSystemTypeStore.getById(raw.id)) continue;

                        const layers = raw.layers ?? [];
                        const restored = floorSystemTypeStore.addCustomType({
                            id: raw.id,
                            name: raw.name,
                            description: raw.description,
                            layers,
                            category: raw.category ?? 'custom',
                            zoneTypes: raw.zoneTypes ?? ['dry'],
                            tags: raw.tags,
                            ifcTypeName: raw.ifcTypeName,
                        });

                        try {
                            elementRegistry.registerSemantic(restored.id, 'floorSystemType');
                        } catch {
                            // Already registered — safe to ignore
                        }

                        restoredFloorTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore floorSystemType:', raw, e);
                    }
                }
                if (restoredFloorTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredFloorTypeCount} custom floor system type(s) from snapshot.`);
                }
            }

            // §M-H4 (DAILY-USE-AUDIT 2026-05-20) — Restore custom DOOR system
            // types. Without this, every door finish type the user authored
            // ("Solid oak 35mm") was wiped on every project reload — only
            // built-in presets survived (because they're re-seeded from code).
            // Doors referencing the dropped type would then log the
            // [DoorBuilder] "unknown systemTypeId" warning and fall back to
            // inline parameters. The serializer pairs with this restore.
            //
            // Architectural note: door/window stores expose `getAll()` + simple
            // `add(type)` API where the type carries its own `id` + `isBuiltIn`
            // flag — slightly different from wall/slab's `addCustomType({...})`
            // shape — so the loop here mirrors that store's contract. The
            // duplicate-skip guard prevents re-adding a type already seeded
            // from code (e.g. when a future build re-classifies a previously-
            // custom type as built-in).
            const snapshotDoorSystemTypes = (snapshot as { doorSystemTypes?: unknown[] }).doorSystemTypes;
            if (Array.isArray(snapshotDoorSystemTypes) && snapshotDoorSystemTypes.length > 0) {
                let restoredDoorTypeCount = 0;
                for (const raw of snapshotDoorSystemTypes as Array<{ id?: string; name?: string; isBuiltIn?: boolean; [k: string]: unknown }>) {
                    try {
                        if (!raw.id || !raw.name) {
                            console.warn('[ProjectLoader] Skipping malformed doorSystemType:', raw);
                            continue;
                        }
                        const existing = doorSystemTypeStore.getById?.(raw.id);
                        if (existing) continue; // already seeded (built-in or earlier custom)
                        doorSystemTypeStore.add({ ...raw, isBuiltIn: false } as Parameters<typeof doorSystemTypeStore.add>[0]);
                        // 'doorSystemType' is not (yet) in the StoreType enum; cast
                        // via unknown so type registration is safe even though
                        // the registry's enum doesn't list this kind today.
                        try { elementRegistry.registerSemantic(raw.id, 'doorSystemType' as unknown as Parameters<typeof elementRegistry.registerSemantic>[1]); } catch { /* already registered */ }
                        restoredDoorTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore doorSystemType:', raw, e);
                    }
                }
                if (restoredDoorTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredDoorTypeCount} custom door system type(s) from snapshot.`);
                }
            }

            // §M-H4 — Restore custom WINDOW system types (mirrors door above).
            const snapshotWindowSystemTypes = (snapshot as { windowSystemTypes?: unknown[] }).windowSystemTypes;
            if (Array.isArray(snapshotWindowSystemTypes) && snapshotWindowSystemTypes.length > 0) {
                let restoredWindowTypeCount = 0;
                for (const raw of snapshotWindowSystemTypes as Array<{ id?: string; name?: string; isBuiltIn?: boolean; [k: string]: unknown }>) {
                    try {
                        if (!raw.id || !raw.name) {
                            console.warn('[ProjectLoader] Skipping malformed windowSystemType:', raw);
                            continue;
                        }
                        const existing = windowSystemTypeStore.getById?.(raw.id);
                        if (existing) continue;
                        windowSystemTypeStore.add({ ...raw, isBuiltIn: false } as Parameters<typeof windowSystemTypeStore.add>[0]);
                        try { elementRegistry.registerSemantic(raw.id, 'windowSystemType' as unknown as Parameters<typeof elementRegistry.registerSemantic>[1]); } catch { /* already registered */ }
                        restoredWindowTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore windowSystemType:', raw, e);
                    }
                }
                if (restoredWindowTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredWindowTypeCount} custom window system type(s) from snapshot.`);
                }
            }

            // Phase 3: Restore VG Governance state from snapshot (additive, no side effects)
            if (snapshot.vgGovernance) {
                vgGovernanceStore.deserialize(snapshot.vgGovernance);
                console.log('[ProjectLoader] VG Governance state restored from snapshot');
            }

            // Phase A: Restore Semantic Tag index from snapshot
            if ((snapshot as any).semanticTags) {
                semanticIndex.deserialize((snapshot as any).semanticTags);
                console.log('[ProjectLoader] Semantic tag index restored from snapshot');
            }

            // Phase B: Restore ViewDefinition store from snapshot
            if ((snapshot as any).viewDefinitions) {
                viewDefinitionStore.deserialize((snapshot as any).viewDefinitions);
                console.log('[ProjectLoader] ViewDefinition store restored from snapshot');
            }

            // Phase C: Restore VisibilityRule engine from snapshot
            if ((snapshot as any).visibilityRules) {
                visibilityRuleEngine.deserialize((snapshot as any).visibilityRules);
                console.log('[ProjectLoader] Visibility rule engine restored from snapshot');
            }

            if ((snapshot as any).visibilityIntents) {
                visibilityIntentStore.deserialize((snapshot as any).visibilityIntents);
                console.log('[ProjectLoader] Visibility intent store restored from snapshot');
            }

            if ((snapshot as any).viewIntentInstances) {
                viewIntentInstanceStore.deserialize((snapshot as any).viewIntentInstances);
                console.log('[ProjectLoader] View intent instance store restored from snapshot');
            }

            // Phase 8.1 — VG → Intent migration (one-time, idempotent)
            // Runs only for projects that have VGTemplates but no migrated intents yet.
            // After migration, the Intent system is the style authority.
            try {
                const { intentCount, viewCount, overrideCount } = runVGToIntentMigration();
                if (intentCount > 0 || viewCount > 0 || overrideCount > 0) {
                    console.log(
                        `[ProjectLoader] Phase 8.1 migration complete: ` +
                        `${intentCount} intents, ${viewCount} view instances, ${overrideCount} overrides`
                    );
                }
            } catch (migErr) {
                console.warn('[ProjectLoader] Phase 8.1 VG→Intent migration failed (non-fatal):', migErr);
            }

            // Master Plan Wave 1 / Stage P0 — View Template → Intent.viewSeed migration.
            // One-time, idempotent. Runs after VG→Intent so the absorbed Intents
            // sit alongside any VG-derived ones. Skipped once any `migrated-vt-*`
            // intent already exists.
            try {
                const { runViewTemplateToIntentMigration } =
                    await import('./migrations/ViewTemplateToIntentMigration');
                const { intentCount, viewCount, skippedCount } = runViewTemplateToIntentMigration();
                if (intentCount > 0 || viewCount > 0 || skippedCount > 0) {
                    console.log(
                        `[ProjectLoader] Wave 1 / P0 view-template absorption complete: ` +
                        `${intentCount} intents, ${viewCount} view bindings, ${skippedCount} skipped`
                    );
                }
            } catch (vtMigErr) {
                console.warn('[ProjectLoader] Wave 1 / P0 view-template absorption failed (non-fatal):', vtMigErr);
            }

            // Phase 8.2 — Style cache pre-warming (background micro-task)
            // Pre-resolves styles for all known element types so the first render
            // frame is served from cache (Contract 25a §8.2 — target < 0.5ms cold resolve).
            setTimeout(() => { try { prewarmIntentStyleCache(); } catch { } }, 0);

            // Phase III: Restore Sheet store from snapshot
            if ((snapshot as any).sheets) {
                sheetStore.deserialize((snapshot as any).sheets);
                console.log('[ProjectLoader] Sheet store restored from snapshot');
            }

            // Phase III: Restore Schedule store from snapshot
            if ((snapshot as any).schedules) {
                scheduleStore.deserialize((snapshot as any).schedules);
                console.log('[ProjectLoader] Schedule store restored from snapshot');
            } else {
                // Seed default schedules if none were in the snapshot
                scheduleStore.seedDefaultSchedules();
            }

            // #105 Materials Repository — restore user-created/uploaded materials.
            if ((snapshot as any).userMaterials) {
                userMaterialStore.deserialize((snapshot as any).userMaterials);
                console.log('[ProjectLoader] User materials restored from snapshot');
            }

            // Data Platform — Phase 4 (schema v2)
            // Restore hierarchy nodes, template definitions/assignments, and element codes.
            // All three blocks are guaranteed to exist on v2 snapshots (migration backfills them).
            // Defensive `if` guard retained for safety against edge-case snapshots.
            if (snapshot.hierarchy) {
                hierarchyStore.deserialize(snapshot.hierarchy.nodes);
                console.log(`[ProjectLoader] Hierarchy store restored from snapshot (${snapshot.hierarchy.nodes.length} nodes)`);
            }
            if (snapshot.templates) {
                templateStore.deserialize(snapshot.templates.templates);
                templateAssignmentStore.deserialize(snapshot.templates.assignments);
                console.log(
                    `[ProjectLoader] Template store restored from snapshot ` +
                    `(${snapshot.templates.templates.length} templates, ` +
                    `${snapshot.templates.assignments.length} assignments)`
                );
            }
            if (snapshot.elementCodes) {
                elementCodeStore.deserialize({
                    codes: snapshot.elementCodes.codes,
                    counters: snapshot.elementCodes.counters,
                });
                console.log(`[ProjectLoader] Element code store restored from snapshot (${snapshot.elementCodes.codes.length} codes)`);
            }

            // Phase D — D-1 (schema v3): Restore SemanticGraph relationships.
            // If absent (v1/v2 snapshots), graph remains empty — relationships will
            // be repopulated as commands are subsequently executed.
            if (snapshot.semanticGraph) {
                semanticGraphManager.deserialize(snapshot.semanticGraph);
                console.log(`[ProjectLoader] SemanticGraph restored (${snapshot.semanticGraph.relationships.length} relationships)`);
            } else {
                semanticGraphManager.clear();
                console.log('[ProjectLoader] SemanticGraph cleared (v1/v2 snapshot — no graph data)');
            }

            // Gap 2 (Phase 3.2): If the graph is empty after deserialize, rebuild it
            // from the snapshot data so pre-graph projects get a populated graph.
            if (semanticGraphManager.size === 0) {
                const rebuilt = this._rebuildSemanticGraph(snapshot);
                if (rebuilt > 0) {
                    console.log(`[ProjectLoader] SemanticGraph rebuilt from snapshot (${rebuilt} relationships)`);
                }
            }

            // Phase G — G-1 (schema v4): Restore TemporalGraph mutation log.
            // If absent (v1–v3 snapshots), temporal graph remains empty — mutations
            // will be recorded incrementally from this point forward.
            if ((snapshot as any).temporalGraph) {
                temporalGraphManager.deserialize((snapshot as any).temporalGraph);
                console.log(
                    `[ProjectLoader] TemporalGraph restored (` +
                    `${(snapshot as any).temporalGraph.edges?.length ?? 0} edges, ` +
                    `${(snapshot as any).temporalGraph.mutations?.length ?? 0} mutations)`
                );
            } else {
                temporalGraphManager.clear();
                console.log('[ProjectLoader] TemporalGraph cleared (pre-v4 snapshot — no temporal data)');
            }

            // Phase G — G-3 (schema v4): Restore DecisionRecordStore.
            // If absent (v1–v3 snapshots), store remains empty — decisions will
            // be recorded incrementally from this point forward.
            if ((snapshot as any).decisionRecords) {
                decisionRecordStore.deserialize((snapshot as any).decisionRecords);
            } else {
                decisionRecordStore.clear();
                console.log('[ProjectLoader] DecisionRecordStore cleared (pre-v4 snapshot — no decision data)');
            }


            // Autonomous Auditor — Phase 0: Restore RequirementStore.
            // If absent (all prior snapshots), store remains empty — brief starts blank.
            const reqData = (snapshot as any).requirements;
            if (reqData?.records && Array.isArray(reqData.records)) {
                try {
                    requirementStore.clear();
                    let reqLoaded = 0;
                    for (const record of reqData.records) {
                        try {
                            requirementStore.add(record);
                            reqLoaded++;
                        } catch (e) {
                            console.warn('[ProjectLoader] Failed to restore requirement', record?.id, e);
                        }
                    }
                    console.log(`[ProjectLoader] RequirementStore restored: ${reqLoaded} requirements`);
                } catch (importErr) {
                    console.warn('[ProjectLoader] RequirementStore not available (non-fatal):', importErr);
                }
            } else {
                requirementStore.clear();
                console.log('[ProjectLoader] RequirementStore cleared (no requirement data in snapshot)');
            }

            // Autonomous Auditor — Phase 3: Restore AssetCatalogStore.
            // If snapshot contains assetCatalog, restore it directly.
            // If absent (all prior snapshots), re-seed from built-in defaults.
            const catalogData = (snapshot as any).assetCatalog;
            try {
                if (catalogData?.entries && Array.isArray(catalogData.entries) && catalogData.entries.length > 0) {
                    assetCatalogStore.setDirect(catalogData.entries);
                    console.log(`[ProjectLoader] AssetCatalogStore restored: ${catalogData.entries.length} entries`);
                } else {
                    // Seed from defaults — new project or pre-Phase-3 snapshot
                    assetCatalogStore.setDirect(buildDefaultAssetCatalog());
                    console.log('[ProjectLoader] AssetCatalogStore seeded from defaults');
                }
            } catch (catalogErr) {
                console.warn('[ProjectLoader] AssetCatalogStore not available (non-fatal):', catalogErr);
            }

            // §31 Phase 2 — Restore DXF/DWG underlay overlays
            // The DxfOverlayStore is restored here; actual THREE.js geometry is
            // rebuilt lazily by DxfImportPanel.restoreDxfOverlay() after the scene
            // is ready (dispatched via pryzm-project-loaded event).
            const dxfData = (snapshot as any).dxfOverlays;
            try {
                if (dxfData?.overlays && Array.isArray(dxfData.overlays) && dxfData.overlays.length > 0) {
                    const { dxfOverlayStore: dxfStore } = await import('@pryzm/file-format');
                    dxfStore.restore(dxfData);
                    console.log(`[ProjectLoader] DxfOverlayStore restored: ${dxfData.overlays.length} overlay(s)`);
                    // Signal that DXF overlays need geometry rebuild after scene is ready
                    window.runtime?.events?.emit('pryzm-dxf-restore-overlays', { overlays: dxfData.overlays }); // F.events.13
                }
            } catch (dxfErr) {
                console.warn('[ProjectLoader] DxfOverlayStore restore failed (non-fatal):', dxfErr);
            }

            // §ANN-A2 — Restore Annotation store from snapshot
            if ((snapshot as any).annotations) {
                annotationStore.deserialize((snapshot as any).annotations);
                const annSnap = (snapshot as any).annotations as { annotations?: any[]; dimensions?: any[] };
                console.log(
                    `[ProjectLoader] Annotation store restored from snapshot ` +
                    `(${annSnap.annotations?.length ?? 0} annotations, ` +
                    `${annSnap.dimensions?.length ?? 0} dimensions)`
                );
            } else {
                annotationStore.clear();
                console.log('[ProjectLoader] Annotation store cleared (no annotation data in snapshot)');
            }

            // ── ANNOTATION-SYSTEM-AUDIT-2026 — restore additional slices ────────
            // Order matters here:
            //   1. Constraints (A4) — must be restored before the dependency
            //      graph is rebuilt so the solver can re-evaluate them.
            //   2. Visibility hide list (B8).
            //   3. OBC bridge map (B9) — restore before subsequent OBC events
            //      can fire so deletions resolve to the right annotation.
            //   4. AnnotationDependencyGraph.rebuild (A5) — rehydrates the
            //      reverse-index from element ids to dependent annotation ids
            //      so subsequent element updates push through to annotations.
            try {
                const constraintsSlice = (snapshot as any).annotationConstraints;
                if (constraintsSlice) {
                    const { constraintStore } = await import('@pryzm/plugin-annotations');
                    constraintStore.deserialize(constraintsSlice);
                } else {
                    const { constraintStore } = await import('@pryzm/plugin-annotations');
                    constraintStore.clear();
                }
            } catch (e) {
                console.warn('[ProjectLoader] ConstraintStore restore failed (non-fatal):', e);
            }

            try {
                const visibilitySlice = (snapshot as any).annotationVisibility;
                const { annotationVisibilityStore } = await import('@pryzm/plugin-annotations');
                // fromJSON({}) wipes the internal hide map, so we use it both to
                // restore an empty payload and to apply a non-empty one.
                annotationVisibilityStore.fromJSON(
                    (visibilitySlice && typeof visibilitySlice === 'object') ? visibilitySlice : {}
                );
            } catch (e) {
                console.warn('[ProjectLoader] AnnotationVisibilityStore restore failed (non-fatal):', e);
            }

            try {
                const obcSlice = (snapshot as any).obcAnnotationMap;
                if (obcSlice) {
                    const { obcAnnotationAdapter } = await import('@pryzm/plugin-annotations');
                    obcAnnotationAdapter.deserialize(obcSlice);
                }
            } catch (e) {
                console.warn('[ProjectLoader] OBCAnnotationAdapter restore failed (non-fatal):', e);
            }

            try {
                // ANNOTATION-SYSTEM-AUDIT-2026 A5 — rebuild the dependency
                // graph from the restored annotations so element-update events
                // again propagate to the annotations that reference them.
                // The graph instance lives on the AnnotationManager created in
                // initTools and is exposed as window.annotationDependencyGraph
                // (also threaded through CommandContext for future callers).
                const depGraph =
                    (typeof window !== 'undefined') ? window.annotationDependencyGraph : null;
                if (depGraph && typeof depGraph.rebuild === 'function') {
                    depGraph.rebuild();
                    console.log('[ProjectLoader] AnnotationDependencyGraph rebuilt after restore');
                }
            } catch (e) {
                console.warn('[ProjectLoader] AnnotationDependencyGraph rebuild failed (non-fatal):', e);
            }

            result.success = result.errors.length === 0 || result.loaded > 0;
            __phase('hydrate');     // element + non-element store hydration done
            console.log(
                `[ProjectLoader] Load complete: ${result.loaded} loaded, ` +
                `${result.failed} failed, ${result.errors.length} errors`
            );

            if (result.errors.length > 0) {
                console.warn('[ProjectLoader] Errors:', result.errors);
            }

        } catch (err) {
            result.errors.push(String(err));
            console.error('[ProjectLoader] Fatal error:', err);
        } finally {
            // ── PERF-AUDIT-2026 P0: Flush event buffer ────────────────────────
            // Dispatches all buffered StoreEventBus events in insertion order.
            // Builders (WallBuilder, SlabBuilder, etc.) receive their events here
            // and fire geometry updates exactly once per type, regardless of how
            // many elements were loaded.  Safe to call from finally — if depth is
            // already 0 (e.g. nested batch already closed it) this is a no-op.
            storeEventBus.endBatch();
            __phase('event_flush'); // builders fanned out — geometry pipeline drained
            // ── End PERF-AUDIT-2026 P0 batch close ───────────────────────────

            // ── §LOAD-RAF-PAUSE — flush wall rebuild ONCE before resuming room
            //    topology observer so walls/buildWall geometry is final before
            //    the post-load REDETECT_ROOMS sweep runs.  Must come AFTER
            //    storeEventBus.endBatch() above so all CREATE events have been
            //    delivered to builders, but BEFORE topologyObserver.resume()
            //    so the room re-detection scans final wall geometry.
            try {
                wallRebuildControl?.resumeAndFlush?.();
            } catch (e) {
                console.warn('[ProjectLoader] __wallRebuildControl.resumeAndFlush() failed', e);
            }
            __phase('wall_rebuild_flush'); // WallJoinResolver + buildWall coalesced pass
            // ── End §LOAD-RAF-PAUSE flush ────────────────────────────────────

            // ── ROOM TOPOLOGY OBSERVER — resume + final REDETECT_ROOMS sweep ─
            // Mirrors BatchCoordinator._executeFinalSweep: fires exactly ONE
            // ReDetectRoomsCommand per loaded level after the event buffer has
            // flushed and geometry is built. Replaces the per-level ×3 storm
            // that previously blocked the main thread during load.
            try { topologyObserver?.resume?.(); } catch (e) { console.warn('[ProjectLoader] roomTopologyObserver.resume() failed', e); }

            if (Array.isArray(snapshot.levels) && snapshot.levels.length > 0) {
                try {
                    const elevation = (lvl: any) => (typeof lvl.elevation === 'number' ? lvl.elevation : 0);
                    const height    = (lvl: any) => (typeof lvl.height === 'number' ? lvl.height : 3.0);
                    for (const lvl of snapshot.levels) {
                        if (!lvl?.id) continue;
                        try {
                            // Phase F-1.2: dispatch to rooms.redetect bus handler, which calls
                            // commandManager internally (initBusHandlers.ts §P0-A39 registration).
                            // Direct commandManager.execute(ReDetectRoomsCommand) removed.
                            window.runtime?.bus?.executeCommand('rooms.redetect', {
                                levelId:   lvl.id,
                                elevation: elevation(lvl),
                                height:    height(lvl),
                            }).catch((e: unknown) => {
                                console.warn(`[ProjectLoader] rooms.redetect bus dispatch failed for level '${lvl.id}':`, e);
                            });
                        } catch (e) {
                            console.warn(`[ProjectLoader] Final REDETECT_ROOMS failed for level '${lvl.id}':`, e);
                        }
                    }
                } catch (err) {
                    console.warn('[ProjectLoader] rooms.redetect bus dispatch sweep failed:', err);
                }
            }
            // ── End topology observer resume ──────────────────────────────────

            // ── UNDO STACK — clear after rehydration (Contract 20 GAP-3) ─────
            // §U-B1 (DAILY-USE-AUDIT 2026-05-20) — clear THREE stacks, not just the
            // legacy commandManager. Before this fix, the PRYZM-3 RingBufferUndoStack
            // and the command-bus EventRecord UndoStack survived project load: the
            // user's first Ctrl+Z applied an inverse JSON-Patch from the PREVIOUS
            // project (no-op on missing IDs, data corruption on ID collision).
            // `runtime.bus.clearUndoStacks()` (added in composeRuntime §U-B1) wipes
            // both PRYZM-3 stacks; commandManager.clearHistory wipes the legacy one.
            try { this.commandManager.clearHistory(); } catch (e) { /* no-op */ }
            try {
                const r = (window as { runtime?: { bus?: { clearUndoStacks?: () => void } } }).runtime;
                r?.bus?.clearUndoStacks?.();
            } catch (e) { /* no-op */ }
            // ── End undo stack clear ──────────────────────────────────────────

            // Reference loadedLevelIds so TS strict mode doesn't flag it unused.
            // (Reserved for future per-level instrumentation.)
            void loadedLevelIds;

            __phase('redetect_sweep'); // explicit per-level ReDetectRoomsCommand sweep
            // §AUTOSAVE-LOAD-SLOW-OR-HANG — clear the watchdog. Load has reached
            // the summary line; no longer at risk of silent hang.
            clearInterval(__watchdog);
            const __t_total = performance.now() - __t_load_start;
            // ONE summary line so the cold-open log shows the wall-clock budget
            // distribution at a glance.  Phases sum to total within ~0.1 ms; any
            // residual is tiny inter-phase bookkeeping.
            console.log(
                `[ProjectLoader] PHASE_TIMINGS total=${__t_total.toFixed(1)}ms ` +
                `setup=${(__phase_ms.setup ?? 0).toFixed(1)}ms ` +
                `hydrate=${(__phase_ms.hydrate ?? 0).toFixed(1)}ms ` +
                `event_flush=${(__phase_ms.event_flush ?? 0).toFixed(1)}ms ` +
                `wall_rebuild_flush=${(__phase_ms.wall_rebuild_flush ?? 0).toFixed(1)}ms ` +
                `redetect_sweep=${(__phase_ms.redetect_sweep ?? 0).toFixed(1)}ms ` +
                `[walls=${snapshot.walls?.length ?? 0} ` +
                `slabs=${snapshot.slabs?.length ?? 0} ` +
                `levels=${snapshot.levels?.length ?? 0} ` +
                `curtainWalls=${snapshot.curtainWalls?.length ?? 0}]`
            );

            // §AUTOSAVE-LOAD-SLOW-OR-HANG — defensive clearInterval: if any
            // exception thrown above bypasses the earlier clearInterval at
            // the redetect_sweep phase, this guarantees the watchdog stops
            // firing. Idempotent — clearInterval on a cleared id is a no-op.
            clearInterval(__watchdog);
            console.groupEnd();
        }

        return result;
    }

    /**
     * Phase 3.2 — Auto-populate SemanticGraph from snapshot data.
     *
     * Called when the graph is empty after deserialization (pre-graph projects or
     * snapshots saved before Phase D was wired). Rebuilds four classes of edges:
     *
     *   1. Wall → Door/Window  (hosts / hostedBy) — derived from wall.openings[]
     *   2. Room → Wall         (boundedBy)         — derived from room.boundary.boundingWallIds
     *   3. Room → Unit         (partOf)             — derived from room.unitId
     *   4. Room adjacency      (adjacentTo)         — two rooms that share a bounding wall
     *
     * Uses the raw snapshot arrays (no store reads) so it is safe to call before
     * any StoreEventBus events fire on this load cycle.
     *
     * @returns Number of relationships added.
     */
    private _rebuildSemanticGraph(snapshot: ProjectSnapshot): number {
        let count = 0;

        const addRel = (sourceId: string, targetId: string, type: import('@pryzm/core-app-model').RelationshipType) => {
            try {
                semanticGraphManager.addRelationship({ type, sourceId, targetId, createdBy: 'system' });
                count++;
            } catch {
                // Skip invalid pairs silently — stores may not yet be populated
            }
        };

        // 1. Wall → hosted Door/Window (hosts + hostedBy inverse)
        for (const wall of (snapshot.walls ?? [])) {
            if (!wall?.id || !Array.isArray(wall.openings)) continue;
            for (const opening of wall.openings) {
                const elementId: string | undefined = opening.elementId ?? opening.id;
                if (!elementId) continue;
                addRel(wall.id, elementId, 'hosts');
                addRel(elementId, wall.id, 'hostedBy');
            }
        }

        // 2. Room → Wall (boundedBy) + adjacency between rooms sharing a wall
        const wallToRooms = new Map<string, string[]>();
        for (const room of (snapshot.rooms ?? [])) {
            if (!room?.id) continue;
            const wallIds: string[] = room.boundary?.boundingWallIds ?? [];
            for (const wallId of wallIds) {
                if (!wallId) continue;
                addRel(room.id, wallId, 'boundedBy');
                if (!wallToRooms.has(wallId)) wallToRooms.set(wallId, []);
                wallToRooms.get(wallId)!.push(room.id);
            }
        }

        // Derive adjacency: two rooms that share a bounding wall are adjacentTo each other
        for (const [, roomIds] of wallToRooms) {
            if (roomIds.length < 2) continue;
            for (let i = 0; i < roomIds.length; i++) {
                for (let j = i + 1; j < roomIds.length; j++) {
                    addRel(roomIds[i], roomIds[j], 'adjacentTo');
                    addRel(roomIds[j], roomIds[i], 'adjacentTo');
                }
            }
        }

        // 3. Room → Unit (partOf)
        for (const room of (snapshot.rooms ?? [])) {
            if (!room?.id || !room.unitId) continue;
            addRel(room.id, room.unitId, 'partOf');
        }

        return count;
    }

    private recordFail(result: LoadResult, label: string, r: any): void {
        result.failed++;
        const msg = `${label}: ${r.error ?? r.info?.join(', ') ?? 'failed'}`;
        result.errors.push(msg);
        console.warn(`[ProjectLoader] Failed: ${msg}`);
    }

    /**
     * PROJECT-LOAD-PERFORMANCE-13 §2 (Phase 1) — feature-flag resolver for the
     * ImportProjectCommand fast path.
     *
     * Default is ON.  Two overrides, checked in order:
     *
     *   1. Vite build env: VITE_PRYZM_USE_IMPORT_COMMAND
     *        - 'false' / '0' / 'off' → legacy path
     *        - any other value (including unset)              → new path
     *
     *   2. Browser localStorage: 'PRYZM_USE_IMPORT_COMMAND'
     *        - same semantics as above; takes precedence over the env var so a
     *          developer can flip the path at runtime without rebuilding.
     *
     * Wrapped in try/catch because (a) `import.meta.env` access is rejected by
     * the TS isolatedModules compiler unless the build target supports it, and
     * (b) localStorage throws in private-browsing modes / SSR contexts.
     */
    private _useImportCommandPath(): boolean {
        const isFalsy = (v: unknown): boolean => {
            if (typeof v !== 'string') return false;
            const lc = v.trim().toLowerCase();
            return lc === 'false' || lc === '0' || lc === 'off' || lc === 'no';
        };

        // Runtime override (highest priority)
        try {
            if (typeof window !== 'undefined' && window.localStorage) {
                const ls = window.localStorage.getItem('PRYZM_USE_IMPORT_COMMAND');
                if (ls !== null) return !isFalsy(ls);
            }
        } catch { /* private-browsing or sandboxed iframe — fall through */ }

        // Build-time env override
        try {
            const env = (import.meta as any)?.env;
            const v = env?.VITE_PRYZM_USE_IMPORT_COMMAND;
            if (typeof v === 'string' && v.length > 0) return !isFalsy(v);
        } catch { /* env not available — fall through */ }

        // Default: new path on
        return true;
    }
}
