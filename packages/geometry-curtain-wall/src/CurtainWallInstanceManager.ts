/**
 * CurtainWallInstanceManager
 *
 * Groups curtain wall panels by type and renders them using THREE.InstancedMesh
 * to dramatically reduce GPU draw calls.
 *
 * ## Performance Impact
 *
 * Without instancing: 60 glass panels → 60 draw calls
 * With instancing:    60 glass panels → 1 draw call (1 InstancedMesh × 60 instances)
 *
 * ## Non-Uniform Grid Support
 *
 * For non-uniform grids, cells have different widths and heights.
 * We use a unit (1×1×1) base geometry and encode per-cell dimensions
 * into the instance transform matrix (scale.x = panelWidth, scale.y = panelHeight).
 *
 * ## Instance → Panel ID Mapping (SelectionManager Integration)
 *
 * InstancedMesh does not support per-instance userData natively.
 * We store `instancePanelIds: string[]` on the mesh's userData.
 * The SelectionManager can resolve an instance index to a panel ID via:
 *   mesh.userData.instancePanelIds[instanceId]
 *
 * ## Phase 1 Limitations
 *
 * - materialOverride on individual panels is NOT supported by instancing
 *   (all instances share one material). Panels with materialOverride fall
 *   back to CurtainPanelBuilder.buildPanelMesh() as individual meshes.
 * - Phase 2 will add per-instance color via InstancedBufferAttribute.
 *
 * ## Phase B Optimizations (INE-01, INE-02)
 *
 * §B.1 — Panel geometry + material cache:
 *   Previous: 588 fresh BoxGeometry + MeshStandardMaterial allocations per 294-wall batch.
 *   After:    2 allocations total (one per panel type on first build), shared across all walls.
 *   Cache key for geo: panelThickness.toFixed(4)
 *   Cache key for mat: `${panelType}:${color}:${opacity.toFixed(3)}`
 *   Stamped: geo.userData.sharedGeometry = true, mat.userData.sharedMaterial = true so
 *   CurtainWallBuilder._disposeChildren skips them on rebuild.
 *
 * §B.2 — Shadow default false:
 *   instancedMesh.castShadow and receiveShadow are now initialised to false.
 *   CurtainWallBuilder.build() sets the correct value based on deferShadows flag
 *   immediately after buildInstancedMeshes() returns.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { CurtainCell } from './CurtainCellComputer';
import { CurtainPanelData, PANEL_TYPE_DEFAULTS, PanelType } from './CurtainPanelTypes';
import { isBatchable } from './CurtainPanelFactory';

export interface InstanceManagerResult {
    /** InstancedMesh objects — one per distinct panel type (non-empty, no override). */
    instancedMeshes: THREE.InstancedMesh[];
    /**
     * Panel IDs that have materialOverride and could not be batched.
     * These must be rendered individually by CurtainPanelBuilder.
     */
    overridePanelIds: string[];
}

export class CurtainWallInstanceManager {
    /**
     * §B.1 — Panel geometry cache.
     * Key: panelThickness.toFixed(4)
     * Value: BoxGeometry(1, 1, thickness) — unit base; instance matrix encodes scale.
     *
     * Stamped with geo.userData.sharedGeometry = true so CurtainWallBuilder._disposeChildren
     * skips disposal on wall rebuild. Cache owns the geometries until disposeCache() runs.
     *
     * Previous: 588 fresh BoxGeometry allocations per 294-wall batch (2× panel types × 294).
     * After:    2 allocations total — one per distinct panelThickness value used in the batch.
     */
    private readonly _panelGeoCache = new Map<string, THREE.BoxGeometry>();

    /**
     * §B.1 — Panel material cache.
     * Key: `${panelType}:${color}:${opacity.toFixed(3)}`
     * Value: MeshStandardMaterial with the panel type's canonical defaults.
     *
     * Stamped with mat.userData.sharedMaterial = true so CurtainWallBuilder._disposeChildren
     * skips disposal on wall rebuild. Cache owns the materials until disposeCache() runs.
     *
     * Previous: 588 fresh MeshStandardMaterial allocations per 294-wall batch.
     * After:    2–4 allocations total — one per distinct (panelType, thickness) combination.
     */
    private readonly _panelMatCache = new Map<string, THREE.MeshStandardMaterial>();

