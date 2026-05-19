import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { RoofData } from './RoofTypes.js';
import { RoofGeometryBuilder } from './RoofGeometryBuilder.js';
import { BimManager } from '@pryzm/core-app-model';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';

const DEFAULT_MATERIAL_COLOR = '#c8a46e';

/**
 * Minimal root+bounds registry interface (§02-BIM-SPATIAL-PROJECTION-CONTRACT §2).
 * Satisfied by the full ElementRegistry when Phase 2 is implemented.
 * Optional constructor parameter — safely skipped via optional chaining.
 */
interface RootBoundsRegistry {
    register(id: string, root: THREE.Group, type: string, bounds?: { min: [number,number,number]; max: [number,number,number] }): void;
    unregister(id: string): void;
}

/**
 * Fragment builder for roof elements.
 *
 * Material slots (§2.5 of 02-ROOF-GEOMETRY-ENGINE-CONTRACT):
 *   0 – Trim / Fascia  (white,      DoubleSide)  gable ends, fascia bands
 *   1 – Deck / Soffit  (light grey, DoubleSide)  bottom face
 *   2 – Interior       (near white, DoubleSide)  not used in generated geometry
 *   3 – Shingle        (warm tan,   DoubleSide)  outer roofing surface
 *
 * Phase 2 note: all materials use DoubleSide so geometry renders correctly
 * regardless of face-winding direction. Phase 3 will audit winding and switch
 * slot 3 to FrontSide for render performance.
 *
 * C11 §2 step 3 (Task 1.2) — geometry builds are deferred via FrameScheduler
 *   adaptive drain. `updateRoof()` enqueues the data; `_drainBuildQueue()`
 *   processes up to `_buildsPerFrame` items per pre-render tick.
 */
export class RoofFragmentBuilder {
    private scene: THREE.Scene;
    private _bimManager: BimManager;
    private _registry?: RootBoundsRegistry;
    public roofRoots = new Map<string, THREE.Group>();

    // ── C11 §2 step 3: FrameScheduler adaptive drain ──────────────────────────
    /** Pending roof builds keyed by id — later update wins (dedup). */
    private _pendingBuilds = new Map<string, RoofData>();
    /** FrameScheduler disposer for the drain loop — null when idle. */
    private _rafHandle: TickListenerDisposer | null = null;
    /** Adaptive per-frame budget, starts at 5, adjusts by ±1 each frame. */
    private _buildsPerFrame = 5;
    private static readonly _MAX_BUILDS = 12;
    private static readonly _MIN_BUILDS = 2;

    constructor(scene: THREE.Scene, bimManager: BimManager, registry?: RootBoundsRegistry) {
        this.scene       = scene;
        this._bimManager = bimManager;
        this._registry   = registry;
    }

    private _createMaterials(data: RoofData): THREE.Material[] {
        const shingleColor = new THREE.Color(data.materialColor || DEFAULT_MATERIAL_COLOR);

        // Slot 0 – Trim / Fascia (white)
        const trimMat = new THREE.MeshStandardMaterial({
            color:     new THREE.Color('#ffffff'),
            roughness: 1.0,
            metalness: 0.0,
            side:      THREE.DoubleSide,
        });

        // Slot 1 – Deck / Soffit (light grey)
        const deckMat = new THREE.MeshStandardMaterial({
            color:     new THREE.Color('#e5e5e5'),
            roughness: 1.0,
            metalness: 0.0,
            side:      THREE.DoubleSide,
        });

        // Slot 2 – Interior (near white) — reserved, not used by current generators
        const interiorMat = new THREE.MeshStandardMaterial({
            color:     new THREE.Color('#f0f0f0'),
            roughness: 1.0,
            metalness: 0.0,
            side:      THREE.DoubleSide,
        });

        // Slot 3 – Shingle (warm tan, driven by materialColor)
        const shingleMat = new THREE.MeshStandardMaterial({
            color:     shingleColor,
            roughness: 0.85,
            metalness: 0.0,
            side:      THREE.DoubleSide,
        });

        return [trimMat, deckMat, interiorMat, shingleMat];
    }

    private _disposeChildren(root: THREE.Group): void {
        root.traverse(obj => {
            if ((obj as THREE.Mesh).isMesh) {
                const mesh = obj as THREE.Mesh;
                mesh.geometry?.dispose();
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else {
                    mesh.material?.dispose();
                }
            }
        });
        root.clear();
    }

