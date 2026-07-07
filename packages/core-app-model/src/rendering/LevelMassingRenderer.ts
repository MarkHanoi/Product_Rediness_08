/**
 * @file packages/core-app-model/src/rendering/LevelMassingRenderer.ts
 *
 * LevelMassingRenderer — §FIX-HEAVY-SCENE-MASSING-LOD (L-150).
 *
 * ## Why this exists
 *
 * {@link LevelScoped3DCullingService} (L-139) keeps the WebGPU device alive on a
 * large tower by scoping full-detail BIM geometry to the active level ± N and
 * HIDING every other storey. That shipped the culling half of the L-139 design
 * but not the "+ massing LOD for the rest" half: on the founder's 40-storey
 * circular "Paris" tower (1238 elems) only ~3 storeys rendered — the other 37
 * were invisible, so the user could not see their whole building (L-150).
 *
 * This renderer completes that design. For every OUT-OF-SCOPE level it draws a
 * single lightweight MASSING block — one instanced unit box scaled to that
 * level's world-space bounding box — so the FULL building silhouette is always
 * visible while full-detail BIM stays limited to the active level ± N. It is the
 * WebGPU-view analogue of the A.24 Massing tier (simplified blocks), not a new
 * renderer: it reuses the existing {@link InstanceGroup} instancing machinery so
 * ALL out-of-scope levels collapse to ONE draw call.
 *
 * ## Device-loss safety (the whole point of L-139) is preserved
 *
 * The far levels' FULL geometry is never submitted to the GPU — the culling
 * service still sets `visible=false` on those roots; this renderer only reads
 * their (CPU-side) bounding boxes to size the massing blocks. The massing mesh
 * adds exactly ONE draw call + ONE material/PSO for the entire out-of-scope
 * stack, casts NO shadows (`castShadow=false` — it must not re-inflate the
 * shadow-caster budget that L-139 cut), and is a `userData.isHelper` object so
 * the culling / frustum / element-count passes all skip it.
 *
 * ## Lifecycle
 *
 *   setScene(scene)                       — once, from initScene.
 *   syncMassing([{levelId, roots}, …])    — (re)build the massing blocks for the
 *                                            given out-of-scope levels. Idempotent;
 *                                            adds new levels, updates changed ones,
 *                                            removes levels no longer massed.
 *   clear()                               — remove + dispose all massing GPU state
 *                                            (stand-down / mode change / project close).
 *
 * Contract compliance:
 *   P2 — THREE only via '@pryzm/renderer-three/three' (same facade every sibling
 *        rendering service uses; the sole `import * as THREE from 'three'` remains
 *        in packages/renderer-three). Reuses InstanceGroup, which lives here in
 *        core-app-model — renderer-three is a LOWER layer and cannot import it.
 *   P3 — no requestAnimationFrame; no animation loop.
 *   P7 — a VIEW/LOD representation only; never reads or mutates any store.
 *   P8 — the public syncMassing / clear paths carry an OpenTelemetry span.
 *   §01-BIM-ENGINE-CORE §5 — projection-layer service; no store reads/mutations.
 */

