import * as THREE from '@pryzm/renderer-three/three';
// §GPU-RESOURCE-LIFETIME (ADR-0297, INVARIANT L2) — a slab rebuild/removal
// DETACHES its old subtree on the mutation tick and RELEASES the GPU resources
// at the next frame boundary (drained by RenderPipelineManager.render). The
// previous §I2 pattern disposed GPU buffers while the meshes were STILL PARENTED
// to the scene — the exact inverted ordering behind the founder's
// "setIndexBuffer … parameter 1 is not of type 'GPUBuffer'" hard stop on the
// furniture path. Same seam, same rule (pattern: InstanceGroup.dispose()).
import { detachAndReleaseChildren, scheduleGpuRelease } from '@pryzm/renderer-three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { SlabData } from './SlabTypes';
import { BimManager } from '@pryzm/core-app-model';
// §FEAT-SLAB-LOD (L-286) — the SLAB row of ADR-121's LOD matrix. The slab's LOD consumer
// is the MESH, because a slab has no plan symbol: in plan it lies BELOW the cut plane
// (ADR-121 §3.1, "— (below cut)"), and its section and elevation are PROJECTIONS OF THIS
// MESH. ADR-121 §4.3: "One resolver, three consumers — NOT a second symbol engine per view
// type." So the mesh gains (or loses) the assembly and section/elevation/3D inherit it,
// through the SAME `resolveEffectiveDetailLevel` the door, window and wall rows call.
import {
    resolveEffectiveDetailLevel, DEFAULT_3D_VIEW_ID, storeEventBus,
    type DetailLevel,
} from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { HostReferenceEdge, SketchLoop } from './SketchTypes';
import { WallFaceResolver } from './WallFaceResolver';
import { SketchLoopIntersector, Segment2D } from './SketchLoopIntersector';
import { outsetPolygon, SLAB_WALL_OUTSET } from './SlabGeometryUtils';
// §GR-10/GR-14 — the window-global opening-store read, DETERMINED.
import { readWindowOpeningsForDiagnostic } from './windowOpeningStoreDetermination';
// §REFUSE-NONSIMPLE-SLAB-RING (ADR-0299 §RECOVERY-MUST-REFUSE) — earcut's precondition,
// asserted before triangulation. Leaf subpath: pure maths, no second THREE import.
import { findRingSelfIntersection } from '@pryzm/core-app-model/ring-simplicity';
import { batchCoordinator } from '@pryzm/core-app-model';

// ─── §LOAD-FLOOD-GATE (2026-06-29) — slab-build timing-log gate ─────────────────
//
// Each slab build logs three timing lines (`outset`, `triangulate`,
// `BUILD_COMPLETE`). On a residential load these fire synchronously, once per
// slab × every floor, during the hot restore loop — pure main-thread console
// cost with DevTools open. Gate them behind an opt-in flag (default OFF) so a
// normal load pays zero; the BUILD timings stay one keystroke away for perf
// work. `__pryzmSlabBuildDiag` is the canonical name.
function slabBuildDiagOn(): boolean {
    return (globalThis as unknown as { __pryzmSlabBuildDiag?: boolean })
        .__pryzmSlabBuildDiag === true;
}

/**
 * B2: Render-mode descriptor for slab edge overlays.
 * '3d'  — default, subtle medium-grey, depth-tested, renderOrder=1.
 * 'plan' — sharp black, no depth-test, renderOrder=999 (always on top in plan view).
 *
 * Mirrors the WallEdgeOverlayBuilder pattern exactly.
 * Centralised here so WallEdgeVisibilityService.applyRenderMode() and the builder
 * always use the same values.
 */
export type SlabEdgeRenderMode = 'plan' | '3d';

export const SLAB_EDGE_MODE_SETTINGS: Record<SlabEdgeRenderMode, {
    color:       number;
    depthTest:   boolean;
    depthWrite:  boolean;
    renderOrder: number;
}> = {
    '3d': {
        color:       0x555555,
        depthTest:   true,
        depthWrite:  false,
        renderOrder: 1,
    },
    'plan': {
        color:       0x000000,
        depthTest:   false,
        depthWrite:  false,
        renderOrder: 999,
    },
};

/**
 * Apply a render mode to a single existing slab-edge LineSegments object.
 * Only operates on objects tagged with userData.elementType === 'SlabEdges'.
 * Safe to call on any arbitrary Object3D — no-ops if the tag is missing.
 *
 * Called by WallEdgeVisibilityService.applyRenderMode() during view switches.
 */
export function applySlabEdgeRenderMode(
    obj: THREE.Object3D,
    mode: SlabEdgeRenderMode
): void {
    if (
        obj.userData?.elementType !== 'SlabEdges' ||
        obj.userData?.role !== 'edges'
    ) return;

    const settings = SLAB_EDGE_MODE_SETTINGS[mode];
    const line = obj as THREE.LineSegments;
    const mat = line.material as THREE.LineBasicMaterial;
    if (!mat || !mat.isLineBasicMaterial) return;

    mat.color.setHex(settings.color);
    mat.depthTest  = settings.depthTest;
    mat.depthWrite = settings.depthWrite;
    mat.needsUpdate = true;
    line.renderOrder = settings.renderOrder;
}

/**
 * FIX-5 §03 §2.2 / §01 §3.5 — Dependency injection contract.
 *
 * All previously-window.* accessed dependencies are now provided at
 * construction time (or post-construction via setDeps()). The builder
 * no longer reads from or writes to the global window object.
 *
 * openingStore — read-only opening lookup for hole punching (§01 §4.3).
 * materialMap  — STANDARD_MATERIAL_LIBRARY id → MaterialDefinition map.
 * getVisualStyle — returns current VisualStyle enum value (0 = shaded, 1 = consistent).
 */
export interface SlabBuilderDeps {
    openingStore?: { getByHostId(id: string): any[] };
    materialMap?: Map<string, any>;
    getVisualStyle?: () => number;
}

export class SlabFragmentBuilder {
    private scene: THREE.Scene;
    private bimManager: BimManager | null;
    // C6 FIX §01 §4: Made private. External code must use getRootById() accessor.
    // A public Map allows any caller to add/remove entries, bypassing builder
    // encapsulation and breaking the single-root-per-id invariant.
    private slabRoots = new Map<string, THREE.Group>();

    /** FIX-5: Injected dependencies — replaces all window.* reads in this class. */
    private _deps: SlabBuilderDeps = {};

    // ── Phase 1: rAF-sliced build queue (mirrors CurtainWallBuilder pattern) ──
    /**
     * Maximum slab geometries built per animation frame during a batch operation.
     * Each slab build involves O(N²) triangulation — capping at 5 keeps the
     * per-frame main-thread budget under ~25 ms for typical polygon slabs.
     */
    private static readonly MAX_BUILDS_PER_FRAME = 5;
    /**
     * Pending slab builds queued by updateSlab() when batchCoordinator.isBatching.
     * Drained by _drainBuildQueue() over multiple rAF frames.
     * If the same slab is updated twice before its frame, the newer data wins.
     */
    private _pendingBuilds: SlabData[] = [];
    /** rAF handle for the drain loop — null when the drain is idle. */
    // D.7.5 batch #4: rAF handle replaced by FrameScheduler disposer.
    private _rafHandle: TickListenerDisposer | null = null;

