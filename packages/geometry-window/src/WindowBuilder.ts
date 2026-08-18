import * as THREE from '@pryzm/renderer-three/three';
// §I2 — WebGPU-safe disposal: stops `[WindowBuilder] build error: … usedTimes`
// aborting rebuild() during the live element-rebuild churn.
import { safeDisposeGeometry, safeDisposeMaterial } from '@pryzm/renderer-three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { windowStore } from './WindowStore';
import { windowSystemTypeStore } from './WindowSystemTypeStore';
import { resolveWindowDimensions, DEFAULT_WINDOW_DIMENSIONS } from './WindowDimensions';
import { WindowOpening } from './WindowTypes';
// §FEAT-CURVED-WINDOW-LEAF (L-957) — the leaf's arc is the HOST'S arc, consumed
// through `hostedElementFrame`. Nothing in this file re-derives it; see
// `CurvedLeafGeometry.ts` for why that is the whole point of the feature.
import { leafArc, curvedLeafRefusal, sweptBoxGeometry, arcSeat, type LeafArc } from './CurvedLeafGeometry';
import {
    WallStore, hostedElementFrame, withAuthoritativeGeometry,
    // §RAKE-HOSTED-OPENING — the ONE cot(rake) predicate and the ONE displacement
    // function. Nothing here re-derives either; see `WallRake.ts` for the decision.
    rakeShearPerMetre, rakeTopOffset,
    // §WALL-Y-DATUM (L-968) — THE wall vertical-datum authority. The leaf's world Y
    // is the host wall's BASE plane plus its own sill; nothing here re-derives that
    // plane, because a hosted element "has no independent world-space coordinate in
    // the store" (C15 §2) and the slab term is unreachable from this package.
    resolveWallBaseYOrLevel, hostedLeafCentreY,
} from '@pryzm/geometry-wall';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { SpatialAuthorityError } from '@pryzm/core-app-model';
// §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — the 3D window is a DetailLevel consumer, through
// the SAME resolver the plan symbol calls. ADR-121 §4.3: "One resolver, three consumers —
// NOT a second symbol engine per view type… There must not be a `resolveElevationDetailLevel`."
// An ELEVATION is a projection of these meshes, so the mesh gains the articulation and the
// elevation inherits it. `vd-sys-3d-1` is a real ViewDefinition (DefaultViewsManager) carrying
// a live `output.detailLevel`, so this is genuine view INTENT (C09/P7) — never a private flag.
import {
    resolveEffectiveDetailLevel, DEFAULT_3D_VIEW_ID, storeEventBus,
    type DetailLevel,
} from '@pryzm/core-app-model';
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
/**
 * §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — every sub-box now names its ROLE.
 *
 * The role is what lets the LOD guards state their claims in GEOMETRY rather than in prose
 * ("`fine` adds a SASH", not "`fine` has more meshes"), and it is what the plan projector's
 * generic gate reads alongside `skipInPlan`. It is NOT a per-part allowlist: the plan skip is
 * applied to EVERY window mesh uniformly (see `rebuild`), which is precisely the lesson
 * ADR-121 §5.2 drew from the door — *"a per-part ROLE allowlist in the projector is a bug
 * generator… the tag belongs on the builder, not the allowlist."*
 */
type WindowPartRole =
    | 'windowFrame'     // the outer frame members (head, cill, jambs)
    | 'windowMullion'   // vertical column divider — the meeting stile between panes
    | 'windowTransom'   // horizontal row divider
    | 'windowSash'      // the openable leaf frame captured inside the outer frame (fine)
    | 'windowBead'      // the glazing bead / rebate stop that captures the sealed unit (fine)
    | 'windowGlazing'   // a glass pane
    | 'windowSill';     // the sill board

function addBox(
    parent: THREE.Object3D,
    material: THREE.Material,
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    role: WindowPartRole,
): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.userData.role = role;
    parent.add(mesh);
}

/**
 * §FEAT-CURVED-WINDOW-LEAF (L-957) — a member that must FOLLOW the host's arc.
 *
 * Identical arguments to {@link addBox}, and identical behaviour when `arc` is
 * `null` — which is every straight-walled window in every project, i.e. the case
 * slice 0 pins byte-identical. It is the same `new THREE.BoxGeometry(w, h, d)`
 * call reached by the same branch, not a reconstruction that happens to agree.
 *
 * When `arc` is present the member is swept along the wall's own centreline
 * stations instead. Use this for HORIZONTALS — head, sill, transom, the sill
 * board, the horizontal sash members and beads. Verticals must use
 * {@link addSeatedBox}: a vertical is a straight ruling of a vertical-axis sweep,
 * so sweeping it would be wrong, not merely wasteful.
 */
