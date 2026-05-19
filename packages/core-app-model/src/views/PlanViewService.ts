import * as THREE from '@pryzm/renderer-three/three';
import * as OBC from '@thatopen/components';
import { SceneBoundsCache } from '../scene/SceneBoundsCache';
import { SceneObjectClassifier } from '../scene/SceneObjectClassifier';

export type OrthographicViewDirection = 'top' | 'bottom' | 'front' | 'back' | 'left' | 'right';

export interface OrthographicViewConfig {
    direction: THREE.Vector3;
    up: THREE.Vector3;
    center: THREE.Vector3;
    size: THREE.Vector3;
}

export interface EmptySceneConfig {
    defaultExtent: number;
    defaultHeight: number;
    gridVisible: boolean;
}

const DEFAULT_EMPTY_SCENE_CONFIG: EmptySceneConfig = {
    defaultExtent: 50,
    defaultHeight: 50,
    gridVisible: true
};

const MINIMUM_VIEW_EXTENT = 10;
const DEFAULT_CAMERA_PADDING = 1.2;

export class PlanViewService {
    private _components: OBC.Components;
    private _world: OBC.World;
    private _grid: any;
    private _emptySceneConfig: EmptySceneConfig;
    /**
     * Phase 1 Performance: injected by ViewController.setBoundsCache().
     * When set, getFragmentBounds() returns the cached box without any
     * scene traversal. Falls back to the direct traversal path when null.
     */
    private _boundsCache: SceneBoundsCache | null = null;

    constructor(
        components: OBC.Components,
        world: OBC.World,
        grid: any,
        emptySceneConfig: EmptySceneConfig = DEFAULT_EMPTY_SCENE_CONFIG
    ) {
        this._components = components;
        this._world = world;
        this._grid = grid;
        this._emptySceneConfig = emptySceneConfig;
    }

    /**
     * Phase 1 Performance: inject the shared SceneBoundsCache so
     * getFragmentBounds() can return cached results rather than traversing.
     * Called automatically by ViewController.setBoundsCache().
     */
    setBoundsCache(cache: SceneBoundsCache): void {
        this._boundsCache = cache;
    }

    /**
     * Returns the scene bounding box for camera framing.
     *
     * Phase 1 Performance: when _boundsCache is available (injected by
     * ViewController.setBoundsCache()), returns the cached box directly — O(1),
     * no scene traversal. The cache already excludes helpers, previews, level
     * planes, and BimGrid elements.
     *
     * Falls back to fragment manager bounds first, then to a direct scene
     * traversal when no cache is available (startup / fallback case).
     */
    getFragmentBounds(): THREE.Box3 {
        if (this._boundsCache) {
            const result = this._boundsCache.getBounds();
            console.log(`[PlanViewService] getFragmentBounds() — SceneBoundsCache HIT (O(1), no traversal) — box: ${JSON.stringify(result.isEmpty() ? 'empty' : result.getSize(new THREE.Vector3()).toArray().map(v=>v.toFixed(1)))}`);
            return result;
        }
        console.log(`[PlanViewService] getFragmentBounds() — SceneBoundsCache MISS — falling back to FragmentsManager / scene traversal (⚠ potentially slow on large models)`);

        // Fallback (pre-cache or startup): fragment manager bounds first.
        const box = new THREE.Box3();
        const fragments = this._components.get(OBC.FragmentsManager);

        if (fragments) {
            const fragmentList = (fragments as any).list || (fragments as any).groups;
            if (fragmentList && fragmentList.size > 0) {
                for (const group of fragmentList.values()) {
                    if (group.boundingBox) {
                        box.union(group.boundingBox);
                    } else if (group.mesh) {
                        const meshBox = new THREE.Box3().setFromObject(group.mesh);
                        if (!meshBox.isEmpty()) {
                            box.union(meshBox);
                        }
                    }
                }
            }
        }

        if (box.isEmpty()) {
            const sceneBounds = this._computeSceneBoundsExcludingHelpers();
            if (!sceneBounds.isEmpty()) {
                box.copy(sceneBounds);
            }
        }

        return box;
    }

