import * as THREE from '@pryzm/renderer-three/three';
// §I2 — WebGPU-safe disposal: stops `[WindowBuilder] build error: … usedTimes`
// aborting rebuild() during the live element-rebuild churn.
import { safeDisposeGeometry, safeDisposeMaterial } from '@pryzm/renderer-three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { windowStore } from './WindowStore';
import { windowSystemTypeStore } from './WindowSystemTypeStore';
import { WindowOpening } from './WindowTypes';
import { WallStore } from '@pryzm/geometry-wall';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { SpatialAuthorityError } from '@pryzm/core-app-model';
import { vgGovernanceStore, VGStyle } from '@pryzm/visibility';
// §INSTANCE-WINDOWS (2026-07-01) — GPU instancing over the SAME shared
// InstancedElementRenderer walls/columns/beams use, plus its default-off flag.
// We register sub-boxes DIRECTLY against the renderer (not via
// ElementInstanceBridge) so we can pass a per-instance `pickId` = the window id:
// every sub-box of a window resolves to the ONE window element on selection,
// exactly like §FURNITURE-MULTIPART-INSTANCING. The bridge type is injected so
// EngineBootstrap wiring mirrors the column/beam pattern, but the actual
// registration uses the bridge's underlying renderer singleton.
import {
    ElementInstanceBridge,
    isElementInstancingEnabled,
    instancedElementRenderer,
} from '@pryzm/core-app-model/rendering';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

// §INSTANCE-WINDOWS — ONE shared unit box for every instanced window sub-box.
// InstancedElementRenderer hashes (geometry, material, level) into the group key,
// so a single unit box scaled per-instance lets identical sub-boxes across all
// storeys collapse into one InstancedMesh. Module-level (never disposed — it is a
// template; the InstanceGroup owns the GPU buffer copy). Only read on the
// flag-on instanced path, so it is inert by default.
const _unitBox = new THREE.BoxGeometry(1, 1, 1);

// ── Helper: add a BoxGeometry mesh to parent ────────────────────────────────
function addBox(
    parent: THREE.Object3D,
    material: THREE.Material,
    w: number, h: number, d: number,
    x: number, y: number, z: number
): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    parent.add(mesh);
}

// ── Helper: create a fresh MeshStandardMaterial with polygon offset ─────────
function makeMat(color: string, roughness = 0.5, metalness = 0, transparent = false, opacity = 1, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        transparent,
        opacity,
        side,
        depthWrite: !transparent,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    });
}

// ── Helper: believable transparent glazing material ────────────────────────
// A.21.D40 #4 — the BIM 3D glazing must read as see-through glass, not a solid
// light-blue panel. A MeshPhysicalMaterial with `transmission` gives true
// glass refraction; we keep a low base `opacity` as a fallback for renderers
// that ignore transmission, plus a subtle blue-grey tint and slight roughness.
// IMPORTANT: NO polygonOffset here (that flag is for the frame to win z-fights
// against the wall void) — applying it to the thin glass pane causes shading
// artefacts. depthWrite is OFF so the glass blends correctly with what's behind.
const GLASS_TINT = '#cdd9de'; // subtle blue-grey, far less saturated than 'lightblue'
function makeGlassMat(opacity: number, side: THREE.Side = THREE.DoubleSide): THREE.MeshPhysicalMaterial {
    const op = Math.max(0, Math.min(1, opacity));
    return new THREE.MeshPhysicalMaterial({
        color: GLASS_TINT,
        roughness: 0.08,
        metalness: 0,
        transmission: 0.9,      // physical glass refraction — the see-through driver
        ior: 1.5,               // glass index of refraction
        thickness: 0.006,       // matches the pane geometry depth
        transparent: true,
        opacity: op,            // fallback tint strength when transmission is unsupported
        depthWrite: false,      // glass must not occlude geometry behind it
        side,
    });
}

// ── Helper: compute evenly-distributed column/row widths from ratio array ───
function ratioWidths(totalSize: number, ratios: number[]): number[] {
    const total = ratios.reduce((s, r) => s + r, 0);
    return ratios.map(r => (r / total) * totalSize);
}

/** Pending build task: the latest window data + previous snapshot for diff. */
interface WindowBuildTask {
    win: WindowOpening;
    prev?: WindowOpening;
}

/**
 * C2 — WindowBuilder
 *
 * Subscribes to WindowStore and renders parametric 3D window geometry
 * (frame, glazing grid with column/row dividers, glass panes, optional sill).
 *
 * Architecture: pure subscriber — reads wallStore for positioning only.
 * Never writes to any store. Fully compliant with §03 Command Pipeline.
 *
 * PLAN-06: Dispatches DOM events (bim-window-added, bim-window-updated,
 * bim-window-removed) so SelectionManager can invalidate its raycaster cache.
 *
 * PLAN-07: Exposes rebuildForWall(wallId) so EngineBootstrap can call it
 * when a wall's baseline changes, keeping window positions in sync.
 *
 * C11 §2 step 3 (Task 1.2) — geometry builds are deferred via FrameScheduler
 *   adaptive drain. Store subscription enqueues tasks; `_drainBuildQueue()`
 *   processes up to `_buildsPerFrame` items per pre-render tick.
 */