    // ── §BATCH-SLAB-PAUSE: pause/resume control surface ──────────────────────
    /** True while BatchCoordinator is in the synchronous store-mutation phase.
     *  updateSlab() routes builds to _pausedBuilds instead of _pendingBuilds. */
    private _rebuildPaused = false;
    /** Slab data buffered while paused — transferred to _pendingBuilds on resume. */
    private _pausedBuilds: SlabData[] = [];

    /**
     * §FEAT-SLAB-LOD (L-286) — the last data + the tier each live slab was BUILT at.
     *
     * The Detail Level is a P7 visibility INTENT that lives on the ViewDefinition and in
     * the C09 override layer, so it MOVES while the model stands still. A builder that
     * reads it once at build time and never again is not a consumer — it is a snapshot,
     * and a snapshot is exactly the defect ADR-121 was written about ("change the detail
     * level and NOTHING happens"). These two maps let the view-definition subscription
     * below rebuild ONLY the slabs whose RESOLVED tier actually moved, so a no-op view
     * edit is free and a real one is immediate. (DoorBuilder, §FEAT-DOOR-3D-LOD.)
     */
    private _builtLod  = new Map<string, DetailLevel>();
    private _builtData = new Map<string, SlabData>();
    private _unsubscribeViews: (() => void) | null = null;

    constructor(scene: THREE.Scene, bimManager?: BimManager, deps: SlabBuilderDeps = {}) {
        this.scene = scene;
        this.bimManager = bimManager ?? null;
        this._deps = deps;
        this._unsubscribeViews = storeEventBus.subscribe((e) => {
            if (e.elementType !== 'view-definition' || e.elementId !== DEFAULT_3D_VIEW_ID) return;
            for (const [id, data] of this._builtData) {
                if (this._lodFor(data) !== this._builtLod.get(id)) this.updateSlab(data);
            }
        });
        // FIX-5: Removed window.slabBuilder = this;
        // Self-registration on window is the EngineBootstrap's responsibility.
        // Assigning window.slabBuilder here coupled the builder to the global
        // object and prevented testing / multi-instance scenarios.
    }

    /**
     * FIX-5: Post-construction dependency injection.
     *
     * EngineBootstrap calls this once openingStore and materialMap are available
     * (they are created after slabBuilder for ordering reasons). All subsequent
     * updateSlab() calls will use the injected deps.
     */
    setDeps(deps: SlabBuilderDeps): void {
        this._deps = { ...this._deps, ...deps };
    }

    /**
     * Phase 1 Dispatcher: routes slab update to either the rAF build queue
     * (batch mode) or the synchronous _buildSlab() path (interactive edits).
     *
     * During a batch (batchCoordinator.isBatching === true):
     *   - Pushes data to _pendingBuilds (deduplicating by id — newer data wins).
     *   - Schedules _drainBuildQueue() on the next rAF if not already running.
     *   - Returns immediately — NO synchronous triangulation occurs.
     *
     * Outside of a batch:
     *   - Calls _buildSlab(data) synchronously (unchanged interactive-edit behaviour).
     */
    updateSlab(data: SlabData): void {
        // §BATCH-SLAB-PAUSE: during the synchronous store-mutation phase, buffer
        // into _pausedBuilds (no rAF scheduled yet) — resumeAndFlush() will
        // transfer all builds to _pendingBuilds and schedule ONE drain pass.
        if (this._rebuildPaused) {
            const existingIdx = this._pausedBuilds.findIndex(b => b.id === data.id);
            if (existingIdx >= 0) {
                this._pausedBuilds[existingIdx] = data;
            } else {
                this._pausedBuilds.push(data);
            }
            return;
        }
        if (batchCoordinator.isBatching) {
            const existingIdx = this._pendingBuilds.findIndex(b => b.id === data.id);
            if (existingIdx >= 0) {
                this._pendingBuilds[existingIdx] = data;
            } else {
                this._pendingBuilds.push(data);
            }
            if (this._rafHandle === null) {
                // Sprint A33 (C11 §5.2/§6.1): canonical FrameScheduler.schedule() API.
                // Priority: 'pre-render' — slab geometry must land before the renderer pass.
                const FrameScheduler = getFrameScheduler();
                this._rafHandle = FrameScheduler.schedule('pre-render', () => this._drainBuildQueue());
            }
            return;
        }
        this._buildSlab(data);
    }

    // ── §BATCH-SLAB-PAUSE: public control surface ────────────────────────────

    /** Pause geometry scheduling — all incoming updateSlab() calls are buffered
     *  into _pausedBuilds.  Called by BatchCoordinator at the start of runBatch().
     *  Mirrors §BATCH-CW-PAUSE in CurtainWallBuilder. */
    pause(): void {
        this._rebuildPaused = true;
        this._pausedBuilds = [];
        console.debug('[SlabFragmentBuilder] §BATCH-SLAB-PAUSE: paused — buffering into _pausedBuilds');
    }

    /**
     * C13 §3.5 / Wave 35 I-4: Query whether the builder is currently paused.
     * Exposed on `window.__slabRebuildControl.isPaused()` so the project-switch
     * teardown handler and the OTel span can inspect the pause state safely
     * without accessing the private `_rebuildPaused` field directly.
     */
    isPaused(): boolean { return this._rebuildPaused; }

    /** Resume geometry scheduling.  Transfers all paused builds to _pendingBuilds
     *  and schedules ONE rAF drain pass.  Called by BatchCoordinator after fn()
     *  returns in runBatch() — collapses N individual schedules into one. */
    resumeAndFlush(): void {
        this._rebuildPaused = false;
        const n = this._pausedBuilds.length;
        if (n === 0) return;
        for (const data of this._pausedBuilds) {
            const existingIdx = this._pendingBuilds.findIndex(b => b.id === data.id);
            if (existingIdx >= 0) {
                this._pendingBuilds[existingIdx] = data;
            } else {
                this._pendingBuilds.push(data);
            }
        }
        this._pausedBuilds = [];
        if (this._rafHandle === null) {
            // Sprint A33 (C11 §5.2/§6.1): canonical FrameScheduler.schedule() API.
            const FrameScheduler = getFrameScheduler();
            this._rafHandle = FrameScheduler.schedule('pre-render', () => this._drainBuildQueue());
        }
        console.debug(`[SlabFragmentBuilder] §BATCH-SLAB-PAUSE: resumed — ${n} build(s) transferred to _pendingBuilds`);
    }

