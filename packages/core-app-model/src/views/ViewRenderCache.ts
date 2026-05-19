/**
 * @file src/core/views/ViewRenderCache.ts
 *
 * ViewRenderCache — per-view `WebGLRenderTarget` cache for non-interactive contexts.
 *
 * ## Purpose (Phase 4 — Task 4.5)
 *
 * Non-interactive view contexts — sheet layout thumbnails, PDF export frames,
 * and section-cut previews — do not need a live render each frame. Instead,
 * they can use a cached render target that is updated only when the view's
 * geometry or camera state changes.
 *
 * ViewRenderCache maintains one `THREE.WebGLRenderTarget` per registered view
 * definition ID. When the view is active and interactive, the cache entry is
 * marked stale and is not used. When a non-interactive consumer requests a
 * thumbnail or export frame, `getRenderTarget(viewId)` returns the cached
 * target — or `null` if the view has never been rendered to cache.
 *
 * ## Cache invalidation
 *
 *   - Explicit `invalidate(viewId)` call from ViewController after view switch.
 *   - DOM events: 'model-updated', 'ai-model-update', 'bim-project-cleared',
 *     'clear-project', 'project-loaded' — bulk invalidation of all entries.
 *   - GC: `dispose()` frees all GPU memory.
 *
 * ## Non-interactive rendering
 *
 * When `renderToCache(viewId, scene, camera, renderer)` is called, the
 * method renders the scene to the cached `WebGLRenderTarget` and marks it
 * fresh. The main display renderer is NOT affected — the target is offscreen.
 *
 * ## Contract compliance
 *
 *   01-BIM-ENGINE-CORE §5 — No store mutations; GPU-only side effects.
 *   05-BIM-UI-ARCHITECTURE — No CSS injected; no DOM elements created.
 *
 * Phase 4 Performance — Task 4.5.
 */

import * as THREE from '@pryzm/renderer-three/three';

// ── Cache entry ───────────────────────────────────────────────────────────────

interface CacheEntry {
    target:    THREE.WebGLRenderTarget;
    stale:     boolean;
    /** Timestamp of the last successful render, or 0 if never rendered. */
    renderedAt: number;
}

// ── ViewRenderCache ───────────────────────────────────────────────────────────

export class ViewRenderCache {

    private readonly _entries = new Map<string, CacheEntry>();

    /** Default render target size in pixels. Overridable per-call. */
    private _defaultWidth  = 1024;
    private _defaultHeight = 768;

    private static readonly BULK_INVALIDATING_EVENTS = [
        'model-updated',
        'ai-model-update',
        'bim-project-cleared',
        'clear-project',
        'project-loaded',
    ] as const;

