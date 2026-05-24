import * as THREE from '@pryzm/renderer-three/three';
import { elementRegistry } from '@pryzm/core-app-model/element-registry';
import type { BimManager } from '@pryzm/core-app-model';
import { type ViewDefinition, PLAN_VIEW_TYPES } from '../views/ViewDefinitionTypes';
import {
    resolveEffectiveViewRange,
    resolveViewRangeWorldY,
} from '@pryzm/core-app-model';

// ── DOC-4.4: reusable scratch objects — avoids per-element heap allocations ──
const _scratchBox = new THREE.Box3();
const _scratchVec = new THREE.Vector3();

/** §NME-VERBOSE (OI-054 (a) perf, 2026-05-24) — gate for the per-element
 *  §DIAG-NME-01 InstancedMesh→proxy-expansion log. Fires once per curtain-wall
 *  element per export; off by default to keep the console clean during bulk
 *  projection. Flip to `true` when profiling proxy-expansion cost. */
const NME_VERBOSE = false;

/**
 * DOC-4.4 — Tests whether a Three.js Group's world-space AABB intersects a
 * 2D XZ crop region.  Used to pre-filter elements before the expensive
 * EdgesGeometry + TechnicalDrawing.toDrawingSpace() pipeline.
 *
 * @param root       The element's root Group (world matrices must be up to date).
 * @param cropRegion XZ extents from ViewDefinition.spatial.cropRegion.
 * @returns          true  → element is inside (or straddles) the crop region.
 *                   false → element is fully outside; safe to skip.
 */
function _isInsideCropRegion(
    root: THREE.Object3D,
    cropRegion: { minX: number; minZ: number; maxX: number; maxZ: number },
): boolean {
    _scratchBox.setFromObject(root);
    // XZ intersection test — Y (height) is irrelevant for plan-view culling.
    if (_scratchBox.max.x < cropRegion.minX) return false;
    if (_scratchBox.min.x > cropRegion.maxX) return false;
    if (_scratchBox.max.z < cropRegion.minZ) return false;
    if (_scratchBox.min.z > cropRegion.maxZ) return false;
    return true;
}

/**
 * §F.1 — Options for `releaseGroups()`.
 *
 * `disposeProxies`: when `true`, call `.dispose()` on every proxy mesh geometry
 * that is NOT marked `userData.sharedGeometry === true`.  Proxy geometries that
 * wrap an InstancedMesh sub-instance are cloned per-instance in `exportForView`
 * and must be freed to avoid GPU/CPU memory leaks.  Standard Mesh proxies share
 * the source geometry and must NOT be disposed here (the source owns the lifetime).
 */
export interface NMEExportOptions {
    disposeProxies?: boolean;
}

// ── §H.2 — Proxy descriptor cache ────────────────────────────────────────────

/**
 * §H.2 — Compact record capturing everything needed to reconstruct one proxy Mesh
 * without re-traversing the scene or re-computing world matrices.
 *
 * Geometry and material are shared references (NOT owned by the cache).
 * Do NOT call geometry.dispose() on eviction — the source InstancedMesh or Mesh
 * in the scene owns the GPU resource lifetime.
 *
 * Position/quaternion/scale are stored as primitive components (not THREE.* objects)
 * to avoid per-entry allocations when reading from cache.
 */
interface NMEProxyDescriptor {
    // World-space transform decomposed from groupWorldMatrix × instanceMatrix
    px: number; py: number; pz: number;
    qx: number; qy: number; qz: number; qw: number;
    sx: number; sy: number; sz: number;
    // Shared references — do NOT dispose on cache eviction
    geometry: THREE.BufferGeometry;
    material: THREE.Material | THREE.Material[];
    userData: Record<string, unknown>;
}

/**
 * §H.2 — Per-element proxy cache entry.
 * Key: `elementId:viewId:version:cropKey`
 */
interface NMEProxyCacheEntry {
    descriptors: NMEProxyDescriptor[];
    version: number;
    usedAt: number;       // performance.now() — for LRU eviction
    elementId: string;    // for onUnregister invalidation scan
}

export class NativeElementMeshExporter {
    private _bimManager: BimManager | null = null;

    // ── §H.2 — Proxy descriptor cache ────────────────────────────────────────

