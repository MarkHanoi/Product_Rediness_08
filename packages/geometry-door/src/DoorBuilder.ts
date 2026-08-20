import * as THREE from '@pryzm/renderer-three/three';
// §I2 — WebGPU-safe disposal: routing material/geometry teardown through these
// stops the `[DoorBuilder] build error: … usedTimes` throw aborting rebuild().
import { safeDisposeGeometry, safeDisposeMaterial } from '@pryzm/renderer-three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { doorStore } from './DoorStore';
import { doorSystemTypeStore } from './DoorSystemTypeStore';
// §FIX-DOOR-PREVIEW-EXACT / §FIX-DOOR-FRAME (L-127) — resolve the door's real
// frame/leaf dimensions from the SAME source the preview + plan symbol use, so
// the placed 3D frame is dimensionally identical to what the user previewed.
import { resolveDoorDimensions } from './DoorDimensions';
import { DoorOpening } from './DoorTypes';
// ⭐ C100 §2.1 / S17 — the door's material ladder. The builder is the RENDERING
// authority (WindowBuilder says the same of itself), so it must resolve the id the
// record carries; it must not re-implement the ladder, and it does not.
import {
    resolveDoorFinishColour,
    DOOR_COLOR_SENTINEL,
    DOOR_UNRESOLVED_MATERIAL_COLOR,
    type DoorFinishSlot,
    type DoorFinishColour,
} from './doorFinishColour';
// §FEAT-CURVED-DOOR-LEAF (L-957) — the leaf's arc is the HOST'S arc, consumed
// through `hostedElementFrame`. Nothing in this file re-derives it; see
// `CurvedLeafGeometry.ts` for why that is the whole point of the feature, and
// for the measured reason only HORIZONTAL members bend.
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
    // §OPENING-PROFILE-FRAME (L-1521) — THE ONE PRODUCER of the void's outline, the pure helpers
    // derived from it, and the shared frame solid. `grep -c openingProfile DoorBuilder.ts` was
    // **0** before this line: the wall cut an arched head and the frame drew a square one around
    // it (C86 §11 #1). Nothing below re-derives an arc — PR-1 forbids it, and after this there is
    // no arc in this file to get wrong.
    openingOutlineLocal, openingSpringLineYLocal, insetOutlinePoints, clipOutlinePointsAbove,
    profiledBandGeometry, profiledPlateGeometry,
    // The FAMILY declaration and the resolver — consulted, never restated. `openingProfilesFor`
    // is why a door has three options and not four (L-1251).
    openingProfilesFor, resolveOpeningProfile, DEFAULT_OPENING_PROFILE,
    type OpeningOutline,
} from '@pryzm/geometry-wall';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { SpatialAuthorityError } from '@pryzm/core-app-model';
// §FEAT-DOOR-3D-LOD (L-266) — the 3D door is a DetailLevel consumer, through the SAME
// resolver the plan symbol uses. ADR-121 §4.3: "One resolver, three consumers — there
// must not be a resolveElevationDetailLevel." `vd-sys-3d-1` is a real ViewDefinition
// (DefaultViewsManager) carrying a live `output.detailLevel`, so this is a genuine
// resolution — C09 element/type/category override → the 3D view's own setting → default.
import {
    resolveEffectiveDetailLevel, DEFAULT_3D_VIEW_ID, storeEventBus,
    type DetailLevel,
} from '@pryzm/core-app-model';
import { vgGovernanceStore, VGStyle } from '@pryzm/visibility';
import { DOMEventBus } from '@pryzm/event-bus';
const _bus = new DOMEventBus();

// ── Module-level singleton for hinge/handle (metallic, never varies per door)
const _hingeMat = new THREE.MeshStandardMaterial({
    color: '#aaaaaa', roughness: 0.2, metalness: 0.85,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});

// ── Helper: add a BoxGeometry mesh to parent ────────────────────────────────
function addBox(
    parent: THREE.Object3D,
    material: THREE.Material,
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    role?: string,
): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    if (role) mesh.userData.role = role;
    parent.add(mesh);
    return mesh;
}

/**
 * §FEAT-CURVED-DOOR-LEAF (L-957) — a member that must FOLLOW the host's arc.
 *
 * Identical arguments to {@link addBox}, and identical behaviour when `arc` is
 * `null` — which is every straight-walled door in every project, i.e. the case
 * slice 0 pins byte-identical. It is the same `new THREE.BoxGeometry(w, h, d)`
 * call reached by the same branch, not a reconstruction that happens to agree.
 *
 * When `arc` is present the member is swept along the wall's own centreline
 * stations instead. Use this for the LEAF, its glazed lights, and every
 * HORIZONTAL member — head, threshold, head stop, leaf rails, panels, slats and
 * the sidelight surround. Verticals must use {@link addSeatedBox}: a vertical is
 * a straight ruling of a vertical-axis sweep, so sweeping it would be wrong, not
 * merely wasteful.
 */
function addSweptBox(
    parent: THREE.Object3D,
    material: THREE.Material,
    arc: LeafArc | null,
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    role?: string,
): THREE.Mesh {
    if (!arc) return addBox(parent, material, w, h, d, x, y, z, role);
    const mesh = new THREE.Mesh(sweptBoxGeometry(arc, w, h, d, x, y, z), material);
    // The sweep is authored in group-local coordinates already — the geometry
    // carries the member's position, so the mesh sits at the group origin. A
    // position offset here would double-count it.
    mesh.position.set(0, 0, 0);
    if (role) mesh.userData.role = role;
    parent.add(mesh);
    return mesh;
}

/**
 * §FEAT-CURVED-DOOR-LEAF (L-957) — a STRAIGHT member RE-SEATED onto the arc.
 *
 * Frame posts, jamb stops, leaf stiles, glazing bars, the double door's meeting
 * mullion, the sidelight mullion and every vertical batten stay straight boxes
 * (see `CurvedLeafGeometry`'s header for why that is a measured property of the
 * stored model and not a simplification). They must still be RE-SEATED, though:
 * on a curved host their plan position and heading follow the wall, or a stile
 * halfway along a wide curved door stands proud of the panel on one side and
 * sinks into it on the other.
 *
 * The door's IRONMONGERY takes this path too — hinges, lever, rose, pull bar.
 * A handle is a manufactured rigid object; it is re-seated onto the arc, never
 * bent along it. That is the same call `DoorPlanSymbolBuilder` already makes for
 * the swung leaf and its hardware (§FIX-HOSTED-PLAN-SYMBOL-ON-CURVED-HOST:
 * *"rigid sub-assemblies … pivot about the hinge and do not bend"*).
 *
 * Falls through to {@link addBox} unchanged for a straight host.
 */
function addSeatedBox(
    parent: THREE.Object3D,
    material: THREE.Material,
    arc: LeafArc | null,
    w: number, h: number, d: number,
    x: number, y: number, z: number,
    role?: string,
): THREE.Mesh {
    if (!arc) return addBox(parent, material, w, h, d, x, y, z, role);
    const seat = arcSeat(arc, x, z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(seat.x, y, seat.z);
    mesh.rotation.y = seat.rotationY;
    if (role) mesh.userData.role = role;
    parent.add(mesh);
    return mesh;
}

/**
 * §OPENING-PROFILE-FRAME (L-1521) — attach an EXTRUDED PROFILE solid.
 *
 * The counterpart to {@link addBox} for the non-rectangular arm. It takes a finished
 * `BufferGeometry` rather than dimensions, because a profiled member has no `w × h × d` to state:
 * it is a band or a plate, authored in group-local `(x, y)` by the ONE producer's outline and
 * already centred on `z`.
 *
 * `null` in, nothing added — the producer refuses an outline it cannot triangulate, and a MISSING
 * member is visible and reportable where a subtly-wrong one is not.
 */
function addProfiled(
    parent: THREE.Object3D,
    material: THREE.Material,
    geo: THREE.BufferGeometry | null,
    role?: string,
    z = 0,
): THREE.Mesh | null {
    if (!geo) return null;
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(0, 0, z);
    if (role) mesh.userData.role = role;
    parent.add(mesh);
    return mesh;
}

// ── Helper: create a fresh MeshStandardMaterial with polygon offset ─────────
function makeMat(color: string, roughness = 0.5, metalness = 0, transparent = false, opacity = 1): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color,
        roughness,
        metalness,
        transparent,
        opacity,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    });
}

/**
 * §DOOR-GLAZING-2026 — create a transparent GLASS material.
 *
 * Closes the long-standing glazing gap: until now glazed door types only
 * tinted the (opaque) leaf colour and the glass never read as glass. This
 * builds a genuinely transparent, low-opacity, glass-tinted material so a
 * door system-type with `glazingOpacity < 1` / `type:'glass'` segments
 * renders see-through.
 *
 * @param glazingOpacity — the TYPE's glazingOpacity (0 = clear, 1 = opaque).
 *   Clamped to a visible-but-transparent floor (~0.18) so clear glass still
 *   catches a highlight rather than vanishing entirely.
 */
