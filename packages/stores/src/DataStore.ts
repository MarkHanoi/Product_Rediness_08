// DataStore — C28 DAT-α-2 (Data Panel & Automation).
//
// L3 reactive store wrapping the L0 data-panel substrate shipped in
// DAT-α-1 (`@pryzm/schemas/data`). Holds the Data tab's active
// `filter / sort / groupBy / selectedRowIds` — the state container that
// the unified grid (C28 §6) and the `data.bulkUpdate` /
// `data.runQualityCheck` commands (C28 §5) will read from.
//
// This slice ships the state container ONLY — no bulk-edit command
// handler yet (that is DAT-α-3) and no grid UI (DAT-β / DAT-γ).
//
// Pattern mirrors `InspectSelectionStore` / `FamilyRegistryStore`:
//   • Validate inputs at the boundary (the L0 schemas are the truth — P5).
//   • Loud-fail-soft: setters validate via Zod and throw on invalid input
//     so a misuse fails LOUDLY at the call site (no silent state drift).
//   • Subscribers fire after EVERY successful setter that changes state
//     (state-transition-coalesced — calling `setSort([...])` with the
//     same array shape still fires once; the contract is "after I
//     accepted the write", not "value-equality diff").
//   • `get()` returns a frozen, defensively-cloned snapshot so callers
//     cannot reach in and mutate the store's internal state.
//
// L3 purity: imports from `@pryzm/schemas` only. No L4+ deps. No I/O,
// no THREE, no DOM.
//
// References:
//   - C28-DATA-PANEL-AND-AUTOMATION.md §1 (invariants), §2 (schemas),
//     §3 (stores), §5 (commands)
//   - master plan Part VI (DAT-α-2 state-container slice)

import {
    DataFilterSchema,
    DataSortSchema,
    DataGroupBySchema,
    type DataFilter,
    type DataSort,
    type DataGroupBy,
} from '@pryzm/schemas';

/**
 * Snapshot of the Data tab's current view state. Returned by
 * `DataStore.get()` as a frozen, defensively-cloned object — safe to
 * pass to React selectors, render hooks, command handlers, etc.
 *
 * `selectedRowIds` holds element ids (string) and is `readonly` to flag
 * the immutability contract at the type level.
 */
export interface DataStoreState {
    readonly filter: DataFilter;
    readonly sort: DataSort;
    readonly groupBy: DataGroupBy | undefined;
    readonly selectedRowIds: ReadonlyArray<string>;
}

type Listener = (state: DataStoreState) => void;

/**
 * Build the default initial state for a fresh `DataStore`. Exported
 * mostly for tests + reset() — the production code path constructs the
 * store via `createDataStore()` which calls this internally.
 */
function initialState(): DataStoreState {
    return Object.freeze({
        filter: Object.freeze({}) as DataFilter,
        sort: Object.freeze([]) as unknown as DataSort,
        groupBy: undefined,
        selectedRowIds: Object.freeze([]) as ReadonlyArray<string>,
    });
}

/**
 * L3 reactive container for the Data tab's `filter / sort / groupBy /
 * selectedRowIds`. One instance per runtime session (constructed by
 * `composeRuntime` in DAT-α-3+). Idempotent disposal.
 */
export class DataStore {
    private _state: DataStoreState = initialState();
    private readonly _listeners = new Set<Listener>();
    private _disposed = false;

    /**
     * Current snapshot. The returned object is a defensively-frozen
     * clone — mutation outside the store cannot leak into the internal
     * state, and `Object.freeze` flags accidental writes at runtime
     * (strict mode throws on assignment to frozen properties).
     */
    get(): DataStoreState {
        return this._state;
    }

    /**
     * Replace the active filter. Schema-validated via `DataFilterSchema`;
     * Zod throws on invalid shape (this is intentional — the caller is
     * expected to mint valid filters from the filter-chip UI). Fires
     * subscribers on success. No-op + warn after `dispose()`.
     */
    setFilter(filter: DataFilter): void {
        if (this._disposed) {
            console.warn('[DataStore] setFilter() after dispose — ignored');
            return;
        }
        const parsed = DataFilterSchema.parse(filter);
        this._state = freezeState({
            filter: parsed,
            sort: this._state.sort,
            groupBy: this._state.groupBy,
            selectedRowIds: this._state.selectedRowIds,
        });
        this._notify();
    }