function addSweptBox(
    parent: THREE.Object3D,
    material: THREE.Material,
    arc: LeafArc | null,
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    role: WindowPartRole,
): void {
    if (!arc) { addBox(parent, material, w, h, d, x, y, z, role); return; }
    const mesh = new THREE.Mesh(sweptBoxGeometry(arc, w, h, d, x, y, z), material);
    // The sweep is authored in group-local coordinates already — the geometry
    // carries the member's position, so the mesh sits at the group origin. A
    // position offset here would double-count it.
    mesh.position.set(0, 0, 0);
    mesh.userData.role = role;
    parent.add(mesh);
}

/**
 * §FEAT-CURVED-WINDOW-LEAF (L-957) — a STRAIGHT member RE-SEATED onto the arc.
 *
 * Jambs, mullions and sash stiles stay straight boxes (see `CurvedLeafGeometry`'s
 * header for why that is a measured property of the stored model and not a
 * simplification), but on a curved host their plan position and heading must
 * still follow the wall, or a mullion halfway along a wide curved window stands
 * proud of the glass on one side and sinks into it on the other. Falls through to
 * {@link addBox} unchanged for a straight host.
 */
function addSeatedBox(
    parent: THREE.Object3D,
    material: THREE.Material,
    arc: LeafArc | null,
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    role: WindowPartRole,
): void {
    if (!arc) { addBox(parent, material, w, h, d, x, y, z, role); return; }
    const seat = arcSeat(arc, x, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(seat.x, y, seat.z);
    mesh.rotation.y = seat.rotationY;
    mesh.userData.role = role;
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
/**
 * §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) — `glazingThickness` is now a real, resolved
 * dimension (`resolveWindowDimensions`), not the hard-coded 6 mm literal this material
 * and the pane geometry each carried separately. The material's `thickness` (the
 * refraction depth) and the pane's extruded depth are THE SAME NUMBER, and it is the
 * same number the plan symbol draws its double-line glazing at.
 */
function makeGlassMat(opacity: number, glazingThickness: number, side: THREE.Side = THREE.DoubleSide): THREE.MeshPhysicalMaterial {
    const op = Math.max(0, Math.min(1, opacity));
    return new THREE.MeshPhysicalMaterial({
        color: GLASS_TINT,
        roughness: 0.08,
        metalness: 0,
        transmission: 0.9,          // physical glass refraction — the see-through driver
        ior: 1.5,                   // glass index of refraction
        thickness: glazingThickness, // matches the pane geometry depth exactly
        transparent: true,
        opacity: op,                // fallback tint strength when transmission is unsupported
        depthWrite: false,          // glass must not occlude geometry behind it
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
    /** §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — StoreEventBus disposer for the 3D-view intent watch. */
    private _unsubscribeViews: (() => void) | null = null;
    /** The tier each window was last BUILT at, so a view-intent change rebuilds only what moved. */
    private _builtLod = new Map<string, DetailLevel>();

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

    /**
     * §INSTANCE-WINDOWS — shared glass material for (levelId, opacity, glazingThickness).
     * §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) — the glazing thickness is part of the key:
     * two window types with different sealed units must not share one glass material.
     */
    private _sharedGlassMaterial(levelId: string, opacity: number, glazingThickness: number): THREE.MeshPhysicalMaterial {
        const key = `${levelId}|${opacity.toFixed(3)}|g${glazingThickness.toFixed(4)}`;
        let mat = this._sharedGlassMats.get(key);
        if (!mat) {
            mat = makeGlassMat(opacity, glazingThickness, THREE.DoubleSide);
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

        // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — DETAIL LEVEL IS INTENT, AND INTENT IS LIVE.
        //
        // The Detail Level of the 3D view is a P7 visibility INTENT: it lives on the
        // ViewDefinition (the properties-panel dropdown) and in the C09 override layer. A
        // consumer that reads it once at build time and never again is not a consumer — it is
        // a snapshot. So the builder watches the 3D ViewDefinition and rebuilds ONLY the
        // windows whose RESOLVED tier actually moved, which makes a no-op view edit free.
        this._unsubscribeViews = storeEventBus.subscribe((e) => {
            if (e.elementType !== 'view-definition' || e.elementId !== DEFAULT_3D_VIEW_ID) return;
            for (const win of windowStore.getAll()) {
                if (this._lodFor(win) !== this._builtLod.get(win.id)) this._enqueue(win, undefined);
            }
        });
        console.log('[WindowBuilder] activated');
    }

    /**
     * The effective Detail Level for this window IN THE 3D VIEW.
     *
     * ADR-121 §4.3 — ONE resolver, three consumers. This is the same
     * `resolveEffectiveDetailLevel` the plan symbol calls; the window owns NONE of the
     * precedence (C09: element override → element-type override → category override → the 3D
     * view's own `output.detailLevel` → the L0 default). There is deliberately no private
     * `detailed` flag and no `resolve3dDetailLevel` — the LOD is the VIEW'S decision.
     */
    private _lodFor(win: WindowOpening): DetailLevel {
        return resolveEffectiveDetailLevel(win.id, DEFAULT_3D_VIEW_ID, {
            elementType: 'window',
            category:    'window',
        });
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
        //
        // Expressed as a named, typed flag rather than a bare `return false;`
        // followed by the (then unreachable) original classifier: the classifier
        // below is the code this flag DISABLES, and keeping it as dead statements
        // after a return meant no linter or compiler was checking it any more.
        const PROPERTY_ONLY_FAST_PATH_ENABLED: boolean = false;
        if (!PROPERTY_ONLY_FAST_PATH_ENABLED) return false;
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
        // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — drop the 3D-view intent watch too.
        this._unsubscribeViews?.();
        this._unsubscribeViews = null;
        this._builtLod.clear();
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
        // §MT-06-ONE-AUTHORITY — the frame is built from RECORD A, always.
        //
        // This is THE line the founder's L-916 defect turns on. `WindowOpening`
        // carries its own offset/width/height/sillHeight, but the record that
        // drives the VOID — and that `clampToWall` has already had its say over —
        // is `WallData.openings[]` / `WallStore`'s window map. When a wall moves,
        // the structural commands re-seat RECORD A and `WindowDependencyTracker`
        // then calls `windowStore.touch(id)`, which re-notifies the UNCHANGED
        // frame record. Built from that record, the frame is placed with the OLD
        // offset against the NEW baseline: a clean hole with no frame in it.
        //
        // Resolving here rather than at `_enqueue` is deliberate — the queue
        // drains on a LATER frame, so a value captured at enqueue time could
        // itself be stale by the time it becomes geometry. This is the moment the
        // record becomes meshes, so this is where authority must be read.
        //
        // `prev` is deliberately NOT resolved. It is the state the mesh was last
        // BUILT from, and its only job is the property-only comparison below.
        // Deriving both would make a pure host-move look like "nothing changed"
        // (touch passes the same record as `win` and `prev`), take the fast path,
        // and skip the reposition — reinstating the defect through the back door.
        // Leaving it raw is what makes a moved void register as geometric.
        // OPTIONAL-CALLED, and that is not defensive noise: `wallStore` here is
        // typed `any` because this builder accepts a DUCK-TYPED host store, and
        // several callers pass a partial stub carrying only `getById` /
        // `getLevelById`. A store that cannot answer the question is "no
        // authority" — which resolves to the record unchanged, per
        // `withAuthoritativeGeometry` §2 — and never a throw that would take the
        // whole mesh down, nor a zero that would park the frame at the origin.
        win = withAuthoritativeGeometry(win, this.wallStore?.hostedOpeningGeometry?.(win.id));

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
        // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — ask the SHARED resolver what detail this
        // window is wanted at in the 3D view, and remember it so a later intent change can
        // trigger exactly the rebuilds it affects (and no others).
        const lod = this._lodFor(win);
        this._builtLod.set(win.id, lod);
        // §FEAT-CURVED-WINDOW-LEAF (L-957) — `null` for every straight host, which
        // is what makes the ordinary path literally the old code. The arc is
        // resolved from the SAME `hostedElementFrame(wall, offset, width)` that
        // `positionGroup` places the group with, so the leaf's curvature and the
        // leaf's placement cannot be two answers.
        //
        // The refusal is CONSULTED, not restated. `curvedLeafRefusal` names the one
        // combination a curved leaf cannot carry and returns the reason as text; the
        // reason is stamped onto the group below so a panel can SHOW it rather than
        // re-deriving the condition. When it fires, the leaf falls back to FLAT —
        // a chorded pane in a curved hole is visibly wrong and therefore reportable,
        // which is the point: "a refusal is a correct answer; a silently-wrong wall
        // is not" (`WallRake.ts`).
        const _leafRefusal = curvedLeafRefusal(wallData);
        const arc = _leafRefusal ? null : leafArc(wallData, win.offset, win.width);
        if (_leafRefusal) {
            // Re-frozen rather than mutated: `rootUserData` is frozen above, and the
            // field is added ONLY on the refusing path so a straight or ordinary
            // curved window's userData is untouched.
            group.userData = Object.freeze({ ...group.userData, curvedLeafRefusal: _leafRefusal });
        }
        const mats = this.buildVisuals(win, group, frameDepth, vgStyle, wallData.levelId ?? 'default', lod, arc);
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
        //
        // §RAKE-HOSTED-OPENING — a RAKED host is excluded, deliberately and visibly.
        // `_convertGroupToInstances` decomposes each sub-mesh's `matrixWorld` into
        // translate × rotateY × scale; a shear survives none of those three, so the
        // conversion would render a PLUMB leaf in a leaning hole while reporting
        // success — the silently-wrong geometry ADR-0310 refused the whole case to
        // avoid. The window keeps its real meshes instead: correct, and merely not
        // coalesced. Instancing raked leaves needs a per-instance full matrix in
        // `ElementInstanceBridge`, not a fixup here (C65 §3.9).
        //
        // §FEAT-CURVED-WINDOW-LEAF (L-957) — a CURVED host is excluded for the same
        // class of reason, and it is worth stating precisely because the two
        // exclusions are NOT the same bug. `_convertGroupToInstances` reads
        // `(mesh.geometry as THREE.BoxGeometry).parameters` to recover each
        // sub-box's authored size; a swept pane is a raw `BufferGeometry` and has
        // no `parameters` at all, so the conversion would fall back to its `?? 1`
        // guards and render every curved member as a 1 m cube. Instancing a curved
        // leaf needs per-instance geometry keys in `ElementInstanceBridge`, not a
        // fixup here — the same C65 §3.9 answer the rake arm gives.
        const _hostRaked = rakeShearPerMetre((wallData as { rakeAngleDeg?: number }).rakeAngleDeg) !== 0;
        if (this._instancingActive() && !_hostRaked && !arc) {
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
                    role: (obj.userData?.role as string | undefined) ?? 'geometry',
                    selectable: false,
                    /**
                     * §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — IN PLAN, THE WINDOW IS ITS SYMBOL.
                     *
                     * ─────────────────────────────────────────────────────────────────────
                     * THIS TAG WAS BRIEFED TO ME AS A BUG, AND THE BRIEF WAS WRONG. The
                     * reasoning it was refuted with is recorded here, because the argument is
                     * seductive and someone will make it again:
                     *
                     *   *"A door is `skipInPlan` because at 1.2 m a door opening is EMPTY. A
                     *   WINDOW IS THE OPPOSITE: the cut plane passes THROUGH its frame and
                     *   glazing, so those spanning lines are REAL CUT GEOMETRY. Tagging a
                     *   window `skipInPlan` would DELETE THE VERY LINES THAT MAKE IT A WINDOW."*
                     *
                     * The premise is true — the plane really does cut the frame, the sash, the
                     * mullion and the glazing. **The conclusion does not follow, because those
                     * cut lines DO NOT COME FROM THIS MESH.** They are authored, at the real
                     * dimensions, from the real record, by `WindowPlanSymbolBuilder` — which
                     * `EdgeProjectorService` injects into every plan (Phase 6). It draws the
                     * jamb ticks on the void edges, the two frame face lines, the rebate step,
                     * the sash, the meeting stile and the double-line glazing at its true
                     * `glazingThickness`. L-280 MEASURED that symbol's frame band and found it
                     * DIMENSIONALLY EXACT (0.050 m band == 0.050 m record `frameThickness`).
                     *
                     * So the mesh does not ADD the window's cut section — it DUPLICATES it,
                     * from a second, un-LOD'd, un-penned source that can disagree with the
                     * first. And on top of the duplicate it dumps the members the plan must
                     * NOT show at all: the HEAD BAR at ~2.2 m (above the cut plane), the row
                     * transoms, the upper opening lights and every glass pane's outline — each
                     * projected as a flat rectangle straight across the symbol. That is
                     * verbatim the door's disease (L-266), and `skipInPlan` is verbatim its
                     * cure. Contract 48 §5 is the RULE, not a door-shaped exception:
                     * **AN ELEMENT WITH A PLAN SYMBOL DOES NOT ALSO EMIT ITS MESH EDGES IN PLAN.**
                     *
                     * WHAT IS GENUINELY DIFFERENT ABOUT THE WINDOW is not whether it skips —
                     * it is WHAT ITS SYMBOL MUST CONTAIN. A door's symbol is a void, a leaf and
                     * an arc; nothing sits at the cut plane. A window's symbol must carry a
                     * true CUT SECTION PROFILE, because the plane really does pass through the
                     * members. That is the work, and it was done where it belongs — in the
                     * SYMBOL (see `WindowPlanSymbolBuilder`, §4/§5: the sash and the mullion,
                     * derived from `sashThickness` + `columnDividerThickness` + `columnRatios`).
                     * The guard `WindowMeshSkipInPlan.test.ts` asserts BOTH halves: the mesh is
                     * silent, AND the symbol still carries the cut lines — so this tag can
                     * never be used to quietly delete the window.
                     */
                    skipInPlan: true,
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
        // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): `win.offset` is the LEFT EDGE
        // of the opening span [offset, offset+width] along the wall CENTRELINE (the
        // convention used by every producer, the window tool, the occupancy store, and
        // C15 §2 voidStart=offset). The frame CENTRE = offset + width/2 — which is
        // exactly where WallFragmentBuilder now cuts the void and places the frame.
        //
        // §FEAT-HOSTED-ON-CURVED-WALL — the centreline is the ARC when the host is
        // curved, so both the position AND the heading come from the local arc frame:
        // the window is oriented to the TANGENT at its centre, never to the chord
        // (a chord-aligned window on a curved wall visibly skews out of the reveal).
        // For a straight host `hostedElementFrame` reduces exactly to
        // `baseLine[0] + (offset + width/2) × wallDir` with a constant heading.
        const _hf = hostedElementFrame(wallData, win.offset, win.width);
        const centre = new THREE.Vector3(_hf.x, 0, _hf.z);

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
        // ── §WALL-Y-DATUM (L-968) — the leaf sits in the HOST WALL's hole ────────
        //
        // This was `elevation + sillHeight + height / 2`: it read neither
        // `slabBaseOffset` (0 occurrences in this package, by C84 §9's own count) nor
        // `wall.baseOffset`. The wall body's carve puts the void band at
        // `wallBaseY + sillHeight`, so a wall on a raised slab, or with a plinth,
        // moved its hole and left the leaf behind — one "set the base offset to
        // 150 mm" displaced every window on that wall by `slabBaseOffset + 2 ×
        // baseOffset` (the factor of 2 being the doubling fixed in
        // `WallFragmentBuilder`).
        //
        // `resolveWallBaseYOrLevel` returns the plane the wall builder PUBLISHED. Its
        // fallback (host never built) omits only the slab term, which this package
        // has no lawful way to read — it is not silently equal to the published
        // value and is not pretended to be.
        const wallBaseY = resolveWallBaseYOrLevel(
            wallData.id,
            elevation,
            (wallData as { baseOffset?: number }).baseOffset,
        );
        const y = hostedLeafCentreY(wallBaseY, win.sillHeight, win.height);

        group.position.set(centre.x, y, centre.z);
        group.rotation.y = _hf.rotationY;

        // ── §RAKE-HOSTED-OPENING (founder 2026-08-18) ────────────────────────
        //
        // ADR-0310 §2.5 refused a hosted opening on a raked wall partly because of
        // THIS function: *"sill is a bare world-Y translate … `hostedElementFrame`
        // returns a scalar rotationY"*, i.e. the vertical axis was not modelled. It
        // is now — as the same shear the wall's own body takes, so the leaf fills
        // the void exactly rather than by a second calculation kept in agreement
        // with the first. See `WallRake.ts` §RAKE-HOSTED-OPENING for why the leaf is
        // IN-PLANE (forced) and the height PLUMB (a documented default).
        //
        // `k` is `cot(rake)` from the ONE canonical predicate — never re-derived.
        // Zero for a vertical wall, and then everything below is skipped and the
        // group keeps ordinary TRS placement, byte-identical to before.
        const k = rakeShearPerMetre((wallData as { rakeAngleDeg?: number }).rakeAngleDeg);
        if (k === 0) return;

        // The wall pivots about its BASE, so the leaf's centre is displaced by the
        // shear evaluated at its own height above that base. `rakeTopOffset` IS that
        // function — pass the rise instead of the wall height (see its doc comment).
        const [bs, be] = wallData.baseLine as ReadonlyArray<{ x: number; y: number; z: number }>;
        const dir = { x: be.x - bs.x, z: be.z - bs.z };
        // §WALL-Y-DATUM (L-968) — the shear pivots about the wall's BASE plane, and
        // that is the same one number the leaf was just seated from. It used to be
        // re-derived here as `elevation + baseOffset`, i.e. WITHOUT the slab term,
        // so on a raised slab the rake displacement was computed from the wrong rise.
        const off = rakeTopOffset(
            (wallData as { rakeAngleDeg?: number }).rakeAngleDeg,
            y - wallBaseY,
            dir,
        );
        if (!off) return;                       // degenerate baseline — leave the leaf plumb
        group.position.set(centre.x + off.x, y, centre.z + off.z);

        // …and the leaf's own body leans with the wall. In the group's LOCAL frame
        // (+X along the wall, +Z on `leftPerp` after `rotationY`) the lean is the
        // one-element shear `z ↦ z + k·y`. A shear has no TRS decomposition, so the
        // matrix is written directly and `matrixAutoUpdate` disabled — three.js still
        // shades it correctly (the normal matrix is the inverse-transpose of the
        // model-view matrix) and still picks it correctly (`Raycaster` inverts
        // `matrixWorld`). Every rebuild re-enters this function, so the flag cannot
        // strand a window that is later straightened: `k === 0` returns above with
        // `matrixAutoUpdate` already restored to true by `rebuild`'s fresh group.
        group.updateMatrix();
        group.matrixAutoUpdate = false;
        group.matrix.multiply(new THREE.Matrix4().set(
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, k, 1, 0,
            0, 0, 0, 1,
        ));
        group.matrixWorldNeedsUpdate = true;
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

    /**
     * §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — THE WINDOW ROW OF ADR-121'S LOD MATRIX.
     *
     * The window's 3D + elevation cells were ✗. They are the door's row again (L-266), and it
     * is the template: same shared `resolveEffectiveDetailLevel`, LOD-300 ⊃ 200 ⊃ 100, and the
     * ELEVATION INHERITS BY PROJECTING THE MESH (ADR-121 §4.3 — no second symbol engine).
     *
     *   coarse 100 — the MASSING window: the outer frame + ONE glazing plane. No dividers, no
     *                sash, no bead, no sill. A silhouette and its opening extents.
     *   medium 200 — TODAY'S WINDOW, exactly: frame + mullions/transoms + per-cell panes +
     *                sill. This tier is pinned by a guard so no view setting can ever REGRESS
     *                the model that currently ships.
     *   fine   300 — + the SASH (the openable leaf frame captured inside the outer frame) and
     *                the GLAZING BEAD standing in the frame REBATE — the founder's reference
     *                window read as a REAL multi-line profile: outer frame, sash,
     *                mullion/meeting-stile, glazing line.
     *
     * EVERY DIMENSION COMES FROM `resolveWindowDimensions()` (record → systemType → canonical
     * default). There is not one literal below. A richer HARDCODED window would be the same
     * bug at higher resolution (ADR-121 §4.4).
     */
    private buildVisuals(win: WindowOpening, group: THREE.Group, wallFrameDepth?: number, vgStyle?: VGStyle, levelId = 'default', lod: DetailLevel = 'fine', arc: LeafArc | null = null): THREE.Material[] {
        const mats: THREE.Material[] = [];
        const { width: w, height: h, frameThickness: ft } = win;
        // Use the wall-derived depth when provided so the frame spans the full void.
        const fd = wallFrameDepth ?? win.frameDepth;
        // §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) / L-127 — the SAME dimension authority
        // the plan symbol reads (record → system type → canonical defaults). The glazing
        // thickness and the sill overhang used to be literals here (0.006 and 0.04); they
        // are dimensions, and a dimension has exactly one source.
        const dims = resolveWindowDimensions(win);

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
        const glassMat = this._sharedGlassMaterial(levelId, glassOpacity, dims.glazingThickness);
        mats.push(frameMat, glassMat);

        // ── Outer Frame (EVERY LOD — it is the window's silhouette) ────────
        //
        // §FEAT-CURVED-WINDOW-LEAF (L-957) — THE FOUNDER'S DECOMPOSITION, APPLIED.
        // HEAD and CILL traverse the arc and are SWEPT; the two JAMBS are vertical
        // rulings of the host's vertical-axis sweep, so they stay straight boxes and
        // are merely RE-SEATED onto it. Both reduce to `addBox` on a straight host.
        //
        // The head and cill span the full authored `w`, i.e. arc length `offset` to
        // `offset + width` — precisely the two stations `CurvedWallOpeningBuilder`
        // terminates its bands on. Their end caps are radial for the same reason the
        // void's jambs are, so frame and reveal meet on ONE plane rather than two
        // that nearly agree.
        // Head
        addSweptBox(group, frameMat, arc, w, ft, fd, 0,  h / 2 - ft / 2, 0, 'windowFrame');
        // Cill
        addSweptBox(group, frameMat, arc, w, ft, fd, 0, -h / 2 + ft / 2, 0, 'windowFrame');
        // Left jamb (between head and cill)
        const sideH = h - 2 * ft;
        addSeatedBox(group, frameMat, arc, ft, sideH, fd, -(w / 2 - ft / 2), 0, 0, 'windowFrame');
        // Right jamb
        addSeatedBox(group, frameMat, arc, ft, sideH, fd,  (w / 2 - ft / 2), 0, 0, 'windowFrame');

        // ── Glazing area ───────────────────────────────────────────────────
        // Inner area available for glass and dividers
        const innerW = w - 2 * ft;
        const innerH = h - 2 * ft;

        // ── COARSE (LOD 100) — THE MASSING WINDOW ──────────────────────────
        //
        // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278). ADR-121 §4.2 defines the tier, and the tier
        // definition is a DEFINITION, not a per-element opinion: at LOD 100 an element is its
        // *"silhouette + opening extents. No frame/sash, no reveals, no panelisation."* So the
        // massing window is the outer frame and ONE sheet of glass — no dividers, no sash, no
        // bead, no sill board. It exits here; every richer tier falls through and ADDS.
        if (lod === 'coarse') {
            addSweptBox(
                group, glassMat, arc,
                Math.max(innerW, 0.01), Math.max(innerH, 0.01), dims.glazingThickness,
                0, 0, 0, 'windowGlazing',
            );
            return mats;
        }

        // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — THE PANE GRID AND ITS MULLION, RESOLVED.
        //
        // The DW-11 double-window override (a `double` ALWAYS has two sashes on a structural
        // centre post) and the 60 mm meeting-stile minimum used to live HERE, as
        // `Math.max(win.columnDividerThickness, 0.06)` — a literal, and invisible to the plan
        // symbol, which therefore drew a 30 mm mullion under a 60 mm one. Both rules now live
        // in `resolveWindowDimensions()`, so the 3D window and the symbol read ONE answer.
        const colWidths  = ratioWidths(innerW, [...dims.columnRatios]);
        const rowHeights = ratioWidths(innerH, win.rowRatios);

        const cdt = dims.columnDividerThickness;
        const rdt = dims.rowDividerThickness;
        const nCols = colWidths.length;
        const nRows = rowHeights.length;
        // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278) — the divider's depth in the reveal. This was
        // the bare literal `fd * 0.5`, invisible to the plan symbol, which therefore could not
        // draw the post's section at the depth it is really built at. One name, both consumers.
        const dividerDepth = fd * DEFAULT_WINDOW_DIMENSIONS.dividerDepthRatio;

        // Column dividers (vertical) — the MULLIONS / meeting stiles, between columns.
        let colX = -innerW / 2;
        for (let c = 0; c < nCols; c++) {
            colX += colWidths[c] ?? 0;
            if (c < nCols - 1) {
                // §FEAT-CURVED-WINDOW-LEAF — a MULLION is vertical: straight, re-seated.
                addSeatedBox(group, frameMat, arc, cdt, innerH, dividerDepth, colX - cdt / 2, 0, 0, 'windowMullion');
            }
        }

        // Row dividers (horizontal) — the TRANSOMS, per column to avoid intersecting the mullions.
        colX = -innerW / 2;
        for (let c = 0; c < nCols; c++) {
            const cw = colWidths[c] ?? 0;
            let rowY = -innerH / 2;
            for (let r = 0; r < nRows; r++) {
                rowY += rowHeights[r] ?? 0;
                if (r < nRows - 1) {
                    // §FEAT-CURVED-WINDOW-LEAF — a TRANSOM is horizontal: it traverses
                    // the arc and is swept, exactly like the head and cill.
                    addSweptBox(group, frameMat, arc, cw, rdt, dividerDepth, colX + cw / 2, rowY - rdt / 2, 0, 'windowTransom');
                }
            }
            colX += cw;
        }

        // Glass panes (per cell) — plus, at FINE, the sash and the glazing bead that frame it.
        colX = -innerW / 2;
        for (let c = 0; c < nCols; c++) {
            const cw = colWidths[c] ?? 0;
            // Subtract column divider space on each side of this column
            const paneW = c === 0
                ? cw - (nCols > 1 ? cdt / 2 : 0)
                : c === nCols - 1
                    ? cw - cdt / 2
                    : cw - cdt;

            let rowY = -innerH / 2;
            for (let r = 0; r < nRows; r++) {
                const rh = rowHeights[r] ?? 0;
                const paneH = r === 0
                    ? rh - (nRows > 1 ? rdt / 2 : 0)
                    : r === nRows - 1
                        ? rh - rdt / 2
                        : rh - rdt;

                const paneCX = colX + cw / 2;
                const paneCY = rowY + rh / 2;

                const cellW = Math.max(paneW, 0.01);
                const cellH = Math.max(paneH, 0.01);

                // ── FINE (LOD 300) — THE SASH AND THE GLAZING BEAD ─────────────
                //
                // §FEAT-WINDOW-CUT-ZONE-AND-LOD (L-278). The founder's LOD-300 reference draws
                // the window as a REAL multi-line profile — outer frame, SASH, meeting stile,
                // glazing line — *"not a stack of arbitrary offsets."* The SASH is the openable
                // leaf frame captured inside the outer frame; the BEAD is the fillet standing in
                // the frame's REBATE that actually holds the sealed unit in. Both are members
                // the record can name (`sashThickness`/`sashDepth`, `rebateDepth`), so both are
                // DERIVED — the glass is then reduced to the clear sight line inside the sash,
                // which is what makes the frame read as a profile rather than a flat band.
                let glassW = cellW;
                let glassH = cellH;

                if (lod === 'fine') {
                    const st = Math.min(dims.sashThickness, cellW / 2, cellH / 2);
                    if (st > 0) {
                        const sd = Math.min(dims.sashDepth, fd);
                        // The four sash members, mitred around the cell.
                        // §FEAT-CURVED-WINDOW-LEAF — head/cill rails SWEEP, stiles are
                        // vertical rulings and stay straight.
                        addSweptBox(group, frameMat, arc, cellW, st, sd, paneCX, paneCY + cellH / 2 - st / 2, 0, 'windowSash');
                        addSweptBox(group, frameMat, arc, cellW, st, sd, paneCX, paneCY - cellH / 2 + st / 2, 0, 'windowSash');
                        const sashSideH = Math.max(cellH - 2 * st, 0.001);
                        addSeatedBox(group, frameMat, arc, st, sashSideH, sd, paneCX - cellW / 2 + st / 2, paneCY, 0, 'windowSash');
                        addSeatedBox(group, frameMat, arc, st, sashSideH, sd, paneCX + cellW / 2 - st / 2, paneCY, 0, 'windowSash');

                        // The glass now sits in the sash's clear sight line…
                        glassW = Math.max(cellW - 2 * st, 0.01);
                        glassH = Math.max(cellH - 2 * st, 0.01);

                        // …captured by the BEAD, which stands proud of the glazing plane by the
                        // rebate depth. It is clamped to the sash member that contains it — a
                        // bead can never be deeper than its own frame (the same clamp the plan
                        // symbol applies to the rebate).
                        const bead = Math.min(dims.rebateDepth, st);
                        if (bead > 0) {
                            const beadZ = dims.glazingThickness / 2 + bead / 2;
                            // §FEAT-CURVED-WINDOW-LEAF — both beads are horizontal, and
                            // they sit against the glass, so they must bow with it.
                            addSweptBox(group, frameMat, arc, glassW, bead, bead, paneCX, paneCY + glassH / 2 - bead / 2, beadZ, 'windowBead');
                            addSweptBox(group, frameMat, arc, glassW, bead, bead, paneCX, paneCY - glassH / 2 + bead / 2, beadZ, 'windowBead');
                        }
                    }
                }

                // §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) — the pane is extruded at the
                // window's REAL glazing thickness (the sealed unit), which is exactly
                // what the plan symbol draws as its thin double line.
                // §FEAT-CURVED-WINDOW-LEAF (L-957) — THE GLASS IS CURVED. On a
                // curved host the pane is swept along the wall's OWN centreline
                // stations, so pane and reveal share their tessellation and cannot
                // disagree at the edge where they meet.
                addSweptBox(group, glassMat, arc, glassW, glassH, dims.glazingThickness, paneCX, paneCY, 0, 'windowGlazing');

                rowY += rh;
            }
            colX += cw;
        }

        // ── Sill (medium + fine) ───────────────────────────────────────────
        if (win.sill && win.sillDepth > 0 && win.sillThickness > 0) {
            // §INSTANCE-WINDOWS — sill mirrors the frame colour (roughness 0.7),
            // resolved from the SHARED cache so it coalesces across storeys too.
            const sillMat = this._sharedFrameMaterial(levelId, this._resolveFrameColor(win), false, 1, 0.7);
            mats.push(sillMat);
            // Sill protrudes from bottom of window toward exterior (positive Z in group space)
            // §FEAT-CURVED-WINDOW-LEAF — the sill BOARD is the longest horizontal in
            // the leaf and the one a viewer reads the curve off first. `hostedElementFrame`
            // EXTRAPOLATES tangentially past a wall end rather than clamping, which is
            // exactly what a real board does with its overhang — see `stationFrame`.
            addSweptBox(
                group, sillMat, arc,
                // §FEAT-WINDOW-PLAN-SYMBOL-SOUND (L-254) — the board overhangs each jamb by
                // the RESOLVED `sillOverhang` (was a bare `+ 0.04`). The plan sill line is
                // drawn to the same overhang, so the symbol and the built board agree.
                w + 2 * dims.sillOverhang,
                win.sillThickness,
                fd + win.sillDepth,
                0,
                -h / 2 + win.sillThickness / 2,
                win.sillDepth / 2,       // protrudes out from wall face
                'windowSill',
            );
        }

        return mats;
    }

    /**
     * §C13-BUILDER-SCENE-CLEAR — detach EVERY window group from the scene, without
     * tearing the builder down (its `windowStore` subscription and the SHARED
     * frame/glass material caches must survive to serve the incoming project).
     * C13 §3.8/§3.10. Invoked by the `bim-project-cleared` sweep in `initBuilders.ts`.
     */
    clearProjectGeometry(): void {
        this._pendingBuilds.clear();
        for (const id of Array.from(this.windowGroups.keys())) this.dispose(id);
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
