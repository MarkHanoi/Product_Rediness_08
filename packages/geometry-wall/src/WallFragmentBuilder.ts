/// <reference types="vite/client" />

import * as THREE from '@pryzm/renderer-three/three';
import { mergeGeometries, toCreasedNormals } from '@pryzm/renderer-three';
import { WallData, Opening, FragmentEntityMapping } from './WallTypes';
import { VisualStyle, WALL_REALISTIC_MATERIAL, WALL_SCHEMATIC_MATERIAL } from '@pryzm/core-app-model/material-library';
import { spatialAuthority, SpatialAuthorityError } from '@pryzm/core-app-model';
import { PathResolver } from './PathResolver';
import { buildCurvedLayerGeometry, computeStations } from './CurvedWallLayerBuilder';
import { projectCapVertex } from './CurvedWallCapMiter';
import { clusterOpenings, buildLayeredWallSegmentsAroundOpenings } from './LayeredWallOpeningBuilder';
import { buildMiterPrism } from './MiterPrismBuilder';
// §WALL-PLAIN-HOLE-EXTRUDE — pure (testable) single-body geometry for a plain
// straight wall with openings (one continuous ExtrudeGeometry, no segment seams).
import { buildWallHoleBodyGeometry } from './WallHoleBodyBuilder';
// ADR-0055 — Pascal-style wall pipeline (default ON since 2026-05-27).
// The orchestrator (`WallRebuildCoordinator._flush`) calls `refreshV2Cache()`
// once per level rebuild with the same `levelWalls` slice it feeds to
// `WallJoinResolver.resolveLevel`. The builder NEVER reaches into any store —
// pure data hand-off (L1→L1) so the architectural layering stays clean.
import {
    WallPipelineV2Cache,
    buildWallV2Geometry,
    isWallPipelineV2Enabled,
    type LevelWallSpec,
} from './WallPipelineV2';
import { OpeningRenderData, OpeningRenderMap } from './WallOpeningRenderData';
import { buildWallEdgeOverlay } from './WallEdgeOverlayBuilder';
import { descriptorToBufferGeometry } from './descriptorToBufferGeometry';

// ── §WALL-SINGLE-VOLUME-CSG (#96 phase 3) DI seam types ─────────────────────────
/** Local-frame params handed to the injected single-volume CSG producer. */
export interface SingleVolumeWallParams {
    readonly length: number;
    readonly thickness: number;
    readonly height: number;
    readonly baseOffset: number;
    readonly openings: ReadonlyArray<{ offset: number; width: number; sillHeight: number; height: number }>;
}
/** Booled wall geometry descriptor (structural — produced via the kernel). */
export interface SingleVolumeWallDescriptor {
    readonly position: Float32Array;
    readonly normal?: Float32Array;
    readonly uv?: Float32Array;
    readonly index: Uint32Array | Uint16Array;
}
/** Injected by apps/editor (kernel-backed); geometry-wall stays THREE-only. */
export type SingleVolumeWallProducer =
    (params: SingleVolumeWallParams) => Promise<SingleVolumeWallDescriptor | null>;
import { JoinData } from '@pryzm/core-app-model';
import type { WallInstanceBridge } from './WallInstanceBridge';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { resolveIntentStyle } from '@pryzm/core-app-model';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { batchCoordinator } from '@pryzm/core-app-model';

/**
 * 23-L2 Phase 3: Captures every argument needed to replay an updateWall() call
 * from the deferred rAF drain queue. Newer args for the same wall.id always win
 * (deduplication in updateWall() dispatcher).
 */
interface WallBuildTask {
    wall: WallData;
    joinData?: JoinData | null;
    renderMap?: OpeningRenderMap;
    slabBaseOffset?: number;
    forceRebuild?: boolean;
}

/**
 * §20 FIX: WallFragment contains THREE.Mesh and belongs in the renderer layer.
 * Moved here from WallTypes.ts (semantic layer) to enforce strict layer separation.
 */
export interface WallFragment {
    id: string;
    mesh: THREE.Mesh;
    wallId: string;
    type?: string;
    parentId?: string;
    levelId?: string;
}


// ─── buildMiterPrism is now in MiterPrismBuilder.ts (imported above) ──────────

export class WallFragmentBuilder {
    private scene: THREE.Scene;
    private fragments: Map<string, WallFragment> = new Map();
    private fragmentToEntityMap: Map<string, FragmentEntityMapping> = new Map();

    // §STEP4: miterNormalsCache removed.  Join data is now passed directly to
    // buildWall() as a JoinData argument — no intermediate render-layer cache.
    private wallToFragmentsMap: Map<string, string[]> = new Map();
    private wallRoots: Map<string, THREE.Group> = new Map();

    // ✅ FIX 1 — Prevent Duplicate Rebuilds
    private rebuildingWalls = new Set<string>();

    // §VIEW-DIRTY-CHECK §2.3 + §WALL-DEEP-2026 B3 (RESOLVED 2026-04-24).
    //
    // Composite cache key: `${_renderVersion}|${joinHash}|${slabBaseOffsetTag}`.
    //
    //   The original cache stored only `wall._renderVersion`. That misses the
    //   case where a NEIGHBOUR wall changed (which mutates this wall's
    //   joinData but NOT its own _renderVersion), or where the slab base
    //   offset under this wall changed (worldY shifts). Both regress to a
    //   visibly stale mesh because the cache reports "already built".
    //
    //   The composite key folds in everything updateWall() actually consumes,
    //   so any neighbour-only or slab-only delta now invalidates the cache
    //   while a true no-op rebuild call (same wall, same joins, same slab)
    //   still short-circuits at the version guard.
    //
    // Cleared in removeWall() so that wall re-creation always triggers a fresh build.
    private _lastBuiltVersion = new Map<string, string>();

    /**
     * §WALL-DEEP-2026 B3 — compose the composite cache key. Returns null
     * when `_renderVersion` is undefined so callers preserve the legacy
     * "always rebuild" behaviour for walls without a version stamp.
     */
    private _composeCacheKey(wall: WallData, joinData: JoinData | null | undefined, slabBaseOffset: number | undefined): string | null {
        if (wall._renderVersion === undefined) return null;
        let jh = '_';
        if (joinData) {
            const sm = joinData.startMN
                ? `${joinData.startMN.nx.toFixed(4)},${joinData.startMN.nz.toFixed(4)}`
                : 'sq';
            const em = joinData.endMN
                ? `${joinData.endMN.nx.toFixed(4)},${joinData.endMN.nz.toFixed(4)}`
                : 'sq';
            const b0 = `${joinData.baseLine[0].x.toFixed(4)},${joinData.baseLine[0].z.toFixed(4)}`;
            const b1 = `${joinData.baseLine[1].x.toFixed(4)},${joinData.baseLine[1].z.toFixed(4)}`;
            jh = `${b0}-${b1}|${sm}|${em}`;
        }
        const slabTag = (slabBaseOffset ?? 0).toFixed(4);
        return `${wall._renderVersion}|${jh}|${slabTag}`;
    }

    // §PHASE-3: Optional instanced rendering bridge.
    // Null until EngineBootstrap injects it after initScene wires InstancedElementRenderer.
    // When set, simple walls (no openings, not curved, no miter) route to GPU instancing.
    private _instanceBridge: WallInstanceBridge | null = null;

    // §WALL-SINGLE-VOLUME-CSG (#96 phase 3) — optional injected CSG producer.
    // Null until apps/editor injects it (it imports @pryzm/geometry-kernel's
    // produceWallWithVoids + produceExtrude). When `window.__wallSingleVolume`
    // is on AND this is set, a plain straight wall with openings is upgraded
    // from abutting box segments to one boolean-void solid. Default-off; the
    // segmented mesh always renders first and remains the fallback.
    private _singleVolumeProducer: SingleVolumeWallProducer | null = null;

    /** #96 ph3 DI seam — apps/editor injects the kernel-backed CSG producer. */
    setSingleVolumeProducer(fn: SingleVolumeWallProducer | null): void {
        this._singleVolumeProducer = fn;
    }

    // ── Task 5.6 Phase 5: Wall Rebuild Counter (monitoring) ──────────────────
    // Incremented on every updateWall() call that performs a real geometry rebuild.
    // _skipCount increments when the version guard short-circuits the rebuild.
    // After a view switch, stats.skipRate should be 1.0 (all rebuilds skipped)
    // confirming that Phase 2 dirty checking is working correctly.
    private _buildCount = 0;
    private _skipCount = 0;

    /**
     * §NME-VERSION-FIX — Monotonically-increasing counter stamped onto
     * wallGroup.userData.version on EVERY call to buildWall().
     *
     * Why this is needed:
     *   NativeElementMeshExporter.exportForView() caches proxy geometry using
     *   a key of `elementId:viewId:userData.version:cropKey`.  Previously,
     *   userData.version was set to wall._renderVersion — which does NOT change
     *   when only joinData changes (a join-triggered geometry rebuild).  As a
     *   result, the NME cache returned stale pre-miter proxy geometry for the
     *   plan-view projection, causing the incorrect wall-join rendering in the
     *   2D plan view even though the 3D view was correct.
     *
     *   Using _geometrySeq guarantees a unique version on every actual call to
     *   buildWall() regardless of whether _renderVersion changed, busting the
     *   NME cache correctly on every join-triggered or miter-adjustment rebuild.
     */
    private _geometrySeq = 0;

    // ── 23-L2 Phase 3: rAF-sliced build queue (mirrors SlabFragmentBuilder/CurtainWallBuilder) ──
    /**
     * Starting budget for wall geometries built per animation frame.
     *
     * §PERF-WALL-DRAIN-2026-05-05: The previous value of 3 (and before that, 5)
     * was measured when OBC renders were NOT suppressed during batch drain.  In
     * that context each drain frame also paid the full WebGPU render overhead
     * (~20–100 ms), so 5 walls × ~10 ms geometry + ~100 ms render = 150 ms
     * LONGTASK.  After §PERF-VIEW-BATCH-SUPPRESS was introduced, OBC+PASCAL
     * renders are fully suppressed during the drain — the per-frame cost is
     * ONLY the geometry build (observed: 3 walls = 3.0 ms total in the 2026-05-05
     * log, i.e. ~1 ms/wall).  At 1 ms/wall, 15 walls per frame costs ~15 ms —
     * well under the 50 ms LONGTASK threshold even with scheduling jitter.
     *
     * Adaptive drain (_buildsPerFrame) starts here and adjusts ±1 each frame
     * based on observed build time, capped at MAX_ADAPTIVE_CAP.
     */
    private static readonly MAX_BUILDS_PER_FRAME = 15;
    /** Hard ceiling for the adaptive budget (render is suppressed, so we can go high). */
    private static readonly MAX_ADAPTIVE_CAP = 40;
    /** Adaptive per-frame wall count — starts at MAX_BUILDS_PER_FRAME, adjusts each frame. */
    private _buildsPerFrame = WallFragmentBuilder.MAX_BUILDS_PER_FRAME;
    /**
     * Pending wall builds queued by updateWall() when batchCoordinator.isBatching.
     * Drained by _drainBuildQueue() over multiple rAF frames.
     * If the same wall is updated twice before its frame, the newer args win.
     */
    private _pendingBuilds: WallBuildTask[] = [];
    /** FrameScheduler disposer for the drain loop — null when the drain is idle. */
    private _rafHandle: TickListenerDisposer | null = null;

    /**
     * §A.21.D7-FIX (2026-06-05) — true while wall builds are queued or a drain rAF is
     * in flight. Read by the BatchCoordinator idle-probe (via __wallRebuildControl)
     * so batches that build NO walls complete in ~2 frames instead of the 8 s
     * watchdog. See BatchCoordinator WallBuilderControl.hasPendingBuilds.
     */
    get hasPendingBuilds(): boolean {
        return this._pendingBuilds.length > 0 || this._rafHandle !== null;
    }

    /**
     * Task 5.6 Phase 5: Exposes rebuild statistics for diagnostics.
     * Access via `window.__wallFragmentBuilder?.stats` in the browser console.
     */
    get stats(): { builds: number; skips: number; skipRate: number } {
        return {
            builds: this._buildCount,
            skips: this._skipCount,
            skipRate: this._skipCount / Math.max(1, this._buildCount + this._skipCount),
        };
    }

    private currentVisualStyle: VisualStyle = VisualStyle.CONSISTENT_COLORS;
    private hdriTexture: THREE.Texture | null = null;
    private envMapIntensity: number = 0.5;

    /**
     * §1.1 FIX: BimManager injected at construction time so that updateWall()
     * does not fall back to window.bimManager.
     * Optional to remain backward-compatible with any caller that does not yet
     * supply it — a deprecation warning is emitted in that case.
     */
    private injectedBimManager: any | null = null;

    /**
     * §M-H1 (DAILY-USE-AUDIT 2026-05-20) — STANDARD_MATERIAL_LIBRARY id →
     * `MaterialDefinition` map. When a wall carries `data.materialId` and this
     * map resolves it, `createWallMaterial` builds a real PBR material from
     * `matDef.params` (roughness / metalness / map / normalMap / roughnessMap)
     * rather than the previous behaviour of reading only `data.materialColor`
     * (a hex) and producing a matte plaster. The architect's choice between
     * "Concrete Smooth" and "Steel Stainless Polished" now actually changes
     * the rendered material. Mirrors the established `SlabFragmentBuilder`
     * pattern (`packages/geometry-slab/src/SlabFragmentBuilder.ts:822-858`).
     *
     * Optional for backward compat — when absent, the builder falls back to
     * the existing materialColor-only path, so callers that don't supply a
     * material map continue to work exactly as before.
     */
    private injectedMaterialMap: Map<string, { params?: Record<string, unknown>; textures?: { color?: unknown; normal?: unknown; roughness?: unknown } }> | null = null;

    /**
     * §WALL-AUDIT-2026-M2: View-projection stores (view definitions, view-intent
     * instances, visibility intents) are constructor-injected so that the builder
     * has no read-side dependency on `window.*`. Optional to keep legacy
     * test harnesses (and the early bootstrap window before stores exist) working;
     * `_resolveIntent3DColour()` returns `undefined` when any of these is null,
     * preserving the existing graceful-degrade behaviour for intent resolution.
     */
    private injectedViewDefinitionStore: any | null = null;
    private injectedViewIntentInstanceStore: any | null = null;
    private injectedVisibilityIntentStore: any | null = null;

    /**
     * §4.3 FIX: WallStore reference has been removed from the builder.
     * Window/door display data (frameColor, windowType, etc.) is now resolved
     * by the main.ts subscriber and passed into buildWall() via OpeningRenderMap,
     * preserving builder purity as a pure projection function.
     *
     * §WALL-AUDIT-2026-M2: View-projection stores moved into the constructor —
     * see `injectedView*Store` doc above. Old window-global reads removed.
     */
    constructor(
        scene: THREE.Scene,
        bimManager: any,
        viewStores?: {
            viewDefinitionStore?: any;
            viewIntentInstanceStore?: any;
            visibilityIntentStore?: any;
            /**
             * §M-H1 — STANDARD_MATERIAL_LIBRARY map. When supplied + `wall.materialId`
             * is set, `createWallMaterial` resolves to a PBR material; otherwise the
             * existing `materialColor`-only fallback applies.
             */
            materialMap?: Map<string, { params?: Record<string, unknown>; textures?: { color?: unknown; normal?: unknown; roughness?: unknown } }>;
        },
    ) {
        this.scene = scene;
        this.injectedBimManager = bimManager ?? null;
        this.injectedViewDefinitionStore     = viewStores?.viewDefinitionStore ?? null;
        this.injectedViewIntentInstanceStore = viewStores?.viewIntentInstanceStore ?? null;
        this.injectedVisibilityIntentStore   = viewStores?.visibilityIntentStore ?? null;
        this.injectedMaterialMap             = viewStores?.materialMap            ?? null;

        if (!this.injectedBimManager) {
            console.error(
                '[WallFragmentBuilder] §1.1 (FIX-6): bimManager is required but was not supplied. ' +
                'Pass bimManager as the second constructor argument. ' +
                'The window.bimManager fallback has been removed.'
            );
        }
    }

    /**
     * §1.1 (FIX-6): Returns the injected BimManager. The window.bimManager fallback
     * has been removed — the builder is now fully testable in isolation.
     */
    private getBimManager(): any | null {
        return this.injectedBimManager;
    }

    /**
     * §PHASE-3 Task 3.3: Inject the WallInstanceBridge once InstancedElementRenderer
     * is ready. Called from EngineBootstrap after initScene has wired the renderer.
     * Once set, simple walls (no openings, not curved, no miter) route to GPU
     * instancing instead of building individual fragment meshes.
     */
    setInstanceBridge(bridge: WallInstanceBridge): void {
        this._instanceBridge = bridge;
        console.log('[WallFragmentBuilder] WallInstanceBridge injected — simple walls will use GPU instancing.');
    }

    /**
     * P9-12/P9-13 — Resolve the 3D surface colour for a wall from the active
     * view's VisibilityIntent projection appearance. Falls back gracefully when
     * the intent system is not yet wired (stores absent, active view is not 3D,
     * or no intentId is bound to the view).
     *
     * §WALL-AUDIT-2026-M2: previously read view stores from `window.*`;
     * those reads have been migrated to constructor-injected fields.
     */
    private _resolveIntent3DColour(wall: WallData): string | undefined {
        try {
            // §WALL-AUDIT-2026-M2: read constructor-injected stores; the previous
            // `window.*` reads have been removed. Returning undefined when
            // any store is missing preserves the existing graceful-degrade contract
            // (intent resolution is opt-in, not required for geometry).
            const viewDefStore    = this.injectedViewDefinitionStore;
            const viInstanceStore = this.injectedViewIntentInstanceStore;
            const viStore         = this.injectedVisibilityIntentStore;
            if (!viewDefStore || !viInstanceStore || !viStore) return undefined;
            const activeViewId: string | undefined = viewDefStore.getActiveId?.();
            if (!activeViewId) return undefined;
            const viewDef = viewDefStore.get?.(activeViewId);
            if (!viewDef || viewDef.viewType !== '3d') return undefined;
            const instance = viInstanceStore.get?.(activeViewId);
            if (!instance) return undefined;
            const intent = viStore.get?.(instance.intentId);
            if (!intent) return undefined;
            const appearance = resolveIntentStyle(
                instance, intent, 'wall', 'projection', '3d',
                { elementId: wall.id, elementType: 'wall' },
                viewDef.purpose,
            );
            return appearance.fill?.colour ?? undefined;
        } catch {
            return undefined;
        }
    }

