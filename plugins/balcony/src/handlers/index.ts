// Balcony handler registration — §FEAT-BALCONY-COMPOUND (L-5600).
//
// Mirrors `plugins/pool/src/handlers/index.ts`. Registered through the
// `apps/editor/src/PluginRegistry.ts` descriptor — which is the file whose ABSENCE
// made the pool undispatchable for weeks (§FIX-POOL-UNREACHABLE, L-5200). A handler
// set that nothing registers is a handler set that does not exist.

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateBalconyHandler } from './CreateBalcony.js';
import { DeleteBalconyHandler } from './DeleteBalcony.js';
import { UpdateBalconyProfileHandler } from './UpdateBalconyProfile.js';

export const BALCONY_HANDLER_TYPES = [
  'balcony.create',
  'balcony.updateProfile',
  'balcony.delete',
] as const;

export type BalconyHandlerType = (typeof BALCONY_HANDLER_TYPES)[number];

export function buildBalconyHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateBalconyHandler() as unknown as CommandHandler<unknown>,
    new UpdateBalconyProfileHandler() as unknown as CommandHandler<unknown>,
    new DeleteBalconyHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerBalconyHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildBalconyHandlerSet()) bus.register(h);
  return BALCONY_HANDLER_TYPES;
}

export { CreateBalconyHandler, type CreateBalconyPayload } from './CreateBalcony.js';
export { DeleteBalconyHandler, type DeleteBalconyPayload } from './DeleteBalcony.js';
export {
  UpdateBalconyProfileHandler,
  type UpdateBalconyProfilePayload,
} from './UpdateBalconyProfile.js';
