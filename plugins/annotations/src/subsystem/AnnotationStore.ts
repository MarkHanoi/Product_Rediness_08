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

/**
 * §ANN-UNDO-ARITY — the flat `AnnotationsState` ledger record shape (see
 * `handlers/canonicalAnnotationSink.ts`). Declared here, not imported, because the sink
 * imports THIS module; a cycle would evaluate a barrel at module load (the SCC failure).
 */
interface FlatLedgerRecord {
    id: string;
    viewId?: string;
    kind?: string;
    systemTypeId?: string;
    anchor?: { x: number; y: number; z: number };
    text?: string;
    rotation?: number;
    textHeightMm?: number;
    color?: string;
    hostElementId?: string;
}

function _isFlatLedgerRecord(r: unknown): r is FlatLedgerRecord {
    if (!r || typeof r !== 'object') return false;
    const o = r as Record<string, unknown>;
    // A canonical element ALWAYS has `type` + `geometry2D`; a ledger record never does.
    return typeof o['id'] === 'string' && (o['type'] === undefined || o['geometry2D'] === undefined);
}

function _liftLedgerRecord(r: FlatLedgerRecord): AnnotationElement {
    const anchor = r.anchor ?? { x: 0, y: 0, z: 0 };
    const now = Date.now();
    return {
        id: r.id,
        type: (r.kind ?? 'text-note') as AnnotationElement['type'],
        systemTypeId: r.systemTypeId,
        ownerViewId: r.viewId ?? '',
        references: [],
        geometry2D: { modelPoints: [anchor], offset: 0 },
        style: {
            ...(r.textHeightMm !== undefined ? { textSizeMm: r.textHeightMm } : {}),
            ...(r.color !== undefined ? { textColor: r.color, lineColor: r.color } : {}),
        },
        parameters: {
            ...(r.text !== undefined ? { text: r.text } : {}),
            ...(r.rotation !== undefined ? { rotation: r.rotation } : {}),
            ...(r.hostElementId !== undefined ? { targetElementId: r.hostElementId } : {}),
        },
        isDriving: false,
        createdAt: now,
        updatedAt: now,
    };
}

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

    add(record: AnnotationElement | FlatLedgerRecord): void {
        // §ANN-UNDO-ARITY — a REDO can hand this store the flat `AnnotationsState` ledger
        // record carried in the forward patch rather than the canonical element (the undo
        // adapter prefers its own snapshot, but that stash is per-session module state and
        // is empty on a redo whose undo happened before a reload). Storing the flat shape
        // verbatim produces an element with no `geometry2D` and no `type`: it renders
        // nothing, exports nothing, and looks to the user exactly like "redo did nothing".
        // Lift it, and SAY so — a silent coercion is how the two shapes drifted apart.
        const element = _isFlatLedgerRecord(record) ? _liftLedgerRecord(record) : record;
        if (element !== record) {
            console.warn(
                `[AnnotationStore] add(): §ANN-UNDO-ARITY lifted a flat ledger record to a ` +
                `canonical AnnotationElement — ${element.id} (${element.type})`,
            );
        }
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

    /**
     * §ANN-UNDO-ARITY — accepts BOTH call shapes:
     *   update({ id, ...patch })     — the subsystem's own callers
     *   update(id, patch)            — `elementUndoStoreAdapter`, i.e. Ctrl+Z
     *
     * THE DEFECT THIS CLOSES, and it is the one the founder reported as "annotations
     * don't undo". `buildUndoStoreMap()` binds the store key `'annotation'` to THIS
     * store, and `elementUndoStoreAdapter` drives field-level patches through
     * `store.update(id, { field: value })` — TWO arguments. Every other element store in
     * PRYZM has that signature; this one took a single merged object. So the adapter's
     * `id` string landed in `partial`, `partial.id` was `undefined`, the guard below
     * logged "id not found" and RETURNED — the undo silently did nothing while the undo
     * stack cursor had already advanced. Whole-element undo (remove/add) worked, which
     * is exactly why a store-level audit concluded "undo is innocent": it inspected the
     * mapping, which was correct, and not the call, which was not.
     */
    update(
        partialOrId: (Partial<AnnotationElement> & { id: string }) | string,
        patch?: Partial<AnnotationElement>,
    ): void {
        const partial: Partial<AnnotationElement> & { id: string } =
            typeof partialOrId === 'string'
                ? { ...(patch ?? {}), id: partialOrId }
                : partialOrId;
        if (typeof partial?.id !== 'string') {
            console.warn('[AnnotationStore] update(): called with no id', partialOrId, patch);
            return;
        }
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
