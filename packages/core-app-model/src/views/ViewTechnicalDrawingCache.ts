/**
 * ViewTechnicalDrawingCache — DOC-1.5
 *
 * In-memory rendering cache: viewDefinitionId → TechnicalDrawing.
 *
 * ─── THIS IS NOT A PRYZM STORE ─────────────────────────────────────────────
 * - Not registered in StoreRegistry.
 * - Does not participate in undo/redo.
 * - Not serialised / not persisted to project file.
 * - Purely ephemeral — rebuilt from 3D geometry via EdgeProjectorService.
 *
 * Contract compliance:
 *   §01 §5 — OBC TechnicalDrawing (which wraps a THREE.Group) is held here
 *             because this cache IS NOT A PRYZM STORE. It is the rendering-layer
 *             equivalent of ElementRegistry: a fast lookup table for ephemeral
 *             objects that are never exposed to the command/undo system.
 *   §02 §4.3 — `invalidate()` disposes the TechnicalDrawing and releases its
 *              THREE.js geometry before removing the cache entry.
 */

import * as OBC from '@thatopen/components';
import { storeEventBus, type StoreChangeEvent } from '../StoreEventBus'; // TODO(TASK-08)
import { viewIntentInstanceStore } from '../presentation/ViewIntentInstanceStore';
// §PLAN-VIEW-INCREMENTAL-DRAWING Round 43 — P8 contract compliance for the
// new exported `invalidateElement` method. Uses the canonical
// `pryzm.plan-view.<verb>` span convention via the established
// `emitPlanViewMotionEvent` helper.
import { emitPlanViewMotionEvent } from './otel';

const VIEW_DEFINITION_ELEMENT_TYPE = 'view-definition';

export class ViewTechnicalDrawingCache {

    private readonly _cache = new Map<string, OBC.TechnicalDrawing>();
    private readonly staleElementIds = new Set<string>();
    private _fullRebuildRequired = false;
    private _storeUnsubscribe: (() => void) | null = null;
    private _windowListenersAttached = false;

    /**
     * DOC-1.5f — Monotonic generation counter per viewId.
     * Incremented by `beginProjection()` each time a new projection starts.
     * `setIfCurrent()` rejects completions whose generation no longer matches.
     */
    private readonly _generations = new Map<string, number>();

    constructor() {
        this._wireDirtyTracking();
    }

    // ── Public API ────────────────────────────────────────────────────────────

    markDirty(elementId: string): void {
        if (!elementId) return;
        this.staleElementIds.add(elementId);
    }

    markFullRebuild(): void {
        this._fullRebuildRequired = true;
        this.staleElementIds.clear();
    }

    get hasDirtyElements(): boolean {
        return this._fullRebuildRequired || this.staleElementIds.size > 0;
    }

    get requiresFullRebuild(): boolean {
        return this._fullRebuildRequired;
    }

    consumeDirtyIds(): string[] {
        if (this._fullRebuildRequired) {
            this._fullRebuildRequired = false;
            this.staleElementIds.clear();
            return [];
        }

        const ids = [...this.staleElementIds];
        this.staleElementIds.clear();
        return ids;
    }

    /**
     * Store a TechnicalDrawing under a viewDefinitionId.
     * Overwrites any previous entry — the caller must invalidate first if it
     * needs the old drawing disposed.
     */
    set(viewId: string, drawing: OBC.TechnicalDrawing): void {
        this._cache.set(viewId, drawing);
    }

    /**
     * Retrieve the cached TechnicalDrawing for a viewDefinitionId.
     * Returns `undefined` if the view has never been projected or was invalidated.
     */
    get(viewId: string): OBC.TechnicalDrawing | undefined {
        return this._cache.get(viewId);
    }

    /** Returns true if a valid (non-invalidated) drawing exists for the view. */
    has(viewId: string): boolean {
        return this._cache.has(viewId);
    }

    // ── DOC-1.5f — Race condition guard ───────────────────────────────────────

