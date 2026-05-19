// Window handler registration helper (S11-T2 + F-1.1).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateWindowHandler } from './CreateWindow.js';
import { CreateWindowBatchHandler } from './CreateWindowBatch.js';
import { DeleteWindowHandler } from './DeleteWindow.js';
import { MoveWindowHandler } from './MoveWindow.js';
import { SetWindowTypeHandler } from './SetWindowType.js';
import { SetWindowSizeHandler } from './SetWindowSize.js';
import { SetWindowSillHeightHandler } from './SetWindowSillHeight.js';
import { SetWindowFireRatingHandler } from './SetWindowFireRating.js';

export const WINDOW_HANDLER_TYPES = [
  'window.create',
  'window.batch.create',
  'window.delete',
  'window.move',
  'window.setType',
  'window.setSize',
  'window.setSillHeight',
  'window.setFireRating',
] as const;

export type WindowHandlerType = (typeof WINDOW_HANDLER_TYPES)[number];

/** Build the window plugin's handler set. Matches the wall plugin's
 *  pattern: cast each handler to `CommandHandler<unknown>` so the
 *  array is bus-registerable as a homogeneous list. */
export function buildWindowHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateWindowHandler() as unknown as CommandHandler<unknown>,
    new CreateWindowBatchHandler() as unknown as CommandHandler<unknown>,
    new DeleteWindowHandler() as unknown as CommandHandler<unknown>,
    new MoveWindowHandler() as unknown as CommandHandler<unknown>,
    new SetWindowTypeHandler() as unknown as CommandHandler<unknown>,
    new SetWindowSizeHandler() as unknown as CommandHandler<unknown>,
    new SetWindowSillHeightHandler() as unknown as CommandHandler<unknown>,
    new SetWindowFireRatingHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerWindowHandlers(bus: CommandBus): readonly string[] {
  const set = buildWindowHandlerSet();
  for (const h of set) bus.register(h);
  return set.map((h) => h.type);
}

export { CreateWindowHandler, type CreateWindowPayload } from './CreateWindow.js';
export { CreateWindowBatchHandler, type CreateWindowBatchPayload } from './CreateWindowBatch.js';
export { DeleteWindowHandler, type DeleteWindowPayload } from './DeleteWindow.js';
export { MoveWindowHandler, type MoveWindowPayload } from './MoveWindow.js';
export { SetWindowTypeHandler, type SetWindowTypePayload } from './SetWindowType.js';
export { SetWindowSizeHandler, type SetWindowSizePayload } from './SetWindowSize.js';
export { SetWindowSillHeightHandler, type SetWindowSillHeightPayload } from './SetWindowSillHeight.js';
export { SetWindowFireRatingHandler, type SetWindowFireRatingPayload } from './SetWindowFireRating.js';
