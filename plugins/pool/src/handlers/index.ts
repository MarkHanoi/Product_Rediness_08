// Pool handler registration — §FEAT-SWIMMING-POOL-ELEMENT (L-292).
//
// Mirrors `plugins/slab/src/handlers/index.ts`. Registered from
// `apps/editor/src/engine/engineLauncher.ts` alongside the other element families.

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreatePoolHandler } from './CreatePool.js';
import { DeletePoolHandler } from './DeletePool.js';

export const POOL_HANDLER_TYPES = [
  'pool.create',
  'pool.delete',
] as const;

export type PoolHandlerType = (typeof POOL_HANDLER_TYPES)[number];

export function buildPoolHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreatePoolHandler() as unknown as CommandHandler<unknown>,
    new DeletePoolHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerPoolHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildPoolHandlerSet()) bus.register(h);
  return POOL_HANDLER_TYPES;
}

export { CreatePoolHandler, type CreatePoolPayload } from './CreatePool.js';
export { DeletePoolHandler, type DeletePoolPayload } from './DeletePool.js';
