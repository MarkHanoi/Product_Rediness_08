/**
 * @file src/core/rendering/FrustumCullingService.ts
 *
 * FrustumCullingService — conservative GPU-side frustum culling for large models.
 *
 * ## Purpose (Phase 4 — Task 4.4)
 *
 * `THREE.Object3D.frustumCulled = true` is the Three.js default, but several
 * PRYZM element builders set `frustumCulled = false` on entire group hierarchies
 * to work around bounding sphere miscalculations during incremental geometry
 * updates. For small models this is acceptable; for models with >500 elements
 * it causes the GPU to submit draw calls for off-screen geometry, wasting fill
 * rate and bandwidth.
 *
 * FrustumCullingService:
 *
 *   1. Monitors the scene element count via DOM events.
 *   2. When element count exceeds `LARGE_MODEL_THRESHOLD`, audits all BIM
 *      element groups and re-enables `frustumCulled = true` on their meshes,
 *      after ensuring bounding spheres are correct via `computeBoundingSphere()`.
 *   3. Provides `forceEnabled()` for manual activation regardless of count.
 *   4. Never touches the OBC grid, helper, or preview objects.
 *
 * ## Contract compliance
 *
 *   01-BIM-ENGINE-CORE §5 — No store mutations; Three.js-only side effects.
 *   02-BIM-SPATIAL-PROJECTION §8 — GPU optimisations in the rendering layer.
 *
 * Phase 4 Performance — Task 4.4.
 *
 * ## MODIFICATION DECLARATION — PERF-AUDIT-2026 P5: WeakSet skip-set
 *
 * Layer Affected:    Rendering Service (FrustumCullingService)
 * Phase:             PERF-AUDIT-2026 P5
 * Classification:    B (performance — no semantic model changes)
 *
 * Impact Assessment:
 *   BEFORE: _runAudit() called computeBoundingSphere() on every mesh in the
 *   scene on every audit, even for geometries that already had valid spheres.
 *   For a 300-wall model (4-8 mesh segments each) this was 1,200–2,400 vertex
 *   scans per audit trigger. The 500 ms debounce reset on every bim-*-added
 *   event meant the audit fired right as the user started interacting.
 *
 *   AFTER:
 *   1. WeakSet<THREE.BufferGeometry> tracks geometries whose bounds are already
 *      known-valid. computeBoundingSphere() is skipped for them — O(new only).
 *   2. Debounce increased from 500 ms to 1500 ms so bulk creation (44 walls)
 *      drains completely before the audit fires.
 *   3. invalidateBoundsCache() allows builders to signal that a specific mesh's
 *      geometry was rebuilt (so its WeakSet entry is cleared).
 *
 * Risk Level: Low — WeakSet entries auto-expire when geometry is GC'd (no leak).
 */

import * as THREE from '@pryzm/renderer-three/three';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Apply conservative frustum culling once the scene has more than N elements. */
const LARGE_MODEL_THRESHOLD = 500;

/**
 * Rebuild bounding spheres + re-enable culling at most once every N ms.
 *
 * PERF-AUDIT-2026 P5: Increased from 500 ms to 1500 ms.
 * Rationale: a 44-wall batch fires 44 bim-wall-added events. At 500 ms each
 * event resets the timer — the audit fires 500 ms after the LAST wall, right
 * as the user begins interacting.  At 1500 ms the audit drains comfortably
 * after bulk operations complete with no perceptible delay for the user.
 */
const DEBOUNCE_MS = 1500;

// ── FrustumCullingService ─────────────────────────────────────────────────────

export class FrustumCullingService {

    private _scene: THREE.Scene | null = null;
    private _active = false;

    /** Timer handle for debounced rebuild. */
    private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

    /**
     * PERF-AUDIT-2026 P5: WeakSet skip-set for already-validated bounding spheres.
     *
     * Populated by _runAudit() for every geometry whose bounding sphere was
     * confirmed valid (radius > 0, no NaN). On subsequent audits, geometries in
     * this set are skipped — computeBoundingSphere() is only called for NEW
     * geometry added since the last audit.
     *
     * WeakSet is used so entries auto-expire when a geometry object is GC'd
     * (e.g. after dispose()) — no manual invalidation required for the common
     * case. Call invalidateBoundsCache(geo) when a builder explicitly replaces
     * geometry on an existing mesh.
     */
    private _validBoundsCache = new WeakSet<THREE.BufferGeometry>();

    private static readonly TRIGGERING_EVENTS = [
        'model-updated',
        'ai-model-update',
        'project-loaded',
        // Note: 'pryzm-project-loaded' is intentionally NOT listed here.
        // It is registered separately in activate() with an empty-project guard
        // (Contract 20 §7.3 / GAP-3): when detail.empty is true there are no
        // elements to audit and scheduling the audit wastes a debounce cycle.
        'bim-wall-added',    'bim-slab-added',    'bim-ceiling-added',
        'bim-floor-added',   'bim-column-added',  'bim-beam-added',
        'bim-roof-added',    'bim-stair-added',   'bim-curtainwall-added',
        'bim-furniture-added',
    ] as const;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Inject the Three.js scene. Call once from initScene after the world is ready.
     */
    setScene(scene: THREE.Scene): void {
        this._scene = scene;
    }

