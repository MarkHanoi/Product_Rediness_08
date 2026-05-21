/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Builder (Projection Layer)
 * Phase:             Phase 1 — Addressable Grid + Panel System
 *                    Step 2 — Buffered Registration Architecture
 *                    PERF-FIX-1 — Interactive Placement Shadow Deferral
 * Files Modified:    CurtainWallBuilder.ts
 *
 * Phase 1 Enhancements:
 *   - Reads CurtainGridSystem from CurtainWallData (or migrates from scalar spacing)
 *   - Computes cells via CurtainCellComputer (pure, unit-testable)
 *   - Reads per-cell panel data from CurtainPanelStore (via window.curtainPanelStore) // TODO(TASK-08)
 *   - Renders panels via CurtainWallInstanceManager (InstancedMesh — 1 draw call per type)
 *   - Falls back to CurtainPanelBuilder for panels with materialOverride
 *
 * Step 2 Enhancements — GPU Batch Architecture:
 *
 *   A. Mullion InstancedMesh (Layer 2 — GPU Draw Call Reduction)
 *      Previously: N_u vertical mullions + N_v horizontal mullions = separate THREE.Mesh
 *      per mullion, each as a distinct draw call. For 126 walls × ~10 mullions each:
 *      ~1260 individual Mesh objects and draw calls.
 *
 *      New: For each curtain wall, vertical mullions share ONE THREE.InstancedMesh
 *      (all sharing the same BoxGeometry) and horizontal mullions share ONE
 *      THREE.InstancedMesh. This reduces per-wall mullion objects from
 *      (N_u + N_v) Mesh → 2 InstancedMesh, and draw calls from ~10 → 2 per wall.
 *      For 126 walls: ~1260 draw calls → 252 draw calls (5× reduction).
 *
 *   B. Shadow Deferral (TSL Shadow Map Optimization)
 *      During a batch (batchCoordinator.isBatching = true), new wall meshes are built
 *      with castShadow = false and receiveShadow = false. This skips the per-wall
 *      shadow map recalculation pass — in Three.js, each new shadow caster triggers
 *      a full shadow frustum re-traversal. For 126 walls that is 126 traversals.
 *
 *      The builder registers a shadowReactivationCallback with BatchCoordinator.
 *      After ALL geometry is in the scene AND all registrations are drained,
 *      BatchCoordinator fires the callback, which walks _batchShadowPending and
 *      re-enables castShadow/receiveShadow on all deferred wall groups in a SINGLE pass.
 *      Shadow map recalculation then fires ONCE over the completed scene.
 *
 * PERF-FIX-2 — Sliced Batch Shadow Reactivation (2026-04-08):
 *
 *   Root cause: After the rAF build queue drained for a 44-wall batch, the existing
 *   _reactivateShadows() set castShadow=true on 44 walls × 3 meshes = 132 objects
 *   synchronously in one function call. Three.js WebGPU responded with one consolidated
 *   shadow pass that still took 400–600ms, blocking _executeFinalSweep() and
 *   REDETECT_ROOMS from firing.
 *
 *   Fix: _reactivateShadows() now schedules a SINGLE one-shot drain (WALLS_PER_SHADOW_FRAME=10000
 *   — all walls in one call) via setTimeout(30000) and RETURNS IMMEDIATELY. The 30-second
 *   delay guarantees the post-batch PSO + EdgeProjector LONGTASK storm (~13s total) has fully
 *   cleared before any shadow rebuild runs. Shadow cost is O(total_scene_casters) not O(new
 *   walls), so one shot minimises total rebuilds; slicing would multiply cost N-fold.
 *   See §PERF-SHADOW-ONE-SHOT for the full slicing-fallacy analysis and measured data.
 *   No visual difference — walls receive shadows within ~4 RAF frames of batch completion.
 *
 * PERF-FIX-1 — Interactive Placement Shadow Deferral (2026-04-08):
 *
 *   Root cause: During interactive single-wall placement (CurtainWallTool active),
 *   every new wall mesh enters the scene with castShadow = true. Three.js WebGPU then
 *   fires a full shadow map traversal (123–255ms per wall) synchronously between RAF
 *   frames — causing visible stutter on every click.
 *
 *   Fix: The Tool calls CurtainWallBuilder.beginPlacementMode() on activate() and
 *   endPlacementMode() on deactivate(). While placement mode is active, the deferShadows
 *   flag is true even outside of batchCoordinator.isBatching. Deferred walls accumulate
 *   in _interactiveShadowPending (separate from _batchShadowPending). When the tool
 *   deactivates, endPlacementMode() calls _flushInteractiveShadows() which re-enables
 *   shadows on all deferred walls in one requestIdleCallback pass — a single GPU flush
 *   instead of one per wall.
 *
 *   Expected gain: ~90% latency reduction for interactive placement.
 *   Per-wall perceived latency: 150–300ms → <5ms (shadow cost deferred to idle).
 *
 * Backward Compatibility:
 *   - If no gridSystem on CurtainWallData → migrates from gridXSpacing / gridYSpacing
 *   - If no curtainPanelStore on window → falls back to procedural glass panel rendering
 *   - All existing contract compliance is preserved (§02, §3.2, §4.3, §4.5, §2.4)
 *
 * Original Critical Fixes (from CURTAIN-WALL-CONTRACT-AUDIT.md) retained:
 *   #6  Added remove() method with proper geometry+material disposal
 *   #3  Builder is now driven exclusively by the subscriber in main.ts
 *   #13 §02 §1.3: Explicit error logging when BimManager or level is unavailable
 *
 * Contract References:
 *   §02 §1.2  worldY computed from BimManager.getLevelById()
 *   §4.5      Root group is reused (clear children) not destroyed and recreated
 *   §4.3      Geometries and materials are disposed before rebuild
 *   §3.2      userData: { id, type, levelId, version } stamped on root group
 *   §2.4      elementRegistry.registerSemantic() called on first build; idempotent
 *   §01 §4.3  Shadow flags are projection state — builder may modify them
 *   §02 §6.1  Tool only calls static builder methods; does not touch scene/userData/store
 *
 * Impact Assessment:
 *   Store Impact:          None — builder never touches store
 *   Command Impact:        None — commands no longer call builder directly
 *   Other Builders/Tools:  None — isolated module
 *   Shadow Visual Impact:  Shadows appear after tool deactivation (not per-wall)
 *                          This matches expected UX — user is focused on placement,
 *                          not shadow accuracy, during the draw phase.
 *
 * Risk Level: Low
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { CurtainWallData } from './CurtainWallTypes';
import { VisualStyle } from '@pryzm/core-app-model/material-library';
import { migrateToGridSystem } from './CurtainGridSystem';
import { computeCurtainCells } from './CurtainCellComputer';
import { CurtainPanelBuilder } from './CurtainPanelBuilder';
import { CurtainWallInstanceManager } from './CurtainWallInstanceManager';
import { CurtainPanelData } from './CurtainPanelTypes';
import { CurtainPanelStore } from './CurtainPanelStore';
import { batchCoordinator } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { GeometryWorkerPool } from './GeometryWorkerPool';
import { DOMEventBus, type EventCatalog } from '@pryzm/event-bus';
const _bus = new DOMEventBus();
import type {
    SerializableCell,
    GeometryWorkerResult,
} from './GeometryWorkerTypes';

/**
 * §CURTAIN-WALL-AUDIT-2026 §5.4 — Dependency-injection struct for
 * CurtainWallBuilder. Cross-layer collaborators (bimManager, panelStore,
 * roomTopologyObserver, planSymbolCache) MUST be supplied explicitly so the
 * builder no longer reads `window.*` directly. Window fallbacks are
 * retained ONLY for backward compatibility during the migration window.
 */
export interface CurtainWallBuilderDependencies {
    bimManager?: any;
    curtainPanelStore?: CurtainPanelStore;
    roomTopologyObserver?: any;
    planSymbolCache?: any;
    /**
     * §C.4.1 — Thin interface to EdgeProjectorService so remove() can invalidate
     * the CW projection cache without importing the full service module.
     * Optional — missing at construction time is valid (lazy EPS facade not yet created).
     */
    edgeProjectorService?: { invalidateCwElement: (id: string) => void };
}

// ---------------------------------------------------------------------------
// Task 4.2 — Worker pipeline internal types (not exported; builder-private)
// ---------------------------------------------------------------------------

/**
 * Main-thread context stored while a geometry worker request is in-flight.
 * Contains everything needed to reconstruct scene objects when the worker
 * result arrives, without re-reading any store or manager.
 */
interface InflightWorkerBuild {
    /** The root Group already added to the scene and positioned. */
    group: THREE.Group;
    /** Original wall data (for userData, parentId on child meshes). */
    cw: CurtainWallData;
    /** Whether shadows are deferred (batch / placement mode). */
    deferShadows: boolean;
    /** Resolved mullion material (from cache). */
    mullionMat: THREE.MeshStandardMaterial;
    /** Resolved fallback glass material (from cache). */
    fallbackPanelMat: THREE.MeshStandardMaterial;
    /** Count of vertical mullion instances (= uLines.length). */
    uSortedCount: number;
    /** Count of horizontal mullion instances (= vLines.length). */
    vSortedCount: number;
    /** The worker request ID — used to detect stale results after remove()+re-add. */
    reqId: string;
}

/** A worker result paired with its resolved main-thread context, ready to apply. */
interface ResolvedWorkerBuild {
    ctx: InflightWorkerBuild;
    result: GeometryWorkerResult;
}

export class CurtainWallBuilder {
    private scene: THREE.Scene;
    /** §CURTAIN-WALL-AUDIT-2026 §5.4 — injected deps (optional during migration). */
    private _deps: Partial<CurtainWallBuilderDependencies>;
    /**
     * §CURTAIN-WALL-AUDIT-2026 §5.4 — Singleton instance reference so that
     * the static {@link beginPlacementMode}/{@link endPlacementMode} helpers
     * can find the live builder without consulting `window.curtainWallBuilder`.
     * Falls back to the window global if the static reference has not yet
     * been set (e.g. during early bootstrap or in legacy unit tests).
     */
    private static _instance: CurtainWallBuilder | null = null;
    private currentVisualStyle: VisualStyle = VisualStyle.CONSISTENT_COLORS;
    private hdriTexture: THREE.Texture | null = null;
    /** §4.5: One root group per curtain wall — reused across rebuilds. */
    private roots: Map<string, THREE.Group> = new Map();

    /**
     * §MI-07 FIX (2026-03-31): Mullion material cache keyed by color hex string.
     * Previously, one `MeshStandardMaterial` was created on every `build()` call —
     * O(n) materials per rebuild on a large façade. Now materials are shared across
     * all walls using the same mullion color and all rebuild cycles.
     *
     * Disposal: `disposeMullionMaterials()` should be called when the builder is
     * torn down (e.g. on project close). Individual `remove()` calls do NOT dispose
     * cached materials because the same material may still be used by other walls.
     */
    private mullionMaterialCache: Map<string, THREE.MeshStandardMaterial> = new Map();

    /**
     * §PERF-2026-Q2-CW-CREATE/F5 — Mullion geometry cache.
     * Keyed by `${width}_${height}_${depth}`. Every InstancedMesh that uses a
     * cached BoxGeometry stamps `userData.sharedGeometry = true` so
     * `_disposeChildren` skips disposal — the cache owns the geometries until
     * `dispose()` runs.
     *
     * Previously a fresh `BoxGeometry` was allocated on every build cycle for
     * vertical and horizontal mullion racks. For 50 rebuilds × 2 racks each =
     * 100 redundant geometry allocations + GPU buffer uploads.
     */
    private mullionGeometryCache: Map<string, THREE.BoxGeometry> = new Map();

    /**
     * §C.1 — Per-element monotonic build-version counter.
     *
     * Incremented on every `build()` call for a given wall id. Stored here
     * rather than read from `group.userData.version` so the version is
     * authoritative even if external code mutates `userData` between builds.
     *
     * `remove(id)` deletes the entry → re-added wall starts at version 1.
     * `dispose()` clears the map → fresh builder starts fully cold.
     *
     * EdgeProjectorService uses `group.userData.version` as the cache key;
     * that value is always set from `_nextVersion(id)` in `build()`.
     */
    private readonly _buildVersions = new Map<string, number>();

    /**
     * §PERF-2026-Q2-CW-CREATE/F8 — Fallback panel material cache.
     * Used when no `CurtainPanelStore` is available and the builder falls back
     * to procedural glass panels. Previously a fresh `MeshStandardMaterial`
     * leaked on every build cycle. The cached material is shared and marked
     * `sharedMaterial: true` on the mesh so `_disposeChildren` skips it.
     */
    private _fallbackPanelMatCache: Map<string, THREE.MeshStandardMaterial> = new Map();

