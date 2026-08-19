/// <reference types="vite/client" />

import * as THREE from '@pryzm/renderer-three/three';
import { mergeGeometries, toCreasedNormals } from '@pryzm/renderer-three';
// §I2 — WebGPU-safe disposal for the live wall-rebuild teardown sites (a stale
// WebGPU render object must never throw `usedTimes` and abort the rebuild).
import { safeDisposeMaterial, safeDisposeMaterials } from '@pryzm/renderer-three';
// §GPU-RESOURCE-LIFETIME (ADR-0297 INVARIANT L2) — "DETACH now, RELEASE at the
// boundary". See _disposeWallGroupChildren() / removeWallFragments() below.
import { detachAndReleaseChildren, scheduleGpuRelease } from '@pryzm/renderer-three';
import { WallData, Opening, FragmentEntityMapping, WallLayer } from './WallTypes';
import { WALL_DEFAULT_BODY_COLOUR } from './WallDefaultBodyColour';
// §FEAT-WALL-SIDE-FINISH — the per-side override, resolved ONCE, in a pure module.
import { resolveLayerRenderFinishColor, resolveWholeBodyFinishColor } from './WallSideFinishResolver';
import { VisualStyle, WALL_REALISTIC_MATERIAL, WALL_SCHEMATIC_MATERIAL } from '@pryzm/core-app-model/material-library';
import { spatialAuthority, SpatialAuthorityError } from '@pryzm/core-app-model';
import { buildCurvedLayerGeometry, computeStations, type CurvedProfileHeights } from './CurvedWallLayerBuilder';
// §FEAT-HOSTED-ON-CURVED-WALL — arc-length parameterisation + radial-band carve.
import { isArcHost, wallCentrelineLength, hostedElementFrame } from './WallArcParam';
import {
    computeCurvedWallBands,
    stationArcLengths,
    insertStationsAt,
    sliceStations,
    bandCapTangents,
} from './CurvedWallOpeningBuilder';
import { clusterOpenings, buildLayeredWallSegmentsAroundOpenings } from './LayeredWallOpeningBuilder';
import { buildMiterPrism } from './MiterPrismBuilder';
import { hasWallProfile, resolveWallProfile, wallProfileVertexUs, wallProfileExtentAt } from './WallProfile';
// §FEAT-WALL-PROFILE-BODY (L-1067) — the builder that finally DRAWS the authored ring.
import { buildWallProfileBodyGeometry } from './WallProfileBodyBuilder';
// §WALL-PLAIN-HOLE-EXTRUDE — pure (testable) single-body geometry for a plain
// straight wall with openings (one continuous ExtrudeGeometry, no segment seams).
import { buildWallHoleBodyGeometry } from './WallHoleBodyBuilder';
// §WALL-Y-DATUM (L-968) — THE wall vertical datum authority. This builder is the
// ONE writer: it resolves the world BASE plane and publishes it so the hosted
// leaves, the junction infill and the instanced arm all read one number instead of
// re-deriving four. See `WallVerticalDatum.ts` for the two named planes.
import { publishWallBaseY, forgetWallBaseY } from './WallVerticalDatum';
// ADR-0055 — Pascal-style wall pipeline (default ON since 2026-05-27).
// The orchestrator (`WallRebuildCoordinator._flush`) calls `refreshV2Cache()`
// once per level rebuild with the same `levelWalls` slice it feeds to
// `WallJoinResolver.resolveLevel`. The builder NEVER reaches into any store —
// pure data hand-off (L1→L1) so the architectural layering stays clean.
import {
    WallPipelineV2Cache,
    buildWallV2Geometry,
    // §FEAT-RAKE-LAYERED — the ONE derivation of a raked LAYERED wall's plan thickness,
    // shared with the junction solve so the bands and the polygon agree.
    effectivePlanThickness,
    isWallPipelineV2Enabled,
    type LevelWallSpec,
    // §CONNECT-3 — the two QUERY result types are genuinely owned by the cache module
    // (they describe what the cache can and cannot answer), so they come from here.
    type WallConnectivityQuery,
    type WallJunctionQuery,
} from './WallPipelineV2';
// §CONNECT-3 — `WallJunctionRecord` is declared by the RESOLVER, which is what
// produces it; it is imported from its home rather than re-exported through
// `WallPipelineV2` (which merely stores it). Laundering the type through the cache
// module would have silenced the root-tsc error while making the resolver's own
// output look like the cache's invention.
import type { WallJunctionRecord } from './JunctionResolverV2';
// §FIX-LAYERED-WALL-V2-PARITY (ADR-0298) — a LAYERED wall takes the same V2 footprint the
// plain path takes, sliced into per-layer bands, instead of re-deriving its corners with the
// legacy per-layer miter projection. See the block comment in the layered branch.
import { buildWallFootprint } from './WallFootprint2D';
import { buildWallExtrusion } from './WallPolygonExtruder';
// §WALL-RAKE — sizing the §V2-SPIKE-GUARD budget for a legitimately overhanging raked wall.
// §FEAT-RAKE-LAYERED — `rakeTopOffset` shears the layered bands; `isVerticalRake` keeps the
// vertical path literally untouched; `rakedPlanThickness` converts a legacy prism's authored
// (perpendicular) layer thickness into its plan width.
// §RAKE-HOSTED-OPENING — `rakeShearPerMetre` is the ONE place cot(rake) is computed;
// the opening-bearing body path shears with it rather than minting a second copy.
import {
    isVerticalRake,
    rakedPlanThickness,
    rakeLateralShift,
    rakeShearPerMetre,
    rakeTopOffset,
} from './WallRake';
import { buildWallLayerBands } from './WallLayerFootprint2D';
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
 * §GEN-LOG-GATING (L-369, 2026-07-17) — true while a project restore replays the Create*
 * commands (`__pryzmProjectLoadActive`, ProjectLoader) OR a building generation is in flight
 * (`__pryzmBuildingGenActive`, buildingGenerationLifecycle). The per-frame RAF_DRAIN log
 * below is hot on both paths (fresh string interpolation every drain frame); it is pure
 * noise there and a real main-thread drain with DevTools open. Interactive edits (neither
 * flag set) still log normally.
 */