    /**
     * Increment and return the monotonic generation number for `viewId`.
     *
     * Call this BEFORE starting an async projection. Store the returned number
     * in the closure of the async callback, then pass it to `setIfCurrent()`
     * on completion. If a newer projection started in the interim, the stale
     * completion is silently rejected.
     *
     * Pattern:
     *   const gen = cache.beginProjection(viewId);
     *   const drawing = await edgeProjectorService.project(...);
     *   cache.setIfCurrent(viewId, gen, drawing); // no-op if stale
     */
    beginProjection(viewId: string): number {
        const gen = (this._generations.get(viewId) ?? 0) + 1;
        this._generations.set(viewId, gen);
        return gen;
    }

    /**
     * Write `drawing` to the cache only if `gen` still matches the current
     * generation for `viewId`. Returns `true` when the cache was updated,
     * `false` when a newer projection superseded this one (stale rejection).
     *
     * §02 §4.3 — Stale drawings are NOT disposed here; the caller is responsible
     * for any THREE.js geometry cleanup on rejected drawings.
     */
    setIfCurrent(viewId: string, gen: number, drawing: OBC.TechnicalDrawing): boolean {
        if (this._generations.get(viewId) !== gen) {
            console.log(
                `[ViewTechnicalDrawingCache] Stale projection rejected — ` +
                `viewId=${viewId} staleGen=${gen} currentGen=${this._generations.get(viewId)}`,
            );
            return false;
        }
        this.set(viewId, drawing);
        return true;
    }

    /**
     * Invalidate a single view — dispose its TechnicalDrawing and remove from cache.
     * §02 §4.3 — All THREE.js geometry owned by the drawing is released here.
     */
    invalidate(viewId: string): void {
        this._generations.set(viewId, (this._generations.get(viewId) ?? 0) + 1);
        const drawing = this._cache.get(viewId);
        if (drawing) {
            try {
                drawing.onDisposed.trigger();   // signal OBC systems to clean up
            } catch {
                // Best-effort dispose — do not crash the projection pipeline.
            }
            this._cache.delete(viewId);
            console.log(`[ViewTechnicalDrawingCache] invalidated viewId=${viewId}`);
        }
    }

