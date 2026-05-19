// ActiveSheetStore — singleton-shaped store holding the currently-
// active sheet id (S37 / Phase 2C).
//
// Spec: `phases/PHASE-2C-Q3-M19-M21-SHEETS-SCHEDULES.md` §S37 line 121
// ("`SheetListStore.activeSheetId` controls which sheet the editor
// displays").  We name the singleton store `ActiveSheetStore` rather
// than `SheetListStore` to mirror the existing `ActiveViewStore`
// (singleton-on-Store) and to keep one concept per store: the SheetStore
// holds the catalogue, this store holds the cursor.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Singleton-on-Store pattern (mirrors `ActiveViewStore`): the inner
//   Map only ever holds one entry under the fixed key `'active'`.
// • `setActive(sheetId | null)` synthesises a `replace` patch under
//   path `[ACTIVE_SHEET_ID]` and routes it through `applyPatch` so
//   listeners observe the same `DirtyDiff` shape they observe for any
//   other store change.
// • `ephemeral = true` mirrors `SelectionStore` / `ActiveViewStore` —
//   the PatchEmitter ephemeral-routing branch will treat active-sheet
//   mutations like selection changes (no event-log persistence).

import { Store } from './Store.js';
import type { Patch } from './types.js';

export const ACTIVE_SHEET_ID = 'active' as const;

export interface ActiveSheetState {
  /** Id of the currently active sheet, or `null` when no sheet is
   *  selected (initial state — the editor renders its empty state). */
  readonly activeSheetId: string | null;
}

export const DEFAULT_ACTIVE_SHEET_STATE: ActiveSheetState = Object.freeze({
  activeSheetId: null,
});

export class ActiveSheetStore extends Store<ActiveSheetState> {
  static readonly ephemeral = true;

  constructor(initial: ActiveSheetState = DEFAULT_ACTIVE_SHEET_STATE) {
    super('active-sheet');
    this.state.set(ACTIVE_SHEET_ID, Object.freeze({ ...initial }));
  }

  getActive(): ActiveSheetState {
    return this.state.get(ACTIVE_SHEET_ID) ?? DEFAULT_ACTIVE_SHEET_STATE;
  }

  setActive(activeSheetId: string | null): void {
    const next = Object.freeze({ activeSheetId });
    const patch: Patch = {
      op: 'replace',
      path: [ACTIVE_SHEET_ID],
      value: next,
    };
    this.applyPatch([patch]);
  }
}