    /**
     * Fallback direct traversal — used only when the bounds cache is not yet
     * available (i.e., before initScene wires up SceneBoundsCache). Uses the
     * shared SceneObjectClassifier so exclusion logic is never duplicated.
     */
    private _computeSceneBoundsExcludingHelpers(): THREE.Box3 {
        const box = new THREE.Box3();
        const scene = this._world.scene?.three;
        if (!scene) return box;

        const gridRoot = this._grid?.three ?? null;
        scene.traverse((obj: THREE.Object3D) => {
            if (!obj.visible) return;
            if (SceneObjectClassifier.shouldExcludeFromBounds(obj, gridRoot)) return;
            if (obj instanceof THREE.Mesh && obj.geometry) {
                const objBox = new THREE.Box3().setFromObject(obj);
                if (!objBox.isEmpty()) box.union(objBox);
            }
        });

        return box;
    }

    hasFragments(): boolean {
        const bounds = this.getFragmentBounds();
        return !bounds.isEmpty();
    }

    getViewConfig(direction: OrthographicViewDirection): OrthographicViewConfig {
        const bounds = this.getFragmentBounds();
        const hasGeometry = !bounds.isEmpty();

        let center: THREE.Vector3;
        let size: THREE.Vector3;

        if (hasGeometry) {
            center = bounds.getCenter(new THREE.Vector3());
            size = bounds.getSize(new THREE.Vector3());
            size.x = Math.max(size.x, MINIMUM_VIEW_EXTENT);
            size.y = Math.max(size.y, MINIMUM_VIEW_EXTENT);
            size.z = Math.max(size.z, MINIMUM_VIEW_EXTENT);
        } else {
            center = new THREE.Vector3(0, 0, 0);
            size = new THREE.Vector3(
                this._emptySceneConfig.defaultExtent,
                this._emptySceneConfig.defaultHeight,
                this._emptySceneConfig.defaultExtent
            );
        }

        const dirVec = new THREE.Vector3();
        const upVec = new THREE.Vector3();

        switch (direction) {
            case 'top':
                dirVec.set(0, -1, 0);
                upVec.set(0, 0, -1);
                break;
            case 'bottom':
                dirVec.set(0, 1, 0);
                upVec.set(0, 0, -1);
                break;
            case 'front':
                dirVec.set(0, 0, -1);
                upVec.set(0, 1, 0);
                break;
            case 'back':
                dirVec.set(0, 0, 1);
                upVec.set(0, 1, 0);
                break;
            case 'left':
                dirVec.set(-1, 0, 0);
                upVec.set(0, 1, 0);
                break;
            case 'right':
                dirVec.set(1, 0, 0);
                upVec.set(0, 1, 0);
                break;
        }

        return {
            direction: dirVec,
            up: upVec,
            center,
            size
        };
    }

    computeCameraPositionForView(config: OrthographicViewConfig): {
        position: THREE.Vector3;
        target: THREE.Vector3;
        distance: number;
    } {
        const { direction, center, size } = config;

        let distance: number;
        if (direction.y !== 0) {
            distance = Math.max(size.x, size.z) * DEFAULT_CAMERA_PADDING;
        } else if (direction.x !== 0) {
            distance = Math.max(size.y, size.z) * DEFAULT_CAMERA_PADDING;
        } else {
            distance = Math.max(size.x, size.y) * DEFAULT_CAMERA_PADDING;
        }

        distance = Math.max(distance, MINIMUM_VIEW_EXTENT);

        const position = center.clone().sub(direction.clone().multiplyScalar(distance));

        return {
            position,
            target: center.clone(),
            distance
        };
    }

