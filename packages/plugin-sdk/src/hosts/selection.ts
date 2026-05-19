// @pryzm/plugin-sdk — Selection proxy contract (S62 D3).
//
// The active selection is a list of element ids.  Plugins read it via
// `selection.get()` and react to changes via `selection.subscribe()`.
// Mutating the selection requires `write:project` (and goes through
// the command bus as `selection.set` so it is undo-redo-able).

/** Subscription handle returned by `subscribe()`. */
export interface SelectionSubscription {
  unsubscribe(): void;
}

/**
 * Permission-gated read access to the active selection.
 * Permission: `read:project` for `get` + `subscribe`.
 */
export interface SelectionProxy {
  /** Returns the currently-selected element ids (possibly empty). */
  get(): Promise<readonly string[]>;

  /**
   * Subscribe to selection-change events.  Handler runs after change.
   * Coalesced 250 ms (ADR-0010).
   */
  subscribe(handler: (event: { selectedIds: readonly string[] }) => void): SelectionSubscription;
}