    constructor() {
        // Bulk invalidation: when the project state changes, all cached renders
        // are stale because the scene content may have changed.
        for (const name of ViewRenderCache.BULK_INVALIDATING_EVENTS) {
            window.addEventListener(name, () => this.invalidateAll());
        }

        window.__viewRenderCache = this;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Set the default render target resolution.
     * Call once from initScene or the sheet-layout system.
     */
    setDefaultSize(width: number, height: number): void {
        this._defaultWidth  = width;
        this._defaultHeight = height;
    }

    /**
     * Returns the cached `WebGLRenderTarget` for `viewId` if the cache is
     * fresh (not stale, has been rendered at least once).
     *
     * Returns `null` if:
     *   - The view has never been rendered to cache.
     *   - The entry is marked stale (pending re-render).
     *   - No entry exists for `viewId`.
     */
    getRenderTarget(viewId: string): THREE.WebGLRenderTarget | null {
        const entry = this._entries.get(viewId);
        if (!entry || entry.stale || entry.renderedAt === 0) return null;
        return entry.target;
    }

    /**
     * Render `scene` from `camera`'s perspective into the cached render target
     * for `viewId`. Creates or resizes the target if needed.
     *
     * This is an **offscreen** render — it does not affect the main display.
     * The WebGL renderer temporarily redirects its output to the render target.
     *
     * @param viewId   View definition ID (e.g. 'vd_plan_1')
     * @param scene    The Three.js scene
     * @param camera   The camera to render from
     * @param renderer The active WebGLRenderer
     * @param width    Optional override width (defaults to `defaultWidth`)
     * @param height   Optional override height (defaults to `defaultHeight`)
     */
    renderToCache(
        viewId:   string,
        scene:    THREE.Scene,
        camera:   THREE.Camera,
        renderer: THREE.WebGLRenderer,
        width  = this._defaultWidth,
        height = this._defaultHeight,
    ): void {
        try {
            const entry = this._getOrCreate(viewId, width, height);

            // Resize target if the requested resolution changed.
            if (entry.target.width !== width || entry.target.height !== height) {
                entry.target.setSize(width, height);
            }

            // Save and redirect renderer output.
            const prevTarget = renderer.getRenderTarget();
            renderer.setRenderTarget(entry.target);
            renderer.render(scene, camera);
            renderer.setRenderTarget(prevTarget);

            entry.stale      = false;
            entry.renderedAt = Date.now();

            console.log(
                `[ViewRenderCache] Rendered view "${viewId}" → ` +
                `${width}×${height} px offscreen.`,
            );
        } catch (err: any) {
            console.warn('[ViewRenderCache] renderToCache error:', err?.message ?? err);
        }
    }

    /**
     * Mark the cached render for `viewId` as stale.
     * The entry is NOT disposed — the target is reused on the next `renderToCache()`.
     * Call this when ViewController activates a view (geometry/camera may change).
     */
    invalidate(viewId: string): void {
        const entry = this._entries.get(viewId);
        if (entry) {
            entry.stale = true;
        }
    }

    /**
     * Mark ALL cached renders as stale. Called on bulk scene mutations.
     */
    invalidateAll(): void {
        for (const entry of this._entries.values()) {
            entry.stale = true;
        }
    }

    /**
     * Returns `true` if the given view has a fresh cached render available.
     */
    isFresh(viewId: string): boolean {
        const entry = this._entries.get(viewId);
        return Boolean(entry && !entry.stale && entry.renderedAt > 0);
    }

    /**
     * Returns the timestamp (ms since epoch) of the last successful render
     * for `viewId`, or 0 if never rendered.
     */
    getLastRenderedAt(viewId: string): number {
        return this._entries.get(viewId)?.renderedAt ?? 0;
    }

    /**
     * Number of cached render targets (fresh + stale).
     */
    get size(): number {
        return this._entries.size;
    }

    /**
     * Dispose the render target for a specific view and remove it from the cache.
     * Call when a ViewDefinition is deleted.
     */
    disposeView(viewId: string): void {
        const entry = this._entries.get(viewId);
        if (entry) {
            entry.target.dispose();
            this._entries.delete(viewId);
        }
    }

    /**
     * Dispose ALL render targets and clear the cache.
     * Must be called on project clear to free GPU memory.
     */
    dispose(): void {
        for (const entry of this._entries.values()) {
            entry.target.dispose();
        }
        this._entries.clear();
        console.log('[ViewRenderCache] All render targets disposed.');
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private _getOrCreate(
        viewId: string,
        width:  number,
        height: number,
    ): CacheEntry {
        let entry = this._entries.get(viewId);
        if (!entry) {
            const target = new THREE.WebGLRenderTarget(width, height, {
                minFilter:    THREE.LinearFilter,
                magFilter:    THREE.LinearFilter,
                format:       THREE.RGBAFormat,
                type:         THREE.UnsignedByteType,
                depthBuffer:  true,
                stencilBuffer: false,
            });
            entry = { target, stale: true, renderedAt: 0 };
            this._entries.set(viewId, entry);
        }
        return entry;
    }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

/**
 * Global ViewRenderCache singleton.
 *
 * Usage:
 *   import { viewRenderCache } from './ViewRenderCache';
 *   viewRenderCache.renderToCache('vd_plan_1', scene, camera, renderer);
 *   const rt = viewRenderCache.getRenderTarget('vd_plan_1');
 */
export const viewRenderCache = new ViewRenderCache();

// ── Contract 45 §6 — Phase 5: project-scope registration ──────────────────────
// The render-target cache holds GPU resources keyed by view IDs from the
// current project. Switching projects must dispose every entry to free GPU
// memory and prevent stale frames from showing through.
import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'viewRenderCache',
    clear: () => viewRenderCache.dispose(),
});