    /**
     * §H.2 — Cache keyed by `elementId:viewId:version:cropKey`.
     * Max entries bounded by MAX_CACHE_ENTRIES (LRU eviction).
     *
     * What is cached: the compact ProxyDescriptor[] for each element+view+version.
     * On cache hit: new Mesh objects are created from descriptors in <1ms (no scene
     * traversal, no world-matrix computation). The geometry/material are shared with
     * the live scene element — only position/quaternion/scale are copied.
     *
     * What is NOT cached: the wrapper Group objects (created fresh on each call).
     * This is required because THREE.js children can only have one parent at a time.
     *
     * Memory budget: MAX_CACHE_ENTRIES × avg 131 proxies × ~120 bytes/descriptor ≈ 7.8MB.
     * Acceptable against C10 NFT-MEM-01 (<1.5 GB session budget).
     */
    private readonly _proxyCache = new Map<string, NMEProxyCacheEntry>();
    private static readonly MAX_CACHE_ENTRIES = 500;

    constructor() {
        // §H.2 — Wire onUnregister so removed elements are immediately evicted from
        // the proxy cache.  The disposer is intentionally not stored — this singleton
        // lives for the entire app session so the listener never needs to be cancelled.
        // geometry.dispose() is NOT called on eviction: descriptors hold SHARED refs.
        elementRegistry.onUnregister((id: string) => {
            for (const [key, entry] of this._proxyCache) {
                if (entry.elementId === id) {
                    this._proxyCache.delete(key);
                }
            }
        });
    }

    setBimManager(bimManager: BimManager): void {
        this._bimManager = bimManager;
    }