    /**
     * §B.1.2 — Resolve a unit BoxGeometry from the cache.
     *
     * The geometry is (1, 1, thickness) — width and height are encoded into the
     * InstancedMesh transform matrix, so only thickness affects the geometry.
     * Callers MUST stamp instancedMesh.userData.sharedGeometry = true so
     * _disposeChildren does not free the cache-owned geometry on rebuild.
     */
    private _getPanelGeometry(panelThickness: number): THREE.BoxGeometry {
        const key = panelThickness.toFixed(4);
        let geo = this._panelGeoCache.get(key);
        if (!geo) {
            geo = new THREE.BoxGeometry(1, 1, panelThickness);
            geo.userData.sharedGeometry = true;
            this._panelGeoCache.set(key, geo);
        }
        return geo;
    }

    /**
     * §B.1.2 — Resolve a MeshStandardMaterial from the cache.
     *
     * Key is `${panelType}:${color}:${opacity.toFixed(3)}` — each canonical panel type
     * has fixed defaults from PANEL_TYPE_DEFAULTS, so the type alone encodes all
     * material properties. Including color and opacity guards against future per-type
     * overrides without requiring a cache key change.
     * Callers MUST stamp instancedMesh.userData.sharedMaterial = true so
     * _disposeChildren does not free the cache-owned material on rebuild.
     */
    private _getPanelMaterial(panelType: PanelType, panelThickness: number): THREE.MeshStandardMaterial {
        const defaults = PANEL_TYPE_DEFAULTS[panelType];
        const colorStr = typeof defaults.color === 'number'
            ? defaults.color.toString(16).padStart(6, '0')
            : String(defaults.color);
        const key = `${panelType}:${colorStr}:${defaults.opacity.toFixed(3)}:${panelThickness.toFixed(4)}`;
        let mat = this._panelMatCache.get(key);
        if (!mat) {
            mat = new THREE.MeshStandardMaterial({
                color: defaults.color,
                transparent: defaults.transparent,
                opacity: defaults.opacity,
                metalness: defaults.metalness,
                roughness: defaults.roughness,
                side: defaults.transparent ? THREE.DoubleSide : THREE.FrontSide,
            });
            mat.userData.sharedMaterial = true;
            this._panelMatCache.set(key, mat);
        }
        return mat;
    }

    /**
     * §B.1.3 — Dispose all cached geometries and materials.
     *
     * MUST be called from CurtainWallBuilder.dispose() on project close so cached
     * GPU resources are released. Individual wall remove() calls do NOT call this
     * because the cache is shared across all walls; only a full builder teardown
     * should dispose it.
     */
    disposeCache(): void {
        this._panelGeoCache.forEach(g => g.dispose());
        this._panelGeoCache.clear();
        this._panelMatCache.forEach(m => m.dispose());
        this._panelMatCache.clear();
        console.log('[CurtainWallInstanceManager] §B.1 disposeCache() — panel geo+mat caches cleared.');
    }

