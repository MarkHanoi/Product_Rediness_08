/**
 * §ANN-A3 — Annotation Dependency Graph (reactive dirty-flag propagation)
 *
 * Subscribes to the StoreEventBus and maintains a reverse index:
 *   elementId → Set<annotationId>
 *
 * When a BIM element is updated or deleted, all annotations that reference
 * that element are marked dirty. The graph schedules a single async flush
 * (via queueMicrotask) to re-resolve world points for dirty annotations and
 * notify the render layer.
 *
 * DOC-4.5 — O(1) incremental index:
 *   A second reverse map  (_annotationToElements: annotationId → Set<elementId>)
 *   enables O(1) removal when an annotation is updated or deleted without
 *   scanning every annotation in the store (previously O(N) full rebuild).
 *
 *   _rebuildIndex()  is called ONCE at init() for the initial full state.
 *   After that, every add/update/remove operates in O(k) where k = number of
 *   reference points on the changed annotation (typically ≤ 4).  For >10k
 *   annotations this eliminates the O(N) per-mutation rebuild bottleneck.
 *
 * Contract compliance:
 *   §3.8 — Consumes StoreEventBus
 *   §01 §5 — No DOM, no Three.js
 */

import { storeEventBus, StoreChangeEvent } from '@pryzm/core-app-model';
import { AnnotationStore } from './AnnotationStore';
import { AnnotationElement } from './AnnotationTypes';
import { resolveReferenceToPoint, ResolverStores } from './AnnotationReference';

// ─────────────────────────────────────────────────────────────────────────────

export class AnnotationDependencyGraph {
    /** Forward index: elementId → Set of annotationIds that reference it */
    private _elementToAnnotations = new Map<string, Set<string>>();
    /**
     * DOC-4.5 — Reverse index: annotationId → Set of elementIds it references.
     * Enables O(1) removal of an annotation's entries without scanning all annotations.
     */
    private _annotationToElements = new Map<string, Set<string>>();
    /** Annotations currently marked as needing recalculation */
    private _dirty = new Set<string>();
    /** Pending flush task (avoids multiple microtasks in one event burst) */
    private _flushScheduled = false;
    /** Listeners notified after each flush */
    private _onDirtyFlushed: Array<(ids: string[]) => void> = [];

    private _unsubscribeBus: (() => void) | null = null;

    constructor(
        private _store: AnnotationStore,
        private _resolverStores: ResolverStores
    ) {}

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    init(): void {
        // Full rebuild once at startup — O(N) acceptable here.
        this._rebuildIndex();

        // DOC-4.5 — Incremental updates instead of O(N) full rebuild per event.
        this._store.onChange((type, ann) => {
            switch (type) {
                case 'add':
                    this._addToIndex(ann);
                    break;
                case 'update':
                    this._updateInIndex(ann);
                    break;
                case 'remove':
                    this._removeFromIndex(ann.id);
                    break;
            }
        });

        this._unsubscribeBus = storeEventBus.subscribe(this._onStoreEvent);
    }

