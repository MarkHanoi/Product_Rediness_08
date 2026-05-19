import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { SlabData } from './SlabTypes';
import { BimManager } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { HostReferenceEdge, SketchLoop } from './SketchTypes';
import { WallFaceResolver } from './WallFaceResolver';
import { SketchLoopIntersector, Segment2D } from './SketchLoopIntersector';
import { outsetPolygon, SLAB_WALL_OUTSET } from './SlabGeometryUtils';
import { batchCoordinator } from '@pryzm/core-app-model';

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

    constructor(scene: THREE.Scene, bimManager?: BimManager, deps: SlabBuilderDeps = {}) {
        this.scene = scene;
        this.bimManager = bimManager ?? null;
        this._deps = deps;
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

        root.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                if (mesh.geometry) mesh.geometry.dispose();
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else if (mesh.material) {
                    (mesh.material as THREE.Material).dispose();
                }
            }
            if ((child as THREE.LineSegments).isLineSegments) {
                const line = child as THREE.LineSegments;
                if (line.geometry) line.geometry.dispose();
                if (line.material) (line.material as THREE.Material).dispose();
            }
        });

        root.clear();

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

        if (Array.isArray(data.layers) && data.layers.length > 1) {
            // ── Layered slab: stack one sub-mesh per layer ─────────────────────
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
                lMesh.position.set(childOffsetX, yBottom, childOffsetZ);
                lEdges.position.set(childOffsetX, yBottom, childOffsetZ);
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

    getRootById(id: string): THREE.Group | undefined {
        return this.slabRoots.get(id);
    }

    removeSlab(id: string): void {
        // M6 §SLAB-SYSTEM-AUDIT-2026: Evict any pending build for this slab so the
        // rAF drain does not try to rebuild a slab that has already been removed.
        // Without this, a queued _pendingBuilds entry outlives the remove, rebuilds the
        // slab root in the scene, and elementRegistry.registerRoot() re-enters the id —
        // producing a ghost mesh that persists until the next full scene rebuild.
        this._pendingBuilds = this._pendingBuilds.filter(b => b.id !== id);
        this._pausedBuilds = this._pausedBuilds.filter(b => b.id !== id);

        const root = this.slabRoots.get(id);
        if (root) {
            root.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    const mesh = child as THREE.Mesh;
                    if (mesh.geometry) mesh.geometry.dispose();
                    if (Array.isArray(mesh.material)) {
                        mesh.material.forEach(m => m.dispose());
                    } else if (mesh.material) {
                        (mesh.material as THREE.Material).dispose();
                    }
                }
                if ((child as THREE.LineSegments).isLineSegments) {
                    const line = child as THREE.LineSegments;
                    if (line.geometry) line.geometry.dispose();
                    if (line.material) (line.material as THREE.Material).dispose();
                }
            });

            this.scene.remove(root);
            this.slabRoots.delete(id);
            elementRegistry.unregister(id);
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

    private static resolveLoop(loop: SketchLoop): { x: number; y: number }[] | null {
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
            // openingStore reachable on window but deps not injected — legacy bootstrap path
            const winOpenings: any[] = window.openingStore.getByHostId?.(data.id) ?? []; // TODO(TASK-08)
            if (winOpenings.length > 0) {
                console.warn(`[SlabFragmentBuilder] DEPS NOT INJECTED — ${winOpenings.length} opening(s) on slab "${data.id}" found via window.openingStore but NOT via deps. Call slabBuilder.setDeps({ openingStore }) in initBuilders.`); // TODO(TASK-08)
            }
        }

        let geometry: THREE.BufferGeometry;

        const __t_build_start = performance.now();
        if (resolvedPolygon && resolvedPolygon.length >= 3) {
            // I1 (Pascal integration): Expand the outer polygon outward by SLAB_WALL_OUTSET
            // so that the slab geometry seats under adjacent walls, eliminating visible gaps.
            // Only the outer boundary is outset — holes are voids and must NOT be expanded.
            const __t_outset_start = performance.now();
            const buildPolygon = outsetPolygon(resolvedPolygon, SLAB_WALL_OUTSET);
            console.log(`[SlabFragmentBuilder] outset slabId="${data.id}" vertices=${resolvedPolygon.length} elapsed=${(performance.now() - __t_outset_start).toFixed(1)}ms`);
            const __t_tri_start = performance.now();
            geometry = SlabFragmentBuilder.buildSlabGeometry(buildPolygon, data.thickness, allHoles);
            console.log(`[SlabFragmentBuilder] triangulate slabId="${data.id}" outerVertices=${buildPolygon.length} elapsed=${(performance.now() - __t_tri_start).toFixed(1)}ms`);
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
            selectable: false
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

        console.log(`[SlabFragmentBuilder] BUILD_COMPLETE slabId="${data.id}" totalMs=${(performance.now() - __t_build_start).toFixed(1)}ms`);
        return { mesh, edges: edgesLine };
    }

    // Backward-compatible alias for any external callers.
    static createSlabMesh(data: SlabData): THREE.Mesh {
        return SlabFragmentBuilder.createSlabMeshWithEdges(data).mesh;
    }
}