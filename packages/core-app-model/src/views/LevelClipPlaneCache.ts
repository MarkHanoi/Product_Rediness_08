import * as THREE from '@pryzm/renderer-three/three';

/**
 * LevelClipPlaneCache — pre-computed renderer-level clipping planes per BIM level.
 *
 * PROBLEM SOLVED:
 * The previous implementation used `OBC.Clipper.create(world)` to create a
 * clipping plane object and set `renderer.localClippingEnabled = true` on every
 * plan view activation. This triggers TWO expensive GPU-side operations:
 *
 *   1. OBC Clipper allocates geometry + GPU buffers (50–300ms per switch)
 *   2. `localClippingEnabled = true` forces EVERY material in the scene to
 *      recompile its GPU shader with the CLIPPING_PLANES variant.
 *      For a 20-level curtain wall building with 50–100 unique materials,
 *      this is 50–100 shader recompilations at 100–200ms each = UP TO 15 SECONDS.
 *
 * SOLUTION:
 * Use renderer-level clipping planes (`renderer.clippingPlanes`) instead of
 * per-material planes (`material.clippingPlanes` + `localClippingEnabled`).
 *
 * With renderer-level planes:
 *   - The clipping shader variant is compiled ONCE for the entire renderer,
 *     not once per material. This happens at scene initialization, not at
 *     view switch time.
 *   - Switching clip planes is a pointer swap on `renderer.clippingPlanes` — <0.1ms.
 *   - `localClippingEnabled` stays FALSE permanently — no per-material recompilation.
 *   - All level clip planes are pre-computed at project load, not on demand.
 *
 * USAGE:
 *   // At project load:
 *   levelClipPlaneCache.setRenderer(renderer);
 *   levelClipPlaneCache.registerLevel('L1', 0.0);      // elevation 0m
 *   levelClipPlaneCache.registerLevel('L2', 3.2);      // elevation 3.2m
 *   levelClipPlaneCache.prewarm();                      // compile shader variant once
 *
 *   // On plan view activation (replaces OBC Clipper + localClippingEnabled):
 *   levelClipPlaneCache.activate('L2');                 // <0.1ms — pointer swap
 *
 *   // On view deactivation:
 *   levelClipPlaneCache.deactivate();                   // <0.1ms
 *
 * CONTRACT:
 *   §01-BIM-ENGINE-CORE §5 — no store mutations, no side effects.
 *   §02-BIM-SPATIAL-PROJECTION §2 — reads level elevations from BimManager.
 *   §07-BIM-SECURITY — no external network surface introduced.
 */
export class LevelClipPlaneCache {
    /** Cut height above level elevation (metres). Matches Revit's default 1200mm cut plane. */
    static readonly DEFAULT_CUT_HEIGHT = 1.2;

    private _renderer: THREE.WebGLRenderer | null = null;
    /** Maps levelId → pre-computed THREE.Plane for that level's cut plane. */
    private _planes: Map<string, THREE.Plane> = new Map();
    /** The currently active level's plane, or null when no clip is active. */
    private _activePlane: THREE.Plane | null = null;
    /** Whether the "prewarm" render has fired to force the clipping shader variant compile. */
    private _prewarmed = false;

    // ── Renderer injection ────────────────────────────────────────────────────

    /**
     * Inject the THREE.WebGLRenderer. Must be called before activate().
     * Typically called once from initScene after the renderer is created.
     */
    setRenderer(renderer: THREE.WebGLRenderer): void {
        this._renderer = renderer;
        // Ensure local clipping is permanently disabled — we ONLY use renderer-level planes.
        renderer.localClippingEnabled = false;
    }

    // ── Level registration ────────────────────────────────────────────────────

    /**
     * Pre-compute and cache the clip plane for a level.
     * Call for every level at project load time, before the user opens any plan view.
     *
     * @param levelId    Unique identifier for the level (matches BimManager level.id).
     * @param elevation  Level elevation in world-space metres (from BimManager level.elevation).
     * @param cutHeight  Horizontal cut height above elevation. Defaults to 1.2m (standard cut).
     */
    registerLevel(levelId: string, elevation: number, cutHeight = LevelClipPlaneCache.DEFAULT_CUT_HEIGHT): void {
        // THREE.Plane(normal, constant) where constant = -dot(normal, pointOnPlane).
        // Normal (0, -1, 0) = clip everything ABOVE y = (elevation + cutHeight).
        // constant = -(0,-1,0)·(0, elevation+cutHeight, 0) = elevation + cutHeight.
        const plane = new THREE.Plane(
            new THREE.Vector3(0, -1, 0),
            elevation + cutHeight
        );
        this._planes.set(levelId, plane);
    }