    /**
     * Build instanced meshes for all non-empty panels that share a panel type
     * and have no materialOverride.
     *
     * @param cells         — all computed cells for this curtain wall
     * @param panels        — all semantic panel data from CurtainPanelStore
     * @param mullionSize   — used to inset panel dimensions from cell edges
     * @param panelThickness — thickness of the flat panel geometry
     */
    buildInstancedMeshes(
        cells: readonly CurtainCell[],
        panels: CurtainPanelData[],
        mullionSize: number,
        panelThickness: number
    ): InstanceManagerResult {
        const __t_im_start = performance.now();

        // Separate panels that need individual rendering (materialOverride or Empty)
        const batchable: CurtainPanelData[] = [];
        const overridePanelIds: string[] = [];

        for (const panel of panels) {
            if (panel.panelType === 'SystemPanel_Empty') continue;
            // Non-batchable panel types (Door + all LOD-400 systems registered in
            // CurtainPanelFactory with canBatch=false) and panels with a
            // materialOverride must render individually — they cannot share an
            // InstancedMesh (geometry varies per instance).
            if (!isBatchable(panel.panelType) || panel.materialOverride) {
                overridePanelIds.push(panel.id);
            } else {
                batchable.push(panel);
            }
        }

        // Group batchable panels by panelType
        const byType = new Map<PanelType, Array<{ cell: CurtainCell; panel: CurtainPanelData }>>();

        for (const panel of batchable) {
            const cell = cells.find(c => c.i === panel.cellIndex[0] && c.j === panel.cellIndex[1]);
            if (!cell) continue; // Cell was removed (grid change in flight)

            if (!byType.has(panel.panelType)) {
                byType.set(panel.panelType, []);
            }
            byType.get(panel.panelType)!.push({ cell, panel });
        }

        // §DIAG-IM-01: log type distribution so we can track per-panel-type geometry allocation cost
        if (byType.size > 0 || overridePanelIds.length > 0) {
            const typeBreakdown = Array.from(byType.entries())
                .map(([t, es]) => `${t}:${es.length}`)
                .join(', ');
            console.log(
                `[CurtainWallInstanceManager] §DIAG-IM-01 panels=${panels.length} ` +
                `batchable=${batchable.length} overrides=${overridePanelIds.length} ` +
                `panelTypes=${byType.size} distribution=[${typeBreakdown}] ` +
                `panelThickness=${panelThickness}`
            );
        }

        const instancedMeshes: THREE.InstancedMesh[] = [];
        const dummy = new THREE.Object3D();
        let __im_geo_alloc_count = 0;
        let __im_mat_alloc_count = 0;

        for (const [panelType, entries] of byType.entries()) {
            if (entries.length === 0) continue;

            // §B.1.4 — Resolve geometry and material from cache instead of allocating fresh.
            // First call per (panelThickness, panelType) populates the cache; all subsequent
            // calls across every wall in the batch reuse the same GPU-backed objects.
            const __t_geo = performance.now();
            const geoCacheKey = panelThickness.toFixed(4);
            const geoWasHit = this._panelGeoCache.has(geoCacheKey);
            const geo = this._getPanelGeometry(panelThickness);
            if (!geoWasHit) {
                __im_geo_alloc_count++;
            }

            const matWasHit = (() => {
                const defaults = PANEL_TYPE_DEFAULTS[panelType];
                const colorStr = typeof defaults.color === 'number'
                    ? defaults.color.toString(16).padStart(6, '0')
                    : String(defaults.color);
                return this._panelMatCache.has(
                    `${panelType}:${colorStr}:${defaults.opacity.toFixed(3)}:${panelThickness.toFixed(4)}`
                );
            })();
            const mat = this._getPanelMaterial(panelType, panelThickness);
            if (!matWasHit) {
                __im_mat_alloc_count++;
            }

            console.log(
                `[CurtainWallInstanceManager] §DIAG-IM-02 ` +
                `panelType=${panelType} instances=${entries.length} ` +
                `geo=${geoWasHit ? '(from cache)' : 'NEW BoxGeometry'} ` +
                `mat=${matWasHit ? '(from cache)' : 'NEW MeshStandardMaterial'} ` +
                `resolveMs=${(performance.now() - __t_geo).toFixed(2)}ms`
            );

            const instancedMesh = new THREE.InstancedMesh(geo, mat, entries.length);
            // §B.2 — Shadow defaults are false; CurtainWallBuilder.build() sets the
            // correct castShadow/receiveShadow based on the deferShadows flag immediately
            // after this method returns. Initialising to false prevents spurious per-wall
            // shadow map rebuilds if the mesh is added to the scene before the caller sets them.
            instancedMesh.castShadow = false;
            instancedMesh.receiveShadow = false;

            const instancePanelIds: string[] = [];

            entries.forEach(({ cell, panel }, index) => {
                const panelWidth = Math.max(0.01, cell.width - mullionSize);
                const panelHeight = Math.max(0.01, cell.height - mullionSize);

                const bl = cell.corners[0];
                const tr = cell.corners[2];
                const cx = (bl.x + tr.x) / 2;
                const cy = (bl.y + tr.y) / 2;

                dummy.position.set(cx, cy, 0);
                dummy.scale.set(panelWidth, panelHeight, 1);
                dummy.rotation.set(0, 0, 0);
                dummy.updateMatrix();

                instancedMesh.setMatrixAt(index, dummy.matrix);
                instancePanelIds.push(panel.id);
            });

            instancedMesh.instanceMatrix.needsUpdate = true;

            // §Step 6 — SelectionManager integration via instance index.
            // §B.1: sharedGeometry + sharedMaterial = true so _disposeChildren skips
            // disposal on rebuild — the cache owns these resources until disposeCache().
            instancedMesh.userData = {
                elementType: 'CurtainPanelInstanced',
                panelType,
                instancePanelIds,
                isSubElement: true,
                sharedGeometry: true,
                sharedMaterial: true,
            };

            instancedMeshes.push(instancedMesh);
        }

        const __im_total_ms = performance.now() - __t_im_start;
        console.log(
            `[CurtainWallInstanceManager] §DIAG-IM-03 buildInstancedMeshes DONE ` +
            `totalMs=${__im_total_ms.toFixed(1)}ms ` +
            `geoAllocs=${__im_geo_alloc_count} matAllocs=${__im_mat_alloc_count} ` +
            `instancedMeshes=${instancedMeshes.length} totalInstances=${instancedMeshes.reduce((s, m) => s + m.count, 0)}`
        );
        return { instancedMeshes, overridePanelIds };
    }
}
