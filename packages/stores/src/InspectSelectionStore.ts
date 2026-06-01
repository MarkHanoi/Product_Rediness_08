// InspectSelectionStore — C27 INS-α-2 (BIM 3.0 Inspect Model).
//
// L3 reactive store wrapping the L0 `InspectSelection` substrate from
// `@pryzm/schemas`.  Holds "what node in the master tree is currently
// being inspected" — null when nothing is selected.
//
// This slice ships the store ONLY — no UI, no visibility-isolation wiring
// yet.  Future slices feed `get()` into the visibility engine + bind
// `subscribe()` to the master-tree UI.
//
// Pattern mirrors `ApartmentParametersStore` / `FamilyRegistryStore`:
//   • Validates inputs at the boundary (the L0 schema is the truth — P5).
//   • Loud-fail-soft on dispose: `set()` warns + ignores, `clear()` no-ops.
//   • Listener notify is try/catch'd per-listener so one throw cannot starve
//     the others.
//
// Lives at L3 alongside the other stores.  No I/O, no THREE, no DOM.
// References:
//   - C27-BIM3-INSPECT-MODEL.md §3 (master tree) + §4 (selection contract)
//   - master plan Part V §11.2 (INS-α-2 substrate slice)

import {
    InspectSelectionSchema,
    type InspectSelection,
} from '@pryzm/schemas';

type Listener = () => void;

export class InspectSelectionStore {
    private _selection: InspectSelection | null = null;
    private readonly _listeners = new Set<Listener>();
    private _disposed = false;

    /**
     * Current selection.  `null` means nothing is selected — the UI should
     * collapse the inspect tab to the project-root view in that case.
     */
    get(): InspectSelection | null {
        return this._selection;
    }

    /**
     * Replace the selection.  Schema-validates the input (Zod throws on
     * invalid input — this is intentional; the caller is expected to mint
     * valid selections from the master-tree projection).  Fires all
     * subscribers on success.  No-op + warn if the store has been disposed.
     */
    set(selection: InspectSelection): void {
        if (this._disposed) {
            console.warn('[InspectSelectionStore] set() called after dispose() — ignoring');
            return;
        }
        // Validate at the boundary (P5 — the L0 schema is the truth).
        const parsed = InspectSelectionSchema.parse(selection);
        this._selection = parsed;
        this._notify();
    }

    /**
     * Clear the selection.  Fires subscribers ONLY when there was a
     * selection to clear — clearing an already-null store is a true no-op
     * (matches the "no spurious notify" convention used by the sibling
     * apartment / family stores).
     */
    clear(): void {
        if (this._disposed) return;
        const wasNull = this._selection === null;
        this._selection = null;
        if (!wasNull) this._notify();
    }

    /**
     * Subscribe to selection changes.  Returns a disposer — call it to
     * unsubscribe.  After `dispose()` the returned disposer is a no-op and
     * no new listeners are accepted.
     */
    subscribe(listener: Listener): () => void {
        if (this._disposed) return () => { /* no-op */ };
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    /**
     * Tear down: clear all listeners + null the selection.  After dispose,
     * `set()` warns and ignores, `clear()` is a no-op, `subscribe()`
     * returns a no-op disposer.  Idempotent.
     */
    dispose(): void {
        this._disposed = true;
        this._listeners.clear();
        this._selection = null;
    }

    private _notify(): void {
        for (const l of this._listeners) {
            try { l(); }
            catch (err) { console.error('[InspectSelectionStore] listener threw:', err); }
        }
    }
}
