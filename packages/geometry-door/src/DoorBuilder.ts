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
import { WallStore } from '@pryzm/geometry-wall';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { SpatialAuthorityError } from '@pryzm/core-app-model';
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
        console.log('[DoorBuilder] activated');
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

    /** §WALL-DEEP-2026 B1 — patch live materials in place; no dispose+rebuild. */
    private _applyPropertyOnly(door: DoorOpening): void {
        const mats = this.doorMaterials.get(door.id);
        if (!mats || mats.length < 2) return;
        // mats[0] = frameMat, mats[1] = leafMat. (handleMat is appended after; left untouched.)
        const frameMat = mats[0] as THREE.MeshStandardMaterial | undefined;
        const leafMat  = mats[1] as THREE.MeshStandardMaterial | undefined;
        try {
            if (frameMat?.color) frameMat.color.set(door.frameColor);
            if (leafMat?.color)  leafMat.color.set(door.leafColor);
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
        const mats = this.buildVisuals(door, group, frameDepth, vgStyle);
        this.doorMaterials.set(door.id, mats);
        this.positionGroup(door, group, wallData);
        group.traverse(obj => {
            if (obj !== group && obj instanceof THREE.Mesh) {
                obj.userData = Object.freeze({
                    ...obj.userData,
                    elementType: obj.userData.role === 'doorLeaf' ? 'DoorLeaf' : 'Door',
                    parentId: door.id,
                    wallId: door.wallId,
                    levelId: wallData.levelId,
                    selectable: false,
                    leafVisibleInPlan: door.leafVisibleInPlan ?? false,
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
        const start = new THREE.Vector3(wallData.baseLine[0].x, wallData.baseLine[0].y ?? 0, wallData.baseLine[0].z);
        const end   = new THREE.Vector3(wallData.baseLine[1].x, wallData.baseLine[1].y ?? 0, wallData.baseLine[1].z);

        const dir = new THREE.Vector3().subVectors(end, start).normalize();
        const wallAngle = Math.atan2(dir.z, dir.x);

        // §OPENING-OFFSET-LEFTEDGE-UNIFY (2026-06-24): `door.offset` is the LEFT EDGE
        // of the opening span [offset, offset+width] along the wall baseline (the
        // convention used by every producer, the door tool, the occupancy store, and
        // C15 §2 voidStart=offset). The frame CENTRE = offset + width/2 — which is
        // exactly where WallFragmentBuilder now cuts the void and places the frame.
        const centre = start.clone().addScaledVector(dir, door.offset + door.width / 2);

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
        const y = elevation + door.sillHeight + door.height / 2;

        group.position.set(centre.x, y, centre.z);
        group.rotation.y = -wallAngle;
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
     */
    private buildVisuals(door: DoorOpening, group: THREE.Group, wallFrameDepth?: number, vgStyle?: VGStyle): THREE.Material[] {
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
        const frameColor = vgStyle?.colorOverride ?? door.frameColor;
        const leafColor  = vgStyle?.colorOverride ?? door.leafColor;
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
        const glassSegments = (sysType?.defaultSegments ?? []).filter(s => s.type === 'glass');
        const typeIsGlazed = !!sysType && opacityFactor >= 1 &&
            (sysType.glazingOpacity < 1 || glassSegments.length > 0);

        // §ENTRANCE-LEAF-VERTICAL (founder 2026-06-22) — the modern entrance type
        // (marked by its fixed glazed `sidelight`) now ships a SOLID full-height
        // timber leaf with NO glass: its glass lives only on the sidelight. Render
        // that leaf as VERTICAL timber battens (the photographed front-door look),
        // not the horizontal slats used for glazed-leaf panel rows. Only applies
        // when the type is NOT glazed (no leaf glass) and no VG override forces solid.
        const wantsVerticalSlatLeaf = !!sysType && !typeIsGlazed && opacityFactor >= 1 &&
            !!sysType.sidelight && door.doorType !== 'double';

        // ── Frame ──────────────────────────────────────────────────────────
        // Left post
        addBox(group, frameMat, ft, h, fd, -(w / 2 - ft / 2), 0, 0);
        // Right post
        addBox(group, frameMat, ft, h, fd,  (w / 2 - ft / 2), 0, 0);
        // Head bar (top)
        addBox(group, frameMat, w, ft, fd,  0, h / 2 - ft / 2, 0);

        // ── Threshold ──────────────────────────────────────────────────────
        if (door.threshold && door.thresholdHeight > 0) {
            const th = door.thresholdHeight;
            addBox(group, frameMat, w, th, fd, 0, -h / 2 + th / 2, 0);
        }

        // ── Leaf / Hinges / Handle ─────────────────────────────────────────
        // §FIX-DOOR-PREVIEW-EXACT — leaf thickness resolved from the selected type.
        const leafThickness = dims.leafThickness;
        const innerW = w - 2 * ft;
        const innerH = h - ft;   // from floor/threshold to underside of head bar

        // Leaf y-centre is ft/2 below group centre (head bar takes ft at top, no bottom frame)
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
            addBox(group, leafMat, halfLeafW, innerH, leafThickness, leftLeafX, -ft / 2, 0, 'doorLeaf');

            // Right leaf (center at +halfLeafW/2 + centerMullionW/2)
            const rightLeafX = (halfLeafW / 2 + centerMullionW / 2);
            addBox(group, leafMat, halfLeafW, innerH, leafThickness, rightLeafX, -ft / 2, 0, 'doorLeaf');

            // Center mullion (structural, full height, spans full frame depth)
            addBox(group, frameMat, centerMullionW, innerH, fd, 0, -ft / 2, 0);

            // Hinges: left leaf hinged on left outer post, right leaf on right outer post
            const leftHingeX  = -(w / 2 - ft / 2);
            const rightHingeX =  (w / 2 - ft / 2);
            for (const hy of hingeY) {
                addBox(group, _hingeMat, 0.03, 0.12, fd + 0.008, leftHingeX,  hy, 0);
                addBox(group, _hingeMat, 0.03, 0.12, fd + 0.008, rightHingeX, hy, 0);
            }

            // Handles: on the meeting edges of each leaf (action side, facing center)
            if (door.handle) {
                const handleMat = makeMat('#b0b0b0', 0.15, 0.9);
                mats.push(handleMat);
                const localY = door.handleHeight - h / 2;

                // Left leaf handle on right (meeting) edge
                const leftHandleX = -(centerMullionW / 2 + 0.06);
                addBox(group, handleMat, 0.04, 0.15, 0.01, leftHandleX, localY, leafFront + 0.005, 'doorHandle');
                addBox(group, handleMat, 0.015, 0.10, 0.015, leftHandleX + 0.06, localY + 0.035, leafFront + 0.025, 'doorHandle');

                // Right leaf handle on left (meeting) edge
                const rightHandleX = (centerMullionW / 2 + 0.06);
                addBox(group, handleMat, 0.04, 0.15, 0.01, rightHandleX, localY, leafFront + 0.005, 'doorHandle');
                addBox(group, handleMat, 0.015, 0.10, 0.015, rightHandleX - 0.06, localY + 0.035, leafFront + 0.025, 'doorHandle');
            }
        } else {
            // Single door — one leaf (shifted off-centre when a sidelight is present).
            // §DOOR-GLAZING-2026 — when the resolved system type is glazed, build the
            // glass rows as a TRANSPARENT mesh (real see-through glazing) and the panel
            // rows as the opaque (slatted) timber leaf, instead of one opaque slab.
            const leafCY = -ft / 2;     // leaf vertical centre (head bar at top)
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
                            // Glass pane — thinner than the leaf so the timber reads as a frame around it.
                            addBox(group, glassMat, colW, rowH, leafThickness * 0.5, colCX, rowCY, 0, 'doorGlazing');
                            cursorL += colW;
                            if (i < cols.length - 1) {
                                const barCX = singleLeafX + cursorL + barW / 2;
                                addBox(group, leafMat, barW, rowH, leafThickness, barCX, rowCY, 0, 'doorLeaf');
                                cursorL += barW;
                            }
                        });
                        // Slim timber surround framing this glazed row (top + bottom rails).
                        const railH = Math.min(0.06, rowH * 0.12);
                        addBox(group, leafMat, singleLeafW, railH, leafThickness, singleLeafX, rowCY + rowH / 2 - railH / 2, 0, 'doorLeaf');
                        addBox(group, leafMat, singleLeafW, railH, leafThickness, singleLeafX, rowCY - rowH / 2 + railH / 2, 0, 'doorLeaf');
                    } else {
                        // Opaque panel row — render as a stack of horizontal slats for the
                        // modern slatted-timber leaf reading (purely visual sub-division).
                        const slatCount = Math.max(1, Math.round(rowH / 0.18));
                        const gap = 0.008;
                        const slatH = (rowH - gap * (slatCount - 1)) / slatCount;
                        let sTop = rowCY + rowH / 2;
                        for (let s = 0; s < slatCount; s++) {
                            const sCY = sTop - slatH / 2;
                            addBox(group, leafMat, singleLeafW, slatH, leafThickness, singleLeafX, sCY, 0, 'doorLeaf');
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
                    addBox(group, leafMat, battenW, innerH, leafThickness, bCX, leafCY, 0, 'doorLeaf');
                    bLeft += battenW + gap;
                }
            } else {
                // Non-glazed type (or VG override) — one opaque leaf, original behaviour.
                addBox(group, leafMat, singleLeafW, innerH, leafThickness, singleLeafX, leafCY, 0, 'doorLeaf');
            }

            // §DOOR-GLAZING-2026 — fixed glazed sidelight + its slim mullion.
            if (sidelightSpec) {
                const slGlassMat = makeGlassMat(sidelightSpec.glazingOpacity);
                mats.push(slGlassMat);
                // Slim vertical mullion between leaf and sidelight (full depth, structural).
                addBox(group, frameMat, slMullionW, innerH, fd, slMullionX, leafCY, 0);
                // Fixed glazed pane (thin, transparent) within a slim timber surround.
                addBox(group, slGlassMat, slWidth, innerH, leafThickness * 0.5, slCenterX, leafCY, 0, 'doorGlazing');
                const surround = 0.04;
                // Sidelight surround: top + bottom rails (sides are the mullion + frame post).
                addBox(group, frameMat, slWidth, surround, fd, slCenterX, leafCY + innerH / 2 - surround / 2, 0);
                addBox(group, frameMat, slWidth, surround, fd, slCenterX, leafCY - innerH / 2 + surround / 2, 0);
            }

            // Hinges on the configured side (hinge against the leaf's outer post).
            const hingeX = door.hingesSide === 'left'
                ? singleLeafX - singleLeafW / 2 + 0.015
                : singleLeafX + singleLeafW / 2 - 0.015;
            for (const hy of hingeY) {
                addBox(group, _hingeMat, 0.03, 0.12, fd + 0.008, hingeX, hy, 0);
            }

            // Handle
            if (door.handle) {
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
                    addBox(group, handleMat, 0.03, barLen, 0.03, handleEdgeX, leafCY, leafFront + 0.05, 'doorHandle');
                    addBox(group, handleMat, 0.02, 0.02, 0.05, handleEdgeX, leafCY + barLen / 2 - 0.04, leafFront + 0.025, 'doorHandle');
                    addBox(group, handleMat, 0.02, 0.02, 0.05, handleEdgeX, leafCY - barLen / 2 + 0.04, leafFront + 0.025, 'doorHandle');
                } else {
                    // Backplate
                    addBox(group, handleMat, 0.04, 0.15, 0.01, handleEdgeX, localY, leafFront + 0.005, 'doorHandle');
                    // Grip (lever, roughly horizontal)
                    addBox(group, handleMat, 0.015, 0.10, 0.015, handleEdgeX - 0.06, localY + 0.035, leafFront + 0.025, 'doorHandle');
                }
            }
        }

        return mats;
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