    setVisualStyle(style: VisualStyle): void {
        this.currentVisualStyle = style;
    }

    setHdriTexture(texture: THREE.Texture | null, intensity: number = 0.5): void {
        this.hdriTexture = texture;
        this.envMapIntensity = intensity;
    }

    // ✅ FIX 1 — Replace updateWall() with rebuild guard
    // §4.3 FIX: renderMap carries pre-resolved window/door display data from the
    // subscriber (which has legitimate store access), so the builder never queries
    // the store itself.
    //
    // §SLAB-BASE: slabBaseOffset is the offset (metres) of the slab TOP face above
    // the level datum, resolved by EngineBootstrap via resolveSlabBaseOffsetForWall()
    // before this method is called.  Defaults to 0 when no slab covers the wall,
    // preserving backward-compatible behaviour (§06-§3.4).
    //
    // §STEP4: joinData carries the miter normals resolved by WallJoinResolver for
    // this wall.  Passed straight through to buildWall() — no cache involved.
    //
    // 23-L2 Phase 3 Dispatcher: routes to the rAF build queue (batch mode) or the
    // synchronous _buildWallInternal() path (interactive edits). During a batch
    // (batchCoordinator.isBatching === true):
    //   - Pushes args to _pendingBuilds (deduplicating by id — newer args win).
    //   - Schedules _drainBuildQueue() on the next rAF if not already running.
    //   - Returns immediately — NO synchronous geometry work occurs.
    // Outside of a batch: calls _buildWallInternal() synchronously (unchanged
    // interactive-edit behaviour).
    updateWall(wall: WallData, joinData?: JoinData | null, renderMap?: OpeningRenderMap, slabBaseOffset?: number, forceRebuild?: boolean): void {
        if (batchCoordinator.isBatching) {
            const existingIdx = this._pendingBuilds.findIndex(b => b.wall.id === wall.id);
            if (existingIdx >= 0) {
                this._pendingBuilds[existingIdx] = { wall, joinData, renderMap, slabBaseOffset, forceRebuild };
            } else {
                this._pendingBuilds.push({ wall, joinData, renderMap, slabBaseOffset, forceRebuild });
            }
            if (this._rafHandle === null) {
                // Sprint A32 (C11 §5.2/§6.1): geometry must land before the render pass.
                const FrameScheduler = getFrameScheduler();
                this._rafHandle = FrameScheduler.schedule('pre-render', () => this._drainBuildQueue());
            }
            return;
        }
        this._buildWallInternal(wall, joinData, renderMap, slabBaseOffset, forceRebuild);
    }

    /**
     * 23-L2 Phase 3: rAF drain — processes up to MAX_BUILDS_PER_FRAME queued wall
     * builds per animation frame, then reschedules if the queue is non-empty.
     *
     * When the queue is fully drained during a batch, signals BatchCoordinator
     * to begin the deferred registration drain + final REDETECT_ROOMS sweep.
     * The isBatching guard prevents spurious signals on non-batch drain paths.
     */
    private _drainBuildQueue(): void {
        this._rafHandle = null;
        const __t_drain_start = performance.now();
        const __queue_before = this._pendingBuilds.length;
        const batch = this._pendingBuilds.splice(0, this._buildsPerFrame);
        for (const task of batch) {
            try {
                this._buildWallInternal(task.wall, task.joinData, task.renderMap, task.slabBaseOffset, task.forceRebuild);
            } catch (e) {
                console.error('[WallFragmentBuilder] build error in rAF batch for wall', task.wall.id, ':', e);
            }
        }
        const frameMs = performance.now() - __t_drain_start;

        // §PERF-WALL-DRAIN-2026-05-05: Adaptive budget — OBC renders are suppressed
        // during batch drain so frameMs is pure geometry cost.  Scale up aggressively
        // when frames are cheap; throttle only if geometry is unexpectedly slow.
        if (frameMs < 8 && this._buildsPerFrame < WallFragmentBuilder.MAX_ADAPTIVE_CAP) {
            this._buildsPerFrame++;
        } else if (frameMs > 20 && this._buildsPerFrame > 5) {
            this._buildsPerFrame--;
        }

        console.log(
            `[WallFragmentBuilder] RAF_DRAIN built=${batch.length} remaining=${this._pendingBuilds.length} ` +
            `queueBefore=${__queue_before} frameMs=${frameMs.toFixed(1)}ms nextBudget=${this._buildsPerFrame} isBatch=${batchCoordinator.isBatching}`
        );
        if (this._pendingBuilds.length > 0) {
            // Sprint A32 (C11 §5.2/§6.1): reschedule at pre-render for next frame.
            const FrameScheduler = getFrameScheduler();
            this._rafHandle = FrameScheduler.schedule('pre-render', () => this._drainBuildQueue());
        } else {
            if (batchCoordinator.isBatching) {
                console.log('[WallFragmentBuilder] rAF queue drained — signalling BatchCoordinator.');
                batchCoordinator.signalBuildQueueDrained();
            }
        }
    }

    /**
     * 23-L2 Phase 3: Internal synchronous build — full wall geometry construction pipeline.
     * Called by updateWall() when NOT batching, or by _drainBuildQueue() during
     * the rAF drain of a batch operation.
     *
     * Existing behaviour is fully preserved — this is the original updateWall()
     * body, extracted to enable the rAF-sliced queue dispatcher above.
     */
    private _buildWallInternal(wall: WallData, joinData?: JoinData | null, renderMap?: OpeningRenderMap, slabBaseOffset?: number, forceRebuild?: boolean): void {
        // §VIEW-DIRTY-CHECK §2.3 + §WALL-DEEP-2026 B3: skip rebuild when the
        // composite cache key (renderVersion + joinHash + slabBaseOffset) is
        // unchanged from the last successful build. A neighbour-only change
        // now correctly invalidates because it mutates joinData even when
        // wall._renderVersion stays the same.
        const cacheKey = this._composeCacheKey(wall, joinData, slabBaseOffset);
        if (!forceRebuild && cacheKey !== null) {
            const lastKey = this._lastBuiltVersion.get(wall.id);
            if (cacheKey === lastKey) {
                this._skipCount++;   // Task 5.6 Phase 5: version guard skipped rebuild
                return;
            }
        }

        if (this.rebuildingWalls.has(wall.id)) return;
        this.rebuildingWalls.add(wall.id);

        try {
            // Contract 13.2: worldY MUST be computed via BimManager.
            // §1.1 FIX: Use injected bimManager (via constructor) first,
            // with a safe window-global fallback during the migration window.
            const bimManager = this.getBimManager();
            if (!bimManager) throw new Error("BimManager not found");

            const level = bimManager.getLevelById(wall.levelId);
            if (!level) {
                // §WALL-AUDIT-2026-C1: hard-fail instead of silent return.
                // The previous graceful-degrade left WallStore entries with no
                // scene representation — a "ghost wall" that would survive
                // save/load with no visible geometry and no error to the user
                // (audit contract §02 §6, §01 §4.4). Throw a typed error here
                // and let the caller (EngineBootstrap._flushWallRebuild) wrap
                // each per-wall builder call in its own try/catch so one bad
                // wall does not stop the rest of the rebuild pass.
                throw new SpatialAuthorityError(
                    `Level "${wall.levelId}" not found for wall "${wall.id}" — ` +
                    `cannot resolve worldY. Ensure the wall's levelId references ` +
                    `an existing BimManager level.`
                );
            }

            // §SLAB-BASE: worldY is the sum of three independent vertical offsets:
            //   level.elevation   — absolute datum of this storey (BimManager)
            //   slabBaseOffset    — slab top face above datum (0 when no slab present)
            //   wall.baseOffset   — manual fine-tune (additive, default 0)
            //
            // ✅ FIX 4: Canonical wall.baseOffset is 0. Changed fallback from 0.2 → 0
            // to match WallTool and CreateWallCommand. The 0.2 default caused walls
            // with no explicit baseOffset to float 20cm above floor level.
            const worldY = level.elevation + (slabBaseOffset ?? 0) + (wall.baseOffset ?? 0);

            // ✅ FIX §13 / Split-brain worldY: Pass the authoritative worldY computed
            // here (via BimManager) directly into buildWall() so buildWall() does NOT
            // need to call spatialAuthority.resolveWorldTransform() for elevation.
            // Previously, updateWall() computed worldY but never used it — buildWall()
            // independently derived Y from spatialAuthority, creating two divergent paths.
            // PERF-FIX (Apr 2026): per-wall log gated behind opt-in debug flag.
            if (window.__pryzmDebugWalls) {
                console.log(`[WallFragmentBuilder] updateWall for ${wall.id} at worldY: ${worldY} (levelElev=${level.elevation} slabOff=${slabBaseOffset ?? 0} wallOff=${wall.baseOffset ?? 0})`);
            }
            this._buildCount++;      // Task 5.6 Phase 5: count real geometry rebuilds
            this.buildWall(wall, joinData, renderMap, worldY);

            // §VIEW-DIRTY-CHECK §2.3 + §WALL-DEEP-2026 B3: record the composite
            // key we just built so subsequent calls with the same render
            // version, joinData and slabBaseOffset short-circuit cleanly.
            if (cacheKey !== null) {
                this._lastBuiltVersion.set(wall.id, cacheKey);
            }
        } finally {
            this.rebuildingWalls.delete(wall.id);
        }
    }

    /**
     * §MITER-FIX §BUILD-VERSION: Records the render version at which this wall's
     * geometry was last built.  Must be called by the flush pipeline's
     * adjustments.forEach loop (which calls buildWall() directly, bypassing
     * updateWall()) so that the version-guard in subsequent updateWall() calls
     * correctly skips redundant rebuilds of adjacent walls.
     *
     * Without this, the store.update() inside adjustments.forEach bumps
     * _renderVersion but buildWall() never updates _lastBuiltVersion, leaving a
     * permanent mismatch that causes adjacent walls to lose their miter geometry
     * the next time updateWall(wall, null) is invoked (e.g. from the
     * spatial-authority level-elevation-change callback).
     */
    recordBuiltVersion(
        wallId: string,
        wallOrRenderVersion: WallData | number | undefined,
        joinData?: JoinData | null,
        slabBaseOffset?: number,
    ): void {
        // §WALL-DEEP-2026 B3 — accept either the legacy `(wallId, renderVersion)`
        // shape or the new `(wallId, wall, joinData, slabBaseOffset)` shape so
        // existing callers compile unchanged. The new shape produces the full
        // composite cache key; the legacy shape produces a degenerate key
        // (renderVersion + null join + 0 slab) which is correct for the
        // historical behaviour where callers only knew the render version.
        if (wallOrRenderVersion === undefined) return;
        if (typeof wallOrRenderVersion === 'number') {
            // Legacy shape — write a key that matches what _composeCacheKey
            // would produce for an unknown joinData / slabOffset.
            this._lastBuiltVersion.set(wallId, `${wallOrRenderVersion}|_|0.0000`);
            return;
        }
        const key = this._composeCacheKey(wallOrRenderVersion, joinData, slabBaseOffset);
        if (key !== null) {
            this._lastBuiltVersion.set(wallId, key);
        }
    }

    removeWall(wallId: string): void {
        // §STEP4: No miterNormalsCache to clear — joinData is passed per-call.
        // §VIEW-DIRTY-CHECK §2.3: clear the cached version so that if this wall is
        // re-created (undo of delete), updateWall() always triggers a fresh build.
        this._lastBuiltVersion.delete(wallId);

        // §PHASE-3: Unregister from GPU instancing if the wall was on the instanced path.
        this._instanceBridge?.unregister(wallId);

        // §PHASE-4 Task 4.2: Remove plan symbol to prevent ghost outlines in plan view
        // after wall deletion or undo. Safe no-op if planSymbolCache is not yet wired.
        try { window.__planSymbolCache?.invalidate?.(wallId); } catch { /* noop */ }

        const root = this.wallRoots.get(wallId);
        if (root) {
            this.scene.remove(root);
            this.wallRoots.delete(wallId);
            elementRegistry.unregisterRoot(wallId);
            this.removeWallFragments(wallId);
        }
    }

    removeOpening(openingId: string): void {
        // Search through all wall roots for the opening group
        for (const root of this.wallRoots.values()) {
            const opening = root.children.find(child => child.userData.id === openingId);
            if (opening) {
                root.remove(opening);
                // Also clean up fragments map
                const fragIds = this.wallToFragmentsMap.get(root.userData.id) || [];
                const updatedFrags = fragIds.filter(id => {
                    const frag = this.fragments.get(id);
                    if (frag?.mesh === opening) {
                        this.fragments.delete(id);
                        return false;
                    }
                    return true;
                });
                this.wallToFragmentsMap.set(root.userData.id, updatedFrags);
                break;
            }
        }
    }

    // §STEP4: setMiterNormals() and hasMiterNormals() removed.
    // Join data is now passed directly to buildWall() / updateWall() as JoinData.
    // EngineBootstrap maintains its own prevJoinMap<wallId,boolean> for the
    // §STALE-CACHE-FIX path — no builder-side cache needed.