function makeGlassMat(glazingOpacity: number): THREE.MeshStandardMaterial {
    const opacity = Math.max(0.18, Math.min(1, glazingOpacity));
    return new THREE.MeshStandardMaterial({
        color: '#bcd2d6',       // cool, faintly-green glass tint
        roughness: 0.05,
        metalness: 0.0,
        transparent: true,
        opacity,
        depthWrite: false,      // standard glass: don't occlude what's behind
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
    });
}

/** Pending build task: the latest door data + previous snapshot for diff. */
interface DoorBuildTask {
    door: DoorOpening;
    prev?: DoorOpening;
}

/**
 * C1 — DoorBuilder
 *
 * Subscribes to DoorStore and renders parametric 3D door geometry (frame,
 * leaf, hinges, handle, threshold) for every door in the store.
 *
 * Architecture: pure subscriber — reads wallStore for positioning only.
 * Never writes to any store. Fully compliant with §03 Command Pipeline.
 *
 * PLAN-06: Dispatches DOM events (bim-door-added, bim-door-updated,
 * bim-door-removed) so SelectionManager can invalidate its raycaster cache.
 *
 * PLAN-07: Exposes rebuildForWall(wallId) so EngineBootstrap can call it
 * when a wall's baseline changes, keeping door positions in sync.
 *
 * C11 §2 step 3 (Task 1.2) — geometry builds are deferred via FrameScheduler
 *   adaptive drain. Store subscription enqueues tasks; `_drainBuildQueue()`
 *   processes up to `_buildsPerFrame` items per pre-render tick.
 */
export class DoorBuilder {
    private scene: THREE.Scene;
    private wallStore: any;
    private doorGroups: Map<string, THREE.Group> = new Map();
    /** Per-door cloned materials to dispose on rebuild/remove */
    private doorMaterials: Map<string, THREE.Material[]> = new Map();
    private unsubscribe: (() => void) | null = null;
    /** §FEAT-DOOR-3D-LOD (L-266) — StoreEventBus disposer for the 3D-view intent watch. */
    private _unsubscribeViews: (() => void) | null = null;
    /** The Detail Level each door's CURRENT mesh was built at — the rebuild trigger. */
    private _builtLod = new Map<string, DetailLevel>();

    // ── C11 §2 step 3: FrameScheduler adaptive drain ──────────────────────────
    /** Pending door builds keyed by id — later update wins (dedup). */
    private _pendingBuilds = new Map<string, DoorBuildTask>();
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

    /** Call once after scene is ready. Replays any already-stored doors (from project load). */
    activate(): void {
        // Replay any doors already in the store (loaded from snapshot before activate())
        for (const door of doorStore.getAll()) {
            this._enqueue(door, undefined);
        }
        this.unsubscribe = doorStore.subscribe((event, door, prev) => {
            if (event === 'add' || event === 'update') {
                this._enqueue(door, prev);
            }
            if (event === 'remove') this.dispose(door.id);
        });

        // §FEAT-DOOR-3D-LOD (L-266) — DETAIL LEVEL IS INTENT, AND INTENT IS LIVE.
        //
        // The Detail Level of the 3D view is a P7 visibility INTENT: it lives on the
        // ViewDefinition (the properties-panel dropdown) and in the C09 override layer.
        // A consumer that reads it once at build time and never again is not a consumer —
        // it is a snapshot. So the builder listens for changes to the 3D ViewDefinition
        // and rebuilds ONLY the doors whose RESOLVED level actually moved (the cache
        // below), which makes a no-op view edit free and a real one immediate.
        this._unsubscribeViews = storeEventBus.subscribe((e) => {
            if (e.elementType !== 'view-definition' || e.elementId !== DEFAULT_3D_VIEW_ID) return;
            for (const door of doorStore.getAll()) {
                if (this._lodFor(door) !== this._builtLod.get(door.id)) this._enqueue(door, undefined);
            }
        });
        console.log('[DoorBuilder] activated');
    }

    /**
     * The effective Detail Level for this door IN THE 3D VIEW.
     *
     * ADR-121 §4.3 — ONE resolver, three consumers. This is the same
     * `resolveEffectiveDetailLevel` the plan symbol calls; the door owns none of the
     * precedence (C09 element → element-type → category override → the 3D view's own
     * `output.detailLevel` → the L0 default). There is deliberately no private
     * `detailed` flag and no `resolve3dDetailLevel`.
     */
    private _lodFor(door: DoorOpening): DetailLevel {
        return resolveEffectiveDetailLevel(door.id, DEFAULT_3D_VIEW_ID, {
            elementType: 'door',
            category:    'door',
        });
    }

    /**
     * §WALL-DEEP-2026 B1 (RESOLVED 2026-04-24) — fields whose change does NOT
     * require geometry rebuild. Frame / leaf colour can be patched live;
     * finish + identity metadata never affect the mesh.
     */
    private static readonly _PROPERTY_ONLY_FIELDS: ReadonlySet<keyof DoorOpening> = new Set<keyof DoorOpening>([
        'frameColor', 'leafColor',
        'fireRating', 'accessibilityType', 'mark', 'finishMaterial',
        'frameFinish', 'leafFinish',
        // §DOOR-GLAZING-2026 — `systemTypeId` is NO LONGER property-only: the type
        // now drives geometry (glazing / glass segments / sidelight), so a type
        // change must trigger a full mesh rebuild, not just a colour patch.
    ]);

    /** §WALL-DEEP-2026 B1 — diff classifier. Mirrors WindowBuilder. */
    private _isPropertyOnlyChange(prev: DoorOpening, next: DoorOpening): boolean {
        if (prev === next) return false;  // touch() cascade — must rebuild
        const vg = vgGovernanceStore.getEffectiveStyle('Door', next.id);
        if (vg.hidden || vg.colorOverride !== undefined || vg.opacityFactor !== undefined) return false;
        let materialDirty = false;
        const keys = new Set<keyof DoorOpening>([
            ...(Object.keys(prev) as (keyof DoorOpening)[]),
            ...(Object.keys(next) as (keyof DoorOpening)[]),
        ]);
        for (const k of keys) {
            if ((prev as any)[k] === (next as any)[k]) continue;
            if (!DoorBuilder._PROPERTY_ONLY_FIELDS.has(k)) return false;
            materialDirty = true;
        }
        return materialDirty;
    }

    /**
     * ⭐ C100 §2.1 / S17 — THE door's colour authority, and the ONLY one in this file.
     *
     * Both material paths call it — the full rebuild (`buildVisuals`) and the live
     * patch (`_applyPropertyOnly`) — because `frameFinish` / `leafFinish` sit in
     * `_PROPERTY_ONLY_FIELDS`, so a finish change is routed to the PATCH path and
     * never to the rebuild. A resolver wired into only one of the two would leave
     * the user's actual gesture — picking a finish from the dropdown — on the
     * unfixed branch, which is precisely the shape of the defect being closed.
     *
     * C100 §5's diagnostic is emitted here, ONCE PER DOOR (not per member, and not
     * per frame): a façade of a hundred doors on a deleted material must produce a
     * hundred magenta doors and ONE console line.
     */
    private _finishColour(door: DoorOpening, slot: DoorFinishSlot): DoorFinishColour {
        // Rung 6 — the system TYPE's finish, for a door placed with no baked colour.
        // Mirrors `WindowBuilder._resolveFrameColor` step 2.
        const sysType = door.systemTypeId ? doorSystemTypeStore.getById(door.systemTypeId) : undefined;
        const typeFinishColor = slot === 'frame'
            ? sysType?.frameFinish?.materialColor
            : sysType?.leafFinish?.materialColor;

        const r = resolveDoorFinishColour(door, slot, DOOR_COLOR_SENTINEL, typeFinishColor);

        if (r.state === 'unresolved') {
            const key = `${door.id}|${slot}`;
            if (!DoorBuilder._unresolvedReported.has(key)) {
                DoorBuilder._unresolvedReported.add(key);
                console.warn(
                    `[DoorBuilder] C100 §5 — door ${door.id} ${slot} names material ` +
                    `'${r.materialId}' which resolves to NOTHING: ${r.reason} ` +
                    `Painting ${DOOR_UNRESOLVED_MATERIAL_COLOR} (magenta) on purpose — the ` +
                    'colour on screen is a FAILURE MARKER, not this door\'s material.',
                );
            }
        }
        return r;
    }

    /**
     * C100 §5: "the diagnostic is emitted once per distinct id, never once per
     * element". Keyed per door+slot rather than per id so a rebuild storm cannot
     * re-print, and static so it survives builder re-instantiation within a session.
     */
    private static readonly _unresolvedReported = new Set<string>();

