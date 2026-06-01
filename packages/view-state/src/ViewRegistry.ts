// ViewRegistry — Store<ViewDefinition> keyed by view-id.
//
// Spec: `phases/PHASE-1C-Q3-M7-M9-ELEMENT-FAMILIES.md` §S17 lines 836-840.
// ADR: `docs/02-decisions/adrs/0016-view-state-command-driven.md` §"Decision".
//
// Standard `Store<T>` subclass — adds nothing beyond a `defaults()`
// helper and the `ephemeral = false` annotation (views ARE persisted —
// only `view.switch` is ephemeral, NOT view definitions themselves).
//
// CRUD lands via `applyPatch` from the bus.  `defaults()` is called by
// the bootstrap on a fresh project and seeds Default3DView +
// LevelOverview so the user has something to switch to.

import { Store } from '@pryzm/stores';
import type { ViewDefinition } from './ViewDefinition.js';
import { defaults as seedDefaults } from './defaults.js';

export class ViewRegistry extends Store<ViewDefinition> {
  /** Mirrors the convention from `Store` subclasses; views are
   *  persisted via the event log, so this is `false`. */
  static readonly ephemeral = false;

  constructor() {
    super('view');
  }

  /** Seed list returned to bootstrap on a fresh project.  Currently
   *  `[Default3DView, LevelOverview]` — see `defaults.ts`. */
  defaults(): readonly ViewDefinition[] {
    return seedDefaults();
  }
}
