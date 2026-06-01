// DrawingSetStore — C30 DSM-α-2 (Drawing Set Management).
//
// L3 reactive store wrapping the L0 drawing-set substrate shipped in
// DSM-α-1 (`@pryzm/schemas/drawing-set`).  Holds the project's
// `DrawingSet[]` plus the user's active focus (`activeDrawingSetId`) —
// the state container that the future SheetSet panel (C30 §10.2 UI
// slice) and the `sheetset.*` commands (C30 §4) will read from.
//
// This slice ships the state container + CRUD + revision management +
// sheet membership management.  No transmittal/PDF/IFC integration, no
// command-bus wiring, no UI — those are later C30 slices.
//
// Pattern mirrors `DataStore` (shipped at baeaec1) +
// `IsolationStateStore` (shipped 2026-05-31):
//   • Validate inputs at the boundary via Zod (the L0 schemas are the
//     truth — P5).  Loud-fail-soft: invalid input throws.
//   • Frozen snapshots returned by `get()`; the contained `drawingSets`
//     array is rewrapped per snapshot so an external `snap.drawingSets`
//     mutation cannot leak in.
//   • Defensive deep clone of every DrawingSet on the way IN and OUT —
//     callers cannot mutate the stored object via the reference they
//     passed in, nor the reference they read back.
//   • State-transition-coalesced notify — every accepted mutation fires;
//     `deleteDrawingSet(unknownId)` is a true no-op (no spurious notify).
//   • Listener notify is try/catch'd per-listener so one throw cannot
//     starve the others.
//   • Idempotent `dispose()` clears listeners + resets state.  After
//     dispose, mutators warn + ignore.
//
// L3 purity:
//   • `@pryzm/schemas` (L0) — DrawingSet, DrawingSetSchema, Revision,
//     RevisionSchema, SheetReference, DrawingSetStatus.
//   • No L4+, no I/O, no THREE, no DOM.
//
// References:
//   - C30-DRAWING-SET-MANAGEMENT.md §1 (invariants), §2 (schema), §3
//     (store), §4 (commands — informs the API surface)
//   - master plan §8.3 (SCE-γ-3 + SCE-γ-4 DSM-α-2 state-container slice)

import {
    DrawingSetSchema,
    DrawingSetStatusSchema,
    RevisionSchema,
    type DrawingSet,
    type DrawingSetStatus,
    type Revision,
    type SheetReference,
} from '@pryzm/schemas';

/**
 * Snapshot of the drawing-set state.  Returned by `DrawingSetStore.get()`
 * as a frozen object — the `drawingSets` array is rewrapped per-snapshot
 * so mutation attempts from outside throw (in strict mode) and cannot
 * leak into the next snapshot either way.
 *
 *   - `drawingSets`         — all DrawingSets in the project, in
 *                             insertion order.  Empty in the initial
 *                             state.
 *   - `activeDrawingSetId`  — the user's currently-focused set, or
 *                             `null` when nothing is focused.  When
 *                             non-null, MUST match one of the entries
 *                             in `drawingSets`.
 */
export interface DrawingSetStoreState {
    readonly drawingSets: ReadonlyArray<DrawingSet>;
    readonly activeDrawingSetId: string | null;
}

type Listener = (state: DrawingSetStoreState) => void;

/**
 * Options passed to `new DrawingSetStore(...)`.  `now` is injectable so
 * tests can freeze "today" — the production default reads the real
 * wall-clock at the moment of the `markStatus('issued', ...)` call.
 */
export interface DrawingSetStoreOptions {
    /** Wall-clock provider.  Defaults to `() => new Date()`. */
    readonly now?: () => Date;
}

/**
 * Build the documented initial state — empty list, no active set.
 * Exported as a function (not a frozen constant) so each fresh store
 * gets its own snapshot identity.
 */
function initialState(): DrawingSetStoreState {
    return Object.freeze({
        drawingSets: Object.freeze([]) as ReadonlyArray<DrawingSet>,
        activeDrawingSetId: null,
    });
}

/**
 * L3 reactive container for the project's DrawingSets.  One instance
 * per runtime session (constructed by composeRuntime in a later slice).
 * Idempotent disposal.
 */
