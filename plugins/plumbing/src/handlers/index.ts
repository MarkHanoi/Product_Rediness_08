// Plumbing handler registration (S26 / ADR-0026).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreatePlumbingHandler } from './CreatePlumbing.js';
import { DeletePlumbingHandler } from './DeletePlumbing.js';
import { MovePlumbingHandler } from './MovePlumbing.js';
import { SetPlumbingSystemHandler } from './SetPlumbingSystem.js';
import { CreatePlumbingFixtureHandler } from './CreatePlumbingFixture.js';

export const PLUMBING_HANDLER_TYPES = [
  'plumbing.create',
  'plumbing.delete',
  'plumbing.move',
  'plumbing.setSystem',
  'plumbing.createFixture',
] as const;

export type PlumbingHandlerType = (typeof PLUMBING_HANDLER_TYPES)[number];

export function buildPlumbingHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreatePlumbingHandler() as unknown as CommandHandler<unknown>,
    new DeletePlumbingHandler() as unknown as CommandHandler<unknown>,
    new MovePlumbingHandler() as unknown as CommandHandler<unknown>,
    new SetPlumbingSystemHandler() as unknown as CommandHandler<unknown>,
    CreatePlumbingFixtureHandler as unknown as CommandHandler<unknown>,
  ];
}

export function registerPlumbingHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildPlumbingHandlerSet()) bus.register(h);
  return PLUMBING_HANDLER_TYPES;
}

export { CreatePlumbingHandler, type CreatePlumbingPayload } from './CreatePlumbing.js';
export { DeletePlumbingHandler, type DeletePlumbingPayload } from './DeletePlumbing.js';
export { MovePlumbingHandler, type MovePlumbingPayload } from './MovePlumbing.js';
export { SetPlumbingSystemHandler, type SetPlumbingSystemPayload } from './SetPlumbingSystem.js';
export { CreatePlumbingFixtureHandler, type CreatePlumbingFixturePayload } from './CreatePlumbingFixture.js';
