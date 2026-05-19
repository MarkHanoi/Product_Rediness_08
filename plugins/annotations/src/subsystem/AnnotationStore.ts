/**
 * §ANN-A2 — View-Owned Annotation Store
 *
 * Stores all AnnotationElements, emits StoreEventBus events for every
 * mutation, and provides view-scoped read access.
 *
 * Contract compliance:
 *   §01 §3.3 — Implements ElementStore-like interface
 *   §3.8     — Publishes via storeEventBus singleton
 *   §05 §7.8 — No bim-* / @thatopen/ui elements; no DOM
 */

import { AnnotationElement, DimensionElement } from './AnnotationTypes';
import { storeEventBus } from '@pryzm/core-app-model';
import { validateAnnotationParameters } from './AnnotationParametersSchema';

type AnnotationEventType = 'add' | 'update' | 'remove';
type AnnotationEventListener = (type: AnnotationEventType, ann: AnnotationElement) => void;

// ─────────────────────────────────────────────────────────────────────────────
// AnnotationStore
// ─────────────────────────────────────────────────────────────────────────────

export class AnnotationStore {
    private _data = new Map<string, AnnotationElement>();
    private _listeners: AnnotationEventListener[] = [];

    // ── §DIM-VIII-1 — DimensionElement parallel store ─────────────────────────
    private _dims = new Map<string, DimensionElement>();
    private _dimListeners: Array<(type: AnnotationEventType, dim: DimensionElement) => void> = [];

    // ── CRUD ─────────────────────────────────────────────────────────────────

    add(element: AnnotationElement): void {
        if (this._data.has(element.id)) {
            console.warn(`[AnnotationStore] add(): id already exists — ${element.id}`);
            return;
        }
        // ANNOTATION-SYSTEM-AUDIT-2026 B1 — non-fatal parameters validation
        const v = validateAnnotationParameters(element.type, element.parameters);
        if (!v.ok) {
            console.warn(`[AnnotationStore] add(): parameters failed schema check — ${v.message}`);
        }
        this._data.set(element.id, Object.freeze({ ...element }));
        storeEventBus.emit({
            elementId: element.id,
            elementType: `annotation:${element.type}`,
            operation: 'create',
            timestamp: Date.now(),
        });
        this._notify('add', element);
    }

    update(partial: Partial<AnnotationElement> & { id: string }): void {
        const existing = this._data.get(partial.id);
        if (!existing) {
            console.warn(`[AnnotationStore] update(): id not found — ${partial.id}`);
            return;
        }
        const next = Object.freeze({ ...existing, ...partial, updatedAt: Date.now() });
        // ANNOTATION-SYSTEM-AUDIT-2026 B1 — non-fatal parameters validation
        if (partial.parameters !== undefined) {
            const v = validateAnnotationParameters(next.type, next.parameters);
            if (!v.ok) {
                console.warn(`[AnnotationStore] update(): parameters failed schema check — ${v.message}`);
            }
        }
        this._data.set(partial.id, next);
        storeEventBus.emit({
            elementId: partial.id,
            elementType: `annotation:${next.type}`,
            operation: 'update',
            timestamp: Date.now(),
        });
        this._notify('update', next);
    }

    remove(id: string): void {
        const existing = this._data.get(id);
        if (!existing) return;
        this._data.delete(id);
        storeEventBus.emit({
            elementId: id,
            elementType: `annotation:${existing.type}`,
            operation: 'delete',
            timestamp: Date.now(),
        });
        this._notify('remove', existing);
    }

    // ── Queries ───────────────────────────────────────────────────────────────

    getById(id: string): AnnotationElement | undefined {
        return this._data.get(id);
    }

    getAll(): AnnotationElement[] {
        return Array.from(this._data.values());
    }

    getByView(ownerViewId: string): AnnotationElement[] {
        const result: AnnotationElement[] = [];
        this._data.forEach(ann => {
            if (ann.ownerViewId === ownerViewId) result.push(ann);
        });
        return result;
    }

    getByType(type: AnnotationElement['type']): AnnotationElement[] {
        const result: AnnotationElement[] = [];
        this._data.forEach(ann => {
            if (ann.type === type) result.push(ann);
        });
        return result;
    }

    has(id: string): boolean {
        return this._data.has(id);
    }

    get count(): number {
        return this._data.size;
    }

    // ── Snapshot (for undo/redo) ──────────────────────────────────────────────
    // ANNOTATION-SYSTEM-AUDIT-2026 A3 — snapshot() now captures BOTH the
    // annotations Map and the parallel dimensions Map (`_dims`). Previously
    // only `_data` was returned, so any undo path that relied on snapshot()
    // would silently restore annotations while losing every DimensionElement
    // created in the same time window. Backwards compatibility for callers
    // that still pass a bare `Map<string, AnnotationElement>` is preserved
    // by restoreSnapshot() below.

    snapshot(): {
        annotations: Map<string, AnnotationElement>;
        dimensions:  Map<string, DimensionElement>;
    } {
        const annotations = new Map<string, AnnotationElement>();
        this._data.forEach((v, k) => annotations.set(k, { ...v }));
        const dimensions = new Map<string, DimensionElement>();
        this._dims.forEach((v, k) => dimensions.set(k, { ...v }));
        return { annotations, dimensions };
    }

