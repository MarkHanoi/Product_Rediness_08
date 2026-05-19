// InMemoryStorageDriver — default driver for dev/test/CI (S21 D4).
//
// Spec source: `docs/00_NEW_ARCHITECTURE/phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 619 — `[strategic ADR-003]` storage driver isolation.
//
// Every method runs in O(1) against an in-process Map.  No file I/O, no
// network — the driver is safe to instantiate inside a test, a bench, or
// a Replit container without external infrastructure.  Production
// deployments swap to `R2StorageDriver` via `createStorageDriver()`.

import { performance } from 'node:perf_hooks';
import {
  type StorageDriver,
  type StorageDriverStats,
  StorageObjectNotFoundError,
} from './types.js';

export interface InMemoryStorageDriverOptions {
  /** Optional bytes to seed the driver with (hash → bytes).  Useful for
   *  tests that want a pre-warmed manifest cache. */
  readonly seed?: ReadonlyMap<string, Uint8Array>;
}

export class InMemoryStorageDriver implements StorageDriver {
  private readonly objects: Map<string, Uint8Array>;
  private _puts = 0;
  private _gets = 0;
  private _heads = 0;
  private _bytesPut = 0;
  private _bytesGet = 0;
  private _putDurationMs = 0;
  private _getDurationMs = 0;
  private _disposed = false;

  constructor(opts: InMemoryStorageDriverOptions = {}) {
    this.objects = new Map(opts.seed ?? []);
  }

  async put(hash: string, bytes: Uint8Array): Promise<void> {
    this.assertNotDisposed();
    const t0 = performance.now();
    // Content-addressed: idempotent.  Skip the assignment when the hash
    // is already present — saves the allocation churn but still counts
    // toward `puts` for accurate cost accounting (R2 is billed per call,
    // not per unique upload).
    if (!this.objects.has(hash)) {
      this.objects.set(hash, bytes);
    }
    this._puts++;
    this._bytesPut += bytes.byteLength;
    this._putDurationMs += performance.now() - t0;
  }

  async get(hash: string): Promise<Uint8Array> {
    this.assertNotDisposed();
    const t0 = performance.now();
    const bytes = this.objects.get(hash);
    this._gets++;
    if (bytes === undefined) {
      this._getDurationMs += performance.now() - t0;
      throw new StorageObjectNotFoundError(hash);
    }
    this._bytesGet += bytes.byteLength;
    this._getDurationMs += performance.now() - t0;
    return bytes;
  }

  async has(hash: string): Promise<boolean> {
    this.assertNotDisposed();
    this._heads++;
    return this.objects.has(hash);
  }

  async getSignedUrl(hash: string, _ttlSec: number): Promise<string> {
    this.assertNotDisposed();
    // Synthetic scheme — the browser cannot resolve `mem:` URLs; only
    // the same process can resolve via `get()`.  Used in the bench
    // harness so the latency measurement covers URL minting too.
    return `mem://${hash}`;
  }

  stats(): StorageDriverStats {
    return {
      puts: this._puts,
      gets: this._gets,
      heads: this._heads,
      bytesPut: this._bytesPut,
      bytesGet: this._bytesGet,
      putDurationMs: this._putDurationMs,
      getDurationMs: this._getDurationMs,
    };
  }

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;
    this.objects.clear();
  }

  /** Test-only — current object count.  Not part of the `StorageDriver`
   *  interface; only the InMemory implementation exposes it. */
  size(): number {
    return this.objects.size;
  }

  private assertNotDisposed(): void {
    if (this._disposed) {
      throw new Error('InMemoryStorageDriver: instance has been disposed');
    }
  }
}
