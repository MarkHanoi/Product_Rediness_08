/**
 * SemanticIndex — O(1) semantic query index for BIM elements.
 *
 * Contract compliance:
 *   §01 §3.8  — Subscribes to StoreEventBus (read-only). Does not call stores directly. // TODO(TASK-08)
 *   §03 §1.1  — Maintains metadata.tags as a first-class index.
 *   §04       — Not part of AI layer; used by AIReadModel as a read source.
 *   §07       — No server routes; no DOM; no Three.js.
 *
 * Responsibility:
 *   - Single source of truth for element semantic tags (Phase A).
 *   - Provides `getElementsByTag(tag)` in O(1) via inverted index.
 *   - Clears stale entries when elements are deleted (via StoreEventBus). // TODO(TASK-08)
 *   - Exposes `evaluateQuery(expr, elementId)` for QueryExpression evaluation.
 *   - Serialisable for ProjectSnapshot persistence.
 *
 * Phase A: tags only.
 * Phase C: VisibilityRuleEngine will import SemanticQueryExpression from here.
 */

import { storeEventBus } from './StoreEventBus'; // TODO(TASK-08)
// DOC-5.4 — IFC Pset adapter: augments elementProps with Pset_*.Field values
// from IFC-imported elements so rules like { op:'eq', field:'Pset_WallCommon.FireRating', value:'2hr' }
// resolve transparently without callers (VGSceneApplicator, VisibilityRuleEngine) needing to change.
import { ifcPsetAdapter } from '@pryzm/core-app-model';

// ── QueryExpression type (Phase A — minimal set; extended in Phase C) ─────────

export type SemanticQueryExpression =
    | { op: 'eq';     field: string;  value: unknown }
    | { op: 'neq';    field: string;  value: unknown }
    | { op: 'gt';     field: string;  value: number  }
    | { op: 'lt';     field: string;  value: number  }
    | { op: 'hasTag'; value: string  }
    | { op: 'and';    conditions: SemanticQueryExpression[] }
    | { op: 'or';     conditions: SemanticQueryExpression[] }
    | { op: 'not';    condition:  SemanticQueryExpression };

// ── Serialisation shape ───────────────────────────────────────────────────────

interface SemanticIndexSnapshot {
    version: 1;
    tags: Array<{ elementId: string; tags: string[] }>;
}

// ── Implementation ────────────────────────────────────────────────────────────

class SemanticIndexImpl {
    /** elementId → Set of tags attached to that element */
    private _tags:  Map<string, Set<string>> = new Map();
    /** tag → Set of elementIds that carry the tag (inverted index) */
    private _byTag: Map<string, Set<string>> = new Map();

    constructor() {
        storeEventBus.subscribe((event) => {
            if (event.operation === 'delete') {
                this._clearElement(event.elementId);
            }
        });
    }

    // ── Tag mutation (called only by TagElementCommand) ──────────────────────

    addTags(elementId: string, tags: ReadonlyArray<string>): void {
        if (!tags.length) return;
        if (!this._tags.has(elementId)) {
            this._tags.set(elementId, new Set());
        }
        const elementTags = this._tags.get(elementId)!;
        for (const tag of tags) {
            const trimmed = tag.trim().toLowerCase();
            if (!trimmed) continue;
            elementTags.add(trimmed);
            if (!this._byTag.has(trimmed)) {
                this._byTag.set(trimmed, new Set());
            }
            this._byTag.get(trimmed)!.add(elementId);
        }
    }

    removeTags(elementId: string, tags: ReadonlyArray<string>): void {
        if (!tags.length) return;
        const elementTags = this._tags.get(elementId);
        if (!elementTags) return;
        for (const tag of tags) {
            const trimmed = tag.trim().toLowerCase();
            elementTags.delete(trimmed);
            this._byTag.get(trimmed)?.delete(elementId);
        }
        if (elementTags.size === 0) {
            this._tags.delete(elementId);
        }
    }

    /** Remove all tags for a deleted element. Called on StoreEventBus delete event. */ // TODO(TASK-08)
    private _clearElement(elementId: string): void {
        const tags = this._tags.get(elementId);
        if (!tags) return;
        for (const tag of tags) {
            this._byTag.get(tag)?.delete(elementId);
        }
        this._tags.delete(elementId);
    }

    // ── Tag query ─────────────────────────────────────────────────────────────

    getTags(elementId: string): ReadonlyArray<string> {
        const s = this._tags.get(elementId);
        return s ? [...s] : [];
    }

    hasTag(elementId: string, tag: string): boolean {
        return this._tags.get(elementId)?.has(tag.trim().toLowerCase()) ?? false;
    }

    /** Returns all elementIds that carry the given tag — O(1) lookup. */
    getElementsByTag(tag: string): string[] {
        const s = this._byTag.get(tag.trim().toLowerCase());
        return s ? [...s] : [];
    }

    /** Returns all tags tracked in this index (across all elements). */
    getAllTrackedTags(): string[] {
        return [...this._byTag.keys()].filter(tag => (this._byTag.get(tag)?.size ?? 0) > 0);
    }