    // §4.3 FIX: renderMap carries pre-resolved opening display data supplied by
    // the subscriber — the builder no longer queries the store directly.
    //
    // ✅ FIX §13 / Split-brain worldY: worldY is an optional parameter.
    // When supplied by updateWall() (the authoritative path), it is used directly
    // and spatialAuthority.resolveWorldTransform() is NOT called for elevation,
    // eliminating the Builder → SpatialAuthority → window-global cross-layer violation.
    // When NOT supplied (e.g. direct calls from EngineBootstrap for miter adjustments),
    // the method falls back to spatialAuthority.resolveWorldTransform() to preserve
    // backward compatibility with existing direct call sites.
    //
    // §STEP4: joinData is the JoinData resolved by WallJoinResolver for this wall.
    // When present, startMN / endMN are used for miter geometry.  When null/absent,
    // all end caps are perpendicular (free wall end, no join).  Replaces the old
    // miterNormalsCache pattern — the builder is now a pure function of its inputs.
    buildWall(wall: WallData, joinData?: JoinData | null, renderMap?: OpeningRenderMap, worldY?: number): string[] {
        // §NME-VERSION-FIX: increment before touching userData so the version is
        // unique on every actual geometry build regardless of call path.
        this._geometrySeq++;

        // Step 1: Get or Create Persistent Root
        let wallGroup = this.wallRoots.get(wall.id);

        if (!wallGroup) {
            // Strict ID-based lookup in scene to prevent duplicate roots
            const existingInScene = this.scene.children.find(child => child.userData?.id === wall.id) as THREE.Group;
            if (existingInScene) {
                console.warn(`Duplicate wall root detected: ${wall.id}. Reusing existing scene object.`);
                wallGroup = existingInScene;
            } else {
                wallGroup = new THREE.Group();
                wallGroup.userData = {
                    id: wall.id,
                    elementType: 'wall',
                    type: 'wall',
                    selectable: true,
                };
                // §WALL-AUDIT-2026-M5: defence-in-depth — lock identity fields
                // (id, type, elementType) so downstream consumers cannot mutate
                // them. Other userData fields (baseLine, height, etc.) remain
                // writable since they are re-synced on every rebuild below.
                Object.defineProperty(wallGroup.userData, 'id',          { value: wall.id, writable: false, configurable: false, enumerable: true });
                Object.defineProperty(wallGroup.userData, 'type',        { value: 'wall',  writable: false, configurable: false, enumerable: true });
                Object.defineProperty(wallGroup.userData, 'elementType', { value: 'wall',  writable: false, configurable: false, enumerable: true });
                this.scene.add(wallGroup);
            }
            this.wallRoots.set(wall.id, wallGroup);
        }
        elementRegistry.registerRoot(wall.id, wallGroup);

        // ✅ FIX 2 & 3 — Hard Reset Geometry Before Rebuild
        // §PHASE-3 Task 3.3: Use _disposeWallGroupChildren() which disposes ALL
        // child geometry and materials (including wall-body fragments and edge overlays)
        // before clearing, preventing GPU memory leaks on every rebuild.
        this._disposeWallGroupChildren(wallGroup);

        // Remove fragment tracking
        this.removeWallFragments(wall.id);

        // §WALL-AUDIT-2026-M5: identity fields (id, type, elementType) are locked
        // when the group is first created (above) or when an existing root from
        // wallRoots / scene is adopted (lock-once block below). Redundant
        // re-assignments here would throw in strict mode against the frozen
        // descriptors, so we limit ourselves to syncing mutable fields only.
        // For groups discovered via wallRoots / scene-children fallback we
        // ensure the identity descriptors are present and frozen.
        const ud: any = wallGroup.userData;
        const idDesc = Object.getOwnPropertyDescriptor(ud, 'id');
        if (!idDesc || idDesc.writable) {
            // Re-define from scratch so the lock is consistent across creation paths.
            try { delete ud.id; } catch (_) {}
            try { delete ud.type; } catch (_) {}
            try { delete ud.elementType; } catch (_) {}
            Object.defineProperty(ud, 'id',          { value: wall.id, writable: false, configurable: false, enumerable: true });
            Object.defineProperty(ud, 'type',        { value: 'wall',  writable: false, configurable: false, enumerable: true });
            Object.defineProperty(ud, 'elementType', { value: 'wall',  writable: false, configurable: false, enumerable: true });
        }
        wallGroup.userData.modelId = 'model-default';
        wallGroup.userData.selectable = true;
        // §NME-VERSION-FIX: stamp _geometrySeq (incremented at the top of this
        // method) rather than wall._renderVersion.  _renderVersion does NOT change
        // when only joinData changes (a join-triggered rebuild), so the
        // NativeElementMeshExporter proxy cache would serve stale pre-miter
        // geometry to the plan-view projection.  _geometrySeq is unique on every
        // actual buildWall() call regardless of which field changed, busting the
        // NME cache correctly for join-triggered and miter-adjustment rebuilds.
        wallGroup.userData.version = this._geometrySeq;
        // §14 FIX: levelId populated here — before any early-return branch — so
        // ALL code paths (layered-no-openings, curved, layered-curved) expose it
        // in userData. Previously only the plain-wall path set it via Object.assign
        // at the bottom of buildWall(), leaving the other paths without levelId.
        wallGroup.userData.levelId = wall.levelId;
        // Sync OBB-highlight fields early — before any early-return branch — so
        // SelectionManager.applyHighlight() can read these on ALL wall types
        // (plain, layered, curved, layered-curved, and with/without openings).
        wallGroup.userData.baseLine  = wall.baseLine;
        wallGroup.userData.height    = wall.height;
        wallGroup.userData.thickness = wall.thickness;
        wallGroup.userData.baseOffset = wall.baseOffset;
        wallGroup.userData.openings = wall.openings ?? [];

        // Root group origin at wall start point
        // Phase B DTO migration: baseLine is [Point3D, Point3D]; reconstruct THREE.Vector3
        // here at the builder boundary — the only place THREE objects are materialised.
        const [startPt, endPt] = wall.baseLine;
        const start = new THREE.Vector3(startPt.x, startPt.y, startPt.z);
        const end   = new THREE.Vector3(endPt.x,   endPt.y,   endPt.z);

        // §WJR-INVALID (Jun 2026 — durable degenerate-wall layer, A.WJ.MULTICLUSTER):
        // The PRIMARY mechanism. When the resolver determines a wall cannot be
        // validly joined into a finite, non-degenerate baseline (self-cluster wall,
        // diff-thickness offset the clean-butt fallback cannot rescue, zero-length
        // or NaN baseline), it flags that wall's JoinData `invalid: true` with a
        // reason. We consult that flag HERE — before any geometry op — and skip the
        // build BY INTENT, so we KNOW which walls were skipped (logged once) instead
        // of silently relying on the non-finite/near-zero sniff below. The §WJR-NAN-
        // GUARD that follows remains as a belt-and-suspenders backstop for any
        // degeneracy not flagged at resolve time (e.g. a baseline written by a path
        // that bypasses the resolver).
        if (joinData?.invalid) {
            if (!wallGroup.userData.__wjrInvalidLogged) {
                wallGroup.userData.__wjrInvalidLogged = true;
                console.warn(
                    `[WallJoinResolver] §WJR-INVALID skipped ${wall.id}: ` +
                    `${joinData.invalidReason ?? 'unspecified'}`
                );
            }
            // Identity + OBB-highlight userData are already synced above; leave the
            // group with no body fragment and hide it so no degenerate geometry ever
            // reaches the renderer / picking / CSG. Mark with the same hidden flag the
            // NaN guard uses so a later VALID rebuild (joinData.invalid cleared) can
            // restore visibility without clobbering level isolate/hide intent.
            wallGroup.userData.__wjrNaNHidden = true;
            wallGroup.visible = false;
            return [];
        }
        // A previously-invalid wall that is now valid: clear the one-shot log latch
        // so a future re-degeneration logs again.
        if (wallGroup.userData.__wjrInvalidLogged) {
            wallGroup.userData.__wjrInvalidLogged = false;
        }

        // §WJR-NAN-GUARD (Jun 2026 — consumer safety net, diff-thickness HANG fix):
        // The synchronous load-time rebuild MUST NOT hand a non-finite or
        // near-zero-length baseline to the geometry ops below (extrude / footprint
        // / CSG / BVH bounding-volume maths). A NaN-coordinate BufferGeometry is
        // the canonical non-terminating case: the extruder's computeBoundingSphere
        // spins, and a NaN mesh fed to BVH/CSG never partitions/closes — freezing
        // the tab on project-open (see
        // docs/03-execution/analysis/WALLJOINRESOLVER-DIFF-THICKNESS-HANG-2026-06-03.md).
        // A hang is NOT catchable, so this guard runs BEFORE any geometry op (not
        // via the WallRebuildCoordinator try/catch). If the baseline is degenerate
        // we skip the geometry build and leave an empty (hidden) wall group rather
        // than build NaN geometry. A wrong-but-fast result beats a frozen tab.
        const MIN_WALL_LEN = 1e-3; // metres
        const _coordFinite =
            Number.isFinite(start.x) && Number.isFinite(start.y) && Number.isFinite(start.z) &&
            Number.isFinite(end.x)   && Number.isFinite(end.y)   && Number.isFinite(end.z);
        if (!_coordFinite || start.distanceTo(end) < MIN_WALL_LEN) {
            console.warn(
                `[WallFragmentBuilder] §WJR-NAN-GUARD skipped degenerate wall ${wall.id} ` +
                `(finite=${_coordFinite} len=${_coordFinite ? start.distanceTo(end).toFixed(5) : 'NaN'})`
            );
            // The group already has its identity + OBB-highlight userData synced
            // above; we simply leave it with no body fragment and hide it so no
            // NaN geometry ever reaches the renderer/picking/CSG. The flag lets a
            // later valid rebuild restore visibility without clobbering external
            // visibility intent (level isolate/hide).
            wallGroup.userData.__wjrNaNHidden = true;
            wallGroup.visible = false;
            return [];
        }
        // Restore visibility only if THIS guard previously hid the group — never
        // override the visibility subsystem's intent for a normal valid wall.
        if (wallGroup.userData.__wjrNaNHidden) {
            wallGroup.userData.__wjrNaNHidden = false;
            wallGroup.visible = true;
        }

        // ✅ FIX §13 / Split-brain worldY: use the pre-computed worldY when supplied
        // by updateWall() (the authoritative BimManager-based path). Only fall back
        // to spatialAuthority.resolveWorldTransform() for direct call sites (e.g.
        // miter-adjust rebuilds in EngineBootstrap) that do not yet pass worldY.
        // This eliminates the Builder → SpatialAuthority → window-global cross-layer
        // read that was flagged as a §4 / §12 contract violation.
        let resolvedY: number;
        if (worldY !== undefined) {
            resolvedY = worldY;
        } else {
            // §WALL-AUDIT-2026-M10: hard-fail instead of silently positioning at y=0.
            // The previous catch+resolvedY=0 fallback was the same anti-pattern as C1 —
            // a wall whose spatial transform could not be resolved would silently sit
            // at the world origin instead of surfacing the error. Re-wrap the resolver
            // exception in a SpatialAuthorityError so callers (EngineBootstrap miter
            // adjustments) can isolate the failure per-wall.
            try {
                resolvedY = spatialAuthority.resolveWorldTransform(wall.id).position.y;
            } catch (e) {
                throw new SpatialAuthorityError(
                    `resolveWorldTransform failed for wall "${wall.id}" — ` +
                    `cannot determine worldY. Pass worldY explicitly via updateWall() ` +
                    `if this wall is being rebuilt before SpatialAuthority registration. ` +
                    `Underlying error: ${(e as Error)?.message ?? e}`,
                );
            }
        }

        // Position root at start point + elevation
        wallGroup.position.set(start.x, resolvedY, start.z);

        // ── §PHASE-3 Task 3.3: Routing Decision ─────────────────────────────────────
        // A wall is eligible for GPU instancing when:
        //   1. WallInstanceBridge has been injected (_instanceBridge !== null)
        //   2. No openings (geometry split at openings requires the standard mesh path)
        //   3. Not curved (arc geometry cannot be encoded in a unit-box instance matrix)
        //   4. No miter join data (miter prism geometry requires custom CSG)
        //
        // ~70–85% of walls in a typical office building qualify. Instanced walls
        // collapse N draw calls into ~1 per (geometry × level) group.
        const _hasOpenings = wall.openings && wall.openings.length > 0;
        const isSimpleWall = (
            this._instanceBridge !== null &&
            !_hasOpenings &&
            !wall.curve &&
            !joinData?.startMN &&
            !joinData?.endMN
        );

        if (isSimpleWall) {
            // §WALL-AUDIT-2026-C1 (move-restore): sync ONLY mutable userData here.
            // The identity triple (id, type, elementType) is locked once at the
            // top of buildWall() via Object.defineProperty(writable:false). Touching
            // those keys via Object.assign throws TypeError in strict mode and
            // aborted the rebuild — the wall snapped back to its pre-move position
            // because the new baseLine never reached the scene graph.  See also
            // CONTRACT 03 §1.5 (identity fields are written-once, never re-asserted)
            // and CONTRACT 34 §6 (drag-end MUST go through UpdateWallBaselineCommand).
            this._syncMutableWallUserData(wallGroup, wall, { isInstanced: true });

            const intentColour = this._resolveIntent3DColour(wall);
            // §BEIGE-WALL-FIX (2026-06-08) — the instanced "simple wall" path (plain
            // wall, no openings, no miter join) must default to the SAME white as the
            // standard mesh path (createWallMaterial → WALL_SCHEMATIC_MATERIAL 0xe8e8e8).
            // The old '#d4c5b0' beige fallback made join/opening-free walls (e.g. whole
            // ground-floor runs of a generated house) render tan while their
            // opening-bearing neighbours rendered white — the "beige walls failing" bug.
            const mat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(intentColour ?? wall.materialColor ?? '#e8e8e8'),
            });
            this._instanceBridge!.register(wall, resolvedY, joinData, mat);

            // §INSTANCED-SELECTION-FIX: Add an invisible hit-proxy mesh so that
            // SelectionManager raycasting can find this wall. Instanced walls have no
            // child meshes inside wallGroup — the rendered geometry lives in the
            // InstancedMesh owned by WallInstanceBridge. Without this proxy,
            // intersectObjects(candidates, true) finds nothing and the wall cannot
            // be selected, deleted, or moved.
            //
            // The proxy is a BoxGeometry matching the wall's physical extent.
            // MeshBasicMaterial with colorWrite:false + depthWrite:false means
            // the mesh is "visible" (so THREE.js raycasts it) but writes nothing
            // to the colour or depth buffer — it is completely imperceptible.
            // _disposeWallGroupChildren() will properly dispose it on the next rebuild.
            {
                const wdx = end.x - start.x;
                const wdz = end.z - start.z;
                const wallLen    = Math.sqrt(wdx * wdx + wdz * wdz);
                const wallAngle  = Math.atan2(wdz, wdx);
                const baseOff    = wall.baseOffset ?? 0;

                const proxyGeo  = new THREE.BoxGeometry(wallLen, wall.height, wall.thickness);
                const proxyMat  = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
                const proxyMesh = new THREE.Mesh(proxyGeo, proxyMat);

                proxyMesh.userData = { role: 'hit-proxy' };
                // Centre of wall in wallGroup local space:
                // • X/Z: midpoint along wall direction
                // • Y  : half-height above base offset
                proxyMesh.position.set(wdx / 2, wall.height / 2 + baseOff, wdz / 2);
                proxyMesh.rotation.y = -wallAngle;
                wallGroup.add(proxyMesh);
            }

