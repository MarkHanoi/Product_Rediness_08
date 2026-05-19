// apps/sync-server/locks — public surface (S45 module entry).

export { InMemorySoftLockStore } from './InMemorySoftLockStore.js';
export { PgSoftLockStore } from './PgSoftLockStore.js';
export type { PgPoolLike } from './PgSoftLockStore.js';
export { createSoftLockStore } from './createSoftLockStore.js';
export type {
  CreateSoftLockStoreOptions,
  SoftLockStoreFactoryResult,
} from './createSoftLockStore.js';
export { Sweeper, DEFAULT_SWEEP_INTERVAL_MS } from './Sweeper.js';
export type { SweeperOptions } from './Sweeper.js';
export { mountLocksHandlers } from './handlers.js';
export type { MountLocksHandlersOptions } from './handlers.js';
export {
  LeaseMismatchError,
  NoSuchLockError,
  type SoftLockStore,
  type SoftLockStats,
  type AcquireInput,
  type AcquireResult,
  type ExtendInput,
  type ReleaseInput,
} from './types.js';