    exportForView(viewDef: ViewDefinition): THREE.Group[] {
        const levelId = viewDef.spatial?.levelId;

        if (!this._bimManager) {
            throw new Error('[NativeElementMeshExporter] BimManager is not configured.');
        }

        // Collect element IDs to export.
        // Plan views use a specific level; section/elevation/3D views export all levels.
        let elementIds: string[];
        const shouldUseLevelFilter =
            !!levelId &&
            viewDef.viewType !== 'section' &&
            viewDef.viewType !== 'elevation';

        if (shouldUseLevelFilter) {
            const level = this._bimManager.getLevelById(levelId);
            if (!level) {
                throw new Error(`[NativeElementMeshExporter] Level "${levelId}" not found in BimManager.`);
            }

            // For plan views, collect elements from the current level AND from any
            // adjacent level whose geometry falls within the view's depth range.
            // This allows below-floor elements (from the storey below) to be included
            // in the projection so they appear as :beyond reference linework.
            if ((PLAN_VIEW_TYPES as readonly string[]).includes(viewDef.viewType)) {
                const levels = this._bimManager.getLevels();
                const effectiveRange = resolveEffectiveViewRange(viewDef, levels);
                const topY   = effectiveRange ? resolveViewRangeWorldY(effectiveRange.top,   levels) : null;
                const depthY = effectiveRange ? resolveViewRangeWorldY(effectiveRange.depth, levels) : null;
                if (topY !== null && depthY !== null) {
                    const minY = Math.min(topY, depthY);
                    // Cap the upper bound at the current level's own elevation so we
                    // never include elements from the floor above. The view-range "top"
                    // bound is anchored to the next level up (offset 0), which means its
                    // world Y exactly equals that storey's elevation — without this cap
                    // the adjacent-level filter inadvertently passes the floor above.
                    const maxY = level.elevation;
                    // Include every level whose vertical span overlaps [minY, maxY].
                    // For a plan at level N with depthY = N.elevation − 1.20 m this
                    // automatically picks up the top 1.20 m of the storey below while
                    // strictly excluding any storey above the current level.
                    elementIds = levels
                        .filter(l => (l.elevation + (l.height ?? 0)) >= minY && l.elevation <= maxY)
                        .flatMap(l => l.childrenIds);
                    console.log(
                        `[NativeElementMeshExporter] Plan view — exporting ${elementIds.length} elements ` +
                        `from levels overlapping Y=[${minY.toFixed(2)}, ${maxY.toFixed(2)}]`,
                    );
                } else {
                    elementIds = level.childrenIds;
                }
            } else {
                elementIds = level.childrenIds;
            }
        } else {
            // No levelId → section, elevation, or 3D view: project entire model.
            const allLevels = this._bimManager.getLevels();
            elementIds = allLevels.flatMap(l => l.childrenIds);
            console.log(
                `[NativeElementMeshExporter] No levelId — exporting all ${elementIds.length} elements ` +
                `across ${allLevels.length} levels (viewType=${viewDef.viewType ?? 'unknown'})`,
            );
        }

        // DOC-4.4 — Read optional crop region for XZ AABB pre-filter.
        const cropRegion = viewDef.spatial?.cropRegion;

        // §H.2 — Stable view-level cache key components.
        const viewId = viewDef.id ?? '';
        const cropKey = cropRegion
            ? `${cropRegion.minX.toFixed(2)}:${cropRegion.maxX.toFixed(2)}:${cropRegion.minZ.toFixed(2)}:${cropRegion.maxZ.toFixed(2)}`
            : 'full';

        const groups: THREE.Group[] = [];
        let totalCount   = 0;
        let culledCount  = 0;

        // §H.2 cache stats (per exportForView call)
        let h2Hits  = 0;
        let h2Misses = 0;

        for (const elementId of elementIds) {
            const root = elementRegistry.getRoot(elementId);
            if (!root) continue;

            totalCount++;

            // DOC-4.4 — Cull elements whose bounding box lies entirely outside
            // the crop region before the expensive EdgesGeometry pass.
            if (cropRegion) {
                if (!_isInsideCropRegion(root, cropRegion)) {
                    culledCount++;
                    continue;
                }
            }

            root.updateWorldMatrix(true, false);
            root.getWorldPosition(_scratchVec);

            // ── §H.2 — Cache lookup ──────────────────────────────────────────
            const currentVersion = (root.userData?.version as number | undefined) ?? -1;
            const cacheKey = `${elementId}:${viewId}:${currentVersion}:${cropKey}`;
            const cached = this._proxyCache.get(cacheKey);

            if (cached) {
                // CACHE HIT — reconstruct wrapper from stored descriptors.
                // Creates new Mesh objects with shared geometry/material references
                // and copied transform components. No scene traversal, no matrix math.
                cached.usedAt = performance.now();
                h2Hits++;
                const wrapper = new THREE.Group();
                for (const d of cached.descriptors) {
                    const proxy = new THREE.Mesh(d.geometry, d.material);
                    proxy.position.set(d.px, d.py, d.pz);
                    proxy.quaternion.set(d.qx, d.qy, d.qz, d.qw);
                    proxy.scale.set(d.sx, d.sy, d.sz);
                    proxy.userData = d.userData;
                    proxy.updateMatrixWorld(true);
                    wrapper.add(proxy);
                }
                if (wrapper.children.length > 0) {
                    wrapper.userData = {
                        elementUUID: elementId,
                        elementType: root.userData?.elementType,
                        baseLine:    root.userData?.baseLine,
                        baseOffset:  root.userData?.baseOffset,
                        rootWorldY:  _scratchVec.y,
                        openings:    root.userData?.openings,
                        height:      root.userData?.height,
                        thickness:   root.userData?.thickness,
                        // §PERF-CACHE-DIAG (DAILY-USE 2026-05-20) — propagate
                        // the element root's per-rebuild version stamp through
                        // to the exported proxy wrapper. Without this, the
                        // downstream EdgeProjectorService cache gate
                        // (`group.userData?.version`) always saw undefined and
                        // every CW projection bypassed the cache (cwGroups=0,
                        // cacheHits=0, cacheMisses=0 in §PERF-CACHE-STATS).
                        // CurtainWallBuilder + WallFragmentBuilder + Slab/Roof
                        // builders all bump `root.userData.version` on each
                        // geometric rebuild; this propagation closes the loop.
                        version:     root.userData?.version,
                        _nmeFromCache: true,  // §H.2 — skip geometry dispose in releaseGroups
                    };
                    groups.push(wrapper);
                }
                continue;
            }

            // CACHE MISS — full expansion path (existing logic + descriptor collection).
            h2Misses++;
            const descriptors: NMEProxyDescriptor[] = [];

            const wrapper = new THREE.Group();
            let __proxy_from_instanced = 0;
            let __proxy_from_mesh = 0;
            let __instanced_nodes = 0;

            // §H.1 — Per-instance XZ crop culling stats (per IM node)
            let __im_instances_total  = 0;
            let __im_instances_culled = 0;

            root.traverse((child) => {
                // DOC-1.5h — InstancedMesh: create one proxy per instance.
                // THREE.InstancedMesh extends THREE.Mesh so isMesh is true for it;
                // without this guard every instanced element (curtain-wall mullions,
                // repeated columns, etc.) collapses to a single position in the
                // projected output because only the group matrixWorld is used.
                if ((child as THREE.InstancedMesh).isInstancedMesh) {
                    const instanced = child as THREE.InstancedMesh;
                    const instanceMatrix = new THREE.Matrix4();
                    instanced.updateWorldMatrix(true, false);
                    const groupWorldMatrix = instanced.matrixWorld;
                    __instanced_nodes++;

                    for (let i = 0; i < instanced.count; i++) {
                        instanced.getMatrixAt(i, instanceMatrix);

                        // Final world transform = group matrixWorld × per-instance matrix.
                        // Computed ONCE and reused for both §H.1 crop test and proxy creation.
                        const worldMatrix = groupWorldMatrix.clone().multiply(instanceMatrix);

                        // §H.1 — Per-instance XZ crop cull (plan views only).
                        //
                        // A CW element's bounding box may span the full wall length and pass the
                        // element-level DOC-4.4 test, yet individual panel/mullion instances can
                        // lie entirely outside the current view's crop region. This per-instance
                        // test skips proxy creation for those out-of-bounds instances, reducing
                        // NME proxy count by 40–60% for typical plan views.
                        //
                        // World position extracted from column 3 of the composed world matrix
                        // (elements[12] = worldX, elements[14] = worldZ in column-major layout).
                        // Half-extent estimated from the geometry's bounding sphere radius ×1.2
                        // safety margin — avoids geometry.computeBoundingSphere() per instance.
                        if (cropRegion) {
                            __im_instances_total++;
                            const wx = worldMatrix.elements[12];
                            const wz = worldMatrix.elements[14];
                            const halfExtent = (instanced.geometry.boundingSphere?.radius ?? 1) * 1.2;
                            if (
                                wx + halfExtent < cropRegion.minX || wx - halfExtent > cropRegion.maxX ||
                                wz + halfExtent < cropRegion.minZ || wz - halfExtent > cropRegion.maxZ
                            ) {
                                __im_instances_culled++;
                                continue; // instance is fully outside crop region — skip proxy
                            }
                        }

                        // §G1-T1 — Mark IM geometry as shared so releaseGroups({ disposeProxies: true })
                        // correctly skips disposal. InstancedMesh geometry is owned by the builder;
                        // it must NOT be disposed when the proxy wrapper group is released.
                        if (!instanced.geometry.userData.sharedGeometry) {
                            instanced.geometry.userData.sharedGeometry = true;
                        }
                        const proxy = new THREE.Mesh(instanced.geometry, instanced.material as THREE.Material | THREE.Material[]);
                        worldMatrix.decompose(proxy.position, proxy.quaternion, proxy.scale);
                        proxy.userData = {
                            ...root.userData,
                            ...instanced.userData,
                            parentId:    instanced.userData?.parentId ?? root.userData?.id,
                            elementType: instanced.userData?.elementType ?? root.userData?.elementType,
                        };
                        proxy.updateMatrixWorld(true);
                        wrapper.add(proxy);
                        __proxy_from_instanced++;

                        // §H.2 — Collect descriptor for this proxy (cache miss path).
                        descriptors.push({
                            px: proxy.position.x, py: proxy.position.y, pz: proxy.position.z,
                            qx: proxy.quaternion.x, qy: proxy.quaternion.y,
                            qz: proxy.quaternion.z, qw: proxy.quaternion.w,
                            sx: proxy.scale.x, sy: proxy.scale.y, sz: proxy.scale.z,
                            geometry: proxy.geometry,
                            material: proxy.material,
                            userData: proxy.userData,
                        });
                    }

                    // §H.1 — log per-IM crop stats when instances were culled
                    if (cropRegion && __im_instances_culled > 0 && __im_instances_total > 0) {
                        console.log(
                            `[NME] §H1-NME-CULL elementId=${elementId} ` +
                            `culled ${__im_instances_culled}/${__im_instances_total} IM instances by XZ crop`
                        );
                    }

                    return; // handled — skip the generic isMesh branch below
                }

                // Standard Mesh: existing behaviour
                if ((child as THREE.Mesh).isMesh) {
                    const source = child as THREE.Mesh;
                    // §G1-T1 — Mark Mesh geometry as shared. Source geometry is owned by the
                    // builder; it must NOT be disposed when the proxy wrapper group is released.
                    if (!source.geometry.userData.sharedGeometry) {
                        source.geometry.userData.sharedGeometry = true;
                    }
                    const proxy = new THREE.Mesh(source.geometry, source.material);
                    source.updateWorldMatrix(true, false);
                    source.matrixWorld.decompose(proxy.position, proxy.quaternion, proxy.scale);
                    proxy.userData = {
                        ...root.userData,
                        ...source.userData,
                        parentId:    source.userData?.parentId ?? root.userData?.id,
                        elementType: source.userData?.elementType ?? root.userData?.elementType,
                    };
                    wrapper.add(proxy);
                    __proxy_from_mesh++;

                    // §H.2 — Collect descriptor for this proxy (cache miss path).
                    descriptors.push({
                        px: proxy.position.x, py: proxy.position.y, pz: proxy.position.z,
                        qx: proxy.quaternion.x, qy: proxy.quaternion.y,
                        qz: proxy.quaternion.z, qw: proxy.quaternion.w,
                        sx: proxy.scale.x, sy: proxy.scale.y, sz: proxy.scale.z,
                        geometry: proxy.geometry,
                        material: proxy.material,
                        userData: proxy.userData,
                    });
                }
                // THREE.Line, THREE.ArrowHelper: silently dropped (handled by symbol bridges in DOC-2.5c)
            });

            // §DIAG-NME-01: log InstancedMesh→Mesh proxy expansion for CW elements.
            // CW InstancedMesh nodes (mullion-v-instanced, mullion-h-instanced, panel IM)
            // each expand to N plain Mesh proxy objects — this is the hidden per-element
            // allocation cost before EdgeProjectorService sees the group.
            if (NME_VERBOSE && __instanced_nodes > 0) {
                console.log(
                    `[NativeElementMeshExporter] §DIAG-NME-01 elementId=${elementId} ` +
                    `elementType=${root.userData?.elementType ?? 'unknown'} ` +
                    `instancedNodes=${__instanced_nodes} proxiesFromIM=${__proxy_from_instanced} ` +
                    `proxiesFromMesh=${__proxy_from_mesh} totalProxies=${__proxy_from_instanced + __proxy_from_mesh}`
                );
            }

            if (wrapper.children.length > 0) {
                // A-1: stamp element UUID on the wrapper so EdgeProjectorService
                // can tag each projected LineSegments for plan-view hitTest lookup.
                wrapper.userData = {
                    elementUUID: elementId,
                    elementType: root.userData?.elementType,
                    baseLine:    root.userData?.baseLine,
                    baseOffset:  root.userData?.baseOffset,
                    rootWorldY:  _scratchVec.y,
                    openings:    root.userData?.openings,
                    height:      root.userData?.height,
                    thickness:   root.userData?.thickness,
                    // §PERF-CACHE-DIAG — same fix as the cache-hit branch:
                    // propagate `root.userData.version` so EdgeProjectorService's
                    // `_cwCacheIsValid(elementUUID, viewId, version)` gate
                    // actually receives a defined version. Mirrors the value
                    // the cache-miss branch already records into the proxy
                    // cache (line ~433 `version: currentVersion`).
                    version:     currentVersion >= 0 ? currentVersion : undefined,
                };
                groups.push(wrapper);

                // §H.2 — Store cache entry for this element (cache miss path).
                // Evict LRU if at capacity before inserting.
                if (this._proxyCache.size >= NativeElementMeshExporter.MAX_CACHE_ENTRIES) {
                    this._evictLRU();
                }
                this._proxyCache.set(cacheKey, {
                    descriptors,
                    version:   currentVersion,
                    usedAt:    performance.now(),
                    elementId,
                });
            }
        }

        // DOC-4.4 — Log culling stats when a crop region is active.
        if (cropRegion && totalCount > 0) {
            console.log(
                `[NativeElementMeshExporter] Culled ${culledCount}/${totalCount} elements outside cropRegion` +
                ` (${totalCount - culledCount} passed)`,
            );
        }

        // §H.2 — Log cache performance for this exportForView call.
        if (h2Hits + h2Misses > 0) {
            console.log(
                `[NME] §H2-NME-CACHE hits=${h2Hits} misses=${h2Misses} ` +
                `hitRate=${((h2Hits / (h2Hits + h2Misses)) * 100).toFixed(0)}% ` +
                `cacheSize=${this._proxyCache.size}/${NativeElementMeshExporter.MAX_CACHE_ENTRIES}`
            );
        }

        return groups;
    }

