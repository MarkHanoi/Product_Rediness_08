// Stair handler registration helper (S14-T1 + Sprint A30 batch).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateStairHandler } from './CreateStair.js';
import { CreateStairBatchHandler } from './CreateStairBatch.js';
import { DeleteStairHandler } from './DeleteStair.js';
import { MoveStairHandler } from './MoveStair.js';
import { SetStairTypeHandler } from './SetStairType.js';
import { SetStairShapeHandler } from './SetStairShape.js';
import { SetTreadCountHandler } from './SetTreadCount.js';
import { SetRiserHeightHandler } from './SetRiserHeight.js';
import { SetWidthHandler } from './SetWidth.js';
import { RotateStairHandler } from './RotateStair.js';
import { CreateStairRailingHandler } from './CreateStairRailing.js';
import { UpdateStairParametersHandler } from './UpdateStairParameters.js';
import { AddLevelHandler } from './AddLevel.js';

export const STAIR_HANDLER_TYPES = [
  'stair.create',
  'stair.batch.create',
  'stair.delete',
  'stair.move',
  'stair.setType',
  'stair.setShape',
  'stair.setTreadCount',
  'stair.setRiserHeight',
  'stair.setWidth',
  'stair.rotate',
  'stair.createRailing',
  'stair.updateParameters',
  'level.add',
] as const;

export type StairHandlerType = (typeof STAIR_HANDLER_TYPES)[number];

export function buildStairHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateStairHandler() as unknown as CommandHandler<unknown>,
    new CreateStairBatchHandler() as unknown as CommandHandler<unknown>,
    new DeleteStairHandler() as unknown as CommandHandler<unknown>,
    new MoveStairHandler() as unknown as CommandHandler<unknown>,
    new SetStairTypeHandler() as unknown as CommandHandler<unknown>,
    new SetStairShapeHandler() as unknown as CommandHandler<unknown>,
    new SetTreadCountHandler() as unknown as CommandHandler<unknown>,
    new SetRiserHeightHandler() as unknown as CommandHandler<unknown>,
    new SetWidthHandler() as unknown as CommandHandler<unknown>,
    new RotateStairHandler() as unknown as CommandHandler<unknown>,
    CreateStairRailingHandler as unknown as CommandHandler<unknown>,
    UpdateStairParametersHandler as unknown as CommandHandler<unknown>,
    AddLevelHandler as unknown as CommandHandler<unknown>,
  ];
}

export function registerStairHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildStairHandlerSet()) bus.register(h);
  return STAIR_HANDLER_TYPES;
}

export { CreateStairHandler, type CreateStairPayload } from './CreateStair.js';
export { CreateStairBatchHandler, type CreateStairBatchPayload } from './CreateStairBatch.js';
export { DeleteStairHandler, type DeleteStairPayload } from './DeleteStair.js';
export { MoveStairHandler, type MoveStairPayload } from './MoveStair.js';
export { SetStairTypeHandler, type SetStairTypePayload } from './SetStairType.js';
export { SetStairShapeHandler, type SetStairShapePayload } from './SetStairShape.js';
export { SetTreadCountHandler, type SetTreadCountPayload } from './SetTreadCount.js';
export { SetRiserHeightHandler, type SetRiserHeightPayload } from './SetRiserHeight.js';
export { SetWidthHandler, type SetWidthPayload } from './SetWidth.js';
export { RotateStairHandler, type RotateStairPayload } from './RotateStair.js';
export { CreateStairRailingHandler, type CreateStairRailingPayload } from './CreateStairRailing.js';
export { UpdateStairParametersHandler, type UpdateStairParametersPayload } from './UpdateStairParameters.js';
export { AddLevelHandler, type AddLevelPayload } from './AddLevel.js';