    /**
     * C11 §2 step 3 — enqueue a roof build; drain fires on the next
     * pre-render tick so geometry is never built synchronously in a DOM event
     * handler. Later calls for the same id overwrite earlier ones (dedup).
     */
    updateRoof(data: RoofData): void {
        this._pendingBuilds.set(data.id, data);
        if (this._rafHandle === null) {
            this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    /**
     * C11 §2 step 3 — adaptive drain: processes up to `_buildsPerFrame`
     * roofs per pre-render tick. Budget auto-adjusts ±1 based on observed
     * frame cost (target: 8–20 ms per drain pass).
     */
    private _drainBuildQueue(): void {
        this._rafHandle = null;
        const t0 = performance.now();

        const ids = [...this._pendingBuilds.keys()].slice(0, this._buildsPerFrame);
        for (const id of ids) {
            const roof = this._pendingBuilds.get(id)!;
            this._pendingBuilds.delete(id);
            try {
                this._updateRoofSync(roof);
            } catch (err) {
                console.error('[RoofFragmentBuilder] build error:', err);
            }
        }

        const frameMs = performance.now() - t0;
        if (frameMs < 8 && this._buildsPerFrame < RoofFragmentBuilder._MAX_BUILDS) {
            this._buildsPerFrame++;
        } else if (frameMs > 20 && this._buildsPerFrame > RoofFragmentBuilder._MIN_BUILDS) {
            this._buildsPerFrame--;
        }

        if (this._pendingBuilds.size > 0) {
            this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    /**
     * Synchronous roof build — called only from `_drainBuildQueue()`.
     * Contains the original updateRoof() logic.
     */
    private _updateRoofSync(data: RoofData): void {
        let root = this.roofRoots.get(data.id);

        if (!root) {
            root = new THREE.Group();
            Object.defineProperty(root.userData, 'id',          { value: data.id, writable: false, enumerable: true });
            Object.defineProperty(root.userData, 'elementType', { value: 'roof',  writable: false, enumerable: true });
            root.userData.type = 'roof';
            this.scene.add(root);
            this.roofRoots.set(data.id, root);
        }
        elementRegistry.registerRoot(data.id, root);

        this._disposeChildren(root);

        root.userData.modelId       = 'model-default';
        root.userData.selectable    = true;
        root.userData.levelId       = data.levelId;
        root.userData.roofType      = data.roofType;
        root.userData.baseOffset    = data.baseOffset;
        root.userData.thickness     = data.thickness;
        root.userData.overhang      = data.overhang;
        root.userData.footprint     = data.footprint;
        root.userData.materialColor = data.materialColor ?? DEFAULT_MATERIAL_COLOR;
        root.userData.materialId    = data.materialId;
        root.userData.mark          = data.properties?.mark;
        root.userData.version       = (root.userData.version || 0) + 1;

        const level  = this._bimManager.getLevelById(data.levelId);
        const worldY = level ? (level.elevation + data.baseOffset) : data.baseOffset;

        const geo       = RoofGeometryBuilder.generate(data);
        const materials = this._createMaterials(data);
        const mesh      = new THREE.Mesh(geo, materials);

        mesh.userData.elementType = 'RoofPart';
        mesh.userData.modelId     = 'model-default';
        mesh.userData.parentId    = data.id;

        const cx = data.footprint?.centroid?.[0] ?? 0;
        const cz = data.footprint?.centroid?.[1] ?? 0;

        root.position.set(cx, worldY, cz);
        root.add(mesh);

        // V-REG-1 fix: register root + world-space bounds for Topology Layer
        // (§02-BIM-SPATIAL-PROJECTION-CONTRACT §2, §4.7)
        if (this._registry) {
            const box = new THREE.Box3().setFromObject(root);
            this._registry.register(data.id, root, 'roof', {
                min: [box.min.x, box.min.y, box.min.z],
                max: [box.max.x, box.max.y, box.max.z],
            });
        }
    }

    removeRoof(id: string): void {
        this._pendingBuilds.delete(id);
        const root = this.roofRoots.get(id);
        if (root) {
            this._disposeChildren(root);
            this.scene.remove(root);
            this.roofRoots.delete(id);
            this._registry?.unregister(id);
            elementRegistry.unregisterRoot(id);
        }
    }
}
