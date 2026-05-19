// @pryzm/storage-driver — public types (frozen S21 D4).
//
// Spec source: `docs/00_NEW_ARCHITECTURE/phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 619 — `[strategic ADR-003]`: bake worker writes chunks via the
//     storage driver. R2 in PRYZM-hosted; MinIO in self-host. The driver is
//     the only abstraction the bake worker sees.
//
// `[strategic ADR-003]` (`docs/00_NEW_ARCHITECTURE/adrs/ADR-003-object-storage.md`)
// makes this interface canonical: every R2 / MinIO call in the system goes
// through `StorageDriver` so that the same code paths run in:
//   • dev (InMemoryStorageDriver — no external dep)
//   • PRYZM-hosted prod (R2StorageDriver against Cloudflare R2)
//   • self-host (R2StorageDriver against MinIO via the S3-compatible API)

/**
 * Counters maintained by every driver implementation.  Used by the bake
 * worker's `CostMeter` to estimate per-event R2 spend (S21 exit
 * criterion #5: per-event R2 cost audited).
 *
 * The counter shape is stable; fields may be added but never removed.
 */
export interface StorageDriverStats {
  /** Class B (write) operations.  Cloudflare R2 charges $0.36 per million. */
  readonly puts: number;
  /** Class A (read) operations.  Cloudflare R2 charges $0.36 per ten million. */
  readonly gets: number;
  /** `has()` calls.  Implementations may collapse these into `gets` when the
   *  underlying API requires a HEAD/GET to test existence — driver decides. */
  readonly heads: number;
  /** Total bytes uploaded across all `put()` calls. */
  readonly bytesPut: number;
  /** Total bytes downloaded across all `get()` calls. */
  readonly bytesGet: number;
  /** Wall-clock ms accumulated inside `put()` calls. */
  readonly putDurationMs: number;
  /** Wall-clock ms accumulated inside `get()` calls. */
  readonly getDurationMs: number;
}

/**
 * Storage driver interface.  Every chunk write (S19, S21) and chunk read
 * (S23) routes through this interface.  Object keys are content-addressed
 * SHA-256 hex hashes — drivers MUST treat the key as opaque (no path
 * manipulation, no prefix injection — those are the caller's job via the
 * `keyPrefix` constructor option).
 *
 * Errors:
 *   • `get()` on a missing hash MUST throw `StorageObjectNotFoundError`.
 *   • `put()` on an existing hash is a no-op (content-addressed —
 *     same hash means same bytes).  Drivers MAY skip the actual upload
 *     in this case but MUST increment `puts` for accounting.
 *   • Any I/O failure MUST throw the underlying error wrapped in a
 *     `StorageDriverError` with the original cause attached.
 */
export interface StorageDriver {
  /** Upload `bytes` keyed by content-addressed SHA-256 `hash`.  Idempotent. */
  put(hash: string, bytes: Uint8Array): Promise<void>;
  /** Fetch bytes for `hash`.  Throws `StorageObjectNotFoundError` when missing. */
  get(hash: string): Promise<Uint8Array>;
  /** Cheap existence check.  MAY be implemented via HEAD (preferred) or by
   *  a falsy `get()` catch (fallback). */
  has(hash: string): Promise<boolean>;
  /**
   * Mint a time-limited URL the editor can fetch directly.  In-memory
   * drivers return a synthetic `mem:<hash>` URL that only the same
   * process can resolve via `get()`; R2 drivers return real signed URLs.
   *
   * The `ttlSec` parameter is advisory — drivers may clamp to the
   * minimum / maximum the underlying provider supports.
   */
  getSignedUrl(hash: string, ttlSec: number): Promise<string>;
  /** Snapshot of cost counters.  Cheap (no I/O). */
  stats(): StorageDriverStats;
  /** Release any held resources (HTTP keepalive sockets, etc.).  Idempotent. */
  dispose(): Promise<void>;
}

/** Thrown by `get()` when the object does not exist. */
export class StorageObjectNotFoundError extends Error {
  override readonly name = 'StorageObjectNotFoundError';
  constructor(public readonly hash: string) {
    super(`No storage object with hash ${hash}`);
  }
}

/** Wraps any underlying I/O error from the driver. */
export class StorageDriverError extends Error {
  override readonly name = 'StorageDriverError';
  constructor(message: string, public override readonly cause?: unknown) {
    super(message);
  }
}
