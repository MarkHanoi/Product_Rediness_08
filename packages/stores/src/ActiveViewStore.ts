// ActiveViewStore — singleton-shaped store holding the currently-
// active view-id and the currently-active tool-id.
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S17 lines 842-847.
// ADR: `docs/02-decisions/adrs/0016-view-state-command-driven.md` §"Decision".
//
// The shape is "singleton-on-Store" — the inner Map only ever holds
// one entry under the fixed key `'active'`.  This lets us reuse the
// existing `Store<T>` apparatus (subscribeDirty, applyPatch, the
// PatchEmitter routing, etc.) without inventing a new base class for
// the one entity that's a singleton.
//
// Per ADR-0016: the `view.switch` handler mutates this store directly
// (via `setActive(...)`) and returns empty patches — selection-style
// ephemeral semantics.  `view.create` / `delete` / `rename` /
// `update-camera` mutate the `ViewRegistry`, NOT this store.
//
// `ephemeral = true` mirrors `SelectionStore` so the future
// PatchEmitter ephemeral-routing branch (D7 follow-up from S16) treats
// active-view mutations the same way it treats selection mutations.

import { Store } from './Store.js';
import type { Patch } from './types.js';

/** The single active-view singleton id. */
export const ACTIVE_VIEW_ID = 'active' as const;

export interface ActiveViewState {
  /** Id of the currently active view (must reference a `ViewDefinition`
   *  in the `ViewRegistry`).  Brand kept loose here — `@pryzm/view-state`
   *  re-exports `ViewId`. */
  readonly activeViewId: string;
  /** Id of the currently active tool, or `null` if no tool is active. */
  readonly activeToolId: string | null;
}

/** Default state — used when the store is constructed without an
 *  initial active view.  `view-default-3d` matches the id of
 *  `Default3DView` in `@pryzm/view-state/defaults.ts`; we hard-code
 *  the string here to keep `@pryzm/stores` from depending on
 *  `@pryzm/view-state` (cyclic dep otherwise). */
export const DEFAULT_ACTIVE_VIEW_STATE: ActiveViewState = Object.freeze({
  activeViewId: 'view-default-3d',
  activeToolId: null,
});

export class ActiveViewStore extends Store<ActiveViewState> {
  /** Mirrors `SelectionStore.ephemeral` — see ADR-0016 §"Risks". */
  static readonly ephemeral = true;

  constructor(initial: ActiveViewState = DEFAULT_ACTIVE_VIEW_STATE) {
    super('active-view');
    // Seed the singleton entry directly so getActive() works pre-patch.
    this.state.set(ACTIVE_VIEW_ID, Object.freeze({ ...initial }));
  }

  /** Read the current active state.  Always returns a frozen object. */
  getActive(): ActiveViewState {
    return this.state.get(ACTIVE_VIEW_ID) ?? DEFAULT_ACTIVE_VIEW_STATE;
  }

  /** Replace the active state and notify subscribers via the standard
   *  patch path (so listeners observe a `DirtyDiff` the same way they
   *  do for any other store change).  Synthesises an Immer-shaped
   *  `replace` patch under path `[ACTIVE_VIEW_ID]`. */
  setActive(next: ActiveViewState): void {
    const frozen = Object.freeze({ ...next });
    const patch: Patch = {
      op: 'replace',
      path: [ACTIVE_VIEW_ID],
      value: frozen,
    };
    this.applyPatch([patch]);
  }
}