export class WindowBuilder {
    private scene: THREE.Scene;
    private wallStore: any;
    private windowGroups: Map<string, THREE.Group> = new Map();
    /** Per-window cloned materials to dispose on rebuild/remove */
    private windowMaterials: Map<string, THREE.Material[]> = new Map();
    private unsubscribe: (() => void) | null = null;

    // §INSTANCE-WINDOWS (2026-07-01) — SHARED window material cache.
    //
    // Before this cache buildVisuals() minted a BRAND-NEW frame + glass material
    // per window (makeMat / makeGlassMat). On the 40-storey office (~920 windows)
    // that is ~1840 unique materials; because InstancedElementRenderer keys its
    // groups by `…_material.uuid`, a unique material forces a size-1 group → zero
    // instancing (identical to the wall bug §INSTANCE-MAT-SHARE fixed). Sharing ONE
    // frame material per (levelId, colour) and ONE glass material per
    // (levelId, opacity) lets every identical window across all 40 storeys collapse
    // into a handful of InstancedMeshes. The cache OWNS these materials' lifetime;
    // per-window dispose() must NOT dispose a shared material (it may back thousands
    // of windows). Freed in deactivate().
    private _sharedFrameMats = new Map<string, THREE.MeshStandardMaterial>();
    private _sharedGlassMats = new Map<string, THREE.MeshPhysicalMaterial>();

    /**
     * §INSTANCE-WINDOWS — optional GPU-instancing bridge (the SAME shared
     * InstancedElementRenderer walls/columns/beams use). When injected AND
     * `globalThis.__pryzmElementInstancingV1 === true`, every window sub-box
     * (frame bars + glass panes) is registered as a GPU instance keyed by a
     * synthetic per-sub-mesh storage id `${winId}#N` with pickId = winId, so all
     * identical sub-boxes across the 40 storeys collapse into one InstancedMesh
     * per (geometry × colour × level) while selection still resolves to the one
     * window element. Default-OFF: null bridge OR flag-off keeps every window on
     * the individual-mesh path (unchanged behaviour). Mirrors columnBuilder.
     */
    private _instanceBridge: ElementInstanceBridge | null = null;
    /** Per-window list of instanced sub-mesh storage keys, for unregister on rebuild/remove. */
    private _instancedSubKeys: Map<string, string[]> = new Map();

    // ── C11 §2 step 3: FrameScheduler adaptive drain ──────────────────────────
    /** Pending window builds keyed by id — later update wins (dedup). */
    private _pendingBuilds = new Map<string, WindowBuildTask>();
    /** FrameScheduler disposer for the drain loop — null when idle. */
    private _rafHandle: TickListenerDisposer | null = null;
    /** Adaptive per-frame budget, starts at 5, adjusts by ±1 each frame. */
    private _buildsPerFrame = 5;
    private static readonly _MAX_BUILDS = 12;
    private static readonly _MIN_BUILDS = 2;

    constructor(scene: THREE.Scene, wallStore: WallStore) {
        this.scene = scene;
        this.wallStore = wallStore;
    }

    /**
     * §INSTANCE-WINDOWS — inject the GPU-instancing bridge (the SAME one walls /
     * columns use, constructed over the shared `instancedElementRenderer`). Until
     * this is injected AND `globalThis.__pryzmElementInstancingV1 === true`,
     * windows build exactly as before (individual sub-meshes). Mirrors
     * ColumnFragmentBuilder.setInstanceBridge / initBuilders columnBuilder wiring.
     */
    setInstanceBridge(bridge: ElementInstanceBridge): void {
        this._instanceBridge = bridge;
        console.log('[WindowBuilder] §INSTANCE-WINDOWS ElementInstanceBridge injected (gated by __pryzmElementInstancingV1).');
    }

    /** True when the instanced path should be used for this build pass. */
    private _instancingActive(): boolean {
        return this._instanceBridge !== null && isElementInstancingEnabled();
    }

    /**
     * §INSTANCE-WINDOWS — resolve a SHARED frame material for (levelId, colour,
     * transparent, opacity). Identical windows across all 40 storeys share ONE
     * material so InstancedElementRenderer can coalesce them (and even on the
     * non-instanced path this cuts material count from ~1 per window to ~1 per
     * distinct colour per level). Cache owns lifetime — never disposed per-window.
     */
    private _sharedFrameMaterial(levelId: string, color: string, transparent: boolean, opacity: number, roughness = 0.6): THREE.MeshStandardMaterial {
        const key = `${levelId}|${new THREE.Color(color).getHexString()}|${transparent ? 't' : 'o'}|${opacity.toFixed(3)}|r${roughness}`;
        let mat = this._sharedFrameMats.get(key);
        if (!mat) {
            mat = makeMat(color, roughness, 0, transparent, opacity);
            this._sharedFrameMats.set(key, mat);
        }
        return mat;
    }

