// @pryzm/plugin-pool — public surface. §FEAT-SWIMMING-POOL-ELEMENT (L-292) · ADR-0124.
//
// A POOL IS AN ASSEMBLY: one gesture (`pool.create`) composes a HOLE in the host slab,
// N pool WALLS (real `Wall` records, negative `baseOffset`), a pool FLOOR (a real
// `Slab`) and the WATER — in ONE undo entry. `pool.delete` removes all of it AND heals
// the hole.
//
// The geometry math is in `@pryzm/geometry-pool` (pure). This plugin is the command
// surface only.

export { PoolStore, WaterStore, type PoolData, type WaterData, type PoolId, type WaterId, type PoolsState, type WatersState } from './store.js';

export {
  PoolSystemError,
  PoolNotFoundError,
  PoolHostSlabError,
  PoolBoundaryError,
  isPoolSystemError,
} from './errors.js';

export {
  POOL_HANDLER_TYPES,
  buildPoolHandlerSet,
  registerPoolHandlers,
  CreatePoolHandler,
  type CreatePoolPayload,
  DeletePoolHandler,
  type DeletePoolPayload,
  type PoolHandlerType,
} from './handlers/index.js';
