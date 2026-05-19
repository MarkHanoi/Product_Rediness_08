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
