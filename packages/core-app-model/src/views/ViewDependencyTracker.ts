/**
 * ViewDependencyTracker — DOC-1.4
 *
 * Tracks which views depend on which spatial levels.
 * Subscribes to StoreEventBus. When geometry-relevant elements change, // TODO(TASK-08)
 * marks only the affected views (same levelId) as dirty and queues a
 * debounced re-projection.
 *
 * Contract compliance:
 *   §01 §3.3 — Reads viewDefinitionStore via the store's public API only.
 *   §02 §1.2 — Does not resolve or cache level elevations — that is
 *               EdgeProjectorService's responsibility.
 *   §05      — No DOM, no Three.js, no BIM-UI components.
 *
 * ─── Integration ────────────────────────────────────────────────────────────
 *
 * 1. On element CREATE / UPDATE, callers (Create- / Update- commands) must call:
 *      viewDependencyTracker.registerElement(elementId, levelId)
 *    This keeps the tracker's element → level map up to date without
 *    importing individual BIM stores.
 *
 * 2. On element DELETE, callers must call:
 *      viewDependencyTracker.unregisterElement(elementId)
 *
 * 3. On project clear/load:
 *      viewDependencyTracker.clear()
 *
 * This design avoids tight coupling to individual BIM stores.
 */

import { storeEventBus, StoreChangeEvent } from '../StoreEventBus'; // TODO(TASK-08)
import { elementRegistry } from '../ElementRegistry';
import { viewDefinitionStore } from './ViewDefinitionStore';
import { viewTechnicalDrawingCache } from './ViewTechnicalDrawingCache';
import { unifiedFrameLoop } from '../rendering/UnifiedFrameLoop';

// ── Types ────────────────────────────────────────────────────────────────────

/** Element types that carry 3D geometry and therefore affect 2D projections. */
const GEOMETRY_ELEMENT_TYPES = new Set([
    'wall', 'slab', 'column', 'beam', 'curtainwall', 'curtain-panel',
    'window', 'door', 'roof', 'stair', 'stair-landing', 'stair-railing',
    'opening', 'ceiling', 'floor', 'handrail', 'furniture', 'plumbing',
]);

/** Debounce interval in ms — chosen to absorb OBC WebWorker projection timing. */
const DEBOUNCE_MS = 300;

// ── Class ────────────────────────────────────────────────────────────────────

export class ViewDependencyTracker {

    /** Set of view IDs that need re-projection on the next flush. */
    private _dirtyViewIds = new Set<string>();

    /** Maps elementId → levelId. Populated by `registerElement()`. */
    private readonly _elementLevelMap = new Map<string, string>();

    /** Active debounce timer handle. */
    private _debounceTimer: ReturnType<typeof setTimeout> | null = null;

    /** StoreEventBus unsubscribe function. */ // TODO(TASK-08)
    private _unsubscribe: (() => void) | null = null;

    /**
     * §A.2 — Disposer for the elementRegistry.onUnregister subscription.
     * Wired in init(), cancelled in destroy(). When an element is removed via
     * elementRegistry.unregister() or unregisterIfPresent(), the callback prunes
     * _elementLevelMap so the element's level association does not become a phantom
     * dirty-view entry on subsequent plan-view refreshes after undo.
     */
    private _unregisterDispose: (() => void) | null = null;

    /**
     * §PERF-VIEW-BATCH-SUPPRESS: When true, _onStoreEvent is a no-op.
     *
     * Set by BatchCoordinator._setupBatch() at batch start and cleared by
     * BatchCoordinator.onComplete() after _isBatching=false.  Prevents the
     * 31-chunk endBatchYielded() drain (6,072 curtain-wall store events) from
     * continuously resetting the 300ms debounce timer and subsequently triggering
     * a catastrophic full-building EdgeProjectorService reprojection (observed
     * 12,635ms LONGTASK for 9,461 edge geometries in the 3D system view).
     *
     * After suppression ends, BatchCoordinator calls markLevelsDirty(levelIds)
     * so that only the affected plan views are re-projected exactly once.
     */
    private _batchSuppressed = false;

