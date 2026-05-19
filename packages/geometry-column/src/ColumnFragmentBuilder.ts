/**
 * ColumnFragmentBuilder
 *
 * Builds THREE.js geometry for structural columns.
 *
 * Supports two geometry modes:
 *   Concrete / generic:  BoxGeometry (rectangular) or CylinderGeometry (circular)
 *   Steel UC / UB:       Parametric I/H-section via ISectionGenerator + THREE.LOD
 *
 * Steel geometry is procedural — no imported meshes, no static shapes.
 * All profile dimensions are read from SteelProfileLibrary at build time.
 *
 * Contract compliance:
 *   §D.3  — builders receive frozen data, compute geometry, register bounds.
 *   §3.5  — no store mutations; store events wire the builder externally.
 *   §3.4  — column is plain DTO; no THREE.Vector3 in store.
 *
 * §COLUMN-AUDIT-2026 §W9 — BimManager is now optionally constructor-injected.
 *   When present, `build()` re-resolves `level.elevation` for the column's
 *   `levelId` and throws `SpatialAuthorityError` if the level is missing
 *   (column orphaned from its level — should never happen post-cleanup
 *   handler fix in §C1). When absent (legacy bootstrap order), the builder
 *   falls back to the cached `column.position.y` from the store.
 *
 * §COLUMN-AUDIT-2026 §M7 — `_createColumnMaterial` now warns when the
 *   `materialId` lookup misses STANDARD_MATERIAL_LIBRARY so silent material
 *   misses are visible in the console.
 *
 * §COLUMN-AUDIT-2026 §M8 — When the steel-profile branch falls back to the
 *   concrete branch (unknown steelProfileName), `userData.profile` and
 *   `userData.steelProfileName` are reset so metadata matches the rendered
 *   geometry.
 *
 * C11 §2 step 3 (Task 1.2) — geometry builds are deferred via FrameScheduler
 *   adaptive drain. `updateColumn()` enqueues the data; `_drainBuildQueue()`
 *   processes up to `_buildsPerFrame` items per pre-render tick.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { getFrameScheduler, type TickListenerDisposer } from '@pryzm/frame-scheduler';
import { ColumnData } from './ColumnTypes';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import { SteelProfileLibrary } from '@pryzm/plugin-structural';
import { createColumnLOD } from '@pryzm/plugin-structural';
import { STANDARD_MATERIAL_LIBRARY } from '@pryzm/core-app-model/material-library';
import { SpatialAuthorityError } from '@pryzm/core-app-model';
import type { BimManager } from '@pryzm/core-app-model';
import { resolveSlabBaseOffsetForPoint } from './SlabColumnCoupling';

interface MinSlabStoreForCoupling {
    getAll(): Array<any>;
}

export class ColumnFragmentBuilder {
    private scene: THREE.Scene;
    private meshes: Map<string, THREE.Object3D> = new Map();
    /** §W9: optional BimManager for level re-resolution. */
    private bimManager: BimManager | null;
    /** §W9: optional slab store for slab-base offset re-resolution. */
    private slabStore: MinSlabStoreForCoupling | null;

    // ── C11 §2 step 3: FrameScheduler adaptive drain ──────────────────────────
    /** Pending column builds keyed by id — later update wins (dedup). */
    private _pendingBuilds = new Map<string, ColumnData>();
    /** FrameScheduler disposer for the drain loop — null when idle. */
    private _rafHandle: TickListenerDisposer | null = null;
    /** Adaptive per-frame budget, starts at 5, adjusts by ±1 each frame. */
    private _buildsPerFrame = 5;
    private static readonly _MAX_BUILDS = 12;
    private static readonly _MIN_BUILDS = 2;

    constructor(scene: THREE.Scene, bimManager: BimManager | null = null, slabStore: MinSlabStoreForCoupling | null = null) {
        this.scene = scene;
        this.bimManager = bimManager;
        this.slabStore = slabStore;
    }

    /**
     * §W9 late-bind: EngineBootstrap may construct the builder before the
     * BimManager / slabStore are available. This setter lets the bootstrap
     * inject them once they exist without rewiring the storeEventBus.
     */
    setSpatialDeps(deps: { bimManager?: BimManager | null; slabStore?: MinSlabStoreForCoupling | null }): void {
        if (deps.bimManager !== undefined) this.bimManager = deps.bimManager;
        if (deps.slabStore !== undefined) this.slabStore = deps.slabStore;
    }

    /**
     * C11 §2 step 3 — enqueue a column build; drain fires on the next
     * pre-render tick so geometry is never built synchronously in an event
     * handler. Later calls for the same id overwrite earlier ones (dedup).
     */
    updateColumn(column: ColumnData): void {
        this._pendingBuilds.set(column.id, column);
        if (this._rafHandle === null) {
            this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    remove(id: string): void {
        this._pendingBuilds.delete(id);
        const mesh = this.meshes.get(id);
        if (mesh) {
            this.scene.remove(mesh);
            this._disposeMesh(mesh);
            this.meshes.delete(id);
            elementRegistry.unregisterRoot(id);
        }
    }

    /**
     * C11 §2 step 3 — adaptive drain: processes up to `_buildsPerFrame`
     * columns per pre-render tick. Budget auto-adjusts ±1 based on
     * observed frame cost (target: 8–20 ms per drain pass).
     */
    private _drainBuildQueue(): void {
        this._rafHandle = null;
        const t0 = performance.now();

        const ids = [...this._pendingBuilds.keys()].slice(0, this._buildsPerFrame);
        for (const id of ids) {
            const col = this._pendingBuilds.get(id)!;
            this._pendingBuilds.delete(id);
            try {
                this.build(col);
            } catch (err) {
                console.error('[ColumnFragmentBuilder] build error:', err);
            }
        }

        const frameMs = performance.now() - t0;
        if (frameMs < 8 && this._buildsPerFrame < ColumnFragmentBuilder._MAX_BUILDS) {
            this._buildsPerFrame++;
        } else if (frameMs > 20 && this._buildsPerFrame > ColumnFragmentBuilder._MIN_BUILDS) {
            this._buildsPerFrame--;
        }

        if (this._pendingBuilds.size > 0) {
            this._rafHandle = getFrameScheduler().schedule('pre-render', () => this._drainBuildQueue());
        }
    }

    build(column: ColumnData): THREE.Object3D {
        // §W9: when BimManager is injected, re-resolve the world Y from the
        // level + slab top each build. Throws SpatialAuthorityError if the
        // column's levelId is dangling. Falls back to column.position.y when
        // no BimManager is available (legacy bootstrap order).
        let resolvedY = column.position.y;
        if (this.bimManager) {
            const level = this.bimManager.getLevelById(column.levelId);
            if (!level) {
                throw new SpatialAuthorityError(
                    `ColumnFragmentBuilder: column ${column.id} references missing level ${column.levelId}.`,
                );
            }
            const elevation = (level as any).elevation ?? 0;
            const slabOff = this.slabStore
                ? resolveSlabBaseOffsetForPoint(
                      column.levelId,
                      column.position.x,
                      column.position.z,
                      this.slabStore as any,
                  )
                : 0;
            resolvedY = elevation + slabOff;
        }

        // Remove existing mesh
        if (this.meshes.has(column.id)) {
            const old = this.meshes.get(column.id)!;
            this.scene.remove(old);
            this._disposeMesh(old);
            this.meshes.delete(column.id);
            elementRegistry.unregisterRoot(column.id);
        }

        const isSteelSection = column.profile === 'UC' || column.profile === 'UB';

        let root: THREE.Object3D;
        let renderedAsConcreteFallback = false;

        if (isSteelSection && column.steelProfileName) {
            const built = this._buildSteelColumn(column);
            if (built) {
                root = built;
            } else {
                // §M8: steel profile lookup failed → reset user-facing metadata.
                renderedAsConcreteFallback = true;
                root = this._buildConcreteColumn(column);
            }
        } else {
            root = this._buildConcreteColumn(column);
        }

        // ── Metadata ────────────────────────────────────────────────────────
        root.userData = {
            id:            column.id,
            type:          'column',
            elementType:   'Column',
            modelId:       'model-default',
            selectable:    true,
            levelId:       column.levelId,
            parentId:      column.parentId,
            // §M8: reflect the actual geometry kind, not the requested profile.
            profile:       renderedAsConcreteFallback ? 'rectangular' : column.profile,
            steelProfileName: renderedAsConcreteFallback ? undefined : column.steelProfileName,
            width:         column.width,
            depth:         column.depth,
            height:        column.height,
            baseOffset:    column.baseOffset,
            rotation:      column.rotation,
            position:      column.position,
            materialId:    column.materialId,
            materialColor: column.materialColor,
            properties:    column.properties,
            ifcData:       column.ifcData,
        };

        // §UI-contract: identity properties must not be overwritten by UI
        Object.defineProperty(root.userData, 'id',          { writable: false });
        Object.defineProperty(root.userData, 'elementType', { writable: false });

        // Position the root group at the column base
        root.position.set(
            column.position.x,
            resolvedY + column.baseOffset,
            column.position.z,
        );
        root.rotation.y = column.rotation;

        root.castShadow    = true;
        root.receiveShadow = true;

        this.scene.add(root);
        this.meshes.set(column.id, root);
        elementRegistry.registerRoot(column.id, root);

        return root;
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    /**
     * Build parametric steel I/H-section column with THREE.LOD.
     * Returns null when the steel profile name does not resolve in the
     * SteelProfileLibrary so callers can apply the §M8 metadata reset.
     */
    private _buildSteelColumn(column: ColumnData): THREE.Object3D | null {
        const profile = SteelProfileLibrary.get(column.steelProfileName!);
        if (!profile) {
            console.warn(
                `[ColumnFragmentBuilder] §M8 fallback: steel profile "${column.steelProfileName}" ` +
                    'not found in SteelProfileLibrary; falling back to concrete-rectangular geometry.',
            );
            return null;
        }

        // THREE.LOD: close / medium / far detail levels
        const material = this._createColumnMaterial(column, 'steel');
        const lod = createColumnLOD(profile, column.height, material);

        // Propagate shadow flags down to each LOD level mesh
        lod.traverse(obj => {
            if ((obj as THREE.Mesh).isMesh) {
                obj.castShadow    = true;
                obj.receiveShadow = true;
            }
        });

        return lod;
    }

    /** Build concrete rectangular or circular column. */
    private _buildConcreteColumn(column: ColumnData): THREE.Object3D {
        let geometry: THREE.BufferGeometry;
        if (column.profile === 'circular') {
            geometry = new THREE.CylinderGeometry(column.width / 2, column.width / 2, column.height, 32);
        } else {
            geometry = new THREE.BoxGeometry(column.width, column.height, column.depth);
        }

        const material = this._createColumnMaterial(column, 'concrete');
        // §M12: translate BOTH cylinder and box so the base sits at local y=0.
        geometry.translate(0, column.height / 2, 0);

        const mesh = new THREE.Mesh(geometry, material);

        return mesh;
    }

    private _createColumnMaterial(column: ColumnData, fallback: 'steel' | 'concrete'): THREE.MeshStandardMaterial {
        const materialId = column.materialId || (fallback === 'steel' ? 'steel-structural' : 'concrete-smooth');
        const matDef = STANDARD_MATERIAL_LIBRARY.find(mat => mat.id === materialId);

        if (matDef) {
            const params = { ...matDef.params };
            if (column.materialColor) params.color = new THREE.Color(column.materialColor);
            return new THREE.MeshStandardMaterial(params);
        }

        // §M7: surface a missing materialId so it's visible in the console
        // instead of silently substituting a default colour.
        if (column.materialId) {
            console.warn(
                `[ColumnFragmentBuilder] §M7: materialId "${column.materialId}" not in ` +
                    'STANDARD_MATERIAL_LIBRARY for column ' +
                    `${column.id}. Falling back to ${fallback} default material.`,
            );
        }

        return new THREE.MeshStandardMaterial({
            color: new THREE.Color(column.materialColor || (fallback === 'steel' ? '#9aa0a8' : '#cccccc')),
            metalness: fallback === 'steel' ? 1.0 : 0,
            roughness: fallback === 'steel' ? 0.35 : 0.85,
        });
    }

    private _disposeMesh(obj: THREE.Object3D): void {
        obj.traverse(child => {
            const m = child as THREE.Mesh;
            if (m.isMesh) {
                m.geometry?.dispose();
                if (Array.isArray(m.material)) {
                    m.material.forEach(mat => mat.dispose());
                } else {
                    (m.material as THREE.Material)?.dispose();
                }
            }
        });
    }

    /**
     * Compute the 2D plan-view snap points for a steel column.
     * Returns the I-section outline vertices in world XZ (Y ignored).
     * Used by ColumnPlanSymbolBuilder and SteelSnapProvider.
     */
    getSteelColumnOutlineXZ(column: ColumnData): Array<{ x: number; z: number }> | null {
        if (!column.steelProfileName) return null;
        const profile = SteelProfileLibrary.get(column.steelProfileName);
        if (!profile) return null;

        const { D, B, t, T } = SteelProfileLibrary.toMetres(profile);
        const hw = B / 2;
        const hd = D / 2;
        const ht = t / 2;
        const wh = hd - T;

        // 12-point I-section outline in local XZ
        const localPts: Array<{ x: number; z: number }> = [
            { x: -hw, z: -hd },
            { x:  hw, z: -hd },
            { x:  hw, z: -wh },
            { x:  ht, z: -wh },
            { x:  ht, z:  wh },
            { x:  hw, z:  wh },
            { x:  hw, z:  hd },
            { x: -hw, z:  hd },
            { x: -hw, z:  wh },
            { x: -ht, z:  wh },
            { x: -ht, z: -wh },
            { x: -hw, z: -wh },
        ];

        // Apply column rotation (about Y) and world offset
        const cos = Math.cos(column.rotation);
        const sin = Math.sin(column.rotation);

        return localPts.map(({ x, z }) => ({
            x: column.position.x + x * cos - z * sin,
            z: column.position.z + x * sin + z * cos,
        }));
    }
}
