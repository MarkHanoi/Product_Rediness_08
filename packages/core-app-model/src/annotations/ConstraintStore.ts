/**
 * ConstraintStore — §C3
 *
 * Stores `ConstraintRecord` objects derived from locked linear dimension
 * annotations.  Pure data store with no DOM, no Three.js, and no store
 * side-effects (read-only access to AnnotationStore for seeding).
 *
 * Lifecycle:
 *   - Instantiated once in AnnotationManager.init()
 *   - Records created via createFromAnnotation() after a locked dimension is placed
 *   - Records read by ConstraintSolver.checkAll() after element changes
 *   - Records updated (lastResult / violationDeltaMetres) by ConstraintSolver
 *
 * CONTRACT COMPLIANCE:
 *   §01 §4   — No DOM queries, no scene mutations
 *   §01 §5   — No direct store writes; only AnnotationManager calls write methods
 *   §03      — Does not access WallStore directly
 */

import type { StableReference } from './AnnotationReference';
import type { AnnotationElement } from './AnnotationTypes';

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type ConstraintOperator = '>=' | '<=' | '==' | '>' | '<';

export interface ConstraintRecord {
    /** Unique stable ID (crypto.randomUUID at creation) */
    id: string;
    /** The AnnotationElement (linear-dim) this was derived from */
    sourceAnnotationId: string;
    /** 'hard' → violation is flagged prominently; 'soft' → advisory only */
    type: 'hard' | 'soft';
    /** Comparison operator applied as: actualDistance {operator} valueMetres */
    operator: ConstraintOperator;
    /** Target distance in metres */
    valueMetres: number;
    /** Human-readable label, e.g. "A–B ≥ 1.200 m" */
    description: string;
    /** Two stable references whose resolved distance is measured */
    references: [StableReference, StableReference];
    /** Last solver evaluation result */
    lastResult: 'satisfied' | 'violated' | 'unknown';
    /** Signed delta: actual − target.  Negative = under-satisfied. */
    violationDeltaMetres: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ConstraintStore
// ─────────────────────────────────────────────────────────────────────────────

export class ConstraintStore {
    private _records = new Map<string, ConstraintRecord>();

    // ── Listeners (called by AnnotationManager after solver runs) ─────────────
    private _listeners: Array<(records: ConstraintRecord[]) => void> = [];

    // ── Read ──────────────────────────────────────────────────────────────────

    get all(): ConstraintRecord[] {
        return Array.from(this._records.values());
    }

    getById(id: string): ConstraintRecord | undefined {
        return this._records.get(id);
    }

    getByAnnotationId(annotationId: string): ConstraintRecord | undefined {
        for (const r of this._records.values()) {
            if (r.sourceAnnotationId === annotationId) return r;
        }
        return undefined;
    }

    get size(): number { return this._records.size; }

    // ── Write (called only from AnnotationManager) ────────────────────────────

    /**
     * Create and store a ConstraintRecord from a locked linear-dim annotation.
     * Returns null if the annotation is missing the required locked fields.
     */
    createFromAnnotation(element: AnnotationElement): ConstraintRecord | null {
        const p = element.parameters ?? {};
        if (!p.isLocked) return null;
        if (element.type !== 'linear-dim') return null;
        if (element.references.length < 2) return null;

        const operator = (p.constraintOperator as ConstraintOperator | undefined) ?? '==';
        const valueMetres = (p.constraintValueMetres as number | undefined) ?? 0;
        const constraintType = (p.constraintType as 'hard' | 'soft' | undefined) ?? 'soft';

        const opLabel: Record<ConstraintOperator, string> = {
            '>=': '≥', '<=': '≤', '==': '=', '>': '>', '<': '<',
        };

        const formattedVal = valueMetres >= 1
            ? `${valueMetres.toFixed(3)} m`
            : `${(valueMetres * 1000).toFixed(0)} mm`;

        const record: ConstraintRecord = {
            id: crypto.randomUUID(),
            sourceAnnotationId: element.id,
            type: constraintType,
            operator,
            valueMetres,
            description: `Dim ${opLabel[operator]} ${formattedVal}`,
            references: [element.references[0]!, element.references[1]!],
            lastResult: 'unknown',
            violationDeltaMetres: 0,
        };

        this._records.set(record.id, record);
        console.log('[ConstraintStore] Created constraint:', record.id, record.description);
        return record;
    }

    /**
     * Update a record's solver result in-place.
     * Called by ConstraintSolver after evaluation.
     */
    updateResult(
        id: string,
        result: 'satisfied' | 'violated' | 'unknown',
        deltaMetres: number
    ): void {
        const r = this._records.get(id);
        if (!r) return;
        r.lastResult = result;
        r.violationDeltaMetres = deltaMetres;
    }

    /** Remove a constraint when the source annotation is deleted */
    deleteByAnnotationId(annotationId: string): void {
        for (const [id, r] of this._records) {
            if (r.sourceAnnotationId === annotationId) {
                this._records.delete(id);
                console.log('[ConstraintStore] Deleted constraint:', id);
            }
        }
    }

    /** Completely clear the store (e.g. on project close) */
    clear(): void {
        this._records.clear();
    }

    // ── ANNOTATION-SYSTEM-AUDIT-2026 A4 — Persistence + restore ──────────────

    /**
     * Re-insert a previously stored ConstraintRecord verbatim. Unlike
     * createFromAnnotation(), this does NOT regenerate `id` or
     * `description`, so it is safe to call from undo() and from
     * deserialize() without losing the original record identity.
     */
    restoreRecord(record: ConstraintRecord): void {
        if (!record || typeof record.id !== 'string') return;
        // Defensive shallow clone so external mutation does not bleed into
        // the store after restore.
        this._records.set(record.id, { ...record, references: [record.references[0], record.references[1]] });
    }

    /**
     * Serialize all constraint records for project save.
     * Mirrors AnnotationStore.serialize() shape (versioned envelope).
     */
    serialize(): { version: 1; records: ConstraintRecord[] } {
        return {
            version: 1,
            records: this.all.map(r => ({
                ...r,
                references: [r.references[0], r.references[1]],
            })),
        };
    }

    /**
     * Hydrate from a previously serialized payload. Replaces all records.
     * Unknown / future versions are ignored (forwards-compatible no-op).
     */
    deserialize(payload: any): void {
        this._records.clear();
        if (!payload || typeof payload !== 'object') return;
        if (payload.version !== 1) return;
        const list = Array.isArray(payload.records) ? payload.records : [];
        for (const r of list) {
            if (r && typeof r.id === 'string') this.restoreRecord(r as ConstraintRecord);
        }
    }

    // ── Reactivity ────────────────────────────────────────────────────────────

    /**
     * Subscribe to changes. Callback is fired after every solver run.
     * @returns unsubscribe function
     */
    subscribe(cb: (records: ConstraintRecord[]) => void): () => void {
        this._listeners.push(cb);
        return () => {
            this._listeners = this._listeners.filter(l => l !== cb);
        };
    }

    /** Notify subscribers — called by AnnotationManager after solver completes */
    notifyListeners(): void {
        const all = this.all;
        this._listeners.forEach(cb => cb(all));
    }
}

/** Module-level singleton — shared across the annotation system */
export const constraintStore = new ConstraintStore();

import { projectScopeRegistry } from '@pryzm/core-app-model';
projectScopeRegistry.register({
    scopeName: 'constraintStore',
    clear: () => constraintStore.clear(),
});
