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
/**
 * §M-H1 follow-up (DAILY-USE-AUDIT 2026-05-20) — minimal shape of the
 * STANDARD_MATERIAL_LIBRARY entry. Matches the wall/slab DI shape so a single
 * library map can be shared across all builders without coupling each one to
 * the full MaterialDefinition class.
 */
export interface RoofBuilderMaterialDef {
    params?: Record<string, unknown>;
    textures?: { color?: unknown; normal?: unknown; roughness?: unknown };
}

export class RoofFragmentBuilder {
    private scene: THREE.Scene;
    private _bimManager: BimManager;
    private _registry?: RootBoundsRegistry;
    public roofRoots = new Map<string, THREE.Group>();

    /**
     * §M-H1 follow-up — id→matDef map (STANDARD_MATERIAL_LIBRARY). When supplied
     * and `data.materialId` resolves against it, the shingle slot is built from
     * the matDef's PBR `params` instead of just `data.materialColor`. Optional;
     * absence falls back to the existing materialColor-only behaviour.
     */
    private _materialMap: ReadonlyMap<string, RoofBuilderMaterialDef> | null = null;

    // ── C11 §2 step 3: FrameScheduler adaptive drain ──────────────────────────
    /** Pending roof builds keyed by id — later update wins (dedup). */
    private _pendingBuilds = new Map<string, RoofData>();
    /** FrameScheduler disposer for the drain loop — null when idle. */
    private _rafHandle: TickListenerDisposer | null = null;
    /** Adaptive per-frame budget, starts at 5, adjusts by ±1 each frame. */
    private _buildsPerFrame = 5;
    private static readonly _MAX_BUILDS = 12;
    private static readonly _MIN_BUILDS = 2;

    constructor(
        scene: THREE.Scene,
        bimManager: BimManager,
        registry?: RootBoundsRegistry,
        // §M-H1 follow-up — optional STANDARD_MATERIAL_LIBRARY map. Backward-
        // compatible (callers that don't pass it keep current behaviour).
        materialMap?: ReadonlyMap<string, RoofBuilderMaterialDef>,
    ) {
        this.scene        = scene;
        this._bimManager  = bimManager;
        this._registry    = registry;
        this._materialMap = materialMap ?? null;
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

        // §M-H1 follow-up (DAILY-USE-AUDIT 2026-05-20) — Slot 3 (Shingle): when
        // `data.materialId` resolves against the STANDARD_MATERIAL_LIBRARY map,
        // build the shingle from the matDef's PBR `params` + textures so the
        // architect's choice of "Terracotta Tile", "Standing-Seam Zinc", "Slate
        // Charcoal", etc. actually changes the rendered material rather than
        // collapsing to flat colour. Same pattern as WallFragmentBuilder and
        // SlabFragmentBuilder. Per-roof `materialColor` is honoured as a tint
        // when the matDef has no explicit colour (lets the architect re-colour
        // a "standing-seam-zinc" PBR roof to red without losing the metalness).
        const matId = (data as { materialId?: string }).materialId;
        let shingleMat: THREE.MeshStandardMaterial | null = null;
        if (matId && this._materialMap) {
            const matDef = this._materialMap.get(matId);
            if (matDef) {
                const params: Record<string, unknown> = { ...(matDef.params ?? {}) };
                if (matDef.textures) {
                    params.map          = matDef.textures.color;
                    params.normalMap    = matDef.textures.normal;
                    params.roughnessMap = matDef.textures.roughness;
                }
                if (data.materialColor && params.color === undefined) {
                    params.color = new THREE.Color(data.materialColor);
                }
                params.side = THREE.DoubleSide;
                shingleMat = new THREE.MeshStandardMaterial(
                    params as ConstructorParameters<typeof THREE.MeshStandardMaterial>[0],
                );
            }
        }
        if (!shingleMat) {
            // Fallback — original materialColor-only path preserved exactly.
            shingleMat = new THREE.MeshStandardMaterial({
                color:     shingleColor,
                roughness: 0.85,
                metalness: 0.0,
                side:      THREE.DoubleSide,
            });
        }

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