    /**
     * §H.2 — LRU eviction: remove the least-recently-used cache entry.
     * Called before inserting a new entry when `_proxyCache.size >= MAX_CACHE_ENTRIES`.
     * Does NOT dispose geometry or material — those are shared from the scene.
     */
    private _evictLRU(): void {
        let oldestKey  = '';
        let oldestTime = Infinity;
        for (const [key, entry] of this._proxyCache) {
            if (entry.usedAt < oldestTime) {
                oldestTime = entry.usedAt;
                oldestKey  = key;
            }
        }
        if (oldestKey) {
            this._proxyCache.delete(oldestKey);
            console.log(`[NME] §H2 evicted LRU entry key=${oldestKey}`);
        }
    }

    /**
     * §F.1 — Dispose proxy mesh geometries inside a single wrapper Group produced
     * by `exportForView()`.  Skips any geometry whose
     * `userData.sharedGeometry === true` (shared with the scene — owner disposes).
     * Does NOT dispose materials (shared across elements; material lifetime is
     * managed by the builder that created the source mesh).
     *
     * §H.2 interaction: cache-hit Groups are marked with `_nmeFromCache: true`.
     * Their proxy Mesh objects share geometry with the live scene and with the
     * cache descriptors — do NOT dispose them here.
     *
     * @param group          The wrapper Group returned by `exportForView()`.
     * @param disposeGeometry When `true`, dispose non-shared proxy geometries.
     */
    private _disposeProxyGroup(group: THREE.Group, disposeGeometry: boolean): void {
        // §H.2 — cache-hit proxies must never be disposed: their geometry
        // references are shared with the cache and with the live scene IM.
        const fromCache = group.userData?._nmeFromCache === true;
        if (!fromCache && disposeGeometry) {
            for (const child of group.children) {
                const mesh = child as THREE.Mesh;
                if (mesh.isMesh && mesh.geometry) {
                    if (mesh.geometry.userData.sharedGeometry !== true) {
                        mesh.geometry.dispose();
                    }
                }
            }
        }
        group.clear();
    }