    /** §INSTANCE-WINDOWS — shared glass material for (levelId, opacity). */
    private _sharedGlassMaterial(levelId: string, opacity: number): THREE.MeshPhysicalMaterial {
        const key = `${levelId}|${opacity.toFixed(3)}`;
        let mat = this._sharedGlassMats.get(key);
        if (!mat) {
            mat = makeGlassMat(opacity, THREE.DoubleSide);
            this._sharedGlassMats.set(key, mat);
        }
        return mat;
    }

    /** Call once after scene is ready. Replays any already-stored windows (from project load). */
    activate(): void {
        for (const win of windowStore.getAll()) {
            this._enqueue(win, undefined);
        }
        this.unsubscribe = windowStore.subscribe((event, win, prev) => {
            if (event === 'add' || event === 'update') this._enqueue(win, prev);
            if (event === 'remove') this.dispose(win.id);
        });
        console.log('[WindowBuilder] activated');
    }

    /**
     * §WALL-DEEP-2026 B1 (RESOLVED 2026-04-24) — fields whose change does NOT
     * require a geometry rebuild. Frame / leaf colours can be patched on the
     * existing material; finish + identity metadata never affect the mesh.
     *
     * Anything OUTSIDE this set forces a full rebuild via the slow path.
     */
    private static readonly _PROPERTY_ONLY_FIELDS: ReadonlySet<keyof WindowOpening> = new Set<keyof WindowOpening>([
        'frameColor', 'glassOpacity',
        'fireRating', 'mark', 'finishMaterial',
        'frameFinish', 'sillFinish', 'systemTypeId',
    ]);

    /**
     * §WALL-DEEP-2026 B1 — diff classifier.
     *
     * Returns true ONLY when:
     *   (a) `prev` exists AND is a strictly different reference from `next`
     *       (the WindowStore.touch() cascade re-emits with prev === next; we
     *       must NOT short-circuit that path or hosted-wall cascades break),
     *   (b) every field that differs is in `_PROPERTY_ONLY_FIELDS`,
     *   (c) at least one such field actually differs (otherwise nothing to do).
     *
     * VG-governance overrides force the slow path because they live outside
     * the WindowOpening object — the override may have changed independently.
     */
    private _isPropertyOnlyChange(prev: WindowOpening, next: WindowOpening): boolean {
        if (prev === next) return false;
        // §INSTANCE-WINDOWS — the property-only fast path mutates the window's
        // frame/glass materials IN PLACE (_applyPropertyOnly). Those materials are
        // now SHARED across every identical window (see _sharedFrameMaterial /
        // _sharedGlassMaterial), so an in-place colour/opacity patch would bleed to
        // thousands of sibling windows. Force a full rebuild instead: rebuild()
        // re-resolves to the correctly-keyed shared material (and re-registers the
        // instance under the new material's group), keeping the cache immutable.
        // The rebuild is deferred + adaptively sliced, so the interactive cost is
        // bounded — correctness over the micro-optimisation for a shared-material
        // colour edit.
        return false;
        const vg = vgGovernanceStore.getEffectiveStyle('Window', next.id);
        if (vg.hidden || vg.colorOverride !== undefined || vg.opacityFactor !== undefined) return false;
        let materialDirty = false;
        const keys = new Set<keyof WindowOpening>([
            ...(Object.keys(prev) as (keyof WindowOpening)[]),
            ...(Object.keys(next) as (keyof WindowOpening)[]),
        ]);
        for (const k of keys) {
            if ((prev as any)[k] === (next as any)[k]) continue;
            if (!WindowBuilder._PROPERTY_ONLY_FIELDS.has(k)) return false;
            materialDirty = true;
        }
        return materialDirty;
    }

    /**
     * §WALL-DEEP-2026 B1 — material patch path. Updates the live materials
     * stored on the existing window group instead of disposing + recreating
     * the entire mesh. Saves a full `BoxGeometry` re-allocation per pane.
     */
    private _applyPropertyOnly(win: WindowOpening): void {
        const mats = this.windowMaterials.get(win.id);
        if (!mats || mats.length === 0) return;
        // mats[0] = frameMat, mats[1] = glassMat, mats[2] = sillMat (if sill).
        const frameMat = mats[0] as THREE.MeshStandardMaterial | undefined;
        const glassMat = mats[1] as THREE.MeshStandardMaterial | undefined;
        const sillMat  = mats[2] as THREE.MeshStandardMaterial | undefined;
        try {
            // §MAT-WINDOW-PLAN-PARITY — resolve via the catalogue authority so a
            // property patch never reverts a typed window to the schema-default grey.
            const resolved = this._resolveFrameColor(win);
            if (frameMat?.color) frameMat.color.set(resolved);
            if (glassMat) {
                // A.21.D40 #4 — glass is ALWAYS transparent (it uses physical
                // transmission); only the fallback-tint opacity tracks the slider.
                const op = Math.max(0, Math.min(1, win.glassOpacity));
                glassMat.opacity = op;
                glassMat.transparent = true;
                glassMat.depthWrite = false;
                glassMat.needsUpdate = true;
            }
            // Sill, when present, mirrors the frame colour (see buildVisuals).
            if (sillMat?.color) sillMat.color.set(resolved);
        } catch (err) {
            console.warn(`[WindowBuilder] property-only patch failed for ${win.id}; falling back to rebuild:`, err);
            // Caller will not retry — but a subsequent geometric edit will rebuild.
        }
        // Refresh user-data version so SelectionManager sees a non-stale stamp
        // even though no mesh changed.
        const group = this.windowGroups.get(win.id);
        if (group) {
            group.userData = Object.freeze({ ...group.userData, version: Date.now() });
            // Keep DOM cache observers in sync without a full add/remove pair.
            _bus.emit('bim-window-updated', { id: win.id }); // F.events.18
        }
    }

