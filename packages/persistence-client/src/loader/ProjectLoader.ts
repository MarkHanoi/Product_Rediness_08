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
 *   BEFORE: Each commandManager.execute() fires StoreEventBus → DependencyResolver →
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
// TODO(TASK-08): store-unification debt (ADR-0318) — the StoreEventBus batching this
// loader relies on (buffer during load(), flush once at the end) is the surface
// TASK-08 unifies. Work note relocated from the file header, where it read to the
// C74 §3.4 M-B gate as a module-scaffold claim; this loader is production, not a
// stand-in (CO-06, 2026-08-14).
import { storeEventBus } from '@pryzm/core-app-model';
import { buildHandrailCreatePayload } from '@pryzm/core-app-model/stores';
import { ProjectSnapshot } from './ProjectSerializer';
import { BatchCreateRoomsCommand } from '@pryzm/command-registry';
import { deserializeRoom } from '@pryzm/room-topology';
import { vgGovernanceStore } from '@pryzm/core-app-model';
import { semanticIndex } from '@pryzm/core-app-model';
import { viewDefinitionStore } from '@pryzm/core-app-model';
import { visibilityRuleEngine } from '@pryzm/core-app-model';
import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { runVGToIntentMigration, prewarmIntentStyleCache } from './migrations/VGToIntentMigration';
import { sheetStore } from '@pryzm/core-app-model';
import { scheduleStore } from '@pryzm/core-app-model';
import { annotationStore } from '@pryzm/plugin-annotations';
import { ClearProjectCommand } from '@pryzm/command-registry';
import { doorStore } from '@pryzm/geometry-door';
import { windowStore } from '@pryzm/geometry-window';
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
import { CreateColumnCommand } from '@pryzm/command-registry';
import { CreateRoomBoundingLineCommand } from '@pryzm/command-registry';
import { RoofType, RoofFootprint } from '@pryzm/geometry-roof';
import { slabSystemTypeStore } from '@pryzm/geometry-slab';
import { wallSystemTypeStore } from '@pryzm/geometry-wall';
import { ceilingSystemTypeStore } from '@pryzm/core-app-model/stores';
// §FEAT-HANDRAIL-TYPE-PERSISTENCE (C95 §15.7, R3) — the railing CATALOGUE.
import { handrailTypeStore } from '@pryzm/core-app-model/stores';
import { CreateCeilingCommand } from '@pryzm/command-registry';
import { ceilingRestoreBoundaryFields } from '@pryzm/command-registry'; // §OPEN-OLD-CEILING-RESTORE
import { floorSystemTypeStore } from '@pryzm/core-app-model/stores';
import { CreateFloorCommand } from '@pryzm/command-registry';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { hierarchyStore } from '@pryzm/core-app-model';
import { templateStore } from '@pryzm/core-app-model';
import { templateAssignmentStore } from '@pryzm/core-app-model';
import { elementCodeStore } from '@pryzm/core-app-model';
import { semanticGraphManager } from '@pryzm/core-app-model';
import { temporalGraphManager } from '@pryzm/core-app-model';
import { decisionRecordStore } from '@pryzm/core-app-model';
// GR-06 / GR-08 — SINGLE-owner SemanticGraph pre-graph rebuild (was a byte-
// identical private copy in this file AND apps/editor; C71 §5.3 / §7.j).
import { rebuildSemanticGraphFromSnapshot } from './rebuildSemanticGraph';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();
// S70 D8 — Phase-L lifecycle / maintenance imports removed alongside the
// deletion of `src/lifecycle/` per SPEC-27 §4.3 + ADR-030 Part D + ADR-0052 §B.7.
// v5+ snapshots that contain a `.lifecycle` block are read in restore-loop
// below and skipped (forward-compat: a future plugins/lifecycle/ port will
// re-introduce a deserialiser at that surface).