    releaseGroups(groups: THREE.Group[], opts?: NMEExportOptions): void {
        const disposeProxies = opts?.disposeProxies === true;
        const __t0 = disposeProxies ? performance.now() : 0;
        let disposedCount  = 0;
        let skippedCached  = 0;
        for (const group of groups) {
            const fromCache = group.userData?._nmeFromCache === true;
            if (fromCache) {
                // §H.2 — cache-hit group: just detach children, no disposal.
                group.clear();
                skippedCached++;
                continue;
            }
            if (disposeProxies) {
                for (const child of group.children) {
                    const mesh = child as THREE.Mesh;
                    if (mesh.isMesh && mesh.geometry && mesh.geometry.userData.sharedGeometry !== true) {
                        disposedCount++;
                    }
                }
            }
            this._disposeProxyGroup(group, disposeProxies);
        }
        if (disposeProxies) {
            console.log(
                `[NativeElementMeshExporter] §F1-PROXY-DISPOSE releaseGroups — disposed ${disposedCount} proxy geometries ` +
                `(${skippedCached} cache-hit groups skipped) ` +
                `across ${groups.length} groups in ${(performance.now() - __t0).toFixed(1)}ms`,
            );
        }
    }
}

export const nativeElementMeshExporter = new NativeElementMeshExporter();