    /**
     * §PERF-2026-Q2-CW-CREATE/F4 — Placement-mode window-event accumulator.
     * Mirrors BatchCoordinator's `trackPostBatchWindowEvent` semantics: the
     * key is the event name, the value is the most recent `detail`. On
     * `endPlacementMode`, all entries fire as one consolidated dispatch in
     * `requestIdleCallback`, so per-click `bim-curtainwall-added` events do
     * not stack up listeners (FrustumCulling, SelectionManager, etc.) on the
     * critical interactive path.
     */
    private _placementWindowEvents: Map<string, any> = new Map();

    private readonly panelBuilder = new CurtainPanelBuilder();
    private readonly instanceManager = new CurtainWallInstanceManager();

    // ── Task 5.2 Phase 5: rAF-sliced build queue ─────────────────────────────
    /**
     * Baseline geometry budget per animation frame.
     * The instance variable `_buildsPerFrame` adapts up/down from this starting
     * point based on actual measured drain time (see _drainBuildQueue).
     */
    private static readonly MAX_BUILDS_PER_FRAME = 20;
    /**
     * G2-T5 — maximum walls per drain frame while the camera motion gate is active
     * (`window.isCameraDragging = true`).  3 walls × ~2 ms/wall avg ≈ 6 ms, safely
     * under the 8 ms cap that keeps the `'pre-render'` slot free for camera interpolation.
     */
    private static readonly MOTION_GATE_MAX_BUILDS = 3;
    /**
     * §PERF-ADAPTIVE-DRAIN-V2: Current per-frame wall budget.  Starts at the
     * baseline (20) and adapts each cycle under two separate threshold regimes:
     *
     * BATCH MODE (batchCoordinator.isBatching = true — renders suppressed):
     *   < 25ms last frame → increase by 1 (cap 50) — push throughput higher
     *   > 45ms last frame → decrease by 1 (floor 5) — back off near LONGTASK
     *   Rationale: OBC+PASCAL renders are suppressed during drain; the only constraint
     *   is the 50ms LONGTASK threshold, not the 16ms frame boundary. The former 14ms
     *   threshold was calibrated for interactive mode and cascaded the budget 20→7 for
     *   large batches (BN-04, live 294-wall session 2026-05-06).
     *
     * INTERACTIVE MODE (renders live — must stay within ~1 frame):
     *   < 8ms last frame  → increase by 1 (cap 30) — machine has headroom.
     *   > 14ms last frame → decrease by 1 (floor 5) — avoid frame drops.
     *
     * Reset to baseline in resumeAndFlush() at the start of each new batch
     * so back-to-back commands always start from a known neutral state (BN-04 fix).
     */
    private _buildsPerFrame = CurtainWallBuilder.MAX_BUILDS_PER_FRAME;
    /**
     * §K.1 (Sprint 3 — G6 fix): Adaptive shadow reactivation slice size.
     *
     * WHY K.1 ADAPTIVE SLICING IS NOW CORRECT — pre-condition: Phase K.2 shadow PSO prewarm.
     *
     * Previous approach (WALLS_PER_SHADOW_FRAME = 10000, now retired):
     *   Without PSO prewarm, slicing was WORSE: N slices = N shadow-pass PSO compilations
     *   (274–341ms each). Measured: 8 LONGTASKs / 1,591ms total / FPS=6 even for one-shot
     *   (Cluster B, live log 2026-05-07). The slicing-fallacy analysis was correct given
     *   unprewarmed PSOs — each slice triggered a NEW PSO compile + full scene re-traversal.
     *
     * New approach (K.1 + K.2 together):
     *   K.2 pre-warms all shadow-pass PSO variants during Phase 0 (hidden under overlay).
     *   By T+30s, shadow-pass PSOs are in the WebGPU driver cache — compilation cost ≈ 0.
     *   Each K.1 slice pays only TRAVERSE cost: ~2ms per 50 walls (not 274–341ms).
     *   294 walls ÷ 50/slice = 6 slices × ~2ms = ~12ms total traverse,
     *   spread across 6 FrameScheduler pre-render ticks (≈100ms wall-clock, invisible).
     *   Target: 0 LONGTASKs, FPS ≥ 30 during reactivation (was 8 LONGTASKs / FPS=6).
     *
     * References: plan doc 45 §K.1+K.2, live log Cluster B, G6 gap analysis.
     */
    private static readonly WALLS_PER_SHADOW_SLICE = 50;

    /**
     * §B.3 — Reusable dummy Object3D for InstancedMesh matrix baking (INE-09).
     *
     * Previously, `build()` allocated `new THREE.Object3D()` inside the loop body
     * for both vertical and horizontal mullion racks on every wall — 2 heap objects
     * per wall, 588 total for a 294-wall batch.  Object3D allocation is lightweight
     * but not free: it sets up a full hierarchy node (matrixWorld, children array, etc.)
     * and contributes to GC pressure at batch scale.
     *
     * These fields are created once when the builder is constructed and reused for
     * every subsequent build().  They are never added to the scene — they are only
     * used as a scratch transform to fill instancedMesh matrix slots via
     * `dummy.position.set(...); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix)`.
     *
     * Safety: Both dummies are reset (position + scale) before each use site so
     * state from a previous build() cannot bleed into the next.
     */
    private readonly _vMullionDummy = new THREE.Object3D();
    private readonly _hMullionDummy = new THREE.Object3D();

    /**
     * §B.4 — Cell computation cache (INE-10).
     *
     * `computeCurtainCells(grid, length, height)` is a pure function: same inputs
     * always produce the same output. In a batch, walls from the same slab template
     * share identical grid topology, length, and height — making the call redundant
     * for all but the first distinct (grid, length, height) triple.
     *
     * For 294 walls across 17 slabs with ~5 per-slab templates:
     *   Before: 294 calls to computeCurtainCells.
     *   After:  ≤17 calls (one per unique grid × length × height triple).
     *
     * Cache key: JSON.stringify(grid) + length.toFixed(4) + height.toFixed(4).
     * Full structural hash — guards against grids with the same uLines.length but
     * different line positions (e.g. non-uniform grids after user edits).
     *
     * Clearing: _drainBuildQueue() clears the cache when the queue empties so stale
     * results do not persist across interactive builds (where grid/size can change).
     * dispose() also clears the cache so the next project open starts cold.
     */
    private readonly _cellCache = new Map<string, readonly import('./CurtainCellComputer').CurtainCell[]>();

    /**
     * §B.4.2 — Resolve computed cells from the cache or compute and store.
     *
     * Returns a frozen array so callers cannot corrupt the cached value.
     * The `find()` and `map()` operations on the result are read-only, so
     * returning the same reference is safe.
     */
    private _getCells(
        grid: import('./CurtainGridSystem').CurtainGridSystem,
        length: number,
        height: number
    ): readonly import('./CurtainCellComputer').CurtainCell[] {
        const fullKey = `${JSON.stringify(grid)}:${length.toFixed(4)}:${height.toFixed(4)}`;
        let cells = this._cellCache.get(fullKey);
        if (!cells) {
            cells = Object.freeze(computeCurtainCells(grid, length, height));
            this._cellCache.set(fullKey, cells);
        }
        return cells;
    }

    /**
     * §B.4.3 — Clear the cell cache after each batch drain.
     *
     * Called in _drainBuildQueue() when _pendingBuildsMap empties, so stale cached
     * cell arrays do not persist into subsequent interactive edits where the user
     * may change a wall's grid spacing or dimensions.
     */
    private _clearCellCache(): void {
        const prevSize = this._cellCache.size;
        this._cellCache.clear();
        if (prevSize > 0 && (batchCoordinator.isBatching || CurtainWallBuilder._isBuilderDebugEnabled())) {
            console.log(`[CurtainWallBuilder] §B.4 cell cache cleared (had ${prevSize} entries)`);
        }
    }

    /**
     * §BATCH-CW-PAUSE: O(1) dedup queue — replaces the former CurtainWallData[]
     * + findIndex() pattern (O(n) per update, O(n²) for a batch of n walls).
     * Insertion order is preserved by Map so drain order is stable.
     */
    private _pendingBuildsMap: Map<string, CurtainWallData> = new Map();

    /**
     * §BATCH-CW-PAUSE: Set by pause() during the synchronous store-mutation
     * phase of a batch. While true, updateCurtainWall() buffers into
     * _pausedBuildsMap instead of scheduling individual rAF drains.
     * Cleared by resumeAndFlush() after fn() returns.
     */
    private _rebuildPaused = false;

    /**
     * §BATCH-CW-PAUSE: Holds walls received while _rebuildPaused is true.
     * Map<id, CurtainWallData> — O(1) insert and O(1) dedup (latest wins).
     * Transferred to _pendingBuildsMap in bulk by resumeAndFlush() so only
     * ONE rAF drain is scheduled for the entire batch instead of N.
     */
    private _pausedBuildsMap: Map<string, CurtainWallData> = new Map();

    // D.7.5 batch #3: rAF handle replaced by FrameScheduler disposer.
    private _rafHandle: TickListenerDisposer | null = null;

    // ── Step 2B: Shadow Deferral ──────────────────────────────────────────────
    /**
     * Wall IDs built with castShadow=false during a batch.
     * BatchCoordinator fires _reactivateShadows() after registration drain
     * so the shadow pass runs ONCE over all deferred walls.
     */
    private _batchShadowPending: Set<string> = new Set();

    /**
     * §II-5 (Sprint 2): Handle for the pending 30-second shadow-reactivation
     * setTimeout (or 200ms inter-slice setTimeout). Stored so dispose() can
     * cancel it on project switch — preventing a stale callback from firing
     * into Project B's scene after the builder for Project A is torn down.
     */
    private _batchShadowTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
    /**
     * §K.1 — FrameScheduler disposer for the inter-slice shadow drain.
     * Returned by `getFrameScheduler().scheduleOnce()` for the next pending slice.
     * Nullified and called on `dispose()` to prevent a cross-project shadow drain.
     */
    private _shadowSliceDisposer: TickListenerDisposer | null = null;

    // ── Task 4.2: Web-worker geometry pipeline (ADR-047) ──────────────────
    /**
     * Pool of geometry workers (size 2 by default).  Lazy-initialised on the
     * first batch drain that routes to the worker path so the workers are not
     * spawned until actually needed (avoids startup cost for projects with
     * no curtain walls).
     */
    private _workerPool: GeometryWorkerPool | null = null;

    /**
     * Inflight worker dispatches keyed by wallId.
     *
     * Each entry stores the requestId sent to the pool PLUS the main-thread
     * context needed to reconstruct the scene objects when the result arrives.
     * On `remove(id)`, the entry is deleted so a stale result (arriving after
     * remove()) is silently discarded — the requestId mismatch check below
     * handles the race between a rapid remove()+re-add and the old worker result.
     */
    private _inflightWorkerBuilds: Map<string, InflightWorkerBuild> = new Map();

    /**
     * Results returned by workers that are waiting for the next
     * FrameScheduler 'pre-render' tick to be applied to the scene.
     * Populated by `_onWorkerResult()`, drained by `_drainMainThreadWork()`.
     */
    private _pendingMainThreadWork: ResolvedWorkerBuild[] = [];

    /**
     * FrameScheduler disposer for the geometry-drain pre-render listener.
     * Non-null while a pre-render drain is already scheduled.  Prevents
     * double-scheduling when multiple workers respond in the same JS task.
     */
    private _mainThreadWorkDisposer: TickListenerDisposer | null = null;

    /** Monotonic counter for worker request IDs (unique within this builder). */
    private _workerReqSeq = 0;

    /**
     * §II-3 (Sprint 2): Stable bound reference to _reactivateShadows stored
     * so it can be deregistered from BatchCoordinator on dispose().
     */
    private _shadowReactivationCb: (() => void) | null = null;

    // ── PERF-FIX-1: Interactive Placement Mode Shadow Deferral ───────────────
    /**
     * True while CurtainWallTool is active. New wall meshes built during this
     * window are flagged castShadow=false to prevent a per-wall GPU shadow pass
     * (123–255ms each). Shadows are consolidated and flushed once on deactivation.
     *
     * PERF-FIX-4: Also read by RoomTopologyObserver to gate REDETECT_ROOMS
     * during active placement. Exposed via static getter so the observer
     * can read it without a window global or circular import.
     */
    private static _placementModeActive = false;

    /**
     * PERF-FIX-4: Public read-only accessor for placement mode state.
     * Used by RoomTopologyObserver to suppress REDETECT_ROOMS while the
     * curtain wall tool is active.
     */
    static get isPlacementModeActive(): boolean {
        return CurtainWallBuilder._placementModeActive;
    }

    /**
     * Wall IDs built with castShadow=false during interactive placement mode.
     * Kept separate from _batchShadowPending so that BatchCoordinator's
     * _reactivateShadows() (which clears _batchShadowPending) cannot accidentally
     * orphan interactive-mode walls that were never part of a batch.
     */
    private _interactiveShadowPending: Set<string> = new Set();