    /**
     * §F.2 — Async-only resume: same transfer logic as `resumeAndFlush()` but
     * uses `scheduleOnce('pre-render', ...)` so the drain is deferred to the
     * NEXT rAF tick instead of potentially executing inside the current
     * 'batch-coordinator-resume-flush' pre-render slot.  BatchCoordinator calls
     * this instead of `resumeAndFlush()` to prevent three concurrent synchronous
     * drain passes in a single pre-render slot (the LONGTASK root cause).
     */
    resume(): void {
        this._rebuildPaused = false;
        const n = this._pausedBuilds.length;
        if (n === 0) return;
        for (const data of this._pausedBuilds) {
            const existingIdx = this._pendingBuilds.findIndex(b => b.id === data.id);
            if (existingIdx >= 0) {
                this._pendingBuilds[existingIdx] = data;
            } else {
                this._pendingBuilds.push(data);
            }
        }
        this._pausedBuilds = [];
        if (this._rafHandle === null) {
            this._rafHandle = getFrameScheduler().scheduleOnce(
                'slab-builder-drain',
                () => this._drainBuildQueue(),
                'pre-render',
            );
        }
        console.debug(`[SlabFragmentBuilder] §F.2 resume — ${n} build(s) transferred to _pendingBuilds, 1 async pre-render drain scheduled.`);
    }

    // ── End §BATCH-SLAB-PAUSE ─────────────────────────────────────────────────

    /**
     * Phase 1: rAF drain — processes up to MAX_BUILDS_PER_FRAME queued slab
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

        // §F.3 — Check the shared rAF budget upfront; if another builder (e.g.
        // CurtainWallBuilder) already used the frame budget, defer to next tick.
        const budget = getFrameScheduler().getBatchBudget('batch-drain');
        if (budget && !budget.hasRemaining(__t_drain_start)) {
            this._rafHandle = getFrameScheduler().scheduleOnce(
                'slab-builder-drain',
                () => this._drainBuildQueue(),
                'pre-render',
            );
            console.log(
                `[SlabFragmentBuilder] §F.3 budget exhausted — deferring ${__queue_before} slab(s) to next rAF frame.`
            );
            return;
        }

        const batch = this._pendingBuilds.splice(0, SlabFragmentBuilder.MAX_BUILDS_PER_FRAME);
        for (const data of batch) {
            try {
                this._buildSlab(data);
            } catch (e) {
                console.error('[SlabFragmentBuilder] build error in rAF batch for slab', data.id, ':', e);
            }
        }
        const frameMs = performance.now() - __t_drain_start;
        // §F.3 — Record elapsed ms so the shared budget reflects this builder's usage.
        budget?.consume(frameMs);
        console.log(
            `[SlabFragmentBuilder] RAF_DRAIN built=${batch.length} remaining=${this._pendingBuilds.length} ` +
            `queueBefore=${__queue_before} frameMs=${frameMs.toFixed(1)}ms`
        );
        // §LOADING-REAL-PROGRESS (2026-07-01) — report live slab-drain progress to the
        // loading overlay (slabs are part of the structural pass).
        batchCoordinator.reportBuildProgress(batch.length, this._pendingBuilds.length, 'structure');
        if (this._pendingBuilds.length > 0) {
            // Sprint A33 (C11 §5.2/§6.1): canonical FrameScheduler.schedule() API.
            const FrameScheduler = getFrameScheduler();
            this._rafHandle = FrameScheduler.schedule('pre-render', () => this._drainBuildQueue());
        } else {
            if (batchCoordinator.isBatching) {
                console.log('[SlabFragmentBuilder] rAF queue drained — signalling BatchCoordinator.');
                batchCoordinator.signalBuildQueueDrained();
            }
        }
    }

    /**
     * Internal synchronous build: full slab geometry construction pipeline.
     * Called by updateSlab() when NOT batching, or by _drainBuildQueue() during
     * the rAF drain of a batch operation.
     *
     * Existing behaviour is fully preserved — this is the original updateSlab()
     * body, extracted to enable the rAF-sliced queue dispatcher above.
     */
    private _buildSlab(data: SlabData): void {
        // M8 §SLAB-SYSTEM-AUDIT-2026: Resolve world Y BEFORE creating or touching the
        // root Group. If resolveWorldY throws (missing level, missing BimManager), the
        // method exits with no scene mutation — no ghost root is left behind.
        const worldY = this.resolveWorldY(data);

        let root = this.slabRoots.get(data.id);

        if (!root) {
            root = new THREE.Group();
            // C8 FIX §02 §3.2: userData now includes both `type` (contract-required field)
            // and `elementType` (preserved for backward compat with inspector/selection code
            // that reads elementType === 'Slab'). The `version` field starts at 0 and is
            // incremented on each rebuild so consumers can detect stale references.
            root.userData = {
                id: data.id,
                type: 'slab',
                elementType: 'Slab',
                modelId: 'model-default',
                selectable: true,
                levelId: data.levelId,
                version: 0
            };

            Object.defineProperty(root.userData, 'id', { writable: false });
            Object.defineProperty(root.userData, 'elementType', { writable: false });
            // NOTE: 'type' is intentionally NOT frozen here.
            // Making userData.type non-writable triggers false-positive
            // [IMMUTABILITY GUARD] warnings on every pointerdown (BimWorld.ts dev-mode
            // traversal checks writable===false).  Contract §02 §3.5 permits builders
            // to write userData during build/rebuild; freezing violates that contract.
            // The field is set to 'slab' above and is semantically stable.

            this.scene.add(root);
            this.slabRoots.set(data.id, root);
            // §4 Projection-Only: elementRegistry.registerSemantic() is NOT called here.
            // Semantic registration is the exclusive responsibility of the command layer
            // (CreateSlabCommand.execute). The builder is a projection-only layer.
        }

        // Increment version counter on every rebuild so consumers can detect updates.
        elementRegistry.registerRoot(data.id, root);
        root.userData.version = (root.userData.version ?? 0) + 1;
        root.userData.levelId = data.levelId;
        root.userData.width = data.width;
        root.userData.depth = data.depth;
        root.userData.thickness = data.thickness;
        // M7 §SLAB-SYSTEM-AUDIT-2026: Delete stale userData fields instead of setting
        // them to undefined. Setting to undefined leaves the key on the object (and on
        // the serialised scene graph), which confuses inspector tools that check field
        // presence.  Explicitly delete so only truly-present fields are visible.
        if (data.materialColor !== undefined) {
            root.userData.materialColor = data.materialColor;
        } else {
            delete root.userData.materialColor;
        }
        if (data.materialId !== undefined) {
            root.userData.materialId = data.materialId;
        } else {
            delete root.userData.materialId;
        }
        root.userData.polygon = data.polygon
            ? data.polygon.map(p => ({ x: p.x, y: p.y }))
            : undefined;

        // §GPU-RESOURCE-LIFETIME (ADR-0297 L2) — detach NOW, release at the next
        // frame boundary. WAS `safeDisposeObject3D(root); root.clear()` — a
        // dispose-while-parented (invariant L2 violation): a frame encoded
        // between the dispose and the rebuild drew destroyed buffers.
        detachAndReleaseChildren(root);

        // ── Gizmo pivot: compute polygon centroid so TransformControls appears
        // at the visual centre of the slab, not at the project origin.
        // data.position.x/z is always 0 (set by SlabTool), so the centroid of
        // the polygon IS the desired world pivot point.
        // Child meshes are offset by -centroid so their world positions are unchanged.
        let pivotX = data.position.x;
        let pivotZ = data.position.z;
        const rawPoly = data.polygon
            ? data.polygon
            : (data.sketch ? SlabFragmentBuilder.resolveLoop(data.sketch.outerLoop) : null);
        if (rawPoly && rawPoly.length > 0) {
            let cx = 0, cz = 0;
            for (const p of rawPoly) { cx += p.x; cz += p.y; }
            pivotX += cx / rawPoly.length;
            pivotZ += cz / rawPoly.length;
        }
        // childOffsetX/Z: applied to every child mesh so world position = pivotXZ + (-pivotXZ) + polygon vertex = polygon vertex
        const childOffsetX = data.position.x - pivotX;
        const childOffsetZ = data.position.z - pivotZ;

        // §FEAT-SLAB-LOD (L-286) — the tier, from the ONE shared resolver. Recorded so
        // the view-definition subscription can tell a real change from a no-op.
        const lod = this._lodFor(data);
        this._builtLod.set(data.id, lod);
        this._builtData.set(data.id, data);

        // ADR-121 §4.2, section-100: "cut outline + poché as ONE region. NO LAYER BUILD-UP."
        // A slab at LOD 100 is one solid at its REAL total thickness (`data.thickness` is
        // already the sum of the stored layers — the same number the layered path walks
        // down from), so the tier changes the ARTICULATION and never a DIMENSION (L-127):
        // the top face, the soffit and the outline are in the same place at every tier.
        const showAssembly = lod !== 'coarse';

        if (Array.isArray(data.layers) && data.layers.length > 1 && showAssembly) {
            // ── Layered slab: stack one sub-mesh per layer ─────────────────────
            // ADR-121 §4.2, section-200: "poché per stored layer, principal build-up
            // lines, floor/ceiling assembly." This is EXACTLY what shipped before this
            // change, so LOD 200 is PINNED: no view setting can regress today's model.
            //
            // LOD 300 (`fine`) DRAWS THE SAME ASSEMBLY, AND THAT IS RECORDED, NOT FAKED.
            // §4.2's further section-300 additions — insulation hatch, fixings, junction
            // detail — are NOT in the slab record: `SlabLayer` carries {name, thickness,
            // function, materialColor} and nothing else, and a hatch is not a mesh in any
            // case (it would need a SECTION SYMBOL BUILDER, which nothing has — ADR-121
            // §5.2 item 5). Inventing a fixing the record does not know about is the exact
            // trap §4.4 names: "a richer HARDCODED glyph is the same bug at higher
            // resolution." So for a slab, LOD 300 ⊇ LOD 200 WITH EQUALITY, and the empty
            // cell stays visible in the matrix instead of being papered over.
            // Layers are ordered top-to-bottom (Revit convention).
            // Y=0 is the slab bottom; Y=totalThickness is the top.
            let yOffset = data.thickness; // start at the top face
            for (const layer of data.layers) {
                const layerThickness = layer.thickness;
                if (!layerThickness || layerThickness <= 0) continue;
                const yBottom = yOffset - layerThickness;
                const layerData = {
                    ...data,
                    thickness: layerThickness,
                    materialColor: layer.materialColor ?? data.materialColor ?? '#909090',
                    materialId: undefined, // per-layer colour overrides materialId
                };
                const { mesh: lMesh, edges: lEdges } = SlabFragmentBuilder.createSlabMeshWithEdges(layerData, {}, this._deps);
                // Shift sub-mesh up to the correct vertical band, and laterally to
                // compensate for the root pivot being at the polygon centroid.
                //
                // §FIX-SLAB-LAYER-BOX-HALF-DROP (2026-08-07, found by the L-127
                // dimensional-truth guard in SlabDetailLevel.test.ts): a polygon
                // layer's geometry spans [0, t] so `yBottom` is its floor — but the
                // BoxGeometry FALLBACK (no polygon) is CENTRED on its origin, so
                // placing it at `yBottom` sank every box layer by t/2: the top face
                // sat half the finish-layer low and the soffit half the structure
                // low (90 mm on a 180 mm RC layer). Same box-vs-polygon offset rule
                // the plain-slab branch below already applies.
                const lIsBox = lMesh.geometry instanceof THREE.BoxGeometry;
                const lY = lIsBox ? yBottom + layerThickness / 2 : yBottom;
                lMesh.position.set(childOffsetX, lY, childOffsetZ);
                lEdges.position.set(childOffsetX, lY, childOffsetZ);
                // P1.4: Defer shadow flags during batch — post-batch _enableShadowsOnScene
                // runs once at batch-end via batchCoordinator.setPostBatchCallback (P1.3).
                if (batchCoordinator.isBatching) {
                    lMesh.castShadow    = false;
                    lMesh.receiveShadow = false;
                }
                root.add(lMesh);
                root.add(lEdges);
                yOffset = yBottom;
            }
        } else {
            // ── Plain slab: single mesh (existing behaviour) ────────────────────
            const { mesh, edges } = SlabFragmentBuilder.createSlabMeshWithEdges(data, {}, this._deps);
            // Offset child laterally to compensate for the root pivot being at the centroid.
            // For BoxGeometry the existing Y offset (thickness/2) is preserved.
            const isBox = (mesh.geometry instanceof THREE.BoxGeometry);
            mesh.position.set(childOffsetX, isBox ? data.thickness / 2 : 0, childOffsetZ);
            edges.position.set(childOffsetX, isBox ? data.thickness / 2 : 0, childOffsetZ);
            // P1.4: Defer shadow flags during batch — post-batch _enableShadowsOnScene
            // runs once at batch-end via batchCoordinator.setPostBatchCallback (P1.3).
            if (batchCoordinator.isBatching) {
                mesh.castShadow    = false;
                mesh.receiveShadow = false;
            }
            root.add(mesh);
            root.add(edges);
        }

        // M8: worldY was resolved at the start of _buildSlab (before any scene mutation).
        root.position.set(pivotX, worldY, pivotZ);
    }