    async applyOrthographicView(
        camera: OBC.OrthoPerspectiveCamera,
        direction: OrthographicViewDirection,
        animate: boolean = true
    ): Promise<void> {
        const _t0 = performance.now();
        console.log(`[PlanViewService][+0ms] applyOrthographicView("${direction}", animate=${animate}) ENTRY`);

        const config = this.getViewConfig(direction);
        const cameraData = this.computeCameraPositionForView(config);
        console.log(`[PlanViewService][+${(performance.now() - _t0).toFixed(1)}ms] getViewConfig + computeCameraPosition DONE (boundsCache=${this._boundsCache !== null ? 'HIT O(1)' : 'MISS — scene traversal'})`);

        // ⚠ BOTTLENECK: camera.projection.set('Orthographic') destroys the current
        // PerspectiveCamera and creates a new OrthographicCamera.  OBC triggers
        // RenderPipelineManager.updateCamera() which may recompile WebGPU TSL shaders
        // — typically 10–50ms on first call, <5ms on subsequent calls.
        console.log(`[PlanViewService][+${(performance.now() - _t0).toFixed(1)}ms] camera.projection.set("Orthographic") START (⚠ potential 10–50ms for shader recompile)`);
        camera.projection.set('Orthographic');
        console.log(`[PlanViewService][+${(performance.now() - _t0).toFixed(1)}ms] camera.projection.set("Orthographic") DONE`);

        const controls = camera.controls;
        controls.mouseButtons.left = 2;
        (controls.touches as any).one = 2;

        if (camera.three instanceof THREE.OrthographicCamera) {
            const ortho = camera.three as THREE.OrthographicCamera;
            ortho.zoom = 1.0;
        }

        camera.three.up.copy(config.up);
        camera.three.updateProjectionMatrix();

        console.log(`[PlanViewService][+${(performance.now() - _t0).toFixed(1)}ms] controls.setLookAt() START (target=${cameraData.target.toArray().map(v=>v.toFixed(1))}, dist=${cameraData.distance.toFixed(1)})`);
        await controls.setLookAt(
            cameraData.position.x, cameraData.position.y, cameraData.position.z,
            cameraData.target.x, cameraData.target.y, cameraData.target.z,
            animate
        );
        console.log(`[PlanViewService][+${(performance.now() - _t0).toFixed(1)}ms] controls.setLookAt() DONE`);

        camera.three.updateProjectionMatrix();
        console.log(`[PlanViewService][+${(performance.now() - _t0).toFixed(1)}ms] applyOrthographicView("${direction}") COMPLETE`);
    }

    async applyFloorPlan(camera: OBC.OrthoPerspectiveCamera, animate: boolean = true): Promise<void> {
        await this.applyOrthographicView(camera, 'top', animate);
        this._ensureGridVisible();
    }

    async applyCeilingPlan(camera: OBC.OrthoPerspectiveCamera, animate: boolean = true): Promise<void> {
        await this.applyOrthographicView(camera, 'bottom', animate);
        this._ensureGridVisible();
    }

    async applyElevation(
        camera: OBC.OrthoPerspectiveCamera,
        direction: 'front' | 'back' | 'left' | 'right',
        animate: boolean = true
    ): Promise<void> {
        await this.applyOrthographicView(camera, direction, animate);
    }

    private _ensureGridVisible(): void {
        if (!this._grid || !this._grid.three) return;

        this._grid.three.visible = true;
        this._grid.fade = false;

        const gridObject = this._grid.three;
        if (gridObject) {
            gridObject.traverse((obj: THREE.Object3D) => {
                if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
                    const material = obj.material as THREE.Material;
                    if (material) {
                        material.clippingPlanes = [];
                    }
                }
            });
        }
    }

    getEmptySceneFloorPlanConfig(): {
        center: THREE.Vector3;
        extent: number;
        height: number;
    } {
        return {
            center: new THREE.Vector3(0, 0, 0),
            extent: this._emptySceneConfig.defaultExtent,
            height: this._emptySceneConfig.defaultHeight
        };
    }

    getFloorPlanBounds(elevation: number = 0, cutHeight: number = 1.2): {
        bounds: THREE.Box3;
        clippingPlaneHeight: number;
    } {
        const bounds = this.getFragmentBounds();
        return {
            bounds,
            clippingPlaneHeight: elevation + cutHeight
        };
    }

    computeZoomForBounds(
        bounds: THREE.Box3,
        camera: THREE.OrthographicCamera,
        direction: OrthographicViewDirection
    ): number {
        if (bounds.isEmpty()) return 1.0;

        const size = bounds.getSize(new THREE.Vector3());
        let viewWidth: number;
        let viewHeight: number;

        switch (direction) {
            case 'top':
            case 'bottom':
                viewWidth = size.x;
                viewHeight = size.z;
                break;
            case 'front':
            case 'back':
                viewWidth = size.x;
                viewHeight = size.y;
                break;
            case 'left':
            case 'right':
                viewWidth = size.z;
                viewHeight = size.y;
                break;
        }

        const cameraWidth = camera.right - camera.left;
        const cameraHeight = camera.top - camera.bottom;

        const zoomX = cameraWidth / (viewWidth * DEFAULT_CAMERA_PADDING);
        const zoomY = cameraHeight / (viewHeight * DEFAULT_CAMERA_PADDING);

        return Math.min(zoomX, zoomY, 1.0);
    }

    dispose(): void {
        // No resources to release.
    }
}
