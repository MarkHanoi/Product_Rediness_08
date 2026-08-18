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

/**
 * The shape of one master-library entry, structurally identical to the map
 * `CurtainWallBuilder` already accepts for mullions
 * (`CurtainWallBuilderDependencies.materialMap`). Declared structurally rather than
 * imported from `@pryzm/core-app-model/material-library` so this geometry module keeps
 * its current dependency set — the projection it describes is C100's, not a rival
 * vocabulary.
 */
export interface PanelMaterialDef {
    params?: Record<string, unknown>;
    textures?: { color?: unknown; normal?: unknown; roughness?: unknown };
}

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
     * §B.1 / §INSTANCE-MAT-SHARE (L-312B) — Panel material cache.
     * Key: `${panelType}:${color}:${opacity.toFixed(3)}` — material-defining props ONLY.
     * Value: MeshStandardMaterial with the panel type's canonical defaults.
     *
     * Stamped with mat.userData.sharedMaterial = true so CurtainWallBuilder._disposeChildren
     * skips disposal on wall rebuild. Cache owns the materials until disposeCache() runs.
     *
     * §L-312B ROOT-CAUSE FIX (PSO compile storm):
     *   The key MUST NOT include `panelThickness`. Thickness is a GEOMETRY property
     *   (it sizes the unit BoxGeometry's Z depth) and has ZERO effect on the compiled
     *   material / shader / GPU pipeline-state-object (PSO). Two glass panels of
     *   thickness 0.02 and 0.0201 are byte-identical materials that compile to the
     *   SAME PSO. Embedding thickness in the material key fragmented the cache across
     *   every wall whose thickness differed by even float noise, minting one fresh
     *   material (⇒ one fresh PSO compile) PER curtain wall — a facade of thousands of
     *   panels compiled thousands of near-identical pipelines in one flush and the
     *   WebGPU device was lost (memory webgpu-heavy-scene-crash-and-instancing).
     *   Keyed purely on the material-defining props (all derived from panelType),
     *   ALL same-type panels across ALL walls now share ONE material ⇒ ONE PSO.
     *   Geometry legitimately stays thickness-keyed in {@link _panelGeoCache}; geometry
     *   size variation does NOT trigger a PSO recompile (same vertex-attribute layout +
     *   same material = same pipeline), so the storm is eliminated.
     *
     * Previous: 588 fresh MeshStandardMaterial allocations per 294-wall batch, and
     *           one fresh material PER wall whenever panelThickness varied.
     * After:    one allocation per distinct panelType, shared across ALL walls and
     *           ALL thicknesses in the batch.
     */
    private readonly _panelMatCache = new Map<string, THREE.MeshStandardMaterial>();

    /**
     * §FEAT-CURTAIN-WALL-PANEL-MATERIAL (L-958 Slice B) — the master material library,
     * injected by `CurtainWallBuilder` from its own `_deps.materialMap`.
     *
     * THIS IS THE WHOLE FIX. The panel path was never missing the material ID — the
     * panels array already carried whatever was on the record. What it was missing was a
     * RESOLVER: `_getPanelMaterial` took `panelType` and nothing else, so no material
     * reference could survive the last hop no matter what any bridge forwarded. The
     * mullion half has resolved ids against this exact map since §MAT-CW-MATERIAL (#53)
     * and works today; that working half is the proof the mechanism is sound, so it is
     * REUSED rather than re-invented (C84 EI-9 — one answer per question).
     *
     * Constructor-injected rather than set through a setter deliberately: a setter can be
     * forgotten by a future call site and the failure is SILENT — every panel quietly
     * renders its panelType default, indistinguishable from "the feature isn't wired
     * yet". Undefined is a legitimate value (headless tests, any host without the
     * renderer library) and simply means panels fall back to PANEL_TYPE_DEFAULTS, i.e.
     * exactly the behaviour that shipped before this field existed.
     */
    private readonly _materialMap?: ReadonlyMap<string, PanelMaterialDef>;

    constructor(materialMap?: ReadonlyMap<string, PanelMaterialDef>) {
        this._materialMap = materialMap;
    }

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
     * §B.1.2 / §INSTANCE-MAT-SHARE (L-312B) — Resolve a MeshStandardMaterial from the cache.
     *
     * Key is `${panelType}:${color}:${opacity.toFixed(3)}` — each canonical panel type
     * has fixed defaults from PANEL_TYPE_DEFAULTS, so the type alone encodes all
     * material properties. Including color and opacity guards against future per-type
     * overrides without requiring a cache key change.
     *
     * §L-312B — the key deliberately EXCLUDES panelThickness. Thickness sizes the
     * geometry, not the material/shader/PSO; embedding it fragmented this cache and
     * caused a PSO compile storm on heavy facades (see {@link _panelMatCache}).
     * Callers MUST stamp instancedMesh.userData.sharedMaterial = true so
     * _disposeChildren does not free the cache-owned material on rebuild.
     *
     * The cache OWNS every material it mints (C13 isolation): materials live until
     * {@link disposeCache} runs on builder teardown / project switch — never disposed
     * per-wall, because a single shared material backs many walls.
     */
    private _panelMaterialKey(panelType: PanelType, materialId?: string): string {
        // §FEAT-CURTAIN-WALL-PANEL-MATERIAL (L-958 Slice B) — a resolved material is keyed
        // by its ID ALONE, never folded together with the panel type. Two panels that
        // resolve `stone-marble-carrara` are the same PSO whether one is nominally Glass
        // and the other Opaque, so sharing the entry is correct and keeps the §L-312B
        // one-PSO-per-appearance property intact. Prefixed so a material id can never
        // collide with a panelType-derived key.
        if (materialId && this._materialMap?.has(materialId)) return `mat:${materialId}`;
        const defaults = PANEL_TYPE_DEFAULTS[panelType];
        const colorStr = typeof defaults.color === 'number'
            ? defaults.color.toString(16).padStart(6, '0')
            : String(defaults.color);
        return `${panelType}:${colorStr}:${defaults.opacity.toFixed(3)}`;
    }

    /**
     * THE LAYER THAT DECIDES WHAT COLOUR A PANEL IS.
     *
     * Until L-958 Slice B its entire input was `PANEL_TYPE_DEFAULTS[panelType]`, which is
     * why no per-panel or per-wall material reference could reach a rendered panel — a
     * signature-level impossibility, not a missing field on some payload. It now resolves
     * `materialId` against the injected master library FIRST, exactly as
     * `CurtainWallBuilder._getMullionMaterial` has always done for the frame.
     *
     * ⚠ NO GLASS INVARIANTS ARE FORCED HERE, and that is the difference from
     * `_getFallbackPanelMaterial`, which re-asserts `transparent` + DoubleSide because it
     * only ever renders glazing. A panel may now be marble, precast concrete or glazed
     * ceramic; forcing transparency would make every stone panel a ghost. Opacity comes
     * from the catalogue row (C100 carries `transparent`/`opacity` per material) and
     * `side` follows from it — the same rule the panelType path already used.
     *
     * A MISS FALLS THROUGH, it does not fail: an id absent from the library renders the
     * panel type's default rather than black, invisible, or an exception mid-frame.
     */
    private _getPanelMaterial(panelType: PanelType, materialId?: string): THREE.MeshStandardMaterial {
        const key = this._panelMaterialKey(panelType, materialId);
        const cached = this._panelMatCache.get(key);
        if (cached) return cached;

        let mat: THREE.MeshStandardMaterial;
        const matDef = materialId ? this._materialMap?.get(materialId) : undefined;
        if (matDef) {
            const params: Record<string, unknown> = { ...(matDef.params ?? {}) };
            if (matDef.textures) {
                params.map = matDef.textures.color;
                params.normalMap = matDef.textures.normal;
                params.roughnessMap = matDef.textures.roughness;
            }
            // Both faces only when the resolved material is actually see-through.
            params.side = params.transparent ? THREE.DoubleSide : THREE.FrontSide;
            mat = new THREE.MeshStandardMaterial(
                params as ConstructorParameters<typeof THREE.MeshStandardMaterial>[0],
            );
        } else {
            const defaults = PANEL_TYPE_DEFAULTS[panelType];
            mat = new THREE.MeshStandardMaterial({
                color: defaults.color,
                transparent: defaults.transparent,
                opacity: defaults.opacity,
                metalness: defaults.metalness,
                roughness: defaults.roughness,
                side: defaults.transparent ? THREE.DoubleSide : THREE.FrontSide,
            });
        }
        mat.userData.sharedMaterial = true;
        this._panelMatCache.set(key, mat);
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

        // Group batchable panels by (panelType, materialId).
        //
        // §FEAT-CURTAIN-WALL-PANEL-MATERIAL (L-958 Slice B) — the grouping key gained the
        // material id. Grouping by panelType ALONE would put a marble spandrel and a
        // glazed vision panel into one InstancedMesh, which shares a single material by
        // construction — so the first panel's appearance would silently win for the whole
        // group. That is the failure this change exists to prevent, and it would have
        // looked exactly like the bug being fixed: materials set, nothing renders.
        //
        // A facade that uses one material still produces ONE group, so the common case
        // costs nothing; groups multiply only where the facade genuinely varies.
        interface PanelGroup {
            panelType: PanelType;
            materialId?: string;
            entries: Array<{ cell: CurtainCell; panel: CurtainPanelData }>;
        }
        const byType = new Map<string, PanelGroup>();

        for (const panel of batchable) {
            const cell = cells.find(c => c.i === panel.cellIndex[0] && c.j === panel.cellIndex[1]);
            if (!cell) continue; // Cell was removed (grid change in flight)

            // The RENDER key, not the authored one: two ids that both MISS the library
            // resolve to the same panelType default, so they belong in one group. Keying
            // on the raw id would split a group that renders identically.
            const groupKey = `${panel.panelType}::${this._panelMaterialKey(panel.panelType, panel.materialId)}`;
            let group = byType.get(groupKey);
            if (!group) {
                group = { panelType: panel.panelType, materialId: panel.materialId, entries: [] };
                byType.set(groupKey, group);
            }
            group.entries.push({ cell, panel });
        }

        // §DIAG-IM-01: log type distribution so we can track per-panel-type geometry allocation cost
        if (byType.size > 0 || overridePanelIds.length > 0) {
            const typeBreakdown = Array.from(byType.values())
                .map(g => `${g.panelType}${g.materialId ? '/' + g.materialId : ''}:${g.entries.length}`)
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

        for (const { panelType, materialId, entries } of byType.values()) {
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

            // §L-312B — material key is panelType-derived ONLY (no thickness), so the
            // material (and its PSO) is shared across every wall of this panel type.
            const matWasHit = this._panelMatCache.has(this._panelMaterialKey(panelType, materialId));
            const mat = this._getPanelMaterial(panelType, materialId);
            if (!matWasHit) {
                __im_mat_alloc_count++;
            }

            console.log(
                `[CurtainWallInstanceManager] §DIAG-IM-02 ` +
                `panelType=${panelType}${materialId ? ' materialId=' + materialId : ''} instances=${entries.length} ` +
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
                // §FEAT-CURTAIN-WALL-PANEL-MATERIAL (L-958) — stamped so a picked panel
                // can report the material it actually rendered with, not the one someone
                // assumes from its panelType.
                materialId,
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