            // No fragment tracking for instanced walls — the instance slot is the record.
            this.wallToFragmentsMap.set(wall.id, []);
            return [];
        }

        // Standard mesh path: unregister from instancing if this wall was previously
        // instanced (e.g. an opening was just added to a formerly-simple wall).
        if (this._instanceBridge?.isInstanced(wall.id)) {
            this._instanceBridge.unregister(wall.id);
        }

        const fragmentIds: string[] = [];

        // Main wall parameters
        const direction = new THREE.Vector3().subVectors(end, start);
        const wallLength = direction.length();
        direction.normalize();
        const wallHeight = wall.height;
        const wallThickness = wall.thickness;
        // §FIX-NAN-Y (2026-05-19): wall.baseOffset is optional; undefined produces
        // NaN in every vertex Y coordinate via `yBot = wallBaseOffset + height`.
        // Default to 0 so walls with no explicit baseOffset render at floor level.
        const wallBaseOffset = wall.baseOffset ?? 0;

        // Helper to position relative to root (start point) — straight walls only
        const positionLocal = (mesh: THREE.Mesh | THREE.Group, offset: number, localY: number) => {
            const pos = direction.clone().multiplyScalar(offset);
            mesh.position.set(pos.x, localY, pos.z);
            const angle = Math.atan2(direction.z, direction.x);
            mesh.rotation.y = -angle;
        };

        // ─── CONTRACT §03-1.3: LAYERED WALL BRANCH ──────────────────────────────────
        // When WallData.layers is present (stamped by CreateWallCommand from a
        // WallSystemType), we render N separate meshes — one per layer — offset
        // laterally along the wall's outward normal so they stack from exterior
        // to interior.  The total stack is centred on the baseline (same spatial
        // anchor as a plain wall) so the snap/intent resolver sees no change.
        //
        // Curved layered walls: each layer follows the same arc, offset radially.
        // Openings on straight layered walls: supported via LayeredWallOpeningBuilder.
        // ─────────────────────────────────────────────────────────────────────────
        if (wall.layers && wall.layers.length > 0 && !wall.curve) {
            const totalThickness = wall.layers.reduce((s: number, l: any) => s + l.thickness, 0);

            // ── LAYERED WALL WITH OPENINGS ────────────────────────────────────────
            // When openings are present, split each layer into wall-body segments
            // around the openings (using BoxGeometry per layer), then add
            // door/window frames that span the full wall thickness.
            // The existing miter-prism path (below) is used only when no openings.
            if (wall.openings && wall.openings.length > 0) {
                // Cluster overlapping openings (shared helper; same algorithm as plain wall path)
                const clusters = clusterOpenings(wall.openings);

                // §STEP4: Convert JoinData → LayerMiterNormals shape for this helper.
                const _layOpenMN: import('./LayeredWallOpeningBuilder').LayerMiterNormals | undefined =
                    joinData ? { start: joinData.startMN, end: joinData.endMN } : undefined;

                // Build per-layer wall-body segments around openings
                const segmentMeshes = buildLayeredWallSegmentsAroundOpenings(
                    wall,
                    wallGroup,
                    clusters,
                    totalThickness,
                    _layOpenMN,
                );

                // Register each segment mesh as a wall-body fragment
                // §OPENING-EDGE-FIX: edge overlays are NOT added per-segment when openings
                // are present. Per-segment overlays create visible lines on the wall face at
                // every internal segment boundary (sill, head, jamb splits). Instead, a single
                // wall-outline edge overlay is added below after all segments are built.
                for (const mesh of segmentMeshes) {

                    const fragmentId = crypto.randomUUID();
                    const fragment: WallFragment = {
                        id: fragmentId,
                        wallId: wall.id,
                        mesh: mesh as any,
                        type: 'wall-body',
                        parentId: wall.id,
                        levelId: wall.levelId,
                    };
                    this.fragments.set(fragmentId, fragment);
                    this.fragmentToEntityMap.set(fragmentId, {
                        fragmentId,
                        elementId: wall.id,
                        type: 'wall',
                        entityType: 'wall',
                        entityId: wall.id,
                    });
                    fragmentIds.push(fragmentId);
                }

                // Add door/window frames (span full wall thickness — same as plain wall path)
                // createWindowFrame / createDoorFrame use wall.thickness for frame depth and
                // self-position along the baseline, so they work unchanged for layered walls.
                // §4.3 FIX: render data resolved externally and passed in via renderMap.
                for (const op of wall.openings) {
                    if (!op.elementId) continue;

                    const existing = wallGroup.children.find(
                        (c) => c.userData?.id === op.elementId,
                    );
                    if (existing) wallGroup.remove(existing);

                    const opRenderData = renderMap?.get(op.elementId);
                    const frame =
                        op.type === 'door'
                            ? this.createDoorFrame(wall, op, opRenderData)
                            : this.createWindowFrame(wall, op, opRenderData);

                    if (frame.children.length > 0 || Object.keys(frame.userData).length > 0) {
                        wallGroup.add(frame);
                        const fragId = crypto.randomUUID();
                        this.fragments.set(fragId, {
                            id: fragId,
                            wallId: wall.id,
                            mesh: frame as any,
                            type: 'opening',
                            parentId: wall.id,
                            levelId: wall.levelId,
                        });
                        fragmentIds.push(fragId);
                    }
                }

                // §OPENING-EDGE-FIX: Single outer-profile edge overlay for the whole wall.
                // When miter normals are present (wall is part of a join) we use buildMiterPrism
                // geometry so the angled join edge lines are preserved on the overlay.
                // Otherwise fall back to a simple BoxGeometry (no join, perpendicular ends).
                {
                    let outlineEdges: THREE.Object3D;
                    if (_layOpenMN?.start || _layOpenMN?.end) {
                        const segStart = new THREE.Vector3(0, 0, 0);
                        const segEnd   = direction.clone().multiplyScalar(wallLength);
                        const outlineGeo = buildMiterPrism(
                            segStart, segEnd, segStart, segEnd,
                            totalThickness / 2, wallHeight, wallBaseOffset,
                            _layOpenMN?.start ?? null, _layOpenMN?.end ?? null,
                        );
                        outlineEdges = buildWallEdgeOverlay(outlineGeo, wall.id);
                        outlineEdges.position.set(0, 0, 0);
                        outlineGeo.dispose();
                    } else {
                        const outlineGeo = new THREE.BoxGeometry(wallLength, wallHeight, totalThickness);
                        outlineEdges = buildWallEdgeOverlay(outlineGeo, wall.id);
                        const wallAngle = Math.atan2(direction.z, direction.x);
                        const centerOffset = direction.clone().multiplyScalar(wallLength / 2);
                        outlineEdges.position.set(centerOffset.x, wallHeight / 2 + wallBaseOffset, centerOffset.z);
                        outlineEdges.rotation.set(0, -wallAngle, 0);
                        outlineGeo.dispose();
                    }
                    wallGroup.add(outlineEdges);
                }

                // §WALL-AUDIT-2026-C1 (move-restore): identity is locked once at
                // the top of buildWall(); only mutable fields sync here.
                this._syncMutableWallUserData(wallGroup, wall);

                this.wallToFragmentsMap.set(wall.id, fragmentIds);
                return fragmentIds;
            }

            // ── §03-1.3 + §03-1.4: Layered wall — NO openings — miter-correct geometry ──
            // Each layer is built as a custom miter prism (not BoxGeometry) so that
            // oblique join ends are correctly cut at the miter plane angle.
            // The miter plane normals come from wall.joinAngles (stamped by WallJoinResolver).
            // For free ends (no join), the normal defaults to the wall direction → perpendicular cut.

            let cursor = -totalThickness / 2;

            // §STEP4: read directly from the joinData parameter — no cache.
            const startMN = joinData?.startMN ?? null;
            const endMN   = joinData?.endMN   ?? null;

            wall.layers.forEach((layer: any, layerIdx: number) => {
                const layerCenter = cursor + layer.thickness / 2;
                cursor += layer.thickness;

                // ── Layer offset from centerline ──
                // Compute layer centerline position (offset along outward normal)
                const direction = new THREE.Vector3().subVectors(end, start);
                direction.normalize();
                const outward = new THREE.Vector3(-direction.z, 0, direction.x);
                const lateralShift = outward.clone().multiplyScalar(layerCenter);

                // Layer centerline in world space
                const layerStartWorld = start.clone().add(lateralShift);
                const layerEndWorld = end.clone().add(lateralShift);

                // Convert to local coords relative to wallGroup root (= wall start point)
                const worldStart = new THREE.Vector3().subVectors(layerStartWorld, start);
                const worldEnd = new THREE.Vector3().subVectors(layerEndWorld, start);

                // Centerline endpoints (used for miter plane definition)
                const centerlineStart = new THREE.Vector3(0, 0, 0); // wallGroup origin IS wall start
                const centerlineEnd = new THREE.Vector3().subVectors(end, start);

                const geom = buildMiterPrism(
                    worldStart,
                    worldEnd,
                    centerlineStart,           // Miter planes at centerline
                    centerlineEnd,             // Miter planes at centerline
                    layer.thickness / 2,       // half-thickness of this layer
                    wallHeight,
                    wallBaseOffset,
                    startMN,
                    endMN,
                );

                const matColor = layer.materialColor ?? wall.materialColor ?? '#d4c5b0';
                const mat = new THREE.MeshStandardMaterial({
                    color: matColor,
                    roughness: 0.85,
                    metalness: 0.0,
                    depthWrite: true,
                    depthTest: true
                });

                const mesh = new THREE.Mesh(geom, mat);
                mesh.userData = {
                    id: wall.id,
                    wallId: wall.id,
                    parentId: wall.id,
                    elementType: 'WallLayer',
                    modelId: 'model-default',
                    role: 'geometry',
                    selectable: false,
                    layerIndex: layerIdx,
                    layerName: layer.name,
                    layerFunction: layer.function
                };

                // Geometry is in LOCAL coordinates relative to wallGroup (= wall start point).
                // No additional position/rotation needed — the prism builder already uses
                // worldStart=(0,0,0) relative to the group origin.
                wallGroup.add(mesh);

                // Edge overlay — mirrors SlabFragmentBuilder pattern (role:'edges' enables
                // future Visibility Graphics toggling without touching geometry logic).
                const layerEdges = buildWallEdgeOverlay(geom, wall.id);
                wallGroup.add(layerEdges);

                const fragmentId = crypto.randomUUID();
                const fragment: WallFragment = {
                    id: fragmentId,
                    wallId: wall.id,
                    mesh: mesh as any,
                    type: 'wall-body',
                    parentId: wall.id,
                    levelId: wall.levelId
                };
                this.fragments.set(fragmentId, fragment);
                this.fragmentToEntityMap.set(fragmentId, {
                    fragmentId,
                    elementId: wall.id,
                    type: 'wall',
                    entityType: 'wall',
                    entityId: wall.id
                });
                fragmentIds.push(fragmentId);
            });

            this.wallToFragmentsMap.set(wall.id, fragmentIds);
            return fragmentIds;
        }
        // ─────────────────────────────────────────────────────────────────────────

                // ─── CONTRACT §03-1.2: CURVED WALL BRANCH ────────────────────────────────
        // Curved walls are tessellated into N BoxGeometry segments positioned in
        // world-space directly (not relative to root, because each segment has its
        // own direction).  Openings are deferred — curved walls enforce openings:[]
        // at creation time (see CreateWallCommand.canExecute).
        //
        // Builder contract §4.3: builder reads WallData as Readonly — never mutates.
        // ─────────────────────────────────────────────────────────────────────────
        if (wall.curve && (!wall.layers || wall.layers.length === 0)) {
            // ── Single-layer curved wall (no layer support) ──
            // Build traditional curved wall geometry
            // ─── CONTRACT §03-1.2: Curved wall — hard-edge quad-strip geometry ────────
            //
            // We build a single BufferGeometry with EXPLICIT per-face normals so that:
            //   1. Top and bottom faces meet the curved faces at a hard 90° edge
            //      (no computeVertexNormals() which would soften the edge)
            //   2. Start and end caps are correctly wound and present
            //   3. Outer and inner curved faces have smooth per-station normals
            //
            // Each "station" i along the arc contributes 4 centerline-aligned vertices.
            // We build each face group as independent triangles with face normals,
            // NOT as an indexed strip, so shared edges between face groups never
            // average across each other.
            //
            // Face groups: outer, inner, top, bottom, start cap, end cap.
            // ─────────────────────────────────────────────────────────────────────────
            const ctrl = new THREE.Vector3(
                wall.curve.control.x,
                wall.curve.control.y,
                wall.curve.control.z
            );

            const pts = PathResolver.toPolyline(
                { kind: 'Arc', start, end, control: ctrl },
                wall.curve.segments
            );

            const n = pts.length;
            const halfT  = wallThickness / 2;
            const yBot   = wallBaseOffset;
            const yTop   = wallBaseOffset + wallHeight;

            // ── per-station geometry data ──────────────────────────────────────────
            // For each station i we store: outward normal (nx, nz) and XZ center
            type Station = { cx: number; cz: number; nx: number; nz: number };
            const stations: Station[] = [];

            for (let i = 0; i < n; i++) {
                let tx: number, tz: number;
                if (i < n - 1) {
                    tx = pts[i + 1].x - pts[i].x;
                    tz = pts[i + 1].z - pts[i].z;
                } else {
                    tx = pts[i].x - pts[i - 1].x;
                    tz = pts[i].z - pts[i - 1].z;
                }
                const tLen = Math.sqrt(tx * tx + tz * tz) || 1;
                tx /= tLen; tz /= tLen;

                stations.push({
                    cx: pts[i].x - start.x,
                    cz: pts[i].z - start.z,
                    nx: -tz,   // outward normal = rotate tangent 90° CCW
                    nz:  tx,
                });
            }

            // ── helpers ───────────────────────────────────────────────────────────
            // A vertex = [x, y, z, nx, ny, nz]
            type V6 = [number, number, number, number, number, number];
            const pos: number[] = [];
            const nrm: number[] = [];

            function pushTri(a: V6, b: V6, c: V6): void {
                pos.push(a[0], a[1], a[2],  b[0], b[1], b[2],  c[0], c[1], c[2]);
                nrm.push(a[3], a[4], a[5],  b[3], b[4], b[5],  c[3], c[4], c[5]);
            }

            function outerVBot(s: Station): V6 { return [s.cx + s.nx * halfT, yBot, s.cz + s.nz * halfT,  s.nx, 0, s.nz]; }
            function outerVTop(s: Station): V6 { return [s.cx + s.nx * halfT, yTop, s.cz + s.nz * halfT,  s.nx, 0, s.nz]; }
            function innerVBot(s: Station): V6 { return [s.cx - s.nx * halfT, yBot, s.cz - s.nz * halfT, -s.nx, 0, -s.nz]; }
            function innerVTop(s: Station): V6 { return [s.cx - s.nx * halfT, yTop, s.cz - s.nz * halfT, -s.nx, 0, -s.nz]; }

            // Top face normal = (0,1,0), bottom = (0,-1,0)
            function topOuter(s: Station): V6 { return [s.cx + s.nx * halfT, yTop, s.cz + s.nz * halfT, 0, 1, 0]; }
            function topInner(s: Station): V6 { return [s.cx - s.nx * halfT, yTop, s.cz - s.nz * halfT, 0, 1, 0]; }
            function botOuter(s: Station): V6 { return [s.cx + s.nx * halfT, yBot, s.cz + s.nz * halfT, 0, -1, 0]; }
            function botInner(s: Station): V6 { return [s.cx - s.nx * halfT, yBot, s.cz - s.nz * halfT, 0, -1, 0]; }

            // ── outer curved face ─────────────────────────────────────────────────
            for (let i = 0; i < n - 1; i++) {
                const A = stations[i], B = stations[i + 1];
                // CCW winding from outside so stored outward normals are used as-is
                // (not negated by DoubleSide back-face path which caused dark rendering)
                pushTri(outerVBot(A), outerVTop(B), outerVTop(A));
                pushTri(outerVBot(A), outerVBot(B), outerVTop(B));
            }

            // ── inner curved face ─────────────────────────────────────────────────
            for (let i = 0; i < n - 1; i++) {
                const A = stations[i], B = stations[i + 1];
                // CCW winding from inside so stored inward normals are used as-is
                pushTri(innerVBot(A), innerVTop(A), innerVTop(B));
                pushTri(innerVBot(A), innerVTop(B), innerVBot(B));
            }

            // ── top flat face — flat normal (0,1,0) so edges are hard ─────────────
            for (let i = 0; i < n - 1; i++) {
                const A = stations[i], B = stations[i + 1];
                pushTri(topInner(A), topOuter(A), topOuter(B));
                pushTri(topInner(A), topOuter(B), topInner(B));
            }

            // ── bottom flat face — flat normal (0,-1,0) ───────────────────────────
            for (let i = 0; i < n - 1; i++) {
                const A = stations[i], B = stations[i + 1];
                pushTri(botInner(A), botOuter(B), botOuter(A));
                pushTri(botInner(A), botInner(B), botOuter(B));
            }

            // §06-FIX / §STEP4: Read miter normals from the joinData parameter.
            // For curved walls these were previously ignored — perpendicular caps
            // were always built. Now projectCapVertex() aligns cap vertices with
            // the shared miter plane so the joint is flush with the adjoining wall.
            const curvedStartMN = joinData?.startMN ?? null;
            const curvedEndMN   = joinData?.endMN   ?? null;

            // ── start cap (i=0) ────────────────────────────────────────────────────
            // Cap normal = −tangent at station 0.
            // §06-FIX + §CURVED-STRAIGHT-FIX:
            // Use the exact quadratic-Bézier tangent at t=0: normalize(ctrl − start).
            // This is the same formula WallJoinResolver._wallDirAtJoin uses with
            // adjustedPt=sharedPt (the post-trim endpoint), so the miter normal
            // and the projection direction are computed from identical tangents,
            // eliminating the tessellation-approximation mismatch that caused
            // curved-vs-straight cap misalignment.
            {
                const s = stations[0];
                // Exact Bézier tangent at start (t=0): normalize(ctrl − start), XZ only.
                const _stDx = ctrl.x - start.x;
                const _stDz = ctrl.z - start.z;
                const _stL  = Math.sqrt(_stDx * _stDx + _stDz * _stDz) || 1;
                const tanX  = _stDx / _stL;
                const tanZ  = _stDz / _stL;
                const cnx = -tanX;  // inward normal = negative tangent
                const cnz = -tanZ;

                let oX = s.cx + s.nx * halfT, oZ = s.cz + s.nz * halfT;
                let iX = s.cx - s.nx * halfT, iZ = s.cz - s.nz * halfT;
                if (curvedStartMN) {
                    [oX, oZ] = projectCapVertex(oX, oZ, 0, 0, tanX, tanZ, curvedStartMN);
                    [iX, iZ] = projectCapVertex(iX, iZ, 0, 0, tanX, tanZ, curvedStartMN);
                }

                const oBo: V6 = [oX, yBot, oZ, cnx, 0, cnz];
                const oTo: V6 = [oX, yTop, oZ, cnx, 0, cnz];
                const iBo: V6 = [iX, yBot, iZ, cnx, 0, cnz];
                const iTo: V6 = [iX, yTop, iZ, cnx, 0, cnz];
                pushTri(oBo, oTo, iTo);
                pushTri(oBo, iTo, iBo);
            }

            // ── end cap (i=n-1) ───────────────────────────────────────────────────
            // §06-FIX + §CURVED-STRAIGHT-FIX:
            // Use the exact quadratic-Bézier tangent at t=1: normalize(end − ctrl).
            // `end` here is wall.baseLine[1] which has been set to sharedPt by
            // store.update() before buildWall() is called, matching the adjustedPt
            // passed to _wallDirAtJoin() in WallJoinResolver for perfect consistency.
            {
                const s = stations[n - 1];
                // Exact Bézier tangent at end (t=1): normalize(end − ctrl), XZ only.
                const _edDx = end.x - ctrl.x;
                const _edDz = end.z - ctrl.z;
                const _edL  = Math.sqrt(_edDx * _edDx + _edDz * _edDz) || 1;
                const tanX  = _edDx / _edL;
                const tanZ  = _edDz / _edL;
                const cnx = tanX;  // outward normal = positive tangent
                const cnz = tanZ;

                let oX = s.cx + s.nx * halfT, oZ = s.cz + s.nz * halfT;
                let iX = s.cx - s.nx * halfT, iZ = s.cz - s.nz * halfT;
                if (curvedEndMN) {
                    [oX, oZ] = projectCapVertex(oX, oZ, s.cx, s.cz, tanX, tanZ, curvedEndMN);
                    [iX, iZ] = projectCapVertex(iX, iZ, s.cx, s.cz, tanX, tanZ, curvedEndMN);
                }

                const oBo: V6 = [oX, yBot, oZ, cnx, 0, cnz];
                const oTo: V6 = [oX, yTop, oZ, cnx, 0, cnz];
                const iBo: V6 = [iX, yBot, iZ, cnx, 0, cnz];
                const iTo: V6 = [iX, yTop, iZ, cnx, 0, cnz];
                pushTri(oBo, iTo, oTo);
                pushTri(oBo, iBo, iTo);
            }

            // ── assemble geometry ─────────────────────────────────────────────────
            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
            geom.setAttribute('normal',   new THREE.Float32BufferAttribute(nrm, 3));
            // NO computeVertexNormals() — we set exact per-face normals above
            // so top/bottom hard edges are preserved at 90°

            const material = this.createWallMaterial(wall);
            // Curved walls wrap around — from some camera angles the inner face
            // is visible. DoubleSide prevents back-face culling making the wall
            // appear transparent when viewed from inside or along the arc.
            (material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
            const mesh = new THREE.Mesh(geom, material as THREE.Material);
            mesh.userData = {
                id: wall.id,
                materialId: wall.materialId,
                materialColor: wall.materialColor,
                elementType: 'WallPart',
                modelId: 'model-default',
                role: 'geometry',
                selectable: false,
                wallId: wall.id,
                parentId: wall.id
            };
            mesh.position.set(0, 0, 0);
            wallGroup.add(mesh);

            // Edge overlay for curved wall (role:'edges' tag enables future VG toggle).
            const curvedEdges = buildWallEdgeOverlay(geom, wall.id);
            wallGroup.add(curvedEdges);

            const fragmentId = crypto.randomUUID();
            this.fragments.set(fragmentId, {
                id: fragmentId,
                wallId: wall.id,
                mesh: mesh as any,
                type: 'wall-body',
                parentId: wall.id,
                levelId: wall.levelId
            });
            this.fragmentToEntityMap.set(fragmentId, {
                fragmentId,
                elementId: wall.id,
                type: 'wall',
                entityType: 'wall',
                entityId: wall.id
            });
            fragmentIds.push(fragmentId);

            this.wallToFragmentsMap.set(wall.id, fragmentIds);
            return fragmentIds;
        }

        // ── LAYERED CURVED WALLS ──────────────────────────────────────────────────
        // CONTRACT §03-1.2 + §03-1.3: Curved walls with layers
        // Each layer is built independently with its centerline offset from the wall baseline.
        if (wall.curve && wall.layers && wall.layers.length > 0) {
            const ctrl = new THREE.Vector3(
                wall.curve.control.x,
                wall.curve.control.y,
                wall.curve.control.z
            );

            // Pre-compute stations (centerline + outward normal) for all layers
            const stations = computeStations(start, end, ctrl, wall.curve.segments);

            // §06-FIX / §STEP4: Read miter normals from joinData parameter.
            const layeredCurvedStartMN = joinData?.startMN ?? null;
            const layeredCurvedEndMN   = joinData?.endMN   ?? null;

            // §CURVED-STRAIGHT-FIX: Compute exact Bézier tangents at the arc
            // endpoints (XZ only) so cap projection uses the same direction as
            // WallJoinResolver._wallDirAtJoin (which also uses this formula with
            // adjustedPt=sharedPt).  Pass as optional overrides to the layer builder.
            const _lstDx = ctrl.x - start.x;
            const _lstDz = ctrl.z - start.z;
            const _lstL  = Math.sqrt(_lstDx * _lstDx + _lstDz * _lstDz) || 1;
            const _layeredStartCapTan = { x: _lstDx / _lstL, z: _lstDz / _lstL };

            const _ledDx = end.x - ctrl.x;
            const _ledDz = end.z - ctrl.z;
            const _ledL  = Math.sqrt(_ledDx * _ledDx + _ledDz * _ledDz) || 1;
            const _layeredEndCapTan = { x: _ledDx / _ledL, z: _ledDz / _ledL };

            const totalThickness = wall.layers.reduce((s: number, l: any) => s + l.thickness, 0);
            let cursor = -totalThickness / 2;

            wall.layers.forEach((layer: any, layerIdx: number) => {
                const layerCenter = cursor + layer.thickness / 2;
                cursor += layer.thickness;

                const halfT = layer.thickness / 2;
                const geom = buildCurvedLayerGeometry(
                    layer,
                    layerCenter,
                    stations,
                    wallHeight,
                    wallBaseOffset,
                    halfT,
                    layeredCurvedStartMN,
                    layeredCurvedEndMN,
                    _layeredStartCapTan,
                    _layeredEndCapTan
                );

                const matColor = layer.materialColor ?? wall.materialColor ?? '#d4c5b0';
                const mat = new THREE.MeshStandardMaterial({
                    color: matColor,
                    roughness: 0.85,
                    metalness: 0.0,
                    depthWrite: true,
                    depthTest: true,
                    side: THREE.DoubleSide,
                });

                const mesh = new THREE.Mesh(geom, mat);
                mesh.userData = {
                    id: wall.id,
                    wallId: wall.id,
                    parentId: wall.id,
                    elementType: 'WallLayer',
                    modelId: 'model-default',
                    role: 'geometry',
                    selectable: false,
                    layerIndex: layerIdx,
                    layerName: layer.name,
                    layerFunction: layer.function
                };

                wallGroup.add(mesh);

                // Edge overlay for each curved layer (role:'edges' tag for future VG toggle).
                const curvedLayerEdges = buildWallEdgeOverlay(geom, wall.id);
                wallGroup.add(curvedLayerEdges);

                const fragmentId = crypto.randomUUID();
                const fragment: WallFragment = {
                    id: fragmentId,
                    wallId: wall.id,
                    mesh: mesh as any,
                    type: 'wall-body',
                    parentId: wall.id,
                    levelId: wall.levelId
                };
                this.fragments.set(fragmentId, fragment);
                this.fragmentToEntityMap.set(fragmentId, {
                    fragmentId,
                    elementId: wall.id,
                    type: 'wall',
                    entityType: 'wall',
                    entityId: wall.id
                });
                fragmentIds.push(fragmentId);
            });

            this.wallToFragmentsMap.set(wall.id, fragmentIds);
            return fragmentIds;
        }
        // ─────────────────────────────────────────────────────────────────────────

        if (wall.openings.length === 0) {
            const bodyFragment = this.createWallBodyFragment(wall, joinData);
            this.fragments.set(bodyFragment.id, bodyFragment);
            this.fragmentToEntityMap.set(bodyFragment.id, {
                fragmentId: bodyFragment.id,
                elementId: wall.id,
                type: 'wall',
                entityType: 'wall',
                entityId: wall.id
            });

            // Miter prism geometry is already in local space relative to wallGroup origin.
            // No additional position/rotation transform needed.
            bodyFragment.mesh.position.set(0, 0, 0);
            bodyFragment.mesh.rotation.set(0, 0, 0);

            wallGroup.add(bodyFragment.mesh);

            // Edge overlay for plain wall body (role:'edges' tag for future VG toggle).
            const plainEdges = buildWallEdgeOverlay(
                (bodyFragment.mesh as THREE.Mesh).geometry,
                wall.id
            );
            wallGroup.add(plainEdges);

            fragmentIds.push(bodyFragment.id);
        } else {
            // 1. Sort openings by offset to ensure sequential segment processing
            const sortedOpenings = [...wall.openings].sort((a, b) => a.offset - b.offset);

            // Robust span clustering based on horizontal overlap
            type SpanCluster = {
                minLeft: number;
                maxRight: number;
                openings: Opening[];
            };

            const clusters: SpanCluster[] = [];

            for (const op of sortedOpenings) {
                const left = op.offset - op.width / 2;
                const right = op.offset + op.width / 2;

                let merged = false;

                for (const cluster of clusters) {
                    // Check overlap with small epsilon for floating point tolerance
                    if (right >= cluster.minLeft - 0.001 && left <= cluster.maxRight + 0.001) {
                        cluster.minLeft = Math.min(cluster.minLeft, left);
                        cluster.maxRight = Math.max(cluster.maxRight, right);
                        cluster.openings.push(op);
                        merged = true;
                        break;
                    }
                }

                if (!merged) {
                    clusters.push({
                        minLeft: left,
                        maxRight: right,
                        openings: [op]
                    });
                }
            }

            // Sort clusters by their left edge for processing
            const sortedClusters = clusters.sort((a, b) => a.minLeft - b.minLeft);

            let currentOffset = 0;
            const material = this.createWallMaterial(wall);

            // §STEP4: Read miter normals from joinData parameter — no cache.
            // First/last wall-body segments preserve join geometry; interior segments
            // remain plain BoxGeometry.
            const openingStartMN = joinData?.startMN ?? null;
            const openingEndMN   = joinData?.endMN   ?? null;

            for (const cluster of sortedClusters) {
                const openingsAtOffset = cluster.openings;
                const minLeft = cluster.minLeft;
                const maxRight = cluster.maxRight;

                // 1. Segment before opening cluster (if any)
                const segmentLength = minLeft - currentOffset;

                if (segmentLength > 0.01) {
                    // First segment (starts at wall origin, currentOffset===0) gets startMN applied
                    // so miter join geometry is preserved when openings are on a joined wall.
                    if (currentOffset === 0 && openingStartMN) {
                        const segStart = new THREE.Vector3(0, 0, 0);
                        const segEnd   = direction.clone().multiplyScalar(minLeft);
                        const geo = buildMiterPrism(
                            segStart, segEnd, segStart, segEnd,
                            wallThickness / 2, wallHeight, wallBaseOffset,
                            openingStartMN, null,
                        );
                        const mesh = new THREE.Mesh(geo, material.clone());
                        mesh.userData = {
                            materialId: wall.materialId,
                            materialColor: wall.materialColor,
                            elementType: 'WallPart',
                            modelId: 'model-default',
                            role: 'geometry',
                            selectable: false
                        };
                        mesh.position.set(0, 0, 0);
                        wallGroup!.add(mesh);
                    } else {
                        const segmentGeo = new THREE.BoxGeometry(segmentLength, wallHeight, wallThickness);
                        const segmentMesh = new THREE.Mesh(segmentGeo, material.clone());
                        segmentMesh.userData = {
                            materialId: wall.materialId,
                            materialColor: wall.materialColor,
                            elementType: 'WallPart',
                            modelId: 'model-default',
                            role: 'geometry',
                            selectable: false
                        };
                        const segmentPosX = currentOffset + segmentLength / 2;
                        positionLocal(segmentMesh, segmentPosX, wallHeight / 2 + wallBaseOffset);
                        wallGroup!.add(segmentMesh);
                    }
                }

                // 2. Segments around openings in this cluster
                // Sort by sillHeight to process from bottom to top
                const verticalSorted = [...openingsAtOffset].sort((a, b) => (a.sillHeight || 0) - (b.sillHeight || 0));

                let currentY = 0;
                for (const op of verticalSorted) {
                    const sillHeight = op.sillHeight ?? 0;
                    const gapBelow = sillHeight - currentY;

                    if (gapBelow > 0.01) {
                        const gapGeo = new THREE.BoxGeometry(op.width, gapBelow, wallThickness);
                        const gapMesh = new THREE.Mesh(gapGeo, material.clone());
                        gapMesh.userData = {
                            materialId: wall.materialId,
                            materialColor: wall.materialColor,
                            elementType: 'WallPart',
                            modelId: 'model-default',
                            role: 'geometry',
                            selectable: false
                        };
                        positionLocal(gapMesh, op.offset, currentY + gapBelow / 2 + wallBaseOffset);
                        wallGroup!.add(gapMesh);
                    }

                    // Create Frame
                    // §4.3 FIX: render data resolved externally and passed in via renderMap.
                    if (op.elementId) {
                        const existing = wallGroup!.children.find(c => c.userData?.id === op.elementId);
                        if (existing) wallGroup!.remove(existing);

                        const opRenderData = renderMap?.get(op.elementId);
                        const frame = op.type === 'door' 
                            ? this.createDoorFrame(wall, op, opRenderData)
                            : this.createWindowFrame(wall, op, opRenderData);

                        if (frame.children.length > 0 || Object.keys(frame.userData).length > 0) {
                            wallGroup!.add(frame);
                            const fragId = crypto.randomUUID();
                            this.fragments.set(fragId, {
                                id: fragId,
                                wallId: wall.id,
                                mesh: frame as any,
                                type: 'opening',
                                parentId: wall.id,
                                levelId: wall.levelId
                            });
                            fragmentIds.push(fragId);
                        }
                    }
                    currentY = sillHeight + op.height;
                }

                // Header above the topmost opening in this cluster
                const clusterWidth = maxRight - minLeft;
                const finalHeaderHeight = wallHeight - currentY;
                if (finalHeaderHeight > 0.01) {
                    const headerGeo = new THREE.BoxGeometry(clusterWidth, finalHeaderHeight, wallThickness);
                    const headerMesh = new THREE.Mesh(headerGeo, material.clone());
                    headerMesh.userData = {
                        materialId: wall.materialId,
                        materialColor: wall.materialColor,
                        elementType: 'WallPart',
                        modelId: 'model-default',
                        role: 'geometry',
                        selectable: false
                    };
                    // Position header at the center of the cluster
                    const headerCenterX = (minLeft + maxRight) / 2;
                    positionLocal(headerMesh, headerCenterX, currentY + finalHeaderHeight / 2 + wallBaseOffset);
                    wallGroup!.add(headerMesh);
                }

                // Update currentOffset to the rightmost edge of the cluster
                currentOffset = maxRight;
            }

            // 3. Final segment after last opening (with floating-point safety)
            const finalSegmentLength = wallLength - currentOffset;
            if (finalSegmentLength > 0.01) {
                // Last segment ends at the wall endpoint — apply endMN if wall has a join there.
                if (openingEndMN) {
                    const segStart      = direction.clone().multiplyScalar(currentOffset);
                    const segEnd        = direction.clone().multiplyScalar(wallLength);
                    const clEnd         = direction.clone().multiplyScalar(wallLength);
                    const geo = buildMiterPrism(
                        segStart, segEnd, segStart, clEnd,
                        wallThickness / 2, wallHeight, wallBaseOffset,
                        null, openingEndMN,
                    );
                    const finalMesh = new THREE.Mesh(geo, material.clone());
                    finalMesh.userData = {
                        materialId: wall.materialId,
                        materialColor: wall.materialColor,
                        elementType: 'WallPart',
                        modelId: 'model-default',
                        role: 'geometry',
                        selectable: false
                    };
                    finalMesh.position.set(0, 0, 0);
                    wallGroup.add(finalMesh);
                } else {
                    const finalGeo = new THREE.BoxGeometry(finalSegmentLength, wallHeight, wallThickness);
                    const finalMesh = new THREE.Mesh(finalGeo, material.clone());
                    finalMesh.userData = {
                        materialId: wall.materialId,
                        materialColor: wall.materialColor,
                        elementType: 'WallPart',
                        modelId: 'model-default',
                        role: 'geometry',
                        selectable: false
                    };
                    const finalPosX = currentOffset + finalSegmentLength / 2;
                    positionLocal(finalMesh, finalPosX, wallHeight / 2 + wallBaseOffset);
                    wallGroup.add(finalMesh);
                }
            }

            // §OPENING-EDGE-FIX: Single outer-profile edge overlay for the whole wall.
            // When miter normals are present (wall is part of a join) we use buildMiterPrism
            // geometry so the angled join edge lines are preserved on the overlay.
            // Otherwise fall back to a simple BoxGeometry (no join, perpendicular ends).
            {
                let outlineEdges: THREE.Object3D;
                if (openingStartMN || openingEndMN) {
                    const segStart = new THREE.Vector3(0, 0, 0);
                    const segEnd   = direction.clone().multiplyScalar(wallLength);
                    const outlineGeo = buildMiterPrism(
                        segStart, segEnd, segStart, segEnd,
                        wallThickness / 2, wallHeight, wallBaseOffset,
                        openingStartMN, openingEndMN,
                    );
                    outlineEdges = buildWallEdgeOverlay(outlineGeo, wall.id);
                    outlineEdges.position.set(0, 0, 0);
                    outlineGeo.dispose();
                } else {
                    const outlineGeo = new THREE.BoxGeometry(wallLength, wallHeight, wallThickness);
                    outlineEdges = buildWallEdgeOverlay(outlineGeo, wall.id);
                    const wallAngle = Math.atan2(direction.z, direction.x);
                    const centerOffset = direction.clone().multiplyScalar(wallLength / 2);
                    outlineEdges.position.set(centerOffset.x, wallHeight / 2 + wallBaseOffset, centerOffset.z);
                    outlineEdges.rotation.set(0, -wallAngle, 0);
                    outlineGeo.dispose();
                }
                wallGroup.add(outlineEdges);
            }

            // §WALL-PLAIN-HOLE-EXTRUDE (2026-06-08): a plain straight wall with
            // openings now renders as ONE continuous profile-extrude body with a
            // rectangular hole per opening — no internal segment boundaries, so no
            // vertical seam beside the hole and no horizontal break below/above it
            // (the recurring founder live-test defect). The before/sill/header/after
            // box segments built above were abutting-but-separate quads: their shared
            // edges are T-junctions (the full-height face has no vertex at the sill /
            // head line), which shade as visible division lines even after
            // mergeGeometries + toCreasedNormals. A single Shape-with-holes ExtrudeGeometry
            // has continuous front/back faces and continuous reveal (jamb/sill/lintel)
            // faces by construction. Only applies when the wall has NO miter join at
            // either end (the apartment generator's plain-partition production case);
            // a mitered end needs the angled end-cut the box/miter-prism path provides,
            // so that case keeps the segments + the legacy seam-merge fallback. Safe:
            // on any failure it leaves the original separate segments (merged) intact.
            const _hasMiterEnd = !!(openingStartMN || openingEndMN);
            const _extrudeBodyOk =
                !_hasMiterEnd &&
                this._rebuildPlainWallBodyAsHoleExtrude(
                    wallGroup, wall, sortedClusters, wallLength, wallHeight, wallThickness, wallBaseOffset,
                    Math.atan2(direction.z, direction.x),
                );
            if (!_extrudeBodyOk) {
                // Mitered wall, or the extrude failed — collapse the abutting box
                // segments into ONE creased-normal mesh as the fallback (still removes
                // most of the coplanar division-line shading; §WALL-PLAIN-SEAM-MERGE #96).
                this._mergeWallBodySegments(wallGroup, wall);
            }

            // §WALL-AUDIT-2026-C1 (move-restore): identity is locked once at the
            // top of buildWall(); only mutable fields sync here.
            this._syncMutableWallUserData(wallGroup, wall);
        }

        // §WALL-SINGLE-VOLUME-CSG (#96 ph3) — async upgrade to ONE boolean-void
        // solid (no division-line seams). The segmented wall built above is the
        // immediate render + the fallback; when a producer is injected, swap a
        // plain straight wall's body segments for the single solid. Fire-and-forget;
        // the swap self-guards against a stale/disposed/rebuilt group (version token).
        // Plain straight walls only — layered/curved keep the segmented path (SPEC §3).
        //
        // §96-OPT-IN (2026-05-24): reverted to OPT-IN (default OFF). The default-on
        // experiment (§96-DEFAULT-ON) shipped a malformed cut in production: the CSG
        // void's vertical datum does not match the door/window mesh placement (the
        // producer never receives the slab offset, and DoorBuilder/WindowBuilder place
        // the leaf at `level.elevation + sillHeight` without slab/baseOffset), leaving
        // uncut wall across the opening's lower portion. The segmented path is the
        // reliable default and remains the fallback either way. Re-enable for verified
        // testing ONLY by setting `window.__wallSingleVolume = true`. Do NOT flip the
        // default back until the datum mismatch is fixed AND visually verified with a
        // slab present (see DAILY-USE-FIX-LOG §WALL-CSG-DATUM, #96).
        if (
            typeof window !== 'undefined' &&
            (window as { __wallSingleVolume?: boolean }).__wallSingleVolume === true &&
            this._singleVolumeProducer !== null &&
            wall.openings && wall.openings.length > 0 &&
            !wall.curve && !(wall.layers && wall.layers.length > 0)
        ) {
            void this._tryUpgradeWallToSingleVolume(wallGroup, wall, {
                length: wallLength,
                thickness: wallThickness,
                height: wallHeight,
                baseOffset: wallBaseOffset,
                angle: Math.atan2(direction.z, direction.x),
                // §96-STALE-GUARD: capture this build's generation token; the async
                // swap aborts if a newer buildWall() restamps userData.version while
                // we await the (lazy-WASM) boolean — the wallGroup is REUSED across
                // rebuilds (wallRoots.get), so parent!==null alone is insufficient.
                version: this._geometrySeq,
            });
        }

        this.wallToFragmentsMap.set(wall.id, fragmentIds);
        return fragmentIds;
    }

    /**
     * §WALL-SINGLE-VOLUME-CSG (#96 ph3) — replace a plain straight wall's abutting
     * body segments with a single boolean-void solid produced by the injected
     * kernel CSG producer. Async (manifold-3d is lazy WASM). On any failure or a
     * stale group, the segmented mesh is left untouched (never an empty wall).
     */
    private async _tryUpgradeWallToSingleVolume(
        wallGroup: THREE.Group,
        wall: WallData,
        ctx: { length: number; thickness: number; height: number; baseOffset: number; angle: number; version: number },
    ): Promise<void> {
        const producer = this._singleVolumeProducer;
        if (!producer) return;
        try {
            const descriptor = await producer({
                length: ctx.length,
                thickness: ctx.thickness,
                height: ctx.height,
                baseOffset: ctx.baseOffset,
                openings: (wall.openings ?? []).map((o) => ({
                    offset: o.offset,
                    width: o.width,
                    sillHeight: o.sillHeight ?? 0,
                    height: o.height,
                })),
            });
            // §96-STALE-GUARD: the wall may have been rebuilt/disposed while we awaited
            // the lazy-WASM boolean. The wallGroup is REUSED across rebuilds, so a
            // detached check is not enough — also verify the generation token still
            // matches this build. A newer buildWall() bumps userData.version, and its
            // own upgrade will run; applying THIS stale result would clobber it.
            const liveVersion = (wallGroup.userData as { version?: number }).version;
            if (!descriptor || wallGroup.parent === null || liveVersion !== ctx.version) return;
            const geo = descriptorToBufferGeometry(descriptor);
            if (!geo) return;

            // Remove the abutting wall-body segments (keep door/window frames, edge
            // overlays, etc.) AND any prior single-volume CSG mesh (defensive — the
            // version guard already prevents a double-apply, but never leave two
            // bodies). Body segments are tagged elementType 'WallPart'.
            const toRemove: THREE.Object3D[] = [];
            for (const child of wallGroup.children) {
                const ud = (child as THREE.Object3D & { userData?: { elementType?: string } }).userData;
                if (ud?.elementType === 'WallPart') toRemove.push(child);
            }
            for (const m of toRemove) {
                wallGroup.remove(m);
                const mesh = m as THREE.Mesh;
                mesh.geometry?.dispose?.();
            }

            // Add the single solid. Descriptor is in wall-local frame (x along the
            // wall); rotate by -angle so local-x maps to the wall direction (matches
            // the per-segment positionLocal convention), origin at the group (start).
            const csgMesh = new THREE.Mesh(geo, this.createWallMaterial(wall));
            csgMesh.rotation.y = -ctx.angle;
            csgMesh.position.set(0, 0, 0);
            csgMesh.userData = {
                materialId: wall.materialId,
                materialColor: wall.materialColor,
                elementType: 'WallPart',
                modelId: 'model-default',
                role: 'geometry',
                selectable: false,
                singleVolume: true,
            };
            wallGroup.add(csgMesh);

            // Register as one wall-body fragment so selection/picking resolve it.
            const fragmentId = crypto.randomUUID();
            this.fragments.set(fragmentId, {
                id: fragmentId,
                wallId: wall.id,
                mesh: csgMesh as unknown as THREE.Mesh,
                type: 'wall-body',
                parentId: wall.id,
                levelId: wall.levelId,
            } as WallFragment);
            this.fragmentToEntityMap.set(fragmentId, {
                fragmentId,
                elementId: wall.id,
                type: 'wall',
                entityType: 'wall',
                entityId: wall.id,
            });
            const existing = this.wallToFragmentsMap.get(wall.id) ?? [];
            this.wallToFragmentsMap.set(wall.id, [...existing, fragmentId]);
        } catch (err) {
            // CSG failed — keep the segmented mesh (SPEC §4: never an empty wall).
            console.warn(
                '[WallFragmentBuilder] §WALL-SINGLE-VOLUME-CSG upgrade failed, keeping segments:',
                (err as Error)?.message ?? err,
            );
        }
    }

    /**
     * §WALL-PLAIN-SEAM-MERGE (#96, 2026-05-24) — collapse a plain straight wall's
     * abutting body box segments (each tagged elementType:'WallPart') into ONE mesh
     * with creased normals. The segmented path emits before/sill/lintel/header/after
     * as separate coplanar boxes; under SSGI their shared boundaries shade as faint
     * "division lines" beside openings (the default-wall analog of the layered-wall
     * grid seams fixed by greedy-merge + toCreasedNormals). Merging into one surface
     * removes the internal boundaries; toCreasedNormals(30°) keeps the real opening
     * reveals sharp while smoothing the now-coplanar joins.
     *
     * SAFE BY CONSTRUCTION: any failure (attribute mismatch with miter-prism join
     * segments, null merge result, etc.) is caught and the original separate
     * segments are left in place — never an empty wall. Selection/visibility are
     * unaffected (the merged mesh carries the same WallPart userData; openings'
     * door/window frames and the edge overlay are not touched).
     */
    private _mergeWallBodySegments(wallGroup: THREE.Group, wall: WallData): void {
        try {
            const parts: THREE.Mesh[] = [];
            for (const child of wallGroup.children) {
                const m = child as THREE.Mesh;
                if (m.isMesh && (m.userData as { elementType?: string })?.elementType === 'WallPart') {
                    parts.push(m);
                }
            }
            // Single segment → no internal boundary to merge; leave as-is.
            if (parts.length < 2) return;

            // §68.10 DIAG — a mitered SHELL wall that hosts openings has its first/last
            // body segment built by buildMiterPrism (position+normal, NO index/uv) while
            // the around-opening segments are BoxGeometry (position+normal+uv+index). A
            // miter-prism part is the corner cut; detect its PRESENCE before the merge so
            // the per-wall log can confirm the corner miter is carried INTO the merged
            // body (cornerMiterKept) — the §68.10 "ground-shell corners not joined" check.
            // Heuristic: a prism part is non-indexed AND has no `uv` (box parts have both).
            let _cornerMiterParts = 0;
            for (const m of parts) {
                const g = m.geometry;
                if (!g.index && !g.getAttribute('uv')) _cornerMiterParts++;
            }
            const _openingVoids = (wall.openings ?? []).length;

            const geos: THREE.BufferGeometry[] = [];
            for (const m of parts) {
                m.updateMatrix();
                const g = m.geometry.clone();
                g.applyMatrix4(m.matrix);          // bake position/rotation into the verts
                // Only convert when indexed — toNonIndexed() on an already-non-indexed
                // geometry logs a warning and returns the SAME object (which would then
                // be double-disposed below). Guard both.
                const ni = g.index ? g.toNonIndexed() : g;
                if (ni !== g) g.dispose();         // free the indexed temp clone
                geos.push(ni);
            }

            // §WALL-PLAIN-SEAM-MERGE-ATTR (2026-06-11) — REGRESSION FIX (§57.6).
            // mergeGeometries() REQUIRES every geometry to share the same attribute
            // set. Plain BoxGeometry segments carry a `uv` attribute; miter-prism join
            // segments (MiterPrismBuilder emits only position + normal) do NOT. The
            // PREVIOUS guard (§WALL-PLAIN-SEAM-MERGE-GUARD, 2026-05-24) merely DETECTED
            // the mismatch and SKIPPED the merge — which left an interior partition wall
            // (mitered/T-joined onto the shell, hence a miter-prism first segment) that
            // ALSO carries a door/window opening (the surrounding box segments) rendered
            // as SEPARATE fragments: the founder's "walls fragment when openings are
            // placed" defect. The hole-extrude single-body path only covers NON-mitered
            // walls, so the mitered+opening case depends ENTIRELY on this merge.
            //
            // Fix: instead of bailing, NORMALISE the segments to the common minimal
            // attribute set (position + normal) by dropping `uv` from the segments that
            // carry it. The wall body is schematic/PBR-shaded by world position, not by
            // a uv map, so discarding the box uv is visually a no-op — and now the
            // mitered partition + its opening box segments merge into ONE creased mesh
            // (no internal seam, no fragmentation). Only `position`+`normal` are kept,
            // which both geometry sources always provide.
            for (const g of geos) {
                for (const name of Object.keys(g.attributes)) {
                    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
                }
            }
            const sig = (g: THREE.BufferGeometry): string => Object.keys(g.attributes).sort().join(',');
            const first = geos[0];
            if (!first || !geos.every((g) => sig(g) === sig(first))) {
                // Should not happen now (all reduced to position+normal); kept as the
                // never-an-empty-wall safety net (SPEC §4) for any exotic attribute set.
                geos.forEach((g) => g.dispose());
                return;
            }

            const merged = mergeGeometries(geos, false);
            geos.forEach((g) => g.dispose());
            if (!merged) return;

            const creased = toCreasedNormals(merged, THREE.MathUtils.degToRad(30));
            merged.dispose();

            const mesh = new THREE.Mesh(creased, this.createWallMaterial(wall));
            mesh.position.set(0, 0, 0);
            mesh.userData = {
                materialId: wall.materialId,
                materialColor: wall.materialColor,
                elementType: 'WallPart',
                modelId: 'model-default',
                role: 'geometry',
                selectable: false,
                mergedBody: true,
            };

            for (const m of parts) {
                wallGroup.remove(m);
                m.geometry.dispose();
            }
            wallGroup.add(mesh);

            // §68.10 DIAG — confirm the merged body carried the corner miter prism(s)
            // in AND still surrounds (does not fill) the opening voids. The around-
            // opening box segments are built with a GAP at each opening (the void), so
            // openingVoidsCut === wall.openings.length whenever the merge produced a
            // body (the gaps are preserved by construction — the merge only welds
            // co-located verts, it never fills the hole). cornerMiterKept is true when a
            // prism part (the corner cut) was among the merged segments. This is the
            // per-shell-wall signal the §68.10 task asked for.
            if (typeof window !== 'undefined' && (window as { __pryzmDebugWalls?: boolean }).__pryzmDebugWalls) {
                console.log(
                    `[WallFragmentBuilder] §68.10 §SEAM-MERGE wall=${wall.id} ` +
                    `partsMerged=${parts.length} openingVoidsCut=${_openingVoids} ` +
                    `cornerMiterKept=${_cornerMiterParts > 0} (miterParts=${_cornerMiterParts})`,
                );
            }
        } catch (err) {
            console.warn(
                '[WallFragmentBuilder] §WALL-PLAIN-SEAM-MERGE failed, keeping segments:',
                (err as Error)?.message ?? err,
            );
        }
    }

    /**
     * §WALL-PLAIN-HOLE-EXTRUDE (2026-06-08) — replace a plain straight wall's
     * abutting body box segments with ONE continuous ExtrudeGeometry: a wall-rect
     * Shape (x along the wall, y vertical) minus one rectangular hole per opening,
     * extruded through the wall thickness.
     *
     * WHY: the segmented body (before / sill / header / after boxes) abut but are
     * separate quads. The full-height before/after face has no vertex at the
     * sill/head line, so the shared edge is a T-junction — it shades as a visible
     * vertical seam beside the hole and a horizontal break below/above it, even
     * after mergeGeometries + toCreasedNormals (those weld co-located vertices and
     * recompute normals but cannot heal a T-junction). A Shape-with-holes extrude
     * has ONE continuous front face, ONE continuous back face, and continuous
     * reveal (jamb/sill/lintel) faces around each hole — seamless by construction,
     * no CSG/WASM needed (P2-safe: THREE only, this file is renderer-side already).
     *
     * Local frame matches the box-segment convention this method replaces:
     *   x ∈ [0, length], y ∈ [baseOffset, baseOffset + height], z centred on 0
     *   (BoxGeometry is z-centred; ExtrudeGeometry runs 0→depth so we translate
     *   z by −thickness/2). The wallGroup is rotated −angle by the caller, so
     *   local-x maps to the wall direction exactly as the segments did.
     *
     * Returns true when the single body was built (box segments removed, single
     * body added); false to signal the caller to keep the segmented + merge
     * fallback (mitered ends, overlapping/clustered holes, degenerate hole, or any
     * THREE error). NEVER leaves an empty wall — on false the segments are intact.
     */
    private _rebuildPlainWallBodyAsHoleExtrude(
        wallGroup: THREE.Group,
        wall: WallData,
        clusters: ReadonlyArray<{ minLeft: number; maxRight: number; openings: Opening[] }>,
        length: number,
        height: number,
        thickness: number,
        baseOffset: number,
        angle: number,
    ): boolean {
        try {
            if (!(length > 0 && height > 0 && thickness > 0)) return false;

            // Flatten the cluster openings and build ONE continuous body geometry
            // (wall rectangle minus a hole per opening) via the pure helper. The
            // helper returns null when the openings are not cleanly extrude-able
            // (degenerate / edge-touching / overlapping) — in which case we keep
            // the segmented + merge fallback. NOTE: do NOT computeVertexNormals on
            // the result — ExtrudeGeometry already emits per-face normals that keep
            // the front/back caps crisp against the 90° reveal (jamb/sill/lintel)
            // faces; re-averaging would round those corners.
            const _openingRects = clusters.flatMap((c) =>
                c.openings.map((op) => ({
                    offset: op.offset,
                    width: op.width,
                    height: op.height,
                    sillHeight: op.sillHeight ?? 0,
                })),
            );
            const geo = buildWallHoleBodyGeometry({
                length, height, thickness, baseOffset, openings: _openingRects,
            });
            if (!geo) return false;

            const mesh = new THREE.Mesh(geo, this.createWallMaterial(wall));
            // The extrude body is built in an axis-aligned frame (local-x = wall
            // length axis). Rotate by −angle about the group origin (= wall start)
            // so local-x maps to the wall direction — identical to the −angle the
            // box segments applied via positionLocal().
            mesh.position.set(0, 0, 0);
            mesh.rotation.set(0, -angle, 0);
            mesh.userData = {
                materialId: wall.materialId,
                materialColor: wall.materialColor,
                elementType: 'WallPart',
                modelId: 'model-default',
                role: 'geometry',
                selectable: false,
                holeExtrudeBody: true,
            };

            // Remove the abutting box segments this body replaces (keep frames,
            // edge overlay, etc.). Only WallPart meshes are body segments.
            const parts: THREE.Mesh[] = [];
            for (const child of wallGroup.children) {
                const m = child as THREE.Mesh;
                if (m.isMesh && (m.userData as { elementType?: string })?.elementType === 'WallPart') {
                    parts.push(m);
                }
            }
            for (const m of parts) {
                wallGroup.remove(m);
                m.geometry?.dispose?.();
            }
            wallGroup.add(mesh);
            // NOTE: like the merged-segment body (`_mergeWallBodySegments`), the body
            // mesh is added to the group but NOT registered as a separate fragment —
            // the original box segments were never fragments either (only door/window
            // frames are). Selection/picking resolve via the wallGroup root
            // (elementRegistry) + child traversal, so no fragment record is needed and
            // adding one would diverge from the established plain-wall behaviour.
            return true;
        } catch (err) {
            console.warn(
                '[WallFragmentBuilder] §WALL-PLAIN-HOLE-EXTRUDE failed, keeping segments:',
                (err as Error)?.message ?? err,
            );
            return false;
        }
    }

    // §4.3 FIX: renderData is pre-resolved by the subscriber; no store access here.
    private createWindowFrame(wall: WallData, opening: Opening, renderData?: OpeningRenderData): THREE.Group {
        // When the new WindowBuilder owns this element, skip legacy frame geometry.
        // The wall void is still cut correctly — only the frame mesh is suppressed.
        if (renderData?.skipLegacyFrame) {
            return new THREE.Group();
        }

        // Validate opening dimensions at the top
        if (
            !isFinite(opening.width) ||
            !isFinite(opening.height) ||
            opening.width <= 0 ||
            opening.height <= 0
        ) {
            console.error("Invalid window opening dimensions:", opening);
            return new THREE.Group(); // Return empty group
        }

        const frameGroup = new THREE.Group();
        const frameWidth = 0.05;

        // Safe thickness calculation
        const safeThickness = isFinite(wall.thickness) ? wall.thickness : 0.2;
        const frameThickness = safeThickness + 0.02;

        // §4.3 FIX: Use pre-resolved renderData instead of querying the store.
        // frameColor and windowType are supplied by the subscriber via OpeningRenderMap.
        const frameColor = renderData?.frameColor || '#333333';
        const isDouble = opening.windowType === 'double' || renderData?.windowType === 'double';
        const material = new THREE.MeshStandardMaterial({ color: frameColor });

        // Left, Right, Top, Bottom frame members
        const members = [
            { w: frameWidth, h: opening.height, d: frameThickness, x: -opening.width / 2 + frameWidth / 2, y: 0 },
            { w: frameWidth, h: opening.height, d: frameThickness, x: opening.width / 2 - frameWidth / 2, y: 0 },
            { w: opening.width, h: frameWidth, d: frameThickness, x: 0, y: opening.height / 2 - frameWidth / 2 },
            { w: opening.width, h: frameWidth, d: frameThickness, x: 0, y: -opening.height / 2 + frameWidth / 2 }
        ];

        // Central mullion for double windows
        if (isDouble) {
            members.push({ w: frameWidth, h: opening.height, d: frameThickness, x: 0, y: 0 });
        }

        members.forEach(m => {
            const geo = new THREE.BoxGeometry(m.w, m.h, m.d);
            const mesh = new THREE.Mesh(geo, material);
            mesh.position.set(m.x, m.y, 0);
            // Tag as legacy window frame so EdgeProjectorService skips it in plan view.
            // WindowBuilder + its plan symbol builder handle plan-view representation.
            mesh.userData.role = 'legacyWindowFrame';
            frameGroup.add(mesh);
        });

        // §M-H5 (DAILY-USE 2026-05-20) — Glass colour + opacity round-trip
        // through OpeningRenderData. Falls back to the previous hard-coded
        // `#88ccff` clear-glass / 0.3 opacity defaults when the architect
        // hasn't picked a window system type that overrides them. Same
        // pattern as `frameColor` above (line 1718): renderData populated
        // by resolveOpeningRenderMap, which now reads the system type.
        const glassColorStr = renderData?.glassColor ?? '#88ccff';
        const glassOpacity  = renderData?.glassOpacity ?? 0.3;
        if (isDouble) {
            const glassWidth = (opening.width - frameWidth * 3) / 2;
            const glassGeo = new THREE.BoxGeometry(glassWidth, opening.height - frameWidth * 2, 0.02);
            const glassMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(glassColorStr),
                transparent: true,
                opacity: glassOpacity,
                side: THREE.DoubleSide,
            });

            const leftGlass = new THREE.Mesh(glassGeo, glassMat);
            leftGlass.position.set(-glassWidth / 2 - frameWidth / 2, 0, 0);
            leftGlass.userData.role = 'legacyWindowFrame';
            frameGroup.add(leftGlass);

            const rightGlass = new THREE.Mesh(glassGeo, glassMat);
            rightGlass.position.set(glassWidth / 2 + frameWidth / 2, 0, 0);
            rightGlass.userData.role = 'legacyWindowFrame';
            frameGroup.add(rightGlass);
        } else {
            const glassGeo = new THREE.BoxGeometry(opening.width - frameWidth * 2, opening.height - frameWidth * 2, 0.02);
            const glassMat = new THREE.MeshStandardMaterial({
                color: new THREE.Color(glassColorStr),
                transparent: true,
                opacity: glassOpacity,
                side: THREE.DoubleSide,
            });
            const glass = new THREE.Mesh(glassGeo, glassMat);
            glass.position.set(0, 0, 0);
            glass.userData.role = 'legacyWindowFrame';
            frameGroup.add(glass);
        }

        // Prevent division by zero
        // Phase B DTO migration: reconstruct THREE.Vector3 from Point3D at builder boundary.
        const [wStartPt, wEndPt] = wall.baseLine;
        const start = new THREE.Vector3(wStartPt.x, wStartPt.y, wStartPt.z);
        const end   = new THREE.Vector3(wEndPt.x,   wEndPt.y,   wEndPt.z);
        const baselineVec = new THREE.Vector3().subVectors(end, start);
        const wallLength = baselineVec.length();

        // Validate wall length
        if (!isFinite(wallLength) || wallLength <= 0.0001) {
            console.error("Invalid wall length for window:", wall.id);
            return new THREE.Group(); // Return empty group
        }

        const dir = baselineVec.clone().normalize();

        // Validate opening offset
        if (!isFinite(opening.offset)) {
            console.error("Invalid window offset:", opening);
            return new THREE.Group();
        }

        const t = opening.offset / wallLength;
        const sillHeight = opening.sillHeight ?? 0;
        const localY = sillHeight + opening.height / 2 + wall.baseOffset;

        const pos = dir.clone().multiplyScalar(opening.offset);
        frameGroup.position.set(pos.x, localY, pos.z);

        // Correct rotation calculation
        const angle = Math.atan2(dir.z, dir.x);
        frameGroup.rotation.y = -angle;

        // Set semantic identity ONLY on the root group
        const userData = {
            id: opening.elementId!,
            elementType: 'window',
            wallId: wall.id,
            parentId: wall.id,
            width: opening.width,
            height: opening.height,
            sillHeight: sillHeight,
            depth: frameThickness,
            frameColor: frameColor,
            windowType: isDouble ? 'double' : 'single',
            verticalPosition: sillHeight + opening.height / 2,
            baseOffset: wall.baseOffset,
            anchor: { t, offset: 0, sillHeight },
            selectable: true
        };

        if (Object.isFrozen(frameGroup.userData)) {
            frameGroup.userData = { ...userData };
        } else {
            frameGroup.userData = userData;
        }

        // Make id and elementType read-only
        Object.defineProperty(frameGroup.userData, 'id', { writable: false });
        Object.defineProperty(frameGroup.userData, 'elementType', { writable: false });

        // Children do NOT inherit semantic identity
        frameGroup.traverse(obj => {
            if (obj !== frameGroup && obj instanceof THREE.Mesh) {
                if (!obj.userData) obj.userData = {};
                if (Object.isFrozen(obj.userData)) {
                    obj.userData = { ...obj.userData };
                }
                Object.assign(obj.userData, {
                    elementType: 'window-part',
                    role: 'geometry',
                    parentId: opening.elementId!,
                    wallId: wall.id,
                    selectable: false
                });
            }
        });

        return frameGroup;
    }

    // §4.3 FIX: renderData is pre-resolved by the subscriber; no store access here.
    private createDoorFrame(wall: WallData, opening: Opening, renderData?: OpeningRenderData): THREE.Group {
        // When the new DoorBuilder owns this element, skip legacy frame geometry.
        // The wall void is still cut correctly — only the frame mesh is suppressed.
        if (renderData?.skipLegacyFrame) {
            return new THREE.Group();
        }

        // Validate opening dimensions at the top
        if (
            !isFinite(opening.width) ||
            !isFinite(opening.height) ||
            opening.width <= 0 ||
            opening.height <= 0
        ) {
            console.error("Invalid door opening dimensions:", opening);
            return new THREE.Group(); // Return empty group
        }

        const frameGroup = new THREE.Group();
        const frameWidth = 0.05;

        // Safe thickness calculation
        const safeThickness = isFinite(wall.thickness) ? wall.thickness : 0.2;
        const frameThickness = safeThickness + 0.02;

        // §4.3 FIX: Use pre-resolved renderData instead of querying the store.
        // frameColor and doorType are supplied by the subscriber via OpeningRenderMap.
        const frameColor = renderData?.frameColor || '#5d4037';
        const isDouble = opening.doorType === 'double' || renderData?.doorType === 'double';
        const material = new THREE.MeshStandardMaterial({ color: frameColor });

        // Left, Right, Top frame members (no bottom frame for doors)
        const members = [
            { w: frameWidth, h: opening.height, d: frameThickness, x: -opening.width / 2 + frameWidth / 2, y: 0 },
            { w: frameWidth, h: opening.height, d: frameThickness, x: opening.width / 2 - frameWidth / 2, y: 0 },
            { w: opening.width, h: frameWidth, d: frameThickness, x: 0, y: opening.height / 2 - frameWidth / 2 }
        ];

        members.forEach(m => {
            const geo = new THREE.BoxGeometry(m.w, m.h, m.d);
            const mesh = new THREE.Mesh(geo, material);
            mesh.position.set(m.x, m.y, 0);
            // Tag as legacy door frame so EdgeProjectorService can skip it in plan
            // view. DoorBuilder + DoorPlanSymbolBuilder already render the frame
            // correctly as a 2D plan symbol — these 3D meshes are redundant in plan.
            mesh.userData.role = 'legacyDoorFrame';
            frameGroup.add(mesh);
        });

        // §M-H5 (DAILY-USE 2026-05-20) — Door panel/leaf colour round-trips
        // through OpeningRenderData. Falls back to the previous hard-coded
        // `#8d6e63` warm-brown stained-oak default when the architect hasn't
        // picked a door system type. `panelColor` is consulted first (the
        // wall-fragment legacy term), then `leafColor` (the DoorBuilder
        // canonical term), then the default — so a system type that stores
        // EITHER name works without coercing every caller to one shape.
        const panelColorStr = renderData?.panelColor ?? renderData?.leafColor ?? '#8d6e63';
        const panelColor = new THREE.Color(panelColorStr);
        if (isDouble) {
            const panelWidth = (opening.width - frameWidth * 2) / 2;
            const panelGeo = new THREE.BoxGeometry(panelWidth, opening.height - frameWidth, 0.04);
            const panelMat = new THREE.MeshStandardMaterial({ color: panelColor });

            const panelVerticalOffset = -(frameWidth / 2);

            const leftPanel = new THREE.Mesh(panelGeo, panelMat);
            leftPanel.position.set(-panelWidth / 2 - frameWidth / 2, panelVerticalOffset, 0);
            leftPanel.userData.role = 'legacyDoorFrame';
            frameGroup.add(leftPanel);

            const rightPanel = new THREE.Mesh(panelGeo, panelMat);
            rightPanel.position.set(panelWidth / 2 + frameWidth / 2, panelVerticalOffset, 0);
            rightPanel.userData.role = 'legacyDoorFrame';
            frameGroup.add(rightPanel);
        } else {
            const panelGeo = new THREE.BoxGeometry(opening.width - frameWidth * 2, opening.height - frameWidth, 0.04);
            const panelMat = new THREE.MeshStandardMaterial({ color: panelColor });
            const panel = new THREE.Mesh(panelGeo, panelMat);
            panel.position.set(0, -(frameWidth / 2), 0);
            panel.userData.role = 'legacyDoorFrame';
            frameGroup.add(panel);
        }

        // Prevent division by zero
        // Phase B DTO migration: reconstruct THREE.Vector3 from Point3D at builder boundary.
        const [dStartPt, dEndPt] = wall.baseLine;
        const start = new THREE.Vector3(dStartPt.x, dStartPt.y, dStartPt.z);
        const end   = new THREE.Vector3(dEndPt.x,   dEndPt.y,   dEndPt.z);
        const baselineVec = new THREE.Vector3().subVectors(end, start);
        const wallLength = baselineVec.length();

        // Validate wall length
        if (!isFinite(wallLength) || wallLength <= 0.0001) {
            console.error("Invalid wall length for door:", wall.id);
            return new THREE.Group(); // Return empty group
        }

        const dir = baselineVec.clone().normalize();

        // Validate opening offset
        if (!isFinite(opening.offset)) {
            console.error("Invalid door offset:", opening);
            return new THREE.Group();
        }

        const t = opening.offset / wallLength;
        const sillHeight = opening.sillHeight ?? 0;
        const localY = sillHeight + opening.height / 2 + wall.baseOffset;

        const pos = dir.clone().multiplyScalar(opening.offset);
        frameGroup.position.set(pos.x, localY, pos.z);

        // Correct rotation calculation
        const angle = Math.atan2(dir.z, dir.x);
        frameGroup.rotation.y = -angle;

        // Set semantic identity ONLY on the root group
        const userData = {
            id: opening.elementId!,
            elementType: 'door',
            wallId: wall.id,
            parentId: wall.id,
            width: opening.width,
            height: opening.height,
            sillHeight: sillHeight,
            depth: frameThickness,
            frameColor: frameColor,
            doorType: isDouble ? 'double' : 'single',
            verticalPosition: sillHeight + opening.height / 2,
            baseOffset: wall.baseOffset,
            anchor: { t, offset: 0, sillHeight },
            selectable: true
        };

        if (Object.isFrozen(frameGroup.userData)) {
            frameGroup.userData = { ...userData };
        } else {
            frameGroup.userData = userData;
        }

        // Make id and elementType read-only
        Object.defineProperty(frameGroup.userData, 'id', { writable: false });
        Object.defineProperty(frameGroup.userData, 'elementType', { writable: false });

        // Children do NOT inherit semantic identity
        frameGroup.traverse(obj => {
            if (obj !== frameGroup && obj instanceof THREE.Mesh) {
                if (!obj.userData) obj.userData = {};
                if (Object.isFrozen(obj.userData)) {
                    obj.userData = { ...obj.userData };
                }
                Object.assign(obj.userData, {
                    elementType: 'door-part',
                    role: 'geometry',
                    parentId: opening.elementId!,
                    wallId: wall.id,
                    selectable: false
                });
            }
        });

        return frameGroup;
    }

    updateWindow(windowRoot: THREE.Group, width: number, height: number, sillHeight?: number): void {
        if (!windowRoot) return;

        const frameWidth = 0.05;
        const frameThickness = windowRoot.userData.depth || 0.07;

        // §4.3 FIX: Store is no longer queried here. userData was set authoritatively
        // at buildWall() time from the store data passed via OpeningRenderMap, so it
        // is a valid read-only snapshot for in-place geometry updates.
        const resolvedBaseOffset = windowRoot.userData.baseOffset ?? 0;
        const resolvedSillHeight = sillHeight ?? (windowRoot.userData.sillHeight ?? 0);

        windowRoot.userData.width = width;
        windowRoot.userData.height = height;
        windowRoot.userData.sillHeight = resolvedSillHeight;

        windowRoot.position.y = resolvedSillHeight + height / 2 + resolvedBaseOffset;

        windowRoot.clear();

        const frameColor = windowRoot.userData.frameColor || '#333333';
        const isDouble = (windowRoot.userData.windowType === 'double') || false;

        const material = new THREE.MeshStandardMaterial({ color: frameColor });

        const members = [
            { w: frameWidth, h: height, d: frameThickness, x: -width / 2 + frameWidth / 2, y: 0 },
            { w: frameWidth, h: height, d: frameThickness, x: width / 2 - frameWidth / 2, y: 0 },
            { w: width, h: frameWidth, d: frameThickness, x: 0, y: height / 2 - frameWidth / 2 },
            { w: width, h: frameWidth, d: frameThickness, x: 0, y: -height / 2 + frameWidth / 2 }
        ];

        if (isDouble) {
            members.push({ w: frameWidth, h: height, d: frameThickness, x: 0, y: 0 });
        }

        members.forEach(m => {
            const geo = new THREE.BoxGeometry(m.w, m.h, m.d);
            const mesh = new THREE.Mesh(geo, material);
            mesh.position.set(m.x, m.y, 0);
            windowRoot.add(mesh);
        });

        if (isDouble) {
            const glassWidth = (width - frameWidth * 3) / 2;
            const glassGeo = new THREE.BoxGeometry(glassWidth, height - frameWidth * 2, 0.02);
            const glassMat = new THREE.MeshStandardMaterial({ 
                color: 0x88ccff, 
                transparent: true, 
                opacity: 0.3,
                side: THREE.DoubleSide
            });

            const leftGlass = new THREE.Mesh(glassGeo, glassMat);
            leftGlass.position.set(-glassWidth / 2 - frameWidth / 2, 0, 0);
            windowRoot.add(leftGlass);

            const rightGlass = new THREE.Mesh(glassGeo, glassMat);
            rightGlass.position.set(glassWidth / 2 + frameWidth / 2, 0, 0);
            windowRoot.add(rightGlass);
        } else {
            const glassGeo = new THREE.BoxGeometry(width - frameWidth * 2, height - frameWidth * 2, 0.02);
            const glassMat = new THREE.MeshStandardMaterial({ 
                color: 0x88ccff, 
                transparent: true, 
                opacity: 0.3,
                side: THREE.DoubleSide
            });
            const glass = new THREE.Mesh(glassGeo, glassMat);
            glass.position.set(0, 0, 0);
            windowRoot.add(glass);
        }

        windowRoot.traverse(obj => {
            if (obj !== windowRoot && obj instanceof THREE.Mesh) {
                obj.userData = {
                    type: 'window-part',
                    role: 'geometry',
                    parentId: windowRoot.userData.id,
                    wallId: windowRoot.userData.id,
                    selectable: false
                };
            }
        });

        if (import.meta.env.MODE === 'development') {
            console.log('Window geometry updated:', windowRoot.userData.id, { 
                width, height, sillHeight: sillHeight ?? 0,
                windowType: isDouble ? 'double' : 'single',
                localY: windowRoot.position.y
            });
        }
    }

    updateDoor(doorRoot: THREE.Group, width: number, height: number): void {
        if (!doorRoot) return;

        const frameWidth = 0.05;
        const frameThickness = doorRoot.userData.depth || 0.07;

        // §4.3 FIX: Store is no longer queried here. userData was set authoritatively
        // at buildWall() time from the store data passed via OpeningRenderMap, so it
        // is a valid read-only snapshot for in-place geometry updates.
        const resolvedSillHeight = doorRoot.userData.sillHeight ?? 0;
        const resolvedBaseOffset = doorRoot.userData.baseOffset ?? 0;

        doorRoot.userData.width = width;
        doorRoot.userData.height = height;
        doorRoot.userData.sillHeight = resolvedSillHeight;

        doorRoot.position.y = resolvedSillHeight + height / 2 + resolvedBaseOffset;

        doorRoot.clear();

        const frameColor = doorRoot.userData.frameColor || '#5d4037';
        const isDouble = (doorRoot.userData.doorType === 'double') || false;

        const material = new THREE.MeshStandardMaterial({ color: frameColor });

        const members = [
            { w: frameWidth, h: height, d: frameThickness, x: -width / 2 + frameWidth / 2, y: 0 },
            { w: frameWidth, h: height, d: frameThickness, x: width / 2 - frameWidth / 2, y: 0 },
            { w: width, h: frameWidth, d: frameThickness, x: 0, y: height / 2 - frameWidth / 2 }
        ];

        members.forEach(m => {
            const geo = new THREE.BoxGeometry(m.w, m.h, m.d);
            const mesh = new THREE.Mesh(geo, material);
            mesh.position.set(m.x, m.y, 0);
            doorRoot.add(mesh);
        });

        if (isDouble) {
            const panelWidth = (width - frameWidth * 2) / 2;
            const panelGeo = new THREE.BoxGeometry(panelWidth, height - frameWidth, 0.04);
            const panelMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });

            const panelVerticalOffset = -(frameWidth / 2);

            const leftPanel = new THREE.Mesh(panelGeo, panelMat);
            leftPanel.position.set(-panelWidth / 2 - frameWidth / 2, panelVerticalOffset, 0);
            doorRoot.add(leftPanel);

            const rightPanel = new THREE.Mesh(panelGeo, panelMat);
            rightPanel.position.set(panelWidth / 2 + frameWidth / 2, panelVerticalOffset, 0);
            doorRoot.add(rightPanel);
        } else {
            const panelGeo = new THREE.BoxGeometry(width - frameWidth * 2, height - frameWidth, 0.04);
            const panelMat = new THREE.MeshStandardMaterial({ color: 0x8d6e63 });
            const panel = new THREE.Mesh(panelGeo, panelMat);
            panel.position.set(0, -(frameWidth / 2), 0);
            doorRoot.add(panel);
        }

        doorRoot.traverse(obj => {
            if (obj !== doorRoot && obj instanceof THREE.Mesh) {
                obj.userData = {
                    type: 'door-part',
                    role: 'geometry',
                    parentId: doorRoot.userData.id,
                    wallId: doorRoot.userData.id,
                    selectable: false
                };
            }
        });

        if (import.meta.env.MODE === 'development') {
            console.log('Door geometry updated:', doorRoot.userData.id, { 
                width, height, sillHeight: doorRoot.userData.sillHeight ?? 0,
                doorType: isDouble ? 'double' : 'single',
                localY: doorRoot.position.y
            });
        }
    }

    private createWallBodyFragment(wall: WallData, joinData?: JoinData | null): WallFragment {
        const material = this.createWallMaterial(wall);

        // ─── ADR-0055 — Pascal-style wall pipeline (default ON since 2026-05-27) ───
        // Default-ON: when the V2 flag isn't explicitly false (escape hatch:
        // `window.__pryzmWallPipelineV2 = false`), build geometry from the
        // resolver→footprint→extruder chain instead of `MiterPrismBuilder`. The
        // new pipeline guarantees edge-coincident corners at L/T/X junctions BY
        // CONSTRUCTION — no wedge, no overlap, no need for the WallJunctionInfill
        // prism / polygonOffset hack (P4 retires those entirely once verified).
        //
        // The miter cache is refreshed by the orchestrator (WallRebuildCoordinator
        // ._flush) immediately after WallJoinResolver.resolveLevel — pure data
        // hand-off, no store reach-down from the builder. The builder reads the
        // pre-computed cache and consumes it as a value.
        //
        // The polygon is in WORLD-XZ; we translate the geometry by −baseLine[0] so
        // the mesh attaches at the wallGroup local origin, matching every other
        // wall mesh in the scene.
        const v2Cache = this.getEffectiveV2Cache();
        if (isWallPipelineV2Enabled() && v2Cache && v2Cache.getMiter(wall.id)) {
            // §V2-PRETRIM-FIX (2026-05-27, live-fix after architect screenshot):
            // V2's `WallMiter` corners are solved by `JunctionResolverV2` against the
            // PRE-TRIM baselines (the original wall centerlines, before `WallJoinResolver`
            // shortens each side by halfT to make the legacy MiterPrism abut cleanly).
            // The footprint builder mixes those override corners with `wall.start`/`end`-
            // derived DEFAULTS (sLDefault = wall.start + halfT * leftPerp, etc.). If we
            // pass POST-TRIM start/end to the spec, the defaults sit `halfT` along the
            // wall axis AWAY from where the cache's miter corners live — the resulting
            // polygon zig-zags between the two coordinate frames and degenerates to a
            // near-zero-area sliver (the "plane not volume" defect in the live screenshot
            // 2026-05-27). Use the archived `_sourceBaseLine` (pre-trim) so defaults +
            // overrides share the same frame; fall back to baseLine when no trim has
            // happened yet (fresh wall create) — there pre-trim ≡ post-trim by construction.
            const srcBL = (wall as unknown as { _sourceBaseLine?: ReadonlyArray<{ x: number; z: number }> })._sourceBaseLine;
            const preTrimStart = srcBL?.[0] ?? wall.baseLine[0];
            const preTrimEnd   = srcBL?.[1] ?? wall.baseLine[1];
            const spec: LevelWallSpec = {
                id: wall.id,
                startXZ: { x: preTrimStart.x, z: preTrimStart.z },
                endXZ:   { x: preTrimEnd.x,   z: preTrimEnd.z },
                thickness: wall.thickness,
            };
            const { geometry: worldGeom } = buildWallV2Geometry(spec, v2Cache, {
                height: wall.height,
                baseOffset: wall.baseOffset ?? 0,
                elevation: 0,
            });
            // Translate world-XZ vertices to wallGroup-local. The wallGroup is positioned
            // at the POST-TRIM start (`wall.baseLine[0]`), so translating by that delta
            // lets the rendered geometry sit at its TRUE pre-trim WORLD position —
            // Pascal-style, the wall body extends to the actual junction (no trim).
            worldGeom.translate(-wall.baseLine[0].x, 0, -wall.baseLine[0].z);

            const meshV2 = new THREE.Mesh(worldGeom, material);
            meshV2.userData = {
                id: wall.id,
                materialId: wall.materialId,
                materialColor: wall.materialColor,
                role: 'geometry',
                selectable: false,
                pipelineV2: true,    // diagnostic — DevTools can filter `userData.pipelineV2`.
            };
            return {
                id: crypto.randomUUID(),
                wallId: wall.id,
                mesh: meshV2 as any,
                type: 'wall-body',
                parentId: wall.id,
                levelId: wall.levelId,
            };
        }
        // ────────────────────────────────────────────────────────────────────────

        // Use miter prism geometry so plain straight walls also get correct
        // oblique miter cuts at joins.  For free ends (no joinAngles) the
        // prism produces a standard perpendicular end face — same as BoxGeometry.
        const worldStart = new THREE.Vector3(0, 0, 0); // local to wallGroup (= baseLine[0])
        // Phase B DTO migration: baseLine is [Point3D, Point3D] — compute end offset directly.
        const worldEnd = new THREE.Vector3(
            wall.baseLine[1].x - wall.baseLine[0].x,
            wall.baseLine[1].y - wall.baseLine[0].y,
            wall.baseLine[1].z - wall.baseLine[0].z,
        );

        // §STEP4: Read miter normals from joinData parameter — no cache.
        const geometry = buildMiterPrism(
            worldStart,
            worldEnd,
            worldStart,            // centerlineStart = worldStart (straight wall, no layer offset)
            worldEnd,              // centerlineEnd = worldEnd
            wall.thickness / 2,
            wall.height,
            wall.baseOffset ?? 0,  // §FIX-NAN-Y: guard against undefined baseOffset
            joinData?.startMN ?? null,
            joinData?.endMN   ?? null,
        );

        const mesh = new THREE.Mesh(geometry, material);
        mesh.userData = {
            id: wall.id,
            materialId: wall.materialId,
            materialColor: wall.materialColor,
            role: 'geometry',
            selectable: false
        };

        return {
            id: crypto.randomUUID(),
            wallId: wall.id,
            mesh: mesh as any,
            type: 'wall-body',
            parentId: wall.id,
            levelId: wall.levelId
        };
    }

    // ─── ADR-0055: V2 pipeline cache ─────────────────────────────────────────
    // Owned by the builder. Populated by `WallRebuildCoordinator._flush` once
    // per level rebuild with the SAME `levelWalls` slice it feeds to
    // `WallJoinResolver.resolveLevel`. The builder never reads any store —
    // pure data hand-off keeps the layer boundaries clean (L1 builder / L3
    // orchestrator). A DevTools-injected `__pryzmWallV2Cache` is also honoured
    // as a debugging hook; it never escapes the manual-test surface.
    private _v2Cache: WallPipelineV2Cache | null = null;

    /** Refresh the per-level miter cache used by the Pascal-style pipeline.
     *  Idempotent; cheap (O(n) + the resolver's O(k log k) per junction). The
     *  orchestrator (`WallRebuildCoordinator._flush`) calls this exactly once
     *  per affected level, immediately after `WallJoinResolver.resolveLevel`. */
    public refreshV2Cache(levelWalls: readonly LevelWallSpec[]): void {
        if (!this._v2Cache) this._v2Cache = new WallPipelineV2Cache();
        this._v2Cache.refresh(levelWalls);
    }

    private getEffectiveV2Cache(): WallPipelineV2Cache | null {
        // Orchestrator-populated cache wins if it carries any junctions.
        if (this._v2Cache && this._v2Cache.junctionEnds > 0) return this._v2Cache;
        // DevTools escape hatch — never set in production code paths.
        const fromGlobal = (globalThis as { __pryzmWallV2Cache?: WallPipelineV2Cache }).__pryzmWallV2Cache;
        return fromGlobal ?? this._v2Cache ?? null;
    }

    private createWallMaterial(wall?: WallData): THREE.Material {
        // §M-H1 (DAILY-USE-AUDIT 2026-05-20) — resolve `wall.materialId` against
        // the STANDARD_MATERIAL_LIBRARY map (when both supplied) so picking
        // "Steel Stainless Polished" vs "Concrete Smooth" actually changes the
        // rendered PBR parameters instead of producing identical matte plaster.
        // Mirrors `SlabFragmentBuilder.ts:822-858`. Falls back to the
        // realistic/schematic + materialColor paths below when no map or no
        // match — fully backward-compatible.
        const matId = (wall as unknown as { materialId?: string } | undefined)?.materialId;
        if (matId && this.injectedMaterialMap) {
            const matDef = this.injectedMaterialMap.get(matId);
            if (matDef) {
                const params: Record<string, unknown> = { ...(matDef.params ?? {}) };
                // Honour HDRI envMap on realistic style so user-picked metals
                // still reflect the loaded environment correctly.
                if (this.currentVisualStyle === VisualStyle.REALISTIC && this.hdriTexture) {
                    params.envMap = this.hdriTexture;
                    params.envMapIntensity = this.envMapIntensity;
                } else if (this.currentVisualStyle === VisualStyle.SCHEMATIC) {
                    // Schematic style: collapse PBR to flat matte (matches slab's
                    // visualStyle === 1 branch — preserves the "everything looks
                    // like cardboard" intent of schematic mode).
                    params.metalness = 0;
                    params.roughness = 1;
                } else if (matDef.textures) {
                    params.map           = matDef.textures.color;
                    params.normalMap     = matDef.textures.normal;
                    params.roughnessMap  = matDef.textures.roughness;
                }
                params.depthWrite = true;
                params.depthTest  = true;
                // Honour the per-wall materialColor as a tint when set — lets
                // the architect re-colour a "concrete-smooth" PBR wall to red.
                if (wall?.materialColor && params.color === undefined) {
                    params.color = wall.materialColor;
                }
                return new THREE.MeshStandardMaterial(params as ConstructorParameters<typeof THREE.MeshStandardMaterial>[0]);
            }
            // matDef not found — fall through to the legacy material paths below
            // and emit a one-shot warn so the gap is visible during dev.
            if (!(this as unknown as { _warnedMissingMatIds?: Set<string> })._warnedMissingMatIds) {
                (this as unknown as { _warnedMissingMatIds: Set<string> })._warnedMissingMatIds = new Set<string>();
            }
            const seen = (this as unknown as { _warnedMissingMatIds: Set<string> })._warnedMissingMatIds;
            if (!seen.has(matId)) {
                seen.add(matId);
                console.warn(`[WallFragmentBuilder] materialId "${matId}" not in materialMap — falling back to materialColor. §M-H1 audit.`);
            }
        }

        if (this.currentVisualStyle === VisualStyle.REALISTIC && this.hdriTexture) {
            const mat = new THREE.MeshStandardMaterial({
                color: wall?.materialColor || WALL_REALISTIC_MATERIAL.color,
                roughness: WALL_REALISTIC_MATERIAL.roughness,
                metalness: WALL_REALISTIC_MATERIAL.metalness,
                envMap: this.hdriTexture,
                envMapIntensity: this.envMapIntensity,
                depthWrite: true,
                depthTest: true
            });
            return mat;
        } else {
            const color = wall?.materialColor || WALL_SCHEMATIC_MATERIAL.color;
            return new THREE.MeshStandardMaterial({
                color: color,
                roughness: WALL_SCHEMATIC_MATERIAL.roughness,
                metalness: WALL_SCHEMATIC_MATERIAL.metalness,
                depthWrite: true,
                depthTest: true
            });
        }
    }

    /**
     * §WALL-AUDIT-2026-C1 (move-restore) + CONTRACT 03 §1.5
     *
     * Sync ONLY mutable userData fields onto a wallGroup.  The identity triple
     * (`id`, `type`, `elementType`) is locked once at the top of `buildWall()`
     * via `Object.defineProperty(writable:false, configurable:false)` and MUST
     * NOT be re-asserted here — strict-mode assignment to a non-writable
     * property throws `TypeError: Cannot assign to read only property`,
     * aborting the rebuild mid-way.  When that aborted, the next store mutation
     * (e.g. an opening insert, a level-elevation cascade, or a join-resolver
     * pass) would rebuild the wall from the still-old `userData.baseLine`
     * snapshot, snapping the freshly-moved wall back to its pre-drag position.
     *
     * The early-sync block in `buildWall()` already writes the OBB-highlight
     * fields (baseLine, height, thickness, baseOffset, openings, levelId,
     * version) before any early-return branch.  This helper writes the
     * remaining display-time fields (material, parent, children, plus any
     * branch-specific extras) on the path that survives to completion.
     */
    private _syncMutableWallUserData(
        wallGroup: THREE.Group,
        wall: WallData,
        extras?: Record<string, unknown>,
    ): void {
        const ud = wallGroup.userData as any;
        ud.modelId       = ud.modelId ?? 'model-default';
        ud.selectable    = true;
        ud.version       = this._geometrySeq;  // §NME-VERSION-FIX: see buildWall()
        ud.levelId       = wall.levelId;
        ud.baseLine      = wall.baseLine;
        ud.height        = wall.height;
        ud.thickness     = wall.thickness;
        ud.baseOffset    = wall.baseOffset;
        ud.openings      = wall.openings ?? [];
        ud.materialId    = wall.materialId    || null;
        ud.materialColor = wall.materialColor || null;
        ud.parentId      = (wall as any).parentId   || null;
        ud.childrenIds   = wall.childrenIds         || [];
        if (extras) {
            for (const [k, v] of Object.entries(extras)) {
                if (k === 'id' || k === 'type' || k === 'elementType') continue; // identity is locked
                ud[k] = v;
            }
        }
    }

    /**
     * §PHASE-3 Task 3.3: Dispose all child geometry and materials in a group,
     * then clear the group. Used before every wall rebuild to prevent GPU memory
     * leaks from orphaned WebGLBuffer / WebGLVertexArrayObject allocations.
     *
     * Handles all child types: THREE.Mesh (wall body, openings, frames) and
     * THREE.LineSegments (edge overlays). Skips the group root itself.
     * Materials are disposed inline — wall materials are per-wall instances,
     * not shared singletons, so disposal is safe.
     */
    private _disposeWallGroupChildren(group: THREE.Group): void {
        group.traverse((obj: THREE.Object3D) => {
            if (obj === group) return;
            if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
                obj.geometry?.dispose();
                const mat = (obj as any).material;
                if (Array.isArray(mat)) {
                    mat.forEach((m: any) => m?.dispose?.());
                } else {
                    mat?.dispose?.();
                }
            }
        });
        group.clear();
    }

    removeWallFragments(wallId: string): void {
        const fragmentIds = this.wallToFragmentsMap.get(wallId);
        if (!fragmentIds) return;

        const wallRoot = this.wallRoots.get(wallId);

        for (const fragId of fragmentIds) {
            const fragment = this.fragments.get(fragId);
            if (fragment) {
                const isWallRoot = fragment.mesh === (wallRoot as any);

                if (!isWallRoot) {
                    if (fragment.mesh.parent) {
                        fragment.mesh.parent.remove(fragment.mesh);
                    }

                    // QF-2: Dispose geometry and materials for ALL fragment types,
                    // including 'wall-body'. The previous code excluded wall-body via
                    // an `!isWallBodyFragment` guard — this was a GPU memory leak.
                    // `scene.remove()` only detaches from the scene graph; the underlying
                    // WebGLBuffer and WebGLVertexArrayObject stay in VRAM until .dispose()
                    // is called explicitly. The isWallRoot check above already protects the
                    // persistent wallGroup root from being disposed prematurely.
                    fragment.mesh.traverse((obj: any) => {
                        if (obj instanceof THREE.Mesh) {
                            obj.geometry.dispose();
                            if (Array.isArray(obj.material)) {
                                obj.material.forEach(m => {
                                    if (m && typeof m.dispose === 'function') {
                                        m.dispose();
                                    }
                                });
                            } else if (obj.material && typeof obj.material.dispose === 'function') {
                                obj.material.dispose();
                            }
                        }
                    });
                }

                this.fragments.delete(fragId);
            }

            // ✅ FIX: fragmentToEntityMap.delete() is always called for every fragId in
            // wallToFragmentsMap, regardless of whether this.fragments still holds a reference.
            // Previously it was inside `if (fragment)`, meaning any fragId whose this.fragments
            // entry had already been removed (e.g. by an earlier removeWall call) would leave a
            // stale entry in fragmentToEntityMap, accumulating indefinitely across rebuilds.
            this.fragmentToEntityMap.delete(fragId);
        }

        this.wallToFragmentsMap.delete(wallId);
    }

    getEntityForFragment(fragmentId: string): FragmentEntityMapping | undefined {
        return this.fragmentToEntityMap.get(fragmentId);
    }

    getFragmentMesh(fragmentId: string): THREE.Mesh | undefined {
        return this.fragments.get(fragmentId)?.mesh;
    }

    getWallMesh(wallId: string): THREE.Object3D | undefined {
        const fragmentIds = this.wallToFragmentsMap.get(wallId);
        if (!fragmentIds || fragmentIds.length === 0) {
            console.warn(`WallFragmentBuilder: No fragments found for wall ${wallId}`);
            return undefined;
        }

        const wallRoot = this.wallRoots.get(wallId);
        if (!wallRoot) {
            console.warn(`WallFragmentBuilder: No wall root found for wall ${wallId}. This may indicate a rebuild inconsistency.`);
        }

        return wallRoot || this.fragments.get(fragmentIds[0])?.mesh;
    }

    getWallRoot(wallId: string): THREE.Group | undefined {
        return this.wallRoots.get(wallId);
    }

    updateAllMaterials(): void {
        for (const fragment of this.fragments.values()) {
            const oldMat = fragment.mesh.material;
            fragment.mesh.material = this.createWallMaterial();
            if (Array.isArray(oldMat)) {
                oldMat.forEach(m => {
                    if (m && typeof m.dispose === 'function') {
                        m.dispose();
                    }
                });
            } else if (oldMat && typeof oldMat.dispose === 'function') {
                oldMat.dispose();
            }
        }
    }

    dispose(): void {
        for (const wallId of this.wallRoots.keys()) {
            this.removeWall(wallId);
        }
        this.fragments.clear();
        this.fragmentToEntityMap.clear();
        this.wallToFragmentsMap.clear();
        this.wallRoots.clear();
    }
}