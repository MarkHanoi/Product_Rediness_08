// createStorageDriver — env-gated factory (S21 D4).
//
// The bake worker, the sync server (S22), and the editor's R2 fetcher
// (S23) all consume the driver through this factory.  Env-driven so a
// single deployment can flip from InMemory (dev / CI / Replit) to R2
// (PRYZM-hosted prod) to MinIO (self-host) with no code change.
//
// Decision matrix:
//   ┌────────────────────────────────────┬────────────────────────────────┐
//   │ R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,   │ Selected driver                │
//   │ R2_SECRET_ACCESS_KEY, R2_BUCKET_   │                                │
//   │ NAME all set?                      │                                │
//   ├────────────────────────────────────┼────────────────────────────────┤
//   │ Yes                                │ R2StorageDriver                │
//   │ No (any missing)                   │ InMemoryStorageDriver          │
//   └────────────────────────────────────┴────────────────────────────────┘
//
// `STORAGE_DRIVER=memory` overrides to InMemory regardless of env.  Used
// by the bench harness and by integration tests that want determinism.

import { InMemoryStorageDriver } from './InMemoryStorageDriver.js';
import { R2StorageDriver } from './R2StorageDriver.js';
import type { StorageDriver } from './types.js';

export interface CreateStorageDriverOptions {
  /** When set, returns InMemory regardless of env. */
  readonly forceInMemory?: boolean;
  /** Override env source — useful in tests. */
  readonly env?: Record<string, string | undefined>;
}

export interface StorageDriverFactoryResult {
  readonly driver: StorageDriver;
  /** Diagnostic — which driver was selected and why. */
  readonly selection: 'memory' | 'r2';
  readonly reason: string;
}

export function createStorageDriver(
  opts: CreateStorageDriverOptions = {},
): StorageDriverFactoryResult {
  const env = opts.env ?? process.env;

  if (opts.forceInMemory || env.STORAGE_DRIVER === 'memory') {
    return {
      driver: new InMemoryStorageDriver(),
      selection: 'memory',
      reason: opts.forceInMemory
        ? 'forceInMemory option set'
        : 'STORAGE_DRIVER=memory env var',
    };
  }

  const accountId = env.R2_ACCOUNT_ID;
  const accessKeyId = env.R2_ACCESS_KEY_ID;
  const secretAccessKey = env.R2_SECRET_ACCESS_KEY;
  const bucketName = env.R2_BUCKET_NAME;

  if (accountId && accessKeyId && secretAccessKey && bucketName) {
    return {
      driver: new R2StorageDriver({
        accountId,
        accessKeyId,
        secretAccessKey,
        bucketName,
        keyPrefix: env.R2_KEY_PREFIX ?? '',
      }),
      selection: 'r2',
      reason: `R2 env vars detected (bucket=${bucketName})`,
    };
  }

  return {
    driver: new InMemoryStorageDriver(),
    selection: 'memory',
    reason: 'no R2_* env vars set; defaulting to InMemoryStorageDriver',
  };
}