    /**
     * PERF-FIX-1: Called by CurtainWallTool.activate().
     * Enables placement-mode shadow deferral for this tool session.
     */
    static beginPlacementMode(): void {
        CurtainWallBuilder._placementModeActive = true;
        if (CurtainWallBuilder._isBuilderDebugEnabled()) {
            console.log('[CurtainWallBuilder] PLACEMENT_MODE: START — shadows deferred for interactive walls');
        }
    }

    /**
     * §PERF-2026-Q2-CW-CREATE/F4 — Track a window event during interactive
     * placement so it can be deduped and dispatched once on placement end.
     *
     * Called by `CreateCurtainWallCommand` when
     * `CurtainWallBuilder.isPlacementModeActive` is true and the batch
     * coordinator is NOT batching. Mirrors
     * `BatchCoordinator.trackPostBatchWindowEvent` semantics: the Map
     * collapses repeated calls per event name to one final dispatch.
     *
     * If no live builder exists (very early bootstrap or unit tests) the
     * event falls through to a direct `window.dispatchEvent` so we never
     * silently drop notifications.
     */
    static trackPlacementWindowEvent(name: string, detail?: any): void {
        const builder: CurtainWallBuilder | null =
            CurtainWallBuilder._instance
            ?? (window.curtainWallBuilder as CurtainWallBuilder | undefined)
            ?? null;
        if (!builder) {
            _bus.emit(name as string & keyof EventCatalog, detail); // F.events.18 - intentional dynamic dispatch
            return;
        }
        builder._placementWindowEvents.set(name, detail ?? null);
    }

    /**
     * §PERF-2026-Q2-CW-CREATE/F9 — Gate verbose builder logging behind an
     * opt-in flag (`window.__cwBuilderDebug = true`). Per-build/per-slice
     * logs were running on every interactive placement and showed up in
     * production console, contributing to per-click latency. Warnings
     * (`SLOW_BUILD`) remain unconditional — they are rare and useful.
     */
    private static _isBuilderDebugEnabled(): boolean {
        return Boolean(window.__cwBuilderDebug);
    }

    /**
     * PERF-FIX-1: Called by CurtainWallTool.deactivate().
     * Disables placement-mode deferral and schedules a one-time shadow flush
     * for all walls placed since beginPlacementMode() was called.
     * The flush runs in requestIdleCallback so it does not block the deactivation path.
     *
     * PERF-FIX-4: Also flushes deferred REDETECT_ROOMS via RoomTopologyObserver.
     * While the tool was active, all curtain-wall-triggered room detections were
     * suppressed and their level IDs accumulated. This call drains that set so
     * exactly one ReDetectRoomsCommand fires per affected level — no more, no less.
     */
    static endPlacementMode(): void {
        CurtainWallBuilder._placementModeActive = false;
        // §CURTAIN-WALL-AUDIT-2026 §5.4: prefer the singleton class reference
        // captured at construction time; fall back to the window global only
        // for legacy callers that bypass the bootstrap path.
        const builder: CurtainWallBuilder | null =
            CurtainWallBuilder._instance
            ?? (window.curtainWallBuilder as CurtainWallBuilder | undefined)
            ?? null;
        if (builder) {
            builder._flushInteractiveShadows();
            // §PERF-2026-Q2-CW-CREATE/F4 — fire deduped window events accumulated
            // during placement (one dispatch per unique event name).
            builder._flushPlacementWindowEvents();
        }
        // PERF-FIX-4: flush deferred room detections accumulated during placement.
        // Resolved via the builder's injected deps when available.
        const rto =
            builder?._deps.roomTopologyObserver
            ?? window.roomTopologyObserver;
        if (rto && typeof rto.flushPlacementLevels === 'function') {
            rto.flushPlacementLevels();
        }
        if (CurtainWallBuilder._isBuilderDebugEnabled()) {
            console.log('[CurtainWallBuilder] PLACEMENT_MODE: END — scheduling shadow flush + room detect flush');
        }
    }