function __pryzmGenOrLoadActive(): boolean {
    const g = globalThis as unknown as { __pryzmProjectLoadActive?: boolean; __pryzmBuildingGenActive?: boolean };
    return g.__pryzmProjectLoadActive === true || g.__pryzmBuildingGenActive === true;
}

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
        const jh = this._joinHash(joinData);
        const slabTag = (slabBaseOffset ?? 0).toFixed(4);
        return `${wall._renderVersion}|${jh}|${slabTag}|${this._rakeTag(wall)}`;
    }

    /**
     * §WALL-RAKE-INVALIDATION — the wall's lean, as a cache-key fragment.
     *
     * THE DEFECT (founder 2026-08-09): "the wall only gets angled after another
     * element is created or modified." `rakeAngleDeg` is a real geometry input
     * (`createWallBodyFragment` feeds it to `buildWallV2Geometry`), but neither
     * in-process invalidation key folded it, so a rake-only edit produced a
     * byte-identical key and `_buildWallInternal` short-circuited — leaving the
     * VERTICAL mesh on screen while the store held a raked wall.
     *
     * The key was `_renderVersion`-addressed, and `_renderVersion` is bumped by
     * every DEDICATED wall command (UpdateWallBaselineCommand, Cascade…, Join…,
     * Cut…, Scale…) but NOT by the generic bus path the property panel uses
     * (`element.updateParameters` → `UpdateElementParameterCommand` →
     * `WallStore.update`). That is the L-793 two-mutation-paths class; folding
     * the rake CONTENT into the key fixes the rake case without relying on which
     * mutation path wrote it — content-addressing beats counter-addressing, the
     * same argument `composeWallGeometryHash` already makes for the persisted key.
     *
     * Absent ⇒ `90.0000` (vertical), so no pre-rake wall is re-versioned by this.
     */
    private _rakeTag(wall: WallData): string {
        // §WALL-RAKE-JOINT (ADR-0312) — a wall's built TOP geometry now also depends on
        // the rakes of the walls it JOINS (the twin-solve loft moves its mitred top
        // corners along the shared 3-D mitre line). Fold the level's rake-joint
        // signature — sorted id:rake of every raked wall, from the V2 cache — so a
        // NEIGHBOUR rake edit re-keys this wall (gates 1+2 of
        // §DIAG-INVALIDATION-COMPLETENESS; the L-813 bug class). Empty on a level with
        // no raked wall ⇒ the key is byte-identical to the pre-ADR-0312 build.
        const jointSig = this.getEffectiveV2Cache()?.rakeJointSignature ?? '';
        const own = `r${(wall.rakeAngleDeg ?? 90).toFixed(4)}`;
        return jointSig ? `${own}|RJ[${jointSig}]` : own;
    }

    /** §WALL-DEEP-2026 B3 — hash the join miter/baseline inputs. Shared by
     *  `_composeCacheKey` (rebuild skip-guard) and `_versionForBuild`
     *  (§FIX-WALL-VERSION-CONTENT-HASH, L-52). */
    private _joinHash(joinData: JoinData | null | undefined): string {
        if (!joinData) return '_';
        const sm = joinData.startMN
            ? `${joinData.startMN.nx.toFixed(4)},${joinData.startMN.nz.toFixed(4)}`
            : 'sq';
        const em = joinData.endMN
            ? `${joinData.endMN.nx.toFixed(4)},${joinData.endMN.nz.toFixed(4)}`
            : 'sq';
        const b0 = `${joinData.baseLine[0].x.toFixed(4)},${joinData.baseLine[0].z.toFixed(4)}`;
        const b1 = `${joinData.baseLine[1].x.toFixed(4)},${joinData.baseLine[1].z.toFixed(4)}`;
        return `${b0}-${b1}|${sm}|${em}`;
    }

    /**
     * §FIX-WALL-VERSION-CONTENT-HASH (L-52) — resolve the `userData.version`
     * generation token for THIS build.
     *
     * The token feeds the EdgeProjector / NativeElementMeshExporter plan-view
     * projection cache (keyed `elementId:viewId:userData.version:cropKey`). The
     * previous code bumped a monotonic `_geometrySeq` on EVERY `buildWall()`
     * call unconditionally, so a whole-level rebuild (fired by a single-wall
     * edit or a join re-resolve) re-versioned every wall — even untouched ones —
     * driving the plan-projection cache hit-rate to ~0 % and reproducing the
     * L-06 "plan view churns on every edit" storm.
     *
     * Fix: only mint a fresh token when the wall's projected-geometry inputs
     * actually change. The content key folds exactly the determinants of the
     * built geometry: the wall's own `_renderVersion` (bumped by WallStore on
     * every baseline / thickness / height / baseOffset / layers / openings /
     * material mutation), the join miter/baseline hash (neighbour changes), and
     * `worldY` (level elevation + slab base offset + baseOffset). When the key
     * is unchanged from this wall's last build we REUSE its prior token, so the
     * projection cache keeps its entry and reports a HIT. Genuine geometry
     * changes still mint a new (globally-unique, monotonic) token, preserving
     * the §96-STALE-GUARD async-swap generation semantics.
     *
     * Legacy / test walls with no `_renderVersion` fall back to the historical
     * always-fresh behaviour so nothing that lacks the version contract can
     * pin a stale cache entry.
     */
    private _versionForBuild(
        wall: WallData,
        joinData: JoinData | null | undefined,
        worldY: number | undefined,
    ): number {
        if (wall._renderVersion === undefined) {
            // No stable content signal — preserve legacy "unique on every build".
            return ++this._geometrySeq;
        }
        // §WALL-RAKE-INVALIDATION — the rake shears the extrusion, so it changes the
        // PROJECTED geometry (the plan outline of a raked wall is its base footprint,
        // but its section/elevation and its 3D silhouette are not). Fold it or a rake
        // edit reuses the prior token and the EdgeProjector / NME plan-projection cache
        // serves the pre-rake proxy — the founder's `[VDT] §G3-STALE-EVENT` /
        // `§DIAG-GRAFT-FALLTHROUGH` symptom. See `_rakeTag`.
        const key = `${wall._renderVersion}|${this._joinHash(joinData)}|${(worldY ?? 0).toFixed(4)}|${this._rakeTag(wall)}`;
        const prev = this._geomVersionKey.get(wall.id);
        if (prev !== undefined && prev.key === key) {
            // Inputs unchanged since the last build — reuse the token so the
            // plan-projection cache entry stays valid (a HIT).
            return prev.seq;
        }
        const seq = ++this._geometrySeq;
        this._geomVersionKey.set(wall.id, { key, seq });
        return seq;
    }

    // §PHASE-3: Optional instanced rendering bridge.
    // Null until EngineBootstrap injects it after initScene wires InstancedElementRenderer.
    // When set, simple walls (no openings, not curved, no miter) route to GPU instancing.
    private _instanceBridge: WallInstanceBridge | null = null;

    // §INSTANCE-MAT-SHARE (2026-07-01) — colour-keyed cache of the MeshStandardMaterial
    // handed to the instanced path. Before this cache, buildWall() minted a BRAND-NEW
    // material per simple wall, so InstancedElementRenderer's group key
    // (`levelId_…_material.uuid`) put every wall in its OWN group of size 1 — GPU
    // instancing collapsed NOTHING on the 40-storey office (1065 walls → ~1065 draw
    // calls). Sharing ONE material per distinct colour lets all identical-colour simple
    // walls on a level coalesce into a single InstancedMesh → 1 draw call per
    // (colour × level). InstanceGroup never disposes the material (it may be shared —
    // see InstanceGroup.dispose), so this cache owns their lifetime; freed in dispose().
    private _instanceMaterialCache = new Map<string, THREE.MeshStandardMaterial>();

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
     *
     *   §FIX-WALL-VERSION-CONTENT-HASH (L-52): the bump is now CONDITIONAL —
     *   `_versionForBuild()` only mints a fresh token when the wall's projected
     *   geometry inputs actually change (see that method). `_geometrySeq` remains
     *   the monotonic source of fresh tokens; it is no longer incremented for a
     *   no-op rebuild, so untouched walls keep their projection-cache entry.
     */
    private _geometrySeq = 0;

    /**
     * §FIX-WALL-VERSION-CONTENT-HASH (L-52) — per-wall record of the last
     * content key and the generation token minted for it. When a rebuild
     * arrives with the identical key the stored token is reused (stable
     * `userData.version` → plan-projection cache HIT). Cleared in removeWall().
     */
    private _geomVersionKey = new Map<string, { key: string; seq: number }>();

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
    private static readonly MAX_ADAPTIVE_CAP = 64;
    /**
     * §PERF-WALL-DRAIN-BATCH-BUDGET (L-369, 2026-07-17) — during a batch generation
     * (residential / office / house) OBC renders are suppressed for the whole drain, so a
     * drain frame is PURE geometry cost. A 6-storey resi building is ~192 structural walls;
     * at the old ~16 walls/frame that is ~12 frames just to drain walls. Give batch drains a
     * much higher per-frame FLOOR (applied before the splice so it takes effect on the very
     * first frame) and a bigger adaptive ramp step, so the queue drains in a handful of
     * frames. The frameMs > 20 back-off below still protects against an unexpectedly heavy
     * frame, and MAX_ADAPTIVE_CAP bounds a single frame. Interactive (non-batch) edits keep
     * the conservative 15-wall floor + ±1 ramp.
     */
    private static readonly BATCH_MIN_BUILDS_PER_FRAME = 32;
    private static readonly BATCH_RAMP_STEP = 8;
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
        // §PERF-WALL-DRAIN-BATCH-BUDGET (L-369) — raise the per-frame FLOOR for batch drains
        // BEFORE the splice so the very first frame already builds a big chunk. Renders are
        // suppressed during a batch drain, so a frame is pure geometry and can safely go high.
        const __isBatchDrain = batchCoordinator.isBatching;
        if (__isBatchDrain && this._buildsPerFrame < WallFragmentBuilder.BATCH_MIN_BUILDS_PER_FRAME) {
            this._buildsPerFrame = WallFragmentBuilder.BATCH_MIN_BUILDS_PER_FRAME;
        }
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
            // §PERF-WALL-DRAIN-BATCH-BUDGET (L-369) — ramp up faster during a batch drain so
            // the budget reaches the cap in a few cheap frames instead of ~25.
            this._buildsPerFrame = Math.min(
                WallFragmentBuilder.MAX_ADAPTIVE_CAP,
                this._buildsPerFrame + (__isBatchDrain ? WallFragmentBuilder.BATCH_RAMP_STEP : 1),
            );
        } else if (frameMs > 20 && this._buildsPerFrame > 5) {
            this._buildsPerFrame--;
        }

        // §GEN-LOG-GATING (L-369) — the per-frame drain line is hot during a batch generation
        // (fires every frame with fresh string interpolation). Suppress it while a project
        // load or a building generation is in flight; keep it for interactive edits.
        if (!__pryzmGenOrLoadActive()) {
            console.log(
                `[WallFragmentBuilder] RAF_DRAIN built=${batch.length} remaining=${this._pendingBuilds.length} ` +
                `queueBefore=${__queue_before} frameMs=${frameMs.toFixed(1)}ms nextBudget=${this._buildsPerFrame} isBatch=${batchCoordinator.isBatching}`
            );
        }
        // §LOADING-REAL-PROGRESS (2026-07-01) — feed the loading overlay the REAL live
        // drain progress (built this frame + still-queued) so it shows the true
        // cumulative element count and a bar driven by the actual build ratio, not a
        // per-sub-batch declared count of "1". Walls are the structural pass.
        batchCoordinator.reportBuildProgress(batch.length, this._pendingBuilds.length, 'structure');
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
        // §FIX-WALL-VERSION-CONTENT-HASH (L-52): drop the per-wall content key so a
        // re-created wall (undo of delete) mints a fresh generation token.
        this._geomVersionKey.delete(wallId);

        // §PHASE-3: Unregister from GPU instancing if the wall was on the instanced path.
        this._instanceBridge?.unregister(wallId);

        // §WALL-Y-DATUM (L-968) — drop the published base plane. A stale entry would
        // let a re-created wall's hosted leaf anchor to the DELETED wall's datum,
        // which is exactly the class of ghost this file's removal path exists to kill.
        forgetWallBaseY(wallId);

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
        // §NME-VERSION-FIX + §FIX-WALL-VERSION-CONTENT-HASH (L-52): resolve the
        // generation token for this build. Only mints a FRESH token when this
        // wall's projected-geometry inputs changed, so a whole-level rebuild no
        // longer re-versions untouched walls and the EdgeProjector/NME plan cache
        // keeps their entries (see _versionForBuild). Still unique on a real
        // change, preserving the join/miter cache-bust and §96-STALE-GUARD.
        const geometryVersion = this._versionForBuild(wall, joinData, worldY);

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
            // The swallow is deliberate and CORRECT here (no-empty): `delete` on a
            // non-configurable property throws in strict mode, and "already locked
            // by a prior build" is exactly the state we are about to (re)assert with
            // defineProperty below — there is nothing to report and nothing to fix.
            try { delete ud.id; } catch { /* already locked — reasserted below */ }
            try { delete ud.type; } catch { /* already locked — reasserted below */ }
            try { delete ud.elementType; } catch { /* already locked — reasserted below */ }
            Object.defineProperty(ud, 'id',          { value: wall.id, writable: false, configurable: false, enumerable: true });
            Object.defineProperty(ud, 'type',        { value: 'wall',  writable: false, configurable: false, enumerable: true });
            Object.defineProperty(ud, 'elementType', { value: 'wall',  writable: false, configurable: false, enumerable: true });
        }
        wallGroup.userData.modelId = 'model-default';
        wallGroup.userData.selectable = true;
        // §NME-VERSION-FIX + §FIX-WALL-VERSION-CONTENT-HASH (L-52): stamp the
        // content-derived generation token resolved at the top of this method
        // rather than a raw monotonic counter. It changes on every real geometry
        // delta (own fields via _renderVersion, joins via the miter hash, worldY)
        // — busting the NME/EdgeProjector plan cache when the projection actually
        // changes — but stays STABLE for a no-op rebuild so untouched walls keep
        // their cache entry under a whole-level rebuild.
        wallGroup.userData.version = geometryVersion;
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
        // §FIX-PLAN-OPENING-CLIP-ARC — the plan-view opening-line suppressor
        // (EdgeProjectorService._suppressPlanViewOpeningLines) measures opening
        // zones ALONG the wall. Opening offsets are ARC lengths on a curved wall
        // (WallOccupancyStore measures them on the centreline), so the suppressor
        // must know the wall is curved to measure the same way. Without this stamp
        // it cannot tell, and silently falls back to the chord — the same
        // arc-vs-chord divergence fixed for door/window plan SYMBOLS in 118367e2,
        // in its third location.
        wallGroup.userData.curve = wall.curve ?? null;

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

        // §FIX-WALL-CLUSTER-DEGENERATE (2026-07-02 — L-27 cluster case) — the V2 miter
        // resolver flags a wall `invalid` when BOTH its endpoints collapse into the SAME
        // junction cluster (a wall shorter than the 0.20 m V2 band, so both ends snap to one
        // node). Left in the footprint sweep it hinges both ends on one pivot → a bow-tie /
        // negative-area (inverted-normal) polygon: the founder's "black triangular spike" at
        // an L-corner that also receives a tiny stub. The LEGACY resolver's tighter (0.12 m)
        // cluster band does NOT flag this stub, so `joinData` above is clean and the check
        // misses it — the DEFAULT-ON V2 pipeline is exactly the path that renders it. Consult
        // the V2 miter cache HERE and skip the wall the SAME way as §WJR-INVALID (hide the
        // group, no fragment) so the degenerate stub never reaches the renderer / picking /
        // CSG. Reuses the shared `__wjrNaNHidden` / `__wjrInvalidLogged` latches, so a later
        // valid rebuild (stub grown) restores visibility via the block below. Only when V2 is
        // the active pipeline for this wall (escape hatch `__pryzmWallPipelineV2 = false`).
        if (isWallPipelineV2Enabled()) {
            const v2InvalidCache = this.getEffectiveV2Cache();
            if (v2InvalidCache?.getMiter(wall.id)?.invalid) {
                if (!wallGroup.userData.__wjrInvalidLogged) {
                    wallGroup.userData.__wjrInvalidLogged = true;
                    console.warn(
                        `[JunctionResolverV2] §FIX-WALL-CLUSTER-DEGENERATE skipped ${wall.id}: ` +
                        `both endpoints collapse into one junction cluster (degenerate stub) — mesh skipped`,
                    );
                }
                wallGroup.userData.__wjrNaNHidden = true;
                wallGroup.visible = false;
                return [];
            }
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

        // ── §WALL-Y-DATUM (L-968 defect A) — the group sits on the SEAT plane ──
        //
        // `resolvedY` is the wall's world BASE plane
        // (`level.elevation + slabBaseOffset + wall.baseOffset`, :745 / the restatement
        // in `WallRebuildCoordinator`). It used to be written straight onto the group
        // origin — and EVERY child is authored in the group-local convention
        // `y ∈ [baseOffset, baseOffset + height]` (`WallHoleBodyBuilder.ts:26`,
        // `MiterPrismBuilder.ts:99`, `CurvedWallLayerBuilder.ts:49`,
        // `LayeredWallOpeningBuilder.ts:206`, and the hosted frames at :3455/:3637).
        // So `wall.baseOffset` was applied at TWO levels of one transform hierarchy
        // and the body rendered at `elevation + slabBaseOffset + 2 × baseOffset`.
        // That doubling is why C84 §9's leaf-vs-hole delta carried a factor of 2.
        //
        // The group's origin is therefore the SEAT plane — the finished floor the wall
        // stands on — and `baseOffset` is applied exactly once, by the children that
        // already apply it. The alternative (strip `baseOffset` from ~14 local sites)
        // would have had to change the documented local convention in five files AND
        // the SpatialAuthority fallback below, which returns `elevation + baseOffset`;
        // this way both branches of `resolvedY` stay meaningful and unchanged.
        const _seatY = resolvedY - (wall.baseOffset ?? 0);
        wallGroup.position.set(start.x, _seatY, start.z);

        // PUBLISH the base plane for every world-space consumer that is NOT a child
        // of this group: the instanced body, the junction infill, and the hosted
        // door/window leaves in `@pryzm/geometry-door` / `@pryzm/geometry-window`
        // (which cannot read the slab store and so cannot re-derive it — see
        // `SlabWallCoupling`'s no-store-read contract).
        publishWallBaseY(wall.id, resolvedY);

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

        // §L934-ONE-WALL-ONE-COLOUR — condition 5, and it is a CORRECTNESS condition,
        // not a perf one. The instanced arm draws ONE unit box with ONE material
        // (`WallInstanceBridge.register` → `BoxGeometry(1,1,1)`), so it can only
        // represent a wall whose layer stack IS one box: zero layers, or one.
        //
        // MEASURED (L934LayeredJunctionMaterial.measure.test.ts): an UNJOINED
        // `wt-interior-partition` — plaster / stud / plaster, three DECLARED colours —
        // rendered as a single `#e8e8e8` box. All three declared colours were absent
        // from the scene. Join the same wall and its stack appears. The layer stack
        // was being silently discarded by the router, and because the router keys on
        // join data, a JUNCTION was what decided whether the user's own wall type was
        // drawn at all.
        //
        // Single-layer walls (`wt-monolithic`, the default a user draws with) still
        // instance — one box is a faithful drawing of them — so the ~70–85% figure
        // above is essentially untouched. They now take their colour FROM THE LAYER
        // (below), which is what makes the two arms agree by construction rather than
        // by two literals being kept in step by hand.
        const _layers = (wall as { layers?: { materialColor?: string }[] }).layers;
        const _layerCount = _layers?.length ?? 0;

        // §L955-INSTANCED-ARM-DROPS-RAKE (founder 2026-08-18) — A RAKED WALL LEAVES THE
        // INSTANCED PATH. This list tested five conditions and the rake was not among
        // them, while `WallInstanceBridge.register` reads `rakeAngleDeg` NOWHERE: a plain,
        // single-layer, opening-free, UNJOINED raked wall was drawn as an upright box
        // while the store held 80°. Measured before the fix — `register()` called once,
        // ZERO body vertices in the wall's group, so there was not even a wrong body to
        // correct: the shear could not run because the function that applies it
        // (`createWallBodyFragment`) was never reached.
        //
        // EXCLUDING IS THE HONEST FIX, NOT TEACHING THE BRIDGE TO SHEAR. GPU instancing
        // decomposes a world matrix into T·R·S and a shear is not expressible in TRS —
        // the same reason `WindowBuilder` keeps real meshes on a raked host (see
        // `WallRake.ts`, last bullet). So the bridge COULD not carry the lean without
        // per-instance geometry, which is the thing instancing exists to avoid. One
        // condition here routes the wall to the arm that already draws it correctly.
        //
        // THE PERF PROPERTY SURVIVES: `isVerticalRake` is TRUE for an absent, null or 90°
        // rake, which is every wall in every existing project, so the ~70-85% instanced
        // share is untouched. Only a genuinely leaning wall opts out, and it opts out to
        // be drawn RIGHT. Pinned both ways — a raked wall must NOT instance, a vertical
        // one MUST — so a later "optimisation" cannot quietly re-admit the raked case.
        // §WALL-PROFILE — condition 6, and it is a CORRECTNESS condition like condition 5.
        // The instanced arm draws a unit BoxGeometry positioned by ONE Matrix4 built as
        // translation × rotationY × scale (`WallInstanceBridge.ts:104-112`). A T·R·S product
        // cannot express a non-rectangular silhouette, so a profiled wall routed here would
        // render as a FULL RECTANGLE while the model said otherwise — the exact class of
        // defect `WallRake.ts:102` forbids ("a silently-wrong wall").
        //
        // INERT TODAY, DELIBERATELY. Nothing in the repo authors `wallProfile` yet, so this
        // condition never fires and the instanced baselines are unchanged — pinned by
        // §(A2a) of `WallProfileNonRegressionBaseline.test.ts`. It is added in the SAME slice
        // as the field rather than the slice that draws it, because the router is what
        // decides whether a profile is silently discarded, and a guard that arrives after
        // the field is a guard that arrives after the bug.
        //
        // ⚠ UPDATED AT INTEGRATION: this comment said "the identical guard for RAKE is
        // MISSING and that IS a live defect". It WAS, and it is now CLOSED — see the
        // §L955-INSTANCED-ARM-DROPS-RAKE block above, landed the same day from a sibling
        // lane. Two lanes reached this router independently, hours apart, each adding a
        // correctness exclusion for a different property, and each measuring the same
        // root: a T·R·S matrix cannot express what its property needs. Rake needs a
        // SHEAR; a profile needs a NON-RECTANGULAR SILHOUETTE. Neither is a product of
        // translate, rotate and scale.
        //
        // ⭐ THAT CONVERGENCE IS THE FINDING, and it is why both conditions belong here
        // rather than in one merged "isComplexWall" predicate: each states its own reason,
        // each is pinned both ways by its own suite, and a future property that also
        // cannot survive T·R·S gets a third line rather than a re-derivation.
        const _hasWallProfile = hasWallProfile(
            (wall as { wallProfile?: unknown }).wallProfile,
        );

        const isSimpleWall = (
            this._instanceBridge !== null &&
            !_hasOpenings &&
            !wall.curve &&
            !joinData?.startMN &&
            !joinData?.endMN &&
            isVerticalRake((wall as { rakeAngleDeg?: number }).rakeAngleDeg) &&
            _layerCount <= 1 &&
            !_hasWallProfile
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
            //
            // §INSTANCE-MAT-SHARE (2026-07-01) — share ONE material per distinct colour
            // (was: a fresh material per wall, which gave every wall a unique
            // material.uuid → a singleton InstanceGroup → zero draw-call savings). With
            // sharing, all identical-colour simple walls on a level collapse into one
            // InstancedMesh. See _getInstanceMaterial().
            //
            // §L934-ONE-WALL-ONE-COLOUR — `_layers?.[0]?.materialColor` is the new term,
            // and it is the one that closes the founder's defect. `_layerCount <= 1` is
            // guaranteed by `isSimpleWall`, so layer 0 IS the whole wall here, and the
            // layered arm at the other end of the router reads exactly the same field
            // first (`layer.materialColor ?? …`). The same wall therefore resolves to
            // the same colour whichever arm a junction sends it down — which is the
            // invariant that was missing, not the value of any one default.
            //
            // §L960-WHOLE-BODY-FINISH — the new FIRST term, and it is the one that
            // closes the founder's L-960. `resolveLayerRenderFinishColor` is reached
            // only from inside the per-layer BAND loops; a plain, one-layer, unjoined,
            // opening-free wall — the founder's — has no band and lands here, so it was
            // told "Done" and drawn unchanged. The finish is honoured HERE rather than
            // by excluding the wall from instancing (the L-955 rake fix) because a
            // COLOUR IS NOT A SHEAR: a shear is not expressible in a T·R·S instance
            // matrix, but a colour is just another material bucket, and
            // `_getInstanceMaterial` already shares one material per distinct colour.
            // Cost is one extra draw call per distinct FINISH, not per wall; excluding
            // would have taken the founder's whole ground floor off the instanced arm
            // to arrive at the identical pixels.
            //
            // It goes FIRST for the §L934-ONE-WALL-ONE-COLOUR reason: the layered arm's
            // expression is `sideOverride ?? layer.materialColor ?? wall.materialColor
            // ?? default` and consults no intent colour at all, so a finish already beats
            // everything there. The same wall must not change colour when a neighbour
            // mitres it and moves it to the other arm.
            const mat = this._getInstanceMaterial(
                resolveWholeBodyFinishColor(wall as never)
                ?? intentColour
                ?? _layers?.[0]?.materialColor
                ?? wall.materialColor
                ?? WALL_DEFAULT_BODY_COLOUR,
            );
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
            // around the openings, then add door/window frames that span the full wall
            // thickness. The existing miter-prism path (below) is used only when no
            // openings. (The comment here used to say "using BoxGeometry per layer";
            // `LayeredWallOpeningBuilder.buildContinuousLayerGeometry` punches a grid and
            // projects its caps onto the mitre plane. Corrected in passing — the stale
            // wording is quoted in `rakeAuthorability`'s refusal text, so leaving it
            // would have kept a false claim alive in two places.)
            if (wall.openings && wall.openings.length > 0) {
                // Cluster overlapping openings (shared helper; same algorithm as plain wall path)
                const clusters = clusterOpenings(wall.openings);

                // §STEP4: Convert JoinData → LayerMiterNormals shape for this helper.
                const _layOpenMN: import('./LayeredWallOpeningBuilder').LayerMiterNormals | undefined =
                    joinData ? { start: joinData.startMN, end: joinData.endMN } : undefined;

                // ── §FEAT-RAKE-LAYERED-OPENINGS (RK1, 2026-08-19) ─────────────────
                // This arm had NO SHEAR, and that was the whole content of
                // `rakeAuthorability`'s `layered` refusal: "a layered wall with an
                // opening is built by a different path … which has no shear, so the wall
                // would render VERTICAL while the model said 80". Measured and confirmed
                // true before this change (`RK1RakedCombinationMatrix.measure.test.ts`:
                // `layered3+window @80` leaned 0.000 m against an expected 0.529).
                //
                // The fix is the SAME THREE PIECES the other body paths already use, in
                // the same order, and it mints nothing new:
                //
                //   1. PLAN WIDTH — the bands are laid out at `t / sin θ`, inside
                //      `buildLayeredWallSegmentsAroundOpenings`, via the one
                //      `rakedPlanThickness`. A shear preserves plan width, so authoring
                //      the perpendicular width in plan would draw every band `sin θ` too
                //      thin.
                //   2. THE LEAN — `_applyRakeShearToChildren`, below, exactly as the
                //      plain opening-bearing arm does at `:2671`. One shear, one
                //      authority (`rakeShearPerMetre`); this arm does not spell `cot`.
                //   3. THE CORNER — the §L955-ONE-CORNER-RULE residual, from the SAME
                //      `rakeJointCapDrift` accessor the plain opening-bearing arm reads.
                //      Without it the body would lean correctly and the joint would be
                //      exact only at the floor, which is L-955's defect re-created on a
                //      fourth path.
                const _rkOpenShearK = rakeShearPerMetre(wall.rakeAngleDeg);
                // The uniform part the child matrix will contribute at the top ring.
                // `rakeTopOffset` is the ONE place this is computed — never a second cot().
                const _rkOpenUniform = rakeTopOffset(wall.rakeAngleDeg, wallHeight, {
                    x: direction.x, z: direction.z,
                });
                // §WALL-RAKE-JOINT-STALE-CACHE — the drift is a function of the rakes the
                // cache was REFRESHED with, so replaying it after the store moved THIS
                // wall's rake renders the PREVIOUS angle's joint (the L-813 shape). On a
                // mismatch, uniform shear at the CURRENT angle.
                //
                // ⚠ `rakeIsFreshFor` AND NOT A HAND-ROLLED COMPARISON. The first draft here
                //   spelled the test out — `rakeUsedFor(id)` differenced against
                //   `resolveRakeDeg(...)` within 1e-9 — which is exactly the duplication
                //   `20d21d25` ("the staleness test was spelled three times — fold it onto
                //   the cache") had just removed. It would have been a FOURTH copy of a
                //   predicate whose whole point is that its three consumers cannot disagree.
                //   The cache owns the epsilon (`RAKE_DEG_IDENTITY`) and the normalisation
                //   of "absent" to 90°; nothing out here re-derives either.
                const _rkOpenCache = this.getEffectiveV2Cache();
                const _rkOpenFresh = _rkOpenCache?.rakeIsFreshFor(wall.id, wall.rakeAngleDeg) ?? false;
                const _rkOpenCapTotal = (isWallPipelineV2Enabled() && _rkOpenFresh)
                    ? (_rkOpenCache?.rakeJointCapDrift(wall.id, wallHeight) ?? null)
                    : null;
                // The stack's PLAN half-width — the same conversion the band walk uses, so
                // the interpolation parameter below cannot disagree with the bands it is
                // interpolating across.
                const _rkOpenPlanHalf = rakedPlanThickness(totalThickness, wall.rakeAngleDeg) / 2;
                // THE INTERPOLATION, and why it is exact rather than an approximation: the
                // mitre plane is PLANAR and VERTICAL (`buildMiterPrism.project()` solves in
                // XZ and never writes y), so a lofted top-cap displacement varies LINEARLY
                // across the stack between the wall's own two face drifts. `outward` is
                // `leftPerp(direction)`, so `z = +planHalf` is the LEFT face and
                // `z = -planHalf` the RIGHT — the same left every other wall module uses.
                const _rkOpenDrift: import('./LayeredWallOpeningBuilder').TopCapDrift | null =
                    _rkOpenCapTotal
                        ? (atStart: boolean, z: number) => {
                            if (!(_rkOpenPlanHalf > 0)) return null;
                            const t = Math.max(0, Math.min(1, (z + _rkOpenPlanHalf) / (2 * _rkOpenPlanHalf)));
                            const R = atStart ? _rkOpenCapTotal.startRight : _rkOpenCapTotal.endRight;
                            const L = atStart ? _rkOpenCapTotal.startLeft  : _rkOpenCapTotal.endLeft;
                            const tx = R.x + (L.x - R.x) * t;
                            const tz = R.z + (L.z - R.z) * t;
                            // RESIDUAL = total − uniform, so that residual + uniform sums
                            // to the loft exactly once (§L955-ONE-CORNER-RULE):
                            //     final = base + (capDrift − uniform) + uniform = base + capDrift
                            return _rkOpenUniform
                                ? { x: tx - _rkOpenUniform.x, z: tz - _rkOpenUniform.z }
                                : { x: tx, z: tz };
                        }
                        : null;

                // Build per-layer wall-body segments around openings
                const segmentMeshes = buildLayeredWallSegmentsAroundOpenings(
                    wall,
                    wallGroup,
                    clusters,
                    totalThickness,
                    _layOpenMN,
                    _rkOpenDrift,
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
                            // §FEAT-RAKE-LAYERED-OPENINGS — the outline must trace the
                            // PLAN footprint the bands were just laid out on, or the
                            // silhouette floats `sin θ` inside its own wall.
                            _rkOpenPlanHalf, wallHeight, wallBaseOffset,
                            _layOpenMN?.start ?? null, _layOpenMN?.end ?? null,
                        );
                        outlineEdges = buildWallEdgeOverlay(outlineGeo, wall.id);
                        outlineEdges.position.set(0, 0, 0);
                        outlineGeo.dispose();
                    } else {
                        const outlineGeo = new THREE.BoxGeometry(wallLength, wallHeight, _rkOpenPlanHalf * 2);
                        outlineEdges = buildWallEdgeOverlay(outlineGeo, wall.id);
                        const wallAngle = Math.atan2(direction.z, direction.x);
                        const centerOffset = direction.clone().multiplyScalar(wallLength / 2);
                        outlineEdges.position.set(centerOffset.x, wallHeight / 2 + wallBaseOffset, centerOffset.z);
                        outlineEdges.rotation.set(0, -wallAngle, 0);
                        outlineGeo.dispose();
                    }
                    wallGroup.add(outlineEdges);
                }

                // ── §FEAT-RAKE-LAYERED-OPENINGS — THE LEAN ────────────────────────
                // Every child is in the group by now: the per-layer band meshes, the
                // door/window frames, and the outline overlay. Shearing the GROUP'S
                // CHILDREN leans all of them together about the wall's base plane, which
                // is what makes the solid, the void, the reveals and the frames one
                // coherent raked wall rather than a leaning body with upright holes in it.
                //
                // This is the SAME call the plain opening-bearing arm makes at `:2671`
                // with the SAME arguments, and it is a provable no-op at 90°: the method
                // returns before touching a single child when `k === 0`, so a vertical
                // layered wall with openings is byte-identical including its matrix flags.
                //
                // ⚠ IT MUST STAY LAST. `_applyRakeShearToChildren` premultiplies each
                // child's composed matrix and disables `matrixAutoUpdate`; anything added
                // afterwards would be the one upright child in a leaning wall.
                this._applyRakeShearToChildren(
                    wallGroup, wall, _rkOpenShearK, direction, wallBaseOffset,
                );

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

            // §FEAT-RAKE-LAYERED — the LEGACY prism walk is a PLAN-space walk, so its
            // cursor and its per-layer half-thickness must both be plan quantities. At 90°
            // `rakedPlanThickness` is the identity, so `_layerPlanT` === the authored
            // thicknesses and `_totalPlanThickness` === `totalThickness`, term for term.
            const _layerPlanT: number[] = wall.layers.map(
                (l: any) => rakedPlanThickness(l.thickness, wall.rakeAngleDeg),
            );
            const _totalPlanThickness = _layerPlanT.reduce((s: number, t: number) => s + t, 0);
            let cursor = -_totalPlanThickness / 2;

            // §STEP4: read directly from the joinData parameter — no cache.
            const startMN = joinData?.startMN ?? null;
            const endMN   = joinData?.endMN   ?? null;

            // ── §FIX-LAYERED-WALL-V2-PARITY (founder 2026-08-06, ADR-0298) ──────────────
            // Until now this branch was the ONLY geometry a straight layered wall ever got:
            // one legacy `buildMiterPrism` per layer, capped on the legacy WallJoinResolver
            // miter normals. `createWallBodyFragment` — the sole call site of the ADR-0055
            // V2 chain — is never reached from here (this branch returns above it), so a
            // layered wall was the one wall on the level solving its corners with a
            // DIFFERENT resolver from its neighbours. A per-wall miter-plane projection has
            // no cross-wall non-overlap property; V2's ring sweep does, by construction.
            //
            // MEASURED on the founder's scene (two 0.30 m arms mitred at the origin + a
            // layered partition co-terminating on the corner; 2 mm grid sampler, see
            // `LayeredWallCornerClash.test.ts`): legacy 2 520 mm² of doubled solid at 0.10 m
            // thickness and 35 112 mm² at 0.375 m, versus 0 mm² through V2.
            //
            // So: take the SAME V2 footprint the plain path takes, and slice it into
            // per-layer bands (`WallLayerFootprint2D`, pure 2-D). Every band is a SUBSET of
            // the footprint, so the junction non-overlap is INHERITED rather than
            // re-derived — there is no second miter solver left to disagree with the first.
            // Band lateral extents reproduce the `cursor` walk below exactly, so no layer
            // moves sideways; only the mitred ENDS change.
            //
            // ALL-OR-NOTHING: if any band fails the spike guard, the whole wall falls back
            // to the legacy prisms. A stack must never mix the two frames — a half-migrated
            // layer stack is worse than a uniformly-legacy one.
            //
            // ── §FEAT-RAKE-LAYERED (founder 2026-08-18) ────────────────────────────────
            // "In parallel I need LAYERED walls to work with RAKED walls too."
            //
            // THIS is the arm that makes it true, and it is true here and only here: the
            // legacy fallback below shears its prisms but cannot inherit the V2 corners,
            // and the openings arm above is still REFUSED at `rakeAuthorability`.
            //
            // Three coupled changes, none of which works alone:
            //   1. the footprint is built at the wall's RAKED PLAN thickness
            //      (`effectivePlanThickness` — `Σt / sin θ`), the same number
            //      `WallPipelineV2Cache.refresh` mitred with, so the polygon is in ONE frame;
            //   2. the bands are cut at `t / sin θ` each (`buildWallLayerBands(..., rake)`),
            //      so every layer's PERPENDICULAR thickness comes out as authored;
            //   3. each band is extruded with the wall's `topOffset`, so the band is a
            //      SHEARED prism rather than a vertical one.
            // Drop (1) and the outer bands are clipped away by a too-narrow polygon; drop
            // (2) and the layers are the wrong thickness; drop (3) and the wall renders
            // vertical while the model says 80 — the worst of the three.
            //
            // Vertical walls: `rakeTopOffset` returns null and `rakedPlanThickness` is the
            // identity at 90°, so every expression below evaluates to its pre-existing value.
            const _layRake = wall.rakeAngleDeg;
            const _layIsRaked = !isVerticalRake(_layRake);
            let v2LayerGeoms: Array<THREE.BufferGeometry> | null = null;
            {
                const _layCache = this.getEffectiveV2Cache();
                const _layMiter = _layCache?.getMiter(wall.id) ?? null;
                if (isWallPipelineV2Enabled() && _layCache && _layMiter && !_layMiter.invalid) {
                    // §V2-PRETRIM-FIX frame (see createWallBodyFragment): V2's corners are
                    // solved against the PRE-trim baselines, so the footprint defaults must
                    // be built in that same frame or the polygon zig-zags between two frames.
                    const _srcBL = (wall as unknown as {
                        _sourceBaseLine?: ReadonlyArray<{ x: number; z: number }>;
                    })._sourceBaseLine;
                    const _preS = _srcBL?.[0] ?? wall.baseLine[0];
                    const _preE = _srcBL?.[1] ?? wall.baseLine[1];
                    const _fp = buildWallFootprint(
                        {
                            id: wall.id,
                            start: { x: _preS.x, z: _preS.z },
                            end:   { x: _preE.x, z: _preE.z },
                            // §FEAT-RAKE-LAYERED (1) — the RAKED plan width. Identical to
                            // `wall.thickness` at 90° and for every non-layered wall.
                            thickness: effectivePlanThickness({
                                thickness: wall.thickness,
                                rakeAngleDeg: _layRake,
                                layered: wall.layers.length > 1,
                            }),
                            systemTypeId: wall.systemTypeId,
                        },
                        _layMiter,
                    );
                    // §FEAT-RAKE-LAYERED (3) — the uniform shear for this wall. It remains
                    // the FALLBACK (and is byte-identical at 90°, where it is null).
                    const _layTopOffset = rakeTopOffset(_layRake, wallHeight, _fp.direction);
                    const _layThicknesses = wall.layers.map((l: any) => l.thickness);
                    const _bands = buildWallLayerBands(
                        _fp,
                        _layThicknesses,
                        // §FEAT-RAKE-LAYERED (2) — `t / sin θ` per layer.
                        _layRake,
                    ).bands;
                    // ── §L955-ONE-CORNER-RULE (founder 2026-08-18) ─────────────────────
                    // This block used to read "Deliberately NOT the per-vertex ADR-0312
                    // loft: `rakedTopOffsets` is index-aligned with the WALL polygon, and a
                    // BAND polygon has different vertices … so consuming it here would pair
                    // offsets with the wrong corners." Every clause was TRUE of
                    // `rakedTopOffsets`; the conclusion — take the uniform shear instead —
                    // is what the founder photographed. A layered raked wall placed its
                    // shared top corner by a DIFFERENT RULE from its plain raked neighbour,
                    // so the two ends agreed only at the floor and parted company upward:
                    // the wedge of daylight, widening with height, with a spike at the top.
                    //
                    // The answer is not to pair the WALL polygon's offsets with a band; it
                    // is to run the SAME twin solve on the BAND decomposition —
                    // `rakedLayerBandTopOffsets` slices the probe footprint with the same
                    // thicknesses and the same rake, so band vertex i has a genuine twin.
                    // Null (topology bifurcated, drift out of bounds, unknown wall, or an
                    // unraked level) ⇒ `topOffsets` is null and the uniform shear runs
                    // exactly as before, so a vertical layered wall stays byte-identical.
                    //
                    // §WALL-RAKE-JOINT-STALE-CACHE applies here for the same reason it
                    // applies in `buildWallV2Geometry`: the offsets are a function of the
                    // rakes the cache was REFRESHED with, so replaying them after the store
                    // moved THIS wall's rake would render the previous angle's joint. On a
                    // mismatch, uniform shear at the CURRENT angle.
                    const _bandOffsets = _layCache.rakeIsFreshFor(wall.id, _layRake)
                        ? _layCache.rakedLayerBandTopOffsets(
                            wall.id, _fp, _layThicknesses, _layRake, wallHeight,
                        )
                        : null;
                    // Same envelope test as §V2-SPIKE-GUARD / §LEGACY-SPIKE-GUARD, applied
                    // per band. A real layer body never exceeds the wall's own footprint.
                    const _baseLen = Math.hypot(
                        wall.baseLine[1].x - wall.baseLine[0].x,
                        wall.baseLine[1].z - wall.baseLine[0].z,
                    );
                    // §FEAT-RAKE-LAYERED — the guard measures the band's PLAN bounding box,
                    // and a sheared band legitimately overhangs its base by
                    // `height · |cot θ|`. Without this term every raked layered wall would
                    // trip the spike guard and fall back to the legacy prisms — i.e. the
                    // feature would silently not apply. 0 for a vertical wall.
                    // §L955-ONE-CORNER-RULE — a LOFTED corner can legitimately travel FARTHER
                    // than the wall's own shear (two opposing rakes meeting at a shallow plan
                    // angle push the shared mitre corner out along the mitre line), exactly as
                    // §V2-SPIKE-GUARD already records for the plain path — which is why that
                    // guard budgets with `maxTopDriftM` rather than with `rakeLateralShift`
                    // alone. Budget with the ACTUAL worst band drift for the same reason: a
                    // guard that rejects the correct geometry sends the whole stack to the
                    // legacy prisms, i.e. reinstates the defect it was asked to prevent.
                    const _maxBandDrift = _bandOffsets
                        ? Math.max(0, ...(_bandOffsets.flat().map(o => Math.hypot(o.x, o.z))))
                        : 0;
                    const _maxExtent =
                        _baseLen + wall.thickness + 1.0
                        + Math.max(rakeLateralShift(_layRake, wallHeight), _maxBandDrift);
                    const _geoms: THREE.BufferGeometry[] = [];
                    let _ok = _bands.length === wall.layers.length;
                    for (let _bi = 0; _bi < _bands.length; _bi++) {
                        const b = _bands[_bi]!;
                        if (!_ok) break;
                        if (b.polygon.length < 3) { _ok = false; break; }
                        const _bandTop = _bandOffsets?.[_bi] ?? null;
                        const g = buildWallExtrusion(
                            { ...(_fp as any), polygon: b.polygon },
                            {
                                height: wallHeight, baseOffset: wallBaseOffset, elevation: 0,
                                // §L955-ONE-CORNER-RULE — the per-vertex loft when the twin
                                // solve produced one for THIS band; the uniform shear when it
                                // honestly degraded. `buildWallExtrusion` prefers `topOffsets`
                                // only when it is index-aligned and finite, so a disagreement
                                // between the two is ignored rather than thrown.
                                topOffset: _layTopOffset,
                                topOffsets: _bandTop,
                            },
                        );
                        // World-XZ → wallGroup-local (the group sits at the POST-trim start).
                        g.translate(-wall.baseLine[0].x, 0, -wall.baseLine[0].z);
                        g.computeBoundingBox();
                        const bb = g.boundingBox;
                        const finite = !!bb
                            && Number.isFinite(bb.min.x) && Number.isFinite(bb.max.x)
                            && Number.isFinite(bb.min.z) && Number.isFinite(bb.max.z);
                        const diag = finite ? Math.hypot(bb!.max.x - bb!.min.x, bb!.max.z - bb!.min.z) : Infinity;
                        if (!finite || diag > _maxExtent) { _ok = false; (g as any).dispose?.(); break; }
                        _geoms.push(g);
                    }
                    if (_ok) {
                        v2LayerGeoms = _geoms;
                    } else {
                        for (const g of _geoms) (g as unknown as { dispose?: () => void }).dispose?.();
                        // eslint-disable-next-line no-console
                        console.warn(
                            `[WallFragmentBuilder] §FIX-LAYERED-WALL-V2-PARITY wall ${wall.id}: ` +
                            `a layer band failed the spike guard — falling back to legacy MiterPrism for the whole stack`,
                        );
                    }
                }
            }

            wall.layers.forEach((layer: any, layerIdx: number) => {
                // §FEAT-RAKE-LAYERED — plan width of this layer (`t / sin θ`; `t` at 90°).
                const _planT = _layerPlanT[layerIdx]!;
                const layerCenter = cursor + _planT / 2;
                cursor += _planT;

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

                // §FIX-LAYERED-WALL-V2-PARITY — the V2 band when the pipeline produced a
                // full, guard-passing stack for this wall; otherwise the legacy prism.
                let geom: THREE.BufferGeometry;
                if (v2LayerGeoms) {
                    geom = v2LayerGeoms[layerIdx]!;   // already sheared by the extruder
                } else {
                    geom = buildMiterPrism(
                        worldStart,
                        worldEnd,
                        centerlineStart,           // Miter planes at centerline
                        centerlineEnd,             // Miter planes at centerline
                        _planT / 2,                // §FEAT-RAKE-LAYERED — half PLAN width
                        wallHeight,
                        wallBaseOffset,
                        startMN,
                        endMN,
                    );
                    // §FEAT-RAKE-LAYERED — THE LEGACY ARM MUST NOT RENDER A RAKED WALL
                    // VERTICAL. `buildMiterPrism` extrudes straight up; left alone, a raked
                    // layered wall that fell back here (V2 disabled, no miter, or a band that
                    // tripped the spike guard) would have stood up straight while the store
                    // held 80° — a silently-wrong wall, which is the one outcome this
                    // subsystem refuses to ship (§FIX-RAKE-REFUSAL-IS-NOT-A-CRASH).
                    //
                    // A rake is an affine SHEAR about the wall's base plane, so it applies to
                    // an already-built prism exactly: x += kx·(y − yBase), z += kz·(y − yBase).
                    // `applyMatrix4` carries the normals through the inverse-transpose, so the
                    // tilted faces light correctly. `rakeTopOffset(rake, 1, dir)` is the shear
                    // PER METRE of height and is null for a vertical wall — which is why this
                    // whole block is skipped at 90° rather than multiplying by an identity
                    // (a no-op matrix would still rewrite every float; skipping keeps a
                    // vertical layered wall byte-identical).
                    if (_layIsRaked) {
                        const _k = rakeTopOffset(wall.rakeAngleDeg, 1, {
                            x: centerlineEnd.x - centerlineStart.x,
                            z: centerlineEnd.z - centerlineStart.z,
                        });
                        if (_k) {
                            const _y0 = wallBaseOffset;
                            geom.applyMatrix4(new THREE.Matrix4().set(
                                1, _k.x, 0, -_k.x * _y0,
                                0, 1,    0, 0,
                                0, _k.z, 1, -_k.z * _y0,
                                0, 0,    0, 1,
                            ));
                        }
                    }
                }

                // §L934-ONE-WALL-ONE-COLOUR — was a local `'#d4c5b0'`. §BEIGE-WALL-FIX
                // purged that beige from the instanced arm in 2026-06 and never reached
                // here, so the two arms of one router disagreed for fourteen months.
                // §FEAT-WALL-SIDE-FINISH — rung 1 of the ladder, applied at the ONE place
                // the layer band's colour is decided. `layers[0]` is the exterior-most
                // band and `layers[n-1]` the interior-most (authored EXTERIOR-FIRST; the
                // builder lays them out from cursor = -totalThickness/2 along `outward`),
                // so this is an AUTHORED mapping, never a normal or winding-order guess.
                // `null` leaves today's expression byte-identical — zero regression on
                // every wall that has no side finish authored, which is all of them today.
                const sideOverride = resolveLayerRenderFinishColor(
                    wall as any, layerIdx, wall.layers!.length,
                );
                const matColor = sideOverride ?? layer.materialColor ?? wall.materialColor ?? WALL_DEFAULT_BODY_COLOUR;
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
        // ── §FEAT-HOSTED-ON-CURVED-WALL — curved host WITH openings ──────────────
        // The comment above ("Openings are deferred — curved walls enforce
        // openings:[]") described the pre-feature state. A curved wall is now a
        // first-class host: it is carved by RADIAL BANDS along the arc rather than
        // built as one unbroken solid. Handles both the plain and the LAYERED
        // curved paths, so neither is silently left behind. Escape hatch:
        // `__pryzmHostedOnCurvedWall = false` restores the uncarved solid.
        // ── §FEAT-WALL-PROFILE-BODY (L-1067) — the ring is DRAWN ─────────────────
        //
        // Placed FIRST among the body arms, because a profile changes the wall's
        // ELEVATION OUTLINE and every arm below assumes the implicit rectangle. Slices 0
        // and 1 shipped the model, the gate, persistence, invalidation, the geometry hash
        // and an instanced-arm exclusion — and NO body builder read the ring, so a
        // profiled wall rebuilt, left the instanced path, and rendered the identical
        // rectangle. The founder asked for the mode three times.
        //
        // `profileAuthorability` refuses curved, layered and opening-bearing walls, so
        // what reaches here is a plain straight wall, vertical or RAKED. The rake needs no
        // term here: the ring is authored in the UN-SHEARED frame (`WallTypes.ts`: *"both
        // measured in the UN-SHEARED frame, so a profile and a rake compose"*), and
        // `_applyRakeShearToChildren` below leans the built group exactly as it does the
        // opening-bearing body. The two compose by construction rather than by arithmetic
        // written twice.
        //
        // ✅ THE MITRE IS BUILT — §FEAT-WALL-PROFILE-MITRE (WJ1, L-1071). This comment used
        //    to read "⛔ NO MITRE … an extruded outline has no per-end plane to project
        //    onto", inherited from `buildWallHoleBodyGeometry`. It was the wrong FRAME
        //    rather than a real constraint: a wall mitre plane is VERTICAL, so in the
        //    wall-local frame the profile body is already built in, the plane is
        //    `x = x0 − (n_lat/n_axial)·z` with no `y` in it — a per-vertex shear the
        //    extruded outline takes fine. `joinData`'s normals are handed straight in;
        //    absent them the ends stay perpendicular and the geometry is unchanged.
        //
        // ⚠ A CURVED PROFILED WALL DOES NOT COME HERE (§FEAT-WALL-PROFILE-CURVED,
        //   L-1072). This arm extrudes a FLAT `THREE.Shape` through the thickness; an arc
        //   has no such plane. Its profile is applied where its body is actually built —
        //   as a per-station top/bottom on the swept solid, below. Routing it here would
        //   have drawn a straight wall in place of the arc, which is worse than the
        //   refusal it replaces because it draws something plausible.
        if (_hasWallProfile && !(wall.curve && isArcHost(wall))) {
            const _profile = resolveWallProfile((wall as { wallProfile?: unknown }).wallProfile);
            const _pGeo = _profile
                ? buildWallProfileBodyGeometry({
                    ring: _profile.ring, thickness: wallThickness, baseOffset: wallBaseOffset,
                    // The SAME normals every other body arm consumes, in the SAME world
                    // frame; the builder rotates them into its own frame with `direction`,
                    // which is the same unit vector the mesh's `−angle` rotation encodes.
                    startMN: joinData?.startMN ?? null,
                    endMN: joinData?.endMN ?? null,
                    direction: { x: direction.x, z: direction.z },
                })
                : null;
            if (_pGeo) {
                const _pMesh = new THREE.Mesh(_pGeo, this.createWallMaterial(wall));
                // Same frame hand-off as the hole-extrude body: built axis-aligned with
                // local-x along the wall, rotated by −angle about the group origin.
                _pMesh.position.set(0, 0, 0);
                _pMesh.rotation.set(0, -Math.atan2(direction.z, direction.x), 0);
                _pMesh.userData = {
                    id: wall.id,
                    materialId: wall.materialId,
                    materialColor: wall.materialColor,
                    elementType: 'WallPart',
                    modelId: 'model-default',
                    role: 'geometry',
                    selectable: false,
                    wallId: wall.id,
                    parentId: wall.id,
                    profileBody: true,
                };
                wallGroup.add(_pMesh);
                wallGroup.add(buildWallEdgeOverlay(_pGeo, wall.id));

                const _pFragId = crypto.randomUUID();
                this.fragments.set(_pFragId, {
                    id: _pFragId, wallId: wall.id, mesh: _pMesh as any,
                    type: 'wall-body', parentId: wall.id, levelId: wall.levelId,
                });
                this.fragmentToEntityMap.set(_pFragId, {
                    fragmentId: _pFragId, elementId: wall.id,
                    type: 'wall', entityType: 'wall', entityId: wall.id,
                });
                fragmentIds.push(_pFragId);

                // The rake, applied to the built group — the ring is un-sheared, this
                // leans it. No-op at 90° (the method returns before touching a child).
                this._applyRakeShearToChildren(
                    wallGroup, wall,
                    rakeShearPerMetre((wall as { rakeAngleDeg?: number }).rakeAngleDeg),
                    direction, wallBaseOffset,
                );
                this._syncMutableWallUserData(wallGroup, wall);
                this.wallToFragmentsMap.set(wall.id, fragmentIds);
                return fragmentIds;
            }
            // A ring that cannot make a solid falls through to the rectangular body
            // rather than emitting nothing (SPEC §4: never an empty wall). The gate
            // refuses such rings at every write boundary, so reaching here means the
            // model was mutated behind it.
        }

        if (wall.curve && isArcHost(wall) && wall.openings && wall.openings.length > 0) {
            const built = this._buildCurvedWallWithOpenings(
                wall, wallGroup, fragmentIds, start, end,
                wallThickness, wallHeight, wallBaseOffset, joinData, renderMap,
            );
            if (built) {
                this.wallToFragmentsMap.set(wall.id, fragmentIds);
                return fragmentIds;
            }
            // Fell through (degenerate geometry) — continue to the uncarved solid
            // rather than emitting nothing (SPEC §4: never an empty wall).
        }

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

            // ── §FEAT-RAKE-CURVED + C85 W-G-3 — ONE curved builder, not two ───────
            //
            // WHAT STOOD HERE: ~160 lines that recomputed the stations, the Bézier cap
            // tangents, the outer/inner corner tables, the miter projection, all six face
            // groups and both caps — a VERBATIM re-derivation of
            // `CurvedWallLayerBuilder.buildCurvedLayerGeometry`, which the LAYERED arm
            // fifty lines below already calls. C84 EI-9 and C85 W-G-3 both name this fork;
            // C85 §10 records it as a LIVE FORK "split by a layer-count branch".
            //
            // WHY IT IS COLLAPSED NOW RATHER THAN LATER: the conical sweep is ONE RULE, and
            // a fork means writing it twice. Two copies of "where is the top edge of a
            // raked arc?" is the same defect shape as L-955's three body builders
            // disagreeing at the corner — and a plain curved wall and a layered curved wall
            // that leaned by different rules would meet at exactly the joint the founder
            // asked to be sound. Deduplicating was cheaper than auditing the divergence.
            //
            // A plain wall is passed as a SINGLE synthetic band at offset 0 whose thickness
            // is the wall's own. The shared builder's station computation, tangent formulas
            // and projection are character-identical to what stood here, so this is expected
            // to be vertex-for-vertex unchanged at 90° — asserted, not assumed, by
            // `P3-curved-plain` in `WallProfileNonRegressionBaseline`.
            let stations = computeStations(start, end, ctrl, wall.curve.segments);

            // ── §FEAT-WALL-PROFILE-CURVED (WJ1, L-1072) ───────────────────────────
            //
            // THE REFUSAL THIS LIFTS, VERBATIM: *"a straight profile edge is not straight
            // in space, so every edge would have to be tessellated per station and the
            // curved builder has no per-station top."* Both clauses name MISSING CODE.
            // This is that code, and it is eleven lines, because everything it needs
            // already existed:
            //   · `u` on an arc means ARC LENGTH — `WallArcParam` has said so since the
            //     hosted-on-curved work, and `stationArcLengths` measures the very
            //     polyline the solid is made of;
            //   · "tessellated per station" is `insertStationsAt`, the same surgery
            //     `sliceStations` does for an opening jamb;
            //   · "no per-station top" is now `CurvedProfileHeights`.
            //
            // ⭐ THE CHORD IS NOT THE ARC, and this is the one place that could have gone
            //   silently wrong. `wallProfilePlanarLength` — which the authorability gate
            //   uses for its `u ∈ [0, L]` bound — is `Math.hypot` on the two endpoints,
            //   i.e. the CHORD. On an arc the chord is SHORTER than the run, so a ring
            //   authored across the full wall would be evaluated against the wrong `L`
            //   and every profile would end early. The gate is corrected in `WallProfile`
            //   to use the arc; this evaluation uses the station polyline, which is the
            //   same number by construction.
            let _profileY: CurvedProfileHeights | null = null;
            if (_hasWallProfile) {
                const _ring = resolveWallProfile((wall as { wallProfile?: unknown }).wallProfile)?.ring;
                if (_ring && _ring.length >= 3) {
                    const _cum0 = stationArcLengths(stations);
                    stations = insertStationsAt(stations, _cum0, wallProfileVertexUs(_ring));
                    const _cum = stationArcLengths(stations);
                    const _topY: number[] = [];
                    const _botY: number[] = [];
                    for (let i = 0; i < stations.length; i++) {
                        const ext = wallProfileExtentAt(_ring, _cum[i]!);
                        // A station the ring does not cover keeps the flat planes rather
                        // than collapsing to zero height: a hole in the middle of a wall
                        // is not something a single-interval sweep can express, and
                        // drawing nothing there would be a silent, invisible refusal.
                        _topY.push(ext ? wallBaseOffset + ext.top : wallBaseOffset + wallHeight);
                        _botY.push(ext ? wallBaseOffset + ext.bottom : wallBaseOffset);
                    }
                    _profileY = { topY: _topY, botY: _botY };
                }
            }

            const curvedStartMN = joinData?.startMN ?? null;
            const curvedEndMN   = joinData?.endMN   ?? null;

            // §CURVED-STRAIGHT-FIX: exact quadratic-Bézier tangents at the arc endpoints
            // (t=0: normalize(ctrl − start); t=1: normalize(end − ctrl)) — the same formula
            // `WallJoinResolver._wallDirAtJoin` uses, so miter normal and projection
            // direction come from identical tangents.
            const _stDx = ctrl.x - start.x, _stDz = ctrl.z - start.z;
            const _stL  = Math.sqrt(_stDx * _stDx + _stDz * _stDz) || 1;
            const _edDx = end.x - ctrl.x, _edDz = end.z - ctrl.z;
            const _edL  = Math.sqrt(_edDx * _edDx + _edDz * _edDz) || 1;

            const geom = buildCurvedLayerGeometry(
                { name: 'body', function: 'structure', thickness: wallThickness } as WallLayer,
                0,
                stations,
                wallHeight,
                wallBaseOffset,
                wallThickness / 2,
                curvedStartMN,
                curvedEndMN,
                { x: _stDx / _stL, z: _stDz / _stL },
                { x: _edDx / _edL, z: _edDz / _edL },
                // §FEAT-RAKE-CURVED — the datum is the WALL's base plane, the same one
                // `_applyRakeShearToChildren` measures the straight shear from.
                // §FEAT-RAKE-CURVED-JOINT — and the lofted cap, so the corner is placed by
                // the same rule the neighbour uses rather than only meeting it at the floor.
                {
                    angleDeg: wall.rakeAngleDeg,
                    datumY: wallBaseOffset,
                    capDrift: this._curvedCapDrift(wall, wallHeight),
                },
                // §FEAT-WALL-PROFILE-CURVED — null on every unprofiled wall, and the
                // builder then never allocates the arrays: byte-identical geometry.
                _profileY,
            );

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

            // ── §FEAT-RAKE-CURVED — PERPENDICULAR (authored) → RADIAL, once ───────
            // Identical in kind to the straight layered arms: an authored layer thickness
            // is a PERPENDICULAR measurement, and a raked band occupies `t / sin θ` across
            // the wall — here measured RADIALLY rather than in plan-normal, because on an
            // arc "across the wall" IS the radius. One conversion
            // (`WallRake.rakedPlanThickness`), no local trigonometry. Identity at 90°, so
            // a vertical curved layered wall is byte-identical.
            const _curvedRake = (wall as { rakeAngleDeg?: number }).rakeAngleDeg;
            // §FEAT-RAKE-CURVED-JOINT — resolved ONCE for the whole stack; every band
            // interpolates the same four corners across its own radius.
            const _curvedCapDriftL = this._curvedCapDrift(wall, wallHeight);
            const totalThickness = wall.layers.reduce((s: number, l: any) => s + l.thickness, 0);
            let cursor = -rakedPlanThickness(totalThickness, _curvedRake) / 2;

            wall.layers.forEach((layer: any, layerIdx: number) => {
                const _bandRadial = rakedPlanThickness(layer.thickness, _curvedRake);
                const layerCenter = cursor + _bandRadial / 2;
                cursor += _bandRadial;

                const halfT = _bandRadial / 2;
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
                    _layeredEndCapTan,
                    { angleDeg: _curvedRake, datumY: wallBaseOffset, capDrift: _curvedCapDriftL },
                );

                // §L934-ONE-WALL-ONE-COLOUR — the curved-layered twin of the straight
                // arm above; same beige, same omission from §BEIGE-WALL-FIX.
                // §FEAT-WALL-SIDE-FINISH — rung 1 of the ladder, applied at the ONE place
                // the layer band's colour is decided. `layers[0]` is the exterior-most
                // band and `layers[n-1]` the interior-most (authored EXTERIOR-FIRST; the
                // builder lays them out from cursor = -totalThickness/2 along `outward`),
                // so this is an AUTHORED mapping, never a normal or winding-order guess.
                // `null` leaves today's expression byte-identical — zero regression on
                // every wall that has no side finish authored, which is all of them today.
                const sideOverride = resolveLayerRenderFinishColor(
                    wall as any, layerIdx, wall.layers!.length,
                );
                const matColor = sideOverride ?? layer.materialColor ?? wall.materialColor ?? WALL_DEFAULT_BODY_COLOUR;
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
                // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): `op.offset` is the LEFT
                // EDGE of the opening span [offset, offset+width] along the baseline
                // (the convention used by every producer, the door/window tools, the
                // occupancy store, and C15 §2 voidStart=offset). The void span and the
                // frame centre below are BOTH derived from this left edge so they stay
                // aligned. (Previously this treated offset as the centre, shifting a
                // "centred" door ~width/2 toward baseLine[0].)
                const left = op.offset;
                const right = op.offset + op.width;

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

            // ── §WALL-RAKE-JOINT-OPENING-HOST (founder 2026-08-10) ──────────────
            //
            // THE DEFECT: "when the user creates a door on the ADJACENT wall the wall
            // joint goes out" — the raked mitre that was clean before the door reverts
            // to the un-lofted (ADR-0310) state, a notch/step at the TOP of the corner.
            //
            // PROVEN MECHANISM, and it is NOT an invalidation bug (the whole-level
            // flush and `refreshV2Cache` both run: an opening ADD changes the opening
            // SET, so `classifyWallDelta` already returns `whole-level`). It is a
            // MISSING CONSUMER. The ADR-0312 twin-solve loft is applied in exactly one
            // place — `buildWallV2Geometry`, reached only from `createWallBodyFragment`,
            // which this method calls ONLY in the `wall.openings.length === 0` branch
            // above. The moment a wall hosts an opening its body is rebuilt as segments
            // around the holes, and its mitred END segments come from
            // `buildMiterPrism`, which had no way to express a lofted top. So the
            // opening did not invalidate anything: it MOVED THE WALL ONTO A BODY PATH
            // THAT CANNOT CARRY THE LOFT. (Deleting the opening moves it back — which
            // is why the founder's undo restored the joint.)
            //
            // A RAKED wall cannot itself host an opening (§FIX-RAKE-REFUSAL-IS-NOT-A-
            // CRASH, L-812), so the wall reaching this code is always VERTICAL and its
            // own carve stays a vertical band; the ONLY thing the loft changes for it is
            // where its mitred TOP corners sit on the shared 3-D mitre line. At an
            // orthogonal joint that drift is purely ALONG the wall axis (the corner
            // simply gets longer/shorter with height), so displacing the END segments'
            // top cap reproduces the lofted solid EXACTLY over the range it covers and
            // leaves every interior segment — and every opening reveal — untouched.
            //
            // Null on any level with no raked wall (⇒ every existing project builds
            // byte-identical geometry) and on any honest degradation inside
            // `rakedTopOffsets`.
            //
            // §RAKE-HOSTED-OPENING (founder 2026-08-18) — the paragraph above says "a
            // RAKED wall cannot itself host an opening". THAT IS NO LONGER TRUE.
            //
            // ── §L955-ONE-CORNER-RULE (founder 2026-08-18, live `d5b8d82f`) ──────────
            // This condition used to read `_ownShearK === 0`, i.e. a RAKED host was
            // denied the loft outright, on the ground that `_applyRakeShearToChildren`
            // already displaces the top cap by `height · cot(rake)` and "consuming the
            // twin-solve loft on top of that would count the same displacement twice".
            //
            // THE DOUBLE-COUNT WAS REAL; THE CONCLUSION WAS NOT. The two displacements
            // are not rivals — the loft is the TOTAL top-corner travel, and the uniform
            // shear is the part of it the child matrix contributes. Subtract, and the
            // RESIDUAL is exactly what the cap must add on top:
            //
            //     final = base + residual + uniform = base + capDrift          ∎
            //
            // So the host now places its shared top corner by the SAME rule as its plain
            // neighbour, which is the whole of L-955: it is not that the end face was
            // un-sheared (it was sheared, at :2474), it is that the two ends of one
            // corner obeyed two different rules and therefore met only at the floor.
            //
            // NOTE WHAT THIS DOES **NOT** REQUIRE. `WallRake.ts` records that "picking
            // the loft would need the segmented opening body to become polygon-based".
            // It does not: `buildMiterPrism`'s `startTopDrift`/`endTopDrift` are
            // HORIZONTAL top-cap displacements, and every quantity here is horizontal —
            // the loft moves a corner in plan, the shear moves it in plan, and the
            // difference of two plan vectors is a plan vector. No signature change, no
            // polygon rewrite, and the opening carve and reveals are untouched because
            // the residual lands only on the two mitred END segments' TOP ring.
            //
            // §WALL-RAKE-JOINT-STALE-CACHE now applies here too, and did not before: a
            // VERTICAL host's own rake could not go stale, a raked one's can. On a
            // mismatch take the uniform shear at the CURRENT angle rather than replay the
            // previous angle's joint.
            const _ownShearK = rakeShearPerMetre(wall.rakeAngleDeg);
            const _capCache = this.getEffectiveV2Cache();
            const _capRakeFresh = _capCache?.rakeIsFreshFor(wall.id, wall.rakeAngleDeg) ?? false;
            const _capDriftTotal = (isWallPipelineV2Enabled() && !wall.curve && _capRakeFresh)
                ? (_capCache?.rakeJointCapDrift(wall.id, wallHeight) ?? null)
                : null;
            // The uniform part `_applyRakeShearToChildren` will add at the top ring.
            // `rakeTopOffset` is the ONE place this is computed — never a second cot().
            // Null for a vertical host ⇒ the residual IS the drift ⇒ byte-identical.
            const _capUniform = rakeTopOffset(wall.rakeAngleDeg, wallHeight, {
                x: direction.x, z: direction.z,
            });
            const _capResidual = (p: { x: number; z: number }): { x: number; z: number } =>
                _capUniform ? { x: p.x - _capUniform.x, z: p.z - _capUniform.z } : p;
            const _capDrift = _capDriftTotal
                ? {
                    startLeft:  _capResidual(_capDriftTotal.startLeft),
                    startRight: _capResidual(_capDriftTotal.startRight),
                    endLeft:    _capResidual(_capDriftTotal.endLeft),
                    endRight:   _capResidual(_capDriftTotal.endRight),
                }
                : null;
            const _startTopDrift = _capDrift
                ? { left: _capDrift.startLeft, right: _capDrift.startRight }
                : null;
            const _endTopDrift = _capDrift
                ? { left: _capDrift.endLeft, right: _capDrift.endRight }
                : null;

            for (const cluster of sortedClusters) {
                const openingsAtOffset = cluster.openings;
                const minLeft = cluster.minLeft;
                const maxRight = cluster.maxRight;

                // 1. Segment before opening cluster (if any)
                const segmentLength = minLeft - currentOffset;

                if (segmentLength > 0.01) {
                    // First segment (starts at wall origin, currentOffset===0) gets startMN applied
                    // so miter join geometry is preserved when openings are on a joined wall.
                    // §WALL-RAKE-JOINT-OPENING-HOST — also take the prism branch when the
                    // wall has NO miter normal at this end but DOES carry a joint loft (a
                    // T-guest whose cap is square in plan yet still lofted at the top).
                    // With both inputs null the prism is a square-capped box, i.e. the
                    // BoxGeometry branch's own output.
                    if (currentOffset === 0 && (openingStartMN || _startTopDrift)) {
                        const segStart = new THREE.Vector3(0, 0, 0);
                        const segEnd   = direction.clone().multiplyScalar(minLeft);
                        const geo = buildMiterPrism(
                            segStart, segEnd, segStart, segEnd,
                            wallThickness / 2, wallHeight, wallBaseOffset,
                            openingStartMN, null,
                            _startTopDrift, null,
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
                        // §OPENING-OFFSET-LEFTEDGE-UNIFY: gap mesh width = op.width, so its
                        // CENTRE sits at the opening centre = left-edge offset + width/2.
                        positionLocal(gapMesh, op.offset + op.width / 2, currentY + gapBelow / 2 + wallBaseOffset);
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
                // §WALL-RAKE-JOINT-OPENING-HOST — same generalisation as the first segment.
                if (openingEndMN || _endTopDrift) {
                    const segStart      = direction.clone().multiplyScalar(currentOffset);
                    const segEnd        = direction.clone().multiplyScalar(wallLength);
                    const clEnd         = direction.clone().multiplyScalar(wallLength);
                    const geo = buildMiterPrism(
                        segStart, segEnd, segStart, clEnd,
                        wallThickness / 2, wallHeight, wallBaseOffset,
                        null, openingEndMN,
                        null, _endTopDrift,
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
                if (openingStartMN || openingEndMN || _capDrift) {
                    const segStart = new THREE.Vector3(0, 0, 0);
                    const segEnd   = direction.clone().multiplyScalar(wallLength);
                    // §WALL-RAKE-JOINT-OPENING-HOST — the outline must follow the LOFTED
                    // body, or the edge overlay draws the pre-loft silhouette over the
                    // corrected corner (a second, thinner version of the same defect).
                    const outlineGeo = buildMiterPrism(
                        segStart, segEnd, segStart, segEnd,
                        wallThickness / 2, wallHeight, wallBaseOffset,
                        openingStartMN, openingEndMN,
                        _startTopDrift, _endTopDrift,
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
            // §WALL-RAKE-JOINT-OPENING-HOST — a lofted end counts as a "miter end" for
            // this decision: the Shape-with-holes extrude runs through the thickness on
            // ONE profile, so it cannot express a top cap that has travelled along the
            // mitre line. Taking it would silently discard the loft we just applied.
            const _hasMiterEnd = !!(openingStartMN || openingEndMN || _capDrift);
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

            // §RAKE-HOSTED-OPENING (founder 2026-08-18) — THE CARVE FOLLOWS THE RAKED
            // FACE. Everything above builds the opening-bearing body in the wall's
            // VERTICAL frame: box segments, the mitred end prisms, the single
            // hole-extrude body, the edge overlay and the in-wall door/window frames.
            // The rake is then applied ONCE, here, as the shear that it is — after the
            // body has settled, so it lands on whichever of those paths actually ran.
            //
            // Applying it as one linear map (rather than teaching each builder about
            // the lean) is what makes the void correct BY CONSTRUCTION: the sheared
            // assembly is the exact image of the vertical assembly, so the hole still
            // fits the hole it was cut from, and the frame still fits the hole. A
            // per-builder rake would have needed the carve and the frame to agree by
            // recomputation — the class of mismatch ADR-0310 §2.5 refused the case to
            // avoid. See `WallRake.ts` §RAKE-HOSTED-OPENING for the plumb-height /
            // in-plane-leaf decision this encodes.
            //
            // For a vertical wall `_ownShearK === 0` and this is a no-op that touches
            // nothing — not even a matrix flag — so the 90° path stays byte-identical.
            this._applyRakeShearToChildren(wallGroup, wall, _ownShearK, direction, wallBaseOffset);

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
        //
        // ⚠ HALF OF THE REASON ABOVE IS NOW STALE, AND THE ARM STILL STAYS OFF.
        //   (C85 §12 R-8, corrected 2026-08-19 — the correction the contract asked for.)
        //
        //   The paragraph above names TWO blockers, and they have DIFFERENT states:
        //
        //     · "DoorBuilder/WindowBuilder place the leaf at `level.elevation +
        //       sillHeight` without slab/baseOffset" — **CLOSED** by `8f63fb6f`
        //       (§WALL-Y-DATUM). `WallVerticalDatum.ts` now declares SEAT and BASE, the
        //       leaves read the published base plane back (`resolveWallBaseYOrLevel` +
        //       `hostedLeafCentreY`), and eleven datums agree with a leaf-vs-hole delta
        //       of 0. That clause describes code that no longer exists.
        //     · "the producer never receives the slab offset" — **NOT MEASURED.** Whether
        //       the `geometry-kernel` producer honours `baseOffset` the way
        //       `WallHoleBodyBuilder` does has not been checked by anyone.
        //
        // ⛔ THE SECOND IS ENOUGH ON ITS OWN, so nothing here changes. This note exists
        //    precisely because the comment was asserting a blocker that no longer exists,
        //    and a reader who checked only that half would have concluded the arm was
        //    ready. Inferring "safe to re-enable" from ONE closed blocker of two is the
        //    inference C84 exists to prevent. Close the SECOND, with a measurement, and
        //    then argue about the default.
        //
        // §RAKE-HOSTED-OPENING — a RAKED host is excluded. The producer is handed a
        // length/thickness/height/angle box and returns an axis-aligned solid; it has
        // no way to express the lean, so the swap would silently replace the sheared
        // body with a vertical one AFTER the shear was applied — a wrong wall reported
        // as an upgrade. Rake support belongs in the producer's descriptor, not in a
        // fixup here. Excluded rather than approximated (C65 §3.9).
        if (
            typeof window !== 'undefined' &&
            (window as { __wallSingleVolume?: boolean }).__wallSingleVolume === true &&
            this._singleVolumeProducer !== null &&
            wall.openings && wall.openings.length > 0 &&
            rakeShearPerMetre(wall.rakeAngleDeg) === 0 &&
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
                // §FIX-WALL-VERSION-CONTENT-HASH (L-52): use the resolved token, not
                // the raw counter — a genuine change mints a new token (abort), a
                // no-op rebuild reuses it (the identical geometry is safe to apply).
                version: geometryVersion,
            });
        }

        this.wallToFragmentsMap.set(wall.id, fragmentIds);
        return fragmentIds;
    }

    /**
     * §RAKE-HOSTED-OPENING — shear an opening-bearing wall's built children about the
     * wall's BASE plane, so the solid, the void, the reveals, the edge overlay and the
     * in-wall frames all lean together.
     *
     * THE MAP, in the group's own frame (origin at the wall start, y = 0 at the level
     * floor, so the wall base sits at `baseOffset`):
     *
     *     p ↦ p + k · (p.y − baseOffset) · leftPerp(direction),     k = cot(rake)
     *
     * `k` comes from `WallRake.rakeShearPerMetre` and `leftPerp` is the same
     * `(−d.z, d.x)` every other wall module uses — no third convention is minted here.
     * At the wall top (`p.y − baseOffset = height`) this reproduces `rakeTopOffset`
     * exactly, which is why the opening-bearing body and the un-opened prism body of
     * the same wall are the same solid.
     *
     * WHY THE CHILD MATRIX AND NOT THE VERTEX BUFFERS: a shear is not decomposable
     * into position/quaternion/scale, so it cannot be expressed through `Object3D`'s
     * TRS fields — the matrix has to be written directly and `matrixAutoUpdate`
     * turned off so nothing recomposes it away. three.js handles the rest correctly:
     * the normal matrix is the inverse-transpose of the model-view matrix, so shading
     * follows, and `Raycaster` inverts `matrixWorld`, so picking follows. Every child
     * is rebuilt from scratch on each `buildWall`, so the disabled flag cannot leak
     * into a later vertical build of the same wall.
     *
     * NO-OP AND PROVABLY SO when `k === 0` (a vertical wall, absent or 90° rake): the
     * method returns before touching a single child, so the 90° path is byte-identical
     * including its matrix flags.
     */
    /**
     * §FEAT-RAKE-CURVED-JOINT (L-1066) — the lofted top-cap drift for a CURVED raked
     * wall, or null when it must degrade to the uniform cone.
     *
     * ONE resolver of this question, consumed by all three curved arms, for the reason
     * L-955 cost this repo once already: three body paths asking "where is the top corner?"
     * and answering it three ways is the defect, not the geometry.
     *
     * §WALL-RAKE-JOINT-STALE-CACHE applies here exactly as it does on the straight paths —
     * the drift is a function of the rakes the cache was REFRESHED with, so replaying it
     * after the store moved this wall's rake would render the PREVIOUS angle's joint.
     */
    private _curvedCapDrift(wall: WallData, wallHeight: number):
        { startLeft: { x: number; z: number }; startRight: { x: number; z: number };
          endLeft: { x: number; z: number }; endRight: { x: number; z: number } } | null {
        if (!isWallPipelineV2Enabled()) return null;
        if (rakeShearPerMetre((wall as { rakeAngleDeg?: number }).rakeAngleDeg) === 0) return null;
        const cache = this.getEffectiveV2Cache();
        if (!cache) return null;
        if (!cache.rakeIsFreshFor(wall.id, (wall as { rakeAngleDeg?: number }).rakeAngleDeg)) return null;
        return cache.curvedRakeCapDrift(wall.id, wallHeight) ?? null;
    }

    private _applyRakeShearToChildren(
        wallGroup: THREE.Group,
        wall: WallData,
        k: number,
        direction: THREE.Vector3,
        baseOffset: number,
    ): void {
        if (k === 0 || !Number.isFinite(k)) return;
        const L = Math.hypot(direction.x, direction.z);
        if (!(L > 1e-12)) return;                       // degenerate baseline — leave it vertical
        const dx = direction.x / L;
        const dz = direction.z / L;
        // leftPerp(d) = (−d.z, d.x) — the SAME left as WallFootprint2D / JunctionResolverV2.
        const sx = k * -dz;
        const sz = k * dx;
        const y0 = Number.isFinite(baseOffset) ? baseOffset : 0;
        const S = new THREE.Matrix4().set(
            1, sx, 0, -sx * y0,
            0, 1,  0, 0,
            0, sz, 1, -sz * y0,
            0, 0,  0, 1,
        );
        for (const child of wallGroup.children) {
            child.updateMatrix();                       // compose the TRS the builders set
            child.matrixAutoUpdate = false;             // …then stop it being recomposed
            child.matrix.premultiply(S);
            child.matrixWorldNeedsUpdate = true;
        }
        wallGroup.updateMatrixWorld(true);
        // Stamped so a reader of the scene graph (and the §V2-SPIKE-GUARD budget,
        // which already sizes for `rakeLateralShift`) can tell a sheared body from a
        // vertical one without re-deriving it from the matrices.
        wallGroup.userData.rakeAngleDeg = wall.rakeAngleDeg;
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
    /**
     * §FEAT-HOSTED-ON-CURVED-WALL — build a CURVED wall that hosts openings.
     *
     * The straight path splits a wall into BOX segments around its openings.
     * This is the exact analogue for an arc: the wall is split into RADIAL BANDS
     * along the centreline arc, each band being the ordinary curved-wall solid
     * restricted to an arc span `[s0,s1]` and a vertical span `[yLo,yHi]`.
     *
     * WHY RADIAL AND NOT A BOX SUBTRACTION. A box has parallel jambs; the wall
     * faces are concentric arcs. Subtracting a box therefore over-cuts the outer
     * face into a wedge and under-cuts the inner one (or vice versa depending on
     * which face the box is sized to). A band terminates on a station whose jamb
     * plane contains the local centreline NORMAL, so the jamb is perpendicular to
     * BOTH faces — which is how an opening in a curved wall is actually set out,
     * and it needs no boolean operation at all.
     *
     * ONE OPENING = ONE VOID, however many tessellation chords it spans. The void
     * is the GAP between two bands, and `sliceStations` inserts exact stations at
     * the opening's arc-length edges, so an opening wider than a chord is never
     * split into per-chord cuts and is never capped to a chord.
     *
     * Handles the LAYERED curved wall too: each layer is banded independently
     * with its own centreline offset, exactly as the uncarved layered path does.
     *
     * @returns true when bands were emitted; false on degenerate geometry, so the
     *          caller can fall through to the uncarved solid (never an empty wall).
     */
    private _buildCurvedWallWithOpenings(
        wall: WallData,
        wallGroup: THREE.Group,
        fragmentIds: string[],
        start: THREE.Vector3,
        end: THREE.Vector3,
        wallThickness: number,
        wallHeight: number,
        wallBaseOffset: number,
        joinData?: JoinData | null,
        renderMap?: OpeningRenderMap,
    ): boolean {
        if (!wall.curve) return false;

        const ctrl = new THREE.Vector3(
            wall.curve.control.x,
            wall.curve.control.y,
            wall.curve.control.z,
        );
        const stations = computeStations(start, end, ctrl, wall.curve.segments);
        if (stations.length < 2) return false;

        const cum = stationArcLengths(stations);
        const totalLength = cum[cum.length - 1] ?? 0;
        if (!(totalLength > 0) || !(wallHeight > 0)) return false;

        const bands = computeCurvedWallBands(
            (wall.openings ?? []).map(o => ({
                offset: o.offset,
                width: o.width,
                height: o.height,
                sillHeight: o.sillHeight ?? 0,
            })),
            totalLength,
            wallHeight,
        );
        if (bands.length === 0) return false;

        const startMN = joinData?.startMN ?? null;
        const endMN   = joinData?.endMN   ?? null;

        // §CURVED-STRAIGHT-FIX — exact quadratic-Bézier tangents at the arc
        // endpoints, so a band that carries a miter cap projects along the SAME
        // direction `WallJoinResolver._wallDirAtJoin` used to compute the normal.
        const _sdx = ctrl.x - start.x, _sdz = ctrl.z - start.z;
        const _sl  = Math.hypot(_sdx, _sdz) || 1;
        const arcStartTan = { x: _sdx / _sl, z: _sdz / _sl };
        const _edx = end.x - ctrl.x, _edz = end.z - ctrl.z;
        const _el  = Math.hypot(_edx, _edz) || 1;
        const arcEndTan = { x: _edx / _el, z: _edz / _el };

        // Layer plan: one entry for a plain wall, N for a layered one. Each entry
        // is a concentric band-set offset laterally from the centreline.
        type LayerPlan = {
            layer: import('./WallTypes').WallLayer | null;
            centreOffset: number;
            halfT: number;
            colour: string | undefined;
            index: number;
        };
        // §FEAT-RAKE-CURVED — the same PERPENDICULAR → RADIAL conversion the uncarved
        // layered curved arm applies, through the same single `rakedPlanThickness`.
        // Identity at 90°, so a vertical curved wall with an opening is byte-identical.
        const _cvOpenRake = (wall as { rakeAngleDeg?: number }).rakeAngleDeg;
        // §FEAT-RAKE-CURVED-JOINT — the SAME drift for every band of every layer. A band
        // that only reaches an interior jamb has no mitre, and `buildCurvedLayerGeometry`
        // applies the drift only where a cap actually exists.
        const _cvOpenCapDrift = this._curvedCapDrift(wall, wallHeight);
        const layerPlans: LayerPlan[] = [];
        if (wall.layers && wall.layers.length > 0) {
            const totalThickness = wall.layers.reduce((s: number, l) => s + l.thickness, 0);
            let cursor = -rakedPlanThickness(totalThickness, _cvOpenRake) / 2;
            wall.layers.forEach((layer, i) => {
                const _bandRadial = rakedPlanThickness(layer.thickness, _cvOpenRake);
                layerPlans.push({
                    layer,
                    centreOffset: cursor + _bandRadial / 2,
                    halfT: _bandRadial / 2,
                    colour: layer.materialColor ?? wall.materialColor,
                    index: i,
                });
                cursor += _bandRadial;
            });
        } else {
            // A PLAIN wall's `thickness` is already a plan/radial quantity — never
            // rescaled, exactly as `WallPipelineV2.effectivePlanThickness` states for the
            // straight case. Only a LAYERED stack is a sum of perpendicular terms.
            layerPlans.push({
                layer: null,
                centreOffset: 0,
                halfT: wallThickness / 2,
                colour: wall.materialColor,
                index: -1,
            });
        }

        const baseMaterial = this.createWallMaterial(wall);
        let emitted = 0;

        for (const band of bands) {
            const bandStations = sliceStations(stations, cum, band.s0, band.s1);
            if (bandStations.length < 2) continue;
            const caps = bandCapTangents(bandStations);

            // A miter cap belongs ONLY to a band that actually reaches the wall
            // end; an interior jamb must stay radial, never miter-projected.
            const bandStartMN = band.atStart ? startMN : null;
            const bandEndMN   = band.atEnd   ? endMN   : null;
            const bandStartTan = band.atStart ? arcStartTan : caps.start;
            const bandEndTan   = band.atEnd   ? arcEndTan   : caps.end;

            for (const plan of layerPlans) {
                const geom = buildCurvedLayerGeometry(
                    (plan.layer ?? { name: 'body', function: 'structure', thickness: plan.halfT * 2 }) as import('./WallTypes').WallLayer,
                    plan.centreOffset,
                    bandStations,
                    band.yHi - band.yLo,
                    wallBaseOffset + band.yLo,
                    plan.halfT,
                    bandStartMN,
                    bandEndMN,
                    bandStartTan,
                    bandEndTan,
                    // §FEAT-RAKE-CURVED — THE DATUM IS THE WALL'S, NOT THE BAND'S, and this
                    // is the one call site where the distinction bites. A band spanning
                    // [yLo, yHi] must START already displaced by `k·yLo`; measuring from the
                    // band's own base would restart the lean at every sill and head, and a
                    // curved raked wall with a window would render as a stack of disjoint
                    // rings instead of one leaning wall.
                    {
                        angleDeg: _cvOpenRake, datumY: wallBaseOffset,
                        capDrift: _cvOpenCapDrift,
                        // This arm emits BANDS, so each takes its proportional share.
                        fullHeight: wallHeight,
                    },
                );

                const mat = baseMaterial.clone() as THREE.MeshStandardMaterial;
                if (plan.colour) mat.color = new THREE.Color(plan.colour);
                // Curved walls wrap around — the inner face is visible from some
                // camera angles, exactly as on the uncarved curved path.
                mat.side = THREE.DoubleSide;

                const mesh = new THREE.Mesh(geom, mat);
                mesh.userData = {
                    id: wall.id,
                    materialId: wall.materialId,
                    materialColor: plan.colour ?? wall.materialColor,
                    elementType: plan.layer ? 'WallLayer' : 'WallPart',
                    modelId: 'model-default',
                    role: 'geometry',
                    selectable: false,
                    wallId: wall.id,
                    parentId: wall.id,
                    ...(plan.layer
                        ? { layerIndex: plan.index, layerName: plan.layer.name, layerFunction: plan.layer.function }
                        : {}),
                    // Diagnostics: which carve band this solid is.
                    wallBandKind: band.kind,
                };
                mesh.position.set(0, 0, 0);
                wallGroup.add(mesh);
                wallGroup.add(buildWallEdgeOverlay(geom, wall.id));

                const fragmentId = crypto.randomUUID();
                this.fragments.set(fragmentId, {
                    id: fragmentId,
                    wallId: wall.id,
                    mesh: mesh as unknown as THREE.Mesh,
                    type: 'wall-body',
                    parentId: wall.id,
                    levelId: wall.levelId,
                });
                this.fragmentToEntityMap.set(fragmentId, {
                    fragmentId,
                    elementId: wall.id,
                    type: 'wall',
                    entityType: 'wall',
                    entityId: wall.id,
                });
                fragmentIds.push(fragmentId);
                emitted++;
            }
        }

        safeDisposeMaterial(baseMaterial as THREE.Material);

        if (emitted === 0) return false;

        // ── Opening frames — identical contract to the straight / layered paths.
        // `createDoorFrame` / `createWindowFrame` self-position along the wall and
        // are arc-aware (see their `hostedElementFrame` call), so they sit on the
        // curved face with the frame's local X along the TANGENT at its centre.
        for (const op of wall.openings ?? []) {
            if (!op.elementId) continue;
            const existing = wallGroup.children.find(c => c.userData?.id === op.elementId);
            if (existing) wallGroup.remove(existing);

            const opRenderData = renderMap?.get(op.elementId);
            const frame = op.type === 'door'
                ? this.createDoorFrame(wall, op, opRenderData)
                : this.createWindowFrame(wall, op, opRenderData);

            if (frame.children.length > 0 || Object.keys(frame.userData).length > 0) {
                wallGroup.add(frame);
                const fragId = crypto.randomUUID();
                this.fragments.set(fragId, {
                    id: fragId,
                    wallId: wall.id,
                    mesh: frame as unknown as THREE.Mesh,
                    type: 'opening',
                    parentId: wall.id,
                    levelId: wall.levelId,
                });
                fragmentIds.push(fragId);
            }
        }

        return true;
    }

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

        // Validate opening offset
        if (!isFinite(opening.offset)) {
            console.error("Invalid window offset:", opening);
            return new THREE.Group();
        }

        // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): `opening.offset` is the LEFT
        // EDGE of the span [offset, offset+width]; the frame's CENTRE sits at
        // offset + width/2. This matches the void span computed in the cluster path.
        // §FEAT-HOSTED-ON-CURVED-WALL — `centreAlong` is a distance along the wall
        // CENTRELINE. On a curved host the normalised anchor `t` must divide by the
        // ARC length, not the chord, or the stored anchor drifts away from the void
        // the carve bands actually left.
        const centreAlong = opening.offset + opening.width / 2;
        const _centrelineLen = wallCentrelineLength(wall) || wallLength;
        const t = centreAlong / _centrelineLen;
        const sillHeight = opening.sillHeight ?? 0;
        // §WALL-NAN-GUARD (2026-06-25): wall.baseOffset is optional and arrives
        // `undefined` from the generator/batch path (CreateWallBatch only spreads it
        // when defined; §RESI-FACADE shell walls omit it). `undefined + n === NaN`
        // would place the opening frame at NaN localY → NaN bounding volumes. Default
        // to 0, matching §FIX-NAN-Y on the wall-body path.
        const localY = sillHeight + opening.height / 2 + (wall.baseOffset ?? 0);

        // §FEAT-HOSTED-ON-CURVED-WALL — position + heading come from the local frame
        // on the CENTRELINE at `centreAlong`, so the frame sits on the curved face
        // and is oriented to the TANGENT there, never to the chord. `wallGroup`'s
        // origin is the wall start, so the world frame is made start-relative.
        // For a straight wall this reduces exactly to `dir × centreAlong`.
        const _hf = hostedElementFrame(wall, opening.offset, opening.width);
        const pos = new THREE.Vector3(_hf.x - start.x, 0, _hf.z - start.z);
        frameGroup.position.set(pos.x, localY, pos.z);

        // Correct rotation calculation
        frameGroup.rotation.y = _hf.rotationY;

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

        // Validate opening offset
        if (!isFinite(opening.offset)) {
            console.error("Invalid door offset:", opening);
            return new THREE.Group();
        }

        // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): `opening.offset` is the LEFT
        // EDGE of the span [offset, offset+width]; the frame's CENTRE sits at
        // offset + width/2. This matches the void span computed in the cluster path.
        // §FEAT-HOSTED-ON-CURVED-WALL — `centreAlong` is a distance along the wall
        // CENTRELINE. On a curved host the normalised anchor `t` must divide by the
        // ARC length, not the chord, or the stored anchor drifts away from the void
        // the carve bands actually left.
        const centreAlong = opening.offset + opening.width / 2;
        const _centrelineLen = wallCentrelineLength(wall) || wallLength;
        const t = centreAlong / _centrelineLen;
        const sillHeight = opening.sillHeight ?? 0;
        // §WALL-NAN-GUARD (2026-06-25): wall.baseOffset is optional and arrives
        // `undefined` from the generator/batch path (CreateWallBatch only spreads it
        // when defined; §RESI-FACADE shell walls omit it). `undefined + n === NaN`
        // would place the opening frame at NaN localY → NaN bounding volumes. Default
        // to 0, matching §FIX-NAN-Y on the wall-body path.
        const localY = sillHeight + opening.height / 2 + (wall.baseOffset ?? 0);

        // §FEAT-HOSTED-ON-CURVED-WALL — position + heading come from the local frame
        // on the CENTRELINE at `centreAlong`, so the frame sits on the curved face
        // and is oriented to the TANGENT there, never to the chord. `wallGroup`'s
        // origin is the wall start, so the world frame is made start-relative.
        // For a straight wall this reduces exactly to `dir × centreAlong`.
        const _hf = hostedElementFrame(wall, opening.offset, opening.width);
        const pos = new THREE.Vector3(_hf.x - start.x, 0, _hf.z - start.z);
        frameGroup.position.set(pos.x, localY, pos.z);

        // Correct rotation calculation
        frameGroup.rotation.y = _hf.rotationY;

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
                // §FIX-WALL-V2-EXISTING-CORNER-IMMUTABLE (L-130) — carry the wall's type so the
                // single-wall footprint frame matches the type-aware junction solve in the cache.
                systemTypeId: wall.systemTypeId,
                // §WALL-RAKE — the wall's lean from the floor plane. Absent / 90 ⇒ VERTICAL,
                // and `buildWallV2Geometry` then takes the pre-rake path unchanged.
                rakeAngleDeg: wall.rakeAngleDeg,
                // §FEAT-RAKE-LAYERED — a raked LAYERED wall's stored `thickness` is the
                // PERPENDICULAR sum `Σ layer.thickness`, so its plan width is that / sin θ.
                // `effectivePlanThickness` needs to know which kind of wall this is; false /
                // absent leaves every other wall's thickness untouched.
                layered: (wall.layers?.length ?? 0) > 1,
            };
            const { geometry: worldGeom, maxTopDriftM } = buildWallV2Geometry(spec, v2Cache, {
                height: wall.height,
                baseOffset: wall.baseOffset ?? 0,
                elevation: 0,
            });
            // Translate world-XZ vertices to wallGroup-local. The wallGroup is positioned
            // at the POST-TRIM start (`wall.baseLine[0]`), so translating by that delta
            // lets the rendered geometry sit at its TRUE pre-trim WORLD position —
            // Pascal-style, the wall body extends to the actual junction (no trim).
            worldGeom.translate(-wall.baseLine[0].x, 0, -wall.baseLine[0].z);

            // §V2-SPIKE-GUARD (founder 2026-06-19) — validate the V2 footprint/extruder
            // output before trusting it. A degenerate miter corner from JunctionResolverV2
            // or a stale/huge `_sourceBaseLine` can make the footprint polygon zig-zag into
            // a multi-metre SPIKE — the founder's plain joined wall whose body bbox spanned
            // 125m while its centreline was a clean 3.5m (caught by §DIAG-MESH-SPIKE:
            // openings=0 layered=false). A real wall body never exceeds its own footprint
            // (baseLine length + thickness) plus a small miter. If V2's geometry grossly
            // overshoots that — or is non-finite — DISCARD it and fall through to the legacy
            // §MITER-T-CLAMP'd MiterPrism path below, which is safe by construction (the
            // join is valid — §DIAG-WALL-JOIN closed=✓ — so the legacy miter renders a clean
            // wall; we only lose V2's edge-coincident-corner nicety on this one wall).
            worldGeom.computeBoundingBox();
            const _bb = worldGeom.boundingBox;
            const _baseLen = Math.hypot(
                wall.baseLine[1].x - wall.baseLine[0].x,
                wall.baseLine[1].z - wall.baseLine[0].z,
            );
            // §WALL-RAKE — a RAKED wall legitimately overhangs its own footprint by
            // `height · |cot(rake)|` in plan, which is EXACTLY the kind of overshoot this
            // guard exists to reject. Widen the budget by the computed shear so a correct
            // raked wall is not silently demoted to the legacy MiterPrism path (which has
            // no rake at all and would render it vertical — a wrong wall, reported as fine).
            // For a vertical wall `rakeLateralShift` is 0 and the budget is unchanged.
            // §WALL-RAKE-JOINT (ADR-0312) — a joint-lofted top corner can legitimately drift
            // FARTHER than the wall's own shear (two opposing rakes meeting at a shallow plan
            // angle push the shared mitre corner out along the mitre line), and a VERTICAL
            // wall joined to a raked one drifts despite its own shift being 0. Budget with the
            // build's ACTUAL max top-vertex drift (reported by buildWallV2Geometry) so a
            // correct lofted joint is never demoted to the rake-less legacy prism — which
            // would render the wall vertical while reporting success. For an unraked level
            // `maxTopDriftM` is 0 and the budget is byte-identical to before.
            const _rakeShift = Math.max(rakeLateralShift(wall.rakeAngleDeg, wall.height), maxTopDriftM);
            const _maxExtent = _baseLen + wall.thickness + _rakeShift + 1.0;   // generous; real body ≤ len + thk + rake + small miter
            const _finiteBB = !!_bb
                && Number.isFinite(_bb.min.x) && Number.isFinite(_bb.max.x)
                && Number.isFinite(_bb.min.z) && Number.isFinite(_bb.max.z);
            const _xzDiag = _finiteBB ? Math.hypot(_bb!.max.x - _bb!.min.x, _bb!.max.z - _bb!.min.z) : Infinity;
            if (_finiteBB && _xzDiag <= _maxExtent) {
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
            // V2 produced a degenerate / spiked polygon — drop it and use the legacy path.
            (worldGeom as unknown as { dispose?: () => void }).dispose?.();
            // eslint-disable-next-line no-console
            console.warn(
                `[WallFragmentBuilder] §V2-SPIKE-GUARD wall ${wall.id}: V2 body XZ-diag=${_xzDiag.toFixed(2)}m ` +
                `≫ max ${_maxExtent.toFixed(2)}m (baseLen=${_baseLen.toFixed(2)}m) — falling back to legacy MiterPrism`,
            );
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
        let geometry = buildMiterPrism(
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

        // §LEGACY-SPIKE-GUARD (founder 2026-06-19) — a runaway miter normal at a
        // complex T/X (3-wall) junction can push the MiterPrism end into a
        // multi-metre dark SLIVER (the founder's "black shapes appearing in joins,
        // often 3 wall joins, got worse"). Validate the body bbox exactly as
        // §V2-SPIKE-GUARD does; if the mitred prism grossly overshoots the wall's
        // own footprint, the join MN is degenerate — rebuild with PERPENDICULAR
        // ends (no miter) so the wall renders as a clean box. A square corner is
        // imperfect but it does NOT spike and leaves NO gap (the body still spans
        // the full baseLine; the discarded geometry was only the over-extension).
        {
            geometry.computeBoundingBox();
            const _bb = geometry.boundingBox;
            const _baseLen = Math.hypot(worldEnd.x - worldStart.x, worldEnd.z - worldStart.z);
            const _maxExtent = _baseLen + wall.thickness + 1.0;   // generous; real mitred body ≤ len + ~2·thk
            const _finiteBB = !!_bb
                && Number.isFinite(_bb.min.x) && Number.isFinite(_bb.max.x)
                && Number.isFinite(_bb.min.z) && Number.isFinite(_bb.max.z);
            const _xzDiag = _finiteBB ? Math.hypot(_bb!.max.x - _bb!.min.x, _bb!.max.z - _bb!.min.z) : Infinity;
            if (!_finiteBB || _xzDiag > _maxExtent) {
                (geometry as unknown as { dispose?: () => void }).dispose?.();
                geometry = buildMiterPrism(
                    worldStart, worldEnd, worldStart, worldEnd,
                    wall.thickness / 2, wall.height, wall.baseOffset ?? 0,
                    null, null,   // perpendicular ends — cannot spike
                );
                // eslint-disable-next-line no-console
                console.warn(
                    `[WallFragmentBuilder] §LEGACY-SPIKE-GUARD wall ${wall.id}: mitred body XZ-diag=${_xzDiag.toFixed(2)}m ` +
                    `≫ max ${_maxExtent.toFixed(2)}m (baseLen=${_baseLen.toFixed(2)}m) — runaway miter, rebuilt with perpendicular ends`,
                );
            }
        }

        // ── §L955-LEGACY-PLAIN-SHEAR (founder 2026-08-18) ───────────────────────
        // THE LEGACY ARM MUST NOT RENDER A RAKED WALL VERTICAL. `buildMiterPrism`
        // extrudes straight up, and this branch — unlike every other rake-capable body
        // path — had nothing downstream to lean it: `buildWall`'s
        // `wall.openings.length === 0` branch returns without ever reaching
        // `_applyRakeShearToChildren`, which only the opening-bearing branchES call —
        // TWO of them since §FEAT-RAKE-LAYERED-OPENINGS (RK1, 2026-08-19): the plain
        // opening-bearing arm and the LAYERED opening-bearing arm. This sentence said
        // "branch", singular, and the singular was the whole shape of L-1061: for as long
        // as exactly one branch leaned, every other branch that reached a body was a
        // candidate for standing a raked wall upright. (The `:2123` line citation that
        // stood here is dropped rather than re-measured — this file moved ~200 lines
        // today alone, and a §-tag is greppable where a line number is not.) So a
        // plain raked wall that fell back here (V2 disabled, or a §V2-SPIKE-GUARD
        // rejection) stood bolt upright while the store held 80° — a silently-wrong wall
        // reported as a success, which is the one outcome this subsystem refuses to ship
        // (§FIX-RAKE-REFUSAL-IS-NOT-A-CRASH).
        //
        // This is the SAME correction §FEAT-RAKE-LAYERED already made to the LAYERED
        // legacy fallback (:1608-1622) and it is deliberately the same eight lines: a
        // rake is an affine SHEAR about the wall's base plane, so it applies to an
        // already-built prism exactly — x += kx·(y − yBase), z += kz·(y − yBase).
        // `applyMatrix4` carries the normals through the inverse-transpose, so the tilted
        // faces light correctly.
        //
        // WHY IT IS SAFE TO DO IT HERE AND NOT IN `buildMiterPrism`: the miter builder's
        // signature stays untouched (a per-end TOP DESCRIPTION is a different feature and
        // belongs to whoever needs profiled end cuts), and the shear is applied AFTER the
        // §LEGACY-SPIKE-GUARD has measured the un-sheared body — so the guard keeps
        // judging the miter it was written to judge, not a leaning bounding box.
        //
        // NOT THE INSTANCED ARM. A plain, single-layer, opening-free, UNJOINED wall never
        // reaches this function at all — `isSimpleWall` (:1147) routes it to
        // `WallInstanceBridge`, which reads no rake. That arm drops the lean too, and it
        // is a DIFFERENT defect with a different owner; this fix neither closes it nor
        // hides it. The two are disjoint by construction: `isSimpleWall` requires
        // `!joinData?.startMN && !joinData?.endMN`, and L-955 is a JOINED corner.
        //
        // `rakeTopOffset(rake, 1, dir)` is the shear PER METRE and is null for a vertical
        // wall — which is why the block is SKIPPED at 90° rather than multiplying by an
        // identity (a no-op matrix would still rewrite every float; skipping keeps a
        // vertical wall byte-identical).
        if (!isVerticalRake(wall.rakeAngleDeg)) {
            const _k = rakeTopOffset(wall.rakeAngleDeg, 1, { x: worldEnd.x, z: worldEnd.z });
            if (_k) {
                const _y0 = wall.baseOffset ?? 0;
                geometry.applyMatrix4(new THREE.Matrix4().set(
                    1, _k.x, 0, -_k.x * _y0,
                    0, 1,    0, 0,
                    0, _k.z, 1, -_k.z * _y0,
                    0, 0,    0, 1,
                ));
            }
        }

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

    /**
     * §WALL-RAKE-JOINT-ONE-EDIT-BEHIND (founder 2026-08-09) — the level's
     * neighbour-rake content signature, read from the effective V2 cache.
     * `WallRebuildCoordinator._flush` folds this into its per-wall incremental
     * build memo (`_buildKey`) so the NEIGHBOUR of a raked wall is re-keyed —
     * without it, a rake edit on wall A left wall B's memo byte-identical and
     * the flush skipped B as "clean", so B's lofted top never followed the new
     * 3-D mitre line in the same mutation cycle. Empty on a level with no raked
     * wall, so unraked projects keep byte-identical memo keys.
     */
    public get rakeJointSignature(): string {
        return this.getEffectiveV2Cache()?.rakeJointSignature ?? '';
    }

    // ─── §CONNECT-3 — the retained junction index, read-only ─────────────────
    //
    // The orchestrator (`WallRebuildCoordinator._flush`) already calls
    // `refreshV2Cache` once per level rebuild; these three accessors let it read
    // what that refresh retained, WITHOUT reaching into the cache object or
    // re-running the resolver. They exist so the SemanticGraph writer can be landed
    // at the flush site (its own territory) without adding anything to this package.
    //
    // Every one of them is a pure read. The builder still owns geometry only.

    /** Every junction on the level this builder was last refreshed with, detection
     *  order. Empty ALSO when no cache exists — use {@link junctionsForWall} when the
     *  difference between "no junctions" and "no level" matters, which it usually does. */
    public get levelJunctions(): readonly WallJunctionRecord[] {
        return this.getEffectiveV2Cache()?.junctions ?? [];
    }

    /** The junctions one wall participates in — or a typed refusal naming why not.
     *  FAILURE ≠ EMPTINESS: see `WallPipelineV2Cache.junctionsFor`. */
    public junctionsForWall(wallId: string): WallJunctionQuery {
        const cache = this.getEffectiveV2Cache();
        if (!cache) {
            return {
                ok: false, wallId, reason: 'cache-not-refreshed',
                detail:
                    `junction lookup for wall ${wallId}: this WallFragmentBuilder holds no V2 ` +
                    `cache (refreshV2Cache has never run), so it cannot say whether that wall ` +
                    `has junctions`,
            };
        }
        return cache.junctionsFor(wallId);
    }

    /** §CONNECT-3 / audit §3 Q4 — the walls sharing a junction with `wallId`, as a
     *  LOOKUP rather than a resolver re-run. Refuses on the same two conditions. */
    public connectedWallIds(wallId: string): WallConnectivityQuery {
        const cache = this.getEffectiveV2Cache();
        if (!cache) {
            return {
                ok: false, wallId, reason: 'cache-not-refreshed',
                detail:
                    `connectivity lookup for wall ${wallId}: this WallFragmentBuilder holds no V2 ` +
                    `cache (refreshV2Cache has never run) — no answer, not an empty answer`,
            };
        }
        return cache.connectedWallIds(wallId);
    }

    private getEffectiveV2Cache(): WallPipelineV2Cache | null {
        // Orchestrator-populated cache wins if it carries any junctions.
        if (this._v2Cache && this._v2Cache.junctionEnds > 0) return this._v2Cache;
        // DevTools escape hatch — never set in production code paths.
        const fromGlobal = (globalThis as { __pryzmWallV2Cache?: WallPipelineV2Cache }).__pryzmWallV2Cache;
        return fromGlobal ?? this._v2Cache ?? null;
    }

    /**
     * §INSTANCE-MAT-SHARE (2026-07-01) — return a SHARED MeshStandardMaterial for the
     * given colour, minting one lazily the first time each colour is seen. Sharing is
     * what makes GPU instancing actually collapse draw calls: InstancedElementRenderer
     * keys its groups on `material.uuid`, so a per-wall material forces one group per
     * wall (no batching). All simple walls of the same colour on the same level then
     * share one InstancedMesh → one draw call.
     *
     * The colour is normalised through THREE.Color so equivalent inputs (`'#e8e8e8'`,
     * `0xe8e8e8`, `'rgb(232,232,232)'`) map to the same cache key and the same material.
     * The material carries no per-instance state (colour lives on the material, position
     * on the instance matrix), so sharing is fully safe. InstanceGroup.dispose() never
     * frees the material; this builder owns their lifetime and frees them in dispose().
     */
    private _getInstanceMaterial(colour: string | number): THREE.MeshStandardMaterial {
        const key = new THREE.Color(colour).getHexString();
        let mat = this._instanceMaterialCache.get(key);
        if (!mat) {
            mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(`#${key}`) });
            this._instanceMaterialCache.set(key, mat);
        }
        return mat;
    }

    private createWallMaterial(wall?: WallData): THREE.Material {
        // §L960-WHOLE-BODY-FINISH — the SECOND hole L-960 opened, measured rather
        // than assumed. `resolveLayerRenderFinishColor` returns null for
        // `layerCount <= 0`, and this function is the colour authority for every
        // PLAIN (non-layered) arm — curved bodies, opening-bearing segments, the CSG
        // and creased fallbacks. So a wall with no `layers` array at all (what
        // `RoomFinishResolver` calls *"plain — single-volume, not layered"*) dropped
        // its finish on the fragment path too, not only on the instanced one. Both
        // spellings were built and measured before this line was written; both read
        // the untouched default.
        //
        // A wall reaching here is drawn as ONE solid, so it has ONE surface and the
        // whole-body rule applies verbatim — exterior wins, and the caller discloses
        // that via `maskedSideAfterSetting` BEFORE it says "Done".
        const finishColour = wall ? resolveWholeBodyFinishColor(wall as never) : null;

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
                // An authored side finish is a deliberate, just-performed user action
                // and outranks both the library colour and the per-wall tint — the
                // alternative is a wall that silently disagrees with its own panel.
                if (finishColour) {
                    params.color = finishColour;
                } else if (wall?.materialColor && params.color === undefined) {
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
                color: finishColour || wall?.materialColor || WALL_REALISTIC_MATERIAL.color,
                roughness: WALL_REALISTIC_MATERIAL.roughness,
                metalness: WALL_REALISTIC_MATERIAL.metalness,
                envMap: this.hdriTexture,
                envMapIntensity: this.envMapIntensity,
                depthWrite: true,
                depthTest: true
            });
            return mat;
        } else {
            const color = finishColour || wall?.materialColor || WALL_SCHEMATIC_MATERIAL.color;
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
        // §FIX-WALL-VERSION-CONTENT-HASH (L-52): preserve the token buildWall()
        // already stamped on userData.version (before any branch reaches here);
        // do NOT re-read the raw _geometrySeq, which may have advanced for a
        // DIFFERENT wall since this build resolved its token. Fallback only for
        // a hypothetical caller that reached this helper without a prior stamp.
        if (ud.version === undefined) ud.version = this._geometrySeq;  // §NME-VERSION-FIX: see buildWall()
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
     * §PHASE-3 Task 3.3: empty a wall group before rebuilding it, releasing its
     * children's GPU buffers so a rebuild does not leak WebGLBuffer /
     * WebGLVertexArrayObject (WebGL) or GPUBuffer (WebGPU) allocations.
     *
     * §GPU-RESOURCE-LIFETIME (ADR-0297 INVARIANT L2) — "DETACH now, RELEASE at the
     * boundary" (L-944a). This method used to be
     *
     *     group.traverse(obj => { geometry.dispose(); material.dispose(); });
     *     group.clear();
     *
     * which destroyed every child's GPU buffers WHILE the child was still parented
     * to `group`, and `group` still parented to `this.scene`. That is INVARIANT L2(a)
     * inverted, and it is the ordering behind the whole draw-after-free family: the
     * furniture path's `setIndexBuffer … parameter 1 is not of type 'GPUBuffer'`, and
     * L-944's `Vertex buffer slot 0 … was not set` after `UNDO: CASCADE_WALL_BASELINE`.
     * The three.js backends delete their per-attribute record the instant
     * `BufferGeometry.dispose()` runs (`Geometries.initGeometry`'s onDispose listener),
     * so any draw encoded for a still-reachable mesh afterwards binds `undefined` and
     * the whole CommandBuffer is invalidated.
     *
     * `detachAndReleaseChildren()` performs BOTH halves in the right order: it clears
     * the group NOW (so this rebuild can repopulate it on the same tick, exactly as
     * `group.clear()` left it) and enqueues the detached subtrees for release at the
     * next frame boundary, where `RenderPipelineManager.render()` drains them. It is
     * the same helper curtain-wall, slab, ceiling, stair, furniture, roof, column and
     * InstanceGroup already use; the wall builder — the busiest rebuild path in the
     * app — was the one that was never migrated.
     *
     * Materials are still released (`disposeMaterials` defaults true): wall materials
     * are per-wall instances, not shared singletons. Anything genuinely cache-owned
     * must be stamped with `markSharedGpuResource()` (INVARIANT L1), which makes every
     * `safeDispose*` a no-op for it — ownership recorded on the resource, not inferred
     * by each disposer.
     */
    private _disposeWallGroupChildren(group: THREE.Group): void {
        detachAndReleaseChildren(group);
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

                    // QF-2: release geometry and materials for ALL fragment types,
                    // including 'wall-body'. The previous code excluded wall-body via
                    // an `!isWallBodyFragment` guard — this was a GPU memory leak.
                    // `scene.remove()` only detaches from the scene graph; the underlying
                    // WebGLBuffer and WebGLVertexArrayObject stay in VRAM until .dispose()
                    // is called explicitly. The isWallRoot check above already protects the
                    // persistent wallGroup root from being disposed prematurely.
                    //
                    // §GPU-RESOURCE-LIFETIME (ADR-0297 INVARIANT L2(b), L-944a) — the
                    // detach above is correct, but the release used to happen HERE, on
                    // the mutation tick. That tick is a store-event / undo tick, which has
                    // no relationship to the frame boundary; L2 requires the release to
                    // wait until the frame that last referenced the buffer has finished
                    // encoding AND submitting. Enqueue instead; the frame owner drains.
                    scheduleGpuRelease(fragment.mesh);
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
            safeDisposeMaterials(oldMat); // §I2 — WebGPU-safe
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
        // §INSTANCE-MAT-SHARE — free the shared instanced-wall materials (InstanceGroup
        // never disposes them; this builder owns their lifetime). WebGPU-safe (§I2).
        for (const mat of this._instanceMaterialCache.values()) safeDisposeMaterial(mat);
        this._instanceMaterialCache.clear();
    }
}