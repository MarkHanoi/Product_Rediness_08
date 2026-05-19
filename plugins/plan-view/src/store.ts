// PlanViewStore — canonical store facade for the plan-view plugin (S33 / PHASE-2B).
//
// Wave 12 recipe completion: plan-view plugin store.ts (previously missing).
//
// The plan-view plugin already has a LevelStore (for active level tracking)
// defined in LevelStore.ts. This store.ts is the canonical recipe entry
// point that re-exports LevelStore as the primary plan-view store,
// aligning the plugin with the Wave 12 verifier requirement.
//
// Additional ephemeral state (selected element id in plan view) is also
// tracked here via a thin record.

export { LevelStore, type LevelData } from './LevelStore.js';

export type PlanViewDirtyCallback = () => void;

export interface PlanViewSelection {
  readonly selectedIds: readonly string[];
  readonly selectionMode: 'replace' | 'add';
}

/**
 * PlanViewState captures ephemeral plan-view UI state that is not
 * persisted through the command-bus event log (contrast with LevelStore
 * which IS event-log-driven via level.activate commands).
 */
export class PlanViewState {
  private selection: PlanViewSelection = { selectedIds: [], selectionMode: 'replace' };
  private readonly dirtyListeners = new Set<PlanViewDirtyCallback>();

  getSelection(): PlanViewSelection {
    return this.selection;
  }

  setSelection(sel: PlanViewSelection): void {
    this.selection = sel;
    this.fireDirty();
  }

  clearSelection(): void {
    this.selection = { selectedIds: [], selectionMode: 'replace' };
    this.fireDirty();
  }

  subscribeDirty(cb: PlanViewDirtyCallback): () => void {
    this.dirtyListeners.add(cb);
    return () => this.dirtyListeners.delete(cb);
  }

  private fireDirty(): void {
    for (const cb of this.dirtyListeners) cb();
  }
}
