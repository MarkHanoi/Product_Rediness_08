// IsolationStateStore — C27 INS-α-6 (BIM 3.0 Inspect Model).
//
// L3 reactive store that holds the per-element `IsolationOverride` map
// driving selection-driven viewport isolation. Bridges the L0 substrate
// (`InspectSelection` / `IsolationOverride` from `@pryzm/schemas`) with
// the L1 pure resolver (`buildIsolationIntent` from `@pryzm/visibility`,
// shipped in INS-α-3 at commit 4517a9b).
//
// This slice ships the state container + a thin reducer ONLY — no
// renderer-three IsolationAnimator (that is INS-α-7) and no UI wiring
// from the ModelTree to the store (also α-7). The store is a pure data
// layer for now.
//
// Pattern mirrors `DataStore` (shipped at baeaec1):
//   • Frozen, defensively-cloned snapshots returned from `get()` — the
//     internal `Map<elementId, IsolationOverride>` is rewrapped so an
//     external `snap.overrides.set(...)` throws on the frozen view (and
//     does not leak into the next snapshot either way).
//   • State-transition-coalesced subscriber notify: every accepted
//     mutation fires, but `clearIsolation()` on an already-inactive
//     store is a true no-op (no spurious notify).
//   • Listener notify is try/catch'd per-listener so one throw cannot
//     starve the others.
//   • Idempotent `dispose()` clears listeners + resets state. After
//     dispose, mutators warn + ignore (the `DataStore` precedent).
//
// L3 purity:
//   • `@pryzm/schemas` (L0) — `InspectSelection`, `IsolationOverride`.
//   • `@pryzm/visibility` (L1) — `buildIsolationIntent`, `ElementLocation`.
//   • No L4+, no I/O, no THREE, no DOM.
//
// References:
//   - C27-BIM3-INSPECT-MODEL.md §4 (stores), §5 (isolation engine), §5.1,
//     §5.4
//   - master plan Part V §11.2 (INS-α-6 state-container slice)

import type {
    InspectSelection,
    IsolationOverride,
} from '@pryzm/schemas';
import {
    buildIsolationIntent,
    type ElementLocation,
    type IsolationIntentOptions,
} from '@pryzm/visibility';

// Re-export so downstream consumers (composeRuntime, command handlers,
// the future IsolationAnimator in INS-α-7) can pull the location shape
// from a single L3 import site without reaching into `@pryzm/visibility`
// directly.
export type { ElementLocation, IsolationIntentOptions };

/**
 * Snapshot of the isolation state. Returned by `IsolationStateStore.get()`
 * as a frozen object — the `overrides` Map is rewrapped per-snapshot so
 * mutation attempts from outside throw (frozen Map proxy) and never leak
 * into the next snapshot in any case (the next snapshot is built from
 * the live internal Map).
 *
 *   - `overrides`        — empty Map when not isolated.
 *   - `isActive`         — false when the store is in its initial /
 *                          cleared state, true after `applyIsolation()`
 *                          (even when the elements array was empty —
 *                          the user explicitly asked for isolation).
 *   - `sourceSelection`  — the `InspectSelection` that drove the
 *                          current state, or `null` when cleared.
 */
export interface IsolationStateStoreState {
    readonly overrides: ReadonlyMap<string, IsolationOverride>;
    readonly isActive: boolean;
    readonly sourceSelection: InspectSelection | null;
}

type Listener = (state: IsolationStateStoreState) => void;

/**
 * Build the documented initial state — empty overrides, inactive, no
 * source selection. Exported as a function (not a frozen constant) so
 * each fresh store gets its own snapshot identity.
 */
function initialState(): IsolationStateStoreState {
    return Object.freeze({
        overrides: freezeMap(new Map<string, IsolationOverride>()),
        isActive: false,
        sourceSelection: null,
    });
}

/**
 * L3 reactive container for the per-element isolation override map. One
 * instance per runtime session (constructed by composeRuntime in α-7+).
 * Idempotent disposal.
 */
export class IsolationStateStore {
    private _state: IsolationStateStoreState = initialState();
    private readonly _listeners = new Set<Listener>();
    private _disposed = false;

