import * as THREE from '@pryzm/renderer-three/three';
// §FIX-FURNITURE-USEDTIMES (Defect B) — route material/geometry disposal through
// the WebGPU-safe helpers so a `usedTimes` device-loss TypeError (thrown by the
// WebGPU NodeManager when disposing a material/geometry whose node state was torn
// down by the WebGPU→WebGL2 live backend swap / device-loss) can never abort
// updateFurniture() before the new mesh is built. That abort is exactly why the
// office project's sofa_2seat items failed to render ("bim-furniture-added failed
// ... reading 'usedTimes'"). Mirrors DoorBuilder / WallFragmentBuilder (§I2).
// §GPU-RESOURCE-LIFETIME (ADR-0281) — element mutations DETACH on their own tick
// and RELEASE at the next frame boundary; cache-owned resources are never released
// by an element teardown. See packages/renderer-three/src/safeDispose.ts.
import { detachAndReleaseChildren, scheduleGpuRelease } from '@pryzm/renderer-three';
import { FurnitureData } from './FurnitureTypes';
import { MaterialService } from './MaterialService';
import { FurnitureFactory } from './builders/FurnitureFactory';
import { WardrobeEngine } from './engines/WardrobeEngine';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { furnitureWorldY } from './furnitureElevation';
import {
    furnitureCastsShadowUnderBudget,
} from './furnitureShadowBudget';

/**
 * §PERF-WEBGPU-FURNITURE-INSTANCING (2026-06-26) — structural handle for the
 * GPU-instancing bridge injected by initBuilders. Typed structurally (not via a
 * direct value import of FurnitureInstanceBridge) so geometry-furniture takes no
 * new value dependency and avoids any import cycle — exactly how the wall
 * fragment builder receives WallInstanceBridge. The concrete bridge lives in
 * @pryzm/core-app-model/rendering.
 */
export interface FurnitureInstanceBridgeLike {
    /** Enable check — `globalThis.__pryzmFurnitureInstancingV1 === true`. */
    register(
        elementId: string,
        levelId: string,
        group: THREE.Object3D,
        worldMatrix: THREE.Matrix4,
    ): boolean;
    updateTransform(elementId: string, worldMatrix: THREE.Matrix4): void;
    unregister(elementId: string): void;
    isInstanced(elementId: string): boolean;
}

export class FurnitureFragmentBuilder {
    private scene: THREE.Scene;
    public furnitureRoots = new Map<string, THREE.Group>();

    private materialService = new MaterialService();
    private wardrobeEngine = new WardrobeEngine();