    deactivate(): void {
        // Cancel any pending drain.
        this._rafHandle?.();
        this._rafHandle = null;
        this._pendingBuilds.clear();

        this.unsubscribe?.();
        this.unsubscribe = null;
        for (const id of [...this.windowGroups.keys()]) {
            this.dispose(id);
        }

        // §INSTANCE-WINDOWS — the SHARED material caches are cache-owned (never
        // disposed per-window), so free them here on full teardown to avoid a GPU
        // material leak across project close/reopen.
        for (const m of this._sharedFrameMats.values()) safeDisposeMaterial(m);
        for (const m of this._sharedGlassMats.values()) safeDisposeMaterial(m);
        this._sharedFrameMats.clear();
        this._sharedGlassMats.clear();
        this._instancedSubKeys.clear();
    }

    /**
     * PLAN-07: Rebuild all windows hosted on the given wall.
     * Called from EngineBootstrap's WallStore 'update' subscriber so that
     * when a wall's baseline or thickness changes, window geometry repositions correctly.
     * C11 §2 step 3: deferred via FrameScheduler — no longer synchronous.
     */
    rebuildForWall(wallId: string): void {
        // §FIX-HOSTWALL-DOOR-INDEX (2026-07-02) — BOUNDED re-anchor. Was an
        // UNBOUNDED `for (const win of windowStore.getAll())` full-project scan.
        // Identical hang path to DoorBuilder.rebuildForWall (see there for the
        // O(walls-rebuilt × all-openings) explosion). WindowStore now maintains a
        // wallId → Set<windowId> reverse index, so this visits only the K windows
        // hosted on `wallId`.
        for (const id of windowStore.getIdsByWallId(wallId)) {
            const win = windowStore.getById(id);
            if (win) this._enqueue(win, undefined);
        }
    }

    // ── C11 §2 step 3: queue + drain ─────────────────────────────────────────