export class DrawingSetStore {
    private _state: DrawingSetStoreState = initialState();
    private readonly _listeners = new Set<Listener>();
    private readonly _now: () => Date;
    private _disposed = false;

    constructor(opts: DrawingSetStoreOptions = {}) {
        this._now = opts.now ?? (() => new Date());
    }

    /**
     * Current snapshot.  The returned object is frozen and the contained
     * `drawingSets` array is a fresh frozen array per snapshot —
     * outside mutation attempts throw rather than silently corrupting
     * state.
     */
    get(): DrawingSetStoreState {
        return this._state;
    }

    /**
     * Subscribe to state-change notifications.  Listener receives the
     * fresh snapshot on every accepted mutation.  Returns an unsubscribe
     * disposer (idempotent).  No-op disposer after `dispose()`.
     */
    subscribe(listener: Listener): () => void {
        if (this._disposed) return () => { /* no-op */ };
        this._listeners.add(listener);
        return () => { this._listeners.delete(listener); };
    }

    /**
     * Add a new DrawingSet.  Schema-validated via `DrawingSetSchema`;
     * Zod throws on invalid shape (this is intentional — the caller is
     * expected to mint valid sets).  Throws on duplicate id.
     */
    createDrawingSet(ds: DrawingSet): void {
        if (this._disposed) {
            console.warn('[DrawingSetStore] createDrawingSet() after dispose — ignored');
            return;
        }
        const parsed = DrawingSetSchema.parse(ds);
        if (this._state.drawingSets.some((d) => d.id === parsed.id)) {
            throw new Error(
                `[DrawingSetStore] duplicate DrawingSet id "${parsed.id}"`,
            );
        }
        const cloned = cloneDrawingSet(parsed);
        const next = [...this._state.drawingSets, cloned];
        this._commit(next, this._state.activeDrawingSetId);
    }

    /**
     * Patch an existing DrawingSet.  The patch is shallow-merged onto
     * the existing row and the result is re-validated against
     * `DrawingSetSchema`.  Throws on unknown id, invalid result, or an
     * attempt to change the id.
     */
    updateDrawingSet(id: string, patch: Partial<DrawingSet>): void {
        if (this._disposed) {
            console.warn('[DrawingSetStore] updateDrawingSet() after dispose — ignored');
            return;
        }
        const idx = this._state.drawingSets.findIndex((d) => d.id === id);
        if (idx === -1) {
            throw new Error(`[DrawingSetStore] unknown DrawingSet id "${id}"`);
        }
        const existing = this._state.drawingSets[idx]!;
        const merged: DrawingSet = { ...existing, ...patch, id: existing.id };
        const parsed = DrawingSetSchema.parse(merged);
        const cloned = cloneDrawingSet(parsed);
        const next = [...this._state.drawingSets];
        next[idx] = cloned;
        this._commit(next, this._state.activeDrawingSetId);
    }

    /**
     * Drop a DrawingSet by id.  If the deleted id was active, the active
     * pointer is cleared to `null`.  No-op (and no notify) when the id
     * is not present — matches the "no spurious notify" convention of
     * sibling stores.
     */
    deleteDrawingSet(id: string): void {
        if (this._disposed) {
            console.warn('[DrawingSetStore] deleteDrawingSet() after dispose — ignored');
            return;
        }
        const idx = this._state.drawingSets.findIndex((d) => d.id === id);
        if (idx === -1) return; // no-op
        const next = this._state.drawingSets.filter((_, i) => i !== idx);
        const nextActive = this._state.activeDrawingSetId === id
            ? null
            : this._state.activeDrawingSetId;
        this._commit(next, nextActive);
    }

    /**
     * Focus a DrawingSet (or clear focus with `null`).  Throws if `id`
     * is not null AND not present in `drawingSets`.
     */
    setActiveDrawingSet(id: string | null): void {
        if (this._disposed) {
            console.warn('[DrawingSetStore] setActiveDrawingSet() after dispose — ignored');
            return;
        }
        if (id !== null && !this._state.drawingSets.some((d) => d.id === id)) {
            throw new Error(`[DrawingSetStore] unknown DrawingSet id "${id}"`);
        }
        this._commit(this._state.drawingSets, id);
    }

