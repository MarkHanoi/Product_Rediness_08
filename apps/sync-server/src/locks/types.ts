// apps/sync-server/locks/types.ts — soft-lock store contract (S45 D2).
//
// Spec source: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md`
//   • §S45 lines 425-438 — `soft_locks` schema (verbatim in soft-locks.sql).
//   • §S45 line 440 — sweeper period 5 s; gateway rejection is 409 Conflict.
//   • §S45 line 487 — D2 deliverable.
//
// Design parallels the eventLog factory pattern (apps/sync-server/eventLog/).
// Two implementations: InMemorySoftLockStore (default) and PgSoftLockStore
// (when SYNC_SOFT_LOCKS=pg + DATABASE_URL set).  Selection via
// createSoftLockStore({env}).

import type { LockRow } from '@pryzm/sync-client';

export interface SoftLockStore {
  /** Try to acquire a lock.  Returns:
   *    • `{ ok: true, row }` — lease was granted (or extended for the same holder).
   *    • `{ ok: false, holder }` — another peer holds it; do NOT extend.
   *
   *  The implementation enforces the chk_future_expiry constraint internally
   *  by setting `expires_at = now + ttlMs`. */
  acquire(input: AcquireInput): Promise<AcquireResult>;

  /** Extend an existing lease.  Returns the new row on success, throws
   *  `LeaseMismatchError` if `leaseId` doesn't match the row, or
   *  `NoSuchLockError` if there's no row for the element. */
  extend(input: ExtendInput): Promise<LockRow>;

  /** Release a lock.  Returns `true` if a row was deleted, `false` if there
   *  was no row (idempotent / sweeper got there first).  Throws
   *  `LeaseMismatchError` if the row exists but `leaseId` doesn't match. */
  release(input: ReleaseInput): Promise<boolean>;

  /** List all currently-held locks for a project.  Used by GET /api/locks
   *  on cold-start.  Filters out expired rows (the sweeper handles deletion
   *  but a query may run between expiry and the next sweep tick). */
  list(projectId: string): Promise<readonly LockRow[]>;

  /** Delete every row whose `expires_at <= now`.  Returns the deleted row
   *  list so the sweeper can broadcast release notifications. */
  sweepExpired(): Promise<readonly LockRow[]>;

  /** Release every server-side lock for a project (admin / project-deletion
   *  hook).  Returns the number of rows deleted. */
  releaseAllForProject(projectId: string): Promise<number>;

  /** Diagnostic. */
  stats(): SoftLockStats;

  close(): Promise<void>;
}

export interface AcquireInput {
  readonly projectId: string;
  readonly elementId: string;
  readonly holderId: string;
  readonly holderDisplayName: string;
  readonly leaseId: string;
  readonly ttlMs: number;
}

export interface ExtendInput {
  readonly projectId: string;
  readonly elementId: string;
  readonly holderId: string;
  readonly leaseId: string;
  readonly ttlMs: number;
}

export interface ReleaseInput {
  readonly projectId: string;
  readonly elementId: string;
  readonly leaseId: string;
}

export type AcquireResult =
  | { readonly ok: true; readonly row: LockRow }
  | {
      readonly ok: false;
      readonly holder: {
        readonly userId: string;
        readonly displayName: string;
        readonly expiresAtMs: number;
      };
    };

export interface SoftLockStats {
  readonly heldCount: number;
  readonly selection: 'memory' | 'pg';
}

export class LeaseMismatchError extends Error {
  constructor(elementId: string) {
    super(`Soft-lock lease mismatch for element ${elementId}`);
    this.name = 'LeaseMismatchError';
    Object.setPrototypeOf(this, LeaseMismatchError.prototype);
  }
}

export class NoSuchLockError extends Error {
  constructor(elementId: string) {
    super(`No soft-lock for element ${elementId}`);
    this.name = 'NoSuchLockError';
    Object.setPrototypeOf(this, NoSuchLockError.prototype);
  }
}