    /**
     * §PERF-WEBGPU-FURNITURE-INSTANCING — optional GPU-instancing bridge + flag
     * gate. Injected by initBuilders via setInstanceBridge(); the gate is a
     * function so the flag can be toggled at runtime without re-wiring. When the
     * bridge is absent or the flag is off, EVERY furniture item stays on the
     * fragment path (today's exact behaviour).
     */
    private _instanceBridge: FurnitureInstanceBridgeLike | null = null;
    private _instancingEnabled: () => boolean = () => false;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
    }

    /**
     * Inject the furniture GPU-instancing bridge + its flag gate. Mirrors
     * WallFragmentBuilder.setInstanceBridge(). Safe to call once at bootstrap.
     */
    setInstanceBridge(bridge: FurnitureInstanceBridgeLike, isEnabled: () => boolean): void {
        this._instanceBridge = bridge;
        this._instancingEnabled = isEnabled;
    }

    updateFurniture(data: FurnitureData): void {
        let root = this.furnitureRoots.get(data.id);
        const isNewRoot = !root;

        // §57 Day 5 (DAILY-USE 2026-05-21, Round 33) — capture prior version
        // to bump on every update. FurnitureFragmentBuilder uses a REUSABLE
        // root (keeps the same THREE.Group across updates and rebuilds only
        // children) — so we stamp version BOTH on fresh-root creation AND on
        // every subsequent update. Mirrors the established invariant that
        // the NMEexporter's proxy cache invalidates after every rebuild.
        const _priorVersion: number =
            (root?.userData?.version as number | undefined) ?? 0;

        // §FIX-FURNITURE-BASE-OFFSET (L-86) — mount offset defaults to 0
        // (floor-standing). worldY = floorY(position.y, already the FFL from
        // CreateFurnitureCommand) + baseOffset, so a 0 offset seats the item exactly
        // on the finished floor. Was 0.2, which floated every offset-less item 200 mm.
        const baseOffset = data.baseOffset ?? 0;

        if (isNewRoot) {
            root = new THREE.Group();

            root.userData = {
                id: data.id,
                elementType: 'Furniture',
                modelId: 'model-default',
                selectable: true,
                furnitureType: data.furnitureType,
                furnitureCategory: data.furnitureCategory,
                levelId: data.levelId,
                levelName: data.levelName,
                levelElevation: data.levelElevation,
                baseOffset: baseOffset, // §FIX-FURNITURE-BASE-OFFSET — default 0
                width: data.width,
                length: data.length,
                height: data.height,
                lo3: data.lo3 || 200,
                // §57 Day 5 — monotonic per-update counter for cache invalidation.
                version: _priorVersion + 1,
            };

            // Lock identity like Curtain Wall
            Object.defineProperty(root.userData, 'id', { writable: false });
            Object.defineProperty(root.userData, 'elementType', { writable: false });

            this.scene.add(root);
            this.furnitureRoots.set(data.id, root);
        } else {
            // Update LO3 if it changed (optional dynamic LO level support)
            if (root && data.lo3 !== undefined && root.userData && root.userData.lo3 !== data.lo3) {
                root.userData.lo3 = data.lo3;
            }

            // Update baseOffset in userData if it changed
            if (root && root.userData) {
                root.userData.baseOffset = baseOffset;
                root.userData.furnitureType = data.furnitureType;
                root.userData.furnitureCategory = data.furnitureCategory;
                root.userData.width = data.width;
                root.userData.length = data.length;
                root.userData.height = data.height;
                // §57 Day 5 — bump version on every reused-root update so the
                // NMEexporter cache invalidates after each architect edit.
                root.userData.version = _priorVersion + 1;
            }
        }
        if (root) elementRegistry.registerRoot(data.id, root);

        // For glb_import: the model is already in the scene (placed by addFurniture).
        // Just synchronise position/rotation from the store record and skip mesh rebuild.
        if (data.furnitureType === 'glb_import') {
            if (root) {
                if (data.position) {
                    // A.21.D15 — mount applied ONCE here (floor + offset).
                    root.position.set(
                        data.position.x,
                        furnitureWorldY(data.position.y, baseOffset),
                        data.position.z,
                    );
                }
                if (data.rotation) {
                    root.quaternion.setFromEuler(new THREE.Euler(data.rotation.x, data.rotation.y, data.rotation.z, (data.rotation.order || 'XYZ') as THREE.EulerOrder));
                }
                root.visible = true;
            }
            return;
        }

        // ── §GPU-RESOURCE-LIFETIME (ADR-0281) — DETACH NOW, RELEASE AT THE FRAME
        // BOUNDARY. This is the founder's CHANGE_FURNITURE_TYPE hard stop.
        //
        // WAS: traverse the LIVE, still-parented subtree calling geometry.dispose()
        // / material.dispose() on every child, and only THEN root.clear(). Two
        // faults in three lines:
        //
        //   1. ORDERING (invariant L2). The GPU buffers were destroyed while the
        //      meshes were still descendants of `scene`. `BufferGeometry.dispose()`
        //      synchronously deletes the WebGPU backend's per-attribute record
        //      (three Geometries.js:185-216 → Attributes.delete → destroyAttribute),
        //      so any frame already encoded — or encoded before the rebuild lands —
        //      reaches `WebGPUBackend.draw`'s `this.get(index).buffer` and finds
        //      `undefined`:
        //        "setIndexBuffer … parameter 1 is not of type 'GPUBuffer'"
        //      Fatal, and NOT repairable by a pipeline retry. This whole method runs
        //      on a `bim-furniture-updated` DOM listener, which has no relationship
        //      whatsoever to the frame boundary — so the window is always open.
        //
        //   2. OWNERSHIP (invariant L1). `isCachedMaterial()` only knows
        //      MaterialService's OWN cache. geometry-furniture has SIX other
        //      module-level material/texture caches (KitchenCabinetEngine._matCache,
        //      WardrobeCabinetEngine._matCache, ParametricTreeEngine._matCache,
        //      foliageCards._cardMatCache/_shellMatCache/_texCache,
        //      AIElementEngine.materialCache) whose materials are shared across MANY
        //      live elements. Every one of them failed the test and was DISPOSED —
        //      killing sibling elements' materials and leaving the cache handing out
        //      dead handles. Ownership is now stamped on the resource itself
        //      (markSharedGpuResource), so the disposer cannot get it wrong.
        //
        // NOW: detach the children immediately (the scene can no longer reach them)
        // and hand the subtree to the frame-boundary release queue, which the frame
        // owner (RenderPipelineManager.render) drains before it encodes anything.
        // Cache-owned resources are skipped by the seam itself.
        detachAndReleaseChildren(root);

        let mesh: THREE.Group;

        // §FURN-3D-RESILIENCE (2026-05-23) — the root Group is already added to the
        // scene above (isNewRoot branch). If the type-specific engine/builder THROWS,
        // an unhandled exception would leave that root EMPTY while the plan-symbol
        // builder still draws the 2D footprint — i.e. "creates in plan but not in 3D"
        // (the architect's kitchen report). Wrap the build so a failing engine (a) is
        // logged with the offending furnitureType + id (so the cause is visible in the
        // console, not silent), and (b) degrades to an empty group rather than aborting
        // the whole furniture rebuild. The underlying engine bug is then diagnosable
        // from the logged error instead of a blank 3D scene.
        try {
            // Use WardrobeEngine for wardrobes with config
            if ((data.furnitureType === 'wardrobe' || data.furnitureType === 'wardrobe_glass_door' || data.furnitureType === 'corner_wardrobe') && data.wardrobeConfig) {
                // Ensure config has ID for consistency — clone first as data is frozen
                const config = { ...data.wardrobeConfig } as any;
                if (!config.id) config.id = data.id;

                // Pass points for corner logic if available
                if (data.furnitureType === 'corner_wardrobe') {
                    config.startPoint = data.startPoint;
                    config.cornerPoint = data.cornerPoint;
                    config.endPoint = data.endPoint;
                }

                // §09 F-08: do not dump full config object to console.
                mesh = this.wardrobeEngine.create(config, data.color);
            } else {
                const builder = FurnitureFactory.getBuilder(data.furnitureType, this);
                mesh = builder.build(data);
            }
        } catch (err) {
            console.error(
                `[FurnitureFragmentBuilder] §FURN-3D-RESILIENCE build FAILED for ` +
                `furnitureType="${data.furnitureType}" id=${data.id} category="${data.furnitureCategory ?? '∅'}" — ` +
                `3D mesh will be EMPTY (this is why such furniture appears in plan but not 3D). ` +
                `hasKitchenConfig=${Boolean((data as { kitchenConfig?: unknown }).kitchenConfig)} ` +
                `hasWardrobeConfig=${Boolean(data.wardrobeConfig)}:`,
                err,
            );
            mesh = new THREE.Group();
        }

        if (root) {
            // Mark internal meshes as sub-elements (like Curtain Wall)
            mesh.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    const isKitchenPart = Boolean(child.userData?.isKitchenPart || child.userData?.isKitchenCountertop);
                    const existingElementType = child.userData?.elementType;
                    child.userData = {
                        ...child.userData,
                        elementType: existingElementType ?? (isKitchenPart ? 'KitchenCabinetPart' : 'FurniturePart'),
                        modelId: 'model-default',
                        parentId: data.id,
                        isSubElement: true,
                        role: child.userData?.role ?? 'geometry',
                        furnitureType: data.furnitureType,
                        furnitureCategory: data.furnitureCategory,
                    };

                    // ADR-0076 Axis 2 (§PERF-WEBGPU-FRAGMENT) — decorative furniture
                    // (plants, lamps, rugs, wall decor, curtains) stops casting shadows
                    // at the `performance`+ render tier to cut shadow-caster count.
                    // The default budget is 'full' → this stays `true` (today's exact
                    // behaviour) until the render-tier wiring lowers the budget.
                    // receiveShadow is unchanged so surfaces still take shadows on them.
                    child.castShadow = furnitureCastsShadowUnderBudget(data.furnitureType);
                    child.receiveShadow = true;
                }
            });

            // A.21.D15 — the ONE place the mount offset is applied:
            // worldY = floor (data.position.y) + baseOffset (mount height).
            // Builders draw geometry FLOOR-RELATIVE (group origin = floor) and
            // must NOT re-add baseOffset internally, or wall-mounted items float.
            // NOTE: position/rotation are written on `root` BEFORE the instancing
            // attempt so the bridge can read root.matrixWorld for the per-instance
            // transform — and so the fragment fallback path is unchanged.
            if (data.position) {
                root.position.set(
                    data.position.x,
                    furnitureWorldY(data.position.y, baseOffset),
                    data.position.z
                );
            }

            // Apply rotation with zero-length protection
            // NOTE: When startPoint and endPoint exist, rotation is derived from direction vector.
            // If direction is zero-length, previous rotation is preserved and data.rotation is ignored.
            // This makes start/end the primary source of rotation when available (wall-mode behavior).
            if (data.startPoint && data.endPoint && data.furnitureType !== 'corner_wardrobe') {
                const start = new THREE.Vector3(data.startPoint.x, 0, data.startPoint.z);
                const end = new THREE.Vector3(data.endPoint.x, 0, data.endPoint.z);
                const direction = new THREE.Vector3().subVectors(end, start);

                // Zero-length protection - if direction is zero, keep existing rotation (defaults to 0 on first creation)
                if (direction.lengthSq() > 0.000001) {
                    const angle = Math.atan2(direction.z, direction.x);
                    root.rotation.y = -angle;
                }
                // If direction is zero, keep existing rotation (acceptable behavior)
            } else if (data.rotation) {
                // Use provided rotation only when start/end points are not available or it's a corner_wardrobe
                root.quaternion.setFromEuler(new THREE.Euler(data.rotation.x, data.rotation.y, data.rotation.z, (data.rotation.order || 'XYZ') as THREE.EulerOrder));
            }

            // ── §PERF-WEBGPU-FURNITURE-INSTANCING (2026-06-26) ────────────────
            // Try the GPU-instancing path BEFORE adding the per-item group to the
            // scene. When the flag is on and the built group bakes to a single
            // (geometry, material) leaf, the bridge registers it into the shared
            // InstancedElementRenderer (one InstancedMesh draw call for all
            // identical items) and the empty `root` carries no geometry → no
            // duplicate draw. Per-element pick + per-level isolate are preserved
            // by the renderer (the furniture id is the per-instance pick id). On
            // ANY miss (flag off, ineligible, error) we fall straight back to the
            // fragment path — identical to today.
            let instanced = false;
            if (this._instanceBridge && this._instancingEnabled()) {
                try {
                    root.updateMatrixWorld(true);
                    const worldMatrix = new THREE.Matrix4().copy(root.matrixWorld);
                    instanced = this._instanceBridge.register(
                        data.id,
                        data.levelId,
                        mesh,
                        worldMatrix,
                    );
                } catch (instErr) {
                    instanced = false;
                    console.warn(
                        `[FurnitureFragmentBuilder] §PERF-WEBGPU-FURNITURE-INSTANCING ` +
                        `instance register failed for id=${data.id} type="${data.furnitureType}" — ` +
                        `falling back to fragment path:`,
                        instErr,
                    );
                }
            }

            if (instanced) {
                // Item is rendered by the InstancedElementRenderer; release the
                // now-unused per-item GEOMETRY and keep `root` empty + invisible so
                // it never double-draws and never costs a draw call.
                //
                // §GPU-RESOURCE-LIFETIME (ADR-0281) — release is DEFERRED to the
                // frame boundary (invariant L2), and MATERIALS ARE NOT RELEASED AT
                // ALL (invariant L1): `_instanceBridge.register()` just handed these
                // exact material objects to InstancedElementRenderer, which runs them
                // through SharedMaterialCache.dedupInstanceMaterial — one of them may
                // now be the CANONICAL material for an entire InstanceGroup covering
                // many other elements. Disposing it here destroyed a material the
                // instanced draw call still binds. The geometry is safe to release:
                // the renderer merged its own copy at register() time.
                mesh.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        scheduleGpuRelease(child.geometry);
                    }
                });
                root.visible = false;
            } else {
                // Fragment fallback (or flag off): render the per-item group, and
                // release any stale instance the bridge may still hold for this id.
                if (this._instanceBridge?.isInstanced(data.id)) {
                    this._instanceBridge.unregister(data.id);
                }
                root.add(mesh);
                root.visible = true;
            }
        }
    }

    public getMaterialService(): MaterialService {
        return this.materialService;
    }

    removeFurniture(id: string): void {
        // §PERF-WEBGPU-FURNITURE-INSTANCING — release the GPU instance first (the
        // root may be empty/invisible when the item was instanced, so the mesh
        // disposal below is a no-op for it; the instance slot still must be freed).
        if (this._instanceBridge?.isInstanced(id)) {
            this._instanceBridge.unregister(id);
        }
        const root = this.furnitureRoots.get(id);
        if (root) {
            // §GPU-RESOURCE-LIFETIME (ADR-0281) — same DETACH-then-RELEASE order as
            // updateFurniture(). Deletion had the identical inverted ordering: it
            // disposed every child's GPU buffers and only afterwards removed the root
            // from the scene, so a frame encoded in between drew destroyed buffers.
            // Detach the root from the scene FIRST, then queue the whole subtree for
            // release at the next frame boundary.
            this.scene.remove(root);
            this.furnitureRoots.delete(id);
            elementRegistry.unregisterRoot(id);
            scheduleGpuRelease(root);
        }
    }

    // Clean up material cache when no longer needed
    dispose(): void {
        this.materialService.dispose();
    }
}