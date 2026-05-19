/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Command
 * Phase:             Phase 1 (Current)
 *                    Performance — Curtain Wall Batch Optimisation
 * Files Modified:    CreateCurtainWallsOnAllSlabsCommand.ts
 * Classification:    B (performance enhancement — no semantic model changes)
 *
 * Critical Fixes (from CURTAIN-WALL-CONTRACT-AUDIT.md + §2026-03-14 audit):
 *   #2  Removed subCommand.execute() calls — sub-commands must never be executed directly
 *       from another command (bypasses CommandManager; breaks history/validation)
 *       Logic is now inlined from CreateCurtainWallsFromSlabCommand
 *   #4  IDs drawn from constructor-level idPool — NOT generated inside execute() (§2.6)
 *       On redo, createdIdsBySlabId (populated on first execute) are reused
 *   #5  Throws SpatialAuthorityError on missing level — no Y=0 fallback
 *   #8  baseLine at level-plane (Y=0); baseOffset is relative
 *   #12 idPool pre-generated in constructor so execute() never calls crypto.randomUUID() (§2.6)
 *
 * Performance Fixes (§37-BATCH-CW-PERF-SPRINT.md):
 *   §REG-MANY-P1  Per-level registration grouping — replaces per-wall trackRegistration()
 *                 calls with ONE per unique level (≤ L calls). Combined with §REG-MANY-P0
 *                 (BimManager.registerMany) and §REG-MANY-P2 (BatchCoordinator sync-drain),
 *                 reduces registration phase from ~462 ms (29 rAF frames) to ~2 ms.
 *   PERF-ADDMANY  _processSlabs() now accumulates all CurtainWallData objects in a local
 *                 array and calls curtainWallStore.addMany() ONCE after the slab loop,
 *                 replacing per-wall store.add() calls. Eliminates the O(n²) progressive-
 *                 store-scan pattern (15→135 ms per slab). Estimated saving: 400–600 ms.
 *   PERF-PREWARM  _prewarmCurtainWallShaders() renders three InstancedMesh probes against
 *                 the PRODUCTION scene before runBatch() so WebGPU/WebGL compiles all
 *                 curtain-wall PSO variants (mullion, glass DoubleSide, fallback panel)
 *                 in the exact pipeline context before any real geometry arrives.
 *                 Eliminates the first-frame shader-compilation stall (~800–1,200 ms).
 *                 Called BEFORE batchCoordinator.runBatch() (not inside _processSlabs)
 *                 so the loading overlay is visible throughout the prewarm render.
 *   PERF-PREWARM-ONCE  private static _shadersPrewarmed = false guards the prewarm so
 *                 it fires ONCE per browser session.  Subsequent execute() calls (redo,
 *                 re-run after undo) skip the prewarm entirely — GPU PSO cache stays warm.
 *                 Removes ~800–1,200 ms from every batch after the first.
 *
 * Contract References:
 *   §2.7  No direct builder call — store.addMany() → storeEventBus → subscriber → builder
 *   §2.4  Spatial registration per created wall, after store mutation
 *   §01 §2.5  Commands must not execute other commands
 *
 * Change: _processSlabs uses addMany(); _prewarmCurtainWallShaders() added.
 * Impact:
 *   Semantic Impact:   No — same wall data, same IDs, same IFC GUIDs
 *   Undo/Redo Impact:  No — undo() uses remove() (unchanged); redo uses has() skip + addMany()
 *   Event Bus Impact:  No — addMany() preserves per-item storeEventBus.emit() contract
 * Risk Level: Low
 */

import { Command, CommandType, CommandValidationResult, CommandResult, SerializedCommand, CommandContext } from '../types';
import * as THREE from '@pryzm/renderer-three/three';
import { CurtainWallData } from '@pryzm/geometry-curtain-wall';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { batchCoordinator } from '@pryzm/core-app-model';
import { storeEventBus } from '@pryzm/core-app-model';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

export interface CreateCurtainWallsOnAllSlabsPayload {
    height?: number;
    gridXSpacing?: number;
    gridYSpacing?: number;
}

export class CreateCurtainWallsOnAllSlabsCommand implements Command {
    // §CURTAIN-WALL-AUDIT-2026 §13 — slab + level are project-wide read inputs;
    // only the curtainWall store is mutated by this batch.
    readonly affectedStores = ["curtainWall"] as const;
    readonly id = crypto.randomUUID();
    readonly type = CommandType.CREATE_CURTAIN_WALLS_ON_ALL_SLABS;
    readonly timestamp = Date.now();
    targetIds: string[] = [];

    /**
     * §2.6: IDs pre-generated at construction time, not inside execute().
     * Pool size of 2000 covers large projects (200 slabs × 10 edges each).
     * execute() consumes IDs in order via poolIndex; redo bypasses the pool
     * entirely by reusing createdIdsBySlabId entries from the first execute().
     *
     * §POOL-OVERFLOW-FIX: If the pool is exhausted (polygon-heavy floors with
     * many edges), _nextId() falls back to crypto.randomUUID() on first execute.
     * This is safe because every generated ID — whether from the pool or the
     * fallback — is persisted in createdIdsBySlabId, so redo always reuses the
     * same stable IDs regardless of which path produced them.
     *
     * §II-6 (Sprint 1): Pool is now lazy — filled just before runBatch() to the
     * right-sized estimate, not 2000 at construction time. Eliminates 2000 upfront
     * allocations per command instantiation regardless of project size.
     * Pool is drained by pop() (O(1)); any overflow generates on demand.
     * On redo the pool is unused — createdIdsBySlabId supplies all IDs.
     */
    private _idPool: string[] = [];

    /** Returns the next pre-generated ID, or generates a new one if pool is exhausted. */
    private _nextId(): string {
        const id = this._idPool.pop();
        if (id !== undefined) return id;
        return crypto.randomUUID();
    }

    /**
     * §Critical #4/#7: IDs actually consumed per slab; NOT cleared on undo so redo is symmetric.
     * Map<slabId, cwId[]> — preserves per-slab association for debugging.
     */
    private createdIdsBySlabId: Map<string, string[]> = new Map();

    /**
     * PERF-PREWARM-ONCE (Fix 1 — §39-CURTAIN-WALL-BATCH §5 Task 2):
     * WebGPU PSOs compiled during the first prewarm are cached by the GPU driver
     * for the entire browser session.  Subsequent batches (redo, re-run after undo)
     * hit the cache at ~0 ms cost.  Without this flag the expensive production-scene
     * render (~800–1,200 ms) fires on EVERY execute(), not just the first.
     *
     * Static (class-level) so the flag persists across command instance lifetimes —
     * each `new CreateCurtainWallsOnAllSlabsCommand()` shares the single compiled state.
     *
     * §PREWARM-SCALE-GUARD (BN-02 fix, 2026-05-06):
     * _prewarmWallCount tracks the estimated wall count at the time prewarm last ran.
     * If a subsequent batch is ≥ 1.5× larger (e.g. a 21-slab run after a 6-slab
     * prewarm), _shadersPrewarmed is reset so prewarm re-runs at the correct scale.
     *
     * Rationale: Although WebGPU PSO compilation is NOT keyed on instance count,
     * the renderer's framebuffer configuration (MSAA sample count, attachment layout,
     * GBuffer descriptor) may have changed between the small prewarm and the large
     * batch — e.g. HDRI load, viewport resize, quality-setting change.  A PSO
     * compiled for the old FBO descriptor cannot be reused for the new one, causing
     * a full recompile on the first post-batch render.  Re-running prewarm before the
     * larger batch compiles PSOs against the CURRENT renderer state, ensuring the cache
     * is valid when the first real render fires.
     */
    private static _shadersPrewarmed = false;

    /**
     * §PREWARM-SCALE-GUARD: wall count at the time _shadersPrewarmed was last set.
     * Compared against estimatedWallCount in execute() to detect scale jumps.
     */
    private static _prewarmWallCount = 0;

