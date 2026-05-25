// LayoutOptionsStore — the AIStore `pendingLayoutOptions` slice
// (SPEC-APARTMENT-LAYOUT-GENERATOR §13, step A5).
//
// Holds the ONE pending apartment-layout generation run (its runId + the scored
// options) until the user picks one (→ apartment.layout-execute) or cancels
// (→ apartment.layout-cancel → clear()). A new generation supersedes the prior
// run (only the latest is pending).
//
// Mirrors `AiApprovalQueueStore`: extends the Map-based `Store<T>` for the
// storeKey + registration convention, but bypasses applyPatch (these writes are
// born in the L7.5 AI host, not a user command) and exposes a coarse-grained
// `subscribe()` for the §11 modal renderer. `ScoredLayoutOption` is imported from
// the LEAN `@pryzm/ai-host/types` subpath (no main-barrel / core-app-model pull).

import { Store } from './Store.js';
import type { ScoredLayoutOption } from '@pryzm/ai-host/types';

/** The current pending generation run. */
export interface PendingLayoutRun {
  readonly runId: string;
  readonly options: readonly ScoredLayoutOption[];
}

export class LayoutOptionsStore extends Store<PendingLayoutRun> {
  constructor() { super('aiLayoutOptions'); }

  /** Set the pending run (a new generation supersedes the prior). The
   *  workflow impl calls this as its injected `setPendingLayouts`. */
  setLayouts(runId: string, options: readonly ScoredLayoutOption[]): void {
    this.state.clear();
    this.state.set(
      runId,
      Object.freeze({ runId, options: Object.freeze([...options]) as readonly ScoredLayoutOption[] }),
    );
    this._notifyChange();
  }

  /** The current pending run, or null. */
  current(): PendingLayoutRun | null {
    for (const run of this.state.values()) return run;
    return null;
  }

  /** runId of the current pending run, or null. */
  currentRunId(): string | null {
    return this.current()?.runId ?? null;
  }

  /** Options of the current run ([] when none). */
  options(): readonly ScoredLayoutOption[] {
    return this.current()?.options ?? [];
  }

  /** How many options are pending. */
  count(): number {
    return this.options().length;
  }

  /** Bounds-checked option at index in the current run, or null. The
   *  execute handler (A6) reads `optionAt(optionIndex)`. */
  optionAt(index: number): ScoredLayoutOption | null {
    const opts = this.options();
    return index >= 0 && index < opts.length ? opts[index]! : null;
  }

  /** Clear the pending run (cancel, or after execute). Idempotent. */
  clear(): void {
    if (this.state.size === 0) return;
    this.state.clear();
    this._notifyChange();
  }

  // ─── change subscription (mirrors AiApprovalQueueStore) ───────────
  // Base Store<T> only emits dirty diffs on applyPatch; our mutators write
  // this.state directly, so we add a coarse "something changed" listener for
  // the modal renderer. Pure subscribe contract: returns a disposer.
  private readonly _changeListeners = new Set<() => void>();
  subscribe(listener: () => void): () => void {
    this._changeListeners.add(listener);
    return () => { this._changeListeners.delete(listener); };
  }
  private _notifyChange(): void {
    for (const l of [...this._changeListeners]) {
      try { l(); } catch { /* ignore one listener's error */ }
    }
  }
}