import * as THREE from '@pryzm/renderer-three/three';
import { trace, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import { InstanceGroup } from './InstanceGroup.js';
import { perfLog } from './perfTrace.js';

const TRACER = trace.getTracer('@pryzm/core-app-model/level-massing-renderer', '0.1.0');

function withSpan<T>(verb: string, attrs: Attributes, fn: () => T): T {
    const span = TRACER.startSpan(`pryzm.level-massing.${verb}`, { attributes: attrs });
    try {
        const out = fn();
        span.setStatus({ code: SpanStatusCode.OK });
        return out;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute('error', true);
        throw err;
    } finally {
        span.end();
    }
}

/** The scene name of the shared massing InstancedMesh (one for the whole stack). */
export const LEVEL_MASSING_MESH_NAME = '__pryzmLevelMassing';

/** Below this world extent a level's bounding box is treated as degenerate (skipped). */
const MIN_MASSING_EXTENT = 1e-3;

/**
 * One out-of-scope level's contribution to the massing LOD: the level id (used as
 * the stable instance key) plus the scene roots whose union world-AABB defines the
 * block. Roots may be hidden (`visible=false`) — a Box3 union ignores visibility,
 * which is exactly what we want (the block represents the whole floor's footprint).
 */
export interface LevelMassingGroup {
    readonly levelId: string;
    readonly roots: readonly THREE.Object3D[];
}

/**
 * Renders out-of-scope levels as lightweight massing blocks (one instanced box per
 * level) so a large building's full silhouette stays visible while full-detail BIM
 * is scoped to the active level. Reuses {@link InstanceGroup}: all levels share one
 * unit-box geometry + one material → ONE draw call for the entire stack.
 */
export class LevelMassingRenderer {
    private _scene: THREE.Scene | null = null;

    /** The single shared instance group (one unit box, one material, N levels). */
    private _group: InstanceGroup | null = null;
    private _material: THREE.MeshStandardMaterial | null = null;

    /** levelId → last massed { rootCount, matrix } so unchanged levels skip AABB recompute. */
    private readonly _cache = new Map<string, { rootCount: number; matrix: THREE.Matrix4 }>();

    /** Level ids currently represented as a massing block. */
    private readonly _levelIds = new Set<string>();

    // ── Scene injection ───────────────────────────────────────────────────────

    /** Inject the Three.js scene. Call once before syncMassing(). */
    setScene(scene: THREE.Scene): void {
        this._scene = scene;
    }

    /** Number of levels currently drawn as massing blocks. */
    get levelCount(): number {
        return this._levelIds.size;
    }

    /** True when at least one massing block is live. */
    get isActive(): boolean {
        return this._group !== null && this._levelIds.size > 0;
    }

    // ── Core API ──────────────────────────────────────────────────────────────

    /**
     * (Re)build the massing LOD for the supplied out-of-scope levels.
     *
     * Idempotent: existing levels are updated in place (O(1) matrix write),
     * newly out-of-scope levels are added, and levels no longer supplied are
     * removed. Empty / degenerate levels are skipped.
     *
     * P8: `pryzm.level-massing.sync` span.
     */
    syncMassing(groups: readonly LevelMassingGroup[]): void {
        withSpan('sync', { 'pryzm.massing.groups': groups.length }, () => this._syncImpl(groups));
    }

    private _syncImpl(groups: readonly LevelMassingGroup[]): void {
        const group = this._ensureGroup();
        if (!group) return;

        const desired = new Set<string>();
        const box = new THREE.Box3();
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        const identity = new THREE.Quaternion();
        let added = 0;
        let updated = 0;

        for (const g of groups) {
            if (g.roots.length === 0) continue;

            const cached = this._cache.get(g.levelId);
            let matrix: THREE.Matrix4;

            if (cached && cached.rootCount === g.roots.length) {
                // Same roots as last derive at this level → reuse the block matrix.
                matrix = cached.matrix;
            } else {
                box.makeEmpty();
                for (const root of g.roots) {
                    // Ensure world matrices are current (a test / freshly-built scene
                    // may not have run a render pass yet). Cheap: only out-of-scope
                    // levels, only on level/geometry change — never per frame (P3).
                    root.updateWorldMatrix(true, true);
                    box.expandByObject(root);
                }
                if (box.isEmpty()) continue;
                box.getSize(size);
                box.getCenter(center);
                if (size.x < MIN_MASSING_EXTENT || size.y < MIN_MASSING_EXTENT || size.z < MIN_MASSING_EXTENT) {
                    continue; // degenerate footprint — nothing meaningful to mass
                }
                matrix = new THREE.Matrix4().compose(center.clone(), identity, size.clone());
                this._cache.set(g.levelId, { rootCount: g.roots.length, matrix });
            }

            const slot = group.addInstance(g.levelId, matrix);
            if (slot >= 0) {
                if (this._levelIds.has(g.levelId)) updated++; else added++;
                desired.add(g.levelId);
            }
        }

        // Retire levels that are no longer out of scope (scrolled back into detail).
        let removed = 0;
        for (const id of this._levelIds) {
            if (!desired.has(id)) {
                group.removeInstance(id);
                this._cache.delete(id);
                removed++;
            }
        }

        this._levelIds.clear();
        for (const id of desired) this._levelIds.add(id);

        perfLog(
            '§FIX-HEAVY-SCENE-MASSING-LOD',
            `massing LOD synced: levels=${this._levelIds.size} (+${added}/-${removed}, ~${updated} updated) ` +
            `drawCalls=${this._levelIds.size > 0 ? 1 : 0} (one instanced block mesh)`,
        );
    }

    /**
     * Remove all massing blocks and dispose their GPU state.
     *
     * P8: `pryzm.level-massing.clear` span.
     */
    clear(): void {
        withSpan('clear', {}, () => this._clearImpl());
    }

    private _clearImpl(): void {
        if (this._group) {
            if (this._scene) this._scene.remove(this._group.mesh);
            // InstanceGroup.dispose() frees the shared unit-box geometry; the material
            // is shared/owned here, so we dispose it explicitly.
            this._group.dispose();
            this._material?.dispose();
        }
        this._group = null;
        this._material = null;
        this._levelIds.clear();
        this._cache.clear();
    }

    // ── Internal ──────────────────────────────────────────────────────────────

    private _ensureGroup(): InstanceGroup | null {
        if (!this._scene) return null;
        if (this._group) return this._group;

        // One unit box shared by every level's block, scaled per-instance by matrix.
        const unitBox = new THREE.BoxGeometry(1, 1, 1);

        // A single flat massing material → one PSO for the entire out-of-scope stack.
        // Light neutral tone + slight translucency so the LOD reads as "massing", not
        // real BIM. Opaque enough to give the tower a solid silhouette.
        this._material = new THREE.MeshStandardMaterial({
            color: 0xc3c8d4,
            roughness: 0.9,
            metalness: 0.0,
            transparent: true,
            opacity: 0.9,
            depthWrite: true,
        });
        this._material.name = 'pryzm-level-massing';

        const group = new InstanceGroup(unitBox, this._material);
        const mesh = group.mesh;
        mesh.name = LEVEL_MASSING_MESH_NAME;
        // Device-loss safety: massing must NOT re-inflate the shadow-caster budget
        // that L-139 cut. No shadows, cast or received.
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        // One mesh spanning the whole tower; frustum-culling a full-height stack by a
        // single sphere is counter-productive (it either always passes or wrongly
        // culls). Keep it always drawn — it is a single cheap draw call.
        mesh.frustumCulled = false;
        // Mark as a helper so LevelScoped3DCullingService / FrustumCullingService /
        // element-count passes all skip it (they `continue` on userData.isHelper).
        mesh.userData.isHelper = true;
        mesh.userData.isMassingLod = true;

        this._scene.add(mesh);
        this._group = group;
        return group;
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Global LevelMassingRenderer singleton, driven by LevelScoped3DCullingService.
 * initScene calls `levelMassingRenderer.setScene(world.scene.three)` via the
 * culling service's setScene (which fans out to this renderer).
 */
export const levelMassingRenderer = new LevelMassingRenderer();