    /**
     * Optional re-projection callback — set by ViewController or engine bootstrap.
     * Called with each dirty viewId during `_flush()`.
     *
     * DOC-1.5f: The second argument `gen` is the monotonic generation number
     * returned by `viewTechnicalDrawingCache.beginProjection(viewId)`. The callback
     * MUST pass it to `viewTechnicalDrawingCache.setIfCurrent(viewId, gen, drawing)`
     * instead of calling `.set()` directly, to guard against stale completions.
     */
    onReprojectionNeeded: ((viewId: string, gen: number) => Promise<void>) | null = null;

    // ── DOC-1.5e — Dual-layer compositing status ──────────────────────────────

    /**
     * Number of views currently being re-projected.
     * 0 = idle. >0 = at least one WebWorker projection is in flight.
     */
    private _activeProjectionCount = 0;

    /**
     * True while at least one TechnicalDrawing re-projection is in flight.
     * Consumers (ViewTabBar) can poll this or subscribe via `onReprojectionStateChange`.
     *
     * DOC-1.5e: The 3D mesh layer is ALWAYS visible as the live underlay.
     * This flag signals only that the vector overlay is updating, not that
     * content is missing.
     */
    get isReprojecting(): boolean { return this._activeProjectionCount > 0; }

    /**
     * Optional callback — fired when `isReprojecting` transitions between true/false.
     * Attach here to drive a UI spinner or status chip without polling.
     * Signature: (reprojecting: boolean) => void.
     */
    onReprojectionStateChange: ((reprojecting: boolean) => void) | null = null;

    private _resolveElementLevelId: ((elementId: string) => string | undefined) | null = null;

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Subscribe to StoreEventBus. Call once after the engine is initialised. // TODO(TASK-08)
     * Idempotent — calling twice unsubscribes the previous listener first.
     */
    init(): void {
        if (this._unsubscribe) {
            this._unsubscribe();
        }
        this._unsubscribe = storeEventBus.subscribe(this._onStoreEvent.bind(this));

        // §A.2 — Subscribe to elementRegistry.onUnregister so _elementLevelMap is
        // pruned whenever an element is deleted (undo, remove command, project clear).
        // Without this, removed element IDs remain in _elementLevelMap and can trigger
        // spurious dirty-view entries for stale level associations after undo cycles.
        if (this._unregisterDispose) {
            this._unregisterDispose();
        }
        this._unregisterDispose = elementRegistry.onUnregister(id => {
            this.unregisterElement(id);
        });

        console.log('[ViewDependencyTracker] init() — subscribed to StoreEventBus and elementRegistry.onUnregister'); // TODO(TASK-08)
    }