    restoreSnapshot(
        snap:
            | { annotations: Map<string, AnnotationElement>; dimensions: Map<string, DimensionElement> }
            | Map<string, AnnotationElement>
    ): void {
        // Legacy shape — bare Map of annotations only.
        if (snap instanceof Map) {
            this._data.clear();
            snap.forEach((v, k) => this._data.set(k, Object.freeze({ ...v })));
            // Dimensions intentionally left untouched in the legacy code path
            // so we do not destroy state the legacy caller did not capture.
            return;
        }

        this._data.clear();
        snap.annotations.forEach((v, k) => this._data.set(k, Object.freeze({ ...v })));

        this._dims.clear();
        snap.dimensions.forEach((v, k) => this._dims.set(k, Object.freeze({ ...v })));
    }

    clear(): void {
        this._data.clear();
        this._dims.clear();
    }

    // ── Persistence API (ProjectSnapshot) ────────────────────────────────────

    serialize(): { version: 1; annotations: AnnotationElement[]; dimensions: DimensionElement[] } {
        return {
            version: 1,
            annotations: Array.from(this._data.values()).map(a => ({ ...a })),
            dimensions:  Array.from(this._dims.values()).map(d => ({ ...d })),
        };
    }

    deserialize(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const snap = data as { version?: number; annotations?: AnnotationElement[]; dimensions?: DimensionElement[] };
        if (snap.version !== 1) return;

        this._data.clear();
        if (Array.isArray(snap.annotations)) {
            for (const ann of snap.annotations) {
                if (ann?.id) this._data.set(ann.id, Object.freeze({ ...ann }));
            }
        }

        this._dims.clear();
        if (Array.isArray(snap.dimensions)) {
            for (const dim of snap.dimensions) {
                if (dim?.id) this._dims.set(dim.id, Object.freeze({ ...dim }));
            }
        }
    }

    // ── §DIM-VIII-1 — DimensionElement CRUD ──────────────────────────────────

    addDimension(dim: DimensionElement): void {
        if (this._dims.has(dim.id)) {
            console.warn(`[AnnotationStore] addDimension(): id already exists — ${dim.id}`);
            return;
        }
        this._dims.set(dim.id, Object.freeze({ ...dim }));
        storeEventBus.emit({
            elementId: dim.id,
            elementType: 'annotation:linear-dimension',
            operation: 'create',
            timestamp: Date.now(),
        });
        this._notifyDim('add', dim);
    }

    updateDimension(partial: Partial<DimensionElement> & { id: string }): void {
        const existing = this._dims.get(partial.id);
        if (!existing) {
            console.warn(`[AnnotationStore] updateDimension(): id not found — ${partial.id}`);
            return;
        }
        const next = Object.freeze({ ...existing, ...partial, updatedAt: Date.now() });
        this._dims.set(partial.id, next);
        storeEventBus.emit({
            elementId: partial.id,
            elementType: 'annotation:linear-dimension',
            operation: 'update',
            timestamp: Date.now(),
        });
        this._notifyDim('update', next);
    }

    removeDimension(id: string): void {
        const existing = this._dims.get(id);
        if (!existing) return;
        this._dims.delete(id);
        storeEventBus.emit({
            elementId: id,
            elementType: 'annotation:linear-dimension',
            operation: 'delete',
            timestamp: Date.now(),
        });
        this._notifyDim('remove', existing);
    }

    getDimensionById(id: string): DimensionElement | undefined {
        return this._dims.get(id);
    }

    getDimensionsByView(viewId: string): DimensionElement[] {
        const result: DimensionElement[] = [];
        this._dims.forEach(dim => {
            if (dim.viewId === viewId) result.push(dim);
        });
        return result;
    }

    getAllDimensions(): DimensionElement[] {
        return Array.from(this._dims.values());
    }

    hasDimension(id: string): boolean {
        return this._dims.has(id);
    }

    onDimensionChange(
        listener: (type: AnnotationEventType, dim: DimensionElement) => void,
    ): () => void {
        this._dimListeners.push(listener);
        return () => {
            this._dimListeners = this._dimListeners.filter(l => l !== listener);
        };
    }

    private _notifyDim(type: AnnotationEventType, dim: DimensionElement): void {
        this._dimListeners.forEach(l => {
            try { l(type, dim); } catch (e) {
                console.error('[AnnotationStore] dimension listener error:', e);
            }
        });
    }

    // ── Events ────────────────────────────────────────────────────────────────

    onChange(listener: AnnotationEventListener): () => void {
        this._listeners.push(listener);
        return () => {
            this._listeners = this._listeners.filter(l => l !== listener);
        };
    }

    private _notify(type: AnnotationEventType, ann: AnnotationElement): void {
        this._listeners.forEach(l => {
            try { l(type, ann); } catch (e) {
                console.error('[AnnotationStore] listener error:', e);
            }
        });
    }
}

/** Module-level singleton — mirrors the pattern used by viewDefinitionStore, sheetStore, etc. */
export const annotationStore = new AnnotationStore();

import { projectScopeRegistry } from '@pryzm/core-app-model';
projectScopeRegistry.register({
    scopeName: 'annotationStore',
    clear: () => annotationStore.clear(),
});
