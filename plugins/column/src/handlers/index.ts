// Column handler registration (S12-T3).

import type { CommandBus, CommandHandler } from '@pryzm/plugin-sdk';
import { CreateColumnHandler } from './CreateColumn.js';
import { CreateColumnBatchHandler } from './CreateColumnBatch.js';
import { DeleteColumnHandler } from './DeleteColumn.js';
import { MoveColumnHandler } from './MoveColumn.js';
import { SetColumnTypeHandler } from './SetColumnType.js';
import { SetColumnHeightHandler } from './SetColumnHeight.js';
import { SetColumnMaterialHandler } from './SetColumnMaterial.js'; // §FEAT-UNIFORM-MATERIAL-COMMAND
// §L-1032 — the storey move. Registered in the ONE register at
// `@pryzm/command-bus` `LEVEL_CHANGE_VERBS`; see that file for the four parts a
// level change must complete before this row may exist.
import { ChangeColumnLevelHandler } from './ChangeColumnLevel.js';

export const COLUMN_HANDLER_TYPES = [
  'column.create',
  'column.batch.create',
  'column.delete',
  'column.move',
  'column.setType',
  'column.setHeight',
  'column.setMaterial',
  // §L-1032 — move a column between storeys (founder-requested). The legacy
  // `ColumnStore.changeLevel` MUST exist before this verb does: without it Ctrl+Z
  // falls through to the whole-record-REPLACE `update()` and destroys the column.
  'column.changeLevel',
] as const;

export type ColumnHandlerType = (typeof COLUMN_HANDLER_TYPES)[number];

export function buildColumnHandlerSet(): readonly CommandHandler<unknown>[] {
  return [
    new CreateColumnHandler() as unknown as CommandHandler<unknown>,
    new CreateColumnBatchHandler() as unknown as CommandHandler<unknown>,
    new DeleteColumnHandler() as unknown as CommandHandler<unknown>,
    new MoveColumnHandler() as unknown as CommandHandler<unknown>,
    new SetColumnTypeHandler() as unknown as CommandHandler<unknown>,
    new SetColumnHeightHandler() as unknown as CommandHandler<unknown>,
    new SetColumnMaterialHandler() as unknown as CommandHandler<unknown>,
    new ChangeColumnLevelHandler() as unknown as CommandHandler<unknown>,
  ];
}

export function registerColumnHandlers(bus: CommandBus): readonly string[] {
  for (const h of buildColumnHandlerSet()) bus.register(h);
  return COLUMN_HANDLER_TYPES;
}

export { CreateColumnHandler, type CreateColumnPayload } from './CreateColumn.js';
export { CreateColumnBatchHandler, type CreateColumnBatchPayload } from './CreateColumnBatch.js';
export { DeleteColumnHandler, type DeleteColumnPayload } from './DeleteColumn.js';
export { MoveColumnHandler, type MoveColumnPayload } from './MoveColumn.js';
export { SetColumnTypeHandler, type SetColumnTypePayload } from './SetColumnType.js';
export { SetColumnHeightHandler, type SetColumnHeightPayload } from './SetColumnHeight.js';
export { SetColumnMaterialHandler, type SetColumnMaterialPayload } from './SetColumnMaterial.js';
export { ChangeColumnLevelHandler, type ChangeColumnLevelPayload } from './ChangeColumnLevel.js';