    /**
     * §FEAT-SLAB-LOD (L-286) — the effective Detail Level for this slab IN THE 3D VIEW.
     *
     * ADR-121 §4.3 — ONE resolver, three consumers. This is the same
     * `resolveEffectiveDetailLevel` the wall/door/window plan symbols call; the slab owns
     * none of the precedence (C09 element → element-type → category override → the 3D
     * view's own `output.detailLevel` → the L0 default). There is deliberately no private
     * `detailed` flag and no `resolveSlabDetailLevel`.
     *
     * WHY `DEFAULT_3D_VIEW_ID` AND NOT THE SECTION'S OWN ID: the section and the elevation
     * are PROJECTIONS of this mesh — one mesh, many views — so the mesh can only carry one
     * tier, and the 3D ViewDefinition is the one that owns the model's articulation. This
     * is the same compromise the door and window rows made (ADR-121 §4.3), and its
     * consequence (a SECTION view's own dial cannot re-articulate the mesh) is recorded in
     * the matrix rather than hidden behind a second resolver.
     */
    private _lodFor(data: SlabData): DetailLevel {
        return resolveEffectiveDetailLevel(data.id, DEFAULT_3D_VIEW_ID, {
            elementType: 'slab',
            category:    'slab',
        });
    }

    getRootById(id: string): THREE.Group | undefined {
        return this.slabRoots.get(id);
    }