    /**
     * Append a Revision row to a DrawingSet.  Schema-validated via
     * `RevisionSchema`.  The new revision's `letter` MUST be unique
     * within the parent set's existing `revisions[]`.  On success, the
     * parent set's `currentRevision` is bumped to the new letter
     * automatically (callers may overwrite via a separate
     * `updateDrawingSet` call if they want to keep the old current).
     */
    addRevision(drawingSetId: string, revision: Revision): void {
        if (this._disposed) {
            console.warn('[DrawingSetStore] addRevision() after dispose — ignored');
            return;
        }
        const parsed = RevisionSchema.parse(revision);
        const idx = this._state.drawingSets.findIndex((d) => d.id === drawingSetId);
        if (idx === -1) {
            throw new Error(
                `[DrawingSetStore] unknown DrawingSet id "${drawingSetId}"`,
            );
        }
        const existing = this._state.drawingSets[idx]!;
        if (existing.revisions.some((r) => r.letter === parsed.letter)) {
            throw new Error(
                `[DrawingSetStore] duplicate revision letter "${parsed.letter}" in DrawingSet "${drawingSetId}"`,
            );
        }
        const updated: DrawingSet = {
            ...existing,
            revisions: [...existing.revisions, parsed],
            currentRevision: parsed.letter,
        };
        // Re-parse the whole row to keep the per-discipline order
        // invariant + currentRevision cross-reference honest.
        const reparsed = DrawingSetSchema.parse(updated);
        const cloned = cloneDrawingSet(reparsed);
        const next = [...this._state.drawingSets];
        next[idx] = cloned;
        this._commit(next, this._state.activeDrawingSetId);
    }

    /**
     * Transition a DrawingSet to a new status.  Validates the status
     * via `DrawingSetStatusSchema`; throws on unknown id or unknown
     * status.  When moving to `'issued'`, stamps `issueDate` to the
     * store's `now()` (the caller may overwrite via a separate
     * `updateDrawingSet` call).
     */
    markStatus(drawingSetId: string, status: DrawingSetStatus): void {
        if (this._disposed) {
            console.warn('[DrawingSetStore] markStatus() after dispose — ignored');
            return;
        }
        const parsedStatus = DrawingSetStatusSchema.parse(status);
        const idx = this._state.drawingSets.findIndex((d) => d.id === drawingSetId);
        if (idx === -1) {
            throw new Error(
                `[DrawingSetStore] unknown DrawingSet id "${drawingSetId}"`,
            );
        }
        const existing = this._state.drawingSets[idx]!;
        const patched: DrawingSet = { ...existing, status: parsedStatus };
        if (parsedStatus === 'issued') {
            patched.issueDate = this._now().toISOString();
        }
        const reparsed = DrawingSetSchema.parse(patched);
        const cloned = cloneDrawingSet(reparsed);
        const next = [...this._state.drawingSets];
        next[idx] = cloned;
        this._commit(next, this._state.activeDrawingSetId);
    }

    /**
     * Append a SheetReference to a DrawingSet.  The whole DrawingSet is
     * re-parsed so the schema-level per-discipline order-uniqueness
     * refine still holds (throws on duplicate `order` in the same
     * discipline).  Throws on unknown DrawingSet id.
     */
    addSheetToSet(drawingSetId: string, sheet: SheetReference): void {
        if (this._disposed) {
            console.warn('[DrawingSetStore] addSheetToSet() after dispose — ignored');
            return;
        }
        const idx = this._state.drawingSets.findIndex((d) => d.id === drawingSetId);
        if (idx === -1) {
            throw new Error(
                `[DrawingSetStore] unknown DrawingSet id "${drawingSetId}"`,
            );
        }
        const existing = this._state.drawingSets[idx]!;
        const updated: DrawingSet = {
            ...existing,
            sheets: [...existing.sheets, sheet],
        };
        const reparsed = DrawingSetSchema.parse(updated);
        const cloned = cloneDrawingSet(reparsed);
        const next = [...this._state.drawingSets];
        next[idx] = cloned;
        this._commit(next, this._state.activeDrawingSetId);
    }