    /**
     * §PERF-TRACE: Monotonically incrementing counter shared across all instances.
     * Each execute() call gets a short trace ID (e.g. "CW#1", "CW#2") so every log
     * line from the same batch can be filtered with a single grep/Ctrl+F in DevTools.
     */
    private static _batchTraceCounter = 0;

    /**
     * DEV TOOLING: Reset the one-time prewarm flag at runtime without a page reload.
     * Used during performance profiling to force-repro the first-run PSO compilation.
     * Exposed on `window.__resetCwPrewarm` (see module-level registration below class).
     *
     * Architecturally: static method so no instance is needed; module-level IIFE
     * registers it once on first import — never on every execute().
     */
    static resetPrewarm(): void {
        CreateCurtainWallsOnAllSlabsCommand._shadersPrewarmed = false;
        CreateCurtainWallsOnAllSlabsCommand._prewarmWallCount = 0;
        console.log(
            '[CreateCurtainWallsOnAllSlabsCommand] §DEV: _shadersPrewarmed reset to false, _prewarmWallCount reset to 0. ' +
            'Next execute() will re-compile PSOs (first-run prewarm will fire again).'
        );
    }

    constructor(private payload: CreateCurtainWallsOnAllSlabsPayload) {}

    canExecute(context: CommandContext): CommandValidationResult {
        const slabStore = context.stores.slabStore;
        if (!slabStore) return { ok: false, reason: 'Slab store not available' };

        const slabs = slabStore.getAll();
        if (slabs.length === 0) return { ok: false, reason: 'No slabs found in model' };

        const missingLevel = slabs.find(s => {
            if (!s.levelId) return true;
            return !context.bimManager.getLevelById(s.levelId);
        });
        if (missingLevel) {
            return { ok: false, reason: `Slab '${missingLevel.id}' references missing level '${missingLevel.levelId}'` };
        }

        return { ok: true };
    }

