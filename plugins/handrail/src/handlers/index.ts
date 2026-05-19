// Handrail handler registration helper (S14-T4).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateHandrailHandler } from './CreateHandrail.js';
import { DeleteHandrailHandler } from './DeleteHandrail.js';
import { SetHandrailPathHandler } from './SetHandrailPath.js';
import { SetHandrailShapeHandler } from './SetHandrailShape.js';
import { SetHandrailHostHandler } from './SetHandrailHost.js';
import { RecomputeHandrailHandler } from './RecomputeHandrail.js';

export const HANDRAIL_HANDLER_TYPES = [
  'handrail.create',
  'handrail.delete',
  'handrail.setPath',
  'handrail.setShape',
  'handrail.setHost',
  'handrail.recompute',
] as const;

export type HandrailHandlerType = (typeof HANDRAIL_HANDLER_TYPES)[number];

export function buildHandrailHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateHandrailHandler() as unknown as CommandHandler<unknown>,
    new DeleteHandrailHandler() as unknown as CommandHandler<unknown>,
    new SetHandrailPathHandler() as unknown as CommandHandler<unknown>,
    new SetHandrailShapeHandler() as unknown as CommandHandler<unknown>,
    new SetHandrailHostHandler() as unknown as CommandHandler<unknown>,
    new RecomputeHandrailHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerHandrailHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildHandrailHandlerSet()) bus.register(h);
  return HANDRAIL_HANDLER_TYPES;
}

export { CreateHandrailHandler, type CreateHandrailPayload } from './CreateHandrail.js';
export { DeleteHandrailHandler, type DeleteHandrailPayload } from './DeleteHandrail.js';
export { SetHandrailPathHandler, type SetHandrailPathPayload } from './SetHandrailPath.js';
export { SetHandrailShapeHandler, type SetHandrailShapePayload } from './SetHandrailShape.js';
export { SetHandrailHostHandler, type SetHandrailHostPayload } from './SetHandrailHost.js';
export { RecomputeHandrailHandler, type RecomputeHandrailPayload } from './RecomputeHandrail.js';