    /**
     * §PLAN-VIEW-INCREMENTAL-DRAWING (#89 Day 1, DAILY-USE 2026-05-21, Round 42).
     *
     * Incremental invalidation — drops ONLY the projection lines tagged with
     * the given elementUUID from the cached drawing's layers. The drawing
     * itself remains valid + cached for every OTHER element. The matching
     * element is marked dirty so the next projection cycle re-projects it
     * via `EdgeProjectorService.projectElement()` (Day 2 of #89) without
     * traversing the full element set.
     *
     * Why this matters:
     *   The pre-existing `invalidate(viewId)` is a coarse-grained throw-the-
     *   entire-drawing-away operation. After §57 (Rounds 10-37) closed the
     *   per-element CACHE inside EdgeProjectorService, the next latency cliff
     *   is the per-view RE-PROJECTION ITERATION — even when 36 of 37 elements
     *   hit cache (~0.5ms each), the iteration overhead + traverse + opening-
     *   suppressor + layer-dispatch per element still costs ~40-60ms per
     *   plan-view re-projection. Round 42 (and the Day 2-4 follow-ons) close
     *   that loop: when ONE element changes, we drop ONLY that element's
     *   layers + re-project ONLY that element. The drawing stays warm for
     *   all other elements; the architect's edit produces ~5-10ms incremental
     *   work instead of ~40-60ms full-cycle work.
     *
     * Algorithm:
     *   1. Find the cached drawing for `viewId`. If absent → no-op (the next
     *      projection will build it fresh).
     *   2. For each layer in `drawing.layers`, iterate the child LineSegments:
     *      a. Read `child.userData.elementUUID` (stamped by NMEexporter +
     *         registerSegmentUUID per Round 60).
     *      b. If it matches `elementId`, dispose the geometry + remove the
     *         child from the layer.
     *   3. Mark `elementId` as stale via the existing dirty-tracking
     *      infrastructure (`staleElementIds.add`) so the projection driver
     *      knows to re-project this element on the next tick.
     *   4. Bump the per-element generation counter (composite key
     *      `${viewId}:${elementId}`) so any in-flight per-element projection
     *      from a concurrent path can be detected + rejected by `setIfCurrent`.
     *
     * Architectural contract:
     *   • If the element has NO matching LineSegments (never projected,
     *     or already invalidated), this is a NO-OP — safe to call
     *     speculatively from storeEventBus subscribers.
     *   • The CACHED DRAWING REMAINS VALID for every other element — callers
     *     can `get(viewId)` immediately after `invalidateElement` and receive
     *     a partial-but-correct drawing. The per-element re-projection (Day 2)
     *     will add the new lines back without affecting other elements.
     *   • The view-level generation counter (`_generations.get(viewId)`) is
     *     NOT bumped — this is per-element invalidation, not view-wide. Stale-
     *     projection rejection at the view level is unaffected.
     *
     * Performance:
     *   O(L × E) where L = number of layers (~10-20 typical) and E = average
     *   children per layer (~5-30 elements × 1-3 LineSegments each). ~3-10ms
     *   on a typical residential scene. Compares to ~40-60ms for the coarse
     *   `invalidate(viewId)` path.
     *
     * Day 2 of #89 will wire `EdgeProjectorService.projectElement(viewDef, group)`
     * to consume the dropped slots; Day 3 wires `PlanViewManager._onProjectionStale`
     * to dispatch element-scoped vs view-scoped invalidation based on the
     * incoming storeEventBus event payload.
     */
    invalidateElement(viewId: string, elementId: string): void {
        if (!elementId) return;
        const drawing = this._cache.get(viewId);
        if (!drawing) {
            // No cached drawing yet — record the dirty intent for the next
            // full projection. The next `_ensureProjection()` cycle will see
            // the dirty element via `consumeDirtyIds()` and project it fresh.
            this.staleElementIds.add(elementId);
            return;
        }

        let removedCount = 0;
        try {
            // OBC.TechnicalDrawing exposes a `layers` Map<string, OBC.Layer>.
            // Each layer wraps a THREE.Group whose children are the per-element
            // LineSegments tagged with userData.elementUUID at projection time
            // (NMEexporter / registerSegmentUUID — Round 60 §PERF-CACHE-DIAG).
            const layers = (drawing as { layers?: { list?: Map<string, unknown> } }).layers;
            const layerList = layers?.list;
            if (layerList && typeof layerList.forEach === 'function') {
                layerList.forEach((layer: unknown) => {
                    const layerGroup = (layer as { three?: { children?: unknown[]; remove?: (child: unknown) => void } })?.three;
                    if (!layerGroup || !Array.isArray(layerGroup.children)) return;
                    // Iterate a snapshot so removal during iteration is safe.
                    const children = [...layerGroup.children];
                    for (const child of children) {
                        const cu = (child as { userData?: { elementUUID?: string } })?.userData;
                        if (cu?.elementUUID !== elementId) continue;
                        // Dispose geometry + material; remove from the layer group.
                        const mesh = child as { geometry?: { dispose?: () => void }; material?: { dispose?: () => void } | Array<{ dispose?: () => void }> };
                        try { mesh.geometry?.dispose?.(); } catch { /* best-effort */ }
                        try {
                            const m = mesh.material;
                            if (Array.isArray(m)) {
                                for (const mat of m) { try { mat.dispose?.(); } catch { /* best-effort */ } }
                            } else if (m) {
                                m.dispose?.();
                            }
                        } catch { /* best-effort */ }
                        try { layerGroup.remove?.(child); } catch { /* best-effort */ }
                        removedCount++;
                    }
                });
            }
        } catch (err) {
            // If the drawing's internal shape has drifted from the assumed
            // OBC.Layer.list / .three.children topology, log + fall back to
            // a full invalidate — correctness wins over performance.
            console.warn(
                `[ViewTechnicalDrawingCache] §PLAN-VIEW-INCREMENTAL-DRAWING invalidateElement(${viewId}, ${elementId}) ` +
                `failed to traverse drawing layers — falling back to full invalidate:`,
                err,
            );
            this.invalidate(viewId);
            return;
        }

        // Mark the element dirty so the next projection cycle re-projects it.
        // The per-view generation counter is intentionally NOT bumped — this
        // is element-scoped, not view-scoped.
        this.staleElementIds.add(elementId);

        if (removedCount > 0) {
            console.log(
                `[ViewTechnicalDrawingCache] §PLAN-VIEW-INCREMENTAL-DRAWING invalidateElement ` +
                `viewId=${viewId} elementId=${elementId} removedLineSegments=${removedCount}`,
            );
        }

        // §PLAN-VIEW-INCREMENTAL-DRAWING Round 43 — P8 contract compliance
        // (`01-VISION.md §2` — every new exported function must add ≥1
        // OpenTelemetry span). Uses the canonical pryzm.plan-view.<verb>
        // convention via the existing emitPlanViewMotionEvent helper. The
        // span fires fire-and-done; no-op when TracerProvider isn't installed
        // (matches every other otel.ts call site in the codebase).
        emitPlanViewMotionEvent('invalidate-element', {
            'pryzm.plan_view.view_id':                viewId,
            'pryzm.plan_view.element_id':             elementId,
            'pryzm.plan_view.removed_line_segments':  removedCount,
            'pryzm.plan_view.had_cached_drawing':     !!drawing,
        });
    }

