// ActiveScheduleStore — singleton-shaped store holding the currently-
// active schedule id (S41 / Phase 2C).
//
// Mirrors `ActiveSheetStore` exactly — see that file for the
// singleton-on-Store rationale.  The schedule editor reads this to
// decide which schedule to render in the table view.

import { Store } from './Store.js';
import type { Patch } from './types.js';

export const ACTIVE_SCHEDULE_ID = 'active' as const;

export interface ActiveScheduleState {
  /** Id of the currently active schedule, or `null` when none is
   *  selected (initial state — the editor renders its empty state). */
  readonly activeScheduleId: string | null;
}

export const DEFAULT_ACTIVE_SCHEDULE_STATE: ActiveScheduleState = Object.freeze({
  activeScheduleId: null,
});

export class ActiveScheduleStore extends Store<ActiveScheduleState> {
  static readonly ephemeral = true;

  constructor(initial: ActiveScheduleState = DEFAULT_ACTIVE_SCHEDULE_STATE) {
    super('active-schedule');
    this.state.set(ACTIVE_SCHEDULE_ID, Object.freeze({ ...initial }));
  }

  getActive(): ActiveScheduleState {
    return this.state.get(ACTIVE_SCHEDULE_ID) ?? DEFAULT_ACTIVE_SCHEDULE_STATE;
  }

  setActive(activeScheduleId: string | null): void {
    const next = Object.freeze({ activeScheduleId });
    const patch: Patch = {
      op: 'replace',
      path: [ACTIVE_SCHEDULE_ID],
      value: next,
    };
    this.applyPatch([patch]);
  }
}
