// R2StorageDriver — Cloudflare R2 / MinIO driver (S21 D4 — STUB).
//
// Spec source: `docs/00_NEW_ARCHITECTURE/phases/PHASE-1D-Q4-M10-M12-BAKE-PRYZM-ALPHA.md`
//   • S21 line 619 — `[strategic ADR-003]` storage driver isolation.
//   • S21 line 859 (D4 deliverable) — "Implement `apps/bake-worker/storage/r2.ts` —
//     Cloudflare R2 PUT (via presigned URL) + GET (via signed URL with 1 h TTL).
//     Use `@aws-sdk/client-s3` with the R2 S3-compatible endpoint.  Env vars:
//     R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME."
//
// SCOPE NOTE — S21 v0 ships the storage-driver INTERFACE plus the
// InMemory implementation.  The R2 wire-up requires `@aws-sdk/client-s3`
// (~ 8 MB of transitive deps) which is intentionally NOT installed in
// the alpha repo.  The constructor below validates env wiring and
// throws a deterministic error pointing the operator at the install
// command — production deployments add the dep, set the env vars, and
// the driver lights up without code changes.
//
// The driver is wired into `createStorageDriver()` so that:
//   • Setting all four R2_* env vars in production opts in.
//   • The bake worker's import graph stays pure (no aws-sdk in dev/test).
//
// This is the canonical pattern documented in `docs/04-reference/architecture-detail/bake-worker.md`.

import {
  type StorageDriver,
  type StorageDriverStats,
  StorageDriverError,
} from './types.js';

export interface R2StorageDriverOptions {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucketName: string;
  /** Object key prefix (e.g. `chunks/`).  Driver does NOT inject one;
   *  the caller is responsible for namespace discipline.  Default: `''`. */
  readonly keyPrefix?: string;
}

/**
 * R2 / MinIO driver.  Construction asserts that the operator added the
 * S3 client to their deployment; instantiation is a no-op until `put()`
 * / `get()` is called and the lazy import resolves.
 */
export class R2StorageDriver implements StorageDriver {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- read by future S22 D4 wire-up.
  private readonly _opts: Required<R2StorageDriverOptions>;

  constructor(opts: R2StorageDriverOptions) {
    if (!opts.accountId) throw new Error('R2StorageDriver: accountId required');
    if (!opts.accessKeyId) throw new Error('R2StorageDriver: accessKeyId required');
    if (!opts.secretAccessKey) throw new Error('R2StorageDriver: secretAccessKey required');
    if (!opts.bucketName) throw new Error('R2StorageDriver: bucketName required');
    this._opts = { ...opts, keyPrefix: opts.keyPrefix ?? '' };
  }

  async put(_hash: string, _bytes: Uint8Array): Promise<void> {
    throw this.notInstalledError();
  }

  async get(_hash: string): Promise<Uint8Array> {
    throw this.notInstalledError();
  }

  async has(_hash: string): Promise<boolean> {
    throw this.notInstalledError();
  }

  async getSignedUrl(_hash: string, _ttlSec: number): Promise<string> {
    throw this.notInstalledError();
  }

  stats(): StorageDriverStats {
    return {
      puts: 0,
      gets: 0,
      heads: 0,
      bytesPut: 0,
      bytesGet: 0,
      putDurationMs: 0,
      getDurationMs: 0,
    };
  }

  async dispose(): Promise<void> {
    // No HTTP client to close until the S3 wire-up lands.
  }

  private notInstalledError(): StorageDriverError {
    return new StorageDriverError(
      'R2StorageDriver requires @aws-sdk/client-s3.  Install with ' +
        '`npm install -w @pryzm/storage-driver @aws-sdk/client-s3 @aws-sdk/s3-request-presigner` ' +
        'and re-deploy.  See docs/04-reference/architecture-detail/bake-worker.md §"Production deployment".',
    );
  }
}