    /**
     * §FEAT-SLAB-LOD (L-286) — release the view-definition subscription.
     *
     * The builder is an application singleton, so in production this runs at teardown;
     * a test that constructs several builders calls it so the detail-level listeners do
     * not accumulate across cases.
     */
    dispose(): void {
        this._unsubscribeViews?.();
        this._unsubscribeViews = null;
    }

    /**
     * §C13-BUILDER-SCENE-CLEAR — detach EVERY slab root from the scene, without
     * tearing the builder down.
     *
     * Note what `dispose()` above does NOT do: it releases the view subscription and
     * leaves every slab root parented to the scene. So `dispose()` was never a C13
     * teardown for this builder — calling it at a project switch removed no geometry
     * AND killed the LOD listener the next project needs. This method is the correct
     * project-switch verb (C13 §3.8/§3.10): geometry only, idempotent, re-buildable.
     * Invoked by the `bim-project-cleared` sweep in `initBuilders.ts`.
     */
    clearProjectGeometry(): void {
        this._pendingBuilds = [];
        this._pausedBuilds = [];
        for (const id of [...this.slabRoots.keys()]) this.removeSlab(id);
    }

    removeSlab(id: string): void {
        // M6 §SLAB-SYSTEM-AUDIT-2026: Evict any pending build for this slab so the
        // rAF drain does not try to rebuild a slab that has already been removed.
        // Without this, a queued _pendingBuilds entry outlives the remove, rebuilds the
        // slab root in the scene, and elementRegistry.registerRoot() re-enters the id —
        // producing a ghost mesh that persists until the next full scene rebuild.
        this._pendingBuilds = this._pendingBuilds.filter(b => b.id !== id);
        this._pausedBuilds = this._pausedBuilds.filter(b => b.id !== id);
        // §FEAT-SLAB-LOD (L-286) — a removed slab must not be resurrected by a later
        // detail-level change: drop it from the rebuild-on-intent-change bookkeeping.
        this._builtLod.delete(id);
        this._builtData.delete(id);

        const root = this.slabRoots.get(id);
        if (root) {
            // §GPU-RESOURCE-LIFETIME (ADR-0297 L2) — DETACH first (the scene can
            // no longer reach the subtree), then queue the GPU release for the
            // next frame boundary. WAS: dispose-while-parented, then
            // scene.remove — a frame encoded in between drew destroyed buffers.
            this.scene.remove(root);
            this.slabRoots.delete(id);
            elementRegistry.unregister(id);
            scheduleGpuRelease(root);
        }
    }

    /**
     * §5 / §13 Spatial Authority — HARD FAILURE CONTRACT:
     * World Y MUST be derived from BimManager.getLevelById(levelId).elevation.
     * Silent fallback to 0 or stored position.y is FORBIDDEN by the contract.
     * If the level cannot be resolved, this method throws a SpatialAuthorityError
     * so the failure is visible immediately rather than producing silent ghost geometry.
     */
    private resolveWorldY(data: SlabData): number {
        const baseOffset = data.baseOffset ?? 0;

        if (!this.bimManager) {
            throw new Error(
                `[SpatialAuthorityError] SlabFragmentBuilder has no BimManager. ` +
                `Cannot resolve world Y for slab "${data.id}".`
            );
        }

        if (!data.levelId) {
            throw new Error(
                `[SpatialAuthorityError] Slab "${data.id}" has no levelId. ` +
                `Cannot resolve world Y.`
            );
        }

        const level = this.bimManager.getLevelById(data.levelId);
        if (level === undefined) {
            throw new Error(
                `[SpatialAuthorityError] Level "${data.levelId}" not found in BimManager ` +
                `for slab "${data.id}". Store and BimManager are out of sync. ` +
                `Ensure CreateSlabCommand registered the slab on a valid level.`
            );
        }

        const topY = level.elevation + baseOffset;
        return topY - data.thickness;
    }

    /**
     * THE production sketch→polygon resolution — the one function that decides
     * where a sketch-bearing slab IS (C79 §5.1: deterministically re-derivable
     * from references + the current state of the bounding elements).
     *
     * §FIX-SLAB-POLYGON-WRITEBACK (2026-08-13): visibility widened from
     * `private` to public. `SlabDependencyTracker.reprojectStoredPolygon()` now
     * persists this function's result into `SlabData.polygon` on a wall move, so
     * the RECORD follows the same line the MESH is drawn on. Re-implementing the
     * resolution there (WallFaceResolver.resolveOrFallback +
     * SketchLoopIntersector.computePolygon, re-composed) would let the record
     * drift from the drawn geometry — the exact two-paths defect C79 §0/§7.4
     * forbids — so the ONE implementation is shared instead. It was already
     * consumed through the class by `c79MovePropagation.test.ts` and
     * `check-move-propagation.ts` (TS `private` is compile-time only); this
     * makes that API honest.
     *
     * Returns null when any HostReferenceEdge fails to resolve AND carries no
     * fallback — the caller must treat that as C79 §5.2 `undetermined`, never
     * as an empty ring.
     */
    static resolveLoop(loop: SketchLoop): { x: number; y: number }[] | null {
        const segments: (Segment2D | null)[] = [];

        for (const edge of loop.edges) {
            if (edge.type === 'freeLine') {
                segments.push({ start: edge.start, end: edge.end });
            } else {
                const segment = WallFaceResolver.resolveOrFallback(edge as HostReferenceEdge);
                if (!segment) {
                    console.warn(
                        `[SlabFragmentBuilder] HostReferenceEdge to wall ` +
                        `"${(edge as HostReferenceEdge).hostId}" could not be resolved.`
                    );
                    return null;
                }
                segments.push(segment);
            }
        }

        const polygon = SketchLoopIntersector.computePolygon(segments);
        return polygon ?? null;
    }