    /**
     * Remove a SheetReference by sheetId from a DrawingSet.  Idempotent
     * when the sheetId is not present — no notify in that case.  Throws
     * on unknown DrawingSet id.
     */
    removeSheetFromSet(drawingSetId: string, sheetId: string): void {
        if (this._disposed) {
            console.warn('[DrawingSetStore] removeSheetFromSet() after dispose — ignored');
            return;
        }
        const idx = this._state.drawingSets.findIndex((d) => d.id === drawingSetId);
        if (idx === -1) {
            throw new Error(
                `[DrawingSetStore] unknown DrawingSet id "${drawingSetId}"`,
            );
        }
        const existing = this._state.drawingSets[idx]!;
        const filtered = existing.sheets.filter((s) => s.sheetId !== sheetId);
        if (filtered.length === existing.sheets.length) return; // idempotent
        const updated: DrawingSet = { ...existing, sheets: filtered };
        // Re-parse to keep refines honest (a single-sheet set going to
        // zero sheets is still a valid DrawingSet per the schema).
        const reparsed = DrawingSetSchema.parse(updated);
        const cloned = cloneDrawingSet(reparsed);
        const next = [...this._state.drawingSets];
        next[idx] = cloned;
        this._commit(next, this._state.activeDrawingSetId);
    }

    /**
     * Look up a DrawingSet by id.  Returns `undefined` when the id is
     * not present.  The returned object is the same defensively-cloned
     * reference held inside the snapshot — safe to read, mutation
     * attempts on its top level fail in strict mode.
     */
    getDrawingSet(id: string): DrawingSet | undefined {
        return this._state.drawingSets.find((d) => d.id === id);
    }

    /**
     * Convenience accessor — `undefined` when nothing is active.
     */
    getActiveDrawingSet(): DrawingSet | undefined {
        const id = this._state.activeDrawingSetId;
        if (id === null) return undefined;
        return this.getDrawingSet(id);
    }

    /**
     * Restore the initial state (empty list, null active).  Always
     * fires subscribers — `reset()` is an explicit user action and
     * downstream consumers should re-render.
     */
    reset(): void {
        if (this._disposed) {
            console.warn('[DrawingSetStore] reset() after dispose — ignored');
            return;
        }
        this._state = initialState();
        this._notify();
    }

    /**
     * Tear down: clear listeners + reset state.  After dispose, mutators
     * warn + ignore, `subscribe()` returns a no-op disposer.  Idempotent.
     */
    dispose(): void {
        if (this._disposed) return;
        this._disposed = true;
        this._listeners.clear();
        this._state = initialState();
    }

    private _commit(
        drawingSets: ReadonlyArray<DrawingSet>,
        activeDrawingSetId: string | null,
    ): void {
        this._state = Object.freeze({
            drawingSets: Object.freeze([...drawingSets]) as ReadonlyArray<DrawingSet>,
            activeDrawingSetId,
        });
        this._notify();
    }

    private _notify(): void {
        const snapshot = this._state;
        for (const l of this._listeners) {
            try { l(snapshot); }
            catch (err) { console.error('[DrawingSetStore] listener threw:', err); }
        }
    }
}

/**
 * Factory wrapper — composeRuntime wires the store without `new` in its
 * call-site (the precedent set by `createDataStore` /
 * `createIsolationStateStore`).
 */
export function createDrawingSetStore(
    opts: DrawingSetStoreOptions = {},
): DrawingSetStore {
    return new DrawingSetStore(opts);
}

/**
 * Defensively deep-clone a DrawingSet so neither the caller (who passed
 * the original in) nor an outside reader (who pulled it out via `get()`
 * / `getDrawingSet()`) can mutate the stored row.  The L0 substrate is
 * plain-JSON-shaped (Zod parses produce plain objects + arrays + string/
 * number primitives), so `JSON.parse(JSON.stringify(...))` is safe and
 * keeps this helper L0-pure.  The returned object's top level is frozen
 * so accidental writes to e.g. `ds.status = 'archived'` throw in strict
 * mode.
 */
function cloneDrawingSet(ds: DrawingSet): DrawingSet {
    const copy = JSON.parse(JSON.stringify(ds)) as DrawingSet;
    return Object.freeze(copy);
}