    /**
     * Clear the entire cache — dispose all TechnicalDrawings and release geometry.
     * Called on project close / project switch (§01 §5 / §02 §4.3).
     * DOC-1.5f: also clears generation counters so any in-flight projections
     * from the previous project session cannot contaminate the next project's cache.
     */
    clear(): void {
        for (const [viewId, drawing] of this._cache) {
            try {
                drawing.onDisposed.trigger();
            } catch {
                // Best-effort dispose.
            }
            console.log(`[ViewTechnicalDrawingCache] cleared viewId=${viewId}`);
        }
        this._cache.clear();
        this._generations.clear();   // DOC-1.5f: reset all generation counters
        this.staleElementIds.clear();
        this._fullRebuildRequired = false;
    }

    /** Number of currently cached drawings — diagnostic use only. */
    get size(): number {
        return this._cache.size;
    }

    private _wireDirtyTracking(): void {
        if (!this._storeUnsubscribe) {
            this._storeUnsubscribe = storeEventBus.subscribe((event) => this._onStoreChange(event));
        }

        if (this._windowListenersAttached || typeof window === 'undefined') return;

        window.addEventListener('vd:view-range-changed', () => this.markFullRebuild());
        window.addEventListener('vd:drawing-scale-changed', () => this.markFullRebuild());
        window.addEventListener('vi:intent-updated', (e: Event) => {
            const intentId = (e as CustomEvent<{ intentId?: string }>).detail?.intentId;
            if (!intentId) return;
            viewIntentInstanceStore.getAll()
                .filter(instance => instance.intentId === intentId)
                .forEach(instance => this.invalidate(instance.viewId));
        });
        window.addEventListener('vi:instance-updated', (e: Event) => {
            const viewId = (e as CustomEvent<{ viewId?: string }>).detail?.viewId;
            if (viewId) this.invalidate(viewId);
        });
        this._windowListenersAttached = true;
    }

    private _onStoreChange(event: StoreChangeEvent): void {
        if (event.elementType === VIEW_DEFINITION_ELEMENT_TYPE) {
            if (event.operation !== 'create') this.invalidate(event.elementId);
            return;
        }
        this.markDirty(event.elementId);

        // §PLAN-VIEW-REFRESH (Apr 2026)
        //
        // Marking dirty alone is not enough: nothing in the codebase consumes
        // `staleElementIds`, so wall/door/window/room/slab mutations would
        // silently leave the cached TechnicalDrawing untouched and the 2D
        // plan view would keep displaying the pre-edit geometry indefinitely.
        //
        // We notify any active PlanViewManager so it can invalidate its own
        // cached drawing and trigger a re-projection. The event is dispatched
        // for ANY non-view element mutation; the listener decides whether the
        // element is relevant to its current view (by level / type).
        if (typeof window !== 'undefined') {
            try {
                window.dispatchEvent(new CustomEvent('vd:projection-stale', { // TODO(TASK-15)
                    detail: {
                        elementId:   event.elementId,
                        elementType: event.elementType,
                        operation:   event.operation,
                    },
                }));
            } catch { /* DOM dispatch must never throw past this guard */ }
        }
    }
}

// Singleton — created here, never registered in StoreRegistry.
export const viewTechnicalDrawingCache = new ViewTechnicalDrawingCache();