    /**
     * Current snapshot. The returned object is frozen and the contained
     * `overrides` Map is a frozen wrapper — outside mutation attempts
     * throw rather than silently corrupting state.
     */
    get(): IsolationStateStoreState {
        return this._state;
    }

    /**
     * Apply an isolation derived from `selection` + `elements`. Delegates
     * to the L1-pure `buildIsolationIntent`; the store contributes the
     * state container + subscriber fan-out + dispose lifecycle.
     *
     * `isActive` flips to `true` even when `elements` is empty — the
     * user explicitly asked for isolation; an empty element set is a
     * valid "isolate this empty subtree" answer (the UI may still want
     * to show the active badge / dim toggle).
     *
     * No-op + warn after `dispose()`.
     */
    applyIsolation(
        selection: InspectSelection,
        elements: ReadonlyArray<ElementLocation>,
        opts?: IsolationIntentOptions,
    ): void {
        if (this._disposed) {
            console.warn('[IsolationStateStore] applyIsolation() after dispose — ignored');
            return;
        }
        const overrides = buildIsolationIntent(selection, elements, opts);
        // Defensive clone of the resolver's Map — the resolver returns a
        // fresh Map per call today, but pinning the clone here protects
        // us from future shared-reference optimisations leaking state
        // out of the store.
        const cloned = new Map<string, IsolationOverride>(overrides);
        this._state = Object.freeze({
            overrides: freezeMap(cloned),
            isActive: true,
            sourceSelection: selection,
        });
        this._notify();
    }

    /**
     * Clear the isolation: empty overrides, inactive, no source. Fires
     * subscribers ONLY when the store was previously active — matches
     * the "no spurious notify" convention used by `DataStore.clearSelection()`
     * and `InspectSelectionStore.clear()`.
     */
    clearIsolation(): void {
        if (this._disposed) return;
        if (!this._state.isActive) return;
        this._state = initialState();
        this._notify();
    }

    /**
     * Alias for `clearIsolation()`. Provided so the public surface
     * matches the lifecycle vocabulary used by sibling stores (`reset()`
     * on DataStore / RoomParametersStore / etc.). Honours the same
     * "no spurious notify when already inactive" contract.
     */
    reset(): void {
        this.clearIsolation();
    }

    /**
     * Subscribe to state-change notifications. Listener receives the
     * fresh snapshot on every accepted mutation. Returns an unsubscribe
     * disposer (idempotent). No-op disposer after `dispose()`.
     */
    subscribe(listener: Listener): () => void {
        if (this._disposed) return () => { /* no-op */ };
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    /**
     * Tear down: clear listeners + reset state. After dispose, mutators
     * warn + ignore (`applyIsolation`) or no-op (`clearIsolation` /
     * `reset`), and `subscribe()` returns a no-op disposer. Idempotent.
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
            catch (err) { console.error('[IsolationStateStore] listener threw:', err); }
        }
    }
}

/**
 * Factory wrapper — composeRuntime wires the store without `new` in its
 * call-site (the precedent set by `createDataStore`).
 */
export function createIsolationStateStore(): IsolationStateStore {
    return new IsolationStateStore();
}

/**
 * Defensively-freeze a `Map<elementId, IsolationOverride>`. The native
 * `Object.freeze` does NOT make a Map immutable (its mutator methods
 * are not own properties), so we replace `set` / `delete` / `clear`
 * with throwing stubs and re-bind iteration helpers. This is the
 * smallest shim that flags accidental writes to a snapshot.
 */
function freezeMap(
    source: Map<string, IsolationOverride>,
): ReadonlyMap<string, IsolationOverride> {
    const frozen = source as Map<string, IsolationOverride> & {
        set: never;
        delete: never;
        clear: never;
    };
    const throwFrozen = (method: string): never => {
        throw new TypeError(
            `[IsolationStateStore] cannot ${method}() on a frozen snapshot — call applyIsolation() / clearIsolation() instead`,
        );
    };
    Object.defineProperty(frozen, 'set', {
        value: () => throwFrozen('set'),
        writable: false,
        configurable: false,
    });
    Object.defineProperty(frozen, 'delete', {
        value: () => throwFrozen('delete'),
        writable: false,
        configurable: false,
    });
    Object.defineProperty(frozen, 'clear', {
        value: () => throwFrozen('clear'),
        writable: false,
        configurable: false,
    });
    return frozen;
}