    /**
     * Activate the service. Registers DOM event listeners that trigger a
     * debounced audit whenever geometry is added or the project is loaded.
     *
     * Safe to call multiple times — listeners are only registered once.
     */
    activate(): void {
        if (this._active) return;
        this._active = true;

        for (const name of FrustumCullingService.TRIGGERING_EVENTS) {
            window.addEventListener(name, () => this._scheduleAudit());
        }

        // pryzm-project-loaded is handled separately from TRIGGERING_EVENTS so
        // we can inspect detail.empty (Contract 20 §7.3 / GAP-3 fix).
        // When empty:true the project is brand-new with no geometry — auditing
        // zero meshes is a no-op, so we skip the debounce cycle entirely.
        window.addEventListener('pryzm-project-loaded', (e) => {
            const detail = (e as CustomEvent).detail ?? {};
            if (detail.empty) {
                console.log('[FrustumCullingService] pryzm-project-loaded(empty) — audit skipped, no geometry');
                return;
            }
            this._scheduleAudit();
        });

        console.log('[FrustumCullingService] Active — large-model threshold: ' +
            `${LARGE_MODEL_THRESHOLD} elements.`);
    }

    /**
     * Force-enable conservative frustum culling on all current BIM element
     * meshes immediately, regardless of element count.
     * Useful for export renders where off-screen geometry is guaranteed useless.
     */
    forceEnable(): void {
        this._runAudit(true);
    }

    /**
     * PERF-AUDIT-2026 P5: Remove a geometry from the valid-bounds WeakSet.
     *
     * Call this when a builder replaces the geometry buffer on an existing mesh
     * (e.g. WallFragmentBuilder rebuilds a wall that has new openings).
     * The next audit will recompute the bounding sphere for this geometry.
     *
     * @param geo  The BufferGeometry whose bounds should be re-validated.
     */
    invalidateBoundsCache(geo: THREE.BufferGeometry): void {
        this._validBoundsCache.delete(geo);
    }

    /**
     * Returns the number of top-level BIM element groups in the scene.
     * Does not trigger a scene traverse — counts direct children only.
     */
    getElementCount(): number {
        if (!this._scene) return 0;
        let count = 0;
        for (const child of this._scene.children) {
            if (!child.userData?.id) continue;
            if (child.userData?.isPreview === true) continue;
            if (child.userData?.isHelper === true) continue;
            count++;
        }
        return count;
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private _hasValidBoundingSphere(geo: THREE.BufferGeometry): boolean {
        const bs = geo.boundingSphere;
        return !!bs
            && bs.radius > 0
            && Number.isFinite(bs.radius)
            && Number.isFinite(bs.center.x)
            && Number.isFinite(bs.center.y)
            && Number.isFinite(bs.center.z);
    }

    private _scheduleAudit(): void {
        if (this._debounceTimer !== null) {
            clearTimeout(this._debounceTimer);
        }
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            this._runAudit(false);
        }, DEBOUNCE_MS);
    }

    private _runAudit(force: boolean): void {
        if (!this._scene) return;

        const count = this.getElementCount();
        if (!force && count < LARGE_MODEL_THRESHOLD) return;

        let meshCount = 0;
        let fixedCount = 0;
        let skippedCount = 0;
        let unsafeCount = 0;

        for (const child of this._scene.children) {
            if (!child.userData?.id) continue;
            if (child.userData?.isPreview === true) continue;
            if (child.userData?.isHelper === true) continue;

            // Walk the group hierarchy and fix frustumCulled on each Mesh.
            child.traverse((obj) => {
                if (!(obj instanceof THREE.Mesh)) return;
                meshCount++;

                // ── PERF-AUDIT-2026 P5: WeakSet skip-set ───────────────────
                // Skip geometries already confirmed valid in a prior audit.
                // WeakSet entries auto-expire when geometry is GC'd (no leak).
                if (obj.geometry) {
                    const geometry = obj.geometry;
                    if (this._validBoundsCache.has(geometry) && this._hasValidBoundingSphere(geometry)) {
                        // Already validated — skip computeBoundingSphere().
                        skippedCount++;
                    } else {
                        this._validBoundsCache.delete(geometry);
                        if (!this._hasValidBoundingSphere(geometry)) {
                            geometry.computeBoundingSphere();
                            fixedCount++;
                        }
                        if (this._hasValidBoundingSphere(geometry)) {
                            this._validBoundsCache.add(geometry);
                        } else {
                            obj.frustumCulled = false;
                            unsafeCount++;
                            return;
                        }
                    }
                }
                // ── End PERF-AUDIT-2026 P5 ──────────────────────────────────

                // Re-enable frustum culling if it was disabled.
                if (!obj.frustumCulled && obj.geometry && this._hasValidBoundingSphere(obj.geometry)) {
                    obj.frustumCulled = true;
                }
            });
        }

        console.log(
            `[FrustumCullingService] Audit complete — ` +
            `${count} element(s), ${meshCount} mesh(es), ` +
            `${fixedCount} sphere(s) recomputed, ${skippedCount} skipped (cached), ` +
            `${unsafeCount} left uncullable.`,
        );
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Global FrustumCullingService singleton.
 *
 * initScene calls:
 *   frustumCullingService.setScene(world.scene.three as THREE.Scene);
 *   frustumCullingService.activate();
 */
export const frustumCullingService = new FrustumCullingService();