    /**
     * Unsubscribe and cancel any pending debounce.
     * Call on engine teardown or project close.
     */
    destroy(): void {
        if (this._unsubscribe) {
            this._unsubscribe();
            this._unsubscribe = null;
        }
        // §A.2 — Cancel elementRegistry.onUnregister subscription on engine teardown.
        if (this._unregisterDispose) {
            this._unregisterDispose();
            this._unregisterDispose = null;
        }
        if (this._debounceTimer !== null) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }
        console.log('[ViewDependencyTracker] destroy() — unsubscribed from StoreEventBus and elementRegistry'); // TODO(TASK-08)
    }

    // ── Element registration ──────────────────────────────────────────────────

    /**
     * Associate an element with a level for dirty-tracking purposes.
     * Commands should call this after creating or moving an element.
     *
     * @param elementId  PRYZM element ID.
     * @param levelId    BimManager level ID the element belongs to.
     */
    registerElement(elementId: string, levelId: string): void {
        this._elementLevelMap.set(elementId, levelId);
    }

    /**
     * Remove an element's level association.
     * Commands should call this when deleting an element.
     */
    unregisterElement(elementId: string): void {
        this._elementLevelMap.delete(elementId);
    }

    /**
     * Clear all element registrations.
     * Call on project clear / project load.
     */
    clear(): void {
        this._elementLevelMap.clear();
        this._dirtyViewIds.clear();
        viewTechnicalDrawingCache.clear();
        if (this._debounceTimer !== null) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }
    }

    setLevelResolver(resolver: (elementId: string) => string | undefined): void {
        this._resolveElementLevelId = resolver;
    }

    // ── Batch suppression API ─────────────────────────────────────────────────

    /**
     * §PERF-VIEW-BATCH-SUPPRESS: Enable or disable store-event suppression.
     *
     * Call setSuppressed(true) at batch start (BatchCoordinator._setupBatch).
     * Call setSuppressed(false) in onComplete after _isBatching=false, then
     * call markLevelsDirty(levelIds) to schedule ONE targeted reprojection.
     *
     * Safe to call when already in the desired state (idempotent).
     */
    setSuppressed(suppressed: boolean): void {
        this._batchSuppressed = suppressed;
        if (!suppressed && this._dirtyViewIds.size > 0) {
            // Flush any views that were dirtied before suppression began.
            this._scheduleDebouncedFlush();
        }
    }

    /**
     * §PERF-VIEW-BATCH-SUPPRESS: Mark only the plan views associated with
     * `levelIds` as dirty and start the 300ms debounce flush.
     *
     * Called by BatchCoordinator.onComplete() after suppression ends so that
     * the batch's affected plan views are re-projected exactly once — replacing
     * the N×200-event avalanche that previously triggered the 12,635ms LONGTASK.
     *
     * Does not mark 3D system views (viewType==='3d') as dirty; those display
     * the live THREE.js scene and derive no benefit from 2D edge projection.
     */
    markLevelsDirty(levelIds: string[]): void {
        if (levelIds.length === 0) return;
        for (const levelId of levelIds) {
            for (const viewId of this._getAffectedViews('__batch__', levelId)) {
                this._dirtyViewIds.add(viewId);
            }
        }
        if (this._dirtyViewIds.size > 0) {
            this._scheduleDebouncedFlush();
        }
    }

    /**
     * §III-2 (Sprint 3): Like markLevelsDirty() but bypasses the 300ms debounce timer.
     *
     * **When to call**: from BatchCoordinator.onComplete(), which already runs inside
     * a 'post-render' FrameScheduler slot (§FIX-EDGE-PROJECT-DEFER). That slot fires
     * AFTER the GPU PSO compile LONGTASK, so no additional waiting period is needed.
     * Bypassing the debounce saves 300ms of dead time between batch overlay dismiss
     * and plan-view re-projection starting.
     *
     * **When NOT to call**: for interactive edits, use the debounced markLevelsDirty()
     * to absorb rapid successive mutations without thrashing EdgeProjectorService.
     *
     * Implementation: cancels any in-flight debounce timer, marks affected views dirty,
     * then queues `_flush()` via `unifiedFrameLoop.queueLowPriority()` (≤1 rAF away).
     */
    markLevelsDirtyImmediate(levelIds: string[]): void {
        if (levelIds.length === 0) return;
        for (const levelId of levelIds) {
            for (const viewId of this._getAffectedViews('__batch__', levelId)) {
                this._dirtyViewIds.add(viewId);
            }
        }
        if (this._dirtyViewIds.size === 0) return;
        // Cancel any pending debounce timer so a subsequent debounced flush does not
        // double-flush the views we are about to handle immediately.
        if (this._debounceTimer !== null) {
            clearTimeout(this._debounceTimer);
            this._debounceTimer = null;
        }
        // Queue an immediate low-priority flush — no DEBOUNCE_MS wait.
        unifiedFrameLoop.queueLowPriority(() => this._flush());
    }

    // ── Public dirty API ──────────────────────────────────────────────────────

    /**
     * Explicitly mark a view as needing re-projection.
     * Starts (or resets) the 300ms debounce timer.
     */
    markDirty(viewId: string): void {
        this._dirtyViewIds.add(viewId);
        this._scheduleDebouncedFlush();
    }

    // ── Private ───────────────────────────────────────────────────────────────

    /** React to incoming StoreChangeEvents. */
    private _onStoreEvent(event: StoreChangeEvent): void {
        if (!GEOMETRY_ELEMENT_TYPES.has(event.elementType)) return;

        // §PERF-VIEW-BATCH-SUPPRESS: during a batch the coordinator delivers
        // thousands of buffered events through endBatchYielded().  Letting each
        // one reset the 300ms debounce timer would cause a single catastrophic
        // full-building reprojection (~12,635ms LONGTASK for 9,461 edges in the
        // 3D system view) immediately after the batch.  BatchCoordinator calls
        // markLevelsDirty(levelIds) after suppression ends to schedule ONE
        // targeted reprojection of only the affected plan views.
        if (this._batchSuppressed) return;

        let levelId = this._elementLevelMap.get(event.elementId) ?? this._resolveElementLevelId?.(event.elementId);

        // §CW-PANEL-PARENT (OI-054 (a), 2026-05-24) — CHILD elements use a composite
        // id `<parentId>::<suffix>` (curtain panels: `curtainwall_<ulid>::row:col`).
        // They are never registered independently in `_elementLevelMap`, so without this
        // every panel store-event (N per curtain wall, fired on create/undo/redo by
        // CurtainPanelSyncHandler) fell into the §G3-STALE fallback below — an O(views)
        // sweep + a console.warn PER PANEL (the 300–560 ms LONGTASK storm). A child's
        // geometry change is covered by re-projecting the PARENT's level, so attribute
        // it to the parent (which IS registered). General for any `parent::child` id.
        if (!levelId && event.elementId.includes('::')) {
            const parentId = event.elementId.slice(0, event.elementId.indexOf('::'));
            levelId = this._elementLevelMap.get(parentId) ?? this._resolveElementLevelId?.(parentId);
        }

        if (levelId) {
            // Targeted: mark only views on the same level.
            const affectedIds = this._getAffectedViews(event.elementId, levelId);
            for (const viewId of affectedIds) {
                this._dirtyViewIds.add(viewId);
            }
        } else {
            // §G.3 — stale ID: element was registered then unregistered (undo/redo cycle).
            // Log the stale event for observability and apply the targeted store-type fallback
            // instead of marking ALL non-3D views dirty (which triggers a full-building
            // re-projection for every undo operation).
            console.warn('[VDT] §G3-STALE-EVENT for unregistered element', event.elementId,
                'type=', event.elementType, '— fallback to store-type view only');
            this._markViewDirtyForStoreType(event.elementType);
        }

        if (this._dirtyViewIds.size > 0) {
            this._scheduleDebouncedFlush();
        }
    }

    /**
     * §G.3 — Fallback dirty-marking for unregistered (stale) element IDs.
     *
     * Called from `_onStoreEvent()` when an element ID is missing from
     * `_elementLevelMap` — typically because the element was unregistered
     * via undo then re-emitted by a stale CASCADE event.
     *
     * Marks all non-3D, non-system projectable views dirty.  Less aggressive
     * than the old "mark every view" approach while still covering the plan,
     * section, and elevation views that could display the element.
     *
     * A future refinement can add store-type → view-type filtering once the
     * IFC/structural view type strings are confirmed across all view factories.
     *
     * @param _elementType  The `StoreChangeEvent.elementType` string (reserved for future filtering).
     */
    private _markViewDirtyForStoreType(_elementType: string): void {
        for (const view of viewDefinitionStore.getAll()) {
            if (view.viewType === '3d') continue;
            this._dirtyViewIds.add(view.id);
        }
    }

    /**
     * Compute which views are affected by a change to an element on `levelId`.
     * Returns only views whose `spatial.levelId` matches (plan views) plus
     * section/elevation views that may intersect any level.
     *
     * §PERF-3D-SKIP: '3d' system views are excluded unconditionally.
     * 3D views display the live THREE.js scene mesh — they do NOT consume
     * EdgeProjectorService TechnicalDrawings and gain nothing from being
     * re-projected.  Including them triggers exportForView() over all 156
     * native groups + OBC edge projection of all 9,461 edge geometries,
     * observed as a 12,635ms LONGTASK after the curtain-wall batch.
     */
    private _getAffectedViews(_elementId: string, levelId: string): string[] {
        const affected: string[] = [];
        for (const view of viewDefinitionStore.getAll()) {
            // §PERF-3D-SKIP: 3D views show the live THREE.js scene; skip.
            if (view.viewType === '3d') continue;
            // Plan-family views: match by level only.
            if (view.spatial.levelId === levelId) {
                affected.push(view.id);
                continue;
            }
            // Section / elevation views are always affected when geometry changes,
            // as they may cut through the element's level.
            if (view.viewType === 'section' || view.viewType === 'elevation') {
                affected.push(view.id);
            }
        }
        return affected;
    }

    /** Start (or reset) the 300ms debounce timer. */
    private _scheduleDebouncedFlush(): void {
        if (this._debounceTimer !== null) clearTimeout(this._debounceTimer);
        this._debounceTimer = setTimeout(() => {
            this._debounceTimer = null;
            unifiedFrameLoop.queueLowPriority(() => this._flush());
        }, DEBOUNCE_MS);
    }

    /** Re-project all dirty views and clear the dirty set. */
    private async _flush(): Promise<void> {
        if (this._dirtyViewIds.size === 0) return;

        const toFlush = [...this._dirtyViewIds];
        this._dirtyViewIds.clear();

        console.log(
            `[ViewDependencyTracker] flush — ${toFlush.length} dirty view(s): ` +
            toFlush.map(id => id.slice(0, 8)).join(', '),
        );

        if (this.onReprojectionNeeded) {
            // DOC-1.5e: increment counter for ALL views atomically before the fan-out
            // begins; fire one UI transition (idle → reprojecting). Decrements happen
            // per-view in the finally blocks below.
            this._activeProjectionCount += toFlush.length;
            this._notifyReprojectionState();

            // §III-1 (Sprint 3): fan-out all views concurrently with Promise.all().
            //
            // Each view's re-projection (OBC WebWorker + EdgeProjectorService geometry
            // export) is fully independent — they share no mutable state and operate on
            // disjoint view IDs. Projecting in parallel reduces wall-clock time from
            // Σ projection[i] to max(projection[i]):
            //   4 views × ~50 ms each → 200 ms serial  ≈  55 ms parallel.
            //
            // DOC-1.5f: beginProjection() is called inside each closure BEFORE the
            // first await, so the generation counter is captured per-view even though
            // all map() closures start "simultaneously" (they run synchronously up to
            // their first await, which is inside onReprojectionNeeded).
            await Promise.all(toFlush.map(async (viewId) => {
                viewTechnicalDrawingCache.invalidate(viewId);
                const gen = viewTechnicalDrawingCache.beginProjection(viewId);
                try {
                    await this.onReprojectionNeeded!(viewId, gen);
                } catch (err) {
                    console.error(`[ViewDependencyTracker] re-projection failed for ${viewId}:`, err);
                } finally {
                    // DOC-1.5e: decrement per-view on completion (success or error).
                    this._activeProjectionCount = Math.max(0, this._activeProjectionCount - 1);
                    this._notifyReprojectionState();
                }
            }));
        } else {
            // No projection callback wired yet — just invalidate the cache.
            for (const viewId of toFlush) {
                viewTechnicalDrawingCache.invalidate(viewId);
            }
        }
    }

    /**
     * DOC-1.5e: Fire `onReprojectionStateChange` only on boolean transitions
     * (0→1 and N→0) to avoid redundant UI updates mid-batch.
     */
    private _notifyReprojectionState(): void {
        if (this.onReprojectionStateChange) {
            this.onReprojectionStateChange(this.isReprojecting);
        }
    }
}

// Singleton — wired into EngineBootstrap after EdgeProjectorService is ready.
export const viewDependencyTracker = new ViewDependencyTracker();