/**
 * §PERSIST-OPENING-NO-SUPERSET (W1-5, 2026-08-11) — back-fill the wall-opening
 * descriptor's OWN missing fields from the hosted door/window record. Nothing more.
 *
 * The persistence-client copy of the rule. **The canonical explanation, including the
 * ADR-0319 classification argument and the proof that the removed keys are not
 * load-bearing, lives on the `packages/command-registry/src/project/projectLoaderUtils.ts`
 * copy** — the one the default-on `ImportProjectCommand` path runs. In short:
 * `frameThickness` / `frameWidth` / `frameColor` / `leafColor` / `fireRating` /
 * `accessibilityType` are `DoorData`/`WindowData` fields, not `Opening` fields, so
 * merging them made the reloaded wall a strict SUPERSET of the live one (certification
 * F-4). `CreateWallOpeningCommand` reads none of them.
 *
 * Three copies of one rule is itself the C11 §5.4 defect; they are kept in lock-step
 * rather than de-duplicated because collapsing them crosses a package boundary that this
 * change is not scoped to. If you edit one, edit all three.
 */
export function findOpeningElementData(snapshot: ProjectSnapshot, opening: any): any {
    if (opening.type === 'window') {
        if (opening.windowType !== undefined) return {};
        const win = snapshot.windows.find(w => w.openingId === opening.id || w.id === opening.elementId);
        return win?.windowType !== undefined ? { windowType: win.windowType } : {};
    }
    if (opening.type === 'door') {
        if (opening.doorType !== undefined) return {};
        const door = snapshot.doors.find(d => d.openingId === opening.id || d.id === opening.elementId);
        return door?.doorType !== undefined ? { doorType: door.doorType } : {};
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
export function migrateRoofSnapshotToCommand(roof: any): import('@pryzm/command-registry').CreateRoofCommand | null {
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
            // §PERSIST-L1 (W1-2) — carry the persisted IFC GUID so the roof's IFC
            // round-trip join key survives reload.
            ifcGuid:       roof.ifcData?.guid,
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
    /**
     * @param provenanceStore PV-05 (C70 I-INV-2) — optional and additive.
     *   When supplied, the C23 AI-lineage slice is restored from the
     *   snapshot; when NOT supplied, the loader says so out loud rather
     *   than leaving the reader to assume the audit log was empty.
     */
    constructor(
        private commandManager: CommandManager,
        private provenanceStore?: import('@pryzm/stores').ProvenanceStore,
    ) {}

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
        const __phase = (name: string) => {
            const now = performance.now();
            if (__phase_starts[name] !== undefined) {
                __phase_ms[name] = now - __phase_starts[name]!;
            }
            __phase_starts[name] = now;
        };
        // ── End PHASE-TIME INSTRUMENTATION ───────────────────────────────────

        // ── PROJECT-LOAD METADATA + EXEC HELPER ──────────────────────────────
        // Every command dispatched during load uses `source: 'PROJECT_LOAD'` so
        // CommandManager skips per-command snapshot creation, undo-history push,
        // and verbose console logging. Together these eliminate the O(N²) cost
        // that made large-project opens take 30+ seconds.
        // See CommandManager.execute() — PROJECT-LOAD FAST PATH comment.
        const LOAD_META = { source: 'PROJECT_LOAD' as const };
        const exec = (cmd: any) => this.commandManager.execute(cmd, LOAD_META);
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
                const { ImportProjectCommand } = await import('@pryzm/command-registry');
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
                    materialId: col.materialId,
                    // §PERSIST-L1 (W1-2) — carry the persisted IFC GUID; it is the IFC
                    // round-trip join key and was re-minted on every reload.
                    ifcGuid: col.ifcData?.guid
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
                    // §PERSIST-L1 (W1-2) — carry the persisted IFC GUID; it is the IFC
                    // round-trip join key and was re-minted on every reload.
                    ifcGuid: wall.ifcData?.guid,
                    // §WALL-RAKE — mirrors apps/editor ProjectLoader.
                    rakeAngleDeg: wall.rakeAngleDeg,
                    // §FIX-SIDEFINISH-PERSISTS (L-999) — restore the per-side finish. THE LOAD
                    // HALF, and the half most easily forgotten: a field can be serialised
                    // perfectly and still be destroyed on reload, because this loop rebuilds
                    // every wall through `CreateWallCommand` and passes a hand-written option
                    // list. Absent in every pre-L-995 snapshot, and absent ⇒ no authored
                    // finish, which is exactly the legacy behaviour.
                    sideFinishes: (wall as { sideFinishes?: Record<string, unknown> }).sideFinishes,
                    systemTypeId: wall.systemTypeId,
                    // §WALL-JOIN-INTENT / §PERSIST-JOININTENT (L-927) — restore what the
                    // AUTHOR DID at each endpoint. Mirrors apps/editor ProjectLoader and
                    // ImportProjectCommand; these restore paths diverging is exactly how
                    // fields get silently dropped on one loader and not another (the same
                    // hazard the serializer twins carry a comment about).
                    //
                    // Unrecoverable if lost: L-923 proved no predicate over geometry, type,
                    // thickness or createdAt separates a mitred-L-plus-newcomer from a
                    // legitimate collinear pass-through. Absent in any pre-L-927 snapshot,
                    // and absent is precisely the legacy behaviour — the store does not
                    // derive during hydration rather than guessing from file order.
                    joinIntent: (wall as {
                        joinIntent?: { start?: 'butt' | 'through'; end?: 'butt' | 'through' };
                    }).joinIntent,
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
                        // §OPEN-OLD-CEILING-RESTORE (2026-07-01) — serialized ceiling
                        // nests polygon/height/thickness/baseOffset under `boundary`;
                        // reading flat fields failed validateCeilingPolygon and counted
                        // every ceiling as a failure. `ceilingRestoreBoundaryFields`
                        // reads `boundary` first (flat fallback for legacy records).
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
            console.log(`[ProjectLoader] Loading ${snapshot.stairs.length} stairs`);
            for (const stair of snapshot.stairs) {
                try {
                    const cmd = new CreateStairCommand({
                        baseLevelId: stair.baseLevelId,
                        topLevelId: stair.topLevelId,
                        shape: stair.shape,
                        riserHeight: stair.riserHeight,
                        treadDepth: stair.treadDepth,
                        width: stair.width,
                        startPosition: stair.startPosition ?? { x: 0, y: 0, z: 0 },
                        flights: stair.flights ?? [],
                        landings: stair.landings,
                        fireRating: stair.fireRating,
                        accessibilityType: stair.accessibilityType,
                        // §PERSIST-L1 (W1-2) — carry the persisted IFC GUID; it is the IFC
                        // round-trip join key and was re-minted on every reload.
                        ifcGuid: stair.ifcData?.guid
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
                // §L-1102 / §L-1037 — LOAD goes through THE ONE payload builder.
                // The hand-assembled 8-field literal that stood here carried
                // neither `materialId` (which SAVE wrote and this side discarded)
                // nor any of the 14 fields SAVE never wrote. It is now a single
                // call, shared with the persistence-client loader, so save and
                // load are a PAIR rather than two lists that agree by habit.
                const cmd = new CreateHandrailCommand(buildHandrailCreatePayload(hr) as any);
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

            // ── Cancellation check (before Step 11) ───────────────────────────
            if (cancelled()) {
                console.log('[ProjectLoader] Load cancelled before curtain walls.');
                return { ...result, success: false };
            }

            // ── Step 11: Curtain Walls (priority 26) ──────────────────────────
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
                        gridYSpacing: cw.gridYSpacing
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
                        fireRating: b.fireRating,
                        // §PERSIST-L1 (W1-2) — carry the persisted IFC GUID; it is the IFC
                        // round-trip join key and was re-minted on every reload.
                        ifcGuid: b.ifcData?.guid
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

                        const restored = slabSystemTypeStore.add({
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

                        const restored = wallSystemTypeStore.add({
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

            // §FEAT-HANDRAIL-TYPE-PERSISTENCE (C95 §15.7, R3) — restore custom
            // HANDRAIL TYPE definitions (the railing catalogue) from the snapshot.
            //
            // ⛔ WHY THIS ARM EXISTS: `handrailTypeStore` is registered on
            // `projectScopeRegistry` with `clear: clearCustomTypes()`, so switching
            // project DELETED every user-authored railing type — while no save path
            // had ever written one. A DESTRUCTOR WITH NO CONSTRUCTOR: a custom type
            // could not survive a reload for any user, in any order of operations
            // (C95 §15.7, measured 2026-08-19).
            //
            // ⭐ IT PRESERVES `raw.id`, AND THAT IS A DELIBERATE DIVERGENCE FROM THE
            // WALL ARM ABOVE. `wallSystemTypeStore.add({name, description, layers})`
            // does not pass the saved id, so a restored wall type comes back under a
            // NEW one. `HandrailTypeStore.add()` takes the whole definition INCLUDING
            // the id, so identity survives — which is what every handrail record's
            // materialised fields, every schedule row and every future library edit
            // needs in order to still point at the same type (C84 EI-1).
            const snapshotHandrailTypes = (snapshot as any).handrailTypes;
            if (Array.isArray(snapshotHandrailTypes) && snapshotHandrailTypes.length > 0) {
                let restoredHandrailTypeCount = 0;
                for (const raw of snapshotHandrailTypes) {
                    try {
                        if (!raw || !raw.id || !raw.name) {
                            console.warn('[ProjectLoader] Skipping malformed handrailType:', raw);
                            continue;
                        }
                        // Already present (a built-in id, or a repeated load) — `add()`
                        // THROWS on a duplicate id, so this guard is load-bearing, not
                        // tidiness.
                        if (handrailTypeStore.getById(raw.id)) continue;

                        // ⛔ `isBuiltIn` is NOT copied from the snapshot. The store sets
                        // it to false itself, and it must: a snapshot claiming
                        // `isBuiltIn: true` for a user type would make it unremovable and
                        // unmodifiable for ever, since `remove()`/`update()` refuse on it.
                        const { isBuiltIn: _ignored, ...definition } = raw as Record<string, unknown>;
                        handrailTypeStore.add(definition as never);
                        restoredHandrailTypeCount++;
                    } catch (e) {
                        console.warn('[ProjectLoader] Failed to restore handrailType:', raw, e);
                    }
                }
                if (restoredHandrailTypeCount > 0) {
                    console.log(`[ProjectLoader] Restored ${restoredHandrailTypeCount} custom handrail type(s) from snapshot.`);
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
            setTimeout(() => {
        // §SWALLOW-OPTIONAL — cache PREWARM only. Every consumer of the intent-style
        // cache populates it lazily on first use, so a failed prewarm costs one frame
        // of latency and changes no result. It is deliberately fired off the load path
        // (setTimeout 0) precisely so it can never fail a project open.
        try { prewarmIntentStyleCache(); } catch { /* §SWALLOW-OPTIONAL */ }
    }, 0);

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
                // §GR10-DESERIALIZE-DROP-REPORT (C71 §5.7 · C70 L-INV-1/I-INV-3).
                // This log used to print `relationships.length` — the INPUT count —
                // as the restored count, so a slice whose rows were half-refused
                // reported full success. It now prints what was ADMITTED, and the
                // refusals travel to result.warnings instead of vanishing.
                const graphLoad = semanticGraphManager.deserialize(snapshot.semanticGraph);
                console.log(`[ProjectLoader] SemanticGraph restored (${graphLoad.loaded} of ${graphLoad.presented} relationship rows admitted)`);
                if (graphLoad.absent) {
                    const msg = `[ProjectLoader] SemanticGraph slice present but UNREADABLE (${graphLoad.absent}) — the graph is not empty, it is UNKNOWN. Nothing was invented in its place.`;
                    console.warn(msg);
                    result.warnings.push(msg);
                }
                if (graphLoad.dropped.length > 0) {
                    // Never a silent drop (C71 §5.7 — a defect that self-erases on
                    // reload is a defect nobody can reproduce). Each row is NAMED
                    // by index/id/reason, never reduced to a bare count.
                    const msg = `[ProjectLoader] SemanticGraph: ${graphLoad.dropped.length} malformed relationship row(s) refused at load — ${graphLoad.dropped.map(d => `#${d.index} ${d.id ?? '<no id>'}: ${d.reason}`).join(' · ')}`;
                    console.warn(msg);
                    result.warnings.push(msg);
                }
            } else {
                semanticGraphManager.clear();
                console.log('[ProjectLoader] SemanticGraph cleared (v1/v2 snapshot — no graph data)');
            }

            // Gap 2 (Phase 3.2): If the graph is empty after deserialize, rebuild it
            // from the snapshot data so pre-graph projects get a populated graph.
            if (semanticGraphManager.size === 0) {
                const { added, unreconstructable } = rebuildSemanticGraphFromSnapshot(snapshot);
                if (added > 0) {
                    console.log(`[ProjectLoader] SemanticGraph rebuilt from snapshot (${added} relationships)`);
                }
                if (unreconstructable.length > 0) {
                    // C70 I-INV-3 — a pre-graph snapshot loses nothing SILENTLY: name
                    // the families the rebuild cannot reconstruct from authoritative state.
                    console.warn(`[ProjectLoader] SemanticGraph rebuild: ${unreconstructable.length} family/families not reconstructable from this snapshot (persist-or-lose, named per C70 I-INV-3): ${unreconstructable.join(', ')}`);
                }
            }

            // PV-05 (C70 I-INV-2): Restore the C23 AI-lineage substrate.
            // Before this, ProvenanceStore had no serialise surface at all
            // and every artefact/edge/snapshot/redaction died on reload.
            if (this.provenanceStore) {
                // Project LOAD replaces the project, so the live lineage is
                // cleared first — hydrate() refuses to merge two lineages
                // (C23 §1.9), and merging is exactly the wrong answer here.
                this.provenanceStore.reset();
                const prov = this.provenanceStore.hydrate(snapshot.provenance);
                if (prov.absent) {
                    // C75 §1.4 / C70 I-INV-3 — the absence is NAMED. A
                    // snapshot without the slice is not a project with no
                    // AI history; it is a project whose AI history predates
                    // provenance persistence and is UNRECOVERABLE.
                    const msg = `[ProjectLoader] Provenance slice absent (${prov.absent}) — the C23 AI-lineage log for this snapshot is NOT empty, it is UNRECOVERABLE. Nothing was invented in its place.`;
                    console.warn(msg);
                    result.warnings.push(msg);
                } else {
                    console.log(`[ProjectLoader] Provenance restored (${prov.artefacts} artefacts, ${prov.edges} edges, ${prov.contextSnapshots} context snapshots, ${prov.redactions} redactions)`);
                }
                if (prov.dropped.length > 0) {
                    // Never a silent drop (the C71 §5.7 ARM E lesson).
                    const msg = `[ProjectLoader] Provenance: ${prov.dropped.length} malformed row(s) refused at load — ${prov.dropped.map(d => `${d.kind} ${d.id}: ${d.reason}`).join(' · ')}`;
                    console.warn(msg);
                    result.warnings.push(msg);
                }
            } else if (snapshot.provenance) {
                // The snapshot HAS a lineage and this session cannot hold
                // it. Saying nothing would let the next save write the key
                // away. Name it (C70 I-INV-3).
                const msg = `[ProjectLoader] Snapshot carries a C23 provenance slice (${snapshot.provenance.artefacts.length} artefacts) but no ProvenanceStore was wired into this loader — the lineage is NOT loaded and MUST NOT be re-saved from this session.`;
                console.warn(msg);
                result.warnings.push(msg);
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
                    const { requirementStore: reqStore } = await import('@pryzm/core-app-model');
                    reqStore.clear();
                    let reqLoaded = 0;
                    for (const record of reqData.records) {
                        try {
                            reqStore.add(record);
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
                try {
                    const { requirementStore: reqStore } = await import('@pryzm/core-app-model');
                    reqStore.clear();
                } catch { /* non-fatal */ }
                console.log('[ProjectLoader] RequirementStore cleared (no requirement data in snapshot)');
            }

            // Autonomous Auditor — Phase 3: Restore AssetCatalogStore.
            // If snapshot contains assetCatalog, restore it directly.
            // If absent (all prior snapshots), re-seed from built-in defaults.
            const catalogData = (snapshot as any).assetCatalog;
            try {
                const { assetCatalogStore: catalogStore } = await import('@pryzm/core-app-model');
                if (catalogData?.entries && Array.isArray(catalogData.entries) && catalogData.entries.length > 0) {
                    catalogStore.setDirect(catalogData.entries);
                    console.log(`[ProjectLoader] AssetCatalogStore restored: ${catalogData.entries.length} entries`);
                } else {
                    // Seed from defaults — new project or pre-Phase-3 snapshot
                    const { buildDefaultAssetCatalog } = await import('@pryzm/core-app-model');
                    catalogStore.setDirect(buildDefaultAssetCatalog());
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
                    const { dxfOverlayStore: dxfStore } = await import('../../import/dxf/DxfOverlayStore');
                    dxfStore.restore(dxfData);
                    console.log(`[ProjectLoader] DxfOverlayStore restored: ${dxfData.overlays.length} overlay(s)`);
                    // Signal that DXF overlays need geometry rebuild after scene is ready
                    _bus.emit('pryzm-dxf-restore-overlays', { overlays: dxfData.overlays }); // F.events.18
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
                    const { ReDetectRoomsCommand } = await import('@pryzm/command-registry');
                    const elevation = (lvl: any) => (typeof lvl.elevation === 'number' ? lvl.elevation : 0);
                    const height    = (lvl: any) => (typeof lvl.height === 'number' ? lvl.height : 3.0);
                    for (const lvl of snapshot.levels) {
                        if (!lvl?.id) continue;
                        try {
                            // [E.5.x] Bus telemetry — fire-and-forget; legacy commandManager drives state during migration.
                            if (window.runtime?.bus) { window.runtime.bus.executeCommand('element.legacyBridge', {}).catch(() => {}); }
                            this.commandManager.execute(
                                new ReDetectRoomsCommand(lvl.id, elevation(lvl), height(lvl))
                            );
                        } catch (e) {
                            console.warn(`[ProjectLoader] Final REDETECT_ROOMS failed for level '${lvl.id}':`, e);
                        }
                    }
                } catch (err) {
                    console.warn('[ProjectLoader] Could not import ReDetectRoomsCommand for final sweep:', err);
                }
            }
            // ── End topology observer resume ──────────────────────────────────

            // ── UNDO STACK — clear after rehydration (Contract 20 GAP-3) ─────
            // Even though PROJECT_LOAD-sourced commands are not pushed onto the
            // undo stack, clear it defensively so any stale entries from before
            // the open are gone. Users opening a project should always start
            // with an empty undo history.
            try { this.commandManager.clearHistory(); } catch (e) { /* no-op */ }
            // ── End undo stack clear ──────────────────────────────────────────

            // Reference loadedLevelIds so TS strict mode doesn't flag it unused.
            // (Reserved for future per-level instrumentation.)
            void loadedLevelIds;

            __phase('redetect_sweep'); // explicit per-level ReDetectRoomsCommand sweep
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

            console.groupEnd();
        }

        return result;
    }

    // GR-06 / GR-08 — the SemanticGraph pre-graph rebuild used to live here as a
    // private method AND as a byte-identical copy in apps/editor's ProjectLoader.
    // It is now the single-owner `rebuildSemanticGraphFromSnapshot` (imported
    // above); both loaders call it. See ./rebuildSemanticGraph.ts (C71 §5.3/§7.j).

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
