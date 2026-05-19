// ActiveSectionStore — singleton-shaped store holding the currently-
// active section id (W-09 / Phase 2C closeout).
//
// Spec: `phases/audits/PHASE-2-CLOSE-IMPLEMENTATION-PLAN-2026-04-28.md` §W-09.
//
// CONTRACT
// ─────────────────────────────────────────────────────────────────────────────
// • Singleton-on-Store pattern (mirrors `ActiveSheetStore` /
//   `ActiveViewStore`): the inner Map only ever holds one entry under
//   the fixed key `'active'`.
// • `setActive(sectionId | null)` synthesises a `replace` patch under
//   path `[ACTIVE_SECTION_ID]` and routes it through `applyPatch`.
// • `ephemeral = true` mirrors `ActiveSheetStore` — active-section
//   mutations bypass the event log.

import { Store } from './Store.js';
import type { Patch } from './types.js';

export const ACTIVE_SECTION_ID = 'active' as const;

export interface ActiveSectionState {
  /** Id of the currently active section, or `null` when no section is
   *  selected. */
  readonly activeSectionId: string | null;
}

export const DEFAULT_ACTIVE_SECTION_STATE: ActiveSectionState = Object.freeze({
  activeSectionId: null,
});

export class ActiveSectionStore extends Store<ActiveSectionState> {
  static readonly ephemeral = true;

  constructor(initial: ActiveSectionState = DEFAULT_ACTIVE_SECTION_STATE) {
    super('active-section');
    this.state.set(ACTIVE_SECTION_ID, Object.freeze({ ...initial }));
  }

  getActive(): ActiveSectionState {
    return this.state.get(ACTIVE_SECTION_ID) ?? DEFAULT_ACTIVE_SECTION_STATE;
  }

  setActive(activeSectionId: string | null): void {
    const next = Object.freeze({ activeSectionId });
    const patch: Patch = {
      op: 'replace',
      path: [ACTIVE_SECTION_ID],
      value: next,
    };
    this.applyPatch([patch]);
  }
}