    execute(context: CommandContext): CommandResult {
        const slabStore = context.stores.slabStore;
        const curtainWallStore = context.stores.curtainWallStore;

        if (!slabStore || !curtainWallStore) {
            return { success: false, affectedElementIds: [], info: ['Stores not available'] };
        }

        const slabs = slabStore.getAll();
        const allCreatedIds: string[] = [];
        const isRedo = this.createdIdsBySlabId.size > 0;

        // §A.6 — Idempotency guard: prevent double-dispatch (e.g. rapid double-click or
        // concurrent AI command invocation). Redo is always safe to run; only guard
        // first-execute duplicate batches where the coordinator is still draining.
        // isBatching stays true from runBatch() until Phase 5 onComplete (~1.3s), so
        // any second first-execute dispatch within that window is blocked here.
        if (!isRedo && batchCoordinator.isBatching) {
            console.warn(
                `[CreateCurtainWallsOnAllSlabsCommand] §A6-IDEMPOTENCY: ` +
                `batch already in progress (batchId=${window.__activeBatchId ?? 'none'}) — ` +
                `skipping duplicate first-execute dispatch to prevent ` +
                `${slabs.length}-slab double creation.`
            );
            return { success: false, affectedElementIds: [], info: ['Batch already in progress — skipped'] };
        }

        const __t_cmd_start = performance.now();
        const __traceId = `CW#${++CreateCurtainWallsOnAllSlabsCommand._batchTraceCounter}`;
        console.log(
            `[CreateCurtainWallsOnAllSlabsCommand] §TRACE-${__traceId} START ` +
            `slabCount=${slabs.length} isRedo=${isRedo} ` +
            `shadersPrewarmed=${CreateCurtainWallsOnAllSlabsCommand._shadersPrewarmed} ` +
            `T=+0ms`
        );

        // §PERF-BATCH-BUS: Pre-collect curtain-wall specs for the bus dispatch so the
        // second full polygon-iteration (lines ~260-300) can be replaced with a simple
        // reference to this pre-built array.  Populated only on first execute (!isRedo);
        // on redo the bus dispatch block below falls through without pushing new specs.
        const busCwSpecs: Array<{
            id: string;
            levelId: string;
            baseLine: [{ x: number; y: number; z: number }, { x: number; y: number; z: number }];
            height: number;
            bayWidth: number;
            bayHeight: number;
            mullionThickness: number;
        }> = [];

        // P1.2: The slab loop is extracted as a closure so it can be passed to
        // batchCoordinator.runBatch(fn, opts) on first execute. On redo it runs directly
        // (walls already registered; rAF queue bypassed by curtainWallStore.has() guard).
        //
        // runBatch() depth-counting flow (P1.1 + P1.2):
        //   beginBatch()           → storeEventBus depth: 0 → 1  (outer async bracket)
        //   storeEventBus.batch()  → storeEventBus depth: 1 → 2  (inner sync bracket)
        //   _processSlabs() runs   → store.addMany() buffered at depth 2
        //   batch() returns        → storeEventBus depth: 2 → 1  (no flush — outer still open)
        //   … rAF registration drain …
        //   _executeFinalSweep()   → storeEventBus depth: 1 → 0  → FLUSH all events
        //   If _processSlabs throws → batch() discards buffer (depth 2→1), runBatch catch
        //     calls endBatch() (depth 1→0, empty flush), resets _isBatching. Bus clean.
        //
        // PERF-ADDMANY: _processSlabs() accumulates all CurtainWallData objects into a
        // local `collectedWalls` array during the slab loop and calls
        // curtainWallStore.addMany(collectedWalls) ONCE after the loop.  This replaces
        // per-wall store.add() calls and eliminates the O(n²) progressive-store-scan
        // pattern (each add() notified subscribers while the store was still growing).
        // All existing logic — CCW winding, degenerate edge skip, createdIdsBySlabId
        // population, busCwSpecs collection, _regGroupsByLevel accumulation — is unchanged.
        const _processSlabs = () => {
            // §DIAG-49800MS (2026-05-05): Granular phase timers to isolate the 49.8 s
            // LONGTASK observed on the second CW batch in a project with 126 existing walls.
            // Each _t_phase_* marks a synchronous boundary inside _processSlabs() so the
            // Chrome Performance panel can show exactly which sub-phase dominates.
            // These are left in intentionally — they add <1 µs overhead each and provide
            // critical insight when the 49.8 s recurs on the next recording.
            const _t_processSlabs_start = performance.now();
            const _existingCwCount = typeof (curtainWallStore as any).getAll === 'function'
                ? ((curtainWallStore as any).getAll() as unknown[]).length
                : -1;
            const _busDepthAtEntry = (storeEventBus as any)._batchDepth ?? -1;
            const _isCoordinatorBatching = batchCoordinator.isBatching;
            console.log(
                `[CreateCurtainWallsOnAllSlabsCommand] §DIAG-49800MS _processSlabs() ENTER ` +
                `busDepth=${_busDepthAtEntry} isBatching=${_isCoordinatorBatching} ` +
                `existingCwCount=${_existingCwCount} ` +
                `T=+${(_t_processSlabs_start - __t_cmd_start).toFixed(1)}ms`
            );

            // §REG-MANY-P1: Accumulate per-level registration groups instead of queuing one
            // trackRegistration() per wall.  After the slab loop we push ONE trackRegistration
            // per unique level that calls bimManager.registerMany() — collapsing the queue from
            // N entries (231 walls) to L entries (≤ 21 levels).
            // Combined with §REG-MANY-P2 (BatchCoordinator sync-drain for L ≤ 50) this
            // eliminates the 29-frame / ~462 ms rAF drain entirely.
            const _regGroupsByLevel = new Map<string, string[]>();

            // PERF-ADDMANY: Collect all CurtainWallData objects here; addMany() called once
            // after the slab loop so subscribers see the fully-populated store from the start.
            const collectedWalls: CurtainWallData[] = [];

            for (const slab of slabs) {
                const __t_slab_loop_start = performance.now();
                let __wallCountThisSlab = 0;
                if (!slab.polygon || slab.polygon.length < 3 || !slab.levelId) continue;

                // §Critical #5: Throw on missing level — no silent fallback to Y=0
                const level = context.bimManager.getLevelById(slab.levelId);
                if (!level) {
                    throw new Error(`SpatialAuthorityError: Level '${slab.levelId}' not found in BimManager`);
                }

                const polygon = slab.polygon;
                const slabPos = slab.position;
                const height = this.payload.height ?? 3.0;

                // CCW winding order — plain {x,y} avoids THREE import in data-processing path
                // (C01 P2: THREE allowed only in packages/renderer-three/; THREE.Vector2 was
                // only used here for its .x/.y accessors, which plain objects satisfy equally)
                const points = (polygon as any[]).map((p: any) => ({ x: p.x as number, y: p.y as number }));
                const area = points.reduce((acc: number, p: { x: number; y: number }, i: number) => {
                    const next = points[(i + 1) % points.length]!;
                    return acc + (next.x - p.x) * (next.y + p.y);
                }, 0);
                const orderedPoints = area > 0 ? [...points].reverse() : points;

                const existingIds = isRedo ? (this.createdIdsBySlabId.get(slab.id) ?? []) : [];
                const slabCreatedIds: string[] = [];

                for (let i = 0; i < orderedPoints.length; i++) {
                    const start2D = orderedPoints[i];
                    const end2D = orderedPoints[(i + 1) % orderedPoints.length];

                    // §Critical #8: baseLine at level-plane (Y = 0); builder resolves worldY
                    // P0.3 DTO Migration: plain Point3D objects — no THREE.Vector3 in store data.
                    const start = { x: start2D.x + slabPos.x, y: 0, z: start2D.y + slabPos.z };
                    const end   = { x: end2D.x   + slabPos.x, y: 0, z: end2D.y   + slabPos.z };

                    const dx = end.x - start.x, dz = end.z - start.z;
                    if (Math.sqrt(dx * dx + dz * dz) < 0.001) continue;

                    // §2.6: Draw from constructor-level pool on first execute; reuse saved IDs on redo.
                    const cwId = (isRedo && existingIds[slabCreatedIds.length])
                        ? existingIds[slabCreatedIds.length]
                        : this._nextId();

                    // PERF-ADDMANY: on redo, addMany() skips has()-present items (idempotent),
                    // so the has() guard here serves only to populate allCreatedIds correctly
                    // without adding a duplicate entry to collectedWalls.
                    if (curtainWallStore.has?.(cwId)) {
                        slabCreatedIds.push(cwId);
                        allCreatedIds.push(cwId);
                        continue;
                    }

                    const cwData: CurtainWallData = {
                        id: cwId,
                        type: 'curtain-wall',
                        levelId: slab.levelId,
                        baseLine: [start, end],
                        height,
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

                    // PERF-ADDMANY: Accumulate into batch array; store.addMany() fires once
                    // after the entire slab loop so subscribers see the complete set.
                    collectedWalls.push(cwData);
                    __wallCountThisSlab++;

                    // §PERF-BATCH-BUS: collect spec inline so the bus dispatch block
                    // below does NOT need to re-run the polygon/winding-order logic.
                    if (!isRedo) {
                        busCwSpecs.push({
                            id: cwId,
                            levelId: slab.levelId,
                            baseLine: [start, end],
                            height,
                            bayWidth: this.payload.gridXSpacing ?? 1.2,
                            bayHeight: this.payload.gridYSpacing ?? 1.5,
                            mullionThickness: 0.05,
                        });
                    }

                    // §REG-MANY-P1: Accumulate into per-level group instead of pushing one
                    // trackRegistration() per wall.  Grouped batch is registered below after
                    // the slab loop via bimManager.registerMany() — ONE call per level group.
                    if (!_regGroupsByLevel.has(slab.levelId)) {
                        _regGroupsByLevel.set(slab.levelId, []);
                    }
                    _regGroupsByLevel.get(slab.levelId)!.push(cwId);

                    slabCreatedIds.push(cwId);
                    allCreatedIds.push(cwId);
                }

                if (!isRedo && slabCreatedIds.length > 0) {
                    this.createdIdsBySlabId.set(slab.id, slabCreatedIds);
                }
                console.log(`[CreateCurtainWallsOnAllSlabsCommand] slab="${slab.id}" walls=${__wallCountThisSlab} elapsed=${(performance.now() - __t_slab_loop_start).toFixed(1)}ms`);
            }

            // §DIAG-49800MS PHASE-1: Slab loop complete
            const _t_slab_loop_done = performance.now();
            console.log(
                `[CreateCurtainWallsOnAllSlabsCommand] §DIAG-49800MS PHASE-1-SLAB-LOOP-DONE ` +
                `collected=${collectedWalls.length} slabLoopMs=${(_t_slab_loop_done - _t_processSlabs_start).toFixed(1)}ms ` +
                `busDepthNow=${(storeEventBus as any)._batchDepth ?? '?'} ` +
                `T=+${(_t_slab_loop_done - __t_cmd_start).toFixed(1)}ms`
            );

            // PERF-ADDMANY: Single batch insertion AFTER the slab loop.
            // Internal CurtainWallStore listeners see the fully-populated Map on every
            // notification call, eliminating O(n²) progressive-scan overhead.
            // storeEventBus events are buffered at depth 2 (inside storeEventBus.batch())
            // and delivered in the final yielded drain — identical semantics to per-item add().
            if (collectedWalls.length > 0) {
                curtainWallStore.addMany(collectedWalls);
                // §DIAG-49800MS PHASE-2: addMany complete
                const _t_addMany_done = performance.now();
                console.log(
                    `[CreateCurtainWallsOnAllSlabsCommand] §DIAG-49800MS PHASE-2-ADDMANY-DONE ` +
                    `count=${collectedWalls.length} addManyMs=${(_t_addMany_done - _t_slab_loop_done).toFixed(1)}ms ` +
                    `busDepthNow=${(storeEventBus as any)._batchDepth ?? '?'} ` +
                    `T=+${(_t_addMany_done - __t_cmd_start).toFixed(1)}ms`
                );
            }

            // §DIAG-49800MS PHASE-3: Registration queue
            const _t_reg_start = performance.now();

            // §REG-MANY-P1: Enqueue ONE trackRegistration() per unique level group.
            // Each lambda calls bimManager.registerMany() — O(L + N) total vs O(N × L × n)
            // for the previous per-wall trackRegistration() approach.
            // With ≤ 21 level groups queued, BatchCoordinator's §REG-MANY-P2 sync-drain
            // path fires synchronously (threshold = 50) — 0 rAF frames, ~2 ms total.
            // On redo, trackRegistration() executes immediately (not batching).
            for (const [lvlId, ids] of _regGroupsByLevel) {
                const capturedIds = ids; // closure capture — stable reference
                batchCoordinator.trackRegistration(() => {
                    context.bimManager.registerMany(capturedIds, lvlId);
                    // §A.3 — Use registerSemanticOrReplace() instead of registerSemantic().
                    // registerSemantic() throws if the ID is already present — this crashed on
                    // redo because the ID was registered by the first execute() and not cleared
                    // by unregister() in undo() before the redo trackRegistration closure ran.
                    // registerSemanticOrReplace() is a safe upsert: identical semantics on first
                    // execute, no throw on redo. The storeType is always 'curtainwall' — no
                    // information is lost by overwriting.
                    for (const id of capturedIds) {
                        elementRegistry.registerSemanticOrReplace(id, 'curtainwall');
                    }
                });
            }

            // §DIAG-49800MS PHASE-3 complete — registration closures queued (not yet executed)
            const _t_processSlabs_end = performance.now();
            console.log(
                `[CreateCurtainWallsOnAllSlabsCommand] §DIAG-49800MS PHASE-3-REG-QUEUED ` +
                `levelGroups=${_regGroupsByLevel.size} regQueueMs=${(_t_processSlabs_end - _t_reg_start).toFixed(1)}ms ` +
                `totalProcessSlabsMs=${(_t_processSlabs_end - _t_processSlabs_start).toFixed(1)}ms ` +
                `busDepthNow=${(storeEventBus as any)._batchDepth ?? '?'} ` +
                `T=+${(_t_processSlabs_end - __t_cmd_start).toFixed(1)}ms`
            );
        };

        // §I-1 (Sprint 1): Compute affectedLevelIds before the if/else so both the
        // first-execute and redo paths can pass the same level set to runBatch().
        const affectedLevelIds = [...new Set(
            slabs
                .filter(s => s.polygon && s.polygon.length >= 3 && s.levelId)
                .map(s => s.levelId!)
        )];

        if (!isRedo) {
            // First execute: wrap store mutations in runBatch() for safe, batched event delivery.
            const estimatedWallCount = slabs.reduce(
                (acc, s) => acc + (s.polygon ? Math.max(0, s.polygon.length) : 0), 0
            );

            // PERF-PREWARM-ONCE (Fix 1 — §39-CURTAIN-WALL-BATCH §5 Task 2):
            // Call _prewarmCurtainWallShaders() ONCE per browser session, BEFORE runBatch(),
            // so the loading overlay (_setupBatch) is already visible when the expensive
            // production-scene render fires. The static flag prevents re-compilation on every
            // subsequent execute() — PSO cache stays warm for the remainder of the session.
            //
            // §PREWARM-SCALE-GUARD (BN-02 fix, 2026-05-06):
            // If this batch is ≥ 1.5× larger than the last prewarm scale, reset and re-run.
            // Renderer FBO configuration (MSAA, attachment layout) may have changed between
            // a small initial prewarm and a larger production batch; re-warming compiles PSOs
            // against the current renderer state and prevents the post-batch LONGTASK.
            //
            // Why here (not inside _processSlabs):
            //   _processSlabs() runs INSIDE runBatch() → inside storeEventBus.batch(fn).
            //   The browser cannot paint between storeEventBus.beginBatch() and batch(fn),
            //   so placing prewarm there means the loading overlay never appears before the
            //   freeze. By calling prewarm here — after _setupBatch (which shows the overlay)
            //   but before runBatch runs _processSlabs — the spinner is visible throughout.
            const _scaleJump =
                CreateCurtainWallsOnAllSlabsCommand._shadersPrewarmed &&
                CreateCurtainWallsOnAllSlabsCommand._prewarmWallCount > 0 &&
                estimatedWallCount > CreateCurtainWallsOnAllSlabsCommand._prewarmWallCount * 1.5;

            if (_scaleJump) {
                // §PREWARM-SCALE-GUARD: batch is significantly larger than last prewarm.
                // Reset and re-run so PSOs are compiled against the CURRENT renderer state.
                console.log(
                    `[CreateCurtainWallsOnAllSlabsCommand] §TRACE-${__traceId} PREWARM-SCALE-RESET ` +
                    `estimatedWalls=${estimatedWallCount} prevPrewarmWalls=${CreateCurtainWallsOnAllSlabsCommand._prewarmWallCount} ` +
                    `ratio=${(estimatedWallCount / CreateCurtainWallsOnAllSlabsCommand._prewarmWallCount).toFixed(2)}× ` +
                    `(≥1.5× scale jump — re-warming PSOs for current renderer state) ` +
                    `T=+${(performance.now() - __t_cmd_start).toFixed(1)}ms`
                );
                CreateCurtainWallsOnAllSlabsCommand._shadersPrewarmed = false;
            }

            if (!CreateCurtainWallsOnAllSlabsCommand._shadersPrewarmed) {
                const __t_prewarm_start = performance.now();
                console.log(
                    `[CreateCurtainWallsOnAllSlabsCommand] §TRACE-${__traceId} PREWARM-START ` +
                    `estimatedWalls=${estimatedWallCount} ` +
                    `T=+${(__t_prewarm_start - __t_cmd_start).toFixed(1)}ms`
                );
                // BN-05a+BN-05b: _prewarmCurtainWallShaders() now returns true only when
                // the prewarm was architecturally valid (pipeline ready + ≥30ms elapsed).
                // If it returns false, _shadersPrewarmed is NOT set — next execute() retries.
                const prewarmValid = this._prewarmCurtainWallShaders(estimatedWallCount);
                if (prewarmValid) {
                    CreateCurtainWallsOnAllSlabsCommand._shadersPrewarmed = true;
                    CreateCurtainWallsOnAllSlabsCommand._prewarmWallCount = estimatedWallCount;
                    console.log(
                        `[CreateCurtainWallsOnAllSlabsCommand] §TRACE-${__traceId} PREWARM-DONE ` +
                        `prewarmMs=${(performance.now() - __t_prewarm_start).toFixed(1)}ms ` +
                        `prewarmWallCount=${estimatedWallCount} ` +
                        `T=+${(performance.now() - __t_cmd_start).toFixed(1)}ms`
                    );
                } else {
                    console.warn(
                        `[CreateCurtainWallsOnAllSlabsCommand] §TRACE-${__traceId} PREWARM-FAILED ` +
                        `_shadersPrewarmed NOT set — prewarm will retry on next execute(). ` +
                        `T=+${(performance.now() - __t_cmd_start).toFixed(1)}ms`
                    );
                }
            } else {
                console.log(
                    `[CreateCurtainWallsOnAllSlabsCommand] §TRACE-${__traceId} PREWARM-SKIP ` +
                    `(already warm — PSO cache hit; prevScale=${CreateCurtainWallsOnAllSlabsCommand._prewarmWallCount} estimatedWalls=${estimatedWallCount}) ` +
                    `T=+${(performance.now() - __t_cmd_start).toFixed(1)}ms`
                );
            }

            const __t_runbatch_start = performance.now();
            console.log(
                `[CreateCurtainWallsOnAllSlabsCommand] §TRACE-${__traceId} RUNBATCH-START ` +
                `levelCount=${affectedLevelIds.length} estimatedWalls=${estimatedWallCount} ` +
                `T=+${(__t_runbatch_start - __t_cmd_start).toFixed(1)}ms`
            );
            // §II-6 (Sprint 1): Fill the lazy ID pool to just above the estimated wall count.
            // Moves UUID generation from construction time (fixed 2000) to execute() pre-batch
            // (right-sized to this project's geometry). Capped at 500; overflow uses crypto on demand.
            this._idPool = Array.from(
                { length: Math.min(Math.ceil(estimatedWallCount * 1.1) + 10, 500) },
                () => crypto.randomUUID()
            );
            batchCoordinator.runBatch(_processSlabs, {
                levelIds: affectedLevelIds,
                totalElementCount: estimatedWallCount,
                // §FIX-SKIP-REDETECT-ROOMS (2026-05-05): Curtain walls are transparent
                // glass facade elements that cannot define interior room boundaries.
                // Skipping rooms.redetect eliminates ~12,738ms + 1,271ms + 9×~1,000ms
                // ≈ 23 s of main-thread LONGTASKs while correctness is fully preserved
                // (REDETECT_ROOMS for this batch produced 0 new rooms in all test runs).
                // markLevelsDirty(levelIds) is still called so plan-view reprojection
                // (EdgeProjectorService) shows the new curtain walls in the 2D floor plan.
                skipRedetectRooms: true,
                // §FIX-SKIP-PBR-UPGRADE (2026-05-05): Curtain wall materials are already
                // MeshStandardMaterial (PBR-ready) — the post-batch PBR upgrade pass
                // traverses the entire scene (626+ meshes) and calls needsUpdate=true on
                // materials that are already in the correct state.  Measured cost: ~482ms
                // for 626 meshes even after the chunk fix.  Skipping it for curtain-wall
                // batches eliminates this cost with no visual regression.
                skipPbrUpgrade: true,
            });
            console.log(
                `[CreateCurtainWallsOnAllSlabsCommand] §TRACE-${__traceId} RUNBATCH-RETURNED ` +
                `(sync phase done; rAF drain pending) ` +
                `runBatchMs=${(performance.now() - __t_runbatch_start).toFixed(1)}ms ` +
                `T=+${(performance.now() - __t_cmd_start).toFixed(1)}ms`
            );
        } else {
            // §I-1 (Sprint 1): Redo must also go through runBatch(). Without it, N individual
            // build events fire unprotected — no render-suppress overlay, no batch suppression,
            // no coalesced rAF drain — producing a LONGTASK and visually unstable scene for
            // large redo operations. The curtainWallStore.has() guard inside _processSlabs()
            // ensures idempotency: walls already in the store are skipped cleanly.
            if (batchCoordinator.isBatching) {
                // Rare: redo fired while a prior batch is still draining (e.g. command-manager
                // race). Fall back to the direct path — the active batch will drain these events.
                console.warn(
                    `[CreateCurtainWallsOnAllSlabsCommand] §I-1-REDO-WARN: ` +
                    `redo fired mid-batch (batchId=${window.__activeBatchId ?? 'none'}) — ` +
                    `using direct path; walls will be drained by the active batch.`
                );
                _processSlabs();
            } else {
                const redoWallCount = [...this.createdIdsBySlabId.values()]
                    .reduce((sum, ids) => sum + ids.length, 0);
                const __t_redo_runbatch_start = performance.now();
                console.log(
                    `[CreateCurtainWallsOnAllSlabsCommand] §TRACE-${__traceId} REDO-RUNBATCH-START ` +
                    `levelCount=${affectedLevelIds.length} redoWalls=${redoWallCount} ` +
                    `T=+${(__t_redo_runbatch_start - __t_cmd_start).toFixed(1)}ms`
                );
                batchCoordinator.runBatch(_processSlabs, {
                    levelIds: affectedLevelIds,
                    totalElementCount: redoWallCount,
                    skipRedetectRooms: true,
                    skipPbrUpgrade: true,
                });
                console.log(
                    `[CreateCurtainWallsOnAllSlabsCommand] §TRACE-${__traceId} REDO-RUNBATCH-RETURNED ` +
                    `(sync phase done; rAF drain pending) ` +
                    `runBatchMs=${(performance.now() - __t_redo_runbatch_start).toFixed(1)}ms ` +
                    `T=+${(performance.now() - __t_cmd_start).toFixed(1)}ms`
                );
            }
        }

        this.targetIds = allCreatedIds;

        // E.5.x P2e: Dispatch to the command bus for event-recording and future undo-bus
        // migration.  Fire-and-forget — errors here must NOT affect the legacy path result.
        // The legacy curtainWallStore.add() path above is still the authoritative geometry
        // trigger; the bus handler writes to the plugin store as a parallel record.
        // §PERF-BATCH-BUS: busCwSpecs was populated inline inside _processSlabs() above,
        // eliminating the previous second full polygon/winding-order iteration (O(n) saved).
        try {
            const runtimeBus = window.runtime?.bus;
            if (runtimeBus?.registry?.has?.('curtain-wall.batch.create') && busCwSpecs.length > 0) {
                runtimeBus.executeCommand('curtain-wall.batch.create', {
                    curtainWalls: busCwSpecs,
                    height: this.payload.height ?? 3.0,
                }).catch((busErr: unknown) => {
                    console.warn(
                        '[CreateCurtainWallsOnAllSlabsCommand] E.5.x P2e curtain-wall.batch.create bus dispatch failed ' +
                        '(non-fatal — legacy curtainWallStore is authoritative):',
                        busErr,
                    );
                });
                console.log(`[CommandBus] DISPATCH: curtain-wall.batch.create — ${busCwSpecs.length} curtain wall(s)`);
            }
        } catch (busErr) {
            console.warn('[CreateCurtainWallsOnAllSlabsCommand] E.5.x P2e bus dispatch failed (non-fatal):', busErr);
        }

        console.log(
            `[CreateCurtainWallsOnAllSlabsCommand] §TRACE-${__traceId} COMPLETE ` +
            `walls=${allCreatedIds.length} isRedo=${isRedo} ` +
            `totalMs=${(performance.now() - __t_cmd_start).toFixed(1)}ms ` +
            `(rAF geometry drain + registration + event drain still pending async)`
        );
        return {
            success: true,
            affectedElementIds: allCreatedIds,
            info: [`Created ${allCreatedIds.length} curtain walls across ${slabs.length} slabs`]
        };
    }

    /**
     * PERF-PREWARM: Render an invisible MeshStandardMaterial probe so WebGPU compiles
     * the curtain-wall shader programs before the first real geometry frame.
     *
     * Without pre-warming, the first render after a 400-wall batch triggers synchronous
     * shader compilation (~150–300 ms LONGTASK on WebGPU) that blocks the main thread.
     * Pre-warming moves this cost to just before runBatch() — before any geometry exists —
     * so the batch itself and the first render frame both run with warm shaders.
     *
     * Implementation: creates a 1 mm² invisible Mesh, forces one render() call, then
     * immediately removes and disposes the probe.  The material's transparent+opacity=0
     * properties ensure it does not appear even if the render frame is visible.
     *
     * Returns `true` when the prewarm was architecturally valid (pipeline ready AND the
     * three render passes took ≥ 30ms, proving PSOs were actually compiled).  Returns
     * `false` on any guard failure — callers MUST NOT set `_shadersPrewarmed = true`
     * when this returns false, so the next execute() retries the prewarm.
     *
     * BN-05a — phase guard: rpm.render(0) is a no-op when the pipeline is in
     *   'error', 'initializing', or 'binding' state (e.g. after a WebGPU device loss).
     *   Aborting here prevents a silent no-op prewarm that leaves `_shadersPrewarmed`
     *   incorrectly set to true, causing a 14,175ms cold-PSO LONGTASK on first render.
     *
     * BN-05b — timing guard: a valid prewarm for ≥ 1 PSO variant takes ≥ 50ms.
     *   Three passes completing in < 30ms total is physically impossible if any PSO
     *   compilation occurred.  Values below the threshold confirm a no-op path and
     *   prevent the flag from being set on a failed prewarm.
     *
     * Wrapped in try/catch: any failure (renderer not ready, scene not available, etc.)
     * is non-fatal and returns false — the batch proceeds regardless.
     *
     * Called only on !isRedo; redo reuses compiled shader programs from the GPU cache.
     *
     * @param estimatedWallCount  Used only for trace logging context.
     */
    private _prewarmCurtainWallShaders(estimatedWallCount: number): boolean {
        try {
            // BN-05a: Abort prewarm if the render pipeline manager is in an error,
            // initializing, or binding state — rpm.render(0) is a complete no-op in
            // these states.  Setting _shadersPrewarmed=true would incorrectly mark the
            // PSOs as compiled, deferring a 14,175ms cold-compile LONGTASK to the first
            // post-batch render frame (after the overlay lifts, fully blocking the user).
            const rpm = window.renderPipelineManager;
            if (!rpm) {
                console.warn(
                    `[CreateCurtainWallsOnAllSlabsCommand] §BN-05a PREWARM-ABORT: ` +
                    `renderPipelineManager not available — prewarm skipped, _shadersPrewarmed NOT set`
                );
                return false;
            }
            const phase: string = (rpm as any).status?.phase
                ?? (rpm as any)._phase
                ?? (rpm as any).phase
                ?? 'unknown';
            if (phase === 'error' || phase === 'initializing' || phase === 'binding') {
                console.warn(
                    `[CreateCurtainWallsOnAllSlabsCommand] §BN-05a PREWARM-ABORT: ` +
                    `pipeline phase="${phase}" — rpm.render(0) would be a no-op. ` +
                    `_shadersPrewarmed NOT set (will retry on next execute). ` +
                    `estimatedWalls=${estimatedWallCount}`
                );
                return false;
            }

            // BN-09a: GPU-recovery cooldown guard.
            //
            // After a WebGL context loss or WebGPU device loss, Three.js's WebGPU backend
            // retains stale render objects (nodeBuilderState=undefined) from the dead device.
            // When rpm.render(0) fires during this window, OutlineNode tries to compile its
            // depth shader ("vertex_OutlineNode.depth") against these stale objects → WebGPU
            // errors → each render() call aborts in ~3ms (BN-05b catches the 11ms total).
            // The cooldown prevents prewarm from firing until the render loop has had enough
            // frames to garbage-collect all stale render objects from the previous device.
            //
            // The cooldown is set (Date.now() + 5000) by the webglcontextlost handler in
            // initScene.ts and the WebGPU device-loss handler in createRenderer.ts.
            const _cooldownUntil = window.__cwPrewarmCooldownUntil ?? 0;
            if (Date.now() < _cooldownUntil) {
                const _remainingMs = (_cooldownUntil - Date.now()).toFixed(0);
                console.warn(
                    `[CreateCurtainWallsOnAllSlabsCommand] §BN-09a PREWARM-ABORT: ` +
                    `GPU recovery cooldown active — ${_remainingMs}ms remaining before prewarm is allowed. ` +
                    `OutlineNode would bind stale GPU buffers (vertex_OutlineNode.depth errors) ` +
                    `and abort renders in ~3ms (BN-05b would catch it). ` +
                    `_shadersPrewarmed NOT set. estimatedWalls=${estimatedWallCount}`
                );
                return false;
            }

            const __prewarmRenderStart = performance.now();
            // P4-CLEAN: bimWorld is typed in src/global-window.d.ts.
            // §39-CURTAIN-WALL-BATCH Task 2 (FIX 2026-05-05): Use renderer.compile()
            // via the OBC context (window.bimWorld.renderer.three) instead of
            // window.pryzmRenderer.render().
            //
            // WHY renderer.compile() instead of renderer.render():
            //   renderer.compile(scene, camera) triggers WebGPU PSO compilation for all
            //   materials currently in the scene — including the probe meshes added below —
            //   WITHOUT producing a visible output frame.  This avoids the ~800–1,200 ms
            //   synchronous render cost of the previous approach while still warming the
            //   shader pipeline.  scale.setScalar(0) on each probe ensures zero GPU
            //   rasterisation cost even if a stray render fires during the compile call.
            //
            // WHY bimWorld.renderer.three (not window.pryzmRenderer):
            //   window.pryzmRenderer is the PASCAL post-processing renderer which renders
            //   into a separate FBO pipeline.  PSOs compiled via that renderer do not share
            //   the OBC pipeline state objects used for the production scene render that
            //   follows the batch.  bimWorld.renderer.three is the underlying WebGL/WebGPU
            //   renderer for the OBC production scene — PSOs compiled here are reused on
            //   the next OBC frame → ~0 ms LONGTASK on first post-batch render.
            const scene    = window.bimWorld?.scene?.three as THREE.Scene | undefined;
            const camera   = window.bimWorld?.camera?.three;
            // Phase 5: pryzmRenderer IS the WebGPU renderer driving all real frames.
            // bimWorld.renderer.three is OBC's WebGL renderer, locked to MANUAL mode —
            // PSOs compiled there are discarded when pryzmRenderer fires. Fall back to
            // the OBC renderer only when Phase 5 is not active (WebGPU unavailable).
            const renderer = window.pryzmRenderer ?? window.bimWorld?.renderer?.three;
            if (!scene || !camera || !renderer) {
                console.warn(
                    `[CreateCurtainWallsOnAllSlabsCommand] §BN-05a PREWARM-ABORT: ` +
                    `scene/camera/renderer not available — _shadersPrewarmed NOT set`
                );
                return false;
            }

            // Shared probe geometry — BoxGeometry attribute layout (position, normal, uv)
            // is the same regardless of dimensions; WebGPU PSO is keyed on layout not values.
            const probeGeom = new THREE.BoxGeometry(0.001, 0.001, 0.001);

            // ── Probe 1: Mullion InstancedMesh (opaque MeshStandardMaterial) ───────
            // Matches: CurtainWallBuilder lines 720–727 + 807/834
            //   new THREE.InstancedMesh(BoxGeometry, MeshStandardMaterial{
            //     metalness:0.1, roughness:0.2 }, N)
            //   castShadow=false, receiveShadow=false  (§Step-2B shadow-deferral)
            //
            // KEY FIX (2026-05-05): Previous prewarm used `new THREE.Mesh` which compiles
            // a DIFFERENT vertex shader (no gl_InstanceID / instance matrix attributes).
            // InstancedMesh uses a distinct PSO → without this probe WebGPU compiled
            // ~1,000 new PSOs during the first drain frame → measured 9,559 ms LONGTASK.
            const mullionMat = new THREE.MeshStandardMaterial({
                color: '#333333',
                metalness: 0.1,
                roughness: 0.2,
            });
            const mullionIM = new THREE.InstancedMesh(probeGeom, mullionMat, 1);
            mullionIM.castShadow    = false;
            mullionIM.receiveShadow = false;
            // §FIX-PREWARM-SCALE (2026-05-06): Use 0.0001 (0.1mm) instead of 0.
            // In WebGL mode, shader compilation is triggered by actual draw calls.
            // scale=0 produces degenerate geometry that is frustum-culled or generates
            // zero-area primitives → no draw call → no shader compile → prewarm is a no-op
            // (confirmed by BN-05b: prewarmRenderMs=6.1ms < 30ms threshold).
            // scale=0.0001 generates real (if invisible) draw calls → PSOs compile.
            // frustumCulled=false ensures the mesh is processed regardless of camera position.
            mullionIM.scale.setScalar(0.0001);
            mullionIM.frustumCulled = false;
            mullionIM.setMatrixAt(0, new THREE.Matrix4());
            mullionIM.instanceMatrix.needsUpdate = true;

            // ── Probe 2: Panel InstancedMesh (transparent MeshStandardMaterial, DoubleSide) ─
            // Matches: CurtainWallInstanceManager lines 104–115 (overridden by build() step 2B)
            //   new THREE.InstancedMesh(BoxGeometry(1,1,thick), MeshStandardMaterial{
            //     transparent, DoubleSide }, N)
            //   castShadow=false, receiveShadow=false  (§Step-2B override in build())
            //
            // DoubleSide changes the rasterizer state → distinct PSO from FrontSide.
            const glassMat = new THREE.MeshStandardMaterial({
                color:       0x88ccff,
                transparent: true,
                opacity:     0.4,
                metalness:   0.1,
                roughness:   0.1,
                side:        THREE.DoubleSide,
            });
            const glassIM = new THREE.InstancedMesh(probeGeom, glassMat, 1);
            glassIM.castShadow    = false;
            glassIM.receiveShadow = false;
            // §FIX-PREWARM-SCALE (2026-05-06): same as mullionIM above — 0.0001 + frustumCulled=false.
            glassIM.scale.setScalar(0.0001);
            glassIM.frustumCulled = false;
            glassIM.setMatrixAt(0, new THREE.Matrix4());
            glassIM.instanceMatrix.needsUpdate = true;

            // ── Probe 3: Fallback panel Mesh (transparent MeshStandardMaterial, FrontSide) ─
            // Matches: CurtainWallBuilder._getFallbackPanelMaterial() lines 1117–1124
            //   new THREE.Mesh(BoxGeometry, MeshStandardMaterial{
            //     transparent:true, opacity:0.4, metalness:0.1, roughness:0.1 })
            //   castShadow=false, receiveShadow=false  (§Step-2B shadow-deferral)
            //
            // This is a plain Mesh (not InstancedMesh) → distinct PSO from probes 1+2.
            const fallbackMat = new THREE.MeshStandardMaterial({
                color:       0x88ccff,
                transparent: true,
                opacity:     0.4,
                metalness:   0.1,
                roughness:   0.1,
            });
            const fallbackMesh = new THREE.Mesh(probeGeom, fallbackMat);
            fallbackMesh.castShadow    = false;
            fallbackMesh.receiveShadow = false;
            // §FIX-PREWARM-SCALE (2026-05-06): same as mullionIM above — 0.0001 + frustumCulled=false.
            fallbackMesh.scale.setScalar(0.0001);
            fallbackMesh.frustumCulled = false;

            // Add all three probes to the production scene, render once via the full
            // production pipeline, then remove and dispose.
            //
            // WHY renderPipelineManager.render(0) NOT renderer.compile():
            //   WebGPURenderer.compile() is ASYNC — it returns a Promise.  Calling it
            //   without await starts compilation but the Promise resolves after our call
            //   site returns, so the PSO cache is NOT warm when the batch's first real
            //   render fires → LONGTASK.
            //   RenderPipelineManager.render(delta) is synchronous (void return) and
            //   executes the exact same pipeline (ScenePass MRT → SSGI → TRAA → outlines)
            //   with the same FBO descriptors as every production frame.  PSOs compiled
            //   here are guaranteed to be reused on every subsequent production render.
            //   scale.setScalar(0) ensures probes produce zero visible pixels; the render
            //   cost is purely shader compilation (~100–300 ms hidden under the overlay).
            // §I.1.2 — NEW Phase 2 variant: SSGI shadow-receiver probe.
            // A mesh with receiveShadow=true triggers the PCF shadow-receiver PSO variant
            // in the WebGPU Phase 2 pipeline (SSGI + shadow map PCF kernel).
            // Without this probe, the first post-batch render compiles the shadow-receiver
            // PSO cold → contributes to the 422ms Cluster A PSO storm (doc 47 §3.1).
            const shadowReceiverMat = new THREE.MeshStandardMaterial({
                color: 0x334455, roughness: 0.6,
            });
            const shadowReceiverProbe = new THREE.Mesh(probeGeom, shadowReceiverMat);
            shadowReceiverProbe.receiveShadow = true;
            shadowReceiverProbe.scale.setScalar(0.0001);
            shadowReceiverProbe.frustumCulled = false;

            // §I.1.3 — NEW Phase 2 variant: depth pre-pass probe.
            // A transparent mesh with depthWrite=true triggers the depth pre-pass PSO variant.
            // Phase 2 renders a depth pre-pass for transparent geometry to resolve draw-order
            // ambiguities; this probe ensures the pre-pass PSO is compiled in prewarm.
            const depthPrepassMat = new THREE.MeshStandardMaterial({
                transparent: true, opacity: 0.3, depthWrite: true,
            });
            const depthPrepassProbe = new THREE.Mesh(probeGeom, depthPrepassMat);
            depthPrepassProbe.scale.setScalar(0.0001);
            depthPrepassProbe.frustumCulled = false;

            scene.add(mullionIM);
            scene.add(glassIM);
            scene.add(fallbackMesh);
            scene.add(shadowReceiverProbe);  // §I.1.2
            scene.add(depthPrepassProbe);    // §I.1.3

            // BN-05b: Capture time immediately before the render calls.
            // A valid prewarm compiles ≥ 1 PSO variant — minimum measured time ~50ms.
            // Completing 3 passes in < 30ms proves the renders were no-ops (pipeline in
            // bad state that the BN-05a phase check did not catch, or rpm.render is a stub).
            // In that case we return false so _shadersPrewarmed is NOT set.
            const PREWARM_MIN_VALID_MS = 30;
            let __prewarmRenderMs = 0;

            // BN-09b: Drain OutlineNode selection arrays before prewarm renders.
            //
            // rpm.selectedObjects / rpm.hoveredObjects are LIVE arrays passed by reference
            // into the OutlineNode when the phase-4 pipeline was built.  OutlineNode reads
            // them on every rp.render() call to decide which objects need a depth outline
            // pass.  On a post-device-loss scene these arrays may contain stale Object3D
            // references whose GPU uniform buffers are invalid on the new device.  When
            // OutlineNode iterates them it tries to bind "bindingBufferundefined_UniformBuffer"
            // labels (undefined because the stale object's id is undefined in the new
            // backend) → cascading GPU errors → each rpm.render(0) abort in ~3ms.
            //
            // Draining the arrays before the prewarm renders — and restoring them after —
            // gives OutlineNode a clean slate: zero objects to outline = zero uniform-buffer
            // lookups = zero stale-reference errors.  Restoring immediately after (in the
            // finally block) means live selections are unaffected to the user.
            const _prewarmSavedSelected: THREE.Object3D[] = rpm.selectedObjects.splice(0);
            const _prewarmSavedHovered:  THREE.Object3D[] = rpm.hoveredObjects.splice(0);

            try {
                if (rpm?.render) {
                    // §PERF-PREWARM-MULTIPAS (2026-05-05): Run 3 render passes to force
                    // all pipeline phases to compile their PSO variants before the batch starts.
                    //
                    // Why 3 passes are necessary:
                    //   Pass 1 — ScenePass MRT forward render: populates the GBuffer
                    //            (albedo, normals, depth, velocity). Compiles MRT PSOs for
                    //            all probe material variants (mullion opaque IM, glass
                    //            transparent DoubleSide IM, fallback Mesh FrontSide).
                    //
                    //   Pass 2 — SSGI denoiser: reads the GBuffer produced by Pass 1.
                    //            On first execution with an empty/stale GBuffer the SSGI
                    //            implementation may take a no-op path and skip compilation
                    //            of its full denoiser PSO variants. Pass 2 ensures the
                    //            denoiser sees a valid GBuffer and compiles all 3 kernel
                    //            PSOs (horizontal, vertical blur + composite).
                    //
                    //   Pass 3 — TRAA + outline passes: TRAA accumulates the current frame
                    //            against the history buffer (seeded by Pass 2). Outline pass
                    //            runs edge-detect over the depth/normal GBuffer. Both passes
                    //            compile their PSOs on first execution with valid input.
                    //
                    // Cost: ~3× the single-pass prewarm (≈ 150ms → ≈ 450ms).
                    // Saving: eliminates the 6,644ms post-batch PSO-compile LONGTASK that
                    //         fires on the first real production render after suppression lifts.
                    // Net: −6,200ms user-visible freeze (hidden under the batch overlay).
                    rpm.render(0); // Pass 1: ScenePass MRT — populates GBuffer
                    rpm.render(0); // Pass 2: SSGI denoiser — compiles full denoiser PSOs
                    rpm.render(0); // Pass 3: TRAA history + outline edge-detect PSOs

                    // §K.2 — Shadow-pass PSO prewarm (4th render pass).
                    //
                    // Root cause of Cluster B (live log 2026-05-07): T+30s shadow reactivation
                    // triggered 8 LONGTASKs / 1,591ms / FPS=6 because WebGPU compiled shadow-pass
                    // PSO variants cold for each unique material+geometry combination in the scene.
                    //
                    // Fix: Enable castShadow on existing CW probes + add a temporary
                    // shadow-receiving plane and DirectionalLight. A 4th rpm.render(0) with these
                    // probes compiles the shadow-pass PSO variants into the WebGPU driver cache.
                    // By T+30s (K.1 slice drain), PSOs are cached → each K.1 slice pays only
                    // traverse cost (~2ms/50 walls), not PSO compilation cost (274–341ms).
                    //
                    // K.2 uses shadow.mapSize.set(64, 64) — minimal resolution purely for PSO
                    // compilation. The actual shadow quality at T+30s is determined by the scene's
                    // production light settings, not by this prewarm pass.
                    let _k2ShadowGroundProbe: THREE.Mesh | null = null;
                    let _k2ShadowLight: THREE.DirectionalLight | null = null;
                    try {
                        mullionIM.castShadow = true;   // enable shadow casting on existing probes
                        glassIM.castShadow  = true;
                        const _k2ShadowMat = new THREE.MeshStandardMaterial({ color: 0x888888 });
                        _k2ShadowGroundProbe = new THREE.Mesh(
                            new THREE.PlaneGeometry(0.001, 0.001),
                            _k2ShadowMat
                        );
                        _k2ShadowGroundProbe.receiveShadow = true;
                        _k2ShadowGroundProbe.rotation.x = -Math.PI / 2;
                        _k2ShadowGroundProbe.frustumCulled = false;
                        _k2ShadowLight = new THREE.DirectionalLight(0xffffff, 0.001);
                        _k2ShadowLight.castShadow = true;
                        _k2ShadowLight.shadow.mapSize.set(64, 64);  // minimal — PSO only, not quality
                        scene.add(_k2ShadowGroundProbe, _k2ShadowLight);
                        rpm.render(0); // Pass 4: shadow-map PSO compile (§K.2)
                        console.log(
                            '[CreateCurtainWallsOnAllSlabsCommand] §K2-SHADOW-PSO-PREWARM complete — ' +
                            'shadow-pass PSOs compiled in 4th render pass. ' +
                            'K.1 T+30s slices will pay traverse cost only (≤2ms/slice).'
                        );
                    } catch (_k2Err) {
                        console.warn(
                            '[CreateCurtainWallsOnAllSlabsCommand] §K2 shadow PSO prewarm failed (non-fatal):', _k2Err
                        );
                    } finally {
                        mullionIM.castShadow = false;  // restore before finally-block probe removal
                        glassIM.castShadow  = false;
                        if (_k2ShadowGroundProbe) {
                            scene.remove(_k2ShadowGroundProbe);
                            (_k2ShadowGroundProbe.geometry as THREE.BufferGeometry).dispose();
                            (_k2ShadowGroundProbe.material as THREE.Material).dispose();
                        }
                        if (_k2ShadowLight) scene.remove(_k2ShadowLight);
                    }

                    __prewarmRenderMs = performance.now() - __prewarmRenderStart;
                } else {
                    console.warn(
                        `[CreateCurtainWallsOnAllSlabsCommand] §BN-05a PREWARM-ABORT: ` +
                        `rpm.render not available — _shadersPrewarmed NOT set`
                    );
                    return false;
                }
            } finally {
                // BN-09b: Restore selection arrays unconditionally (return, throw, or normal exit).
                // splice(0) captured everything above; push the items back so the user's
                // current selection/hover state is preserved after the prewarm renders.
                if (_prewarmSavedSelected.length > 0) {
                    rpm.selectedObjects.push(..._prewarmSavedSelected);
                }
                if (_prewarmSavedHovered.length > 0) {
                    rpm.hoveredObjects.push(..._prewarmSavedHovered);
                }
                scene.remove(mullionIM);
                scene.remove(glassIM);
                scene.remove(fallbackMesh);
                scene.remove(shadowReceiverProbe);  // §I.1.2
                scene.remove(depthPrepassProbe);     // §I.1.3
                probeGeom.dispose();
                mullionMat.dispose();
                glassMat.dispose();
                fallbackMat.dispose();
                shadowReceiverMat.dispose();   // §I.1.2
                depthPrepassMat.dispose();     // §I.1.3
            }

            // BN-05b: Timing validity check — must be AFTER finally (probes disposed regardless).
            if (__prewarmRenderMs < PREWARM_MIN_VALID_MS) {
                console.warn(
                    `[CreateCurtainWallsOnAllSlabsCommand] §BN-05b §PREWARM-FAILED ` +
                    `prewarmRenderMs=${__prewarmRenderMs.toFixed(1)}ms < ${PREWARM_MIN_VALID_MS}ms threshold — ` +
                    `PSOs NOT compiled (rpm.render was a no-op). ` +
                    `_shadersPrewarmed NOT set (will retry on next execute). ` +
                    `estimatedWalls=${estimatedWallCount}`
                );
                return false;
            }

            console.log(
                `[CreateCurtainWallsOnAllSlabsCommand] §I1-PREWARM-PHASE2 complete — ` +
                `5 PSO variants × 3 pipeline passes pre-compiled via renderPipelineManager.render(0) ` +
                `(MRT→SSGI→TRAA+outlines): mullionIM + glassIM + fallbackMesh + ` +
                `shadowReceiverProbe (§I.1.2) + depthPrepassProbe (§I.1.3). ` +
                `prewarmRenderMs=${__prewarmRenderMs.toFixed(1)}ms`
            );
            return true;
        } catch (e) {
            console.warn('[CreateCurtainWallsOnAllSlabsCommand] PERF-PREWARM: shader pre-warm failed (non-fatal):', e);
            return false;
        }
    }

    undo(context: CommandContext): CommandResult {
        const curtainWallStore = context.stores.curtainWallStore;
        if (!curtainWallStore) return { success: false, affectedElementIds: [] };

        const undoneIds: string[] = [];
        this.createdIdsBySlabId.forEach(ids => {
            for (const id of ids) {
                // §2.4: Unregister before store deletion (reverse execute ordering)
                context.bimManager.unregisterElement(id);
                elementRegistry.unregister(id);
                // store.remove() → storeEventBus → subscriber → builder.remove()
                curtainWallStore.remove(id);
                undoneIds.push(id);
            }
        });

        // §CURTAIN-WALL-AUDIT-2026 §6.5 — coalesce a single 'bim-curtainwall-removed'
        // event for the entire batch undo so listeners refresh only once.
        // NOTE: window.dispatchEvent is a C11 §5.3 known gap (system-wide, 131 sites),
        // tracked for Sprint S03 — the 4 subscribers (SelectionManager, engineLauncher:796,
        // UnifiedBrowserPanel, SaveOrchestrator) are all window.addEventListener-based so
        // switching emit without updating subscribers would break undo UI refresh.
        if (!batchCoordinator.isBatching) {
            _bus.emit('bim-curtainwall-removed', { ids: undoneIds }); // F.events.17
        } else {
            batchCoordinator.trackPostBatchWindowEvent('bim-curtainwall-removed');
        }

        // E.5.x §P2e-CW-undo: keep the plugin CurtainWallsState in sync with the
        // legacy curtainWallStore removal. execute() dual-writes to both stores via
        // curtain-wall.batch.create; undo() must mirror that with a batch.delete so
        // the plugin store doesn't retain stale walls (redo duplicate accumulation fix).
        // Fire-and-forget — legacy store is authoritative; plugin store failure is non-fatal.
        const runtimeBus = window.runtime?.bus;
        if (runtimeBus?.registry?.has?.('curtain-wall.batch.delete') && undoneIds.length > 0) {
            runtimeBus.executeCommand('curtain-wall.batch.delete', { ids: undoneIds })
                .catch((busErr: unknown) => {
                    console.warn(
                        '[CreateCurtainWallsOnAllSlabsCommand] E.5.x P2e curtain-wall.batch.delete bus dispatch failed ' +
                        '(non-fatal — legacy store removal succeeded):',
                        busErr,
                    );
                });
        }

        // §Critical #4/#7: Do NOT clear createdIdsBySlabId — redo needs them
        return { success: true, affectedElementIds: undoneIds };
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

// ── DEV TOOLING: module-level registration (runs once on first import) ───────
//
// Architecturally sound placement:
//   • NOT inside execute() — that would re-register on every command run.
//   • NOT inside the class body — static initializers run on class definition,
//     but 'typeof window' guards are awkward there.
//   • Module-level IIFE runs exactly once when this module is first imported
//     (i.e. when EngineBootstrap/CommandManager first loads the command class).
//
// Usage (browser DevTools console):
//   window.__resetCwPrewarm()
//     → Clears _shadersPrewarmed — next execute() re-compiles PSOs.
//     → Use before profiling to reproduce the first-run LONGTASK.
//
//   window.__resetCwPrewarm.__traceCount
//     → How many batch traces have been recorded this session.
//
if (typeof window !== 'undefined') {
    const resetFn = () => {
        CreateCurtainWallsOnAllSlabsCommand.resetPrewarm();
        (resetFn as any).__traceCount = (CreateCurtainWallsOnAllSlabsCommand as any)._batchTraceCounter;
    };
    (resetFn as any).__traceCount = 0;
    window.__resetCwPrewarm = resetFn;
    console.debug(
        '[CreateCurtainWallsOnAllSlabsCommand] §DEV: window.__resetCwPrewarm() registered. ' +
        'Call it in DevTools to re-enable first-run PSO prewarm for next execute().'
    );
}