    /**
     * Enqueue a window build task. Later calls for the same window id overwrite
     * earlier ones so rapid consecutive updates collapse to a single build.
     */
    private _enqueue(win: WindowOpening, prev: WindowOpening | undefined): void {
        this._pendingBuilds.set(win.id, { win, prev });
        if (this._rafHandle === null) {
            this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    /**
     * Adaptive drain: processes up to `_buildsPerFrame` windows per pre-render
     * tick. Budget auto-adjusts ±1 based on observed frame cost
     * (target: 8–20 ms per drain pass).
     */
    private _drainBuildQueue(): void {
        this._rafHandle = null;
        const t0 = performance.now();

        const ids = [...this._pendingBuilds.keys()].slice(0, this._buildsPerFrame);
        for (const id of ids) {
            const task = this._pendingBuilds.get(id)!;
            this._pendingBuilds.delete(id);
            try {
                this.rebuild(task.win, task.prev);
            } catch (err) {
                console.error('[WindowBuilder] build error:', err);
            }
        }

        const frameMs = performance.now() - t0;
        if (frameMs < 8 && this._buildsPerFrame < WindowBuilder._MAX_BUILDS) {
            this._buildsPerFrame++;
        } else if (frameMs > 20 && this._buildsPerFrame > WindowBuilder._MIN_BUILDS) {
            this._buildsPerFrame--;
        }

        if (this._pendingBuilds.size > 0) {
            this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private rebuild(win: WindowOpening, prev?: WindowOpening): void {
        // PLAN-06: determine add vs update BEFORE dispose() clears the map.
        const isUpdate = this.windowGroups.has(win.id);

        // §WALL-DEEP-2026 B1 — property-only fast path. Skip dispose+rebuild
        // when only colour / opacity / metadata changed and the existing
        // mesh is still valid. Falls through to the slow path on any
        // geometric or VG-governed change.
        if (isUpdate && prev && this._isPropertyOnlyChange(prev, win)) {
            this._applyPropertyOnly(win);
            return;
        }

        this.dispose(win.id);

        const wallData = this.wallStore.getById(win.wallId);
        if (!wallData) {
            console.warn(`[WindowBuilder] Wall not found for window ${win.id} (wallId=${win.wallId})`);
            return;
        }

        // §WIN-AUDIT-2026 M4 — FK validation: warn (do not throw) when the
        // window references a systemTypeId that the type store cannot resolve.
        if (win.systemTypeId && !windowSystemTypeStore.getById(win.systemTypeId)) {
            console.warn(
                `[WindowBuilder] Window ${win.id} references unknown systemTypeId ` +
                `"${win.systemTypeId}" — falling back to inline parameters.`,
            );
        }

        // §WIN-AUDIT-2026 W5 (WIN-VG-BYPASS) — consult VG governance store.
        const vgStyle = vgGovernanceStore.getEffectiveStyle('Window', win.id);
        if (vgStyle.hidden) return;

        const group = new THREE.Group();
        group.name = `window-${win.id}`;
        // §WINDOW-AUDIT-2026 W6/W7/W10: userData freeze + version + levelId mirror +
        // canonical 'Window' elementType case for both root group and child meshes.
        const rootUserData = {
            id:           win.id,
            elementType:  'Window',
            elementId:    win.id,
            openingId:    win.openingId,
            wallId:       win.wallId,
            levelId:      wallData.levelId,           // W7
            width:        win.width,
            height:       win.height,
            sillHeight:   win.sillHeight,
            selectable:   true,
            version:      Date.now(),                  // W6 stale-detection field
        };
        group.userData = Object.freeze({ ...rootUserData });

        // Use wall thickness so the frame fully spans the void (no exposed cut edges).
        const frameDepth = (wallData.thickness ?? 0.2) + 0.02;
        const mats = this.buildVisuals(win, group, frameDepth, vgStyle, wallData.levelId ?? 'default');
        this.windowMaterials.set(win.id, mats);
        this.positionGroup(win, group, wallData);

        // §INSTANCE-WINDOWS — when the flag is on, convert the freshly-built
        // sub-meshes into GPU instances. This reuses ALL the geometry maths above
        // (each box was built in group-local space; the group was just positioned
        // + rotated in world space) so the instanced placement is byte-identical to
        // the individual-mesh placement — we only change HOW it reaches the GPU.
        // After conversion the group holds a single invisible hit-proxy so
        // SelectionManager raycasting still resolves the window. Default-off path
        // keeps every real sub-mesh (unchanged behaviour).
        if (this._instancingActive()) {
            this._convertGroupToInstances(win, group, wallData.levelId);
        }

        group.traverse(obj => {
            if (obj !== group && obj instanceof THREE.Mesh) {
                // §INSTANCE-WINDOWS — preserve the hit-proxy's role so dispose() can
                // free its throwaway material; only stamp real geometry sub-meshes.
                if (obj.userData?.role === 'hit-proxy') return;
                obj.userData = Object.freeze({
                    ...obj.userData,
                    elementType: 'Window',
                    parentId: win.id,
                    wallId: win.wallId,
                    levelId: wallData.levelId,
                    role: 'geometry',
                    selectable: false,
                });
            }
        });

        this.scene.add(group);
        this.windowGroups.set(win.id, group);
        elementRegistry.registerRoot(win.id, group);

        // PLAN-06: Dispatch DOM event so SelectionManager can invalidate its raycaster cache.
        // F.events.18 — typed bus replaces variable CustomEvent
        if (isUpdate) _bus.emit('bim-window-updated', { id: win.id });
        else _bus.emit('bim-window-added', { id: win.id });
    }

    /**
     * §INSTANCE-WINDOWS — replace a window group's individual sub-meshes with GPU
     * instances registered in the shared InstancedElementRenderer, then leave a
     * single invisible hit-proxy on the group for selection raycasting.
     *
     * Correctness: every sub-box is an axis-aligned BoxGeometry(w,h,d) at a pure
     * translation in group-local space; the group carries the world position +
     * Y-rotation. So a sub-box's WORLD transform is exactly the group's world
     * matrix composed with the box's local translation — we read that back from
     * the child's `matrixWorld` (decompose → centre, quaternion, scale) and hand
     * it to ElementInstanceBridge, which rebuilds `translate × rotateY × scale`.
     * Because the sub-box has no local rotation and the group only rotates about
     * Y, the decomposed rotation is a pure Y-rotation, so passing `rotationY`
     * reproduces the placement exactly.
     *
     * Storage key = `${win.id}#${i}` (unique per sub-box); pickId = win.id (via
     * the group userData path — SelectionManager resolves the window through the
     * hit-proxy, not the instance, so we do NOT need per-instance pick here, but
     * the shared material keying still coalesces boxes across all storeys).
     */
    private _convertGroupToInstances(win: WindowOpening, group: THREE.Group, levelId: string): void {
        if (!this._instanceBridge) return;

        // Ensure child world matrices reflect the group's just-set world transform.
        group.updateMatrixWorld(true);

        // Collect meshes first (we mutate the group while iterating).
        const meshes: THREE.Mesh[] = [];
        group.traverse(obj => {
            if (obj !== group && obj instanceof THREE.Mesh) meshes.push(obj);
        });

        const subKeys: string[] = [];
        const _pos = new THREE.Vector3();
        const _quat = new THREE.Quaternion();
        const _scale = new THREE.Vector3();
        const _euler = new THREE.Euler();

        let i = 0;
        for (const mesh of meshes) {
            const geo = mesh.geometry as THREE.BoxGeometry;
            const params = (geo as any).parameters as { width?: number; height?: number; depth?: number } | undefined;
            // Only unit-box-derived geometries carry .parameters; every window
            // sub-mesh is a BoxGeometry, so this is always present. Guard anyway.
            if (!params || params.width == null) continue;

            mesh.matrixWorld.decompose(_pos, _quat, _scale);
            _euler.setFromQuaternion(_quat, 'YXZ');

            // World extents: box params × group scale (group scale is 1, but keep the
            // multiply for safety). Encode translate × rotateY × scale so a shared
            // unit box renders at the right place + size — identical maths to
            // ElementInstanceBridge._buildMatrix / WallInstanceBridge.register.
            const sizeX = (params.width ?? 1) * _scale.x || 1e-6;
            const sizeY = (params.height ?? 1) * _scale.y || 1e-6;
            const sizeZ = (params.depth ?? 1) * _scale.z || 1e-6;
            const matrix = new THREE.Matrix4()
                .makeTranslation(_pos.x, _pos.y, _pos.z)
                .multiply(new THREE.Matrix4().makeRotationY(_euler.y))
                .multiply(new THREE.Matrix4().makeScale(sizeX, sizeY, sizeZ));

            const material = mesh.material as THREE.Material;
            // Storage key is UNIQUE per sub-box (`${win.id}#${i}`) so each occupies its
            // own addressable slot; pickId = win.id for EVERY sub-box so that picking
            // ANY frame bar or glass pane resolves to the ONE window element (mirrors
            // §FURNITURE-MULTIPART-INSTANCING). The shared unit box + shared material
            // mean identical windows across all 40 storeys coalesce into one
            // InstancedMesh per (sub-box shape × colour × level).
            const storageKey = `${win.id}#${i}`;
            instancedElementRenderer.register(
                storageKey,
                _unitBox,
                material,
                matrix,
                levelId,
                'Window',
                win.id,   // pickId — resolves every sub-box to the window element
            );
            subKeys.push(storageKey);
            i++;
        }

        this._instancedSubKeys.set(win.id, subKeys);

        // Strip the real sub-meshes (their geometry is now redundant — the
        // InstancedMesh renders them). Dispose only the geometry; the materials are
        // SHARED (cache-owned) so they must survive.
        for (const mesh of meshes) {
            safeDisposeGeometry(mesh.geometry); // §I2 — WebGPU-safe
            group.remove(mesh);
        }

        // Add ONE invisible hit-proxy spanning the whole window so raycast
        // selection still resolves the window group (mirrors the wall/column
        // instanced-selection pattern: colorWrite/depthWrite off = imperceptible
        // but raycastable). Built in group-local space (window centred at origin).
        const proxyGeo = new THREE.BoxGeometry(win.width, win.height, (win.frameDepth ?? 0.2) + 0.02);
        const proxyMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
        const proxy = new THREE.Mesh(proxyGeo, proxyMat);
        proxy.userData = { role: 'hit-proxy' };
        group.add(proxy);
    }

    private positionGroup(win: WindowOpening, group: THREE.Group, wallData: any): void {
        // Construct explicit Vector3 so the code is safe whether baseLine entries are
        // THREE.Vector3 instances (freshly placed) or plain {x,y,z} objects (deserialized).
        const start = new THREE.Vector3(wallData.baseLine[0].x, wallData.baseLine[0].y ?? 0, wallData.baseLine[0].z);
        const end   = new THREE.Vector3(wallData.baseLine[1].x, wallData.baseLine[1].y ?? 0, wallData.baseLine[1].z);

        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const wallAngle = Math.atan2(dir.z, dir.x);

        // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): `win.offset` is the LEFT EDGE
        // of the opening span [offset, offset+width] along the wall baseline (the
        // convention used by every producer, the window tool, the occupancy store, and
        // C15 §2 voidStart=offset). The frame CENTRE = offset + width/2 — which is
        // exactly where WallFragmentBuilder now cuts the void and places the frame.
        const centre = start.clone().addScaledVector(dir, win.offset + win.width / 2);

        // §WINDOW-AUDIT-2026 C2 (WIN-SPATIAL-FALLBACK) — never silently default to Y=0
        // when level membership is broken. Throwing is the §02 §1.4 spatial-authority
        // contract: misconfigured levelId must produce a loud error, not a ghost
        // window at floor level.
        if (!wallData.levelId) {
            throw new SpatialAuthorityError(
                `[WindowBuilder] Window ${win.id} hosted on wall ${win.wallId} which has no levelId — refusing to place at Y=0.`,
            );
        }
        const levelData = this.wallStore.getLevelById(wallData.levelId);
        if (!levelData || (levelData as any).elevation == null) {
            throw new SpatialAuthorityError(
                `[WindowBuilder] Window ${win.id}: level "${wallData.levelId}" has no elevation — refusing to place at Y=0.`,
            );
        }
        const elevation = (levelData as any).elevation;
        const y = elevation + win.sillHeight + win.height / 2;

        group.position.set(centre.x, y, centre.z);
        group.rotation.y = -wallAngle;
    }

    /**
     * Build all geometry sub-components.
     * Returns all cloned materials for disposal tracking.
     *
     * Local space: group centre = sillHeight + height/2 above floor.
     *   bottom = -h/2, top = +h/2, window width along X, depth along Z.
     *
     * @param wallFrameDepth - actual depth to use (wall.thickness + 0.02) so the
     *   frame fully covers the void opening and no raw cut edges are visible.
     */
    /**
     * §MAT-WINDOW-PLAN-PARITY (2026-05-23) — frame-colour resolution authority.
     *
     * The builder is the rendering authority and must resolve a window's frame
     * material from the system-type catalogue, not depend on every creation path
     * pre-baking `frameColor`. A window placed via the plan tool can arrive without
     * a baked colour, in which case `WindowOpeningSchema` fills the sentinel default
     * '#e8e8e8' (light grey) → "timber window renders grey." Resolution order:
     *   1) an explicit, user-customised colour (frameFinish.materialColor or
     *      frameColor) that DIFFERS from the sentinel — preserved as-is,
     *   2) the window's `systemTypeId` frame finish from the catalogue — the true
     *      material for the chosen type,
     *   3) the explicit/sentinel colour as a final non-empty fallback.
     * Note '#e8e8e8' is also the LEGITIMATE colour of `wt-single-pane` (aluminium),
     * so treating it as the sentinel is safe: that type resolves back to '#e8e8e8'.
     */
    private _resolveFrameColor(win: WindowOpening): string {
        const SENTINEL = '#e8e8e8';
        const explicit = win.frameFinish?.materialColor ?? win.frameColor;
        if (typeof explicit === 'string' && explicit.length > 0 && explicit.toLowerCase() !== SENTINEL) {
            return explicit;
        }
        const sysType = win.systemTypeId ? windowSystemTypeStore.getById(win.systemTypeId) : undefined;
        const fromType = sysType?.frameFinish?.materialColor;
        if (typeof fromType === 'string' && fromType.length > 0) return fromType;
        return (typeof explicit === 'string' && explicit.length > 0) ? explicit : SENTINEL;
    }

    private buildVisuals(win: WindowOpening, group: THREE.Group, wallFrameDepth?: number, vgStyle?: VGStyle, levelId = 'default'): THREE.Material[] {
        const mats: THREE.Material[] = [];
        const { width: w, height: h, frameThickness: ft } = win;
        // Use the wall-derived depth when provided so the frame spans the full void.
        const fd = wallFrameDepth ?? win.frameDepth;

        // §WIN-AUDIT-2026 W5 — apply VG governance overrides on top of the
        // window's stored colours / opacity. Frame colour falls back to the
        // window-level colour; glass opacity is multiplied by the VG factor.
        const frameColor = vgStyle?.colorOverride ?? this._resolveFrameColor(win);
        const opacityFactor = vgStyle?.opacityFactor ?? 1;
        const frameTransparent = opacityFactor < 1;
        const frameOpacity = Math.max(0, Math.min(1, opacityFactor));
        const glassOpacity = Math.max(0, Math.min(1, win.glassOpacity * opacityFactor));

        // §INSTANCE-WINDOWS — SHARED materials (see _sharedFrameMaterial). Identical
        // windows across all 40 storeys now share ONE frame + ONE glass material per
        // (level, colour/opacity) instead of minting a fresh pair each. These are
        // cache-owned and MUST NOT be disposed per-window (dispose() skips them).
        const frameMat = this._sharedFrameMaterial(levelId, frameColor, frameTransparent, frameOpacity);
        // A.21.D40 #4 — believable transparent glass (physical transmission), not
        // an opaque light-blue panel. See makeGlassMat above.
        const glassMat = this._sharedGlassMaterial(levelId, glassOpacity);
        mats.push(frameMat, glassMat);

        // ── Outer Frame ────────────────────────────────────────────────────
        // Top bar
        addBox(group, frameMat, w, ft, fd, 0,  h / 2 - ft / 2, 0);
        // Bottom bar
        addBox(group, frameMat, w, ft, fd, 0, -h / 2 + ft / 2, 0);
        // Left bar (between top and bottom)
        const sideH = h - 2 * ft;
        addBox(group, frameMat, ft, sideH, fd, -(w / 2 - ft / 2), 0, 0);
        // Right bar
        addBox(group, frameMat, ft, sideH, fd,  (w / 2 - ft / 2), 0, 0);

        // ── Glazing area ───────────────────────────────────────────────────
        // Inner area available for glass and dividers
        const innerW = w - 2 * ft;
        const innerH = h - 2 * ft;

        // DW-11 FIX: double window — force two equal columns with a structural center
        // mullion so the geometry reflects the BIM classification.  The user-defined
        // columnRatios still apply when windowType === 'single'.
        const effectiveColRatios = win.windowType === 'double' ? [1, 1] : win.columnRatios;
        // Use a thicker center divider (structural mullion) for double windows.
        const effectiveCdt = win.windowType === 'double'
            ? Math.max(win.columnDividerThickness, 0.06)
            : win.columnDividerThickness;

        const colWidths = ratioWidths(innerW, effectiveColRatios);
        const rowHeights = ratioWidths(innerH, win.rowRatios);

        const cdt = effectiveCdt;
        const rdt = win.rowDividerThickness;
        const nCols = colWidths.length;
        const nRows = rowHeights.length;

        // Column dividers (vertical) — between columns, full inner height
        let colX = -innerW / 2;
        for (let c = 0; c < nCols; c++) {
            colX += colWidths[c];
            if (c < nCols - 1) {
                addBox(group, frameMat, cdt, innerH, fd * 0.5, colX - cdt / 2, 0, 0);
            }
        }

        // Row dividers (horizontal) — per column to avoid intersection with col dividers
        colX = -innerW / 2;
        for (let c = 0; c < nCols; c++) {
            const cw = colWidths[c];
            let rowY = -innerH / 2;
            for (let r = 0; r < nRows; r++) {
                rowY += rowHeights[r];
                if (r < nRows - 1) {
                    addBox(group, frameMat, cw, rdt, fd * 0.5, colX + cw / 2, rowY - rdt / 2, 0);
                }
            }
            colX += cw;
        }

        // Glass panes (per cell)
        colX = -innerW / 2;
        for (let c = 0; c < nCols; c++) {
            const cw = colWidths[c];
            // Subtract column divider space on each side of this column
            const paneW = c === 0
                ? cw - (nCols > 1 ? cdt / 2 : 0)
                : c === nCols - 1
                    ? cw - cdt / 2
                    : cw - cdt;

            let rowY = -innerH / 2;
            for (let r = 0; r < nRows; r++) {
                const rh = rowHeights[r];
                const paneH = r === 0
                    ? rh - (nRows > 1 ? rdt / 2 : 0)
                    : r === nRows - 1
                        ? rh - rdt / 2
                        : rh - rdt;

                const paneCX = colX + cw / 2;
                const paneCY = rowY + rh / 2;

                addBox(group, glassMat, Math.max(paneW, 0.01), Math.max(paneH, 0.01), 0.006, paneCX, paneCY, 0);

                rowY += rh;
            }
            colX += cw;
        }

        // ── Sill ───────────────────────────────────────────────────────────
        if (win.sill && win.sillDepth > 0 && win.sillThickness > 0) {
            // §INSTANCE-WINDOWS — sill mirrors the frame colour (roughness 0.7),
            // resolved from the SHARED cache so it coalesces across storeys too.
            const sillMat = this._sharedFrameMaterial(levelId, this._resolveFrameColor(win), false, 1, 0.7);
            mats.push(sillMat);
            // Sill protrudes from bottom of window toward exterior (positive Z in group space)
            addBox(
                group, sillMat,
                w + 0.04,                // slightly wider than frame
                win.sillThickness,
                fd + win.sillDepth,
                0,
                -h / 2 + win.sillThickness / 2,
                win.sillDepth / 2        // protrudes out from wall face
            );
        }

        return mats;
    }

    private dispose(id: string): void {
        // §INSTANCE-WINDOWS — release any GPU instance slots this window owns
        // BEFORE tearing down its group. No-op when the window was on the
        // individual-mesh path (map has no entry).
        const subKeys = this._instancedSubKeys.get(id);
        if (subKeys) {
            for (const k of subKeys) instancedElementRenderer.unregister(k);
            this._instancedSubKeys.delete(id);
        }

        const group = this.windowGroups.get(id);
        if (group) {
            group.traverse(obj => {
                if (obj instanceof THREE.Mesh) {
                    safeDisposeGeometry(obj.geometry); // §I2 — WebGPU-safe
                    // The hit-proxy owns its own throwaway MeshBasicMaterial; dispose
                    // it. Real window sub-meshes use SHARED cache-owned materials
                    // (frame/glass/sill) which must NOT be disposed here.
                    if (obj.userData?.role === 'hit-proxy') {
                        safeDisposeMaterial(obj.material as THREE.Material);
                    }
                }
            });
            this.scene.remove(group);
            this.windowGroups.delete(id);
            elementRegistry.unregisterRoot(id);

            _bus.emit('bim-window-removed', { id }); // F.events.18
        }
        // §INSTANCE-WINDOWS — do NOT dispose the tracked materials: they are SHARED
        // across every identical window (cache-owned, freed in deactivate()).
        // Disposing here would blank out sibling windows still using them. We keep
        // the windowMaterials map only for the (now rebuild-only) property path.
        this.windowMaterials.delete(id);
    }
}