    /**
     * §PERF-2026-Q2-CW-CREATE/F4 — Drain `_placementWindowEvents` after the
     * tool deactivates. One `requestIdleCallback` (with `setTimeout` fallback)
     * dispatches every unique event name exactly once. Listeners
     * (FrustumCullingService, SelectionManager, SaveOrchestrator,
     * UnifiedBrowserPanel, initScene) therefore re-run once per session
     * instead of once per click.
     */
    private _flushPlacementWindowEvents(): void {
        if (this._placementWindowEvents.size === 0) return;
        const events = Array.from(this._placementWindowEvents.entries());
        this._placementWindowEvents.clear();

        const dispatch = () => {
            for (const [name, detail] of events) {
                _bus.emit(name as string & keyof EventCatalog, detail ?? {}); // F.events.18 - intentional dynamic dispatch
            }
            if (CurtainWallBuilder._isBuilderDebugEnabled()) {
                console.log(
                    `[CurtainWallBuilder] PLACEMENT_MODE: dispatched ${events.length} ` +
                    `deduped window events: ${events.map(([n]) => n).join(', ')}`
                );
            }
        };

        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(dispatch, { timeout: 50 });
        } else {
            setTimeout(dispatch, 0);
        }
    }

    constructor(
        scene: THREE.Scene,
        deps: Partial<CurtainWallBuilderDependencies> = {},
    ) {
        this.scene = scene;
        this._deps = deps;

        // Step 2B: register shadow reactivation callback so BatchCoordinator can
        // trigger one consolidated shadow pass after all geometry + registrations
        // are complete, instead of 126 individual shadow recalculations.
        // §II-3 (Sprint 2): store the bound reference so dispose() can deregister it.
        this._shadowReactivationCb = () => this._reactivateShadows();
        batchCoordinator.addShadowReactivationCallback(this._shadowReactivationCb);

        // §CURTAIN-WALL-AUDIT-2026 §5.4: Capture the singleton reference so the
        // static placement-mode helpers (and any future static utilities) can
        // reach the live builder without consulting `window.curtainWallBuilder`.
        CurtainWallBuilder._instance = this;

        // §BATCH-CW-PAUSE: expose pause/resume API (typed in global-window.d.ts)
        // so BatchCoordinator can gate updateCurtainWall() calls during the
        // synchronous store-mutation phase of a batch — mirroring §BATCH-WALL-PAUSE.
        // §PERF-ADAPTIVE-DRAIN: reset to baseline at construction so each new
        // builder instance (project open) starts from a known neutral state.
        this._buildsPerFrame = CurtainWallBuilder.MAX_BUILDS_PER_FRAME;

        window.__curtainWallRebuildControl = {
            pause: () => {
                this._rebuildPaused = true;
                this._pausedBuildsMap.clear();
                console.debug('[CurtainWallBuilder] §BATCH-CW-PAUSE: paused — buffering into pausedBuildsMap');
            },
            // C13 §3.5 / Wave 35 I-4: query method so the project-switch teardown handler
            // and OTel span can check the current pause state before calling resumeAndFlush().
            isPaused: () => this._rebuildPaused,
            resumeAndFlush: () => {
                this._rebuildPaused = false;
                const n = this._pausedBuildsMap.size;
                if (n === 0) return;
                // §PERF-ADAPTIVE-DRAIN-V2 (BN-04 fix, 2026-05-06): reset budget for each
                // new batch.  Without this, a first batch that decays _buildsPerFrame from
                // 20 down to 7 leaves the field at 7 — so the NEXT batch starts with 7
                // walls/frame instead of MAX_BUILDS_PER_FRAME (20), immediately doubling
                // the drain time for the second command in a session.
                this._buildsPerFrame = CurtainWallBuilder.MAX_BUILDS_PER_FRAME;
                for (const [id, cw] of this._pausedBuildsMap) {
                    this._pendingBuildsMap.set(id, cw);
                }
                this._pausedBuildsMap.clear();
                if (this._rafHandle === null) {
                    // Sprint A32 (C11 §5.2/§6.1): geometry must land before the render pass.
                    const FrameScheduler = getFrameScheduler();
                    this._rafHandle = FrameScheduler.schedule('pre-render', () => this._drainBuildQueue());
                }
                console.log(
                    `[CurtainWallBuilder] §BATCH-CW-PAUSE: resumeAndFlush — ` +
                    `${n} walls transferred to pending queue, 1 rAF drain scheduled.`
                );
            },
            // §F.2 — async-only resume: same transfer logic as resumeAndFlush but
            // always uses scheduleOnce so it never blocks the current pre-render slot.
            // BatchCoordinator calls this instead of resumeAndFlush() so the three
            // builder resumes in the deferred 'batch-coordinator-resume-flush' slot
            // do NOT each consume their full drain budget synchronously in that slot.
            resume: () => {
                this._rebuildPaused = false;
                const n = this._pausedBuildsMap.size;
                if (n === 0) return;
                this._buildsPerFrame = CurtainWallBuilder.MAX_BUILDS_PER_FRAME;
                for (const [id, cw] of this._pausedBuildsMap) {
                    this._pendingBuildsMap.set(id, cw);
                }
                this._pausedBuildsMap.clear();
                if (this._rafHandle === null) {
                    this._rafHandle = getFrameScheduler().scheduleOnce(
                        'cw-builder-drain',
                        () => this._drainBuildQueue(),
                        'pre-render',
                    );
                }
                console.log(
                    `[CurtainWallBuilder] §F2-RESUME-ONLY resume — ` +
                    `${n} walls transferred to pending queue, 1 async pre-render drain scheduled.`
                );
            },
            // §BATCH-CW-PAUSE-ADDMANY (BN-01 fix):
            // Called by CurtainWallStore.addMany() in batch mode to populate
            // _pausedBuildsMap in a SINGLE pass instead of N separate
            // updateCurtainWall() calls (each with try/catch + isBatching check).
            //
            // For a 168-wall batch: replaces 168 updateCurtainWall() invocations
            // (each checking _rebuildPaused, then doing _pausedBuildsMap.set) with
            // one direct loop.  The savings are overhead reduction (168 call frames,
            // 168 try/catch blocks, 168 batchCoordinator.isBatching reads) rather
            // than algorithmic — each path is O(1) — but at 168× scale, eliminating
            // the per-call scaffolding measurably reduces addMany() wall time.
            //
            // Contract: MUST only be called when _rebuildPaused === true (i.e., from
            // within a BatchCoordinator.runBatch() context where pause() was called).
            // resumeAndFlush() will transfer all entries to _pendingBuildsMap and
            // schedule ONE rAF drain exactly as before.
            addManyPaused: (walls: CurtainWallData[]) => {
                const __t0 = performance.now();
                let count = 0;
                for (const cw of walls) {
                    this._pausedBuildsMap.set(cw.id, cw);
                    count++;
                }
                console.debug(
                    `[CurtainWallBuilder] §BATCH-CW-PAUSE-ADDMANY: ${count} walls → _pausedBuildsMap ` +
                    `in ${(performance.now() - __t0).toFixed(2)}ms (1 pass, no per-item overhead).`
                );
            },
            // §I-2 (Sprint 1): Explicit shadow-reactivation enqueue for the A4-SAFETY
            // fallback path. Called by CurtainWallStore.addMany() when addManyPaused is
            // unavailable, so those walls are still covered by the 30-second drain pass
            // even if they were built outside the normal pausedBuildsMap flow.
            scheduleBatchShadow: (ids: string[]) => {
                for (const id of ids) {
                    this._batchShadowPending.add(id);
                }
                console.debug(
                    `[CurtainWallBuilder] §I-2: scheduleBatchShadow — ` +
                    `${ids.length} wall(s) added to _batchShadowPending (A4-SAFETY fallback path).`
                );
            },
        };
    }

    // ────────────────────────────────────────────────────────────────────────
    // §CURTAIN-WALL-AUDIT-2026 §5.4 — Dependency accessors with window fallback.
    // ────────────────────────────────────────────────────────────────────────

    private _getBimManager(): any {
        return this._deps.bimManager ?? window.bimManager;
    }
    private _getPanelStore(): CurtainPanelStore | undefined {
        return this._deps.curtainPanelStore ?? (window.curtainPanelStore as CurtainPanelStore | undefined); // TODO(TASK-08)
    }
    private _getPlanSymbolCache(): any {
        return this._deps.planSymbolCache ?? window.__planSymbolCache;
    }
    private _isWallDebugEnabled(): boolean {
        return Boolean(window.__pryzmDebugWalls);
    }

    setVisualStyle(style: VisualStyle): void {
        this.currentVisualStyle = style;
        if (this.currentVisualStyle === VisualStyle.REALISTIC) {
            console.log('[CurtainWallBuilder] switching to realistic mode');
        }
    }

    setHdriTexture(texture: THREE.Texture | null): void {
        this.hdriTexture = texture;
        if (this.hdriTexture) {
            console.log('[CurtainWallBuilder] HDRI texture applied');
        }
    }

    /**
     * Called by the subscriber in main.ts on 'add' and 'update' store events.
     *
     * Task 5.2 Phase 5: Instead of calling build() synchronously, pushes to the
     * rAF-sliced build queue. If this wall is already in the queue (e.g. an 'update'
     * event immediately after an 'add'), the existing entry is replaced with the
     * latest data so the most recent state is always built — never stale.
     */
    updateCurtainWall(cw: CurtainWallData): void {
        // §BATCH-CW-PAUSE: During the synchronous store-mutation phase of a batch,
        // BatchCoordinator calls pause() which sets _rebuildPaused = true. While
        // paused, buffer into _pausedBuildsMap (O(1) dedup) without scheduling any
        // rAF. BatchCoordinator.runBatch() calls resumeAndFlush() after fn() returns,
        // transferring all buffered walls to _pendingBuildsMap and scheduling ONE
        // rAF drain instead of N — mirroring the §BATCH-WALL-PAUSE pattern.
        if (this._rebuildPaused) {
            this._pausedBuildsMap.set(cw.id, cw);
            return;
        }

        // §PERF-2026-Q2-CW-CREATE/F2 — Interactive fast path.
        // The rAF queue exists to slice multi-wall AI batches across frames.
        // For the much more common case of a single interactive click — where
        // no other builds are queued and we are not inside a coordinator
        // batch — the rAF detour adds ≥16 ms of pure latency for nothing.
        // Build inline; the queue path remains for batches and back-to-back
        // updates (the second update naturally falls into the queue branch
        // because `_rafHandle === null` will not hold while a build is mid-RAF).
        if (this._pendingBuildsMap.size === 0
            && this._rafHandle === null
            && !batchCoordinator.isBatching) {
            try {
                this.build(cw);
            } catch (e) {
                console.error('[CurtainWallBuilder] fast-path build error for wall', cw.id, ':', e);
            }
            return;
        }

        // §BATCH-CW-PAUSE: O(1) dedup via Map — replaces O(n) findIndex + splice.
        // Latest data wins for duplicate IDs (update after add in the same frame).
        this._pendingBuildsMap.set(cw.id, cw);
        if (this._rafHandle === null) {
            // Sprint A32 (C11 §5.2/§6.1): canonical pre-render phase — geometry before render.
            const FrameScheduler = getFrameScheduler();
            this._rafHandle = FrameScheduler.schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    /**
     * Task 5.2 Phase 5: rAF drain — processes up to MAX_BUILDS_PER_FRAME queued
     * curtain-wall builds per animation frame, then reschedules if the queue is
     * non-empty. Yielding between batches lets the GPU driver flush command buffers
     * and prevents VRAM saturation on large batch operations (20-floor buildings).
     */
    private _drainBuildQueue(): void {
        this._rafHandle = null;
        const __t_drain_start = performance.now();
        const __queue_before = this._pendingBuildsMap.size;

        // §F.3 — Check the shared rAF budget; yield to next frame if another builder
        // (e.g. SlabFragmentBuilder) has already exhausted the budget this tick.
        const budget = getFrameScheduler().getBatchBudget('batch-drain');
        if (budget && !budget.hasRemaining(__t_drain_start)) {
            // Re-arm for the next frame — budget will be reset at tick start.
            this._rafHandle = getFrameScheduler().scheduleOnce(
                'cw-builder-drain',
                () => this._drainBuildQueue(),
                'pre-render',
            );
            console.log(
                `[CurtainWallBuilder] §F3-SHARED-BUDGET exhausted by other builders — ` +
                `deferring ${__queue_before} wall(s) to next rAF frame.`
            );
            return;
        }

        // Take up to _buildsPerFrame entries in insertion order.
        const batch: CurtainWallData[] = [];
        for (const [id, cw] of this._pendingBuildsMap) {
            batch.push(cw);
            this._pendingBuildsMap.delete(id);
            if (batch.length >= this._buildsPerFrame) break;
            // §F.3: also yield early if the shared budget is consumed mid-batch.
            if (budget && !budget.hasRemaining(__t_drain_start)) break;
        }

        for (const cw of batch) {
            try {
                // §4.2 — Route through _buildOrOffload so the fallback-glass path
                // can be delegated to the geometry worker pool when available.
                this._buildOrOffload(cw);
            } catch (e) {
                console.error('[CurtainWallBuilder] build error in rAF batch for wall', cw.id, ':', e);
            }
        }

        const frameMs = performance.now() - __t_drain_start;
        // §F.3 — Record this drain's elapsed ms into the shared budget so subsequent
        // builders in the same rAF tick respect the cooperative cap.
        budget?.consume(frameMs);
        // §PERF-ADAPTIVE-DRAIN-V2 (BN-04 fix, 2026-05-06): tri-mode adaptive thresholds.
        //
        // ROOT CAUSE (live 294-wall / 21-slab session, 2026-05-06):
        //   The previous 14ms decrement threshold was calibrated for INTERACTIVE mode —
        //   stay within one 60fps frame so renders never drop.  During a batch,
        //   OBC+PASCAL renders are SUPPRESSED (viewDependencyTracker.setSuppressed(true)),
        //   so there is NO render between drain frames. The only relevant constraint is the
        //   50ms LONGTASK threshold, yet the 14ms guard fired on nearly every frame:
        //
        //     Frame 1:  20 walls, frameMs=30.6ms → decrement to 19  (30.6ms > 14ms)
        //     Frame 2:  19 walls, frameMs=25.7ms → decrement to 18
        //     Frame 7:  14 walls, frameMs=38.7ms → decrement to 13
        //     ...
        //     Frame 16:  8 walls, frameMs=14.9ms → decrement to  7  (budget floor)
        //     Frames 17–27: oscillates at 7–8  (294 walls / 7.5 avg = 39 drain frames total)
        //
        //   Result: 27 drain frames × ~16ms rAF overhead = ~432ms pure scheduling waste,
        //   plus every wall built at sub-optimal throughput.  The 5-second scale target
        //   was unreachable at this floor.
        //
        // FIX — batch mode (renders suppressed, only LONGTASK matters):
        //   < 25ms → increment (machine has headroom; push throughput higher)
        //   > 45ms → decrement (back off only when approaching LONGTASK territory)
        //   cap: 50 walls/frame (50 × ~2ms/wall avg ≈ 100ms — worst-case single task,
        //        still far from the 50ms threshold for typical 1–2ms/wall builds)
        //
        //   Expected outcome for 294 walls:  budget stabilises at ~20–25 walls/frame
        //   → ~14 drain frames vs 27 before → saves ~13 × 16ms = ~208ms of rAF overhead.
        //   For 1 000-wall batches: 1000/20 = 50 frames × 16ms = 800ms vs 2 128ms before
        //   → keeps total drain under 3s even at 5-level scale.
        //
        // Interactive mode (renders live — must stay within ~1 frame):
        //   < 8ms → increment, cap 30.   > 14ms → decrement, floor 5.
        //
        // G2-T5 — Motion-gate mode (camera actively navigating, renders live):
        //   Hard cap: _buildsPerFrame clamped to MOTION_GATE_MAX_BUILDS (3) so a single
        //   drain frame costs ≤ ~6ms, keeping the 'pre-render' slot free for the camera
        //   smooth-interpolation update. Drain is rescheduled at 'post-render' priority
        //   (see reschedule block below) — after camera work — so navigation FPS is
        //   never reduced by concurrent CW background builds.
        //   > 8ms → decrement to floor 1 (back off hard if over budget)
        //   < 4ms → increment up to MOTION_GATE_MAX_BUILDS (recover headroom slowly)
        const _isMotionGate = !batchCoordinator.isBatching && !!window.isCameraDragging;
        if (batchCoordinator.isBatching) {
            if (frameMs < 25 && this._buildsPerFrame < 50) {
                this._buildsPerFrame++;
            } else if (frameMs > 45 && this._buildsPerFrame > 5) {
                this._buildsPerFrame--;
            }
        } else if (_isMotionGate) {
            // Clamp to motion-gate cap first, then fine-tune within the allowed range.
            if (this._buildsPerFrame > CurtainWallBuilder.MOTION_GATE_MAX_BUILDS) {
                this._buildsPerFrame = CurtainWallBuilder.MOTION_GATE_MAX_BUILDS;
            }
            if (frameMs > 8 && this._buildsPerFrame > 1) {
                this._buildsPerFrame--;
            } else if (frameMs < 4 && this._buildsPerFrame < CurtainWallBuilder.MOTION_GATE_MAX_BUILDS) {
                this._buildsPerFrame++;
            }
        } else {
            if (frameMs < 8 && this._buildsPerFrame < 30) {
                this._buildsPerFrame++;
            } else if (frameMs > 14 && this._buildsPerFrame > 5) {
                this._buildsPerFrame--;
            }
        }

        // §PERF-TRACE: Always log batch drain frames (not gated by debug flag) so
        // performance profiles are observable in production console recordings.
        // Interactive single-wall builds (queueBefore === 1, isBatching=false) are
        // excluded to keep the log quiet during normal editing.
        if (batchCoordinator.isBatching || __queue_before > 1 || CurtainWallBuilder._isBuilderDebugEnabled()) {
            console.log(
                `[CurtainWallBuilder] §PERF-DRAIN built=${batch.length} remaining=${this._pendingBuildsMap.size} ` +
                `queueBefore=${__queue_before} frameMs=${frameMs.toFixed(1)}ms ` +
                `nextBudget=${this._buildsPerFrame} isBatch=${batchCoordinator.isBatching} ` +
                `motionGate=${_isMotionGate}`
            );
        }
        if (this._pendingBuildsMap.size > 0) {
            // G2-T5 / Sprint A32 (C11 §5.2/§6.1): reschedule for next frame.
            // MOTION-GATE: use 'post-render' when the camera is actively navigating
            // so the 'pre-render' slot remains free for camera smooth-interpolation.
            // All other cases: 'pre-render' (default; highest TickPriority).
            const FrameScheduler = getFrameScheduler();
            const _drainPriority = _isMotionGate ? 'post-render' : 'pre-render';
            this._rafHandle = FrameScheduler.schedule(_drainPriority, () => this._drainBuildQueue());
        } else {
            // Task 6.5 Phase 6: queue fully drained — signal BatchCoordinator to begin
            // the registration drain and final REDETECT_ROOMS sweep.
            // isBatching check prevents spurious signals for interactive single-wall edits.
            // §B.4.3 — Clear cell cache now that the drain is complete.
            this._clearCellCache();
            if (batchCoordinator.isBatching) {
                // §4.2-WORKER: Delay the signal if worker builds are still inflight.
                // _drainMainThreadWork() will fire signalBuildQueueDrained() when the
                // last inflight worker result is consumed and both queues are empty.
                if (this._inflightWorkerBuilds.size === 0) {
                    console.log(
                        `[CurtainWallBuilder] §PERF-DRAIN-COMPLETE rAF queue fully drained ` +
                        `(${__queue_before - batch.length} built this frame, 0 remaining, 0 inflight workers) ` +
                        `— signalling BatchCoordinator.signalBuildQueueDrained().`
                    );
                    batchCoordinator.signalBuildQueueDrained();
                } else {
                    console.log(
                        `[CurtainWallBuilder] §4.2-WORKER rAF queue drained but ` +
                        `${this._inflightWorkerBuilds.size} worker build(s) still inflight — ` +
                        `deferring signalBuildQueueDrained() to _drainMainThreadWork().`
                    );
                }
            }
        }
    }

    /**
     * § Phase 1 / Step 2 Build Pipeline:
     *
     *   1. Resolve world Y from BimManager (§02 §1.2)
     *   2. Get-or-create root group (§4.5)
     *   3. Dispose and clear existing children (§4.3)
     *   4. Resolve CurtainGridSystem (stored or migrated from legacy spacing)
     *   5. Compute cells via CurtainCellComputer (pure function)
     *   6. Read panel data from CurtainPanelStore
     *   7. Build instanced panel meshes (CurtainWallInstanceManager)
     *   8. Build individual panel meshes for materialOverride panels
     *   9. Build mullion meshes — Step 2A: InstancedMesh (was: individual Mesh per mullion)
     *  10. Orient and position the group in world space
     *  11. Stamp userData on root group (§3.2)
     *  12. Register in ElementRegistry (§2.4) — removed per §MI-03 FIX
     *  13. Phase 6: Register pre-baked 2D plan symbol
     *  14. Step 2B: Shadow deferral — castShadow=false during batch; reactivated post-drain
     */
    build(cw: CurtainWallData): THREE.Group {
        const __t_wall_start = performance.now();
        // ── 1. Resolve worldY ────────────────────────────────────────────────
        const bimManager = this._getBimManager();
        let worldY = cw.baseOffset;
        if (!bimManager) {
            console.error(
                `[CurtainWallBuilder] §02 §1.3 VIOLATION: window.bimManager is not set. ` +
                `Cannot resolve worldY for curtain wall "${cw.id}" (level: "${cw.levelId}"). ` +
                `Rendering at baseOffset=${cw.baseOffset} as a degraded fallback.`
            );
        } else if (!cw.levelId) {
            console.error(
                `[CurtainWallBuilder] §02 §1.3 VIOLATION: curtain wall "${cw.id}" has no levelId. ` +
                `Cannot resolve worldY. Rendering at baseOffset=${cw.baseOffset} as a degraded fallback.`
            );
        } else {
            const level = bimManager.getLevelById(cw.levelId);
            if (level == null) {
                console.error(
                    `[CurtainWallBuilder] §02 §1.3 VIOLATION: Level "${cw.levelId}" not found in BimManager ` +
                    `for curtain wall "${cw.id}". ` +
                    `Rendering at baseOffset=${cw.baseOffset} as a degraded fallback.`
                );
            } else {
                worldY = level.elevation + cw.baseOffset;
            }
        }

        // ── 2. Get-or-create root group (§4.5) ──────────────────────────────
        let group = this.roots.get(cw.id);
        if (group) {
            // §4.3 + §PERF-2026-Q2-CW-CREATE/F6: Dispose owned children, then
            // clear in one O(n) pass via `Group.clear()`. Previously we walked
            // `group.children` with a `while (length > 0)` + `remove(children[0])`
            // pattern which is quadratic — `remove()` re-scans `children` to
            // find the index on every iteration.
            this._disposeChildren(group);
            group.clear();
        } else {
            group = new THREE.Group();
            this.scene.add(group);
            this.roots.set(cw.id, group);
            // §PERF-2026-Q2-CW-CREATE/F7 — `registerRoot` is only required
            // for the initial scene insertion. The Group reference is stable
            // across rebuilds (§4.5), so re-registering on every update was
            // a redundant Map write + side-effect on the registry's debug
            // path. Keep the call for first-build symmetry only.
            elementRegistry.registerRoot(cw.id, group);
        }

        // ── 3. Validate baseline ─────────────────────────────────────────────
        // P0.3 DTO Migration: baseLine is now [Point3D, Point3D] in the store.
        // Builder reconstructs THREE.Vector3 here at projection time only.
        // Contract §01 §4.6: builder derives geometry exclusively from semantic state.
        const [startPt, endPt] = cw.baseLine;
        const start = new THREE.Vector3(startPt.x, startPt.y, startPt.z);
        const end   = new THREE.Vector3(endPt.x,   endPt.y,   endPt.z);
        const vec = new THREE.Vector3().subVectors(end, start);
        const length = vec.length();
        if (length < 0.001) return group; // degenerate — skip

        const direction = vec.clone().normalize();

        const __t_worldY_done = performance.now();

        // ── 4. Resolve CurtainGridSystem ─────────────────────────────────────
        const __did_migrate = !cw.gridSystem;
        const grid = cw.gridSystem
            ?? migrateToGridSystem(length, cw.height, cw.gridXSpacing, cw.gridYSpacing);
        const __t_grid_done = performance.now();

        // ── 5. Compute cells ──────────────────────────────────────────────────
        // §B.4.4 — Use cached cells; computeCurtainCells is a pure function so
        // walls sharing the same grid topology, length, and height can reuse results.
        const cells = this._getCells(grid, length, cw.height);
        const __t_cells_done = performance.now();

        // ── 6. Read panel data from CurtainPanelStore ─────────────────────────
        const panelStore = this._getPanelStore();
        const panels: CurtainPanelData[] = panelStore
            ? panelStore.getByCurtainWallId(cw.id)
            : [];

        // ── Step 2B + PERF-FIX-1: Determine shadow mode ──────────────────────
        // Defer shadows in two cases:
        //   (a) batchCoordinator.isBatching — AI/batch creation of many walls at once.
        //       BatchCoordinator._reactivateShadows() flushes these after drain.
        //   (b) CurtainWallBuilder._placementModeActive — user is actively placing walls
        //       via CurtainWallTool. Shadows flush once in idle callback on deactivation.
        //       Prevents 123–255ms shadow pass on every click during interactive placement.
        const isBatch       = batchCoordinator.isBatching;
        const isPlacement   = CurtainWallBuilder._placementModeActive;
        const deferShadows  = isBatch || isPlacement;

        if (isBatch) {
            this._batchShadowPending.add(cw.id);
            this._interactiveShadowPending.delete(cw.id);
        } else if (isPlacement) {
            this._interactiveShadowPending.add(cw.id);
            this._batchShadowPending.delete(cw.id);
        } else {
            // Non-deferred rebuild (e.g. property edit outside placement mode).
            // Clear any stale pending entries so this wall is not re-processed.
            this._batchShadowPending.delete(cw.id);
            this._interactiveShadowPending.delete(cw.id);
        }

        // ── 7. Mullion material — resolved from cache (§MI-07) ───────────────
        const mullionColor = cw.mullionColor || '#333333';
        let mullionMat = this.mullionMaterialCache.get(mullionColor);
        if (!mullionMat) {
            mullionMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(mullionColor),
                metalness: 0.1,
                roughness: 0.2,
                emissive: new THREE.Color(mullionColor).multiplyScalar(0.05)
            });
            this.mullionMaterialCache.set(mullionColor, mullionMat);
        }

        const __t_panels_read_done = performance.now();

        // ── 8. Render panels ──────────────────────────────────────────────────
        if (panels.length > 0) {
            const { instancedMeshes, overridePanelIds } = this.instanceManager.buildInstancedMeshes(
                cells,
                panels,
                cw.mullionSize,
                cw.panelThickness
            );

            for (const im of instancedMeshes) {
                // Step 2B: shadow deferral — skip shadow on batch builds
                im.castShadow    = !deferShadows;
                im.receiveShadow = !deferShadows;
                group.add(im);
            }

            for (const panelId of overridePanelIds) {
                const panelData = panelStore!.get(panelId);
                if (!panelData) continue;
                const cell = cells.find(c => c.i === panelData.cellIndex[0] && c.j === panelData.cellIndex[1]);
                if (!cell) continue;
                const mesh = this.panelBuilder.buildPanelMesh(cell, panelData, cw.mullionSize, cw.panelThickness, cw.levelId);
                if (mesh) {
                    mesh.castShadow    = !deferShadows;
                    mesh.receiveShadow = !deferShadows;
                    group.add(mesh);
                }
            }
        } else {
            // Fallback: no panel store yet — procedural glass.
            // §PERF-2026-Q2-CW-CREATE/F8: material is cache-owned + shared across
            // all fallback panels of every wall. Mark `sharedMaterial: true` so
            // `_disposeChildren` skips disposal on rebuild.
            const fallbackPanelMat = this._getFallbackPanelMaterial();
            for (const cell of cells) {
                const panelWidth  = Math.max(0.01, cell.width - cw.mullionSize);
                const panelHeight = Math.max(0.01, cell.height - cw.mullionSize);
                const geo = new THREE.BoxGeometry(panelWidth, panelHeight, cw.panelThickness);
                const bl = cell.corners[0];
                const tr = cell.corners[2];
                const cx = (bl.x + tr.x) / 2;
                const cy = (bl.y + tr.y) / 2;
                const p = new THREE.Mesh(geo, fallbackPanelMat);
                p.position.set(cx, cy, 0);
                p.castShadow    = !deferShadows;
                p.receiveShadow = !deferShadows;
                p.userData = {
                    elementType:    'CurtainWallPart',
                    modelId:        'model-default',
                    role:           'panel',
                    parentId:       cw.id,
                    isSubElement:   true,
                    sharedMaterial: true,   // §PERF-2026-Q2-CW-CREATE/F8
                };
                group.add(p);
            }
        }

        const __t_panels_done = performance.now();

        // ── 9. Mullions — Step 2A: InstancedMesh (one per orientation per wall) ──
        //
        // OLD approach: one THREE.Mesh per mullion → N_u + N_v draw calls per wall.
        // For 126 walls × ~10 mullions = ~1260 draw calls.
        //
        // NEW approach: ONE InstancedMesh for all vertical mullions in this wall +
        // ONE InstancedMesh for all horizontal mullions. Each InstancedMesh is a
        // single GPU draw call regardless of instance count.
        // For 126 walls: ~1260 → 252 draw calls (5× reduction).
        //
        // userData.sharedMaterial = true is preserved so _disposeChildren skips
        // the cache-owned material during cleanup (§MI-07).

        const uSorted = [...grid.uLines].sort((a, b) => a.t - b.t);
        const vSorted = [...grid.vLines].sort((a, b) => a.t - b.t);

        // Vertical mullions — all U-lines including perimeter (t=0 and t=1 are the
        // left and right frame members).
        if (uSorted.length > 0) {
            // §PERF-2026-Q2-CW-CREATE/F5 — geometry pulled from cache, not re-allocated.
            const vGeo = this._getMullionGeometry(cw.mullionSize, cw.height, cw.mullionSize);
            const vIM  = new THREE.InstancedMesh(vGeo, mullionMat, uSorted.length);
            vIM.castShadow    = !deferShadows;
            vIM.receiveShadow = !deferShadows;
            vIM.userData = {
                elementType:    'CurtainWallPart',
                modelId:        'model-default',
                role:           'mullion-v-instanced',
                parentId:       cw.id,
                isSubElement:   true,
                sharedMaterial: true,   // §MI-07: owned by mullionMaterialCache
                sharedGeometry: true,   // §PERF-2026-Q2-CW-CREATE/F5: owned by mullionGeometryCache
            };
            // §B.3 — Reuse the pre-allocated class-level dummy instead of `new THREE.Object3D()`.
            // _vMullionDummy is reset before the loop so prior build() state cannot bleed through.
            this._vMullionDummy.scale.set(1, 1, 1);
            this._vMullionDummy.rotation.set(0, 0, 0);
            uSorted.forEach((uLine, i) => {
                const x = uLine.t * length - length / 2;
                this._vMullionDummy.position.set(x, cw.height / 2, 0);
                this._vMullionDummy.updateMatrix();
                vIM.setMatrixAt(i, this._vMullionDummy.matrix);
            });
            vIM.instanceMatrix.needsUpdate = true;
            group.add(vIM);
        }

        // Horizontal mullions — all V-lines including perimeter (t=0 and t=1 are the
        // sill and head rail members).
        if (vSorted.length > 0) {
            // §PERF-2026-Q2-CW-CREATE/F5 — geometry pulled from cache, not re-allocated.
            const hGeo = this._getMullionGeometry(length, cw.mullionSize, cw.mullionSize);
            const hIM  = new THREE.InstancedMesh(hGeo, mullionMat, vSorted.length);
            hIM.castShadow    = !deferShadows;
            hIM.receiveShadow = !deferShadows;
            hIM.userData = {
                elementType:    'CurtainWallPart',
                modelId:        'model-default',
                role:           'mullion-h-instanced',
                parentId:       cw.id,
                isSubElement:   true,
                sharedMaterial: true,   // §MI-07: owned by mullionMaterialCache
                sharedGeometry: true,   // §PERF-2026-Q2-CW-CREATE/F5: owned by mullionGeometryCache
            };
            // §B.3 — Reuse the pre-allocated class-level dummy instead of `new THREE.Object3D()`.
            // _hMullionDummy is reset before the loop so prior build() state cannot bleed through.
            this._hMullionDummy.scale.set(1, 1, 1);
            this._hMullionDummy.rotation.set(0, 0, 0);
            vSorted.forEach((vLine, i) => {
                const y = vLine.t * cw.height;
                this._hMullionDummy.position.set(0, y, 0);
                this._hMullionDummy.updateMatrix();
                hIM.setMatrixAt(i, this._hMullionDummy.matrix);
            });
            hIM.instanceMatrix.needsUpdate = true;
            group.add(hIM);
        }

        const __t_mullions_done = performance.now();

        // ── 10. Position and orient in world space ───────────────────────────
        const angle = Math.atan2(direction.x, direction.z);
        group.rotation.y = angle + Math.PI / 2;
        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        group.position.set(center.x, worldY, center.z);

        // ── 11. Stamp userData on root group (§3.2) ──────────────────────────
        // §C.1 — Use _nextVersion() for monotonically increasing, per-element
        // version numbers that are authoritative (not read from group.userData
        // which could be mutated externally between builds).
        group.userData = {
            id:           cw.id,
            type:         'curtain-wall',
            elementType:  'CurtainWall',
            modelId:      'model-default',
            levelId:      cw.levelId,
            version:      this._nextVersion(cw.id),
            selectable:   true,
            length:       Number(length.toFixed(2)),
            height:       cw.height,
            mark:         cw.properties?.mark,
            gridCellCount: cells.length,
            shadowDeferred: deferShadows,
        };

        // ── 12. elementRegistry registration removed (§MI-03 FIX) ──────────

        const __wall_ms = performance.now() - __t_wall_start;
        // §DIAG-BUILD-01: per-sub-phase timing breakdown — always logged when isBatching
        // so production profiles capture where each wall's time is spent.
        if (batchCoordinator.isBatching || CurtainWallBuilder._isBuilderDebugEnabled()) {
            console.log(
                `[CurtainWallBuilder] §DIAG-BUILD-01 wallId="${cw.id}" ` +
                `batchId=${window.__activeBatchId ?? 'none'} ` +
                `totalMs=${__wall_ms.toFixed(1)} ` +
                `worldYMs=${(__t_worldY_done - __t_wall_start).toFixed(1)} ` +
                `gridMs=${(__t_grid_done - __t_worldY_done).toFixed(1)}${__did_migrate ? '(migrated)' : ''} ` +
                `cellsMs=${(__t_cells_done - __t_grid_done).toFixed(1)} cells=${cells.length} ` +
                `panelReadMs=${(__t_panels_read_done - __t_cells_done).toFixed(1)} panels=${panels.length} ` +
                `panelBuildMs=${(__t_panels_done - __t_panels_read_done).toFixed(1)} ` +
                `mullionMs=${(__t_mullions_done - __t_panels_done).toFixed(1)} uLines=${grid.uLines.length} vLines=${grid.vLines.length} ` +
                `orientMs=${(__wall_ms - (__t_mullions_done - __t_wall_start)).toFixed(1)}`
            );
        }
        // PERF-FIX (Apr 2026): Keep SLOW_BUILD warnings (rare, useful) but gate
        // the per-wall info log behind opt-in flag — fires once per curtain wall.
        // §PERF-2026-Q2-CW-CREATE/F9: also accept the unified `__cwBuilderDebug`
        // flag so the new flag controls every per-build/per-slice log.
        if (__wall_ms > 16) {
            console.warn(`[CurtainWallBuilder] SLOW_BUILD wallId="${cw.id}" levelId="${(cw as any).levelId}" elapsed=${__wall_ms.toFixed(1)}ms`);
        } else if (this._isWallDebugEnabled() || CurtainWallBuilder._isBuilderDebugEnabled()) {
            console.log(`[CurtainWallBuilder] build wallId="${cw.id}" elapsed=${__wall_ms.toFixed(1)}ms`);
        }

        return group;
    }

    // ── Step 2B: Shadow Reactivation ─────────────────────────────────────────

    /**
     * PERF-FIX-2: Re-enables castShadow + receiveShadow on all wall groups that were
     * built with shadow deferral during the batch, spread across RAF frames.
     *
     * Called by BatchCoordinator._drainRegistrations() via the registered
     * shadowReactivationCallback AFTER:
     *   1. All geometry is in the scene (rAF build queue drained).
     *   2. All BimManager registrations are complete (registration drain done).
     *
     * This method RETURNS IMMEDIATELY after scheduling the first RAF slice.
     * BatchCoordinator can then call _executeFinalSweep() in the same synchronous
     * tick, so REDETECT_ROOMS fires ~400ms sooner than it did before this fix.
     *
     * Each RAF slice processes WALLS_PER_SHADOW_FRAME walls and triggers a bounded
     * GPU shadow command buffer flush. For 44 walls: 5 slices of ≤10 across 5 frames
     * instead of one 400–600ms synchronous block.
     *
     * REDETECT_ROOMS does not depend on shadow state (it reads geometry, not render
     * properties), so running shadow slices in parallel with REDETECT_ROOMS is safe.
     */
    private _reactivateShadows(): void {
        const pending = Array.from(this._batchShadowPending);
        this._batchShadowPending.clear();

        if (pending.length === 0) {
            // §K.1-SHADOW-MAP-RESTORE (empty batch path): No walls to reactivate, but
            // BatchCoordinator._setupBatch() may have suppressed the WebGPU renderer's
            // shadowMap. Restore it immediately so an all-slab or zero-CW batch does not
            // leave shadows permanently disabled.
            try {
                const webgpuRenderer = window.pryzmRenderer;
                if (webgpuRenderer?.shadowMap && '__pryzmBatchShadowWasEnabled' in window) {
                    const wasEnabled = Boolean(window.__pryzmBatchShadowWasEnabled ?? true);
                    webgpuRenderer.shadowMap.enabled = wasEnabled;
                    delete window.__pryzmBatchShadowWasEnabled;
                }
            } catch { /* non-fatal */ }
            return;
        }

        const _k1Start = performance.now();
        console.log(
            `[CurtainWallBuilder] §K1 shadow reactivation START: ${pending.length} walls — ` +
            `${CurtainWallBuilder.WALLS_PER_SHADOW_SLICE} walls/slice via FrameScheduler ` +
            `(§K.2 PSOs pre-warmed — slice cost = traverse only, ≤2ms/slice target).`
        );

        let idx = 0;

        const drainSlice = () => {
            this._shadowSliceDisposer = null;
            const sliceStart = performance.now();
            const slice = pending.slice(idx, idx + CurtainWallBuilder.WALLS_PER_SHADOW_SLICE);
            idx += CurtainWallBuilder.WALLS_PER_SHADOW_SLICE;
            let sliceMeshCount = 0;

            for (const cwId of slice) {
                const group = this.roots.get(cwId);
                if (!group) continue;
                group.userData.shadowDeferred = false;
                group.traverse(obj => {
                    if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
                        obj.castShadow    = true;
                        obj.receiveShadow = true;
                        sliceMeshCount++;
                    }
                });
            }

            console.log(
                `[CurtainWallBuilder] §K1-SHADOW-SLICE walls ${idx - CurtainWallBuilder.WALLS_PER_SHADOW_SLICE}–${Math.min(idx, pending.length) - 1} ` +
                `(${slice.length} walls, ${sliceMeshCount} meshes enabled). ` +
                `sliceMs=${(performance.now() - sliceStart).toFixed(1)}ms T=${performance.now().toFixed(0)}ms`
            );

            if (idx < pending.length) {
                // §K.1 — Schedule next slice via FrameScheduler 'pre-render' (not setTimeout(200)).
                //
                // With §K.2 shadow PSO pre-warm in effect, each slice pays only traverse cost
                // (~2ms per 50 walls) — PSO compilation already happened in Phase 0 prewarm.
                // The GPU has one full rAF frame (~16ms) to flush the shadow command buffer
                // between slices. No 200ms artificial gap needed; FrameScheduler fires at the
                // next natural pre-render slot, interleaved with the normal rAF render loop.
                //
                // Cancellation: _shadowSliceDisposer is called on dispose() to prevent
                // a cross-project shadow drain when the user switches projects mid-reactivation.
                this._shadowSliceDisposer = getFrameScheduler().scheduleOnce(
                    `cw-shadow-reactivate-${idx}`,
                    drainSlice,
                    'pre-render'
                );
            } else {
                this._shadowSliceDisposer = null;
                // §K.1-SHADOW-MAP-RESTORE: re-enable the WebGPU renderer's shadowMap
                // suppressed by BatchCoordinator._setupBatch() (§BATCH-SHADOW-MAP-SUPPRESS).
                // Reads window.__pryzmBatchShadowWasEnabled — the state captured before the
                // batch — so we restore to EXACTLY what the user had, not blindly to true.
                // This correctly honours: user toggled shadows OFF before or during the batch,
                // user had shadows on (normal case → restore to true).
                try {
                    const webgpuRenderer = window.pryzmRenderer;
                    if (webgpuRenderer?.shadowMap && '__pryzmBatchShadowWasEnabled' in window) {
                        const wasEnabled = Boolean(window.__pryzmBatchShadowWasEnabled ?? true);
                        webgpuRenderer.shadowMap.enabled = wasEnabled;
                        delete window.__pryzmBatchShadowWasEnabled;
                        console.log(
                            `[CurtainWallBuilder] §K1-SHADOW-MAP-RESTORED ` +
                            `shadowMap.enabled=${wasEnabled} (pre-batch state restored)`
                        );
                    }
                } catch { /* non-fatal */ }
                console.log(
                    `[CurtainWallBuilder] §K1-SHADOW-COMPLETE ${pending.length} walls reactivated. ` +
                    `totalMs=${(performance.now() - _k1Start).toFixed(1)}ms ` +
                    `(0 LONGTASKs expected — §K.2 PSOs pre-warmed).`
                );
            }
        };

        // §PERF-SHADOW-DELAY-30S (2026-05-05): Schedule the single shadow shot via a
        // 30-second fixed delay.
        //
        // Why 30 seconds (not 10 seconds):
        //
        //   Live measurement showed the post-batch LONGTASK storm lasts:
        //     PSO compile (first render post-suppress):  ~5,871ms
        //     EdgeProjector LONGTASK:                   ~7,109ms
        //     Combined:                                 ~12,980ms
        //
        //   The previous 10-second delay fired DURING the 7,109ms EdgeProjector LONGTASK.
        //   When the 10s timer expired, the browser queued the shadow callback. That callback
        //   then ran immediately when the EdgeProjector LONGTASK ended — colliding with the
        //   tail of the storm and producing the observed 26,121ms compound LONGTASK.
        //
        //   30 seconds provides ~17 seconds of margin beyond the ~13s storm peak. By T+30s
        //   the scene will have rendered hundreds of stable frames and the GPU command buffer
        //   will be fully flushed. The single shadow rebuild fires in an uncontested frame.
        //
        //   Acceptable UX trade-off: curtain walls render without cast shadows for ~30 seconds
        //   after a large CW batch. The geometry, mullions, and panels are fully visible and
        //   interactive immediately after the overlay dismisses. Shadows appear silently at
        //   T+30s without any user-visible freeze (the rebuild cost is absorbed in one frame).
        // §D.4 — Log the 30-second shadow scheduling so production recordings show
        // when the deferred GPU shadow rebuild will fire relative to batch completion.
        console.log(
            `[CurtainWallBuilder] §SHADOW-30S-SCHEDULED ${pending.length} wall(s) queued ` +
            `for shadow reactivation at T+30s ` +
            `(batchId=${window.__activeBatchId ?? 'none'})`,
        );
        // §II-5 (Sprint 2): store handle so dispose() can cancel it on project switch.
        this._batchShadowTimeoutHandle = setTimeout(drainSlice, 30000);
    }

    /**
     * PERF-FIX-1: Flush shadows deferred during interactive placement mode.
     * Scheduled via requestIdleCallback (with setTimeout fallback) so it runs
     * in the browser's idle period and does not block the deactivation path.
     *
     * Called by the static endPlacementMode() after the tool deactivates.
     */
    private _flushInteractiveShadows(): void {
        const pending = Array.from(this._interactiveShadowPending);
        this._interactiveShadowPending.clear();

        if (pending.length === 0) return;

        if (CurtainWallBuilder._isBuilderDebugEnabled()) {
            console.log(`[CurtainWallBuilder] PLACEMENT_MODE: scheduling shadow flush for ${pending.length} walls`);
        }

        const flush = () => {
            let shadowMeshCount = 0;
            for (const cwId of pending) {
                const group = this.roots.get(cwId);
                if (!group) continue;
                group.userData.shadowDeferred = false;
                group.traverse(obj => {
                    if (obj instanceof THREE.Mesh || obj instanceof THREE.InstancedMesh) {
                        obj.castShadow    = true;
                        obj.receiveShadow = true;
                        shadowMeshCount++;
                    }
                });
            }
            if (CurtainWallBuilder._isBuilderDebugEnabled()) {
                console.log(
                    `[CurtainWallBuilder] PLACEMENT_MODE: shadow flush complete — ` +
                    `${pending.length} walls, ${shadowMeshCount} objects enabled in one idle pass.`
                );
            }
        };

        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(flush, { timeout: 500 });
        } else {
            setTimeout(flush, 0);
        }
    }

    /**
     * §6 Remove curtain wall from scene with full geometry disposal.
     * Called by the subscriber in main.ts on 'remove' store events.
     */
    remove(id: string): void {
        const group = this.roots.get(id);
        if (!group) return;

        this._disposeChildren(group);
        this.scene.remove(group);
        this.roots.delete(id);
        elementRegistry.unregisterRoot(id);
        this._batchShadowPending.delete(id);
        this._interactiveShadowPending.delete(id);
        // §BATCH-CW-PAUSE: purge from both build queues so a removed wall
        // that was buffered during a batch pause is never rebuilt.
        this._pendingBuildsMap.delete(id);
        this._pausedBuildsMap.delete(id);
        // §4.2-WORKER: Cancel any inflight worker build for this wall.
        // The context entry is deleted so when the worker result arrives,
        // _onWorkerResult() will find no matching entry and discard it.
        this._inflightWorkerBuilds.delete(id);

        // Phase 6: invalidate the pre-baked plan symbol for this curtain wall.
        try { this._getPlanSymbolCache()?.invalidate(id); } catch { /* noop */ }

        // §C.1 — Remove the build-version entry so a re-added wall starts at v=1.
        this._buildVersions.delete(id);

        // §C.4.2 — Invalidate cached plan-view projection for this element.
        // Uses _deps first; falls back to window.edgeProjectorService for
        // the pre-injection window where _deps.edgeProjectorService is not yet set.
        try {
            const eps = this._deps.edgeProjectorService
                ?? window.edgeProjectorService;
            eps?.invalidateCwElement?.(id);
        } catch { /* noop — EPS may not be loaded yet */ }
    }

    /**
     * §MI-07: Full builder disposal — call when the project is closed.
     *
     * §PERF-2026-Q2-CW-CREATE/F5 + /F8: also drain the new geometry and
     * fallback-material caches so cached resources don't leak across project
     * reloads.
     */
    dispose(): void {
        // §FIX-C13-RAFHANDLE: Cancel any pending pre-render drain callback so a
        // disposed builder cannot process stale walls into the next project's scene.
        // Without this, a scheduled _drainBuildQueue() fires one frame after dispose(),
        // finds _pendingBuildsMap empty (cleared below), and exits — harmless but wasteful.
        // Cancelling eagerly prevents any FrameScheduler callback from referencing
        // this torn-down builder instance after the project switch.
        if (this._rafHandle !== null) {
            this._rafHandle();
            this._rafHandle = null;
        }
        for (const [id] of this.roots) {
            this.remove(id);
        }
        for (const mat of this.mullionMaterialCache.values()) {
            mat.dispose();
        }
        this.mullionMaterialCache.clear();
        // §PERF-2026-Q2-CW-CREATE/F5
        for (const geo of this.mullionGeometryCache.values()) {
            geo.dispose();
        }
        this.mullionGeometryCache.clear();
        // §PERF-2026-Q2-CW-CREATE/F8
        for (const mat of this._fallbackPanelMatCache.values()) {
            mat.dispose();
        }
        this._fallbackPanelMatCache.clear();
        // §B.1 — Dispose panel geometry + material cache (owned by instanceManager).
        // Called here (builder teardown) rather than in individual remove() calls because
        // the cache is shared across all walls and must only be released once, on project close.
        this.instanceManager.disposeCache();
        // §B.4 — Clear cell computation cache. No GPU resources to dispose (pure JS arrays).
        this._cellCache.clear();
        // §C.1 — Clear version counters; new builder instance starts fresh.
        this._buildVersions.clear();
        // §PERF-2026-Q2-CW-CREATE/F4
        this._placementWindowEvents.clear();
        this._batchShadowPending.clear();
        this._interactiveShadowPending.clear();
        // §II-5 (Sprint 2): cancel any pending shadow-reactivation setTimeout so
        // a project-switch does not fire Project A's shadow drain into Project B's scene.
        if (this._batchShadowTimeoutHandle !== null) {
            clearTimeout(this._batchShadowTimeoutHandle);
            this._batchShadowTimeoutHandle = null;
        }
        // §K.1 — cancel any in-flight FrameScheduler inter-slice shadow drain.
        // Prevents Project A's shadow slices from firing into Project B's scene
        // when the user switches projects mid-reactivation.
        if (this._shadowSliceDisposer) {
            this._shadowSliceDisposer();
            this._shadowSliceDisposer = null;
        }
        // §II-3 (Sprint 2): deregister from BatchCoordinator so a subsequent batch
        // on a new project does not invoke this disposed builder's _reactivateShadows().
        if (this._shadowReactivationCb) {
            batchCoordinator.removeShadowReactivationCallback(this._shadowReactivationCb);
            this._shadowReactivationCb = null;
        }
        // §BATCH-CW-PAUSE: drain build queues and reset pause state.
        this._pendingBuildsMap.clear();
        this._pausedBuildsMap.clear();
        this._rebuildPaused = false;
        CurtainWallBuilder._placementModeActive = false;
        // §CURTAIN-WALL-AUDIT-2026 §5.4: clear the singleton reference so a
        // subsequent project open can install a fresh builder instance.
        if (CurtainWallBuilder._instance === this) {
            CurtainWallBuilder._instance = null;
        }
        // §BATCH-CW-PAUSE: clear window reference so a subsequent project open
        // does not call into a disposed builder instance.
        window.__curtainWallRebuildControl = undefined;

        // §4.2-WORKER: terminate the geometry worker pool (frees OS threads)
        // and drain the pending main-thread work queue so no stale geometry
        // is applied to the next project's scene.
        if (this._mainThreadWorkDisposer) {
            this._mainThreadWorkDisposer();
            this._mainThreadWorkDisposer = null;
        }
        this._inflightWorkerBuilds.clear();
        this._pendingMainThreadWork.length = 0;
        if (this._workerPool !== null) {
            try { this._workerPool.terminate(); } catch { /* non-fatal */ }
            this._workerPool = null;
        }
    }

    /**
     * §C.1 — Return the next monotonic version number for the given wall id.
     * Increments and stores the counter so each call always yields a value
     * strictly greater than the last for the same id.
     */
    private _nextVersion(id: string): number {
        const v = (this._buildVersions.get(id) ?? 0) + 1;
        this._buildVersions.set(id, v);
        return v;
    }

    // ──────────────────────────────────────────────────────────────────────
    // §4.2 — Web-worker geometry pipeline (ADR-047)
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Route a single curtain wall build during a batch drain.
     *
     * - If the panel store has per-cell overrides for this wall → run `build()`
     *   synchronously (the panelStore path uses CurtainWallInstanceManager which
     *   requires Three.js scene objects — not offloadable to a worker).
     * - If the wall has no panel store data (fallback glass path) AND the worker
     *   pool is available → offload geometry computation to the pool via
     *   `_submitToWorker()`.
     * - Fallback to synchronous `build()` if the pool is not yet alive (e.g. on
     *   the interactive fast path or when pool spawn failed).
     */
    private _buildOrOffload(cw: CurtainWallData): void {
        // Determine whether this wall has panel-store entries requiring the
        // synchronous panelStore path (CurtainWallInstanceManager).
        const panelStore = this._getPanelStore();
        const hasPanelOverrides = panelStore
            ? panelStore.getByCurtainWallId(cw.id).length > 0
            : false;

        if (hasPanelOverrides) {
            // Panel-store path — must run synchronously on the main thread.
            this.build(cw);
            return;
        }

        // Lazy-init the worker pool on first use.
        if (this._workerPool === null) {
            try {
                this._workerPool = new GeometryWorkerPool();
            } catch (err) {
                console.warn('[CurtainWallBuilder] §4.2 worker pool init failed — falling back to sync build:', err);
                this.build(cw);
                return;
            }
        }

        // Fallback-glass path → offload to worker.
        this._submitToWorker(cw);
    }

    /**
     * Offload the geometry computation for one curtain wall (fallback-glass path)
     * to the geometry worker pool.
     *
     * Synchronous work performed here (≤1 ms):
     *   • worldY resolution, group create/clear, baseLine decomposition
     *   • Grid resolution + cell computation (cached; cheap)
     *   • Shadow deferral bookkeeping
     *   • Material resolution from cache
     *   • Group positioning + userData stamp (so the group is observable
     *     in the scene immediately with correct transforms)
     *
     * Async work (performed in geometry.worker.ts; zero main-thread cost):
     *   • Box geometry typed-array generation for all fallback glass panels
     *   • Mullion InstancedMesh geometry arrays
     *   • Mullion instance matrix baking
     *
     * When the worker responds, `_onWorkerResult()` → `_pendingMainThreadWork`
     * → `_drainMainThreadWork()` (FrameScheduler 'pre-render') reconstructs
     * THREE objects and calls `group.add()`.
     */
    private _submitToWorker(cw: CurtainWallData): void {
        // ── Resolve worldY ────────────────────────────────────────────────
        const bimManager = this._getBimManager();
        let worldY = cw.baseOffset;
        if (bimManager && cw.levelId) {
            const level = bimManager.getLevelById(cw.levelId);
            if (level != null) worldY = level.elevation + cw.baseOffset;
        }

        // ── Validate baseline ─────────────────────────────────────────────
        const [startPt, endPt] = cw.baseLine;
        const start = new THREE.Vector3(startPt.x, startPt.y, startPt.z);
        const end   = new THREE.Vector3(endPt.x,   endPt.y,   endPt.z);
        const vec   = new THREE.Vector3().subVectors(end, start);
        const length = vec.length();
        if (length < 0.001) return; // degenerate — skip

        const direction = vec.clone().normalize();

        // ── Resolve grid + cells (cached) ─────────────────────────────────
        const grid = cw.gridSystem
            ?? migrateToGridSystem(length, cw.height, cw.gridXSpacing, cw.gridYSpacing);
        const cells = this._getCells(grid, length, cw.height);

        // ── Shadow deferral — same logic as build() ───────────────────────
        const isBatch     = batchCoordinator.isBatching;
        const isPlacement = CurtainWallBuilder._placementModeActive;
        const deferShadows = isBatch || isPlacement;
        if (isBatch) {
            this._batchShadowPending.add(cw.id);
            this._interactiveShadowPending.delete(cw.id);
        } else if (isPlacement) {
            this._interactiveShadowPending.add(cw.id);
            this._batchShadowPending.delete(cw.id);
        } else {
            this._batchShadowPending.delete(cw.id);
            this._interactiveShadowPending.delete(cw.id);
        }

        // ── Mullion material from cache ───────────────────────────────────
        const mullionColor = cw.mullionColor ?? '#333333';
        let mullionMat = this.mullionMaterialCache.get(mullionColor);
        if (!mullionMat) {
            mullionMat = new THREE.MeshStandardMaterial({
                color:    new THREE.Color(mullionColor),
                metalness: 0.1,
                roughness: 0.2,
                emissive:  new THREE.Color(mullionColor).multiplyScalar(0.05),
            });
            this.mullionMaterialCache.set(mullionColor, mullionMat);
        }
        const fallbackPanelMat = this._getFallbackPanelMaterial();

        // ── Create/clear root group + position immediately ────────────────
        // The group is added to the scene and positioned before the worker
        // responds so it is immediately traversable (e.g. by FrustumCulling).
        let group = this.roots.get(cw.id);
        if (group) {
            this._disposeChildren(group);
            group.clear();
        } else {
            group = new THREE.Group();
            this.scene.add(group);
            this.roots.set(cw.id, group);
            elementRegistry.registerRoot(cw.id, group);
        }

        const angle = Math.atan2(direction.x, direction.z);
        group.rotation.y = angle + Math.PI / 2;
        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
        group.position.set(center.x, worldY, center.z);

        // Stamp userData immediately so the group is observable while worker runs.
        group.userData = {
            id:            cw.id,
            type:          'curtain-wall',
            elementType:   'CurtainWall',
            modelId:       'model-default',
            levelId:       cw.levelId,
            version:       this._nextVersion(cw.id),
            selectable:    true,
            length:        Number(length.toFixed(2)),
            height:        cw.height,
            mark:          (cw as { properties?: { mark?: string } }).properties?.mark,
            gridCellCount: cells.length,
            shadowDeferred: deferShadows,
            workerPending:  true, // cleared in _applyWorkerResult
        };

        // ── Serialise cells (no THREE.Vector3 across boundary) ────────────
        const uSorted = [...grid.uLines].sort((a, b) => a.t - b.t);
        const vSorted = [...grid.vLines].sort((a, b) => a.t - b.t);

        const serializableCells: SerializableCell[] = cells.map(cell => ({
            i: cell.i, j: cell.j,
            u0: cell.u0, u1: cell.u1,
            v0: cell.v0, v1: cell.v1,
            width:  cell.width,
            height: cell.height,
            blX: cell.corners[0].x, blY: cell.corners[0].y,
            trX: cell.corners[2].x, trY: cell.corners[2].y,
        }));

        // ── Register inflight context (keyed by wallId) ───────────────────
        const reqId = `cw-worker-${++this._workerReqSeq}`;
        const ctx: InflightWorkerBuild = {
            group, cw, deferShadows,
            mullionMat, fallbackPanelMat,
            uSortedCount: uSorted.length,
            vSortedCount: vSorted.length,
            reqId,
        };
        this._inflightWorkerBuilds.set(cw.id, ctx);

        // ── Dispatch to pool ──────────────────────────────────────────────
        this._workerPool!.dispatch({
            requestId:     reqId,
            wallId:        cw.id,
            cells:         serializableCells,
            mullionSize:   cw.mullionSize,
            panelThickness: cw.panelThickness,
            wallHeight:    cw.height,
            wallLength:    length,
            uLinesT:       uSorted.map(l => l.t),
            vLinesT:       vSorted.map(l => l.t),
        }).then(result => {
            this._onWorkerResult(result);
        }).catch(err => {
            // Worker failed — remove from inflight tracking and fall back to sync.
            console.warn('[CurtainWallBuilder] §4.2 worker failed for wall', cw.id,
                '— falling back to synchronous build:', err);
            this._inflightWorkerBuilds.delete(cw.id);
            try { this.build(cw); } catch (e2) {
                console.error('[CurtainWallBuilder] §4.2 sync fallback also failed for wall', cw.id, ':', e2);
            }
            this._checkBatchDrainSignal();
        });

        if (CurtainWallBuilder._isBuilderDebugEnabled()) {
            console.log(
                `[CurtainWallBuilder] §4.2-SUBMIT wallId="${cw.id}" reqId="${reqId}" ` +
                `cells=${cells.length} uLines=${uSorted.length} vLines=${vSorted.length} ` +
                `inflight=${this._inflightWorkerBuilds.size}`
            );
        }
    }

    /**
     * Called when a geometry worker posts its result back to the main thread.
     *
     * Validates the result against the current inflight context (stale results
     * from a superseded dispatch are silently discarded).  Valid results are
     * pushed onto `_pendingMainThreadWork` and a FrameScheduler 'pre-render'
     * drain is scheduled if not already pending.
     */
    private _onWorkerResult(result: GeometryWorkerResult): void {
        const entry = this._inflightWorkerBuilds.get(result.wallId);

        if (!entry || entry.reqId !== result.requestId) {
            // Stale or cancelled (remove() was called before the worker responded).
            if (CurtainWallBuilder._isBuilderDebugEnabled()) {
                console.log(
                    `[CurtainWallBuilder] §4.2-STALE discarding worker result ` +
                    `wallId="${result.wallId}" reqId="${result.requestId}" ` +
                    `(expected=${entry?.reqId ?? 'none'})`
                );
            }
            return;
        }

        // Remove from inflight — the result is now owned by _pendingMainThreadWork.
        this._inflightWorkerBuilds.delete(result.wallId);
        this._pendingMainThreadWork.push({ ctx: entry, result });

        // Schedule pre-render drain if not already pending.
        if (this._mainThreadWorkDisposer === null) {
            this._mainThreadWorkDisposer = getFrameScheduler().scheduleOnce(
                'cw-geo-worker-drain',
                () => this._drainMainThreadWork(),
                'pre-render',
            );
        }
    }

    /**
     * FrameScheduler 'pre-render' callback — drains `_pendingMainThreadWork`.
     *
     * Reconstructs THREE.BufferGeometry objects from the typed arrays
     * transferred from the worker, creates Mesh / InstancedMesh children,
     * and adds them to the pre-positioned root Group.
     *
     * After draining, checks whether the batch coordinator drain signal can
     * now be emitted (i.e., both the pending build map AND the inflight worker
     * map are empty, and we are inside a batch).
     */
    private _drainMainThreadWork(): void {
        this._mainThreadWorkDisposer = null;
        const __t0 = performance.now();

        // Splice out all pending items atomically — new items arriving during
        // this synchronous drain will be scheduled for the next frame.
        const work = this._pendingMainThreadWork.splice(0);

        for (const { ctx, result } of work) {
            try {
                this._applyWorkerResult(ctx, result);
            } catch (e) {
                console.error('[CurtainWallBuilder] §4.2-DRAIN error for wall', result.wallId, ':', e);
            }
        }

        const drainMs = performance.now() - __t0;
        if (batchCoordinator.isBatching || CurtainWallBuilder._isBuilderDebugEnabled()) {
            console.log(
                `[CurtainWallBuilder] §4.2-DRAIN applied=${work.length} ` +
                `stillInflight=${this._inflightWorkerBuilds.size} ` +
                `drainMs=${drainMs.toFixed(1)}ms`
            );
        }

        // Check whether the batch drain signal is now unblocked.
        this._checkBatchDrainSignal();
    }

    /**
     * Reconstruct THREE objects from worker-supplied typed arrays and add them
     * to the already-positioned root Group.
     *
     * Geometry is built from transferred Float32Array / Uint16Array data
     * (zero-copy from worker).  Materials come from the builder's caches so
     * no new allocations are needed for materials.
     */
    private _applyWorkerResult(ctx: InflightWorkerBuild, result: GeometryWorkerResult): void {
        const { group, cw, deferShadows, mullionMat, fallbackPanelMat } = ctx;

        // ── Fallback glass panels ─────────────────────────────────────────
        for (const panel of result.fallbackPanels) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(panel.geom.positions, 3));
            geo.setAttribute('normal',   new THREE.BufferAttribute(panel.geom.normals,   3));
            geo.setAttribute('uv',       new THREE.BufferAttribute(panel.geom.uvs,       2));
            geo.setIndex(new THREE.BufferAttribute(panel.geom.indices, 1));

            const mesh = new THREE.Mesh(geo, fallbackPanelMat);
            mesh.position.set(panel.cx, panel.cy, 0);
            mesh.castShadow    = !deferShadows;
            mesh.receiveShadow = !deferShadows;
            mesh.userData = {
                elementType:    'CurtainWallPart',
                modelId:        'model-default',
                role:           'panel',
                parentId:       cw.id,
                isSubElement:   true,
                sharedMaterial: true, // §PERF-2026-Q2-CW-CREATE/F8
            };
            group.add(mesh);
        }

        // ── Vertical mullion InstancedMesh ────────────────────────────────
        if (result.vMullionBox && result.vInstanceMatrices && ctx.uSortedCount > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(result.vMullionBox.positions, 3));
            geo.setAttribute('normal',   new THREE.BufferAttribute(result.vMullionBox.normals,   3));
            geo.setAttribute('uv',       new THREE.BufferAttribute(result.vMullionBox.uvs,       2));
            geo.setIndex(new THREE.BufferAttribute(result.vMullionBox.indices, 1));

            const vIM = new THREE.InstancedMesh(geo, mullionMat, ctx.uSortedCount);
            vIM.castShadow    = !deferShadows;
            vIM.receiveShadow = !deferShadows;
            vIM.userData = {
                elementType:    'CurtainWallPart',
                modelId:        'model-default',
                role:           'mullion-v-instanced',
                parentId:       cw.id,
                isSubElement:   true,
                sharedMaterial: true, // §MI-07: owned by mullionMaterialCache
                // Note: geometry is NOT sharedGeometry — it is built from worker arrays
                // and owned exclusively by this InstancedMesh.
            };
            const mat4 = new THREE.Matrix4();
            const vMats = result.vInstanceMatrices;
            for (let i = 0; i < ctx.uSortedCount; i++) {
                mat4.fromArray(vMats, i * 16);
                vIM.setMatrixAt(i, mat4);
            }
            vIM.instanceMatrix.needsUpdate = true;
            group.add(vIM);
        }

        // ── Horizontal mullion InstancedMesh ──────────────────────────────
        if (result.hMullionBox && result.hInstanceMatrices && ctx.vSortedCount > 0) {
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.BufferAttribute(result.hMullionBox.positions, 3));
            geo.setAttribute('normal',   new THREE.BufferAttribute(result.hMullionBox.normals,   3));
            geo.setAttribute('uv',       new THREE.BufferAttribute(result.hMullionBox.uvs,       2));
            geo.setIndex(new THREE.BufferAttribute(result.hMullionBox.indices, 1));

            const hIM = new THREE.InstancedMesh(geo, mullionMat, ctx.vSortedCount);
            hIM.castShadow    = !deferShadows;
            hIM.receiveShadow = !deferShadows;
            hIM.userData = {
                elementType:    'CurtainWallPart',
                modelId:        'model-default',
                role:           'mullion-h-instanced',
                parentId:       cw.id,
                isSubElement:   true,
                sharedMaterial: true, // §MI-07
            };
            const mat4 = new THREE.Matrix4();
            const hMats = result.hInstanceMatrices;
            for (let i = 0; i < ctx.vSortedCount; i++) {
                mat4.fromArray(hMats, i * 16);
                hIM.setMatrixAt(i, mat4);
            }
            hIM.instanceMatrix.needsUpdate = true;
            group.add(hIM);
        }

        // Clear the workerPending marker so downstream systems see a complete group.
        group.userData.workerPending = false;
    }

    /**
     * Emit `batchCoordinator.signalBuildQueueDrained()` if and only if all
     * three queues are empty and we are inside a batch.
     *
     * Called from both `_drainBuildQueue()` (when _pendingBuildsMap empties)
     * and `_drainMainThreadWork()` (when the last worker result is applied).
     */
    private _checkBatchDrainSignal(): void {
        if (!batchCoordinator.isBatching) return;
        if (this._pendingBuildsMap.size > 0)        return;
        if (this._inflightWorkerBuilds.size > 0)    return;
        if (this._pendingMainThreadWork.length > 0) return;
        console.log(
            '[CurtainWallBuilder] §4.2-SIGNAL all queues empty ' +
            '(pendingBuilds=0, inflightWorkers=0, pendingMainThread=0) ' +
            '— signalling BatchCoordinator.signalBuildQueueDrained().'
        );
        batchCoordinator.signalBuildQueueDrained();
    }

    /**
     * §PERF-2026-Q2-CW-CREATE/F5 — Resolve a `BoxGeometry` for a mullion rack
     * via the cache. The cache key is the rounded `(width, height, depth)`
     * tuple. Returned geometries MUST be referenced behind a mesh whose
     * `userData.sharedGeometry === true` so `_disposeChildren` does not free
     * them on the next rebuild.
     */
    private _getMullionGeometry(width: number, height: number, depth: number): THREE.BoxGeometry {
        const key = `${width.toFixed(4)}_${height.toFixed(4)}_${depth.toFixed(4)}`;
        let geo = this.mullionGeometryCache.get(key);
        if (!geo) {
            geo = new THREE.BoxGeometry(width, height, depth);
            this.mullionGeometryCache.set(key, geo);
        }
        return geo;
    }

    /**
     * §PERF-2026-Q2-CW-CREATE/F8 — Resolve the cached fallback panel material.
     * Used only when no `CurtainPanelStore` is wired up. Mesh consumers MUST
     * stamp `userData.sharedMaterial = true`.
     */
    private _getFallbackPanelMaterial(): THREE.MeshStandardMaterial {
        const key = 'default-glass';
        let mat = this._fallbackPanelMatCache.get(key);
        if (!mat) {
            mat = new THREE.MeshStandardMaterial({
                color:       0x88ccff,
                transparent: true,
                opacity:     0.4,
                metalness:   0.1,
                roughness:   0.1,
                side:        THREE.DoubleSide,
            });
            this._fallbackPanelMatCache.set(key, mat);
        }
        return mat;
    }

    /**
     * Dispose all Mesh/InstancedMesh geometries and OWNED materials within a group.
     *
     * §MI-07: Meshes that set `userData.sharedMaterial = true` use a material
     * that is owned by `mullionMaterialCache` (or `_fallbackPanelMatCache`).
     * Those must NOT be disposed here.
     *
     * §PERF-2026-Q2-CW-CREATE/F5: Meshes that set
     * `userData.sharedGeometry = true` use a geometry owned by
     * `mullionGeometryCache`. Those must NOT be disposed here either —
     * disposing them once would invalidate the cache for every other wall.
     *
     * §PERF-2026-Q2-CW-CREATE/F6: Curtain wall groups are flat (children are
     * direct Mesh / InstancedMesh nodes, no nesting). The previous
     * `group.traverse` walked the entire subtree which is unnecessarily
     * recursive; a flat for-loop over `group.children` is the correct shape.
     */
    private _disposeChildren(group: THREE.Group): void {
        // §H29 (audit) — was a flat for-loop over `group.children`. The
        // assumption that curtain-wall groups are flat (mullion meshes only)
        // does not hold: panel groups contain nested mullion + glazing meshes,
        // and the runtime [GPU Monitor] reported `Geometry count grew 185.7%`
        // immediately after wall deletions because nested mesh geometries
        // were never disposed. group.traverse() walks the whole subtree —
        // matching WallFragmentBuilder._disposeWallGroupChildren's pattern.
        group.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh) && !(obj instanceof THREE.InstancedMesh)) return;
            if (!obj.userData?.sharedGeometry) {
                obj.geometry?.dispose?.();
            }
            if (!obj.userData?.sharedMaterial) {
                if (Array.isArray(obj.material)) {
                    obj.material.forEach((m: THREE.Material) => m.dispose());
                } else if (obj.material) {
                    (obj.material as THREE.Material).dispose();
                }
            }
        });
    }
}
