// apps/sync-server/locks/Sweeper.ts — TTL expiry sweeper (S45 D6).
//
// Spec §S45 line 440: "A scheduled job sweeps expired rows every 5 s."
//
// Implementation:
//   • Every `intervalMs` (default 5 000), call `store.sweepExpired()`.
//   • For each row swept, fire `onLockReleased(row)` so the SessionManager
//     can broadcast a `lock.released` notification to all peers in the
//     project (eventual-consistency hint; the awareness layer is the
//     authoritative published surface but sweeper-driven releases bypass
//     awareness because the original holder has likely disconnected).
//   • Errors during sweep are logged + swallowed — we never want a
//     transient DB hiccup to kill the timer.

import type { LockRow } from '@pryzm/sync-client';
import type { SoftLockStore } from './types.js';

export interface SweeperOptions {
  readonly intervalMs?: number;
  readonly setTimeout?: typeof setTimeout;
  readonly clearTimeout?: typeof clearTimeout;
  /** Per-row callback fired for every row the sweeper deletes. */
  readonly onLockReleased?: (row: LockRow) => void;
  /** Logger injection (default = console). */
  readonly logger?: { warn(msg: string, ...rest: unknown[]): void };
}

export const DEFAULT_SWEEP_INTERVAL_MS = 5_000;

export class Sweeper {
  private readonly store: SoftLockStore;
  private readonly intervalMs: number;
  private readonly setT: typeof setTimeout;
  private readonly clearT: typeof clearTimeout;
  private readonly onLockReleased?: (row: LockRow) => void;
  private readonly logger: { warn(msg: string, ...rest: unknown[]): void };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private cycles = 0;
  private rowsSwept = 0;

  constructor(store: SoftLockStore, opts: SweeperOptions = {}) {
    this.store = store;
    this.intervalMs = opts.intervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    this.setT = opts.setTimeout ?? setTimeout;
    this.clearT = opts.clearTimeout ?? clearTimeout;
    this.onLockReleased = opts.onLockReleased;
    this.logger = opts.logger ?? console;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer !== null) {
      this.clearT(this.timer);
      this.timer = null;
    }
  }

  /** Run one sweep immediately — exposed for tests + the bench harness. */
  async sweepOnce(): Promise<readonly LockRow[]> {
    this.cycles++;
    try {
      const rows = await this.store.sweepExpired();
      this.rowsSwept += rows.length;
      if (this.onLockReleased) {
        for (const row of rows) {
          try { this.onLockReleased(row); } catch (err) {
            this.logger.warn('[sweeper] onLockReleased threw', err);
          }
        }
      }
      return rows;
    } catch (err) {
      this.logger.warn('[sweeper] sweepExpired threw', err);
      return [];
    }
  }

  stats(): { cycles: number; rowsSwept: number; running: boolean; intervalMs: number } {
    return { cycles: this.cycles, rowsSwept: this.rowsSwept, running: this.running, intervalMs: this.intervalMs };
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = this.setT(() => {
      void this.sweepOnce().finally(() => this.scheduleNext());
    }, this.intervalMs);
  }
}
