// In-memory soft-lock store — default implementation when DATABASE_URL or
// SYNC_SOFT_LOCKS=pg are unset.  Single-process semantics; identical
// observable behaviour to PgSoftLockStore for the unit suite.
//
// Concurrency model: the in-memory store is single-threaded (Node event
// loop); the per-element guard against torn reads/writes is implicit
// because each acquire/extend/release is a single sync code path between
// `await` points.  PgSoftLockStore uses an advisory lock keyed on
// `hash(projectId || elementId)` to enforce the same invariant across
// processes.

import type { LockRow } from '@pryzm/sync-client';
import {
  LeaseMismatchError,
  NoSuchLockError,
  type AcquireInput,
  type AcquireResult,
  type ExtendInput,
  type ReleaseInput,
  type SoftLockStats,
  type SoftLockStore,
} from './types.js';

interface InternalRow extends LockRow {
  readonly projectId: string;
}

const key = (projectId: string, elementId: string): string =>
  `${projectId}\x00${elementId}`;

export interface InMemorySoftLockStoreOptions {
  /** Clock injection for tests. */
  readonly now?: () => number;
}

export class InMemorySoftLockStore implements SoftLockStore {
  private readonly rows = new Map<string, InternalRow>();
  private readonly now: () => number;

  constructor(opts: InMemorySoftLockStoreOptions = {}) {
    this.now = opts.now ?? Date.now;
  }

  async acquire(input: AcquireInput): Promise<AcquireResult> {
    const k = key(input.projectId, input.elementId);
    const t = this.now();
    const existing = this.rows.get(k);
    if (existing && existing.expiresAtMs > t && existing.holderId !== input.holderId) {
      // Held by another peer.
      return {
        ok: false,
        holder: {
          userId: existing.holderId,
          displayName: existing.holderDisplayName,
          expiresAtMs: existing.expiresAtMs,
        },
      };
    }
    // Either fresh, expired, or held by the same peer (re-acquire).
    const row: InternalRow = {
      projectId: input.projectId,
      elementId: input.elementId,
      holderId: input.holderId,
      holderDisplayName: input.holderDisplayName,
      leaseId: input.leaseId,
      acquiredAtMs: existing && existing.holderId === input.holderId ? existing.acquiredAtMs : t,
      expiresAtMs: t + Math.max(1, input.ttlMs),
    };
    this.rows.set(k, row);
    return { ok: true, row };
  }

  async extend(input: ExtendInput): Promise<LockRow> {
    const k = key(input.projectId, input.elementId);
    const existing = this.rows.get(k);
    if (!existing) throw new NoSuchLockError(input.elementId);
    if (existing.leaseId !== input.leaseId || existing.holderId !== input.holderId) {
      throw new LeaseMismatchError(input.elementId);
    }
    const t = this.now();
    const next: InternalRow = {
      ...existing,
      expiresAtMs: t + Math.max(1, input.ttlMs),
    };
    this.rows.set(k, next);
    return next;
  }

  async release(input: ReleaseInput): Promise<boolean> {
    const k = key(input.projectId, input.elementId);
    const existing = this.rows.get(k);
    if (!existing) return false;
    if (existing.leaseId !== input.leaseId) {
      throw new LeaseMismatchError(input.elementId);
    }
    this.rows.delete(k);
    return true;
  }

  async list(projectId: string): Promise<readonly LockRow[]> {
    const t = this.now();
    const out: LockRow[] = [];
    for (const row of this.rows.values()) {
      if (row.projectId !== projectId) continue;
      if (row.expiresAtMs <= t) continue;
      out.push({
        elementId: row.elementId,
        holderId: row.holderId,
        holderDisplayName: row.holderDisplayName,
        leaseId: row.leaseId,
        acquiredAtMs: row.acquiredAtMs,
        expiresAtMs: row.expiresAtMs,
      });
    }
    out.sort((a, b) => a.elementId.localeCompare(b.elementId));
    return out;
  }

  async sweepExpired(): Promise<readonly LockRow[]> {
    const t = this.now();
    const out: LockRow[] = [];
    for (const [k, row] of this.rows) {
      if (row.expiresAtMs <= t) {
        this.rows.delete(k);
        out.push({
          elementId: row.elementId,
          holderId: row.holderId,
          holderDisplayName: row.holderDisplayName,
          leaseId: row.leaseId,
          acquiredAtMs: row.acquiredAtMs,
          expiresAtMs: row.expiresAtMs,
        });
      }
    }
    return out;
  }

  async releaseAllForProject(projectId: string): Promise<number> {
    let n = 0;
    for (const [k, row] of this.rows) {
      if (row.projectId === projectId) {
        this.rows.delete(k);
        n++;
      }
    }
    return n;
  }

  stats(): SoftLockStats {
    return { heldCount: this.rows.size, selection: 'memory' };
  }

  async close(): Promise<void> {
    this.rows.clear();
  }
}
