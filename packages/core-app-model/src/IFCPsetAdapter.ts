/**
 * IFCPsetAdapter — DOC-5.4
 *
 * Maps IFC property set data (Pset_*.Field) to a flat dot-notation record
 * that SemanticIndex.evaluateQuery() can resolve via its `_resolve()` path.
 *
 * **Problem DOC-5.4 solves:**
 * VisibilityRuleEngine can evaluate QueryExpressions like
 * `{ op: 'eq', field: 'Pset_WallCommon.FireRating', value: '2hr' }` against
 * native PRYZM element properties. However IFC-imported elements carry their
 * property set data in a nested format (`psetName → { fieldName → value }`),
 * not as flat keys that SemanticIndex._resolve() can traverse. This adapter
 * flattens Pset data at ingest time and provides O(1) lookup by elementId.
 *
 * **How it integrates with SemanticIndex (§03 §2.3 re-use existing evaluators):**
 * SemanticIndex.evaluateQuery() imports `ifcPsetAdapter` directly and merges
 * adapter properties into `elementProps` whenever the query field starts with
 * `Pset_`. No changes are needed in VGSceneApplicator, VisibilityRuleEngine,
 * or any command — the Pset lookup is transparent to all callers.
 *
 * **Pset ingestion contract:**
 * IFC loading code calls `ifcPsetAdapter.ingest(elementId, psets)` where
 * `psets` is the nested Pset dict obtained from OBC IfcPropertiesManager:
 *
 * ```typescript
 * ifcPsetAdapter.ingest('uuid-of-wall', {
 *   Pset_WallCommon: { FireRating: '2hr', IsExternal: true },
 *   Pset_Revit_Type_Other: { TypeName: 'Basic Wall' },
 * });
 * // → stored as:
 * // { 'Pset_WallCommon.FireRating': '2hr',
 * //   'Pset_WallCommon.IsExternal': true,
 * //   'Pset_Revit_Type_Other.TypeName': 'Basic Wall' }
 * ```
 *
 * Alternatively, `ingestFlat()` accepts a pre-flattened record (e.g. when
 * Pset data is already dot-notation from a database load or IFC parse cache).
 *
 * **Auto-cleanup:**
 * Subscribes to StoreEventBus `delete` events — stale Pset entries are removed // TODO(TASK-08)
 * when an element is deleted, preventing memory leaks in long-running sessions.
 *
 * **Architecture rules (§01 §3.8, §05 §1.1):**
 * - No DOM, no Three.js, no store writes.
 * - No circular imports — storeEventBus is the only external dependency.
 * - Module-level singleton exported as `ifcPsetAdapter`.
 *   Not registered in StoreRegistry (not a PRYZM store — read-only cache).
 */

import { storeEventBus } from './StoreEventBus'; // TODO(TASK-08)

// ── Internal storage types ────────────────────────────────────────────────────

/**
 * Nested Pset dict as provided by IFC property parsers.
 * Key = Pset name (e.g. 'Pset_WallCommon').
 * Value = a field map (e.g. { FireRating: '2hr', IsExternal: true }).
 */
export type IFCPsetDict = Record<string, Record<string, unknown>>;

/**
 * Flat dot-notation property record.
 * Key = 'PsetName.FieldName' (e.g. 'Pset_WallCommon.FireRating').
 * Value = raw IFC property value.
 */
export type IFCFlatProps = Record<string, unknown>;

// ── Implementation ────────────────────────────────────────────────────────────

class IFCPsetAdapterImpl {
    /** elementId → flat dot-notation property record */
    private _store: Map<string, IFCFlatProps> = new Map();

    constructor() {
        // §01 §3.8: Subscribe to StoreEventBus for auto-cleanup on element delete.
        storeEventBus.subscribe((event) => {
            if (event.operation === 'delete') {
                this._store.delete(event.elementId);
            }
        });
    }

    // ── Ingestion ─────────────────────────────────────────────────────────────

    /**
     * Ingest nested Pset data for an element.
     *
     * Flattens `{ PsetName: { FieldName: value } }` → `{ 'PsetName.FieldName': value }`.
     * Merges into any existing flat record for the element (additive — supports
     * partial Pset loads where different Psets are ingested at different times).
     *
     * @param elementId  The PRYZM/IFC element UUID.
     * @param psets      Nested Pset dict from IFC property parser.
     */
    ingest(elementId: string, psets: IFCPsetDict): void {
        if (!elementId || typeof psets !== 'object' || psets === null) return;

        const existing = this._store.get(elementId) ?? {};
        const flat: IFCFlatProps = { ...existing };

        for (const [psetName, fields] of Object.entries(psets)) {
            if (!psetName || typeof fields !== 'object' || fields === null) continue;
            for (const [fieldName, value] of Object.entries(fields)) {
                if (!fieldName) continue;
                flat[`${psetName}.${fieldName}`] = value;
            }
        }

        if (Object.keys(flat).length > 0) {
            this._store.set(elementId, flat);
        }
    }

    /**
     * Ingest a pre-flattened dot-notation property record.
     *
     * Use when Pset data is already flat (e.g. from a database load or
     * IFC parse cache that stores `'Pset_WallCommon.FireRating': '2hr'`).
     * Merges into any existing record for the element.
     *
     * @param elementId  The PRYZM/IFC element UUID.
     * @param flatProps  Flat dot-notation property record.
     */
    ingestFlat(elementId: string, flatProps: IFCFlatProps): void {
        if (!elementId || typeof flatProps !== 'object' || flatProps === null) return;
        const existing = this._store.get(elementId) ?? {};
        const merged = { ...existing, ...flatProps };
        if (Object.keys(merged).length > 0) {
            this._store.set(elementId, merged);
        }
    }

    // ── Query ─────────────────────────────────────────────────────────────────

    /**
     * Returns the flat dot-notation property record for an element.
     * Returns an empty object if no Pset data has been ingested for this element.
     *
     * Called by SemanticIndex.evaluateQuery() when the query field contains a '.'
     * indicating a potential Pset_*.Field path.
     */
    getProperties(elementId: string): IFCFlatProps {
        return this._store.get(elementId) ?? {};
    }

    /**
     * Returns true if any Pset data has been ingested for the given element.
     */
    has(elementId: string): boolean {
        return this._store.has(elementId);
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    /**
     * Explicitly remove all Pset data for an element.
     * Also called automatically on StoreEventBus delete events. // TODO(TASK-08)
     */
    clear(elementId: string): void {
        this._store.delete(elementId);
    }

    /**
     * Wipe all Pset data. Called on project clear / project load.
     */
    reset(): void {
        this._store.clear();
    }

    /** Total number of elements with Pset data in the adapter. */
    get size(): number {
        return this._store.size;
    }

    /**
     * Returns all element IDs that have Pset data ingested.
     * Useful for diagnostics and for verifying ingestion in tests.
     */
    getKnownElementIds(): string[] {
        return [...this._store.keys()];
    }

    /**
     * Returns all ingested property keys across all elements (de-duplicated).
     * Useful for building autocomplete lists of queryable Pset fields.
     */
    getAllKnownFields(): string[] {
        const fields = new Set<string>();
        for (const props of this._store.values()) {
            for (const key of Object.keys(props)) {
                fields.add(key);
            }
        }
        return [...fields].sort();
    }
}

/**
 * Module-level singleton — import directly from tool or service files.
 * Not registered in StoreRegistry (rendering/query-layer cache, not a PRYZM store).
 */
export const ifcPsetAdapter = new IFCPsetAdapterImpl();
export type { IFCPsetAdapterImpl };