    /**
     * Update the clip plane for a level if its elevation changes (e.g., user edits a level).
     * Safe to call at any time — updates the plane's constant in place.
     */
    updateLevel(levelId: string, elevation: number, cutHeight = LevelClipPlaneCache.DEFAULT_CUT_HEIGHT): void {
        const existing = this._planes.get(levelId);
        if (existing) {
            existing.constant = elevation + cutHeight;
        } else {
            this.registerLevel(levelId, elevation, cutHeight);
        }
    }

    /**
     * Remove a level's clip plane (e.g., when a level is deleted).
     */
    removeLevel(levelId: string): void {
        if (this._activePlane === this._planes.get(levelId)) {
            this.deactivate();
        }
        this._planes.delete(levelId);
    }

    // ── Activation / deactivation ─────────────────────────────────────────────

    /**
     * Activate the clip plane for a specific level.
     *
     * This replaces the entire OBC Clipper + localClippingEnabled approach.
     * Cost: one Map lookup + one array assignment = <0.1ms.
     *
     * If the level has no pre-registered plane, falls back to computing one
     * on demand (still avoids OBC Clipper overhead).
     *
     * @param levelId    The level whose cut plane to activate.
     * @param fallbackElevation  Used only if levelId is not in the cache.
     */
    activate(levelId: string, fallbackElevation = 0): void {
        if (!this._renderer) {
            console.warn('[LevelClipPlaneCache] activate() called before setRenderer(). Clip plane not applied.');
            return;
        }

        let plane = this._planes.get(levelId);
        if (!plane) {
            console.warn(`[LevelClipPlaneCache] Level "${levelId}" not pre-registered. Computing on demand.`);
            this.registerLevel(levelId, fallbackElevation);
            plane = this._planes.get(levelId)!;
        }

        const _t0 = performance.now();
        this._activePlane = plane;
        // Pointer swap — this is the ENTIRE cost of switching clip planes.
        this._renderer.clippingPlanes = [plane];
        const elapsed = (performance.now() - _t0).toFixed(3);

        console.log(
            `[LevelClipPlaneCache] activate("${levelId}") — ` +
            `renderer.clippingPlanes = [plane(y≤${plane.constant.toFixed(2)}m)] — ` +
            `${elapsed}ms (pointer swap, no GPU stall; prewarmed=${this._prewarmed})`
        );
    }

    /**
     * Deactivate all clipping — restores full scene visibility.
     * Replaces `clipper.deleteAll()` + `localClippingEnabled = false`.
     * Cost: one array assignment = <0.01ms.
     */
    deactivate(): void {
        if (!this._renderer) return;
        const wasActive = this.activeLevelId;
        const _t0 = performance.now();
        this._renderer.clippingPlanes = [];
        this._activePlane = null;
        const elapsed = (performance.now() - _t0).toFixed(3);
        if (wasActive) {
            console.log(
                `[LevelClipPlaneCache] deactivate() — renderer.clippingPlanes = [] — ` +
                `${elapsed}ms (was level="${wasActive}"; pointer swap, no GPU stall)`
            );
        }
    }

    /**
     * Whether a clip plane is currently active.
     */
    get isActive(): boolean {
        return this._activePlane !== null;
    }

    /**
     * The currently active levelId, or null if no clip is active.
     * Useful for diagnostics.
     */
    get activeLevelId(): string | null {
        if (!this._activePlane) return null;
        for (const [id, plane] of this._planes) {
            if (plane === this._activePlane) return id;
        }
        return null;
    }

    // ── Prewarm ───────────────────────────────────────────────────────────────

    /**
     * Force the clipping shader variant to compile NOW — before the user
     * opens any plan view. Call during idle time after project load.
     *
     * How it works:
     * THREE.js compiles the clipping shader variant lazily on the first frame
     * where `renderer.clippingPlanes.length > 0`. By activating a plane briefly
     * and requesting a render, we pay the compilation cost during idle time
     * instead of on the user's first plan-view switch.
     *
     * The prewarm is a no-op if already done or if no renderer is set.
     */
    prewarm(scene: THREE.Scene, camera: THREE.Camera): void {
        if (this._prewarmed || !this._renderer || this._planes.size === 0) return;

        const [firstPlane] = this._planes.values();
        this._renderer.clippingPlanes = [firstPlane];
        this._renderer.render(scene, camera);
        this._renderer.clippingPlanes = [];

        this._prewarmed = true;
        console.log('[LevelClipPlaneCache] Clipping shader variant prewarmed — plan view switches are now instant.');
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    /**
     * Return the registered level count (useful for diagnostics).
     */
    get levelCount(): number {
        return this._planes.size;
    }

    /**
     * Clear all registered planes and deactivate.
     * Call on project close / project switch.
     */
    clear(): void {
        this.deactivate();
        this._planes.clear();
        this._prewarmed = false;
    }
}

/**
 * Singleton instance. Injected into ViewController via setLevelClipPlaneCache().
 */
export const levelClipPlaneCache = new LevelClipPlaneCache();
