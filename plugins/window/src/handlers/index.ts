// Window handler registration helper (S11-T2 + F-1.1).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateWindowHandler } from './CreateWindow.js';
import { CreateWindowBatchHandler } from './CreateWindowBatch.js';
import { DeleteWindowHandler } from './DeleteWindow.js';
import { MoveWindowHandler } from './MoveWindow.js';
import { SetWindowTypeHandler } from './SetWindowType.js';
// §FIX-DIMS-REACH-RECORD — SetWindowSize/SetWindowSillHeight imports removed with their registration.
import { SetWindowFireRatingHandler } from './SetWindowFireRating.js';
import { UpdateWindowsSystemTypeBatchHandler } from './UpdateWindowsSystemTypeBatch.js';

export const WINDOW_HANDLER_TYPES = [
  'window.create',
  'window.batch.create',
  'window.delete',
  'window.move',
  'window.setType',
  // §FIX-DIMS-REACH-RECORD (ADR-0315 U1, L-815): 'window.setSize' and
  // 'window.setSillHeight' LEFT this set — the plugin handlers wrote the
  // DETACHED plugin window store (silent no-op in production). The verbs are
  // now owned by same-name legacy bridges in initBusHandlers routing through
  // UpdateElementParameterCommand → wallStore (hosted openings).
  'window.setFireRating',
  // §FEAT-WINDOW-TYPE-BATCH (ADR-0315) — batch retype ('all' or explicit ids),
  // one undo entry, bridged to the L-620-proven UpdateWindowSystemTypeCommand.
  'window.updateSystemTypeBatch',
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
    // §FIX-DIMS-REACH-RECORD — SetWindowSizeHandler / SetWindowSillHeightHandler
    // retired (see WINDOW_HANDLER_TYPES note); initBusHandlers bridges own the verbs.
    new SetWindowFireRatingHandler() as unknown as CommandHandler<unknown>,
    UpdateWindowsSystemTypeBatchHandler as unknown as CommandHandler<unknown>,
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
