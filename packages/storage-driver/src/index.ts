// @pryzm/storage-driver — public surface.
//
// Spec: PHASE-1D §S21 line 619 — `[strategic ADR-003]` (storage driver isolation).
//
// Consumers:
//   • apps/bake-worker (S21)        — produces chunks; calls put().
//   • apps/sync-server (S22)        — reads manifests; calls get().
//   • apps/editor R2 fetcher (S23)  — cold-loads chunks; calls getSignedUrl().
//
// All three depend ONLY on this package's exports — they never import
// `@aws-sdk/client-s3` directly.  This is the lint constraint that
// closes ADR-003: a `eslint-plugin-boundaries` rule can be added in
// S22 to forbid `@aws-sdk/*` imports from any package other than
// `@pryzm/storage-driver`.

export {
  type StorageDriver,
  type StorageDriverStats,
  StorageObjectNotFoundError,
  StorageDriverError,
} from './types.js';

export {
  InMemoryStorageDriver,
  type InMemoryStorageDriverOptions,
} from './InMemoryStorageDriver.js';

export {
  R2StorageDriver,
  type R2StorageDriverOptions,
} from './R2StorageDriver.js';

export {
  createStorageDriver,
  type CreateStorageDriverOptions,
  type StorageDriverFactoryResult,
} from './createStorageDriver.js';