    dispose(): void {
        this._unsubscribeBus?.();
        this._unsubscribeBus = null;
        this._elementToAnnotations.clear();
        this._annotationToElements.clear();
        this._dirty.clear();
        this._onDirtyFlushed = [];
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /** Called by AnnotationRenderLayer to know which annotations need re-render */
    onDirtyFlushed(cb: (dirtyAnnotationIds: string[]) => void): () => void {
        this._onDirtyFlushed.push(cb);
        return () => {
            this._onDirtyFlushed = this._onDirtyFlushed.filter(l => l !== cb);
        };
    }

    /** Force a full refresh of all annotation world points */
    refreshAll(): void {
        const allIds = this._store.getAll().map(a => a.id);
        this._scheduleFlush(allIds);
    }

    /** Update the resolver stores when they change (e.g. after project load) */
    setResolverStores(stores: ResolverStores): void {
        this._resolverStores = stores;
    }

    /**
     * ANNOTATION-SYSTEM-AUDIT-2026 — A5
     *
     * Public re-index entry point. ProjectLoader calls this after deserialising
     * the AnnotationStore so the reverse index reflects the loaded annotations.
     * Without this rebuild, the dependency graph is empty after a project load
     * and incremental BIM-element changes never propagate back to annotations.
     *
     * Also schedules a flush of every annotation so cached world points are
     * recomputed against the freshly hydrated BIM stores.
     */
    rebuild(): void {
        this._rebuildIndex();
        // Mark every annotation dirty so reference cachedPosition is refreshed.
        const allIds = this._store.getAll().map(a => a.id);
        if (allIds.length > 0) this._scheduleFlush(allIds);
    }

    // ── Private — event handler ───────────────────────────────────────────────

    private _onStoreEvent = (event: StoreChangeEvent): void => {
        // Only care about non-annotation element changes
        if (event.elementType.startsWith('annotation:')) return;

        const affected = this._elementToAnnotations.get(event.elementId);
        if (!affected || affected.size === 0) return;

        affected.forEach(id => this._dirty.add(id));
        this._scheduleFlush();
    };

    // ── Private — incremental index operations (DOC-4.5) ─────────────────────

    /**
     * Add a newly-created annotation's references into both indexes.
     * O(k) where k = ann.references.length.
     */
    private _addToIndex(ann: AnnotationElement): void {
        const elements = new Set<string>();
        for (const ref of ann.references) {
            if (ref.elementType === 'point') continue;
            const eId = ref.elementId;
            if (!eId) continue;
            elements.add(eId);
            if (!this._elementToAnnotations.has(eId)) {
                this._elementToAnnotations.set(eId, new Set());
            }
            this._elementToAnnotations.get(eId)!.add(ann.id);
        }
        if (elements.size > 0) {
            this._annotationToElements.set(ann.id, elements);
        }
    }

    /**
     * Remove all forward index entries for an annotation using the reverse index.
     * O(k) — no full scan required.
     */
    private _removeFromIndex(annotationId: string): void {
        const elements = this._annotationToElements.get(annotationId);
        if (!elements) return;
        for (const eId of elements) {
            const set = this._elementToAnnotations.get(eId);
            if (set) {
                set.delete(annotationId);
                if (set.size === 0) this._elementToAnnotations.delete(eId);
            }
        }
        this._annotationToElements.delete(annotationId);
    }

    /**
     * Handle an annotation update by removing its old index entries and adding
     * the new ones from the updated annotation.  O(k_old + k_new).
     */
    private _updateInIndex(ann: AnnotationElement): void {
        this._removeFromIndex(ann.id);
        this._addToIndex(ann);
    }

    // ── Private — flush ───────────────────────────────────────────────────────

    private _scheduleFlush(explicitIds?: string[]): void {
        if (explicitIds) {
            explicitIds.forEach(id => this._dirty.add(id));
        }
        if (this._flushScheduled) return;
        this._flushScheduled = true;
        queueMicrotask(() => this._flush());
    }

    private _flush(): void {
        this._flushScheduled = false;
        if (this._dirty.size === 0) return;

        const toRefresh = Array.from(this._dirty);
        this._dirty.clear();

        toRefresh.forEach(annotationId => {
            const ann = this._store.getById(annotationId);
            if (!ann) return;

            // ANNOTATION-SYSTEM-AUDIT-2026 B6 — track whether any non-point
            // reference (i.e. one that is supposed to attach to a real BIM
            // element) failed to resolve. If so we mark the annotation as
            // orphaned via parameters._orphaned so renderers and the
            // inspector can render it greyed-out / warning.  Pure
            // free-floating point refs are excluded because they have no
            // host element to lose.
            let orphaned = false;
            const updatedRefs = ann.references.map(ref => {
                const pt = resolveReferenceToPoint(ref, this._resolverStores);
                if (!pt) {
                    if (ref.elementType !== 'point') orphaned = true;
                    return ref;
                }
                return {
                    ...ref,
                    cachedPosition: { x: pt.x, y: pt.y, z: pt.z },
                };
            });

            const prevOrphaned = !!(ann.parameters as any)?._orphaned;
            const nextParameters = (orphaned !== prevOrphaned)
                ? { ...(ann.parameters ?? {}), _orphaned: orphaned }
                : ann.parameters;

            this._store.update({
                id: annotationId,
                references: updatedRefs,
                ...(nextParameters !== ann.parameters ? { parameters: nextParameters as any } : {}),
            });
        });

        this._onDirtyFlushed.forEach(cb => {
            try { cb(toRefresh); } catch (e) {
                console.error('[AnnotationDependencyGraph] flush callback error:', e);
            }
        });
    }

    /**
     * Full index rebuild — O(N).  Called only once at init().
     * All subsequent mutations use the incremental _addToIndex / _removeFromIndex /
     * _updateInIndex methods.
     */
    private _rebuildIndex(): void {
        this._elementToAnnotations.clear();
        this._annotationToElements.clear();
        this._store.getAll().forEach(ann => this._addToIndex(ann));
    }
}