    /**
     * §REFUSE-NONSIMPLE-SLAB-RING — ADR-0299 §RECOVERY-MUST-REFUSE (2026-08-07).
     *
     * `THREE.ShapeUtils.triangulateShape` is earcut, and earcut's CONTRACT REQUIRES
     * A SIMPLE RING. It does not degrade gracefully on a self-intersecting one: it
     * emits triangles that fall OUTSIDE the polygon. On the founder's roof-by-region
     * slab (SB002, 77 vertices) those stray triangles were the dark wedges punched
     * through the top surface — geometry that is wrong but plausible enough to be
     * read as a modelling quirk, which is precisely the failure mode ADR-0299 was
     * written about.
     *
     * §FIX-REGION-RING-PRETRIM-FRAME fixes the upstream producer (`SlabRegionTracer`
     * traced a mixed pre/post-trim arc that overshot and crossed its neighbours), so
     * rings should now arrive simple. This gate exists because "should" is not a
     * guarantee: ANY future producer — a sketch loop, an imported profile, an outset
     * that folds a thin concave neck — can hand us a crossing ring, and a corrupt
     * ring must NEVER be silently rendered again.
     *
     * Applying ADR-0299's own test — *"if the thing I am repairing were impossible by
     * construction, would I notice?"* — a slab ring crossing itself is impossible by
     * construction, so this branch refuses rather than repairs. It does NOT call
     * `repairToSimplePolygon`: an invented ring is exactly the plausible-looking
     * output the ADR forbids.
     *
     * @returns a refusal reason (already logged) when a ring is not simple, else null.
     */
    private static refuseNonSimpleRings(
        slabId: string,
        sourcePolygon: { x: number; y: number }[],
        buildPolygon: { x: number; y: number }[],
        holes: { x: number; y: number }[][],
    ): string | null {
        const describe = (
            label: string,
            ring: { x: number; y: number }[],
            hit: { i: number; j: number },
        ): string => {
            const at = (k: number) => {
                const p = ring[k % ring.length]!;
                return `[${p.x.toFixed(3)}, ${p.y.toFixed(3)}]`;
            };
            return `${label} (${ring.length} vertices) crosses itself: `
                + `edge ${hit.i}→${hit.i + 1} ${at(hit.i)}→${at(hit.i + 1)} `
                + `crosses edge ${hit.j}→${hit.j + 1} ${at(hit.j)}→${at(hit.j + 1)}`;
        };

        // The OUTER ring, checked in BOTH frames, because which one is broken says
        // where to look: the traced/authored ring, or `outsetPolygon` folding it.
        const srcHit = sourcePolygon.length >= 3 ? findRingSelfIntersection(sourcePolygon) : null;
        const buildHit = findRingSelfIntersection(buildPolygon);
        if (srcHit || buildHit) {
            const detail = srcHit
                ? `${describe('SOURCE outer ring', sourcePolygon, srcHit)} `
                  + `— the ring arrived non-simple, so the PRODUCER is at fault `
                  + `(region tracer / sketch loop / imported profile), not the outset.`
                : `${describe('OUTSET outer ring', buildPolygon, buildHit!)} `
                  + `— the SOURCE ring is simple, so outsetPolygon(SLAB_WALL_OUTSET) `
                  + `folded it (typically a thin concave neck narrower than the outset).`;
            const reason = `§REFUSE-NONSIMPLE-SLAB-RING slabId="${slabId}" — ${detail}`;
            console.error(
                `[SlabFragmentBuilder] ${reason}\n`
                + `  REFUSING to triangulate. earcut requires a simple ring; given this one it `
                + `would emit triangles OUTSIDE the polygon (the dark wedges in the roof-by-region `
                + `report). Per ADR-0299 §RECOVERY-MUST-REFUSE this slab is built as a plain box `
                + `and marked degraded rather than rendered as though it were authored geometry.`,
            );
            return reason;
        }

        for (let h = 0; h < holes.length; h++) {
            const hole = holes[h]!;
            if (hole.length < 3) continue;
            const hit = findRingSelfIntersection(hole);
            if (!hit) continue;
            const reason = `§REFUSE-NONSIMPLE-SLAB-RING slabId="${slabId}" — `
                + `${describe(`hole[${h}]`, hole, hit)}`;
            console.error(
                `[SlabFragmentBuilder] ${reason}\n`
                + `  REFUSING to triangulate. A self-intersecting HOLE contour makes earcut punch `
                + `the void outside the slab. Per ADR-0299 §RECOVERY-MUST-REFUSE this slab is built `
                + `as a plain box and marked degraded.`,
            );
            return reason;
        }

        return null;
    }

    /** Shoelace signed area. Positive = CCW, Negative = CW (Y-up). */
    private static signedArea2D(pts: { x: number; y: number }[]): number {
        let area = 0;
        const n = pts.length;
        for (let i = 0; i < n; i++) {
            const j = (i + 1) % n;
            area += pts[i].x * pts[j].y;
            area -= pts[j].x * pts[i].y;
        }
        return area / 2;
    }

