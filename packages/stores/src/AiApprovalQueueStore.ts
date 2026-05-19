// AiApprovalQueueStore — pure DTO store for AI pending actions
// (S47 / ADR-0037).
//
// Spec source:
//   • `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md` §S47 lines
//     615-636 ("Implementation Detail — `AiApprovalQueueStore`").
//   • Track B allocation table line 70: `packages/stores/`.
//
// Mirrors `AnnotationStore` (S34) — Map-based, applyPatch-only, dirty
// diffs.  Selectors: `pending`, `byWorkflow`, `byStatus`.  Pure
// transition helpers `approve`, `reject`, `expire` produce Immer
// patches via the standard `enqueue → produceCommand → applyPatch` loop
// when wired to the command bus at S49.
//
// Per SPEC-28 §4 + ADR-028 Part E: per-project budget enforcement and
// per-workspace AI Spend view live SERVER-SIDE; this store is the
// client-side projection only. Workspace-admin override for plan/role
// per ADR-028 Part E ships at S65 (3C) — unchanged in S47.
//
// The AiPendingAction shape is imported from `@pryzm/ai-host/types` so
// the store and the host share a single source of truth.

import { Store } from './Store.js';
import type {
  AiPendingAction,
  AiPendingActionStatus,
  AiWorkflowKind,
} from '@pryzm/ai-host/types';

export type AiPendingActionData = AiPendingAction;
export type AiPendingActionId = AiPendingAction['id'];
export type AiApprovalQueueState = Record<string, AiPendingActionData>;

/** Default TTL for pending actions before they auto-expire. Per
 *  spec line 627 expired is a terminal status. 5 minutes mirrors
 *  the soft-lock UX rhythm — long enough for a user to triage,
 *  short enough that stale rows don't pile up. */
export const DEFAULT_PENDING_TTL_MS = 5 * 60_000;

export class AiApprovalQueueStore extends Store<AiPendingActionData> {
  constructor() { super('aiApprovalQueue'); }

  ids(): readonly string[] { return [...this.state.keys()]; }

  /** All pending actions ordered by createdAt (oldest first). */
  pending(): readonly AiPendingActionData[] {
    const out: AiPendingActionData[] = [];
    for (const action of this.state.values()) {
      if (action.status === 'pending') out.push(action);
    }
    out.sort((a, b) => a.createdAt - b.createdAt);
    return out;
  }

  byWorkflow(kind: AiWorkflowKind): readonly AiPendingActionData[] {
    const out: AiPendingActionData[] = [];
    for (const action of this.state.values()) {
      if (action.workflow === kind) out.push(action);
    }
    return out;
  }

  byStatus(status: AiPendingActionStatus): readonly AiPendingActionData[] {
    const out: AiPendingActionData[] = [];
    for (const action of this.state.values()) {
      if (action.status === status) out.push(action);
    }
    return out;
  }

  /** Sidebar badge count (spec D3): number of pending actions. */
  pendingCount(): number {
    let n = 0;
    for (const action of this.state.values()) {
      if (action.status === 'pending') n++;
    }
    return n;
  }

  /** Direct-enqueue API used by `AiHost.submit` when wired via
   *  `AiApprovalQueueLike`. Bypasses the command bus — the action
   *  is born in the L7.5 host, not in a user-issued command. */
  enqueue(action: AiPendingActionData): void {
    this.state.set(action.id, Object.freeze({ ...action }));
    this._notifyChange();
  }

  // ─── change subscription (S48 D5 — sidebar-panel hook) ───────────
  // The base Store<T> emits dirty diffs on `applyPatch` only; this
  // store's mutators write to `this.state` directly so they bypass
  // that channel. We add a coarse-grained "something changed" listener
  // for UI consumers (the ApprovalQueuePanel renderer) — pure subscribe
  // contract: callable many times, returns a disposer.
  private readonly _changeListeners = new Set<() => void>();
  subscribe(listener: () => void): () => void {
    this._changeListeners.add(listener);
    return () => {
      this._changeListeners.delete(listener);
    };
  }
  private _notifyChange(): void {
    // Snapshot to avoid mid-iteration mutation perturbation.
    for (const l of [...this._changeListeners]) {
      try { l(); } catch { /* ignore one listener's error */ }
    }
  }

  /** Pure transition: returns the next-state action (or null if no
   *  transition). Tests exercise this without a full command-bus
   *  loop. */
  static nextStateForApprove(
    action: AiPendingActionData,
  ): AiPendingActionData | null {
    if (action.status !== 'pending') return null;
    return Object.freeze({ ...action, status: 'approved' as const });
  }

  static nextStateForReject(
    action: AiPendingActionData,
  ): AiPendingActionData | null {
    if (action.status !== 'pending') return null;
    return Object.freeze({ ...action, status: 'rejected' as const });
  }

  static nextStateForExpire(
    action: AiPendingActionData,
    now: number,
    ttlMs: number = DEFAULT_PENDING_TTL_MS,
  ): AiPendingActionData | null {
    if (action.status !== 'pending') return null;
    if (now - action.createdAt < ttlMs) return null;
    return Object.freeze({ ...action, status: 'expired' as const });
  }

  /** Convenience mutators for use in tests + the L4 plugin handler.
   *  In the production wire-up these go through the command bus so
   *  the L1↔L2 invariant is preserved. */
  approve(id: AiPendingActionId): AiPendingActionData | null {
    const cur = this.state.get(id);
    if (!cur) return null;
    const next = AiApprovalQueueStore.nextStateForApprove(cur);
    if (!next) return null;
    this.state.set(id, next);
    this._notifyChange();
    return next;
  }

  reject(id: AiPendingActionId): AiPendingActionData | null {
    const cur = this.state.get(id);
    if (!cur) return null;
    const next = AiApprovalQueueStore.nextStateForReject(cur);
    if (!next) return null;
    this.state.set(id, next);
    this._notifyChange();
    return next;
  }

  /** Sweep all pending actions whose createdAt is older than
   *  (now - ttlMs) into 'expired'. Returns the number swept. */
  expireOlderThan(now: number, ttlMs: number = DEFAULT_PENDING_TTL_MS): number {
    let n = 0;
    for (const [id, cur] of this.state.entries()) {
      const next = AiApprovalQueueStore.nextStateForExpire(cur, now, ttlMs);
      if (next) { this.state.set(id, next); n++; }
    }
    if (n > 0) this._notifyChange();
    return n;
  }

  get(id: AiPendingActionId): AiPendingActionData | undefined {
    return this.state.get(id);
  }
}

/** Sidebar-badge hook helper — pure adapter for the editor's per-tick
 *  count subscription. The editor wires this against the singleton
 *  store; tests can call directly. */
export function approvalQueueBadgeCount(store: AiApprovalQueueStore): number {
  return store.pendingCount();
}
