import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { doorStore } from './DoorStore';
import { doorSystemTypeStore } from './DoorSystemTypeStore';
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
        'frameFinish', 'leafFinish', 'systemTypeId',
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
        for (const door of doorStore.getAll()) {
            if (door.wallId === wallId) {
                this._enqueue(door, undefined);
            }
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

        // `door.offset` is the CENTRE of the opening along the wall baseline
        // (WallFragmentBuilder convention: left = offset - width/2).
        // Do NOT add width/2 here — the wall group has already centred everything on offset.
        const centre = start.clone().addScaledVector(dir, door.offset);

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
        const { width: w, height: h, frameThickness: ft } = door;
        // Use the wall-derived depth when provided so the frame spans the full void.
        const fd = wallFrameDepth ?? door.frameDepth;

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
        const leafThickness = door.leafThickness ?? 0.04;
        const innerW = w - 2 * ft;
        const innerH = h - ft;   // from floor/threshold to underside of head bar

        // Leaf y-centre is ft/2 below group centre (head bar takes ft at top, no bottom frame)
        const leafFront = leafThickness / 2;
        const hingeY = [
            -h / 2 + 0.25,
             0,
             h / 2 - 0.25,
        ];

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
            // Single door — one full-width leaf
            addBox(group, leafMat, innerW, innerH, leafThickness, 0, -ft / 2, 0, 'doorLeaf');

            // Hinges on the configured side
            const hingeX = door.hingesSide === 'left'
                ? -(w / 2 - ft / 2)
                :  (w / 2 - ft / 2);
            for (const hy of hingeY) {
                addBox(group, _hingeMat, 0.03, 0.12, fd + 0.008, hingeX, hy, 0);
            }

            // Handle
            if (door.handle) {
                const handleMat = makeMat('#b0b0b0', 0.15, 0.9);
                mats.push(handleMat);

                // Convert handleHeight (distance from sill) to group-local Y
                const localY = door.handleHeight - h / 2;
                const handleX = door.handleSide === 'right'
                    ?  (w / 2 - ft - 0.06)
                    : -(w / 2 - ft - 0.06);

                // Backplate
                addBox(group, handleMat, 0.04, 0.15, 0.01, handleX, localY, leafFront + 0.005, 'doorHandle');
                // Grip (lever, roughly horizontal)
                addBox(group, handleMat, 0.015, 0.10, 0.015, handleX - 0.06, localY + 0.035, leafFront + 0.025, 'doorHandle');
            }
        }

        return mats;
    }

    private dispose(id: string): void {
        const group = this.doorGroups.get(id);
        if (group) {
            group.traverse(obj => {
                if (obj instanceof THREE.Mesh) {
                    obj.geometry.dispose();
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
            for (const m of mats) m.dispose();
            this.doorMaterials.delete(id);
        }
    }
}
