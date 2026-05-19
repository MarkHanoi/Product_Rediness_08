// @pryzm/beta-signup — store for accepted signups.
//
// Standalone (does NOT extend Store<T>): the L1 Store base is
// optimised for command-bus + applyPatch wiring with one Map<Id, T>
// per store. The beta sign-up store needs a secondary email→id
// dedupe index and lives outside the editor's L1 patch loop, so we
// keep it independent. Same listener contract for parity.

import type { BetaSignupRecord } from './types.js';

interface BetaSignupsState {
  readonly byId: ReadonlyMap<string, BetaSignupRecord>;
  readonly byEmail: ReadonlyMap<string, string>;
}

const EMPTY: BetaSignupsState = Object.freeze({
  byId: new Map<string, BetaSignupRecord>(),
  byEmail: new Map<string, string>(),
});

export class BetaSignupStore {
  private _state: BetaSignupsState = EMPTY;
  private readonly _listeners = new Set<() => void>();

  // ─── selectors ───────────────────────────────────────────────────
  snapshot(): BetaSignupsState {
    return this._state;
  }
  all(): readonly BetaSignupRecord[] {
    return Array.from(this._state.byId.values());
  }
  byId(id: string): BetaSignupRecord | undefined {
    return this._state.byId.get(id);
  }
  byEmail(email: string): BetaSignupRecord | undefined {
    const id = this._state.byEmail.get(email.trim().toLowerCase());
    return id ? this._state.byId.get(id) : undefined;
  }
  count(): number {
    return this._state.byId.size;
  }
  countByCohort(): Readonly<Record<string, number>> {
    const out: Record<string, number> = { c1: 0, c2: 0, c3: 0, academic: 0 };
    for (const r of this._state.byId.values()) {
      out[r.cohort] = (out[r.cohort] ?? 0) + 1;
    }
    return Object.freeze(out);
  }

  // ─── subscriptions ───────────────────────────────────────────────
  subscribe(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }
  private _notify(): void {
    for (const l of [...this._listeners]) {
      try { l(); } catch { /* swallow */ }
    }
  }

  // ─── mutators ────────────────────────────────────────────────────
  /** Insert (or short-circuit if email already present). Returns the
   *  stored record (existing or new). */
  enqueue(record: BetaSignupRecord): BetaSignupRecord {
    const cur = this._state;
    const dedupKey = record.email.trim().toLowerCase();
    const existingId = cur.byEmail.get(dedupKey);
    if (existingId) {
      const existing = cur.byId.get(existingId);
      if (existing) return existing;
    }
    const byId = new Map(cur.byId);
    const byEmail = new Map(cur.byEmail);
    byId.set(record.id, record);
    byEmail.set(dedupKey, record.id);
    this._state = Object.freeze({ byId, byEmail });
    this._notify();
    return record;
  }

  /** Mark a signup invited / rejected. No-op if id is unknown. */
  setStatus(id: string, status: BetaSignupRecord['status']): void {
    const cur = this._state;
    const r = cur.byId.get(id);
    if (!r || r.status === status) return;
    const updated: BetaSignupRecord = { ...r, status };
    const byId = new Map(cur.byId);
    byId.set(id, updated);
    this._state = Object.freeze({ byId, byEmail: cur.byEmail });
    this._notify();
  }
}