    /**
     * Builds a fully capped slab BufferGeometry from a 2D polygon with optional holes.
     *
     * Polygon coords: x = world X, y = world Z.
     * Bottom cap at Y=0, top cap at Y=thickness.
     *
     * Holes are punched through both caps (top + bottom) using
     * THREE.ShapeUtils.triangulateShape, and inner wall quads are added for
     * each hole edge so the void is fully enclosed.
     *
     * @param polygon  Outer boundary in XZ coords (any winding — normalised internally).
     * @param thickness Slab thickness (metres).
     * @param holes    Optional array of hole polygons (XZ coords, any winding).
     *                 Supports both SlabData.holes (HOLLOW_SLAB) and openingStore profiles.
     */
    private static buildSlabGeometry(
        polygon: { x: number; y: number }[],
        thickness: number,
        holes: { x: number; y: number }[][] = []
    ): THREE.BufferGeometry {
        // ── Normalise outer to CCW (positive signed area) ─────────────────
        const outerPts = SlabFragmentBuilder.signedArea2D(polygon) >= 0
            ? polygon.slice()
            : polygon.slice().reverse();

        // ── Normalise holes to CW (negative signed area, as required by
        //    THREE.ShapeUtils.triangulateShape for hole contours) ──────────
        const validHoles: { x: number; y: number }[][] = holes
            .filter(h => h.length >= 3)
            .map(hole => {
                const area = SlabFragmentBuilder.signedArea2D(hole);
                // CW = negative signed area
                return area <= 0 ? hole.slice() : hole.slice().reverse();
            });

        // Flatten vertex list: [outer, ...hole0, ...hole1, ...] for triangulateShape
        const allPts: { x: number; y: number }[] = [...outerPts];
        for (const h of validHoles) allPts.push(...h);

        const outerVerts2D = outerPts.map(p => new THREE.Vector2(p.x, p.y));
        const holeVerts2D  = validHoles.map(h => h.map(p => new THREE.Vector2(p.x, p.y)));

        // triIndices reference into the flattened allPts array
        const triIndices = THREE.ShapeUtils.triangulateShape(outerVerts2D, holeVerts2D);

        const positions: number[] = [];
        const normals:   number[] = [];
        const indices:   number[] = [];

        // ── TOP CAP — Y = thickness, normal = (0, +1, 0) ──────────────────
        const topBase = 0;
        for (const p of allPts) {
            positions.push(p.x, thickness, p.y);
            normals.push(0, 1, 0);
        }
        // ShapeUtils CCW in 2D → for +Y face reverse each triangle to get
        // correct CCW winding in 3D XZ (so normal faces up).
        for (const [a, b, c] of triIndices) {
            indices.push(topBase + a, topBase + c, topBase + b);
        }

        // ── BOTTOM CAP — Y = 0, normal = (0, -1, 0) ───────────────────────
        const botBase = allPts.length;
        for (const p of allPts) {
            positions.push(p.x, 0, p.y);
            normals.push(0, -1, 0);
        }
        // Bottom face (normal -Y): CCW winding — same order as ShapeUtils output.
        for (const [a, b, c] of triIndices) {
            indices.push(botBase + a, botBase + b, botBase + c);
        }

        // ── OUTER SIDE FACES — one quad per outer edge ────────────────────
        const nOuter = outerPts.length;
        for (let i = 0; i < nOuter; i++) {
            const j = (i + 1) % nOuter;

            const ax = outerPts[i].x, az = outerPts[i].y;
            const bx = outerPts[j].x, bz = outerPts[j].y;
            const ex = bx - ax, ez = bz - az;
            const len = Math.sqrt(ex * ex + ez * ez) || 1;
            // Outward normal for CCW polygon: right-hand perpendicular of edge direction
            const nx =  ez / len;
            const nz = -ex / len;

            const base = positions.length / 3;

            //  3 ──── 2   (top)
            //  |      |
            //  0 ──── 1   (bottom)
            positions.push(ax, 0,         az);  // 0
            positions.push(bx, 0,         bz);  // 1
            positions.push(bx, thickness, bz);  // 2
            positions.push(ax, thickness, az);  // 3

            normals.push(nx, 0, nz);
            normals.push(nx, 0, nz);
            normals.push(nx, 0, nz);
            normals.push(nx, 0, nz);

            indices.push(base, base + 1, base + 2);
            indices.push(base, base + 2, base + 3);
        }

        // ── HOLE INNER WALL FACES — one quad per hole edge ────────────────
        // Each hole is CW, so the normal formula produces inward-facing normals
        // (pointing into the void), which is the visible face of the inner wall.
        // Winding is reversed relative to outer sides so the face is CCW when
        // viewed from inside the hole.
        for (const hole of validHoles) {
            const nh = hole.length;
            for (let i = 0; i < nh; i++) {
                const j = (i + 1) % nh;

                const ax = hole[i].x, az = hole[i].y;
                const bx = hole[j].x, bz = hole[j].y;
                const ex = bx - ax, ez = bz - az;
                const len = Math.sqrt(ex * ex + ez * ez) || 1;
                // For CW hole polygon, same formula gives the inward normal
                // (pointing toward the centre of the void — the visible face).
                const nx =  ez / len;
                const nz = -ex / len;

                const base = positions.length / 3;

                positions.push(ax, 0,         az);  // 0
                positions.push(bx, 0,         bz);  // 1
                positions.push(bx, thickness, bz);  // 2
                positions.push(ax, thickness, az);  // 3

                normals.push(nx, 0, nz);
                normals.push(nx, 0, nz);
                normals.push(nx, 0, nz);
                normals.push(nx, 0, nz);

                // Reversed winding: CCW when viewed from inside the hole
                indices.push(base, base + 2, base + 1);
                indices.push(base, base + 3, base + 2);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('normal',   new THREE.Float32BufferAttribute(normals,   3));
        geo.setIndex(indices);
        geo.computeBoundingBox();
        geo.computeBoundingSphere();

        return geo;
    }

    /**
     * FIX-5: Extended signature — accepts optional `deps` as the third argument.
     *
     * When called from updateSlab() the instance passes `this._deps` so the method
     * uses injected openingStore, materialMap and getVisualStyle instead of window.*.
     * External callers that omit `deps` receive the old behaviour (no openings, default
     * material fallback) — this is safe because those paths do not need opening holes.
     *
     * The static alias createSlabMesh() is preserved for backward compat.
     */
    static createSlabMeshWithEdges(
        data: SlabData,
        options: { renderMode?: SlabEdgeRenderMode } = {},
        deps: SlabBuilderDeps = {}
    ): {
        mesh: THREE.Mesh;
        edges: THREE.Object3D;
    } {
        const renderMode = options.renderMode ?? '3d';
        const edgeSettings = SLAB_EDGE_MODE_SETTINGS[renderMode];
        const resolvedPolygon: { x: number; y: number }[] | null =
            data.sketch
                ? SlabFragmentBuilder.resolveLoop(data.sketch.outerLoop)
                : (data.polygon ?? null);

        // ── Collect all holes to punch through the slab geometry ──────────
        // Source 1: SlabData.holes — set by HOLLOW_SLAB tool at creation time.
        const semanticHoles: { x: number; y: number }[][] = data.holes ?? [];

        // Source 2: OpeningStore — holes added post-creation via the Opening tool.
        // Builder reads openingStore read-only for projection purposes only (§01 §4.3).
        // FIX-5: resolved from injected deps, not from window.openingStore.
        const openingHoles: { x: number; y: number }[][] = [];
        const openingStore = deps.openingStore;
        if (openingStore) {
            const openings: any[] = openingStore.getByHostId(data.id);
            for (const opening of openings) {
                if (opening.profile && opening.profile.length >= 3) {
                    // profile may be Vector2 instances or plain {x,y} objects
                    // (structuredClone in OpeningStore converts Vector2 to plain objects)
                    openingHoles.push(
                        opening.profile.map((p: any) => ({ x: p.x, y: p.y }))
                    );
                }
            }
        }

        const allHoles: { x: number; y: number }[][] = [...semanticHoles, ...openingHoles];

        // O1-FIX diagnostic: log hole count so opening wiring failures are visible.
        if (openingHoles.length > 0) {
            console.log(`[SlabFragmentBuilder] opening holes slabId="${data.id}" count=${openingHoles.length}`);
        } else if (window.openingStore) { // TODO(TASK-08)
            // §GR-10/GR-14 — `check-no-empty-means-unknown` ARM B. This branch used
            // to read:
            //
            //     const winOpenings: any[] = window.openingStore.getByHostId?.(data.id) ?? [];
            //     if (winOpenings.length > 0) { console.warn('DEPS NOT INJECTED …'); }
            //
            // and it silently DISABLED ITSELF in exactly the situation it exists to
            // detect. The optional call `?.` plus `?? []` collapses three cases into
            // one empty array: the slab genuinely has no openings; the window store
            // carries no `getByHostId` at all; and the call threw. Only the first is
            // an answer — and in the other two, `winOpenings.length > 0` is false, so
            // the warning that a legacy bootstrap path is in use NEVER PRINTS. A
            // diagnostic whose failure mode is silence is not a diagnostic; this is
            // the same defect one layer down from the one it was written to catch.
            //
            // Vocabulary: `RELATIONSHIP_NOT_READABLE`, the C78 §8.1 member for "the
            // substrate that would answer is absent or threw". Nothing is minted and
            // nothing is extended; the member is restated as a literal because
            // `@pryzm/command-bus` is not a declared dependency of this package (the
            // same reasoning as `boundingWallDetermination` / `storeReadDetermination`
            // / `roomStoreDetermination`), and the companion test pins it against the
            // command-bus source so a drift in the closed union fails a test rather
            // than forking in silence.
            const probe = readWindowOpeningsForDiagnostic(window.openingStore, data.id); // TODO(TASK-08)
            if (probe.kind === 'undetermined') {
                console.warn(
                    `[SlabFragmentBuilder] RELATIONSHIP_NOT_READABLE — could not ask window.openingStore ` +
                    `about slab "${data.id}": ${probe.detail}. This is NOT "the slab has no openings"; ` +
                    `it is "nobody looked", and the legacy-bootstrap check below could not run.`,
                );
            } else if (probe.openings.length > 0) {
                console.warn(`[SlabFragmentBuilder] DEPS NOT INJECTED — ${probe.openings.length} opening(s) on slab "${data.id}" found via window.openingStore but NOT via deps. Call slabBuilder.setDeps({ openingStore }) in initBuilders.`); // TODO(TASK-08)
            }
        }

        let geometry: THREE.BufferGeometry;
        // §REFUSE-NONSIMPLE-SLAB-RING (ADR-0299) — set when a ring failed earcut's
        // precondition; carried onto the mesh so the degraded box is never mistaken
        // for authored geometry by anything downstream.
        let degradedReason: string | null = null;

        const __t_build_start = performance.now();
        if (resolvedPolygon && resolvedPolygon.length >= 3) {
            // I1 (Pascal integration): Expand the outer polygon outward by SLAB_WALL_OUTSET
            // so that the slab geometry seats under adjacent walls, eliminating visible gaps.
            // Only the outer boundary is outset — holes are voids and must NOT be expanded.
            const __t_outset_start = performance.now();
            const buildPolygon = outsetPolygon(resolvedPolygon, SLAB_WALL_OUTSET);
            const __t_tri_start = performance.now();
            // §REFUSE-NONSIMPLE-SLAB-RING — assert earcut's precondition BEFORE
            // triangulating. See refuseNonSimpleRings() for why this is a refusal and
            // not a repair.
            degradedReason = SlabFragmentBuilder.refuseNonSimpleRings(
                data.id, resolvedPolygon, buildPolygon, allHoles,
            );
            geometry = degradedReason
                ? new THREE.BoxGeometry(data.width, data.thickness, data.depth)
                : SlabFragmentBuilder.buildSlabGeometry(buildPolygon, data.thickness, allHoles);
            // §LOAD-FLOOD-GATE — per-slab timing logs gated (default OFF).
            if (slabBuildDiagOn()) {
                console.log(`[SlabFragmentBuilder] outset slabId="${data.id}" vertices=${resolvedPolygon.length} elapsed=${(__t_tri_start - __t_outset_start).toFixed(1)}ms`);
                console.log(`[SlabFragmentBuilder] triangulate slabId="${data.id}" outerVertices=${buildPolygon.length} elapsed=${(performance.now() - __t_tri_start).toFixed(1)}ms`);
            }
        } else {
            // BoxGeometry fallback — holes not supported without a polygon outline.
            geometry = new THREE.BoxGeometry(data.width, data.thickness, data.depth);
        }

        // ── Material ───────────────────────────────────────────────────────
        // FIX-5: materialMap and visualStyle resolved from injected deps, not from
        // window.materialMap / window.projectContext.
        let material: THREE.Material;
        const materialMap = deps.materialMap;

        if (data.materialId && materialMap) {
            const matDef = materialMap.get(data.materialId);
            if (matDef) {
                const params = { ...matDef.params } as any;
                const visualStyle = deps.getVisualStyle ? deps.getVisualStyle() : 0;
                if (visualStyle === 1) {
                    params.metalness = 0;
                    params.roughness = 1;
                } else if (matDef.textures) {
                    params.map = matDef.textures.color;
                    params.normalMap = matDef.textures.normal;
                    params.roughnessMap = matDef.textures.roughness;
                }
                // DoubleSide ensures sides render correctly for any polygon winding.
                params.side = THREE.DoubleSide;
                material = new THREE.MeshStandardMaterial(params);
            } else {
                material = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(data.materialColor || '#808080'),
                    side: THREE.DoubleSide,
                    roughness: 0.8,
                    metalness: 0.0
                });
            }
        } else {
            material = new THREE.MeshStandardMaterial({
                color: new THREE.Color(data.materialColor || '#808080'),
                side: THREE.DoubleSide,
                roughness: 0.8,
                metalness: 0.0
            });
        }

        // ── Solid mesh ─────────────────────────────────────────────────────
        const mesh = new THREE.Mesh(geometry, material);

        const isBoxGeom = geometry instanceof THREE.BoxGeometry;
        mesh.position.set(0, isBoxGeom ? data.thickness / 2 : 0, 0);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData = {
            id: data.id,
            parentId: data.id,
            elementType: 'SlabPart',
            modelId: 'model-default',
            role: 'geometry',
            selectable: false,
            // §REFUSE-NONSIMPLE-SLAB-RING (ADR-0299 §4: "where a recovery does proceed,
            // its output MUST be marked degraded — not returned as though it were
            // authored data"). Absent on every healthy slab.
            ...(degradedReason ? { degraded: degradedReason } : {}),
        };

        // ── Edge overlay (Doc 20 — WebGPU-compatible LineBasicMaterial) ────
        // Previously used LineSegments2 + LineMaterial (GLSL ShaderMaterial).
        // LineMaterial is incompatible with the WebGPU TSL renderer and caused
        // a "LineMaterial is not compatible" error on every animation frame,
        // producing continuous flicker and shadow-texture corruption.
        // THREE.LineBasicMaterial has a built-in TSL fallback — no flicker.
        // renderOrder=1 + depthWrite=false prevent Z-fighting with the slab face (Doc 22).
        const rawEdgesGeo = new THREE.EdgesGeometry(geometry, 30);

        // Doc 22 fix: polygonOffset on LineBasicMaterial sets depthBias in the WebGPU
        // pipeline descriptor. The WebGPU spec forbids non-zero depthBias for
        // PrimitiveTopology::LineList — device.createRenderPipeline() rejects it on
        // every frame that a slab edge overlay is present, causing continuous flicker.
        // Solution: depthWrite:false is WebGPU-safe and prevents Z-fighting by
        // ensuring edge lines never compete with face geometry in the depth buffer.
        // renderOrder provided by edgeSettings (1 for 3D, 999 for plan).
        //
        // B2: In 'plan' mode depthTest=false and renderOrder=999 ensure slab edges
        // always draw on top of slab face geometry in top-down orthographic projection.
        const lineMat = new THREE.LineBasicMaterial({
            color:      edgeSettings.color,
            depthTest:  edgeSettings.depthTest,
            depthWrite: edgeSettings.depthWrite,
        });

        const edgesLine = new THREE.LineSegments(rawEdgesGeo, lineMat);
        edgesLine.renderOrder = edgeSettings.renderOrder;
        edgesLine.position.copy(mesh.position);
        // Edges are hidden by default in 3D view.
        // WallEdgeVisibilityService (via view-activated) enables them for plan views.
        edgesLine.visible = false;
        edgesLine.userData = {
            id: data.id,
            parentId: data.id,
            elementType: 'SlabEdges',
            role: 'edges',
            selectable: false,
        };

        // §LOAD-FLOOD-GATE — per-slab BUILD_COMPLETE timing gated (default OFF).
        if (slabBuildDiagOn()) {
            console.log(`[SlabFragmentBuilder] BUILD_COMPLETE slabId="${data.id}" totalMs=${(performance.now() - __t_build_start).toFixed(1)}ms`);
        }
        return { mesh, edges: edgesLine };
    }

    // Backward-compatible alias for any external callers.
    static createSlabMesh(data: SlabData): THREE.Mesh {
        return SlabFragmentBuilder.createSlabMeshWithEdges(data).mesh;
    }
}