    /** Returns a count summary: tag → number of elements carrying it. */
    getTagSummary(): Record<string, number> {
        const summary: Record<string, number> = {};
        for (const [tag, ids] of this._byTag.entries()) {
            if (ids.size > 0) summary[tag] = ids.size;
        }
        return summary;
    }

    // ── QueryExpression evaluation ────────────────────────────────────────────

    /**
     * Evaluates a SemanticQueryExpression against a single element.
     *
     * For `hasTag`: checks this index.
     * For `eq/neq/gt/lt`: resolves `field` from `elementProps`. If the field
     *   path contains a '.' (e.g. 'Pset_WallCommon.FireRating'), the IFC Pset
     *   adapter is also queried and its data is merged into `elementProps` at
     *   lower precedence — caller-supplied props always win (DOC-5.4).
     *   This makes `Pset_*.Field` queries work without any changes in
     *   VGSceneApplicator or VisibilityRuleEngine: the adapter lookup is
     *   transparent to all upstream callers.
     *
     * @param expr          The expression to evaluate.
     * @param elementId     The element's ID (used for `hasTag` and Pset adapter lookup).
     * @param elementProps  Flat key-value map of the element's queryable properties.
     */
    evaluateQuery(
        expr: SemanticQueryExpression,
        elementId: string,
        elementProps: Record<string, unknown> = {},
    ): boolean {
        switch (expr.op) {
            case 'hasTag':
                return this.hasTag(elementId, expr.value);
            case 'eq':
                return this._resolve(this._augmentProps(expr.field, elementId, elementProps), expr.field) === expr.value;
            case 'neq':
                return this._resolve(this._augmentProps(expr.field, elementId, elementProps), expr.field) !== expr.value;
            case 'gt':
                return (this._resolve(this._augmentProps(expr.field, elementId, elementProps), expr.field) as number) > expr.value;
            case 'lt':
                return (this._resolve(this._augmentProps(expr.field, elementId, elementProps), expr.field) as number) < expr.value;
            case 'and':
                return expr.conditions.every(c => this.evaluateQuery(c, elementId, elementProps));
            case 'or':
                return expr.conditions.some(c => this.evaluateQuery(c, elementId, elementProps));
            case 'not':
                return !this.evaluateQuery(expr.condition, elementId, elementProps);
            default:
                return false;
        }
    }

    /**
     * DOC-5.4 — Augments `elementProps` with IFC Pset adapter data when the
     * query field path contains a '.' (e.g. 'Pset_WallCommon.FireRating').
     *
     * Pset adapter data is merged at LOWER precedence than caller-supplied props:
     *   merged = { ...adapterProps, ...elementProps }
     * This guarantees callers can still override Pset values if needed.
     *
     * When the field has no '.' (flat native property), or when the adapter
     * has no data for this element, returns `elementProps` unchanged — O(1) no-op.
     */
    private _augmentProps(
        field: string,
        elementId: string,
        elementProps: Record<string, unknown>,
    ): Record<string, unknown> {
        // Only augment for dot-notation fields (Pset_*.Field pattern).
        // Flat native fields (e.g. 'type', 'levelId') never need the adapter.
        if (!field.includes('.')) return elementProps;

        // Skip adapter lookup if this element has no Pset data.
        if (!ifcPsetAdapter.has(elementId)) return elementProps;

        const psetProps = ifcPsetAdapter.getProperties(elementId);
        if (Object.keys(psetProps).length === 0) return elementProps;

        // Merge: adapter data at lower precedence, caller elementProps win.
        return { ...psetProps, ...elementProps };
    }

    /** Resolves a dot-notation field path from a flat props object. */
    private _resolve(props: Record<string, unknown>, field: string): unknown {
        const parts = field.split('.');
        let current: unknown = props;
        for (const part of parts) {
            if (current == null || typeof current !== 'object') return undefined;
            current = (current as Record<string, unknown>)[part];
        }
        return current;
    }

    // ── Persistence ───────────────────────────────────────────────────────────

    serialize(): SemanticIndexSnapshot {
        const tags: Array<{ elementId: string; tags: string[] }> = [];
        for (const [elementId, tagSet] of this._tags.entries()) {
            if (tagSet.size > 0) {
                tags.push({ elementId, tags: [...tagSet] });
            }
        }
        return { version: 1, tags };
    }

    deserialize(data: unknown): void {
        if (!data || typeof data !== 'object') return;
        const snapshot = data as SemanticIndexSnapshot;
        if (snapshot.version !== 1 || !Array.isArray(snapshot.tags)) return;

        this._tags.clear();
        this._byTag.clear();

        for (const entry of snapshot.tags) {
            if (entry.elementId && Array.isArray(entry.tags)) {
                this.addTags(entry.elementId, entry.tags);
            }
        }
    }

    /** Wipes all tags. Called by CLEAR_PROJECT / LOAD_PROJECT_SNAPSHOT commands. */
    reset(): void {
        this._tags.clear();
        this._byTag.clear();
    }
}

export const semanticIndex = new SemanticIndexImpl();
export type { SemanticIndexImpl };

import { projectScopeRegistry } from './persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'semanticIndex',
    clear: () => semanticIndex.reset(),
});