    /** §WALL-DEEP-2026 B1 — patch live materials in place; no dispose+rebuild. */
    private _applyPropertyOnly(door: DoorOpening): void {
        const mats = this.doorMaterials.get(door.id);
        if (!mats || mats.length < 2) return;
        // mats[0] = frameMat, mats[1] = leafMat. (handleMat is appended after; left untouched.)
        const frameMat = mats[0] as THREE.MeshStandardMaterial | undefined;
        const leafMat  = mats[1] as THREE.MeshStandardMaterial | undefined;
        try {
            // ⭐ C100 §2.1 / S17 — THE line that made "Frame Finish → Oak" a no-op.
            // `frameFinish` is in `_PROPERTY_ONLY_FIELDS`, so choosing a finish came
            // HERE — and this used to re-set `door.frameColor`, the field the finish
            // dropdown does not write. The record changed, the patch ran, and the
            // material was assigned the colour it already had.
            if (frameMat?.color) frameMat.color.set(this._finishColour(door, 'frame').hex);
            if (leafMat?.color)  leafMat.color.set(this._finishColour(door, 'leaf').hex);
        } catch (err) {
            console.warn(`[DoorBuilder] property-only patch failed for ${door.id}; falling back to rebuild:`, err);
        }
        const group = this.doorGroups.get(door.id);
        if (group) {
            group.userData = Object.freeze({ ...group.userData, version: Date.now() });
            _bus.emit('bim-door-updated', { id: door.id }); // F.events.18
        }
    }

    deactivate(): void {
        // Cancel any pending drain.
        this._rafHandle?.();
        this._rafHandle = null;
        this._pendingBuilds.clear();

        this.unsubscribe?.();
        this.unsubscribe = null;
        this._unsubscribeViews?.();
        this._unsubscribeViews = null;
        // Dispose all groups
        for (const id of [...this.doorGroups.keys()]) {
            this.dispose(id);
        }
    }

    /**
     * PLAN-07: Rebuild all doors hosted on the given wall.
     * Called from EngineBootstrap's WallStore 'update' subscriber so that
     * when a wall's baseline or thickness changes, door geometry repositions correctly.
     * C11 §2 step 3: deferred via FrameScheduler — no longer synchronous.
     */
    rebuildForWall(wallId: string): void {
        // §FIX-HOSTWALL-DOOR-INDEX (2026-07-02) — BOUNDED re-anchor. Was an
        // UNBOUNDED `for (const door of doorStore.getAll())` full-project scan
        // filtered by `door.wallId === wallId`. WallRebuildCoordinator._flush
        // calls this ONCE PER REBUILT WALL on a baseline move, so the old scan
        // made a single wall move cost O(walls-rebuilt × all-doors-in-project) —
        // the confirmed main-thread-freeze root when a moved wall hosts openings.
        // The DoorStore now maintains a wallId → Set<doorId> reverse index, so
        // this visits ONLY the doors hosted on `wallId` (K, not N). A wall that
        // hosts no doors — the vast majority a whole-level rebuild touches — does
        // ZERO work here instead of an N-length scan.
        for (const id of doorStore.getIdsByWallId(wallId)) {
            const door = doorStore.getById(id);
            if (door) this._enqueue(door, undefined);
        }
    }

    // ── C11 §2 step 3: queue + drain ─────────────────────────────────────────