    /**
     * Replace the multi-column sort spec. Empty array means "no sort"
     * (the grid renders in insertion order). Schema-validated via
     * `DataSortSchema`.
     */
    setSort(sort: DataSort): void {
        if (this._disposed) {
            console.warn('[DataStore] setSort() after dispose — ignored');
            return;
        }
        const parsed = DataSortSchema.parse(sort);
        this._state = freezeState({
            filter: this._state.filter,
            sort: parsed,
            groupBy: this._state.groupBy,
            selectedRowIds: this._state.selectedRowIds,
        });
        this._notify();
    }

    /**
     * Replace the group-by selector. Pass `undefined` to clear (renders
     * as a flat list). Schema-validated via `DataGroupBySchema` when
     * defined.
     */
    setGroupBy(groupBy: DataGroupBy | undefined): void {
        if (this._disposed) {
            console.warn('[DataStore] setGroupBy() after dispose — ignored');
            return;
        }
        const parsed = groupBy === undefined
            ? undefined
            : DataGroupBySchema.parse(groupBy);
        this._state = freezeState({
            filter: this._state.filter,
            sort: this._state.sort,
            groupBy: parsed,
            selectedRowIds: this._state.selectedRowIds,
        });
        this._notify();
    }

    /**
     * Replace the selected-row id set. Element ids are arbitrary
     * strings at this layer (branded-id integrity is enforced by the
     * caller — see ApartmentParametersStore for the precedent).
     */
    setSelectedRows(ids: ReadonlyArray<string>): void {
        if (this._disposed) {
            console.warn('[DataStore] setSelectedRows() after dispose — ignored');
            return;
        }
        // Defensive clone — caller's array must not alias internal state.
        const cloned = Object.freeze([...ids]) as ReadonlyArray<string>;
        this._state = freezeState({
            filter: this._state.filter,
            sort: this._state.sort,
            groupBy: this._state.groupBy,
            selectedRowIds: cloned,
        });
        this._notify();
    }

    /**
     * Empty the selection. Fires subscribers ONLY when there was a
     * selection to clear (matches the "no spurious notify" convention
     * used by `InspectSelectionStore.clear()`).
     */
    clearSelection(): void {
        if (this._disposed) return;
        if (this._state.selectedRowIds.length === 0) return;
        this._state = freezeState({
            filter: this._state.filter,
            sort: this._state.sort,
            groupBy: this._state.groupBy,
            selectedRowIds: Object.freeze([]) as ReadonlyArray<string>,
        });
        this._notify();
    }

    /**
     * Restore the initial state (empty filter / no sort / no group-by /
     * empty selection). Always fires subscribers — `reset()` is an
     * explicit user action and downstream consumers should re-render.
     */
    reset(): void {
        if (this._disposed) {
            console.warn('[DataStore] reset() after dispose — ignored');
            return;
        }
        this._state = initialState();
        this._notify();
    }

    /**
     * Subscribe to state-change notifications. Listener receives the
     * fresh snapshot on every accepted setter. Returns an unsubscribe
     * disposer (idempotent). No-op disposer after `dispose()`.
     */
    subscribe(listener: Listener): () => void {
        if (this._disposed) return () => { /* no-op */ };
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    /**
     * Tear down: clear listeners + reset state. After dispose, setters
     * warn + ignore, `clearSelection()` is a no-op, `subscribe()`
     * returns a no-op disposer. Idempotent.
     */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._listeners.clear();
        this._state = initialState();
    }

    private _notify(): void {
        const snapshot = this._state;
        for (const l of this._listeners) {
            try { l(snapshot); }
            catch (err) { console.error('[DataStore] listener threw:', err); }
        }
    }
}

/**
 * Factory wrapper — the master plan's DAT-α-2 contract names
 * `createDataStore()` explicitly so composeRuntime can wire the store
 * without `new` in its call-site.
 */
export function createDataStore(): DataStore {
    return new DataStore();
}

/**
 * Defensively-freeze a candidate next-state. Top-level `Object.freeze`
 * plus a shallow freeze of the contained collections is enough to flag
 * the common "consumer mutates the snapshot" mistake; deep freezing
 * every parameter-filter element would be defensive theatre at this
 * layer (the L0 Zod schemas already guard shape).
 */
function freezeState(next: DataStoreState): DataStoreState {
    return Object.freeze({
        filter: Object.freeze({ ...next.filter }) as DataFilter,
        sort: Object.freeze([...next.sort]) as unknown as DataSort,
        groupBy: next.groupBy,
        selectedRowIds: Object.freeze([...next.selectedRowIds]) as ReadonlyArray<string>,
    });
}