    /**
     * Enqueue a door build task. Later calls for the same door id overwrite
     * earlier ones so that rapid consecutive updates collapse to a single build.
     */
    private _enqueue(door: DoorOpening, prev: DoorOpening | undefined): void {
        this._pendingBuilds.set(door.id, { door, prev });
        if (this._rafHandle === null) {
            this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    /**
     * Adaptive drain: processes up to `_buildsPerFrame` doors per pre-render
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
                this.rebuild(task.door, task.prev);
            } catch (err) {
                console.error('[DoorBuilder] build error:', err);
            }
        }

        const frameMs = performance.now() - t0;
        if (frameMs < 8 && this._buildsPerFrame < DoorBuilder._MAX_BUILDS) {
            this._buildsPerFrame++;
        } else if (frameMs > 20 && this._buildsPerFrame > DoorBuilder._MIN_BUILDS) {
            this._buildsPerFrame--;
        }

        if (this._pendingBuilds.size > 0) {
            this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    // ── Private ─────────────────────────────────────────────────────────────

    private rebuild(door: DoorOpening, prev?: DoorOpening): void {
        // §MT-06-ONE-AUTHORITY — the leaf and frame are built from RECORD A,
        // always. The exact mirror of `WindowBuilder.rebuild`; see that method
        // for the full statement of the founder's L-916 path (host moves →
        // structural command re-seats RECORD A → `DoorDependencyTracker` calls
        // `doorStore.touch(id)` → the UNCHANGED door record is re-notified → the
        // leaf is rebuilt with the OLD offset against the NEW baseline).
        //
        // Resolved HERE, at the moment the record becomes meshes, because the
        // build queue drains a frame later than it fills. `prev` stays raw so a
        // pure host-move still reads as a geometric change rather than being
        // waved through the property-only fast path.
        // Optional-called for the reason given in `WindowBuilder.rebuild`: the
        // host store is duck-typed and may be a partial stub. Cannot-answer
        // resolves to the record unchanged, never a throw and never a zero.
        door = withAuthoritativeGeometry(door, this.wallStore?.hostedOpeningGeometry?.(door.id));

        // PLAN-06: determine add vs update BEFORE dispose() clears the map.
        const isUpdate = this.doorGroups.has(door.id);

        // §WALL-DEEP-2026 B1 — property-only fast path.
        if (isUpdate && prev && this._isPropertyOnlyChange(prev, door)) {
            this._applyPropertyOnly(door);
            return;
        }

        this.dispose(door.id);

        const wallData = this.wallStore.getById(door.wallId);
        if (!wallData) {
            console.warn(`[DoorBuilder] Wall not found for door ${door.id} (wallId=${door.wallId})`);
            return;
        }

        // §DOOR-AUDIT-2026 M4 — FK validation: warn (do not throw) when the
        // door references a systemTypeId that the type store cannot resolve.
        // Throwing here would break legacy projects; the warning surfaces the
        // dangling reference so it can be cleared by the next save migration.
        if (door.systemTypeId && !doorSystemTypeStore.getById(door.systemTypeId)) {
            console.warn(
                `[DoorBuilder] Door ${door.id} references unknown systemTypeId ` +
                `"${door.systemTypeId}" — falling back to inline parameters.`,
            );
        }

        // §DOOR-AUDIT-2026 / W5 (cross-element parity) — consult the VG governance
        // store for the effective style. `hidden:true` short-circuits projection
        // entirely so view templates can suppress doors without store mutation.
        const vgStyle = vgGovernanceStore.getEffectiveStyle('Door', door.id);
        if (vgStyle.hidden) {
            // Still register an empty group so removal events fire correctly when
            // the override is later cleared. We register-then-dispose so the
            // raycaster cache is invalidated.
            return;
        }

        const group = new THREE.Group();
        group.name = `door-${door.id}`;
        // §DOOR-AUDIT-2026: userData freeze + version + levelId mirror +
        // canonical 'Door' elementType case for both root group and child meshes.
        const rootUserData = {
            id:           door.id,
            elementType:  'Door',
            elementId:    door.id,
            openingId:    door.openingId,
            wallId:       door.wallId,
            levelId:      wallData.levelId,
            offset:       door.offset,
            width:        door.width,
            height:       door.height,
            sillHeight:   door.sillHeight,
            selectable:   true,
            version:      Date.now(),
        };
        group.userData = Object.freeze({ ...rootUserData });

        // Use wall thickness so the frame fully spans the void (no exposed cut edges).
        const frameDepth = (wallData.thickness ?? 0.2) + 0.02;
        // §FEAT-DOOR-3D-LOD (L-266) — ask the SHARED resolver what detail this door is
        // wanted at in the 3D view, and remember it so a later intent change can trigger
        // exactly the rebuilds it affects (and no others).
        const lod = this._lodFor(door);
        this._builtLod.set(door.id, lod);
        // §FEAT-CURVED-DOOR-LEAF (L-957) — `null` for every straight host, which
        // is what makes the ordinary path literally the old code. The arc is
        // resolved from the SAME `hostedElementFrame(wall, offset, width)` that
        // `positionGroup` places the group with, so the leaf's curvature and the
        // leaf's placement cannot be two answers.
        //
        // The refusal is CONSULTED, not restated. `curvedLeafRefusal` names the
        // one combination a curved leaf cannot carry and returns the reason as
        // text; the reason is stamped onto the group below so a panel can SHOW it
        // rather than re-deriving the condition. When it fires, the leaf falls
        // back to FLAT — a chorded leaf in a curved hole is visibly wrong and
        // therefore reportable, which is the point: "a refusal is a correct
        // answer; a silently-wrong wall is not" (`WallRake.ts`).
        const _leafRefusal = curvedLeafRefusal(wallData, 'door');
        const arc = _leafRefusal ? null : leafArc(wallData, door.offset, door.width);
        if (_leafRefusal) {
            // Re-frozen rather than mutated: `rootUserData` is frozen above, and
            // the field is added ONLY on the refusing path so a straight or
            // ordinary curved door's userData is untouched.
            group.userData = Object.freeze({ ...group.userData, curvedLeafRefusal: _leafRefusal });
        }
        const mats = this.buildVisuals(door, group, frameDepth, vgStyle, lod, arc);
        this.doorMaterials.set(door.id, mats);
        this.positionGroup(door, group, wallData);
        group.traverse(obj => {
            if (obj !== group && obj instanceof THREE.Mesh) {
                const isLeaf = obj.userData.role === 'doorLeaf';
                obj.userData = Object.freeze({
                    ...obj.userData,
                    elementType: isLeaf ? 'DoorLeaf' : 'Door',
                    parentId: door.id,
                    wallId: door.wallId,
                    levelId: wallData.levelId,
                    selectable: false,
                    leafVisibleInPlan: door.leafVisibleInPlan ?? false,
                    /**
                     * §FIX-DOOR-PLAN-SYMBOL-PURITY (L-266) — IN PLAN, THE DOOR IS ITS SYMBOL.
                     *
                     * The founder: *"There are lines that are really not needed — those lines
                     * are imaginary."* They were the 3D door's OWN edges. The plan projector
                     * dumps every mesh's `EdgesGeometry` onto A-DOOR, and classifies anything
                     * above the cut plane as PROJECTION linework — so the frame's HEAD BAR
                     * (`addBox(w, ft, fd)`, spanning the FULL opening width at ~2 m), the
                     * hinges, the threshold plate, the double-door centre mullion and every
                     * glazing pane drew their outlines STRAIGHT ACROSS THE DOOR VOID, on top
                     * of the clean symbol `DoorPlanSymbolBuilder` had just injected.
                     *
                     * That is the Contract 48 §5 convention, already applied to every furniture
                     * family (sofa/bed/chair/tree): AN ELEMENT WITH A PLAN SYMBOL DOES NOT ALSO
                     * EMIT ITS MESH EDGES IN PLAN. The projector honours `userData.skipInPlan`
                     * generically. The door had three ad-hoc role-based skips instead
                     * (doorLeaf / doorHandle / legacyDoorFrame) — a per-part allowlist that
                     * silently admits every part nobody thought of. This is the rule, not a
                     * fourth exception.
                     *
                     * The ONE escape hatch is the record's own `leafVisibleInPlan` flag: when
                     * the user asks for the real 3D leaf in plan, the leaf mesh keeps
                     * projecting (the projector's existing doorLeaf gate reads that same flag).
                     * Intent stays in the record; the builder does not decide it.
                     */
                    skipInPlan: !(isLeaf && (door.leafVisibleInPlan ?? false)),
                });
            }
        });

        this.scene.add(group);
        this.doorGroups.set(door.id, group);
        elementRegistry.registerRoot(door.id, group);

        // PLAN-06: Dispatch DOM event so SelectionManager can invalidate its raycaster cache.
        // F.events.18 — typed bus replaces variable CustomEvent
        if (isUpdate) _bus.emit('bim-door-updated', { id: door.id });
        else _bus.emit('bim-door-added', { id: door.id });
    }

    private positionGroup(door: DoorOpening, group: THREE.Group, wallData: any): void {
        // Construct explicit Vector3 so the code is safe whether baseLine entries are
        // THREE.Vector3 instances (freshly placed) or plain {x,y,z} objects (deserialized).
        // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): `door.offset` is the LEFT EDGE
        // of the opening span [offset, offset+width] along the wall CENTRELINE (the
        // convention used by every producer, the door tool, the occupancy store, and
        // C15 §2 voidStart=offset). The frame CENTRE = offset + width/2 — which is
        // exactly where WallFragmentBuilder now cuts the void and places the frame.
        //
        // §FEAT-HOSTED-ON-CURVED-WALL — the centreline is the ARC when the host is
        // curved, so both the position AND the heading come from the local arc frame:
        // the door is oriented to the TANGENT at its centre, never to the chord. For
        // a straight host this reduces exactly to
        // `baseLine[0] + (offset + width/2) × wallDir` with a constant heading.
        const _hf = hostedElementFrame(wallData, door.offset, door.width);
        const centre = new THREE.Vector3(_hf.x, 0, _hf.z);

        // §DOOR-AUDIT-2026 (DOOR-SPATIAL-FALLBACK) — never silently default to Y=0
        // when level membership is broken. Throw SpatialAuthorityError so the failure
        // is loud (caught by store notify wrapper, surfaces in console + telemetry)
        // rather than a ghost door at floor level.
        if (!wallData.levelId) {
            throw new SpatialAuthorityError(
                `[DoorBuilder] Door ${door.id} hosted on wall ${door.wallId} which has no levelId — refusing to place at Y=0.`,
            );
        }
        const level = this.wallStore.getLevelById(wallData.levelId);
        if (!level || (level as any).elevation == null) {
            throw new SpatialAuthorityError(
                `[DoorBuilder] Door ${door.id}: level "${wallData.levelId}" has no elevation — refusing to place at Y=0.`,
            );
        }
        const elevation = (level as any).elevation;
        // ── §WALL-Y-DATUM (L-968) — the leaf sits in the HOST WALL's hole ────────
        //
        // This was `elevation + sillHeight + height / 2`: it read neither
        // `slabBaseOffset` (0 occurrences in this package, by C84 §9's own count) nor
        // `wall.baseOffset`. The wall body's carve puts the void band at
        // `wallBaseY + sillHeight`, so a wall on a raised slab, or with a plinth,
        // moved its hole and left the leaf behind — one "set the base offset to
        // 150 mm" displaced every door on that wall by `slabBaseOffset + 2 ×
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
        const y = hostedLeafCentreY(wallBaseY, door.sillHeight, door.height);

        group.position.set(centre.x, y, centre.z);
        group.rotation.y = _hf.rotationY;

        // ── §RAKE-HOSTED-OPENING (founder 2026-08-18) ────────────────────────
        //
        // The window's fix, applied here for the same reason and by the same map.
        // The founder asked for WINDOWS, but the gate that refused them refused
        // doors identically and now admits both — so a door hosted on a raked wall
        // is reachable, and leaving it plumb would put a vertical leaf in a leaning
        // hole. The wall's carve is the shear `z ↦ z + cot(rake)·(y − yBase)` in the
        // wall's own frame; the leaf takes the same one and fills the void exactly.
        // Decision and its justification: `WallRake.ts` §RAKE-HOSTED-OPENING.
        //
        // Zero for a vertical host ⇒ everything below is skipped and the group keeps
        // ordinary TRS placement, byte-identical to before.
        const k = rakeShearPerMetre((wallData as { rakeAngleDeg?: number }).rakeAngleDeg);
        if (k === 0) return;

        // ── §FEAT-RAKE-CURVED (RK1, 2026-08-19) — THE CHORD WAS THE WRONG DIRECTION ──
        //
        // This read `const dir = { x: be.x - bs.x, z: be.z - bs.z }` — the wall's CHORD,
        // re-derived from `baseLine`. On a straight host the chord IS the tangent, so it
        // was correct and stayed correct for as long as a raked host could not be curved.
        // A curved host may now be raked (the conical sweep), and there the two differ:
        // the WALL's void at this station is displaced along the LOCAL station normal,
        // while the leaf was displaced along the chord's normal. The leaf drifted out of
        // its own hole by the angle between them, growing with the arc.
        //
        // ⚠ `hostedElementFrame`'s own header already forbade this, in these words:
        //   *"These are the ONLY arc maths in the hosted-symbol path. Nothing downstream
        //    may re-derive a direction from `baseLine`; a fourth copy of this rule is the
        //    mistake that produced the defect in the first place."*
        //   This was the FIFTH copy, sitting sixty lines below that warning in the same
        //   file. It is deleted rather than corrected in place.
        //
        // `_hf.frame` is the local station frame the leaf is ALREADY rotated by
        // (`group.rotation.y = _hf.rotationY`), so taking the direction from it is what
        // makes the displacement agree with the heading instead of contradicting it.
        // `rakeTopOffset` is unchanged and still the single authority: it takes a
        // DIRECTION and applies `leftPerp` internally, and `leftPerp(localTangent)` is
        // exactly the station normal `computeStations` gives the wall's own body. On a
        // straight wall the local tangent equals the chord, so this is byte-identical.
        const dir = { x: _hf.frame.tx, z: _hf.frame.tz };
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

        // A shear has no TRS decomposition, so the matrix is written directly and
        // `matrixAutoUpdate` disabled. three.js shades it correctly (normal matrix =
        // inverse-transpose of model-view) and picks it correctly (`Raycaster`
        // inverts `matrixWorld`). In the group's LOCAL frame — +X along the wall, +Z
        // on `leftPerp` after `rotationY` — the lean is exactly `z ↦ z + k·y`.
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
     * Returns all cloned materials so they can be disposed later.
     *
     * Local space: group centre = sillHeight + height/2 above floor.
     *   bottom = -h/2, top = +h/2, door width along X, depth along Z.
     *
     * @param wallFrameDepth - actual depth to use (wall.thickness + 0.02) so the
     *   frame fully covers the void opening and no raw cut edges are visible.
     * @param lod - §FEAT-DOOR-3D-LOD (L-266) the effective Detail Level for this door in
     *   the 3D view, from the SHARED resolver. THE 3D DOOR IS NOW A REAL LOD CONSUMER —
     *   ADR-121's matrix found door×3D and door×elevation discriminating detail level in
     *   ZERO cells ("built plan-first, never carried across"). The tiers, per ADR-121 §4.2:
     *
     *     coarse (100) — the silhouette: frame posts + head + a plain leaf slab. No
     *                    ironmongery, no reveals, no panelisation. This is the massing door.
     *     medium (200) — + hinges, handle, glazing rows / battens / sidelight: THE STANDARD
     *                    DOOR, i.e. exactly what shipped before this change (so no view can
     *                    regress today's model).
     *     fine   (300) — + the frame REBATE (planted stop), the leaf's RAIL-AND-STILE panel
     *                    reveal, and an ESCUTCHEON on BOTH faces behind the lever. The
     *                    founder's elevation reference, and every dimension of it derived
     *                    from `resolveDoorDimensions` + the system type (ADR-121 §4.4).
     *
     *   Elevation views project these meshes, so an elevation inherits this articulation
     *   directly — no second symbol engine, per ADR-121 §4.3.
     */
    private buildVisuals(
        door: DoorOpening,
        group: THREE.Group,
        wallFrameDepth?: number,
        vgStyle?: VGStyle,
        lod: DetailLevel = 'fine',
        /**
         * §FEAT-CURVED-DOOR-LEAF (L-957) — the HOST'S arc, in this group's local
         * frame, or `null` for a straight host (and for a refused combination).
         * `null` routes every member below through the ordinary `addBox`, which
         * is why a straight-walled door is byte-identical rather than merely
         * close. Never re-derived here: see `CurvedLeafGeometry`.
         */
        arc: LeafArc | null = null,
    ): THREE.Material[] {
        const mats: THREE.Material[] = [];
        // §FIX-DOOR-PREVIEW-EXACT (L-127) — width/height are the authoritative void
        // dims (they must match the wall cut, so read them from the record), but
        // frame + leaf thickness come from the SELECTED type via the shared resolver
        // so the placed frame equals the preview even when the opening-mirror bridge
        // did not persist the exact thickness onto the record.
        const dims = resolveDoorDimensions(door.systemTypeId, door.doorType);
        const w = door.width;
        const h = door.height;
        const ft = dims.frameThickness;
        // Use the wall-derived depth when provided so the frame spans the full void;
        // otherwise fall back to the type's frame depth (then the record's).
        const fd = wallFrameDepth ?? dims.frameDepth ?? door.frameDepth;

        // §DOOR-AUDIT-2026 / W5 — apply VG governance overrides on top of the
        // door's stored colours. Both override hooks are optional; when absent
        // the builder falls back to the door's own parameters.
        //
        // ⭐ C100 §2.1 / S17 — "the door's own parameters" is no longer
        // `door.frameColor` alone. The door's MATERIAL IDENTITY lives on
        // `frameFinish.materialId` / `leafFinish.materialId`, written by the panel's
        // Frame/Leaf Finish dropdowns straight out of the master library and
        // persisted with the record — and this builder read NEITHER. Picking
        // "Frame Finish → Oak" changed the record, survived save and reload, and
        // never moved a pixel. `resolveDoorFinishColour` is the ladder; see that
        // file for why an override is told apart from a stale cache by DISAGREEMENT
        // with the finish it was derived from, and not by a new flag.
        const frameColor = vgStyle?.colorOverride ?? this._finishColour(door, 'frame').hex;
        const leafColor  = vgStyle?.colorOverride ?? this._finishColour(door, 'leaf').hex;
        const opacityFactor = vgStyle?.opacityFactor ?? 1;
        const transparent = opacityFactor < 1;
        const opacity = Math.max(0, Math.min(1, opacityFactor));

        const frameMat = makeMat(frameColor, 0.5, 0, transparent, opacity);
        const leafMat  = makeMat(leafColor,  0.5, 0, transparent, opacity);
        mats.push(frameMat, leafMat);

        // §DOOR-GLAZING-2026 — resolve the door's system TYPE (when set + known)
        // so the builder can honour its `glazingOpacity`, `defaultSegments`
        // (glass vs panel rows) and optional `sidelight`. Absent / unknown type
        // → undefined → every existing opaque door behaves exactly as before.
        const sysType = door.systemTypeId
            ? doorSystemTypeStore.getById(door.systemTypeId)
            : undefined;
        // A type is "glazed" when it declares partial glazing OR carries explicit
        // glass segment rows. A VG opacity override forces solid (selection/ghost).
        // §FEAT-DOOR-3D-LOD (L-266) — the tier gates. COARSE is the massing door: a
        // silhouette. It draws no ironmongery and no internal articulation, so glazing
        // rows, battens and panelisation all collapse to the plain leaf slab.
        const isCoarse = lod === 'coarse';
        const isFine   = lod === 'fine';

        const glassSegments = (sysType?.defaultSegments ?? []).filter(s => s.type === 'glass');
        const typeIsGlazed = !isCoarse && !!sysType && opacityFactor >= 1 &&
            (sysType.glazingOpacity < 1 || glassSegments.length > 0);

        // §ENTRANCE-LEAF-VERTICAL (founder 2026-06-22) — the modern entrance type
        // (marked by its fixed glazed `sidelight`) now ships a SOLID full-height
        // timber leaf with NO glass: its glass lives only on the sidelight. Render
        // that leaf as VERTICAL timber battens (the photographed front-door look),
        // not the horizontal slats used for glazed-leaf panel rows. Only applies
        // when the type is NOT glazed (no leaf glass) and no VG override forces solid.
        const wantsVerticalSlatLeaf = !isCoarse && !!sysType && !typeIsGlazed && opacityFactor >= 1 &&
            !!sysType.sidelight && door.doorType !== 'double';

        // ── §OPENING-PROFILE-FRAME (L-1521) — THE FRAME FOLLOWS THE VOID ───
        //
        // ⭐ THE FOUNDER'S DEFECT IS DECIDED HERE. Until now the door frame was three
        // unconditional boxes — two posts and a head bar — so an ARCHED opening got a SQUARE head
        // across it, exactly as he reported for the window. `openingOutlineLocal` is the SAME
        // producer the wall cut the void with (C86 §10.1 PR-1), asked in this group's own centred
        // coordinates, so the frame cannot disagree with the reveal by a sampling step.
        //
        // ⛔ **A DOOR MAY NOT BE CIRCULAR — L-1251, AND THIS ARM RESPECTS IT RATHER THAN
        // RE-DECIDING IT.** `openingProfilesFor('door')` is the ONE declaration; a record holding
        // `circular` (chat, a batch generator, a hand-edited file) is read as RECTANGULAR here,
        // which is what the wall's own notch walk does with it too — a circle has no jamb feet to
        // notch between. The gate is consulted, never restated.
        //
        // ⛔ `arc` FORCES THE OLD PATH, and it is a REFUSAL, not an oversight: PR-5 states a curved
        // wall cannot carry a non-rectangular void at all. `null` from `openingOutline` — a round
        // arch shorter than its own head, a segmental arch shallower than its rise — does the same,
        // and is exactly the set `openingProfileShapeRefusal` names to the user. **This builder
        // therefore cannot draw a shape the refusal would have rejected: it never constructs a
        // shape, it only consumes the one the gate already vetted.**
        const _kind = resolveOpeningProfile(door.openingProfile);
        const _doorProfile = openingProfilesFor('door').includes(_kind) ? _kind : DEFAULT_OPENING_PROFILE;
        const outline: OpeningOutline | null = arc ? null : openingOutlineLocal(_doorProfile, w, h);
        const springY = outline && !outline.isRectangular
            ? openingSpringLineYLocal(_doorProfile, w, h)
            : null;
        const profiled = !!outline && !outline.isRectangular && springY !== null;

        // §FIX-DOOR-PREVIEW-EXACT — leaf thickness resolved from the selected type.
        const leafThickness = dims.leafThickness;
        const innerW = w - 2 * ft;

        // ⭐ **THE ONE DATUM EVERY MEMBER BELOW HANGS FROM: the UNDERSIDE OF THE HEAD.**
        //
        // ARCHITECTURAL DECISION — **the leaf stops at the SPRINGING; the arch above it is a
        // FANLIGHT.** That is what an arched doorway actually is: a rectangular leaf under a
        // straight transom, with a fixed light in the head. The two alternatives were weighed and
        // rejected — an ARCHED LEAF would mean discarding the entire rail/stile/panel/glazing/
        // ironmongery construction below (every part of it is a rectangular-cell derivation), and
        // an OPEN TYMPANUM is not a thing anyone fabricates on an external door.
        //
        // ⛔ AND THIS IS WHERE THE RECTANGULAR BYTE-IDENTITY LIVES. For a rectangle
        // `headUnderY === h/2 − ft`, so `innerH === h − ft` and `leafCY === −ft/2` — the two
        // literals this code used before, reproduced by the formula rather than replaced by it.
        // Everything downstream is arithmetic on these three, unchanged.
        const headUnderY = profiled ? springY! - ft : h / 2 - ft;
        const innerH = headUnderY + h / 2;   // floor/threshold → underside of the head member
        const leafCY = (headUnderY - h / 2) / 2;

        // ── Frame ──────────────────────────────────────────────────────────
        if (profiled) {
            // ⛔ **`omitBaseEdge` — A DOORWAY HAS NO CILL, AND THAT IS NOT A SPECIAL CASE, IT IS
            // WHAT A DOOR FRAME IS.** The window's band is a CLOSED ring because a window frame
            // has a cill; closing this one would lay a 50 mm bar across the threshold at floor
            // level for people to trip on. Opening the band along the outline's own base edge
            // gives the ∩-shaped member a joiner assembles from two posts and a curved head.
            const frameInner = insetOutlinePoints(outline!.points, ft);
            addProfiled(
                group, frameMat,
                frameInner
                    ? profiledBandGeometry(outline!.points, frameInner, fd, true)
                    // The member does not fit — `ft` is at least half the opening. The doorway is
                    // then SOLID FRAME, which is the truthful reading of the record; falling back
                    // to a rectangle inside an arched hole would put the C86 §11 #1 divergence
                    // straight back after removing it.
                    : profiledPlateGeometry(outline!.points, fd),
            );

            // The TRANSOM the leaf shuts under. HORIZONTAL and full clear width — at the springing
            // the inner outline is exactly `innerW` across, because both jambs were inset by the
            // same `ft` and the springing line is a property of the outline, not of the inset.
            addSweptBox(group, frameMat, arc, innerW, ft, fd, 0, springY! - ft / 2, 0);

            // The FANLIGHT — the head above the transom, glazed. Its shape is the frame's inner
            // outline CLIPPED to the half-plane above the springing, so it is bounded by the same
            // curve the reveal is and closed by the transom's own top edge.
            const fan = frameInner ? clipOutlinePointsAbove(frameInner, springY!) : null;
            if (fan) {
                const fanMat = makeGlassMat(sysType?.glazingOpacity ?? 0.3);
                mats.push(fanMat);
                addProfiled(group, fanMat, profiledPlateGeometry(fan, leafThickness * 0.5), 'doorGlazing');
            }
        } else {
            // §FEAT-CURVED-DOOR-LEAF — the founder's decomposition, member by member:
            // the POSTS are vertical rulings of a vertical-axis sweep, so they stay
            // straight and are only re-seated; the HEAD and the THRESHOLD traverse the
            // arc and must bend. Both span the FULL authored width `w`, so their radial
            // end caps land on arc lengths `offset` and `offset + width` — the exact
            // stations `CurvedWallOpeningBuilder` terminates the void's bands on. That
            // is the seam the founder would otherwise see, and it closes by
            // construction rather than by agreement.
            // Left post
            addSeatedBox(group, frameMat, arc, ft, h, fd, -(w / 2 - ft / 2), 0, 0);
            // Right post
            addSeatedBox(group, frameMat, arc, ft, h, fd,  (w / 2 - ft / 2), 0, 0);
            // Head bar (top)
            addSweptBox(group, frameMat, arc, w, ft, fd,  0, h / 2 - ft / 2, 0);
        }

        // ── Threshold ──────────────────────────────────────────────────────
        // Unchanged for every profile: the outline's BOTTOM EDGE is the same full-width straight
        // line for `rectangular`, `round-arch` and `segmental-arch` alike — the profiles differ
        // only in the head — so the threshold plate is the same correct plate.
        if (door.threshold && door.thresholdHeight > 0) {
            const th = door.thresholdHeight;
            addSweptBox(group, frameMat, arc, w, th, fd, 0, -h / 2 + th / 2, 0);
        }

        // ── Leaf / Hinges / Handle ─────────────────────────────────────────

        // ── FINE (LOD 300) — the frame REBATE (planted stop) ────────────────
        //
        // §FEAT-DOOR-3D-LOD (L-266). The founder's elevation reference shows *"a frame with
        // a visible rebate"* — the bead the leaf shuts against. Until now the 3D frame was
        // three plain boxes, so in 3D AND in every elevation the leaf met the frame with no
        // shadow line at all. The stop is a real member: it stands proud of the reveal by
        // `stopProj` and runs from the leaf's back face to the frame's back face, so the
        // leaf seats into a genuine rebate.
        //
        // NO LITERALS (ADR-121 §4.4): the projection is a fraction of the frame's own face
        // width, and the depth is what is LEFT of the frame depth once the leaf's real
        // thickness is taken out — both are the record's numbers, so a chunkier door type
        // yields a chunkier rebate.
        if (isFine) {
            const stopProj  = ft / 3;                                        // into the opening
            const stopDepth = Math.max(leafThickness / 2, fd / 2 - leafThickness / 2);
            const stopZ     = leafThickness / 2 + stopDepth / 2;             // behind the leaf
            // Jamb stops (both posts), running the full clear height — VERTICAL,
            // so re-seated onto the arc but not bent.
            addSeatedBox(group, frameMat, arc, stopProj, innerH, stopDepth, -innerW / 2 + stopProj / 2, leafCY, stopZ);
            addSeatedBox(group, frameMat, arc, stopProj, innerH, stopDepth,  innerW / 2 - stopProj / 2, leafCY, stopZ);
            // Head stop, spanning the clear width — HORIZONTAL, so it sweeps. The
            // leaf shuts against this bead, and the leaf now follows the arc, so a
            // chorded stop would leave a wedge-shaped gap at one jamb.
            // §OPENING-PROFILE-FRAME (L-1521) — `headUnderY − stopProj/2` IS the old
            // `innerH/2 − ft/2 − stopProj/2` for a rectangle; it now also lands correctly under an
            // arched door's TRANSOM instead of floating where a square head used to be.
            addSweptBox(group, frameMat, arc, innerW, stopProj, stopDepth, 0, headUnderY - stopProj / 2, stopZ);
        }

        // Leaf y-centre is `leafCY`, computed above with the head datum (for a RECTANGLE that is
        // ft/2 below group centre — the head bar takes ft at top and there is no bottom frame).
        const leafFront = leafThickness / 2;
        const hingeY = [
            -h / 2 + 0.25,
             0,
             h / 2 - 0.25,
        ];

        // §DOOR-GLAZING-2026 — fixed glazed SIDELIGHT (a property of the TYPE).
        // Splits the inner opening into [leaf | slim mullion | glazed sidelight].
        // Only the single-leaf path supports a sidelight; a double door keeps its
        // own meeting-mullion layout. Absent type / sidelight → no change.
        const sidelightSpec = (door.doorType !== 'double') ? sysType?.sidelight : undefined;
        const slMullionW = sidelightSpec ? 0.05 : 0;
        // widthRatio is a fraction of the LEAF width; bound the sidelight so it can
        // never starve the leaf below half the inner opening.
        const slWidth = sidelightSpec
            ? Math.min(innerW * 0.45, innerW * Math.max(0, sidelightSpec.widthRatio) / (1 + Math.max(0, sidelightSpec.widthRatio)))
            : 0;
        // Leaf occupies the remaining inner width, shifted to the LEFT of the
        // sidelight (sidelight sits on the RIGHT of the opening). Inner opening
        // spans X ∈ [-innerW/2, +innerW/2]; layout L→R is [leaf | mullion | sidelight].
        const singleLeafW = innerW - slWidth - slMullionW;
        const singleLeafX = sidelightSpec ? -innerW / 2 + singleLeafW / 2 : 0;
        const slMullionX  = -innerW / 2 + singleLeafW + slMullionW / 2;
        const slCenterX   = -innerW / 2 + singleLeafW + slMullionW + slWidth / 2;

        if (door.doorType === 'double') {
            // DW-11 FIX: double door — two half-width leaves meeting at center with a
            // structural center mullion and hinges on opposite outer sides.
            const centerMullionW = 0.05;
            const halfLeafW = (innerW - centerMullionW) / 2;

            // Left leaf (center at -halfLeafW/2 - centerMullionW/2)
            const leftLeafX = -(halfLeafW / 2 + centerMullionW / 2);
            addSweptBox(group, leafMat, arc, halfLeafW, innerH, leafThickness, leftLeafX, leafCY, 0, 'doorLeaf');

            // Right leaf (center at +halfLeafW/2 + centerMullionW/2)
            const rightLeafX = (halfLeafW / 2 + centerMullionW / 2);
            addSweptBox(group, leafMat, arc, halfLeafW, innerH, leafThickness, rightLeafX, leafCY, 0, 'doorLeaf');

            // Center mullion (structural, full height, spans full frame depth) —
            // VERTICAL, so it re-seats onto the arc and stays straight.
            addSeatedBox(group, frameMat, arc, centerMullionW, innerH, fd, 0, leafCY, 0);

            // Hinges: left leaf hinged on left outer post, right leaf on right outer post
            // §FEAT-DOOR-3D-LOD (L-266) — no ironmongery on the massing (coarse) door.
            const leftHingeX  = -(w / 2 - ft / 2);
            const rightHingeX =  (w / 2 - ft / 2);
            if (!isCoarse) {
                for (const hy of hingeY) {
                    addSeatedBox(group, _hingeMat, arc, 0.03, 0.12, fd + 0.008, leftHingeX,  hy, 0);
                    addSeatedBox(group, _hingeMat, arc, 0.03, 0.12, fd + 0.008, rightHingeX, hy, 0);
                }
            }

            // Handles: on the meeting edges of each leaf (action side, facing center)
            if (door.handle && !isCoarse) {
                const handleMat = makeMat('#b0b0b0', 0.15, 0.9);
                mats.push(handleMat);
                const localY = door.handleHeight - h / 2;

                // Left leaf handle on right (meeting) edge
                const leftHandleX = -(centerMullionW / 2 + 0.06);
                addSeatedBox(group, handleMat, arc, 0.04, 0.15, 0.01, leftHandleX, localY, leafFront + 0.005, 'doorHandle');
                addSeatedBox(group, handleMat, arc, 0.015, 0.10, 0.015, leftHandleX + 0.06, localY + 0.035, leafFront + 0.025, 'doorHandle');

                // Right leaf handle on left (meeting) edge
                const rightHandleX = (centerMullionW / 2 + 0.06);
                addSeatedBox(group, handleMat, arc, 0.04, 0.15, 0.01, rightHandleX, localY, leafFront + 0.005, 'doorHandle');
                addSeatedBox(group, handleMat, arc, 0.015, 0.10, 0.015, rightHandleX - 0.06, localY + 0.035, leafFront + 0.025, 'doorHandle');
            }
        } else {
            // Single door — one leaf (shifted off-centre when a sidelight is present).
            // §DOOR-GLAZING-2026 — when the resolved system type is glazed, build the
            // glass rows as a TRANSPARENT mesh (real see-through glazing) and the panel
            // rows as the opaque (slatted) timber leaf, instead of one opaque slab.
            if (typeIsGlazed) {
                const glassMat = makeGlassMat(sysType!.glazingOpacity);
                mats.push(glassMat);
                const rows = sysType!.defaultSegments ?? [];
                const totalRatio = rows.reduce((acc, r) => acc + r.heightRatio, 0) || 1;
                // Rows run TOP → BOTTOM (first segment = top of leaf, matching the
                // DoorSystemType convention used elsewhere).
                let cursorTop = innerH / 2;     // top edge in leaf-local Y (relative to leafCY)
                for (const row of rows) {
                    const rowH = innerH * (row.heightRatio / totalRatio);
                    const rowCY = leafCY + cursorTop - rowH / 2;
                    cursorTop -= rowH;
                    if (row.type === 'glass') {
                        // Optional column division: glass columns separated by slim
                        // timber glazing bars (mullions) for the slatted-modern read.
                        const cols = row.columnRatios && row.columnRatios.length > 0 ? row.columnRatios : [1];
                        const colTotal = cols.reduce((a, c) => a + c, 0) || 1;
                        const barW = cols.length > 1 ? 0.03 : 0;
                        const glassSpan = singleLeafW - barW * (cols.length - 1);
                        let cursorL = -singleLeafW / 2;
                        cols.forEach((c, i) => {
                            const colW = glassSpan * (c / colTotal);
                            const colCX = singleLeafX + cursorL + colW / 2;
                            // Glass pane — thinner than the leaf so the timber reads as a frame
                            // around it. THE GLAZED LIGHT FOLLOWS THE ARC: this is the founder's
                            // first clause, applied to a door's light exactly as to a window's.
                            addSweptBox(group, glassMat, arc, colW, rowH, leafThickness * 0.5, colCX, rowCY, 0, 'doorGlazing');
                            cursorL += colW;
                            if (i < cols.length - 1) {
                                const barCX = singleLeafX + cursorL + barW / 2;
                                // A glazing bar between two lights is a VERTICAL member — re-seated
                                // onto the arc, never bent, or it would stand proud of one pane and
                                // sink into the next.
                                addSeatedBox(group, leafMat, arc, barW, rowH, leafThickness, barCX, rowCY, 0, 'doorLeaf');
                                cursorL += barW;
                            }
                        });
                        // Slim timber surround framing this glazed row (top + bottom rails).
                        const railH = Math.min(0.06, rowH * 0.12);
                        addSweptBox(group, leafMat, arc, singleLeafW, railH, leafThickness, singleLeafX, rowCY + rowH / 2 - railH / 2, 0, 'doorLeaf');
                        addSweptBox(group, leafMat, arc, singleLeafW, railH, leafThickness, singleLeafX, rowCY - rowH / 2 + railH / 2, 0, 'doorLeaf');
                    } else {
                        // Opaque panel row — render as a stack of horizontal slats for the
                        // modern slatted-timber leaf reading (purely visual sub-division).
                        const slatCount = Math.max(1, Math.round(rowH / 0.18));
                        const gap = 0.008;
                        const slatH = (rowH - gap * (slatCount - 1)) / slatCount;
                        let sTop = rowCY + rowH / 2;
                        for (let s = 0; s < slatCount; s++) {
                            const sCY = sTop - slatH / 2;
                            addSweptBox(group, leafMat, arc, singleLeafW, slatH, leafThickness, singleLeafX, sCY, 0, 'doorLeaf');
                            sTop -= slatH + gap;
                        }
                    }
                }
            } else if (wantsVerticalSlatLeaf) {
                // §ENTRANCE-LEAF-VERTICAL — solid full-height timber leaf rendered as a
                // stack of VERTICAL battens (purely visual sub-division). NO glass mesh
                // is emitted for the leaf — only the sidelight (below) gets glazing.
                const battenCount = Math.max(1, Math.round(singleLeafW / 0.12));
                const gap = 0.006;
                const battenW = (singleLeafW - gap * (battenCount - 1)) / battenCount;
                let bLeft = singleLeafX - singleLeafW / 2;   // left edge of the leaf in local X
                for (let b = 0; b < battenCount; b++) {
                    const bCX = bLeft + battenW / 2;
                    // A VERTICAL batten is a straight ruling — re-seated along the arc, not
                    // bent. The leaf still reads as curved because each stave sits on the
                    // wall's own curve, which is how a curved timber door is really made.
                    addSeatedBox(group, leafMat, arc, battenW, innerH, leafThickness, bCX, leafCY, 0, 'doorLeaf');
                    bLeft += battenW + gap;
                }
            } else if (isFine) {
                // ── FINE (LOD 300) — RAIL-AND-STILE LEAF (the founder's elevation) ──
                //
                // §FEAT-DOOR-3D-LOD (L-266). His reference elevation shows *"a leaf with a
                // panel/rail reveal"*. The solid leaf was ONE BOX: in elevation it projected
                // as a bare rectangle at every detail level. It is now built the way a door
                // actually is — two stiles, a top rail, a bottom rail, and a RECESSED PANEL
                // between them, so the reveal reads as a shadow line in 3D and as a real
                // line in every elevation.
                //
                // WHERE THE PANELISATION COMES FROM: the system type's OWN `defaultSegments`
                // rows (the same field the glazed path already uses to divide the leaf) —
                // NOT a second field and NOT an invented count. A type with no segments gets
                // one panel. Stile/rail widths are multiples of the type's `frameThickness`
                // and the recess is a fraction of its real `leafThickness`, so every line
                // moves with the record (ADR-121 §4.4).
                const stileW      = 2 * ft;                    // side stiles
                const railH       = 2 * ft;                    // top rail
                const bottomRailH = 3 * ft;                    // bottom rail — always deeper
                const panelT      = leafThickness / 2;         // recessed → a reveal both faces
                const rows        = (sysType?.defaultSegments ?? []).filter(s => s.type !== 'glass');
                const rowCount    = Math.max(1, rows.length);
                const midRailH    = railH;

                const leafTop = leafCY + innerH / 2;
                const leafBot = leafCY - innerH / 2;
                const lx = singleLeafX;

                // Stiles — full height, both edges. STILES ARE VERTICAL: re-seated, straight.
                addSeatedBox(group, leafMat, arc, stileW, innerH, leafThickness, lx - singleLeafW / 2 + stileW / 2, leafCY, 0, 'doorLeaf');
                addSeatedBox(group, leafMat, arc, stileW, innerH, leafThickness, lx + singleLeafW / 2 - stileW / 2, leafCY, 0, 'doorLeaf');
                // Top + bottom rails — between the stiles. RAILS ARE HORIZONTAL: they sweep.
                // This is the founder's rule reaching the finest tier of the model: a
                // rail-and-stile door on a curved wall has bent rails and straight stiles,
                // which is exactly how one is actually made.
                const railW = singleLeafW - 2 * stileW;
                addSweptBox(group, leafMat, arc, railW, railH,       leafThickness, lx, leafTop - railH / 2,       0, 'doorLeaf');
                addSweptBox(group, leafMat, arc, railW, bottomRailH, leafThickness, lx, leafBot + bottomRailH / 2, 0, 'doorLeaf');

                // Panels + intermediate rails, one per type segment row.
                const panelZoneH = innerH - railH - bottomRailH - midRailH * (rowCount - 1);
                const totalRatio = rows.reduce((a, r) => a + r.heightRatio, 0) || 1;
                let cursorTop = leafTop - railH;
                for (let i = 0; i < rowCount; i++) {
                    const share  = rows.length > 0 ? (rows[i]!.heightRatio / totalRatio) : 1;
                    const panelH = panelZoneH * share;
                    addSweptBox(group, leafMat, arc, railW, panelH, panelT, lx, cursorTop - panelH / 2, 0, 'doorLeaf');
                    cursorTop -= panelH;
                    if (i < rowCount - 1) {
                        addSweptBox(group, leafMat, arc, railW, midRailH, leafThickness, lx, cursorTop - midRailH / 2, 0, 'doorLeaf');
                        cursorTop -= midRailH;
                    }
                }
            } else {
                // Coarse / medium — one opaque leaf slab (the pre-L-266 behaviour).
                // THE LEAF FOLLOWS THE ARC. It is modelled CLOSED — `DoorBuilder` has no
                // swing angle and no open state; the only rotation in this file is the
                // group's own heading on the wall — so a curved leaf here is a leaf seated
                // in a curved void, not a leaf mid-swing. See `CurvedLeafGeometry`'s header
                // for what a future 3D open state would have to do instead.
                addSweptBox(group, leafMat, arc, singleLeafW, innerH, leafThickness, singleLeafX, leafCY, 0, 'doorLeaf');
            }

            // §DOOR-GLAZING-2026 — fixed glazed sidelight + its slim mullion.
            if (sidelightSpec) {
                const slGlassMat = makeGlassMat(sidelightSpec.glazingOpacity);
                mats.push(slGlassMat);
                // Slim VERTICAL mullion between leaf and sidelight (full depth, structural)
                // — re-seated onto the arc, straight.
                addSeatedBox(group, frameMat, arc, slMullionW, innerH, fd, slMullionX, leafCY, 0);
                // Fixed glazed pane (thin, transparent) within a slim timber surround. The
                // sidelight is a glazed light, so it follows the arc with the leaf — the two
                // sit either side of one mullion and must read as one curved surface.
                addSweptBox(group, slGlassMat, arc, slWidth, innerH, leafThickness * 0.5, slCenterX, leafCY, 0, 'doorGlazing');
                const surround = 0.04;
                // Sidelight surround: top + bottom rails (sides are the mullion + frame post)
                // — HORIZONTAL, so they sweep.
                addSweptBox(group, frameMat, arc, slWidth, surround, fd, slCenterX, leafCY + innerH / 2 - surround / 2, 0);
                addSweptBox(group, frameMat, arc, slWidth, surround, fd, slCenterX, leafCY - innerH / 2 + surround / 2, 0);
            }

            // Hinges on the configured side (hinge against the leaf's outer post).
            // §FEAT-DOOR-3D-LOD (L-266) — ironmongery is not part of the massing door.
            const hingeX = door.hingesSide === 'left'
                ? singleLeafX - singleLeafW / 2 + 0.015
                : singleLeafX + singleLeafW / 2 - 0.015;
            if (!isCoarse) {
                for (const hy of hingeY) {
                    addSeatedBox(group, _hingeMat, arc, 0.03, 0.12, fd + 0.008, hingeX, hy, 0);
                }
            }

            // Handle
            if (door.handle && !isCoarse) {
                const handleMat = makeMat('#b0b0b0', 0.15, 0.9);
                mats.push(handleMat);

                // Convert handleHeight (distance from sill) to group-local Y
                const localY = door.handleHeight - h / 2;
                // Handle sits near the leaf edge OPPOSITE the hinge.
                const handleEdgeX = door.handleSide === 'right'
                    ?  (singleLeafX + singleLeafW / 2 - 0.06)
                    :  (singleLeafX - singleLeafW / 2 + 0.06);

                // §DOOR-GLAZING-2026 — the modern entrance type carries a LONG VERTICAL
                // BAR handle (a tall pull, the high-end front-door reading) rather than a
                // short lever. Detected via the sidelight marker (entrance-grade type).
                if (sysType?.sidelight) {
                    const barLen = Math.min(innerH * 0.55, 1.2);
                    // Vertical bar, standing proud of the leaf face on two stand-offs.
                    addSeatedBox(group, handleMat, arc, 0.03, barLen, 0.03, handleEdgeX, leafCY, leafFront + 0.05, 'doorHandle');
                    addSeatedBox(group, handleMat, arc, 0.02, 0.02, 0.05, handleEdgeX, leafCY + barLen / 2 - 0.04, leafFront + 0.025, 'doorHandle');
                    addSeatedBox(group, handleMat, arc, 0.02, 0.02, 0.05, handleEdgeX, leafCY - barLen / 2 + 0.04, leafFront + 0.025, 'doorHandle');
                } else {
                    // ── LEVER + ESCUTCHEON ──────────────────────────────────────
                    //
                    // §FEAT-DOOR-3D-LOD (L-266). The founder, red arrow on the handle:
                    // *"the LOD and quality of the handle — honestly not being enough."*
                    // It was a backplate and a stub, on ONE FACE — so from the other side
                    // (and in half of all elevations) the door had NO HANDLE AT ALL.
                    //
                    // Now: an ESCUTCHEON (rose) with the lever growing out of it, on BOTH
                    // faces, at LOD 300; a plain lever + backplate at LOD 200. Every
                    // dimension is a multiple of the type's REAL `leafThickness` (`lt`), so
                    // the ironmongery scales with the door instead of being a fixed glyph.
                    const lt = leafThickness;
                    const roseW = lt, roseH = 4 * lt, roseD = lt / 4;
                    const leverW = lt / 2, leverH = 2.5 * lt, leverD = lt / 2;
                    const leverReach = 1.5 * lt;      // how far the lever runs back along the leaf
                    const leverRise  = lt;            // lever sits just above the spindle
                    // The lever points back TOWARD the hinge — the handing comes from the
                    // record: a handle on the RIGHT edge has its hinge on the left, so the
                    // lever runs −X, and vice versa.
                    const leverDir = door.handleSide === 'right' ? -1 : +1;
                    for (const face of (isFine ? [+1, -1] : [+1])) {
                        const z0 = face * leafFront;
                        addSeatedBox(group, handleMat, arc, roseW, roseH, roseD,
                               handleEdgeX, localY, z0 + face * (roseD / 2), 'doorHandle');
                        addSeatedBox(group, handleMat, arc, leverW, leverH, leverD,
                               handleEdgeX + leverDir * leverReach, localY + leverRise,
                               z0 + face * (roseD + leverD / 2), 'doorHandle');
                    }
                }
            }
        }

        return mats;
    }

    /**
     * §C13-BUILDER-SCENE-CLEAR — detach EVERY door group from the scene, without
     * tearing the builder down (its `doorStore` subscription and shared material
     * caches must survive to serve the incoming project). C13 §3.8/§3.10.
     * Invoked by the `bim-project-cleared` sweep in `initBuilders.ts`.
     */
    clearProjectGeometry(): void {
        this._pendingBuilds.clear();
        for (const id of Array.from(this.doorGroups.keys())) this.dispose(id);
    }

    private dispose(id: string): void {
        const group = this.doorGroups.get(id);
        if (group) {
            group.traverse(obj => {
                if (obj instanceof THREE.Mesh) {
                    safeDisposeGeometry(obj.geometry); // §I2 — WebGPU-safe
                }
            });
            this.scene.remove(group);
            this.doorGroups.delete(id);
            elementRegistry.unregisterRoot(id);

            // PLAN-06: Dispatch removal event so SelectionManager can invalidate its cache.
            _bus.emit('bim-door-removed', { id }); // F.events.18
        }
        // Dispose cloned materials (not the _hingeMat singleton)
        const mats = this.doorMaterials.get(id);
        if (mats) {
            for (const m of mats) safeDisposeMaterial(m); // §I2 — WebGPU-safe
            this.doorMaterials.delete(id);
        }
    }
}
